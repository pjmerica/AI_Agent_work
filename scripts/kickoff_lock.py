"""Freeze each game's lines at kickoff.

Both prop feeds and the game-lines feed keep quoting a game after it starts,
and what they quote then is the LIVE market. Measured on week 5 (2026-10-11):
a run at 19:43 UTC, with the 1pm games under way, moved those games' Odds API
lines by a median 40% (Alvin Kamara receiving yards 13.5 -> -5.5, Brock Bowers
74.5 -> 129.5) and Kalshi's by 61% (Aaron Jones anytime TD 0.645 -> 0.03),
while games not yet started moved 0% and 2%. Every scrape that lands after a
kickoff -- which GitHub's 1.5-4.5 h cron lag made routine on Sundays -- was
replacing pregame projections with half-played-game numbers.

The rule, shared by all three scrapers:
  - a row whose game has kicked off is never taken from this run;
  - instead the previous file's row for it is carried forward, marked
    lockedAtKickoff, so the board keeps the closing pregame line;
  - carried rows expire LOCK_HOURS after kickoff, so a finished slate still
    ages off the board the way it did before.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Iterable

LOCK_HOURS = 12

GAMELINES = Path(__file__).resolve().parent.parent / "nfl-props" / "gamelines.json"


def parse_ts(value) -> datetime | None:
    """ISO 8601 (with Z or an offset) to an aware UTC datetime, else None."""
    if not value or not isinstance(value, str):
        return None
    try:
        t = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def kickoffs_by_matchup(path: Path = GAMELINES) -> dict[str, datetime]:
    """Matchup ("AWAYHOME") -> kickoff, from gamelines.json on disk.

    The Kalshi rows carry only a ticker date, so this is where their kickoff
    TIME comes from. A missing or unreadable file just means no locking.
    """
    try:
        games = json.loads(path.read_text(encoding="utf-8")).get("games") or []
    except Exception:  # noqa: BLE001
        return {}
    out = {}
    for g in games:
        t = parse_ts(g.get("kickoff")) if isinstance(g, dict) else None
        if t and g.get("matchup"):
            out[g["matchup"]] = t
    return out


def previous_rows(path: Path, field: str) -> list:
    """The list under `field` in the file currently on disk, or []."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return []
    rows = data.get(field) if isinstance(data, dict) else None
    return rows if isinstance(rows, list) else []


def lock_started(new_rows: Iterable[dict], prev_rows: Iterable[dict],
                 kickoff_of: Callable[[dict], datetime | None],
                 key: Callable[[dict], tuple],
                 now: datetime | None = None) -> tuple[list, int, int]:
    """Apply the kickoff lock. Returns (rows, dropped_live, carried_forward)."""
    now = now or datetime.now(timezone.utc)
    window = timedelta(hours=LOCK_HOURS)

    def started(r):
        t = kickoff_of(r)
        return t is not None and t <= now

    kept, dropped = [], 0
    for r in new_rows:
        if started(r):
            dropped += 1           # a live quote; the pregame row replaces it
        else:
            kept.append(r)
    have = {key(r) for r in kept}
    carried = 0
    for p in prev_rows:
        if not isinstance(p, dict) or not started(p):
            continue
        if now - kickoff_of(p) >= window or key(p) in have:
            continue
        kept.append({**p, "lockedAtKickoff": True})
        have.add(key(p))
        carried += 1
    return kept, dropped, carried
