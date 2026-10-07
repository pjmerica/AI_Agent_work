"""Print one line per data file: week, row count, and age.

Used by the props workflow's summary step, and useful by hand after a refresh:

    python scripts/report_data_state.py

Lives in a file rather than inline in the workflow on purpose. The previous
version was a heredoc nested in a YAML block scalar, where wrong indentation
produces silence rather than an error -- it emitted an empty block while still
exiting 0, so the summary looked fine and said nothing.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = ["weekly", "oddsapi", "gamelines", "dk_td", "sleeper_players"]


def rows_in(d: dict) -> object:
    for key in ("playerGameCount", "playerCount", "gameCount"):
        if d.get(key) is not None:
            return d[key]
    for key in ("players", "games"):
        v = d.get(key)
        if isinstance(v, list):
            return len(v)
        if isinstance(v, dict):
            return len(v)
    return "-"


def age_of(stamp: object) -> str:
    if not stamp:
        return ""
    try:
        t = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        hours = (datetime.now(timezone.utc) - t).total_seconds() / 3600
    except Exception:
        return ""
    if hours < 1:
        return "just now"
    if hours < 48:
        return f"{hours:.0f}h old"
    return f"{hours / 24:.0f}d old"


def main() -> int:
    worst = 0
    for name in FILES:
        path = ROOT / "nfl-props" / f"{name}.json"
        if not path.exists():
            print(f"{name:17} MISSING")
            worst = 1
            continue
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            print(f"{name:17} UNREADABLE ({e})")
            worst = 1
            continue
        if not isinstance(d, dict):
            print(f"{name:17} not a JSON object")
            worst = 1
            continue
        week = d.get("week", "-")
        print(f"{name:17} week {week:<4} rows {str(rows_in(d)):<6} "
              f"{str(d.get('lastUpdated'))[:16]}  {age_of(d.get('lastUpdated'))}")
    return worst


if __name__ == "__main__":
    sys.exit(main())
