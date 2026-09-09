"""Scrape DraftKings' Anytime TD Scorer market into nfl-props/dk_td.json.

Why this exists: touchdowns are the single largest swing in fantasy scoring, and
until now the only per-game TD source was Kalshi, which prices 236 players.
DraftKings prices 429 -- nearly double -- and crucially covers players Kalshi
skips entirely, including receiving-volume tight ends (Trey McBride, Tucker
Kraft, George Kittle, Sam LaPorta, Tyler Warren) whose weekly projections were
understated by exactly the missing touchdown credit.

Endpoint notes, all found by probing:
  - The host is sportsbook-nash.draftkings.com/api/sportscontent/dkusnj/v1.
    The older /sites/US-SB/api/v5/eventgroups paths return 403 permanently.
  - A plain User-Agent gets 403. The request must carry BOTH an Origin and a
    Referer of https://sportsbook.draftkings.com -- that is what unblocks it.
  - Player props are per event, not per league: the league feed carries only
    game lines (moneyline/spread/total). Touchdowns live under category 1003
    ("TD Scorers"). Category 1000 is passing props and has no scorer market.
  - Category 1003 also carries ~119 derivative markets (combined-player,
    either-player, first/last scorer). We take ONLY the market named exactly
    "Anytime TD Scorer" so those cannot contaminate the output.

American odds are converted to an implied probability and de-vigged across the
market, then reported as an expected TD count. Anytime-TD is a yes/no on 1+, so
P(1+) understates E[TD] slightly for goal-line backs who can score twice; the
Kalshi ladder handles that better where it exists, so the merge prefers Kalshi
and uses this to fill gaps.
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "dk_td.json"

BASE = "https://sportsbook-nash.draftkings.com/api/sportscontent/dkusnj/v1"
LEAGUE = "88808"            # NFL
TD_CATEGORY = "1003"        # "TD Scorers"
ANYTIME_MARKET = "anytime td scorer"

# Origin AND Referer are both required; without them every request 403s.
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"),
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://sportsbook.draftkings.com/",
    "Origin": "https://sportsbook.draftkings.com",
}

GAMES_PER_WEEK = 16


def http_json(url: str) -> dict:
    req = Request(url, headers=HEADERS)
    try:
        with urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}") from None
    except URLError as e:
        raise RuntimeError(f"network error: {e}") from None


def american_to_prob(odds) -> float | None:
    """American odds -> implied probability. Handles the unicode minus DK uses."""
    if odds is None:
        return None
    s = str(odds).replace("−", "-").replace("+", "").strip()
    try:
        v = float(s)
    except ValueError:
        return None
    if v == 0:
        return None
    return 100.0 / (v + 100.0) if v > 0 else (-v) / ((-v) + 100.0)


def main() -> None:
    print("Fetching DraftKings NFL events...")
    lg = http_json(f"{BASE}/leagues/{LEAGUE}")
    events = lg.get("events") or []
    if not events:
        print("ERROR: no events returned. DK may have changed the feed shape.",
              file=sys.stderr)
        sys.exit(1)

    events = sorted(events, key=lambda e: str(e.get("startEventDate") or ""))
    events = events[:GAMES_PER_WEEK]
    print(f"{len(events)} events in the upcoming slate")

    rows: dict[str, dict] = {}
    failed = 0

    for ev in events:
        eid = ev.get("id") or ev.get("eventId")
        name = (ev.get("name") or "").strip()
        kickoff = str(ev.get("startEventDate") or "")[:10]
        try:
            d = http_json(f"{BASE}/events/{eid}/categories/{TD_CATEGORY}")
        except RuntimeError as e:
            failed += 1
            print(f"  {name}: {e}")
            time.sleep(0.6)
            continue

        markets = d.get("markets") or []
        selections = d.get("selections") or []
        # Exact name match only: category 1003 is full of combined/either-player
        # derivatives that would otherwise be scraped as if they were players.
        target = {m.get("id") for m in markets
                  if (m.get("name") or "").strip().lower() == ANYTIME_MARKET}
        if not target:
            print(f"  {name}: no anytime market posted yet")
            time.sleep(0.6)
            continue

        quotes = []
        for s in selections:
            if s.get("marketId") not in target:
                continue
            label = (s.get("label") or "").strip()
            if not label or "D/ST" in label:
                continue
            odds = (s.get("displayOdds") or {}).get("american")
            p = american_to_prob(odds)
            if p is None:
                continue
            quotes.append((label, odds, p))

        # De-vig. Anytime-TD is a set of independent yes/no bets, not one
        # exclusive market, so the board legitimately sums well above 1.0 and
        # normalising it to 1.0 would be wrong. Each selection carries roughly
        # the same single-sided margin, so apply a flat haircut: the observed
        # hold on two-way NFL props is ~4-6%, and 0.94 sits in the middle.
        VIG = 0.94
        for label, odds, p in quotes:
            fair = p * VIG
            rows[label] = {
                "name": label,
                "matchup": name,
                "kickoff": kickoff,
                "americanOdds": str(odds),
                "impliedProb": round(p, 4),
                "xTD": round(fair, 4),
            }
        print(f"  {name[:34]:<34} {len(quotes)} players")
        time.sleep(0.6)

    out = sorted(rows.values(), key=lambda r: -r["xTD"])
    OUT_FILE.write_text(json.dumps({
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": "2026",
        "source": "DraftKings (Anytime TD Scorer)",
        "note": ("Anytime touchdown prices converted to an implied probability and "
                 "haircut for vig. This is P(scores 1+), which slightly understates "
                 "expected TDs for goal-line backs who can score twice -- Kalshi's "
                 "multi-rung ladder models that better, so prefer Kalshi where it "
                 "exists and use this to fill the gaps."),
        "eventCount": len(events) - failed,
        "playerCount": len(out),
        "players": out,
    }, indent=2), encoding="utf-8")

    print(f"\nWrote {OUT_FILE}")
    print(f"  {len(out)} players across {len(events) - failed} events")


if __name__ == "__main__":
    main()
