"""
Scrape Mike Clay's 2026 NFL Projection Guide PDF (free on ESPN CDN), extract
player season stat lines, compute PPR / half-PPR / standard fantasy points,
and write to nfl-props/clay.json.

The PDF has one page per team with a passing/rushing/receiving breakdown.

Requires: pdfplumber (pip install pdfplumber)
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

try:
    import pdfplumber
except ImportError:
    print("ERROR: pdfplumber not installed. pip install pdfplumber", file=sys.stderr)
    sys.exit(1)


PDF_URL = "https://g.espncdn.com/s/ffldraftkit/26/NFLDK2026_CS_ClayProjections2026.pdf"
OUT_FILE = Path(__file__).resolve().parent.parent / "nfl-props" / "clay.json"
TMP_PDF = Path("/tmp/clay_2026.pdf") if Path("/tmp").exists() else Path("clay_2026.pdf")


def download_pdf() -> Path:
    print(f"Downloading PDF from {PDF_URL}…")
    req = Request(PDF_URL, headers={"User-Agent": "clay-projections-scraper/1.0"})
    with urlopen(req, timeout=60) as resp:
        TMP_PDF.write_bytes(resp.read())
    print(f"  Saved to {TMP_PDF} ({TMP_PDF.stat().st_size:,} bytes)")
    return TMP_PDF


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


# ── PDF parsing ───────────────────────────────────────────────────────────────

# Team name regex — Clay's pages are titled with team city/name
TEAM_HEADER_RE = re.compile(r"^(Arizona|Atlanta|Baltimore|Buffalo|Carolina|Chicago|Cincinnati|"
                            r"Cleveland|Dallas|Denver|Detroit|Green Bay|Houston|Indianapolis|"
                            r"Jacksonville|Kansas City|Las Vegas|Los Angeles Chargers|"
                            r"Los Angeles Rams|Miami|Minnesota|New England|New Orleans|"
                            r"New York Giants|New York Jets|Philadelphia|Pittsburgh|"
                            r"San Francisco|Seattle|Tampa Bay|Tennessee|Washington)\b",
                            re.IGNORECASE)

TEAM_ABBR = {
    "Arizona": "ARI", "Atlanta": "ATL", "Baltimore": "BAL", "Buffalo": "BUF",
    "Carolina": "CAR", "Chicago": "CHI", "Cincinnati": "CIN", "Cleveland": "CLE",
    "Dallas": "DAL", "Denver": "DEN", "Detroit": "DET", "Green Bay": "GB",
    "Houston": "HOU", "Indianapolis": "IND", "Jacksonville": "JAX",
    "Kansas City": "KC", "Las Vegas": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami": "MIA", "Minnesota": "MIN",
    "New England": "NE", "New Orleans": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia": "PHI", "Pittsburgh": "PIT",
    "San Francisco": "SF", "Seattle": "SEA", "Tampa Bay": "TB",
    "Tennessee": "TEN", "Washington": "WAS",
}


# Player name pattern: "<First Last> <POS>"
# Sometimes Jr./Sr./III/IV included. Position is QB/RB/WR/TE/FB.
# Followed by 14+ stat columns of integers and decimals.
PLAYER_LINE_RE = re.compile(
    r"^([A-Z][a-zA-Z'\-\.]+(?:\s+[A-Z][a-zA-Z'\-\.]+)+(?:\s+(?:Jr\.?|Sr\.?|II|III|IV|V))?)\s+"
    r"(QB|RB|WR|TE|FB)\s+"
    r"([-\d\.\s]+)$"
)


# Column layouts in Mike Clay's PDF (based on his 2024/2025 format):
# QB header: Player POS GP CMP ATT YDS TD INT RuAtt RuYds RuTD FUM FPTS
# RB header: Player POS GP RuAtt RuYds RuTD Tgt Rec RecYds RecTD FUM FPTS
# WR header: Player POS GP Tgt Rec RecYds RecTD RuAtt RuYds RuTD FUM FPTS
# TE header: Player POS GP Tgt Rec RecYds RecTD RuAtt RuYds RuTD FUM FPTS

def extract_player_stats(name: str, position: str, nums_str: str, team_abbr: str) -> dict | None:
    """Parse trailing numeric columns into a stat dict based on position."""
    nums = nums_str.strip().split()
    try:
        floats = [float(x) for x in nums]
    except ValueError:
        return None

    stats = {
        "pass_yds": 0.0, "pass_tds": 0.0, "pass_ints": 0.0,
        "rush_yds": 0.0, "rush_tds": 0.0,
        "rec_yds": 0.0, "rec_tds": 0.0, "receptions": 0.0,
        "fumbles_lost": 0.0,
    }

    # Need enough columns
    if position == "QB":
        # GP CMP ATT YDS TD INT RuAtt RuYds RuTD FUM FPTS  → 11 cols
        if len(floats) >= 11:
            stats["pass_yds"]     = floats[3]
            stats["pass_tds"]     = floats[4]
            stats["pass_ints"]    = floats[5]
            stats["rush_yds"]     = floats[7]
            stats["rush_tds"]     = floats[8]
            stats["fumbles_lost"] = floats[9]
        else:
            return None
    elif position == "RB":
        # GP RuAtt RuYds RuTD Tgt Rec RecYds RecTD FUM FPTS → 10 cols
        if len(floats) >= 10:
            stats["rush_yds"]     = floats[2]
            stats["rush_tds"]     = floats[3]
            stats["receptions"]   = floats[5]
            stats["rec_yds"]      = floats[6]
            stats["rec_tds"]      = floats[7]
            stats["fumbles_lost"] = floats[8]
        else:
            return None
    elif position in ("WR", "TE"):
        # GP Tgt Rec RecYds RecTD RuAtt RuYds RuTD FUM FPTS → 10 cols
        if len(floats) >= 10:
            stats["receptions"]   = floats[2]
            stats["rec_yds"]      = floats[3]
            stats["rec_tds"]      = floats[4]
            stats["rush_yds"]     = floats[6]
            stats["rush_tds"]     = floats[7]
            stats["fumbles_lost"] = floats[8]
        else:
            return None
    else:
        return None

    return {
        "name": name.strip(),
        "team": team_abbr,
        "position": position,
        "stats": stats,
        "projections": {
            "ppr":      fantasy_points(stats, "ppr"),
            "half":     fantasy_points(stats, "half"),
            "standard": fantasy_points(stats, "standard"),
        },
    }


def parse_pdf(pdf_path: Path) -> list[dict]:
    players = []
    current_team = None

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            for line in text.split("\n"):
                # Update team context if this line is a team name
                m = TEAM_HEADER_RE.match(line.strip())
                if m:
                    team = m.group(1)
                    # Disambiguate "Los Angeles" rare case
                    if team.lower() == "los angeles chargers":
                        current_team = "LAC"
                    elif team.lower() == "los angeles rams":
                        current_team = "LAR"
                    else:
                        current_team = TEAM_ABBR.get(team)
                    continue

                # Try player line
                pm = PLAYER_LINE_RE.match(line.strip())
                if pm and current_team:
                    name = pm.group(1)
                    pos = pm.group(2)
                    nums = pm.group(3)
                    p = extract_player_stats(name, pos, nums, current_team)
                    if p:
                        players.append(p)

    return players


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    pdf_path = download_pdf()
    print("Parsing PDF…")
    players = parse_pdf(pdf_path)
    print(f"  Extracted {len(players)} players")

    # Skip rows with no production
    players = [p for p in players if any(p["stats"].values())]

    # Dedupe by (name, team) — keep highest PPR
    by_key = {}
    for p in players:
        key = (p["name"], p["team"])
        if key not in by_key or p["projections"]["ppr"] > by_key[key]["projections"]["ppr"]:
            by_key[key] = p
    players = list(by_key.values())

    # Sort by PPR
    players.sort(key=lambda p: p["projections"]["ppr"], reverse=True)

    payload = {
        "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": "2026",
        "source": "Mike Clay (ESPN)",
        "playerCount": len(players),
        "players": players,
    }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_FILE} ({len(players)} players)")

    if players[:5]:
        print("Top 5 PPR:")
        for p in players[:5]:
            print(f"  {p['name']:25} {p['position']} {p['team']:3} {p['projections']['ppr']:>6.1f}")


if __name__ == "__main__":
    main()
