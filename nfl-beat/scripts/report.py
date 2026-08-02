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
.card{background:var(--card);border:1px solid var(--line);border-radius:9px;
padding:13px 15px;margin-bottom:9px}
.top{display:flex;flex-wrap:wrap;align-items:baseline;gap:9px;margin-bottom:5px}
.nm{font-weight:650;font-size:16px}
.meta{color:var(--muted);font-size:12.5px}
.tag{font-size:11px;font-weight:650;padding:2px 7px;border-radius:20px;
border:1px solid currentColor;white-space:nowrap}
.t-unpriced{color:var(--good)}.t-moved{color:var(--muted)}
.t-hot{color:var(--hot)}.t-rise{color:var(--good)}.t-fall{color:var(--hot)}
.sig{color:var(--muted);font-size:12px;margin:5px 0 7px}
.sig code{background:rgba(125,125,125,.14);padding:1px 5px;border-radius:4px;font-size:11.5px}
.itm{border-left:2px solid var(--line);padding:5px 0 5px 11px;margin-top:7px;font-size:13.5px}
.itm a{color:var(--accent);text-decoration:none}
.itm a:hover{text-decoration:underline}
.src{color:var(--muted);font-size:11.5px;margin-top:2px}
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


def _item_html(m) -> str:
    it = m.item
    text = _esc(it.text[:260] + ("…" if len(it.text) > 260 else ""))
    url = _esc(it.url)
    src = _esc(it.source)
    age = f"{it.age_hours:.0f}h ago" if it.age_hours < 900 else "undated"
    link = f'<a href="{url}" target="_blank" rel="noopener">{text}</a>' if url else text
    return f'<div class="itm">{link}<div class="src">{src} · {age}</div></div>'


def _player_card(d) -> str:
    p = d["player"]
    tag = ('<span class="tag t-unpriced">UNPRICED</span>' if d["unpriced"]
           else '<span class="tag t-moved">already moving</span>')
    pos_team = " ".join(x for x in (p.pos, p.team) if x)
    sigs = " ".join(f"<code>{_esc(s)}</code>" for s in d["signals"][:7])
    items = "".join(_item_html(m) for m in d["matches"])
    proj = f" · proj {p.proj:.0f}" if p.proj else ""
    return f"""<div class="card">
<div class="top"><span class="nm">{_esc(p.name)}</span>
<span class="meta">{_esc(pos_team)} · {_fmt_adp(p)}{proj}</span>
{tag}<span class="meta">{_move_html(p)}</span></div>
<div class="sig">signals: {sigs} · {d['n_sources']} source(s)</div>
{items}</div>"""


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


def build_html(groups, adp_ctx, stats) -> str:
    now = datetime.now(timezone.utc).astimezone()
    unpriced = [g for g in groups if g["unpriced"]][:18]
    priced = [g for g in groups if not g["unpriced"]][:10]

    unpriced_html = ("".join(_player_card(d) for d in unpriced) if unpriced
                     else '<div class="empty">Nothing unpriced today.</div>')
    priced_html = ("".join(_player_card(d) for d in priced) if priced
                   else '<div class="empty">No already-moving players with news.</div>')

    srcs = ", ".join(f"{k} ({v})" for k, v in sorted(stats["by_source"].items(),
                                                     key=lambda kv: -kv[1])[:10])
    return f"""<title>NFL Beat Digest — {now:%b %d, %Y}</title>
<style>{CSS}</style>
<div class="wrap">
<h1>NFL Beat Digest</h1>
<div class="sub">{now:%A, %B %d %Y · %I:%M %p}
 · {stats['n_items']} items scanned · {stats['n_players']} players matched
 · ADP board {_esc(stats['adp_latest'])} vs {_esc(stats['adp_prior'])}
{_stale_warning(stats)}</div>

<h2>Unpriced — news the market hasn't reacted to</h2>
{unpriced_html}

<h2>Already moving — you may be late</h2>
{priced_html}

<h2>ADP risers (last 14 days)</h2>
{_movers_table(adp_ctx['risers'], 'Riser')}

<h2>ADP fallers</h2>
{_movers_table(adp_ctx['fallers'], 'Faller')}

<footer>
<p><strong>Sources scanned:</strong> {_esc(srcs)}</p>
<p><strong>Method:</strong> deep/late-ADP players are weighted <em>above</em> stars,
since news on high-ADP players is already priced in. Items are scored on fantasy
signal vocabulary near the player's name, then boosted when ADP has <em>not</em>
yet moved. Every line links to its source.</p>
<p><strong>Not included:</strong> The Athletic. Its public RSS feed returns nothing
and its articles are paywalled; nothing behind that paywall is fetched.
X/Twitter via nitter is {_esc(stats['nitter'])}.</p>
</footer>
</div>"""


def build_markdown(groups, adp_ctx, stats) -> str:
    now = datetime.now(timezone.utc).astimezone()
    L = [f"# NFL Beat Digest — {now:%b %d, %Y}", "",
         f"{stats['n_items']} items scanned · {stats['n_players']} players matched  ",
         f"ADP board {stats['adp_latest']} vs {stats['adp_prior']}", ""]
    lag = _adp_lag_days(stats)
    if lag is not None and lag > 2:
        L += [f"> ⚠ ADP board is {lag} days old — upstream pull may have stalled.", ""]
    L += [
         "## Unpriced — news the market hasn't reacted to", ""]

    unpriced = [g for g in groups if g["unpriced"]][:18]
    if not unpriced:
        L.append("_Nothing unpriced today._")
    for d in unpriced:
        p = d["player"]
        mv = "flat" if (p.adp_move is None or abs(p.adp_move) < 2) else f"{p.adp_move:+.1f}"
        L.append(f"### {p.name} — {p.pos} {p.team} · {_fmt_adp(p)} · {mv}")
        L.append(f"*signals: {', '.join(d['signals'][:6])}*")
        for m in d["matches"]:
            t = m.item.text[:200].replace("\n", " ")
            L.append(f"- [{t}]({m.item.url}) — {m.item.source}")
        L.append("")

    L += ["## Already moving", ""]
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


def write_all(groups, adp_ctx, stats) -> dict[str, Path]:
    DIGESTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d")

    html_doc = build_html(groups, adp_ctx, stats)
    md_doc = build_markdown(groups, adp_ctx, stats)

    paths = {
        "html": DIGESTS / f"{stamp}.html",
        "md": DIGESTS / f"{stamp}.md",
        "latest": ROOT / "index.html",
    }
    paths["html"].write_text(html_doc, encoding="utf-8")
    paths["md"].write_text(md_doc, encoding="utf-8")
    paths["latest"].write_text(html_doc, encoding="utf-8")

    # Machine-readable copy for downstream tooling.
    payload = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "players": [{
            **g["player"].to_dict(),
            "score": g["score"], "unpriced": g["unpriced"], "signals": g["signals"],
            "items": [{"text": m.item.text[:300], "url": m.item.url,
                       "source": m.item.source} for m in g["matches"]],
        } for g in groups[:40]],
    }
    (DIGESTS / f"{stamp}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    paths["json"] = DIGESTS / f"{stamp}.json"
    return paths
