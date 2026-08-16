"""Build nfl-props/adp.json from the Underdog ADP history CSV.

Source: EZ Dubs Website/dashboards/best-ball-prices/ud_adp_history.csv
        (columns: date,name,pos,team,adp,source)

The CSV is a full history -- ~150k rows of dated snapshots -- but the props page
only needs today's board, so we collapse it to the newest ADP per player.

Two wrinkles inherited from the nfl-beat pipeline, kept deliberately:

  - Some dates carry BOTH a 'manual' and an 'auto' pull. 'auto' is the full
    board (~1372 rows) vs 'manual' (~295) and the two disagree by up to 12 ADP
    points, so within a single date we prefer 'auto'. Picking wrong invents
    movement that never happened.
  - Team is stored as a full club name in early snapshots ("Atlanta Falcons")
    and as an abbreviation later ("DAL"). We pass it through untouched; the
    props page joins on player name, not team.
"""
from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path

DOCS = Path.home() / "Documents"
UD_ADP = Path(os.environ.get("UD_ADP_PATH") or
              DOCS / "EZ Dubs Website/dashboards/best-ball-prices/ud_adp_history.csv")
OUT = Path(__file__).resolve().parent.parent / "nfl-props" / "adp.json"

SOURCE_PRIORITY = {"auto": 2, "manual": 1}


def main() -> None:
    if not UD_ADP.exists():
        raise SystemExit(f"ADP history not found: {UD_ADP}")

    # name -> (date, source_priority, row). Keep the newest date; break ties on
    # the same date by source priority.
    best: dict[str, tuple[str, int, dict]] = {}

    with UD_ADP.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            name = (row.get("name") or "").strip()
            if not name:
                continue
            try:
                adp = float(row["adp"])
            except (TypeError, ValueError, KeyError):
                continue

            date = (row.get("date") or "").strip()
            prio = SOURCE_PRIORITY.get((row.get("source") or "").strip(), 0)
            key = (date, prio)

            prev = best.get(name)
            if prev is None or key > (prev[0], prev[1]):
                best[name] = (date, prio, {
                    "name": name,
                    "pos": (row.get("pos") or "").strip(),
                    "team": (row.get("team") or "").strip(),
                    "adp": adp,
                    "date": date,
                })

    players = sorted((v[2] for v in best.values()), key=lambda p: p["adp"])
    as_of = max((p["date"] for p in players), default=None)

    OUT.write_text(json.dumps({
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "asOf": as_of,
        "source": "Underdog ADP",
        "playerCount": len(players),
        "players": players,
    }, indent=2), encoding="utf-8")

    print(f"wrote {OUT} -- {len(players)} players, board as of {as_of}")


if __name__ == "__main__":
    main()
