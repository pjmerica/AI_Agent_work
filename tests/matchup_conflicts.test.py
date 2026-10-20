"""The Kalshi "player in two matchups" warning must flag misfiles, not schedules.

fetch_kalshi_weekly_props.py warns when a player appears under two games,
because Kalshi has filed players under the wrong event ticker (Kyler Murray
under GBMIN, 2026-09-06). Until 2026-10-19 it also fired on every run of week
6, for CHI and NE D/ST, simply because next Thursday's NE @ CHI was already
listed beside their Sunday games. A warning that always fires gets ignored.

The rule is now "two games in the same NFL week". A day gap cannot express
that: Sunday to a short-week Thursday is 4 days, and so is a Thursday-to-Monday
misfile inside one slate. This runs the real block of code from the script.

Run: py tests/matchup_conflicts.test.py
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

SRC = (Path(__file__).resolve().parent.parent / "scripts" /
       "fetch_kalshi_weekly_props.py").read_text(encoding="utf-8")
START = SRC.index("    def _nfl_week(k):")
END = SRC.index('    if conflicts:\n        print(f"  ! ')
BODY = "\n".join(line[4:] for line in SRC[START:END].split("\n"))


def conflicts(rows):
    g = {"datetime": datetime, "timedelta": timedelta, "out": rows}
    exec(BODY, g)
    return g["conflicts"]


def R(name, matchup, kickoff):
    return {"name": name, "matchup": matchup, "kickoff": kickoff}


CASES = {
    "week 6: Sunday game + next week's Thursday (short week)":
        ([R("CHI Bears D/ST", "CHIATL", "26OCT18"), R("CHI Bears D/ST", "NECHI", "26OCT22")], []),
    "Sunday + next Sunday":
        ([R("X", "AAABBB", "26OCT18"), R("X", "CCCDDD", "26OCT25")], []),
    "Monday night + next Thursday":
        ([R("X", "AAABBB", "26OCT19"), R("X", "CCCDDD", "26OCT22")], []),
    "misfile: two games the same Sunday":
        ([R("Kyler Murray", "ARISEA", "26SEP06"), R("Kyler Murray", "GBMIN", "26SEP06")], ["Kyler Murray"]),
    "misfile: Thursday and Monday of one week":
        ([R("Y", "AAABBB", "26OCT15"), R("Y", "CCCDDD", "26OCT19")], ["Y"]),
    "unparseable kickoff still flags (cannot tell)":
        ([R("Z", "AAABBB", ""), R("Z", "CCCDDD", "26SEP07")], ["Z"]),
    "one game is never a conflict":
        ([R("W", "AAABBB", "26OCT18")], []),
}

failed = 0
for label, (rows, want) in CASES.items():
    got = conflicts(rows)
    ok = got == want
    failed += not ok
    print(f"  {'ok  ' if ok else 'FAIL'}  {label}" + ("" if ok else f"  got {got}, want {want}"))

print(f"\n{len(CASES) - failed} passed, {failed} failed")
sys.exit(1 if failed else 0)
