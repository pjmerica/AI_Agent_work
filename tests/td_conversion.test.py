"""The DraftKings anytime-TD price is converted to expected touchdowns.

A sportsbook quotes P(scores at least one TD); Kalshi's any_tds is a true
expectation off a 1+/2+/3+ ladder. Both get multiplied by 6, so treating the
first as the second understates every goal-line back.

This checks the conversion still behaves, and -- when both files are present --
re-derives the fit against Kalshi rather than trusting the constant.

    python tests/td_conversion.test.py
"""
import importlib.util
import json
import math
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "dk", ROOT / "scripts" / "fetch_dk_td_scorers.py")
dk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dk)

failures = []


def check(label, cond, detail=""):
    if cond:
        print(f"  ok    {label}")
    else:
        failures.append(label)
        print(f"  FAIL  {label}" + (f"   -> {detail}" if detail else ""))


print("=== conversion properties ===")
f = dk.expected_tds
check("0 maps to 0", f(0.0) == 0.0)
check("never below the input probability",
      all(f(p) >= p - 1e-12 for p in [i / 100 for i in range(1, 100)]))
check("monotonic in p",
      all(f(i / 100) < f((i + 1) / 100) for i in range(1, 98)))
check("tail is nearly unchanged", abs(f(0.10) - 0.10) < 0.01,
      f"f(0.10)={f(0.10):.4f}")
check("goal-line is lifted materially", f(0.70) - 0.70 > 0.10,
      f"f(0.70)={f(0.70):.4f}")
check("stays below the full Poisson value",
      f(0.70) < -math.log(1 - 0.70),
      f"{f(0.70):.4f} vs {-math.log(1-0.70):.4f}")
check("bounded at 1", f(1.0) <= 1.0)


def norm(s):
    s = re.sub(r"[^a-z\s]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s)
    return re.sub(r"\s+", " ", s).strip()


wk_file = ROOT / "nfl-props" / "weekly.json"
dk_file = ROOT / "nfl-props" / "dk_td.json"
if wk_file.exists() and dk_file.exists():
    wk = json.loads(wk_file.read_text(encoding="utf-8"))
    dkj = json.loads(dk_file.read_text(encoding="utf-8"))
    kal = {norm(p["name"]): p["stats"]["any_tds"]["line"]
           for p in wk["players"]
           if (p.get("stats", {}).get("any_tds") or {}).get("line") is not None}
    pairs = [(p["impliedProb"], p["xTD"], kal[norm(p["name"])])
             for p in dkj["players"] if norm(p["name"]) in kal]

    print()
    print(f"=== against Kalshi, {len(pairs)} players priced by both ===")
    if len(pairs) < 20:
        print("  (too few pairs to judge; skipping)")
    else:
        raw_mae = statistics.mean(abs(ip - k) for ip, _, k in pairs)
        new_mae = statistics.mean(abs(x - k) for _, x, k in pairs)
        check("conversion beats the raw probability", new_mae < raw_mae,
              f"raw {raw_mae:.4f} vs converted {new_mae:.4f}")

        # Goal-line backs are the whole point: that is where P(X>=1) and E[X]
        # diverge, and where a tenth of a touchdown is worth 0.6 of a fantasy
        # point. Stated in points rather than as a ratio, because a ratio
        # threshold is arbitrary and points are what a lineup decision turns on.
        hi = [(ip, x, k) for ip, x, k in pairs if k >= 0.35]
        if hi:
            raw_hi = statistics.mean(abs(ip - k) for ip, _, k in hi) * 6
            new_hi = statistics.mean(abs(x - k) for _, x, k in hi) * 6
            check(f"goal-line error is smaller than raw (n={len(hi)})",
                  new_hi < raw_hi,
                  f"raw {raw_hi:.2f} pts vs converted {new_hi:.2f} pts")
            check("goal-line error is under a third of a point",
                  new_hi < 0.33, f"{new_hi:.2f} fantasy points")

        bias = statistics.mean(x - k for _, x, k in pairs)
        check("no large systematic bias left", abs(bias) < 0.05,
              f"mean error {bias:+.4f}")

        # Re-derive the best blend. If this drifts far from the constant in
        # the scraper, the fit is stale and the comment says how to redo it.
        best = min(
            ((a, statistics.mean(
                abs(ip + a * (-math.log(max(1e-9, 1 - ip)) - ip) - k)
                for ip, _, k in pairs))
             for a in [i / 100 for i in range(0, 105, 5)]),
            key=lambda t: t[1])
        print(f"  note  best-fit blend today is {best[0]:.2f}; "
              f"scraper uses {dk.POISSON_SHARE:.2f}")
        check("scraper's blend is still close to the best fit",
              abs(best[0] - dk.POISSON_SHARE) <= 0.25,
              f"best {best[0]:.2f} vs configured {dk.POISSON_SHARE:.2f}")
else:
    print()
    print("=== skipping the Kalshi comparison: data files not present ===")

print()
print(f"{'FAILED: ' + ', '.join(failures) if failures else 'all checks passed'}")
sys.exit(1 if failures else 0)
