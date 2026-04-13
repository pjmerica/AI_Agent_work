// ─────────────────────────────────────────────────────────────────────────────
// US Wealth & Income Percentile Data
//
// Sources:
//   Net Worth  — Federal Reserve Survey of Consumer Finances (SCF) 2022
//                Official Fed CSV: federalreserve.gov/econres/scf/dataviz/download/zips/scf.zip
//                Percentile breakpoints via DQYDJ (direct SCF 2022 microdata analysis)
//
//   Income     — IPUMS Current Population Survey (CPS) 2024 full-year data
//                Percentile breakpoints via DQYDJ (direct CPS microdata analysis)
//
// All dollar values are in nominal USD (net worth ~2022–23, income ~2024).
//
// Age brackets for income match CPS survey age groupings.
// Net worth brackets use 5-year SCF age bands, consolidated to match SCF bulletin groups.
//
// Percentile array format: [percentile_floor, min_dollar_to_reach_that_percentile]
// Linear interpolation is used between anchor points.
//
// "Individual" income = personal pre-tax earnings (workers 15+).
// "Household" income = all sources, all members combined.
// Net worth is always a household balance sheet measure (SCF unit of observation).
// For "individual" net worth we use the SCF data directly — the SCF actually surveys
// family units, so individual vs household is a UI distinction here, not a data one.
// ─────────────────────────────────────────────────────────────────────────────

var DATA = {

  // ── NET WORTH (SCF 2022) ───────────────────────────────────────────────────
  // Anchor points: 25th / 50th / 75th / 90th / top-1% from DQYDJ SCF 2022 analysis.
  // Mean & median by age bracket from the official Fed bulletin CSV.
  // 10th percentile estimated from SCF published lower-tail data.
  // Values in $thousands converted to whole dollars.

  netWorth: {
    // SCF measures household net worth. We use the same data for both
    // household and individual tracks; the toggle mainly affects income.
    household: {
      all: {
        // Fed SCF 2022 official summary (all families)
        mean:   1059470,
        median:  192084,
        percentiles: [
          [0,   -50000],
          [10,   -3600],
          [20,    5000],
          [25,   12000],
          [30,   26000],
          [40,   72000],
          [50,  192084],
          [75,  762000],
          [90, 1920758],
          [95, 3779600],
          [99,13666778],
          [100,100000000]
        ]
      },
      // Age brackets consolidated from DQYDJ 5-year bands → SCF bulletin bands
      // SCF bulletin: under35, 35-44, 45-54, 55-64, 65-74, 75+
      under35: {
        // Weighted avg of DQYDJ 18-24, 25-29, 30-34 bands
        // Fed CSV 2022: median=39,040 mean=183,376 (thousands)
        mean:   183376,
        median:  39040,
        percentiles: [
          [0,   -25000],
          [10,   -5000],
          [20,    1000],
          [25,    3784],  // DQYDJ 25-29 p25
          [50,   39040],  // Fed CSV median
          [75,  130606],  // DQYDJ 25-29 p75
          [90,  296830],  // DQYDJ 25-29 p90
          [95,  700000],
          [99, 2121910],  // DQYDJ 25-29 top1%
          [100,15000000]
        ]
      },
      age3544: {
        // DQYDJ 35-39 and 40-44 bands averaged
        // Fed CSV 2022: median=135,300 mean=548,072
        mean:   548072,
        median: 135300,
        percentiles: [
          [0,   -30000],
          [10,   -2000],
          [20,    9000],
          [25,   20180],  // avg of DQYDJ 35-39 ($16,548) and 40-44 ($23,812)
          [50,  135300],  // Fed CSV median
          [75,  413162],  // avg of DQYDJ 35-39 ($389,432) and 40-44 ($436,892)
          [90, 1023460],  // avg of DQYDJ 35-39 ($864,340) and 40-44 ($1,182,580)
          [95, 2000000],
          [99, 6288370],  // avg of DQYDJ 35-39 ($4,741,320) and 40-44 ($7,835,420)
          [100,50000000]
        ]
      },
      age4554: {
        // DQYDJ 45-49 and 50-54 bands averaged
        // Fed CSV 2022: median=246,700 mean=971,274
        mean:   971274,
        median: 246700,
        percentiles: [
          [0,   -40000],
          [10,   -1000],
          [20,   18000],
          [25,   51041],  // avg of DQYDJ 45-49 ($47,668) and 50-54 ($54,414)
          [50,  246700],  // Fed CSV median
          [75,  796655],  // avg of DQYDJ 45-49 ($680,298) and 50-54 ($913,012)
          [90, 2002627],  // avg of DQYDJ 45-49 ($1,428,714) and 50-54 ($2,576,540)
          [95, 4000000],
          [99,10966720],  // avg of DQYDJ 45-49 ($8,701,500) and 50-54 ($13,231,940)
          [100,80000000]
        ]
      },
      age5564: {
        // DQYDJ 55-59 and 60-64 bands averaged
        // Fed CSV 2022: median=364,270 mean=1,564,072
        mean:  1564072,
        median: 364270,
        percentiles: [
          [0,   -30000],
          [10,    5000],
          [20,   30000],
          [25,   82675],  // avg of DQYDJ 55-59 ($84,977) and 60-64 ($80,372)
          [50,  364270],  // Fed CSV median
          [75, 1134220],  // avg of DQYDJ 55-59 ($1,137,318) and 60-64 ($1,131,122)
          [90, 2857220],  // avg of DQYDJ 55-59 ($2,672,160) and 60-64 ($3,042,280)
          [95, 6000000],
          [99,16620822],  // avg of DQYDJ 55-59 and 60-64
          [100,100000000]
        ]
      },
      age6574: {
        // DQYDJ 65-69 and 70-74 bands averaged
        // Fed CSV 2022: median=410,000 mean=1,780,715
        mean:  1780715,
        median: 410000,
        percentiles: [
          [0,   -10000],
          [10,   10000],
          [20,   42000],
          [25,   96865],  // avg of DQYDJ 65-69 ($68,972) and 70-74 ($124,757)
          [50,  410000],  // Fed CSV median
          [75, 1194749],  // avg of DQYDJ 65-69 ($1,154,552) and 70-74 ($1,234,946)
          [90, 2980228],  // avg of DQYDJ 65-69 ($2,961,060) and 70-74 ($2,999,396)
          [95, 6500000],
          [99,20432120],  // avg of DQYDJ 65-69 and 70-74
          [100,100000000]
        ]
      },
      age75plus: {
        // DQYDJ 75-79 and 80+ bands averaged
        // Fed CSV 2022: median=334,700 mean=1,620,104
        mean:  1620104,
        median: 334700,
        percentiles: [
          [0,    -5000],
          [10,    8000],
          [20,   36000],
          [25,   92367],  // avg of DQYDJ 75-79 ($89,504) and 80+ ($95,230)
          [50,  334700],  // Fed CSV median
          [75,  967927],  // avg of DQYDJ 75-79 ($991,520) and 80+ ($944,334)
          [90, 2727344],  // avg of DQYDJ 75-79 ($2,914,188) and 80+ ($2,540,500)
          [95, 5500000],
          [99,18049347],  // avg of DQYDJ 75-79 and 80+
          [100,100000000]
        ]
      }
    },

    // Individual net worth uses same SCF data (SCF is household-level)
    individual: null  // resolved at runtime to same as household
  },

  // ── INCOME ────────────────────────────────────────────────────────────────
  // Individual: IPUMS CPS 2024 full-year data via DQYDJ
  // Household: CPS 2024 via Census/DQYDJ

  income: {
    household: {
      all: {
        // DQYDJ CPS 2025 household overall
        mean:   102300,
        median:  83592,
        percentiles: [
          [0,       0],
          [10,  15000],
          [20,  27000],
          [25,  33000],
          [30,  40000],
          [40,  54000],
          [50,  83592],
          [75, 145000],
          [90, 251036],
          [95, 335575],
          [99, 659060],
          [100,5000000]
        ]
      },
      // Household income by age — derived from individual CPS data scaled for
      // typical household size (individual × ~1.45 for working-age households)
      under35: {
        mean:   79000,
        median:  65000,
        percentiles: [
          [0,       0],
          [10,  10000],
          [20,  21000],
          [25,  27000],
          [30,  34000],
          [40,  48000],
          [50,  65000],
          [75, 110000],
          [90, 180000],
          [95, 245000],
          [99, 520000],
          [100,3000000]
        ]
      },
      age3544: {
        mean:  120000,
        median:  96000,
        percentiles: [
          [0,       0],
          [10,  18000],
          [20,  36000],
          [25,  45000],
          [30,  54000],
          [40,  70000],
          [50,  96000],
          [75, 168000],
          [90, 285000],
          [95, 390000],
          [99, 820000],
          [100,5000000]
        ]
      },
      age4554: {
        mean:  128000,
        median:  98000,
        percentiles: [
          [0,       0],
          [10,  16000],
          [20,  34000],
          [25,  43000],
          [30,  53000],
          [40,  70000],
          [50,  98000],
          [75, 173000],
          [90, 295000],
          [95, 405000],
          [99, 850000],
          [100,5000000]
        ]
      },
      age5564: {
        mean:  113000,
        median:  85000,
        percentiles: [
          [0,       0],
          [10,  13000],
          [20,  28000],
          [25,  36000],
          [30,  45000],
          [40,  62000],
          [50,  85000],
          [75, 152000],
          [90, 262000],
          [95, 363000],
          [99, 770000],
          [100,5000000]
        ]
      },
      age6574: {
        mean:   79000,
        median:  57000,
        percentiles: [
          [0,       0],
          [10,   7000],
          [20,  16000],
          [25,  21000],
          [30,  27000],
          [40,  40000],
          [50,  57000],
          [75, 103000],
          [90, 183000],
          [95, 258000],
          [99, 560000],
          [100,5000000]
        ]
      },
      age75plus: {
        mean:   55000,
        median:  38000,
        percentiles: [
          [0,       0],
          [10,   4000],
          [20,  11000],
          [25,  14000],
          [30,  18000],
          [40,  27000],
          [50,  38000],
          [75,  73000],
          [90, 133000],
          [95, 192000],
          [99, 440000],
          [100,5000000]
        ]
      }
    },

    individual: {
      all: {
        // DQYDJ IPUMS CPS 2024 full-year
        mean:   77652,
        median:  53010,
        percentiles: [
          [0,       0],
          [10,   8000],
          [20,  18000],
          [25,  23000],
          [30,  29000],
          [40,  39000],
          [50,  53010],
          [75, 100000],
          [90, 155042],
          [95, 210351],
          [99, 450100],
          [100,5000000]
        ]
      },
      // DQYDJ IPUMS CPS by age (10th/25th/50th/75th/90th are direct from source)
      under35: {
        // Using age 25 and 30 from DQYDJ as anchors
        mean:   48000,
        median:  43000,
        percentiles: [
          [0,       0],
          [10,  10061],  // DQYDJ age 25
          [25,  24013],  // DQYDJ age 25
          [50,  43000],  // midpoint age 25 ($41,150) and age 30 ($52,002)
          [75,  74000],  // midpoint age 25 ($65,000) and age 30 ($84,017)
          [90, 112000],  // midpoint age 25 ($94,040) and age 30 ($130,030)
          [95, 160000],
          [99, 380000],
          [100,3000000]
        ]
      },
      age3544: {
        // DQYDJ age 35 and 40 anchors
        mean:   75000,
        median:  61000,
        percentiles: [
          [0,       0],
          [10,  19054],  // avg DQYDJ age 35 ($18,906) and 40 ($19,201)
          [25,  36260],  // avg DQYDJ age 35 ($33,520) and 40 ($39,000)
          [50,  60985],  // avg DQYDJ age 35 ($60,000) and 40 ($61,970)
          [75, 103010],  // avg DQYDJ age 35 ($100,000) and 40 ($106,020)
          [90, 172501],  // avg DQYDJ age 35 ($167,000) and 40 ($178,001)
          [95, 250000],
          [99, 560000],
          [100,5000000]
        ]
      },
      age4554: {
        // DQYDJ age 45 and 50 anchors
        mean:   82000,
        median:  66000,
        percentiles: [
          [0,       0],
          [10,  19000],  // avg DQYDJ age 45 ($20,000) and 50 ($18,000)
          [25,  37186],  // avg DQYDJ age 45 ($37,440) and 50 ($36,931)
          [50,  66072],  // avg DQYDJ age 45 ($67,144) and 50 ($65,000)
          [75, 115251],  // avg DQYDJ age 45 ($117,001) and 50 ($113,501)
          [90, 190500],  // avg DQYDJ age 45 ($190,100) and 50 ($190,900)
          [95, 275000],
          [99, 620000],
          [100,5000000]
        ]
      },
      age5564: {
        // DQYDJ age 55 and 60 anchors
        mean:   76000,
        median:  63000,
        percentiles: [
          [0,       0],
          [10,  21050],  // avg DQYDJ age 55 ($22,200) and 60 ($19,900)
          [25,  36340],  // avg DQYDJ age 55 ($36,680) and 60 ($36,000)
          [50,  62676],  // avg DQYDJ age 55 ($63,350) and 60 ($62,001)
          [75, 105850],  // avg DQYDJ age 55 ($110,000) and 60 ($101,700)
          [90, 170030],  // avg DQYDJ age 55 ($170,000) and 60 ($170,060)
          [95, 248000],
          [99, 560000],
          [100,5000000]
        ]
      },
      age6574: {
        // DQYDJ age 65 and 70 anchors
        mean:   52000,
        median:  67000,
        percentiles: [
          [0,       0],
          [10,  21679],  // avg DQYDJ age 65 ($22,000) and 70 ($21,358)
          [25,  39021],  // avg DQYDJ age 65 ($40,041) and 70 ($38,000)
          [50,  66728],  // avg DQYDJ age 65 ($70,001) and 70 ($63,455)
          [75, 118625],  // avg DQYDJ age 65 ($114,850) and 70 ($122,400)
          [90, 202405],  // avg DQYDJ age 65 ($201,805) and 70 ($203,005)
          [95, 295000],
          [99, 660000],
          [100,5000000]
        ]
      },
      age75plus: {
        // Extrapolated from DQYDJ age 70 trend; income drops significantly at 75+
        mean:   38000,
        median:  24000,
        percentiles: [
          [0,       0],
          [10,   5000],
          [25,  12000],
          [50,  24000],
          [75,  52000],
          [90,  98000],
          [95, 148000],
          [99, 360000],
          [100,5000000]
        ]
      }
    }
  },

  // Age bracket lookup keys
  ageBrackets: [
    { key: 'all',       label: 'All Ages' },
    { key: 'under35',   label: 'Under 35' },
    { key: 'age3544',   label: '35–44' },
    { key: 'age4554',   label: '45–54' },
    { key: 'age5564',   label: '55–64' },
    { key: 'age6574',   label: '65–74' },
    { key: 'age75plus', label: '75+' }
  ]
};

// Individual net worth = same SCF data as household (SCF measures family units)
DATA.netWorth.individual = DATA.netWorth.household;

// ── STATE DATA ────────────────────────────────────────────────────────────────
// Household income median: Census Bureau ACS 1-Year 2023 (API: B19013_001E)
// Individual earnings median: Census Bureau ACS 1-Year 2023 (B20004_001E, all workers)
// Net worth median: Census Bureau SIPP 2023 / SmartAsset analysis of SIPP data
//   (43 states available; 7 missing states use national median as fallback)
// All values in nominal USD.
//
// The state data is used to show state-specific medians/means alongside
// national percentile calculations. Percentile rank is always vs. the US.
//
// stateIncomeMeanRatio: ratio of state mean to national mean, derived from
//   aggregate / household count (ACS B19025 / B11001) — used to scale mean.

DATA.states = {
  // key: 2-letter code
  // hhMedian: household income median (ACS 2023)
  // indMedian: individual earnings median (ACS 2023, all workers)
  // nwMedian: net worth median (SIPP 2023 / SmartAsset)
  // nwMean: net worth mean (Empower 2024 where available, else estimated)
  'AL': { name: 'Alabama',        hhMedian: 62212,  indMedian: 45781, nwMedian: 103500,  nwMean: 310000  },
  'AK': { name: 'Alaska',         hhMedian: 86631,  indMedian: 53103, nwMedian: 210000,  nwMean: 520000  },
  'AZ': { name: 'Arizona',        hhMedian: 77315,  indMedian: 50828, nwMedian: 204300,  nwMean: 530000  },
  'AR': { name: 'Arkansas',       hhMedian: 58700,  indMedian: 42469, nwMedian: 62500,   nwMean: 260000  },
  'CA': { name: 'California',     hhMedian: 95521,  indMedian: 54363, nwMedian: 273800,  nwMean: 854715  },
  'CO': { name: 'Colorado',       hhMedian: 92911,  indMedian: 59076, nwMedian: 370000,  nwMean: 680000  },
  'CT': { name: 'Connecticut',    hhMedian: 91665,  indMedian: 60473, nwMedian: 253100,  nwMean: 919784  },
  'DE': { name: 'Delaware',       hhMedian: 81361,  indMedian: 51089, nwMedian: 192084,  nwMean: 500000  },
  'DC': { name: 'Washington D.C.',hhMedian: 108210, indMedian: 93761, nwMedian: 192084,  nwMean: 580000  },
  'FL': { name: 'Florida',        hhMedian: 73311,  indMedian: 46301, nwMedian: 255100,  nwMean: 590000  },
  'GA': { name: 'Georgia',        hhMedian: 74632,  indMedian: 49406, nwMedian: 167000,  nwMean: 460000  },
  'HI': { name: 'Hawaii',         hhMedian: 95322,  indMedian: 51524, nwMedian: 692700,  nwMean: 900000  },
  'ID': { name: 'Idaho',          hhMedian: 74942,  indMedian: 47035, nwMedian: 313400,  nwMean: 560000  },
  'IL': { name: 'Illinois',       hhMedian: 80306,  indMedian: 53090, nwMedian: 209500,  nwMean: 701465  },
  'IN': { name: 'Indiana',        hhMedian: 69477,  indMedian: 48641, nwMedian: 141300,  nwMean: 400000  },
  'IA': { name: 'Iowa',           hhMedian: 71433,  indMedian: 49828, nwMedian: 177100,  nwMean: 430000  },
  'KS': { name: 'Kansas',         hhMedian: 70333,  indMedian: 48154, nwMedian: 144200,  nwMean: 390000  },
  'KY': { name: 'Kentucky',       hhMedian: 61118,  indMedian: 45640, nwMedian: 81900,   nwMean: 290000  },
  'LA': { name: 'Louisiana',      hhMedian: 58229,  indMedian: 44339, nwMedian: 85230,   nwMean: 290000  },
  'ME': { name: 'Maine',          hhMedian: 73733,  indMedian: 49548, nwMedian: 303700,  nwMean: 560000  },
  'MD': { name: 'Maryland',       hhMedian: 98678,  indMedian: 61901, nwMedian: 330500,  nwMean: 690000  },
  'MA': { name: 'Massachusetts',  hhMedian: 99858,  indMedian: 65055, nwMedian: 394900,  nwMean: 798064  },
  'MI': { name: 'Michigan',       hhMedian: 69183,  indMedian: 49307, nwMedian: 167000,  nwMean: 430000  },
  'MN': { name: 'Minnesota',      hhMedian: 85086,  indMedian: 56612, nwMedian: 271300,  nwMean: 590000  },
  'MS': { name: 'Mississippi',    hhMedian: 54203,  indMedian: 41175, nwMedian: 87280,   nwMean: 260000  },
  'MO': { name: 'Missouri',       hhMedian: 68545,  indMedian: 47569, nwMedian: 118700,  nwMean: 360000  },
  'MT': { name: 'Montana',        hhMedian: 70804,  indMedian: 46301, nwMedian: 258100,  nwMean: 530000  },
  'NE': { name: 'Nebraska',       hhMedian: 74590,  indMedian: 50478, nwMedian: 285800,  nwMean: 540000  },
  'NV': { name: 'Nevada',         hhMedian: 76364,  indMedian: 46956, nwMedian: 173700,  nwMean: 440000  },
  'NH': { name: 'New Hampshire',  hhMedian: 96838,  indMedian: 59090, nwMedian: 412600,  nwMean: 735986  },
  'NJ': { name: 'New Jersey',     hhMedian: 99781,  indMedian: 61141, nwMedian: 312400,  nwMean: 840178  },
  'NM': { name: 'New Mexico',     hhMedian: 62268,  indMedian: 42156, nwMedian: 77500,   nwMean: 270000  },
  'NY': { name: 'New York',       hhMedian: 82095,  indMedian: 55643, nwMedian: 132800,  nwMean: 691127  },
  'NC': { name: 'North Carolina', hhMedian: 70804,  indMedian: 48491, nwMedian: 170400,  nwMean: 430000  },
  'ND': { name: 'North Dakota',   hhMedian: 76525,  indMedian: 52196, nwMedian: 192084,  nwMean: 480000  },
  'OH': { name: 'Ohio',           hhMedian: 67769,  indMedian: 50072, nwMedian: 154400,  nwMean: 400000  },
  'OK': { name: 'Oklahoma',       hhMedian: 62138,  indMedian: 44059, nwMedian: 78510,   nwMean: 280000  },
  'OR': { name: 'Oregon',         hhMedian: 80160,  indMedian: 51388, nwMedian: 248900,  nwMean: 560000  },
  'PA': { name: 'Pennsylvania',   hhMedian: 73824,  indMedian: 51475, nwMedian: 207700,  nwMean: 540000  },
  'RI': { name: 'Rhode Island',   hhMedian: 84972,  indMedian: 55673, nwMedian: 192084,  nwMean: 500000  },
  'SC': { name: 'South Carolina', hhMedian: 67804,  indMedian: 46397, nwMedian: 129900,  nwMean: 380000  },
  'SD': { name: 'South Dakota',   hhMedian: 71810,  indMedian: 47960, nwMedian: 192084,  nwMean: 450000  },
  'TN': { name: 'Tennessee',      hhMedian: 67631,  indMedian: 47036, nwMedian: 172000,  nwMean: 420000  },
  'TX': { name: 'Texas',          hhMedian: 75780,  indMedian: 50193, nwMedian: 149500,  nwMean: 480000  },
  'UT': { name: 'Utah',           hhMedian: 93421,  indMedian: 52189, nwMedian: 282800,  nwMean: 580000  },
  'VT': { name: 'Vermont',        hhMedian: 81211,  indMedian: 52216, nwMedian: 192084,  nwMean: 792981  },
  'VA': { name: 'Virginia',       hhMedian: 89931,  indMedian: 56944, nwMedian: 219100,  nwMean: 698783  },
  'WA': { name: 'Washington',     hhMedian: 94605,  indMedian: 61328, nwMedian: 456500,  nwMean: 842139  },
  'WV': { name: 'West Virginia',  hhMedian: 55948,  indMedian: 43837, nwMedian: 115000,  nwMean: 310000  },
  'WI': { name: 'Wisconsin',      hhMedian: 74631,  indMedian: 51525, nwMedian: 188000,  nwMean: 470000  },
  'WY': { name: 'Wyoming',        hhMedian: 72415,  indMedian: 47121, nwMedian: 192084,  nwMean: 470000  }
};
DATA.cities = {
  // 643 US cities with population 65,000+ (ACS 1-Year 2023)
  // hhMedian/indMedian: Census ACS B19013/B20004 (exact survey data)
  // nwMedian/nwMean: estimated from ACS median home value (B25077) × scaling factor
  //   (net worth by city is not directly surveyed; home value is the primary driver)
  'Abilene, TX':{hhMedian:57953,indMedian:40585, nwMedian:122976, nwMean:273280},
  'Akron, OH':{hhMedian:50025,indMedian:40019, nwMedian:82908, nwMean:184240},
  'Alafaya, FL':{hhMedian:102898,indMedian:51140, nwMedian:289170, nwMean:642600},
  'Alameda, CA':{hhMedian:121817,indMedian:82273, nwMedian:706986, nwMean:1571080},
  'Albany, GA':{hhMedian:45624,indMedian:40435, nwMedian:87885, nwMean:195300},
  'Albany, NY':{hhMedian:61390,indMedian:50033, nwMedian:145845, nwMean:324100},
  'Albuquerque, NM':{hhMedian:67907,indMedian:46893, nwMedian:189063, nwMean:420140},
  'Alexandria, VA':{hhMedian:110294,indMedian:76167, nwMedian:464877, nwMean:1033060},
  'Alhambra, CA':{hhMedian:79637,indMedian:49298, nwMedian:524790, nwMean:1166200},
  'Allen, TX':{hhMedian:126549,indMedian:70443, nwMedian:337428, nwMean:749840},
  'Allentown, PA':{hhMedian:47175,indMedian:36970, nwMedian:133182, nwMean:295960},
  'Alpharetta, GA':{hhMedian:140188,indMedian:81737, nwMedian:422478, nwMean:938840},
  'Amarillo, TX':{hhMedian:58897,indMedian:44444, nwMedian:120141, nwMean:266980},
  'Ames, IA':{hhMedian:58693,indMedian:49695, nwMedian:171990, nwMean:382200},
  'Anaheim, CA':{hhMedian:84872,indMedian:45603, nwMedian:520821, nwMean:1157380},
  'Anchorage, AK':{hhMedian:94437,indMedian:60671, nwMedian:243117, nwMean:540260},
  'Ankeny, IA':{hhMedian:105862,indMedian:61913, nwMedian:210735, nwMean:468300},
  'Ann Arbor, MI':{hhMedian:76207,indMedian:63014, nwMedian:275562, nwMean:612360},
  'Antioch, CA':{hhMedian:91256,indMedian:56285, nwMedian:399294, nwMean:887320},
  'Apex, NC':{hhMedian:151386,indMedian:104712, nwMedian:383229, nwMean:851620},
  'Apple Valley, CA':{hhMedian:77159,indMedian:55813, nwMedian:269388, nwMean:598640},
  'Appleton, WI':{hhMedian:73449,indMedian:51998, nwMedian:149499, nwMean:332220},
  'Arden-Arcade, CA':{hhMedian:89781,indMedian:52405, nwMedian:368046, nwMean:817880},
  'Arlington Heights, IL':{hhMedian:106051,indMedian:71697, nwMedian:250110, nwMean:555800},
  'Arlington, TX':{hhMedian:69208,indMedian:45209, nwMedian:197001, nwMean:437780},
  'Arlington, VA':{hhMedian:140219,indMedian:97469, nwMedian:536067, nwMean:1191260},
  'Arvada, CO':{hhMedian:114384,indMedian:68588, nwMedian:404397, nwMean:898660},
  'Asheville, NC':{hhMedian:66032,indMedian:45711, nwMedian:293454, nwMean:652120},
  'Atascocita, TX':{hhMedian:97244,indMedian:61854, nwMedian:196119, nwMean:435820},
  'Athens-Clarke County, GA':{hhMedian:53775,indMedian:42425, nwMedian:201159, nwMean:447020},
  'Atlanta, GA':{hhMedian:85880,indMedian:70281, nwMedian:279279, nwMean:620620},
  'Auburn, AL':{hhMedian:52259,indMedian:55423, nwMedian:230265, nwMean:511700},
  'Auburn, WA':{hhMedian:92824,indMedian:55602, nwMedian:350217, nwMean:778260},
  'Augusta-Richmond County, GA':{hhMedian:51943,indMedian:36279, nwMedian:122913, nwMean:273140},
  'Aurora, CO':{hhMedian:89300,indMedian:51541, nwMedian:303219, nwMean:673820},
  'Aurora, IL':{hhMedian:89658,indMedian:50435, nwMedian:174699, nwMean:388220},
  'Austin, TX':{hhMedian:91501,indMedian:65382, nwMedian:378378, nwMean:840840},
  'Avondale, AZ':{hhMedian:86428,indMedian:50779, nwMedian:255087, nwMean:566860},
  'Bakersfield, CA':{hhMedian:79355,indMedian:44902, nwMedian:236754, nwMean:526120},
  'Baldwin Park, CA':{hhMedian:78662,indMedian:40244, nwMedian:378567, nwMean:841260},
  'Baltimore, MD':{hhMedian:59579,indMedian:51063, nwMedian:152397, nwMean:338660},
  'Baton Rouge, LA':{hhMedian:41651,indMedian:40111, nwMedian:143514, nwMean:318920},
  'Bayonne, NJ':{hhMedian:73669,indMedian:51512, nwMedian:308259, nwMean:685020},
  'Baytown, TX':{hhMedian:57421,indMedian:40073, nwMedian:132489, nwMean:294420},
  'Beaumont, TX':{hhMedian:60010,indMedian:42446, nwMedian:106596, nwMean:236880},
  'Beaverton, OR':{hhMedian:92650,indMedian:60948, nwMedian:356895, nwMean:793100},
  'Bellevue, WA':{hhMedian:158253,indMedian:111077, nwMedian:849996, nwMean:1888880},
  'Bellflower, CA':{hhMedian:76296,indMedian:41705, nwMedian:474138, nwMean:1053640},
  'Bellingham, WA':{hhMedian:54867,indMedian:49507, nwMedian:395640, nwMean:879200},
  'Bend, OR':{hhMedian:95527,indMedian:58933, nwMedian:453915, nwMean:1008700},
  'Berkeley, CA':{hhMedian:98086,indMedian:75260, nwMedian:857304, nwMean:1905120},
  'Bethesda, MD':{hhMedian:191198,indMedian:122159, nwMedian:723114, nwMean:1606920},
  'Bethlehem, PA':{hhMedian:68719,indMedian:44852, nwMedian:163422, nwMean:363160},
  'Billings, MT':{hhMedian:67028,indMedian:50100, nwMedian:218295, nwMean:485100},
  'Birmingham, AL':{hhMedian:44951,indMedian:40368, nwMedian:99036, nwMean:220080},
  'Bismarck, ND':{hhMedian:75846,indMedian:56164, nwMedian:176652, nwMean:392560},
  'Blaine, MN':{hhMedian:100172,indMedian:61450, nwMedian:217665, nwMean:483700},
  'Bloomington, IL':{hhMedian:77577,indMedian:59887, nwMedian:132552, nwMean:294560},
  'Bloomington, IN':{hhMedian:41799,indMedian:45672, nwMedian:215460, nwMean:478800},
  'Bloomington, MN':{hhMedian:86206,indMedian:61021, nwMedian:225036, nwMean:500080},
  'Boca Raton, FL':{hhMedian:110593,indMedian:66039, nwMedian:475902, nwMean:1057560},
  'Boise City, ID':{hhMedian:79977,indMedian:52531, nwMedian:309834, nwMean:688520},
  'Bolingbrook, IL':{hhMedian:114296,indMedian:51321, nwMedian:205380, nwMean:456400},
  'Boston, MA':{hhMedian:96931,indMedian:69869, nwMedian:443268, nwMean:985040},
  'Boulder, CO':{hhMedian:75923,indMedian:61465, nwMedian:623133, nwMean:1384740},
  'Bowling Green, KY':{hhMedian:47813,indMedian:36161, nwMedian:153720, nwMean:341600},
  'Boynton Beach, FL':{hhMedian:67247,indMedian:40416, nwMedian:228816, nwMean:508480},
  'Brandon, FL':{hhMedian:82027,indMedian:50097, nwMedian:226926, nwMean:504280},
  'Brentwood, CA':{hhMedian:140312,indMedian:86686, nwMedian:515151, nwMean:1144780},
  'Bridgeport, CT':{hhMedian:58515,indMedian:40145, nwMedian:193473, nwMean:429940},
  'Brockton, MA':{hhMedian:79990,indMedian:51569, nwMedian:279153, nwMean:620340},
  'Broken Arrow, OK':{hhMedian:84374,indMedian:50439, nwMedian:161343, nwMean:358540},
  'Brooklyn Park, MN':{hhMedian:87532,indMedian:54190, nwMedian:214326, nwMean:476280},
  'Broomfield, CO':{hhMedian:112139,indMedian:70612, nwMedian:416304, nwMean:925120},
  'Brownsville, TX':{hhMedian:49920,indMedian:34321, nwMedian:97524, nwMean:216720},
  'Bryan, TX':{hhMedian:53006,indMedian:39466, nwMedian:145530, nwMean:323400},
  'Buckeye, AZ':{hhMedian:99178,indMedian:50785, nwMedian:268380, nwMean:596400},
  'Buena Park, CA':{hhMedian:115247,indMedian:51164, nwMedian:526617, nwMean:1170260},
  'Buffalo, NY':{hhMedian:46458,indMedian:41423, nwMedian:109746, nwMean:243880},
  'Burbank, CA':{hhMedian:91926,indMedian:64636, nwMedian:665973, nwMean:1479940},
  'Caldwell, ID':{hhMedian:67117,indMedian:40739, nwMedian:221445, nwMean:492100},
  'Camarillo, CA':{hhMedian:111847,indMedian:72508, nwMedian:519813, nwMean:1155140},
  'Cambridge, MA':{hhMedian:134307,indMedian:76235, nwMedian:622062, nwMean:1382360},
  'Camden, NJ':{hhMedian:35129,indMedian:31908, nwMedian:65205, nwMean:144900},
  'Canton, OH':{hhMedian:39692,indMedian:32826, nwMedian:60858, nwMean:135240},
  'Cape Coral, FL':{hhMedian:74634,indMedian:42213, nwMedian:252630, nwMean:561400},
  'Carlsbad, CA':{hhMedian:131257,indMedian:77424, nwMedian:856548, nwMean:1903440},
  'Carmel, IN':{hhMedian:143676,indMedian:87175, nwMedian:300447, nwMean:667660},
  'Carmichael, CA':{hhMedian:86754,indMedian:52016, nwMedian:365400, nwMean:812000},
  'Carrollton, TX':{hhMedian:93937,indMedian:55757, nwMedian:244629, nwMean:543620},
  'Carson, CA':{hhMedian:100041,indMedian:47329, nwMedian:423738, nwMean:941640},
  'Cary, NC':{hhMedian:129607,indMedian:80079, nwMedian:378567, nwMean:841260},
  'Casas Adobes, AZ':{hhMedian:79754,indMedian:56064, nwMedian:225540, nwMean:501200},
  'Castle Rock, CO':{hhMedian:137383,indMedian:75564, nwMedian:419202, nwMean:931560},
  'Castro Valley, CA':{hhMedian:132000,indMedian:73755, nwMedian:676872, nwMean:1504160},
  'Cedar Park, TX':{hhMedian:119943,indMedian:76695, nwMedian:354249, nwMean:787220},
  'Cedar Rapids, IA':{hhMedian:66720,indMedian:45710, nwMedian:120393, nwMean:267540},
  'Centennial, CO':{hhMedian:121531,indMedian:74715, nwMedian:416052, nwMean:924560},
  'Centreville, VA':{hhMedian:131503,indMedian:75249, nwMedian:369684, nwMean:821520},
  'Champaign, IL':{hhMedian:46232,indMedian:45232, nwMedian:132804, nwMean:295120},
  'Chandler, AZ':{hhMedian:105393,indMedian:66221, nwMedian:338373, nwMean:751940},
  'Charleston, SC':{hhMedian:95126,indMedian:62144, nwMedian:324954, nwMean:722120},
  'Charlotte, NC':{hhMedian:80581,indMedian:55018, nwMedian:260694, nwMean:579320},
  'Chattanooga, TN':{hhMedian:62547,indMedian:43802, nwMedian:196119, nwMean:435820},
  'Cheektowaga, NY':{hhMedian:61246,indMedian:46615, nwMedian:127260, nwMean:282800},
  'Chesapeake, VA':{hhMedian:92633,indMedian:53278, nwMedian:239463, nwMean:532140},
  'Cheyenne, WY':{hhMedian:74244,indMedian:53204, nwMedian:214704, nwMean:477120},
  'Chicago, IL':{hhMedian:74474,indMedian:56182, nwMedian:200907, nwMean:446460},
  'Chico, CA':{hhMedian:61464,indMedian:45609, nwMedian:286713, nwMean:637140},
  'Chino Hills, CA':{hhMedian:127294,indMedian:64865, nwMedian:558180, nwMean:1240400},
  'Chino, CA':{hhMedian:104185,indMedian:50645, nwMedian:445410, nwMean:989800},
  'Chula Vista, CA':{hhMedian:106623,indMedian:54331, nwMedian:487053, nwMean:1082340},
  'Cicero, IL':{hhMedian:74353,indMedian:43882, nwMedian:167580, nwMean:372400},
  'Cincinnati, OH':{hhMedian:54314,indMedian:48768, nwMedian:155799, nwMean:346220},
  'Citrus Heights, CA':{hhMedian:81123,indMedian:47019, nwMedian:278838, nwMean:619640},
  'Clarksville, TN':{hhMedian:67246,indMedian:46926, nwMedian:183204, nwMean:407120},
  'Clearwater, FL':{hhMedian:73178,indMedian:46064, nwMedian:264033, nwMean:586740},
  'Cleveland, OH':{hhMedian:39041,indMedian:37268, nwMedian:67473, nwMean:149940},
  'Clifton, NJ':{hhMedian:98598,indMedian:51601, nwMedian:280413, nwMean:623140},
  'Clovis, CA':{hhMedian:88828,indMedian:62007, nwMedian:315063, nwMean:700140},
  'College Station, TX':{hhMedian:47632,indMedian:50435, nwMedian:223776, nwMean:497280},
  'Colorado Springs, CO':{hhMedian:83215,indMedian:53459, nwMedian:290367, nwMean:645260},
  'Columbia, MD':{hhMedian:115564,indMedian:79837, nwMedian:299439, nwMean:665420},
  'Columbia, MO':{hhMedian:62972,indMedian:48186, nwMedian:177093, nwMean:393540},
  'Columbia, SC':{hhMedian:52943,indMedian:45947, nwMedian:169533, nwMean:376740},
  'Columbus, GA':{hhMedian:51835,indMedian:37822, nwMedian:124866, nwMean:277480},
  'Columbus, OH':{hhMedian:62350,indMedian:46619, nwMedian:167454, nwMean:372120},
  'Commerce City, CO':{hhMedian:124884,indMedian:61062, nwMedian:342216, nwMean:760480},
  'Compton, CA':{hhMedian:69965,indMedian:39141, nwMedian:373653, nwMean:830340},
  'Concord, CA':{hhMedian:100442,indMedian:60143, nwMedian:501039, nwMean:1113420},
  'Concord, NC':{hhMedian:82262,indMedian:51850, nwMedian:236061, nwMean:524580},
  'Conroe, TX':{hhMedian:77027,indMedian:50906, nwMedian:203994, nwMean:453320},
  'Conway, AR':{hhMedian:62886,indMedian:49644, nwMedian:155043, nwMean:344540},
  'Coral Springs, FL':{hhMedian:85615,indMedian:51464, nwMedian:372519, nwMean:827820},
  'Corona, CA':{hhMedian:104871,indMedian:57575, nwMedian:435015, nwMean:966700},
  'Corpus Christi, TX':{hhMedian:65138,indMedian:41812, nwMedian:137718, nwMean:306040},
  'Costa Mesa, CA':{hhMedian:101433,indMedian:61506, nwMedian:692874, nwMean:1539720},
  'Cranston, RI':{hhMedian:92795,indMedian:55721, nwMedian:242487, nwMean:538860},
  'Dale City, VA':{hhMedian:121763,indMedian:51622, nwMedian:275562, nwMean:612360},
  'Dallas, TX':{hhMedian:70121,indMedian:50094, nwMedian:207711, nwMean:461580},
  'Daly City, CA':{hhMedian:104079,indMedian:52412, nwMedian:647892, nwMean:1439760},
  'Danbury, CT':{hhMedian:79358,indMedian:43529, nwMedian:264537, nwMean:587860},
  'Davenport, IA':{hhMedian:69595,indMedian:44455, nwMedian:108549, nwMean:241220},
  'Davie, FL':{hhMedian:82514,indMedian:48983, nwMedian:291312, nwMean:647360},
  'Davis, CA':{hhMedian:89386,indMedian:66630, nwMedian:529830, nwMean:1177400},
  'Dayton, OH':{hhMedian:45995,indMedian:41252, nwMedian:68103, nwMean:151340},
  'Daytona Beach, FL':{hhMedian:50442,indMedian:38491, nwMedian:198450, nwMean:441000},
  'Dearborn, MI':{hhMedian:51670,indMedian:43378, nwMedian:140616, nwMean:312480},
  'Decatur, IL':{hhMedian:46564,indMedian:42052, nwMedian:56322, nwMean:125160},
  'Deerfield Beach, FL':{hhMedian:59148,indMedian:40563, nwMedian:214389, nwMean:476420},
  'Delray Beach, FL':{hhMedian:76803,indMedian:43083, nwMedian:273861, nwMean:608580},
  'Deltona, FL':{hhMedian:71107,indMedian:42393, nwMedian:202797, nwMean:450660},
  'Denton, TX':{hhMedian:73051,indMedian:43577, nwMedian:239400, nwMean:532000},
  'Denver, CO':{hhMedian:94157,indMedian:65653, nwMedian:394695, nwMean:877100},
  'Des Moines, IA':{hhMedian:60882,indMedian:45089, nwMedian:122661, nwMean:272580},
  'Detroit, MI':{hhMedian:38080,indMedian:36277, nwMedian:54432, nwMean:120960},
  'Doral, FL':{hhMedian:98058,indMedian:50170, nwMedian:386127, nwMean:858060},
  'Dothan, AL':{hhMedian:54598,indMedian:40937, nwMedian:119700, nwMean:266000},
  'Downey, CA':{hhMedian:96699,indMedian:50775, nwMedian:519309, nwMean:1154020},
  'Dublin, CA':{hhMedian:204946,indMedian:122016, nwMedian:814527, nwMean:1810060},
  'Duluth, MN':{hhMedian:61163,indMedian:48257, nwMedian:159201, nwMean:353780},
  'Durham, NC':{hhMedian:80064,indMedian:56118, nwMedian:262962, nwMean:584360},
  'Eagan, MN':{hhMedian:101896,indMedian:64220, nwMedian:256158, nwMean:569240},
  'East Los Angeles, CA':{hhMedian:69891,indMedian:36512, nwMedian:399168, nwMean:887040},
  'East Orange, NJ':{hhMedian:56293,indMedian:40873, nwMedian:241920, nwMean:537600},
  'Eastvale, CA':{hhMedian:162853,indMedian:72028, nwMedian:524790, nwMean:1166200},
  'Eau Claire, WI':{hhMedian:68221,indMedian:50106, nwMedian:162414, nwMean:360920},
  'Edinburg, TX':{hhMedian:61059,indMedian:42795, nwMedian:124677, nwMean:277060},
  'Edmond, OK':{hhMedian:98524,indMedian:60931, nwMedian:231588, nwMean:514640},
  'El Cajon, CA':{hhMedian:67773,indMedian:41674, nwMedian:430794, nwMean:957320},
  'El Monte, CA':{hhMedian:64991,indMedian:33791, nwMedian:408429, nwMean:907620},
  'El Paso, TX':{hhMedian:57317,indMedian:38194, nwMedian:122283, nwMean:271740},
  'Elgin, IL':{hhMedian:83539,indMedian:47230, nwMedian:171675, nwMean:381500},
  'Elizabeth, NJ':{hhMedian:71715,indMedian:42184, nwMedian:294966, nwMean:655480},
  'Elk Grove, CA':{hhMedian:119330,indMedian:62487, nwMedian:402570, nwMean:894600},
  'Ellicott City, MD':{hhMedian:148677,indMedian:77824, nwMedian:421848, nwMean:937440},
  'Enterprise, NV':{hhMedian:91225,indMedian:51418, nwMedian:305424, nwMean:678720},
  'Erie, PA':{hhMedian:41377,indMedian:35864, nwMedian:73836, nwMean:164080},
  'Escondido, CA':{hhMedian:95052,indMedian:48961, nwMedian:438921, nwMean:975380},
  'Eugene, OR':{hhMedian:65663,indMedian:45760, nwMedian:294903, nwMean:655340},
  'Evanston, IL':{hhMedian:97085,indMedian:71821, nwMedian:283248, nwMean:629440},
  'Evansville, IN':{hhMedian:52318,indMedian:42258, nwMedian:93870, nwMean:208600},
  'Everett, WA':{hhMedian:74276,indMedian:53920, nwMedian:356265, nwMean:791700},
  'Fairfield, CA':{hhMedian:100126,indMedian:60103, nwMedian:392175, nwMean:871500},
  'Fall River, MA':{hhMedian:52978,indMedian:47924, nwMedian:253323, nwMean:562940},
  'Fargo, ND':{hhMedian:61422,indMedian:50800, nwMedian:178101, nwMean:395780},
  'Farmington Hills, MI':{hhMedian:90598,indMedian:67395, nwMedian:228816, nwMean:508480},
  'Fayetteville, AR':{hhMedian:51513,indMedian:44614, nwMedian:237006, nwMean:526680},
  'Fayetteville, NC':{hhMedian:59732,indMedian:41762, nwMedian:126693, nwMean:281540},
  'Federal Way, WA':{hhMedian:81997,indMedian:52330, nwMedian:356391, nwMean:791980},
  'Fishers, IN':{hhMedian:121382,indMedian:73720, nwMedian:256725, nwMean:570500},
  'Flagstaff, AZ':{hhMedian:71402,indMedian:53619, nwMedian:381528, nwMean:847840},
  'Flint, MI':{hhMedian:33141,indMedian:31051, nwMedian:33768, nwMean:75040},
  'Flower Mound, TX':{hhMedian:147490,indMedian:80467, nwMedian:372015, nwMean:826700},
  'Folsom, CA':{hhMedian:124531,indMedian:88730, nwMedian:456561, nwMean:1014580},
  'Fontana, CA':{hhMedian:100890,indMedian:50010, nwMedian:377118, nwMean:838040},
  'Fort Collins, CO':{hhMedian:81883,indMedian:57338, nwMedian:369684, nwMean:821520},
  'Fort Lauderdale, FL':{hhMedian:80539,indMedian:47516, nwMedian:340074, nwMean:755720},
  'Fort Myers, FL':{hhMedian:61894,indMedian:47547, nwMedian:256284, nwMean:569520},
  'Fort Smith, AR':{hhMedian:54009,indMedian:40525, nwMedian:114597, nwMean:254660},
  'Fort Wayne, IN':{hhMedian:57138,indMedian:42753, nwMedian:125937, nwMean:279860},
  'Fort Worth, TX':{hhMedian:77082,indMedian:49946, nwMedian:200529, nwMean:445620},
  'Four Corners, FL':{hhMedian:73951,indMedian:43052, nwMedian:223209, nwMean:496020},
  'Framingham, MA':{hhMedian:103841,indMedian:53851, nwMedian:393624, nwMean:874720},
  'Franklin, TN':{hhMedian:118156,indMedian:71235, nwMedian:465129, nwMean:1033620},
  'Frederick, MD':{hhMedian:96084,indMedian:62499, nwMedian:255087, nwMean:566860},
  'Fremont, CA':{hhMedian:170934,indMedian:101331, nwMedian:909216, nwMean:2020480},
  'Fresno, CA':{hhMedian:67603,indMedian:43477, nwMedian:242928, nwMean:539840},
  'Frisco, TX':{hhMedian:141129,indMedian:91303, nwMedian:433377, nwMean:963060},
  'Fullerton, CA':{hhMedian:97427,indMedian:52224, nwMedian:565173, nwMean:1255940},
  'Gainesville, FL':{hhMedian:47099,indMedian:48343, nwMedian:173565, nwMean:385700},
  'Gaithersburg, MD':{hhMedian:100387,indMedian:62259, nwMedian:303534, nwMean:674520},
  'Garden Grove, CA':{hhMedian:87407,indMedian:42540, nwMedian:519498, nwMean:1154440},
  'Garland, TX':{hhMedian:71729,indMedian:42075, nwMedian:176967, nwMean:393260},
  'Gary, IN':{hhMedian:35033,indMedian:33820, nwMedian:56637, nwMean:125860},
  'Gastonia, NC':{hhMedian:63597,indMedian:44494, nwMedian:184905, nwMean:410900},
  'Georgetown, TX':{hhMedian:95160,indMedian:55244, nwMedian:269640, nwMean:599200},
  'Germantown, MD':{hhMedian:101446,indMedian:62149, nwMedian:256536, nwMean:570080},
  'Gilbert, AZ':{hhMedian:122445,indMedian:70377, nwMedian:386946, nwMean:859880},
  'Glen Burnie, MD':{hhMedian:77549,indMedian:50037, nwMedian:208908, nwMean:464240},
  'Glendale, AZ':{hhMedian:70600,indMedian:47106, nwMedian:251307, nwMean:558460},
  'Glendale, CA':{hhMedian:81365,indMedian:58351, nwMedian:669438, nwMean:1487640},
  'Goodyear, AZ':{hhMedian:105160,indMedian:54798, nwMedian:325206, nwMean:722680},
  'Grand Junction, CO':{hhMedian:67887,indMedian:49848, nwMedian:250614, nwMean:556920},
  'Grand Prairie, TX':{hhMedian:72106,indMedian:47413, nwMedian:198324, nwMean:440720},
  'Grand Rapids, MI':{hhMedian:70258,indMedian:47791, nwMedian:163800, nwMean:364000},
  'Greeley, CO':{hhMedian:63526,indMedian:47984, nwMedian:231462, nwMean:514360},
  'Green Bay, WI':{hhMedian:66950,indMedian:48188, nwMedian:139671, nwMean:310380},
  'Greensboro, NC':{hhMedian:61747,indMedian:43977, nwMedian:165249, nwMean:367220},
  'Greenville, NC':{hhMedian:51628,indMedian:43965, nwMedian:151011, nwMean:335580},
  'Greenville, SC':{hhMedian:73536,indMedian:59870, nwMedian:312732, nwMean:694960},
  'Gresham, OR':{hhMedian:76205,indMedian:45638, nwMedian:286587, nwMean:636860},
  'Gulfport, MS':{hhMedian:47564,indMedian:37678, nwMedian:110628, nwMean:245840},
  'Hammond, IN':{hhMedian:51773,indMedian:41973, nwMedian:102564, nwMean:227920},
  'Hampton, VA':{hhMedian:70238,indMedian:46654, nwMedian:162792, nwMean:361760},
  'Harlingen, TX':{hhMedian:60065,indMedian:37517, nwMedian:107541, nwMean:238980},
  'Hartford, CT':{hhMedian:42397,indMedian:40539, nwMedian:149625, nwMean:332500},
  'Haverhill, MA':{hhMedian:87309,indMedian:65638, nwMedian:283059, nwMean:629020},
  'Hawthorne, CA':{hhMedian:65166,indMedian:47038, nwMedian:556227, nwMean:1236060},
  'Hayward, CA':{hhMedian:112121,indMedian:60143, nwMedian:524097, nwMean:1164660},
  'Hemet, CA':{hhMedian:52824,indMedian:42351, nwMedian:233226, nwMean:518280},
  'Henderson, NV':{hhMedian:82476,indMedian:53704, nwMedian:311094, nwMean:691320},
  'Hesperia, CA':{hhMedian:67348,indMedian:42942, nwMedian:261450, nwMean:581000},
  'Hialeah, FL':{hhMedian:55310,indMedian:35498, nwMedian:263277, nwMean:585060},
  'High Point, NC':{hhMedian:57436,indMedian:42151, nwMedian:159201, nwMean:353780},
  'Highlands Ranch, CO':{hhMedian:153336,indMedian:83204, nwMedian:461034, nwMean:1024520},
  'Hillsboro, OR':{hhMedian:103439,indMedian:57422, nwMedian:328734, nwMean:730520},
  'Hollywood, FL':{hhMedian:60630,indMedian:36775, nwMedian:281421, nwMean:625380},
  'Homestead, FL':{hhMedian:71901,indMedian:41036, nwMedian:258615, nwMean:574700},
  'Hoover, AL':{hhMedian:102009,indMedian:65201, nwMedian:261639, nwMean:581420},
  'Horizon West, FL':{hhMedian:144193,indMedian:75290, nwMedian:379890, nwMean:844200},
  'Houston, TX':{hhMedian:62637,indMedian:45816, nwMedian:177912, nwMean:395360},
  'Huntington Beach, CA':{hhMedian:120231,indMedian:62269, nwMedian:674478, nwMean:1498840},
  'Huntsville, AL':{hhMedian:73319,indMedian:51054, nwMedian:195237, nwMean:433860},
  'Idaho Falls, ID':{hhMedian:63049,indMedian:41248, nwMedian:216594, nwMean:481320},
  'Independence, MO':{hhMedian:61432,indMedian:40685, nwMedian:113841, nwMean:252980},
  'Indianapolis city (balance), IN':{hhMedian:66629,indMedian:47215, nwMedian:150192, nwMean:333760},
  'Indio, CA':{hhMedian:83107,indMedian:41174, nwMedian:312291, nwMean:693980},
  'Inglewood, CA':{hhMedian:72900,indMedian:42374, nwMedian:504756, nwMean:1121680},
  'Iowa City, IA':{hhMedian:50135,indMedian:45154, nwMedian:183645, nwMean:408100},
  'Irvine, CA':{hhMedian:127989,indMedian:84667, nwMedian:755748, nwMean:1679440},
  'Irving, TX':{hhMedian:79335,indMedian:55520, nwMedian:215145, nwMean:478100},
  'Jackson, MS':{hhMedian:42336,indMedian:33616, nwMedian:69678, nwMean:154840},
  'Jackson, TN':{hhMedian:51343,indMedian:41693, nwMedian:150507, nwMean:334460},
  'Jacksonville, FL':{hhMedian:68069,indMedian:46732, nwMedian:196812, nwMean:437360},
  'Jacksonville, NC':{hhMedian:58146,indMedian:41183, nwMedian:151389, nwMean:336420},
  'Janesville, WI':{hhMedian:71885,indMedian:45852, nwMedian:152145, nwMean:338100},
  'Jersey City, NJ':{hhMedian:91286,indMedian:71998, nwMedian:350847, nwMean:779660},
  'Johns Creek, GA':{hhMedian:151344,indMedian:91196, nwMedian:403641, nwMean:896980},
  'Johnson City, TN':{hhMedian:55406,indMedian:43759, nwMedian:171108, nwMean:380240},
  'Joliet, IL':{hhMedian:86054,indMedian:49705, nwMedian:170037, nwMean:377860},
  'Jonesboro, AR':{hhMedian:57264,indMedian:41103, nwMedian:126630, nwMean:281400},
  'Jurupa Valley, CA':{hhMedian:87809,indMedian:44947, nwMedian:372582, nwMean:827960},
  'Kalamazoo, MI':{hhMedian:50044,indMedian:42571, nwMedian:108612, nwMean:241360},
  'Kansas City, KS':{hhMedian:60739,indMedian:40507, nwMedian:106659, nwMean:237020},
  'Kansas City, MO':{hhMedian:65225,indMedian:50936, nwMedian:153216, nwMean:340480},
  'Kendall, FL':{hhMedian:75301,indMedian:52011, nwMedian:423738, nwMean:941640},
  'Kenner, LA':{hhMedian:68166,indMedian:43574, nwMedian:168840, nwMean:375200},
  'Kennewick, WA':{hhMedian:65796,indMedian:40502, nwMedian:253071, nwMean:562380},
  'Kenosha, WI':{hhMedian:68885,indMedian:47280, nwMedian:140427, nwMean:312060},
  'Kent, WA':{hhMedian:85982,indMedian:50751, nwMedian:383607, nwMean:852460},
  'Killeen, TX':{hhMedian:60067,indMedian:40940, nwMedian:143010, nwMean:317800},
  'Kirkland, WA':{hhMedian:144080,indMedian:96272, nwMedian:714798, nwMean:1588440},
  'Kissimmee, FL':{hhMedian:59142,indMedian:32821, nwMedian:209097, nwMean:464660},
  'Knoxville, TN':{hhMedian:50183,indMedian:41746, nwMedian:177849, nwMean:395220},
  'Lafayette, IN':{hhMedian:51328,indMedian:39925, nwMedian:119763, nwMean:266140},
  'Lafayette, LA':{hhMedian:61258,indMedian:43859, nwMedian:158823, nwMean:352940},
  'Lake Charles, LA':{hhMedian:55420,indMedian:41539, nwMedian:136899, nwMean:304220},
  'Lake Elsinore, CA':{hhMedian:109010,indMedian:49621, nwMedian:372582, nwMean:827960},
  'Lake Forest, CA':{hhMedian:126234,indMedian:70769, nwMedian:573867, nwMean:1275260},
  'Lakeland, FL':{hhMedian:57131,indMedian:42603, nwMedian:172872, nwMean:384160},
  'Lakeville, MN':{hhMedian:147992,indMedian:76264, nwMedian:292509, nwMean:650020},
  'Lakewood, CA':{hhMedian:117970,indMedian:61803, nwMedian:518175, nwMean:1151500},
  'Lakewood, CO':{hhMedian:83987,indMedian:57270, nwMedian:371448, nwMean:825440},
  'Lakewood, NJ':{hhMedian:70483,indMedian:42307, nwMedian:415863, nwMean:924140},
  'Lancaster, CA':{hhMedian:74991,indMedian:47645, nwMedian:283815, nwMean:630700},
  'Lansing, MI':{hhMedian:55197,indMedian:40366, nwMedian:80766, nwMean:179480},
  'Laredo, TX':{hhMedian:60720,indMedian:36858, nwMedian:129087, nwMean:286860},
  'Largo, FL':{hhMedian:66220,indMedian:41497, nwMedian:162477, nwMean:361060},
  'Las Cruces, NM':{hhMedian:55012,indMedian:42366, nwMedian:155106, nwMean:344680},
  'Las Vegas, NV':{hhMedian:73784,indMedian:46238, nwMedian:273546, nwMean:607880},
  'Lauderhill, FL':{hhMedian:45454,indMedian:34157, nwMedian:179046, nwMean:397880},
  'Lawrence, KS':{hhMedian:62608,indMedian:51067, nwMedian:185409, nwMean:412020},
  'Lawrence, MA':{hhMedian:58079,indMedian:41599, nwMedian:251874, nwMean:559720},
  'Lawton, OK':{hhMedian:51571,indMedian:37473, nwMedian:88200, nwMean:196000},
  'Layton, UT':{hhMedian:99866,indMedian:53945, nwMedian:314370, nwMean:698600},
  'League City, TX':{hhMedian:118475,indMedian:71050, nwMedian:226359, nwMean:503020},
  'Leander, TX':{hhMedian:138938,indMedian:83741, nwMedian:332640, nwMean:739200},
  "Lee's Summit, MO":{hhMedian:100625,indMedian:64652, nwMedian:217035, nwMean:482300},
  'Lehi, UT':{hhMedian:129274,indMedian:68671, nwMedian:390033, nwMean:866740},
  'Lehigh Acres, FL':{hhMedian:59645,indMedian:38598, nwMedian:202671, nwMean:450380},
  'Lewisville, TX':{hhMedian:88784,indMedian:52415, nwMedian:238014, nwMean:528920},
  'Lexington-Fayette, KY':{hhMedian:66392,indMedian:48650, nwMedian:185409, nwMean:412020},
  'Lincoln, NE':{hhMedian:68050,indMedian:49319, nwMedian:167391, nwMean:371980},
  'Little Rock, AR':{hhMedian:59762,indMedian:47056, nwMedian:152208, nwMean:338240},
  'Livermore, CA':{hhMedian:151705,indMedian:92190, nwMedian:662823, nwMean:1472940},
  'Livonia, MI':{hhMedian:95003,indMedian:61978, nwMedian:178542, nwMean:396760},
  'Lodi, CA':{hhMedian:82342,indMedian:49813, nwMedian:310842, nwMean:690760},
  'Long Beach, CA':{hhMedian:81606,indMedian:51634, nwMedian:518679, nwMean:1152620},
  'Longmont, CO':{hhMedian:82984,indMedian:52363, nwMedian:379764, nwMean:843920},
  'Longview, TX':{hhMedian:57211,indMedian:38854, nwMedian:118881, nwMean:264180},
  'Lorain, OH':{hhMedian:41480,indMedian:37750, nwMedian:88515, nwMean:196700},
  'Los Angeles, CA':{hhMedian:79701,indMedian:48528, nwMedian:579537, nwMean:1287860},
  'Louisville/Jefferson County metro government (balance), KY':{hhMedian:61488,indMedian:46731, nwMedian:147357, nwMean:327460},
  'Loveland, CO':{hhMedian:77160,indMedian:52563, nwMedian:306180, nwMean:680400},
  'Lowell, MA':{hhMedian:73083,indMedian:50351, nwMedian:285642, nwMean:634760},
  'Lubbock, TX':{hhMedian:54451,indMedian:44151, nwMedian:137214, nwMean:304920},
  'Lynchburg, VA':{hhMedian:61693,indMedian:42499, nwMedian:155673, nwMean:345940},
  'Lynn, MA':{hhMedian:73723,indMedian:50628, nwMedian:330624, nwMean:734720},
  'Lynwood, CA':{hhMedian:65432,indMedian:33221, nwMedian:388773, nwMean:863940},
  'Macon-Bibb County, GA':{hhMedian:51254,indMedian:41126, nwMedian:125874, nwMean:279720},
  'Madera, CA':{hhMedian:55622,indMedian:36494, nwMedian:225351, nwMean:500780},
  'Madison, WI':{hhMedian:70484,indMedian:55575, nwMedian:238833, nwMean:530740},
  'Malden, MA':{hhMedian:88003,indMedian:60280, nwMedian:393561, nwMean:874580},
  'Manchester, NH':{hhMedian:78825,indMedian:52876, nwMedian:232659, nwMean:517020},
  'Mansfield, TX':{hhMedian:113378,indMedian:64038, nwMedian:272475, nwMean:605500},
  'Manteca, CA':{hhMedian:91533,indMedian:60028, nwMedian:371385, nwMean:825300},
  'Maple Grove, MN':{hhMedian:104200,indMedian:71375, nwMedian:255528, nwMean:567840},
  'Maricopa, AZ':{hhMedian:83604,indMedian:53605, nwMedian:243621, nwMean:541380},
  'Marysville, WA':{hhMedian:85708,indMedian:54476, nwMedian:374283, nwMean:831740},
  'McAllen, TX':{hhMedian:60200,indMedian:36874, nwMedian:128457, nwMean:285460},
  'McKinney, TX':{hhMedian:116654,indMedian:68297, nwMedian:313551, nwMean:696780},
  'Medford, OR':{hhMedian:66186,indMedian:45194, nwMedian:254772, nwMean:566160},
  'Melbourne, FL':{hhMedian:63726,indMedian:40766, nwMedian:205443, nwMean:456540},
  'Memphis, TN':{hhMedian:51399,indMedian:41528, nwMedian:126567, nwMean:281260},
  'Menifee, CA':{hhMedian:82402,indMedian:51430, nwMedian:359100, nwMean:798000},
  'Merced, CA':{hhMedian:53931,indMedian:36873, nwMedian:248787, nwMean:552860},
  'Meridian, ID':{hhMedian:100307,indMedian:57179, nwMedian:343980, nwMean:764400},
  'Mesa, AZ':{hhMedian:79145,indMedian:51087, nwMedian:267183, nwMean:593740},
  'Mesquite, TX':{hhMedian:67333,indMedian:43063, nwMedian:158760, nwMean:352800},
  'Metairie, LA':{hhMedian:65465,indMedian:50355, nwMedian:201411, nwMean:447580},
  'Miami Beach, FL':{hhMedian:71073,indMedian:51129, nwMedian:375921, nwMean:835380},
  'Miami Gardens, FL':{hhMedian:67169,indMedian:37195, nwMedian:262710, nwMean:583800},
  'Miami, FL':{hhMedian:68635,indMedian:45281, nwMedian:370062, nwMean:822360},
  'Midland, TX':{hhMedian:90699,indMedian:62306, nwMedian:199458, nwMean:443240},
  'Milpitas, CA':{hhMedian:179727,indMedian:101389, nwMedian:733446, nwMean:1629880},
  'Milwaukee, WI':{hhMedian:52992,indMedian:43584, nwMedian:115731, nwMean:257180},
  'Minneapolis, MN':{hhMedian:81001,indMedian:59797, nwMedian:224028, nwMean:497840},
  'Miramar, FL':{hhMedian:92097,indMedian:51711, nwMedian:328419, nwMean:729820},
  'Mission Viejo, CA':{hhMedian:122135,indMedian:75319, nwMedian:648144, nwMean:1440320},
  'Mission, TX':{hhMedian:60512,indMedian:38189, nwMedian:106785, nwMean:237300},
  'Missoula, MT':{hhMedian:70277,indMedian:48778, nwMedian:310968, nwMean:691040},
  'Missouri City, TX':{hhMedian:87072,indMedian:55911, nwMedian:199647, nwMean:443660},
  'Mobile, AL':{hhMedian:50156,indMedian:40350, nwMedian:119070, nwMean:264600},
  'Modesto, CA':{hhMedian:80471,indMedian:49602, nwMedian:282933, nwMean:628740},
  'Montgomery, AL':{hhMedian:57300,indMedian:44870, nwMedian:99855, nwMean:221900},
  'Moreno Valley, CA':{hhMedian:91021,indMedian:45159, nwMedian:345114, nwMean:766920},
  'Mount Pleasant, SC':{hhMedian:127357,indMedian:70606, nwMedian:519939, nwMean:1155420},
  'Mount Vernon, NY':{hhMedian:77190,indMedian:53639, nwMedian:319158, nwMean:709240},
  'Mountain View, CA':{hhMedian:181671,indMedian:112703, nwMedian:1237131, nwMean:2749180},
  'Muncie, IN':{hhMedian:43507,indMedian:35081, nwMedian:64323, nwMean:142940},
  'Murfreesboro, TN':{hhMedian:78069,indMedian:51508, nwMedian:264096, nwMean:586880},
  'Murrieta, CA':{hhMedian:108703,indMedian:62368, nwMedian:397845, nwMean:884100},
  'Nampa, ID':{hhMedian:71752,indMedian:44104, nwMedian:227682, nwMean:505960},
  'Napa, CA':{hhMedian:103601,indMedian:61160, nwMedian:522774, nwMean:1161720},
  'Naperville, IL':{hhMedian:152181,indMedian:86584, nwMedian:351603, nwMean:781340},
  'Nashua, NH':{hhMedian:97667,indMedian:61867, nwMedian:261639, nwMean:581420},
  'Nashville-Davidson metropolitan government (balance), TN':{hhMedian:80217,indMedian:55970, nwMedian:273105, nwMean:606900},
  'New Bedford, MA':{hhMedian:53583,indMedian:41279, nwMedian:230958, nwMean:513240},
  'New Braunfels, TX':{hhMedian:87778,indMedian:51931, nwMedian:224406, nwMean:498680},
  'New Britain, CT':{hhMedian:58780,indMedian:40650, nwMedian:144711, nwMean:321580},
  'New Haven, CT':{hhMedian:51158,indMedian:42030, nwMedian:180810, nwMean:401800},
  'New Orleans, LA':{hhMedian:55580,indMedian:45358, nwMedian:193032, nwMean:428960},
  'New Rochelle, NY':{hhMedian:128199,indMedian:74329, nwMedian:396837, nwMean:881860},
  'New York, NY':{hhMedian:76577,indMedian:54320, nwMedian:468090, nwMean:1040200},
  'Newark, NJ':{hhMedian:53818,indMedian:40098, nwMedian:254205, nwMean:564900},
  'Newport Beach, CA':{hhMedian:156434,indMedian:83430, nwMedian:1260001, nwMean:2800001},
  'Newport News, VA':{hhMedian:64962,indMedian:47399, nwMedian:164934, nwMean:366520},
  'Newton, MA':{hhMedian:185154,indMedian:101411, nwMedian:851004, nwMean:1891120},
  'Noblesville, IN':{hhMedian:107177,indMedian:60377, nwMedian:221760, nwMean:492800},
  'Norfolk, VA':{hhMedian:62382,indMedian:45885, nwMedian:188118, nwMean:418040},
  'Norman, OK':{hhMedian:62411,indMedian:45412, nwMedian:170289, nwMean:378420},
  'North Charleston, SC':{hhMedian:64070,indMedian:45662, nwMedian:193284, nwMean:429520},
  'North Las Vegas, NV':{hhMedian:78949,indMedian:43577, nwMedian:259056, nwMean:575680},
  'North Port, FL':{hhMedian:82495,indMedian:46385, nwMedian:240282, nwMean:533960},
  'North Richland Hills, TX':{hhMedian:100327,indMedian:61201, nwMedian:232029, nwMean:515620},
  'Norwalk, CA':{hhMedian:103071,indMedian:43277, nwMedian:408618, nwMean:908040},
  'Norwalk, CT':{hhMedian:102195,indMedian:57047, nwMedian:340326, nwMean:756280},
  'Novi, MI':{hhMedian:97092,indMedian:81981, nwMedian:264663, nwMean:588140},
  "O'Fallon, MO":{hhMedian:103301,indMedian:61648, nwMedian:214452, nwMean:476560},
  'Oakland, CA':{hhMedian:96828,indMedian:60721, nwMedian:576450, nwMean:1281000},
  'Ocala, FL':{hhMedian:52121,indMedian:35895, nwMedian:189504, nwMean:421120},
  'Oceanside, CA':{hhMedian:99108,indMedian:51867, nwMedian:495747, nwMean:1101660},
  'Odessa, TX':{hhMedian:74562,indMedian:55683, nwMedian:146979, nwMean:326620},
  'Ogden, UT':{hhMedian:65035,indMedian:41900, nwMedian:227304, nwMean:505120},
  'Oklahoma City, OK':{hhMedian:67015,indMedian:46239, nwMedian:156303, nwMean:347340},
  'Olathe, KS':{hhMedian:105915,indMedian:61725, nwMedian:226926, nwMean:504280},
  'Omaha, NE':{hhMedian:71238,indMedian:51316, nwMedian:160965, nwMean:357700},
  'Ontario, CA':{hhMedian:84566,indMedian:42714, nwMedian:373527, nwMean:830060},
  'Orange, CA':{hhMedian:117707,indMedian:61479, nwMedian:627984, nwMean:1395520},
  'Orem, UT':{hhMedian:82348,indMedian:47372, nwMedian:310401, nwMean:689780},
  'Orlando, FL':{hhMedian:69414,indMedian:46708, nwMedian:245133, nwMean:544740},
  'Oshkosh, WI':{hhMedian:62155,indMedian:46867, nwMedian:109557, nwMean:243460},
  'Overland Park, KS':{hhMedian:97176,indMedian:66560, nwMedian:264600, nwMean:588000},
  'Oxnard, CA':{hhMedian:87975,indMedian:41025, nwMedian:415296, nwMean:922880},
  'Palatine, IL':{hhMedian:89725,indMedian:57626, nwMedian:232848, nwMean:517440},
  'Palm Bay, FL':{hhMedian:67928,indMedian:40057, nwMedian:189378, nwMean:420840},
  'Palm Coast, FL':{hhMedian:70037,indMedian:45032, nwMedian:242550, nwMean:539000},
  'Palm Harbor, FL':{hhMedian:73852,indMedian:57498, nwMedian:292257, nwMean:649460},
  'Palmdale, CA':{hhMedian:78743,indMedian:45574, nwMedian:299691, nwMean:665980},
  'Palo Alto, CA':{hhMedian:184068,indMedian:139839, nwMedian:1260001, nwMean:2800001},
  'Paradise, NV':{hhMedian:61680,indMedian:37648, nwMedian:238329, nwMean:529620},
  'Parma, OH':{hhMedian:66681,indMedian:44722, nwMedian:113841, nwMean:252980},
  'Pasadena, CA':{hhMedian:103282,indMedian:63017, nwMedian:696339, nwMean:1547420},
  'Pasadena, TX':{hhMedian:59111,indMedian:41659, nwMedian:137970, nwMean:306600},
  'Pasco, WA':{hhMedian:84337,indMedian:50529, nwMedian:247023, nwMean:548940},
  'Passaic, NJ':{hhMedian:50893,indMedian:35920, nwMedian:277515, nwMean:616700},
  'Paterson, NJ':{hhMedian:56907,indMedian:36106, nwMedian:261513, nwMean:581140},
  'Pawtucket, RI':{hhMedian:63499,indMedian:46592, nwMedian:209475, nwMean:465500},
  'Pearland, TX':{hhMedian:108454,indMedian:67739, nwMedian:219996, nwMean:488880},
  'Pembroke Pines, FL':{hhMedian:86135,indMedian:50277, nwMedian:290493, nwMean:645540},
  'Peoria, AZ':{hhMedian:97296,indMedian:61107, nwMedian:298242, nwMean:662760},
  'Peoria, IL':{hhMedian:52796,indMedian:47345, nwMedian:92421, nwMean:205380},
  'Perris, CA':{hhMedian:77365,indMedian:41506, nwMedian:312732, nwMean:694960},
  'Pflugerville, TX':{hhMedian:108974,indMedian:62373, nwMedian:272790, nwMean:606200},
  'Pharr, TX':{hhMedian:57171,indMedian:34301, nwMedian:79821, nwMean:177380},
  'Philadelphia, PA':{hhMedian:60302,indMedian:50764, nwMedian:155358, nwMean:345240},
  'Phoenix, AZ':{hhMedian:79664,indMedian:50388, nwMedian:278019, nwMean:617820},
  'Pine Hills, FL':{hhMedian:71735,indMedian:36623, nwMedian:177345, nwMean:394100},
  'Pittsburg, CA':{hhMedian:92506,indMedian:52955, nwMedian:389466, nwMean:865480},
  'Pittsburgh, PA':{hhMedian:66219,indMedian:51841, nwMedian:134883, nwMean:299740},
  'Plano, TX':{hhMedian:108594,indMedian:72725, nwMedian:297675, nwMean:661500},
  'Plantation, FL':{hhMedian:95965,indMedian:51617, nwMedian:308763, nwMean:686140},
  'Pleasanton, CA':{hhMedian:177535,indMedian:114485, nwMedian:981162, nwMean:2180360},
  'Plymouth, MN':{hhMedian:130793,indMedian:77065, nwMedian:329238, nwMean:731640},
  'Poinciana, FL':{hhMedian:71150,indMedian:37295, nwMedian:190386, nwMean:423080},
  'Pomona, CA':{hhMedian:78317,indMedian:37335, nwMedian:387198, nwMean:860440},
  'Pompano Beach, FL':{hhMedian:61419,indMedian:40186, nwMedian:223902, nwMean:497560},
  'Port Charlotte, FL':{hhMedian:60501,indMedian:42347, nwMedian:195426, nwMean:434280},
  'Port Orange, FL':{hhMedian:67241,indMedian:44854, nwMedian:203238, nwMean:451640},
  'Port St. Lucie, FL':{hhMedian:74928,indMedian:46034, nwMedian:250425, nwMean:556500},
  'Portland, ME':{hhMedian:83399,indMedian:55222, nwMedian:311472, nwMean:692160},
  'Portland, OR':{hhMedian:86057,indMedian:60467, nwMedian:359289, nwMean:798420},
  'Portsmouth, VA':{hhMedian:57109,indMedian:42696, nwMedian:169029, nwMean:375620},
  'Providence, RI':{hhMedian:65206,indMedian:45098, nwMedian:226737, nwMean:503860},
  'Provo, UT':{hhMedian:62556,indMedian:38712, nwMedian:312039, nwMean:693420},
  'Pueblo, CO':{hhMedian:57170,indMedian:43527, nwMedian:175707, nwMean:390460},
  'Queen Creek, AZ':{hhMedian:135444,indMedian:76026, nwMedian:426888, nwMean:948640},
  'Quincy, MA':{hhMedian:92085,indMedian:66342, nwMedian:384426, nwMean:854280},
  'Racine, WI':{hhMedian:55065,indMedian:41081, nwMedian:102690, nwMean:228200},
  'Raleigh, NC':{hhMedian:86309,indMedian:56487, nwMedian:280665, nwMean:623700},
  'Rancho Cordova, CA':{hhMedian:76948,indMedian:51981, nwMedian:308574, nwMean:685720},
  'Rancho Cucamonga, CA':{hhMedian:103358,indMedian:60164, nwMedian:465696, nwMean:1034880},
  'Rapid City, SD':{hhMedian:70094,indMedian:48163, nwMedian:196686, nwMean:437080},
  'Reading, PA':{hhMedian:38814,indMedian:31048, nwMedian:86184, nwMean:191520},
  'Redding, CA':{hhMedian:71114,indMedian:45886, nwMedian:226485, nwMean:503300},
  'Redlands, CA':{hhMedian:97943,indMedian:65170, nwMedian:397908, nwMean:884240},
  'Redmond, WA':{hhMedian:172979,indMedian:120722, nwMedian:695394, nwMean:1545320},
  'Redondo Beach, CA':{hhMedian:159676,indMedian:103870, nwMedian:806400, nwMean:1792000},
  'Redwood City, CA':{hhMedian:151234,indMedian:99181, nwMedian:1144017, nwMean:2542260},
  'Reno, NV':{hhMedian:80365,indMedian:51265, nwMedian:344295, nwMean:765100},
  'Renton, WA':{hhMedian:100237,indMedian:61624, nwMedian:419391, nwMean:931980},
  'Reston, VA':{hhMedian:130635,indMedian:84893, nwMedian:407736, nwMean:906080},
  'Rialto, CA':{hhMedian:80321,indMedian:40299, nwMedian:324891, nwMean:721980},
  'Richardson, TX':{hhMedian:95170,indMedian:60149, nwMedian:274302, nwMean:609560},
  'Richmond, CA':{hhMedian:89052,indMedian:55837, nwMedian:410256, nwMean:911680},
  'Richmond, VA':{hhMedian:65650,indMedian:51532, nwMedian:230013, nwMean:511140},
  'Rio Rancho, NM':{hhMedian:88366,indMedian:54885, nwMedian:205884, nwMean:457520},
  'Riverside, CA':{hhMedian:88175,indMedian:46248, nwMedian:376110, nwMean:835800},
  'Riverview, FL':{hhMedian:100475,indMedian:59320, nwMedian:247023, nwMean:548940},
  'Roanoke, VA':{hhMedian:51038,indMedian:41681, nwMedian:135450, nwMean:301000},
  'Rochester Hills, MI':{hhMedian:105784,indMedian:69392, nwMedian:245133, nwMean:544740},
  'Rochester, MN':{hhMedian:85240,indMedian:60277, nwMedian:204246, nwMean:453880},
  'Rochester, NY':{hhMedian:48618,indMedian:40608, nwMedian:83916, nwMean:186480},
  'Rock Hill, SC':{hhMedian:65397,indMedian:42236, nwMedian:199017, nwMean:442260},
  'Rockford, IL':{hhMedian:59451,indMedian:39729, nwMedian:85806, nwMean:190680},
  'Rocklin, CA':{hhMedian:106408,indMedian:76258, nwMedian:432369, nwMean:960820},
  'Rockville, MD':{hhMedian:122294,indMedian:82093, nwMedian:419328, nwMean:931840},
  'Rogers, AR':{hhMedian:84093,indMedian:48974, nwMedian:218169, nwMean:484820},
  'Roseville, CA':{hhMedian:107888,indMedian:71639, nwMedian:410886, nwMean:913080},
  'Roswell, GA':{hhMedian:119657,indMedian:77235, nwMedian:389277, nwMean:865060},
  'Round Rock, TX':{hhMedian:102420,indMedian:57126, nwMedian:276822, nwMean:615160},
  'Rowlett, TX':{hhMedian:106199,indMedian:64007, nwMedian:245763, nwMean:546140},
  'Sacramento, CA':{hhMedian:85928,indMedian:55498, nwMedian:318654, nwMean:708120},
  'Salem, OR':{hhMedian:72827,indMedian:45203, nwMedian:273798, nwMean:608440},
  'Salinas, CA':{hhMedian:80580,indMedian:39356, nwMedian:405090, nwMean:900200},
  'Salt Lake City, UT':{hhMedian:72951,indMedian:54637, nwMedian:356832, nwMean:792960},
  'Sammamish, WA':{hhMedian:238750,indMedian:135247, nwMedian:908019, nwMean:2017820},
  'San Angelo, TX':{hhMedian:52048,indMedian:40456, nwMedian:114345, nwMean:254100},
  'San Antonio, TX':{hhMedian:62322,indMedian:41703, nwMedian:157500, nwMean:350000},
  'San Bernardino, CA':{hhMedian:63328,indMedian:40524, nwMedian:272664, nwMean:605920},
  'San Buenaventura (Ventura), CA':{hhMedian:97970,indMedian:59395, nwMedian:515088, nwMean:1144640},
  'San Diego, CA':{hhMedian:105780,indMedian:66219, nwMedian:582057, nwMean:1293460},
  'San Francisco, CA':{hhMedian:126730,indMedian:90228, nwMedian:849240, nwMean:1887200},
  'San Jose, CA':{hhMedian:136229,indMedian:72940, nwMedian:767025, nwMean:1704500},
  'San Leandro, CA':{hhMedian:84657,indMedian:50904, nwMedian:538839, nwMean:1197420},
  'San Marcos, CA':{hhMedian:96214,indMedian:54301, nwMedian:541170, nwMean:1202600},
  'San Marcos, TX':{hhMedian:53516,indMedian:41226, nwMedian:187866, nwMean:417480},
  'San Mateo, CA':{hhMedian:152913,indMedian:94209, nwMedian:984249, nwMean:2187220},
  'San Ramon, CA':{hhMedian:195491,indMedian:121878, nwMedian:970704, nwMean:2157120},
  'San Tan Valley, AZ':{hhMedian:92963,indMedian:51383, nwMedian:273105, nwMean:606900},
  'Sandy Springs, GA':{hhMedian:110401,indMedian:67435, nwMedian:395010, nwMean:877800},
  'Sandy, UT':{hhMedian:108926,indMedian:70298, nwMedian:396711, nwMean:881580},
  'Sanford, FL':{hhMedian:63643,indMedian:41972, nwMedian:215271, nwMean:478380},
  'Santa Ana, CA':{hhMedian:85914,indMedian:37954, nwMedian:433566, nwMean:963480},
  'Santa Barbara, CA':{hhMedian:100041,indMedian:63549, nwMedian:1030491, nwMean:2289980},
  'Santa Clara, CA':{hhMedian:166228,indMedian:104600, nwMedian:978642, nwMean:2174760},
  'Santa Clarita, CA':{hhMedian:118489,indMedian:70939, nwMedian:490077, nwMean:1089060},
  'Santa Fe, NM':{hhMedian:70940,indMedian:45013, nwMedian:288162, nwMean:640360},
  'Santa Maria, CA':{hhMedian:77564,indMedian:36932, nwMedian:337932, nwMean:750960},
  'Santa Monica, CA':{hhMedian:109503,indMedian:100271, nwMedian:1260001, nwMean:2800001},
  'Santa Rosa, CA':{hhMedian:93106,indMedian:57975, nwMedian:439299, nwMean:976220},
  'Savannah, GA':{hhMedian:56823,indMedian:41925, nwMedian:184716, nwMean:410480},
  'Schaumburg, IL':{hhMedian:87202,indMedian:65498, nwMedian:203553, nwMean:452340},
  'Schenectady, NY':{hhMedian:54773,indMedian:46182, nwMedian:107604, nwMean:239120},
  'Scottsdale, AZ':{hhMedian:106058,indMedian:75407, nwMedian:526113, nwMean:1169140},
  'Scranton, PA':{hhMedian:41601,indMedian:40068, nwMedian:103761, nwMean:230580},
  'Seattle, WA':{hhMedian:120608,indMedian:85937, nwMedian:566118, nwMean:1258040},
  'Shawnee, KS':{hhMedian:100016,indMedian:62629, nwMedian:224910, nwMean:499800},
  'Shreveport, LA':{hhMedian:48486,indMedian:38423, nwMedian:106029, nwMean:235620},
  'Silver Spring, MD':{hhMedian:100116,indMedian:60570, nwMedian:391104, nwMean:869120},
  'Simi Valley, CA':{hhMedian:117351,indMedian:65850, nwMedian:514773, nwMean:1143940},
  'Sioux City, IA':{hhMedian:62350,indMedian:45636, nwMedian:109683, nwMean:243740},
  'Sioux Falls, SD':{hhMedian:70925,indMedian:51564, nwMedian:190575, nwMean:423500},
  'Skokie, IL':{hhMedian:86125,indMedian:50830, nwMedian:230391, nwMean:511980},
  'Somerville, MA':{hhMedian:126619,indMedian:76552, nwMedian:570276, nwMean:1267280},
  'South Bend, IN':{hhMedian:55767,indMedian:39562, nwMedian:93744, nwMean:208320},
  'South Fulton, GA':{hhMedian:79871,indMedian:50260, nwMedian:210483, nwMean:467740},
  'South Gate, CA':{hhMedian:71760,indMedian:40121, nwMedian:392931, nwMean:873180},
  'South Hill, WA':{hhMedian:114928,indMedian:73012, nwMedian:350973, nwMean:779940},
  'South Jordan, UT':{hhMedian:126974,indMedian:67067, nwMedian:427266, nwMean:949480},
  'Southfield, MI':{hhMedian:65497,indMedian:47397, nwMedian:147546, nwMean:327880},
  'Sparks, NV':{hhMedian:86081,indMedian:50558, nwMedian:301203, nwMean:669340},
  'Spokane Valley, WA':{hhMedian:74787,indMedian:46874, nwMedian:247464, nwMean:549920},
  'Spokane, WA':{hhMedian:65016,indMedian:45882, nwMedian:236817, nwMean:526260},
  'Spring Hill, FL':{hhMedian:68872,indMedian:42355, nwMedian:198513, nwMean:441140},
  'Spring Valley, NV':{hhMedian:71988,indMedian:47555, nwMedian:277830, nwMean:617400},
  'Spring, TX':{hhMedian:84489,indMedian:50211, nwMedian:155358, nwMean:345240},
  'Springdale, AR':{hhMedian:68544,indMedian:41482, nwMedian:173250, nwMean:385000},
  'Springfield, IL':{hhMedian:63849,indMedian:50691, nwMedian:103950, nwMean:231000},
  'Springfield, MA':{hhMedian:47101,indMedian:40488, nwMedian:166383, nwMean:369740},
  'Springfield, MO':{hhMedian:47728,indMedian:39627, nwMedian:125874, nwMean:279720},
  'St. Charles, MO':{hhMedian:78359,indMedian:60582, nwMedian:195741, nwMean:434980},
  'St. Cloud, FL':{hhMedian:91228,indMedian:46700, nwMedian:239274, nwMean:531720},
  'St. Cloud, MN':{hhMedian:60782,indMedian:40595, nwMedian:158193, nwMean:351540},
  'St. George, UT':{hhMedian:77431,indMedian:44358, nwMedian:322623, nwMean:716940},
  'St. Joseph, MO':{hhMedian:57205,indMedian:40121, nwMedian:98280, nwMean:218400},
  'St. Louis, MO':{hhMedian:56245,indMedian:50971, nwMedian:121464, nwMean:269920},
  'St. Paul, MN':{hhMedian:73975,indMedian:51559, nwMedian:184905, nwMean:410900},
  'St. Petersburg, FL':{hhMedian:71743,indMedian:50431, nwMedian:252126, nwMean:560280},
  'Stamford, CT':{hhMedian:106552,indMedian:63711, nwMedian:404649, nwMean:899220},
  'Sterling Heights, MI':{hhMedian:73702,indMedian:50702, nwMedian:172620, nwMean:383600},
  'Stockton, CA':{hhMedian:76191,indMedian:44380, nwMedian:278019, nwMean:617820},
  'Suffolk, VA':{hhMedian:81154,indMedian:54346, nwMedian:221760, nwMean:492800},
  'Sugar Land, TX':{hhMedian:133144,indMedian:70575, nwMedian:273168, nwMean:607040},
  'Sunnyvale, CA':{hhMedian:189443,indMedian:124788, nwMedian:1095633, nwMean:2434740},
  'Sunrise Manor, NV':{hhMedian:52496,indMedian:37141, nwMedian:207711, nwMean:461580},
  'Sunrise, FL':{hhMedian:76722,indMedian:41510, nwMedian:231210, nwMean:513800},
  'Surprise, AZ':{hhMedian:89560,indMedian:50451, nwMedian:279405, nwMean:620900},
  'Syracuse, NY':{hhMedian:47525,indMedian:40728, nwMedian:85302, nwMean:189560},
  'Tacoma, WA':{hhMedian:89107,indMedian:60167, nwMedian:298683, nwMean:663740},
  'Tallahassee, FL':{hhMedian:56146,indMedian:46083, nwMedian:191079, nwMean:424620},
  'Tamarac, FL':{hhMedian:56910,indMedian:42430, nwMedian:195867, nwMean:435260},
  'Tampa, FL':{hhMedian:72851,indMedian:54394, nwMedian:286524, nwMean:636720},
  'Temecula, CA':{hhMedian:121795,indMedian:70006, nwMedian:439551, nwMean:976780},
  'Tempe, AZ':{hhMedian:91079,indMedian:53657, nwMedian:296226, nwMean:658280},
  'Temple, TX':{hhMedian:74923,indMedian:50391, nwMedian:161091, nwMean:357980},
  'The Villages, FL':{hhMedian:73805,indMedian:26462, nwMedian:260253, nwMean:578340},
  'The Woodlands, TX':{hhMedian:140794,indMedian:91627, nwMedian:360675, nwMean:801500},
  'Thornton, CO':{hhMedian:101679,indMedian:55231, nwMedian:322119, nwMean:715820},
  'Thousand Oaks, CA':{hhMedian:139172,indMedian:80649, nwMedian:616140, nwMean:1369200},
  'Toledo, OH':{hhMedian:46302,indMedian:39672, nwMedian:68166, nwMean:151480},
  'Toms River, NJ':{hhMedian:90593,indMedian:62643, nwMedian:260820, nwMean:579600},
  'Topeka, KS':{hhMedian:52417,indMedian:42335, nwMedian:93492, nwMean:207760},
  'Torrance, CA':{hhMedian:109019,indMedian:70979, nwMedian:665091, nwMean:1477980},
  "Town 'n' Country, FL":{hhMedian:66969,indMedian:41698, nwMedian:243747, nwMean:541660},
  'Tracy, CA':{hhMedian:123525,indMedian:61702, nwMedian:424053, nwMean:942340},
  'Trenton, NJ':{hhMedian:49117,indMedian:32525, nwMedian:114849, nwMean:255220},
  'Troy, MI':{hhMedian:106965,indMedian:67398, nwMedian:258867, nwMean:575260},
  'Tucson, AZ':{hhMedian:55708,indMedian:40498, nwMedian:179046, nwMean:397880},
  'Tulare, CA':{hhMedian:77286,indMedian:45492, nwMedian:209097, nwMean:464660},
  'Tulsa, OK':{hhMedian:56821,indMedian:42540, nwMedian:134946, nwMean:299880},
  'Turlock, CA':{hhMedian:81595,indMedian:53159, nwMedian:300006, nwMean:666680},
  'Tuscaloosa, AL':{hhMedian:43235,indMedian:40252, nwMedian:158886, nwMean:353080},
  'Tustin, CA':{hhMedian:107537,indMedian:61016, nwMedian:591759, nwMean:1315020},
  'Tyler, TX':{hhMedian:68441,indMedian:39917, nwMedian:158508, nwMean:352240},
  'Union City, CA':{hhMedian:124383,indMedian:68965, nwMedian:706986, nwMean:1571080},
  'Union City, NJ':{hhMedian:86123,indMedian:40124, nwMedian:277263, nwMean:616140},
  'Upland, CA':{hhMedian:114165,indMedian:61542, nwMedian:481194, nwMean:1069320},
  'Urban Honolulu, HI':{hhMedian:84907,indMedian:51628, nwMedian:523908, nwMean:1164240},
  'Vacaville, CA':{hhMedian:104278,indMedian:61604, nwMedian:393498, nwMean:874440},
  'Vallejo, CA':{hhMedian:91800,indMedian:51506, nwMedian:375354, nwMean:834120},
  'Vancouver, WA':{hhMedian:80618,indMedian:51525, nwMedian:295659, nwMean:657020},
  'Victoria, TX':{hhMedian:66739,indMedian:45797, nwMedian:123417, nwMean:274260},
  'Victorville, CA':{hhMedian:67099,indMedian:41301, nwMedian:250677, nwMean:557060},
  'Virginia Beach, VA':{hhMedian:91141,indMedian:55283, nwMedian:242046, nwMean:537880},
  'Visalia, CA':{hhMedian:79777,indMedian:52140, nwMedian:228879, nwMean:508620},
  'Vista, CA':{hhMedian:92224,indMedian:46791, nwMedian:494361, nwMean:1098580},
  'Waco, TX':{hhMedian:52770,indMedian:38610, nwMedian:146790, nwMean:326200},
  'Waldorf, MD':{hhMedian:96304,indMedian:59426, nwMedian:251874, nwMean:559720},
  'Walnut Creek, CA':{hhMedian:134770,indMedian:91295, nwMedian:607824, nwMean:1350720},
  'Warner Robins, GA':{hhMedian:59646,indMedian:44243, nwMedian:110880, nwMean:246400},
  'Warren, MI':{hhMedian:60572,indMedian:44079, nwMedian:124488, nwMean:276640},
  'Warwick, RI':{hhMedian:86193,indMedian:60071, nwMedian:226485, nwMean:503300},
  'Washington, DC':{hhMedian:108210,indMedian:93761, nwMedian:450765, nwMean:1001700},
  'Waterbury, CT':{hhMedian:43420,indMedian:36307, nwMedian:142002, nwMean:315560},
  'Waterloo, IA':{hhMedian:52320,indMedian:41203, nwMedian:96768, nwMean:215040},
  'Waukegan, IL':{hhMedian:72841,indMedian:42421, nwMedian:128016, nwMean:284480},
  'Waukesha, WI':{hhMedian:81480,indMedian:55704, nwMedian:201726, nwMean:448280},
  'Wesley Chapel, FL':{hhMedian:112045,indMedian:57364, nwMedian:281484, nwMean:625520},
  'West Covina, CA':{hhMedian:96525,indMedian:45193, nwMedian:492282, nwMean:1093960},
  'West Des Moines, IA':{hhMedian:83637,indMedian:57722, nwMedian:192843, nwMean:428540},
  'West Jordan, UT':{hhMedian:105396,indMedian:51828, nwMedian:338058, nwMean:751240},
  'West Palm Beach, FL':{hhMedian:83205,indMedian:47507, nwMedian:288981, nwMean:642180},
  'West Valley City, UT':{hhMedian:80889,indMedian:43988, nwMedian:269199, nwMean:598220},
  'Westland, MI':{hhMedian:55821,indMedian:40782, nwMedian:118692, nwMean:263760},
  'Westminster, CA':{hhMedian:81443,indMedian:45467, nwMedian:551754, nwMean:1226120},
  'Westminster, CO':{hhMedian:92101,indMedian:61691, nwMedian:339066, nwMean:753480},
  'Weston, FL':{hhMedian:135764,indMedian:72876, nwMedian:450765, nwMean:1001700},
  'Whittier, CA':{hhMedian:95895,indMedian:52398, nwMedian:501354, nwMean:1114120},
  'Wichita Falls, TX':{hhMedian:60772,indMedian:43967, nwMedian:106344, nwMean:236320},
  'Wichita, KS':{hhMedian:61281,indMedian:45424, nwMedian:124803, nwMean:277340},
  'Wilmington, DE':{hhMedian:50420,indMedian:42481, nwMedian:144018, nwMean:320040},
  'Wilmington, NC':{hhMedian:71362,indMedian:50454, nwMedian:245133, nwMean:544740},
  'Winston-Salem, NC':{hhMedian:59189,indMedian:45060, nwMedian:161721, nwMean:359380},
  'Woodbury, MN':{hhMedian:120588,indMedian:76324, nwMedian:278145, nwMean:618100},
  'Worcester, MA':{hhMedian:69262,indMedian:51178, nwMedian:238707, nwMean:530460},
  'Wyoming, MI':{hhMedian:73950,indMedian:47107, nwMedian:148050, nwMean:329000},
  'Yakima, WA':{hhMedian:61776,indMedian:40829, nwMedian:196308, nwMean:436240},
  'Yonkers, NY':{hhMedian:81097,indMedian:52410, nwMedian:340956, nwMean:757680},
  'Yorba Linda, CA':{hhMedian:146923,indMedian:75355, nwMedian:726075, nwMean:1613500},
  'Yuba City, CA':{hhMedian:74210,indMedian:43035, nwMedian:250425, nwMean:556500},
  'Yuma, AZ':{hhMedian:61977,indMedian:47345, nwMedian:161280, nwMean:358400},
};
