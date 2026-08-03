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

from analyze import (find_matches, find_players_only,        # noqa: E402
                     group_by_player, watchlist_hits)
from config import (MAX_AGE_HOURS_RSS, RSS_FEEDS,            # noqa: E402
                    TEAM_FEEDS, WATCHLIST, WATCHLIST_ALIASES)
from players import (UD_ADP, adp_context, load_players,      # noqa: E402
                     resolve_dates)
from report import write_all                                 # noqa: E402
from archive import load_all as load_archive                 # noqa: E402
from archive import record_run                               # noqa: E402
from threads import build_threads, load_history, summarize   # noqa: E402
from sources import (collect, collect_all_video,             # noqa: E402
                     collect_highlights, nitter_status)

HANDLES_JSON = Path(__file__).parent.parent / "data" / "handles.json"
WRITERS_JSON = Path(__file__).parent.parent / "data" / "writers.json"


def load_handles() -> list[str]:
    if not HANDLES_JSON.exists():
        print("! data/handles.json missing -- run: py scripts/verify_handles.py")
        return []
    data = json.loads(HANDLES_JSON.read_text(encoding="utf-8"))
    return [h["handle"] for h in data.get("verified", [])]


def load_writers() -> list[str]:
    """Club beat reporters discovered from @32BeatWriters retweets.

    Reading them directly beats reading them through the aggregator: you get
    each reporter's full timeline instead of only the posts it chose to boost.
    The roster grows as discover_writers.py runs -- the aggregator's RSS window
    only ever exposes ~12 authors at a time.
    """
    if not WRITERS_JSON.exists():
        print("! data/writers.json missing -- run: py scripts/discover_writers.py")
        return []
    data = json.loads(WRITERS_JSON.read_text(encoding="utf-8"))
    return [w["handle"] for w in data.get("writers", [])]


def main() -> int:
    dry = "--dry" in sys.argv

    handles = load_handles()
    writers = load_writers()
    feeds = RSS_FEEDS + TEAM_FEEDS
    print(f"→ {len(handles)} Bluesky handles, {len(RSS_FEEDS)} national feeds, "
          f"{len(TEAM_FEEDS)} team blogs, {len(writers)} beat writers on X")

    items = collect(handles, feeds, max_age_hours=MAX_AGE_HOURS_RSS,
                    x_handles=writers)

    # Highlight clips are collected separately and kept out of the news scoring:
    # a viral catch is not a depth-chart signal, and mixing them would let clip
    # volume inflate a player's score.
    highlights = collect_highlights()
    print(f"→ {len(highlights)} highlight clips")
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
    print(f"→ {len(groups)} players with fantasy-relevant news ({unpriced} flat ADP)")

    # Report the same frozen snapshot pair load_players() used, so the digest
    # header always matches the board the scores were computed against.
    latest = prior = "unavailable"
    if UD_ADP.exists():
        import csv
        dates = sorted({r["date"] for r in csv.DictReader(UD_ADP.open(encoding="utf-8"))})
        if dates:
            latest, prior = resolve_dates(dates)

    # Recurring stories, computed from the digests already on disk. Today's
    # payload is written afterwards by write_all(), so this reads prior days
    # plus whatever earlier run happened today -- never a half-written file.
    history = load_history()
    thread_objs = build_threads(history) if len(history) >= 2 else []
    threads = summarize(thread_objs, limit=12)
    if threads:
        print(f"→ {len(thread_objs)} recurring stories across {len(history)} days "
              f"(showing {len(threads)})")
    else:
        print(f"→ no recurring stories yet ({len(history)} day(s) of history; "
              "needs 2+)")

    stats = {
        "n_items": len(items),
        "n_players": len(groups),
        "n_unpriced": unpriced,
        "by_source": dict(by_source),
        "adp_latest": latest,
        "adp_prior": prior,
        "nitter": nitter_status(),
        "history_days": len(history),
    }

    if dry:
        print("\n--- DRY RUN ---")
        for g in groups[:15]:
            p = g["player"]
            flag = "FLAT ADP" if g["unpriced"] else "moved"
            adp = "undrafted" if p.adp is None else f"{p.adp:.1f}"
            print(f"{g['score']:6.2f} {p.name:24s} {p.pos:3s} adp={adp:>9s} {flag}")
            print(f"       {', '.join(g['signals'][:5])}")
            print(f"       {g['matches'][0].item.url}")
        return 0

    # Append-only record of this run, written before the digest so a rendering
    # failure cannot cost us the history.
    arch_path, arch_n = record_run(groups, stats)
    print(f"→ archived {arch_n} rows to {arch_path.name}")

    # Read back after appending so the embedded search index includes this run.
    archive_rows = load_archive()

    # Attach clips to players by name so the highlights section can label them.
    # Watchlist gets everything -- news, plus ALL video rather than only clips
    # that clear the play gate. watchlist_hits() dedupes by URL, so the overlap
    # with `highlights` costs nothing.
    all_video = collect_all_video()
    watch = watchlist_hits(items + highlights + all_video, players,
                           WATCHLIST, WATCHLIST_ALIASES)
    if watch:
        tot = sum(w["n"] for w in watch)
        print(f"→ watchlist: {tot} mentions across {len(watch)} players")

    hl_matches = find_players_only(highlights, players) if highlights else []
    hl_by_player: dict[str, list] = {}
    for m in hl_matches:
        hl_by_player.setdefault(m.player.name, []).append(m)

    paths = write_all(groups, adp_context(players), stats, threads,
                      all_players=players, archive_rows=archive_rows,
                      highlights=highlights, hl_by_player=hl_by_player,
                      watch=watch)
    print(f"\n✓ {paths['html']}")
    print(f"✓ {paths['md']}")
    print(f"✓ {paths['latest']}  (GitHub Pages entry point)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
