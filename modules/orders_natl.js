// ═══════════════════════════════════════════════
// MODULE — NATIONAL ORDERS  v2
// ═══════════════════════════════════════════════
(function() {
'use strict';

const NATL_ORDERS = { data: [], selectedId: null };
let _natlPeriod = '60'; // '60' | '180' | 'all'

// ─── Ref data: delegates to shared form-helpers.js ──
const _loadLocations = fhLoadLocations;
const _batchResolveClients = fhBatchResolveClients;

// Form helpers for location/client selects (delegates to core/form-helpers.js)
function _locSelect(id, currentId) { return fhLocSelect(id, currentId, 'fhLocDrop'); }
function _clientSelect(id, currentId, currentLabel) { return fhClientSelect(id, currentId, currentLabel, 'fhClientDrop'); }

// ─── Main ───────────────────────────────────────
// Since 28/9/2026 (owner: one «Παραγγελίες» page) the LIST is drawn by
// modules/orders_catalog.js for both types. This module keeps what is really
// national: the data load (orders + client names + the «missing national
// load» check), the card, the form (normal / groupage), the scan and the
// cascades. The catalog calls loadOrdersNatlData().
async function _natlLoad() {
    // Date range filter based on period dropdown
    const _natlDateFormula = OrdersList.periodFormula(_natlPeriod);
    // Perf 29/9: the list paints on the orders and their loads (ΑΝΑΘΕΣΗ /
    // «εκτός» need them); location labels and client names arrive in the
    // background (NATL_ORDERS.namesReady — the catalog shows «…» until then).
    const records = await atGet(TABLES.NAT_ORDERS, _natlDateFormula || '', false);
    records.sort((a,b) => (b.fields['Loading DateTime']||'').localeCompare(a.fields['Loading DateTime']||''));
    NATL_ORDERS.data = records;
    NATL_ORDERS.selectedId = null;

    // Location labels (the card's stop lines read _fhLocationsMap) and client
    // names — batch fetches in parallel (not N+1). Never rejects.
    const _allClientIds = [...new Set(records
      .flatMap(r => r.fields['Client']||[])
      .filter(Boolean))];
    // After the reference preload: it holds every client name, so the
    // batches then fetch only what it lacks (none, normally).
    const _refP = typeof preloadReferenceData === 'function' ? preloadReferenceData().catch(e => console.warn('orders_natl: ref data', e)) : Promise.resolve();
    // Resolves to the warnings to show. A failed locations read used to fail
    // the whole national list (banner); now the list is up, so it must be SAID
    // here — the card prints _fhLocationsMap labels (reviewer 29/9). Client
    // batches never reject (safeFetch logs them; unknown ids stay as before).
    NATL_ORDERS.namesReady = _refP.then(() => {
      const warns = [];
      return Promise.all([
        _loadLocations().catch(e => { console.warn('orders_natl: locations', e); warns.push('Οι τοποθεσίες δεν φορτώθηκαν — οι στάσεις στην καρτέλα των εθνικών δείχνουν κωδικό αντί για όνομα. Δεν σημαίνει ότι δεν έχουν καταχωρηθεί. Ξαναδοκίμασε με Ανανέωση.'); }),
        _batchResolveClients(_allClientIds).catch(e => console.warn('orders_natl: client names', e)),
      ]).then(() => warns);
    });

    // 13/9 (owner: «εθνικές παραγγελίες που δεν βρίσκονται στο Weekly»): the
    // Weekly National reads NATIONAL LOADS only. Orders 5–8 were saved while the
    // load create 400'd (Source Record → intl FK, fixed 7/9) and stayed invisible
    // with no sign anywhere. The list now asks which non-groupage orders have no
    // live load and says so on the row, with the repair one click away
    // (_natlSendToWeekly runs the same _syncNationalLoad the form runs).
    // The loads come from OrdersCommon.natLoadsFor (one query, shared with the
    // «Χωρίς τιμή» view): they answer both «is it on the board» (noLoad) and
    // «who drives it» (the ΑΝΑΘΕΣΗ cell — owner 29/9).
    NATL_ORDERS.noLoad = new Set();
    NATL_ORDERS.loads = new Map();
    NATL_ORDERS.loadsFailed = false;
    try {
      NATL_ORDERS.loads = await OrdersCommon.natLoadsFor(records);
      records.forEach(r => { if (!r.fields['National Groupage'] && !NATL_ORDERS.loads.has(r.id)) NATL_ORDERS.noLoad.add(r.id); });
    } catch(e) {
      // Unknown ≠ «εκτός»: without the answer no row is marked missing, and
      // the list SAYS the check did not run (warn below).
      NATL_ORDERS.loadsFailed = true;
      if (typeof logError === 'function') logError(e, 'orders_natl: load presence check');
    }

  return NATL_ORDERS.data;
}

// The card's styles used to arrive with the list's innerHTML; the list is
// gone, so they go to <head> once (same CSS, scoped under .on-v2 — the
// catalog layout carries that class).
function _onEnsureStyles() {
  if (document.getElementById('onStyles')) return;
  const holder = document.createElement('div'); holder.innerHTML = _ON_CSS;
  const st = holder.querySelector('style'); if (!st) return;
  st.id = 'onStyles'; document.head.appendChild(st);
}

// Loader for the catalog: period = '60' | '180' | 'all'.
async function loadOrdersNatlData(period) {
  if (period) _natlPeriod = period;
  await _natlLoad();
  _onEnsureStyles();
  return { records: NATL_ORDERS.data, noLoad: NATL_ORDERS.noLoad || new Set(), loads: NATL_ORDERS.loads || new Map(), namesReady: NATL_ORDERS.namesReady,
    warns: NATL_ORDERS.loadsFailed ? ['Τα εθνικά φορτία δεν φορτώθηκαν — η στήλη ΑΝΑΘΕΣΗ των εθνικών δεν δείχνει όχημα ούτε «εκτός». Δεν σημαίνει ότι δεν υπάρχουν. Ξαναδοκίμασε με Ανανέωση.'] : [] };
}

// Kept for its callers (form submit, groupage submit, delete, scan, retry):
// «redraw the national list» now means «redraw the Orders page» — or open it
// on the national scope when the user is elsewhere.
function renderOrdersNatl() {
  if (typeof currentPage !== 'undefined' && currentPage === 'orders' && typeof OrdersHub !== 'undefined') return OrdersHub.refresh();
  return Promise.resolve(navigate('orders_natl'));
}

// Greek display words for DB values (DESIGN.md ΜΕΡΟΣ Ε): the value in the
// record never changes, only what the screen prints.
const _ON_DIR_WORD = { 'South→North': 'ΑΝΟΔΟΣ', 'North→South': 'ΚΑΘΟΔΟΣ' };
const _ON_STATUS = {
  Pending: 'ΣΕ ΑΝΑΜΟΝΗ', Confirmed: 'ΕΠΙΒΕΒΑΙΩΜΕΝΗ', Assigned: 'ΑΝΑΤΕΘΕΙΜΕΝΗ',
  'In Transit': 'ΣΕ ΜΕΤΑΦΟΡΑ', Delivered: 'ΠΑΡΑΔΟΘΗΚΕ', Cancelled: 'ΑΚΥΡΩΘΗΚΕ', Invoiced: 'ΤΙΜΟΛΟΓΗΘΗΚΕ',
};
const _ON_TYPE = { Independent: 'Ανεξάρτητη', 'Veroia Switch': 'Veroia Switch' };
// d/M like the Figma list ("7/9"): formatDateShort gives an English month name
// ("24 Aug") that wraps in an 80px column and is not Greek (ΜΕΡΟΣ Ε).
const _onDate = d => d ? new Date(d).toLocaleDateString('el-GR', { day: 'numeric', month: 'numeric' }) : '—';
// §4 #8 (N-06, 4/10/2026): the card used to read Linked Trip / NATIONAL TRIPS
// on the ORDER — links a national order never carries — so it said «ΠΡΟΣ
// ΑΝΑΘΕΣΗ — χωρίς δρομολόγιο» on every order, the 3 assigned ones included.
// The assignment lives on the order's NATIONAL LOAD, which the list already
// read (NATL_ORDERS.loads via OrdersCommon.natLoadsFor); the card asks the SAME
// rule as the catalog's ΑΝΑΘΕΣΗ cell (OrdersCommon.assignOf), not a copy.
// A failed load read is «unknown» — never «προς ανάθεση» (principle 1).
function _onAssignment(rec) {
  const loads = NATL_ORDERS.loads instanceof Map ? NATL_ORDERS.loads : null;
  if (!rec.fields['National Groupage'] && (NATL_ORDERS.loadsFailed || !loads)) return { key: 'unknown', text: '' };
  return OrdersCommon.assignOf({ ...rec, _type: 'natl' },
    { load: (loads && loads.get(rec.id)) || null, missingLoad: !!(NATL_ORDERS.noLoad && NATL_ORDERS.noLoad.has(rec.id)) });
}
const _ON_ASSIGN_LINE = {
  grp: 'Μέσω ομαδοποίησης — το φορτηγό ορίζεται στο groupage',
  out: 'ΕΚΤΟΣ ΕΒΔΟΜΑΔΙΑΙΟΥ — δεν έχει εθνικό φορτίο',
  unknown: 'Άγνωστη — τα εθνικά φορτία δεν φορτώθηκαν. Δεν σημαίνει ότι είναι χωρίς ανάθεση· ξαναδοκίμασε με Ανανέωση.',
  pa: 'ΠΡΟΣ ΑΝΑΘΕΣΗ — στο Εβδομαδιαίο, χωρίς όχημα',
};

// Scoped styles for this screen only (spec w4-orders-interaction-spec 208:724).
// They live here and not in style.css because the batch rule is "one agent,
// one file"; tokens that do not exist yet (--surface-dark, --text-on-dark,
// --warn, --ok) fall back to the nearest existing one and are REQUESTED in the
// hand-off, not invented.
const _ON_CSS = `
<style>
.on-v2 .dim{color:var(--text-dim)}
/* Form: the chosen mode card keeps a border, not a fill (spec §6). */
#modal .nf-mode.on{background:var(--surface-card);box-shadow:none}
.on-dot{display:inline-block;width:8px;height:8px;border-radius:var(--radius-full);margin-right:4px;vertical-align:middle}
.on-dot.ok{background:var(--ok)}
.on-dot.unassigned{background:var(--unassigned)}
/* Detail card: 480px, shadow to the left, closed = width 0 AND display:none
   (the 482px lesson of 29/8 — a closed panel that keeps width cuts columns). */
.on-v2 .entity-detail-panel{width:480px;background:var(--surface-card);position:relative;z-index:1;box-shadow:var(--shadow-panel);border-left:1px solid var(--border);overflow-y:auto}
.on-v2 .entity-detail-panel.hidden{width:0;display:none;border-left:none;box-shadow:none}
.on-v2 .entity-detail-panel.on-opening{animation:onSlideIn var(--duration-fast) var(--ease-out)}
@keyframes onSlideIn{from{transform:translateX(100%)}to{transform:none}}
.on-card-head{background:var(--surface-dark);padding:16px 24px}
.on-card-title-row{display:flex;align-items:flex-start;gap:8px}
.on-card-title{flex:1;font-family:'Syne',sans-serif;font-weight:700;font-size:18px;line-height:1.2;letter-spacing:1px;text-transform:uppercase;color:var(--text-on-dark);word-break:break-word}
.on-card-x{background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:18px;line-height:1;padding:0 4px}
.on-card-x:hover{color:var(--text-on-dark)}
.on-card-sub{font-size:12px;color:var(--text-dim);margin-top:4px}
.on-chips{display:flex;flex-wrap:wrap;gap:8px;padding-top:12px}
.on-chip{border:1px solid var(--border-dark);border-radius:var(--radius-full);padding:4px 8px;font:700 11px/1.2 'DM Sans',sans-serif;letter-spacing:.5px;color:var(--text-on-dark);white-space:nowrap}
/* On the navy head --warn alone is unreadable (dark on dark); the warn pair
   (amber fill + dark amber text) is the only token combination that is. */
.on-chip.warn{background:var(--warn-bg);border-color:var(--warn-border);color:var(--warn)}
.on-chip.unassigned{background:var(--unassigned);border-color:var(--unassigned);color:var(--text-on-dark)}
.on-sec{padding:12px 24px;border-bottom:1px solid var(--border)}
.on-sec:last-child{border-bottom:none}
.on-sec.sunken{background:var(--surface-sunken)}
.on-sec-title{font-family:'Syne',sans-serif;font-weight:700;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--text-mid);margin-bottom:8px}
.on-row{display:flex;align-items:center;gap:8px;min-height:24px;font-size:13px}
.on-row-l{color:var(--text-mid);white-space:nowrap}
.on-row-v{margin-left:auto;text-align:right;color:var(--text);font-weight:600;font-variant-numeric:tabular-nums;word-break:break-word}
.on-row-v.dim{color:var(--text-dim);font-weight:400}
.on-row-main{color:var(--text);word-break:break-word}
.on-row-main.unassigned{color:var(--unassigned);font-weight:700}
.on-mini{border:1px solid var(--border);border-radius:var(--radius);padding:0 4px;font:700 11px/1.4 'DM Sans',sans-serif;letter-spacing:.5px;color:var(--text-mid);white-space:nowrap}
.on-row-date{color:var(--text-mid);font-variant-numeric:tabular-nums;white-space:nowrap;min-width:40px}
.on-link{background:none;border:none;padding:0;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--accent-text)}
.on-link:hover{text-decoration:underline}
.on-acts{display:flex;gap:10px;font-size:13px;flex-wrap:wrap}
/* Owner 7/9/2026: «δεν υπάρχει κουμπί επεξεργασίας» — the actions were grey text
   links under «Ενέργειες» at the bottom of the card, invisible without scrolling.
   Real buttons here + a header «Επεξεργασία» next to the × (on-head-edit). */
.on-act{background:var(--surface-card);border:1px solid var(--border);border-radius:6px;padding:6px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;color:var(--text)}
.on-act:hover{border-color:var(--accent);color:var(--accent)}
.on-act.danger{color:var(--danger)} .on-act.danger:hover{border-color:var(--danger)}
.on-head-edit{margin-left:auto;margin-right:8px;background:var(--accent);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer}
.on-head-edit:hover{background:var(--accent-hover,#0369A1)}
.on-notes{font-size:13px;color:var(--text-mid);line-height:1.5;white-space:pre-wrap;word-break:break-word}
</style>`;

function closeNatlDetail() {
  const p = document.getElementById('natlDetail');
  if (p) p.classList.add('hidden');
  NATL_ORDERS.selectedId = null;
  document.querySelectorAll('#natlTable tbody tr.selected').forEach(tr => tr.classList.remove('selected'));
}

// ─── Detail Panel ───────────────────────────────
// Local row helper: the old panel borrowed `_dF` from modules/orders_intl.js —
// a cross-module dependency that the parallel orders_intl redesign may rename.
// Values sit RIGHT-aligned (w2-location-card 230:821).
function _onDF(label, valueHtml, dim) {
  return `<div class="on-row"><span class="on-row-l">${escapeHtml(label)}</span><span class="on-row-v${dim ? ' dim' : ''}">${valueHtml}</span></div>`;
}
const _ON_NA = '— δεν έχει καταχωρηθεί';

function selectNatlOrder(recId) {
  const wasClosed = !NATL_ORDERS.selectedId;
  NATL_ORDERS.selectedId = recId;
  document.querySelectorAll('#natlTable tbody tr').forEach(tr => tr.classList.remove('selected'));
  const row = document.getElementById('nrow_'+recId); if(row) row.classList.add('selected');
  const rec = NATL_ORDERS.data.find(r => r.id === recId); if(!rec) return;
  const panel = document.getElementById('natlDetail');
  panel.classList.remove('hidden');
  // Slide in only when opening from closed; switching rows swaps content with
  // no motion (spec §1: motion only where it explains something).
  panel.classList.remove('on-opening');
  if (wasClosed) {
    void panel.offsetWidth;   // restart the animation if the class was just removed
    panel.classList.add('on-opening');
    panel.addEventListener('animationend', () => panel.classList.remove('on-opening'), { once: true });
  }
  const f = rec.fields;
  const canEdit = can('orders') === 'full';
  const asg = _onAssignment(rec);
  const asgOk = asg.key === 'own' || asg.key === 'partner';
  const asgOpen = asg.key === 'pa' || asg.key === 'out';
  const cId = Array.isArray(f['Client']) ? f['Client'][0] : '';
  const pId = (f['Pickup Location 1']||[])[0]||'';
  const client = cId ? (_fhClientsMap[cId] || cId) : '';
  // Δ2 again: `Name` is not a field, so the old fallback printed six characters
  // of the row id as if it were a title. Reference, or an honest «ΧΩΡΙΣ ΑΝΑΦΟΡΑ».
  const name = String(f['Reference'] || '').trim() || 'ΧΩΡΙΣ ΑΝΑΦΟΡΑ';
  // «Ε-427» first, like the international card's «#1229» (owner 27/9). Only
  // when the Worker sends 'Order No' (view 054 + deploy): before that the card
  // simply has no number — never the record id (IN-2).
  const natNo = f['Order No'] ? OrdersCommon.numLabel({ _type: 'natl', fields: f }) : '';
  const subParts = [natNo, _ON_DIR_WORD[f['Direction']] || f['Direction'] || '', _ON_TYPE[f['Type']] || f['Type'] || ''].filter(Boolean);

  // Header chips are OUTLINE only; PE always shows when it applies (owner 31/8).
  const chips = [];
  if (f['Status'] && _ON_STATUS[f['Status']]) chips.push(`<span class="on-chip">${_ON_STATUS[f['Status']]}</span>`);
  else if (f['Status']) chips.push(`<span class="on-chip">${escapeHtml(String(f['Status']).toUpperCase())}</span>`);
  if (asgOk) chips.push('<span class="on-chip">ΜΕ ΟΧΗΜΑ</span>');
  else if (asg.key === 'unknown') chips.push('<span class="on-chip warn">ΑΝΑΘΕΣΗ ΑΓΝΩΣΤΗ</span>');
  else if (asg.key === 'out') chips.push('<span class="on-chip unassigned">ΕΚΤΟΣ ΕΒΔΟΜΑΔΙΑΙΟΥ</span>');
  else if (asg.key === 'pa') chips.push('<span class="on-chip unassigned">ΠΡΟΣ ΑΝΑΘΕΣΗ</span>');
  chips.push(f['Invoiced'] ? '<span class="on-chip">ΤΙΜΟΛΟΓΗΘΗΚΕ</span>' : '<span class="on-chip warn">ΧΩΡΙΣ ΤΙΜΟΛΟΓΗΣΗ</span>');
  if (f['National Groupage']) chips.push('<span class="on-chip">GRP</span>');
  if (f['Type']==='Veroia Switch') chips.push('<span class="on-chip">VS</span>');
  if (f['Pallet Exchange']) chips.push('<span class="on-chip">PE · ΑΝΤΑΛΛΑΓΗ ΠΑΛΕΤΩΝ</span>');

  // Route: date + outline chip + name + right-hand quantity. Per-stop pallets
  // live in ORDER_STOPS (not loaded here) — the total is shown on the right
  // only when there is exactly one delivery, otherwise it would be a guess.
  const delivIds = [];
  for (let i = 1; i <= 10; i++) { const id = (f[`Delivery Location ${i}`]||[])[0]; if (id) delivIds.push(id); }
  if (!delivIds.length && (f['Delivery Location']||[])[0]) delivIds.push(f['Delivery Location'][0]);
  const palTotal = f['Pallets'] != null ? `${f['Pallets']} pal` : '';
  const routeRow = (date, kind, locId, right) => `
    <div class="on-row">
      <span class="on-row-date">${_onDate(date)}</span>
      <span class="on-mini">${kind}</span>
      <span class="on-row-main">${escapeHtml(locId ? (_fhLocationsMap[locId] || locId) : '—')}</span>
      <span class="on-row-v">${right || ''}</span>
    </div>`;
  const routeHtml = [
    pId ? routeRow(f['Loading DateTime'], 'ΠΑΡΑΛΑΒΗ', pId, palTotal) : '',
    ...delivIds.map(id => routeRow(f['Delivery DateTime'], 'ΠΑΡΑΔΟΣΗ', id, delivIds.length === 1 ? palTotal : '')),
  ].join('') || `<div class="on-row"><span class="on-row-v dim">${_ON_NA}</span></div>`;

  panel.innerHTML = `
    <div class="on-card-head">
      <div class="on-card-title-row">
        <div class="on-card-title">${escapeHtml(name)}${client ? ' · ' + escapeHtml(client) : ''}</div>
        ${canEdit ? `<button type="button" class="on-head-edit" onclick="openNatlEdit('${recId}')">Επεξεργασία</button>` : ''}
        <button type="button" class="on-card-x" title="Κλείσιμο (Esc)" onclick="closeNatlDetail()">×</button>
      </div>
      ${subParts.length ? `<div class="on-card-sub">${escapeHtml(subParts.join(' · '))}</div>` : ''}
      <div class="on-chips">${chips.join('')}</div>
    </div>
    <div class="on-sec">
      <div class="on-sec-title">Στοιχεία</div>
      ${_onDF('Πελάτης', client ? escapeHtml(client) : _ON_NA, !client)}
      ${_onDF('Κατάσταση', f['Status'] ? (_ON_STATUS[f['Status']] || escapeHtml(f['Status'])) : _ON_NA, !f['Status'])}
      ${_onDF('Εμπόρευμα', f['Goods'] ? escapeHtml(f['Goods']) : _ON_NA, !f['Goods'])}
      ${_onDF('Παλέτες', f['Pallets'] != null ? escapeHtml(String(f['Pallets'])) : _ON_NA, f['Pallets'] == null)}
      ${_onDF('Θερμοκρασία', f['Temperature °C'] != null ? escapeHtml(String(f['Temperature °C'])) + ' °C' : _ON_NA, f['Temperature °C'] == null)}
      ${can('costs')!=='none' ? _onDF('Τιμή', f['Price'] != null ? Number(f['Price']).toLocaleString('el-GR') + ' €' : _ON_NA, f['Price'] == null) : ''}
      ${_onDF('Τιμολογήθηκε', f['Invoiced'] ? 'Ναι' : 'Όχι')}
    </div>
    <div class="on-sec sunken">
      <div class="on-sec-title">Διαδρομή</div>
      ${routeHtml}
    </div>
    <div class="on-sec">
      <div class="on-sec-title">Ανάθεση</div>
      <div class="on-row">
        <span class="on-dot${asgOk ? ' ok' : asgOpen ? ' unassigned' : ''}"></span>
        <span class="on-row-main${asgOpen ? ' unassigned' : ''}" data-assign="${asg.key}">${asgOk ? escapeHtml(asg.text) : (_ON_ASSIGN_LINE[asg.key] || _ON_ASSIGN_LINE.unknown)}</span>
      </div>
      <div class="on-row"><button type="button" class="on-link" onclick="navigate('weekly_natl')">άνοιγμα στο Weekly National →</button></div>
    </div>
    ${f['Notes'] ? `<div class="on-sec">
      <div class="on-sec-title">Σημειώσεις</div>
      <div class="on-notes">${escapeHtml(f['Notes'])}</div>
    </div>` : ''}
    ${canEdit ? `<div class="on-sec">
      <div class="on-sec-title">Ενέργειες</div>
      <div class="on-acts">
        <button type="button" class="on-act" onclick="openNatlEdit('${recId}')">Επεξεργασία</button>
        <button type="button" class="on-act danger" title="Διαγραφή με cascade — αφαιρεί NL/GL/CL/Ramp/Παλέτες" onclick="deleteNatlOrder('${recId}')">Διαγραφή</button>
      </div>
    </div>` : ''}`;
}

/* ═══ Φ3β — GROUPAGE: μία καταχώρηση, πολλοί πελάτες (Γ1) ═════════════
 *
 * Γράφει ΟΛΟΚΛΗΡΗ την αλυσίδα, με αυστηρή σειρά:
 *
 *   1. NAT_ORDERS  xN   ένα ανά πελάτη, με το δικό του Price
 *   2. GROUPAGE_LINES xM  ένα ανά στάση, δεμένο στην παραγγελία του
 *   3. CONSOLIDATED_LOAD x1  το φορτηγό
 *   4. PATCH GL -> Linked Consolidated Load
 *   5. NAT_LOAD x1  Source Consolidated Load -> το CL
 *   6. ORDER_STOPS ανά παραγγελία, με παλέτες ΑΝΑ ΣΤΑΣΗ
 *
 * ΓΙΑΤΙ ΓΡΑΦΟΥΜΕ ΕΜΕΙΣ ΤΟ NAT_LOAD (εύρημα 10/8): κανένα σημείο αυτού του
 * repo δεν δημιουργεί NL από CL — η εφαρμογή μόνο διαβάζει Source Type=
 * 'Groupage'. Τη δημιουργία την κάνει το petras-assign, που δεν αγγίζουμε
 * (Δ11). Χωρίς αυτό το βήμα το φορτίο δεν θα εμφανιζόταν ΠΟΤΕ στο εβδομαδιαίο.
 *
 * ΠΑΓΙΔΑ Ο1: το `Groupage ID` είναι derived στα GL (ο Worker το εξαιρεί
 * επίτηδες) και κανονικό πεδίο στα CL. Γράφεται ΜΟΝΟ στο CL.
 *
 * Η υπάρχουσα φόρμα ενός πελάτη ΔΕΝ αγγίζεται. Αυτό είναι νέα, πρόσθετη
 * διαδρομή: αν σπάσει, η κανονική καταχώρηση δεν επηρεάζεται.
 */
async function _natlWriteGroupageChain(common, groups) {
  const created = { orders: [], gls: [], cl: null, nl: null };
  const grpId = 'G-' + Date.now().toString(36).toUpperCase();

  // 1. NAT_ORDERS — ένα ανά πελάτη
  for (const g of groups) {
    const totalPal = g.stops.reduce((s, x) => s + (x.pallets || 0), 0);
    const f = {
      'Direction': common.direction,
      'Client': [g.clientId],
      'Goods': common.goods || '',
      'Pallets': totalPal,
      'Loading DateTime': common.loadDate,
      'Delivery DateTime': g.stops[0]?.date || common.delDate,
      'National Groupage': true,
      'Status': 'Pending',
      'Pickup Location 1': [common.fromLocId],
    };
    if (common.temp != null && common.temp !== '') f['Temperature °C'] = parseFloat(common.temp);
    if (g.price) f['Price'] = parseFloat(g.price);
    g.stops.forEach((s, i) => { if (i < 10) f[`Delivery Location ${i+1}`] = [s.locId]; });
    const rec = await atCreate(TABLES.NAT_ORDERS, f);
    created.orders.push({ id: rec.id, group: g });

    // 6. ORDER_STOPS — παλέτες ΑΝΑ ΣΤΑΣΗ (Α1: ποτέ το σύνολο σε καθεμία)
    const stops = [{ stopNumber: 1, stopType: 'Loading', locationId: common.fromLocId,
                     pallets: totalPal, dateTime: common.loadDate, clientId: g.clientId }];
    g.stops.forEach((s, i) => stops.push({ stopNumber: i+1, stopType: 'Unloading',
      locationId: s.locId, pallets: s.pallets || 0, dateTime: s.date || common.delDate,
      clientId: g.clientId, notes: s.note || null }));
    try { await stopsSave(rec.id, stops, F.STOP_PARENT_NAT); }
    catch(e) { console.warn('groupage: ORDER_STOPS', e); }
  }

  // 2. GROUPAGE_LINES — ένα ανά στάση, δεμένο στην παραγγελία του
  for (const o of created.orders) {
    for (const s of o.group.stops) {
      const gl = await atCreate(TABLES.GL_LINES, {
        'Direction': common.direction,
        'Pallets': s.pallets || 0,
        'Loading Date': (common.loadDate||'').slice(0,10) || null,
        'Delivery Date': (s.date || common.delDate || '').slice(0,10) || null,
        'Status': 'Assigned',
        'Goods': common.goods || '',
        'Loading Location': [common.fromLocId],
        'Delivery Location': [s.locId],
        'Linked National Order': [o.id],
        // ΟΧΙ Groupage ID εδώ — derived στα GL (Ο1)
      });
      created.gls.push(gl.id);
    }
  }

  // 3. CONSOLIDATED_LOAD — το φορτηγό
  const allStops = groups.flatMap(g => g.stops);
  const totalPallets = allStops.reduce((s, x) => s + (x.pallets || 0), 0);
  const clFields = {
    'Name': `${common.fromLabel} — ${(common.loadDate||'').slice(0,10)}`,
    'Date': (common.loadDate||'').slice(0,10) || null,
    'Direction': common.direction === 'South→North' ? DIR.ANODOS : DIR.KATHODOS,
    'Status': 'Pending',
    'Total Pallets': totalPallets,
    'Goods': common.goods || '',
    'Loading DateTime': common.loadDate || null,
    'Delivery DateTime': common.delDate || null,
    'Is Groupage': true,
    'Groupage ID': grpId,
    'Loading Location 1': [common.fromLocId],
  };
  if (common.temp != null && common.temp !== '') clFields['Temperature C'] = parseFloat(common.temp);
  allStops.forEach((s, i) => {
    if (i >= 10) return;
    clFields[`Delivery Location ${i+1}`] = [s.locId];
    clFields[`Pallets ${i+1}`] = s.pallets || 0;
  });
  const cl = await atCreate(TABLES.CONS_LOADS, clFields);
  created.cl = cl.id;

  // 4. Δέσε τα GL στο CL — τώρα υπάρχει και από τις δύο πλευρές ίχνος
  for (const glId of created.gls) {
    try { await atPatch(TABLES.GL_LINES, glId, { 'Linked Consolidated Load': [cl.id] }); }
    catch(e) { console.warn('groupage: GL->CL link', e); }
  }

  // 5. NAT_LOAD — η γραμμή που θα δει ο dispatcher στο εβδομαδιαίο
  const nlFields = {
    'Name': clFields['Name'],
    'Direction': common.direction,
    'Source Type': 'Groupage',
    'Source Consolidated Load': [cl.id],
    'Client': groups.length === 1 ? (groups[0].clientLabel||'')
            : `${groups[0].clientLabel||''} +${groups.length-1}`,
    'Goods': common.goods || '',
    'Total Pallets': totalPallets,
    'Loading DateTime': common.loadDate || null,
    'Delivery DateTime': common.delDate || null,
    'Status': 'Pending',
    'Pickup Location 1': [common.fromLocId],
  };
  if (common.temp != null && common.temp !== '') nlFields['Temperature C'] = parseFloat(common.temp);
  allStops.forEach((s, i) => { if (i < 10) nlFields[`Delivery Location ${i+1}`] = [s.locId]; });
  const nl = await atCreate(TABLES.NAT_LOADS, nlFields);
  created.nl = nl.id;

  // 13/9 (Sotiris go-live audit, load 93 with 0 stops): every other path that
  // creates a national load also writes its ORDER STOPS (`_syncNationalLoad`,
  // orders_intl `_syncVeroiaSwitch`) — the groupage chain never did, so the
  // Weekly tiles, the print sheet, Daily Ops stop stamps and the pallet gate
  // all saw an empty load. One Loading stop at the pickup, one Unloading per
  // client stop, each with its own pallets/day/client — the same objects the
  // per-order stops above were built from.
  const nlStops = [{ stopNumber: 1, stopType: 'Loading', locationId: common.fromLocId,
                     pallets: totalPallets, dateTime: common.loadDate || null, goods: common.goods || null,
                     temp: (common.temp != null && common.temp !== '') ? parseFloat(common.temp) : null }];
  let n = 0;
  for (const o of created.orders) {
    for (const s of o.group.stops) {
      n += 1;
      nlStops.push({ stopNumber: n, stopType: 'Unloading', locationId: s.locId, pallets: s.pallets || 0,
                     dateTime: s.date || common.delDate || null, clientId: o.group.clientId,
                     goods: common.goods || null, notes: s.note || null });
    }
  }
  try { await stopsSave(nl.id, nlStops, F.STOP_PARENT_NL); }
  catch(e) {
    if (typeof reportError === 'function') reportError('Το φορτίο γράφτηκε αλλά ΧΩΡΙΣ στάσεις — άνοιξέ το και αποθήκευσέ το ξανά', e, 'warn');
    if (typeof logError === 'function') logError(e, 'groupage: NL ORDER_STOPS');
  }

  return created;
}

/* ── Φόρμα groupage ───────────────────────────────────────────────────
 * Μία ΚΑΡΤΑ ανά ΠΕΛΑΤΗ (owner 6/9, Figma 165:677), με ένα ή περισσότερα
 * σημεία παράδοσης μέσα σε αυτήν. Παλιότερα (Δ audit w4) ήταν μία γραμμή
 * ανά στάση με στήλη πελάτη· η ομαδοποίηση σε παραγγελίες γινόταν στην
 * υποβολή. Εδώ η ομαδοποίηση είναι η ίδια η δομή: όσες κάρτες, τόσοι
 * πελάτες, τόσες παραγγελίες. Το payload που φτάνει στο _natlWriteGroupageChain
 * είναι ΤΟ ΙΔΙΟ ΑΚΡΙΒΩΣ — μόνο η φόρμα άλλαξε (βλ. _grpGroups).
 */
let _grpCards = [];       // uids καρτών, με τη σειρά εμφάνισης· 1 κάρτα = 1 πελάτης
let _grpCardRows = {};    // cardUid -> [rowUid,...] τα σημεία παράδοσης αυτής της κάρτας

// openNatlGroupage αφαιρέθηκε: το groupage ζει ΜΕΣΑ στη φόρμα (Δ17).

let _grpSeq = 0;

/* Δ17 — επιλογή τύπου ΜΕΣΑ στη φόρμα, μόνο σε δημιουργία.
   Το κρυφό nf_Groupage μένει συγχρονισμένο: το διαβάζει το submitNatlOrder
   αυτούσιο, οπότε η απλή διαδρομή δεν αγγίχτηκε καθόλου.
   Owner 6/9: το πλάτος είναι πλέον ΣΤΑΘΕΡΟ (.modal--wide, 1100px) και στους
   δύο τύπους — πριν εναλλασσόταν 680/900px, αλλά ο owner θέλει «περισσότερο
   χώρο» γενικά, όχι μόνο στο Groupage. Η κλάση μπαίνει μία φορά στο
   openNatlModal· εδώ δεν αγγίζουμε το πλάτος καθόλου. */
function _natlMode(m) {
  const cb = document.getElementById('nf_Groupage'); if (cb) cb.checked = !!m;
  const m0 = document.getElementById('nf_m0'), m1 = document.getElementById('nf_m1');
  if (!m0 || !m1) return;                      // edit mode: δεν υπάρχουν κάρτες
  m0.className = 'nf-mode' + (m ? '' : ' on');
  m1.className = 'nf-mode' + (m ? ' on' : '');
  const r0 = m0.querySelector('input'), r1 = m1.querySelector('input');
  if (r0) r0.checked = !m; if (r1) r1.checked = !!m;
  const simple = document.getElementById('nf_simple'), grp = document.getElementById('nf_grp');
  if (simple) simple.style.display = m ? 'none' : '';
  if (grp)    grp.style.display    = m ? '' : 'none';
  // Audit w4: top-level Πελάτης/Τιμή δεν τα διαβάζει ποτέ το _grpSubmit — σε
  // Groupage ο πελάτης/η τιμή δηλώνονται ανά γραμμή παράδοσης (grpc/grpv).
  const clientF = document.getElementById('nf_clientField'), priceF = document.getElementById('nf_priceField');
  if (clientF) clientF.style.display = m ? 'none' : '';
  if (priceF)  priceF.style.display  = m ? 'none' : '';
  const pickupHint = document.getElementById('nf_pickupHint');
  if (pickupHint) pickupHint.style.display = m ? '' : 'none';
  const btn = document.getElementById('natlBtnSubmit');
  if (btn) {
    btn.setAttribute('onclick', m ? '_grpSubmit()' : "submitNatlOrder('')");
    btn.textContent = m ? 'Καταχώρηση' : 'Καταχώρηση';
  }
  if (m) { _grpRender(); }
}


/* Μία ΚΑΡΤΑ ανά στάση, όχι στριμωγμένη γραμμή 7 στηλών.
   Πελάτης και τοποθεσία χρησιμοποιούν ΤΑ ΙΔΙΑ αναζητήσιμα πεδία με την
   κανονική φόρμα (_clientSelect / _locSelect): γράφεις 2 χαρακτήρες και
   ψάχνει. Οι τιμές ζουν στα κρυφά lv_<id> και διαβάζονται στην υποβολή. */
// ─── Απλό φορτίο: σημεία παράδοσης ──────────────────────────────────────
// Και τα κανονικά φορτία έχουν πολλαπλά σημεία με διαφορετικές παλέτες το
// καθένα (owner 12/08). Ένα συνολικό «Pallets» στην κορυφή δεν μπορούσε να το
// εκφράσει — ίδια ρίζα με το Α1, όπου το σύνολο γραφόταν αυτούσιο σε κάθε
// στάση. Το σύνολο υπολογίζεται πλέον από τα σημεία, δεν δηλώνεται.
let _simRows = [], _simSeq = 0;

function _simRowHTML(uid, pre) {
  pre = pre || {};
  return `<div class="grp-row" id="simr_${uid}"
      style="border:1px solid var(--border-mid);border-radius:var(--radius);padding:12px;margin-bottom:8px;background:var(--surface-card)">
    <div style="display:grid;grid-template-columns:minmax(360px,1.6fr) 80px 150px minmax(180px,1fr) 34px;gap:12px;align-items:end">
      <div><label class="form-label">Τοποθεσία παράδοσης *</label>${_locSelect('nsl'+uid, pre.loc||'')}</div>
      <div><label class="form-label">Παλέτες</label>
        <input class="form-input" type="number" id="simp${uid}" min="0" max="99" step="1"
          value="${pre.pal ?? ''}" style="text-align:right"
          oninput="if(this.value.length>2)this.value=this.value.slice(0,2)"></div>
      <div><label class="form-label">Ημερομηνία</label>
        <input class="form-input" type="date" id="simd${uid}" value="${pre.date||''}"></div>
      <div><label class="form-label">Σημείωση</label>
        <input class="form-input" id="simn${uid}" value="${escapeHtml(pre.note||'')}" placeholder="π.χ. παράδοση πρωί"></div>
      <button type="button" title="Αφαίρεση" onclick="_simDelRow(${uid})"
        style="height:38px;border:1px solid var(--border-mid);background:var(--surface-card);border-radius:var(--radius);cursor:pointer;font-size:18px;color:var(--text-mid)">×</button>
    </div>
  </div>`;
}

// Προσθήκη με insertAdjacentHTML, ΟΧΙ ξαναζωγράφισμα όλων: το re-render θα
// έσβηνε ό,τι πληκτρολογείται στην αναζήτηση τοποθεσίας των άλλων καρτών.
function _simAddRow(pre) {
  if (_simRows.length >= 10) return;   // Α6: το schema έχει 10 θέσεις παράδοσης
  const uid = ++_simSeq; _simRows.push(uid);
  document.getElementById('sf_rows')?.insertAdjacentHTML('beforeend', _simRowHTML(uid, pre));
}

function _simDelRow(uid) {
  if (_simRows.length <= 1) return;    // πάντα μένει τουλάχιστον ένα σημείο
  _simRows = _simRows.filter(x => x !== uid);
  document.getElementById('simr_' + uid)?.remove();
}

// Διαβάζει τα σημεία με τη σειρά εμφάνισης· κάρτα χωρίς τοποθεσία αγνοείται.
function _simRead() {
  const g = id => document.getElementById(id)?.value || '';
  return _simRows.map(uid => ({
    locId: document.getElementById('lv_nsl' + uid)?.value || '',
    pal:   parseInt(g('simp' + uid), 10) || 0,
    // An empty box is «not given», not 0: the multi-stop edit guard reads this.
    palSet: g('simp' + uid).trim() !== '',
    date:  g('simd' + uid),
    note:  g('simn' + uid)
  })).filter(s => s.locId);
}

// Μία στάση μέσα σε μία κάρτα πελάτη.
function _grpDeliveryRowHTML(rowUid) {
  return `<div class="grp-row" id="grpr_${rowUid}" style="margin-bottom:8px">
    <div style="display:grid;grid-template-columns:minmax(360px,1.6fr) 80px 150px minmax(180px,1fr) 34px;gap:12px;align-items:end">
      <div><label class="form-label">Τοποθεσία παράδοσης *</label>${_locSelect('grpl'+rowUid, '')}</div>
      <div><label class="form-label">Παλέτες</label>
        <input class="form-input" type="number" id="grpp${rowUid}" min="0" max="99" step="1"
          style="text-align:right"
          oninput="if(this.value.length>2)this.value=this.value.slice(0,2);_grpPreview()"></div>
      <div><label class="form-label">Ημερομηνία</label>
        <input class="form-input" type="date" id="grpd${rowUid}"></div>
      <div><label class="form-label">Σημείωση</label>
        <input class="form-input" id="grpn${rowUid}" placeholder="π.χ. παράδοση πρωί"></div>
      <button type="button" title="Αφαίρεση σημείου" onclick="_grpDelRow(${rowUid})"
        style="height:38px;border:none;background:none;color:var(--text-mid);font-size:18px;cursor:pointer">×</button>
    </div>
  </div>`;
}

// Μία κάρτα ανά πελάτη: header (πελάτης + αξία + αφαίρεση πελάτη) και από
// κάτω τα σημεία παράδοσής του.
function _grpCardHTML(cardUid) {
  const rows = _grpCardRows[cardUid] || [];
  return `<div class="grp-card" id="grpcard_${cardUid}"
      style="border:1px solid var(--border-mid);border-radius:var(--radius);padding:12px;margin-bottom:12px;background:var(--surface-card)">
    <div style="display:grid;grid-template-columns:minmax(300px,2fr) 160px 34px;gap:12px;align-items:end;margin-bottom:8px">
      <div><label class="form-label">Πελάτης *</label>${_clientSelect('grpc'+cardUid, '', '')}</div>
      <div><label class="form-label">Αξία € <span style="color:var(--text-dim);font-weight:400">(ανά πελάτη)</span></label>
        <input class="form-input" type="number" id="grpv${cardUid}" oninput="_grpPreview()"></div>
      <button type="button" title="Αφαίρεση πελάτη" onclick="_grpDelCard(${cardUid})"
        style="height:38px;border:none;background:none;color:var(--text-mid);font-size:18px;cursor:pointer">×</button>
    </div>
    <div id="grpcard_rows_${cardUid}">${rows.map(_grpDeliveryRowHTML).join('')}</div>
    <button type="button" class="btn btn-ghost" style="font-size:12px;padding:4px 12px;margin-top:4px"
      onclick="_grpAddRow(${cardUid})">+ σημείο για αυτόν τον πελάτη</button>
  </div>`;
}

// Προσθήκη/αφαίρεση ΧΩΡΙΣ πλήρη επανασχεδίαση: ένα re-render θα έσβηνε ό,τι
// έχει ήδη πληκτρολογηθεί στα πεδία αναζήτησης των άλλων καρτών/σημείων.
function _grpAddCard() {
  const c = document.getElementById('gf_rows'); if (!c) return;
  const cardUid = ++_grpSeq, rowUid = ++_grpSeq;
  _grpCards.push(cardUid);
  _grpCardRows[cardUid] = [rowUid];
  c.insertAdjacentHTML('beforeend', _grpCardHTML(cardUid));
  _grpPreview();
}
function _grpDelCard(cardUid) {
  if (_grpCards.length <= 1) return;   // πάντα μένει τουλάχιστον ένας πελάτης
  const el = document.getElementById('grpcard_'+cardUid); if (el) el.remove();
  _grpCards = _grpCards.filter(x => x !== cardUid);
  delete _grpCardRows[cardUid];
  _grpPreview();
}
function _grpAddRow(cardUid) {
  const rows = _grpCardRows[cardUid]; if (!rows || rows.length >= 10) return;   // Α6: schema 10 θέσεων
  const container = document.getElementById('grpcard_rows_'+cardUid); if (!container) return;
  const rowUid = ++_grpSeq; rows.push(rowUid);
  container.insertAdjacentHTML('beforeend', _grpDeliveryRowHTML(rowUid));
  _grpPreview();
}
function _grpDelRow(rowUid) {
  const cardUid = Object.keys(_grpCardRows).find(k => _grpCardRows[k].includes(rowUid));
  if (cardUid == null) return;
  const rows = _grpCardRows[cardUid];
  if (rows.length <= 1) return;        // πάντα μένει τουλάχιστον ένα σημείο ανά πελάτη
  const el = document.getElementById('grpr_'+rowUid); if (el) el.remove();
  _grpCardRows[cardUid] = rows.filter(x => x !== rowUid);
  _grpPreview();
}
function _grpSet() { _grpPreview(); }   // συμβατότητα με παλιά onchange

function _grpRender() {
  const c = document.getElementById('gf_rows'); if (!c) return;
  if (!_grpCards.length) {
    const cardUid = ++_grpSeq, rowUid = ++_grpSeq;
    _grpCards = [cardUid]; _grpCardRows = { [cardUid]: [rowUid] };
  }
  c.innerHTML = _grpCards.map(_grpCardHTML).join('');
  _grpPreview();
}

// Διαβάζει ΑΠΟ ΤΟ DOM — τα αναζητήσιμα πεδία γράφουν στα κρυφά lv_<id>,
// όχι σε δικό μας μοντέλο. Μία κάρτα = μία εγγραφή του πίνακα που επιστρέφει
// (ίδιο σχήμα {clientId, clientLabel, price, stops} με πριν, ώστε το
// _natlWriteGroupageChain να μη χρειάζεται καμία αλλαγή — βλ. equality test).
function _grpGroups() {
  const clients = (getRefClients?.()||[]);
  const g = id => document.getElementById(id)?.value?.trim() || '';
  return _grpCards.map(cardUid => {
    const cid = g('lv_grpc'+cardUid);
    const rows = _grpCardRows[cardUid] || [];
    const stops = rows.map(rowUid => ({
      locId: g('lv_grpl'+rowUid), pallets: parseFloat(g('grpp'+rowUid))||0,
      date: g('grpd'+rowUid), note: g('grpn'+rowUid)
    })).filter(s => s.locId);
    return {
      clientId: cid,
      clientLabel: clients.find(c=>c.id===cid)?.fields?.['Company Name']
                || document.getElementById('ls_grpc'+cardUid)?.value || '',
      price: g('grpv'+cardUid), stops
    };
  }).filter(x => x.clientId && x.stops.length);
}

// Ενημερώνει ΜΟΝΟ την προεπισκόπηση — ποτέ τις κάρτες.
function _grpPreview() {
  const box = document.getElementById('gf_preview'); if (!box) return;
  const g = _grpGroups();
  const tot = g.reduce((s,x)=>s+x.stops.reduce((a,y)=>a+(y.pallets||0),0),0);
  const nStops = g.reduce((s,x)=>s+x.stops.length,0);
  const cls = tot>33 ? 'color:var(--danger)' : (tot>=30 ? 'color:var(--warn)' : 'color:var(--text-mid)');
  box.innerHTML = !g.length ? '' : `
    <div style="border:1px solid var(--border);background:var(--surface-sunken);border-radius:var(--radius);padding:12px">
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">
        ${g.length} ${g.length===1?'παραγγελία':'παραγγελίες'} θα δημιουργηθούν · 1 φορτίο · <span style="${cls}">${tot}/33 παλέτες</span></div>
      ${g.map(x=>`<div style="font-size:12px;color:var(--text-mid)"><b style="color:var(--text)">${escapeHtml(x.clientLabel)}</b> · ${x.stops.length} σημεία · ${x.stops.reduce((s,y)=>s+(y.pallets||0),0)}p${x.price?' · '+x.price+' €':''}</div>`).join('')}
      ${tot>33?'<div style="margin-top:8px;font-size:11px;color:var(--danger);font-weight:600">Ξεπερνά τις 33 παλέτες.</div>':''}
      <!-- Α1: ό,τι δεν γίνεται πρέπει να ακούγεται — και το αντίστροφο: ό,τι
           λέμε ότι θα γραφτεί πρέπει να είναι αυτό που _natlWriteGroupageChain
           ΟΝΤΩΣ δημιουργεί, όχι μια ευχή. -->
      <div style="margin-top:8px;font-size:11px;color:var(--text-dim)">Θα γραφτούν: ${g.length} NAT ORDERS → ${nStops} GROUPAGE LINES → 1 CONSOLIDATED LOAD → 1 NAT LOAD</div>
    </div>`;
  const btn = document.getElementById('natlBtnSubmit');
  if (btn && btn.getAttribute('onclick')==='_grpSubmit()')
    btn.textContent = g.length ? `Καταχώρηση ${g.length} ${g.length===1?'παραγγελίας':'παραγγελιών'}` : 'Καταχώρηση';
}

async function _grpSubmit() {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  const common = {
    direction: v('nf_Direction'), fromLocId: v('lv_npickup'),
    fromLabel: (getRefLocations()||[]).find(l => l.id === v('lv_npickup'))?.fields?.Name || '',
    loadDate: v('nf_LoadDate'), delDate: '',
    goods: v('nf_Goods'), temp: v('nf_Temp'),
  };
  const groups = _grpGroups();
  // Το πεδίο «Delivery Date» της κορυφής έφυγε μαζί με το «Pallets» (owner
  // 12/08): η ημερομηνία παράδοσης του φορτίου είναι η πρώτη δηλωμένη των
  // σημείων. Εφεδρεία η φόρτωση, ώστε CL/NL να μη μένουν χωρίς ημερομηνία.
  common.delDate = groups.flatMap(g => g.stops).map(s => s.date).find(Boolean) || common.loadDate;
  // P1-β (4/10): without a direction the truck was written but sat in no
  // column of the Weekly National (ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ only) — never planned, under
  // a green toast. Same rule as the simple form.
  if (common.direction !== 'North→South' && common.direction !== 'South→North') { toast('Η κατεύθυνση είναι υποχρεωτική','warn'); return; }
  // TEMPORARY guard (owner 5/10: «Να χτιστεί το εργαλείο ανόδου τώρα»): this
  // form only knows the ΚΑΘΟΔΟΣ shape — ONE pickup (lv_npickup) → N
  // deliveries (_natlWriteGroupageChain: one GL per delivery, CL Loading
  // Location 1 only, NL Pickup Location 1 only, 1 Loading + N Unloading stops).
  // A South→North entry was saved in that shape and labelled ΑΝΟΔΟΣ — many
  // suppliers → Βέροια stored as one pickup → many deliveries. Refused out
  // loud, nothing written, until the ΑΝΟΔΟΣ groupage tool lands; then this
  // guard goes.
  if (common.direction === 'South→North') {
    toast('Το groupage ανόδου (πολλοί προμηθευτές → Βέροια) χτίζεται τώρα. Μέχρι τότε φτιάξε χωριστές εθνικές με το ίδιο φορτηγό', 'error');
    return;
  }
  if (!common.fromLocId || !common.loadDate) { toast('Σημείο φόρτωσης και ημερομηνία φόρτωσης είναι υποχρεωτικά','warn'); return; }
  if (!groups.length) { toast('Χρειάζεται τουλάχιστον μία γραμμή με πελάτη και τοποθεσία','warn'); return; }
  const nStops = groups.reduce((s,g)=>s+g.stops.length,0);
  if (nStops > 10) { toast('Όριο 10 σημείων παράδοσης ανά φορτίο','warn'); return; }

  const btn = document.getElementById('natlBtnSubmit');
  if (btn) { btn.disabled = true; btn.textContent = 'Αποθήκευση…'; }
  try {
    const res = await _natlWriteGroupageChain(common, groups);
    [TABLES.NAT_ORDERS, TABLES.GL_LINES, TABLES.CONS_LOADS, TABLES.NAT_LOADS]
      .forEach(t => { try { invalidateCache(t); } catch(_){} });
    closeModal();
    toast(`${res.orders.length} παραγγελίες · ${res.gls.length} γραμμές · 1 φορτίο`, 'success');
    if (typeof renderOrdersNatl === 'function') renderOrdersNatl();
  } catch (e) {
    console.error('_grpSubmit:', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Καταχώρηση'; }
    // Δεν κρύβουμε το μισοτελειωμένο: ο owner πρέπει να ξέρει ότι μπορεί να
    // έμειναν εγγραφές πίσω, ώστε να τρέξει τον έλεγχο ορφανών.
    toast('Η καταχώρηση απέτυχε — έλεγξε για ημιτελές φορτίο στα CONSOLIDATED LOADS', 'error');
  }
}

// ─── Modal ──────────────────────────────────────
// Removes the .modal--wide class this form puts on #modal the moment the
// overlay closes — whichever way it closes (Άκυρο, ✕ in the header, overlay
// click). Without this the next modal of ANY module would open 1100px wide.
let _onModalObs = null;
function _onWatchModalClose() {
  if (_onModalObs) return;
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modal');
  if (!overlay || !modal) return;
  _onModalObs = new MutationObserver(() => {
    if (!overlay.classList.contains('open')) { modal.classList.remove('modal--wide'); }
  });
  _onModalObs.observe(overlay, { attributes: true, attributeFilter: ['class'] });
}
function openNatlCreate() { _openNatlModal(null, {}); }
async function openNatlEdit(recId) {
  let rec = NATL_ORDERS.data.find(r => r.id === recId);
  if (!rec) {
    // Opened from the Weekly: the orders list may never have loaded (Δ1 —
    // the click used to be a silent no-op). atGetOne already toasts + logs.
    try { rec = await atGetOne(TABLES.NAT_ORDERS, recId); } catch (e) { return; }
  }
  if (rec && rec.fields) _openNatlModal(recId, rec.fields);
}

async function _openNatlModal(recId, f) {
  // P1 4/10 (live, owner's Chrome): the location pickers (fhLocSelect/fhLocDrop)
  // search the shared _fhLocationsArr, which only fhLoadLocations() fills. The
  // Orders page fills it in the background since perf 29/9 and the Weekly
  // National never did, so a form opened straight from the board searched an
  // empty list: every letter typed looked like «no such location», and an
  // edit showed its stops blank next to a hidden id. Every national form —
  // create, create-with (Weekly «νέα άνοδος»), edit, both scans — passes
  // through here, so this is the one place that guarantees the list (the
  // international form got the same await on 11/8, orders_intl.js _openModal).
  // A failed or empty read does NOT open the form: an empty picker would be
  // indistinguishable from «no results». It is said, and logged.
  let locErr = null;
  try { await fhLoadLocations(); } catch (e) { locErr = e; }
  if (!_fhLocationsArr.length) {
    if (typeof logError === 'function') logError(locErr || new Error('locations read returned 0 records'), 'orders_natl: form locations');
    toast('Οι τοποθεσίες δεν φορτώθηκαν — η φόρμα δεν άνοιξε, γιατί η αναζήτηση σημείου θα έδειχνε κενό. Ξαναδοκίμασε σε λίγο.', 'danger');
    return false;   // the scan v2 caller must not leave its file pending for no form
  }
  const isEdit = !!recId;
  // P1-α (4/10, before the first dispatcher): an edit used to open every
  // delivery card with no pallets and no date (they live in ORDER_STOPS, never
  // read here), and the save wrote 0 pallets and the first card's date to
  // EVERY stop — order, Weekly load and pallet ledger, under a green toast.
  // The edit now reads the order's own stops and pre-fills each card with
  // ITS pallets/date/note. If that read fails, the cards stay empty and the
  // save refuses a multi-stop edit until each card is filled (never a guess).
  let _editStops = null;
  if (isEdit) {
    try {
      const st = await stopsLoad(recId, F.STOP_PARENT_NAT);
      _editStops = (st || []).filter(s => s.fields[F.STOP_TYPE] === 'Unloading');
    } catch (e) {
      _editStops = null;
      if (typeof logError === 'function') logError(e, 'orders_natl: edit form stops ' + recId);
    }
  }
  const clientId  = Array.isArray(f['Client'])           ? f['Client'][0]           : '';
  const pickupId  = (f['Pickup Location 1']||[])[0]||'';
  const delivId   = (f['Delivery Location 1']||f['Delivery Location']||[])[0]||'';
  // Resolve single client name for edit form (batch if not cached)
  if (clientId && !_fhClientsMap[clientId]) await _batchResolveClients([clientId]);
  const clientLabel = clientId ? (_fhClientsMap[clientId] || '') : '';
  // Value/label ΧΩΡΙΣΤΑ (παγίδα Φ1): το value είναι ΤΙΜΗ ΒΑΣΗΣ και δεν μεταφράζεται ποτέ.
  const opt = (arr, cur) => arr.map(o=>{const v=Array.isArray(o)?o[0]:o, l=Array.isArray(o)?o[1]:o; return `<option value="${v}" ${f[cur]===v?'selected':''}>${l}</option>`;}).join('');

  const body = `
    <div class="form-grid cols-3">
      <div class="form-field">
        <label class="form-label">Κατεύθυνση *</label>
        <select class="form-select" id="nf_Direction"><option value="">— Επιλογή —</option>
          ${opt([['North→South','ΚΑΘΟΔΟΣ (Βορράς→Νότος)'],['South→North','ΑΝΟΔΟΣ (Νότος→Βορράς)']],'Direction')}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Τύπος</label>
        <select class="form-select" id="nf_Type"><option value="">— Επιλογή —</option>
          ${opt([['Independent','Ανεξάρτητη']].concat(
            // Owner 27/9: Veroia Switch loads never become national ORDERS (the
            // international order writes the national load itself). The choice
            // is gone for new orders; an old record that already says VS keeps
            // it visible so an edit does not silently rewrite its Type.
            f['Type'] === 'Veroia Switch' ? [['Veroia Switch','Veroia Switch (παλιά εγγραφή)']] : []),'Type')}</select>
      </div>
      <!-- Δ16/audit w4: κρύβονται σε Groupage — εκεί ο πελάτης/η τιμή δηλώνονται
           ανά γραμμή παράδοσης (grpc/grpv) και _grpSubmit δεν τα διαβάζει ποτέ.
           Στοιχεία μένουν στο DOM (_natlMode τα κρύβει/δείχνει), όχι αφαιρούνται. -->
      <div class="form-field" id="nf_clientField">
        <label class="form-label">Πελάτης *</label>
        ${_clientSelect('nclient', clientId, clientLabel)}
      </div>
      <div class="form-field" id="nf_priceField">
        <label class="form-label">Τιμή (€)</label>
        <input class="form-input" type="number" id="nf_Price" value="${f['Price']||''}">
      </div>
      <div class="form-field">
        <label class="form-label">Εμπόρευμα</label>
        <input class="form-input" type="text" id="nf_Goods" value="${escapeHtml(f['Goods']||'')}" placeholder="π.χ. Φρέσκα λαχανικά">
      </div>
      <div class="form-field">
        <label class="form-label">Θερμοκρασία °C</label>
        <input class="form-input" type="number" id="nf_Temp" value="${f['Temperature °C']!=null?f['Temperature °C']:''}">
      </div>
      <!-- No pallet type on this form, so only the «no default» half of the
           27/9 PE rule applies here (core/form-helpers.js peChoiceHtml). -->
      ${peChoiceHtml('nf', f, isEdit)}
    </div>
    <input type="checkbox" id="nf_Groupage" ${f['National Groupage']?'checked':''} style="display:none">
    ${isEdit ? '' : `
    <div style="padding-top:16px;border-top:1px solid var(--border);margin-top:16px">
      <div class="detail-section-title">Τύπος καταχώρησης</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <label class="nf-mode on" id="nf_m0" onclick="_natlMode(0)">
          <input type="radio" name="nfmode" checked>
          <span><b>Κανονικό φορτίο</b><em>Ένας πελάτης — 1 παραγγελία</em></span></label>
        <label class="nf-mode" id="nf_m1" onclick="_natlMode(1)">
          <input type="radio" name="nfmode">
          <span><b>Groupage</b><em>Πολλοί πελάτες, ένα φορτηγό — 1 παραγγελία ανά πελάτη</em></span></label>
      </div>
    </div>`}

    <!-- Audit w4 (Figma 165:677): το σημείο/ημ. φόρτωσης ήταν μέσα στο #nf_simple,
         που το Groupage κρύβει — αλλά _grpSubmit τα απαιτεί (κοινά για όλο το
         φορτίο, ένα σημείο φόρτωσης για όλους τους πελάτες). Έμεναν αόρατα και
         υποχρεωτικά ταυτόχρονα. Μπαίνουν σε κοινό μπλοκ πριν τις κάρτες, ορατό
         και στους δύο τύπους καταχώρησης· ids/onchange αμετάβλητα. -->
    <div style="padding-top:16px;border-top:1px solid var(--border);margin-top:16px">
      <div class="detail-section-title" style="margin-bottom:12px">Φόρτωση</div>
      <div class="form-grid" style="grid-template-columns:2fr 1fr">
        <div class="form-field">
          <label class="form-label">Σημείο φόρτωσης * <span id="nf_pickupHint" style="color:var(--text-dim);font-weight:400;display:none">(κοινό για το φορτίο)</span></label>
          ${_locSelect('npickup', pickupId)}
        </div>
        <div class="form-field">
          <label class="form-label">Ημ. φόρτωσης *</label>
          <input class="form-input" type="date" id="nf_LoadDate"
            value="${f['Loading DateTime']?toLocalDate(f['Loading DateTime']):''}">
        </div>
      </div>
    </div>

    <div id="nf_grp" style="display:none;padding-top:16px;border-top:1px solid var(--border);margin-top:16px">
      <div class="detail-section-title">Παραδόσεις — μία κάρτα ανά πελάτη</div>
      <div id="gf_rows"></div>
      <button type="button" class="btn btn-ghost" style="font-size:12px;padding:4px 12px;margin-top:8px"
        onclick="_grpAddCard()">+ Προσθήκη πελάτη</button>
      <div id="gf_preview" style="margin-top:16px"></div>
    </div>
    <div id="nf_simple" style="padding-top:16px;border-top:1px solid var(--border)">
      <div class="detail-section-title" style="margin-bottom:12px">Παραδόσεις — μία κάρτα ανά σημείο</div>
      <div id="sf_rows"></div>
      <button type="button" class="btn btn-ghost" style="font-size:12px;padding:4px 12px;margin-top:8px"
        onclick="_simAddRow()">+ Προσθήκη σημείου</button>
    </div>

    <div style="margin-top:16px">
      <label class="form-label">Σημειώσεις</label>
      <textarea class="form-textarea" id="nf_Notes" rows="2">${escapeHtml(f['Notes']||'')}</textarea>
    </div>`;

  const footer = `
    <button class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>
    <button class="btn btn-success" id="natlBtnSubmit" onclick="submitNatlOrder('${recId||''}')">
      ${isEdit?'Αποθήκευση':'Καταχώρηση'}
    </button>`;

  const modalEl = document.getElementById('modal');
  modalEl.classList.add('modal--wide');
  _onWatchModalClose();
  openModal(isEdit ? 'Επεξεργασία εθνικής παραγγελίας' : 'Νέα εθνική παραγγελία', body, footer);
  if (!isEdit) { _grpCards = []; _grpCardRows = {}; _natlMode(0); }

  // Προσυμπλήρωση των σημείων παράδοσης από τις 10 θέσεις του schema.
  _simRows = []; _simSeq = 0;
  const _pre = [];
  for (let i = 1; i <= 10; i++) {
    const lid = (f[`Delivery Location ${i}`] || [])[0];
    if (lid) _pre.push({ loc: lid });
  }
  if (!_pre.length && delivId) _pre.push({ loc: delivId });   // παλιό μονό πεδίο
  if (_pre.length) {
    _pre[0].date = f['Delivery DateTime'] ? toLocalDate(f['Delivery DateTime']) : '';
    // Με ΕΝΑ σημείο το σύνολο ΕΙΝΑΙ η στάση, οπότε προσυμπληρώνεται με ασφάλεια.
    if (_pre.length === 1 && f['Pallets']) _pre[0].pal = f['Pallets'];
    // Each card from its OWN stop: Unloading #i ↔ Delivery Location i (the save
    // numbers them that way). Only when the stop's location is the card's — a
    // mismatch (edited elsewhere) leaves that card empty rather than guess.
    if (_editStops) _pre.forEach((p, i) => {
      const s = _editStops.find(x => Number(x.fields[F.STOP_NUMBER]) === i + 1);
      if (!s || getLinkedId(s.fields[F.STOP_LOCATION]) !== p.loc) return;
      const sf = s.fields;
      if (sf[F.STOP_PALLETS] != null && sf[F.STOP_PALLETS] !== '') p.pal = sf[F.STOP_PALLETS];
      if (sf[F.STOP_DATETIME]) p.date = toLocalDate(sf[F.STOP_DATETIME]);
      if (sf[F.STOP_NOTES]) p.note = sf[F.STOP_NOTES];
    });
  }
  (_pre.length ? _pre : [{}]).forEach(p => _simAddRow(p));
}

// ─── Submit ─────────────────────────────────────
// «Στείλε στο Weekly» (13/9): create the missing NATIONAL LOAD for an order
// saved while the create failed. Same function the form calls on save.
async function _natlSendToWeekly(recId) {
  try {
    const rec = await atGetOne(TABLES.NAT_ORDERS, recId);
    if (!rec || !rec.fields) throw new Error('order not found');
    const nlId = await _syncNationalLoad(recId, rec.fields, false);
    if (!nlId) throw new Error('no load id returned');
    NATL_ORDERS.noLoad && NATL_ORDERS.noLoad.delete(recId);
    invalidateCache(TABLES.NAT_LOADS);
    toast('Το φορτίο δημιουργήθηκε — είναι πλέον στο Εβδομαδιαίο Εθνικών ✓');
    // Only the row changes («εκτός» → «στο Εβδομαδιαίο»); the old list
    // container is gone since 28/9 — repainting it threw AFTER the load was
    // created and the catch below then reported a failure that did not happen.
    const inList = NATL_ORDERS.data.find(r => r.id === recId);
    if (inList && typeof OrdersCatalog !== 'undefined') OrdersCatalog.updateRecord('natl', inList);
  } catch(e) {
    if (typeof reportError === 'function') reportError('Το φορτίο ΔΕΝ δημιουργήθηκε', e); else toast('Το φορτίο ΔΕΝ δημιουργήθηκε: ' + (e && e.message), 'danger');
  }
}
window._natlSendToWeekly = _natlSendToWeekly;
async function submitNatlOrder(recId) {
  const btn = document.getElementById('natlBtnSubmit');
  if(btn) { btn.textContent='Αποθήκευση…'; btn.disabled=true; }

  try {
    const fields = {};
    const sv = id => document.getElementById(id)?.value?.trim()||'';
    const nv = id => { const v=document.getElementById(id)?.value; return v!==''&&v!=null?parseFloat(v):null; };
    const ck = id => !!document.getElementById(id)?.checked;

    if(sv('nf_Direction')) fields['Direction']       = sv('nf_Direction');
    if(sv('nf_Type'))      fields['Type']            = sv('nf_Type');
    if(sv('nf_Goods'))     fields['Goods']           = sv('nf_Goods');
    if(sv('nf_Notes'))     fields['Notes']           = sv('nf_Notes');
    if(sv('nf_LoadDate'))  fields['Loading DateTime']  = sv('nf_LoadDate');

    // Τα σημεία παράδοσης είναι πλέον κάρτες: η ημερομηνία και το σύνολο
    // παλετών της παραγγελίας προκύπτουν ΑΠΟ αυτά, δεν δηλώνονται χωριστά.
    const _stops = _simRead();
    const _delDate = (_stops.find(s => s.date) || {}).date || '';
    if (_delDate) fields['Delivery DateTime'] = _delDate;

    const price  = nv('nf_Price');   if(price!=null)  fields['Price']          = price;
    const temp   = nv('nf_Temp');    if(temp!=null)    fields['Temperature °C'] = temp;

    // Γράφεται μόνο αν όντως δηλώθηκαν παλέτες. Σε επεξεργασία παραγγελίας με
    // πολλά σημεία οι κάρτες ανοίγουν κενές (τα ανά-στάση νούμερα ζουν στα
    // ORDER_STOPS), οπότε ένα άθροισμα 0 θα έσβηνε το υπάρχον σύνολο.
    const pallets = _stops.reduce((a, s) => a + s.pal, 0);
    if (pallets > 0) fields['Pallets'] = pallets;

    // ΝΑΙ/ΟΧΙ, not a checkbox (owner 27/9): unanswered blocks a new order
    // below; on an edit it is left out so a legacy NULL is not written as «No».
    const _pe = peRead('nf');
    if (_pe !== null) fields['Pallet Exchange'] = _pe;
    fields['National Groupage']= ck('nf_Groupage');

    const clientId  = document.getElementById('lv_nclient')?.value;
    const pickupId  = document.getElementById('lv_npickup')?.value;
    const delivId   = _stops.length ? _stops[0].locId : '';

    if(clientId)  fields['Client']              = [clientId];
    if(pickupId)  fields['Pickup Location 1']  = [pickupId];
    // Οι θέσεις που περίσσεψαν καθαρίζονται ρητά με κενό πίνακα — ο Worker το
    // μεταφράζει σε NULL (index.js:1845). Χωρίς αυτό, αφαίρεση σημείου σε
    // επεξεργασία θα άφηνε το παλιό σημείο να ζει στη βάση.
    for (let i = 1; i <= 10; i++) {
      fields[`Delivery Location ${i}`] = _stops[i-1] ? [_stops[i-1].locId] : [];
    }

    // Validation
    const _vErrors = [];
    if(!fields['Direction'])          _vErrors.push('Η κατεύθυνση είναι υποχρεωτική');
    if(!clientId)                     _vErrors.push('Ο πελάτης είναι υποχρεωτικός');
    if(!pickupId)                     _vErrors.push('Το σημείο φόρτωσης είναι υποχρεωτικό');
    if(!delivId)                      _vErrors.push('Χρειάζεται τουλάχιστον ένα σημείο παράδοσης');
    if(!fields['Loading DateTime'])   _vErrors.push('Η ημερομηνία φόρτωσης είναι υποχρεωτική');
    if(!fields['Delivery DateTime'])  _vErrors.push('Χρειάζεται ημερομηνία σε ένα τουλάχιστον σημείο');
    if(_pe === null && !recId)        _vErrors.push(peMarkMissing('nf'));
    // P1-α: an edit with 2+ delivery points writes each card's pallets and date
    // to ITS stop. A card left empty would be written as 0 pallets / another
    // card's date — so it is refused, never guessed (the form pre-fills them
    // from the stops; empty means that read failed or the card is new).
    if (recId && _stops.length > 1) {
      const _miss = _stops.map((s, i) => (!s.palSet || !s.date) ? i + 1 : 0).filter(Boolean);
      if (_miss.length) _vErrors.push(`Συμπλήρωσε παλέτες και ημερομηνία σε κάθε σημείο παράδοσης (σημείο ${_miss.join(', ')})`);
    }

    // Date cross-validation
    if (fields['Loading DateTime'] && fields['Delivery DateTime']) {
      if (new Date(fields['Delivery DateTime']) < new Date(fields['Loading DateTime'])) {
        _vErrors.push('Η ημερομηνία παράδοσης δεν μπορεί να προηγείται της φόρτωσης');
      }
    }
    // Crash-test fix: reject negative pallet counts (previously silently saved)
    if (fields['Total Pallets'] != null && fields['Total Pallets'] < 0) {
      _vErrors.push('Οι παλέτες δεν μπορεί να είναι αρνητικός αριθμός');
    }
    if (fields['Pallets'] != null && fields['Pallets'] < 0) {
      _vErrors.push('Οι παλέτες δεν μπορεί να είναι αρνητικός αριθμός');
    }

    if (_vErrors.length) {
      showErrorToast(_vErrors.join(' | '), 'warn', 8000);
      throw new Error('v');
    }

    let savedNatlId = recId;
    if(recId) {
      const patchRes = await atSafePatch(TABLES.NAT_ORDERS, recId, fields);
      if (patchRes?.conflict) { toast('Η εγγραφή άλλαξε από άλλον χρήστη — δεν αποθηκεύτηκε. Ανανέωσε και ξαναδοκίμασε.','warn'); return; }
    } else {
      // ── Duplicate check by Reference (strong signal — same transport doc) ──
      if (fields['Reference'] && typeof findDuplicateOrders === 'function') {
        const refDupes = await findDuplicateOrders(fields['Reference'], TABLES.NAT_ORDERS);
        if (refDupes.length) {
          const list = refDupes.map(d => {
            const f = d.fields;
            return `• ${f['Reference'] || 'χωρίς αναφορά'} — ${(f['Loading DateTime']||'').substring(0,10) || 'χωρίς ημερομηνία'}`;
          }).join('\n');
          const ok = await confirmAction(
            `Πιθανό duplicate\n\n` +
            `Υπάρχουν ${refDupes.length} National Orders με Reference "${fields['Reference']}":\n\n` +
            `${list}\n\n` +
            `Συνέχεια αποθήκευσης ως νέα παραγγελία;`,
            { title: 'Πιθανό duplicate', confirmLabel: 'Αποθήκευση ως νέα' }
          );
          if (!ok) {
            if (btn) { btn.textContent = 'Καταχώρηση'; btn.disabled = false; }
            throw new Error('v');
          }
        }
      }

      // ── Soft duplicate check: same client + same loading date ──
      // safeFetch, not `.catch(() => [])`: this is a DUPLICATE GUARD, so a
      // swallowed error makes it answer "no duplicates" to every check while
      // looking like it ran. That is exactly the defect fixed in PR #28 for the
      // international guard (`findDuplicateOrders`), which sat silently disabled
      // from the C2 cutover until 2026-07-29. Same shape, different module.
      //
      // Verified live 2026-08-02: this filter returns HTTP 200 against the
      // facade and FIND+ARRAYJOIN matches linked record ids correctly on the
      // new backend. (Learning #7's "FIND+ARRAYJOIN does not work" described
      // AIRTABLE, which the facade replaced; it does not apply post-cutover.)
      // So the guard works today, and the fail-open is latent risk, not a live
      // defect. NAT_ORDERS holds 0 records, so it has never been exercised.
      if (clientId && fields['Loading DateTime']) {
        const dupFilter = `AND(FIND("${clientId}",ARRAYJOIN({Client},","))>0,IS_SAME({Loading DateTime},'${fields['Loading DateTime']}','day'))`;
        const dups = await safeFetch(
          () => atGetAll(TABLES.NAT_ORDERS, { filterByFormula: dupFilter, fields:['Name'], maxRecords:1 }, false),
          'national order: duplicate guard'
        );
        // A guard that could not run must not silently pass. Tell the user the
        // check did not happen and let them decide, rather than implying a
        // clean result. Deliberately does NOT block the save: this guard is
        // "soft" by design (it only warns on a real hit), and hard-failing a
        // save because a check errored would be a worse trade for a dispatcher
        // mid-entry.
        if (didFail(dups)) {
          if (!(await confirmAction('Ο έλεγχος για διπλότυπα δεν μπόρεσε να εκτελεστεί. Συνέχεια χωρίς έλεγχο;', { confirmLabel: 'Συνέχεια' }))) {
            if (btn) { btn.textContent = 'Καταχώρηση'; btn.disabled = false; }
            throw new Error('v');
          }
        } else if (dups.length) {
          if (!(await confirmAction('Υπάρχει ήδη order με ίδιο client + ημερομηνία. Δημιουργία duplicate;', { confirmLabel: 'Δημιουργία' }))) {
            throw new Error('v');
          }
        }
      }
      const created = await atCreate(TABLES.NAT_ORDERS, fields);
      savedNatlId = created.id;
      // Scan round 3 GAP: order_documents.order_id is an FK to `orders` (the
      // international table) — national writes here to `national_orders`, a
      // different id-space, so a scanned document can never attach through this
      // path. Say so instead of silently dropping the file the user just picked.
      if (typeof OrderDocs !== 'undefined') OrderDocs.handleNatlOrderSaved();
    }

    // ── Active learning: persist scan correction (Phase 3) ──
    try {
      if (window._natlScanResult && typeof scanSaveCorrection === 'function') {
        const r = window._natlScanResult;
        const corrected = {
          name: fields['Name'] || '',
          client_id: (fields['Client']||[])[0] || null,
          direction: fields['Direction'] || '',
          type: fields['Type'] || '',
          pallets: fields['Pallets'] ?? null,
          loading_date:  fields['Loading DateTime']  || '',
          delivery_date: fields['Delivery DateTime'] || '',
          pickup_locations:   (r.matched?.pickups || []).map(s => ({ location_name: s._locLabel || s.location_name, location_id: s._locId || null, city: s.city, pallets: s.pallets })),
          delivery_locations: (r.matched?.deliveries || []).map(s => ({ location_name: s._locLabel || s.location_name, location_id: s._locId || null, city: s.city })),
        };
        scanSaveCorrection(
          'DELIVERY_NOTE',
          window._natlScanFile?.name || '',
          r.data,
          corrected,
          (fields['Client']||[])[0] || null
        );
        delete window._natlScanResult;
      }
    } catch (e) { console.warn('[natl_scan] save correction skipped:', e.message); }

    // ── Save ORDER_STOPS for national order ──
    // Wave-0 reviewer (4/10/2026): a failed stops write was a console.warn
    // under a green «saved», and _syncNationalLoad then rebuilt the load from
    // the OLD stops (its pallets/dates per point). Now it is heard, and the
    // load is left as it is rather than synced from stale stops.
    let _stopsFailed = false;
    try {
      const _natStops = [];
      const _sRef = fields['Reference'] || null, _sGoods = fields['Goods'] || null, _sTemp = fields['Temperature °C'] ?? null;
      // On an edit, «no pallets given» leaves the stop's pallets as they are
      // (null = not written by stopsSave's PATCH) instead of writing 0 (P1-α).
      if (pickupId) _natStops.push({ stopNumber: 1, stopType: 'Loading', locationId: pickupId, pallets: pallets || (recId ? null : 0), dateTime: fields['Loading DateTime'] || null, clientId: clientId || null, ref: _sRef, goods: _sGoods, temp: _sTemp });
      // Α1: κάθε στάση παίρνει ΤΙΣ ΔΙΚΕΣ ΤΗΣ παλέτες. Πριν γραφόταν το σύνολο
      // αυτούσιο σε κάθε στάση, που έδειχνε π.χ. 20/20/20 αντί για 8/6/6.
      _stops.forEach((s, i) => _natStops.push({ stopNumber: i + 1, stopType: 'Unloading',
        locationId: s.locId, pallets: s.palSet ? s.pal : (recId ? null : 0),
        dateTime: s.date || fields['Delivery DateTime'] || null,
        clientId: clientId || null, ref: _sRef, goods: _sGoods, temp: _sTemp,
        notes: s.note || null }));
      if (_natStops.length) {
        try { await stopsSave(savedNatlId, _natStops, F.STOP_PARENT_NAT); }
        catch (e) {
          _stopsFailed = true;
          if (typeof logError === 'function') logError(e, 'natl ORDER_STOPS save ' + savedNatlId);
          showErrorToast('Η παραγγελία αποθηκεύτηκε, αλλά τα σημεία παράδοσης ΔΕΝ αποθηκεύτηκαν'
            + (fields['National Groupage'] ? '' : recId ? ' — γι\' αυτό το φορτίο στο Εβδομαδιαίο ΔΕΝ ενημερώθηκε' : ' — γι\' αυτό η παραγγελία ΔΕΝ μπήκε στο Εβδομαδιαίο')
            // plOnOrderSaved is skipped below on this failure — say it too.
            + '. Παλέτες δεν καταγράφηκαν. Άνοιξέ την με «Επεξεργασία» και αποθήκευσε ξανά.', 'warn', 15000);
        }
      }
      if (!_stopsFailed && typeof plOnOrderSaved === 'function') await plOnOrderSaved(savedNatlId, 'natl');
    } catch(e) { console.warn('NAT ORDER_STOPS save:', e); }

    // ── Sync GROUPAGE LINES ──────────────────────────────────
    // Sync GL: create/update if Groupage ON, delete unassigned if OFF
  if (savedNatlId && fields['National Groupage']) {
      try {
        await _syncGroupageLinesFromNO(savedNatlId, fields);
      } catch(e) { console.warn('GL sync error:', e); }
    } else if (savedNatlId && !fields['National Groupage']) {
      // National Groupage turned OFF → release this order's GL lines; a truck
      // (CL + its NL) goes only if no OTHER order is left on it (audit A4, 3/10:
      // this path used to delete the truck shared by every customer).
      try {
        const staleGL = await atGetAll(TABLES.GL_LINES, {
          filterByFormula: `FIND("${savedNatlId}",ARRAYJOIN({Linked National Order},","))>0`,
          fields: ['Status','Linked Consolidated Load']
        }, false);
        // ReferenceError if core/order-sync.js is missing → caught below, nothing deleted.
        await releaseGroupageTrucks(staleGL, 'natl GRP OFF ' + savedNatlId);
        // FIXME(audit): GL_LINES must never be hard-deleted — only set Status='Unassigned'.
        // Hard-delete breaks the ORDERS→GL_LINES→CONS_LOADS history chain permanently.
        // See .reference/ANALYSIS_WEAK_SPOTS_OPPORTUNITIES.md and orders_natl.js findings.
        for (const r of staleGL) {
          try { await atSafePatch(TABLES.GL_LINES, r.id, { Status: 'Unassigned' }); }
          catch(e) { console.warn('GL unassign:', e); }
        }
        if (staleGL.length) _tmsLog(`Unassigned ${staleGL.length} stale GL lines`);
        invalidateCache(TABLES.GL_LINES);
        invalidateCache(TABLES.CONS_LOADS);
        invalidateCache(TABLES.NAT_LOADS);
      } catch(e) {
        // Was console-only: a failed read here left the groupage state unknown
        // with a green «saved». Nothing was deleted — say so.
        console.warn('GL cleanup error:', e);
        if (typeof logError === 'function') logError(e, 'natl GRP OFF cleanup ' + savedNatlId);
        showErrorToast('Η «Εθνική Ομαδοποίηση» βγήκε, αλλά οι γραμμές groupage δεν ελευθερώθηκαν — δεν σβήστηκε τίποτα. Έλεγξε το Weekly National.', 'warn', 9000);
      }
    }
    // ─────────────────────────────────────────────────────────

    // ── Sync NATIONAL LOADS ─────────────────────────────────
    try {
      if (!fields['National Groupage'] && _stopsFailed) {
        // The load copies its per-point pallets/dates from the order's stops:
        // with the stops write failed it would copy the OLD ones. Left as is —
        // the warning above says so; a re-save from the form syncs both.
        _tmsLog(`_syncNationalLoad skipped for NO ${savedNatlId}: ORDER_STOPS save failed`);
      } else if (!fields['National Groupage']) {
        // Non-groupage → create/update NL record
        const fullRec = await atGetOne(TABLES.NAT_ORDERS, savedNatlId);
        if (fullRec.fields) {
          const nlId = await _syncNationalLoad(savedNatlId, fullRec.fields, false);
          // 9/9 (owner): a load created from an empty ΑΝΟΔΟΣ cell on Weekly
          // National is bound to that ΚΑΘΟΔΟΣ row — same handshake as
          // weekly_intl's _wiConsumePendingMatch, and only on CREATE.
          if (!recId && nlId && typeof window._wnConsumePendingMatch === 'function') {
            try { await window._wnConsumePendingMatch(nlId, fullRec.fields); }
            catch(e) { if (typeof logError === 'function') logError(e, '_wnConsumePendingMatch'); }
          }
        }
      } else {
        // Groupage ON → remove NL (CL save will create its own NL)
        await _syncNationalLoad(savedNatlId, {}, true);
      }
    } catch(e) {
      // Silent console.warn hid this for months: the order saved fine but never
      // reached the Weekly board, invisible until an audit found the 400 in
      // app_errors (Ε1). Every failure is heard now (spec national-load-source,
      // global constraint).
      toast('Η παραγγελία αποθηκεύτηκε αλλά ΔΕΝ μπήκε στο Weekly — δοκίμασε ξανά ή ενημέρωσε', 'danger');
      if (typeof logError === 'function') logError(e, '_syncNationalLoad ' + savedNatlId);
    }
    // ─────────────────────────────────────────────────────────

    // §4 #9 (N-11, 4/10/2026): every atCreate re-arms the toolbar Undo, so
    // after a new national order it pointed at the LAST write of the chain —
    // the load (or a stop) — and Undo deleted the load, leaving the order
    // «εκτός Εβδομαδιαίου». Undo of a new national order is the order's own
    // delete (deleteNatlOrder: the same path as «Διαγραφή»; the base cascades
    // its load and stops — trg_national_orders_soft_delete_cascade).
    // A role that cannot delete national orders gets no Undo at all (cleared,
    // so the button does not offer the load/stop the chain wrote last).
    if (!recId && savedNatlId && typeof _undoSet === 'function') {
      if (_NATL_DELETE_ROLES.includes(typeof ROLE !== 'undefined' ? ROLE : '')) {
        const _undoId = savedNatlId;
        _undoSet({ type: 'create', tableId: TABLES.NAT_ORDERS, recId: _undoId, label: fields['Reference'] || 'εθνική παραγγελία',
          undo: () => deleteNatlOrder(_undoId) });
      } else if (typeof clearUndo === 'function') clearUndo();
    }

    // Central sync — RAMP trigger + PL orphan cleanup + PA sync + cache invalidation
    if (savedNatlId && typeof syncOrderDownstream === 'function') {
      syncOrderDownstream(savedNatlId, { source: 'natl', skipVS: true, skipGRP: true })
        .catch(e => console.warn('[natl save sync]', e));
    }

    invalidateCache(TABLES.NAT_ORDERS);
    document.getElementById('modal').style.maxWidth = '';
    closeModal();
    // No green «saved» over the stops warning — it would read as «all done».
    if (!_stopsFailed) toast(recId ? 'Η παραγγελία ενημερώθηκε' : 'Η παραγγελία καταχωρήθηκε');
    // B2: the modal now also opens from Weekly National (openNatlEdit, Δ1) —
    // repaint respects whichever page is open, same pattern as orders_intl.js
    // submitIntlOrder, instead of always hijacking the screen back to the list.
    if (typeof currentPage!=='undefined' && currentPage==='weekly_natl' && typeof renderWeeklyNatl==='function') { renderWeeklyNatl(); }
    else await renderOrdersNatl();

  } catch(e) {
    // 'v' is the validation sentinel thrown after a blocking validation message;
    // that path already told the user, so skip to avoid double-reporting.
    if(e.message!=='v') reportError('Σφάλμα αποθήκευσης παραγγελίας', e);
    if(btn) { btn.textContent=recId?'Αποθήκευση':'Καταχώρηση'; btn.disabled=false; }
  } finally {
    // Weekly National «νέα άνοδος» pending match (review 4/10, LOW a): a create
    // that ends WITHOUT consuming it — the save failed after a duplicate dialog
    // had replaced the form, or Groupage ON / stops failed so no load was made —
    // left it alive for 30' to bind the NEXT ΑΝΟΔΟΣ silently (principle 1).
    // Kept only while this form is still open for a retry; the board's own
    // observer drops it if that retry is then cancelled.
    const _ov = document.getElementById('modalOverlay');
    if (!recId && window._wnPendingMatch
        && !(_ov && _ov.classList.contains('open') && document.getElementById('nf_Direction')))
      window._wnPendingMatch = null;
  }
}

// ─── Inline toggle ───────────────────────────────

// ═══════════════════════════════════════════════
// _syncGroupageLinesFromNO
// For INDEPENDENT National Orders (no parent ORDERS)
// Creates/updates GL lines from NO Pickup Locations
// ═══════════════════════════════════════════════
const _syncingNOs = new Set();
async function _syncGroupageLinesFromNO(noId, noFields) {
  if (_syncingNOs.has(noId)) return;
  _syncingNOs.add(noId);
  try {
  const _lid = v => (v&&typeof v==='object'&&v.id)?v.id:(typeof v==='string'?v:null);
  const dir  = noFields['Direction']||'';
  const ref  = noFields['Reference']||'';
  const goods= noFields['Goods']||'';
  const temp = noFields['Temperature °C']??null;
  const loadDt = (noFields['Loading DateTime']||'').slice(0,10)||null;
  const delDt  = (noFields['Delivery DateTime']||'').slice(0,10)||null;
  const noDir = dir === 'South→North' ? 'South→North' : 'North→South';

  // Get all pickup locations from Pickup Location 1-10
  const pickupLocs = [];
  for (let i=1; i<=10; i++) {
    const arr = noFields[`Pickup Location ${i}`];
    if (!arr?.length) { if(i>1) break; continue; }
    pickupLocs.push(_lid(arr[0]));
  }

  if (!pickupLocs.length) return;

  // Per-stop pallets from Loading Pallets 1-10 fields, fallback to total/count.
  // Bugfix: Math.floor(totalPal / locs.length) dropped the remainder (e.g. 100÷3 = 33+33+33 = 99).
  // We now distribute the remainder to the first N stops so the sum always equals totalPal.
  const totalPal = noFields['Pallets'] || 0;
  const palPerLoc = {};

  // ── Φ3α (SPEC ανοιχτό #3): οι ΚΑΤΑΓΕΓΡΑΜΜΕΝΕΣ παλέτες προηγούνται ──────
  //
  // Ο μερισμός από κάτω μοιράζει το σύνολο ισόποσα στα σημεία. Είναι εικασία:
  // «31 παλέτες σε 3 σημεία» γίνεται 11+10+10 ακόμη κι όταν η αλήθεια είναι
  // 20+8+3. Το αποτέλεσμα φεύγει στα GROUPAGE LINES, από εκεί στο Pick Ups,
  // και ο άνθρωπος που φορτώνει βλέπει λάθος νούμερα.
  //
  // Η φόρμα γράφει ήδη τις πραγματικές παλέτες κάθε στάσης στα ORDER_STOPS.
  // Αυτές είναι η αλήθεια — τις διαβάζουμε πρώτα.
  const _stopPal = {};
  try {
    const _noStops = await stopsLoad(noId, F.STOP_PARENT_NAT);
    (_noStops || []).forEach(s => {
      if (s.fields?.[F.STOP_TYPE] !== 'Loading') return;
      const lid = _lid((s.fields?.[F.STOP_LOCATION]||[])[0]) || _lid(s.fields?.[F.STOP_LOCATION]);
      const p = s.fields?.[F.STOP_PALLETS];
      if (lid && p != null) _stopPal[lid] = p;
    });
  } catch(e) { console.warn('GL: ανάγνωση ORDER_STOPS απέτυχε, πέφτω σε μερισμό', e); }

  // Ο μερισμός μένει ΜΟΝΟ ως έσχατο δίχτυ, για παραγγελίες που γράφτηκαν
  // πριν καταγράφονται παλέτες ανά στάση. Δεν τον αφαιρώ: το GL.Pallets
  // τροφοδοτεί τον σχεδιαστή του Pick Ups, και ένα κενό εκεί θα του έσπαγε
  // τη λογική — σε αντίθεση με τα ORDER_STOPS, όπου το κενό είναι ορατό.
  const base = pickupLocs.length > 0 ? Math.floor(totalPal / pickupLocs.length) : totalPal;
  const remainder = pickupLocs.length > 0 ? (totalPal - base * pickupLocs.length) : 0;
  pickupLocs.forEach((locId, i) => {
    if (_stopPal[locId] != null) { palPerLoc[locId] = _stopPal[locId]; return; }
    const explicit = noFields[`Loading Pallets ${i+1}`] || noFields['Loading Pallets'] || 0;
    palPerLoc[locId] = explicit || (base + (i < remainder ? 1 : 0));
  });

  const delivArr = noFields['Delivery Location 1'] || noFields['Delivery Location'] || [];
  const delivId  = delivArr.length ? _lid(delivArr[0]) : null;

  // Get existing GL for this NO
  const existing = await atGetAll(TABLES.GL_LINES, {
    filterByFormula: `FIND("${noId}",ARRAYJOIN({Linked National Order},","))>0`,
    fields: ['Loading Location','Status','Pallets']
  }, false);

  const existMap = {};
  existing.forEach(r => {
    const loc = (r.fields['Loading Location']||[])[0];
    if (loc) existMap[loc] = r;
  });

  const toCreate = [];
  const toUpdate = [];

  pickupLocs.forEach((locId, i) => {
    if (!locId) return;
    const pal = palPerLoc[locId] || totalPal;
    const fields = {
      'Reference':             ref,
      'Pallets':               pal,
      'Direction':             noDir,
      'Status':                'Unassigned',
      'Goods':                 goods,
      'Loading Location':      [locId],
      'Linked National Order': [noId],
    };
    if (loadDt) fields['Loading Date']  = loadDt;
    if (delDt)  fields['Delivery Date'] = delDt;
    if (temp !== null) fields['Temperature C'] = temp;
    if (delivId) fields['Delivery Location'] = [delivId];

    if (existMap[locId]) {
      if (existMap[locId].fields.Status !== 'Assigned') {
        toUpdate.push({ id: existMap[locId].id, fields });
      }
      delete existMap[locId];
    } else {
      toCreate.push(fields);
    }
  });

  // FIXME(audit): GL_LINES must never be hard-deleted — only set Status='Unassigned'.
  // See .reference/ANALYSIS_WEAK_SPOTS_OPPORTUNITIES.md and orders_natl.js findings.
  for (const [locId, rec] of Object.entries(existMap)) {
    if (rec.fields.Status !== 'Assigned') {
      try { await atSafePatch(TABLES.GL_LINES, rec.id, { Status: 'Unassigned' }); }
      catch(e) { console.warn('GL stale unassign:', e); }
    }
  }

  // Batch create
  if (toCreate.length) {
    await atCreateBatch(TABLES.GL_LINES, toCreate.map(f => ({ fields: f })));
  }

  // Batch update
  if (toUpdate.length) {
    await atPatchBatch(TABLES.GL_LINES, toUpdate);
  }

  _tmsLog(`_syncGroupageLinesFromNO: ${toCreate.length} created, ${toUpdate.length} updated for NO ${noId}`);
  } finally {
    _syncingNOs.delete(noId);
  }
}

// ═══════════════════════════════════════════════
// _syncNationalLoad — Sync non-groupage NO → NATIONAL LOADS
// Creates/updates a unified record for Weekly National consumption
// ═══════════════════════════════════════════════
const _syncingNLs = new Set();
async function _syncNationalLoad(noId, noFields, isDelete) {
  if (!TABLES.NAT_LOADS) return;
  if (_syncingNLs.has(noId)) return;
  _syncingNLs.add(noId);
  try {

  // Find existing NL record for this NO. 'Source Record' was a write-only
  // alias resolved for VS (orders_intl); it never matched a real column here,
  // so this lookup 400'd on every save (Ε1) — 'Source National Order' is the
  // real FK link (spec national-load-source Γ1).
  const existing = await atGetAll(TABLES.NAT_LOADS, {
    filterByFormula: `FIND("${noId}", ARRAYJOIN({Source National Order}, ","))>0`,
    fields: ['Name']
  }, false);

  if (isDelete) {
    // Delete NL record(s) when NO is deleted or groupage turned ON
    for (const r of existing) {
      try { await atDelete(TABLES.NAT_LOADS, r.id); } catch(e) { console.warn('NL delete err:', e); }
    }
    _tmsLog(`_syncNationalLoad: deleted ${existing.length} NL for NO ${noId}`);
    return;
  }

  // Build direction
  const dir = noFields['Direction'] || '';
  let nlDir = 'North→South';
  if (dir === 'South→North') nlDir = 'South→North';

  // Resolve client name
  let clientName = '';
  try {
    const cArr = noFields['Client'];
    const cId = Array.isArray(cArr) ? (cArr[0]?.id || cArr[0]) : null;
    if (cId) {
      const cRec = await atGetOne(TABLES.CLIENTS, cId);
      clientName = cRec.fields?.['Company Name'] || '';
    }
  } catch(e) { logError(e, 'orders_natl resolve client name'); }

  const _lid = v => {
    if (!v) return null;
    if (Array.isArray(v)) return v.length ? (v[0]?.id || v[0]) : null;
    return typeof v === 'object' ? v.id : v;
  };

  // Build NL fields
  const nlFields = {
    'Name': `${clientName || 'Order'} — ${toLocalDate(noFields['Loading DateTime'])}`,
    'Direction': nlDir,
    // 'National' distinguishes this from VS-sourced loads ('Direct', written by
    // orders_intl's _syncVeroiaSwitch) now that a real FK tells them apart — no
    // consumer keys off 'Direct' on this path, only weekly_natl's `=== 'Groupage'`
    // checks (spec national-load-source Γ1). 'Source Record'/'Source Orders'
    // dropped: they drove the write onto the intl-order FK and 400'd (Ε1).
    'Source Type': 'National',
    'Source National Order': [noId],
    'Client': clientName,
    'Goods': noFields['Goods'] || '',
    'Total Pallets': noFields['Pallets'] || 0,
    'Temperature C': noFields['Temperature °C'] ?? null,
    'Loading DateTime': noFields['Loading DateTime'] || null,
    'Delivery DateTime': noFields['Delivery DateTime'] || null,
    'Reference': noFields['Reference'] || '',
    'Pallet Exchange': !!noFields['Pallet Exchange'],
  };
  // 'Pending' only when the load is BORN. On an update it reset an assigned
  // load (truck/driver set on the Weekly) to Pending on every edit of the
  // order (P1-α, 4/10) — the international form already leaves Status out.
  if (!existing.length) nlFields['Status'] = 'Pending';

  // Copy Pickup/Delivery Locations 1-10 (new-style), fallback to old-style
  let hasNewPickup = false, hasNewDeliv = false;
  for (let i = 1; i <= 10; i++) {
    const pId = _lid(noFields[`Pickup Location ${i}`]);
    const dId = _lid(noFields[`Delivery Location ${i}`]);
    if (pId) { nlFields[`Pickup Location ${i}`] = [pId]; hasNewPickup = true; }
    if (dId) { nlFields[`Delivery Location ${i}`] = [dId]; hasNewDeliv = true; }
    // A point removed from the order must leave the load too (P1-α): noFields
    // is the order as re-read (an absent slot = NULL), and [] → NULL in the
    // Worker. Only on an update — a new load has nothing to clear.
    else if (existing.length) nlFields[`Delivery Location ${i}`] = [];
  }
  // Note: old-style single 'Pickup Location' / 'Delivery Location' fields no longer exist in schema

  let _nlRecId = null;
  if (existing.length) {
    // Update existing
    await atPatch(TABLES.NAT_LOADS, existing[0].id, nlFields);
    _nlRecId = existing[0].id;
    _tmsLog(`_syncNationalLoad: updated NL ${existing[0].id} for NO ${noId}`);
  } else {
    // Create new
    const created = await atCreate(TABLES.NAT_LOADS, nlFields);
    _nlRecId = created.id;
    _tmsLog(`_syncNationalLoad: created NL ${created.id} for NO ${noId}`);
  }

  // Write ORDER_STOPS for the NAT_LOADS record
  if (_nlRecId) {
    const _nlStops = [];
    const _pals = noFields['Pallets'] || 0;
    const _clientId = Array.isArray(noFields['Client']) ? (_lid(noFields['Client'][0]) || _lid(noFields['Client'])) : null;
    const _goods = noFields['Goods'] || null;
    const _temp  = noFields['Temperature °C'] ?? null;
    const _ref   = noFields['Reference'] || null;

    // ── Φ2 (Α1): παλέτες ΑΝΑ ΣΤΑΣΗ, όχι το σύνολο σε κάθε στάση ──────────
    //
    // Πριν: `pallets: _pals` έγραφε το ΣΥΝΟΛΟ της παραγγελίας σε ΚΑΘΕ στάση.
    // Παραγγελία 20p σε 3 σημεία έγραφε 20+20+20 = 60p στα ORDER_STOPS, και
    // κάθε τι που τα αθροίζει έβλεπε τριπλάσιο φορτίο.
    //
    // Δεν είναι συστημικό: τα διεθνή το κάνουν ήδη σωστά (orders_intl.js:1435,
    // :1442 γράφουν parseFloat(pal) ανά στάση). Τα εθνικά έμειναν πίσω.
    //
    // Πηγή αλήθειας = τα ORDER_STOPS της ΙΔΙΑΣ της παραγγελίας, όπου η φόρμα
    // έχει ήδη γράψει τις παλέτες κάθε σημείου.
    const _byStop = {}, _dateByStop = {};
    try {
      const _noStops = await stopsLoad(noId, F.STOP_PARENT_NAT);
      (_noStops || []).forEach(s => {
        const t = s.fields?.[F.STOP_TYPE], n = s.fields?.[F.STOP_NUMBER], p = s.fields?.[F.STOP_PALLETS];
        if (t && p != null) _byStop[t + '#' + (n || 0)] = p;
        // Each delivery keeps ITS date on the load too (P1-α: every stop got the order's first date).
        if (t && s.fields?.[F.STOP_DATETIME]) _dateByStop[t + '#' + (n || 0)] = s.fields[F.STOP_DATETIME];
      });
    } catch(e) { console.warn('Α1: ανάγνωση ORDER_STOPS της NO απέτυχε', e); }

    let _nLoad = 0, _nUnload = 0;
    for (let i = 1; i <= 10; i++) {
      if (_lid(noFields[`Pickup Location ${i}`]))   _nLoad++;
      if (_lid(noFields[`Delivery Location ${i}`])) _nUnload++;
    }

    // ΜΙΑ στάση → το σύνολο είναι όντως της στάσης.
    // ΠΟΛΛΕΣ χωρίς αναλυτικά δεδομένα → null (κενό), ΠΟΤΕ το σύνολο σε
    // καθεμία: το λάθος νούμερο είναι χειρότερο από το κανένα, γιατί
    // αθροίζεται σιωπηλά σε πολλαπλάσιο φορτίο.
    const _palFor = (type, i, count) => {
      const v = _byStop[type + '#' + i];
      if (v != null) return v;
      return count === 1 ? _pals : null;
    };

    for (let i = 1; i <= 10; i++) {
      const pId = _lid(noFields[`Pickup Location ${i}`]);
      if (pId) _nlStops.push({ stopNumber: i, stopType: 'Loading', locationId: pId,
        pallets: _palFor('Loading', i, _nLoad), dateTime: noFields['Loading DateTime'] || null,
        clientId: _clientId, goods: _goods, temp: _temp, ref: _ref });
      const dId = _lid(noFields[`Delivery Location ${i}`]);
      if (dId) _nlStops.push({ stopNumber: i, stopType: 'Unloading', locationId: dId,
        pallets: _palFor('Unloading', i, _nUnload), dateTime: _dateByStop['Unloading#' + i] || noFields['Delivery DateTime'] || null,
        clientId: _clientId, goods: _goods, temp: _temp, ref: _ref });
    }
    if (_nlStops.length) {
      try { await stopsSave(_nlRecId, _nlStops, F.STOP_PARENT_NL); }
      catch(e) { console.warn('NL ORDER_STOPS write error:', e); }
    }
  }
  return _nlRecId; // 9/9: the Weekly National «new ΑΝΟΔΟΣ from a row» needs the load's id to bind it

  } finally {
    _syncingNLs.delete(noId);
  }
}

// Owner 28/9: national orders have ONLY «Διαγραφή» too — «Ακύρωση» removed
// (same decision as orders_intl; docs/DECISION_LOG.md 28/9). Legacy
// 'Cancelled' rows still render with their label (_ON_STATUS).

// ═══════════════════════════════════════════════
// deleteNatlOrder — Delete a National Order + cleanup NL/GL/CL/Ramp
// ═══════════════════════════════════════════════
// Roles the Worker lets DELETE national_orders — the toolbar Undo of a new
// national order is armed only for these (§4 #9 review, 4/10/2026). config.js
// PERMS has no «delete» level, so the rule is mirrored here: compare with
// PERMISSIONS in worker/src/index.js on the DEPLOYED branch
// (origin/deploy/worker-0310: owner via "*", dispatcher via its
// national_orders row since f9f78283, 28/9). main's worker/src/index.js still
// lacks the dispatcher DELETE — a known repo/deploy split. The rig
// tests/critics/natl-order-wave1-proof.js fails if this list and the deploy
// branch disagree.
const _NATL_DELETE_ROLES = ['owner', 'dispatcher'];

// Returns true only when the order was deleted — the toolbar Undo of a new
// national order runs this and must know a cancel/refusal from a delete (§4 #9).
async function deleteNatlOrder(recId) {
  if (!confirm('Διαγραφή αυτής της εθνικής παραγγελίας; Θα αφαιρεθούν και τα συνδεδεμένα φορτία και οι γραμμές groupage.')) return false;

  try {
    toast('Deleting order...', 'info');
    let _delFail = 0;

    // 13/9 (Sotiris go-live audit): the order itself is soft-deleted FIRST.
    // Until now it came last, after every child (loads, stops, ramp rows,
    // partner assignments) had already been deleted — and for a dispatcher,
    // who has no DELETE on national_orders, that last call was refused, so the
    // order stayed «live» with all its children gone and the toast said the
    // delete had failed. Now a refused delete stops here, before anything is
    // touched, and says why.
    try {
      await atSoftDelete(TABLES.NAT_ORDERS, recId);
    } catch(e) {
      const m = String(e && e.message || e);
      toast(/403|forbidden|δικαίωμα/i.test(m) ? 'Χωρίς δικαίωμα διαγραφής εθνικής παραγγελίας — ζήτα από τον owner' : 'Η διαγραφή απέτυχε — δεν άλλαξε τίποτα', 'danger');
      return false;
    } finally {
      // §4 #9 (N-11, 4/10/2026): atSoftDelete arms a toolbar «Restore», which
      // re-created the order as a NEW Ε-n with no load and no stops. Restoring
      // a national order is refused (atRestoreFromTrash), so it is not offered.
      if (typeof clearUndo === 'function') clearUndo();
    }

    // 1. Delete NAT_LOADS (Direct) linked to this NO
    try {
      const nls = await atGetAll(TABLES.NAT_LOADS, {
        filterByFormula: `FIND("${recId}",ARRAYJOIN({Source National Order},","))>0` /* 14/9: national loads of a national order link via Source National Order — {Source Record} is the INTL alias, so this lookup never found anything and the load outlived its order */,
        fields: ['Name']
      }, false);
      for (const nl of nls) {
        try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; console.warn('NL delete:', e); }
      }
      if (nls.length) _tmsLog(`Deleted ${nls.length} NAT_LOADS for NO ${recId}`);
    } catch(e) { _delFail++; console.warn('NL cleanup error:', e); }

    // 2. Delete GL lines + linked CL + CL-linked NL
    try {
      const gls = await atGetAll(TABLES.GL_LINES, {
        filterByFormula: `FIND("${recId}",ARRAYJOIN({Linked National Order},","))>0`,
        fields: ['Status','Linked Consolidated Load']
      }, false);
      for (const gl of gls) {
        // Delete CONS_LOADS linked to this GL
        try {
          // 14/9: the CL is the line's own FK — filtering CONS_LOADS by a «Groupage
          // Lines» reverse field the Worker does not model was a 422 swallowed into
          // _delFail, so a groupage truck was never released on delete.
          const _clId = getLinkedId(gl.fields['Linked Consolidated Load']);
          const cls = _clId ? [{ id: _clId }] : [];
          for (const cl of cls) {
            // 13/9 (Sotiris go-live audit): a groupage truck is ONE consolidated
            // load for N customers. Deleting one customer's order used to delete
            // the truck (CL + its national load) everyone else was still on.
            // The truck survives while any OTHER order's line is still Assigned
            // on it; only this order's lines are released below.
            let others = [];
            try { others = await clOtherAssignedLines(cl.id, gls.map(x => x.id)); } // core/order-sync.js — the one copy (A4)
            catch(e) { _delFail++; console.warn('CL share check:', e); continue; }
            if (others.length) { _tmsLog(`CL ${cl.id} kept — ${others.length} other line(s) still assigned`); continue; }
            // Delete NL records from this CL
            try {
              const nlsFromCL = await atGetAll(TABLES.NAT_LOADS, {
                filterByFormula: `FIND("${cl.id}",ARRAYJOIN({Source Consolidated Load},","))>0` /* 13/9: groupage loads link via the CL FK, never Source Record */,
                fields: ['Name']
              }, false);
              for (const nl of nlsFromCL) { try { await atDelete(TABLES.NAT_LOADS, nl.id); } catch(e) { _delFail++; } }
            } catch(e) { _delFail++; console.warn('NL-CL cleanup:', e); }
            try { await atDelete(TABLES.CONS_LOADS, cl.id); } catch(e) { _delFail++; console.warn('CL delete:', e); }
          }
        } catch(e) { _delFail++; console.warn('CL cleanup:', e); }
        // FIXME(audit): GL_LINES must never be hard-deleted — only set Status='Unassigned'.
        // See .reference/ANALYSIS_WEAK_SPOTS_OPPORTUNITIES.md and orders_natl.js findings.
        try { await atSafePatch(TABLES.GL_LINES, gl.id, { Status: 'Unassigned' }); } catch(e) { _delFail++; console.warn('GL unassign:', e); }
      }
      if (gls.length) _tmsLog(`Unassigned ${gls.length} GL lines for NO ${recId} (CL/NL deleted)`);
    } catch(e) { _delFail++; console.warn('GL cleanup error:', e); }

    // 3. Delete RAMP records linked to this NO (field is 'National Order', NOT 'Source Order')
    try {
      const ramps = await atGetAll(TABLES.RAMP, {
        filterByFormula: `FIND("${recId}",ARRAYJOIN({National Order},","))>0`,
        fields: ['Name']
      }, false);
      for (const r of ramps) {
        try { await atDelete(TABLES.RAMP, r.id); } catch(e) { _delFail++; console.warn('Ramp delete:', e); }
      }
    } catch(e) { _delFail++; console.warn('Ramp cleanup:', e); }

    if (typeof plOnOrderDeleted === 'function') await plOnOrderDeleted(recId, 'natl');

    // 4. ORDER_STOPS: removed by the database trigger
    // trg_national_orders_soft_delete_cascade in the same transaction. Reloading
    // them here read the order just deleted (stopsLoad → atGetOne → «Record not
    // found» toast after a SUCCESSFUL delete — live check 29/9).

    // 4b. Delete PARTNER_ASSIGN records linked to this NO (via Nat Load field — also Order in case national orders use that)
    try {
      const pas = await atGetAll(TABLES.PARTNER_ASSIGN, {
        filterByFormula: `OR(FIND("${recId}",ARRAYJOIN({${F.PA_ORDER}},",")) > 0, FIND("${recId}",ARRAYJOIN({${F.PA_NAT_LOAD}},",")) > 0)`,
      }, false);
      for (const pa of pas) {
        try { await atDelete(TABLES.PARTNER_ASSIGN, pa.id); } catch(e) { _delFail++; console.warn('PA delete:', e); }
      }
      if (pas.length) _tmsLog(`Deleted ${pas.length} PARTNER_ASSIGN for NO ${recId}`);
    } catch(e) { _delFail++; console.warn('PA cleanup:', e); }

    // 5. (the order itself was soft-deleted first — see the top of this function)

    // Invalidate caches
    invalidateCache(TABLES.NAT_ORDERS);
    invalidateCache(TABLES.NAT_LOADS);
    invalidateCache(TABLES.GL_LINES);
    invalidateCache(TABLES.CONS_LOADS);

    toast(_delFail ? `Order deleted (${_delFail} linked records failed — check data)` : 'Order deleted', _delFail ? 'warn' : 'success');
    if (_delFail && typeof logError === 'function') logError(new Error(`Cascade delete: ${_delFail} sub-deletes failed`), 'deleteNatlOrder ' + recId);
    await renderOrdersNatl();
    return true;
  } catch(e) {
    reportError('Η διαγραφή απέτυχε, δοκιμάστε ξανά', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// SCAN FLOW — clone of orders_intl with national-specific schema
// ═══════════════════════════════════════════════════════════════

function openNatlScan() {
  document.getElementById('modal').style.maxWidth = '520px';
  openModal('Νέα National Order από Scan', `
    <div style="text-align:center;padding:4px 0 24px">
      <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
        Upload εθνικού δελτίου — AI εξάγει pickup/delivery και προσυμπληρώνει τη φόρμα
      </div>
    </div>

    <div id="natlScanDrop"
      style="border:2px dashed var(--border-dark);border-radius:var(--radius);padding:32px 16px;
             text-align:center;cursor:pointer;background:var(--surface-page);transition:border-color 0.15s"
      onclick="document.getElementById('natlScanFile').click()"
      ondragover="event.preventDefault();document.getElementById('natlScanDrop').style.borderColor='var(--accent)'"
      ondragleave="document.getElementById('natlScanDrop').style.borderColor='var(--border-dark)'"
      ondrop="_natlScanDrop(event)">
      <div style="font-size:13px;font-weight:500;color:var(--text-mid)">Σύρε το αρχείο εδώ ή κάνε κλικ για επιλογή</div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:4px">JPG · PNG · PDF — max 10MB</div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:12px"
        onclick="event.stopPropagation();document.getElementById('natlScanCamera').click()">
        ${(typeof icon === 'function') ? icon('camera', 14) : ''} Λήψη με κάμερα
      </button>
    </div>
    <input type="file" id="natlScanFile" accept="image/*,application/pdf${typeof scanEngineV2On === 'function' && scanEngineV2On() ? ',.doc,application/msword,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ''}" style="display:none"
      onchange="_natlScanHandleFile(this.files[0])">
    <input type="file" id="natlScanCamera" accept="image/*" capture="environment" style="display:none"
      onchange="_natlScanHandleFile(this.files[0])">

    <div id="natlScanStatus" style="display:none;margin-top:16px"></div>`,

  `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
   <button class="btn btn-success" id="btnNatlScanGo" onclick="_natlScanExtract()" disabled>
     Εξαγωγή & συμπλήρωση φόρμας
   </button>`);
}

function _natlScanDrop(e) {
  e.preventDefault();
  document.getElementById('natlScanDrop').style.borderColor = 'var(--border-dark)';
  _natlScanHandleFile(e.dataTransfer.files[0]);
}

async function _natlScanHandleFile(file) {
  if (!file) return;
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) { toast(`File too large (${(file.size/1024/1024).toFixed(1)}MB) — max 10MB`, 'error'); return; }
  // Engine v2 (scan round 2/3/4) also reads Word .doc / .docx, same as orders_intl.js.
  const v2 = typeof scanEngineV2On === 'function' && scanEngineV2On();
  const okType = v2 ? scanV2Accepts(file) : (file.type.startsWith('image/') || file.type === 'application/pdf');
  if (!okType) { toast(v2 ? 'Δεκτά μόνο JPG / PNG / PDF / Word (.doc, .docx)' : 'Only JPG / PNG / PDF supported', 'error'); return; }

  window._natlScanFile = file;
  const btn = document.getElementById('btnNatlScanGo');
  if (btn) btn.disabled = false;

  const drop = document.getElementById('natlScanDrop');
  if (drop) drop.innerHTML = `
    <div style="font-size:13px;font-weight:500;color:var(--ok)">✓ ${escapeHtml(file.name)}</div>
    <div style="font-size:12px;color:var(--text-dim);margin-top:4px">${(file.size/1024).toFixed(0)} KB — κλικ για αλλαγή</div>`;

  const st = document.getElementById('natlScanStatus');
  if (!st) return;
  st.style.display = 'block';
  st.innerHTML = `<div class="scan-preview-doc"><span style="color:var(--text-mid);font-size:12px">Φόρτωση προεπισκόπησης…</span></div>`;
  try {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      st.innerHTML = `<div class="scan-preview-doc"><img src="${url}" alt="preview"></div>`;
    } else if (file.type === 'application/pdf' && typeof scanRenderPDFPreview === 'function') {
      const dataUrl = await scanRenderPDFPreview(file);
      st.innerHTML = dataUrl
        ? `<div class="scan-preview-doc"><img src="${dataUrl}" alt="PDF page 1"></div>`
        : `<div class="scan-preview-info">PDF · ${escapeHtml(file.name)}</div>`;
    } else {
      st.innerHTML = `<div class="scan-preview-info">📄 ${escapeHtml(file.name)}</div>`;  // .doc/.docx (v2): no preview
    }
  } catch(e) { st.innerHTML = `<div class="scan-preview-info">${escapeHtml(file.name)}</div>`; }
}

async function _natlScanExtract() {
  const file = window._natlScanFile;
  if (!file) return;
  const st = document.getElementById('natlScanStatus');
  const btn = document.getElementById('btnNatlScanGo');
  const setStatus = (icon, text, kind = 'info') => {
    if (!st) return;
    const bg = kind === 'error' ? 'var(--danger-bg)' : 'var(--surface-page)';
    const color = kind === 'error' ? 'var(--danger)' : 'var(--text-mid)';
    const border = kind === 'error' ? 'rgba(220,38,38,0.2)' : 'var(--border)';
    st.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:12px;background:${bg};border-radius:var(--radius);border:1px solid ${border};font-size:13px;color:${color}">${icon}${text}</div>`;
  };
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block"></span> &nbsp;Analyzing...'; }
  setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', 'Προετοιμασία αρχείου…');

  try {
    // Engine v2 behind the same per-browser switch as orders_intl.js
    // (core/scan-engine-v2.js) — one structured-output call, matching in code
    // over ALL clients/locations. v1 (below) is untouched when the switch is off.
    if (typeof scanEngineV2On === 'function' && scanEngineV2On()) {
      setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', 'AI αναλύει το έγγραφο (v2)…');
      const data = await scanV2Extract(file);
      data._scanFile = file;   // side-by-side review needs the original (see orders_intl.js)
      await _natlScanPreview(data);
      return;
    }
    const pre = await scanPreprocessFile(file);
    setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', 'AI αναλύει το εθνικό δελτίο…');

    const cb = pre.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: pre.mediaType, data: pre.base64 } }
      : { type: 'image',    source: { type: 'base64', media_type: pre.mediaType, data: pre.base64 } };

    // Reference data injection (Phase 2.3)
    const refData = (typeof scanGetReferenceData === 'function') ? scanGetReferenceData(50, 80) : { clients: [], locations: [] };
    const refBlock = (typeof scanBuildReferenceBlock === 'function') ? scanBuildReferenceBlock(refData) : '';

    const sysPrompt = `You are a logistics document parser for Petras Group's NATIONAL Greek transport operations.
Extract data from Greek delivery notes (Δελτίο Αποστολής), national transport orders, or domestic CMR variants.
Return ONLY valid JSON — no markdown, no explanation.

Output schema:
{
  "name": "order reference / number from document (e.g. 'NO-2026-001')",
  "reference": "transport reference / Δελτίο Αποστολής number / order #. Look for: 'Αρ. Δελτίου', 'Α/Α', 'No.', 'Reference', 'Αρ. Παραγγελίας'. Numeric/alphanumeric value only. null if not found.",
  "client_name": "company that issued or paid for the transport",
  "direction": "South→North if delivering northwards (e.g. Athens→Thessaloniki, Patra→Veroia), North→South if going south",
  "type": "Direct | Groupage | Cross-dock",
  "goods": "comma-separated product list",
  "pallets": total pallets count,
  "temperature_c": number or null,
  "price_eur": number or null,
  "loading_date": "YYYY-MM-DD",
  "delivery_date": "YYYY-MM-DD",
  "confidence": "HIGH | MEDIUM | LOW",
  "field_confidence": { "client_name": 0-1, "pallets": 0-1, "pickup_locations": 0-1, "delivery_locations": 0-1, "dates": 0-1 },
  "pickup_locations": [{
    "location_name": "supplier / pickup site name",
    "city": "Greek city in Latin",
    "city_gr": "Greek city in Greek script",
    "pallets": number,
    "date": "YYYY-MM-DD"
  }],
  "delivery_locations": [{
    "location_name": "consignee name",
    "city": "Greek city in Latin",
    "city_gr": "Greek city in Greek",
    "pallets": null,
    "date": "YYYY-MM-DD"
  }],
  "notes": "special instructions"
}

GREEK NATIONAL CONTEXT:
- All locations are in Greece. No customs.
- Common Greek city pairs: Αθήνα↔Θεσσαλονίκη, Πάτρα↔Θεσσαλονίκη, Ηράκλειο→Athens, Veroia↔Athens
- Veroia/Βέροια is a cross-dock hub — note if mentioned
- Direction "South→North" (ΑΝΟΔΟΣ): Athens/Patra → Veroia/Thessaloniki
- Direction "North→South" (ΚΑΘΟΔΟΣ): Veroia/Thessaloniki → Athens/Patra
- "Groupage" = multiple suppliers consolidated; "Direct" = single supplier
- field_confidence: 1.0 = clearly read, 0.4 = barely legible
- Sum pickup pallets must equal total pallets` + refBlock + `

You have access to two tools:
- search_clients(query)        → look up canonical client name + id
- search_locations(query, city, country) → look up canonical location name + id

USE THESE TOOLS for the client and every pickup/delivery location.
Set client_id and location_id fields when tools return a confident match (>0.85).`;

    const messages = [];
    const examples = (typeof scanGetTrainingExamples === 'function') ? scanGetTrainingExamples('DELIVERY_NOTE', 3) : [];
    examples.forEach(ex => {
      messages.push({ role: 'user', content: [{ type: 'text', text: 'Extract:' }] });
      messages.push({ role: 'assistant', content: [{ type: 'text', text: JSON.stringify(ex.corrected) }] });
    });
    messages.push({ role: 'user', content: [cb, { type: 'text', text:
      'Extract national order data. Use search_clients and search_locations tools.\n\n' +
      'CRITICAL: Final message = ONLY the JSON object. No preamble, no markdown, no commentary. Start with `{` end with `}`.'
    }] });

    // DELIVERY_NOTE → Sonnet (per tier map). Use tool-use loop with fallback.
    const natlModel = (typeof scanModelForType === 'function') ? scanModelForType('DELIVERY_NOTE') : SCAN_MODEL;
    let data;
    try {
      data = await scanExtractWithTools({
        model: natlModel,
        max_tokens: SCAN_MAX_TOKENS,
        system: sysPrompt,
        messages,
        onProgress: (stage, detail) => {
          if (stage === 'tools') {
            setStatus('<span class="spinner" style="width:16px;height:16px;flex-shrink:0"></span>', detail);
          }
        },
      });
    } catch (toolErr) {
      console.warn('[natl_scan] tool-use loop failed, falling back:', toolErr.message);
      data = await scanCallAnthropic({
        model: natlModel,
        max_tokens: SCAN_MAX_TOKENS,
        system: sysPrompt,
        messages,
      });
    }

    const raw = data.content.find(c => c.type === 'text')?.text || '{}';
    const parsed = (typeof scanExtractJSON === 'function')
      ? scanExtractJSON(raw)
      : JSON.parse(raw.replace(/```json|```/g, '').trim());
    parsed._docType = 'DELIVERY_NOTE';
    await _natlScanPreview(parsed);
  } catch (e) {
    setStatus('× ', e.message || 'Η εξαγωγή απέτυχε', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Εξαγωγή & συμπλήρωση φόρμας'; }
    if (typeof logError === 'function') logError(e, 'natl_scan_extract');
  }
}

async function _natlScanPreview(data) {
  // v2 result shape is core/scan-engine-v2.js's own (client_name/loading_stops/
  // delivery_stops/field_confidence keyed differently) — the v1 code below
  // expects the old natl-specific schema (pickup_locations/name/…), so it
  // branches off entirely rather than being bent to fit both.
  if (data._engine === 'v2') return _natlScanPreviewV2(data);

  const st = document.getElementById('natlScanStatus');
  const btn = document.getElementById('btnNatlScanGo');
  if (btn) { btn.disabled = false; btn.innerHTML = 'Εξαγωγή & συμπλήρωση φόρμας'; }

  // Match client — prefer AI-supplied client_id (from tool use), then fuzzy fallback
  let clientId = '', clientLabel = '';
  const allClients = (typeof getRefClients === 'function' ? getRefClients() : []) || [];
  if (data.client_id) {
    const direct = allClients.find(c => c.id === data.client_id);
    if (direct) { clientId = direct.id; clientLabel = direct.fields?.['Company Name'] || ''; }
  }
  if (!clientId && data.client_name) {
    if (typeof scanFuzzyMatch === 'function' && allClients.length) {
      const list = allClients.map(c => ({ id: c.id, label: c.fields?.['Company Name'] || '' })).filter(c => c.label);
      const best = scanFuzzyMatch(data.client_name, list, { threshold: 0.6, limit: 1 })[0];
      if (best) { clientId = best.id; clientLabel = best.label; }
    } else {
      try {
        const matches = await atGetAll(TABLES.CLIENTS, {
          filterByFormula: `OR(SEARCH(LOWER("${(data.client_name||'').replace(/"/g,'')}"),LOWER({Company Name})))`,
          fields: ['Company Name'], maxRecords: 5,
        }, false);
        if (matches.length) { clientId = matches[0].id; clientLabel = matches[0].fields['Company Name']; }
      } catch(e) { console.warn('[natl_scan] client match failed:', e.message); }
    }
  }

  // Match locations — prefer AI-supplied location_id, then fuzzy match using ref data
  const allLocs = (typeof getRefLocations === 'function' ? getRefLocations() : []) || [];
  const locList = allLocs.map(l => ({
    id: l.id,
    // One list everywhere (owner 5/9): Greek name, whatever spelling/code the
    // location record stores — same normalisation as the rest of the screen.
    label: [(l.fields?.['Name']||''), (l.fields?.['City']||''),
      (l.fields?.['Country'] && typeof countryName === 'function' ? countryName(l.fields['Country']) : (l.fields?.['Country']||''))].filter(Boolean).join(' · '),
  })).filter(l => l.label);
  const _matchLoc = s => {
    if (s.location_id) {
      const direct = allLocs.find(l => l.id === s.location_id);
      if (direct) return direct;
    }
    if (typeof scanFuzzyMatch === 'function' && locList.length) {
      const composite = [s.location_name, s.city_gr, s.city].filter(Boolean).join(' ');
      const best = scanFuzzyMatch(composite, locList, { threshold: 0.55, limit: 1 })[0];
      if (best) return allLocs.find(l => l.id === best.id);
    }
    const nm = (s.location_name || '').toLowerCase();
    const cg = (s.city_gr || '').toLowerCase();
    const ct = (s.city || '').toLowerCase();
    return allLocs.find(l => nm && (l.fields['Name']||'').toLowerCase().includes(nm))
        || allLocs.find(l => cg && (l.fields['City']||'').toLowerCase().includes(cg))
        || allLocs.find(l => ct && (l.fields['City']||'').toLowerCase().includes(ct));
  };
  const pickups = (data.pickup_locations || []).map(s => {
    const m = _matchLoc(s);
    return { ...s, _locId: m?m.id:'', _locLabel: m?(m.fields['Name']||m.fields['City']):s.location_name||s.city_gr||s.city };
  });
  const deliveries = (data.delivery_locations || []).map(s => {
    const m = _matchLoc(s);
    return { ...s, _locId: m?m.id:'', _locLabel: m?(m.fields['Name']||m.fields['City']):s.location_name||s.city_gr||s.city };
  });

  const conf = data.confidence || 'LOW';
  const confC = conf === 'HIGH' ? 'var(--ok)' : conf === 'MEDIUM' ? 'var(--warn)' : 'var(--danger)';
  const fc = data.field_confidence || {};
  const fcMark = score => {
    if (score == null) return '';
    return score >= 0.85 ? '<span style="color:var(--ok)">✓</span>'
         : score >= 0.6  ? '<span style="color:var(--warn)">~</span>'
                         : '<span style="color:var(--danger)">⚠</span>';
  };

  const row = (label, val, score) => val ? `
    <div class="detail-field">
      <span class="detail-field-label">${label}</span>
      <span class="detail-field-value" style="display:flex;align-items:center;gap:6px">${val} ${fcMark(score)}</span>
    </div>` : '';

  st.style.display = 'block';
  st.innerHTML = `
    <div style="background:var(--surface-page);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span class="detail-section-title" style="margin:0">AI Extraction</span>
        <span style="font-size:11px;font-weight:600;letter-spacing:1px;color:${confC}">${conf}</span>
      </div>
      ${row('Order Name', escapeHtml(data.name||''), fc.client_name)}
      ${data.reference ? row('Reference', escapeHtml(String(data.reference)), fc.reference != null ? fc.reference : 0.85) : ''}
      ${row('Client',  escapeHtml(clientLabel||data.client_name), fc.client_name)}
      ${row('Direction', data.direction||'', null)}
      ${row('Type',      data.type||'', null)}
      ${pickups.map((s,i)=>row(`Pickup ${pickups.length>1?i+1:''}`,    escapeHtml(s._locLabel), fc.pickup_locations)).join('')}
      ${deliveries.map((s,i)=>row(`Delivery ${deliveries.length>1?i+1:''}`,escapeHtml(s._locLabel), fc.delivery_locations)).join('')}
      ${row('Load Date', escapeHtml(data.loading_date||''), fc.dates)}
      ${row('Del Date',  escapeHtml(data.delivery_date||''), fc.dates)}
      ${row('Pallets',   data.pallets!=null?String(data.pallets):'', fc.pallets)}
      ${row('Goods',     escapeHtml(data.goods||''), null)}
      ${row('Temp',      data.temperature_c!=null?data.temperature_c+' °C':'', null)}
      ${data.notes ? `<div style="margin-top:8px;font-size:11px;color:var(--text-dim);font-style:italic">${escapeHtml(data.notes)}</div>` : ''}
    </div>
    <div style="font-size:11px;color:var(--text-dim);text-align:center;padding-top:4px">
      ✓ matched · ~ partial · ⚠ low confidence
    </div>`;

  window._natlScanResult = { data, matched: { clientId, clientLabel, pickups, deliveries } };
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-ghost" onclick="openNatlScan()">← Νέα σάρωση</button>
    <button class="btn btn-success" onclick="_natlScanOpenForm()">Άνοιγμα φόρμας →</button>`;

  // Duplicate detection — fire-and-forget. Insert warning if Reference matches existing.
  if (data.reference && typeof findDuplicateOrders === 'function') {
    findDuplicateOrders(data.reference, TABLES.NAT_ORDERS).then(dupes => {
      if (!dupes.length) return;
      const dupListHtml = dupes.map(d => {
        const f = d.fields;
        const loadDate = (f['Loading DateTime']||'').substring(0,10);
        const name = f['Name'] || d.id.slice(-6);
        return `<li style="margin:4px 0">
          <a href="#" onclick="event.preventDefault();closeModal();OrdersHub.openOrder('natl','${d.id}')"
             style="color:var(--warn);text-decoration:underline;font-weight:600">${escapeHtml(String(name))}</a>
          <span style="color:var(--warn);font-size:11px"> · ${loadDate||'χωρίς ημερομηνία'}</span>
        </li>`;
      }).join('');
      st.insertAdjacentHTML('afterbegin', `
        <div style="background:var(--warn-bg);border:1px solid var(--warn-border);padding:8px 12px;border-radius:var(--radius);margin-bottom:8px">
          <div style="font-weight:700;color:var(--warn);font-size:13px">⚠ Πιθανό διπλότυπο</div>
          <div style="font-size:12px;color:var(--warn);margin-top:4px">Βρέθηκε ήδη παραγγελία με Reference <strong>${escapeHtml(String(data.reference))}</strong>:</div>
          <ul style="margin:6px 0 0 18px;padding:0;font-size:12px">${dupListHtml}</ul>
        </div>`);
    });
  }
}

// ─── v2 preview (round 3) — core/scan-engine-v2.js's own field shape ──────
// The national form has ONE pickup location for the whole load (no per-stop
// pickup UI, unlike international's several loading stops) — a document with
// more than one loading stop still prefills form, using the first, with a
// warning banner so it isn't silently dropped.
async function _natlScanPreviewV2(data) {
  const st = document.getElementById('natlScanStatus');
  const btn = document.getElementById('btnNatlScanGo');
  if (btn) { btn.disabled = false; btn.innerHTML = 'Εξαγωγή & συμπλήρωση φόρμας'; }

  const allClients = (typeof getRefClients === 'function' ? getRefClients() : []) || [];
  const clientLabel = data.client_id
    ? ((allClients.find(c => c.id === data.client_id) || {}).fields || {})['Company Name'] || ''
    : (data.client_name || '');

  const pickup = (data.loading_stops || [])[0] || null;
  const deliveries = data.delivery_stops || [];
  const fc = data.field_confidence || {};
  const mark = score => score == null ? ''
    : score >= 0.85 ? '<span style="color:var(--ok)">✓</span>'
    : score >= 0.6  ? '<span style="color:var(--warn)">~</span>'
                     : '<span style="color:var(--danger)">⚠</span>';
  const row = (label, val, score) => val ? `
    <div class="detail-field">
      <span class="detail-field-label">${label}</span>
      <span class="detail-field-value" style="display:flex;align-items:center;gap:6px">${val} ${mark(score)}</span>
    </div>` : '';

  const conf = data.confidence || 'LOW';
  const confC = conf === 'HIGH' ? 'var(--ok)' : conf === 'MEDIUM' ? 'var(--warn)' : 'var(--danger)';
  const warns = [...((data._v2 && data._v2.warnings) || [])];
  if ((data.loading_stops || []).length > 1) {
    warns.push(`Το έγγραφο έχει ${data.loading_stops.length} σημεία φόρτωσης — η φόρμα δέχεται ένα, κρατήθηκε το 1ο.`);
  }

  st.style.display = 'block';
  st.innerHTML = `
    ${warns.map(w => `<div style="background:var(--warn-bg);border:1px solid var(--warn-border);padding:6px 10px;border-radius:var(--radius);margin-bottom:6px;font-size:12px;color:var(--warn)">⚠ ${escapeHtml(w)}</div>`).join('')}
    <div style="background:var(--surface-page);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:4px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap">
        <span class="detail-section-title" style="margin:0">AI Extraction</span>
        <span style="display:flex;align-items:center;gap:8px">
          ${data._modelLabel ? `<span style="font-size:11px;color:var(--text-mid)">${escapeHtml(data._modelLabel)}</span>` : ''}
          <span style="font-size:11px;font-weight:600;letter-spacing:1px;color:${confC}">${conf}</span>
        </span>
      </div>
      ${row('Client', escapeHtml(clientLabel || data.client_name || ''), fc.client_name)}
      ${data.reference ? row('Reference', escapeHtml(String(data.reference)), fc.reference) : ''}
      ${row('Direction', escapeHtml(data.direction || ''), null)}
      ${pickup ? row('Pickup', escapeHtml(pickup.location_name || pickup.city || ''), fc.loading_stops) : ''}
      ${deliveries.map((s, i) => row(`Delivery ${deliveries.length > 1 ? i + 1 : ''}`, escapeHtml(s.location_name || s.city || ''), fc.delivery_stops)).join('')}
      ${row('Load Date', escapeHtml((pickup && pickup.date) || ''), fc.dates)}
      ${row('Pallets', data.pallets != null ? String(data.pallets) : '', fc.pallets)}
      ${row('Goods', escapeHtml(data.goods || ''), null)}
      ${row('Temp', data.temperature_c != null ? data.temperature_c + ' °C' : '', fc.temperature_c)}
      ${data.notes ? `<div style="margin-top:8px;font-size:11px;color:var(--text-dim);font-style:italic">${escapeHtml(data.notes)}</div>` : ''}
    </div>
    <div style="font-size:11px;color:var(--text-dim);text-align:center;padding-top:4px">✓ ≥0.85 · ~ 0.6–0.85 · ⚠ &lt;0.6</div>`;

  window._natlScanResult = { data, matched: { clientId: data.client_id || '', clientLabel, pickup, deliveries } };
  document.getElementById('modalFooter').innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-ghost" onclick="openNatlScan()">← Νέα σάρωση</button>
    <button class="btn btn-success" onclick="_natlScanOpenForm()">Άνοιγμα φόρμας →</button>`;

  if (data.reference && typeof findDuplicateOrders === 'function') {
    findDuplicateOrders(data.reference, TABLES.NAT_ORDERS).then(dupes => {
      if (!dupes.length) return;
      const dupListHtml = dupes.map(d => {
        const f = d.fields;
        const loadDate = (f['Loading DateTime'] || '').substring(0, 10);
        const name = f['Name'] || d.id.slice(-6);
        return `<li style="margin:4px 0">
          <a href="#" onclick="event.preventDefault();closeModal();OrdersHub.openOrder('natl','${d.id}')"
             style="color:var(--warn);text-decoration:underline;font-weight:600">${escapeHtml(String(name))}</a>
          <span style="color:var(--warn);font-size:11px"> · ${loadDate || 'χωρίς ημερομηνία'}</span>
        </li>`;
      }).join('');
      st.insertAdjacentHTML('afterbegin', `
        <div style="background:var(--warn-bg);border:1px solid var(--warn-border);padding:8px 12px;border-radius:var(--radius);margin-bottom:8px">
          <div style="font-weight:700;color:var(--warn);font-size:13px">⚠ Πιθανό διπλότυπο</div>
          <div style="font-size:12px;color:var(--warn);margin-top:4px">Βρέθηκε ήδη παραγγελία με Reference <strong>${escapeHtml(String(data.reference))}</strong>:</div>
          <ul style="margin:6px 0 0 18px;padding:0;font-size:12px">${dupListHtml}</ul>
        </div>`);
    });
  }
}

async function _natlScanOpenForm() {
  const r = window._natlScanResult;
  if (!r) return;
  if (r.data._engine === 'v2') return _natlScanOpenFormV2(r);
  const f = {};
  if (r.matched.clientId) f['Client'] = [r.matched.clientId];
  if (r.data.name)        f['Name'] = r.data.name;
  if (r.data.reference)   f['Reference'] = String(r.data.reference);
  if (r.data.direction)   f['Direction'] = r.data.direction;
  if (r.data.type)        f['Type'] = r.data.type;
  if (r.data.goods)       f['Goods'] = r.data.goods;
  if (r.data.notes)       f['Notes'] = String(r.data.notes);
  if (r.data.pallets)     f['Pallets'] = r.data.pallets;
  if (r.data.temperature_c != null) f['Temperature °C'] = r.data.temperature_c;
  if (r.data.price_eur)   f['Price'] = r.data.price_eur;
  if (r.data.loading_date)  f['Loading DateTime']  = r.data.loading_date;
  if (r.data.delivery_date) f['Delivery DateTime'] = r.data.delivery_date;

  r.matched.pickups.forEach((s, i) => {
    if (s._locId) f[`Pickup Location ${i+1}`] = [s._locId];
    if (s.pallets != null) f[`Loading Pallets ${i+1}`] = s.pallets;
  });
  r.matched.deliveries.forEach((s, i) => {
    if (s._locId) f[`Delivery Location ${i+1}`] = [s._locId];
  });

  // Stash for active learning — saved when user actually submits the form
  window._natlScanPending = { docType: 'DELIVERY_NOTE', summary: window._natlScanFile?.name || '', ai: r.data };

  closeModal();
  if (typeof openNatlCreate === 'function') {
    openNatlCreate();
    // Pre-fill form fields after the modal renders
    setTimeout(() => _natlPrefillFromScan(f), 100);
  }
}

// ─── v2 open-form (round 3) ────────────────────────────────────────────
// Builds the same `f` (Airtable-label) object _openNatlModal already knows
// how to read for client/pickup/deliveries, and calls it DIRECTLY instead of
// through openNatlCreate()+_natlPrefillFromScan (the v1 path above): that
// prefill only matches DOM elements carrying data-field/name/#fld_* attributes,
// and the national form has none — v1's scan-to-form fill has never actually
// populated anything (verified by reading the form markup, 27/9/2026). Left
// unchanged per the round-3 brief ("without the switch the national scan
// must behave exactly as today") — this v2 path is the fix, scoped to v2 only.
async function _natlScanOpenFormV2(r) {
  const { data, matched } = r;
  const f = {};
  if (matched.clientId) f['Client'] = [matched.clientId];
  // The shared v2 engine's direction is intl-flavoured (Export/Import, from
  // GR-vs-abroad) and never matches this form's North→South/South→North
  // options — harmless: an all-Greek document makes it null anyway (both
  // stops read country GR), so this simply never fires and the dispatcher
  // picks the direction, same as an unscanned national order always has.
  if (data.direction)   f['Direction'] = data.direction;
  if (data.goods)       f['Goods'] = data.goods;
  if (data.notes)       f['Notes'] = String(data.notes);
  if (data.pallets)     f['Pallets'] = data.pallets;
  if (data.temperature_c != null) f['Temperature °C'] = data.temperature_c;
  if (data.price_eur)   f['Price'] = data.price_eur;

  const pickup = matched.pickup;
  if (pickup) {
    if (pickup.location_id) f['Pickup Location 1'] = [pickup.location_id];
    if (pickup.date) f['Loading DateTime'] = pickup.date;
  }
  (matched.deliveries || []).forEach((s, i) => {
    if (s.location_id) f[`Delivery Location ${i + 1}`] = [s.location_id];
  });
  const firstDelDate = (matched.deliveries || []).map(s => s.date).find(Boolean);
  if (firstDelDate) f['Delivery DateTime'] = firstDelDate;

  // Register matched labels so the autocomplete inputs show a name instead of
  // a blank box next to a hidden id (same trick orders_intl.js uses).
  if (matched.clientId && matched.clientLabel) _fhClientsMap[matched.clientId] = matched.clientLabel;
  const allLocs = (typeof getRefLocations === 'function' ? getRefLocations() : []) || [];
  const labelFor = id => { const l = allLocs.find(x => x.id === id); return l ? (l.fields?.['Name'] || l.fields?.['City'] || '') : ''; };
  if (pickup && pickup.location_id) _fhLocationsMap[pickup.location_id] = labelFor(pickup.location_id);
  (matched.deliveries || []).forEach(s => { if (s.location_id) _fhLocationsMap[s.location_id] = labelFor(s.location_id); });

  window._natlScanPending = { docType: data._docType || 'CARRIER_ORDER', summary: window._natlScanFile?.name || '', ai: data };

  closeModal();
  // Refused (locations did not load): no form, so nothing may stay pending —
  // a _scanPendingDoc set below would attach this scan's file to the NEXT
  // hand-typed national order (core/ui.js closeModal explains the hazard).
  if ((await _openNatlModal(null, f)) === false) return;

  // _openNatlModal only pre-fills row 1's pallets/date from `f` (its own
  // single-delivery shortcut) — _simRows holds the uids it just created, in
  // the SAME order as the `Delivery Location N` fields above, so row i is
  // delivery i. Never overwrites a value _openNatlModal already set.
  (matched.deliveries || []).forEach((s, i) => {
    const uid = _simRows[i];
    if (uid == null) return;
    if (s.pallets != null) { const el = document.getElementById('simp' + uid); if (el && !el.value) el.value = s.pallets; }
    if (s.date) { const el = document.getElementById('simd' + uid); if (el && !el.value) el.value = s.date; }
  });

  // Owner 28/9: the side-by-side review UI (round 3) is gone — the scan opens
  // the plain form. National orders have no document-storage path yet
  // (order_documents.order_id is an FK to `orders`, not `national_orders` —
  // see core/order-docs.js) — the file is still tagged so submitNatlOrder's
  // existing handleNatlOrderSaved() can tell the user so instead of silently
  // dropping it, exactly as the round-3 doc-storage handoff intended.
  if (data._scanFile) window._scanPendingDoc = { file: data._scanFile, source: 'scan' };
}

function _natlPrefillFromScan(fields) {
  for (const [key, val] of Object.entries(fields)) {
    const inputs = document.querySelectorAll(`[data-field="${key}"], [name="${key}"], #fld_${key.replace(/\s/g,'_')}`);
    inputs.forEach(input => {
      // Apply confidence tint class based on _natlScanResult.data.field_confidence
      const fc = window._natlScanResult?.data?.field_confidence || {};
      const fcKey = ({'Client':'client_name','Pallets':'pallets','Loading DateTime':'dates','Delivery DateTime':'dates'})[key];
      if (fcKey && fc[fcKey] != null && typeof scanConfidenceClass === 'function') {
        input.classList.add(scanConfidenceClass(fc[fcKey]));
      }
      if (Array.isArray(val)) {
        // linked record — leave to form to handle, just store hint
        input.dataset.scanFill = val[0];
      } else {
        input.value = val;
      }
    });
  }
}

// Expose functions used from onclick/onchange handlers
window.renderOrdersNatl = renderOrdersNatl;
window.loadOrdersNatlData = loadOrdersNatlData;
window.openNatlCreate = openNatlCreate;
window.openNatlCreateWith = f => _openNatlModal(null, f || {}); // 9/9: Weekly National «νέα άνοδος» prefill
window.openNatlEdit = openNatlEdit;
window.selectNatlOrder = selectNatlOrder;
// The card's «×» is an inline onclick, so it resolves in the global scope.
// Without this the × threw «closeNatlDetail is not defined» (app_errors 5/9
// 17:40, 6/9 16:35).
window.closeNatlDetail = closeNatlDetail;
window.openNatlScan = openNatlScan;
window._natlScanDrop = _natlScanDrop;
window._natlScanHandleFile = _natlScanHandleFile;
window._natlScanExtract = _natlScanExtract;
window._natlScanOpenForm = _natlScanOpenForm;
window.submitNatlOrder = submitNatlOrder;
window.deleteNatlOrder = deleteNatlOrder;
// Φ3β — groupage: όλα καλούνται από inline onclick, module σε IIFE
window._grpAddRow = _grpAddRow;
window._grpDelRow = _grpDelRow;
window._grpAddCard = _grpAddCard;
window._grpDelCard = _grpDelCard;
window._grpSet    = _grpSet;
window._grpPreview = _grpPreview;
window._grpSubmit = _grpSubmit;
window._natlMode  = _natlMode;
// Τα inline onclick δεν βλέπουν μέσα στο IIFE — χωρίς αυτά, σιωπηλό ReferenceError.
window._simAddRow = _simAddRow;
window._simDelRow = _simDelRow;
// Natl-specific form dropdown helpers (self-contained, not shared with orders_intl)
// Form dropdown handlers now in core/form-helpers.js
// Legacy aliases for backward compat
window._natlClientDrop = fhClientDrop;
window._natlLocDrop = fhLocDrop;
window._natlShowDrop = fhShowDrop;
window._natlPickLinked = fhPickLinked;
})();
