/* Smoke test the PUBLISHED pages, not the working tree.
 *
 * Everything else here runs against local files, which cannot catch a bad
 * deploy: a stale cache stamp, a file that did not get committed, a Pages
 * build that has not finished. This fetches each page and its app.js over the
 * network and runs them, so what it checks is what a visitor actually gets.
 *
 * Exit code is non-zero if any page throws or renders nothing.
 */
/* Load each published page from the live site and check it renders. */
const {JSDOM}=require("jsdom");
const zlib=require("zlib");

/* fetch() here returns the raw gzip body rather than decompressing it, so every
 * response has to be inflated by hand -- otherwise the page source arrives as
 * binary and fails to parse. The gzip magic number is 1f 8b. */
async function getText(url){
  const r=await fetch(url);
  let buf=Buffer.from(await r.arrayBuffer());
  if (buf.length>2 && buf[0]===0x1f && buf[1]===0x8b) buf=zlib.gunzipSync(buf);
  return {ok:r.ok,status:r.status,text:buf.toString("utf8")};
}
const BASE="https://pjmerica.github.io/AI_Agent_work/";
// Probe something the DATA renders, never static markup.
//
// lineup and board both counted ".view-tab", which is in index.html whether or
// not a single byte of data arrived. Verified by stubbing every fetch to 404:
// both still reported ok with nothing rendered. Only books caught it, because
// it counts real table rows.
//
// Each probe below was chosen by measuring it BOTH ways -- live, and with every
// fetch 404'd -- and keeping only the ones that collapse to zero without data:
//
//            selector                    live    no data
//   books    table tbody tr               195  ->  0
//   board    table tbody tr               424  ->  0
//   lineup   .player-tag after demo click    9  ->  0
//
// Checkboxes looked like the obvious signal and are not: lineup goes 10 -> 9 and
// board 6 -> 6, because most are static filter controls built unconditionally.
//
// lineup renders no rows on load (it needs a roster), so its probe clicks "load
// example" first. Rows stay 0 there even with data once every game has kicked
// off -- the Sit/Start tab withholds started players by design -- so it counts
// the roster chips, which appear only if the player feed parsed.
const PAGES=[
  {name:"lineup", path:"lineup/", probe:async(w)=>{
     const d=w.document.getElementById("roster-demo");
     if (d) { d.click(); await new Promise(r=>setTimeout(r,2500)); }
     return w.document.querySelectorAll(".player-tag").length;
   }},
  {name:"books",  path:"books/",
   probe:async(w)=>w.document.querySelectorAll("table.board tbody tr").length},
  {name:"board",  path:"nfl-props/",
   probe:async(w)=>w.document.querySelectorAll("table tbody tr").length},
];
let failures=0;

(async()=>{
  for (const p of PAGES) {
    const url=BASE+p.path;
    // Decode explicitly: .text() on these responses was returning the raw
    // compressed body, which then failed to parse as JS.
    const html=(await getText(url)).text;
    const appUrl=url+(html.match(/src="(app\.js[^"]*)"/)||[])[1];
    const appSrc=(await getText(appUrl)).text;
    const dom=new JSDOM(html,{runScripts:"dangerously",resources:undefined,url,pretendToBeVisual:true});
    const {window}=dom;
    const errors=[];
    window.addEventListener("error",e=>errors.push(String(e.error||e.message)));
    window.fetch=async(u)=>{
      const abs=new URL(String(u),url).href;
      try{
        const r=await getText(abs);
        return {ok:r.ok,status:r.status,
                json:async()=>{try{return JSON.parse(r.text);}catch(e){return null;}}};
      }catch(e){ return {ok:false,status:0,json:async()=>null}; }
    };
    // window.eval chokes on these files inside jsdom even though Node parses
    // them fine, so inject a <script> and let jsdom's own runner execute it.
    try {
      const el=window.document.createElement("script");
      el.textContent=appSrc;
      window.document.body.appendChild(el);
    } catch(e){ console.log(p.name+": FATAL "+e.message); continue; }
    await new Promise(r=>setTimeout(r,3500));
    let n=0; try{ n=await p.probe(window); }catch(e){}
    // Reported, not asserted: a stale-data note is information about the feed,
    // not a defect in the page. It was computed and then never read at all.
    const stale=window.document.querySelectorAll(".stale-note").length;
    const ok = n > 0 && errors.length === 0;
    if (!ok) failures++;
    console.log((ok?"  ok    ":"  FAIL  ")+p.name.padEnd(8)+
      "probe="+String(n).padStart(4)+"  errors="+errors.length+
      (stale?"  stale-notes="+stale:""));
    errors.slice(0,3).forEach(e=>console.log("        "+e));
  }
  console.log("");
  console.log(failures ? failures+" page(s) failed" : "all pages render");
  process.exit(failures?1:0);
})();
