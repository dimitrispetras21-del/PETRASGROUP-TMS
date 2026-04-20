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
(function() {
'use strict';

const WNATL = {
  week: _wnCurrentWeek(),
  data: { northsouth:[], southnorth:[], trucks:[], trailers:[], drivers:[], partners:[], clients:[], locations:[] },
  rows: [],
  filter: '',
  filterStatus: '',
  _seq: 0,
};

function _wnApplyFilter() {
  const q = (WNATL.filter||'').toLowerCase();
  const fs = WNATL.filterStatus||'';
  document.querySelectorAll('#wn-rows > [data-row-id]').forEach(el => {
    const row = WNATL.rows.find(r => String(r.id) === el.dataset.rowId);
    if (!row) { el.style.display=''; return; }
    let show = true;
    if (q) {
      const blob = [row.truckLabel, row.driverLabel, row.partnerLabel, row.client||''].join(' ').toLowerCase();
      if (!blob.includes(q)) show = false;
    }
    if (show && fs) {
      if (fs === 'pending' && row.saved) show = false;
      else if (fs === 'assigned' && !row.saved) show = false;
    }
    el.style.display = show ? '' : 'none';
  });
}

function _wnPulseRow(rowId) {
  const el = document.getElementById('wn-row-'+rowId);
  if (!el) return;
  const orig = el.style.background;
  el.style.transition = 'background 0.3s';
  el.style.background = 'rgba(16,185,129,0.15)';
  setTimeout(() => { el.style.background = orig; }, 700);
}

// Week number matching Airtable WEEKNUM (Sunday-start)
function _wnCurrentWeek() {
  const d = new Date(), y = d.getFullYear(), j = new Date(y, 0, 1);
  return Math.ceil(((d - j) / 86400000 + j.getDay() + 1) / 7);
}
// Week start (Sunday) for a given week number
function _wnWeekStart(w) {
  const y = new Date().getFullYear(), jan1 = new Date(y, 0, 1);
  const firstSun = new Date(jan1); firstSun.setDate(jan1.getDate() - jan1.getDay());
  const ws = new Date(firstSun); ws.setDate(firstSun.getDate() + (w - 1) * 7);
  return ws;
}

/* ── CSS moved to assets/style.css ── */

/* ── ENTRY POINT ──────────────────────────────────────────────────── */
let _wnLoadId = 0; // prevents stale renders from rapid week switching
async function renderWeeklyNatl() {
  const loadId = ++_wnLoadId;
  document.getElementById('topbarTitle').textContent = `Weekly National — Week ${WNATL.week}`;
  const content = document.getElementById('content');
  content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:80px;color:var(--text-dim)">
    <div class="spinner"></div> Φόρτωση εβδομάδας ${WNATL.week}…</div>`;
  try {
    await _wnLoadAll();
    if (loadId !== _wnLoadId) return;
    _wnBuildRows();
    _wnPaint();
  } catch(e) {
    if (loadId !== _wnLoadId) return; // stale error, ignore
    content.innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα: ${e.message}</div>`;
    console.error('renderWeeklyNatl:', e);
  }
}

/* ── LOAD ALL (assets + orders in parallel) ──────────────────────── */
async function _wnLoadAll() {
  const wStart = _wnWeekStart(WNATL.week);
  const wEnd   = new Date(wStart); wEnd.setDate(wStart.getDate() + 6);
  const fmt    = d => toLocalDate(d);
  const filter = `AND(IS_AFTER({Loading DateTime},'${fmt(new Date(wStart.getTime()-86400000))}'),IS_BEFORE({Loading DateTime},'${fmt(new Date(wEnd.getTime()+86400000))}'))`;

  // Ref data (cached) + orders in parallel
  const [, all] = await Promise.all([
    preloadReferenceData(),
    atGetAll(TABLES.NAT_LOADS, { filterByFormula: filter, fields: [
      'Direction','Loading DateTime','Delivery DateTime','Truck','Trailer','Driver','Partner',
      'Client','Total Pallets','Goods','Status','Source Type','Source Record','Matched Load',
      'Is Partner Trip','Partner Truck Plates','Partner Rate',
      'Pickup Location 1','Pickup Location 2','Pickup Location 3','Pickup Location 4','Pickup Location 5',
      'Delivery Location 1','Delivery Location 2','Delivery Location 3','Delivery Location 4','Delivery Location 5',
    ] }, false),
  ]);

  // Map assets from ref data
  const locs = getRefLocations();
  WNATL.data.trucks    = getRefTrucks().filter(r=>r.fields['Active']).map(r  => ({ id:r.id, label:r.fields['License Plate']||r.id }));
  WNATL.data.trailers  = getRefTrailers().map(r => ({ id:r.id, label:r.fields['License Plate']||r.id }));
  WNATL.data.drivers   = getRefDrivers().filter(r=>r.fields['Active']).map(r  => ({ id:r.id, label:r.fields['Full Name']||r.id }));
  WNATL.data.partners  = getRefPartners().map(r  => ({ id:r.id, label:r.fields['Company Name']||r.id }));
  WNATL.data.clients   = [];
  WNATL.data.locations = locs;

  // Split orders by direction
  WNATL.data.northsouth = all
    .filter(r => r.fields['Direction'] === 'North→South')
    .sort((a,b) => (a.fields['Delivery DateTime']||'').localeCompare(b.fields['Delivery DateTime']||''));
  WNATL.data.southnorth = all
    .filter(r => r.fields['Direction'] === 'South→North')
    .sort((a,b) => (a.fields['Loading DateTime']||'').localeCompare(b.fields['Loading DateTime']||''));
  WNATL.data.clLoads = [];

  // Build location map — use already-fetched locs instead of extra API calls
  WNATL.data._locMap = {};
  locs.forEach(r => { WNATL.data._locMap[r.id] = r.fields.Name||r.fields.City||''; });
}

/* ── BUILD ROWS ──────────────────────────────────────────────────── */
function _wnBuildRow(ord, type) {
  const f = ord.fields;
  const truckId   = (f['Truck']  ||[])[0]||'';
  const trailerId = (f['Trailer']||[])[0]||'';
  const driverId  = (f['Driver'] ||[])[0]||'';
  const partnerId = (f['Partner']||[])[0]||'';
  return {
    id: ++WNATL._seq, type,
    source: f['Source Type'] === 'Groupage' ? 'cl' : undefined,
    orderId: ord.id, orderIds:[ord.id],
    matchedId: f['Matched Load']||null,
    groupageId: null,
    truckId, trailerId, driverId, partnerId,
    truckLabel:   WNATL.data.trucks.find(t=>t.id===truckId)?.label||'',
    trailerLabel: WNATL.data.trailers.find(t=>t.id===trailerId)?.label||'',
    driverLabel:  WNATL.data.drivers.find(d=>d.id===driverId)?.label||'',
    partnerLabel: WNATL.data.partners.find(p=>p.id===partnerId)?.label||'',
    partnerPlates: f['Partner Truck Plates']||'',
    partnerRate:   f['Partner Rate'] ? String(f['Partner Rate']) : '',
    saved: !!(truckId || partnerId),
  };
}

function _wnBuildRows() {
  WNATL.rows = []; WNATL._seq = 0;
  const { northsouth, southnorth } = WNATL.data;

  // ΚΑΘΟΔΟΣ rows
  for (const ord of northsouth) {
    WNATL.rows.push(_wnBuildRow(ord, 'northsouth'));
  }

  // Collect matched S→N ids
  const matchedSN = new Set(WNATL.rows.map(r=>r.matchedId).filter(Boolean));

  // ΑΝΟΔΟΣ rows — skip if already matched to a ΚΑΘΟΔΟΣ row
  for (const ord of southnorth) {
    if (matchedSN.has(ord.id)) continue;
    WNATL.rows.push(_wnBuildRow(ord, 'southnorth'));
  }
}

/* ── PAINT ───────────────────────────────────────────────────────── */

/* ── WEEK SIDEBAR ─────────────────────────────────────── */
function _wnWeekSidebarItems(currentWeek) {
  let html = '';
  for (let w = currentWeek - 8; w <= currentWeek + 12; w++) {
    if (w < 1 || w > 52) continue;
    const isActive = w === currentWeek;
    const wS   = _wnWeekStart(w);
    const wE   = new Date(wS); wE.setDate(wS.getDate() + 6);
    const fmt  = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
    const bg   = isActive ? 'var(--accent,#0EA5E9)' : 'var(--navy-mid,#0B1929)';
    const col  = isActive ? '#fff' : 'rgba(196,207,219,.7)';
    const fw   = isActive ? '700' : '500';
    html += `<div onclick="WNATL.week=${w};renderWeeklyNatl()" style="
      flex-shrink:0;padding:6px 14px;cursor:pointer;border-radius:8px;
      background:${bg};color:${col};
      font-family:'Syne',sans-serif;font-size:12px;font-weight:${fw};
      transition:background .12s;white-space:nowrap;text-align:center;
      border:1px solid ${isActive ? 'transparent' : 'rgba(196,207,219,.12)'};
    " onmouseover="this.style.background='${isActive?'var(--accent,#0EA5E9)':'rgba(14,165,233,.15)'}'"
       onmouseout="this.style.background='${bg}'">
      <div>W${w}</div>
      <div style="font-size:9px;opacity:.7;font-family:'DM Sans',sans-serif;margin-top:1px">${fmt(wS)}–${fmt(wE)}</div>
    </div>`;
  }
  return html;
}

function _wnPaint() {
  const { rows, week, data } = WNATL;
  const nsRows = rows.filter(r => r.type==='northsouth');
  const snRows = rows.filter(r => r.type==='southnorth');
  const assigned = nsRows.filter(r => r.saved).length;
  const pending  = nsRows.filter(r => !r.saved).length;
  const total = nsRows.length + snRows.length;
  const pct = total ? Math.round(assigned / total * 100) : 0;

  // Command Center actions
  const actions=[];
  const _ico = n => (typeof icon === 'function') ? icon(n, 14) : '';
  if (pending > 0) actions.push({icon:_ico('file_text'), sev:'warn', text:`${pending} χωρίς ανάθεση`});
  const missingTruck = rows.filter(r => r.saved && !r.truckId && !r.partnerId).length;
  if (missingTruck > 0) actions.push({icon:_ico('truck'), sev:'warn', text:`${missingTruck} assigned χωρίς truck/partner`});
  const missingDriver = rows.filter(r => r.saved && r.truckId && !r.driverId && !r.partnerId).length;
  if (missingDriver > 0) actions.push({icon:_ico('user'), sev:'warn', text:`${missingDriver} με truck χωρίς driver`});
  if (!actions.length && total > 0 && pct === 100) actions.push({icon:_ico('party'), sev:'ok', text:'Όλα assigned!'});
  else if (!actions.length && total > 0) actions.push({icon:_ico('check'), sev:'ok', text:'No pending actions'});

  const wS   = _wnWeekStart(week);
  const wE   = new Date(wS);  wE.setDate(wS.getDate()+6);
  const fmtD = d => d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  const weekRange = `${fmtD(wS)} – ${fmtD(wE)}`;

  document.getElementById('content').innerHTML = `
    <div style="display:block;width:100%">
    <!-- Horizontal week bar -->
    <div id="wn-week-bar" style="
      display:flex;flex-direction:row;gap:4px;align-items:center;
      overflow-x:auto;padding:0 0 12px 0;
      scrollbar-width:thin;width:100%;
    ">
      ${_wnWeekSidebarItems(week)}
    </div>
    <div style="display:block;width:100%">

      <!-- Command Center (universal component) -->
      ${total>0?(()=>{
        const assignedTruckIds = new Set();
        rows.forEach(r => { if (r.truckId) assignedTruckIds.add(r.truckId); });
        const nsCount = rows.filter(r=>r.type==='northsouth').length;
        const snCount = rows.filter(r=>r.type==='southnorth').length;
        const diff = Math.abs(nsCount - snCount);
        const widgets = [
          widgetFleet(data.trucks || [], assignedTruckIds),
          widgetEmptyLegs(Math.max(0,nsCount-snCount), Math.max(0,snCount-nsCount), diff ? `${diff} unbalanced` : ''),
          `<div id="wn-cc-vswk" style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px"><div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">📊 VS LAST WEEK</div><div style="font-size:11px;opacity:0.5">loading…</div></div>`,
          `<div id="wn-cc-ontime" style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px"><div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">⏱ ON-TIME</div><div style="font-size:11px;opacity:0.5">loading…</div></div>`,
        ];
        return buildCommandCenterHTML({
          title: `COMMAND CENTER · W${week}`,
          pct,
          actions,
          widgets,
        });
      })():''}

      <!-- Search/filter bar -->
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;padding:8px 12px;background:#F8FAFC;border:1px solid var(--border);border-radius:6px">
        <input id="wn-search" type="text" placeholder="🔍 Search client / truck / driver..." oninput="WNATL.filter=this.value.toLowerCase().trim();_wnApplyFilter()" value="${WNATL.filter||''}" style="flex:1;min-width:240px;padding:6px 10px;border:1px solid var(--border);border-radius:4px;font-size:12px">
        <select onchange="WNATL.filterStatus=this.value;_wnApplyFilter()" style="padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px">
          <option value="">All</option>
          <option value="pending" ${WNATL.filterStatus==='pending'?'selected':''}>Pending assignment</option>
          <option value="assigned" ${WNATL.filterStatus==='assigned'?'selected':''}>Assigned</option>
        </select>
        ${WNATL.filter||WNATL.filterStatus?`<button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" onclick="WNATL.filter='';WNATL.filterStatus='';document.getElementById('wn-search').value='';_wnApplyFilter()">Clear</button>`:''}
      </div>

      <div class="page-header" style="margin-bottom:12px">
        <div>
          <div class="page-title">Weekly National</div>
          <div class="page-sub">
            Εβδομάδα ${week} · ${weekRange}
            <span style="margin-left:12px;color:var(--text)">${nsRows.length} κάθοδος</span>
            <span style="margin-left:8px;color:rgba(14,165,233,0.9)">${snRows.length} άνοδος</span>
            <span style="margin-left:8px;color:var(--success)">${assigned} ανατεθειμένα</span>
            <span style="margin-left:4px;color:#E05252">· ${pending} εκκρεμή</span>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="renderWeeklyNatl()">Refresh</button>
        </div>
      </div>

    <div class="wi-wrap" style="overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 180px);">
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
          <span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:#091828;color:#B8C4D0;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0">${snRows.length}</span>
        </div>
      </div>
      <div id="wn-rows">
        ${rows.length ? _wnAllRowsHTML() : `<div class="empty-state" style="padding:60px;text-align:center">
          <div style="font-size:40px;margin-bottom:12px;opacity:0.3">&#9744;</div>
          <p style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">Δεν υπαρχουν εθνικά φορτία W${week}</p>
          <p style="font-size:12px;color:var(--text-dim)">Δημιούργησε National Orders ή ενεργοποίησε Veroia Switch σε International Orders</p></div>`}
      </div>
    </div>

    <div id="wn-ctx"></div>
    <div id="wn-popover"></div>
    </div><!-- /main content -->
    </div><!-- /block wrapper -->
  `;

  window._wnDragging = null;

  // Async: fill "vs last week" + "on-time streak" widgets
  if (total > 0) {
    Promise.all([
      fetchPreviousWeekStats(week, TABLES.NAT_LOADS, true).catch(()=>({total:0,assigned:0})),
      fetchOnTimeStreak(TABLES.ORDERS, week, 8).catch(()=>({currentWeekPct:0,streakWeeks:0})),
    ]).then(([prev, ot]) => {
      const el1 = document.getElementById('wn-cc-vswk');
      if (el1) el1.outerHTML = widgetVsLastWeek(total, prev.total, assigned, prev.assigned);
      const el2 = document.getElementById('wn-cc-ontime');
      if (el2) el2.outerHTML = widgetOnTimeStreak(ot.currentWeekPct, ot.streakWeeks);
    }).catch(e => console.warn('CC async widgets (natl):', e));
  }
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
    const key = toLocalDate(ord?.fields['Delivery DateTime']) || 'zzz';
    const lbl = _wnFmtFull(ord?.fields['Delivery DateTime']||null) || '—';
    if (!dayMap[key]) dayMap[key] = { lbl, ns:[], sn:[] };
    dayMap[key].ns.push(row);
  });

  snRows.forEach(row => {
    const ord = WNATL.data.southnorth.find(r => r.id===row.orderId);
    const dtRaw = ord?.fields['Loading DateTime'] || '';
    const key = toLocalDate(dtRaw) || 'zzz';
    const lbl = _wnFmtFull(dtRaw||null) || '—';
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

  // All rows come from NAT_LOADS — unified lookup
  const allLoads = [...(data.northsouth||[]), ...(data.southnorth||[])];
  const primary = allLoads.find(r=>r.id===row.orderId);
  const f = primary?.fields || {};
  const ords = [primary].filter(Boolean);
  const isGroup = f['Source Type'] === 'Groupage';
  const sn = row.matchedId ? allLoads.find(r=>r.id===row.matchedId) : null;

  // Route — use unified Pickup/Delivery Location fields
  let fromStr, toStr;
  if (isGroup) {
    fromStr = _wnNlPickupSummary(f) || f['Name'] || '—';
    toStr   = 'ΒΕΡΜΙΟΝ ΦΡΕΣ / CROSS-DOCK';
  } else {
    fromStr = _wnNlPickupSummary(f) || '—';
    toStr   = _wnNlDeliverySummary(f) || f['Client'] || '—';
  }

  // Client (plain text in NL)
  const clientLabel = f['Client'] || '';

  // Dates & pallets
  const pals   = f['Total Pallets'] || 0;
  const loadDt = _wnFmt(f['Loading DateTime']);
  const delDt  = _wnFmt(f['Delivery DateTime']) || '—';

  // Classic design — no colored dots on row numbers
  const isPartner = !!(row.partnerLabel || data.partners.find(p=>p.id===row.partnerId)?.label);
  const isCL = row.source === 'cl';
  let sCls = 's-default';

  // Pill
  const pill = _wnPill(row);

  // Matched S→N preview (right column)
  const snCell = sn ? _wnSnInlineCell(sn, row.id) : _wnDragCell(row.id);

  // Badges
  const badges = _wnBadges(f);

  const clBg = isCL ? 'background:rgba(13,148,136,0.04);' : '';
  return `
  <div id="wn-row-${row.id}" data-row-id="${row.id}" class="wi-row ${sCls}"
    style="${clBg}"
    draggable="true"
    ondragstart="_wnDragStart(event,'${row.orderId||primary?.id||''}')">
    <div class="wi-compact" style="cursor:default">
      <div class="wi-cn">
        <span class="wi-num">${i+1}</span>
      </div>
      <div class="wi-ce" oncontextmenu="_wnCtx(event,${row.id})" style="position:relative">
        <div class="wi-route">
          <span class="from">${escapeHtml(fromStr)}</span>
          <span class="sep">→</span>
          <span class="dest">${escapeHtml(toStr)}</span>
          ${isGroup ? `<span class="wi-gr">×${ords.length}</span>` : ''}
        </div>
        <div class="wi-sub">
          ${clientLabel ? `<span style="color:var(--text-mid)">${escapeHtml(clientLabel)}</span><span class="wi-sub-div"></span>` : ''}
          <span>${loadDt} → ${delDt}</span>
          <span class="wi-sub-div"></span>
          <span>${pals} pal</span>
          ${f['Source Type']==='Groupage' ? '<span class="wi-badge wi-b-veroia" style="margin-left:6px">VEROIA</span>' : ''}
          ${badges}
        </div>
      </div>
      <div class="wi-ca-wrap" onclick="event.stopPropagation();_wnOpenPopover(event,${row.id})">
        <button class="wi-side-btn" title="Print"
                onclick="event.stopPropagation();_wnPrint(${row.id},'northsouth')"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="10" height="6" rx="1"/><path d="M5 13H3a1 1 0 01-1-1V8a1 1 0 011-1h14a1 1 0 011 1v4a1 1 0 01-1 1h-2"/><path d="M5 7V3h10v4"/></svg></button>
        <div style="width:240px;display:flex;align-items:center;justify-content:center;padding:4px 0;cursor:pointer">
          ${pill}
        </div>
        <div style="width:30px;flex-shrink:0"></div>
      </div>
      <div class="wi-ci" id="wn-ci-${row.id}"
           onclick="event.stopPropagation()"
           ondragover="event.preventDefault();document.getElementById('wn-ci-${row.id}').classList.add('dh')"
           ondragleave="document.getElementById('wn-ci-${row.id}').classList.remove('dh')"
           ondrop="event.stopPropagation();_wnDropOnRow(event,${row.id})"
           style="position:relative">
        ${snCell}
      </div>
    </div>
  </div>`;
}

/* ── Matched S→N cell (right column when linked) ─────────────────── */
function _wnSnInlineCell(snRec, rowId) {
  const f = snRec.fields;
  const clientLabel = f['Client'] || '';
  const isGroupage = f['Source Type'] === 'Groupage';
  const fromStr  = _wnNlPickupSummary(f) || '—';
  const toStr    = isGroupage
    ? 'ΒΕΡΜΙΟΝ ΦΡΕΣ / CROSS-DOCK'
    : (_wnNlDeliverySummary(f) || clientLabel || '—');
  const loadDt   = _wnFmt(f['Loading DateTime']);
  const pals     = f['Total Pallets']||0;
  return `<div class="wi-ci-data">
    <div style="display:flex;align-items:center;gap:0;min-width:0">
      <span class="wi-ci-from" style="color:rgba(14,165,233,0.85)">${escapeHtml(fromStr)}</span>
      <span class="wi-ci-sep">→</span>
      <span class="wi-ci-dest" style="color:rgba(14,165,233,0.85)">${escapeHtml(toStr)}</span>
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

  // Client is plain text in NAT_LOADS
  const clientLabel = f['Client'] || '';
  // S→N: Groupage = pickup from suppliers → Veroia; Direct = pickup summary
  const isGroupage = f['Source Type'] === 'Groupage';
  const fromStr     = isGroupage
    ? (_wnNlPickupSummary(f) || f['Name'] || '—')
    : (_wnNlPickupSummary(f) || '—');
  const toStr = isGroupage
    ? 'ΒΕΡΜΙΟΝ ΦΡΕΣ / CROSS-DOCK'
    : (_wnNlDeliverySummary(f) || clientLabel || '—');
  const pals        = f['Total Pallets']||0;
  const loadDt      = _wnFmt(f['Loading DateTime']);
  const delDt       = _wnFmt(f['Delivery DateTime']);
  const badges      = _wnBadges(f);
  const pill        = _wnPill(row);

  // Classic design — no colored dots
  const isPartnerSN = !!(row.partnerLabel || WNATL.data.partners.find(p=>p.id===row.partnerId)?.label);
  const isCLsn = row.source === 'cl';
  let sClsSN = 's-default';

  const clBgSN = isCLsn ? 'background:rgba(13,148,136,0.04);' : '';
  return `<div id="wn-sn-${ord.id}"
    class="wi-row ${sClsSN}"
    style="${clBgSN}"
    draggable="true"
    ondragstart="_wnDragStart(event,'${ord.id}')"
    oncontextmenu="_wnCtxSn(event,${row.id},'${ord.id}')">
    <div class="wi-compact" style="cursor:default">
      <div class="wi-cn">
        <span style="font-size:7px;color:rgba(14,165,233,0.55);font-weight:800;letter-spacing:.5px">ΑΝΟ</span>
      </div>
      <div class="wi-ce" style="background:#172C45"></div>
      <div class="wi-ca-wrap" onclick="event.stopPropagation();_wnOpenSnPopover(event,'${ord.id}',${row.id})">
        <div style="width:30px;flex-shrink:0"></div>
        <div style="width:240px;display:flex;align-items:center;justify-content:center;padding:4px 0;cursor:pointer">
          ${pill}
        </div>
        <button class="wi-side-btn" title="Print"
          onclick="event.stopPropagation();_wnPrintSn('${ord.id}')"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="10" height="6" rx="1"/><path d="M5 13H3a1 1 0 01-1-1V8a1 1 0 011-1h14a1 1 0 011 1v4a1 1 0 01-1 1h-2"/><path d="M5 7V3h10v4"/></svg></button>
      </div>
      <div class="wi-ci" style="cursor:grab">
        <div class="wi-ci-data">
          <div style="display:flex;align-items:center;gap:0;min-width:0">
            <span class="wi-ci-from" style="font-weight:700">${escapeHtml(fromStr)}</span>
            <span class="wi-ci-sep">→</span>
            <span class="wi-ci-dest" style="font-weight:700">${escapeHtml(toStr)}</span>
          </div>
          <div class="wi-sub">
            ${clientLabel ? `<span style="color:var(--text-mid)">${escapeHtml(clientLabel)}</span><span class="wi-sub-div"></span>` : ''}
            <span>${loadDt} → ${delDt} · ${pals} pal</span>
            ${f['Source Type']==='Groupage' ? '<span class="wi-badge wi-b-veroia" style="margin-left:6px">VEROIA</span>' : ''}
            ${badges}
          </div>
          <div style="font-size:9px;color:rgba(14,165,233,0.3);margin-top:2px;font-style:italic">↕ drag για σύνδεση</div>
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

// NL location summaries using _locMap
function _wnNlPickupSummary(f) {
  const locs = [];
  for (let i = 1; i <= 10; i++) {
    const arr = f[`Pickup Location ${i}`];
    if (!arr?.length) continue;
    const locId = arr[0]?.id || arr[0];
    const name = WNATL.data._locMap?.[locId] || _wnLocName(locId);
    if (name) locs.push(name.split(',')[0]);
  }
  return locs.join(' / ') || '';
}

function _wnNlDeliverySummary(f) {
  const locs = [];
  for (let i = 1; i <= 10; i++) {
    const arr = f[`Delivery Location ${i}`];
    if (!arr?.length) continue;
    const locId = arr[0]?.id || arr[0];
    const name = WNATL.data._locMap?.[locId] || _wnLocName(locId);
    if (name) locs.push(name.split(',')[0]);
  }
  return locs.join(' / ') || '';
}

function _wnClientLabel(clientId) {
  if (!clientId) return '';
  return WNATL.data.clients.find(c => c.id===clientId)?.label || '';
}

function _wnFmt(s) {
  if (!s) return '—';
  try { const p=toLocalDate(s).split('-'); return `${p[2]}/${p[1]}`; }
  catch { return s; }
}

function _wnFmtFull(s) {
  if (!s) return null;
  try {
    const dateOnly = toLocalDate(s);
    const d = new Date(dateOnly+'T12:00:00');
    if (isNaN(d.getTime())) return s;
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
  if (f['Source Type']==='Groupage') b.push('<span class="wi-badge wi-b-grpg">GRP</span>');
  return b.join('');
}

function _wnPill(row) {
  const { data } = WNATL;
  const truck   = row.truckLabel   || data.trucks.find(t=>t.id===row.truckId)?.label||'';
  const trailer = row.trailerLabel || data.trailers.find(t=>t.id===row.trailerId)?.label||'';
  const driver  = row.driverLabel  || data.drivers.find(d=>d.id===row.driverId)?.label||'';
  const partner = row.partnerLabel || data.partners.find(p=>p.id===row.partnerId)?.label||'';
  const isCL    = row.source === 'cl';

  if (!row.saved) return `<div class="wi-pill">
    <div class="wi-card wi-card-un"><div class="wi-card-top">— Αδιάθετο</div></div>
  </div>`;
  if (partner) return `<div class="wi-pill">
    <div class="wi-card ${isCL ? 'wi-card-cl' : 'wi-card-bp'}">
      <div class="wi-card-top">${escapeHtml(partner.slice(0,26))}${partner.length>26?'…':''}</div>
      ${row.partnerPlates ? `<div class="wi-card-bot">${escapeHtml(row.partnerPlates)}</div>` : ''}
    </div>
  </div>`;
  const vehicleLine = truck && trailer ? `${truck} · ${trailer}` : (truck || trailer || '—');
  return `<div class="wi-pill">
    <div class="wi-card ${isCL ? 'wi-card-cl' : 'wi-card-ok'}">
      <div class="wi-card-top">${escapeHtml(vehicleLine)}</div>
      ${driver ? `<div class="wi-card-bot">${escapeHtml(driver)}</div>` : ''}
    </div>
  </div>`;
}

function _wnNavWeek(d) {
  WNATL.week = Math.max(1, Math.min(53, WNATL.week + d));
  renderWeeklyNatl();
}

/* ── DRAG & DROP ─────────────────────────────────────────────────── */
window._wnDragging = null;

function _wnDragStart(e, snId) {
  // Block drag if S→N is already matched to a N→S row
  const snRow = WNATL.rows.find(r => r.type==='southnorth' && r.orderId===snId);
  if (!snRow) {
    // Also check if this snId is already used as matchedId in any N→S row
    const alreadyMatched = WNATL.rows.find(r => r.type==='northsouth' && r.matchedId===snId);
    if (alreadyMatched) { e.preventDefault(); toast('Πρέπει πρώτα να αφαιρεθεί η αντιστοίχιση', 'warn'); return; }
  }
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
    const r1 = await atSafePatch(TABLES.NAT_LOADS, row.orderIds[0], { 'Matched Load': snId });
    if(r1?.conflict){ toast('Record modified by another user — refreshing','warn'); await renderWeeklyNatl(); return; }
    const r2 = await atSafePatch(TABLES.NAT_LOADS, snId, { 'Matched Load': row.orderIds[0] });
    if(r2?.conflict){ toast('Record modified by another user — refreshing','warn'); await renderWeeklyNatl(); return; }
    toast('Σύνδεση αποθηκεύτηκε ✓');
  } catch(err) { toast('Σφάλμα σύνδεσης: '+err.message, 'warn'); }
}

async function _wnUnmatch(rowId, snId) {
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  const snOrd = WNATL.data.southnorth.find(r => r.id===snId);
  row.matchedId = null;
  if (snOrd) {
    WNATL.rows.push(_wnBuildRow(snOrd, 'southnorth'));
  }
  _wnPaint();
  try {
    await atSafePatch(TABLES.NAT_LOADS, row.orderIds[0], { 'Matched Load': '' });
    await atSafePatch(TABLES.NAT_LOADS, snId, { 'Matched Load': '' });
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

  const _el = e.currentTarget || e.target || document.body;
  const rect = _el.getBoundingClientRect ? _el.getBoundingClientRect() : {left:200,bottom:200,top:200};
  const popW=480, popH=320;
  let left = rect.left - 10;
  let top  = rect.bottom + 6;
  if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  if (top + popH  > window.innerHeight - 12) top = rect.top - popH - 6;
  if (top < 10) top = 10;
  Object.assign(pop.style, { display:'block', left:`${Math.max(10,left)}px`, top:`${top}px` });
  setTimeout(() => document.addEventListener('click', _wnPopoverOutside, { capture:true }), 10);
}

function _wnOpenSnPopover(e, snId, rowId) {
  // Find the standalone S→N row object
  const row = WNATL.rows.find(r => r.type==='southnorth' && r.orderId===snId);
  if (row) {
    _wnOpenPopover(e, row.id);
  } else {
    // fallback: open N→S popover
    _wnOpenPopover(e, rowId);
  }
}

function _wnPrintSn(orderId) {
  if (!orderId) { toast('Δεν υπάρχει εντολή για εκτύπωση','warn'); return; }
  const base = 'https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/print.html';
  window.open(`${base}?orderId=${orderId}&leg=import`, '_blank');
}

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
  if (isPartner && !row.partnerRate) { toast('Το Κόμιστρο είναι υποχρεωτικό για Συνεργάτη', 'warn'); return; }

  const btn  = document.getElementById(`wn-pop-btn-${rowId}`);
  const spin = document.getElementById(`wn-pop-spin-${rowId}`);
  if (btn)  { btn.disabled=true; if(spin) spin.style.display='block'; }

  const fields = isPartner
    ? { 'Partner':[row.partnerId], 'Is Partner Trip':true,
        'Partner Truck Plates':row.partnerPlates||'',
        'Partner Rate':row.partnerRate?parseFloat(row.partnerRate):null,
        'Status':'Assigned',
        'Truck':[],'Trailer':[],'Driver':[] }
    : { 'Truck':[row.truckId],
        'Trailer':row.trailerId?[row.trailerId]:[],
        'Driver': row.driverId?[row.driverId]:[],
        'Is Partner Trip':false,'Status':'Assigned','Partner':[],'Partner Truck Plates':'' };

  const errors = [];
  for (const orderId of row.orderIds) {
    try {
      // All rows are now in NAT_LOADS
      const res = await atSafePatch(TABLES.NAT_LOADS, orderId, fields);
      if (res?.conflict) { toast('Record modified by another user — refreshing','warn'); await renderWeeklyNatl(); return; }
      if (res?.error) throw new Error(res.error.message||res.error.type);
    } catch(err) { errors.push(err.message); }
  }
  if (row.matchedId) {
    try {
      const res = await atSafePatch(TABLES.NAT_LOADS, row.matchedId, fields);
      if (res?.conflict) { toast('Record modified by another user — refreshing','warn'); await renderWeeklyNatl(); return; }
      if (res?.error) throw new Error(res.error.message||res.error.type);
    } catch(err) { errors.push('Άνοδος: '+err.message); }
  }

  if (btn) { btn.disabled=false; if(spin) spin.style.display='none'; }
  if (errors.length) { toast('Σφάλμα: '+errors[0].slice(0,60), 'warn'); return; }

  row.saved = true;
  // Also update source NAT_ORDER status to Assigned
  try {
    for (const orderId of row.orderIds) {
      const nlRec = WNATL.data.southnorth.concat(WNATL.data.northsouth).find(r=>r.id===orderId);
      const srcId = nlRec?.fields?.['Source Record'];
      if (srcId) {
        await atSafePatch(TABLES.NAT_ORDERS, srcId, { 'Status': 'Assigned' });
        if (typeof syncOrderDownstream === 'function') {
          syncOrderDownstream(srcId, { source: 'natl', changedFields: ['Status'], skipVS: true, skipGRP: true, skipRamp: true, skipPL: true })
            .catch(e => console.warn('[wn assigned sync]', e));
        }
      }
    }
  } catch(e) { console.warn('NO status sync:', e); }

  // PARTNER ASSIGNMENT sync (one PA record per NAT_LOAD)
  try {
    const allLoadIds = [...row.orderIds];
    if (row.matchedId) allLoadIds.push(row.matchedId);
    if (isPartner) {
      const rate = row.partnerRate ? parseFloat(row.partnerRate) : null;
      for (const loadId of allLoadIds) {
        await paUpsert({ parentType:'nat_load', parentId:loadId, partnerId:row.partnerId, rate, status:'Assigned' });
      }
    } else {
      for (const loadId of allLoadIds) {
        await paDelete({ parentType:'nat_load', parentId:loadId });
      }
    }
  } catch(e) { console.warn('NAT PA sync:', e.message); }

  invalidateCache(TABLES.NAT_LOADS);
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
      const res = await atSafePatch(TABLES.NAT_LOADS, orderId,
        { 'Truck':[],'Trailer':[],'Driver':[],'Partner':[],'Is Partner Trip':false,'Partner Truck Plates':'' });
      if (res?.conflict) { toast('Record modified by another user — refreshing','warn'); await renderWeeklyNatl(); return; }
    } catch(e) { toast('Σφάλμα εκκαθάρισης','warn'); return; }
  }
  // Delete PA records for cleared loads
  try {
    for (const loadId of row.orderIds) {
      await paDelete({ parentType:'nat_load', parentId:loadId });
    }
  } catch(e) { console.warn('NAT PA delete:', e.message); }

  Object.assign(row, { truckId:'',trailerId:'',driverId:'',partnerId:'',
    truckLabel:'',trailerLabel:'',driverLabel:'',partnerLabel:'',
    partnerPlates:'',partnerRate:'',saved:false });
  invalidateCache(TABLES.NAT_LOADS);
  toast('Εκκαθαρίστηκε');
}

/* ── CONTEXT MENU (right-click for groupage) ─────────────────────── */
function _wnCtx(e, rowId) {
  e.preventDefault(); e.stopPropagation();
  const row = WNATL.rows.find(r => r.id===rowId);
  const ctx = document.getElementById('wn-ctx');
  const items = [];
  items.push(`<div class="wi-ctx-item" onclick="_wnCtxClose();_wnOpenPopover({stopPropagation:()=>{},currentTarget:document.getElementById('wn-row-${rowId}')},${rowId})">Ανάθεση</div>`);
  if (row?.saved)
    items.push(`<div class="wi-ctx-item wi-ctx-danger" onclick="_wnCtxClose();_wnUnassign(${rowId})">Αφαίρεση ανάθεσης</div>`);
  if (row?.matchedId)
    items.push(`<div class="wi-ctx-item wi-ctx-danger" onclick="_wnCtxClose();_wnUnmatch(${rowId},'${row.matchedId}')">Αφαίρεση import</div>`);
  ctx.innerHTML = items.join('');
  // Position — flip up if near bottom (fixed positioning uses clientX/Y)
  const menuH = items.length * 36 + 16;
  const spaceBelow = window.innerHeight - e.clientY;
  const top = spaceBelow < menuH ? (e.clientY - menuH) : e.clientY;
  const left = Math.min(e.clientX, window.innerWidth - 200);
  Object.assign(ctx.style, { display:'block', left:`${left}px`, top:`${Math.max(10, top)}px` });
  setTimeout(() => document.addEventListener('click', _wnCtxClose, { once:true }), 10);
}

function _wnCtxClose() {
  const ctx = document.getElementById('wn-ctx');
  if (ctx) ctx.style.display = 'none';
}

function _wnCtxSn(e, rowId, snId) {
  e.preventDefault(); e.stopPropagation();
  const row = WNATL.rows.find(r => r.id===rowId);
  const ctx = document.getElementById('wn-ctx');
  const items = [];
  items.push(`<div class="wi-ctx-item" onclick="_wnCtxClose();_wnOpenSnPopover({stopPropagation:()=>{},currentTarget:document.getElementById('wn-sn-${snId}')},\'${snId}\',${rowId})">Ανάθεση</div>`);
  if (row?.saved)
    items.push(`<div class="wi-ctx-item wi-ctx-danger" onclick="_wnCtxClose();_wnUnassignSn(${rowId},'${snId}')">Αφαίρεση ανάθεσης</div>`);
  ctx.innerHTML = items.join('');
  const menuH = items.length * 36 + 16;
  const spaceBelow = window.innerHeight - e.clientY;
  const top = spaceBelow < menuH ? (e.clientY - menuH) : e.clientY;
  const left = Math.min(e.clientX, window.innerWidth - 200);
  Object.assign(ctx.style, { display:'block', left:`${left}px`, top:`${Math.max(10, top)}px` });
  setTimeout(() => document.addEventListener('click', _wnCtxClose, { once:true }), 10);
}

async function _wnUnassignSn(rowId, snId) {
  const row = WNATL.rows.find(r => r.id===rowId);
  if (!row) return;
  if (!confirm('Αφαίρεση ανάθεσης;')) return;

  const fields = {
    'Truck': [], 'Trailer': [], 'Driver': [],
    'Partner': [], 'Is Partner Trip': false,
    'Partner Truck Plates': '', 'Partner Rate': null,
    'Status': 'Pending'
  };

  try {
    const res = await atSafePatch(TABLES.NAT_LOADS, snId, fields);
    if (res?.conflict) { toast('Record modified by another user — refreshing','warn'); await renderWeeklyNatl(); return; }
  } catch(err) { toast('Σφάλμα: ' + err.message, 'warn'); return; }

  // Delete PA record for this NAT_LOAD
  try { await paDelete({ parentType:'nat_load', parentId:snId }); }
  catch(e) { console.warn('PA delete:', e.message); }

  row.saved = false;
  row.truckId = ''; row.truckLabel = '';
  row.trailerId = ''; row.trailerLabel = '';
  row.driverId = ''; row.driverLabel = '';
  row.partnerId = ''; row.partnerLabel = '';
  row.partnerPlates = ''; row.partnerRate = '';

  invalidateCache(TABLES.NAT_LOADS);
  toast('Ανάθεση αφαιρέθηκε');
  _wnPaint();
}

async function _wnUnassign(rowId) {
  const row = WNATL.rows.find(r => r.id===rowId);
  if (!row) return;
  if (!confirm('Αφαίρεση ανάθεσης;')) return;

  const fields = {
    'Truck': [], 'Trailer': [], 'Driver': [],
    'Partner': [], 'Is Partner Trip': false,
    'Partner Truck Plates': '', 'Partner Rate': null,
    'Status': 'Pending'
  };

  const errors = [];
  for (const orderId of row.orderIds) {
    try {
      const res = await atSafePatch(TABLES.NAT_LOADS, orderId, fields);
      if (res?.conflict) { toast('Record modified by another user — refreshing','warn'); await renderWeeklyNatl(); return; }
      if (res?.error) throw new Error(res.error.message || res.error.type);
    } catch(err) { errors.push(err.message); }
  }
  // Also unassign matched S→N if exists
  if (row.matchedId) {
    try {
      await atSafePatch(TABLES.NAT_LOADS, row.matchedId, fields);
    } catch(err) { errors.push(err.message); }
  }

  if (errors.length) { toast('Σφάλμα: ' + errors[0].slice(0, 60), 'warn'); return; }

  // Reset row state
  row.saved = false;
  row.truckId = ''; row.truckLabel = '';
  row.trailerId = ''; row.trailerLabel = '';
  row.driverId = ''; row.driverLabel = '';
  row.partnerId = ''; row.partnerLabel = '';
  row.partnerPlates = ''; row.partnerRate = '';

  invalidateCache(TABLES.NAT_LOADS);
  toast('Ανάθεση αφαιρέθηκε');
  _wnPaint();
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
  // Use safe patch + central sync; Groupage ID clear unlinks these orders from GRP chain
  for (const id of allIds) {
    atSafePatch(TABLES.NAT_ORDERS, id, { 'Groupage ID':'' })
      .then(() => {
        if (typeof syncOrderDownstream === 'function') {
          return syncOrderDownstream(id, { source: 'natl', changedFields: ['Groupage ID'], skipPA: true, skipRamp: true });
        }
      })
      .catch(e => { console.warn('Groupage clear:', e); if (typeof logError === 'function') logError(e, '_wnSplit groupage clear'); });
  }
}

/* ── PRINT ───────────────────────────────────────────────────────── */
function _wnPrint(rowId, leg) {
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  const orderId = leg==='northsouth' ? row.orderIds[0] : row.matchedId;
  if (!orderId) { toast('Δεν υπάρχει εντολή για εκτύπωση','warn'); return; }
  const base = 'https://dimitrispetras21-del.github.io/PETRASGROUP-TMS/print.html';
  window.open(`${base}?orderId=${orderId}&leg=${leg==='northsouth'?'export':'import'}`, '_blank');
}

// Expose functions used from onclick/oninput/onfocus handlers
window.renderWeeklyNatl = renderWeeklyNatl;
window.WNATL = WNATL;
window._wnOpenPopover = _wnOpenPopover;
window._wnOpenSnPopover = _wnOpenSnPopover;
window._wnClosePopover = _wnClosePopover;
window._wnSaveFromPopover = _wnSaveFromPopover;
window._wnClear = _wnClear;
window._wnPrint = _wnPrint;
window._wnPrintSn = _wnPrintSn;
window._wnUnmatch = _wnUnmatch;
window._wnCtxClose = _wnCtxClose;
window._wnCtx = _wnCtx;
window._wnCtxSn = _wnCtxSn;
window._wnUnassign = _wnUnassign;
window._wnUnassignSn = _wnUnassignSn;
window._wnDragStart = _wnDragStart;
window._wnDropOnRow = _wnDropOnRow;
window._wnSplit = _wnSplit;
window._wnNavWeek = _wnNavWeek;
window._wnApplyFilter = _wnApplyFilter;
window._wnPulseRow = _wnPulseRow;
})();
