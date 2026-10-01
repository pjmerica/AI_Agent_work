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
const H = eval("(function(){" + [
  grab(/const INJURY_SIDELINED = new Set\([\s\S]*?\);/),
  grab(/function injuryFor\(pid\)[\s\S]*?\n  \}/),
  grab(/function injuryLabel\(inj\)[\s\S]*?\n  \}/),
  "function pmapEntry(pid){return LOOKUP[String(pid)]||null;}",
].join("\n") + ";return{injuryFor,injuryLabel,INJURY_SIDELINED}})()");

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
const KNOWN = new Set([...H.INJURY_SIDELINED, "Questionable", "Doubtful"]);
const unknown = seen.filter((s) => !KNOWN.has(s));
check("every status in the data is classified", unknown.length === 0,
  "unclassified: " + unknown.join(", "));
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

  console.log("");
  console.log("uncaught errors: " + errors.length);
  errors.slice(0, 4).forEach((e) => console.log("   " + e));
  console.log("");
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail || errors.length ? 1 : 0);
}, 1500);
