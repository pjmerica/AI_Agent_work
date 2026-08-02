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
    t = text.lower()
    t = t.replace("'", "").replace(".", " ").replace("-", "")
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    return re.sub(r"\s+", " ", t)


def find_matches(items: list, players: dict[str, Player]) -> list[Match]:
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


def group_by_player(matches: list[Match]) -> list[dict]:
    """Collapse to one entry per player, keeping their best-scoring items."""
    by: dict[str, list[Match]] = {}
    for m in matches:
        by.setdefault(norm(m.player.name), []).append(m)

    out = []
    for key, ms in by.items():
        ms.sort(key=lambda x: -x.score)
        best = ms[0]
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
        })
    out.sort(key=lambda d: -d["score"])
    return out
