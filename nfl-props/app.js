(function () {
  // ── State ──────────────────────────────────────────────────────────────────
  // Cache each source's data after first load
  const cache = {};
  let currentSource = "aggregated";  // default: combined view
  let raw = { players: [], lastUpdated: null, playerCount: 0, source: "" };
  let fmt = "ppr";
  // Position filter is a Set. Empty = show all.
  const activePos = new Set();
  let search = "";

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const $rows = document.getElementById("rows");
  const $empty = document.getElementById("empty");
  const $search = document.getElementById("search");
  const $playerCount = document.getElementById("player-count");
  const $eventCount = document.getElementById("event-count");
  const $lastUpdated = document.getElementById("last-updated");
  const $fmtGroup = document.getElementById("format-group");
  const $posChips = document.getElementById("pos-chips");

  // ── Player name normalization for cross-source matching ────────────────────
  // Strips: case, punctuation, generational suffixes (Jr/Sr/II/III/IV/V),
  // and resolves common nickname ↔ formal name aliases (Ken→Kenneth, DJ→D J).
  // Two-stage match:
  //  1) "key" = full canonical name (best precision)
  //  2) "altKey" = (firstInitial + lastName) — used to merge nickname forms
  //     when keys differ.

  // Common first-name aliases. Both directions map to the canonical form.
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
    return out;
  }

  // Secondary key: first letter of first name + last token.
  // "kenneth walker" → "k walker"; "ken walker" → "k walker".
  // Use this only as a fallback merge when the primary keys disagree.
  function altPlayerKey(s) {
    const n = normPlayerName(s);
    if (!n) return "";
    const parts = n.split(" ");
    if (parts.length < 2) return n;
    return parts[0][0] + " " + parts[parts.length - 1];
  }

  // ── Fantasy-point math (mirrors Python scraper) ────────────────────────────
  function fantasyPoints(stats, format) {
    let pts = 0;
    pts += (stats.pass_yds      || 0) * 0.04;
    pts += (stats.pass_tds      || 0) * 4;
    pts += (stats.pass_ints     || 0) * -2;
    pts += (stats.rush_yds      || 0) * 0.1;
    pts += (stats.rush_tds      || 0) * 6;
    pts += (stats.rec_yds       || 0) * 0.1;
    pts += (stats.rec_tds       || 0) * 6;
    pts += (stats.fumbles_lost  || 0) * -2;
    if (format === "ppr")        pts += (stats.receptions || 0) * 1.0;
    else if (format === "half")  pts += (stats.receptions || 0) * 0.5;
    return Math.round(pts * 100) / 100;
  }

  // ── Loaders ────────────────────────────────────────────────────────────────
  async function fetchJson(file) {
    const res = await fetch(file + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function buildAggregated(sources) {
    // sources: array of { label, data } where data is the parsed json (or null).
    // Stage 1: bucket by primary normalized key.
    // Stage 2: merge buckets that share the same altKey AND position (catches
    //          nickname forms like "Ken Walker" vs "Kenneth Walker").
    const byKey = new Map();

    // Each "bucket" stores raw per-source player stat dicts so we can re-average
    // after the merge stage. (Averaging during accumulation would prevent us
    // from cleanly combining two buckets later.)
    const newBucket = (player) => ({
      name: player.name,
      team: player.team,
      position: player.position,
      contributions: [],   // each entry: { source: label, stats: {...} }
    });

    const consume = (player, sourceLabel) => {
      const key = normPlayerName(player.name);
      if (!key) return;
      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = newBucket(player);
        byKey.set(key, bucket);
      }
      bucket.contributions.push({ source: sourceLabel, stats: player.stats || {} });
      if (!bucket.team && player.team) bucket.team = player.team;
      if (!bucket.position && player.position) bucket.position = player.position;
    };

    let firstLastUpdated = null;
    let firstSeason = "";
    const contributedLabels = [];
    for (const { label, data } of sources) {
      if (!data || !data.players || data.players.length === 0) continue;
      contributedLabels.push(label);
      if (!firstLastUpdated) firstLastUpdated = data.lastUpdated || null;
      if (!firstSeason) firstSeason = data.season || "";
      data.players.forEach((p) => consume(p, label));
    }

    // Stage 2: merge nickname-form buckets via altKey + position.
    // We prefer to keep the bucket whose canonical name is longer (the formal
    // version, e.g. "kenneth walker" over "k walker" or "ken walker").
    const altIndex = new Map();   // altKey|position → bucket
    for (const [key, bucket] of byKey.entries()) {
      const altKey = altPlayerKey(bucket.name) + "|" + (bucket.position || "");
      const existing = altIndex.get(altKey);
      if (!existing) {
        altIndex.set(altKey, bucket);
        continue;
      }
      // Same alt key & position — pick the bucket with the longer canonical
      // name as the keeper, merge contributions from the other one.
      const keeper = bucket.name.length >= existing.name.length ? bucket : existing;
      const dropped = keeper === bucket ? existing : bucket;
      if (keeper !== existing) altIndex.set(altKey, keeper);
      // Avoid double-counting if the same source contributed to both buckets
      const existingSources = new Set(keeper.contributions.map((c) => c.source));
      for (const c of dropped.contributions) {
        if (!existingSources.has(c.source)) keeper.contributions.push(c);
      }
      // Remove the dropped bucket from the primary map
      const droppedKey = normPlayerName(dropped.name);
      if (byKey.get(droppedKey) === dropped) byKey.delete(droppedKey);
    }

    // Average each bucket's contributions to produce the output stats.
    const out = [];
    for (const bucket of byKey.values()) {
      const n = bucket.contributions.length;
      if (n === 0) continue;
      const totals = { pass_yds: 0, pass_tds: 0, pass_ints: 0, rush_yds: 0, rush_tds: 0, rec_yds: 0, rec_tds: 0, receptions: 0, fumbles_lost: 0 };
      for (const c of bucket.contributions) {
        for (const k of Object.keys(totals)) totals[k] += (c.stats[k] || 0);
      }
      const avg = {};
      for (const k of Object.keys(totals)) avg[k] = Math.round((totals[k] / n) * 10) / 10;
      out.push({
        name: bucket.name,
        team: bucket.team,
        position: bucket.position,
        stats: avg,
        sources: bucket.contributions.map((c) => c.source),
      });
    }

    return {
      lastUpdated: firstLastUpdated,
      season: firstSeason,
      source: contributedLabels.length
        ? `Aggregated (${contributedLabels.join(" + ")})`
        : "Aggregated (no sources loaded)",
      playerCount: out.length,
      players: out,
    };
  }

  async function loadSource(srcKey) {
    if (cache[srcKey]) {
      raw = cache[srcKey];
      render();
      return;
    }

    try {
      if (srcKey === "aggregated") {
        const [fp, clay] = await Promise.all([
          cache["data"] ? Promise.resolve(cache["data"]) : fetchJson("data.json").catch(() => null),
          cache["clay"] ? Promise.resolve(cache["clay"]) : fetchJson("clay.json").catch(() => null),
        ]);
        if (fp)   cache["data"] = fp;
        if (clay) cache["clay"] = clay;
        cache["aggregated"] = buildAggregated([
          { label: "FantasyPros", data: fp },
          { label: "Clay",        data: clay },
        ]);
        raw = cache["aggregated"];
      } else {
        const fileMap = { clay: "clay.json", data: "data.json" };
        const file = fileMap[srcKey] || "data.json";
        const json = await fetchJson(file);
        cache[srcKey] = json;
        raw = json;
      }
    } catch (e) {
      console.warn(`Failed to load source ${srcKey}`, e);
      raw = { players: [], lastUpdated: null, playerCount: 0, source: srcKey };
    }
    render();
  }

  async function load() {
    await loadSource("aggregated");
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    const players = (raw.players || [])
      .map((p) => ({ ...p, _proj: fantasyPoints(p.stats || {}, fmt) }))
      .filter((p) => {
        if (activePos.size === 0) return true;
        return activePos.has(p.position);
      })
      .filter((p) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (p.name || "").toLowerCase().includes(s) ||
               (p.team || "").toLowerCase().includes(s);
      })
      .sort((a, b) => b._proj - a._proj);

    $rows.innerHTML = "";
    if (players.length === 0) {
      $empty.textContent = (raw.players || []).length === 0
        ? "No projections loaded for this source. Try running the scraper workflow."
        : "No players match the current filters.";
      $empty.classList.remove("hidden");
    } else {
      $empty.classList.add("hidden");
      const frag = document.createDocumentFragment();
      players.forEach((p, i) => frag.appendChild(buildRow(p, i + 1)));
      $rows.appendChild(frag);
    }

    $playerCount.textContent = raw.playerCount || (raw.players || []).length;
    if ($eventCount) $eventCount.textContent = raw.source || "FantasyPros";
    $lastUpdated.textContent = raw.lastUpdated
      ? new Date(raw.lastUpdated).toLocaleString()
      : "never";
  }

  function buildRow(p, rank) {
    const tr = document.createElement("tr");
    const posClass = "pos-" + (p.position || "?");

    tr.innerHTML = `
      <td class="rank-num">${rank}</td>
      <td class="player-name">${escapeHtml(p.name)}</td>
      <td><span class="pos-badge ${posClass}">${escapeHtml(p.position || "?")}</span></td>
      <td class="matchup">${escapeHtml(p.team || "—")}</td>
      <td class="proj">${p._proj.toFixed(1)}</td>
      <td>${renderStats(p)}</td>
    `;
    return tr;
  }

  function renderStats(p) {
    const s = p.stats || {};
    const parts = [];
    const push = (label, val, decimals = 0) => {
      if (val && val > 0) {
        parts.push(`<span class="market-tag">
          <span class="mk-label">${label}</span><span class="mk-val">${val.toFixed(decimals)}</span>
        </span>`);
      }
    };

    if (p.position === "QB") {
      push("Pass Yds", s.pass_yds);
      push("Pass TDs", s.pass_tds, 1);
      push("INTs", s.pass_ints, 1);
      push("Rush Yds", s.rush_yds);
      push("Rush TDs", s.rush_tds, 1);
    } else if (p.position === "RB") {
      push("Rush Yds", s.rush_yds);
      push("Rush TDs", s.rush_tds, 1);
      push("Rec", s.receptions, 1);
      push("Rec Yds", s.rec_yds);
      push("Rec TDs", s.rec_tds, 1);
    } else if (p.position === "WR" || p.position === "TE") {
      push("Rec", s.receptions, 1);
      push("Rec Yds", s.rec_yds);
      push("Rec TDs", s.rec_tds, 1);
      if (s.rush_yds > 0) push("Rush Yds", s.rush_yds);
    }
    return `<div class="markets">${parts.join("")}</div>`;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  }

  // ── Wire up ────────────────────────────────────────────────────────────────
  $fmtGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".fmt-btn");
    if (!btn) return;
    document.querySelectorAll(".fmt-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    fmt = btn.dataset.fmt;
    render();
    if (currentView === "viz" && typeof Chart !== "undefined") {
      cache["aggregated"] = null;
      renderViz();
    }
  });

  $posChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const p = chip.dataset.pos;

    if (p === "ALL") {
      // "All" clears every selection
      activePos.clear();
      document.querySelectorAll("#pos-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    } else {
      // Toggle this position; deactivate the "All" chip
      const allChip = document.querySelector('#pos-chips .chip[data-pos="ALL"]');
      if (allChip) allChip.classList.remove("active");

      if (activePos.has(p)) {
        activePos.delete(p);
        chip.classList.remove("active");
      } else {
        activePos.add(p);
        chip.classList.add("active");
      }

      // If nothing is selected, fall back to "All"
      if (activePos.size === 0 && allChip) allChip.classList.add("active");
    }

    render();
  });

  $search.addEventListener("input", (e) => {
    search = e.target.value.trim();
    render();
  });

  // ── View switcher (table view vs viz view) ─────────────────────────────────
  const $tableView = document.getElementById("table-view");
  const $vizView = document.getElementById("viz-view");

  function showTableView() {
    if ($tableView) $tableView.classList.remove("hidden");
    if ($vizView) $vizView.classList.add("hidden");
  }

  function showVizView() {
    if ($tableView) $tableView.classList.add("hidden");
    if ($vizView) $vizView.classList.remove("hidden");
    renderViz();
  }

  // ── Top-level view tabs (Rankings / Visualizations) ───────────────────────
  let currentView = "rankings";
  const $viewTabs = document.getElementById("view-tabs");
  const $sourceTabsContainer = document.getElementById("source-tabs");

  if ($viewTabs) {
    $viewTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".view-tab");
      if (!tab) return;
      document.querySelectorAll(".view-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentView = tab.dataset.view;

      if (currentView === "rankings") {
        // Show source tabs (they only matter for the table view)
        if ($sourceTabsContainer) $sourceTabsContainer.classList.remove("hidden");
        showTableView();
      } else {
        // Hide source tabs while in viz view
        if ($sourceTabsContainer) $sourceTabsContainer.classList.add("hidden");
        showVizView();
      }
    });
  }

  // Source tabs (only meaningful in Rankings view)
  const $sourceTabs = document.getElementById("source-tabs");
  if ($sourceTabs) {
    $sourceTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".source-tab");
      if (!tab) return;
      if (tab.dataset.disabled === "true") return;
      document.querySelectorAll(".source-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentSource = tab.dataset.source;

      // If user was on Visualizations, snap back to Rankings since they're
      // explicitly choosing a source (which only affects the table view).
      if (currentView !== "rankings") {
        currentView = "rankings";
        document.querySelectorAll(".view-tab").forEach((t) => t.classList.remove("active"));
        document.querySelector('.view-tab[data-view="rankings"]')?.classList.add("active");
        if ($sourceTabsContainer) $sourceTabsContainer.classList.remove("hidden");
        showTableView();
      }

      loadSource(currentSource);
    });
  }

  // ── Visualizations ─────────────────────────────────────────────────────────
  let vizPos = "ALL";
  const charts = {};

  // Ensure all source files are loaded for the disagreement chart
  async function ensureAllSourcesLoaded() {
    const needs = ["data", "clay"].filter((k) => !cache[k]);
    if (needs.length === 0) return;
    const fileMap = { data: "data.json", clay: "clay.json" };
    await Promise.all(needs.map(async (k) => {
      try { cache[k] = await fetchJson(fileMap[k]); }
      catch (e) { cache[k] = null; }
    }));
  }

  // Build a per-player map of PPR projections by source, for the current format.
  // Reuses the aggregated bucket logic so nickname merging stays consistent.
  function buildDisagreementData() {
    // Get the aggregated (merged) players to inherit the merge result, then
    // re-derive per-source PPR by re-normalizing each raw source against the
    // same canonical names.
    if (!cache["aggregated"]) {
      cache["aggregated"] = buildAggregated([
        { label: "FantasyPros", data: cache["data"] },
        { label: "Clay",        data: cache["clay"] },
      ]);
    }
    const merged = cache["aggregated"].players;

    // Build canonical→player index so we can look up per-source pts by altKey
    const canonByAlt = new Map();
    for (const p of merged) {
      canonByAlt.set(altPlayerKey(p.name) + "|" + (p.position || ""), p);
    }

    // Walk each raw source and attribute its PPR to the canonical entry
    const perCanon = new Map();   // canon name → { name, position, perSource: { src: pts } }
    const attribute = (data, label) => {
      if (!data || !data.players) return;
      for (const p of data.players) {
        const altK = altPlayerKey(p.name) + "|" + (p.position || "");
        const canon = canonByAlt.get(altK);
        if (!canon) continue;
        let row = perCanon.get(canon.name);
        if (!row) {
          row = { name: canon.name, position: canon.position, perSource: {} };
          perCanon.set(canon.name, row);
        }
        row.perSource[label] = fantasyPoints(p.stats || {}, fmt);
      }
    };

    attribute(cache["data"], "FantasyPros");
    attribute(cache["clay"], "Clay");

    const rows = [];
    for (const entry of perCanon.values()) {
      const vals = Object.values(entry.perSource).filter((v) => v > 0);
      if (vals.length < 2) continue;
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      rows.push({
        name: entry.name,
        position: entry.position || "?",
        spread: Math.round((max - min) * 10) / 10,
        max, min, avg,
        perSource: entry.perSource,
      });
    }
    return rows;
  }

  function destroyChart(name) {
    if (charts[name]) {
      charts[name].destroy();
      charts[name] = null;
    }
  }

  function chartTextColor() { return "#a0a0c0"; }
  function chartGridColor() { return "rgba(110, 110, 140, 0.15)"; }

  const POS_COLORS = {
    QB: "#ff6b6b", RB: "#5dade2", WR: "#58d68d", TE: "#f5b041",
  };

  function renderDisagreementChart() {
    destroyChart("disagree");
    const ctx = document.getElementById("chart-disagree");
    if (!ctx) return;

    let rows = buildDisagreementData();
    if (vizPos !== "ALL") rows = rows.filter((r) => r.position === vizPos);
    rows.sort((a, b) => b.spread - a.spread);
    rows = rows.slice(0, 25);

    if (rows.length === 0) {
      const $empty = document.getElementById("viz-empty");
      if ($empty) $empty.classList.remove("hidden");
      return;
    }
    document.getElementById("viz-empty")?.classList.add("hidden");

    const labels = rows.map((r) => `${r.name} (${r.position})`);
    const data = rows.map((r) => r.spread);
    const colors = rows.map((r) => POS_COLORS[r.position] || "#5b4cf5");

    // Give each row enough vertical space so Chart.js doesn't drop labels.
    // Override the canvas parent height: 22px per row + chrome.
    const rowHeight = 22;
    const chartHeight = rows.length * rowHeight + 60;
    const parent = ctx.parentElement;
    if (parent) parent.style.height = chartHeight + "px";

    charts["disagree"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Spread (max − min PPR)",
          data,
          backgroundColor: colors,
          borderWidth: 0,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => {
                const r = rows[ctx.dataIndex];
                return Object.entries(r.perSource)
                  .map(([src, v]) => `  ${src}: ${v.toFixed(1)}`)
                  .join("\n");
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: chartTextColor() }, grid: { color: chartGridColor() } },
          y: {
            ticks: {
              color: chartTextColor(),
              font: { size: 11 },
              autoSkip: false,   // force every label to render
            },
            grid: { display: false },
          },
        },
      },
    });
  }

  function renderTiersChart() {
    destroyChart("tiers");
    const ctx = document.getElementById("chart-tiers");
    if (!ctx) return;

    // Use whatever source is currently active (or fall back to aggregated)
    const baseData = cache["aggregated"] || raw;
    const players = (baseData?.players || [])
      .map((p) => ({ ...p, _proj: fantasyPoints(p.stats || {}, fmt) }))
      .filter((p) => p._proj > 0);

    const positions = ["QB", "RB", "WR", "TE"];
    const TOP_N = 36;

    const datasets = positions.map((pos) => {
      const rows = players
        .filter((p) => p.position === pos)
        .sort((a, b) => b._proj - a._proj)
        .slice(0, TOP_N);
      return {
        label: pos,
        data: rows.map((p, i) => ({ x: i + 1, y: p._proj, name: p.name })),
        borderColor: POS_COLORS[pos],
        backgroundColor: POS_COLORS[pos],
        showLine: true,
        tension: 0.18,
        pointRadius: 3,
        pointHoverRadius: 5,
      };
    });

    charts["tiers"] = new Chart(ctx, {
      type: "scatter",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: chartTextColor() } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}${ctx.raw.x}: ${ctx.raw.name} — ${ctx.raw.y.toFixed(1)}`,
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Position rank", color: chartTextColor() },
            ticks: { color: chartTextColor() },
            grid: { color: chartGridColor() },
          },
          y: {
            title: { display: true, text: "Projected PPR", color: chartTextColor() },
            ticks: { color: chartTextColor() },
            grid: { color: chartGridColor() },
          },
        },
      },
    });
  }

  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    return sorted[base];
  }

  // Per-position sample cap — keeps distributions focused on draftable depth
  const POS_TOP_N = { QB: 32, RB: 60, WR: 60, TE: 32 };

  function renderDistributionChart() {
    destroyChart("distribution");
    const ctx = document.getElementById("chart-distribution");
    if (!ctx) return;

    const baseData = cache["aggregated"] || raw;
    const positions = ["QB", "RB", "WR", "TE"];

    const stats = positions.map((pos) => {
      const vals = (baseData?.players || [])
        .filter((p) => p.position === pos)
        .map((p) => fantasyPoints(p.stats || {}, fmt))
        .filter((v) => v > 0)
        .sort((a, b) => a - b);
      if (vals.length === 0) {
        return { pos, min: 0, q1: 0, median: 0, q3: 0, max: 0 };
      }
      return {
        pos,
        min:    vals[0],
        q1:     quantile(vals, 0.25),
        median: quantile(vals, 0.5),
        q3:     quantile(vals, 0.75),
        max:    vals[vals.length - 1],
      };
    });

    // Chart.js doesn't ship a box plot, so we fake one with two stacked bar
    // datasets per position: a transparent "base" bar to min, then two real
    // segments forming the IQR (q1→median, median→q3), with min/max whiskers
    // drawn via an extra dataset.
    const labels = stats.map((s) => s.pos);

    const data_minToQ1   = stats.map((s) => s.q1 - s.min);          // lower whisker
    const data_q1ToMed   = stats.map((s) => s.median - s.q1);
    const data_medToQ3   = stats.map((s) => s.q3 - s.median);
    const data_q3ToMax   = stats.map((s) => s.max - s.q3);          // upper whisker
    const baseOffset     = stats.map((s) => s.min);                 // invisible spacer

    const posColors = stats.map((s) => POS_COLORS[s.pos]);

    charts["distribution"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "_offset", data: baseOffset, backgroundColor: "transparent", stack: "box", borderWidth: 0 },
          { label: "Min → Q1", data: data_minToQ1, backgroundColor: posColors.map((c) => c + "55"), stack: "box", borderWidth: 0 },
          { label: "Q1 → Median (IQR)", data: data_q1ToMed, backgroundColor: posColors, stack: "box", borderWidth: 0 },
          { label: "Median → Q3 (IQR)", data: data_medToQ3, backgroundColor: posColors, stack: "box", borderWidth: 0 },
          { label: "Q3 → Max", data: data_q3ToMax, backgroundColor: posColors.map((c) => c + "55"), stack: "box", borderWidth: 0 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: chartTextColor(),
              filter: (item) => !item.text.startsWith("_"),
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const s = stats[ctx.dataIndex];
                if (ctx.datasetIndex === 0) return null;
                if (ctx.dataset.label.startsWith("_")) return null;
                return `${s.pos}: min ${s.min.toFixed(0)} | Q1 ${s.q1.toFixed(0)} | med ${s.median.toFixed(0)} | Q3 ${s.q3.toFixed(0)} | max ${s.max.toFixed(0)}`;
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: chartTextColor() }, grid: { color: chartGridColor() } },
          y: {
            title: { display: true, text: "Projected PPR (all projected players)", color: chartTextColor() },
            ticks: { color: chartTextColor() },
            grid: { color: chartGridColor() },
            beginAtZero: false,
          },
        },
      },
    });
  }

  // ── Auto-tier detection (gap-based clustering) ─────────────────────────────
  // Given a sorted-desc list of PPR values, find indices where the drop
  // between consecutive values is unusually large. Returns array of tier IDs
  // (1, 2, 3...) parallel to the input.
  function detectTiers(sortedDesc, sigmaThreshold = 0.6) {
    if (sortedDesc.length <= 1) return sortedDesc.map(() => 1);
    const gaps = [];
    for (let i = 0; i < sortedDesc.length - 1; i++) {
      gaps.push(sortedDesc[i] - sortedDesc[i + 1]);
    }
    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((a, b) => a + (b - meanGap) ** 2, 0) / gaps.length;
    const sd = Math.sqrt(variance) || 1;
    const cutoff = meanGap + sigmaThreshold * sd;

    const tiers = [1];
    let tier = 1;
    for (let i = 1; i < sortedDesc.length; i++) {
      const gap = sortedDesc[i - 1] - sortedDesc[i];
      if (gap > cutoff) tier++;
      tiers.push(tier);
    }
    return tiers;
  }

  // ── Kernel density estimator (kept for any future use) ─────────────────────
  function kde(samples, bandwidth, gridPoints) {
    // Gaussian KDE — returns array of {x, y} where y is the density estimate.
    if (samples.length === 0 || gridPoints.length === 0) return [];
    const norm = 1 / (samples.length * bandwidth * Math.sqrt(2 * Math.PI));
    return gridPoints.map((x) => {
      let s = 0;
      for (const xi of samples) {
        const z = (x - xi) / bandwidth;
        s += Math.exp(-0.5 * z * z);
      }
      return { x, y: s * norm };
    });
  }

  function silvermanBandwidth(samples) {
    const n = samples.length;
    if (n < 2) return 1;
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    return 1.06 * sd * Math.pow(n, -1 / 5) || 1;
  }

  function renderTierMapChart() {
    destroyChart("tiermap");
    const ctx = document.getElementById("chart-tiermap");
    if (!ctx) return;

    const baseData = cache["aggregated"] || raw;
    const positions = ["QB", "RB", "WR", "TE"];

    // Colorblind-safe palette (Wong/Okabe-Ito) — distinguishable under all
    // common forms of color vision deficiency. Tier 1 brightest, descending.
    const TIER_COLORS = [
      "#F0E442",   // T1 — yellow (brightest, most "elite")
      "#E69F00",   // T2 — orange
      "#D55E00",   // T3 — vermillion
      "#56B4E9",   // T4 — sky blue
      "#0072B2",   // T5 — blue
      "#009E73",   // T6 — bluish green
      "#CC79A7",   // T7 — reddish purple
      "#999999",   // T8 — grey
      "#666666",   // T9+ — darker grey
    ];

    // Build a player list per position (no cap — every projected player shown)
    const datasetsByPos = positions.map((pos, posIdx) => {
      const playersInPos = (baseData?.players || [])
        .filter((p) => p.position === pos)
        .map((p) => ({
          name: p.name,
          pts: fantasyPoints(p.stats || {}, fmt),
        }))
        .filter((p) => p.pts > 0)
        .sort((a, b) => b.pts - a.pts);

      if (playersInPos.length === 0) {
        return { pos, points: [], tiers: [] };
      }

      const sortedPts = playersInPos.map((p) => p.pts);
      const tierIds = detectTiers(sortedPts, 0.6);

      // Flipped axes: x = projected PPR, y = position slot
      const points = playersInPos.map((p, i) => ({
        x: p.pts,
        y: posIdx,
        name: p.name,
        rank: i + 1,
        tier: tierIds[i],
        pos,
      }));

      return { pos, points, tiers: tierIds };
    });

    // Flatten into one scatter dataset per (position, tier) so we can color by tier
    const datasets = [];
    datasetsByPos.forEach(({ pos, points }) => {
      const byTier = new Map();
      points.forEach((pt) => {
        if (!byTier.has(pt.tier)) byTier.set(pt.tier, []);
        byTier.get(pt.tier).push(pt);
      });
      // Jitter Y slightly per point so dots at similar PPR don't fully overlap
      const jitter = (i) => ((i % 7) - 3) * 0.045;
      [...byTier.entries()].sort((a, b) => a[0] - b[0]).forEach(([tier, pts]) => {
        const color = TIER_COLORS[Math.min(tier - 1, TIER_COLORS.length - 1)];
        datasets.push({
          label: `${pos} T${tier}`,
          data: pts.map((p, i) => ({
            x: p.x,
            y: p.y + jitter(i),
            name: p.name,
            rank: p.rank,
            tier: p.tier,
            pos: p.pos,
          })),
          backgroundColor: color,
          borderColor: color,
          pointRadius: 5,
          pointHoverRadius: 8,
          showLine: false,
        });
      });
    });

    charts["tiermap"] = new Chart(ctx, {
      type: "scatter",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: () => "",
              label: (ctx) => {
                const r = ctx.raw;
                return `${r.name} — ${r.pos}${r.rank} (Tier ${r.tier}) · ${r.x.toFixed(1)} PPR`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            title: { display: true, text: "Projected PPR", color: chartTextColor() },
            ticks: { color: chartTextColor() },
            grid: { color: chartGridColor() },
            min: 0,
          },
          y: {
            type: "linear",
            min: -0.6,
            max: positions.length - 0.4,
            reverse: true,   // QB at the top
            ticks: {
              color: chartTextColor(),
              stepSize: 1,
              callback: (val) => positions[Math.round(val)] ?? "",
            },
            grid: { color: chartGridColor() },
          },
        },
      },
    });
  }

  // (Old violin renderer — removed)
  /*
  function renderViolinChart_removed() {
    destroyChart("violin");
    const ctx = document.getElementById("chart-violin");
    if (!ctx) return;

    const baseData = cache["aggregated"] || raw;
    const positions = ["QB", "RB", "WR", "TE"];

    // Cap samples per position to the realistically-draftable depth
    // (QB/TE start ~32, RB/WR you draft 50-60 deep in deeper leagues).
    const samplesByPos = {};
    for (const pos of positions) {
      const topN = POS_TOP_N[pos] || 36;
      samplesByPos[pos] = (baseData?.players || [])
        .filter((p) => p.position === pos)
        .map((p) => fantasyPoints(p.stats || {}, fmt))
        .filter((v) => v > 0)
        .sort((a, b) => b - a)
        .slice(0, topN);
    }

    const allVals = positions.flatMap((p) => samplesByPos[p]);
    if (allVals.length === 0) return;

    const yMin = 0;
    const yMax = Math.max(...allVals) * 1.05;
    const GRID = 60;
    const grid = [];
    for (let i = 0; i <= GRID; i++) grid.push(yMin + (yMax - yMin) * (i / GRID));

    // Compute KDE for each position; normalize all to share a common width.
    const kdeByPos = {};
    let globalMaxDensity = 0;
    for (const pos of positions) {
      const s = samplesByPos[pos];
      if (s.length < 2) {
        kdeByPos[pos] = [];
        continue;
      }
      const bw = silvermanBandwidth(s);
      const points = kde(s, bw, grid);
      kdeByPos[pos] = points;
      const localMax = Math.max(...points.map((p) => p.y));
      if (localMax > globalMaxDensity) globalMaxDensity = localMax;
    }

    // Each violin is plotted as a closed polygon centered at its category X.
    // Chart.js category axis uses integer indices, so X centers are 0..3.
    // We draw each violin as a scatter dataset with showLine=true and fill,
    // mirroring left and right of the center.
    const VIOLIN_HALF_WIDTH = 0.42;   // in category-axis units

    const datasets = [];
    positions.forEach((pos, idx) => {
      const points = kdeByPos[pos];
      if (points.length === 0) return;
      const color = POS_COLORS[pos];

      // Build polygon: go up the right side, then back down the left.
      const right = points.map((p) => ({
        x: idx + (p.y / globalMaxDensity) * VIOLIN_HALF_WIDTH,
        y: p.x,
      }));
      const left = [...points]
        .reverse()
        .map((p) => ({
          x: idx - (p.y / globalMaxDensity) * VIOLIN_HALF_WIDTH,
          y: p.x,
        }));
      const polygon = [...right, ...left, right[0]];

      datasets.push({
        label: pos,
        data: polygon,
        showLine: true,
        fill: true,
        backgroundColor: color + "55",
        borderColor: color,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.25,
      });

      // Median marker
      const sorted = [...samplesByPos[pos]].sort((a, b) => a - b);
      const median = quantile(sorted, 0.5);
      datasets.push({
        label: pos + " median",
        data: [
          { x: idx - VIOLIN_HALF_WIDTH * 0.5, y: median },
          { x: idx + VIOLIN_HALF_WIDTH * 0.5, y: median },
        ],
        showLine: true,
        borderColor: "#ffffff",
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
      });
    });

    charts["violin"] = new Chart(ctx, {
      type: "scatter",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: chartTextColor(),
              filter: (item) => !item.text.endsWith(" median"),
            },
          },
          tooltip: {
            callbacks: {
              title: () => "",
              label: (ctx) => {
                const pos = ctx.dataset.label.replace(" median", "");
                return `${pos}: ~${ctx.raw.y.toFixed(0)} PPR`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: -0.6,
            max: positions.length - 0.4,
            ticks: {
              color: chartTextColor(),
              stepSize: 1,
              callback: (val) => positions[val] ?? "",
            },
            grid: { color: chartGridColor() },
          },
          y: {
            title: { display: true, text: "Projected PPR", color: chartTextColor() },
            ticks: { color: chartTextColor() },
            grid: { color: chartGridColor() },
            min: 0,
          },
        },
      },
    });
  }
  */

  async function renderViz() {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js not loaded");
      return;
    }
    await ensureAllSourcesLoaded();
    // Make sure aggregated is built for the tier + distribution + violin charts
    if (!cache["aggregated"]) {
      cache["aggregated"] = buildAggregated([
        { label: "FantasyPros", data: cache["data"] },
        { label: "Clay",        data: cache["clay"] },
      ]);
    }
    renderDisagreementChart();
    renderTiersChart();
    renderDistributionChart();
    renderTierMapChart();
  }

  // Position filter inside the viz tab
  const $vizPosChips = document.getElementById("viz-pos-chips");
  if ($vizPosChips) {
    $vizPosChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      document.querySelectorAll("#viz-pos-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      vizPos = chip.dataset.pos;
      renderDisagreementChart();
    });
  }

  load();
})();
