function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function posBadge(pos) {
  return `<span class="pos-badge pos-${pos.toLowerCase()}">${esc(pos)}</span>`;
}

function verdictBadge(v) {
  const map = {
    CONFIRMED: { cls: 'verdict-confirmed', icon: '🔴', label: 'Concern Confirmed' },
    REFUTED:   { cls: 'verdict-refuted',   icon: '🟢', label: 'Concern Refuted'   },
    MIXED:     { cls: 'verdict-mixed',     icon: '🟡', label: 'Mixed Result'       }
  };
  const m = map[v] || map.MIXED;
  return `<span class="verdict ${m.cls}">${m.icon} ${m.label}</span>`;
}

function sourceLinks(sources) {
  if (!sources || !sources.length) return '';
  return `<div class="sources">${sources.map(s =>
    `<a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">📎 ${esc(s.text)}</a>`
  ).join('')}</div>`;
}

function renderPlayerCard(p) {
  const verdictClass = { CONFIRMED: 'verdict-confirmed-card', REFUTED: 'verdict-refuted-card', MIXED: 'verdict-mixed-card' }[p.verdict];
  const verdictBoxClass = { CONFIRMED: 'confirmed', REFUTED: 'refuted', MIXED: 'mixed' }[p.verdict];

  const pickStr = p.pickNumber
    ? `<span class="pick-badge">Rd ${p.round}, Pick #${p.pickNumber} → ${esc(p.team)}</span>`
    : `<span class="pick-badge">Undrafted → ${esc(p.team)}</span>`;

  const preDraftList = p.preDraftDetails.map(d => `<li>${esc(d)}</li>`).join('');
  const nflList = p.nflInjuries.map(d => `<li>${esc(d)}</li>`).join('');

  const draftImpactHtml = p.draftImpact ? `
    <div class="draft-impact">
      <strong>Draft Impact:</strong> ${esc(p.draftImpact)}
      ${p.projectedWithoutInjury ? `<br><strong>Projected Without Injury:</strong> ${esc(p.projectedWithoutInjury)}` : ''}
    </div>` : '';

  return `
    <div class="player-card ${verdictClass}" id="player-${esc(p.id)}">
      <div class="player-header">
        <div>
          <div class="player-name">${esc(p.name)}</div>
          <div class="player-meta">
            ${posBadge(p.pos)}
            <span class="era-badge">${esc(p.college)} · ${p.draftYear} Draft</span>
            ${pickStr}
          </div>
        </div>
        <div class="player-header-right">
          ${verdictBadge(p.verdict)}
          <span class="era-badge">${esc(p.careerLength || '')}</span>
        </div>
      </div>

      <div class="draft-impact" style="margin-bottom:14px;">
        <strong>Pre-Draft Concern:</strong> ${esc(p.preDraftInjury)}
      </div>

      ${draftImpactHtml}

      <div class="injury-grid">
        <div class="injury-col">
          <div class="col-title col-before">⚠️ Pre-Draft Injury History</div>
          <ul class="injury-list">${preDraftList}</ul>
        </div>
        <div class="injury-col">
          <div class="col-title col-after">🏥 NFL Career Injuries</div>
          <ul class="injury-list">${nflList}</ul>
        </div>
      </div>

      <div class="verdict-box ${verdictBoxClass}">
        <strong>Verdict: ${esc(p.verdict)}</strong> — ${esc(p.verdictExplanation)}
      </div>

      ${sourceLinks(p.sources)}
    </div>`;
}

// ── Overview cards ────────────────────────────────────────────────────────────
function renderOverview(players) {
  const confirmed = players.filter(p => p.verdict === 'CONFIRMED').length;
  const refuted   = players.filter(p => p.verdict === 'REFUTED').length;
  const mixed     = players.filter(p => p.verdict === 'MIXED').length;
  const total     = players.length;

  // Summary stats
  document.getElementById('statTotal').textContent     = total;
  document.getElementById('statConfirmed').textContent = confirmed;
  document.getElementById('statRefuted').textContent   = refuted;
  document.getElementById('statMixed').textContent     = mixed;
  document.getElementById('statPct').textContent       = Math.round((confirmed / total) * 100) + '%';

  // Findings
  const { findings } = window.NFL_INJURY_DATA;
  document.getElementById('findingsList').innerHTML = findings.map(f =>
    `<li class="${esc(f.type)}">${esc(f.text)}</li>`
  ).join('');

  // Overview grid
  document.getElementById('overviewGrid').innerHTML = players.map(p => {
    const bgClass = { CONFIRMED: 'confirmed-bg', REFUTED: 'refuted-bg', MIXED: 'mixed-bg' }[p.verdict];
    return `
      <div class="ov-card ${bgClass}" onclick="switchTab('players'); scrollToPlayer('${esc(p.id)}')">
        <div class="ov-name">${esc(p.name)}</div>
        <div class="ov-meta">
          ${posBadge(p.pos)}
          <span class="era-badge">${p.draftYear}</span>
          ${p.pickNumber ? `<span class="era-badge">#${p.pickNumber} pick</span>` : '<span class="era-badge">Undrafted</span>'}
        </div>
        <div class="ov-injury">${esc(p.preDraftInjury.substring(0, 120))}${p.preDraftInjury.length > 120 ? '…' : ''}</div>
        ${verdictBadge(p.verdict)}
      </div>`;
  }).join('');
}

// ── Full player list ──────────────────────────────────────────────────────────
function renderPlayers(players) {
  document.getElementById('playerList').innerHTML = players.map(p => renderPlayerCard(p)).join('');
}

// ── Position tabs ─────────────────────────────────────────────────────────────
function renderPosition(pos) {
  const players = window.NFL_INJURY_DATA.players.filter(p => p.pos === pos);
  document.getElementById(`pos-${pos.toLowerCase()}-list`).innerHTML =
    players.map(p => renderPlayerCard(p)).join('') ||
    '<p style="color:var(--muted);font-size:14px;">No cases documented for this position yet.</p>';
}

// ── Filter ────────────────────────────────────────────────────────────────────
function applyFilter(verdict, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const players = window.NFL_INJURY_DATA.players;
  const filtered = verdict === 'ALL' ? players : players.filter(p => p.verdict === verdict);
  document.getElementById('playerList').innerHTML = filtered.map(p => renderPlayerCard(p)).join('');
}
window.applyFilter = applyFilter;

// ── Tab switcher ──────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(s =>
    s.classList.toggle('active', s.id === 'tab-' + name));
}
window.switchTab = switchTab;

function scrollToPlayer(id) {
  setTimeout(() => {
    const el = document.getElementById('player-' + id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}
window.scrollToPlayer = scrollToPlayer;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const { players } = window.NFL_INJURY_DATA;

  renderOverview(players);
  renderPlayers(players);
  ['QB','RB','WR','TE'].forEach(pos => renderPosition(pos));

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchTab(t.dataset.tab)));
});
