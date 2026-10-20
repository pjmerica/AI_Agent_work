"""kickoff_lock.lock_started: a game's lines freeze at kickoff.

Week 5 runs that landed mid-Sunday replaced pregame lines with live in-game
ones (median 40% change on the Odds API, 61% on Kalshi, for games under way).
These check the rule that stops it: started games come from the previous file,
never this run; carried rows expire LOCK_HOURS after kickoff; unstarted games
are untouched.

Run: py tests/kickoff_lock.test.py
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from kickoff_lock import LOCK_HOURS, lock_started, parse_ts  # noqa: E402

NOW = datetime(2026, 10, 18, 19, 0, tzinfo=timezone.utc)      # Sunday, 3pm ET
ONE_PM = "2026-10-18T17:00:00Z"
FOUR_PM = "2026-10-18T20:25:00Z"
LAST_WEEK = "2026-10-11T17:00:00Z"


def row(name, ko, line):
    return {"name": name, "matchup": name[:3], "kickoffTime": ko, "line": line}


kick = lambda r: parse_ts(r.get("kickoffTime"))
key = lambda r: (r["name"], r["matchup"])

failed = 0


def check(label, cond, detail=""):
    global failed
    failed += not cond
    print(f"  {'ok  ' if cond else 'FAIL'}  {label}" + ("" if cond else f"  [{detail}]"))


prev = [row("AAA early", ONE_PM, 74.5), row("BBB late", FOUR_PM, 50.5),
        row("CCC old", LAST_WEEK, 10.0)]
new = [row("AAA early", ONE_PM, 129.5),       # live, mid-game
       row("BBB late", FOUR_PM, 52.5)]        # pregame, line moved
rows, dropped, carried = lock_started(new, prev, kick, key, now=NOW)
by = {r["name"]: r for r in rows}

check("a started game keeps its pregame line", by["AAA early"]["line"] == 74.5, by.get("AAA early"))
check("...and is marked lockedAtKickoff", by["AAA early"].get("lockedAtKickoff") is True)
check("an unstarted game takes this run's line", by["BBB late"]["line"] == 52.5)
check("an unstarted game is not marked locked", "lockedAtKickoff" not in by["BBB late"])
check(f"a game more than {LOCK_HOURS}h past kickoff ages off", "CCC old" not in by)
check("counts: one live row dropped, one carried", (dropped, carried) == (1, 1), (dropped, carried))

# A started game with no previous row is dropped rather than shown live.
rows2, d2, c2 = lock_started([row("DDD new", ONE_PM, 9.9)], [], kick, key, now=NOW)
check("started game with no pregame row is left out, not shown live", rows2 == [] and d2 == 1)

# A locked row carried in an earlier run is carried again within the window.
rows3, _, c3 = lock_started([], [dict(prev[0], lockedAtKickoff=True)], kick, key, now=NOW)
check("an already-locked row carries forward again", c3 == 1 and rows3[0]["line"] == 74.5)

# Exactly at kickoff counts as started; one second before does not.
at = datetime(2026, 10, 18, 17, 0, tzinfo=timezone.utc)
r_at, _, _ = lock_started([row("EEE", ONE_PM, 1.0)], [], kick, key, now=at)
r_bf, _, _ = lock_started([row("EEE", ONE_PM, 1.0)], [], kick, key, now=at - timedelta(seconds=1))
check("kickoff instant is locked; a second before is not", r_at == [] and len(r_bf) == 1)

# Rows with no known kickoff are never locked (no time, no evidence it started).
r_unk, d_unk, _ = lock_started([{"name": "FFF", "matchup": "FFF", "line": 3.0}], [], kick, key, now=NOW)
check("a row with no kickoff time is kept as is", len(r_unk) == 1 and d_unk == 0)

check("parse_ts handles Z and offsets", parse_ts("2026-10-18T13:32:38Z") == parse_ts("2026-10-18T09:32:38-04:00"))
check("parse_ts rejects junk", parse_ts("26OCT18") is None and parse_ts(None) is None)

print(f"\n{'all passed' if not failed else f'{failed} failed'}")
sys.exit(1 if failed else 0)
