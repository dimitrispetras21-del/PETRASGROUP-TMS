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

// Inline style atoms shared by every cell and badge on this screen. Inline
// (not style.css) because this wave touches invoicing.js only, and the global
// `tbody td { padding: 13px 18px }` gave 45-61px rows here — DESIGN.md #5
// caps a working table at 44px. Values come from the DESIGN.md scales only.
const _INV_TD    = 'padding:4px 12px;';
const _INV_NUM   = 'font-variant-numeric:tabular-nums;';
const _INV_BADGE = 'display:inline-block;padding:0 8px;border-radius:9999px;font-size:11px;font-weight:600;line-height:18px;white-space:nowrap;vertical-align:middle;';

// Colour AND word on every badge (DESIGN.md #2). Text + 1px border in the
// semantic token; a fill only where asked. No tinted backgrounds: the old
// `${color}22` hex-alpha suffix on a var() was invalid CSS (rendered as no
// background at all), and a tint would be a colour with no token.
function _invBadge(text, color, opts = {}) {
  const look = opts.fill
    ? `background:${color};color:var(--text-on-dark);border:1px solid ${color};`
    : `background:${opts.bg || 'transparent'};color:${color};border:1px solid ${opts.border || color};`;
  const title = opts.title ? ` title="${opts.title}"` : '';
  return `<span style="${_INV_BADGE}${look}${_INV_NUM}${opts.style || ''}"${title}>${text}</span>`;
}
function _invTypeLabel(rec) { return rec._type === 'intl' ? 'ΔΙΕΘΝΗΣ' : 'ΕΘΝΙΚΗ'; }
function _invTypeBadge(rec) {
  return rec._type === 'intl'
    ? _invBadge('ΔΙΕΘΝΗΣ', 'var(--surface-dark)', { fill: true })
    : _invBadge('ΕΘΝΙΚΗ', 'var(--text-mid)', { border: 'var(--border-dark)' });
}
// DESIGN.md ΜΕΡΟΣ Ε: the base keeps Export/Import, the screen speaks Greek.
// Translation happens at display time only — never written back.
function _invDirectionLabel(v) {
  if (v === 'Export') return 'ΕΞΑΓΩΓΗ';
  if (v === 'Import') return 'ΕΙΣΑΓΩΓΗ';
  return v ? escapeHtml(String(v)) : '—';
}

// ─── Helpers ─────────────────────────────────────
function _invClientName(rec) {
  const f = rec.fields;
  const id = Array.isArray(f['Client']) ? f['Client'][0] : null;
  if (id) return getClientName(id);   // already HTML-escaped (core/data-helpers.js)
  // Escaped here too, so the result is HTML-safe on every branch and callers
  // print it as-is. Escaping AGAIN at the call site printed «&amp;» on screen
  // (FRESH TRADE &amp; TRANSPORTS) — the name is what the accountant reads.
  return escapeHtml(f['Client Summary'] || f['Client Name'] || '—');
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
    return orderRoute(rec.fields, 999) || '—';
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
// For display only. _invPallets stays numeric for sums and sorting; on screen
// a pallet count nobody entered is a dash, not 0 (DESIGN.md #3).
function _invPalletsDisplay(rec) {
  const v = rec._type === 'intl' ? rec.fields['Total Pallets'] : rec.fields['Pallets'];
  return (v === undefined || v === null || v === '') ? '—' : escapeHtml(String(v));
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
  return Number.isFinite(v3) ? v3 : null;   // null = δεν καταχωρήθηκε· ΟΧΙ 0
}
function _invNetPrice(rec) {
  const f = rec.fields;
  const v = parseFloat(f['Net Price']);
  if (Number.isFinite(v)) return v;
  const v2 = parseFloat(f['Price']);
  return Number.isFinite(v2) ? v2 : null;   // null = δεν καταχωρήθηκε· ΟΧΙ 0 (DESIGN.md #3)
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
  // 7-14 days is neutral on purpose: the label already says the age, and a
  // fourth semantic colour would mean nothing (DESIGN.md ΜΕΡΟΣ Β: one meaning each).
  if (days == null) return { key: 'na',   label: '—',        color: 'var(--text-dim)' };
  if (days <= 7)    return { key: '0-7',  label: '0-7 ημ.',  color: 'var(--ok)' };
  if (days <= 14)   return { key: '7-14', label: '7-14 ημ.', color: 'var(--text-mid)' };
  if (days <= 30)   return { key: '14-30',label: '14-30 ημ.',color: 'var(--warn)' };
  return                    { key: '>30', label: `${days} ημ.`, color: 'var(--danger)' };
}

function _invIsOverdue(rec) {
  if (_invIsInvoiced(rec)) return false;
  if (!_invIsDelivered(rec)) return false;
  const d = _invDaysSinceDelivery(rec);
  return d != null && d > 30;
}

function _fmtEuro(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' }).format(Number(v));
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
    c.innerHTML = `<div class="empty-state">
      <div style="font-size:28px;margin-bottom:12px;color:var(--danger)">⚠</div>
      <h3 style="color:var(--danger);font-family:'Syne',sans-serif;font-size:18px;margin:0">Δεν φορτώθηκε η τιμολόγηση</h3>
      <p style="color:var(--text-mid);font-size:13px;margin:8px 0 0">Η λίστα δεν ήρθε από τον server. <strong>Δεν σημαίνει ότι δεν υπάρχουν παραγγελίες προς τιμολόγηση</strong> — τα δεδομένα είναι στη θέση τους.</p>
      <button type="button" class="btn btn-primary btn-sm" style="margin-top:12px" onclick="renderInvoicing()">Ξαναδοκίμασε</button>
    </div>`;
    console.error('Invoicing:', e);
  }
}

// ─── Layout ──────────────────────────────────────
// One line of sub-text, used at first render AND after every filter change —
// it used to be duplicated in _applyInvFilters and the two copies drifted.
function _invSubText(shown, total) {
  return `${shown} από ${total} παραγγελίες`
    + (INV.natlFailed ? ' <span style="color:var(--warn)">· ⚠ τα εθνικά δεν φόρτωσαν, η λίστα είναι ελλιπής</span>' : '')
    + (INV.gateFailed ? ' <span style="color:var(--warn)">· ⚠ ο έλεγχος δελτίων παλετών δεν φόρτωσε — ισχύει ο παλιός έλεγχος ανά στάση</span>' : '');
}

function _renderInvLayout(c) {
  // SH-2/MA-3 guard
  if (typeof currentPage !== 'undefined' && currentPage !== 'invoicing') return;
  const _i = n => (typeof icon === 'function') ? icon(n, 14) : '';
  // Header, KPI strip and the tabs+filters row share ONE goal: ≥20 table rows
  // visible at 1080p (DESIGN.md #5). Sub-text sits beside the title, KPI
  // values share a line with their detail, tabs and filters share a row.
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:12px">
      <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
        <div class="page-title">Τιμολόγηση</div>
        <div class="page-sub" id="invSub" style="margin-top:0;${_INV_NUM}">${_invSubText(INV.data.length, INV.data.length)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="_invShowOutstandingModal()">${_i('users')} Υπόλοιπα ανά πελάτη</button>
        <button class="btn btn-secondary btn-sm" onclick="_invExportPDF()">${_i('file_text')} PDF για λογιστή</button>
        <button class="btn btn-primary btn-sm" onclick="_invBatchInvoice()" id="invBatchBtn" style="display:none">${_i('check')} Σήμανση επιλεγμένων ως τιμολογημένες</button>
        <button class="btn btn-ghost btn-sm" onclick="_invExportCSV()">${_i('file_text')} Εξαγωγή CSV</button>
      </div>
    </div>

    <!-- KPI strip -->
    <div id="invKPI" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px"></div>

    <!-- Tabs + filters, one row -->
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;border-bottom:1px solid var(--border)">
      <div id="invTabs" style="display:flex;align-items:center;gap:0;flex-wrap:wrap;min-width:0"></div>
      <div style="display:flex;gap:8px;align-items:center;padding-bottom:8px">
        <div class="entity-search-wrap" style="height:32px;min-width:200px">
          ${_i('search')}
          <input class="entity-search-input" placeholder="Αναζήτηση πελάτη…"
            oninput="_invSetFilter('client',this.value)">
        </div>
        <select class="svc-filter" style="height:32px" onchange="_invSetFilter('type',this.value)">
          <option value="">Τύπος: όλες</option>
          <option value="intl">Διεθνείς</option>
          <option value="natl">Εθνικές</option>
        </select>
        <input type="number" class="svc-filter" style="width:120px;height:32px;${_INV_NUM}" placeholder="Εβδομάδα από"
          onchange="_invSetFilter('weekFrom',this.value)">
        <input type="number" class="svc-filter" style="width:120px;height:32px;${_INV_NUM}" placeholder="Εβδομάδα έως"
          onchange="_invSetFilter('weekTo',this.value)">
      </div>
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
    // Six states (DESIGN.md Δ2): a quick filter with nothing behind it is
    // disabled — grey, not clickable — instead of a click onto an empty table.
    const disabled = !isActive && t.count === 0;
    const color = isActive ? 'var(--accent)' : (disabled ? 'var(--text-dim)' : 'var(--text-mid)');
    return `
      <button type="button" onclick="_invSetTab('${t.key}')"${disabled ? ' disabled' : ''}
        style="padding:8px 12px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;
        border:none;background:none;cursor:${disabled ? 'not-allowed' : 'pointer'};
        color:${color};${_INV_NUM}
        border-bottom:2px solid ${isActive ? 'var(--accent)' : 'transparent'};
        margin-bottom:-1px">
        ${t.label} <span style="font-weight:400">(${t.count})</span>
      </button>`;
  }).join('');

  // Γραμμή ελέγχου: η αριθμητική φαίνεται, δεν την εμπιστεύεσαι στα τυφλά.
  // Αν κάποτε πάψει να κλείνει, το ✗ το λέει αμέσως αντί να το ανακαλύψει
  // κάποιος σε audit μήνες μετά.
  const _sum = _nReady + _nBlocked + _nInvoiced;
  const _ok = _sum === INV.data.length;
  const _overdueActive = _invFilters.tab === 'overdue';
  el.insertAdjacentHTML('beforeend', `
    <span style="margin-left:12px;padding-bottom:8px;font-size:11px;color:var(--text-dim);white-space:nowrap;${_INV_NUM}">
      ${_nReady} + ${_nBlocked} + ${_nInvoiced} = ${_sum}
      <span style="color:${_ok ? 'var(--ok)' : 'var(--danger)'};font-weight:700">${_ok ? '✓' : '✗ δεν κλείνει με ' + INV.data.length}</span>
      <span style="margin:0 4px">·</span>
      <button type="button" onclick="_invSetTab('overdue')"${_nOverdue ? '' : ' disabled'}
        style="background:none;border:0;font:inherit;${_INV_NUM}cursor:${_nOverdue ? 'pointer' : 'not-allowed'};color:${_nOverdue ? 'var(--danger)' : 'var(--text-dim)'};font-weight:${_overdueActive ? 700 : 400};text-decoration:underline;padding:0">
        ${_nOverdue} καθυστερημένες (>30 ημ.)</button>
      <span title="Η καθυστέρηση είναι ηλικία, όχι κατηγορία: κόβει εγκάρσια τις καρτέλες Έτοιμες και Μπλοκαρισμένες"> — ηλικία, όχι κατηγορία</span>
    </span>`);
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
  // Το άθροισμα αγνοεί όσες δεν έχουν τιμή — άρα ΥΠΟτιμά τον τζίρο. Λέγεται.
  const readyNoPrice = ready.filter(r => _invPrice(r) === null).length;
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

  // Label on one line, value + detail on the next: 5 cards in ~60px instead
  // of ~105px, which is worth 1-2 more table rows at 1080p (DESIGN.md #5).
  // Every card carries its word, so the value colour never stands alone (#2).
  const card = (label, value, sub, o = {}) => `
    <div style="background:var(--surface-card);border:1px solid ${o.border || 'var(--border)'};border-radius:6px;padding:8px 12px;min-width:0;${o.onclick ? 'cursor:pointer;' : ''}"${o.onclick ? ` onclick="${o.onclick}" title="${o.title}"` : ''}>
      <div style="font-size:11px;color:var(--text-mid);text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap">${label}</div>
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-top:4px">
        <span style="font-size:18px;font-weight:700;line-height:1.2;color:${o.color || 'var(--text)'};${_INV_NUM}">${value}</span>
        <span style="font-size:11px;color:var(--text-dim);${_INV_NUM}">${sub}</span>
      </div>
    </div>`;

  el.innerHTML = [
    card('Έτοιμες προς τιμολόγηση', ready.length,
      _fmtEuro(readyTotal) + (readyNoPrice ? ` <span style="color:var(--warn)" title="Δεν αθροίζονται: δεν έχουν καταχωρημένη τιμή. Ο τζίρος είναι μεγαλύτερος κατά άγνωστο ποσό.">· ${readyNoPrice} χωρίς τιμή</span>` : '')),
    card('Καθυστερημένες (>30 ημ.)', overdue.length,
      overdue.length ? 'Άμεση ενέργεια' : 'Όλα εντάξει',
      { color: overdue.length ? 'var(--danger)' : 'var(--ok)', border: overdue.length ? 'var(--danger)' : undefined }),
    card('Μπλοκαρισμένες', blocked.length, 'λείπουν δελτία παλετών', { color: 'var(--warn)' }),
    card('Τιμολογημένες', invoiced.length, _fmtEuro(invTotal), { color: 'var(--ok)' }),
    card('Ανοιχτά υπόλοιπα', _fmtEuro(outstandingTotal), `${outstandingClients.size} πελάτες`,
      { onclick: '_invShowOutstandingModal()', title: 'Δες ανά πελάτη' }),
  ].join('');
}

// ─── Table head (sortable) ───────────────────────
function _renderInvHead() {
  const head = document.getElementById('invThead');
  if (!head) return;
  const cols = [
    { key: '_check', label: '<input type="checkbox" onchange="_invToggleAll(this.checked)" title="Επιλογή όλων των έτοιμων" style="cursor:pointer;margin:0;vertical-align:middle">', sortable: false, w: '30px' },
    { key: 'order',  label: 'ΑΡ. ΠΑΡΑΓΓΕΛΙΑΣ' },
    { key: 'type',   label: 'ΤΥΠΟΣ' },
    { key: 'client', label: 'ΠΕΛΑΤΗΣ', mw: '200px' },
    { key: 'route',  label: 'ΔΙΑΔΡΟΜΗ', w: '26%' },
    { key: 'aging',  label: 'ΗΛΙΚΙΑ' },
    { key: 'pallets',label: 'ΠΑΛΕΤΕΣ', align: 'right' },
    { key: 'price',  label: 'ΑΞΙΑ',   align: 'right' },
    { key: 'pe',     label: 'ΔΕΛΤΙΟ',      align: 'center' },
    { key: 'status', label: 'ΚΑΤΑΣΤΑΣΗ' },
  ];
  // 11px, not the global 10px `thead th`: nothing readable below 11px (DESIGN.md ΜΕΡΟΣ Γ).
  const TH = 'padding:8px 12px;font-size:11px;';
  head.innerHTML = cols.map(c => {
    if (c.sortable === false) return `<th style="${TH}width:${c.w||''}">${c.label}</th>`;
    const arrow = INV.sort.col === c.key ? (INV.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
    const align = c.align ? `text-align:${c.align};` : '';
    return `<th style="${TH}cursor:pointer;${align}${c.w ? `width:${c.w};` : ''}${c.mw ? `min-width:${c.mw};` : ''}user-select:none" onclick="_invSetSort('${c.key}')">${c.label}${arrow}</th>`;
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
  if (sub) sub.innerHTML = _invSubText(list.length, INV.data.length);
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
    // Empty ≠ error (DESIGN.md #7): the load succeeded, the filters just
    // matched nothing — or there is genuinely nothing delivered to invoice.
    // A failed load never reaches here; it renders the retry block instead.
    const msg = INV.data.length
      ? 'Καμία παραγγελία με τα τρέχοντα φίλτρα'
      : 'Καμία παραδομένη ή τιμολογημένη παραγγελία — δεν υπάρχει τίποτα προς τιμολόγηση';
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-dim);padding:32px;font-size:13px">${msg}</td></tr>`;
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
    const sel = INV.selectedId === r.id ? 'background:var(--surface-sunken);' : '';
    // IN-1: η καθυστέρηση φεύγει από τις καρτέλες και γίνεται σήμανση γραμμής.
    // A 3px danger bar on the leading cell + the word in the status cell. The
    // old full-row dark-red fill (a dark-theme leftover) buried the row's own
    // text on this light table; the bar marks without hiding.
    const overdue = _invIsOverdue(r);
    const overdueBar = overdue ? 'box-shadow:inset 3px 0 0 var(--danger);' : '';
    const overdueBadge = overdue
      ? _invBadge('ΚΑΘΥΣΤΕΡΗΜΕΝΗ', 'var(--danger)', { title: 'Παραδόθηκε πριν από πάνω από 30 ημέρες', style: 'margin-left:4px;' })
      : '';

    // ΔΕΛΤΙΟ: tick or cross AND the word (DESIGN.md #2) — a bare ✗ says nothing
    // about what is missing.
    const peIcon = r._type !== 'intl' ? '<span style="color:var(--text-dim)">—</span>'
      : _invPESheetsOK(r)
        ? '<span style="color:var(--ok);font-weight:700" title="Δελτία παλετών: εντάξει">✓</span>'
        : '<span style="color:var(--warn);font-weight:700;font-size:11px;white-space:nowrap" title="Λείπει δελτίο παλετών — δεν τιμολογείται">✗ λείπει</span>';

    let statusBadge;
    if (_invIsInvoiced(r))     statusBadge = _invBadge('Τιμολογημένη', 'var(--ok)');
    else if (_invIsBlocked(r)) statusBadge = _invBadge('Μπλοκαρισμένη', 'var(--warn)', { bg: 'var(--warn-bg)', border: 'var(--warn-border)' });
    else                       statusBadge = _invBadge('Έτοιμη', 'var(--text)', { border: 'var(--border-dark)' });

    const days = _invDaysSinceDelivery(r);
    const bucket = _invAgingBucket(days);
    const agingBadge = _invBadge(bucket.label, bucket.color, { title: days == null ? 'Χωρίς ημερομηνία παράδοσης' : `${days} ημέρες από την παράδοση` });

    const isReady = _invIsReady(r);
    const cb = isReady
      ? `<input type="checkbox" class="inv-cb" data-id="${r.id}" onchange="_invCheckChanged()" style="cursor:pointer;margin:0;vertical-align:middle">`
      : `<input type="checkbox" class="inv-cb" data-id="${r.id}" disabled title="Δεν επιλέγεται: μπλοκαρισμένη ή ήδη τιμολογημένη" style="opacity:0.3;margin:0;vertical-align:middle">`;
    return `<tr onclick="_invSelect('${r.id}')" style="cursor:pointer;${sel}transition:background 0.15s">
      <td onclick="event.stopPropagation()" style="${_INV_TD}${overdueBar}">${cb}</td>
      <td style="${_INV_TD}${_INV_NUM}"><strong style="color:var(--text)">${escapeHtml(_invOrderNo(r))}</strong></td>
      <td style="${_INV_TD}">${_invTypeBadge(r)}</td>
      <td onclick="event.stopPropagation();_invShowClientHistory(${JSON.stringify(_invClientName(r)).replace(/"/g,'&quot;')})" style="${_INV_TD}cursor:pointer" title="Δες ιστορικό πελάτη"><span style="color:var(--text);font-weight:500;text-decoration:underline dotted;text-underline-offset:3px">${_invClientName(r)}</span></td>
      <td style="${_INV_TD}max-width:340px" title="${escapeHtml(_invRoute(r))}">${
        r._type === 'intl'
          ? `<div style="line-height:1.25">${escapeHtml(orderLoadName(r.fields, 999) || '—')}</div>`
            + `<div style="line-height:1.25;font-size:11px;color:var(--text-dim)">→ ${escapeHtml(orderDelName(r.fields, 999) || '—')}</div>`
          : escapeHtml(_invRoute(r))
      }</td>
      <td style="${_INV_TD}">${agingBadge}</td>
      <td style="${_INV_TD}text-align:right;${_INV_NUM}">${_invPalletsDisplay(r)}</td>
      <td style="${_INV_TD}text-align:right;${_INV_NUM}">${_fmtEuro(_invPrice(r))}</td>
      <td style="${_INV_TD}text-align:center">${peIcon}</td>
      <td style="${_INV_TD}white-space:nowrap">${statusBadge}${overdueBadge}</td>
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
  const BTN = 'width:100%;padding:8px;border-radius:6px;font-size:13px;font-weight:600;font-family:\'DM Sans\',sans-serif;';
  if (isBlocked) {
    // Φ4: say exactly which loading stops are missing a sheet, not just "missing".
    // g is undefined when the gate call failed and we fell back to the old
    // per-stop check (_invPESheetsOKPerStop) — that check has no stop counts,
    // so we fall back to a generic message rather than inventing numbers.
    const g = INV.gate[rec.id];
    const missingMsg = g
      ? `Λείπει δελτίο σε ${(g.loading_stops || 0) - (g.covered_stops || 0)} από ${g.loading_stops || 0} φορτώσεις — δεν τιμολογείται`
      : 'Λείπει δελτίο παλετών — δεν τιμολογείται';
    invoiceBlock = `<button disabled style="${BTN}border:1px solid var(--border);background:var(--surface-sunken);color:var(--text-dim);cursor:not-allowed;margin-top:12px;${_INV_NUM}">
      ${escapeHtml(missingMsg)}</button>`;
    // Owner-only override (docs/PALLETS_ARCHITECTURE.md §4.1): recorded via
    // POST /pallets/override BEFORE the invoice write, so there is always an
    // audit trail explaining who unblocked this order and why — never silent.
    if (typeof ROLE !== 'undefined' && ROLE === 'owner') {
      invoiceBlock += `<button onclick="_invOverrideInvoice('${rec.id}')" style="${BTN}
        border:1px solid var(--warn-border);background:var(--warn-bg);color:var(--warn);cursor:pointer;margin-top:8px">
        ⚠ Τιμολόγηση με παράκαμψη</button>`;
    }
  } else if (!isInvoiced && canInvoice) {
    const nextNum = _invNextNumber();
    const today = localToday();
    const INPUT = 'width:100%;padding:8px;border-radius:6px;background:var(--surface-card);border:1px solid var(--border-dark);color:var(--text);font-size:13px;font-family:\'DM Sans\',sans-serif;' + _INV_NUM;
    invoiceBlock = `
      <div style="margin-top:12px;padding:12px;background:var(--surface-sunken);border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:11px;color:var(--text-mid);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Έκδοση τιμολογίου</div>
        <input id="invNumInput" value="${nextNum}" style="${INPUT}margin-bottom:8px" placeholder="Αριθμός τιμολογίου">
        <input id="invDateInput" type="date" value="${today}" style="${INPUT}margin-bottom:12px">
        <button onclick="_invMarkInvoiced('${rec.id}')" style="${BTN}
          border:none;background:var(--accent);color:var(--surface-card);cursor:pointer;transition:background 0.15s"
          onmouseenter="this.style.background='var(--accent-hover)'" onmouseleave="this.style.background='var(--accent)'">
          Σήμανση ως τιμολογημένη</button>
      </div>`;
  } else if (isInvoiced) {
    const num = f['Invoice Number'] || '—';
    const date = f['Invoice Date'] || '—';
    invoiceBlock = `
      <div style="margin-top:12px;padding:12px;border-radius:6px;border:1px solid var(--ok)">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:11px;color:var(--text-mid);text-transform:uppercase;letter-spacing:0.5px">Τιμολόγιο</span>
          <span style="font-size:11px;font-weight:600;color:var(--ok)">✓ Τιμολογήθηκε</span>
        </div>
        <div style="font-size:13px;color:var(--text);font-weight:600;${_INV_NUM}">${escapeHtml(num)}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px;${_INV_NUM}">${escapeHtml(date)}</div>
      </div>`;
  }

  // Values wrap instead of truncating: company names and routes are what the
  // reader phones about (DESIGN.md #6) — the old overflow:hidden + ellipsis
  // cut them at 200px.
  const row = (label, val) => `
    <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-mid);font-size:12px;white-space:nowrap">${label}</span>
      <span style="color:var(--text);font-size:13px;font-weight:500;text-align:right;${_INV_NUM}">${val}</span>
    </div>`;

  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="background:var(--surface-card);border:1px solid var(--border);border-radius:6px;padding:16px;position:sticky;top:16px;max-height:calc(100vh - 32px);overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px">
        <span style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:var(--text);${_INV_NUM}">${escapeHtml(_invOrderNo(rec))}</span>
        ${_invTypeBadge(rec)}
      </div>
      ${days != null ? `<div style="margin-bottom:8px;padding:4px 8px;border-radius:6px;border:1px solid ${bucket.color};color:${bucket.color};font-size:11px;font-weight:600;${_INV_NUM}">${(typeof icon==='function')?icon('clock',12):''} ${days} ημέρες από την παράδοση</div>` : ''}
      ${row('Πελάτης', _invClientName(rec))}
      ${row('Διαδρομή', escapeHtml(_invRoute(rec)))}
      ${row('Εβδομάδα', escapeHtml(String(_invWeek(rec))))}
      ${row('Παλέτες', _invPalletsDisplay(rec))}
      ${row('Τιμή', _fmtEuro(_invPrice(rec)))}
      ${row('Καθαρή τιμή', _fmtEuro(_invNetPrice(rec)))}
      ${rec._type === 'intl' ? row('Ανταλλαγή παλετών', _invPERequired(rec) ? 'Ναι' : 'Όχι') : ''}
      ${rec._type === 'intl' && _invPERequired(rec) ? row('Δελτία παλετών', _invPESheetsOK(rec) ? '<span style="color:var(--ok)">✓ ανέβηκαν</span>' : '<span style="color:var(--warn)">✗ λείπουν</span>') : ''}
      ${row('Κατάσταση', escapeHtml(f['Status'] || '—'))}
      ${row('Κατεύθυνση', _invDirectionLabel(f['Direction']))}
      ${row('Υπόλοιπο παλετών', `<span id="invPalBal_${rec.id}" style="color:var(--text-dim)">…</span>`)}
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
    toast('Δεν τιμολογείται — λείπουν δελτία ανταλλαγής παλετών', 'error');
    return;
  }

  const numInput  = document.getElementById('invNumInput');
  const dateInput = document.getElementById('invDateInput');
  const invNumber = numInput ? numInput.value.trim() : '';
  const invDate   = dateInput ? dateInput.value : localToday();

  if (!invNumber) { toast('Συμπλήρωσε αριθμό τιμολογίου', 'error'); return; }

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
  if (!(await confirmAction(`Σήμανση ${ids.length} παραγγελιών ως τιμολογημένες;\n(Αυτόματη αρίθμηση τιμολογίων, σημερινή ημερομηνία)`, { confirmLabel: 'Τιμολόγηση' }))) return;

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
      <p style="margin-bottom:12px;${_INV_NUM}">Τιμολογήθηκαν <strong style="color:var(--ok)">${ok}</strong>, Απέτυχαν <strong style="color:var(--danger)">${failures.length}</strong>${skipped ? `, Παραλείφθηκαν <strong style="color:var(--warn)">${skipped}</strong> (λείπει δελτίο παλετών)` : ''}:</p>
      <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px">
        ${failures.map(f => `<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">
          <strong>${escapeHtml(f.client || f.id)}</strong><br>
          <span style="color:var(--danger);font-size:11px">${escapeHtml(f.msg)}</span>
        </div>`).join('')}
      </div>`;
    if (typeof openModal === 'function') openModal('Αναφορά μαζικής τιμολόγησης', body);
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
        <td style="${_INV_TD}color:var(--text)">${name}</td>
        <td style="${_INV_TD}text-align:right;${_INV_NUM}">${d.count}</td>
        <td style="${_INV_TD}text-align:right;font-weight:600;${_INV_NUM}">${_fmtEuro(d.total)}</td>
        <td style="${_INV_TD}text-align:center">${_invBadge(bucket.label, bucket.color)}</td>
      </tr>`;
    }).join('');

  const grandTotal = Object.values(byClient).reduce((s,d) => s + d.total, 0);
  const TH = 'padding:8px 12px;font-size:11px;';

  openModal('Υπόλοιπα ανά πελάτη', `
    <div style="max-height:60vh;overflow:auto">
      <table style="width:100%">
        <thead>
          <tr><th style="${TH}">Πελάτης</th><th style="${TH}text-align:right">Παραγγελίες</th><th style="${TH}text-align:right">Σύνολο</th><th style="${TH}text-align:center">Παλαιότερη</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-dim)">Καμία εκκρεμότητα — όλες οι παραδομένες έχουν τιμολογηθεί</td></tr>'}</tbody>
        ${rows ? `<tfoot><tr style="border-top:2px solid var(--border-dark)"><td colspan="2" style="${_INV_TD}font-weight:700;color:var(--text)">ΣΥΝΟΛΟ</td><td style="${_INV_TD}text-align:right;font-weight:700;color:var(--text);${_INV_NUM}">${_fmtEuro(grandTotal)}</td><td></td></tr></tfoot>` : ''}
      </table>
    </div>
  `);
}

// ─── CSV Export ─────────────────────────────────
function _invExportCSV() {
  // Greek headers: the file goes to the accountant's Excel, not to a machine.
  // Blank (not 0) for a price nobody entered — DESIGN.md #3 holds in exports too.
  const rows = [['Αρ. παραγγελίας','Τύπος','Πελάτης','Διαδρομή','Ημέρες από παράδοση','Παλέτες','Τιμή','Καθαρή τιμή','Αρ. τιμολογίου','Ημ. τιμολογίου','Δελτία PE','Κατάσταση']];
  INV.filtered.forEach(r => {
    rows.push([
      _invOrderNo(r),
      _invTypeLabel(r),
      _invClientName(r),
      _invRoute(r).replace(/,/g, ' '),
      _invDaysSinceDelivery(r) ?? '',
      _invPallets(r),
      _invPrice(r) ?? '',
      _invNetPrice(r) ?? '',
      r.fields['Invoice Number'] || '',
      r.fields['Invoice Date'] || '',
      _invPESheetsOK(r) ? 'Εντάξει' : 'Λείπουν',
      _invIsInvoiced(r) ? 'Τιμολογημένη' : _invIsBlocked(r) ? 'Μπλοκαρισμένη' : 'Έτοιμη',
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `invoicing_${localToday()}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('Το CSV εξήχθη');
}

// ─── Bulk PDF Export (for accountant) ───────────────
// The report opens in a bare window with no style.css, so `var(--navy-mid)`
// and `var(--accent)` there resolved to nothing (header bar and totals
// printed colourless). Copy the live token values across instead of writing
// hex here: one home per colour (DESIGN.md #1), and the report follows the
// app's palette without a second list to keep in sync.
function _invTokenCSS() {
  const cs = getComputedStyle(document.documentElement);
  const names = ['--surface-card','--surface-page','--surface-sunken','--surface-dark',
                 '--text','--text-mid','--text-on-dark','--border','--accent','--accent-hover'];
  return ':root{' + names.map(n => `${n}:${cs.getPropertyValue(n).trim()}`).join(';') + '}';
}

function _invExportPDF() {
  const list = INV.filtered;
  if (!list.length) { toast('Δεν υπάρχουν εγγραφές για εξαγωγή', 'error'); return; }

  const tabLabel = ({ ready:'Έτοιμες', overdue:'Καθυστερημένες', blocked:'Μπλοκαρισμένες', invoiced:'Τιμολογημένες', all:'Όλες' })[_invFilters.tab] || 'Όλες';
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
      <td>${_invTypeLabel(r)}</td>
      <td>${_invClientName(r)}</td>
      <td>${escapeHtml(_invRoute(r))}</td>
      <td style="text-align:center">${dtStr}</td>
      <td style="text-align:right">${_invPalletsDisplay(r)}</td>
      <td style="text-align:right">${_fmtEuro(_invPrice(r))}</td>
      <td style="text-align:right">${_fmtEuro(_invNetPrice(r))}</td>
      <td>${escapeHtml(f['Invoice Number']||'—')}</td>
      <td style="text-align:center">${escapeHtml(f['Invoice Date']||'—')}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8">
    <title>Αναφορά τιμολόγησης — ${tabLabel} — ${today}</title>
    <style>
      ${_invTokenCSS()}
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;color:var(--text);background:var(--surface-card);padding:20px;font-variant-numeric:tabular-nums}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--surface-dark);padding-bottom:12px;margin-bottom:16px}
      .hdr h1{font-size:18px;font-weight:700;color:var(--surface-dark)}
      .hdr .meta{font-size:11px;color:var(--text-mid);text-align:right}
      .stats{display:flex;gap:24px;margin-bottom:12px;padding:8px 12px;background:var(--surface-sunken);border-radius:6px}
      .stat{font-size:11px}
      .stat b{display:block;font-size:14px;color:var(--surface-dark)}
      table{width:100%;border-collapse:collapse;font-size:11px}
      thead th{background:var(--surface-dark);color:var(--text-on-dark);padding:4px 8px;text-align:left;font-weight:600}
      tbody td{padding:4px 8px;border-bottom:1px solid var(--border)}
      tbody tr:nth-child(even){background:var(--surface-page)}
      tfoot td{padding:8px;font-weight:700;background:var(--surface-sunken);border-top:2px solid var(--surface-dark)}
      .pbar{position:fixed;top:0;left:0;right:0;background:var(--surface-dark);color:var(--text-on-dark);padding:8px 20px;display:flex;justify-content:space-between;align-items:center}
      .pbar button{background:var(--accent);color:var(--surface-card);border:none;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer}
      .pbar button:hover{background:var(--accent-hover)}
      .body-wrap{margin-top:48px}
      @media print {
        .pbar{display:none}
        .body-wrap{margin-top:0}
        body{padding:10px}
        @page{size:A4 landscape;margin:1cm}
      }
    </style></head><body>
    <div class="pbar">
      <span style="font-weight:700">Petras Group — Αναφορά τιμολόγησης</span>
      <button onclick="window.print()">Εκτύπωση / Αποθήκευση PDF</button>
    </div>
    <div class="body-wrap">
      <div class="hdr">
        <div>
          <h1>Αναφορά τιμολόγησης</h1>
          <div style="font-size:11px;color:var(--text-mid);margin-top:4px">Καρτέλα: ${tabLabel}</div>
        </div>
        <div class="meta">
          <div><b>Ημερομηνία:</b> ${today}</div>
          <div><b>Εγγραφές:</b> ${sorted.length}</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><b>${sorted.length}</b>Παραγγελίες</div>
        <div class="stat"><b>${totalPallets}</b>Σύνολο παλετών</div>
        <div class="stat"><b>${_fmtEuro(totalPrice)}</b>Μικτός τζίρος</div>
        <div class="stat"><b>${_fmtEuro(totalNet)}</b>Καθαρός τζίρος</div>
      </div>
      <table>
        <thead><tr>
          <th>Αρ. παραγγελίας</th><th>Τύπος</th><th>Πελάτης</th><th>Διαδρομή</th>
          <th style="text-align:center">Παράδοση</th>
          <th style="text-align:right">Παλέτες</th>
          <th style="text-align:right">Τιμή</th>
          <th style="text-align:right">Καθαρή</th>
          <th>Αρ. τιμ.</th><th style="text-align:center">Ημ. τιμ.</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="5">ΣΥΝΟΛΟ</td>
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
      ? _invBadge('Τιμολογημένη', 'var(--ok)')
      : _invBadge('Εκκρεμεί', 'var(--text)', { border: 'var(--border-dark)' });

    return `<tr>
      <td style="padding:4px 8px;${_INV_NUM}color:var(--text)">${escapeHtml(_invOrderNo(r))}</td>
      <td style="padding:4px 8px">${_invTypeBadge(r)}</td>
      <td style="padding:4px 8px;${_INV_NUM}white-space:nowrap">${dtStr}</td>
      <td style="padding:4px 8px">${_invBadge(bucket.label, bucket.color)}</td>
      <td style="padding:4px 8px;text-align:right;${_INV_NUM}white-space:nowrap">${_fmtEuro(_invPrice(r))}</td>
      <td style="padding:4px 8px;${_INV_NUM}">${escapeHtml(f['Invoice Number']||'—')}</td>
      <td style="padding:4px 8px">${statusBadge}</td>
    </tr>`;
  }).join('');

  const mini = (label, value, sub, color) => `
    <div style="padding:8px 12px;background:var(--surface-card);border-radius:6px;border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text-mid);text-transform:uppercase;letter-spacing:0.5px">${label}</div>
      <div style="font-size:18px;font-weight:700;color:${color || 'var(--text)'};${_INV_NUM}">${value}</div>
      ${sub ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px;${_INV_NUM}">${sub}</div>` : ''}
    </div>`;
  const TH = 'padding:8px 12px;font-size:11px;';

  const MT = 'padding:4px 8px;';
  openModal(`Ιστορικό — ${clientName}`, `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
      ${mini('Σύνολο', orders.length)}
      ${mini('Τιμολογημένες', invoicedCount, '', invoicedCount ? 'var(--ok)' : 'var(--text-dim)')}
      ${mini('Εκκρεμείς', pendingCount, pendingCount ? _fmtEuro(pendingTotal) : '', pendingCount ? 'var(--warn)' : 'var(--text-dim)')}
      ${mini('Συνολικός τζίρος', _fmtEuro(totalPrice))}
    </div>
    <div style="max-height:50vh;overflow:auto">
      <table style="width:100%">
        <thead><tr>
          <th style="${MT}font-size:11px">Αρ. παραγγελίας</th><th style="${MT}font-size:11px">Τύπος</th><th style="${MT}font-size:11px">Παράδοση</th><th style="${MT}font-size:11px">Ηλικία</th>
          <th style="${MT}font-size:11px;text-align:right">Τιμή</th><th style="${MT}font-size:11px">Αρ. τιμ.</th><th style="${MT}font-size:11px">Κατάσταση</th>
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
    target.innerHTML = '<span style="color:var(--warn);font-size:11px">δεν φόρτωσε — δεν σημαίνει μηδέν</span>';
    return;
  }

  const key = _invRawClientName(clientId).toLowerCase();
  const rec = key ? INV.balances[key] : null;
  if (!rec) {
    // Absent from the view = no pl_movements row for this client at all yet
    // (genuinely "no history") OR the name didn't match (see matching
    // weakness above) — those two cases are indistinguishable from here,
    // so this is deliberately NOT shown as "0" either.
    target.innerHTML = '<span style="color:var(--text-dim);font-size:11px">χωρίς κινήσεις</span>';
    return;
  }

  const balance = Number(rec.balance) || 0;
  const color = balance > 0 ? 'var(--ok)' : balance < 0 ? 'var(--warn)' : 'var(--text-dim)';
  const sign = balance > 0 ? '+' : '';
  const label = balance > 0 ? '(μας οφείλει)' : balance < 0 ? '(τους οφείλουμε)' : '(μηδέν)';
  const pending = rec.pending_count ? `<span style="color:var(--warn);font-size:11px;margin-left:4px">· ${rec.pending_count} εκκρεμή</span>` : '';
  target.innerHTML = `<span style="color:${color};font-weight:600">${sign}${balance}</span> <span style="color:var(--text-dim);font-size:11px">${label}</span>${pending}`;
}
