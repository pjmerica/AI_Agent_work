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

    Output: self.rows is a list of dicts keyed by header label, with raw cell text.
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
        self.headers: list[str] = []
        self.header_rows_seen = 0
        # FantasyPros uses a two-row header (grouped categories above column labels)
        # We only want the LAST header row before tbody.
        self.last_header_row: list[str] = []
        self.rows: list[dict] = []

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
            self.headers = self.last_header_row
        elif tag == "tbody":
            self.in_tbody = False
        elif tag == "tr":
            self.in_tr = False
            if self.in_thead:
                # Track last header row seen
                if self.cur_row:
                    self.last_header_row = self.cur_row[:]
            elif self.in_tbody:
                if self.cur_row and self.headers:
                    # If row is shorter than headers, pad
                    while len(self.cur_row) < len(self.headers):
                        self.cur_row.append("")
                    record = dict(zip(self.headers, self.cur_row))
                    self.rows.append(record)
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
def collect_stats(rows: list[dict], pos: str) -> list[dict]:
    """Convert raw FantasyPros rows to a normalized stat dict per player.

    Normalized keys:
      pass_yds, pass_tds, pass_ints
      rush_yds, rush_tds
      rec_yds, rec_tds, receptions
      fumbles_lost
    """
    out = []
    for row in rows:
        player_raw = row.get("Player", "")
        name, team = extract_name_and_team(player_raw)
        if not name:
            continue

        stats = {
            "pass_yds": 0.0, "pass_tds": 0.0, "pass_ints": 0.0,
            "rush_yds": 0.0, "rush_tds": 0.0,
            "rec_yds": 0.0, "rec_tds": 0.0, "receptions": 0.0,
            "fumbles_lost": 0.0,
        }

        # Headers across positions:
        # QB:   Player | ATT(pass) CMP YDS(pass) TDS(pass) INTS | ATT(rush) YDS(rush) TDS(rush) | FL | FPTS
        # RB:   Player | ATT YDS TDS | REC YDS TDS | FL | FPTS
        # WR:   Player | REC YDS TDS | ATT YDS TDS | FL | FPTS
        # TE:   Player | REC YDS TDS | FL | FPTS
        # Because some headers repeat, we use the COLUMN ORDER not header dict.

        # Reconstruct ordered cell values:
        ordered = list(row.values())
        # The first item is Player. Strip it.
        if not ordered:
            continue
        cells = ordered[1:]  # drop Player col
        # Drop the trailing FPTS col for safety (we recompute it)
        # Actually keep it as 'fp_fantasypros' for reference
        fp_consensus = parse_float(cells[-1]) if cells else 0.0

        if pos == "qb":
            # passing: ATT(0), CMP(1), YDS(2), TDS(3), INTS(4)
            # rushing: ATT(5), YDS(6), TDS(7)
            # FL(8), FPTS(9)
            if len(cells) >= 10:
                stats["pass_yds"]  = parse_float(cells[2])
                stats["pass_tds"]  = parse_float(cells[3])
                stats["pass_ints"] = parse_float(cells[4])
                stats["rush_yds"]  = parse_float(cells[6])
                stats["rush_tds"]  = parse_float(cells[7])
                stats["fumbles_lost"] = parse_float(cells[8])

        elif pos == "rb":
            # rushing: ATT(0), YDS(1), TDS(2)
            # receiving: REC(3), YDS(4), TDS(5)
            # FL(6), FPTS(7)
            if len(cells) >= 8:
                stats["rush_yds"]   = parse_float(cells[1])
                stats["rush_tds"]   = parse_float(cells[2])
                stats["receptions"] = parse_float(cells[3])
                stats["rec_yds"]    = parse_float(cells[4])
                stats["rec_tds"]    = parse_float(cells[5])
                stats["fumbles_lost"] = parse_float(cells[6])

        elif pos == "wr":
            # receiving: REC(0), YDS(1), TDS(2)
            # rushing:   ATT(3), YDS(4), TDS(5)
            # FL(6), FPTS(7)
            if len(cells) >= 8:
                stats["receptions"] = parse_float(cells[0])
                stats["rec_yds"]    = parse_float(cells[1])
                stats["rec_tds"]    = parse_float(cells[2])
                stats["rush_yds"]   = parse_float(cells[4])
                stats["rush_tds"]   = parse_float(cells[5])
                stats["fumbles_lost"] = parse_float(cells[6])

        elif pos == "te":
            # receiving: REC(0), YDS(1), TDS(2)
            # FL(3), FPTS(4)
            if len(cells) >= 5:
                stats["receptions"] = parse_float(cells[0])
                stats["rec_yds"]    = parse_float(cells[1])
                stats["rec_tds"]    = parse_float(cells[2])
                stats["fumbles_lost"] = parse_float(cells[3])

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
