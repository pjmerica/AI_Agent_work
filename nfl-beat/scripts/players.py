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

        Stars saturate near 0.35; undrafted/deep players approach 1.0. A player
        with no ADP at all (off the board entirely) is maximally interesting,
        since that is where unpriced news lives.
        """
        if self.adp is None:
            return 1.0
        if self.adp <= 24:      # rounds 1-2: news is already priced in
            return 0.35
        if self.adp <= 60:
            return 0.55
        if self.adp <= 108:
            return 0.8
        return 1.0

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

    dates = sorted({r["date"] for r in rows})
    latest = dates[-1]
    target = (date.fromisoformat(latest) - timedelta(days=lookback_days)).isoformat()
    earlier = [d for d in dates if d <= target]
    prior = earlier[-1] if earlier else dates[0]

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
            if not p.team:
                p.team = r.get("team", "")


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
