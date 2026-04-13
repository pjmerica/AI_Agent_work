// ─────────────────────────────────────────────────────────────────────────────
// US Wealth & Income Percentile Calculator
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────
  let type     = 'household';  // 'household' | 'individual'
  let ageKey   = 'all';
  let stateKey = '';           // '' = national, else 2-letter code
  let cityKey  = '';           // '' = none, else 'City, ST'

  // ── Boot ─────────────────────────────────────────────────────────────────
  function init() {
    // Age bracket select
    const ageSel = document.getElementById('ageBracket');
    DATA.ageBrackets.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.key;
      opt.textContent = b.label;
      ageSel.appendChild(opt);
    });
    ageSel.addEventListener('change', () => { ageKey = ageSel.value; });

    // Type toggle
    document.getElementById('typeToggle').addEventListener('click', e => {
      const btn = e.target.closest('.toggle-btn');
      if (!btn) return;
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      type = btn.dataset.val;
    });

    // State dropdown
    const stateSel = document.getElementById('stateSelect');
    Object.entries(DATA.states)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .forEach(([code, s]) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = s.name;
        stateSel.appendChild(opt);
      });
    stateSel.addEventListener('change', () => {
      stateKey = stateSel.value;
      cityKey  = '';
      document.getElementById('citySearch').value = '';
      populateCitySelect('');
    });

    // City search + select
    populateCitySelect('');
    document.getElementById('citySearch').addEventListener('input', e => {
      populateCitySelect(e.target.value.trim().toLowerCase());
    });
    document.getElementById('citySelect').addEventListener('change', e => {
      cityKey = e.target.value;
    });
    // Clear city when state changes (handled in state listener above)

    // Number formatting on inputs
    ['incomeInput', 'networthInput'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('blur',  () => { el.value = formatInputDisplay(el.value); });
      el.addEventListener('focus', () => { el.value = rawNumber(el.value); });
      el.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('calcBtn').click(); });
    });

    // Calculate button
    document.getElementById('calcBtn').addEventListener('click', calculate);
  }

  function populateCitySelect(query) {
    const sel = document.getElementById('citySelect');
    const prev = cityKey;
    sel.innerHTML = '<option value="">— No city —</option>';
    Object.keys(DATA.cities)
      .filter(k => !query || k.toLowerCase().includes(query))
      .sort()
      .forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key;
        if (key === prev) opt.selected = true;
        sel.appendChild(opt);
      });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function rawNumber(str) { return str.replace(/[^0-9.-]/g, ''); }

  function parseInput(str) { return parseFloat(str.replace(/[^0-9.-]/g, '')) || 0; }

  function formatInputDisplay(str) {
    const n = parseFloat(str.replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? str : n.toLocaleString('en-US');
  }

  function formatDollars(n) {
    if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (Math.abs(n) >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'K';
    return '$' + n.toLocaleString('en-US');
  }

  function interpolatePercentile(value, points) {
    if (value <= points[0][1])                  return 0;
    if (value >= points[points.length - 1][1])  return 99.9;
    for (let i = 1; i < points.length; i++) {
      const [pLow, vLow]   = points[i - 1];
      const [pHigh, vHigh] = points[i];
      if (value >= vLow && value <= vHigh) {
        return pLow + ((value - vLow) / (vHigh - vLow)) * (pHigh - pLow);
      }
    }
    return 99.9;
  }

  function getPercentile(value, category, typeKey, ageKeyVal) {
    return interpolatePercentile(value, DATA[category][typeKey][ageKeyVal].percentiles);
  }

  function tierClass(pct) {
    if (pct >= 99) return 'top1';
    if (pct >= 95) return 'top5';
    if (pct >= 90) return 'top10';
    if (pct >= 75) return 'top25';
    return 'bottom50';
  }

  function contextLine(pct, value, category, typeKey, ageKeyVal) {
    const ds   = DATA[category][typeKey][ageKeyVal];
    const more = value >= ds.median ? 'more' : 'less';
    const diff = Math.abs(value - ds.median);
    return `You have ${more} than ${pct.toFixed(1)}% of ${typeKey === 'household' ? 'households' : 'individuals'}. ` +
           `${formatDollars(diff)} ${more === 'more' ? 'above' : 'below'} the US median.`;
  }

  // ── Calculate ────────────────────────────────────────────────────────────
  function calculate() {
    const income   = parseInput(document.getElementById('incomeInput').value);
    const networth = parseInput(document.getElementById('networthInput').value);

    if (!income && !networth) { alert('Please enter at least one value.'); return; }

    ageKey   = document.getElementById('ageBracket').value;
    stateKey = document.getElementById('stateSelect').value;
    cityKey = document.getElementById('citySelect').value || '';

    const incPct = income   ? getPercentile(income,   'income',   type, ageKey) : null;
    const nwPct  = networth ? getPercentile(networth, 'netWorth', type, ageKey) : null;

    renderResults(income, networth, incPct, nwPct);
    document.getElementById('results').style.display = 'block';
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Render Results ───────────────────────────────────────────────────────
  function renderResults(income, networth, incPct, nwPct) {
    const incDs     = DATA.income[type][ageKey];
    const nwDs      = DATA.netWorth[type][ageKey];
    const ageLbl    = DATA.ageBrackets.find(b => b.key === ageKey)?.label || 'All Ages';
    const stateData = stateKey ? DATA.states[stateKey] : null;
    const cityData  = cityKey  ? DATA.cities[cityKey]  : null;
    const stateLbl  = stateData ? stateData.name : null;
    const typeLbl   = type === 'household' ? 'Household' : 'Individual';

    // Score cards
    renderScoreCard('incomeCard',   'incomePercentile',   'incomeContext',   income,   incPct, incDs, 'income',    ageLbl);
    renderScoreCard('networthCard', 'networthPercentile', 'networthContext', networth, nwPct,  nwDs,  'net worth', ageLbl);

    // Chart subtitles
    const locLbl = cityKey || stateLbl || '';
    document.getElementById('incomeChartSub').textContent =
      `${typeLbl} income distribution — ${ageLbl}${locLbl ? ' · ' + locLbl : ''}`;
    document.getElementById('networthChartSub').textContent =
      `Household net worth distribution — ${ageLbl}${locLbl ? ' · ' + locLbl : ''}`;

    // Reference values
    const stateIncMedian = stateData ? (type === 'household' ? stateData.hhMedian  : stateData.indMedian) : null;
    const stateNwMedian  = stateData ? stateData.nwMedian : null;
    const cityIncMedian  = cityData  ? (type === 'household' ? cityData.hhMedian   : cityData.indMedian)  : null;
    const cityNwMedian   = cityData  ? cityData.nwMedian  : null;

    renderBarChart({
      canvasId: 'incomeChart', legendId: 'incomeLegend', statsId: 'incomeStats',
      stateStatsId: 'incomeStateStats', cityStatsId: 'incomeCityStats',
      userValue: income, ds: incDs, label: 'income',
      stateMedian: stateIncMedian, stateLbl,
      stateMean: stateData ? (type === 'household' ? stateData.hhMedian : stateData.indMedian) : null,
      cityMedian: cityIncMedian, cityLbl: cityKey,
      cityMean: cityData ? cityData.indMedian : null
    });

    renderBarChart({
      canvasId: 'networthChart', legendId: 'networthLegend', statsId: 'networthStats',
      stateStatsId: 'networthStateStats', cityStatsId: 'networthCityStats',
      userValue: networth, ds: nwDs, label: 'net worth',
      stateMedian: stateNwMedian, stateLbl,
      stateMean: stateData ? stateData.nwMean : null,
      cityMedian: cityNwMedian, cityLbl: cityKey,
      cityMean: cityData ? cityData.nwMean : null
    });
  }

  function renderScoreCard(cardId, valId, subId, value, pct, ds, label, ageLbl) {
    const card  = document.getElementById(cardId);
    const valEl = document.getElementById(valId);
    const subEl = document.getElementById(subId);

    card.className = 'score-card';

    if (pct === null || value === 0) {
      valEl.innerHTML  = '—';
      subEl.textContent = 'No value entered.';
      return;
    }

    const pctRound = Math.min(99.9, pct);
    valEl.innerHTML = Math.round(pctRound) + '<span class="pct-sign">th</span>';
    card.classList.add(tierClass(pctRound));

    let tier = pctRound >= 99 ? 'Top 1%' : pctRound >= 95 ? 'Top 5%' :
               pctRound >= 90 ? 'Top 10%' : pctRound >= 75 ? 'Top 25%' :
               pctRound >= 50 ? 'Above median' : 'Below median';

    subEl.innerHTML = `<strong style="color:var(--accent2)">${tier}</strong> · ${ageLbl}<br>` +
      contextLine(pctRound, value, label === 'income' ? 'income' : 'netWorth', type, ageKey);
  }

  // ── Bar Chart ─────────────────────────────────────────────────────────────
  function renderBarChart({ canvasId, legendId, statsId, stateStatsId, cityStatsId,
                             userValue, ds, label,
                             stateMedian, stateLbl, stateMean,
                             cityMedian, cityLbl, cityMean }) {

    const canvas = document.getElementById(canvasId);
    const ctx    = canvas.getContext('2d');
    const dpr    = window.devicePixelRatio || 1;
    const W      = canvas.parentElement.getBoundingClientRect().width || 700;
    const H      = 260;

    canvas.width  = W * dpr;  canvas.height = H * dpr;
    canvas.style.width = W + 'px';  canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pts  = ds.percentiles;
    const bars = [];
    for (let i = 1; i < pts.length; i++) {
      const [p0, v0] = pts[i - 1], [p1, v1] = pts[i];
      bars.push({ pLow: p0, pHigh: p1, vLow: v0, vHigh: v1, width: p1 - p0 });
    }

    const padL = 64, padR = 20, padT = 20, padB = 48;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const totalSpan = pts[pts.length - 1][0] - pts[0][0];

    const C = {
      barBase: '#2e2e42', barYou: '#5b4cf5', barAbove: '#2a2a3e',
      median: '#3ecf8e', mean: '#f5a623', you: '#7c6fff',
      state: '#a78bfa', city: '#fb923c', grid: '#2a2a38', text: '#6a6a8a'
    };

    // Grid
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 4; i++) {
      const y = padT + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Bars
    let barX = padL;
    bars.forEach(b => {
      const bW = (b.width / totalSpan) * chartW;
      const bH = chartH * 0.65;
      const bY = padT + (chartH - bH);
      const inBucket = userValue >= b.vLow && userValue < b.vHigh;
      const below    = userValue < b.vLow;
      let fill = below ? C.barAbove : C.barBase;
      if (inBucket) fill = C.barYou;
      const r = 3;
      ctx.beginPath();
      ctx.moveTo(barX + r, bY);
      ctx.lineTo(barX + bW - r, bY);
      ctx.quadraticCurveTo(barX + bW, bY, barX + bW, bY + r);
      ctx.lineTo(barX + bW, bY + bH);
      ctx.lineTo(barX, bY + bH);
      ctx.lineTo(barX, bY + r);
      ctx.quadraticCurveTo(barX, bY, barX + r, bY);
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      barX += bW + 1;
    });

    // Axis labels
    ctx.fillStyle = C.text; ctx.font = '11px -apple-system, sans-serif'; ctx.textAlign = 'center';
    [0, 10, 25, 50, 75, 90, 99].forEach(lp => {
      ctx.fillText(lp + 'th', padL + (lp / totalSpan) * chartW, H - 8);
    });
    ctx.font = '10px -apple-system, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Percentile', padL, H - 8);

    // Reference lines
    function drawLine(val, color, lbl) {
      if (!val && val !== 0) return;
      const pct = interpolatePercentile(val, pts);
      const x   = padL + (pct / totalSpan) * chartW;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + chartH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = 'bold 10px -apple-system, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(lbl, x, padT - 4);
    }

    drawLine(ds.median,  C.median, 'Median');
    drawLine(ds.mean,    C.mean,   'Avg');
    if (stateMedian) drawLine(stateMedian, C.state, 'State');
    if (cityMedian)  drawLine(cityMedian,  C.city,  'City');
    if (userValue)   drawLine(userValue,   C.you,   'You');

    // Legend
    document.getElementById(legendId).innerHTML = `
      <div class="legend-item"><div class="legend-dot" style="background:#5b4cf5"></div>Your bracket</div>
      <div class="legend-item"><div class="legend-dot" style="background:#2e2e42"></div>Above you</div>
      <div class="legend-item"><div class="legend-dot" style="background:#2a2a3e"></div>Below you</div>
      <div class="legend-item"><div class="legend-dot" style="background:#3ecf8e"></div>US Median</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f5a623"></div>US Avg</div>
      ${stateMedian ? '<div class="legend-item"><div class="legend-dot" style="background:#a78bfa"></div>State Median</div>' : ''}
      ${cityMedian  ? '<div class="legend-item"><div class="legend-dot" style="background:#fb923c"></div>City Median</div>'  : ''}
    `;

    // National stats row
    document.getElementById(statsId).innerHTML = `
      <div class="stat-box"><div class="stat-label">Your ${label}</div><div class="stat-val you">${formatDollars(userValue)}</div></div>
      <div class="stat-box"><div class="stat-label">US Median</div><div class="stat-val median-val">${formatDollars(ds.median)}</div></div>
      <div class="stat-box"><div class="stat-label">US Average</div><div class="stat-val mean-val">${formatDollars(ds.mean)}</div></div>
    `;

    // State stats row
    renderLocRow(stateStatsId, stateMedian, stateMean, stateLbl, ds.median, '#a78bfa');

    // City stats row
    renderLocRow(cityStatsId, cityMedian, cityMean, cityLbl, ds.median, '#fb923c');
  }

  function renderLocRow(elId, median, mean, lbl, natMedian, color) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!median || !lbl) { el.innerHTML = ''; return; }
    const diff   = median - natMedian;
    const sign   = diff >= 0 ? '+' : '';
    const clr    = diff >= 0 ? '#3ecf8e' : '#e84040';
    const meanHtml = mean
      ? `<div class="state-stat"><div class="state-stat-label" style="color:${color}">${lbl} Avg</div><div class="state-stat-val">${formatDollars(mean)}</div></div>`
      : '';
    el.innerHTML = `
      <div class="state-stat"><div class="state-stat-label" style="color:${color}">${lbl} Median</div><div class="state-stat-val">${formatDollars(median)}</div></div>
      ${meanHtml}
      <div class="state-stat"><div class="state-stat-label">vs US Median</div><div class="state-stat-val" style="color:${clr}">${sign}${formatDollars(diff)}</div></div>
    `;
  }

  // ── Start ────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

})();
