/* Sign in from the Root For/Against tab, without touching the Sleeper tab. */
const fs=require("fs"),path=require("path"),zlib=require("zlib"),{JSDOM}=require("jsdom");
const ROOT=process.env.REPO_ROOT || process.cwd();
const html=fs.readFileSync(path.join(ROOT,"lineup/index.html"),"utf8");
const appSrc=fs.readFileSync(path.join(ROOT,"lineup/app.js"),"utf8");
const dataDir=path.join(ROOT,"nfl-props");
const store={};
const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://x.test/lineup/",pretendToBeVisual:true});
const {window}=dom;
// Start signed OUT: no saved username, so the only way in is this tab's form.
Object.defineProperty(window,"localStorage",{value:{
  getItem:(k)=>(k in store?store[k]:null),
  setItem:(k,v)=>{store[k]=String(v);},
  removeItem:(k)=>{delete store[k];},
}});
window.fetch=async(u)=>{
  const str=String(u);
  if (str.startsWith("http")) {
    try{
      const r=await fetch(str);
      let buf=Buffer.from(await r.arrayBuffer());
      if(buf.length>2&&buf[0]===0x1f&&buf[1]===0x8b) buf=zlib.gunzipSync(buf);
      const txt=buf.toString("utf8");
      return {ok:r.ok,status:r.status,json:async()=>{try{return JSON.parse(txt);}catch(e){return null;}}};
    }catch(e){ return {ok:false,status:0,json:async()=>null}; }
  }
  const n=str.split("/").pop().split("?")[0];
  const f=path.join(dataDir,n);
  if(fs.existsSync(f)){const j=JSON.parse(fs.readFileSync(f,"utf8"));
    return {ok:true,status:200,json:async()=>j};}
  return {ok:false,status:404,json:async()=>null};
};
const errors=[];
window.addEventListener("error",e=>errors.push(String(e.error||e.message)));
window.eval(appSrc);
const $=(id)=>window.document.getElementById(id);
let pass=0,fail=0;
const check=(l,c,d)=>{ if(c){pass++;console.log("  ok    "+l);}
  else{fail++;console.log("  FAIL  "+l+(d?"   -> "+d:""));} };

setTimeout(async()=>{
  const tabs=[...window.document.querySelectorAll(".view-tab")];
  console.log("=== the rooting tab has its own sign-in ===");
  ["rooting-user","rooting-go","rooting-forget","rooting-status"].forEach(
    id=>check(id+" exists", !!$(id)));

  // Go straight to Root For/Against, never visiting the Sleeper tab.
  tabs[2].click();
  await new Promise(r=>setTimeout(r,900));
  check("signed-out message does not send you elsewhere",
    !/Sleeper tab/i.test($("rooting-output").textContent),
    $("rooting-output").textContent.trim().slice(0,70));
  check("Sign out is hidden while signed out", $("rooting-forget").hidden);

  console.log("");
  console.log("=== sign in from this tab ===");
  $("rooting-user").value="pjmerica";
  $("rooting-go").click();
  await new Promise(r=>setTimeout(r,11000));
  const status=$("rooting-status").textContent.trim();
  console.log("   rooting status: "+status);
  check("signed in", /Signed in as/i.test(status), status);
  check("the OTHER tab's status says so too",
    /Signed in as/i.test($("sleeper-status").textContent), $("sleeper-status").textContent);
  check("the other tab's box is filled in",
    $("sleeper-user").value.length>0, JSON.stringify($("sleeper-user").value));
  check("Sign out is now offered on both",
    !$("rooting-forget").hidden && !$("sleeper-forget").hidden);
  const out=$("rooting-output").textContent.replace(/\s+/g," ").trim();
  check("rooting list rendered", out.length>60 && !/Enter a Sleeper/.test(out),
    out.slice(0,80));
  check("it names players to root for", /Root FOR/i.test(out), out.slice(0,60));

  console.log("");
  console.log("=== the Sleeper tab works off the same session ===");
  tabs[1].click();
  await new Promise(r=>setTimeout(r,1200));
  const chips=$("sleeper-league-chips").querySelectorAll(".chip");
  check("league chips are there without signing in again", chips.length>0,
    chips.length+" chips");

  console.log("");
  console.log("=== sign out from the rooting tab clears both ===");
  tabs[2].click();
  await new Promise(r=>setTimeout(r,400));
  $("rooting-forget").click();
  await new Promise(r=>setTimeout(r,400));
  check("both Sign out buttons hidden again",
    $("rooting-forget").hidden && $("sleeper-forget").hidden);
  check("both boxes cleared",
    $("rooting-user").value==="" && $("sleeper-user").value==="");
  check("rooting output reset",
    /Enter a Sleeper username/.test($("rooting-output").textContent));
  check("saved username removed", store["nflprops.sleeperUser"]===undefined,
    JSON.stringify(store));

  console.log("");
  console.log("uncaught errors: "+errors.length);
  errors.slice(0,5).forEach(e=>console.log("   "+e));
  console.log("");
  console.log(pass+" passed, "+fail+" failed");
  process.exit(fail||errors.length?1:0);
},1500);
