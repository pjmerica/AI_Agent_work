# Tests

Browser-level tests for the `lineup/` and `books/` pages, plus a correctness
check on the lineup optimizer.

These exist because of a specific failure. When `lineup/` was split out of
`nfl-props/`, the markup came across but none of its event listeners did — the
search box, suggestion list, paste area, demo and clear buttons, Sleeper
sign-in and "all books" links were all inert, in every commit since the split.
The smoke test in use at the time stubbed `document` with a Proxy that returned
a fake element for every `getElementById`, so it reported a clean load on a page
whose buttons did nothing.

The lesson is that a stub which cannot fail is not a test. These load the real
HTML in jsdom and click the real controls, so a missing listener shows up as a
click that changes nothing.

## Running

```sh
npm install          # once; installs jsdom, which most of these need
npm test             # everything except the network and browser suites
```

`npm test` runs `tests/run_all.js`, which is the thing to use. It reports each
suite's result, and it distinguishes a suite that **failed** from one that
**crashed before running a single check** — the second is worse and used to be
nearly invisible in a wall of output. It exits non-zero on either.

To run one suite on its own:

```sh
node tests/lineup_page.test.js
python tests/td_conversion.test.py
node tests/dst_model.test.js 2        # week number; hits Sleeper
```

Run from the repo root, or set `REPO_ROOT`. Each exits non-zero on failure.

### Why there is a package.json

Because there wasn't one, and every jsdom suite in this repo was unrunnable as a
result. `require("jsdom")` only ever resolved by accident, from a `node_modules`
that happened to sit in a parent directory of wherever the tests were being run
from. From the repo root they all died with `MODULE_NOT_FOUND`, and a clean clone
could not run them at all. Earlier instructions here said to
`npm install --no-save jsdom`, which left nothing behind for the next person.

jsdom is a declared devDependency now and the lockfile is committed. Do not go
back to installing it ad hoc.

### Suites that do not run by default

| Suite | Needs | Why it is separate |
|---|---|---|
| `live_smoke.test.js` | network | Hits the published Pages site and the Sleeper API. A third party being down should not turn the build red. |
| `mobile_layout.test.js` | real Chrome | Launches a browser per page per width. Sharing a process tree with the other suites made them contend for ports and CPU, which surfaced as empty page captures — a flake that reads exactly like a real layout bug. |

Both skip cleanly when their dependency is absent. **Under CI they fail instead
of skipping**, because a skip there means the job reports success having verified
nothing — which is precisely how the jsdom breakage above went unnoticed.

CI runs `node tests/run_all.js --offline`, then `mobile_layout.test.js` as its own
step with Chrome installed explicitly. It is installed rather than assumed at a
path: the first guess was `/usr/bin/google-chrome` and the runner actually
resolves it to `/opt/hostedtoolcache/setup-chrome/...`, so a hardcoded path would
have skipped silently and still gone green.

## What each one covers

**`lineup_page.test.js`** — 36 assertions over the Manual Roster tab: every
element is present, the demo and clear buttons work, typing shows suggestions,
Enter takes the top hit, arrow keys move the highlight, the paste path resolves
names and leaves unmatched lines in the box, the book filter changes the
numbers and the "all" link restores them, and the three tabs switch. Reads
market data from `nfl-props/*.json` off disk.

**`books_page.test.js`** — 28 assertions over the book-by-book table: the
scoring toggle moves pass-catchers (and correctly leaves a quarterback with no
receptions line unchanged, which is why it tests a named tight end rather than
whatever sorts first), the position filter narrows to that position only, the
TD-only toggle adds and removes rows, search narrows to the right player, and
clicking a column header sorts then reverses.

**`sleeper_tab.test.js`** — signs in as a real Sleeper user and checks the
league chips appear, each carries a swap count, and **that count equals the
number of SWAP IN tags in the table** when the chip is clicked. That last one
is the point: the badge is computed separately from the table, so it could
drift.

Note the fetch bridge in this file. Returning undici's own `Response` object
across the jsdom boundary hands back a raw compressed body — `r.text()` gave
224 bytes of gzip where the real payload is 413 bytes of JSON, which the page
read as "no such user". It reads `arrayBuffer()` and decodes in Node instead.

**`board_page.test.js`** — walks all nine tabs on the `nfl-props` board,
checking each panel becomes visible and the data-driven ones produce rows. Also
asserts the week labels are stamped from `weekly.json` rather than left at the
markup's hardcoded "Week 1", which is what they used to read on a Week 3 slate
until the weekly tab was opened. Note that panel ids do not all follow the
`data-view` name — `rankings` lives in `#table-view`.

**`lineup_optimizer.test.js`** and **`board_optimizer.test.js`** — compare `bestLineupForSlots` against a
brute-force assignment on 1,500 randomised rosters across three slot layouts.
Both files carry the same implementation — `bestLineupForSlots` was lifted
verbatim from `lineup/app.js` into `nfl-props/app.js` rather than retyped, so
the two cannot drift — and each is tested against its own copy. The optimizer
uses branch-and-bound, so this is what establishes that the pruning only cuts
branches that cannot win. It caught nothing, which is the result you want from
it.

**`live_smoke.test.js`** — fetches the three published pages and their `app.js`
over the network and runs them, so what it checks is what a visitor actually
gets. Everything else here runs against the working tree, which cannot catch a
bad deploy: a stale cache stamp, a file that never got committed, a Pages build
that has not finished.

One thing to know if this file ever misbehaves: `fetch()` in this environment
returns the raw gzip body rather than decompressing it, so responses are
inflated by hand (`1f 8b` magic number). Without that the page source arrives as
binary and fails to parse — which looked exactly like all three sites being
broken. The same trap is why `sleeper_tab.test.js` reads `arrayBuffer()`.

**`td_conversion.test.py`** — the one numerical test here. A sportsbook's
anytime-TD price is P(scores at least one), Kalshi's `any_tds` is a true
expectation, and both get multiplied by 6 — so the conversion between them is
load-bearing. Checks the function's shape (monotonic, never below the input,
never above full Poisson), then re-derives the best-fit blend against whatever
Kalshi currently prices rather than trusting the constant, and warns if the
scraper has drifted far from it.

Its thresholds are stated in fantasy points, not ratios. An early version
demanded a 40% error reduction on goal-line backs and failed at 35%, which says
nothing about whether the number is good enough — 0.23 points of error is.

**`dst_model.test.js`** — backtests the defense model against what defenses
actually scored in a completed week. Kickers and defenses have no prop market,
so they are priced off the game line, and that is a claim worth checking rather
than assuming.

It asserts the *components*, which is what the model actually claims: sacks and
takeaways within 0.5 of the real per-game rate, `SCORE_SD` within 2 of the real
spread of points allowed. It deliberately does not assert accuracy of the
projection itself. The model mean runs about a point under actual because it
cannot foresee a defensive touchdown, and its spread is ~1.4 against a real ~6.5
— a game line knows the expected script and nothing about the pick-six that
decides the week. These numbers rank defenses; they do not forecast scores.

**`rooting_login.test.js`** — signs in from the Root For/Against tab without
ever touching the Sleeper tab, then checks both tabs' controls agree: the other
form fills in, both Sign out buttons appear, the league chips are there without
signing in again, and signing out from either clears everything including the
saved username. It starts from an empty `localStorage` so the only way in is the
form under test.

It caught a real bug on its first run. The sign-in handler referenced
`currentView`, which exists in `nfl-props/app.js` but not in `lineup/app.js` —
that app tracks the visible view by class. The ReferenceError surfaced to the
user as "Sleeper request failed", which points at the network rather than at the
code.

**`lineup_interact.test.js`** and **`books_interact.test.js`** — the
single-action tests above check that each control works. These check that
*sequences* of them do: pressing a button twice, adding a player who is already
added, pasting a list you already pasted, unticking every book, stacking a
position filter on a search that contradicts it, sorting every column in turn.

This is the pair that earns its keep. It found the book filter inverting itself
when the last checkbox was cleared — untick the ninth book and all nine came
back on, with the projection jumping from 18.8 to 23.6. No single-action test
could see it, because every individual click behaved correctly; only the ninth
one in a row was wrong.

A caution on the books file: one of its checks failed on its first run and the
fault was the test's, not the app's. It read a fixed column index while sorting
a different column, so it reported "blanks mixed with numbers" that was just the
unsorted neighbour column. Sorting was correct all along — 60 numbers then 123
blanks, cleanly separated. Verify which column a failure is actually reading
before believing it.

**`apps_agree.test.js`** — builds the projection pool from both `lineup/app.js`
and `nfl-props/app.js` against the same data files and compares every player.

The two share ancestry: lineup was split out of the board, and shared logic has
been ported back and forth since. Every port is a chance for one to keep a fix
the other misses, and that has happened twice — the board spent a day with a
silent-drop bug lineup had already fixed, and before that the whole
projection-fill feature existed in only one of them. When they last diverged the
gap was 143 of 297 players, with Brock Bowers at 1.8 on one page and 10.1 on the
other.

Verified it detects drift: changing `GAMES_IN_SEASON` from 17 to 16 in one file
alone surfaces as 106 players disagreeing.

**`name_matching.test.js`** — five feeds spell players five ways and every join
between them is on name, so this checks both failure directions.

Too loose merges two people and attributes one player's lines to another: the
initial-plus-surname key handed CJ Williams, a deep-bench receiver, Caleb
Williams's quarterback projection. Too strict splits one person in two and his
sources never meet: Cam Ward is "Cam Ward" to Kalshi, the books and Sleeper but
"Cameron Ward" to DraftKings and Clay, so his touchdown line and his projection
sat on a player nothing else knew about.

Beyond the fixed cases it **re-runs the search that found them** — group every
name in the data on surname, flag pairs where one first name is a prefix of the
other and the two share a team. That combination is one person spelled two ways,
not two people. It found three: Cam/Cameron Ward, Josh/Joshua Palmer,
Chig/Chigoziem Okonkwo. Leaving the search in the test means the next one
surfaces on its own rather than waiting to be noticed.

**`injury_reason.test.js`** — a rostered player with no betting line is either
hurt or simply not priced yet, and those are opposite instructions. The page used
to report both as "no market projection".

Checks three things: that `sleeper_players.json` carries the status at all and is
still small enough to ship (the status rides along in the player map, so there is
no second fetch); that the sidelined/game-time split is right at the boundaries —
IR, PUP, Out, Sus, NA, DNR, COV mean not playing, while Questionable and Doubtful
are still game-time calls; and that the page renders the two groups as separate
sections.

The useful assertion is **every status present in the data is classified**. A new
Sleeper code would otherwise fall through and read as playable, which is the
failure direction that costs you a lineup slot.

**`contrast.test.js`** — computes the WCAG contrast ratio of every text colour
declaration in the three stylesheets.

It exists because the pages had quietly standardised on `#6a6a8a` for almost all
secondary text — column headers, captions, chip labels, counts, footers. That is
3.32:1 against the card background, under the 4.5:1 AA floor, so the labels
naming each number were the hardest thing on the page to read. 67 declarations
were below the line.

It parses the CSS rather than measuring the rendered page, so it needs no browser
and runs in the normal suite. Two details that matter: it strips comments first,
because a hex mentioned in prose is not a declaration (an earlier fix of mine
landed inside a comment and changed nothing while looking right), and it compares
against each file's **darkest** background, so a pass is never a false pass. It
allows 3:1 only for genuinely large text, and carries an explicit allowlist — the
brand purple `#5b4cf5` and the deliberately faint `#3a3a55` "no data" dash, each
with its reason.

**`mobile_layout.test.js`** — measures all three pages at 390, 360 and 320px and
fails on a page that scrolls sideways or a scroll container that clips its
contents.

Two bugs it was written for, both invisible at desktop width: `#view-tabs` was a
non-wrapping flex row of ten tabs totalling 840px, so every phone scrolled the
whole page sideways, header and all; and `.table-wrap` used `overflow: hidden`,
so at 320px a 358px table had its rightmost columns permanently unreachable — no
scrollbar, no swipe, no sign anything was missing.

It measures inside an **iframe** sized to the target width because headless
Chrome clamps `--window-size` to a 500px minimum viewport: ask for 390 and you
get 500, and at 500px neither bug above is visible. That clamp is why both
shipped. Its server also takes an OS-assigned port — a fixed one left it
reporting "probe did not run" on pages that were fine, because after repeated
runs `listen()` still resolved while nothing was served.

**`cdn_integrity.test.js`** — requires Subresource Integrity on every
cross-origin `<script>`.

Without it, anyone able to tamper with a CDN response runs arbitrary JavaScript
on a page where visitors type their Sleeper username. It walks every HTML file in
the repo rather than a fixed list, so a new page cannot slip past.

It also guards a subtler trap. The Chart.js tag pointed at
`dist/chart.umd.min.js`, which **does not exist** in the published package —
jsdelivr minifies it per request, and its own response banner says "Do NOT use
SRI with dynamically generated files", because those bytes can change without the
version changing. A hash pinned there would have started blocking the script
eventually. `dist/chart.umd.js` is the real published file: byte-identical to the
npm tarball, already minified, and smaller.

**`run_all.js`** — not a suite. See **Running** above.
