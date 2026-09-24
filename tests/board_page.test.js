/* Every tab on the nfl-props board renders without error.
 *
 * Nine tabs, several of which had never been exercised by anything. This walks
 * them in order, checks each panel becomes visible and produces rows, and
 * verifies the week labels are stamped from the data rather than left at the
 * markup's hardcoded "Week 1".
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = process.env.REPO_ROOT || process.cwd();
const html = fs.readFileSync(path.join(ROOT, "nfl-props/index.html"), "utf8");
const appSrc = fs.readFileSync(path.join(ROOT, "nfl-props/app.js"), "utf8");
const dataDir = path.join(ROOT, "nfl-props");

const dom = new JSDOM(html, {
  runScripts: "outside-only",
  url: "https://example.test/nfl-props/",
  pretendToBeVisual: true,
});
const { window } = dom;
window.fetch = async (u) => {
  const name = String(u).split("/").pop().split("?")[0];
  const file = path.join(dataDir, name);
  if (fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ok: true, status: 200, json: async () => j };
  }
  return { ok: false, status: 404, json: async () => null };
};

const errors = [];
window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
window.eval(appSrc);

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fail++; console.log("  FAIL  " + label + (detail ? "   -> " + detail : "")); }
};

// Panel ids do not all follow the data-view name.
const PANEL = {
  rankings: "table-view", viz: "viz-view", vegas: "vegas-view",
  market: "market-view", weekly: "weekly-view", multi: "multi-view",
  sitstart: "sitstart-view", h2h: "h2h-view", sleeper: "sleeper-view",
};
// Tabs that render a table from data, as opposed to waiting for user input.
const DATA_TABS = ["rankings", "vegas", "market", "weekly", "multi"];

setTimeout(async () => {
  const wk = JSON.parse(fs.readFileSync(path.join(dataDir, "weekly.json"), "utf8"));

  console.log("=== week labels come from the data ===");
  const $tab = window.document.querySelector("[data-week-label]");
  check("tab button reads the real week",
    $tab && $tab.textContent === "Week " + wk.week,
    $tab ? JSON.stringify($tab.textContent) : "(no [data-week-label])");
  const spans = [...window.document.querySelectorAll("[data-week-name]")];
  check("callout spans read the real week",
    spans.length > 0 && spans.every((e) => e.textContent === "Week " + wk.week),
    spans.map((e) => e.textContent).join(", "));

  console.log("");
  console.log("=== every tab renders ===");
  const tabs = [...window.document.querySelectorAll(".view-tab")];
  check("nine tabs", tabs.length === 9, tabs.length + "");
  for (const t of tabs) {
    const view = t.dataset.view;
    t.click();
    await new Promise((r) => setTimeout(r, 600));
    const panel = window.document.getElementById(PANEL[view]);
    const visible = panel && !panel.classList.contains("hidden");
    check(view + ": panel visible", !!visible);
    if (DATA_TABS.includes(view)) {
      const rows = panel ? panel.querySelectorAll("table tbody tr").length : 0;
      check(view + ": rows rendered", rows > 0, rows + " rows");
    }
  }

  console.log("");
  console.log("uncaught errors: " + errors.length);
  errors.slice(0, 6).forEach((e) => console.log("   " + e));
  console.log("");
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail || errors.length ? 1 : 0);
}, 1500);
