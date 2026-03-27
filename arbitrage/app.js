// ── Constants ──────────────────────────────────────────────────────────────

const CORS_PROXY = 'https://corsproxy.io/?';
const SIMILARITY_THRESHOLD = 0.22;

const STOP_WORDS = new Set([
  'will', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or',
  'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'by', 'from', 'with', 'as', 'into', 'through',
  'during', 'before', 'after', 'this', 'that', 'these', 'those', 'then', 'than',
  'too', 'very', 'just', 'can', 'could', 'would', 'should', 'may', 'might',
  'must', 'shall', 'which', 'who', 'what', 'when', 'where', 'why', 'how',
  'if', 'so', 'yet', 'not', 'no', 'yes', 'get', 'its', 'their', 'they',
  'end', 'year', 'over', 'under', 'more', 'less', 'most', 'least', 'any',
  'all', 'each', 'every', 'both', 'per', 'out', 'up', 'down', 'between',
]);

// ── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchJSON(url, useCorsProxy = false) {
  const target = useCorsProxy ? `${CORS_PROXY}${encodeURIComponent(url)}` : url;
  const res = await fetch(target, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function fetchWithFallback(url) {
  try {
    return await fetchJSON(url, false);
  } catch {
    return await fetchJSON(url, true);
  }
}

// Normalise any price to 0–1 decimal
function norm(price) {
  if (price == null || isNaN(price)) return null;
  return price > 1.5 ? price / 100 : price;
}

// ── Platform fetchers ───────────────────────────────────────────────────────

async function fetchPolymarket() {
  const data = await fetchWithFallback(
    'https://gamma-api.polymarket.com/markets?limit=200&active=true&closed=false&order=volume&ascending=false'
  );
  return data
    .filter(m => m.question && m.outcomePrices && !m.closed)
    .map(m => {
      let prices;
      try { prices = JSON.parse(m.outcomePrices); } catch { return null; }
      const yesPrice = norm(parseFloat(prices[0]));
      const noPrice  = norm(parseFloat(prices[1]));
      if (yesPrice == null || noPrice == null) return null;
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

async function fetchPredictit() {
  const data = await fetchWithFallback('https://www.predictit.org/api/marketdata/all/');
  const markets = [];
  for (const m of data.markets || []) {
    // Only binary markets (single open contract) for clean YES/NO comparison
    const open = (m.contracts || []).filter(c => c.status === 'Open');
    if (open.length === 1) {
      const c = open[0];
      const yesPrice = norm(c.bestBuyYesCost);
      const noPrice  = norm(c.bestBuyNoCost);
      if (yesPrice == null || noPrice == null) continue;
      markets.push({
        platform: 'PredictIt',
        title: m.name,
        yesPrice,
        noPrice,
        url: m.url,
        volume: null,
      });
    }
  }
  return markets;
}

async function fetchKalshi() {
  const data = await fetchWithFallback(
    'https://trading-api.kalshi.com/trade-api/v2/markets?status=open&limit=200'
  );
  return (data.markets || [])
    .filter(m => m.title && m.yes_bid != null)
    .map(m => ({
      platform: 'Kalshi',
      title: m.title,
      yesPrice: norm(m.yes_bid),
      noPrice:  norm(m.no_bid),
      url: `https://kalshi.com/markets/${m.event_ticker}#${m.ticker}`,
      volume: m.volume || 0,
    }));
}

// ── Matching ────────────────────────────────────────────────────────────────

function tokenize(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function jaccard(titleA, titleB) {
  const setA = new Set(tokenize(titleA));
  const setB = new Set(tokenize(titleB));
  if (!setA.size || !setB.size) return 0;
  const inter = [...setA].filter(w => setB.has(w)).length;
  const union  = new Set([...setA, ...setB]).size;
  return inter / union;
}

function findMatches(allMarkets) {
  // Group by platform
  const byPlatform = {};
  for (const m of allMarkets) {
    (byPlatform[m.platform] ||= []).push(m);
  }

  const platforms = Object.keys(byPlatform);
  const pairs = [];
  const seen  = new Set();

  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const listA = byPlatform[platforms[i]];
      const listB = byPlatform[platforms[j]];

      for (const a of listA) {
        let best = null, bestScore = SIMILARITY_THRESHOLD;
        for (const b of listB) {
          const score = jaccard(a.title, b.title);
          if (score > bestScore) { bestScore = score; best = b; }
        }
        if (!best) continue;
        const key = [a.platform + a.title, best.platform + best.title].sort().join('\0');
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push({ a, b: best, score: bestScore });
        }
      }
    }
  }

  // Sort: arb opportunities first, then by price delta
  return pairs.sort((x, y) => {
    const arbX = calcArbitrage(x.a, x.b).possible ? 1 : 0;
    const arbY = calcArbitrage(y.a, y.b).possible ? 1 : 0;
    if (arbY !== arbX) return arbY - arbX;
    return Math.abs(y.a.yesPrice - y.b.yesPrice) - Math.abs(x.a.yesPrice - x.b.yesPrice);
  });
}

// ── Arbitrage logic ─────────────────────────────────────────────────────────

function calcArbitrage(a, b) {
  // Buy YES on cheaper platform + NO on dearer platform
  // Profit if combined cost < $1
  const [cheap, dear] = a.yesPrice <= b.yesPrice ? [a, b] : [b, a];
  const cost   = cheap.yesPrice + (1 - dear.yesPrice);
  const profit = (1 - cost) * 100;
  return {
    possible:   cost < 0.995, // small buffer for fees
    profit,
    buyYesOn:   cheap.platform,
    buyNoOn:    dear.platform,
  };
}

// ── Render ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pct(p) {
  return p != null ? (p * 100).toFixed(1) + '¢' : 'N/A';
}

function diffClass(diff) {
  if (diff >= 0.10) return 'large';
  if (diff >= 0.05) return 'notable';
  return '';
}

function renderPair({ a, b, score }) {
  const diff = Math.abs(a.yesPrice - b.yesPrice);
  const arb  = calcArbitrage(a, b);
  const aCheaper = a.yesPrice <= b.yesPrice;

  const card = document.createElement('div');
  card.className = 'card' + (arb.possible ? ' arb' : '');
  card.dataset.arb = arb.possible ? '1' : '0';

  card.innerHTML = `
    <div class="card-title">${esc(a.title)}</div>
    ${arb.possible ? `
      <div class="arb-badge">
        ⚡ Arb opportunity — buy YES on ${esc(arb.buyYesOn)}, NO on ${esc(arb.buyNoOn)}
        · +${arb.profit.toFixed(1)}¢ per $1
      </div>` : ''}
    <div class="markets">
      <div class="market">
        <div class="platform-name">${esc(a.platform)}</div>
        <div class="prices">
          <span class="price${aCheaper ? ' cheaper' : ''}">YES ${pct(a.yesPrice)}</span>
          <span class="price">NO ${pct(a.noPrice)}</span>
        </div>
        <a href="${esc(a.url)}" target="_blank" rel="noopener" class="market-link">View on ${esc(a.platform)} →</a>
      </div>

      <div class="divider">
        <span class="diff ${diffClass(diff)}">Δ ${(diff * 100).toFixed(1)}¢</span>
      </div>

      <div class="market">
        <div class="platform-name">${esc(b.platform)}</div>
        <div class="prices">
          <span class="price${!aCheaper ? ' cheaper' : ''}">YES ${pct(b.yesPrice)}</span>
          <span class="price">NO ${pct(b.noPrice)}</span>
        </div>
        <a href="${esc(b.url)}" target="_blank" rel="noopener" class="market-link">View on ${esc(b.platform)} →</a>
      </div>
    </div>
    <div class="match-score">Match confidence: ${Math.round(score * 100)}%</div>
  `;

  return card;
}

// ── Main ────────────────────────────────────────────────────────────────────

let allPairs = [];

function applyFilter() {
  const arbOnly = document.getElementById('arbOnly').checked;
  document.querySelectorAll('.card').forEach(el => {
    el.style.display = arbOnly && el.dataset.arb !== '1' ? 'none' : '';
  });
}

async function main() {
  const statusEls = {
    Polymarket: document.getElementById('statusPolymarket'),
    PredictIt:  document.getElementById('statusPredictit'),
    Kalshi:     document.getElementById('statusKalshi'),
  };
  const grid  = document.getElementById('grid');
  const count = document.getElementById('count');

  const allMarkets = [];

  async function tryFetch(name, fetchFn) {
    const el = statusEls[name];
    el.textContent = 'Loading…';
    el.className = 'status loading';
    try {
      const markets = await fetchFn();
      allMarkets.push(...markets);
      el.textContent = `✓ ${markets.length} markets`;
      el.className = 'status ok';
    } catch (e) {
      el.textContent = '✗ Failed';
      el.className = 'status error';
      console.warn(`[${name}]`, e.message);
    }
  }

  await Promise.all([
    tryFetch('Polymarket', fetchPolymarket),
    tryFetch('PredictIt',  fetchPredictit),
    tryFetch('Kalshi',     fetchKalshi),
  ]);

  allPairs = findMatches(allMarkets);
  const arbCount = allPairs.filter(p => calcArbitrage(p.a, p.b).possible).length;

  count.textContent = arbCount > 0
    ? `${allPairs.length} matched pairs · ${arbCount} arbitrage opportunities`
    : `${allPairs.length} matched pairs`;

  grid.innerHTML = '';
  if (!allPairs.length) {
    grid.innerHTML = '<p class="empty">No matching markets found across platforms.</p>';
    return;
  }

  for (const pair of allPairs) grid.appendChild(renderPair(pair));

  document.getElementById('arbOnly').addEventListener('change', applyFilter);
}

main();
