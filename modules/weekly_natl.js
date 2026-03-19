// ═══════════════════════════════════════════════════════════════════════
// WEEKLY NATIONAL — v1.0
// ─────────────────────────────────────────────────────────────────────
// NATIONAL ORDERS-only.
// Direction: 'North→South' | 'South→North'
// Type: 'Veroia Switch' | 'Independent'
//
// Fields read: Direction, Type, Client, Pickup Location, Delivery Location,
//   Loading DateTime, Delivery DateTime, Pallets, National Groupage,
//   Truck[], Trailer[], Driver[], Partner[], Is Partner Trip,
//   Partner Truck Plates, Groupage ID, Matched Order ID
//
// Fields written: Truck, Trailer, Driver, Partner, Is Partner Trip,
//   Partner Truck Plates, Partner Rate, Groupage ID, Matched Order ID
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const WNATL = {
  week: (()=>{ const d=new Date(); const jan4=new Date(d.getFullYear(),0,4); const mon=new Date(jan4); mon.setDate(jan4.getDate()-jan4.getDay()+1); return Math.ceil((d-mon)/(7*864e5))+1; })(),
  data: { northsouth:[], southnorth:[], trucks:[], trailers:[], drivers:[], partners:[], clients:[], locations:[] },
  rows: [],
  ui:   { openRow: null },
  _seq: 0,
};

/* ── CSS ──────────────────────────────────────────────────────────── */
(function(){
  if(document.getElementById('wnatl-css')) return;
  const s=document.createElement('style'); s.id='wnatl-css';
  s.textContent=`
/* Reuses wi-* classes from weekly_intl. Natl-specific overrides: */
.wn-wrap { border:1px solid var(--border-mid); border-radius:10px; overflow:hidden; background:var(--bg-card); }
.wn-head {
  display:grid; grid-template-columns:36px 1fr 270px 1fr;
  background:var(--bg); border-bottom:2px solid var(--border-mid);
  position:sticky; top:0; z-index:20;
}
.wn-hc { padding:8px 13px; font-size:9.5px; font-weight:700; letter-spacing:1.3px;
  text-transform:uppercase; color:var(--text-dim); border-right:1px solid var(--border); }
.wn-hc:last-child { border-right:none; }
`;
  document.head.appendChild(s);
})();

/* ── ENTRY POINT ──────────────────────────────────────────────────── */
async function renderWeeklyNatl() {
  document.getElementById('topbarTitle').textContent = `Weekly National — Week ${WNATL.week}`;
  const content = document.getElementById('content');
  content.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:60px;color:var(--text-dim)">
    <div class="spinner"></div> Loading week ${WNATL.week}…</div>`;

  try {
    await _wnLoadAssets();
    await _wnLoadOrders();
    _wnBuildRows();
    _wnPaint();
  } catch(e) {
    content.innerHTML = `<div style="color:var(--danger);padding:40px">Error: ${e.message}</div>`;
    console.error('renderWeeklyNatl:', e);
  }
}

/* ── LOAD ASSETS ─────────────────────────────────────────────────── */
async function _wnLoadAssets() {
  const [t, tl, d, p, c] = await Promise.all([
    atGetAll(TABLES.TRUCKS,   {fields:['License Plate'], filterByFormula:'{Active}=TRUE()'}, false),
    atGetAll(TABLES.TRAILERS, {fields:['License Plate']}, false),
    atGetAll(TABLES.DRIVERS,  {fields:['Full Name'],     filterByFormula:'{Active}=TRUE()'}, false),
    atGetAll(TABLES.PARTNERS, {fields:['Company Name']}, false),
    atGetAll(TABLES.CLIENTS,  {fields:['Company Name']}, false),
  ]);
  WNATL.data.trucks    = t.map(r=>({id:r.id, label:r.fields['License Plate']||r.id}));
  WNATL.data.trailers  = tl.map(r=>({id:r.id, label:r.fields['License Plate']||r.id}));
  WNATL.data.drivers   = d.map(r=>({id:r.id, label:r.fields['Full Name']||r.id}));
  WNATL.data.partners  = p.map(r=>({id:r.id, label:r.fields['Company Name']||r.id}));
  WNATL.data.clients   = c.map(r=>({id:r.id, label:r.fields['Company Name']||r.id}));
}

/* ── LOAD ORDERS ─────────────────────────────────────────────────── */
async function _wnLoadOrders() {
  // Week filter by delivery date range
  const year  = new Date().getFullYear();
  const jan4  = new Date(year, 0, 4);
  const mon   = new Date(jan4); mon.setDate(jan4.getDate() - jan4.getDay() + 1);
  const wStart= new Date(mon); wStart.setDate(mon.getDate() + (WNATL.week-1)*7);
  const wEnd  = new Date(wStart); wEnd.setDate(wStart.getDate()+6);
  const fmt   = d => d.toISOString().split('T')[0];

  const filter = `AND(IS_AFTER({Delivery DateTime},'${fmt(new Date(wStart.getTime()-86400000))}'),IS_BEFORE({Delivery DateTime},'${fmt(new Date(wEnd.getTime()+86400000))}'))`;

  const allOrders = await atGetAll(TABLES.NAT_ORDERS, {
    filterByFormula: filter,
    fields: ['Direction','Type','Client','Pickup Location','Delivery Location',
             'Loading DateTime','Delivery DateTime','Pallets','National Groupage',
             'Pallet Exchange','Temperature °C','Notes','Status','Goods',
             'Truck','Trailer','Driver','Partner','Is Partner Trip',
             'Partner Truck Plates','Partner Rate','Groupage ID','Matched Order ID'],
  }, false);

  WNATL.data.northsouth = allOrders
    .filter(r => r.fields['Direction'] === 'North→South')
    .sort((a,b) => (a.fields['Delivery DateTime']||'').localeCompare(b.fields['Delivery DateTime']||''));
  WNATL.data.southnorth = allOrders
    .filter(r => r.fields['Direction'] === 'South→North')
    .sort((a,b) => (a.fields['Loading DateTime']||'').localeCompare(b.fields['Loading DateTime']||''));
}

/* ── BUILD ROWS ──────────────────────────────────────────────────── */
function _wnBuildRows() {
  WNATL.rows = []; WNATL._seq = 0;
  const {northsouth, southnorth} = WNATL.data;

  // Groupage: group N→S orders by Groupage ID
  const grpMap = {}; // groupageId → row index
  for(const ord of northsouth) {
    const f = ord.fields;
    const truckId   = (f['Truck']  ||[])[0]||'';
    const trailerId = (f['Trailer']||[])[0]||'';
    const driverId  = (f['Driver'] ||[])[0]||'';
    const partnerId = (f['Partner']||[])[0]||'';
    const gid       = f['Groupage ID']||null;
    const matchedId = f['Matched Order ID']||null;

    if(gid && grpMap[gid] !== undefined) {
      WNATL.rows[grpMap[gid]].orderIds.push(ord.id);
      continue;
    }

    const idx = WNATL.rows.length;
    if(gid) grpMap[gid] = idx;

    WNATL.rows.push({
      id:           ++WNATL._seq,
      type:         'northsouth',
      orderId:      ord.id,
      orderIds:     [ord.id],
      matchedId,          // matched S→N order ID
      groupageId:   gid,
      truckId, trailerId, driverId, partnerId,
      truckLabel:   WNATL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel: WNATL.data.trailers.find(t=>t.id===trailerId)?.label||'',
      driverLabel:  WNATL.data.drivers.find(d=>d.id===driverId)?.label||'',
      partnerLabel: WNATL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates:f['Partner Truck Plates']||'',
      partnerRate:  f['Partner Rate']?String(f['Partner Rate']):'',
      saved:        !!(truckId||partnerId),
    });
  }

  // S→N orders that are NOT matched — show as standalone rows
  const matchedSN = new Set(WNATL.rows.map(r=>r.matchedId).filter(Boolean));
  for(const ord of southnorth) {
    if(matchedSN.has(ord.id)) continue; // already shown inline
    const f = ord.fields;
    const truckId   = (f['Truck']  ||[])[0]||'';
    const partnerId = (f['Partner']||[])[0]||'';
    WNATL.rows.push({
      id:           ++WNATL._seq,
      type:         'southnorth',
      orderId:      ord.id,
      orderIds:     [ord.id],
      matchedId:    null,
      groupageId:   f['Groupage ID']||null,
      truckId, trailerId:'', driverId:'', partnerId,
      truckLabel:   WNATL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel:'', driverLabel:'',
      partnerLabel: WNATL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates:f['Partner Truck Plates']||'',
      partnerRate:  f['Partner Rate']?String(f['Partner Rate']):'',
      saved:        !!(truckId||partnerId),
    });
  }
}

/* ── PAINT ───────────────────────────────────────────────────────── */
function _wnPaint() {
  const {rows, week, data} = WNATL;
  const nsRows = rows.filter(r=>r.type==='northsouth');
  const snRows = rows.filter(r=>r.type==='southnorth');
  const assigned = nsRows.filter(r=>r.saved).length;
  const pending  = nsRows.filter(r=>!r.saved).length;
  const matched  = nsRows.filter(r=>r.matchedId).length;

  // Week range
  const year = new Date().getFullYear();
  const jan4 = new Date(year,0,4);
  const mon  = new Date(jan4); mon.setDate(jan4.getDate()-jan4.getDay()+1);
  const wS   = new Date(mon); wS.setDate(mon.getDate()+(week-1)*7);
  const wE   = new Date(wS);  wE.setDate(wS.getDate()+6);
  const fmtD = d=>d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  const weekRange = `${fmtD(wS)} – ${fmtD(wE)}`;

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:12px">
      <div>
        <div class="page-title">Weekly National</div>
        <div class="page-sub">
          Week ${week} · ${weekRange}
          <span style="margin-left:12px;color:var(--success)">${nsRows.length} κάθοδος</span>
          <span style="margin-left:8px;color:rgba(14,165,233,0.9)">${snRows.length} άνοδος ελεύθερα</span>
          <span style="margin-left:8px;color:var(--text-dim)">${assigned} assigned · ${pending} pending</span>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="_wnNavWeek(-1)">← Prev</button>
        <div style="padding:6px 14px;font-family:'Syne',sans-serif;font-weight:700;font-size:14px">W ${week}</div>
        <button class="btn btn-ghost" onclick="_wnNavWeek(1)">Next →</button>
        <button class="btn btn-ghost" onclick="renderWeeklyNatl()">Refresh</button>
      </div>
    </div>
    <div class="wn-wrap">
      <div class="wn-head">
        <div class="wn-hc">#</div>
        <div class="wn-hc">ΚΑΘΟΔΟΣ (${nsRows.length})</div>
        <div class="wn-hc">ΑΝΑΘΕΣΗ</div>
        <div class="wn-hc" style="color:rgba(14,165,233,0.9)">ΑΝΟΔΟΣ (${data.southnorth.length})</div>
      </div>
      <div id="wn-rows">
        ${rows.length ? _wnAllRowsHTML() : `<div class="empty-state" style="padding:60px">
          <p>No national orders for week ${week}</p></div>`}
      </div>
    </div>
    <div id="wn-ctx"></div>
    <div id="wn-popover"></div>
    <div id="wn-grp-tip" style="display:none;position:fixed;z-index:9999;background:var(--bg-card);
      border:1px solid var(--border-mid);border-radius:7px;box-shadow:0 6px 24px rgba(0,0,0,0.14);
      padding:6px 0;min-width:260px;pointer-events:none"></div>`;

  window._wnDragging = null;
}

/* ── ALL ROWS ────────────────────────────────────────────────────── */
function _wnAllRowsHTML() {
  const nsRows = WNATL.rows.filter(r=>r.type==='northsouth');
  const snRows = WNATL.rows.filter(r=>r.type==='southnorth');
  let html = '', idx = 0, lastDate = null;

  // Group N→S by delivery date
  const dc = {};
  nsRows.forEach(row => {
    const lbl = _wnDelDate(row); if(lbl) dc[lbl] = (dc[lbl]||0)+1;
  });

  nsRows.forEach(row => {
    const lbl = _wnDelDate(row);
    if(lbl && lbl !== lastDate) {
      lastDate = lbl;
      html += `<div class="wi-dsep">
        <span class="wi-dsep-lbl">Παράδοση</span>
        <span class="wi-dsep-date">${lbl}</span>
        <span class="wi-dsep-n">${dc[lbl]} order${dc[lbl]!==1?'s':''}</span>
      </div>`;
    }
    html += _wnRowHTML(row, idx++);
  });

  // Unmatched S→N orders below
  if(snRows.length) {
    html += `<div class="wi-dsep" style="border-top:2px solid rgba(14,165,233,0.3)">
      <span class="wi-dsep-lbl" style="color:rgba(14,165,233,0.55)">Φόρτωση</span>
      <span class="wi-dsep-date" style="color:rgba(14,165,233,0.85)">Άνοδος · ${snRows.length} ελεύθερα</span>
      <span style="font-size:9px;color:rgba(196,207,219,0.3);margin-left:auto;font-style:italic">drag to match</span>
    </div>`;
    snRows.forEach(row => { html += _wnSnRowHTML(row); });
  }

  return html;
}

/* ── N→S ROW HTML ────────────────────────────────────────────────── */
function _wnRowHTML(row, i) {
  const {data, ui} = WNATL;
  const ords  = row.orderIds.map(id=>data.northsouth.find(r=>r.id===id)).filter(Boolean);
  const sn    = row.matchedId ? data.southnorth.find(r=>r.id===row.matchedId) : null;
  const primary = ords[0];
  const f     = primary?.fields||{};
  const isGroup = ords.length > 1;

  // Sorted for groupage range
  const sorted = isGroup ? [...ords].sort((a,b)=>(a.fields['Delivery DateTime']||'').localeCompare(b.fields['Delivery DateTime']||'')) : ords;
  const pals   = ords.reduce((s,r)=>s+(r.fields['Pallets']||0),0);
  const loadDt = _wnFmt(f['Loading DateTime']);
  const delDtE = _wnFmt(sorted[0]?.fields['Delivery DateTime']);
  const delDtL = _wnFmt(sorted[sorted.length-1]?.fields['Delivery DateTime']);
  const delDt  = isGroup && delDtE !== delDtL ? `${delDtE}–${delDtL}` : delDtE;

  // Client name from first order
  const clientId = (f['Client']||[])[0]||'';
  const clientLabel = data.clients.find(c=>c.id===clientId)?.label||'—';

  // Pickup / Delivery
  const pickupId  = (f['Pickup Location'] ||[])[0]||'';
  const delivId   = (f['Delivery Location']||[])[0]||'';
  const fromStr   = _wnLocLabel(pickupId)  || (f['Type']==='Veroia Switch'?'Veroia':'—');
  const toStr     = _wnLocLabel(delivId)   || clientLabel;

  // Status
  const isPartner = !!(row.partnerLabel || data.partners.find(p=>p.id===row.partnerId)?.label);
  let sCls = 's-ok', dotColor = 'var(--success)';
  if(isPartner)  { sCls='s-partner'; dotColor='rgba(59,130,246,0.75)'; }
  if(!row.saved) { sCls='s-pending'; dotColor='rgba(217,119,6,0.5)'; }

  // Pill
  const truck   = row.truckLabel   || data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const trailer = row.trailerLabel || data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  const driver  = row.driverLabel  || data.drivers.find(d=>d.id===row.driverId)?.label||'';
  const partner = row.partnerLabel || data.partners.find(p=>p.id===row.partnerId)?.label||'';
  const surname = driver ? driver.trim().split(/\s+/)[0] : '';
  let pill;
  if(row.saved) {
    if(partner) {
      pill = `<div class="wi-pill wi-pill-bp">
        <span class="pt">${partner.slice(0,22)}${partner.length>22?'…':''}</span>
        ${row.partnerPlates?`<span class="ps">${row.partnerPlates}</span>`:''}
      </div>`;
    } else {
      pill = `<div class="wi-pill wi-pill-ok">
        <span class="pt">${[truck,trailer,surname].filter(Boolean).join(' · ')||'—'}</span>
      </div>`;
    }
  } else {
    pill = `<div class="wi-pill wi-pill-un"><span class="pt">Unassigned</span></div>`;
  }

  // S→N (matched) preview
  const snPrev = sn
    ? `<span style="font-size:9.5px;font-weight:700;color:rgba(14,165,233,0.8);
                    display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden">
        <span style="font-size:11px;flex-shrink:0">↩</span>
        <span style="overflow:hidden;text-overflow:ellipsis">${_wnSnLabel(sn)}</span>
        <span style="color:rgba(14,165,233,0.5);font-weight:400;flex-shrink:0">${_wnFmt(sn.fields['Loading DateTime'])}</span>
      </span>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;
        background:#172C45;margin:-4px -12px;padding:4px 12px;min-height:36px;">
        <span style="font-size:10px;color:rgba(196,207,219,0.25);font-style:italic">drag άνοδος εδώ</span>
      </div>`;

  // Badges
  const badges = _wnBadges(f);

  return `
  <div id="wn-row-${row.id}" class="wi-row ${sCls}">
    <div class="wi-compact" onclick="_wnToggle(${row.id})">
      <div class="wi-cn">
        <div class="wi-dot" style="background:${dotColor}"></div>
        <span class="wi-num">${i+1}</span>
      </div>
      <div class="wi-ce" oncontextmenu="_wnCtx(event,${row.id})">
        <div class="wi-route">
          <span class="from">${fromStr}</span>
          <span class="sep">→</span>
          <span class="dest">${toStr}</span>
          ${isGroup?`<span class="wi-gr" style="cursor:default"
            onmouseenter="_wnShowGrpTip(event,${row.id})"
            onmouseleave="_wnHideGrpTip()">×${ords.length}</span>`:''}
          ${badges}
        </div>
        <div class="wi-sub">
          <span>${loadDt} → ${delDt}</span>
          <span class="wi-sub-div"></span>
          <span>${pals} pal</span>
          ${f['Type']==='Veroia Switch'?'<span class="wi-badge wi-b-veroia">Veroia</span>':''}
        </div>
      </div>
      <div class="wi-ca-wrap">
        <button class="wi-side-btn" title="Print N→S"
                onclick="event.stopPropagation();_wnPrint(${row.id},'northsouth')">🖨</button>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;
                    padding:4px 6px;cursor:pointer;min-width:0"
             onclick="event.stopPropagation();_wnOpenPopover(event,${row.id})">
          ${pill}
        </div>
        ${row.matchedId
          ? `<button class="wi-side-btn" title="Print S→N"
                onclick="event.stopPropagation();_wnPrint(${row.id},'southnorth')">🖨</button>`
          : `<div style="width:26px;flex-shrink:0"></div>`}
      </div>
      <div class="wi-ci" id="wn-ci-${row.id}"
           onclick="event.stopPropagation()"
           ondragover="event.preventDefault();document.getElementById('wn-ci-${row.id}').classList.add('dh')"
           ondragleave="document.getElementById('wn-ci-${row.id}').classList.remove('dh')"
           ondrop="event.stopPropagation();_wnDropOnRow(event,${row.id})">
        ${snPrev}
      </div>
    </div>
  </div>`;
}

/* ── S→N FREE ROW ────────────────────────────────────────────────── */
function _wnSnRowHTML(row) {
  const {data} = WNATL;
  const ord = data.southnorth.find(r=>r.id===row.orderId);
  if(!ord) return '';
  const f = ord.fields;
  const clientId = (f['Client']||[])[0]||'';
  const clientLabel = data.clients.find(c=>c.id===clientId)?.label||'—';
  const pickupId = (f['Pickup Location']||[])[0]||'';
  const fromStr  = _wnLocLabel(pickupId) || '—';
  const toStr    = clientLabel;
  const pals     = f['Pallets']||0;
  const loadDt   = _wnFmt(f['Loading DateTime']);
  const delDt    = _wnFmt(f['Delivery DateTime']);
  const badges   = _wnBadges(f);

  // Assignment pill for S→N
  const truckId  = (f['Truck']  ||[])[0]||'';
  const partnerId= (f['Partner']||[])[0]||'';
  const truck    = row.truckLabel  ||data.trucks.find(t=>t.id===truckId)?.label||'';
  const partner  = row.partnerLabel||data.partners.find(p=>p.id===partnerId)?.label||'';
  const surname  = row.driverLabel?row.driverLabel.trim().split(/\s+/)[0]:'';
  let pill;
  if(row.saved){
    pill = partner
      ? `<div class="wi-pill wi-pill-bp"><span class="pt">${partner.slice(0,22)}</span>${row.partnerPlates?`<span class="ps">${row.partnerPlates}</span>`:''}</div>`
      : `<div class="wi-pill wi-pill-ok"><span class="pt">${[truck,surname].filter(Boolean).join(' · ')||'—'}</span></div>`;
  } else {
    pill = `<div class="wi-pill wi-pill-un"><span class="pt">Unassigned</span></div>`;
  }

  return `<div id="wn-sn-${ord.id}"
    class="wi-row"
    style="background:var(--bg-card);border-top:1px solid rgba(14,165,233,0.1)"
    draggable="true"
    ondragstart="_wnDragStart(event,'${ord.id}')">
    <div class="wi-compact">
      <div class="wi-cn">
        <div class="wi-dot" style="background:rgba(14,165,233,0.5)"></div>
        <span style="font-size:7px;color:rgba(14,165,233,0.55);font-weight:800;letter-spacing:.5px">ΑΝΟ</span>
      </div>
      <div class="wi-ce" style="background:#172C45;border-right:none"></div>
      <div class="wi-ca-wrap" onclick="event.stopPropagation();_wnOpenSnPopover(event,'${ord.id}',${row.id})">
        <button class="wi-side-btn" onclick="event.stopPropagation();_wnPrint(${row.id},'southnorth')">🖨</button>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:4px 6px;cursor:pointer">
          ${pill}
        </div>
        <div style="width:30px;flex-shrink:0"></div>
      </div>
      <div class="wi-ci" style="cursor:grab;background:rgba(14,165,233,0.03)">
        <div class="wi-ci-data">
          <div style="display:flex;align-items:center;gap:0;min-width:0">
            <span class="wi-ci-from">${fromStr}</span>
            <span class="wi-ci-sep">→</span>
            <span class="wi-ci-dest">${toStr}</span>
            ${badges}
          </div>
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:1px">
            <span class="wi-ci-s">${loadDt} → ${delDt} · ${pals} pal</span>
            ${f['Type']==='Veroia Switch'?'<span class="wi-badge wi-b-veroia">Veroia</span>':''}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ── HELPERS ─────────────────────────────────────────────────────── */
function _wnFmt(s){
  if(!s) return '—';
  try{const p=s.split('T')[0].split('-');return`${p[2]}/${p[1]}`;}catch{return s;}
}
function _wnFmtFull(s){
  if(!s) return null;
  try{
    const d=new Date(s+'T12:00:00');
    const str=d.toLocaleDateString('el-GR',{weekday:'long',day:'numeric',month:'long'});
    return str.charAt(0).toUpperCase()+str.slice(1);
  }catch{return s;}
}
function _wnDelDate(row){
  const ord=WNATL.data.northsouth.find(r=>r.id===row.orderIds[0]);
  const raw=ord?.fields['Delivery DateTime']||null;
  return raw?_wnFmtFull(raw):null;
}
function _wnLocLabel(locId){
  if(!locId) return null;
  const loc = WNATL.data.locations?.find(r=>r.id===locId);
  return loc?.fields?.['Name']||null;
}
function _wnSnLabel(snRec){
  const f = snRec.fields;
  const clientId=(f['Client']||[])[0]||'';
  return WNATL.data.clients.find(c=>c.id===clientId)?.label||'—';
}
function _wnBadges(f){
  const b=[];
  if(f['Pallet Exchange'])  b.push('<span class="wi-badge wi-b-pe">PE</span>');
  if(f['National Groupage'])b.push('<span class="wi-badge wi-b-grpg">GRP</span>');
  return b.join('');
}

function _wnNavWeek(d){
  WNATL.week = Math.max(1, Math.min(53, WNATL.week+d));
  renderWeeklyNatl();
}

/* ── DRAG & DROP (S→N onto N→S row) ─────────────────────────────── */
window._wnDragging = null;
function _wnDragStart(e, snId){
  window._wnDragging = snId;
  e.dataTransfer.effectAllowed = 'move';
  e.stopPropagation();
}
function _wnDropOnRow(e, rowId){
  e.preventDefault();
  const snId = window._wnDragging;
  if(!snId) return;
  document.getElementById('wn-ci-'+rowId)?.classList.remove('dh');
  _wnSaveMatch(rowId, snId);
}
async function _wnSaveMatch(rowId, snId){
  const row = WNATL.rows.find(r=>r.id===rowId); if(!row) return;
  const oldSnId = row.matchedId;
  row.matchedId = snId;
  // Remove from S→N standalone list
  WNATL.rows = WNATL.rows.filter(r=>!(r.type==='southnorth'&&r.orderId===snId));
  _wnPaint();
  try {
    // Save on N→S order
    await atPatch(TABLES.NAT_ORDERS, row.orderIds[0], {'Matched Order ID': snId});
    // Save on S→N order
    await atPatch(TABLES.NAT_ORDERS, snId, {'Matched Order ID': row.orderIds[0]});
    toast('Matched ✓');
  } catch(err) { toast('Match save error: '+err.message, 'warn'); }
}

/* ── POPOVER (N→S assignment) ────────────────────────────────────── */
function _wnOpenPopover(e, rowId){
  e.stopPropagation();
  const row = WNATL.rows.find(r=>r.id===rowId); if(!row) return;
  const {trucks, trailers, drivers, partners} = WNATL.data;

  const mkDrop=(px,arr,selId,ph,wide)=>{
    const uid=`${px}_wn_${rowId}`;
    const sel=arr.find(x=>x.id===selId)?.label||'';
    const opts=arr.map(x=>{const l=(x.label||'').replace(/"/g,'&quot;');
      return`<div class="wi-sdo" data-id="${x.id}" data-lbl="${l}">${l}</div>`;}).join('');
    return`<div class="wi-sd" id="wsd-${uid}">
      <input type="text" class="wi-pop-inp${wide?' wi-pop-inp-wide':''} wi-sdi"
             placeholder="${ph}" value="${sel.replace(/"/g,'&quot;')}"
             oninput="_wiSdF('${uid}',this.value)" onfocus="_wiSdO('${uid}')" autocomplete="off"/>
      <input type="hidden" id="wsd-v-${uid}" value="${selId||''}"/>
      <div id="wsd-l-${uid}" class="wi-sdl">${opts}</div>
    </div>`;
  };

  const pop = document.getElementById('wn-popover');
  pop.innerHTML=`
    <div class="wi-pop-header">
      <div>
        <div class="wi-pop-title">Assign N→S Trip</div>
        <div class="wi-pop-subtitle">Week ${WNATL.week} · ${row.orderIds.length} order${row.orderIds.length>1?'s':''}</div>
      </div>
      <button class="wi-pop-close" onclick="_wnClosePopover()">×</button>
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
            <input class="wi-pop-inp wi-pop-inp-wide" type="text" placeholder="e.g. ΙΑΒ 1099"
                   id="wn-pop-pp-${rowId}" value="${(row.partnerPlates||'').replace(/"/g,'&quot;')}"/>
          </div>
          <div class="wi-pop-field">
            <span class="wi-pop-lbl">Rate €</span>
            <input class="wi-pop-inp" type="number" step="0.01" placeholder="0.00"
                   id="wn-pop-rate-${rowId}" style="width:90px" value="${row.partnerRate||''}"/>
          </div>
        </div>
      </div>
    </div>
    <div class="wi-pop-footer">
      ${row.saved?`<button class="wi-pop-cancel" onclick="_wnClear(${rowId}).then(()=>_wnClosePopover())">Clear</button>`:''}
      <button class="wi-pop-cancel" onclick="_wnClosePopover()">Cancel</button>
      <button class="wi-pop-save" id="wn-pop-btn-${rowId}"
              onclick="event.stopPropagation();_wnSaveFromPopover(${rowId})">
        <div id="wn-pop-spin-${rowId}" style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;display:none;animation:wi-spin .6s linear infinite"></div>
        ${row.saved?'Update':'Save Assignment'}
      </button>
    </div>`;

  const rect = e.currentTarget.getBoundingClientRect();
  const popW=430, popH=300;
  let left=rect.left-10, top=rect.bottom+6;
  if(left+popW>window.innerWidth-12) left=window.innerWidth-popW-12;
  if(top+popH>window.innerHeight-12) top=rect.top-popH-6;
  if(top<10) top=10;
  Object.assign(pop.style,{display:'block',left:`${Math.max(10,left)}px`,top:`${top}px`});
  setTimeout(()=>document.addEventListener('click',_wnPopoverOutside,{capture:true}),10);
}
function _wnOpenSnPopover(e, snId, rowId){ _wnOpenPopover(e, rowId); }
function _wnPopoverOutside(e){
  const pop=document.getElementById('wn-popover');
  if(pop&&!pop.contains(e.target)&&!e.target.closest('.wi-ca-wrap')) _wnClosePopover();
}
function _wnClosePopover(){
  const pop=document.getElementById('wn-popover');
  if(pop) pop.style.display='none';
  document.removeEventListener('click',_wnPopoverOutside,{capture:true});
}

/* ── SAVE ────────────────────────────────────────────────────────── */
async function _wnSaveFromPopover(rowId){
  const row = WNATL.rows.find(r=>r.id===rowId); if(!row) return;

  // Sync dropdowns → row state
  const syncDrop=(px,fId,lId)=>{
    const uid=`${px}_wn_${rowId}`;
    const val=document.getElementById(`wsd-v-${uid}`)?.value||'';
    const lbl=document.querySelector(`#wsd-${uid} .wi-sdi`)?.value||'';
    if(val){row[fId]=val;row[lId]=lbl;}
  };
  syncDrop('tk','truckId','truckLabel');
  syncDrop('tl','trailerId','trailerLabel');
  syncDrop('dr','driverId','driverLabel');
  syncDrop('pt','partnerId','partnerLabel');
  const pp=document.getElementById(`wn-pop-pp-${rowId}`);
  if(pp) row.partnerPlates=pp.value;
  const rt=document.getElementById(`wn-pop-rate-${rowId}`);
  if(rt) row.partnerRate=rt.value;

  const isPartner = !!row.partnerId;
  if(!isPartner && !row.truckId){ toast('Select Truck or Partner','warn'); return; }

  const btn=document.getElementById(`wn-pop-btn-${rowId}`);
  const spin=document.getElementById(`wn-pop-spin-${rowId}`);
  if(btn){btn.disabled=true; if(spin)spin.style.display='block';}

  const fields = isPartner
    ? {'Partner':[row.partnerId],'Is Partner Trip':true,
       'Partner Truck Plates':row.partnerPlates||'',
       'Truck':[],'Trailer':[],'Driver':[],
       'Partner Rate':row.partnerRate?parseFloat(row.partnerRate):null}
    : {'Truck':[row.truckId],
       'Trailer':row.trailerId?[row.trailerId]:[],
       'Driver': row.driverId?[row.driverId]:[],
       'Is Partner Trip':false,'Partner':[],'Partner Truck Plates':''};

  const errors=[];
  for(const orderId of row.orderIds){
    try{
      const res = await atPatch(TABLES.NAT_ORDERS, orderId, fields);
      if(res?.error) throw new Error(res.error.message||res.error.type);
    }catch(err){errors.push(err.message);}
  }
  // Also assign S→N if matched
  if(row.matchedId){
    try{
      const res = await atPatch(TABLES.NAT_ORDERS, row.matchedId, fields);
      if(res?.error) throw new Error(res.error.message||res.error.type);
    }catch(err){errors.push('S→N: '+err.message);}
  }

  if(btn){btn.disabled=false; if(spin)spin.style.display='none';}
  if(errors.length){ toast('Error: '+errors[0].slice(0,60),'warn'); return; }

  row.saved = true;
  _wnClosePopover();
  toast(row.saved?'Updated':'Saved');
  await renderWeeklyNatl();
}

/* ── CLEAR ───────────────────────────────────────────────────────── */
async function _wnClear(rowId){
  const row=WNATL.rows.find(r=>r.id===rowId); if(!row) return;
  const errors=[];
  for(const orderId of row.orderIds){
    try{
      await atPatch(TABLES.NAT_ORDERS, orderId,
        {'Truck':[],'Trailer':[],'Driver':[],'Partner':[],'Is Partner Trip':false,'Partner Truck Plates':''});
    }catch(e){errors.push(e.message);}
  }
  if(errors.length){ toast('Clear error','warn'); return; }
  toast('Cleared');
  await renderWeeklyNatl();
}

/* ── CONTEXT MENU (right-click groupage) ────────────────────────── */
function _wnCtx(e, rowId){
  e.preventDefault(); e.stopPropagation();
  const allNsRows = WNATL.rows.filter(r=>r.type==='northsouth');
  const ctx=document.getElementById('wn-ctx');
  const items=[];
  items.push(`<div class="wi-ctx-item" onclick="_wnCtxClose();_wnOpenPopover({stopPropagation:()=>{},currentTarget:document.getElementById('wn-row-${rowId}')},${rowId})">Assign</div>`);
  if(allNsRows.length>1)
    items.push(`<div class="wi-ctx-item" onclick="_wnCtxClose();_wnStartGroup(${rowId})">Group with…</div>`);
  if(WNATL.rows.find(r=>r.id===rowId)?.orderIds?.length>1)
    items.push(`<div class="wi-ctx-item wi-ctx-danger" onclick="_wnCtxClose();_wnSplit(${rowId})">Split groupage</div>`);

  ctx.innerHTML=`<div class="wi-ctx-menu">${items.join('')}</div>`;
  Object.assign(ctx.style,{display:'block',left:`${e.pageX}px`,top:`${e.pageY}px`});
  setTimeout(()=>document.addEventListener('click',_wnCtxClose,{once:true}),10);
}
function _wnCtxClose(){
  const ctx=document.getElementById('wn-ctx');
  if(ctx) ctx.style.display='none';
}
function _wnToggle(rowId){ /* no-op — click opens popover via wi-ca-wrap */ }

/* ── GROUPAGE ────────────────────────────────────────────────────── */
function _wnStartGroup(rowId){
  toast('Right-click on the row to merge with…','warn'); // simple: auto-group nearest unassigned
}
function _wnSplit(rowId){
  const row=WNATL.rows.find(r=>r.id===rowId); if(!row||row.orderIds.length<=1) return;
  const allIds=[...row.orderIds];
  const [first,...rest]=row.orderIds; row.orderIds=[first]; row.groupageId=null;
  rest.forEach(id=>{
    WNATL.rows.push({
      id:++WNATL._seq, type:'northsouth', orderId:id, orderIds:[id],
      matchedId:null, groupageId:null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',
      truckLabel:'',trailerLabel:'',driverLabel:'',partnerLabel:'',
      partnerPlates:'',partnerRate:'',saved:false,
    });
  });
  _wnPaint(); toast('Split');
  allIds.forEach(id=>atPatch(TABLES.NAT_ORDERS,id,{'Groupage ID':''}).catch(()=>{}));
}

/* ── GROUPAGE TOOLTIP ────────────────────────────────────────────── */
function _wnShowGrpTip(e, rowId){
  const row=WNATL.rows.find(r=>r.id===rowId); if(!row) return;
  const ords=row.orderIds.map(id=>WNATL.data.northsouth.find(r=>r.id===id)).filter(Boolean);
  const items=ords.map((ord,i)=>{
    const f=ord.fields;
    const clientId=(f['Client']||[])[0]||'';
    const client=WNATL.data.clients.find(c=>c.id===clientId)?.label||'—';
    return`<div class="wi-gr-tip-row">
      <span class="wi-gr-tip-n">${i+1}.</span>
      <div class="wi-gr-tip-dest">
        <div style="font-weight:700">${client}</div>
        <div style="font-size:9.5px;color:var(--text-dim)">${_wnFmt(f['Loading DateTime'])}→${_wnFmt(f['Delivery DateTime'])} · ${f['Pallets']||0} pal</div>
      </div>
    </div>`;
  }).join('');
  const tip=document.getElementById('wn-grp-tip'); if(!tip) return;
  tip.innerHTML=items;
  const r=e.currentTarget.getBoundingClientRect();
  tip.style.display='block';
  tip.style.left=`${r.left}px`;
  tip.style.top=`${r.bottom+4}px`;
}
function _wnHideGrpTip(){
  const tip=document.getElementById('wn-grp-tip'); if(tip) tip.style.display='none';
}

/* ── PRINT ───────────────────────────────────────────────────────── */
function _wnPrint(rowId, leg){
  const row=WNATL.rows.find(r=>r.id===rowId); if(!row) return;
  const orderId = leg==='northsouth' ? row.orderIds[0] : row.matchedId;
  if(!orderId){ toast('No order to print','warn'); return; }
  const base='https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/print.html';
  window.open(`${base}?orderId=${orderId}&leg=${leg==='northsouth'?'export':'import'}`,'_blank');
}
