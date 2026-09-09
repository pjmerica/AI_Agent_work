"""Pull the owner's Sleeper leagues and rosters into nfl-props/sleeper.json.

Sleeper's read API is public and CORS-open, so the page could in principle call
it directly. It does not, for one reason: resolving a roster's player IDs to
names requires /v1/players/nfl, which is a 14.6 MB document. Downloading that in
the browser to look up ~30 names would dominate page load. So this script does
the join server-side and ships a small file with names already attached.

Roster shape is read from each league rather than assumed. The four leagues here
are not the same game: one is 0.5 PPR, two are full PPR, one is a superflex
best-ball with a 0.5 TE premium and four flex slots. A lineup optimizer that
hardcoded QB/RB/RB/WR/WR/TE/FLEX/FLEX would be wrong for half of them.

Kickers and defenses are kept in the roster listing but flagged, since no player
prop market prices them -- they are a real part of the lineup that this tool
cannot help with, which is worth showing rather than hiding.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "sleeper.json"

API = "https://api.sleeper.app/v1"
USERNAME = os.environ.get("SLEEPER_USERNAME", "pjmerica")
SEASON = os.environ.get("SLEEPER_SEASON", "2026")

# Positions no market prices. Kept on the roster, excluded from projections.
UNPRICED_POS = {"K", "DEF", "DST"}


def get_json(url: str):
    req = Request(url, headers={"User-Agent": "nfl-props/1.0", "Accept": "application/json"})
    try:
        with urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} for {url}") from None
    except URLError as e:
        raise RuntimeError(f"network error: {e}") from None


def main() -> None:
    print(f"Looking up Sleeper user {USERNAME!r}...")
    user = get_json(f"{API}/user/{USERNAME}")
    if not isinstance(user, dict) or not user.get("user_id"):
        print(f"ERROR: no such Sleeper user {USERNAME!r}", file=sys.stderr)
        sys.exit(1)
    uid = user["user_id"]
    print(f"  user_id {uid} ({user.get('display_name')})")

    leagues = get_json(f"{API}/user/{uid}/leagues/nfl/{SEASON}") or []
    if not leagues:
        print(f"No {SEASON} leagues for this user.", file=sys.stderr)
        sys.exit(1)
    print(f"  {len(leagues)} league(s) in {SEASON}")

    print("Fetching player dictionary (~15 MB, once)...")
    players = get_json(f"{API}/players/nfl")
    print(f"  {len(players)} players")

    out_leagues = []
    for lg in leagues:
        lid = lg.get("league_id")
        try:
            rosters = get_json(f"{API}/league/{lid}/rosters")
        except RuntimeError as e:
            print(f"  {lg.get('name')}: {e}")
            continue
        mine = next((r for r in rosters if r.get("owner_id") == uid), None)
        if not mine:
            print(f"  {lg.get('name')}: no roster owned by this user")
            continue

        starters = set(mine.get("starters") or [])
        roster = []
        for pid in (mine.get("players") or []):
            p = players.get(pid) or {}
            pos = p.get("position")
            name = p.get("full_name") or " ".join(
                x for x in (p.get("first_name"), p.get("last_name")) if x) or str(pid)
            roster.append({
                "name": name,
                "position": pos,
                "team": p.get("team"),
                "starter": pid in starters,
                "unpriced": pos in UNPRICED_POS,
                "injury": p.get("injury_status") or None,
            })
        roster.sort(key=lambda r: (not r["starter"], r["position"] or "ZZ", r["name"]))

        sc = lg.get("scoring_settings") or {}
        slots = [s for s in (lg.get("roster_positions") or []) if s != "BN"]
        out_leagues.append({
            "leagueId": lid,
            "name": lg.get("name"),
            "teams": lg.get("total_rosters"),
            "status": lg.get("status"),
            # The page needs these to score and to build the right lineup.
            "slots": slots,
            "scoring": {
                "rec": sc.get("rec", 0),
                "passTd": sc.get("pass_td", 4),
                "bonusRecTe": sc.get("bonus_rec_te", 0),
            },
            "roster": roster,
        })
        print(f"  {str(lg.get('name'))[:32]:<32} {len(roster)} players, "
              f"{len(slots)} starting slots, rec={sc.get('rec', 0)}")

    OUT_FILE.write_text(json.dumps({
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": SEASON,
        "username": USERNAME,
        "userId": uid,
        "note": ("Rosters resolved server-side: Sleeper's player dictionary is "
                 "14.6 MB, far too heavy to download in the browser just to turn "
                 "roster IDs into names. Kickers and defenses are included but "
                 "flagged unpriced -- no player prop market covers them."),
        "leagueCount": len(out_leagues),
        "leagues": out_leagues,
    }, indent=2), encoding="utf-8")

    print(f"\nWrote {OUT_FILE}")
    print(f"  {len(out_leagues)} league(s)")


if __name__ == "__main__":
    main()
