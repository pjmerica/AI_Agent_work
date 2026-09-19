"""Scrape The Odds API's per-game NFL player props into nfl-props/oddsapi.json.

This is a SECOND opinion on the weekly board, not a replacement. Kalshi already
supplies per-game lines free, but it is one venue with its own liquidity quirks;
The Odds API aggregates real sportsbooks (DraftKings, FanDuel, BetMGM, ...),
which both widens player coverage and lets a Kalshi line be sanity-checked
against a book consensus.

Requires ODDS_API_KEY. The key lives only as a GitHub Actions secret, so this is
built to run in CI -- there is no committed copy and none should be added. It
exits cleanly (not an error) when the key is absent so a local run of the full
pipeline does not fail.

Quota discipline matters: player props need one request PER EVENT, and the free
tier is 500/month. 16 games x 1 request = 16 credits per refresh, times the
number of markets requested in that single call (the API bills per market per
region). MAX_EVENTS caps the damage if the slate is unexpectedly large, and the
remaining quota is read back from response headers and printed.
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "oddsapi.json"

# Kalshi labels a game "TBCIN"; the API gives full club names. Normalising here
# means merged rows share one matchup format instead of mixing the two styles.
TEAM_ABBR = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAC",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
}


def abbr(team: str) -> str:
    return TEAM_ABBR.get(team, (team or "")[:3].upper())

API = "https://api.the-odds-api.com/v4"
SPORT = "americanfootball_nfl"
REGION = "us"
MAX_EVENTS = 20

# The Odds API market key -> our internal stat key. These are per-game markets;
# the API sells no season-long player props (checked 2026-08/09).
#
# Billing is one credit per event PER MARKET, so the market list is the main
# cost dial: 5 markets x 16 events = 80 credits a pull, which exhausts a
# 500-credit month in six refreshes.
#
# Measured against a complete pull (2026-09-06, 171 players) versus what Kalshi
# already prices for the same slate, the marginal coverage each market buys is:
#
#     receptions  +57 players      <- worth paying for
#     rec_yds     +57 players      <- worth paying for
#     rush_yds    +21 players
#     pass_yds     +4 players      <- Kalshi covers QBs nearly as well
#     pass_tds     +3 players      <- same
#
# The default keeps the three that actually add players: both receiving markets
# and rushing yards. That is 48 credits a pull (~10 a month, enough for two a
# week) and recovers the 21 backs whose rushing line only the books post -- RB
# depth is what flex decisions turn on. The two passing markets are dropped
# because Kalshi already covers quarterbacks to within 3-4 players.
#
# Set ODDS_API_MARKETS to a comma-separated list, or "all", to widen it for a
# one-off deep pull when quota allows.
ALL_MARKETS = {
    "player_pass_yds":    "pass_yds",
    "player_pass_tds":    "pass_tds",
    "player_rush_yds":    "rush_yds",
    "player_reception_yds": "rec_yds",
    "player_receptions":  "receptions",
}

DEFAULT_MARKETS = ["player_receptions", "player_reception_yds", "player_rush_yds"]

_requested = os.environ.get("ODDS_API_MARKETS", "").strip()
if _requested.lower() in ("all", "*"):
    _keys = list(ALL_MARKETS)
elif _requested:
    _keys = [k.strip() for k in _requested.split(",") if k.strip() in ALL_MARKETS]
    if not _keys:
        _keys = DEFAULT_MARKETS
else:
    _keys = DEFAULT_MARKETS

MARKETS = {k: ALL_MARKETS[k] for k in _keys}


def _vig_distance(price) -> float:
    """How far an American price sits from even money.

    A book's headline line is priced near -110/+100; its alternate rungs sit far
    out on either side (-230, +150). Distance from zero on the American scale
    therefore identifies the main line without the book having to label it.
    """
    if price is None:
        return 1e9
    try:
        return abs(float(str(price).replace("−", "-").replace("+", "")))
    except ValueError:
        return 1e9



def http_json(url: str) -> tuple[object, dict]:
    req = Request(url, headers={"User-Agent": "nfl-props/1.0", "Accept": "application/json"})
    try:
        with urlopen(req, timeout=40) as resp:
            body = json.loads(resp.read().decode("utf-8", "replace"))
            return body, dict(resp.headers)
    except HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:200]
        raise RuntimeError(f"HTTP {e.code}: {detail}") from None
    except URLError as e:
        raise RuntimeError(f"network error: {e}") from None


def main() -> None:
    key = os.environ.get("ODDS_API_KEY")
    if not key:
        print("ODDS_API_KEY not set — skipping (this is expected outside CI).")
        return

    # 1. Upcoming events. One cheap call; player props are per-event after this.
    events, hdrs = http_json(f"{API}/sports/{SPORT}/events/?{urlencode({'apiKey': key})}")
    if not isinstance(events, list) or not events:
        print("No upcoming NFL events returned.", file=sys.stderr)
        sys.exit(1)

    by_date: dict[str, int] = {}
    for e in events:
        by_date[(e.get("commence_time") or "")[:10]] =             by_date.get((e.get("commence_time") or "")[:10], 0) + 1
    print(f"{len(events)} upcoming events offered by the API; "
          f"dates: {dict(sorted(by_date.items()))}")

    events = events[:MAX_EVENTS]
    print(f"fetching {len(MARKETS)} market(s) for {len(events)} event(s) "
          f"= ~{len(MARKETS) * len(events)} credits: {', '.join(MARKETS)}")

    rows: dict[tuple[str, str], dict] = {}
    books: dict[str, int] = {}
    failed = 0

    for ev in events:
        eid = ev.get("id")
        home, away = ev.get("home_team", ""), ev.get("away_team", "")
        kickoff = (ev.get("commence_time") or "")[:10]
        qs = urlencode({
            "apiKey": key,
            "regions": REGION,
            "markets": ",".join(MARKETS),
            "oddsFormat": "american",
        })
        try:
            data, hdrs = http_json(f"{API}/sports/{SPORT}/events/{eid}/odds/?{qs}")
        except RuntimeError as e:
            # A game with no posted props 404s; that is normal, not fatal.
            failed += 1
            print(f"  {away} @ {home}: {e}")
            continue

        for bk in (data.get("bookmakers") or []):
            bname = bk.get("key") or "?"
            for mkt in (bk.get("markets") or []):
                stat = MARKETS.get(mkt.get("key"))
                if not stat:
                    continue
                for oc in (mkt.get("outcomes") or []):
                    player = (oc.get("description") or "").strip()
                    point = oc.get("point")
                    if not player or point is None:
                        continue
                    if (oc.get("name") or "").lower() != "over":
                        continue
                    rec = rows.setdefault((player, eid), {
                        "name": player,
                        "kickoff": kickoff,
                        "matchup": f"{abbr(away)}{abbr(home)}",
                        "matchupLong": f"{away} @ {home}",
                        "stats": {},
                    })
                    # Several books quote the same stat. Keep every line so the
                    # consensus is visible rather than picking one book blind.
                    # Some books (Bovada, observed 2026-09-19) return a LADDER
                    # of alternate lines for one player-stat -- 24.5 / 29.5 /
                    # 34.5 / 39.5 / 44.5 -- rather than a single number. Storing
                    # every rung would let one book cast five votes in the
                    # median and wreck any per-book spread comparison, so keep
                    # only that book's main line: the rung priced closest to
                    # even money, which is the one it is actually advertising.
                    quotes = rec["stats"].setdefault(stat, [])
                    line, price = float(point), oc.get("price")
                    prev = next((q for q in quotes if q["book"] == bname), None)
                    if prev is None:
                        quotes.append({"book": bname, "line": line, "odds": price})
                        books[bname] = books.get(bname, 0) + 1
                    elif abs(_vig_distance(price)) < abs(_vig_distance(prev["odds"])):
                        prev["line"], prev["odds"] = line, price

    # Collapse each stat to a median line across books, keeping the spread.
    out = []
    for rec in rows.values():
        stats = {}
        for stat, quotes in rec["stats"].items():
            lines = sorted(q["line"] for q in quotes)
            mid = lines[len(lines) // 2] if len(lines) % 2 else \
                (lines[len(lines) // 2 - 1] + lines[len(lines) // 2]) / 2
            stats[stat] = {
                "line": mid,
                "books": len(quotes),
                "min": lines[0],
                "max": lines[-1],
                "quotes": quotes,
            }
        out.append({**rec, "stats": stats})

    out.sort(key=lambda r: (r["kickoff"], r["name"]))
    stat_counts: dict[str, int] = {}
    for r in out:
        for k in r["stats"]:
            stat_counts[k] = stat_counts.get(k, 0) + 1

    remaining = hdrs.get("x-requests-remaining")
    used = hdrs.get("x-requests-used")

    OUT_FILE.write_text(json.dumps({
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": "2026",
        "source": "The Odds API (per-game, multi-book)",
        "note": ("Per-game player props aggregated across US sportsbooks. `line` is "
                 "the median across books; min/max show the spread and `quotes` "
                 "keeps each book's own number."),
        "region": REGION,
        "eventCount": len({k[1] for k in rows}),
        "playerGameCount": len(out),
        "statCounts": stat_counts,
        "bookCounts": books,
        "quotaRemaining": remaining,
        "quotaUsed": used,
        "players": out,
    }, indent=2), encoding="utf-8")

    print(f"\nWrote {OUT_FILE}")
    print(f"  {len(out)} player-games across {len({k[1] for k in rows})} events "
          f"({failed} events had no props)")
    print(f"  books: {', '.join(sorted(books))}")
    print("  stat coverage - " + ", ".join(f"{k}:{v}" for k, v in sorted(stat_counts.items())))
    print(f"  API quota: {used} used, {remaining} remaining")


if __name__ == "__main__":
    main()
