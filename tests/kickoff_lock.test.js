/**
 * A player whose game has kicked off must not be offered as a start.
 *
 * This existed as a bug for as long as the Sit/Start tab did. The guard was
 * written -- teamIsLive() -- but only renderSleeper() ever called it, so the
 * paste-a-roster tab had no kickoff awareness at all. Found live on Sunday
 * 2026-10-11 with the 1pm ET games two and a half hours underway: a roster
 * containing Rome Odunze (CHIGB, kicked off 17:03) came back with him
 * recommended at WR, 6.2 projected, no warning. 181 of 302 players were in
 * games already in progress.
 *
 * The test drives the real page in jsdom with SYNTHETIC gamelines, so it does
 * not depend on real games being in progress when it runs -- otherwise it would
 * only be meaningful for a few hours a week and would pass vacuously the rest of
 * the time, which is how the bug survived.
 *
 * It also guards the parsing trap that nearly shipped a broken fix:
 * weekly.json's `kickoff` is a DAY CODE like "26OCT11", and Date.parse accepts
 * that and returns a date in 2011. Treating it as a timestamp marks every player
 * as kicked off long ago, which looks correct on a Sunday afternoon and sweeps
 * the whole board into "already under way" on a Thursday.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = process.env.REPO_ROOT || process.cwd();
const html = fs.readFileSync(path.join(ROOT, "lineup/index.html"), "utf8");
const appSrc = fs.readFileSync(path.join(ROOT, "lineup/app.js"), "utf8");

let pass = 0;
const fails = [];
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fails.push(label); console.log("  FAIL  " + label + (detail ? "   -> " + detail : "")); }
};

// ---- the day-code trap, checked directly ----------------------------------
console.log("=== the kickoff field is not blindly parsed ===");
check("Date.parse does accept a day code (so a naive check is unsafe)",
  isFinite(Date.parse("26OCT11")),
  "if this ever fails the trap is gone and the guard could be simplified");
check("app.js guards kickoff with an ISO shape test",
  /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}T\//.test(appSrc) ||
  /\\d\{4\}-\\d\{2\}-\\d\{2\}T/.test(appSrc),
  "playerHasKickedOff must not pass a day code to Date.parse");

// ---- drive the page with synthetic kickoffs --------------------------------
const ISO = (ms) => new Date(Date.now() + ms).toISOString();
const PAST = ISO(-3 * 3600 * 1000);   // kicked off three hours ago
const FUTURE = ISO(+5 * 3600 * 1000); // kicks off in five hours

// Two players: one in a started game, one not. Same shape the real feeds use.
const weekly = {
  week: 99,
  kickoffs: ["26OCT11"],            // the day code, deliberately
  gameCount: 2,
  playerGameCount: 2,
  players: [
    { name: "Started Player", game: "AAA@BBB", kickoff: "26OCT11", matchup: "AAABBB",
      stats: { rec_yds: { line: 60 }, receptions: { line: 5 }, any_tds: { line: 0.4 } } },
    { name: "Upcoming Player", game: "CCC@DDD", kickoff: "26OCT11", matchup: "CCCDDD",
      stats: { rec_yds: { line: 70 }, receptions: { line: 6 }, any_tds: { line: 0.5 } } },
  ],
};
const gamelines = {
  games: [
    { matchup: "AAABBB", home: "BBB", away: "AAA", kickoff: PAST, total: 45,
      homeSpread: -3, teams: { AAA: { implied: 21 }, BBB: { implied: 24 } }, bookCount: 5 },
    { matchup: "CCCDDD", home: "DDD", away: "CCC", kickoff: FUTURE, total: 45,
      homeSpread: -3, teams: { CCC: { implied: 21 }, DDD: { implied: 24 } }, bookCount: 5 },
  ],
};

const FILES = {
  "weekly.json": weekly,
  "gamelines.json": gamelines,
  "oddsapi.json": { players: [] },
  "dk_td.json": { players: [] },
  "sleeper_players.json": { players: {} },
  "clay.json": { players: [] },
  "data.json": { players: [] },
};

(async () => {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.test/lineup/" });
  const { window } = dom;

  window.fetch = async (u) => {
    const name = String(u).split("?")[0].split("/").pop();
    if (Object.prototype.hasOwnProperty.call(FILES, name)) {
      return { ok: true, status: 200, json: async () => FILES[name] };
    }
    return { ok: false, status: 404, json: async () => null };
  };
  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));

  window.eval(appSrc);
  await new Promise((r) => setTimeout(r, 1200));

  const $ = (id) => window.document.getElementById(id);
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

  // Paste both players and render.
  const ta = $("roster-paste-input") || window.document.querySelector("textarea");
  check("the paste box exists", !!ta);
  if (!ta) return report();
  ta.value = "Started Player\nUpcoming Player";
  const go = $("roster-go");
  check("the paste button exists", !!go);
  if (!go) return report();
  go.click();
  await new Promise((r) => setTimeout(r, 800));

  const out = txt($("sitstart-output"));
  check("something rendered", out.length > 40, out.slice(0, 70));

  const idx = out.indexOf("Game already under way");
  check("the under-way section is shown", idx > -1, out.slice(0, 120));

  const head = idx > -1 ? out.slice(0, idx) : out;
  const tail = idx > -1 ? out.slice(idx) : "";

  check("a player whose game started is NOT in the recommended slots",
    !head.includes("Started Player"),
    "found in the slot table: " + head.slice(0, 90));
  check("that player is listed under the under-way section",
    tail.includes("Started Player"),
    tail.slice(0, 90));
  check("a player whose game has not started IS still recommended",
    head.includes("Upcoming Player"),
    head.slice(0, 90));
  check("no uncaught page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  report();

  function report() {
    console.log("");
    console.log(`${pass} passed, ${fails.length} failed`);
    if (fails.length) console.log("FAILED: " + fails.join(", "));
    process.exit(fails.length ? 1 : 0);
  }
})();
