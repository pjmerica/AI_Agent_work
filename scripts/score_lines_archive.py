"""Score the closing-lines archive against what happened.

    py scripts/score_lines_archive.py              # every archived week
    py scripts/score_lines_archive.py --weeks 6-9

Reads nfl-props/archive/<season>/week-NN.json (build_lines_archive.py) and
writes nfl-props/archive/<season>/scorecard.json, printing the same tables.

What it measures, per stat, over player-games where the player took a snap:
  - yardage and count stats (counts on the median scale, see ladder_median):
    mean absolute error of each source's closing
    number against the actual stat, and `vsConsensus`, the same error minus
    the books' consensus error on exactly the same player-games. A book only
    prices some players, so raw errors are not comparable between books;
    the paired figure is. Negative means closer than the consensus.
    `overRate`: how often the actual beat the consensus (about half if the
    market is unbiased).
  - any_tds: Brier score of the price-implied probability (0 is perfect,
    lower is better), the same paired `vsConsensus`, and the average
    probability next to the share that actually scored. Book probabilities
    keep the book's margin, so they run high.
  - consensus open vs close: did the market get closer as the week went on.
  - games: closing total and spread against the final score.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / "nfl-props" / "archive"
COUNT_STATS = {"pass_tds", "receptions"}
STATS = ["pass_yds", "pass_tds", "rush_yds", "rec_yds", "receptions", "any_tds"]
MIN_N = 30   # a source with fewer paired player-games is listed but not ranked


def ladder_median(lam):
    """The median Kalshi would report for a Poisson(lam) count.

    Kalshi's count ladders are half-point strikes ("4+ receptions" is over
    3.5) and fetch_kalshi_season_props.median_from_ladder interpolates where
    P(over) crosses 0.50. Kalshi's count numbers are therefore medians, while a
    book's line-and-price gives an expected count (a mean, about a third of a
    catch higher). Scoring one against the other would reward Kalshi for the
    convention, so each book's mean is turned into the same ladder median.
    """
    if not isinstance(lam, (int, float)) or lam <= 0:
        return None
    term, cdf = math.exp(-lam), 0.0
    prev_strike, prev_p = -0.5, 1.0
    for k in range(0, 60):
        cdf += term                      # P(X <= k)
        term *= lam / (k + 1)
        p = 1.0 - cdf                    # P(X > k + 0.5)
        if p <= 0.5:
            t = (prev_p - 0.5) / (prev_p - p) if prev_p != p else 0.0
            return round(max(0.0, prev_strike + t * (k + 0.5 - prev_strike)), 2)
        prev_strike, prev_p = k + 0.5, p
    return None


def value(stat, q):
    if stat in COUNT_STATS:
        return ladder_median(q.get("mean"))
    if stat == "any_tds":
        return q.get("prob")
    return q.get("line")


def loss(stat, v, actual):
    if stat == "any_tds":
        return (v - (1.0 if actual >= 1 else 0.0)) ** 2
    return abs(v - actual)


def parse_weeks(spec):
    out = set()
    for part in spec.split(","):
        a, _, b = part.partition("-")
        out.update(range(int(a), int(b or a) + 1))
    return out


def load(season, weeks):
    files = sorted((ARCHIVE / season).glob("week-*.json"))
    out = []
    for f in files:
        d = json.loads(f.read_text(encoding="utf-8"))
        if weeks and d["week"] not in weeks:
            continue
        out.append(d)
    return out


def score(weeks_data):
    # stat -> source -> list of (source loss, consensus loss, value - actual)
    paired: dict = {s: {} for s in STATS}
    over: dict = {s: [0, 0] for s in STATS}
    calib: dict = {}
    open_close: dict = {s: [[], []] for s in STATS}
    for d in weeks_data:
        for p in d["players"]:
            act = p.get("actual") or {}
            if not act.get("played"):
                continue
            books = (p.get("books") or {}).get("stats") or {}
            kalshi = (p.get("kalshi") or {}).get("stats") or {}
            for stat in STATS:
                if stat not in act or stat not in books:
                    continue
                a = act[stat]
                srcs = {}
                for book, q in (books[stat].get("quotes") or {}).items():
                    v = value(stat, q)
                    if isinstance(v, (int, float)):
                        srcs[book] = v
                if stat in COUNT_STATS:
                    # The consensus in the file is the median MEAN; on the
                    # median scale it is the median of the books' medians.
                    cons = statistics.median(srcs.values()) if srcs else None
                else:
                    cons = books[stat].get("close")
                if not isinstance(cons, (int, float)):
                    continue
                if stat == "any_tds" and cons > 1:   # an old file holding expected TDs, not a probability
                    continue
                lc = loss(stat, cons, a)
                srcs["consensus"] = cons
                if stat in kalshi and isinstance(kalshi[stat].get("close"), (int, float)):
                    srcs["kalshi"] = kalshi[stat]["close"]
                for src, v in srcs.items():
                    paired[stat].setdefault(src, []).append((loss(stat, v, a), lc, v - (a if stat != "any_tds" else (1.0 if a >= 1 else 0.0))))
                if stat != "any_tds" and a != cons:
                    over[stat][0] += a > cons
                    over[stat][1] += 1
                if stat == "any_tds":
                    c = calib.setdefault("consensus", [[], []])
                    c[0].append(cons)
                    c[1].append(1.0 if a >= 1 else 0.0)
                    if "kalshi" in srcs:
                        k = calib.setdefault("kalshi", [[], []])
                        k[0].append(srcs["kalshi"])
                        k[1].append(1.0 if a >= 1 else 0.0)
                op = books[stat].get("open")
                if stat in COUNT_STATS:
                    op = ladder_median(op)
                if isinstance(op, (int, float)):
                    open_close[stat][0].append(loss(stat, op, a))
                    open_close[stat][1].append(lc)

    out = {"stats": {}, "games": {}}
    for stat in STATS:
        rows = []
        for src, xs in paired[stat].items():
            n = len(xs)
            err = statistics.fmean(x[0] for x in xs)
            rows.append({
                "source": src, "n": n,
                ("brier" if stat == "any_tds" else "mae"): round(err, 4 if stat == "any_tds" else 2),
                "vsConsensus": round(err - statistics.fmean(x[1] for x in xs), 4 if stat == "any_tds" else 2),
                "bias": round(statistics.fmean(x[2] for x in xs), 3),
                "ranked": n >= MIN_N,
            })
        rows.sort(key=lambda r: (not r["ranked"], r["vsConsensus"]))
        entry = {"sources": rows}
        if stat != "any_tds" and over[stat][1]:
            entry["overRate"] = round(over[stat][0] / over[stat][1], 3)
            entry["overN"] = over[stat][1]
        oc = open_close[stat]
        if oc[0]:
            entry["openVsClose"] = {"n": len(oc[0]), "open": round(statistics.fmean(oc[0]), 4),
                                    "close": round(statistics.fmean(oc[1]), 4)}
        if stat == "any_tds":
            entry["calibration"] = {
                k: {"n": len(v[0]), "avgProb": round(statistics.fmean(v[0]), 3),
                    "scoredRate": round(statistics.fmean(v[1]), 3)}
                for k, v in calib.items() if v[0]}
        out["stats"][stat] = entry

    tot, spr = [], []
    for d in weeks_data:
        for g in d["games"]:
            c, s = g.get("close") or {}, g.get("score")
            if not s or s.get("home") is None:
                continue
            if isinstance(c.get("total"), (int, float)):
                tot.append((c["total"], s["home"] + s["away"]))
            if isinstance(c.get("homeSpread"), (int, float)):
                spr.append((c["homeSpread"], s["home"] - s["away"]))
    if tot:
        out["games"]["total"] = {
            "n": len(tot), "mae": round(statistics.fmean(abs(a - b) for a, b in tot), 2),
            "overRate": round(sum(b > a for a, b in tot) / max(1, sum(b != a for a, b in tot)), 3)}
    if spr:
        # homeSpread is the home team's handicap: -3 means favoured by 3, so
        # the line predicts a home margin of -homeSpread.
        out["games"]["spread"] = {
            "n": len(spr), "mae": round(statistics.fmean(abs(-a - b) for a, b in spr), 2),
            "homeCoverRate": round(sum(b + a > 0 for a, b in spr) / max(1, sum(b + a != 0 for a, b in spr)), 3)}
    return out


def show(card):
    for stat, e in card["stats"].items():
        metric = "brier" if stat == "any_tds" else "mae"
        extra = f"  actual over the consensus {e['overRate']:.0%} of {e['overN']}" if "overRate" in e else ""
        print(f"\n{stat}{extra}")
        if "openVsClose" in e:
            oc = e["openVsClose"]
            print(f"  consensus error: open {oc['open']}  close {oc['close']}  (n {oc['n']})")
        for k, c in (e.get("calibration") or {}).items():
            print(f"  {k}: average probability {c['avgProb']:.1%}, scored {c['scoredRate']:.1%} (n {c['n']})")
        print(f"  {'source':<16}{'n':>6}{metric:>9}{'vs cons':>9}{'bias':>8}")
        for r in e["sources"]:
            mark = "" if r["ranked"] else "  (few)"
            print(f"  {r['source']:<16}{r['n']:>6}{r[metric]:>9}{r['vsConsensus']:>+9}{r['bias']:>+8}{mark}")
    for k, g in card["games"].items():
        print(f"\ngames {k}: {g}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", default="2026")
    ap.add_argument("--weeks")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    weeks = parse_weeks(args.weeks) if args.weeks else None
    data = load(args.season, weeks)
    if not data:
        print("No archived weeks.")
        return 0
    card = {"season": args.season, "weeks": [d["week"] for d in data], **score(data),
            "note": ("Written by scripts/score_lines_archive.py from the week files. mae/brier: "
                     "error of each source's closing number; vsConsensus: that minus the books' "
                     "consensus error on the same player-games (negative = closer). bias: average "
                     "of number minus actual. Sources under %d paired player-games are not "
                     "ranked." % MIN_N)}
    if not args.weeks:
        (ARCHIVE / args.season / "scorecard.json").write_text(
            json.dumps(card, indent=1) + "\n", encoding="utf-8", newline="\n")
    if not args.quiet:
        print(f"Season {args.season}, weeks {card['weeks']}")
        show(card)
    return 0


if __name__ == "__main__":
    sys.exit(main())
