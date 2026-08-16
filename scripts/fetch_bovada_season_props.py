"""Scrape Bovada's season-long NFL player props into nfl-props/bovada.json.

Why this exists: FanDuel posts no receiving-TD market at all, which is the last
stat blocking most first-round RBs from scoring on the Market Points tab. Bovada
does post it (44 players), plus a wider receiving-yards board than FanDuel (62
vs 44). Bovada posts no *receptions* market either, so Kalshi remains the only
source for that.

Endpoint quirks, all discovered by probing:
  - The season-long props live at /football/nfl-season-player-props. The plain
    /football/nfl coupon returns Week 1 game markets instead, and the obvious
    /football/nfl/futures 404s.
  - Passing marketFilterId=def returns ZERO events on this path. Omit it.
  - There is no `handicap` field. The line is embedded in the outcome text as
    "Over 5½" using Unicode vulgar fractions, so we NFKC-normalize (½ -> 1⁄2)
    and parse the mixed number.
  - Market names arrive with inconsistent apostrophes ("Receiving TD's" vs
    "Receiving TD’s"), so we normalize those before matching.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "bovada.json"

URL = ("https://www.bovada.lv/services/sports/event/coupon/events/A/description"
       "/football/nfl-season-player-props?lang=en")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# Market-name stat → our internal key. "Total Receiving TD's" is a separate
# Bovada market that duplicates "Receiving TD's" for a handful of players; it
# maps to the same key and loses the dedupe below on a tie.
STAT_KEYS = {
    "Passing Yards":        "pass_yds",
    "Passing TDs":          "pass_tds",
    "Passing TD's":         "pass_tds",
    "Rushing Yards":        "rush_yds",
    "Rushing TDs":          "rush_tds",
    "Rushing TD's":         "rush_tds",
    "Receiving Yards":      "rec_yds",
    "Receiving TDs":        "rec_tds",
    "Receiving TD's":       "rec_tds",
    "Total Receiving TD's": "rec_tds",
    "Receptions":           "receptions",
}

# "Puka Nacua Regular Season Receiving Yards"
MARKET_RE = re.compile(r"^(?P<player>.+?) Regular Season (?P<stat>.+?)$")


def http_get_json(url: str) -> object:
    req = Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.bovada.lv/sports/football/nfl",
        "Accept-Language": "en-US,en;q=0.9",
    })
    try:
        with urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:300]}", file=sys.stderr)
        raise
    except URLError as e:
        print(f"  URL error: {e}", file=sys.stderr)
        raise


def norm_text(s: str) -> str:
    """NFKC-normalize and canonicalize apostrophes so market names match."""
    return unicodedata.normalize("NFKC", s or "").replace("’", "'").strip()


def parse_line(text: str) -> float | None:
    """'Over 5½' -> 5.5.

    NFKC rewrites ½ as '1⁄2' (U+2044 FRACTION SLASH), so normalize that to '/'
    and read the mixed number. Falls back to a plain decimal.
    """
    t = norm_text(text).replace("⁄", "/")
    m = re.search(r"(\d+)\s*(\d)/(\d)", t)
    if m:
        whole, num, den = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return whole + num / den if den else None
    m = re.search(r"(\d+(?:\.\d+)?)", t)
    return float(m.group(1)) if m else None


def american_odds(outcome: dict) -> int | None:
    raw = (outcome.get("price") or {}).get("american")
    if raw in (None, ""):
        return None
    if str(raw).upper() == "EVEN":
        return 100
    try:
        return int(str(raw).replace("+", ""))
    except ValueError:
        return None


def parse_events(payload: object) -> dict[str, dict]:
    events = []
    for blk in (payload if isinstance(payload, list) else [payload]):
        if isinstance(blk, dict):
            events.extend(blk.get("events") or [])

    players: dict[str, dict] = {}
    skipped_no_line = 0

    for ev in events:
        for dg in ev.get("displayGroups") or []:
            for mkt in dg.get("markets") or []:
                name = norm_text(mkt.get("description"))
                # "Regular Season Most Receiving Yards" is a league-wide leader
                # market, not a player total — it has no line to parse.
                if name.startswith("Regular Season Most"):
                    continue
                m = MARKET_RE.match(name)
                if not m:
                    continue
                stat_key = STAT_KEYS.get(m.group("stat").strip())
                if not stat_key:
                    continue

                line = over_price = under_price = None
                for o in mkt.get("outcomes") or []:
                    desc = norm_text(o.get("description")).lower()
                    if desc.startswith("over"):
                        line = parse_line(o.get("description"))
                        over_price = american_odds(o)
                    elif desc.startswith("under"):
                        under_price = american_odds(o)

                if line is None:
                    skipped_no_line += 1
                    continue

                player = m.group("player").strip()
                p = players.setdefault(player, {"name": player, "markets": {}})
                # Duplicate markets for one stat: keep the one with two-sided
                # pricing, which is the better-formed book.
                prev = p["markets"].get(stat_key)
                if prev and prev.get("over") is not None and prev.get("under") is not None:
                    continue
                p["markets"][stat_key] = {
                    "line": line,
                    "over": over_price,
                    "under": under_price,
                }

    if skipped_no_line:
        print(f"  note: {skipped_no_line} market(s) had no parseable Over/Under line")
    return players


def main() -> None:
    print("Fetching Bovada NFL season-long player props…")
    players = parse_events(http_get_json(URL))

    if not players:
        print("ERROR: no season-long player props found. Bovada may have changed "
              "the coupon path or market naming.", file=sys.stderr)
        sys.exit(1)

    out = sorted(players.values(), key=lambda p: p["name"])
    stat_counts: dict[str, int] = {}
    for p in out:
        for k in p["markets"]:
            stat_counts[k] = stat_counts.get(k, 0) + 1

    OUT_FILE.write_text(json.dumps({
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": "2026",
        "source": "Bovada",
        "book": "Bovada",
        "note": (
            "Season-long Bovada lines. Bovada posts receiving TDs (which FanDuel "
            "does not) but no receptions market, so these are raw stat lines and "
            "are NOT on their own convertible to a complete PPR total."
        ),
        "availableStats": sorted(stat_counts.keys()),
        "playerCount": len(out),
        "statCounts": stat_counts,
        "players": out,
    }, indent=2), encoding="utf-8")

    print(f"\nWrote {OUT_FILE}")
    print(f"  {len(out)} players")
    print("  stat coverage - " +
          ", ".join(f"{k}:{v}" for k, v in sorted(stat_counts.items())))


if __name__ == "__main__":
    main()
