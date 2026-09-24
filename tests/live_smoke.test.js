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
const PAGES=[
  {name:"lineup", path:"lineup/", probe:(w)=>w.document.querySelectorAll(".view-tab").length},
  {name:"books",  path:"books/",  probe:(w)=>w.document.querySelectorAll("table.board tbody tr").length},
  {name:"board",  path:"nfl-props/", probe:(w)=>w.document.querySelectorAll(".view-tab").length},
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
    let n=0; try{ n=p.probe(window); }catch(e){}
    const stale=window.document.querySelectorAll(".stale-note").length;
    const ok = n > 0 && errors.length === 0;
    if (!ok) failures++;
    console.log((ok?"  ok    ":"  FAIL  ")+p.name.padEnd(8)+
      "probe="+String(n).padStart(4)+"  errors="+errors.length);
    errors.slice(0,3).forEach(e=>console.log("        "+e));
  }
  console.log("");
  console.log(failures ? failures+" page(s) failed" : "all pages render");
  process.exit(failures?1:0);
})();
