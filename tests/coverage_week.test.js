// The coverage banner counts this week's games, never next week's.
//
// Sunday night 2026-10-25: with the 1pm and 4pm games kicked off, "the next 16
// games on the odds feed" were Sunday and Monday night plus fourteen week-8
// games, and the banner said "2 of 16 games have player props posted. Still
// waiting on: CARGB, ARIDAL, ..." about games a week away. coverageState now
// stops at the coming Tuesday 08:00 UTC.
const fs = require("fs");
const src = fs.readFileSync("lineup/app.js", "utf8");
const m = src.match(/function coverageState\(\)[\s\S]*?\n  \}/);
if (!m) throw new Error("coverageState not found");

let failed = 0;
const check = (label, cond, detail) => {
  failed += !cond;
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}` + (cond ? "" : `  [${detail}]`));
};

function stateAt(nowIso, games, oddsPlayers) {
  const realNow = Date.now;
  Date.now = () => Date.parse(nowIso);
  try {
    const cache = { gamelines: { games }, weekly: { week: 7 }, oddsapi: { players: oddsPlayers } };
    return new Function("cache", m[0] + ";return coverageState();")(cache);
  } finally {
    Date.now = realNow;
  }
}

const g = (matchup, kickoff) => ({ matchup, kickoff });
const games = [
  g("PITNO", "2026-10-25T13:30:00Z"),
  g("CLETEN", "2026-10-25T17:00:00Z"),
  g("DALPHI", "2026-10-25T20:25:00Z"),
  g("KCSEA", "2026-10-26T00:20:00Z"),      // Sunday night, in progress at 00:55
  g("NYGHOU", "2026-10-27T00:15:00Z"),     // Monday night
  // week 8
  g("CARGB", "2026-10-30T00:15:00Z"),
  g("ARIDAL", "2026-11-01T17:00:00Z"),
  g("ATLTB", "2026-11-01T17:00:00Z"),
  g("BALBUF", "2026-11-01T18:00:00Z"),
];
const priced = (mu) => Array.from({ length: 8 }, (_, i) => ({ matchup: mu, name: mu + i }));
const odds = [...priced("KCSEA"), ...priced("NYGHOU")];

console.log("=== Sunday night ===");
let c = stateAt("2026-10-26T00:55:00Z", games, odds);
const names = c.thin.map((t) => t.matchup).concat([...c.games]).join(",");
check("no week-8 game is counted", !/CARGB|ARIDAL|ATLTB|BALBUF/.test(names), names);
check("Sunday and Monday night are the week left", c.total === 2, c.total);
check("both priced, so nothing reported missing", c.priced === 2 && !c.thin.length,
  c.priced + " priced, thin: " + c.thin.map((t) => t.matchup));

console.log("=== Tuesday after the week ===");
c = stateAt("2026-10-27T10:00:00Z", games, []);
check("the coming week is the board", c.total === 4 && c.games.has("CARGB"), [...c.games]);

console.log("=== Monday night, game on ===");
c = stateAt("2026-10-27T03:00:00Z", games, odds);
check("still week 7 until Tuesday morning", c.total === 1 && c.games.has("NYGHOU"), [...c.games]);

console.log(`\n${failed ? failed + " failed" : "all passed"}`);
process.exit(failed ? 1 : 0);
