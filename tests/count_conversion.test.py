"""Count-stat quotes become expected counts, not raw half-point lines.

On 2026-11-05 DraftKings had Dak Prescott at 2.5 passing TDs (over +155) and
BetMGM at 1.5 (over -250): a full touchdown apart as lines, nearly the same
opinion as prices. fetch_oddsapi_weekly_props._count_mean turns each line and
price into the Poisson mean, so books that picked different main lines agree.

Run: py tests/count_conversion.test.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from fetch_oddsapi_weekly_props import _count_mean  # noqa: E402

failed = 0


def check(label, cond, detail=""):
    global failed
    failed += not cond
    print(f"  {'ok  ' if cond else 'FAIL'}  {label}" + ("" if cond else f"  [{detail}]"))


dk, mgm = _count_mean(2.5, 155), _count_mean(1.5, -250)
check("different main lines, same opinion, land close", abs(dk - mgm) < 0.35, (dk, mgm))
fd, dk2 = _count_mean(1.5, 188), _count_mean(0.5, -248)
check("Herbert's 0.5 and 1.5 lines agree", abs(fd - dk2) < 0.1, (fd, dk2))
check("a short-priced 0.5 is well above 0.5 expected", dk2 > 1.0, dk2)
even = _count_mean(1.5, 100)
check("1.5 at even money is about 1.6 (skew puts the mean above the line)",
      1.5 < even < 1.75, even)
check("a longer price means a lower expectation",
      _count_mean(4.5, 120) < _count_mean(4.5, -120), "")
check("a whole-number line is refused", _count_mean(2, 110) is None)
check("a missing price is refused", _count_mean(1.5, None) is None)
check("zero odds are refused", _count_mean(1.5, 0) is None)

print(f"\n{'all passed' if not failed else f'{failed} failed'}")
sys.exit(1 if failed else 0)
