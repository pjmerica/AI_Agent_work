"""kickoff_wait.plan: which pre-kickoff refreshes are still due.

The Sunday chain refreshes 20 minutes before each kickoff. These pin the
schedule to a real Sunday slate and check the clustering, the already-served
skip and the November clock change.

Run: py tests/kickoff_wait.test.py
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from kickoff_wait import plan  # noqa: E402

U = lambda h, m, d=18: datetime(2026, 10, d, h, m, tzinfo=timezone.utc)
# Week 6 (EDT): nine games at 1pm ET, 4:05 and 4:25pm, Sunday night 8:20pm ET.
SLATE = [U(17, 0)] * 9 + [U(17, 2)] + [U(20, 5), U(20, 25), U(20, 25)] + [U(0, 20, 19)]
failed = 0


def check(label, got, want):
    global failed
    ok = got == want
    failed += not ok
    print(f"  {'ok  ' if ok else 'FAIL'}  {label}" + ("" if ok else f"\n        got  {got}\n        want {want}"))


hm = lambda pairs: [(t.strftime("%H:%M"), k.strftime("%H:%M")) for t, k in pairs]

check("Sunday morning: three refreshes, 20 min before 1pm, 4:05 and 8:20 ET",
      hm(plan(SLATE, U(9, 0), 20, 30, 22, None)),
      [("16:40", "17:00"), ("19:45", "20:05"), ("00:00", "00:20")])
check("4:05 and 4:25 share one refresh (within 30 min)",
      len(plan([U(20, 5), U(20, 25)], U(9, 0), 20, 30, 22, None)), 1)
check("after the 1pm refresh ran, it is not due again",
      hm(plan(SLATE, U(16, 50), 20, 30, 22, U(16, 41))),
      [("19:45", "20:05"), ("00:00", "00:20")])
check("a refresh from the morning does not count for 1pm",
      hm(plan(SLATE, U(12, 0), 20, 30, 22, U(10, 5)))[0], ("16:40", "17:00"))
check("games already kicked off are not planned",
      hm(plan(SLATE, U(17, 30), 20, 30, 22, None)),
      [("19:45", "20:05"), ("00:00", "00:20")])
check("late start (target passed, kickoff not) still runs, immediately",
      hm(plan(SLATE, U(16, 50), 20, 30, 22, U(10, 0)))[0], ("16:40", "17:00"))
check("within 3 min of kickoff it is too late to bother",
      hm(plan([U(17, 0)], U(16, 58), 20, 30, 22, None)), [])
# November, EST: 1pm ET is 18:00 UTC. The plan follows the data, not a clock.
EST = [U(18, 0, 8), U(21, 5, 8), U(21, 25, 8), U(1, 20, 9)]
check("after the clock change the targets move with the kickoffs",
      hm(plan(EST, U(9, 0, 8), 20, 30, 22, None)),
      [("17:40", "18:00"), ("20:45", "21:05"), ("01:00", "01:20")])
check("a London game gets its own refresh",
      hm(plan([U(13, 30), U(17, 0)], U(9, 0), 20, 30, 22, None)),
      [("13:10", "13:30"), ("16:40", "17:00")])
check("nothing beyond 20 hours out (next week's Thursday)",
      plan([U(0, 15, 23)], U(9, 0), 20, 30, 22, None), [])

print(f"\n{'all passed' if not failed else f'{failed} failed'}")
sys.exit(1 if failed else 0)
