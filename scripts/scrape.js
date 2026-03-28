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
function extractEntities(title) {
  const entities = new Set();
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
  const res = await fetch(
    'https://gamma-api.polymarket.com/markets?limit=500&active=true&closed=false&order=volume&ascending=false'
  );
  if (!res.ok) throw new Error(`Polymarket HTTP ${res.status}`);
  const data = await res.json();

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
// A valid match requires:
//   1. At least 1 shared named entity (same person/org/place)
//   2. Jaccard word similarity >= JACCARD_MIN
const JACCARD_MIN  = 0.32;
const MIN_ENTITIES = 1;

function score(pmTitle, piTitle) {
  const j = jaccard(pmTitle, piTitle);
  const e = entityOverlap(pmTitle, piTitle);
  if (e < MIN_ENTITIES) return 0;
  if (j < JACCARD_MIN)  return 0;
  // Combined score weights entity overlap heavily
  return j + e * 0.3;
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
    const diff   = Math.abs(pm.yesPrice - best.yesPrice);
    const [cheap, dear] = pm.yesPrice <= best.yesPrice ? [pm, best] : [best, pm];
    const arbCost   = cheap.yesPrice + (1 - dear.yesPrice);
    const arbProfit = (1 - arbCost) * 100;

    pairs.push({
      polymarket: pm,
      predictit:  best,
      score:      Math.round(jScore * 100),
      entities:   entityOverlap(pm.title, best.title),
      diff:       Math.round(diff * 100 * 10) / 10,
      arb:        arbCost < 0.995,
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
  console.log(`Matched:    ${matches.length} pairs`);

  // Log top matches for review
  matches.slice(0, 10).forEach(m =>
    console.log(`  [${m.score}%] "${m.polymarket.title}" ↔ "${m.predictit.title}" Δ${m.diff}¢`)
  );

  const out = {
    lastUpdated:      new Date().toISOString(),
    polymarketCount:  poly.length,
    predictitCount:   pi.length,
    matchCount:       matches.length,
    matches,
  };

  const outPath = path.join(__dirname, '..', 'arbitrage', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
