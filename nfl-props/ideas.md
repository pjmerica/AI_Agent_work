# Ideas — nfl-props

Running list of things to build on top of the season-long data in this folder.

## Data sources on hand

| File | Source | Players | Stats | Shape |
|---|---|---|---|---|
| `data.json` | FantasyPros consensus | 479 | full stat line | projections |
| `clay.json` | Mike Clay (ESPN) | 429 | full stat line | projections |
| `vegas.json` | FanDuel | 92 | pass/rush yds+TDs, rec yds | single O/U line |
| `kalshi.json` | Kalshi | 142 | + **receptions**, **rec TDs** | threshold ladder |

Kalshi is the only source with season-long **receptions** and **receiving TDs**.
No sportsbook offers them, which is why `vegas.json` alone can't be turned into a
PPR total.

---

## 1. Arbitrage between FanDuel and Kalshi

The core idea: these are two independent markets pricing the same events, with
different structures and different participants. FanDuel posts a single O/U line
with vig; Kalshi posts a probability ladder with a spread. When they disagree by
more than the combined cost of crossing both, there's an edge.

### Direct line-vs-ladder arb

For any player-stat where both sources exist, interpolate the Kalshi ladder at
FanDuel's exact line to get the market-implied probability, then compare against
FanDuel's vig-stripped implied probability.

```
FanDuel:  Bijan rush yds  O/U 1150.5   -114 / -114
          → de-vigged P(over) ≈ 0.500

Kalshi:   750:0.90  1000:0.72  1250:0.50  1500:0.22
          → interpolate at 1150.5 ≈ 0.588

Gap: Kalshi prices the over ~8.8 pts higher than FanDuel.
     Buy the over at FanDuel, sell (buy NO) the corresponding Kalshi rung.
```

Requirements before trusting any signal:
- De-vig FanDuel properly (the two-sided prices aren't always symmetric —
  e.g. Bijan rush TDs is +108 / -144).
- Only use Kalshi rungs where `confident: true` (spread ≤ 0.25). Thin rungs like
  `0.02 bid / 0.82 ask` produce fake edges.
- Require the FanDuel line to sit *between* two Kalshi strikes, not extrapolated
  past the end of the ladder.
- Net of both costs: FanDuel vig + Kalshi spread + Kalshi's fee.

### Cross-strike arb inside Kalshi alone

The ladder must be a valid survival function. `enforce_monotonic()` in the
scraper currently *clamps* violations — but a genuine violation before clamping
(P(1250+) > P(1000+)) is itself a risk-free arb: buy the cheaper, sell the
dearer. Worth logging the raw violations instead of silently fixing them.

### Projection-vs-market as a soft signal

Not arbitrage, but the same machinery. Projections sit above the market in
~136 of 139 comparisons because they assume a healthy 17-game season while
markets price injury risk. So compare each player against the *per-stat median
gap*, not zero — that residual is already implemented in the Vegas Lines view.

---

## 2. Market-implied fantasy projections (Kalshi only)

Because Kalshi has receptions and rec TDs, a genuine market-implied PPR total is
possible — something `vegas.json` can't support:

```
PPR = 0.04·pass_yds + 4·pass_tds + 0.1·rush_yds + 6·rush_tds
    + 0.1·rec_yds + 6·rec_tds + 1.0·receptions
```

Blockers to solve first:
- Only 114 of 316 stat ladders currently yield a usable median (the ladder has to
  straddle P=0.50). Everything else is a gap.
- `expected` (E[X] via integrating the survival curve) is only emitted for 3
  ladders — Kalshi's strikes are centred on the interesting range, not on zero,
  so the unobserved head below the first strike wrecks the integral. Fixing this
  properly means fitting a distribution (lognormal for yards, negative binomial
  for TDs) to the observed rungs and taking its mean.
- Missing stats would need filling from FantasyPros/Clay, which makes the result
  a hybrid rather than a pure market projection. Label it clearly if so.

That distribution fit is the highest-value unlock here: it turns 4 sparse points
per player into a full distribution, which gives both a clean mean *and* the
variance — i.e. genuine boom/bust modelling rather than a point estimate.

---

## 3. Other

- **Cross-source disagreement tab** already exists for FP vs Clay; extend it to
  include the two market sources as additional series.
- **Polymarket** has no NFL season-long player stat markets (checked — 0 hits
  across the top 500 open markets by volume). Only worth re-checking closer to
  the season.
- **DraftKings** is Akamai-blocked (403 on all endpoints tried). Would need a
  real browser session to get a second sportsbook for line-shopping.
- **Track line movement over time** — nothing here is stored historically. An
  append-only NDJSON per fetch (like `nfl-beat/archive/`) would let you see which
  way the market is drifting, which is more actionable than a static snapshot.
