// Best available must not offer a pickup for a slot whose starter already played.
//
// 2026-10-24: Drake Maye played on Thursday, and the free-agent list offered
// every QB on the wire as a gain. freeAgentsFor measured against all of the
// league's slots, but the played starter is not among the current starters, so
// the spent QB slot looked empty. It now takes only the open slots, and skips a
// free agent whose own game has kicked off.
const fs = require("fs");
const src = fs.readFileSync("lineup/app.js", "utf8");
const g = (re) => {
  const m = src.match(re);
  if (!m) throw new Error("MISSING " + String(re).slice(0, 44));
  return m[0];
};

let failed = 0;
const check = (label, cond, detail) => {
  failed += !cond;
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}` + (cond ? "" : `  [${detail}]`));
};

// The real optimizer and the real freeAgentsFor; only the data access around
// them is stubbed.
function harness(pool, kickedOff) {
  const parts = [
    g(/const SLOT_ACCEPTS = \{[\s\S]*?\n  \};/),
    g(/function bestLineupForSlots\(players, slots\)[\s\S]*?\n  \}/),
    g(/function freeAgentsFor\(lg, rosteredKeys, currentStarters, openSlots\)[\s\S]*?\n  \}/),
  ].join("\n");
  const stubs = `
    const cache = {};
    const sleeperPlayed = null;
    const buildSitStartPoolFull = () => POOL;
    const leaguePoints = (stats) => stats.pts;
    const normPlayerName = (n) => n.toLowerCase();
    const specialPoints = () => null;
    const playerHasKickedOff = (p) => KICKED.has(p.name);
  `;
  return new Function("POOL", "KICKED",
    stubs + parts + ";return { freeAgentsFor };")(pool, kickedOff);
}

const pool = new Map([
  ["josh allen", { name: "Josh Allen", position: "QB", matchup: "BUFMIA", stats: { pts: 24 } }],
  ["puka nacua", { name: "Puka Nacua", position: "WR", matchup: "LARLV", stats: { pts: 18 } }],
  ["rome odunze", { name: "Rome Odunze", position: "WR", matchup: "NECHI", stats: { pts: 19 } }],
]);
const lg = { slots: ["QB", "WR"], scoring: {} };
// Drake Maye (QB) has played, so only the WR starter is still live.
const starters = [{ name: "Weak WR", position: "WR", points: 8, wasStarter: true }];
const rostered = new Set(["drake maye", "weak wr"]);

const { freeAgentsFor } = harness(pool, new Set(["Rome Odunze"]));

console.log("=== QB slot spent ===");
const open = freeAgentsFor(lg, rostered, starters, ["WR"]);
const names = open.map((f) => f.name);
check("no QB offered for the spent slot", !names.includes("Josh Allen"), names.join(", "));
check("the open WR slot still gets a pickup", names.includes("Puka Nacua"), names.join(", "));
check("a free agent whose game kicked off is not offered",
  !names.includes("Rome Odunze"), names.join(", "));

console.log("=== no slot spent ===");
// Control: with the QB slot open (nobody in it), the QB is a real gain.
const all = freeAgentsFor(lg, rostered, starters, ["QB", "WR"]);
check("an open QB slot does get the QB", all.some((f) => f.name === "Josh Allen"),
  all.map((f) => f.name).join(", "));

console.log("=== every slot spent ===");
check("nothing to offer", freeAgentsFor(lg, rostered, [], []).length === 0);

// spendSlots: which slots played starters hold. Shared by the lineup, the
// free-agent list and the league-chip estimate (2026-10-24); the chip used to
// drop the LAST n slots, so a played QB spent the DEF slot instead.
const spendSlots = new Function([
  g(/const SLOT_ACCEPTS = \{[\s\S]*?\n  \};/),
  g(/function spendSlots\(slots, lockedStarters\)[\s\S]*?\n  \}/),
].join("\n") + ";return spendSlots;")();
const SL = ["QB", "RB", "WR", "FLEX", "DEF"];
const openAfter = (locked) =>
  spendSlots(SL, locked).freeSlots.map((f) => f.slot).join(",");

console.log("=== spendSlots ===");
const cases = [
  ["a played QB spends the QB slot, not the last one",
    [{ position: "QB", slotIndex: 0 }], "RB,WR,FLEX,DEF"],
  ["a played WR in FLEX spends FLEX, leaving the WR slot open",
    [{ position: "WR", slotIndex: 3 }], "QB,RB,WR,DEF"],
  ["unknown slot falls back to the first one his position fits",
    [{ position: "WR" }], "QB,RB,FLEX,DEF"],
  ["a known slot is honoured before a fallback can take it",
    [{ position: "WR" }, { position: "WR", slotIndex: 2 }], "QB,RB,DEF"],
];
for (const [label, locked, want] of cases) {
  const got = openAfter(locked);
  check(label, got === want, got);
}

console.log(`\n${failed ? failed + " failed" : "all passed"}`);
process.exit(failed ? 1 : 0);
