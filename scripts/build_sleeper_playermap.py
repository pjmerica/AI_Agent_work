"""Build nfl-props/sleeper_players.json — a tiny Sleeper player-ID → name map.

This exists so the browser can resolve ANY user's Sleeper roster live. Sleeper's
own /v1/players/nfl is 14.6 MB, which is far too heavy to download in a page
just to turn ~30 roster IDs into names. Filtering to players who are on an NFL
team and play a fantasy-scoring position drops that to ~880 entries and ~30 KB,
which is cheap enough to ship as a static asset.

Arrays rather than objects, and two-letter keys, because the field names would
otherwise be most of the payload at this size.

Rebuild weekly: the map only needs to change when players sign, get cut, or
switch teams. A roster ID missing from the map renders as "unknown player"
rather than breaking the lineup, so a slightly stale map degrades gracefully.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "sleeper_players.json"
API = "https://api.sleeper.app/v1/players/nfl"

# Positions that can occupy a fantasy lineup slot. Everything else (OL, DL,
# individual defenders in non-IDP leagues) is dead weight in this map.
KEEP_POS = {"QB", "RB", "WR", "TE", "K", "DEF"}


def main() -> None:
    print("Fetching Sleeper player dictionary (~15 MB)...")
    req = Request(API, headers={"User-Agent": "nfl-props/1.0", "Accept": "application/json"})
    try:
        with urlopen(req, timeout=90) as r:
            players = json.loads(r.read().decode("utf-8", "replace"))
    except HTTPError as e:
        print(f"ERROR: HTTP {e.code}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"  {len(players)} total entries")

    out: dict[str, list] = {}
    for pid, v in players.items():
        pos = v.get("position")
        if pos not in KEEP_POS:
            continue
        team = v.get("team")
        # No team means a free agent or a retired player; neither can be started.
        # DEF entries carry the team code as their id, so keep those regardless.
        if not team and pos != "DEF":
            continue
        name = v.get("full_name") or " ".join(
            x for x in (v.get("first_name"), v.get("last_name")) if x) or str(pid)
        out[str(pid)] = [name, pos, team or str(pid)]

    payload = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "note": ("Trimmed Sleeper player map so the browser can resolve rosters "
                 "without the 14.6 MB upstream dictionary. Each value is "
                 "[name, position, team]."),
        "playerCount": len(out),
        "players": out,
    }
    # Separators matter here: at this size, pretty-printing roughly triples it.
    OUT_FILE.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    kb = OUT_FILE.stat().st_size / 1024
    print(f"\nWrote {OUT_FILE}")
    print(f"  {len(out)} players, {kb:.1f} KB")


if __name__ == "__main__":
    main()
