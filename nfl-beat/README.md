# NFL Beat Digest

Daily fantasy-relevant NFL news, weighted toward **deep and late-ADP players** and
toward news the draft market **has not priced in yet**.

## Run it

```bash
py scripts/run.py           # build today's digest
py scripts/run.py --dry     # print to console, write nothing
```

Output lands in `digests/YYYY-MM-DD.{html,md,json}` and `index.html`
(the GitHub Pages entry point).

## The idea

Conventional fantasy tools rank news by player prominence, which is backwards for
finding an edge:

1. **Deep players outrank stars.** News about Josh Allen is already in his ADP.
   News about a WR4 taking first-team reps is not. `sleeper_weight` runs from
   0.35 for round-1/2 picks up to 1.0 for undrafted players.
2. **Unpriced beats confirmed.** A player whose ADP has *already* jumped 15 picks
   is a story you missed. A player with camp buzz and a flat ADP is one you
   haven't. News on flat-ADP players is boosted 1.6×; news on players already up
   8+ picks is cut to 0.5×.

The digest leads with the **Unpriced** section for this reason. ADP movement
appears lower down as confirmation, not as the headline.

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

### X / Twitter — not available

Probed 2026-08-02, all nitter instances non-functional:

| Instance | Result |
|---|---|
| `nitter.net` | HTTP 200, empty body |
| `nitter.poast.org` | 403 |
| `nitter.privacydev.net` | does not resolve |
| `xcancel.com` | 403 |

This is structural, not bad luck. X removed guest API access in 2023, which is
what every nitter instance depended on — that is why they all died, and why new
ones tend to last weeks. There is no logged-out way to read tweets.

The remaining options are all bad: scraping with a logged-in session risks a
ban on whatever account it uses, and the official API is $200/month for a Basic
tier whose search would likely underperform the free feeds already wired up.

**The team blogs cover this gap.** SB Nation beat writers post the same camp
observations, often the same people, in a format that is stable and free. That
is where the camp-report content comes from instead.

The nitter adapter remains in `scripts/sources.py`, disabled. If a working
public instance ever appears, set `NITTER_INSTANCE` and it activates.

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
deep tail is deliberately included; it's where unpriced news lives.

### The ADP board rolls forward daily

The board defaults to the **newest snapshot in the CSV**, so each daily run picks
up fresh ADP with no manual step. Movement is measured against the closest
snapshot at least 14 days older — that comparison is what makes UNPRICED mean
anything, so it is kept rather than dropped.

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
