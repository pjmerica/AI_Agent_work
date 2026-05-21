(function () {
  const TEAMS = window.NFL_TEAMS;
  const SOURCES = window.NFL_SOURCES;

  // Proxies tried in order. rss2json returns parsed JSON; the rest return raw XML.
  const PROXIES = [
    { kind: "json", url: (u) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(u)}` },
    { kind: "xml",  url: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}` },
    { kind: "xml",  url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` }
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  const activeSources = new Set(SOURCES.map((s) => s.id));
  const activeTeams = new Set(); // empty = show all
  let searchTerm = "";
  let articles = [];

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const $feed = document.getElementById("feed");
  const $empty = document.getElementById("empty");
  const $status = document.getElementById("status");
  const $refresh = document.getElementById("refresh");
  const $search = document.getElementById("search");
  const $sourceChips = document.getElementById("source-chips");
  const $teamChips = document.getElementById("team-chips");
  const $sourceCount = document.getElementById("source-count");
  const $teamCount = document.getElementById("team-count");
  const $articleCount = document.getElementById("article-count");
  const $lastUpdated = document.getElementById("last-updated");

  // ── Build chips ────────────────────────────────────────────────────────────
  SOURCES.forEach((s) => {
    const chip = document.createElement("button");
    chip.className = "chip active";
    chip.textContent = s.label;
    chip.dataset.id = s.id;
    chip.addEventListener("click", () => {
      if (activeSources.has(s.id)) {
        if (activeSources.size === 1) return;
        activeSources.delete(s.id);
        chip.classList.remove("active");
      } else {
        activeSources.add(s.id);
        chip.classList.add("active");
      }
      updateSourceCount();
      render();
    });
    $sourceChips.appendChild(chip);
  });

  TEAMS.forEach((t) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = t.name;
    chip.dataset.id = t.id;
    chip.addEventListener("click", () => {
      if (activeTeams.has(t.id)) {
        activeTeams.delete(t.id);
        chip.classList.remove("active");
      } else {
        activeTeams.add(t.id);
        chip.classList.add("active");
      }
      updateTeamCount();
      render();
    });
    $teamChips.appendChild(chip);
  });

  function updateSourceCount() {
    $sourceCount.textContent = `(${activeSources.size}/${SOURCES.length})`;
  }
  function updateTeamCount() {
    if (activeTeams.size === 0) $teamCount.textContent = "(all)";
    else $teamCount.textContent = `(${activeTeams.size})`;
  }
  updateSourceCount();
  updateTeamCount();

  // ── Search ─────────────────────────────────────────────────────────────────
  $search.addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    render();
  });

  // ── Fetch + parse RSS ──────────────────────────────────────────────────────
  async function fetchSource(source) {
    for (const proxy of PROXIES) {
      try {
        const url = proxy.url(source.url);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        let items;
        if (proxy.kind === "json") {
          const data = await res.json();
          if (data.status !== "ok" || !Array.isArray(data.items)) throw new Error("bad JSON shape");
          items = parseJsonFeed(data.items, source);
        } else {
          const text = await res.text();
          items = parseXmlFeed(text, source);
        }

        if (items.length > 0) return items;
        throw new Error("no items parsed");
      } catch (err) {
        console.warn(`[${source.id}] proxy failed`, err.message);
      }
    }
    console.error(`[${source.id}] all proxies failed`);
    return [];
  }

  function parseJsonFeed(items, source) {
    const results = [];
    items.forEach((item) => {
      const title = cleanText(item.title || "");
      const link = (item.link || "").trim();
      const dateStr = item.pubDate || item.published || "";
      const date = dateStr ? new Date(dateStr) : null;
      if (!title || !link) return;
      results.push({ title, link, date, source, teams: detectTeams(title) });
    });
    return results;
  }

  function parseXmlFeed(xmlText, source) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    if (doc.querySelector("parsererror")) return [];

    const items = doc.querySelectorAll("item, entry");
    const results = [];

    items.forEach((item) => {
      const titleEl = item.querySelector("title");
      const linkEl = item.querySelector("link");
      const dateEl = item.querySelector("pubDate, published, updated");

      const title = titleEl ? cleanText(titleEl.textContent) : "";
      let link = "";
      if (linkEl) {
        link = linkEl.getAttribute("href") || linkEl.textContent.trim();
      }
      const dateStr = dateEl ? dateEl.textContent.trim() : "";
      const date = dateStr ? new Date(dateStr) : null;

      if (!title || !link) return;
      results.push({ title, link, date, source, teams: detectTeams(title) });
    });

    return results;
  }

  function cleanText(s) {
    return s
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  function detectTeams(headline) {
    const lower = headline.toLowerCase();
    const found = [];
    TEAMS.forEach((t) => {
      for (const alias of t.aliases) {
        const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, "i");
        if (re.test(headline)) {
          found.push(t);
          break;
        }
      }
    });
    return found;
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  async function loadAll() {
    setStatus("Loading…", "");
    showSkeletons();

    const results = await Promise.all(SOURCES.map(fetchSource));
    articles = results.flat();

    // Dedupe by title
    const seen = new Set();
    articles = articles.filter((a) => {
      const key = a.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by date desc; undated items go to the end
    articles.sort((a, b) => {
      if (a.date && b.date) return b.date - a.date;
      if (a.date) return -1;
      if (b.date) return 1;
      return 0;
    });

    if (articles.length === 0) {
      setStatus("Could not load feeds. The RSS proxy may be down.", "error");
    } else {
      const failedSources = SOURCES.length - results.filter((r) => r.length > 0).length;
      if (failedSources > 0) {
        setStatus(`Loaded ${articles.length} headlines (${failedSources} source${failedSources > 1 ? "s" : ""} failed)`, "ok");
      } else {
        setStatus(`Loaded ${articles.length} headlines from ${SOURCES.length} sources`, "ok");
      }
    }

    $lastUpdated.textContent = `updated ${formatTime(new Date())}`;
    render();
  }

  function showSkeletons() {
    $feed.innerHTML = "";
    $empty.classList.add("hidden");
    for (let i = 0; i < 5; i++) {
      const sk = document.createElement("div");
      sk.className = "skeleton";
      $feed.appendChild(sk);
    }
  }

  function setStatus(msg, cls) {
    $status.textContent = msg;
    $status.className = "status " + (cls || "");
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function render() {
    const filtered = articles.filter((a) => {
      if (!activeSources.has(a.source.id)) return false;
      if (searchTerm && !a.title.toLowerCase().includes(searchTerm)) return false;
      if (activeTeams.size > 0) {
        const hit = a.teams.some((t) => activeTeams.has(t.id));
        if (!hit) return false;
      }
      return true;
    });

    $articleCount.textContent = filtered.length;

    if (filtered.length === 0) {
      $feed.innerHTML = "";
      $empty.classList.remove("hidden");
      return;
    }

    $empty.classList.add("hidden");
    $feed.innerHTML = "";

    const frag = document.createDocumentFragment();
    filtered.forEach((a) => frag.appendChild(buildArticle(a)));
    $feed.appendChild(frag);
  }

  function buildArticle(a) {
    const el = document.createElement("article");
    el.className = "article";

    const link = document.createElement("a");
    link.className = "article-title";
    link.href = a.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = a.title;
    el.appendChild(link);

    const meta = document.createElement("div");
    meta.className = "article-meta";

    const sourceTag = document.createElement("span");
    sourceTag.className = "source-tag " + a.source.cssClass;
    sourceTag.textContent = a.source.label;
    meta.appendChild(sourceTag);

    if (a.date) {
      const ago = document.createElement("span");
      ago.textContent = formatRelative(a.date);
      meta.appendChild(ago);
    }

    el.appendChild(meta);

    if (a.teams.length > 0) {
      const teamsRow = document.createElement("div");
      teamsRow.className = "article-teams";
      a.teams.forEach((t) => {
        const tag = document.createElement("span");
        tag.className = "team-tag";
        tag.textContent = t.name;
        teamsRow.appendChild(tag);
      });
      el.appendChild(teamsRow);
    }

    return el;
  }

  // ── Time helpers ───────────────────────────────────────────────────────────
  function formatRelative(date) {
    const now = Date.now();
    const diff = now - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  function formatTime(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ── Wire up ────────────────────────────────────────────────────────────────
  $refresh.addEventListener("click", loadAll);
  loadAll();

  // Auto-refresh every 5 minutes
  setInterval(loadAll, 5 * 60 * 1000);
})();
