// ═══════════════════════════════════════════════════════════════════════
// WEEKLY NATIONAL — v4 (batch 3 of the redesign, 3/9/2026)
// ─────────────────────────────────────────────────────────────────────
// Board of the national week: one row per NATIONAL LOAD, four cells
//   # · ΚΑΘΟΔΟΣ (N→S) · ΑΝΑΘΕΣΗ · ΑΝΟΔΟΣ (S→N)
// plus a second section, ΤΟΠΙΚΕΣ ΠΑΡΑΔΟΣΕΙΣ (driver × day), same width.
// Contract: Figma w4-kanban-contract (165:678) — 12 points; the frame is
// w4-weekly-natl-board-v2 (388:901). Where the two disagree the contract
// wins (DECISION_LOG 3/9: rules over frames).
//
// Fields read from NATIONAL LOADS (facade tblVW42cZnfC47gTb):
//   Direction, Status, Source Type, Source Record, Client (plain text),
//   Loading/Delivery DateTime, Loading/Delivery Appointment, Total Pallets,
//   Pallet Exchange, Matched Load, Truck[], Trailer[], Driver[], Partner[],
//   Is Partner Trip, Partner Truck Plates, Partner Rate,
//   Pickup Location 1..10, Delivery Location 1..10
// Fields written to NATIONAL LOADS: Truck, Trailer, Driver, Partner,
//   Is Partner Trip, Partner Truck Plates, Partner Rate, Status,
//   Matched Load, Loading/Delivery Appointment
// LOCAL_MOVES (Δ18 — table NOT deployed on the Worker yet, 404 expected):
//   read Date, Sequence, Driver, Truck, Trailer, Partner, From/To Location,
//   Pallets, Time From, Description, Status, Parent Nat Load, Parent Order
//   written: the same names (create / driver patch / delete)
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
  // T3: per-row write results survive repaints (⚠ must stay visible until a
  // reload proves the row is right). Cleared in _wnLoadAll.
  _syncErr: new Set(),
  _syncOk: 0,
  _loadedAt: null,
  // display number of every row in the current paint (1…, A1…) — the local
  // «εξυπηρετεί ▸ εθνικό #3» chip names the row by it (Δ6).
  _rowNo: {},
};

// ONE filter state (WNATL.filterStatus) drives the select, the quick-filter
// chips and the rows — two widgets, one truth (principle 3).
function _wnApplyFilter() {
  const q = (WNATL.filter||'').toLowerCase();
  const fs = WNATL.filterStatus||'';
  document.querySelectorAll('#wn-rows [data-row-id]').forEach(el => {
    const row = WNATL.rows.find(r => String(r.id) === el.dataset.rowId);
    if (!row) { el.style.display=''; return; }
    let show = true;
    if (q) {
      const blob = [row.truckLabel, row.driverLabel, row.partnerLabel, row.client||'', row.route||''].join(' ').toLowerCase();
      if (!blob.includes(q)) show = false;
    }
    if (show && fs) {
      if (fs === 'pending' && row.saved) show = false;
      else if (fs === 'assigned' && !row.saved) show = false;
      // WN-1β: visible ΑΝΟΔΟΣ rows are the unmatched ones by construction
      else if (fs === 'unmatched' && row.type !== 'southnorth') show = false;
      else if (fs === 'uncovered' && !row.needsLocal) show = false;
      else if (fs === 'groupage' && !row.isGrp) show = false;
    }
    el.style.display = show ? '' : 'none';
    // the lazy stops panel sits outside the row — it follows the row
    const box = document.getElementById('wn-stops-'+row.id);
    if (box && !show && box.style.display !== 'none') {
      box.style.display = 'none';
      const b = document.getElementById('wn-grpb-'+row.id);
      if (b) b.textContent = b.textContent.replace('▾', '▸');
    }
  });
  document.querySelectorAll('#wn-quick [data-qf]').forEach(b => b.classList.toggle('on', b.dataset.qf === fs));
  const sel = document.getElementById('wn-status');
  if (sel && sel.value !== fs) sel.value = fs;
  const clr = document.getElementById('wn-clear');
  if (clr) clr.style.display = (q || fs) ? '' : 'none';
}
function _wnQuick(v) { WNATL.filterStatus = v || ''; _wnApplyFilter(); }
function _wnClearFilter() {
  WNATL.filter = ''; WNATL.filterStatus = '';
  const s = document.getElementById('wn-search'); if (s) s.value = '';
  _wnApplyFilter();
}

function _wnPulseRow(rowId) {
  const el = document.getElementById('wn-row-'+rowId);
  if (!el) return;
  const orig = el.style.background;
  el.style.transition = 'background 0.3s';
  el.style.background = 'var(--surface-sunken)';
  setTimeout(() => { el.style.background = orig; }, 700);
}

// Which week is "today" — uses the canonical isoWeekNumber() (core/utils.js),
// the same source Dashboard/Orders/Performance already agree on. The old
// Math.ceil WEEKNUM(Sunday-start) formula misplaced Saturdays into next
// week's bucket (Sat 5/9/2026 → 37 instead of 36), so the "Τρέχουσα" tab was
// wrong every weekend (design audit 5/9/2026, A1). _wnWeekStart below still
// buckets rows by the old Sunday-start scheme — untouched, out of scope here.
function _wnCurrentWeek() {
  return isoWeekNumber(new Date());
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
  content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:32px;color:var(--text-dim)">
    <div class="spinner"></div> Φόρτωση εβδομάδας ${WNATL.week}…</div>`;
  try {
    await _wnLoadAll();
    if (loadId !== _wnLoadId) return;
    _wnBuildRows();
    _wnPaint();
  } catch(e) {
    if (loadId !== _wnLoadId) return; // stale error, ignore
    // Contract #6 / DESIGN.md #7: error ≠ empty. Three sentences — what
    // happened, what it does NOT mean, what to do — so a failed load can never
    // be read as «no loads this week». The browser's own «Failed to fetch» is
    // not shown: it names nothing the dispatcher can act on.
    const raw = String(e && e.message || e || '');
    const why = /fetch|network|load failed/i.test(raw) ? 'δεν ήρθε απάντηση από τον διακομιστή' : raw || 'άγνωστο σφάλμα';
    content.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:32px;color:var(--danger)">
      <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:14px">Η εβδομάδα ${WNATL.week} δεν φορτώθηκε</div>
      <div style="font-size:12px;color:var(--text-mid)">Δεν σημαίνει ότι δεν υπάρχουν φορτία — ${escapeHtml(why)}.</div>
      <button class="btn btn-primary btn-sm" onclick="renderWeeklyNatl()">↻ Ξαναδοκίμασε</button></div>`;
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
  const [, all, locals] = await Promise.all([
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
      // Ώρα ραντεβού ανά σκέλος — ορίζεται ρητά με δεξί κλικ, ΔΕΝ εξάγεται
      // από τα datetime. Απαιτεί το migration 2026-08-10_nl_appointments.sql
      // ΚΑΙ τον χάρτη του Worker· χωρίς αυτά το αίτημα γυρίζει 422.
      'Loading Appointment','Delivery Appointment',
    ] }, false),

    // Δ1/Δ7 — τοπικές κινήσεις της εβδομάδας. Ξεχωριστός πίνακας (Δ18):
    // δεν έχουν κατεύθυνση βορρά-νότου και συχνά ούτε πελάτη ούτε παραγγελία.
    // safeFetch: αν ο πίνακας/Worker δεν είναι έτοιμος, η ενότητα μένει κενή
    // αντί να ρίξει ΟΛΗ τη σελίδα μαζί με τα εθνικά.
    safeFetch(() => atGetAll(TABLES.LOCAL_MOVES, {
      filterByFormula: `AND(IS_AFTER({Date},'${fmt(new Date(wStart.getTime()-86400000))}'),IS_BEFORE({Date},'${fmt(new Date(wEnd.getTime()+86400000))}'))`,
    }, false), 'weekly natl: local moves', []),
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

  // Τοπικές κινήσεις: ταξινομημένες ανά μέρα και σειρά μέσα στη μέρα (Δ7).
  // didFail => η ενότητα εμφανίζεται κενή, τα εθνικά δεν επηρεάζονται.
  WNATL._loadedAt = new Date();
  WNATL._syncErr = new Set(); WNATL._syncOk = 0;
  // Contract #6: the section must say «δεν φορτώθηκε», not show 7 empty days.
  WNATL.data._localsFailed = (typeof didFail === 'function' && didFail(locals));
  WNATL.data.locals = WNATL.data._localsFailed ? []
    : (locals || []).slice().sort((a,b) => {
        const d = String(a.fields?.['Date']||'').localeCompare(String(b.fields?.['Date']||''));
        return d || ((a.fields?.['Sequence']||0) - (b.fields?.['Sequence']||0));
      });

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
  const delN = _wnLocParts(f, 'Delivery').n;
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
    // search + quick filters read these; the Δ6 pair (coveredBy/needsLocal)
    // is derived per paint from the local moves (see _wnPaint).
    client: f['Client'] || '',
    route: [_wnNlPickupSummary(f), _wnNlDeliverySummary(f)].join(' '),
    status: f['Status'] || '',
    isGrp: f['Source Type'] === 'Groupage' || delN > 1,
    coveredBy: [], needsLocal: false,
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
/* Νέα παραγγελία ΧΩΡΙΣ έξοδο από το εβδομαδιαίο (owner 10/08).
   Μετά το κλείσιμο της φόρμας ξαναζωγραφίζουμε: αλλιώς η νέα παραγγελία δεν
   εμφανίζεται και ο χρήστης νομίζει ότι χάθηκε. Ο observer πιάνει και τους δύο
   τρόπους απόκρυψης (style ή class) — αν δεν πυροδοτηθεί, το χειρότερο είναι
   να μην ανανεωθεί, όπως θα γινόταν και χωρίς αυτόν. */
function _wnNewOrder() {
  openNatlCreate();
  const ov = document.getElementById('modalOverlay');
  if (!ov) return;
  const visible = () => ov.style.display !== 'none' && !ov.hidden;
  const obs = new MutationObserver(() => {
    if (!visible()) { obs.disconnect(); renderWeeklyNatl(); }
  });
  obs.observe(ov, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
}

function _wnTabs(cur) {
  const today = _wnCurrentWeek();
  const step = d => `<button type="button" class="wk3-step" title="${d<0?'Προηγούμενη':'Επόμενη'} εβδομάδα" onclick="WNATL.week=${cur+d};renderWeeklyNatl()">${d<0?'‹':'›'}</button>`;
  const fmt  = d => String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
  let html = step(-1);
  for (let w = cur-3; w <= cur+3; w++) {
    if (w < 1 || w > 53) continue;
    const wS = _wnWeekStart(w), wE = new Date(wS); wE.setDate(wS.getDate()+6);
    html += `<button type="button" class="wk3-tab${w===cur?' on':''}" title="${fmt(wS)}–${fmt(wE)}" onclick="WNATL.week=${w};renderWeeklyNatl()">W${w}${w===today?' (Τρέχουσα)':''}</button>`;
  }
  html += step(1);
  if (cur !== today)
    html += `<button type="button" class="wk3-tab" style="color: var(--accent-text)" onclick="WNATL.week=${today};renderWeeklyNatl()">Σήμερα</button>`;
  return html;
}

/* ── WN4 CSS ──────────────────────────────────────────────────────────
   Lives here and not in assets/style.css because a batch agent touches ONLY
   its unit's file (plan 2/9 §1.2); the integrator lifts the block into the
   stylesheet once per batch. Tokens only — the static critic counts hex
   literals in modules and the natl allowance (14) may only go down.
   Wave 5 (4/9): DESIGN.md tokens only (ΜΕΡΟΣ Β), the six sizes of ΜΕΡΟΣ Γ
   (nothing under 11px), spacing 4/8/12/16/24/32, radii 6/9999. The base
   .wn4 font-size pins the inherited 16px of the wrappers to the table size
   so no descendant can fall back to the browser default. */
function _wnCss() { return `<style id="wn4-css">
.wn4{--wn4-row:40px;--wn4-card:32px;display:block;width:100%;font-size:13px}
.wn4-head{display:flex;align-items:center;gap:16px;margin-bottom:8px;flex-wrap:wrap}
.wn4-title{font-family:'Syne',sans-serif;font-weight:800;font-size:18px;color:var(--text);display:flex;align-items:center;gap:8px;line-height:1.2}
.wn4-lgb{font:inherit;font-size:11px;font-weight:600;color:var(--text-mid);background:var(--surface-sunken);border:1px solid var(--border);border-radius:6px;padding:4px 8px;cursor:pointer}
.wn4-lgb:hover{color:var(--accent-text)}
.wn4-legend{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:11px;color:var(--text-mid);background:var(--surface-card);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:8px;align-items:center}
.wn4-legend[hidden]{display:none}
.wn4-legend .sw{display:inline-block;width:16px;height:11px;border-radius:6px;vertical-align:-1px;margin-right:4px}
.wn4-head .wk3-tabs{margin:0 auto;padding:4px;align-items:center;background:var(--surface-sunken);border-radius:6px}
.wn4-head .wk3-tab{top:0;border-radius:6px;border:none;font-size:12px} .wn4-head .wk3-tab.on{background:var(--surface-dark);color:var(--text-on-dark)}
.wn4-head .wk3-tab.on::after{display:none}
.wn4-head .wk3-step{font:inherit;font-size:14px;border:none}
.wn4-acts{display:flex;gap:8px;align-items:center}
.wn4-btn{font:inherit;font-size:12px;font-weight:600;color:var(--text-mid);background:var(--surface-card);border:1px solid var(--border);border-radius:6px;padding:4px 12px;cursor:pointer}
.wn4-btn:hover{color:var(--text);background:var(--surface-sunken)}
.wn4-btn.pri{background:var(--accent);color:var(--surface-card);border-color:var(--accent);font-weight:700}
.wn4-btn.pri:hover{background:var(--accent-hover);border-color:var(--accent-hover);color:var(--surface-card)}
.wn4-strip{display:flex;align-items:center;gap:24px;padding:12px 16px;background:var(--surface-card);border:1px solid var(--border);border-radius:6px;margin-bottom:8px;flex-wrap:wrap}
.wn4-alert{display:flex;align-items:center;gap:12px;padding:8px 16px 8px 12px;border:1px solid var(--border);border-radius:6px;background:none;color:var(--text);font:inherit;text-align:left;cursor:default}
.wn4-alert.hot{border-color:var(--danger);cursor:pointer}
.wn4-alert .n{font-family:'Syne',sans-serif;font-weight:700;font-size:18px;line-height:1;padding:4px 8px;border-radius:6px;background:var(--ok);color:var(--surface-card);font-variant-numeric:tabular-nums}
.wn4-alert.hot .n{background:var(--danger)}
.wn4-alert .t{font-family:'Syne',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;color:var(--ok)}
.wn4-alert.hot .t{color:var(--danger)}
.wn4-alert .s{font-size:11px;color:var(--text-mid);margin-top:4px}
.wn4-free .l,.wn4-quick .l{font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-dim);font-variant-numeric:tabular-nums}
.wn4-free .p{font-weight:700;font-size:12px;color:var(--text);margin:4px 0;font-variant-numeric:tabular-nums}
.wn4-free .d{font-size:11px;color:var(--text-mid)}
.wn4-quick .r{display:flex;gap:4px;margin-top:4px;flex-wrap:wrap}
.wn4-qf{font:inherit;font-size:12px;font-weight:600;color:var(--text-mid);background:var(--surface-sunken);border:1px solid var(--surface-sunken);border-radius:6px;padding:4px 12px;cursor:pointer;font-variant-numeric:tabular-nums}
.wn4-qf:hover{color:var(--accent-text)} .wn4-qf.on{background:var(--surface-dark);border-color:var(--surface-dark);color:var(--text-on-dark);font-weight:700}
/* Δ2 «ανενεργό»: a filter whose count is zero would only blank the sheet —
   it is rendered disabled so the eye reads «nothing here» before the click. */
.wn4-qf:disabled{color:var(--text-dim);background:none;border:1px dashed var(--border);cursor:not-allowed}
.wn4-queue{margin-left:auto;display:inline-flex;align-items:center;gap:4px;background:var(--surface-sunken);color:var(--accent-text);border:none;border-radius:6px;padding:8px 12px;font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.wn4-queue b{font-size:13px;font-variant-numeric:tabular-nums}
.wn4 .wk3-sub{margin-bottom:8px}
.wn4 .wk3-range{font-size:12px}
.wn4-cross{font-size:11px;color:var(--accent-text);margin-left:auto;cursor:help}
.wn4-cross+.wk3-range{margin-left:0}
.wn4-cols{position:sticky;top:0;z-index:30;display:grid;grid-template-columns:36px minmax(0,1fr) 280px minmax(0,1fr);background:var(--surface-card);border:1px solid var(--border);border-radius:6px;margin-bottom:8px}
.wn4-cols .c{font-family:'Syne',sans-serif;font-size:12px;font-weight:800;letter-spacing:1.8px;color:var(--text-mid);padding:8px 12px;white-space:nowrap;display:flex;align-items:center;gap:8px}
.wn4-cols .c small{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:.6px;color:var(--text-dim);font-variant-numeric:tabular-nums}
.wn4-cols .c.mid{justify-content:center}
.wn4-cols .hint{margin-left:auto;color:var(--text-dim);cursor:help;font-size:11px;border:1px solid var(--border);border-radius:9999px;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;letter-spacing:0}
.wn4-day{background:var(--surface-page);border:1px solid var(--border);border-radius:6px;padding:4px 8px 8px;margin-bottom:8px}
/* «today» is navy, not accent: the accent is reserved for the one primary
   action of the screen (DESIGN.md ΜΕΡΟΣ Β) and the day marker is not an action. */
.wn4-day.today{border-color:var(--surface-dark)}
.wn4-day.quiet .wn4-dh .d{color:var(--text-dim)}
/* Δ4: κενή μέρα του πίνακα = μία γκρίζα γραμμή. Ορατή (Δ2), υποχωρητική. */
.wn4-dayq{display:flex;align-items:center;gap:8px;padding:4px 12px;border-bottom:1px solid var(--border)}
.wn4-dayq .d{font-family:'Syne',sans-serif;font-weight:600;font-size:11px;letter-spacing:.5px;color:var(--text-dim)}
.wn4-dayq .k{font-size:11px;color:var(--text-dim)}
.wn4-dayq.today .d{color:var(--text)}
.wn4-dayq .now,.wn4-dh .now{font-size:11px;font-weight:800;letter-spacing:1px;color:var(--text-on-dark);background:var(--surface-dark);border-radius:9999px;padding:0 8px}
.wn4-dh{display:flex;align-items:center;gap:8px;padding:8px 4px 4px;flex-wrap:wrap}
.wn4-dh .d{font-family:'Syne',sans-serif;font-weight:700;font-size:14px;color:var(--text)}
.wn4-dh .k{font-size:11px;color:var(--text-dim)}
.wn4-dh .k .bad{color:var(--unassigned);font-weight:500} .wn4-dh .k .hot{color:var(--danger);font-weight:500}
.wn4-none{font-size:11px;color:var(--text-dim);padding:4px}
.wn4 .wk3-row{display:grid;grid-template-columns:36px minmax(0,1fr) 280px minmax(0,1fr);min-height:var(--wn4-row);align-items:center;background:var(--surface-card);border:1px solid var(--border);border-radius:6px;margin-top:4px}
/* Δ5: ΙΔΙΟ hover με το intl (weekly_intl.js:239). Η γραμμή αυτού του πίνακα
   είναι ~1600px· χωρίς φωτισμό το μάτι δεν έχει τι να ακολουθήσει από τον
   πελάτη μέχρι την ανάθεση. Ο παλιός κανόνας έγραφε --bg-card, δηλαδή
   ΑΚΥΡΩΝΕ ρητά το καθολικό .wk3-row:hover του style.css. */
.wn4 .wk3-row:hover{background:var(--surface-sunken)}
.wn4 .wk3-row.hot{border-color:var(--danger);border-left-width:3px}
.wn4 .wk3-row.sn{background:var(--surface-page)}
.wn4 .wk3-num{border:none;font-size:11px;color:var(--text-dim);flex-direction:column;gap:0;padding:0 4px 0 8px}
.wn4 .wk3-num.imp{color:var(--text);font-weight:700}
.wn4 .wk3-leg{padding:4px;overflow:visible;align-items:center;gap:4px;min-width:0}
.wn4 .wk3-leg.void,.wn4 .wk3-leg.bgap{background:none;justify-content:stretch}
.wn4-dark{flex:1;min-width:0;min-height:var(--wn4-card);border-radius:6px;background:var(--surface-dark);display:flex;align-items:center;padding:0 8px;font-size:11px;color:var(--text-on-dark)}
.wn4-drop{flex:1;min-width:0;min-height:var(--wn4-card);border-radius:6px;border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-dim);font-style:italic;text-align:center;padding:0 8px}
.wn4 .wk3-leg.dh{outline:none;background:none} .wn4 .wk3-leg.dh .wn4-drop{border-color:var(--accent);background:var(--surface-sunken)}
.wn4-arrow{color:var(--text-dim);font-size:12px;flex-shrink:0;padding:0 4px}
.wn4-card{flex:1 1 0;min-width:0;min-height:var(--wn4-card);display:flex;align-items:center;gap:4px;padding:0 8px;background:var(--surface-card);border:1px solid var(--border);border-radius:6px}
.wn4-card.ok{border-color:var(--ok)}
.wn4-card .dt{font-size:11px;font-weight:700;color:var(--text-mid);background:var(--surface-sunken);border-radius:6px;padding:0 4px;flex-shrink:0;font-variant-numeric:tabular-nums}
/* Κελί δύο σειρών (DESIGN.md ΜΕΡΟΣ Ζ.1): name 13px, qualifier 11px dim. */
.wn4-card .nm{min-width:0;display:flex;flex-direction:column;line-height:1.2}
.wn4-card .nm b{font-size:13px;font-weight:600;color:var(--text);white-space:normal;overflow-wrap:anywhere}
.wn4-card .nm small{font-size:11px;color:var(--text-dim);white-space:normal}
.wn4-card .ok{color:var(--ok);font-weight:700;font-size:12px;flex-shrink:0}
.wn4-card .sp{flex:1 1 0;min-width:4px}
.wn4-card .pl{font-size:12px;font-weight:500;color:var(--text);flex-shrink:0;font-variant-numeric:tabular-nums}
.wn4-card .wk3-hh{margin-left:0;background:none;color:var(--text-mid);border:1px solid var(--border);font-weight:700;font-size:11px;border-radius:6px;font-variant-numeric:tabular-nums}
.wn4-chip{font:inherit;font-size:11px;font-weight:500;border-radius:6px;padding:0 4px;white-space:nowrap;border:none;flex-shrink:0;line-height:1.5}
.wn4-chip.need{color:var(--danger);border:1px solid var(--danger);background:none}
.wn4-chip.cov{color:var(--ok);border:1px solid var(--ok);background:none;cursor:pointer}
.wn4-chip.grp{color:var(--text);background:var(--surface-sunken);cursor:pointer;font-weight:600;font-variant-numeric:tabular-nums}
.wn4-chip.grp:hover{color:var(--accent-text)} .wn4-chip.grp.full{color:var(--warn)} .wn4-chip.grp.over{color:var(--danger)}
.wn4-chip.srv{color:var(--accent-text);background:var(--surface-sunken);cursor:pointer}
.wn4-chip.solo{color:var(--text-mid);background:var(--surface-sunken)}
.wn4 .wk3-assign{display:grid;grid-template-columns:40px 1fr 40px;gap:0;padding:0;align-self:stretch;align-items:center}
.wn4 .wk3-assign .wk3-prt{justify-self:center;border:1px solid var(--border);border-radius:6px;font-size:12px;padding:4px}
.wn4 .wk3-assign .wk3-prt.a sup{font-size:11px;font-weight:700}
.wn4 .wk3-pill{height:auto;min-height:var(--wn4-card);flex-direction:column;justify-content:center;gap:0;line-height:1.2;padding:4px 8px;margin:0 4px;width:auto;font-size:12px;font-weight:600;white-space:normal;overflow:visible;text-align:center;font-variant-numeric:tabular-nums}
.wn4 .wk3-pill small{font-size:11px;font-weight:400;overflow:visible;text-overflow:clip;white-space:normal}
.wn4 .wk3-pill.own{background:var(--surface-dark);color:var(--text-on-dark)}
.wn4 .wk3-pill.own small,.wn4 .wk3-pill.par small{color:var(--text-on-dark)}
.wn4 .wk3-pill.par{color:var(--text-on-dark)}
/* ΠΡΟΣ ΑΝΑΘΕΣΗ (owner 4/9): the empty box is a pending action, written as
   one — same dark red as the legend, no fill, so the word is what you read. */
.wn4 .wk3-pill.un{background:none;border:1px dashed var(--unassigned);color:var(--unassigned)}
.wn4 .wk3-pill.unimp{font-size:11px;background:none;border:1px dashed var(--border);color:var(--text-mid)}
.wn4 .wk3-flags{width:auto;gap:4px}
.wn4 .wi-badge{font-size:11px;padding:0 4px;border-radius:6px}
.wn4 .wi-cross,.wn4 .wi-exec{font-size:11px}
.wn4 .wk3-stopn{width:16px;height:16px;font-size:11px;background:var(--surface-dark);color:var(--text-on-dark)}
.wn4 .wi-sync{margin-top:0;font-size:11px;min-height:0}
.wn4 .wi-pop-section-lbl,.wn4 .wi-pop-lbl,.wn4 .wi-pop-subtitle,.wn4 .wi-pop-divider{font-size:11px}
.wn4-empty{display:flex;align-items:center;gap:12px;padding:8px 12px;border:1px dashed var(--border);border-radius:6px;background:var(--surface-card);margin-bottom:8px;font-size:12px;color:var(--text-mid)}
.wn4-empty b{font-family:'Syne',sans-serif;font-weight:800;color:var(--text)}
.wn4-empty button{margin-left:auto;font:inherit;font-size:12px;font-weight:600;color:var(--accent-text);background:none;border:none;cursor:pointer}
.wn4 .wn3-stops{background:var(--surface-sunken);border:none;border-radius:0 0 6px 6px;margin:0 8px;padding:8px 12px 8px 44px}
.wn4 .wn3-stops .st .o,.wn4 .wn3-stops .ld{font-size:11px}
.wn4 .wn3-stops .st .p{color:var(--text)} .wn4 .wn3-stops .tot.full .p{color:var(--warn)}
.wn4-sec{margin-top:16px}
.wn4-sech{display:flex;align-items:center;gap:8px;padding:8px 4px;flex-wrap:wrap}
.wn4-sech .t{font-family:'Syne',sans-serif;font-size:12px;font-weight:800;letter-spacing:2px;color:var(--text)}
.wn4-sech .s{font-size:11px;color:var(--text-dim)}
.wn4-sech .wn4-btn{margin-left:auto}
.wn4-ladd{font:inherit;font-size:11px;font-weight:600;color:var(--text-mid);background:none;border:1px solid var(--border);border-radius:6px;padding:0 8px;cursor:pointer;margin-left:auto}
.wn4-ladd:hover{color:var(--accent-text);border-color:var(--accent)}
.wn4-lfail{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--danger);border-radius:6px;background:var(--surface-card);font-size:12px;color:var(--danger)}
.wn4-lfail small{color:var(--text-mid);font-size:12px} .wn4-lfail button{margin-left:auto}
.wn4-lrow{display:grid;grid-template-columns:36px 240px minmax(0,1fr);background:var(--surface-card);border:1px solid var(--border);border-radius:6px;margin-top:4px}
.wn4-lrow.hot{border-color:var(--danger);border-left-width:3px}
.wn4-lrow .n{font-size:11px;color:var(--text-dim);padding:12px 0 0 12px}
.wn4-drv{margin:4px;min-height:36px;display:flex;flex-direction:column;justify-content:center;gap:0;padding:4px 8px;background:var(--surface-sunken);border:1px solid var(--border);border-radius:6px}
.wn4-drv b{font-size:12px;font-weight:600;color:var(--text)} .wn4-drv small{font-size:11px;color:var(--text-mid)}
.wn4-drv.need{background:none;border:1px dashed var(--danger)} .wn4-drv.need b{color:var(--danger)}
.wn4-drv.need button{font:inherit;font-size:11px;font-weight:700;color:var(--accent-text);background:none;border:none;padding:0;cursor:pointer;text-align:left}
.wn4-mvs{display:flex;flex-direction:column;gap:4px;padding:4px 8px;min-width:0}
.wn4-mv{display:flex;align-items:center;gap:4px;min-width:0;flex-wrap:wrap}
.wn4-mv .i{font-size:11px;font-weight:700;color:var(--text-mid);flex-shrink:0}
.wn4-mv .wn4-card{flex:0 1 300px;min-height:32px} .wn4-mv .wn4-card.f{flex-basis:260px}
.wn4-mv .ds{font-size:11px;color:var(--text-dim)}
.wn4-mv .rm{margin-left:auto;font:inherit;font-size:13px;color:var(--text-dim);background:none;border:none;cursor:pointer;padding:0 4px;border-radius:6px}
.wn4-mv .rm:hover{color:var(--danger);background:var(--surface-sunken)}
.wn4-addst{font:inherit;font-size:11px;font-weight:500;color:var(--text-dim);background:none;border:none;padding:0;cursor:pointer;text-align:left}
.wn4-addst:hover{color:var(--accent-text)}
.wn4-foot{display:flex;align-items:center;gap:16px;padding:8px 16px;background:var(--surface-card);border:1px solid var(--border);border-radius:6px;margin-top:12px;flex-wrap:wrap}
.wn4-foot .t{font-size:11px;color:var(--text-mid);display:inline-flex;align-items:center;gap:4px;background:none;border:none;padding:0;font-family:inherit}
.wn4-foot .t b{font-weight:700;font-size:13px;color:var(--text);font-variant-numeric:tabular-nums}
.wn4-foot .t.bad b{color:var(--unassigned)} .wn4-foot .t.hot b{color:var(--danger)}
.wn4-foot .t[onclick]{cursor:pointer}
.wn4-foot .m{font-size:11px;color:var(--text-mid)} .wn4-foot .m.hot{color:var(--danger);font-weight:600}
@media print{.wn4-strip,.wn4-acts,.wk3-sub{display:none}}
</style>`; }

// Element id of a row on the board — ns rows are #wn-row-<id>, standalone
// ΑΝΟΔΟΣ rows #wn-sn-<orderId>. Used by every jump (tally, chips, banner).
function _wnRowElId(r) { return r.type==='southnorth' ? 'wn-sn-'+r.orderId : 'wn-row-'+r.id; }

// «Παραδόθηκε» για τα εθνικά: ΥΠΟΛΟΓΙΖΕΤΑΙ από την ημερομηνία, δεν διαβάζεται
// από το Status (owner 10/8, docs/DECISION_LOG.md «Το «παραδόθηκε» για τα
// εθνικά»). Καμία διαδρομή του repo δεν γράφει ποτέ Status='Delivered' σε
// national_loads — το 'Delivered' γράφεται μόνο σε ORDERS από το daily_ops.
// Μετρημένο 3/9: status='Delivered' 0/20, delivery_datetime<now() 20/20, άρα ο
// παλιός μετρητής (`r.status==='Delivered'`) έδειχνε δομικά 0 σε εβδομάδα που
// είχε παραδοθεί ολόκληρη — και το tooltip του ισχυριζόταν «γραμμένο γεγονός».
// Ο κανόνας είναι ΑΝΤΙΓΡΑΦΟ του _invIsDelivered (modules/invoicing.js:127):
// δεν υπάρχει σήμερα κοινός helper και ο κύκλος αυτός αγγίζει ένα αρχείο.
// ΕΚΚΡΕΜΟΤΗΤΑ: να ανέβει σε core/data-helpers.js ώστε να υπάρχει μία πηγή.
function _wnIsDelivered(row) {
  if (row.status === 'Delivered') return true;   // αν κάποτε γραφτεί, μετράει
  if (row.status === 'Cancelled') return false;
  const dt = _wnOrd(row)?.fields?.['Delivery DateTime'];
  if (!dt) return false;
  const t = new Date(dt).getTime();
  return !isNaN(t) && t < Date.now();
}

function _wnPaint() {
  // Δ6: χάρτης «ποιο εθνικό φορτίο καλύπτεται από ποια τοπική κίνηση».
  // Μία φορά ανά paint — τον διαβάζει κάθε εθνική γραμμή.
  WNATL._locByParent = _wnLocalsByParent();
  const { rows, week, data } = WNATL;
  const _wnI = (n, s) => (typeof icon === 'function') ? icon(n, s || 14) : '';
  // Δ6 — the local-coverage state of every leg, derived once per paint.
  // «χρειάζεται τοπικό» = a LOCAL_MOVE points at this load and nobody drives
  // it yet (SPEC §3.5: the need is declared explicitly and stays visible
  // until covered). «καλύπτεται τοπικά» = at least one such move has a driver.
  rows.forEach(r => {
    const ms = WNATL._locByParent[r.orderId] || [];
    r.coveredBy = ms.filter(m => _fid(m.fields?.['Driver']) || _fid(m.fields?.['Partner']));
    r.needsLocal = ms.length > 0 && r.coveredBy.length === 0;
  });
  const nsRows = rows.filter(r => r.type==='northsouth');
  const snRows = rows.filter(r => r.type==='southnorth');
  const assigned = nsRows.filter(r => r.saved).length;
  const pending  = nsRows.filter(r => !r.saved).length;
  const total = nsRows.length + snRows.length;
  const pct = total ? Math.round(assigned / total * 100) : 0;

  // Same reporting contract as weekly_intl (kanban contract #11): the numbers
  // below are the AUDIT's, unchanged since Wave 1 — weekNumberDefault comes
  // from _wnCurrentWeek(), which now calls the canonical isoWeekNumber()
  // directly (design audit 5/9/2026, A1). The tab bucketing (_wnWeekStart,
  // Sunday-start WEEKNUM) is unchanged, so weekNumber and weekNumberDefault
  // can still diverge by that tab numbering — the audit keeps watching it.
  if (typeof reportPageMetrics === 'function') reportPageMetrics('weekly_natl', {
    weekNumber: week,
    weekNumberDefault: _wnCurrentWeek(),
    kathodos: nsRows.length,
    anodos: snRows.length,
    assigned,
    pending,
    completionPct: pct,
  });

  // Visible tally (contract #3): every fraction carries its denominator.
  // «ανατεθειμένα» counts BOTH directions (an ΑΝΟΔΟΣ with a vehicle is
  // assigned too) — the audit's `assigned` above counts ΚΑΘΟΔΟΣ only and is
  // left as it was so the metric history stays comparable.
  const assignedAll = rows.filter(r => r.saved).length;
  const pendingAll  = total - assignedAll;
  const uncovered   = rows.filter(r => r.needsLocal).length;
  const matchedN    = nsRows.filter(r => r.matchedId).length;
  const snTotal     = snRows.length + matchedN;           // every ΑΝΟΔΟΣ of the week
  const grpN        = rows.filter(r => r.isGrp).length;
  const delivered   = rows.filter(_wnIsDelivered).length;
  const crossRows   = rows.filter(r => { const f = _wnOrd(r)?.fields; const dw = _wnWeekOf(f?.['Delivery DateTime']); return dw != null && dw !== week; });
  const _firstRow = (pred) => { const r = rows.find(pred); return r ? _wnRowElId(r) : ''; };
  const _jump = id => id ? `_ccJump('${id}')` : '';

  // ΕΛΕΥΘΕΡΑ ΣΗΜΕΡΑ: current week → today's assignments (board + locals);
  // any other week → the whole week, and the label says so.
  const todayKey = (typeof localToday==='function') ? localToday() : toLocalDate(new Date());
  const isCur = week === _wnCurrentWeek();
  const busyT = new Set(), busyD = new Set();
  rows.forEach(r => {
    if (isCur && _wnRowKey(r) !== todayKey) return;
    if (r.truckId) busyT.add(r.truckId);
    if (r.driverId) busyD.add(r.driverId);
  });
  (data.locals||[]).forEach(m => {
    if (isCur && toLocalDate(m.fields?.['Date']) !== todayKey) return;
    const d = _fid(m.fields?.['Driver']); if (d) busyD.add(d);
    const t = _fid(m.fields?.['Truck']);  if (t) busyT.add(t);
  });
  const freeT = data.trucks.filter(t => !busyT.has(t.id));
  const freeD = data.drivers.filter(d => !busyD.has(d.id));
  const _few = (arr, n) => arr.slice(0, n).map(x => escapeHtml(x.label)).join(' · ') + (arr.length > n ? ` · +${arr.length-n}` : '');

  const wS   = _wnWeekStart(week);
  const wE   = new Date(wS);  wE.setDate(wS.getDate()+6);
  const fmtD = d => d.toLocaleDateString('el-GR',{day:'numeric',month:'short'});
  const weekRange = `${fmtD(wS)} – ${fmtD(wE)}`;
  const role = (typeof ROLE !== 'undefined' ? ROLE : '');
  const hhmm = d => d ? String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0') : '—';
  const localsFailed = !!data._localsFailed;
  const lDrivers = new Set((data.locals||[]).map(m => _fid(m.fields?.['Driver']) || ('p:'+_fid(m.fields?.['Partner']))).filter(k => k && k !== 'p:'));

  // Δ3 (3/9): ΔΥΟ μεγέθη, δύο αριθμοί. Πριν, το πλακίδιο έδειχνε
  // `uncovered + pendingAll` κάτω από μία διπλή ετικέτα: ένα «5» μπορούσε να
  // είναι 5+0 ή 0+5 και ο dispatcher δεν είχε τρόπο να ξέρει ποιο — ούτε πού
  // να πάει. Χωριστά, το καθένα δείχνει τον δικό του αριθμό και πηδά στη δική
  // του πρώτη γραμμή.
  const uncovSub = `${uncovered} από ${total} σκέλη δηλώθηκαν «χρειάζεται τοπικό» και δεν έχουν οδηγό`;
  const pendSub  = `${pendingAll} από ${total} σκέλη χωρίς φορτηγό και χωρίς συνεργάτη`;

  document.getElementById('content').innerHTML = `
    ${_wnCss()}
    <div class="wn3 wk3 wn4 ${_wnQuietOn()?'wi-quiet':''}">

    <!-- head: title + legend · week tabs · actions (contract #4 inventory) -->
    <div class="wn4-head">
      <div>
        <!-- Δ7 (3/9): το in-page breadcrumb αφαιρέθηκε — το topbar του
             core/router.js τυπώνει ήδη «Σχεδιασμός / Weekly National» δύο
             εκατοστά πιο πάνω. Το intl δεν έχει δεύτερο. -->
        <div class="wn4-title">Πίνακας Εθνικών Δρομολογίων
          <button class="wn4-lgb" onclick="const l=document.getElementById('wn-legend');l.hidden=!l.hidden" title="Τι σημαίνει κάθε χρώμα και σήμα">? υπόμνημα</button></div>
      </div>
      <nav class="wk3-tabs" aria-label="Εβδομάδες">${_wnTabs(week)}</nav>
      ${typeof weekPhaseBadge==='function'?weekPhaseBadge(week,_wnCurrentWeek()):''}
      <div class="wn4-acts">
        <button class="wn4-btn" onclick="_wnToggleDetails()" title="Πρόσθετες ενδείξεις γραμμής (↦ όρια εβδομάδας, ⚠ φόρτωση χωρίς ανάθεση)">Λεπτομέρειες${_wnQuietOn()?'':' ✓'}</button>
        <button class="wn4-btn" onclick="_wnPrintWeek()">Εκτύπωση</button>
        <button class="wn4-btn" onclick="_wnExportCSV()">CSV</button>
        <button class="wn4-btn" onclick="renderWeeklyNatl()" title="Ανανέωση">Ανανέωση</button>
        <button class="wn4-btn pri" onclick="_wnNewOrder()" title="Νέα εθνική παραγγελία — χωρίς έξοδο από το εβδομαδιαίο">+ Νέα παραγγελία</button>
      </div>
    </div>
    <div id="wn-legend" class="wn4-legend" hidden>
      <span><span class="sw" style="background:var(--surface-dark)"></span>ΙΔ. = ιδιόκτητο (πινακίδα + οδηγός)</span>
      <span><span class="sw" style="background:var(--chip-partner)"></span>ΣΥΝ. = συνεργάτης (επωνυμία + πινακίδες)</span>
      <span><span class="sw" style="border:1px dashed var(--unassigned)"></span>ΠΡΟΣ ΑΝΑΘΕΣΗ — κλικ για ανάθεση</span>
      <span><span class="sw" style="border:1px dashed var(--border)"></span>ΑΝΟ · χωρίς όχημα</span>
      <!-- Δ6: εδώ ζει η οδηγία του κενού κελιού ΑΝΟΔΟΣ, μία φορά. -->
      <span><span class="sw" style="border:1px dashed var(--border)"></span>κενό κελί ανόδου «—» = σύρε μια άνοδο εδώ· αν μείνει κενό μετρά στις «χωρίς ταίριασμα»</span>
      <span><span class="sw" style="background:var(--surface-dark)"></span>δεν αναμένεται σκέλος</span>
      <span>— = δεν υπάρχει σκέλος (μονή διαδρομή)</span>
      <span><span class="sw" style="border:1px solid var(--ok)"></span>✓ φορτώθηκε / παραδόθηκε (Status)</span>
      <span>PE = ανταλλαγή παλετών · ①② = σειρά σημείων · ⟳ γράφεται · ✓ γράφτηκε · ⚠ ΔΕΝ γράφτηκε</span>
    </div>

    <!-- strip: uncovered/pending alert · free today · quick filters · Pick Ups queue (owner) -->
    <div class="wn4-strip">
      <button type="button" class="wn4-alert${uncovered?' hot':''}" title="${escapeHtml(uncovSub)}${uncovered?' — κλικ: πήγαινε στο πρώτο':''}" onclick="${_jump(_firstRow(r=>r.needsLocal))}">
        <span class="n">${uncovered}</span>
        <span><div class="t">ΑΚΑΛΥΠΤΑ ΚΟΜΜΑΤΙΑ</div><div class="s">${uncovSub}</div></span>
      </button>
      <button type="button" class="wn4-alert${pendingAll?' hot':''}" title="${escapeHtml(pendSub)}${pendingAll?' — κλικ: πήγαινε στο πρώτο':''}" onclick="${_jump(_firstRow(r=>!r.saved))}">
        <span class="n">${pendingAll}</span>
        <span><div class="t">ΠΡΟΣ ΑΝΑΘΕΣΗ</div><div class="s">${pendSub}</div></span>
      </button>
      <div class="wn4-free">
        <div class="l">ΕΛΕΥΘΕΡΑ ${isCur?'ΣΗΜΕΡΑ':'ΤΗΝ ΕΒΔΟΜΑΔΑ'} · ${freeT.length}/${data.trucks.length}</div>
        <div class="p">${freeT.length ? _few(freeT, 3) : 'κανένα φορτηγό ελεύθερο'}</div>
        <div class="d">οδηγοί χωρίς ανάθεση ${freeD.length}/${data.drivers.length}${freeD.length?' · '+_few(freeD, 2):''}</div>
      </div>
      <div class="wn4-quick" id="wn-quick">
        <div class="l">ΓΡΗΓΟΡΑ ΦΙΛΤΡΑ</div>
        <div class="r">
          <button class="wn4-qf" data-qf="" onclick="_wnQuick('')"${total?'':' disabled'}>Όλα (${total})</button>
          <button class="wn4-qf" data-qf="pending" onclick="_wnQuick('pending')"${pendingAll?'':' disabled'}>Προς ανάθεση (${pendingAll})</button>
          <button class="wn4-qf" data-qf="unmatched" onclick="_wnQuick('unmatched')"${snRows.length?'':' disabled'}>Άνοδοι χωρίς ταίριασμα (${snRows.length})</button>
          <button class="wn4-qf" data-qf="uncovered" onclick="_wnQuick('uncovered')"${uncovered?'':' disabled'}>Ακάλυπτα (${uncovered})</button>
          <button class="wn4-qf" data-qf="groupage" onclick="_wnQuick('groupage')"${grpN?'':' disabled'}>Groupage (${grpN})</button>
        </div>
      </div>
      <span id="wn-pickups-q" style="margin-left:auto"></span>
    </div>

    <!-- search / status / details / cross-week / range — wk3-sub, twin του intl -->
    <div class="wk3-sub">
      <div class="entity-search-wrap">
        ${_wnI('search')}
        <input id="wn-search" class="entity-search-input" type="text" placeholder="Αναζήτηση πελάτη, φορτηγού, οδηγού" oninput="WNATL.filter=this.value.toLowerCase().trim();_wnApplyFilter()" value="${escapeHtml(WNATL.filter||'')}">
      </div>
      <!-- WN-1β (Wave 1): values ΑΜΕΤΑΒΛΗΤΑ (_wnApplyFilter) — plus the two of the frame -->
      <select id="wn-status" class="svc-filter" onchange="_wnQuick(this.value)">
        <option value="">Κατάσταση: Όλες</option>
        <option value="pending">Προς ανάθεση</option>
        <option value="assigned">Ανατεθειμένα</option>
        <option value="unmatched">Άνοδοι χωρίς ταίριασμα</option>
        <option value="uncovered">Ακάλυπτα κομμάτια</option>
        <option value="groupage">Groupage</option>
      </select>
      <button id="wn-clear" class="btn btn-ghost btn-sm" style="display:none" onclick="_wnClearFilter()">${_wnI('x', 12)} Καθαρισμός</button>
      ${crossRows.length ? `<span class="wn4-cross" title="Παραδίδουν σε άλλη εβδομάδα — στην προβολή εκείνης δεν εμφανίζονται (φίλτρο ανά εβδομάδα ΦΟΡΤΩΣΗΣ)" onclick="${_jump(_wnRowElId(crossRows[0]))}">↦ ${crossRows.length} παραδίδ${crossRows.length===1?'ει':'ουν'} σε άλλη εβδομάδα</span>` : ''}
      <span class="wk3-range">Εβδομάδα ${week} · ${weekRange} · Κυρ–Σαβ</span>
    </div>

    <!-- sheet: sticky column identity (contract #1) + one panel per day (contract #2) -->
    <div class="wn4-cols">
      <div class="c"></div>
      <div class="c">ΚΑΘΟΔΟΣ <small>Βορράς → Νότος · ${nsRows.length}</small></div>
      <div class="c mid">ΑΝΑΘΕΣΗ</div>
      <div class="c">ΑΝΟΔΟΣ <small>Νότος → Βορράς · ${snTotal}</small><span class="hint" title="Σύρε μια άνοδο πάνω σε κάθοδο για ταίριασμα σε round trip">ⓘ</span></div>
    </div>
    <div id="wn-rows">
      ${rows.length ? '' : `<div class="wn4-empty"><b>Άδειο φύλλο — W${week}</b> Καμία εθνική κίνηση ακόμη. Δημιούργησε εθνική παραγγελία, ή ενεργοποίησε τον διακόπτη Βέροιας σε μια διεθνή.<button onclick="navigate('orders_natl')">Άνοιγμα Εθνικών Παραγγελιών ▸</button></div>`}
      ${_wnAllRowsHTML()}
    </div>

    <!-- Δ1: δεύτερη ενότητα, ίδιο πλάτος και ίδιες ημέρες με τα εθνικά.
         Δ2 (ΠΡΟΣΩΡΙΝΟ, 3/9): όσο ο πίνακας LOCAL_MOVES δεν υπάρχει στον
         Worker, το κουμπί δημιουργίας κρύβεται — βλ. σχόλιο στο _wnAddLocal. -->
    <div class="wn4-sec">
      <div class="wn4-sech">
        <span class="t">ΤΟΠΙΚΕΣ ΠΑΡΑΔΟΣΕΙΣ</span>
        <span class="s">Οδηγός × ημέρα · οι κινήσεις της ημέρας με τη σειρά τους · κάθε κίνηση δείχνει ποιο φορτίο εξυπηρετεί</span>
        ${localsFailed ? '' : `<button class="wn4-btn" onclick="_wnAddLocal('${toLocalDate(_wnWeekStart(week))}')">+ Τοπική κίνηση</button>`}
      </div>
      <div id="wn-locals">${_wnLocalsHTML()}</div>
    </div>

    <!-- bottom tally — contract #3: closed list, every fraction with its denominator -->
    <div class="wn4-foot">
      <span class="t"><b>${nsRows.length}</b> κάθοδο${nsRows.length===1?'ς':'ι'}</span>
      <span class="t"><b>${snTotal}</b> άνοδο${snTotal===1?'ς':'ι'}</span>
      <span class="t" title="Άνοδοι που κάθονται σε round trip με κάθοδο"><b>${matchedN}/${snTotal}</b> άνοδοι ταιριασμένες</span>
      <span class="t" title="Σκέλη με φορτηγό ή συνεργάτη, και στις δύο κατευθύνσεις"><b>${assignedAll}/${total}</b> ανατεθειμένα</span>
      <button class="t bad" title="Σκέλη χωρίς φορτηγό ΚΑΙ χωρίς συνεργάτη — κλικ: πήγαινε στο πρώτο" onclick="${_jump(_firstRow(r=>!r.saved))}"><b>${pendingAll}/${total}</b> προς ανάθεση</button>
      <button class="t hot" title="Δηλώθηκαν «χρειάζεται τοπικό» και δεν έχουν οδηγό — κλικ: πήγαινε στο πρώτο" onclick="${_jump(_firstRow(r=>r.needsLocal))}"><b>${uncovered}/${total}</b> ακάλυπτα κομμάτια</button>
      <span class="t" title="Υπολογισμός από το ρολόι, όχι γραμμένο Status — owner 10/8: το «παραδόθηκε» των εθνικών δεν γράφεται στη βάση"><b>${delivered}/${total}</b> πέρασε η ώρα παράδοσης</span>
      <span class="t" title="${localsFailed?'Ο πίνακας τοπικών κινήσεων δεν είναι διαθέσιμος':''}"><b>${localsFailed?'—':(data.locals||[]).length}</b> τοπικές κινήσεις · ${localsFailed?'—':lDrivers.size} οδηγοί</span>
      <span class="m">Ενημερώθηκε ${hhmm(WNATL._loadedAt)}</span>
      <span class="m" id="wn-syncsum"></span>
      <span class="m" id="wn-prev"></span>
    </div>

    <div id="wn-ctx"></div>
    <div id="wn-popover"></div>
    </div>
  `;

  window._wnDragging = null;
  // A5 (design audit 5/9/2026): .wk3-tabs now scrolls instead of overflowing
  // the page at 390px — keep the active tab visible inside that scroll area.
  document.querySelector('.wk3-tabs .wk3-tab.on')?.scrollIntoView({inline:'nearest',block:'nearest'});
  _wnApplyFilter();
  _wnSyncSummary();

  // «vs last week» — kept from the Command Center as one honest line in the
  // tally. #28 rule unchanged: a failed fetch HIDES the line rather than show
  // a fabricated «0 last week» that would make this week look like a record.
  safeFetch(() => fetchPreviousWeekStats(week, TABLES.NAT_LOADS, true), 'weekly natl: previous week stats', {total:0,assigned:0})
  .then(prev => {
    const el = document.getElementById('wn-prev');
    if (!el) return;
    if (didFail(prev)) { el.textContent = ''; return; }
    el.textContent = `W${week-1}: ${prev.total} φορτία · ${prev.assigned}/${prev.total} ανατεθειμένα`;
    el.title = 'Η προηγούμενη εβδομάδα, για σύγκριση';
  }).catch(e => console.warn('prev week (natl):', e));

  // Φέτα 3 (Δ11): η ουρά του National Pick Ups. Τον χειμώνα εκεί κάθονται
  // δεκάδες γραμμές groupage που περιμένουν να γίνουν φορτηγό — και το
  // εβδομαδιαίο δεν τις έβλεπε καθόλου. Μόνο μέτρημα: το petras-assign δεν
  // αγγίζεται. Αν αποτύχει ή είναι μηδέν, ο μετρητής απλώς δεν εμφανίζεται —
  // ένα «0 στην ουρά» που στην πραγματικότητα είναι σφάλμα δικτύου θα ήταν
  // χειρότερο από το τίποτα.
  // owner 12/8: το Pick Ups έγινε owner-only. Ο μετρητής είναι κουμπί προς
  // εκείνη τη σελίδα — σε άλλον ρόλο θα οδηγούσε σε «δεν έχεις πρόσβαση».
  if (role !== 'owner') {
    const q0 = document.getElementById('wn-pickups-q');
    if (q0) q0.outerHTML = '';
  } else
  safeFetch(() => atGetAll(TABLES.GL_LINES, { filterByFormula: `{Status}="Unassigned"`, fields: ['Status'] }, false),
            'weekly natl: pick ups queue', [])
  .then(gl => {
    const el = document.getElementById('wn-pickups-q');
    if (!el || didFail(gl) || !gl.length) return;
    el.outerHTML = `<button class="wn4-queue" title="Γραμμές groupage που περιμένουν ανάθεση στο National Pick Ups — κλικ: άνοιγμα της σελίδας" onclick="navigate('weekly_pickups')"><b>${gl.length}</b> στην ουρά Pick Ups ↗</button>`;
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
// The NAT_LOAD behind a row. ns rows point at orderIds[0], sn rows at orderId.
function _wnOrd(row) {
  return (row.type==='southnorth')
    ? WNATL.data.southnorth.find(r => r.id===row.orderId)
    : WNATL.data.northsouth.find(r => r.id===row.orderIds[0]);
}
// The day a row belongs to: its FIRST loading (SPEC §3.1). Delivery only if
// the loading is missing entirely; 'zzz' sorts undated rows after the week.
function _wnRowKey(row) {
  const f = _wnOrd(row)?.fields || {};
  return toLocalDate(f['Loading DateTime'] || f['Delivery DateTime'] || '') || 'zzz';
}

function _wnAllRowsHTML() {
  const { week } = WNATL;
  const nsRows = WNATL.rows.filter(r => r.type==='northsouth');
  const snRows = WNATL.rows.filter(r => r.type==='southnorth');
  let idx = 0, snIdx = 0;

  const dayMap = {};
  const put = (row, bucket) => {
    const k = _wnRowKey(row);
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
  WNATL._rowNo = {};
  let html = '';

  keys.forEach(key => {
    const { ns, sn } = dayMap[key] || { ns:[], sn:[] };
    const isToday = key === todayKey;
    const lbl = _wnDayLabel(key);
    const parts = [];
    if (ns.length) parts.push(`${ns.length} κάθοδο${ns.length===1?'ς':'ι'}`);
    const p = ns.filter(r => !r.saved).length;
    if (p) parts.push(`<span class="bad">${p} προς ανάθεση</span>`);
    const u = [...ns, ...sn].filter(r => r.needsLocal).length;
    if (u) parts.push(`<span class="hot">${u} χρειάζεται τοπικό</span>`);
    if (sn.length) parts.push(`${sn.length} άνοδο${sn.length===1?'ς':'ι'} χωρίς ταίριασμα`);

    // Δ4 (3/9): η κενή μέρα ΜΕΝΕΙ ορατή (Δ2 — «η Τετάρτη δεν έχει τίποτα,
    // γιατί;»), αλλά ως ΜΙΑ γκρίζα γραμμή, όχι ως πλαισιωμένη κάρτα 66px με
    // τίτλο 15px/700 ίδιου βάρους με μέρα που έχει δουλειά. Μετρημένο: 7 κενές
    // μέρες = 462px, και στα 1440 φαινόντουσαν ΜΗΔΕΝ γραμμές δουλειάς πάνω από
    // το τσάκισμα. Το κείμενο κόπηκε σε «Καμία κίνηση»: το «η κενή μέρα είναι
    // πληροφορία, όχι απουσία» είναι η αιτιολόγηση του σχεδιαστή — σωστή, αλλά
    // δεν χρειάζεται να τυπώνεται 7 φορές στην οθόνη του dispatcher.
    if (!ns.length && !sn.length) {
      html += `<div class="wn4-dayq${isToday?' today':''}" data-day="${key}">
        <span class="d">${lbl.name} ${lbl.date}</span>${isToday?'<span class="now">ΣΗΜΕΡΑ</span>':''}<span class="k">Καμία κίνηση</span></div>`;
      return;
    }

    html += `<section class="wn4-day${isToday?' today':''}" data-day="${key}">
      <div class="wn4-dh"><span class="d">${lbl.name} ${lbl.date}</span>${isToday?'<span class="now">ΣΗΜΕΡΑ</span>':''}<span class="k">${parts.join(' · ')}</span></div>`;
    ns.forEach(row => { WNATL._rowNo[row.id] = String(idx+1); html += _wnRowHTML(row, idx++); });
    // Β.3-4 (Wave 1): ΑΝΟΔΟΣ rows numbered A1… like the intl I1… imports.
    sn.forEach(row => { WNATL._rowNo[row.id] = 'A'+(snIdx+1); html += _wnSnRowHTML(row, ++snIdx); });
    html += `</section>`;
  });

  return html;
}

/* ═══ ΤΟΠΙΚΕΣ ΠΑΡΑΔΟΣΕΙΣ (Δ1/Δ6/Δ7/Δ8) ═══════════════════════════════
   Γραμμή = ΟΔΗΓΟΣ × ΗΜΕΡΑ, με τις κινήσεις του από κάτω. Είναι η απόφαση
   που παίρνει ο dispatcher: «ποιον στέλνω Δευτέρα και τι θα κάνει».     */

// id από linked field (array ή σκέτο)
function _fid(v) {
  if (!v) return '';
  if (Array.isArray(v)) return v.length ? (v[0]?.id || v[0]) : '';
  return v.id || v;
}

// Χάρτης: NAT_LOAD id -> οι τοπικές κινήσεις που το εξυπηρετούν.
// Τον χτίζουμε ΜΙΑ φορά ανά paint — τον χρειάζεται κάθε εθνική γραμμή για
// το chip «καλύπτεται τοπικά» (Δ6, η ανάποδη κατεύθυνση).
function _wnLocalsByParent() {
  const map = {};
  (WNATL.data.locals || []).forEach(m => {
    const pid = _fid(m.fields?.['Parent Nat Load']);
    if (pid) (map[pid] = map[pid] || []).push(m);
  });
  return map;
}

function _wnDriverName(m) {
  const f = m.fields || {};
  const d = WNATL.data.drivers.find(x => x.id === _fid(f['Driver']));
  if (d) return d.label;
  const p = WNATL.data.partners.find(x => x.id === _fid(f['Partner']));
  return p ? p.label : '—';
}
function _wnTruckPlate(m) {
  const f = m.fields || {};
  const t = WNATL.data.trucks.find(x => x.id === _fid(f['Truck']));
  const r = WNATL.data.trailers.find(x => x.id === _fid(f['Trailer']));
  return [t?.label, r?.label].filter(Boolean).join(' · ');
}
function _wnLocLbl(id) { return WNATL.data._locMap?.[id] || _wnLocName(id) || '—'; }

// Chip «καλύπτεται τοπικά · <οδηγός> <μέρα>» πάνω στο ΕΘΝΙΚΟ σκέλος (Δ6, η
// ανάποδη κατεύθυνση). Κλικ → η τοπική κίνηση που το καλύπτει.
function _wnCoveredChip(row) {
  const ms = row.coveredBy || [];
  if (!ms.length) return '';
  const who = _wnDriverName(ms[0]).trim().split(/\s+/)[0];
  const d = new Date(toLocalDate(ms[0].fields?.['Date'])+'T12:00:00');
  const day = isNaN(d.getTime()) ? '' : ' ' + d.toLocaleDateString('el-GR',{weekday:'short'});
  return `<button class="wn4-chip cov" title="Το σκέλος καλύπτεται από τοπικό οδηγό${ms.length>1?` (${ms.length} κινήσεις)`:''} — κλικ: πήγαινε στην κίνηση"
    onclick="event.stopPropagation();_ccJump('wn-lmv-${ms[0].id}')">καλύπτεται τοπικά · ${escapeHtml(who)}${day}</button>`;
}

// Chip «εξυπηρετεί ▸ …» πάνω στην τοπική κίνηση (Δ6, η μία κατεύθυνση).
// Names the board row by its display number («εθνικό #3») so the two ends
// of the link read the same on both sections.
function _wnServesChip(m) {
  const f = m.fields || {};
  const nl = _fid(f['Parent Nat Load']);
  if (nl) {
    const row = WNATL.rows.find(r => r.orderId === nl || r.matchedId === nl);
    const rec = [...(WNATL.data.northsouth||[]), ...(WNATL.data.southnorth||[])].find(r => r.id === nl);
    const no = row ? (WNATL._rowNo[row.id] || '') : '';
    const client = rec?.fields?.['Client'] || '';
    return `<button class="wn4-chip srv" title="Εξυπηρετεί εθνικό φορτίο — κλικ: πήγαινε εκεί"
      onclick="event.stopPropagation();${row?`_ccJump('${_wnRowElId(row)}')`:''}">εξυπηρετεί ▸ εθνικό${no?' #'+no:''}${client?' · '+escapeHtml(client):''}${row?'':' (άλλη εβδομάδα)'}</button>`;
  }
  if (_fid(f['Parent Order']))
    return `<span class="wn4-chip srv" style="cursor:help" title="Εξυπηρετεί διεθνές δρομολόγιο (${escapeHtml(String(_fid(f['Parent Order'])))})">εξυπηρετεί ▸ διεθνές</span>`;
  return `<span class="wn4-chip solo" title="Δεν εξυπηρετεί άλλο δρομολόγιο">αυτοτελής κίνηση</span>`;
}

const _WN_CIRC = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];

function _wnLocalsHTML() {
  const { week } = WNATL;
  const list = WNATL.data.locals || [];

  // Contract #6: a table that did not load is an ERROR, not seven empty days.
  if (WNATL.data._localsFailed) {
    return `<div class="wn4-lfail">Οι τοπικές κινήσεις δεν φορτώθηκαν <small>— δεν σημαίνει ότι δεν υπάρχουν: ο πίνακας LOCAL_MOVES δεν είναι διαθέσιμος στον Worker. Τα εθνικά παραπάνω δεν επηρεάζονται.</small>
      <button class="wn4-btn" onclick="renderWeeklyNatl()">↻ Ξαναδοκίμασε</button></div>`;
  }

  const byDay = {};
  list.forEach(m => {
    const k = toLocalDate(m.fields?.['Date']) || 'zzz';
    (byDay[k] = byDay[k] || []).push(m);
  });

  const wS = _wnWeekStart(week);
  const keys = [];
  for (let i = 0; i < 7; i++) { const d = new Date(wS); d.setDate(wS.getDate()+i); keys.push(toLocalDate(d)); }
  Object.keys(byDay).sort().forEach(k => { if (keys.indexOf(k) === -1) keys.push(k); });

  const todayKey = (typeof localToday==='function') ? localToday() : toLocalDate(new Date());
  let html = '', n = 0;

  keys.forEach(key => {
    const moves = byDay[key] || [];
    const lbl = _wnDayLabel(key);
    const isToday = key === todayKey;

    // ομαδοποίηση ανά οδηγό — η γραμμή είναι ο οδηγός, όχι η κίνηση (Δ7).
    // Κίνηση χωρίς οδηγό ΚΑΙ χωρίς συνεργάτη = δηλωμένη ανάγκη («χρειάζεται
    // τοπικό») — δική της γραμμή, κόκκινη, μέχρι να καλυφθεί.
    const byDrv = {}; const order = [];
    moves.forEach(m => {
      const d = _fid(m.fields?.['Driver']), p = _fid(m.fields?.['Partner']);
      const k = d || (p ? 'p:'+p : 'need:'+m.id);
      if (!byDrv[k]) { byDrv[k] = []; order.push(k); }
      byDrv[k].push(m);
    });
    const nat = moves.filter(m => _fid(m.fields?.['Parent Nat Load'])).length;
    const intl = moves.filter(m => _fid(m.fields?.['Parent Order'])).length;
    const need = order.filter(k => k.startsWith('need:')).length;
    const drivers = order.length - need;
    const parts = [];
    if (moves.length) {
      parts.push(`${drivers} οδηγ${drivers===1?'ός':'οί'} · ${moves.length} κινήσ${moves.length===1?'η':'εις'}`);
      if (nat) parts.push(`${nat} εξυπηρετ${nat===1?'εί':'ούν'} εθνικό`);
      if (intl) parts.push(`${intl} διεθνές`);
      if (need) parts.push(`<span class="hot">${need} ακάλυπτ${need===1?'ο':'α'}</span>`);
    }

    html += `<section class="wn4-day${isToday?' today':''}${moves.length?'':' quiet'}" data-day="${key}">
      <div class="wn4-dh"><span class="d">${lbl.name} ${lbl.date}</span>${isToday?'<span class="now">ΣΗΜΕΡΑ</span>':''}<span class="k">${parts.join(' · ')}</span>
        <button class="wn4-ladd" onclick="_wnAddLocal('${key}')" title="Νέα τοπική κίνηση αυτή τη μέρα">+ Τοπικό</button></div>`;

    if (!moves.length) { html += `<div class="wn4-none">Καμία τοπική κίνηση</div></section>`; return; }

    order.forEach(dk => {
      const ms = byDrv[dk]; n++;
      const first = ms[0];
      const isNeed = dk.startsWith('need:');
      const mvs = ms.map((m, i) => {
        const f = m.fields || {};
        const from = _wnLocLbl(_fid(f['From Location']));
        const to   = _wnLocLbl(_fid(f['To Location']));
        const done = f['Status'] === 'Delivered' || f['Status'] === 'Done';
        return `<div class="wn4-mv" id="wn-lmv-${m.id}"><span class="i">${_WN_CIRC[i] || (i+1)}</span>
          ${_wnCard({ name: escapeHtml(from), appt: f['Time From'], cls: 'f' })}
          <span class="wn4-arrow">→</span>
          ${_wnCard({ name: escapeHtml(to), pals: f['Pallets'], ok: done, okTitle: 'Ολοκληρώθηκε (Status: '+escapeHtml(String(f['Status']||''))+')' })}
          ${f['Description'] ? `<span class="ds">${escapeHtml(f['Description'])}</span>` : ''}
          ${_wnServesChip(m)}
          <button class="rm" title="Διαγραφή κίνησης" onclick="_wnDelLocal('${m.id}')">×</button></div>`;
      }).join('');
      const head = isNeed
        ? `<div class="wn4-drv need"><b>χρειάζεται τοπικό</b><button onclick="_wnCoverLocal('${first.id}')">Ανάθεση οδηγού ▸</button></div>`
        : `<div class="wn4-drv"><b>${escapeHtml(_wnDriverName(first))}</b><small>${escapeHtml(_wnTruckPlate(first) || '—')}</small></div>`;
      html += `<div class="wn4-lrow${isNeed?' hot':''}">
        <div class="n">${n}</div>
        ${head}
        <div class="wn4-mvs">${mvs}
          ${isNeed ? '' : `<button class="wn4-addst" onclick="_wnAddLocal('${key}','', '${_fid(first.fields?.['Driver'])}')">+ κίνηση</button>`}
        </div></div>`;
    });
    html += `</section>`;
  });

  return html;
}

/* ── Δημιουργία τοπικής κίνησης (Δ8, και οι δύο δρόμοι) ───────────── */
// dateISO: η μέρα. parentNlId: όταν γεννιέται από «σπάσιμο» εθνικού σκέλους —
// τότε ο οδηγός είναι ΠΡΟΑΙΡΕΤΙΚΟΣ (SPEC §3.5): χωρίς οδηγό η ανάγκη
// καταγράφεται ως «χρειάζεται τοπικό» και μένει ορατή μέχρι να καλυφθεί.
function _wnAddLocal(dateISO, parentNlId, driverId) {
  const opt = (arr, sel) => arr.map(o => `<option value="${o.id}" ${o.id===sel?'selected':''}>${escapeHtml(o.label)}</option>`).join('');
  const locs = (WNATL.data.locations||[]).map(r => ({ id:r.id, label:r.fields?.Name || r.fields?.City || r.id }));
  const parentNote = parentNlId
    ? `<div class="wn3-pnote">Θα συνδεθεί με το εθνικό φορτίο — θα φαίνεται και από τις δύο πλευρές. Ο οδηγός είναι προαιρετικός: χωρίς οδηγό το σκέλος μένει «χρειάζεται τοπικό» μέχρι να καλυφθεί.</div>` : '';

  openModal('Νέα τοπική κίνηση', `
    ${parentNote}
    <div class="form-grid">
      <div class="form-field"><label class="form-label">Ημερομηνία *</label>
        <input class="form-input" type="date" id="lm_date" value="${dateISO||''}"></div>
      <div class="form-field"><label class="form-label">Οδηγός${parentNlId?'':' *'}</label>
        <select class="form-select" id="lm_driver"><option value="">${parentNlId?'— Χωρίς οδηγό ακόμη (χρειάζεται τοπικό) —':'— Επιλογή —'}</option>${opt(WNATL.data.drivers, driverId||'')}</select></div>
      <div class="form-field"><label class="form-label">Όχημα</label>
        <select class="form-select" id="lm_truck"><option value="">—</option>${opt(WNATL.data.trucks,'')}</select></div>
      <div class="form-field"><label class="form-label">Ώρα (ΩΩ:ΛΛ)</label>
        <input class="form-input" id="lm_time" placeholder="π.χ. 11:00"></div>
      <div class="form-field"><label class="form-label">Από *</label>
        <select class="form-select" id="lm_from"><option value="">— Επιλογή —</option>${opt(locs,'')}</select></div>
      <div class="form-field"><label class="form-label">Προς *</label>
        <select class="form-select" id="lm_to"><option value="">— Επιλογή —</option>${opt(locs,'')}</select></div>
      <div class="form-field"><label class="form-label">Παλέτες</label>
        <input class="form-input" type="number" id="lm_pal"></div>
      <div class="form-field"><label class="form-label">Περιγραφή</label>
        <input class="form-input" id="lm_desc" placeholder="π.χ. 2 κιβώτια Άλμη"></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
     <button class="btn btn-success" id="lm_submit" onclick="_wnSaveLocal('${parentNlId||''}')">Καταχώρηση</button>`);
}

async function _wnSaveLocal(parentNlId) {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  const date = v('lm_date'), driver = v('lm_driver'), from = v('lm_from'), to = v('lm_to');
  if (!date || !from || !to || (!driver && !parentNlId)) {
    toast(parentNlId ? 'Ημερομηνία, από και προς είναι υποχρεωτικά' : 'Ημερομηνία, οδηγός, από και προς είναι υποχρεωτικά', 'warn'); return;
  }
  const time = v('lm_time');
  if (time && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) { toast('Ώρα σε μορφή ΩΩ:ΛΛ', 'warn'); return; }

  // Σειρά μέσα στη μέρα του οδηγού: συνέχεια της υπάρχουσας (Δ7).
  const same = (WNATL.data.locals||[]).filter(m =>
    toLocalDate(m.fields?.['Date'])===date && _fid(m.fields?.['Driver'])===driver);
  const seq = same.reduce((mx,m)=>Math.max(mx, m.fields?.['Sequence']||0), 0) + 1;

  const fields = {
    'Date': date, 'Sequence': seq,
    'From Location': [from], 'To Location': [to], 'Status': 'Pending',
  };
  if (driver) fields['Driver'] = [driver];
  const truck = v('lm_truck'); if (truck) fields['Truck'] = [truck];
  if (time) fields['Time From'] = time;
  const pal = v('lm_pal'); if (pal) fields['Pallets'] = parseFloat(pal);
  const desc = v('lm_desc'); if (desc) fields['Description'] = desc;
  if (parentNlId) fields['Parent Nat Load'] = [parentNlId];

  const btn = document.getElementById('lm_submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Αποθήκευση…'; }
  try {
    await atCreate(TABLES.LOCAL_MOVES, fields);
    invalidateCache(TABLES.LOCAL_MOVES);
    closeModal();
    toast(driver ? 'Η τοπική κίνηση καταχωρήθηκε' : 'Καταγράφηκε: χρειάζεται τοπικό — μένει ορατό μέχρι να καλυφθεί', 'success');
    renderWeeklyNatl();
  } catch (e) {
    console.error('_wnSaveLocal:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Καταχώρηση'; }
    toast('Η κίνηση δεν αποθηκεύτηκε', 'error');
  }
}

// Κάλυψη δηλωμένης ανάγκης: δίνει οδηγό (και προαιρετικά όχημα) σε υπάρχουσα
// κίνηση χωρίς οδηγό. PATCH στα ίδια ονόματα πεδίων με τη δημιουργία.
function _wnCoverLocal(moveId) {
  const m = (WNATL.data.locals||[]).find(x => x.id === moveId);
  if (!m) return;
  const opt = arr => arr.map(o => `<option value="${o.id}">${escapeHtml(o.label)}</option>`).join('');
  openModal('Ανάθεση τοπικού οδηγού', `
    <div class="wn3-pnote">${escapeHtml(_wnLocLbl(_fid(m.fields?.['From Location'])))} → ${escapeHtml(_wnLocLbl(_fid(m.fields?.['To Location'])))} · ${escapeHtml(toLocalDate(m.fields?.['Date'])||'')}</div>
    <div class="form-grid">
      <div class="form-field"><label class="form-label">Οδηγός *</label>
        <select class="form-select" id="lc_driver"><option value="">— Επιλογή —</option>${opt(WNATL.data.drivers)}</select></div>
      <div class="form-field"><label class="form-label">Όχημα</label>
        <select class="form-select" id="lc_truck"><option value="">—</option>${opt(WNATL.data.trucks)}</select></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
     <button class="btn btn-success" id="lc_submit" onclick="_wnSaveCover('${moveId}')">Ανάθεση</button>`);
}

async function _wnSaveCover(moveId) {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  const driver = v('lc_driver');
  if (!driver) { toast('Επίλεξε οδηγό', 'warn'); return; }
  const fields = { 'Driver': [driver] };
  const truck = v('lc_truck'); if (truck) fields['Truck'] = [truck];
  const btn = document.getElementById('lc_submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Αποθήκευση…'; }
  try {
    const res = await atSafePatch(TABLES.LOCAL_MOVES, moveId, fields);
    if (res?.conflict) { toast('Η εγγραφή άλλαξε από άλλον χρήστη — γίνεται ανανέωση','warn'); closeModal(); await renderWeeklyNatl(); return; }
    if (res?.error) throw new Error(res.error.message || res.error.type);
    invalidateCache(TABLES.LOCAL_MOVES);
    closeModal();
    toast('Το σκέλος καλύφθηκε τοπικά', 'success');
    renderWeeklyNatl();
  } catch (e) {
    console.error('_wnSaveCover:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Ανάθεση'; }
    toast('Η ανάθεση δεν αποθηκεύτηκε', 'error');
  }
}

async function _wnDelLocal(id) {
  if (!(await confirmAction('Διαγραφή αυτής της τοπικής κίνησης;', { title:'Διαγραφή', confirmLabel:'Διαγραφή' }))) return;
  try {
    await atDelete(TABLES.LOCAL_MOVES, id);
    invalidateCache(TABLES.LOCAL_MOVES);
    toast('Διαγράφηκε', 'success');
    renderWeeklyNatl();
  } catch (e) {
    console.error('_wnDelLocal:', e);
    toast('Η διαγραφή απέτυχε', 'error');
  }
}

// «ΚΥΡΙΑΚΗ» + «26/07» — η τυπογραφία ημέρας του wk3 (.wk3-dayh .d / .k)
function _wnDayLabel(key) {
  if (!key || key === 'zzz') return { name:'ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ', date:'—' };
  const d = new Date(key + 'T12:00:00');
  if (isNaN(d.getTime())) return { name:'—', date:key };
  return {
    // Capitals carry no tonos in Greek typography — «ΚΥΡΙΑΚΗ», never
    // «ΚΥΡΙΑΚΉ» (what a plain toUpperCase() produces and what the kanban
    // critic could not find, 3/9).
    name: d.toLocaleDateString('el-GR', { weekday:'long' }).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(),
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
  // T3: the per-row slot reports server truth. ⚠ is remembered in
  // WNATL._syncErr so a repaint (which rebuilds the DOM) re-renders it —
  // «μένει ορατό» until a reload proves the row is right.
  if(state==='err') WNATL._syncErr.add(id); else WNATL._syncErr.delete(id);
  if(state==='ok') WNATL._syncOk++;
  const el=document.getElementById(id);
  if(el){
    el.className='wi-sync'+(state?' wi-sync--'+state:'');
    el.textContent=state==='pend'?'⟳':state==='ok'?'✓':state==='err'?'⚠':'';
    el.title=msg||'';
    if(state==='ok') setTimeout(()=>{ if(el.textContent==='✓'){el.textContent='';el.className='wi-sync';} },4000);
  }
  _wnSyncSummary();
}
// Bottom-tally line: «N γραμμές γραμμένες · M δεν γράφτηκε». Silent when
// nothing was written since the last load.
function _wnSyncSummary(){
  const el=document.getElementById('wn-syncsum'); if(!el) return;
  const bad=WNATL._syncErr.size, ok=WNATL._syncOk;
  const parts=[];
  if(ok) parts.push(`${ok} εγγραφ${ok===1?'ή':'ές'} γραμμέν${ok===1?'η':'ες'}`);
  if(bad) parts.push(`${bad} ΔΕΝ γράφτηκ${bad===1?'ε':'αν'} — κάνε Ανανέωση`);
  el.textContent=parts.join(' · ');
  el.classList.toggle('hot', bad>0);
}
// Inline ⚠ for rows whose last write failed — used by the row renderers so
// the mark survives _wnPaint().
function _wnSyncSlot(id){
  const err=WNATL._syncErr.has(id);
  return `<span class="wi-sync${err?' wi-sync--err':''}" id="${id}" title="${err?'Η τελευταία εγγραφή ΔΕΝ γράφτηκε στη βάση — κάνε Ανανέωση':''}">${err?'⚠':''}</span>`;
}

/* ── Leg card ─────────────────────────────────────────────────────── */
// [date] name / sub-line · appointment · ✓ · chips · pallets · tail.
// Names are NEVER cut (DESIGN.md #6): the name line wraps instead — a row with
// many delivery points grows past 40px, which the contract allows (#9,
// «διπλώνουν σε δικές τους γραμμές»). `name`/`sub` arrive already escaped.
function _wnCard(o) {
  return `<div class="wn4-card${o.ok?' ok':''}${o.cls?' '+o.cls:''}">
    ${o.date?`<span class="dt" title="${o.dateTitle||''}">${o.date}</span>`:''}
    <span class="nm"><b>${o.name||'—'}</b>${o.sub?`<small>${o.sub}</small>`:''}</span>
    ${_wnHH(o.appt)}${o.ok?`<span class="ok" title="${o.okTitle||''}">✓</span>`:''}
    ${o.chips||''}<span class="sp"></span>${(o.pals!=null&&o.pals!=='')?`<span class="pl">${o.pals} p</span>`:''}${o.tail||''}</div>`;
}

// Location name/sub-line for the 1..10 slots of one side. Same de-duplication
// as _wnNlPickupSummary (owner 10/8: same place twice = ONE stop). Returns
// escaped HTML: multiple points become ①② numbered names (wk3-stopn).
function _wnLocParts(f, kind) {
  const seen = [], names = [], cities = [];
  for (let i = 1; i <= 10; i++) {
    const arr = f[`${kind} Location ${i}`];
    if (!arr?.length) continue;
    const id = arr[0]?.id || arr[0];
    if (!id || seen.indexOf(id) !== -1) continue;
    seen.push(id);
    const loc  = WNATL.data.locations.find(r => r.id === id);
    const full = WNATL.data._locMap?.[id] || loc?.fields?.Name || loc?.fields?.City || '';
    const nm   = full.split(',')[0].trim();
    const city = (loc?.fields?.City || full.split(',').slice(1).join(',')).trim();
    if (nm && names.indexOf(nm) === -1) names.push(nm);
    if (city && city !== nm && cities.indexOf(city) === -1) cities.push(city);
  }
  const name = names.length <= 1
    ? escapeHtml(names[0] || '')
    : names.map((n, i) => `<span class="wk3-stopn" title="Σημείο ${i+1}">${i+1}</span>${escapeHtml(n)}`).join(' ');
  return { name, sub: escapeHtml(cities.join(' / ')), n: names.length };
}

/* ── N→S ROW ─────────────────────────────────────────────────────── */
function _wnRowHTML(row, i) {
  const { data } = WNATL;
  const allLoads = [...(data.northsouth||[]), ...(data.southnorth||[])];
  const primary = allLoads.find(r=>r.id===row.orderId);
  const f = primary?.fields || {};
  const isGroup = f['Source Type'] === 'Groupage';
  const sn = row.matchedId ? allLoads.find(r=>r.id===row.matchedId) : null;

  const fromP = _wnLocParts(f, 'Pickup'), toP = _wnLocParts(f, 'Delivery');
  const clientLabel = f['Client'] || '';
  // Unknown ≠ 0 (contract #8): no Total Pallets → no «p» at all, never «0 p».
  const pals = f['Total Pallets'];
  const st = f['Status'] || '';
  const loaded = st === 'In Transit' || st === 'Delivered', delivered = st === 'Delivered';
  const loadDt = f['Loading DateTime'] ? _wnFmt(f['Loading DateTime']) : '';
  const delDt  = f['Delivery DateTime'] ? _wnFmt(f['Delivery DateTime']) : '';

  const isPartner = !!(row.partnerLabel || data.partners.find(p=>p.id===row.partnerId)?.label);
  const pill = _wnPill(row);

  // Φέτα 2: δύο ΔΙΑΦΟΡΕΤΙΚΑ κενά, όχι ένα.
  //   «δεν υπάρχει σκέλος» — συνεργάτης με ανάθεση, μονή διαδρομή. Το Χ του
  //   Excel. Δεν καλεί σε drag· δείχνει —, γιατί δεν λείπει τίποτα.
  //   «δεν ταιριάχτηκε ακόμη» — όλα τα υπόλοιπα. Καλεί σε drag.
  const isOneWay = !sn && row.saved && isPartner;
  const snCell = sn ? _wnSnInlineCell(sn, row.id) : _wnDragCell(isOneWay);

  // Φέτα 4 (Δ9): πολυστάσιο φορτίο → συμπτυγμένο σήμα «▸ N σημεία · x/33».
  // Το γέμισμα από το Total Pallets της γραμμής (κανονικό <30 · πορτοκαλί ≥30
  // · κόκκινο >33). Η ανάλυση ανά πελάτη φορτώνεται ΜΟΝΟ όταν πατηθεί.
  const nDel = toP.n;
  const fillCls = pals > 33 ? ' over' : (pals >= 30 ? ' full' : '');
  const grpChip = nDel > 1
    ? `<button class="wn4-chip grp${fillCls}" id="wn-grpb-${row.id}" data-n="${nDel}" data-p="${pals||0}"
        title="${nDel} σημεία παράδοσης — κλικ για ανάλυση ανά πελάτη"
        onclick="event.stopPropagation();_wnToggleStops(${row.id},'${primary?.id||''}')">▸ ${nDel} σημεία${pals?` · ${pals}/33`:''}</button>`
    : '';
  const needChip = row.needsLocal
    ? `<span class="wn4-chip need" title="Δηλώθηκε «χρειάζεται τοπικό» και δεν έχει οδηγό ακόμη — Ανάθεση οδηγού από την ενότητα ΤΟΠΙΚΕΣ ΠΑΡΑΔΟΣΕΙΣ">χρειάζεται τοπικό</span>`
    : '';

  const fromCard = _wnCard({
    date: loadDt, dateTitle: 'Ημ. φόρτωσης',
    name: fromP.name || (isGroup ? escapeHtml(f['Name'] || '') : '') || '—', sub: fromP.sub,
    appt: f['Loading Appointment'], ok: loaded, okTitle: 'Φορτώθηκε (Status: '+escapeHtml(st)+')',
  });
  const toCard = _wnCard({
    date: delDt, dateTitle: 'Ημ. παράδοσης',
    name: toP.name || escapeHtml(clientLabel) || (isGroup ? 'ΒΕΡΜΙΟΝ ΦΡΕΣ / CROSS-DOCK' : '—'),
    sub: toP.sub || (toP.name && clientLabel ? escapeHtml(clientLabel) : ''),
    appt: f['Delivery Appointment'], ok: delivered, okTitle: 'Παραδόθηκε (Status: Delivered)',
    chips: _wnCoveredChip(row) + needChip + grpChip + `<span class="wk3-flags">${_wnBadges(f)}${_wnCrossChip(f)}${_wnExecChip(f,row.saved)}</span>`,
    pals,
  });

  // ΟΛΟΙ οι handlers αυτούσιοι από τη v3: dragstart, δεξί κλικ (_wnCtx),
  // popover ανάθεσης, print, και το drop target της ανόδου.
  return `
  <div id="wn-row-${row.id}" data-row-id="${row.id}" class="wk3-row${row.needsLocal?' hot':''}"
    draggable="true"
    ondragstart="_wnDragStart(event,'${row.orderId||primary?.id||''}')">
    <div class="wk3-num">${i+1}${_wnSyncSlot('wn-sync-'+row.id)}</div>
    <div class="wk3-leg" oncontextmenu="_wnCtx(event,${row.id})">${fromCard}<span class="wn4-arrow">→</span>${toCard}</div>
    <div class="wk3-assign" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="event.stopPropagation();_wnOpenPopover(event,${row.id})">
      <button class="wk3-prt" title="Εκτύπωση εντολής καθόδου" onclick="event.stopPropagation();_wnPrint(${row.id},'northsouth')">⎙</button>
      ${pill}
      ${sn ? `<button class="wk3-prt a" title="Εκτύπωση εντολής ανόδου" onclick="event.stopPropagation();_wnPrint(${row.id},'southnorth')">⎙<sup>A</sup></button>` : '<span></span>'}
    </div>
    <div class="wk3-leg${sn?'':(isOneWay?' bgap':' void')}" id="wn-ci-${row.id}"
         onclick="event.stopPropagation()"
         ondragover="event.preventDefault();document.getElementById('wn-ci-${row.id}').classList.add('dh')"
         ondragleave="document.getElementById('wn-ci-${row.id}').classList.remove('dh')"
         ondrop="event.stopPropagation();_wnDropOnRow(event,${row.id})">
      ${snCell}
    </div>
  </div>
  ${nDel > 1 ? `<div class="wn3-stops" id="wn-stops-${row.id}" style="display:none"></div>` : ''}`;
}

/* ── Φέτα 4 (Δ9): ανάλυση groupage, lazy ──────────────────────────── */
async function _wnToggleStops(rowId, nlId) {
  const box = document.getElementById('wn-stops-'+rowId);
  const btn = document.getElementById('wn-grpb-'+rowId);
  if (!box || !btn) return;
  const n = btn.dataset.n, p = btn.dataset.p;

  const sfx = Number(p) > 0 ? ` · ${p}/33` : '';
  if (box.style.display !== 'none') {           // κλείσιμο
    box.style.display = 'none';
    btn.textContent = `▸ ${n} σημεία${sfx}`;
    return;
  }
  box.style.display = '';
  btn.textContent = `▾ ${n} σημεία${sfx}`;
  if (box.dataset.loaded === '1') return;

  box.innerHTML = '<span class="ld">φόρτωση στάσεων…</span>';
  try {
    let stops = await stopsLoad(nlId, F.STOP_PARENT_NL);
    let noInfo = null;   // { noId: { client, price } } — groupage only
    let dels = (stops||[]).filter(s => s.fields?.[F.STOP_TYPE] === 'Unloading');

    const rec = [...(WNATL.data.northsouth||[]), ...(WNATL.data.southnorth||[])].find(r => r.id === nlId);
    const ff = rec?.fields || {};

    // Οι στάσεις γράφονται στην ΠΑΡΑΓΓΕΛΙΑ (STOP_PARENT_NAT), όχι στο φορτίο.
    // Ψάχνοντας μόνο με γονέα το φορτίο δεν βρίσκονταν ΠΟΤΕ, και το πάνελ
    // έπεφτε πάντα στο fallback χωρίς παλέτες — αυτό ήταν το «δεν βρέθηκαν
    // καταγεγραμμένες στάσεις» (owner 12/08). Το `Source Record` δείχνει την
    // παραγγελία (Direct/VS) ή το CL (Groupage).
    if (!dels.length && ff['Source Record']) {
      const src = ff['Source Record'];
      try {
        if (ff['Source Type'] === 'Groupage') {
          // Στο groupage οι στάσεις ζουν στις εθνικές παραγγελίες του CL· ο
          // δρόμος προς αυτές είναι τα GROUPAGE LINES. Φιλτράρισμα στη JS,
          // όπως και αλλού στο repo: τα formula πάνω σε linked records είναι
          // αναξιόπιστα (orders_intl.js:1178).
          const gls = await atGetAll(TABLES.GL_LINES,
            { fields: ['Linked Consolidated Load', 'Linked National Order'] }, false);
          const _id = v => Array.isArray(v) ? (v[0]?.id || v[0]) : (v?.id || v);
          const noIds = [...new Set((gls||[])
            .filter(g => _id(g.fields?.['Linked Consolidated Load']) === src)
            .map(g => _id(g.fields?.['Linked National Order']))
            .filter(Boolean))];
          const sets = await Promise.all(
            noIds.map(id => stopsLoad(id, F.STOP_PARENT_NAT)
              .then(st => (st||[]).map(s => Object.assign(s, { _no: id }))).catch(() => [])));
          stops = sets.flat();
          // Δ13: η αξία μπαίνει ανά πελάτη. Price = τιμή πώλησης, ορατή σε κάθε
          // ρόλο (κλείδωμα 23/8) — ΟΧΙ κέρδος/περιθώριο. Αποτυχία εδώ χάνει μόνο
          // την επικεφαλίδα πελάτη, όχι τις στάσεις.
          try {
            const clients = (typeof getRefClients === 'function') ? getRefClients() : [];
            const nos = await Promise.all(noIds.map(id =>
              atGetAll(TABLES.NAT_ORDERS, { filterByFormula: `RECORD_ID()='${id}'`, fields: ['Client', 'Price'] }, false)
                .then(r => (r||[])[0]).catch(() => null)));
            noInfo = {};
            nos.filter(Boolean).forEach(o => {
              const c = clients.find(x => x.id === _id(o.fields?.['Client']));
              noInfo[o.id] = { client: c?.fields?.['Company Name'] || c?.fields?.['Name'] || '', price: o.fields?.['Price'] };
            });
          } catch(e) { console.warn('groupage NO info:', e); }
        } else {
          stops = await stopsLoad(src, F.STOP_PARENT_NAT);
        }
        dels = (stops||[]).filter(s => s.fields?.[F.STOP_TYPE] === 'Unloading');
      } catch(e) { console.warn('στάσεις από την πηγή:', e); }
    }

    if (!dels.length) {
      // Fallback: τα Delivery Location 1..10 του ίδιου του φορτίου. Δεν
      // κουβαλούν παλέτες ανά σημείο — γι' αυτό το λέμε ρητά αντί να
      // δείξουμε μηδενικά που θα διαβάζονταν ως γεγονός.
      const names = [], seenL = [];
      for (let k = 1; k <= 10; k++) {
        const arr = ff[`Delivery Location ${k}`];
        if (!arr?.length) continue;
        const lid = arr[0]?.id || arr[0];
        if (!lid || seenL.indexOf(lid) !== -1) continue;
        seenL.push(lid);
        names.push(WNATL.data._locMap?.[lid] || _wnLocName(lid) || '—');
      }
      box.innerHTML = names.length
        ? names.map(nm => `<div class="st"><span class="p">—</span><span>${escapeHtml(nm)}</span></div>`).join('')
          // Συμβόλαιο #8: ποτέ «0p». Άγνωστο ≠ μηδέν — το `||0` έδειχνε
          // «0p σύνολο φορτίου» σε φορτίο που απλώς δεν έχει καταγεγραμμένο
          // Total Pallets (ο facade παραλείπει τα NULL, άρα undefined).
          + `<div class="st"><span class="p">${ff['Total Pallets']!=null?ff['Total Pallets']+'p':'—'}</span><span>σύνολο φορτίου</span>`
          + `<span class="o">οι παλέτες ανά σημείο δεν έχουν καταγραφεί</span></div>`
        : '<span class="ld">δεν βρέθηκαν σημεία παράδοσης</span>';
      box.dataset.loaded='1'; return;
    }

    let sum = 0, missing = 0;
    const stopLine = s => {
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
    };
    const lines = _wnGrpLines(dels, noInfo, stopLine);

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

// Groupage panel lines: one header per client («ΣΚΛΑΒΕΝΙΤΗΣ — 960 €», its
// pallets, its N points) followed by that client's stops. Without NO info
// (Direct/VS loads) the stops render flat. `stopLine` accumulates the sum.
function _wnGrpLines(dels, noInfo, stopLine) {
  if (!noInfo) return dels.map(stopLine).join('');
  let html = '';
  Object.keys(noInfo).forEach(id => {
    const own = dels.filter(s => s._no === id);
    const known = own.filter(s => s.fields[F.STOP_PALLETS] != null);
    const p = known.reduce((a, s) => a + s.fields[F.STOP_PALLETS], 0);
    const inf = noInfo[id];
    const price = (typeof inf.price === 'number') ? ' — ' + inf.price.toLocaleString('el-GR') + ' €' : '';
    html += `<div class="st"><span class="p">${known.length ? p + 'p' : '—'}</span>`
          + `<span><b>${escapeHtml(inf.client || 'πελάτης')}</b>${price}</span>`
          + `<span class="o">${own.length} σημεί${own.length===1?'ο':'α'}</span></div>`
          + own.map(stopLine).join('');
  });
  html += dels.filter(s => !noInfo[s._no]).map(stopLine).join('');
  return html;
}

/* ── Matched S→N cell (right column when linked) ─────────────────── */
function _wnSnInlineCell(snRec, rowId) {
  const f = snRec.fields;
  const clientLabel = f['Client'] || '';
  const isGroupage = f['Source Type'] === 'Groupage';
  const fromP = _wnLocParts(f, 'Pickup'), toP = _wnLocParts(f, 'Delivery');
  const st = f['Status'] || '';
  const fromCard = _wnCard({
    date: f['Loading DateTime'] ? _wnFmt(f['Loading DateTime']) : '', dateTitle: 'Ημ. φόρτωσης ανόδου',
    name: fromP.name || (isGroupage ? escapeHtml(f['Name'] || '') : '') || '—', sub: fromP.sub,
    appt: f['Loading Appointment'], ok: st === 'In Transit' || st === 'Delivered', okTitle: 'Φορτώθηκε (Status: '+escapeHtml(st)+')',
  });
  const toCard = _wnCard({
    date: f['Delivery DateTime'] ? _wnFmt(f['Delivery DateTime']) : '', dateTitle: 'Ημ. παράδοσης',
    name: toP.name || (isGroupage ? 'ΒΕΡΜΙΟΝ ΦΡΕΣ / CROSS-DOCK' : escapeHtml(clientLabel)) || '—',
    sub: toP.sub || (toP.name && clientLabel ? escapeHtml(clientLabel) : ''),
    appt: f['Delivery Appointment'], ok: st === 'Delivered', okTitle: 'Παραδόθηκε (Status: Delivered)',
    chips: `<span class="wk3-flags">${_wnBadges(f)}</span>`, pals: f['Total Pallets'],
    tail: `<button class="wk3-unm" title="Αφαίρεση ταιριάσματος" onclick="event.stopPropagation();_wnUnmatch(${rowId},'${snRec.id}')">✕</button>`,
  });
  return `${fromCard}<span class="wn4-arrow">→</span>${toCard}`;
}

/* ── Κενό σκέλος ανόδου — δύο διαφορετικά νοήματα (Φέτα 2, contract #8) ── */
function _wnDragCell(isOneWay) {
  return isOneWay
    ? `<div class="wn4-dark" title="Μονή διαδρομή — δεν υπάρχει σκέλος ανόδου (το Χ του Excel)"><span class="nolg">—</span>&nbsp;μονή διαδρομή</div>`
    // Δ6 (3/9): η οδηγία ζει ΜΙΑ φορά — στο υπόμνημα και στο hover του κελιού.
    // Τυπωμένη σε κάθε γραμμή ήταν θόρυβος: μια οδηγία που επαναλαμβάνεται σε
    // κάθε άδειο κελί παύει να διαβάζεται. Το «—» είναι ό,τι βάζει και το intl.
    : `<div class="wn4-drop" title="Σύρε μια άνοδο εδώ για ταίριασμα σε round trip — ή άφησέ το κενό: μετρά στις «χωρίς ταίριασμα»">—</div>`;
}

/* ── S→N standalone row ──────────────────────────────────────────── */
function _wnSnRowHTML(row, snNo) {
  const { data } = WNATL;
  const ord = data.southnorth.find(r => r.id===row.orderId);
  if (!ord) return '';
  const f = ord.fields;
  const clientLabel = f['Client'] || '';
  const isGroupage = f['Source Type'] === 'Groupage';
  const fromP = _wnLocParts(f, 'Pickup'), toP = _wnLocParts(f, 'Delivery');
  const st = f['Status'] || '';
  const pill = _wnPill(row);

  const fromCard = _wnCard({
    date: f['Loading DateTime'] ? _wnFmt(f['Loading DateTime']) : '', dateTitle: 'Ημ. φόρτωσης',
    name: fromP.name || (isGroupage ? escapeHtml(f['Name'] || '') : '') || '—', sub: fromP.sub,
    appt: f['Loading Appointment'], ok: st === 'In Transit' || st === 'Delivered', okTitle: 'Φορτώθηκε (Status: '+escapeHtml(st)+')',
  });
  const toCard = _wnCard({
    date: f['Delivery DateTime'] ? _wnFmt(f['Delivery DateTime']) : '', dateTitle: 'Ημ. παράδοσης',
    name: toP.name || (isGroupage ? 'ΒΕΡΜΙΟΝ ΦΡΕΣ / CROSS-DOCK' : escapeHtml(clientLabel)) || '—',
    sub: toP.sub || (toP.name && clientLabel ? escapeHtml(clientLabel) : ''),
    appt: f['Delivery Appointment'], ok: st === 'Delivered', okTitle: 'Παραδόθηκε (Status: Delivered)',
    chips: _wnCoveredChip(row) + (row.needsLocal ? `<span class="wn4-chip need">χρειάζεται τοπικό</span>` : '') + `<span class="wk3-flags">${_wnBadges(f)}${_wnCrossChip(f)}${_wnExecChip(f,row.saved)}</span>`,
    pals: f['Total Pallets'],
  });

  // Το ΑΡΙΣΤΕΡΟ κελί μένει navy — «δεν αναμένεται σκέλος καθόδου» (contract #8,
  // owner 8/8). Handlers αυτούσιοι.
  return `<div id="wn-sn-${ord.id}" data-row-id="${row.id}"
    class="wk3-row sn${row.needsLocal?' hot':''}"
    style="cursor:grab"
    draggable="true"
    ondragstart="_wnDragStart(event,'${ord.id}')"
    oncontextmenu="_wnCtxSn(event,${row.id},'${ord.id}')">
    <div class="wk3-num imp" title="Άνοδος ${snNo||''}">A${snNo||''}${_wnSyncSlot('wn-sync-'+row.id)}</div>
    <div class="wk3-leg void"><div class="wn4-dark" title="Δεν αναμένεται σκέλος καθόδου"></div></div>
    <div class="wk3-assign" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0" onclick="event.stopPropagation();_wnOpenSnPopover(event,'${ord.id}',${row.id})">
      <button class="wk3-prt" title="Εκτύπωση εντολής" onclick="event.stopPropagation();_wnPrintSn('${ord.id}')">⎙</button>
      ${pill}
      <span></span>
    </div>
    <div class="wk3-leg">${fromCard}<span class="wn4-arrow">→</span>${toCard}</div>
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
/* Αριθμημένα σημεία με μπλε κύκλους — ίδιο .wk3-stopn με το International.
   Επιστρέφει HTML, οπότε η escape γίνεται ΑΝΑ ΟΝΟΜΑ εδώ μέσα. */
function _wnStopsHTML(f, kind) {
  const seen = [], names = [];
  for (let i = 1; i <= 10; i++) {
    const arr = f[`${kind} Location ${i}`];
    if (!arr?.length) continue;
    const id = arr[0]?.id || arr[0];
    if (!id || seen.indexOf(id) !== -1) continue;
    seen.push(id);
    const nm = (WNATL.data._locMap?.[id] || _wnLocName(id) || '').split(',')[0].trim();
    if (nm && names.indexOf(nm) === -1) names.push(nm);
  }
  if (!names.length) return '';
  if (names.length === 1) return escapeHtml(names[0]);
  return names.map((n,i) => `<span class="wk3-stopn" title="Σημείο ${i+1}">${i+1}</span>${escapeHtml(n)}`).join(' ');
}

function _wnNlPickupSummary(f) {
  // owner 10/8: ίδια τοποθεσία δύο φορές = ΜΙΑ στάση για τον οδηγό.
  // Η αφαίρεση διπλών αφορά ΜΟΝΟ την εμφάνιση — οι εγγραφές (GL, ORDER_STOPS)
  // μένουν χωριστές, γιατί εμπορικά είναι δύο διαφορετικές παραδόσεις.
  const seen = [], locs = [];
  for (let i = 1; i <= 10; i++) {
    const arr = f[`Pickup Location ${i}`];
    if (!arr?.length) continue;
    const locId = arr[0]?.id || arr[0];
    if (!locId || seen.indexOf(locId) !== -1) continue;
    seen.push(locId);
    // ΚΑΙ με βάση το όνομα: το ίδιο σημείο υπάρχει συχνά ως ΔΥΟ εγγραφές στο
    // LOCATIONS (greeklish/ELOT διπλότυπα). Διαφορετικό id, ίδιος τόπος —
    // ο οδηγός σταματά μία φορά.
    const name = WNATL.data._locMap?.[locId] || _wnLocName(locId);
    const short = name ? name.split(',')[0].trim() : '';
    if (!short || locs.indexOf(short) !== -1) continue;
    locs.push(short);
  }
  return locs.join(' / ') || '';
}

function _wnNlDeliverySummary(f) {
  // owner 10/8: ίδια τοποθεσία δύο φορές = ΜΙΑ στάση για τον οδηγό.
  // Η αφαίρεση διπλών αφορά ΜΟΝΟ την εμφάνιση — οι εγγραφές (GL, ORDER_STOPS)
  // μένουν χωριστές, γιατί εμπορικά είναι δύο διαφορετικές παραδόσεις.
  const seen = [], locs = [];
  for (let i = 1; i <= 10; i++) {
    const arr = f[`Delivery Location ${i}`];
    if (!arr?.length) continue;
    const locId = arr[0]?.id || arr[0];
    if (!locId || seen.indexOf(locId) !== -1) continue;
    seen.push(locId);
    // ΚΑΙ με βάση το όνομα: το ίδιο σημείο υπάρχει συχνά ως ΔΥΟ εγγραφές στο
    // LOCATIONS (greeklish/ELOT διπλότυπα). Διαφορετικό id, ίδιος τόπος —
    // ο οδηγός σταματά μία φορά.
    const name = WNATL.data._locMap?.[locId] || _wnLocName(locId);
    const short = name ? name.split(',')[0].trim() : '';
    if (!short || locs.indexOf(short) !== -1) continue;
    locs.push(short);
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

  // Contract #5 — colour AND class AND word (DESIGN.md ΜΕΡΟΣ Ε «Ανάθεση»):
  // own = navy «ΙΔ.» + plate + driver, par = green «ΣΥΝ.» + company,
  // un = dark-red dashed «ΠΡΟΣ ΑΝΑΘΕΣΗ» (owner 4/9: the empty box is an
  // action owed by the dispatcher, so it is written — it replaces the 12/8
  // «χρώμα, όχι λόγια» empty box), unimp = dashed grey «ΑΝΟ · χωρίς όχημα»
  // (an unmatched άνοδος is resolved by drag as often as by assignment, so it
  // keeps its own word). Two lines, nothing sliced.
  if (!row.saved) return row.type === 'southnorth'
    ? `<div class="wk3-pill unimp" title="Άνοδος χωρίς όχημα — κλικ για ανάθεση">ΑΝΟ · χωρίς όχημα</div>`
    : `<div class="wk3-pill un" title="Προς ανάθεση — κλικ για ανάθεση">ΠΡΟΣ ΑΝΑΘΕΣΗ</div>`;
  if (partner) return `<div class="wk3-pill par" title="Συνεργάτης${row.partnerPlates?' · '+escapeHtml(row.partnerPlates):''}${driver?' · '+escapeHtml(driver):''}${isCL?' · από Pick Ups':''} — κλικ: αλλαγή ανάθεσης">ΣΥΝ. ${escapeHtml(partner)}${(row.partnerPlates||driver)?`<small>${escapeHtml([row.partnerPlates,driver].filter(Boolean).join(' · '))}</small>`:''}</div>`;
  return `<div class="wk3-pill own" title="${escapeHtml([truck,trailer].filter(Boolean).join(' · '))}${driver?' · '+escapeHtml(driver):''}${isCL?' · από Pick Ups':''} — κλικ: αλλαγή ανάθεσης">ΙΔ. ${escapeHtml(truck || '—')}<small>${escapeHtml([driver,trailer].filter(Boolean).join(' · ') || '—')}</small></div>`;
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
    if(r1?.conflict){ toast('Η εγγραφή άλλαξε από άλλον χρήστη — γίνεται ανανέωση','warn'); await renderWeeklyNatl(); return; }
    const r2 = await atSafePatch(TABLES.NAT_LOADS, snId, { 'Matched Load': row.orderIds[0] });
    if(r2?.conflict){ toast('Η εγγραφή άλλαξε από άλλον χρήστη — γίνεται ανανέωση','warn'); await renderWeeklyNatl(); return; }
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
            <input class="wi-pop-inp" type="number" step="0.01" placeholder="π.χ. 350"
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
        <div id="wn-pop-spin-${rowId}" style="width:12px;height:12px;border:2px solid var(--border-dark);border-top-color:var(--text-on-dark);border-radius:9999px;display:none;animation:wi-spin .6s linear infinite"></div>
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
      if (res?.conflict) { toast('Η εγγραφή άλλαξε από άλλον χρήστη — γίνεται ανανέωση','warn'); await renderWeeklyNatl(); return; }
      if (res?.error) throw new Error(res.error.message||res.error.type);
    } catch(err) { errors.push(err.message); }
  }
  if (row.matchedId) {
    try {
      const res = await atSafePatch(TABLES.NAT_LOADS, row.matchedId, fields);
      if (res?.conflict) { toast('Η εγγραφή άλλαξε από άλλον χρήστη — γίνεται ανανέωση','warn'); await renderWeeklyNatl(); return; }
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
      if (res?.conflict) { toast('Η εγγραφή άλλαξε από άλλον χρήστη — γίνεται ανανέωση','warn'); await renderWeeklyNatl(); return; }
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
  if (row && row.orderIds.length > 1)
    items.push(`<button type="button" class="wi-ctx-item" onclick="_wnCtxClose();_wnSplit(${rowId})">Διαχωρισμός (${row.orderIds.length} εντολές)</button>`);

  // Δ8 (δεύτερος δρόμος εισόδου): «σπάσιμο» σκέλους σε τοπικό οδηγό. Ανοίγει
  // τη φόρμα τοπικής κίνησης δεμένη με αυτό το φορτίο· χωρίς οδηγό η ανάγκη
  // καταγράφεται ως «χρειάζεται τοπικό» (SPEC §3.5).
  //
  // Δ2 (ΠΡΟΣΩΡΙΝΟ, 3/9): κρύβεται όσο ο πίνακας LOCAL_MOVES δεν είναι
  // deployed στον Worker (_localsFailed). Χωρίς αυτό ο dispatcher άνοιγε
  // φόρμα με 19 πραγματικούς οδηγούς, περίμενε ~3s (3 retries) και έπαιρνε
  // «Save failed» — ενώ 200px πιο πάνω η ίδια οθόνη έλεγε ότι οι τοπικές
  // κινήσεις δεν φορτώθηκαν. ΕΠΑΝΕΡΧΕΤΑΙ (μαζί με το «+ Τοπική κίνηση» της
  // ενότητας) μόλις μπει ο πίνακας στον χάρτη του Worker.
  if (row && !WNATL.data._localsFailed) {
    const dk = _wnRowKey(row);
    items.push(`<button type="button" class="wi-ctx-item" onclick="_wnCtxClose();_wnAddLocal('${dk==='zzz'?'':dk}','${row.orderId}')">Ανάθεση σε τοπικό οδηγό</button>`);
  }

  // Δ5 (owner 10/8): το ραντεβού μπαίνει ΜΕ ΠΡΟΘΕΣΗ, από εδώ — δεν εξάγεται
  // αυτόματα από την ώρα του datetime. Δείχνουμε την τρέχουσα τιμή στο ίδιο
  // το κουμπί ώστε να φαίνεται τι θα αλλάξει πριν το πατήσεις.
  const _rec = [...(WNATL.data.northsouth||[]), ...(WNATL.data.southnorth||[])]
                 .find(r => r.id === row?.orderId);
  const _aL = _rec?.fields?.['Loading Appointment'] || '';
  const _aU = _rec?.fields?.['Delivery Appointment'] || '';
  items.push(`<button type="button" class="wi-ctx-item" onclick="_wnCtxClose();_wnSetAppt(${rowId},'l')">Ώρα φόρτωσης${_aL?' · '+escapeHtml(_aL):''}</button>`);
  items.push(`<button type="button" class="wi-ctx-item" onclick="_wnCtxClose();_wnSetAppt(${rowId},'u')">Ώρα παράδοσης${_aU?' · '+escapeHtml(_aU):''}</button>`);

  ctx.innerHTML = items.join('');
  // Position — flip up if near bottom (fixed positioning uses clientX/Y)
  const menuH = items.length * 36 + 16;
  const spaceBelow = window.innerHeight - e.clientY;
  const top = spaceBelow < menuH ? (e.clientY - menuH) : e.clientY;
  const left = Math.min(e.clientX, window.innerWidth - 200);
  Object.assign(ctx.style, { display:'block', left:`${left}px`, top:`${Math.max(10, top)}px` });
  setTimeout(() => document.addEventListener('click', _wnCtxClose, { once:true }), 10);
}

/* ── Δ5: ορισμός ώρας ραντεβού ανά σκέλος ─────────────────────────── */
async function _wnSetAppt(rowId, leg) {
  const row = WNATL.rows.find(r => r.id === rowId);
  if (!row) return;
  const rec = [...(WNATL.data.northsouth||[]), ...(WNATL.data.southnorth||[])]
                .find(r => r.id === row.orderId);
  if (!rec) return;

  const fld  = leg === 'l' ? 'Loading Appointment' : 'Delivery Appointment';
  const what = leg === 'l' ? 'φόρτωσης' : 'παράδοσης';
  const cur  = rec.fields[fld] || '';

  const raw = prompt(`Ώρα ραντεβού ${what} (ΩΩ:ΛΛ).\nΆφησέ το κενό για να αφαιρεθεί.`, cur);
  if (raw === null) return;                       // Άκυρο — καμία αλλαγή
  const val = raw.trim();

  // Ίδιος έλεγχος με το CHECK της βάσης. Καλύτερα να το πιάσουμε εδώ παρά να
  // γυρίσει 400 από τη Supabase με μήνυμα που δεν λέει τίποτα στον χρήστη.
  if (val && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(val)) {
    toast('Μορφή ΩΩ:ΛΛ — π.χ. 10:00 ή 23:30', 'warn');
    return;
  }
  if (val === cur) return;                        // τίποτα δεν άλλαξε

  _wnSync('wn-sync-'+rowId, 'pend', 'Αποθήκευση…');
  try {
    await atSafePatch(TABLES.NAT_LOADS, rec.id, { [fld]: val || null });
    // Τοπική ενημέρωση ώστε να μη χρειαστεί ξαναφόρτωση όλης της εβδομάδας.
    if (val) rec.fields[fld] = val; else delete rec.fields[fld];
    invalidateCache(TABLES.NAT_LOADS);
    _wnSync('wn-sync-'+rowId, 'ok', 'Αποθηκεύτηκε');
    _wnPaint();
    _wnPulseRow(rowId);
  } catch (e) {
    console.error('_wnSetAppt:', e);
    _wnSync('wn-sync-'+rowId, 'err', 'Απέτυχε');
    toast('Η ώρα δεν αποθηκεύτηκε', 'error');
  }
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
    if (res?.conflict) { toast('Η εγγραφή άλλαξε από άλλον χρήστη — γίνεται ανανέωση','warn'); await renderWeeklyNatl(); return; }
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
      if (res?.conflict) { toast('Η εγγραφή άλλαξε από άλλον χρήστη — γίνεται ανανέωση','warn'); await renderWeeklyNatl(); return; }
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
    toast('Το CSV κατέβηκε');
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
window._wnSetAppt = _wnSetAppt;
window._wnNewOrder = _wnNewOrder;
// Φέτα 5 — τοπικές κινήσεις (inline onclick, module σε IIFE)
window._wnAddLocal  = _wnAddLocal;
window._wnSaveLocal = _wnSaveLocal;
window._wnDelLocal  = _wnDelLocal;
// v4 (batch 3) — inline handlers of the strip, the quick filters, the
// «χρειάζεται τοπικό» cover flow (module in IIFE, same reason as above)
window._wnQuick = _wnQuick;
window._wnClearFilter = _wnClearFilter;
window._wnCoverLocal = _wnCoverLocal;
window._wnSaveCover = _wnSaveCover;


// ── WN-3: print the week (warehouse works on paper) ─────────
// Mirrors _wiPrintWeek: same shared shell (_printWeekShell, core/utils),
// natl's own rows. ΚΑΘΟΔΟΣ and ΑΝΟΔΟΣ print as two sections in board order.
function _wnPrintWeek(){
  const secs=[['ΚΑΘΟΔΟΣ (Βορράς → Νότος)','northsouth'],['ΑΝΟΔΟΣ (Νότος → Βορράς)','southnorth']];
  let html=`<h2 style="font-family:'Syne',sans-serif;margin-bottom:12px">Weekly National — W${WNATL.week}</h2>
    <style>.wnp th,.wnp td{padding:4px 8px;border:1px solid;text-align:left}.wnp th{padding:8px;font-weight:700}.wnp .c{text-align:center}.wnp-sub{font-size:12px;margin-bottom:16px}</style>
    <p class="wnp-sub">${WNATL.data.northsouth.length} ΚΑΘΟΔΟΣ · ${WNATL.data.southnorth.length} ΑΝΟΔΟΣ · Εκτύπωση ${new Date().toLocaleString('el-GR')} — αντικαθιστά κάθε προηγούμενη έκδοση</p>`;
  for(const [secTitle,type] of secs){
    const rows=WNATL.rows.filter(r=>r.type===type);
    html+=`<h3 style="font-family:'Syne',sans-serif;font-size:13px;margin:16px 0 8px">${secTitle} — ${rows.length}</h3>
      <table class="wnp" style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>
          <th>#</th>
          <th>Διαδρομή</th>
          <th>Ημερομηνίες</th>
          <th class="c">Παλ.</th>
          <th>Ανάθεση</th>
        </tr></thead><tbody>`;
    rows.forEach((row,i)=>{
      const ord=WNATL.data[type].find(o=>o.id===row.orderId); if(!ord)return;
      const f=ord.fields;
      const from=(typeof _wnNlPickupSummary==='function'?_wnNlPickupSummary(f):'')||f['Name']||'—';
      const to=(typeof _wnNlDeliverySummary==='function'?_wnNlDeliverySummary(f):'')||'—';
      const assign=row.partnerLabel?`ΣΥΝ. ${row.partnerLabel}${row.partnerPlates?' ('+row.partnerPlates+')':''}`
                  :(row.truckLabel?`ΙΔ. ${row.truckLabel}${row.driverLabel?' · '+row.driverLabel:''}`:'ΠΡΟΣ ΑΝΑΘΕΣΗ');
      html+=`<tr>
        <td>${i+1}</td>
        <td>${from} → ${to}</td>
        <td>${toLocalDate(f['Loading DateTime'])||'—'} → ${toLocalDate(f['Delivery DateTime'])||'—'}</td>
        <td class="c">${f['Total Pallets']!=null?f['Total Pallets']:'—'}</td>
        <td>${assign}</td>
      </tr>`;
    });
    html+='</tbody></table>';
  }
  _printWeekShell(`Week ${WNATL.week} — Weekly National — Petras TMS`, html);
}
window._wnPrintWeek = _wnPrintWeek;
})();
