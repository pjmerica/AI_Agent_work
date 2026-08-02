"""News collectors. Every item carries a URL back to its origin.

Live paths:
  - Bluesky getAuthorFeed : public, no auth, curated beat-writer handles
  - RSS                   : national + team feeds

Disabled path:
  - Nitter (X mirror). Verified 2026-08-02: nitter.net returns HTTP 200 with an
    empty body, xcancel.com 403s, poast 403s, privacydev does not resolve. The
    adapter is kept because the public-instance situation changes month to month;
    set NITTER_INSTANCE to a working host to re-enable. See README.
"""
from __future__ import annotations

import concurrent.futures
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) nfl-beat-digest/1.0"
BSKY = "https://public.api.bsky.app/xrpc"
TIMEOUT = 15

# X mirror. nitter.net serves RSS fine -- an earlier probe here concluded it was
# dead because it requested the URL without following redirects, which returns
# HTTP 200 with an empty body. With redirects followed it returns real content.
NITTER_INSTANCE: str | None = os.environ.get("NITTER_INSTANCE", "https://nitter.net")

# Verified returning fresh items on 2026-08-02. @32BeatWriters is the highest
# value of these: it aggregates and retweets club beat reporters league-wide,
# which is precisely the practice-report layer Bluesky lacks. Schefter is here
# because he has no Bluesky account at all.
NITTER_HANDLES = [
    "32BeatWriters", "AdamSchefter", "RapSheet", "MikeGarafolo", "FieldYates",
    "JFowlerESPN", "CameronWolfe", "NFL_DovKleiman", "JamesPalmerTV",
    "Rotoworld_FB", "FantasyPros", "ESPNNFL",
]


@dataclass
class Item:
    text: str
    url: str
    source: str          # human-readable origin, shown in the digest
    author: str = ""
    published: datetime | None = None

    @property
    def age_hours(self) -> float:
        if self.published is None:
            return 999.0
        now = datetime.now(timezone.utc)
        return (now - self.published).total_seconds() / 3600


def _get(url: str, as_json: bool = False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        raw = r.read()
    return json.loads(raw) if as_json else raw


# --------------------------------------------------------------------------
# Bluesky
# --------------------------------------------------------------------------

def bsky_feed(handle: str, limit: int = 40) -> list[Item]:
    """Pull recent posts for one handle. Returns [] on any failure (never raises)."""
    url = f"{BSKY}/app.bsky.feed.getAuthorFeed?actor={urllib.parse.quote(handle)}&limit={limit}"
    try:
        data = _get(url, as_json=True)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, OSError):
        return []

    items: list[Item] = []
    for entry in data.get("feed", []):
        post = entry.get("post", {})
        rec = post.get("record", {})
        text = (rec.get("text") or "").strip()
        if not text:
            continue
        # Skip pure reposts: the original author gets the credit instead.
        if entry.get("reason", {}).get("$type", "").endswith("reasonRepost"):
            continue
        author = post.get("author", {})
        # at://did/app.bsky.feed.post/RKEY -> public web permalink
        rkey = post.get("uri", "").rsplit("/", 1)[-1]
        published = None
        if ts := rec.get("createdAt"):
            try:
                published = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                pass
        items.append(Item(
            text=text,
            url=f"https://bsky.app/profile/{author.get('handle', handle)}/post/{rkey}",
            source=f"Bluesky @{author.get('handle', handle)}",
            author=author.get("displayName") or author.get("handle", handle),
            published=published,
        ))
    return items


def verify_handle(handle: str) -> dict | None:
    """Resolve a handle and return {handle, displayName, followers}.

    Used to weed out impostors -- e.g. 'adamschefter.bsky.social' exists with
    ~4.6k followers while the real Schefter is not on Bluesky at all.
    """
    url = f"{BSKY}/app.bsky.actor.getProfile?actor={urllib.parse.quote(handle)}"
    try:
        d = _get(url, as_json=True)
    except Exception:
        return None
    if "handle" not in d:
        return None
    return {
        "handle": d["handle"],
        "displayName": d.get("displayName", ""),
        "followers": d.get("followersCount", 0),
    }


# --------------------------------------------------------------------------
# RSS
# --------------------------------------------------------------------------

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _clean(html: str) -> str:
    txt = _TAG_RE.sub(" ", html or "")
    for a, b in (("&amp;", "&"), ("&quot;", '"'), ("&#39;", "'"),
                 ("&nbsp;", " "), ("&lt;", "<"), ("&gt;", ">")):
        txt = txt.replace(a, b)
    return _WS_RE.sub(" ", txt).strip()


def _parse_date(s: str) -> datetime | None:
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z",
                "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def rss_feed(url: str, label: str) -> list[Item]:
    """Parse an RSS or Atom feed. Returns [] on any failure (never raises)."""
    try:
        raw = _get(url)
        root = ET.fromstring(raw)
    except (urllib.error.URLError, ET.ParseError, TimeoutError, OSError):
        return []

    items: list[Item] = []
    ns = {"atom": "http://www.w3.org/2005/Atom"}

    for node in root.iter():
        tag = node.tag.split("}")[-1]
        if tag not in ("item", "entry"):
            continue

        def find(*names):
            for n in names:
                el = node.find(n) if not n.startswith("atom:") else node.find(n, ns)
                if el is not None:
                    return el
            return None

        title_el = find("title", "atom:title")
        title = _clean(title_el.text if title_el is not None else "")
        desc_el = find("description", "summary", "atom:summary", "content")
        desc = _clean(desc_el.text if desc_el is not None else "")

        link = ""
        link_el = find("link", "atom:link")
        if link_el is not None:
            link = (link_el.text or "").strip() or link_el.attrib.get("href", "")
        if not link:
            guid = find("guid")
            if guid is not None and (guid.text or "").startswith("http"):
                link = guid.text.strip()

        date_el = find("pubDate", "published", "updated", "atom:published")
        published = _parse_date(date_el.text if date_el is not None else "")

        text = f"{title}. {desc}" if desc and desc != title else title
        if text:
            items.append(Item(text=text, url=link, source=label, published=published))
    return items


# --------------------------------------------------------------------------
# Nitter (disabled unless NITTER_INSTANCE is set)
# --------------------------------------------------------------------------

_RT_RE = re.compile(r"^RT by @[\w]+:\s*", re.I)


def nitter_feed(handle: str) -> list[Item]:
    """X mirror via nitter. No-op unless NITTER_INSTANCE points at a live host."""
    if not NITTER_INSTANCE:
        return []
    items = rss_feed(f"{NITTER_INSTANCE.rstrip('/')}/{handle}/rss", f"X @{handle}")

    for it in items:
        # Aggregators like @32BeatWriters mostly retweet club beat reporters, and
        # nitter prefixes those with "RT by @aggregator:". Strip the prefix so the
        # scorer sees the reporter's actual words, and credit the original author
        # from the tweet URL rather than the account that boosted it.
        if _RT_RE.match(it.text):
            it.text = _RT_RE.sub("", it.text, count=1)
            author = _author_from_url(it.url)
            it.source = f"X @{author} (via @{handle})" if author else f"X @{handle}"
    return items


def _author_from_url(url: str) -> str:
    """Pull the tweet author out of a nitter permalink (…/AUTHOR/status/ID…)."""
    m = re.search(r"nitter\.[^/]+/([^/]+)/status/", url or "")
    return m.group(1) if m else ""


def nitter_status() -> str:
    if not NITTER_INSTANCE:
        return "disabled"
    probe = nitter_feed(NITTER_HANDLES[0])
    return f"active: {NITTER_INSTANCE} ({len(probe)} items)" if probe else \
           f"configured but returning nothing: {NITTER_INSTANCE}"


def collect(handles: list[str], feeds: list[tuple[str, str]],
            max_age_hours: int = 36, pause: float = 0.3,
            workers: int = 8, x_handles: list[str] | None = None) -> list[Item]:
    """Gather everything, drop stale items, de-duplicate by URL.

    RSS feeds are fetched in parallel -- with 32 team blogs plus the national
    feeds, serial fetching dominates runtime. Bluesky stays serial and paced,
    since it is one shared public API rather than 39 separate hosts.
    """
    out: list[Item] = []
    for h in handles:
        out.extend(bsky_feed(h))
        time.sleep(pause)  # be polite to the public API

    if feeds:
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
            for items in ex.map(lambda f: rss_feed(f[0], f[1]), feeds):
                out.extend(items)

    # Configured national accounts plus any discovered club beat reporters.
    x_accounts = list(dict.fromkeys(NITTER_HANDLES + list(x_handles or [])))
    if NITTER_INSTANCE and x_accounts:
        # Modest concurrency: it is one shared public instance, not 32 hosts.
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            for items in ex.map(nitter_feed, x_accounts):
                out.extend(items)

    seen: set[str] = set()
    fresh: list[Item] = []
    for it in out:
        if it.age_hours > max_age_hours:
            continue
        key = it.url or it.text[:120]
        if key in seen:
            continue
        seen.add(key)
        fresh.append(it)
    return fresh
