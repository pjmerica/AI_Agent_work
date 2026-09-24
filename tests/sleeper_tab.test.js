/* Sleeper tab end-to-end, with live Sleeper calls allowed through. */
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = process.env.REPO_ROOT || process.cwd();
const html=fs.readFileSync(path.join(ROOT,"lineup/index.html"),"utf8");
const appSrc=fs.readFileSync(path.join(ROOT,"lineup/app.js"),"utf8");
const dataDir=path.join(ROOT,"nfl-props");
const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://x.test/lineup/",pretendToBeVisual:true});
const {window}=dom;
// Do the network work in Node and hand the page a plain {ok,status,json}.
// Returning undici's own Response across the jsdom boundary fails on body read.
window.fetch=async (u)=>{
  const str=String(u);
  if (str.startsWith("http")) {
    try {
      // Read as bytes and decode in Node. r.text() inside the jsdom realm was
      // handing back the raw compressed body.
      const r=await fetch(str,{headers:{"Accept-Encoding":"identity"}});
      const buf=Buffer.from(await r.arrayBuffer());
      const txt=buf.toString("utf8");
      console.log("[net] "+r.status+"  "+str.slice(0,60)+"  len="+txt.length);
      return { ok:r.ok, status:r.status,
               json:async()=>{ try { return JSON.parse(txt); } catch(e){ return null; } } };
    } catch (e) {
      console.log("[net ERR] "+str+"  "+e.message);
      return { ok:false, status:0, json:async()=>null };
    }
  }
  const n=str.split("/").pop().split("?")[0];
  const f=path.join(dataDir,n);
  if (fs.existsSync(f)) {
    const j=JSON.parse(fs.readFileSync(f,"utf8"));
    return { ok:true, status:200, json:async()=>j };
  }
  return { ok:false, status:404, json:async()=>null };
};
const errors=[];
window.addEventListener("error",(e)=>errors.push(String(e.error||e.message)));
window.eval(appSrc);
const $=(id)=>window.document.getElementById(id);
let pass=0,fail=0;
const check=(l,c,d)=>{ if(c){pass++;console.log("  ok    "+l);} else {fail++;console.log("  FAIL  "+l+(d?"   -> "+d:""));} };

setTimeout(async ()=>{
  // Switch to the Sleeper tab and sign in.
  const tabs=$("view-tabs").querySelectorAll(".view-tab");
  tabs[1].click();
  await new Promise(r=>setTimeout(r,400));
  $("sleeper-user").value="pjmerica";
  $("sleeper-go").click();
  await new Promise(r=>setTimeout(r,9000));

  console.log("=== sign in ===");
  const status=$("sleeper-status").textContent.trim();
  console.log("   status: "+status);
  const chips=[...$("sleeper-league-chips").querySelectorAll(".chip")];
  check("league chips appeared", chips.length>0, chips.length+" chips");
  chips.forEach(c=>console.log("   chip: "+c.textContent.trim()+
    "   [title: "+c.getAttribute("title")+"]"));

  console.log("");
  console.log("=== swap counts on chips ===");
  const withBadge=chips.filter(c=>c.querySelector(".chip-count")||c.querySelector(".chip-ok"));
  check("every chip shows a count or a tick", withBadge.length===chips.length,
    withBadge.length+" of "+chips.length);

  console.log("");
  console.log("=== lineup rendered ===");
  const out=$("sleeper-output").textContent.replace(/\s+/g," ").trim();
  check("a lineup table is present", !!$("sleeper-output").querySelector("table"),
    out.slice(0,80));
  const rows=$("sleeper-output").querySelectorAll("table tbody tr");
  check("slots filled", rows.length>0, rows.length+" rows");

  console.log("");
  console.log("=== chip count matches the visible SWAP IN tags ===");
  for (let i=0;i<chips.length;i++){
    const live=[...$("sleeper-league-chips").querySelectorAll(".chip")][i];
    const badge=live.querySelector(".chip-count");
    const claimed=badge?Number(badge.textContent):0;
    live.click();
    await new Promise(r=>setTimeout(r,250));
    const tags=$("sleeper-output").querySelectorAll("table tbody tr .injury-tag");
    const swaps=[...tags].filter(t=>/SWAP IN/.test(t.textContent)).length;
    check("league "+(i+1)+": chip says "+claimed+", table shows "+swaps,
      claimed===swaps, live.textContent.trim());
  }

  console.log("");
  console.log("=== switching to Root For/Against ===");
  tabs[2].click();
  await new Promise(r=>setTimeout(r,4000));
  const rt=$("rooting-output").textContent.replace(/\s+/g," ").trim();
  check("rooting rendered something", rt.length>40 && !/Sign in on the Sleeper/.test(rt),
    rt.slice(0,90));

  console.log("");
  console.log("uncaught errors: "+errors.length);
  errors.slice(0,6).forEach(e=>console.log("   "+e));
  console.log("");
  console.log(pass+" passed, "+fail+" failed");
  process.exit(fail?1:0);
},1500);
