/* Lineup — Sleeper start/sit and waiver calls priced off the betting markets.
 *
 * Split out of the nfl-props draft board on 2026-09-20. That page answers a
 * preseason question (who to draft); this one answers a weekly question (who to
 * start), and the two had no reason to share a bundle: this ships 45 KB instead
 * of 147 KB and cannot be broken by an edit to the tier charts or ADP tables.
 *
 * The board itself keeps its own copies of these tabs, so nothing was removed
 * there. Data files are read from ../nfl-props/, which the scraper workflow
 * already refreshes -- there is one source of truth, not a second copy to drift.
 */
(function () {
  // Shared data cache, keyed by the file each view needs.
  const cache = {};

  const DATA_DIR = "../nfl-props/";

  async function fetchJson(file) {
    const res = await fetch(DATA_DIR + file + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // The board's global scoring toggle does not exist here; both views are
  // fixed-format (Start/Sit is half-PPR, My Leagues uses each league's own
  // settings), so this is only read by shared helpers that expect it.
  const fmt = "half";
  let search = "";

  // Roster picker state. Declared up here with the other shared state because
  // renderSitStart reads it, and a `const` further down leaves it in the
  // temporal dead zone for any synchronous caller.
  const rosterSelected = new Set();
  let suggIndex = -1;

  const activeBooks = new Set();

  const BOOK_LABEL = {
    draftkings: "DraftKings",
    fanduel: "FanDuel",
    bovada: "Bovada",
    betrivers: "BetRivers",
    betonlineag: "BetOnline",
    betmgm: "BetMGM",
    fanatics: "Fanatics",
    espnbet: "ESPN BET",
    hardrockbet: "Hard Rock",
    williamhill_us: "Caesars",
    pointsbetus: "PointsBet",
  };

  const NONBOOK_SOURCES = { kalshi: "Kalshi", "dk-td": "DraftKings TD" };

  const KALSHI_METHODS = new Set(
    ["interpolated", "fitted", "assumed-sigma", "expected", "sigma", "fit", "kalshi"]);

  const FIRST_NAME_ALIASES = {
    "ken": "kenneth",
    "kenny": "kenneth",
    "mike": "michael",
    "matt": "matthew",
    "nick": "nicholas",
    "chris": "christopher",
    "tony": "anthony",
    "rob": "robert",
    "bob": "robert",
    "dan": "daniel",
    "danny": "daniel",
    "joe": "joseph",
    "tom": "thomas",
    "will": "william",
    "billy": "william",
    "bill": "william",
    "ben": "benjamin",
    "alex": "alexander",
    "jon": "jonathan",
    "tj": "t j",
    "dj": "d j",
    "aj": "a j",
    "cj": "c j",
    "jk": "j k",
    "dk": "d k",
  };

  const FULL_NAME_ALIASES = {
    "cam skattebo": "cameron skattebo",
    "quishon judkins": "quinshon judkins",
  };

  const STAT_LABELS = {
    pass_yds: "Pass Yds",
    pass_tds: "Pass TDs",
    rush_yds: "Rush Yds",
    rush_tds: "Rush TDs",
    rec_yds:  "Rec Yds",
    receptions: "Rec",
    rec_tds:  "Rec TDs",
    any_tds:  "xTD",
  };

  const WEEKLY_SOURCE_LABEL = {
    interpolated: "Kalshi ladder — interpolated 50% strike",
    fitted: "Fitted estimate — ladder never crosses 50%",
    expected: "Expected count — sum of P(X ≥ k) across the ladder",
    books: "Sportsbook consensus — median across books",
    "dk-td": "DraftKings anytime-TD price, de-vigged (P of 1+, so slightly low)",
  };

  const LINEUP_SLOTS = [
    { key: "QB", label: "QB", accepts: ["QB"] },
    { key: "RB1", label: "RB", accepts: ["RB"] },
    { key: "RB2", label: "RB", accepts: ["RB"] },
    { key: "WR1", label: "WR", accepts: ["WR"] },
    { key: "WR2", label: "WR", accepts: ["WR"] },
    { key: "TE", label: "TE", accepts: ["TE"] },
    { key: "FLEX1", label: "FLEX", accepts: ["RB", "WR", "TE"] },
    { key: "FLEX2", label: "FLEX", accepts: ["RB", "WR", "TE"] },
  ];

  const SLOT_ACCEPTS = {
    QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"],
    FLEX: ["RB", "WR", "TE"],
    WRRB_FLEX: ["RB", "WR"],
    REC_FLEX: ["WR", "TE"],
    SUPER_FLEX: ["QB", "RB", "WR", "TE"],
    K: ["K"], DEF: ["DEF"], DST: ["DEF"],
  };

  const activeMarkets = new Set(
    ["receptions", "rec_yds", "rush_yds", "pass_yds", "pass_tds", "any_tds"]);

  const SLEEPER_API = "https://api.sleeper.app/v1";

  const SLEEPER_LS_KEY = "nflprops.sleeperUser";

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  }

  function normPlayerName(s) {
    if (!s) return "";
    let out = s.toLowerCase();
    out = out.replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "");
    out = out.replace(/[^a-z0-9 ]/g, " ");
    out = out.replace(/\s+/g, " ").trim();
    // Canonicalize the first token if it's a known nickname
    const parts = out.split(" ");
    if (parts.length >= 2 && FIRST_NAME_ALIASES[parts[0]]) {
      parts[0] = FIRST_NAME_ALIASES[parts[0]];
      out = parts.join(" ");
    }
    return FULL_NAME_ALIASES[out] || out;
  }

  function altPlayerKey(s) {
    const n = normPlayerName(s);
    if (!n) return "";
    const parts = n.split(" ");
    if (parts.length < 2) return n;
    return parts[0][0] + " " + parts[parts.length - 1];
  }

  function buildProjLookup(data) {
    const byKey = new Map();
    const byAlt = new Map();
    if (!data || !Array.isArray(data.players)) return { byKey, byAlt };
    for (const p of data.players) {
      const k = normPlayerName(p.name);
      const a = altPlayerKey(p.name);
      if (k && !byKey.has(k)) byKey.set(k, p);
      if (a && !byAlt.has(a)) byAlt.set(a, p);
    }
    return { byKey, byAlt };
  }

  function lookupProj(lut, name) {
    return lut.byKey.get(normPlayerName(name)) || lut.byAlt.get(altPlayerKey(name)) || null;
  }

  function lineUnderFilter(stat) {
    if (!stat || stat.line == null) return null;
    if (!activeBooks.size) return stat.line;
    // Detect a multi-book stat by the presence of quotes rather than by
    // lineSource, which is added during the merge and absent on raw feed data.
    const quotes = stat.quotes || [];
    if (!quotes.length) {
      // Single-source stats are in or out wholesale. Kalshi records its
      // lineSource as the METHOD used to read its ladder -- interpolated,
      // fitted, assumed-sigma, expected -- not as the venue, so those all map
      // back to the one pseudo-book the checkbox offers.
      const venue = KALSHI_METHODS.has(stat.lineSource) ? "kalshi" : stat.lineSource;
      return activeBooks.has(venue) ? stat.line : null;
    }
    const kept = quotes.filter((q) => activeBooks.has(q.book));
    if (!kept.length) return null;
    const lines = kept.map((q) => q.line).sort((x, y) => x - y);
    const mid = lines.length % 2
      ? lines[(lines.length - 1) / 2]
      : (lines[lines.length / 2 - 1] + lines[lines.length / 2]) / 2;
    return Math.round(mid * 100) / 100;
  }

  function weeklyPoints(stats, format) {
    const g = (k) => {
      const s = stats[k];
      return s && s.line != null ? s.line : 0;
    };
    let pts = 0;
    pts += g("pass_yds") * 0.04;
    pts += g("pass_tds") * 4;
    pts += g("rush_yds") * 0.1;
    pts += g("rec_yds") * 0.1;
    // any_tds is an EXPECTED count of rushing+receiving TDs, both worth 6.
    // Kalshi posts no split per-game rush/rec TD market, so this single number
    // carries all non-passing scoring. Passing TDs are separate and already
    // counted above, so there is no double count for a QB.
    pts += g("any_tds") * 6;
    if (format === "ppr") pts += g("receptions") * 1.0;
    else if (format === "half") pts += g("receptions") * 0.5;
    return Math.round(pts * 100) / 100;
  }

  function sitStartPoints(stats, format) {
    const g = (k) => {
      if (!activeMarkets.has(k)) return 0;
      const v = lineUnderFilter(stats[k]);
      return v == null ? 0 : v;
    };
    let pts = 0;
    pts += g("pass_yds") * 0.04;
    pts += g("pass_tds") * 4;
    pts += g("rush_yds") * 0.1;
    pts += g("rec_yds") * 0.1;
    pts += g("any_tds") * 6;
    if (format === "ppr") pts += g("receptions") * 1.0;
    else if (format === "half") pts += g("receptions") * 0.5;
    return Math.round(pts * 100) / 100;
  }

  function leaguePoints(stats, scoring, position) {
    // Same book filter Start/Sit uses, so a book unticked on either tab means
    // the same thing: re-derive the line from only the books still selected.
    const g = (k) => {
      const v = lineUnderFilter(stats[k]);
      return v == null ? 0 : v;
    };
    let pts = 0;
    pts += g("pass_yds") * 0.04;
    pts += g("pass_tds") * (scoring.passTd != null ? scoring.passTd : 4);
    pts += g("rush_yds") * 0.1;
    pts += g("rec_yds") * 0.1;
    pts += g("any_tds") * 6;
    const rec = g("receptions");
    pts += rec * (scoring.rec || 0);
    // A TE premium is per reception on top of the base rate.
    if (position === "TE" && scoring.bonusRecTe) pts += rec * scoring.bonusRecTe;
    return Math.round(pts * 100) / 100;
  }

  function weeklyChips(p) {
    const order = ["pass_yds", "pass_tds", "rush_yds", "receptions", "rec_yds", "any_tds"];
    const parts = [];
    for (const k of order) {
      const s = p.stats[k];
      if (!s || s.line == null) continue;
      const dec = k === "any_tds" ? 2
                : (k.endsWith("_tds") || k === "receptions") ? 1 : 0;
      const cls = s.lineSource === "fitted" ? "src-fit"
                : s.lineSource === "books" ? "src-fanduel"
                : s.lineSource === "dk-td" ? "src-bovada" : "src-kalshi";
      const mark = s.lineSource === "fitted" ? "~" : "";
      // Name each book and the number it posted, so a consensus is auditable
      // rather than a black box. Books that agree collapse to one line; the
      // interesting case is the one that disagrees.
      let detail;
      if (s.lineSource === "books") {
        const q = (s.quotes || []).slice()
          .sort((x, y) => x.line - y.line || x.book.localeCompare(y.book));
        detail = q.length
          ? q.map((x) => `${BOOK_LABEL[x.book] || x.book} ${x.line}` +
                         (x.odds != null ? ` (${x.odds > 0 ? "+" : ""}${x.odds})` : ""))
             .join("\n")
          : `${s.books} book${s.books === 1 ? "" : "s"}`;
        if (s.min !== s.max) detail += `\nspread ${s.min}–${s.max}`;
      } else if (s.lineSource === "dk-td") {
        detail = `DraftKings ${s.odds}`;
      } else {
        detail = `${s.rungs} strikes`;
      }
      parts.push(
        `<span class="market-chip ${cls}${s.lineSource === "books" && s.min !== s.max ? " book-split" : ""}" ` +
        `title="${escapeHtml(WEEKLY_SOURCE_LABEL[s.lineSource] || "")}\n${escapeHtml(detail)}">` +
        `<span class="mk-label">${escapeHtml(STAT_LABELS[k] || k)}</span> ` +
        `${mark}${s.line.toFixed(dec)}</span>`
      );
    }
    return `<div class="markets">${parts.join("")}</div>`;
  }

  function bookToggleHTML() {
    const counts = new Map();
    const oa = cache["oddsapi"];
    if (oa && Array.isArray(oa.players)) {
      for (const p of oa.players) {
        for (const v of Object.values(p.stats || {})) {
          for (const q of (v.quotes || [])) {
            counts.set(q.book, (counts.get(q.book) || 0) + 1);
          }
        }
      }
    }
    if (cache["weekly"]) counts.set("kalshi", (cache["weekly"].players || []).length);
    if (cache["dktd"]) counts.set("dk-td", (cache["dktd"].players || []).length);

    // On a cold open nothing is cached yet, and returning "" left the box
    // blank until something forced a redraw -- which looked like the toggles
    // needing a click to appear. Fall back to the known sources with no counts
    // so the control is always present; real counts fill in on the redraw.
    if (!counts.size) {
      for (const b of ["fanduel", "draftkings", "bovada", "betonlineag",
                       "betrivers", "betmgm", "fanatics", "kalshi", "dk-td"]) {
        counts.set(b, 0);
      }
    }

    return [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([book, n]) => {
      const label = BOOK_LABEL[book] || NONBOOK_SOURCES[book] || book;
      const on = !activeBooks.size || activeBooks.has(book);
      return "<label><input type=\"checkbox\" data-book=\"" + escapeHtml(book) + "\"" +
        (on ? " checked" : "") + " /> " + escapeHtml(label) +
        (n ? ' <span class="book-count">' + n + "</span>" : "") + "</label>";
    }).join("");
  }

  function applyBookToggle(boxes) {
    const checked = boxes.filter((b) => b.checked);
    activeBooks.clear();
    if (checked.length !== boxes.length) {
      for (const b of checked) activeBooks.add(b.dataset.book);
    }
  }

  function buildSitStartPoolFull() {
    const wk = cache["weekly"], oa = cache["oddsapi"], dk = cache["dktd"];
    const merged = new Map();
    if (wk && Array.isArray(wk.players)) {
      for (const p of wk.players) {
        merged.set(normPlayerName(p.name), { ...p, stats: { ...p.stats } });
      }
    }
    if (oa && Array.isArray(oa.players)) {
      for (const p of oa.players) {
        const k = normPlayerName(p.name);
        let rec = merged.get(k);
        if (!rec) { rec = { name: p.name, matchup: p.matchup, stats: {} }; merged.set(k, rec); }
        for (const [statKey, v] of Object.entries(p.stats || {})) {
          if (v.line != null) {
            rec.stats[statKey] = {
              line: v.line, lineSource: "books", books: v.books,
              min: v.min, max: v.max, quotes: v.quotes || [],
            };
          }
        }
      }
    }
    if (dk && Array.isArray(dk.players)) {
      for (const p of dk.players) {
        const k = normPlayerName(p.name);
        let rec = merged.get(k);
        if (!rec) { rec = { name: p.name, matchup: p.matchup, stats: {} }; merged.set(k, rec); }
        const cur = rec.stats.any_tds;
        if (!cur || cur.line == null) {
          rec.stats.any_tds = { line: p.xTD, lineSource: "dk-td", odds: p.americanOdds };
        }
      }
    }

    const fpLut = buildProjLookup(cache["data"]);
    const clayLut = buildProjLookup(cache["clay"]);
    const pool = new Map();
    for (const [key, p] of merged) {
      const fp = lookupProj(fpLut, p.name), clay = lookupProj(clayLut, p.name);
      const priced = Object.values(p.stats).filter((s) => s.line != null);
      pool.set(key, {
        name: p.name,
        matchup: p.matchup || "",
        position: (fp && fp.position) || (clay && clay.position) || null,
        points: weeklyPoints(p.stats, "half"),
        stats: p.stats,
        tdOnly: priced.length === 1 && p.stats.any_tds && p.stats.any_tds.line != null,
        statCount: priced.length,
      });
    }
    return pool;
  }

  function bestLineup(players) {
    let best = null;
    const n = players.length;
    const used = new Array(n).fill(false);
    const current = new Array(LINEUP_SLOTS.length).fill(null);

    function recurse(slotIdx, total) {
      if (slotIdx === LINEUP_SLOTS.length) {
        if (!best || total > best.total) best = { total, picks: current.slice() };
        return;
      }
      const slot = LINEUP_SLOTS[slotIdx];
      let filled = false;
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        const p = players[i];
        if (!p.position || !slot.accepts.includes(p.position)) continue;
        used[i] = true;
        current[slotIdx] = p;
        filled = true;
        recurse(slotIdx + 1, total + p.points);
        used[i] = false;
        current[slotIdx] = null;
      }
      // A slot with nobody eligible stays empty rather than aborting the search
      // -- a roster with no TE should still get its other seven slots filled.
      if (!filled) {
        current[slotIdx] = null;
        recurse(slotIdx + 1, total);
      }
    }
    recurse(0, 0);
    return best;
  }

  function bestLineupForSlots(players, slots) {
    const eligible = slots.map((slot) => {
      const accepts = SLOT_ACCEPTS[slot] || [];
      return players
        .map((p, i) => ({ p, i }))
        .filter((x) => x.p.position && accepts.includes(x.p.position))
        .sort((a, b) => b.p.points - a.p.points)
        .slice(0, slots.length + 2)
        .map((x) => x.i);
    });

    let best = null;
    const used = new Array(players.length).fill(false);
    const current = new Array(slots.length).fill(null);

    function recurse(si, total) {
      if (si === slots.length) {
        if (!best || total > best.total) best = { total, picks: current.slice() };
        return;
      }
      let filled = false;
      for (const idx of eligible[si]) {
        if (used[idx]) continue;
        used[idx] = true;
        current[si] = players[idx];
        filled = true;
        recurse(si + 1, total + players[idx].points);
        used[idx] = false;
        current[si] = null;
      }
      // An empty slot is legitimate: a roster with no kicker should still get
      // the rest of its lineup rather than failing outright.
      if (!filled) {
        current[si] = null;
        recurse(si + 1, total);
      }
    }
    recurse(0, 0);
    return best || { total: 0, picks: current.slice() };
  }

  function slotTable(rows, total, unpriced, unmatched, bench) {
    let html = "";
    if (rows.length) {
      html += '<table class="slot-table"><thead><tr>' +
        '<th>Slot</th><th>Player</th><th>Pos</th><th>Game</th>' +
        '<th style="text-align:right">Proj</th>' +
        "<th>Market lines</th></tr></thead><tbody>";
      for (const r of rows) {
        const isFlex = r.slot === "FLEX";
        const badge = '<span class="slot-badge' + (isFlex ? " flex" : "") + '">' +
                      escapeHtml(r.slot) + "</span>";
        if (!r.p) {
          html += '<tr class="bench-row"><td>' + badge +
                  '</td><td colspan="5">nobody eligible</td></tr>';
          continue;
        }
        html += "<tr><td>" + badge + "</td>" +
          '<td class="player-name">' + escapeHtml(r.p.name) + "</td>" +
          '<td><span class="pos-badge pos-' + escapeHtml(r.p.position || "?") + '">' +
          escapeHtml(r.p.position || "?") + "</span></td>" +
          '<td class="weekly-game">' + escapeHtml(r.p.matchup || "-") + "</td>" +
          '<td style="text-align:right"><span class="market-pts">' +
          r.p.points.toFixed(1) + "</span></td>" +
          "<td>" + (r.p.stats ? weeklyChips(r.p) : "") + "</td></tr>";
      }
      html += "</tbody></table>";
    }
    if (total != null) {
      html += '<div class="sitstart-total">Projected lineup total: ' +
              total.toFixed(1) + " half-PPR</div>";
    }
    if (bench && bench.length) {
      html += '<div class="sitstart-section">Bench</div><table class="slot-table"><tbody>';
      for (const p of bench) {
        html += '<tr class="bench-row"><td class="player-name">' + escapeHtml(p.name) + "</td>" +
          '<td><span class="pos-badge pos-' + escapeHtml(p.position || "?") + '">' +
          escapeHtml(p.position || "?") + "</span></td>" +
          '<td class="weekly-game">' + escapeHtml(p.matchup || "-") + "</td>" +
          '<td style="text-align:right">' + p.points.toFixed(1) + "</td>" +
          "<td>" + (p.stats ? weeklyChips(p) : "") + "</td></tr>";
      }
      html += "</tbody></table>";
    }
    if (unpriced && unpriced.length) {
      html += '<div class="sitstart-section">No usage priced</div>' +
        '<div class="verdict" style="font-size:13px">' +
        escapeHtml(unpriced.map((p) => p.name).join(", ")) +
        '<br /><span style="color:#6a6a8a">A book pricing a touchdown but no ' +
        "yardage usually means an unsettled role. Treat as start-at-your-own-risk, " +
        "not as a zero.</span></div>";
    }
    if (unmatched && unmatched.length) {
      html += '<div class="sitstart-section">Not recognised</div>' +
        '<div class="verdict" style="font-size:13px"><span class="unmatched">' +
        escapeHtml(unmatched.join(", ")) + "</span></div>";
    }
    return html;
  }

  function freeAgentsFor(lg, rosteredKeys, currentStarters) {
    const pool = buildSitStartPoolFull();
    const slots = lg.slots || [];

    // The honest question for a pickup is not "does he beat my worst flex
    // player" -- that compares a tight end against a running back and reads as
    // nonsense. It is "would adding him raise my optimal lineup total", so each
    // candidate is re-optimized into the actual roster and the gain measured.
    // This needs no per-position special cases and handles superflex, extra
    // flex slots and TE premiums for free.
    const baseLineup = bestLineupForSlots(currentStarters, slots);
    const base = baseLineup.total;

    // Re-optimizing for every unrostered player is wasteful: most of a 200-name
    // wire cannot possibly crack the lineup. A candidate can only help if he
    // beats the weakest starter in SOME slot he is eligible for, so that cheap
    // test prunes the list first -- it is a necessary condition for any gain,
    // so nothing that could help is discarded.
    let weakestStarter = Infinity;
    for (const p of baseLineup.picks) {
      if (p && p.points < weakestStarter) weakestStarter = p.points;
    }
    const emptySlot = baseLineup.picks.some((p) => !p);

    const candidates = [];
    for (const [key, p] of pool) {
      if (rosteredKeys.has(key)) continue;
      if (!p.position || p.tdOnly) continue;
      const pts = leaguePoints(p.stats, lg.scoring, p.position);
      if (pts <= 0) continue;
      // An unfilled slot means anyone eligible is a gain, so skip the prune.
      // Note this is why already-played players must NOT be dropped silently:
      // their absence would open a slot and make every pickup look free.
      if (!emptySlot && pts <= weakestStarter) continue;
      candidates.push({ p, pts });
    }

    const out = [];
    for (const { p, pts } of candidates) {
      const withHim = bestLineupForSlots(
        currentStarters.concat([{
          name: p.name, position: p.position,
          matchup: p.matchup, points: pts, wasStarter: false,
        }]), slots);
      const gain = Math.round((withHim.total - base) * 10) / 10;
      if (gain <= 0) continue;

      // Name who he displaces, which is the part that makes the gain legible.
      const nowStarting = new Set(withHim.picks.filter(Boolean).map((x) => x.name));
      const dropped = baseLineup.picks.filter(
        (x) => x && !nowStarting.has(x.name));
      out.push({
        name: p.name,
        position: p.position,
        matchup: p.matchup,
        points: pts,
        upgrade: gain,
        replaces: dropped.length ? dropped[0] : null,
      });
    }
    out.sort((a, b) => b.upgrade - a.upgrade || b.points - a.points);
    return out;
  }

  function freeAgentTable(fas, lg) {
    const gains = fas.slice(0, 12);
    if (!gains.length) {
      return '<div class="sitstart-section">Free agents</div>' +
        '<div class="verdict" style="font-size:13px;color:#6a6a8a">' +
        "Nothing on the wire projects above your current starters this week." +
        (fas.length ? " (" + fas.length + " unrostered players do have lines.)" : "") +
        "</div>";
    }
    let html = '<div class="sitstart-section">Best available &mdash; ranked by ' +
      "how much they would add to your optimal lineup</div>" +
      '<div class="table-wrap"><table class="slot-table"><thead><tr>' +
      "<th>Player</th><th>Pos</th><th>Game</th>" +
      '<th style="text-align:right">Proj</th>' +
      '<th style="text-align:right">Lineup gain</th>' +
      "<th>Would bench</th></tr></thead><tbody>";
    for (const f of gains) {
      html += '<tr><td class="player-name">' + escapeHtml(f.name) + "</td>" +
        '<td><span class="pos-badge pos-' + escapeHtml(f.position) + '">' +
        escapeHtml(f.position) + "</span></td>" +
        '<td class="weekly-game">' + escapeHtml(f.matchup || "-") + "</td>" +
        '<td style="text-align:right">' + f.points.toFixed(1) + "</td>" +
        '<td style="text-align:right"><span style="color:#58d68d;font-weight:700">+' +
        f.upgrade.toFixed(1) + "</span></td>" +
        '<td class="weekly-game">' +
        (f.replaces ? escapeHtml(f.replaces.name) + " (" +
          f.replaces.points.toFixed(1) + ")"
          : '<span style="color:#6a6a8a">fills an open slot</span>') +
        "</td></tr>";
    }
    html += "</tbody></table></div>";
    return html;
  }

  function renderSitStart() {
    const $out = document.getElementById("sitstart-output");
    if (!$out) return;

    const pool = buildSitStartPoolFull();
    if (!pool.size) {
      $out.innerHTML = '<div class="empty">Market data has not loaded.</div>';
      return;
    }
    if (!rosterSelected.size) {
      $out.innerHTML = '<div class="empty">Add players to build a lineup.</div>';
      return;
    }

    const matched = [], unmatched = [], unpriced = [];
    for (const key of rosterSelected) {
      const p = pool.get(key);
      if (!p) { unmatched.push(key); continue; }
      // A player whose only market is a touchdown price has no usage priced,
      // so ranking him against a fully-priced player would mislead.
      if (p.tdOnly || p.points <= 0 || !p.position) unpriced.push(p);
      else matched.push(p);
    }

    if (!matched.length) {
      $out.innerHTML = '<div class="verdict">No pasted player has a priced Week 1 projection.' +
        (unmatched.length ? " Unrecognised: " + escapeHtml(unmatched.join(", ")) + "." : "") +
        "</div>" + slotTable([], null, unpriced, unmatched);
      return;
    }

    // A two-player question reads better as a verdict than as a lineup table.
    if (matched.length === 2 && !unpriced.length) {
      const pair = matched.slice().sort((x, y) => y.points - x.points);
      const a = pair[0], b = pair[1];
      const gap = a.points - b.points;
      const verdict = gap < 0.5
        ? "<strong>" + escapeHtml(a.name) + "</strong> by a hair &mdash; " +
          a.points.toFixed(1) + " to " + b.points.toFixed(1) +
          " in half-PPR. That gap is inside the noise; play the matchup you believe in."
        : "Start <strong>" + escapeHtml(a.name) + "</strong>. The market has him at " +
          a.points.toFixed(1) + " half-PPR against " + escapeHtml(b.name) + " at " +
          b.points.toFixed(1) + " &mdash; a " + gap.toFixed(1) + "-point edge.";
      $out.innerHTML = '<div class="verdict">' + verdict + "</div>" +
        slotTable([{ slot: "START", p: a }, { slot: "SIT", p: b }], null, unpriced, unmatched);
      return;
    }

    const best = bestLineup(matched);
    const startingNames = new Set(best.picks.filter(Boolean).map((p) => p.name));
    const bench = matched.filter((p) => !startingNames.has(p.name))
      .sort((a, b) => b.points - a.points);
    const rows = best.picks.map((p, i) => ({ slot: LINEUP_SLOTS[i].label, p }));
    $out.innerHTML = slotTable(rows, best.total, unpriced, unmatched, bench);
  }

  function renderSleeper() {
    const $out = document.getElementById("sleeper-output");
    const $meta = document.getElementById("sleeper-meta");
    if (!$out) return;

    const sl = sleeperLive;
    if (!sl || !Array.isArray(sl.leagues) || !sl.leagues.length) {
      $out.innerHTML = '<div class="empty">Enter a Sleeper username to load your leagues.</div>';
      return;
    }
    const lg = sl.leagues[Math.min(sleeperLeagueIdx, sl.leagues.length - 1)];
    const pool = buildSitStartPoolFull();
    const wkd = cache["weekly"];
    if ($meta) {
      $meta.textContent = (wkd ? "Week " + wkd.week + " · " : "") +
        lg.teams + " teams · " +
        (lg.scoring.rec === 1 ? "full PPR" : lg.scoring.rec === 0.5 ? "half PPR"
          : lg.scoring.rec ? lg.scoring.rec + " PPR" : "standard") +
        (lg.scoring.bonusRecTe ? " · +" + lg.scoring.bonusRecTe + " TE" : "");
    }

    // Teams still on this week's board. Kalshi purges a game once it kicks off,
    // so a rostered player whose team is absent has ALREADY PLAYED -- his points
    // are banked, not zero. Treating that as an empty slot made every free agent
    // look like a full-value pickup instead of a marginal one.
    const liveTeams = new Set();
    for (const p of pool.values()) {
      const mu = (p.matchup || "").trim();
      if (mu.length >= 4) liveTeams.add(mu);
    }
    const teamIsLive = (team) => {
      if (!team) return false;
      for (const mu of liveTeams) if (mu.includes(team)) return true;
      return false;
    };

    const scored = [], unpriced = [], noMarket = [], played = [];
    for (const r of lg.roster) {
      if (r.unpriced) { noMarket.push(r); continue; }

      // Already played is decided by Sleeper's own stats, not by whether a
      // betting line still exists: books keep markets up during a game, so the
      // line-based check only caught players whose game had fully settled.
      // A player who has taken a snap is locked -- his points are banked and
      // the decision is gone, so he must not compete for a slot.
      const done = sleeperPlayed && sleeperPlayed.get(r.playerId);
      if (done) {
        played.push({ ...r, actual: done.points, locked: r.starter });
        continue;
      }

      const p = pool.get(normPlayerName(r.name));
      if (!p || p.tdOnly || p.points <= 0 || !p.position) {
        // No line and no remaining game: treat as done even without stats,
        // which covers a player who never took a snap.
        if (!teamIsLive(r.team)) played.push({ ...r, actual: null });
        else unpriced.push(r);
        continue;
      }
      scored.push({
        name: r.name,
        position: r.position || p.position,
        matchup: p.matchup,
        points: leaguePoints(p.stats, lg.scoring, r.position || p.position),
        stats: p.stats,
        injury: r.injury,
        wasStarter: r.starter,
      });
    }

    const slots = lg.slots || [];
    // Slots held by a player who has already played are spent -- the optimizer
    // fills only what is still changeable, so a locked starter is not counted
    // as an opening.
    const lockedBySlot = new Map();
    const lockedStarters = played.filter((r) => r.locked && r.position);
    const freeSlots = [];
    const slotUsed = new Array(slots.length).fill(false);
    for (const r of lockedStarters) {
      const idx = slots.findIndex((sl, i) =>
        !slotUsed[i] && (SLOT_ACCEPTS[sl] || []).includes(r.position));
      if (idx >= 0) { slotUsed[idx] = true; lockedBySlot.set(idx, r); }
    }
    slots.forEach((sl, i) => { if (!slotUsed[i]) freeSlots.push({ slot: sl, i }); });

    const best = bestLineupForSlots(scored, freeSlots.map((f) => f.slot));
    const startingNames = new Set(best.picks.filter(Boolean).map((p) => p.name));
    const bench = scored.filter((p) => !startingNames.has(p.name))
      .sort((a, b) => b.points - a.points);

    let html = '<div class="league-scoring">' +
      escapeHtml(slots.join(" / ")) + "</div>";

    html += '<div class="table-wrap"><table class="slot-table"><thead><tr>' +
      "<th>Slot</th><th>Player</th><th>Pos</th><th>Game</th>" +
      '<th style="text-align:right">Proj</th>' +
      "<th>Market lines</th></tr></thead><tbody>";
    // Re-expand the optimizer's answer back over the full slot list, so locked
    // slots render in place rather than the lineup appearing to shift up.
    const fullPicks = new Array(slots.length).fill(null);
    freeSlots.forEach((f, k) => { fullPicks[f.i] = best.picks[k] || null; });
    for (const [idx, r] of lockedBySlot) {
      fullPicks[idx] = { ...r, points: r.actual != null ? r.actual : 0, isLocked: true };
    }

    fullPicks.forEach((p, i) => {
      const slot = slots[i];
      const isFlex = (SLOT_ACCEPTS[slot] || []).length > 1;
      const badge = '<span class="slot-badge' + (isFlex ? " flex" : "") + '">' +
                    escapeHtml(slot) + "</span>";
      if (!p) {
        html += '<tr class="bench-row"><td>' + badge +
                '</td><td colspan="5">nobody eligible</td></tr>';
        return;
      }
      if (p.isLocked) {
        html += '<tr class="locked-row"><td>' + badge + "</td>" +
          '<td class="player-name">' + escapeHtml(p.name) +
          ' <span class="injury-tag" style="color:#6a6a8a">PLAYED</span></td>' +
          '<td><span class="pos-badge pos-' + escapeHtml(p.position || "?") + '">' +
          escapeHtml(p.position || "?") + "</span></td>" +
          '<td class="weekly-game">' + escapeHtml(p.team || "-") + "</td>" +
          '<td style="text-align:right"><span class="market-pts" style="color:#6a6a8a">' +
          (p.actual != null ? p.actual.toFixed(1) : "—") + "</span></td>" +
          '<td style="color:#6a6a8a;font-size:12px">final &mdash; slot spent</td></tr>';
        return;
      }

      // Flag a change from what is currently set in Sleeper — that is the
      // actionable part, not the lineup itself.
      const swap = p.wasStarter ? "" :
        ' <span class="injury-tag" style="color:#58d68d">SWAP IN</span>';
      html += "<tr><td>" + badge + "</td>" +
        '<td class="player-name">' + escapeHtml(p.name) +
        (p.injury ? ' <span class="injury-tag">' + escapeHtml(p.injury) + "</span>" : "") +
        swap + "</td>" +
        '<td><span class="pos-badge pos-' + escapeHtml(p.position || "?") + '">' +
        escapeHtml(p.position || "?") + "</span></td>" +
        '<td class="weekly-game">' + escapeHtml(p.matchup || "-") + "</td>" +
        '<td style="text-align:right"><span class="market-pts">' +
        p.points.toFixed(1) + "</span></td>" +
        "<td>" + (p.stats ? weeklyChips(p) : "") + "</td></tr>";
    });
    html += "</tbody></table></div>";
    const banked = [...lockedBySlot.values()]
      .reduce((t, r) => t + (r.actual != null ? r.actual : 0), 0);
    html += '<div class="sitstart-total">' +
      (banked > 0
        ? "Banked " + banked.toFixed(1) + " + projected " + best.total.toFixed(1) +
          " = " + (banked + best.total).toFixed(1)
        : "Projected starters: " + best.total.toFixed(1)) +
      " pts (K/DEF not projected)</div>";

    if (bench.length) {
      html += '<div class="sitstart-section">Bench</div>' +
        '<div class="table-wrap"><table class="slot-table"><tbody>';
      for (const p of bench) {
        const swap = p.wasStarter
          ? ' <span class="injury-tag">SITTING</span>' : "";
        html += '<tr class="bench-row"><td class="player-name">' +
          escapeHtml(p.name) +
          (p.injury ? ' <span class="injury-tag">' + escapeHtml(p.injury) + "</span>" : "") +
          swap + "</td>" +
          '<td><span class="pos-badge pos-' + escapeHtml(p.position || "?") + '">' +
          escapeHtml(p.position || "?") + "</span></td>" +
          '<td class="weekly-game">' + escapeHtml(p.matchup || "-") + "</td>" +
          '<td style="text-align:right">' + p.points.toFixed(1) + "</td>" +
          "<td>" + (p.stats ? weeklyChips(p) : "") + "</td></tr>";
      }
      html += "</tbody></table></div>";
    }

    if (played.length) {
      html += '<div class="sitstart-section">Already played this week</div>' +
        '<div class="verdict" style="font-size:13px">' +
        escapeHtml(played.map((r) => r.name + " (" + (r.position || "?") + ")").join(", ")) +
        '<br /><span style="color:#6a6a8a">Their games have kicked off, so the ' +
        "books no longer quote them. Points already banked &mdash; the lineup " +
        "above only covers who is left to play.</span></div>";
    }
    if (unpriced.length) {
      html += '<div class="sitstart-section">No market projection</div>' +
        '<div class="verdict" style="font-size:13px">' +
        escapeHtml(unpriced.map((r) => r.name).join(", ")) +
        '<br /><span style="color:#6a6a8a">No book has priced their usage this ' +
        "week. That usually means an unsettled role, not a projection of zero.</span></div>";
    }
    if (noMarket.length) {
      html += '<div class="sitstart-section">Not covered by props</div>' +
        '<div class="verdict" style="font-size:13px;color:#6a6a8a">' +
        escapeHtml(noMarket.map((r) => r.name + " (" + (r.position || "?") + ")").join(", ")) +
        "</div>";
    }

    if (lg.rosteredKeys) {
      html += freeAgentTable(
        freeAgentsFor(lg, lg.rosteredKeys, scored), lg);
    }
    $out.innerHTML = html;
  }

  function renderSleeperChips() {
    const $chips = document.getElementById("sleeper-league-chips");
    const sl = sleeperLive;
    if (!$chips || !sl || !Array.isArray(sl.leagues)) {
      if ($chips) $chips.innerHTML = "";
      return;
    }
    $chips.innerHTML = sl.leagues.map((lg, i) =>
      '<button class="chip' + (i === sleeperLeagueIdx ? " active" : "") +
      '" data-idx="' + i + '" title="' + escapeHtml(lg.name || "") + '">' +
      escapeHtml(lg.name || "League " + (i + 1)) + "</button>"
    ).join("");
    $chips.querySelectorAll(".chip").forEach((c) => {
      c.addEventListener("click", () => {
        sleeperLeagueIdx = Number(c.dataset.idx) || 0;
        renderSleeperChips();
        renderSleeper();
      });
    });
  }

  function renderSleeperBookToggles() {
    const list = document.getElementById("sleeper-book-list");
    if (!list) return;
    list.innerHTML = bookToggleHTML();
    for (const cb of list.querySelectorAll("input[data-book]")) {
      cb.addEventListener("change", () => {
        applyBookToggle([...list.querySelectorAll("input[data-book]")]);
        renderSleeper();
        renderSleeperBookToggles();
      });
    }
  }

  function renderBookToggles() {
    const list = document.getElementById("book-toggle-list");
    if (!list) return;
    list.innerHTML = bookToggleHTML();
    for (const cb of list.querySelectorAll("input[data-book]")) {
      cb.addEventListener("change", () => {
        applyBookToggle([...list.querySelectorAll("input[data-book]")]);
        renderSitStart();
        renderBookToggles();
      });
    }
  }

  async function sleeperJson(path) {
    const res = await fetch(SLEEPER_API + path);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function sleeperStatus(msg, isError) {
    const $s = document.getElementById("sleeper-status");
    if (!$s) return;
    $s.textContent = msg || "";
    $s.classList.toggle("sleeper-error", !!isError);
  }

  function sleeperSeason() {
    const wk = cache["weekly"];
    return (wk && wk.season) || String(new Date().getFullYear());
  }

  async function loadSleeperPlayed(season, week) {
    if (sleeperPlayed) return sleeperPlayed;
    sleeperPlayed = new Map();
    try {
      const stats = await sleeperJson(
        "/stats/nfl/regular/" + season + "/" + week);
      for (const [pid, v] of Object.entries(stats || {})) {
        if (!v || !v.gp) continue;
        sleeperPlayed.set(String(pid), {
          points: v.pts_half_ppr != null ? v.pts_half_ppr : null,
          snaps: v.off_snp != null ? v.off_snp : null,
        });
      }
    } catch (e) {
      // Not fatal: without it the lineup just cannot mark played slots.
      console.warn("Sleeper stats unavailable", e);
    }
    return sleeperPlayed;
  }

  async function loadSleeperUser(username) {
    const name = (username || "").trim().replace(/^@/, "");
    if (!name) { sleeperStatus("Enter a username first.", true); return; }
    if (sleeperBusy) return;
    sleeperBusy = true;
    sleeperStatus("Looking up " + name + "…");

    const $out = document.getElementById("sleeper-output");
    try {
      if (!cache["sleeperPlayers"]) {
        cache["sleeperPlayers"] = await fetchJson("sleeper_players.json");
      }
      // Sleeper returns 404 for an unknown username and, unhelpfully, 200 with
      // a null body in some cases — both mean "no such user".
      let user;
      try {
        user = await sleeperJson("/user/" + encodeURIComponent(name));
      } catch (e) {
        user = null;
      }
      if (!user || !user.user_id) {
        sleeperStatus("No Sleeper user named " + name + ".", true);
        if ($out) {
          $out.innerHTML = '<div class="verdict">No Sleeper account found for ' +
            '<span class="unmatched">' + escapeHtml(name) + "</span>. " +
            "Usernames are case-insensitive but must match exactly otherwise — " +
            "check it on your Sleeper profile.</div>";
        }
        sleeperBusy = false;
        return;
      }

      const season = sleeperSeason();
      const leagues = await sleeperJson(
        "/user/" + user.user_id + "/leagues/nfl/" + season) || [];
      if (!leagues.length) {
        sleeperStatus("No " + season + " NFL leagues for this user.", true);
        if ($out) {
          $out.innerHTML = '<div class="verdict">' + escapeHtml(user.display_name || name) +
            " has no " + escapeHtml(season) + " NFL leagues on Sleeper.</div>";
        }
        sleeperBusy = false;
        return;
      }

      sleeperStatus("Reading " + leagues.length + " league" +
                    (leagues.length === 1 ? "" : "s") + "…");

      const pmap = (cache["sleeperPlayers"] || {}).players || {};
      const built = [];
      // Rosters are one request per league; a dozen leagues is still fast, and
      // a single league failing should not lose the others.
      const rosterSets = await Promise.all(leagues.map((lg) =>
        sleeperJson("/league/" + lg.league_id + "/rosters").catch(() => null)));

      leagues.forEach((lg, i) => {
        const rosters = rosterSets[i];
        if (!Array.isArray(rosters)) return;
        const mine = rosters.find((r) => r.owner_id === user.user_id);
        if (!mine) return;
        const starters = new Set(mine.starters || []);
        // Every player on ANY roster in this league, keyed the same way the
        // market board is, so the leftovers are the free agents.
        const rosteredKeys = new Set();
        for (const r of rosters) {
          for (const pid of (r.players || [])) {
            const e = pmap[String(pid)];
            if (e) rosteredKeys.add(normPlayerName(e[0]));
          }
        }
        const roster = (mine.players || []).map((pid) => {
          const e = pmap[String(pid)];
          const pos = e ? e[1] : null;
          return {
            playerId: String(pid),
            name: e ? e[0] : "Unknown (" + pid + ")",
            position: pos,
            team: e ? e[2] : null,
            starter: starters.has(pid),
            // No book prices kickers or defenses; they are part of the lineup
            // but outside what this tool can evaluate.
            unpriced: pos === "K" || pos === "DEF" || pos === "DST",
            injury: null,
          };
        });
        roster.sort((a, b) => (a.starter === b.starter ? 0 : a.starter ? -1 : 1) ||
                              String(a.position).localeCompare(String(b.position)) ||
                              a.name.localeCompare(b.name));
        const sc = lg.scoring_settings || {};
        built.push({
          leagueId: lg.league_id,
          name: lg.name,
          teams: lg.total_rosters,
          status: lg.status,
          slots: (lg.roster_positions || []).filter((s) => s !== "BN"),
          scoring: {
            rec: sc.rec || 0,
            passTd: sc.pass_td != null ? sc.pass_td : 4,
            bonusRecTe: sc.bonus_rec_te || 0,
          },
          roster,
          rosteredKeys,
        });
      });

      if (!built.length) {
        sleeperStatus("Found leagues but no roster owned by this user.", true);
        sleeperBusy = false;
        return;
      }

      // Which of these players have already played this week.
      const wkNow = cache["weekly"] && cache["weekly"].week;
      if (wkNow) await loadSleeperPlayed(season, wkNow);

      sleeperLive = { username: user.display_name || name,
                      userId: user.user_id, leagues: built };
      sleeperLeagueIdx = 0;
      try { localStorage.setItem(SLEEPER_LS_KEY, name); } catch (e) { /* private mode */ }
      const $forget = document.getElementById("sleeper-forget");
      if ($forget) $forget.hidden = false;
      sleeperStatus("Signed in as " + (user.display_name || name) +
                    " · " + built.length + " league" + (built.length === 1 ? "" : "s"));
      renderSleeperChips();
      renderSleeper();
    } catch (e) {
      sleeperStatus("Sleeper request failed: " + (e && e.message ? e.message : e), true);
    } finally {
      sleeperBusy = false;
    }
  }



  function rosterPool() {
    return buildSitStartPoolFull();
  }

  function renderRosterTags() {
    const $tags = document.getElementById("roster-tags");
    if (!$tags) return;
    const pool = rosterPool();
    if (!rosterSelected.size) {
      $tags.innerHTML = '<span style="font-size:12px;color:#6a6a8a">No players added yet.</span>';
      return;
    }
    const parts = [];
    for (const key of rosterSelected) {
      const p = pool.get(key);
      const label = p ? p.name : key;
      // An unpriced player is chipped in amber rather than dropped, so it is
      // visible that he was added but cannot be ranked.
      const unpriced = p && (p.tdOnly || p.points <= 0 || !p.position);
      parts.push('<span class="player-tag' + (unpriced ? " unpriced" : "") +
        '" data-key="' + escapeHtml(key) + '">' + escapeHtml(label) +
        (p && p.position
          ? ' <span class="pos-badge pos-' + escapeHtml(p.position) + '">' +
            escapeHtml(p.position) + "</span>"
          : "") +
        ' <span class="remove">&times;</span></span>');
    }
    $tags.innerHTML = parts.join("");
    $tags.querySelectorAll(".player-tag").forEach((el) => {
      el.addEventListener("click", () => {
        rosterSelected.delete(el.dataset.key);
        renderRosterTags();
        renderSitStart();
      });
    });
  }

  function renderRosterSuggestions() {
    const $in = document.getElementById("roster-search");
    const $sugg = document.getElementById("roster-suggestions");
    if (!$in || !$sugg) return;
    const val = $in.value.toLowerCase().trim();
    if (!val) { $sugg.style.display = "none"; suggIndex = -1; return; }

    const pool = rosterPool();
    const matches = [...pool.entries()]
      .filter(([k, p]) => !rosterSelected.has(k) && p.position &&
                          p.name.toLowerCase().includes(val))
      // Best projection first: when someone types a surname, the starter should
      // be the top hit rather than a third-stringer who sorts earlier.
      .sort((a, b) => b[1].points - a[1].points)
      .slice(0, 10);

    if (!matches.length) {
      $sugg.innerHTML = '<div style="color:#6a6a8a;cursor:default">No match on this week’s board</div>';
      $sugg.style.display = "block";
      suggIndex = -1;
      return;
    }
    $sugg.innerHTML = matches.map(([k, p], i) =>
      '<div data-key="' + escapeHtml(k) + '"' + (i === suggIndex ? ' class="active"' : "") + ">" +
      escapeHtml(p.name) +
      ' <span class="pos-badge pos-' + escapeHtml(p.position) + '">' +
      escapeHtml(p.position) + "</span>" +
      '<span class="sugg-pts">' + p.points.toFixed(1) + "</span></div>"
    ).join("");
    $sugg.style.display = "block";
  }

  function addRosterKey(key) {
    if (!key) return;
    rosterSelected.add(key);
    const $in = document.getElementById("roster-search");
    const $sugg = document.getElementById("roster-suggestions");
    if ($in) $in.value = "";
    if ($sugg) $sugg.style.display = "none";
    suggIndex = -1;
    renderRosterTags();
    renderSitStart();
  }

  let sleeperLeagueIdx = 0;

  let sleeperLive = null;     // { username, userId, leagues: [...] }


  let sleeperBusy = false;
  // ── Boot ───────────────────────────────────────────────────────────────────
  const $ssView = document.getElementById("sitstart-view");
  const $lgView = document.getElementById("sleeper-view");

  function showView(name) {
    if ($ssView) $ssView.classList.toggle("hidden", name !== "sitstart");
    if ($lgView) $lgView.classList.toggle("hidden", name !== "sleeper");
    document.querySelectorAll(".view-tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.view === name));
    if (name === "sitstart") showSitStartView();
    else showLeaguesView();
  }

  async function loadData() {
    for (const [key, file] of [["weekly", "weekly.json"],
                               ["oddsapi", "oddsapi.json"],
                               ["dktd", "dk_td.json"],
                               ["data", "data.json"],
                               ["clay", "clay.json"]]) {
      if (!cache[key]) {
        try { cache[key] = await fetchJson(file); }
        catch (e) { cache[key] = null; }
      }
    }
    const wk = cache["weekly"];
    const $wk = document.getElementById("week-label");
    if ($wk && wk) {
      $wk.textContent = wk.week ? "Week " + wk.week : "This week";
    }
  }

  async function showSitStartView() {
    renderBookToggles();
    await loadData();
    const $meta = document.getElementById("sitstart-meta");
    const wkd = cache["weekly"];
    if ($meta && wkd) $meta.textContent = "Week " + wkd.week + " · half-PPR";
    renderRosterTags();
    renderBookToggles();
    renderSitStart();
  }

  async function showLeaguesView() {
    renderSleeperBookToggles();
    await loadData();
    if (!sleeperLive) {
      let saved = null;
      try { saved = localStorage.getItem(SLEEPER_LS_KEY); } catch (e) { saved = null; }
      const $u = document.getElementById("sleeper-user");
      if (saved && $u) {
        $u.value = saved;
        await loadSleeperUser(saved);
        return;
      }
    }
    renderSleeperChips();
    renderSleeperBookToggles();
    renderSleeper();
  }

  document.getElementById("view-tabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest(".view-tab");
    if (tab) showView(tab.dataset.view);
  });

  loadData().then(() => showView("sitstart"));
})();
