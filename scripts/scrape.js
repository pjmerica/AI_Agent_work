// Runs server-side (GitHub Actions / local) — no CORS issues.
// Fetches Polymarket + PredictIt, matches markets, writes arbitrage/data.json.

const fs   = require('fs');
const path = require('path');

// ── Stop words ────────────────────────────────────────────────────────────────
const STOP = new Set([
  'will', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
  'but', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
  'do', 'does', 'did', 'by', 'from', 'with', 'as', 'into', 'through', 'during',
  'before', 'after', 'this', 'that', 'these', 'those', 'then', 'than', 'too',
  'very', 'just', 'can', 'could', 'would', 'should', 'may', 'might', 'must',
  'shall', 'which', 'who', 'what', 'when', 'where', 'why', 'how', 'if', 'so',
  'yet', 'not', 'no', 'yes', 'get', 'its', 'their', 'they', 'end', 'year',
  'over', 'under', 'more', 'less', 'most', 'least', 'any', 'all', 'each',
  'every', 'both', 'per', 'out', 'up', 'down', 'between', 'above', 'below',
  'many', 'much', 'into', 'such', 'also', 'after', 'new', 'next',
]);

// ── Normalisation ─────────────────────────────────────────────────────────────
function normalize(title) {
  return title
    .toLowerCase()
    // expand shorthand numbers
    .replace(/\$([\d.]+)b\b/g, (_, n) => String(Math.round(parseFloat(n) * 1_000_000_000)))
    .replace(/\$([\d.]+)m\b/g, (_, n) => String(Math.round(parseFloat(n) * 1_000_000)))
    .replace(/([\d.]+)k\b/g,   (_, n) => String(Math.round(parseFloat(n) * 1_000)))
    .replace(/\$([\d,]+)/g,    (_, n) => n.replace(/,/g, ''))
    .replace(/,(?=\d)/g, '')
    // common synonyms
    .replace(/\brepublican\b/g, 'gop')
    .replace(/\bdemocrat(ic)?\b/g, 'dem')
    .replace(/\bpresident(ial)?\b/g, 'president')
    .replace(/\belection\b/g, 'elect')
    .replace(/\bcongressional\b/g, 'congress')
    .replace(/\bsenate\b/g, 'senate')
    .replace(/\bhouse of representatives\b/g, 'house')
    .replace(/\bfederal reserve\b|\bfed\b/g, 'fed')
    .replace(/\binterest rate\b/g, 'rate')
    // strip punctuation
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(title) {
  return normalize(title)
    .split(' ')
    .filter(w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)); // strip pure numbers (years, dates)
}

function jaccard(a, b) {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (!sa.size || !sb.size) return 0;
  const inter = [...sa].filter(w => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return inter / union;
}

// Words that look capitalized but are not meaningful named entities
const SKIP_CAPS = new Set([
  'Will', 'The', 'A', 'An', 'Is', 'Are', 'Was', 'Can', 'Do', 'Does', 'Did',
  'By', 'In', 'Or', 'And', 'Of', 'Be', 'To', 'For', 'If', 'As', 'At', 'On',
  'With', 'From', 'That', 'This', 'Which', 'Who', 'What', 'When', 'Where',
  'How', 'But', 'Not', 'No', 'Yes', 'New', 'Next', 'Get',
  // months — we don't want "April" to create a false entity match
  'January','February','March','April','May','June','July','August',
  'September','October','November','December',
  'Jan','Feb','Mar','Apr','Jun','Jul','Aug','Sep','Oct','Nov','Dec',
  // generic political/geographic words that create false positives
  'Republican','Democratic','Democrat','Senate','House','Congress',
  'President','Governor','Election','Primary','Nominee','Nomination',
  'Prime','Minister','United','Kingdom','States','America',
  'North','South','East','West','Party','Office','Federal',
  'Trump','Biden','Obama',  // too common across both platforms to be useful
]);

// Extract named entities from the ORIGINAL (un-normalised) title.
// Only two-word proper noun bigrams count as valid entities to avoid false matches on
// single common words like "China", "Trump", "April", numbers, etc.
// US states and the district shorthand political markets use. A political title
// rarely has a usable capitalised bigram -- SKIP_CAPS removes Republican, Senate,
// House, Governor, Election and the rest, which is right, because those words are
// shared boilerplate -- but it almost always names a place, and the place is what
// actually distinguishes one race from another. Without this, 306 of 527 PredictIt
// titles yielded no entity at all and could never match anything.
const STATES = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada',
  'new hampshire','new jersey','new mexico','new york','north carolina',
  'north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island',
  'south carolina','south dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west virginia','wisconsin','wyoming',
];
// Longest first, so "west virginia" is not read as "virginia". This exact bug has
// hit both prediction-market repos before; see AGENTS.md.
const STATES_BY_LENGTH = STATES.slice().sort((a, b) => b.length - a.length);

function placeEntities(title) {
  const out = new Set();
  const low = ' ' + String(title).toLowerCase().replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ') + ' ';
  let rest = low;
  for (const st of STATES_BY_LENGTH) {
    if (rest.includes(' ' + st + ' ')) {
      out.add('state:' + st);
      rest = rest.split(' ' + st + ' ').join(' ');
    }
  }
  // Chamber control with no state named is a NATIONAL market, and that is the
  // most valuable thing to pair: both platforms carry "who controls the Senate
  // after the 2026 midterms". Without an entity of its own it names no place and
  // so could never match. Keyed separately from a state so a Georgia Senate race
  // cannot pair with the national one.
  // District shorthand: OH-14, NY-17, CA-22. Collected BEFORE the national
  // fallback below: otherwise a district market also picks up a national
  // entity and can pair with the chamber-control race, which is the OH-14
  // versus "win the House" false match this mechanism exists to prevent.
  for (const m of String(title).matchAll(/\b([A-Z]{2})-(\d{1,2})\b/g)) {
    out.add('district:' + m[1].toLowerCase() + '-' + String(Number(m[2])));
  }

  if (!out.size) {
    const low2 = String(title).toLowerCase();
    const chamber = /\bsenate\b/.test(low2) ? 'senate'
      : /\bhouse\b/.test(low2) ? 'house'
      : /\bpresident|white house\b/.test(low2) ? 'president' : null;
    if (chamber && /\bcontrol|majority|balance of power|win the\b/.test(low2)) {
      out.add('national:' + chamber);
    }
  }

  return out;
}

function extractEntities(title) {
  const entities = new Set();
  for (const e of placeEntities(title)) entities.add(e);
  const words = title.replace(/["""'']/g, '').split(/\s+/);

  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i].replace(/[^a-zA-Z]/g, '');
    const w2 = words[i + 1].replace(/[^a-zA-Z]/g, '');
    if (w1.length < 2 || w2.length < 2) continue;
    if (!w1[0] || w1[0] !== w1[0].toUpperCase()) continue;
    if (!w2[0] || w2[0] !== w2[0].toUpperCase()) continue;
    if (SKIP_CAPS.has(w1) || SKIP_CAPS.has(w2)) continue;
    // both words are capitalized and meaningful → bigram entity
    entities.add((w1 + ' ' + w2).toLowerCase());
  }

  return entities;
}

function entityOverlap(titleA, titleB) {
  const ea = extractEntities(titleA);
  const eb = extractEntities(titleB);
  return [...ea].filter(e => eb.has(e)).length;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────
async function fetchPolymarket() {
  console.log('Fetching Polymarket…');
  // The Gamma API caps a page at 100 regardless of `limit`, and does it silently:
  // limit=500 returns 100 with no error. That kept this widget empty for weeks --
  // the top 100 by volume are weather, sports spreads and exact-score markets,
  // while PredictIt is almost entirely US politics, so the two inputs had no
  // topical overlap and nothing could match. The political markets are there
  // (371 of them), below the cap.
  const PAGE = 100;
  const MAX_PAGES = 30;              // ~3,000; the active set is ~2,100
  const data = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    // No `order` parameter. Paging this endpoint with &order=volume returns ZERO
    // political markets at every offset, while the same pages without it return
    // 371 -- including ones with 32k and 216k volume, so this is not the sort
    // correctly de-prioritising thin markets, it is the sort dropping rows.
    // Order does not matter here regardless: the matcher scores every pair.
    const url = 'https://gamma-api.polymarket.com/markets'
      + '?limit=' + PAGE + '&offset=' + (page * PAGE)
      + '&active=true&closed=false';
    const res = await fetch(url);
    if (!res.ok) {
      // Only the first page is fatal. A later one failing should not throw away
      // an otherwise usable board.
      if (page === 0) throw new Error(`Polymarket HTTP ${res.status}`);
      console.error(`  page ${page} failed (HTTP ${res.status}); keeping ${data.length}`);
      break;
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    // The API mixes non-objects into the array -- that is what crashed a naive
    // scan of this endpoint earlier -- so filter before anything reads a field.
    for (const m of batch) {
      if (m && typeof m === 'object') data.push(m);
    }
    if (batch.length < PAGE) break;
  }

  return data
    .filter(m => m.question && m.outcomePrices && !m.closed)
    .map(m => {
      let prices;
      try { prices = JSON.parse(m.outcomePrices); } catch { return null; }
      const yesPrice = parseFloat(prices[0]);
      const noPrice  = parseFloat(prices[1]);
      if (isNaN(yesPrice) || isNaN(noPrice)) return null;
      return {
        platform: 'Polymarket',
        title:    m.question,
        yesPrice,
        noPrice,
        url:    `https://polymarket.com/event/${m.slug}`,
        volume: parseFloat(m.volume) || 0,
      };
    })
    .filter(Boolean);
}

async function fetchPredictit() {
  console.log('Fetching PredictIt…');
  const res = await fetch('https://www.predictit.org/api/marketdata/all/');
  if (!res.ok) throw new Error(`PredictIt HTTP ${res.status}`);
  const data = await res.json();

  const markets = [];
  for (const m of data.markets || []) {
    if (m.status !== 'Open') continue;
    const open = (m.contracts || []).filter(c => c.status === 'Open');
    if (!open.length) continue;

    if (open.length === 1) {
      // Simple binary market — use the market name as the title
      const c = open[0];
      if (c.bestBuyYesCost == null || c.bestBuyNoCost == null) continue;
      markets.push({
        platform: 'PredictIt',
        title:    m.name,
        yesPrice: c.bestBuyYesCost,
        noPrice:  c.bestBuyNoCost,
        url:      m.url,
        volume:   null,
      });
    } else {
      // Multi-contract market (e.g. "Who wins 2028 Dem nom?") —
      // treat each candidate contract as its own YES/NO question
      for (const c of open) {
        if (c.bestBuyYesCost == null || c.bestBuyNoCost == null) continue;
        const name = c.name || c.shortName || '';
        // Convert "Who will X?" → "Will [Name] X?"
        let title = m.name
          .replace(/^Who will\s+/i,    `Will ${name} `)
          .replace(/^Who is\s+/i,      `Is ${name} `)
          .replace(/^Which \w+ will\s+/i, `Will ${name} `);
        if (title === m.name) title = `Will ${name} — ${m.name}`;
        markets.push({
          platform: 'PredictIt',
          title,
          yesPrice: c.bestBuyYesCost,
          noPrice:  c.bestBuyNoCost,
          url:      m.url,
          volume:   null,
        });
      }
    }
  }
  return markets;
}

// ── Matching ──────────────────────────────────────────────────────────────────
const JACCARD_MIN  = 0.32;
const MIN_ENTITIES = 1;

// Reject pairs where the two markets are clearly asking about DIFFERENT stages
// of the same event (e.g. first-round placement vs. winning outright, or
// announcing a run vs. winning a nomination).
const STAGE_GROUPS = [
  ['first round', 'second round', 'runoff', 'first place', 'qualify for', 'advance from'],
  ['announce', 'run for', 'candidacy', 'declare'],
];

function stagesCompatible(titleA, titleB) {
  const a = titleA.toLowerCase();
  const b = titleB.toLowerCase();
  for (const group of STAGE_GROUPS) {
    const inA = group.some(w => a.includes(w));
    const inB = group.some(w => b.includes(w));
    if (inA !== inB) return false; // one has the stage word, the other doesn't
  }
  // Primary vs. general election: reject if one is about a primary and the
  // other is about the general election (contains "election" but not "primary")
  const aPrimary = a.includes('primary');
  const bPrimary = b.includes('primary');
  const aGeneral  = a.includes('election') && !aPrimary;
  const bGeneral  = b.includes('election') && !bPrimary;
  if (aPrimary && bGeneral) return false;
  if (bPrimary && aGeneral) return false;
  return true;
}

function score(pmTitle, piTitle) {
  if (!stagesCompatible(pmTitle, piTitle)) return 0;
  const j = jaccard(pmTitle, piTitle);
  const e = entityOverlap(pmTitle, piTitle);
  if (e < MIN_ENTITIES) return 0;
  if (j < JACCARD_MIN)  return 0;
  return j + e * 0.3;
}

/* Which party a market is asking to win, or null when it is not that kind of
 * question.
 *
 * This exists because the two platforms phrase the same race from opposite sides.
 * Polymarket lists "Will the Democrats win the West Virginia Senate race" while
 * PredictIt lists "Will Republican win the 2026 US Senate election in West
 * Virginia". Comparing those two prices directly reads a near-certain Republican
 * hold as a 95-cent arbitrage, which is the single biggest source of fake
 * opportunities on a political board -- AGENTS.md records the same bug, and the
 * same fix, in both prediction-market repos.
 */
function partyAsked(title) {
  const t = String(title).toLowerCase();
  // "will X win" / "will the Xs win" -- the subject is the party being asked about.
  const dem = /\b(democrat|democrats|democratic|dem)\b/.test(t);
  const gop = /\b(republican|republicans|gop)\b/.test(t);
  if (dem === gop) return null;        // both or neither: cannot tell
  return dem ? 'dem' : 'gop';
}

/* Reasons to distrust a pair, as a list of short strings.
 *
 * An empty list does not prove a pair is sound, but a non-empty one is a concrete
 * reason not to stake money on it. The thresholds follow the sibling repos
 * (AGENTS.md): a double-digit return on a liquid political market is a mismatch,
 * not an opportunity.
 */
function suspicionReasons(pm, pi, opts) {
  const out = [];
  const profit = opts.arbProfit;
  if (profit > 15) {
    out.push('return of ' + profit.toFixed(1) + '% is too large to be real; '
      + 'these are probably different questions');
  }
  const a = String(pm.title).toLowerCase();
  const b = String(pi.title).toLowerCase();

  // "which race is closest" / "margin of victory" is not "who wins".
  const bucket = /closest|margin|by \d|\d+%-\d+%|or fewer|or more|to \d+ seats/;
  if (bucket.test(a) !== bucket.test(b)) {
    out.push('one side is a margin or bucket market, the other is a plain winner');
  }

  // Different deadline years cannot be the same question.
  const yearsOf = (t) => new Set((t.match(/\b20\d\d\b/g) || []));
  const ya = yearsOf(a), yb = yearsOf(b);
  if (ya.size && yb.size && ![...ya].some((y) => yb.has(y))) {
    out.push('deadline years do not overlap (' + [...ya].join('/') + ' vs '
      + [...yb].join('/') + ')');
  }

  // Both name a person, but not the same person: different candidates in one race.
  const namesOf = (t) => new Set(
    (String(t).match(/\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g) || [])
      .map((n) => n.toLowerCase())
      .filter((n) => !/^(will|the|which|republican|democratic|united|new |north|south|west |east )/.test(n)));
  const na = namesOf(pm.title), nb = namesOf(pi.title);
  if (na.size && nb.size && ![...na].some((n) => nb.has(n))) {
    out.push('each side names a different person');
  }

  // "Will X leave before June?" and "Will X be the NEXT to leave?" are different
  // questions: the second is a race between candidates, so X can leave and still
  // lose it. Same for "which of these 10 leaders will go first". These read as
  // near-identical to a token comparison, so they have to be caught explicitly.
  const ordinal = /\bnext\b|\bwhich of these\b|\bfirst to\b|\bclosest\b/;
  if (ordinal.test(a) !== ordinal.test(b)) {
    out.push('one side asks who is NEXT or closest, a race between candidates; '
      + 'the other asks only whether it happens');
  }

  if (opts.partyFlipped) {
    out.push('opposite-party phrasing; one price was inverted to compare');
  }
  return out;
}

function findMatches(polyMarkets, piMarkets) {
  const pairs  = [];
  const usedPI = new Set();

  for (const pm of polyMarkets) {
    let best = null, bestScore = 0;

    for (const pi of piMarkets) {
      const s = score(pm.title, pi.title);
      if (s > bestScore) { bestScore = s; best = pi; }
    }

    if (!best || bestScore === 0 || usedPI.has(best.url + best.title)) continue;
    usedPI.add(best.url + best.title);

    const jScore = jaccard(pm.title, best.title);

    // If the two titles ask about opposite parties, they are opposite
    // propositions and their prices must not be compared as-is: a near-certain
    // Republican hold shows up as a ~95c "arbitrage" that would simply lose.
    // Flip the PredictIt side so both describe the same party's chance.
    const pmParty = partyAsked(pm.title);
    const piParty = partyAsked(best.title);
    const flipped = Boolean(pmParty && piParty && pmParty !== piParty);
    const piYes = flipped ? 1 - best.yesPrice : best.yesPrice;

    const diff   = Math.abs(pm.yesPrice - piYes);
    const cheapIsPm = pm.yesPrice <= piYes;
    const cheapPrice = cheapIsPm ? pm.yesPrice : piYes;
    const dearPrice  = cheapIsPm ? piYes : pm.yesPrice;
    const [cheap, dear] = cheapIsPm ? [pm, best] : [best, pm];
    const arbCost   = cheapPrice + (1 - dearPrice);
    const arbProfit = (1 - arbCost) * 100;

    pairs.push({
      polymarket: pm,
      predictit:  best,
      score:      Math.round(jScore * 100),
      entities:   entityOverlap(pm.title, best.title),
      diff:       Math.round(diff * 100 * 10) / 10,
      // True when the two markets ask about opposite parties and one price was
      // inverted to compare them. Worth showing: it changes what "buy YES" means.
      partyFlipped: flipped,
      arb:        arbCost < 0.995,
      suspicion:  suspicionReasons(pm, best, { arbProfit, partyFlipped: flipped }),
      arbProfit:  Math.round(arbProfit * 10) / 10,
      buyYesOn:   cheap.platform,
      buyNoOn:    dear.platform,
    });
  }

  return pairs.sort((a, b) => {
    if (b.arb !== a.arb) return b.arb ? 1 : -1;
    return b.diff - a.diff;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const [poly, pi] = await Promise.allSettled([fetchPolymarket(), fetchPredictit()])
    .then(([p, q]) => [
      p.status === 'fulfilled' ? p.value : (console.error('Polymarket:', p.reason.message), []),
      q.status === 'fulfilled' ? q.value : (console.error('PredictIt:',  q.reason.message), []),
    ]);

  console.log(`Polymarket: ${poly.length} markets`);
  console.log(`PredictIt:  ${pi.length} markets`);

  const matches = findMatches(poly, pi);
  const clean = matches.filter((m) => m.arb && m.suspicion.length === 0);
  const doubtful = matches.filter((m) => m.arb && m.suspicion.length > 0);
  console.log(`Matched:    ${matches.length} pairs`);
  console.log(`  arb, no suspicion flags: ${clean.length}`);
  console.log(`  arb but flagged:         ${doubtful.length}`);

  // Log top matches for review
  matches.slice(0, 10).forEach(m =>
    console.log(`  [${m.score}%] "${m.polymarket.title}" ↔ "${m.predictit.title}" Δ${m.diff}¢`)
  );

  const out = {
    lastUpdated:      new Date().toISOString(),
    polymarketCount:  poly.length,
    predictitCount:   pi.length,
    matchCount:       matches.length,
    arbCleanCount:    clean.length,
    arbFlaggedCount:  doubtful.length,
    matches,
  };

  const outPath = path.join(__dirname, '..', 'arbitrage', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
