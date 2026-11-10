"""The closing-lines archive: which snapshot is the close, and who is who.

Offline: synthetic snapshots and games, no git and no network.

Run: py tests/lines_archive.test.py
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_lines_archive as b  # noqa: E402
import score_lines_archive as s  # noqa: E402

failed = 0


def check(label, cond, detail=""):
    global failed
    failed += not cond
    print(f"  {'ok  ' if cond else 'FAIL'}  {label}" + ("" if cond else f"  [{detail}]"))


def T(h, d=8):
    return datetime(2026, 11, d, h, 0, tzinfo=timezone.utc)


games = b.Games({9: [
    {"matchup": "DALIND", "away": "DAL", "home": "IND", "kickoff": T(18), "final": True, "score": None},
    {"matchup": "JACBAL", "away": "JAC", "home": "BAL", "kickoff": T(1, 6), "final": True, "score": None},
    {"matchup": "LARWAS", "away": "LAR", "home": "WAS", "kickoff": T(21), "final": True, "score": None},
]})

print("names and teams")
check("Hollywood Brown is Marquise Brown", b.norm_name("Hollywood Brown") == b.norm_name("Marquise Brown"))
check("A.J. and AJ match", b.norm_name("A.J. Brown") == b.norm_name("AJ Brown"))
check("Kalshi's defense", b.dst_team("DAL Cowboys D/ST", "DAL", "IND") == "DAL")
check("a book's defense", b.dst_team("Indianapolis Colts Defense", "DAL", "IND") == "IND")
check("LA Rams D/ST is LAR", b.dst_team("LA Rams D/ST", "LAR", "WAS") == "LAR")
check("a player is not a defense", b.dst_team("Dallas Goedert", "DAL", "IND") is None)
check("JAX and WSH are JAC and WAS", b.canon("JAX") == "JAC" and b.canon("WSH") == "WAS")

print("finding the game")
check("Kalshi matchup and ticker date", games.find("DALIND", b.row_day({"kickoff": "26NOV08"}))[1]["matchup"] == "DALIND")
check("an early books row's long names", games.find("Dallas Cowboys @ Indianapolis Colts",
                                                    b.row_day({"kickoff": "2026-11-08"})) is not None)
check("JAX spelling of a JAC game", games.find("JAXBAL", T(1, 6)) is not None)
check("a different week is not this game", games.find("DALIND", T(18, 20)) is None)

print("closing line = last pregame snapshot")


def snap(t, rows):
    return (t, {"players": rows})


def row(name, stats, **kw):
    return {"name": name, "matchup": "DALIND", "kickoffTime": "2026-11-08T18:00:00Z", "stats": stats, **kw}


def yds(line):
    return {"rec_yds": {"line": line, "quotes": [{"book": "draftkings", "line": line, "odds": -110}]}}


players = {}
b.fold_players([
    snap(T(9, 5), [row("CeeDee Lamb", yds(81.5))]),
    snap(T(17), [row("CeeDee Lamb", yds(93.5)),
                 row("Dak Prescott", {"pass_yds": {"line": 261.5, "quotes": [{"book": "fanduel", "line": 261.5, "odds": -113}]}}),
                 row("Dallas Cowboys D/ST", {"any_tds": {"line": 0.15, "quotes": [{"book": "fanduel", "line": 0.15, "odds": 550}]}})]),
    snap(T(19), [row("CeeDee Lamb", yds(129.5))]),                       # live, after kickoff
    snap(T(20), [row("CeeDee Lamb", yds(93.5), lockedAtKickoff=True)]),
], games, {9}, players, "books")
lamb = players[(9, "DALIND", b.norm_name("CeeDee Lamb"))]["books"]
check("close is the last snapshot before kickoff", lamb["stats"]["rec_yds"]["close"] == 93.5, lamb)
check("open is the first", lamb["stats"]["rec_yds"]["open"] == 81.5, lamb)
check("closeAt is that snapshot's time", lamb["closeAt"] == T(17))
dst = players[(9, "DALIND", b.norm_name("DAL D/ST"))]
check("a defense keeps only its own lines (it once took the previous row's)",
      list(dst["books"]["stats"]) == ["any_tds"], dst["books"]["stats"])

print("units")
q = b.book_quotes("pass_tds", {"quotes": [{"book": "draftkings", "line": 2.17, "posted": 2.5, "odds": 155}]})
check("a converted count quote keeps the posted line", q["draftkings"]["line"] == 2.5)
check("and carries the mean", abs(q["draftkings"]["mean"] - 2.17) < 0.05, q)
check("any_tds carries the implied probability",
      b.book_quotes("any_tds", {"quotes": [{"book": "x", "line": 0.9, "odds": 100}]})["x"]["prob"] == 0.5)
m = s.ladder_median(4.0)
check("a ladder median sits below the Poisson mean", 3.6 < m < 4.0, m)
check("a short mean still has a median", s.ladder_median(0.4) is not None)

print("scoring is paired")
week = {"week": 9, "games": [], "players": [
    {"actual": {"played": True, "rec_yds": 100},
     "books": {"stats": {"rec_yds": {"close": 90, "quotes": {"a": {"line": 90}, "b": {"line": 95}}}}}},
    {"actual": {"played": True, "rec_yds": 50},
     "books": {"stats": {"rec_yds": {"close": 60, "quotes": {"a": {"line": 60}}}}}},
    {"actual": {"played": False},
     "books": {"stats": {"rec_yds": {"close": 60, "quotes": {"b": {"line": 0}}}}}},
]}
card = s.score([week])["stats"]["rec_yds"]
by = {r["source"]: r for r in card["sources"]}
check("b is compared only where b priced", by["b"]["n"] == 1 and by["b"]["vsConsensus"] == -5, by["b"])
check("a void prop (no snaps) is left out", by["consensus"]["n"] == 2)

print(f"\n{'all passed' if not failed else f'{failed} failed'}")
sys.exit(1 if failed else 0)
