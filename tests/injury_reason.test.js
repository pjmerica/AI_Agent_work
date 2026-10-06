/* A rostered player with no betting line: hurt, or just not priced yet?
 *
 * Those are opposite instructions -- "do not start him" versus "wait and check
 * again" -- and the page used to report both as "no market projection". Sleeper
 * publishes an injury status in the same dictionary the player map is built
 * from, so the map carries it and the lookup runs exactly when a line is
 * missing.
 *
 * This checks the data carries what the feature needs, the classification is
 * right at the boundaries, and the page renders the two groups separately.
 *
 *     node tests/injury_reason.test.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { JSDOM } = require("jsdom");

const ROOT = process.env.REPO_ROOT || process.cwd();
const dataDir = path.join(ROOT, "nfl-props");

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fail++; console.log("  FAIL  " + label + (detail ? "   -> " + detail : "")); }
};

// ---- the map carries injury status ------------------------------------------
console.log("=== sleeper_players.json carries injury status ===");
const pmap = JSON.parse(
  fs.readFileSync(path.join(dataDir, "sleeper_players.json"), "utf8"));
const entries = Object.values(pmap.players);
const hurt = entries.filter((v) => v.length > 3 && v[3]);
check("map loaded", entries.length > 400, entries.length + " players");
check("some players carry a status", hurt.length > 0, hurt.length + " of " + entries.length);
check("a status is a short word, not a sentence",
  hurt.every((v) => typeof v[3] === "string" && v[3].length <= 14),
  (hurt.find((v) => v[3].length > 14) || [])[3] || "");
// The file is shipped to the browser, so its size is part of the feature.
const kb = fs.statSync(path.join(dataDir, "sleeper_players.json")).size / 1024;
check("file is still small enough to ship", kb < 60, kb.toFixed(1) + " KB");
// Three items for the healthy majority: that is what keeps it small.
const plain = entries.filter((v) => v.length === 3).length;
check("most entries stay three items", plain > entries.length * 0.5,
  plain + " of " + entries.length);

// ---- sidelined vs game-time decision ----------------------------------------
console.log("");
console.log("=== the classification ===");
const src = fs.readFileSync(path.join(ROOT, "lineup/app.js"), "utf8");
const grab = (re) => {
  const m = src.match(re);
  if (!m) throw new Error("MISSING " + String(re).slice(0, 44));
  return m[0];
};
globalThis.ARGV_LOOKUP = pmap.players;
const H = eval("(function(){" + [
  grab(/const INJURY_SIDELINED = new Set\([\s\S]*?\);/),
  grab(/const INJURY_NONE = new Set\([\s\S]*?\);/),
  grab(/function injuryFor\(pid\)[\s\S]*?\n  \}/),
  grab(/function injuryLabel\(inj\)[\s\S]*?\n  \}/),
  // LOOKUP has to be bound here or injuryFor() throws the moment anything calls
  // it. Nothing did until the "renders no injury tag" check below, so this was a
  // latent break in the harness rather than a regression.
  "const LOOKUP = ARGV_LOOKUP;",
  "function pmapEntry(pid){return LOOKUP[String(pid)]||null;}",
].join("\n") + ";return{injuryFor,injuryLabel,INJURY_SIDELINED,INJURY_NONE}})()");

// Statuses Sleeper actually publishes, split by whether the player can play.
for (const s of ["IR", "PUP", "Out", "Sus", "NA", "DNR", "COV"]) {
  check(s + " counts as sidelined", H.INJURY_SIDELINED.has(s));
}
for (const s of ["Questionable", "Doubtful"]) {
  check(s + " is NOT sidelined (still a game-time call)",
    !H.INJURY_SIDELINED.has(s));
}
check("label reads as a phrase",
  H.injuryLabel({ status: "IR", bodyPart: "Hamstring" }) === "IR (Hamstring)",
  H.injuryLabel({ status: "IR", bodyPart: "Hamstring" }));
check("label omits an empty body part",
  H.injuryLabel({ status: "Out", bodyPart: null }) === "Out",
  H.injuryLabel({ status: "Out", bodyPart: null }));
check("no injury means no label", H.injuryLabel(null) === "");

// Every status present in the data must be classified one way or the other,
// otherwise a new Sleeper code silently reads as "playable".
const seen = [...new Set(hurt.map((v) => v[3]))];
// Every code the app accounts for: out for the week, a game-time call, or an
// explicit "no designation" like Sleeper's "Active" (set on a player who was hurt
// and has since been cleared). Anything outside all three is genuinely new and
// would otherwise read as playable by default.
const KNOWN = new Set([...H.INJURY_SIDELINED, ...H.INJURY_NONE,
                       "Questionable", "Doubtful"]);
const unknown = seen.filter((s) => !KNOWN.has(s));
check("every status in the data is classified", unknown.length === 0,
  "unclassified: " + unknown.join(", "));
// "Active" means the opposite of an injury, so it must not render a chip in the
// slot where IR and Out appear. Found live: one player (Joe Mixon) carried it.
for (const benign of [...H.INJURY_NONE].filter((x) => x)) {
  const pid = Object.keys(pmap.players).find(
    (k) => (pmap.players[k] || [])[3] === benign);
  if (!pid) continue;
  check('"' + benign + '" renders no injury tag',
    H.injuryFor(pid) === null,
    "injuryFor returned " + JSON.stringify(H.injuryFor(pid)));
}
console.log("        statuses present: " + seen.sort().join(", "));

// ---- the page renders the two groups apart ----------------------------------
console.log("");
console.log("=== the page separates them ===");
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "lineup/index.html"), "utf8"), {
  runScripts: "outside-only", url: "https://x.test/lineup/", pretendToBeVisual: true,
});
const { window } = dom;
const store = {};
Object.defineProperty(window, "localStorage", { value: {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
} });
window.fetch = async (u) => {
  const str = String(u);
  if (str.startsWith("http")) {
    try {
      const r = await fetch(str);
      let b = Buffer.from(await r.arrayBuffer());
      if (b.length > 2 && b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
      const t = b.toString("utf8");
      return { ok: r.ok, status: r.status,
               json: async () => { try { return JSON.parse(t); } catch (e) { return null; } } };
    } catch (e) { return { ok: false, status: 0, json: async () => null }; }
  }
  const n = str.split("/").pop().split("?")[0];
  const f = path.join(dataDir, n);
  if (fs.existsSync(f)) {
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, "utf8")) };
  }
  return { ok: false, status: 404, json: async () => null };
};
const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
window.eval(src);
const $ = (id) => window.document.getElementById(id);

setTimeout(async () => {
  [...window.document.querySelectorAll(".view-tab")][1].click();
  await new Promise((r) => setTimeout(r, 400));
  $("sleeper-user").value = "pjmerica";
  $("sleeper-go").click();
  await new Promise((r) => setTimeout(r, 14000));

  const chips = [...$("sleeper-league-chips").querySelectorAll(".chip")];
  check("signed in", chips.length > 0, $("sleeper-status").textContent.trim());

  let sawInjured = false;
  let sawTag = false;
  let bothInOne = false;
  for (let i = 0; i < chips.length; i++) {
    [...$("sleeper-league-chips").querySelectorAll(".chip")][i].click();
    await new Promise((r) => setTimeout(r, 400));
    const heads = [...$("sleeper-output").querySelectorAll(".sitstart-section")]
      .map((e) => e.textContent.trim());
    const inj = heads.some((h) => /^Injured/i.test(h));
    const noMk = heads.some((h) => /^No market projection/i.test(h));
    if (inj) sawInjured = true;
    if (inj && noMk) bothInOne = true;
    if ($("sleeper-output").querySelector(".injury-tag")) sawTag = true;
  }
  check("at least one league shows an Injured section", sawInjured);
  check("the two reasons appear as separate sections", bothInOne,
    "no league had both at once");
  check("an injury label is rendered", sawTag);

  // An injured player must never be sitting in the generic bucket.
  const generic = [...$("sleeper-output").querySelectorAll(".sitstart-section")]
    .find((e) => /^No market projection/i.test(e.textContent));
  if (generic && generic.nextElementSibling) {
    const txt = generic.nextElementSibling.textContent;
    check("the generic bucket claims no injury", /lists no injury/i.test(txt),
      txt.slice(0, 70));
  }

  // ---- the EST tag --------------------------------------------------------
  // The stat chips carry an approx sign, but a row total looks identical whether
  // it came from a book or from a season estimate. Justin Jefferson in week 4 is
  // the case: 14.4 points of which only the touchdown was priced.
  console.log("");
  console.log("=== rows built on a projection are tagged ===");
  let sawTagged = false;
  let mismatched = [];
  const labelWrong = [];
  const labelCounts = {};
  for (let i = 0; i < chips.length; i++) {
    [...$("sleeper-league-chips").querySelectorAll(".chip")][i].click();
    await new Promise((r) => setTimeout(r, 400));
    const rows = [...$("sleeper-output").querySelectorAll("table.slot-table tbody tr")];
    for (const tr of rows) {
      const nameCell = tr.querySelector(".player-name");
      if (!nameCell) continue;
      const tagEl = nameCell.querySelector(".proj-tag");
      const tagged = !!tagEl;
      if (tagged) {
        sawTagged = true;
        const label = tagEl.textContent.trim();
        labelCounts[label] = (labelCounts[label] || 0) + 1;
        // "TD ONLY" claims the touchdown is the single priced stat. The chips on
        // the row say which stats came from a market, so they can check it.
        const chips = [...tr.querySelectorAll(".market-chip")];
        const marketChips = chips.filter((c) => !c.classList.contains("src-proj"));
        const labels = marketChips
          .map((c) => (c.querySelector(".mk-label") || {}).textContent || "")
          .map((x) => x.trim());
        const onlyTd = labels.length === 1 && /td/i.test(labels[0]);
        if (label === "TD ONLY" && labels.length && !onlyTd) {
          labelWrong.push(nameCell.textContent.trim().slice(0, 24) +
            " priced: " + labels.join("/"));
        }
        if (label === "EST" && onlyTd) {
          labelWrong.push(nameCell.textContent.trim().slice(0, 24) +
            " should read TD ONLY");
        }
      }
      // Any tagged row must also show at least one projected chip, and vice
      // versa -- the row tag and the chips are derived separately, so they can
      // disagree.
      const hasProjChip = !!tr.querySelector(".market-chip.src-proj");
      const hasAnyChip = !!tr.querySelector(".market-chip");
      if (hasAnyChip && tagged !== hasProjChip) {
        mismatched.push(nameCell.textContent.trim().slice(0, 28) +
          " tag=" + tagged + " chip=" + hasProjChip);
      }
    }
  }
  check("at least one row carries the tag", sawTagged);
  check("the row tag agrees with the chips on every row",
    mismatched.length === 0, mismatched.slice(0, 3).join(" | "));
  check('"TD ONLY" is only used where a TD really is the only priced stat',
    labelWrong.length === 0, labelWrong.slice(0, 3).join(" | "));
  console.log("        labels seen: " +
    (Object.keys(labelCounts).length
      ? Object.entries(labelCounts).map(([k, v]) => k + " x" + v).join(", ")
      : "none"));

  console.log("");
  console.log("uncaught errors: " + errors.length);
  errors.slice(0, 4).forEach((e) => console.log("   " + e));
  console.log("");
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail || errors.length ? 1 : 0);
}, 1500);
