"""Scrape Kalshi's PER-GAME NFL player props into nfl-props/weekly.json.

Why this exists alongside the season scraper: season-long markets are a
preseason product that books stop maintaining once games start, and Kalshi is
the only venue posting season receptions at all. Per-game markets are the
opposite -- they refresh every week and are far more liquid. Typical per-game
ladder depth here is 9-10 rungs versus 1-4 for the season series, so lines come
from real interpolation rather than the modelling the season data needs.

The ladder math (probability, monotonic enforcement, interpolation, lognormal
fit) is imported from the season scraper rather than duplicated -- there is one
definition of "what is this ladder's implied line".

The week number is resolved from ESPN's public scoreboard API rather than
guessed from the calendar -- the 2026 season opens Wednesday 2026-09-09, so a
date-based guess misreads the opening slate as a later week. Kalshi purges
settled markets, so whatever is open is the next slate; ESPN says which week
that actually is. Event tickers look like KXNFLREC-26SEP13GBMIN, which also
gives us the matchup for free.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetch_kalshi_season_props import (  # noqa: E402
    API, build_ladder, enforce_monotonic, expected_from_ladder,
    http_get_json, lognormal_fit, median_from_ladder,
)

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "weekly.json"

# Per-game series -> our stat key. These are distinct tickers from the
# KXNFLSEASON* set; same stat, one game instead of a season.
SERIES = {
    "KXNFLREC":      "receptions",
    "KXNFLRECYDS":   "rec_yds",
    "KXNFLRSHYDS":   "rush_yds",
    "KXNFLPASSYDS":  "pass_yds",
    "KXNFLPASSTDS":  "pass_tds",
}

# "KXNFLREC-26SEP13GBMIN" -> ("26SEP13", "GBMIN")
EVENT_RE = re.compile(r"^KXNFL[A-Z]+-(?P<date>\d{2}[A-Z]{3}\d{2})(?P<teams>[A-Z]{4,8})$")

MONTHS = {"JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
          "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12}


def ticker_date(code: str) -> str | None:
    """'26SEP13' -> '20260913'."""
    m = re.match(r"^(\d{2})([A-Z]{3})(\d{2})$", code or "")
    if not m:
        return None
    yy, mon, dd = m.groups()
    if mon not in MONTHS:
        return None
    return f"20{yy}{MONTHS[mon]:02d}{dd}"


def resolve_week(kickoffs: list[str]) -> int | None:
    """Ask ESPN which NFL week these dates belong to.

    Guessing from the calendar is unreliable: the season opens midweek, so the
    days before it still belong to week 1's slate, not to a prior week.
    """
    dates = sorted(d for d in (ticker_date(k) for k in kickoffs) if d)
    if not dates:
        return None
    try:
        # Plain request: the Kalshi helper sends headers ESPN 403s on.
        url = ("https://site.api.espn.com/apis/site/v2/sports/football/nfl/"
               f"scoreboard?dates={dates[0]}-{dates[-1]}")
        # ESPN 403s a bare UA on this endpoint; a browser-shaped header set
        # with a site Referer is accepted.
        req = Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.espn.com/nfl/scoreboard",
            "Origin": "https://www.espn.com",
        })
        with urlopen(req, timeout=25) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        return (data.get("week") or {}).get("number")
    except Exception as e:
        print(f"  ! could not resolve week from ESPN ({e}); leaving unlabelled")
        return None


def fetch_series(ticker: str) -> list[dict]:
    out, cursor = [], None
    while True:
        qs = {"series_ticker": ticker, "limit": 1000, "status": "open"}
        if cursor:
            qs["cursor"] = cursor
        data = http_get_json(f"{API}/markets?{urlencode(qs)}")
        batch = data.get("markets") or []
        out.extend(batch)
        cursor = data.get("cursor") or None
        if not cursor or not batch:
            break
    return out


def parse_event(ticker: str) -> tuple[str | None, str | None]:
    m = EVENT_RE.match(ticker or "")
    if not m:
        return None, None
    return m.group("date"), m.group("teams")


def main() -> None:
    # player -> {"name", "games": {event: {...}}}, keyed per game because a
    # player appears once per matchup and we must not merge across weeks.
    rows: dict[tuple[str, str], dict] = {}
    counts: dict[str, int] = {}

    for ticker, stat_key in SERIES.items():
        print(f"Fetching {ticker} -> {stat_key}...")
        try:
            markets = fetch_series(ticker)
        except Exception as e:
            print(f"  skipped {ticker} ({e})")
            continue
        if not markets:
            print("  no open markets")
            continue
        counts[ticker] = len(markets)

        # Group by (player, event): one ladder per player per game.
        by_key: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for m in markets:
            sub = (m.get("yes_sub_title") or "").strip()
            name = sub.split(":")[0].strip()
            event = m.get("event_ticker") or ""
            if name and event:
                by_key[(name, event)].append(m)

        for (name, event), ms in by_key.items():
            ladder = enforce_monotonic(build_ladder(ms))
            if not ladder:
                continue
            observed = median_from_ladder(ladder)
            fit = lognormal_fit(ladder)
            if observed is not None:
                line, source = observed, "interpolated"
            elif fit is not None:
                line, source = fit["median"], "fitted"
            else:
                line, source = None, None

            date, teams = parse_event(event)
            # Each series carries its own ticker prefix for the SAME game
            # (KXNFLREC-26SEP13GBMIN vs KXNFLRECYDS-26SEP13GBMIN), so key on
            # the game itself -- date+teams -- or one game counts five times.
            gkey = (date or "", teams or event)
            rec = rows.setdefault((name, gkey), {
                "name": name,
                "game": f"{date}:{teams}" if date and teams else event,
                "kickoff": date,
                "matchup": teams,
                "stats": {},
            })
            rec["stats"][stat_key] = {
                "line": line,
                "lineSource": source,
                "expected": expected_from_ladder(ladder),
                "rungs": len(ladder),
                "confidentRungs": sum(1 for r in ladder if r["confident"]),
            }
        print(f"  {len(markets)} markets across {len(by_key)} player-games")

    out = sorted(rows.values(), key=lambda r: (r["kickoff"] or "", r["name"]))
    if not out:
        print("ERROR: no open per-game markets. The slate may have just closed.",
              file=sys.stderr)
        sys.exit(1)

    stat_counts: dict[str, int] = {}
    for r in out:
        for k, v in r["stats"].items():
            if v.get("line") is not None:
                stat_counts[k] = stat_counts.get(k, 0) + 1

    # Kalshi occasionally files a player under the wrong game's event ticker
    # (observed 2026-09-06: Kyler Murray, an ARI QB, listed under GBMIN). We
    # cannot fix their data, but a player appearing in two different matchups
    # is detectable, so surface it rather than passing it off as fact.
    seen: dict[str, set] = {}
    for r in out:
        seen.setdefault(r["name"], set()).add(r["matchup"])
    conflicts = sorted(n for n, ms in seen.items() if len(ms) > 1)
    if conflicts:
        print(f"  ! {len(conflicts)} player(s) appear in multiple matchups "
              f"(Kalshi ticker error): {', '.join(conflicts[:5])}")

    kickoffs = sorted({r["kickoff"] for r in out if r["kickoff"]})
    week = resolve_week(list(kickoffs))
    OUT_FILE.write_text(json.dumps({
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": "2026",
        "source": "Kalshi (per-game)",
        "note": (
            "Per-game player props for the upcoming slate. Kalshi purges settled "
            "markets, so whatever is open is the next set of games -- there is no "
            "way to fetch a week that has already been played."
        ),
        "week": week,
        "kickoffs": kickoffs,
        "gameCount": len({r["game"] for r in out}),
        "playerGameCount": len(out),
        "matchupConflicts": conflicts,
        "statCounts": stat_counts,
        "seriesMarketCounts": counts,
        "players": out,
    }, indent=2), encoding="utf-8")

    print(f"\nWrote {OUT_FILE}")
    print(f"  {len(out)} player-games across {len({r['game'] for r in out})} games")
    print(f"  week: {week}   kickoffs: {kickoffs}")
    print("  stat coverage - " + ", ".join(f"{k}:{v}" for k, v in sorted(stat_counts.items())))


if __name__ == "__main__":
    main()
