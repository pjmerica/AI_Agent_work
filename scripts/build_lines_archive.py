"""Build the closing-lines archive: one file per NFL week, lines next to results.

    py scripts/build_lines_archive.py              # weeks finished in the last 14 days
    py scripts/build_lines_archive.py --weeks 1-9  # these weeks, rebuilt from scratch
    py scripts/build_lines_archive.py --all        # every finished week

Why it exists (2026-11-10): the board only ever holds the coming slate. Every
refresh that changed a file was committed, so the lines were "saved", but only
as dozens of snapshots in git history with nothing saying which one was the
closing line for which game, and no results beside them. This writes
nfl-props/archive/<season>/week-NN.json with, for every game and player-game:

  - the CLOSING line: the last committed snapshot taken before that game's
    kickoff, every book's own quote (line and price), the books' consensus,
    and Kalshi's line;
  - the OPENING consensus: the first snapshot that priced it;
  - what actually happened: the player's stat line from Sleeper's weekly stats,
    the final score from ESPN's scoreboard.

How a snapshot counts as pregame: its own lastUpdated is before the kickoff
ESPN reports for that game. That is the same rule as kickoff_lock.py, and it
also covers the weeks before the lock existed (weeks 1-5), when a scrape that
landed mid-game committed live in-game numbers: those snapshots are simply
skipped for games already under way.

It reads git history, so the checkout needs full history (CI: fetch-depth 0).
A week is rebuilt only while it is recent (Sleeper posts stat corrections for a
few days) unless --weeks or --all asks; an older week's file is a record and is
left alone, so it does not depend on git history staying as it is.

Units, so a comparison compares like with like:
  - yardage stats: the line as posted (books post the median at about -110);
  - pass_tds, receptions: each quote also has `mean`, the expected count from
    its line AND price (fetch_oddsapi_weekly_props._count_mean). Books post
    different main lines at very different prices (Dak Prescott 2.5 at +155
    at DraftKings, 1.5 at -250 at BetMGM), so the raw lines disagree by a full
    touchdown when the opinions do not. The consensus is the median mean;
  - any_tds: `prob`, the probability implied by the price. It keeps the book's
    margin (anytime-TD is a one-sided market), so compare books with each
    other rather than reading it as a fair probability.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from fetch_oddsapi_weekly_props import TEAM_ABBR, _count_mean  # noqa: E402
from kickoff_lock import parse_ts  # noqa: E402

ARCHIVE = ROOT / "nfl-props" / "archive"
SOURCES = {
    "books": "nfl-props/oddsapi.json",
    "kalshi": "nfl-props/weekly.json",
    "games": "nfl-props/gamelines.json",
}
COUNT_STATS = {"pass_tds", "receptions"}
RECENT_DAYS = 14
UA = {"User-Agent": "nfl-props-archive/1.0", "Accept": "application/json"}

# Sleeper stat key for each archived stat. A player who played and has no entry
# for a stat recorded zero of it (Sleeper leaves zeros out).
ACTUAL_KEYS = {
    "pass_yds": "pass_yd", "pass_tds": "pass_td", "rush_yds": "rush_yd",
    "rec_yds": "rec_yd", "receptions": "rec", "any_tds": "anytime_tds",
    "pass_int": "pass_int", "rush_att": "rush_att", "pass_cmp": "pass_cmp",
}

# One code per team. ESPN, Sleeper, Kalshi and the Odds API do not agree on
# Jacksonville, Washington and the Rams; the site's files use JAC and WAS.
CANON = {"JAX": "JAC", "WSH": "WAS", "LA": "LAR", "LVR": "LV", "OAK": "LV"}
VARIANTS: dict[str, set[str]] = {}
for _alias, _code in CANON.items():
    VARIANTS.setdefault(_code, {_code}).add(_alias)


def canon(code: str) -> str:
    code = (code or "").upper()
    return CANON.get(code, code)


# ---- names (a port of normPlayerName in lineup/app.js) -----------------------
FIRST_NAME_ALIASES = {
    "ken": "kenneth", "kenny": "kenneth", "mike": "michael", "matt": "matthew",
    "nick": "nicholas", "chris": "christopher", "tony": "anthony", "rob": "robert",
    "bob": "robert", "dan": "daniel", "danny": "daniel", "joe": "joseph",
    "tom": "thomas", "will": "william", "billy": "william", "bill": "william",
    "ben": "benjamin", "alex": "alexander", "jon": "jonathan", "tj": "t j",
    "dj": "d j", "aj": "a j", "cj": "c j", "jk": "j k", "dk": "d k",
}
FULL_NAME_ALIASES = {
    "cam skattebo": "cameron skattebo", "quishon judkins": "quinshon judkins",
    "cam ward": "cameron ward", "josh palmer": "joshua palmer",
    "chig okonkwo": "chigoziem okonkwo",
    # Not in the lineup app's table: the books call him Hollywood, Sleeper
    # Marquise. The site's history build merges the same pair (SAME_PLAYER).
    "hollywood brown": "marquise brown",
}
# Kalshi's anytime-TD series includes a "no touchdown scorer" market.
NOT_PLAYERS = {"no scorer"}


def norm_name(s: str) -> str:
    out = (s or "").lower()
    out = re.sub(r"\s+(jr|sr|ii|iii|iv|v)\.?$", "", out)
    out = re.sub(r"[^a-z0-9 ]", " ", out)
    out = re.sub(r"\s+", " ", out).strip()
    parts = out.split(" ")
    if len(parts) >= 2 and parts[0] in FIRST_NAME_ALIASES:
        parts[0] = FIRST_NAME_ALIASES[parts[0]]
        out = " ".join(parts)
    return FULL_NAME_ALIASES.get(out, out)


# Team defenses arrive under three spellings ("BAL Ravens D/ST" from Kalshi,
# "Baltimore Ravens D/ST" and "Baltimore Ravens Defense" from the books). All
# become "BAL D/ST", told apart from the other team by the nickname.
DST_RE = re.compile(r"\s*(d/st|dst|defense)$", re.I)
NICKNAMES = {full.split(" ")[-1].lower(): canon(code) for full, code in TEAM_ABBR.items()}


def dst_team(name: str, away: str, home: str) -> str | None:
    """The team code if `name` is a team defense in this game, else None."""
    if not DST_RE.search(name or ""):
        return None
    for w in reversed(DST_RE.sub("", name).split()):
        code = NICKNAMES.get(w.lower()) or canon(w)
        if code in (away, home):
            return code
    return None


def alt_name(s: str) -> str:
    n = norm_name(s)
    parts = n.split(" ")
    return n if len(parts) < 2 else parts[0][0] + " " + parts[-1]


# ---- network -----------------------------------------------------------------
def get_json(url: str, tries: int = 3):
    for i in range(tries):
        try:
            with urlopen(Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print(f"  retrying {url} ({e})")
            time.sleep(3)


def espn_week(season: str, week: int) -> list[dict]:
    """ESPN's games for a week: matchup, kickoff, score, final or not."""
    d = get_json("https://site.api.espn.com/apis/site/v2/sports/football/nfl/"
                 f"scoreboard?seasontype=2&week={week}&dates={season}")
    games = []
    for e in d.get("events") or []:
        c = (e.get("competitions") or [{}])[0]
        side = {t.get("homeAway"): t for t in c.get("competitors") or []}
        if "home" not in side or "away" not in side:
            continue
        home, away = canon(side["home"]["team"]["abbreviation"]), canon(side["away"]["team"]["abbreviation"])
        final = ((e.get("status") or {}).get("type") or {}).get("completed") is True

        def score(t):
            try:
                return int(t.get("score"))
            except (TypeError, ValueError):
                return None
        games.append({
            "matchup": away + home, "away": away, "home": home,
            "kickoff": parse_ts(e.get("date")),
            "final": final,
            "score": {"away": score(side["away"]), "home": score(side["home"])} if final else None,
        })
    return games


def sleeper_week(season: str, week: int) -> list[dict]:
    return get_json(f"https://api.sleeper.com/stats/nfl/{season}/{week}?season_type=regular") or []


# ---- git snapshots -----------------------------------------------------------
def snapshots(path: str):
    """(time, data) for every committed version of `path`, oldest first."""
    shallow = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--is-shallow-repository"],
                             capture_output=True, text=True).stdout.strip()
    if shallow == "true":
        sys.exit("This checkout is shallow; the archive is built from git history. "
                 "Run `git fetch --unshallow` (CI: actions/checkout with fetch-depth: 0).")
    log = subprocess.run(["git", "-C", str(ROOT), "log", "--format=%H %cI", "--", path],
                         capture_output=True, text=True, check=True).stdout.split("\n")
    out = []
    for line in log:
        if not line.strip():
            continue
        sha, committed = line.split(" ", 1)
        raw = subprocess.run(["git", "-C", str(ROOT), "show", f"{sha}:{path}"],
                             capture_output=True, check=True).stdout
        try:
            data = json.loads(raw.decode("utf-8"))
        except ValueError:
            continue
        t = parse_ts(data.get("lastUpdated")) or parse_ts(committed)
        out.append((t, data))
    out.sort(key=lambda x: x[0])
    return out


# ---- matching rows to games --------------------------------------------------
class Games:
    """Every ESPN game of the season so far, findable by matchup and date."""

    def __init__(self, by_week: dict[int, list[dict]]):
        self.by_week = by_week
        self.index: dict[str, list[tuple[int, dict]]] = {}
        for wk, games in by_week.items():
            for g in games:
                for a in VARIANTS.get(g["away"], {g["away"]}):
                    for h in VARIANTS.get(g["home"], {g["home"]}):
                        self.index.setdefault(a + h, []).append((wk, g))

    def find(self, matchup: str, day: datetime | None):
        """(week, game) for a matchup string near a date, or None."""
        m = (matchup or "").strip()
        if " @ " in m:   # an early oddsapi.json: "New England Patriots @ Seattle Seahawks"
            a, h = m.split(" @ ", 1)
            m = canon(TEAM_ABBR.get(a, "")) + canon(TEAM_ABBR.get(h, ""))
        best = None
        for wk, g in self.index.get(m.upper(), []):
            if day is None or g["kickoff"] is None:
                continue
            gap = abs((g["kickoff"] - day).total_seconds())
            if gap <= 2.5 * 86400 and (best is None or gap < best[0]):
                best = (gap, wk, g)
        return (best[1], best[2]) if best else None


def row_day(row: dict) -> datetime | None:
    """A row's kickoff, as precise as the row knows it."""
    t = parse_ts(row.get("kickoffTime"))
    if t:
        return t
    k = str(row.get("kickoff") or "")
    try:
        if re.fullmatch(r"\d{2}[A-Z]{3}\d{2}", k):          # Kalshi: 26NOV12
            return datetime.strptime(k, "%y%b%d").replace(hour=18, tzinfo=timezone.utc)
        return datetime.strptime(k[:10], "%Y-%m-%d").replace(hour=18, tzinfo=timezone.utc)
    except ValueError:
        return None


# ---- values ------------------------------------------------------------------
def implied(odds) -> float | None:
    try:
        o = float(odds)
    except (TypeError, ValueError):
        return None
    if o == 0:
        return None
    return round((-o / (-o + 100.0)) if o < 0 else (100.0 / (o + 100.0)), 4)


def book_quotes(stat: str, s: dict) -> dict:
    """book -> {line, odds, and mean or prob} from one oddsapi stat entry."""
    out = {}
    for q in s.get("quotes") or []:
        book = q.get("book")
        if not book:
            continue
        posted = q.get("posted", q.get("line"))
        e = {"line": posted, "odds": q.get("odds")}
        if stat in COUNT_STATS:
            e["mean"] = _count_mean(posted, q.get("odds"))
        elif stat == "any_tds":
            e["prob"] = implied(q.get("odds"))
        out[book] = e
    return out


def quote_value(stat: str, e: dict):
    if stat in COUNT_STATS:
        return e.get("mean") if e.get("mean") is not None else e.get("line")
    if stat == "any_tds":
        return e.get("prob")
    return e.get("line")


def consensus(stat: str, quotes: dict):
    vals = [v for v in (quote_value(stat, e) for e in quotes.values()) if isinstance(v, (int, float))]
    return round(statistics.median(vals), 3) if vals else None


def kalshi_value(stat: str, s: dict):
    if stat in COUNT_STATS and s.get("expected") is not None:
        return s["expected"]
    return s.get("line")


# ---- building ----------------------------------------------------------------
def fold_players(snaps, games: Games, weeks: set[int], players: dict, field: str):
    """Fold every pregame row of every snapshot into players[(week, key)]."""
    for t, data in snaps:
        for row in data.get("players") or []:
            if not isinstance(row, dict) or row.get("lockedAtKickoff"):
                continue
            hit = games.find(row.get("matchup") or "", row_day(row))
            if not hit:
                continue
            wk, g = hit
            if wk not in weeks or g["kickoff"] is None or t >= g["kickoff"]:
                continue
            name = row.get("name") or ""
            dst = dst_team(name, g["away"], g["home"])
            if dst:
                name = dst + " D/ST"
            elif DST_RE.search(name) or norm_name(name) in NOT_PLAYERS:
                continue        # a defense we cannot place, or not a player
            key = (wk, g["matchup"], norm_name(name))
            p = players.setdefault(key, {"name": name, "matchup": g["matchup"],
                                         "kickoff": g["kickoff"]})
            if dst:
                p["dst"] = dst
            elif field == "books":
                p["name"] = name or p["name"]   # books' spelling wins
            if field == "books":
                stats = {}
                for stat, s in (row.get("stats") or {}).items():
                    if not isinstance(s, dict):
                        continue
                    q = book_quotes(stat, s)
                    c = consensus(stat, q)
                    if c is None and isinstance(s.get("line"), (int, float)):
                        c = s["line"]
                    if c is not None:
                        stats[stat] = {"close": c, "quotes": q}
            else:
                stats = {}
                for stat, s in (row.get("stats") or {}).items():
                    v = kalshi_value(stat, s) if isinstance(s, dict) else None
                    if isinstance(v, (int, float)):
                        stats[stat] = {"close": v, "lineSource": s.get("lineSource")}
            if not stats:
                continue
            slot = p.setdefault(field, {"openAt": t, "stats": {}})
            slot["closeAt"] = t
            for stat, v in stats.items():
                prev = slot["stats"].get(stat)
                v["open"] = prev["open"] if prev else v["close"]
                slot["stats"][stat] = v


def fold_games(snaps, games: Games, weeks: set[int], lines: dict):
    for t, data in snaps:
        for row in data.get("games") or []:
            if not isinstance(row, dict) or row.get("lockedAtKickoff"):
                continue
            hit = games.find(row.get("matchup") or "", parse_ts(row.get("kickoff")))
            if not hit:
                continue
            wk, g = hit
            if wk not in weeks or g["kickoff"] is None or t >= g["kickoff"]:
                continue
            now = {"total": row.get("total"), "homeSpread": row.get("homeSpread"),
                   "books": row.get("bookCount")}
            if now["total"] is None and now["homeSpread"] is None:
                continue
            e = lines.setdefault((wk, g["matchup"]), {"open": {**now, "at": iso(t)}})
            e["close"] = {**now, "at": iso(t)}


def iso(t: datetime | None) -> str | None:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if t else None


def known_names() -> set[str]:
    """Normalized names of every player in the trimmed Sleeper map."""
    try:
        m = json.loads((ROOT / "nfl-props" / "sleeper_players.json").read_text(encoding="utf-8"))
        return {norm_name(v[0]) for v in (m.get("players") or {}).values() if v}
    except Exception:  # noqa: BLE001
        return set()


def match_results(rows: list[dict], season_stats: list[dict]):
    """Attach `actual` (and `pos`, `team`) to each row from Sleeper's week.

    Sleeper lists only players on an active roster that day. A name it does
    not list but knows (the trimmed player map) was inactive: his props were
    void, so he is `played: false`, not a miss. Returns the count of rows
    matched to nobody at all.
    """
    by_team: dict[str, list[dict]] = {}
    defense: dict[str, dict] = {}
    for s in season_stats:
        team = canon(s.get("team") or "")
        pl = s.get("player") or {}
        if pl.get("position") == "DEF":
            defense[team] = s
            continue
        name = f"{pl.get('first_name', '')} {pl.get('last_name', '')}".strip()
        if team and name:
            by_team.setdefault(team, []).append({**s, "_name": name})
    known = known_names()
    unmatched = 0
    for r in rows:
        if r.get("dst"):
            st = (defense.get(r["dst"]) or {}).get("stats") or {}
            r["pos"], r["team"] = "DEF", r.pop("dst")
            if not st.get("gp"):
                r["actual"] = None
                unmatched += 1
                continue
            r["actual"] = {"played": True,
                           "any_tds": st.get("def_td", 0) + st.get("def_st_td", 0),
                           "pts_half_ppr": st.get("pts_half_ppr", 0),
                           "pts_allow": st.get("pts_allow")}
            continue
        cands = by_team.get(r["_away"], []) + by_team.get(r["_home"], [])
        n, a = norm_name(r["name"]), alt_name(r["name"])
        hit = [c for c in cands if norm_name(c["_name"]) == n] or \
              [c for c in cands if alt_name(c["_name"]) == a]
        if len(hit) != 1:
            if not hit and n in known:
                r["actual"] = {"played": False, "inactive": True}
            else:
                unmatched += 1
                r["actual"] = None
            continue
        st = hit[0].get("stats") or {}
        r["pos"] = (hit[0].get("player") or {}).get("position")
        r["team"] = canon(hit[0].get("team"))
        if not st.get("gp"):
            r["actual"] = {"played": False}
            continue
        act = {"played": True}
        for ours, theirs in ACTUAL_KEYS.items():
            act[ours] = st.get(theirs, 0)
        if "anytime_tds" not in st:
            act["any_tds"] = st.get("rush_td", 0) + st.get("rec_td", 0)
        act["pts_half_ppr"] = st.get("pts_half_ppr", 0)
        r["actual"] = act
    return unmatched


def build_week(season: str, wk: int, games: list[dict], players: dict, lines: dict) -> dict:
    out_games = []
    for g in sorted(games, key=lambda g: (g["kickoff"] or datetime.max.replace(tzinfo=timezone.utc), g["matchup"])):
        e = lines.get((wk, g["matchup"]), {})
        out_games.append({
            "matchup": g["matchup"], "away": g["away"], "home": g["home"],
            "kickoff": iso(g["kickoff"]), "final": g["final"], "score": g["score"],
            "open": e.get("open"), "close": e.get("close"),
        })
    home_of = {g["matchup"]: (g["away"], g["home"]) for g in games}
    rows = []
    for (w, matchup, _), p in players.items():
        if w != wk:
            continue
        r = {"name": p["name"], "matchup": matchup, "kickoff": iso(p["kickoff"]),
             "_away": home_of[matchup][0], "_home": home_of[matchup][1]}
        if p.get("dst"):
            r["dst"] = p["dst"]
        for field in ("books", "kalshi"):
            if field in p:
                slot = p[field]
                r[field] = {"openAt": iso(slot["openAt"]), "closeAt": iso(slot["closeAt"]),
                            "stats": dict(sorted(slot["stats"].items()))}
        rows.append(r)
    stats = sleeper_week(season, wk)
    unmatched = match_results(rows, stats)
    for r in rows:
        del r["_away"], r["_home"]
    rows.sort(key=lambda r: (r["kickoff"] or "", r["matchup"], r["name"]))
    print(f"  week {wk}: {len(out_games)} games, {len(rows)} player-games "
          f"({sum('books' in r for r in rows)} with book lines, "
          f"{sum('kalshi' in r for r in rows)} with Kalshi), "
          f"{unmatched} without a Sleeper match")
    return {
        "season": season, "week": wk,
        "builtAt": iso(datetime.now(timezone.utc)),
        "note": ("Closing lines (last committed snapshot before each kickoff) beside results. "
                 "books.stats.<stat>.quotes: each book's posted line and price; pass_tds and "
                 "receptions also carry `mean` (expected count from line and price), any_tds "
                 "carries `prob` (implied by the price, margin included). `close` and `open` "
                 "are the books' median of those values. kalshi: Kalshi's line (expected "
                 "count for pass_tds/receptions, probability for any_tds). actual: Sleeper's "
                 "stats, half-PPR points; played false = no snaps (inactive true: not on the active "
                 "roster that day), so the prop was void; actual null = no Sleeper match. "
                 "Written by scripts/build_lines_archive.py."),
        "sources": {"books": "The Odds API", "kalshi": "Kalshi", "games": "The Odds API (median spread/total)",
                    "results": "Sleeper weekly stats; final scores from ESPN"},
        "games": out_games,
        "players": rows,
    }


def dump(payload: dict) -> str:
    """Readable header, one line per game and per player-game."""
    head = {k: v for k, v in payload.items() if k not in ("games", "players")}
    lines = ["{"]
    for k, v in head.items():
        lines.append(f"  {json.dumps(k)}: {json.dumps(v)},")
    for field in ("games", "players"):
        lines.append(f'  "{field}": [')
        items = payload[field]
        for i, it in enumerate(items):
            lines.append("    " + json.dumps(it, separators=(",", ":")) + ("," if i < len(items) - 1 else ""))
        lines.append("  ]" + ("," if field == "games" else ""))
    lines.append("}")
    return "\n".join(lines) + "\n"


def write_if_changed(path: Path, payload: dict) -> bool:
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
        if {k: v for k, v in old.items() if k != "builtAt"} == {k: v for k, v in payload.items() if k != "builtAt"}:
            return False
    except Exception:  # noqa: BLE001
        pass
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dump(payload), encoding="utf-8", newline="\n")
    return True


def parse_weeks(spec: str) -> set[int]:
    out = set()
    for part in spec.split(","):
        a, _, b = part.partition("-")
        out.update(range(int(a), int(b or a) + 1))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks", help="e.g. 1-9 or 3,5")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--season", default=None)
    args = ap.parse_args()

    season = args.season or str(json.loads((ROOT / SOURCES["kalshi"]).read_text(encoding="utf-8")).get("season")
                                or datetime.now(timezone.utc).year)
    now = datetime.now(timezone.utc)
    by_week = {}
    for wk in range(1, 19):
        g = espn_week(season, wk)
        if not g:
            break
        by_week[wk] = g
        if not all(x["final"] for x in g):
            break   # the week in progress; later weeks have nothing to archive

    finished = {wk for wk, g in by_week.items() if g and all(x["final"] for x in g)}
    if args.weeks:
        want = parse_weeks(args.weeks) & finished
    elif args.all:
        want = finished
    else:
        want = set()
        for wk in finished:
            last = max(x["kickoff"] for x in by_week[wk] if x["kickoff"])
            path = ARCHIVE / season / f"week-{wk:02d}.json"
            if now - last <= timedelta(days=RECENT_DAYS) or not path.exists():
                want.add(wk)
    if not want:
        print("No finished week to archive.")
        return 0
    print(f"Archiving season {season}, weeks {sorted(want)}")

    games = Games(by_week)
    players: dict = {}
    lines: dict = {}
    fold_players(snapshots(SOURCES["books"]), games, want, players, "books")
    fold_players(snapshots(SOURCES["kalshi"]), games, want, players, "kalshi")
    fold_games(snapshots(SOURCES["games"]), games, want, lines)

    wrote = 0
    for wk in sorted(want):
        payload = build_week(season, wk, by_week[wk], players, lines)
        if not payload["players"]:
            print(f"  week {wk}: no lines in history; nothing written")
            continue
        if write_if_changed(ARCHIVE / season / f"week-{wk:02d}.json", payload):
            wrote += 1
    print(f"Wrote {wrote} week file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
