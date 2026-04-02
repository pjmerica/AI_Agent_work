window.AND1_DATA = {

  // ── Career And-1 Kings ──────────────────────────────────────────────────────
  // Ranked by overall and-1 dominance. FTA volume, 3PT fouls drawn, FDPG.
  // Pre-2005 era: no play-by-play tracking — FTA/FT% are the best proxy.
  // Post-2005: 3PT shooting fouls drawn data from NBA tracking (via Fadeaway World, 82games).
  CAREER_KINGS: [
    {
      name: "James Harden",
      era: "2009–active",
      team: "HOU/BKN/PHI/LAC",
      pos: "G",
      method: "Step-back 3s, Euro-step contact, jump-into-defender",
      careerFTA: 9700,
      careerFTPct: 86.1,
      threePtFoulsDrawn: 521,    // through Oct 2021 — confirmed all-time record
      peakFTAperGame: 14.5,      // 2019-20 — most since Wilt's 17.0 in 1961-62
      peakFTA: 858,              // 2018-19
      fdpgPeak: 14.5,
      ruleChangeImpact: { before: 11.8, after: 5.7 }, // FTA/game 2019-20 vs 2021-22
      notes: "All-time leader in 3-point shooting fouls drawn with 521 — 272 more than the next player. Drew more 3-PT shooting fouls than entire NBA teams over a 6-year stretch. Led NBA in FTA every season 2014–2020.",
      tier: "GOAT",
      bonusFTPct: 86.1
    },
    {
      name: "Shaquille O'Neal",
      era: "1992–2011",
      team: "ORL/LAL/MIA/PHO/CLE/BOS",
      pos: "C",
      method: "Unstoppable post moves, put-backs, brute force to the rim",
      careerFTA: 11252,
      careerFTPct: 52.7,
      threePtFoulsDrawn: null,   // pre-tracking era
      peakFTAperGame: 13.1,      // 2000-01
      peakFTA: 893,
      fdpgPeak: 13.1,
      ruleChangeImpact: null,
      and1RatePerShot: 8.5,      // 2005-06 — highest in league (82games.com)
      and1Pct: 54.9,             // 2005-06 — % of shooting fouls that became and-1s
      notes: "Paradox: 8.5% of all shot attempts ended in an and-1 in 2005-06 — the highest rate in the league — yet he converted the bonus FT at only 47.9%, far below the 72.7% league average. Opponents literally had a strategy called 'Hack-a-Shaq' to foul him before he could score.",
      tier: "Legend",
      bonusFTPct: 47.9
    },
    {
      name: "LeBron James",
      era: "2003–active",
      team: "CLE/MIA/LAL",
      pos: "F",
      method: "Freight-train drives, mid-range pull-ups, drawing contact in traffic",
      careerFTA: 11000,
      careerFTPct: 73.5,
      threePtFoulsDrawn: null,
      peakFTAperGame: 9.9,
      peakFTA: 701,
      fdpgPeak: 9.9,
      ruleChangeImpact: null,
      and1SeasonLeader: "2005-06 — 107 and-1 attempts, most in the league",
      notes: "Led the NBA with 107 and-1 attempts in 2005-06, converting the bonus FT at 73.8%. Consistent top-5 foul drawer for 20+ seasons. Career FTA rank will likely surpass Karl Malone's 13,188 all-time record.",
      tier: "Legend",
      bonusFTPct: 73.8
    },
    {
      name: "Karl Malone",
      era: "1985–2004",
      team: "UTA/LAL",
      pos: "F",
      method: "Physical post game, relentless drive to the basket, elbow jumpers with contact",
      careerFTA: 13188,
      careerFTPct: 74.2,
      threePtFoulsDrawn: null,   // pre-tracking era
      peakFTAperGame: 10.1,
      peakFTA: 918,
      fdpgPeak: 10.1,
      ruleChangeImpact: null,
      notes: "NBA's all-time leader in career FTA (13,188) and FTM (9,787). No play-by-play tracking exists for his era, but his volume is unmatched in recorded history. The Mailman delivered to the line more than anyone, ever.",
      tier: "Legend",
      bonusFTPct: 74.2
    },
    {
      name: "Dwyane Wade",
      era: "2003–2019",
      team: "MIA/CHI/CLE/GSW",
      pos: "G",
      method: "Explosive first step, attacking the rim, drawing contact mid-air",
      careerFTA: 7780,
      careerFTPct: 76.0,
      threePtFoulsDrawn: null,
      peakFTAperGame: 8.0,
      peakFTA: 629,
      fdpgPeak: 8.0,
      shootingFoulsLed: "Led NBA in shooting fouls drawn in 2006-07 (202)",
      notes: "The premier foul-drawing guard of the mid-2000s. Led the NBA in shooting fouls drawn in 2006-07 with 202. In 2004-05, drew 73 and-1 attempts (3rd in league) at a 79.5% bonus FT conversion rate.",
      tier: "Elite",
      bonusFTPct: 79.5
    },
    {
      name: "Giannis Antetokounmpo",
      era: "2013–active",
      team: "MIL",
      pos: "F",
      method: "Euro-step at full speed, baseline drives, overpowering at the rim",
      careerFTA: 5800,
      careerFTPct: 72.3,
      threePtFoulsDrawn: null,
      peakFTAperGame: 8.3,
      peakFTA: 604,
      fdpgPeak: 8.3,
      currentFDPG: 8.1,          // 2025-26 — highest rate in league
      notes: "The volume king of the modern era. Led the NBA in fouls drawn in 2022-23 (604, 8.3/game) and 2023-24 (507, 7.6/game). As of 2025-26, has the highest FDPG in the league at 8.1. Draws most fouls at the rim on drives — fewer and-1s per foul drawn than Harden.",
      tier: "Elite",
      bonusFTPct: 72.3
    },
    {
      name: "Trae Young",
      era: "2018–active",
      team: "ATL",
      pos: "G",
      method: "Deep pull-up 3s, hesitation dribbles, leaning into defenders",
      careerFTA: 3200,
      careerFTPct: 87.5,
      threePtFoulsDrawn: 194,    // through Oct 2021 — Fadeaway World
      peakFTAperGame: 8.7,
      peakFTA: 511,
      fdpgPeak: 8.7,
      ruleChangeImpact: { before: 8.7, after: 5.3 }, // FTA/game drop after 2021-22 rule change
      notes: "More than half of all shooting fouls Young drew came from beyond 10 feet — top of the league in jump-shot foul rate. FTA dropped from 8.7 to 5.3/game after the 2021-22 anti-foul-baiting rule change. Still elite at 87.5% FT% — when he gets the free throw, he almost always makes it.",
      tier: "Elite",
      bonusFTPct: 87.5
    },
    {
      name: "Luka Doncic",
      era: "2018–active",
      team: "DAL/LAL",
      pos: "G/F",
      method: "Step-back 3s, Euro-step, body control into contact, pump fakes",
      careerFTA: 3500,
      careerFTPct: 76.5,
      threePtFoulsDrawn: 194,    // through Oct 2021 — Fadeaway World
      peakFTAperGame: 7.1,
      peakFTA: 580,
      fdpgPeak: 7.1,
      currentFDPG: 7.3,          // 2025-26 — leading the NBA in total fouls drawn (461)
      ruleChangeImpact: { before: 7.1, after: 4.7 },
      notes: "Currently leading the NBA in total fouls drawn in 2025-26 (461, 7.3/game). 4th on the all-time 3-PT shooting fouls drawn list through 2021. His and-1s are a blend of rim attacks and sophisticated footwork drawing contact on mid-range and long-range attempts.",
      tier: "Elite",
      bonusFTPct: 76.5
    },
    {
      name: "Amare Stoudemire",
      era: "2002–2016",
      team: "PHO/NYK/DAL/MIA/CLE",
      pos: "F/C",
      method: "Pick-and-roll dives, athletic put-backs, power drives in transition",
      careerFTA: 5500,
      careerFTPct: 79.1,
      threePtFoulsDrawn: null,
      peakFTAperGame: 9.5,
      peakFTA: 634,
      and1SeasonLeader: "2004-05 — 95 and-1 attempts, most in the league",
      notes: "Led the NBA in and-1 attempts in 2004-05 with 95 — above even Shaq. His combination of athleticism and physical play in the paint made him one of the most efficient foul-drawers of the mid-2000s at 70.5% bonus FT conversion.",
      tier: "Great",
      bonusFTPct: 70.5
    },
    {
      name: "Allen Iverson",
      era: "1996–2010",
      team: "PHI/DEN/DET/MEM/MIL",
      pos: "G",
      method: "Crossover drives, reckless attacking of bigger defenders, never backing down",
      careerFTA: 6237,
      careerFTPct: 78.0,
      threePtFoulsDrawn: null,
      peakFTAperGame: 9.0,
      and1Pct2005: 78.9,         // bonus FT conversion rate 2004-05
      notes: "At 6 feet and 165 lbs, Iverson drew fouls against players a foot taller and 100 lbs heavier. Drew 57 and-1 attempts in 2004-05 and 68 in 2005-06, converting the bonus FT at 78-81%. The Answer answered even while getting beaten up on every drive.",
      tier: "Great",
      bonusFTPct: 78.9
    },
    {
      name: "Damian Lillard",
      era: "2012–active",
      team: "POR/MIL",
      pos: "G",
      method: "Logo 3s, late-clock pull-ups, drawing contact at mid-range",
      careerFTA: 4200,
      careerFTPct: 90.5,
      threePtFoulsDrawn: 201,    // through Oct 2021 — 4th all-time
      peakFTAperGame: 7.2,
      ruleChangeImpact: { before: 7.2, after: 3.9 },
      notes: "4th all-time in 3-point shooting fouls drawn through 2021 (201). Career FT% of 90.5% means when Lillard gets to the line after an and-1, it's almost automatic. One of the best bonus-FT converters among all high-volume foul drawers.",
      tier: "Great",
      bonusFTPct: 90.5
    },
    {
      name: "Stephen Curry",
      era: "2009–active",
      team: "GSW",
      pos: "G",
      method: "Off-ball movement, pull-up 3s off dribble, defenders desperately fouling on impossible shots",
      careerFTA: 3000,
      careerFTPct: 91.0,
      threePtFoulsDrawn: 190,    // through Oct 2021 — 5th all-time
      peakFTAperGame: 6.0,
      notes: "5th all-time in 3-point shooting fouls drawn through 2021 (190). Led the NBA in 3-PT shooting fouls drawn in 2020-21. At 91% career FT%, Curry is essentially perfect on the bonus FT after an and-1. The threat of his shot is so real that defenders panic and foul, then he coolly makes the free throw.",
      tier: "Great",
      bonusFTPct: 91.0
    },
    {
      name: "Shai Gilgeous-Alexander",
      era: "2018–active",
      team: "LAC/OKC",
      pos: "G",
      method: "Euro-step, hesitation drives, drawing contact at the rim through clever body angles",
      careerFTA: 3100,
      careerFTPct: 87.0,
      threePtFoulsDrawn: null,
      peakFTAperGame: 7.2,
      currentFDPG: 6.3,          // 2025-26
      notes: "2nd in the NBA in total fouls drawn in 2024-25 (467, 6.1/game). Draws contact through deceptive body control rather than brute force — makes defenders look like they fouled him without him doing anything wrong. 87% career FT% makes the bonus shot almost routine.",
      tier: "Great",
      bonusFTPct: 87.0
    }
  ],

  // ── And-1 Rate Leaders (making the shot when fouled) ───────────────────────
  // Source: 82games.com — 2004-05 and 2005-06 seasons
  // and1Pct = and-1s made / total shooting fouls drawn (% of fouls that resulted in a made basket)
  AND1_RATE: [
    // 2005-06
    { player: "Steve Nash",         season: "2005-06", team: "PHO", and1sMade: 28,  shootingFouls: 50,  and1Pct: 56.0, bonusFTpct: 85.7, notes: "Best pure and-1 rate in the dataset. Nash's body control and shooting motion made him nearly impossible to foul without him completing the shot." },
    { player: "Shaquille O'Neal",   season: "2005-06", team: "MIA", and1sMade: 73,  shootingFouls: 133, and1Pct: 54.9, bonusFTpct: 47.9, notes: "2nd-best and-1 rate on large sample. Made it into a finished basket over 54% of times fouled — then bricked the free throw half the time." },
    { player: "Sebastian Telfair",  season: "2005-06", team: "POR", and1sMade: 26,  shootingFouls: 53,  and1Pct: 49.1, bonusFTpct: 76.9, notes: "Small guard, big contact rate. 3rd-best and-1 rate in the league that season." },
    { player: "Joe Johnson",        season: "2005-06", team: "ATL", and1sMade: 36,  shootingFouls: 78,  and1Pct: 46.2, bonusFTpct: 80.6, notes: "Silky scorer who finished through contact consistently." },
    { player: "Devin Harris",       season: "2005-06", team: "DAL", and1sMade: 29,  shootingFouls: 63,  and1Pct: 46.0, bonusFTpct: 82.8, notes: "Fast guard who drew fouls finishing at the rim." },
    // 2004-05
    { player: "Jalen Rose",         season: "2004-05", team: "TOR", and1sMade: 40,  shootingFouls: 87,  and1Pct: 46.0, bonusFTpct: 77.5, notes: "Surprising leader — Rose's knack for drawing contact while finishing put him top of the league." },
    { player: "Elton Brand",        season: "2004-05", team: "LAC", and1sMade: 69,  shootingFouls: 160, and1Pct: 43.1, bonusFTpct: 79.7, notes: "Power forward who made the basket even when defenders tried to foul him out of the shot. Large sample, high rate." },
    { player: "Dan Gadzuric",       season: "2004-05", team: "MIL", and1sMade: 29,  shootingFouls: 69,  and1Pct: 42.0, bonusFTpct: 65.5, notes: "Shot-finisher type big man." },
    { player: "Eddie Jones",        season: "2004-05", team: "MIA", and1sMade: 22,  shootingFouls: 53,  and1Pct: 41.5, bonusFTpct: 81.8, notes: "Slashing wing with good contact finishing." },
    { player: "Eddy Curry",         season: "2004-05", team: "CHI", and1sMade: 46,  shootingFouls: 117, and1Pct: 39.3, bonusFTpct: 73.9, notes: "Young center with natural finishing ability at the rim." },
  ],

  // ── Bonus FT Conversion After an And-1 ────────────────────────────────────
  // Who makes the free throw after completing the and-1?
  // Source: 82games.com 2004-05 and 2005-06 seasons
  BONUS_FT: {
    best: [
      { player: "Richard Jefferson", season: "2004-05", ftm: 17, fta: 17, pct: 100.0, notes: "Perfect — didn't miss a single and-1 bonus FT all season." },
      { player: "Damon Stoudamire",  season: "2004-05", ftm: 15, fta: 15, pct: 100.0, notes: "Perfect on the bonus free throw." },
      { player: "Jason Terry",       season: "2004-05", ftm: 15, fta: 15, pct: 100.0, notes: "The Jet was automatic from the stripe after an and-1." },
      { player: "Ray Allen",         season: "2004-05", ftm: 20, fta: 21, pct: 95.2,  notes: "One of the most automatic shooters ever, even at the line after getting fouled mid-shot." },
      { player: "Marquis Daniels",   season: "2004-05", ftm: 20, fta: 22, pct: 90.9,  notes: "Elite bonus FT conversion." },
      { player: "Steve Nash",        season: "2005-06", ftm: 24, fta: 28, pct: 85.7,  notes: "Nash was lethal at every stage: made the shot (56% rate) AND the bonus FT (85.7%)." },
      { player: "Kobe Bryant",       season: "2005-06", ftm: 57, fta: 68, pct: 83.8,  notes: "Elite and-1 bonus FT% — clutch at every stage of the and-1 sequence." },
      { player: "Steve Francis",     season: "2004-05", ftm: 46, fta: 54, pct: 85.2,  notes: "One of the better bonus FT converters on volume." },
    ],
    worst: [
      { player: "Ben Wallace",       season: "2005-06", ftm: 6,  fta: 27, pct: 22.2,  notes: "Historically bad — made only 6 of 27 and-1 bonus free throws. Career FT% was also an embarrassing 41.4%." },
      { player: "Ben Wallace",       season: "2004-05", ftm: 11, fta: 30, pct: 36.7,  notes: "Consistent disaster from the line. Two seasons of data confirm this was no fluke." },
      { player: "Danny Foster",      season: "2004-05", ftm: 6,  fta: 18, pct: 33.3,  notes: "Missed two-thirds of all and-1 bonus free throws." },
      { player: "Eric Dampier",      season: "2004-05", ftm: 8,  fta: 20, pct: 40.0,  notes: "Big man who couldn't convert from the line." },
      { player: "Shaquille O'Neal",  season: "2004-05", ftm: 42, fta: 93, pct: 45.2,  notes: "On the largest and-1 sample in the league (93 attempts) Shaq converted less than half. The ultimate and-1 paradox: brilliant at completing the shot, terrible at the free throw." },
      { player: "Shaquille O'Neal",  season: "2005-06", ftm: 35, fta: 73, pct: 47.9,  notes: "Consistent. On 73 and-1 attempts, still under 50% on the bonus FT." },
      { player: "Antoine Walker",    season: "2004-05", ftm: 15, fta: 32, pct: 46.9,  notes: "Below-average conversion despite being a prolific foul drawer." },
    ]
  },

  // ── Rule Change Impact (2021-22) ─────────────────────────────────────────
  RULE_CHANGE: {
    year: "2021-22",
    description: "The NBA banned 'non-basketball moves' designed purely to draw fouls: jumping into defenders on 3-pointers, pump-faking to draw contact, abrupt stops to generate contact. The rule specifically targeted James Harden and Trae Young-style foul baiting.",
    players: [
      { name: "James Harden",    ftaBefore: 11.8, ftaAfter: 5.7,  drop: 6.1,  pctDrop: 51.7 },
      { name: "Bradley Beal",    ftaBefore: 7.7,  ftaAfter: 4.2,  drop: 3.5,  pctDrop: 45.5 },
      { name: "Trae Young",      ftaBefore: 8.7,  ftaAfter: 5.3,  drop: 3.4,  pctDrop: 39.1 },
      { name: "Damian Lillard",  ftaBefore: 7.2,  ftaAfter: 3.9,  drop: 3.3,  pctDrop: 45.8 },
      { name: "Luka Doncic",     ftaBefore: 7.1,  ftaAfter: 4.7,  drop: 2.4,  pctDrop: 33.8 },
    ]
  },

  // ── Current Season Leaders (2024-25 proxy for modern and-1 activity) ──────
  CURRENT_LEADERS: [
    { rank: 1,  name: "Giannis Antetokounmpo", team: "MIL", fdTotal: 507, fdpg: 7.6,  ftPct: 72.3, season: "2024-25" },
    { rank: 2,  name: "Shai Gilgeous-Alexander", team: "OKC", fdTotal: 467, fdpg: 6.1, ftPct: 87.0, season: "2024-25" },
    { rank: 3,  name: "Trae Young",             team: "ATL", fdTotal: 430, fdpg: 5.7,  ftPct: 87.5, season: "2024-25" },
    { rank: 4,  name: "Nikola Jokic",           team: "DEN", fdTotal: 410, fdpg: 5.9,  ftPct: 82.4, season: "2024-25" },
    { rank: 5,  name: "Jalen Brunson",          team: "NYK", fdTotal: 410, fdpg: 6.3,  ftPct: 88.0, season: "2024-25" },
    { rank: 6,  name: "Alperen Sengun",         team: "HOU", fdTotal: 406, fdpg: 5.3,  ftPct: 73.5, season: "2024-25" },
    { rank: 7,  name: "Devin Booker",           team: "PHX", fdTotal: 404, fdpg: 5.4,  ftPct: 88.7, season: "2024-25" },
    { rank: 8,  name: "James Harden",           team: "LAC", fdTotal: 371, fdpg: 4.7,  ftPct: 86.1, season: "2024-25" },
  ],

  // ── League-wide averages (82games.com 2005-06) ────────────────────────────
  LEAGUE_AVERAGES: {
    season: "2005-06",
    and1PctOfShootingFouls: 28.2,   // % of shooting fouls that resulted in a completed basket
    bonusFTConversionRate: 72.7     // % of bonus and-1 free throws made, league-wide
  }
};
