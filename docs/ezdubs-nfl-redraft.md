# NFL Redraft/In-Season pages

**Added:** 2026-10-01 · **Source repo:** `pjmerica/AI_Agent_work`

Two in-season NFL dashboards, ported from the `lineup/` page in
[AI_Agent_work](https://github.com/pjmerica/AI_Agent_work). They project fantasy
points from betting markets rather than from a ranking model, and read a user's
real Sleeper leagues live in the browser.

| Page | URL | Opens on |
|---|---|---|
| Start/Sit | `dashboards/nfl-start-sit/` | the Sleeper Start/Sit tab |
| Root For/Against | `dashboards/nfl-rooting/` | the Root For/Against tab |

Both are in the top nav under **NFL → Redraft/In-Season**.

## The thing to understand first

**These are two URLs serving one application.** Both pages load the same
`dashboards/nfl-shared/app.js`; each only sets which tab opens first:

```html
<script>window.LINEUP_DEFAULT_VIEW = "rooting";
        window.LINEUP_DATA_DIR = "../nfl-start-sit/data/";</script>
```

Do **not** copy `app.js` into each page directory to make them independent. That
logic — Sleeper rosters, league scoring, the projection merge — is the same for
both views, and duplicating it is how the source repo got two silent drift bugs
(a fix landed in one copy and not the other; see `tests/apps_agree.test.js`
there). A reader arriving at `nfl-rooting/` and finding no `app.js` is the
intended design, not a missing file.

All three tabs are reachable from either page. The nav entries are deep links to
the two people actually want.

## Where the data lives

`dashboards/nfl-start-sit/data/` — seven JSON files, about 950 KB:

| File | What it is |
|---|---|
| `weekly.json` | Kalshi per-game player props |
| `oddsapi.json` | multi-book props (DraftKings, FanDuel, BetMGM, Bovada, …) |
| `dk_td.json` | DraftKings anytime-touchdown prices |
| `gamelines.json` | spreads and totals — this is what prices kickers and defenses |
| `sleeper_players.json` | trimmed Sleeper player map, plus injury status |
| `clay.json`, `data.json` | season projections, used to fill in unpriced players |

`nfl-rooting` points at this same directory, so the payload is stored and fetched
once.

## Keeping the data fresh — THE ONE ONGOING COST

**The data refreshes automatically on both sides.** In the destination repo,
`.github/workflows/nfl-data-pull.yml` runs `scripts/pull_nfl_data.py`, which
mirrors the seven JSON files from this repo's Pages site and commits only when
something actually changed.

It mirrors rather than re-running the scrapers, deliberately: the Odds API bills
per event per market, so a second pipeline would double the credit burn for
identical numbers, no `ODDS_API_KEY` has to exist in that repo at all, and the two
sites cannot drift apart.

Upstream, this repo's `nfl-props.yml` refreshes on a schedule built around how
books actually post, which is very uneven across the week:

| ET | Why |
|---|---|
| Wed 10:00pm | books begin opening Sunday props |
| Thu 10:00am, 3:00pm, 7:00pm | Thursday is the biggest jump of the week — week 3 went 99 to 183 player-games overnight. The 7pm run lands before TNF. |
| Fri / Sat 10:00am | coverage fills in, lines move |
| Sun 10:00am, 12:00pm | pre-kickoff, then a last look before the 1pm games |

Nothing runs Monday or Tuesday: almost no Sunday props are posted that early, so
a refresh then spends credits to learn nothing. A single-week run measured 36
Odds API credits, so the eight runs come to roughly 1,250 a month.

This is why a midweek board legitimately shows part of the slate unpriced — a
Tuesday pull of week 5 had 6 of 15 games with usable props. The page says so
rather than implying the numbers are complete, and it warns outright when the
props describe a week that has already been played.

One upstream caveat worth knowing: `dk_td.json` only refreshes from a **local**
run, because DraftKings blocks GitHub Actions runners (403 — confirmed by the
identical request returning 200 from a home connection and 403 from a runner, so
it is the source IP, not the headers). It can therefore be staler than its
siblings.

Since 2026-10-10 that no longer costs the board the stat. The Odds API also
carries `player_anytime_td` and runs fine on CI, so `oddsapi.json` supplies
touchdown prices unattended and DraftKings is preferred only when someone has
run it locally. Both arrive as an EXPECTED touchdown count rather than
P(scores at least one), via the same conversion — see `expected_tds()` in
`scripts/fetch_dk_td_scorers.py`, which `tests/td_conversion.test.py` checks
against all 432 DraftKings prices.

The page still handles a stale DraftKings file: it drops touchdown entries whose
game is not on the current board, and says so rather than leaving the prices
silently missing. A pull workflow will inherit whatever the source
repo last committed.

## What the port changed in this repo

### The nav gained a second level

```
before                      after
Best Ball (NFL) ▾           NFL ▾
  Price Differences           Best Ball ▸
  History Risers/Fallers        Price Differences
                                History Risers/Fallers
                              Redraft/In-Season ▸
                                Start/Sit
                                Root For/Against
```

The nav is **copy-pasted into every HTML page** in this repo rather than
templated, and it was single-level. The port added a `.nav-dd-sub` rule set and
the matching markup to all eight pages. The existing rules were not touched, so
the Prediction Markets dropdown behaves exactly as before.

On screens under 760px the submenu cannot fly out sideways, so it renders
indented in place instead.

Changing the nav means editing every page. `scripts/` in the source repo has
`port_lineup_to_ezdubs.py`, which does it idempotently — re-running it refreshes
the nav on every page rather than duplicating it.

### Files added

```
dashboards/nfl-shared/app.js        the application (one copy)
dashboards/nfl-shared/style.css     its styles
dashboards/nfl-start-sit/index.html + data/
dashboards/nfl-rooting/index.html
```

`nfl-shared/` holds no page of its own; it exists so the two pages cannot drift.

## How to re-port after an upstream change

From the source repo:

```sh
cd /path/to/AI_Agent_work
py scripts/port_lineup_to_ezdubs.py              # dry run, prints the plan
py scripts/port_lineup_to_ezdubs.py --write
```

It is idempotent: it rewrites the shared assets, both pages, and the nav on every
page. It aborts rather than shipping a page with no nav if it cannot find the
donor markup, and aborts if `app.js` no longer has the `DATA_DIR` line it needs
to rewrite — meaning the upstream page changed shape and the script needs
updating before it can be trusted.

## What the pages actually do

Worth knowing to answer questions about them:

- **Projections come from betting markets**, not rankings. A receiver's yardage
  line of 67.5 becomes 6.75 points.
- **Each league's own scoring** is read from Sleeper, so the same player scores
  differently across leagues — including D/ST, where one of these leagues pays 10
  for a shutout and another 5.
- **Kickers and defenses have no prop market anywhere**, so they are priced off
  the game line: a team's implied total is `total/2 − spread/2`, which drives the
  points-allowed buckets. Backtested against three weeks of real results.
- **A `TD ONLY` tag** means a book priced that player's touchdown and nothing
  else, so his yardage is a season estimate rather than a market price. 136 of 465
  players were in that state in week 4, so the tag is common by design.
- **An injury tag** next to a player is Sleeper's own status. When a player has no
  line at all, the page says whether an injury explains it — "IR (Hamstring)" is a
  different instruction from "no book has priced him yet".
- **Nothing is stored server-side.** The Sleeper username lives in
  `localStorage`; the API is public and needs no key.
