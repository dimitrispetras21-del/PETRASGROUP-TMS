// ═══════════════════════════════════════════════════════════════════════
// WEEKLY INTERNATIONAL — v12
// ─────────────────────────────────────────────────────────────────────
// ORDERS-only. No TRIPS.
//
// Fields read from ORDERS:
//   Direction, Type, "Week Number", Loading DateTime, Delivery DateTime,
//   Loading Summary, Delivery Summary, Total Pallets, Veroia Switch,
//   Truck[], Trailer[], Driver[], Partner[], Is Partner Trip,
//   Partner Truck Plates, Matched Import ID
//
// Fields written on assignment save:
//   Truck, Trailer, Driver, Partner, Is Partner Trip, Partner Truck Plates
//
// Fields written on import drop (auto-save, independent):
//   Matched Import ID  (stores import order record ID as text)
// ═══════════════════════════════════════════════════════════════════════
(function() {
'use strict';

// PARTNER ASSIGNMENTS table (tblUhgqnmiam5MGNK)
// PA table/fields now live in config.js (TABLES.PARTNER_ASSIGN + F.PA_*)
// PA writes delegated to core/pa-helpers.js

const WINTL = {
  week:      _wiCurrentWeek(),
  shelf:     [], // kept for compat, not used for display
  data:      { exports:[], imports:[], trucks:[], trailers:[], drivers:[], partners:[] },
  rows:      [],
  ui:        { openRow:null, openGroup:null },
  filter:    '',
  filterStatus: '',
  _seq:      0,
};

// Apply search/status filter by hiding rows
function _wiApplyFilter() {
  const q = (WINTL.filter || '').toLowerCase();
  const fs = WINTL.filterStatus || '';
  document.querySelectorAll('#wi-rows > [data-row-id]').forEach(el => {
    const row = WINTL.rows.find(r => String(r.id) === el.dataset.rowId);
    if (!row) { el.style.display = ''; return; }
    let show = true;
    if (q) {
      const blob = [
        row.truckLabel, row.driverLabel, row.partnerLabel,
        ...(row.orderIds || []).map(oid => {
          const o = WINTL.data.exports.find(r=>r.id===oid) || WINTL.data.imports.find(r=>r.id===oid);
          if (!o) return '';
          const f = o.fields;
          return [f['Loading Summary'], f['Delivery Summary'], f['Order Number']].filter(Boolean).join(' ');
        })
      ].join(' ').toLowerCase();
      if (!blob.includes(q)) show = false;
    }
    if (show && fs) {
      if (fs === 'pending' && row.saved) show = false;
      else if (fs === 'assigned' && !row.saved) show = false;
      else if (fs === 'unmatched' && (row.type !== 'import' || row.matchedTo)) show = false;
    }
    el.style.display = show ? '' : 'none';
  });
}

// Row save indicator — pulse animation on save
function _wiPulseRow(rowId) {
  const el = document.getElementById('wi-row-'+rowId);
  if (!el) return;
  el.style.transition = 'background 0.3s';
  const orig = el.style.background;
  el.style.background = 'rgba(16,185,129,0.15)';
  setTimeout(() => { el.style.background = orig; }, 700);
}

/* ── CSS moved to assets/style.css ── */
/* ── UTILS ─────────────────────────────────────────────────────────── */
// Week number matching Airtable WEEKNUM (Sunday-start)
function _wiCurrentWeek(){
  const d=new Date(),y=d.getFullYear(),j=new Date(y,0,1);
  return Math.ceil(((d-j)/86400000+j.getDay()+1)/7);
}
// Week start (Sunday) for a given week number — matches Airtable WEEKNUM
function _wiWeekStart(w){
  const y=new Date().getFullYear(),jan1=new Date(y,0,1);
  const firstSun=new Date(jan1); firstSun.setDate(jan1.getDate()-jan1.getDay());
  const ws=new Date(firstSun); ws.setDate(firstSun.getDate()+(w-1)*7);
  return ws;
}
function _wiWeekRange(w){
  const ws=_wiWeekStart(w);
  const we=new Date(ws); we.setDate(ws.getDate()+6);
  const f=d=>d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  return `${f(ws)} – ${f(we)}`;
}
function _wiFmt(s){
  if(!s) return '—';
  try{const p=toLocalDate(s).split('-');return`${p[2]}/${p[1]}`;}catch{return s;}
}
function _wiFmtFull(s){
  if(!s) return null;
  try{
    // Full Greek date, capitalize first letter
    const d=new Date(s);
    const str=d.toLocaleDateString('el-GR',{weekday:'long',day:'numeric',month:'long'});
    return str.charAt(0).toUpperCase()+str.slice(1);
  }catch{return s;}
}
function _wiClean(s){return escapeHtml((s||'').replace(/^['"\s/]+/,'').replace(/['"\s/]+$/,'').trim());}
function _wiFv(v){return Array.isArray(v)?v[0]||'':v||'';}

// Batch fetch ORDER_STOPS and inject Loading/Delivery Summary into records missing them
async function _wiInjectStopSummaries(allOrders) {
  const allStopIds = allOrders.flatMap(r => r.fields['ORDER STOPS'] || []);
  if (!allStopIds.length) return;
  try {
    await fhLoadLocations();
    const stopsByOrder = {};
    for (let b = 0; b < allStopIds.length; b += 90) {
      const batch = allStopIds.slice(b, b + 90);
      const f = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
      const recs = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: f }, false);
      recs.forEach(sr => {
        const pid = Array.isArray(sr.fields[F.STOP_PARENT_ORDER]) ? sr.fields[F.STOP_PARENT_ORDER][0] : null;
        if (pid) { if (!stopsByOrder[pid]) stopsByOrder[pid] = []; stopsByOrder[pid].push(sr); }
      });
    }
    const _resolveName = (stopType, orderId) => {
      const stops = stopsByOrder[orderId];
      if (!stops) return null;
      const filtered = stops.filter(s => s.fields[F.STOP_TYPE] === stopType)
        .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
      if (!filtered.length) return null;
      return filtered.map(s => {
        const locId = Array.isArray(s.fields[F.STOP_LOCATION]) ? s.fields[F.STOP_LOCATION][0] : null;
        return locId ? (_fhLocationsMap[locId] || locId.slice(-6)) : '?';
      }).join(', ');
    };
    allOrders.forEach(r => {
      if (!r.fields['Loading Summary']) {
        const ls = _resolveName('Loading', r.id);
        if (ls) r.fields['Loading Summary'] = ls;
      }
      if (!r.fields['Delivery Summary']) {
        const ds = _resolveName('Unloading', r.id);
        if (ds) r.fields['Delivery Summary'] = ds;
      }
    });
  } catch(e) { console.warn('Weekly INTL: ORDER_STOPS summary inject failed', e); }
}

/* ── LOAD ASSETS ───────────────────────────────────────────────────── */
async function _wiLoadAssets(){
  await preloadReferenceData();
  WINTL.data.trucks   = getRefTrucks().filter(r=>r.fields['Active']).map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.data.trailers = getRefTrailers().map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
  WINTL.data.drivers  = getRefDrivers().filter(r=>r.fields['Active']).map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
  WINTL.data.partners = getRefPartners().map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));
}

/* ── MAIN ENTRY ────────────────────────────────────────────────────── */
let _wiLoadId = 0;
async function renderWeeklyIntl(){
  WINTL._seq = 0;
  const loadId = ++_wiLoadId;
  if(can('planning')==='none'){document.getElementById('content').innerHTML=showAccessDenied();return;}
  document.getElementById('content').innerHTML=`
    <div style="display:flex;align-items:center;justify-content:center;
                gap:10px;height:160px;color:var(--text-dim);font-size:13px">
      <div class="spinner"></div> Loading week ${WINTL.week}…
    </div>`;
  try{
    // Exports: filtered by Airtable Week Number (delivery-based)
    // Imports: filtered by Loading DateTime range (loading-based)
    const ws=_wiWeekStart(WINTL.week);
    const we=new Date(ws); we.setDate(ws.getDate()+6);
    const wsFmt=toLocalDate(ws), weFmt=toLocalDate(we);
    const impFilter=`AND({Type}='International',{Direction}='Import',IS_AFTER({Loading DateTime},'${toLocalDate(new Date(ws.getTime()-86400000))}'),IS_BEFORE({Loading DateTime},'${toLocalDate(new Date(we.getTime()+86400000))}'))`;

    const [,,expOrders,impOrders] = await Promise.all([
      preloadReferenceData(),
      Promise.resolve(), // placeholder to keep destructuring aligned
      atGetAll(TABLES.ORDERS,  {filterByFormula:`AND({Type}='International',{Direction}='Export',{Week Number}=${WINTL.week})`},false),
      atGetAll(TABLES.ORDERS,  {filterByFormula:impFilter},false),
    ]);
    if (loadId !== _wiLoadId) return;
    WINTL.data.trucks   = getRefTrucks().filter(r=>r.fields['Active']).map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
    WINTL.data.trailers = getRefTrailers().map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
    WINTL.data.drivers  = getRefDrivers().filter(r=>r.fields['Active']).map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
    WINTL.data.partners = getRefPartners().map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));

    // ── Inject Loading/Delivery Summary from ORDER_STOPS for new orders ──
    await _wiInjectStopSummaries([...expOrders, ...impOrders]);

    WINTL.data.exports = expOrders
      .sort((a,b)=>(
        (a.fields['Delivery DateTime']||a.fields['Loading DateTime']||'')
        .localeCompare(b.fields['Delivery DateTime']||b.fields['Loading DateTime']||'')
      ));
    WINTL.data.imports = impOrders;

    if (loadId !== _wiLoadId) return;
    _wiBuildRows();
    _wiPaint();
  }catch(err){
    if (loadId !== _wiLoadId) return;
    document.getElementById('content').innerHTML=`
      <div class="empty-state">
        <p style="color:var(--danger);font-size:13px">${err.message}</p>
        <button class="btn btn-ghost" onclick="renderWeeklyIntl()" style="margin-top:12px">Retry</button>
      </div>`;
  }
}

/* ── BUILD ROWS ────────────────────────────────────────────────────── */
function _wiBuildRows(){
  WINTL.rows=[];WINTL._seq=0;
  const {exports,imports}=WINTL.data;

  // Map import ID → import record for fast lookup
  const impById={};
  imports.forEach(r=>impById[r.id]=r);

  for(const exp of exports){
    const f=exp.fields;
    const truckId  =(f['Truck']  ||[])[0]||'';
    const trailerId=(f['Trailer']||[])[0]||'';
    const driverId =(f['Driver'] ||[])[0]||'';
    const partnerId=(f['Partner']||[])[0]||'';
    const importId =f['Matched Import ID']||null;

    WINTL.rows.push({
      id:          ++WINTL._seq,
      type:        'export',
      orderId:     exp.id,
      orderIds:    [exp.id],
      importId,
      truckId, trailerId, driverId, partnerId,
      truckLabel:  WINTL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel:WINTL.data.trailers.find(t=>t.id===trailerId)?.label||'',
      driverLabel: WINTL.data.drivers.find(d=>d.id===driverId)?.label||'',
      partnerLabel:WINTL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates:f['Partner Truck Plates']||'',
      partnerRate:  f['Partner Rate']?String(f['Partner Rate']):'',
      partnerRateImp:'',
      saved:!!(truckId||partnerId),
    });
  }

  // Π1 (Wave 3): rebuild persisted groups — export rows sharing a non-empty
  // Group ID collapse back into one row after every reload.
  {
    const byGid={};
    WINTL.rows.forEach(r=>{
      if(r.type!=='export') return;
      const gid=exports.find(e=>e.id===r.orderId)?.fields?.['Group ID'];
      if(gid){(byGid[gid]=byGid[gid]||[]).push(r);}
    });
    Object.values(byGid).forEach(list=>{
      if(list.length<2) return;
      const [lead,...rest]=list;
      rest.forEach(r=>{ r.orderIds.forEach(id=>{ if(!lead.orderIds.includes(id)) lead.orderIds.push(id); }); });
      WINTL.rows=WINTL.rows.filter(r=>!rest.includes(r));
    });
  }

  // ── IMPORT ROWS — sorted by loading date, always draggable ──
  const importsSorted=[...imports].sort((a,b)=>(
    (a.fields['Loading DateTime']||'').localeCompare(b.fields['Loading DateTime']||'')
  ));

  // Build matchedMap: importOrderId → exportOrderId
  const matchedMap={};
  exports.forEach(r=>{ const mid=r.fields['Matched Import ID']; if(mid) matchedMap[mid]=r.id; });

  for(const imp of importsSorted){
    const f=imp.fields;
    const truckId  =(f['Truck']  ||[])[0]||'';
    const partnerId=(f['Partner']||[])[0]||'';
    const impTrailerId=(f['Trailer']||[])[0]||'';
    const impDriverId =(f['Driver'] ||[])[0]||'';
    WINTL.rows.push({
      id:          ++WINTL._seq,
      type:        'import',
      orderId:     imp.id,
      orderIds:    [imp.id],
      importId:    null,
      matchedTo:   matchedMap[imp.id]||null,
      truckId,   trailerId:impTrailerId, driverId:impDriverId, partnerId,
      truckLabel:  WINTL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel:WINTL.data.trailers.find(t=>t.id===impTrailerId)?.label||'',
      driverLabel: WINTL.data.drivers.find(d=>d.id===impDriverId)?.label||'',
      partnerLabel:WINTL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates:f['Partner Truck Plates']||'',
      partnerRate:  f['Partner Rate']?String(f['Partner Rate']):'',
      partnerRateImp:'',
      saved:!!(truckId||partnerId),
    });
  }
}

/* ── PAINT ─────────────────────────────────────────────────────────── */

/* ── WEEK SIDEBAR (INTL) ──────────────────────────────── */
// WI-7: the strip listed 21 weeks (−8..+12) and scrolled horizontally, so the
// current week was rarely where you looked. Now ±3 around the selected week,
// with explicit ‹ › steps and a «Σήμερα» reset — the three moves anyone
// actually makes. See docs/design/DEEP_AUDIT_2026-08-04/weekly_intl.md WI-7.
function _wiWeekSidebarItems(currentWeek) {
  const today = _wiCurrentWeek();
  const step = (d) => `<button type="button" onclick="WINTL.week=${currentWeek + d};renderWeeklyIntl()" title="${d < 0 ? 'Προηγούμενη' : 'Επόμενη'} εβδομάδα" style="flex-shrink:0;padding:6px 10px;cursor:pointer;border-radius:8px;background:var(--navy-mid,var(--navy-mid));color:rgba(196,207,219,.7);border:1px solid rgba(196,207,219,.12);font:inherit;font-size:14px;line-height:1">${d < 0 ? '‹' : '›'}</button>`;
  let html = step(-1);
  for (let w = currentWeek - 3; w <= currentWeek + 3; w++) {
    if (w < 1 || w > 52) continue;
    const isActive = w === currentWeek;
    const wS   = _wiWeekStart(w);
    const wE   = new Date(wS); wE.setDate(wS.getDate() + 6);
    const fmt  = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
    const bg   = isActive ? 'var(--accent,#0EA5E9)' : 'var(--navy-mid,var(--navy-mid))';
    const col  = isActive ? '#fff' : 'rgba(196,207,219,.7)';
    const fw   = isActive ? '700' : '500';
    html += `<button type="button" onclick="WINTL.week=${w};renderWeeklyIntl()" style="appearance:none;
      flex-shrink:0;padding:6px 14px;cursor:pointer;border-radius:8px;
      background:${bg};color:${col};
      font-family:'Syne',sans-serif;font-size:12px;font-weight:${fw};
      transition:background .12s;white-space:nowrap;text-align:center;
      border:1px solid ${isActive ? 'transparent' : 'rgba(196,207,219,.12)'};
    " onmouseover="this.style.background='${isActive?'var(--accent,#0EA5E9)':'rgba(14,165,233,.15)'}'"
       onmouseout="this.style.background='${bg}'">
      <div>W${w}</div>
      <div style="font-size:9px;opacity:.7;font-family:'DM Sans',sans-serif;margin-top:1px">${fmt(wS)}–${fmt(wE)}</div>
    </button>`;
  }
  html += step(1);
  if (currentWeek !== today) {
    html += `<button type="button" onclick="WINTL.week=${today};renderWeeklyIntl()" style="flex-shrink:0;margin-left:8px;padding:6px 12px;cursor:pointer;border-radius:8px;background:var(--accent-light);color:var(--accent);border:1px solid transparent;font-family:'Syne',sans-serif;font-size:12px;font-weight:700">Σήμερα · W${today}</button>`;
  }
  return html;
}

function _wiPaint(){
  const {rows,week,data,ui}=WINTL;
  const expRows=rows.filter(r=>r.type==='export');
  const impRows=rows.filter(r=>r.type==='import');
  const expN=data.exports.length, impN=data.imports.length;
  const assigned=expRows.filter(r=>r.saved).length;
  const pending=expRows.filter(r=>!r.saved).length;
  const matched=impRows.filter(r=>r.matchedTo).length;
  const unmatched=impRows.filter(r=>!r.matchedTo).length;
  // Β.3-3 (Wave 1): imports without a vehicle get their OWN counter — the same
  // red used to mean two different things and the header chip disagreed with
  // what the eye counted (VISUAL §Χρώμα).
  const impNoVehicle=impRows.filter(r=>!r.saved).length;
  const total=expRows.length+impRows.length;
  const pct=total?Math.round((assigned+matched)/total*100):0;

  // Report what this planner shows. weekNumber is the week the user is looking
  // at; weekNumberDefault is what _wiCurrentWeek() calls "today". That helper is
  // a THIRD week formula (Sunday-start WEEKNUM), separate from the canonical
  // isoWeekNumber() the Dashboard, Orders and Performance were unified on. The
  // two agree today and will not agree on every date — reporting both is how
  // the audit catches the next 31-vs-32 before a person does.
  if (typeof reportPageMetrics === 'function') reportPageMetrics('weekly_intl', {
    weekNumber: week,
    weekNumberDefault: _wiCurrentWeek(),
    exports: expN,
    imports: impN,
    assigned,
    pending,
    matched,
    unmatched,
    completionPct: pct,
  });

  // Command Center actions
  const actions=[];
  const _ico = (n, s) => (typeof icon === 'function') ? icon(n, s || 14) : '';
  // Π4 (Wave 1): every pending-work chip carries scrollTo → the FIRST row that
  // needs that action. _ccJump (command-center.js) scrolls + flashes it.
  const _firstExp = (pred) => { const r = expRows.find(pred); return r ? 'wi-row-'+r.id : undefined; };
  if(pending>0) actions.push({icon:_ico('file_text'),sev:'warn',text:`${pending} export${pending>1?'s':''} χωρίς ανάθεση`,scrollTo:_firstExp(r=>!r.saved)});
  const _firstUnmatchedImp = impRows.find(r=>!r.matchedTo);
  if(unmatched>0) actions.push({icon:_ico('package'),sev:'warn',text:`${unmatched} import${unmatched>1?'s':''} χωρίς match σε export`,scrollTo:_firstUnmatchedImp?'wi-imp-'+_firstUnmatchedImp.orderId:undefined});
  const missingTruck=expRows.filter(r=>r.saved && !r.truckId && !r.partnerId).length;
  if(missingTruck>0) actions.push({icon:_ico('truck'),sev:'warn',text:`${missingTruck} assigned χωρίς truck/partner`,scrollTo:_firstExp(r=>r.saved && !r.truckId && !r.partnerId)});
  const missingDriver=expRows.filter(r=>r.saved && r.truckId && !r.driverId && !r.partnerId).length;
  if(missingDriver>0) actions.push({icon:_ico('user'),sev:'warn',text:`${missingDriver} με truck αλλά χωρίς driver`,scrollTo:_firstExp(r=>r.saved && r.truckId && !r.driverId && !r.partnerId)});
  if(!actions.length && total>0 && pct===100) actions.push({icon:_ico('party'),sev:'ok',text:'Όλα assigned + matched για την εβδομάδα!'});
  else if(!actions.length && total>0) actions.push({icon:_ico('check'),sev:'ok',text:'No pending actions'});

  document.getElementById('content').innerHTML=`
    <div style="display:block;width:100%">
    <!-- Horizontal week bar -->
    <div id="wi-week-bar" style="
      display:flex;flex-direction:row;gap:4px;align-items:center;
      overflow-x:auto;padding:0 0 12px 0;
      scrollbar-width:thin;width:100%;
    ">
      ${_wiWeekSidebarItems(week)}
    </div>
    <div style="display:block;width:100%">

    <!-- Command Center (universal component) — always shown for week consistency -->
    ${(()=>{
      // Compute widgets synchronously
      const assignedTruckIds = new Set();
      rows.forEach(r => { if (r.truckId) assignedTruckIds.add(r.truckId); });
      // Π5α (Wave 1): real unmatched counts, not the country-prefix heuristic —
      // measured on W20 the heuristic said 10 while reality was 36 (02 §3).
      // soloExp = exports with no return import; soloImp = imports with no export.
      const soloExp = expRows.filter(r => !r.importId).length;
      const widgets = [
        widgetFleet(data.trucks || [], assignedTruckIds),
        widgetEmptyLegs(soloExp, unmatched),
        `<div id="wi-cc-vswk" style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px"><div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">${_ico('bar_chart',11)} ΣΕ ΣΧΕΣΗ ΜΕ ΠΡΟΗΓΟΥΜΕΝΗ</div><div style="font-size:11px;opacity:0.5">loading…</div></div>`,
        // Π5β (Wave 1): the on-time widget is HIDDEN for current/past weeks —
        // recorded on-time is 16% while the real figure is ~100% (owner, 00
        // §Β7): the data lies downward, so showing it defames the team. It
        // returns with Wave 2 when the «Παραδόθηκε» flow makes recording cheap.
        // On a FUTURE week (still being built) execution hasn't started, so we
        // say exactly that instead of a red 0%.
        ...(week > _wiCurrentWeek() ? [
          `<div style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px"><div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">${_ico('clock',11)} ΣΥΝΕΠΕΙΑ ΠΑΡΑΔΟΣΗΣ</div><div style="display:flex;align-items:baseline;gap:6px"><span style="font-size:18px;font-weight:700;font-family:'Syne',sans-serif;opacity:.55">—</span><span style="font-size:11px;opacity:0.6">δεν έχει ξεκινήσει</span></div></div>`,
        ] : []),
      ];
      // When week has no orders, provide a single informational action so the strip isn't empty.
      const ccActions = total > 0 ? actions : [{icon:_ico('info'), sev:'ok', text:'Καμία παραγγελία για αυτή την εβδομάδα ακόμη'}];
      // WI-4: three titles and four repetitions of the week number pushed the
      // table below the fold. The Command Center now collapses to one 44px
      // summary line, and remembers the choice — a dispatcher who wants the
      // table first should not have to close it every morning.
      const open = localStorage.getItem('tms_cc_open') !== '0';
      return `<details ${open ? 'open' : ''} ontoggle="localStorage.setItem('tms_cc_open', this.open ? '1' : '0')" style="margin-bottom:var(--space-3)">
        <summary style="cursor:pointer;list-style:none;height:44px;display:flex;align-items:center;gap:12px;padding:0 14px;background:var(--navy-mid,var(--navy-mid));color:#C4CFDB;border-radius:8px;font-size:12px">
          <span style="font-family:'Syne',sans-serif;font-weight:700;letter-spacing:1px">COMMAND CENTER · W${week}</span>
          <span style="opacity:.7">${expN} εξαγ · ${impN} εισαγ · ${pct}% ολοκληρωμένο</span>
          <span style="margin-left:auto;opacity:.5">▾</span>
        </summary>
        ${buildCommandCenterHTML({ title: `COMMAND CENTER · W${week}`, pct, actions: ccActions, widgets })}
      </details>`;
    })()}

    <!-- Search/filter bar -->
    <div class="entity-toolbar-v2" style="margin-bottom:var(--space-3)">
      <div class="entity-search-wrap">
        ${_ico('search')}
        <input id="wi-search" class="entity-search-input" type="text" placeholder="Αναζήτηση πελάτη / φορτηγού / οδηγού / τοποθεσίας…" oninput="WINTL.filter=this.value.toLowerCase().trim();_wiApplyFilter()" value="${WINTL.filter||''}">
      </div>
      <select class="svc-filter" onchange="WINTL.filterStatus=this.value;_wiApplyFilter()">
        <option value="">Όλες οι καταστάσεις</option>
        <option value="pending" ${WINTL.filterStatus==='pending'?'selected':''}>Χωρίς ανάθεση</option>
        <option value="assigned" ${WINTL.filterStatus==='assigned'?'selected':''}>Ανατεθειμένα</option>
        <option value="unmatched" ${WINTL.filterStatus==='unmatched'?'selected':''}>Εισαγωγές χωρίς ταίριασμα</option>
      </select>
      ${WINTL.filter||WINTL.filterStatus?`<button class="btn btn-ghost btn-sm" onclick="WINTL.filter='';WINTL.filterStatus='';document.getElementById('wi-search').value='';_wiApplyFilter()">${_ico('x', 12)} Καθαρισμός</button>`:''}
    </div>

    <div class="page-header" style="margin-bottom:var(--space-3)">
      <div>
        <div class="page-title">Weekly International</div>
        <div class="page-sub" style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-top:4px;align-items:center;font-size:12px">
          <span style="color:var(--text-mid)">Εβδομάδα ${week} · ${_wiWeekRange(week)}</span>
          ${typeof weekPhaseBadge==='function'?weekPhaseBadge(week,_wiCurrentWeek()):''}
          <span class="entity-count-chip" style="background:rgba(16,185,129,0.12);color:var(--success);border-color:transparent">${expN} εξαγωγές</span>
          <span class="entity-count-chip" style="background:rgba(245,158,11,0.12);color:var(--warning);border-color:transparent">${impN} εισαγωγές</span>
          <span class="entity-count-chip" style="background:rgba(2,132,199,0.10);color:var(--accent);border-color:transparent">${assigned} ανατεθειμένα</span>
          ${pending>0?`<span class="entity-count-chip" style="background:rgba(220,38,38,0.10);color:var(--danger);border-color:transparent">${pending} χωρίς ανάθεση</span>`:''}
          ${impNoVehicle>0?`<span class="entity-count-chip" style="background:rgba(220,38,38,0.06);color:var(--danger);border:1px dashed rgba(220,38,38,0.45)" title="Εισαγωγές χωρίς δικό τους όχημα — ξεχωριστός μετρητής από τα exports">${impNoVehicle} εισαγ. χωρίς όχημα</span>`:''}
          <span style="color:var(--text-dim);font-size:11px">${matched} ταιριασμένα · ${unmatched} ελεύθερα</span>
          <span id="wi-crossweek-in"></span>
        </div>
      </div>
      <div style="display:flex;gap:var(--space-2);align-items:center">
        ${unmatched>0?`<button class="btn btn-ghost btn-sm" title="Περιορισμένο: χωρίς συντεταγμένες τοποθεσιών (LO-1) σκοράρει μόνο με ημερομηνίες — σπάνια θα προτείνει ζεύγη" onclick="_wiAutoMatch()">${_ico('zap', 14)} Αυτόματο ταίριασμα (${unmatched})</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="_wiPrintWeek()">${_ico('file_text', 14)} Εκτύπωση</button>
        <button class="btn btn-secondary btn-sm" onclick="renderWeeklyIntl()">${_ico('refresh', 14)} Ανανέωση</button>
        <button class="btn btn-ghost btn-sm" onclick="_wiExportCSV()">${_ico('file_text', 14)} Εξαγωγή CSV</button>
      </div>
    </div>

    <div class="wi-wrap" style="overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 180px);">
      <div class="wi-head" style="background:#B8C4D0">
        <div class="wi-hc" style="text-align:center;color:#091828;border-right:1px solid rgba(9,24,40,0.12)">#</div>
        <div class="wi-hc" style="text-align:center;color:#091828;font-weight:800;letter-spacing:1.8px;border-right:1px solid rgba(9,24,40,0.12);display:flex;align-items:center;justify-content:center;gap:8px">
          ↑ ΕΞΑΓΩΓΗ
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:#091828;color:#B8C4D0;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0">${expN}</span>
          <span style="font-weight:400;font-size:11px;opacity:0.7;letter-spacing:0.5px;text-transform:none">δεξί κλικ για ομαδοποίηση</span>
        </div>
        <div class="wi-hc" style="text-align:center;color:#091828;opacity:0.5;letter-spacing:1.8px;border-right:1px solid rgba(9,24,40,0.12)">
          ΑΝΑΘΕΣΗ
        </div>
        <div class="wi-hc" style="text-align:center;color:#091828;font-weight:800;letter-spacing:1.8px;display:flex;align-items:center;justify-content:center;gap:8px">
          ↓ ΕΙΣΑΓΩΓΗ
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:#091828;color:#B8C4D0;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0">${impN}</span>
          <span style="font-weight:400;font-size:11px;opacity:0.7;letter-spacing:0.5px;text-transform:none">σύρε για ταίριασμα</span>
        </div>
      </div>
      <div id="wi-rows">
        ${rows.length?_wiAllRowsHTML():`
          <div class="empty-state" style="padding:60px">
            <p>Καμία εξαγωγή για την εβδομάδα ${week}</p>
          </div>`}
      </div>
    </div>
    <div id="wi-ctx"></div>
    <div id="wi-popover"></div>
    </div><!-- /main -->
    </div><!-- /block wrapper -->
  `;
  window._wiDragging=null;

  // Async: fill "vs last week" + "on-time streak" widgets after initial render.
  //
  // Two fixes combined here — #28 and the 2026-08-04 audit found different
  // halves of the same problem:
  //
  // 1. FAILURE (#28): each source is isolated with safeFetch, and a failed one
  //    HIDES its widget instead of rendering a zero. Hiding beats a zero:
  //    "0 last week" renders as a record week and a 0% streak renders as a
  //    service collapse, both plausible enough to be believed.
  //
  // 2. EMPTY WEEK (audit WI-1): this block sat inside `if (total > 0)`, so a
  //    week with no orders left both placeholders reading "loading…" forever —
  //    a loading state for a request that was never going to be made (measured:
  //    0 network calls in 8s). The guard is gone: on an empty week the fetches
  //    run and the widgets show real zeros, which is a fact rather than a
  //    fabrication. Either way, no visible "loading…" outlives the render.
  // Π5β (Wave 1): fetchOnTimeStreak is no longer called — the widget is hidden
  // (or static «δεν έχει ξεκινήσει» on future weeks) until recording is fixed.
  safeFetch(() => fetchPreviousWeekStats(week, TABLES.ORDERS), 'weekly intl: previous week stats', {total:0,assigned:0})
  .then(prev => {
    const el1 = document.getElementById('wi-cc-vswk');
    if (el1) el1.outerHTML = didFail(prev) ? '' : widgetVsLastWeek(total, prev.total, assigned+matched, prev.assigned);
  }).catch(e => console.warn('CC async widgets:', e));

  // T4 (Wave 2), the blind half: exports PLANNED in W+1 that LOAD inside this
  // week — invisible here because exports filter by delivery week (PREMORTEM
  // T4: «η φόρτωση χάνεται τη στιγμή που συμβαίνει»). Current week only, one
  // filtered fetch; failure just leaves the chip empty.
  if (week === _wiCurrentWeek()) {
    const ws2=_wiWeekStart(week), we2=new Date(ws2); we2.setDate(ws2.getDate()+6);
    const f2=`AND({Type}='International',{Direction}='Export',{Week Number}=${week+1},IS_AFTER({Loading DateTime},'${toLocalDate(new Date(ws2.getTime()-86400000))}'),IS_BEFORE({Loading DateTime},'${toLocalDate(new Date(we2.getTime()+86400000))}'))`;
    safeFetch(() => atGetAll(TABLES.ORDERS,{filterByFormula:f2,fields:['Loading Summary','Loading DateTime']},false), 'weekly intl: cross-week incoming', [])
    .then(recs => {
      const el=document.getElementById('wi-crossweek-in');
      if(!el||didFail(recs)||!recs.length) return;
      const names=recs.slice(0,3).map(r=>_wiClean(r.fields['Loading Summary']||'').slice(0,18)).filter(Boolean).join(' · ');
      el.outerHTML=`<span class="entity-count-chip" style="background:var(--accent-light);color:var(--accent);border-color:transparent" title="Πλάνο W${week+1} με φόρτωση ΜΕΣΑ σε αυτή την εβδομάδα — δες τη W${week+1} για ανάθεση. ${names}">↦ ${recs.length} φορτών${recs.length>1?'ουν':'ει'} τώρα · πλάνο W${week+1}</span>`;
    }).catch(e => console.warn('cross-week incoming:', e));
  }
}



/* ── ALL ROWS ──────────────────────────────────────────────────────── */
function _wiAllRowsHTML(){
  const expRows=WINTL.rows.filter(r=>r.type==='export');
  const impRows=WINTL.rows.filter(r=>r.type==='import');
  let html='',idx=0,impIdx=0;

  // Build date groups — key = raw date string (YYYY-MM-DD)
  // exports: keyed by delivery date, imports: keyed by loading date
  const groups={}; // rawDate → {lbl, rawDate, exps:[], imps:[]}

  expRows.forEach(row=>{
    const exp=WINTL.data.exports.find(r=>r.id===row.orderIds[0]);
    const raw=toLocalDate(exp?.fields['Delivery DateTime']||exp?.fields['Loading DateTime']||'');
    const lbl=_wiDelDate(row)||'—';
    if(!groups[raw]) groups[raw]={lbl,rawDate:raw,exps:[],imps:[]};
    groups[raw].exps.push(row);
  });

  impRows.forEach(row=>{
    const imp=WINTL.data.imports.find(r=>r.id===row.orderId);
    const raw=toLocalDate(imp?.fields['Loading DateTime']||'');
    const lbl=raw?_wiFmtFull(imp?.fields['Loading DateTime']||''):'—';
    if(!groups[raw]) groups[raw]={lbl,rawDate:raw,exps:[],imps:[]};
    groups[raw].imps.push(row);
  });

  // Sort groups by raw date
  const sorted=Object.values(groups).sort((a,b)=>a.rawDate.localeCompare(b.rawDate));

  // T5 (Wave 2): mark TODAY's separator so the eye lands on «τώρα» first.
  const todayKey=(typeof localToday==='function')?localToday():toLocalDate(new Date());

  sorted.forEach(grp=>{
    const expCount=grp.exps.length;
    const impCount=grp.imps.length;
    const isToday=grp.rawDate===todayKey;

    // Separator — same dark navy style as before
    html+=`<div class="wi-dsep${isToday?' wi-dsep--today':''}">
      <span class="wi-dsep-lbl">Date</span>
      <span class="wi-dsep-date">${grp.lbl}</span>
      ${isToday?'<span class="wi-dsep-todaytag">ΣΗΜΕΡΑ</span>':''}
      ${expCount?`<span class="wi-dsep-n" style="color:rgba(196,207,219,0.55)">${expCount} exp</span>`:''}
      ${impCount?`<span class="wi-dsep-n" style="color:rgba(14,165,233,0.7);margin-left:2px">${impCount} imp</span>`:''}
    </div>`;

    // Export rows
    grp.exps.forEach(row=>{ html+=_wiRowHTML(row,idx++); });

    // Only unmatched imports shown as rows — numbered I1… (Β.3-4) so «γραμμή
    // I3» means something on the phone between two dispatchers.
    grp.imps.filter(r=>!r.matchedTo).forEach(row=>{ html+=_wiImpRowHTML(row,++impIdx); });
  });

  return html;
}


/* ── IMPORT ROW ──────────────────────────────────────────────────── */
function _wiImpRowHTML(row,impNo){
  const {data}=WINTL;
  const imp=data.imports.find(r=>r.id===row.orderId);
  if(!imp) return '';
  const f=imp.fields;
  const fromStr=_wiClean(f['Loading Summary']||f['Client Name']||f['Client Summary']||'—');
  const toStr  =_wiClean(f['Delivery Summary']||f['Client Name']||f['Client Summary']||'—');
  const clientName=_wiClean((f['Client Name']||f['Client Summary']||'').split(',')[0].trim()||'');
  const pals   =f['Total Pallets']||0;
  const loadDt =_wiFmt(f['Loading DateTime']);
  const delDt  =_wiFmt(f['Delivery DateTime']);
  const impRef2=f['Reference']||'';
  const isMatched=!!row.matchedTo;

  // Find which export it's matched to
  let matchedExp=null;
  if(row.matchedTo){
    const mRow=WINTL.rows.find(r=>r.type==='export'&&r.orderIds.includes(row.matchedTo));
    if(mRow){
      const mExp=data.exports.find(r=>r.id===mRow.orderIds[0]);
      matchedExp=mExp?_wiClean(mExp.fields['Delivery Summary']||'').slice(0,24):'';
    }
  }

  const matchBadge2=isMatched
    ?`<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;
                   background:rgba(15,23,42,0.08);color:#0F172A;
                   border:1px solid rgba(15,23,42,0.2)">${matchedExp||'matched'}</span>`
    :`<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;
                   background:var(--bg);color:var(--text-dim);
                   border:1px solid var(--border-mid)">unmatched</span>`;
  const matchBadge=isMatched
    ?`<span style="font-size:8.5px;font-weight:700;padding:2px 7px;border-radius:3px;
                   background:rgba(15,23,42,0.08);color:#0F172A;
                   border:1px solid rgba(15,23,42,0.2);white-space:nowrap;flex-shrink:0">
        ✓ ${matchedExp||'matched'}
      </span>`
    :`<span style="font-size:8.5px;font-weight:700;padding:2px 7px;border-radius:3px;
                   background:rgba(14,165,233,0.1);color:rgba(14,165,233,0.9);
                   border:1px solid rgba(14,165,233,0.25);flex-shrink:0">
        unmatched
      </span>`;

  // Import row — full 4-col grid, always draggable, has assignment + match cell
  const impTruck   =row.truckLabel   ||WINTL.data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const impTrailer =row.trailerLabel ||WINTL.data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  const impPartner =row.partnerLabel ||WINTL.data.partners.find(p=>p.id===row.partnerId)?.label||'';
  const impSurname =row.driverLabel  ?row.driverLabel.trim().split(/\s+/)[0]:'';
  let impPill;
  if(row.saved){
    if(impPartner){
      impPill=`<div class="wi-pill">
        <div class="wi-card wi-card-bp">
          <div class="wi-card-top">${escapeHtml(impPartner.slice(0,26))}${impPartner.length>26?'…':''}</div>
          ${row.partnerPlates?`<div class="wi-card-bot">${escapeHtml(row.partnerPlates)}</div>`:''}
        </div>
      </div>`;
    } else {
      const impTruckLine=[impTruck,impTrailer].filter(Boolean).join(' · ');
      impPill=`<div class="wi-pill"><div class="wi-card wi-card-ok">
        <div class="wi-card-top">${escapeHtml(impTruckLine||'—')}</div>
        ${impSurname?`<div class="wi-card-bot">${escapeHtml(row.driverLabel||'')}</div>`:''}
      </div></div>`;
    }
  } else {
    // Β.3-3: import-without-vehicle is NOT the same red as export-without-
    // assignment — dashed border (non-color signal) + explicit prefix.
    impPill=`<div class="wi-pill"><div class="wi-card wi-card-un wi-card-un--imp"><div class="wi-card-top">ΕΙΣ · χωρίς όχημα</div></div></div>`;
  }

  const matchCell=isMatched
    ?`<div class="wi-ci-data">
        <div class="wi-route">
          <span class="from">${fromStr}</span>
          <span class="sep">→</span>
          <span class="dest">${toStr}</span>
        </div>
        <div class="wi-sub">
          ${clientName?`<span style="font-weight:700">${clientName}</span><span class="wi-sub-div"></span>`:''}
          ${loadDt!=='—'?`<span>${loadDt} → ${delDt}</span>`:''}
          ${loadDt!=='—'&&pals?`<span class="wi-sub-div"></span>`:''}
          ${pals?`<span>${pals} pal</span>`:''}
          ${impRef2?`<span class="wi-sub-div"></span><span style="color:var(--text-dim);font-style:italic">ref: ${escapeHtml(impRef2)}</span>`:''}
          ${_wiBadges(f)}
        </div>
        <span class="wi-ci-save">✓ matched → ${matchedExp||''}</span>
      </div>`
    :`<div class="wi-ci-data">
        <div class="wi-route">
          <span class="from">${fromStr}</span>
          <span class="sep">→</span>
          <span class="dest">${toStr}</span>
        </div>
        <div class="wi-sub">
          ${clientName?`<span style="font-weight:700">${clientName}</span><span class="wi-sub-div"></span>`:''}
          ${loadDt!=='—'?`<span>${loadDt} → ${delDt}</span>`:''}
          ${loadDt!=='—'&&pals?`<span class="wi-sub-div"></span>`:''}
          ${pals?`<span>${pals} pal</span>`:''}
          ${impRef2?`<span class="wi-sub-div"></span><span style="color:var(--text-dim);font-style:italic">ref: ${escapeHtml(impRef2)}</span>`:''}
          ${_wiBadges(f)}
        </div>
      </div>`;

  return `<div id="wi-imp-${imp.id}" data-row-id="${row.id}"
    class="wi-row"
    style="background:rgba(14,165,233,0.022);border-top:1px solid rgba(14,165,233,0.1)"
    draggable="true"
    ondragstart="event.stopPropagation();_wiImpDragStart(event,'${imp.id}')">
    <div class="wi-compact" ondragstart="event.stopPropagation();_wiImpDragStart(event,'${imp.id}')">
      <div class="wi-cn" style="cursor:grab" title="Εισαγωγή ${impNo||''}">
        <span class="wi-num" style="font-size:11px;color:rgba(14,165,233,0.85)">I${impNo||''}</span>
      </div>
      <!-- Β.3-1 ΑΝΑΙΡΕΘΗΚΕ (owner, 8/8 βράδυ): το γέμισμα της κενής EXPORT
           κυψέλης διάβαζε ως θόρυβος — στο Excel τους τα κενά κελιά είναι
           φυσιολογικά και σηματοδοτούν «δεν υπάρχει σκέλος». Μένει κενό. -->
      <div class="wi-ce" style="background:var(--navy-mid)"></div>
      <div class="wi-ca-wrap" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="event.stopPropagation();_wiOpenImpPopover(event,'${imp.id}',${row.id})">
        ${isMatched
          ?`<button class="wi-side-btn" title="Remove match"
                onclick="event.stopPropagation();_wiUnmatch('${imp.id}')">✕</button>`
          :`<div style="width:30px;flex-shrink:0"></div>`}
        <div style="width:240px;display:flex;align-items:center;justify-content:center;padding:4px 0;cursor:pointer">
          ${impPill}
        </div>
        <button class="wi-side-btn" title="Print Import"
                onclick="event.stopPropagation();_wiPrintImp('${imp.id}')"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="10" height="6" rx="1"/><path d="M5 13H3a1 1 0 01-1-1V8a1 1 0 011-1h14a1 1 0 011 1v4a1 1 0 01-1 1h-2"/><path d="M5 7V3h10v4"/></svg></button>
      </div>
      <div class="wi-ci" style="cursor:grab;background:rgba(14,165,233,0.03)">
        ${matchCell}
      </div>
    </div>
  </div>`;
}

function _wiDelDate(row){
  const exp=WINTL.data.exports.find(r=>r.id===row.orderIds[0]);
  const raw=exp?.fields['Delivery DateTime']||exp?.fields['Loading DateTime']||null;
  return raw?_wiFmtFull(raw):null;
}

/* ── ROW HTML ──────────────────────────────────────────────────────── */
function _wiBadges(f){
  const b=[];
  if(f['High Risk Flag'])   b.push('<span class="wi-badge wi-b-risk">! Risk</span>');
  if(f['Pallet Exchange'])  b.push('<span class="wi-badge wi-b-pe">PE</span>');
  if(f['National Groupage'])b.push('<span class="wi-badge wi-b-grpg">GRP</span>');
  const veroia=f['Veroia Switch'];
  if(veroia)                b.push('<span class="wi-badge wi-b-veroia">Veroia</span>');

  return b.join('');
}

/* ── WAVE 2 HELPERS (T3/T4/T5/T1 — PREMORTEM) ─────────────────────── */
// T5: execution flags, CURRENT week only. A load whose time passed with no
// assignment (or stuck on Assigned) turns visible in the morning — the
// partner no-show stops hiding until the afternoon.
function _wiExecChip(f, saved){
  if(WINTL.week!==_wiCurrentWeek()||!f) return '';
  const ld=f['Loading DateTime']; if(!ld) return '';
  if(new Date(ld)>new Date()) return '';
  const st=f['Status']||'';
  if(!saved) return '<span class="wi-exec wi-exec--late" title="Η ώρα φόρτωσης πέρασε χωρίς ανάθεση">⚠ φόρτωση χωρίς ανάθεση</span>';
  if(st==='Assigned') return '<span class="wi-exec wi-exec--stale" title="Η ώρα φόρτωσης πέρασε και η κατάσταση μένει Assigned — έλεγξε αν ξεκίνησε">⏱ πέρασε η φόρτωση · χωρίς εξέλιξη</span>';
  return '';
}
// T4: exports live in their DELIVERY week — flag the ones loading in another
// week, because in that week's view this line does NOT exist.
function _wiWeekOf(dt){ if(!dt) return null; try{const d=new Date(dt),y=d.getFullYear(),j=new Date(y,0,1); return Math.ceil(((d-j)/864e5+j.getDay()+1)/7);}catch{return null;} }
function _wiCrossChip(f){
  const lw=_wiWeekOf(f?.['Loading DateTime']);
  if(lw==null||lw===WINTL.week) return '';
  return `<span class="wi-cross" title="Η φόρτωση πέφτει στη W${lw} — στην προβολή της W${lw} αυτή η γραμμή δεν εμφανίζεται (φίλτρο ανά εβδομάδα ΠΑΡΑΔΟΣΗΣ)">↤ φορτώνει W${lw}</span>`;
}
// T3: per-row sync state — what you see has (or has not) reached the server.
function _wiSync(id, state, msg){
  const el=document.getElementById(id); if(!el) return;
  el.className='wi-sync'+(state?' wi-sync--'+state:'');
  el.textContent=state==='pend'?'⟳':state==='ok'?'✓':state==='err'?'⚠':'';
  el.title=msg||'';
  if(state==='ok') setTimeout(()=>{ if(el.textContent==='✓'){el.textContent='';el.className='wi-sync';} },4000);
}
// T1: same-day double-booking guard. Reuse across DIFFERENT days is normal
// fleet work (W21 had legit ×2) — only a same-day clash asks for a confirm.
function _wiSameDayConflict(row){
  const myO=WINTL.data.exports.find(x=>x.id===row.orderIds?.[0])||WINTL.data.imports.find(x=>x.id===row.orderId);
  const myD=toLocalDate(myO?.fields['Loading DateTime']||''); if(!myD) return null;
  for(const r of WINTL.rows){ if(r.id===row.id) continue;
    if(!r.truckId&&!r.driverId) continue;
    const o=WINTL.data.exports.find(x=>x.id===r.orderIds?.[0])||WINTL.data.imports.find(x=>x.id===r.orderId);
    if(toLocalDate(o?.fields['Loading DateTime']||'')!==myD) continue;
    if(row.truckId&&r.truckId===row.truckId) return `Το φορτηγό ${row.truckLabel||''} έχει ήδη φόρτωση την ίδια μέρα (${myD.slice(5)}).`;
    if(row.driverId&&r.driverId===row.driverId) return `Ο οδηγός ${row.driverLabel||''} έχει ήδη φόρτωση την ίδια μέρα (${myD.slice(5)}).`;
  }
  return null;
}

function _wiRowHTML(row,i){
  const {data,ui}=WINTL;
  const exps   =row.orderIds.map(id=>data.exports.find(r=>r.id===id)).filter(Boolean);
  const imp    =row.importId?data.imports.find(r=>r.id===row.importId):null;
  const isOpen =ui.openRow===row.id;
  const isGroup=exps.length>1;
  const primary=exps[0];

  // Classic design — no colored dots on row numbers
  const hasPartner=!!(row.partnerLabel||data.partners.find(p=>p.id===row.partnerId)?.label);
  let sCls='s-default';

  const fromStr=primary?_wiClean(primary.fields['Loading Summary']||primary.fields['Client Name']||primary.fields['Client Summary']||'—'):'—';
  const toStr  =primary?_wiClean(primary.fields['Delivery Summary']||primary.fields['Client Name']||primary.fields['Client Summary']||'—'):'—';
  const pals   =isGroup?exps.reduce((s,r)=>s+(r.fields['Total Pallets']||0),0):
                        (primary?.fields['Total Pallets']||0);
  const loadDt =_wiFmt(primary?.fields['Loading DateTime']);
  const delDt  =_wiFmt(primary?.fields['Delivery DateTime']);
  const ref    =primary?.fields['Reference']||'';

  // Assignment pill
  const truck  =row.truckLabel  ||data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const trailer=row.trailerLabel||data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  const driver =row.driverLabel ||data.drivers.find(d=>d.id===row.driverId)?.label||'';
  const partner=row.partnerLabel||data.partners.find(p=>p.id===row.partnerId)?.label||'';
  const surname=driver?driver.trim().split(/\s+/)[0]:'';

  let pill;
  if(row.saved){
    if(partner){
      pill=`<div class="wi-pill">
        <div class="wi-card wi-card-bp">
          <div class="wi-card-top">${escapeHtml(partner.slice(0,26))}${partner.length>26?'…':''}</div>
          ${row.partnerPlates?`<div class="wi-card-bot">${escapeHtml(row.partnerPlates)}</div>`:''}
        </div>
      </div>`;
    } else {
      const truckLine=[truck,trailer].filter(Boolean).join(' · ');
      pill=`<div class="wi-pill"><div class="wi-card wi-card-ok">
        <div class="wi-card-top">${escapeHtml(truckLine||'—')}</div>
        ${surname?`<div class="wi-card-bot">${escapeHtml(row.driverLabel||'')}</div>`:''}
      </div></div>`;
    }
  } else {
    pill=`<div class="wi-pill"><div class="wi-card wi-card-un"><div class="wi-card-top">— Unassigned</div></div></div>`;
  }

  // Import preview — saved state shown (full details like export)
  const impClientName=imp?_wiClean((imp.fields['Client Name']||imp.fields['Client Summary']||'').split(',')[0].trim()||''):'';
  const impRef=imp?imp.fields['Reference']||'':'';
  const impLoadDt=imp?_wiFmt(imp.fields['Loading DateTime']):'';
  const impDelDt=imp?_wiFmt(imp.fields['Delivery DateTime']):'';
  const impPals=imp?imp.fields['Total Pallets']||0:0;
  const impPrev=imp
    ?`<div class="wi-ci-data">
        <div class="wi-route">
          <span class="from">${_wiClean(imp.fields['Loading Summary']||imp.fields['Client Name']||imp.fields['Client Summary']||'—')}</span>
          <span class="sep">→</span>
          <span class="dest">${_wiClean(imp.fields['Delivery Summary']||imp.fields['Client Name']||imp.fields['Client Summary']||'—')}</span>
        </div>
        <div class="wi-sub">
          ${impClientName?`<span style="font-weight:700">${impClientName}</span><span class="wi-sub-div"></span>`:''}
          ${impLoadDt!=='—'?`<span>${impLoadDt} → ${impDelDt}</span>`:''}
          ${impLoadDt!=='—'&&impPals?`<span class="wi-sub-div"></span>`:''}
          ${impPals?`<span>${impPals} pal</span>`:''}
          ${impRef?`<span class="wi-sub-div"></span><span style="color:var(--text-dim);font-style:italic">ref: ${escapeHtml(impRef)}</span>`:''}
          ${_wiBadges(imp.fields)}
        </div>
        <span style="font-size:9px;color:#0F172A;font-weight:600;opacity:0.5">↩ matched</span>
      </div>`
    :`<div style="width:100%;height:100%;display:flex;align-items:center;
  background:${row.saved&&!hasPartner?'#3B1111':'#172C45'};margin:-6px -12px;padding:6px 12px;min-height:46px;">
  <span style="font-size:10px;color:${row.saved&&!hasPartner?'rgba(252,165,165,0.5)':'rgba(196,207,219,0.35)'};font-style:italic;letter-spacing:0.3px;">${row.saved&&!hasPartner?'⚠ needs import':'drag import here'}</span>
</div>`;

  return `
  <div id="wi-row-${row.id}" data-row-id="${row.id}" class="wi-row ${sCls}">
    <div class="wi-compact" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="_wiToggle(${row.id})">
      <div class="wi-cn">
        <span class="wi-num">${i+1}</span>
        <span class="wi-sync" id="wi-sync-${row.id}"></span>
      </div>
      <div class="wi-ce" oncontextmenu="_wiCtx(event,${row.id},event)" style="position:relative">
        <div class="wi-route">
          <span class="from">${fromStr}</span>
          <span class="sep">→</span>
          <span class="dest">${toStr}</span>
          ${isGroup?`<span class="wi-gr" onclick="event.stopPropagation();_wiToggleGroup(${row.id})" style="cursor:pointer">×${exps.length} ▾</span><button class="wi-side-btn" style="width:auto;padding:0 8px;font-size:9px;font-weight:800;letter-spacing:.3px" title="Εκτύπωση ομάδας — ${exps.length} έγγραφα σε ένα πακέτο" onclick="event.stopPropagation();_wiPrintGroup(${row.id})">⎙ ομάδα ×${exps.length}</button>`:''}
        </div>
        <div class="wi-sub">
          ${loadDt!=='—'?`<span>${loadDt} → ${delDt}</span>`:''}
          ${loadDt!=='—'&&pals?`<span class="wi-sub-div"></span>`:''}
          ${pals?`<span>${pals} pal</span>`:''}
          ${ref?`<span class="wi-sub-div"></span><span style="color:var(--text-dim);font-style:italic">ref: ${escapeHtml(ref)}</span>`:''}
          ${_wiBadges(primary?.fields||{})}
          ${_wiCrossChip(primary?.fields)}${_wiExecChip(primary?.fields,row.saved)}
        </div>
      </div>
      <div class="wi-ca-wrap" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="event.stopPropagation();_wiOpenPopover(event,${row.id})">
        <button class="wi-side-btn" title="Print Export"
                onclick="event.stopPropagation();_wiPrint(${row.id},'export')"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="10" height="6" rx="1"/><path d="M5 13H3a1 1 0 01-1-1V8a1 1 0 011-1h14a1 1 0 011 1v4a1 1 0 01-1 1h-2"/><path d="M5 7V3h10v4"/></svg></button>
        <div style="width:240px;display:flex;align-items:center;justify-content:center;
                    padding:4px 0;cursor:pointer">
          ${pill}
        </div>
        ${row.importId
          ?`<button class="wi-side-btn" title="Print Import"
                onclick="event.stopPropagation();_wiPrint(${row.id},'import')"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="10" height="6" rx="1"/><path d="M5 13H3a1 1 0 01-1-1V8a1 1 0 011-1h14a1 1 0 011 1v4a1 1 0 01-1 1h-2"/><path d="M5 7V3h10v4"/></svg></button>`
          :`<div style="width:30px;flex-shrink:0"></div>`}
      </div>
      <div class="wi-ci" id="wi-ci-${row.id}"
           onclick="event.stopPropagation()"
           ondragover="event.preventDefault();document.getElementById('wi-ci-${row.id}').classList.add('dh')"
           ondragleave="document.getElementById('wi-ci-${row.id}').classList.remove('dh')"
           ondrop="event.stopPropagation();_wiDropOnRow(event,${row.id})"
           style="position:relative">
        ${impPrev}
      </div>

    </div>
    ${isOpen?_wiPanelHTML(row):''}
  </div>`;
}

/* ── PANEL HTML ────────────────────────────────────────────────────── */
function _wiPanelHTML(row){
  const {trucks,trailers,drivers,partners}=WINTL.data;
  const canFull=can('planning')==='full';
  const imp=row.importId?WINTL.data.imports.find(r=>r.id===row.importId):null;

  const savedTruck  = row.truckLabel  ||trucks.find(t=>t.id===row.truckId)?.label  ||'';
  const savedTrailer= row.trailerLabel||trailers.find(t=>t.id===row.trailerId)?.label||'';
  const savedDriver = row.driverLabel ||drivers.find(d=>d.id===row.driverId)?.label  ||'';
  const savedPartner= row.partnerLabel||partners.find(p=>p.id===row.partnerId)?.label||'';

  return `
  <div class="wi-panel" onclick="event.stopPropagation()">

    <div class="wi-panel-top">
      <!-- OWNED FLEET -->
      <div style="display:flex;flex-direction:column;gap:2px">
        <div class="wi-section-lbl">Owned Fleet</div>
        <div style="display:flex;gap:6px;align-items:flex-end">
          <div class="wi-pf">
            <span class="wi-plbl">Truck</span>
            ${_wiSdrop('tk',row.id,trucks,row.truckId,savedTruck||'Plate…')}
          </div>
          <div class="wi-pf">
            <span class="wi-plbl">Trailer</span>
            ${_wiSdrop('tl',row.id,trailers,row.trailerId,savedTrailer||'Plate…')}
          </div>
          <div class="wi-pf">
            <span class="wi-plbl">Driver</span>
            ${_wiSdrop('dr',row.id,drivers,row.driverId,savedDriver||'Name…')}
          </div>
        </div>
      </div>

      <div class="wi-div" style="height:52px"></div>

      <!-- PARTNER -->
      <div style="display:flex;flex-direction:column;gap:2px">
        <div class="wi-section-lbl">Partner</div>
        <div style="display:flex;gap:6px;align-items:flex-end">
          <div class="wi-pf">
            <span class="wi-plbl">Company</span>
            ${_wiSdrop('pt',row.id,partners,row.partnerId,savedPartner||'Company…')}
          </div>
          <div class="wi-pf">
            <span class="wi-plbl">Truck Plates</span>
            <input class="wi-ti" type="text" placeholder="e.g. ΙΑΒ 1099"
                   value="${escapeHtml(row.partnerPlates||'')}"
                   id="wi-pp-${row.id}"
                   oninput="_wiField(${row.id},'partnerPlates',this.value)"
                   onclick="event.stopPropagation()"/>
          </div>
          <div class="wi-pf">
            <span class="wi-plbl">Export Rate €</span>
            <input class="wi-ti" type="number" step="0.01" placeholder="0.00"
                   style="width:80px"
                   value="${row.partnerRate||''}"
                   id="wi-pr-exp-${row.id}"
                   oninput="_wiField(${row.id},'partnerRate',this.value)"
                   onclick="event.stopPropagation()"/>
          </div>
          <div class="wi-pf" ${!row.importId?'style="opacity:0.35" title="No import matched — field disabled"':''}>
            <span class="wi-plbl">Import Rate €</span>
            <input class="wi-ti" type="number" step="0.01" placeholder="—"
                   style="width:80px"
                   value="${row.importId?(row.partnerRateImp||''):''}"
                   id="wi-pr-imp-${row.id}"
                   ${!row.importId?'disabled':''}
                   oninput="_wiField(${row.id},'partnerRateImp',this.value)"
                   onclick="event.stopPropagation()"/>
          </div>
        </div>
      </div>

      <div class="wi-div" style="height:52px"></div>

      <!-- ACTIONS -->
      ${canFull?`
      <div style="display:flex;flex-direction:column;gap:6px;align-self:flex-end">
        <button class="wi-save-btn" id="wi-btn-${row.id}"
                onclick="event.stopPropagation();_wiSave(${row.id})">
          <div class="wi-spin"></div>
          ${row.saved?'Update Assignment':'Save Assignment'}
        </button>
        ${row.saved?`<button class="wi-clear-btn"
                onclick="event.stopPropagation();_wiClear(${row.id})">
                Clear</button>`:''}
      </div>`:''}
    </div>

    <!-- Import drop zone (independent from assignment) -->
    <div>
      <div class="wi-plbl" style="margin-bottom:4px">Matched Import</div>
      <div id="wi-piz-${row.id}" class="wi-piz"
           ondragover="event.preventDefault();document.getElementById('wi-piz-${row.id}').classList.add('dh')"
           ondragleave="document.getElementById('wi-piz-${row.id}').classList.remove('dh')"
           ondrop="event.stopPropagation();_wiDropOnPanel(event,${row.id})">
        ${imp
          ?`<div class="wi-ichip" draggable="true" ondragstart="_wiDragStart(event,'${imp.id}')">
              <span class="wi-irm" onclick="event.stopPropagation();_wiRemoveImport(${row.id})">×</span>
              <div style="display:flex;align-items:center;gap:0;min-width:0;overflow:hidden;flex-wrap:wrap">
                <span style="font-size:11px;font-weight:700;color:var(--text);
                             white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                             flex-shrink:1;min-width:0">${_wiClean(imp.fields['Loading Summary']||'—')}</span>
                <span style="font-size:11px;color:var(--text-dim);margin:0 5px;flex-shrink:0">→</span>
                <span style="font-size:11px;font-weight:700;color:var(--text);
                             white-space:nowrap;flex-shrink:0">${_wiClean(imp.fields['Delivery Summary']||'—')}</span>
                ${_wiBadges(imp.fields)}
              </div>
              <div style="font-size:10px;color:var(--text-dim);margin-top:1px">
                ${_wiFmt(imp.fields['Loading DateTime'])} → ${_wiFmt(imp.fields['Delivery DateTime'])} · ${imp.fields['Total Pallets']||0} pal
              </div>
              <div style="font-size:10px;color:var(--text-mid);margin-top:1px">
                ${_wiFmt(imp.fields['Loading DateTime'])} → ${_wiFmt(imp.fields['Delivery DateTime'])}
              </div>
            </div>`
          :`<span class="wi-inone">drop import here</span>`}
      </div>
    </div>
  </div>`;
}

/* ── DROPDOWN ──────────────────────────────────────────────────────── */
function _wiSdrop(px,rowId,arr,selId,ph){
  const uid=`${px}_${rowId}`;
  const sel=arr.find(x=>x.id===selId)?.label||'';
  const opts=arr.map(x=>{
    const l=(x.label||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    return `<div class="wi-sdo" data-id="${x.id}" data-lbl="${l}">${l}</div>`;
  }).join('');
  return `<div class="wi-sd" id="wsd-${uid}" onclick="event.stopPropagation()">
    <input type="text" class="wi-sdi" placeholder="${ph}"
           value="${sel.replace(/"/g,'&quot;')}"
           oninput="_wiSdF('${uid}',this.value)"
           onfocus="_wiSdO('${uid}')"
           autocomplete="off"/>
    <input type="hidden" id="wsd-v-${uid}" value="${selId||''}"/>
    <div id="wsd-l-${uid}" class="wi-sdl">${opts}</div>
  </div>`;
}

// Global click handler for dropdown options
document.addEventListener('click',e=>{
  const o=e.target.closest('.wi-sdo');
  if(o){
    const l=o.closest('.wi-sdl');if(!l) return;
    _wiSdP(l.id.replace('wsd-l-',''),o.dataset.id,o.dataset.lbl||o.textContent.trim());
    e.stopPropagation();return;
  }
  if(!e.target.closest('.wi-sd'))
    document.querySelectorAll('.wi-sdl').forEach(el=>el.style.display='none');
});

function _wiSdO(uid){
  document.querySelectorAll('.wi-sdl').forEach(el=>{
    if(el.id!=='wsd-l-'+uid) el.style.display='none';
  });
  const inp=document.querySelector(`#wsd-${uid} .wi-sdi`);
  const lst=document.getElementById('wsd-l-'+uid);
  if(!inp||!lst) return;
  const r=inp.getBoundingClientRect();
  Object.assign(lst.style,{
    display:'block',
    left:`${r.left}px`,
    top:`${r.bottom+2}px`,
    width:`${Math.max(r.width,190)}px`,
  });
  lst.querySelectorAll('.wi-sdo').forEach(el=>el.style.display='');
}
function _wiSdF(uid,q){
  const lst=document.getElementById('wsd-l-'+uid);
  if(!lst||lst.style.display==='none') _wiSdO(uid);
  const ql=q.toLowerCase();
  lst.querySelectorAll('.wi-sdo').forEach(el=>{
    el.style.display=(el.dataset.lbl||el.textContent).toLowerCase().includes(ql)?'':'none';
  });
}
function _wiSdP(uid,recId,label){
  const v=document.getElementById('wsd-v-'+uid);if(v) v.value=recId;
  const i=document.querySelector(`#wsd-${uid} .wi-sdi`);if(i) i.value=label;
  const l=document.getElementById('wsd-l-'+uid);if(l) l.style.display='none';
  const parts=uid.split('_'),px=parts[0],rowId=parseInt(parts[parts.length-1]);
  const fm={tk:'truckId',   tl:'trailerId',   dr:'driverId',   pt:'partnerId'};
  const lm={tk:'truckLabel',tl:'trailerLabel',dr:'driverLabel',pt:'partnerLabel'};
  if(fm[px]&&!isNaN(rowId)){
    _wiField(rowId,fm[px],recId);
    _wiField(rowId,lm[px],label);
  }
}

/* ── STATE ─────────────────────────────────────────────────────────── */
function _wiField(rowId,field,val){
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(row) row[field]=val;
}
function _wiToggle(rowId){
  // Popover handles assignment — no-op
}
function _wiRepaintRow(rowId){
  const el=document.getElementById('wi-row-'+rowId);
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!el||!row){_wiPaint();return;}
  el.outerHTML=_wiRowHTML(row,WINTL.rows.findIndex(r=>r.id===rowId));
}

/* ── DRAG & DROP ───────────────────────────────────────────────────── */
window._wiDragging=null;

// Drag from import ROWS (new — replaces shelf drag)
function _wiImpDragStart(e,impId){
  // Block drag if import is already matched to an export
  const imp=WINTL.rows.find(r=>r.type==='import'&&r.orderId===impId);
  if(imp&&imp.matchedTo){
    e.preventDefault();
    toast('Unassign this import first','warn');
    return;
  }
  window._wiDragging=impId;
  e.dataTransfer.effectAllowed='move';
  e.currentTarget.style.opacity='0.5';
  setTimeout(()=>{ if(e.currentTarget) e.currentTarget.style.opacity=''; },0);
}

// Legacy compat (shelf chips no longer exist but keep for safety)
function _wiDragStart(e,impId){
  window._wiDragging=impId;
  e.dataTransfer.effectAllowed='move';
}

// Unmatch an import
async function _wiUnmatch(impId){
  // Find export row that has this import
  const expRow=WINTL.rows.find(r=>r.type==='export'&&r.importId===impId);
  if(!expRow) return;
  await _wiRemoveImport(expRow.id);
}

// Print import
function _wiPrintImp(impId){
  // Import χωρίς δική του ανάθεση row εδώ — φύλλο οδηγού
  printOrderSheet(impId, 'import', false);
}

// Drop on compact row import cell → auto-save
async function _wiDropOnRow(e,rowId){
  e.preventDefault();
  document.getElementById('wi-ci-'+rowId)?.classList.remove('dh');
  const impId=window._wiDragging;if(!impId) return;
  window._wiDragging=null;
  await _wiSaveImportMatch(rowId,impId);
}

// Drop on panel drop zone → auto-save
async function _wiDropOnPanel(e,rowId){
  e.preventDefault();
  document.getElementById('wi-piz-'+rowId)?.classList.remove('dh');
  const impId=window._wiDragging;if(!impId) return;
  window._wiDragging=null;
  await _wiSaveImportMatch(rowId,impId);
}

// Auto-save import match directly to ORDERS record
async function _wiSaveImportMatch(rowId,impId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;

  // Lock check: verify import is still unmatched on server
  try {
    const importRec = await atGetOne(TABLES.ORDERS, impId);
    const existingMatch = importRec.fields?.['Matched Export ID'] || importRec.fields?.['Matched Import ID'];
    if (existingMatch) {
      if (typeof showErrorToast === 'function') showErrorToast('This import was already matched by another user. Refreshing...', 'warn');
      else toast('Import already matched by another user — refreshing', 'warn');
      await renderWeeklyIntl();
      return;
    }
  } catch(e) {
    // Best-effort lock check: if it fails we deliberately proceed (the real
    // conflict guard is the optimistic-lock on save). Track it so a pattern of
    // lock-check failures is visible, but do NOT block the match.
    if (typeof logError === 'function') logError(e, '_wiSaveImportMatch: import lock check (proceeding)');
    else console.warn('Import lock check failed, proceeding:', e.message);
  }

  // Lock check: verify export doesn't already have a matched import on server
  try {
    const exportRec = await atGetOne(TABLES.ORDERS, row.orderIds[0]);
    const existingExpMatch = exportRec.fields?.['Matched Import ID'];
    if (existingExpMatch && existingExpMatch !== impId) {
      if (typeof showErrorToast === 'function') showErrorToast('This export already has a different import matched. Refreshing...', 'warn');
      else toast('Export already matched — refreshing', 'warn');
      await renderWeeklyIntl();
      return;
    }
  } catch(e) {
    // Same best-effort policy as the import lock check above: track, don't block.
    if (typeof logError === 'function') logError(e, '_wiSaveImportMatch: export lock check (proceeding)');
    else console.warn('Export lock check failed, proceeding:', e.message);
  }

  // Optimistic UI update
  const oldImp=row.importId;
  row.importId=impId;

  // Clear previous match on any other export row
  WINTL.rows.forEach(r=>{
    if(r.type==='export'&&r.id!==rowId&&r.importId===impId) r.importId=null;
  });

  // Update import row matchedTo
  WINTL.rows.forEach(r=>{
    if(r.type==='import'){
      if(r.orderId===impId) r.matchedTo=row.orderId;
      else if(r.matchedTo===row.orderId&&oldImp&&r.orderId!==oldImp) r.matchedTo=null;
    }
  });

  _wiPaint();

  // T3 (Wave 2): the optimistic paint above shows «matched» BEFORE the server
  // write. The sync slot tells the truth per row: ⟳ writing → ✓ saved / ⚠
  // failed (kept visible — this was PREMORTEM T3: UI said matched, DB didn't).
  _wiSync('wi-sync-'+rowId,'pend','Αποθήκευση ταιριάσματος…');
  let matchFailed=false;

  // Save to ALL export orders in group
  for(const orderId of row.orderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,orderId,{'Matched Import ID':impId});
      if(res?.conflict){ toast('Record modified by another user — refreshing','warn'); await renderWeeklyIntl(); return; }
      if(res?.error) throw new Error(res.error.message||res.error.type);
      // Central sync — matching link can affect downstream planning
      if (typeof syncOrderDownstream === 'function') {
        syncOrderDownstream(orderId, { source: 'intl', changedFields: ['Matched Import ID'], skipPA: true, skipVS: true, skipGRP: true, skipPL: true })
          .catch(e => console.warn('[wi match sync]', e));
      }
    }catch(err){
      matchFailed=true;
      console.error('Import match save failed:',err.message);
      toast('Import save failed: '+err.message.slice(0,50),'warn');
    }
  }
  _wiSync('wi-sync-'+rowId, matchFailed?'err':'ok',
    matchFailed?'Το ταίριασμα ΔΕΝ γράφτηκε στη βάση — ξαναπροσπάθησε ή κάνε Ανανέωση':'Αποθηκεύτηκε');
}

async function _wiRemoveImport(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!row){ toast('Row not found','warn'); return; }
  if(!row.importId){ toast('No import linked','warn'); return; }
  const impId=row.importId;
  row.importId=null;

  // Update import row UI
  const impRow=WINTL.rows.find(r=>r.type==='import'&&r.orderId===impId);
  if(impRow) impRow.matchedTo=null;

  _wiPaint();
  _wiSync('wi-sync-'+rowId,'pend','Αφαίρεση ταιριάσματος…'); // T3

  // Clear from ORDERS (patch export order)
  let ok=true;
  for(const orderId of row.orderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,orderId,{'Matched Import ID':''});
      if(res?.error){ ok=false; throw new Error(res.error.message||res.error.type); }
      if (typeof syncOrderDownstream === 'function') {
        syncOrderDownstream(orderId, { source: 'intl', changedFields: ['Matched Import ID'], skipPA: true, skipVS: true, skipGRP: true, skipPL: true })
          .catch(e => console.warn('[wi unmatch sync]', e));
      }
    }catch(err){
      toast('Error: '+err.message.slice(0,60),'warn');
      ok=false;
    }
  }
  _wiSync('wi-sync-'+rowId, ok?'ok':'err',
    ok?'Αφαιρέθηκε':'Η αφαίρεση ΔΕΝ γράφτηκε στη βάση — κάνε Ανανέωση'); // T3
  if(ok){
    // Invalidate cache so next load is fresh
    if(typeof atClearCache==='function') atClearCache(TABLES.ORDERS);
    toast('Import removed ✓');
  }
}

/* ── AUTO-MATCH ALGORITHM ─────────────────────────────────────────── */
// Distance via canonical haversineKm (core/utils.js); local copy removed.

async function _wiAutoMatch() {
  const {data, rows} = WINTL;
  const expRows = rows.filter(r => r.type === 'export' && !r.importId);
  const impRows = rows.filter(r => r.type === 'import' && !r.matchedTo);
  if (!impRows.length || !expRows.length) { toast('No unmatched pairs available'); return; }

  toast('Calculating matches…');

  // Load locations with coordinates (from ref data cache)
  await preloadReferenceData();
  const locs = getRefLocations();
  const locMap = {};
  locs.forEach(r => { locMap[r.id] = { lat: r.fields['Latitude'], lng: r.fields['Longitude'], name: r.fields['Name']||'', country: r.fields['Country']||'' }; });

  // Batch-fetch ORDER_STOPS for all orders to get stop locations
  const allOrders = [...data.exports, ...data.imports];
  const allStopIds = allOrders.flatMap(r => r.fields['ORDER STOPS'] || []);
  const stopsByOrder = {}; // orderId → {Loading: [locId,...], Unloading: [locId,...]}
  if (allStopIds.length) {
    try {
      const chunks = [];
      // 90 per chunk, matching the sibling batch loop above (the other OR() builder
      // uses 90). Airtable's OR() formula has a practical length ceiling; 90 stays
      // safely under it. Keep both batchers on the same number.
      for (let i = 0; i < allStopIds.length; i += 90) chunks.push(allStopIds.slice(i, i + 90));
      const allStops = [];
      for (const chunk of chunks) {
        const f = `OR(${chunk.map(id => `RECORD_ID()="${id}"`).join(',')})`;
        const recs = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: f }, false);
        allStops.push(...recs);
      }
      for (const s of allStops) {
        const pid = (s.fields[F.STOP_PARENT_ORDER] || [])[0];
        if (!pid) continue;
        if (!stopsByOrder[pid]) stopsByOrder[pid] = { Loading: [], Unloading: [] };
        const type = s.fields[F.STOP_TYPE];
        if (type === 'Loading' || type === 'Unloading') {
          stopsByOrder[pid][type].push(s);
        }
      }
      // Sort each by stop number
      for (const pid of Object.keys(stopsByOrder)) {
        stopsByOrder[pid].Loading.sort((a, b) => (a.fields[F.STOP_NUMBER] || 0) - (b.fields[F.STOP_NUMBER] || 0));
        stopsByOrder[pid].Unloading.sort((a, b) => (a.fields[F.STOP_NUMBER] || 0) - (b.fields[F.STOP_NUMBER] || 0));
      }
    } catch (e) { console.warn('Auto-match: ORDER_STOPS fetch failed', e); }
  }

  // Get coords from ORDER_STOPS for an order
  const _getCoordsEx = (orderId, fields, stopType) => {
    const stops = stopsByOrder[orderId]?.[stopType];
    if (stops && stops.length) {
      const locArr = stops[0].fields[F.STOP_LOCATION];
      const locId = Array.isArray(locArr) ? locArr[0] : null;
      if (locId && locMap[locId]) {
        const loc = locMap[locId];
        if (loc.lat && loc.lng) return loc;
      }
    }
    return null;
  };

  // Score each export-import pair
  const suggestions = [];
  for (const expRow of expRows) {
    const exp = data.exports.find(r => r.id === expRow.orderIds[0]);
    if (!exp) continue;
    const ef = exp.fields;
    const expDelLoc = _getCoordsEx(exp.id, ef, 'Unloading');
    const expDelDate = toLocalDate(ef['Delivery DateTime']);

    let bestImp = null, bestScore = 0, bestDist = Infinity;
    for (const impRow of impRows) {
      if (impRow.matchedTo) continue;
      const imp = data.imports.find(r => r.id === impRow.orderId);
      if (!imp) continue;
      const imf = imp.fields;
      let score = 0;
      let dist = Infinity;

      // DISTANCE: export delivery → import loading (max 70 points — primary factor)
      const impLoadLoc = _getCoordsEx(imp.id, imf, 'Loading');
      if (expDelLoc && impLoadLoc) {
        dist = haversineKm(expDelLoc.lat, expDelLoc.lng, impLoadLoc.lat, impLoadLoc.lng);
        if (dist <= 50)       score += 70;  // <50km = same city
        else if (dist <= 150) score += 55;  // <150km = nearby
        else if (dist <= 300) score += 40;  // <300km = same region
        else if (dist <= 500) score += 20;  // <500km = reachable
      }

      // DATE: import loading within ±1 day of export delivery (max 30 points)
      const impLoadDate = toLocalDate(imf['Loading DateTime']);
      if (expDelDate && impLoadDate) {
        const diff = Math.abs(new Date(expDelDate+'T12:00:00') - new Date(impLoadDate+'T12:00:00')) / 864e5;
        if (diff <= 1) score += 30;
        else if (diff <= 2) score += 15;
      }

      if (score > bestScore || (score === bestScore && dist < bestDist)) {
        bestScore = score; bestImp = impRow; bestDist = dist;
      }
    }

    if (bestImp && bestScore >= 40) {
      suggestions.push({ expRow, impRow: bestImp, score: bestScore, dist: bestDist });
      bestImp.matchedTo = '__suggested__';
    }
  }

  // Reset temp marks
  suggestions.forEach(s => { s.impRow.matchedTo = null; });

  if (!suggestions.length) { toast('No good matches found (score <40)'); return; }

  // Show confirmation dialog with distance info
  const imp_label = (impRow) => {
    const imp = data.imports.find(r => r.id === impRow.orderId);
    return imp ? _wiClean(imp.fields['Loading Summary'] || '').slice(0, 25) : '?';
  };
  const exp_label = (expRow) => {
    const exp = data.exports.find(r => r.id === expRow.orderIds[0]);
    return exp ? _wiClean(exp.fields['Delivery Summary'] || '').slice(0, 25) : '?';
  };

  const msg = suggestions.map((s, i) =>
    `${i+1}. ${exp_label(s.expRow)} ↔ ${imp_label(s.impRow)} (${s.dist < 9999 ? Math.round(s.dist)+'km' : '?'} · score ${s.score})`
  ).join('\n');

  if (!(await confirmAction(`Auto-Match βρήκε ${suggestions.length} ζεύγη:\n\n${msg}\n\nΕφαρμογή;`, { title: 'Auto-Match', confirmLabel: 'Εφαρμογή' }))) return;

  // Apply all matches
  for (const s of suggestions) {
    await _wiSaveImportMatch(s.expRow.id, s.impRow.orderId);
  }

  toast(`${suggestions.length} matches applied!`, 'success');
}

/* ── SAVE ASSIGNMENT ───────────────────────────────────────────────── */
/* ── POPOVER ─────────────────────────────────────────────────── */
function _wiOpenPopover(e,rowId){
  e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const {trucks,trailers,drivers,partners}=WINTL.data;
  const primaryExp=WINTL.data.exports.find(r=>r.id===row.orderIds[0]);
  const fromStr=_wiClean(primaryExp?.fields['Loading Summary']||'').slice(0,28);
  const toStr  =_wiClean(primaryExp?.fields['Delivery Summary']||'').slice(0,28);

  // Π2 (Wave 2): weekly load per truck/driver, from rows ALREADY in memory —
  // zero new fetches. The dropdown answers «πού είναι ήδη πιασμένο» inline,
  // which today lives in phones/Excel/memory (00 §3, gap G1).
  const _busy={};
  WINTL.rows.forEach(r=>{
    if(r.id===rowId) return;
    const o=WINTL.data.exports.find(x=>x.id===r.orderIds?.[0])||WINTL.data.imports.find(x=>x.id===r.orderId);
    if(!o) return;
    const dt=o.fields['Loading DateTime'];
    const entry={d:dt?toLocalDate(dt).slice(5):'', dest:_wiClean(o.fields['Delivery Summary']||o.fields['Loading Summary']||'').slice(0,18)};
    if(r.truckId){(_busy[r.truckId]=_busy[r.truckId]||[]).push(entry);}
    if(r.driverId){(_busy[r.driverId]=_busy[r.driverId]||[]).push(entry);}
  });

  const mkDrop=(px,arr,selId,ph,wide)=>{
    const uid=`${px}_p_${rowId}`;
    const sel=arr.find(x=>x.id===selId)?.label||'';
    const showBusy=(px==='tk'||px==='dr');
    const opts=arr.map(x=>{
      const l=(x.label||'').replace(/"/g,'&quot;');
      const b=showBusy?_busy[x.id]:null;
      const sub=b&&b.length?`<div class="wi-sdo-sub">δεσμ. ${b.length}× · ${b[0].d} → ${escapeHtml(b[0].dest)}</div>`:'';
      return `<div class="wi-sdo${sub?' wi-sdo--busy':''}" data-id="${x.id}" data-lbl="${l}">${l}${sub}</div>`;
    }).join('');
    return `<div class="wi-sd" id="wsd-${uid}">
      <input type="text" class="wi-pop-inp${wide?' wi-pop-inp-wide':''} wi-sdi"
             placeholder="${ph}" value="${sel.replace(/"/g,'&quot;')}"
             oninput="_wiSdF('${uid}',this.value)" onfocus="_wiSdO('${uid}')" autocomplete="off"/>
      <input type="hidden" id="wsd-v-${uid}" value="${selId||''}"/>
      <div id="wsd-l-${uid}" class="wi-sdl">${opts}</div>
    </div>`;
  };

  const pop=document.getElementById('wi-popover');
  pop.innerHTML=`
    <div class="wi-pop-header">
      <div>
        <div class="wi-pop-title">Assign Trip</div>
        <div class="wi-pop-subtitle">${fromStr} → ${toStr}</div>
      </div>
      <button class="wi-pop-close" onclick="_wiClosePopover()">×</button>
    </div>
    <div class="wi-pop-body">
      <div>
        <div class="wi-pop-section-lbl">Owned Fleet</div>
        <div class="wi-pop-row">
          <div class="wi-pop-field"><span class="wi-pop-lbl">Truck</span>${mkDrop('tk',trucks,row.truckId,'Plate…',false)}</div>
          <div class="wi-pop-field"><span class="wi-pop-lbl">Trailer</span>${mkDrop('tl',trailers,row.trailerId,'Plate…',false)}</div>
          <div class="wi-pop-field"><span class="wi-pop-lbl">Driver</span>${mkDrop('dr',drivers,row.driverId,'Name…',false)}</div>
        </div>
      </div>
      <div class="wi-pop-divider">or partner</div>
      <div>
        <div class="wi-pop-section-lbl">Partner</div>
        <div class="wi-pop-row">
          <div class="wi-pop-field"><span class="wi-pop-lbl">Company</span>${mkDrop('pt',partners,row.partnerId,'Company…',true)}</div>
          <div class="wi-pop-field">
            <span class="wi-pop-lbl">Plates</span>
            <input class="wi-pop-inp wi-pop-inp-wide" type="text"
                   placeholder="e.g. ΙΑΒ 1099" id="wi-pop-pp-${rowId}"
                   value="${escapeHtml(row.partnerPlates||'')}"/>
          </div>
          <div class="wi-pop-field">
            <span class="wi-pop-lbl">Export Rate €</span>
            <input class="wi-pop-inp" type="number" step="0.01" placeholder="0.00"
                   id="wi-pop-rate-exp-${rowId}" style="width:90px"
                   value="${row.partnerRate||''}"/>
          </div>
          <div class="wi-pop-field" ${!row.importId?'style="opacity:0.35" title="No import matched — field disabled"':''}>
            <span class="wi-pop-lbl">Import Rate €</span>
            <input class="wi-pop-inp" type="number" step="0.01"
                   placeholder="${row.importId?'0.00':'—'}"
                   id="wi-pop-rate-imp-${rowId}" style="width:90px"
                   value="${row.importId?(row.partnerRateImp||''):''}"
                   ${!row.importId?'disabled':''}/>
          </div>
        </div>
      </div>
    </div>
    <div id="wi-lane-${rowId}" class="wi-lane-hist"></div>
    <div class="wi-pop-footer">
      ${row.saved?`<button class="wi-pop-cancel" onclick="event.stopPropagation();_wiClear(${rowId}).then(()=>_wiClosePopover())">Clear</button>`:''}
      <button class="wi-pop-cancel" onclick="_wiClosePopover()">Cancel</button>
      <button class="wi-pop-save" id="wi-pop-btn-${rowId}"
              onclick="event.stopPropagation();_wiSaveFromPopover(${rowId})">
        <div id="wi-pop-spin-${rowId}" style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;display:none;animation:wi-spin .6s linear infinite"></div>
        ${row.saved?'Update':'Save Assignment'}
      </button>
    </div>`;

  const rect=e.currentTarget.getBoundingClientRect();
  const popW=430, popH=300;
  let left=rect.left-10;
  let top=rect.bottom+6;
  if(left+popW>window.innerWidth-12) left=window.innerWidth-popW-12;
  if(top+popH>window.innerHeight-12) top=rect.top-popH-6;
  if(top<10) top=10;
  Object.assign(pop.style,{display:'block',left:`${Math.max(10,left)}px`,top:`${top}px`});
  pop.dataset.rowId=String(rowId);
  setTimeout(()=>document.addEventListener('click',_wiPopoverOutside,{capture:true}),10);
  _wiFillLaneHist(rowId,row); // Π3 (Wave 3) — async, hides itself when no data
}

// Π3 (Wave 3): last 3 recorded rates on the SAME lane, under the rate field —
// the live negotiation tool (00 §Β8). Lane = country→country from the
// free-text summaries: deliberately coarse (04 risk: city-level is fragile).
function _wiLaneOf(f){
  // Greek summaries often have no comma (plain supplier name) — the GR side is
  // implicit. Lane = GR + the FOREIGN end's country (last comma token).
  const cc=s=>{const p=String(s||'').split(','); if(p.length<2) return null;
    const t=p.pop().trim().slice(0,16).toUpperCase(); return t||null;};
  const dir=f?.['Direction'];
  const far=dir==='Import'?cc(f?.['Loading Summary']):cc(f?.['Delivery Summary']);
  if(!far) return null;
  return dir==='Import'?far+' → GR':'GR → '+far;
}
async function _wiFillLaneHist(rowId,row){
  const o=WINTL.data.exports.find(x=>x.id===row.orderIds?.[0])||WINTL.data.imports.find(x=>x.id===row.orderId);
  const lane=_wiLaneOf(o?.fields);
  if(!lane||!document.getElementById('wi-lane-'+rowId)) return;
  try{
    if(!WINTL._laneAll){ // one fetch per session, then in-memory
      // Facade quirks, both measured live: numeric `>` in formulas → 422, and
      // DERIVED fields (Loading/Delivery Summary) come back EMPTY when named
      // in fields[] — so filter by checkbox and fetch FULL records (25 rows).
      WINTL._laneAll=(await atGetAll(TABLES.ORDERS,{filterByFormula:`{Is Partner Trip}=1`},false))
        .filter(r=>typeof r.fields['Partner Rate']==='number'&&r.fields['Partner Rate']>0);
      // Post-Supabase, summaries never arrive from the Worker — the main view
      // builds them from ORDER_STOPS; do the same for the history set (once).
      await _wiInjectStopSummaries(WINTL._laneAll);
    }
    const dir=o?.fields['Direction'];
    const hits=WINTL._laneAll
      .filter(r=>r.fields['Direction']===dir&&_wiLaneOf(r.fields)===lane&&!row.orderIds.includes(r.id))
      .sort((a,b)=>(b.fields['Week Number']||0)-(a.fields['Week Number']||0)).slice(0,3);
    const el=document.getElementById('wi-lane-'+rowId);
    if(!el||!hits.length) return;
    el.innerHTML='<span class="wi-lane-title">Ιστορικό γραμμής '+escapeHtml(lane)+':</span>'+hits.map(r=>{
      const pid=(r.fields['Partner']||[])[0];
      const pn=WINTL.data.partners.find(p=>p.id===pid)?.label||'—';
      return `<span class="wi-lane-item">W${r.fields['Week Number']||'—'} · ${(r.fields['Partner Rate']||0).toLocaleString('el-GR')}€ · ${escapeHtml(String(pn).slice(0,18))}</span>`;
    }).join('');
  }catch(e){ console.warn('lane hist:',e); }
}

function _wiPopoverOutside(e){
  const pop=document.getElementById('wi-popover');
  if(pop&&!pop.contains(e.target)&&!e.target.closest('.wi-ca')){
    _wiClosePopover();
  }
}
function _wiClosePopover(){
  const pop=document.getElementById('wi-popover');
  if(pop) pop.style.display='none';
  document.removeEventListener('click',_wiPopoverOutside,{capture:true});
}

async function _wiSaveFromPopover(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!row){return;}
  const syncPop=(p,f,l)=>{
    const uid=`${p}_p_${rowId}`;
    const val=document.getElementById(`wsd-v-${uid}`)?.value||'';
    const lbl=document.querySelector(`#wsd-${uid} .wi-sdi`)?.value||'';
    _tmsLog('syncPop',uid,'val=',val,'lbl=',lbl);
    if(val){row[f]=val;row[l]=lbl;}
  };
  syncPop('tk','truckId','truckLabel');
  syncPop('tl','trailerId','trailerLabel');
  syncPop('dr','driverId','driverLabel');
  syncPop('pt','partnerId','partnerLabel');

  const ppEl=document.getElementById(`wi-pop-pp-${rowId}`);
  if(ppEl) row.partnerPlates=ppEl.value;
  const rateExpEl=document.getElementById(`wi-pop-rate-exp-${rowId}`);
  if(rateExpEl) row.partnerRate=rateExpEl.value;
  const rateImpEl=document.getElementById(`wi-pop-rate-imp-${rowId}`);
  if(rateImpEl) row.partnerRateImp=rateImpEl.value;
  const isPartner=!!row.partnerId;
  if(!isPartner&&!row.truckId){toast('Select Truck or Partner','warn');return;}
  if(isPartner&&!row.partnerRate){toast('Export Rate is required for Partner','warn');return;}
  if(isPartner&&row.importId&&!row.partnerRateImp){toast('Import Rate is required for Partner','warn');return;}
  // T1 (Wave 2): same-day double-booking → soft confirm, never a hard block —
  // the dispatcher may know better (split day, relay), but not silently.
  if(!isPartner){
    const conflict=_wiSameDayConflict(row);
    if(conflict && !(await confirmAction(conflict+'\n\nΣυνέχεια με την ανάθεση;',{title:'Πιθανή διπλή δέσμευση',confirmLabel:'Συνέχεια'}))) return;
  }
  const btn=document.getElementById(`wi-pop-btn-${rowId}`);
  const spin=document.getElementById(`wi-pop-spin-${rowId}`);
  if(btn){btn.disabled=true;if(spin)spin.style.display='block';}
  // Stamp Assigned At only on first assignment (preserve for accurate assignment-speed metric)
  const isFirstAssignment = !row.saved;
  const assignedAtStamp = isFirstAssignment ? { 'Assigned At': new Date().toISOString() } : {};
  const fields=isPartner
    ?{'Partner':[row.partnerId],'Is Partner Trip':true,
      'Partner Truck Plates':row.partnerPlates||'','Status':'Assigned',
      'Truck':[],'Trailer':[],'Driver':[], ...assignedAtStamp}
    :{'Truck':[row.truckId],'Trailer':row.trailerId?[row.trailerId]:[],'Driver':row.driverId?[row.driverId]:[],'Is Partner Trip':false,'Status':'Assigned','Partner':[],'Partner Truck Plates':'', ...assignedAtStamp};
  // Save to export orders (with export rate)
  const expFields={...fields};
  if(isPartner) expFields['Partner Rate']=row.partnerRate?parseFloat(row.partnerRate):null;

  // Save to import order (with import rate) if matched
  const impFields={...fields};
  if(isPartner) impFields['Partner Rate']=row.partnerRateImp?parseFloat(row.partnerRateImp):null;

  const errors=[];
  for(const orderId of row.orderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,orderId,expFields);
      if(res?.conflict){ toast('Record modified by another user — refreshing','warn'); await renderWeeklyIntl(); return; }
      if(res?.error) throw new Error(res.error.message||res.error.type||JSON.stringify(res.error));
    }catch(err){errors.push(err.message);}
  }
  if(row.importId && !row.orderIds.includes(row.importId)){
    try{
      const res=await atSafePatch(TABLES.ORDERS,row.importId,impFields);
      if(res?.conflict){ toast('Record modified by another user — refreshing','warn'); await renderWeeklyIntl(); return; }
      if(res?.error) throw new Error(res.error.message||res.error.type||JSON.stringify(res.error));
    }catch(err){errors.push(err.message);}
  }
  if(errors.length){
    if(btn){btn.disabled=false;if(spin)spin.style.display='none';}
    // Full error list goes to the gated log; user sees a short message only.
    reportError('Σφάλμα αποθήκευσης αντιστοίχισης — δοκιμάστε ξανά', errors);
    return;
  }
  _wiClosePopover();

  // PARTNER ASSIGNMENT sync (both export + import rows)
  if(isPartner){
    try{ await _wiCreatePartnerAssignments(row); }
    catch(e){ console.warn('PA upsert error:',e.message); }
  } else {
    // Partner removed → delete PA records
    const allOids=[...row.orderIds];
    if(row.importId && !allOids.includes(row.importId)) allOids.push(row.importId);
    try{ await _wiDeletePartnerAssignments(allOids); }
    catch(e){ console.warn('PA delete error:',e.message); }
  }

  toast(row.saved?'Updated':'Saved');

  // Sync Veroia Switch → NAT_LOADS
  try {
    for (const oid of row.orderIds) {
      const recs = await atGetAll(TABLES.ORDERS, {
        filterByFormula: 'RECORD_ID()="'+oid+'"',
        fields: ['Direction','Type','Veroia Switch','National Order Created',
          'Client','Goods','Total Pallets','Temperature °C','Pallet Exchange',
          'National Groupage','Loading DateTime','Delivery DateTime','Reference',
        ],
      }, false);
      if (recs.length > 0 && typeof _syncVeroiaSwitch === 'function')
        await _syncVeroiaSwitch(oid, recs[0].fields);
    }
  } catch(e) {
    // The order save already succeeded; only the downstream VS→NAT_LOADS sync
    // failed. This used to be swallowed to console, so national planning data
    // could silently drift from assignment data with no signal. Tell the user
    // (their save stuck, but national needs a retry) and log it. We do NOT roll
    // back the save here.
    reportError('Η αποθήκευση έγινε, αλλά ο συγχρονισμός με National απέτυχε — άνοιξε ξανά και αποθήκευσε', e);
    if (typeof logError === 'function') logError(e, '_wiSaveFromPopover: VS→NAT_LOADS sync (post-save)');
  }

  await renderWeeklyIntl();
}

async function _wiCreatePartnerAssignments(row){
  // Build list of all orders (export + import) with their rates
  const assignments = [];

  for(const orderId of row.orderIds){
    assignments.push({ orderId, rate: row.partnerRate });
  }
  if(row.importId && !row.orderIds.includes(row.importId)){
    assignments.push({ orderId: row.importId, rate: row.partnerRateImp });
  }

  for(const asgn of assignments){
    try {
      await paUpsert({
        parentType: 'order',
        parentId:   asgn.orderId,
        partnerId:  row.partnerId,
        rate:       asgn.rate,
        status:     'Assigned',
      });
    } catch(err) {
      console.error('PA upsert failed:', asgn.orderId, err.message);
    }
  }
}

async function _wiDeletePartnerAssignments(orderIds){
  for(const oid of orderIds){
    try { await paDelete({ parentType: 'order', parentId: oid }); }
    catch(err) { console.warn('PA delete failed:', oid, err.message); }
  }
}

async function _wiSave(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;

  // Sync dropdowns — only overwrite if user has made a selection (non-empty)
  const sync=(p,f,l)=>{
    const uid=`${p}_${rowId}`;
    const val=document.getElementById(`wsd-v-${uid}`)?.value||'';
    const lbl=document.querySelector(`#wsd-${uid} .wi-sdi`)?.value||'';
    if(val) { row[f]=val; row[l]=lbl; }
    else if(lbl===''&&row[f]) { /* keep existing */ }
  };
  sync('tk','truckId','truckLabel');
  sync('tl','trailerId','trailerLabel');
  sync('dr','driverId','driverLabel');
  sync('pt','partnerId','partnerLabel');

  // Read partner plates + rates from inputs
  const ppInput=document.getElementById(`wi-pp-${rowId}`);
  if(ppInput) row.partnerPlates=ppInput.value;
  const prExpInput=document.getElementById(`wi-pr-exp-${rowId}`);
  if(prExpInput) row.partnerRate=prExpInput.value;
  const prImpInput=document.getElementById(`wi-pr-imp-${rowId}`);
  if(prImpInput) row.partnerRateImp=prImpInput.value;

  const isPartner=!!row.partnerId;
  if(!isPartner&&!row.truckId){toast('Select Truck or Partner','warn');return;}
  if(isPartner&&!row.partnerRate){toast('Partner Rate is required','warn');return;}
  if(isPartner&&row.importId&&!row.partnerRateImp){toast('Import Rate is required','warn');return;}

  const btn=document.getElementById('wi-btn-'+rowId);
  if(btn){btn.disabled=true;btn.classList.add('saving');
    btn.querySelector('.wi-spin').style.display='block';}

  const fields=isPartner
    ?{ 'Partner'            :[row.partnerId],
       'Is Partner Trip'    :true,
       'Partner Truck Plates':row.partnerPlates||'',
       'Partner Rate'       :row.partnerRate?parseFloat(row.partnerRate):null,
       'Status'             :'Assigned',
       'Truck':[],'Trailer':[],'Driver':[] }
    :{ 'Truck'              :[row.truckId],
       'Trailer'            :row.trailerId?[row.trailerId]:[],
       'Driver'             :row.driverId?[row.driverId]:[],
       'Is Partner Trip'    :false,
       'Status'             :'Assigned',
       'Partner':[],'Partner Truck Plates':'' };

  const errors=[];
  for(const orderId of row.orderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,orderId,fields);
      if(res?.conflict){ toast('Record modified by another user — refreshing','warn'); await renderWeeklyIntl(); return; }
      if(res?.error) throw new Error(res.error.message||res.error.type||JSON.stringify(res.error));
    }catch(err){ errors.push(err.message); }
  }

  if(errors.length){
    if(btn){btn.disabled=false;btn.classList.remove('saving');}
    toast('Error: '+errors[0].slice(0,60),'warn');
    return;
  }

  // PARTNER ASSIGNMENT sync
  if(isPartner){
    try{ await _wiCreatePartnerAssignments(row); }
    catch(e){ console.warn('PA upsert error:',e.message); }
  } else {
    try{ await _wiDeletePartnerAssignments(row.orderIds); }
    catch(e){ console.warn('PA delete error:',e.message); }
  }

  toast(row.saved?'Updated':'Assignment saved');
  WINTL.ui.openRow=null;
  await renderWeeklyIntl();
}

async function _wiClear(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  if(!(await confirmAction('Καθαρισμός ανάθεσης;', { confirmLabel: 'Καθαρισμός' }))) return;
  const allOrderIds=[...row.orderIds];
  if(row.importId && !allOrderIds.includes(row.importId)) allOrderIds.push(row.importId);
  const errors=[];
  for(const orderId of allOrderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,orderId,{
        'Truck':[],'Trailer':[],'Driver':[],'Partner':[],
        'Is Partner Trip':false,'Partner Truck Plates':'',
      });
      if(res?.error) throw new Error(res.error.message||res.error.type);
    }catch(err){ errors.push(err.message); }
  }
  if(errors.length){toast('Clear failed: '+errors[0].slice(0,50),'warn');return;}

  // Remove PA records for cleared orders
  try{ await _wiDeletePartnerAssignments(allOrderIds); }
  catch(e){ console.warn('PA delete error:',e.message); }

  toast('Assignment cleared');
  WINTL.ui.openRow=null;
  await renderWeeklyIntl();
}

/* ── CONTEXT MENU ──────────────────────────────────────────────────── */
function _wiCtx(e,rowId){
  e.preventDefault();e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const isGroup=row.orderIds.length>1;
  const others=WINTL.rows.filter(r=>r.id!==rowId&&!r.saved);
  const btn=(l,fn,d=false)=>
    `<button class="wi-ctx-i${d?' d':''}" onclick="${fn};_wiCtxClose()">${l}</button>`;
  let html='';
  if(others.length){
    html+=`<div class="wi-ctx-h">Groupage</div>`;
    others.slice(0,6).forEach(o=>{
      const exp=WINTL.data.exports.find(r=>r.id===o.orderIds[0]);
      const lbl=_wiClean(exp?.fields['Delivery Summary']||`Row ${o.id}`).slice(0,28);
      html+=btn(`Group with: ${lbl}`,`_wiMerge(${rowId},${o.id})`);
    });
    html+=`<div class="wi-ctx-sep"></div>`;
  }
  if(isGroup) html+=btn('Split groupage',`_wiSplit(${rowId})`);
  if(row.importId) html+=btn('Remove import',`_wiRemoveImport(${rowId})`);
  if(row.saved) html+=btn('Clear assignment',`_wiClear(${rowId})`);
  const ctx=document.getElementById('wi-ctx');
  ctx.innerHTML=html;
  Object.assign(ctx.style,{display:'block',
    left:`${Math.min(e.clientX,window.innerWidth-220)}px`,
    top:`${Math.min(e.clientY,window.innerHeight-260)}px`});
  setTimeout(()=>document.addEventListener('click',_wiCtxClose,{once:true}),10);
}
function _wiCtxClose(){const el=document.getElementById('wi-ctx');if(el) el.style.display='none';}

/* ── GROUPAGE ──────────────────────────────────────────────────────── */
// Π1 (Wave 3, owner choice Α): the group persists via a shared text
// `Group ID` on ORDERS (same pattern as NAT_LOADS `Groupage ID`), rebuilt in
// _wiBuildRows — «με την ανανέωση η σελίδα χαλάει» (00 §2) ends here.
// UI-level grouping of ORDERS only: GL/CL and the never-delete rule untouched.
async function _wiGroupPatch(orderIds, gid, rowId){
  _wiSync('wi-sync-'+rowId,'pend', gid?'Αποθήκευση ομάδας…':'Διάλυση ομάδας…');
  let failed=false;
  for(const oid of orderIds){
    try{
      const res=await atSafePatch(TABLES.ORDERS,oid,{'Group ID':gid});
      if(res?.error) throw new Error(res.error.message||res.error.type);
    }catch(err){ failed=true; console.warn('Group ID save:',err.message); }
  }
  _wiSync('wi-sync-'+rowId, failed?'err':'ok',
    failed?'Η ομάδα ΔΕΝ αποθηκεύτηκε στη βάση (λείπει το πεδίο Group ID στον Worker/DB;) — θα χαθεί στην ανανέωση':'Η ομάδα αποθηκεύτηκε');
  if(failed) toast('Η ομάδα δεν αποθηκεύτηκε στη βάση — θα ισχύει μόνο μέχρι την ανανέωση','warn');
  return !failed;
}
async function _wiMerge(rowId,otherId){
  const row=WINTL.rows.find(r=>r.id===rowId),other=WINTL.rows.find(r=>r.id===otherId);
  if(!row||!other) return;
  other.orderIds.forEach(id=>{if(!row.orderIds.includes(id)) row.orderIds.push(id);});
  WINTL.rows=WINTL.rows.filter(r=>r.id!==otherId);
  _wiPaint();toast('Grouped');
  const gid='GRP-'+String(row.orderIds[0]).slice(-8);
  await _wiGroupPatch(row.orderIds, gid, row.id);
}
async function _wiSplit(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row||row.orderIds.length<=1) return;
  const allIds=[...row.orderIds];
  const [first,...rest]=row.orderIds;row.orderIds=[first];
  rest.forEach(expId=>{
    const exp=WINTL.data.exports.find(r=>r.id===expId);
    WINTL.rows.push({
      id:++WINTL._seq, orderId:expId, orderIds:[expId], importId:null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',
      truckLabel:'',trailerLabel:'',driverLabel:'',partnerLabel:'',
      partnerPlates:'',saved:false,
    });
  });
  _wiPaint();toast('Split');
  await _wiGroupPatch(allIds, '', row.id); // clear Group ID on all members
}
// Π1: one paper packet for the whole group (print.html ?orderIds=…).
function _wiPrintGroup(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId); if(!row||row.orderIds.length<2) return;
  const base='https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/print.html';
  const sheet=row.partnerId?'partner':'driver';
  window.open(`${base}?orderIds=${row.orderIds.join(',')}&leg=export&sheet=${sheet}`,'_blank');
}

/* ── NAVIGATION ────────────────────────────────────────────────────── */
function _wiPrint(rowId, leg){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const orderId = leg==='export' ? row.orderIds[0] : (row.importId||row.orderIds[0]);
  // Β.3-6: ρητή επιλογή εντύπου όταν υπάρχει συνεργάτης (helper στο utils)
  printOrderSheet(orderId, leg, !!row.partnerLabel);
}

function _wiToggleGroup(rowId){
  WINTL.ui.openGroup = WINTL.ui.openGroup===rowId ? null : rowId;
  _wiRepaintRow(rowId);
}

function _wiOpenImpPopover(e, impId, rowId){
  // Import row uses same popover — row IS the import row, orderId = import order
  const row=WINTL.rows.find(r=>r.id===rowId);
  if(!row){console.error('Import row not found:',rowId);return;}
  _wiOpenPopover(e, rowId);
}

function _wiNavWeek(delta){
  WINTL.week=Math.max(1,Math.min(53,WINTL.week+delta));
  WINTL.ui.openRow=null;
  renderWeeklyIntl();
}

function _wiPrintWeek(){
  const rows=WINTL.rows.filter(r=>r.type==='export');
  const data=WINTL.data;
  let html=`<h2 style="font-family:'Syne',sans-serif;margin-bottom:12px">Weekly International — W${WINTL.week}</h2>
    <p style="font-size:12px;color:#666;margin-bottom:16px">${rows.length} exports · ${data.imports.length} imports · Εκτύπωση ${new Date().toLocaleString('el-GR')} — αντικαθιστά κάθε προηγούμενη έκδοση</p>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="background:#F0F5FA">
        <th style="padding:6px;border:1px solid #ddd;text-align:left">#</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:left">Route</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:left">Date</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:center">Pal</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:left">Assignment</th>
        <th style="padding:6px;border:1px solid #ddd;text-align:left">Import</th>
      </tr></thead><tbody>`;
  rows.forEach((row,i)=>{
    const exps=row.orderIds.map(id=>data.exports.find(r=>r.id===id)).filter(Boolean);
    const primary=exps[0];if(!primary)return;
    const f=primary.fields;
    const imp=row.importId?data.imports.find(r=>r.id===row.importId):null;
    const partner=row.partnerLabel||'';
    const truck=row.truckLabel||'';
    const assign=partner?`Partner: ${partner}`:(truck?`Owned: ${truck}`:'Unassigned');
    html+=`<tr>
      <td style="padding:4px 6px;border:1px solid #ddd">${i+1}</td>
      <td style="padding:4px 6px;border:1px solid #ddd">${(f['Loading Summary']||'').slice(0,30)} → ${(f['Delivery Summary']||'').slice(0,30)}</td>
      <td style="padding:4px 6px;border:1px solid #ddd">${toLocalDate(f['Loading DateTime'])} → ${toLocalDate(f['Delivery DateTime'])}</td>
      <td style="padding:4px 6px;border:1px solid #ddd;text-align:center">${f['Total Pallets']||0}</td>
      <td style="padding:4px 6px;border:1px solid #ddd">${assign}</td>
      <td style="padding:4px 6px;border:1px solid #ddd">${imp?((imp.fields['Loading Summary']||'').slice(0,25)+' → '+(imp.fields['Delivery Summary']||'').slice(0,25)):'—'}</td>
    </tr>`;
  });
  html+='</tbody></table>';
  // WI-11: shared shell (core/utils) — one print chrome for both weekly pages.
  _printWeekShell(`Week ${WINTL.week} — Petras TMS`, html);
}

// Expose functions used from onclick/oninput/onfocus handlers
window.renderWeeklyIntl = renderWeeklyIntl;
window.WINTL = WINTL;
window._wiAutoMatch = _wiAutoMatch;
window._wiPrintWeek = _wiPrintWeek;
window._wiToggle = _wiToggle;
window._wiToggleGroup = _wiToggleGroup;
window._wiOpenPopover = _wiOpenPopover;
window._wiOpenImpPopover = _wiOpenImpPopover;
window._wiClosePopover = _wiClosePopover;
window._wiSaveFromPopover = _wiSaveFromPopover;
window._wiSave = _wiSave;
window._wiClear = _wiClear;
window._wiRemoveImport = _wiRemoveImport;
window._wiUnmatch = _wiUnmatch;
window._wiPrint = _wiPrint;
window._wiPrintImp = _wiPrintImp;
window._wiCtxClose = _wiCtxClose;
window._wiField = _wiField;
window._wiSdO = _wiSdO;
window._wiSdF = _wiSdF;
window._wiSdP = _wiSdP;
window._wiNavWeek = _wiNavWeek;
window._wiRepaintRow = _wiRepaintRow;
window._wiImpDragStart = _wiImpDragStart;
window._wiDragStart = _wiDragStart;
window._wiDropOnRow = _wiDropOnRow;
window._wiDropOnPanel = _wiDropOnPanel;
window._wiCtx = _wiCtx;
window._wiMerge = _wiMerge;
window._wiSplit = _wiSplit;
window._wiPrintGroup = _wiPrintGroup;
window._wiExportCSV = _wiExportCSV;
window._wiApplyFilter = _wiApplyFilter;
window._wiPulseRow = _wiPulseRow;

function _wiExportCSV() {
  const allOrders = [...WINTL.data.exports, ...WINTL.data.imports];
  if (!allOrders.length) { toast('No data to export', 'error'); return; }
  const rows = [['Order No','Direction','Client','Loading','Delivery','Load Date','Del Date','Pallets','Truck','Trailer','Driver','Partner','Status']];
  allOrders.forEach(r => { const f = r.fields;
    const trk = WINTL.data.trucks.find(t => t.id === ((f['Truck']||[])[0]))?.label || '';
    const trl = WINTL.data.trailers.find(t => t.id === ((f['Trailer']||[])[0]))?.label || '';
    const drv = WINTL.data.drivers.find(d => d.id === ((f['Driver']||[])[0]))?.label || '';
    const prt = WINTL.data.partners.find(p => p.id === ((f['Partner']||[])[0]))?.label || '';
    const assigned = !!(trk || prt);
    rows.push([f['Order Number']||'', f['Direction']||'',
      typeof getClientName==='function' ? getClientName((f['Client']||[])[0]) : '',
      f['Loading Summary']||'', f['Delivery Summary']||'',
      f['Loading DateTime']||'', f['Delivery DateTime']||'', f['Total Pallets']||0,
      trk, trl, drv, prt, assigned?'Assigned':'Unassigned',
    ]); });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `weekly_intl_W${WINTL.week}_${localToday()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast('CSV exported');
}

})();
