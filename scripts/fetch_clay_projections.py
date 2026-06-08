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


# Mike Clay's PDF format: each offense row starts with a position code,
# then the player name (1-4 words), then exactly 16 numeric columns of stats:
#   Gm | Att Comp Yds TD INT Sk (passing) | Att Yds TD (rushing) | Tgt Rec Yd TD (receiving) | Pts Rk
# After the Rk column, the defense column for the same row begins with a
# defensive position code (DI/ED/LB/CB/S) — we stop there.

OFFENSE_POS_PREFIXES = ("QB", "RB", "WR", "TE", "FB")
DEFENSE_POS_PREFIXES = ("DI", "ED", "LB", "CB", "S", "K", "P")

# Skip "Total" rows
def is_total_row(name: str) -> bool:
    return name.strip().lower().startswith("total") or name.strip().lower() == "total"


# Column layouts in Mike Clay's PDF (based on his 2024/2025 format):
# QB header: Player POS GP CMP ATT YDS TD INT RuAtt RuYds RuTD FUM FPTS
# RB header: Player POS GP RuAtt RuYds RuTD Tgt Rec RecYds RecTD FUM FPTS
# WR header: Player POS GP Tgt Rec RecYds RecTD RuAtt RuYds RuTD FUM FPTS
# TE header: Player POS GP Tgt Rec RecYds RecTD RuAtt RuYds RuTD FUM FPTS

def extract_player_stats(name: str, position: str, nums: list[float], team_abbr: str) -> dict | None:
    """Parse the 16 offensive stat columns into a normalized stat dict.

    Column order for ALL offensive positions:
       0=Gm  1=PassAtt  2=PassComp  3=PassYds  4=PassTD  5=PassINT  6=Sk
       7=RuAtt  8=RuYds  9=RuTD
       10=Tgt  11=Rec  12=RecYds  13=RecTD
       14=Pts  15=Rk
    """
    if len(nums) < 16:
        return None

    stats = {
        "pass_yds":      nums[3],
        "pass_tds":      nums[4],
        "pass_ints":     nums[5],
        "rush_yds":      nums[8],
        "rush_tds":      nums[9],
        "receptions":    nums[11],
        "rec_yds":       nums[12],
        "rec_tds":       nums[13],
        "fumbles_lost":  0.0,   # Clay's PDF doesn't break out FUM in this layout
    }

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
        "clay_pts": nums[14],   # Clay's own PPR projection for reference
        "clay_rk":  int(nums[15]),
    }


def parse_offense_line(line: str, current_team: str | None) -> dict | None:
    """Parse a single offense data line. Returns player dict or None.

    Line format:
       <POS> <Player Name> <16 numeric stat cols> <defensive POS> <defensive data...>
    """
    if not current_team:
        return None
    parts = line.split()
    if len(parts) < 18:
        return None
    pos = parts[0]
    if pos not in OFFENSE_POS_PREFIXES:
        return None

    # Walk tokens after the position, collecting the player name (string tokens)
    # then 16 numeric tokens.
    name_tokens: list[str] = []
    nums: list[float] = []
    i = 1
    n = len(parts)

    # First read non-numeric tokens as the name (stop at first float)
    while i < n:
        tok = parts[i]
        if _is_float(tok):
            break
        name_tokens.append(tok)
        i += 1

    if not name_tokens:
        return None

    # Skip "Total" rows
    name = " ".join(name_tokens)
    if is_total_row(name):
        return None

    # Read exactly 16 numeric tokens
    while i < n and len(nums) < 16:
        tok = parts[i]
        if not _is_float(tok):
            return None
        nums.append(float(tok))
        i += 1

    if len(nums) < 16:
        return None

    return extract_player_stats(name, pos, nums, current_team)


def _is_float(tok: str) -> bool:
    if not tok:
        return False
    try:
        float(tok)
        return True
    except ValueError:
        return False


TEAM_PAGE_TITLE_RE = re.compile(r"^2026\s+(.+?)\s+Projections\s*$", re.IGNORECASE)


def parse_pdf(pdf_path: Path) -> list[dict]:
    players = []
    current_team = None

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for line in text.split("\n"):
                stripped = line.strip()

                # Page header: "2026 Buffalo Bills Projections"
                tm = TEAM_PAGE_TITLE_RE.match(stripped)
                if tm:
                    team_name = tm.group(1).strip()
                    # Map "Buffalo Bills" → "Buffalo"
                    for full_name, abbr in TEAM_ABBR.items():
                        if team_name.lower().startswith(full_name.lower()):
                            current_team = abbr
                            break
                    continue

                p = parse_offense_line(stripped, current_team)
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
