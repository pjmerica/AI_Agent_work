"""Probe candidate Bluesky handles and write the ones that actually resolve.

Run this occasionally to refresh data/handles.json. Handles below MIN_FOLLOWERS
are rejected -- that filter exists because impostor accounts squat on the names
of insiders who are not on Bluesky (verified case: 'adamschefter.bsky.social',
~4.6k followers, not the real Schefter).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sources import verify_handle  # noqa: E402

MIN_FOLLOWERS = 8000

CANDIDATES = [
    # National insiders / analysts
    "rapsheet.bsky.social", "fieldyates.bsky.social", "minakimes.bsky.social",
    "mattharmon.bsky.social", "gregauman.bsky.social", "alberbreer.bsky.social",
    "benvolin.bsky.social", "mikesando.bsky.social", "nateatkins.bsky.social",
    "danielpopper.bsky.social", "joneslarrylin.bsky.social",
    # Fantasy-specific. Note: handles here are often non-obvious -- Nathan Jahnke
    # is 'ffnatejahnke', not any 'nathanjahnke' variant. Found via searchActors.
    "ffnatejahnke.bsky.social", "matthewberrytmr.bsky.social",
    "lateroundqb.bsky.social",
    # Probed 2026-08-02 and not on Bluesky (search returns unrelated people):
    # Hayden Winks, Graham Barfield, Ian Hartitz, Dwain McFarland, Jake Ciely.
    # Beat writers
    "zackrosenblatt.bsky.social", "jourdanrodrigue.bsky.social",
    "dianarussini.bsky.social", "michaelsilver.bsky.social",
    "joshtolentino.bsky.social", "mikedefabo.bsky.social",
    "sethwalder.bsky.social", "kevinseifert.bsky.social",
    "dmarcusnfl.bsky.social", "aaronwilson.bsky.social",
]

OUT = Path(__file__).parent.parent / "data" / "handles.json"


def search(display_name: str, limit: int = 8) -> list[dict]:
    """Find candidate handles by display name.

    Exists because handles rarely match names: Nathan Jahnke is
    'ffnatejahnke.bsky.social'. Usage: py verify_handles.py search "Nathan Jahnke"
    """
    import json as _json
    import urllib.parse
    import urllib.request
    url = ("https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors"
           f"?q={urllib.parse.quote(display_name)}&limit={limit}")
    req = urllib.request.Request(url, headers={"User-Agent": "nfl-beat-digest/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            actors = _json.load(r).get("actors", [])
    except Exception as e:
        print(f"  search failed: {e}")
        return []
    out = []
    for a in actors:
        info = verify_handle(a["handle"]) or {}
        time.sleep(0.2)
        out.append({"handle": a["handle"], "displayName": a.get("displayName", ""),
                    "followers": info.get("followers", 0)})
    return out


def main() -> None:
    good, weak, missing = [], [], []
    for h in CANDIDATES:
        info = verify_handle(h)
        time.sleep(0.25)
        if info is None:
            missing.append(h)
            print(f"  MISSING  {h}")
        elif info["followers"] < MIN_FOLLOWERS:
            weak.append(info)
            print(f"  LOW      {info['handle']:34s} {info['followers']:>8,}  (possible impostor)")
        else:
            good.append(info)
            print(f"  OK       {info['handle']:34s} {info['followers']:>8,}  {info['displayName']}")

    good.sort(key=lambda d: -d["followers"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "min_followers": MIN_FOLLOWERS,
        "verified": good,
        "rejected_low_followers": weak,
        "unresolved": missing,
    }, indent=2), encoding="utf-8")

    print(f"\n{len(good)} verified -> {OUT}")
    print(f"{len(weak)} rejected (low followers), {len(missing)} unresolved")


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "search":
        query = " ".join(sys.argv[2:])
        print(f'searching "{query}":')
        for c in search(query):
            print(f"  {c['handle']:36s} {c['followers']:>8,}  {c['displayName']}")
    else:
        main()
