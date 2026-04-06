"""
NFL Draft Round 1 Skill Position Database (1995-2025)
Positions: QB, RB, WR, TE
Usage:
    python nfl_draft_db.py            # print summary
    python nfl_draft_db.py 2011       # show picks for a year
    python nfl_draft_db.py WR         # show all WR picks
    python nfl_draft_db.py "Julio Jones"  # look up a player
"""

import csv
import sys
from pathlib import Path
from collections import defaultdict

CSV_FILE = Path(__file__).parent / "nfl_draft_r1_skill_1995_2025.csv"

# ── Load ──────────────────────────────────────────────────────────────────────

def load():
    players = []
    with open(CSV_FILE, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            row["year"] = int(row["year"])
            row["pick"] = int(row["pick"])
            players.append(row)
    return players

# ── Query helpers ─────────────────────────────────────────────────────────────

def by_year(players, year):
    return sorted([p for p in players if p["year"] == year], key=lambda p: p["pick"])

def by_position(players, pos):
    return sorted([p for p in players if p["position"].upper() == pos.upper()],
                  key=lambda p: (p["year"], p["pick"]))

def find_player(players, name):
    name_lower = name.lower()
    return [p for p in players if name_lower in p["name"].lower()]

def by_team(players, team):
    team_lower = team.lower()
    return sorted([p for p in players if team_lower in p["team"].lower()],
                  key=lambda p: (p["year"], p["pick"]))

def by_college(players, college):
    col_lower = college.lower()
    return sorted([p for p in players if col_lower in p["college"].lower()],
                  key=lambda p: (p["year"], p["pick"]))

# ── Display ───────────────────────────────────────────────────────────────────

def fmt(p):
    return f"{p['year']}  #{p['pick']:>2}  {p['position']}  {p['name']:<28}  {p['college']:<22}  {p['team']}"

def print_list(players, label=""):
    if label:
        print(f"\n{'─'*80}")
        print(f"  {label}  ({len(players)} players)")
        print(f"{'─'*80}")
    print(f"{'Year':>4}  {'Pk':>4}  {'Pos':<4}  {'Name':<28}  {'College':<22}  Team")
    print("─" * 100)
    for p in players:
        print(fmt(p))

def summary(players):
    by_pos = defaultdict(int)
    by_yr  = defaultdict(lambda: defaultdict(int))
    for p in players:
        by_pos[p["position"]] += 1
        by_yr[p["year"]][p["position"]] += 1

    print(f"\n{'═'*60}")
    print(f"  NFL Round 1 Skill Positions  1995–2025")
    print(f"  Total players: {len(players)}")
    print(f"{'═'*60}")
    print(f"\n  By position:")
    for pos in ["QB","RB","WR","TE"]:
        print(f"    {pos}: {by_pos[pos]}")

    print(f"\n  Year-by-year breakdown (QB / RB / WR / TE / Total):")
    print(f"  {'Year':>4}  {'QB':>3}  {'RB':>3}  {'WR':>3}  {'TE':>3}  {'Total':>5}")
    print(f"  {'─'*30}")
    for yr in sorted(by_yr):
        d = by_yr[yr]
        tot = sum(d.values())
        print(f"  {yr}  {d['QB']:>3}  {d['RB']:>3}  {d['WR']:>3}  {d['TE']:>3}  {tot:>5}")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    players = load()

    if len(sys.argv) == 1:
        summary(players)
        return

    arg = sys.argv[1]

    # year?
    if arg.isdigit() and 1990 <= int(arg) <= 2030:
        results = by_year(players, int(arg))
        print_list(results, label=f"{arg} Draft — Round 1 Skill Positions")
        return

    # position?
    if arg.upper() in ("QB", "RB", "WR", "TE"):
        results = by_position(players, arg)
        print_list(results, label=f"All Round 1 {arg.upper()} picks 1995–2025")
        return

    # player name search
    results = find_player(players, arg)
    if results:
        print_list(results, label=f'Search: "{arg}"')
    else:
        # try team
        results = by_team(players, arg)
        if results:
            print_list(results, label=f'Team: "{arg}"')
        else:
            # try college
            results = by_college(players, arg)
            if results:
                print_list(results, label=f'College: "{arg}"')
            else:
                print(f"No results for '{arg}'")


if __name__ == "__main__":
    main()
