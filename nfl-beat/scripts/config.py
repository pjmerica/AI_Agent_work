"""Source configuration. Only feeds verified as live on 2026-08-02 are enabled.

Feeds that returned zero parseable items when probed are recorded in DEAD_FEEDS
rather than deleted, so nobody re-adds them expecting them to work.
"""

# (url, label). Label is what appears as the source in the digest.
RSS_FEEDS = [
    ("https://profootballtalk.nbcsports.com/feed/", "ProFootballTalk"),
    ("https://sports.yahoo.com/nfl/rss.xml", "Yahoo NFL"),
    ("https://www.cbssports.com/rss/headlines/nfl/", "CBS Sports NFL"),
    ("https://www.pff.com/feed", "PFF"),
    ("https://www.espn.com/espn/rss/nfl/news", "ESPN NFL"),
    ("https://www.rotowire.com/rss/news.php?sport=NFL", "RotoWire"),
    ("https://awfulannouncing.com/feed", "Awful Announcing"),
]

# Probed 2026-08-02, returned nothing parseable. Do not re-enable without testing.
DEAD_FEEDS = {
    "https://theathletic.com/nfl/rss/": "paywalled, public feed removed",
    "https://sports.yahoo.com/nfl/teams/{abbr}/rss.xml": "per-team feeds 404",
    "https://www.nfl.com/feeds/rss/news": "no items returned",
    "https://api.foxsports.com/v1/rss?tag=nfl": "no items returned",
    "https://football.nbcsports.com/feed/": "no items returned",
    "https://www.fantasypros.com/nfl/rss/news.php": "no items returned",
    "https://www.si.com/nfl/.rss/full": "no items returned",
    "https://nypost.com/sports/nfl/feed/": "no items returned",
}

# RSS items are kept longer than social posts: feeds publish less often, and an
# ESPN camp roundup from 40 hours ago is still actionable.
MAX_AGE_HOURS_RSS = 72
MAX_AGE_HOURS_SOCIAL = 48

# Fantasy relevance vocabulary. Weights are multiplicative on top of a player's
# sleeper_weight, so "WR4 takes first-team reps" outranks "star WR spoke to media".
SIGNAL_TERMS = {
    # Opportunity opening up -- the highest-value early signal
    "first-team": 3.0, "first team": 3.0, "1st team": 3.0, "starting job": 3.0,
    "starter": 2.2, "promoted": 2.5, "depth chart": 2.5, "climbing": 2.0,
    "reps with the": 2.2, "running with": 2.2, "took over": 2.5, "ahead of": 2.0,
    "impressed": 1.8, "standout": 1.8, "turning heads": 2.5, "buzz": 2.0,
    "breakout": 2.2, "sleeper": 2.2, "stock up": 2.5, "riser": 2.0,
    "camp star": 2.5, "best player": 1.8, "shining": 1.8, "explosive": 1.5,
    # Opportunity closing -- matters because it opens someone else's
    "injury": 2.0, "injured": 2.0, "tore": 2.8, "acl": 2.8, "out for": 2.5,
    "surgery": 2.5, "ir": 1.8, "placed on": 1.8, "suspended": 2.2,
    "hamstring": 1.8, "questionable": 1.4, "did not practice": 2.0,
    "limited": 1.5, "sidelined": 2.0, "carted": 2.5, "setback": 2.2,
    "released": 2.2, "waived": 2.0, "traded": 2.2, "holdout": 1.8,
    # Usage detail
    "snap": 1.8, "snaps": 1.8, "targets": 1.8, "target share": 2.2,
    "carries": 1.8, "touches": 1.8, "red zone": 2.0, "goal line": 2.2,
    "two-minute": 1.6, "third down": 1.8, "slot": 1.5, "package": 1.5,
    "committee": 1.8, "workload": 1.8, "lead back": 2.5, "rb1": 2.2,
    "wr1": 2.0, "wr2": 1.8, "wr3": 1.8, "te1": 2.0,
}

# Chatter that mentions a player without saying anything actionable.
NOISE_TERMS = [
    "jersey", "merch", "podcast", "tickets", "madden", "power rankings",
    "mock draft", "highlight", "throwback", "anniversary", "hall of fame",
    "retired", "arrested", "lawsuit", "contract dispute resolved",
]
