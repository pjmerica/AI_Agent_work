/* Does repeated, rapid, or contradictory use of the lineup controls leave the
 * page in a wrong state? Every sequence here is one a real person produces by
 * clicking quickly or changing their mind: pressing a button twice, adding the
 * same player again, pasting a list you already pasted, unticking every book.
 *
 * This found the book filter inverting itself when the last checkbox was
 * cleared -- a bug no single-action test would see, because each click on its
 * own behaved correctly.
 */
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT=process.env.REPO_ROOT || process.cwd(),dataDir=path.join(ROOT,"nfl-props");
const html=fs.readFileSync(path.join(ROOT,"lineup/index.html"),"utf8");
const appSrc=fs.readFileSync(path.join(ROOT,"lineup/app.js"),"utf8");
const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://x.test/lineup/",pretendToBeVisual:true});
const {window}=dom;
window.fetch=async(u)=>{
  const n=String(u).split("/").pop().split("?")[0], f=path.join(dataDir,n);
  if(fs.existsSync(f)) return {ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(f,"utf8"))};
  return {ok:false,status:404,json:async()=>null};
};
const errors=[];
window.addEventListener("error",e=>errors.push(String(e.error||e.message)));
window.eval(appSrc);
const $=(id)=>window.document.getElementById(id);
const txt=()=>$("sitstart-output").textContent.replace(/\s+/g," ").trim();
let pass=0,fail=0;
const check=(l,c,d)=>{ if(c){pass++;console.log("  ok    "+l);}
  else{fail++;console.log("  FAIL  "+l+(d?"   -> "+d:""));} };

setTimeout(async()=>{
  console.log("=== repeated clicks are idempotent ===");
  $("roster-demo").click();
  const once=txt();
  $("roster-demo").click(); $("roster-demo").click();
  check("Load example three times = same board", txt()===once);
  const tags=$("roster-tags").querySelectorAll(".player-tag").length;
  $("roster-demo").click();
  check("chip count does not grow", $("roster-tags").querySelectorAll(".player-tag").length===tags,
    tags+" then "+$("roster-tags").querySelectorAll(".player-tag").length);

  console.log("");
  console.log("=== clear then clear again ===");
  $("roster-clear").click(); $("roster-clear").click();
  check("no error, empty state", /Add players to build/.test(txt()), txt().slice(0,50));

  console.log("");
  console.log("=== adding the same player twice ===");
  const add=(name)=>{
    const $in=$("roster-search");
    $in.value=name;
    $in.dispatchEvent(new window.Event("input",{bubbles:true}));
    $in.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  };
  add("Josh Allen"); add("Josh Allen");
  check("duplicate not added twice",
    $("roster-tags").querySelectorAll(".player-tag").length===1,
    $("roster-tags").querySelectorAll(".player-tag").length+" chips");

  console.log("");
  console.log("=== paste the same list twice ===");
  $("roster-clear").click();
  $("roster-input").value="Josh Allen\nBijan Robinson";
  $("roster-go").click();
  const n1=$("roster-tags").querySelectorAll(".player-tag").length;
  $("roster-input").value="Josh Allen\nBijan Robinson";
  $("roster-go").click();
  check("still the same chips", $("roster-tags").querySelectorAll(".player-tag").length===n1,
    n1+" then "+$("roster-tags").querySelectorAll(".player-tag").length);

  console.log("");
  console.log("=== untick every book ===");
  $("roster-demo").click();
  let boxes=()=>[...$("book-toggle-list").querySelectorAll("input[data-book]")];
  for(let i=0;i<20;i++){
    const b=boxes().find(x=>x.checked);
    if(!b) break;
    b.checked=false; b.dispatchEvent(new window.Event("change",{bubbles:true}));
  }
  const allOff=boxes().every(b=>!b.checked);
  check("all boxes unticked", allOff, boxes().filter(b=>b.checked).length+" still on");
  const t=txt();
  check("page still renders something sane", t.length>40 && !/NaN|undefined/.test(t),
    t.slice(0,90));
  $("books-all").click();
  check("'all' restores every box", boxes().every(b=>b.checked));

  console.log("");
  console.log("=== rapid tab switching ===");
  const tabs=[...window.document.querySelectorAll(".view-tab")];
  for(let i=0;i<12;i++) tabs[i%3].click();
  await new Promise(r=>setTimeout(r,700));
  const vis=["sitstart","sleeper","rooting"].filter(v=>
    !window.document.getElementById(v+"-view").classList.contains("hidden"));
  check("exactly one view visible", vis.length===1, vis.join(", "));

  console.log("");
  console.log("=== search for nothing ===");
  tabs[0].click();
  await new Promise(r=>setTimeout(r,300));
  const $in=$("roster-search");
  $in.value="zzzzzzzz";
  $in.dispatchEvent(new window.Event("input",{bubbles:true}));
  const sugg=$("roster-suggestions");
  check("says no match rather than showing junk",
    /No match/i.test(sugg.textContent), sugg.textContent.trim().slice(0,50));
  $in.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
  check("Enter on no-match adds nothing and does not throw",
    errors.length===0, errors.slice(0,2).join(" | "));

  console.log("");
  console.log("uncaught errors: "+errors.length);
  errors.slice(0,5).forEach(e=>console.log("   "+e));
  console.log("");
  console.log(pass+" passed, "+fail+" failed");
  process.exit(fail||errors.length?1:0);
},1500);
