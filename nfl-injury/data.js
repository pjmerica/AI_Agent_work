// ── NFL Pre-Draft Injury Analysis Data ────────────────────────────────────────
// Sources cited per player. Data compiled from Wikipedia, ESPN, Pro Football
// Reference, Sports Illustrated, NFL.com, Bleacher Report, NBC Sports.
// Last updated: v1 — covering 1995-2025, positions QB/RB/WR/TE.
// Version tracking
window.NFL_INJURY_DATA = {

  version: "1.4",
  lastUpdated: "2026-04-02",
  totalPlayers: 27,
  confirmed: 13,
  refuted: 4,
  mixed: 6,
  noflag: 4,

  // ── VERDICT KEY ─────────────────────────────────────────────────────────────
  // CONFIRMED — Pre-draft injury/concern accurately predicted significant NFL
  //             injury issues (career shortened, limited, or ended by injuries)
  // REFUTED   — Pre-draft concern did NOT materialize into significant NFL
  //             injury problems; player had healthy/productive career
  // MIXED     — Pre-draft concern partially materialized; player had some NFL
  //             injuries but overcame them or was affected in limited ways

  players: [

    // ══════════════════════════════════════════════════════════════════════════
    // QUARTERBACKS
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: "bradford-sam",
      name: "Sam Bradford",
      pos: "QB",
      college: "Oklahoma",
      draftYear: 2010,
      pickNumber: 1,
      round: 1,
      team: "St. Louis Rams",
      verdict: "CONFIRMED",

      preDraftInjury: "Two major shoulder injuries at Oklahoma — AC joint sprain (2009) and subsequent season-ending surgery on his throwing shoulder",
      preDraftDetails: [
        "September 2009: Suffered a third-degree AC joint sprain (right shoulder, throwing arm) in first game of season vs. BYU",
        "Re-injured the same shoulder Oct. 17, 2009 in Red River Rivalry vs. Texas on just the second drive",
        "Underwent season-ending surgery to reconstruct the AC joint in his throwing shoulder, late October 2009",
        "Did not throw at the 2010 NFL Scouting Combine due to recovery — a significant red flag for evaluators",
        "Held a private workout in Norman, OK in March 2010 to prove he could still throw"
      ],
      draftImpact: "Despite the shoulder concerns and not throwing at the combine, Bradford was still selected #1 overall. His pre-draft shoulder surgery was widely discussed but teams believed in his elite talent.",
      projectedWithoutInjury: "Would still have been a top-5 pick based on 2008 Heisman Trophy season.",

      nflCareerSummary: "9 seasons in the NFL with the Rams, Eagles, Vikings, Cardinals, and Seahawks. Career plagued by near-constant injuries, particularly knees and shoulders. Retired after 2018 season at age 30.",
      nflInjuries: [
        "2013: Torn ACL, left knee — missed final 15 games of season",
        "2014: Torn ACL, same left knee — missed entire season; back-to-back ACL tears",
        "2016: Knee sprain — played through it for a historic season (completed 71.6% of passes)",
        "2017: Knee injury with the Vikings — played only 7.5 games before being replaced by Case Keenum",
        "2018: Knee injury — started only 1 game with Arizona before being placed on IR"
      ],
      gamesPlayed: 87,
      careerLength: "2010–2018 (active for portions of 9 seasons)",
      verdictExplanation: "Bradford's pre-draft shoulder concerns were a preview of a career defined by injuries. While it was his knees, not his shoulder, that ultimately derailed him, the pre-draft red flag accurately signaled that his body would not hold up to NFL punishment. He never played a full 16-game season.",

      sources: [
        { text: "Sam Bradford — Wikipedia", url: "https://en.wikipedia.org/wiki/Sam_Bradford" },
        { text: "A Shoulder to Lean On — SI Vault 2010", url: "https://vault.si.com/vault/2010/04/26/a-shoulder-to-lean-on" },
        { text: "Bradford dazzles at first workout since surgery — Fox Sports", url: "https://foxsports.com/nfl/story/sam-bradford-dazzles-at-first-public-workout-since-injury-032910" },
        { text: "Sam Bradford injury history — DraftSharks", url: "https://www.draftsharks.com/fantasy/injury-history/sam-bradford/3362" }
      ]
    },

    {
      id: "tagovailoa-tua",
      name: "Tua Tagovailoa",
      pos: "QB",
      college: "Alabama",
      draftYear: 2020,
      pickNumber: 5,
      round: 1,
      team: "Miami Dolphins",
      verdict: "MIXED",

      preDraftInjury: "Catastrophic right hip fracture-dislocation suffered Nov. 16, 2019 against Mississippi State — one of the most severe injuries ever seen in college football",
      preDraftDetails: [
        "November 16, 2019: Suffered dislocated right hip with posterior wall fracture while rolling left on a third-down play against Mississippi State",
        "Surgery lasted 4.5 hours — hip specialist Dr. Chip Routt repaired the posterior wall fracture",
        "Had also suffered ankle and knee injuries earlier in the 2019 season",
        "Was projected as a consensus top-2 overall pick before the hip injury — some had him as potential #1",
        "Fell from top-2 projection to #5 overall pick; the injury cost him millions in guaranteed money",
        "NFL executives were split — multiple high-ranking team officials still expected him in top half of first round despite the injury"
      ],
      draftImpact: "Fell from projected top-2 pick to #5. The catastrophic hip injury was one of the most alarming pre-draft medical situations in recent memory, costing him potentially $20-30M in draft slot value.",
      projectedWithoutInjury: "Likely #1 or #2 overall pick in 2020 NFL Draft.",

      nflCareerSummary: "Started for Miami from 2020-2024. Hip injury largely healed, but suffered multiple concussions including two back-to-back in 2022 that triggered NFLPA investigation. Released by Dolphins after 2024 season.",
      nflInjuries: [
        "2022: Two concussions in four days — the second caused frightening sideline collapse against Steelers, triggering NFLPA/NFL investigation into return-to-play protocols",
        "2022: Torn UCL in thumb — surgery, missed time",
        "2023: Multiple injuries throughout season",
        "Hip fracture has not been a significant recurring NFL issue"
      ],
      gamesPlayed: 68,
      careerLength: "2020–2024 (5 seasons)",
      verdictExplanation: "The hip injury that scared evaluators largely healed as doctors predicted. However, Tua's overall fragility has manifested differently — in concussions and soft tissue injuries rather than the hip. The pre-draft concern signaled a body prone to injury, even if the specific injury healed well. Released by Miami after 2024.",

      sources: [
        { text: "Tua Tagovailoa dislocated hip — ESPN", url: "https://www.espn.com/college-football/story/_/id/28093292/alabama-quarterback-tua-tagovailoa-season-done-dislocated-hip" },
        { text: "Tua's NFL draft stock after hip injury — Bleacher Report", url: "https://bleacherreport.com/articles/2863050-tuas-updated-nfl-draft-stock-after-reportedly-suffering-fractured-hip-injury" },
        { text: "Tua Tagovailoa injury history explained — The Phinsider", url: "https://www.thephinsider.com/2020/4/24/21234954/tua-tagovailoa-his-injury-history-and-his-hip-injury-explained" }
      ]
    },

    {
      id: "locker-jake",
      name: "Jake Locker",
      pos: "QB",
      college: "Washington",
      draftYear: 2011,
      pickNumber: 8,
      round: 1,
      team: "Tennessee Titans",
      verdict: "CONFIRMED",

      preDraftInjury: "Shoulder instability, reduced velocity concerns, and mechanical red flags at the 2011 NFL Combine",
      preDraftDetails: [
        "Teams noted shoulder instability and inconsistent throwing mechanics at Washington",
        "His 2010 completion percentage at Washington was only 57.4% — scouts debated whether it was technique or a physical issue",
        "Multiple teams passed on him due to medical and mechanical concerns",
        "His combine performance raised questions about velocity and arm health",
        "Was considered a top-3 talent but medical concerns and mechanics caused him to slip to #8"
      ],
      draftImpact: "Medical and mechanical concerns contributed to slipping from potential top-3 pick to #8 overall.",
      projectedWithoutInjury: "Top-3 pick based on athleticism and upside.",

      nflCareerSummary: "Played only 4 NFL seasons (2011–2014), starting just 27 games. Retired in February 2015 at age 26 — citing loss of passion for the game, but health concerns were a significant factor.",
      nflInjuries: [
        "2012: Separated shoulder — missed 5 games",
        "2013: Hip pointer injury early in season — missed games",
        "2013: Lacerated kidney from hit — placed on IR, missed rest of season",
        "2014: Ankle injury — placed on IR in October, triggered retirement decision"
      ],
      gamesPlayed: 27,
      careerLength: "2011–2014 (4 seasons, retired at 26)",
      verdictExplanation: "Locker's pre-draft medical concerns foreshadowed a short, injury-interrupted NFL career. He never played more than 11 games in a single season and retired at 26. The combination of shoulder concerns, mechanical issues, and subsequent NFL injuries confirm the pre-draft red flags were warranted.",

      sources: [
        { text: "Jake Locker — Wikipedia", url: "https://en.wikipedia.org/wiki/Jake_Locker" },
        { text: "2011 NFL Draft Quarterback Analysis — Pro Football Reference", url: "https://www.pro-football-reference.com/years/2011/draft.htm" }
      ]
    },

    {
      id: "manuel-ej",
      name: "EJ Manuel",
      pos: "QB",
      college: "Florida State",
      draftYear: 2013,
      pickNumber: 16,
      round: 1,
      team: "Buffalo Bills",
      verdict: "CONFIRMED",

      preDraftInjury: "Meniscus issues and general durability questions raised at the 2013 NFL Combine; required knee surgery during his NFL debut",
      preDraftDetails: [
        "Teams at the 2013 combine flagged knee concerns and durability questions for Manuel",
        "Many scouts noted he had been held out of games at FSU for precautionary reasons",
        "Was widely considered a 2nd-round prospect based on film but went 16th — the only QB in round 1 — due to the exceptionally weak 2013 QB class",
        "Knee fluid buildup required draining during his first NFL preseason — not a brand new injury"
      ],
      draftImpact: "Despite concerns, was selected #16 overall — the first QB taken in the 2013 draft, a notoriously weak QB class.",
      projectedWithoutInjury: "Unlikely to have moved much higher given the positional talent ceiling; the 2013 QB class was poor regardless.",

      nflCareerSummary: "Made just 17 starts over 4 seasons with Buffalo. Never established himself as a starter. Last played in NFL in 2017.",
      nflInjuries: [
        "Preseason 2013: Knee required fluid removal — missed start of preseason",
        "2013 regular season: Knee and shoulder injuries limited him to 10 starts as a rookie",
        "2014-2016: Continued durability issues prevented him from securing the starting job"
      ],
      gamesPlayed: 17,
      careerLength: "2013–2017 (5 seasons, 17 starts)",
      verdictExplanation: "Manuel's pre-draft durability concerns proved valid. He never played a full season and injuries contributed to a short career as a backup. The Bills' gamble on him at #16 — driven by a weak QB class rather than elite talent — did not pay off.",

      sources: [
        { text: "EJ Manuel — Wikipedia", url: "https://en.wikipedia.org/wiki/EJ_Manuel" },
        { text: "EJ Manuel out for Bills preseason with knee injury — NFL.com", url: "https://www.nfl.com/news/ej-manuel-out-for-bills-preseason-with-knee-injury-0ap1000000231078" }
      ]
    },

    // ══════════════════════════════════════════════════════════════════════════
    // RUNNING BACKS
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: "mcgahee-willis",
      name: "Willis McGahee",
      pos: "RB",
      college: "Miami (FL)",
      draftYear: 2003,
      pickNumber: 23,
      round: 1,
      team: "Buffalo Bills",
      verdict: "REFUTED",

      preDraftInjury: "Catastrophic triple-ligament knee injury (ACL + PCL + MCL tears) suffered in the 2003 Fiesta Bowl against Ohio State — one of the most gruesome injuries in college football history",
      preDraftDetails: [
        "January 3, 2003 (Fiesta Bowl): Hit by Ohio State safety Will Allen in the 4th quarter — McGahee's left knee was shredded",
        "Suffered simultaneous tears of the ACL, PCL, and MCL in his left knee",
        "The injury was initially feared career-ending; he rushed for 67 yards and a TD before the hit",
        "Mel Kiper immediately called him 'a cinch top-five pick' before the injury; projected late 3rd round afterward",
        "Missed his entire NFL rookie season (2003) while rehabilitating the knee",
        "Buffalo Bills took a massive calculated risk selecting him 23rd overall"
      ],
      draftImpact: "Dropped from projected top-5 pick to 23rd overall — lost approximately $15-20M in contract value due to the injury alone.",
      projectedWithoutInjury: "Top-5 pick according to Mel Kiper and most analysts.",

      nflCareerSummary: "Played 9 NFL seasons (2004–2014) with Bills, Ravens, Broncos, Cowboys, and Browns. Rushed for 6,308 career yards and 47 touchdowns. Won a Super Bowl with Baltimore in Super Bowl XLVII.",
      nflInjuries: [
        "Missed entire 2003 rookie season — knee rehabilitation",
        "2012: Torn ACL (Denver Broncos) — the same type of injury recurred; missed rest of season",
        "Various minor injuries throughout career but played 9 productive seasons overall"
      ],
      gamesPlayed: 122,
      careerLength: "2004–2014 (9 active seasons)",
      verdictExplanation: "The pre-draft concerns were largely REFUTED. Despite one of the most devastating pre-draft knee injuries in history, McGahee had a legitimate 9-year NFL career and won a Super Bowl. He did suffer another ACL tear in 2012, suggesting the knee was a chronic weakness, but the prediction of career failure was wrong. The Bills' gamble paid off.",

      sources: [
        { text: "Willis McGahee — Wikipedia", url: "https://en.wikipedia.org/wiki/Willis_McGahee" },
        { text: "McGahee a top-five pick before injury — Mel Kiper, ESPN", url: "http://www.espn.com/melkiper/s/2003/0106/1488088.html" },
        { text: "Miami back had only two tears, not three — ESPN", url: "http://www.espn.com/ncf/bowls02/s/fiesta_mcgaheesurgery.html" }
      ]
    },

    {
      id: "lattimore-marcus",
      name: "Marcus Lattimore",
      pos: "RB",
      college: "South Carolina",
      draftYear: 2013,
      pickNumber: 131,
      round: 4,
      team: "San Francisco 49ers",
      verdict: "CONFIRMED",

      preDraftInjury: "TWO catastrophic knee injuries at South Carolina — the most injury-compromised blue-chip RB prospect in NFL draft history",
      preDraftDetails: [
        "October 2011 (vs. Mississippi State): Tore ACL, MCL, and meniscus in his LEFT knee — had surgery performed by Dr. James Andrews",
        "Made miraculous comeback in 2012, rushing for 627 yards and 10 TDs through 8 games — looked like pre-injury self",
        "October 27, 2012 (vs. Tennessee): Suffered catastrophic RIGHT knee dislocation — dislocated kneecap, torn multiple ligaments",
        "Dr. James Andrews called it 'one of the worst, most complex knee injuries' he'd ever operated on",
        "Doctors at one point told Lattimore's mother he had a 10% chance of ever walking again",
        "Despite this, 49ers drafted him 131st overall as a project/value pick in 2013"
      ],
      draftImpact: "Fell from potential top-10 RB prospect (pre-2011 injury) to 131st overall due to two devastating knee injuries.",
      projectedWithoutInjury: "Could have been a top-15 overall pick based on 2010 freshman performance and pre-injury trajectory.",

      nflCareerSummary: "Never played a single regular-season NFL snap. Placed on the reserve/non-football injury list August 27, 2013. Announced retirement from the NFL on November 5, 2014, at age 23.",
      nflInjuries: [
        "Never cleared for regular season play — placed directly on reserve/NFI list",
        "Right knee from the 2012 injury never recovered sufficiently for NFL competition",
        "Officially retired at age 23 without ever playing a professional game"
      ],
      gamesPlayed: 0,
      careerLength: "2013–2014 (never played a regular season game)",
      verdictExplanation: "The most definitive CONFIRMED case in this dataset. Two catastrophic college knee injuries completely ended what should have been a generational NFL career. Marcus Lattimore was considered one of the best running back prospects in a decade before the injuries — pre-draft concerns were not just validated, they defined his career entirely.",

      sources: [
        { text: "Marcus Lattimore — Wikipedia", url: "https://en.wikipedia.org/wiki/Marcus_Lattimore" },
        { text: "Marcus Lattimore: 'I'm thankful for those knee injuries' — ESPN", url: "https://www.espn.com/college-football/story/_/id/15528475/former-south-carolina-gamecocks-rb-marcus-lattimore-finds-new-life-happiness-knee-injuries" },
        { text: "10 years after devastating injury — ESPN 2022", url: "https://www.espn.com/college-football/story/_/id/34877023/10-years-devastating-injury-south-carolina-marcus-lattimore-rediscovers-place-game" },
        { text: "Marcus Lattimore's surgeon opens up — WIS-TV", url: "https://www.wistv.com/story/27321471/marcus-lattimores-surgeon-opens-up-about-his-knee-injuries/" }
      ]
    },

    {
      id: "gurley-todd",
      name: "Todd Gurley",
      pos: "RB",
      college: "Georgia",
      draftYear: 2015,
      pickNumber: 10,
      round: 1,
      team: "Los Angeles Rams",
      verdict: "CONFIRMED",

      preDraftInjury: "Torn ACL in left knee suffered October 2014 at Georgia — just 5 months before the 2015 NFL Draft",
      preDraftDetails: [
        "October 2014: Tore his ACL during the Georgia football season; surgery performed by Dr. James Andrews",
        "Was already suspended by the SEC for the first four games of 2014 for accepting improper benefits — then injured",
        "Had only played 8 games in 2014 before the ACL tear",
        "Teams debated: was the ACL clean (just ligament, no cartilage damage)? Coach Mark Richt said it was a 'clean ACL tear'",
        "Was still selected 10th overall by the Rams; went on to win NFL Offensive Rookie of the Year in 2015"
      ],
      draftImpact: "The ACL likely cost him a top-5 pick; some projected him as high as #1 or #2 overall when healthy.",
      projectedWithoutInjury: "Top-3 overall pick by most pre-injury projections.",

      nflCareerSummary: "4 Pro Bowls in 6 seasons with the Rams. Elite early career (2017-2018), then knee issues emerged in 2019 playoffs and progressively worsened. Rams released him in 2020. Never recovered his pre-2019 form.",
      nflInjuries: [
        "2018 NFC Championship: Mysteriously limited in Super Bowl run — later revealed knee was a significant concern",
        "2019: Officially diagnosed with arthritic component and articular cartilage damage — knee osteoarthritis",
        "Rams released him in March 2020 despite 2 years remaining on his contract — confirmed they knew knee was deteriorating",
        "2020 (Atlanta Falcons): Rushed for only 678 yards — shadow of his former self",
        "2021: Tore ACL in Week 1 with Atlanta — career effectively ended at 27"
      ],
      gamesPlayed: 84,
      careerLength: "2015–2021 (played portions of 7 seasons)",
      verdictExplanation: "The ACL concern proved prescient in a delayed but definitive way. Gurley was elite for three seasons, then knee issues caught up with him. Articular cartilage damage — a known risk after ACL surgery — became the diagnosis that ended his prime. The Rams knew before cutting him, confirming the knee never fully healed from the original injury.",

      sources: [
        { text: "Todd Gurley ACL recovery — Sports Illustrated 2015", url: "https://www.si.com/nfl/2015/04/29/nfl-draft-todd-gurley-recovery-acl" },
        { text: "Gurley's trainer confirms arthritic component — NFL.com", url: "https://www.nfl.com/news/gurley-s-trainer-confirms-arthritic-component-to-knee-0ap3000001034072" },
        { text: "Gurley's knee a 'concern' — ProFootballTalk/NBC Sports", url: "https://profootballtalk.nbcsports.com/2019/06/01/glazer-todd-gurleys-knee-is-a-concern/" },
        { text: "Gurley's arthritic knee explained — Bleacher Report", url: "https://bleacherreport.com/articles/2841523-todd-gurleys-trainer-rams-rb-has-arthritic-component-to-his-knee" }
      ]
    },

    {
      id: "cook-dalvin",
      name: "Dalvin Cook",
      pos: "RB",
      college: "Florida State",
      draftYear: 2017,
      pickNumber: 41,
      round: 2,
      team: "Minnesota Vikings",
      verdict: "CONFIRMED",

      preDraftInjury: "ACL tear at Florida State in 2015 — combined with an off-field legal issue, caused him to fall to the 2nd round",
      preDraftDetails: [
        "2015: Tore his ACL at Florida State — missed the season",
        "Came back in 2016 and was highly productive, but teams flagged his injury history and an off-field assault charge",
        "Was projected as a top-15 pick by many analysts before concerns; fell to pick #41",
        "Combine medicals raised questions about the ACL knee's long-term health"
      ],
      draftImpact: "Fell from projected top-15 pick to #41 due to combination of injury history and off-field concerns.",
      projectedWithoutInjury: "Top-10 pick based on pure talent.",

      nflCareerSummary: "Productive but injury-interrupted career with Vikings (2017-2022) and Jets/Cowboys (2023). Never played a full 16/17-game season. Released by Jets in 2023 without finding new team.",
      nflInjuries: [
        "2017: Torn ACL in Week 4 vs. Detroit — same knee injury recurred in first NFL season",
        "2018: Hamstring issues throughout season",
        "2019: Hamstring — missed 6 games",
        "2020: Full season (best year: 1,557 rushing yards) — stayed healthy",
        "2021: Hamstring, shoulder issues — missed 6 games",
        "2022: Multiple muscle strains — never the same player again"
      ],
      gamesPlayed: 83,
      careerLength: "2017–2023 (7 seasons, never played full year)",
      verdictExplanation: "Cook's pre-draft ACL concern was immediately validated — he tore the same ACL in Week 4 of his rookie year. His career was defined by elite play when healthy alternating with consistent injury absences. The pre-draft red flag accurately identified his body's vulnerability.",

      sources: [
        { text: "Dalvin Cook — Wikipedia", url: "https://en.wikipedia.org/wiki/Dalvin_Cook" },
        { text: "2017 NFL Draft analysis — Pro Football Reference", url: "https://www.pro-football-reference.com/years/2017/draft.htm" }
      ]
    },

    {
      id: "foster-arian",
      name: "Arian Foster",
      pos: "RB",
      college: "Tennessee",
      draftYear: 2009,
      pickNumber: null,
      round: null,
      team: "Houston Texans (undrafted)",
      verdict: "MIXED",

      preDraftInjury: "Stress fracture in his back at Tennessee — one of the reasons he went undrafted in 2009",
      preDraftDetails: [
        "Suffered a stress fracture in his back (lumbar) while at Tennessee",
        "Back injury combined with inconsistent college production led all 32 teams to pass on him in the 2009 NFL Draft",
        "Signed with Houston Texans as an undrafted free agent",
        "Most teams considered his injury history too risky for a draft investment"
      ],
      draftImpact: "Went entirely undrafted — teams' injury concerns meant he received no guaranteed draft pick money.",
      projectedWithoutInjury: "Late-round pick at minimum based on production at Tennessee.",

      nflCareerSummary: "Became one of the best RBs in the NFL from 2010-2014. Four-time Pro Bowler. Set Texans records. Led NFL in rushing in 2010. But career effectively ended by 2015 due to back, hamstring, and knee issues.",
      nflInjuries: [
        "2012: Hamstring injuries throughout season",
        "2013: Torn Achilles — missed 8+ games",
        "2014: Hip surgery, various muscle tears — essentially career-defining injuries began",
        "2015: Back and hip issues returned — played only 3 games; retired after season",
        "The back that scared teams in 2009 eventually caused retirement in 2016 at age 30"
      ],
      gamesPlayed: 94,
      careerLength: "2009–2015 (7 seasons; dominant 2010-2012, declined due to injuries 2013-2015)",
      verdictExplanation: "A MIXED verdict. Teams were right that injuries would be a problem — Foster's career was cut short by back and soft tissue injuries at 30. But the severity of his pre-draft concerns was clearly overstated — he became an elite NFL back for 3-4 years before the body broke down. The concern predicted eventual decline, just not immediate failure.",

      sources: [
        { text: "Arian Foster — Wikipedia", url: "https://en.wikipedia.org/wiki/Arian_Foster" },
        { text: "Arian Foster career statistics — Pro Football Reference", url: "https://www.pro-football-reference.com/players/F/FostAr00.htm" }
      ]
    },

    {
      id: "fournette-leonard",
      name: "Leonard Fournette",
      pos: "RB",
      college: "LSU",
      draftYear: 2017,
      pickNumber: 4,
      round: 1,
      team: "Jacksonville Jaguars",
      verdict: "CONFIRMED",

      preDraftInjury: "Ankle and foot injuries at LSU raised durability questions heading into the 2017 draft — LSU notably held him out of games late in the 2016 season to protect his draft stock",
      preDraftDetails: [
        "2016 season: Battled ankle issues that led LSU to hold him out of at least one game — 'load management' before the draft",
        "Teams noted he carried a heavy workload at LSU and questioned long-term durability of a big back (228 lbs) with ankle history",
        "Despite concerns, drafted 4th overall — considered too physically gifted to pass",
        "Some teams' medicals flagged his ankle as a potential chronic issue"
      ],
      draftImpact: "Minor — still went #4 overall, though some teams ranked him below Christian McCaffrey (#8) partly due to durability questions.",
      projectedWithoutInjury: "Top-3 pick potential based on raw talent.",

      nflCareerSummary: "Injury-plagued 4 seasons in Jacksonville before revival in Tampa Bay. Won Super Bowl LV with Buccaneers (2020). Consistent injuries throughout career, eventually released by multiple teams.",
      nflInjuries: [
        "2018: Hamstring strain — missed 6 games",
        "2019: Ankle injury (the pre-draft concern region) — missed 6 games; was also suspended by Jaguars for conduct",
        "Jaguars cut him before 2020 — cited both conduct and injury/durability concerns",
        "2020-2021: Productive with Tampa Bay but hamstring issues continued",
        "2022-2023: Struggled to find roster spots as body broke down"
      ],
      gamesPlayed: 72,
      careerLength: "2017–2023 (7 seasons, inconsistent availability)",
      verdictExplanation: "The pre-draft durability concern was validated. Fournette's ankle issues directly affected his Jacksonville tenure, and while he had a career revival in Tampa Bay, he was never the franchise-level 4th-overall-pick player teams hoped for. The injury concern predicted his career arc accurately.",

      sources: [
        { text: "Leonard Fournette — Wikipedia", url: "https://en.wikipedia.org/wiki/Leonard_Fournette" },
        { text: "2017 NFL Draft RB analysis — Pro Football Reference", url: "https://www.pro-football-reference.com/years/2017/draft.htm" }
      ]
    },

    // ══════════════════════════════════════════════════════════════════════════
    // WIDE RECEIVERS
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: "white-kevin",
      name: "Kevin White",
      pos: "WR",
      college: "West Virginia",
      draftYear: 2015,
      pickNumber: 7,
      round: 1,
      team: "Chicago Bears",
      verdict: "CONFIRMED",

      preDraftInjury: "Tibial stress fracture — a tibial stress syndrome ('shin splints') that progressed to a structural fracture requiring surgery with a steel rod insertion",
      preDraftDetails: [
        "The stress fracture was identified during the 2015 offseason before his rookie campaign — though the foundation of it began in college",
        "Bears GM Ryan Pace announced August 15, 2015 that White had suffered a stress fracture in his shin during OTAs — requiring surgery",
        "Steel rod inserted into his left tibia on August 23, 2015 — placed on PUP list",
        "Bears drafted him 7th overall knowing his injury history; the same shin that would shatter had shown stress syndrome patterns",
        "Injury analysis suggested his tibial stress syndrome had been undertreated and progressed to structural fracture"
      ],
      draftImpact: "Minimal draft impact at the time — Bears took him #7 overall; the full extent of the injury problem emerged post-draft.",
      projectedWithoutInjury: "Top-5 candidate — considered arguably the best WR prospect in the 2015 class by some evaluators.",

      nflCareerSummary: "The most injury-cursed WR of the modern draft era. In 4 seasons with Chicago, he played approximately 11 games total. Released after 2018; brief, injury-ended stints with Cardinals and 49ers. Career total: 25 receptions, 285 yards.",
      nflInjuries: [
        "2015: Entire season lost — tibial stress fracture with steel rod insertion (rookie year)",
        "2016: Fractured fibula in left leg (same leg) in Week 3 — placed on IR",
        "2017: Fractured left shoulder blade in season opener vs. Atlanta — IR again",
        "2018: Managed to play 8 games — 11 catches for 187 yards",
        "2019 (Arizona): Hamstring; never contributed",
        "2019 (San Francisco): Cut without playing"
      ],
      gamesPlayed: 11,
      careerLength: "2015–2019 (5 seasons, 11 games played)",
      verdictExplanation: "One of the clearest CONFIRMED cases in NFL draft history. The tibial stress pattern was a warning sign of a body that could not withstand NFL-level punishment. Four years, four different injuries to multiple body parts, never playing a meaningful NFL game. The #7 pick effectively never played.",

      sources: [
        { text: "Kevin White — Wikipedia", url: "https://en.wikipedia.org/wiki/Kevin_White_(American_football)" },
        { text: "Kevin White stress fracture injury analysis — DraftSharks", url: "https://www.draftsharks.com/article/injury-analysis--kevin-white-s-stress-fracture" },
        { text: "White to remain on PUP list for 2015 season — ESPN", url: "http://www.espn.com/nfl/story/_/id/14375997/wr-kevin-white-chicago-bears-remain-pup-list-rest-2015-season" },
        { text: "NFL: Cardinals release 2015 1st-round bust Kevin White — Yahoo Sports", url: "https://sports.yahoo.com/cardinals-cut-former-bears-1-stround-bust-kevin-white-000245948.html" }
      ]
    },

    {
      id: "ross-john",
      name: "John Ross",
      pos: "WR",
      college: "Washington",
      draftYear: 2017,
      pickNumber: 9,
      round: 1,
      team: "Cincinnati Bengals",
      verdict: "CONFIRMED",

      preDraftInjury: "Extensive injury history entering the 2017 draft: torn ACL (2015), two meniscus tears, microfracture surgery in knee, AND torn labrum in throwing/catching shoulder requiring post-combine surgery",
      preDraftDetails: [
        "2015: Tore his ACL during spring practices at Washington — missed entire season",
        "ACL surgery included two meniscus tears and ultimately required microfracture surgery — three procedures on the same knee",
        "December 2016 (Peach Bowl vs. Alabama): Re-aggravated his labrum/shoulder injury",
        "February 2017: Revealed to have a torn labrum in his shoulder — but DELAYED surgery until after the NFL Combine",
        "Set NFL Combine record: 4.22-second 40-yard dash (fastest ever recorded at combine) — with shoulder surgery scheduled for days later",
        "Underwent labrum surgery March 14, 2017 — teams knew he might not be ready for training camp",
        "Injury concerns stopped some teams from considering him in round 1; Bengals took him #9 despite the medical red flags",
        "ESPN later reported that Ross admitted to CONCEALING the shoulder injury from the Bengals before they drafted him"
      ],
      draftImpact: "Fell from potential top-5 pick based on athleticism. Some teams completely removed him from their boards due to the injury history.",
      projectedWithoutInjury: "Top-5 pick based on record-setting speed and playmaking ability.",

      nflCareerSummary: "Never became the receiver teams hoped for. Spent most of 4 seasons on IR or limited by injuries. Total career: 74 receptions, 1,185 yards, 12 TDs in parts of 4 seasons.",
      nflInjuries: [
        "2017 (rookie): Placed on IR with shoulder injury in December — ended his first season",
        "2018: Missed 11 games with various injuries",
        "2019: Shoulder injury — missed multiple games",
        "2020: Cut by Bengals; brief stint with Giants",
        "His concealment of the shoulder injury pre-draft was confirmed when he admitted it publicly in 2017"
      ],
      gamesPlayed: 35,
      careerLength: "2017–2020 (4 seasons, limited availability)",
      verdictExplanation: "Perhaps the most alarming pre-draft medical profile of any top-10 pick. A torn ACL, two meniscus tears, microfracture surgery, AND a torn labrum — all before age 22. The concerns were validated immediately, as he barely played his rookie season. The fact that he concealed his shoulder injury from the team that drafted him adds an extraordinary layer to this case.",

      sources: [
        { text: "John Ross — Wikipedia", url: "https://en.wikipedia.org/wiki/John_Ross_(American_football)" },
        { text: "Ross admits to concealing shoulder injury — ESPN", url: "https://www.espn.com/nfl/story/_/id/21699662/cincinnati-bengals-wr-john-ross-admits-concealing-shoulder-injury-coach-says" },
        { text: "Ross shoulder surgery — Sports Naut", url: "https://sportsnaut.com/2017/06/john-ross-miss-start-training-camp-shoulder-injury/" }
      ]
    },

    {
      id: "treadwell-laquon",
      name: "Laquon Treadwell",
      pos: "WR",
      college: "Ole Miss",
      draftYear: 2016,
      pickNumber: 23,
      round: 1,
      team: "Minnesota Vikings",
      verdict: "MIXED",

      preDraftInjury: "Broken fibula and dislocated ankle suffered against Auburn in 2014 — required surgery with hardware insertion",
      preDraftDetails: [
        "2014 (vs. Auburn): Suffered a broken fibula and dislocated ankle — one of the more gruesome in-game injuries in recent SEC history",
        "Required surgery with screws/hardware to repair — missed remainder of 2014 season",
        "Returned to play in 2015 — posted solid numbers at Ole Miss",
        "Teams flagged the ankle/fibula history at combine medicals, noting hardware in the ankle",
        "Still selected #23 overall by Vikings — considered elite talent despite the injury flag"
      ],
      draftImpact: "Moderate — potentially cost him 5-10 draft spots from projected range.",
      projectedWithoutInjury: "Top-15 WR pick based on college production.",

      nflCareerSummary: "A significant NFL disappointment — but more due to lack of separation ability and poor scheme fit than recurring injuries. The ankle largely held up in the NFL. Played 4 seasons but only registered 56 career receptions.",
      nflInjuries: [
        "NFL ankle has not been the recurring problem teams feared — the hardware held",
        "Was primarily a bust due to route-running limitations and lack of NFL-caliber speed, not injuries",
        "Hamstring issues in 2017 limited him somewhat"
      ],
      gamesPlayed: 53,
      careerLength: "2016–2019 (4 seasons with Vikings and other teams)",
      verdictExplanation: "An interesting MIXED case where the pre-draft injury concern did NOT materialize into recurring NFL injuries — the ankle held up with the hardware. Treadwell was a bust, but it was athleticism and skill limitations, not health, that prevented his success. The injury concern was somewhat refuted on the specific ankle, yet he still failed as a draft pick.",

      sources: [
        { text: "Laquon Treadwell — Wikipedia", url: "https://en.wikipedia.org/wiki/Laquon_Treadwell" },
        { text: "2016 NFL Draft WR analysis — Pro Football Reference", url: "https://www.pro-football-reference.com/years/2016/draft.htm" }
      ]
    },

    // ══════════════════════════════════════════════════════════════════════════
    // TIGHT ENDS
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: "gronkowski-rob",
      name: "Rob Gronkowski",
      pos: "TE",
      college: "Arizona",
      draftYear: 2010,
      pickNumber: 42,
      round: 2,
      team: "New England Patriots",
      verdict: "MIXED",

      preDraftInjury: "Back surgery in 2009 — a ruptured disk causing nerve damage — caused him to miss his entire junior season at Arizona and fall from projected top-12 pick to 42nd overall",
      preDraftDetails: [
        "2009: Gronkowski suffered a ruptured disk in his back that caused nerve damage — missed his entire junior season at Arizona",
        "Doctors gave him a choice: rehab (possible return) or surgery (season over but better long-term outcome) — he chose surgery",
        "Pre-injury at Arizona: Was considered a top-12 pick, possibly top-8, according to pre-draft evaluations",
        "The back surgery caused all but a handful of teams to downgrade or remove him from round 1 boards",
        "Patriots traded up with Oakland Raiders to get him at #42 in round 2 — one of the greatest value picks in draft history"
      ],
      draftImpact: "Fell from projected top-12 to 42nd overall — lost an estimated $15-20M in first-round contract value.",
      projectedWithoutInjury: "Top-12, possibly top-8 overall selection.",

      nflCareerSummary: "Arguably the greatest TE in NFL history. 5 Super Bowls, 4 rings. 8 Pro Bowls, 5 first-team All-Pro. Career 621 receptions, 9,286 yards, 92 TDs. However, had multiple significant NFL injuries requiring numerous surgeries.",
      nflInjuries: [
        "2012: Broken forearm — missed 7 games",
        "2012: Re-broke same forearm — missed 4 games (same forearm, twice in one season)",
        "2013: Torn ACL and MCL — missed entire season",
        "2016: Hamstring, IR",
        "2019: Back again — required back surgery (the original problem area)",
        "2020: Multiple injuries with Tampa Bay but played through Super Bowl run",
        "Multiple surgeries: forearms, knee, back — at least 9 surgical procedures in his career"
      ],
      gamesPlayed: 143,
      careerLength: "2010–2021 (12 NFL seasons with retirement gaps)",
      verdictExplanation: "A MIXED verdict that leans toward the injury concern being valid but not career-limiting. The back surgery proved prescient — Gronkowski needed back surgery again in 2019. But the concern was wildly overstated given what he accomplished. He became the greatest TE of all time despite constant injuries. The Patriots' value pick at #42 is the greatest example of teams overreacting to pre-draft medical concerns in draft history.",

      sources: [
        { text: "Rob Gronkowski — Wikipedia", url: "https://en.wikipedia.org/wiki/Rob_Gronkowski" },
        { text: "Gronk opens up on college back injury — NBC Sports Boston", url: "https://www.nbcsportsboston.com/nfl/new-england-patriots/gronk-opens-up-on-college-back-injury-retirement-thoughts/368566/" },
        { text: "Kevin King, Gronkowski show risk-reward of medical red flags — Sports Illustrated", url: "https://www.si.com/nfl/packers/news/gronk-king-show-risk-reward-of-nfl-prospects-with-medical-red-flags" },
        { text: "Draft review: Rob Gronkowski — Rick Gosselin", url: "https://rickgosselin.com/draft-review-rob-gronkowski/" }
      ]
    },

    // ══════════════════════════════════════════════════════════════════════════
    // ADDITIONAL CASES
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: "williams-cadillac",
      name: "Carnell 'Cadillac' Williams",
      pos: "RB",
      college: "Auburn",
      draftYear: 2005,
      pickNumber: 5,
      round: 1,
      team: "Tampa Bay Buccaneers",
      verdict: "CONFIRMED",

      preDraftInjury: "Minor knee surgery at Auburn — flagged by some teams at the 2005 combine. Not a major red flag, but noted.",
      preDraftDetails: [
        "Had minor knee arthroscopy at Auburn — teams noted it at combine medicals",
        "Considered a clean bill of health overall; won NFL Offensive Rookie of the Year in 2005",
        "Pre-draft knee concern was considered minor — did not significantly impact his draft position"
      ],
      draftImpact: "Negligible — went #5 overall and signed a 5-year, $31M contract.",
      projectedWithoutInjury: "Same — was always a top-5 pick.",

      nflCareerSummary: "Outstanding rookie in 2005 before catastrophic patellar tendon injuries ended his career as a starter. Became the first NFL player ever to return from bilateral patellar tendon tears.",
      nflInjuries: [
        "October 2007: Torn RIGHT patellar tendon — required surgery, ended season",
        "December 2007: Torn LEFT patellar tendon — suffered in the final game of the same season",
        "Two patellar tendon tears in both knees within the same season — unprecedented",
        "2008: Missed entire season rehabbing both knees",
        "2009: Managed to return — made history as first player to recover from bilateral patellar tendon tears",
        "Career effectively limited to meaningful contributions only in 2005 and partial years after"
      ],
      gamesPlayed: 61,
      careerLength: "2005–2010 (6 seasons, significant playing time only in 2005)",
      verdictExplanation: "While the pre-draft knee concern was minor, the subsequent bilateral patellar tendon tears in 2007 suggest the knee tissue was vulnerable. Teams who flagged the minor arthroscopy may have been detecting an underlying vulnerability. The pre-draft concern was small but directionally correct about where the weakness lay.",

      sources: [
        { text: "Cadillac Williams — Wikipedia", url: "https://en.wikipedia.org/wiki/Cadillac_Williams" },
        { text: "Williams suffers torn patellar tendon — Yahoo Sports", url: "https://sports.yahoo.com/jc-williamsinjury093007.html" }
      ]
    },

    {
      id: "bush-michael",
      name: "Michael Bush",
      pos: "RB",
      college: "Louisville",
      draftYear: 2007,
      pickNumber: 100,
      round: 4,
      team: "Oakland Raiders",
      verdict: "REFUTED",

      preDraftInjury: "Broken leg (fibula and ankle) at Louisville in September 2004 — so severe it required multiple surgeries and cost him two full college seasons",
      preDraftDetails: [
        "September 2004: Suffered a severe broken leg (fibula fracture and ankle injury) in his freshman season at Louisville",
        "The injury was so severe it required multiple surgeries and caused him to miss 2004 and 2005 seasons entirely",
        "Only played college football for two effective seasons (2006-2007 after transfer/eligibility recovery)",
        "Teams flagged the leg as a significant medical concern; he fell to the 4th round (#100 overall) despite elite talent",
        "Was projected as a potential 2nd-round pick if healthy; the injury cost him ~$1-2M in draft money"
      ],
      draftImpact: "Fell from potential 2nd round to 100th overall — teams spooked by the severity of the leg fracture.",
      projectedWithoutInjury: "2nd-round pick based on size, speed, and production.",

      nflCareerSummary: "Solid 6-year NFL career as a power back with the Raiders and Bears (2007-2013). Rushed for 2,296 career yards and 20 TDs. The broken leg that scared teams largely healed without recurring problems.",
      nflInjuries: [
        "Relatively durable during NFL career — the leg that scared teams held up",
        "Limited by role as a backup/rotational back rather than by injuries",
        "No significant recurring leg problems from the college injury"
      ],
      gamesPlayed: 87,
      careerLength: "2007–2013 (6 solid seasons)",
      verdictExplanation: "A clear REFUTED case. Teams dramatically overreacted to the broken leg — Bush had a durable, productive 6-year NFL career. The specific injury that scared teams never became a recurring problem. This is the classic case of teams valuing a clean injury history over actual current health.",

      sources: [
        { text: "Michael Bush — Wikipedia", url: "https://en.wikipedia.org/wiki/Michael_Bush_(running_back)" },
        { text: "Michael Bush career stats — Pro Football Reference", url: "https://www.pro-football-reference.com/players/B/BushMi00.htm" }
      ]
    },

    {
      id: "harvin-percy",
      name: "Percy Harvin",
      pos: "WR",
      college: "Florida",
      draftYear: 2009,
      pickNumber: 22,
      round: 1,
      team: "Minnesota Vikings",
      verdict: "CONFIRMED",

      preDraftInjury: "Chronic migraine condition at Florida — teams flagged his neurological history at the 2009 combine as a potential durability concern",
      preDraftDetails: [
        "Suffered from debilitating migraine headaches at Florida — missed games and practices due to the condition",
        "Teams were split: was this a manageable medical condition or a career-threatening red flag?",
        "Some teams removed him from first-round consideration due to the migraine history",
        "Vikings drafted him 22nd overall, believing the condition was manageable",
        "Also had hip issues that were flagged at the combine"
      ],
      draftImpact: "Fell from potential top-12 pick based on talent to 22nd overall; some teams had him off their boards entirely.",
      projectedWithoutInjury: "Top-10 pick based on sheer athleticism and production at Florida.",

      nflCareerSummary: "Flashes of brilliance but career constantly derailed by migraines, hip surgery, ankle surgery, and concussions. Retired at 26 after 7 injury-plagued seasons.",
      nflInjuries: [
        "2009-2012: Migraines continued — missed multiple games each season",
        "2011: Hip surgery — missed most of season",
        "2013 (Seahawks): Ankle surgery — missed first 7 games",
        "2014: Concussion — placed on IR after 1 game with Jets; effectively ended career",
        "Retired at age 26 (after 2014 season) citing health concerns"
      ],
      gamesPlayed: 62,
      careerLength: "2009–2014 (7 seasons, retired at 26 due to health)",
      verdictExplanation: "The pre-draft migraine concern was just the beginning of a career-long pattern of multi-system health problems. While the migraines themselves were episodic, they were part of a broader pattern of fragility that included hip surgery, ankle surgery, and ultimately a concussion that ended his career at 26. The concern was directionally correct.",

      sources: [
        { text: "Percy Harvin — Wikipedia", url: "https://en.wikipedia.org/wiki/Percy_Harvin" },
        { text: "Percy Harvin career stats — Pro Football Reference", url: "https://www.pro-football-reference.com/players/H/HarvPe00.htm" }
      ]
    },

    {
      id: "ebron-eric",
      name: "Eric Ebron",
      pos: "TE",
      college: "North Carolina",
      draftYear: 2014,
      pickNumber: 10,
      round: 1,
      team: "Detroit Lions",
      verdict: "REFUTED",

      preDraftInjury: "Ankle surgery at North Carolina — flagged at combine medicals as a potential red flag for a receiving TE who relies on route running",
      preDraftDetails: [
        "Underwent ankle surgery at North Carolina — teams noted it at combine medicals",
        "Some teams had durability questions about his frame (6'4\", 250 lbs) but relatively lean for a TE",
        "The ankle concern was enough for some teams to downgrade him from a top-8 pick",
        "Lions took him 10th overall despite the flag"
      ],
      draftImpact: "Minor — may have slipped a few spots from the ankle flag.",
      projectedWithoutInjury: "Top-8 pick based on receiving ability.",

      nflCareerSummary: "7-year NFL career with Lions, Colts, Steelers, and Panthers. Best season in 2018 with Indianapolis (66 catches, 750 yards, 13 TDs — led the NFL in receiving TDs). The ankle concern did not materialize as a chronic problem.",
      nflInjuries: [
        "Ankle has not been a recurring issue in the NFL",
        "Had some hamstring and knee issues but largely durable throughout career",
        "Career longevity (7 seasons) suggests the pre-draft concern was overblown"
      ],
      gamesPlayed: 96,
      careerLength: "2014–2021 (7 seasons)",
      verdictExplanation: "A REFUTED case. The pre-draft ankle concern did not materialize into a chronic NFL problem. Ebron had a 7-year NFL career including a Pro Bowl-level 2018 season. Teams who downgraded him for the ankle were overly cautious.",

      sources: [
        { text: "Eric Ebron — Wikipedia", url: "https://en.wikipedia.org/wiki/Eric_Ebron" },
        { text: "Eric Ebron career stats — Pro Football Reference", url: "https://www.pro-football-reference.com/players/E/EbroEr00.htm" }
      ]
    },

    // ══════════════════════════════════════════════════════════════════════════
    // BATCH 2 ADDITIONS
    // ══════════════════════════════════════════════════════════════════════════
    {
      id: "carter-kijana",
      name: "Ki-Jana Carter",
      pos: "RB",
      college: "Penn State",
      draftYear: 1995,
      pickNumber: 1,
      round: 1,
      team: "Cincinnati Bengals",
      verdict: "CONFIRMED",

      preDraftInjury: "Strained right Achilles tendon flagged before the preseason — ignored by the Bengals, who had 'some injury issues in his past' per reporting at the time",
      preDraftDetails: [
        "The Bengals acknowledged being aware of 'some injury issues in his past' when they selected him #1 overall",
        "Strained his right Achilles tendon before preseason — missed Cincinnati's first two preseason games as a result",
        "Despite the Achilles concern, was viewed as the most dominant college back in years — 7.8 yards per carry, 23 TDs as a Penn State junior",
        "Bengals took him #1 overall, signing him to a 7-year, $19.2 million deal with a then-NFL-record $7.125 million signing bonus"
      ],
      draftImpact: "Achilles concern was flagged but overridden by his elite talent — still went #1 overall.",
      projectedWithoutInjury: "Same — was always the consensus #1 pick regardless of the Achilles.",

      nflCareerSummary: "One of the most catastrophic draft busts in NFL history — not due to talent but due to relentless injuries. In 7 NFL seasons, played just 59 games and rushed for 1,144 yards total. Played meaningful football for less than one full season combined.",
      nflInjuries: [
        "1995 preseason: Tore ACL in his LEFT knee on only his 3rd carry — missed entire rookie season",
        "1996: Returned but knee was never the same; limited role",
        "1997: Torn rotator cuff — missed most of season",
        "1998: Broken left wrist — missed games",
        "1999: Dislocated right kneecap — more missed time",
        "Seven seasons, five different significant injuries to multiple body parts"
      ],
      gamesPlayed: 59,
      careerLength: "1995–2001 (7 seasons, played meaningful football in fewer than 2)",
      verdictExplanation: "The pre-draft Achilles concern was a signal of a body prone to injury that the Bengals ignored due to elite talent. What followed was one of the most injury-cursed careers in NFL history — five different serious injuries to different body parts across seven seasons. The pre-draft flag was a small preview of a much larger pattern.",

      sources: [
        { text: "Ki-Jana Carter — Wikipedia", url: "https://en.wikipedia.org/wiki/Ki-Jana_Carter" },
        { text: "Ki-Jana Carter: Ready to Ramble — Sports Illustrated Vault 1996", url: "https://vault.si.com/vault/1996/06/24/ready-to-ramble-the-bengals-ki-jana-carter-his-first-year-erased-by-injury-is-jumping-back-into-the-fray" },
        { text: "Catching Up With Ki-Jana Carter — The Big Lead", url: "https://www.thebiglead.com/posts/catching-up-with-ki-jana-carter-who-went-from-penn-state-star-to-nfl-draft-bust-due-to-injuries-01dm8qesjf2r" }
      ]
    },

    {
      id: "metcalf-dk",
      name: "D.K. Metcalf",
      pos: "WR",
      college: "Ole Miss",
      draftYear: 2019,
      pickNumber: 64,
      round: 2,
      team: "Seattle Seahawks",
      verdict: "REFUTED",

      preDraftInjury: "Broken vertebra in his neck suffered October 13, 2018 against Alabama — surgeon initially told him he would never play football again",
      preDraftDetails: [
        "October 13, 2018: Tackled while returning a kickoff against Alabama; scans revealed a fractured vertebra in his neck",
        "Doctors initially told Metcalf he would never play football again — the injury was considered potentially career-ending and life-altering",
        "Underwent neck surgery in October 2018; cleared for all football activity January 25, 2019 — less than 3 months before the draft",
        "Had only played 21 games in 3 college seasons due to various injuries — the neck fracture was just the latest",
        "Ran a 4.33-second 40-yard dash at the combine despite the recent neck surgery, but durability questions lingered",
        "Multiple teams completely removed him from their first-round draft boards due to the neck surgery",
        "The Seahawks traded up to select him 64th overall — the 9th WR taken — despite his first-round talent"
      ],
      draftImpact: "Fell from projected top-10 pick to 64th overall — lost an estimated $15-20M due to neck injury concerns. Nine WRs were selected before him, most of whom were lesser talents.",
      projectedWithoutInjury: "Top-10 overall pick based on size (6'4\", 229 lbs), speed (4.33 40), and explosiveness.",

      nflCareerSummary: "Became one of the elite WRs in the NFL — multiple Pro Bowls, multiple 1,000-yard seasons, and a key piece of Seattle's offense for 6+ seasons. The neck injury that caused teams to pass on him has not been a recurring problem.",
      nflInjuries: [
        "2021: Knee injury required surgery — missed some time but returned",
        "The neck fracture has not recurred or caused chronic NFL problems",
        "Has been one of the more durable top WRs in the league relative to his concern level entering the draft"
      ],
      gamesPlayed: 102,
      careerLength: "2019–present (6+ seasons, multiple Pro Bowls)",
      verdictExplanation: "A clear REFUTED case — and one of the most dramatic in draft history. Teams who removed Metcalf from their boards due to a neck fracture missed out on a Pro Bowl receiver. His recovery was complete. The pre-draft concern, while medically legitimate, dramatically overstated the long-term risk. The Seahawks' willingness to take the risk at #64 is one of the great value picks of the modern era.",

      sources: [
        { text: "D.K. Metcalf — Wikipedia", url: "https://en.wikipedia.org/wiki/DK_Metcalf" },
        { text: "DK Metcalf out for season with neck injury — ESPN", url: "https://www.espn.com/college-football/story/_/id/24990276/ole-miss-wr-dk-metcalf-season-neck-injury" },
        { text: "Metcalf cleared for all activity after neck surgery — Bleacher Report", url: "https://bleacherreport.com/articles/2817617-nfl-draft-prospect-dk-metcalf-cleared-for-all-activity-after-neck-surgery" },
        { text: "How did NFL teams let DK Metcalf fall? — Bleacher Report", url: "https://bleacherreport.com/articles/2914427-scouts-take-how-did-nfl-teams-miss-and-let-dk-metcalf-fall-in-the-draft" },
        { text: "DK Metcalf overcame heartbreaking injury — Seattle Times", url: "https://www.seattletimes.com/sports/seahawks/how-receiver-dk-metcalf-overcame-a-heartbreaking-injury-to-become-a-seahawks-rookie-sensation/" }
      ]
    },

    {
      id: "williams-mike-wr",
      name: "Mike Williams",
      pos: "WR",
      college: "Clemson",
      draftYear: 2017,
      pickNumber: 7,
      round: 1,
      team: "Los Angeles Chargers",
      verdict: "CONFIRMED",

      preDraftInjury: "Herniated disk — reportedly sustained at or before the combine/pro day workouts but concealed so as not to affect his draft stock",
      preDraftDetails: [
        "A herniated disk was discovered at Williams' first rookie minicamp practice in May 2017 — but reports suggest the injury pre-dates his draft selection",
        "One source said 'it's possible the injury was sustained at the combine and during his pro day but he did a good enough job masking it so that teams would not know'",
        "Was selected 7th overall by the Chargers — the second WR taken in the 2017 draft — without the disk being disclosed",
        "At Clemson, Williams had missed the entire 2015 season due to a neck injury that required surgery (separate from the disk issue)",
        "The combination of a prior neck surgery at Clemson and a concealed herniated disk represents a significant undisclosed injury history"
      ],
      draftImpact: "Minimal at draft — went #7 overall. But the concealed disk meant the Chargers paid $17M+ guaranteed for a player with an undisclosed herniated disk.",
      projectedWithoutInjury: "Would still have been a top-10 pick based on Clemson production (National Championship, 98 catches).",

      nflCareerSummary: "Injury-defined career spanning 7 seasons with the Chargers, Buccaneers, Bears, and Saints. Had productive seasons (2018: 43 rec/664 yds, 2019: 49 rec/1,001 yds) but repeatedly lost to injury. Career ended with torn ACL in 2023.",
      nflInjuries: [
        "2017 (rookie): Herniated disk — inactive for first 6 games of season, returned limited",
        "2020: Torn ACL — missed most of season",
        "2022: Back fracture — back injuries continued to accumulate throughout career",
        "2023: Torn ACL — career-ending injury at age 28",
        "The back/disk that was present at draft has been a chronic issue throughout his NFL career"
      ],
      gamesPlayed: 78,
      careerLength: "2017–2023 (7 seasons, multiple IR stints)",
      verdictExplanation: "CONFIRMED — and made more troubling by the concealment. The herniated disk that was (reportedly) present at the draft became a recurring theme: Williams had back/disk issues through his NFL career and suffered multiple ACL tears. Like John Ross, the injury that teams didn't know about was already there when he was drafted. His career was repeatedly derailed by the very issues that pre-dated his selection.",

      sources: [
        { text: "Mike Williams WR — Wikipedia", url: "https://en.wikipedia.org/wiki/Mike_Williams_(wide_receiver,_born_1994)" },
        { text: "Chargers WR Williams might need season-ending back surgery — ESPN", url: "https://www.espn.com/nfl/story/_/id/20105594/mike-williams-los-angeles-chargers-need-surgery" },
        { text: "Mike Williams: Chargers Rookie Could Miss Season — Sports Illustrated", url: "https://www.si.com/nfl/2017/07/19/mike-williams-chargers-back-injury-update" },
        { text: "Mike Williams injury history — DraftSharks", url: "https://www.draftsharks.com/fantasy/injury-history/mike-williams/7759" }
      ]
    },

    {
      id: "rogers-charles",
      name: "Charles Rogers",
      pos: "WR",
      college: "Michigan State",
      draftYear: 2003,
      pickNumber: 2,
      round: 1,
      team: "Detroit Lions",
      verdict: "NOFLAG",

      preDraftInjury: "NONE — Rogers passed all pre-draft medicals. He is included as a counter-example: a player with a CLEAN bill of health whose NFL career was destroyed by injuries anyway.",
      preDraftDetails: [
        "Rogers had no documented pre-draft injury concerns — was viewed as a physically healthy, elite WR prospect",
        "At Michigan State: 2,821 career receiving yards and 27 receiving touchdowns in 3 seasons — no significant injury history",
        "Was considered one of the safest WR selections available — the Lions took him #2 overall, one pick ahead of future Hall of Famer Andre Johnson",
        "Detroit paid him as a franchise WR — his career collapse had nothing to do with pre-draft medical concerns",
        "LESSON: Even a clean medical record cannot predict future injury — Rogers illustrates the limits of pre-draft health evaluation"
      ],
      draftImpact: "No draft impact from medical concerns — went #2 overall as expected.",
      projectedWithoutInjury: "#2 overall — clean medicals did not change his trajectory.",

      nflCareerSummary: "One of the most devastating NFL busts — not because of character concerns flagged pre-draft, but because of injuries that could not have been predicted. In 3 seasons, played 15 games total. Never played again after being cut in 2005. Died in 2019 at age 38 following years of personal struggles stemming from the pain management addiction triggered by his injuries.",
      nflInjuries: [
        "2003 (Year 1): Broke his clavicle during a one-on-one drill in practice — missed the rest of the season after 5 games",
        "2004 (Year 2): Broke the EXACT SAME clavicle on the 3rd play of the season opener vs. Chicago Bears — missed entire season",
        "Two broken clavicles in the same location in back-to-back seasons — an extraordinary run of bad luck",
        "Pain management from repeated surgeries led to Vicodin addiction",
        "2005: Suspended 4 games for 3rd violation of NFL substance abuse policy",
        "Cut by Lions before 2006 — never played another NFL game; died at age 38 in 2019"
      ],
      gamesPlayed: 15,
      careerLength: "2003–2005 (3 seasons, 15 games total)",
      verdictExplanation: "The most important counter-example in this dataset. Rogers had NO pre-draft flag — and yet suffered one of the most catastrophic injury-driven career collapses in NFL history. This case is critical for the overall analysis: pre-draft medical evaluations cannot predict all forms of injury. A player can pass every physical and still have their career shattered by injuries the team could not have anticipated. The pre-draft exam is not a crystal ball.",

      sources: [
        { text: "Charles Rogers — Wikipedia", url: "https://en.wikipedia.org/wiki/Charles_Rogers_(wide_receiver)" },
        { text: "Charles Rogers' death: a tragic end — Sports Illustrated", url: "https://www.si.com/nfl/2019/11/12/charles-rogers-death-lions-michigan-state" },
        { text: "Rogers dies at 38 — CBS Sports", url: "https://www.cbssports.com/nfl/news/charles-rogers-the-second-overall-pick-in-the-2003-nfl-draft-by-the-lions-dies-at-age-38/" }
      ]
    },

    {
      id: "bridgewater-teddy",
      name: "Teddy Bridgewater",
      pos: "QB",
      college: "Louisville",
      draftYear: 2014,
      pickNumber: 32,
      round: 1,
      team: "Minnesota Vikings",
      verdict: "NOFLAG",

      preDraftInjury: "NONE — Bridgewater had a completely clean pre-draft medical record. Included as a counter-example: no warning signs could have predicted what happened next.",
      preDraftDetails: [
        "Had no documented pre-draft injury concerns at Louisville — was considered one of the healthier and more ready-to-start QB prospects in the 2014 class",
        "Selected 32nd overall by the Vikings as a franchise QB — no red flags",
        "Had two solid NFL seasons (2014-2015) with zero significant injury issues",
        "LESSON: Bridgewater's case is a cautionary tale about the limits of medical evaluation — his most devastating injury was a non-contact event in a routine practice"
      ],
      draftImpact: "No medical impact — went #32 overall as expected.",
      projectedWithoutInjury: "Same range — was always a late first-round QB.",

      nflCareerSummary: "Career defined by one of the most horrific non-contact injuries in NFL history. Missed nearly two full seasons recovering. Came back to play 8 total NFL seasons — including a 5-0 record as Saints starter in 2019 — but never recaptured franchise-QB status.",
      nflInjuries: [
        "August 30, 2016: Non-contact drill at Vikings practice — suffered dislocated knee, torn ACL, and 'other structural damage'",
        "Surgeons described the injury as 'a horribly grotesque injury... almost like a war wound. Everything is blown'",
        "Was at risk of amputation — surgeons monitored for arterial damage (no arterial damage confirmed)",
        "Missed entire 2016 season and most of 2017 season — nearly 2 years of recovery",
        "2020: Signed with Carolina Panthers; suffered torn ACL again in Week 2",
        "Two torn ACLs in his career — both completely unpredictable from any pre-draft evaluation"
      ],
      gamesPlayed: 68,
      careerLength: "2014–2022 (9 seasons, 2 lost to ACL tears)",
      verdictExplanation: "Bridgewater had a spotless medical record entering the NFL. His catastrophic 2016 non-contact injury — so severe surgeons feared amputation — is the clearest proof that pre-draft medical evaluation cannot prevent all devastating NFL injuries. He is included to provide analytical balance: a clean bill of health is not a guarantee of NFL durability.",

      sources: [
        { text: "Teddy Bridgewater — Wikipedia", url: "https://en.wikipedia.org/wiki/Teddy_Bridgewater" },
        { text: "'This can't be real': Reliving Bridgewater going down — ESPN", url: "https://www.espn.com/nfl/story/_/id/17906491/reliving-moment-minnesota-vikings-qb-teddy-bridgewater-went-2016-nfl" },
        { text: "Bridgewater dislocates knee, tears ACL in drill — ESPN", url: "https://www.espn.com/nfl/story/_/id/17424174/teddy-bridgewater-suffers-serious-knee-injury-minnesota-vikings-practice" },
        { text: "Bridgewater shares details of 2016 knee injury — The Viking Age", url: "https://thevikingage.com/teddy-bridgewater-new-details-2016-knee-injury-minnesota-vikings" }
      ]
    },

    {
      id: "butt-jake",
      name: "Jake Butt",
      pos: "TE",
      college: "Michigan",
      draftYear: 2017,
      pickNumber: 145,
      round: 5,
      team: "Denver Broncos",
      verdict: "CONFIRMED",

      preDraftInjury: "Torn ACL suffered in the Orange Bowl (January 3, 2017) — his third ACL tear across his college career, causing him to fall from a projected 2nd-round pick to the 5th round",
      preDraftDetails: [
        "January 3, 2017 (Orange Bowl vs. Florida State): Tore his ACL — his third ACL-related knee surgery including two in college",
        "Was considered the best TE in the 2017 draft class before the injury — consensus 2nd-round projection, some had him as late round 1",
        "Multiple teams refused to invest a meaningful draft pick in a player with three knee surgeries by age 22",
        "Denver Broncos took the risk at #145 in the 5th round — an extraordinary value pick in theory",
        "Also known for publicly advocating against playing in bowl games, calling the risk-reward calculation unfair to players whose draft stock depends on staying healthy"
      ],
      draftImpact: "Fell from projected 2nd round (or late 1st) to 145th overall — lost an estimated $2-4M in draft money due to the ACL.",
      projectedWithoutInjury: "Top-50 pick, possibly top-32, based on his consensus ranking as the best TE in the class.",

      nflCareerSummary: "Career never got started. In 4 seasons with Denver, played only 19 games. Suffered additional ACL tears in 2018 AND 2019 — a historic run of the same injury. Released by Broncos in 2021 with a career total of 19 catches and 164 yards.",
      nflInjuries: [
        "2017: Placed on IR before season — rehabbing the Orange Bowl ACL tear (missed entire rookie year)",
        "2018: Tore ACL again — missed most of season (3rd or 4th ACL surgery of his career)",
        "2019: Tore ACL AGAIN — missed most of season",
        "Released by Broncos in 2021; never played a meaningful NFL game",
        "Multiple ACL tears to the same knee — a pattern consistent with pre-draft injury history"
      ],
      gamesPlayed: 19,
      careerLength: "2017–2021 (4 seasons on roster, 19 career games)",
      verdictExplanation: "One of the most complete CONFIRMED cases in any position. Butt had already suffered multiple ACL injuries in college; the pre-draft warning signs were explicit and alarming. His NFL career was defined by the same knee repeatedly breaking down — the Orange Bowl tear was not an anomaly but part of a pattern that the pre-draft evaluation correctly identified. The Broncos' gamble failed completely.",

      sources: [
        { text: "Jake Butt — Wikipedia", url: "https://en.wikipedia.org/wiki/Jake_Butt" },
        { text: "Jaylon Smith, Jake Butt on skipping bowl games — Sports Illustrated", url: "https://www.si.com/nfl/2018/12/06/jaylon-smith-jake-butt-skipping-bowl-games-injuries-draft-mccaffrey-fournette" }
      ]
    },

    {
      id: "beckham-odell",
      name: "Odell Beckham Jr.",
      pos: "WR",
      college: "LSU",
      draftYear: 2014,
      pickNumber: 12,
      round: 1,
      team: "New York Giants",
      verdict: "NOFLAG",

      preDraftInjury: "NONE — Beckham had no documented pre-draft injury concerns. His hamstring injuries began AFTER the draft during rookie camp and pre-season. Included as a counter-example.",
      preDraftDetails: [
        "Was considered one of the cleanest medical prospects at WR in the 2014 class",
        "No injury flag from his time at LSU — was drafted 12th overall without any medical hesitation",
        "His hamstring issues began in June 2014 (post-draft) during rookie offseason workouts — not a pre-draft issue",
        "He later revealed he played his entire 2014 rookie season with TWO hamstring tears (semitendinosus and bicep belly) — both sustained post-draft",
        "LESSON: A player can be medically clean at the draft and still develop recurring injury issues that had no warning signs"
      ],
      draftImpact: "No medical impact — went #12 overall as a can't-miss prospect.",
      projectedWithoutInjury: "Same — #12 overall was always the floor for his talent level.",

      nflCareerSummary: "One of the most electrifying WRs in NFL history — famous one-handed catch, multiple Pro Bowls — but career repeatedly derailed by injuries across multiple teams. Four different NFL teams in 10 seasons.",
      nflInjuries: [
        "2014 (rookie): Two hamstring tears sustained post-draft — played through both all season",
        "2017: Fractured ankle (Jones fracture) in Week 5 — missed rest of season",
        "2020 (Browns): Torn ACL in Week 7 — missed rest of season",
        "2022 (Rams): Tore ACL AGAIN in Super Bowl LVI — suffered the injury while making a key 4th-quarter catch in the Rams' Super Bowl win",
        "Persistent bone-on-bone ankle issues drove his market value down significantly in free agency years"
      ],
      gamesPlayed: 96,
      careerLength: "2014–2023 (10 seasons, significant gaps due to injury)",
      verdictExplanation: "Beckham is one of the most compelling NOFLAG counter-examples. His pre-draft medical was clean — there was no warning the hamstring would become a recurring issue, or that he'd suffer two torn ACLs over his career. The pre-draft medical evaluation system simply cannot detect future susceptibility to soft tissue and joint injuries. OBJ's career proves that elite athletes with clean medicals are not immune to injury-defined careers.",

      sources: [
        { text: "Odell Beckham Jr. — Wikipedia", url: "https://en.wikipedia.org/wiki/Odell_Beckham_Jr." },
        { text: "Beckham admits playing with two hamstring tears in rookie season — Bleacher Report", url: "https://bleacherreport.com/articles/2279100-odell-beckham-admits-to-playing-with-two-tears-in-hamstring-during-rookie-season" },
        { text: "OBJ injury history — DraftSharks", url: "https://www.draftsharks.com/fantasy/injury-history/odell-beckham-jr/6942" }
      ]
    },

    {
      id: "nelson-jordy",
      name: "Jordy Nelson",
      pos: "WR",
      college: "Kansas State",
      draftYear: 2008,
      pickNumber: 36,
      round: 2,
      team: "Green Bay Packers",
      verdict: "NOFLAG",

      preDraftInjury: "NONE — Nelson had no pre-draft injury concerns. Selected in the 2nd round for talent reasons, not medical ones. Included as a counter-example of career-altering injury with no pre-draft warning.",
      preDraftDetails: [
        "Played for Kansas State with no documented significant injury history — was considered a physically durable route runner",
        "Fell to the 2nd round primarily due to questions about speed (4.51 40-yard dash) and competition level, not health",
        "Teams had no medical concerns about his knees, hamstrings, or any major injury risk",
        "Became Aaron Rodgers' most trusted receiver over 9 seasons — the pre-draft medical was simply not a factor"
      ],
      draftImpact: "2nd-round selection was about athletic profile (speed concerns), not injury history.",
      projectedWithoutInjury: "Same range — his draft position was determined by scheme fit and speed, not health.",

      nflCareerSummary: "One of Aaron Rodgers' most important weapons — multiple Pro Bowls, Super Bowl champion (XLV). Then suffered a devastating torn ACL in 2015 preseason that cost him an entire season. Came back and had one of the greatest WR comeback seasons in history in 2016 (97 catches, 1,257 yards, 14 TDs). Retired as a Packer after 2018.",
      nflInjuries: [
        "August 23, 2015: Torn ACL in preseason game vs. Pittsburgh Steelers — missed entire 2015 season",
        "The injury was a complete surprise — no history of knee issues heading into it",
        "2016: Full comeback — 97 catches, 1,257 yards, 14 TDs, one of the greatest WR comeback seasons ever",
        "No significant recurring knee issues after the recovery — the ACL held"
      ],
      gamesPlayed: 128,
      careerLength: "2008–2018 (11 seasons, 1 lost to ACL)",
      verdictExplanation: "Jordy Nelson is a NOFLAG success story — in the sense that a clean medical didn't prevent the devastating 2015 ACL tear, but also that the injury didn't permanently derail his career. His 2016 comeback season was legendary. Teams cannot detect all future ACL risk — and Nelson's case shows that even when a clean-medical player suffers a catastrophic injury, recovery is possible. Compare with Marcus Lattimore (pre-draft concern → never played) to see the full spectrum.",

      sources: [
        { text: "Jordy Nelson — Wikipedia", url: "https://en.wikipedia.org/wiki/Jordy_Nelson" },
        { text: "Jordy Nelson career stats — Pro Football Reference", url: "https://www.pro-football-reference.com/players/N/NelsJo00.htm" }
      ]
    }
  ],

  // ── Key findings for overview ──────────────────────────────────────────────
  findings: [
    { type: "confirmed", text: "Marcus Lattimore and Kevin White represent the most extreme CONFIRMED cases — both were potentially elite players whose careers were effectively ended before they began by pre-draft injuries." },
    { type: "confirmed", text: "Sam Bradford, Todd Gurley, and Dalvin Cook all had pre-draft ACL/knee concerns that became recurring NFL knee problems — the same joints kept breaking down." },
    { type: "refuted",   text: "Willis McGahee and Michael Bush show that teams can dramatically OVERREACT to one-time traumatic injuries — both had productive multi-year NFL careers despite catastrophic college injuries." },
    { type: "refuted",   text: "Rob Gronkowski is the most extreme case of teams overreacting to medical concerns. His back surgery caused him to fall to #42 — he went on to be arguably the greatest TE in NFL history." },
    { type: "neutral",   text: "Arian Foster is the most compelling undrafted case: his pre-draft back injury caused all 32 teams to pass on him, yet he became one of the top RBs of his era before injuries caught up with him at 30." },
    { type: "neutral",   text: "The data suggests a pattern: TRAUMATIC single injuries (broken bones, one-time ACLs) are often survivable. CHRONIC or REPEATED injuries to the same region are far more predictive of NFL problems." },
    { type: "confirmed", text: "John Ross's case adds a troubling dimension: he admitted to CONCEALING a torn labrum from the Bengals before being drafted 9th overall — the injury eventually ended his NFL career." },
    { type: "refuted",   text: "D.K. Metcalf is the most dramatic REFUTED case: a broken vertebra in his neck caused doctors to tell him he'd never play again and caused teams to remove him from first-round boards. He became a Pro Bowl receiver." },
    { type: "neutral",   text: "Charles Rogers (2003, #2 overall) is the most important COUNTER-EXAMPLE: he had a completely clean pre-draft medical record, yet broke the same clavicle twice in his first two NFL seasons, developed a Vicodin addiction, and died at 38. Pre-draft medicals cannot predict all injuries." },
    { type: "neutral",   text: "Ki-Jana Carter (1995, #1 overall) had a minor Achilles concern that the Bengals acknowledged and overrode — he tore his ACL on his 3rd carry in his first preseason game and suffered five separate significant injuries in 7 seasons." }
  ]
};
