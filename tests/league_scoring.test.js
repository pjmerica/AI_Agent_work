/**
 * leaguePoints() must score with each Sleeper league's own rates.
 *
 * Until 2026-10-19 it used the league's reception, passing-TD and TE-premium
 * settings but hard-coded every yardage and rushing/receiving TD rate to
 * Sleeper's defaults, so a 1-point-per-20-passing-yards league was projected
 * as if it were 1-per-25. This pulls the real function out of lineup/app.js
 * (it lives inside the page's IIFE, so it cannot be required) and checks it
 * against hand-worked scores.
 */
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "lineup", "app.js"), "utf8");

function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in lineup/app.js`);
  let i = src.indexOf("{", start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

// Stats arrive as {line}; with no book filter set, lineUnderFilter returns it.
const leaguePoints = new Function(
  "const lineUnderFilter = (s) => (s && s.line != null ? s.line : null);\n" +
  extract("leaguePoints") + "\nreturn leaguePoints;")();

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = Math.abs(got - want) < 1e-9;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}: ${got}${ok ? "" : `  (want ${want})`}`);
};
const S = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { line: v }]));

const qb = S({ pass_yds: 250, pass_tds: 2, rush_yds: 20, any_tds: 0.5 });
const wr = S({ rec_yds: 80, receptions: 6, any_tds: 0.5 });
const rb = S({ rush_yds: 70, rec_yds: 20, receptions: 3, any_tds: 0.6 });

// Sleeper defaults, written out and left out: both must match the old maths.
const dflt = { rec: 0.5, passTd: 4, bonusRecTe: 0,
               raw: { pass_yd: 0.04, rush_yd: 0.1, rec_yd: 0.1, rush_td: 6, rec_td: 6 } };
eq("QB, default rates", leaguePoints(qb, dflt, "QB"), 250 * 0.04 + 8 + 2 + 3);
eq("QB, rates absent from settings", leaguePoints(qb, { rec: 0.5, passTd: 4 }, "QB"), 23);
eq("WR half-PPR", leaguePoints(wr, dflt, "WR"), 8 + 3 + 3);

// 1 point per 20 passing yards.
const p20 = { ...dflt, raw: { ...dflt.raw, pass_yd: 0.05 } };
eq("QB, 1 per 20 passing yards", leaguePoints(qb, p20, "QB"), 250 * 0.05 + 8 + 2 + 3);

// Rushing and receiving TDs scored differently: position picks the rate.
const split = { ...dflt, raw: { ...dflt.raw, rush_td: 6, rec_td: 4 } };
eq("RB uses the rushing-TD rate", leaguePoints(rb, split, "RB"), 7 + 2 + 1.5 + 0.6 * 6);
eq("WR uses the receiving-TD rate", leaguePoints(wr, split, "WR"), 8 + 3 + 0.5 * 4);

// TE premium still stacks on the base reception rate.
const tep = { ...dflt, rec: 1, bonusRecTe: 0.5 };
eq("TE premium", leaguePoints(S({ rec_yds: 50, receptions: 4 }), tep, "TE"), 5 + 4 + 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
