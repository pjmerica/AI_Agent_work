// ─────────────────────────────────────────────────────────────────────────────
// US Wealth & Income Percentile Calculator
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────
  let type = 'household';   // 'household' | 'individual'
  let ageKey = 'all';
  let stateKey = '';        // '' = national, else 2-letter code
  let incomeChart = null;
  let networthChart = null;

  // ── Boot ─────────────────────────────────────────────────────────────────
  function init() {
    // Populate age bracket select
    const sel = document.getElementById('ageBracket');
    DATA.ageBrackets.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.key;
      opt.textContent = b.label;
      sel.appendChild(opt);
    });

    // Type toggle
    document.getElementById('typeToggle').addEventListener('click', e => {
      const btn = e.target.closest('.toggle-btn');
      if (!btn) return;
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      type = btn.dataset.val;
    });

    // Age bracket change
    sel.addEventListener('change', () => { ageKey = sel.value; });

    // Populate state dropdown
    const stateSel = document.getElementById('stateSelect');
    const sortedStates = Object.entries(DATA.states).sort((a, b) => a[1].name.localeCompare(b[1].name));
    sortedStates.forEach(([code, s]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = s.name;
      stateSel.appendChild(opt);
    });
    stateSel.addEventListener('change', () => { stateKey = stateSel.value; });

    // Number formatting on inputs
    ['incomeInput', 'networthInput'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('blur', () => { el.value = formatInputDisplay(el.value); });
      el.addEventListener('focus', () => { el.value = rawNumber(el.value); });
      el.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('calcBtn').click(); });
    });

    // Calculate button
    document.getElementById('calcBtn').addEventListener('click', calculate);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function rawNumber(str) {
    return str.replace(/[^0-9.-]/g, '');
  }

  function parseInput(str) {
    return parseFloat(str.replace(/[^0-9.-]/g, '')) || 0;
  }

  function formatInputDisplay(str) {
    const n = parseFloat(str.replace(/[^0-9.-]/g, ''));
    if (isNaN(n)) return str;
    return n.toLocaleString('en-US');
  }

  function formatDollars(n) {
    if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (Math.abs(n) >= 1_000)    return '$' + (n / 1_000).toFixed(0) + 'K';
    return '$' + n.toLocaleString('en-US');
  }

  // Linear interpolation between two percentile points
  function interpolatePercentile(value, points) {
    // points: array of [percentile, dollar_floor]
    if (value <= points[0][1]) return 0;
    if (value >= points[points.length - 1][1]) return 99.9;

    for (let i = 1; i < points.length; i++) {
      const [pLow, vLow]  = points[i - 1];
      const [pHigh, vHigh] = points[i];
      if (value >= vLow && value <= vHigh) {
        const frac = (value - vLow) / (vHigh - vLow);
        return pLow + frac * (pHigh - pLow);
      }
    }
    return 99.9;
  }

  function getPercentile(value, category, typeKey, ageKeyVal) {
    const dataset = DATA[category][typeKey][ageKeyVal];
    return interpolatePercentile(value, dataset.percentiles);
  }

  function ordinalSuffix(n) {
    const r = Math.round(n);
    const s = ['th','st','nd','rd'];
    const v = r % 100;
    return r + (s[(v-20)%10] || s[v] || s[0]);
  }

  function tierClass(pct) {
    if (pct >= 99) return 'top1';
    if (pct >= 95) return 'top5';
    if (pct >= 90) return 'top10';
    if (pct >= 75) return 'top25';
    return 'bottom50';
  }

  function contextLine(pct, value, category, typeKey, ageKeyVal) {
    const ds = DATA[category][typeKey][ageKeyVal];
    const above = (100 - pct).toFixed(1);
    const below = pct.toFixed(1);
    const more = value >= ds.median ? 'more' : 'less';
    const diff = Math.abs(value - ds.median);
    return `You have ${more} than ${below}% of ${typeKey === 'household' ? 'households' : 'individuals'}. ${formatDollars(diff)} ${more === 'more' ? 'above' : 'below'} the median.`;
  }

  // ── Calculate ────────────────────────────────────────────────────────────
  function calculate() {
    const income   = parseInput(document.getElementById('incomeInput').value);
    const networth = parseInput(document.getElementById('networthInput').value);

    if (!income && !networth) {
      alert('Please enter at least one value.');
      return;
    }

    ageKey   = document.getElementById('ageBracket').value;
    stateKey = document.getElementById('stateSelect').value;

    const incPct = income   ? getPercentile(income,   'income',   type, ageKey) : null;
    const nwPct  = networth !== undefined ? getPercentile(networth, 'netWorth', type, ageKey) : null;

    renderResults(income, networth, incPct, nwPct);
    document.getElementById('results').style.display = 'block';
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Render Results ───────────────────────────────────────────────────────
  function renderResults(income, networth, incPct, nwPct) {
    const incDs  = DATA.income[type][ageKey];
    const nwDs   = DATA.netWorth[type][ageKey];
    const ageLbl = DATA.ageBrackets.find(b => b.key === ageKey)?.label || 'All Ages';
    const stateData = stateKey ? DATA.states[stateKey] : null;
    const stateLbl  = stateData ? stateData.name : null;

    // Score cards
    renderScoreCard('incomeCard', 'incomePercentile', 'incomeContext', income, incPct, incDs, 'income', ageLbl);
    renderScoreCard('networthCard', 'networthPercentile', 'networthContext', networth, nwPct, nwDs, 'net worth', ageLbl);

    // Chart subtitles
    const typeLbl = type === 'household' ? 'Household' : 'Individual';
    document.getElementById('incomeChartSub').textContent =
      `${typeLbl} income distribution — ${ageLbl}${stateLbl ? ' · ' + stateLbl + ' medians shown' : ''}`;
    document.getElementById('networthChartSub').textContent =
      `Household net worth distribution — ${ageLbl}${stateLbl ? ' · ' + stateLbl + ' medians shown' : ''}`;

    // State medians for chart reference lines
    const stateIncomeMedian  = stateData ? (type === 'household' ? stateData.hhMedian  : stateData.indMedian) : null;
    const stateNwMedian      = stateData ? stateData.nwMedian : null;

    // Charts
    renderBarChart('incomeChart',   'incomeLegend',   'incomeStats',   'incomeStateStats',
                   income,   incDs, incPct, 'income',    stateIncomeMedian, stateLbl,
                   stateData ? (type === 'household' ? stateData.hhMedian  : stateData.indMedian) : null);
    renderBarChart('networthChart', 'networthLegend', 'networthStats', 'networthStateStats',
                   networth, nwDs,  nwPct,  'net worth', stateNwMedian, stateLbl,
                   stateData ? stateData.nwMean : null, true);
  }

  function renderScoreCard(cardId, valId, subId, value, pct, ds, label, ageLbl) {
    const card = document.getElementById(cardId);
    const valEl = document.getElementById(valId);
    const subEl = document.getElementById(subId);

    // Clear tier classes
    card.className = 'score-card';

    if (pct === null || value === 0) {
      valEl.innerHTML = '—';
      subEl.textContent = 'No value entered.';
      return;
    }

    const pctRound = Math.min(99.9, pct);
    valEl.innerHTML = Math.round(pctRound) + '<span class="pct-sign">th</span>';
    card.classList.add(tierClass(pctRound));

    // Tier label
    let tier = '';
    if (pctRound >= 99)  tier = 'Top 1%';
    else if (pctRound >= 95) tier = 'Top 5%';
    else if (pctRound >= 90) tier = 'Top 10%';
    else if (pctRound >= 75) tier = 'Top 25%';
    else if (pctRound >= 50) tier = 'Above median';
    else tier = 'Below median';

    subEl.innerHTML = `<strong style="color:var(--accent2)">${tier}</strong> · ${ageLbl}<br>` +
      contextLine(pctRound, value, label === 'income' ? 'income' : 'netWorth', type, ageKey);
  }

  // ── Bar Chart ─────────────────────────────────────────────────────────────
  // Pure canvas — no Chart.js dependency, keeps it lean and fast

  function renderBarChart(canvasId, legendId, statsId, stateStatsId, userValue, ds, userPct, label,
                          stateMedian, stateLbl, stateMean, isNetWorth) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');

    // Resolve display size
    const dpr   = window.devicePixelRatio || 1;
    const rect  = canvas.parentElement.getBoundingClientRect();
    const W     = rect.width  || 700;
    const H     = 260;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, W, H);

    // Build bar data from percentile brackets
    const pts = ds.percentiles;
    const bars = [];
    for (let i = 1; i < pts.length; i++) {
      const [p0, v0] = pts[i - 1];
      const [p1, v1] = pts[i];
      bars.push({
        pLow: p0, pHigh: p1,
        vLow: v0, vHigh: v1,
        width: p1 - p0,           // percentile span → bar width
        label: v0 < 0 ? (formatDollars(v0) + ' to ' + formatDollars(v1)) : (formatDollars(v0) + '+')
      });
    }

    // Layout
    const padL = 64, padR = 20, padT = 16, padB = 48;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    // Max height = 1 (bars are proportional to percentile span, all same height visually,
    // but we vary opacity/color to show where the user lands)
    const totalSpan = pts[pts.length - 1][0] - pts[0][0]; // should be ~100

    // Colors
    const COLORS = {
      bg:       '#1a1a24',
      barBase:  '#2e2e42',
      barYou:   '#5b4cf5',
      barAbove: '#2a2a3e',
      median:   '#3ecf8e',
      mean:     '#f5a623',
      you:      '#7c6fff',
      grid:     '#2a2a38',
      text:     '#6a6a8a',
    };

    // Draw grid lines (horizontal — just top and bottom visual guides)
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= 4; i++) {
      const y = padT + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw bars
    let barX = padL;
    bars.forEach(b => {
      const barW = (b.width / totalSpan) * chartW;
      const barH = chartH * 0.65;  // fixed height — this is a distribution display
      const barY = padT + (chartH - barH);

      // Determine if user value falls in this bucket
      const userInBucket = userValue >= b.vLow && userValue < b.vHigh;
      const userBelow    = userValue < b.vLow;

      let fillColor = userBelow ? COLORS.barAbove : COLORS.barBase;
      if (userInBucket) fillColor = COLORS.barYou;

      // Rounded top only
      const r = 3;
      ctx.beginPath();
      ctx.moveTo(barX + r, barY);
      ctx.lineTo(barX + barW - r, barY);
      ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + r);
      ctx.lineTo(barX + barW, barY + barH);
      ctx.lineTo(barX, barY + barH);
      ctx.lineTo(barX, barY + r);
      ctx.quadraticCurveTo(barX, barY, barX + r, barY);
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();

      barX += barW + 1;
    });

    // Draw percentile axis labels
    ctx.fillStyle = COLORS.text;
    ctx.font = `11px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    const labelPcts = [0, 10, 25, 50, 75, 90, 99];
    labelPcts.forEach(lp => {
      const x = padL + (lp / totalSpan) * chartW;
      ctx.fillText(lp + 'th', x, H - 8);
    });

    ctx.fillStyle = COLORS.text;
    ctx.font = `10px -apple-system, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Percentile', padL, H - 8);

    // Draw reference lines: median, mean, you
    function drawRefLine(value, color, lbl) {
      if (value === null) return;
      let pct;
      try { pct = interpolatePercentile(value, ds.percentiles); } catch(e) { return; }
      const x = padL + (pct / totalSpan) * chartW;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + chartH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label above
      ctx.fillStyle = color;
      ctx.font = `bold 10px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(lbl, x, padT - 4);
    }

    drawRefLine(ds.median,   COLORS.median,  'Median');
    drawRefLine(ds.mean,     COLORS.mean,    'Avg');
    if (stateMedian) drawRefLine(stateMedian, '#a78bfa', 'State');
    if (userValue)   drawRefLine(userValue,   COLORS.you, 'You');

    // ── Legend ──────────────────────────────────────────────────────────────
    const legendEl = document.getElementById(legendId);
    legendEl.innerHTML = `
      <div class="legend-item"><div class="legend-dot" style="background:#5b4cf5"></div>Your bracket</div>
      <div class="legend-item"><div class="legend-dot" style="background:#2e2e42"></div>Above you</div>
      <div class="legend-item"><div class="legend-dot" style="background:#2a2a3e"></div>Below you</div>
      <div class="legend-item"><div class="legend-dot" style="background:#3ecf8e"></div>US Median</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f5a623"></div>US Average</div>
      ${stateMedian ? '<div class="legend-item"><div class="legend-dot" style="background:#a78bfa"></div>State Median</div>' : ''}
    `;

    // ── Stats row ─────────────────────────────────────────────────────────
    const statsEl = document.getElementById(statsId);
    statsEl.innerHTML = `
      <div class="stat-box">
        <div class="stat-label">Your ${label}</div>
        <div class="stat-val you">${formatDollars(userValue)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">US Median</div>
        <div class="stat-val median-val">${formatDollars(ds.median)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">US Average</div>
        <div class="stat-val mean-val">${formatDollars(ds.mean)}</div>
      </div>
    `;

    // ── State stats row ────────────────────────────────────────────────────
    const stateStatsEl = document.getElementById(stateStatsId);
    if (stateStatsEl) {
      if (stateMedian && stateLbl) {
        const meanHtml = stateMean
          ? `<div class="state-stat"><div class="state-stat-label">${stateLbl} Average</div><div class="state-stat-val">${formatDollars(stateMean)}</div></div>`
          : '';
        stateStatsEl.innerHTML = `
          <div class="state-stat"><div class="state-stat-label">${stateLbl} Median</div><div class="state-stat-val">${formatDollars(stateMedian)}</div></div>
          ${meanHtml}
          <div class="state-stat"><div class="state-stat-label">vs US Median</div><div class="state-stat-val" style="color:${stateMedian >= ds.median ? '#3ecf8e' : '#e84040'}">${stateMedian >= ds.median ? '+' : ''}${formatDollars(stateMedian - ds.median)}</div></div>
        `;
      } else {
        stateStatsEl.innerHTML = '';
      }
    }
  }

  // ── Start ────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

})();
