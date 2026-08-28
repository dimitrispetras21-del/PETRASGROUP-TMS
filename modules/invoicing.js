// ═══════════════════════════════════════════════
// MODULE — INVOICING  v2
// Bug fixes + Aging buckets + Invoice Number/Date + Outstanding KPI + Sort
// ═══════════════════════════════════════════════
// Note: module state is declared at script-level (INV, _invFilters).
// Naming prefix 'INV' / '_inv' prevents collision with other modules.
'use strict';

const INV = { data: [], filtered: [], selectedId: null, sort: { col: 'aging', dir: 'desc' }, natlFailed: false,
  // Φ4 pallet gate (docs/PALLETS_ARCHITECTURE.md §4.1): order_rec → gate record from /pallets/gate.
  gate: {}, gateFailed: false,
  // Φ4 client balances (/pallets/balances?type=clients), keyed by lowercased trimmed client name — see _invLoadBalances.
  balances: null };
const _invFilters = { tab: 'ready', type: '', weekFrom: '', weekTo: '', client: '' };

// ─── Helpers ─────────────────────────────────────
function _invClientName(rec) {
  const f = rec.fields;
  const id = Array.isArray(f['Client']) ? f['Client'][0] : null;
  if (id) return getClientName(id);
  return f['Client Summary'] || f['Client Name'] || '—';
}

// Raw (un-escaped) client company name, for name-matching against the
// Postgres pallet balances view — see _invLoadBalances for why this can't
// just reuse _invClientName (which runs the value through escapeHtml).
function _invRawClientName(clientId) {
  if (!clientId) return '';
  const c = getRefClients().find(r => r.id === clientId);
  return c ? String(c.fields['Company Name'] || '').trim() : '';
}

function _invRoute(rec) {
  if (rec._type === 'intl') {
    // Από τα links τοποθεσιών — τα Loading/Delivery Summary ήταν φαντάσματα
    // του χάρτη (26/8) και η στήλη ΔΙΑΔΡΟΜΗ έβγαινε «— → —» σε κάθε γραμμή.
    return orderRoute(rec.fields, 25) || '—';
  }
  return rec.fields['Goods'] || '—';
}

function _invOrderNo(rec) {
  // Never fall back to the record id. `rec.id.slice(-6)` produced strings like
  // "Ta1Azv" in the order-number column — an internal id that matches nothing
  // outside the system: not the CMR, not the client's email, not the accounting
  // software. For whoever is doing the invoicing that is worse than an admitted
  // gap, because it looks like a real number.
  // See docs/design/DEEP_AUDIT_2026-08-04/invoicing.md IN-2.
  // 'Reference', ΟΧΙ 'Order Number': το δεύτερο δεν υπάρχει στον χάρτη του
  // Worker (CLAUDE.md, παγίδες ονομάτων) — έδειχνε «(χωρίς αριθμό)» παντού.
  return rec.fields['Reference'] || rec.fields['National Order ID'] || '(χωρίς αριθμό)';
}

function _invPallets(rec) {
  return rec._type === 'intl' ? (rec.fields['Total Pallets'] || 0) : (rec.fields['Pallets'] || 0);
}

// H5 fix: defensive fallback chain — older records may use 'Price', newer 'Net Price'.
// If field is renamed in Airtable, revenue calculations shouldn't silently become 0.
function _invPrice(rec) {
  const f = rec.fields;
  const v = parseFloat(f['Price']);
  if (Number.isFinite(v)) return v;
  const v2 = parseFloat(f['Net Price']);
  if (Number.isFinite(v2)) return v2;
  const v3 = parseFloat(f['Total Price'] || f['Amount'] || f['Revenue']);
  return Number.isFinite(v3) ? v3 : 0;
}
function _invNetPrice(rec) {
  const f = rec.fields;
  const v = parseFloat(f['Net Price']);
  if (Number.isFinite(v)) return v;
  const v2 = parseFloat(f['Price']);
  return Number.isFinite(v2) ? v2 : 0;
}
function _invWeek(rec) { return rec.fields['Week Number'] || '—'; }

function _invPERequired(rec) { return !!rec.fields['Pallet Exchange']; }

// Φ4 gate (docs/PALLETS_ARCHITECTURE.md §4.1): the pre-Φ4 per-stop field check.
// Kept as a named fallback — NOT dead code — for when /pallets/gate is
// unreachable (migrations 006/007 not yet applied to Supabase as of 12/8;
// see INV.gateFailed below). Without this fallback, a gate outage would
// block 100% of pallet-exchange invoicing fleet-wide instead of just
// losing the extra precision the gate adds.
function _invPESheetsOKPerStop(rec) {
  if (!rec.fields['Pallet Exchange']) return true;
  if (rec._type === 'intl') {
    return !!(rec.fields['Pallet Sheet 1 Uploaded'] && rec.fields['Pallet Sheet 2 Uploaded']);
  }
  return true;
}

// Φ4 gate — source of truth is now /pallets/gate (INV.gate), not the old
// per-order-record fields. If the gate call failed outright, we do NOT
// invent an answer either way: we fall back to the old per-stop check
// (_invPESheetsOKPerStop) so invoicing keeps working exactly as before,
// and a visible banner (INV.gateFailed) tells whoever is invoicing that
// the extra cross-stop check isn't active right now.
function _invPESheetsOK(rec) {
  if (!_invPERequired(rec)) return true;
  if (INV.gateFailed) return _invPESheetsOKPerStop(rec);
  const g = INV.gate[rec.id];
  if (!g) return true; // absent from /pallets/gate = no loading stops = nothing to gate
  return g.sheets_ok === true;
}

function _invIsInvoiced(rec) {
  const st = rec.fields['Status'];
  return st === 'Invoiced' || !!rec.fields['Invoiced'];
}

// Φ0 (Α7 · Δ19) — «παραδόθηκε» ΥΠΟΛΟΓΙΖΕΤΑΙ για τα εθνικά, δεν γράφεται.
//
// Καμία διαδρομή του κώδικα δεν φέρνει μια NAT_ORDER σε Status='Delivered':
// το μόνο σημείο που γράφει το πεδίο είναι weekly_natl.js:1120 → 'Assigned'.
// Το 'Delivered' γράφεται μόνο σε TABLES.ORDERS (daily_ops.js:573, :626), άρα
// μόνο στα διεθνή. Αποτέλεσμα: οι εθνικές παραγγελίες δεν εμφανίζονταν ΠΟΤΕ
// στη λίστα τιμολόγησης — χαμένος τζίρος, σιωπηλά.
//
// Ο owner επέλεξε υπολογισμό αντί για εγγραφή: το Status δεν ισχυρίζεται
// γεγονός που κανείς δεν επιβεβαίωσε, τίποτα δεν τρέχει προγραμματισμένα, και
// αν μια παράδοση μετατεθεί δεν έχει γραφτεί ψέμα στη βάση.
//
// Ισχύει ΜΟΝΟ για _type==='natl'. Τα διεθνή έχουν κανονικό lifecycle και
// μένουν άθικτα.
function _invIsDelivered(rec) {
  if (rec.fields['Status'] === 'Delivered') return true;
  if (rec._type !== 'natl') return false;
  if (rec.fields['Status'] === 'Cancelled') return false;
  const dt = _invDeliveredAt(rec);
  if (!dt) return false;
  const t = new Date(dt).getTime();
  return !isNaN(t) && t < Date.now();
}

function _invIsReady(rec) {
  if (_invIsInvoiced(rec)) return false;
  if (!_invIsDelivered(rec)) return false;
  return _invPESheetsOK(rec);
}

function _invIsBlocked(rec) {
  if (_invIsInvoiced(rec)) return false;
  if (!_invIsDelivered(rec)) return false;
  return _invPERequired(rec) && !_invPESheetsOK(rec);
}

function _invDeliveredAt(rec) {
  return rec.fields['Delivery DateTime'] || rec.fields['Delivery Date'] || null;
}

function _invDaysSinceDelivery(rec) {
  const dt = _invDeliveredAt(rec);
  if (!dt) return null;
  // C9 fix: validate before arithmetic — malformed date string produces NaN
  // which propagates through all aging logic.
  const parsed = new Date(dt).getTime();
  if (isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / 86400000);
}

function _invAgingBucket(days) {
  if (days == null) return { key: 'na',   label: '—',     color: '#64748B' };
  if (days <= 7)    return { key: '0-7',  label: '0-7μ',  color: 'var(--panel-ok)' };
  if (days <= 14)   return { key: '7-14', label: '7-14μ', color: '#7DD3FC' };
  if (days <= 30)   return { key: '14-30',label: '14-30μ',color: 'var(--panel-warn)' };
  return                    { key: '>30', label: `${days}μ`, color: 'var(--danger)' };
}

function _invIsOverdue(rec) {
  if (_invIsInvoiced(rec)) return false;
  if (!_invIsDelivered(rec)) return false;
  const d = _invDaysSinceDelivery(rec);
  return d != null && d > 30;
}

function _fmtEuro(v) {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(v || 0);
}

// Auto-suggest next invoice number: INV-YYYY-NNNN
function _invNextNumber() {
  const yr = new Date().getFullYear();
  const prefix = `INV-${yr}-`;
  let max = 0;
  INV.data.forEach(r => {
    const n = (r.fields['Invoice Number']||'').toString();
    if (n.startsWith(prefix)) {
      const num = parseInt(n.slice(prefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  });
  return prefix + String(max + 1).padStart(4, '0');
}

// ─── Φ4 — pallet gate + balances loaders ──────────
// One call for the whole page (chunked at 300 recs, the worker's cap) rather
// than one call per row — the same reasoning as the natl-orders fetch above:
// this list can run into the hundreds, and per-row calls would make the page
// crawl as unpaid work piles up.
async function _invLoadGate() {
  INV.gate = {};
  INV.gateFailed = false;
  const ids = INV.data
    .filter(r => r._type === 'intl' && _invPERequired(r) && !_invIsInvoiced(r))
    .map(r => r.id);
  if (!ids.length) return;
  try {
    for (let i = 0; i < ids.length; i += 300) {
      const chunk = ids.slice(i, i + 300);
      const res = await plFetch('/pallets/gate?order_recs=' + chunk.join(','));
      (res.records || []).forEach(g => { INV.gate[g.order_rec] = g; });
    }
  } catch (e) {
    console.error('Invoicing: /pallets/gate failed', e);
    INV.gate = {};
    INV.gateFailed = true; // _invPESheetsOK falls back to the old per-stop check
  }
}

// Balances come from Postgres (pl_v_balance_clients), keyed by client_id —
// but invoicing still speaks the legacy Airtable recXXX id. There is no
// mapping table exposed to the frontend, so we match by company name
// instead (lowercased + trimmed). Weakness, stated plainly: this breaks
// silently if a client's name differs even slightly between Airtable
// ("Company Name") and Postgres ("client_name") — trailing whitespace,
// casing, a rename applied on one side only, or two different clients that
// happen to share a display name. It is a best-effort match, not an ID join.
async function _invLoadBalances() {
  INV.balances = null;
  try {
    const res = await plFetch('/pallets/balances?type=clients');
    const map = {};
    (res.records || []).forEach(r => {
      const key = String(r.client_name || '').trim().toLowerCase();
      if (key) map[key] = r;
    });
    INV.balances = map;
  } catch (e) {
    console.error('Invoicing: /pallets/balances failed', e);
    INV.balances = null; // stays null → _invFetchPalletBalance shows "δεν φόρτωσε", never 0
  }
}

// ─── Main ────────────────────────────────────────
async function renderInvoicing() {
  const c = document.getElementById('content');
  c.innerHTML = showLoading('Φόρτωση δεδομένων τιμολόγησης…');
  try {
    await preloadReferenceData();
    const formula = `OR({Status}="Delivered",{Status}="Invoiced",{Invoiced}=1)`;
    // Note the asymmetry that made this worth fixing: the international fetch
    // throws (so a failure surfaces through the outer catch), while the national
    // one swallowed its error and returned []. Same page, same importance, but a
    // backend problem on NAT_ORDERS silently produced a shorter invoicing list
    // rather than an error, and nothing distinguishes "no national orders ready
    // to invoice" from "we could not load them". Dropping invoiceable work off
    // an invoicing screen is a billing problem, not a display one.
    const [intlRecs, natlRecs] = await Promise.all([
      atGet(TABLES.ORDERS, formula, false),
      // Φ0 (Α7 · Δ19): το εθνικό φίλτρο δέχεται ΕΠΙΠΛΕΟΝ όσες έχουν περασμένη
      // ημερομηνία παράδοσης και δεν είναι ακυρωμένες. Χωρίς αυτό καμία εθνική
      // δεν έφτανε ποτέ εδώ (κανείς δεν γράφει Status='Delivered' στα NAT_ORDERS).
      // Το διεθνές fetch από πάνω μένει με το αρχικό `formula` — τα διεθνή έχουν
      // κανονικό lifecycle μέσω daily_ops.js και δεν το χρειάζονται.
      safeFetch(
        () => atGet(TABLES.NAT_ORDERS, `OR({Status}="Delivered",{Status}="Invoiced",{Invoiced}=1,AND(IS_BEFORE({Delivery DateTime},'${toLocalDate(new Date())}'),{Status}!="Cancelled"))`, false),
        'invoicing: national orders list'
      ),
    ]);

    // Kept soft on purpose: international orders are the bulk of this list, so
    // blanking the page over a missing national half would be a worse trade.
    // The banner below is what makes the shortfall visible instead of silent.
    INV.natlFailed = didFail(natlRecs);

    intlRecs.forEach(r => { r._type = 'intl'; });
    natlRecs.forEach(r => { r._type = 'natl'; });

    INV.data = [...intlRecs, ...natlRecs];
    INV.filtered = INV.data;
    INV.selectedId = null;
    _invFilters.tab = 'ready';
    _invFilters.type = '';
    _invFilters.weekFrom = '';
    _invFilters.weekTo = '';
    _invFilters.client = '';
    INV.sort = { col: 'aging', dir: 'desc' };

    // Φ4: pallet gate + client balances, fetched once up front so the first
    // table render already reflects them. Both helpers catch internally and
    // never throw — a Supabase/Worker hiccup here must not blank this page.
    await Promise.all([_invLoadGate(), _invLoadBalances()]);

    _renderInvLayout(c);
    _applyInvFilters();
  } catch (e) {
    c.innerHTML = showError('Αποτυχία φόρτωσης τιμολόγησης');
    console.error('Invoicing:', e);
  }
}

// ─── Layout ──────────────────────────────────────
function _renderInvLayout(c) {
  // SH-2/MA-3 guard
  if (typeof currentPage !== 'undefined' && currentPage !== 'invoicing') return;
  const _i = n => (typeof icon === 'function') ? icon(n, 14) : '';
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:var(--space-4)">
      <div>
        <div class="page-title">Τιμολόγηση</div>
        <div class="page-sub" id="invSub">${INV.data.length} παραγγελίες${INV.natlFailed ? ' <span style="color:#B45309">· ⚠ τα εθνικά δεν φόρτωσαν, η λίστα είναι ελλιπής</span>' : ''}${INV.gateFailed ? ' <span style="color:#B45309">· ⚠ ο έλεγχος δελτίων παλετών δεν φόρτωσε — ισχύει ο παλιός έλεγχος ανά στάση</span>' : ''}</div>
      </div>
      <div style="display:flex;gap:var(--space-2);align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="_invShowOutstandingModal()">${_i('users')} Υπόλοιπα ανά πελάτη</button>
        <button class="btn btn-secondary btn-sm" onclick="_invExportPDF()">${_i('file_text')} PDF για Λογιστή</button>
        <button class="btn btn-primary btn-sm" onclick="_invBatchInvoice()" id="invBatchBtn" style="display:none">${_i('check')} Σήμανση επιλεγμένων ως τιμολογημένες</button>
        <button class="btn btn-ghost btn-sm" onclick="_invExportCSV()">${_i('file_text')} Export CSV</button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div id="invKPI" style="display:grid;grid-template-columns:repeat(5,1fr);gap:var(--space-3);margin-bottom:var(--space-5)"></div>

    <!-- Tabs -->
    <div id="invTabs" style="display:flex;gap:0;margin-bottom:var(--space-4);border-bottom:2px solid var(--border-default, #1E293B)"></div>

    <!-- Filters -->
    <div class="entity-toolbar-v2" style="margin-bottom:var(--space-4)">
      <div class="entity-search-wrap">
        ${_i('search')}
        <input class="entity-search-input" placeholder="Αναζήτηση πελάτη…"
          oninput="_invSetFilter('client',this.value)">
      </div>
      <select class="svc-filter" onchange="_invSetFilter('type',this.value)">
        <option value="">Type: All</option>
        <option value="intl">International</option>
        <option value="natl">National</option>
      </select>
      <input type="number" class="svc-filter" style="width:110px" placeholder="Εβδομάδα από"
        onchange="_invSetFilter('weekFrom',this.value)">
      <input type="number" class="svc-filter" style="width:110px" placeholder="Εβδομάδα έως"
        onchange="_invSetFilter('weekTo',this.value)">
    </div>

    <div style="display:flex;gap:16px;align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div class="table-wrap table-wrap--sticky">
          <table>
            <thead><tr id="invThead"></tr></thead>
            <tbody id="invBody"></tbody>
          </table>
        </div>
      </div>
      <div id="invDetail" style="width:360px;flex-shrink:0;display:none"></div>
    </div>
  `;
}

// ─── Tabs ────────────────────────────────────────
function _renderInvTabs() {
  // IN-1: οι καρτέλες αθροίζουν πλέον στο σύνολο.
  // Ήταν Ready 36 + Overdue 97 + Blocked 61 = 194, σε σύνολο 97 — και το
  // «Overdue» ισούταν με ΟΛΟΚΛΗΡΟ το σύνολο, άρα δεν πληροφορούσε καθόλου.
  // Αιτία: το «καθυστερημένη» ΔΕΝ είναι κατηγορία, είναι ηλικία· κόβει
  // εγκάρσια τις Ready και Blocked. Τώρα οι τρεις κατηγορίες είναι αμοιβαία
  // αποκλειστικές (Τιμολογημένη → Μπλοκαρισμένη → Έτοιμη) και η καθυστέρηση
  // είναι badge στη γραμμή + ξεχωριστό φίλτρο, οπτικά διαχωρισμένο.
  const _nReady = INV.data.filter(_invIsReady).length;
  const _nBlocked = INV.data.filter(_invIsBlocked).length;
  const _nInvoiced = INV.data.filter(_invIsInvoiced).length;
  const _nOverdue = INV.data.filter(_invIsOverdue).length;
  const tabs = [
    { key: 'ready',    label: 'Έτοιμες',       count: _nReady },
    { key: 'blocked',  label: 'Μπλοκαρισμένες', count: _nBlocked },
    { key: 'invoiced', label: 'Τιμολογημένες',  count: _nInvoiced },
    { key: 'all',      label: 'Όλες',           count: INV.data.length },
  ];
  const el = document.getElementById('invTabs');
  if (!el) return;
  el.innerHTML = tabs.map(t => {
    const isActive = _invFilters.tab === t.key;
    const isOverdue = t.key === 'overdue' && t.count > 0;
    const color = isActive ? 'var(--accent)' : (isOverdue ? 'var(--danger)' : 'var(--panel-dim)');
    return `
      <button onclick="_invSetTab('${t.key}')"
        style="padding:8px 18px;font-family:'Syne',sans-serif;font-size:13px;font-weight:600;
        border:none;cursor:pointer;background:none;
        color:${color};
        border-bottom:2px solid ${isActive ? 'var(--accent)' : 'transparent'};
        margin-bottom:-2px">
        ${t.label} <span style="font-weight:400;opacity:0.7">(${t.count})</span>
      </button>`;
  }).join('');

  // Γραμμή ελέγχου: η αριθμητική φαίνεται, δεν την εμπιστεύεσαι στα τυφλά.
  // Αν κάποτε πάψει να κλείνει, το ✗ το λέει αμέσως αντί να το ανακαλύψει
  // κάποιος σε audit μήνες μετά.
  const _sum = _nReady + _nBlocked + _nInvoiced;
  const _ok = _sum === INV.data.length;
  el.insertAdjacentHTML('beforeend', `
    <div style="width:100%;padding:6px 0 0;font-size:11px;color:var(--text-dim);font-family:'DM Sans',sans-serif">
      ${_nReady} + ${_nBlocked} + ${_nInvoiced} = ${_sum}
      <span style="color:${_ok ? 'var(--success)' : 'var(--danger)'};font-weight:700">${_ok ? '✓' : '✗ δεν κλείνει με ' + INV.data.length}</span>
      <span style="margin-left:14px">·</span>
      <button type="button" onclick="_invSetTab('overdue')"
        style="background:none;border:0;font:inherit;cursor:pointer;color:${_nOverdue ? 'var(--danger)' : 'var(--text-dim)'};text-decoration:underline;padding:0 0 0 6px">
        ${_nOverdue} καθυστερημένες (>30 ημ.)</button>
      <span style="opacity:.7"> — ηλικία, όχι κατηγορία· κόβει εγκάρσια τις παραπάνω</span>
    </div>`);
}

function _invSetTab(key)            { _invFilters.tab = key; _applyInvFilters(); }
function _invSetFilter(key, val)    { _invFilters[key] = val; _applyInvFilters(); }
function _invSetSort(col) {
  if (INV.sort.col === col) INV.sort.dir = INV.sort.dir === 'asc' ? 'desc' : 'asc';
  else { INV.sort.col = col; INV.sort.dir = 'asc'; }
  _renderInvTable();
  _renderInvHead();
}

// ─── KPI Cards ───────────────────────────────────
function _renderInvKPI() {
  const ready    = INV.data.filter(_invIsReady);
  const blocked  = INV.data.filter(_invIsBlocked);
  const invoiced = INV.data.filter(_invIsInvoiced);
  const overdue  = INV.data.filter(_invIsOverdue);

  // Outstanding = delivered orders not yet invoiced (waiting to issue invoice)
  // Φ0: ίδιος ορισμός «delivered» με τα tabs — αλλιώς το KPI θα έλεγε άλλο
  // νούμερο από τη λίστα που βρίσκεται από κάτω του.
  const outstandingRecs = INV.data.filter(r => _invIsDelivered(r) && !_invIsInvoiced(r));
  const outstandingTotal = outstandingRecs.reduce((s,r) => s + (_invPrice(r)||0), 0);
  const outstandingClients = new Set(outstandingRecs.map(r => Array.isArray(r.fields['Client']) ? r.fields['Client'][0] : null).filter(Boolean));

  const readyTotal = ready.reduce((s, r) => s + (_invPrice(r) || 0), 0);
  const invTotal   = invoiced.reduce((s, r) => s + (_invPrice(r) || 0), 0);

  // Report the tab and card counts. These deliberately sum to MORE than total:
  // "Overdue" is an age filter over the same delivered-not-invoiced orders that
  // Ready and Blocked already contain, so an order 40 days old with its sheets
  // in order is counted in both Ready and Overdue. The audit states that rather
  // than reporting it as an arithmetic fault.
  // See docs/design/DEEP_AUDIT_2026-08-04/invoicing.md.
  if (typeof reportPageMetrics === 'function') reportPageMetrics('invoicing', {
    total: INV.data.length,
    ready: ready.length,
    overdue: overdue.length,
    blocked: blocked.length,
    invoiced: invoiced.length,
    outstanding: outstandingRecs.length,
  });

  const el = document.getElementById('invKPI');
  if (!el) return;

  const cardStyle = `background:var(--panel);border:1px solid var(--panel-border);border-radius:10px;padding:16px 18px`;
  const labelStyle = `font-size:11px;color:var(--panel-dim);font-family:'DM Sans',sans-serif;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px`;
  const valueStyle = `font-size:22px;font-weight:700;color:var(--panel-text);font-family:'Syne',sans-serif`;
  const deltaStyle = `font-size:11px;color:var(--text-dim);margin-top:4px;font-family:'DM Sans',sans-serif`;

  el.innerHTML = `
    <div style="${cardStyle}">
      <div style="${labelStyle}">ΕΤΟΙΜΕΣ ΠΡΟΣ ΤΙΜΟΛΟΓΗΣΗ</div>
      <div style="${valueStyle};color: var(--accent-text)">${ready.length}</div>
      <div style="${deltaStyle}">${_fmtEuro(readyTotal)}</div>
    </div>
    <div style="${cardStyle};${overdue.length ? 'border-color:#7F1D1D' : ''}">
      <div style="${labelStyle}">ΚΑΘΥΣΤΕΡΗΜΕΝΕΣ (>30 ημ.)</div>
      <div style="${valueStyle};color:${overdue.length ? 'var(--danger)' : 'var(--panel-ok)'}">${overdue.length}</div>
      <div style="${deltaStyle}">${overdue.length ? 'Άμεση ενέργεια' : 'Όλα ΟΚ'}</div>
    </div>
    <div style="${cardStyle}">
      <div style="${labelStyle}">ΜΠΛΟΚΑΡΙΣΜΕΝΕΣ — λείπουν δελτία παλετών</div>
      <div style="${valueStyle};color:var(--panel-warn)">${blocked.length}</div>
      <div style="${deltaStyle}">Αναμονή δελτίων παλετών</div>
    </div>
    <div style="${cardStyle}">
      <div style="${labelStyle}">ΤΙΜΟΛΟΓΗΜΕΝΕΣ</div>
      <div style="${valueStyle};color:var(--panel-ok)">${invoiced.length}</div>
      <div style="${deltaStyle}">${_fmtEuro(invTotal)}</div>
    </div>
    <div style="${cardStyle};cursor:pointer" onclick="_invShowOutstandingModal()" title="Δες ανά πελάτη">
      <div style="${labelStyle}">ΑΝΟΙΧΤΑ ΥΠΟΛΟΙΠΑ</div>
      <div style="${valueStyle}">${_fmtEuro(outstandingTotal)}</div>
      <div style="${deltaStyle}">${outstandingClients.size} πελάτες</div>
    </div>
  `;
}

// ─── Table head (sortable) ───────────────────────
function _renderInvHead() {
  const head = document.getElementById('invThead');
  if (!head) return;
  const cols = [
    { key: '_check', label: '<input type="checkbox" onchange="_invToggleAll(this.checked)" style="cursor:pointer">', sortable: false, w: '30px' },
    { key: 'order',  label: 'ΑΡ. ΠΑΡΑΓΓΕΛΙΑΣ' },
    { key: 'type',   label: 'ΤΥΠΟΣ' },
    { key: 'client', label: 'ΠΕΛΑΤΗΣ' },
    { key: 'route',  label: 'ΔΙΑΔΡΟΜΗ' },
    { key: 'aging',  label: 'ΗΛΙΚΙΑ' },
    { key: 'pallets',label: 'ΠΑΛΕΤΕΣ', align: 'right' },
    { key: 'price',  label: 'ΑΞΙΑ',   align: 'right' },
    { key: 'pe',     label: 'ΔΕΛΤΙΟ',      align: 'center' },
    { key: 'status', label: 'ΚΑΤΑΣΤΑΣΗ' },
  ];
  head.innerHTML = cols.map(c => {
    if (c.sortable === false) return `<th style="width:${c.w||''}">${c.label}</th>`;
    const arrow = INV.sort.col === c.key ? (INV.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    const align = c.align ? `text-align:${c.align};` : '';
    return `<th style="cursor:pointer;${align}user-select:none" onclick="_invSetSort('${c.key}')">${c.label}${arrow}</th>`;
  }).join('');
}

// ─── Filter + Render Table ───────────────────────
function _applyInvFilters() {
  let list = INV.data;

  if (_invFilters.tab === 'ready')    list = list.filter(_invIsReady);
  if (_invFilters.tab === 'overdue')  list = list.filter(_invIsOverdue);
  if (_invFilters.tab === 'blocked')  list = list.filter(_invIsBlocked);
  if (_invFilters.tab === 'invoiced') list = list.filter(_invIsInvoiced);

  if (_invFilters.type) list = list.filter(r => r._type === _invFilters.type);

  if (_invFilters.weekFrom) {
    const wf = parseInt(_invFilters.weekFrom);
    list = list.filter(r => { const w = parseInt(_invWeek(r)); return !isNaN(w) && w >= wf; });
  }
  if (_invFilters.weekTo) {
    const wt = parseInt(_invFilters.weekTo);
    list = list.filter(r => { const w = parseInt(_invWeek(r)); return !isNaN(w) && w <= wt; });
  }

  if (_invFilters.client && _invFilters.client.length >= 2) {
    const q = _invFilters.client.toLowerCase();
    list = list.filter(r => _invClientName(r).toLowerCase().includes(q));
  }

  INV.filtered = list;
  _renderInvTabs();
  _renderInvKPI();
  _renderInvHead();
  _renderInvTable();

  // Re-append the incomplete-list warning: this line runs on every filter change
  // and would otherwise wipe the notice set at render time, so the shortfall
  // would silently disappear the moment anyone touched a tab or filter.
  // innerHTML (not textContent) because the warning carries markup; the counts
  // interpolated here are numbers, not user input.
  const sub = document.getElementById('invSub');
  if (sub) {
    sub.innerHTML = `${list.length} από ${INV.data.length} παραγγελίες`
      + (INV.natlFailed ? ' <span style="color:#B45309">· ⚠ τα εθνικά δεν φόρτωσαν, η λίστα είναι ελλιπής</span>' : '')
      + (INV.gateFailed ? ' <span style="color:#B45309">· ⚠ ο έλεγχος δελτίων παλετών δεν φόρτωσε — ισχύει ο παλιός έλεγχος ανά στάση</span>' : '');
  }
}

function _invSortVal(rec, col) {
  switch(col) {
    case 'order':   return _invOrderNo(rec);
    case 'type':    return rec._type;
    case 'client':  return _invClientName(rec).toLowerCase();
    case 'route':   return _invRoute(rec).toLowerCase();
    case 'aging':   return _invDaysSinceDelivery(rec) ?? -1;
    case 'pallets': return _invPallets(rec);
    case 'price':   return _invPrice(rec);
    case 'pe':      return _invPESheetsOK(rec) ? 1 : 0;
    case 'status':  return _invIsInvoiced(rec) ? 2 : _invIsBlocked(rec) ? 1 : 0;
    default: return '';
  }
}

function _renderInvTable() {
  const tbody = document.getElementById('invBody');
  if (!tbody) return;

  if (!INV.filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-dim);padding:32px">No orders match current filters</td></tr>`;
    return;
  }

  // Sort
  const sorted = [...INV.filtered].sort((a, b) => {
    const va = _invSortVal(a, INV.sort.col);
    const vb = _invSortVal(b, INV.sort.col);
    if (va < vb) return INV.sort.dir === 'asc' ? -1 : 1;
    if (va > vb) return INV.sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = sorted.map(r => {
    const f = r.fields;
    const sel = INV.selectedId === r.id ? 'background:#1E293B;' : '';
    const overdueRow = _invIsOverdue(r) ? 'background:#3F1212;' : '';
    // IN-1: η καθυστέρηση φεύγει από τις καρτέλες και γίνεται σήμανση γραμμής.
    const overdueBadge = _invIsOverdue(r)
      ? '<span title="Παραδόθηκε πριν από πάνω από 30 ημέρες" style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;background:var(--danger-bg);color:var(--danger)">ΚΑΘΥΣΤΕΡΗΜΕΝΗ</span>'
      : '';

    const typeBadge = r._type === 'intl'
      ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#0C2D5C;color:var(--panel-accent)">INTL</span>'
      : '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#14532D;color:#4ADE80">NATL</span>';

    const peIcon = r._type !== 'intl' ? '<span style="color:var(--text-dim)">—</span>'
      : _invPESheetsOK(r)
        ? '<span style="color:var(--panel-ok);font-weight:700">&#10003;</span>'
        : '<span style="color:var(--panel-warn);font-weight:700">&#10007;</span>';

    let statusBadge;
    if (_invIsInvoiced(r)) {
      statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#064E3B;color:#6EE7B7">Τιμολογημένη</span>';
    } else if (_invIsBlocked(r)) {
      statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#78350F;color:#FCD34D">Μπλοκαρισμένη</span>';
    } else {
      statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#0C4A6E;color:#7DD3FC">Έτοιμη</span>';
    }

    const days = _invDaysSinceDelivery(r);
    const bucket = _invAgingBucket(days);
    const agingBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${bucket.color}22;color:${bucket.color};border:1px solid ${bucket.color}55">${bucket.label}</span>`;

    const isReady = _invIsReady(r);
    return `<tr onclick="_invSelect('${r.id}')" style="cursor:pointer;${sel}${overdueRow}transition:background 0.15s">
      <td onclick="event.stopPropagation()"><input type="checkbox" class="inv-cb" data-id="${r.id}" onchange="_invCheckChanged()" ${!isReady?'disabled style="opacity:0.3"':'style="cursor:pointer"'}></td>
      <td><strong>${escapeHtml(_invOrderNo(r))}</strong></td>
      <td>${typeBadge}</td>
      <td onclick="event.stopPropagation();_invShowClientHistory(${JSON.stringify(_invClientName(r)).replace(/"/g,'&quot;')})" style="cursor:pointer;color:#7DD3FC;text-decoration:underline;text-decoration-style:dotted" title="Δες ιστορικό πελάτη">${escapeHtml(_invClientName(r))}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(_invRoute(r))}</td>
      <td>${agingBadge}</td>
      <td style="text-align:right">${_invPallets(r)}</td>
      <td style="text-align:right">${_fmtEuro(_invPrice(r))}</td>
      <td style="text-align:center">${peIcon}</td>
      <td>${statusBadge}${overdueBadge}</td>
    </tr>`;
  }).join('');
}

// ─── Detail Panel ────────────────────────────────
function _invSelect(id) {
  INV.selectedId = id;
  _renderInvTable();
  _renderInvDetail();
}

function _renderInvDetail() {
  const panel = document.getElementById('invDetail');
  if (!panel) return;

  if (!INV.selectedId) { panel.style.display = 'none'; return; }

  const rec = INV.data.find(r => r.id === INV.selectedId);
  if (!rec) { panel.style.display = 'none'; return; }

  const f = rec.fields;
  const canInvoice = can('orders') === 'full' || can('costs') === 'full';
  const isInvoiced = _invIsInvoiced(rec);
  const isBlocked  = _invIsBlocked(rec);
  const days = _invDaysSinceDelivery(rec);
  const bucket = _invAgingBucket(days);

  // Invoice block — different rendering depending on state
  let invoiceBlock = '';
  if (isBlocked) {
    // Φ4: say exactly which loading stops are missing a sheet, not just "missing".
    // g is undefined when the gate call failed and we fell back to the old
    // per-stop check (_invPESheetsOKPerStop) — that check has no stop counts,
    // so we fall back to a generic message rather than inventing numbers.
    const g = INV.gate[rec.id];
    const missingMsg = g
      ? `Λείπει δελτίο σε ${(g.loading_stops || 0) - (g.covered_stops || 0)} από ${g.loading_stops || 0} φορτώσεις — δεν τιμολογείται`
      : 'Λείπει δελτίο παλετών — δεν τιμολογείται';
    invoiceBlock = `<button disabled style="width:100%;padding:10px;border-radius:8px;border:1px solid #334155;
      background:#1E293B;color:var(--text-dim);font-size:13px;font-weight:600;cursor:not-allowed;margin-top:12px">
      ${escapeHtml(missingMsg)}</button>`;
    // Owner-only override (docs/PALLETS_ARCHITECTURE.md §4.1): recorded via
    // POST /pallets/override BEFORE the invoice write, so there is always an
    // audit trail explaining who unblocked this order and why — never silent.
    if (typeof ROLE !== 'undefined' && ROLE === 'owner') {
      invoiceBlock += `<button onclick="_invOverrideInvoice('${rec.id}')" style="width:100%;padding:10px;border-radius:8px;
        border:1px solid #B45309;background:#78350F22;color:#FCD34D;font-size:13px;font-weight:600;cursor:pointer;margin-top:8px">
        ⚠ Τιμολόγηση με παράκαμψη</button>`;
    }
  } else if (!isInvoiced && canInvoice) {
    const nextNum = _invNextNumber();
    const today = localToday();
    invoiceBlock = `
      <div style="margin-top:14px;padding:12px;background:#1E293B;border-radius:8px;border:1px solid #334155">
        <div style="font-size:11px;color:var(--panel-dim);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Έκδοση Τιμολογίου</div>
        <input id="invNumInput" value="${nextNum}" style="width:100%;padding:8px;border-radius:6px;background:var(--panel);border:1px solid #334155;color:var(--panel-text);font-size:13px;font-family:'DM Sans',sans-serif;margin-bottom:8px" placeholder="Invoice Number">
        <input id="invDateInput" type="date" value="${today}" style="width:100%;padding:8px;border-radius:6px;background:var(--panel);border:1px solid #334155;color:var(--panel-text);font-size:13px;font-family:'DM Sans',sans-serif;margin-bottom:10px">
        <button onclick="_invMarkInvoiced('${rec.id}')" style="width:100%;padding:10px;border-radius:8px;
          border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer;
          transition:background 0.15s"
          onmouseenter="this.style.background='#0369A1'" onmouseleave="this.style.background='var(--accent)'">
          Mark as Invoiced</button>
      </div>`;
  } else if (isInvoiced) {
    const num = f['Invoice Number'] || '—';
    const date = f['Invoice Date'] || '—';
    invoiceBlock = `
      <div style="margin-top:14px;padding:12px;background:#064E3B22;border-radius:8px;border:1px solid #064E3B">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:11px;color:var(--panel-dim);text-transform:uppercase;letter-spacing:0.5px">Τιμολόγιο</span>
          <span style="font-size:11px;font-weight:600;color:#6EE7B7">Invoiced</span>
        </div>
        <div style="font-size:13px;color:var(--panel-text);font-weight:600">${escapeHtml(num)}</div>
        <div style="font-size:11px;color:var(--panel-dim);margin-top:2px">${escapeHtml(date)}</div>
      </div>`;
  }

  const row = (label, val) => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1E293B">
      <span style="color:var(--panel-dim);font-size:12px">${label}</span>
      <span style="color:var(--panel-text);font-size:13px;font-weight:500;text-align:right;max-width:200px;overflow:hidden;text-overflow:ellipsis">${val}</span>
    </div>`;

  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--panel-border);border-radius:10px;padding:20px;position:sticky;top:16px;max-height:calc(100vh - 40px);overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--panel-text)">${escapeHtml(_invOrderNo(rec))}</span>
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;
          background:${rec._type === 'intl' ? '#0C2D5C' : '#14532D'};
          color:${rec._type === 'intl' ? 'var(--panel-accent)' : '#4ADE80'}">${rec._type === 'intl' ? 'INTL' : 'NATL'}</span>
      </div>
      ${days != null ? `<div style="margin-bottom:10px;padding:6px 10px;background:${bucket.color}22;border-radius:6px;border:1px solid ${bucket.color}55"><span style="font-size:11px;color:${bucket.color};font-weight:600">${(typeof icon==='function')?icon('clock',12):''} ${days} μέρες από την παράδοση</span></div>` : ''}
      ${row('Client', escapeHtml(_invClientName(rec)))}
      ${row('Route', escapeHtml(_invRoute(rec)))}
      ${row('Week', _invWeek(rec))}
      ${row('Pallets', _invPallets(rec))}
      ${row('Price', _fmtEuro(_invPrice(rec)))}
      ${row('Net Price', _fmtEuro(_invNetPrice(rec)))}
      ${rec._type === 'intl' ? row('Pallet Exchange', _invPERequired(rec) ? 'Yes' : 'No') : ''}
      ${rec._type === 'intl' && _invPERequired(rec) ? row('PE Sheets', _invPESheetsOK(rec) ? 'Uploaded' : 'Missing') : ''}
      ${row('Status', f['Status'] || '—')}
      ${row('Direction', f['Direction'] || '—')}
      ${row('Pallet Balance', `<span id="invPalBal_${rec.id}" style="color:var(--panel-dim)">…</span>`)}
      ${invoiceBlock}
    </div>
  `;

  // Async fetch pallet balance for this client
  const clientId = Array.isArray(f['Client']) ? f['Client'][0] : null;
  if (clientId) _invFetchPalletBalance(clientId, `invPalBal_${rec.id}`);
}

// ─── Invoice Action ──────────────────────────────
// Shared write: both the normal path and the owner-override path end up
// here so there is exactly one place that touches ORDERS/NAT_ORDERS for
// invoicing. The caller decides whether the sheets check applies.
async function _invWriteInvoice(rec, invNumber, invDate) {
  const table = rec._type === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS;
  const fields = {
    'Status': 'Invoiced',
    'Invoiced': true,
    'Invoice Number': invNumber,
    'Invoice Date': invDate,
  };
  await atPatch(table, rec.id, fields);
  invalidateCache(table);
  Object.assign(rec.fields, fields);
  return fields;
}

async function _invMarkInvoiced(recId) {
  const rec = INV.data.find(r => r.id === recId);
  if (!rec) return;

  if (!_invPESheetsOK(rec)) {
    toast('Cannot invoice — pallet exchange sheets are missing', 'error');
    return;
  }

  const numInput  = document.getElementById('invNumInput');
  const dateInput = document.getElementById('invDateInput');
  const invNumber = numInput ? numInput.value.trim() : '';
  const invDate   = dateInput ? dateInput.value : localToday();

  if (!invNumber) { toast('Συμπλήρωσε Invoice Number', 'error'); return; }

  try {
    await _invWriteInvoice(rec, invNumber, invDate);
    toast(`Τιμολόγιο ${invNumber} εκδόθηκε`);
    _applyInvFilters();
    _renderInvDetail();
  } catch (e) {
    reportError('Η έκδοση τιμολογίου απέτυχε', e);
  }
}

// ─── Owner override (Φ4, docs/PALLETS_ARCHITECTURE.md §4.1) ──────────────
// Skips ONLY the sheets check — everything else about issuing the invoice
// is identical to _invMarkInvoiced (same shared write). The override call
// is made BEFORE the invoice write and is not undone if the write later
// fails, by design: it is an audit entry ("who decided to skip the check
// and why"), not a transactional lock — recording an override that was
// then not used is harmless, silently invoicing without a recorded reason
// is not.
async function _invOverrideInvoice(recId) {
  const rec = INV.data.find(r => r.id === recId);
  if (!rec) return;

  const reason = prompt('Αιτιολογία παράκαμψης τιμολόγησης χωρίς δελτίο παλετών (υποχρεωτικό):');
  if (!reason || !reason.trim()) { toast('Η παράκαμψη χρειάζεται αιτιολογία', 'error'); return; }

  try {
    await plFetch('/pallets/override', { method: 'POST', body: { order_rec: rec.id, reason: reason.trim() } });
    const invNumber = _invNextNumber();
    const invDate = localToday();
    await _invWriteInvoice(rec, invNumber, invDate);
    toast(`Τιμολόγιο ${invNumber} εκδόθηκε με παράκαμψη`, 'warn');
    _applyInvFilters();
    _renderInvDetail();
  } catch (e) {
    reportError('Η παράκαμψη τιμολόγησης απέτυχε', e);
  }
}

// ─── Batch Operations ───────────────────────────
function _invCheckChanged() {
  const checked = document.querySelectorAll('.inv-cb:checked');
  const btn = document.getElementById('invBatchBtn');
  if (btn) btn.style.display = checked.length > 0 ? '' : 'none';
}

function _invToggleAll(checked) {
  document.querySelectorAll('.inv-cb:not(:disabled)').forEach(cb => cb.checked = checked);
  _invCheckChanged();
}

async function _invBatchInvoice() {
  const ids = [...document.querySelectorAll('.inv-cb:checked')].map(cb => cb.dataset.id);
  if (!ids.length) return;
  if (!(await confirmAction(`Σήμανση ${ids.length} orders ως Invoiced;\n(Αυτόματη αρίθμηση τιμολογίων, σημερινή ημερομηνία)`, { confirmLabel: 'Τιμολόγηση' }))) return;

  // H4 fix: track failures in detail + show detailed report instead of silent fail count.
  let ok = 0;
  let skipped = 0; // Φ4: re-checked below despite the checkbox being disabled for blocked rows — see comment on the check.
  const failures = []; // [{id, msg, client}]
  const today = localToday();
  for (const id of ids) {
    const rec = INV.data.find(r => r.id === id);
    if (!rec) continue;
    // Φ4: the checkbox is already disabled for blocked orders (_renderInvTable),
    // but batch invoicing must not just trust that UI state — re-checking here
    // closes the gap where gate data changed between render and click, or a
    // future caller stops going through the checkbox at all.
    if (!_invPESheetsOK(rec)) { skipped++; continue; }
    try {
      const tbl = rec._type === 'intl' ? TABLES.ORDERS : TABLES.NAT_ORDERS;
      const num = _invNextNumber();
      const fields = {
        'Status': 'Invoiced',
        'Invoiced': true,
        'Invoice Number': num,
        'Invoice Date': today,
      };
      await atPatch(tbl, id, fields);
      Object.assign(rec.fields, fields);
      ok++;
    } catch(e) {
      const clientName = (rec.fields['Client Name'] || rec.fields['Client Summary'] || '').slice(0, 30);
      failures.push({ id, msg: e.message || String(e), client: clientName });
      if (typeof logError === 'function') logError(e, 'invBatchInvoice ' + id);
    }
  }
  invalidateCache(TABLES.ORDERS);
  invalidateCache(TABLES.NAT_ORDERS);
  const skippedWord = skipped === 1 ? 'παραλείφθηκε' : 'παραλείφθηκαν';
  const skippedTxt = skipped ? ` · ${skipped} ${skippedWord} (λείπει δελτίο)` : '';
  if (failures.length) {
    // Show detailed failure report via modal so user knows exactly which orders to retry
    const body = `
      <p style="margin-bottom:var(--space-3)">Τιμολογήθηκαν <strong style="color:var(--success)">${ok}</strong>, Απέτυχαν <strong style="color:var(--danger)">${failures.length}</strong>${skipped ? `, Παραλείφθηκαν <strong style="color:var(--panel-warn)">${skipped}</strong> (λείπει δελτίο παλετών)` : ''}:</p>
      <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:var(--space-2)">
        ${failures.map(f => `<div style="padding:6px;border-bottom:1px solid var(--border);font-size:12px">
          <strong>${escapeHtml(f.client || f.id)}</strong><br>
          <span style="color:var(--danger);font-family:'DM Sans',monospace;font-size:11px">${escapeHtml(f.msg)}</span>
        </div>`).join('')}
      </div>`;
    if (typeof openModal === 'function') openModal('Batch Invoice Report', body);
    else toast(`${ok} τιμολόγια εκδόθηκαν, ${failures.length} απέτυχαν${skippedTxt}`, 'warn');
  } else {
    toast(`${ok} τιμολογήθηκαν${skippedTxt}`, skipped ? 'warn' : 'success');
  }
  _applyInvFilters();
}

// ─── Outstanding by Client modal ─────────────────
function _invShowOutstandingModal() {
  // Group by client — show ONLY delivered orders not yet invoiced
  // Φ0: ίδιος ορισμός με το KPI από πάνω· αλλιώς το κλικ στο νούμερο ανοίγει
  // λίστα με λιγότερες γραμμές από όσες λέει το ίδιο το νούμερο.
  const byClient = {};
  INV.data.filter(r => _invIsDelivered(r) && !_invIsInvoiced(r)).forEach(r => {
    const name = _invClientName(r);
    if (!byClient[name]) byClient[name] = { total: 0, count: 0, oldest: 0 };
    byClient[name].total += _invPrice(r) || 0;
    byClient[name].count += 1;
    const days = _invDaysSinceDelivery(r) || 0;
    if (days > byClient[name].oldest) byClient[name].oldest = days;
  });

  const rows = Object.entries(byClient)
    .sort(([,a], [,b]) => b.total - a.total)
    .map(([name, d]) => {
      const bucket = _invAgingBucket(d.oldest);
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td style="text-align:right">${d.count}</td>
        <td style="text-align:right;font-weight:600">${_fmtEuro(d.total)}</td>
        <td style="text-align:center"><span style="color:${bucket.color};font-weight:600">${bucket.label}</span></td>
      </tr>`;
    }).join('');

  const grandTotal = Object.values(byClient).reduce((s,d) => s + d.total, 0);

  openModal('Outstanding by Client', `
    <div style="max-height:60vh;overflow-y:auto">
      <table style="width:100%">
        <thead>
          <tr><th>Client</th><th style="text-align:right">Orders</th><th style="text-align:right">Total</th><th style="text-align:center">Oldest</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-dim)">Δεν υπάρχουν εκκρεμότητες</td></tr>'}</tbody>
        ${rows ? `<tfoot><tr style="border-top:2px solid #334155"><td colspan="2" style="font-weight:700">TOTAL</td><td style="text-align:right;font-weight:700;color:var(--panel-warn)">${_fmtEuro(grandTotal)}</td><td></td></tr></tfoot>` : ''}
      </table>
    </div>
  `);
}

// ─── CSV Export ─────────────────────────────────
function _invExportCSV() {
  const rows = [['Order No','Type','Client','Route','Aging Days','Pallets','Price','Net Price','Invoice Number','Invoice Date','PE Status','Status']];
  INV.filtered.forEach(r => {
    rows.push([
      _invOrderNo(r),
      r._type === 'intl' ? 'International' : 'National',
      _invClientName(r),
      _invRoute(r).replace(/,/g, ' '),
      _invDaysSinceDelivery(r) ?? '',
      _invPallets(r),
      _invPrice(r) || 0,
      _invNetPrice(r) || 0,
      r.fields['Invoice Number'] || '',
      r.fields['Invoice Date'] || '',
      _invPESheetsOK(r) ? 'OK' : 'Missing',
      _invIsInvoiced(r) ? 'Invoiced' : _invIsBlocked(r) ? 'Blocked' : 'Ready',
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `invoicing_${localToday()}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV exported');
}

// ─── Bulk PDF Export (for accountant) ───────────────
function _invExportPDF() {
  const list = INV.filtered;
  if (!list.length) { toast('Δεν υπάρχουν εγγραφές για εξαγωγή', 'error'); return; }

  const tabLabel = ({ ready:'Ready', overdue:'Overdue', blocked:'Blocked', invoiced:'Invoiced', all:'All' })[_invFilters.tab] || 'All';
  const today = new Date().toLocaleDateString('el-GR');

  // Sort by date descending
  const sorted = [...list].sort((a,b) => {
    const da = new Date(_invDeliveredAt(a) || 0).getTime();
    const db = new Date(_invDeliveredAt(b) || 0).getTime();
    return db - da;
  });

  const totalPrice = sorted.reduce((s,r) => s + (_invPrice(r)||0), 0);
  const totalNet = sorted.reduce((s,r) => s + (_invNetPrice(r)||0), 0);
  const totalPallets = sorted.reduce((s,r) => s + (_invPallets(r)||0), 0);

  const rows = sorted.map(r => {
    const f = r.fields;
    const dt = _invDeliveredAt(r);
    const dtStr = dt ? new Date(dt).toLocaleDateString('el-GR') : '—';
    return `<tr>
      <td>${escapeHtml(_invOrderNo(r))}</td>
      <td>${r._type === 'intl' ? 'INTL' : 'NATL'}</td>
      <td>${escapeHtml(_invClientName(r))}</td>
      <td>${escapeHtml(_invRoute(r))}</td>
      <td style="text-align:center">${dtStr}</td>
      <td style="text-align:right">${_invPallets(r)}</td>
      <td style="text-align:right">${_fmtEuro(_invPrice(r))}</td>
      <td style="text-align:right">${_fmtEuro(_invNetPrice(r))}</td>
      <td>${escapeHtml(f['Invoice Number']||'—')}</td>
      <td style="text-align:center">${escapeHtml(f['Invoice Date']||'—')}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8">
    <title>Invoicing Report — ${tabLabel} — ${today}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--navy-mid);padding-bottom:12px;margin-bottom:16px}
      .hdr h1{font-size:18px;font-weight:700;color:var(--navy-mid)}
      .hdr .meta{font-size:11px;color:#555;text-align:right}
      .stats{display:flex;gap:24px;margin-bottom:14px;padding:10px;background:#F5F7FA;border-radius:6px}
      .stat{font-size:11px}
      .stat b{display:block;font-size:14px;color:var(--navy-mid)}
      table{width:100%;border-collapse:collapse;font-size:10px}
      thead th{background:var(--navy-mid);color:#fff;padding:6px 8px;text-align:left;font-weight:600}
      tbody td{padding:5px 8px;border-bottom:1px solid #E5E7EB}
      tbody tr:nth-child(even){background:#FAFAFA}
      tfoot td{padding:8px;font-weight:700;background:#F5F7FA;border-top:2px solid var(--navy-mid)}
      .pbar{position:fixed;top:0;left:0;right:0;background:var(--navy-mid);color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center}
      .pbar button{background:var(--accent);color:#fff;border:none;padding:6px 18px;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer}
      .pbar button:hover{background:#0369A1}
      .body-wrap{margin-top:50px}
      @media print {
        .pbar{display:none}
        .body-wrap{margin-top:0}
        body{padding:10px}
        @page{size:A4 landscape;margin:1cm}
      }
    </style></head><body>
    <div class="pbar">
      <span style="font-weight:700">Petras Group — Invoicing Report</span>
      <button onclick="window.print()">Εκτύπωση / Save as PDF</button>
    </div>
    <div class="body-wrap">
      <div class="hdr">
        <div>
          <h1>Invoicing Report</h1>
          <div style="font-size:11px;color:#555;margin-top:4px">Tab: ${tabLabel}</div>
        </div>
        <div class="meta">
          <div><b>Date:</b> ${today}</div>
          <div><b>Records:</b> ${sorted.length}</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><b>${sorted.length}</b>Orders</div>
        <div class="stat"><b>${totalPallets}</b>Total Pallets</div>
        <div class="stat"><b>${_fmtEuro(totalPrice)}</b>Gross Revenue</div>
        <div class="stat"><b>${_fmtEuro(totalNet)}</b>Net Revenue</div>
      </div>
      <table>
        <thead><tr>
          <th>Order #</th><th>Type</th><th>Client</th><th>Route</th>
          <th style="text-align:center">Delivered</th>
          <th style="text-align:right">Pallets</th>
          <th style="text-align:right">Price</th>
          <th style="text-align:right">Net</th>
          <th>Inv. #</th><th style="text-align:center">Inv. Date</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="5">TOTAL</td>
          <td style="text-align:right">${totalPallets}</td>
          <td style="text-align:right">${_fmtEuro(totalPrice)}</td>
          <td style="text-align:right">${_fmtEuro(totalNet)}</td>
          <td colspan="2"></td>
        </tr></tfoot>
      </table>
    </div>
    <script>setTimeout(()=>window.print(), 400);</script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { toast('Επέτρεψε popups για να δεις το PDF', 'error'); return; }
  w.document.write(html);
  w.document.close();
}

// ─── Client History modal ──────────────────────────
function _invShowClientHistory(clientName) {
  const orders = INV.data
    .filter(r => _invClientName(r) === clientName)
    .sort((a,b) => {
      const da = new Date(_invDeliveredAt(a) || 0).getTime();
      const db = new Date(_invDeliveredAt(b) || 0).getTime();
      return db - da;
    });

  if (!orders.length) { toast('Δεν βρέθηκαν παραγγελίες', 'error'); return; }

  const totalPrice = orders.reduce((s,r) => s + (_invPrice(r)||0), 0);
  const invoicedCount = orders.filter(_invIsInvoiced).length;
  const pendingCount = orders.length - invoicedCount;
  const pendingTotal = orders.filter(r => !_invIsInvoiced(r)).reduce((s,r) => s + (_invPrice(r)||0), 0);

  const rows = orders.map(r => {
    const f = r.fields;
    const dt = _invDeliveredAt(r);
    const dtStr = dt ? new Date(dt).toLocaleDateString('el-GR') : '—';
    const days = _invDaysSinceDelivery(r);
    const bucket = _invAgingBucket(days);
    const isInv = _invIsInvoiced(r);
    const statusBadge = isInv
      ? `<span style="padding:2px 6px;border-radius:4px;background:#064E3B;color:#6EE7B7;font-size:10px;font-weight:600">Invoiced</span>`
      : `<span style="padding:2px 6px;border-radius:4px;background:#0C4A6E;color:#7DD3FC;font-size:10px;font-weight:600">Pending</span>`;

    return `<tr>
      <td>${escapeHtml(_invOrderNo(r))}</td>
      <td>${r._type === 'intl' ? 'INTL' : 'NATL'}</td>
      <td>${dtStr}</td>
      <td><span style="color:${bucket.color};font-weight:600">${bucket.label}</span></td>
      <td style="text-align:right">${_fmtEuro(_invPrice(r))}</td>
      <td>${escapeHtml(f['Invoice Number']||'—')}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');

  openModal(`Ιστορικό — ${clientName}`, `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
      <div style="padding:10px;background:var(--panel);border-radius:6px;border:1px solid var(--panel-border)">
        <div style="font-size:10px;color:var(--panel-dim);text-transform:uppercase">Σύνολο</div>
        <div style="font-size:18px;font-weight:700;color:var(--panel-text)">${orders.length}</div>
      </div>
      <div style="padding:10px;background:var(--panel);border-radius:6px;border:1px solid var(--panel-border)">
        <div style="font-size:10px;color:var(--panel-dim);text-transform:uppercase">Invoiced</div>
        <div style="font-size:18px;font-weight:700;color:var(--panel-ok)">${invoicedCount}</div>
      </div>
      <div style="padding:10px;background:var(--panel);border-radius:6px;border:1px solid var(--panel-border)">
        <div style="font-size:10px;color:var(--panel-dim);text-transform:uppercase">Pending</div>
        <div style="font-size:18px;font-weight:700;color:var(--panel-warn)">${pendingCount}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:2px">${_fmtEuro(pendingTotal)}</div>
      </div>
      <div style="padding:10px;background:var(--panel);border-radius:6px;border:1px solid var(--panel-border)">
        <div style="font-size:10px;color:var(--panel-dim);text-transform:uppercase">Total Revenue</div>
        <div style="font-size:18px;font-weight:700;color:var(--panel-text)">${_fmtEuro(totalPrice)}</div>
      </div>
    </div>
    <div style="max-height:50vh;overflow-y:auto">
      <table style="width:100%">
        <thead><tr>
          <th>Order #</th><th>Type</th><th>Delivered</th><th>Aging</th>
          <th style="text-align:right">Price</th><th>Inv. #</th><th>Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}

// ─── Pallet Balance for client (Φ4) ──────────────────
// Φ4 fix: this used to read TABLES.PALLET_LEDGER_SUPPLIERS, which has been
// deprecated and empty since the Supabase pallets migration (docs/
// PALLETS_ARCHITECTURE.md §5) — every client silently showed balance 0,
// i.e. "settled", which was simply false on a screen people invoice from.
// Source of truth is now Postgres via /pallets/balances (INV.balances,
// loaded once per page in _invLoadBalances and matched here by client name
// — see that function's comment for the matching weakness).
function _invFetchPalletBalance(clientId, mountId) {
  const target = document.getElementById(mountId);
  if (!target) return;
  if (!clientId) { target.textContent = '—'; return; }

  if (INV.balances === null) {
    // Deliberately NOT "0": an unknown balance must not read as a settled one.
    target.innerHTML = '<span style="color:var(--panel-warn);font-size:10px">δεν φόρτωσε</span>';
    return;
  }

  const key = _invRawClientName(clientId).toLowerCase();
  const rec = key ? INV.balances[key] : null;
  if (!rec) {
    // Absent from the view = no pl_movements row for this client at all yet
    // (genuinely "no history") OR the name didn't match (see matching
    // weakness above) — those two cases are indistinguishable from here,
    // so this is deliberately NOT shown as "0" either.
    target.innerHTML = '<span style="color:var(--panel-dim);font-size:10px">χωρίς κινήσεις</span>';
    return;
  }

  const balance = Number(rec.balance) || 0;
  const color = balance > 0 ? 'var(--panel-ok)' : balance < 0 ? 'var(--panel-warn)' : 'var(--panel-dim)';
  const sign = balance > 0 ? '+' : '';
  const label = balance > 0 ? '(μας οφείλει)' : balance < 0 ? '(τους οφείλουμε)' : '(μηδέν)';
  const pending = rec.pending_count ? `<span style="color:var(--panel-warn);font-size:10px;margin-left:6px">· ${rec.pending_count} εκκρεμή</span>` : '';
  target.innerHTML = `<span style="color:${color};font-weight:600">${sign}${balance}</span> <span style="color:var(--panel-dim);font-size:10px">${label}</span>${pending}`;
}
