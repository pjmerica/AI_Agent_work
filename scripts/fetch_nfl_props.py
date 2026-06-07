"""
Fetch NFL player prop lines from The Odds API across all books, normalize per-player,
compute PPR / half-PPR / standard fantasy-point projections, and write to
nfl-props/data.json.

Requires env var ODDS_API_KEY.
Usage:
    ODDS_API_KEY=xxx python scripts/fetch_nfl_props.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

API_BASE = "https://api.the-odds-api.com/v4"
SPORT = "americanfootball_nfl"

# Player-prop markets we care about for fantasy.
# Reference: https://the-odds-api.com/sports-odds-data/betting-markets.html
PROP_MARKETS = [
    "player_pass_yds",        # passing yards
    "player_pass_tds",        # passing TDs
    "player_pass_interceptions",
    "player_rush_yds",        # rushing yards
    "player_rush_tds",
    "player_rush_attempts",
    "player_reception_yds",   # receiving yards
    "player_receptions",      # catches (the half-PPR / PPR money market)
    "player_reception_tds",
    "player_anytime_td",      # anytime TD scorer (used for non-yardage TD bumps)
]

# Some markets are charged per-event per-market (quota-expensive). Keep the list focused.

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "data.json"
REGIONS = "us"  # us books
ODDS_FORMAT = "american"

# ── HTTP helpers ──────────────────────────────────────────────────────────────


def http_get(url: str) -> dict | list:
    req = Request(url, headers={"User-Agent": "nfl-props-scraper/1.0"})
    try:
        with urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        print(f"  HTTP {e.code}: {body[:200]}", file=sys.stderr)
        raise
    except URLError as e:
        print(f"  URL error: {e}", file=sys.stderr)
        raise


# ── API calls ─────────────────────────────────────────────────────────────────


def list_events(api_key: str) -> list[dict]:
    """Return upcoming NFL events. Each event has id, home_team, away_team, commence_time."""
    qs = urlencode({"apiKey": api_key})
    return http_get(f"{API_BASE}/sports/{SPORT}/events?{qs}")


def fetch_event_props(api_key: str, event_id: str) -> dict | None:
    """Fetch all player-prop markets for one event across all US books."""
    qs = urlencode({
        "apiKey": api_key,
        "regions": REGIONS,
        "markets": ",".join(PROP_MARKETS),
        "oddsFormat": ODDS_FORMAT,
    })
    try:
        return http_get(f"{API_BASE}/sports/{SPORT}/events/{event_id}/odds?{qs}")
    except HTTPError as e:
        # 404 = no props posted yet for this game; skip silently
        if e.code == 404:
            return None
        raise


# ── Fantasy point math ────────────────────────────────────────────────────────

# Standard scoring: 0.04/passing yd, 4/passing TD, -2/INT,
#                   0.1/rushing yd, 6/rushing TD,
#                   0.1/receiving yd, 6/receiving TD,
#                   reception bonus depends on format.
SCORING = {
    "player_pass_yds":           lambda v: v * 0.04,
    "player_pass_tds":           lambda v: v * 4,
    "player_pass_interceptions": lambda v: v * -2,
    "player_rush_yds":           lambda v: v * 0.1,
    "player_rush_tds":           lambda v: v * 6,
    "player_rush_attempts":      lambda v: 0,           # no points, kept for context
    "player_reception_yds":      lambda v: v * 0.1,
    "player_reception_tds":      lambda v: v * 6,
    "player_anytime_td":         lambda v: 0,           # handled separately via implied prob
    # receptions are format-specific
}


def receptions_points(rec: float, fmt: str) -> float:
    if fmt == "ppr":
        return rec * 1.0
    if fmt == "half":
        return rec * 0.5
    return 0.0


def points_for_market(market_key: str, value: float, fmt: str) -> float:
    if market_key == "player_receptions":
        return receptions_points(value, fmt)
    fn = SCORING.get(market_key)
    return fn(value) if fn else 0.0


def american_to_implied_prob(odds: int | float) -> float:
    """Convert American odds to implied probability (0..1). Includes vig — fine for ranking."""
    if odds >= 100:
        return 100.0 / (odds + 100.0)
    return -odds / (-odds + 100.0)


# ── Aggregation ───────────────────────────────────────────────────────────────


def aggregate_player_props(events_props: list[dict]) -> dict[str, dict]:
    """
    Walk every event/book/market/outcome and build a dict keyed by player name:
        {
          "Bijan Robinson": {
            "team": "ATL",
            "opponent": "PHI",
            "commence_time": "...",
            "markets": {
              "player_rush_yds":    {"line": 78.5, "books": ["DraftKings", "FanDuel"]},
              "player_reception_yds": {"line": 22.5, "books": ["DraftKings"]},
              ...
            },
            "anytime_td_prob": 0.42   # de-vigged-ish, take max implied across books
          }
        }
    """
    players: dict[str, dict] = {}

    for ev in events_props:
        if not ev:
            continue
        home = ev.get("home_team", "")
        away = ev.get("away_team", "")
        commence = ev.get("commence_time", "")

        for book in ev.get("bookmakers", []):
            book_title = book.get("title", "?")
            for market in book.get("markets", []):
                mkey = market.get("key", "")
                if mkey not in PROP_MARKETS:
                    continue

                # Group outcomes by player.
                # Outcomes look like:
                # Over/Under markets:   {"name":"Over","description":"Bijan Robinson","point":78.5,"price":-110}
                # Anytime TD:           {"name":"Yes","description":"Bijan Robinson","price":+120}
                for outcome in market.get("outcomes", []):
                    player_name = outcome.get("description") or outcome.get("participant")
                    if not player_name:
                        continue
                    name = player_name.strip()

                    p = players.setdefault(name, {
                        "name": name,
                        "team": None,
                        "opponent": None,
                        "commence_time": commence,
                        "markets": {},
                        "anytime_td_prob": 0.0,
                    })
                    # crude team detection — set first time we see them; refined later
                    if p["team"] is None:
                        p["team"] = home
                        p["opponent"] = away

                    if mkey == "player_anytime_td":
                        if outcome.get("name", "").lower() == "yes":
                            prob = american_to_implied_prob(outcome.get("price", 0))
                            if prob > p["anytime_td_prob"]:
                                p["anytime_td_prob"] = prob
                    else:
                        # Take the Over side as the line reference; line is the same on Over/Under.
                        # Some books quote with name "Over" and "Under".
                        side = (outcome.get("name") or "").lower()
                        if side and side != "over":
                            continue
                        line = outcome.get("point")
                        if line is None:
                            continue
                        m = p["markets"].setdefault(mkey, {"line": line, "books": []})
                        if book_title not in m["books"]:
                            m["books"].append(book_title)
                        # Keep the median-ish line: if multiple books disagree, average them
                        existing = m["line"]
                        # rolling average across books
                        n = len(m["books"])
                        m["line"] = (existing * (n - 1) + line) / n if n > 1 else line

    return players


# ── Projection ────────────────────────────────────────────────────────────────


def project_player(p: dict, fmt: str) -> float:
    total = 0.0
    for mkey, m in p["markets"].items():
        total += points_for_market(mkey, m["line"], fmt)
    # Add expected TD points from anytime_td_prob if we don't already have rushing/receiving TD lines
    if "player_rush_tds" not in p["markets"] and "player_reception_tds" not in p["markets"]:
        total += p["anytime_td_prob"] * 6.0
    return round(total, 2)


def guess_position(p: dict) -> str:
    m = p["markets"]
    if "player_pass_yds" in m or "player_pass_tds" in m:
        return "QB"
    if "player_receptions" in m and "player_rush_yds" not in m:
        return "WR/TE"
    if "player_rush_yds" in m and "player_receptions" not in m:
        return "RB"
    if "player_rush_yds" in m and "player_receptions" in m:
        # Both — likely a pass-catching back; lean RB unless rec_yds > rush_yds
        rec = m.get("player_reception_yds", {}).get("line", 0)
        rush = m.get("player_rush_yds", {}).get("line", 0)
        return "WR/TE" if rec > rush else "RB"
    return "?"


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    api_key = os.environ.get("ODDS_API_KEY", "").strip()
    if not api_key:
        print("ERROR: ODDS_API_KEY env var not set", file=sys.stderr)
        sys.exit(1)

    print("Fetching events…")
    events = list_events(api_key)
    print(f"  {len(events)} upcoming events")

    if not events:
        print("No events — writing empty payload")
        write_output([], 0)
        return

    events_props = []
    for i, ev in enumerate(events):
        eid = ev["id"]
        home = ev.get("home_team", "?")
        away = ev.get("away_team", "?")
        print(f"  [{i+1}/{len(events)}] {away} @ {home}")
        data = fetch_event_props(api_key, eid)
        if data:
            events_props.append(data)
        # gentle pacing
        time.sleep(0.4)

    print("Aggregating player props…")
    players_raw = aggregate_player_props(events_props)
    print(f"  {len(players_raw)} players")

    players_out = []
    for name, p in players_raw.items():
        # Skip players with no usable markets
        if not p["markets"] and p["anytime_td_prob"] == 0:
            continue
        players_out.append({
            "name": name,
            "team": p["team"],
            "opponent": p["opponent"],
            "position": guess_position(p),
            "commence_time": p["commence_time"],
            "anytime_td_prob": round(p["anytime_td_prob"], 4),
            "markets": p["markets"],
            "projections": {
                "ppr":      project_player(p, "ppr"),
                "half":     project_player(p, "half"),
                "standard": project_player(p, "standard"),
            },
        })

    # sort by PPR descending
    players_out.sort(key=lambda x: x["projections"]["ppr"], reverse=True)

    write_output(players_out, len(events))


def write_output(players: list[dict], event_count: int):
    payload = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "eventCount": event_count,
        "playerCount": len(players),
        "players": players,
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_FILE} ({len(players)} players)")


if __name__ == "__main__":
    main()
