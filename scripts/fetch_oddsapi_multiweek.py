"""Fetch per-game NFL player props for a RANGE of weeks into nfl-props/multiweek.json.

Motivation: a single week of lines is noisy. A player draws a soft matchup one
week and a shutdown corner the next, so one week's number says as much about the
opponent as about the player. Averaging several weeks of market lines gives a
market-implied baseline -- what the books think this player does in a typical
game -- which is the more stable thing to rank on.

The Odds API publishes the whole season (272 events as of 2026-09-06), so future
weeks are available. Kalshi is NOT usable here: it lists only the upcoming slate
and holds no unopened future markets, so this fetcher is Odds-API-only.

Quota is the binding constraint. Player props bill ONE credit per event, so four
weeks of a 16-game slate costs 64 credits against a 500/month free tier. WEEKS
sets the range, and the script refuses to start when the remaining quota cannot
cover the request rather than burning half of it and failing midway.
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_oddsapi_weekly_props import MARKETS, abbr  # noqa: E402

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "multiweek.json"

API = "https://api.the-odds-api.com/v4"
SPORT = "americanfootball_nfl"
REGION = "us"

# How many weeks forward to cover, counting the upcoming slate as week 1 of the
# range. Each event costs a credit, so this is the main cost dial.
WEEKS = int(os.environ.get("MULTIWEEK_WEEKS", "4"))


def week_index(dates: list[str]) -> dict[str, int]:
    """Map each game date to a 1-based week number.

    NFL weeks run Thursday to Monday, so consecutive game days cluster and the
    gap between a Monday night game and the next Thursday is 3 days. Splitting
    on that gap derives the week boundaries from the schedule itself rather than
    hardcoding dates that would break next season.
    """
    uniq = sorted(set(d for d in dates if d))
    if not uniq:
        return {}
    out, wk = {}, 1
    prev = datetime.fromisoformat(uniq[0])
    for d in uniq:
        cur = datetime.fromisoformat(d)
        if (cur - prev).days >= 3:
            wk += 1
        out[d] = wk
        prev = cur
    return out


def http_json(url: str) -> tuple[object, dict]:
    req = Request(url, headers={"User-Agent": "nfl-props/1.0", "Accept": "application/json"})
    try:
        with urlopen(req, timeout=40) as resp:
            return json.loads(resp.read().decode("utf-8", "replace")), dict(resp.headers)
    except HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}") from None
    except URLError as e:
        raise RuntimeError(f"network error: {e}") from None


def main() -> None:
    key = os.environ.get("ODDS_API_KEY")
    if not key:
        print("ODDS_API_KEY not set - skipping (expected outside CI).")
        return

    events, hdrs = http_json(f"{API}/sports/{SPORT}/events/?{urlencode({'apiKey': key})}")
    if not isinstance(events, list) or not events:
        print("No upcoming NFL events returned.", file=sys.stderr)
        sys.exit(1)

    wk_of = week_index([(e.get("commence_time") or "")[:10] for e in events])
    wanted = [e for e in events
              if wk_of.get((e.get("commence_time") or "")[:10], 99) <= WEEKS]

    remaining = hdrs.get("x-requests-remaining")
    try:
        left = int(remaining) if remaining is not None else None
    except (TypeError, ValueError):
        left = None

    print(f"{len(events)} events offered; {len(wanted)} fall in weeks 1-{WEEKS}. "
          f"Quota remaining: {remaining}")
    if left is not None and left < len(wanted):
        print(f"ERROR: need {len(wanted)} credits but only {left} remain. "
              f"Lower MULTIWEEK_WEEKS or wait for the monthly reset.", file=sys.stderr)
        sys.exit(1)

    acc: dict[str, dict] = {}
    failed = 0

    for ev in wanted:
        eid = ev.get("id")
        home, away = ev.get("home_team", ""), ev.get("away_team", "")
        date = (ev.get("commence_time") or "")[:10]
        wk = wk_of.get(date, 0)
        qs = urlencode({"apiKey": key, "regions": REGION,
                        "markets": ",".join(MARKETS), "oddsFormat": "american"})
        try:
            data, hdrs = http_json(f"{API}/sports/{SPORT}/events/{eid}/odds/?{qs}")
        except RuntimeError as e:
            failed += 1
            print(f"  wk{wk} {away} @ {home}: {e}")
            continue

        # Collapse this event to ONE line per player-stat before averaging, so a
        # week quoted by five books does not outvote a week quoted by two.
        per_event: dict[tuple[str, str], list[float]] = defaultdict(list)
        for bk in (data.get("bookmakers") or []):
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
                    per_event[(player, stat)].append(float(point))

        for (player, stat), lines in per_event.items():
            rec = acc.setdefault(player, {"name": player, "weeks": {}, "stats": {}})
            rec["stats"].setdefault(stat, []).append({
                "week": wk,
                "line": round(statistics.median(lines), 2),
                "books": len(lines),
            })
            rec["weeks"][str(wk)] = f"{abbr(away)}{abbr(home)}"

    out = []
    for rec in acc.values():
        stats = {}
        for stat, entries in rec["stats"].items():
            vals = [e["line"] for e in entries]
            stats[stat] = {
                "avg": round(statistics.fmean(vals), 2),
                "weeks": len(vals),
                "min": min(vals),
                "max": max(vals),
                "byWeek": sorted(entries, key=lambda e: e["week"]),
            }
        out.append({"name": rec["name"], "games": rec["weeks"], "stats": stats})

    out.sort(key=lambda r: r["name"])
    stat_counts: dict[str, int] = {}
    for r in out:
        for k in r["stats"]:
            stat_counts[k] = stat_counts.get(k, 0) + 1

    OUT_FILE.write_text(json.dumps({
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": "2026",
        "source": "The Odds API (per-game, multi-week average)",
        "note": ("Per-game player props averaged across weeks. Each week is first "
                 "collapsed to a book consensus, then weeks are averaged equally, "
                 "so a week quoted by five books does not outweigh one quoted by "
                 "two. byWeek keeps every individual week's line."),
        "weeksCovered": WEEKS,
        "eventCount": len(wanted) - failed,
        "playerCount": len(out),
        "statCounts": stat_counts,
        "quotaRemaining": hdrs.get("x-requests-remaining"),
        "players": out,
    }, indent=2), encoding="utf-8")

    print(f"\nWrote {OUT_FILE}")
    print(f"  {len(out)} players across {len(wanted) - failed} events, weeks 1-{WEEKS}")
    print("  stat coverage - " + ", ".join(f"{k}:{v}" for k, v in sorted(stat_counts.items())))
    print(f"  API quota remaining: {hdrs.get('x-requests-remaining')}")


if __name__ == "__main__":
    main()
