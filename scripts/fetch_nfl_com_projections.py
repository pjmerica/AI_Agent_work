"""
Scrape NFL.com Fantasy season-long projections for QB/RB/WR/TE, compute
PPR / half-PPR / standard fantasy points, and write to nfl-props/nflcom.json.

NFL.com Fantasy projection pages are public HTML (no login). Paginated 25 rows
per page via &offset=. Position filter uses position=1..4 (QB/RB/WR/TE).

Usage:
    python scripts/fetch_nfl_com_projections.py
"""

from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "nflcom.json"

POSITIONS = {
    "QB": 1,
    "RB": 2,
    "WR": 3,
    "TE": 4,
}

SEASON = 2026
PAGE_SIZE = 25
MAX_PAGES_PER_POS = 12  # 12 * 25 = 300 max per position, more than enough

URL_TEMPLATE = (
    "https://fantasy.nfl.com/research/projections"
    "?position={pos_id}&statCategory=projectedStats"
    "&statSeason={season}&statType=seasonProjectedStats"
    "&offset={offset}"
)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def http_get(url: str) -> str:
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    try:
        with urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except HTTPError as e:
        print(f"  HTTP {e.code} for {url}", file=sys.stderr)
        raise
    except URLError as e:
        print(f"  URL error: {e}", file=sys.stderr)
        raise


# ── HTML parsing ──────────────────────────────────────────────────────────────


class NFLComTableParser(HTMLParser):
    """Extract <table id="tabletoplayers"> rows from a projections page.

    NFL.com player cells contain rich HTML — we collapse all text in each <td>
    to a single string, then post-process.
    """

    def __init__(self):
        super().__init__()
        self.in_target_table = False
        self.in_thead = False
        self.in_tbody = False
        self.in_tr = False
        self.in_td = False
        self.cur_row: list[str] = []
        self.cur_cell: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "table" and d.get("class", "").startswith("tableType-player"):
            self.in_target_table = True
        if not self.in_target_table:
            return
        if tag == "thead":
            self.in_thead = True
        elif tag == "tbody":
            self.in_tbody = True
        elif tag == "tr":
            self.in_tr = True
            self.cur_row = []
        elif tag == "td":
            self.in_td = True
            self.cur_cell = []

    def handle_endtag(self, tag):
        if not self.in_target_table:
            return
        if tag == "table":
            self.in_target_table = False
        elif tag == "thead":
            self.in_thead = False
        elif tag == "tbody":
            self.in_tbody = False
        elif tag == "tr":
            self.in_tr = False
            if self.in_tbody and self.cur_row:
                self.rows.append(self.cur_row[:])
        elif tag == "td":
            if self.in_tbody:
                cell_text = "".join(self.cur_cell)
                # Collapse whitespace
                cell_text = re.sub(r"\s+", " ", cell_text).strip()
                self.cur_row.append(cell_text)
            self.in_td = False

    def handle_data(self, data):
        if self.in_td:
            self.cur_cell.append(data)


# ── Per-row processing ────────────────────────────────────────────────────────


# Player cell is rendered like: "Josh Allen QB - BUF View News Add Note"
# or shorter "Bijan Robinson RB - ATL".
# We want name + team abbr (2-3 letters).
PLAYER_CELL_RE = re.compile(
    r"^(?P<name>.+?)\s+(?:QB|RB|WR|TE)\s+-\s+(?P<team>[A-Z]{2,3})"
)


def parse_player_cell(cell: str) -> tuple[str, str] | None:
    m = PLAYER_CELL_RE.match(cell)
    if not m:
        return None
    return m.group("name").strip(), m.group("team").strip()


def parse_float_safe(s: str) -> float:
    s = (s or "").replace(",", "").strip()
    if s in ("", "-", "--"):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


# Column layout (after the Player cell):
# 0: Opp
# 1: GP
# 2: Pass Yds, 3: Pass TD, 4: Int
# 5: Rush Yds, 6: Rush TD
# 7: Rec, 8: Rec Yds, 9: Rec TD
# 10: Ret TD
# 11: Fum TD
# 12: 2PT
# 13: Lost (fumbles lost)
# 14: Points
def row_to_player(row: list[str], position: str) -> dict | None:
    if len(row) < 15:
        return None
    name_team = parse_player_cell(row[0])
    if not name_team:
        return None
    name, team = name_team

    stats = {
        "pass_yds":     parse_float_safe(row[3]) if len(row) > 3 else 0.0,
        "pass_tds":     parse_float_safe(row[4]) if len(row) > 4 else 0.0,
        "pass_ints":    parse_float_safe(row[5]) if len(row) > 5 else 0.0,
        "rush_yds":     parse_float_safe(row[6]) if len(row) > 6 else 0.0,
        "rush_tds":     parse_float_safe(row[7]) if len(row) > 7 else 0.0,
        "receptions":   parse_float_safe(row[8]) if len(row) > 8 else 0.0,
        "rec_yds":      parse_float_safe(row[9]) if len(row) > 9 else 0.0,
        "rec_tds":      parse_float_safe(row[10]) if len(row) > 10 else 0.0,
        "fumbles_lost": parse_float_safe(row[14]) if len(row) > 14 else 0.0,
    }

    return {
        "name": name,
        "team": team,
        "position": position,
        "stats": stats,
    }


# ── Fantasy scoring ───────────────────────────────────────────────────────────

def fantasy_points(stats: dict, fmt: str) -> float:
    pts = 0.0
    pts += stats.get("pass_yds", 0)      * 0.04
    pts += stats.get("pass_tds", 0)      * 4
    pts += stats.get("pass_ints", 0)     * -2
    pts += stats.get("rush_yds", 0)      * 0.1
    pts += stats.get("rush_tds", 0)      * 6
    pts += stats.get("rec_yds", 0)       * 0.1
    pts += stats.get("rec_tds", 0)       * 6
    pts += stats.get("fumbles_lost", 0)  * -2
    if fmt == "ppr":
        pts += stats.get("receptions", 0) * 1.0
    elif fmt == "half":
        pts += stats.get("receptions", 0) * 0.5
    return round(pts, 2)


# ── Main ──────────────────────────────────────────────────────────────────────


def fetch_position(position: str, pos_id: int) -> list[dict]:
    print(f"  Fetching {position}…")
    results: list[dict] = []
    seen_keys: set[str] = set()

    for page in range(MAX_PAGES_PER_POS):
        offset = page * PAGE_SIZE + 1  # NFL.com offsets are 1-indexed (1, 26, 51, ...)
        url = URL_TEMPLATE.format(pos_id=pos_id, season=SEASON, offset=offset)
        try:
            html = http_get(url)
        except Exception as e:
            print(f"    page {page+1} failed: {e}", file=sys.stderr)
            break

        parser = NFLComTableParser()
        parser.feed(html)

        if not parser.rows:
            break

        new_count = 0
        for row in parser.rows:
            p = row_to_player(row, position)
            if not p:
                continue
            key = f"{p['name']}|{p['team']}"
            if key in seen_keys:
                continue
            seen_keys.add(key)
            results.append(p)
            new_count += 1

        if new_count == 0:
            break  # ran out of rows
        time.sleep(0.7)  # gentle pacing

    print(f"    {len(results)} {position}s")
    return results


def main():
    print("Scraping NFL.com Fantasy season projections…")
    all_players: list[dict] = []
    for position, pos_id in POSITIONS.items():
        try:
            all_players.extend(fetch_position(position, pos_id))
        except Exception as e:
            print(f"  ERROR fetching {position}: {e}", file=sys.stderr)

    output_players = []
    for p in all_players:
        if not any(p["stats"].values()):
            continue
        output_players.append({
            "name": p["name"],
            "team": p["team"],
            "position": p["position"],
            "stats": p["stats"],
            "projections": {
                "ppr":      fantasy_points(p["stats"], "ppr"),
                "half":     fantasy_points(p["stats"], "half"),
                "standard": fantasy_points(p["stats"], "standard"),
            },
        })

    output_players.sort(key=lambda p: p["projections"]["ppr"], reverse=True)

    payload = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": str(SEASON),
        "source": "NFL.com Fantasy",
        "playerCount": len(output_players),
        "players": output_players,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_FILE} ({len(output_players)} players)")

    if output_players[:5]:
        print("Top 5 PPR:")
        for p in output_players[:5]:
            print(f"  {p['name']:25} {p['position']} {p['team']:4} {p['projections']['ppr']:>6.1f}")


if __name__ == "__main__":
    main()
