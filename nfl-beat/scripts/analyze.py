"""Match news items to players and score them for fantasy relevance.

Scoring philosophy, per the brief:
  1. Deep/late-ADP players matter more than stars (news about stars is priced in).
  2. News that has NOT yet moved ADP is the most valuable -- that is the edge.
     A player who is already up 15 picks is a story you have missed; a player
     with camp buzz and a flat ADP is one you have not.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from config import NOISE_TERMS, SIGNAL_TERMS
from players import Player, norm

# Common words that appear as surnames and would fire constantly on their own.
# City / nickname forms that corroborate a bare-surname match. Beat writers
# write "in Cleveland" or "the Browns", not "CLE".
TEAM_WORDS = {
    "ARI": ("arizona", "cardinals"), "ATL": ("atlanta", "falcons"),
    "BAL": ("baltimore", "ravens"), "BUF": ("buffalo", "bills"),
    "CAR": ("carolina", "panthers"), "CHI": ("chicago", "bears"),
    "CIN": ("cincinnati", "bengals"), "CLE": ("cleveland", "browns"),
    "DAL": ("dallas", "cowboys"), "DEN": ("denver", "broncos"),
    "DET": ("detroit", "lions"), "GB": ("green bay", "packers"),
    "HOU": ("houston", "texans"), "IND": ("indianapolis", "colts"),
    "JAX": ("jacksonville", "jaguars", "jags"), "KC": ("kansas city", "chiefs"),
    "LV": ("las vegas", "raiders"), "LAC": ("chargers",),
    "LAR": ("rams",), "MIA": ("miami", "dolphins"),
    "MIN": ("minnesota", "vikings"), "NE": ("new england", "patriots"),
    "NO": ("new orleans", "saints"), "NYG": ("giants",),
    "NYJ": ("jets",), "PHI": ("philadelphia", "eagles"),
    "PIT": ("pittsburgh", "steelers"), "SF": ("san francisco", "49ers", "niners"),
    "SEA": ("seattle", "seahawks"), "TB": ("tampa", "buccaneers", "bucs"),
    "TEN": ("tennessee", "titans"), "WAS": ("washington", "commanders"),
}

AMBIGUOUS_LAST = {
    "smith", "brown", "johnson", "williams", "jones", "davis", "moore", "white",
    "allen", "young", "walker", "wright", "hill", "green", "adams", "baker",
    "bell", "ward", "cook", "gray", "price", "hunt", "love", "west", "rice",
    "king", "long", "bush", "reed", "james", "scott", "carter", "mitchell",
}


@dataclass
class Match:
    player: Player
    item: object            # sources.Item
    score: float = 0.0
    signals: list[str] = field(default_factory=list)
    matched_on: str = ""

    @property
    def is_unpriced(self) -> bool:
        """True when there is news but ADP has not reacted yet -- the edge case."""
        move = self.player.adp_move
        return move is None or abs(move) < 2.0


def _name_variants(p: Player) -> list[tuple[str, float]]:
    """(needle, confidence) pairs to search for, longest/safest first."""
    full = norm(p.name)
    out: list[tuple[str, float]] = [(full, 1.0)]
    parts = full.split()
    if len(parts) >= 2:
        first, last = parts[0], parts[-1]
        # 'A. Kamara' / 'A Kamara'
        out.append((f"{first[0]} {last}", 0.85))
        # Bare surname only if distinctive -- guarded further at match time.
        if last not in AMBIGUOUS_LAST and len(last) >= 5:
            out.append((last, 0.55))
    return out


def _norm_text(text: str) -> str:
    t = text.lower().replace("'", "").replace("-", "")
    # Collapse initials before stripping periods, mirroring players.norm(), so
    # "K.C. Concepcion" in an article matches a stored "KC Concepcion".
    t = re.sub(r"\b([a-z])\.\s*(?=[a-z]\.)", r"\1", t)
    t = t.replace(".", " ")
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    return re.sub(r"\s+", " ", t)


def find_players_only(items: list, players: dict[str, Player]) -> list[Match]:
    """Name matching without the fantasy-signal gate.

    Highlights need this: "Ja'Marr Chase makes it look easy" contains no signal
    vocabulary, so find_matches() would score it 0 and drop it. Here the clip
    itself is the payload, and we only need to know who is in it.
    """
    return find_matches(items, players, require_signal=False)


def find_matches(items: list, players: dict[str, Player],
                 require_signal: bool = True) -> list[Match]:
    """Fuzzy-match every news item against the player universe."""
    # Index by variant so we scan each item once, not once per player.
    index: dict[str, list[tuple[Player, float]]] = {}
    for p in players.values():
        for needle, conf in _name_variants(p):
            if len(needle) < 4:
                continue
            index.setdefault(needle, []).append((p, conf))

    matches: list[Match] = []
    for item in items:
        blob = _norm_text(item.text)
        padded = f" {blob} "
        seen_players: set[str] = set()

        # A team blog ("SBN SF") is implicit team context: a bare surname there
        # almost certainly refers to that club's player, and rarely to anyone else.
        feed_team = ""
        src = getattr(item, "source", "")
        if src.startswith("SBN "):
            feed_team = src[4:].strip().lower()

        for needle, cands in index.items():
            if f" {needle} " not in padded:
                continue
            for p, conf in cands:
                key = norm(p.name)
                if key in seen_players:
                    continue
                # A bare-surname hit needs corroboration: the player's team must
                # appear in the text, or the item must come from that team's blog.
                # Otherwise 'Wilson' matches half the league.
                if conf < 0.6:
                    pteam = p.team.lower()
                    on_team_blog = bool(feed_team and pteam == feed_team)
                    in_text = bool(pteam) and f" {pteam} " in padded
                    if not (on_team_blog or in_text):
                        continue
                    # Wrong team's blog is positive evidence against the match.
                    if feed_team and pteam and pteam != feed_team:
                        continue
                seen_players.add(key)
                m = Match(player=p, item=item, matched_on=needle)
                _score(m, blob, conf)
                if m.score > 0:
                    matches.append(m)
                elif not require_signal:
                    # Clip with no signal vocabulary -- keep it, ranked by how
                    # deep the player is so sleepers surface first.
                    m.score = round(p.sleeper_weight * conf, 3)
                    matches.append(m)

    matches.sort(key=lambda m: -m.score)
    return matches


def _term_present(term: str, blob: str) -> bool:
    """Word-boundary match.

    Plain substring search is wrong here: short signals like 'ir' (injured
    reserve) otherwise fire inside 'their', 'first', 'quarterback' -- observed
    producing false IR flags on Watson, Cousins and Kuntz during testing.
    """
    return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", blob) is not None


def _score(m: Match, blob: str, name_conf: float) -> None:
    """Compute relevance. Mutates the Match in place."""
    # Where the player's name appears, so we can require signals to be nearby.
    name_pos = blob.find(m.matched_on)

    signal_mult = 1.0
    for term, weight in SIGNAL_TERMS.items():
        hit = re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", blob)
        if not hit:
            continue
        m.signals.append(term)
        # Proximity gate: in a multi-player roundup ("camp injuries tracker:
        # Pearsall, Gardner-Johnson, ..."), a signal 400 chars from the name
        # probably belongs to somebody else.
        if name_pos >= 0:
            distance = abs(hit.start() - name_pos)
            if distance > 220:
                weight = 1.0 + (weight - 1.0) * 0.35
        signal_mult = max(signal_mult, weight)

    # No fantasy vocabulary at all -- a mention, not news.
    if not m.signals:
        m.score = 0.0
        return

    if any(_term_present(n, blob) for n in NOISE_TERMS):
        signal_mult *= 0.35

    base = m.player.sleeper_weight * signal_mult * name_conf

    # THE KEY MULTIPLIER: reward news the market has not absorbed.
    move = m.player.adp_move
    if move is None or abs(move) < 2.0:
        base *= 1.6          # flat ADP + real news = the actionable case
    elif move > 8:
        base *= 0.5          # already spiked; you are late
    elif move > 3:
        base *= 0.8

    # A club beat reporter watching practice is the primary source; a national
    # outlet is usually repeating them a day later. Team blogs get the same
    # treatment for the same reason.
    src = getattr(m.item, "source", "")
    if src.startswith("X @") and "(via @" in src:
        base *= 1.35            # retweeted beat reporter, credited to them
    elif src.startswith("X @") or src.startswith("SBN "):
        base *= 1.25

    # Freshness: today's practice report beats one from two days ago.
    age = getattr(m.item, "age_hours", 999)
    if age < 12:
        base *= 1.3
    elif age < 24:
        base *= 1.15
    elif age > 60:
        base *= 0.8

    m.score = round(base, 3)


_STOP = {
    "the", "a", "an", "and", "to", "of", "in", "on", "for", "with", "his", "he",
    "has", "is", "was", "at", "as", "that", "it", "from", "by", "this", "be",
    "are", "will", "but", "not", "they", "their", "who", "had", "were", "been",
    "said", "says", "after", "over", "into", "out", "up", "down", "new",
}


def _headline(text: str) -> str:
    """RSS items arrive as 'Headline. Body' -- the headline identifies the story."""
    first = re.split(r"(?<=[a-z0-9])\. ", text or "", maxsplit=1)[0]
    return re.sub(r"\s+", " ", first[:90]).strip().lower()


def _keyset(text: str) -> set[str]:
    words = re.sub(r"[^a-z0-9 ]", " ", (text or "").lower()).split()
    return {w for w in words if w not in _STOP and len(w) > 2}


def _same_story(a, b, threshold: float = 0.45) -> bool:
    """Do two items report the same event?

    Content-based rather than source-based, because the duplicates that matter
    come from different outlets: a signing reported by Yahoo, SBN and two beat
    writers is one story. Measured on real output, restatements of one event
    score 0.40-0.78 on keyword overlap while genuinely distinct stories about
    the same player score 0.15-0.24, so the gap is wide.
    """
    if _headline(a.text) == _headline(b.text):
        return True
    ka, kb = _keyset(a.text), _keyset(b.text)
    if not ka or not kb:
        return False
    return len(ka & kb) / min(len(ka), len(kb)) >= threshold


def collapse_duplicates(ms: list[Match]) -> tuple[list[Match], list[list[Match]]]:
    """Group matches into distinct stories, best-scoring item representing each.

    Returns (representatives, clusters) so the caller can show "also covered by
    N outlets" without hiding that corroboration existed.
    """
    clusters: list[list[Match]] = []
    for m in ms:                      # ms arrives sorted by score, best first
        for cl in clusters:
            if _same_story(cl[0].item, m.item):
                cl.append(m)
                break
        else:
            clusters.append([m])
    return [cl[0] for cl in clusters], clusters


def watchlist_hits(items: list, players: dict[str, Player],
                   names: list[str], aliases: dict | None = None) -> list[dict]:
    """Everything mentioning a watchlist player -- news, tweets, clips alike.

    Deliberately ungated: no signal vocabulary required, no sleeper weighting,
    no noise penalty. The rest of the digest exists to be sceptical about what
    deserves attention; this section exists to collect every mention of players
    the user has already decided they care about.
    """
    aliases = aliases or {}
    wanted: dict[str, tuple[Player, list[str]]] = {}
    for want in names:
        key = norm(want)
        for p in players.values():
            pk = norm(p.name)
            if pk == key or key in pk or pk in key:
                extra = [norm(a) for a in aliases.get(want, [])]
                wanted[pk] = (p, [a for a in extra if a])
                break

    if not wanted:
        return []

    out: dict[str, dict] = {
        k: {"player": p, "aliases": al, "items": [], "seen": set()}
        for k, (p, al) in wanted.items()
    }

    for item in items:
        blob = _norm_text(item.text)
        padded = f" {blob} "
        for key, entry in out.items():
            p = entry["player"]
            hit = False

            # Full name and 'F Last' initial forms.
            for needle, _conf in _name_variants(p):
                if len(needle) < 4 or " " not in needle:
                    continue
                if f" {needle} " in padded:
                    hit = True
                    break

            # Configured aliases, including bare surnames. A single-word alias
            # must be corroborated by the player's team appearing in the text,
            # since "Hunter" and "Lemon" are ordinary words.
            if not hit:
                for alias in entry["aliases"]:
                    if f" {alias} " not in padded:
                        continue
                    if " " in alias:
                        hit = True
                        break
                    team = (p.team or "").lower()
                    src = getattr(item, "source", "")
                    on_team_blog = bool(team) and src.endswith(team.upper())
                    # City and nickname count as team context too: a beat writer
                    # writes "in Cleveland", not "in CLE".
                    words = TEAM_WORDS.get(p.team, ())
                    in_text = bool(team) and (
                        f" {team} " in padded
                        or any(f" {w} " in padded for w in words))
                    if in_text or on_team_blog:
                        hit = True
                        break

            if not hit:
                continue
            dedupe_key = item.url or item.text[:120]
            if dedupe_key in entry["seen"]:
                continue
            entry["seen"].add(dedupe_key)
            entry["items"].append(item)

    results = []
    for entry in out.values():
        items_sorted = sorted(entry["items"],
                              key=lambda i: getattr(i, "age_hours", 999))
        results.append({
            "player": entry["player"],
            "items": items_sorted,
            "n": len(items_sorted),
            "n_clips": sum(1 for i in items_sorted
                           if getattr(i, "has_video", False)),
        })
    # Most-covered first; a quiet player still gets a row so the absence shows.
    results.sort(key=lambda d: -d["n"])
    return results


def group_by_player(matches: list[Match]) -> list[dict]:
    """Collapse to one entry per player, keeping their best-scoring items."""
    by: dict[str, list[Match]] = {}
    for m in matches:
        by.setdefault(norm(m.player.name), []).append(m)

    out = []
    for key, ms in by.items():
        ms.sort(key=lambda x: -x.score)
        # Collapse restatements of one event so four reports of a single signing
        # are one entry, not four. Corroboration is then counted across distinct
        # STORIES, which is what it was always meant to measure.
        reps, clusters = collapse_duplicates(ms)
        ms = reps
        best = ms[0]
        dup_counts = {id(cl[0]): len(cl) for cl in clusters}
        dup_sources = {id(cl[0]): sorted({getattr(m.item, "source", "")
                                          for m in cl}) for cl in clusters}
        distinct_sources = {getattr(m.item, "source", "") for m in ms}

        # Corroboration is worth something, but it must not become a popularity
        # contest: an unbounded sum let a star in fifteen injury roundups score
        # 34.9 while a beat writer's note on a camp body scored 3. Volume tracks
        # fame, which is precisely what this digest is trying not to rank on.
        # Cap the corroboration contribution and use diminishing returns.
        extra = sum(m.score for m in ms[1:3])          # at most two more items
        total = best.score + 0.18 * min(extra, best.score)
        if len(distinct_sources) > 1:
            total *= 1.0 + 0.08 * min(len(distinct_sources) - 1, 3)
        out.append({
            "player": best.player,
            "score": round(total, 3),
            "matches": ms[:4],
            "signals": sorted({s for m in ms for s in m.signals}),
            "n_sources": len(distinct_sources),
            "unpriced": best.is_unpriced,
            # How many outlets carried each surviving story, so the digest can
            # say "+3 more outlets" instead of silently dropping them.
            "dup_counts": dup_counts,
            "dup_sources": dup_sources,
        })
    out.sort(key=lambda d: -d["score"])
    return out
