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

  // Whole-name fixes for cases the first-name alias map cannot reach: a
  // nickname that is not a standard shortening, and a misspelling one source
  // ships. Keyed on the already-normalized name.
  const FULL_NAME_ALIASES = {
    "cam skattebo": "cameron skattebo",
    "quishon judkins": "quinshon judkins",
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
    return FULL_NAME_ALIASES[out] || out;
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

    // Stage 2: merge nickname-form buckets via altKey + position + team.
    // SAFETY: two RBs both named "B. Robinson" (Bijan vs Brian Robinson Jr.)
    // would otherwise collapse into one entry. We only merge when:
    //   (a) altKey + position + team all match, AND
    //   (b) one canonical first name is a known nickname of the other (or one
    //       is a prefix of the other, like "ken" → "kenneth").
    const altIndex = new Map();   // altKey|position|team → bucket
    const isNicknameMatch = (nameA, nameB) => {
      const firstA = (nameA.split(" ")[0] || "").toLowerCase();
      const firstB = (nameB.split(" ")[0] || "").toLowerCase();
      if (!firstA || !firstB) return false;
      if (firstA === firstB) return true;
      // alias map covers ken↔kenneth, mike↔michael, etc.
      if (FIRST_NAME_ALIASES[firstA] === firstB) return true;
      if (FIRST_NAME_ALIASES[firstB] === firstA) return true;
      if (FIRST_NAME_ALIASES[firstA] && FIRST_NAME_ALIASES[firstA] === FIRST_NAME_ALIASES[firstB]) return true;
      // Prefix match like "ken" → "kenneth"
      if (firstA.length >= 3 && firstB.startsWith(firstA)) return true;
      if (firstB.length >= 3 && firstA.startsWith(firstB)) return true;
      return false;
    };

    for (const [key, bucket] of byKey.entries()) {
      const altKey = altPlayerKey(bucket.name) + "|" + (bucket.position || "") + "|" + (bucket.team || "");
      const existing = altIndex.get(altKey);
      if (!existing) {
        altIndex.set(altKey, bucket);
        continue;
      }
      // Same alt key, position, AND team. Only merge if the first names are
      // nickname-compatible (catches Ken↔Kenneth Walker, NOT Bijan↔Brian Robinson).
      if (!isNicknameMatch(bucket.name, existing.name)) {
        continue;
      }
      // Pick the bucket with the longer canonical name as keeper.
      const keeper = bucket.name.length >= existing.name.length ? bucket : existing;
      const dropped = keeper === bucket ? existing : bucket;
      if (keeper !== existing) altIndex.set(altKey, keeper);
      const existingSources = new Set(keeper.contributions.map((c) => c.source));
      for (const c of dropped.contributions) {
        if (!existingSources.has(c.source)) keeper.contributions.push(c);
      }
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
    if (currentView === "market") renderMarket();   // points are format-dependent
    if (currentView === "weekly") renderWeekly();
    if (currentView === "multi") renderMulti();
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
    if (currentView === "vegas") renderVegas();
    else if (currentView === "market") renderMarket();
    else if (currentView === "weekly") renderWeekly();
    else if (currentView === "multi") renderMulti();
    else render();
  });

  // ── View switcher (table view vs viz view) ─────────────────────────────────
  const $tableView = document.getElementById("table-view");
  const $vizView = document.getElementById("viz-view");

  const $vegasView = document.getElementById("vegas-view");
  const $marketView = document.getElementById("market-view");
  const $weeklyView = document.getElementById("weekly-view");
  const $multiView = document.getElementById("multi-view");
  const $sitstartView = document.getElementById("sitstart-view");
  const $h2hView = document.getElementById("h2h-view");
  const $sleeperView = document.getElementById("sleeper-view");

  function hideAllViews() {
    if ($tableView) $tableView.classList.add("hidden");
    if ($vizView) $vizView.classList.add("hidden");
    if ($vegasView) $vegasView.classList.add("hidden");
    if ($marketView) $marketView.classList.add("hidden");
    if ($weeklyView) $weeklyView.classList.add("hidden");
    if ($multiView) $multiView.classList.add("hidden");
    if ($sitstartView) $sitstartView.classList.add("hidden");
    if ($h2hView) $h2hView.classList.add("hidden");
    if ($sleeperView) $sleeperView.classList.add("hidden");
  }

  function showTableView() {
    hideAllViews();
    if ($tableView) $tableView.classList.remove("hidden");
  }

  function showVizView() {
    hideAllViews();
    if ($vizView) $vizView.classList.remove("hidden");
    renderViz();
  }

  function showVegasView() {
    hideAllViews();
    if ($vegasView) $vegasView.classList.remove("hidden");
    renderVegas();
  }

  async function showMarketView() {
    hideAllViews();
    if ($marketView) $marketView.classList.remove("hidden");
    // Reuses the same four files the Vegas view loads.
    await ensureMarketData();
    renderMarket();
  }

  async function showWeeklyView() {
    hideAllViews();
    if ($weeklyView) $weeklyView.classList.remove("hidden");
    if (!cache["weekly"]) {
      try { cache["weekly"] = await fetchJson("weekly.json"); }
      catch (e) { cache["weekly"] = null; }
    }
    if (!cache["oddsapi"]) {
      try { cache["oddsapi"] = await fetchJson("oddsapi.json"); }
      catch (e) { cache["oddsapi"] = null; }
    }
    if (!cache["dktd"]) {
      try { cache["dktd"] = await fetchJson("dk_td.json"); }
      catch (e) { cache["dktd"] = null; }
    }
    // Positions come from the projection sources; the weekly feed has none.
    await ensureMarketData();
    renderWeekly();
  }

  async function showMultiView() {
    hideAllViews();
    if ($multiView) $multiView.classList.remove("hidden");
    if (!cache["multiweek"]) {
      try { cache["multiweek"] = await fetchJson("multiweek.json"); }
      catch (e) { cache["multiweek"] = null; }
    }
    await ensureMarketData();   // positions come from the projection sources
    renderMulti();
  }

  async function showSleeperView() {
    hideAllViews();
    if ($sleeperView) $sleeperView.classList.remove("hidden");
    for (const [key, file] of [["weekly", "weekly.json"],
                               ["oddsapi", "oddsapi.json"],
                               ["dktd", "dk_td.json"]]) {
      if (!cache[key]) {
        try { cache[key] = await fetchJson(file); }
        catch (e) { cache[key] = null; }
      }
    }
    await ensureMarketData();

    // Reload whoever was signed in last, so the tab opens where it was left.
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
    renderSleeper();
  }

  async function showH2HView() {
    hideAllViews();
    if ($h2hView) $h2hView.classList.remove("hidden");
    for (const [key, file] of [["weekly", "weekly.json"],
                               ["oddsapi", "oddsapi.json"],
                               ["dktd", "dk_td.json"]]) {
      if (!cache[key]) {
        try { cache[key] = await fetchJson(file); }
        catch (e) { cache[key] = null; }
      }
    }
    await ensureMarketData();
    const $meta = document.getElementById("h2h-meta");
    const wkd = cache["weekly"];
    if ($meta && wkd) $meta.textContent = `Week ${wkd.week} · half-PPR`;
    fillH2HNames();
    renderH2H();
  }

  async function showSitStartView() {
    hideAllViews();
    if ($sitstartView) $sitstartView.classList.remove("hidden");
    if (!cache["weekly"]) {
      try { cache["weekly"] = await fetchJson("weekly.json"); }
      catch (e) { cache["weekly"] = null; }
    }
    if (!cache["oddsapi"]) {
      try { cache["oddsapi"] = await fetchJson("oddsapi.json"); }
      catch (e) { cache["oddsapi"] = null; }
    }
    if (!cache["dktd"]) {
      try { cache["dktd"] = await fetchJson("dk_td.json"); }
      catch (e) { cache["dktd"] = null; }
    }
    await ensureMarketData();
    const $meta = document.getElementById("sitstart-meta");
    const wkd = cache["weekly"];
    if ($meta && wkd) $meta.textContent = `Week ${wkd.week} · half-PPR`;
    renderRosterTags();
    renderSitStart();
  }

  async function ensureMarketData() {
    const files = { vegas: "vegas.json", kalshi: "kalshi.json", data: "data.json",
                    clay: "clay.json", adp: "adp.json", bovada: "bovada.json" };
    for (const [key, file] of Object.entries(files)) {
      if (!cache[key]) {
        try { cache[key] = await fetchJson(file); }
        catch (e) { cache[key] = null; }
      }
    }
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

      // Source tabs only apply to the rankings table; the viz and Vegas views
      // draw from their own fixed sources.
      const showSources = currentView === "rankings";
      if ($sourceTabsContainer) {
        $sourceTabsContainer.classList.toggle("hidden", !showSources);
      }

      if (currentView === "rankings") showTableView();
      else if (currentView === "vegas") showVegasView();
      else if (currentView === "market") showMarketView();
      else if (currentView === "weekly") showWeeklyView();
      else if (currentView === "multi") showMultiView();
      else if (currentView === "sitstart") showSitStartView();
      else if (currentView === "h2h") showH2HView();
      else if (currentView === "sleeper") showSleeperView();
      else showVizView();
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

    // Extended colorblind-aware palette. Anchored on Wong/Okabe-Ito for the
    // top tiers (which matter most for readability) and supplemented with
    // distinct hues + lightness steps for the long tail of deep tiers.
    const TIER_COLORS = [
      "#F0E442",   // T1  — yellow
      "#E69F00",   // T2  — orange
      "#D55E00",   // T3  — vermillion
      "#56B4E9",   // T4  — sky blue
      "#0072B2",   // T5  — blue
      "#009E73",   // T6  — bluish green
      "#CC79A7",   // T7  — reddish purple
      "#A6CEE3",   // T8  — light blue
      "#B2DF8A",   // T9  — light green
      "#FB9A99",   // T10 — salmon
      "#FDBF6F",   // T11 — light orange
      "#CAB2D6",   // T12 — lavender
      "#FFFF99",   // T13 — pale yellow
      "#999999",   // T14 — grey
      "#666666",   // T15+ — darker grey
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
      const tierIds = detectTiers(sortedPts, 1.0);

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

  // ── Vegas Lines view ───────────────────────────────────────────────────────
  // Raw season-long sportsbook lines compared per-stat against the projection
  // sources. Deliberately NOT converted to fantasy points: books post no
  // season-long receptions or receiving-TD markets, so a PPR total built from
  // these would understate every pass-catcher. See scripts/fetch_vegas_season_props.py.

  let vegasPos = "ALL";
  let vegasOnlyDelta = false;
  let vegasSortDesc = true;

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

  // Build lookup of projection stats by normalized name, with altKey fallback —
  // same two-stage strategy buildAggregated() uses.
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

  function fmtNum(v, dec) {
    if (v == null || !isFinite(v)) return "—";
    return v.toFixed(dec == null ? 1 : dec);
  }

  function fmtOdds(o) {
    if (o == null) return "—";
    return o > 0 ? "+" + o : String(o);
  }

  async function renderVegas() {
    const $vrows = document.getElementById("vegas-rows");
    const $vempty = document.getElementById("vegas-empty");
    if (!$vrows) return;

    // Load both market sources + both projection sources (shared cache).
    if (!cache["vegas"]) {
      try { cache["vegas"] = await fetchJson("vegas.json"); }
      catch (e) { cache["vegas"] = null; }
    }
    if (!cache["kalshi"]) {
      try { cache["kalshi"] = await fetchJson("kalshi.json"); }
      catch (e) { cache["kalshi"] = null; }
    }
    for (const k of ["data", "clay"]) {
      if (!cache[k]) {
        try { cache[k] = await fetchJson(k === "data" ? "data.json" : "clay.json"); }
        catch (e) { cache[k] = null; }
      }
    }

    const vegas = cache["vegas"];
    if (!vegas || !Array.isArray(vegas.players) || !vegas.players.length) {
      $vrows.innerHTML = "";
      if ($vempty) {
        $vempty.textContent =
          "No Vegas data. Run scripts/fetch_vegas_season_props.py to generate vegas.json.";
        $vempty.classList.remove("hidden");
      }
      return;
    }

    const fpLut   = buildProjLookup(cache["data"]);
    const clayLut = buildProjLookup(cache["clay"]);
    const kalshiLut = buildProjLookup(cache["kalshi"]);

    // A player-stat can exist on one market but not the other (Kalshi has
    // receptions and rec TDs; FanDuel has neither), so union both sources
    // rather than iterating FanDuel alone.
    const combined = new Map(); // "normName|statKey" -> row
    const rowFor = (name, position, statKey) => {
      const id = normPlayerName(name) + "|" + statKey;
      let r = combined.get(id);
      if (!r) {
        r = {
          name, position, statKey,
          line: null, over: null, under: null,
          kalshi: null, kalshiConfident: false,
          fpVal: null, clayVal: null, delta: null,
        };
        combined.set(id, r);
      }
      return r;
    };

    for (const p of vegas.players) {
      for (const [statKey, m] of Object.entries(p.markets || {})) {
        const r = rowFor(p.name, p.position, statKey);
        r.line = m.line; r.over = m.over; r.under = m.under;
      }
    }

    const kalshi = cache["kalshi"];
    if (kalshi && Array.isArray(kalshi.players)) {
      for (const p of kalshi.players) {
        for (const [statKey, s] of Object.entries(p.stats || {})) {
          if (s.median == null) continue;   // no usable P=0.50 crossing
          const r = rowFor(p.name, p.position || null, statKey);
          r.kalshi = s.median;
          r.kalshiConfident = (s.confidentRungs || 0) >= 2;
        }
      }
    }

    let rows = [];
    for (const r of combined.values()) {
      // Kalshi carries no position; backfill it from the projection files, which
      // are loaded for that purpose only — they are not shown as columns.
      if (!r.position) {
        const fp   = lookupProj(fpLut, r.name);
        const clay = lookupProj(clayLut, r.name);
        r.position = (fp && fp.position) || (clay && clay.position) || null;
      }

      if (vegasPos !== "ALL" && r.position !== vegasPos) continue;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) continue;

      // Delta is market-vs-market: how far Kalshi sits from the FanDuel line.
      // Positive = Kalshi is higher. Only meaningful when both books quote it.
      if (r.kalshi != null && r.line) {
        r.delta = ((r.kalshi - r.line) / r.line) * 100;
      }
      rows.push(r);
    }

    // Both sources price the same event, so unlike a projection-vs-market
    // comparison there is no systematic bias to correct for — a raw delta is
    // already the signal. Big gaps mean the two markets genuinely disagree.
    if (vegasOnlyDelta) {
      rows = rows.filter((r) => r.delta != null && Math.abs(r.delta) > 10);
    }

    // Sort by |delta|, rows missing one source last.
    rows.sort((a, b) => {
      const av = a.delta == null ? -Infinity : Math.abs(a.delta);
      const bv = b.delta == null ? -Infinity : Math.abs(b.delta);
      return vegasSortDesc ? bv - av : av - bv;
    });

    if (!rows.length) {
      $vrows.innerHTML = "";
      if ($vempty) {
        $vempty.textContent = "No players match.";
        $vempty.classList.remove("hidden");
      }
      return;
    }
    if ($vempty) $vempty.classList.add("hidden");

    const isTd = (k) => k.endsWith("_tds");
    $vrows.innerHTML = rows.map((r) => {
      const dec = isTd(r.statKey) ? 1 : 0;
      let dCls = "delta-flat", dTxt = "—", dTitle = "";
      if (r.delta != null) {
        dTxt = (r.delta > 0 ? "+" : "") + r.delta.toFixed(1) + "%";
        dCls = r.delta > 5 ? "delta-up" : r.delta < -5 ? "delta-down" : "delta-flat";
        dTitle = r.delta > 0
          ? `Kalshi prices this ${Math.abs(r.delta).toFixed(1)}% above FanDuel's line`
          : `Kalshi prices this ${Math.abs(r.delta).toFixed(1)}% below FanDuel's line`;
      } else {
        dTitle = r.line == null ? "FanDuel does not post this market"
                                : "No usable Kalshi ladder for this stat";
      }
      const posClass = "pos-" + (r.position || "?");
      return `<tr>
        <td class="player-name">${escapeHtml(r.name)}</td>
        <td><span class="pos-badge ${posClass}">${escapeHtml(r.position || "?")}</span></td>
        <td class="stat-label">${escapeHtml(STAT_LABELS[r.statKey] || r.statKey)}</td>
        <td class="num vegas-line">${fmtNum(r.line, dec)}</td>
        <td class="num odds">${r.line == null ? "—" : escapeHtml(fmtOdds(r.over)) + " / " + escapeHtml(fmtOdds(r.under))}</td>
        <td class="num kalshi-line${r.kalshi != null && !r.kalshiConfident ? " thin" : ""}"
            ${r.kalshi != null && !r.kalshiConfident ? 'title="Thin market — fewer than 2 tight-spread strikes"' : ""}
        >${fmtNum(r.kalshi, dec)}${r.kalshi != null && !r.kalshiConfident ? "*" : ""}</td>
        <td class="num ${dCls}" title="${escapeHtml(dTitle)}">${dTxt}</td>
      </tr>`;
    }).join("");

    const $ec = document.getElementById("event-count");
    const $lu = document.getElementById("last-updated");
    const $pc = document.getElementById("player-count");
    if ($pc) $pc.textContent = String(new Set(rows.map((r) => r.name)).size);
    if ($ec) $ec.textContent = cache["kalshi"] ? "FanDuel + Kalshi" : "FanDuel";
    // Show the staler of the two so it's obvious when one source lags.
    const stamps = [vegas.lastUpdated, cache["kalshi"] && cache["kalshi"].lastUpdated]
      .filter(Boolean).map((s) => new Date(s));
    if ($lu && stamps.length) {
      $lu.textContent = new Date(Math.min(...stamps)).toLocaleString();
    }
  }








  // -- Free agents -------------------------------------------------------------
  // Sleeper exposes every roster in a league, so anyone on the market board who
  // is not on one of them is a free agent. No extra endpoint needed.
  //
  // Ranking those by raw projection is useless: only one QB starts, so an
  // unrostered QB tops every list while being worthless to a team that already
  // has one. What matters is the UPGRADE — how much a pickup would add to the
  // optimal lineup — so each candidate is measured against the weakest player
  // the optimizer currently starts at a slot he could fill.

  function freeAgentsFor(lg, rosteredKeys, startersByName) {
    const pool = buildSitStartPoolFull();

    // The weakest current starter each position could displace. A WR competes
    // with the weakest of (WR slots + FLEX slots), not with the whole lineup.
    const slotFloor = {};
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      let worst = null;
      for (const [slot, p] of startersByName) {
        if (!p) continue;
        const accepts = SLOT_ACCEPTS[slot] || [];
        if (!accepts.includes(pos)) continue;
        if (worst === null || p.points < worst) worst = p.points;
      }
      slotFloor[pos] = worst;
    }

    const out = [];
    for (const [key, p] of pool) {
      if (rosteredKeys.has(key)) continue;
      if (!p.position || p.tdOnly) continue;
      const pts = leaguePoints(p.stats, lg.scoring, p.position);
      if (pts <= 0) continue;
      const floor = slotFloor[p.position];
      out.push({
        name: p.name,
        position: p.position,
        matchup: p.matchup,
        points: pts,
        // null floor = no slot on this roster accepts the position, so there is
        // nothing to upgrade; those sort last rather than claiming a huge gain.
        upgrade: floor == null ? null : Math.round((pts - floor) * 10) / 10,
        replaces: floor,
      });
    }
    out.sort((a, b) => {
      const ua = a.upgrade == null ? -Infinity : a.upgrade;
      const ub = b.upgrade == null ? -Infinity : b.upgrade;
      return ub - ua || b.points - a.points;
    });
    return out;
  }

  function freeAgentTable(fas, lg) {
    const gains = fas.filter((f) => f.upgrade != null && f.upgrade > 0).slice(0, 12);
    if (!gains.length) {
      return '<div class="sitstart-section">Free agents</div>' +
        '<div class="verdict" style="font-size:13px;color:#6a6a8a">' +
        "Nothing on the wire projects above your current starters this week." +
        (fas.length ? " (" + fas.length + " unrostered players do have lines.)" : "") +
        "</div>";
    }
    let html = '<div class="sitstart-section">Best available &mdash; ranked by ' +
      "upgrade over your weakest starter at the position</div>" +
      '<div class="table-wrap"><table class="slot-table"><thead><tr>' +
      "<th>Player</th><th>Pos</th><th>Game</th>" +
      '<th style="text-align:right">Proj</th>' +
      '<th style="text-align:right">Upgrade</th></tr></thead><tbody>';
    for (const f of gains) {
      html += '<tr><td class="player-name">' + escapeHtml(f.name) + "</td>" +
        '<td><span class="pos-badge pos-' + escapeHtml(f.position) + '">' +
        escapeHtml(f.position) + "</span></td>" +
        '<td class="weekly-game">' + escapeHtml(f.matchup || "-") + "</td>" +
        '<td style="text-align:right">' + f.points.toFixed(1) + "</td>" +
        '<td style="text-align:right"><span style="color:#58d68d;font-weight:700">+' +
        f.upgrade.toFixed(1) + "</span></td></tr>";
    }
    html += "</tbody></table></div>";
    return html;
  }

  // -- Sleeper live login ------------------------------------------------------
  // Reads a user's leagues and rosters straight from Sleeper in the browser.
  // Sleeper's read API is public, CORS-open and needs no password, so there is
  // no credential to handle and nothing to store server-side. The username is
  // kept in localStorage purely so the tab reloads to the same place.
  //
  // Roster IDs are resolved through nfl-props/sleeper_players.json, a ~31 KB
  // trimmed map. Sleeper's own dictionary is 14.6 MB, which would dominate page
  // load just to turn 30 ids into names.

  const SLEEPER_API = "https://api.sleeper.app/v1";
  const SLEEPER_LS_KEY = "nflprops.sleeperUser";

  let sleeperLive = null;     // { username, userId, leagues: [...] }
  let sleeperBusy = false;

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

  // Which NFL season to ask Sleeper for. The weekly board knows the season it
  // was built from, so use that rather than the calendar — in January the two
  // disagree and the calendar is the wrong answer.
  function sleeperSeason() {
    const wk = cache["weekly"];
    return (wk && wk.season) || String(new Date().getFullYear());
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

  document.getElementById("sleeper-go")?.addEventListener("click", () => {
    const $u = document.getElementById("sleeper-user");
    loadSleeperUser($u ? $u.value : "");
  });
  document.getElementById("sleeper-user")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadSleeperUser(e.target.value);
  });
  document.getElementById("sleeper-forget")?.addEventListener("click", () => {
    sleeperLive = null;
    try { localStorage.removeItem(SLEEPER_LS_KEY); } catch (e) { /* ignore */ }
    const $u = document.getElementById("sleeper-user");
    if ($u) $u.value = "";
    const $forget = document.getElementById("sleeper-forget");
    if ($forget) $forget.hidden = true;
    const $chips = document.getElementById("sleeper-league-chips");
    if ($chips) $chips.innerHTML = "";
    const $meta = document.getElementById("sleeper-meta");
    if ($meta) $meta.textContent = "";
    sleeperStatus("");
    const $out = document.getElementById("sleeper-output");
    if ($out) $out.innerHTML = '<div class="empty">Enter a Sleeper username to load your leagues.</div>';
  });

  // -- Sleeper leagues ---------------------------------------------------------
  // Scores the owner's real rosters against this week's market board. Slot
  // shape and scoring come from each league rather than being assumed: of the
  // four leagues here one is 0.5 PPR, two are full PPR, and one is a superflex
  // best-ball with a TE premium and four flex slots. A hardcoded
  // QB/RB/RB/WR/WR/TE/FLEX/FLEX would be wrong for most of them.

  let sleeperLeagueIdx = 0;

  // Sleeper slot name -> positions that may fill it.
  const SLOT_ACCEPTS = {
    QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"],
    FLEX: ["RB", "WR", "TE"],
    WRRB_FLEX: ["RB", "WR"],
    REC_FLEX: ["WR", "TE"],
    SUPER_FLEX: ["QB", "RB", "WR", "TE"],
    K: ["K"], DEF: ["DEF"], DST: ["DEF"],
  };

  // League scoring differs from the fixed half-PPR the other tabs use, so
  // points are recomputed per league rather than reused.
  function leaguePoints(stats, scoring, position) {
    const g = (k) => {
      const s = stats[k];
      return s && s.line != null ? s.line : 0;
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

  // Same exhaustive assignment used by Start/Sit, generalised to a slot list.
  // Rosters here reach 36 players, so the search is capped: for each slot only
  // the top few eligible players can ever matter, which keeps it instant
  // without changing the answer.
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

    const scored = [], unpriced = [], noMarket = [];
    for (const r of lg.roster) {
      if (r.unpriced) { noMarket.push(r); continue; }
      const p = pool.get(normPlayerName(r.name));
      if (!p || p.tdOnly || p.points <= 0 || !p.position) {
        unpriced.push(r);
        continue;
      }
      scored.push({
        name: r.name,
        position: r.position || p.position,
        matchup: p.matchup,
        points: leaguePoints(p.stats, lg.scoring, r.position || p.position),
        injury: r.injury,
        wasStarter: r.starter,
      });
    }

    const slots = lg.slots || [];
    const best = bestLineupForSlots(scored, slots);
    const startingNames = new Set(best.picks.filter(Boolean).map((p) => p.name));
    // Slot-to-starter pairs let the free-agent ranking know which slots a
    // position could actually displace.
    const startersBySlot = best.picks.map((p, i) => [slots[i], p]);
    const bench = scored.filter((p) => !startingNames.has(p.name))
      .sort((a, b) => b.points - a.points);

    let html = '<div class="league-scoring">' +
      escapeHtml(slots.join(" / ")) + "</div>";

    html += '<div class="table-wrap"><table class="slot-table"><thead><tr>' +
      "<th>Slot</th><th>Player</th><th>Pos</th><th>Game</th>" +
      '<th style="text-align:right">Proj</th></tr></thead><tbody>';
    best.picks.forEach((p, i) => {
      const slot = slots[i];
      const isFlex = (SLOT_ACCEPTS[slot] || []).length > 1;
      const badge = '<span class="slot-badge' + (isFlex ? " flex" : "") + '">' +
                    escapeHtml(slot) + "</span>";
      if (!p) {
        html += '<tr class="bench-row"><td>' + badge +
                '</td><td colspan="4">nobody eligible</td></tr>';
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
        p.points.toFixed(1) + "</span></td></tr>";
    });
    html += "</tbody></table></div>";
    html += '<div class="sitstart-total">Projected starters: ' +
            best.total.toFixed(1) + " pts (K/DEF not projected)</div>";

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
          '<td style="text-align:right">' + p.points.toFixed(1) + "</td></tr>";
      }
      html += "</tbody></table></div>";
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
        freeAgentsFor(lg, lg.rosteredKeys, startersBySlot), lg);
    }
    $out.innerHTML = html;
  }

  // -- Head-to-head ------------------------------------------------------------
  // A dedicated two-player call. The projected total answers "who", but the
  // per-stat split answers "why", which is what makes the call trustworthy:
  // a 2-point edge built entirely on touchdown equity is a different bet from
  // the same edge built on receptions.

  // Half-PPR point value of one unit of each stat, so a stat-level edge can be
  // expressed in the same currency as the total.
  const H2H_WEIGHTS = {
    pass_yds: 0.04, pass_tds: 4, rush_yds: 0.1,
    rec_yds: 0.1, receptions: 0.5, any_tds: 6,
  };
  const H2H_ORDER = ["pass_yds", "pass_tds", "rush_yds", "receptions",
                     "rec_yds", "any_tds"];

  function h2hPool() {
    return buildSitStartPoolFull();
  }

  // Same merge as Start/Sit but keeping the raw stats, which H2H needs for the
  // breakdown. Start/Sit only needs the total, so it discards them.
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
            rec.stats[statKey] = { line: v.line, lineSource: "books", books: v.books };
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

  function h2hFind(raw, pool) {
    const cleaned = (raw || "").replace(/\s*[-–—(].*$/, "").trim();
    if (!cleaned) return null;
    const k = normPlayerName(cleaned);
    if (pool.has(k)) return pool.get(k);
    const a = altPlayerKey(cleaned);
    const hits = [];
    for (const p of pool.values()) if (altPlayerKey(p.name) === a) hits.push(p);
    if (hits.length === 1) return hits[0];
    // Last resort: a unique substring match, so a surname alone can work.
    const low = cleaned.toLowerCase();
    const subs = [];
    for (const p of pool.values()) {
      if (p.name.toLowerCase().includes(low)) subs.push(p);
    }
    return subs.length === 1 ? subs[0] : null;
  }

  function renderH2H() {
    const $out = document.getElementById("h2h-output");
    if (!$out) return;
    const rawA = (document.getElementById("h2h-a") || {}).value || "";
    const rawB = (document.getElementById("h2h-b") || {}).value || "";
    if (!rawA.trim() || !rawB.trim()) {
      $out.innerHTML = '<div class="empty">Pick two players to compare.</div>';
      return;
    }

    const pool = h2hPool();
    if (!pool.size) {
      $out.innerHTML = '<div class="empty">Week 1 market data has not loaded.</div>';
      return;
    }
    const a = h2hFind(rawA, pool), b = h2hFind(rawB, pool);
    const missing = [];
    if (!a) missing.push(rawA.trim());
    if (!b) missing.push(rawB.trim());
    if (missing.length) {
      $out.innerHTML = '<div class="verdict">Could not find <span class="unmatched">' +
        escapeHtml(missing.join(", ")) + "</span> in this week's market board. " +
        "Either the name is off, or no book has priced them.</div>";
      return;
    }
    if (a.name === b.name) {
      $out.innerHTML = '<div class="verdict">Those are the same player.</div>';
      return;
    }

    const hi = a.points >= b.points ? a : b;
    const lo = hi === a ? b : a;
    const gap = hi.points - lo.points;

    let verdict;
    if (hi.tdOnly || lo.tdOnly) {
      const who = hi.tdOnly ? hi : lo;
      verdict = "No usage priced for <strong>" + escapeHtml(who.name) +
        "</strong> &mdash; the books posted a touchdown price but no receptions " +
        "or yardage, so his number is a floor rather than a projection. " +
        "That is a signal about an unsettled role, not a reason to trust the gap.";
    } else if (gap < 0.5) {
      verdict = "Too close to call. <strong>" + escapeHtml(hi.name) + "</strong> " +
        "projects " + hi.points.toFixed(1) + " to " + escapeHtml(lo.name) + "'s " +
        lo.points.toFixed(1) + " &mdash; a " + gap.toFixed(1) +
        "-point gap is inside the noise in these markets. Play the matchup you believe in.";
    } else {
      verdict = "Start <strong>" + escapeHtml(hi.name) + "</strong>, by " +
        gap.toFixed(1) + " points. " + escapeHtml(hi.name) + " projects " +
        hi.points.toFixed(1) + " half-PPR against " + escapeHtml(lo.name) + " at " +
        lo.points.toFixed(1) + ".";
    }

    let html = '<div class="verdict">' + verdict + "</div>";

    html += '<div class="h2h-cards">';
    for (const p of [a, b]) {
      const win = p.name === hi.name && gap >= 0.5;
      html += '<div class="h2h-card' + (win ? " winner" : "") + '">' +
        '<div class="h2h-card-name">' + escapeHtml(p.name) + "</div>" +
        '<div class="h2h-card-meta">' +
        '<span class="pos-badge pos-' + escapeHtml(p.position || "?") + '">' +
        escapeHtml(p.position || "?") + "</span> &middot; " +
        escapeHtml(p.matchup || "no game") + "</div>" +
        '<div class="h2h-card-pts">' + p.points.toFixed(1) + "</div>" +
        '<div class="h2h-card-sub">projected half-PPR</div>' +
        "</div>";
    }
    html += "</div>";

    // Per-stat contribution: where the edge is actually coming from.
    const rows = [];
    for (const k of H2H_ORDER) {
      const sa = a.stats[k], sb = b.stats[k];
      const va = sa && sa.line != null ? sa.line : null;
      const vb = sb && sb.line != null ? sb.line : null;
      if (va == null && vb == null) continue;
      const w = H2H_WEIGHTS[k] || 0;
      rows.push({
        key: k,
        label: STAT_LABELS[k] || k,
        va, vb,
        pa: (va || 0) * w,
        pb: (vb || 0) * w,
      });
    }

    if (rows.length) {
      html += '<div class="table-wrap"><table class="slot-table"><thead><tr>' +
        "<th>Stat</th><th style=\"text-align:right\">" + escapeHtml(a.name) + "</th>" +
        "<th style=\"text-align:right\">" + escapeHtml(b.name) + "</th>" +
        "<th>Where the points come from</th></tr></thead><tbody>";
      for (const r of rows) {
        const tot = r.pa + r.pb;
        const wa = tot > 0 ? (r.pa / tot) * 100 : 50;
        const dec = r.key === "any_tds" ? 2
                  : (r.key.endsWith("_tds") || r.key === "receptions") ? 1 : 0;
        html += "<tr><td class=\"h2h-stat-name\">" + escapeHtml(r.label) + "</td>" +
          '<td style="text-align:right">' +
          (r.va == null ? "&mdash;" : r.va.toFixed(dec) +
            ' <span style="color:#6a6a8a">(' + r.pa.toFixed(1) + ")</span>") + "</td>" +
          '<td style="text-align:right">' +
          (r.vb == null ? "&mdash;" : r.vb.toFixed(dec) +
            ' <span style="color:#6a6a8a">(' + r.pb.toFixed(1) + ")</span>") + "</td>" +
          '<td><div class="h2h-bar">' +
          '<div class="h2h-bar-a" style="width:' + wa.toFixed(1) + '%"></div>' +
          '<div class="h2h-bar-b" style="width:' + (100 - wa).toFixed(1) + '%"></div>' +
          "</div></td></tr>";
      }
      html += "</tbody></table></div>";

      // Name the stat driving the gap, and say when the edge is contested.
      // A single "biggest gain" line is misleading when the loser wins other
      // categories: Derrick Henry can lead rushing by 2.1 while trailing on
      // receiving, netting out to a 0.6 edge. Reporting "2.1 of 0.6" reads as
      // a bug, so name what the other player wins back too.
      if (gap >= 0.5) {
        const signed = rows.map((r) => ({
          label: r.label,
          d: (hi.name === a.name ? r.pa - r.pb : r.pb - r.pa),
        }));
        const gains = signed.filter((x) => x.d > 0).sort((x, y) => y.d - x.d);
        const losses = signed.filter((x) => x.d < 0).sort((x, y) => x.d - y.d);
        if (gains.length) {
          let txt = "The edge is mostly <strong style=\"color:#e2e2f0\">" +
            escapeHtml(gains[0].label) + "</strong> (+" + gains[0].d.toFixed(1) +
            " for " + escapeHtml(hi.name) + ")";
          if (losses.length && Math.abs(losses[0].d) >= 0.5) {
            txt += ", partly given back on <strong style=\"color:#e2e2f0\">" +
              escapeHtml(losses[0].label) + "</strong> (" + losses[0].d.toFixed(1) +
              "), netting to " + gap.toFixed(1) + ".";
          } else {
            txt += " of a " + gap.toFixed(1) + "-point difference.";
          }
          html += '<div class="verdict" style="font-size:13px;color:#a0a0c0">' +
                  txt + "</div>";
        }
      }
    }
    $out.innerHTML = html;
  }

  function fillH2HNames() {
    const dl = document.getElementById("h2h-names");
    if (!dl) return;
    const pool = h2hPool();
    const names = [...pool.values()]
      .filter((p) => p.points > 0 && p.position)
      .sort((x, y) => y.points - x.points)
      .map((p) => p.name);
    dl.innerHTML = names.map((n) => "<option value=\"" + escapeHtml(n) + "\"></option>").join("");
  }

  document.getElementById("h2h-go")?.addEventListener("click", renderH2H);
  document.getElementById("h2h-swap")?.addEventListener("click", () => {
    const $a = document.getElementById("h2h-a"), $b = document.getElementById("h2h-b");
    if (!$a || !$b) return;
    const t = $a.value; $a.value = $b.value; $b.value = t;
    renderH2H();
  });
  for (const id of ["h2h-a", "h2h-b"]) {
    document.getElementById(id)?.addEventListener("change", renderH2H);
    document.getElementById(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") renderH2H();
    });
  }

  // -- Start/Sit optimizer ----------------------------------------------------
  // Builds the best legal lineup from a pasted roster. FLEX makes greedy
  // filling wrong -- taking the best RB for a base slot can strand a better
  // FLEX combination -- so this enumerates every legal assignment. With 8 slots
  // over a normal roster that search is trivially small.

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

  // The merged Week-1 board, keyed for name lookup. Same merge the Week 1 tab
  // uses: books beat Kalshi on shared stats, Kalshi keeps its TD ladder, and
  // DraftKings fills touchdowns Kalshi never priced.

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

  function renderSitStart() {
    const $out = document.getElementById("sitstart-output");
    if (!$out) return;

    const pool = buildSitStartPoolFull();
    if (!pool.size) {
      $out.innerHTML = '<div class="empty">Week 1 market data has not loaded.</div>';
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

  function slotTable(rows, total, unpriced, unmatched, bench) {
    let html = "";
    if (rows.length) {
      html += '<table class="slot-table"><thead><tr>' +
        '<th>Slot</th><th>Player</th><th>Pos</th><th>Game</th>' +
        '<th style="text-align:right">Proj</th></tr></thead><tbody>';
      for (const r of rows) {
        const isFlex = r.slot === "FLEX";
        const badge = '<span class="slot-badge' + (isFlex ? " flex" : "") + '">' +
                      escapeHtml(r.slot) + "</span>";
        if (!r.p) {
          html += '<tr class="bench-row"><td>' + badge +
                  '</td><td colspan="4">nobody eligible</td></tr>';
          continue;
        }
        html += "<tr><td>" + badge + "</td>" +
          '<td class="player-name">' + escapeHtml(r.p.name) + "</td>" +
          '<td><span class="pos-badge pos-' + escapeHtml(r.p.position || "?") + '">' +
          escapeHtml(r.p.position || "?") + "</span></td>" +
          '<td class="weekly-game">' + escapeHtml(r.p.matchup || "-") + "</td>" +
          '<td style="text-align:right"><span class="market-pts">' +
          r.p.points.toFixed(1) + "</span></td></tr>";
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
          '<td style="text-align:right">' + p.points.toFixed(1) + "</td></tr>";
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

  // The paste path stays available for a whole roster at once; each line goes
  // through the same loose matcher and becomes a chip. Lines that do not
  // resolve are left in the box so it is obvious which ones failed.
  document.getElementById("roster-go")?.addEventListener("click", () => {
    const $ta = document.getElementById("roster-input");
    if (!$ta) return;
    const pool = buildSitStartPoolFull();
    const altIndex = new Map();
    for (const [k, p] of pool) {
      const alt = altPlayerKey(p.name);
      if (!altIndex.has(alt)) altIndex.set(alt, []);
      altIndex.get(alt).push(k);
    }
    const misses = [];
    for (const line of $ta.value.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const cleaned = line.replace(/\s*[-–—(].*$/, "").trim();
      const k = normPlayerName(cleaned);
      if (pool.has(k)) { rosterSelected.add(k); continue; }
      const hits = altIndex.get(altPlayerKey(cleaned));
      if (hits && hits.length === 1) { rosterSelected.add(hits[0]); continue; }
      misses.push(line);
    }
    $ta.value = misses.join("\n");
    renderRosterTags();
    renderSitStart();
  });

  document.getElementById("roster-clear")?.addEventListener("click", () => {
    rosterSelected.clear();
    renderRosterTags();
    renderSitStart();
  });

  document.getElementById("roster-demo")?.addEventListener("click", () => {
    const pool = buildSitStartPoolFull();
    rosterSelected.clear();
    for (const n of ["Josh Allen", "Jahmyr Gibbs", "Bijan Robinson", "Puka Nacua",
                     "CeeDee Lamb", "Brock Bowers", "Chase Brown",
                     "Jaxon Smith-Njigba", "Trey McBride", "Derrick Henry"]) {
      const k = normPlayerName(n);
      if (pool.has(k)) rosterSelected.add(k);
    }
    renderRosterTags();
    renderSitStart();
  });


  // -- Multi-week average view ------------------------------------------------
  // Averaged market lines across the first N weeks. No touchdowns: only The
  // Odds API publishes future weeks and no book there posts a per-game TD
  // count, so totals here sit below the Week 1 tab by roughly 6 * xTD. That is
  // a source limitation, stated in the UI, not a scoring difference.

  let multiPos = "ALL";
  let multiSortDesc = true;

  function multiPoints(stats, format) {
    const g = (k) => {
      const s = stats[k];
      return s && s.avg != null ? s.avg : 0;
    };
    let pts = 0;
    pts += g("pass_yds") * 0.04;
    pts += g("pass_tds") * 4;
    pts += g("rush_yds") * 0.1;
    pts += g("rec_yds") * 0.1;
    if (format === "ppr") pts += g("receptions") * 1.0;
    else if (format === "half") pts += g("receptions") * 0.5;
    return Math.round(pts * 100) / 100;
  }

  function multiChips(p) {
    const order = ["pass_yds", "pass_tds", "rush_yds", "receptions", "rec_yds"];
    const parts = [];
    for (const k of order) {
      const s = p.stats[k];
      if (!s || s.avg == null) continue;
      const dec = (k.endsWith("_tds") || k === "receptions") ? 1 : 0;
      // Show the weeks behind the average so a single hot matchup is visible
      // rather than hidden inside one number.
      const wk = (s.byWeek || [])
        .map((w) => `wk${w.week} ${w.line}`)
        .join("\n");
      const spread = s.min !== s.max ? `\nrange ${s.min}-${s.max}` : "";
      parts.push(
        `<span class="market-chip src-fanduel" title="Average of ${s.weeks} week(s)\n${escapeHtml(wk)}${escapeHtml(spread)}">` +
        `<span class="mk-label">${escapeHtml(STAT_LABELS[k] || k)}</span> ` +
        `${s.avg.toFixed(dec)}</span>`
      );
    }
    return `<div class="markets">${parts.join("")}</div>`;
  }

  function renderMulti() {
    const $rows = document.getElementById("multi-rows");
    const $empty = document.getElementById("multi-empty");
    const $meta = document.getElementById("multi-meta");
    if (!$rows) return;

    const mw = cache["multiweek"];
    if (!mw || !Array.isArray(mw.players)) {
      $rows.innerHTML = "";
      if ($empty) {
        $empty.textContent = "No multi-week data yet — run the scraper workflow to build it.";
        $empty.classList.remove("hidden");
      }
      if ($meta) $meta.textContent = "";
      return;
    }

    const fpLut = buildProjLookup(cache["data"]);
    const clayLut = buildProjLookup(cache["clay"]);

    let players = mw.players.map((p) => {
      const fp = lookupProj(fpLut, p.name), clay = lookupProj(clayLut, p.name);
      // Weeks covered varies per player: a bye or an unpriced game means fewer.
      const weeks = Math.max(...Object.values(p.stats).map((s) => s.weeks || 0), 0);
      return {
        ...p,
        position: (fp && fp.position) || (clay && clay.position) || null,
        weeks,
        points: multiPoints(p.stats, fmt),
      };
    });

    const FLEX_POS = new Set(["RB", "WR", "TE"]);
    players = players.filter((p) => {
      if (multiPos === "FLEX") {
        if (!FLEX_POS.has(p.position)) return false;
      } else if (multiPos !== "ALL" && p.position !== multiPos) {
        return false;
      }
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return p.points > 0;
    });

    players.sort((a, b) => (multiSortDesc ? b.points - a.points : a.points - b.points));

    if ($meta) {
      $meta.textContent = `weeks 1-${mw.weeksCovered} · ${mw.eventCount} games · ${mw.playerCount} players`;
    }

    if (!players.length) {
      $rows.innerHTML = "";
      if ($empty) { $empty.textContent = "No players match."; $empty.classList.remove("hidden"); }
      return;
    }
    if ($empty) $empty.classList.add("hidden");

    $rows.innerHTML = players.map((p, i) => {
      const posClass = "pos-" + (p.position || "?");
      return `<tr>
        <td class="rank-num">${i + 1}</td>
        <td class="player-name">${escapeHtml(p.name)}</td>
        <td><span class="pos-badge ${posClass}">${escapeHtml(p.position || "?")}</span></td>
        <td class="num weekly-game">${p.weeks}</td>
        <td class="num"><span class="market-pts">${p.points.toFixed(1)}</span></td>
        <td>${multiChips(p)}</td>
      </tr>`;
    }).join("");

    const $pc = document.getElementById("player-count");
    const $ec = document.getElementById("event-count");
    if ($pc) $pc.textContent = `${players.length} players`;
    if ($ec) $ec.textContent = `weeks 1-${mw.weeksCovered}`;
  }

  const $multiPosChips = document.getElementById("multi-pos-chips");
  if ($multiPosChips) {
    $multiPosChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      document.querySelectorAll("#multi-pos-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      multiPos = chip.dataset.pos;
      renderMulti();
    });
  }

  document.querySelector('[data-xsort="pts"]')?.addEventListener("click", () => {
    multiSortDesc = !multiSortDesc;
    renderMulti();
  });

  // ── Week N view ────────────────────────────────────────────────────────────
  // Per-game Kalshi markets. Deliberately NOT gated on stat completeness the
  // way Market Points is: a per-game line set is inherently partial (nobody
  // prices rushing TDs for a slot receiver), so gating would empty the table.
  // The tradeoff is that cross-position totals are not strictly comparable —
  // QBs rank high partly because passing yards are always priced.

  let weeklyPos = "ALL";
  let weeklySortDesc = true;
  // On by default: 126 of 240 rows have only a TD market priced, and mixing
  // those partial totals into the ranking buries fully-priced players.
  let weeklyHideTdOnly = true;

  const BOOK_LABEL = {
    draftkings: "DraftKings",
    fanduel: "FanDuel",
    bovada: "Bovada",
    betrivers: "BetRivers",
    betonlineag: "BetOnline",
    betmgm: "BetMGM",
    williamhill_us: "Caesars",
    pointsbetus: "PointsBet",
  };

  const WEEKLY_SOURCE_LABEL = {
    interpolated: "Kalshi ladder — interpolated 50% strike",
    fitted: "Fitted estimate — ladder never crosses 50%",
    expected: "Expected count — sum of P(X ≥ k) across the ladder",
    books: "Sportsbook consensus — median across books",
    "dk-td": "DraftKings anytime-TD price, de-vigged (P of 1+, so slightly low)",
  };

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

  function renderWeekly() {
    const $rows = document.getElementById("weekly-rows");
    const $empty = document.getElementById("weekly-empty");
    const $meta = document.getElementById("weekly-meta");
    if (!$rows) return;

    const wk = cache["weekly"];
    if (!wk || !Array.isArray(wk.players)) {
      $rows.innerHTML = "";
      if ($empty) {
        $empty.textContent = "No weekly market data loaded.";
        $empty.classList.remove("hidden");
      }
      return;
    }

    const fpLut = buildProjLookup(cache["data"]);
    const clayLut = buildProjLookup(cache["clay"]);

    // Merge the multi-book feed into the Kalshi board. A sportsbook consensus
    // across five books beats a single venue's ladder, so books win on any stat
    // they both price; Kalshi keeps any_tds, which no book here quotes.
    // Books also cover far more players — Kalshi prices only 11-20 per game,
    // omitting names as prominent as Ja'Marr Chase.
    const merged = new Map();
    for (const p of wk.players) {
      merged.set(normPlayerName(p.name), {
        ...p, stats: { ...p.stats },
      });
    }
    const oa = cache["oddsapi"];
    if (oa && Array.isArray(oa.players)) {
      for (const p of oa.players) {
        const k = normPlayerName(p.name);
        let rec = merged.get(k);
        if (!rec) {
          rec = { name: p.name, matchup: p.matchup, kickoff: p.kickoff, stats: {} };
          merged.set(k, rec);
        }
        for (const [statKey, v] of Object.entries(p.stats || {})) {
          if (v.line == null) continue;
          rec.stats[statKey] = {
            line: v.line,
            lineSource: "books",
            books: v.books,
            min: v.min,
            max: v.max,
            quotes: v.quotes || [],
          };
        }
      }
    }

    // DraftKings anytime-TD fills the touchdown gap. It prices 429 players to
    // Kalshi's 236, but as P(scores 1+) rather than a full count, so it reads
    // ~0.3 low for goal-line backs who can score twice. Kalshi's ladder is the
    // better model where it exists — so this only fills, never overwrites.
    const dk = cache["dktd"];
    if (dk && Array.isArray(dk.players)) {
      for (const p of dk.players) {
        const k = normPlayerName(p.name);
        let rec = merged.get(k);
        if (!rec) {
          rec = { name: p.name, matchup: p.matchup, kickoff: p.kickoff, stats: {} };
          merged.set(k, rec);
        }
        const cur = rec.stats.any_tds;
        if (!cur || cur.line == null) {
          rec.stats.any_tds = {
            line: p.xTD,
            lineSource: "dk-td",
            odds: p.americanOdds,
          };
        }
      }
    }

    let players = [...merged.values()].map((p) => {
      const fp = lookupProj(fpLut, p.name), clay = lookupProj(clayLut, p.name);
      const priced = Object.values(p.stats).filter((s) => s.line != null);
      const tdOnly = priced.length === 1 &&
                     p.stats.any_tds && p.stats.any_tds.line != null;
      return {
        ...p,
        position: (fp && fp.position) || (clay && clay.position) || null,
        points: weeklyPoints(p.stats, fmt),
        // A player with ONLY a touchdown market priced has no yardage or
        // reception credit at all, so their total is a floor, not a projection.
        // Ranking them against fully-priced players would read as a real gap
        // when it is just missing data.
        tdOnly,
      };
    });

    // FLEX = every skill position that shares a flex slot. Excluding QB also
    // makes the ranking honest: QB totals are inflated because passing yards
    // are always priced, while a receiver's rushing line usually is not.
    const FLEX_POS = new Set(["RB", "WR", "TE"]);
    players = players.filter((p) => {
      if (weeklyHideTdOnly && p.tdOnly) return false;
      if (weeklyPos === "FLEX") {
        if (!FLEX_POS.has(p.position)) return false;
      } else if (weeklyPos !== "ALL" && p.position !== weeklyPos) {
        return false;
      }
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return p.points > 0;
    });

    players.sort((a, b) => (weeklySortDesc ? b.points - a.points : a.points - b.points));

    // Keep the tab label honest as the season rolls: the markup ships "Week 1"
    // so the tab reads correctly before any fetch, but the data knows its own
    // week and wins once loaded.
    const $tab = document.querySelector('.view-tab[data-view="weekly"]');
    if ($tab && wk.week != null) $tab.textContent = `Week ${wk.week}`;

    if ($meta) {
      const games = wk.gameCount || 0;
      // Week comes from ESPN, not a calendar guess: the season opens midweek,
      // so the days before kickoff still belong to week 1's slate.
      const wkNum = wk.week != null ? `Week ${wk.week} · ` : "";
      $meta.textContent = `${wkNum}${games} games`;
    }

    if (!players.length) {
      $rows.innerHTML = "";
      if ($empty) { $empty.textContent = "No players match."; $empty.classList.remove("hidden"); }
      return;
    }
    if ($empty) $empty.classList.add("hidden");

    $rows.innerHTML = players.map((p, i) => {
      const posClass = "pos-" + (p.position || "?");
      return `<tr>
        <td class="rank-num">${i + 1}</td>
        <td class="player-name">${escapeHtml(p.name)}</td>
        <td><span class="pos-badge ${posClass}">${escapeHtml(p.position || "?")}</span></td>
        <td class="weekly-game">${escapeHtml(p.matchup || "—")}</td>
        <td class="num"><span class="market-pts">${p.points.toFixed(1)}${
          p.tdOnly ? '<span class="td-only-mark" title="Only a touchdown market is priced for this player — no yardage or receptions. This total is a floor, not a full projection.">TD</span>' : ""
        }</span></td>
        <td>${weeklyChips(p)}</td>
      </tr>`;
    }).join("");

    const $pc = document.getElementById("player-count");
    const $ec = document.getElementById("event-count");
    if ($pc) $pc.textContent = `${players.length} players`;
    if ($ec) $ec.textContent = "Kalshi per-game";
  }

  const $weeklyHideTdOnly = document.getElementById("weekly-hide-tdonly");
  if ($weeklyHideTdOnly) {
    weeklyHideTdOnly = $weeklyHideTdOnly.checked;
    $weeklyHideTdOnly.addEventListener("change", (e) => {
      weeklyHideTdOnly = e.target.checked;
      renderWeekly();
    });
  }

  const $weeklyPosChips = document.getElementById("weekly-pos-chips");
  if ($weeklyPosChips) {
    $weeklyPosChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      document.querySelectorAll("#weekly-pos-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      weeklyPos = chip.dataset.pos;
      renderWeekly();
    });
  }

  document.querySelector('[data-wsort="pts"]')?.addEventListener("click", () => {
    weeklySortDesc = !weeklySortDesc;
    renderWeekly();
  });

  // ── Market Points view ─────────────────────────────────────────────────────
  // Market lines converted to fantasy points, laid out like the Rankings tab.
  // Scored only when every stat the position needs is priced; otherwise NaN,
  // because summing a partial stat set understates a player badly rather than
  // slightly (a WR with no receptions loses ~40% of their PPR total).

  let marketPos = "ALL";
  let marketHideNaN = false;
  let marketSortDesc = true;
  // Which column drives the sort: "pts" or "adp". ADP sorts ascending by
  // default (pick 1.1 is the top of the board), points descending.
  let marketSortKey = "pts";
  let marketAdpAsc = true;
  // Off by default: the tab's premise is market-implied points, so projections
  // are opt-in rather than silently blended into a "market" number.
  let marketUseProj = false;
  // ON by default: fitted values are wrong often enough (34% median error) that
  // showing them is worse than showing a projection.
  let marketReplaceFitted = true;
  // Off by default: assumed-sigma is materially better than fitted, and it is
  // the only thing giving most receivers a receptions line.
  let marketReplaceSigma = false;

  // Underdog ADP, keyed the same two-stage way as the projection lookups so
  // "Ken Walker" / "Kenneth Walker III" style mismatches still join.
  function buildAdpLookup(data) {
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

  // Stats a position must have before we'll produce a number.
  // QBs: passing volume + both rushing components (mobile QBs live there).
  // RB/WR/TE: their yardage, TDs, and receptions — receptions matter in PPR
  // and are the most commonly missing market, which is exactly why we gate.
  const REQUIRED_STATS = {
    QB: ["pass_yds", "pass_tds", "rush_yds", "rush_tds"],
    RB: ["rush_yds", "rush_tds", "receptions", "rec_yds", "rec_tds"],
    WR: ["rec_yds", "rec_tds", "receptions"],
    TE: ["rec_yds", "rec_tds", "receptions"],
  };

  function buildMarketPlayers() {
    const vegas  = cache["vegas"];
    const kalshi = cache["kalshi"];
    const bovada = cache["bovada"];
    const fpLut   = buildProjLookup(cache["data"]);
    const clayLut = buildProjLookup(cache["clay"]);
    const adpLut  = buildAdpLookup(cache["adp"]);

    const players = new Map(); // normName -> { name, position, stats:{k:{value,source}} }
    const ensure = (name) => {
      const k = normPlayerName(name);
      let p = players.get(k);
      if (!p) { p = { name, position: null, stats: {} }; players.set(k, p); }
      return p;
    };

    // Kalshi first, so a FanDuel line overwrites it below (a posted book line
    // beats both an interpolated ladder and a fitted one).
    if (kalshi && Array.isArray(kalshi.players)) {
      for (const p of kalshi.players) {
        for (const [statKey, s] of Object.entries(p.stats || {})) {
          if (s.line == null) continue;
          // Keep the two modelled kinds distinct: "fitted" (lognormal OLS on a
          // ladder that never crosses 50%) is measurably unreliable — 34%
          // median error against the projection consensus, and it collapses
          // toward zero on thin ladders. "assumed-sigma" is far better at
          // 14.9%. Both still render as estimates, but only the former is
          // replaced by default.
          const src = s.lineSource === "fitted" ? "fit"
                    : s.lineSource === "assumed-sigma" ? "sigma"
                    : "kalshi";
          ensure(p.name).stats[statKey] = { value: s.line, source: src };
        }
      }
    }
    // Bovada next: a posted book line beats a modelled Kalshi ladder, but
    // FanDuel stays the primary book and overwrites below. Bovada's value here
    // is receiving TDs, which FanDuel does not offer at all.
    if (bovada && Array.isArray(bovada.players)) {
      for (const p of bovada.players) {
        const rec = ensure(p.name);
        for (const [statKey, m] of Object.entries(p.markets || {})) {
          if (m.line == null) continue;
          rec.stats[statKey] = { value: m.line, source: "bovada" };
        }
      }
    }
    if (vegas && Array.isArray(vegas.players)) {
      for (const p of vegas.players) {
        const rec = ensure(p.name);
        if (p.position) rec.position = p.position;
        for (const [statKey, m] of Object.entries(p.markets || {})) {
          if (m.line == null) continue;
          rec.stats[statKey] = { value: m.line, source: "fanduel" };
        }
      }
    }

    const out = [];
    for (const [key, p] of players) {
      const adpRec = lookupProj(adpLut, p.name);
      // Undrafted players have no ADP; null sorts to the bottom rather than
      // pretending they're the first pick.
      p.adp = adpRec && isFinite(adpRec.adp) ? adpRec.adp : null;

      const fp = lookupProj(fpLut, p.name), clay = lookupProj(clayLut, p.name);
      if (!p.position) {
        p.position = (fp && fp.position) || (clay && clay.position) ||
                     (adpRec && adpRec.pos) || null;
      }
      const req = REQUIRED_STATS[p.position];

      // Optional fallback: fill stats no book prices with the projection
      // consensus. Books deliberately skip receiving props for committee RBs
      // and season receptions entirely, so market data alone can never score
      // those players. These cells are NOT market-derived and are tracked
      // separately so the UI can mark them and the points as projection-backed.
      p.projFilled = [];

      // Replace unreliable fitted ladders with the projection consensus. A
      // fitted value is a modelled guess at a line the market never actually
      // crossed, and it fails badly (Penix at 3.8 passing yards, Puka at 1.8
      // receiving TDs) — a projection is simply better information there.
      // This runs regardless of the fill-gaps toggle, since it repairs a value
      // that is already wrong rather than inventing a missing one.
      if (req && marketReplaceFitted) {
        for (const statKey of Object.keys(p.stats)) {
          const cur = p.stats[statKey];
          if (!cur || cur.source !== "fit") continue;
          const v = projStat(fp, clay, statKey);
          if (v == null) continue;
          p.stats[statKey] = { value: v, source: "proj" };
          p.projFilled.push(statKey);
        }
      }
      // The weaker assumed-sigma values too, when asked. Off by default: at
      // 14.9% median they beat fitted by a wide margin and they are what give
      // most WRs a receptions line at all.
      if (req && marketReplaceSigma) {
        for (const statKey of Object.keys(p.stats)) {
          const cur = p.stats[statKey];
          if (!cur || cur.source !== "sigma") continue;
          const v = projStat(fp, clay, statKey);
          if (v == null) continue;
          p.stats[statKey] = { value: v, source: "proj" };
          p.projFilled.push(statKey);
        }
      }

      if (req && marketUseProj) {
        for (const statKey of req) {
          if (statKey in p.stats) continue;
          const v = projStat(fp, clay, statKey);
          if (v == null) continue;
          p.stats[statKey] = { value: v, source: "proj" };
          p.projFilled.push(statKey);
        }
      }

      const missing = req ? req.filter((s) => !(s in p.stats)) : null;
      p.missing = missing;
      p.complete = !!req && missing.length === 0;

      if (p.complete) {
        const stats = {};
        for (const [k, v] of Object.entries(p.stats)) stats[k] = v.value;
        p.points = {
          ppr:      fantasyPoints(stats, "ppr"),
          half:     fantasyPoints(stats, "half"),
          standard: fantasyPoints(stats, "standard"),
        };
        p.fitted = Object.values(p.stats).some(
          (s) => s.source === "fit" || s.source === "sigma");
        p.hasProj = p.projFilled.length > 0;
      } else {
        p.points = null;
      }
      out.push(p);
    }
    return out;
  }

  // Consensus value for one stat from the projection sources. Averages the two
  // when both have the player, so a single outlier source carries less weight.
  function projStat(fp, clay, statKey) {
    const vals = [];
    for (const rec of [fp, clay]) {
      const v = rec && rec.stats ? rec.stats[statKey] : null;
      if (typeof v === "number" && isFinite(v)) vals.push(v);
    }
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  const SOURCE_LABEL = {
    fanduel: "FanDuel posted line",
    bovada: "Bovada posted line",
    kalshi: "Kalshi ladder (interpolated 50% strike)",
    fit: "Fitted estimate — Kalshi ladder never crosses 50% (unreliable: ~34% median error)",
    sigma: "Kalshi ladder, assumed-sigma fit — rungs tied at one probability",
    proj: "Projection consensus — no market value, or the market value was an unreliable fit",
  };

  function marketStatChips(p) {
    const order = ["pass_yds", "pass_tds", "rush_yds", "rush_tds",
                   "receptions", "rec_yds", "rec_tds"];
    const parts = [];
    for (const k of order) {
      const s = p.stats[k];
      if (!s) continue;
      const dec = k.endsWith("_tds") || k === "receptions" ? 1 : 0;
      // "~" = modelled from a ladder; "P" = projection, not a market number.
      const mark = (s.source === "fit" || s.source === "sigma") ? "~"
                 : s.source === "proj" ? "P " : "";
      parts.push(
        `<span class="market-chip src-${s.source}" title="${escapeHtml(SOURCE_LABEL[s.source] || "")}">` +
        `<span class="mk-label">${escapeHtml(STAT_LABELS[k] || k)}</span> ` +
        `${mark}${s.value.toFixed(dec)}</span>`
      );
    }
    if (p.missing && p.missing.length) {
      const names = p.missing.map((m) => STAT_LABELS[m] || m).join(", ");
      parts.push(`<span class="market-chip missing" title="Not priced by any market">missing: ${escapeHtml(names)}</span>`);
    }
    return `<div class="markets">${parts.join("")}</div>`;
  }

  function renderMarket() {
    const $mrows = document.getElementById("market-rows");
    const $mempty = document.getElementById("market-empty");
    if (!$mrows) return;

    let players = buildMarketPlayers();

    players = players.filter((p) => {
      if (marketPos !== "ALL" && p.position !== marketPos) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (marketHideNaN && !p.complete) return false;
      return true;
    });

    if (marketSortKey === "adp") {
      // Sorting by ADP ignores the scored/unscored split -- the whole point is
      // to walk the draft board in order, and an unpriced player at pick 40
      // still belongs between picks 39 and 41. Players with no ADP sink last.
      players.sort((a, b) => {
        if ((a.adp == null) !== (b.adp == null)) return a.adp == null ? 1 : -1;
        if (a.adp == null) return a.name.localeCompare(b.name);
        return marketAdpAsc ? a.adp - b.adp : b.adp - a.adp;
      });
    } else {
      // Scored players first (by points), then the NaN rows alphabetically.
      players.sort((a, b) => {
        if (a.complete !== b.complete) return a.complete ? -1 : 1;
        if (!a.complete) return a.name.localeCompare(b.name);
        const av = a.points[fmt], bv = b.points[fmt];
        return marketSortDesc ? bv - av : av - bv;
      });
    }

    if (!players.length) {
      $mrows.innerHTML = "";
      if ($mempty) { $mempty.textContent = "No players match."; $mempty.classList.remove("hidden"); }
      return;
    }
    if ($mempty) $mempty.classList.add("hidden");

    let rank = 0;
    $mrows.innerHTML = players.map((p) => {
      const posClass = "pos-" + (p.position || "?");
      const scored = p.complete;
      if (scored) rank++;
      const projMark = p.hasProj
        ? `<span class="proj-mark" title="Includes ${p.projFilled.length} projection-filled stat(s) — no book prices ${p.projFilled.length > 1 ? "them" : "it"}: ${escapeHtml(p.projFilled.map((m) => STAT_LABELS[m] || m).join(", "))}">P</span>`
        : "";
      const pts = scored
        ? `<span class="market-pts">${p.points[fmt].toFixed(1)}${p.fitted ? '<span class="fit-mark" title="Includes at least one fitted estimate">~</span>' : ""}${projMark}</span>`
        : `<span class="market-nan" title="Missing: ${escapeHtml((p.missing || []).map((m) => STAT_LABELS[m] || m).join(", "))}">NaN</span>`;
      const adpCell = p.adp == null
        ? `<span class="market-nan" title="No Underdog ADP — undrafted">—</span>`
        : p.adp.toFixed(1);
      return `<tr class="${scored ? "" : "row-nan"}">
        <td class="rank-num">${scored ? rank : "—"}</td>
        <td class="player-name">${escapeHtml(p.name)}</td>
        <td><span class="pos-badge ${posClass}">${escapeHtml(p.position || "?")}</span></td>
        <td class="num">${adpCell}</td>
        <td class="num">${pts}</td>
        <td>${marketStatChips(p)}</td>
      </tr>`;
    }).join("");

    const $pc = document.getElementById("player-count");
    const $ec = document.getElementById("event-count");
    if ($pc) $pc.textContent = `${players.filter((p) => p.complete).length} scored / ${players.length}`;
    if ($ec) $ec.textContent = "FanDuel + Kalshi";
  }

  const $marketPosChips = document.getElementById("market-pos-chips");
  if ($marketPosChips) {
    $marketPosChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      document.querySelectorAll("#market-pos-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      marketPos = chip.dataset.pos;
      renderMarket();
    });
  }

  const $marketHideNaN = document.getElementById("market-hide-nan");
  if ($marketHideNaN) {
    $marketHideNaN.addEventListener("change", (e) => {
      marketHideNaN = e.target.checked;
      renderMarket();
    });
  }

  const $marketUseProj = document.getElementById("market-use-proj");
  if ($marketUseProj) {
    $marketUseProj.addEventListener("change", (e) => {
      marketUseProj = e.target.checked;
      renderMarket();
    });
  }

  const $marketReplaceFitted = document.getElementById("market-replace-fitted");
  if ($marketReplaceFitted) {
    marketReplaceFitted = $marketReplaceFitted.checked;
    $marketReplaceFitted.addEventListener("change", (e) => {
      marketReplaceFitted = e.target.checked;
      renderMarket();
    });
  }

  const $marketReplaceSigma = document.getElementById("market-replace-sigma");
  if ($marketReplaceSigma) {
    marketReplaceSigma = $marketReplaceSigma.checked;
    $marketReplaceSigma.addEventListener("change", (e) => {
      marketReplaceSigma = e.target.checked;
      renderMarket();
    });
  }

  // Clicking the active column flips its direction; clicking the other column
  // switches to it, keeping whatever direction that column was last using.
  document.querySelector('[data-msort="pts"]')?.addEventListener("click", () => {
    if (marketSortKey === "pts") marketSortDesc = !marketSortDesc;
    else marketSortKey = "pts";
    updateMarketCarets();
    renderMarket();
  });

  document.querySelector('[data-msort="adp"]')?.addEventListener("click", () => {
    if (marketSortKey === "adp") marketAdpAsc = !marketAdpAsc;
    else marketSortKey = "adp";
    updateMarketCarets();
    renderMarket();
  });

  // Only the active column shows a caret, so the header says which sort is live.
  function updateMarketCarets() {
    const set = (key, active, asc) => {
      const th = document.querySelector(`[data-msort="${key}"]`);
      if (!th) return;
      th.classList.toggle("sort-active", active);
      const caret = th.querySelector(".caret");
      if (caret) caret.textContent = active ? (asc ? "▴" : "▾") : "";
    };
    set("adp", marketSortKey === "adp", marketAdpAsc);
    set("pts", marketSortKey === "pts", !marketSortDesc);
  }

  const $vegasPosChips = document.getElementById("vegas-pos-chips");
  if ($vegasPosChips) {
    $vegasPosChips.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      document.querySelectorAll("#vegas-pos-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      vegasPos = chip.dataset.pos;
      renderVegas();
    });
  }

  const $vegasOnlyDelta = document.getElementById("vegas-only-delta");
  if ($vegasOnlyDelta) {
    $vegasOnlyDelta.addEventListener("change", (e) => {
      vegasOnlyDelta = e.target.checked;
      renderVegas();
    });
  }

  document.querySelector('[data-vsort="delta"]')?.addEventListener("click", () => {
    vegasSortDesc = !vegasSortDesc;
    renderVegas();
  });

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
