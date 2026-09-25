/* Do lineup/app.js and nfl-props/app.js still agree on a player's projection?
 *
 * The two share ancestry: lineup was split out of the board, and shared logic
 * has been ported back and forth since. Every port is a chance for one to keep
 * a fix the other misses, and that has happened twice — the board spent a day
 * with a silent-drop bug that lineup had already fixed, and before that the
 * whole projection-fill feature existed in only one of them.
 *
 * This builds both pools from the same data files and compares every player.
 * Any difference is either an intended divergence or drift; there is no third
 * option, so the assertion is that there are none.
 *
 *     node tests/apps_agree.test.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.REPO_ROOT || process.cwd();
const dataDir = path.join(ROOT, "nfl-props");

// Shared helpers the pool builder needs, by the regex that finds each. Missing
// ones are skipped rather than fatal: the two files do not carry an identical
// set, and that is the point of the test.
const WANTED = [
  /const activeBooks = new Set\(\);/,
  /let booksAllOff = false;/,
  /const BOOK_LABEL = \{[\s\S]*?\n  \};/,
  /const NONBOOK_SOURCES = \{[\s\S]*?\};/,
  /const KALSHI_METHODS = new Set\([\s\S]*?\);/,
  /const FIRST_NAME_ALIASES = \{[\s\S]*?\n  \};/,
  /const FULL_NAME_ALIASES = \{[\s\S]*?\n  \};/,
  /function normPlayerName\(s\)[\s\S]*?\n  \}/,
  /function altPlayerKey\(s\)[\s\S]*?\n  \}/,
  /function lineUnderFilter\(stat\)[\s\S]*?\n  \}/,
  /function weeklyPoints\(stats, format\)[\s\S]*?\n  \}/,
  /function buildProjLookup\(data\)[\s\S]*?\n  \}/,
  /function lookupProj\(lut, name\)[\s\S]*?\n  \}/,
  /function lookupProjExact\(lut, name\)[\s\S]*?\n  \}/,
  /const GAMES_IN_SEASON = \d+;/,
  /const PROJ_FILL_STATS = \[[\s\S]*?\];/,
  /function projPerGame\(proj\)[\s\S]*?\n  \}/,
  /function buildSitStartPoolFull\(\)[\s\S]*?\n  \}/,
];

function loadPool(file) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const parts = [];
  const missing = [];
  for (const re of WANTED) {
    const m = src.match(re);
    if (m) parts.push(m[0]);
    else missing.push(String(re).slice(0, 44));
  }
  const J = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
  const cache = {
    weekly: J("weekly.json"), oddsapi: J("oddsapi.json"), dktd: J("dk_td.json"),
    data: J("data.json"), clay: J("clay.json"),
  };
  const api = eval("(function(){const cache=arguments[0];" + parts.join("\n") +
    ";return{buildSitStartPoolFull}})")(cache);
  return { pool: api.buildSitStartPoolFull(), missing };
}

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fail++; console.log("  FAIL  " + label + (detail ? "   -> " + detail : "")); }
};

const a = loadPool("lineup/app.js");
const b = loadPool("nfl-props/app.js");

console.log("=== both files carry the shared pool logic ===");
check("lineup has every shared helper", a.missing.length === 0, a.missing.join(", "));
check("board has every shared helper", b.missing.length === 0, b.missing.join(", "));

console.log("");
console.log("=== the pools agree ===");
check("same number of players", a.pool.size === b.pool.size,
  a.pool.size + " vs " + b.pool.size);

const onlyA = [...a.pool.keys()].filter((k) => !b.pool.has(k));
const onlyB = [...b.pool.keys()].filter((k) => !a.pool.has(k));
check("no player in only one pool", onlyA.length === 0 && onlyB.length === 0,
  "lineup-only: " + onlyA.slice(0, 4).join(", ") +
  "  board-only: " + onlyB.slice(0, 4).join(", "));

const diffs = [];
for (const [k, v] of a.pool) {
  const o = b.pool.get(k);
  if (!o) continue;
  if (Math.abs((v.points || 0) - (o.points || 0)) > 0.05) {
    diffs.push({ n: v.name, a: v.points, b: o.points });
  }
  if (!!v.tdOnly !== !!o.tdOnly) {
    diffs.push({ n: v.name + " (tdOnly flag)", a: !!v.tdOnly, b: !!o.tdOnly });
  }
}
diffs.sort((x, y) => Math.abs((y.a - y.b) || 0) - Math.abs((x.a - x.b) || 0));
check("every player projects the same in both", diffs.length === 0,
  diffs.length + " differ");
diffs.slice(0, 10).forEach((d) =>
  console.log("        " + String(d.n).padEnd(26) +
    "lineup " + String(d.a).padStart(7) + "   board " + String(d.b).padStart(7)));

console.log("");
console.log("=== positions resolve the same way ===");
let posDiff = 0;
for (const [k, v] of a.pool) {
  const o = b.pool.get(k);
  if (o && (v.position || null) !== (o.position || null)) posDiff++;
}
check("no position disagreements", posDiff === 0, posDiff + " differ");

console.log("");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
