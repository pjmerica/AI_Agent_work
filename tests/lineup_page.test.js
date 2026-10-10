/* End-to-end test of lineup/index.html in a real DOM.
 *
 * The previous smoke test used a Proxy stub for document, which happily
 * swallowed every getElementById and so reported "no ReferenceError" on a page
 * whose buttons were not connected to anything. jsdom parses the actual markup,
 * so a missing listener shows up as a click that changes nothing.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = process.env.REPO_ROOT || process.cwd();
const html = fs.readFileSync(path.join(ROOT, "lineup/index.html"), "utf8");
const appSrc = fs.readFileSync(path.join(ROOT, "lineup/app.js"), "utf8");

// Serve ../nfl-props/*.json off disk instead of over the network.
const dataDir = path.join(ROOT, "nfl-props");
function fakeFetch(url) {
  const name = String(url).split("/").pop().split("?")[0];
  const file = path.join(dataDir, name);
  if (fs.existsSync(file)) {
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, "utf8"))),
    });
  }
  // Sleeper and anything else: not exercised here.
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
}

const dom = new JSDOM(html, {
  runScripts: "outside-only",
  url: "https://example.test/lineup/",
  pretendToBeVisual: true,
});
const { window } = dom;
window.fetch = fakeFetch;

const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));

// Run the app against that DOM.
try {
  window.eval(appSrc);
} catch (e) {
  console.log("FATAL on load: " + e.constructor.name + ": " + e.message);
  process.exit(1);
}

const $ = (id) => window.document.getElementById(id);
const txt = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "(missing)");
let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fail++; console.log("  FAIL  " + label + (detail ? "   -> " + detail : "")); }
}

setTimeout(() => {
  console.log("=== elements present ===");
  for (const id of ["roster-search", "roster-suggestions", "roster-tags",
                    "roster-demo", "roster-clear", "roster-go", "roster-input",
                    "book-toggle-list", "books-all", "sitstart-output",
                    "sleeper-user", "sleeper-go", "sleeper-books-all",
                    "sleeper-output", "rooting-output", "view-tabs"]) {
    check(id, !!$(id));
  }

  console.log("");
  console.log("=== book toggles rendered from data ===");
  const books = $("book-toggle-list");
  const boxes = books ? books.querySelectorAll("input[type=checkbox]") : [];
  check("book checkboxes exist", boxes.length > 0, boxes.length + " found");

  console.log("");
  console.log("=== Load example populates the roster ===");
  $("roster-demo").click();
  const tags = $("roster-tags").querySelectorAll(".player-tag");
  check("demo added player chips", tags.length > 0, tags.length + " chips");
  const out1 = txt($("sitstart-output"));
  check("output is a lineup, not the empty state",
    !/Add players to build/.test(out1) && /QB|Projected/.test(out1),
    out1.slice(0, 90));

  console.log("");
  console.log("=== Clear empties it again ===");
  $("roster-clear").click();
  check("chips gone", $("roster-tags").querySelectorAll(".player-tag").length === 0);
  check("output back to empty state", /Add players to build a lineup/.test(txt($("sitstart-output"))),
    txt($("sitstart-output")).slice(0, 70));

  console.log("");
  console.log("=== typing shows suggestions, Enter adds the top hit ===");
  const $in = $("roster-search");
  // Pick a prefix from a player the board actually loaded this week, rather than
  // hardcoding a name. "lamb" used to be hardcoded here and broke the moment
  // Dallas hit its bye: Lamb was in neither weekly.json nor oddsapi.json, so the
  // test failed for reasons that said nothing about the search code. Bijan
  // Robinson, Cam Ward and Trey McBride rotted the same way earlier.
  const pool = window.__testPool
    ? window.__testPool()
    : (() => {
        // Fall back to reading the loaded market data the page already holds.
        const wk = JSON.parse(fs.readFileSync(
          path.join(ROOT, "nfl-props/weekly.json"), "utf8"));
        return (wk.players || []).map((x) => x.name);
      })();
  check("there are players loaded to search", pool.length > 20, pool.length + " players");
  // A surname long enough to be a meaningful prefix, from a player on the slate.
  const sample = pool.find((n) => (n.split(" ").pop() || "").length >= 5)
    || pool[0] || "";
  const needle = (sample.split(" ").pop() || sample).slice(0, 4).toLowerCase();
  $in.value = needle;
  $in.dispatchEvent(new window.Event("input", { bubbles: true }));
  const sugg = $("roster-suggestions");
  const items = sugg.querySelectorAll("[data-key]");
  check("suggestions appeared", items.length > 0,
    items.length + ` items for "${needle}" (from "${sample}")`);
  check("suggestion list is visible", sugg.style.display !== "none", sugg.style.display);
  const first = items.length ? items[0].textContent.trim() : "";
  const ev = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true });
  $in.dispatchEvent(ev);
  const after = $("roster-tags").querySelectorAll(".player-tag");
  check("Enter added a chip", after.length === 1,
    after.length + " chips, first suggestion was " + first);
  check("search box cleared", $in.value === "", JSON.stringify($in.value));

  console.log("");
  console.log("=== arrow keys move the highlight ===");
  $in.value = "j";
  $in.dispatchEvent(new window.Event("input", { bubbles: true }));
  $in.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  $in.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  const active = $("roster-suggestions").querySelectorAll(".active");
  check("an item is highlighted", active.length === 1, active.length + " active");

  console.log("");
  console.log("=== paste path ===");
  // Take the names from the current board rather than hardcoding them. A player
  // whose game has finished is purged from every market source, so a fixed list
  // rots the moment that week's first game settles -- this check failed on the
  // Saturday after Bijan Robinson played on Thursday, which said nothing about
  // the paste path.
  // Names come from the search suggestions, which draw on the whole board --
  // reading the lineup table instead only sees whoever is already added.
  function suggest(prefix) {
    const $s = $("roster-search");
    $s.value = prefix;
    $s.dispatchEvent(new window.Event("input", { bubbles: true }));
    return [...$("roster-suggestions").querySelectorAll("[data-key]")]
      .map((d) => {
        // Own text only: the badge and the points are child spans.
        let name = "";
        for (const node of d.childNodes) {
          if (node.nodeType === 3) name += node.textContent;
        }
        return name.trim();
      })
      .filter(Boolean);
  }
  const twoReal = [...new Set([...suggest("a"), ...suggest("e")])].slice(0, 2);
  $("roster-search").value = "";
  $("roster-search").dispatchEvent(new window.Event("input", { bubbles: true }));
  check("found two board players to paste", twoReal.length === 2,
    twoReal.join(", "));
  const NL = String.fromCharCode(10);
  $("roster-clear").click();
  $("roster-input").value = twoReal.join(NL) + NL + "Not A Real Person";
  $("roster-go").click();
  const pasted = $("roster-tags").querySelectorAll(".player-tag");
  check("pasted names became chips", pasted.length === twoReal.length,
    pasted.length + " chips from " + twoReal.join(", "));
  check("unmatched line left in the box",
    /Not A Real Person/.test($("roster-input").value),
    JSON.stringify($("roster-input").value));

  console.log("");
  console.log("=== book filter reacts ===");
  // Use the demo roster: a two-player paste may have no line from the one book
  // being unticked, in which case nothing changing is correct.
  $("roster-demo").click();
  const liveBoxes = [...$("book-toggle-list").querySelectorAll("input[data-book]")];
  check("toggles rendered", liveBoxes.length > 0, liveBoxes.length + " books");
  if (liveBoxes.length) {
    const before = txt($("sitstart-output"));
    // Re-query after every change: renderBookToggles rewrites the container's
    // innerHTML, so any reference held across a change event is detached.
    for (let i = 1; i < liveBoxes.length; i++) {
      const cur = [...$("book-toggle-list").querySelectorAll("input[data-book]")];
      const box = cur[i];
      if (!box) break;
      box.checked = false;
      box.dispatchEvent(new window.Event("change", { bubbles: true }));
    }
    const narrowed = txt($("sitstart-output"));
    check("narrowing to one book changed the lineup", narrowed !== before,
      "same text both ways");
    $("books-all").click();
    check("'all' link restored the full board",
      txt($("sitstart-output")) === before, "did not match original");
  }

  console.log("");
  console.log("=== tab switching ===");
  const tabs = $("view-tabs").querySelectorAll(".view-tab");
  check("three tabs", tabs.length === 3, tabs.length + "");
  tabs[2].click();
  check("rooting view shown", !$("rooting-view").classList.contains("hidden"));
  check("sitstart view hidden", $("sitstart-view").classList.contains("hidden"));
  tabs[0].click();
  check("back to sitstart", !$("sitstart-view").classList.contains("hidden"));

  console.log("");
  console.log("=== unticking the last book stays unticked ===");
  // An empty activeBooks meant "no filter", so clearing the last checkbox was
  // indistinguishable from clearing none: every box redrew ticked and the
  // numbers jumped back to the full consensus -- the opposite of the click.
  $("roster-demo").click();
  const bx = () => [...$("book-toggle-list").querySelectorAll("input[data-book]")];
  for (let i = 0; i < 20; i++) {
    const on = bx().find((b) => b.checked);
    if (!on) break;
    on.checked = false;
    on.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  check("no book is left ticked", bx().every((b) => !b.checked),
    bx().filter((b) => b.checked).length + " still on");
  const offTxt = txt($("sitstart-output"));
  check("it says why rather than showing an empty lineup",
    /No books selected/i.test(offTxt), offTxt.slice(0, 80));
  check("no stray NaN", !/NaN/.test(offTxt));
  $("books-all").click();
  check("'all' brings every book back", bx().every((b) => b.checked));
  check("and the board returns", !!$("sitstart-output").querySelector("table"));

  console.log("");
  console.log("=== every chip class the app emits is actually styled ===");
  // The K/DEF chips shipped with class "stat-chip", which appears nowhere in
  // the stylesheet, so they rendered as unstyled text with no spacing and ran
  // together: "opp 20.0sk 2.5to 1.2". Nothing caught it, because the markup was
  // present and the numbers were right.
  const css = fs.readFileSync(path.join(ROOT, "lineup/style.css"), "utf8");
  const appTxt = fs.readFileSync(path.join(ROOT, "lineup/app.js"), "utf8");
  const emitted = new Set();
  for (const m of appTxt.matchAll(/class="([a-z0-9 _-]+)"/gi)) {
    for (const c of m[1].trim().split(/\s+/)) {
      if (c) emitted.add(c);
    }
  }
  // Classes the app only reads or toggles, or that come from shared markup.
  const IGNORE = new Set(["hidden", "active", "chip", "view-tab"]);
  const unstyled = [...emitted].filter((c) =>
    !IGNORE.has(c) && !css.includes("." + c));
  check("no chip/element class is missing from the stylesheet",
    unstyled.length === 0, unstyled.join(", "));

  console.log("");
  console.log("=== help sections ===");
  const helps = window.document.querySelectorAll("details.help");
  check("collapsible help blocks", helps.length === 3, helps.length + "");

  console.log("");
  console.log("uncaught page errors: " + errors.length);
  errors.slice(0, 5).forEach((e) => console.log("   " + e));
  console.log("");
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail || errors.length ? 1 : 0);
}, 1200);
