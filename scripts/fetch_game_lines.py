"""Scrape NFL game spreads and totals into nfl-props/gamelines.json.

This exists to score the two positions the player-prop board cannot reach:
kickers and team defenses. Neither has a usable prop market -- Kalshi posts
KXNFLTEAMSACK, KXNFLTEAMTO and KXNFLDSTTD but leaves them entirely unquoted
(every rung bid=None/ask=None, checked 2026-09-23), and The Odds API sells no
D/ST or kicker props at all.

What both positions DO reduce to is the game line. A team's implied total is
(total / 2) - (spread / 2), and that single number drives almost all of the
fantasy value:

    D/ST  -- the opponent's implied total maps straight onto Sleeper's
             pts_allow_* buckets, which is where most D/ST scoring lives.
             Sacks and turnovers correlate with being favored, so the spread
             carries them.
    K     -- the kicker's own team total splits into touchdowns (XPs) and
             stalled drives (FGs).

Crucially this is CHEAP. Player props bill one credit per event per market, but
spreads and totals come off the bulk /odds endpoint: one credit covers the whole
slate for one market, so a refresh is 2 credits rather than 80. That is why this
is a separate script from fetch_oddsapi_weekly_props.py.

Requires ODDS_API_KEY (GitHub Actions secret). Exits cleanly without it.
"""
from __future__ import annotations

import json
import os
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "gamelines.json"

API = "https://api.the-odds-api.com/v4"
SPORT = "americanfootball_nfl"
REGION = "us"
MARKETS = "spreads,totals"

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


def http_json(url: str):
    req = Request(url, headers={"User-Agent": "nfl-props/1.0", "Accept": "application/json"})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8")), dict(r.headers)


def main() -> None:
    key = os.environ.get("ODDS_API_KEY", "").strip()
    if not key:
        print("ODDS_API_KEY not set; skipping game lines.", file=sys.stderr)
        return

    qs = urlencode({
        "apiKey": key, "regions": REGION, "markets": MARKETS,
        "oddsFormat": "american",
    })
    try:
        events, hdrs = http_json(f"{API}/sports/{SPORT}/odds/?{qs}")
    except (HTTPError, URLError) as e:
        print(f"Odds API game lines failed: {e}", file=sys.stderr)
        return

    remaining = hdrs.get("x-requests-remaining")
    used = hdrs.get("x-requests-used")

    # Each book quotes its own spread and total. Take the median across books so
    # one stale or outlying book cannot move an implied total by itself.
    games = []
    for ev in events or []:
        home, away = ev.get("home_team"), ev.get("away_team")
        if not home or not away:
            continue
        spreads = defaultdict(list)   # team -> [point]
        totals = []
        books = set()
        for bk in ev.get("bookmakers") or []:
            for mk in bk.get("markets") or []:
                if mk.get("key") == "spreads":
                    for o in mk.get("outcomes") or []:
                        if o.get("point") is not None:
                            spreads[o.get("name")].append(float(o["point"]))
                            books.add(bk.get("key"))
                elif mk.get("key") == "totals":
                    for o in mk.get("outcomes") or []:
                        if o.get("name") == "Over" and o.get("point") is not None:
                            totals.append(float(o["point"]))
                            books.add(bk.get("key"))

        if not totals or home not in spreads:
            continue
        total = statistics.median(totals)
        home_spread = statistics.median(spreads[home])

        # Implied team total: half the game total, shifted by half the spread.
        # A -7 home favourite in a 44 game is 22 + 3.5 = 25.5.
        home_tt = total / 2.0 - home_spread / 2.0
        away_tt = total - home_tt

        games.append({
            "matchup": f"{abbr(away)}{abbr(home)}",
            "home": abbr(home), "away": abbr(away),
            "homeName": home, "awayName": away,
            "kickoff": ev.get("commence_time"),
            "total": round(total, 2),
            "homeSpread": round(home_spread, 2),
            "teams": {
                abbr(home): {"implied": round(home_tt, 2),
                             "spread": round(home_spread, 2),
                             "oppImplied": round(away_tt, 2)},
                abbr(away): {"implied": round(away_tt, 2),
                             "spread": round(-home_spread, 2),
                             "oppImplied": round(home_tt, 2)},
            },
            "bookCount": len(books),
        })

    if not games:
        print("No game lines returned; keeping the existing file.", file=sys.stderr)
        return

    payload = {
        "source": "The Odds API",
        "region": REGION,
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "gameCount": len(games),
        "quotaUsed": used,
        "quotaRemaining": remaining,
        "note": ("Median spread and total across books. Implied team total = "
                 "total/2 - spread/2. Used to score D/ST and K, which have no "
                 "prop market."),
        "games": games,
    }
    OUT_FILE.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"Wrote {len(games)} games to {OUT_FILE.name} "
          f"(quota remaining: {remaining})")


if __name__ == "__main__":
    main()
