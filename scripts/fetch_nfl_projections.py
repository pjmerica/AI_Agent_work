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
        # The LAST header row is the one with the stat labels; FantasyPros puts
        # a grouping row ("PASSING | RUSHING | MISC") above it.
        self.header_rows: list[list[str]] = []

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
            elif self.in_thead and self.cur_row:
                self.header_rows.append(self.cur_row[:])
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
def stat_columns(header: list[str], pos: str) -> dict:
    """Map our stat keys to column indices, using the header labels.

    Indices used to be hardcoded, and FantasyPros inserted a BYE column at
    index 1. Every stat then read one column to its left: passing yards landed
    in pass_tds, so Drake Maye came back with 4142.7 passing touchdowns and a
    projection of 19,415 points. Nothing downstream noticed, because nothing
    downstream knew what a plausible number looked like.

    The labels repeat across stat groups -- ATT, YDS and TDS appear under both
    PASSING and RUSHING -- so position alone is not enough to identify a column.
    What disambiguates them is order: the groups always run passing, then
    rushing, then receiving, in the layout each position uses. So this walks the
    header left to right and assigns each repeated label to the next group in
    that position's sequence.
    """
    # Which stat group each repeated label belongs to, in header order.
    GROUPS = {
        "qb": ["pass", "rush"],
        "rb": ["rush", "rec"],
        "wr": ["rec", "rush"],
        "te": ["rec"],
    }
    # Label -> our key, per group.
    KEYS = {
        "pass": {"YDS": "pass_yds", "TDS": "pass_tds", "INTS": "pass_ints",
                 "INT": "pass_ints"},
        "rush": {"YDS": "rush_yds", "TDS": "rush_tds"},
        "rec": {"YDS": "rec_yds", "TDS": "rec_tds", "REC": "receptions"},
    }
    groups = GROUPS.get(pos, [])
    cols: dict[str, int] = {}
    gi = 0
    seen_in_group: set[str] = set()

    for i, raw in enumerate(header):
        label = raw.strip().upper()
        if label in ("PLAYER", "BYE", ""):
            continue
        if label == "FL":
            cols["fumbles_lost"] = i
            continue
        if label == "FPTS":
            cols["fpts"] = i
            continue
        if label in ("ATT", "CMP"):
            # Attempts and completions are not scored, but ATT marks the start
            # of a new group for every position whose groups begin with it.
            if label == "ATT" and seen_in_group:
                gi += 1
                seen_in_group = set()
            continue
        if gi >= len(groups):
            continue
        group = groups[gi]
        # REC opens the receiving group for RB, where it follows rushing.
        if label == "REC" and group != "rec" and "rec" in groups:
            gi = groups.index("rec")
            group = "rec"
            seen_in_group = set()
        if label in seen_in_group:
            gi += 1
            seen_in_group = set()
            if gi >= len(groups):
                continue
            group = groups[gi]
        key = KEYS.get(group, {}).get(label)
        if key and key not in cols:
            cols[key] = i
            seen_in_group.add(label)
    return cols


# Sanity bounds for a FULL SEASON projection. A layout change shifts columns
# rather than emptying them, so the failure mode is a plausible-looking number
# in the wrong field -- which only a range check catches.
STAT_BOUNDS = {
    "pass_yds": 6000.0, "pass_tds": 70.0, "pass_ints": 40.0,
    "rush_yds": 2500.0, "rush_tds": 35.0,
    "rec_yds": 2500.0, "rec_tds": 35.0, "receptions": 200.0,
    "fumbles_lost": 20.0,
}


def implausible(stats: dict) -> str | None:
    """Return a description of the first out-of-range stat, or None."""
    for key, cap in STAT_BOUNDS.items():
        v = stats.get(key, 0.0)
        if v > cap:
            return f"{key}={v:.1f} exceeds {cap:.0f}"
    return None


def collect_stats(rows: list[list[str]], header: list[str], pos: str) -> list[dict]:
    """Convert raw FantasyPros rows to normalized stat dicts."""
    cols = stat_columns(header, pos)
    if not cols:
        print(f"  {pos.upper()}: could not map any columns from header "
              f"{header!r}", file=sys.stderr)
        return []

    def cell(cells: list[str], key: str) -> float:
        i = cols.get(key)
        if i is None or i >= len(cells):
            return 0.0
        return parse_float(cells[i])

    out = []
    rejected = 0
    for cells in rows:
        if not cells:
            continue
        name, team = extract_name_and_team(cells[0])
        if not name:
            continue

        stats = {
            "pass_yds": cell(cells, "pass_yds"),
            "pass_tds": cell(cells, "pass_tds"),
            "pass_ints": cell(cells, "pass_ints"),
            "rush_yds": cell(cells, "rush_yds"),
            "rush_tds": cell(cells, "rush_tds"),
            "rec_yds": cell(cells, "rec_yds"),
            "rec_tds": cell(cells, "rec_tds"),
            "receptions": cell(cells, "receptions"),
            "fumbles_lost": cell(cells, "fumbles_lost"),
        }

        bad = implausible(stats)
        if bad:
            if rejected == 0:
                print(f"  {pos.upper()}: {name} has {bad} -- column mapping is "
                      f"probably wrong for this layout", file=sys.stderr)
            rejected += 1
            continue

        i = cols.get("fpts")
        fp_consensus = parse_float(cells[i]) if i is not None and i < len(cells) \
            else parse_float(cells[-1])

        out.append({
            "name": name,
            "team": team,
            "position": pos.upper(),
            "stats": stats,
            "fp_consensus": fp_consensus,
        })

    if rejected:
        print(f"  {pos.upper()}: dropped {rejected} rows as implausible",
              file=sys.stderr)
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
    # The stat labels are on the LAST header row; the one above groups them
    # into PASSING / RUSHING / RECEIVING.
    header = parser.header_rows[-1] if parser.header_rows else []
    if not header:
        print(f"  WARNING: no header row for {pos}; cannot map columns")
        return []
    return collect_stats(parser.rows, header, pos)


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
