/* Book-by-book fantasy projections.
 *
 * Every other view in this project collapses the sportsbooks into one
 * consensus number. This one does the opposite: it keeps each book's own
 * posted lines and scores them separately, so the disagreement is visible.
 * That disagreement is the useful part -- when FanDuel has a receiver at 67.5
 * yards and BetRivers at 58.5, the consensus hides a real difference of
 * opinion about his role, and that is exactly when a start/sit call is hard.
 *
 * Data comes from ../nfl-props/, written by the scrapers in scripts/.
 * oddsapi.json is the only source with per-book quotes; Kalshi and the
 * DraftKings TD scrape are single-venue and appear as their own columns.
 */
(function () {
  "use strict";

  var DATA_DIR = "../nfl-props/";

  // All mutable view state up front. Declaring these below their first
  // synchronous use has caused real outages in the sibling app (temporal dead
  // zone throws a ReferenceError, and the page renders blank with no message).
  var cache = {};
  var format = "half";
  var posFilter = "ALL";
  var search = "";
  var sortKey = "consensus";
  var sortDir = -1;
  var hideTdOnly = true;

  // Column order is fixed rather than derived from the data so the table does
  // not reshuffle between refreshes as books come and go.
  var BOOKS = [
    { key: "consensus",   label: "Consensus", cls: "col-consensus" },
    { key: "fanduel",     label: "FanDuel" },
    { key: "betrivers",   label: "BetRivers" },
    { key: "betmgm",      label: "BetMGM" },
    { key: "fanatics",    label: "Fanatics" },
    { key: "betonlineag", label: "BetOnline" },
    { key: "bovada",      label: "Bovada" },
    { key: "kalshi",      label: "Kalshi", cls: "col-alt" },
    { key: "dk",          label: "DK (TD only)", cls: "col-alt" }
  ];

  var STAT_KEYS = ["pass_yds", "pass_tds", "rush_yds", "rec_yds",
                   "receptions", "any_tds"];

  var ESCAPES = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  };

  // Matchups arrive in two shapes: Kalshi and The Odds API write "CARCLE", the
  // DraftKings scrape writes "CAR Panthers @ CLE Browns". Normalised on display
  // so one column does not have to fit the long form.
  var MATCHUP_SPLIT = {
    "LA Chargers": "LAC", "LA Rams": "LAR",
    "NY Jets": "NYJ", "NY Giants": "NYG"
  };
  var MATCHUP_ALIAS = { JAX: "JAC", WSH: "WAS", LA: "LAR" };

  function shortMatchup(m) {
    var s = String(m == null ? "" : m).trim();
    if (!s) return "";
    var at = s.split(" @ ");
    if (at.length !== 2) return s;
    function code(side) {
      var t = side.trim();
      for (var k in MATCHUP_SPLIT) {
        if (t.indexOf(k) === 0) return MATCHUP_SPLIT[k];
      }
      var hit = t.match(/^([A-Z]{2,3})(?![A-Za-z])/);
      var c = hit ? hit[1] : "";
      return MATCHUP_ALIAS[c] || c;
    }
    var a = code(at[0]), h = code(at[1]);
    return a && h ? a + h : s;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ESCAPES[c];
    });
  }

  function fetchJson(file) {
    return fetch(DATA_DIR + file + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error(file + " " + r.status);
        return r.json();
      });
  }

  // Name keys. Suffixes and punctuation differ between feeds ("Marvin
  // Harrison Jr." vs "Marvin Harrison"), so matching on a normalised key is
  // what lets one row carry quotes from several sources.
  /* Whole-name fixes, kept in step with lineup/app.js.
   *
   * Without these the table carried Cam Ward and Cameron Ward as two rows for
   * one quarterback -- the first with his market lines, the second with only the
   * DraftKings touchdown, tagged "TD only". A reader comparing books would have
   * been comparing one player against himself.
   *
   * Listed individually rather than as a cam -> cameron rule, which would merge
   * every Cam with every Cameron and be wrong more often than right.
   */
  var NAME_ALIASES = {
    "cam skattebo": "cameron skattebo",
    "quishon judkins": "quinshon judkins",
    "cam ward": "cameron ward",
    "josh palmer": "joshua palmer",
    "chig okonkwo": "chigoziem okonkwo"
  };

  var FIRST_ALIASES = {
    ken: "kenneth", kenny: "kenneth", mike: "michael", matt: "matthew",
    nick: "nicholas", chris: "christopher", tony: "anthony", rob: "robert",
    bob: "robert", dan: "daniel", danny: "daniel", joe: "joseph",
    tom: "thomas", will: "william", billy: "william", bill: "william",
    ben: "benjamin", alex: "alexander", jon: "jonathan",
    tj: "t j", dj: "d j", aj: "a j", cj: "c j", jk: "j k", dk: "d k"
  };

  function normName(s) {
    if (!s) return "";
    var out = String(s).toLowerCase();
    out = out.replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, "");
    out = out.replace(/[^a-z0-9 ]/g, " ");
    out = out.replace(/\s+/g, " ").trim();
    var parts = out.split(" ");
    if (parts.length >= 2 && FIRST_ALIASES[parts[0]]) {
      parts[0] = FIRST_ALIASES[parts[0]];
      out = parts.join(" ");
    }
    return NAME_ALIASES[out] || out;
  }

  // Fantasy points from a set of stat lines. The scoring format only changes
  // the reception rate, which is the whole point of the toggle.
  function score(stats, fmt) {
    if (!stats) return null;
    var recRate = fmt === "ppr" ? 1 : fmt === "half" ? 0.5 : 0;
    var any = false;
    var pts = 0;
    function add(k, mult) {
      var v = stats[k];
      if (v == null) return;
      any = true;
      pts += v * mult;
    }
    add("pass_yds", 0.04);
    add("pass_tds", 4);
    add("rush_yds", 0.1);
    add("rec_yds", 0.1);
    add("any_tds", 6);
    add("receptions", recRate);
    return any ? Math.round(pts * 100) / 100 : null;
  }

  function median(xs) {
    if (!xs.length) return null;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* Build one row per player:
   *   byBook[book][stat] = line       one book's own numbers
   *   consensus[stat]    = median     across every book that priced it
   *
   * The consensus is computed per stat rather than by averaging the book
   * columns, because books price different subsets: a book that posts only
   * receiving yards would otherwise drag a player's total down purely by
   * being incomplete.
   */
  function buildRows() {
    var rows = new Map();

    function row(name, meta) {
      var key = normName(name);
      var r = rows.get(key);
      if (!r) {
        r = { key: key, name: name, position: null, team: null,
              matchup: null, kickoff: null, byBook: {}, consensus: {} };
        rows.set(key, r);
      }
      if (meta) {
        if (meta.position && !r.position) r.position = meta.position;
        if (meta.team && !r.team) r.team = meta.team;
        if (meta.matchup && !r.matchup) r.matchup = meta.matchup;
        if (meta.kickoff && !r.kickoff) r.kickoff = meta.kickoff;
      }
      return r;
    }

    function put(r, book, stat, line) {
      if (line == null) return;
      if (!r.byBook[book]) r.byBook[book] = {};
      // A book occasionally posts the same stat twice (a main line and an
      // alternate). Keep the first, which the scraper already picked as the
      // headline number.
      if (r.byBook[book][stat] == null) r.byBook[book][stat] = line;
    }

    // -- The Odds API: the only per-book source -------------------------------
    var od = cache.oddsapi;
    if (od && od.players) {
      od.players.forEach(function (p) {
        var r = row(p.name, { position: p.position, matchup: p.matchup,
                              kickoff: p.kickoff });
        Object.keys(p.stats || {}).forEach(function (stat) {
          var s = p.stats[stat];
          var quotes = s.quotes || [];
          if (quotes.length) {
            quotes.forEach(function (q) { put(r, q.book, stat, q.line); });
          } else if (s.line != null) {
            put(r, "unknown", stat, s.line);
          }
        });
      });
    }

    // -- Kalshi: one venue, so one column -------------------------------------
    var wk = cache.weekly;
    if (wk && wk.players) {
      wk.players.forEach(function (p) {
        var r = row(p.name, { position: p.position, matchup: p.matchup,
                              kickoff: p.kickoff });
        Object.keys(p.stats || {}).forEach(function (stat) {
          var s = p.stats[stat];
          // Kalshi rows carry their own source tag; a books-sourced line here
          // is already represented in the Odds API columns, so skip it rather
          // than double-count one book as "Kalshi".
          if (s && s.lineSource === "books") return;
          if (s && s.line != null) put(r, "kalshi", stat, s.line);
        });
      });
    }

    // -- DraftKings anytime-TD scrape -----------------------------------------
    var dk = cache.dktd;
    if (dk && dk.players) {
      dk.players.forEach(function (p) {
        var r = row(p.name, { matchup: p.matchup, kickoff: p.kickoff });
        if (p.xTD != null) put(r, "dk", "any_tds", p.xTD);
      });
    }

    // -- Consensus, per stat ---------------------------------------------------
    rows.forEach(function (r) {
      STAT_KEYS.forEach(function (stat) {
        var vals = [];
        Object.keys(r.byBook).forEach(function (b) {
          // Kalshi and the DK TD scrape are included: they are real venues
          // with real prices, and excluding them would make the consensus a
          // US-sportsbook-only number without saying so.
          var v = r.byBook[b][stat];
          if (v != null) vals.push(v);
        });
        var m = median(vals);
        if (m != null) r.consensus[stat] = m;
      });
    });

    // Position comes from the projection feeds, which cover more players than
    // any single book does.
    var posByName = {};
    [cache.data, cache.clay].forEach(function (d) {
      var list = (d && (d.players || d.rows)) || [];
      list.forEach(function (p) {
        var n = normName(p.name || p.player);
        var pos = p.position || p.pos;
        if (n && pos && !posByName[n]) posByName[n] = String(pos).toUpperCase();
      });
    });
    rows.forEach(function (r) {
      if (!r.position && posByName[r.key]) r.position = posByName[r.key];
      if (r.position) r.position = String(r.position).toUpperCase();
    });

    return Array.from(rows.values());
  }

  function visibleRows(all) {
    var q = search.trim().toLowerCase();
    return all.filter(function (r) {
      if (posFilter !== "ALL" && r.position !== posFilter) return false;
      if (q) {
        var hay = (r.name + " " + (r.team || "") + " " +
                   (r.matchup || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      if (hideTdOnly && isTdOnly(r)) return false;
      // A row with nothing priced anywhere is noise.
      return Object.keys(r.consensus).length > 0;
    });
  }

  /* A row nobody priced beyond a touchdown.
   *
   * 200 of 455 rows on the week 3 board are in this state, and their totals
   * are not comparable to a fully-priced player: Jonathan Taylor comes out at
   * 3.4 next to Trey McBride at 12.6, which is a statement about market
   * coverage rather than about the players. Sorting them into the same list
   * without saying so is the misleading part, so they are marked and can be
   * hidden.
   */
  function isTdOnly(r) {
    var keys = Object.keys(r.consensus);
    return keys.length === 1 && keys[0] === "any_tds";
  }

  function cellValue(r, bookKey) {
    if (bookKey === "consensus") return score(r.consensus, format);
    return score(r.byBook[bookKey], format);
  }

  /* Whether a book priced the same stats the consensus did.
   *
   * This distinction matters more than it looks. Fanatics posted only Lamar
   * Jackson's rushing yards in week 3, which scores to 3.5 against a consensus
   * of 22.4 -- read as a column of numbers that looks like a book that thinks
   * he is worthless, when really it is a book that priced one leg of him.
   * Comparing those two totals is meaningless, so a partial cell is marked and
   * kept out of the spread.
   */
  function isComplete(r, bookKey) {
    var b = r.byBook[bookKey];
    if (!b) return false;
    var ref = referenceStats(r);
    for (var i = 0; i < ref.length; i++) {
      if (b[ref[i]] == null) return false;
    }
    return true;
  }

  /* The stats a full sportsbook quote for this player consists of.
   *
   * Taking every stat in the consensus is too strict -- no US book posts
   * anytime TD in this feed, so requiring it disqualifies all of them and the
   * spread column empties out. Taking the union of what books happen to post
   * is too loose, and was how Fanatics quoting only Lamar Jackson's rushing
   * yards read as an 18.8-point disagreement.
   *
   * The honest reference is the stats posted by the book with the widest
   * coverage of this player: that is what a complete quote looks like here,
   * and any book matching it is comparable like-for-like.
   */
  function referenceStats(r) {
    var best = [];
    Object.keys(r.byBook).forEach(function (bk) {
      // Single-market venues cannot define what a full quote is.
      if (bk === "dk" || bk === "kalshi") return;
      var have = STAT_KEYS.filter(function (k) {
        return r.byBook[bk][k] != null;
      });
      if (have.length > best.length) best = have;
    });
    return best;
  }

  var STAT_LABELS = {
    pass_yds: "passing yards", pass_tds: "passing TDs",
    rush_yds: "rushing yards", rec_yds: "receiving yards",
    receptions: "receptions", any_tds: "anytime TD"
  };

  // Tooltip for a partial cell, naming what the book did not price. Without
  // this the asterisk says "something is missing" but not what, which is the
  // difference between a usable warning and a puzzle.
  function missingLabel(r, bookKey) {
    var b = r.byBook[bookKey] || {};
    var missing = [];
    referenceStats(r).forEach(function (k) {
      if (b[k] == null) missing.push(STAT_LABELS[k] || k);
    });
    if (!missing.length) return "";
    return "Partial: this book has not posted " + missing.join(" or ") +
      ", so the total is lower than a like-for-like comparison. " +
      "Excluded from the spread.";
  }

  function render() {
    var $out = document.getElementById("output");
    if (!$out) return;
    var all = buildRows();
    var rows = visibleRows(all);

    if (!rows.length) {
      $out.innerHTML = '<div class="empty">No players match.</div>';
      renderLegend(all, []);
      return;
    }

    // Only show a book column when that book actually priced somebody in the
    // current filter -- an empty column is just noise on a phone.
    var live = BOOKS.filter(function (b) {
      if (b.key === "consensus") return true;
      return rows.some(function (r) { return cellValue(r, b.key) != null; });
    });

    rows.sort(function (a, b) {
      var av = cellValue(a, sortKey);
      var bv = cellValue(b, sortKey);
      // Unpriced sorts last in both directions: a blank is missing data, not
      // a zero, so it should never outrank a real number.
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av === bv) return a.name.localeCompare(b.name);
      return (av - bv) * sortDir;
    });

    var html = '<table class="board"><thead><tr>' +
      '<th class="col-rank">#</th>' +
      '<th class="col-player">Player</th>' +
      '<th class="col-pos">Pos</th>' +
      '<th class="col-game">Game</th>';
    live.forEach(function (b) {
      var active = sortKey === b.key;
      html += '<th class="num sortable' + (b.cls ? " " + b.cls : "") +
        (active ? " sorted" : "") + '" data-sort="' + b.key + '">' +
        escapeHtml(b.label) +
        (active ? '<span class="arrow">' + (sortDir < 0 ? "▼" : "▲") +
                  "</span>" : "") +
        "</th>";
    });
    html += '<th class="num col-spread" title="Highest minus lowest across ' +
      'the US sportsbooks that priced the same markets. Kalshi is excluded ' +
      'because it is the only venue here carrying anytime-TD, which would ' +
      'read as disagreement rather than a different market set.">' +
      "Spread</th></tr></thead><tbody>";

    rows.forEach(function (r, i) {
      /* Spread across US sportsbooks only, and only those that priced the
       * same markets.
       *
       * Kalshi and the DK scrape are excluded on purpose. Kalshi is the only
       * venue here carrying anytime-TD, worth about six points of equity, so
       * including it made every star running back look like a six-point
       * disagreement when the books actually agreed to within a tenth --
       * McCaffrey was fanduel 5.5 / betrivers 5.5 / betonline 5.5 / kalshi
       * 11.4. That is a different market set, not a different opinion.
       */
      var vals = [];
      live.forEach(function (b) {
        if (b.key === "consensus" || b.key === "dk" || b.key === "kalshi") return;
        if (!isComplete(r, b.key)) return;
        var v = cellValue(r, b.key);
        if (v != null) vals.push(v);
      });
      // Books agree closely on these markets: across week 3 the widest
      // like-for-like disagreement was 0.9 points, and most sit under 0.3.
      // The highlight threshold is set against that real distribution rather
      // than an arbitrary round number, so it marks the genuine outliers.
      var spread = vals.length > 1
        ? Math.max.apply(null, vals) - Math.min.apply(null, vals) : null;

      var tdOnly = isTdOnly(r);
      html += '<tr' + (tdOnly ? ' class="td-only"' : "") + ">" +
        '<td class="col-rank">' + (i + 1) + "</td>" +
        '<td class="col-player">' + escapeHtml(r.name) +
        (tdOnly ? ' <span class="td-only-tag" title="No venue priced this ' +
          'player beyond an anytime touchdown, so this total is a floor ' +
          'rather than a projection.">TD only</span>' : "") + "</td>" +
        '<td class="col-pos"><span class="pos-badge pos-' +
          escapeHtml(r.position || "NA") + '">' +
          escapeHtml(r.position || "—") + "</span></td>" +
        '<td class="col-game">' + escapeHtml(shortMatchup(r.matchup) || "—") + "</td>";
      live.forEach(function (b) {
        var v = cellValue(r, b.key);
        var partial = v != null && b.key !== "consensus" && b.key !== "dk" &&
                      b.key !== "kalshi" && !isComplete(r, b.key);
        html += '<td class="num' + (b.cls ? " " + b.cls : "") +
          (partial ? " partial" : "") + '"' +
          (partial ? ' title="' + escapeHtml(missingLabel(r, b.key)) + '"' : "") +
          ">" +
          (v == null ? '<span class="blank">—</span>' : v.toFixed(1)) +
          (partial ? '<span class="partial-mark">*</span>' : "") +
          "</td>";
      });
      html += '<td class="num col-spread">' +
        (spread == null ? '<span class="blank">—</span>'
          : '<span class="' + (spread >= 0.75 ? "wide" : "") + '">' +
            spread.toFixed(1) + "</span>") +
        "</td></tr>";
    });

    html += "</tbody></table>";
    $out.innerHTML = html;

    $out.querySelectorAll("th.sortable").forEach(function (th) {
      th.addEventListener("click", function () {
        var k = th.dataset.sort;
        if (sortKey === k) sortDir = -sortDir;
        else { sortKey = k; sortDir = -1; }
        render();
      });
    });

    renderLegend(all, live);
  }

  function renderLegend(all, live) {
    var $l = document.getElementById("book-legend");
    if (!$l) return;
    var parts = live.filter(function (b) { return b.key !== "consensus"; })
      .map(function (b) {
        var n = all.filter(function (r) {
          return cellValue(r, b.key) != null;
        }).length;
        return '<span class="legend-chip">' + escapeHtml(b.label) +
          '<span class="legend-n">' + n + "</span></span>";
      });
    $l.innerHTML = parts.join("");
  }

  function renderMeta() {
    var $m = document.getElementById("meta");
    if (!$m) return;
    var wk = cache.weekly;
    var od = cache.oddsapi;
    var bits = [];
    if (wk && wk.week) bits.push("Week " + wk.week);
    if (od && od.lastUpdated) {
      bits.push("lines updated " +
        new Date(od.lastUpdated).toLocaleString(undefined,
          { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
    }
    bits.push("each column is that book's own lines, scored as fantasy points");
    $m.textContent = bits.join(" · ");
  }

  function wire() {
    var fs = document.getElementById("format-seg");
    if (fs) {
      fs.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-format]");
        if (!b) return;
        format = b.dataset.format;
        fs.querySelectorAll("button").forEach(function (x) {
          x.classList.toggle("active", x === b);
        });
        render();
      });
    }
    var ps = document.getElementById("pos-seg");
    if (ps) {
      ps.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-pos]");
        if (!b) return;
        posFilter = b.dataset.pos;
        ps.querySelectorAll("button").forEach(function (x) {
          x.classList.toggle("active", x === b);
        });
        render();
      });
    }
    var h = document.getElementById("hide-tdonly");
    if (h) {
      h.addEventListener("change", function () {
        hideTdOnly = h.checked;
        render();
      });
    }
    var s = document.getElementById("search");
    if (s) {
      s.addEventListener("input", function () {
        search = s.value;
        render();
      });
    }
  }

  function boot() {
    wire();
    var files = [["weekly", "weekly.json"], ["oddsapi", "oddsapi.json"],
                 ["dktd", "dk_td.json"], ["data", "data.json"],
                 ["clay", "clay.json"]];
    Promise.all(files.map(function (f) {
      return fetchJson(f[1])
        .then(function (j) { cache[f[0]] = j; })
        .catch(function () { cache[f[0]] = null; });
    })).then(function () {
      renderMeta();
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
