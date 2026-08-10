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
      // WN-1β: visible ΑΝΟΔΟΣ rows are the unmatched ones by construction
      else if (fs === 'unmatched' && row.type !== 'southnorth') show = false;
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
    content.innerHTML = `<div style="color:var(--danger);padding:40px">Σφάλμα φόρτωσης σελίδας</div>`;
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
      // Φ1 (Α3): ζητούσε 1..5 ενώ ο renderer κάνει loop 1..10 (_wnNlPickupSummary /
      // _wnNlDeliverySummary) και ο Worker σερβίρει 1..10. Φορτίο με 6+ σημεία
      // εμφανιζόταν κομμένο ΣΙΩΠΗΛΑ — καμία ένδειξη ότι λείπουν στάσεις.
      'Pickup Location 1','Pickup Location 2','Pickup Location 3','Pickup Location 4','Pickup Location 5',
      'Pickup Location 6','Pickup Location 7','Pickup Location 8','Pickup Location 9','Pickup Location 10',
      'Delivery Location 1','Delivery Location 2','Delivery Location 3','Delivery Location 4','Delivery Location 5',
      'Delivery Location 6','Delivery Location 7','Delivery Location 8','Delivery Location 9','Delivery Location 10',
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

/* ── Φέτα 1β: sheet tabs, δίδυμο του _wk3Tabs του intl ────────────── */
function _wnTabs(cur) {
  const today = _wnCurrentWeek();
  const step = d => `<button type="button" class="wk3-step" title="${d<0?'Προηγούμενη':'Επόμενη'} εβδομάδα" onclick="WNATL.week=${cur+d};renderWeeklyNatl()">${d<0?'‹':'›'}</button>`;
  const fmt  = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
  let html = step(-1);
  for (let w = cur-3; w <= cur+3; w++) {
    if (w < 1 || w > 53) continue;
    const wS = _wnWeekStart(w), wE = new Date(wS); wE.setDate(wS.getDate()+6);
    html += `<button type="button" class="wk3-tab${w===cur?' on':''}" title="${fmt(wS)}–${fmt(wE)}" onclick="WNATL.week=${w};renderWeeklyNatl()">W${w}</button>`;
  }
  html += step(1);
  if (cur !== today)
    html += `<button type="button" class="wk3-tab" style="color:var(--accent)" onclick="WNATL.week=${today};renderWeeklyNatl()">Σήμερα</button>`;
  return html;
}

function _wnPaint() {
  const { rows, week, data } = WNATL;
  const _wnI = (n, s) => (typeof icon === 'function') ? icon(n, s || 14) : '';
  const nsRows = rows.filter(r => r.type==='northsouth');
  const snRows = rows.filter(r => r.type==='southnorth');
  const assigned = nsRows.filter(r => r.saved).length;
  const pending  = nsRows.filter(r => !r.saved).length;
  const total = nsRows.length + snRows.length;
  const pct = total ? Math.round(assigned / total * 100) : 0;

  // Same reporting contract as weekly_intl: weekNumberDefault comes from
  // _wnCurrentWeek(), the Sunday-start formula this planner still carries, so
  // the audit can see it drift from canonical isoWeekNumber().
  if (typeof reportPageMetrics === 'function') reportPageMetrics('weekly_natl', {
    weekNumber: week,
    weekNumberDefault: _wnCurrentWeek(),
    kathodos: nsRows.length,
    anodos: snRows.length,
    assigned,
    pending,
    completionPct: pct,
  });

  // Command Center actions
  const actions=[];
  const _ico = n => (typeof icon === 'function') ? icon(n, 14) : '';
  // Π4 (Wave 1): chips jump to the first row needing the action (twin of intl).
  // ns rows render as #wn-row-<id>, standalone ΑΝΟΔΟΣ rows as #wn-sn-<orderId>.
  const _rowElId = r => r.type==='southnorth' ? 'wn-sn-'+r.orderId : 'wn-row-'+r.id;
  const _firstRow = (pred) => { const r = rows.find(pred); return r ? _rowElId(r) : undefined; };
  if (pending > 0) actions.push({icon:_ico('file_text'), sev:'warn', text:`${pending} χωρίς ανάθεση`, scrollTo:_firstRow(r=>r.type==='northsouth'&&!r.saved)});
  const missingTruck = rows.filter(r => r.saved && !r.truckId && !r.partnerId).length;
  if (missingTruck > 0) actions.push({icon:_ico('truck'), sev:'warn', text:`${missingTruck} assigned χωρίς truck/partner`, scrollTo:_firstRow(r=>r.saved && !r.truckId && !r.partnerId)});
  const missingDriver = rows.filter(r => r.saved && r.truckId && !r.driverId && !r.partnerId).length;
  if (missingDriver > 0) actions.push({icon:_ico('user'), sev:'warn', text:`${missingDriver} με truck χωρίς driver`, scrollTo:_firstRow(r=>r.saved && r.truckId && !r.driverId && !r.partnerId)});
  if (!actions.length && total > 0 && pct === 100) actions.push({icon:_ico('party'), sev:'ok', text:'Όλα assigned!'});
  else if (!actions.length && total > 0) actions.push({icon:_ico('check'), sev:'ok', text:'No pending actions'});

  const wS   = _wnWeekStart(week);
  const wE   = new Date(wS);  wE.setDate(wS.getDate()+6);
  const fmtD = d => d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  const weekRange = `${fmtD(wS)} – ${fmtD(wE)}`;

  document.getElementById('content').innerHTML = `
    <div class="wn3 wk3 ${_wnQuietOn()?'wi-quiet':''}" style="display:block;width:100%">
    <!-- Φέτα 1β: κεφαλή v3 — sheet tabs + tally μίας γραμμής, ίδια με το intl.
         Αντικαθιστά τη λωρίδα εβδομάδας και το page-header: η ίδια πληροφορία,
         ΜΙΑ φορά, κλικ = μετάβαση. -->
    <div class="wk3-mast">
      <nav class="wk3-tabs" aria-label="Εβδομάδες">${_wnTabs(week)}</nav>
      ${typeof weekPhaseBadge==='function'?weekPhaseBadge(week,_wnCurrentWeek()):''}
      <div class="wk3-tally">
        <span class="wk3-t"><b>${nsRows.length}</b> κάθοδος</span>
        <span class="wk3-t"><b>${snRows.length}</b> άνοδος</span>
        <span class="wk3-t" title="${assigned} από ${total} με ανάθεση"><b>${assigned}</b>/${total} ανατεθ.</span>
        ${pending>0?`<button class="wk3-t alert" title="Κάθοδοι χωρίς ανάθεση — κλικ: πήγαινε στην πρώτη" onclick="${(()=>{const id=_firstRow(r=>r.type==='northsouth'&&!r.saved);return id?`_ccJump('${id}')`:'';})()}"><b>${pending}</b> εκκρεμή</button>`:''}
        <span id="wn-pickups-q"></span>
        <div class="wk3-acts">
          <button class="wk3-ab" onclick="_wnToggleDetails()" title="Πρόσθετες ενδείξεις γραμμής">${_wnI('eye',13)} Λεπτομέρειες${_wnQuietOn()?'':' ✓'}</button>
          <button class="wk3-ab" onclick="_wnPrintWeek()">${_wnI('file_text',13)} Εκτύπωση</button>
          <button class="wk3-ab" onclick="_wnExportCSV()">CSV</button>
          <button class="wk3-ab" onclick="renderWeeklyNatl()" title="Ανανέωση">${_wnI('refresh',13)}</button>
        </div>
      </div>
    </div>
    <div style="display:block;width:100%">

      <!-- Command Center — WN-1 (Wave 1): always shown, collapsible, same
           pattern and same localStorage key as the intl twin so the two pages
           behave identically. -->
      ${(()=>{
        const assignedTruckIds = new Set();
        rows.forEach(r => { if (r.truckId) assignedTruckIds.add(r.truckId); });
        // Π5α (Wave 1): real unmatched counts — ΚΑΘΟΔΟΣ rows with no matched
        // ΑΝΟΔΟΣ, and every visible ΑΝΟΔΟΣ row (matched ones are absorbed
        // into their pair). The old nsCount-snCount diff hid same-day pairs.
        const nsUnmatched = rows.filter(r=>r.type==='northsouth' && !r.matchedId).length;
        const snUnmatched = rows.filter(r=>r.type==='southnorth').length;
        const widgets = [
          widgetFleet(data.trucks || [], assignedTruckIds),
          widgetEmptyLegs(nsUnmatched, snUnmatched, ''),
          `<div id="wn-cc-vswk" style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px"><div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">${_wnI('bar_chart',11)} ΣΕ ΣΧΕΣΗ ΜΕ ΠΡΟΗΓΟΥΜΕΝΗ</div><div style="font-size:11px;opacity:0.5">loading…</div></div>`,
          // Π5β (Wave 1): on-time hidden for current/past weeks (recording is
          // broken — real ~100%, recorded 16%, 00 §Β7); static note on future.
          ...(week > _wnCurrentWeek() ? [
            `<div style="background:rgba(255,255,255,0.07);padding:10px 12px;border-radius:6px"><div style="font-size:10px;opacity:0.7;letter-spacing:0.5px;margin-bottom:4px">${_wnI('clock',11)} ΣΥΝΕΠΕΙΑ ΠΑΡΑΔΟΣΗΣ</div><div style="display:flex;align-items:baseline;gap:6px"><span style="font-size:18px;font-weight:700;font-family:'Syne',sans-serif;opacity:.55">—</span><span style="font-size:11px;opacity:0.6">δεν έχει ξεκινήσει</span></div></div>`,
          ] : []),
        ];
        const ccActions = total > 0 ? actions : [{icon:_wnI('info'), sev:'ok', text:'Κανένα εθνικό φορτίο για αυτή την εβδομάδα ακόμη'}];
        const open = localStorage.getItem('tms_cc_open') !== '0';
        return `<details ${open ? 'open' : ''} ontoggle="localStorage.setItem('tms_cc_open', this.open ? '1' : '0')" style="margin-bottom:var(--space-3)">
          <summary style="cursor:pointer;list-style:none;height:44px;display:flex;align-items:center;gap:12px;padding:0 14px;background:var(--navy-mid);color:#C4CFDB;border-radius:8px;font-size:12px">
            <span style="font-family:'Syne',sans-serif;font-weight:700;letter-spacing:1px">COMMAND CENTER · W${week}</span>
            <span style="opacity:.7">${nsRows.length} κάθοδος · ${snRows.length} άνοδος · ${pct}% ολοκληρωμένο</span>
            <span style="margin-left:auto;opacity:.5">▾</span>
          </summary>
          ${buildCommandCenterHTML({ title: `COMMAND CENTER · W${week}`, pct, actions: ccActions, widgets })}
        </details>`;
      })()}

      <!-- Search/filter bar — wk3-sub, twin του intl -->
      <div class="wk3-sub">
        <div class="entity-search-wrap">
          ${_wnI('search')}
          <input id="wn-search" class="entity-search-input" type="text" placeholder="Αναζήτηση πελάτη / φορτηγού / οδηγού…" oninput="WNATL.filter=this.value.toLowerCase().trim();_wnApplyFilter()" value="${WNATL.filter||''}">
        </div>
        <!-- WN-1β (Wave 1): «Χωρίς ταίριασμα» filter, twin of intl «unmatched».
             Labels ελληνικά (WI-3 pattern) — values ΑΜΕΤΑΒΛΗΤΑ (_wnApplyFilter). -->
        <select class="svc-filter" onchange="WNATL.filterStatus=this.value;_wnApplyFilter()">
          <option value="">Όλες οι καταστάσεις</option>
          <option value="pending" ${WNATL.filterStatus==='pending'?'selected':''}>Χωρίς ανάθεση</option>
          <option value="assigned" ${WNATL.filterStatus==='assigned'?'selected':''}>Ανατεθειμένα</option>
          <option value="unmatched" ${WNATL.filterStatus==='unmatched'?'selected':''}>Άνοδοι χωρίς ταίριασμα</option>
        </select>
        ${WNATL.filter||WNATL.filterStatus?`<button class="btn btn-ghost btn-sm" onclick="WNATL.filter='';WNATL.filterStatus='';document.getElementById('wn-search').value='';_wnApplyFilter()">${_wnI('x', 12)} Καθαρισμός</button>`:''}
        <span class="wk3-range">Weekly National · Εβδομάδα ${week} · ${weekRange}</span>
      </div>

    <div class="wk3-wrap">
      <main class="wk3-sheet">
        <div class="wk3-cols">
          <div class="c"></div>
          <div class="c cm">ΚΑΘΟΔΟΣ <span class="n">${nsRows.length}</span></div>
          <div class="c cm" style="justify-content:center">ΑΝΑΘΕΣΗ</div>
          <div class="c cm">ΑΝΟΔΟΣ <span class="n">${snRows.length}</span><span class="hint" title="Σύρε μια άνοδο πάνω σε κάθοδο για ταίριασμα σε round trip">ⓘ</span></div>
        </div>
        <div id="wn-rows">
          ${rows.length ? _wnAllRowsHTML() : (typeof showEmpty === 'function' ? showEmpty({
            illustration: 'truck',
            title: `Δεν υπάρχουν εθνικά φορτία για την εβδομάδα ${week}`,
            description: 'Δημιούργησε εθνική παραγγελία, ή ενεργοποίησε τον διακόπτη Βέροιας σε μια διεθνή παραγγελία.',
            action: { label: 'Άνοιγμα Εθνικών Παραγγελιών', onClick: "navigate('orders_natl')" }
          }) : '<div class="wk3-empty"><div class="big">Άδειο φύλλο — W'+week+'</div><p>Καμία εθνική κίνηση ακόμη.</p></div>')}
        </div>
      </main>
    </div>

    <div id="wn-ctx"></div>
    <div id="wn-popover"></div>
    </div><!-- /main content -->
    </div><!-- /block wrapper -->
  `;

  window._wnDragging = null;

  // Async: fill "vs last week" + "on-time streak" widgets.
  //
  // Two fixes combined — #28 and the 2026-08-04 audit found different halves of
  // the same problem. Kept identical to weekly_intl.js on purpose: these are
  // twin pages and their failure semantics must not drift apart again.
  //
  // 1. FAILURE (#28): each source is isolated with safeFetch, and a failed one
  //    HIDES its widget rather than showing a fabricated comparison. An absent
  //    widget reads as "not available"; a 0 reads as a fact — and "0 last week"
  //    makes this week look like a record.
  //
  // 2. EMPTY WEEK (audit WN-2): this block sat inside `if (total > 0)`, so on an
  //    empty week both placeholders stayed on "loading…" permanently. It never
  //    surfaced only because this page also hides the whole Command Center when
  //    the week is empty — one load with data away from being visible.
  // Π5β (Wave 1): fetchOnTimeStreak dropped — twin of the intl change; the
  // widget is hidden (or static «δεν έχει ξεκινήσει») until recording is fixed.
  safeFetch(() => fetchPreviousWeekStats(week, TABLES.NAT_LOADS, true), 'weekly natl: previous week stats', {total:0,assigned:0})
  .then(prev => {
    const el1 = document.getElementById('wn-cc-vswk');
    if (el1) el1.outerHTML = didFail(prev) ? '' : widgetVsLastWeek(total, prev.total, assigned, prev.assigned);
  }).catch(e => console.warn('CC async widgets (natl):', e));

  // Φέτα 3 (Δ11): η ουρά του National Pick Ups. Τον χειμώνα εκεί κάθονται
  // δεκάδες γραμμές groupage που περιμένουν να γίνουν φορτηγό — και το
  // εβδομαδιαίο δεν τις έβλεπε καθόλου. Μόνο μέτρημα: το petras-assign δεν
  // αγγίζεται. Αν αποτύχει ή είναι μηδέν, ο μετρητής απλώς δεν εμφανίζεται —
  // ένα «0 στην ουρά» που στην πραγματικότητα είναι σφάλμα δικτύου θα ήταν
  // χειρότερο από το τίποτα.
  safeFetch(() => atGetAll(TABLES.GL_LINES, { filterByFormula: `{Status}="Unassigned"`, fields: ['Status'] }, false),
            'weekly natl: pick ups queue', [])
  .then(gl => {
    const el = document.getElementById('wn-pickups-q');
    if (!el || didFail(gl) || !gl.length) return;
    el.outerHTML = `<button class="wk3-t queue" title="Γραμμές groupage που περιμένουν ανάθεση στο National Pick Ups — κλικ: άνοιγμα της σελίδας" onclick="navigate('weekly_pickups')"><b>${gl.length}</b> στην ουρά Pick Ups ↗</button>`;
  }).catch(e => console.warn('pick ups queue (natl):', e));
}

/* ── ALL ROWS — μία ημέρα ανά ΠΡΩΤΗ ΦΟΡΤΩΣΗ, κενές μέρες ορατές ──── */
//
// Φέτα 1α (SPEC Δ2). Δύο αλλαγές στη λογική της ημέρας:
//
// 1. ΕΝΑ κλειδί, όχι δύο. Πριν, η ΚΑΘΟΔΟΣ ομαδοποιούνταν κατά ημερομηνία
//    ΠΑΡΑΔΟΣΗΣ και η ΑΝΟΔΟΣ κατά ημερομηνία ΦΟΡΤΩΣΗΣ — δηλαδή τα δύο σκέλη
//    του ΙΔΙΟΥ round trip έπεφταν σε διαφορετικές μέρες. Στο Excel η γραμμή
//    ανήκει στη μέρα που ξεκινά το φορτηγό.
//
// 2. Και οι 7 μέρες εμφανίζονται ΠΑΝΤΑ. Η κενή μέρα είναι πληροφορία
//    («η Τετάρτη δεν έχει τίποτα — γιατί;»), όχι απουσία.
function _wnAllRowsHTML() {
  const { week } = WNATL;
  const nsRows = WNATL.rows.filter(r => r.type==='northsouth');
  const snRows = WNATL.rows.filter(r => r.type==='southnorth');
  let idx = 0, snIdx = 0;

  const _ord = row => (row.type==='southnorth')
    ? WNATL.data.southnorth.find(r => r.id===row.orderId)
    : WNATL.data.northsouth.find(r => r.id===row.orderIds[0]);

  // Πρώτη φόρτωση· fallback στην παράδοση μόνο αν λείπει εντελώς η φόρτωση.
  const _key = row => {
    const f = _ord(row)?.fields || {};
    return toLocalDate(f['Loading DateTime'] || f['Delivery DateTime'] || '') || 'zzz';
  };

  const dayMap = {};
  const put = (row, bucket) => {
    const k = _key(row);
    if (!dayMap[k]) dayMap[k] = { ns:[], sn:[] };
    dayMap[k][bucket].push(row);
  };
  nsRows.forEach(r => put(r, 'ns'));
  snRows.forEach(r => put(r, 'sn'));

  // Οι 7 μέρες της εβδομάδας με τη σειρά, μετά ό,τι έπεσε εκτός (π.χ. 'zzz').
  const wS = _wnWeekStart(week);
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(wS); d.setDate(wS.getDate() + i);
    keys.push(toLocalDate(d));
  }
  Object.keys(dayMap).sort().forEach(k => { if (keys.indexOf(k) === -1) keys.push(k); });

  const todayKey = (typeof localToday==='function') ? localToday() : toLocalDate(new Date());
  let html = '';

  keys.forEach(key => {
    const { ns, sn } = dayMap[key] || { ns:[], sn:[] };
    const isToday = key === todayKey;
    const lbl = _wnDayLabel(key);
    const counts = (ns.length || sn.length)
      ? `${lbl.date} · ${ns.length} κάθοδος · ${sn.length} άνοδος`
      : lbl.date;

    html += `<div class="wk3-dayh${isToday?' today':''}">
      <span class="d">${lbl.name}</span>
      <span class="k">${counts}</span>
      ${isToday?'<span class="now" style="margin-left:auto">ΣΗΜΕΡΑ</span>':''}
    </div>`;

    if (!ns.length && !sn.length) {
      html += `<div style="padding:9px 14px;font-size:11px;color:var(--text-dim);
        background:var(--bg);border-bottom:1px solid var(--border)">Καμία κίνηση</div>`;
      return;
    }

    ns.forEach(row => { html += _wnRowHTML(row, idx++); });
    // Β.3-4 (Wave 1): ΑΝΟΔΟΣ rows numbered A1… like the intl I1… imports.
    sn.forEach(row => { html += _wnSnRowHTML(row, ++snIdx); });
  });

  return html;
}

// «ΚΥΡΙΑΚΗ» + «26/07» — η τυπογραφία ημέρας του wk3 (.wk3-dayh .d / .k)
function _wnDayLabel(key) {
  if (!key || key === 'zzz') return { name:'ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ', date:'—' };
  const d = new Date(key + 'T12:00:00');
  if (isNaN(d.getTime())) return { name:'—', date:key };
  return {
    name: d.toLocaleDateString('el-GR', { weekday:'long' }).toUpperCase(),
    date: String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0'),
  };
}

/* ── QUIET VIEW + DRIVERS PANEL (owner 8/8 — twins of weekly_intl) ── */
function _wnQuietOn(){ return localStorage.getItem('tms_weekly_details')!=='1'; }
function _wnToggleDetails(){ localStorage.setItem('tms_weekly_details', _wnQuietOn()?'1':'0'); renderWeeklyNatl(); }
// Φέτα 3 (Δ10): το πάνελ «Επιστροφές οδηγών» αφαιρέθηκε (owner 10/8).
// Ήταν συμπέρασμα από τις αναθέσεις, όχι καταγεγραμμένο γεγονός· η
// πραγματική κατάσταση οδηγών (ανάπαυση/άδεια) μένει εκτός σελίδας (Δ4).

/* ── WAVE 2 HELPERS (T3/T4/T5/T1 — twins of weekly_intl) ─────────── */
function _wnExecChip(f, saved){
  if(WNATL.week!==_wnCurrentWeek()||!f) return '';
  const ld=f['Loading DateTime']; if(!ld) return '';
  if(new Date(ld)>new Date()) return '';
  const st=f['Status']||'';
  if(!saved) return '<span class="wi-exec wi-exec--late" title="Η ώρα φόρτωσης πέρασε χωρίς ανάθεση">⚠ φόρτωση χωρίς ανάθεση</span>';
  if(st==='Assigned'||st==='Pending') return '<span class="wi-exec wi-exec--stale" title="Η ώρα φόρτωσης πέρασε χωρίς εξέλιξη κατάστασης">⏱ πέρασε η φόρτωση · χωρίς εξέλιξη</span>';
  return '';
}
// T4 twin: natl filters by LOADING week, so the cross-week blind spot is the
// DELIVERY side — flag rows delivering in another week.
function _wnWeekOf(dt){ if(!dt) return null; try{const d=new Date(dt),y=d.getFullYear(),j=new Date(y,0,1); return Math.ceil(((d-j)/864e5+j.getDay()+1)/7);}catch{return null;} }
function _wnCrossChip(f){
  const dw=_wnWeekOf(f?.['Delivery DateTime']);
  if(dw==null||dw===WNATL.week) return '';
  return `<span class="wi-cross" title="Η παράδοση πέφτει στη W${dw} — στην προβολή εκείνης της εβδομάδας η γραμμή δεν εμφανίζεται (φίλτρο ανά εβδομάδα ΦΟΡΤΩΣΗΣ)">↦ παραδίδει W${dw}</span>`;
}
function _wnSync(id, state, msg){
  const el=document.getElementById(id); if(!el) return;
  el.className='wi-sync'+(state?' wi-sync--'+state:'');
  el.textContent=state==='pend'?'⟳':state==='ok'?'✓':state==='err'?'⚠':'';
  el.title=msg||'';
  if(state==='ok') setTimeout(()=>{ if(el.textContent==='✓'){el.textContent='';el.className='wi-sync';} },4000);
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
  // Φέτα 2: δύο ΔΙΑΦΟΡΕΤΙΚΑ κενά, όχι ένα.
  //   «δεν υπάρχει σκέλος» — συνεργάτης με ανάθεση, μονή διαδρομή. Το Χ του
  //   Excel. Δεν καλεί σε drag· δείχνει —, γιατί δεν λείπει τίποτα.
  //   «δεν ταιριάχτηκε ακόμη» — όλα τα υπόλοιπα. Καλεί σε drag.
  // Η σύμβαση είναι ήδη του σπιτιού: .wk3-leg.bgap στο intl (owner, 9/8).
  const isOneWay = !sn && row.saved && isPartner;
  const snCell = sn ? _wnSnInlineCell(sn, row.id) : _wnDragCell(isOneWay);

  // Φέτα 4 (Δ9): πολυστάσιο φορτίο → συμπτυγμένο σήμα «▸ N · Xp».
  // Το πλήθος και το σύνολο τα ξέρουμε ήδη από τη γραμμή — καμία επιπλέον
  // κλήση. Η ανάλυση ανά πελάτη φορτώνεται ΜΟΝΟ όταν πατηθεί το σήμα, γιατί
  // ζει στα ORDER_STOPS και δεν αξίζει να κατεβαίνει για όλη την εβδομάδα.
  let _nDel = 0;
  for (let k = 1; k <= 10; k++) if ((f[`Delivery Location ${k}`]||[]).length) _nDel++;
  const grpBtn = _nDel > 1
    ? `<button class="wk3-grpb" id="wn-grpb-${row.id}" data-n="${_nDel}" data-p="${pals}"
        title="${_nDel} σημεία παράδοσης — κλικ για ανάλυση ανά πελάτη"
        onclick="event.stopPropagation();_wnToggleStops(${row.id},'${primary?.id||''}')">▸ ${_nDel} · ${pals}p</button>`
    : '';

  // Badges
  const badges = _wnBadges(f);

  const clBg = isCL ? 'background:rgba(13,148,136,0.04);' : '';
  // Φέτα 1β: grid wk3-row (4 στήλες) αντί για wi-row/wi-compact.
  // ΟΛΟΙ οι handlers μεταφέρθηκαν αυτούσιοι: dragstart, δεξί κλικ (_wnCtx),
  // popover ανάθεσης, print, και το drop target της ανόδου.
  return `
  <div id="wn-row-${row.id}" data-row-id="${row.id}" class="wk3-row"
    style="${clBg}"
    draggable="true"
    ondragstart="_wnDragStart(event,'${row.orderId||primary?.id||''}')">
    <div class="wk3-num">${i+1}<span class="wi-sync" id="wn-sync-${row.id}"></span></div>
    <div class="wk3-leg" oncontextmenu="_wnCtx(event,${row.id})">
      <span class="wk3-route">
        <b class="wk3-ld" title="Ημ. φόρτωσης">${loadDt||''}</b>
        <span class="frm">${escapeHtml(fromStr)}</span>${_wnHH(f['Loading Appointment'])}
        <span class="wk3-sep">→</span>
        <b class="wk3-ld" title="Ημ. παράδοσης">${delDt!=='—'?delDt:''}</b>
        <span class="to">${escapeHtml(toStr)}</span>${_wnHH(f['Delivery Appointment'])}
        ${isGroup?' <span class="wk3-vsb">VS</span>':''}${grpBtn}
      </span>
      <span class="wk3-meta">
        <span class="wk3-pal">${pals?pals+'p':''}</span>
        <span class="wk3-flags">${badges}${_wnCrossChip(f)}${_wnExecChip(f,row.saved)}</span>
      </span>
    </div>
    <div class="wk3-assign" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="event.stopPropagation();_wnOpenPopover(event,${row.id})">
      ${pill}
      <button class="wk3-prt" title="Εκτύπωση εντολής"
              onclick="event.stopPropagation();_wnPrint(${row.id},'northsouth')">⎙</button>
    </div>
    <div class="wk3-leg${sn?'':(isOneWay?' bgap':' void')}" id="wn-ci-${row.id}"
         onclick="event.stopPropagation()"
         ondragover="event.preventDefault();document.getElementById('wn-ci-${row.id}').classList.add('dh')"
         ondragleave="document.getElementById('wn-ci-${row.id}').classList.remove('dh')"
         ondrop="event.stopPropagation();_wnDropOnRow(event,${row.id})">
      ${snCell}
    </div>
  </div>
  ${_nDel > 1 ? `<div class="wn3-stops" id="wn-stops-${row.id}" style="display:none"></div>` : ''}`;
}

/* ── Φέτα 4 (Δ9): ανάλυση groupage, lazy ──────────────────────────── */
async function _wnToggleStops(rowId, nlId) {
  const box = document.getElementById('wn-stops-'+rowId);
  const btn = document.getElementById('wn-grpb-'+rowId);
  if (!box || !btn) return;
  const n = btn.dataset.n, p = btn.dataset.p;

  if (box.style.display !== 'none') {           // κλείσιμο
    box.style.display = 'none';
    btn.textContent = `▸ ${n} · ${p}p`;
    return;
  }
  box.style.display = '';
  btn.textContent = `▾ ${n} · ${p}p`;
  if (box.dataset.loaded === '1') return;

  box.innerHTML = '<span class="ld">φόρτωση στάσεων…</span>';
  try {
    const stops = await stopsLoad(nlId, F.STOP_PARENT_NL);
    const dels = (stops||[]).filter(s => s.fields?.[F.STOP_TYPE] === 'Unloading');
    if (!dels.length) { box.innerHTML = '<span class="ld">δεν βρέθηκαν καταγεγραμμένες στάσεις</span>'; box.dataset.loaded='1'; return; }

    let sum = 0, missing = 0;
    const lines = dels.map(s => {
      const raw = s.fields[F.STOP_LOCATION];
      const lid = Array.isArray(raw) ? (raw[0]?.id || raw[0]) : (raw?.id || raw);
      const nm  = WNATL.data._locMap?.[lid] || _wnLocName(lid) || '—';
      const pal = s.fields[F.STOP_PALLETS];
      if (pal == null) missing++; else sum += pal;
      const note = s.fields['Notes'] || '';
      return `<div class="st"><span class="p">${pal!=null?pal+'p':'—'}</span>`
           + `<span>${escapeHtml(nm)}</span>`
           + (note?`<span class="o">${escapeHtml(note)}</span>`:'')
           + `</div>`;
    }).join('');

    // Το «—» σε μια στάση σημαίνει ότι οι παλέτες της δεν καταγράφηκαν ποτέ
    // (Α1 fallback). Το λέμε ρητά αντί να παρουσιάσουμε μερικό άθροισμα ως
    // πλήρες — αλλιώς το γέμισμα φαίνεται μικρότερο απ' ό,τι είναι.
    const cls = sum > 33 ? ' over' : (sum >= 30 ? ' full' : '');
    const tot = `<div class="st tot${cls}"><span class="p">${sum}/33</span>`
              + `<span>γέμισμα φορτηγού</span>`
              + (missing?`<span class="o">${missing} στάσ${missing===1?'η':'εις'} χωρίς καταγεγραμμένες παλέτες</span>`:'')
              + `</div>`;

    box.innerHTML = lines + tot;
    box.dataset.loaded = '1';
  } catch(e) {
    console.warn('_wnToggleStops:', e);
    box.innerHTML = '<span class="ld">δεν φορτώθηκαν οι στάσεις</span>';
  }
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
  const delDt    = _wnFmt(f['Delivery DateTime']);
  const pals     = f['Total Pallets']||0;
  // Φέτα 1β: ίδια τυπογραφία διαδρομής με το αριστερό σκέλος (wk3-route)
  return `<span class="wk3-route">
      <b class="wk3-ld" title="Ημ. φόρτωσης ανόδου">${loadDt||''}</b>
      <span class="frm">${escapeHtml(fromStr)}</span>${_wnHH(f['Loading Appointment'])}
      <span class="wk3-sep">→</span>
      <b class="wk3-ld" title="Ημ. παράδοσης">${delDt!=='—'?delDt:''}</b>
      <span class="to">${escapeHtml(toStr)}</span>${_wnHH(f['Delivery Appointment'])}
    </span>
    <span class="wk3-meta">
      <span class="wk3-pal">${pals?pals+'p':''}</span>
      <span class="wk3-flags">${_wnBadges(f)}</span>
    </span>
    <button class="wk3-unm" title="Αφαίρεση ταιριάσματος"
            onclick="event.stopPropagation();_wnUnmatch(${rowId},'${snRec.id}')">✕</button>`;
}

/* ── Κενό σκέλος ανόδου — δύο διαφορετικά νοήματα (Φέτα 2) ───────── */
function _wnDragCell(isOneWay) {
  return isOneWay
    ? `<span class="nolg" title="Μονή διαδρομή — δεν υπάρχει σκέλος ανόδου">—</span>`
    : `<span style="font-size:10px;color:rgba(196,207,219,0.30);font-style:italic">σύρε άνοδο εδώ</span>`;
}

/* ── S→N standalone row ──────────────────────────────────────────── */
function _wnSnRowHTML(row, snNo) {
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
  // Φέτα 1β: grid wk3-row. Το ΑΡΙΣΤΕΡΟ κελί μένει κενό/σκούρο — «δεν υπάρχει
  // σκέλος καθόδου», όπως το Χ του Excel (owner, 8/8). Handlers αυτούσιοι.
  return `<div id="wn-sn-${ord.id}"
    class="wk3-row"
    style="${clBgSN}cursor:grab"
    draggable="true"
    ondragstart="_wnDragStart(event,'${ord.id}')"
    oncontextmenu="_wnCtxSn(event,${row.id},'${ord.id}')">
    <div class="wk3-num imp" title="Άνοδος ${snNo||''}">A${snNo||''}</div>
    <div class="wk3-leg void"></div>
    <div class="wk3-assign" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="event.stopPropagation();_wnOpenSnPopover(event,'${ord.id}',${row.id})">
      ${pill}
      <button class="wk3-prt" title="Εκτύπωση εντολής"
        onclick="event.stopPropagation();_wnPrintSn('${ord.id}')">⎙</button>
    </div>
    <div class="wk3-leg">
      <span class="wk3-route">
        <b class="wk3-ld" title="Ημ. φόρτωσης">${loadDt||''}</b>
        <span class="frm">${escapeHtml(fromStr)}</span>${_wnHH(f['Loading Appointment'])}
        <span class="wk3-sep">→</span>
        <b class="wk3-ld" title="Ημ. παράδοσης">${delDt!=='—'?delDt:''}</b>
        <span class="to">${escapeHtml(toStr)}</span>${_wnHH(f['Delivery Appointment'])}
        ${isGroupage?' <span class="wk3-vsb">VS</span>':''}
      </span>
      <span class="wk3-meta">
        <span class="wk3-pal">${pals?pals+'p':''}</span>
        <span class="wk3-flags">${badges}</span>
      </span>
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

/* ── Φέτα 2 (Δ5): ώρα ΜΟΝΟ όπου υπάρχει ραντεβού ─────────────────── */
//
// Στο Excel οι ώρες ζουν μέσα στο κείμενο: «LIDL ΑΤΤ (ΠΑΡΑΔΟΣΗ ΣΤΙΣ 10.00)»,
// «ΦΑΓΕ 23.00». Δεν τις έχουν όλες οι γραμμές — οι περισσότερες είναι απλώς
// «εκείνη τη μέρα». Μια καταχώρηση χωρίς ώρα αποθηκεύεται 00:00, οπότε το
// μεσάνυχτα είναι το σήμα «δεν δόθηκε ώρα» και δεν εμφανίζεται.
//
// Συνέπεια που αξίζει να ξέρουμε: πραγματικό ραντεβού ακριβώς στις 00:00 δεν
// θα φανεί. Το «Masoutis 24.00-06.00» του Excel γράφεται 24.00, δηλαδή
// μεσάνυχτα — αν καταχωρηθεί έτσι, χάνεται. Προτιμότερο από το να δείχνουμε
// «00:00» σε κάθε γραμμή που απλώς δεν έχει ώρα.
// _wnTime αφαιρέθηκε μαζί με το αυτόματο σήμα — το ραντεβού δεν εξάγεται
// πλέον από το DateTime.

// ΔΙΟΡΘΩΣΗ owner (10/8): το σήμα ώρας ΔΕΝ βγαίνει πλέον αυτόματα από το
// DateTime. Ένα ραντεβού είναι ΑΠΟΦΑΣΗ, όχι παρενέργεια του ότι η εγγραφή
// τυχαίνει να έχει ώρα μέσα της — και εμφανιζόταν παντού χωρίς να το έχει
// ζητήσει κανείς.
//
// Θα ξαναζωντανέψει διαβάζοντας το ΝΕΟ πεδίο «Loading/Delivery Appointment»
// (db/migrations/2026-08-10_nl_appointments.sql), που ορίζεται ρητά με δεξί
// κλικ. Μέχρι να περάσει το migration ΚΑΙ ο χάρτης του Worker, το πεδίο δεν
// ζητείται καθόλου: αίτημα για ανύπαρκτο πεδίο γυρίζει 422 και ρίχνει όλη
// τη σελίδα.
function _wnHH(appt) {
  if (!appt) return '';
  return `<span class="wk3-hh" title="Ώρα ραντεβού">${escapeHtml(String(appt))}</span>`;
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

  // Β.3-3 (Wave 1): ΑΝΟΔΟΣ-without-vehicle is visually distinct (dashed) from
  // ΚΑΘΟΔΟΣ-without-assignment — same red meant two different things.
  // Φέτα 1β: wk3-pill 24px μίας γραμμής (πινακίδα + επώνυμο), όπως το intl.
  // Β.3-3 διατηρείται: ΑΝΟΔΟΣ χωρίς όχημα (dashed, unimp) ≠ ΚΑΘΟΔΟΣ χωρίς
  // ανάθεση (κόκκινο κενό) — το ίδιο κόκκινο σήμαινε δύο διαφορετικά πράγματα.
  const surname = driver ? driver.trim().split(/\s+/)[0] : '';
  if (!row.saved) return row.type === 'southnorth'
    ? `<div class="wk3-pill unimp" title="Άνοδος χωρίς όχημα — κλικ για ανάθεση">ΑΝΟ · χωρίς όχημα</div>`
    : `<div class="wk3-pill un" title="Αδιάθετο — κλικ για ανάθεση"></div>`;
  if (partner) return `<div class="wk3-pill par" title="Συνεργάτης${row.partnerPlates?' · '+escapeHtml(row.partnerPlates):''}${driver?' · '+escapeHtml(driver):''}${isCL?' · από Pick Ups':''} — κλικ: αλλαγή ανάθεσης">${escapeHtml(partner.slice(0,22))}${(row.partnerPlates||surname)?` <small>${escapeHtml([row.partnerPlates,surname].filter(Boolean).join(' '))}</small>`:''}</div>`;
  return `<div class="wk3-pill own" title="${escapeHtml([truck,trailer].filter(Boolean).join(' · '))}${driver?' · '+escapeHtml(driver):''}${isCL?' · από Pick Ups':''} — κλικ: αλλαγή ανάθεσης">${escapeHtml([truck,trailer].filter(Boolean).join('·')||'—')}${surname?` <small>${escapeHtml(surname)}</small>`:''}</div>`;
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
  // T3 (Wave 2): optimistic paint above — the sync slot reports server truth.
  _wnSync('wn-sync-'+rowId,'pend','Αποθήκευση σύνδεσης…');
  try {
    const r1 = await atSafePatch(TABLES.NAT_LOADS, row.orderIds[0], { 'Matched Load': snId });
    if(r1?.conflict){ toast('Record modified by another user — refreshing','warn'); await renderWeeklyNatl(); return; }
    const r2 = await atSafePatch(TABLES.NAT_LOADS, snId, { 'Matched Load': row.orderIds[0] });
    if(r2?.conflict){ toast('Record modified by another user — refreshing','warn'); await renderWeeklyNatl(); return; }
    _wnSync('wn-sync-'+rowId,'ok','Αποθηκεύτηκε');
    toast('Σύνδεση αποθηκεύτηκε ✓');
  } catch(err) {
    _wnSync('wn-sync-'+rowId,'err','Η σύνδεση ΔΕΝ γράφτηκε στη βάση — κάνε Ανανέωση');
    toast('Σφάλμα σύνδεσης: '+err.message, 'warn');
  }
}

async function _wnUnmatch(rowId, snId) {
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  const snOrd = WNATL.data.southnorth.find(r => r.id===snId);
  row.matchedId = null;
  if (snOrd) {
    WNATL.rows.push(_wnBuildRow(snOrd, 'southnorth'));
  }
  _wnPaint();
  _wnSync('wn-sync-'+rowId,'pend','Αφαίρεση σύνδεσης…'); // T3
  try {
    await atSafePatch(TABLES.NAT_LOADS, row.orderIds[0], { 'Matched Load': '' });
    await atSafePatch(TABLES.NAT_LOADS, snId, { 'Matched Load': '' });
    _wnSync('wn-sync-'+rowId,'ok','Αφαιρέθηκε');
    toast('Σύνδεση αφαιρέθηκε');
  } catch(err) {
    _wnSync('wn-sync-'+rowId,'err','Η αφαίρεση ΔΕΝ γράφτηκε στη βάση — κάνε Ανανέωση');
    toast('Σφάλμα: '+err.message, 'warn');
  }
}

/* ── POPOVER ─────────────────────────────────────────────────────── */
function _wnOpenPopover(e, rowId) {
  e.stopPropagation();
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  const { trucks, trailers, drivers, partners } = WNATL.data;

  // Π2 (Wave 2, twin of intl): weekly load per asset from in-memory rows.
  const _busy={};
  {
    const all=[...(WNATL.data.northsouth||[]),...(WNATL.data.southnorth||[])];
    WNATL.rows.forEach(r=>{
      if(r.id===rowId) return;
      const o=all.find(x=>x.id===r.orderIds?.[0]); if(!o) return;
      const dt=o.fields['Loading DateTime'];
      const entry={d:dt?toLocalDate(dt).slice(5):'', dest:(_wnNlDeliverySummary(o.fields)||o.fields['Client']||'').slice(0,18)};
      if(r.truckId){(_busy[r.truckId]=_busy[r.truckId]||[]).push(entry);}
      if(r.driverId){(_busy[r.driverId]=_busy[r.driverId]||[]).push(entry);}
    });
  }

  const mkDrop = (px, arr, selId, ph, wide) => {
    const uid  = `${px}_wn_${rowId}`;
    const sel  = arr.find(x => x.id===selId)?.label||'';
    const showBusy=(px==='tk'||px==='dr');
    const opts = arr.map(x => {
      const l = (x.label||'').replace(/"/g,'&quot;');
      const b = showBusy?_busy[x.id]:null;
      const sub = b&&b.length?`<div class="wi-sdo-sub">δεσμ. ${b.length}× · ${b[0].d} → ${escapeHtml(b[0].dest)}</div>`:'';
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
    <div id="wn-lane-${rowId}" class="wi-lane-hist"></div>
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
  _wnFillLaneHist(rowId, row); // Π3 (Wave 3) — async, hides itself when no data
}

// Π3 (Wave 3, natl): εθνική «γραμμή» ≈ ίδιος πελάτης (τα NAT_LOADS δεν έχουν
// text summaries — ο Client είναι το σταθερό κλειδί). Τελευταία 3 κόμιστρα.
async function _wnFillLaneHist(rowId, row){
  const all=[...(WNATL.data.northsouth||[]),...(WNATL.data.southnorth||[])];
  const o=all.find(x=>x.id===row.orderIds?.[0]);
  const client=String(o?.fields?.['Client']||'').trim();
  if(!client||!document.getElementById('wn-lane-'+rowId)) return;
  try{
    if(!WNATL._laneAll){
      // Facade: checkbox=1 works, numeric `>` returns 422· full records (no
      // fields[]) — named derived fields come back empty (measured on intl).
      WNATL._laneAll=(await atGetAll(TABLES.NAT_LOADS,{filterByFormula:`{Is Partner Trip}=1`},false))
        .filter(r=>typeof r.fields['Partner Rate']==='number'&&r.fields['Partner Rate']>0);
    }
    const key=client.toUpperCase();
    const hits=WNATL._laneAll
      .filter(r=>String(r.fields['Client']||'').trim().toUpperCase()===key&&!row.orderIds.includes(r.id))
      .sort((a,b)=>String(b.fields['Loading DateTime']||'').localeCompare(String(a.fields['Loading DateTime']||''))).slice(0,3);
    const el=document.getElementById('wn-lane-'+rowId);
    if(!el||!hits.length) return;
    el.innerHTML='<span class="wi-lane-title">Ιστορικό πελάτη '+escapeHtml(client.slice(0,22))+':</span>'+hits.map(r=>{
      const pid=(r.fields['Partner']||[])[0];
      const pn=WNATL.data.partners.find(p=>p.id===pid)?.label||'—';
      const d=(r.fields['Loading DateTime']||'').slice(5,10);
      return `<span class="wi-lane-item">${d} · ${(r.fields['Partner Rate']||0).toLocaleString('el-GR')}€ · ${escapeHtml(String(pn).slice(0,18))}</span>`;
    }).join('');
  }catch(e){ console.warn('lane hist (natl):',e); }
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
  const row = WNATL.rows.find(r => r.orderId===orderId || r.matchedId===orderId);
  printOrderSheet(orderId, 'import', !!(row && row.partnerLabel));
}

function _wnPopoverOutside(e) {
  const pop = document.getElementById('wn-popover');
  // Φέτα 1β: το κελί ανάθεσης είναι πλέον .wk3-assign (ήταν .wi-ca-wrap).
  // Χωρίς αυτό, το κλικ που ΑΝΟΙΓΕΙ το popover θα το έκλεινε αμέσως.
  if (pop && !pop.contains(e.target) && !e.target.closest('.wk3-assign')) _wnClosePopover();
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
  // Φέτα 3 (Δ10): ο φύλακας διπλής κράτησης αφαιρέθηκε με απόφαση του owner
  // (10/8). Ο εθνικός σχεδιασμός γίνεται ημερησίως και με μικρούς όγκους —
  // το να βάλει κανείς τον ίδιο οδηγό δύο φορές στην ίδια μέρα δεν συμβαίνει
  // στην πράξη, και το confirm κόστιζε ένα κλικ σε ΚΑΘΕ ανάθεση.

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
  items.push(`<button type="button" class="wi-ctx-item" onclick="_wnCtxClose();_wnOpenPopover({stopPropagation:()=>{},currentTarget:document.getElementById('wn-row-${rowId}')},${rowId})">Ανάθεση</button>`);
  if (row?.saved)
    items.push(`<button type="button" class="wi-ctx-item wi-ctx-danger" onclick="_wnCtxClose();_wnUnassign(${rowId})">Αφαίρεση ανάθεσης</button>`);
  if (row?.matchedId)
    items.push(`<button type="button" class="wi-ctx-item wi-ctx-danger" onclick="_wnCtxClose();_wnUnmatch(${rowId},'${row.matchedId}')">Αφαίρεση import</button>`);
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
  items.push(`<button type="button" class="wi-ctx-item" onclick="_wnCtxClose();_wnOpenSnPopover({stopPropagation:()=>{},currentTarget:document.getElementById('wn-sn-${snId}')},\'${snId}\',${rowId})">Ανάθεση</button>`);
  if (row?.saved)
    items.push(`<button type="button" class="wi-ctx-item wi-ctx-danger" onclick="_wnCtxClose();_wnUnassignSn(${rowId},'${snId}')">Αφαίρεση ανάθεσης</button>`);
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
  if (!(await confirmAction('Αφαίρεση ανάθεσης;', { confirmLabel: 'Αφαίρεση' }))) return;

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
  if (!(await confirmAction('Αφαίρεση ανάθεσης;', { confirmLabel: 'Αφαίρεση' }))) return;

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

async function _wnSplit(rowId) {
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
  _wnPaint();
  const allIds = [first, ...rest];
  // Audit fix (N-1): await the back-patches and only confirm success once they
  // resolve. Previously these were fired without await, so the user saw "split
  // done" even when a Groupage ID clear silently failed, leaving a stale link
  // on NAT_ORDERS. allSettled so one failure does not abort the other clears.
  // Use safe patch + central sync; Groupage ID clear unlinks these orders from GRP chain.
  const results = await Promise.allSettled(allIds.map(id =>
    atSafePatch(TABLES.NAT_ORDERS, id, { 'Groupage ID':'' })
      .then(() => {
        if (typeof syncOrderDownstream === 'function') {
          return syncOrderDownstream(id, { source: 'natl', changedFields: ['Groupage ID'], skipPA: true, skipRamp: true });
        }
      })
  ));
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    failed.forEach(r => {
      console.warn('Groupage clear:', r.reason);
      if (typeof logError === 'function') logError(r.reason, '_wnSplit groupage clear');
    });
    if (typeof showErrorToast === 'function') showErrorToast(`Διαχωρισμός: ${failed.length}/${allIds.length} ενημερώσεις απέτυχαν — ανανεώστε`, 'error');
  } else {
    toast('Διαχωρίστηκε');
  }
}

/* ── PRINT ───────────────────────────────────────────────────────── */
// CSV export for the current week — includes both directions
function _wnExportCSV() {
  try {
    const rows = [['Type','Order #','Loading Date','Delivery Date','Loading Points','Delivery Points','Pallets','Truck','Trailer','Driver','Partner','Partner Plates','Partner Rate','Status']];
    const allOrders = [...(WNATL.data.northsouth||[]), ...(WNATL.data.southnorth||[])];
    const orderById = {};
    allOrders.forEach(o => { orderById[o.id] = o; });
    WNATL.rows.forEach(r => {
      const ord = orderById[r.orderId];
      if (!ord) return;
      const f = ord.fields || {};
      rows.push([
        r.type === 'northsouth' ? 'ΚΑΘΟΔΟΣ' : 'ΑΝΟΔΟΣ',
        f['Order Number'] || ord.id,
        f['Loading DateTime'] || '',
        f['Delivery DateTime'] || '',
        f['Loading Points'] || '',
        f['Delivery Points'] || '',
        f['Total Pallets'] || f['Pallets'] || '',
        r.truckLabel || '',
        r.trailerLabel || '',
        r.driverLabel || '',
        r.partnerLabel || '',
        r.partnerPlates || '',
        r.partnerRate || '',
        r.saved ? 'Assigned' : 'Pending',
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c==null?'':c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `weekly_national_W${WNATL.week}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast('CSV exported');
  } catch(e) {
    console.error('[weekly_natl] export CSV failed:', e);
    reportError('Export failed', e);
  }
}

function _wnPrint(rowId, leg) {
  const row = WNATL.rows.find(r => r.id===rowId); if (!row) return;
  const orderId = leg==='northsouth' ? row.orderIds[0] : row.matchedId;
  if (!orderId) { toast('Δεν υπάρχει εντολή για εκτύπωση','warn'); return; }
  printOrderSheet(orderId, leg==='northsouth'?'export':'import', !!row.partnerLabel);
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
window._wnExportCSV = _wnExportCSV;
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
window._wnToggleDetails = _wnToggleDetails;
// Φέτα 4: καλείται από inline onclick του σήματος groupage — χωρίς αυτό
// το κλικ θα έριχνε ReferenceError (το module είναι σε IIFE).
window._wnToggleStops = _wnToggleStops;


// ── WN-3: print the week (warehouse works on paper) ─────────
// Mirrors _wiPrintWeek: same shared shell (_printWeekShell, core/utils),
// natl's own rows. ΚΑΘΟΔΟΣ and ΑΝΟΔΟΣ print as two sections in board order.
function _wnPrintWeek(){
  const secs=[['ΚΑΘΟΔΟΣ (Βορράς → Νότος)','northsouth'],['ΑΝΟΔΟΣ (Νότος → Βορράς)','southnorth']];
  let html=`<h2 style="font-family:'Syne',sans-serif;margin-bottom:12px">Weekly National — W${WNATL.week}</h2>
    <p style="font-size:12px;color:#666;margin-bottom:16px">${WNATL.data.northsouth.length} ΚΑΘΟΔΟΣ · ${WNATL.data.southnorth.length} ΑΝΟΔΟΣ · Εκτύπωση ${new Date().toLocaleString('el-GR')} — αντικαθιστά κάθε προηγούμενη έκδοση</p>`;
  for(const [secTitle,type] of secs){
    const rows=WNATL.rows.filter(r=>r.type===type);
    html+=`<h3 style="font-family:'Syne',sans-serif;font-size:13px;margin:14px 0 6px">${secTitle} — ${rows.length}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#F0F5FA">
          <th style="padding:6px;border:1px solid #ddd;text-align:left">#</th>
          <th style="padding:6px;border:1px solid #ddd;text-align:left">Διαδρομή</th>
          <th style="padding:6px;border:1px solid #ddd;text-align:left">Ημερομηνίες</th>
          <th style="padding:6px;border:1px solid #ddd;text-align:center">Παλ.</th>
          <th style="padding:6px;border:1px solid #ddd;text-align:left">Ανάθεση</th>
        </tr></thead><tbody>`;
    rows.forEach((row,i)=>{
      const ord=WNATL.data[type].find(o=>o.id===row.orderId); if(!ord)return;
      const f=ord.fields;
      const from=(typeof _wnNlPickupSummary==='function'?_wnNlPickupSummary(f):'')||f['Name']||'—';
      const to=(typeof _wnNlDeliverySummary==='function'?_wnNlDeliverySummary(f):'')||'—';
      const assign=row.partnerLabel?`Συνεργάτης: ${row.partnerLabel}${row.partnerPlates?' ('+row.partnerPlates+')':''}`
                  :(row.truckLabel?`Στόλος: ${row.truckLabel}${row.driverLabel?' · '+row.driverLabel:''}`:'Χωρίς ανάθεση');
      html+=`<tr>
        <td style="padding:4px 6px;border:1px solid #ddd">${i+1}</td>
        <td style="padding:4px 6px;border:1px solid #ddd">${String(from).slice(0,34)} → ${String(to).slice(0,34)}</td>
        <td style="padding:4px 6px;border:1px solid #ddd">${toLocalDate(f['Loading DateTime'])||'—'} → ${toLocalDate(f['Delivery DateTime'])||'—'}</td>
        <td style="padding:4px 6px;border:1px solid #ddd;text-align:center">${f['Total Pallets']||0}</td>
        <td style="padding:4px 6px;border:1px solid #ddd">${assign}</td>
      </tr>`;
    });
    html+='</tbody></table>';
  }
  _printWeekShell(`Week ${WNATL.week} — Weekly National — Petras TMS`, html);
}
window._wnPrintWeek = _wnPrintWeek;
})();
