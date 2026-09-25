/* The same treatment for the books table: repeated clicks, filters stacked on
 * each other, sorting every column, and the rule that a blank cell is missing
 * data rather than a zero and must never outrank a real number.
 *
 * Nothing here has failed on the app. One check did fail on its first run and
 * the fault was the test's: it read a fixed column index while sorting a
 * different column, so it reported "mixing" that was just the unsorted
 * neighbour. Worth remembering before trusting a failure from this file.
 */
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT=process.env.REPO_ROOT || process.cwd(),dataDir=path.join(ROOT,"nfl-props");
const dom=new JSDOM(fs.readFileSync(path.join(ROOT,"books/index.html"),"utf8"),
  {runScripts:"outside-only",url:"https://x.test/books/",pretendToBeVisual:true});
const {window}=dom;
window.fetch=async(u)=>{const n=String(u).split("/").pop().split("?")[0],f=path.join(dataDir,n);
  if(fs.existsSync(f))return{ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(f,"utf8"))};
  return{ok:false,status:404,json:async()=>null};};
const errors=[];
window.addEventListener("error",e=>errors.push(String(e.error||e.message)));
window.eval(fs.readFileSync(path.join(ROOT,"books/app.js"),"utf8"));
const $=(id)=>window.document.getElementById(id);
let pass=0,fail=0;
const check=(l,c,d)=>{if(c){pass++;console.log("  ok    "+l);}
  else{fail++;console.log("  FAIL  "+l+(d?"   -> "+d:""));}};
const rows=()=>window.document.querySelectorAll("table.board tbody tr").length;
const first=()=>{const r=window.document.querySelector("table.board tbody tr");
  return r?[...r.querySelectorAll("td")].map(t=>t.textContent.trim()).join("|"):"(none)";};

setTimeout(async()=>{
  console.log("=== repeated identical clicks ===");
  const fb=(f)=>$("format-seg").querySelector('[data-format="'+f+'"]');
  const base=first();
  fb("half").click(); fb("half").click(); fb("half").click();
  check("clicking the active format is a no-op", first()===base);
  const actives=$("format-seg").querySelectorAll(".active").length;
  check("exactly one format active", actives===1, actives+" active");

  console.log("");
  console.log("=== position filter + search interact correctly ===");
  const pb=(p)=>$("pos-seg").querySelector('[data-pos="'+p+'"]');
  pb("TE").click();
  $("search").value="mcbride";
  $("search").dispatchEvent(new window.Event("input",{bubbles:true}));
  const both=rows();
  check("TE + search narrows to few rows", both>0 && both<=3, both+" rows");
  // Now a search that cannot match the position filter.
  $("search").value="josh allen";
  $("search").dispatchEvent(new window.Event("input",{bubbles:true}));
  check("QB name under TE filter yields nothing, with a message",
    rows()===0 && /No players match/i.test($("output").textContent),
    rows()+" rows: "+$("output").textContent.trim().slice(0,50));
  pb("ALL").click();
  check("switching to ALL finds him again", rows()>0 && /Allen/i.test(first()),
    first().slice(0,50));
  $("search").value="";
  $("search").dispatchEvent(new window.Event("input",{bubbles:true}));

  console.log("");
  console.log("=== sorting is stable and reversible ===");
  const hdr=[...window.document.querySelectorAll("th.sortable")];
  const start=first();
  hdr[0].click();            // consensus, already the sort -> reverse
  const rev=first();
  check("clicking the active column reverses it", rev!==start, "unchanged");
  hdr[0].click();
  check("clicking again restores the original order", first()===start,
    "did not return");
  // Sorting must not lose or duplicate rows.
  const n0=rows();
  for (const h of hdr) { h.click(); }
  check("row count survives sorting every column", rows()===n0,
    n0+" then "+rows());

  console.log("");
  console.log("=== blank cells sort last in BOTH directions ===");
  // A blank is missing data, not a zero, so it must never outrank a real
  // number. Read the column that is actually being sorted -- an earlier version
  // of this check read a fixed index while sorting a different column, and
  // reported mixing that was simply the unsorted neighbour.
  const heads = [...window.document.querySelectorAll("table.board thead th")]
    .map((t) => t.textContent.replace(/[▼▲]/g, "").trim());
  const bookHdr = hdr.find((h) => h.dataset.sort === "betmgm");
  const idx = heads.findIndex((h) => /BetMGM/i.test(h));
  const colVals = () => [...window.document.querySelectorAll("table.board tbody tr")]
    .map((tr) => {
      const td = [...tr.querySelectorAll("td")][idx];
      return td ? td.textContent.trim() : "";
    });
  for (const dir of ["descending", "ascending"]) {
    bookHdr.click();
    const v = colVals();
    const firstBlank = v.findIndex((x) => /^[—-]/.test(x));
    const lastNum = v.reduce((a, x, i) => (/^\d/.test(x) ? i : a), -1);
    check(dir + ": no number after the first blank",
      firstBlank === -1 || lastNum < firstBlank,
      "first blank at " + firstBlank + ", last number at " + lastNum);
  }

  console.log("");
  console.log("=== TD-only toggle + filters together ===");
  $("hide-tdonly").checked=false;
  $("hide-tdonly").dispatchEvent(new window.Event("change",{bubbles:true}));
  const shown=rows();
  pb("RB").click();
  check("position filter still applies with TD-only shown", rows()>0 && rows()<shown,
    rows()+" of "+shown);
  const allRB=[...window.document.querySelectorAll("table.board tbody tr")]
    .every(tr=>/RB/.test(tr.querySelector(".col-pos").textContent));
  check("every row is still an RB", allRB);

  console.log("");
  console.log("uncaught errors: "+errors.length);
  errors.slice(0,5).forEach(e=>console.log("   "+e));
  console.log("");
  console.log(pass+" passed, "+fail+" failed");
  process.exit(fail||errors.length?1:0);
},1400);
