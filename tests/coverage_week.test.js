// The coverage banner counts this week's games, never next week's.
//
// Sunday night 2026-10-25: with the 1pm and 4pm games kicked off, "the next 16
// games on the odds feed" were Sunday and Monday night plus fourteen week-8
// games, and the banner said "2 of 16 games have player props posted. Still
// waiting on: CARGB, ARIDAL, ..." about games a week away. coverageState now
// stops at the coming Tuesday 08:00 UTC.
const fs = require("fs");
const src = fs.readFileSync("lineup/app.js", "utf8");
const grab = (re) => {
  const x = src.match(re);
  if (!x) throw new Error("MISSING " + String(re).slice(0, 40));
  return x[0];
};
const weekEndSrc = grab(/function weekEndAfter\(now\)[\s\S]*?\n  \}/);
const coverageSrc = weekEndSrc + "\n" + grab(/function coverageState\(\)[\s\S]*?\n  \}/);
const lineSrc = weekEndSrc + "\n" + grab(/function gameLineFor\(team\)[\s\S]*?\n  \}/);

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
    return new Function("cache", coverageSrc + ";return coverageState();")(cache);
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

// gameLineFor: a team on bye has no game this week (2026-10-26: Tyler Bass,
// Bills on bye, was priced off next week's BAL@BUF).
function lineAt(nowIso, team, list) {
  const realNow = Date.now;
  Date.now = () => Date.parse(nowIso);
  try {
    return new Function("cache", "teamKey", "team",
      lineSrc + ";return gameLineFor(team);")({ gamelines: { games: list } }, (x) => x, team);
  } finally {
    Date.now = realNow;
  }
}
const withTeams = (mu, away, home, kickoff) => ({
  matchup: mu, kickoff, away, home, total: 45,
  teams: { [away]: { implied: 21 }, [home]: { implied: 24 } },
});
const slate = [
  withTeams("KCSEA", "KC", "SEA", "2026-10-25T20:25:00Z"),
  withTeams("NYGHOU", "NYG", "HOU", "2026-10-27T00:15:00Z"),
  withTeams("BALBUF", "BAL", "BUF", "2026-11-01T18:00:00Z"),   // week 8
];
console.log("=== game line for a team on bye ===");
const bye = lineAt("2026-10-26T12:00:00Z", "BUF", slate);
check("a team on bye gets no line from next week", bye === null, JSON.stringify(bye));
check("a team playing this week gets its game",
  (lineAt("2026-10-26T12:00:00Z", "HOU", slate) || {}).matchup === "NYGHOU");
check("after the Tuesday rollover, next week's game is this week's",
  (lineAt("2026-10-27T10:00:00Z", "BUF", slate) || {}).matchup === "BALBUF");

console.log(`\n${failed ? failed + " failed" : "all passed"}`);
process.exit(failed ? 1 : 0);
