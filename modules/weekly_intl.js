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
// Owner (10/8, feedback dispatcher): η εβδομάδα προβολής ξεκινά ΣΑΒΒΑΤΟ και
// κλείνει Παρασκευή (εξοικείωση από το Excel). Display-level μόνο: κρατάμε
// την αρίθμηση WEEKNUM, μετατοπίζουμε το όριο μία μέρα νωρίτερα — μια
// ημερομηνία ανήκει στη νέα εβδομάδα Ν αν η (ημερομηνία+1μέρα) ανήκε στην
// παλιά (Κυριακή-start). Τα αποθηκευμένα δεδομένα/VS dates δεν αλλάζουν.
function _wiWeekNumOf(d){
  const y=d.getFullYear(),j=new Date(y,0,1);
  return Math.ceil(((d-j)/86400000+j.getDay()+1)/7);
}
function _wiCurrentWeek(){
  return _wiWeekNumOf(new Date(Date.now()+86400000));
}
// Week start για εβδομάδα w — πλέον ΣΑΒΒΑΤΟ (Κυριακή παλιάς αρίθμησης −1μέρα)
function _wiWeekStart(w){
  const y=new Date().getFullYear(),jan1=new Date(y,0,1);
  const firstSun=new Date(jan1); firstSun.setDate(jan1.getDate()-jan1.getDay());
  const ws=new Date(firstSun); ws.setDate(firstSun.getDate()+(w-1)*7-1); // Σάββατο
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
// ΩΜΗ εκδοχή για ό,τι περνάει σε _wk3LocHTML/_wk3MoreStops — εκείνα κάνουν το
// escape στο render· διπλό escape εμφάνιζε «&quot;» σε ονόματα με εισαγωγικά.
function _wiRaw(s){return (s||'').replace(/^['"\s/]+/,'').replace(/['"\s/]+$/,'').trim();}
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
      // Ακριβή ονόματα σημείων ως arrays — το route τα χρησιμοποιεί ΧΩΡΙΣ
      // parsing του summary string (bug: «η πόλη αντί για τον τίτλο» στα 2α σημεία)
      const stops=stopsByOrder[r.id];
      if(stops){
        const namesOf=t=>stops.filter(s=>s.fields[F.STOP_TYPE]===t)
          .sort((a,b)=>(a.fields[F.STOP_NUMBER]||0)-(b.fields[F.STOP_NUMBER]||0))
          .map(s=>{const lid=Array.isArray(s.fields[F.STOP_LOCATION])?s.fields[F.STOP_LOCATION][0]:null;
            return {n:lid?(_fhLocationsMap[lid]||''):'', dt:s.fields[F.STOP_DATETIME]||''};})
          .filter(x=>x.n);
        const L=namesOf('Loading'), D=namesOf('Unloading');
        if(L.length) r.fields._stopsL=L;
        if(D.length) r.fields._stopsD=D;
      }
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
    WINTL._range={ws:wsFmt,we:weFmt};
    // Cross-week (feedback dispatcher 19/5): φόρτωσε imports ±1 εβδομάδα ώστε
    // export της W να ταιριάζει με import της W±1 — τα γειτονικά αδιάθετα
    // εμφανίζονται σε δική τους ενότητα στο τέλος, ΔΕΝ μετράνε στο tally.
    const impFilter=`AND({Type}='International',{Direction}='Import',IS_AFTER({Loading DateTime},'${toLocalDate(new Date(ws.getTime()-8*86400000))}'),IS_BEFORE({Loading DateTime},'${toLocalDate(new Date(we.getTime()+8*86400000))}'))`;

    let [,,expOrders,impOrders] = await Promise.all([
      preloadReferenceData(),
      Promise.resolve(), // placeholder to keep destructuring aligned
      // Σαβ–Παρ (display): date-range αντί {Week Number} — υπερσύνολο με OR
      // στα δύο dates, ακριβές κόψιμο client-side ώστε να μη χαθεί καμία
      // εγγραφή χωρίς Delivery DateTime.
      atGetAll(TABLES.ORDERS,  {filterByFormula:`AND({Type}='International',{Direction}='Export',OR(AND(IS_AFTER({Delivery DateTime},'${toLocalDate(new Date(ws.getTime()-86400000))}'),IS_BEFORE({Delivery DateTime},'${toLocalDate(new Date(we.getTime()+86400000))}')),AND(IS_AFTER({Loading DateTime},'${toLocalDate(new Date(ws.getTime()-86400000))}'),IS_BEFORE({Loading DateTime},'${toLocalDate(new Date(we.getTime()+86400000))}'))))`},false),
      atGetAll(TABLES.ORDERS,  {filterByFormula:impFilter},false),
    ]);
    if (loadId !== _wiLoadId) return;
    WINTL.data.trucks   = getRefTrucks().filter(r=>r.fields['Active']).map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
    WINTL.data.trailers = getRefTrailers().map(r=>({id:r.id,label:r.fields['License Plate']||r.id}));
    WINTL.data.drivers  = getRefDrivers().filter(r=>r.fields['Active']).map(r=>({id:r.id,label:r.fields['Full Name']||r.id}));
    WINTL.data.partners = getRefPartners().map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));

    // ── Inject Loading/Delivery Summary from ORDER_STOPS for new orders ──
    await _wiInjectStopSummaries([...expOrders, ...impOrders]);

    // Ακριβές όριο εβδομάδας (Σαβ–Παρ) στην effective ημερομηνία (Delivery ή Loading)
    expOrders = expOrders.filter(r=>{
      const eff=toLocalDate(r.fields['Delivery DateTime']||r.fields['Loading DateTime']||'');
      return eff>=wsFmt && eff<=weFmt;
    });
    WINTL.data.exports = expOrders
      .sort((a,b)=>(
        (a.fields['Delivery DateTime']||a.fields['Loading DateTime']||'')
        .localeCompare(b.fields['Delivery DateTime']||b.fields['Loading DateTime']||'')
      ));
    WINTL.data.imports = impOrders;

    if (loadId !== _wiLoadId) return;
    _wiBuildRows();
    _wiPaint();
    // Self-heal (owner 12/8): ανάθεση σε συνεργάτη που γράφτηκε ΜΕΤΑ το γέμισμα
    // της 30' cache των άλλων χρηστών ⇒ άγνωστο id ⇒ έδειχνε «—». Μία ανανέωση
    // PARTNERS χωρίς cache και repaint — μόνο όταν όντως λείπει κάποιο id.
    if (WINTL.rows.some(r=>r.partnerId&&!WINTL.data.partners.find(p=>p.id===r.partnerId)) && !WINTL._pRefreshed){
      WINTL._pRefreshed = true;
      atGetAll(TABLES.PARTNERS,{fields:['Company Name']},false).then(ps=>{
        if(!ps?.length) return;
        WINTL.data.partners = ps.map(r=>({id:r.id,label:r.fields['Company Name']||r.id}));
        _wiPaint();
      }).catch(e=>console.warn('[wi] partners refresh:',e.message));
    }
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

  // ── ΡΟΤΑ (owner 10/8): orders με Rotation ID = σκέλη προώθησης — δεν
  // εμφανίζονται ως δικές τους γραμμές, κρέμονται κάτω από τον γονέα («⤷»).
  // Μπαίνουν ΚΑΝΟΝΙΚΑ στο rows[] ώστε διαθεσιμότητα οδηγών/οχημάτων και
  // επιστροφές να μετρούν από το ΤΕΛΕΥΤΑΙΟ σκέλος.
  // (σημείωση: τρέχει στο τέλος του _wiBuildRows — δες κάτω)

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
    // Cross-week: import εκτός τρέχουσας Σαβ–Παρ = «γειτονικό» — δική του
    // ενότητα στο τέλος, εκτός tally/ομάδων ημερών.
    const _ld=toLocalDate(f['Loading DateTime']||'');
    const _adj=!!(WINTL._range&&_ld&&(_ld<WINTL._range.ws||_ld>WINTL._range.we));
    WINTL.rows.push({
      adj:_adj, adjW:_adj?_wiWeekOf(f['Loading DateTime']):null,
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

  // Ρότα: σημείωσε τα σκέλη + ομαδοποίησέ τα ανά γονέα, με σειρά φόρτωσης
  WINTL._legs={};
  const _ordOf=r=>WINTL.data.exports.find(x=>x.id===(r.orderIds?.[0]||r.orderId))||WINTL.data.imports.find(x=>x.id===(r.orderIds?.[0]||r.orderId));
  WINTL.rows.forEach(r=>{
    const o=_ordOf(r);
    const rot=o?.fields?.['Rotation ID'];
    if(rot){ r.legOf=rot; (WINTL._legs[rot]=WINTL._legs[rot]||[]).push(r); }
  });
  Object.values(WINTL._legs).forEach(a=>a.sort((x,y)=>
    String(_ordOf(x)?.fields?.['Loading DateTime']||'').localeCompare(String(_ordOf(y)?.fields?.['Loading DateTime']||''))));
}

/* ── PAINT ─────────────────────────────────────────────────────────── */

/* ── WEEK SIDEBAR (INTL) ──────────────────────────────── */
// WI-7: the strip listed 21 weeks (−8..+12) and scrolled horizontally, so the
// current week was rarely where you looked. Now ±3 around the selected week,
// with explicit ‹ › steps and a «Σήμερα» reset — the three moves anyone
// actually makes. See docs/design/DEEP_AUDIT_2026-08-04/weekly_intl.md WI-7.
// BUILD v3 Φάση Α: sheet tabs — το νοητικό μοντέλο του WEEKLY PLAN xlsx
// (καρτέλες φύλλων), εγκεκριμένο πρωτότυπο v3.1. Ίδια λογική week±.
/* Νέα παραγγελία ΧΩΡΙΣ έξοδο από το εβδομαδιαίο (owner 10/08).
   Μετά το κλείσιμο της φόρμας ξαναζωγραφίζουμε: αλλιώς η νέα παραγγελία δεν
   εμφανίζεται και ο χρήστης νομίζει ότι χάθηκε. Ο observer πιάνει και τους δύο
   τρόπους απόκρυψης (style ή class) — αν δεν πυροδοτηθεί, το χειρότερο είναι
   να μην ανανεωθεί, όπως θα γινόταν και χωρίς αυτόν. */
function _wiNewOrder() {
  openIntlCreate();
  const ov = document.getElementById('modalOverlay');
  if (!ov) return;
  const visible = () => ov.style.display !== 'none' && !ov.hidden;
  const obs = new MutationObserver(() => {
    if (!visible()) { obs.disconnect(); renderWeeklyIntl(); }
  });
  obs.observe(ov, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
}

function _wk3Tabs(currentWeek) {
  const today = _wiCurrentWeek();
  const step = d => `<button type="button" class="wk3-step" onclick="WINTL.week=${currentWeek+d};renderWeeklyIntl()" title="${d<0?'Προηγούμενη':'Επόμενη'} εβδομάδα">${d<0?'‹':'›'}</button>`;
  const jump = d => `<button type="button" class="wk3-step" onclick="WINTL.week=${Math.min(53,Math.max(1,currentWeek+d))};renderWeeklyIntl()" title="${d<0?'−4 εβδομάδες':'+4 εβδομάδες'}">${d<0?'«':'»'}</button>`;
  let html = jump(-4)+step(-1);
  for (let w = currentWeek - 3; w <= currentWeek + 3; w++) {
    if (w < 1 || w > 53) continue;
    const wS=_wiWeekStart(w), wE=new Date(wS); wE.setDate(wS.getDate()+6);
    const fmt=d=>String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1);
    html += `<button type="button" class="wk3-tab${w===currentWeek?' on':''}" onclick="WINTL.week=${w};renderWeeklyIntl()" title="${fmt(wS)}–${fmt(wE)}">W${w}</button>`;
  }
  html += step(1)+jump(4);
  if (currentWeek !== today)
    html += `<button type="button" class="wk3-tab" style="color:var(--accent)" onclick="WINTL.week=${today};renderWeeklyIntl()">Σήμερα</button>`;
  return html;
}
// «Τα κενά» (owner): own γύροι χωρίς φορτίο επιστροφής → δείξε τα αδιάθετα
// imports που μπορούν να τα γεμίσουν (highlight + scroll).
function _wk3Gaps(){
  const imps=[...document.querySelectorAll('[id^="wi-imp-"]')];
  imps.forEach(r=>{r.style.transition='background .3s';r.style.background='var(--accent-light)';setTimeout(()=>{r.style.background='';},1800);});
  if(imps[0]) imps[0].scrollIntoView({behavior:'smooth',block:'center'});
}
function _wiJumpFirstUnassigned(){
  const impRow=WINTL.rows.find(r=>r.type==='import'&&!r.saved);
  if(impRow&&typeof _ccJump==='function') _ccJump('wi-imp-'+impRow.orderId);
}

function _wiPaint(){
  const {rows,week,data,ui}=WINTL;
  const expRows=rows.filter(r=>r.type==='export'&&!r.legOf);
  const impRows=rows.filter(r=>r.type==='import'&&!r.adj&&!r.legOf);
  const expN=expRows.length, impN=impRows.length;
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

  // BUILD v3 Φάση Α: το Command Center αντικαταστάθηκε από το tally μίας
  // γραμμής (v3.1) — τα ίδια νούμερα, μία φορά, κλικ = μετάβαση (Π4 πνεύμα).
  const _ico = (n, s) => (typeof icon === 'function') ? icon(n, s || 14) : '';
  const _firstExp = (pred) => { const r = expRows.find(pred); return r ? 'wi-row-'+r.id : undefined; };
  // «Τα κενά» (owner): own γύροι που θα γυρίσουν άδειοι — χωρίς import.
  const gaps=expRows.filter(r=>r.saved && !r.partnerId && !r.importId).length;
  const firstPendingId=_firstExp(r=>!r.saved);
  // Φάση Β: busy cache ανά paint (τα _wk3Suggest των rows το ξαναχρησιμοποιούν)
  WINTL._busy=_wk3Busy();
  const sugN=expRows.filter(r=>!r.saved&&_wk3Suggest(r)).length;

  document.getElementById('content').innerHTML=`
    <div class="wk3 ${_wiQuietOn()?'wi-quiet':''}${localStorage.getItem('tms_wk3_fl')==='0'?' fl-off':''}${localStorage.getItem('tms_wk3_fr')==='0'?' fr-off':''}" style="display:block;width:100%">
    <!-- BUILD v3 Φάση Α: κεφαλή v3.1 — sheet tabs + tally μίας γραμμής.
         Αντικαθιστά week-bar, Command Center, page-header chips: η ίδια
         πληροφορία, ΜΙΑ φορά, κλικ = μετάβαση. -->
    <div class="wk3-mast">
      <nav class="wk3-tabs" aria-label="Εβδομάδες">${_wk3Tabs(week)}</nav>
      ${typeof weekPhaseBadge==='function'?weekPhaseBadge(week,_wiCurrentWeek()):''}
      <div class="wk3-tally">
        <span class="wk3-t"><b>${expN}</b> εξαγ</span>
        <span class="wk3-t"><b>${impN}</b> εισαγ</span>
        <span class="wk3-t" title="${matched} ταιριασμένα · ${unmatched} εισαγωγές χωρίς ταίριασμα"><b>${matched}</b>/${impN} ταιρ.</span>
        ${(pending+impNoVehicle)>0?`<button class="wk3-t alert" onclick="${firstPendingId?`_ccJump('${firstPendingId}')`:'_wiJumpFirstUnassigned()'}" title="Ορφανά — χωρίς ανάθεση (${pending} εξαγ + ${impNoVehicle} εισαγ). Κλικ: πήγαινε στο πρώτο"><b>${pending+impNoVehicle}</b> εκκρεμή</button>`:''}
        ${gaps>0?`<button class="wk3-t gap" onclick="_wk3Gaps()" title="Own γύροι χωρίς φορτίο επιστροφής — κλικ: τα αδιάθετα imports"><b>${gaps}</b> κενά</button>`:''}
        ${(()=>{const _st=r=>{const o=data.exports.find(x=>x.id===(r.orderIds?.[0]))||data.imports.find(x=>x.id===r.orderId);return o?.fields||{};};
          const delivN=[...expRows,...impRows].filter(r=>['Delivered','Invoiced'].includes(_st(r)['Status'])).length;
          const lateN=[...expRows,...impRows].filter(r=>_st(r)['Delivery Performance']==='Delayed').length;
          return `${delivN?`<span class="wk3-t okg" title="Παραδομένα φορτία"><b>${delivN}</b> παραδομένα ✓</span>`:''}${lateN?`<span class="wk3-t warn2" title="Καθυστερημένες παραδόσεις"><b>${lateN}</b> καθυστ.</span>`:''}`;})()}
        <span id="wi-crossweek-in"></span>
        <div class="wk3-acts">
          ${unmatched>0?`<button class="wk3-ab" title="Περιορισμένο: χωρίς συντεταγμένες τοποθεσιών (LO-1) σκοράρει μόνο με ημερομηνίες" onclick="_wiAutoMatch()">${_ico('zap',13)} Ταίριασμα</button>`:''}
          <button class="btn btn-primary btn-sm" onclick="_wiNewOrder()" title="Νέα διεθνής παραγγελία — χωρίς έξοδο από το εβδομαδιαίο">${_ico('plus',13)} New Order</button>
          <button class="wk3-ab" onclick="_wiToggleDetails()" title="Πρόσθετες ενδείξεις γραμμής (όρια εβδομάδας, εκτέλεση)">${_ico('eye',13)} Λεπτομέρειες${_wiQuietOn()?'':' ✓'}</button>
          <button class="wk3-ab" onclick="_wiPrintWeek()">${_ico('file_text',13)} Εκτύπωση</button>
          <button class="wk3-ab" onclick="_wiExportCSV()">CSV</button>
          <button class="wk3-ab" onclick="renderWeeklyIntl()" title="Ανανέωση">${_ico('refresh',13)}</button>
        </div>
      </div>
    </div>
    <div class="wk3-sub">
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
      <span class="wk3-range">Weekly International · Εβδομάδα ${week} · ${_wiWeekRange(week)}</span>
    </div>

    ${(()=>{ // Owner (9/8): «επανέφερε το Command Center» — μαζί με το tally
      const assignedTruckIds=new Set(rows.filter(r=>r.truckId).map(r=>r.truckId));
      const gaps2=expRows.filter(r=>r.saved && !r.partnerId && !r.importId).length;
      const ccActions=[];
      if(pending>0) ccActions.push({icon:'',sev:'crit',text:`${pending} εξαγωγές χωρίς ανάθεση`,scrollTo:firstPendingId});
      if(impNoVehicle>0) ccActions.push({icon:'',sev:'warn',text:`${impNoVehicle} εισαγωγές χωρίς όχημα`});
      if(unmatched>0) ccActions.push({icon:'',sev:'warn',text:`${unmatched} εισαγωγές χωρίς ταίριασμα`});
      if(gaps2>0) ccActions.push({icon:'',sev:'crit',text:`${gaps2} κενά γυρισμού`});
      if(!ccActions.length) ccActions.push({icon:'',sev:'ok',text:'Όλα τακτοποιημένα'});
      const ccWidgets=(typeof widgetFleet==='function'&&typeof widgetEmptyLegs==='function')
        ?[widgetFleet(WINTL.data.trucks||[],assignedTruckIds),widgetEmptyLegs(gaps2,unmatched,'')]:[];
      const ccOpen=localStorage.getItem('tms_cc_open')!=='0';
      return typeof buildCommandCenterHTML==='function'?`<details ${ccOpen?'open':''} ontoggle="localStorage.setItem('tms_cc_open',this.open?'1':'0')" style="margin-bottom:10px">
        <summary style="cursor:pointer;list-style:none;height:40px;display:flex;align-items:center;gap:12px;padding:0 14px;background:var(--navy-mid);color:#C4CFDB;border-radius:8px;font-size:12px">
          <span style="font-family:'Syne',sans-serif;font-weight:700;letter-spacing:1px">COMMAND CENTER · W${week}</span>
          <span style="opacity:.7">${expN} εξαγ · ${impN} εισαγ · ${pct}% ολοκληρωμένο</span>
          <span style="margin-left:auto;opacity:.5">▾</span>
        </summary>
        ${buildCommandCenterHTML({title:`COMMAND CENTER · W${week}`,pct,actions:ccActions,widgets:ccWidgets})}
      </details>`:'';
    })()}
    <div class="wk3-wrap">
      <main class="wk3-sheet">
        <div class="wk3-cols">
          <div class="c"></div>
          <div class="c fc" style="cursor:pointer" title="Εθνικό σκέλος προς Βέροια — κλικ: άνοιγμα/κλείσιμο στήλης" onclick="_wk3FeedTog('fl')"><span class="fc-ch">◂</span> ΠΡΟΣ ΒΕΡΟΙΑ</div>
          <div class="c cm">ΕΞΑΓΩΓΗ <span class="n">${expN}</span><span class="hint" title="Δεξί κλικ: ομαδοποίηση groupage (βάση: το πρώτο-παραδιδόμενο)">ⓘ</span></div>
          <div class="c cm" style="justify-content:center">ΑΝΑΘΕΣΗ</div>
          <div class="c cm">ΕΙΣΑΓΩΓΗ <span class="n">${impN}</span><span class="hint" title="Σύρε εισαγωγή σε εξαγωγή για ταίριασμα">ⓘ</span></div>
          <div class="c fc" style="cursor:pointer" title="Εθνική διανομή από Βέροια — κλικ: άνοιγμα/κλείσιμο στήλης" onclick="_wk3FeedTog('fr')">ΑΠΟ ΒΕΡΟΙΑ <span class="fc-ch">▸</span></div>
        </div>
        <div id="wi-rows">
          ${rows.length?_wiAllRowsHTML():`
            <div class="wk3-empty">
              <div class="big">Άδειο φύλλο — W${week}</div>
              <p>Καμία διεθνής παραγγελία ακόμη. Οι νέες εμφανίζονται εδώ μόλις καταχωρηθούν.</p>
            </div>`}
        </div>
      </main>
    </div>
    <div id="wi-ctx"></div>
    <div id="wi-popover"></div>
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
  // BUILD v3 Φάση Α: το «vs προηγούμενη» widget έφυγε μαζί με το Command
  // Center (το v3.1 tally δεν το έχει — context, όχι απόφαση, 01 §χάρτης).
  // fetchPreviousWeekStats μένει στο command-center.js για το Weekly National.

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
  const expRows=WINTL.rows.filter(r=>r.type==='export'&&!r.legOf);
  const impRows=WINTL.rows.filter(r=>r.type==='import'&&!r.legOf);
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

  impRows.filter(r=>!r.adj).forEach(row=>{
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

  sorted.forEach((grp,di)=>{
    const expCount=grp.exps.length;
    const impCount=grp.imps.filter(r=>!r.matchedTo).length;
    const isToday=grp.rawDate===todayKey;
    const alt=di%2===1; // proto: ζέβρωμα ανά ΜΕΡΑ, όχι ανά γραμμή

    // v3.1 proto day header — τυπογραφικός, ΣΗΜΕΡΑ = accent
    let wd='';
    // uppercase Greek drops the tonos (ΔΕΥΤΕΡΑ, not ΔΕΥΤΈΡΑ)
    try{ wd=new Date(grp.rawDate+'T12:00:00').toLocaleDateString('el-GR',{weekday:'long'}).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }catch{}
    const dm=grp.rawDate?`${+grp.rawDate.slice(8,10)}/${+grp.rawDate.slice(5,7)}`:'';
    html+=`<div class="wk3-dayh${isToday?' today':''}">
      <span class="d">${wd||grp.lbl}${dm?' '+dm:''}</span>
      ${isToday?'<span class="now">ΣΗΜΕΡΑ</span>':''}
      <span class="k">${expCount?expCount+' εξαγ':''}${expCount&&impCount?' · ':''}${impCount?impCount+' εισαγ':''}</span>
    </div>`;

    // Owner (9/8): ταξινόμηση ανά πελάτη και μετά Veroia Switch
    const _cKey=(f)=>String(f?.['Client Name']||f?.['Client Summary']||'').toUpperCase();
    grp.exps.sort((a,b)=>{
      const fa=WINTL.data.exports.find(x=>x.id===a.orderIds[0])?.fields||{};
      const fb=WINTL.data.exports.find(x=>x.id===b.orderIds[0])?.fields||{};
      return _cKey(fa).localeCompare(_cKey(fb),'el')
        ||((fa['Veroia Switch']?1:0)-(fb['Veroia Switch']?1:0))
        ||String(fa['Delivery DateTime']||'').localeCompare(String(fb['Delivery DateTime']||''));
    });
    grp.imps.sort((a,b)=>{
      const fa=WINTL.data.imports.find(x=>x.id===a.orderId)?.fields||{};
      const fb=WINTL.data.imports.find(x=>x.id===b.orderId)?.fields||{};
      return _cKey(fa).localeCompare(_cKey(fb),'el')
        ||((fa['Veroia Switch']?1:0)-(fb['Veroia Switch']?1:0))
        ||String(fa['Loading DateTime']||'').localeCompare(String(fb['Loading DateTime']||''));
    });
    // Export rows (+ σκέλη ρότας του export ΚΑΙ της ταιριασμένης εισαγωγής του)
    grp.exps.forEach(row=>{ row._alt=alt; html+=_wiRowHTML(row,idx++);
      const pids=[...(row.orderIds||[])]; if(row.importId) pids.push(row.importId);
      pids.forEach(pid=>{ (WINTL._legs?.[pid]||[]).forEach(lr=>{ html+=_wiLegRowHTML(lr); }); });
    });

    // Only unmatched imports shown as rows — numbered I1… (Β.3-4) so «γραμμή
    // I3» means something on the phone between two dispatchers.
    grp.imps.filter(r=>!r.matchedTo).forEach(row=>{ row._alt=alt; html+=_wiImpRowHTML(row,++impIdx);
      (WINTL._legs?.[row.orderId]||[]).forEach(lr=>{ html+=_wiLegRowHTML(lr); });
    });
  });

  // (Owner 10/8: η ενότητα «ΓΕΙΤΟΝΙΚΕΣ ΕΒΔΟΜΑΔΕΣ» αφαιρέθηκε — τη θέση της
  // πήρε το δεξί κλικ → Μεταφορά εβδομάδας. Τα W±1 imports παραμένουν στη
  // μνήμη για matched previews και για τον χάρτη διαθεσιμότητας.)
  return html;
}


/* ── IMPORT ROW ──────────────────────────────────────────────────── */
function _wiImpRowHTML(row,impNo){
  const {data}=WINTL;
  const imp=data.imports.find(r=>r.id===row.orderId);
  if(!imp) return '';
  const f=imp.fields;
  const fromStr=_wiRaw(f['Loading Summary']||f['Client Name']||f['Client Summary']||'—');
  const toStr  =_wiRaw(f['Delivery Summary']||f['Client Name']||f['Client Summary']||'—');
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
      impPill=`<div class="wk3-pill par" title="Συνεργάτης${row.partnerPlates?' · '+escapeHtml(row.partnerPlates):''}${row.driverLabel?' · '+escapeHtml(row.driverLabel):''} — κλικ: αλλαγή">${escapeHtml(impPartner.slice(0,22))}${(row.partnerPlates||impSurname)?` <small>${escapeHtml([row.partnerPlates,impSurname].filter(Boolean).join(' '))}</small>`:''}</div>`;
    } else {
      impPill=`<div class="wk3-pill own" title="${escapeHtml([impTruck,impTrailer].filter(Boolean).join(' · '))} — κλικ: αλλαγή">${escapeHtml([impTruck,impTrailer].filter(Boolean).join('·')||'—')}${impSurname?` <small>${escapeHtml(impSurname)}</small>`:''}</div>`;
    }
  } else {
    // Β.3-3: import-without-vehicle is NOT the same red as export-without-
    // assignment — dashed border (non-color signal) + explicit prefix.
    impPill=`<div class="wk3-pill unimp" title="Εισαγωγή χωρίς δικό όχημα — κλικ για ανάθεση">ΕΙΣ · χωρίς όχημα</div>`;
  }

  // v3.1 proto: I-γραμμή = ίδια 34px δομή, ράγα Ι# accent, ΕΞΑΓΩΓΗ κενή
  // (Β.3-1: κενό κελί = δεν υπάρχει σκέλος), draggable για ταίριασμα.
  const impVS2=!!f['Veroia Switch'];
  const stR=_wk3StFlags(f);
  return `<div id="wi-imp-${imp.id}" data-row-id="${row.id}"
    class="wk3-row impr${row._alt?' alt':''}${stR.delivered&&!stR.late?' wk3-done':''}"
    draggable="true"
    oncontextmenu="_wiImpCtx(event,${row.id})"
    ondragstart="event.stopPropagation();_wiImpDragStart(event,'${imp.id}')">
    <div class="wk3-num imp" style="cursor:grab" title="Εισαγωγή I${impNo||''} — σύρε πάνω σε εξαγωγή για ταίριασμα">I${impNo||''}${f['Group ID']?`<span class="wk3-grpb" title="Groupage εισαγωγών · ${escapeHtml(String(f['Group ID']).split('|')[0])}">G</span>`:''}</div>
    <div class="wk3-feed l bgap" title="Χωρίς εθνικό σκέλος"></div>
    <div class="wk3-leg void${row.saved&&!impPartner?' gap':''}${(row.saved&&impPartner)||!row.saved?' bgap':''}"
         ${row.saved&&!impPartner?`title="Own όχημα χωρίς εξαγωγή — κενό σκέλος καθόδου. Κλικ: πρώτη εξαγωγή χωρίς ανάθεση" onclick="event.stopPropagation();_wiJumpFirstUnassigned()"`:row.saved&&impPartner?`title="Ανατεθειμένο σε συνεργάτη — δεν αναμένεται δικό μας σκέλος εξαγωγής"`:''}></div>
    <div class="wk3-assign" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="event.stopPropagation();_wiOpenImpPopover(event,'${imp.id}',${row.id})">
      ${impPill}
      <button class="wk3-prt" title="Εκτύπωση εντολής (import)" onclick="event.stopPropagation();_wiPrintImp('${imp.id}',${row.partnerId?'true':'false'})">⎙</button>
    </div>
    <div class="wk3-leg imp" style="cursor:pointer" title="Κλικ: άνοιγμα φόρμας παραγγελίας — σύρε για ταίριασμα" onclick="event.stopPropagation();_wk3Edit('${imp.id}')">
      <div class="wk3-lcol"><span class="wk3-route"><b class="wk3-ld${stR.loaded?' done':''}" style="cursor:pointer" title="Ημ. φόρτωσης${stR.loaded?' — φορτώθηκε ✓':''} — κλικ για αλλαγή" onclick="_wk3PickDate(event,'${imp.id}','Loading DateTime','${f['Loading DateTime']||''}')">${loadDt!=='—'?_wk3D(loadDt):''}</b><span class="frm">${_wk3LocHTML(fromStr,'Φόρτωση',f._stopsL)}</span><span class="wk3-sep">→</span>${(()=>{ if(impVS2){ const v=_wk3VsCd(f,'imp');
      return `<b class="wk3-ld${stR.delivered?' done':''}${stR.late?' late':''}${v.est?' estd':''}" style="cursor:pointer" title="${v.est?'Εκτίμηση άφιξης CD (Delivery−1) — κλικ για πραγματική':'Ημ. άφιξης στο Cross-Dock — κλικ για αλλαγή'}" onclick="_wk3PickDate(event,'${imp.id}','VS CD Date','${v.iso}')">${v.iso?_wk3D(_wiFmt(v.iso+'T12:00:00')):''}</b>`; }
    return `<b class="wk3-ld${stR.delivered?' done':''}${stR.late?' late':''}" style="cursor:pointer" title="Ημ. παράδοσης${stR.delivered?' — παραδόθηκε ✓':''}${stR.late?' — ΚΑΘΥΣΤΕΡΗΣΕ':''} — κλικ για αλλαγή" onclick="_wk3PickDate(event,'${imp.id}','Delivery DateTime','${f['Delivery DateTime']||''}')">${delDt!=='—'?_wk3D(delDt):''}</b>`; })()}<span class="to">${impVS2?'Cross-Dock':_wk3LocHTML(toStr,'Παράδοση',f._stopsD)}${(f['Order Number']||impRef2)?`<span class="wk3-ordn" title="Order">${escapeHtml(String(f['Order Number']||impRef2))}</span>`:''}</span>${impVS2?' <span class="wk3-vsb">VS</span>':''}</span>${_wk3MoreStops(fromStr,f._stopsL,'load')}${impVS2?'':_wk3MoreStops(toStr,f._stopsD,'del')}</div>
      <span class="wk3-meta"><span class="wk3-palpe">${pals?pals+'p':''}${_wiBadges(f)}</span></span>
    </div>
    <div class="wk3-feed r${impVS2?'':' bgap'}" title="${impVS2?'Εθνική διανομή από Βέροια — τελικός προορισμός. Ο μεταφορέας συμπληρώνεται στο Weekly National.':'Χωρίς εθνικό σκέλος'}">${impVS2?`<div class="wk3-fcol"><div class="wk3-fline"><b style="cursor:pointer" title="Εθνικό σκέλος: ημ. τελικής διανομής — κλικ για αλλαγή" onclick="_wk3PickDate(event,'${imp.id}','Delivery DateTime','${f['Delivery DateTime']||''}')">${delDt!=='—'?_wk3D(delDt):''}</b>&nbsp;${_wk3LocHTML(toStr,'Παράδοση',f._stopsD)}</div>${_wk3MoreStops(toStr,f._stopsD,'del')}</div>`:''}</div>
  </div>`;
}

// Γραμμή σκέλους ρότας: «⤷ φόρτωση → παράδοση» ενιαία, κλικ = φόρμα,
// δεξί κλικ = αποσύνδεση. Assignment δεν έχει — κληρονομεί του γονέα.
function _wiLegRowHTML(legRow){
  const o=WINTL.data.exports.find(x=>x.id===(legRow.orderIds?.[0]||legRow.orderId))||WINTL.data.imports.find(x=>x.id===(legRow.orderIds?.[0]||legRow.orderId));
  if(!o) return '';
  const f=o.fields||{};
  const ld=_wiFmt(f['Loading DateTime']), dd=_wiFmt(f['Delivery DateTime']);
  const dir=(f['Direction']==='Import')?'import':'export';
  // Σωστή στήλη ανά κατεύθυνση (owner 12/8): σκέλος εξαγωγής → ΜΟΝΟ τη στήλη
  // διαδρομής (3/4) ώστε ημερομηνίες/σημεία να ευθυγραμμίζονται με τον γονέα —
  // το 3/5 τέντωνε το περιεχόμενο με κενό στη μέση και τα κουμπιά κατέληγαν
  // κάτω από το assignment. Σκέλος εισαγωγής → μόνο στήλη εισαγωγών (5/6).
  const legCell=`<div class="wk3-leg" style="grid-column:${dir==='import'?'5/6':'3/4'};cursor:pointer">
      <span class="wk3-route"><b class="wk3-ld">${ld!=='—'?_wk3D(ld):''}</b><span class="frm">${_wk3LocHTML(f['Loading Summary']||f['Client Name']||'—','Φόρτωση',f._stopsL)}</span><span class="wk3-sep">→</span><b class="wk3-ld">${dd!=='—'?_wk3D(dd):''}</b><span class="to">${_wk3LocHTML(f['Delivery Summary']||'—','Παράδοση',f._stopsD)}${(f['Order Number']||f['Reference'])?`<span class="wk3-ordn">${escapeHtml(String(f['Order Number']||f['Reference']))}</span>`:''}</span></span>
      <span class="wk3-meta"><span class="wk3-pal">${f['Total Pallets']?f['Total Pallets']+'p':''}</span><span class="wk3-flags">${_wiBadges(f)}</span><button class="wk3-prt" title="Εκτύπωση σκέλους" onclick="event.stopPropagation();printOrderSheet('${o.id}','${dir}',${(f['Partner']||[]).length?'true':'false'})">⎙</button><button class="wk3-prt" title="Ακύρωση πρόωθησης — αποσύνδεση σκέλους από τη ρότα" onclick="_wiRotUnlink(event,'${o.id}')">⨯</button></span>
    </div>`;
  return `<div class="wk3-row wk3-legrow" data-row-id="${legRow.id}" title="Σκέλος ρότας (άλλος πελάτης) — κλικ: φόρμα · δεξί κλικ: αποσύνδεση"
      onclick="_wk3Edit('${o.id}')" oncontextmenu="_wiRotUnlink(event,'${o.id}')">
    <div class="wk3-num" style="color:var(--accent);font-weight:800">⤷</div>
    <div class="wk3-feed l bgap"></div>
    ${dir==='import'?`<div class="wk3-leg bgap" style="grid-column:3/5"></div>${legCell}`:`${legCell}<div></div><div class="wk3-leg imp bgap"></div>`}
    <div class="wk3-feed r bgap"></div>
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
  if(f['High Risk Flag'])   b.push('<span class="wi-badge wi-b-risk" title="High Risk">!</span>');
  if(f['Pallet Exchange'])  b.push('<span class="wi-badge wi-b-pe">PE</span>');
  if(f['National Groupage'])b.push('<span class="wi-badge wi-b-grpg">GRP</span>');
  const veroia=f['Veroia Switch'];
  if(veroia)                b.push('<span class="wi-badge wi-b-veroia">Veroia</span>');

  return b.join('');
}

/* ── QUIET VIEW + DRIVERS PANEL (owner, 8/8 βράδυ) ─────────────────── */
// «Ήσυχη προβολή» default: the per-row chips of Waves 1-2 read as clutter next
// to the team's sparse Excel — they now hide behind a «Λεπτομέρειες» toggle.
// Silent nets stay always-on: sync ⚠ on failure, phase badge, ΣΗΜΕΡΑ, popover
// history, group print. Shared key with weekly_natl (twin behaviour).
function _wiQuietOn(){ return localStorage.getItem('tms_weekly_details')!=='1'; }
function _wiToggleDetails(){ localStorage.setItem('tms_weekly_details', _wiQuietOn()?'1':'0'); renderWeeklyIntl(); }
// Excel sidebar «οδηγός → μέρα επιστροφής» (cols 33-36 of WEEKLY PLAN),
// computed from this week's assignments — no new data entry.
/* ── BUILD v3 Φάση Β — διαθεσιμότητα κατά τον κανόνα ημερών του owner:
   «επιστροφή ημέρα Χ → αναχώρηση Χ+2» (⚡Χ+1 = κατ' εξαίρεση μειωμένη,
   ΠΟΤΕ default). Όλα από τα ήδη φορτωμένα rows — μηδέν νέα fetches. ── */
function _wk3Busy(){
  const byDriver={}, byTruck={};
  WINTL.rows.forEach(r=>{
    const exp=WINTL.data.exports.find(x=>x.id===r.orderIds?.[0]);
    const imp=r.importId?WINTL.data.imports.find(x=>x.id===r.importId):(r.type==='import'?WINTL.data.imports.find(x=>x.id===r.orderId):null);
    const legF=(imp&&imp.fields)||(exp&&exp.fields); if(!legF) return;
    const end=toLocalDate(legF['Delivery DateTime']||legF['Loading DateTime']||''); if(!end) return;
    const place=_wiClean(legF['Delivery Summary']||'').split(',')[0].slice(0,16);
    const upd=(map,id)=>{ if(!id) return; const c=map[id]; if(!c||end>c.end) map[id]={end,place}; };
    upd(byDriver,r.driverId); upd(byTruck,r.truckId);
  });
  return {byDriver,byTruck};
}
// Owner (9/8): στο grid μόνο ΤΙΤΛΟΣ τοποθεσίας + κωδικός χώρας (DE/AT/HU/GR),
// όχι πόλη. Σύμβαση Summary: «Τίτλος[, νομική μορφή], CC, Πόλη…» → κόβουμε
// στο πρώτο διγράμματο-κεφαλαίο token (ή γνωστό όνομα χώρας).
const _WK3CC={'GREECE':'GR','ΕΛΛΑΔΑ':'GR','GERMANY':'DE','DEUTSCHLAND':'DE','AUSTRIA':'AT','OSTERREICH':'AT','HUNGARY':'HU','FRANCE':'FR','ITALY':'IT','ITALIA':'IT','NETHERLANDS':'NL','HOLLAND':'NL','CZECH REPUBLIC':'CZ','CZECHIA':'CZ','POLAND':'PL','SLOVAKIA':'SK','SLOVENIA':'SI','SPAIN':'ES','BELGIUM':'BE','ROMANIA':'RO','BULGARIA':'BG','CROATIA':'HR','SERBIA':'RS','SWITZERLAND':'CH','DENMARK':'DK','SWEDEN':'SE','UNITED KINGDOM':'GB'};
// Πολλαπλά σημεία (owner 9/8): το Summary μπορεί να έχει 2+ τοποθεσίες
// «Τίτλος, CC, Πόλη, Τίτλος2, CC2, Πόλη2…» — σπάμε σε τμήματα: κάθε τμήμα
// κλείνει στο CC και το αμέσως επόμενο token (πόλη) πετιέται.
function _wk3Locs(str){
  // ΩΜΟ trim (όχι _wiClean/escape): οι καταναλωτές κάνουν escapeHtml στο render —
  // το διπλό escape εμφάνιζε «&quot;» σε τίτλους με εισαγωγικά (W34 #12).
  const s=_wiRaw(str||''); if(!s||s==='—') return [];
  const parts=s.split(',').map(t=>t.trim()).filter(Boolean);
  const segs=[]; let cur=[];
  for(const p of parts){
    const up=p.toUpperCase();
    const cc=/^[A-Z]{2}$/.test(p)?p:(_WK3CC[up]||null);
    if(cc&&cur.length){ segs.push(cur[0]+', '+cc); cur=[]; }
    else if(!cc) cur.push(p);
  }
  // Ουρά χωρίς χώρα: σε single-location είναι ο τίτλος· αν υπάρχουν ήδη
  // τμήματα είναι σκόρπια πόλη — πετιέται.
  if(cur.length&&!segs.length) segs.push(cur[0]);
  return segs;
}
function _wk3Loc(str){ const L=_wk3Locs(str); return L.length?L[0]:_wiRaw(str||''); }
// Route κείμενο: 1ο σημείο + διακριτικό ×N με αριθμημένη λίστα στο tooltip
// Πολλαπλά σημεία (owner 10/8): «όλες οι πληροφορίες να αναγράφονται» — το
// 1ο σημείο μένει στη γραμμή, τα υπόλοιπα ΔΙΠΛΩΝΟΥΝ από κάτω με τη δική
// τους ημερομηνία (τονισμένη όταν διαφέρει από του 1ου).
function _wk3Arr(str,arr){
  let L;
  if(Array.isArray(arr)&&arr.length)
    L=arr.map(x=>typeof x==='string'?{n:_wk3Loc(x),dt:''}:{n:_wk3Loc(x.n),dt:x.dt||''});
  else L=_wk3Locs(str).map(n=>({n,dt:''}));
  // Σωστή χρονολογική σειρά σημείων (owner 10/8) — stable sort κατά ημερομηνία
  return L.map((x,i)=>({...x,_i:i}))
    .sort((a,b)=>(String(a.dt||'').localeCompare(String(b.dt||'')))||(a._i-b._i));
}
// Ίδιας-μέρας σημεία (owner 10/8): ΔΙΠΛΑ-ΔΙΠΛΑ στη γραμμή· από κάτω μόνο
// όσα πέφτουν άλλη μέρα. Στα 3+ ίδιας μέρας: συντομογραφίες + κλικ που
// ξεδιπλώνει σειρά με τα πλήρη ονόματα.
function _wk3SideCalc(str,arr){
  const L=_wk3Arr(str,arr);
  const d0=L.length&&L[0].dt?toLocalDate(L[0].dt):'';
  const same=[],diff=[];
  L.forEach(x=>{ const dd=x.dt?toLocalDate(x.dt):''; (dd&&d0&&dd!==d0?diff:same).push(x); });
  return {L,same,diff};
}
function _wk3LocHTML(str,label,arr){
  const kind=label==='Φόρτωση'?'load':'del';
  const {L,same}=_wk3SideCalc(str,arr);
  if(!L.length) return (_wiClean(str||'—'));
  const circ=i=>`<span class="wk3-stopn${kind==='load'?' ln':''}">${i+1}</span>`;
  if(L.length===1) return escapeHtml(L[0].n);
  if(same.length===1) return `${circ(0)}${escapeHtml(same[0].n)}`;
  // Έως 3 σημεία με πλήρη ονόματα (owner 12/8: «δύσκολο να διαβάσει ποια είναι
  // τα σημεία») — η γραμμή απλώνει ως τις παλέτες· αν πάλι δεν χωρά και κοπεί
  // με «…», το hover δείχνει την πλήρη αριθμημένη λίστα. Συντομογραφία μόνο 4+.
  if(same.length<=3){
    const tip3=escapeHtml(same.map((x,i)=>`${i+1}. ${x.n}`).join('\n'));
    return `<span title="${tip3}">${same.map((x,i)=>`${circ(i)}${escapeHtml(x.n)}`).join(' ')}</span>`;
  }
  const tip=escapeHtml(same.map((x,i)=>`${i+1}. ${x.n}`).join('\n'));
  const ab=same.map((x,i)=>`${circ(i)}${escapeHtml(x.n.split(',')[0].slice(0,5))}…`).join(' ');
  return `<span class="wk3-abbr" title="${same.length} σημεία — κλικ για πλήρη ονόματα&#10;${tip}" onclick="event.stopPropagation();const c=this.closest('.wk3-lcol')||this.closest('.wk3-fcol');const f=c&&c.querySelector('.wk3-xfold');if(f)f.classList.toggle('open')">${ab}</span>`;
}
function _wk3MoreStops(str,arr,kind){
  const {L,same,diff}=_wk3SideCalc(str,arr);
  if(L.length<2) return '';
  const arrow=kind==='del'?'<span class="wk3-sep" style="margin:0 2px 0 0">→</span>':'';
  const circ=i=>`<span class="wk3-stopn${kind==='load'?' ln':''}">${i+1}</span>`;
  let html='';
  // Αναδιπλωμένη σειρά πλήρων ονομάτων για τα 3+ ίδιας μέρας (ανοίγει με κλικ)
  if(same.length>=3){
    html+=`<div class="wk3-xfold">${same.map((x,i)=>
      `<div class="wk3-stopline${kind==='del'?' dl':''}">${arrow}${circ(i)}<span class="wk3-sln">${escapeHtml(x.n)}</span></div>`).join('')}</div>`;
  }
  // Διαφορετικής μέρας: πάντα δική τους γραμμή με την ημερομηνία τους
  html+=diff.map((st,i)=>{
    const dtxt=st.dt?_wk3D(_wiFmt(st.dt)):'';
    return `<div class="wk3-stopline${kind==='del'?' dl':''}">${arrow}${circ(same.length+i)}${dtxt?`<b class="wk3-sld diff" title="Διαφορετική ημέρα από το 1ο σημείο">${dtxt}</b>`:''}<span class="wk3-sln">${escapeHtml(st.n)}</span></div>`;
  }).join('');
  return html;
}
function _wk3Edit(orderId){
  if(!orderId) return;
  const rec=WINTL.data.exports.find(r=>r.id===orderId)||WINTL.data.imports.find(r=>r.id===orderId);
  if(rec&&typeof openIntlEditWith==='function') openIntlEditWith(orderId, rec.fields);
}
// Πρόοδος φορτίου (demo εγκεκριμένο 10/8, χωρίς τελείες): πράσινη ημ/νία ✓
// όταν το βήμα ολοκληρωθεί, πορτοκαλί «!» όταν καθυστέρησε.
// Υβριδική ημερομηνία VS (owner 10/8): πραγματική = 'VS CD Date', αλλιώς
// εκτίμηση Loading+1 (export) / Delivery−1 (import), εμφανώς «≈».
function _wk3VsCd(f,dir){
  const real=f?.['VS CD Date'];
  if(real) return {iso:String(real).slice(0,10),est:false};
  const base=dir==='imp'?f?.['Delivery DateTime']:f?.['Loading DateTime'];
  if(!base) return {iso:'',est:true};
  try{ return {iso:toLocalDate(new Date(new Date(base).getTime()+(dir==='imp'?-1:1)*86400000)),est:true}; }
  catch(e){ return {iso:'',est:true}; }
}
// Όλες οι ημερομηνίες του Weekly κλικαμπλ (owner 10/8): κλικ → calendar →
// PATCH στο order. Datetime πεδία κρατούν την ώρα τους· το VS CD Date είναι
// σκέτη ημερομηνία.
function _wk3PickDate(ev,orderId,field,curIso){
  ev.stopPropagation(); ev.preventDefault();
  if(!orderId) return;
  const inp=document.createElement('input'); inp.type='date';
  inp.value=String(curIso||'').slice(0,10);
  Object.assign(inp.style,{position:'fixed',left:Math.min(ev.clientX,window.innerWidth-180)+'px',top:(ev.clientY+8)+'px',zIndex:9999,opacity:0.01,width:'2px',height:'2px'});
  document.body.appendChild(inp);
  let doneFlag=false;
  inp.onchange=async ()=>{
    if(doneFlag) return; doneFlag=true;
    const nd=inp.value; inp.remove(); if(!nd) return;
    try{
      let val=nd;
      if(field!=='VS CD Date'){
        const o=curIso?new Date(curIso):new Date(nd+'T08:00:00');
        const [y,m,d]=nd.split('-');
        o.setFullYear(+y,+m-1,+d);
        val=o.toISOString();
      }
      const res=await atSafePatch(TABLES.ORDERS,orderId,{[field]:val});
      if(res?.error) throw new Error(res.error.message||res.error.type);
      toast('Ημερομηνία ενημερώθηκε ✓');
      renderWeeklyIntl();
    }catch(e){ reportError('Η αλλαγή ημερομηνίας απέτυχε',e); }
  };
  inp.onblur=()=>setTimeout(()=>{ if(!doneFlag) inp.remove(); },300);
  inp.focus();
  try{ inp.showPicker(); }catch(e){}
}
function _wk3StFlags(f){
  const st=f?.['Status']||'';
  return { loaded:['In Transit','Delivered','Invoiced'].includes(st),
           delivered:['Delivered','Invoiced'].includes(st),
           late:f?.['Delivery Performance']==='Delayed' };
}
function _wk3D(s){return String(s).replace(/^0/,'').replace(/\/0/,'/');}
function _wk3AddDays(iso,days){ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+days); return toLocalDate(d); }
// ✨ Πρόταση για ορφανό export: ΠΡΩΤΑ δικός στόλος (default — δεν ορίστηκε
// αλλιώς): οδηγός διαθέσιμος κατά Χ+2 για την ημέρα φόρτωσης + ελεύθερο
// φορτηγό. Συνεργάτης δεν προτείνεται αυτόματα — απόφαση dispatcher.
function _wk3Suggest(row){
  if(row.saved||row.type!=='export') return null;
  const exp=WINTL.data.exports.find(x=>x.id===row.orderIds?.[0]); if(!exp) return null;
  const loadD=toLocalDate(exp.fields['Loading DateTime']||''); if(!loadD) return null;
  const {byDriver,byTruck}=WINTL._busy||_wk3Busy();
  const drv=(WINTL.data.drivers||[]).find(d=>{ const b=byDriver[d.id]; return !b || _wk3AddDays(b.end,2)<=loadD; });
  const trk=(WINTL.data.trucks||[]).find(t=>{ const b=byTruck[t.id]; return !b || b.end<loadD; });
  return (drv&&trk)?{driver:drv,truck:trk}:null;
}
// Αποδοχή με ΕΝΑ κλικ — περνά από το ΚΑΝΟΝΙΚΟ μονοπάτι αποθήκευσης
// (validations, T1 same-day confirm, optimistic locks, PA/VS sync).
async function _wk3Accept(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId); if(!row) return;
  const s=_wk3Suggest(row); if(!s){ toast('Δεν υπάρχει διαθέσιμη πρόταση','warn'); return; }
  row.truckId=s.truck.id; row.truckLabel=s.truck.label;
  row.driverId=s.driver.id; row.driverLabel=s.driver.label;
  await _wiSaveFromPopover(rowId);
}
function _wk3FlashSugs(){
  const f=document.querySelector('.wk3-sug');
  if(f){ f.closest('.wk3-row')?.scrollIntoView({behavior:'smooth',block:'center'}); }
  document.querySelectorAll('.wk3-sug').forEach(p=>{p.style.transition='box-shadow .3s';p.style.boxShadow='0 0 0 3px var(--accent-light)';setTimeout(()=>p.style.boxShadow='',1600);});
}

// Πάνελ ΟΔΗΓΟΙ · 561/2006: τρεις καταστάσεις ανά οδηγό — σε δρομολόγιο →
// ανάπαυση → διαθέσιμος. Οι διαθέσιμοι πρώτοι (τροφοδοτούν τις ✨).
function _wiDriversPanel(){
  const {byDriver}=WINTL._busy||_wk3Busy();
  const today=(typeof localToday==='function')?localToday():toLocalDate(new Date());
  const fmt=iso=>{try{return new Date(iso+'T12:00:00').toLocaleDateString('el-GR',{weekday:'short',day:'numeric',month:'numeric'});}catch{return iso;}};
  const items=(WINTL.data.drivers||[]).map(d=>{
    const first=escapeHtml((d.label||'').trim().split(/\s+/)[0]);
    const b=byDriver[d.id];
    if(!b) return {free:true,k:'0',name:first,html:`<div class="rc free" title="Χωρίς ανάθεση αυτή την εβδομάδα"><b>${first}</b><span>διαθέσιμος</span></div>`};
    const avail=_wk3AddDays(b.end,2), red=_wk3AddDays(b.end,1);
    const onTrip=b.end>=today;
    const state=onTrip?`δρομ. → ${fmt(b.end)}${b.place?' · '+escapeHtml(b.place):''}`:`ανάπ. → ${fmt(avail)}`;
    return {free:false,k:b.end,html:`<div class="rc" title="Επιστροφή ${fmt(b.end)} → διαθέσιμος ${fmt(avail)} (κανόνας Χ+2). ⚡ Κατ' εξαίρεση με μειωμένη: ${fmt(red)} (Χ+1)."><b>${first}</b><span>${state}</span></div>`};
  }).sort((a,b)=>(a.free===b.free)?String(a.k).localeCompare(String(b.k)):(a.free?-1:1));
  if(!items.length) return '';
  // 30 «διαθέσιμος» κάρτες = θόρυβος — 6 πρώτες + «+N» με ονόματα στο tooltip
  const free=items.filter(i=>i.free), busy=items.filter(i=>!i.free);
  const shown=[...free.slice(0,6),...busy];
  const extraN=free.length-6;
  return `<h3>ΟΔΗΓΟΙ · 561/2006</h3>
    ${shown.map(i=>i.html).join('')}
    ${extraN>0?`<div class="rc free" style="cursor:help" title="${free.slice(6).map(i=>i.name).join(', ')}"><b>+${extraN}</b><span>διαθέσιμοι ακόμη</span></div>`:''}
    <p class="rnote">Κανόνας ημερών: <b>επιστροφή Χ → αναχώρηση Χ+2</b>. Το <b style="color:var(--warn,#B45309)">⚡Χ+1</b> = κατ' εξαίρεση μειωμένη, ως πρόταση. Οι ✨ σέβονται τον κανόνα.</p>`;
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
function _wiWeekOf(dt){ if(!dt) return null; try{return _wiWeekNumOf(new Date(new Date(dt).getTime()+86400000));}catch{return null;} }
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

// GRP σειρά παράδοσης (owner 12/8): ζει ΜΕΣΑ στο Group ID ως «GRP-xxx|recA,recB»
// ώστε να μη χρειαστεί νέα στήλη/worker deploy — το collapse δουλεύει με απλή
// ισότητα του string, άρα το κοινό suffix δεν το σπάει. Χωρίς suffix, η σειρά
// πέφτει σε ημερομηνία παράδοσης.
function _wiGrpOrder(exps){
  if(exps.length<2) return exps;
  const gid=String(exps.find(e=>e.fields['Group ID'])?.fields['Group ID']||'');
  const seq=(gid.split('|')[1]||'').split(',').filter(Boolean);
  if(seq.length){
    const pos=id=>{const k=seq.indexOf(id);return k<0?99:k;};
    return [...exps].sort((a,b)=>pos(a.id)-pos(b.id));
  }
  return [...exps].sort((a,b)=>String(a.fields['Delivery DateTime']||'').localeCompare(String(b.fields['Delivery DateTime']||'')));
}

function _wiRowHTML(row,i){
  const {data,ui}=WINTL;
  const exps   =_wiGrpOrder(row.orderIds.map(id=>data.exports.find(r=>r.id===id)).filter(Boolean));
  const imp    =row.importId?data.imports.find(r=>r.id===row.importId):null;
  const isOpen =ui.openRow===row.id;
  const isGroup=exps.length>1;
  const primary=exps[0];

  // Classic design — no colored dots on row numbers
  const hasPartner=!!(row.partnerLabel||data.partners.find(p=>p.id===row.partnerId)?.label);
  let sCls='s-default';

  const fromStr=primary?_wiRaw(primary.fields['Loading Summary']||primary.fields['Client Name']||primary.fields['Client Summary']||'—'):'—';
  const toStr  =primary?_wiRaw(primary.fields['Delivery Summary']||primary.fields['Client Name']||primary.fields['Client Summary']||'—'):'—';
  // GRP (owner 12/8): η γραμμή δείχνει ΕΝΑ σημείο ανά ΜΕΛΟΣ (①=1ο μέλος κ.ο.κ.),
  // όχι το comma-parsing του summary του πρώτου — αυτό εμφάνιζε την πόλη του
  // San Lucar ως ψεύτικο «② προορισμό». Συνθετικά arrays {n,dt} ώστε τα ①②,
  // η συντομογραφία 3+ και το ίδια-μέρα-δίπλα να δουλέψουν με την υπάρχουσα λογική.
  // Fallback ΧΩΡΙΣ escapeHtml — το _wk3LocHTML κάνει το δικό του escape στα
  // items του arr, οπότε _wiClean εδώ θα έδινε διπλό («&quot;» ως κείμενο).
  const _gm1=(e,key,sumKey)=>({ n:(e.fields[key]?.[0]?.n)||String(e.fields[sumKey]||e.fields['Client Name']||'—').split(',').slice(0,2).join(',').replace(/^['"\s/]+/,'').replace(/['"\s/]+$/,'').trim(),
    dt:e.fields[sumKey==='Loading Summary'?'Loading DateTime':'Delivery DateTime'] });
  const gL=isGroup?exps.map(e=>_gm1(e,'_stopsL','Loading Summary')):null;
  const gD=isGroup?exps.map(e=>_gm1(e,'_stopsD','Delivery Summary')):null;
  const gLs=gL?gL.map(x=>x.n).join(', '):'';
  const gDs=gD?gD.map(x=>x.n).join(', '):'';
  const pals   =isGroup?exps.reduce((s,r)=>s+(r.fields['Total Pallets']||0),0):
                        (primary?.fields['Total Pallets']||0);
  const loadDt =_wiFmt(primary?.fields['Loading DateTime']);
  const delDt  =_wiFmt(primary?.fields['Delivery DateTime']);
  const ref    =primary?.fields['Reference']||'';

  // Assignment pill
  const truck  =row.truckLabel  ||data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const trailer=row.trailerLabel||data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  const driver =row.driverLabel ||data.drivers.find(d=>d.id===row.driverId)?.label||'';
  // Fallback «Συνεργάτης» (owner 12/8): νέος partner που δεν είναι ακόμη στην
  // 30' cache των άλλων χρηστών εμφανιζόταν ως navy «—» αντί για πράσινο pill.
  const partner=row.partnerLabel||data.partners.find(p=>p.id===row.partnerId)?.label||(row.partnerId?'Συνεργάτης':'');
  const surname=driver?driver.trim().split(/\s+/)[0]:'';

  // v3.1 proto pills — 24px, μία γραμμή (πινακίδα + επώνυμο / εταιρεία + πινακίδες)
  let pill;
  if(row.saved){
    if(partner){
      pill=`<div class="wk3-pill par" title="Συνεργάτης${row.partnerPlates?' · '+escapeHtml(row.partnerPlates):''}${driver?' · '+escapeHtml(driver):''} — κλικ: αλλαγή ανάθεσης">${escapeHtml(partner.slice(0,22))}${(row.partnerPlates||surname)?` <small>${escapeHtml([row.partnerPlates,surname].filter(Boolean).join(' '))}</small>`:''}</div>`;
    } else {
      pill=`<div class="wk3-pill own" title="${escapeHtml([truck,trailer].filter(Boolean).join(' · '))}${driver?' · '+escapeHtml(driver):''} — κλικ: αλλαγή ανάθεσης">${escapeHtml([truck,trailer].filter(Boolean).join('·')||'—')}${surname?` <small>${escapeHtml(surname)}</small>`:''}</div>`;
    }
  } else {
    // v3 (owner: «χρώμα, όχι λόγια»): ορφανό = κενό κόκκινο dashed πεδίο.
    // Η ✨ πρόταση στόλου αφαιρέθηκε (owner 12/8: «δεν μου αρέσει») — το
    // popover ανάθεσης παραμένει ο μόνος δρόμος.
    pill=`<div class="wk3-pill un" title="Ορφανό — χωρίς ανάθεση. Κλικ για ανάθεση"></div>`;
  }

  // Import side — v3.1: ld μπροστά, VS override στον προορισμό (προς Βέροια),
  // meta μόνο παλέτες. Ορφανός own γύρος = κόκκινο πεδίο («χρώμα, όχι λόγια»).
  const stF=_wk3StFlags(primary?.fields);
  const stI=_wk3StFlags(imp?.fields);
  const impLoadDt=imp?_wiFmt(imp.fields['Loading DateTime']):'';
  const impDelDt2=imp?_wiFmt(imp.fields['Delivery DateTime']):'—';
  const impPals=imp?imp.fields['Total Pallets']||0:0;
  const impVS=!!imp?.fields['Veroia Switch'];
  const impPrev=imp
    ?`<div class="wk3-lcol"><span class="wk3-route"><b class="wk3-ld${stI.loaded?' done':''}" style="cursor:pointer" title="Ημ. φόρτωσης εισαγωγής${stI.loaded?' — φορτώθηκε ✓':''} — κλικ για αλλαγή" onclick="_wk3PickDate(event,'${imp?.id}','Loading DateTime','${imp?.fields['Loading DateTime']||''}')">${impLoadDt!=='—'?_wk3D(impLoadDt):''}</b><span class="frm">${_wk3LocHTML(imp.fields['Loading Summary']||imp.fields['Client Name']||imp.fields['Client Summary']||'—','Φόρτωση',imp.fields._stopsL)}</span><span class="wk3-sep">→</span>${(()=>{ if(impVS){ const v=_wk3VsCd(imp?.fields,'imp');
      return `<b class="wk3-ld${stI.delivered?' done':''}${stI.late?' late':''}${v.est?' estd':''}" style="cursor:pointer" title="${v.est?'Εκτίμηση άφιξης CD (Delivery−1) — κλικ για πραγματική':'Ημ. άφιξης στο Cross-Dock — κλικ για αλλαγή'}" onclick="_wk3PickDate(event,'${imp?.id}','VS CD Date','${v.iso}')">${v.iso?_wk3D(_wiFmt(v.iso+'T12:00:00')):''}</b>`; }
    return `<b class="wk3-ld${stI.delivered?' done':''}${stI.late?' late':''}" style="cursor:pointer" title="Ημ. παράδοσης${stI.delivered?' — παραδόθηκε ✓':''}${stI.late?' — ΚΑΘΥΣΤΕΡΗΣΕ':''} — κλικ για αλλαγή" onclick="_wk3PickDate(event,'${imp?.id}','Delivery DateTime','${imp?.fields['Delivery DateTime']||''}')">${impDelDt2!=='—'?_wk3D(impDelDt2):''}</b>`; })()}<span class="to">${impVS?'Cross-Dock':_wk3LocHTML(imp.fields['Delivery Summary']||imp.fields['Client Name']||imp.fields['Client Summary']||'—','Παράδοση',imp.fields._stopsD)}</span>${impVS?' <span class="wk3-vsb">VS</span>':''}</span>${_wk3MoreStops(imp.fields['Loading Summary']||'',imp.fields._stopsL,'load')}${impVS?'':_wk3MoreStops(imp.fields['Delivery Summary']||'',imp.fields._stopsD,'del')}</div>
     <span class="wk3-meta"><span class="wk3-palpe">${impPals?impPals+'p':''}${_wiBadges(imp.fields)}</span></span>
     <button class="wk3-unm" title="Αφαίρεση ταιριάσματος" onclick="event.stopPropagation();_wiUnmatch('${imp.id}')">✕</button>`
    :'';
  // gap = ΔΕΝ έχει δηλωθεί import (row.importId) — όχι «δεν βρέθηκε το record
  // στη φετινή εβδομάδα» (matched import άλλης εβδομάδας ≠ κενό γυρισμού)
  const gapCell=row.saved&&!hasPartner&&!row.importId;
  // Owner (9/8): partner με ανάθεση και χωρίς απέναντι σκέλος → ΜΑΥΡΟ πεδίο
  const parCell=row.saved&&hasPartner&&!row.importId;

  const vsExp=!!primary?.fields['Veroia Switch'];
  // Owner (9/8): τα feeds δείχνουν ΑΠΟ ΤΩΡΑ τον τόπο (εθνικό σκέλος)·
  // ο μεταφορέας θα συμπληρώνεται αργότερα από το Weekly National.
  const feedL=vsExp?`<div class="wk3-fcol"><div class="wk3-fline"><b style="cursor:pointer" title="Εθνικό σκέλος: ημ. φόρτωσης από αρχικό πελάτη — κλικ για αλλαγή" onclick="_wk3PickDate(event,'${primary?.id}','Loading DateTime','${primary?.fields['Loading DateTime']||''}')">${loadDt!=='—'?_wk3D(loadDt):''}</b>&nbsp;${_wk3LocHTML(fromStr,'Φόρτωση',primary?.fields._stopsL)}</div>${_wk3MoreStops(fromStr,primary?.fields._stopsL,'load')}</div>`:'';
  const feedR=(imp&&impVS)?`<div class="wk3-fcol"><div class="wk3-fline"><b style="cursor:pointer" title="Εθνικό σκέλος: ημ. τελικής διανομής — κλικ για αλλαγή" onclick="_wk3PickDate(event,'${imp.id}','Delivery DateTime','${imp.fields['Delivery DateTime']||''}')">${impDelDt2!=='—'?_wk3D(impDelDt2):''}</b>&nbsp;${_wk3LocHTML(imp.fields['Delivery Summary']||'','Παράδοση',imp.fields._stopsD)}</div>${_wk3MoreStops(imp.fields['Delivery Summary']||'',imp.fields._stopsD,'del')}</div>`:'';
  return `
  <div id="wi-row-${row.id}" data-row-id="${row.id}" class="wk3-row${row._alt?' alt':''}${stF.delivered&&!stF.late?' wk3-done':''}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_wiToggle(${row.id})}" role="button" tabindex="0" onclick="_wiToggle(${row.id})">
    <div class="wk3-num">${i+1}${isGroup?`<span class="wk3-grpb" title="Groupage ×${exps.length} — κλικ: μέλη ομάδας (βάση: το πρώτο-παραδιδόμενο)" onclick="event.stopPropagation();_wiToggleGroup(${row.id})">×${exps.length}</span>`:''}<span class="wi-sync" id="wi-sync-${row.id}"></span></div>
    <div class="wk3-feed l${!vsExp?' bgap':''}" title="${vsExp?'Εθνικό σκέλος προς Βέροια — φόρτωση από τον αρχικό πελάτη. Ο μεταφορέας συμπληρώνεται στο Weekly National.':'Χωρίς εθνικό σκέλος — δεν είναι Veroia Switch'}">${feedL}</div>
    <div class="wk3-leg${isGroup?' grp':''}" style="cursor:pointer" title="${isGroup?'Κλικ: καρτέλα ρότας ομάδας':'Κλικ: άνοιγμα φόρμας παραγγελίας'}" oncontextmenu="_wiCtx(event,${row.id},event)" onclick="event.stopPropagation();${isGroup?`_wiRota(${row.id})`:`_wk3Edit('${primary?.id||''}')`}">
      <div class="wk3-lcol"><span class="wk3-route">${(()=>{ if(vsExp){ const v=_wk3VsCd(primary?.fields,'exp');
      return `<b class="wk3-ld${stF.loaded?' done':''}${v.est?' estd':''}" style="cursor:pointer" title="${v.est?'Εκτίμηση (Loading+1) — κλικ για πραγματική ημερομηνία CD':'Ημ. φόρτωσης από Cross-Dock — κλικ για αλλαγή'}" onclick="_wk3PickDate(event,'${primary?.id}','VS CD Date','${v.iso}')">${v.iso?_wk3D(_wiFmt(v.iso+'T12:00:00')):''}</b>`; }
    return `<b class="wk3-ld${stF.loaded?' done':''}" style="cursor:pointer" title="Ημερομηνία φόρτωσης${stF.loaded?' — φορτώθηκε ✓':''} — κλικ για αλλαγή" onclick="_wk3PickDate(event,'${primary?.id}','Loading DateTime','${primary?.fields['Loading DateTime']||''}')">${loadDt!=='—'?_wk3D(loadDt):''}</b>`; })()}<span class="frm">${vsExp?'Cross-Dock <span class="wk3-vsb">VS</span>':_wk3LocHTML(isGroup?gLs:fromStr,'Φόρτωση',isGroup?gL:primary?.fields._stopsL)}</span><span class="wk3-sep">→</span><span class="to">${_wk3LocHTML(isGroup?gDs:toStr,'Παράδοση',isGroup?gD:primary?.fields._stopsD)}${stF.late?'<span class="wk3-late" title="Καθυστέρησε">!</span>':stF.delivered?'<span class="wk3-okc" title="Παραδόθηκε">✓</span>':''}${(primary?.fields['Order Number']||ref)?`<span class="wk3-ordn" title="Order">${escapeHtml(String(primary?.fields['Order Number']||ref))}</span>`:''}</span></span>${vsExp?'':_wk3MoreStops(isGroup?gLs:fromStr,isGroup?gL:primary?.fields._stopsL,'load')}${_wk3MoreStops(isGroup?gDs:toStr,isGroup?gD:primary?.fields._stopsD,'del')}${(isGroup&&ui.openGroup===row.id)?exps.map((m,k)=>{const mf=m.fields;
        const ml=mf['Loading DateTime']?`<b class="wk3-ld">${_wk3D(_wiFmt(mf['Loading DateTime']))}</b> `:'';
        const md=mf['Delivery DateTime']?`<b class="wk3-ld">${_wk3D(_wiFmt(mf['Delivery DateTime']))}</b> `:'';
        return `<div class="wk3-stopline wk3-gm" title="Κλικ: φόρμα παραγγελίας" onclick="event.stopPropagation();_wk3Edit('${m.id}')"><span class="wk3-gmn">${k+1}</span><span class="wk3-gmc">${ml}${(_wiClean(mf['Loading Summary']||mf['Client Name']||'—'))}</span><span class="wk3-sep">→</span><span class="wk3-gmc">${md}${(_wiClean(mf['Delivery Summary']||'—'))}</span><span class="wk3-gmp">${mf['Total Pallets']?mf['Total Pallets']+'p':''}</span></div>`;}).join(''):''}</div>
      <span class="wk3-meta"><span class="wk3-palpe">${pals?pals+'p':''}${_wiBadges(primary?.fields||{})}</span>${_wiCrossChip(primary?.fields)}${_wiExecChip(primary?.fields,row.saved)}</span>
    </div>
    <div class="wk3-assign" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="event.stopPropagation();_wiOpenPopover(event,${row.id})">
      ${isGroup
        ?`<button class="wk3-prt" title="Εκτύπωση ομάδας — ${exps.length} έγγραφα σε ένα πακέτο" onclick="event.stopPropagation();_wiPrintGroup(${row.id})">⎙</button>`
        :`<button class="wk3-prt" title="Εκτύπωση εντολής (export)" onclick="event.stopPropagation();_wiPrint(${row.id},'export')">⎙</button>`}
      ${pill}
      ${row.importId?`<button class="wk3-prt" title="Εκτύπωση εντολής (import)" onclick="event.stopPropagation();_wiPrint(${row.id},'import')">⎙<sup>I</sup></button>`:''}
    </div>
    <div class="wk3-leg imp${gapCell?' gap':''}${!imp&&!gapCell&&(parCell||!row.saved)?' bgap':''}${!imp&&!gapCell&&!parCell&&row.saved?' void':''}" id="wi-ci-${row.id}"
         ${imp?'style="cursor:pointer"':''}
         onclick="event.stopPropagation();${gapCell?`_wk3Gaps()`:imp?`_wk3Edit('${row.importId}')`:``}"
         ${gapCell?`title="Κενό γυρισμού — own γύρος χωρίς φορτίο επιστροφής. Κλικ: τα αδιάθετα imports (ή σύρε import εδώ)"`:parCell?`title="Ανατεθειμένο σε συνεργάτη — δεν αναμένεται δικό μας σκέλος επιστροφής"`:!imp?`title="Σύρε εισαγωγή εδώ για ταίριασμα"`:''}
         ondragover="event.preventDefault();document.getElementById('wi-ci-${row.id}').classList.add('dh')"
         ondragleave="document.getElementById('wi-ci-${row.id}').classList.remove('dh')"
         ondrop="event.stopPropagation();_wiDropOnRow(event,${row.id})">
      ${impPrev}
    </div>
    <div class="wk3-feed r${feedR?'':' bgap'}" title="${feedR?'Εθνική διανομή από Βέροια — τελικός προορισμός. Ο μεταφορέας συμπληρώνεται στο Weekly National.':'Χωρίς εθνικό σκέλος'}">${feedR}</div>
  </div>
  ${isOpen?`<div class="wk3-prow" data-row-id="${row.id}">${_wiPanelHTML(row)}</div>`:''}`;
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
function _wiPrintImp(impId, hasPartner){
  printOrderSheet(impId, 'import', !!hasPartner);
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
      if (typeof plOnIntlPartnerAssigned === 'function') plOnIntlPartnerAssigned(orderId);
    }catch(err){errors.push(err.message);}
  }
  if(row.importId && !row.orderIds.includes(row.importId)){
    try{
      const res=await atSafePatch(TABLES.ORDERS,row.importId,impFields);
      if(res?.conflict){ toast('Record modified by another user — refreshing','warn'); await renderWeeklyIntl(); return; }
      if(res?.error) throw new Error(res.error.message||res.error.type||JSON.stringify(res.error));
      // Το σκέλος εισαγωγής είναι ΑΚΡΙΒΩΣ η περίπτωση PARTNER_DROPOFF (ο partner
      // μάς φέρνει φορτίο): χωρίς αυτό το κάλεσμα καταγραφόταν μόνο η μισή ροή.
      if (typeof plOnIntlPartnerAssigned === 'function') plOnIntlPartnerAssigned(row.importId);
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
      if (typeof plOnIntlPartnerAssigned === 'function') plOnIntlPartnerAssigned(orderId);
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
      // Χωρίς ανάθεση δεν υπάρχει ανταλλαγή: ο feeder σβήνει την εκκρεμή κίνηση
      // partner (τις οριστικές δεν τις αγγίζει — είναι ιστορικό).
      if (typeof plOnIntlPartnerAssigned === 'function') plOnIntlPartnerAssigned(orderId);
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
// Owner (10/8): κανόνας groupage — δείξε ΜΟΝΟ συνδυασμούς με σύνολο ≤33
// παλέτες (χωρητικότητα). «Δώρο άδωρο να εμφανίζει όλα τα φορτία».
function _wiRowPals(row){
  if(!row) return 0;
  if(row.type==='import'){
    const i=WINTL.data.imports.find(r=>r.id===row.orderId);
    return +(i?.fields['Total Pallets']||0);
  }
  return (row.orderIds||[]).reduce((s,oid)=>{
    const o=WINTL.data.exports.find(r=>r.id===oid);
    return s+(+(o?.fields['Total Pallets']||0));
  },0);
}
function _wiCtx(e,rowId){
  e.preventDefault();e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const isGroup=row.orderIds.length>1;
  const myPals=_wiRowPals(row);
  const others=WINTL.rows.filter(r=>r.id!==rowId&&!r.saved&&r.type==='export'
    &&(myPals+_wiRowPals(r))<=33);
  const btn=(l,fn,d=false)=>
    `<button class="wi-ctx-i${d?' d':''}" onclick="${fn};_wiCtxClose()">${l}</button>`;
  let html='';
  if(others.length){
    html+=`<div class="wi-ctx-h">Groupage · χωράνε ≤33 παλ (τώρα ${myPals}p)</div>`;
    others.slice(0,6).forEach(o=>{
      const exp=WINTL.data.exports.find(r=>r.id===o.orderIds[0]);
      const lbl=_wiClean(exp?.fields['Delivery Summary']||`Row ${o.id}`).slice(0,24);
      const op=_wiRowPals(o);
      html+=btn(`Μαζί με: ${lbl} (${op}p → ${myPals+op}p)`,`_wiMerge(${rowId},${o.id})`);
    });
    html+=`<div class="wi-ctx-sep"></div>`;
  }else if(row.type==='export'&&!row.saved){
    html+=`<div class="wi-ctx-h">Groupage — καμία συμβατή (όριο 33 παλ, τώρα ${myPals}p)</div>`;
  }
  const rc=_wiRotCands(row);
  if(rc.length){
    html+=`<div class="wi-ctx-h">⤷ Σκέλος προώθησης (ρότα)</div>`;
    rc.forEach(c2=>{ html+=btn(`⤷ ${c2.lbl}`,`_wiRotAdd(${rowId},'${c2.oid}')`); });
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

// Ρότα: υποψήφια σκέλη για γονέα-order — διεθνή, χωρίς δική τους ρότα,
// όχι ο ίδιος/η ταιριασμένη του εισαγωγή, φόρτωση από τη φόρτωση του γονέα
// και μετά. Επιστρέφει [{oid,lbl}].
function _wiRotCands(parentRow){
  const pOid=parentRow.type==='import'?parentRow.orderId:parentRow.orderIds?.[0];
  const po=WINTL.data.exports.find(x=>x.id===pOid)||WINTL.data.imports.find(x=>x.id===pOid);
  if(!po) return [];
  const pLoad=String(po.fields['Loading DateTime']||'');
  const out=[];
  for(const r of WINTL.rows){
    if(r.id===parentRow.id||r.legOf||r.adj) continue;
    const oid=r.type==='import'?r.orderId:r.orderIds?.[0];
    if(!oid||oid===pOid||oid===parentRow.importId) continue;
    const o=WINTL.data.exports.find(x=>x.id===oid)||WINTL.data.imports.find(x=>x.id===oid);
    if(!o||o.fields['Rotation ID']) continue;
    if(String(o.fields['Loading DateTime']||'')<pLoad) continue;
    const lbl=`${_wk3D(_wiFmt(o.fields['Loading DateTime']))} ${_wk3Loc(o.fields['Loading Summary']||'—')} → ${_wk3Loc(o.fields['Delivery Summary']||'—')}`.slice(0,40);
    out.push({oid,lbl});
    if(out.length>=6) break;
  }
  return out;
}
async function _wiRotAdd(parentRowId, legOid){
  const pr=WINTL.rows.find(r=>r.id===parentRowId); if(!pr) return;
  const pOid=pr.type==='import'?pr.orderId:pr.orderIds?.[0];
  const patch={'Rotation ID':pOid};
  // Το σκέλος κληρονομεί όχημα/οδηγό του γονέα (ίδιο φορτηγό συνεχίζει)
  if(pr.truckId)   patch['Truck']=[pr.truckId];
  if(pr.trailerId) patch['Trailer']=[pr.trailerId];
  if(pr.driverId)  patch['Driver']=[pr.driverId];
  try{
    const res=await atSafePatch(TABLES.ORDERS,legOid,patch);
    if(res?.error) throw new Error(res.error.message||res.error.type);
    toast('⤷ Σκέλος συνδέθηκε στη ρότα ✓');
    renderWeeklyIntl();
  }catch(e){ reportError('Η σύνδεση σκέλους απέτυχε',e); }
}
async function _wiRotUnlink(e,legOid){
  e.preventDefault(); e.stopPropagation();
  const ok=await confirmAction('Αποσύνδεση του σκέλους από τη ρότα; (Η ανάθεση οχήματος μένει ως έχει.)',
    {title:'Ρότα',confirmLabel:'Αποσύνδεση'});
  if(!ok) return;
  try{
    const res=await atSafePatch(TABLES.ORDERS,legOid,{'Rotation ID':''});
    if(res?.error) throw new Error(res.error.message||res.error.type);
    toast('Σκέλος αποσυνδέθηκε ✓');
    renderWeeklyIntl();
  }catch(err){ reportError('Η αποσύνδεση απέτυχε',err); }
}

// Owner (10/8): δεξί κλικ σε ΕΙΣΑΓΩΓΗ → Groupage με άλλη εισαγωγή + Μεταφορά
// σε προηγούμενη/επόμενη εβδομάδα (μετακινεί τις ημερομηνίες ±7 ημέρες).
function _wiImpCtx(e,rowId){
  e.preventDefault();e.stopPropagation();
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const btn=(l,fn)=>`<button class="wi-ctx-i" onclick="${fn};_wiCtxClose()">${l}</button>`;
  let html='';
  const myPals=_wiRowPals(row);
  const others=WINTL.rows.filter(r=>r.type==='import'&&r.id!==rowId&&!r.adj&&!r.matchedTo
    &&(myPals+_wiRowPals(r))<=33);
  if(others.length){
    html+=`<div class="wi-ctx-h">Groupage εισαγωγών · ≤33 παλ (τώρα ${myPals}p)</div>`;
    others.slice(0,6).forEach(o=>{
      const oi=WINTL.data.imports.find(r=>r.id===o.orderId);
      const lbl=_wiClean(oi?.fields['Loading Summary']||oi?.fields['Client Name']||`I-${o.id}`).split(',')[0].slice(0,22);
      const op=_wiRowPals(o);
      html+=btn(`Μαζί με: ${lbl} (${op}p → ${myPals+op}p)`,`_wiImpGroup(${rowId},${o.id})`);
    });
    html+=`<div class="wi-ctx-sep"></div>`;
  }
  const rc2=_wiRotCands(row);
  if(rc2.length){
    html+=`<div class="wi-ctx-h">⤷ Σκέλος προώθησης (ρότα)</div>`;
    rc2.forEach(c2=>{ html+=btn(`⤷ ${c2.lbl}`,`_wiRotAdd(${rowId},'${c2.oid}')`); });
    html+=`<div class="wi-ctx-sep"></div>`;
  }
  html+=`<div class="wi-ctx-h">Μεταφορά εβδομάδας</div>`;
  html+=btn(`← Στην W${WINTL.week-1} (ημερομηνίες −7)`,`_wiImpShift(${rowId},-7)`);
  html+=btn(`Στην W${WINTL.week+1} (ημερομηνίες +7) →`,`_wiImpShift(${rowId},7)`);
  const ctx=document.getElementById('wi-ctx');
  ctx.innerHTML=html;
  Object.assign(ctx.style,{display:'block',
    left:`${Math.min(e.clientX,window.innerWidth-220)}px`,
    top:`${Math.min(e.clientY,window.innerHeight-220)}px`});
  setTimeout(()=>document.addEventListener('click',_wiCtxClose,{once:true}),10);
}
async function _wiImpShift(rowId,days){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const imp=WINTL.data.imports.find(r=>r.id===row.orderId);if(!imp) return;
  const w=WINTL.week+(days>0?1:-1);
  const ok=await confirmAction(
    `Η εισαγωγή θα μεταφερθεί στην W${w}: οι ημερομηνίες φόρτωσης και παράδοσης μετακινούνται ${days>0?'+7':'−7'} ημέρες.`,
    {title:'Μεταφορά εβδομάδας',confirmLabel:'Μεταφορά'});
  if(!ok) return;
  const sh=s=>{ if(!s) return null; try{return new Date(new Date(s).getTime()+days*86400000).toISOString();}catch(e){return null;} };
  const patch={};
  const nl=sh(imp.fields['Loading DateTime']); if(nl) patch['Loading DateTime']=nl;
  const nd=sh(imp.fields['Delivery DateTime']); if(nd) patch['Delivery DateTime']=nd;
  if(!Object.keys(patch).length){ toast('Η εισαγωγή δεν έχει ημερομηνίες','warn'); return; }
  try{
    const res=await atPatch(TABLES.ORDERS,imp.id,patch);
    if(res?.error) throw new Error(res.error.message||res.error.type);
    toast(`Μεταφέρθηκε στην W${w} ✓`);
    renderWeeklyIntl();
  }catch(e){ reportError('Η μεταφορά απέτυχε',e); }
}
async function _wiImpGroup(rowId,otherRowId){
  const a=WINTL.rows.find(r=>r.id===rowId), b=WINTL.rows.find(r=>r.id===otherRowId);
  if(!a||!b) return;
  const ai=WINTL.data.imports.find(r=>r.id===a.orderId), bi=WINTL.data.imports.find(r=>r.id===b.orderId);
  if(!ai||!bi) return;
  const gid=ai.fields['Group ID']||bi.fields['Group ID']||('GI-'+Date.now().toString(36).toUpperCase());
  try{
    for(const oid of [ai.id,bi.id]){
      const res=await atSafePatch(TABLES.ORDERS,oid,{'Group ID':gid});
      if(res?.error) throw new Error(res.error.message||res.error.type);
    }
    toast('Groupage εισαγωγών ✓');
    renderWeeklyIntl();
  }catch(e){ reportError('Το groupage απέτυχε',e); }
}

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

/* ── ΚΑΡΤΕΛΑ ΡΟΤΑΣ (owner 12/8, εγκεκριμένο πρωτότυπο grp_trip_proto) ──
   Κλικ σε γραμμή GRP: αντί για φόρμα (ποιου order;) ανοίγει πάνελ με τα μέλη
   της ομάδας — Επεξεργασία ανά order + σειρά παράδοσης με ↑↓. Η σειρά
   αποθηκεύεται στο suffix του Group ID (βλ. _wiGrpOrder). */
function _wiRota(rowId){
  const row=WINTL.rows.find(r=>r.id===rowId); if(!row) return;
  const exps=_wiGrpOrder(row.orderIds.map(id=>WINTL.data.exports.find(r=>r.id===id)).filter(Boolean));
  if(exps.length<2){ _wk3Edit(row.orderIds[0]); return; }
  window._wiRotaState={rowId, ids:exps.map(e=>e.id)};
  _wiRotaRender();
}
function _wiRotaRender(){
  const st=window._wiRotaState; if(!st) return;
  const row=WINTL.rows.find(r=>r.id===st.rowId); if(!row) return;
  const exps=st.ids.map(id=>WINTL.data.exports.find(r=>r.id===id)).filter(Boolean);
  const pals=exps.reduce((s,r)=>s+(r.fields['Total Pallets']||0),0);
  const asn=row.partnerLabel?row.partnerLabel+(row.partnerPlates?' · '+row.partnerPlates:'')
    :(row.truckLabel?row.truckLabel+(row.driverLabel?' · '+row.driverLabel:''):'Αδιάθετο');
  const cardRow=(e)=>{const f=e.fields;
    return `<div style="border:1px solid var(--border,#D6DDE6);border-radius:10px;padding:10px 12px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center">
      <div><div style="font-weight:800;font-size:12.5px">${(_wiClean(f['Client Name']||f['Client Summary']||String(f['Loading Summary']||'—').split(',')[0]))}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px">${f['Reference']?`Ref <b>${escapeHtml(String(f['Reference']))}</b> · `:''}<b>${f['Total Pallets']||0} παλ</b> · ${(_wiClean(f['Loading Summary']||'—'))} → ${(_wiClean(f['Delivery Summary']||'—'))}</div></div>
      <button style="font-size:10.5px;font-weight:800;color:#0284C7;border:1px solid #0284C7;background:#fff;border-radius:7px;padding:5px 12px;cursor:pointer;white-space:nowrap" onclick="_wiRotaClose();_wk3Edit('${e.id}')">Επεξεργασία</button>
    </div>`;};
  const seqRow=(e,k)=>{const f=e.fields;
    return `<div style="display:grid;grid-template-columns:24px 1fr auto 52px;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #E7EBF0;background:#fff">
      <span style="width:17px;height:17px;border-radius:50%;background:#0F172A;color:#fff;font-size:9.5px;font-weight:800;text-align:center;line-height:17px">${k+1}</span>
      <span style="font-weight:700;font-size:12px">${(_wiClean(f['Delivery Summary']||'—'))}<small style="display:block;font-weight:500;color:#475569;font-size:10.5px">${[f['Delivery DateTime']?_wk3D(_wiFmt(f['Delivery DateTime'])):'', (_wiClean(f['Client Name']||f['Client Summary']||String(f['Loading Summary']||'').split(',')[0]))].filter(Boolean).join(' · ')}</small></span>
      <span></span>
      <span style="display:flex;gap:3px;justify-content:flex-end">
        <button ${k===0?'disabled style="opacity:.3;width:22px;height:22px;border:1px solid #D6DDE6;background:#fff;border-radius:5px"':'style="width:22px;height:22px;border:1px solid #D6DDE6;background:#fff;border-radius:5px;color:#475569;cursor:pointer"'} onclick="_wiRotaMv(${k},-1)">↑</button>
        <button ${k===exps.length-1?'disabled style="opacity:.3;width:22px;height:22px;border:1px solid #D6DDE6;background:#fff;border-radius:5px"':'style="width:22px;height:22px;border:1px solid #D6DDE6;background:#fff;border-radius:5px;color:#475569;cursor:pointer"'} onclick="_wiRotaMv(${k},1)">↓</button>
      </span>
    </div>`;};
  let ov=document.getElementById('wiRotaOv');
  if(!ov){ ov=document.createElement('div'); ov.id='wiRotaOv'; document.body.appendChild(ov); }
  ov.innerHTML=`
    <div style="position:fixed;inset:0;background:rgba(11,25,41,.45);z-index:8000" onclick="_wiRotaClose()"></div>
    <div style="position:fixed;top:0;right:0;width:480px;max-width:94vw;height:100vh;background:#fff;z-index:8001;box-shadow:-12px 0 40px rgba(11,25,41,.25);display:flex;flex-direction:column">
      <div style="background:#0B1929;color:#fff;padding:14px 18px">
        <button style="float:right;background:none;border:none;color:#fff;font-size:20px;cursor:pointer" onclick="_wiRotaClose()">×</button>
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:14px">Καρτέλα Ρότας — GRP ×${exps.length}</div>
        <div style="font-size:11px;color:rgba(196,207,219,.8);margin-top:3px">${exps.length} παραγγελίες · ${pals} παλέτες · ${escapeHtml(asn)}</div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:14px 18px">
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:10.5px;letter-spacing:1.2px;color:#0B1929;text-transform:uppercase;margin-bottom:8px">Παραγγελίες του group</div>
        ${exps.map(cardRow).join('')}
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:10.5px;letter-spacing:1.2px;color:#0B1929;text-transform:uppercase;margin:14px 0 8px">Σειρά παράδοσης <span style="font-weight:500;color:#94A3B8;text-transform:none;letter-spacing:0">— βελάκια ↑↓</span></div>
        <div style="border:1px solid #D6DDE6;border-radius:10px;overflow:hidden">${exps.map(seqRow).join('')}</div>
        <div style="font-size:10.5px;color:#94A3B8;margin-top:6px;line-height:1.5">Η σειρά καθορίζει την αρίθμηση στο Weekly και τη διαδρομή στο φύλλο οδηγού.</div>
      </div>
      <div style="border-top:1px solid #E7EBF0;padding:12px 18px;display:flex;gap:10px;justify-content:flex-end">
        <button style="font-size:11.5px;font-weight:800;border-radius:8px;padding:8px 14px;cursor:pointer;background:#fff;color:#B91C1C;border:1px solid rgba(185,28,28,.4);margin-right:auto" onclick="_wiRotaSplit()">Διάλυση ομάδας</button>
        <button style="font-size:11.5px;font-weight:800;border-radius:8px;padding:8px 18px;cursor:pointer;background:#fff;color:#475569;border:1px solid #D6DDE6" onclick="_wiRotaClose()">Κλείσιμο</button>
        <button style="font-size:11.5px;font-weight:800;border-radius:8px;padding:8px 18px;cursor:pointer;background:#0284C7;color:#fff;border:none" onclick="_wiRotaSave()">Αποθήκευση σειράς</button>
      </div>
    </div>`;
}
function _wiRotaMv(i,d){
  const st=window._wiRotaState; if(!st) return;
  const j=i+d; if(j<0||j>=st.ids.length) return;
  [st.ids[i],st.ids[j]]=[st.ids[j],st.ids[i]];
  _wiRotaRender();
}
async function _wiRotaSave(){
  const st=window._wiRotaState; if(!st) return;
  const exps=st.ids.map(id=>WINTL.data.exports.find(r=>r.id===id)).filter(Boolean);
  if(exps.length<2){ _wiRotaClose(); return; }
  const base=String(exps.find(e=>e.fields['Group ID'])?.fields['Group ID']||'').split('|')[0]
    ||('GRP-'+String(st.ids[0]).slice(-8));
  const gid=base+'|'+st.ids.join(',');
  // Γράφεται σε ΟΛΑ τα μέλη: το collapse στηρίζεται σε ισότητα του Group ID —
  // μερική αποτυχία θα έσπαγε την ομάδα στην ανανέωση, γι' αυτό το μήνυμα.
  let failed=false;
  for(const e of exps){
    try{
      const res=await atSafePatch(TABLES.ORDERS,e.id,{'Group ID':gid});
      if(res?.error) throw new Error(res.error.message||res.error.type);
      e.fields['Group ID']=gid;
    }catch(err){ failed=true; console.warn('Rota seq save:',err.message); }
  }
  toast(failed?'Η σειρά δεν αποθηκεύτηκε πλήρως — δοκίμασε ξανά':'Η σειρά αποθηκεύτηκε ✓', failed?'warn':undefined);
  _wiRotaClose();
  _wiRepaintRow(st.rowId);
}
function _wiRotaClose(){ document.getElementById('wiRotaOv')?.remove(); window._wiRotaState=null; }

// Owner 12/8: «δεν υπάρχει κουμπί ακύρωσης του groupage» — ορατή διάλυση από
// την καρτέλα. Το _wiSplit καθαρίζει το Group ID σε ΟΛΑ τα μέλη στη βάση
// (πλέον μόνιμο μετά το view fix), οπότε τα φορτία ξαναγίνονται απλές γραμμές
// και μετά από refresh. GL/CL δεν αγγίζονται — UI-level ομαδοποίηση μόνο.
async function _wiRotaSplit(){
  const st=window._wiRotaState; if(!st) return;
  const ok=await confirmAction('Διάλυση της ομάδας; Τα φορτία επιστρέφουν ως ανεξάρτητες γραμμές. (Η ανάθεση μένει στην πρώτη γραμμή — οι υπόλοιπες θέλουν δική τους.)',
    {title:'Groupage', confirmLabel:'Διάλυση'});
  if(!ok) return;
  const rid=st.rowId;
  _wiRotaClose();
  await _wiSplit(rid);
}

/* ── NAVIGATION ────────────────────────────────────────────────────── */
function _wiPrint(rowId, leg){
  const row=WINTL.rows.find(r=>r.id===rowId);if(!row) return;
  const orderId = leg==='export' ? row.orderIds[0] : (row.importId||row.orderIds[0]);
  // Β.3-6: ρητή επιλογή εντύπου όταν υπάρχει συνεργάτης (helper στο utils)
  printOrderSheet(orderId, leg, !!(row.partnerId||row.partnerLabel));
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
window._wiRota = _wiRota;
window._wiRotaMv = _wiRotaMv;
window._wiRotaSave = _wiRotaSave;
window._wiRotaClose = _wiRotaClose;
window._wiRotaSplit = _wiRotaSplit;
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
window._wiToggleDetails = _wiToggleDetails;
// Νέα παραγγελία από το εβδομαδιαίο — inline onclick, module σε IIFE
window._wiNewOrder = _wiNewOrder;
window._wiExportCSV = _wiExportCSV;
window._wiApplyFilter = _wiApplyFilter;
window._wiPulseRow = _wiPulseRow;
window._wk3Gaps = _wk3Gaps;
window._wiJumpFirstUnassigned = _wiJumpFirstUnassigned;
window._wk3Accept = _wk3Accept;
// Feedback dispatcher (19/5): drag import προς μέρα εκτός οθόνης απαιτούσε
// zoom-out — τώρα το φύλλο κυλάει μόνο του όταν το drag πλησιάζει τις άκρες.
document.addEventListener('dragover',function(e){
  if(!window._wiDragging) return;
  const sh=document.querySelector('.wk3-sheet'); if(!sh) return;
  const r=sh.getBoundingClientRect();
  if(e.clientY<r.top+70) sh.scrollTop-=16;
  else if(e.clientY>r.bottom-70) sh.scrollTop+=16;
});
window._wk3FlashSugs = _wk3FlashSugs;
window._wk3Edit = _wk3Edit;
window._wiImpCtx = _wiImpCtx;
window._wiRotAdd = _wiRotAdd;
window._wiRotUnlink = _wiRotUnlink;
window._wk3PickDate = _wk3PickDate;
// Αναδιπλούμενα εθνικά πάνελ (owner 10/8) — ανεξάρτητα, με μνήμη ανά χρήστη
function _wk3FeedTog(side){
  const k='tms_wk3_'+side, off=localStorage.getItem(k)!=='0';
  localStorage.setItem(k, off?'0':'1');
  const el=document.querySelector('.wk3');
  if(el) el.classList.toggle(side==='fl'?'fl-off':'fr-off', off);
}
window._wk3FeedTog = _wk3FeedTog;
window._wiImpShift = _wiImpShift;
window._wiImpGroup = _wiImpGroup;

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
