// Runs server-side (GitHub Actions / local) — no CORS issues.
// Fetches Polymarket + Kalshi, matches markets, writes arbitrage/data.json.

const fs = require('fs');
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
]);

// ── Normalisation ─────────────────────────────────────────────────────────────
function normalize(title) {
  return title
    .toLowerCase()
    // expand shorthand numbers: 50k → 50000, $1.2m → 1200000
    .replace(/\$([\d.]+)m\b/g, (_, n) => String(Math.round(parseFloat(n) * 1_000_000)))
    .replace(/\$([\d.]+)b\b/g, (_, n) => String(Math.round(parseFloat(n) * 1_000_000_000)))
    .replace(/([\d.]+)k\b/g,   (_, n) => String(Math.round(parseFloat(n) * 1_000)))
    // strip dollar signs and commas from numbers
    .replace(/\$([\d,]+)/g, (_, n) => n.replace(/,/g, ''))
    .replace(/,(?=\d)/g, '')
    // common abbreviation synonyms
    .replace(/\bbtc\b/g, 'bitcoin')
    .replace(/\beth\b/g, 'ethereum')
    .replace(/\bsol\b/g, 'solana')
    .replace(/\bxrp\b/g, 'ripple')
    .replace(/\bfed\b/g, 'federal reserve')
    .replace(/\bcpi\b/g, 'inflation')
    .replace(/\bgdp\b/g, 'economic growth')
    .replace(/\bnba\b/g, 'basketball')
    .replace(/\bnfl\b/g, 'football')
    .replace(/\bmlb\b/g, 'baseball')
    .replace(/\bnhl\b/g, 'hockey')
    // month names → numbers for date matching
    .replace(/\bjanuary\b|\bjan\b/g, '01')
    .replace(/\bfebruary\b|\bfeb\b/g, '02')
    .replace(/\bmarch\b|\bmar\b/g, '03')
    .replace(/\bapril\b|\bapr\b/g, '04')
    .replace(/\bmay\b/g, '05')
    .replace(/\bjune\b|\bjun\b/g, '06')
    .replace(/\bjuly\b|\bjul\b/g, '07')
    .replace(/\baugust\b|\baug\b/g, '08')
    .replace(/\bseptember\b|\bsep\b|\bsept\b/g, '09')
    .replace(/\boctober\b|\boct\b/g, '10')
    .replace(/\bnovember\b|\bnov\b/g, '11')
    .replace(/\bdecember\b|\bdec\b/g, '12')
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
  const url = 'https://gamma-api.polymarket.com/markets?limit=500&active=true&closed=false&order=volume&ascending=false';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polymarket ${res.status}`);
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
        title: m.question,
        yesPrice,
        noPrice,
        url: `https://polymarket.com/event/${m.slug}`,
        volume: parseFloat(m.volume) || 0,
      };
    })
    .filter(Boolean);
}

async function getKalshiToken() {
  const email    = process.env.KALSHI_EMAIL;
  const password = process.env.KALSHI_PASSWORD;
  if (!email || !password) {
    console.warn('KALSHI_EMAIL / KALSHI_PASSWORD not set — skipping Kalshi');
    return null;
  }
  const res = await fetch('https://trading-api.kalshi.com/trade-api/v2/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Kalshi login failed: ${res.status}`);
  const { token } = await res.json();
  return token;
}

async function fetchKalshi() {
  console.log('Fetching Kalshi…');
  const token = await getKalshiToken();
  if (!token) return [];

  const res = await fetch(
    'https://trading-api.kalshi.com/trade-api/v2/markets?status=open&limit=1000',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Kalshi markets: ${res.status}`);
  const data = await res.json();

  return (data.markets || [])
    .filter(m => m.title && m.yes_bid != null && m.status === 'open')
    .map(m => {
      const yesPrice = m.yes_bid > 1 ? m.yes_bid / 100 : m.yes_bid;
      const noPrice  = m.no_bid  > 1 ? m.no_bid  / 100 : m.no_bid;
      return {
        platform: 'Kalshi',
        title: m.title,
        yesPrice,
        noPrice,
        url: `https://kalshi.com/markets/${m.event_ticker}#${m.ticker}`,
        volume: m.volume || 0,
      };
    });
}

// ── Matching ──────────────────────────────────────────────────────────────────
const THRESHOLD = 0.20;

function findMatches(polyMarkets, kalshiMarkets) {
  const pairs = [];
  const usedKalshi = new Set();

  // For each Polymarket market, find best Kalshi match
  for (const pm of polyMarkets) {
    let best = null;
    let bestScore = THRESHOLD;

    for (const km of kalshiMarkets) {
      const score = jaccard(pm.title, km.title);
      if (score > bestScore) {
        bestScore = score;
        best = km;
      }
    }

    if (best && !usedKalshi.has(best.url)) {
      usedKalshi.add(best.url);
      const diff = Math.abs(pm.yesPrice - best.yesPrice);
      const [cheap, dear] = pm.yesPrice <= best.yesPrice ? [pm, best] : [best, pm];
      const arbCost   = cheap.yesPrice + (1 - dear.yesPrice);
      const arbProfit = (1 - arbCost) * 100;

      pairs.push({
        polymarket: pm,
        kalshi:     best,
        score:      Math.round(bestScore * 100),
        diff:       Math.round(diff * 100 * 10) / 10,   // in cents, 1dp
        arb:        arbCost < 0.995,
        arbProfit:  Math.round(arbProfit * 10) / 10,
        buyYesOn:   cheap.platform,
        buyNoOn:    dear.platform,
      });
    }
  }

  // Sort: arb first, then biggest price diff
  return pairs.sort((a, b) => {
    if (b.arb !== a.arb) return b.arb ? 1 : -1;
    return b.diff - a.diff;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const [poly, kalshi] = await Promise.allSettled([fetchPolymarket(), fetchKalshi()])
    .then(([p, k]) => [
      p.status === 'fulfilled' ? p.value : (console.error('Polymarket failed:', p.reason.message), []),
      k.status === 'fulfilled' ? k.value : (console.error('Kalshi failed:',     k.reason.message), []),
    ]);
  console.log(`Polymarket: ${poly.length} markets`);
  console.log(`Kalshi:     ${kalshi.length} markets`);

  const matches = findMatches(poly, kalshi);
  console.log(`Matched:    ${matches.length} pairs`);

  const out = {
    lastUpdated:    new Date().toISOString(),
    polymarketCount: poly.length,
    kalshiCount:    kalshi.length,
    matchCount:     matches.length,
    matches,
  };

  const outPath = path.join(__dirname, '..', 'arbitrage', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
