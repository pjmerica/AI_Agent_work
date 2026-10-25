// The "≈" projection marker and the lineup total's estimated share.
//
// 2026-10-25: a TD-only player's projection looked like a priced one in the
// Proj column. ptsHtml marks it and totalEstNote says how much of the lineup
// total is estimate. These pin the arithmetic: only stats whose line came from
// a season projection count as estimated.
const fs = require("fs");
const src = fs.readFileSync("lineup/app.js", "utf8");
const g = (re) => {
  const m = src.match(re);
  if (!m) throw new Error("MISSING " + String(re).slice(0, 44));
  return m[0];
};
const H = new Function([
  "const escapeHtml = (x) => String(x);",
  g(/function pricedStats\(stats\)[\s\S]*?\n  \}/),
  g(/function estimatedPart\(p, score\)[\s\S]*?\n  \}/),
  g(/function ptsHtml\(p, score, strong\)[\s\S]*?\n  \}/),
  g(/function totalEstNote\(picks, score\)[\s\S]*?\n  \}/),
].join("\n") + ";return { estimatedPart, ptsHtml, totalEstNote };")();

let failed = 0;
const check = (label, cond, detail) => {
  failed += !cond;
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}` + (cond ? "" : `  [${detail}]`));
};

// A toy scorer: 6 per TD, 0.1 per yard, 0.5 per reception.
const score = (st) => (st.any_tds ? 6 * st.any_tds.line : 0) +
  (st.rec_yds ? 0.1 * st.rec_yds.line : 0) + (st.receptions ? 0.5 * st.receptions.line : 0);

const tdOnly = {
  name: "Zay Flowers", position: "WR", projFilled: true,
  stats: {
    any_tds: { line: 0.45 },
    rec_yds: { line: 60, lineSource: "projected" },
    receptions: { line: 5, lineSource: "projected" },
  },
};
tdOnly.points = score(tdOnly.stats);           // 2.7 + 6 + 2.5 = 11.2
const priced = { name: "Ja'Marr Chase", position: "WR", projFilled: false, points: 18,
  stats: { any_tds: { line: 0.6 }, rec_yds: { line: 85 } } };

check("only the projected stats count as estimated",
  Math.abs(H.estimatedPart(tdOnly, score) - 8.5) < 1e-9, H.estimatedPart(tdOnly, score));
check("a fully priced player has no estimated part", H.estimatedPart(priced, score) === 0);
check("the filled projection is marked ≈",
  /pts-est/.test(H.ptsHtml(tdOnly, score, true)) && /&asymp;11\.2/.test(H.ptsHtml(tdOnly, score, true)),
  H.ptsHtml(tdOnly, score, true));
check("a priced projection is not",
  !/pts-est|asymp/.test(H.ptsHtml(priced, score, true)), H.ptsHtml(priced, score, true));
check("the total names the estimated share",
  /&asymp;8\.5 of it estimated/.test(H.totalEstNote([tdOnly, priced, null], score)),
  H.totalEstNote([tdOnly, priced, null], score));
check("no note when nothing is estimated", H.totalEstNote([priced], score) === "");

console.log(`\n${failed ? failed + " failed" : "all passed"}`);
process.exit(failed ? 1 : 0);
