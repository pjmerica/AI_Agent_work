"""Build the player universe: who we care about, and how much.

Sources (every field is traceable back to one of these):
  - UD ADP history  : EZ Dubs Website/dashboards/best-ball-prices/ud_adp_history.csv
  - Season projections: FF Starters/season proj/outputs/ud/predictions_2026_{qb,rb,wrte}.csv

Weighting is deliberately INVERTED vs. conventional fantasy tooling: a late-ADP
player is worth more attention than a first-rounder, because news about Josh Allen
is already priced in and news about WR6 on a depth chart is not.
"""
from __future__ import annotations

import csv
import os
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

DOCS = Path.home() / "Documents"
# CI checks the ADP history out of the EZ Dubs repo and points here; locally it
# falls back to the copy under Documents.
UD_ADP = Path(os.environ.get("UD_ADP_PATH") or
              DOCS / "EZ Dubs Website/dashboards/best-ball-prices/ud_adp_history.csv")
PRED_DIR = Path(os.environ.get("PRED_DIR") or
                DOCS / "FF Starters/season proj/outputs/ud")
PRED_FILES = ["predictions_2026_qb.csv", "predictions_2026_rb.csv", "predictions_2026_wrte.csv"]

# The ADP board rolls forward to the newest snapshot in the CSV by default, so a
# daily run picks up fresh ADP automatically. Movement is measured against
# whatever snapshot is ~ADP_LOOKBACK_DAYS older, keeping the UNPRICED signal alive.
#
# Set ADP_AS_OF (or the ADP_AS_OF env var) to a date string to freeze the board
# instead -- useful for reproducing a specific day's digest. ADP_BASELINE
# likewise overrides the comparison snapshot.
ADP_AS_OF = os.environ.get("ADP_AS_OF") or None        # None = use newest in file
ADP_BASELINE = os.environ.get("ADP_BASELINE") or None  # None = derive from lookback
ADP_LOOKBACK_DAYS = 14

# UD stores full club names; the rest of the world uses abbreviations.
TEAM_ABBR = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
}

SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}


def norm(name: str) -> str:
    """Fuzzy-match key: strip accents, punctuation, suffixes, casing.

    'Amon-Ra St. Brown' -> 'amonra st brown'; 'Michael Penix Jr.' -> 'michael penix'.
    Deliberately loose per the brief -- we would rather over-match a name than
    miss a mention of a deep-roster player.
    """
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("'", "").replace(".", " ").replace("-", "")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    parts = [p for p in s.split() if p and p not in SUFFIXES]
    return " ".join(parts)


def _num(v: str) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None  # UD writes '-' for undrafted


# Some dates carry BOTH a 'manual' and an 'auto' pull (observed on 2026-07-06,
# 07-16 and 07-27). 'auto' is the full board (~1372 rows) vs 'manual' (~295), and
# the two disagree by up to 12 ADP points, so picking the wrong one can invent
# movement that never happened. Prefer the more complete source.
SOURCE_PRIORITY = {"auto": 2, "manual": 1}


def _dedupe(rows: list[dict]) -> list[dict]:
    """Collapse duplicate (date, player) rows, keeping the best-sourced one."""
    best: dict[tuple[str, str], dict] = {}
    for r in rows:
        key = (r["date"], r["name"])
        cur = best.get(key)
        if cur is None or SOURCE_PRIORITY.get(r.get("source", ""), 0) > \
                SOURCE_PRIORITY.get(cur.get("source", ""), 0):
            best[key] = r
    dropped = len(rows) - len(best)
    if dropped:
        print(f"  deduped {dropped} duplicate (date, player) rows "
              "-- kept 'auto' over 'manual' where both existed")
    return list(best.values())


def resolve_dates(dates: list[str], lookback_days: int = ADP_LOOKBACK_DAYS) -> tuple[str, str]:
    """Pick the (as_of, baseline) snapshot pair.

    Default: as_of is the newest snapshot in the file, so a daily run tracks
    fresh ADP automatically. baseline is the closest snapshot at least
    `lookback_days` older, which is what makes the UNPRICED signal meaningful.

    Explicit ADP_AS_OF / ADP_BASELINE pins override this, for reproducing a
    given day. A pin that is not present in the data warns and falls back rather
    than failing or silently using the wrong board.
    """
    if not dates:
        raise ValueError("no dated rows in the ADP history")

    if ADP_AS_OF:
        as_of = ADP_AS_OF
        if as_of not in dates:
            as_of = dates[-1]
            print(f"! pinned ADP_AS_OF={ADP_AS_OF} not in data; using newest {as_of}.")
    else:
        as_of = dates[-1]

    if ADP_BASELINE:
        baseline = ADP_BASELINE
        if baseline not in dates or baseline > as_of:
            print(f"! pinned ADP_BASELINE={ADP_BASELINE} unusable; deriving from lookback.")
            baseline = None
    else:
        baseline = None

    if baseline is None:
        target = (date.fromisoformat(as_of) - timedelta(days=lookback_days)).isoformat()
        # Snapshots are not daily, so take the newest one at or before the target.
        earlier = [d for d in dates if d <= target] or [d for d in dates if d < as_of] or [dates[0]]
        baseline = earlier[-1]

    return as_of, baseline


@dataclass
class Player:
    name: str
    pos: str = ""
    team: str = ""
    adp: float | None = None
    adp_prior: float | None = None
    proj: float | None = None
    aliases: set[str] = field(default_factory=set)

    @property
    def adp_move(self) -> float | None:
        """Positive = rising (being drafted earlier)."""
        if self.adp is None or self.adp_prior is None:
            return None
        return round(self.adp_prior - self.adp, 1)

    @property
    def sleeper_weight(self) -> float:
        """How much a mention of this player matters. Higher = more interesting.

        The curve keeps climbing past ADP 108 rather than flattening at 1.0.
        It used to saturate there, which meant it stopped discriminating exactly
        where the interesting players are -- measured across a real run, the
        61-150 bucket outscored the 151+ and undrafted buckets, the opposite of
        what this digest is for.
        """
        if self.adp is None:
            # Off the board entirely but a beat writer is talking about them:
            # the purest form of unpriced news.
            return 1.9
        if self.adp <= 24:      # rounds 1-2: news is already priced in
            return 0.3
        if self.adp <= 60:
            return 0.5
        if self.adp <= 108:
            return 0.75
        if self.adp <= 150:
            return 1.1
        if self.adp <= 190:
            return 1.5
        return 1.8              # ADP 190+: last-round fliers and camp bodies

    def to_dict(self) -> dict:
        return {
            "name": self.name, "pos": self.pos, "team": self.team,
            "adp": self.adp, "adp_prior": self.adp_prior, "adp_move": self.adp_move,
            "proj": self.proj, "sleeper_weight": self.sleeper_weight,
        }


def load_players(lookback_days: int = 14) -> dict[str, Player]:
    """Return {normalized_name: Player}.

    Degrades rather than failing: without the ADP file we still build the
    universe from projections alone. Every player then has adp=None, which
    scores as maximally interesting -- acceptable, since the alternative is no
    digest at all. The header reports the ADP baseline so this is visible.
    """
    if not UD_ADP.exists():
        print(f"! ADP history not found ({UD_ADP}); "
              "running projections-only, no ADP movement.")
        players: dict[str, Player] = {}
        _attach_projections(players)
        if not players:
            raise FileNotFoundError(
                f"No ADP file at {UD_ADP} and no projections at {PRED_DIR}. "
                "Nothing to build a player universe from."
            )
        return players

    rows = list(csv.DictReader(UD_ADP.open(encoding="utf-8")))
    if not rows:
        raise ValueError(f"UD ADP history is empty: {UD_ADP}")

    rows = _dedupe(rows)
    latest, prior = resolve_dates(sorted({r["date"] for r in rows}), lookback_days)

    snapshots: dict[str, dict[str, float]] = defaultdict(dict)
    players: dict[str, Player] = {}

    for r in rows:
        key = norm(r["name"])
        if not key:
            continue
        adp = _num(r["adp"])
        if adp is not None:
            snapshots[key][r["date"]] = adp
        p = players.get(key)
        if p is None:
            p = players[key] = Player(name=r["name"])
        if r["date"] == latest:
            # Trust the newest snapshot for identity fields.
            p.name = r["name"]
            p.pos = r["pos"]
            p.team = TEAM_ABBR.get(r["team"], r["team"])
        p.aliases.add(key)

    for key, p in players.items():
        snap = snapshots.get(key, {})
        p.adp = snap.get(latest)
        p.adp_prior = snap.get(prior)
        if not p.team:  # never appeared in the latest snapshot
            for d in sorted(snap, reverse=True):
                break

    _attach_projections(players)
    return players


def _attach_projections(players: dict[str, Player]) -> None:
    """Fold in projected points; add any player the ADP board omits entirely."""
    for fname in PRED_FILES:
        path = PRED_DIR / fname
        if not path.exists():
            continue  # projections are enrichment, not a hard dependency
        for r in csv.DictReader(path.open(encoding="utf-8")):
            key = norm(r["full_name"])
            if not key:
                continue
            p = players.get(key)
            if p is None:
                # Projected but undrafted -- exactly the profile we care about.
                p = players[key] = Player(
                    name=r["full_name"], pos=r.get("position", ""), team=r.get("team", "")
                )
                p.aliases.add(key)
            p.proj = _num(r.get("pred_fpts", ""))
            if not p.pos:
                p.pos = r.get("position", "")
            # The ADP board carries stale 'FA' for players who have since signed
            # (observed on Tyreek Hill, Najee Harris, Taysom Hill and ~640 more).
            # Projections track current rosters, so let them fill in a real team --
            # without one, team-blog disambiguation cannot fire for these players.
            pred_team = (r.get("team") or "").strip()
            if pred_team and p.team in ("", "FA"):
                p.team = pred_team


def adp_context(players: dict[str, Player]) -> dict:
    """Summary stats for the digest header, so movement claims are auditable."""
    moved = [p for p in players.values() if p.adp_move is not None and abs(p.adp_move) >= 3]
    risers = sorted(moved, key=lambda p: -(p.adp_move or 0))[:15]
    fallers = sorted(moved, key=lambda p: (p.adp_move or 0))[:10]
    return {"risers": [p.to_dict() for p in risers], "fallers": [p.to_dict() for p in fallers]}


if __name__ == "__main__":
    ps = load_players()
    drafted = [p for p in ps.values() if p.adp is not None]
    print(f"players: {len(ps)} ({len(drafted)} with current ADP)")
    ctx = adp_context(ps)
    print("\ntop risers:")
    for r in ctx["risers"][:8]:
        print(f"  {r['name']:26s} {r['pos']:3s} {str(r['team']):4s} "
              f"{r['adp_prior']} -> {r['adp']} ({r['adp_move']:+})")
