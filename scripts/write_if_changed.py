"""Write a JSON payload only when something other than its timestamp changed.

clay.json (Mike Clay's season projections) and data.json (FantasyPros
consensus) were rewritten on every one of nfl-props.yml's eight weekly runs, but
in October only their lastUpdated moved: seven of seven consecutive updates
were timestamp-only (checked 2026-10-21). That made them look freshly updated
when nothing had changed, and pushed two unchanged files through every commit
and every EZ Dubs mirror run. Keeping the old file keeps lastUpdated meaning
"the data last changed".
"""
from __future__ import annotations

import json
from pathlib import Path


def write_json_if_changed(path: Path, payload: dict, stamp: str = "lastUpdated",
                          indent: int = 2) -> bool:
    """Write `payload` unless it equals the file on disk apart from `stamp`.

    Returns True if the file was written.
    """
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 -- missing or unreadable: just write
        old = None
    if isinstance(old, dict):
        same = ({k: v for k, v in old.items() if k != stamp}
                == {k: v for k, v in payload.items() if k != stamp})
        if same:
            return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=indent), encoding="utf-8")
    return True


def refuse_collapse(path: Path, payload: dict, key: str = "players",
                    min_ratio: float = 0.5) -> str | None:
    """A reason to keep the file on disk instead of writing `payload`, or None.

    Run locally on 2026-10-21, the FantasyPros scrape came back with 0 players
    and overwrote data.json with an empty list; on CI it normally gets ~40. A
    blocked request or a changed page must not blank a file the board reads, so
    an empty list, or one under `min_ratio` of what is there now, is refused --
    the same idea as the collapse guards in the Kalshi and Odds API scrapers.
    """
    new = payload.get(key) or []
    if not new:
        return f"0 {key} scraped"
    try:
        old = json.loads(path.read_text(encoding="utf-8")).get(key) or []
    except Exception:  # noqa: BLE001
        return None
    if old and len(new) < len(old) * min_ratio:
        return f"{key} collapsed from {len(old)} to {len(new)}"
    return None
