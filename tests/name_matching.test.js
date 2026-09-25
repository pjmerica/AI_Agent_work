/* Name matching across sources.
 *
 * Five feeds spell players five ways, and the joins between them are all on
 * name. Two failure modes matter, in opposite directions:
 *
 *   Too loose — two different people merge, and one player's lines get
 *   attributed to another. This already happened: the initial-plus-surname key
 *   handed CJ Williams, a deep bench receiver, Caleb Williams's quarterback
 *   projection.
 *
 *   Too strict — one person splits in two, and his sources never join. Also
 *   already happened: Cam Ward is "Cam Ward" to Kalshi, the books and Sleeper
 *   but "Cameron Ward" to DraftKings and Clay, so his touchdown line and his
 *   projection both sat on a player nothing else knew about.
 *
 * So this checks the known cases in both directions, and then re-runs the
 * search that found them rather than trusting the alias table to stay complete.
 *
 *     node tests/name_matching.test.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.REPO_ROOT || process.cwd();
const dataDir = path.join(ROOT, "nfl-props");
const src = fs.readFileSync(path.join(ROOT, "lineup/app.js"), "utf8");
const grab = (re) => {
  const m = src.match(re);
  if (!m) throw new Error("MISSING " + String(re).slice(0, 44));
  return m[0];
};
const H = eval("(function(){" + [
  grab(/const FIRST_NAME_ALIASES = \{[\s\S]*?\n  \};/),
  grab(/const FULL_NAME_ALIASES = \{[\s\S]*?\n  \};/),
  grab(/function normPlayerName\(s\)[\s\S]*?\n  \}/),
  grab(/function altPlayerKey\(s\)[\s\S]*?\n  \}/),
].join("\n") + ";return{normPlayerName,altPlayerKey,FIRST_NAME_ALIASES}})()");

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fail++; console.log("  FAIL  " + label + (detail ? "   -> " + detail : "")); }
};

console.log("=== names that MUST merge ===");
const SAME = [
  ["Cam Ward", "Cameron Ward"],
  ["Josh Palmer", "Joshua Palmer"],
  ["Chig Okonkwo", "Chigoziem Okonkwo"],
  ["Cam Skattebo", "Cameron Skattebo"],
  ["Ken Walker III", "Kenneth Walker"],
  ["Travis Etienne Jr.", "Travis Etienne"],
  ["Marvin Harrison Jr.", "Marvin Harrison"],
  ["Mike Washington Jr.", "Michael Washington"],
  ["ceedee lamb", "CeeDee Lamb"],
  ["D. Lamb", "D Lamb"],
];
for (const [a, b] of SAME) {
  check(a + " = " + b, H.normPlayerName(a) === H.normPlayerName(b),
    H.normPlayerName(a) + " vs " + H.normPlayerName(b));
}

console.log("");
console.log("=== names that must STAY APART ===");
// Each of these collides under the loose initial+surname key, which is exactly
// why a stat fill must use the exact key.
const DIFF = [
  ["A.J. Brown", "Amon-Ra St. Brown"],
  ["Keenan Allen", "Kyle Allen"],
  ["CJ Williams", "Caleb Williams"],
  ["D.J. Moore", "David Moore"],
  ["Ty Johnson", "Tyler Johnson"],
  ["Justice Hill", "Julian Hill"],
  ["Aaron Jones", "Andy Jones"],
  ["David Montgomery", "D.J. Montgomery"],
];
for (const [a, b] of DIFF) {
  check(a + " != " + b, H.normPlayerName(a) !== H.normPlayerName(b),
    "both became " + H.normPlayerName(a));
}

console.log("");
console.log("=== the loose key really is ambiguous (so never use it for numbers) ===");
check("A.J. Brown and Amon-Ra St. Brown share a loose key",
  H.altPlayerKey("A.J. Brown") === H.altPlayerKey("Amon-Ra St. Brown"),
  "they do not, so this test's premise is stale");

console.log("");
console.log("=== re-run the search that found the splits ===");
// Group every name in the data on surname; flag pairs where one first name is a
// prefix of the other AND they share a team. That combination is a person
// spelled two ways, not two people.
const J = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
const seen = new Map();
const add = (name, team) => {
  const k = H.normPlayerName(name);
  if (!k) return;
  if (!seen.has(k)) seen.set(k, { names: new Set(), teams: new Set() });
  seen.get(k).names.add(name);
  if (team) seen.get(k).teams.add(team);
};
try {
  for (const p of J("weekly.json").players) add(p.name, null);
  for (const p of J("oddsapi.json").players) add(p.name, null);
  for (const p of J("dk_td.json").players) add(p.name, null);
  for (const p of J("clay.json").players) add(p.name, p.team);
  for (const v of Object.values(J("sleeper_players.json").players)) add(v[0], v[2]);
} catch (e) {
  console.log("  (data files unavailable: " + e.message + ")");
}

const bySurname = new Map();
for (const [k, e] of seen) {
  const parts = k.split(" ");
  if (parts.length < 2) continue;
  const sur = parts[parts.length - 1];
  if (!bySurname.has(sur)) bySurname.set(sur, []);
  bySurname.get(sur).push({ first: parts[0], e });
}
const unhandled = [];
for (const [sur, list] of bySurname) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.first === b.first) continue;
      const short = a.first.length < b.first.length ? a : b;
      const long = short === a ? b : a;
      if (!long.first.startsWith(short.first)) continue;
      if (short.first.length < 3) continue;   // an initial, not a nickname
      const tA = [...a.e.teams], tB = [...b.e.teams];
      if (!tA.some((t) => tB.includes(t))) continue;   // different people
      unhandled.push(short.first + "/" + long.first + " " + sur);
    }
  }
}
check("no same-team first-name split is left unaliased", unhandled.length === 0,
  unhandled.join(", "));

console.log("");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
