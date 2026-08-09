"""
Fetch NFL *season-long* player props from FanDuel and write nfl-props/vegas.json.

Unlike scripts/fetch_nfl_props.py (which pulls per-game props from The Odds API),
this hits FanDuel's public content-managed-page endpoint for the NFL futures page,
where the season-long markets live:

    REGULAR_SEASON_PROPS_-_QUARTERBACKS    → Passing Yards, Passing TDs
    REGULAR_SEASON_PROPS_-_RUNNING_BACKS   → Rushing Yards, Rushing TDs
    REGULAR_SEASON_PROPS_-_WIDE_RECEIVERS  → Receiving Yards

IMPORTANT — what is NOT offered:
    There are no receptions and no receiving-TD season markets at any book.
    That means these lines CANNOT be converted into a comparable PPR total:
    every WR/TE would be missing ~30-40% of their fantasy points, and PPR /
    half-PPR / standard would be identical numbers. So this script deliberately
    emits RAW STAT LINES ONLY and does no fantasy-point math. The UI compares
    these per-stat against the projection sources instead.

Usage:
    python scripts/fetch_vegas_season_props.py
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "vegas.json"

# FanDuel's NJ API host serves the public futures page without auth.
# _ak is FanDuel's public web API key, baked into their own frontend bundle.
FD_URL = (
    "https://sbapi.nj.sportsbook.fanduel.com/api/content-managed-page"
    "?page=CUSTOM&customPageId=nfl&_ak=FhMFpcPWXMeyZxOx"
)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

# Market-name suffix → (stat key, position bucket implied by the market group)
STAT_KEYS = {
    "Passing Yards":   "pass_yds",
    "Passing TDs":     "pass_tds",
    "Rushing Yards":   "rush_yds",
    "Rushing TDs":     "rush_tds",
    "Receiving Yards": "rec_yds",
}

POS_FROM_GROUP = {
    "QUARTERBACKS":   "QB",
    "RUNNING_BACKS":  "RB",
    "WIDE_RECEIVERS": "WR",
}

# "Aaron Rodgers Regular Season Passing Yards 2026-27"
MARKET_RE = re.compile(r"^(?P<player>.+?) Regular Season (?P<stat>.+?) \d{4}-\d{2}$")
# "Aaron Rodgers Over 3050.5" / "... Under 3050.5"
RUNNER_RE = re.compile(r"^(?P<player>.+?) (?P<side>Over|Under) (?P<line>[\d.]+)$")


def http_get_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")[:300]
        print(f"  HTTP {e.code}: {body}", file=sys.stderr)
        raise
    except URLError as e:
        print(f"  URL error: {e}", file=sys.stderr)
        raise


def american_odds(runner: dict) -> int | None:
    """Pull the American price off a runner, tolerating FanDuel's nesting."""
    odds = (runner.get("winRunnerOdds") or {}).get("americanDisplayOdds") or {}
    val = odds.get("americanOddsInt")
    return int(val) if isinstance(val, (int, float)) else None


def parse_markets(payload: dict) -> dict[str, dict]:
    """Walk FanDuel markets and collect season-long player props keyed by player."""
    markets = (payload.get("attachments") or {}).get("markets") or {}
    players: dict[str, dict] = {}
    skipped_no_line = 0

    for mkt in markets.values():
        mtype = mkt.get("marketType") or ""
        if "REGULAR_SEASON_PROPS" not in mtype:
            continue

        # marketType looks like "REGULAR_SEASON_PROPS_-_RUNNING_BACKS".
        # Split on the "-" separator, not the last "_", or two-word groups
        # ("RUNNING_BACKS") get truncated to "BACKS" and match nothing.
        group = mtype.split("-")[-1].strip().lstrip("_")
        pos = POS_FROM_GROUP.get(group)

        m = MARKET_RE.match(mkt.get("marketName") or "")
        if not m:
            continue
        stat_label = m.group("stat")
        stat_key = STAT_KEYS.get(stat_label)
        if not stat_key:
            # e.g. "Rookie Receiving Yards" or the MVP market — not a plain stat line
            continue

        player = m.group("player").strip()

        # Pull the line + both prices off the Over/Under runners.
        line = None
        over_price = under_price = None
        for r in mkt.get("runners") or []:
            rm = RUNNER_RE.match((r.get("runnerName") or "").strip())
            if not rm:
                continue
            line = float(rm.group("line"))
            if rm.group("side") == "Over":
                over_price = american_odds(r)
            else:
                under_price = american_odds(r)

        if line is None:
            skipped_no_line += 1
            continue

        p = players.setdefault(player, {
            "name": player,
            "position": pos,
            "markets": {},
        })
        # A player can appear in only one group bucket; keep the first non-null.
        if p["position"] is None:
            p["position"] = pos

        p["markets"][stat_key] = {
            "line": line,
            "over": over_price,
            "under": under_price,
        }

    if skipped_no_line:
        print(f"  note: {skipped_no_line} market(s) had no parseable Over/Under line")
    return players


def main() -> None:
    print("Fetching FanDuel NFL futures page…")
    payload = http_get_json(FD_URL)

    players = parse_markets(payload)
    if not players:
        print("ERROR: no season-long player props found. FanDuel may have changed "
              "their market naming, or the futures page is down.", file=sys.stderr)
        sys.exit(1)

    out = sorted(players.values(), key=lambda p: (p["position"] or "ZZ", p["name"]))

    by_pos: dict[str, int] = {}
    stat_counts: dict[str, int] = {}
    for p in out:
        by_pos[p["position"] or "?"] = by_pos.get(p["position"] or "?", 0) + 1
        for k in p["markets"]:
            stat_counts[k] = stat_counts.get(k, 0) + 1

    payload_out = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": "2026",
        "source": "FanDuel",
        "book": "FanDuel",
        # Consumers must not treat these as fantasy projections — see module docstring.
        "note": (
            "Season-long Vegas lines. No receptions or receiving-TD markets are "
            "offered, so these are raw stat lines only and are NOT convertible to "
            "a complete PPR total."
        ),
        "availableStats": sorted(stat_counts.keys()),
        "playerCount": len(out),
        "byPosition": by_pos,
        "players": out,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload_out, indent=2), encoding="utf-8")

    print(f"Wrote {OUT_FILE}")
    print(f"  {len(out)} players — " + ", ".join(f"{k}:{v}" for k, v in sorted(by_pos.items())))
    print("  stat coverage — " + ", ".join(f"{k}:{v}" for k, v in sorted(stat_counts.items())))


if __name__ == "__main__":
    main()
