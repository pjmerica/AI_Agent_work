#!/usr/bin/env node
/**
 * Run every test suite and exit non-zero if any of them fail.
 *
 * Why this exists: the suites are plain node scripts, so without a runner the
 * only way to check them all was to remember the list and read 14 outputs. Worse,
 * a suite that CRASHED on startup (a missing module, a syntax error) looked
 * roughly like one that ran -- which is how every jsdom suite in this repo sat
 * broken while appearing to pass. A crash is distinguished from a failure here
 * and both are fatal.
 *
 *   node tests/run_all.js             all suites
 *   node tests/run_all.js --offline   skip the ones that need the network
 *
 * Needs `npm install` first, for jsdom.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TESTS_DIR = __dirname;
const ROOT = path.resolve(TESTS_DIR, "..");
const offline = process.argv.includes("--offline");

// These reach the live Sleeper / Pages endpoints.
const NETWORK = new Set(["live_smoke.test.js"]);

// Needs real Chrome, which not every machine has, and is slow because it launches
// a browser per page per width. CI runs it as its own step with Chrome installed,
// so --offline leaves it out here.
const NEEDS_BROWSER = new Set(["mobile_layout.test.js"]);

// Fail loudly and early rather than letting 10 suites each crash with the same
// unhelpful stack.
try {
  require.resolve("jsdom");
} catch {
  console.error(
    "jsdom is not installed. Run `npm install` in " + ROOT + " first.\n" +
    "(Most suites parse the real page markup with jsdom; without it they cannot run.)"
  );
  process.exit(1);
}

const suites = fs.readdirSync(TESTS_DIR)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

const pyTests = fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith(".test.py")).sort();

let failed = [], crashed = [], skipped = [], passed = 0;

for (const f of suites) {
  // Browser suites are always skipped here and run as their own CI step. They
  // launch a browser per page per width, and sharing a process tree with the
  // other suites made them contend for ports and CPU -- which surfaced as empty
  // page captures, i.e. a flaky failure that looks like a real layout bug.
  if (NEEDS_BROWSER.has(f)) { skipped.push(f); continue; }
  if (offline && NETWORK.has(f)) { skipped.push(f); continue; }
  process.stdout.write(`\n=== ${f} ===\n`);
  try {
    const out = execFileSync(process.execPath, [path.join(TESTS_DIR, f)], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, REPO_ROOT: ROOT },
      timeout: 300000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Only show the tail; a passing suite's per-check lines are noise here.
    const lines = out.trimEnd().split("\n");
    console.log(lines.slice(-3).join("\n"));
    passed++;
  } catch (e) {
    const out = (e.stdout || "") + (e.stderr || "");
    console.log(out.trimEnd().split("\n").slice(-12).join("\n"));
    // A non-zero exit with recognisable test output is a failure; anything else
    // (module not found, syntax error, timeout) is a crash, which is worse
    // because it means the suite never actually checked anything.
    if (/\bfail(ed)?\b/i.test(out) && !/MODULE_NOT_FOUND|SyntaxError|ReferenceError: \w+ is not defined/.test(out)) {
      failed.push(f);
    } else {
      crashed.push(f);
    }
  }
}

// `py` is the Windows launcher and does not exist on a Linux CI runner; `python3`
// is absent on a stock Windows box. Try the platform's likely names in order.
const PY_EXES = process.platform === "win32" ? ["py", "python"] : ["python3", "python"];

for (const f of pyTests) {
  process.stdout.write(`\n=== ${f} ===\n`);
  let out = null, lastErr = null;
  for (const exe of PY_EXES) {
    try {
      out = execFileSync(exe, [path.join(TESTS_DIR, f)], {
        cwd: ROOT, encoding: "utf8", timeout: 300000, stdio: ["ignore", "pipe", "pipe"],
      });
      break;
    } catch (e) {
      lastErr = e;
      // Decide whether this interpreter actually RAN the file. ENOENT is the
      // obvious "not installed", but Windows also ships python/python3 as App
      // Store stubs that exist and exit non-zero with no ENOENT and no output,
      // so an ENOENT-only check stops on a stub and reports a false crash.
      // If we got real output from the script, it ran and genuinely failed.
      const got = (e.stdout || "") + (e.stderr || "");
      const ran = got.trim().length > 0 && !/Python( was)? not found|Microsoft Store/i.test(got);
      if (ran) break;
    }
  }
  if (out === null) {
    const e = lastErr || {};
    const msg = (e.stdout || "") + (e.stderr || "");
    console.log((msg || "no python interpreter found (tried " + PY_EXES.join(", ") + ")")
                .trimEnd().split("\n").slice(-10).join("\n"));
    crashed.push(f);
  } else {
    console.log(out.trimEnd().split("\n").slice(-3).join("\n"));
    passed++;
  }
}

console.log("\n" + "=".repeat(60));
console.log(`${passed} suite(s) passed`);
if (skipped.length) console.log(`${skipped.length} skipped (network/browser): ${skipped.join(", ")}`);
if (failed.length)  console.log(`${failed.length} FAILED: ${failed.join(", ")}`);
if (crashed.length) console.log(`${crashed.length} CRASHED (never ran any check): ${crashed.join(", ")}`);
process.exit(failed.length + crashed.length ? 1 : 0);
