"""scripts/write_if_changed.py: timestamp-only rewrites and collapsed scrapes.

clay.json and data.json were rewritten every run although only lastUpdated
changed, and an empty FantasyPros scrape overwrote data.json with no players
(2026-10-21). These pin both guards.

Run: py tests/write_if_changed.test.py
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from write_if_changed import refuse_collapse, write_json_if_changed  # noqa: E402

failed = 0


def check(label, cond, detail=""):
    global failed
    failed += not cond
    print(f"  {'ok  ' if cond else 'FAIL'}  {label}" + ("" if cond else f"  [{detail}]"))


f = Path(tempfile.mkdtemp()) / "x.json"
check("writes a new file", write_json_if_changed(f, {"lastUpdated": "t1", "players": [1, 2]}))
check("skips a timestamp-only change",
      not write_json_if_changed(f, {"lastUpdated": "t2", "players": [1, 2]}))
check("...and keeps the old timestamp", json.loads(f.read_text())["lastUpdated"] == "t1")
check("writes a real change", write_json_if_changed(f, {"lastUpdated": "t3", "players": [1, 2, 3]}))
check("...with the new timestamp", json.loads(f.read_text())["lastUpdated"] == "t3")

check("refuses an empty scrape", refuse_collapse(f, {"players": []}) is not None)
check("refuses a collapse below half", refuse_collapse(f, {"players": [1]}) is not None)
check("accepts a normal scrape", refuse_collapse(f, {"players": [1, 2]}) is None)
check("accepts anything when there is no file yet",
      refuse_collapse(f.with_name("none.json"), {"players": [1]}) is None)

print(f"\n{'all passed' if not failed else f'{failed} failed'}")
sys.exit(1 if failed else 0)
