/* Backtest the D/ST model against what defenses actually scored.
 *
 * The model prices a defense off the game line. Whether that is any good is an
 * empirical question, and Sleeper carries both the actual fantasy points and
 * the components, so it can be answered rather than assumed.
 */
const fs=require("fs");
const src=fs.readFileSync("lineup/app.js","utf8");
const g=(re)=>{const m=src.match(re); if(!m)throw new Error("MISS "+re); return m[0];};
const parts=[
 g(/const DST_TEAM_ALIASES = \{[\s\S]*?\};/),g(/function teamKey\(t\)[\s\S]*?\n  \}/),
 g(/function gameLineFor\(team\)[\s\S]*?\n  \}/),g(/const SCORE_SD = [\d.]+;/),
 g(/function normCdf\(x\)[\s\S]*?\n  \}/),g(/function bucketProbs\(mean\)[\s\S]*?\n  \}/),
 g(/function dstVolume\(spread\)[\s\S]*?\n  \}/),g(/function dstPoints\(team, scoring\)[\s\S]*?\n  \}/),
].join("\n");

// Standard-ish D/ST scoring, close to both leagues that use it.
const SCORING={raw:{pts_allow_0:10,pts_allow_1_6:7,pts_allow_7_13:4,pts_allow_14_20:1,
  pts_allow_21_27:0,pts_allow_28_34:-1,pts_allow_35p:-4,sack:1,int:2,fum_rec:2,
  def_td:6,def_st_td:6,safe:2,blk_kick:2,ff:0}};

const TEAMS=["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
 "HOU","IND","JAX","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG","NYJ","PHI",
 "PIT","SF","SEA","TB","TEN","WAS"];

(async()=>{
  const gl=JSON.parse(fs.readFileSync("nfl-props/gamelines.json","utf8"));
  const cache={gamelines:gl};
  const H=eval("(function(){const cache=arguments[0];"+parts+
    ";return{dstPoints}})")(cache);

  // Score every team off the CURRENT lines, then compare with what they did in
  // the most recent completed week. Not a clean backtest -- the lines are this
  // week's -- but it answers whether the model's spread of outputs matches the
  // spread of real D/ST scores, which is the part that would be obviously
  // wrong if the model were broken.
  // Ask Sleeper what week it is rather than hardcoding one. This read
  // `argv[2] || 2` with the season fixed at 2026, and run_all.js passes no
  // argument -- so it was backtesting week 2 while the season was on week 4, and
  // it would have broken outright in January.
  let season="2026", week=Number(process.argv[2]||0);
  try {
    const stt=await (await fetch("https://api.sleeper.app/v1/state/nfl")).json();
    if (stt && stt.season) season=String(stt.season);
    // The current week is in progress, so the most recent COMPLETED one is the
    // one before it. Week 1 in progress leaves nothing to backtest.
    if (!week && stt && stt.week) week=Math.max(1, Number(stt.week)-1);
  } catch { /* fall through to the default below */ }
  if (!week) week=2;
  // Pull every completed week, not only the latest. A single week is 32 numbers
  // and its spread swings a long way: pts-allowed SD measured 9.51, 10.00, 8.66
  // and 7.56 across weeks 1-4 of 2026, so testing SCORE_SD against whichever
  // week happens to be last is close to a coin flip. The pooled figure is a
  // claim worth asserting.
  const weeks=[];
  for (let w=1; w<=week; w++) {
    try {
      const r=await fetch(
        "https://api.sleeper.app/v1/stats/nfl/regular/"+season+"/"+w);
      const j=await r.json();
      if (j && Object.keys(j).length) weeks.push({week:w, stats:j});
    } catch { /* skip a week Sleeper will not serve */ }
  }
  if (!weeks.length) { console.error("no completed weeks available"); process.exit(1); }
  console.log("backtesting "+season+" weeks 1-"+week+
              " ("+weeks.length+" completed), components vs pooled actuals");
  const st=weeks[weeks.length-1].stats;

  const rows=[];
  for (const t of TEAMS) {
    const a=st[t];
    if (!a || a.pts_half_ppr==null) continue;
    const m=H.dstPoints(t,SCORING);
    if (!m) continue;
    rows.push({t, actual:a.pts_half_ppr, model:m.points,
      ptsAllow:a.pts_allow, sacks:a.sack||0,
      takeaways:(a.int||0)+(a.fum_rec||0),
      mSack:m.detail.sacks, mTO:m.detail.takeaways, mOpp:m.oppImplied});
  }
  if (!rows.length) { console.log("no completed week "+week+" data"); return; }

  const mean=(xs)=>xs.reduce((a,b)=>a+b,0)/xs.length;
  const sd=(xs)=>{const m=mean(xs);return Math.sqrt(mean(xs.map(x=>(x-m)**2)));};
  console.log("=== week "+week+", "+rows.length+" defenses ===");
  console.log("            mean    sd     min    max");
  for (const [lab,key] of [["actual","actual"],["model ","model"]]) {
    const v=rows.map(r=>r[key]);
    console.log(lab+"     "+mean(v).toFixed(2).padStart(6)+
      sd(v).toFixed(2).padStart(7)+Math.min(...v).toFixed(1).padStart(8)+
      Math.max(...v).toFixed(1).padStart(7));
  }
  console.log("");
  console.log("component reality check (actual vs what the model assumes):");
  console.log("  sacks      actual mean "+mean(rows.map(r=>r.sacks)).toFixed(2)+
    "   model mean "+mean(rows.map(r=>r.mSack)).toFixed(2));
  console.log("  takeaways  actual mean "+mean(rows.map(r=>r.takeaways)).toFixed(2)+
    "   model mean "+mean(rows.map(r=>r.mTO)).toFixed(2));
  console.log("  pts allow  actual mean "+mean(rows.map(r=>r.ptsAllow)).toFixed(2)+
    "   model implied mean "+mean(rows.map(r=>r.mOpp)).toFixed(2));
  // Per-week spreads, then the pooled one. Printing each keeps a genuine drift
  // over the season visible instead of averaging it into silence.
  const weekSDs=[];
  const pooledPtsAllow=[];
  for (const wk of weeks) {
    const vals=[];
    for (const t of TEAMS) {
      const a=wk.stats[t];
      if (a && a.pts_allow != null) vals.push(a.pts_allow);
    }
    if (vals.length) {
      weekSDs.push({week:wk.week, n:vals.length, sd:sd(vals)});
      for (const v of vals) pooledPtsAllow.push(v);
    }
  }
  console.log("  pts-allowed SD by week: "+
    weekSDs.map(w=>"wk"+w.week+" "+w.sd.toFixed(2)).join("  "));
  console.log("  pooled pts-allowed SD  "+sd(pooledPtsAllow).toFixed(2)+
    " over "+pooledPtsAllow.length+" team-games"+
    "   model assumes SCORE_SD "+(src.match(/const SCORE_SD = ([\d.]+)/)[1]));

  // The components are what the model actually claims. Its mean running a
  // little under actual is expected -- it cannot foresee a defensive
  // touchdown -- and its narrow spread is inherent to projecting off a game
  // line, so neither is asserted.
  let fail=0;
  const assert=(label,cond,detail)=>{
    if(cond){console.log("  ok    "+label);}
    else{fail++;console.log("  FAIL  "+label+(detail?"   -> "+detail:""));}
  };
  console.log("");
  const aSack=mean(rows.map(r=>r.sacks)), mSack=mean(rows.map(r=>r.mSack));
  const aTO=mean(rows.map(r=>r.takeaways)), mTO=mean(rows.map(r=>r.mTO));
  // Pooled, not single-week: see the comment above the fetch loop.
  const aSD=sd(pooledPtsAllow.length ? pooledPtsAllow : rows.map(r=>r.ptsAllow));
  const modelSD=Number(src.match(/const SCORE_SD = ([\d.]+)/)[1]);
  assert("sack baseline within 0.5 of actual", Math.abs(aSack-mSack)<0.5,
    aSack.toFixed(2)+" vs "+mSack.toFixed(2));
  assert("takeaway baseline within 0.5 of actual", Math.abs(aTO-mTO)<0.5,
    aTO.toFixed(2)+" vs "+mTO.toFixed(2));
  assert("SCORE_SD within 2 of pooled actual", Math.abs(aSD-modelSD)<2,
    aSD.toFixed(2)+" vs "+modelSD+
    " (per-week: "+weekSDs.map(w=>w.sd.toFixed(2)).join(", ")+")");
  assert("model mean is in the right neighbourhood",
    Math.abs(mean(rows.map(r=>r.actual))-mean(rows.map(r=>r.model)))<3,
    mean(rows.map(r=>r.actual)).toFixed(2)+" vs "+mean(rows.map(r=>r.model)).toFixed(2));
  assert("no defense projects negative", rows.every(r=>r.model>0));
  console.log("");
  console.log(fail?fail+" failed":"all checks passed");
  process.exit(fail?1:0);
})();
