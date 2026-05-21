// NFL teams with all the aliases that appear in headlines
window.NFL_TEAMS = [
  { id: "ari", name: "Cardinals",   aliases: ["Cardinals", "Arizona"] },
  { id: "atl", name: "Falcons",     aliases: ["Falcons", "Atlanta"] },
  { id: "bal", name: "Ravens",      aliases: ["Ravens", "Baltimore"] },
  { id: "buf", name: "Bills",       aliases: ["Bills", "Buffalo"] },
  { id: "car", name: "Panthers",    aliases: ["Panthers", "Carolina"] },
  { id: "chi", name: "Bears",       aliases: ["Bears", "Chicago"] },
  { id: "cin", name: "Bengals",     aliases: ["Bengals", "Cincinnati"] },
  { id: "cle", name: "Browns",      aliases: ["Browns", "Cleveland"] },
  { id: "dal", name: "Cowboys",     aliases: ["Cowboys", "Dallas"] },
  { id: "den", name: "Broncos",     aliases: ["Broncos", "Denver"] },
  { id: "det", name: "Lions",       aliases: ["Lions", "Detroit"] },
  { id: "gb",  name: "Packers",     aliases: ["Packers", "Green Bay"] },
  { id: "hou", name: "Texans",      aliases: ["Texans", "Houston"] },
  { id: "ind", name: "Colts",       aliases: ["Colts", "Indianapolis"] },
  { id: "jax", name: "Jaguars",     aliases: ["Jaguars", "Jacksonville", "Jags"] },
  { id: "kc",  name: "Chiefs",      aliases: ["Chiefs", "Kansas City"] },
  { id: "lv",  name: "Raiders",     aliases: ["Raiders", "Las Vegas", "Vegas"] },
  { id: "lac", name: "Chargers",    aliases: ["Chargers", "Los Angeles Chargers", "LA Chargers"] },
  { id: "lar", name: "Rams",        aliases: ["Rams", "Los Angeles Rams", "LA Rams"] },
  { id: "mia", name: "Dolphins",    aliases: ["Dolphins", "Miami"] },
  { id: "min", name: "Vikings",     aliases: ["Vikings", "Minnesota"] },
  { id: "ne",  name: "Patriots",    aliases: ["Patriots", "New England", "Pats"] },
  { id: "no",  name: "Saints",      aliases: ["Saints", "New Orleans"] },
  { id: "nyg", name: "Giants",      aliases: ["Giants", "NY Giants", "New York Giants"] },
  { id: "nyj", name: "Jets",        aliases: ["Jets", "NY Jets", "New York Jets"] },
  { id: "phi", name: "Eagles",      aliases: ["Eagles", "Philadelphia", "Philly"] },
  { id: "pit", name: "Steelers",    aliases: ["Steelers", "Pittsburgh"] },
  { id: "sf",  name: "49ers",       aliases: ["49ers", "Niners", "San Francisco"] },
  { id: "sea", name: "Seahawks",    aliases: ["Seahawks", "Seattle"] },
  { id: "tb",  name: "Buccaneers",  aliases: ["Buccaneers", "Bucs", "Tampa Bay", "Tampa"] },
  { id: "ten", name: "Titans",      aliases: ["Titans", "Tennessee"] },
  { id: "was", name: "Commanders",  aliases: ["Commanders", "Washington"] }
];

window.NFL_SOURCES = [
  {
    id: "espn",
    label: "ESPN",
    cssClass: "source-espn",
    url: "https://www.espn.com/espn/rss/nfl/news"
  },
  {
    id: "nfl",
    label: "NFL.com",
    cssClass: "source-nfl",
    url: "https://www.nfl.com/feeds/rss/news"
  },
  {
    id: "pft",
    label: "ProFootballTalk",
    cssClass: "source-pft",
    url: "https://profootballtalk.nbcsports.com/feed/"
  },
  {
    id: "br",
    label: "Bleacher Report",
    cssClass: "source-br",
    url: "https://bleacherreport.com/articles/feed?tag_id=10"
  }
];
