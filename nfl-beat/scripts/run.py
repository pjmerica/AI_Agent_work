"""Build today's NFL beat digest.

    py scripts/run.py            # normal run
    py scripts/run.py --dry      # print to console, write nothing

Reads the player universe from UD ADP + season projections, pulls news from
verified Bluesky handles and live RSS feeds, scores it, and writes HTML/MD/JSON
into digests/ (plus index.html for GitHub Pages).
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from analyze import find_matches, group_by_player            # noqa: E402
from config import MAX_AGE_HOURS_RSS, RSS_FEEDS, TEAM_FEEDS  # noqa: E402
from players import (UD_ADP, adp_context, load_players,      # noqa: E402
                     resolve_dates)
from report import write_all                                 # noqa: E402
from sources import collect, nitter_status                   # noqa: E402

HANDLES_JSON = Path(__file__).parent.parent / "data" / "handles.json"


def load_handles() -> list[str]:
    if not HANDLES_JSON.exists():
        print("! data/handles.json missing -- run: py scripts/verify_handles.py")
        return []
    data = json.loads(HANDLES_JSON.read_text(encoding="utf-8"))
    return [h["handle"] for h in data.get("verified", [])]


def main() -> int:
    dry = "--dry" in sys.argv

    handles = load_handles()
    feeds = RSS_FEEDS + TEAM_FEEDS
    print(f"→ {len(handles)} Bluesky handles, {len(RSS_FEEDS)} national feeds, "
          f"{len(TEAM_FEEDS)} team blogs")

    items = collect(handles, feeds, max_age_hours=MAX_AGE_HOURS_RSS)
    if not items:
        print("! no items collected -- every source failed. Aborting without writing.")
        return 1
    by_source = Counter(i.source for i in items)
    print(f"→ {len(items)} fresh items from {len(by_source)} sources")

    players = load_players()
    drafted = sum(1 for p in players.values() if p.adp is not None)
    print(f"→ {len(players)} players ({drafted} with current ADP)")

    groups = group_by_player(find_matches(items, players))
    unpriced = sum(1 for g in groups if g["unpriced"])
    print(f"→ {len(groups)} players with fantasy-relevant news ({unpriced} unpriced)")

    # Report the same frozen snapshot pair load_players() used, so the digest
    # header always matches the board the scores were computed against.
    latest = prior = "unavailable"
    if UD_ADP.exists():
        import csv
        dates = sorted({r["date"] for r in csv.DictReader(UD_ADP.open(encoding="utf-8"))})
        if dates:
            latest, prior = resolve_dates(dates)

    stats = {
        "n_items": len(items),
        "n_players": len(groups),
        "n_unpriced": unpriced,
        "by_source": dict(by_source),
        "adp_latest": latest,
        "adp_prior": prior,
        "nitter": nitter_status(),
    }

    if dry:
        print("\n--- DRY RUN ---")
        for g in groups[:15]:
            p = g["player"]
            flag = "UNPRICED" if g["unpriced"] else "moving"
            adp = "undrafted" if p.adp is None else f"{p.adp:.1f}"
            print(f"{g['score']:6.2f} {p.name:24s} {p.pos:3s} adp={adp:>9s} {flag}")
            print(f"       {', '.join(g['signals'][:5])}")
            print(f"       {g['matches'][0].item.url}")
        return 0

    paths = write_all(groups, adp_context(players), stats)
    print(f"\n✓ {paths['html']}")
    print(f"✓ {paths['md']}")
    print(f"✓ {paths['latest']}  (GitHub Pages entry point)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
