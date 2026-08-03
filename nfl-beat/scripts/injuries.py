"""Injury and missed-time tracking, with recurrence across days.

Two things the main digest does not do well on its own:

1. **Severity.** "Limited in practice" and "torn ACL" are not the same event,
   but the news scorer treats both as one generic injury signal.
2. **Trajectory.** A player who was limited Monday, DNP Wednesday and DNP
   Friday is trending the wrong way. A single DNP is noise; three in a row is
   a fantasy decision. That only shows up by diffing days.

Severity tiers and the recurrence logic both live here so the Injuries tab can
lead with the players whose situation is worsening, not merely the loudest one
today.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

# Ordered worst-first. The first tier whose pattern matches wins, so specific
# season-ending language beats the generic "injury" catch-all.
SEVERITY = [
    ("out_long", 5, re.compile(
        r"\b(torn|tore|ruptur\w*|acl|achilles|lisfranc|season[- ]ending|"
        r"out for the (?:season|year)|"
        # Both the abbreviation and the spelled-out form; "placed on injured
        # reserve" is the phrasing most outlets actually use.
        r"injured reserve|reserve/(?:injured|pup|nfi)|"
        r"placed on (?:season[- ]ending )?ir\b|"
        r"pup list|nfi list)\b", re.I)),
    ("out", 4, re.compile(
        r"\b(out for (?:several|multiple|weeks|a month)|will miss|expected to miss|"
        r"undergo\w* surgery|had surgery|surgery on|fracture\w*|broken|"
        r"carted off|stretcher|sidelined for)\b", re.I)),
    ("dnp", 3, re.compile(
        r"\b(did not practice|didn'?t practice|dnp|missed practice|"
        r"held out|non[- ]participant|sat out|no[- ]showed practice|"
        r"left practice|exited practice|walked off)\b", re.I)),
    ("limited", 2, re.compile(
        r"\b(limited (?:participant|in practice|practice)?|"
        r"partial(?:ly)? (?:participat\w*|practice)|"
        r"on a pitch count|snap count|managed|rest day|veteran rest|"
        r"day[- ]to[- ]day|questionable|game[- ]time decision)\b", re.I)),
    ("minor", 1, re.compile(
        r"\b(soreness|sore|tightness|banged up|dinged|precaution\w*|"
        r"maintenance|trainer|training room|evaluated|X[- ]?rays?|"
        r"hamstring|groin|quad|calf|ankle|knee|shoulder|hip|foot|"
        r"concussion|protocol|illness|hydration)\b", re.I)),
]

TIER_LABEL = {
    "out_long": "season-threatening",
    "out": "expected to miss time",
    "dnp": "missed practice",
    "limited": "limited / questionable",
    "minor": "minor or precautionary",
}

# A body part alone is not news; it needs an injury verb nearby. Without this
# "he ran a knee-buckling route" would register as a knee injury.
_CONTEXT = re.compile(
    r"\b(injur\w*|hurt|ail\w*|issue|problem|strain\w*|sprain\w*|tweak\w*|"
    r"soreness|sore|surgery|rehab\w*|recover\w*|miss\w*|out|sidelined|"
    r"limited|questionable|doubtful|dnp|practice|ir|pup|status|update)\b", re.I)


def classify(text: str, near: str | None = None,
             window: int = 160) -> tuple[str, int] | None:
    """Return (tier, rank) for the worst injury signal, or None.

    `near` is the player's name. Camp roundups list a dozen players and their
    separate ailments in one article ("Musgrave (knee), Brooks (hamstring),
    Reilly (Achilles)"), so without a proximity window a single "Achilles"
    anywhere in the text gets attributed to everyone named in it -- observed
    marking ten players season-threatening off one Packers camp recap.

    When `near` is given, a signal only counts if it appears within `window`
    characters of the player's name.
    """
    if not text:
        return None

    anchor = -1
    if near:
        anchor = text.lower().find(near.lower())
        if anchor < 0:
            # Try the surname alone before giving up on locating the player.
            parts = near.split()
            if parts:
                anchor = text.lower().find(parts[-1].lower())

    for tier, rank, pattern in SEVERITY:
        for hit in pattern.finditer(text):
            if anchor >= 0 and abs(hit.start() - anchor) > window:
                continue
            if tier == "minor":
                lo = max(0, hit.start() - window)
                if not _CONTEXT.search(text[lo:hit.end() + window]):
                    continue
            return tier, rank
    return None


@dataclass
class InjuryCase:
    player: object
    tier: str = "minor"
    rank: int = 0
    items: list = field(default_factory=list)
    days: list[str] = field(default_factory=list)
    tier_history: list[tuple[str, str]] = field(default_factory=list)

    @property
    def n_days(self) -> int:
        """Distinct days observed, never below 1.

        A case only exists because today's items classified, so 0 would be
        wrong on its face -- it just means the archived copies of those same
        items did not re-classify (older snapshots store truncated text).
        """
        return max(len(set(self.days)), 1)

    @property
    def span_days(self) -> int:
        ds = sorted(set(self.days))
        if len(ds) < 2:
            return len(ds)
        return (date.fromisoformat(ds[-1]) - date.fromisoformat(ds[0])).days + 1

    @property
    def trend(self) -> str:
        """Whether the situation is getting worse, better, or holding."""
        if len(self.tier_history) < 2:
            return "new"
        ranks = [r for _d, r in self.tier_history]
        first, last = ranks[0], ranks[-1]
        if last > first:
            return "worsening"
        if last < first:
            return "improving"
        return "ongoing"

    @property
    def urgency(self) -> float:
        """Rank the tab. Severity first, then persistence, then deep-player bias.

        A recurring DNP outranks a one-off 'sore' even though the latter may be
        louder today, and a deep player's injury matters more here for the same
        reason it does everywhere else in this digest: it is less priced in.
        """
        base = float(self.rank)
        if self.n_days > 1:
            base += 0.6 * (self.n_days - 1)
        if self.trend == "worsening":
            base += 1.5
        elif self.trend == "improving":
            base -= 0.8
        weight = getattr(self.player, "sleeper_weight", 1.0)
        return round(base * (0.7 + 0.3 * weight), 2)

    def to_dict(self) -> dict:
        p = self.player
        return {
            "name": p.name, "pos": p.pos, "team": p.team, "adp": p.adp,
            "adp_move": getattr(p, "adp_move", None),
            "tier": self.tier, "tier_label": TIER_LABEL.get(self.tier, self.tier),
            "rank": self.rank, "trend": self.trend,
            "n_days": self.n_days, "span_days": self.span_days,
            "urgency": self.urgency,
            "items": [{"text": i.text[:220], "url": i.url, "source": i.source}
                      for i in self.items[:4]],
        }


def build_cases(groups: list, archive_rows: list | None = None) -> list[dict]:
    """Injury cases from today's matches, enriched with archived history."""
    cases: dict[str, InjuryCase] = {}

    for g in groups:
        p = g["player"]
        worst = None
        keep = []
        for m in g["matches"]:
            got = classify(m.item.text, near=p.name)
            if not got:
                continue
            keep.append(m.item)
            if worst is None or got[1] > worst[1]:
                worst = got
        if not worst:
            continue
        tier, rank = worst
        cases[p.name] = InjuryCase(player=p, tier=tier, rank=rank, items=keep)

    # Fold in prior observations so recurrence and trend can be computed.
    if archive_rows:
        history: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
        for r in archive_rows:
            name = r.get("name", "")
            if name not in cases:
                continue
            day = r.get("date", "")
            best = None
            for it in r.get("items", []):
                got = classify(it.get("text", ""), near=name)
                if got and (best is None or got[1] > best[1]):
                    best = got
            if best:
                history[name].append((day, best[0], best[1]))

        for name, case in cases.items():
            seen = sorted(set(history.get(name, [])), key=lambda x: x[0])
            case.days = [d for d, _t, _r in seen]
            case.tier_history = [(d, r) for d, _t, r in seen]

    out = [c.to_dict() for c in cases.values()]
    out.sort(key=lambda d: -d["urgency"])
    return out
