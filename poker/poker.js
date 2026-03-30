// ── Constants ─────────────────────────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const VALUES = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const VAL_MAP = Object.fromEntries(VALUES.map((v,i) => [v, i+2]));
const RED_SUITS = new Set(['♥','♦']);

// ── Deck ──────────────────────────────────────────────────────────────────────
function makeDeck() {
  const deck = SUITS.flatMap(s => VALUES.map(v => ({ s, v })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ── Hand evaluation ────────────────────────────────────────────────────────────
function evalFive(cards) {
  let nums = cards.map(c => VAL_MAP[c.v]).sort((a,b) => b-a);
  const suits = cards.map(c => c.s);
  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = nums.every((v,i) => i === 0 || nums[i-1]-v === 1);
  // Wheel: A-2-3-4-5
  if (!isStraight && nums[0]===14 && nums[1]===5 && nums[2]===4 && nums[3]===3 && nums[4]===2) {
    isStraight = true; nums = [5,4,3,2,1];
  }

  const freq = {};
  nums.forEach(n => freq[n] = (freq[n]||0)+1);
  const grps = Object.entries(freq).map(([n,c]) => [+n,c]).sort((a,b) => b[1]-a[1] || b[0]-a[0]);

  if (isFlush && isStraight) return { rank: nums[0]===14?9:8, name: nums[0]===14?'Royal Flush':'Straight Flush', tb: nums };
  if (grps[0][1]===4) return { rank:7, name:'Four of a Kind',    tb:[grps[0][0], grps[1][0]] };
  if (grps[0][1]===3 && grps[1][1]===2) return { rank:6, name:'Full House', tb:[grps[0][0], grps[1][0]] };
  if (isFlush)        return { rank:5, name:'Flush',              tb: nums };
  if (isStraight)     return { rank:4, name:'Straight',           tb: nums };
  if (grps[0][1]===3) return { rank:3, name:'Three of a Kind',    tb:[grps[0][0], ...nums.filter(n=>n!==grps[0][0])] };
  if (grps[0][1]===2 && grps[1][1]===2) {
    const ps = grps.filter(g=>g[1]===2).map(g=>g[0]).sort((a,b)=>b-a);
    const k = nums.find(n => n!==ps[0] && n!==ps[1]);
    return { rank:2, name:'Two Pair', tb:[...ps, k] };
  }
  if (grps[0][1]===2) return { rank:1, name:'One Pair',     tb:[grps[0][0], ...nums.filter(n=>n!==grps[0][0])] };
  return { rank:0, name:'High Card', tb: nums };
}

function bestHand(cards) { // best 5 from up to 7
  let best = null;
  const n = cards.length;
  for (let i = 0; i < n-1; i++)
    for (let j = i+1; j < n; j++) {
      const five = cards.filter((_,k) => k!==i && k!==j);
      if (five.length < 5) continue;
      const h = evalFive(five.slice(0,5));
      if (!best || cmpHands(h, best) > 0) best = h;
    }
  if (!best && cards.length === 5) best = evalFive(cards);
  return best || evalFive(cards.slice(0,5));
}

function cmpHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.tb.length, b.tb.length); i++)
    if (a.tb[i] !== b.tb[i]) return a.tb[i] - b.tb[i];
  return 0;
}

// ── Game state ─────────────────────────────────────────────────────────────────
let G = {};

function initGame() {
  const inputs = [...document.querySelectorAll('.player-input')].map(i => i.value.trim()).filter(Boolean);
  if (inputs.length < 2) return alert('Need at least 2 players.');
  const chips = +document.getElementById('startChips').value || 1000;
  const bb    = +document.getElementById('bigBlind').value   || 20;

  G = {
    players: inputs.map(name => ({ name, chips, bet:0, folded:false, cards:[], acted:false })),
    deck: [], community: [], pot: 0,
    dealer: 0, current: 0,
    sb: bb/2, bb,
    currentBet: 0,
    phase: '',
    handNum: 0,
    raiseAmt: bb,
  };
  startHand();
}

function startHand() {
  G.handNum++;
  G.deck = makeDeck();
  G.community = [];
  G.pot = 0;
  G.currentBet = 0;
  G.phase = 'Pre-Flop';

  // Rotate dealer (skip broke players)
  const active = G.players.filter(p => p.chips > 0);
  if (active.length < 2) return endGame();
  do { G.dealer = (G.dealer + (G.handNum > 1 ? 1 : 0)) % G.players.length; }
  while (G.players[G.dealer].chips === 0);

  G.players.forEach(p => { p.bet = 0; p.folded = p.chips === 0; p.cards = []; p.acted = false; });

  // Deal 2 cards each
  G.players.forEach(p => { if (!p.folded) p.cards = [G.deck.pop(), G.deck.pop()]; });

  // Post blinds
  const order = activeSeatOrder();
  const sbIdx = order[0]; const bbIdx = order[1];
  postBlind(sbIdx, G.sb);
  postBlind(bbIdx, G.bb);
  G.currentBet = G.bb;
  G.players.forEach(p => p.acted = false); // reset after blinds

  G.current = order[2] !== undefined ? order[2] : order[0];

  showPrivacy();
}

function activeSeatOrder(startAfter = G.dealer) {
  // Returns player indices starting after startAfter, skipping broke/folded
  const order = [];
  for (let i = 1; i <= G.players.length; i++) {
    const idx = (startAfter + i) % G.players.length;
    if (!G.players[idx].folded && G.players[idx].chips >= 0) order.push(idx);
  }
  return order;
}

function postBlind(idx, amt) {
  const p = G.players[idx];
  const actual = Math.min(amt, p.chips);
  p.chips -= actual; p.bet += actual; G.pot += actual;
}

// ── Action handlers ────────────────────────────────────────────────────────────
function doFold() {
  G.players[G.current].folded = true;
  G.players[G.current].acted = true;
  afterAction();
}

function doCheck() {
  G.players[G.current].acted = true;
  afterAction();
}

function doCall() {
  const p = G.players[G.current];
  const toCall = Math.min(G.currentBet - p.bet, p.chips);
  p.chips -= toCall; p.bet += toCall; G.pot += toCall;
  p.acted = true;
  afterAction();
}

function doRaise(total) {
  const p = G.players[G.current];
  const extra = Math.min(total - p.bet, p.chips);
  p.chips -= extra; p.bet += extra; G.pot += extra;
  G.currentBet = p.bet;
  // Others need to act again
  G.players.forEach((pl,i) => { if (i !== G.current && !pl.folded) pl.acted = false; });
  p.acted = true;
  afterAction();
}

function afterAction() {
  // Check if only 1 player left
  const remaining = G.players.filter(p => !p.folded);
  if (remaining.length === 1) {
    remaining[0].chips += G.pot;
    return showShowdown([remaining[0]], true);
  }

  // Check if betting round is over
  const notDone = G.players.filter(p => !p.folded && (!p.acted || p.bet < G.currentBet && p.chips > 0));
  if (notDone.length === 0) {
    return advancePhase();
  }

  // Next player
  const order = activeSeatOrder(G.current);
  const next = order.find(i => !G.players[i].folded && (!G.players[i].acted || G.players[i].bet < G.currentBet));
  if (next === undefined) return advancePhase();
  G.current = next;
  showPrivacy();
}

function advancePhase() {
  G.players.forEach(p => { p.bet = 0; p.acted = false; });
  G.currentBet = 0;

  if (G.phase === 'Pre-Flop') {
    G.community.push(G.deck.pop(), G.deck.pop(), G.deck.pop());
    G.phase = 'Flop';
  } else if (G.phase === 'Flop') {
    G.community.push(G.deck.pop());
    G.phase = 'Turn';
  } else if (G.phase === 'Turn') {
    G.community.push(G.deck.pop());
    G.phase = 'River';
  } else {
    // Showdown
    const active = G.players.filter(p => !p.folded);
    let winners = [active[0]];
    let bestH = bestHand([...active[0].cards, ...G.community]);
    active.slice(1).forEach(p => {
      const h = bestHand([...p.cards, ...G.community]);
      const c = cmpHands(h, bestH);
      if (c > 0) { winners = [p]; bestH = h; }
      else if (c === 0) winners.push(p);
    });
    const share = Math.floor(G.pot / winners.length);
    winners.forEach(w => w.chips += share);
    return showShowdown(winners, false);
  }

  // Start betting from first active after dealer
  const order = activeSeatOrder(G.dealer);
  G.current = order[0];
  showPrivacy();
}

// ── Rendering ──────────────────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function cardHTML(card, faceDown = false) {
  if (faceDown) return `<div class="card back"></div>`;
  const red = RED_SUITS.has(card.s) ? 'red' : 'black';
  return `<div class="card ${red}"><span class="val">${card.v}</span><span class="suit">${card.s}</span></div>`;
}

function placeholderHTML() { return `<div class="card placeholder"></div>`; }

function renderStrip() {
  document.getElementById('playerStrip').innerHTML = G.players.map((p,i) => {
    let cls = 'player-chip';
    if (i === G.current) cls += ' active';
    if (p.folded) cls += ' folded';
    if (i === G.dealer) cls += ' dealer';
    return `<div class="${cls}">
      <div class="pname">${esc(p.name)}</div>
      <div class="pchips">${p.chips}</div>
      ${p.bet > 0 ? `<div class="pbet">bet ${p.bet}</div>` : ''}
    </div>`;
  }).join('');
}

function renderCommunity() {
  const slots = 5;
  let html = G.community.map(c => cardHTML(c)).join('');
  for (let i = G.community.length; i < slots; i++) html += placeholderHTML();
  document.getElementById('communityCards').innerHTML = html;
}

function renderHole() {
  const p = G.players[G.current];
  document.getElementById('holeLabel').textContent = p.name + "'s cards";
  document.getElementById('holeCards').innerHTML = p.cards.map(c => cardHTML(c)).join('');

  if (G.community.length > 0) {
    const h = bestHand([...p.cards, ...G.community]);
    document.getElementById('handStrength').textContent = h ? h.name : '';
  } else {
    document.getElementById('handStrength').textContent = '';
  }
}

function renderActions() {
  const p = G.players[G.current];
  const toCall = G.currentBet - p.bet;
  let html = `<button class="act-btn act-fold" onclick="doFold()">Fold</button>`;

  if (toCall <= 0) {
    html += `<button class="act-btn act-check" onclick="doCheck()">Check</button>`;
  } else {
    html += `<button class="act-btn act-call" onclick="doCall()">Call ${toCall}</button>`;
  }

  const minRaise = G.currentBet + G.bb;
  const maxRaise = p.chips + p.bet;
  if (p.chips > toCall && maxRaise > G.currentBet) {
    html += `<button class="act-btn act-raise" onclick="toggleRaise()">Raise</button>`;
    document.getElementById('actions').innerHTML = html;
    // Setup slider
    const slider = document.getElementById('raiseSlider');
    slider.min = minRaise; slider.max = maxRaise; slider.value = minRaise;
    G.raiseAmt = minRaise;
    updateRaiseDisplay();
  } else {
    html += `<button class="act-btn act-check" style="opacity:.3" disabled>Raise</button>`;
    document.getElementById('actions').innerHTML = html;
  }
}

function toggleRaise() {
  const panel = document.getElementById('raisePanel');
  panel.classList.toggle('hidden');
}

function updateRaiseDisplay() {
  const v = +document.getElementById('raiseSlider').value;
  G.raiseAmt = v;
  document.getElementById('raiseDisplay').textContent = `${v} chips`;
  document.getElementById('raiseToLabel').textContent = v;
}

function showPrivacy() {
  document.getElementById('privacyName').textContent = G.players[G.current].name;
  show('screen-privacy');
}

function showPlay() {
  document.getElementById('phaseLabel').textContent = G.phase;
  document.getElementById('potLabel').textContent   = `Pot: ${G.pot}`;
  document.getElementById('raisePanel').classList.add('hidden');
  renderStrip();
  renderCommunity();
  renderHole();
  renderActions();
  show('screen-play');
}

function showShowdown(winners, foldWin) {
  document.getElementById('communityFinal').innerHTML = G.community.map(c => cardHTML(c)).join('');

  const winnerNames = winners.map(w => w.name).join(' & ');
  document.getElementById('showdownTitle').textContent = foldWin
    ? `${winnerNames} wins!`
    : `${winnerNames} wins the pot!`;

  document.getElementById('showdownPlayers').innerHTML = G.players.map(p => {
    if (p.cards.length === 0) return ''; // sat out
    const isWinner = winners.includes(p);
    const handObj = !p.folded && G.community.length > 0
      ? bestHand([...p.cards, ...G.community]) : null;
    return `<div class="showdown-player ${isWinner ? 'winner' : ''}">
      <div class="sd-header">
        <span class="sd-name">${esc(p.name)}</span>
        <span class="sd-chips">${p.chips} chips ${isWinner ? '<span class="winner-badge">WIN</span>' : ''}</span>
      </div>
      ${p.folded
        ? `<span class="folded-label">Folded</span>`
        : `<div class="sd-cards">${p.cards.map(c => cardHTML(c)).join('')}</div>
           ${handObj ? `<div class="sd-hand">${handObj.name}</div>` : ''}`}
    </div>`;
  }).filter(Boolean).join('');

  show('screen-showdown');
}

function endGame() {
  const richest = G.players.reduce((a,b) => a.chips > b.chips ? a : b);
  alert(`Game over! ${richest.name} wins with ${richest.chips} chips!`);
  show('screen-setup');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Events ─────────────────────────────────────────────────────────────────────
document.getElementById('addPlayerBtn').addEventListener('click', () => {
  const fields = document.getElementById('playerFields');
  if (fields.children.length >= 8) return;
  const inp = document.createElement('input');
  inp.className = 'player-input';
  inp.type = 'text';
  inp.placeholder = `Player ${fields.children.length + 1}`;
  fields.appendChild(inp);
});

document.getElementById('startBtn').addEventListener('click', initGame);

document.getElementById('showCardsBtn').addEventListener('click', showPlay);

document.getElementById('raiseSlider').addEventListener('input', updateRaiseDisplay);

document.getElementById('confirmRaise').addEventListener('click', () => {
  doRaise(G.raiseAmt);
});

document.getElementById('nextHandBtn').addEventListener('click', () => {
  // Rotate dealer properly
  G.dealer = (G.dealer + 1) % G.players.length;
  startHand();
});

document.getElementById('newGameBtn').addEventListener('click', () => show('screen-setup'));
