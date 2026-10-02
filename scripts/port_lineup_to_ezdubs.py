"""Port the NFL redraft pages into the ez-dubs-website repo.

Creates two dashboards and rewires the top nav of every page in that repo.

WHAT IT CREATES

    dashboards/nfl-start-sit/      index.html + data/   (opens the Sleeper tab)
    dashboards/nfl-rooting/        index.html           (opens Root For/Against)
    dashboards/nfl-shared/         app.js, style.css    (one copy, both pages)

Both pages load the SAME app.js. They are separate URLs with separate nav
entries, but a single copy of the Sleeper, scoring and projection logic --
duplicating it is how this project got two silent drift bugs in AI_Agent_Work
(see tests/apps_agree.test.js there). Each page just sets
window.LINEUP_DEFAULT_VIEW to pick its opening tab; a URL hash still overrides.

Only nfl-start-sit carries data/. nfl-rooting points DATA_DIR at it, so the
~950 KB of JSON is stored and fetched once.

WHAT IT CHANGES IN THE NAV

    before                        after
    Best Ball (NFL) v             NFL v
      Price Differences             Best Ball >
      History Risers/Fallers          Price Differences
                                      History Risers/Fallers
                                    Redraft/In-Season >
                                      Start/Sit
                                      Root For/Against

The repo's nav is copy-pasted into every page and was single-level, so this adds
a nested-submenu layer: new CSS (a .nav-dd-sub rule set) plus the markup, applied
to every HTML page so they cannot drift apart.

Usage:
    py scripts/port_lineup_to_ezdubs.py                 # dry run
    py scripts/port_lineup_to_ezdubs.py --write
    py scripts/port_lineup_to_ezdubs.py --write --dest "D:/other/repo"
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent
DEFAULT_DEST = Path.home() / "Documents" / "EZ Dubs Website"

SHARED = "nfl-shared"
PAGES = {
    "nfl-start-sit": {
        "title": "NFL Start/Sit",
        "view": "sleeper",
        "nav": "Start/Sit",
        "data": "data/",          # owns the data directory
    },
    "nfl-rooting": {
        "title": "Root For / Against",
        "view": "rooting",
        "nav": "Root For/Against",
        "data": "../nfl-start-sit/data/",   # shares it
    },
}

DATA_FILES = ["weekly.json", "oddsapi.json", "dk_td.json", "gamelines.json",
              "sleeper_players.json", "clay.json", "data.json"]

# Nested-submenu CSS. The repo's nav had one level; this adds a second without
# touching the existing rules, so the current dropdowns behave exactly as before.
SUB_CSS = """
        /* Second-level nav submenu (added for the NFL > Best Ball / Redraft
           split). The first level is unchanged; these rules only apply inside a
           .nav-dd-sub, so existing single-level dropdowns are unaffected. */
        .site-nav .nav-dd-sub { position: relative; }
        .site-nav .nav-dd-sub > .nav-dd-sub-btn {
            display: flex; align-items: center; justify-content: space-between;
            width: 100%; gap: 8px;
            background: none; border: 0; cursor: default;
            padding: 7px 14px; font: inherit; font-size: 0.9rem;
            color: #cfe0f0; text-align: left;
        }
        .site-nav .nav-dd-sub > .nav-dd-sub-btn:hover { background: #1e2d3d; color: #fff; }
        .site-nav .nav-dd-sub > .nav-dd-sub-btn.has-active { color: #4a9eff; }
        .site-nav .nav-dd-sub > .nav-dd-sub-btn .caret { font-size: 0.65rem; opacity: 0.7; }
        .site-nav .nav-dd-sub-menu {
            display: none; position: absolute; top: 0; left: 100%;
            min-width: 210px; flex-direction: column;
            background: #15202b; border: 1px solid #2b3f55; border-radius: 8px;
            padding: 6px 0; z-index: 60;
            box-shadow: 0 10px 24px rgba(0,0,0,0.45);
        }
        .site-nav .nav-dd-sub:hover > .nav-dd-sub-menu,
        .site-nav .nav-dd-sub:focus-within > .nav-dd-sub-menu { display: flex; }
        .site-nav .nav-dd-sub-menu a {
            padding: 7px 14px; font-size: 0.9rem; color: #cfe0f0; text-decoration: none;
        }
        .site-nav .nav-dd-sub-menu a:hover { background: #1e2d3d; color: #fff; }
        .site-nav .nav-dd-sub-menu a.active { color: #4a9eff; background: #1e2d3d; }
        @media (max-width: 760px) {
            /* No room to fly out sideways on a phone: indent in place instead. */
            .site-nav .nav-dd-sub-menu {
                display: flex; position: static; left: auto;
                border: 0; box-shadow: none; background: transparent;
                padding: 0 0 0 14px; min-width: 0;
            }
            .site-nav .nav-dd-sub > .nav-dd-sub-btn { cursor: default; }
        }
"""


def nfl_dropdown(prefix: str, active: str | None) -> str:
    """The NFL dropdown markup. `prefix` reaches dashboards/ from the page."""
    def cls(slug: str) -> str:
        return ' class="active"' if slug == active else ""

    bb_active = active in ("best-ball-prices", "best-ball-history")
    rd_active = active in PAGES
    btn_active = " has-active" if (bb_active or rd_active) else ""
    return f"""            <div class="nav-dd">
                <button type="button" class="nav-dd-btn{btn_active}">NFL <span class="caret">▾</span></button>
                <div class="nav-dd-menu">
                    <div class="nav-dd-sub">
                        <button type="button" class="nav-dd-sub-btn{' has-active' if bb_active else ''}">Best Ball <span class="caret">▸</span></button>
                        <div class="nav-dd-sub-menu">
                            <a href="{prefix}best-ball-prices/"{cls('best-ball-prices')}>Price Differences</a>
                            <a href="{prefix}best-ball-history/"{cls('best-ball-history')}>History Risers/Fallers</a>
                        </div>
                    </div>
                    <div class="nav-dd-sub">
                        <button type="button" class="nav-dd-sub-btn{' has-active' if rd_active else ''}">Redraft/In-Season <span class="caret">▸</span></button>
                        <div class="nav-dd-sub-menu">
                            <a href="{prefix}nfl-start-sit/"{cls('nfl-start-sit')}>Start/Sit</a>
                            <a href="{prefix}nfl-rooting/"{cls('nfl-rooting')}>Root For/Against</a>
                        </div>
                    </div>
                </div>
            </div>"""


def find_nav_dd(html: str, label: str) -> tuple[int, int] | None:
    """Span of the <div class="nav-dd"> whose button text starts with `label`.

    Brace-counted, not regex-matched. The old version ended in a fixed number of
    </div>s, which silently broke when the menu gained a nesting level: it
    consumed three closers where the nested markup has four, leaving an orphan
    </div> on every page. Counting is the only form that survives the markup
    getting deeper.
    """
    for m in re.finditer(r'[ \t]*<div class="nav-dd">', html):
        btn = re.compile(r'<button[^>]*class="nav-dd-btn[^"]*"[^>]*>\s*' +
                         re.escape(label))
        if not btn.match(html, html.find("<button", m.end())):
            # Cheap check that this is the right dropdown before walking it.
            seg = html[m.end():m.end() + 400]
            if label not in seg:
                continue
        i = m.end()
        depth = 1
        while i < len(html):
            nxt_open = html.find("<div", i)
            nxt_close = html.find("</div>", i)
            if nxt_close == -1:
                return None
            if nxt_open != -1 and nxt_open < nxt_close:
                depth += 1
                i = nxt_open + 4
            else:
                depth -= 1
                i = nxt_close + 6
                if depth == 0:
                    return (m.start(), i)
    return None


def rewrite_nav(html: str, prefix: str, active: str | None) -> tuple[str, list[str]]:
    """Swap the Best Ball dropdown for the nested NFL one, and add the CSS."""
    notes: list[str] = []
    if '<nav class="site-nav">' not in html:
        return html, ["no site-nav (skipped)"]

    # "Best Ball (NFL)" on a fresh repo, "NFL" on one already ported -- handling
    # both is what makes a re-run safe.
    span = find_nav_dd(html, "Best Ball (NFL)") or find_nav_dd(html, "NFL")
    if span:
        lo, hi = span
        html = html[:lo] + nfl_dropdown(prefix, active) + html[hi:]
        notes.append("nav rewritten")
    else:
        notes.append("NFL/Best Ball dropdown not found -- CHECK BY HAND")

    if ".nav-dd-sub" not in html:
        # Append to the page's own <style>, which is where all its CSS lives.
        idx = html.rfind("</style>")
        if idx == -1:
            notes.append("no </style> to add submenu CSS to -- CHECK BY HAND")
        else:
            html = html[:idx] + SUB_CSS + html[idx:]
            notes.append("submenu CSS added")
    return html, notes


def lift_nav(dest: Path) -> str | None:
    donor = dest / "dashboards" / "arb-calculator" / "index.html"
    if not donor.exists():
        return None
    m = re.search(r"[ \t]*<nav class=\"site-nav\">[\s\S]*?</nav>",
                  donor.read_text(encoding="utf-8"))
    if not m:
        return None
    return m.group(0).replace(' class="active"', "").replace(" has-active", "")


def lift_style(dest: Path) -> str | None:
    """The donor page's <style> block, so a new page matches the site chrome."""
    donor = dest / "dashboards" / "arb-calculator" / "index.html"
    if not donor.exists():
        return None
    m = re.search(r"<style>[\s\S]*?</style>", donor.read_text(encoding="utf-8"))
    return m.group(0) if m else None


def drop_view(html: str, view: str) -> str:
    """Remove one <div id="{view}-view"> block, matching nested divs properly.

    A regex cannot do this: the view bodies contain dozens of nested <div>s, so
    anything non-greedy stops at the first </div> and anything greedy eats the
    rest of the page.
    """
    start = html.find(f'<div id="{view}-view"')
    if start == -1:
        return html
    # Walk forward counting div open/close from the opening tag.
    i, depth = start, 0
    while i < len(html):
        nxt_open = html.find("<div", i)
        nxt_close = html.find("</div>", i)
        if nxt_close == -1:
            return html                       # malformed; leave it alone
        if nxt_open != -1 and nxt_open < nxt_close:
            depth += 1
            i = nxt_open + 4
        else:
            depth -= 1
            i = nxt_close + 6
            if depth == 0:
                # Take the line's leading whitespace and trailing newline too.
                line_start = html.rfind("\n", 0, start) + 1
                end = i
                if html[end:end + 1] == "\n":
                    end += 1
                return html[:line_start] + html[end:]
    return html


def build_page(slug: str, cfg: dict, nav: str, site_style: str) -> str:
    """One page: site chrome + the lineup markup, pointed at the shared assets."""
    html = (SRC / "lineup" / "index.html").read_text(encoding="utf-8")

    # Drop the in-page tab strip, and the views this page does not show.
    #
    # On AI_Agent_work one page carries all three views and the strip switches
    # them. Here each view has its own URL and nav entry, so a strip beside the
    # nav would be a second control doing the same job. Removing the unused
    # views' markup too keeps each page to what it actually renders -- app.js
    # guards every lookup, so the absent ids are not an error.
    html = re.sub(r'[ \t]*<div class="view-tabs" id="view-tabs">[\s\S]*?</div>\n',
                  "", html, count=1)
    for view in ("sitstart", "sleeper", "rooting"):
        if view == cfg["view"]:
            continue
        html = drop_view(html, view)

    # Shared assets, one directory up.
    html = html.replace('href="style.css', f'href="../{SHARED}/style.css')
    html = html.replace('src="app.js', f'src="../{SHARED}/app.js')

    # Links that assume the AI_Agent_Work layout.
    html = html.replace('<a href="../" class="back">&larr; Home</a>', "")
    html = re.sub(
        r"Sister pages: the\s*<a href=\"\.\./nfl-props/\"[^>]*>season draft board</a>\s*"
        r"and\s*<a href=\"\.\./books/\"[^>]*>book-by-book projections</a>\.",
        "Priced off the betting markets.", html, flags=re.S)
    html = html.replace(
        '<a href="../nfl-props/" style="color:#6a6a8a">draft board</a>',
        '<a href="../../" style="color:#6a6a8a">EZ Dubs Analytics</a>')
    html = re.sub(r'<a href="\.\./lineup/"[^>]*>lineup page</a>', "this page", html)

    html = html.replace("<title>Lineup — market-priced start/sit</title>",
                        f"<title>{cfg['title']} · EZ Dubs Analytics</title>")

    # Site chrome, then this page's own config.
    if site_style:
        html = html.replace("</head>", site_style + "\n</head>", 1)
    cfg_js = (f'  <script>window.LINEUP_DEFAULT_VIEW = "{cfg["view"]}";'
              f' window.LINEUP_DATA_DIR = "{cfg["data"]}";</script>\n')
    html = re.sub(r"(<body[^>]*>)",
                  r"\1\n" + nav + "\n" + cfg_js, html, count=1)
    return html


CLAUDE_NOTE = """
## NFL Redraft/In-Season pages (2026-10-01)

`dashboards/nfl-start-sit/` and `dashboards/nfl-rooting/`, ported from the
`lineup/` page in `pjmerica/AI_Agent_work`. Full detail in
**`dashboards/NFL_REDRAFT.md`** -- read that before changing either page.

Two things that look like mistakes and are not:

- **Both pages load the same `dashboards/nfl-shared/app.js`.** They are two URLs
  serving one application; each only sets `window.LINEUP_DEFAULT_VIEW` to pick its
  opening tab. Do not give each page its own copy -- duplicating that logic is how
  the source repo got two silent drift bugs.
- **Only `nfl-start-sit/` has a `data/` directory.** `nfl-rooting` points at it, so
  the ~950 KB of JSON is stored once.

The data is a **static snapshot** as shipped; nothing refreshes it. For a live
page, add a workflow modelled on `scripts/pull_pred_arbs.py` pointed at
`https://pjmerica.github.io/AI_Agent_work/nfl-props/*.json`.

The nav gained a second level for this (`NFL > Best Ball / Redraft/In-Season`).
Since the nav is copy-pasted per page here, that markup and its `.nav-dd-sub` CSS
are in all eight pages. `port_lineup_to_ezdubs.py` in the source repo rewrites
them all idempotently -- use it rather than hand-editing eight files.
"""


def note_claude(dest: Path) -> None:
    """Add a pointer to the repo's CLAUDE.md, which an agent reads first."""
    f = dest / "CLAUDE.md"
    if not f.exists():
        print("  (no CLAUDE.md to annotate)")
        return
    text = f.read_text(encoding="utf-8")
    if "NFL Redraft/In-Season pages" in text:
        print("  CLAUDE.md already notes these pages")
        return
    # After the "What this is" section, where the page list lives.
    marker = "\n## "
    idx = text.find(marker, text.find("## What this is") + 1)
    if idx == -1:
        text = text.rstrip() + "\n" + CLAUDE_NOTE
    else:
        text = text[:idx] + "\n" + CLAUDE_NOTE.rstrip() + "\n" + text[idx:]
    f.write_text(text, encoding="utf-8", newline="\n")
    print("  annotated CLAUDE.md")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dest", default=str(DEFAULT_DEST))
    args = ap.parse_args()

    dest = Path(args.dest)
    if not dest.exists():
        sys.exit(f"destination repo not found: {dest}")

    nav = lift_nav(dest)
    site_style = lift_style(dest)
    if not nav:
        sys.exit("could not lift the site nav from arb-calculator -- aborting "
                 "rather than shipping a page with no nav")

    pages = sorted((dest / "dashboards").glob("*/index.html"))
    root_pages = [p for p in (dest / "index.html", dest / "contact.html") if p.exists()]

    print(f"destination: {dest}")
    print(f"nav donor:   dashboards/arb-calculator/index.html")
    print()
    print("CREATE")
    print(f"  dashboards/{SHARED}/            app.js, style.css  (shared)")
    for slug, cfg in PAGES.items():
        own = "  + data/" if cfg["data"] == "data/" else "  (shares data)"
        print(f"  dashboards/{slug}/{' ' * (14 - len(slug))} index.html  "
              f"opens {cfg['view']}{own}")
    print()
    print("REWIRE NAV IN")
    for p in root_pages + pages:
        print(f"  {p.relative_to(dest)}")

    if not args.write:
        print("\nDry run. Re-run with --write.")
        return

    # --- shared assets -------------------------------------------------------
    shared = dest / "dashboards" / SHARED
    shared.mkdir(parents=True, exist_ok=True)
    app = (SRC / "lineup" / "app.js").read_text(encoding="utf-8")
    before = app
    app = app.replace('const DATA_DIR = "../nfl-props/";',
                      'const DATA_DIR = window.LINEUP_DATA_DIR || "data/";')
    if app == before:
        sys.exit("DATA_DIR line not found in app.js -- fix this script first")
    (shared / "app.js").write_text(app, encoding="utf-8", newline="\n")
    shutil.copy2(SRC / "lineup" / "style.css", shared / "style.css")

    # --- the two pages -------------------------------------------------------
    for slug, cfg in PAGES.items():
        out = dest / "dashboards" / slug
        out.mkdir(parents=True, exist_ok=True)
        html, _ = rewrite_nav(build_page(slug, cfg, nav, site_style or ""),
                              "../", slug)
        (out / "index.html").write_text(html, encoding="utf-8", newline="\n")
        if cfg["data"] == "data/":
            (out / "data").mkdir(exist_ok=True)
            for f in DATA_FILES:
                src = SRC / "nfl-props" / f
                if src.exists():
                    shutil.copy2(src, out / "data" / f)

    # --- documentation -------------------------------------------------------
    # The destination repo has to explain itself to whoever opens it next, and
    # the two-URLs-one-app arrangement is the part most likely to be "tidied"
    # into two copies by someone who does not know why it is shared.
    doc_src = SRC / "docs" / "ezdubs-nfl-redraft.md"
    if doc_src.exists():
        (dest / "dashboards" / "NFL_REDRAFT.md").write_text(
            doc_src.read_text(encoding="utf-8"), encoding="utf-8", newline="\n")
        print("\n  wrote dashboards/NFL_REDRAFT.md")
    else:
        print(f"\n  WARNING: {doc_src} missing; destination will be undocumented")

    note_claude(dest)

    # --- every other page's nav ---------------------------------------------
    print()
    for p in root_pages:
        html, notes = rewrite_nav(p.read_text(encoding="utf-8"), "dashboards/", None)
        p.write_text(html, encoding="utf-8", newline="\n")
        print(f"  {p.relative_to(dest)}: {', '.join(notes)}")
    for p in pages:
        slug = p.parent.name
        if slug in PAGES or slug == SHARED:
            continue
        html, notes = rewrite_nav(p.read_text(encoding="utf-8"), "../", slug)
        p.write_text(html, encoding="utf-8", newline="\n")
        print(f"  {p.relative_to(dest)}: {', '.join(notes)}")

    print("\nDone. Check dashboards/nfl-start-sit/index.html in a browser, "
          "then commit. dashboards/NFL_REDRAFT.md explains the layout, why "
          "the two pages share one app.js, and how to keep the data fresh.")


if __name__ == "__main__":
    main()
