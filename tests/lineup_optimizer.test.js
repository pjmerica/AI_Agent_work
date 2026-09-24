// Does bestLineupForSlots find the true optimum? Compare against a brute-force
// assignment on randomised rosters.
const fs = require("fs");
const src = fs.readFileSync("lineup/app.js", "utf8");
const g = (re) => {
  const m = src.match(re);
  if (!m) throw new Error("MISSING " + String(re).slice(0, 44));
  return m[0];
};
const parts = [
  g(/const SLOT_ACCEPTS = \{[\s\S]*?\n  \};/),
  g(/function bestLineupForSlots\(players, slots\)[\s\S]*?\n  \}/),
].join("\n");
const H = eval("(function(){" + parts +
  ";return{bestLineupForSlots,SLOT_ACCEPTS}})")();

// True optimum: exhaustive over all assignments, no truncation, and a slot may
// be left empty even when someone is eligible.
function brute(players, slots, ACC) {
  let best = { total: 0, picks: new Array(slots.length).fill(null) };
  const used = new Array(players.length).fill(false);
  const cur = new Array(slots.length).fill(null);
  (function rec(si, total) {
    if (si === slots.length) {
      if (total > best.total) best = { total, picks: cur.slice() };
      return;
    }
    const accepts = ACC[slots[si]] || [];
    for (let i = 0; i < players.length; i++) {
      if (used[i]) continue;
      if (!players[i].position || !accepts.includes(players[i].position)) continue;
      used[i] = true; cur[si] = players[i];
      rec(si + 1, total + players[i].points);
      used[i] = false; cur[si] = null;
    }
    cur[si] = null;
    rec(si + 1, total);       // leaving it empty is always allowed
  })(0, 0);
  return best;
}

const POS = ["QB", "RB", "WR", "TE", "K", "DEF"];
const SLOTSETS = [
  ["QB","RB","RB","WR","WR","TE","FLEX","FLEX","K","DEF"],
  ["QB","RB","RB","WR","WR","TE","FLEX","FLEX","FLEX","SUPER_FLEX"],
  ["QB","RB","RB","WR","WR","WR","TE","FLEX","FLEX","FLEX"],
];

let mismatches = 0, trials = 0, worst = 0, worstCase = null;
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

for (let t = 0; t < 1500; t++) {
  const slots = SLOTSETS[Math.floor(rnd() * SLOTSETS.length)];
  const n = 6 + Math.floor(rnd() * 5);
  const players = [];
  for (let i = 0; i < n; i++) {
    players.push({
      name: "p" + i,
      position: POS[Math.floor(rnd() * POS.length)],
      points: Math.round(rnd() * 250) / 10,
    });
  }
  const a = H.bestLineupForSlots(players, slots);
  const b = brute(players, slots, H.SLOT_ACCEPTS);
  trials++;
  const diff = Math.round((b.total - a.total) * 100) / 100;
  if (diff > 0.001) {
    mismatches++;
    if (diff > worst) {
      worst = diff;
      worstCase = { slots, players, got: a.total, want: b.total };
    }
  }
}
console.log("trials: " + trials);
console.log("cases where the optimizer missed the optimum: " + mismatches);
console.log("worst shortfall: " + worst.toFixed(2) + " points");
if (worstCase) {
  console.log("\nworst case:");
  console.log("  slots: " + worstCase.slots.join(","));
  console.log("  roster:");
  worstCase.players.forEach(p =>
    console.log("     " + p.position.padEnd(5) + p.points.toFixed(1)));
  console.log("  optimizer: " + worstCase.got.toFixed(1) +
    "   true best: " + worstCase.want.toFixed(1));
}
