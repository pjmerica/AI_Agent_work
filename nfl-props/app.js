(function () {
  // ── State ──────────────────────────────────────────────────────────────────
  let raw = { players: [], lastUpdated: null, eventCount: 0, playerCount: 0 };
  let fmt = "ppr";
  let pos = "ALL";
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

  // ── Market label / format helpers ──────────────────────────────────────────
  const MARKET_META = {
    player_pass_yds:           { label: "Pass Yds",   suffix: "" },
    player_pass_tds:           { label: "Pass TDs",   suffix: "" },
    player_pass_interceptions: { label: "INTs",       suffix: "" },
    player_rush_yds:           { label: "Rush Yds",   suffix: "" },
    player_rush_tds:           { label: "Rush TDs",   suffix: "" },
    player_rush_attempts:      { label: "Rush Att",   suffix: "" },
    player_reception_yds:      { label: "Rec Yds",    suffix: "" },
    player_receptions:         { label: "Rec",        suffix: "" },
    player_reception_tds:      { label: "Rec TDs",    suffix: "" },
  };

  // ── Fantasy-point math (mirrors Python scraper) ────────────────────────────
  function ptsForMarket(key, val, format) {
    if (key === "player_receptions") {
      if (format === "ppr") return val * 1.0;
      if (format === "half") return val * 0.5;
      return 0;
    }
    switch (key) {
      case "player_pass_yds":            return val * 0.04;
      case "player_pass_tds":            return val * 4;
      case "player_pass_interceptions":  return val * -2;
      case "player_rush_yds":            return val * 0.1;
      case "player_rush_tds":            return val * 6;
      case "player_reception_yds":       return val * 0.1;
      case "player_reception_tds":       return val * 6;
      default:                           return 0;
    }
  }

  function projectPlayer(p, format) {
    let total = 0;
    const markets = p.markets || {};
    for (const [k, m] of Object.entries(markets)) {
      total += ptsForMarket(k, m.line, format);
    }
    if (!("player_rush_tds" in markets) && !("player_reception_tds" in markets)) {
      total += (p.anytime_td_prob || 0) * 6;
    }
    return Math.round(total * 100) / 100;
  }

  // ── Loaders ────────────────────────────────────────────────────────────────
  async function load() {
    try {
      const res = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
      raw = await res.json();
    } catch (e) {
      console.error("Failed to load data.json", e);
      raw = { players: [], lastUpdated: null, eventCount: 0, playerCount: 0 };
    }
    render();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    const players = (raw.players || [])
      .map((p) => ({ ...p, _proj: projectPlayer(p, fmt) }))
      .filter((p) => {
        if (pos === "ALL") return true;
        return p.position === pos;
      })
      .filter((p) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (p.name || "").toLowerCase().includes(s) ||
               (p.team || "").toLowerCase().includes(s) ||
               (p.opponent || "").toLowerCase().includes(s);
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
    $eventCount.textContent = raw.eventCount || 0;
    $lastUpdated.textContent = raw.lastUpdated
      ? new Date(raw.lastUpdated).toLocaleString()
      : "never";
  }

  function buildRow(p, rank) {
    const tr = document.createElement("tr");

    const posClass = "pos-" + (p.position || "?").replace("/", "");

    tr.innerHTML = `
      <td class="rank-num">${rank}</td>
      <td class="player-name">${escapeHtml(p.name)}</td>
      <td><span class="pos-badge ${posClass}">${escapeHtml(p.position || "?")}</span></td>
      <td class="matchup">${escapeHtml(shortTeam(p.team))} vs ${escapeHtml(shortTeam(p.opponent))}</td>
      <td class="proj">${p._proj.toFixed(2)}</td>
      <td>${renderMarkets(p)}</td>
    `;
    return tr;
  }

  function renderMarkets(p) {
    const parts = [];
    const order = [
      "player_pass_yds", "player_pass_tds", "player_pass_interceptions",
      "player_rush_yds", "player_rush_tds", "player_rush_attempts",
      "player_reception_yds", "player_receptions", "player_reception_tds"
    ];
    for (const k of order) {
      const m = p.markets?.[k];
      if (!m) continue;
      const meta = MARKET_META[k];
      parts.push(`<span class="market-tag">
        <span class="mk-label">${meta.label}</span><span class="mk-val">${formatLine(m.line)}</span>
      </span>`);
    }
    if (p.anytime_td_prob > 0) {
      const pct = Math.round(p.anytime_td_prob * 100);
      parts.push(`<span class="market-tag">
        <span class="mk-label">ATD</span><span class="mk-val">${pct}%</span>
      </span>`);
    }
    return `<div class="markets">${parts.join("")}</div>`;
  }

  function formatLine(v) {
    if (Number.isInteger(v)) return v.toString();
    return v.toFixed(1);
  }

  function shortTeam(name) {
    if (!name) return "—";
    const parts = name.split(" ");
    return parts[parts.length - 1];
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
    document.querySelectorAll("#pos-chips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    pos = chip.dataset.pos;
    render();
  });

  $search.addEventListener("input", (e) => {
    search = e.target.value.trim();
    render();
  });

  load();
})();
