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
npm install --no-save jsdom
node tests/lineup_page.test.js
node tests/books_page.test.js
node tests/board_page.test.js
node tests/lineup_interact.test.js
node tests/books_interact.test.js
node tests/lineup_optimizer.test.js
node tests/board_optimizer.test.js
node tests/sleeper_tab.test.js      # hits the live Sleeper API
node tests/rooting_login.test.js    # hits the live Sleeper API
node tests/live_smoke.test.js       # hits the published site
python tests/td_conversion.test.py
node tests/dst_model.test.js 2       # week number; hits Sleeper
```

Run them from the repo root, or set `REPO_ROOT`. Each exits non-zero on
failure.

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
