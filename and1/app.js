// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function tierColor(tier) {
  return { GOAT: 'tier-goat', Legend: 'tier-legend', Elite: 'tier-elite', Great: 'tier-great' }[tier] || '';
}

function pctBar(val, max, colorClass) {
  const pct = Math.min(100, (val / max) * 100);
  return `<div class="pct-track"><div class="pct-fill ${colorClass}" style="width:${pct}%"></div></div>`;
}

// ── Tab switcher ──────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(s =>
    s.classList.toggle('active', s.id === 'tab-' + name));
}
window.switchTab = switchTab;

// ── Render: Career Kings ──────────────────────────────────────────────────────
function renderKings(players) {
  document.getElementById('kingsList').innerHTML = players.map((p, i) => {
    const medal = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const rank  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;

    const ftaBar   = pctBar(Math.min(p.careerFTA, 13188), 13188, 'fill-orange');
    const ftPctBar = pctBar(p.careerFTPct, 100, p.careerFTPct > 80 ? 'fill-green' : p.careerFTPct < 60 ? 'fill-red' : 'fill-yellow');

    const ruleChange = p.ruleChangeImpact
      ? `<div class="rule-impact">📉 Rule change: ${p.ruleChangeImpact.before} → ${p.ruleChangeImpact.after} FTA/g</div>`
      : '';

    const threePt = p.threePtFoulsDrawn
      ? `<div class="stat-chip">3PT fouls drawn: <strong>${p.threePtFoulsDrawn}</strong></div>`
      : '';

    return `
      <div class="king-card ${medal}">
        <div class="king-rank">${rank}</div>
        <div class="king-body">
          <div class="king-header">
            <div>
              <span class="king-name">${esc(p.name)}</span>
              <span class="tier-badge ${tierColor(p.tier)}">${esc(p.tier)}</span>
              <span class="era-badge">${esc(p.era)}</span>
            </div>
            <div class="king-team">${esc(p.pos)} · ${esc(p.team)}</div>
          </div>
          <div class="king-method">🎯 ${esc(p.method)}</div>
          <div class="king-notes">${esc(p.notes)}</div>
          <div class="king-stats-row">
            <div class="stat-block">
              <div class="stat-label">Career FTA</div>
              <div class="stat-val">${p.careerFTA.toLocaleString()}</div>
              ${ftaBar}
            </div>
            <div class="stat-block">
              <div class="stat-label">FT%</div>
              <div class="stat-val ${p.careerFTPct < 60 ? 'val-red' : p.careerFTPct > 85 ? 'val-green' : ''}">${p.careerFTPct}%</div>
              ${ftPctBar}
            </div>
            <div class="stat-block">
              <div class="stat-label">Peak FTA/g</div>
              <div class="stat-val">${p.peakFTAperGame}</div>
            </div>
          </div>
          <div class="chip-row">
            ${threePt}
            ${ruleChange}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Render: And-1 Rate ────────────────────────────────────────────────────────
function renderAnd1Rate(data) {
  const leagueAvg = window.AND1_DATA.LEAGUE_AVERAGES.and1PctOfShootingFouls;

  document.getElementById('rateList').innerHTML = data.map((r, i) => {
    const aboveAvg = r.and1Pct > leagueAvg;
    return `
      <div class="rate-card">
        <div class="rate-rank">${i+1}</div>
        <div class="rate-body">
          <div class="rate-name-row">
            <span class="rate-name">${esc(r.player)}</span>
            <span class="season-badge">${esc(r.season)}</span>
            <span class="team-badge">${esc(r.team)}</span>
          </div>
          <div class="rate-bars">
            <div class="rate-bar-group">
              <span class="rate-bar-label">And-1 Rate</span>
              <div class="pct-track wide"><div class="pct-fill fill-orange" style="width:${(r.and1Pct/60)*100}%"></div></div>
              <span class="rate-pct ${aboveAvg ? 'pct-hot' : ''}">${r.and1Pct}%</span>
            </div>
            <div class="rate-bar-group">
              <span class="rate-bar-label">Bonus FT%</span>
              <div class="pct-track wide"><div class="pct-fill ${r.bonusFTpct > 80 ? 'fill-green' : r.bonusFTpct < 55 ? 'fill-red' : 'fill-yellow'}" style="width:${r.bonusFTpct}%"></div></div>
              <span class="rate-pct">${r.bonusFTpct}%</span>
            </div>
          </div>
          <div class="rate-detail">
            <span>${r.and1sMade} and-1s made / ${r.shootingFouls} shooting fouls drawn</span>
          </div>
          <div class="rate-notes">${esc(r.notes)}</div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('leagueAvgNote').textContent =
    `League average and-1 rate: ${leagueAvg}% of shooting fouls result in a completed basket (2005-06, 82games.com)`;
}

// ── Render: Bonus FT ─────────────────────────────────────────────────────────
function renderBonusFT({ best, worst }) {
  function cards(arr, colorClass) {
    return arr.map(r => `
      <div class="ft-card">
        <div class="ft-name-row">
          <span class="ft-name">${esc(r.player)}</span>
          <span class="season-badge">${esc(r.season)}</span>
        </div>
        <div class="ft-pct-row">
          <div class="pct-track wide"><div class="pct-fill ${colorClass}" style="width:${r.pct}%"></div></div>
          <span class="ft-pct-val ${r.pct === 100 ? 'val-green' : r.pct < 40 ? 'val-red' : ''}">${r.pct}%</span>
        </div>
        <div class="ft-detail">${r.ftm}/${r.fta} bonus free throws made</div>
        <div class="ft-notes">${esc(r.notes)}</div>
      </div>`).join('');
  }
  document.getElementById('bonusBest').innerHTML  = cards(best,  'fill-green');
  document.getElementById('bonusWorst').innerHTML = cards(worst, 'fill-red');
}

// ── Render: Rule Change ───────────────────────────────────────────────────────
function renderRuleChange({ year, description, players }) {
  document.getElementById('ruleChangeDesc').textContent = description;
  document.getElementById('ruleChangeTable').innerHTML = players.map(p => `
    <div class="rc-row">
      <div class="rc-name">${esc(p.name)}</div>
      <div class="rc-nums">
        <span class="rc-before">${p.ftaBefore}</span>
        <span class="rc-arrow">→</span>
        <span class="rc-after">${p.ftaAfter}</span>
        <span class="rc-drop">-${p.drop} (-${p.pctDrop}%)</span>
      </div>
      <div class="rc-bar-wrap">
        <div class="rc-bar-before" style="width:${(p.ftaBefore/14)*100}%"></div>
        <div class="rc-bar-after"  style="width:${(p.ftaAfter/14)*100}%"></div>
      </div>
    </div>`).join('');
}

// ── Render: Current Leaders ───────────────────────────────────────────────────
function renderCurrentLeaders(leaders) {
  document.getElementById('currentList').innerHTML = leaders.map((p, i) => {
    const medal = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const rank  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
    return `
      <div class="cur-card ${medal}">
        <div class="cur-rank">${rank}</div>
        <div class="cur-body">
          <div class="cur-name">${esc(p.name)}</div>
          <div class="cur-team">${esc(p.team)} · ${esc(p.season)}</div>
          <div class="cur-stats">
            <div class="cur-stat">
              <div class="cur-stat-val">${p.fdTotal}</div>
              <div class="cur-stat-label">Fouls Drawn</div>
            </div>
            <div class="cur-stat">
              <div class="cur-stat-val">${p.fdpg}</div>
              <div class="cur-stat-label">FDPG</div>
            </div>
            <div class="cur-stat">
              <div class="cur-stat-val ${p.ftPct > 85 ? 'val-green' : p.ftPct < 65 ? 'val-red' : ''}">${p.ftPct}%</div>
              <div class="cur-stat-label">FT%</div>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const { CAREER_KINGS, AND1_RATE, BONUS_FT, RULE_CHANGE, CURRENT_LEADERS } = window.AND1_DATA;

  renderKings(CAREER_KINGS);
  renderAnd1Rate(AND1_RATE);
  renderBonusFT(BONUS_FT);
  renderRuleChange(RULE_CHANGE);
  renderCurrentLeaders(CURRENT_LEADERS);

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchTab(t.dataset.tab)));
});
