/**
 * No source file may contain stray control characters.
 *
 * This exists because of a bug that cost a lot of time twice in one session. A
 * regex written through a shell heredoc came out as:
 *
 *     const ordinal = /\x08next\x08|\x08which of these\x08|.../;
 *
 * Those are literal 0x08 BACKSPACE bytes, not `\b` word boundaries: the shell
 * interpreted the backslash-b before the text ever reached the file. The result is
 * a regex that matches only strings containing control characters, so it silently
 * matches nothing -- and the arbitrage board carried an unreachable check for a
 * day as a result.
 *
 * It is unusually hard to spot. The file opens normally in an editor, `grep -c`
 * finds the line, `node --check` passes, the surrounding logic reads correctly, and
 * the only symptom is a condition that never fires. The same mistake had already
 * produced `/Ward\b/` -> `/Ward\x08/` and `/<div\b/` -> `/<div\x08/` earlier.
 *
 * Tab, newline and carriage return are allowed; everything else in the C0 range is
 * not. Checks the bytes on disk rather than anything parsed, because the whole
 * point is that parsing succeeds.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.REPO_ROOT || process.cwd();
const EXTS = new Set([".js", ".py", ".css", ".html", ".json", ".yml", ".yaml", ".md"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "digests"]);

// Allowed: \t (9), \n (10), \r (13).
const ALLOWED = new Set([9, 10, 13]);
const NAMES = {
  0: "NUL", 7: "BEL", 8: "BACKSPACE", 11: "VT", 12: "FORM FEED",
  26: "SUB", 27: "ESC", 127: "DEL",
};

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log("  FAIL  " + label + (detail ? "\n        " + detail : "")); }
};

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") && e.name !== ".github") continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, acc);
    else if (EXTS.has(path.extname(e.name))) acc.push(f);
  }
  return acc;
}

const files = walk(ROOT);
check("found source files to scan", files.length > 10, String(files.length));

let scanned = 0;
for (const f of files) {
  const buf = fs.readFileSync(f);
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  scanned++;
  const hits = [];
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if ((c < 32 || c === 127) && !ALLOWED.has(c)) {
      // Report the line number, which is what a human needs to go fix it.
      let line = 1;
      for (let j = 0; j < i; j++) if (buf[j] === 10) line++;
      hits.push(`line ${line}: ${NAMES[c] || "0x" + c.toString(16)} (0x${c.toString(16)})`);
      if (hits.length >= 3) break;
    }
  }
  check(`${rel} has no stray control characters`, hits.length === 0,
        hits.join("\n        ") +
        (hits.length ? "\n        A `\\b` written through a shell heredoc becomes a " +
                       "literal backspace; the regex then matches nothing." : ""));
}

console.log(`\n${scanned} file(s) scanned`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
