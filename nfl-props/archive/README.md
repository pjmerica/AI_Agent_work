# NFL closing-lines archive

One file per finished week, `<season>/week-NN.json`, with every game's and
player-game's closing lines next to what actually happened. Built from this
repo's git history by `scripts/build_lines_archive.py`, kept current by
`.github/workflows/nfl-archive.yml` (Tuesday and Friday). `scorecard.json` is
`scripts/score_lines_archive.py`'s comparison of every source against results.

## What "closing" means

The last committed snapshot taken before that game's kickoff (ESPN's kickoff
time). Each source block records `closeAt`, so you can see how close to kickoff
it was. Since the Sunday pre-kickoff refreshes started (week 7) that is usually
20 minutes. Earlier weeks are thinner because fewer snapshots were committed:
week 1's last is Sept. 12 and week 4's is Oct. 1, a day or three out. Filter on
`kickoff - closeAt` if staleness matters to the question.

## Layout

Header, then one line per game and one per player-game.

```
games[]:   matchup, away, home, kickoff, final, score {away, home},
           open / close {total, homeSpread, books, at}
players[]: name, matchup, kickoff, pos, team,
           books:  {openAt, closeAt, stats: {<stat>: {close, open, quotes: {<book>: {line, odds, mean | prob}}}}}
           kalshi: {openAt, closeAt, stats: {<stat>: {close, open, lineSource}}}
           actual: {played, pass_yds, pass_tds, rush_yds, rec_yds, receptions, any_tds,
                    pass_int, rush_att, pass_cmp, pts_half_ppr}
```

- `line` is the line as posted. For `pass_tds` and `receptions`, `mean` is the
  expected count from line and price (books post different main lines at very
  different prices). For `any_tds`, `prob` is the probability the price
  implies, margin included.
- `close` / `open` for the books are the median of those values (yards: line,
  counts: mean, TDs: prob).
- Kalshi's yardage and count numbers are ladder medians; its `any_tds` is a
  probability.
- `actual.played: false` means the player took no snaps (with `inactive: true`,
  he was not on the active roster), so the prop was void. `actual: null` means
  no Sleeper match, a handful a week.
- Team defenses are one row, `"BAL D/ST"`, whose `actual.any_tds` is defensive
  plus special-teams TDs.

Never hand-edit these. Rebuild a week with
`py scripts/build_lines_archive.py --weeks 9`; a week older than 14 days is
otherwise left alone, so it does not depend on git history staying as it is.
