let RESTAURANTS, CITIES_RAW;

// ── Glizzy Score calculation ──────────────────────────────────────────────────
function computeCityScores() {
  // Group restaurants by city
  const byCity = {};
  for (const r of RESTAURANTS) {
    const key = r.city + ', ' + r.state;
    (byCity[key] ||= []).push(r);
  }

  // Map CITIES_RAW to scored entries
  return CITIES_RAW.map(c => {
    // Find matching restaurants (loose — match on state and partial city name)
    const spots = RESTAURANTS.filter(r =>
      r.state === c.state &&
      (c.city.toLowerCase().includes(r.city.toLowerCase()) ||
       r.city.toLowerCase().includes(c.city.split('/')[0].toLowerCase()))
    );

    const spotCount  = spots.length;
    const avgSources = spots.length ? spots.reduce((s, r) => s + r.sources, 0) / spots.length : 0;
    const awardsCount = spots.filter(r => r.awards && r.awards.length > 0).length;
    const oldestYear  = spots.length ? Math.min(...spots.map(r => r.year)) : 2000;

    // Heritage: scale 1900–2020 → 10–0
    const heritagePoints = Math.max(0, Math.min(10, (2020 - oldestYear) / 12));

    const score = Math.round(
      spotCount   * 12 +
      avgSources  * 8  +
      c.stylePoints * 6 +
      heritagePoints * 4 +
      awardsCount * 5
    );

    return {
      ...c,
      spots,
      spotCount,
      avgSources: Math.round(avgSources * 10) / 10,
      awardsCount,
      oldestYear,
      heritagePoints: Math.round(heritagePoints * 10) / 10,
      score,
    };
  }).sort((a, b) => b.score - a.score);
}

const CITIES = computeCityScores();
const maxScore = CITIES[0]?.score || 1;

// ── City rankings render ──────────────────────────────────────────────────────
function renderCities() {
  const list = document.getElementById('cityList');
  list.innerHTML = CITIES.map((c, i) => {
    const medal = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const rankDisplay = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;

    const bars = [
      { label: 'Spot Density',      val: c.spotCount,           max: 10,  raw: c.spotCount },
      { label: 'Avg Citations',     val: c.avgSources,          max: 10,  raw: c.avgSources },
      { label: 'Style Originality', val: c.stylePoints,         max: 10,  raw: c.stylePoints },
      { label: 'Heritage',          val: c.heritagePoints,      max: 10,  raw: c.heritagePoints },
      { label: 'Awards',            val: c.awardsCount,         max: 6,   raw: c.awardsCount },
    ];

    const barsHTML = bars.map(b => `
      <div class="bar-row">
        <span class="bar-label">${b.label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, b.val / b.max * 100)}%"></div></div>
        <span class="bar-val">${b.raw}</span>
      </div>`).join('');

    const spotNames = c.spots.slice(0, 3).map(s => s.name).join(', ');

    return `
      <div class="city-card ${medal}">
        <div class="city-rank">${rankDisplay}</div>
        <div>
          <div class="city-name">${c.city}, ${c.state}</div>
          <div class="city-style">${c.ownStyle}</div>
          <div class="city-desc">${c.description}</div>
          ${spotNames ? `<div class="city-desc" style="margin-top:6px;color:#6a4a20">Notable spots: ${spotNames}${c.spots.length > 3 ? ` +${c.spots.length - 3} more` : ''}</div>` : ''}
          <div class="city-bars" style="margin-top:10px">${barsHTML}</div>
        </div>
        <div class="city-score-box">
          <div class="city-score-num">${c.score}</div>
          <div class="city-score-label">Glizzy Score</div>
        </div>
      </div>`;
  }).join('');
}

// ── Restaurant rankings render ────────────────────────────────────────────────
const sortedRests = [...RESTAURANTS].sort((a, b) => b.sources - a.sources || a.year - b.year);

function populateFilters() {
  const styles = [...new Set(sortedRests.map(r => r.style))].sort();
  const states = [...new Set(sortedRests.map(r => r.state))].sort();
  const sf = document.getElementById('styleFilter');
  const stf = document.getElementById('stateFilter');
  styles.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sf.appendChild(o); });
  states.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; stf.appendChild(o); });
}

function renderRestaurants(filter = '') {
  const styleVal = document.getElementById('styleFilter').value;
  const stateVal = document.getElementById('stateFilter').value;
  const search   = filter.toLowerCase();

  const filtered = sortedRests.filter(r => {
    if (styleVal && r.style !== styleVal) return false;
    if (stateVal && r.state !== stateVal) return false;
    if (search && !r.name.toLowerCase().includes(search) &&
        !r.city.toLowerCase().includes(search) &&
        !r.notes.toLowerCase().includes(search)) return false;
    return true;
  });

  const list = document.getElementById('restaurantList');

  if (!filtered.length) {
    list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:40px">No spots match your search.</p>';
    return;
  }

  list.innerHTML = filtered.map((r, i) => `
    <div class="rest-card">
      <div class="rest-rank">${i + 1}</div>
      <div>
        <div>
          <span class="rest-name">${esc(r.name)}</span>
          <span class="year-badge">Est. ${r.year}</span>
        </div>
        <div class="rest-loc">📍 ${r.city}, ${r.state}</div>
        <span class="rest-style">${esc(r.style)}</span>
        ${r.awards ? `<div class="rest-awards">🏆 ${esc(r.awards)}</div>` : ''}
        <div class="rest-notes">${esc(r.notes)}</div>
      </div>
      <div class="sources-badge">
        <div class="sources-num">${r.sources}</div>
        <div class="sources-label">sources</div>
      </div>
    </div>`).join('');
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
}

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

document.getElementById('searchBox').addEventListener('input', e => renderRestaurants(e.target.value));
document.getElementById('styleFilter').addEventListener('change', () => renderRestaurants(document.getElementById('searchBox').value));
document.getElementById('stateFilter').addEventListener('change', () => renderRestaurants(document.getElementById('searchBox').value));

// Expose for methodology link
window.switchTab = switchTab;

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ({ RESTAURANTS, CITIES_RAW } = window.GLIZZY_DATA);
  renderCities();
  populateFilters();
  renderRestaurants();
});
