/* Does the "these games were already played" banner fire when, and only when,
 * the props describe a finished week?
 *
 * Regression for 2026-10-27: weekly.json held week 7's played games plus the
 * two D/ST lines Kalshi had already opened for the next Thursday game. The old
 * check compared the last kickoff DAY in the file against now, so those two
 * rows made the whole finished week read as live and the banner never showed.
 *
 * Runs the function from both apps against the same fixtures, so a fix that
 * reaches one and not the other fails here too.
 *
 *     node tests/stale_week.test.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.REPO_ROOT || path.resolve(__dirname, "..");

function load(file) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const grab = (re) => {
    const m = re.exec(src);
    if (!m) throw new Error(file + ": cannot find " + re);
    return m[0];
  };
  const body = [
    grab(/const KICK_MONTHS = \{[\s\S]*?\};/),
    grab(/function parseKickCode\(code\)[\s\S]*?\n  \}/),
    grab(/function staleWeekState\(\)[\s\S]*?\n  \}/),
    grab(/function staleWeekBanner\(\)[\s\S]*?\n  \}/),
  ].join("\n");
  // eslint-disable-next-line no-new-func
  return new Function("cache", "Date", "escapeHtml",
    body + "\nreturn { staleWeekState, staleWeekBanner };");
}

// A Date whose now() is pinned, everything else real.
function clockAt(iso) {
  const T = Date.parse(iso);
  const D = function (...a) { return a.length ? new Date(...a) : new Date(T); };
  D.now = () => T;
  D.parse = Date.parse;
  D.UTC = Date.UTC;
  return D;
}

const esc = (s) => String(s);
const row = (name, kickoff, matchup) =>
  ({ name, kickoff, matchup, game: kickoff + ":" + matchup, stats: {} });

// Week 7 as it stood on 2026-10-27, cut down: a Sunday game, the Monday game,
// and the next Thursday game with only its two defense lines open.
const weekly = {
  week: 7, lastUpdated: "2026-10-26T00:00:02+00:00",
  kickoffs: ["26OCT25", "26OCT26", "26OCT29"],
  players: [
    row("Jahmyr Gibbs", "26OCT25", "GBDET"), row("Jared Goff", "26OCT25", "GBDET"),
    row("GB Packers D/ST", "26OCT25", "GBDET"),
    row("Jalen Hurts", "26OCT26", "DALPHI"), row("CeeDee Lamb", "26OCT26", "DALPHI"),
    row("CAR Panthers D/ST", "26OCT29", "CARGB"), row("GB Packers D/ST", "26OCT29", "CARGB"),
  ],
};
const gamelines = {
  games: [
    { matchup: "GBDET", kickoff: "2026-10-25T17:00:00Z" },
    { matchup: "DALPHI", kickoff: "2026-10-27T00:15:00Z" },
    { matchup: "CARGB", kickoff: "2026-10-30T00:15:00Z" },
    { matchup: "KCLV", kickoff: "2026-11-01T17:00:00Z" },
  ],
};
const clone = (o) => JSON.parse(JSON.stringify(o));

const CASES = [
  {
    name: "finished week with two defense lines left over",
    at: "2026-10-28T00:30:00Z", weekly, gamelines,
    expect: (s, b) => s && s.leftover === 2 && /Apart from 2 defense lines/.test(b) &&
                      /week 7/.test(b) && !/Every line below/.test(b) &&
                      // Monday night ended about 20 hours earlier.
                      /finished yesterday/.test(b),
  },
  {
    name: "three days on, it says so",
    at: "2026-10-30T06:00:00Z", weekly: (() => { const w = clone(weekly); w.players = w.players.filter((p) => p.matchup !== "CARGB"); return w; })(),
    gamelines,
    expect: (s, b) => s && /finished 3 days ago/.test(b),
  },
  {
    name: "Monday before the late game: still live",
    at: "2026-10-26T20:00:00Z", weekly, gamelines,
    expect: (s) => s === null,
  },
  {
    name: "Sunday morning: live",
    at: "2026-10-25T14:00:00Z", weekly, gamelines,
    expect: (s) => s === null,
  },
  {
    name: "finished week, nothing left over",
    at: "2026-10-28T00:30:00Z",
    weekly: (() => { const w = clone(weekly); w.players = w.players.filter((p) => p.matchup !== "CARGB"); return w; })(),
    gamelines,
    expect: (s, b) => s && s.leftover === 0 && /Every line below is for a game already played/.test(b),
  },
  {
    name: "the next game prices a player: live",
    at: "2026-10-28T00:30:00Z",
    weekly: (() => { const w = clone(weekly); w.players.push(row("Bryce Young", "26OCT29", "CARGB")); return w; })(),
    gamelines,
    expect: (s) => s === null,
  },
  {
    name: "nothing scheduled ahead (offseason): no banner",
    at: "2027-03-01T00:00:00Z", weekly, gamelines,
    expect: (s) => s === null,
  },
  {
    name: "game missing from gamelines falls back to its kickoff day",
    at: "2026-10-28T00:30:00Z", weekly,
    gamelines: { games: gamelines.games.filter((g) => g.matchup !== "DALPHI") },
    expect: (s) => s && s.leftover === 2,
  },
];

let failed = 0;
for (const file of ["lineup/app.js", "nfl-props/app.js"]) {
  const make = load(file);
  for (const c of CASES) {
    const fns = make({ weekly: c.weekly, gamelines: c.gamelines }, clockAt(c.at), esc);
    const s = fns.staleWeekState();
    const b = fns.staleWeekBanner();
    const ok = !!c.expect(s, b);
    if (!ok) failed++;
    console.log((ok ? "  ok   " : "  FAIL ") + file + ": " + c.name +
      (ok ? "" : "\n         state=" + JSON.stringify(s) + "\n         banner=" + b));
  }
}
if (failed) { console.error(failed + " failed"); process.exit(1); }
console.log("all passed");
