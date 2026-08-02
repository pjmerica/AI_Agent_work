"""Append-only archive of every run, so news can later be tied to ADP moves.

The dated files in digests/ are overwritten by each of the three daily runs.
That is fine for "what does today look like" but destroys the record needed to
answer "what news preceded this player's ADP dropping 22 picks?" -- the morning
report that caused an afternoon move is gone by evening.

This module writes one immutable NDJSON line per player per run into
archive/YYYY-MM.ndjson. Appending keeps writes cheap and the file greppable;
monthly sharding keeps any single file manageable.

    py scripts/archive.py                  # summary of what is stored
    py scripts/archive.py "Ricky Pearsall" # timeline for one player
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ARCHIVE = Path(__file__).parent.parent / "archive"


def _shard(ts: datetime) -> Path:
    return ARCHIVE / f"{ts:%Y-%m}.ndjson"


def record_run(groups, stats, run_ts: datetime | None = None) -> tuple[Path, int]:
    """Append one line per player with news. Returns (path, lines_written).

    Every line is self-contained -- player, ADP at the time, the signals that
    fired, and the sourced items -- so the archive can be replayed without
    needing any other file.
    """
    ts = run_ts or datetime.now(timezone.utc)
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    path = _shard(ts)

    run_id = ts.strftime("%Y-%m-%dT%H:%M")
    n = 0
    with path.open("a", encoding="utf-8") as fh:
        for g in groups:
            p = g["player"]
            row = {
                "run": run_id,
                "date": ts.strftime("%Y-%m-%d"),
                "hour": ts.hour,
                "name": p.name,
                "pos": p.pos,
                "team": p.team,
                "adp": p.adp,
                "adp_prior": p.adp_prior,
                "adp_move": p.adp_move,
                "adp_as_of": stats.get("adp_latest"),
                "score": g["score"],
                "flat": g["unpriced"],
                "signals": g["signals"],
                "items": [{"text": m.item.text[:280], "url": m.item.url,
                           "source": m.item.source} for m in g["matches"]],
            }
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    return path, n


def load_all(months: int = 6) -> list[dict]:
    """Read recent shards, oldest first, de-duplicated.

    Git union-merges these files (see .gitattributes) so two runs racing keep
    both sets of appended lines. That can leave an exact duplicate when a run is
    retried, so (run, name) is treated as the unique key.
    """
    if not ARCHIVE.exists():
        return []
    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for f in sorted(ARCHIVE.glob("*.ndjson"))[-months:]:
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue  # never let one bad line kill the history
            key = (row.get("run", ""), row.get("name", ""))
            if key in seen:
                continue
            seen.add(key)
            rows.append(row)
    return rows


def player_timeline(name: str, rows: list[dict] | None = None) -> list[dict]:
    """Every recorded observation of one player, chronological."""
    rows = rows if rows is not None else load_all()
    key = name.lower().strip()
    hits = [r for r in rows if r.get("name", "").lower() == key]
    hits.sort(key=lambda r: r.get("run", ""))
    return hits


def explain_move(name: str, rows: list[dict] | None = None) -> dict:
    """Tie a player's ADP change to the news that preceded it.

    Returns the observed ADP path plus, for each change, the items that were
    already in the archive when the move showed up.
    """
    tl = player_timeline(name, rows)
    if not tl:
        return {"player": name, "found": False}

    path = []
    changes = []
    prev_adp = None
    for r in tl:
        adp = r.get("adp")
        path.append({"run": r["run"], "adp": adp, "score": r.get("score")})
        if prev_adp is not None and adp is not None and abs(adp - prev_adp) >= 1.0:
            # News recorded at or before this run is the candidate cause.
            prior_items = []
            for earlier in tl:
                if earlier["run"] > r["run"]:
                    break
                prior_items.extend(earlier.get("items", []))
            seen, uniq = set(), []
            for it in reversed(prior_items):        # newest first
                if it["url"] in seen:
                    continue
                seen.add(it["url"])
                uniq.append(it)
            changes.append({
                "run": r["run"],
                "from": prev_adp, "to": adp,
                "delta": round(prev_adp - adp, 1),   # positive = rising
                "signals": r.get("signals", []),
                "preceding_news": uniq[:5],
            })
        if adp is not None:
            prev_adp = adp

    return {"player": name, "found": True, "observations": len(tl),
            "first_run": tl[0]["run"], "last_run": tl[-1]["run"],
            "adp_path": path, "changes": changes}


def summary(rows: list[dict] | None = None) -> dict:
    rows = rows if rows is not None else load_all()
    runs = sorted({r.get("run", "") for r in rows})
    players = {r.get("name", "") for r in rows}
    by_day = defaultdict(set)
    for r in rows:
        by_day[r.get("date", "")].add(r.get("run", ""))
    return {"rows": len(rows), "runs": len(runs), "players": len(players),
            "first_run": runs[0] if runs else None,
            "last_run": runs[-1] if runs else None,
            "runs_per_day": {d: len(v) for d, v in sorted(by_day.items())}}


if __name__ == "__main__":
    data = load_all()
    if not data:
        print("archive is empty -- it fills in as the digest runs")
        raise SystemExit(0)

    if len(sys.argv) > 1:
        name = " ".join(sys.argv[1:])
        info = explain_move(name, data)
        if not info["found"]:
            print(f"no archive entries for {name!r}")
            raise SystemExit(1)
        print(f"{info['player']} — {info['observations']} observations "
              f"({info['first_run']} → {info['last_run']})\n")
        print("ADP path:")
        for pt in info["adp_path"]:
            print(f"  {pt['run']}  ADP {pt['adp']}  (score {pt['score']})")
        if info["changes"]:
            print("\nmoves and the news that preceded them:")
            for c in info["changes"]:
                print(f"\n  {c['run']}: {c['from']} → {c['to']} ({c['delta']:+.1f})")
                print(f"  signals: {', '.join(c['signals'][:5])}")
                for it in c["preceding_news"][:3]:
                    print(f"    - [{it['source']}] {it['text'][:90]}")
        else:
            print("\nno ADP changes recorded yet")
    else:
        s = summary(data)
        print(f"{s['rows']} rows | {s['runs']} runs | {s['players']} players")
        print(f"{s['first_run']} → {s['last_run']}")
        print("\nruns per day:")
        for d, n in s["runs_per_day"].items():
            print(f"  {d}  {n}")
