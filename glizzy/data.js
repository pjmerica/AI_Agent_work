// The Definitive Glizzy Ranking System — restaurant + city data

const RESTAURANTS = [
  // ── New York ────────────────────────────────────────────────────────────
  { id:1,  name:"Nathan's Famous", city:"New York", state:"NY", style:"Classic NYC", year:1916, sources:9, awards:"Iconic", notes:"Annual July 4th eating contest; nationwide chain spawned from Coney Island original." },
  { id:2,  name:"Papaya King", city:"New York", state:"NY", style:"Classic NYC", year:1932, sources:8, awards:"NYC Institution", notes:"Manhattan institution; served with kraut, onions, or relish; reopened near original Upper East Side location." },
  { id:3,  name:"Katz's Delicatessen", city:"New York", state:"NY", style:"Classic NYC", year:1888, sources:6, awards:"NYC Landmark", notes:"All-beef frankfurter seasoned with salt, paprika, garlic; lightly charred for snap." },
  { id:4,  name:"Gray's Papaya", city:"New York", state:"NY", style:"Classic NYC", year:1973, sources:7, awards:"NYC Icon", notes:"Famous Recession Special; 24/7 hot dogs with papaya drink; West 72nd St staple." },

  // ── Chicago ─────────────────────────────────────────────────────────────
  { id:5,  name:"Portillo's", city:"Chicago", state:"IL", style:"Chicago-style", year:1963, sources:10, awards:"Best Chicago Dog", notes:"Jumbo Hot Dog; mustard, relish, chopped onions, tomato, sport peppers, pickles, steamed poppy seed bun." },
  { id:6,  name:"Superdawg Drive-In", city:"Chicago", state:"IL", style:"Chicago-style", year:1948, sources:8, awards:"Chicago Classic", notes:"Iconic rooftop hot dog mascots; Vienna Beef dog in a grease-free bag; family owned since 1948." },
  { id:7,  name:"Gene & Jude's", city:"River Grove", state:"IL", style:"Chicago-style", year:1945, sources:8, awards:"James Beard Semifinalist", notes:"No ketchup ever. Depression dog: mustard, relish, onions, sport peppers, fries in the bun." },
  { id:8,  name:"Wiener's Circle", city:"Chicago", state:"IL", style:"Chicago-style", year:1983, sources:7, awards:"Best Late Night", notes:"Famous for rude service and char dogs; late-night institution on Clark St." },
  { id:9,  name:"35th Street Red Hots", city:"Chicago", state:"IL", style:"Chicago-style", year:1990, sources:5, awards:"", notes:"Juicy, beefy Chicago dog with mustard, relish, sport peppers, onions." },
  { id:10, name:"Byron's Hot Dogs", city:"Chicago", state:"IL", style:"Chicago-style", year:1979, sources:5, awards:"", notes:"Multiple locations; classic Chicago steamed dog; poppy seed bun staple." },

  // ── Detroit / Michigan ───────────────────────────────────────────────────
  { id:11, name:"American Coney Island", city:"Detroit", state:"MI", style:"Coney Island", year:1917, sources:9, awards:"National Historic Landmark", notes:"Original Coney; steamed bun, beef heart chili sauce, mustard, onions; est. 1917." },
  { id:12, name:"Lafayette Coney Island", city:"Detroit", state:"MI", style:"Coney Island", year:1924, sources:9, awards:"Detroit Icon", notes:"Side-by-side rival with American Coney Island; same family recipe; fierce local loyalty." },

  // ── Washington D.C. ──────────────────────────────────────────────────────
  { id:13, name:"Ben's Chili Bowl", city:"Washington", state:"DC", style:"Half Smoke", year:1958, sources:9, awards:"James Beard America's Classic", notes:"Pork/beef half smoke with chili; on U Street since 1958; Netflix's Somebody Feed Phil." },

  // ── Los Angeles ──────────────────────────────────────────────────────────
  { id:14, name:"Pink's Hot Dogs", city:"Los Angeles", state:"CA", style:"LA-Style Loaded", year:1939, sources:9, awards:"LA Icon", notes:"Est. 1939; 17 dogs including celebrity-named options; corner of La Brea and Melrose." },
  { id:15, name:"Wurstküche", city:"Los Angeles", state:"CA", style:"Gourmet/Exotic", year:2008, sources:6, awards:"", notes:"Three menus: classics, gourmet, exotics; Rattlesnake & Rabbit dog; five mustard choices." },

  // ── Tucson / Arizona ─────────────────────────────────────────────────────
  { id:16, name:"El Guero Canelo", city:"Tucson", state:"AZ", style:"Sonoran", year:1993, sources:9, awards:"James Beard America's Classic 2018", notes:"Bolillo rolls from Mexico; bacon-wrapped dog, beans, mayo, mustard, tomatoes." },
  { id:17, name:"Short Leash Hotdogs", city:"Phoenix", state:"AZ", style:"Creative", year:2011, sources:5, awards:"", notes:"Served in naan bread; Oliver dog, Poutine Dog with fries, cheese curds, gravy." },

  // ── Austin / Texas ────────────────────────────────────────────────────────
  { id:18, name:"T-Loc's Sonora Hot Dogs", city:"Austin", state:"TX", style:"Sonoran", year:2010, sources:6, awards:"", notes:"Bolillo bread flown from Tucson; sausage, beans, jalapeño sauce, mustard, tomatoes." },
  { id:19, name:"Alamo Hot Dog Company", city:"San Antonio", state:"TX", style:"Street Cart", year:2005, sources:4, awards:"", notes:"Red umbrella cart; sautéed toppings; evening hours only." },

  // ── New Jersey ────────────────────────────────────────────────────────────
  { id:20, name:"Rutt's Hut", city:"Clifton", state:"NJ", style:"Deep-Fried Ripper", year:1928, sources:8, awards:"NJ Landmark", notes:"Deep-fried until skin rips; 'ripper'; served with homemade relish; est. 1928." },
  { id:21, name:"Johnny & Hanges", city:"Paterson", state:"NJ", style:"Deep-Fried Ripper", year:1942, sources:5, awards:"", notes:"NJ-style deep-fried dog; old-school stand." },

  // ── Providence, Rhode Island ──────────────────────────────────────────────
  { id:22, name:"Olneyville New York System", city:"Providence", state:"RI", style:"NY System (Hot Wieners)", year:1946, sources:7, awards:"RI Icon", notes:"Celery salt, mustard, meat sauce, onions on a wiener; RI cult classic." },

  // ── Atlanta ───────────────────────────────────────────────────────────────
  { id:23, name:"The Varsity", city:"Atlanta", state:"GA", style:"Chili Dog", year:1928, sources:8, awards:"World's Largest Drive-In", notes:"Est. 1928; seats 800; chili dog, cheese dog, chili cheese slaw dog; eight locations." },

  // ── New Orleans ───────────────────────────────────────────────────────────
  { id:24, name:"Dat Dog", city:"New Orleans", state:"LA", style:"Creative Regional", year:2011, sources:6, awards:"", notes:"Nine house specials including alligator/crawfish dog; Chicago-style; vegan option." },

  // ── Baltimore ─────────────────────────────────────────────────────────────
  { id:25, name:"Stuggy's", city:"Baltimore", state:"MD", style:"Creative/Gourmet", year:2010, sources:5, awards:"", notes:"Wagyu, all-beef, turkey, vegan; Frank Zappa dog; Crab Mac N Cheese dog with Old Bay." },

  // ── Denver ────────────────────────────────────────────────────────────────
  { id:26, name:"Biker Jim's Gourmet Dogs", city:"Denver", state:"CO", style:"Exotic Game", year:2005, sources:8, awards:"Anthony Bourdain Featured", notes:"Reindeer, ostrich, rattlesnake, rabbit dogs; cream cheese and caramelized onions. Featured on No Reservations." },

  // ── Milwaukee ─────────────────────────────────────────────────────────────
  { id:27, name:"The Vanguard", city:"Milwaukee", state:"WI", style:"Milwaukee-Style", year:2013, sources:6, awards:"", notes:"Sausage bar; cheese curds, Cheez Whiz toppings; craft beer pairings." },

  // ── Fort Wayne, Indiana ───────────────────────────────────────────────────
  { id:28, name:"Fort Wayne's Famous Coney Island Wiener Stand", city:"Fort Wayne", state:"IN", style:"Coney Island", year:1914, sources:7, awards:"Oldest Coney Stand in America", notes:"Opened 1914; house-made Coney sauce, mustard, onions; 900,000 served annually." },

  // ── Cincinnati ────────────────────────────────────────────────────────────
  { id:29, name:"Skyline Chili", city:"Cincinnati", state:"OH", style:"Cincinnati Coney", year:1949, sources:7, awards:"Cincinnati Icon", notes:"Cincinnati-style: chili over dog; 3-way with spaghetti; cult following." },
  { id:30, name:"Gold Star Chili", city:"Cincinnati", state:"OH", style:"Cincinnati Coney", year:1965, sources:5, awards:"", notes:"Cincinnati competitor to Skyline; similar Coney dog with distinctive chili blend." },

  // ── Boston / Massachusetts ─────────────────────────────────────────────────
  { id:31, name:"Casey's Diner", city:"Natick", state:"MA", style:"New England Steamed", year:1922, sources:7, awards:"National Register of Historic Places", notes:"10-stool dining car; steamed 'all around' with relish, onions, mustard; est. 1922." },
  { id:32, name:"Simones' Hot Dog Stand", city:"Lewiston", state:"ME", style:"New England Steamed", year:1927, sources:5, awards:"", notes:"Steamed dogs in split-top buns; New England tradition." },

  // ── Hawaii ────────────────────────────────────────────────────────────────
  { id:33, name:"Puka Dog", city:"Koloa", state:"HI", style:"Hawaiian Puka", year:2002, sources:6, awards:"Unique Style Award", notes:"Bun with hole through middle; Polish or veggie; garlic lemon sauce; tropical mango relish." },

  // ── Nashville ─────────────────────────────────────────────────────────────
  { id:34, name:"D & B's Hot Dogs", city:"Knoxville", state:"TN", style:"Loaded Southern", year:2008, sources:4, awards:"", notes:"Wagon dog with bacon, chili, fried potatoes, sour cream, onions, cheese." },

  // ── Las Vegas ─────────────────────────────────────────────────────────────
  { id:35, name:"Buldogis Gourmet Hot Dogs", city:"Las Vegas", state:"NV", style:"Korean/Vietnamese Fusion", year:2011, sources:5, awards:"", notes:"Banh Mi Dog, Angry Kimchi with spicy pork bulgogi and Asian slaw." },

  // ── Raleigh ───────────────────────────────────────────────────────────────
  { id:36, name:"The Roast Grill", city:"Raleigh", state:"NC", style:"Charred Classic", year:1940, sources:6, awards:"NC Landmark", notes:"Grilled to char; chili or slaw; serves nothing else; cash only; beloved institution." },

  // ── Minneapolis ───────────────────────────────────────────────────────────
  { id:37, name:"Uncle Franky's", city:"Minneapolis", state:"MN", style:"Chicago/Coney", year:2004, sources:4, awards:"", notes:"Chicago dog, Coney Island chili dog, Carolina slaw dog." },

  // ── Richmond ──────────────────────────────────────────────────────────────
  { id:38, name:"City Dogs", city:"Richmond", state:"VA", style:"Regional American", year:2007, sources:5, awards:"", notes:"Each dog inspired by a U.S. state recipe; Richmond Original served all the way." },

  // ── Miami ─────────────────────────────────────────────────────────────────
  { id:39, name:"Dogma Grill", city:"Miami", state:"FL", style:"13 Varieties", year:1995, sources:5, awards:"", notes:"NYC Pushcart and Tropical (Colombian-style) dogs; walk-up in MiMo District." },

  // ── West Virginia ─────────────────────────────────────────────────────────
  { id:40, name:"Hillbilly Hot Dogs", city:"Lesage", state:"WV", style:"Novelty/Loaded", year:2000, sources:5, awards:"Travel Channel Featured", notes:"Scott's Man on Fire; 15-inch dog; Travel Channel appearance; wacky outdoor setting." },

  // ── Albuquerque ───────────────────────────────────────────────────────────
  { id:41, name:"Urban Hotdog Company", city:"Albuquerque", state:"NM", style:"Creative", year:2012, sources:4, awards:"", notes:"Potato-wrapped sausage, Guinness-soaked bratwurst, Polish sausage." },

  // ── Birmingham ────────────────────────────────────────────────────────────
  { id:42, name:"Gus's Hot Dogs", city:"Birmingham", state:"AL", style:"Southern Slaw/Chili", year:1947, sources:5, awards:"", notes:"Est. 1947; slaw dog, relish dog, chili dog; Alabama institution." },

  // ── Kansas City Area ──────────────────────────────────────────────────────
  { id:43, name:"Wiener Kitchen", city:"Overland Park", state:"KS", style:"House-Made Sausage", year:2009, sources:4, awards:"", notes:"Chicken Apple sausage; classic chili cheese dog with chorizo and black bean chili." },

  // ── Anchorage ─────────────────────────────────────────────────────────────
  { id:44, name:"International House of Hot Dogs", city:"Anchorage", state:"AK", style:"Varied/Exotic", year:2006, sources:4, awards:"", notes:"Beef, buffalo, reindeer Polish sausage; chipotle sauce; only hot dog shop in Alaska." },

  // ── South Carolina ────────────────────────────────────────────────────────
  { id:45, name:"Jack's Cosmic Dogs", city:"Mt. Pleasant", state:"SC", style:"Southern Classic", year:2002, sources:5, awards:"", notes:"Cosmic Dog with sweet mustard and house-special blue cheese slaw; local legend." },

  // ── Extra well-known spots ─────────────────────────────────────────────────
  { id:46, name:"Shake Shack (Original)", city:"New York", state:"NY", style:"Classic NYC", year:2004, sources:7, awards:"Best Chain Dog", notes:"Madison Square Park original; all-beef snappy dog; grew to global chain." },
  { id:47, name:"Chicago's Dog House", city:"Chicago", state:"IL", style:"Chicago-style", year:2012, sources:5, awards:"", notes:"Vienna Beef dogs; Chicago-style and Depression dogs; Navy Pier area." },
  { id:48, name:"Flo's Hot Dogs", city:"Cape Neddick", state:"ME", style:"New England Steamed", year:1959, sources:6, awards:"New England Icon", notes:"Est. 1959; seasonal; secret relish recipe; pilgrimage spot for hot dog lovers." },
  { id:49, name:"Yesterdog", city:"Grand Rapids", state:"MI", style:"Classic Coney", year:1976, sources:5, awards:"", notes:"Bohemian hot dog joint; tiny space; dog dressed any way you want; cash only." },
  { id:50, name:"Lucky Louie's Beer & Wieners", city:"Erie", state:"PA", style:"Regional Variety", year:2015, sources:4, awards:"", notes:"Seattle Slew, Greek dog; uses Smith's Pennsylvania wieners; craft beer pairings." },
];

// ── City scoring metric ─────────────────────────────────────────────────────
// GLIZZY SCORE = weighted sum of:
//   spotCount    × 12  (number of notable spots)
//   avgSources   × 8   (avg cross-source citations per spot — quality signal)
//   stylePoints  × 6   (does the city have its OWN iconic style?)
//   oldestYear   × 4   (heritage: normalised inverse of oldest spot year)
//   awardsCount  × 5   (James Beard, landmarks, etc.)

const CITIES_RAW = [
  { city:"Chicago", state:"IL",      stylePoints:10, ownStyle:"Chicago-style (Vienna Beef, sport peppers, poppy seed bun, no ketchup)", description:"The mecca. Home of the Chicago Dog, a religious experience in a bun. Ketchup is a crime here." },
  { city:"New York", state:"NY",     stylePoints:8,  ownStyle:"NYC-style (all-beef frank, natural casing snap)", description:"The birthplace of the American hot dog as street food. Gray's Papaya, Nathan's, and a frank on every corner." },
  { city:"Detroit", state:"MI",      stylePoints:9,  ownStyle:"Michigan Coney (beef heart chili, mustard, onions)", description:"Two legendary rivals — American and Lafayette — face off 24/7. The Coney Dog is Detroit's soul food." },
  { city:"Washington DC", state:"DC",stylePoints:7,  ownStyle:"Half Smoke (pork/beef blend with chili)", description:"Ben's Chili Bowl has been feeding everyone from LBJ to Obama since 1958." },
  { city:"Tucson/Phoenix", state:"AZ",stylePoints:9, ownStyle:"Sonoran (bacon-wrapped, bolillo roll, beans, mayo)", description:"The Sonoran dog is its own religion — a James Beard winner wrapped in bacon tucked in a bolillo." },
  { city:"Cincinnati", state:"OH",   stylePoints:8,  ownStyle:"Cincinnati Coney (chili, mustard, onions on dog)", description:"Cincinnati chili is polarising. On a hot dog, it's transcendent. Skyline is the church." },
  { city:"Providence", state:"RI",   stylePoints:7,  ownStyle:"NY System Hot Wiener (celery salt, meat sauce)", description:"The hot wiener is Rhode Island's best-kept secret. Tiny, snappy, loaded with celery salt." },
  { city:"Denver", state:"CO",       stylePoints:6,  ownStyle:"Exotic Game Dogs", description:"Biker Jim's put Denver on the glizzy map. Reindeer and rattlesnake dogs? Anthony Bourdain approved." },
  { city:"Atlanta", state:"GA",      stylePoints:5,  ownStyle:"Southern Chili Dog", description:"The Varsity is the world's largest drive-in and a Georgia institution since 1928." },
  { city:"Los Angeles", state:"CA",  stylePoints:5,  ownStyle:"LA Loaded (celebrity dogs)", description:"Pink's and Wurstküche keep LA on the map. Not a hot dog city by nature, but influential." },
  { city:"New Orleans", state:"LA",  stylePoints:5,  ownStyle:"Creative Cajun", description:"Dat Dog does what New Orleans does best — takes a classic and makes it swampy and delicious." },
  { city:"Milwaukee", state:"WI",    stylePoints:5,  ownStyle:"Bratwurst-adjacent sausage bar", description:"The Vanguard bridges the gap between hot dog and brat. Cheese curds on everything." },
  { city:"Fort Wayne", state:"IN",   stylePoints:6,  ownStyle:"Coney Island (oldest in America)", description:"Home to the oldest continuously operating Coney stand in America. Est. 1914." },
  { city:"Raleigh", state:"NC",      stylePoints:5,  ownStyle:"Charred Classic", description:"The Roast Grill serves nothing but hot dogs, charred to perfection, since 1940." },
  { city:"Baltimore", state:"MD",    stylePoints:4,  ownStyle:"Creative/Seafood Fusion", description:"Stuggy's puts Old Bay and crab on a dog. Only in Baltimore." },
];

window.GLIZZY_DATA = { RESTAURANTS, CITIES_RAW };
