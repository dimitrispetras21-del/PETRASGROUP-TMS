// ═══════════════════════════════════════════════════════════
// MODULE — ΠΑΛΕΤΕΣ (pl_movements via the Worker's /pallets/*)
// Redesign 10/2026 (Υ3, owner-approved Figma 28/10, page «Παλέτες · Redesign 10/2026», frames N01–N18):
//   Προς ενέργεια (Εκκρεμείς N01 · Χωρίς πλήρη επιστροφή N03) · Εβδομάδα (modules/pallets_week.js, live 3/11) ·
//   Κινήσεις (N04–N06) · Υπόλοιπα (N07/N08) · καρτέλα (N09/N10) + A4 (N09b) · πάνελ κίνησης με ιστορικό (N11h/N18) ·
//   επιβεβαίωση (N12) · διορθώσεις (N14a/b) · νέα κίνηση (N15) · κενά/σφάλματα/ρόλοι/εξαγωγή (N16).
// Every write goes through the same few cores as before (plvConfirmCore, plvFixCore, POST /pallets/movements,
// DELETE, /reverse): the redesign changed what the page shows, not how it writes (principle 3).
// Tokens only, tabular numbers (DESIGN.md).
// ═══════════════════════════════════════════════════════════
'use strict';

// tab: action | week | moves | bal. act: pending | noreturn. The old tab ids (pending, noreturn, all, clients,
// partners) still open the matching view: pallets_week.js «N κινήσεις →» calls plvTab('all').
const PLV = { movements: [], lookups: null, balances: { clients: null, partners: null },
  tab: 'action', act: 'pending', balKind: 'clients', busy: false, q: '', from: '', to: '', period: 'all',
  groupBy: 'client', open: {}, more: false, sched: false, zeroOpen: false,
  orderById: null, enrichFail: false, cut: null, loadErr: null, card: null };

// Write gate (13/9, Thodoris go-live audit). Unchanged by the redesign (role changes = owner first, 10/10):
// writes for whoever has costs or orders «full» (dispatchers correct feed movements, owner 23/8), «Νέα κίνηση»
// only for costs «full». Management reads (PL_PERMS, owner 24/8): no write button is drawn for it (N16 Ε).
function _plvCanWrite() { return typeof can !== 'function' || can('costs') === 'full' || can('orders') === 'full'; }
function _plvCanNew() { return typeof can !== 'function' || can('costs') === 'full'; }
function _plvBlockReadOnly() {
  if (_plvCanWrite()) return false;
  toast('Μόνο ανάγνωση για τον ρόλο σου', 'warn');
  return true;
}

// A list the Worker cut is said on screen, never shown as complete (principle 1). The Worker reads every row in
// pages and answers truncated + cap; the balances come from the views and are never cut. An answer without
// «truncated» (an older Worker) that stops at 300 rows is read as cut.
function _plvCut(res) {
  const n = (res.records || []).length;
  if (res.truncated === undefined) return n >= 300 ? { n, cap: 300, cut: true } : null;
  if (res.truncated) return { n, cap: res.cap, cut: true };
  return res.cap && n >= res.cap * 0.9 ? { n, cap: res.cap, cut: false } : null;
}
function _plvCutText(cut, inCard) {
  if (!cut) return '';
  return !cut.cut
    ? `⚠ ${cut.n} κινήσεις, κοντά στο όριο των ${cut.cap} της λίστας: ζήτησε αύξηση`
    : inCard
      ? `⚠ εμφανίζονται οι ${cut.n} νεότερες κινήσεις: το τρεχούμενο δεν ξεκινά από την αρχή (το υπόλοιπο είναι σωστό)`
      : `⚠ εμφανίζονται οι ${cut.n} νεότερες κινήσεις: οι παλαιότερες λείπουν από τη λίστα (όχι από τα υπόλοιπα)`;
}
function _plvCutNote(cut, inCard) {
  return cut ? `<span style="color:var(--warn)">${_plvCutText(cut, inCard)}</span>` : '';
}

async function renderPalletLedger() {
  const c = document.getElementById('content');
  // Full bleed (N01: the bar spans the page, as Έξοδα / Μισθοδοσία do); the router puts the padding back on leave.
  c.style.padding = '0'; c.style.overflow = '';
  if (!PLV.movements.length && !PLV.loadErr) c.innerHTML = `${_PLV_STYLE}<div class="plv-page"><div class="plv-empty">Φόρτωση κινήσεων παλετών...</div></div>`;
  try {
    const [mv, lk, bc, bp] = await Promise.all([
      plFetch('/pallets/movements'),
      PLV.lookups ? Promise.resolve(PLV.lookups) : plFetch('/pallets/lookups'),
      plFetch('/pallets/balances?type=clients'),
      plFetch('/pallets/balances?type=partners')
    ]);
    PLV.movements = mv.records || [];
    PLV.cut = _plvCut(mv);
    PLV.lookups = lk;
    PLV.balances.clients = bc.records || [];
    PLV.balances.partners = bp.records || [];
    PLV.loadErr = null;
  } catch (e) {
    // Failure is NOT emptiness (N16 Δ): the page keeps its bar and says what did not come, never «0 κινήσεις».
    PLV.movements = []; PLV.loadErr = _plvErrMsg(e);
    _plvDraw();
    return;
  }
  // Enrichment outside the try above: its failure never empties the page — rows show without the order's
  // fields and the bar of N16 Γ says what search cannot find meanwhile.
  await _plvEnrich();
  if (PLV.card) return plvDrill(PLV.card.kind, PLV.card.id);
  _plvDraw();
}

/* The movement carries order_id as a pg bigint, the facade speaks recXXX. The only pg-id ↔ rec bridge without a
   new endpoint is /pallets/gate (order_rec + order_id per order): it gets every rec of the (2-minute cached) ORDERS
   list in batches of 250 — not one request per movement. Plates and partners from the preloaded reference cache. */
async function _plvEnrich() {
  PLV.enrichFail = false;
  try {
    const orders = await atGetAll(TABLES.ORDERS, {}, true);
    const byRec = {};
    orders.forEach(o => { byRec[o.id] = o; });
    const recs = Object.keys(byRec);
    const idMap = {};
    for (let i = 0; i < recs.length; i += 250) {
      const g = await plFetch('/pallets/gate?order_recs=' + recs.slice(i, i + 250).join(','));
      (g.records || []).forEach(r => { if (byRec[r.order_rec]) idMap[r.order_id] = byRec[r.order_rec]; });
    }
    PLV.orderById = idMap;
  } catch (e) {
    console.warn('[pallet-ledger] enrichment failed:', e && e.message);
    PLV.orderById = {};
    PLV.enrichFail = true;
  }
}
async function plvRetryEnrich() { await _plvEnrich(); _plvDraw(); }

// The browser's own wording for a dead network is "Failed to fetch": the page translates where it speaks.
function _plvErrMsg(e) {
  const m = (e && e.message) || '';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'δεν υπήρξε απάντηση από τον διακομιστή (δίκτυο ή διακομιστής εκτός)';
  return m || 'άγνωστο σφάλμα';
}

// The name comes embedded with /pallets/movements (PostgREST join); lookups only as a fallback, since they stop at
// 1000 rows and left later clients as «Πελάτης #1314» (12/8).
function _plvName(m) {
  if (m.counterparty_type === 'CLIENT') {
    if (m.clients && m.clients.company_name) return m.clients.company_name;
    const cl = ((PLV.lookups && PLV.lookups.clients) || []).find(x => x.id === m.client_id);
    return cl ? cl.company_name : ('Πελάτης #' + m.client_id);
  }
  if (m.partners && m.partners.company_name) return m.partners.company_name;
  const p = ((PLV.lookups && PLV.lookups.partners) || []).find(x => x.id === m.partner_id);
  return p ? p.company_name : ('Συνεργάτης #' + m.partner_id);
}
function _plvLoc(m) {
  if (m.locations && m.locations.name) return m.locations.name;
  const l = ((PLV.lookups && PLV.lookups.locations) || []).find(x => x.id === m.location_id);
  return l ? l.name : '';
}
// «Stubenberg, AT» under the point (N01). City and country come only when the Worker embeds them
// (locations(name,city,country), the Υ4 Worker chain); until then the line is simply not drawn, never «—».
function _plvPlace(m) {
  const l = m.locations || {};
  return [l.city, l.country].filter(Boolean).join(', ');
}
// The stop's pallets and how many of them were exchanged (N01 «30 παλ. · 22 με ανταλλαγή»). Embedded by the Worker
// (order_stops(pallets,pallets_exchanged), Υ4 chain); pallets_exchanged is written from Υ6 on. Absent = not drawn.
function _plvStop(m) {
  const s = m.order_stops;
  if (!s || s.pallets == null) return null;
  return { pal: Number(s.pallets), ex: s.pallets_exchanged != null ? Number(s.pallets_exchanged) : null };
}
// dd/mm/yyyy on screen and in the CSV (N16 ΣΤ: «ό,τι βλέπεις … dd/mm/yyyy»). Full year since 16/9 (w8 P6).
function _plvFmtDate(d) {
  if (!d) return '';
  const p = String(d).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d;
}
function _plvFmtTime(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const p2 = n => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
function _plvToday() { return typeof localToday === 'function' ? localToday() : new Date().toISOString().slice(0, 10); }
function _plvDays(from, to) {
  return Math.round((Date.parse(String(to).slice(0, 10) + 'T00:00:00Z') - Date.parse(String(from).slice(0, 10) + 'T00:00:00Z')) / 864e5);
}
// A balance as the frames write it: +33, −52, 0.
function _plvSigned(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }
// A known zero is faint, never «—» (taken/given are NOT NULL DEFAULT 0): «—» is kept for «does not count».
function _plvN(n) { return n ? String(n) : '<span class="plv-zero">0</span>'; }

// Status as a plain word (frames N04/N09): a pending movement dated after today is «προγραμματισμένη».
function _plvStatus(m) {
  if (m.status === 'confirmed') return 'οριστική';
  if (m.status === 'reversed') return 'αντιλογισμένη';
  return String(m.movement_date) > _plvToday() ? 'προγραμματισμένη' : 'εκκρεμής';
}

const PLV_EVENT_GR = {
  LOADING: 'Φόρτωση', DELIVERY: 'Παράδοση', PARTNER_PICKUP: 'Παραλαβή από συνεργάτη',
  PARTNER_DROPOFF: 'Παράδοση από συνεργάτη', RETURN_OUT: 'Επιστροφή αδειών',
  RETURN_IN: 'Παραλαβή αδειών', ADJUSTMENT: 'Τακτοποίηση'
};

// Order's fields per row (Reference, vehicle, driver, week) — from _plvEnrich; empty until it comes, never «—».
// Cached per movement object and per enrichment (each row reads it 3–5 times; a new enrichment = a new map).
const _plvExtras = new WeakMap();
function _plvRowExtras(m) {
  const hit = _plvExtras.get(m);
  if (hit && hit.of === PLV.orderById) return hit.v;
  const v = _plvRowExtrasRaw(m);
  _plvExtras.set(m, { of: PLV.orderById, v });
  return v;
}
function _plvRowExtrasRaw(m) {
  const o = (PLV.orderById || {})[m.order_id];
  if (!o) return { ref: '', carrier: '', plate: '', partner: '', driver: '', week: null };
  const f = o.fields;
  let plate = '', partner = '';
  if (f['Is Partner Trip']) {
    const pid = getLinkedId(f['Partner']);
    const p = pid ? getRefPartners().find(x => x.id === pid) : null;
    partner = (p && p.fields['Company Name']) || 'συνεργάτης';
    plate = f['Partner Truck Plates'] || '';
  } else {
    plate = getTruckPlate(getLinkedId(f['Truck'])) || '';
  }
  // Raw driver name, not getDriverName: that one escapes HTML and the search needs plain text.
  const did = getLinkedId(f['Driver']);
  const d = did ? getRefDrivers().find(x => x.id === did) : null;
  return { ref: f['Reference'] || '', carrier: [partner, plate].filter(Boolean).join(' · '), plate, partner,
    driver: (d && d.fields['Full Name']) || '', week: f['Week Number'] || null };
}
// The vehicle cell (N01 «IAB 1096 / Ν. Παπαδόπουλος»): own truck → plate + driver; partner trip → its plates + the
// partner. Nothing known (no order, or the enrichment failed) → an empty cell, never a guess.
function _plvVeh(m) {
  const x = _plvRowExtras(m);
  return { plate: x.plate, who: x.partner || x.driver };
}

// The order's own number (owner 27/10: «αρκεί ο αριθμός παραγγελίας #385, ένας ανά φορτίο»): orders.id, carried
// by every feed movement, so it shows without the enrichment and even when that fails.
function _plvNo(m) { return m.order_id ? '#' + m.order_id : ''; }
function _plvLabel(m) { return _plvNo(m) || m.code || ('PM-' + m.id); }

/* ── Search: «#385» is one order exactly; every other word is a substring of the row's blob, and several words
   must all match (N00 #7: «Παπαδόπουλος w43»). The blob: number, PM code, party, point, notes, Reference, vehicle,
   driver (Latin + Greek through fhSearchBlob, Pantelis 21/10), both weeks (order's and movement's: a delivery can
   fall a week after the loading) and the date in ISO, dd/mm/yyyy and dd/mm/yy. Built once per movement object. ── */
const _plvBlobs = new WeakMap();
function _plvSearchText(m) {
  const hit = _plvBlobs.get(m);
  if (hit != null) return hit;
  const x = _plvRowExtras(m);
  const gr = _plvFmtDate(m.movement_date);
  const mw = typeof TmsWeek !== 'undefined' ? TmsWeek.numOf(m.movement_date) : null;
  const blob = fhSearchBlob([_plvNo(m), m.code, _plvName(m), _plvLoc(m), _plvPlace(m), m.notes || '', x.ref, x.carrier, x.driver,
    x.week ? 'w' + x.week : '', mw ? 'w' + mw : '',
    m.movement_date || '', gr, gr.replace(/\/20(\d\d)$/, '/$1')]);
  _plvBlobs.set(m, blob);
  return blob;
}
function _plvMatch(m, raw) {
  return raw.split(/\s+/).filter(Boolean).every(t => /^#\d+$/.test(t)
    ? m.order_id === parseInt(t.slice(1), 10)
    : _plvSearchText(m).includes(fhSearchNorm(t)));
}
function _plvQ(rows) { const raw = PLV.q.trim(); return raw ? rows.filter(m => _plvMatch(m, raw)) : rows; }
// Which week matched (N04 «w43 παραγγ. / w43 κίνησης / w43 και τα δύο»): drawn only while the search has a week.
function _plvWeekTag(m) {
  const w = (PLV.q.match(/(?:^|\s)w(\d{1,2})(?=\s|$)/i) || [])[1];
  if (!w) return '';
  const ow = String(_plvRowExtras(m).week || '') === String(+w);
  const mw = typeof TmsWeek !== 'undefined' && String(TmsWeek.numOf(m.movement_date)) === String(+w);
  return ow && mw ? `w${+w} και τα δύο` : ow ? `w${+w} παραγγ.` : mw ? `w${+w} κίνησης` : '';
}

/* ── The rows of each view, ONE definition each: the bar's counters, the lists, the wizard and the CSV read these. */
function _plvLive(m) { return m.status !== 'reversed'; }
function _plvPendDue() { const t = _plvToday(); return PLV.movements.filter(m => m.status === 'pending' && String(m.movement_date) <= t); }
function _plvPendSched() { const t = _plvToday(); return PLV.movements.filter(m => m.status === 'pending' && String(m.movement_date) > t); }
function _plvNoRet() { return PLV.movements.filter(m => m.status === 'confirmed' && m.event_type === 'DELIVERY' && m.given > m.taken); }
function _plvNoReturnCount() { return _plvNoRet().length; }
// Period of «Κινήσεις» (N04 «Όλη η περίοδος», N05 «01/10 – 31/10/2026»): all, a month «YYYY-MM», or a range.
const PLV_MONTH_ACC = ['Ιανουάριο', 'Φεβρουάριο', 'Μάρτιο', 'Απρίλιο', 'Μάιο', 'Ιούνιο', 'Ιούλιο', 'Αύγουστο', 'Σεπτέμβριο', 'Οκτώβριο', 'Νοέμβριο', 'Δεκέμβριο'];
const PLV_MONTH_NOM = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
function _plvPeriod() {
  if (/^\d{4}-\d{2}$/.test(PLV.period)) {
    const [y, mo] = PLV.period.split('-').map(Number);
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { from: PLV.period + '-01', to: PLV.period + '-' + String(last).padStart(2, '0'), mo };
  }
  if (PLV.period === 'custom' && (PLV.from || PLV.to)) return { from: PLV.from, to: PLV.to, mo: null };
  return null;
}
function _plvMoveRows() {
  let r = PLV.movements.filter(_plvLive);
  const p = _plvPeriod();
  if (p && p.from) r = r.filter(m => m.movement_date >= p.from);
  if (p && p.to) r = r.filter(m => m.movement_date <= p.to);
  return _plvQ(r);
}
function _plvRows() {
  if (PLV.tab === 'action') return _plvQ(PLV.act === 'noreturn' ? _plvNoRet() : PLV.movements.filter(m => m.status === 'pending'));
  if (PLV.tab === 'moves') return _plvMoveRows();
  return [];
}

// Balance of one party from the views (pl_v_balance_*), the one source of every balance on the page.
function _plvBal(kind, id) {
  const k = kind === 'clients' ? 'client_id' : 'partner_id';
  const b = (PLV.balances[kind] || []).find(x => x[k] === id);
  return b ? b.balance : null;
}
function _plvBalOfMove(m) { return m.counterparty_type === 'CLIENT' ? _plvBal('clients', m.client_id) : _plvBal('partners', m.partner_id); }
// «Μετά την επιβεβαίωση: Berger Obst KG: −52 → −69» (N11h, N12, N14a/b, N15). delta = the change to given − taken.
function _plvAfter(m, delta) {
  const b = _plvBalOfMove(m);
  if (b == null) return '';
  return `${escapeHtml(_plvName(m))}: ${_plvSigned(b)} → ${_plvSigned(b + delta)}`;
}
function _plvClientTotals() {
  const rows = PLV.balances.clients || [];
  const owed = rows.filter(b => b.balance > 0), owe = rows.filter(b => b.balance < 0);
  const a = owed.reduce((s, b) => s + b.balance, 0), o = -owe.reduce((s, b) => s + b.balance, 0);
  return { owed: a, owe: o, net: a - o };
}

/* ── Filters. A partial render (only the list and the counter): a full redraw rebuilds the search input, which
   loses focus on every key — «elita» became «e» (audit 25/8). ── */
function plvFilter(key, val) {
  PLV[key] = val;
  const body = document.getElementById('plvBody');
  if (key === 'q' && body && (PLV.tab === 'action' || PLV.tab === 'moves')) {
    body.innerHTML = _plvBodyHtml();
    const cnt = document.getElementById('plvCount');
    if (cnt) cnt.innerHTML = _plvCountHtml();
    const sub = document.querySelector('.plv-sub');
    if (sub) sub.textContent = _plvSubtitle();
    const x = document.getElementById('plvQClear');
    if (x) x.style.display = PLV.q ? '' : 'none';
    const k = document.getElementById('plvQKey');
    if (k) k.textContent = PLV.q ? 'Esc' : '/';
  } else _plvDraw();
}
function plvClearQ() {
  PLV.q = '';
  const i = document.getElementById('plvQ');
  if (i) { i.value = ''; i.focus(); }
  plvFilter('q', '');
}
function plvPeriod(v) {
  PLV.period = v;
  if (v !== 'custom') { PLV.from = ''; PLV.to = ''; }
  _plvDraw();
}
function plvGroupBy(mode) { PLV.groupBy = mode; PLV.open = {}; _plvDraw(); }
function plvAct(a) { PLV.tab = 'action'; PLV.act = a; PLV.card = null; PLV.more = false; _plvDraw(); }
function plvBalKind(k) { PLV.balKind = k; PLV.zeroOpen = false; _plvDraw(); }
function plvToggle(key) { PLV.open[_plvOpenKey(key)] = !_plvIsOpen(key); _plvRedrawBody(); }
// Fold state per view: closing Berger in Εκκρεμείς must not hide Berger in Κινήσεις.
function _plvOpenKey(key) { return (PLV.tab === 'action' ? PLV.act : PLV.tab + PLV.groupBy) + ':' + key; }
function plvMore() { PLV.more = !PLV.more; _plvRedrawBody(); }
function plvSched() { PLV.sched = !PLV.sched; _plvRedrawBody(); }
function plvZero() { PLV.zeroOpen = !PLV.zeroOpen; _plvRedrawBody(); }
function _plvRedrawBody() { const b = document.getElementById('plvBody'); if (b) b.innerHTML = _plvBodyHtml(); else _plvDraw(); }
// Groups start open (the accountant must see rows without a click, Figma 2/9); what the user closes stays closed
// while she stays on the page; an active search opens every group.
function _plvIsOpen(key) { const k = _plvOpenKey(key); return PLV.q ? true : PLV.open[k] !== undefined ? PLV.open[k] : true; }

const PLV_TAB_ALIAS = { pending: ['action', 'pending'], noreturn: ['action', 'noreturn'], all: ['moves'], clients: ['bal', 'clients'], partners: ['bal', 'partners'] };
function plvTab(t) {
  const a = PLV_TAB_ALIAS[t];
  PLV.tab = a ? a[0] : t;
  if (a && a[0] === 'action') PLV.act = a[1];
  if (a && a[0] === 'bal') PLV.balKind = a[1];
  // pallets_week.js «N κινήσεις →» sets from/to before plvTab('all'): that range is the period.
  if (PLV.tab === 'moves' && (PLV.from || PLV.to)) PLV.period = 'custom';
  PLV.card = null; PLV.more = false; PLV.sched = false; PLV.zeroOpen = false;
  _plvDraw();
}

/* ── Columns. ONE definition per column: header, width, cell, CSV value. The screen and the CSV («στήλες όπως
   στην οθόνη», N16 ΣΤ) read the same list, so they cannot drift. ── */
function _plvC(key, h, w, cell, csv, cls) { return { key, h, w, cell, csv, cls: cls || '' }; }
const PLV_COL = {
  aa: () => _plvC('aa', 'Α/Α', '3%', (m, i) => `<span class="plv-aa">${i}</span>`, (m, i) => i),
  no: () => _plvC('no', 'Αρ.', '8%', m => {
    const ref = _plvRowExtras(m).ref;
    return `<b class="plv-no">${_plvNo(m) || '<span class="plv-dim">—</span>'}</b>${ref ? `<small>ref ${escapeHtml(ref)}</small>` : ''}`;
  }, m => _plvNo(m)),
  ref: () => _plvC('ref', 'Reference', '9%', m => escapeHtml(_plvRowExtras(m).ref), m => _plvRowExtras(m).ref),
  date: (h) => _plvC('date', h, '8%', m => {
    const tag = _plvWeekTag(m);
    return `${_plvFmtDate(m.movement_date)}${tag ? `<small>${escapeHtml(tag)}</small>` : ''}`;
  }, m => _plvFmtDate(m.movement_date), 'plv-nw'),
  // A pending list that is not all loadings says each row's kind under its date (header «Ημ/νία»).
  dateKind: () => _plvC('date', 'Ημ/νία', '9%', m => {
    const tag = _plvWeekTag(m) || (m.event_type !== 'LOADING' ? PLV_EVENT_GR[m.event_type] || m.event_type : '');
    return `${_plvFmtDate(m.movement_date)}${tag ? `<small>${escapeHtml(tag)}</small>` : ''}`;
  }, m => _plvFmtDate(m.movement_date), 'plv-nw'),
  pal: () => _plvC('pal', 'Παλέτες', '9%', m => {
    const s = _plvStop(m);
    if (!s) return '';
    return `${s.pal} παλ.${s.ex != null ? `<small>${s.ex} με ανταλλαγή</small>` : ''}`;
  }, m => { const s = _plvStop(m); return s ? s.pal + (s.ex != null ? ' / ' + s.ex + ' με ανταλλαγή' : '') : ''; }),
  kind: () => _plvC('kind', 'Είδος', '9%', m => escapeHtml(PLV_EVENT_GR[m.event_type] || m.event_type), m => PLV_EVENT_GR[m.event_type] || m.event_type),
  loc: () => _plvC('loc', 'Σημείο', '20%', m => {
    const n = _plvLoc(m), pl = _plvPlace(m);
    return n ? `<span class="plv-ell">${escapeHtml(n)}</span>${pl ? `<small>${escapeHtml(pl)}</small>` : ''}` : '<span class="plv-dim">—</span>';
  }, m => [_plvLoc(m), _plvPlace(m)].filter(Boolean).join(', ')),
  // «Σημείο, Πόλη CC» on one line (card N09, «Orfeas Fruits, Νάουσα GR»).
  locLine: () => _plvC('loc', 'Σημείο', '20%', m => {
    const l = m.locations || {};
    const t = [_plvLoc(m), [l.city, l.country].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return t ? `<span class="plv-ell">${escapeHtml(t)}</span>` : '<span class="plv-dim">—</span>';
  }, m => [_plvLoc(m), _plvPlace(m)].filter(Boolean).join(', ')),
  party: (h) => _plvC('party', h || 'Αντισυμβαλλόμενος', '16%', m => escapeHtml(_plvName(m)), m => _plvName(m)),
  veh: () => _plvC('veh', 'Όχημα · οδηγός', '14%', m => {
    const v = _plvVeh(m);
    return `${v.plate ? `<span class="plv-plate">${escapeHtml(v.plate)}</span>` : ''}${v.who ? `<small>${escapeHtml(v.who)}</small>` : ''}`;
  }, m => { const v = _plvVeh(m); return [v.plate, v.who].filter(Boolean).join(' · '); }),
  plate: () => _plvC('veh', 'Όχημα', '10%', m => { const v = _plvVeh(m); return v.plate ? `<span class="plv-plate">${escapeHtml(v.plate)}</span>` : ''; }, m => _plvVeh(m).plate),
  tk: () => _plvC('tk', 'Πήραμε', '6%', m => _plvN(m.taken), m => m.taken, 'plv-num'),
  gv: () => _plvC('gv', 'Δώσαμε', '6%', m => _plvN(m.given), m => m.given, 'plv-num'),
  // Καθαρό = Δώσαμε − Πήραμε (N04): positive = the client owes us. A pending row does not count: «—».
  net: () => _plvC('net', 'Καθαρό', '6%', m => m.status !== 'confirmed' ? '<span class="plv-dim">—</span>'
    : (m.given - m.taken ? `<b>${_plvSigned(m.given - m.taken)}</b>` : '<span class="plv-zero">0</span>'),
    m => m.status === 'confirmed' ? m.given - m.taken : '', 'plv-num'),
  back: () => _plvC('back', 'Δεν γύρισαν', '8%', m => `<b>${_plvSigned(m.given - m.taken)}</b>`, m => m.given - m.taken, 'plv-num'),
  note: () => _plvC('note', 'Σημείωση', '14%', m => m.notes ? `<span class="plv-ell">${escapeHtml(m.notes)}</span>` : '<span class="plv-dim">—</span>', m => m.notes || ''),
  wait: () => _plvC('wait', 'Αναμονή', '9%', m => {
    const d = _plvDays(m.movement_date, _plvToday());
    if (d < 0) return `<span class="plv-mid">σε ${-d} ${-d === 1 ? 'ημέρα' : 'ημέρες'}</span>`;
    if (d === 0) return '<span class="plv-mid">σήμερα</span>';
    return `<span class="${d > 14 ? 'plv-late-t' : 'plv-mid'}">${d} ${d === 1 ? 'ημέρα' : 'ημέρες'}</span>`;
  }, m => _plvDays(m.movement_date, _plvToday())),
  st: () => _plvC('st', 'Κατάσταση', '9%', m => `<span class="plv-mid">${_plvStatus(m)}</span>`, m => _plvStatus(m)),
  act: (pending) => _plvC('act', '', pending ? '11%' : '4%', m => {
    if (pending && m.status === 'pending' && _plvCanWrite()) return `<span class="plv-acts"><span class="plv-kbd">Enter</span><button class="plv-go" onclick="event.stopPropagation();plvOpenConfirm(${m.id})">Επιβεβαίωση</button></span><span class="plv-dots">···</span>`;
    return '<span class="plv-dots">···</span>';
  }, null, 'plv-r-act')
};
function _plvCols(view, rows) {
  const C = PLV_COL;
  const pal = rows.some(_plvStop) ? [C.pal()] : [];   // a column with no value anywhere is not drawn (Υ4 embed)
  if (view === 'pending') {
    const allLoad = rows.every(m => m.event_type === 'LOADING');
    return [C.aa(), C.no(), allLoad ? C.date('Φόρτωση') : C.dateKind(), ...pal, C.loc(), C.veh(), C.tk(), C.gv(), C.wait(), C.act(true)];
  }
  if (view === 'noreturn') return [C.aa(), C.no(), C.date('Παράδοση'), C.loc(), C.veh(), C.tk(), C.gv(), C.back(), C.note(), C.act(false)];
  // moves: the column the group header already says gives way to the other dimension (N05: by point → client)
  if (PLV.groupBy === 'location') return [C.aa(), C.no(), C.date('Ημ/νία'), C.kind(), C.party('Πελάτης'), C.veh(), C.tk(), C.gv(), C.net(), C.st(), C.act(false)];
  if (PLV.groupBy === 'none') return [C.aa(), C.no(), C.date('Ημ/νία'), C.kind(), C.party(), C.loc(), C.veh(), C.tk(), C.gv(), C.net(), C.st(), C.act(false)];
  return [C.aa(), C.no(), C.date('Ημ/νία'), C.kind(), C.loc(), C.veh(), C.tk(), C.gv(), C.net(), C.st(), C.act(false)];
}
const _plvColgroup = cols => `<colgroup>${cols.map(c => `<col style="width:${c.w}">`).join('')}</colgroup>`;
function _plvHeadTbl(cols) {
  return `<table class="plv-t plv-th">${_plvColgroup(cols)}<tr>${cols.map(c => `<th class="${c.cls}">${c.h}</th>`).join('')}</tr></table>`;
}
// A row: click = panel, Enter = confirm on a pending row (N01), else panel. Red bar: pending over 14 days.
function _plvRowHtml(cols, m, i) {
  const late = m.status === 'pending' && _plvDays(m.movement_date, _plvToday()) > 14;
  return `<tr class="plv-r${late ? ' plv-late' : ''}" tabindex="0" data-id="${m.id}" onclick="plvRowClick(event,${m.id})" onkeydown="plvRowKey(event,${m.id})">${cols.map(c => `<td class="${c.cls}">${c.cell(m, i)}</td>`).join('')}</tr>`;
}
// A footer row: the label sits in the point column (as in N01/N03/N04), the sums in their own columns.
function _plvFootHtml(cols, label, sums, cls) {
  let labelAt = cols.findIndex(c => c.key === 'loc');
  if (labelAt < 0) labelAt = cols.findIndex(c => c.key === 'party');
  return `<tr class="${cls || 'plv-ft'}">${cols.map((c, k) => {
    if (k === labelAt) return `<td>${label}</td>`;
    if (sums[c.key] !== undefined) return `<td class="plv-num">${sums[c.key]}</td>`;
    return '<td></td>';
  }).join('')}</tr>`;
}
function _plvTblHtml(cols, rows, start, foot) {
  return `<div class="plv-box"><table class="plv-t">${_plvColgroup(cols)}${rows.map((m, k) => _plvRowHtml(cols, m, start + k)).join('')}${foot || ''}</table></div>`;
}
function plvRowClick(ev, id) {
  if (ev.target.closest('button,a,input')) return;
  plvOpenPanel(id);
}
function plvRowKey(ev, id) {
  if (ev.key !== 'Enter' || ev.target.closest('button,a,input')) return;
  ev.preventDefault();
  const m = PLV.movements.find(x => x.id === id);
  if (m && m.status === 'pending' && _plvCanWrite()) plvOpenConfirm(id); else plvOpenPanel(id);
}

/* ── Groups by party (Προς ενέργεια): clients by their latest movement, «Συνεργάτες» after the first two clients
   (N01), «Χωρίς αντισυμβαλλόμενο» last — never hidden. Rows keep the server's order: newest first. ── */
function _plvPartyGroups(rows) {
  const g = new Map();
  for (const m of rows) {
    const k = m.counterparty_type === 'CLIENT' && m.client_id ? 'C' + m.client_id : m.counterparty_type === 'PARTNER' ? '_P' : '_N';
    if (!g.has(k)) g.set(k, { key: k, label: k[0] === 'C' ? _plvName(m) : k === '_P' ? 'Συνεργάτες' : 'Χωρίς αντισυμβαλλόμενο', rows: [], last: '' });
    const G = g.get(k);
    G.rows.push(m);
    if (String(m.movement_date) > G.last) G.last = String(m.movement_date);
  }
  const byLast = (a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || String(a.label).localeCompare(b.label);
  const out = [...g.values()].filter(G => G.key[0] === 'C').sort(byLast);
  const nC = out.length;
  if (g.has('_P')) out.splice(Math.min(2, nC), 0, g.get('_P'));
  if (g.has('_N')) out.push(g.get('_N'));
  return out;
}
// Groups of «Κινήσεις»: by party (every partner its own group, with its balance) or by point.
function _plvMoveGroups(rows) {
  const g = new Map();
  for (const m of rows) {
    let k, label;
    if (PLV.groupBy === 'location') {
      k = 'L' + (m.location_id || 0);
      label = m.location_id ? [_plvLoc(m), _plvPlace(m)].filter(Boolean).join(' · ') : 'Χωρίς σημείο';
    } else if (m.counterparty_type === 'CLIENT' && m.client_id) { k = 'C' + m.client_id; label = _plvName(m); }
    else if (m.counterparty_type === 'PARTNER' && m.partner_id) { k = 'P' + m.partner_id; label = _plvName(m); }
    else { k = '_N'; label = 'Χωρίς αντισυμβαλλόμενο'; }
    if (!g.has(k)) g.set(k, { key: k, label, rows: [], last: '' });
    const G = g.get(k);
    G.rows.push(m);
    if (String(m.movement_date) > G.last) G.last = String(m.movement_date);
  }
  const tail = G => G.key === '_N' || G.key === 'L0' ? 1 : 0;
  const byLast = (a, b) => tail(a) - tail(b) || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || String(a.label).localeCompare(b.label);
  return [...g.values()].sort(byLast);
}
const _plvChev = o => `<span class="plv-chev">${o ? '▾' : '▸'}</span>`;
function _plvGroupHead(G, sum) {
  const o = _plvIsOpen(G.key);
  return `<div class="plv-gh" onclick="plvToggle('${G.key}')">${_plvChev(o)}<span class="plv-gn">${escapeHtml(G.label)}</span><span class="plv-gs">${sum}</span></div>`;
}
function _plvSum(rows, f) { return rows.reduce((s, m) => s + (f(m) || 0), 0); }

/* ── The views ── */
function _plvEmptyCard(title, text, link) {
  return `<div class="plv-card">${title}<div class="plv-mid">${text}</div>${link || ''}</div>`;
}
function _plvNoMatch() {
  return _plvEmptyCard(`<b>Καμία κίνηση για «${escapeHtml(PLV.q.trim())}»</b>`,
    'Ψάχνει σε αριθμό, reference, πελάτη, σημείο, όχημα, οδηγό, εβδομάδα (w43) και ημερομηνία.',
    '<button class="plv-a" onclick="plvClearQ()">Καθαρισμός αναζήτησης</button>');
}

// The confirm wizard walks the due pending rows in the order the screen shows them, closed and hidden groups
// included (a movement does not leave the queue because it is not visible).
function _plvFlatRows() { return _plvPartyGroups(_plvQ(_plvPendDue())).flatMap(G => G.rows); }

function _plvPendingHtml() {
  const due = _plvQ(_plvPendDue()), sched = _plvQ(_plvPendSched());
  const groups = _plvPartyGroups(due);
  const cols = _plvCols('pending', due.concat(sched));
  const schedCnt = new Map();
  sched.forEach(m => { const k = m.counterparty_type === 'CLIENT' ? 'C' + m.client_id : '_P'; schedCnt.set(k, (schedCnt.get(k) || 0) + 1); });
  const searching = !!PLV.q.trim();
  let html = '';
  if (!due.length) {
    if (searching && !sched.length) html += _plvNoMatch();
    else if (!searching) {
      const s = _plvPendSched().length;
      html += _plvEmptyCard('<b class="plv-okt">✓ Όλες οι φορτώσεις έως σήμερα είναι επιβεβαιωμένες</b>',
        `Νέες εκκρεμείς έρχονται όταν αποθηκεύεται παραγγελία με ανταλλαγή.${s ? ` ${s} ${s === 1 ? 'προγραμματισμένη' : 'προγραμματισμένες'} μετά από σήμερα.` : ''}`);
    }
  } else {
    html += _plvHeadTbl(cols);
    const shown = PLV.more || searching ? groups : groups.slice(0, 3);
    let i = 1;
    shown.forEach(G => {
      const sc = schedCnt.get(G.key) || 0;
      const bal = G.key[0] === 'C' ? _plvBal('clients', +G.key.slice(1)) : null;
      const sum = G.key === '_P'
        ? ` · ${G.rows.length} ${G.rows.length === 1 ? 'κίνηση συνεργάτη, εκκρεμής' : 'κινήσεις συνεργατών, εκκρεμείς'}`
        : ` · ${G.rows.length} ${G.rows.length === 1 ? 'εκκρεμής' : 'εκκρεμείς'}${sc ? ` · ${sc} ${sc === 1 ? 'προγραμματισμένη' : 'προγραμματισμένες'}` : ''}${bal != null ? `<span class="plv-sep"></span>· υπόλοιπο ${_plvSigned(bal)}` : ''}`;
      html += _plvGroupHead(G, sum);
      if (_plvIsOpen(G.key)) html += _plvTblHtml(cols, G.rows, i, _plvFootHtml(cols, 'Σύνολο εκκρεμών', { tk: _plvSum(G.rows, m => m.taken), gv: _plvSum(G.rows, m => m.given) }));
      i += G.rows.length;
    });
    const rest = groups.slice(shown.length);
    if (rest.length) {
      const allC = rest.every(G => G.key[0] === 'C');
      const n = _plvSum(rest, G => G.rows.length);
      html += `<div class="plv-more" onclick="plvMore()">${_plvChev(false)}<span>${rest.length} ακόμη ${allC ? (rest.length === 1 ? 'πελάτης' : 'πελάτες') : (rest.length === 1 ? 'ομάδα' : 'ομάδες')} · ${n} ${n === 1 ? 'εκκρεμής' : 'εκκρεμείς'}</span><button class="plv-a">Εμφάνιση όλων</button></div>`;
    } else if (PLV.more && groups.length > 3 && !searching) {
      html += `<div class="plv-more" onclick="plvMore()">${_plvChev(true)}<span>Όλοι οι πελάτες</span><button class="plv-a">Λιγότεροι</button></div>`;
    }
  }
  if (sched.length) {
    const allL = sched.every(m => m.event_type === 'LOADING');
    html += `<div class="plv-more" onclick="plvSched()">${_plvChev(PLV.sched)}<span>Προγραμματισμένες · ${sched.length} ${allL ? (sched.length === 1 ? 'φόρτωση' : 'φορτώσεις') : (sched.length === 1 ? 'κίνηση' : 'κινήσεις')} μετά από σήμερα · δεν μετρούν στο «Θέλουν δράση»</span><button class="plv-a">${PLV.sched ? 'Απόκρυψη' : 'Εμφάνιση'}</button></div>`;
    if (PLV.sched) {
      const asc = sched.slice().sort((a, b) => (a.movement_date < b.movement_date ? -1 : a.movement_date > b.movement_date ? 1 : a.id - b.id));
      html += `<div style="margin-top:8px">${_plvTblHtml(cols, asc, 1, '')}</div>`;
    }
  }
  html += `<div class="plv-foot">Οι εκκρεμείς δεν μετρούν στο υπόλοιπο μέχρι να επιβεβαιωθούν. Κόκκινη μπάρα: πάνω από 14 ημέρες.${_plvCanWrite() ? ' Enter = Επιβεβαίωση · κλικ = λεπτομέρειες.' : ' Κλικ = λεπτομέρειες.'}</div>`;
  return html;
}

function _plvNoReturnHtml() {
  const rows = _plvRows();
  if (!rows.length) return PLV.q.trim() ? _plvNoMatch()
    : _plvEmptyCard('<b class="plv-okt">✓ Καμία παράδοση με λιγότερες άδειες από όσες δώσαμε</b>', 'Όλες οι οριστικές παραδόσεις έχουν πλήρη επιστροφή.');
  const cols = _plvCols('noreturn', rows);
  const groups = _plvPartyGroups(rows);
  const sums = r => ({ tk: _plvSum(r, m => m.taken), gv: _plvSum(r, m => m.given), back: _plvSigned(_plvSum(r, m => m.given - m.taken)) });
  let html = _plvHeadTbl(cols), i = 1;
  groups.forEach(G => {
    html += _plvGroupHead(G, ` · ${G.rows.length} ${G.rows.length === 1 ? 'παράδοση' : 'παραδόσεις'}`);
    if (_plvIsOpen(G.key)) html += _plvTblHtml(cols, G.rows, i, _plvFootHtml(cols, 'Σύνολο ομάδας', sums(G.rows)));
    i += G.rows.length;
  });
  html += `<table class="plv-t plv-grand">${_plvColgroup(cols)}${_plvFootHtml(cols, 'Γενικό σύνολο', sums(rows), 'plv-gt')}</table>`;
  html += '<div class="plv-foot">«Δεν γύρισαν» = Δώσαμε − Πήραμε: δικές μας παλέτες που κράτησε ο παραλήπτης· τις χρωστά ο πελάτης. Διόρθωση από τη γραμμή, αν το δελτίο λέει άλλα.</div>';
  return html;
}

function _plvMovesHtml() {
  const rows = _plvRows();
  if (!rows.length) return PLV.q.trim() ? _plvNoMatch()
    : _plvEmptyCard('<b>Καμία κίνηση σε αυτή την περίοδο</b>', 'Διάλεξε άλλη περίοδο ή «Όλη η περίοδος».');
  const cols = _plvCols('moves', rows);
  const p = _plvPeriod();
  const inMonth = p && p.mo ? ` τον ${PLV_MONTH_ACC[p.mo - 1]}` : '';
  const conf = r => r.filter(m => m.status === 'confirmed');
  const sums = r => ({ tk: _plvSum(conf(r), m => m.taken), gv: _plvSum(conf(r), m => m.given), net: `<b>${_plvSigned(_plvSum(conf(r), m => m.given - m.taken))}</b>` });
  if (PLV.groupBy === 'none') {
    return _plvHeadTbl(cols) + _plvTblHtml(cols, rows, 1, _plvFootHtml(cols, 'Σύνολο εμφανιζόμενων (οριστικές)', sums(rows))) + _plvMovesFoot();
  }
  const groups = _plvMoveGroups(rows);
  const one = groups.length === 1;
  let html = _plvHeadTbl(cols), i = 1;
  groups.forEach(G => {
    let bal = '';
    if (G.key[0] === 'C' || G.key[0] === 'P') {
      const b = _plvBal(G.key[0] === 'C' ? 'clients' : 'partners', +G.key.slice(1));
      if (b != null) bal = `<span class="plv-sep"></span>· υπόλοιπο ${G.key[0] === 'C' ? 'πελάτη' : 'συνεργάτη'} ${_plvSigned(b)}`;
    }
    html += _plvGroupHead(G, ` · ${G.rows.length} ${G.rows.length === 1 ? 'κίνηση' : 'κινήσεις'}${inMonth}${bal}`);
    const lbl = one ? 'Σύνολο εμφανιζόμενων (οριστικές)'
      : `Σύνολο ${PLV.groupBy === 'location' ? 'σημείου' : 'ομάδας'}${p && p.mo ? ' · ' + PLV_MONTH_NOM[p.mo - 1] : ''} (οριστικές)`;
    if (_plvIsOpen(G.key)) html += _plvTblHtml(cols, G.rows, i, _plvFootHtml(cols, lbl, sums(G.rows)));
    i += G.rows.length;
  });
  if (!one) html += `<table class="plv-t plv-grand">${_plvColgroup(cols)}${_plvFootHtml(cols, 'Σύνολο εμφανιζόμενων (οριστικές)', sums(rows), 'plv-gt')}</table>`;
  return html + _plvMovesFoot();
}
function _plvMovesFoot() {
  return '<div class="plv-foot">«Καθαρό» = Δώσαμε − Πήραμε· θετικό = μας χρωστά ο πελάτης. Οι εκκρεμείς φαίνονται, δεν αθροίζονται. «w43» = εβδομάδα παραγγελίας ή εβδομάδα κίνησης (Σάββατο–Παρασκευή). Λέξεις με κενό ψάχνονται όλες μαζί.</div>';
}

/* ── Υπόλοιπα (N07 / N08): the balance views, one row per party with an open balance or a pending movement. ── */
function _plvLastMove(kind, id) {
  const k = kind === 'clients' ? 'client_id' : 'partner_id';
  let last = '';
  for (const m of PLV.movements) if (m[k] === id && _plvLive(m) && String(m.movement_date) > last) last = String(m.movement_date);
  return last;
}
function _plvBalOpen(kind) { return (PLV.balances[kind] || []).filter(b => b.balance !== 0 || b.pending_count > 0); }
function _plvBalanceHtml() {
  const kind = PLV.balKind;
  const isC = kind === 'clients';
  const idKey = isC ? 'client_id' : 'partner_id', nameKey = isC ? 'client_name' : 'partner_name';
  const all = _plvBalOpen(kind);
  // N07: who owes us, largest first, then whom we owe, largest first (718 before 2).
  const open = all.filter(b => b.balance !== 0).sort((a, b) => (b.balance > 0) - (a.balance > 0)
    || Math.abs(b.balance) - Math.abs(a.balance) || String(a[nameKey]).localeCompare(b[nameKey]));
  const zero = all.filter(b => b.balance === 0);
  const owed = open.filter(b => b.balance > 0), owe = open.filter(b => b.balance < 0);
  const sOwed = _plvSum(owed, b => b.balance), sOwe = -_plvSum(owe, b => b.balance), net = sOwed - sOwe;
  const pend = _plvSum(all, b => b.pending_count || 0);
  const who = n => isC ? (n === 1 ? 'πελάτης' : 'πελάτες') : (n === 1 ? 'συνεργάτης' : 'συνεργάτες');
  let summary;
  if (isC) {
    const t = _plvToday();
    const cp = PLV.movements.filter(m => m.status === 'pending' && m.counterparty_type === 'CLIENT');
    const pDue = cp.filter(m => String(m.movement_date) <= t).length, pSch = cp.length - pDue;
    const pPart = PLV.movements.filter(m => m.status === 'pending' && m.counterparty_type === 'PARTNER').length;
    summary = `<div class="plv-sum">
      <div class="plv-sum-net"><span class="plv-mid">Καθαρό</span><div><b class="plv-big">${_plvSigned(net)}</b> <span class="plv-mid">παλέτες</span></div></div>
      <div><span class="plv-mid">Μας οφείλουν</span><div><b class="plv-mbig">${sOwed}</b> <small>${owed.length} ${who(owed.length)}</small></div></div>
      <div><span class="plv-mid">Οφείλουμε</span><div><b class="plv-mbig">${sOwe}</b> <small>${owe.length} ${who(owe.length)}</small></div></div>
      <div><span class="plv-mid">Εκκρεμείς εκτός υπολοίπου</span><div><b class="plv-mbig">${pDue + pSch + pPart}</b> <small>πελατών: ${pDue} έως σήμερα + ${pSch} προγραμματισμένες${pPart ? ` · +${pPart} συνεργατών` : ''}</small></div></div>
    </div>`;
  } else {
    summary = `<div class="plv-sum"><div><span class="plv-mid">Καθαρό</span><div><b class="plv-big">${_plvSigned(net)}</b> <span class="plv-mid">παλέτες${net > 0 ? ' · μας χρωστούν' : net < 0 ? ' · χρωστάμε' : ''}</span></div></div></div>`;
  }
  const cols = '<colgroup><col style="width:3%"><col style="width:45%"><col style="width:12%"><col style="width:10%"><col style="width:10%"><col style="width:16%"><col style="width:4%"></colgroup>';
  const row = (b, i) => `<tr class="plv-r" tabindex="0" onclick="plvDrill('${kind}',${b[idKey]})" onkeydown="if(event.key==='Enter')plvDrill('${kind}',${b[idKey]})">
      <td><span class="plv-aa">${i}</span></td><td>${escapeHtml(b[nameKey] || ('#' + b[idKey]))}</td>
      <td class="plv-num">${b.balance > 0 ? `<b>${b.balance}</b>` : '<span class="plv-dim">—</span>'}</td>
      <td class="plv-num">${b.balance < 0 ? `<b>${-b.balance}</b>` : '<span class="plv-dim">—</span>'}</td>
      <td class="plv-num">${_plvN(b.pending_count || 0)}</td>
      <td class="plv-nw">${_plvFmtDate(_plvLastMove(kind, b[idKey]))}</td><td class="plv-r-act"><span class="plv-dots">···</span></td></tr>`;
  const head = `<table class="plv-t plv-th">${cols}<tr><th>Α/Α</th><th>${isC ? 'Πελάτης' : 'Συνεργάτης'}</th><th class="plv-num">Μας οφείλουν</th><th class="plv-num">Οφείλουμε</th><th class="plv-num">Εκκρεμείς</th><th>Τελευταία κίνηση</th><th></th></tr></table>`;
  let body = open.map((b, k) => row(b, k + 1)).join('');
  if (zero.length) {
    body += `<tr class="plv-zrow" onclick="plvZero()"><td></td><td>${zero.length} ${who(zero.length)} με μηδενικό υπόλοιπο</td><td></td><td></td><td class="plv-num">${_plvSum(zero, b => b.pending_count || 0)}</td><td><button class="plv-a">${PLV.zeroOpen ? 'Απόκρυψη' : 'Εμφάνιση'}</button></td><td></td></tr>`;
    if (PLV.zeroOpen) body += zero.map((b, k) => row(b, open.length + k + 1)).join('');
  }
  body += `<tr class="plv-ft"><td></td><td>Σύνολο</td><td class="plv-num">${sOwed}</td><td class="plv-num">${sOwe}</td><td class="plv-num">${pend}</td><td></td><td></td></tr>`;
  const empty = !all.length ? _plvEmptyCard('<b class="plv-okt">✓ Κανένα ανοιχτό υπόλοιπο</b>', `Όλα τα ισοζύγια ${isC ? 'πελατών' : 'συνεργατών'} είναι στο μηδέν.`) : '';
  return `<div class="plv-bar2"><div class="plv-seg">
      <button class="${isC ? 'on' : ''}" onclick="plvBalKind('clients')">Πελάτες <small>${_plvBalOpen('clients').length}</small></button>
      <button class="${!isC ? 'on' : ''}" onclick="plvBalKind('partners')">Συνεργάτες <small>${_plvBalOpen('partners').length}</small></button>
    </div></div>
    ${summary}
    ${empty || `${head}<div class="plv-box"><table class="plv-t">${cols}${body}</table></div>
    <table class="plv-t plv-grand">${cols}<tr class="plv-gt"><td></td><td>${isC ? 'Καθαρό (μας οφείλουν − οφείλουμε)' : 'Καθαρό'}</td><td></td><td class="plv-num">${_plvSigned(net)}</td><td></td><td></td><td></td></tr></table>`}
    <div class="plv-foot">${isC ? 'Μόνο οριστικές κινήσεις· οι εκκρεμείς μετρούν χωριστά.' : 'Ο συνεργάτης είναι απευθείας αντισυμβαλλόμενος. Θετικό = μας χρωστά.'} Κλικ στη γραμμή = καρτέλα.${PLV.cut && PLV.cut.cut ? ' «Τελευταία κίνηση» από τις κινήσεις που φορτώθηκαν.' : ''}</div>`;
}

/* ── The page: one bar (title · tabs · Εξαγωγή · Νέα κίνηση, N01), the «Θέλουν δράση» line, then the view.
   The app's own top bar (bell, avatar) stays above it: moving the bar into it is the Weekly's mount, a shell change
   not asked here. ── */
const PLV_TABS = [['action', 'Προς ενέργεια'], ['week', 'Εβδομάδα'], ['moves', 'Κινήσεις'], ['bal', 'Υπόλοιπα']];
function _plvSubtitle() {
  if (PLV.card || PLV.loadErr) return '';
  if (PLV.tab === 'action') return PLV.act === 'noreturn' ? `${_plvNoReturnCount()} ${_plvNoReturnCount() === 1 ? 'παράδοση' : 'παραδόσεις'}` : `έως σήμερα ${_plvFmtDate(_plvToday())}`;
  if (PLV.tab === 'moves') return `${_plvRows().length} από ${PLV.movements.filter(_plvLive).length} κινήσεις`;
  if (PLV.tab === 'bal') return 'οριστικές κινήσεις';
  return '';
}
function _plvHeadHtml() {
  const exp = `<div class="plv-exp"><button class="plv-btn" onclick="plvExpMenu(event)">⤓ Εξαγωγή</button><div id="plvExpM" class="plv-menu" hidden></div></div>`;
  const nw = _plvCanNew() ? '<button class="plv-btn plv-btn-p" onclick="plvNewMovement()">+ Νέα κίνηση</button>' : '';
  return `<div class="plv-hd">
    <div class="plv-ttl"><h1>Παλέτες</h1><span class="plv-sub">${escapeHtml(_plvSubtitle())}</span></div>
    <nav class="plv-nav">${PLV_TABS.map(([id, l]) => `<button class="${PLV.tab === id ? 'on' : ''}" onclick="plvTab('${id}')">${l}</button>`).join('')}</nav>
    <div class="plv-hact">${exp}${nw}</div>
  </div>`;
}
function _plvNeedHtml() {
  if (PLV.tab === 'week') return '';
  const due = _plvPendDue().length, nr = _plvNoReturnCount();
  const it = (id, l, n) => {
    const on = PLV.tab === 'action' && PLV.act === id && !PLV.card;
    return `<button class="plv-need-i${on ? ' on' : ''}" onclick="plvAct('${id}')">${l} <b class="${n ? 'plv-red' : 'plv-dim'}">${n}</b>${on ? '' : ' →'}</button>`;
  };
  const t = _plvClientTotals();
  const right = PLV.tab === 'bal' && !PLV.card ? '' : `<span class="plv-need-r"><b>Πελάτες</b> <span class="plv-mid">μας οφείλουν</span> <b>${t.owed}</b> <span class="plv-dot">·</span> <span class="plv-mid">οφείλουμε</span> <b>${t.owe}</b> <span class="plv-dot">·</span> <span class="plv-mid">καθαρό</span> <b>${_plvSigned(t.net)}</b></span>`;
  return `<div class="plv-need"><span class="plv-need-l">Θέλουν δράση</span>${it('pending', 'Εκκρεμείς', due)}<span class="plv-dot">·</span>${it('noreturn', 'Χωρίς πλήρη επιστροφή', nr)}${right}</div>`;
}
// Bars under the line: read-only role (N16 Ε), the order details that did not come (N16 Γ), a cut list (Υ1).
function _plvNoticesHtml() {
  let h = '';
  if (!_plvCanWrite()) h += '<div class="plv-ro">🔒 Μόνο ανάγνωση για τον ρόλο σου.</div>';
  if (PLV.enrichFail) h += '<div class="plv-warn">⚠ Τα στοιχεία παραγγελιών δεν ήρθαν: η αναζήτηση με οδηγό, εβδομάδα ή reference δεν βρίσκει τίποτα αυτή τη στιγμή. <button class="plv-a" onclick="plvRetryEnrich()">Ξαναδοκίμασε</button></div>';
  if (PLV.cut && !PLV.card) h += `<div class="plv-warn">${escapeHtml(_plvCutText(PLV.cut, false))}</div>`;
  return h;
}
function _plvSearchHtml() {
  return `<label class="plv-q"><span class="plv-qi">⌕</span>
      <input id="plvQ" placeholder="Αναζήτηση: #αρ., οδηγός, όχημα, w43" value="${escapeHtml(PLV.q)}" oninput="plvFilter('q',this.value)" onkeydown="if(event.key==='Escape'){event.stopPropagation();plvClearQ()}">
      <span id="plvQClear" class="plv-x" onclick="plvClearQ()" title="Καθαρισμός αναζήτησης" style="display:${PLV.q ? '' : 'none'}">×</span>
      <span id="plvQKey" class="plv-kbd">${PLV.q ? 'Esc' : '/'}</span></label>`;
}
function _plvCountHtml() {
  if (PLV.tab === 'action' && PLV.act === 'pending') {
    const d = _plvPendDue().length, s = _plvPendSched().length;
    const dq = _plvQ(_plvPendDue()).length;
    return `Νεότερο πρώτα · ${PLV.q.trim() ? `${dq} από ` : ''}${d} έως σήμερα${s ? ` · ${s} ${s === 1 ? 'προγραμματισμένη' : 'προγραμματισμένες'}` : ''}`;
  }
  if (PLV.tab === 'action') { const n = _plvRows().length, t = _plvNoReturnCount(); return `Νεότερο πρώτα · ${PLV.q.trim() ? `${n} από ` : ''}${t} ${t === 1 ? 'παράδοση' : 'παραδόσεις'}`; }
  return 'Νεότερο πρώτα';
}
function _plvPeriodSel() {
  const t = _plvToday(), y = +t.slice(0, 4), mo = +t.slice(5, 7);
  const opts = [['all', 'Όλη η περίοδος']];
  for (let k = 0; k < 6; k++) {
    const d = new Date(Date.UTC(y, mo - 1 - k, 1));
    const key = d.toISOString().slice(0, 7);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    opts.push([key, `01/${key.slice(5)} – ${last}/${key.slice(5)}/${key.slice(0, 4)}`]);
  }
  opts.push(['custom', 'Από – έως…']);
  if (/^\d{4}-\d{2}$/.test(PLV.period) && !opts.some(o => o[0] === PLV.period)) opts.splice(1, 0, [PLV.period, PLV.period]);
  return `<label class="plv-per"><span class="plv-qi">▦</span><select onchange="plvPeriod(this.value)">${opts.map(([v, l]) => `<option value="${v}"${PLV.period === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    ${PLV.period === 'custom' ? `<label class="plv-date">Από <input type="date" value="${PLV.from}" onchange="plvFilter('from',this.value)"></label><label class="plv-date">Έως <input type="date" value="${PLV.to}" onchange="plvFilter('to',this.value)"></label>` : ''}`;
}
function _plvToolbarHtml() {
  if (PLV.tab === 'action') return `<div class="plv-bar2"><span id="plvCount" class="plv-mid">${_plvCountHtml()}</span><span class="plv-sp"></span>${_plvSearchHtml()}</div>`;
  if (PLV.tab === 'moves') return `<div class="plv-bar2"><div class="plv-seg">${[['client', 'Ανά πελάτη'], ['location', 'Ανά σημείο'], ['none', 'Χωρίς ομαδοποίηση']].map(([v, l]) =>
    `<button class="${PLV.groupBy === v ? 'on' : ''}" onclick="plvGroupBy('${v}')">${l}</button>`).join('')}</div>${_plvPeriodSel()}<span id="plvCount" class="plv-mid">${_plvCountHtml()}</span><span class="plv-sp"></span>${_plvSearchHtml()}</div>`;
  return '';
}
function _plvBodyHtml() {
  if (PLV.tab === 'action') return PLV.act === 'noreturn' ? _plvNoReturnHtml() : _plvPendingHtml();
  if (PLV.tab === 'moves') return _plvMovesHtml();
  if (PLV.tab === 'bal') return _plvBalanceHtml();
  return '';
}

function _plvDraw() {
  const c = document.getElementById('content');
  PLV.card = null;
  _plvKeysOn();
  if (PLV.tab === 'week' && typeof PalletsWeek !== 'undefined') {
    // The week draws itself (its own read: the Weekly's orders and trips); this page gives it the bar.
    c.innerHTML = `${_PLV_STYLE}<div class="plv-page">${_plvHeadHtml()}<div class="plv-in"><div id="plwRoot"></div></div></div><div id="plvModal"></div>`;
    PalletsWeek.render(document.getElementById('plwRoot'));
    return;
  }
  if (PLV.loadErr) {
    c.innerHTML = `${_PLV_STYLE}<div class="plv-page">${_plvHeadHtml()}<div class="plv-in">
      <div class="plv-card plv-fail"><b>Δεν φορτώθηκαν οι κινήσεις παλετών</b>
      <div class="plv-mid">Δεν σημαίνει ότι δεν υπάρχουν· απλώς δεν ήρθαν από τον διακομιστή (${escapeHtml(PLV.loadErr)}).</div>
      <button class="plv-a" onclick="renderPalletLedger()">Ξαναδοκίμασε</button></div></div></div><div id="plvModal"></div>`;
    return;
  }
  c.innerHTML = `${_PLV_STYLE}<div class="plv-page">${_plvHeadHtml()}${_plvNeedHtml()}<div class="plv-in">
    ${_plvNoticesHtml()}${_plvToolbarHtml()}<div id="plvBody">${_plvBodyHtml()}</div></div></div><div id="plvModal"></div>`;
}
// «/» focuses the search (N01 key hint). One listener for the session; it acts only while the box is on screen.
function _plvKeysOn() {
  if (PLV._keys) return;
  PLV._keys = true;
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const i = document.getElementById('plvQ');
    const a = document.activeElement;
    if (!i || (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable))) return;
    if (document.querySelector('#plvModal .plv-shell')) return;
    e.preventDefault(); i.focus();
  });
}

/* ── Εξαγωγή (N16 ΣΤ): what you see, the two balance lists, and the open card. ── */
function plvExpMenu(ev) {
  ev.stopPropagation();
  const m = document.getElementById('plvExpM');
  if (!m) return;
  if (!m.hidden) { m.hidden = true; return; }
  const it = (fn, t, s) => `<button onclick="document.getElementById('plvExpM').hidden=true;${fn}"><b>${t}</b><small>${s}</small></button>`;
  const list = (PLV.tab === 'action' || PLV.tab === 'moves') && !PLV.card;
  m.innerHTML = (list ? it('plvExportCSV()', 'Κινήσεις που βλέπεις', 'CSV · στήλες όπως στην οθόνη') : '')
    + it("plvExportBal('clients')", 'Υπόλοιπα πελατών', 'CSV')
    + it("plvExportBal('partners')", 'Υπόλοιπα συνεργατών', 'CSV')
    + (PLV.card ? it('plvStmtCSV()', 'Καρτέλα που είναι ανοιχτή', 'CSV · η εκτύπωση A4 από το «Εκτύπωση»') : '');
  m.hidden = false;
  document.addEventListener('click', () => { m.hidden = true; }, { once: true });
}
const _plvCsvEsc = v => '"' + String(v == null ? '' : csvSafeCell(v)).replace(/"/g, '""') + '"';
function _plvCsvSave(head, body, fname, cut, inCard) {
  if (cut && cut.cut) body.push(_plvCsvEsc(_plvCutText(cut, inCard)));   // the file leaves the screen and its ⚠
  // BOM: without it Excel shows Greek as garbage
  const blob = new Blob(['﻿' + [head.map(_plvCsvEsc).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  a.click(); URL.revokeObjectURL(a.href);
  toast('CSV εξήχθη ✓');
}
function plvExportCSV() {
  let rows, view;
  if (PLV.tab === 'action' && PLV.act === 'pending') { rows = _plvFlatRows().concat(_plvQ(_plvPendSched())); view = 'pending'; }
  else if (PLV.tab === 'action') { rows = _plvPartyGroups(_plvRows()).flatMap(G => G.rows); view = 'noreturn'; }
  else { rows = PLV.groupBy === 'none' ? _plvRows() : _plvMoveGroups(_plvRows()).flatMap(G => G.rows); view = 'moves'; }
  if (!rows.length) { toast('Καμία κίνηση για εξαγωγή', 'error'); return; }
  // The screen's columns, plus the party where the screen says it in the group header, and the PM code and status
  // (the accountant's sheets refer to them).
  // Reference and the note stay columns of their own in the file (P1 16/9): on screen they sit under the number.
  const cols = _plvCols(view, rows).filter(c => c.csv);
  const has = k => cols.some(c => c.key === k);
  const all = cols.slice(0, 2).concat([PLV_COL.ref()], has('party') ? [] : [PLV_COL.party()],
    cols.slice(2).filter(c => c.key !== 'st'), has('note') ? [] : [PLV_COL.note()]);
  const head = all.map(c => c.h).concat(['Κωδικός', 'Κατάσταση']);
  const body = rows.map((m, k) => all.map(c => c.csv(m, k + 1)).concat([m.code, _plvStatus(m)]).map(_plvCsvEsc).join(','));
  _plvCsvSave(head, body, 'paletes-' + _plvToday() + '.csv', PLV.cut, false);
}
function plvExportBal(kind) {
  const nameKey = kind === 'clients' ? 'client_name' : 'partner_name', idKey = kind === 'clients' ? 'client_id' : 'partner_id';
  const rows = _plvBalOpen(kind).sort((a, b) => b.balance - a.balance);
  if (!rows.length) { toast('Κανένα υπόλοιπο για εξαγωγή', 'error'); return; }
  const head = [kind === 'clients' ? 'Πελάτης' : 'Συνεργάτης', 'Μας οφείλουν', 'Οφείλουμε', 'Εκκρεμείς', 'Τελευταία κίνηση'];
  const body = rows.map(b => [b[nameKey] || ('#' + b[idKey]), b.balance > 0 ? b.balance : '', b.balance < 0 ? -b.balance : '',
    b.pending_count || 0, _plvFmtDate(_plvLastMove(kind, b[idKey]))].map(_plvCsvEsc).join(','));
  _plvCsvSave(head, body, 'ypoloipa-' + kind + '-' + _plvToday() + '.csv', null);
}

/* ── P3 (owner 16/9; kept for ONE client, owner 28/10 Ε5.5): OGL FOOD TRADE GmbH (client 837) counts pallets per
   four-month period (1/10–31/1, 1/2–31/5, 1/6–30/9). A view only: the balance never resets and nothing carries
   over. A constant here, not a column: one client, one display rule. Since Υ3 it lives in the card (N09). ── */
const PLV_QUAD_CLIENT_ID = 837;
function _plvQuad(iso) {
  if (!/^\d{4}-\d{2}/.test(String(iso))) return { key: '_NODATE', from: '', to: '' };
  const y = +String(iso).slice(0, 4), mo = +String(iso).slice(5, 7);
  let fy = y, fm, ty, tm, td;
  if (mo >= 10 || mo <= 1) { fm = 10; if (mo <= 1) fy = y - 1; ty = fy + 1; tm = 1; td = 31; }
  else if (mo <= 5) { fm = 2; ty = y; tm = 5; td = 31; }
  else { fm = 6; ty = y; tm = 9; td = 30; }
  const p2 = n => String(n).padStart(2, '0');
  const from = `${fy}-${p2(fm)}-01`;
  return { key: from, from, to: `${ty}-${p2(tm)}-${td}` };
}
function _plvQuadPrev(q) { return _plvQuad(new Date(Date.parse(q.from + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10)); }
function _plvDayBefore(iso) { return new Date(Date.parse(iso + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10); }

/* ── Καρτέλα (N09 / N10): the account of one party, oldest first, with the running balance of the confirmed
   movements (the views' formula: Σ(given − taken)); pending rows show and do not count («—»). ── */
async function plvDrill(kind, id) {
  const c = document.getElementById('content');
  const bal = (PLV.balances[kind] || []).find(b => b[kind === 'clients' ? 'client_id' : 'partner_id'] === id);
  const same = PLV.card && PLV.card.id === id && PLV.card.kind === kind;
  if (!same) {
    PLV.card = { kind, id, loading: true };
    c.innerHTML = `${_PLV_STYLE}<div class="plv-page">${_plvHeadHtml()}<div class="plv-in"><div class="plv-empty">Φόρτωση καρτέλας...</div></div></div><div id="plvModal"></div>`;
  }
  try {
    const hist = await plFetch('/pallets/movements?' + (kind === 'clients' ? 'client_id=' : 'partner_id=') + id);
    let locs = { records: [] };
    if (kind === 'clients') { try { locs = await plFetch('/pallets/balances/clients/' + id); } catch (_) { locs = null; } }
    const moves = (hist.records || []).filter(_plvLive)
      .sort((a, b) => a.movement_date === b.movement_date ? a.id - b.id : (a.movement_date < b.movement_date ? -1 : 1));
    const name = bal ? bal[kind === 'clients' ? 'client_name' : 'partner_name'] : (moves.length ? _plvName(moves[0]) : '#' + id);
    const quadOk = kind === 'clients' && id === PLV_QUAD_CLIENT_ID;
    const prev = same ? PLV.card.quad : undefined;
    PLV.card = { kind, id, name, moves, bal: bal ? bal.balance : null, cut: _plvCut(hist), locs, quadOk,
      quad: prev !== undefined ? prev : (quadOk ? _plvQuad(_plvToday()).key : null), locOpen: same ? !!PLV.card.locOpen : false };
    _plvCardDraw();
  } catch (e) {
    showErrorToast('Η καρτέλα δεν φορτώθηκε: ' + _plvErrMsg(e), 'error');
    _plvDraw();
  }
}
function plvCardQuad(k) { if (PLV.card) { PLV.card.quad = k; _plvCardDraw(); } }
function plvCardBack() { _plvDraw(); }
function plvCardLocs() { if (PLV.card) { PLV.card.locOpen = !PLV.card.locOpen; _plvCardDraw(); } }
// The card's rows for the chosen period, with the balance carried in from before it.
function _plvCardRows(S) {
  const q = S.quad && S.quad !== 'all' ? { from: S.quad, to: _plvQuad(S.quad).to } : null;
  let run = 0;
  const rows = [];
  for (const m of S.moves) {
    const isC = m.status === 'confirmed';
    if (q && String(m.movement_date) < q.from) { if (isC) run += m.given - m.taken; continue; }
    if (q && String(m.movement_date) > q.to) continue;
    if (isC) run += m.given - m.taken;
    rows.push({ m, run: isC ? run : null });
  }
  // the carry is the running balance at the period's start, whether or not the period has rows
  const carry = q ? S.moves.filter(m => m.status === 'confirmed' && String(m.movement_date) < q.from).reduce((s, m) => s + m.given - m.taken, 0) : null;
  const conf = rows.filter(r => r.m.status === 'confirmed');
  return { q, rows, carry, end: run, tk: _plvSum(conf, r => r.m.taken), gv: _plvSum(conf, r => r.m.given) };
}
function _plvCardDraw() {
  const S = PLV.card;
  if (!S || S.loading) return;
  const c = document.getElementById('content');
  const isC = S.kind === 'clients';
  const R = _plvCardRows(S);
  const total = S.moves.reduce((s, m) => s + (m.status === 'confirmed' ? m.given - m.taken : 0), 0);
  const b = S.bal != null ? S.bal : total;
  // Two sources disagreeing is shown, not resolved in silence (principle 1).
  const mismatch = S.bal != null && S.bal !== total && !(S.cut && S.cut.cut)
    ? ` <span title="Απόκλιση: όψη υπολοίπου ${S.bal}, άθροισμα κινήσεων ${total}" style="color:var(--danger);cursor:help">⚠</span>` : '';
  const verb = b < 0 ? 'Οφείλουμε' : b > 0 ? 'Μας οφείλει' : 'Μηδενικό υπόλοιπο';
  const today = _plvToday();
  const tabs = S.quadOk ? (() => {
    const cur = _plvQuad(today), prv = _plvQuadPrev(cur);
    const t = (k, l) => `<button class="${S.quad === k ? 'on' : ''}" onclick="plvCardQuad('${k}')">${l}</button>`;
    return `<div class="plv-seg">${t(cur.key, `Τετράμηνο ${_plvFmtDate(cur.from).slice(0, 5)} – ${_plvFmtDate(cur.to).slice(0, 5)}`)}${t(prv.key, `Τετράμηνο ${_plvFmtDate(prv.from).slice(0, 5)} – ${_plvFmtDate(prv.to).slice(0, 5)}`)}${t('all', 'Όλη η περίοδος')}</div>`;
  })() : '';
  const C = PLV_COL;
  const cols = [C.aa(), C.date('Ημ/νία'), _plvC('no', 'Αρ.', '6%', m => `<b class="plv-no">${_plvNo(m)}</b>`, m => _plvNo(m)),
    ...(isC ? [C.ref()] : []), C.kind(), C.locLine(), C.plate(), C.tk(), C.gv(),
    _plvC('run', 'Υπόλοιπο', '8%', () => '', null, 'plv-num'), C.st(), C.act(false)];
  const rowH = (r, i) => `<tr class="plv-r" tabindex="0" onclick="plvRowClick(event,${r.m.id})" onkeydown="if(event.key==='Enter')plvOpenPanel(${r.m.id})">${cols.map(col => `<td class="${col.cls}">${col.key === 'run'
      ? (r.run == null ? '<span class="plv-dim">—</span>' : `<b>${_plvSigned(r.run)}</b>`) : col.cell(r.m, i)}</td>`).join('')}</tr>`;
  const cell = (fn) => `<tr class="plv-carry">${cols.map(col => `<td class="${col.cls}">${fn(col.key) || ''}</td>`).join('')}</tr>`;
  const carry = R.q ? cell(k => k === 'date' ? _plvFmtDate(_plvDayBefore(R.q.from)) : k === 'kind' ? '<b>Από μεταφορά</b>'
    : k === 'loc' ? '<span class="plv-mid">τέλος προηγούμενου τετραμήνου</span>' : k === 'run' ? `<b>${_plvSigned(R.carry)}</b>` : '') : '';
  // the footer's label sits under «Είδος» here (N09), the totals under their columns
  const fcols = cols.map(col => col.key === 'kind' ? { ...col, key: 'loc' } : col.key === 'loc' ? { ...col, key: 'locx' } : col);
  const foot = _plvFootHtml(fcols, R.q ? 'Κινήσεις τετραμήνου (οριστικές)' : 'Σύνολο (οριστικές)', { tk: R.tk, gv: R.gv, run: `<b>${_plvSigned(R.gv - R.tk)}</b>` });
  const grand = `<tr class="plv-gt">${cols.map(col => `<td class="${col.cls}">${col.key === 'kind' ? `Υπόλοιπο στις ${_plvFmtDate(today)}` : col.key === 'run' ? _plvSigned(R.end) : ''}</td>`).join('')}</tr>`;
  const locRows = S.locs && (S.locs.records || []).filter(l => l.balance !== 0);
  // The balance per point (ασπίδα πελάτη) is not in N09 and not among the removals the owner approved: kept, folded.
  const locs = !isC ? '' : S.locs === null ? '<div class="plv-foot" style="color:var(--warn)">⚠ Το υπόλοιπο ανά σημείο δεν φορτώθηκε.</div>'
    : locRows.length ? `<div class="plv-more" onclick="plvCardLocs()">${_plvChev(S.locOpen)}<span>Υπόλοιπο ανά σημείο · ${locRows.length} ${locRows.length === 1 ? 'σημείο' : 'σημεία'}</span><button class="plv-a">${S.locOpen ? 'Απόκρυψη' : 'Εμφάνιση'}</button></div>
      ${S.locOpen ? `<div class="plv-box" style="max-width:520px;margin-top:8px"><table class="plv-t">${locRows.map(l => `<tr><td>${escapeHtml(l.location_name || '—')}</td><td class="plv-num"><b>${_plvSigned(l.balance)}</b></td></tr>`).join('')}</table></div>` : ''}` : '';
  c.innerHTML = `${_PLV_STYLE}<div class="plv-page">${_plvHeadHtml()}${_plvNeedHtml()}<div class="plv-in">
    ${_plvNoticesHtml()}
    <div class="plv-ch"><button class="plv-back" onclick="plvCardBack()" title="Επιστροφή">‹</button><h2>${escapeHtml(S.name)}</h2>
      <span class="plv-mid">${isC ? 'καρτέλα παλετών' : 'συνεργάτης · καρτέλα παλετών'}</span><span class="plv-sp"></span>
      <button class="plv-btn" onclick="plvCardPrint()">⎙ Εκτύπωση</button></div>
    <div class="plv-bar2">${tabs}<span class="plv-sp"></span><span class="plv-cbal"><span class="plv-mid">${verb}</span>${b ? ` <b class="plv-big">${Math.abs(b)}</b> <span class="plv-mid">παλ. στις ${_plvFmtDate(today)}</span>` : ''}${mismatch}</span></div>
    ${S.cut ? `<div class="plv-warn">${escapeHtml(_plvCutText(S.cut, true))}</div>` : ''}
    ${_plvHeadTbl(cols)}<div class="plv-box"><table class="plv-t">${_plvColgroup(cols)}${carry}${R.rows.map((r, k) => rowH(r, k + 1)).join('') || `<tr><td colspan="${cols.length}" class="plv-empty">Καμία κίνηση σε αυτή την περίοδο</td></tr>`}${foot}</table></div>
    <table class="plv-t plv-grand">${_plvColgroup(cols)}${grand}</table>
    <div class="plv-foot">Υπόλοιπο = Δώσαμε − Πήραμε, μόνο οριστικές· οι εκκρεμείς φαίνονται με «—».${S.quadOk ? ' Το τετράμηνο είναι όψη: το υπόλοιπο συνεχίζει.' : ''} Εκτύπωση και CSV δίνουν ό,τι βλέπεις.</div>
    ${locs}
  </div></div><div id="plvModal"></div>`;
}
function plvStmtCSV() {
  const S = PLV.card;
  if (!S || S.loading) return;
  const R = _plvCardRows(S);
  if (!R.rows.length) { toast('Κενή καρτέλα — τίποτα για εξαγωγή', 'error'); return; }
  const head = ['Ημερομηνία', 'Αρ.', 'Reference', 'Είδος', 'Σημείο', 'Όχημα', 'Πήραμε', 'Δώσαμε', 'Υπόλοιπο', 'Κατάσταση', 'Κωδικός'];
  const body = [];
  if (R.q) body.push([_plvFmtDate(_plvDayBefore(R.q.from)), '', '', 'Από μεταφορά', '', '', '', '', R.carry, '', ''].map(_plvCsvEsc).join(','));
  R.rows.forEach(({ m, run }) => body.push([_plvFmtDate(m.movement_date), _plvNo(m), _plvRowExtras(m).ref, PLV_EVENT_GR[m.event_type] || m.event_type,
    [_plvLoc(m), _plvPlace(m)].filter(Boolean).join(', '), _plvVeh(m).plate, m.taken, m.given, run == null ? '' : run, _plvStatus(m), m.code].map(_plvCsvEsc).join(',')));
  _plvCsvSave(head, body, 'kartela-' + String(S.name).replace(/[^A-Za-z0-9Α-Ωα-ω_-]+/g, '_').slice(0, 40) + '-' + _plvToday() + '.csv', S.cut, true);
}
// A4 card (N09b): always PETRAS GROUP in the header (owner 28/10, Ε5.4), only confirmed rows, the pending ones
// said in a line, and the 15-day sentence as it was (Ε5.6). Prints what the screen shows: the same period.
function plvCardPrint() {
  const S = PLV.card;
  if (!S || S.loading) return;
  const R = _plvCardRows(S);
  const today = _plvToday();
  const conf = R.rows.filter(r => r.m.status === 'confirmed');
  const pend = R.rows.filter(r => r.m.status === 'pending');
  const from = R.q ? R.q.from : (S.moves[0] ? String(S.moves[0].movement_date).slice(0, 10) : today);
  const to = R.q && R.q.to < today ? R.q.to : today;
  const endBal = R.q ? R.carry + R.gv - R.tk : R.end;
  const e = escapeHtml;
  const line = r => { const m = r.m; return `<tr><td>${_plvFmtDate(m.movement_date)}</td><td><b>${e(_plvNo(m))}</b></td><td>${e(_plvRowExtras(m).ref)}</td>
    <td>${e([[_plvLoc(m), _plvPlace(m).replace(', ', ' ')].filter(Boolean).join(', '), (PLV_EVENT_GR[m.event_type] || '').toLowerCase()].filter(Boolean).join(' · '))}</td>
    <td class="n">${m.taken}</td><td class="n">${m.given}</td><td class="n">${_plvSigned(r.run)}</td></tr>`; };
  const box = endBal < 0 ? `Οφείλουμε σε εσάς ${-endBal} παλέτες EUR` : endBal > 0 ? `Μας οφείλετε ${endBal} παλέτες EUR` : 'Μηδενικό υπόλοιπο παλετών EUR';
  const pl = pend.length ? `<p>Δεν περιλαμβάνε${pend.length === 1 ? 'ται 1 κίνηση' : `ονται ${pend.length} κινήσεις`} χωρίς επιβεβαίωση (${pend.slice(0, 3).map(r => `${_plvFmtDate(r.m.movement_date)}, ${r.m.taken || r.m.given} παλέτες`).join('· ')}${pend.length > 3 ? ' …' : ''}).</p>` : '';
  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Καρτέλα παλετών — ${e(S.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Syne:wght@600;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:16mm}body{font-family:'DM Sans',sans-serif;color:#0F172A;font-size:11px;margin:0;font-variant-numeric:tabular-nums}
.h{display:flex;justify-content:space-between;border-bottom:1px solid #0F172A;padding-bottom:12px}.b{font-family:Syne;font-weight:700;font-size:15px;letter-spacing:.04em}
.s{color:#475569;text-align:right}.k{display:flex;margin:14px 0}.k>div{flex:1}.k span{color:#475569;display:block}.k b{font-size:13px}
table{width:100%;border-collapse:collapse}th{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#475569;text-align:left;padding:6px 4px;border-bottom:1px solid #CBD5E1}
td{padding:5px 4px;border-bottom:1px solid #E2E8F0}.n{text-align:right}tr.t td{font-weight:700;border-bottom:0}
.box{background:#F4F6F9;padding:12px 16px;margin:12px 0 0;border-bottom:3px double #0F172A}.box span{color:#475569}.box b{display:block;font-family:Syne;font-size:15px;margin-top:4px}
p{color:#475569;margin:8px 0}.sig{margin:48px 0 0 auto;width:220px;border-top:1px solid #0F172A;padding-top:6px;color:#475569}</style></head><body>
<div class="h"><div><div class="b">PETRAS GROUP</div><div style="margin-top:6px;font-weight:500">Καρτέλα παλετών EUR</div></div><div class="s">Έκδοση ${_plvFmtDate(today)}</div></div>
<div class="k"><div><span>Προς</span><b>${e(S.name)}</b></div><div><span>Περίοδος</span><b>${_plvFmtDate(from)} – ${_plvFmtDate(to)}</b></div></div>
<table><tr><th>Ημ/νία</th><th>Αρ.</th><th>Reference</th><th>Σημείο · είδος</th><th class="n">Πήραμε</th><th class="n">Δώσαμε</th><th class="n">Υπόλοιπο</th></tr>
${R.q ? `<tr><td>${_plvFmtDate(_plvDayBefore(R.q.from))}</td><td></td><td></td><td><b>Από μεταφορά</b></td><td></td><td></td><td class="n"><b>${_plvSigned(R.carry)}</b></td></tr>` : ''}
${conf.map(line).join('')}
<tr class="t"><td></td><td></td><td></td><td>Σύνολο περιόδου · μεταβολή</td><td class="n">${R.tk}</td><td class="n">${R.gv}</td><td class="n">${_plvSigned(R.gv - R.tk)}</td></tr></table>
<div class="box"><span>Υπόλοιπο στις ${_plvFmtDate(to)}</span><b>${box}</b></div>
<p style="margin-top:14px">Αρνητικό υπόλοιπο στην καρτέλα = παλέτες σας που κρατάμε εμείς.</p>${pl}
<p style="margin-top:18px">Παρακαλούμε για επιβεβαίωση ή παρατηρήσεις εντός 15 ημερών.</p>
<div class="sig">Λογιστήριο</div>
<script>(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print()},150)})<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showErrorToast('Ο browser μπλόκαρε το παράθυρο της εκτύπωσης: επίτρεψε τα αναδυόμενα για τη σελίδα', 'error'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/* ── Shared form pieces ── */
function _plvField(label, inner, hint) {
  return `<label class="plv-f"><span>${label}</span>${inner}${hint ? `<span class="plv-hint">${hint}</span>` : ''}</label>`;
}
// The sheet drop zone: the input stays #plvFile so _plvUploadIfAny reads the same element in every form.
function _plvDropzone() {
  return `<div class="plv-drop" onclick="document.getElementById('plvFile').click()"
      ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')"
      ondrop="event.preventDefault();this.classList.remove('over');plvFileDropped(event.dataTransfer.files)">
    <input type="file" id="plvFile" accept="image/*,.pdf" style="display:none" onchange="plvFilePicked(this)">
    <span class="plv-up">⤒</span><span id="plvFileName">Σύρε φωτογραφία ή PDF, ή κάνε κλικ</span>
  </div>`;
}
function plvFilePicked(inp) {
  const f = inp.files && inp.files[0];
  const el = document.getElementById('plvFileName');
  if (el) el.textContent = f ? `${f.name} (${(f.size / 1024).toFixed(0)} KB)` : 'Σύρε φωτογραφία ή PDF, ή κάνε κλικ';
}
function plvFileDropped(files) {
  const inp = document.getElementById('plvFile');
  if (!inp || !files || !files.length) return;
  inp.files = files;
  plvFilePicked(inp);
}
// «#550 · Obst Hof GmbH, Stubenberg AT · 23/10/2026 · Berger Obst KG» (N12, N14a)
function _plvSubLine(m) {
  const l = [_plvLoc(m), _plvPlace(m).replace(', ', ' ')].filter(Boolean).join(', ');
  return [_plvNo(m), l, _plvFmtDate(m.movement_date), _plvName(m)].filter(Boolean).map(escapeHtml).join(' · ');
}
function _plvFind(id) { return PLV.movements.find(x => x.id === id) || (PLV.card && PLV.card.moves ? PLV.card.moves.find(x => x.id === id) : null); }

/* ── The TMS panel (owner 8/11: «τα πάνελ τα κάνουμε όπως το στυλ πάνελ του TMS»). Every panel and form of this page
   is the order card's shell: the same classes as _oiCardHtml (navy head, chips, sections, ΕΝΕΡΓΕΙΕΣ as links) on the
   same floating host (.entity-detail-panel.oi-ro-float, 480px, assets/style.css), styled by orders_intl.js
   _oiEnsureStyles. One shell, no second copy of its CSS. The 28/10 frames' own panel (420px) gives way; their
   content stays. ── */
function _plvShell(o) {
  if (typeof _oiEnsureStyles === 'function') _oiEnsureStyles();
  const subs = (o.subs || []).filter(Boolean).map(x => `<div class="oi-card-sub">${x}</div>`).join('');
  const chips = (o.chips || []).filter(Boolean);
  const acts = (o.actions || []).filter(Boolean);
  return `<div class="entity-detail-panel oi-ro-float plv-shell" role="dialog" aria-label="${escapeHtml(o.title)}"${o.attrs || ''}>
    <div class="oi-card-head"><div class="oi-card-title"><span>${escapeHtml(o.title)}</span><button type="button" class="oi-close" title="Κλείσιμο (Esc)" onclick="${o.close || 'plvCloseModal()'}">×</button></div>
      ${subs}${chips.length ? `<div class="oi-chips">${chips.map(c => `<span class="oi-chip${c.cls ? ' ' + c.cls : ''}">${escapeHtml(c.t)}</span>`).join('')}</div>` : ''}</div>
    ${o.body}
    ${acts.length ? `<div class="oi-sect plv-acts-sect"><div class="oi-sect-t">Ενέργειες</div><div class="oi-links">${acts.join('<span class="oi-sep">·</span>')}</div></div>` : ''}
  </div>`;
}
const _plvKv = (k, v, cls) => `<div class="oi-kv"><span class="k">${k}</span><span class="v${cls ? ' ' + cls : ''}">${v}</span></div>`;
const _plvSect = (t, inner, alt) => `<div class="oi-sect${alt ? ' oi-sect-alt' : ''}">${t ? `<div class="oi-sect-t">${t}</div>` : ''}${inner}</div>`;
const _plvLink = (fn, t, danger) => `<button type="button" class="oi-link${danger ? ' oi-link-danger' : ''}" onclick="${fn}">${t}</button>`;
function _plvOpenShell(html) {
  document.getElementById('plvModal').innerHTML = html;
  document.addEventListener('keydown', _plvEsc);
}
const PLV_STATUS_CHIP = { pending: 'Εκκρεμής', confirmed: 'Οριστική', reversed: 'Αντιλογισμένη' };

/* ── Επιβεβαίωση (N12) ── */
const PLV_CONFIRM_T = { LOADING: 'Επιβεβαίωση φόρτωσης', DELIVERY: 'Επιβεβαίωση παράδοσης' };
function plvOpenConfirm(id, inWiz) {
  if (_plvBlockReadOnly()) return;
  const m = _plvFind(id);
  if (!m) return;
  // The clearing wizard (2.1): opened from the list it builds the queue in the screen's order, so a confirmation
  // moves on to the next pending by itself. Each movement keeps its own sheet: no bulk confirm (owner 24/8).
  if (!inWiz && m.status === 'pending') PLV.wizQueue = _plvFlatRows().map(x => x.id);
  const q = m.status === 'pending' ? (PLV.wizQueue || []) : [];
  const pos = q.indexOf(id);
  const hasNext = pos >= 0 && q.slice(pos + 1).some(x => { const n = PLV.movements.find(y => y.id === x); return n && n.status === 'pending'; });
  // The Worker's rule (taken+given>0, except ADJUSTMENT) also here: the button locks while 0/0 and says why.
  const zero = m.event_type !== 'ADJUSTMENT' && m.taken + m.given === 0;
  const s = _plvStop(m), v = _plvVeh(m);
  const info = (s ? _plvKv('Παλέτες στάσης', s.pal) : '') + (s && s.ex != null ? _plvKv('Με ανταλλαγή', s.ex) : '')
    + (v.plate || v.who ? _plvKv('Όχημα · οδηγός', escapeHtml([v.plate, v.who].filter(Boolean).join(' · '))) : '');
  const after = _plvAfter(m, m.given - m.taken);
  _plvOpenShell(_plvShell({
    title: PLV_CONFIRM_T[m.event_type] || 'Επιβεβαίωση κίνησης',
    close: 'plvWizClose()',
    attrs: ` onkeydown="if(event.key==='Enter'&&!event.target.closest('button')){event.preventDefault();plvDoConfirm(${m.id})}"`,
    subs: [_plvSubLine(m), q.length > 1 && pos >= 0 ? `<span class="plv-mcnt">${pos + 1} από ${q.length}</span>` : ''],
    body: (info ? _plvSect('Στοιχεία', info) : '') + _plvSect('Καταχώρηση', `<div class="plv-form">
        <div class="plv-grid2">
          ${_plvField('Πήραμε', `<input id="plvTaken" type="number" min="0" value="${m.taken}" oninput="plvConfirmLive(${m.id})">`)}
          ${_plvField('Δώσαμε', `<input id="plvGiven" type="number" min="0" value="${m.given}" oninput="plvConfirmLive(${m.id})">`)}
        </div>
        <p id="plvZeroNote" class="plv-note" style="display:${zero ? 'block' : 'none'}">Μηδενικές ποσότητες: συμπλήρωσε πόσες παλέτες πήραμε ή δώσαμε για να ενεργοποιηθεί η επιβεβαίωση.</p>
        ${_plvField('Δελτίο', _plvDropzone(), 'Χωρίς δελτίο: η επιβεβαίωση την κάνει οριστική, με πηγή «χειροκίνητη».')}
        <div id="plvAfter" class="plv-after"${after ? '' : ' hidden'}><span>Μετά την επιβεβαίωση</span><b>${after}</b></div>
        <div id="plvErr"></div>
        <button id="plvConfirmGo" class="plv-btn plv-btn-p plv-go-wide" data-id="${m.id}" ${zero ? 'disabled' : ''} onclick="plvDoConfirm(${m.id})">${hasNext ? 'Επιβεβαίωση και επόμενη' : 'Επιβεβαίωση'} <span class="plv-kbd plv-kbd-d">↵</span></button>
      </div>`),
    actions: [q.length > 1 && pos >= 0 ? _plvLink(`plvWizAdvance(${m.id})`, 'Παράλειψη →') : '', _plvLink('plvWizClose()', 'Κλείσιμο')]
  }));
  setTimeout(() => { const g = document.getElementById(m.taken ? 'plvGiven' : 'plvTaken'); if (g) { g.focus(); g.select(); } }, 0);
}
// Live: the zero lock and the balance after (N12).
function plvConfirmLive(id) {
  const m = _plvFind(id);
  const t = parseInt((document.getElementById('plvTaken') || {}).value, 10) || 0;
  const g = parseInt((document.getElementById('plvGiven') || {}).value, 10) || 0;
  const zero = !!m && m.event_type !== 'ADJUSTMENT' && t + g === 0;
  const btn = document.getElementById('plvConfirmGo');
  if (btn) btn.disabled = zero;
  const note = document.getElementById('plvZeroNote');
  if (note) note.style.display = zero ? 'block' : 'none';
  const a = document.getElementById('plvAfter');
  if (a && m) { const t2 = _plvAfter(m, g - t); a.hidden = !t2; a.querySelector('b').innerHTML = t2; }
}
function plvZeroCheck() { const b = document.getElementById('plvConfirmGo'); if (b) plvConfirmLive(+b.dataset.id); }

// Escape closes a modal, the panel or the wizard from anywhere.
function _plvEsc(e) { if (e.key === 'Escape') plvWizClose(); }
function plvWizClose() { PLV.wizQueue = null; plvCloseModal(); }
// Next pending of the queue after afterId, read fresh: what was confirmed or deleted meanwhile is skipped.
function plvWizAdvance(afterId) {
  const q = PLV.wizQueue || [];
  const i = q.indexOf(afterId);
  for (let k = i + 1; k < q.length; k++) {
    const m = PLV.movements.find(x => x.id === q[k]);
    if (m && m.status === 'pending') { plvOpenConfirm(q[k], true); return; }
  }
  PLV.wizQueue = null;
  plvCloseModal();
  toast('Τέλος της λίστας εκκρεμών ✓');
  renderPalletLedger();
}
function plvCloseModal() {
  const el = document.getElementById('plvModal');
  if (el) el.innerHTML = '';
  document.removeEventListener('keydown', _plvEsc);
}

async function _plvUploadIfAny() {
  const fi = document.getElementById('plvFile');
  if (!fi || !fi.files || !fi.files[0]) return null;
  return plvUploadSheet(fi.files[0]);
}
// The sheet upload itself (this page and the pallets weekly view): the file in, the stored path out.
async function plvUploadSheet(file) {
  const b64 = await new Promise((ok, err) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = err; r.readAsDataURL(file);
  });
  const res = await plFetch('/pallets/sheets', { method: 'POST', body: { filename: file.name, content_base64: b64 } });
  return res.path;
}

// A failure stays in the modal until it closes (N16 Ζ), never a toast that leaves: which step did not happen and
// what to do. The numbers written before a failed confirm are said, because the movement now holds them.
function _plvConfirmErr(m, e, taken, given) {
  const box = document.getElementById('plvErr');
  if (!box) { showErrorToast('Η επιβεβαίωση δεν έγινε: ' + _plvErrMsg(e), 'error'); return; }
  const L = escapeHtml(_plvLabel(m));
  const msg = String((e && e.message) || '');
  let text, btn;
  if (/only pending|not found/i.test(msg)) {
    text = `Η ${L} δεν επιβεβαιώθηκε: δεν είναι πια εκκρεμής (την επιβεβαίωσε ή τη διέγραψε κάποιος άλλος).`;
    btn = '<button class="plv-a" onclick="plvWizClose();renderPalletLedger()">Αναφόρτωσε</button>';
  } else if (e && e.plvStep === 'confirm') {
    text = `Τα νούμερα της ${L} γράφτηκαν (πήραμε ${taken} · δώσαμε ${given}), η επιβεβαίωση όχι. Η κίνηση μένει εκκρεμής.`;
    btn = `<button class="plv-a" onclick="plvDoConfirm(${m.id})">Ξαναδοκίμασε</button>`;
  } else {
    text = `Η ${L} δεν επιβεβαιώθηκε${e && e.plvStep === 'upload' ? ' (το δελτίο δεν ανέβηκε)' : ''}: ${escapeHtml(_plvErrMsg(e))}`;
    btn = e && e.plvLocal ? '' : `<button class="plv-a" onclick="plvDoConfirm(${m.id})">Ξαναδοκίμασε</button>`;
  }
  box.innerHTML = `<div class="plv-err"><span>${text}</span>${btn}</div>`;
}
async function plvDoConfirm(id) {
  if (_plvBlockReadOnly()) return;
  if (PLV.busy) return; PLV.busy = true;
  const m = _plvFind(id) || { id, code: '' };
  const taken = parseInt((document.getElementById('plvTaken') || {}).value, 10) || 0;
  const given = parseInt((document.getElementById('plvGiven') || {}).value, 10) || 0;
  try {
    if (m.event_type !== 'ADJUSTMENT' && taken + given === 0) {
      const z = new Error('μηδενικές ποσότητες — συμπλήρωσε πόσες παλέτες πήραμε ή δώσαμε'); z.plvLocal = true;
      _plvConfirmErr(m, z, taken, given);
      return;
    }
    let path = null;
    try { path = await _plvUploadIfAny(); } catch (e) { e.plvStep = 'upload'; throw e; }
    await plvConfirmCore(id, { taken, given, sheetPath: path });
    toast(`Επιβεβαιώθηκε: ${_plvLabel(m)} · πήραμε ${taken} · δώσαμε ${given}`);
    // The wizard goes on only for a movement of its queue: a scheduled row, or one opened from the card or the
    // panel, is not in it, and «next» would open an unrelated first row (review 8/11).
    if (PLV.wizQueue && PLV.wizQueue.length > 1 && PLV.wizQueue.includes(id)) {
      // Wizard: the list and the balances (the next modal's «μετά» starts from them), then the next one.
      const [mv, bc, bp] = await Promise.all([plFetch('/pallets/movements'),
        plFetch('/pallets/balances?type=clients'), plFetch('/pallets/balances?type=partners')]);
      PLV.movements = mv.records || [];
      PLV.cut = _plvCut(mv);
      PLV.balances.clients = bc.records || [];
      PLV.balances.partners = bp.records || [];
      plvWizAdvance(id);
    } else {
      plvCloseModal(); await renderPalletLedger();
    }
  } catch (e) { _plvConfirmErr(m, e, taken, given); }
  finally { PLV.busy = false; }
}

// The two writes of a confirmation, in ONE place (this page's modal and the pallets weekly view's quick entry,
// owner 3/11: «ίδια φιλοσοφία», no second copy of a write). Values in, the Worker's answers out. A failure says
// which step did not happen (err.plvStep): after a PATCH that went through, the movement already holds the new
// numbers while it is still pending — the caller re-reads, never assumes.
async function plvConfirmCore(id, { taken, given, sheetPath }) {
  const patch = { taken, given, sheet_source: sheetPath ? 'UPLOAD' : 'MANUAL' };
  if (sheetPath) patch.sheet_url = sheetPath;
  let patched;
  try { patched = await plFetch('/pallets/movements/' + id, { method: 'PATCH', body: patch }); }
  catch (e) { e.plvStep = 'values'; throw e; }
  try { return { patched, confirmed: await plFetch('/pallets/movements/' + id + '/confirm', { method: 'POST' }) }; }
  catch (e) { e.plvStep = 'confirm'; throw e; }
}
// The delivery exchange correction (reverse + a confirmed replacement with the real «taken»), ONE place. DELIVERY
// only, as the page has always written it: event_type and «given» come from the delivery being corrected.
async function plvFixCore(m, { realTaken, note }) {
  let res;
  try {
    res = await plFetch('/pallets/movements/' + m.id + '/reverse', { method: 'POST', body: {
      reason: 'Διόρθωση ανταλλαγής παράδοσης' + (note ? ' — ' + note : ''),
      replacement: {
        movement_date: m.movement_date, counterparty_type: m.counterparty_type,
        client_id: m.client_id, partner_id: m.partner_id, location_id: m.location_id,
        event_type: 'DELIVERY', taken: realTaken, given: m.given,
        order_stop_id: m.order_stop_id, order_id: m.order_id, notes: note
      }
    }});
  } catch (e) { e.plvStep = 'reverse'; throw e; }
  if (res.replacement) {
    try { await plFetch('/pallets/movements/' + res.replacement.id + '/confirm', { method: 'POST' }); }
    catch (e) { e.plvStep = 'confirm'; throw e; }
  }
  return res;
}

/* ── Πάνελ κίνησης (N11h, N14b): identity, numbers, «μετά», history, and the one action of its state. ── */
function plvOpenPanel(id) {
  const m = _plvFind(id);
  if (!m) return;
  const s = _plvStop(m), v = _plvVeh(m);
  const sheet = m.sheet_url
    ? `<a href="#" class="oi-link" onclick="plvViewSheet('${escapeHtml(String(m.sheet_url).replace(/'/g, ''))}');return false">Προβολή δελτίου</a>`
    : m.sheet_source === 'MANUAL' && m.status === 'confirmed' ? 'χειροκίνητη (χωρίς αρχείο)' : 'δεν έχει ανέβει';
  const sheetCls = m.sheet_url || (m.sheet_source === 'MANUAL' && m.status === 'confirmed') ? '' : 'miss';
  const origin = m.order_stop_id && m.order_id ? 'από την παραγγελία' : m.cons_load_id ? 'από το δρομολόγιο #' + m.cons_load_id
    : m.piece_leg_id != null ? 'από τον προγραμματισμό εθνικών' : 'χειροκίνητα';
  const write = _plvCanWrite();
  const zeroQ = m.taken + m.given === 0 && m.event_type !== 'ADJUSTMENT';
  let after = '', afterT = 'Μετά την επιβεβαίωση', rev = '';
  const actions = [];
  if (m.status === 'pending') {
    after = _plvAfter(m, m.given - m.taken);
    if (write) actions.push(_plvLink(`plvCloseModal();plvOpenConfirm(${m.id})`, zeroQ ? 'Διόρθωση ποσοτήτων' : 'Επιβεβαίωση'), _plvLink(`plvPanelDelete(${m.id})`, 'Διαγραφή εκκρεμούς', true));
  } else if (m.status === 'confirmed' && m.event_type === 'DELIVERY') {
    if (write) actions.push(_plvLink(`plvCloseModal();plvFixDelivery(${m.id})`, 'Διόρθωση ανταλλαγής'));
  } else if (m.status === 'confirmed' && write) {
    after = _plvAfter(m, -(m.given - m.taken)); afterT = 'Μετά τον αντιλογισμό';
    rev = _plvSect('Αντιλογισμός', `<p class="plv-ptext">Οι οριστικές δεν αλλάζουν και δεν σβήνονται. Ο αντιλογισμός τη βγάζει από το υπόλοιπο, την κρατά στο ιστορικό, και μπορείς να γράψεις τη σωστή.</p>
      <div class="plv-form">${_plvField('Αιτιολογία', '<input id="plvRevReason" type="text">', 'Υποχρεωτική')}</div>`);
    actions.push(_plvLink(`plvPanelReverse(${m.id})`, 'Αντιλογισμός', true));
  }
  const info = _plvKv('Ημερομηνία', _plvFmtDate(m.movement_date))
    + (s ? _plvKv('Παλέτες στάσης', `${s.pal}${s.ex != null ? ' · με ανταλλαγή ' + s.ex : ''}`) : '')
    + _plvKv('Πήραμε', m.taken) + _plvKv('Δώσαμε', m.given)
    + (v.plate || v.who ? _plvKv('Όχημα · οδηγός', escapeHtml([v.plate, v.who].filter(Boolean).join(' · '))) : '')
    + _plvKv('Δελτίο', sheet, sheetCls)
    + _plvKv('Δημιουργία', `${origin}${m.created_at ? ' · ' + _plvFmtDate(m.created_at) : ''}`)
    + (m.confirmed_at ? _plvKv('Επιβεβαίωση', _plvFmtDate(m.confirmed_at)) : '')
    + (m.reason ? _plvKv('Αιτιολογία', escapeHtml(m.reason)) : '')
    + (m.notes ? _plvKv('Σημείωση', escapeHtml(m.notes)) : '')
    + _plvKv('Κωδικός', escapeHtml(m.code || ''), 'miss');
  _plvOpenShell(_plvShell({
    title: _plvLoc(m) || _plvName(m),
    subs: [escapeHtml([_plvNo(m), PLV_EVENT_GR[m.event_type] || m.event_type].filter(Boolean).join(' · ')),
      escapeHtml([_plvPlace(m), _plvLoc(m) ? _plvName(m) : ''].filter(Boolean).join(' · '))],
    chips: [{ t: String(m.movement_date) > _plvToday() && m.status === 'pending' ? 'Προγραμματισμένη' : PLV_STATUS_CHIP[m.status] || m.status }],
    body: _plvSect('Στοιχεία', info)
      + (after ? _plvSect('', `<div class="plv-after-k"><span>${afterT}</span><b>${after}</b></div>`, true) : '')
      + rev
      + _plvSect('Ιστορικό', `<div id="plvHist" class="plv-hist" data-mid="${m.id}"><span class="plv-mid">Φόρτωση ιστορικού…</span></div>`),
    actions
  }));
  _plvHistory(m);
}

/* ── Ιστορικό (N11h, N18). Read from GET /pallets/movements/:id/history (the audit_log rows of this movement, the
   same roles as the page). That route belongs to the Υ4 Worker chain: until it answers, the panel shows who and
   when from the movement's own fields, said as such (N18 Δ), never «καμία αλλαγή». A failure is its own state (N18 Γ).
   Expected answer: { records: [{ action, changed_by, changed_at, before, after }] } — action create | update |
   confirm | reverse | delete; before / after the row's columns. ── */
const PLV_AUDIT_SINCE = '10/08/2026';   // first audit_log row of pl_movements (measured 28/10)
const PLV_TRACE_FIX = '2026-10-28';     // 078 (Υ2): confirm / reverse are written from here on
function _plvUserName(u) {
  if (!u) return '';
  const r = (typeof USERS !== 'undefined' ? USERS : []).find(x => x.username === u);
  if (!r) return u;
  const p = String(r.name).trim().split(/\s+/);
  return p.length > 1 ? p[0][0] + '. ' + p.slice(1).join(' ') : r.name;
}
function _plvUserRole(u) { const r = (typeof USERS !== 'undefined' ? USERS : []).find(x => x.username === u); return r ? r.role : null; }
// Where an automatic write came from: a dispatcher saving the order (the feeder) or the database (Υ5 trigger).
function _plvSource(m, rec) {
  if (!rec.changed_by || rec.changed_by === 'system') return 'αυτόματα';
  if (m.order_id && m.order_stop_id && _plvUserRole(rec.changed_by) === 'dispatcher') return `από την παραγγελία #${m.order_id}`;
  return '';
}
function _plvDiff(rec) {
  const b = rec.before || {}, a = rec.after || {};
  const ch = [];
  if (a.taken !== undefined && b.taken !== undefined && a.taken !== b.taken) ch.push(`Πήραμε ${b.taken} → ${a.taken}`);
  if (a.given !== undefined && b.given !== undefined && a.given !== b.given) ch.push(`Δώσαμε ${b.given} → ${a.given}`);
  return ch;
}
function _plvHistLine(m, rec) {
  const a = rec.after || {}, b = rec.before || {};
  let t;
  if (rec.action === 'create') t = ['Δημιουργία', a.status === 'confirmed' ? 'οριστική' : '', a.taken != null ? `Πήραμε ${a.taken}` : '', a.given != null ? `Δώσαμε ${a.given}` : ''].filter(Boolean).join(' · ');
  else if (rec.action === 'confirm') t = ['Επιβεβαίωση', ..._plvDiff(rec)].join(' · ');
  else if (rec.action === 'reverse') t = ['Αντιλογισμός', a.reason || ''].filter(Boolean).join(' · ');
  else if (rec.action === 'delete') t = 'Διαγραφή';
  else { const d = _plvDiff(rec); t = d.length ? d.join(' · ') : (a.sheet_url && !b.sheet_url ? 'Δελτίο ανέβηκε' : 'Αλλαγή στοιχείων'); }
  const meta = [_plvSource(m, rec), _plvUserName(rec.changed_by), _plvFmtTime(rec.changed_at)].filter(Boolean).map(escapeHtml).join(' · ');
  return `<div class="plv-hrow"><b>${escapeHtml(t)}</b><span>${meta}</span></div>`;
}
// N18 Δ: a confirmation before 078 has no audit row — who and when come from the movement, said so.
function _plvFieldLine(what, who, at) {
  return `<div class="plv-hrow"><b>${what}</b><span>${escapeHtml([_plvUserName(who), _plvFmtTime(at), 'από την κίνηση'].filter(Boolean).join(' · '))}</span></div>`;
}
// The panel still open for THIS movement: opening another one meanwhile must not receive this answer.
function _plvHistBox(m) { const b = document.getElementById('plvHist'); return b && b.dataset.mid === String(m.id) ? b : null; }
async function _plvHistory(m) {
  const box = document.getElementById('plvHist');
  if (!box) return;
  let res;
  try { res = await plFetch('/pallets/movements/' + m.id + '/history'); }
  catch (e) {
    const b2 = _plvHistBox(m);
    if (!b2) return;
    if (/^not found$|no_route/i.test(String(e && e.message))) {
      // The route is not live yet (Υ4 Worker): who and when from the movement, said so.
      b2.innerHTML = (m.confirmed_at ? _plvFieldLine('Επιβεβαίωση', m.confirmed_by, m.confirmed_at) : '')
        + (m.created_at ? _plvFieldLine('Δημιουργία', m.created_by, m.created_at) : '')
        + '<div class="plv-hnote">Από τα στοιχεία της κίνησης· το ιστορικό αλλαγών (ποιος άλλαξε τι) θα φαίνεται εδώ.</div>';
    } else {
      b2.innerHTML = `<div class="plv-hfail"><b>Το ιστορικό δεν φορτώθηκε</b><span>Δεν σημαίνει ότι δεν άλλαξε τίποτα.</span><button class="plv-a" onclick="_plvHistRetry(${m.id})">Ξαναδοκίμασε</button></div>`;
    }
    return;
  }
  const b2 = _plvHistBox(m);
  if (!b2) return;
  const recs = (res.records || []).slice().sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at)));
  if (!recs.length) {
    b2.innerHTML = `<div class="plv-hrow"><b>Λείπει η καταγραφή για αυτή την κίνηση· αλλαγές μπορεί να μη φαίνονται.</b><span>${escapeHtml([m.created_by ? 'Γράφτηκε από ' + _plvUserName(m.created_by) : '', _plvFmtTime(m.created_at), 'από την κίνηση'].filter(Boolean).join(' · '))}</span></div>`;
    return;
  }
  let h = '';
  // N18 ΣΤ: the latest recorded numbers differ from the panel's → said, never shown as the last change.
  const lastNum = recs.find(r => r.after && r.after.taken !== undefined && r.action !== 'delete');
  if (lastNum && (lastNum.after.taken !== m.taken || lastNum.after.given !== m.given)) {
    h += `<div class="plv-hrow"><b>Οι τρέχουσες τιμές (Πήραμε ${m.taken} · Δώσαμε ${m.given}) δεν έχουν καταγραφή αλλαγής.</b></div>`;
  }
  // N18 Δ: confirmed before the trace fix → the confirmation from the movement, on top (it is the newest event)
  if (m.confirmed_at && String(m.confirmed_at).slice(0, 10) < PLV_TRACE_FIX && !recs.some(r => r.action === 'confirm')) {
    h += _plvFieldLine('Επιβεβαίωση', m.confirmed_by, m.confirmed_at);
  }
  h += recs.map(r => _plvHistLine(m, r)).join('');
  b2.innerHTML = h + `<div class="plv-hnote">Νεότερο πρώτα. Καταγραφή από ${PLV_AUDIT_SINCE}· επιβεβαιώσεις πριν από 28/10/2026 από τα στοιχεία της κίνησης.</div>`;
}
function _plvHistRetry(id) {
  const m = _plvFind(id);
  const box = document.getElementById('plvHist');
  if (box) box.innerHTML = '<span class="plv-mid">Φόρτωση ιστορικού…</span>';
  if (m) _plvHistory(m);
}

async function plvPanelDelete(id) {
  if (_plvBlockReadOnly()) return;
  if (!confirm('Διαγραφή της εκκρεμούς κίνησης; Οι οριστικές δεν σβήνονται ποτέ.')) return;
  try {
    await plFetch('/pallets/movements/' + id, { method: 'DELETE' });
    toast('Η εκκρεμής διαγράφηκε ✓');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Η διαγραφή δεν έγινε: ' + _plvErrMsg(e), 'error'); }
}
async function plvPanelReverse(id) {
  if (_plvBlockReadOnly()) return;
  const inp = document.getElementById('plvRevReason');
  const reason = ((inp || {}).value || '').trim();
  if (!reason) { if (inp) inp.focus(); showErrorToast('Γράψε αιτιολογία για τον αντιλογισμό', 'error'); return; }
  if (PLV.busy) return; PLV.busy = true;
  try {
    await plFetch('/pallets/movements/' + id + '/reverse', { method: 'POST', body: { reason } });
    toast('Αντιλογίστηκε ✓');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Ο αντιλογισμός δεν έγινε: ' + _plvErrMsg(e), 'error'); }
  finally { PLV.busy = false; }
}

/* ── Διόρθωση παράδοσης (N14a): reverse + the right replacement (plvFixCore). ── */
function plvFixDelivery(id) {
  if (_plvBlockReadOnly()) return;
  const m = _plvFind(id);
  if (!m) return;
  _plvOpenShell(_plvShell({
    title: 'Διόρθωση παράδοσης',
    subs: [_plvSubLine(m)],
    body: _plvSect('Στοιχεία', _plvKv(m.order_stop_id ? 'Γράφτηκε αυτόματα' : 'Καταγράφηκε', `πήραμε ${m.taken} · δώσαμε ${m.given}`))
      + _plvSect('Διόρθωση', `<div class="plv-form">
        <div class="plv-grid2">
          ${_plvField('Πήραμε πραγματικά', `<input id="plvRealTaken" type="number" min="0" value="${m.taken}" oninput="plvFixLive(${m.id})">`)}
          ${_plvField('Δώσαμε', `<input type="number" value="${m.given}" disabled>`)}
        </div>
        ${_plvField('Τι έγινε', '<input id="plvFixNote" type="text" placeholder="π.χ. δεν είχαν άδειες">')}
        <div id="plvAfter" class="plv-after" hidden><span>Μετά τη διόρθωση</span><b></b></div>
        <button class="plv-btn plv-btn-p plv-go-wide" onclick="plvDoFix(${m.id})">Καταχώρηση διόρθωσης</button>
      </div>`),
    actions: [_plvLink('plvCloseModal()', 'Άκυρο')]
  }));
  setTimeout(() => { const i = document.getElementById('plvRealTaken'); if (i) { i.focus(); i.select(); } }, 0);
}
function plvFixLive(id) {
  const m = _plvFind(id);
  const t = parseInt((document.getElementById('plvRealTaken') || {}).value, 10) || 0;
  const a = document.getElementById('plvAfter');
  if (!a || !m) return;
  const txt = t !== m.taken ? _plvAfter(m, m.taken - t) : '';
  a.hidden = !txt; a.querySelector('b').innerHTML = txt;
}
async function plvDoFix(id) {
  if (_plvBlockReadOnly()) return;
  if (PLV.busy) return; PLV.busy = true;
  try {
    const m = _plvFind(id);
    const realTaken = parseInt(document.getElementById('plvRealTaken').value, 10) || 0;
    const note = document.getElementById('plvFixNote').value || '';
    await plvFixCore(m, { realTaken, note });
    toast('Διόρθωση καταχωρήθηκε ✓');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) {
    // After a reverse that went through, the old row no longer counts and the new one may still be pending: said.
    showErrorToast(e.plvStep === 'confirm'
      ? 'Η παλιά παράδοση αντιλογίστηκε και γράφτηκε η σωστή, αλλά δεν επιβεβαιώθηκε: βρες την στις Εκκρεμείς'
      : 'Η διόρθωση δεν έγινε: ' + _plvErrMsg(e), 'error');
    if (e.plvStep === 'confirm') { plvCloseModal(); await renderPalletLedger(); }
  }
  finally { PLV.busy = false; }
}

/* ── Typeahead (party / point). The select could not hold 1.921 clients (PostgREST stops at 1000, 12/8): the user
   types, the server returns 20. One timer PER field: with a shared one, typing in the party and moving to the
   point within 250 ms cancelled the first search. ── */
const PLV_AC = { rows: {}, timers: {} };
function plvAcSearch(field, type) {
  clearTimeout(PLV_AC.timers[field]);
  const inp = document.getElementById('plvAcQ_' + field);
  const hid = document.getElementById(field);
  const box = document.getElementById('plvAcList_' + field);
  // Each key cancels the previous pick: otherwise the user clears the name, sees an empty field and submits the old one.
  hid.value = '';
  if (field.startsWith('plvNm')) _plvNmLive();
  const q = inp.value.trim();
  if (q.length < 2) { box.style.display = 'none'; return; }
  PLV_AC.timers[field] = setTimeout(async () => {
    let rows;
    try {
      const r = await plFetch('/pallets/lookups/search?type=' + type + '&q=' + encodeURIComponent(q));
      rows = r.records || [];
    } catch (e) {
      // An empty list in silence would read as «no such client» and the accountant would open a duplicate.
      box.innerHTML = '<div style="color:var(--danger)">Σφάλμα αναζήτησης: ' + escapeHtml(_plvErrMsg(e)) + '</div>';
      box.style.display = 'block';
      return;
    }
    PLV_AC.rows[field] = rows;
    box.innerHTML = rows.length
      ? rows.map((r, i) => `<div onmousedown="plvAcPick('${field}',${i})">${escapeHtml(r.name || '')}` +
          (r.kind === 'P' ? ' <span class="plv-dim">· συνεργάτης</span>' : '') + '</div>').join('')
      : '<div class="plv-dim">Καμία εγγραφή</div>';
    box.style.display = 'block';
  }, 250);
}
// onmousedown, not onclick: the input's blur would hide the list before the click lands.
function plvAcPick(field, idx) {
  const r = (PLV_AC.rows[field] || [])[idx];
  if (!r) return;
  document.getElementById(field).value = r.kind === 'L' ? String(r.id) : r.kind + ':' + r.id;
  document.getElementById('plvAcQ_' + field).value = r.name;
  document.getElementById('plvAcList_' + field).style.display = 'none';
  if (field.startsWith('plvNm')) _plvNmLive();
}
function plvAcBlur(field) {
  setTimeout(() => {
    const b = document.getElementById('plvAcList_' + field);
    if (b) b.style.display = 'none';
  }, 150);
}

/* ── Νέα κίνηση (N15) ── */
// Τακτοποίηση is the owner's only (the Worker refuses it to every other role, 403): others see the lock line instead
// of a button that answers 403.
const PLV_NM_TYPES = [['RETURN_OUT', 'Επιστροφή αδειών', 'δίνουμε άδειες'], ['RETURN_IN', 'Παραλαβή αδειών', 'παίρνουμε άδειες'],
  ['PARTNER_PICKUP', 'Παραλαβή από', 'συνεργάτη'], ['PARTNER_DROPOFF', 'Παράδοση από', 'συνεργάτη']];
function _plvIsOwner() { try { return typeof user !== 'undefined' && !!user && user.role === 'owner'; } catch (_) { return false; } }
function plvNewMovement() {
  if (_plvBlockReadOnly()) return;
  PLV_AC.rows = {};
  PLV._nmType = 'RETURN_OUT';
  const ac = (field, type, ph) => `<div style="position:relative">
          <input id="plvAcQ_${field}" type="text" autocomplete="off" placeholder="${ph}"
            oninput="plvAcSearch('${field}','${type}')" onblur="plvAcBlur('${field}')">
          <input type="hidden" id="${field}" value="">
          <div class="plv-ac" id="plvAcList_${field}" style="display:none"></div>
        </div>`;
  const types = PLV_NM_TYPES.concat(_plvIsOwner() ? [['ADJUSTMENT', 'Τακτοποίηση', 'χαμένες, συμβιβασμός']] : []);
  _plvOpenShell(_plvShell({
    title: 'Νέα κίνηση',
    subs: ['Χωρίς δελτίο μένει εκκρεμής· με δελτίο γίνεται οριστική.'],
    body: _plvSect('Είδος', `<div class="plv-types" id="plvNmTypes">${types.map(([v, a, b]) =>
          `<button type="button" data-t="${v}" class="${v === PLV._nmType ? 'on' : ''}" onclick="plvNmType('${v}')"><b>${a}</b><small>${b}</small></button>`).join('')}</div>
          ${_plvIsOwner() ? '' : '<div class="plv-hint" style="margin-top:6px">🔒 Τακτοποίηση (χαμένες παλέτες, συμβιβασμός): μόνο ο ιδιοκτήτης</div>'}`)
      + _plvSect('Στοιχεία', `<div class="plv-form">
        ${_plvField('Πελάτης ή συνεργάτης', ac('plvNmParty', 'party', '2+ γράμματα'))}
        ${_plvField('Ημερομηνία', `<input id="plvNmDate" type="date" value="${_plvToday()}" min="2020-01-01" max="2030-12-31" onchange="_plvNmLive()">`)}
        ${_plvField('Σημείο (προαιρετικό)', ac('plvNmLoc', 'locations', '2+ γράμματα'))}
        <div id="plvNmDup"></div>
        <div class="plv-grid2">
          ${_plvField('Πήραμε', '<input id="plvNmTaken" type="number" min="0" value="0" oninput="_plvNmLive()">')}
          ${_plvField('Δώσαμε', '<input id="plvNmGiven" type="number" min="0" value="0" oninput="_plvNmLive()">')}
        </div>
        <div id="plvNmReasonW" hidden>${_plvField('Αιτιολογία', '<input id="plvNmReason" type="text">', 'Υποχρεωτική για την τακτοποίηση')}</div>
        ${_plvField('Σημείωση', '<input id="plvNmNote" type="text">')}
        ${_plvField('Δελτίο', _plvDropzone())}
        <div class="plv-hint" id="plvNmAfter"></div>
        <button class="plv-btn plv-btn-p plv-go-wide" onclick="plvDoCreate()">Καταχώρηση</button>
      </div>`),
    actions: [_plvLink('plvCloseModal()', 'Άκυρο')]
  }));
}
function plvNmType(t) {
  PLV._nmType = t;
  document.querySelectorAll('#plvNmTypes button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  const w = document.getElementById('plvNmReasonW');
  if (w) w.hidden = t !== 'ADJUSTMENT';
  _plvNmLive();
}
// The double-entry warning (N15) and the balance after. The common double record: the same empties written once on
// the loading («δώσαμε 5») and again as a return. Same point, same party, same side, within 14 days → said before
// she writes; never a lock (she may really have given twice).
function _plvNmLive() {
  const party = (document.getElementById('plvNmParty') || {}).value || '';
  const loc = parseInt((document.getElementById('plvNmLoc') || {}).value, 10) || null;
  const md = (document.getElementById('plvNmDate') || {}).value || '';
  const tk = parseInt((document.getElementById('plvNmTaken') || {}).value, 10) || 0;
  const gv = parseInt((document.getElementById('plvNmGiven') || {}).value, 10) || 0;
  const [kind, pid] = party.split(':');
  const id = parseInt(pid, 10);
  const dup = document.getElementById('plvNmDup');
  if (dup) {
    let hit = null;
    if (loc && id && md) {
      const side = PLV._nmType === 'RETURN_IN' || PLV._nmType === 'PARTNER_DROPOFF' || (tk > 0 && !gv) ? 'taken' : 'given';
      hit = PLV.movements.filter(m => _plvLive(m) && m.location_id === loc && (kind === 'C' ? m.client_id === id : m.partner_id === id)
        && m[side] > 0 && Math.abs(_plvDays(m.movement_date, md)) <= 14)
        .sort((a, b) => (a.movement_date < b.movement_date ? 1 : -1))[0] || null;
      if (hit) {
        const w = side === 'given' ? 'δώσαμε' : 'πήραμε';
        dup.innerHTML = `<div class="plv-dup"><b>⚠ Στο ίδιο σημείο υπάρχει ήδη «${w} ${hit[side]}»: ${escapeHtml((PLV_EVENT_GR[hit.event_type] || '').toLowerCase())} ${escapeHtml(_plvNo(hit) || hit.code || '')}, ${_plvFmtDate(hit.movement_date)}.</b><span>Αν είναι οι ίδιες άδειες, μην τις γράψεις δεύτερη φορά.</span></div>`;
      }
    }
    if (!hit) dup.innerHTML = '';
  }
  const after = document.getElementById('plvNmAfter');
  if (after) {
    const b = id ? _plvBal(kind === 'C' ? 'clients' : 'partners', id) : null;
    after.textContent = b != null && (tk || gv) ? `Μετά την επιβεβαίωση: ${_plvSigned(b)} → ${_plvSigned(b + gv - tk)}` : '';
  }
}
async function plvDoCreate() {
  if (_plvBlockReadOnly()) return;
  if (PLV.busy) return; PLV.busy = true;
  try {
    // With a typeahead the field stays empty when the user typed without picking: without this check
    // partner_id=NaN would reach the Worker.
    const partyVal = document.getElementById('plvNmParty').value;
    if (!partyVal) { showErrorToast('Διάλεξε πελάτη ή συνεργάτη από τη λίστα', 'error'); return; }
    // The base accepted '0206-08-08' (PM-1034): min/max of the input does not stop typing in every browser.
    const md = document.getElementById('plvNmDate').value;
    if (!md || md < '2020-01-01' || md > '2030-12-31') {
      showErrorToast('Η ημερομηνία «' + (md || 'κενή') + '» είναι εκτός λογικού εύρους (2020–2030) — έλεγξε το έτος', 'error');
      return;
    }
    const type = PLV._nmType || 'RETURN_OUT';
    const reason = ((document.getElementById('plvNmReason') || {}).value || '').trim() || null;
    if (type === 'ADJUSTMENT' && !reason) { showErrorToast('Η τακτοποίηση θέλει αιτιολογία', 'error'); return; }
    const [kind, pid] = partyVal.split(':');
    const path = await _plvUploadIfAny();
    // Sheet gate (owner 25/8): WITH a sheet the movement is confirmed at once; WITHOUT it stays pending until
    // someone confirms it (with or without a sheet: the Worker accepts sheet_source 'MANUAL').
    const body = {
      movement_date: md,
      counterparty_type: kind === 'C' ? 'CLIENT' : 'PARTNER',
      event_type: type,
      taken: parseInt(document.getElementById('plvNmTaken').value, 10) || 0,
      given: parseInt(document.getElementById('plvNmGiven').value, 10) || 0,
      notes: document.getElementById('plvNmNote').value || null,
      reason: type === 'ADJUSTMENT' ? reason : null,
      sheet_source: path ? 'UPLOAD' : 'MANUAL',
      confirm: !!path
    };
    if (kind === 'C') body.client_id = parseInt(pid, 10); else body.partner_id = parseInt(pid, 10);
    const loc = document.getElementById('plvNmLoc').value;
    if (loc) body.location_id = parseInt(loc, 10);
    if (path) body.sheet_url = path;
    await plFetch('/pallets/movements', { method: 'POST', body });
    toast(path ? 'Κίνηση καταχωρήθηκε και οριστικοποιήθηκε ✓' : 'Κίνηση καταχωρήθηκε ως εκκρεμής — θέλει επιβεβαίωση');
    plvCloseModal(); await renderPalletLedger();
  } catch (e) { showErrorToast('Η κίνηση δεν καταχωρήθηκε: ' + _plvErrMsg(e), 'error'); }
  finally { PLV.busy = false; }
}

async function plvViewSheet(path) {
  try {
    const r = await plFetch('/pallets/sheets?path=' + encodeURIComponent(path));
    window.open(r.url, '_blank');
  } catch (e) { showErrorToast('Δεν άνοιξε το δελτίο: ' + _plvErrMsg(e), 'error'); }
}

// The module's CSS, once per paint; tokens only (DESIGN.md Β). Values from the frames (N01: bar 60px, line 40px,
// rows 36px, 13px text, 11px uppercase headers, white boxes with a 1px border on the page grey).
const _PLV_STYLE = `<style>
  #plvModal{font-size:var(--text-body);font-variant-numeric:tabular-nums}
  .plv-f input[type=number]::-webkit-inner-spin-button,.plv-f input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
  .plv-f input[type=number]{-moz-appearance:textfield}
  .plv-page{min-height:100%;background:var(--surface-page);color:var(--text);font-size:var(--text-body);font-variant-numeric:tabular-nums}
  .plv-hd{display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;height:60px;padding:0 28px;background:var(--surface-card);border-bottom:1px solid var(--border)}
  .plv-ttl{display:flex;align-items:center;gap:12px;min-width:0}
  .plv-ttl h1{font-family:Syne;font-size:22px;font-weight:700;margin:0;line-height:1}
  .plv-sub{color:var(--text-mid);font-size:var(--text-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .plv-nav{display:flex;gap:28px}
  .plv-nav button{background:none;border:0;border-bottom:3px solid transparent;padding:0 2px;font:inherit;font-size:var(--text-base);color:var(--text-mid);cursor:pointer}
  .plv-nav button.on{color:var(--text);font-weight:700;border-bottom-color:var(--surface-dark)}
  .plv-nav button:hover{color:var(--text)}
  .plv-hact{display:flex;align-items:center;justify-content:flex-end;gap:12px}
  .plv-btn{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-card);color:var(--text);font:inherit;font-size:var(--text-base);font-weight:500;cursor:pointer;white-space:nowrap}
  .plv-btn:hover{background:var(--surface-sunken)}
  .plv-btn-p{background:var(--surface-dark);border-color:var(--surface-dark);color:var(--text-on-dark);font-weight:600}
  .plv-btn-p:hover{background:var(--text)}
  .plv-btn:disabled{opacity:.45;cursor:not-allowed}
  .plv-wide{flex:0 0 200px;justify-content:center}
  .plv-exp{position:relative}
  .plv-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:30;width:400px;padding:6px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-md)}
  .plv-menu button{display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:none;border-radius:var(--radius);font:inherit;cursor:pointer;color:var(--text)}
  .plv-menu button:hover{background:var(--surface-sunken)}
  .plv-menu b{display:block;font-weight:500;font-size:var(--text-base)}.plv-menu small{color:var(--text-mid);font-size:var(--text-sm)}
  .plv-need{display:flex;align-items:stretch;gap:8px;height:40px;padding:0 28px;background:var(--surface-card);border-bottom:1px solid var(--border);white-space:nowrap}
  .plv-need-l{align-self:center;font-size:var(--text-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-right:8px}
  .plv-need-i{background:none;border:0;border-bottom:2px solid transparent;padding:0 2px;font:inherit;font-size:var(--text-body);color:var(--text);cursor:pointer}
  .plv-need-i.on{font-weight:700;border-bottom-color:var(--surface-dark)}
  .plv-need-r{margin-left:auto;align-self:center}
  .plv-dot{align-self:center;color:var(--text-dim)}
  .plv-red{color:var(--danger)}b.plv-red{font-weight:700}
  .plv-in{padding:12px 28px 32px}
  .plv-bar2{display:flex;align-items:center;gap:12px;min-height:32px;margin:0 0 12px;flex-wrap:wrap}
  .plv-sp{flex:1}
  .plv-seg{display:inline-flex;gap:2px;padding:3px;background:var(--border);border-radius:var(--radius)}
  .plv-seg button{height:26px;padding:0 10px;border:0;border-radius:4px;background:none;color:var(--text-mid);font:inherit;font-size:var(--text-base);cursor:pointer}
  .plv-seg button.on{background:var(--surface-card);color:var(--text);font-weight:600;box-shadow:0 0 0 1px var(--border)}
  .plv-seg small{color:var(--text-dim);margin-left:4px}
  .plv-q{position:relative;display:flex;align-items:center;gap:8px;width:300px;height:32px;padding:0 8px 0 12px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-mid)}
  .plv-q:focus-within{border-color:var(--accent)}
  .plv-q input{flex:1;min-width:0;border:0;outline:0;background:none;font:inherit;font-size:var(--text-base);color:var(--text)}
  .plv-qi{color:var(--text-mid);font-size:var(--text-base)}
  .plv-x{cursor:pointer;color:var(--text-dim);font-size:var(--text-base)}
  .plv-kbd{display:inline-block;padding:0 5px;border:1px solid var(--border);border-radius:3px;font-size:var(--text-xs);color:var(--text-mid);line-height:16px;font-family:inherit}
  .plv-kbd-d{border-color:var(--text-mid);color:var(--text-on-dark)}
  .plv-per{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 10px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-mid)}
  .plv-per select{border:0;background:none;font:inherit;font-size:var(--text-base);color:var(--text);outline:0;cursor:pointer}
  .plv-date{font-size:var(--text-sm);color:var(--text-mid)}
  .plv-date input{height:30px;padding:0 6px;border:1px solid var(--border);border-radius:var(--radius);font:inherit;color:var(--text)}
  .plv-mid{color:var(--text-mid)}.plv-dim{color:var(--text-dim)}.plv-zero{color:var(--text-dim)}
  .plv-t{width:100%;border-collapse:collapse;table-layout:fixed}
  .plv-t td,.plv-t th{padding:0 8px;text-align:left;vertical-align:middle}
  .plv-th th{height:32px;font-size:var(--text-xs);font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-mid);white-space:nowrap}
  .plv-box{background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
  .plv-box .plv-t td{height:36px;border-top:1px solid var(--border);line-height:1.2}
  .plv-box .plv-t tr:first-child td{border-top:0}
  .plv-t td small{display:block;font-size:var(--text-xs);color:var(--text-mid);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .plv-num{text-align:right!important}
  .plv-nw{white-space:nowrap}
  .plv-aa{color:var(--text-mid);font-size:var(--text-sm)}
  .plv-no{font-weight:700}
  .plv-plate{font-family:ui-monospace,Menlo,monospace;font-size:var(--text-sm);font-weight:600;letter-spacing:.04em}
  .plv-ell{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .plv-r{cursor:pointer}
  .plv-r:hover td,.plv-r:focus td{background:var(--surface-sunken)}
  .plv-r:focus{outline:0}
  .plv-late td:first-child{box-shadow:inset 3px 0 0 var(--danger)}
  .plv-late-t{color:var(--danger)}
  .plv-r-act{text-align:right!important;white-space:nowrap}
  .plv-dots{color:var(--text-dim);letter-spacing:1px}
  .plv-acts{display:none;align-items:center;gap:8px}
  .plv-r:hover .plv-acts,.plv-r:focus .plv-acts,.plv-r:focus-within .plv-acts{display:inline-flex}
  .plv-r:hover .plv-acts~.plv-dots,.plv-r:focus .plv-acts~.plv-dots,.plv-r:focus-within .plv-acts~.plv-dots{display:none}
  .plv-go{height:26px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-card);font:inherit;font-weight:500;cursor:pointer;color:var(--text)}
  .plv-ft td{height:32px!important;font-weight:600;white-space:nowrap}
  .plv-grand{margin-top:8px}.plv-gt td{height:36px;font-weight:700;white-space:nowrap}
  .plv-gt td.plv-num:not(:empty){border-top:1px solid var(--text);border-bottom:3px double var(--text)}
  .plv-gh{display:flex;align-items:center;gap:8px;height:40px;margin-top:8px;cursor:pointer;user-select:none}
  .plv-gn{font-family:Syne;font-size:var(--text-base);font-weight:600;letter-spacing:.06em;text-transform:uppercase}
  .plv-gs{color:var(--text-mid);font-size:var(--text-body)}
  .plv-sep{display:inline-block;width:6px}
  .plv-chev{display:inline-block;width:14px;color:var(--text-mid);font-size:var(--text-xs)}
  .plv-more{display:flex;align-items:center;gap:8px;height:36px;margin-top:12px;padding:0 12px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-mid);cursor:pointer}
  .plv-more>span:not(.plv-chev){flex:1}
  .plv-a{background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--accent-text,var(--accent));text-decoration:underline;cursor:pointer}
  .plv-a.plv-red{color:var(--danger);text-decoration:none}
  .plv-foot{margin-top:14px;font-size:var(--text-sm);color:var(--text-mid)}
  .plv-empty{padding:32px;text-align:center;color:var(--text-mid)}
  .plv-card{padding:20px 24px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);display:flex;flex-direction:column;gap:8px;align-items:flex-start}
  .plv-card b{font-size:var(--text-base)}
  .plv-okt{color:var(--text)}
  .plv-fail{border-left:3px solid var(--warn);margin-top:8px}
  .plv-warn{margin:0 0 12px;padding:8px 14px;background:var(--warn-bg);border:1px solid var(--warn-border);border-left:3px solid var(--warn);border-radius:var(--radius);color:var(--warn);display:flex;gap:12px;align-items:center}
  .plv-warn .plv-a{margin-left:auto;color:var(--warn)}
  .plv-ro{margin:0 0 12px;padding:8px 14px;background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)}
  .plv-sum{display:flex;align-items:flex-end;gap:40px;margin:4px 0 20px}
  .plv-sum>div>div{margin-top:4px}
  .plv-sum-net{padding-right:40px;border-right:1px solid var(--border)}
  .plv-big{font-family:Syne;font-size:28px;font-weight:700}
  .plv-mbig{font-size:18px;font-weight:600}
  .plv-sum small{color:var(--text-mid);font-size:var(--text-sm)}
  .plv-zrow td{color:var(--text-mid);cursor:pointer;height:36px}
  .plv-ch{display:flex;align-items:center;gap:12px;margin:4px 0 16px}
  .plv-ch h2{font-family:Syne;font-size:22px;font-weight:700;margin:0}
  .plv-back{width:32px;height:32px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-card);font-size:20px;line-height:1;cursor:pointer;color:var(--text)}
  .plv-cbal .plv-big{font-size:26px;margin:0 4px}
  /* Forms inside the TMS panel (the shell itself is orders_intl.js _oiCss + .oi-ro-float): only what the shell
     does not have — inputs, the drop zone, the «μετά» box, the error, the type tiles. */
  .plv-shell{display:flex;flex-direction:column;font-size:var(--text-body)}
  .plv-form{display:flex;flex-direction:column;gap:12px;margin-top:4px}
  .plv-mcnt{color:var(--text-on-dark);font-weight:600}
  .plv-go-wide{width:100%;justify-content:center;height:36px}
  .plv-after-k span{display:block;color:var(--text-mid);font-size:12px}.plv-after-k b{font-weight:600}
  .plv-grid2{display:flex;gap:20px}.plv-grid2>*{flex:1 1 0;min-width:0}
  .plv-g21>*:last-child{flex:0 0 176px}
  .plv-f{display:flex;flex-direction:column;gap:6px}
  .plv-f>span:first-child{font-size:var(--text-xs);font-weight:600;letter-spacing:.06em;text-transform:uppercase}
  .plv-f input{width:100%;box-sizing:border-box;height:36px;padding:0 12px;font:inherit;font-size:var(--text-base);color:var(--text);background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius)}
  .plv-f input[type=number]{text-align:right}
  .plv-f input:focus{outline:0;border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
  .plv-f input:disabled{background:var(--surface-sunken);color:var(--text-mid)}
  .plv-hint{font-size:var(--text-sm);color:var(--text-mid)}
  .plv-drop{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 16px;border:1px dashed var(--border);border-radius:var(--radius);cursor:pointer;color:var(--text-mid)}
  .plv-drop:hover,.plv-drop.over{border-color:var(--text-dim);background:var(--surface-sunken)}
  .plv-up{font-size:16px;color:var(--text)}
  .plv-after{padding:10px 12px;background:var(--surface-sunken);border-radius:var(--radius)}
  .plv-after span{display:block;color:var(--text-mid)}.plv-after b{font-weight:600}
  .plv-note{font-size:var(--text-sm);color:var(--warn);margin:0}
  .plv-err{display:flex;gap:16px;align-items:center;padding:10px 14px;border:1px solid var(--border);border-left:3px solid var(--danger);border-radius:var(--radius);color:var(--danger)}
  .plv-err span{flex:1}
  .plv-types{display:flex;gap:4px;padding:4px;background:var(--surface-sunken);border-radius:var(--radius)}
  .plv-types button{flex:1;text-align:left;padding:6px 10px;border:1px solid transparent;border-radius:4px;background:none;font:inherit;cursor:pointer;color:var(--text-mid)}
  .plv-types button.on{background:var(--surface-card);border-color:var(--border);color:var(--text)}
  .plv-types b{display:block;font-weight:600;font-size:var(--text-body)}.plv-types small{font-size:var(--text-xs);color:var(--text-mid)}
  .plv-dup{padding:10px 14px;background:var(--warn-bg);border:1px solid var(--warn-border);border-left:3px solid var(--warn);border-radius:var(--radius);color:var(--warn)}
  .plv-dup b{display:block;font-weight:600}
  .plv-ptext{margin:12px 0;color:var(--text)}
  .plv-hrow{padding:6px 0;border-bottom:1px solid var(--border);font-size:13px}
  .plv-hrow b{display:block;font-weight:500}.plv-hrow span{color:var(--text-mid);font-size:var(--text-sm)}
  .plv-hnote{margin-top:10px;color:var(--text-mid);font-size:var(--text-sm)}
  .plv-hfail{display:flex;flex-direction:column;gap:6px;padding:12px 16px;border-left:3px solid var(--danger)}
  .plv-hfail span{color:var(--text-mid)}
  .plv-ac{position:absolute;left:0;right:0;top:100%;z-index:20;background:var(--surface-card);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);max-height:210px;overflow:auto;box-shadow:var(--shadow-md)}
  .plv-ac>div{padding:8px 12px;cursor:pointer}.plv-ac>div:hover{background:var(--surface-sunken)}
</style>`;

window.renderPalletLedger = renderPalletLedger;
window.plvTab = plvTab; window.plvAct = plvAct; window.plvBalKind = plvBalKind;
window.plvOpenConfirm = plvOpenConfirm; window.plvCloseModal = plvCloseModal; window.plvConfirmLive = plvConfirmLive;
window.plvDoConfirm = plvDoConfirm; window.plvFixDelivery = plvFixDelivery; window.plvDoFix = plvDoFix; window.plvFixLive = plvFixLive;
window.plvZeroCheck = plvZeroCheck;
window.plvOpenPanel = plvOpenPanel; window.plvPanelDelete = plvPanelDelete; window.plvPanelReverse = plvPanelReverse;
window.plvRowClick = plvRowClick; window.plvRowKey = plvRowKey; window._plvHistRetry = _plvHistRetry;
window.plvWizClose = plvWizClose; window.plvWizAdvance = plvWizAdvance;
window.plvNewMovement = plvNewMovement; window.plvDoCreate = plvDoCreate; window.plvViewSheet = plvViewSheet; window.plvNmType = plvNmType; window._plvNmLive = _plvNmLive;
window.plvFilter = plvFilter; window.plvExportCSV = plvExportCSV; window.plvExportBal = plvExportBal; window.plvExpMenu = plvExpMenu; window.plvClearQ = plvClearQ;
window.plvGroupBy = plvGroupBy; window.plvToggle = plvToggle; window.plvMore = plvMore; window.plvSched = plvSched; window.plvZero = plvZero; window.plvPeriod = plvPeriod;
window.plvDrill = plvDrill; window.plvStmtCSV = plvStmtCSV; window.plvCardPrint = plvCardPrint; window.plvCardQuad = plvCardQuad; window.plvCardBack = plvCardBack; window.plvCardLocs = plvCardLocs;
window._plvDraw = _plvDraw; window.plvRetryEnrich = plvRetryEnrich;
window.plvFilePicked = plvFilePicked; window.plvFileDropped = plvFileDropped;
window.plvConfirmCore = plvConfirmCore; window.plvFixCore = plvFixCore; window.plvUploadSheet = plvUploadSheet;
// The typeahead's inline oninput/onmousedown/onblur run in global scope.
window.plvAcSearch = plvAcSearch; window.plvAcPick = plvAcPick; window.plvAcBlur = plvAcBlur;
