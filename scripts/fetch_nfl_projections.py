"""
Scrape FantasyPros consensus season projections for QB/RB/WR/TE, compute
PPR / half-PPR / standard fantasy points from raw stat lines, and write to
nfl-props/data.json.

No API key needed — FantasyPros draft-projection pages are publicly accessible.

Usage:
    python scripts/fetch_nfl_projections.py
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

POSITIONS = ["qb", "rb", "wr", "te"]
URL_TEMPLATE = "https://www.fantasypros.com/nfl/projections/{pos}.php?week=draft"

OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "data.json"

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


class ProjectionsTableParser(HTMLParser):
    """Pull the #data table out of a FantasyPros projections page.

    Output: self.rows is a list of lists — each inner list is the raw cell
    text in column order. The first cell is always the Player cell.
    Keeping positional (not dict-keyed) because FP repeats header labels
    like ATT/YDS/TDS across passing AND rushing groups.
    """

    def __init__(self):
        super().__init__()
        self.in_target_table = False
        self.in_thead = False
        self.in_tbody = False
        self.in_tr = False
        self.in_th = False
        self.in_td = False
        self.cur_row: list[str] = []
        self.cur_cell: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "table" and d.get("id") == "data":
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
        elif tag == "th":
            self.in_th = True
            self.cur_cell = []
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
        elif tag == "th":
            if self.in_thead:
                self.cur_row.append("".join(self.cur_cell).strip())
            self.in_th = False
        elif tag == "td":
            if self.in_tbody:
                self.cur_row.append("".join(self.cur_cell).strip())
            self.in_td = False

    def handle_data(self, data):
        if self.in_th or self.in_td:
            self.cur_cell.append(data)


# ── Stat extraction ───────────────────────────────────────────────────────────


def parse_float(s: str) -> float:
    if not s:
        return 0.0
    s = s.replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def extract_name_and_team(player_cell: str) -> tuple[str, str]:
    """FantasyPros player cell is like 'Josh Allen BUF' or 'Joe Burrow CIN'.
    The HTML often joins the name and team with no separator after stripping tags."""
    txt = re.sub(r"\s+", " ", player_cell).strip()
    # Trailing 2-3 letter team abbreviation
    m = re.match(r"^(.*?)([A-Z]{2,3})$", txt)
    if m:
        return m.group(1).strip(), m.group(2)
    return txt, ""


# Column lookup: each position has its own column layout.
# We map *which raw header label* contains each stat.
# FantasyPros sometimes uses identical column headers (e.g. ATT for passing AND rushing)
# so we have to dedupe by position in the header row.
def collect_stats(rows: list[list[str]], pos: str) -> list[dict]:
    """Convert raw FantasyPros rows (positional) to normalized stat dicts.

    Column layouts (Player is always cell[0]):
      QB:   Player | ATT CMP YDS TDS INTS | ATT YDS TDS | FL | FPTS
      RB:   Player | ATT YDS TDS | REC YDS TDS | FL | FPTS
      WR:   Player | REC YDS TDS | ATT YDS TDS | FL | FPTS
      TE:   Player | REC YDS TDS | FL | FPTS
    """
    out = []
    for cells in rows:
        if not cells:
            continue
        player_raw = cells[0]
        name, team = extract_name_and_team(player_raw)
        if not name:
            continue

        stats = {
            "pass_yds": 0.0, "pass_tds": 0.0, "pass_ints": 0.0,
            "rush_yds": 0.0, "rush_tds": 0.0,
            "rec_yds": 0.0, "rec_tds": 0.0, "receptions": 0.0,
            "fumbles_lost": 0.0,
        }
        fp_consensus = parse_float(cells[-1]) if len(cells) > 1 else 0.0

        if pos == "qb":
            # Indices: 1 ATT, 2 CMP, 3 pass YDS, 4 pass TDS, 5 INTS,
            #          6 ATT, 7 rush YDS, 8 rush TDS, 9 FL, 10 FPTS
            if len(cells) >= 11:
                stats["pass_yds"]     = parse_float(cells[3])
                stats["pass_tds"]     = parse_float(cells[4])
                stats["pass_ints"]    = parse_float(cells[5])
                stats["rush_yds"]     = parse_float(cells[7])
                stats["rush_tds"]     = parse_float(cells[8])
                stats["fumbles_lost"] = parse_float(cells[9])

        elif pos == "rb":
            # 1 ATT, 2 rush YDS, 3 rush TDS, 4 REC, 5 rec YDS, 6 rec TDS, 7 FL, 8 FPTS
            if len(cells) >= 9:
                stats["rush_yds"]     = parse_float(cells[2])
                stats["rush_tds"]     = parse_float(cells[3])
                stats["receptions"]   = parse_float(cells[4])
                stats["rec_yds"]      = parse_float(cells[5])
                stats["rec_tds"]      = parse_float(cells[6])
                stats["fumbles_lost"] = parse_float(cells[7])

        elif pos == "wr":
            # 1 REC, 2 rec YDS, 3 rec TDS, 4 ATT, 5 rush YDS, 6 rush TDS, 7 FL, 8 FPTS
            if len(cells) >= 9:
                stats["receptions"]   = parse_float(cells[1])
                stats["rec_yds"]      = parse_float(cells[2])
                stats["rec_tds"]      = parse_float(cells[3])
                stats["rush_yds"]     = parse_float(cells[5])
                stats["rush_tds"]     = parse_float(cells[6])
                stats["fumbles_lost"] = parse_float(cells[7])

        elif pos == "te":
            # 1 REC, 2 rec YDS, 3 rec TDS, 4 FL, 5 FPTS
            if len(cells) >= 6:
                stats["receptions"]   = parse_float(cells[1])
                stats["rec_yds"]      = parse_float(cells[2])
                stats["rec_tds"]      = parse_float(cells[3])
                stats["fumbles_lost"] = parse_float(cells[4])

        out.append({
            "name": name,
            "team": team,
            "position": pos.upper(),
            "stats": stats,
            "fp_consensus": fp_consensus,
        })
    return out


# ── Fantasy scoring ───────────────────────────────────────────────────────────

def fantasy_points(stats: dict, fmt: str) -> float:
    """Compute season-long projected fantasy points from a stat dict.
    Standard scoring:
        0.04/passing yd, 4/passing TD, -2/INT, -2/fumble lost
        0.1/rushing yd,  6/rushing TD
        0.1/receiving yd, 6/receiving TD
        receptions: 1.0 PPR, 0.5 half, 0 standard
    """
    pts = 0.0
    pts += stats["pass_yds"]      * 0.04
    pts += stats["pass_tds"]      * 4
    pts += stats["pass_ints"]     * -2
    pts += stats["rush_yds"]      * 0.1
    pts += stats["rush_tds"]      * 6
    pts += stats["rec_yds"]       * 0.1
    pts += stats["rec_tds"]       * 6
    pts += stats["fumbles_lost"]  * -2
    if fmt == "ppr":
        pts += stats["receptions"] * 1.0
    elif fmt == "half":
        pts += stats["receptions"] * 0.5
    return round(pts, 2)


# ── Main ──────────────────────────────────────────────────────────────────────


def fetch_position(pos: str) -> list[dict]:
    url = URL_TEMPLATE.format(pos=pos)
    print(f"  Fetching {pos.upper()}: {url}")
    html = http_get(url)
    parser = ProjectionsTableParser()
    parser.feed(html)
    if not parser.rows:
        print(f"  WARNING: no rows parsed for {pos}")
        return []
    return collect_stats(parser.rows, pos)


def main():
    print("Scraping FantasyPros consensus projections…")
    all_players = []
    for pos in POSITIONS:
        try:
            players = fetch_position(pos)
            print(f"    {len(players)} {pos.upper()}s")
            all_players.extend(players)
        except Exception as e:
            print(f"  ERROR fetching {pos}: {e}", file=sys.stderr)
        time.sleep(1.0)  # gentle pacing

    # Compute fantasy points
    output_players = []
    for p in all_players:
        if not any(p["stats"].values()):
            continue  # skip blank rows
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
            "fp_consensus": p["fp_consensus"],
        })

    # Sort by PPR descending
    output_players.sort(key=lambda x: x["projections"]["ppr"], reverse=True)

    payload = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": "2026",
        "source": "FantasyPros consensus",
        "playerCount": len(output_players),
        "players": output_players,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_FILE} ({len(output_players)} players)")


if __name__ == "__main__":
    main()
