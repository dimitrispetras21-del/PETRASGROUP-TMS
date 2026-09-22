// Rig: right-click a MATCHED import card inside an export row (Weekly Intl,
// HAR 28/8 replay + closest-recorded-URL bridge) → menu with «Σκέλος
// προώθησης»? → open the rota panel → screenshot.
// Usage: node rota-rig.js <baseURL> <out.png>   (cwd = worktree root, .har relative)
const path=require('path'), fs=require('fs');
const ROOT=require('path').join(__dirname,'../..');
const { chromium } = require(path.join(ROOT,'node_modules/playwright'));
const { preparePage, gotoPage } = require(path.join(ROOT,'tests/critics/auth.js'));
const { repair } = require(path.join(ROOT,'tests/critics/repair-har.js'));
const [,, baseURL, out] = process.argv;
const HOST='petras-tms-backend-staging.petrasgroup.workers.dev';
const DATE_RE=/\d{4}-\d{2}-\d{2}/g;
function keyOf(url){ const u=new URL(url); const rest=[...u.searchParams.entries()].filter(([k])=>k!=='fields[]').map(([k,v])=>k+'='+v.replace(DATE_RE,'D')).sort().join('&'); return u.pathname+'?'+rest; }
function fieldsOf(url){ return new Set(new URL(url).searchParams.getAll('fields[]')); }
const ENTRIES=JSON.parse(fs.readFileSync(repair(),'utf8')).log.entries.filter(e=>e.request.url.includes(HOST)&&e.request.method==='GET');
const bodyOf=e=>{const c=e.response.content||{};return c.text?(c.encoding==='base64'?Buffer.from(c.text,'base64').toString('utf8'):c.text):'';};
const byUrl=new Map(); for(const e of ENTRIES){ const k=e.request.url; if(!byUrl.has(k)||bodyOf(byUrl.get(k)).length<bodyOf(e).length) byUrl.set(k,e); }
const isOrders=u=>u.includes('tblgHlNmLBH3JTdIM');
const dirOf=u=>{const d=decodeURIComponent(u); return /Direction\}='Import'/.test(d)?'Import':/Direction\}='Export'/.test(d)?'Export':null;};
// the import entry we will ALWAYS serve for the weekly's import request (so the
// paired id below is guaranteed to be in WINTL.data.imports)
const impEntry=ENTRIES.filter(e=>isOrders(e.request.url)&&dirOf(e.request.url)==='Import'&&bodyOf(e).includes('"records"')&&decodeURIComponent(e.request.url).includes('International')).sort((a,b)=>bodyOf(b).length-bodyOf(a).length)[0];
const impRec=impEntry?JSON.parse(bodyOf(impEntry)).records[0]:null;
function recordedIndex(){ const idx=new Map(); for(const e of JSON.parse(fs.readFileSync(repair(),'utf8')).log.entries){ if(!e.request.url.includes(HOST)||e.request.method!=='GET') continue; const k=keyOf(e.request.url); if(!idx.has(k)) idx.set(k,[]); idx.get(k).push(e.request.url); } return idx; }
(async()=>{
  const idx=recordedIndex(); const recordedAll=new Set([...idx.values()].flat()); const PAIR={};
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},baseURL,locale:'el-GR',timezoneId:'Europe/Athens'});
  const page=await ctx.newPage(); const errs=[];
  page.on('console',m=>{ if(m.type()==='error') errs.push(m.text().slice(0,120)); });
  await preparePage(page,'dispatcher');
  await page.route(`**/${HOST}/**`, route=>{
    const req=route.request();
    const hdr=()=>({'content-type':'application/json','access-control-allow-origin':req.headers()['origin']||'*'});
    if(req.method()==='GET'&&isOrders(req.url())&&decodeURIComponent(req.url()).includes('International')&&impRec){
      const d=dirOf(req.url());
      if(d==='Import') return route.fulfill({status:200,headers:hdr(),body:bodyOf(impEntry)});
      if(d==='Export'){
        const cands=recordedAll.has(req.url())?[req.url()]:(idx.get(keyOf(req.url()))||[]);
        const want=fieldsOf(req.url()); let best=null,bestN=-1;
        for(const c of cands){ const n=[...fieldsOf(c)].filter(f=>want.has(f)).length; if(n>bestN){bestN=n;best=c;} }
        const e=best&&byUrl.get(best); if(e){ const j=JSON.parse(bodyOf(e)); const r=(j.records||[]).find(r=>!r.fields['Matched Import ID']&&!r.fields['Group ID']);
          if(r){ r.fields['Matched Import ID']=impRec.id; PAIR.exp=r.id; PAIR.imp=impRec.id; } return route.fulfill({status:200,headers:hdr(),body:JSON.stringify(j)}); }
      }
    }
    if(req.method()!=='GET'||recordedAll.has(req.url())) return route.fallback();
    const cands=idx.get(keyOf(req.url()))||[];
    if(!cands.length) return route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':req.headers()['origin']||'*'},body:'{"records":[]}'});
    const want=fieldsOf(req.url()); let best=null,bestN=-1;
    for(const c of cands){ const n=[...fieldsOf(c)].filter(f=>want.has(f)).length; if(n>bestN){bestN=n;best=c;} }
    return route.fallback({url:best});
  });
  await gotoPage(page,'weekly_intl',baseURL);
  await page.locator('#sidebar').waitFor({timeout:15000});
  await page.waitForTimeout(3000);
  const sel='.wk3-row:not(.impr) .wk3-leg.imp .wi2-card';
  // HAR 28/8 = W36 with 6 exports and NO matched import: the route above
  // serves the recorded export body with one export paired to a recorded
  // import, so the pair is built by the REAL _wiBuildRows/_wiRowHTML.
  await page.evaluate(async()=>{ WINTL.week=36; await renderWeeklyIntl(); }); await page.waitForTimeout(3000);
  const paired=await page.evaluate(()=>{ const exp=WINTL.rows.find(r=>r.type==='export'&&r.importId); const imp=exp&&WINTL.rows.find(r=>r.type==='import'&&r.orderId===exp.importId); return exp?{expRow:exp.id,impRow:imp&&imp.id,expOid:exp.orderId,impOid:exp.importId,impAdj:imp&&imp.adj}:{dbg:{exp:WINTL.rows.filter(r=>r.type==='export').length,imp:WINTL.rows.filter(r=>r.type==='import').length}}; });
  let found=await page.locator(sel).count(), week=36;
  const leg=page.locator('.wk3-row:not(.impr) .wk3-leg.imp:has(.wi2-card)').first();
  const hasHandler=found?await leg.evaluate(el=>!!el.getAttribute('oncontextmenu')):null;
  let menu='',panelTitle='',panelBody='';
  if(found){
    await leg.scrollIntoViewIfNeeded();
    await leg.click({button:'right'}); await page.waitForTimeout(400);
    const ctxEl=page.locator('#wi-ctx');
    const shown=await ctxEl.evaluate(el=>getComputedStyle(el).display!=='none');
    menu=shown?(await ctxEl.innerText()).replace(/\n/g,' | '):'(κανένα μενού)';
    const rota=ctxEl.locator('button:has-text("Σκέλος προώθησης")');
    if(shown&&await rota.count()){
      await rota.click(); await page.waitForTimeout(600);
      panelTitle=await page.locator('#wi-panel .wi-panel-title').innerText().catch(()=>'');
      panelBody=(await page.locator('#wi-panel .wi-panel-body').innerText().catch(()=>'')).replace(/\n/g,' | ').slice(0,400);
    }
  }
  await page.screenshot({path:out});
  console.log(JSON.stringify({week,PAIR,paired,matchedCards:found,hasHandler,menu,panelTitle,panelBody,errors:errs.slice(0,3)},null,1));
  await browser.close();
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
