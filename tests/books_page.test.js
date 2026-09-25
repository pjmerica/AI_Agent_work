/* End-to-end test of books/index.html in a real DOM. */
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = process.env.REPO_ROOT || process.cwd();
const html=fs.readFileSync(path.join(ROOT,"books/index.html"),"utf8");
const appSrc=fs.readFileSync(path.join(ROOT,"books/app.js"),"utf8");
const dataDir=path.join(ROOT,"nfl-props");
const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://x.test/books/",pretendToBeVisual:true});
const {window}=dom;
window.fetch=(u)=>{const n=String(u).split("/").pop().split("?")[0];
  const f=path.join(dataDir,n);
  return fs.existsSync(f)?Promise.resolve({ok:true,json:()=>Promise.resolve(JSON.parse(fs.readFileSync(f,"utf8")))})
    :Promise.resolve({ok:false,json:()=>Promise.resolve(null)});};
const errors=[];
window.addEventListener("error",(e)=>errors.push(String(e.error||e.message)));
try { window.eval(appSrc); } catch(e){ console.log("FATAL: "+e.message); process.exit(1); }
const $=(id)=>window.document.getElementById(id);
let pass=0,fail=0;
const check=(l,c,d)=>{ if(c){pass++;console.log("  ok    "+l);} else {fail++;console.log("  FAIL  "+l+(d?"   -> "+d:""));} };
const rowCount=()=>window.document.querySelectorAll("table.board tbody tr").length;
const firstRow=()=>{const r=window.document.querySelector("table.board tbody tr");
  return r?[...r.querySelectorAll("td")].map(t=>t.textContent.trim()).join(" | "):"(none)";};

setTimeout(()=>{
  console.log("=== elements ===");
  ["format-seg","pos-seg","hide-tdonly","search","book-legend","output","meta"]
    .forEach(id=>check(id,!!$(id)));

  console.log("");
  console.log("=== table rendered ===");
  check("rows present", rowCount()>0, rowCount()+" rows");
  check("meta filled", /Week|updated/.test($("meta").textContent), $("meta").textContent.slice(0,60));
  check("legend filled", $("book-legend").children.length>0,
    $("book-legend").children.length+" chips");
  console.log("   top row: "+firstRow().slice(0,100));

  console.log("");
  console.log("=== one row per player ===");
  // Without name aliasing this table carried Cam Ward and Cameron Ward as two
  // rows for one quarterback -- one with his market lines, one with just the
  // DraftKings touchdown, tagged "TD only". Someone comparing books would have
  // been comparing a player against himself.
  $("hide-tdonly").checked = false;
  $("hide-tdonly").dispatchEvent(new window.Event("change", { bubbles: true }));
  const allNames = [...window.document.querySelectorAll("table.board tbody .col-player")]
    .map((e) => e.textContent.replace(/TD only/, "").trim());
  const dupes = [...new Set(allNames.filter((n, i) => allNames.indexOf(n) !== i))];
  check("no player appears twice", dupes.length === 0,
    dupes.slice(0, 5).join(", "));
  // And the specific split that was broken, in both toggle states -- the search
  // has to be re-applied after changing the toggle, since changing it re-renders.
  for (const hide of [false, true]) {
    $("hide-tdonly").checked = hide;
    $("hide-tdonly").dispatchEvent(new window.Event("change", { bubbles: true }));
    $("search").value = "ward";
    $("search").dispatchEvent(new window.Event("input", { bubbles: true }));
    const wardRows = [...window.document.querySelectorAll("table.board tbody tr")]
      .filter((tr) => /Ward/.test(tr.querySelector(".col-player").textContent));
    check("Cam Ward is a single row (TD-only " + (hide ? "hidden" : "shown") + ")",
      wardRows.length === 1,
      wardRows.length + " rows: " + wardRows.map((tr) =>
        tr.querySelector(".col-player").textContent.trim()).join(" / "));
  }
  $("search").value = "";
  $("search").dispatchEvent(new window.Event("input", { bubbles: true }));

  console.log("");
  console.log("=== scoring toggle ===");
  // Check a pass-catcher, not whatever sorts first: the top row is a QB with no
  // receptions line, whose total is identical in all three formats by design.
  const rowFor=(name)=>{
    const r=[...window.document.querySelectorAll("table.board tbody tr")]
      .find(x=>x.querySelector(".col-player").textContent.includes(name));
    return r?[...r.querySelectorAll("td")].map(t=>t.textContent.trim()).join(" | "):"(none)";
  };
  const WR="McBride";
  const wrBase=rowFor(WR);
  check("found a pass-catcher to test", wrBase!=="(none)", wrBase.slice(0,60));
  const base=firstRow();
  const btn=(f)=>$("format-seg").querySelector('[data-format="'+f+'"]');
  btn("ppr").click();
  const ppr=firstRow();
  check("PPR raised the pass-catcher", rowFor(WR)!==wrBase,
    "half: "+wrBase.slice(0,44)+"  ppr: "+rowFor(WR).slice(0,44));
  check("PPR button marked active", btn("ppr").classList.contains("active"));
  check("Half no longer active", !btn("half").classList.contains("active"));
  const wrPpr=rowFor(WR);
  btn("std").click();
  check("Standard lowered it again", rowFor(WR)!==wrPpr);
  btn("half").click();
  check("back to Half matches the original", rowFor(WR)===wrBase);

  console.log("");
  console.log("=== position filter ===");
  const all=rowCount();
  const pbtn=(p)=>$("pos-seg").querySelector('[data-pos="'+p+'"]');
  pbtn("TE").click();
  const te=rowCount();
  check("TE filter narrowed the list", te>0 && te<all, te+" of "+all);
  check("every visible row is a TE",
    [...window.document.querySelectorAll("table.board tbody tr")]
      .every(r=>/TE/.test(r.querySelector(".col-pos").textContent)));
  pbtn("ALL").click();
  check("ALL restored the count", rowCount()===all, rowCount()+" vs "+all);

  console.log("");
  console.log("=== TD-only toggle ===");
  const hidden=rowCount();
  $("hide-tdonly").checked=false;
  $("hide-tdonly").dispatchEvent(new window.Event("change",{bubbles:true}));
  const shown=rowCount();
  check("showing TD-only adds rows", shown>hidden, hidden+" -> "+shown);
  check("they are tagged",
    window.document.querySelectorAll(".td-only-tag").length>0,
    window.document.querySelectorAll(".td-only-tag").length+" tags");
  $("hide-tdonly").checked=true;
  $("hide-tdonly").dispatchEvent(new window.Event("change",{bubbles:true}));
  check("hiding again restores the count", rowCount()===hidden);

  console.log("");
  console.log("=== search ===");
  $("search").value="mcbride";
  $("search").dispatchEvent(new window.Event("input",{bubbles:true}));
  check("search narrows to a few rows", rowCount()>0 && rowCount()<=3, rowCount()+" rows");
  check("the match is right", /McBride/i.test(firstRow()), firstRow().slice(0,60));
  $("search").value="";
  $("search").dispatchEvent(new window.Event("input",{bubbles:true}));
  check("clearing search restores", rowCount()===hidden);

  console.log("");
  console.log("=== column sorting ===");
  const hdr=[...window.document.querySelectorAll("th.sortable")];
  check("sortable headers", hdr.length>1, hdr.length+"");
  const beforeSort=firstRow();
  hdr[1].click();   // a book column
  check("clicking a book header re-sorted", firstRow()!==beforeSort);
  const desc=firstRow();
  hdr[1].click();   // same header again reverses
  check("clicking again reversed it", firstRow()!==desc);

  console.log("");
  console.log("uncaught errors: "+errors.length);
  errors.slice(0,5).forEach(e=>console.log("   "+e));
  console.log("");
  console.log(pass+" passed, "+fail+" failed");
  process.exit(fail||errors.length?1:0);
},1200);
