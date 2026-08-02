"""Discover club beat reporters by mining @32BeatWriters retweets.

The aggregator's RSS window is only ~20 items, so any single poll shows a small
rotating slice of the reporters it boosts. This script polls repeatedly,
accumulates every distinct author it sees, verifies each has a live nitter feed,
and writes the roster to data/writers.json.

Following these reporters directly is strictly better than reading them through
the aggregator: you get their whole timeline (practice notes, depth-chart
changes) rather than only the posts someone chose to retweet.

    py scripts/discover_writers.py            # merge into existing roster
    py scripts/discover_writers.py --polls 20 # dig harder for rare authors
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from sources import NITTER_HANDLES, _author_from_url, nitter_feed  # noqa: E402

OUT = Path(__file__).parent.parent / "data" / "writers.json"

# Aggregators and brand accounts: useful to read, but they are not club beat
# reporters, so they do not belong in the discovered roster.
NOT_A_BEAT_WRITER = {
    "32beatwriters", "espnnfl", "nfl", "nflfantasy", "rotoworld_fb",
    "fantasypros", "underdognfl", "pff", "sleeperhq", "nofnetwork",
    "adamschefter", "rapsheet", "tompelissero", "mikegarafolo", "fieldyates",
}

SEED_AGGREGATORS = ["32BeatWriters"]


def harvest(polls: int, delay: float) -> dict[str, int]:
    """Poll the aggregators and count how often each author appears."""
    seen: dict[str, int] = {}
    for i in range(polls):
        for agg in SEED_AGGREGATORS:
            for item in nitter_feed(agg):
                author = _author_from_url(item.url)
                if author and author.lower() not in NOT_A_BEAT_WRITER:
                    seen[author] = seen.get(author, 0) + 1
        print(f"  poll {i + 1}/{polls}: {len(seen)} distinct authors so far")
        if i < polls - 1:
            time.sleep(delay)
    return seen


def verify(handle: str) -> tuple[str, int, int]:
    """Return (handle, total_items, fresh_items) for a candidate's own feed."""
    items = nitter_feed(handle)
    return handle, len(items), len([i for i in items if i.age_hours < 96])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--polls", type=int, default=8)
    ap.add_argument("--delay", type=float, default=20.0,
                    help="seconds between polls; the feed only turns over slowly")
    ap.add_argument("--fresh", action="store_true",
                    help="discard the existing roster instead of merging")
    args = ap.parse_args()

    print(f"harvesting @{'/@'.join(SEED_AGGREGATORS)} over {args.polls} polls...")
    counts = harvest(args.polls, args.delay)
    if not counts:
        print("! no authors found -- is the nitter instance up?")
        return 1

    print(f"\nverifying {len(counts)} candidate feeds...")
    live: list[dict] = []
    dead: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        for handle, total, fresh in ex.map(verify, sorted(counts)):
            if total:
                live.append({"handle": handle, "seen": counts[handle],
                             "items": total, "fresh": fresh})
                print(f"  OK   @{handle:24s} {total:3d} items, {fresh:3d} fresh")
            else:
                dead.append(handle)
                print(f"  DEAD @{handle}")

    if not args.fresh and OUT.exists():
        prior = json.loads(OUT.read_text(encoding="utf-8")).get("writers", [])
        known = {w["handle"] for w in live}
        for w in prior:
            if w["handle"] not in known:
                live.append(w)   # keep reporters who were quiet this round

    live.sort(key=lambda w: (-w.get("seen", 0), w["handle"].lower()))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(
        {"discovered_from": SEED_AGGREGATORS, "writers": live, "unreachable": dead},
        indent=2), encoding="utf-8")

    print(f"\n{len(live)} beat writers -> {OUT}")
    print(f"({len(dead)} unreachable, {len(NITTER_HANDLES)} national accounts "
          "stay configured separately in sources.py)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
