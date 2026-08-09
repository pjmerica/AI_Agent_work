"""
Fetch NFL *season-long* player markets from Kalshi and write nfl-props/kalshi.json.

Kalshi structures these differently from a sportsbook. Instead of one Over/Under
line per player, each player gets a LADDER of yes/no threshold markets:

    Bijan Robinson  750+ rush yds   ~0.82
    Bijan Robinson 1000+ rush yds   ~0.72
    Bijan Robinson 1250+ rush yds   ~0.51
    Bijan Robinson 1500+ rush yds   ~0.27

That ladder is a survival function: P(X >= strike). It carries strictly more
information than a single line, and we exploit it two ways:

  1. `median` — interpolate the strike where P = 0.50. This is the ladder's
     analogue of a sportsbook O/U line and is what we compare against projections.
  2. `expected` — integrate the survival curve to get E[X]. For a non-negative
     variable, E[X] = ∫P(X > t)dt, approximated with the trapezoid rule over the
     observed strikes.

Crucially Kalshi lists SEASON RECEPTIONS and SEASON RECEIVING TDs, which no
sportsbook offers. Those are the two markets that made FanDuel's data impossible
to convert to PPR — so this source, unlike vegas.json, can support a genuine
market-implied fantasy total. That conversion is left to the UI.

Liquidity caveat: many markets are thin, with very wide bid/ask spreads
(e.g. 0.02 bid / 0.82 ask). We record spread + open interest per strike and mark
low-confidence points so downstream code can filter them.

Usage:
    python scripts/fetch_kalshi_season_props.py
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

API = "https://api.elections.kalshi.com/trade-api/v2"
OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "kalshi.json"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

# Kalshi series ticker → our internal stat key.
# (KXNFLSEASONPASSTDS and KXNFLSEASONRUSHYDS exist as series but currently list
#  no open markets; harmless to keep — they simply yield nothing.)
SERIES = {
    "KXNFLSEASONPASSYDS": "pass_yds",
    "KXNFLSEASONPASSTDS": "pass_tds",
    "KXNFLSEASONRSHYDS":  "rush_yds",
    "KXNFLSEASONRUSHYDS": "rush_yds",
    "KXNFLSEASONRSHTD":   "rush_tds",
    "KXNFLSEASONRECYDS":  "rec_yds",
    "KXNFLSEASONREC":     "receptions",
    "KXNFLSEASONRECTD":   "rec_tds",
}

# A strike whose bid/ask spread exceeds this is treated as low-confidence.
WIDE_SPREAD = 0.25


def http_get_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urlopen(req, timeout=45) as r:
            return json.loads(r.read().decode("utf-8", errors="replace"))
    except HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}", file=sys.stderr)
        raise
    except URLError as e:
        print(f"  URL error: {e}", file=sys.stderr)
        raise


def money(v) -> float | None:
    """Kalshi returns prices as decimal strings like '0.6900'."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def fetch_series_markets(ticker: str) -> list[dict]:
    """Page through every open market for a series."""
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


def implied_prob(m: dict) -> tuple[float | None, float | None, bool]:
    """
    Return (probability, spread, confident).

    Prefer the bid/ask midpoint. Fall back to last trade when the book is
    one-sided. A very wide spread means the midpoint is close to meaningless,
    so flag it rather than silently trusting it.
    """
    bid, ask = money(m.get("yes_bid_dollars")), money(m.get("yes_ask_dollars"))
    last = money(m.get("last_price_dollars"))

    if bid is not None and ask is not None:
        spread = ask - bid
        mid = (bid + ask) / 2.0
        if spread <= WIDE_SPREAD:
            return mid, spread, True
        # Wide book: last trade is usually a better estimate than a stale mid.
        return (last if last is not None else mid), spread, False
    if last is not None:
        return last, None, False
    return None, None, False


def build_ladder(markets: list[dict]) -> list[dict]:
    """One rung per strike, sorted ascending, de-duplicated by strike."""
    rungs: dict[float, dict] = {}
    for m in markets:
        strike = m.get("floor_strike")
        if strike is None:
            continue
        prob, spread, confident = implied_prob(m)
        if prob is None:
            continue
        oi = m.get("open_interest_fp")
        try:
            oi = float(oi) if oi is not None else 0.0
        except (TypeError, ValueError):
            oi = 0.0
        r = {
            "strike": float(strike),
            "prob": round(prob, 4),
            "spread": round(spread, 4) if spread is not None else None,
            "confident": confident,
            "openInterest": oi,
        }
        # If two markets share a strike, keep the more liquid one.
        prev = rungs.get(r["strike"])
        if prev is None or oi > prev["openInterest"]:
            rungs[r["strike"]] = r
    return [rungs[k] for k in sorted(rungs)]


def enforce_monotonic(ladder: list[dict]) -> list[dict]:
    """
    P(X >= k) must be non-increasing in k. Thin books violate this. Clamp each
    rung to the running minimum so the curve is a valid survival function.
    """
    out, cap = [], 1.0
    for r in ladder:
        p = min(r["prob"], cap)
        cap = p
        out.append({**r, "prob": round(p, 4)})
    return out


def median_from_ladder(ladder: list[dict]) -> float | None:
    """Linearly interpolate the strike where P crosses 0.50."""
    if not ladder:
        return None
    if ladder[0]["prob"] < 0.5:
        return None  # even the lowest strike is under 50% — median below range
    for a, b in zip(ladder, ladder[1:]):
        if a["prob"] >= 0.5 >= b["prob"]:
            if a["prob"] == b["prob"]:
                return a["strike"]
            t = (a["prob"] - 0.5) / (a["prob"] - b["prob"])
            return round(a["strike"] + t * (b["strike"] - a["strike"]), 1)
    return None  # median above the highest listed strike


def expected_from_ladder(ladder: list[dict]) -> float | None:
    """
    E[X] = ∫₀^∞ P(X > t) dt, trapezoid over observed strikes.

    ONLY meaningful when the ladder starts near P≈1. Kalshi ladders are centred
    on the interesting range, not on zero: Josh Allen's passing ladder begins at
    3000 yds with P=0.66, so the whole 0–3000 region is unobserved. Assuming a
    flat P below the first strike then charges only 0.66 for mass that is very
    nearly certain, and E[X] comes out ~2600 — far below his true median of 3536.

    So we refuse to emit a number when the first rung is not high enough for the
    unobserved head to be a small correction. Above the last strike the tail
    decays linearly to zero across one average strike gap.
    """
    if len(ladder) < 2:
        return None
    # Below this, the unobserved region under the first strike dominates and the
    # integral is meaningless. Callers get None rather than a confidently wrong E[X].
    if ladder[0]["prob"] < 0.90:
        return None
    area = ladder[0]["strike"] * ladder[0]["prob"]
    for a, b in zip(ladder, ladder[1:]):
        area += (b["strike"] - a["strike"]) * (a["prob"] + b["prob"]) / 2.0
    gaps = [b["strike"] - a["strike"] for a, b in zip(ladder, ladder[1:])]
    avg_gap = sum(gaps) / len(gaps) if gaps else 0.0
    area += avg_gap * ladder[-1]["prob"] / 2.0
    return round(area, 1)


def main() -> None:
    players: dict[str, dict] = defaultdict(lambda: {"name": None, "stats": {}})
    series_counts: dict[str, int] = {}

    for series, stat_key in SERIES.items():
        print(f"Fetching {series} -> {stat_key}...")
        try:
            markets = fetch_series_markets(series)
        except (HTTPError, URLError):
            print(f"  skipped {series} (request failed)")
            continue
        series_counts[series] = len(markets)
        if not markets:
            print("  no open markets")
            continue

        by_player: dict[str, list[dict]] = defaultdict(list)
        for m in markets:
            name = (m.get("yes_sub_title") or "").strip()
            if name:
                by_player[name].append(m)

        for name, ms in by_player.items():
            ladder = enforce_monotonic(build_ladder(ms))
            if not ladder:
                continue
            p = players[name]
            p["name"] = name
            # A stat can appear under two series tickers; keep the richer ladder.
            existing = p["stats"].get(stat_key)
            if existing and len(existing["ladder"]) >= len(ladder):
                continue
            p["stats"][stat_key] = {
                "ladder": ladder,
                "median": median_from_ladder(ladder),
                "expected": expected_from_ladder(ladder),
                "confidentRungs": sum(1 for r in ladder if r["confident"]),
                "maxOpenInterest": max(r["openInterest"] for r in ladder),
            }
        print(f"  {len(markets)} markets across {len(by_player)} players")

    out = [p for p in players.values() if p["name"] and p["stats"]]
    out.sort(key=lambda p: p["name"])
    if not out:
        print("ERROR: no Kalshi season markets parsed", file=sys.stderr)
        sys.exit(1)

    stat_counts: dict[str, int] = defaultdict(int)
    for p in out:
        for k in p["stats"]:
            stat_counts[k] += 1

    payload = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": "2026",
        "source": "Kalshi",
        "book": "Kalshi",
        "note": (
            "Prediction-market threshold ladders, not sportsbook O/U lines. "
            "'median' is the interpolated P=0.50 strike (comparable to a book's "
            "line); 'expected' integrates the survival curve for E[X]. Many "
            "markets are thin — check spread/openInterest before trusting a rung."
        ),
        "availableStats": sorted(stat_counts.keys()),
        "playerCount": len(out),
        "statCoverage": dict(sorted(stat_counts.items())),
        "seriesMarketCounts": series_counts,
        "players": out,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_FILE}")
    print(f"  {len(out)} players")
    print("  stat coverage — " + ", ".join(f"{k}:{v}" for k, v in sorted(stat_counts.items())))


if __name__ == "__main__":
    main()
