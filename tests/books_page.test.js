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
  // Then the same claim as a search: pick a surname that is actually on this
  // week's board rather than naming a player. "Cam Ward" was the case that
  // broke, and he is off the board entirely two weeks later.
  const surnames = allNames.map((n) => n.split(/\s+/).pop())
    .filter((x) => x && x.length > 3);
  const counts = {};
  for (const x of surnames) counts[x] = (counts[x] || 0) + 1;
  const uniqueSurname = Object.keys(counts).find((x) => counts[x] === 1);
  if (uniqueSurname) {
    for (const hide of [false, true]) {
      $("hide-tdonly").checked = hide;
      $("hide-tdonly").dispatchEvent(new window.Event("change", { bubbles: true }));
      $("search").value = uniqueSurname.toLowerCase();
      $("search").dispatchEvent(new window.Event("input", { bubbles: true }));
      const hits = [...window.document.querySelectorAll("table.board tbody tr")]
        .filter((tr) => new RegExp(uniqueSurname, "i")
          .test(tr.querySelector(".col-player").textContent));
      check('"' + uniqueSurname + '" is a single row (TD-only ' +
        (hide ? "hidden" : "shown") + ")", hits.length === 1,
        hits.length + " rows");
    }
  } else {
    check("found a unique surname to search", false, "none on this board");
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
  // A player whose total actually moves with the reception rate. Picking a name
  // is what rotted here before, so find one: a TE or WR near the top of the
  // board is priced for receptions by definition.
  const WR = (() => {
    const rows = [...window.document.querySelectorAll("table.board tbody tr")];
    for (const tr of rows) {
      const pos = tr.querySelector(".col-pos");
      if (!pos || !/^(WR|TE)$/.test(pos.textContent.trim())) continue;
      const nm = tr.querySelector(".col-player").textContent
        .replace(/TD only/, "").trim();
      if (nm) return nm;
    }
    return "";
  })();
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
  // Search for a surname from the board, not a fixed name.
  const someSurname = (WR || "").split(/\s+/).pop() || "";
  $("search").value = someSurname.toLowerCase();
  $("search").dispatchEvent(new window.Event("input",{bubbles:true}));
  check("search narrows the list", someSurname &&
    rowCount() > 0 && rowCount() <= 4, someSurname + " -> " + rowCount() + " rows");
  check("the match is right", someSurname &&
    new RegExp(someSurname, "i").test(firstRow()), firstRow().slice(0,60));
  $("search").value="";
  $("search").dispatchEvent(new window.Event("input",{bubbles:true}));
  check("clearing search restores", rowCount()===hidden);

  console.log("");
  console.log("=== column sorting ===");
  const hdr=[...window.document.querySelectorAll("th.sortable")];
  check("sortable headers", hdr.length>1, hdr.length+"");
  // Check the ORDER, not that the top row changed. The same player can lead two
  // adjacent columns -- Josh Allen tops both FanDuel and BetRivers -- so a
  // "first row changed" test reports a failure that is really the data agreeing.
  const colOf = (label) => {
    const heads = [...window.document.querySelectorAll("table.board thead th")]
      .map((t) => t.textContent.replace(/[\u25bc\u25b2]/g, "").trim());
    return heads.findIndex((h) => h === label);
  };
  const sortedDesc = (idx) => {
    const v = [...window.document.querySelectorAll("table.board tbody tr")]
      .map((tr) => {
        const td = [...tr.querySelectorAll("td")][idx];
        return td ? parseFloat(td.textContent) : NaN;
      })
      .filter((x) => !isNaN(x));
    return v.every((x, i) => i === 0 || v[i - 1] >= x);
  };
  const sortedAsc = (idx) => {
    const v = [...window.document.querySelectorAll("table.board tbody tr")]
      .map((tr) => {
        const td = [...tr.querySelectorAll("td")][idx];
        return td ? parseFloat(td.textContent) : NaN;
      })
      .filter((x) => !isNaN(x));
    return v.every((x, i) => i === 0 || v[i - 1] <= x);
  };
  const bookHead = hdr[1];
  const bookIdx = colOf(bookHead.textContent.replace(/[\u25bc\u25b2]/g, "").trim());
  bookHead.click();
  check("clicking a book header sorts it descending",
    bookIdx >= 0 && sortedDesc(bookIdx), "column index " + bookIdx);
  bookHead.click();
  check("clicking again sorts ascending", sortedAsc(bookIdx));

  console.log("");
  console.log("uncaught errors: "+errors.length);
  errors.slice(0,5).forEach(e=>console.log("   "+e));
  console.log("");
  console.log(pass+" passed, "+fail+" failed");
  process.exit(fail||errors.length?1:0);
},1200);
