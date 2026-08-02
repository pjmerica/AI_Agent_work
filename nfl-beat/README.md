# NFL Beat Digest

Daily fantasy-relevant NFL news, weighted toward **deep and late-ADP players** and
toward news that **has not moved ADP yet**.

## Run it

```bash
py scripts/run.py           # build today's digest
py scripts/run.py --dry     # print to console, write nothing
```

Output lands in `digests/YYYY-MM-DD.{html,md,json}` and `index.html`
(the GitHub Pages entry point).

## Schedule

CI runs three times daily, at times picked from measured publication volume
across all 123 sources rather than guessed:

| Cron (UTC) | ET | Why |
|---|---|---|
| `0 12 * * *` | 08:00 | Morning read of everything filed overnight |
| `0 17 * * *` | 13:00 | **Peak.** Noon-1pm is the biggest window of the day — morning practice has wrapped and beat writers file |
| `0 21 * * *` | 17:00 | Afternoon sessions and roster moves |

Measured items/hour ET: quiet until 09:00, peaks at 12:00 (102) and 13:00 (90),
stays high to 16:00, falls off after 18:00. The 08:00 slot is the day's quietest
hour by design — it is a catch-up read, not a collection window.

Runs on the same day overwrite one dated file, so a day counts once regardless
of how often it runs; extra runs make that day's snapshot more complete, never
double-counted. The 72-hour item window means the last run of a day is a superset
of the earlier ones. `workflow_dispatch` allows manual triggering.

GitHub's scheduled runs can drift or skip under load — normal for free-tier
Actions. Three slots make a missed one much less costly.

## The idea

Conventional fantasy tools rank news by player prominence, which is backwards for
finding an edge:

1. **Deep players outrank stars.** News about Josh Allen is already in his ADP.
   News about a WR4 taking first-team reps is not. `sleeper_weight` runs from
   0.3 for round-1/2 picks up to 1.8 for ADP 190+ and 1.9 for undrafted players.

   The curve deliberately keeps climbing past ADP 108 instead of flattening.
   When it saturated at 1.0 there, measurement showed the 61-150 bucket
   outscoring both the 151+ and undrafted buckets — the opposite of the intent.
   Corroboration across outlets is also capped now: an unbounded bonus turned
   into a popularity contest, since appearing in fifteen injury roundups tracks
   fame rather than interest.

   | ADP bucket | mean score before | after |
   |---|---|---|
   | 1-60 | 1.90 | 1.86 |
   | 61-150 | 5.46 | 4.24 |
   | 151+ | 3.66 | **7.50** |
   | undrafted | 3.37 | **7.25** |
2. **Flat ADP beats confirmed.** A player whose ADP has *already* jumped 15 picks
   is a story you missed. A player with camp buzz and a flat ADP is one you
   haven't. News on flat-ADP players is boosted 1.6×; news on players already up
   8+ picks is cut to 0.5×.

The digest leads with **News before the market moves** for this reason.
**News with ADP movers** follows it, as confirmation rather than the headline.

Within the lead section, players are grouped into **ADP buckets**, deepest first:

| Bucket | Range | Shown |
|---|---|---|
| Deep | ADP 160+ and undrafted | 22 |
| Mid-round | ADP 61-159 | 12 |
| Early picks | ADP 1-60 | 6 |

The caps are deliberately lopsided — the deep tail is what this tool exists for,
so it gets the room. Early picks are listed for completeness, not because their
news is actionable. Each heading shows the full count, so "showing 22 of 54"
makes clear what is being truncated.

A **filter bar** at the top of the section flips between All / Deep / Mid-round /
Early picks. It is plain inline JS with no dependencies — the published page has
a strict CSP, so nothing external is loaded.

3. **A story that repeats beats a story that breaks.** One beat-writer mention
   is noise. The same reporter — or three different ones — putting a player with
   the first team on Monday, Wednesday and Friday is a depth-chart change
   happening in slow motion.

## Archive — tying news to ADP moves

`digests/*.json` is overwritten by each of the three daily runs, which is fine
for "what does today look like" but destroys the record needed to answer *"what
news preceded this player's ADP dropping 22 picks?"* — the morning report that
caused an afternoon move is gone by evening.

`archive.py` therefore appends **one immutable line per player per run** to
`archive/YYYY-MM.ndjson`. Every line is self-contained: player, ADP at that
moment, the signals that fired, and the sourced items.

```bash
py scripts/archive.py                    # what is stored
py scripts/archive.py "Khalil Herbert"   # one player's timeline + move causes
```

`explain_move()` walks a player's ADP path and, for each change of 1.0+, lists
the news already recorded when the move appeared:

```
Khalil Herbert — 2 observations

ADP path:
  2026-08-02T23:18  ADP 216.0
  2026-08-03T13:00  ADP 206.6

moves and the news that preceded them:
  2026-08-03T13:00: 216.0 → 206.6 (+9.4)
  signals: injured, injury, out for, waived
    - [Yahoo NFL] 49ers sign RB Khalil Herbert...
    - [X @mattbarrows] The 49ers signed former Bears RB Khalil Herbert...
```

This is correlation, not proof of causation — it shows what was on the record
before the move, which is what you need to judge whether a signal type actually
predicts anything.

Concurrency: three daily runs append to one file, so `.gitattributes` sets
`merge=union` on `archive/*.ndjson` to keep both sides of a race. That can
duplicate a line when a run is retried, so the reader treats `(run, name)` as
the unique key.

## Recurring stories

`threads.py` diffs the dated JSON payloads in `digests/` to find **(player,
theme)** pairs seen across 2+ days, and renders them in a **Developing** section
at the top of the page — above the day's news, because persistence outranks
recency here.

```bash
py scripts/threads.py    # inspect current threads from the console
```

Signal terms collapse into five themes (injury, role/depth chart, camp buzz,
usage, roster status) so that "acl", "surgery" and "sidelined" count as one
continuing story rather than three. Only a player's **strongest** theme is
listed; secondary ones appear as `+ camp buzz` so a single story that trips
several themes ("placed on IR" is both injury and roster) is not counted twice.

Each thread shows how many days it has run, over what span, how many distinct
sources carried it, and — most usefully — **whether ADP has reacted yet**:

```
Eli Stowers (TE PHI) — role / depth chart, 4d across 6d, 2 sources, ADP -2.8
Kaden Prather (WR GB) — camp buzz, 5d across 6d, 1 source, ADP still flat
```

A thread running four days with **ADP still flat** is the strongest signal this
tool produces: sustained beat attention that the draft market has not priced.

Threads need 2+ days of digests to exist and get meaningfully better after a
week. The section states this plainly rather than rendering empty. Note that
`digests/*.json` now stores **every** matched player, not just the rendered top
40, so a player ranked 60th today can still be detected as the start of a run.

## Sources

Every line in the digest links to its origin. Nothing is asserted unsourced.

**Bluesky** (public `getAuthorFeed`, no auth) — 11 verified handles including
Ian Rapoport, Field Yates, Nathan Jahnke, JJ Zachariason, Mina Kimes,
Jourdan Rodrigue.

**RSS (national)** — ProFootballTalk, Yahoo NFL, CBS Sports NFL, PFF, ESPN NFL,
RotoWire, Awful Announcing.

**RSS (team blogs)** — all 32 SB Nation club blogs, verified live. This is the
camp-report layer: daily practice observations, unofficial depth charts, position
battles. Roughly 40% of collected items are camp-related with these on, versus
16% without. Feeds are fetched in parallel (~18s for all 43 sources).

A bare surname appearing on its own team's blog counts as team context, so
"Kmet" on Windy City Gridiron resolves without needing "Bears" in the sentence.
A surname on the *wrong* team's blog is rejected outright.

### The Athletic

**Not scraped.** Its articles are paywalled and its terms prohibit automated
access; its public RSS feed (`theathletic.com/nfl/rss/`) returns zero items as of
2026-08-02. Nothing behind that paywall is fetched. If you want Athletic content
in the digest, read it in the browser and paste the relevant bit in yourself.

### X / Twitter via nitter — enabled

`nitter.net` serves RSS fine and is the source of ~200 items per run.

**Note on an earlier wrong call in this repo's history:** nitter was initially
recorded as dead. That probe requested the URL *without following redirects*,
which returns `HTTP 200` with `Content-Length: 0` and looks exactly like a dead
host. Following redirects returns real content. If you ever re-probe an
instance, use `curl -L`.

Highest-value account by a distance is **@32BeatWriters**, which retweets club
beat reporters league-wide — the practice-report layer that is thin on Bluesky.
Retweets are un-prefixed and re-attributed to the original reporter, so the
digest credits *@OmarKelly* or *@ryanmcfadden_* rather than the aggregator.

Also included: Schefter, Rapoport, Garafolo, Yates, Fowler, Wolfe, Dov Kleiman,
James Palmer, Rotoworld, FantasyPros, ESPN NFL. Schefter matters here because he
has **no Bluesky account** — impostors squat on the name there.

X contributes ~12 players per run that appear in no other source, typically
mid-round names (Chris Rodriguez ADP 129, Kyle Monangai ADP 95) where news
actually moves a draft decision.

### Individual beat reporters

Rather than reading club reporters only through the aggregator, the digest
follows them **directly** — you get each reporter's full timeline instead of
just the posts someone chose to retweet.

```bash
py scripts/discover_writers.py              # merge newly seen reporters
py scripts/discover_writers.py --polls 20   # dig harder
```

This mines @32BeatWriters retweets for author handles, verifies each has a live
feed, and writes `data/writers.json`. The aggregator's RSS window only ever
exposes ~12 authors at a time, so **the roster accumulates over days** — CI runs
discovery on every scheduled build and merges. A reporter who was simply quiet
is never dropped.

Current roster: @OmarKelly, @mattbarrows, @ryanmcfadden_, @Tdrake4sports,
@AndyHermanNFL, @theleviedwards, @WesHod, @samwarren83, @JCaporoso,
@mattblively, @ESPNdirocco.

Override the instance with the `NITTER_INSTANCE` env var; set it empty to
disable. Instances do go down, so `nitter_status()` reports the live state and
every collector fails soft — a dead instance costs items, never the run.

## Handles

Handles are verified against the live API, not hardcoded on faith. The
`MIN_FOLLOWERS = 8000` filter exists because impostors squat on the names of
insiders who aren't on Bluesky — `adamschefter.bsky.social` is real, has ~4.6k
followers, and is **not** Adam Schefter, who has no Bluesky account.

```bash
py scripts/verify_handles.py                    # re-verify, rewrite data/handles.json
py scripts/verify_handles.py search "Some Name" # find a handle by display name
```

Use `search` rather than guessing: handles are frequently non-obvious
(Nathan Jahnke is `ffnatejahnke`, JJ Zachariason is `lateroundqb`).

## Player universe

| Source | Path |
|---|---|
| UD ADP history | `EZ Dubs Website/dashboards/best-ball-prices/ud_adp_history.csv` |
| Season projections | `FF Starters/season proj/outputs/ud/predictions_2026_{qb,rb,wrte}.csv` |

1,563 players — 292 with a current ADP, the rest projected but undrafted. That
deep tail is deliberately included; it is where news that has not moved ADP lives.

### The ADP board rolls forward daily

The board defaults to the **newest snapshot in the CSV**, so each daily run picks
up fresh ADP with no manual step. Movement is measured against the closest
snapshot at least 14 days older — that comparison is what makes the flat-ADP
distinction meaningful, so it is kept rather than dropped.

CI re-fetches the CSV on every run from the public EZ Dubs repo (no token, no
checkout):

```
https://raw.githubusercontent.com/pjmerica/ez-dubs-website/main/dashboards/best-ball-prices/ud_adp_history.csv
```

Locally it reads `Documents/EZ Dubs Website/`. Override with `UD_ADP_PATH`.

**To freeze a specific day** (reproducing an old digest), pin either date:

```bash
ADP_AS_OF=2026-07-25 py scripts/run.py       # board frozen to that snapshot
ADP_BASELINE=2026-07-11 py scripts/run.py    # override the comparison point
```

A pinned date absent from the data warns and falls back to the newest snapshot
rather than failing or silently using the wrong board.

**Staleness is surfaced, not hidden.** If the newest snapshot is more than 2 days
old, the digest header shows a warning — that means the upstream EZ Dubs pull has
stalled, not that this script broke. The workflow log also prints the newest
snapshot date on every run.

Name matching is intentionally loose (accent/punctuation/suffix stripped, plus
`F. Last` initials). Bare surnames only match when the player's team also appears
in the text, so "Wilson" doesn't hit half the league.

## Files

| File | Role |
|---|---|
| `scripts/run.py` | entry point |
| `scripts/players.py` | player universe, ADP movement, sleeper weighting |
| `scripts/sources.py` | Bluesky / RSS / nitter collectors |
| `scripts/analyze.py` | name matching + relevance scoring |
| `scripts/config.py` | feed list, signal vocabulary, dead-feed record |
| `scripts/report.py` | HTML / Markdown / JSON rendering |
| `scripts/verify_handles.py` | handle verification and search |

## Known limits

- **Signal terms are keyword-based**, so occasional false positives slip through:
  "first team" matched a Deshaun Watson article where the phrase meant "the first
  team that…" rather than depth-chart position. The matched terms are printed on
  every card so you can dismiss these at a glance.
- **Roundup articles** ("camp injuries tracker: Pearsall, Gardner-Johnson, …")
  can attach a signal to the wrong player. A 220-character proximity gate between
  name and signal limits this but doesn't eliminate it.
- **Bluesky volume is thin** (~40 fresh posts/48h across all handles). RSS carries
  most of the load. Many NFL beat writers still post only to X.
- **The ADP board lists ~627 players as `FA`** who are actually on rosters
  (Tyreek Hill, Najee Harris, Taysom Hill). Teams are backfilled from the
  projections where possible, but these veterans aren't in the 2026 projection
  set, so it can't reach them. Impact is small: only one of the 627
  (Stefon Diggs, ADP 132) is meaningfully draftable — the rest sit at ADP 200+.
  The cost is that team-blog disambiguation can't fire for them.
