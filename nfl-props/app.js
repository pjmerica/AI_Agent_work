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
    // Average each stat across whichever sources contributed for each player.
    const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const byKey = new Map();

    const consume = (player, sourceLabel) => {
      const key = norm(player.name);
      if (!key) return;
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          name: player.name,
          team: player.team,
          position: player.position,
          stats: { pass_yds: 0, pass_tds: 0, pass_ints: 0, rush_yds: 0, rush_tds: 0, rec_yds: 0, rec_tds: 0, receptions: 0, fumbles_lost: 0 },
          sources: [],
        };
        byKey.set(key, entry);
      }
      entry.sources.push(sourceLabel);
      for (const k of Object.keys(entry.stats)) {
        entry.stats[k] += (player.stats?.[k] || 0);
      }
      if (!entry.team && player.team) entry.team = player.team;
      if (!entry.position && player.position) entry.position = player.position;
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

    const out = [];
    for (const entry of byKey.values()) {
      const n = entry.sources.length;
      const avg = {};
      for (const k of Object.keys(entry.stats)) {
        avg[k] = Math.round((entry.stats[k] / n) * 10) / 10;
      }
      out.push({
        name: entry.name,
        team: entry.team,
        position: entry.position,
        stats: avg,
        sources: entry.sources,
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
        const [fp, clay, nflcom] = await Promise.all([
          cache["data"]   ? Promise.resolve(cache["data"])   : fetchJson("data.json").catch(() => null),
          cache["clay"]   ? Promise.resolve(cache["clay"])   : fetchJson("clay.json").catch(() => null),
          cache["nflcom"] ? Promise.resolve(cache["nflcom"]) : fetchJson("nflcom.json").catch(() => null),
        ]);
        if (fp)     cache["data"]   = fp;
        if (clay)   cache["clay"]   = clay;
        if (nflcom) cache["nflcom"] = nflcom;
        cache["aggregated"] = buildAggregated([
          { label: "FantasyPros", data: fp },
          { label: "Clay",        data: clay },
          { label: "NFL.com",     data: nflcom },
        ]);
        raw = cache["aggregated"];
      } else {
        const fileMap = { clay: "clay.json", nflcom: "nflcom.json", data: "data.json" };
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
    if (currentSource === "viz" && typeof Chart !== "undefined") {
      // Aggregated cache pre-built fantasy points using the OLD fmt for the
      // chart datasets; force rebuild by clearing it.
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

  // Source tabs
  const $sourceTabs = document.getElementById("source-tabs");
  if ($sourceTabs) {
    $sourceTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".source-tab");
      if (!tab) return;
      if (tab.dataset.disabled === "true") return;
      document.querySelectorAll(".source-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentSource = tab.dataset.source;
      if (currentSource === "viz") {
        showVizView();
      } else {
        showTableView();
        loadSource(currentSource);
      }
    });
  }

  // ── Visualizations ─────────────────────────────────────────────────────────
  let vizPos = "ALL";
  const charts = {};

  // Ensure all three source files are loaded for the disagreement chart
  async function ensureAllSourcesLoaded() {
    const needs = ["data", "clay", "nflcom"].filter((k) => !cache[k]);
    if (needs.length === 0) return;
    const fileMap = { data: "data.json", clay: "clay.json", nflcom: "nflcom.json" };
    await Promise.all(needs.map(async (k) => {
      try { cache[k] = await fetchJson(fileMap[k]); }
      catch (e) { cache[k] = null; }
    }));
  }

  // Build a per-player map of PPR projections by source, for the current format
  function buildDisagreementData() {
    const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const byKey = new Map();

    const consume = (data, label) => {
      if (!data || !data.players) return;
      for (const p of data.players) {
        const key = norm(p.name);
        if (!key) continue;
        let entry = byKey.get(key);
        if (!entry) {
          entry = { name: p.name, position: p.position, team: p.team, perSource: {} };
          byKey.set(key, entry);
        }
        const pts = fantasyPoints(p.stats || {}, fmt);
        entry.perSource[label] = pts;
        if (!entry.position && p.position) entry.position = p.position;
      }
    };

    consume(cache["data"],   "FantasyPros");
    consume(cache["clay"],   "Clay");
    consume(cache["nflcom"], "NFL.com");

    const rows = [];
    for (const entry of byKey.values()) {
      const vals = Object.values(entry.perSource).filter((v) => v > 0);
      if (vals.length < 2) continue;   // need at least two sources to compute spread
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
          y: { ticks: { color: chartTextColor(), font: { size: 11 } }, grid: { display: false } },
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

  function renderDistributionChart() {
    destroyChart("distribution");
    const ctx = document.getElementById("chart-distribution");
    if (!ctx) return;

    const baseData = cache["aggregated"] || raw;
    const positions = ["QB", "RB", "WR", "TE"];

    // For each position, take only fantasy-startable players (top 36) and
    // compute quartiles for a manual box-plot rendering via stacked bars.
    const stats = positions.map((pos) => {
      const vals = (baseData?.players || [])
        .filter((p) => p.position === pos)
        .map((p) => fantasyPoints(p.stats || {}, fmt))
        .filter((v) => v > 0)
        .sort((a, b) => a - b)
        .slice(-36);   // top 36 (smallest first because sorted asc)
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
            title: { display: true, text: "Projected PPR (top 36 per position)", color: chartTextColor() },
            ticks: { color: chartTextColor() },
            grid: { color: chartGridColor() },
            beginAtZero: false,
          },
        },
      },
    });
  }

  async function renderViz() {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js not loaded");
      return;
    }
    await ensureAllSourcesLoaded();
    // Make sure aggregated is built for the tier + distribution charts
    if (!cache["aggregated"]) {
      cache["aggregated"] = buildAggregated([
        { label: "FantasyPros", data: cache["data"] },
        { label: "Clay",        data: cache["clay"] },
        { label: "NFL.com",     data: cache["nflcom"] },
      ]);
    }
    renderDisagreementChart();
    renderTiersChart();
    renderDistributionChart();
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
