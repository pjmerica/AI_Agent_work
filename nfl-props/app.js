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

  function buildAggregated(fp, clay) {
    // Join by player name (lowercased, basic normalization). Average each stat
    // across the two sources. If a player only appears in one source, take that.
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
      // Track which sources contributed so we can average correctly
      entry.sources.push(sourceLabel);
      // Accumulate; we'll divide by count at the end
      for (const k of Object.keys(entry.stats)) {
        entry.stats[k] += (player.stats?.[k] || 0);
      }
      // Prefer non-empty team / position
      if (!entry.team && player.team) entry.team = player.team;
      if (!entry.position && player.position) entry.position = player.position;
    };

    (fp?.players || []).forEach((p) => consume(p, "FantasyPros"));
    (clay?.players || []).forEach((p) => consume(p, "Clay"));

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
      lastUpdated: fp?.lastUpdated || clay?.lastUpdated || null,
      season: fp?.season || clay?.season || "",
      source: "Aggregated (FantasyPros + Mike Clay)",
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
        if (fp) cache["data"] = fp;
        if (clay) cache["clay"] = clay;
        cache["aggregated"] = buildAggregated(fp, clay);
        raw = cache["aggregated"];
      } else {
        const file = srcKey === "clay" ? "clay.json" : "data.json";
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

  // Source tabs (FantasyPros vs Mike Clay)
  const $sourceTabs = document.getElementById("source-tabs");
  if ($sourceTabs) {
    $sourceTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".source-tab");
      if (!tab) return;
      if (tab.dataset.disabled === "true") return;
      document.querySelectorAll(".source-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentSource = tab.dataset.source;
      loadSource(currentSource);
    });
  }

  load();
})();
