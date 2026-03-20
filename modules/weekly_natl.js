// ═══════════════════════════════════════════════════════════════════════
// WEEKLY NATIONAL — v2.0
// ─────────────────────────────────────────────────────────────────────
// Same layout philosophy as Weekly International.
// 3 columns: ΚΑΘΟΔΟΣ (N→S) | ΑΝΑΘΕΣΗ | ΑΝΟΔΟΣ (S→N)
//
// Fields read from NATIONAL ORDERS:
//   Direction ('North→South' | 'South→North')
//   Type ('Veroia Switch' | 'Independent')
//   Client, Pickup Location, Delivery Location
//   Loading DateTime, Delivery DateTime
//   Pallets, Pallet Exchange, National Groupage, Temperature °C
//   Truck[], Trailer[], Driver[], Partner[], Is Partner Trip
//   Partner Truck Plates, Partner Rate, Groupage ID, Matched Order ID
//   Status, Invoiced, Notes
//
// Fields written: Truck, Trailer, Driver, Partner, Is Partner Trip,
//   Partner Truck Plates, Partner Rate, Groupage ID, Matched Order ID
// ═══════════════════════════════════════════════════════════════════════

'use strict';

const WNATL = {
  week: _wnCurrentWeek(),
  data: { northsouth:[], southnorth:[], trucks:[], trailers:[], drivers:[], partners:[], clients:[], locations:[] },
  rows: [],
  _seq: 0,
};

function _wnCurrentWeek() {
  const d = new Date();
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const mon = new Date(jan4);
  mon.setDate(jan4.getDate() - jan4.getDay() + 1);
  return Math.ceil((d - mon) / (7 * 864e5)) + 1;
}

/* ── CSS (injects once, reuses wi-* from weekly_intl) ─────────────── */
(function(){
  if (document.getElementById('wnatl-css2')) return;
  const s = document.createElement('style'); s.id = 'wnatl-css2';
  s.textContent = `
#wn-popover {
  display:none; position:fixed; z-index:9999;
  background:var(--bg-card); border:1px solid var(--border-mid);
  border-radius:10px;
  box-shadow:0 8px 32px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.1);
  width:430px; overflow:hidden;
}
/* pill overrides */
.wi-pill {
  display:inline-flex; flex-direction:column; align-items:center; justify-content:center;
  padding:0; border-radius:0; max-width:230px; overflow:hidden; gap:0;
  transition:opacity .15s; cursor:pointer; background:none; border:none;
}
.wi-pill:hover { opacity:.82; }
.wi-tag { display:inline-flex; align-items:center; gap:7px;
  padding:7px 14px; border-radius:4px; width:100%;
  font-size:11px; font-weight:700; letter-spacing:.4px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wi-tag-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.wi-tag-ok  { background:rgba(5,150,105,0.1); color:#34D399; }
.wi-tag-ok  .wi-tag-dot { background:#059669; box-shadow:0 0 0 2px rgba(5,150,105,0.25); }
.wi-tag-bp  { background:rgba(59,130,246,0.1); color:#60A5FA; }
.wi-tag-bp  .wi-tag-dot { background:#3B82F6; box-shadow:0 0 0 2px rgba(59,130,246,0.25); }
.wi-tag-un  { background:rgba(255,255,255,0.04); color:rgba(184,196,208,0.45); }
.wi-tag-un  .wi-tag-dot { background:rgba(184,196,208,0.25); }
.wi-tag-sub { font-size:9px; font-weight:500; color:rgba(184,196,208,0.4);
  padding:0 14px 5px; letter-spacing:.3px; }
.pt { font-size:11px; font-weight:700; white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; max-width:200px; }
.ps { font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  max-width:200px; }
`;
  document.head.appendChild(s);
})();

/* ── ENTRY POINT ──────────────────────────────────────────────────── */
async function renderWeeklyNatl() {
  document.getElementById('topbarTitle').textContent = `Weekly National — Week ${WNATL.week}`;
  const content = document.getElementById('content');
  content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:80px;color:var(--text-dim)">
    <div class="spinner"></div> Φόρτωση εβδομάδας ${WNATL.week}…</div>`;
  try {
    await _wnLoadAssets();
    await _wnLoadOrders();
    _wnBuildRows();
    _wnPaint();
  } catch(e) {
    content.innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα: ${e.message}</div>`;
    console.error('renderWeeklyNatl:', e);
  }
}

/* ── LOAD ASSETS ─────────────────────────────────────────────────── */
async function _wnLoadAssets() {
  const [t, tl, d, p, c, locs] = await Promise.all([
    atGetAll(TABLES.TRUCKS,    { fields:['License Plate'], filterByFormula:'{Active}=TRUE()' }, false),
    atGetAll(TABLES.TRAILERS,  { fields:['License Plate'] }, false),
    atGetAll(TABLES.DRIVERS,   { fields:['Full Name'],     filterByFormula:'{Active}=TRUE()' }, false),
    atGetAll(TABLES.PARTNERS,  { fields:['Company Name'] }, false),
    atGetAll(TABLES.CLIENTS,   { fields:['Company Name'] }, false),
    atGetAll(TABLES.LOCATIONS, { fields:['Name','City','Country'] }, true),
  ]);
  WNATL.data.trucks    = t.map(r  => ({ id:r.id, label:r.fields['License Plate']||r.id }));
  WNATL.data.trailers  = tl.map(r => ({ id:r.id, label:r.fields['License Plate']||r.id }));
  WNATL.data.drivers   = d.map(r  => ({ id:r.id, label:r.fields['Full Name']||r.id }));
  WNATL.data.partners  = p.map(r  => ({ id:r.id, label:r.fields['Company Name']||r.id }));
  WNATL.data.clients   = c.map(r  => ({ id:r.id, label:r.fields['Company Name']||r.id }));
  WNATL.data.locations = locs;
}

/* ── LOAD ORDERS ─────────────────────────────────────────────────── */
async function _wnLoadOrders() {
  const year   = new Date().getFullYear();
  const jan4   = new Date(year, 0, 4);
  const mon    = new Date(jan4); mon.setDate(jan4.getDate() - jan4.getDay() + 1);
  const wStart = new Date(mon); wStart.setDate(mon.getDate() + (WNATL.week - 1) * 7);
  const wEnd   = new Date(wStart); wEnd.setDate(wStart.getDate() + 6);
  const fmt    = d => d.toISOString().split('T')[0];

  const filter = `AND(IS_AFTER({Delivery DateTime},'${fmt(new Date(wStart.getTime()-86400000))}'),IS_BEFORE({Delivery DateTime},'${fmt(new Date(wEnd.getTime()+86400000))}'))`;

  const all = await atGetAll(TABLES.NAT_ORDERS, {
    filterByFormula: filter,
  }, false);

  WNATL.data.northsouth = all
    .filter(r => r.fields['Direction'] === 'North→South')
    .sort((a,b) => (a.fields['Delivery DateTime']||'').localeCompare(b.fields['Delivery DateTime']||''));

  WNATL.data.southnorth = all
    .filter(r => r.fields['Direction'] === 'South→North')
    .sort((a,b) => (a.fields['Loading DateTime']||'').localeCompare(b.fields['Loading DateTime']||''));

  // Also filter week by Loading DateTime for S→N (pick-up this week)
  // N→S already filtered by Delivery DateTime above
}

/* ── BUILD ROWS ──────────────────────────────────────────────────── */
function _wnBuildRows() {
  WNATL.rows = []; WNATL._seq = 0;
  const { northsouth, southnorth } = WNATL.data;

  const grpMap = {};

  for (const ord of northsouth) {
    const f = ord.fields;
    const gid = f['Groupage ID'] || null;

    if (gid && grpMap[gid] !== undefined) {
      WNATL.rows[grpMap[gid]].orderIds.push(ord.id);
      continue;
    }

    const idx = WNATL.rows.length;
    if (gid) grpMap[gid] = idx;

    const truckId   = (f['Truck']  ||[])[0]||'';
    const trailerId = (f['Trailer']||[])[0]||'';
    const driverId  = (f['Driver'] ||[])[0]||'';
    const partnerId = (f['Partner']||[])[0]||'';
    const matchedId = f['Matched Order ID']||null;

    WNATL.rows.push({
      id: ++WNATL._seq, type:'northsouth',
      orderId: ord.id, orderIds:[ord.id],
      matchedId, groupageId:gid,
      truckId, trailerId, driverId, partnerId,
      truckLabel:   WNATL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel: WNATL.data.trailers.find(t=>t.id===trailerId)?.label||'',
      driverLabel:  WNATL.data.drivers.find(d=>d.id===driverId)?.label||'',
      partnerLabel: WNATL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates: f['Partner Truck Plates']||'',
      partnerRate:   f['Partner Rate'] ? String(f['Partner Rate']) : '',
      saved: !!(truckId || partnerId),
    });
  }

  const matchedSN = new Set(WNATL.rows.map(r=>r.matchedId).filter(Boolean));

  for (const ord of southnorth) {
    if (matchedSN.has(ord.id)) continue;
    const f = ord.fields;
    const truckId   = (f['Truck']  ||[])[0]||'';
    const partnerId = (f['Partner']||[])[0]||'';
    WNATL.rows.push({
      id: ++WNATL._seq, type:'southnorth',
      orderId: ord.id, orderIds:[ord.id],
      matchedId: null, groupageId: f['Groupage ID']||null,
      truckId, trailerId:'', driverId:'', partnerId,
      truckLabel:   WNATL.data.trucks.find(t=>t.id===truckId)?.label||'',
      trailerLabel:'', driverLabel:'',
      partnerLabel: WNATL.data.partners.find(p=>p.id===partnerId)?.label||'',
      partnerPlates: f['Partner Truck Plates']||'',
      partnerRate:   f['Partner Rate'] ? String(f['Partner Rate']) : '',
      saved: !!(truckId || partnerId),
    });
  }
}

/* ── PAINT ───────────────────────────────────────────────────────── */
function _wnPaint() {
  const { rows, week, data } = WNATL;
  const nsRows = rows.filter(r => r.type==='northsouth');
  const snRows = rows.filter(r => r.type==='southnorth');
  const assigned = nsRows.filter(r => r.saved).length;
  const pending  = nsRows.filter(r => !r.saved).length;

  const year = new Date().getFullYear();
  const jan4 = new Date(year,0,4);
  const mon  = new Date(jan4); mon.setDate(jan4.getDate()-jan4.getDay()+1);
  const wS   = new Date(mon); wS.setDate(mon.getDate()+(week-1)*7);
  const wE   = new Date(wS);  wE.setDate(wS.getDate()+6);
  const fmtD = d => d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  const weekRange = `${fmtD(wS)} – ${fmtD(wE)}`;

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:12px">
      <div>
        <div class="page-title">Weekly National</div>
        <div class="page-sub">
          Εβδομάδα ${week} · ${weekRange}
          <span style="margin-left:12px;color:var(--text)">${nsRows.length} κάθοδος</span>
          <span style="margin-left:8px;color:rgba(14,165,233,0.9)">${snRows.length} άνοδος ελεύθερα</span>
          <span style="margin-left:8px;color:var(--success)">${assigned} ανατεθειμένα</span>
          <span style="margin-left:4px;color:#E05252">· ${pending} εκκρεμή</span>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="_wnNavWeek(-1)">← Προηγ.</button>
        <div style="padding:6px 14px;font-family:'Syne',sans-serif;font-weight:700;font-size:14px">W ${week}</div>
        <button class="btn btn-ghost" onclick="_wnNavWeek(1)">Επόμ. →</button>
        <button class="btn btn-ghost" onclick="renderWeeklyNatl()">Refresh</button>
      </div>
    </div>

    <div class="wi-wrap">
      <div class="wi-head" style="background:#B8C4D0">
        <div class="wi-hc" style="text-align:center;color:#091828;border-right:1px solid rgba(9,24,40,0.12)">#</div>
        <div class="wi-hc" style="text-align:center;color:#091828;font-weight:800;letter-spacing:1.8px;border-right:1px solid rgba(9,24,40,0.12);display:flex;align-items:center;justify-content:center;gap:8px">
          ↓ ΚΑΘΟΔΟΣ
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:#091828;color:#B8C4D0;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0">${nsRows.length}</span>
        </div>
        <div class="wi-hc" style="text-align:center;color:#091828;opacity:0.5;letter-spacing:1.8px;border-right:1px solid rgba(9,24,40,0.12)">
          ΑΝΑΘΕΣΗ
        </div>
        <div class="wi-hc" style="text-align:center;color:#091828;font-weight:800;letter-spacing:1.8px;display:flex;align-items:center;justify-content:center;gap:8px">
          ↑ ΑΝΟΔΟΣ
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:#091828;color:#B8C4D0;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0">${data.southnorth.length}</span>
        </div>
      </div>
      <div id="wn-rows">
        ${rows.length ? _wnAllRowsHTML() : `<div class="empty-state" style="padding:60px">
          <p>Δεν υπάρχουν εθνικές εντολές για την εβδομάδα ${week}</p></div>`}
      </div>
    </div>

    <div id="wn-ctx"></div>
    <div id="wn-popover"></div>`;

  window._wnDragging = null;
}

/* ── ALL ROWS — grouped by date, N→S + S→N per day ─────────────── */
function _wnAllRowsHTML() {
  const nsRows = WNATL.rows.filter(r => r.type==='northsouth');
  const snRows = WNATL.rows.filter(r => r.type==='southnorth');
  let html = '';
  let idx = 0;

  // Build map: dateKey → { lbl, ns:[], sn:[] }
  const dayMap = {};

  nsRows.forEach(row => {
    const ord = WNATL.data.northsouth.find(r => r.id===row.orderIds[0]);
    const key = ord?.fields['Delivery DateTime']?.split('T')[0] || 'zzz';
    const lbl = _wnFmtFull(ord?.fields['Delivery DateTime']||null) || '—';
    if (!dayMap[key]) dayMap[key] = { lbl, ns:[], sn:[] };
    dayMap[key].ns.push(row);
  });

  snRows.forEach(row => {
    const ord = WNATL.data.southnorth.find(r => r.id===row.orderId);
    const key = ord?.fields['Loading DateTime']?.split('T')[0] || 'zzz';
    const lbl = _wnFmtFull(ord?.fields['Loading DateTime']||null) || '—';
    if (!dayMap[key]) dayMap[key] = { lbl, ns:[], sn:[] };
    dayMap[key].sn.push(row);
  });

  // Sort days chronologically
  const sortedKeys = Object.keys(dayMap).sort();

  sortedKeys.forEach(key => {
    const { lbl, ns, sn } = dayMap[key];
    const nsCount = ns.length;
    const snCount = sn.length;

    html += `<div class="wi-dsep">
      <span class="wi-dsep-lbl">Date</span>
      <span class="wi-dsep-date">${lbl}</span>
      ${nsCount ? `<span class="wi-dsep-n" style="color:rgba(196,207,219,0.55)">${nsCount} κάθοδος</span>` : ''}
      ${snCount ? `<span class="wi-dsep-n" style="color:rgba(14,165,233,0.65);margin-left:${nsCount?'4px':'2px'}">${snCount} άνοδος</span>` : ''}
      ${snCount ? `<span style="font-size:9px;color:rgba(196,207,219,0.22);margin-left:auto;font-style:italic">drag για σύνδεση</span>` : ''}
    </div>`;

    ns.forEach(row => { html += _wnRowHTML(row, idx++); });
    sn.forEach(row => { html += _wnSnRowHTML(row); });
  });

  return html;
}

/* ── N→S ROW ─────────────────────────────────────────────────────── */
function _wnRowHTML(row, i) {
  const { data } = WNATL;
  const ords    = row.orderIds.map(id => data.northsouth.find(r=>r.id===id)).filter(Boolean);
  const primary = ords[0];
  const f       = primary?.fields || {};
  const isGroup = ords.length > 1;
  const sn      = row.matchedId ? data.southnorth.find(r=>r.id===row.matchedId) : null;

  // Route
  // N→S: Veroia Switch means truck picks up FROM Veroia, delivers TO clients
  const fromStr  = f['Type']==='Veroia Switch'
    ? 'ΒΕΡΜΙΟΝ ΦΡΕΣ / CROSS-DOCK'
    : (_wnPickupSummary(f) || '—');
  const toStr    = _wnDeliverySummary(f) || _wnClientLabel((f['Client']||[])[0]) || '—';

  // Client
  const clientLabel = _wnClientLabel((f['Client']||[])[0]);

  // Dates & pallets
  const pals   = ords.reduce((s,r) => s + (r.fields['Pallets']||0), 0);
  const loadDt = _wnFmt(f['Loading DateTime']);
  const delDts = ords.map(r => r.fields['Delivery DateTime']).filter(Boolean).sort();
  const delDt  = delDts.length
    ? (isGroup && _wnFmt(delDts[0]) !== _wnFmt(delDts[delDts.length-1])
        ? `${_wnFmt(delDts[0])}–${_wnFmt(delDts[delDts.length-1])}`
        : _wnFmt(delDts[0]))
    : '—';

  // Status dot
  const isPartner = !!(row.partnerLabel || data.partners.find(p=>p.id===row.partnerId)?.label);
  let sCls = 's-pending', dotColor = 'rgba(217,119,6,0.5)';
  if (row.saved && isPartner) { sCls='s-partner'; dotColor='rgba(59,130,246,0.75)'; }
  else if (row.saved)         { sCls='s-ok';      dotColor='var(--success)'; }

  // Pill
  const pill = _wnPill(row);

  // Matched S→N preview (right column)
  const snCell = sn ? _wnSnInlineCell(sn, row.id) : _wnDragCell(row.id);

  // Badges
  const badges = _wnBadges(f);

  return `
  <div id="wn-row-${row.id}" class="wi-row ${sCls}">
    <div class="wi-compact" style="cursor:default">
      <div class="wi-cn">
        <div class="wi-dot" style="background:${dotColor}"></div>
        <span class="wi-num">${i+1}</span>
      </div>
      <div class="wi-ce" oncontextmenu="_wnCtx(event,${row.id})">
        <div class="wi-route">
          <span class="from">${fromStr}</span>
          <span class="sep">→</span>
          <span class="dest">${toStr}</span>
          ${isGroup ? `<span class="wi-gr">×${ords.length}</span>` : ''}
        </div>
        <div class="wi-sub">
          ${clientLabel ? `<span style="color:var(--text-mid)">${clientLabel}</span><span class="wi-sub-div"></span>` : ''}
          <span>${loadDt} → ${delDt}</span>
          <span class="wi-sub-div"></span>
          <span>${pals} pal</span>
          ${f['Type']==='Veroia Switch' ? '<span class="wi-badge wi-b-veroia" style="margin-left:6px">VEROIA</span>' : ''}
          ${badges}
        </div>
      </div>
      <div class="wi-ca-wrap" onclick="event.stopPropagation();_wnOpenPopover(event,${row.id})">
        <button class="wi-side-btn" title="Εκτύπωση" onclick="event.stopPropagation();_wnPrint(${row.id},'northsouth')">🖨</button>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:4px 8px;cursor:pointer;min-width:0">
          ${pill}
        </div>
        ${row.matchedId
          ? `<button class="wi-side-btn" title="Εκτύπωση ανόδου" onclick="event.stopPropagation();_wnPrint(${row.id},'southnorth')">🖨</button>`
          : `<div style="width:30px;flex-shrink:0"></div>`}
      </div>
      <div class="wi-ci" id="wn-ci-${row.id}"
           onclick="event.stopPropagation()"
           ondragover="event.preventDefault();document.getElementById('wn-ci-${row.id}').classList.add('dh')"
           ondragleave="document.getElementById('wn-ci-${row.id}').classList.remove('dh')"
           ondrop="event.stopPropagation();_wnDropOnRow(event,${row.id})">
        ${snCell}
      </div>
    </div>
  </div>`;
}

/* ── Matched S→N cell (right column when linked) ─────────────────── */
function _wnSnInlineCell(snRec, rowId) {
  const f = snRec.fields;
  const clientId = (f['Client']||[])[0]||'';
  const clientLabel = _wnClientLabel(clientId);
  // S→N: Veroia Switch means truck picks up FROM Greek suppliers, delivers TO Veroia
  const fromStr  = _wnPickupSummary(f) || '—';
  const toStr    = f['Type']==='Veroia Switch'
    ? 'ΒΕΡΜΙΟΝ ΦΡΕΣ / CROSS-DOCK'
    : (_wnDeliverySummary(f) || clientLabel || '—');
  const loadDt   = _wnFmt(f['Loading DateTime']);
  const pals     = f['Pallets']||0;
  return `<div class="wi-ci-data">
    <div style="display:flex;align-items:center;gap:0;min-width:0">
      <span class="wi-ci-from" style="color:rgba(14,165,233,0.85)">${fromStr}</span>
      <span class="wi-ci-sep">→</span>
      <span class="wi-ci-dest" style="color:rgba(14,165,233,0.85)">${toStr}</span>
      <span style="font-size:8px;color:rgba(14,165,233,0.5);margin-left:6px;cursor:pointer"
            onclick="_wnUnmatch(${rowId},'${snRec.id}')">✕</span>
    </div>
    <div style="display:flex;align-items:center;gap:5px">
      <span class="wi-ci-s">${loadDt} · ${pals} pal</span>
      ${_wnBadges(f)}
    </div>
    <span style="font-size:9px;color:rgba(14,165,233,0.45)">↩ matched</span>
  </div>`;
}

/* ── Drag-here cell ───────────────────────────────────────────────── */
function _wnDragCell(rowId) {
  return `<div style="width:100%;height:100%;display:flex;align-items:center;
      background:#172C45;margin:-4px -12px;padding:4px 12px;min-height:36px;">
    <span style="font-size:10px;color:rgba(196,207,219,0.25);font-style:italic">drag άνοδος εδώ</span>
  </div>`;
}

/* ── S→N standalone row ──────────────────────────────────────────── */
function _wnSnRowHTML(row) {
  const { data } = WNATL;
  const ord = data.southnorth.find(r => r.id===row.orderId);
  if (!ord) return '';
  const f = ord.fields;

  const clientId    = (f['Client']||[])[0]||'';
  const clientLabel = _wnClientLabel(clientId);
  // S→N: Veroia Switch means truck picks up FROM Greek suppliers, delivers TO Veroia
  const fromStr     = _wnPickupSummary(f) || '—';
  const toStr       = f['Type']==='Veroia Switch'
    ? 'ΒΕΡΜΙΟΝ ΦΡΕΣ / CROSS-DOCK'
    : (_wnDeliverySummary(f) || clientLabel || '—');
  const pals        = f['Pallets']||0;
  const loadDt      = _wnFmt(f['Loading DateTime']);
  const delDt       = _wnFmt(f['Delivery DateTime']);
  const badges      = _wnBadges(f);
  const pill        = _wnPill(row);

  return `<div id="wn-sn-${ord.id}"
    class="wi-row"
    style="background:var(--bg-card);border-top:1px solid rgba(14,165,233,0.1)"
    draggable="true"
    ondragstart="_wnDragStart(event,'${ord.id}')">
    <div class="wi-compact" style="cursor:grab">
      <div class="wi-cn">
        <div class="wi-dot" style="background:rgba(14,165,233,0.5)"></div>
        <span style="font-size:7px;color:rgba(14,165,233,0.55);font-weight:800;letter-spacing:.5px">ΑΝΟ</span>
      </div>
      <div class="wi-ce" style="background:#172C45;border-right:none"></div>
      <div class="wi-ca-wrap" onclick="event.stopPropagation();_wnOpenSnPopover(event,'${ord.id}',${row.id})">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:4px 8px;cursor:pointer">
          ${pill}
        </div>
      </div>
      <div class="wi-ci" style="cursor:grab;background:rgba(14,165,233,0.03)">
        <div class="wi-ci-data">
          <div style="display:flex;align-items:center;gap:0;min-width:0">
            <span class="wi-ci-from">${fromStr}</span>
            <span class="wi-ci-sep">→</span>
            <span class="wi-ci-dest">${toStr}</span>
          </div>
          <div class="wi-sub">
            ${clientLabel ? `<span style="color:var(--text-mid)">${clientLabel}</span><span class="wi-sub-div"></span>` : ''}
            <span>${loadDt} → ${delDt} · ${pals} pal</span>
            ${f['Type']==='Veroia Switch' ? '<span class="wi-badge wi-b-veroia" style="margin-left:6px">VEROIA</span>' : ''}
            ${badges}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ── HELPERS ─────────────────────────────────────────────────────── */
function _wnLocCity(locId) {
  if (!locId) return null;
  const loc = WNATL.data.locations.find(r => r.id===locId);
  if (!loc) return null;
  return loc.fields['City'] || loc.fields['Name'] || null;
}

// Returns Location Name (not city) for a locId
function _wnLocName(locId) {
  if (!locId) return null;
  const loc = WNATL.data.locations.find(r => r.id===locId);
  if (!loc) return null;
  return loc.fields['Name'] || loc.fields['City'] || null;
}

// Returns all pickup location names joined by " / "
// NATIONAL ORDERS uses 'Pickup Location 1' through 'Pickup Location 10'
function _wnPickupSummary(f) {
  const keys = ['Pickup Location 1','Pickup Location 2','Pickup Location 3','Pickup Location 4',
                 'Pickup Location 5','Pickup Location 6','Pickup Location 7','Pickup Location 8',
                 'Pickup Location 9','Pickup Location 10'];
  return keys.map(k => _wnLocName((f[k]||[])[0])).filter(Boolean).join(' / ') || null;
}

// Returns all delivery location names joined by " / "
// NATIONAL ORDERS uses 'Delivery Location 1' through 'Delivery Location 10'
function _wnDeliverySummary(f) {
  const keys = ['Delivery Location 1','Delivery Location 2','Delivery Location 3','Delivery Location 4',
                 'Delivery Location 5','Delivery Location 6','Delivery Location 7','Delivery Location 8',
                 'Delivery Location 9','Delivery Location 10'];
  return keys.map(k => _wnLocName((f[k]||[])[0])).filter(Boolean).join(' / ') || null;
}

function _wnClientLabel(clientId) {
  if (!clientId) return '';
  return WNATL.data.clients.find(c => c.id===clientId)?.label || '';
}

function _wnFmt(s) {
  if (!s) return '—';
  try { const p=s.split('T')[0].split('-'); return `${p[2]}/${p[1]}`; }
  catch { return s; }
}

function _wnFmtFull(s) {
  if (!s) return null;
  try {
    const d = new Date(s+'T12:00:00');
    const str = d.toLocaleDateString('el-GR', { weekday:'long', day:'numeric', month:'long' });
    return str.charAt(0).toUpperCase() + str.slice(1);
  } catch { return s; }
}

function _wnDelDateFull(row) {
  const ord = WNATL.data.northsouth.find(r => r.id===row.orderIds[0]);
  return _wnFmtFull(ord?.fields['Delivery DateTime']||null);
}

function _wnBadges(f) {
  const b = [];
  if (f['Pallet Exchange'])   b.push('<span class="wi-badge wi-b-pe">PE</span>');
  if (f['National Groupage']) b.push('<span class="wi-badge wi-b-grpg">GRP</span>');
  return b.join('');
}

function _wnPill(row) {
  const { data } = WNATL;
  const truck   = row.truckLabel   || data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const trailer = row.trailerLabel || data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  const driver  = row.driverLabel  || data.drivers.find(d=>d.id===row.driverId)?.label||'';
  const partner = row.partnerLabel || data.partners.find(p=>p.id===row.partnerId)?.label||'';

  if (!row.saved) return `<div class="wi-pill">
    <div class="wi-tag wi-tag-un"><span class="wi-tag-dot"></span>Αδιάθετο</div>
  </div>`;
  if (partner) return `<div class="wi-pill">
    <div class="wi-tag wi-tag-bp">
      <span class="wi-tag-dot"></span>
      <span style="overflow:hidden;text-overflow:ellipsis">${partner.slice(0,22)}${partner.length>22?'…':''}</span>
    </div>
    ${row.partnerPlates ? `<div class="wi-tag-sub">${row.partnerPlates}</div>` : ''}
  </div>`;
  const vehicleLine = truck && trailer ? `${truck} / ${trailer}` : (truck || trailer || '—');
  return `<div class="wi-pill">
    <div class="wi-tag wi-tag-ok">
      <span class="wi-tag-dot"></span>
      <span style="overflow:hidden;text-overflow:ellipsis">${vehicleLine}</span>
    </div>
    ${driver ? `<div class="wi-tag-sub">${driver}</div>` : ''}
  </div>`;
}

function _wnNavWeek(d) {
  WNATL.week = Math.max(1, Math.min(53, WNATL.week + d));
  renderWeeklyNatl();
}

/* ── DRAG & DROP ─────────────────────────────────────────────────── */
window._wnDragging = null;

function _wnDragStart(e, snId) {
  window._wnDragging = snId;
  e.dataTransfer.effectAllowed = 'move';
  e.stopPropagation();
}

function _wnDropOnRow(e, rowId) {
  e.preventDefault();
  const snId = window._wnDragging;
  if (!snId) return;
  document.getElementById('wn-ci-'+rowId)?.classList.remove('dh');
  _wnSaveMatch(rowId, snId);
}

async function _wnSaveMatch(rowId, snId) {
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  row.matchedId = snId;
  WNATL.rows = WNATL.rows.filter(r => !(r.type==='southnorth' && r.orderId===snId));
  _wnPaint();
  try {
    await atPatch(TABLES.NAT_ORDERS, row.orderIds[0], { 'Matched Order ID': snId });
    await atPatch(TABLES.NAT_ORDERS, snId, { 'Matched Order ID': row.orderIds[0] });
    toast('Σύνδεση αποθηκεύτηκε ✓');
  } catch(err) { toast('Σφάλμα σύνδεσης: '+err.message, 'warn'); }
}

async function _wnUnmatch(rowId, snId) {
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  const snOrd = WNATL.data.southnorth.find(r => r.id===snId);
  row.matchedId = null;
  if (snOrd) {
    WNATL.rows.push({
      id: ++WNATL._seq, type:'southnorth',
      orderId: snId, orderIds:[snId],
      matchedId:null, groupageId:snOrd.fields['Groupage ID']||null,
      truckId:(snOrd.fields['Truck']||[])[0]||'',
      trailerId:'', driverId:'',
      partnerId:(snOrd.fields['Partner']||[])[0]||'',
      truckLabel:'', trailerLabel:'', driverLabel:'',
      partnerLabel:WNATL.data.partners.find(p=>p.id===(snOrd.fields['Partner']||[])[0])?.label||'',
      partnerPlates:snOrd.fields['Partner Truck Plates']||'',
      partnerRate:snOrd.fields['Partner Rate']?String(snOrd.fields['Partner Rate']):'',
      saved:!!(snOrd.fields['Truck']?.length || snOrd.fields['Partner']?.length),
    });
  }
  _wnPaint();
  try {
    await atPatch(TABLES.NAT_ORDERS, row.orderIds[0], { 'Matched Order ID': '' });
    await atPatch(TABLES.NAT_ORDERS, snId, { 'Matched Order ID': '' });
    toast('Σύνδεση αφαιρέθηκε');
  } catch(err) { toast('Σφάλμα: '+err.message, 'warn'); }
}

/* ── POPOVER ─────────────────────────────────────────────────────── */
function _wnOpenPopover(e, rowId) {
  e.stopPropagation();
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  const { trucks, trailers, drivers, partners } = WNATL.data;

  const mkDrop = (px, arr, selId, ph, wide) => {
    const uid  = `${px}_wn_${rowId}`;
    const sel  = arr.find(x => x.id===selId)?.label||'';
    const opts = arr.map(x => {
      const l = (x.label||'').replace(/"/g,'&quot;');
      return `<div class="wi-sdo" data-id="${x.id}" data-lbl="${l}">${l}</div>`;
    }).join('');
    return `<div class="wi-sd" id="wsd-${uid}">
      <input type="text" class="wi-pop-inp${wide?' wi-pop-inp-wide':''} wi-sdi"
             placeholder="${ph}" value="${sel.replace(/"/g,'&quot;')}"
             oninput="_wiSdF('${uid}',this.value)" onfocus="_wiSdO('${uid}')" autocomplete="off"/>
      <input type="hidden" id="wsd-v-${uid}" value="${selId||''}"/>
      <div id="wsd-l-${uid}" class="wi-sdl">${opts}</div>
    </div>`;
  };

  const pop = document.getElementById('wn-popover');
  pop.innerHTML = `
    <div class="wi-pop-header">
      <div>
        <div class="wi-pop-title">Ανάθεση Δρομολογίου</div>
        <div class="wi-pop-subtitle">Κάθοδος · ${row.orderIds.length} εντολ${row.orderIds.length>1?'ές':'ή'}</div>
      </div>
      <button class="wi-pop-close" onclick="_wnClosePopover()">×</button>
    </div>
    <div class="wi-pop-body">
      <div>
        <div class="wi-pop-section-lbl">Ιδιόκτητο Όχημα</div>
        <div class="wi-pop-row">
          <div class="wi-pop-field"><span class="wi-pop-lbl">Τράκτορας</span>${mkDrop('tk',trucks,row.truckId,'Πινακίδα…',false)}</div>
          <div class="wi-pop-field"><span class="wi-pop-lbl">Τρέιλερ</span>${mkDrop('tl',trailers,row.trailerId,'Πινακίδα…',false)}</div>
          <div class="wi-pop-field"><span class="wi-pop-lbl">Οδηγός</span>${mkDrop('dr',drivers,row.driverId,'Όνομα…',false)}</div>
        </div>
      </div>
      <div class="wi-pop-divider">ή συνεργάτης</div>
      <div>
        <div class="wi-pop-section-lbl">Συνεργάτης</div>
        <div class="wi-pop-row">
          <div class="wi-pop-field"><span class="wi-pop-lbl">Εταιρεία</span>${mkDrop('pt',partners,row.partnerId,'Επωνυμία…',true)}</div>
          <div class="wi-pop-field">
            <span class="wi-pop-lbl">Πινακίδα</span>
            <input class="wi-pop-inp wi-pop-inp-wide" type="text" placeholder="π.χ. ΙΑΒ 1099"
                   id="wn-pop-pp-${rowId}" value="${(row.partnerPlates||'').replace(/"/g,'&quot;')}"/>
          </div>
          <div class="wi-pop-field">
            <span class="wi-pop-lbl">Κόμιστρο €</span>
            <input class="wi-pop-inp" type="number" step="0.01" placeholder="0.00"
                   id="wn-pop-rate-${rowId}" style="width:90px" value="${row.partnerRate||''}"/>
          </div>
        </div>
      </div>
    </div>
    <div class="wi-pop-footer">
      ${row.saved ? `<button class="wi-pop-cancel" onclick="_wnClear(${rowId}).then(()=>_wnClosePopover())">Εκκαθάριση</button>` : ''}
      <button class="wi-pop-cancel" onclick="_wnClosePopover()">Ακύρωση</button>
      <button class="wi-pop-save" id="wn-pop-btn-${rowId}"
              onclick="event.stopPropagation();_wnSaveFromPopover(${rowId})">
        <div id="wn-pop-spin-${rowId}" style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;display:none;animation:wi-spin .6s linear infinite"></div>
        ${row.saved ? 'Ενημέρωση' : 'Αποθήκευση'}
      </button>
    </div>`;

  const rect = e.currentTarget.getBoundingClientRect();
  const popW=430, popH=310;
  let left = rect.left - 10;
  let top  = rect.bottom + 6;
  if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  if (top + popH  > window.innerHeight - 12) top = rect.top - popH - 6;
  if (top < 10) top = 10;
  Object.assign(pop.style, { display:'block', left:`${Math.max(10,left)}px`, top:`${top}px` });
  setTimeout(() => document.addEventListener('click', _wnPopoverOutside, { capture:true }), 10);
}

function _wnOpenSnPopover(e, snId, rowId) { _wnOpenPopover(e, rowId); }

function _wnPopoverOutside(e) {
  const pop = document.getElementById('wn-popover');
  if (pop && !pop.contains(e.target) && !e.target.closest('.wi-ca-wrap')) _wnClosePopover();
}

function _wnClosePopover() {
  const pop = document.getElementById('wn-popover');
  if (pop) pop.style.display = 'none';
  document.removeEventListener('click', _wnPopoverOutside, { capture:true });
}

/* ── SAVE ────────────────────────────────────────────────────────── */
async function _wnSaveFromPopover(rowId) {
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;

  const syncDrop = (px, fId, lId) => {
    const uid = `${px}_wn_${rowId}`;
    const val = document.getElementById(`wsd-v-${uid}`)?.value||'';
    const lbl = document.querySelector(`#wsd-${uid} .wi-sdi`)?.value||'';
    if (val) { row[fId]=val; row[lId]=lbl; }
  };
  syncDrop('tk','truckId','truckLabel');
  syncDrop('tl','trailerId','trailerLabel');
  syncDrop('dr','driverId','driverLabel');
  syncDrop('pt','partnerId','partnerLabel');
  const pp = document.getElementById(`wn-pop-pp-${rowId}`);
  if (pp) row.partnerPlates = pp.value;
  const rt = document.getElementById(`wn-pop-rate-${rowId}`);
  if (rt) row.partnerRate = rt.value;

  const isPartner = !!row.partnerId;
  if (!isPartner && !row.truckId) { toast('Επίλεξε Τράκτορα ή Συνεργάτη', 'warn'); return; }

  const btn  = document.getElementById(`wn-pop-btn-${rowId}`);
  const spin = document.getElementById(`wn-pop-spin-${rowId}`);
  if (btn)  { btn.disabled=true; if(spin) spin.style.display='block'; }

  const fields = isPartner
    ? { 'Partner':[row.partnerId], 'Is Partner Trip':true,
        'Partner Truck Plates':row.partnerPlates||'',
        'Partner Rate':row.partnerRate?parseFloat(row.partnerRate):null,
        'Truck':[],'Trailer':[],'Driver':[] }
    : { 'Truck':[row.truckId],
        'Trailer':row.trailerId?[row.trailerId]:[],
        'Driver': row.driverId?[row.driverId]:[],
        'Is Partner Trip':false,'Partner':[],'Partner Truck Plates':'' };

  const errors = [];
  for (const orderId of row.orderIds) {
    try {
      const res = await atPatch(TABLES.NAT_ORDERS, orderId, fields);
      if (res?.error) throw new Error(res.error.message||res.error.type);
    } catch(err) { errors.push(err.message); }
  }
  if (row.matchedId) {
    try {
      const res = await atPatch(TABLES.NAT_ORDERS, row.matchedId, fields);
      if (res?.error) throw new Error(res.error.message||res.error.type);
    } catch(err) { errors.push('Άνοδος: '+err.message); }
  }

  if (btn) { btn.disabled=false; if(spin) spin.style.display='none'; }
  if (errors.length) { toast('Σφάλμα: '+errors[0].slice(0,60), 'warn'); return; }

  row.saved = true;
  invalidateCache(TABLES.NAT_ORDERS);
  _wnClosePopover();
  toast('Αποθηκεύτηκε ✓');
  await renderWeeklyNatl();
}

/* ── CLEAR ───────────────────────────────────────────────────────── */
async function _wnClear(rowId) {
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  for (const orderId of row.orderIds) {
    try {
      await atPatch(TABLES.NAT_ORDERS, orderId,
        { 'Truck':[],'Trailer':[],'Driver':[],'Partner':[],'Is Partner Trip':false,'Partner Truck Plates':'' });
    } catch(e) { toast('Σφάλμα εκκαθάρισης','warn'); return; }
  }
  Object.assign(row, { truckId:'',trailerId:'',driverId:'',partnerId:'',
    truckLabel:'',trailerLabel:'',driverLabel:'',partnerLabel:'',
    partnerPlates:'',partnerRate:'',saved:false });
  invalidateCache(TABLES.NAT_ORDERS);
  toast('Εκκαθαρίστηκε');
}

/* ── CONTEXT MENU (right-click for groupage) ─────────────────────── */
function _wnCtx(e, rowId) {
  e.preventDefault(); e.stopPropagation();
  const row = WNATL.rows.find(r => r.id===rowId);
  const ctx = document.getElementById('wn-ctx');
  const items = [];
  items.push(`<div class="wi-ctx-item" onclick="_wnCtxClose();_wnOpenPopover({stopPropagation:()=>{},currentTarget:document.getElementById('wn-row-${rowId}')},${rowId})">Ανάθεση</div>`);
  if (row?.orderIds?.length > 1)
    items.push(`<div class="wi-ctx-item wi-ctx-danger" onclick="_wnCtxClose();_wnSplit(${rowId})">Διάλυση groupage</div>`);
  ctx.innerHTML = `<div class="wi-ctx-menu">${items.join('')}</div>`;
  Object.assign(ctx.style, { display:'block', left:`${e.pageX}px`, top:`${e.pageY}px` });
  setTimeout(() => document.addEventListener('click', _wnCtxClose, { once:true }), 10);
}

function _wnCtxClose() {
  const ctx = document.getElementById('wn-ctx');
  if (ctx) ctx.style.display = 'none';
}

function _wnSplit(rowId) {
  const row = WNATL.rows.find(r => r.id===rowId);
  if (!row || row.orderIds.length <= 1) return;
  const [first, ...rest] = row.orderIds;
  row.orderIds = [first]; row.groupageId = null;
  rest.forEach(id => {
    WNATL.rows.push({
      id:++WNATL._seq, type:'northsouth', orderId:id, orderIds:[id],
      matchedId:null, groupageId:null,
      truckId:'',trailerId:'',driverId:'',partnerId:'',
      truckLabel:'',trailerLabel:'',driverLabel:'',partnerLabel:'',
      partnerPlates:'',partnerRate:'',saved:false,
    });
  });
  _wnPaint(); toast('Διαχωρίστηκε');
  const allIds = [first, ...rest];
  allIds.forEach(id => atPatch(TABLES.NAT_ORDERS, id, { 'Groupage ID':'' }).catch(()=>{}));
}

/* ── PRINT ───────────────────────────────────────────────────────── */
function _wnPrint(rowId, leg) {
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  const orderId = leg==='northsouth' ? row.orderIds[0] : row.matchedId;
  if (!orderId) { toast('Δεν υπάρχει εντολή για εκτύπωση','warn'); return; }
  const base = 'https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/print.html';
  window.open(`${base}?orderId=${orderId}&leg=${leg==='northsouth'?'export':'import'}`, '_blank');
}
