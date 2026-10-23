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
  let menu='',panelTitle='',panelBody='',listCheck=null;
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
      // MyDay 22/9: the DOM must hold EVERY candidate the function returned,
      // and the caption must state the count (the list scrolls silently).
      listCheck=await page.evaluate(()=>{ const row=WINTL.rows.find(r=>r.type==='import'&&r.matchedTo)||WINTL.rows.find(r=>r.type==='import');
        const n=document.querySelectorAll('#wiRotaList .wi-panel-opt').length; const cap=(document.querySelector('#wi-panel .wi-panel-body .wi-panel-note')||{}).textContent||'';
        const el=document.getElementById('wiRotaList'); return {domOpts:n, caption:cap.trim(), maxHeight:el&&getComputedStyle(el).maxHeight, scrolls:el?el.scrollHeight>el.clientHeight:null}; });
    }
  }
  // P3 (ελεγκτής 22/9): _wiRotAdd with the backend stubbed — (a) parent has a
  // CLOSED round trip and the leg does not attach → Rotation ID reverted, warn
  // toast, no «✓»; (b) leg attaches → «✓». Pure in-page: atSafePatch/toast/
  // rtOnOrderSaved/rtFindForOrder/renderWeeklyIntl replaced for the call only.
  // 9/10 (fix/rota-leg-own-rt): _wiRotAdd first reads the leg (atGetOne) and
  // its round trip (/costs/rt, unrecorded → no trip): the fake leg is served
  // BARE so (a)/(b) still reach the post-write guard; (c) the same leg with a
  // truck is refused before any write — the real check, in the page.
  // fix/own-rt-join-rota: the bare leg still alone on its own trip RT-77 (what
  // «Καθαρισμός ανάθεσης» leaves): (d) empty → the leg leaves RT-77 first
  // (DELETE before the Rotation ID), then «✓» naming RT-77; (e) RT-77 has
  // cost lines → refused, nothing written. /costs/* played in the page.
  const p3=await page.evaluate(async()=>{
    const keep={atSafePatch:window.atSafePatch,toast:window.toast,rtOnOrderSaved:window.rtOnOrderSaved,rtFindForOrder:window.rtFindForOrder,renderWeeklyIntl:window.renderWeeklyIntl,reportError:window.reportError,atGetOne:window.atGetOne,showErrorToast:window.showErrorToast,plFetch:window.plFetch,fetch:window.fetch};
    const run=async(attach,legTruck,log)=>{
      const patches=[],toasts=[];
      window.atSafePatch=async(t,id,f)=>{patches.push({id,f});if(log)log.push('PATCH '+Object.keys(f).join(','));return {};};
      window.toast=(m,ty)=>toasts.push((ty||'success')+': '+m);
      window.showErrorToast=(m,ty)=>toasts.push((ty||'error')+'[showErrorToast]: '+m);
      window.reportError=(m,e)=>toasts.push('error: '+m);
      window.rtOnOrderSaved=async()=>null;
      window.renderWeeklyIntl=async()=>{};
      const parent=WINTL.rows.find(r=>r.type==='import');
      const legOid='recLEGTEST00000001';
      window.atGetOne=async(t,id)=>id===legOid?{id,fields:Object.assign({Reference:'LEGTEST','Order No':999999,'Loading DateTime':'2026-08-29T06:00:00','Delivery DateTime':'2026-08-31T06:00:00'},legTruck?{Truck:[legTruck]}:{})}:keep.atGetOne(t,id);
      window.rtFindForOrder=async(id)=>id===legOid?{pg:1,rt:attach?{id:9,code:'RT-9',status:'planned'}:null}:{pg:2,rt:{id:9,code:'RT-9',status:'closed'}};
      await _wiRotAdd(parent.id,legOid);
      return {patches:patches.map(x=>x.f),toasts};
    };
    const fail=await run(false); const ok=await run(true);
    const truck=(WINTL.data.trucks[0]||{}).id||'recTRUCKTEST';
    const refused=await run(true,truck);
    const ownTrip=async lines=>{
      const rts=[{id:77,code:'RT-77',status:'planned',truck_id:null,driver_id:null,ledger_entry:null,ct_rt_legs:[{id:1,order_id:999999,seq:1}]}], log=[];
      window.plFetch=async(p,o)=>{
        log.push(((o&&o.method)||'GET')+' '+p.split('?')[0]);
        if(p.startsWith('/costs/rt?')) return {records:JSON.parse(JSON.stringify(rts))};
        if(p.startsWith('/costs/lines')) return {records:lines?[{id:5}]:[],next_offset:null};
        return keep.plFetch(p,o);
      };
      // weekly_intl.js lives in an IIFE: its own _wiRtLegDelete cannot be
      // replaced from here, so its DELETE is answered at fetch() instead.
      window.fetch=async(url,init)=>{
        const m=/\/costs\/rt\/(\d+)\/legs\?order_id=(\d+)$/.exec(String(url));
        if(!m||!init||init.method!=='DELETE') return keep.fetch(url,init);
        log.push('DELETE leg '+m[1]+'/'+m[2]);
        const r=rts.find(x=>x.id===Number(m[1])); r.ct_rt_legs=r.ct_rt_legs.filter(l=>l.order_id!==Number(m[2])); if(!r.ct_rt_legs.length) r.status='cancelled';
        return new Response(JSON.stringify({deleted:true}),{status:200,headers:{'content-type':'application/json'}});
      };
      const res=await run(true,null,log);
      return {...res,log,rt77:rts[0].status};
    };
    const freed=await ownTrip(false), costs=await ownTrip(true);
    Object.assign(window,keep);
    return {fail,ok,refused,freed,costs};
  });
  await page.screenshot({path:out});
  console.log(JSON.stringify({week,PAIR,paired,listCheck,p3,matchedCards:found,hasHandler,menu,panelTitle,panelBody,errors:errs.slice(0,3)},null,1));
  await browser.close();
})().catch(e=>{console.error('✗',e.message);process.exit(1);});
