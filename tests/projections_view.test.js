/* The Vegas Projections view of lineup/index.html, in a real DOM (2026-11-17).
 *
 * Every player with a betting line this week, each stat's market line, and the
 * points those lines score in PPR, half PPR or standard. These checks load the
 * real page and data, click the real controls, and compare the table with
 * points worked out here by hand from the same data files, so a scoring slip
 * shows up as a wrong number rather than a page that merely rendered.
 *
 *   node tests/projections_view.test.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = process.env.REPO_ROOT || process.cwd();
const html = fs.readFileSync(path.join(ROOT, "lineup/index.html"), "utf8");
const appSrc = fs.readFileSync(path.join(ROOT, "lineup/app.js"), "utf8");
const dataDir = path.join(ROOT, "nfl-props");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));

// Every kickoff ten minutes ahead, so the board is this week's whatever day the
// test runs (see lineup_page.test.js). One game is put in the past instead, to
// exercise "Include games that have kicked off".
const gl = read("gamelines.json");
const soon = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const startedGame = (gl.games[0] || {}).matchup;
// Set at the end to put every game in the past (the Monday-night board).
let allPast = false;
const kick = (m) => (allPast || m === startedGame) ? past : soon;
const fakeLinesNow = () => Object.assign({}, gl, {
  games: gl.games.map((g) => Object.assign({}, g, { kickoff: kick(g.matchup) })),
});
// weekly.json carries ISO kickoffs on some rows; the page prefers those over
// gamelines, so they are moved too.
const fixKick = (d) => Object.assign({}, d, { players: (d.players || []).map((p) => {
  const q = Object.assign({}, p);
  if (typeof q.kickoff === "string" && /^\d{4}-\d{2}-\d{2}T/.test(q.kickoff)) q.kickoff = kick(q.matchup);
  if (typeof q.kickoffTime === "string") q.kickoffTime = kick(q.matchup);
  return q;
}) });

function fakeFetch(url) {
  const name = String(url).split("/").pop().split("?")[0];
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
  let data = read(name);
  if (name === "gamelines.json") data = fakeLinesNow();
  if (name === "weekly.json" || name === "oddsapi.json") data = fixKick(data);
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
}

const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.test/lineup/#proj", pretendToBeVisual: true });
const { window } = dom;
window.fetch = fakeFetch;
const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
try { window.eval(appSrc); } catch (e) { console.log("FATAL on load: " + e.message); process.exit(1); }

const $ = (id) => window.document.getElementById(id);
const doc = window.document;
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fail++; console.log("  FAIL  " + label + (detail ? "   -> " + detail : "")); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = () => [...doc.querySelectorAll("#proj-output tbody tr")];
const cellText = (tr, i) => tr.children[i].textContent.replace(/\s+/g, " ").trim();
const nameOf = (tr) => tr.querySelector(".pname").textContent;
const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
// Columns: Player, Pos, Game, Pts, Pass Yds, Pass TD, Rush Yds, Rec, Rec Yds, TDs.
const COL = { pts: 3, pass_yds: 4, pass_tds: 5, rush_yds: 6, receptions: 7, rec_yds: 8, any_tds: 9 };

// Hand scoring, from the data files, the way the help text describes it.
const oa = read("oddsapi.json"), wk = read("weekly.json");
function marketLines(name) {
  // Suffixes off, as the page's normPlayerName does: Kalshi and the books spell
  // "James Cook III" both ways, and a hand score that saw only one file's
  // stats would disagree with a page that correctly joined both.
  const key = (n) => n.toLowerCase().replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/, "")
    .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const out = {};
  const w = (wk.players || []).find((p) => key(p.name) === key(name));
  const o = (oa.players || []).find((p) => key(p.name) === key(name));
  for (const src of [w, o]) {            // books override Kalshi, as in the page
    for (const [k, v] of Object.entries((src && src.stats) || {})) if (v && v.line != null) out[k] = v.line;
  }
  return out;
}
function hand(lines, fmt) {
  const g = (k) => lines[k] || 0;
  return g("pass_yds") * 0.04 + g("pass_tds") * 4 + g("rush_yds") * 0.1 + g("rec_yds") * 0.1 +
    g("any_tds") * 6 + g("receptions") * (fmt === "ppr" ? 1 : fmt === "half" ? 0.5 : 0);
}

(async () => {
  await wait(400);
  console.log("=== opens on the view from the #proj hash ===");
  check("proj view shown", !$("proj-view").classList.contains("hidden"));
  check("tab marked active", (doc.querySelector('.view-tab[data-view="proj"]') || {}).className.includes("active"));
  check("no script errors", errors.length === 0, errors.join(" | "));

  console.log("=== the table ===");
  let r = rows();
  check("rows rendered", r.length > 20, r.length + " rows");
  check("at most 100 shown before Show all", r.length <= 100, String(r.length));
  check("every row is QB, RB, WR or TE", r.every((tr) => /^(QB|RB|WR|TE)$/.test(cellText(tr, 1))));
  const ptsCol = r.map((tr) => +cellText(tr, COL.pts));
  check("sorted by points, highest first", ptsCol.every((v, i) => i === 0 || ptsCol[i - 1] >= v),
    ptsCol.slice(0, 6).join(", "));
  check("no touchdown-only players by default", !doc.querySelector("#proj-output .proj-tag"));
  check("no kicked-off game by default", !r.some((tr) => tr.className.includes("locked-row")));
  check("meta line names the format", /half PPR/.test($("proj-output").querySelector(".proj-meta").textContent));

  console.log("=== points match hand scoring, in all three formats ===");
  const sample = r.slice(0, 12).map(nameOf);
  for (const fmt of ["half", "ppr", "std"]) {
    click(doc.querySelector('.proj-fmt .chip[data-fmt="' + fmt + '"]'));
    const by = new Map(rows().map((tr) => [nameOf(tr), +cellText(tr, COL.pts)]));
    const bad = sample.filter((n) => by.has(n) && Math.abs(by.get(n) - hand(marketLines(n), fmt)) > 0.051)
      .map((n) => n + " page " + by.get(n) + " hand " + hand(marketLines(n), fmt).toFixed(2));
    check(fmt + ": the top players' points equal their lines scored by hand", bad.length === 0, bad.slice(0, 3).join("; "));
    check(fmt + ": chip pressed", doc.querySelector('.proj-fmt .chip[data-fmt="' + fmt + '"]').getAttribute("aria-pressed") === "true");
  }
  // PPR is never below half, half never below standard, for the same player.
  const p = new Map(), h = new Map(), s = new Map();
  for (const [fmt, m] of [["ppr", p], ["half", h], ["std", s]]) {
    click(doc.querySelector('.proj-fmt .chip[data-fmt="' + fmt + '"]'));
    rows().forEach((tr) => m.set(nameOf(tr), +cellText(tr, COL.pts)));
  }
  check("PPR >= half >= standard for every player", [...h.keys()].every((n) =>
    !p.has(n) || !s.has(n) || (p.get(n) >= h.get(n) - 1e-9 && h.get(n) >= s.get(n) - 1e-9)));
  click(doc.querySelector('.proj-fmt .chip[data-fmt="half"]'));

  console.log("=== stat cells ===");
  r = rows();
  const top = r[0];
  const lines = marketLines(nameOf(top));
  for (const [k, i] of Object.entries(COL)) {
    if (k === "pts") continue;
    const shown = cellText(top, i);
    if (lines[k] == null) check(nameOf(top) + " " + k + " unpriced shows a dash", shown === "–", shown);
    else check(nameOf(top) + " " + k + " is its line", Math.abs(+shown - lines[k]) < 0.051, shown + " vs " + lines[k]);
  }
  const titled = top.querySelector("td.pj-num[title]");
  check("a priced cell says where it came from", titled && /books|book:|Kalshi/.test(titled.title), titled && titled.title);

  console.log("=== position filter ===");
  click(doc.querySelector('.proj-pos .chip[data-pos="RB"]'));
  r = rows();
  check("RB only", r.length > 0 && r.every((tr) => cellText(tr, 1) === "RB"), r.length + " rows");
  click(doc.querySelector('.proj-pos .chip[data-pos="ALL"]'));

  console.log("=== search ===");
  const someone = nameOf(rows()[3]);
  const $q = $("proj-search");
  $q.value = someone.split(" ").pop().toLowerCase();
  $q.dispatchEvent(new window.Event("input", { bubbles: true }));
  r = rows();
  check("search finds " + someone, r.some((tr) => nameOf(tr) === someone), r.map(nameOf).join(", "));
  $q.value = "zzzz no such player";
  $q.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("no match says so", /No player matches/.test($("proj-output").textContent));
  $q.value = "";
  $q.dispatchEvent(new window.Event("input", { bubbles: true }));

  console.log("=== sorting by a header ===");
  click(doc.querySelector('.proj-sort[data-key="rec_yds"]'));
  r = rows();
  const ry = r.map((tr) => cellText(tr, COL.rec_yds)).filter((t) => t !== "–").map(Number);
  check("receiving yards, highest first", ry.length > 3 && ry.every((v, i) => i === 0 || ry[i - 1] >= v), ry.slice(0, 5).join(", "));
  const firstDash = r.findIndex((tr) => cellText(tr, COL.rec_yds) === "–");
  check("unpriced receiving yards sort last", firstDash === -1 ||
    r.slice(firstDash).every((tr) => cellText(tr, COL.rec_yds) === "–"));
  check("header says descending", doc.querySelector('.proj-sort[data-key="rec_yds"]').closest("th").getAttribute("aria-sort") === "descending");
  click(doc.querySelector('.proj-sort[data-key="rec_yds"]'));
  check("second click flips it", doc.querySelector('.proj-sort[data-key="rec_yds"]').closest("th").getAttribute("aria-sort") === "ascending");
  click(doc.querySelector('.proj-sort[data-key="name"]'));
  const names = rows().map(nameOf);
  check("name sorts A to Z first", names.every((n, i) => i === 0 || names[i - 1].toLowerCase().localeCompare(n.toLowerCase()) <= 0));
  click(doc.querySelector('.proj-sort[data-key="pts"]'));

  console.log("=== the two toggles ===");
  const before = rows().length;
  const $td = $("proj-tdonly");
  check("toggle shows a count", /\(\d+\)/.test($("proj-tdonly-n").textContent), $("proj-tdonly-n").textContent);
  $td.checked = true; $td.dispatchEvent(new window.Event("change", { bubbles: true }));
  const showAll = $("proj-all");
  if (showAll) click(showAll);
  const withTd = rows();
  check("TD-only players appear, tagged", withTd.some((tr) => /Only TD priced/.test(tr.textContent)));
  const tdRow = withTd.find((tr) => /Only TD priced/.test(tr.textContent));
  check("a TD-only row has dashes for every other stat", tdRow && ["pass_yds", "rush_yds", "rec_yds", "receptions"]
    .every((k) => cellText(tdRow, COL[k]) === "–"));
  $td.checked = false; $td.dispatchEvent(new window.Event("change", { bubbles: true }));
  if ($("proj-all") && /top/i.test($("proj-all").textContent)) click($("proj-all"));

  const $st = $("proj-started");
  $st.checked = true; $st.dispatchEvent(new window.Event("change", { bubbles: true }));
  if ($("proj-all") && /Show all/.test($("proj-all").textContent)) click($("proj-all"));
  const started = rows().filter((tr) => tr.className.includes("locked-row"));
  check("kicked-off game's players appear, marked", started.length > 0 && started.every((tr) => /Kicked off/.test(tr.textContent)),
    started.length + " rows from " + startedGame);
  check("rows grew", rows().length >= before);

  console.log("=== the tab switcher reaches it ===");
  click(doc.querySelector('.view-tab[data-view="spread"]'));
  check("leaving hides it", $("proj-view").classList.contains("hidden"));
  click(doc.querySelector('.view-tab[data-view="proj"]'));
  await wait(200);
  check("coming back shows it", !$("proj-view").classList.contains("hidden") && rows().length > 0);
  check("still no script errors", errors.length === 0, errors.join(" | "));

  console.log("=== an empty list says why ===");
  // Every game kicked off (Monday night): not "no player matches".
  allPast = true;
  const dom2 = new JSDOM(html, { runScripts: "outside-only", url: "https://example.test/lineup/#proj", pretendToBeVisual: true });
  dom2.window.fetch = fakeFetch;
  dom2.window.eval(appSrc);
  await wait(400);
  const out2 = dom2.window.document.getElementById("proj-output");
  check("all games kicked off: says so and names the checkbox",
    /Every game with a line has kicked off/.test(out2.textContent) && /Include games that have kicked off/.test(out2.textContent),
    out2.textContent.slice(0, 120));
  const st2 = dom2.window.document.getElementById("proj-started");
  st2.checked = true; st2.dispatchEvent(new dom2.window.Event("change", { bubbles: true }));
  check("ticking it brings the closing lines back", out2.querySelectorAll("tbody tr").length > 20);

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
