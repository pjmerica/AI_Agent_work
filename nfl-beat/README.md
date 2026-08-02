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

**RSS** — ProFootballTalk, Yahoo NFL, CBS Sports NFL, PFF, ESPN NFL, RotoWire,
Awful Announcing.

### The Athletic

**Not scraped.** Its articles are paywalled and its terms prohibit automated
access; its public RSS feed (`theathletic.com/nfl/rss/`) returns zero items as of
2026-08-02. Nothing behind that paywall is fetched. If you want Athletic content
in the digest, read it in the browser and paste the relevant bit in yourself.

### X / Twitter (nitter) — disabled

Probed 2026-08-02, all instances non-functional:

| Instance | Result |
|---|---|
| `nitter.net` | HTTP 200, empty body |
| `nitter.poast.org` | 403 |
| `nitter.privacydev.net` | does not resolve |
| `xcancel.com` | 403 |

The adapter is written and ready. If you find a working public instance, set
`NITTER_INSTANCE` in `scripts/sources.py` and it activates — no other changes
needed.

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

### The ADP board is frozen

`scripts/players.py` pins two snapshot dates and treats them as current truth:

```python
ADP_AS_OF    = "2026-08-01"   # the board treated as "today"
ADP_BASELINE = "2026-07-18"   # compared against, to get movement
```

Without pinning, the digest re-derived "newest date minus 14 days" on every run,
so the reference board drifted silently whenever EZ Dubs pulled new rows. Pinned,
results are reproducible until you bump the dates by hand.

**To refresh:** update the UD ADP CSV, then set `ADP_AS_OF` to the new date and
usually move `ADP_BASELINE` forward by the same amount. If a pinned date isn't
present in the data, the code falls back to newest-minus-14-days and prints a
warning rather than failing or drifting quietly.

Locally the CSV is read from `Documents/EZ Dubs Website/`. In CI it is curled
from the public repo — no token or checkout needed:

```
https://raw.githubusercontent.com/pjmerica/ez-dubs-website/main/dashboards/best-ball-prices/ud_adp_history.csv
```

Because the board is pinned, both paths produce identical output even when the
remote CSV is fresher than the local copy. Override the path with `UD_ADP_PATH`.

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
