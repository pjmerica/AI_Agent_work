"""Copy the lineup page into the ez-dubs-website repo as a dashboard.

The page is three static files and one constant. Everything that makes it
portable was already true: no framework, no build step, no shared stylesheet to
collide with (every EZ Dubs page inlines its own CSS), and one external API
(Sleeper) that is public and CORS-open.

What this script does:

  1. copies index.html, app.js and style.css into
     dashboards/nfl-lineup/ in the EZ Dubs repo
  2. repoints DATA_DIR from "../nfl-props/" to "data/"
  3. rewrites the links that assume the AI_Agent_Work layout -- Home, and the
     two sibling pages that do not exist over there
  4. drops the EZ Dubs top nav in, copied from an existing dashboard so it
     cannot drift from the others
  5. copies today's data files into dashboards/nfl-lineup/data/

Data freshness is the only ongoing cost, and it is the one part this script does
not solve: it copies a snapshot. For a live page, add a workflow modelled on the
repo's own scripts/pull_pred_arbs.py, which already pulls JSON from another Pages
site on a cron -- the same shape, pointed at
https://pjmerica.github.io/AI_Agent_work/nfl-props/*.json.

Usage:
    py scripts/port_lineup_to_ezdubs.py            # dry run, prints the plan
    py scripts/port_lineup_to_ezdubs.py --write
    py scripts/port_lineup_to_ezdubs.py --write --dest "D:/some/other/repo"
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent
DEFAULT_DEST = Path.home() / "Documents" / "EZ Dubs Website"
SLUG = "nfl-lineup"
TITLE = "NFL Start/Sit"

PAGE_FILES = ["index.html", "app.js", "style.css"]
DATA_FILES = ["weekly.json", "oddsapi.json", "dk_td.json", "gamelines.json",
              "sleeper_players.json", "clay.json", "data.json"]

# An existing dashboard to lift the shared top nav from. The nav is copy-pasted
# per page in this repo rather than templated, so taking it from a sibling is how
# a new page stays consistent with the others.
NAV_DONOR = Path("dashboards") / "arb-calculator" / "index.html"


def lift_nav(dest: Path) -> str | None:
    """The <nav> block from an existing dashboard, with its active state cleared."""
    donor = dest / NAV_DONOR
    if not donor.exists():
        return None
    html = donor.read_text(encoding="utf-8")
    m = re.search(r"[ \t]*<nav class=\"site-nav\">[\s\S]*?</nav>", html)
    if not m:
        return None
    nav = m.group(0)
    # The donor marks its own page current; this one is not that page.
    nav = nav.replace(' class="active"', "").replace(" has-active", "")
    return nav


def port_index(text: str, nav: str | None) -> str:
    """Rewrite links that assume the AI_Agent_Work layout, and add the nav."""
    # Home sits one level deeper here: dashboards/<slug>/ rather than <slug>/.
    text = text.replace('<a href="../" class="back">&larr; Home</a>',
                        '<a href="../../" class="back">&larr; Home</a>')
    # The two sibling pages do not exist in this repo. Say what the page is
    # instead of linking nowhere.
    text = re.sub(
        r"Sister pages: the\s*<a href=\"\.\./nfl-props/\"[^>]*>season draft board</a>\s*"
        r"and\s*<a href=\"\.\./books/\"[^>]*>book-by-book projections</a>\.",
        "Priced off the betting markets.", text, flags=re.S)
    text = text.replace(
        '<a href="../nfl-props/" style="color:#6a6a8a">draft board</a>',
        '<a href="../../" style="color:#6a6a8a">EZ Dubs Analytics</a>')
    # A help paragraph points at this very page on the other site.
    text = re.sub(r'<a href="\.\./lineup/"[^>]*>lineup page</a>', "this page", text)

    if nav:
        # Immediately inside <body>, which is where the other dashboards put it.
        text = re.sub(r"(<body[^>]*>)", r"\1\n" + nav, text, count=1)
    return text


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true",
                    help="actually write; without it this only prints the plan")
    ap.add_argument("--dest", default=str(DEFAULT_DEST))
    args = ap.parse_args()

    dest_repo = Path(args.dest)
    if not dest_repo.exists():
        sys.exit(f"destination repo not found: {dest_repo}")

    out = dest_repo / "dashboards" / SLUG
    data_out = out / "data"

    nav = lift_nav(dest_repo)
    print(f"source:      {SRC / 'lineup'}")
    print(f"destination: {out}")
    print(f"top nav:     {'lifted from ' + str(NAV_DONOR) if nav else 'NOT FOUND -- page will have no nav'}")
    print()

    total = 0
    for f in PAGE_FILES:
        src = SRC / "lineup" / f
        kb = src.stat().st_size / 1024
        total += kb
        print(f"  page   {f:<14} {kb:7.1f} KB")
    for f in DATA_FILES:
        src = SRC / "nfl-props" / f
        if not src.exists():
            print(f"  data   {f:<14} MISSING")
            continue
        kb = src.stat().st_size / 1024
        total += kb
        print(f"  data   {f:<14} {kb:7.1f} KB")
    print(f"\n  {total:.0f} KB total (uncompressed; Pages serves these gzipped)")

    if not args.write:
        print("\nDry run. Re-run with --write to copy.")
        return

    out.mkdir(parents=True, exist_ok=True)
    data_out.mkdir(parents=True, exist_ok=True)

    for f in PAGE_FILES:
        text = (SRC / "lineup" / f).read_text(encoding="utf-8")
        if f == "app.js":
            before = text
            text = text.replace('const DATA_DIR = "../nfl-props/";',
                                'const DATA_DIR = "data/";')
            if text == before:
                sys.exit("DATA_DIR line not found in app.js -- it was renamed; "
                         "fix this script before trusting the port")
        elif f == "index.html":
            text = port_index(text, nav)
        (out / f).write_text(text, encoding="utf-8", newline="\n")

    for f in DATA_FILES:
        src = SRC / "nfl-props" / f
        if src.exists():
            shutil.copy2(src, data_out / f)

    print(f"\nWrote {out}")
    print("\nNext:")
    print(f"  1. open {out / 'index.html'} and check the nav renders")
    print("  2. add the page to the top nav in every other dashboard "
          "(the nav is copy-pasted per page in that repo)")
    print("  3. commit and push -- Pages rebuilds in about a minute")
    print("  4. for live data, add a workflow modelled on "
          "scripts/pull_pred_arbs.py pointed at "
          "https://pjmerica.github.io/AI_Agent_work/nfl-props/*.json")


if __name__ == "__main__":
    main()
