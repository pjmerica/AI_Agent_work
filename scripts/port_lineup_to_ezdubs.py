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
import hashlib
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
        "h1": "NFL Start/Sit",
        # {week} becomes the <span id="week-label"> that app.js fills in.
        "subtitle": "Start/sit and waiver calls for {week}, priced off the "
                    "betting markets instead of projections.",
        "description": "Who to start this week, priced off betting markets "
                       "instead of projections. Reads your Sleeper leagues.",
    },
    "nfl-rooting": {
        "title": "Root For / Against",
        "view": "rooting",
        "nav": "Root For/Against",
        "data": "../nfl-start-sit/data/",   # shares it
        "h1": "Root For / Against",
        "subtitle": "Which players to cheer for and against across all your "
                    "Sleeper leagues, for {week}.",
        "description": "Which players to root for and against across every one "
                       "of your Sleeper leagues, priced off betting markets.",
    },
}

SITE = "https://ezdubsanalytics.com"

# The <head> tags every other EZ Dubs page carries. These pages are rebuilt from
# lineup/index.html on every port and carry_head_metas() keeps only
# <meta http-equiv>, so tags added by hand in the destination were reverted.
# Without them a shared link showed a bare title with no description or image,
# and browsers 404'd on /favicon.ico. (2026-10-14)
HEAD_TMPL = """
  <meta name="description" content="{description}" />
  <link rel="icon" href="/EDA.png" type="image/png" />
  <meta property="og:title" content="{title} | EZ Dubs Analytics" />
  <meta property="og:description" content="{description}" />
  <meta property="og:url" content="{site}/dashboards/{slug}/" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="{site}/EDA.png" />
  <meta name="twitter:card" content="summary" />"""

# dk_td.json is not ported: the lineup stopped reading it on 2026-10-26.
DATA_FILES = ["weekly.json", "oddsapi.json", "gamelines.json",
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
                <button type="button" class="nav-dd-btn{btn_active}">NFL <span class="caret" aria-hidden="true">▾</span></button>
                <div class="nav-dd-menu">
                    <div class="nav-dd-sub">
                        <button type="button" class="nav-dd-sub-btn{' has-active' if bb_active else ''}">Best Ball <span class="caret" aria-hidden="true">▸</span></button>
                        <div class="nav-dd-sub-menu">
                            <a href="{prefix}best-ball-prices/"{cls('best-ball-prices')}>Price Differences</a>
                            <a href="{prefix}best-ball-history/"{cls('best-ball-history')}>History Risers/Fallers</a>
                        </div>
                    </div>
                    <div class="nav-dd-sub">
                        <button type="button" class="nav-dd-sub-btn{' has-active' if rd_active else ''}">Redraft/In-Season <span class="caret" aria-hidden="true">▸</span></button>
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

    # Since 2026-10-19 the nav CSS, submenu included, lives in the destination's
    # shared assets/site.css rather than in each page. The submenu's classes
    # appear in the markup as class="nav-dd-sub" (no dot), so without the
    # second test this would paste SUB_CSS back into all eight pages.
    if ".nav-dd-sub" not in html and "assets/site.css" not in html:
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
    nav = m.group(0).replace(' class="active"', "").replace(" has-active", "")
    # Repair carets missing aria-hidden before this nav is copied to every page.
    #
    # This script rewrites the donor page BEFORE lifting the nav from it, so a
    # caret built without the attribute propagates to all eight pages. That
    # happened on 2026-10-10: 24 carets lost aria-hidden and each page dropped
    # from four marked carets to one. The caret is decoration beside a text label
    # that is itself the control, so marking it hidden is what stops a screen
    # reader announcing a bare glyph.
    nav = re.sub(r'<span class="caret">', '<span class="caret" aria-hidden="true">', nav)
    return nav


def lift_footer(dest: Path) -> str:
    """The donor page's site footer. Same depth as the NFL pages, so its
    relative links are right for them as they are."""
    donor = dest / "dashboards" / "arb-calculator" / "index.html"
    if not donor.exists():
        return ""
    m = re.search(r'[ \t]*<footer class="site-footer">[\s\S]*?</footer>',
                  donor.read_text(encoding="utf-8"))
    return m.group(0) if m else ""


# The NFL pages carry the lineup template's stylesheet, which is built for
# AI_Agent_work's own page. Three things in it fight the EZ Dubs chrome
# (2026-10-20):
#  - body { padding: 40px 20px } pushed the site nav 40px down and in from the
#    edges, so it was the only page whose nav was not flush;
#  - its accent is AI_Agent_work's purple (now remapped by SITE_THEME); the
#    active buttons keep white text from the template, which fails on the blue,
#    so they get the site's dark text;
#  - a generic .caret colour reached the site nav's dropdown carets.
#
# Since the "Box Score" redesign (2026-10-26) the site is a light newsprint
# page, so this block also sets the page's type: condensed capitals for the
# heading and the buttons, serif body, square corners. The colours come from the
# tokens in the destination's assets/site.css, which these pages link.
NFL_SITE_CSS = """<style>
  /* EZ Dubs chrome for the NFL pages; added by port_lineup_to_ezdubs.py. */
  body { padding: 0; font-family: var(--serif); background: var(--paper); color: var(--ink); }
  .container { padding: 36px 24px 0; }
  header h1 {
    font-family: var(--display); font-weight: 800; text-transform: uppercase;
    font-size: clamp(2.4rem, 5vw, 3.4rem); line-height: 0.98; margin: 0 0 10px; color: var(--ink);
  }
  header .subtitle { color: var(--ink-2); font-size: 1.1rem; line-height: 1.55; margin-bottom: 22px; }
  /* The verdict panels: a rule above, no box. Kept here on purpose since only
     the calculator's body and footer rules are lifted (chrome_rules). */
  .verdict { background: transparent; border: 0; border-top: 2px solid var(--rule);
             border-radius: 0; padding: 14px 0; margin-bottom: 14px; }
  /* Callouts lose the left-border box: rules above and below instead. */
  .callout { background: transparent; border: 0; border-top: 1px solid var(--rule);
             border-bottom: 1px solid var(--rule); border-radius: 0; padding: 12px 0;
             color: var(--ink-2); font-size: 0.95rem; }
  .callout strong { color: var(--ink); }
  .callout-error { border-color: var(--red); color: var(--red); }
  @media (max-width: 720px) {
    body { padding: 0; }
    .container { padding: 24px 16px 0; }
  }
  .site-nav .caret { color: inherit; }
  .fmt-btn, .chip, .view-tab, .source-tab {
    font-family: var(--display); font-weight: 700; font-size: 1rem;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  .fmt-btn.active, .chip.active, .view-tab.active, .source-tab.active {
    background: var(--ink); border-color: var(--ink); color: var(--paper);
  }
  .chip:hover, .player-tag:hover, #search:focus, #roster-input:focus,
  #roster-search:focus, .h2h-picker input:focus, .roster-paste textarea:focus {
    border-color: var(--red);
  }
  .delta-toggle input, .market-toggles input, .book-toggle-list input { accent-color: var(--ink); }
  /* The template's 13px checkboxes are a small target on a phone. */
  .market-toggles input[type="checkbox"], .book-toggle-list input[type="checkbox"] { width: 18px; height: 18px; }
  table { font-variant-numeric: tabular-nums; }
  .sources-note { font-family: var(--mono); color: var(--muted); font-size: 0.72rem; text-align: center; margin: 4px 0 8px; }
  /* Small uppercase labels are mono on every other page; the template sets
     them in the body face, which here is the serif. */
  .rankings thead th, .sitstart-label, .slot-table th, .sitstart-section,
  .h2h-card-sub, .matchup-league { font-family: var(--mono); letter-spacing: 0.04em; }
  /* The template's bare footer rule centres its text; the site footer is left-aligned. */
  .site-footer { text-align: left; font-size: 0.75rem; }
  /* The template fades settled rows and dropped stats with opacity, which takes
     every colour in them below AA: axe found 68 failures on a signed-in lineup
     (2026-10-27; the old navy theme had 58 of the same). Muted ink at full
     opacity reads as settled and still passes. */
  .locked-row, tr.row-nan, .stat-off { opacity: 1; }
  .locked-row td, .locked-row .player-name, tr.row-nan td, .stat-off { color: var(--muted); }
  .locked-row .slot-badge, .locked-row .pos-badge { background: transparent; border: 1px solid currentColor; }
  /* Source Serif sets wider than the old system font, so at 390px a settled
     lineup ran 25px past its scroll box (383 in 358). Tighter cells win it back. */
  @media (max-width: 600px) {
    .slot-table th, .slot-table td { padding-left: 8px; padding-right: 8px; }
  }
</style>"""


# The lineup stylesheet is AI_Agent_work's design: purple accent, near-black
# panels, lavender greys. The port writes a copy with every colour swapped for
# the EZ Dubs "Box Score" palette (2026-10-26; before that it was swapped for
# the old navy theme). That palette is light, so this is an inversion, not a
# tint: dark panels become paper, light text becomes ink, and the bright
# green/red/amber that read on near-black become the darker shades that read
# on paper. Every text colour here passes AA on the paper and the panel shade:
# the weakest is the amber, 5.0:1 on #e9e4d8. The values match the tokens in
# the destination's assets/site.css.
PAPER, PANEL, SUNK = "#f3f0e8", "#efebe1", "#e9e4d8"
INK, INK2, MUTED = "#1a1a1a", "#3a3833", "#4a4740"
RULE, RULE_FAINT = "#8a8478", "#cfc8b8"
RED, GREEN, AMBER, BLUE = "#b3261e", "#1d6b3a", "#865400", "#1f4e8c"
SITE_THEME = {
    # page, panels and surfaces
    "#0f0f13": PAPER, "#14141c": PANEL, "#15151f": PANEL, "#1a1a24": SUNK,
    "#1c1c2b": SUNK, "#1e1e2e": SUNK, "#21212e": SUNK, "#23232f": SUNK,
    # borders
    "#2e2e42": RULE, "#33334d": RULE, "#3a3a4e": RULE, "#2a2a40": RULE,
    "#1f1f2c": RULE_FAINT, "#22223a": RULE_FAINT,
    # the purple accent fills active buttons (white text on it): ink.
    # Its lighter tints are text: red, the site's one accent.
    "#5b4cf5": INK, "#8f84ff": RED, "#9b8cff": RED, "#b9aeff": RED, "#c9c4ff": RED,
    # light text -> ink; lavender greys -> the muted and second inks
    "#fff": INK, "#ffffff": INK, "#f0f0f8": INK, "#f0f0f5": INK, "#e2e2f0": INK,
    "#d8d8e8": INK2, "#d4d4e8": INK2, "#c8c8dc": INK2, "#c9c9dd": INK2,
    "#b8b8cc": INK2, "#b4b4d0": INK2, "#b8c2cf": INK2, "#aab4bf": INK2, "#cdd8e6": INK2,
    "#a0a0c0": MUTED, "#9a9ab0": MUTED, "#9ca0bd": MUTED, "#8a8aa8": MUTED,
    "#9a9ab8": MUTED, "#a0a0bc": MUTED, "#a8a8c0": MUTED, "#8a97a5": MUTED, "#95a5a6": MUTED,
    # semantic colours, darkened to read on paper
    "#58d68d": GREEN, "#7fd6a0": GREEN, "#5fae7d": GREEN, "#2e7d4f": GREEN, "#3fa96a": GREEN,
    "#eafff2": PAPER,
    "#ff6b6b": RED, "#ff9b9b": RED, "#e8a0a0": RED, "#f0c4c4": RED, "#ffc9c9": RED, "#ff8f8f": RED,
    "#f5b041": AMBER, "#e0c98a": AMBER, "#e8d5b0": AMBER, "#ddd0bb": AMBER, "#6b5326": AMBER,
    "#2a2218": "#efe4c8",
    "#78aaff": BLUE, "#5dade2": BLUE, "#a9c4ee": BLUE, "#bcd3f5": BLUE, "#9cc0f0": BLUE,
}

# Translucent rgba() tints (panel washes, focus glows, badge fills), by their
# base colour. Each keeps its alpha; the base becomes the matching palette
# colour, so a 0.08 purple wash becomes a 0.08 ink wash on paper.
RGBA_THEME = {
    (91, 76, 245): (26, 26, 26),                                     # purple accent -> ink
    (46, 204, 113): (29, 107, 58), (88, 214, 141): (29, 107, 58),    # greens
    (255, 107, 107): (179, 38, 30), (231, 76, 60): (179, 38, 30),    # reds
    (232, 106, 92): (179, 38, 30),
    (245, 176, 65): (134, 84, 0), (243, 156, 18): (134, 84, 0),      # ambers
    (52, 152, 219): (31, 78, 140), (120, 170, 255): (31, 78, 140),   # blues
    (108, 122, 137): (74, 71, 64), (160, 170, 190): (74, 71, 64),    # greys
    (143, 168, 200): (74, 71, 64),
}


def retheme_css(css: str) -> str:
    # 3-digit hex too: the template has #fff on dark panels, which would be
    # invisible on paper if it were left alone.
    out = re.sub(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b",
                 lambda m: SITE_THEME.get(m.group(0).lower(), m.group(0)), css)

    def rgba(m: re.Match) -> str:
        base = tuple(int(v) for v in m.group(1, 2, 3))
        r, g, b = RGBA_THEME.get(base, base)
        return f"rgba({r}, {g}, {b},"
    out = re.sub(r"rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,", rgba, out)
    # Square corners, as on the rest of the site. Circles (50%) stay round.
    out = re.sub(r"border-radius:\s*(?!50%)[^;]+;", "border-radius: 0;", out)
    return ("/* Re-themed for EZ Dubs by scripts/port_lineup_to_ezdubs.py (SITE_THEME);\n"
            "   the source is AI_Agent_work's lineup/style.css. */\n" + out)


def lift_style(dest: Path) -> str | None:
    """The donor page's site-chrome styles, so a new page matches the site.

    Since 2026-10-19 that is two things: the link to the shared
    assets/site.css (reset, nav, submenu), then the page's own <style>. The link
    must come too, or the NFL pages would be rebuilt with no nav styles at all.
    The donor sits at the same depth as the NFL pages (dashboards/<slug>/), so
    its relative href is right for them as is.
    """
    donor = dest / "dashboards" / "arb-calculator" / "index.html"
    if not donor.exists():
        return None
    text = donor.read_text(encoding="utf-8")
    m = re.search(r"<style>([\s\S]*?)</style>", text)
    if not m:
        return None
    link = re.search(r'<link rel="stylesheet" href="([^"]*assets/site\.css[^"]*)">', text)
    return ((f'<link rel="stylesheet" href="{link.group(1)}">\n' if link else "")
            + "<style>\n" + chrome_rules(m.group(1)) + "\n    </style>")


# Only these donor rules are site chrome. Until 2026-10-22 the calculator's
# whole <style> came across, ~180 lines of it the calculator itself, and some
# of its class names are lineup's too: its .verdict box (border, padding,
# background) restyled every lineup verdict.
CHROME_SELECTOR = re.compile(r"^\s*(body|\.site-footer)\b")


def chrome_rules(css: str) -> str:
    """The rules in `css` whose selectors are all site chrome (body, footer).

    Walks top-level blocks by brace depth; an @media block keeps only its
    chrome rules and is dropped if none are left. Comments are dropped.
    """
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j == -1:
            break
        head = re.sub(r"/\*[\s\S]*?\*/", "", css[i:j]).strip()
        depth, k = 1, j + 1
        while k < n and depth:
            depth += {"{": 1, "}": -1}.get(css[k], 0)
            k += 1
        body = css[j + 1:k - 1]
        if head.startswith("@media"):
            inner = chrome_rules(body)
            if inner.strip():
                out.append(f"        {head} {{\n{inner}\n        }}")
        elif all(CHROME_SELECTOR.match(sel) for sel in head.split(",")):
            out.append(f"        {head} {{{body}}}")
        i = k
    return "\n".join(out)


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


def asset_version(*paths: Path) -> str:
    """Cache-bust tag from the content of the shared assets.

    lineup/index.html hard-codes ?v=2026-10-01-tdonly, and app.js and style.css
    changed four times after that without the tag moving, so a browser holding
    an old copy had nothing telling it to refetch. A content hash moves exactly
    when the files do, and a re-run with nothing changed leaves it alone.
    """
    h = hashlib.sha256()
    for p in paths:
        h.update(p.read_bytes().replace(b"\r\n", b"\n"))
    return h.hexdigest()[:10]


def build_page(slug: str, cfg: dict, nav: str, site_style: str,
               version: str = "", footer: str = "") -> str:
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
    if version:
        html = re.sub(rf'(\.\./{SHARED}/(?:style\.css|app\.js))\?v=[^"]*',
                      rf"\1?v={version}", html)

    # Links that assume the AI_Agent_Work layout.
    html = html.replace('<a href="../" class="back">&larr; Home</a>', "")

    # Heading and subtitle, per page. The subtitle used to be patched by swapping
    # its "Sister pages" sentence for "Priced off the betting markets.", which
    # repeated the clause just before it, and both pages were headed "Lineup"
    # rather than their nav names.
    week = '<span id="week-label">this week</span>'
    html, n_h1 = re.subn(r"<h1>Lineup</h1>", f"<h1>{cfg['h1']}</h1>", html, count=1)
    html, n_sub = re.subn(
        r'<p class="subtitle">[\s\S]*?</p>',
        lambda _m: ('<p class="subtitle">\n        '
                    + cfg["subtitle"].format(week=week) + "\n      </p>"),
        html, count=1)
    if not (n_h1 and n_sub):
        sys.exit("lineup/index.html header changed shape (h1 or subtitle not "
                 "found) -- fix build_page() before porting")
    # The template's footer is a credits line ending "data shared with the
    # <draft board link>". Rewriting that link (as this used to) made it read
    # "data shared with the EZ Dubs Analytics", and the page had no site footer
    # at all. Keep the useful part, which books the lines come from, as a note;
    # the site footer goes in below, lifted from the donor page.
    # The note goes inside <main> (2026-10-20): left where the footer was, it
    # sat outside every landmark, which screen readers navigate by.
    note = []
    html, n_ft = re.subn(
        r"\s*<footer>\s*(Lines from[\s\S]*?Kalshi)\s*&middot;[\s\S]*?</footer>",
        lambda m: note.append(" ".join(m.group(1).split())) or "",
        html, count=1)
    if n_ft:
        html, n_mn = re.subn(r"(\n[ \t]*</main>)",
                             lambda m: ('\n      <p class="sources-note">'
                                        + note[0] + '.</p>' + m.group(1)),
                             html, count=1)
        if not n_mn:
            sys.exit("lineup/index.html has no </main> for the sources note -- fix build_page()")
    if not n_ft:
        sys.exit("lineup/index.html footer changed shape -- fix build_page() before porting")
    if footer:
        html, n_sf = re.subn(r'(\n[ \t]*<script src="\.\./' + SHARED + r'/app\.js)',
                             "\n" + footer + r"\1", html, count=1)
        if not n_sf:
            sys.exit("could not place the site footer before app.js -- fix build_page()")
    html = re.sub(r'<a href="\.\./lineup/"[^>]*>lineup page</a>', "this page", html)

    # No em-dashes in EZ Dubs prose (a standing rule there). The template uses
    # them as clause breaks, where a colon reads the same. Body text only.
    head_end = html.index("<body")
    html = html[:head_end] + html[head_end:].replace(" &mdash; ", ": ").replace(" — ", ": ")

    html = html.replace("<title>Lineup — market-priced start/sit</title>",
                        f"<title>{cfg['title']} · EZ Dubs Analytics</title>"
                        + HEAD_TMPL.format(title=cfg["title"], slug=slug, site=SITE,
                                           description=cfg["description"]))
    if 'name="description"' not in html:
        sys.exit("lineup/index.html <title> changed -- head tags were not added")

    # Site chrome, then this page's own config.
    if site_style:
        html = html.replace("</head>", site_style + "\n" + NFL_SITE_CSS + "\n</head>", 1)
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



def carry_head_metas(existing_path, new_html: str) -> str:
    """Preserve <meta http-equiv=...> tags the destination page already has.

    The pages are regenerated from a template, so a tag added by hand in the
    destination -- a Content-Security-Policy, most importantly -- would vanish on
    the next run. Re-inserting it after the charset meta, where the site's other
    dashboards carry it, keeps that from being a silent security regression.
    """
    if not existing_path.exists():
        return new_html
    old = existing_path.read_text(encoding="utf-8", errors="replace")
    # Capture the tag only. An earlier version also consumed the trailing
    # newline and then re-added one, so every run left two blank lines in <head>
    # and the port stopped being idempotent.
    keep = re.findall(r'<meta\s+http-equiv=[^>]*>', old, flags=re.I)
    if not keep:
        return new_html
    out = new_html
    for tag in keep:
        # Match on the directive name so a reworded policy is not duplicated.
        name = re.search(r'http-equiv=["\']([^"\']+)', tag, flags=re.I)
        if name and re.search(r'http-equiv=["\']' + re.escape(name.group(1)),
                              out, flags=re.I):
            continue
        m = re.search(r'(?i)([ \t]*<meta\s+charset=[^>]*>\s*\n)', out)
        if not m:
            continue
        out = out[:m.end(1)] + "  " + tag.strip() + "\n" + out[m.end(1):]
        print(f"    carried over: {name.group(1) if name else 'meta'}")
    # Collapse blank-line runs left in <head> by earlier versions of this
    # function, so re-running converges instead of growing the file.
    out = re.sub(r'(<meta\s+http-equiv=[^>]*>\n)(?:[ \t]*\n)+', r'\1', out,
                 flags=re.I)
    return out


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
    # Re-themed rather than copied verbatim (2026-10-20): see SITE_THEME.
    (shared / "style.css").write_text(
        retheme_css((SRC / "lineup" / "style.css").read_text(encoding="utf-8")),
        encoding="utf-8", newline="\n")
    version = asset_version(shared / "app.js", shared / "style.css")

    # --- the two pages -------------------------------------------------------
    for slug, cfg in PAGES.items():
        out = dest / "dashboards" / slug
        out.mkdir(parents=True, exist_ok=True)
        html, _ = rewrite_nav(build_page(slug, cfg, nav, site_style or "", version,
                                         footer=lift_footer(dest)),
                              "../", slug)
        # The page is rebuilt from a template, so anything added to the
        # destination's <head> by hand would be silently dropped. That already
        # happened once with the Content-Security-Policy: re-running this to pick
        # up a stylesheet change removed the CSP from both pages and said nothing.
        # Carry such tags across instead.
        html = carry_head_metas(out / "index.html", html)
        (out / "index.html").write_text(html, encoding="utf-8", newline="\n")
        if cfg["data"] == "data/":
            (out / "data").mkdir(exist_ok=True)
            for f in DATA_FILES:
                src = SRC / "nfl-props" / f
                if not src.exists():
                    continue
                dst = out / "data" / f
                # Compare bytes first. Copying unconditionally rewrote every file
                # on every run -- 40k insertions and 40k deletions of pure
                # line-ending churn -- which buries any real data change in the
                # diff and makes the commit meaningless.
                # Compare with line endings normalised, not raw bytes. This repo
                # has no .gitattributes, so its JSON sits on disk as CRLF while
                # the destination stores LF -- so a raw byte compare never matched
                # and every run rewrote all six files (40k insertions and 40k
                # deletions of pure churn, hiding any real data change).
                raw = src.read_bytes().replace(b"\r\n", b"\n")
                if dst.exists() and dst.read_bytes().replace(b"\r\n", b"\n") == raw:
                    continue
                # Write LF, matching what the destination repo stores.
                dst.write_bytes(raw)

    # --- documentation -------------------------------------------------------
    # The destination repo has to explain itself to whoever opens it next, and
    # the two-URLs-one-app arrangement is the part most likely to be "tidied"
    # into two copies by someone who does not know why it is shared.
    doc_src = SRC / "docs" / "ezdubs-nfl-redraft.md"
    doc_dst = dest / "dashboards" / "NFL_REDRAFT.md"
    if doc_src.exists():
        # Write it only if it does not exist yet. The destination copy gets edited
        # in place -- it is the file a future agent reads first -- and overwriting
        # it from here once discarded notes that only applied to the destination
        # repo. If both have changed, that is for a human to reconcile.
        if not doc_dst.exists():
            doc_dst.write_text(doc_src.read_text(encoding="utf-8"),
                               encoding="utf-8", newline="\n")
            print("\n  wrote dashboards/NFL_REDRAFT.md")
        elif doc_dst.read_text(encoding="utf-8") != doc_src.read_text(encoding="utf-8"):
            print("\n  dashboards/NFL_REDRAFT.md differs from docs/"
                  "ezdubs-nfl-redraft.md and was LEFT ALONE.")
            print("    The destination copy may carry notes this repo does not."
                  " Reconcile by hand if needed.")
        else:
            print("\n  dashboards/NFL_REDRAFT.md already current")
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
