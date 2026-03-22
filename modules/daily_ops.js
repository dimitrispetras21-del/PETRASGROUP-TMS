// ═══════════════════════════════════════════════════════════════
// DAILY OPS PLAN — v2.0
// Dispatcher's daily command center
// 4+4 layout: Export (Load/Deliver) + Import (Load/Deliver) × Today/Tomorrow
// Horizontal row cards with inline checkboxes and progress
// ═══════════════════════════════════════════════════════════════

'use strict';

const OPS = {
  date:     'today',
  intl:     [],
  natl:     [],
  trucks:   [],
  drivers:  [],
  locs:     [],
  overdue:  [],
};

const OPS_FIELDS_INTL = [
  'Direction','Goods','Temperature °C','Total Pallets','Client',
  'Loading DateTime','Delivery DateTime','Status',
  'Loading Location 1','Unloading Location 1',
  'Ops Status','Delivery Performance','Ops Notes','Postponed To',
  'Actual Delivery Date','ETA','CMR Photo Received','Client Notified',
  'Docs Ready','Temp OK','Driver Notified','Advance Paid','Second Card',
  'Truck','Trailer','Driver','Is Partner Trip','Partner',
];

const OPS_FIELDS_NATL = [
  'Direction','Goods','Temperature °C','Pallets','Client',
  'Loading DateTime','Delivery DateTime','Status',
  'Pickup Location 1','Delivery Location 1',
  'Ops Status','Delivery Performance','Ops Notes','Postponed To',
  'Actual Delivery Date','ETA','CMR Photo Received','Client Notified',
  'Docs Ready','Temp OK','Driver Notified','Advance Paid','Second Card',
  'Truck','Trailer','Driver','Is Partner Trip','Partner',
];

/* ── CSS ──────────────────────────────────────────────────────── */
(function(){
  if (document.getElementById('ops-css')) return;
  const s = document.createElement('style'); s.id = 'ops-css';
  s.textContent = `
/* toolbar */
.ops-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:16px; }
.ops-day-btn { padding:7px 18px; font-size:11px; font-weight:700; border-radius:5px;
  border:1px solid var(--border-mid); background:var(--bg); color:var(--text-mid);
  cursor:pointer; letter-spacing:.5px; text-transform:uppercase; font-family:'Syne',sans-serif; }
.ops-day-btn.active { background:var(--navy-mid); color:#fff; border-color:var(--navy-mid); }

/* progress summary */
.ops-progress { display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
.ops-prog-card { background:var(--bg-card); border:1px solid var(--border); border-radius:8px;
  padding:10px 16px; flex:1; min-width:140px; }
.ops-prog-label { font-size:9px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase;
  color:var(--text-dim); margin-bottom:4px; font-family:'Syne',sans-serif; }
.ops-prog-nums { display:flex; align-items:baseline; gap:6px; }
.ops-prog-done { font-family:'Syne',sans-serif; font-size:22px; font-weight:700; color:var(--success); }
.ops-prog-total { font-size:12px; color:var(--text-dim); }
.ops-prog-bar { height:3px; background:var(--border); border-radius:2px; margin-top:6px; overflow:hidden; }
.ops-prog-fill { height:100%; background:var(--success); border-radius:2px; transition:width .3s; }

/* overdue */
.ops-overdue { background:rgba(220,38,38,0.06); border:1px solid rgba(220,38,38,0.18);
  border-radius:8px; padding:10px 14px; margin-bottom:16px; }
.ops-overdue-hdr { display:flex; align-items:center; gap:8px; cursor:pointer; }
.ops-overdue-txt { font-size:11px; font-weight:600; color:#DC2626; flex:1; }
.ops-overdue-tog { font-size:9px; color:#DC2626; opacity:.5; }
.ops-overdue-list { display:none; flex-direction:column; gap:4px; margin-top:8px; max-height:220px; overflow-y:auto; }
.ops-overdue-row { display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:4px;
  background:rgba(220,38,38,0.05); font-size:10px; }
.ops-overdue-info { flex:1; min-width:0; }
.ops-overdue-route { font-weight:700; font-size:10px; }
.ops-overdue-date { font-size:9px; color:var(--text-dim); }
.ops-ov-btn { font-size:8px; font-weight:700; padding:3px 8px; border-radius:4px;
  border:1px solid; background:none; cursor:pointer; letter-spacing:.3px; }
.ops-ov-btn.del { color:#059669; border-color:rgba(5,150,105,0.3); }
.ops-ov-btn.dly { color:#DC2626; border-color:rgba(220,38,38,0.3); }

/* grid */
.ops-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; }
@media(max-width:1200px) { .ops-grid { grid-template-columns:1fr 1fr; } }
@media(max-width:700px)  { .ops-grid { grid-template-columns:1fr; } }

/* section */
.ops-sec { display:flex; flex-direction:column; min-width:0; }
.ops-sec-head {
  display:flex; align-items:center; justify-content:space-between;
  padding:7px 12px; border-radius:8px 8px 0 0;
  font-size:9px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase;
  font-family:'Syne',sans-serif;
}
.ops-sec-head.el { background:#065F46; color:#ECFDF5; }
.ops-sec-head.ed { background:#1E3A8A; color:#EFF6FF; }
.ops-sec-head.il { background:#7C3AED; color:#F5F3FF; }
.ops-sec-head.id { background:#9D174D; color:#FDF2F8; }
.ops-sec-body { border:1px solid var(--border-mid); border-top:none; border-radius:0 0 8px 8px;
  background:var(--bg-card); min-height:50px; }

/* row card — horizontal */
.ops-row { display:flex; align-items:center; gap:8px; padding:8px 10px;
  border-bottom:1px solid var(--border); font-size:11px; }
.ops-row:last-child { border-bottom:none; }
.ops-row:hover { background:var(--bg-hover); }
.ops-row.done { opacity:.45; }

.ops-row-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
.ops-row-route { font-weight:700; font-size:10.5px; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ops-row-meta { font-size:9px; color:var(--text-mid);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ops-row-badges { display:flex; gap:3px; flex-wrap:wrap; margin-top:1px; }

/* badges — match project style */
.ob { font-size:7.5px; font-weight:800; letter-spacing:.8px; padding:2px 6px;
  border-radius:3px; text-transform:uppercase; color:#fff; }
.ob-pal  { background:rgba(59,130,246,0.85); }
.ob-temp { background:rgba(14,165,233,0.85); }
.ob-trk  { background:rgba(11,25,41,0.7); }
.ob-ptr  { background:rgba(5,150,105,0.8); }

/* checks — inline horizontal */
.ops-checks { display:flex; gap:6px; flex-shrink:0; align-items:center; flex-wrap:wrap; }
.ops-chk { display:flex; align-items:center; gap:3px; font-size:9px; color:var(--text-mid);
  cursor:pointer; white-space:nowrap; }
.ops-chk input[type=checkbox] { margin:0; width:13px; height:13px; cursor:pointer; accent-color:#059669; }
.ops-chk.done { color:#059669; text-decoration:line-through; opacity:.7; }
.ops-chk-inp { padding:2px 5px; font-size:9px; border:1px solid var(--border-mid);
  border-radius:3px; background:var(--bg); color:var(--text); width:48px; outline:none;
  font-family:'DM Sans',sans-serif; }
.ops-chk-amt { width:58px; }
.ops-chk-lbl { font-size:8px; color:var(--text-dim); font-weight:600; letter-spacing:.3px; }

/* actions */
.ops-acts { display:flex; gap:3px; flex-shrink:0; }
.ops-ab { font-size:8px; font-weight:700; letter-spacing:.4px; padding:4px 8px;
  border-radius:4px; border:1px solid var(--border-mid); background:none;
  cursor:pointer; white-space:nowrap; font-family:'DM Sans',sans-serif; }
.ops-ab:hover { background:var(--bg-hover); }
.ops-ab.ld  { border-color:rgba(6,182,212,0.3); color:#06B6D4; }
.ops-ab.dv  { border-color:rgba(5,150,105,0.3); color:#059669; }
.ops-ab.dy  { border-color:rgba(220,38,38,0.3); color:#DC2626; }
.ops-ab.pp  { border-color:rgba(217,119,6,0.3); color:#D97706; }
.ops-ab.nt  { border-color:rgba(107,114,128,0.2); color:var(--text-dim); font-size:12px; padding:2px 6px; }

/* notes */
.ops-notes-wrap { display:none; padding:4px 10px 8px; }
.ops-notes-ta { width:100%; font-size:10px; padding:4px 8px; border:1px solid var(--border-mid);
  border-radius:4px; background:var(--bg); color:var(--text); outline:none; resize:none;
  font-family:'DM Sans',sans-serif; }

/* empty */
.ops-empty { padding:18px; text-align:center; color:var(--text-dim); font-size:10px; font-style:italic; }
`;
  document.head.appendChild(s);
})();

/* ── ENTRY ────────────────────────────────────────────────────── */
async function renderDailyOps() {
  document.getElementById('topbarTitle').textContent = 'Daily Ops Plan';
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Φόρτωση λειτουργικού πλάνου…');
  try {
    await _opsLoadAssets();
    await _opsLoadOrders();
    _opsPaint();
  } catch(e) {
    c.innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα: ${e.message}</div>`;
    console.error('renderDailyOps:', e);
  }
}

/* ── ASSETS ───────────────────────────────────────────────────── */
async function _opsLoadAssets() {
  if (OPS.trucks.length && OPS.locs.length) return;
  const [t, d, l] = await Promise.all([
    atGetAll(TABLES.TRUCKS,  {fields:['License Plate'], filterByFormula:'{Active}=TRUE()'}, false),
    atGetAll(TABLES.DRIVERS, {fields:['Full Name'],     filterByFormula:'{Active}=TRUE()'}, false),
    atGetAll(TABLES.LOCATIONS,{fields:['Name','City','Country']}, true),
  ]);
  OPS.trucks  = t.map(r=>({id:r.id, label:r.fields['License Plate']||r.id}));
  OPS.drivers = d.map(r=>({id:r.id, label:r.fields['Full Name']||r.id}));
  OPS.locs    = l;
}

/* ── LOAD ─────────────────────────────────────────────────────── */
async function _opsLoadOrders() {
  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split('T')[0];
  const target   = OPS.date === 'tomorrow' ? tomorrow : today;

  const dayFilter = `OR(IS_SAME({Loading DateTime},'${target}','day'),IS_SAME({Delivery DateTime},'${target}','day'))`;
  const overdueFilter = `AND(IS_BEFORE({Delivery DateTime},TODAY()),OR({Ops Status}='In Transit',{Ops Status}='Loaded',{Ops Status}='Assigned',{Ops Status}='Pending',{Ops Status}=''))`;

  // Daily Ops Plan = International ORDERS only
  const [intl, ovIntl] = await Promise.all([
    atGetAll(TABLES.ORDERS, {filterByFormula:dayFilter, fields:OPS_FIELDS_INTL}, false),
    OPS.date==='today' ? atGetAll(TABLES.ORDERS, {filterByFormula:overdueFilter, fields:OPS_FIELDS_INTL}, false) : [],
  ]);

  OPS.intl = intl;
  OPS.natl = [];
  const todayIds = new Set(intl.map(r=>r.id));
  OPS.overdue = ovIntl.map(r=>({...r,_tbl:'intl'})).filter(r => !todayIds.has(r.id));
}

/* ── HELPERS ──────────────────────────────────────────────────── */
function _oLoc(id) {
  if(!id) return '—';
  const l = OPS.locs.find(r=>r.id===id);
  return l ? (l.fields['Name']||l.fields['City']||'—') : '—';
}
function _oLinked(a) { return a?.length ? (a[0]?.id||a[0]||null) : null; }
function _oTruck(f) { const id=_oLinked(f['Truck']); return id ? OPS.trucks.find(t=>t.id===id)?.label : null; }
function _oDriver(f){ const id=_oLinked(f['Driver']);return id ? OPS.drivers.find(d=>d.id===id)?.label : null; }
function _oLoadLoc(f,n) { return _oLoc(_oLinked(f[n?'Pickup Location 1':'Loading Location 1'])); }
function _oDelivLoc(f,n){ return _oLoc(_oLinked(f[n?'Delivery Location 1':'Unloading Location 1'])); }
function _oPartner(f) { return f['Is Partner Trip']===true || f['Is Partner Trip']==='Yes'; }
function _oDM(dt,d) { return dt ? dt.substring(0,10)===d : false; }

/* ── CATEGORIZE — fixed direction logic ──────────────────────── */
function _opsCats() {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split('T')[0];
  const tgt = OPS.date==='tomorrow' ? tomorrow : today;
  const c = {el:[],ed:[],il:[],id:[]};

  const all = [
    ...OPS.intl.map(r=>({...r,_n:false})),
    ...OPS.natl.map(r=>({...r,_n:true})),
  ];

  for (const r of all) {
    const dir = (r.fields['Direction']||'').trim();
    // Determine export vs import
    // International: "Export" or "Import"
    // National: "South→North" (=export/ascending) or "North→South" (=import/descending)
    let isExp = false, isImp = false;
    const dl = dir.toLowerCase();
    if (dl === 'export' || dl === '↑ export' || dl.startsWith('south→') || dl.startsWith('south->') || dl === 's→n' || dl === '↑ s→n') {
      isExp = true;
    } else if (dl === 'import' || dl === '↓ import' || dl.startsWith('north→') || dl.startsWith('north->') || dl === 'n→s' || dl === '↓ n→s') {
      isImp = true;
    } else {
      isExp = true; // default to export
    }

    const isL = _oDM(r.fields['Loading DateTime'], tgt);
    const isD = _oDM(r.fields['Delivery DateTime'], tgt);

    if (isExp) { if(isL) c.el.push(r); if(isD) c.ed.push(r); }
    if (isImp) { if(isL) c.il.push(r); if(isD) c.id.push(r); }
  }
  return c;
}

/* ── PAINT ────────────────────────────────────────────────────── */
function _opsPaint() {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split('T')[0];
  const isToday = OPS.date==='today';
  const tgt = isToday ? today : tomorrow;

  const fmtD = d => {
    try {
      const dt=new Date(d);
      const days=['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
      const mon=['Ιανουαρίου','Φεβρουαρίου','Μαρτίου','Απριλίου','Μαΐου','Ιουνίου',
        'Ιουλίου','Αυγούστου','Σεπτεμβρίου','Οκτωβρίου','Νοεμβρίου','Δεκεμβρίου'];
      return `${days[dt.getDay()]} ${dt.getDate()} ${mon[dt.getMonth()]}`;
    } catch { return d; }
  };

  const cats = _opsCats();
  const total = cats.el.length + cats.ed.length + cats.il.length + cats.id.length;

  // Progress summary — count checked items
  const allCards = [...cats.el,...cats.ed,...cats.il,...cats.id];
  const checkFields = ['Docs Ready','Temp OK','CMR Photo Received','Client Notified','Driver Notified'];
  let totalChecks = 0, doneChecks = 0;
  allCards.forEach(r => {
    checkFields.forEach(fld => {
      if (r.fields[fld] !== undefined) { totalChecks++; if(r.fields[fld]) doneChecks++; }
    });
  });

  // Count status categories
  const statusLoaded = allCards.filter(r=>(r.fields['Ops Status']||'')==='Loaded').length;
  const statusDelivered = allCards.filter(r=>['Delivered','Client Notified'].includes(r.fields['Ops Status']||'')).length;
  const statusPending = allCards.filter(r=>!['Loaded','Delivered','Client Notified','In Transit'].includes(r.fields['Ops Status']||'')).length;

  // Overdue
  let ovHTML = '';
  if (isToday && OPS.overdue.length) {
    ovHTML = `<div class="ops-overdue">
      <div class="ops-overdue-hdr" onclick="document.getElementById('ovList').style.display=document.getElementById('ovList').style.display==='flex'?'none':'flex';this.querySelector('.ops-overdue-tog').textContent=document.getElementById('ovList').style.display==='flex'?'▲ Κλείσιμο':'▼ Εμφάνιση'">
        <div class="ops-overdue-txt">⚠ ${OPS.overdue.length} orders με εκκρεμή παράδοση</div>
        <div class="ops-overdue-tog">▼ Εμφάνιση</div>
      </div>
      <div class="ops-overdue-list" id="ovList">${OPS.overdue.map(r => {
        const f=r.fields, tbl=r._tbl==='intl'?TABLES.ORDERS:TABLES.NAT_ORDERS, n=r._tbl!=='intl';
        return `<div class="ops-overdue-row">
          <div class="ops-overdue-info">
            <span class="ops-overdue-route">${_oLoadLoc(f,n)} → ${_oDelivLoc(f,n)}</span>
            <span class="ops-overdue-date">${(f['Goods']||'').substring(0,25)} · ${(f['Delivery DateTime']||'').substring(0,10)}</span>
          </div>
          <button class="ops-ov-btn del" onclick="event.stopPropagation();_opsOvAct('${r.id}','${tbl}')">✓ Delivered</button>
          <button class="ops-ov-btn dly" onclick="event.stopPropagation();_opsOvAct('${r.id}','${tbl}','Delayed')">✗ Delayed</button>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  const sec = (cls, label, items, type) => `
    <div class="ops-sec">
      <div class="ops-sec-head ${cls}"><span>${label}</span><span style="opacity:.5">${items.length}</span></div>
      <div class="ops-sec-body">
        ${items.length ? items.map(r=>_opsRow(r,type,isToday)).join('') : '<div class="ops-empty">Κενό</div>'}
      </div>
    </div>`;

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:12px">
      <div>
        <div class="page-title">Daily Ops Plan</div>
        <div class="page-sub">${fmtD(tgt)} · ${total} orders</div>
      </div>
      <button class="btn btn-ghost" onclick="renderDailyOps()">Refresh</button>
    </div>
    <div class="ops-toolbar">
      <button class="ops-day-btn ${isToday?'active':''}" onclick="_opsDay('today')">Σήμερα</button>
      <button class="ops-day-btn ${!isToday?'active':''}" onclick="_opsDay('tomorrow')">Αύριο</button>
    </div>

    <div class="ops-progress">
      <div class="ops-prog-card">
        <div class="ops-prog-label">Εκκρεμή</div>
        <div class="ops-prog-nums"><span class="ops-prog-done" style="color:var(--text)">${statusPending}</span></div>
      </div>
      <div class="ops-prog-card">
        <div class="ops-prog-label">Loaded</div>
        <div class="ops-prog-nums"><span class="ops-prog-done" style="color:#06B6D4">${statusLoaded}</span></div>
      </div>
      <div class="ops-prog-card">
        <div class="ops-prog-label">Delivered</div>
        <div class="ops-prog-nums"><span class="ops-prog-done">${statusDelivered}</span><span class="ops-prog-total">/ ${total}</span></div>
        <div class="ops-prog-bar"><div class="ops-prog-fill" style="width:${total?Math.round(statusDelivered/total*100):0}%"></div></div>
      </div>
      <div class="ops-prog-card">
        <div class="ops-prog-label">Checklist</div>
        <div class="ops-prog-nums"><span class="ops-prog-done">${doneChecks}</span><span class="ops-prog-total">/ ${totalChecks}</span></div>
        <div class="ops-prog-bar"><div class="ops-prog-fill" style="width:${totalChecks?Math.round(doneChecks/totalChecks*100):0}%"></div></div>
      </div>
    </div>

    ${ovHTML}

    <div class="ops-grid">
      ${sec('el','↑ EXP Φορτώσεις',cats.el,'el')}
      ${sec('ed','↓ EXP Παραδόσεις',cats.ed,'ed')}
      ${sec('il','↑ IMP Φορτώσεις',cats.il,'il')}
      ${sec('id','↓ IMP Παραδόσεις',cats.id,'id')}
    </div>
  `;
}

/* ── ROW CARD ─────────────────────────────────────────────────── */
function _opsRow(rec, type, isToday) {
  const f = rec.fields, n = rec._n||rec._isNatl||false;
  const tbl = n ? TABLES.NAT_ORDERS : TABLES.ORDERS;
  const loadL = _oLoadLoc(f,n), delivL = _oDelivLoc(f,n);
  const truck = _oTruck(f), driver = _oDriver(f), partner = _oPartner(f);
  const pal = f['Total Pallets']||f['Pallets']||'';
  const temp = f['Temperature °C']!=null ? f['Temperature °C']+'°C' : '';
  const goods = (f['Goods']||'').substring(0,40);
  const clientRaw = f['Client'];
  const client = Array.isArray(clientRaw) ? (clientRaw[0]||'') : (clientRaw||'');
  const ops = f['Ops Status']||'';
  const isDone = ops==='Delivered'||ops==='Client Notified';
  const isLoad = type==='el'||type==='il';
  const isDeliv = type==='ed'||type==='id';
  const isExp = type==='el'||type==='ed';
  const notes = f['Ops Notes']||'';

  // Badges
  let bg = '';
  if(pal) bg += `<span class="ob ob-pal">${pal} pal</span>`;
  if(temp) bg += `<span class="ob ob-temp">${temp}</span>`;
  if(truck) bg += `<span class="ob ob-trk">${truck}</span>`;
  if(partner) bg += `<span class="ob ob-ptr">Partner</span>`;

  // Checklist — horizontal inline
  let chk = '';
  if (isToday && isLoad && isExp) {
    chk = `${_oChk(rec.id,tbl,'Docs Ready','Docs',f['Docs Ready'])}
      ${_oChk(rec.id,tbl,'Temp OK','Temp',f['Temp OK'])}
      ${!partner?_oAmt(rec.id,tbl,'Advance Paid','€',f['Advance Paid']):''}
      ${!partner?_oChk(rec.id,tbl,'Second Card','2η Κ.',f['Second Card']):''}`;
  } else if (isToday && isDeliv && isExp) {
    chk = `${_oTime(rec.id,tbl,'ETA',f['ETA'])}
      ${_oChk(rec.id,tbl,'CMR Photo Received','CMR',f['CMR Photo Received'])}
      ${_oChk(rec.id,tbl,'Client Notified','Πελ.',f['Client Notified'])}`;
  } else if (isToday && isLoad && !isExp) {
    chk = `${_oChk(rec.id,tbl,'CMR Photo Received','CMR',f['CMR Photo Received'])}
      ${_oChk(rec.id,tbl,'Temp OK','Temp',f['Temp OK'])}
      ${_oTime(rec.id,tbl,'ETA',f['ETA'])}`;
  } else if (isToday && isDeliv && !isExp) {
    chk = `${_oTime(rec.id,tbl,'ETA',f['ETA'])}
      ${_oChk(rec.id,tbl,'CMR Photo Received','CMR',f['CMR Photo Received'])}
      ${_oChk(rec.id,tbl,'Client Notified','Πελ.',f['Client Notified'])}`;
  } else if (!isToday && isLoad && isExp) {
    chk = `${_oChk(rec.id,tbl,'Driver Notified','Οδηγός',f['Driver Notified'])}`;
  } else if (!isToday && isDeliv) {
    chk = `${_oTime(rec.id,tbl,'ETA',f['ETA'])}`;
  } else if (!isToday && isLoad && !isExp) {
    chk = `${_oChk(rec.id,tbl,'Driver Notified','Οδηγός',f['Driver Notified'])}
      ${_oTime(rec.id,tbl,'ETA',f['ETA'])}`;
  }

  // Action buttons
  let acts = '';
  if (isToday && isLoad) {
    acts = `<button class="ops-ab ld" onclick="_opsStat('${rec.id}','${tbl}','Loaded')">Loaded</button>
      <button class="ops-ab pp" onclick="_opsPost('${rec.id}','${tbl}')">Postpone</button>`;
  } else if (isToday && isDeliv) {
    acts = `<button class="ops-ab dv" onclick="_opsDel('${rec.id}','${tbl}','On Time')">✓</button>
      <button class="ops-ab dy" onclick="_opsDel('${rec.id}','${tbl}','Delayed')">✗</button>
      <button class="ops-ab pp" onclick="_opsPost('${rec.id}','${tbl}')">⏩</button>`;
  }
  acts += `<button class="ops-ab nt" onclick="_opsNt('${rec.id}')">📝</button>`;

  return `<div class="ops-row${isDone?' done':''}" id="ops_${rec.id}">
    <div class="ops-row-info">
      <div class="ops-row-route">${loadL} → ${delivL}</div>
      <div class="ops-row-meta">${goods}</div>
      <div class="ops-row-badges">${bg}</div>
    </div>
    <div class="ops-checks">${chk}</div>
    <div class="ops-acts">${acts}</div>
  </div>
  <div class="ops-notes-wrap" id="opsnotes_${rec.id}" ${notes?'style="display:block"':''}>
    <textarea class="ops-notes-ta" rows="1" placeholder="Σημειώσεις…"
      onblur="_opsSvN('${rec.id}','${tbl}',this.value)">${notes}</textarea>
  </div>`;
}

/* ── CHECK COMPONENTS ─────────────────────────────────────────── */
function _oChk(id,tbl,field,label,val) {
  return `<label class="ops-chk${val?' done':''}">
    <input type="checkbox" ${val?'checked':''} onchange="_opsTog('${id}','${tbl}','${field}',this.checked)">
    <span>${label}</span>
  </label>`;
}

function _oTime(id,tbl,field,val) {
  return `<span class="ops-chk"><span class="ops-chk-lbl">${field}</span>
    <input class="ops-chk-inp" type="text" placeholder="--:--" value="${val||''}"
      onblur="_opsSvF('${id}','${tbl}','${field}',this.value)">
  </span>`;
}

function _oAmt(id,tbl,field,label,val) {
  return `<span class="ops-chk"><span class="ops-chk-lbl">${label}</span>
    <input class="ops-chk-inp ops-chk-amt" type="number" step="0.01" placeholder="0" value="${val||''}"
      onblur="_opsSvF('${id}','${tbl}','${field}',parseFloat(this.value)||null)">
  </span>`;
}

/* ── ACTIONS ──────────────────────────────────────────────────── */
function _opsDay(d) { OPS.date=d; renderDailyOps(); }

async function _opsTog(id,tbl,fld,v) {
  try { await atPatch(tbl,id,{[fld]:v}); const r=_oFind(id); if(r) r.fields[fld]=v; toast(v?'✓':'—'); }
  catch(e) { toast('Σφάλμα','danger'); }
}
async function _opsSvF(id,tbl,fld,v) {
  try { await atPatch(tbl,id,{[fld]:v||null}); const r=_oFind(id); if(r) r.fields[fld]=v; }
  catch(e) { toast('Σφάλμα','danger'); }
}
async function _opsStat(id,tbl,st) {
  try { await atPatch(tbl,id,{'Ops Status':st}); const r=_oFind(id); if(r) r.fields['Ops Status']=st;
    toast(st+' ✓'); _opsPaint(); } catch(e) { toast('Σφάλμα','danger'); }
}
async function _opsDel(id,tbl,perf) {
  const d=new Date().toISOString().split('T')[0];
  try { await atPatch(tbl,id,{'Ops Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d});
    const r=_oFind(id); if(r){r.fields['Ops Status']='Delivered';r.fields['Delivery Performance']=perf;}
    toast(perf==='On Time'?'✓ Delivered':'✗ Delayed',perf==='Delayed'?'danger':'success'); _opsPaint();
  } catch(e) { toast('Σφάλμα','danger'); }
}
async function _opsPost(id,tbl) {
  const nd=prompt('Νέα ημερομηνία (YYYY-MM-DD):');
  if(!nd||!/\d{4}-\d{2}-\d{2}/.test(nd)) return;
  try { await atPatch(tbl,id,{'Ops Status':'Postponed','Postponed To':nd});
    const r=_oFind(id); if(r){r.fields['Ops Status']='Postponed';r.fields['Postponed To']=nd;}
    toast('⏩ '+nd); _opsPaint(); } catch(e) { toast('Σφάλμα','danger'); }
}
async function _opsOvAct(id,tbl,perf='Delayed') {
  const d=new Date().toISOString().split('T')[0];
  try { await atPatch(tbl,id,{'Ops Status':'Delivered','Delivery Performance':perf,'Actual Delivery Date':d});
    OPS.overdue=OPS.overdue.filter(r=>r.id!==id); toast('✓'); _opsPaint();
  } catch(e) { toast('Σφάλμα','danger'); }
}
function _opsNt(id) {
  const el=document.getElementById('opsnotes_'+id);
  if(el) el.style.display=el.style.display==='block'?'none':'block';
}
async function _opsSvN(id,tbl,v) {
  try { await atPatch(tbl,id,{'Ops Notes':v||null}); const r=_oFind(id); if(r) r.fields['Ops Notes']=v; }
  catch(e) { toast('Σφάλμα','danger'); }
}
function _oFind(id) {
  return OPS.intl.find(r=>r.id===id)||OPS.natl.find(r=>r.id===id)||OPS.overdue.find(r=>r.id===id);
}
