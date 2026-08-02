"""Look up any player: current standing plus everything ever archived.

    py scripts/lookup.py "Eli Stowers"     # one player, full history
    py scripts/lookup.py stowers           # fuzzy -- partial names work
    py scripts/lookup.py --news "ACL"      # every archived item matching a phrase

Reads the full archive (archive/*.ndjson), not the capped window the web page
embeds, so this sees the entire recorded history however far back it goes.
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from archive import explain_move, load_all  # noqa: E402
from players import load_players, norm      # noqa: E402


def find_players(query: str, universe: dict) -> list:
    """Fuzzy name match against the full player universe."""
    q = norm(query)
    if not q:
        return []
    exact, partial = [], []
    for p in universe.values():
        n = norm(p.name)
        if n == q:
            exact.append(p)
        elif q in n or all(tok in n for tok in q.split()):
            partial.append(p)
    partial.sort(key=lambda p: (p.adp if p.adp is not None else 999))
    return exact + partial


def show_player(p, rows: list[dict]) -> None:
    adp = "undrafted" if p.adp is None else f"{p.adp:.1f}"
    proj = f" · proj {p.proj:.0f}" if p.proj else ""
    print(f"\n{p.name} — {p.pos} {p.team} · ADP {adp}{proj}")
    if p.adp_move is not None:
        print(f"  ADP move: {p.adp_move:+.1f} ({p.adp_prior} → {p.adp})")

    info = explain_move(p.name, rows)
    if not info.get("found"):
        print("  no archived news yet")
        return

    print(f"  {info['observations']} observation(s): "
          f"{info['first_run']} → {info['last_run']}")

    seen: set[str] = set()
    items: list[tuple[str, dict]] = []
    for r in [x for x in rows if x.get("name") == p.name]:
        for it in r.get("items", []):
            if it["url"] in seen:
                continue
            seen.add(it["url"])
            items.append((r["run"], it))

    if items:
        print(f"\n  news ({len(items)} distinct item(s)):")
        for run, it in items[-12:]:
            print(f"    [{run[:10]}] {it['source']}")
            print(f"      {it['text'][:150]}")
            print(f"      {it['url']}")

    if info.get("changes"):
        print("\n  ADP moves and the news already on record:")
        for c in info["changes"]:
            print(f"    {c['run']}: {c['from']} → {c['to']} ({c['delta']:+.1f})")
            for it in c["preceding_news"][:2]:
                print(f"      - [{it['source']}] {it['text'][:90]}")


def search_news(phrase: str, rows: list[dict]) -> None:
    """Every archived item whose text matches a phrase, newest first."""
    q = phrase.lower()
    hits: list[tuple[str, str, dict]] = []
    seen: set[tuple[str, str]] = set()
    for r in rows:
        for it in r.get("items", []):
            if q not in it.get("text", "").lower():
                continue
            key = (r["name"], it["url"])
            if key in seen:
                continue
            seen.add(key)
            hits.append((r["run"], r["name"], it))
    hits.sort(key=lambda h: h[0], reverse=True)

    print(f"{len(hits)} archived item(s) matching {phrase!r}\n")
    for run, name, it in hits[:25]:
        print(f"[{run[:10]}] {name} — {it['source']}")
        print(f"  {it['text'][:160]}")
        print(f"  {it['url']}\n")


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1

    rows = load_all()
    if not rows:
        print("archive is empty -- it fills in as the digest runs")

    if args[0] == "--news":
        if len(args) < 2:
            print("usage: lookup.py --news \"phrase\"")
            return 1
        search_news(" ".join(args[1:]), rows)
        return 0

    query = " ".join(args)
    universe = load_players()
    matches = find_players(query, universe)

    if not matches:
        print(f"no player matching {query!r} in the {len(universe)}-player universe")
        return 1
    if len(matches) > 8:
        print(f"{len(matches)} matches for {query!r}; showing the 8 highest-drafted")
        matches = matches[:8]

    for p in matches[:8]:
        show_player(p, rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
