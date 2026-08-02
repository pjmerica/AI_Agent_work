"""Track stories that recur about the same player across days and weeks.

A single beat-writer mention is noise. The same reporter -- or three different
ones -- saying a player is taking first-team reps on Monday, Wednesday and
Friday is a depth-chart change happening in slow motion. That is the signal
this module extracts, by diffing the dated JSON payloads in digests/.

A "thread" is (player, theme) seen on 2+ distinct days. Theme matters: a player
who has an injury story one day and a first-team-reps story a week later is not
one continuing story, and conflating them would be misleading.
"""
from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

DIGESTS = Path(__file__).parent.parent / "digests"

# Signal terms collapse into themes so "acl", "surgery" and "sidelined" count as
# the same ongoing story rather than three unrelated ones.
THEMES = {
    "injury": {"injury", "injured", "tore", "acl", "out for", "surgery", "ir",
               "placed on", "hamstring", "questionable", "did not practice",
               "limited", "sidelined", "carted", "setback"},
    "opportunity": {"first-team", "first team", "1st team", "starting job",
                    "starter", "promoted", "depth chart", "climbing",
                    "reps with the", "running with", "took over", "ahead of",
                    "with the ones", "unofficial depth chart", "won the job",
                    "starting lineup", "position battle", "competing for"},
    "buzz": {"impressed", "standout", "turning heads", "buzz", "breakout",
             "sleeper", "stock up", "riser", "camp star", "shining",
             "explosive", "stood out", "standing out", "made his mark"},
    "usage": {"snap", "snaps", "targets", "target share", "carries", "touches",
              "red zone", "goal line", "third down", "slot", "package",
              "committee", "workload", "lead back", "rb1", "wr1", "te1"},
    "roster": {"released", "waived", "traded", "holdout", "suspended",
               "practice squad", "roster bubble", "cut candidate"},
}

THEME_LABEL = {
    "injury": "injury situation",
    "opportunity": "role / depth chart",
    "buzz": "camp buzz",
    "usage": "usage detail",
    "roster": "roster status",
}


def theme_of(signals: list[str]) -> list[str]:
    """Which themes a set of matched signal terms belongs to."""
    out = []
    for name, terms in THEMES.items():
        if any(s in terms for s in signals):
            out.append(name)
    return out


@dataclass
class Thread:
    player: str
    theme: str
    pos: str = ""
    team: str = ""
    days: list[str] = field(default_factory=list)
    adp_first: float | None = None
    adp_last: float | None = None
    sources: set[str] = field(default_factory=set)
    best_item: dict | None = None
    peak_score: float = 0.0
    also_themes: list[str] = field(default_factory=list)

    @property
    def span_days(self) -> int:
        if len(self.days) < 2:
            return 0
        return (date.fromisoformat(max(self.days))
                - date.fromisoformat(min(self.days))).days + 1

    @property
    def adp_drift(self) -> float | None:
        """Positive = ADP moved earlier (rising) over the life of the thread."""
        if self.adp_first is None or self.adp_last is None:
            return None
        return round(self.adp_first - self.adp_last, 1)

    @property
    def strength(self) -> float:
        """Rank threads: persistence first, then breadth of sourcing.

        Days seen matters more than raw score -- a story that keeps coming back
        is the point, and a single loud day is what the main digest already
        surfaces.
        """
        return (len(self.days) ** 1.5) * (1 + 0.2 * len(self.sources)) + self.peak_score * 0.1

    def to_dict(self) -> dict:
        return {
            "player": self.player, "theme": self.theme,
            "theme_label": THEME_LABEL.get(self.theme, self.theme),
            "pos": self.pos, "team": self.team,
            "days": sorted(self.days), "n_days": len(self.days),
            "span_days": self.span_days,
            "adp_first": self.adp_first, "adp_last": self.adp_last,
            "adp_drift": self.adp_drift,
            "n_sources": len(self.sources),
            "sources": sorted(self.sources)[:6],
            "best_item": self.best_item,
            "also_themes": self.also_themes,
            "strength": round(self.strength, 2),
        }


def load_history(days_back: int = 21) -> list[tuple[str, dict]]:
    """Read the dated digest payloads, newest last."""
    files = sorted(DIGESTS.glob("*.json"))[-days_back:]
    out = []
    for f in files:
        try:
            out.append((f.stem, json.loads(f.read_text(encoding="utf-8"))))
        except (json.JSONDecodeError, OSError):
            continue  # a truncated file should not kill the report
    return out


def build_threads(history: list[tuple[str, dict]], min_days: int = 2) -> list[Thread]:
    """Group (player, theme) observations across days into threads."""
    acc: dict[tuple[str, str], Thread] = {}

    for day, payload in history:
        for p in payload.get("players", []):
            name = p.get("name", "")
            if not name:
                continue
            for theme in theme_of(p.get("signals", [])):
                key = (name, theme)
                t = acc.get(key)
                if t is None:
                    t = acc[key] = Thread(player=name, theme=theme,
                                          pos=p.get("pos", ""), team=p.get("team", ""))
                    t.adp_first = p.get("adp")
                if day not in t.days:
                    t.days.append(day)
                t.adp_last = p.get("adp")
                for it in p.get("items", []):
                    t.sources.add(it.get("source", ""))
                score = p.get("score", 0) or 0
                if score > t.peak_score:
                    t.peak_score = score
                    items = p.get("items") or []
                    if items:
                        t.best_item = items[0]

    threads = [t for t in acc.values() if len(t.days) >= min_days]

    # One news story usually trips several themes at once ("placed on IR" is both
    # injury and roster), which would list the same player two or three times at
    # nearly identical strength. Keep only each player's strongest theme, and
    # record the others as secondary so the framing stays honest.
    best_per_player: dict[str, Thread] = {}
    others: dict[str, list[str]] = defaultdict(list)
    for t in sorted(threads, key=lambda t: -t.strength):
        cur = best_per_player.get(t.player)
        if cur is None:
            best_per_player[t.player] = t
        else:
            # Only note it if the weaker theme was seen about as persistently.
            if len(t.days) >= len(cur.days) - 1:
                others[t.player].append(THEME_LABEL.get(t.theme, t.theme))

    out = list(best_per_player.values())
    for t in out:
        t.also_themes = others.get(t.player, [])[:2]
    out.sort(key=lambda t: -t.strength)
    return out


def summarize(threads: list[Thread], limit: int = 12) -> list[dict]:
    return [t.to_dict() for t in threads[:limit]]


if __name__ == "__main__":
    hist = load_history()
    print(f"{len(hist)} day(s) of history: {', '.join(d for d, _ in hist)}")
    if len(hist) < 2:
        print("\nNeed at least 2 days before threads can form.")
        print("Run the digest daily; this fills in automatically.")
        raise SystemExit(0)

    ts = build_threads(hist)
    print(f"{len(ts)} recurring threads\n")
    for t in ts[:15]:
        d = t.to_dict()
        drift = "" if d["adp_drift"] is None else f" ADP {d['adp_drift']:+.1f}"
        print(f"  {d['strength']:6.2f} {d['player']:22s} {d['pos']:3s} "
              f"{d['theme_label']:18s} {d['n_days']}d/{d['span_days']}d "
              f"{d['n_sources']} src{drift}")
