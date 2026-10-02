/**
 * Every text colour must meet WCAG AA contrast against its background.
 *
 * The pages had settled on #6a6a8a for almost all secondary text -- column
 * headers, captions, chip labels, footers, bench rows. It measures 3.32:1 against
 * the card background, below the 4.5:1 AA floor for normal text, so the labels
 * naming the data were the hardest thing on the page to read. 67 declarations were
 * under the floor; this keeps them from drifting back.
 *
 * It parses the stylesheets rather than measuring the rendered page, which means it
 * needs no browser and runs in the normal suite. The tradeoff is that it assumes
 * each file's dominant background rather than resolving the real ancestor, so it
 * uses the DARKEST plausible background per file -- the most forgiving choice, so a
 * pass here is never a false pass.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.REPO_ROOT || process.cwd();
let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
};

// Darkest background each page actually paints, so ratios are not flattered.
const PAGES = [
  ["lineup/style.css", "#14141c"],
  ["nfl-props/style.css", "#14141c"],
  ["books/style.css", "#14141c"],
];

// Colours that are deliberately low-contrast, with the reason. Each is a
// considered decision, not an oversight.
const ALLOWED = new Map([
  // The brand purple. Used for links, the active tab, carets and .proj. Changing
  // it would change the identity of the pages, which is the owner's call.
  ["#5b4cf5", "brand accent colour"],
  // The "no data" dash. It is meant to recede: brightening it would make absent
  // data compete with present data.
  ["#3a3a55", "intentionally faint 'no data' placeholder"],
]);

function lum(hex) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Strip comments so a hex mentioned in prose is never treated as a declaration.
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

let checked = 0;
for (const [rel, bg] of PAGES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { check(rel + " exists", false, "missing"); continue; }
  const css = decomment(fs.readFileSync(file, "utf8"));

  for (const m of css.matchAll(/(?:^|\})([^{}]*)\{([^}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s+/g, " ");
    const body = m[2];
    // `color:` only -- not background-color, border-color, outline-color.
    for (const cm of body.matchAll(/(?:^|[;\s])color:\s*(#[0-9a-fA-F]{6})/g)) {
      const hex = cm[1].toLowerCase();
      if (ALLOWED.has(hex)) continue;
      const r = ratio(hex, bg);
      if (r === null) continue;
      checked++;
      // AA allows 3:1 for large text (>=18.66px bold, or >=24px).
      const fsM = body.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
      const size = fsM ? parseFloat(fsM[1]) : null;
      const boldM = body.match(/font-weight:\s*(\d+|bold)/);
      const bold = boldM ? (boldM[1] === "bold" || Number(boldM[1]) >= 700) : false;
      const large = size !== null && (size >= 24 || (size >= 18.66 && bold));
      const floor = large ? 3.0 : 4.5;
      check(`${rel} ${sel || "(rule)"} ${hex}`, r >= floor,
            `${r.toFixed(2)}:1 vs ${bg}, needs ${floor}:1${size ? ` at ${size}px` : ""}`);
    }
  }
}

check("found colours to check", checked > 20, String(checked));

console.log(`\n${checked} text colour declaration(s) checked`);
console.log(`${pass} passed, ${fail} failed`);
if (!fail) console.log("all text meets WCAG AA for its size");
process.exit(fail ? 1 : 0);
