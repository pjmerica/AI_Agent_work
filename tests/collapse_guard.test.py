"""The scrapers must refuse to replace a full board with a collapsed one.

Why this matters now: until 2026-10-06 every props refresh was triggered by hand
and watched. It runs eight times a week unattended from 10-07, so a scrape that
fails part-way -- a rate limit, a quota exhaustion, a timeout after the first page,
an API shape change affecting one market -- would quietly overwrite a full slate
with a stub, and the mirror job would carry that to the EZ Dubs site within hours.

The check cannot simply be "fewer rows than last time": coverage legitimately
grows through the week as books open games (week 3 went 233 -> 277 -> 307 -> 338
-> 345, and week 5 opened at 100 then reached 254 by Wednesday). What is NOT
legitimate is a large drop on the SAME slate, because books add props as kickoff
approaches and do not withdraw them.

So both guards are scoped: the Kalshi one by week number, the Odds API one by
matchup overlap (its file carries no week).

Run: python tests/collapse_guard.test.py
"""
from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import tempfile

ROOT = pathlib.Path(os.environ.get("REPO_ROOT", pathlib.Path(__file__).resolve().parent.parent))

passed = 0
failed: list[str] = []


def check(label: str, cond: bool, detail: str = "") -> None:
    global passed
    if cond:
        passed += 1
        print(f"  ok    {label}")
    else:
        failed.append(label)
        print(f"  FAIL  {label}" + (f"   -> {detail}" if detail else ""))


def load(rel: str):
    spec = importlib.util.spec_from_file_location(rel.replace("/", "_"), ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def refuses(fn, *args) -> bool:
    """True when the guard exits rather than allowing the write."""
    try:
        fn(*args)
        return False
    except SystemExit:
        return True


def tmp_json(payload) -> pathlib.Path:
    p = pathlib.Path(tempfile.mkdtemp()) / "data.json"
    if payload is not None:
        p.write_text(json.dumps(payload) if not isinstance(payload, str) else payload,
                     encoding="utf-8")
    return p


print("=== Kalshi weekly props (scoped by week) ===")
kw = load("scripts/fetch_kalshi_weekly_props.py")
g1 = kw.guard_against_collapse

check("a same-week collapse to a stub is refused",
      refuses(g1, tmp_json({"week": 5, "playerGameCount": 349}), 5, 3, "t"))
check("a same-week drop below 60% is refused",
      refuses(g1, tmp_json({"week": 5, "playerGameCount": 349}), 5, 200, "t"))
check("ordinary same-week variation is allowed",
      not refuses(g1, tmp_json({"week": 5, "playerGameCount": 349}), 5, 300, "t"))
check("midweek growth is allowed",
      not refuses(g1, tmp_json({"week": 5, "playerGameCount": 100}), 5, 349, "t"))
# The important exemption: a new slate starts with a fraction of its final rows,
# so comparing across weeks would block every Tuesday run.
check("a NEW week starting thin is allowed",
      not refuses(g1, tmp_json({"week": 4, "playerGameCount": 349}), 5, 100, "t"))
check("no previous file is allowed",
      not refuses(g1, tmp_json(None), 5, 3, "t"))
check("a previous file that is not a JSON object is allowed, not a crash",
      not refuses(g1, tmp_json('"a bare string"'), 5, 3, "t"))

print()
print("=== Odds API weekly props (scoped by matchup overlap) ===")
ow = load("scripts/fetch_oddsapi_weekly_props.py")
g2 = ow.guard_against_collapse


def rows(n: int, matchup: str = "PHIJAC"):
    return [{"matchup": matchup, "name": f"P{i}"} for i in range(n)]


check("a same-slate collapse to a stub is refused",
      refuses(g2, tmp_json({"players": rows(300)}), rows(5)))
check("a same-slate drop below 60% is refused",
      refuses(g2, tmp_json({"players": rows(300)}), rows(100)))
check("ordinary same-slate variation is allowed",
      not refuses(g2, tmp_json({"players": rows(300)}), rows(260)))
check("midweek growth is allowed",
      not refuses(g2, tmp_json({"players": rows(66)}), rows(300)))
check("a different slate arriving thin is allowed",
      not refuses(g2, tmp_json({"players": rows(300, "OLDGAME")}), rows(60, "NEWGAME")))
check("no previous file is allowed",
      not refuses(g2, tmp_json(None), rows(5)))
check("a previous file with no players is allowed",
      not refuses(g2, tmp_json({"players": []}), rows(5)))

print()
print("=== against the files actually on disk ===")
# A guard that blocks the real pipeline is worse than no guard, so this asserts
# the committed data would still be allowed through.
wk_file = ROOT / "nfl-props" / "weekly.json"
if wk_file.exists():
    wk = json.loads(wk_file.read_text(encoding="utf-8"))
    n = wk.get("playerGameCount") or 0
    check("today's weekly.json could be rewritten with the same counts",
          not refuses(g1, wk_file, wk.get("week"), n, "live"),
          f"week {wk.get('week')}, {n} rows")
    check("today's weekly.json allows Thursday-sized growth",
          not refuses(g1, wk_file, wk.get("week"), max(n * 3, n), "live"))
od_file = ROOT / "nfl-props" / "oddsapi.json"
if od_file.exists():
    od = json.loads(od_file.read_text(encoding="utf-8"))
    pl = od.get("players") or []
    check("today's oddsapi.json could be rewritten with the same players",
          not refuses(g2, od_file, pl), f"{len(pl)} players")

print()
print(f"{passed} passed, {len(failed)} failed")
if failed:
    print("FAILED: " + ", ".join(failed))
raise SystemExit(1 if failed else 0)
