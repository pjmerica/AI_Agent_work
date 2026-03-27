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
    .filter(w => w.length > 1 && !STOP.has(w));
}

function jaccard(a, b) {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (!sa.size || !sb.size) return 0;
  const inter = [...sa].filter(w => sb.has(w)).length;
  const union = new Set([...sa, ...sb]).size;
  return inter / union;
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
    // Only binary markets (single open contract) for clean YES/NO comparison
    const open = (m.contracts || []).filter(c => c.status === 'Open');
    if (open.length !== 1) continue;
    const c = open[0];
    const yesPrice = c.bestBuyYesCost;
    const noPrice  = c.bestBuyNoCost;
    if (yesPrice == null || noPrice == null) continue;
    markets.push({
      platform: 'PredictIt',
      title:    m.name,
      yesPrice,
      noPrice,
      url:    m.url,
      volume: null,
    });
  }
  return markets;
}

// ── Matching ──────────────────────────────────────────────────────────────────
const THRESHOLD = 0.18;

function findMatches(polyMarkets, piMarkets) {
  const pairs = [];
  const usedPI = new Set();

  for (const pm of polyMarkets) {
    let best = null;
    let bestScore = THRESHOLD;

    for (const pi of piMarkets) {
      const score = jaccard(pm.title, pi.title);
      if (score > bestScore) { bestScore = score; best = pi; }
    }

    if (!best || usedPI.has(best.url)) continue;
    usedPI.add(best.url);

    const diff = Math.abs(pm.yesPrice - best.yesPrice);
    const [cheap, dear] = pm.yesPrice <= best.yesPrice ? [pm, best] : [best, pm];
    const arbCost   = cheap.yesPrice + (1 - dear.yesPrice);
    const arbProfit = (1 - arbCost) * 100;

    pairs.push({
      polymarket:  pm,
      predictit:   best,
      score:       Math.round(bestScore * 100),
      diff:        Math.round(diff * 100 * 10) / 10,
      arb:         arbCost < 0.995,
      arbProfit:   Math.round(arbProfit * 10) / 10,
      buyYesOn:    cheap.platform,
      buyNoOn:     dear.platform,
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
