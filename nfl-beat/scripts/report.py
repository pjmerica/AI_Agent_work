"""Render the digest to HTML + Markdown.

Every claim in the output links back to the item it came from -- there are no
unsourced assertions anywhere in the digest.
"""
from __future__ import annotations

import html
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
DIGESTS = ROOT / "digests"

CSS = """
:root{--bg:#ffffff;--fg:#16181d;--muted:#5c6370;--line:#e3e6ea;--card:#f7f8fa;
--hot:#b3261e;--warm:#8a5a00;--cool:#1a5c9e;--good:#1b6b3a;--accent:#3d5afe}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--fg:#e6e8eb;--muted:#9aa3af;
--line:#252a33;--card:#171a21;--hot:#ff6b5e;--warm:#e0a33a;--cool:#6fb2f0;--good:#5ad18a;--accent:#8c9eff}}
:root[data-theme=dark]{--bg:#0f1115;--fg:#e6e8eb;--muted:#9aa3af;--line:#252a33;--card:#171a21;
--hot:#ff6b5e;--warm:#e0a33a;--cool:#6fb2f0;--good:#5ad18a;--accent:#8c9eff}
:root[data-theme=light]{--bg:#ffffff;--fg:#16181d;--muted:#5c6370;--line:#e3e6ea;--card:#f7f8fa;
--hot:#b3261e;--warm:#8a5a00;--cool:#1a5c9e;--good:#1b6b3a;--accent:#3d5afe}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
padding:24px 16px 64px}
.wrap{max-width:920px;margin:0 auto}
h1{font-size:23px;margin:0 0 4px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:13px;margin-bottom:22px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);
margin:34px 0 12px;padding-bottom:7px;border-bottom:1px solid var(--line)}
h3.bucket{font-size:13px;font-weight:650;color:var(--fg);margin:22px 0 9px;
letter-spacing:-.01em}
h3.bucket .meta{font-weight:400}
.toggle{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 6px}
.bkt{font:inherit;font-size:12.5px;font-weight:600;color:var(--muted);
background:var(--card);border:1px solid var(--line);border-radius:20px;
padding:5px 12px;cursor:pointer;transition:all .12s}
.bkt:hover{color:var(--fg);border-color:var(--muted)}
.bkt.active{background:var(--accent);border-color:var(--accent);color:#fff}
.bkt .n{opacity:.65;font-weight:400;margin-left:3px}
.bkt.active .n{opacity:.85}
.bucket-group[hidden]{display:none}
.search{margin:18px 0 6px}
#q{width:100%;font:inherit;font-size:14px;color:var(--fg);background:var(--card);
border:1px solid var(--line);border-radius:9px;padding:10px 13px;outline:none}
#q:focus{border-color:var(--accent)}
#qres{margin-top:9px}
.hit{background:var(--card);border:1px solid var(--line);border-radius:9px;
padding:11px 13px;margin-bottom:7px}
.hit .top{margin-bottom:3px}
.hit .none{color:var(--muted);font-size:13px;font-style:italic}
.qnews{border-left:2px solid var(--line);padding:4px 0 4px 10px;margin-top:6px;
font-size:13px}
.qnews a{color:var(--accent);text-decoration:none}
.qnews a:hover{text-decoration:underline}
.qnews .src{color:var(--muted);font-size:11.5px}
.card{background:var(--card);border:1px solid var(--line);border-radius:9px;
padding:13px 15px;margin-bottom:9px}
.top{display:flex;flex-wrap:wrap;align-items:baseline;gap:9px;margin-bottom:5px}
.nm{font-weight:650;font-size:16px}
.meta{color:var(--muted);font-size:12.5px}
.tag{font-size:11px;font-weight:650;padding:2px 7px;border-radius:20px;
border:1px solid currentColor;white-space:nowrap}
.t-flat{color:var(--good)}.t-moved{color:var(--muted)}.t-thread{color:var(--cool)}
.t-vid{color:var(--warm)}
.t-hot{color:var(--hot)}.t-rise{color:var(--good)}.t-fall{color:var(--hot)}
.sig{color:var(--muted);font-size:12px;margin:5px 0 7px}
.sig code{background:rgba(125,125,125,.14);padding:1px 5px;border-radius:4px;font-size:11.5px}
.itm{border-left:2px solid var(--line);padding:5px 0 5px 11px;margin-top:7px;font-size:13.5px}
.itm a{color:var(--accent);text-decoration:none}
.itm a:hover{text-decoration:underline}
.src{color:var(--muted);font-size:11.5px;margin-top:2px}
.dup{color:var(--cool);cursor:help}
table{width:100%;border-collapse:collapse;font-size:13.5px}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--muted);font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em}
.up{color:var(--good);font-weight:600}.dn{color:var(--hot);font-weight:600}
.empty{color:var(--muted);font-style:italic;padding:14px 0}
footer{margin-top:44px;padding-top:16px;border-top:1px solid var(--line);
color:var(--muted);font-size:12px}
footer code{background:rgba(125,125,125,.14);padding:1px 5px;border-radius:4px}
"""


def _esc(s: str) -> str:
    return html.escape(str(s), quote=True)


def _adp_lag_days(stats) -> int | None:
    """How far behind today the ADP board is, or None if it can't be determined."""
    from datetime import date as _date
    try:
        return (_date.today() - _date.fromisoformat(stats["adp_latest"])).days
    except (ValueError, KeyError, TypeError):
        return None


def _stale_warning(stats) -> str:
    """Flag an ADP board that has stopped advancing.

    The digest rolls forward to the newest snapshot automatically, so a lag here
    means the upstream EZ Dubs pull has stalled -- not that this script is wrong.
    """
    lag = _adp_lag_days(stats)
    if lag is None or lag <= 2:
        return ""
    return (f'<br><span style="color:var(--hot);font-weight:600">'
            f"⚠ ADP board is {lag} days old — upstream pull may have stalled.</span>")


def _fmt_adp(p) -> str:
    return "undrafted" if p.adp is None else f"ADP {p.adp:.1f}"


def _move_html(p) -> str:
    mv = p.adp_move
    if mv is None:
        return '<span class="meta">no ADP history</span>'
    if abs(mv) < 2:
        return '<span class="meta">flat</span>'
    cls = "up" if mv > 0 else "dn"
    return f'<span class="{cls}">{mv:+.1f}</span>'


def _item_html(m, dup: int = 1, dup_srcs: list | None = None) -> str:
    it = m.item
    text = _esc(it.text[:260] + ("…" if len(it.text) > 260 else ""))
    url = _esc(it.url)
    src = _esc(it.source)
    age = f"{it.age_hours:.0f}h ago" if it.age_hours < 900 else "undated"
    link = f'<a href="{url}" target="_blank" rel="noopener">{text}</a>' if url else text

    # Corroboration is shown, not hidden: collapsing four reports of one signing
    # should still tell you four outlets carried it.
    also = ""
    if dup > 1:
        others = [s for s in (dup_srcs or []) if s != it.source][:3]
        tip = f' title="{_esc(", ".join(others))}"' if others else ""
        also = (f'<span class="dup"{tip}> · also in {dup - 1} '
                f'other outlet{"s" if dup > 2 else ""}</span>')
    return f'<div class="itm">{link}<div class="src">{src} · {age}{also}</div></div>'


def _player_card(d) -> str:
    p = d["player"]
    tag = ('<span class="tag t-flat">FLAT ADP</span>' if d["unpriced"]
           else '<span class="tag t-moved">MOVED</span>')
    pos_team = " ".join(x for x in (p.pos, p.team) if x)
    sigs = " ".join(f"<code>{_esc(s)}</code>" for s in d["signals"][:7])
    dupc = d.get("dup_counts", {})
    dups = d.get("dup_sources", {})
    items = "".join(_item_html(m, dupc.get(id(m), 1), dups.get(id(m)))
                    for m in d["matches"])
    proj = f" · proj {p.proj:.0f}" if p.proj else ""
    return f"""<div class="card">
<div class="top"><span class="nm">{_esc(p.name)}</span>
<span class="meta">{_esc(pos_team)} · {_fmt_adp(p)}{proj}</span>
{tag}<span class="meta">{_move_html(p)}</span></div>
<div class="sig">signals: {sigs} · {d['n_sources']} source(s)</div>
{items}</div>"""


# Ordered deepest-first: the deep tail is the point of this digest, so it leads.
# The 160 boundary is deliberate -- past roughly ADP 160 a player is a last-rounds
# flier whose camp news is genuinely unpriced, where 61-159 is contested middle
# ground the market watches more closely.
# (key, label, test, how_many_to_show). Caps are deliberately lopsided: the deep
# tail is what this digest exists for, so it gets the room. Early picks are
# included for completeness, not because their news is actionable.
ADP_BUCKETS = [
    ("deep", "Deep — ADP 160+ and undrafted",
     lambda a: a is None or a >= 160, 22),
    ("mid", "Mid-round — ADP 61-159",
     lambda a: a is not None and 61 <= a < 160, 12),
    ("early", "Early picks — ADP 1-60",
     lambda a: a is not None and a < 61, 6),
]


def _bucket_of(adp) -> str:
    for key, _label, test, _n in ADP_BUCKETS:
        if test(adp):
            return key
    return "deep"


def _search_index(all_players: dict, archive_rows: list, cap_obs: int = 6) -> str:
    """Embed a searchable index of the whole player universe.

    Two parts, kept small on purpose:
      P: [name, pos, team, adp, proj] for every player -- ~58 KB for 1,563.
      H: recent archived news per player, capped at `cap_obs` observations and
         2 items each, so the payload stays flat (~38 KB) instead of growing
         with the archive. The full history lives in archive/*.ndjson and is
         reachable via scripts/lookup.py -- this is a display window only.
    """
    P = [[p.name, p.pos, p.team,
          p.adp, round(p.proj) if p.proj else None]
         for p in all_players.values()]

    H: dict[str, list] = {}
    for r in sorted(archive_rows, key=lambda x: x.get("run", "")):
        H.setdefault(r.get("name", ""), []).append([
            r.get("run", "")[:10],
            r.get("adp"),
            [[it.get("text", "")[:110], it.get("url", ""), it.get("source", "")]
             for it in r.get("items", [])[:2]],
        ])
    for k in H:
        H[k] = H[k][-cap_obs:]

    payload = json.dumps({"P": P, "H": H}, separators=(",", ":"),
                         ensure_ascii=False)
    # </script> inside data would close the block early.
    payload = payload.replace("</", "<\\/")
    return f'<script id="idx" type="application/json">{payload}</script>'


def _search_box() -> str:
    return (
        '<div class="search">'
        '<input id="q" type="search" placeholder="Search any player — '
        'all 1,563, news or not…" autocomplete="off" spellcheck="false">'
        '<div id="qres"></div>'
        "</div>"
    )


def _bucket_toggle(counts: dict[str, int]) -> str:
    """Filter bar: All plus one button per non-empty bucket."""
    total = sum(counts.values())
    btns = [f'<button class="bkt active" data-bucket="all">All '
            f'<span class="n">{total}</span></button>']
    for key, label, _test, _cap in ADP_BUCKETS:
        n = counts.get(key, 0)
        if not n:
            continue
        short = label.split("—")[0].strip()
        btns.append(f'<button class="bkt" data-bucket="{key}">{_esc(short)} '
                    f'<span class="n">{n}</span></button>')
    return f'<div class="toggle" role="group" aria-label="Filter by ADP bucket">{"".join(btns)}</div>'


def _bucketed_sections(groups: list) -> str:
    """Render flat-ADP players grouped by ADP bucket, deepest bucket first."""
    by: dict[str, list] = {k: [] for k, _l, _t, _n in ADP_BUCKETS}
    for g in groups:
        by[_bucket_of(g["player"].adp)].append(g)

    out = [_bucket_toggle({k: len(v) for k, v in by.items()})]
    for key, label, _test, cap in ADP_BUCKETS:
        rows = by[key][:cap]
        if not rows:
            continue
        total = len(by[key])
        more = (f' <span class="meta">showing {len(rows)} of {total}</span>'
                if total > len(rows) else "")
        out.append(f'<div class="bucket-group" data-bucket="{key}">')
        out.append(f'<h3 class="bucket">{_esc(label)}'
                   f' <span class="meta">({total})</span>{more}</h3>')
        out.append("".join(_player_card(d) for d in rows))
        out.append("</div>")
    return "".join(out)


def _thread_card(t: dict) -> str:
    """One recurring story: who, what theme, how long, and whether ADP reacted."""
    days = f"{t['n_days']} day{'s' if t['n_days'] != 1 else ''}"
    span = f" over {t['span_days']}d" if t["span_days"] > t["n_days"] else ""
    pos_team = " ".join(x for x in (t["pos"], t["team"]) if x)

    drift = t.get("adp_drift")
    if drift is None:
        adp_note = '<span class="meta">no ADP</span>'
    elif abs(drift) < 2:
        adp_note = '<span class="tag t-flat">ADP STILL FLAT</span>'
    else:
        cls = "up" if drift > 0 else "dn"
        adp_note = f'<span class="{cls}">ADP {drift:+.1f}</span>'

    also = ""
    if t.get("also_themes"):
        also = f' <span class="meta">+ {_esc(", ".join(t["also_themes"]))}</span>'

    item = ""
    if t.get("best_item"):
        bi = t["best_item"]
        txt = _esc(bi.get("text", "")[:200])
        url = _esc(bi.get("url", ""))
        src = _esc(bi.get("source", ""))
        link = f'<a href="{url}" target="_blank" rel="noopener">{txt}</a>' if url else txt
        item = f'<div class="itm">{link}<div class="src">{src}</div></div>'

    return f"""<div class="card">
<div class="top"><span class="nm">{_esc(t['player'])}</span>
<span class="meta">{_esc(pos_team)}</span>
<span class="tag t-thread">{_esc(t['theme_label'])}</span>
<span class="meta">{days}{span} · {t['n_sources']} source{'s' if t['n_sources'] != 1 else ''}</span>
{adp_note}{also}</div>
{item}</div>"""


def _highlights_html(highlights, hl_by_player, limit: int = 14) -> str:
    """Video clips, deepest-ADP players first.

    Kept separate from the news scoring on purpose: a viral catch is not a
    depth-chart signal, and letting clip volume feed a player's score would
    reward the players who are already famous.
    """
    if not highlights:
        return ""

    # One row per clip, labelled with whichever matched player is deepest.
    rows = []
    claimed: dict[str, list] = {}
    for name, ms in hl_by_player.items():
        for m in ms:
            claimed.setdefault(m.item.url or m.item.text[:80], []).append(m)

    for it in highlights:
        key = it.url or it.text[:80]
        ms = claimed.get(key, [])
        best = None
        if ms:
            best = max(ms, key=lambda m: m.player.sleeper_weight)
        rows.append((best, it))

    # Clips naming a player first, deepest player first within that.
    rows.sort(key=lambda r: (0 if r[0] else 1,
                             -(r[0].player.sleeper_weight if r[0] else 0)))

    cards = []
    for best, it in rows[:limit]:
        who = ""
        if best:
            p = best.player
            adp = "undrafted" if p.adp is None else f"ADP {p.adp:.0f}"
            who = (f'<span class="nm">{_esc(p.name)}</span> '
                   f'<span class="meta">{_esc(p.pos)} {_esc(p.team)} · {adp}</span>')
        else:
            who = '<span class="meta">no player matched</span>'
        vid = '<span class="tag t-vid">CLIP</span>' if it.has_video else ""
        txt = _esc(it.text[:170])
        url = _esc(it.url)
        link = (f'<a href="{url}" target="_blank" rel="noopener">{txt}</a>'
                if url else txt)
        src = _esc(it.source.replace("HL ", ""))
        age = f"{it.age_hours:.0f}h ago" if it.age_hours < 900 else ""
        cards.append(f'<div class="card"><div class="top">{who}{vid}</div>'
                     f'<div class="itm">{link}'
                     f'<div class="src">{src} · {age}</div></div></div>')

    more = (f'<span class="meta">showing {limit} of {len(rows)}</span>'
            if len(rows) > limit else "")
    return (f"<h2>Highlights — video clips {more}</h2>" + "".join(cards))


def _movers_table(rows, label) -> str:
    if not rows:
        return '<div class="empty">No qualifying moves.</div>'
    body = "".join(
        f"<tr><td>{_esc(r['name'])}</td><td>{_esc(r['pos'])}</td>"
        f"<td>{_esc(r['team'] or '—')}</td><td>{r['adp_prior']:.1f}</td>"
        f"<td>{r['adp']:.1f}</td>"
        f"<td class=\"{'up' if r['adp_move'] > 0 else 'dn'}\">{r['adp_move']:+.1f}</td></tr>"
        for r in rows
    )
    return (f'<div class="scroll"><table><thead><tr><th>{label}</th><th>Pos</th><th>Team</th>'
            f"<th>Was</th><th>Now</th><th>Δ</th></tr></thead><tbody>{body}</tbody></table></div>")


def build_html(groups, adp_ctx, stats, threads=None,
               all_players=None, archive_rows=None,
               highlights=None, hl_by_player=None) -> str:
    now = datetime.now(timezone.utc).astimezone()
    flat = [g for g in groups if g["unpriced"]]
    moved = [g for g in groups if not g["unpriced"]][:10]

    flat_html = (_bucketed_sections(flat) if flat
                 else '<div class="empty">No flat-ADP players with news today.</div>')
    moved_html = ("".join(_player_card(d) for d in moved) if moved
                  else '<div class="empty">No ADP movers with news.</div>')

    srcs = ", ".join(f"{k} ({v})" for k, v in sorted(stats["by_source"].items(),
                                                     key=lambda kv: -kv[1])[:10])

    # Recurring stories lead when they exist: something a beat writer has raised
    # on four separate days outranks anything that broke once this morning.
    threads_html = ""
    if threads:
        cards = "".join(_thread_card(t) for t in threads)
        threads_html = (
            "<h2>Developing — same story, multiple days</h2>"
            f"{cards}")
    elif stats.get("history_days", 0) < 2:
        threads_html = (
            "<h2>Developing — same story, multiple days</h2>"
            '<div class="empty">Needs 2+ days of digests before recurring '
            "stories can be identified. This fills in automatically.</div>")
    search_html = ""
    if all_players:
        search_html = _search_box()

    return f"""<title>NFL Beat Digest — {now:%b %d, %Y}</title>
<style>{CSS}</style>
<div class="wrap">
<h1>NFL Beat Digest</h1>
<div class="sub">{now:%A, %B %d %Y · %I:%M %p}
 · {stats['n_items']} items scanned · {stats['n_players']} players matched
 · ADP board {_esc(stats['adp_latest'])} vs {_esc(stats['adp_prior'])}
{_stale_warning(stats)}</div>

{search_html}

{threads_html}

<h2>News before the market moves</h2>
{flat_html}

<h2>News with ADP movers</h2>
{moved_html}

{_highlights_html(highlights, hl_by_player or {})}

<h2>ADP risers (last 14 days)</h2>
{_movers_table(adp_ctx['risers'], 'Riser')}

<h2>ADP fallers</h2>
{_movers_table(adp_ctx['fallers'], 'Faller')}

<footer>
<p><strong>Sources scanned:</strong> {_esc(srcs)}</p>
<p><strong>Method:</strong> deep and late-ADP players are weighted <em>above</em>
stars, since news on early picks is already reflected in their draft cost. Items
are scored on fantasy signal vocabulary near the player's name, then boosted when
ADP has <em>not</em> yet moved — that is where the edge is. Every line links to
its source.</p>
<p><strong>Not included:</strong> The Athletic. Its public RSS feed returns nothing
and its articles are paywalled; nothing behind that paywall is fetched.
X/Twitter via nitter is {_esc(stats['nitter'])}.</p>
</footer>
</div>
{_search_index(all_players, archive_rows or []) if all_players else ""}
<script>
(function () {{
  var bar = document.querySelector('.toggle');
  if (bar) {{
    var groups = document.querySelectorAll('.bucket-group');
    bar.addEventListener('click', function (e) {{
      var btn = e.target.closest('.bkt');
      if (!btn) return;
      var want = btn.dataset.bucket;
      bar.querySelectorAll('.bkt').forEach(function (b) {{
        b.classList.toggle('active', b === btn);
      }});
      groups.forEach(function (g) {{
        g.hidden = (want !== 'all' && g.dataset.bucket !== want);
      }});
    }});
  }}

  var raw = document.getElementById('idx');
  var box = document.getElementById('q');
  var out = document.getElementById('qres');
  if (!raw || !box || !out) return;

  var data;
  try {{ data = JSON.parse(raw.textContent); }} catch (e) {{ return; }}
  var P = data.P || [], H = data.H || {{}};

  // Match how the Python side normalises names, so searching "amon ra" or
  // "St. Brown" both work.
  function norm(s) {{
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
      .replace(/['".]/g, '').replace(/-/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\\s+/g, ' ').trim();
  }}
  var keys = P.map(function (p) {{ return norm(p[0]); }});

  function esc(s) {{
    return (s || '').replace(/[&<>"]/g, function (c) {{
      return {{'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}}[c];
    }});
  }}

  function render(list) {{
    if (!list.length) {{ out.innerHTML = ''; return; }}
    out.innerHTML = list.map(function (i) {{
      var p = P[i];
      var adp = (p[3] === null || p[3] === undefined) ? 'undrafted' : 'ADP ' + p[3];
      var proj = p[4] ? ' \\u00b7 proj ' + p[4] : '';
      var hist = H[p[0]];
      var news = '';
      if (hist && hist.length) {{
        var seen = {{}}, lines = [];
        for (var h = hist.length - 1; h >= 0; h--) {{
          var obs = hist[h];
          for (var k = 0; k < obs[2].length; k++) {{
            var it = obs[2][k];
            if (!it[1] || seen[it[1]]) continue;
            seen[it[1]] = 1;
            lines.push('<div class="qnews"><a href="' + esc(it[1]) +
              '" target="_blank" rel="noopener">' + esc(it[0]) +
              '</a><div class="src">' + esc(it[2]) + ' \\u00b7 ' + esc(obs[0]) +
              '</div></div>');
          }}
        }}
        news = lines.slice(0, 4).join('');
      }} else {{
        news = '<div class="none">no news recorded yet</div>';
      }}
      return '<div class="hit"><div class="top"><span class="nm">' +
        esc(p[0]) + '</span> <span class="meta">' +
        esc([p[1], p[2]].filter(Boolean).join(' ')) + ' \\u00b7 ' + adp + proj +
        '</span></div>' + news + '</div>';
    }}).join('');
  }}

  var t;
  box.addEventListener('input', function () {{
    clearTimeout(t);
    t = setTimeout(function () {{
      var q = norm(box.value);
      if (q.length < 2) {{ out.innerHTML = ''; return; }}
      var toks = q.split(' ');
      var exact = [], partial = [];
      for (var i = 0; i < keys.length; i++) {{
        var k = keys[i];
        if (k === q) {{ exact.push(i); continue; }}
        var ok = true;
        for (var j = 0; j < toks.length; j++) {{
          if (k.indexOf(toks[j]) === -1) {{ ok = false; break; }}
        }}
        if (ok) partial.push(i);
      }}
      // Players with recorded news first, then by ADP.
      partial.sort(function (a, b) {{
        var ha = H[P[a][0]] ? 0 : 1, hb = H[P[b][0]] ? 0 : 1;
        if (ha !== hb) return ha - hb;
        return (P[a][3] === null ? 999 : P[a][3]) - (P[b][3] === null ? 999 : P[b][3]);
      }});
      render(exact.concat(partial).slice(0, 10));
    }}, 90);
  }});
}})();
</script>"""


def build_markdown(groups, adp_ctx, stats, threads=None) -> str:
    now = datetime.now(timezone.utc).astimezone()
    L = [f"# NFL Beat Digest — {now:%b %d, %Y}", "",
         f"{stats['n_items']} items scanned · {stats['n_players']} players matched  ",
         f"ADP board {stats['adp_latest']} vs {stats['adp_prior']}", ""]
    lag = _adp_lag_days(stats)
    if lag is not None and lag > 2:
        L += [f"> ⚠ ADP board is {lag} days old — upstream pull may have stalled.", ""]
    if threads:
        L += ["## Developing — same story, multiple days", ""]
        for t in threads:
            drift = t.get("adp_drift")
            adp = ("ADP still flat" if drift is not None and abs(drift) < 2
                   else f"ADP {drift:+.1f}" if drift is not None else "no ADP")
            srcs = f"{t['n_sources']} source{'s' if t['n_sources'] != 1 else ''}"
            L.append(f"- **{t['player']}** ({t['pos']} {t['team']}) — "
                     f"{t['theme_label']}, {t['n_days']}d across {t['span_days']}d, "
                     f"{srcs}, {adp}")
        L.append("")

    L += [
         "## News before the market moves", ""]

    flat = [g for g in groups if g["unpriced"]]
    if not flat:
        L.append("_No flat-ADP players with news today._")

    by: dict[str, list] = {k: [] for k, _l, _t, _n in ADP_BUCKETS}
    for g in flat:
        by[_bucket_of(g["player"].adp)].append(g)

    for key, label, _test, cap in ADP_BUCKETS:
        rows = by[key][:cap]
        if not rows:
            continue
        L += [f"### {label} ({len(by[key])})", ""]
        for d in rows:
            p = d["player"]
            mv = ("flat" if (p.adp_move is None or abs(p.adp_move) < 2)
                  else f"{p.adp_move:+.1f}")
            L.append(f"**{p.name}** — {p.pos} {p.team} · {_fmt_adp(p)} · {mv}  ")
            L.append(f"*signals: {', '.join(d['signals'][:6])}*")
            for m in d["matches"]:
                t = m.item.text[:200].replace("\n", " ")
                L.append(f"- [{t}]({m.item.url}) — {m.item.source}")
            L.append("")

    L += ["## News with ADP movers", ""]
    for d in [g for g in groups if not g["unpriced"]][:10]:
        p = d["player"]
        L.append(f"- **{p.name}** ({p.pos} {p.team}, {_fmt_adp(p)}, {p.adp_move:+.1f}) "
                 f"— {d['matches'][0].item.url}")

    L += ["", "## ADP risers (14d)", ""]
    for r in adp_ctx["risers"][:12]:
        L.append(f"- {r['name']} ({r['pos']} {r['team']}): {r['adp_prior']:.1f} → "
                 f"{r['adp']:.1f} ({r['adp_move']:+.1f})")

    L += ["", "---", "",
          "The Athletic is not scraped: its public feed is empty and its articles are "
          "paywalled. Nitter (X) is " + stats["nitter"] + "."]
    return "\n".join(L)


def write_all(groups, adp_ctx, stats, threads=None,
              all_players=None, archive_rows=None,
              highlights=None, hl_by_player=None) -> dict[str, Path]:
    DIGESTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d")

    html_doc = build_html(groups, adp_ctx, stats, threads,
                          all_players, archive_rows,
                          highlights, hl_by_player)
    md_doc = build_markdown(groups, adp_ctx, stats, threads)

    paths = {
        "html": DIGESTS / f"{stamp}.html",
        "md": DIGESTS / f"{stamp}.md",
        "latest": ROOT / "index.html",
    }
    paths["html"].write_text(html_doc, encoding="utf-8")
    paths["md"].write_text(md_doc, encoding="utf-8")
    paths["latest"].write_text(html_doc, encoding="utf-8")

    # Machine-readable copy for downstream tooling. Stores EVERY matched player,
    # not just the ones rendered: threads.py diffs these files across days to
    # find stories that recur, and a player who ranks 60th today may be the
    # early edge of a run that matters next week.
    payload = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "players": [{
            **g["player"].to_dict(),
            "score": g["score"], "unpriced": g["unpriced"], "signals": g["signals"],
            "items": [{"text": m.item.text[:300], "url": m.item.url,
                       "source": m.item.source} for m in g["matches"]],
        } for g in groups],
    }
    (DIGESTS / f"{stamp}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    paths["json"] = DIGESTS / f"{stamp}.json"
    return paths
