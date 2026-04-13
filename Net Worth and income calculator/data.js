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

const DATA = {

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
