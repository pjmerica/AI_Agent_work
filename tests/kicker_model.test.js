/**
 * The kicker model, checked against what kickers actually did this season.
 *
 * Kickers and defenses have no prop market, so they are priced off the game line.
 * That is a modelling claim rather than a quoted number, and it had a real bug:
 * `fgs = T / 10.5` is an ATTEMPT count -- the miss term
 * (`fgs * 0.133 * fgmiss`) only makes sense that way -- but every scoring term
 * paid a per-MAKE rate on it, so each attempt was scored as though it converted.
 *
 * Measured over 128 team-games of 2026: 1.95 attempts and 1.69 makes per
 * team-game at a mean 22.72 points scored. The old model produced 2.16 attempts
 * all treated as makes, i.e. 6.49 standard-scoring points where reality is 5.07
 * -- kickers overstated by ~1.4 points a week, ~1.9 in a 30-point game, which is
 * enough to flip a start/sit call.
 *
 * This asserts the components, the same way dst_model.test.js does, rather than
 * the projection itself: a game line knows the expected script and nothing about
 * whether a drive stalls at the 20.
 *
 * Needs the network (Sleeper stats). Run: node tests/kicker_model.test.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = process.env.REPO_ROOT || process.cwd();
const src = fs.readFileSync(path.join(ROOT, "lineup/app.js"), "utf8");

let pass = 0;
const fails = [];
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log("  FAIL  " + label + (detail ? "   -> " + detail : "")); }
};

// Lift the constants straight from the app so the test cannot drift from it.
const grab = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error("could not find " + what + " in lineup/app.js");
  return Number(m[1]);
};
const MAKE_RATE = grab(/const FG_MAKE_RATE = ([\d.]+);/, "FG_MAKE_RATE");
const FG_DIV = grab(/const fgs = Math\.max\(0, T \/ ([\d.]+)\);/, "the FG divisor");
const TD_DIV = grab(/const tds = Math\.max\(0, T \/ ([\d.]+)\);/, "the TD divisor");
const XP_RATE = grab(/const xps = tds \* ([\d.]+);/, "the XP rate");

console.log(`=== constants read from lineup/app.js ===`);
console.log(`  FG divisor ${FG_DIV}   make rate ${MAKE_RATE}`);
console.log(`  TD divisor ${TD_DIV}   XP rate ${XP_RATE}`);

async function getJson(url) {
  const res = await fetch(url);
  let buf = Buffer.from(await res.arrayBuffer());
  // fetch here returns the raw gzip body rather than decompressing it; the same
  // trap is documented in live_smoke.test.js and sleeper_tab.test.js.
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  return JSON.parse(buf.toString("utf8"));
}

(async () => {
  const state = await getJson("https://api.sleeper.app/v1/state/nfl");
  const season = String(state.season);
  const upto = Math.max(1, Number(state.week) - 1);  // the current week is in progress

  let attempts = 0, makes = 0, xpAtt = 0, xpMade = 0, teamGames = 0, pointsScored = 0;
  const weeks = [];
  for (let wk = 1; wk <= upto; wk++) {
    let d;
    try { d = await getJson(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${wk}`); }
    catch { continue; }
    if (!d || !Object.keys(d).length) continue;
    weeks.push(wk);
    for (const [key, s] of Object.entries(d)) {
      if (!s || typeof s !== "object") continue;
      // TEAM_XXX and bare abbreviations are team rows; everything else is a
      // player. Getting this wrong double-counts every field goal, which is how
      // an earlier pass of this analysis produced 3.4 FGs per team-game.
      const isTeam = key.startsWith("TEAM_") || key.length <= 3;
      if (isTeam) {
        if (s.pts_allow != null) { teamGames++; pointsScored += s.pts_allow; }
      } else {
        attempts += s.fga || 0;
        makes += s.fgm || 0;
        xpAtt += s.xpa || 0;
        xpMade += s.xpm || 0;
      }
    }
  }

  check("got completed weeks to measure", weeks.length >= 1 && teamGames >= 32,
        `weeks ${weeks.join(",")}, ${teamGames} team-games`);
  if (!teamGames) { report(); return; }

  const meanPts = pointsScored / teamGames;
  const attPerGame = attempts / teamGames;
  const madePerGame = makes / teamGames;
  const actualMakeRate = makes / attempts;

  console.log("");
  console.log(`=== ${season} weeks ${weeks.join(",")}, ${teamGames} team-games ===`);
  console.log(`  mean points scored   ${meanPts.toFixed(2)}`);
  console.log(`  FG attempts/game     ${attPerGame.toFixed(2)}   model ${(meanPts / FG_DIV).toFixed(2)}`);
  console.log(`  FG made/game         ${madePerGame.toFixed(2)}   model ${(meanPts / FG_DIV * MAKE_RATE).toFixed(2)}`);
  console.log(`  FG make rate         ${actualMakeRate.toFixed(3)}  model ${MAKE_RATE}`);
  console.log(`  XP make rate         ${(xpMade / xpAtt).toFixed(3)}  model ${XP_RATE}`);
  console.log("");

  // Sanity floor: if these are far off NFL norms the measurement is wrong, not
  // the model, and asserting on it would be worse than not testing.
  check("attempt count is in NFL territory (1.3-2.6/game)",
        attPerGame > 1.3 && attPerGame < 2.6, attPerGame.toFixed(2));

  check("model predicts attempts within 0.4 of actual",
        Math.abs(meanPts / FG_DIV - attPerGame) < 0.4,
        `${(meanPts / FG_DIV).toFixed(2)} vs ${attPerGame.toFixed(2)}`);

  // The bug this file exists for: makes must be attempts times a make rate.
  check("model predicts MAKES within 0.3 of actual",
        Math.abs(meanPts / FG_DIV * MAKE_RATE - madePerGame) < 0.3,
        `${(meanPts / FG_DIV * MAKE_RATE).toFixed(2)} vs ${madePerGame.toFixed(2)}`);

  check("the make rate is applied at all (not 1.0)",
        MAKE_RATE > 0.7 && MAKE_RATE < 1.0,
        `FG_MAKE_RATE = ${MAKE_RATE}`);

  check("make rate is within 0.05 of actual",
        Math.abs(MAKE_RATE - actualMakeRate) < 0.05,
        `${MAKE_RATE} vs ${actualMakeRate.toFixed(3)}`);

  // Standard scoring is 3 per made FG; this is the number a user reads.
  const modelFgPts = (meanPts / FG_DIV) * MAKE_RATE * 3;
  const actualFgPts = madePerGame * 3;
  check("field-goal points within 0.6 of actual",
        Math.abs(modelFgPts - actualFgPts) < 0.6,
        `${modelFgPts.toFixed(2)} vs ${actualFgPts.toFixed(2)} fantasy points`);

  check("XP rate is not above the measured conversion",
        XP_RATE <= xpMade / xpAtt + 0.01,
        `${XP_RATE} vs ${(xpMade / xpAtt).toFixed(3)}`);

  report();

  function report() {
    console.log("");
    console.log(`${pass} passed, ${fails.length} failed`);
    if (fails.length) console.log("FAILED: " + fails.join(", "));
    process.exit(fails.length ? 1 : 0);
  }
})();
