// ═══════════════════════════════════════════════════════════
// MODULE — METRICS AUDIT
// Displays every canonical metric computed from live data.
// Purpose: verify accuracy. Compare values against what
// other pages (Dashboard, Invoicing, etc.) show.
// ═══════════════════════════════════════════════════════════
// Module state uses 'AUDIT' / '_audit' prefix to avoid global collisions.
'use strict';

const AUDIT = {
  results: null,
  loadedAt: null,
  fetching: false,
  // Source keys whose fetch failed on the last load (see safeFetch/didFail).
  // Drives the "figures below may be wrong" banner in _auditDraw.
  failedSources: [],
  // Kept so the cross-checks can recompute a canonical value from the same
  // data the metric rows were built from, instead of re-parsing "34%" back
  // out of a rendered string.
  sources: null,
  // Filter state for the metric table (MA-6: 38 rows over 2.627px).
  q: '',
  cat: 'all',
};

// Which source table each metric category reads, so a failed fetch can name the
// figures it actually affects instead of vaguely warning about the whole page.
// Derived by reading _runAllMetrics; keep in sync when a category gains a source.
// NOTE(audit): natLoads, drivers, partners, locations and clients are fetched
// but never read by any metric. Left alone deliberately (removing fetches is a
// behaviour change, not part of the fail-open work), but they are dead weight
// on every page load and worth dropping in a follow-up.
const AUDIT_CATEGORY_SOURCES = {
  op:    ['orders', 'ramp'],
  perf:  ['orders'],
  fin:   ['orders', 'natOrders'],
  fleet: ['trucks', 'trailers', 'maintReq'],
  hr:    ['orders'],
  inv:   ['ramp', 'plSup', 'plPart'],
  biz:   ['orders', 'natOrders'],
};

// Human-facing names for the banner; the internal keys are not obvious to a user.
const AUDIT_SOURCE_LABELS = {
  orders: 'Παραγγελίες', natOrders: 'Εθνικές Παραγγελίες', natLoads: 'Εθνικά Φορτία',
  trucks: 'Φορτηγά', trailers: 'Ρυμούλκες', drivers: 'Οδηγοί', partners: 'Συνεργάτες',
  locations: 'Τοποθεσίες', clients: 'Πελάτες', ramp: 'Ράμπα',
  maintReq: 'Αιτήματα Συντήρησης', plSup: 'Ισοζύγιο Παλετών (Προμηθευτές)',
  plPart: 'Ισοζύγιο Παλετών (Συνεργάτες)',
};

// Page names as the sidebar shows them, read from core/router.js NAV so a
// cross-check row reads exactly like the menu item the reader must go open —
// and cannot drift from it (one source of truth). The `page` id stays the
// router id: that is what readPageMetrics() keys on. Rows keep an explicit
// `label` only when they name something narrower than the page (a card, a tab).
function _auditPageName(id) {
  if (typeof NAV !== 'undefined') {
    for (const sec of NAV) {
      const it = (sec.items || []).find(i => i.id === id);
      if (it) return it.label;
    }
  }
  return id;
}

// ─── CROSS-CHECKS ────────────────────────────────────────────
// The point of this page. Each entry names one idea that more than one screen
// claims to show, lists every page that reports a figure for it, and either
// supplies a canonical value from core/metrics.js or says plainly that no
// canonical value exists.
//
// `declared` is the honest half: some of these differences are correct.
// "Vehicles with an expired document" and "expired documents" are not the same
// count, and hiding that would replace a visible confusion with an invisible
// one. A declared row still shows its difference — it just is not counted as a
// fault, and it says why.
//
// A page appears here only after it has been rendered in this session
// (core/utils.js reportPageMetrics). Pages not yet opened show as "δεν άνοιξε".
const AUDIT_CROSS_CHECKS = [
  {
    id: 'week',
    label: 'Αριθμός εβδομάδας',
    why: 'Το 31-vs-32 της 4/8/2026. Ενοποιήθηκε στο Κύμα 1 — αυτή η γραμμή το κρατά ενοποιημένο.',
    canonical: () => (typeof isoWeekNumber === 'function' ? isoWeekNumber(new Date()) : null),
    canonicalLabel: 'isoWeekNumber() — core/utils.js',
    rows: [
      { page: 'dashboard',    key: 'weekNumber' },
      { page: 'orders_intl',  key: 'weekNumberDefault' },
      { page: 'performance',  key: 'weekNumberDefault' },
      { page: 'weekly_intl',  key: 'weekNumberDefault', note: 'δικός του τύπος _wiCurrentWeek() (έναρξη Κυριακή)' },
      { page: 'weekly_natl',  key: 'weekNumberDefault', note: 'δικός του τύπος _wnCurrentWeek() (έναρξη Κυριακή)' },
    ],
  },
  {
    id: 'expired_docs',
    label: 'Ληγμένα έγγραφα στόλου',
    why: 'Τρεις οθόνες, τρία νούμερα. Δύο μετρούν έγγραφα με ΔΙΑΦΟΡΕΤΙΚΑ πεδία, μία μετρά οχήματα.',
    canonical: null,
    canonicalNote: 'Δεν υπάρχει κανονική μέτρηση στο core/metrics.js — οι σελίδες συγκρίνονται μεταξύ τους, με βάση την Επισκόπηση Στόλου.',
    baseline: 'maint_dash',
    rows: [
      { page: 'maint_dash',   key: 'expiredDocRows',   unit: 'έγγραφα' },
      { page: 'dashboard',    key: 'expiredFleetDocs', unit: 'έγγραφα',
        note: 'ρυμούλκες: ΚΤΕΟ+FRC+Ασφάλεια (κοινή λίστα TRAILER_EXPIRY_FIELDS από 26/8)' },
      { page: 'maint_expiry', key: 'expiredVehicles',  unit: 'οχήματα',
        declared: 'Μετρά ΟΧΗΜΑΤΑ με ≥1 ληγμένο έγγραφο — άλλο μέγεθος, όχι διαφωνία' },
    ],
  },
  {
    id: 'expired_vehicles',
    label: 'Οχήματα με ληγμένο έγγραφο',
    why: 'Οι δύο σελίδες συντήρησης πρέπει να συμφωνούν απόλυτα εδώ — ίδιος ορισμός, ίδια δεδομένα.',
    canonical: null,
    canonicalNote: 'Δεν υπάρχει κανονική μέτρηση· οι δύο σελίδες συντήρησης οφείλουν να ταυτίζονται.',
    baseline: 'maint_expiry',
    rows: [
      { page: 'maint_expiry', key: 'expiredVehicles', unit: 'οχήματα' },
      { page: 'maint_dash',   key: 'expiredVehicles', unit: 'οχήματα' },
    ],
  },
  {
    id: 'compliance',
    label: 'Συμμόρφωση στόλου %',
    why: 'Η κανονική μέτρηση αφορά ΜΟΝΟ ενεργά φορτηγά· οι σελίδες συντήρησης μετρούν φορτηγά + ρυμούλκες.',
    canonical: (d) => (typeof metrics !== 'undefined' && metrics.compliancePct)
      ? metrics.compliancePct(d.trucks).pct : null,
    canonicalLabel: 'metrics.compliancePct() — μόνο ενεργά φορτηγά',
    rows: [
      { page: 'dashboard',    key: 'compliancePct', unit: '%' },
      { page: 'maint_expiry', key: 'compliancePct', unit: '%',
        declared: 'Μετρά φορτηγά + ρυμούλκες — ευρύτερος στόλος από την κανονική' },
      { page: 'maint_dash',   key: 'compliancePct', unit: '%',
        declared: 'Μετρά φορτηγά + ρυμούλκες — ευρύτερος στόλος από την κανονική' },
    ],
  },
  {
    id: 'weekly_score',
    label: 'Εβδομαδιαίο σκορ',
    why: 'Το KPI και το γράφημα δίπλα του βγαίνουν από ΔΥΟ διαφορετικούς τύπους.',
    canonical: (d) => {
      if (typeof metrics === 'undefined' || !metrics.weeklyScore) return null;
      const w = metrics._weekOf(metrics._today());
      const ar = metrics.assignmentRate(d.orders, { week: w });
      const ot = metrics.onTimePct(d.orders, { period: { daysBack: 30 } });
      const comp = metrics.compliancePct(d.trucks);
      return metrics.weeklyScore({
        assignment_rate: ar.pct, on_time: ot.pct, compliance: comp.pct, dead_km_score: 75,
      }).score;
    },
    canonicalLabel: 'metrics.weeklyScore() — βάρη 30/30/25/15, με ΕΚΤΙΜΩΜΕΝΟ dead km 75· ενδεικτική, όχι βάση σύγκρισης',
    preferBaseline: true,
    baseline: 'performance',
    baselineKey: 'weeklyScore',
    rows: [
      { page: 'performance', key: 'weeklyScore',      label: 'Η Απόδοσή μου — κάρτα KPI', unit: '/100' },
      { page: 'performance', key: 'weeklyScoreTrend', label: 'Η Απόδοσή μου — γράφημα', unit: '/100',
        note: 'τοπικός τύπος στο _perfTrends(): αντικαθιστά τη συμμόρφωση με κενά γυρίσματα και καρφώνει 50 για νεκρά χλμ' },
      { page: 'dashboard',   key: 'weeklyScore',      label: 'Πίνακας Ελέγχου — δαχτυλίδι', unit: '/100' },
    ],
  },
  {
    id: 'invoicing_tabs',
    label: 'Παραγγελίες τιμολόγησης',
    why: 'Το άθροισμα των καρτελών ξεπερνά το σύνολο — γιατί οι καρτέλες επικαλύπτονται.',
    canonical: null,
    canonicalNote: 'Δεν υπάρχει κανονική μέτρηση· η σύγκριση είναι το σύνολο της σελίδας.',
    baseline: 'invoicing',
    baselineKey: 'total',
    rows: [
      { page: 'invoicing', key: 'total',    label: 'Σύνολο παραγγελιών' },
      { page: 'invoicing', key: '_tabSum',  label: 'Άθροισμα των 4 καρτελών',
        compute: v => v.ready + v.overdue + v.blocked + v.invoiced,
        declared: 'Ξεπερνά το σύνολο εκ κατασκευής: το Overdue είναι φίλτρο ηλικίας πάνω στα Ready/Blocked, άρα μετριούνται δύο φορές' },
      { page: 'invoicing', key: 'ready',    label: 'Καρτέλα «Ready»',
        declared: 'Υποσύνολο του συνόλου' },
      { page: 'invoicing', key: 'overdue',  label: 'Καρτέλα «Overdue»',
        declared: 'Υποσύνολο· επικαλύπτεται με Ready και Blocked' },
      { page: 'invoicing', key: 'blocked',  label: 'Καρτέλα «Blocked»',
        declared: 'Υποσύνολο του συνόλου' },
      { page: 'invoicing', key: 'invoiced', label: 'Καρτέλα «Invoiced»',
        declared: 'Υποσύνολο του συνόλου' },
    ],
  },
  {
    id: 'expiry_valid_vs_compliant',
    label: 'Λήξεις Εγγράφων — «συμμόρφωση» έναντι «VALID»',
    why: 'Στην ίδια οθόνη, δίπλα δίπλα: το ποσοστό συμμόρφωσης βγαίνει από άλλον αριθμό οχημάτων από την κάρτα VALID.',
    canonical: null,
    canonicalNote: 'Εσωτερική συνέπεια μίας σελίδας — δεν υπάρχει κανονική τιμή, βάση είναι ο αριθμητής της συμμόρφωσης.',
    baseline: 'maint_expiry',
    baselineKey: 'compliantVehicles',
    rows: [
      { page: 'maint_expiry', key: 'compliantVehicles', label: 'Αριθμητής συμμόρφωσης', unit: 'οχήματα' },
      { page: 'maint_expiry', key: 'validVehicles', label: 'Κάρτα «VALID»', unit: 'οχήματα',
        declared: 'Το VALID εξαιρεί και όσα λήγουν εντός 30 ημερών· η συμμόρφωση τα μετρά ως εντάξει' },
    ],
  },
  {
    id: 'fleet_trucks',
    label: 'Πλήθος φορτηγών',
    why: 'Η σελίδα Φορτηγά λέει 36, ο Πίνακας Ελέγχου και η Συντήρηση λένε 27 — χωρίς να γράφει πουθενά γιατί.',
    canonical: null,
    canonicalNote: 'Δεν υπάρχει κανονική μέτρηση· βάση σύγκρισης τα ενεργά φορτηγά της σελίδας Φορτηγά.',
    baseline: 'trucks',
    baselineKey: 'active',
    rows: [
      { page: 'trucks',     key: 'active',       label: 'Φορτηγά — ενεργά' },
      { page: 'trucks',     key: 'total',        label: 'Φορτηγά — όλες οι εγγραφές',
        declared: 'Περιλαμβάνει και ανενεργά· η σελίδα δεν το δηλώνει στον τίτλο' },
      { page: 'dashboard',  key: 'activeTrucks' },
      { page: 'maint_dash', key: 'activeTrucks' },
    ],
  },
];

/**
 * Build the cross-check table from page-reported figures.
 * Pure read: nothing here touches a page or a metric.
 * @returns {{checks: Array, diffCount: number, pagesSeen: number}}
 */
function _auditCrossCompute() {
  const reported = (typeof readPageMetrics === 'function') ? readPageMetrics() : {};
  const d = AUDIT.sources || {};
  let diffCount = 0;

  const checks = AUDIT_CROSS_CHECKS.map(chk => {
    let canonical = null;
    if (typeof chk.canonical === 'function') {
      // A canonical formula that throws must not take the page down with it —
      // the row simply reports that it could not be computed.
      try { canonical = chk.canonical(d); } catch (_) { canonical = null; }
      if (typeof canonical !== 'number' || !Number.isFinite(canonical)) canonical = null;
    }

    const rows = chk.rows.map(r => {
      const entry = reported[r.page];
      let value = null;
      if (entry && entry.values) {
        if (typeof r.compute === 'function') {
          // Derived rows exist for the cases where the disagreement is in the
          // arithmetic rather than in any single reported figure — "the tabs
          // add up to 194 in a total of 97" is only visible once something
          // adds them up.
          try {
            const v = r.compute(entry.values);
            if (typeof v === 'number' && Number.isFinite(v)) value = v;
          } catch (_) { value = null; }
        } else if (typeof entry.values[r.key] === 'number' && entry.values[r.key] !== -1) {
          // -1 is the "not applicable this render" marker the pages report.
          value = entry.values[r.key];
        }
      }
      return Object.assign({}, r, { label: r.label || _auditPageName(r.page), value, at: entry ? entry.at : null, seen: !!entry });
    });

    // What everything else is measured against: the canonical value when there
    // is one, otherwise the explicitly named baseline page.
    //
    // preferBaseline flips that for one case: the weekly score. Its canonical
    // value feeds an ESTIMATED dead-km term (75, as metrics.js itself notes),
    // so measuring the pages against it turns every row red and buries the
    // actual finding — that one page renders two different scores for the same
    // week. The canonical stays on screen as context; the comparison is
    // page-to-page.
    let base = chk.preferBaseline ? null : canonical;
    // The exact row acting as the yardstick, so it can be labelled as such
    // instead of reading "identical to itself".
    let baseKey = null;
    if (base === null && chk.baseline) {
      const first = chk.rows.find(r => r.page === chk.baseline);
      baseKey = chk.baselineKey || (first ? first.key : null);
      const bRow = rows.find(r => r.page === chk.baseline && r.key === baseKey);
      base = bRow ? bRow.value : null;
      if (base === null) baseKey = null;
    }

    rows.forEach(r => {
      r.diff = (base !== null && r.value !== null) ? r.value - base : null;
      r.isBase = (baseKey !== null && r.page === chk.baseline && r.key === baseKey);
      r.fault = r.diff !== null && r.diff !== 0 && !r.declared && !r.isBase;
      if (r.fault) diffCount++;
    });

    return Object.assign({}, chk, { canonical, base, rows });
  });

  const pagesSeen = Object.keys(reported).length;
  return { checks, diffCount, pagesSeen };
}

async function renderMetricsAudit() {
  const c = document.getElementById('content');
  c.style.padding = '';
  c.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-mid);font-size:13px">Φόρτωση δεδομένων ελέγχου…</div>`;

  if (AUDIT.fetching) return;
  AUDIT.fetching = true;

  try {
    // Fetch all source data in parallel (uses cache where available).
    //
    // Every fetch goes through safeFetch rather than `.catch(() => [])`. This
    // page is the one place that matters most: its whole purpose is to VERIFY
    // accuracy by comparing figures against other pages, so a source table
    // that silently returns [] produces a confidently wrong number on the very
    // screen you would use to catch a wrong number. With 13 sources, one
    // unreachable table used to shift an unknown subset of the metrics below
    // with no indication which. safeFetch reports the failure to /app-errors
    // and tags the empty so _runAllMetrics can mark what is unreliable.
    // See core/utils.js safeFetch() and SESSION.md learning #105.
    const [orders, natOrders, natLoads, trucks, trailers, drivers, partners,
           locations, clients, ramp, maintReq, plSup, plPart] = await Promise.all([
      safeFetch(() => atGetAll(TABLES.ORDERS, { fields: [
        'Order Number','Direction','Status','Invoiced','Price','Loading DateTime','Delivery DateTime',
        'Truck','Partner','Trailer','Driver','Total Pallets','Week Number',
        'Delivery Performance','Pallet Exchange','Pallet Sheet 1 Uploaded','Pallet Sheet 2 Uploaded',
        'Veroia Switch','Docs Ready','Temp OK','CMR Photo Received','Client Notified','Driver Notified'
      ]}, true), 'metrics audit: ORDERS'),
      safeFetch(() => atGetAll(TABLES.NAT_ORDERS, { fields: ['Status','Invoiced','Price','Truck','Partner','Loading DateTime'] }, true), 'metrics audit: NAT_ORDERS'),
      safeFetch(() => atGetAll(TABLES.NAT_LOADS, { fields: ['Status','Truck','Partner','Loading DateTime','Direction'] }, true), 'metrics audit: NAT_LOADS'),
      safeFetch(() => atGetAll(TABLES.TRUCKS, { fields: ['License Plate','Active','KTEO Expiry','KEK Expiry','Insurance Expiry'] }, true), 'metrics audit: TRUCKS'),
      safeFetch(() => atGetAll(TABLES.TRAILERS, { fields: ['License Plate', ...TRAILER_EXPIRY_NAMES] }, true), 'metrics audit: TRAILERS'),
      safeFetch(() => atGetAll(TABLES.DRIVERS, { fields: ['Full Name','Active'] }, true), 'metrics audit: DRIVERS'),
      safeFetch(() => atGetAll(TABLES.PARTNERS, { fields: ['Company Name'] }, true), 'metrics audit: PARTNERS'),
      safeFetch(() => atGetAll(TABLES.LOCATIONS, { fields: ['Name','City'] }, true), 'metrics audit: LOCATIONS'),
      safeFetch(() => atGetAll(TABLES.CLIENTS, { fields: ['Company Name'] }, true), 'metrics audit: CLIENTS'),
      safeFetch(() => atGetAll(TABLES.RAMP, { fields: ['Type','Status','Pallets','Plan Date','Stock Status'] }, false), 'metrics audit: RAMP'),
      safeFetch(() => atGetAll(TABLES.MAINT_REQ, { fields: ['Status','Priority','Date Reported'] }, true), 'metrics audit: MAINT_REQ'),
      safeFetch(() => atGetAll(TABLES.PALLET_LEDGER_SUPPLIERS, { fields: ['Direction','Pallets','Loading Supplier'] }, false), 'metrics audit: PALLET_LEDGER_SUPPLIERS'),
      safeFetch(() => atGetAll(TABLES.PALLET_LEDGER_PARTNERS, { fields: ['Direction','Pallets','Partner'] }, false), 'metrics audit: PALLET_LEDGER_PARTNERS'),
    ]);

    const sources = { orders, natOrders, natLoads, trucks, trailers, drivers, partners, locations, clients, ramp, maintReq, plSup, plPart };
    AUDIT.sources = sources;
    // Which sources failed to load, by the name _runAllMetrics uses for them.
    // Empty on a healthy load, so the banner and the per-row warnings below
    // cost nothing in the normal case.
    AUDIT.failedSources = Object.keys(sources).filter(k => typeof didFail === 'function' && didFail(sources[k]));

    AUDIT.results = _runAllMetrics(sources);
    AUDIT.loadedAt = new Date();
    _auditDraw();
  } catch(e) {
    // Static message only: e.message can carry Airtable internals (field names,
    // record IDs) and would land in innerHTML unescaped. Detail goes to the gated log.
    // Failure is not emptiness (DESIGN.md #7): say what happened, what it does
    // NOT mean, and what to do — and give the retry right here.
    c.innerHTML = `<div style="padding:16px;border:1px solid var(--danger);border-radius:6px;background:var(--surface-card);font-size:13px;color:var(--text)">
      <b style="color:var(--danger)">Δεν φορτώθηκαν τα δεδομένα ελέγχου.</b>
      Δεν σημαίνει ότι οι μετρήσεις είναι λάθος — δεν υπολογίστηκαν καθόλου. Η αποτυχία έχει καταγραφεί.
      <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="renderMetricsAudit()">Ξαναδοκίμασε</button>
    </div>`;
    if (typeof logError === 'function') logError(e, 'metrics_audit load');
  } finally {
    AUDIT.fetching = false;
  }
}

function _runAllMetrics(d) {
  const curWeek = metrics._weekOf(metrics._today());
  const period30 = { daysBack: 30 };
  const results = [];

  const add = (category, key, label, value, note, diag) => {
    results.push({ category, key, label, value, note, diag: diag || [] });
  };
  // A percentage with no denominator is unknown, not 0% (DESIGN.md #3): "0%
  // on time" out of zero deliveries would read as a perfect failure.
  const pct = (p, total) => (total > 0 ? p + '%' : '—');
  const eur = n => '€' + n.toLocaleString('el-GR');

  // ════ OPERATIONAL ═══════════════════════════════
  try {
    const unassignedExp = metrics.unassignedOrders(d.orders, { direction: 'Export', period: period30 });
    add('op', 'op.unassigned_export', 'Εξαγωγές χωρίς ανάθεση (30ημ)', unassignedExp, 'Παραγγελίες χωρίς φορτηγό/συνεργάτη');

    const unassignedImp = metrics.unassignedOrders(d.orders, { direction: 'Import', period: period30 });
    add('op', 'op.unassigned_import', 'Εισαγωγές χωρίς ανάθεση (30ημ)', unassignedImp);

    const pending = metrics.pendingToday(d.orders);
    add('op', 'op.pending_today', 'Εκκρεμείς σήμερα', pending, 'Φόρτωση σήμερα, δεν ξεκίνησαν');

    const loadDone = metrics.loadingsDone(d.orders);
    add('op', 'op.loadings_today_done', 'Φορτώσεις που έγιναν σήμερα', loadDone);

    const delDone = metrics.deliveriesDone(d.orders);
    add('op', 'op.deliveries_today_done', 'Παραδόσεις που έγιναν σήμερα', delDone);

    const chkProg = metrics.checklistProgress(d.orders);
    add('op', 'op.checklist_pct', 'Πρόοδος λίστας ελέγχου (όλες)', pct(chkProg.pct, chkProg.total), `${chkProg.done}/${chkProg.total} έλεγχοι`);

    const overdue = metrics.overdueDeliveries(d.orders);
    add('op', 'op.overdue_deliveries', 'Καθυστερημένες παραδόσεις', overdue.length, 'Η ημερομηνία παράδοσης πέρασε, δεν παραδόθηκαν',
      overdue.length > 0 ? [`Δείγμα: ${overdue.slice(0,3).map(r => r.fields['Order Number']||r.id.slice(-6)).join(', ')}`] : []);

    const highRisk = metrics.highRiskDeliveries(d.orders);
    add('op', 'op.high_risk', 'Παραδόσεις υψηλού ρίσκου (<48ω χωρίς ανάθεση)', highRisk);

    const flow = metrics.rampPalletFlow(d.ramp);
    add('op', 'op.pallet_flow', 'Ροή παλετών ράμπας σήμερα', `${flow.inbound} ΕΙΣ / ${flow.outbound} ΕΞ / ${flow.net} ΚΑΘ.`, 'εγγραφές ράμπας');

    const stock = metrics.stockInWarehouse(d.ramp);
    add('op', 'op.stock_pallets', 'Απόθεμα στην αποθήκη', stock + ' παλέτες', 'Done + In Stock');
  } catch(e) { add('op', '_error', 'Σφάλμα υπολογισμού', 'ΣΦΑΛΜΑ: '+e.message); }

  // ════ PERFORMANCE ══════════════════════════════
  try {
    const otAll = metrics.onTimePct(d.orders);
    add('perf', 'perf.on_time_pct', 'Εμπρόθεσμες % (συνολικά)', pct(otAll.pct, otAll.total), `${otAll.onTime}/${otAll.total} με καταχωρημένη επίδοση`,
      otAll.total === 0 ? ['⚠ Καμία παραγγελία με Delivery Performance — δεν υπολογίζεται'] : []);

    const ot30 = metrics.onTimePct(d.orders, { period: { daysBack: 30 } });
    add('perf', 'perf.on_time_pct_30d', 'Εμπρόθεσμες % (30ημ)', pct(ot30.pct, ot30.total), `${ot30.onTime}/${ot30.total}`);

    const cmr = metrics.cmrSameDayPct(d.orders, { period: period30 });
    add('perf', 'perf.cmr_pct', 'CMR παρελήφθη % (παραδόσεις 30ημ)', pct(cmr.pct, cmr.total), `${cmr.withCMR}/${cmr.total}`);

    const clientUp = metrics.clientUpdatePct(d.orders, { period: period30 });
    add('perf', 'perf.client_update_pct', 'Ενημέρωση πελάτη % (παραδόσεις 30ημ)', pct(clientUp.pct, clientUp.total), `${clientUp.notified}/${clientUp.total}`);

    const streak = metrics.onTimeStreak(d.orders, { currentWeek: curWeek, threshold: 90 });
    add('perf', 'perf.on_time_streak', 'Σερί εμπρόθεσμων (εβδομάδες ≥90%)', streak + ' εβδ.');

    const trend = metrics.onTimeTrend(d.orders, { weeks: 4, currentWeek: curWeek });
    add('perf', 'perf.on_time_trend', 'Τάση εμπρόθεσμων (4 εβδομάδες)',
      trend.map(t => `Ε${t.week}: ${pct(t.pct, t.total)} (${t.total})`).join(' · '));

    const exports = d.orders.filter(r => r.fields['Direction'] === 'Export');
    const imports = d.orders.filter(r => r.fields['Direction'] === 'Import');
    const el = metrics.emptyLegs(exports, imports);
    add('perf', 'perf.empty_legs', 'Κενά γυρίσματα (εκτίμηση)', el.total, `${el.soloExp} μόνες εξαγωγές + ${el.soloImp} μόνες εισαγωγές`);
  } catch(e) { add('perf', '_error', 'Σφάλμα υπολογισμού', 'ΣΦΑΛΜΑ: '+e.message); }

  // ════ FINANCIAL ══════════════════════════════════
  try {
    const out = metrics.outstandingBalance(d.orders, d.natOrders);
    add('fin', 'fin.outstanding_balance', 'Ανεξόφλητο υπόλοιπο', eur(out),
      'Παραδόθηκαν, δεν τιμολογήθηκαν', out === 0 ? ['⚠ Μηδέν — έλεγξε το πεδίο Invoiced και τις τιμές Status'] : []);

    const revInv = metrics.revenueInvoiced(d.orders, d.natOrders);
    add('fin', 'fin.revenue_invoiced', 'Έσοδα (τιμολογημένα σύνολο)', eur(revInv), 'Συνολικά');

    const rev30 = metrics.revenueInvoiced(d.orders, d.natOrders, { period: period30 });
    add('fin', 'fin.revenue_invoiced_30d', 'Έσοδα τιμολογημένα (30ημ)', eur(rev30));

    const ready = metrics.revenueReadyToInvoice(d.orders);
    add('fin', 'fin.revenue_ready', 'Έσοδα έτοιμα για τιμολόγηση', eur(ready), 'Παραδόθηκαν + δελτία εντάξει');

    const overdueInv = metrics.overdueInvoices(d.orders);
    add('fin', 'fin.overdue_invoices', 'Εκπρόθεσμα τιμολόγια (>30ημ)', overdueInv.length);

    const palSup = metrics.palletBalance(d.plSup, { counterpartyField: 'Loading Supplier' });
    add('fin', 'fin.pallet_balance_sup', 'Καθαρό ισοζύγιο παλετών προμηθευτών', palSup.total,
      `${Object.keys(palSup.balances).length} προμηθευτές`);

    const palPart = metrics.palletBalance(d.plPart, { counterpartyField: 'Partner' });
    add('fin', 'fin.pallet_balance_part', 'Καθαρό ισοζύγιο παλετών συνεργατών', palPart.total,
      `${Object.keys(palPart.balances).length} συνεργάτες`);
  } catch(e) { add('fin', '_error', 'Σφάλμα υπολογισμού', 'ΣΦΑΛΜΑ: '+e.message); }

  // ════ FLEET ═══════════════════════════════════════
  try {
    const util = metrics.fleetUtilization(d.trucks, d.orders, { week: curWeek });
    add('fleet', 'fleet.utilization', 'Αξιοποίηση στόλου (τρέχουσα εβδ.)', pct(util.pct, util.total), `${util.busy}/${util.total} απασχολημένα`);

    const idle = metrics.idleTrucks(d.trucks, d.orders, { week: curWeek });
    add('fleet', 'fleet.idle', 'Αδρανή φορτηγά (τρέχουσα εβδ.)', idle);

    const expAlerts = metrics.expiryAlerts(d.trucks, { daysAhead: 30 });
    add('fleet', 'fleet.expiry_30d', 'Φορτηγά με έγγραφα προς λήξη (30ημ)',
      `${expAlerts.total} φορτηγά`, `ΚΤΕΟ: ${expAlerts.kteo.length}, ΚΕΚ: ${expAlerts.kek.length}, Ασφάλεια: ${expAlerts.insurance.length}`);

    const trailAlerts = metrics.expiryAlertsTrailers(d.trailers, { daysAhead: 30 });
    add('fleet', 'fleet.expiry_trailers', 'Ρυμούλκες με έγγραφα προς λήξη (30ημ)',
      `${trailAlerts.total} ρυμούλκες`, `ΚΤΕΟ: ${trailAlerts.kteo.length}, FRC: ${trailAlerts.frc.length}, Ασφάλεια: ${trailAlerts.insurance.length}`);

    const comp = metrics.compliancePct(d.trucks);
    add('fleet', 'fleet.compliance', 'Συμμόρφωση % (όλα τα έγγραφα σε ισχύ)', pct(comp.pct, comp.total), `${comp.valid}/${comp.total} ενεργά φορτηγά`);

    const down = metrics.fleetDowntime(d.maintReq);
    add('fleet', 'fleet.downtime', 'Ακινησία στόλου (εκτίμηση)', down + ' ώρες', `Με βάση ${d.maintReq.filter(r=>r.fields['Status']!=='Done').length} εκκρεμή αιτήματα συντήρησης`);
  } catch(e) { add('fleet', '_error', 'Σφάλμα υπολογισμού', 'ΣΦΑΛΜΑ: '+e.message); }

  // ════ HR ═════════════════════════════════════════
  try {
    const ar = metrics.assignmentRate(d.orders, { week: curWeek });
    add('hr', 'hr.assignment_rate', 'Ποσοστό ανάθεσης (τρέχουσα εβδ.)', pct(ar.pct, ar.total), `${ar.assigned}/${ar.total}`);

    const ptp = metrics.partnerTripPct(d.orders, { week: curWeek });
    add('hr', 'hr.partner_trip_pct', 'Δρομολόγια συνεργατών % (τρέχουσα εβδ.)', pct(ptp.pct, ptp.assigned), `${ptp.partners}/${ptp.assigned} των ανατεθειμένων`);

    const wor = metrics.workOrdersResolvedPct(d.maintReq);
    add('hr', 'hr.work_orders_resolved', 'Εντολές εργασίας που έκλεισαν %', pct(wor.pct, wor.total), `${wor.resolved}/${wor.total}`);

    const crisis = metrics.crisisEventsResolved(d.maintReq);
    add('hr', 'hr.crisis_resolved', 'Επείγοντα που έκλεισαν', crisis);
  } catch(e) { add('hr', '_error', 'Σφάλμα υπολογισμού', 'ΣΦΑΛΜΑ: '+e.message); }

  // ════ INVENTORY ═════════════════════════════════
  try {
    const sheets = metrics.palletSheetsComplete(d.orders);
    add('inv', 'inv.sheets_complete', 'Δελτία PE πλήρη %', pct(sheets.pct, sheets.total), `${sheets.complete}/${sheets.total} παραγγελίες με PE`);

    const ages = metrics.stockAgeBuckets(d.ramp);
    add('inv', 'inv.stock_age', 'Ηλικία αποθέματος',
      `≤1ημ: ${ages.fresh_le_1d} · 2-3ημ: ${ages.aging_2_3d} · >3ημ: ${ages.old_gt_3d}`);
  } catch(e) { add('inv', '_error', 'Σφάλμα υπολογισμού', 'ΣΦΑΛΜΑ: '+e.message); }

  // ════ BUSINESS HEALTH ═══════════════════════════
  try {
    const ar = metrics.assignmentRate(d.orders, { week: curWeek });
    const ot = metrics.onTimePct(d.orders, { period: period30 });
    const comp = metrics.compliancePct(d.trucks);
    const score = metrics.weeklyScore({
      assignment_rate: ar.pct, on_time: ot.pct, compliance: comp.pct, dead_km_score: 75,
    });
    add('biz', 'biz.weekly_score', 'Εβδομαδιαίο σκορ (σύνθετο)', score.score + '/100',
      `${({ green: 'ΠΡΑΣΙΝΟ', yellow: 'ΚΙΤΡΙΝΟ', red: 'ΚΟΚΚΙΝΟ' })[score.color] || score.color} · ανάθεση ${pct(ar.pct, ar.total)} · εμπρόθεσμες ${pct(ot.pct, ot.total)} · συμμόρφωση ${pct(comp.pct, comp.total)} · νεκρά χλμ 75% (εκτίμηση)`);

    const impCount = d.orders.filter(r => r.fields['Direction']==='Import' && r.fields['Week Number']===curWeek).length;
    const expCount = d.orders.filter(r => r.fields['Direction']==='Export' && r.fields['Week Number']===curWeek).length;
    const imb = metrics.directionImbalance(expCount, impCount);
    add('biz', 'biz.imbalance', 'Ανισορροπία κατεύθυνσης (τρέχουσα εβδ.)', imb, `${expCount} εξαγωγές έναντι ${impCount} εισαγωγών`);
  } catch(e) { add('biz', '_error', 'Σφάλμα υπολογισμού', 'ΣΦΑΛΜΑ: '+e.message); }

  return results;
}

// Scoped styles for this page. They live in the module rather than style.css
// because this is an internal audit tool: it must not add weight to the
// stylesheet every production screen loads. Colours are tokens only (DESIGN.md
// ΜΕΡΟΣ Β); the per-category tints the page used to have are gone on purpose —
// the category name is the meaning, the colour was decoration.
const AUDIT_CSS = `
.ma-wrap{font-size:13px;color:var(--text)}
.ma-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
.ma-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:var(--text);margin:0}
.ma-sub{font-size:12px;color:var(--text-mid);margin-top:4px}
.ma-actions{display:flex;gap:8px}
.ma-status{padding:8px 12px;border:1px solid;border-radius:6px;margin-bottom:8px;font-size:13px;font-weight:700;background:var(--surface-card)}
.ma-status.ok{border-color:var(--ok);color:var(--ok)}
.ma-status.bad{border-color:var(--danger);color:var(--danger)}
.ma-status small{font-weight:400;font-size:12px;color:var(--text-mid)}
.ma-note{background:var(--surface-sunken);border:1px solid var(--border);color:var(--text-mid);padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:12px;line-height:1.4}
.ma-note b{color:var(--text)}
.ma-warn{background:var(--warn-bg);border:1px solid var(--warn-border);color:var(--warn);padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:13px;line-height:1.4}
.ma-section{font-family:'Syne',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;color:var(--text-mid);margin:0 0 8px}
.ma-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(720px,1fr));gap:12px;margin-bottom:16px}
.ma-card{background:var(--surface-card);border:1px solid var(--border);border-radius:6px;padding:12px;min-width:0}
.ma-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px}
.ma-card-title{font-family:'Syne',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;color:var(--text)}
.ma-card-title.bad{color:var(--danger)}
.ma-cat-title{font-family:'Syne',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;color:var(--text);margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)}
.ma-why{font-size:12px;color:var(--text-mid);margin-bottom:4px}
.ma-canon{font-size:12px;color:var(--text-mid);margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)}
.ma-canon b{color:var(--text);font-variant-numeric:tabular-nums}
.ma-k{font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim)}
.ma-badge{font-size:11px;font-weight:700;padding:0 8px;border-radius:9999px;border:1px solid var(--danger);color:var(--danger);white-space:nowrap;font-variant-numeric:tabular-nums}
.ma-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
.ma-table th{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim);padding:4px 8px;text-align:left;border-bottom:1px solid var(--border)}
.ma-table td{padding:4px 8px;border-bottom:1px solid var(--border);vertical-align:middle;line-height:1.25;overflow-wrap:break-word;color:var(--text)}
.ma-table tbody tr:hover td{background:var(--surface-sunken)}
.ma-table .r{text-align:right}
.ma-num{font-variant-numeric:tabular-nums;font-weight:700}
.ma-dim{color:var(--text-dim);font-weight:400}
.ma-lbl{font-weight:600}
.ma-key{font-family:monospace;font-size:11px;color:var(--text-dim)}
.ma-sec{font-size:11px;color:var(--text-dim);font-variant-numeric:tabular-nums}
.ma-row-fault td:first-child{box-shadow:inset 3px 0 0 var(--danger)}
.ma-row-declared td,.ma-row-warn td{background:var(--warn-bg)}
.ma-row-declared td:first-child,.ma-row-warn td:first-child{box-shadow:inset 3px 0 0 var(--warn)}
.ma-ok{color:var(--ok);font-weight:700}
.ma-bad{color:var(--danger);font-weight:700}
.ma-warnt{color:var(--warn)}
.ma-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
.ma-search{flex:1;min-width:200px;height:28px;padding:0 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:'DM Sans',sans-serif;color:var(--text);background:var(--surface-card)}
.ma-tab.on{background:var(--surface-dark);border-color:var(--surface-dark);color:var(--text-on-dark)}
.ma-tab .ma-cnt{font-variant-numeric:tabular-nums;font-weight:400;margin-left:4px}
.ma-empty{background:var(--surface-card);border:1px solid var(--border);border-radius:6px;padding:16px;color:var(--text-mid);font-size:13px}
.ma-legend{background:var(--surface-card);border:1px solid var(--border);border-radius:6px;padding:12px;margin-top:12px;font-size:12px;color:var(--text-mid)}
`;

/**
 * Render the cross-check section: canonical value · page value · difference.
 * @param {{checks: Array, diffCount: number, pagesSeen: number}} cross
 * @param {string} q - lowercased search term, '' for none
 */
function _auditCrossHTML(cross, q) {
  const match = chk => !q
    || chk.label.toLowerCase().includes(q)
    || chk.rows.some(r => (r.label || '').toLowerCase().includes(q) || r.page.includes(q) || r.key.toLowerCase().includes(q));
  const visible = cross.checks.filter(match);

  if (!visible.length) {
    return `<div class="ma-empty">Καμία διασταύρωση δεν ταιριάζει με «${escapeHtml(q)}».</div>`;
  }

  const cell = (r) => {
    // Not opened yet is a different state from opened-and-reported-nothing, and
    // the difference matters: the first is "go look at that page", the second
    // is "that page stopped reporting this figure".
    if (!r.seen)          return `<span class="ma-dim" title="Άνοιξε τη σελίδα για να καταγραφεί">δεν άνοιξε</span>`;
    if (r.value === null) return `<span class="ma-dim">δεν αναφέρθηκε</span>`;
    // The capture time sits under the value, not in the note: the note column
    // already carries the explanation and a third line there pushes the row
    // past 44px.
    const at = r.at ? `<div class="ma-sec">${new Date(r.at).toLocaleTimeString('el-GR')}</div>` : '';
    return `<span class="ma-num">${r.value}${r.unit ? ' ' + escapeHtml(r.unit) : ''}</span>${at}`;
  };

  // Colour never carries the meaning alone (DESIGN.md #2): every non-zero
  // difference is labelled "διαφορά" or "δηλωμένη" next to its number.
  const diffCell = (r) => {
    if (r.diff === null) return `<span class="ma-dim">—</span>`;
    if (r.isBase)        return `<span class="ma-dim">βάση</span>`;
    if (r.diff === 0)    return `<span class="ma-ok">✓ ίδιο</span>`;
    const sign = r.diff > 0 ? '+' : '';
    return r.declared
      ? `<span class="ma-warnt ma-num">${sign}${r.diff} δηλωμένη</span>`
      : `<span class="ma-bad ma-num">${sign}${r.diff} διαφορά</span>`;
  };

  return visible.map(chk => {
    const faults = chk.rows.filter(r => r.fault).length;
    const canonLine = chk.canonical !== null
      ? `<b>${chk.canonical}</b> <span class="ma-dim">· ${escapeHtml(chk.canonicalLabel || 'core/metrics.js')}</span>`
      : `<span class="ma-dim">${escapeHtml(chk.canonicalNote || 'Δεν υπάρχει κανονική τιμή.')}</span>`;

    return `
    <div class="ma-card">
      <div class="ma-card-head">
        <div class="ma-card-title${faults ? ' bad' : ''}">${escapeHtml(chk.label)}</div>
        ${faults ? `<span class="ma-badge">${faults} ${faults === 1 ? 'διαφορά' : 'διαφορές'}</span>` : ''}
      </div>
      <div class="ma-why">${escapeHtml(chk.why)}</div>
      <div class="ma-canon"><span class="ma-k">Κανονική τιμή</span> &nbsp;${canonLine}</div>
      <table class="ma-table">
        <thead><tr>
          <th style="width:28%">Σελίδα</th>
          <th class="r" style="width:12%">Τιμή σελίδας</th>
          <th class="r" style="width:11%">Διαφορά</th>
          <th style="width:49%">Σημείωση</th>
        </tr></thead>
        <tbody>
          ${chk.rows.map(r => {
            // Declared differences get the warm tint, real ones the red stripe:
            // the reader must be able to tell "this is expected and here is why"
            // from "nobody knows why these disagree" at a glance.
            const cls = r.fault ? 'ma-row-fault'
                      : (r.declared && r.diff !== null && r.diff !== 0) ? 'ma-row-declared' : '';
            const note = r.declared
              ? `<span class="ma-warnt">Δηλωμένη: ${escapeHtml(r.declared)}</span>`
              : (r.note ? `<span class="ma-dim">${escapeHtml(r.note)}</span>` : '');
            return `<tr class="${cls}">
              <td><div class="ma-lbl">${escapeHtml(r.label)}</div><div class="ma-key">${escapeHtml(r.page)}.${escapeHtml(r.key)}</div></td>
              <td class="r">${cell(r)}</td>
              <td class="r" style="font-size:12px">${diffCell(r)}</td>
              <td style="font-size:11px">${note}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }).join('');
}

function _auditSetQuery(v) {
  AUDIT.q = String(v || '');
  _auditDraw();
  // Re-rendering the whole panel drops focus mid-typing, which makes the box
  // unusable. Put the caret back where it was.
  const el = document.getElementById('auditSearch');
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

function _auditSetCat(k) {
  AUDIT.cat = k;
  _auditDraw();
}

function _auditDraw() {
  const c = document.getElementById('content');
  if (!AUDIT.results) return;

  const q = AUDIT.q.trim().toLowerCase();
  const cross = _auditCrossCompute();

  const byCategory = {};
  AUDIT.results.forEach(r => {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  });

  const catLabels = {
    op: { name: 'ΛΕΙΤΟΥΡΓΙΚΕΣ', ic: 'target' },
    perf: { name: 'ΑΠΟΔΟΣΗ', ic: 'bar_chart' },
    fin: { name: 'ΟΙΚΟΝΟΜΙΚΕΣ', ic: 'euro' },
    fleet: { name: 'ΣΤΟΛΟΣ', ic: 'truck' },
    hr: { name: 'ΟΜΑΔΑ', ic: 'users' },
    inv: { name: 'ΑΠΟΘΕΜΑ', ic: 'package' },
    biz: { name: 'ΕΠΙΧΕΙΡΗΣΗ', ic: 'building' },
  };

  // Sources that failed to load on this run. On a healthy load this is empty
  // and everything below behaves exactly as before.
  const failed = AUDIT.failedSources || [];
  const failedLabels = failed.map(k => AUDIT_SOURCE_LABELS[k] || k);

  // Page-level banner. The point is to stop a reader trusting a number that was
  // computed from nothing: before this, an unreachable table just produced
  // zeroes that looked like real zeroes on the page meant to verify accuracy.
  const failBanner = failed.length ? `
    <div class="ma-warn">
      <b>⚠ Κάποια νούμερα παρακάτω μπορεί να είναι λάθος.</b>
      Δεν φορτώθηκαν ${failedLabels.length} ${failedLabels.length === 1 ? 'πίνακας' : 'πίνακες'}:
      <b>${failedLabels.map(escapeHtml).join(', ')}</b>.
      Οι μετρήσεις που ${failedLabels.length === 1 ? 'τον' : 'τους'} διαβάζουν εμφανίζονται ως «—», όχι ως μηδέν —
      δεν σημαίνει ότι είναι μηδέν. Πάτησε «Ανανέωση» για νέα προσπάθεια· η αποτυχία έχει καταγραφεί.
    </div>` : '';

  // MA-6: 38 rows over 2.627px meant scanning four screens to find one
  // metric. Search matches the human label, the key, and the note.
  const filtered = cat => (byCategory[cat] || []).filter(r => !q
    || r.label.toLowerCase().includes(q)
    || r.key.toLowerCase().includes(q)
    || String(r.note || '').toLowerCase().includes(q));

  const catHTML = cat => {
    const label = catLabels[cat] || { name: cat };
    const items = filtered(cat);
    if (!items.length) return '';
    // Does this category read any source that failed? If so its numbers are
    // not trustworthy, and saying so beats printing a confident zero.
    const catFailed = (AUDIT_CATEGORY_SOURCES[cat] || []).filter(s => failed.includes(s));
    const catWarn = catFailed.length ? `
      <div class="ma-warnt" style="font-size:11px;font-weight:600;margin:-4px 0 8px">
        ⚠ Αναξιόπιστες: δεν φορτώθηκε ${catFailed.map(s => escapeHtml(AUDIT_SOURCE_LABELS[s] || s)).join(', ')}
      </div>` : '';
    return `
    <div class="ma-card" style="margin-bottom:12px">
      <div class="ma-cat-title">${(typeof icon==='function'&&label.ic)?icon(label.ic,12):''} ${label.name}</div>
      ${catWarn}
      <table class="ma-table">
        <thead><tr>
          <th style="width:30%">Μέτρηση</th>
          <th style="width:20%">Κλειδί</th>
          <th class="r" style="width:20%">Τιμή</th>
          <th style="width:30%">Σημείωση</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const isErr = String(r.value).startsWith('ΣΦΑΛΜΑ');
            const hasWarn = (r.diag||[]).length > 0 || isErr || catFailed.length > 0;
            // A metric whose source did not load is displayed as "—" with an
            // explanation, never as the 0 the computation produced from an
            // empty array. That substitution is the whole point of this page's
            // conversion: on the accuracy-checking screen, a wrong number is
            // worse than a missing one.
            const value = catFailed.length
              ? '<span class="ma-warnt" title="Δεν φορτώθηκαν τα δεδομένα πηγής">—</span>'
              : `<span class="ma-num${isErr ? ' ma-bad' : ''}">${r.value}</span>`;
            const note = catFailed.length
              ? `<span class="ma-warnt">Μη διαθέσιμη: δεν φορτώθηκαν τα δεδομένα πηγής</span>`
              : `${r.note || ''}${r.diag && r.diag.length ? '<br><span class="ma-warnt">'+r.diag.join(' · ')+'</span>' : ''}`;
            return `<tr class="${hasWarn ? 'ma-row-warn' : ''}">
              <td class="ma-lbl">${r.label}</td>
              <td class="ma-key">${r.key}</td>
              <td class="r">${value}</td>
              <td class="ma-dim" style="font-size:11px">${note}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  };

  // Pages a cross-check needs but which have not rendered this session. Naming
  // them turns "δεν άνοιξε" from a dead end into an instruction.
  const unseenPages = [...new Set(
    cross.checks.flatMap(chk => chk.rows.filter(r => !r.seen).map(r => r.page))
  )].map(_auditPageName);

  const allCats = ['op','perf','fin','fleet','hr','inv','biz'];
  const catTabs = [
    { k: 'all',   name: 'Όλες' },
    { k: 'op',    name: 'Λειτουργικές' },
    { k: 'perf',  name: 'Απόδοση' },
    { k: 'fin',   name: 'Οικονομικές' },
    { k: 'fleet', name: 'Στόλος' },
    { k: 'hr',    name: 'Ομάδα' },
    { k: 'inv',   name: 'Απόθεμα' },
    { k: 'biz',   name: 'Επιχείρηση' },
  ];
  const shownCats = AUDIT.cat === 'all' ? allCats : [AUDIT.cat];
  // A quick filter that would show nothing is disabled, not merely empty
  // (DESIGN.md Δ2): a clickable tab that leads to "no rows" is a dead end.
  const tabCount = k => (k === 'all' ? allCats : [k]).reduce((n, cat) => n + filtered(cat).length, 0);

  c.innerHTML = `
  <style>${AUDIT_CSS}</style>
  <div class="ma-wrap">
  <div class="ma-head">
    <div>
      <h2 class="ma-title">Έλεγχος Μετρήσεων</h2>
      <div class="ma-sub">
        ${AUDIT.results.length} μετρήσεις · φορτώθηκε ${AUDIT.loadedAt?.toLocaleTimeString('el-GR')||'—'} · κανονικές τιμές από <code>metrics.js</code>
      </div>
    </div>
    <div class="ma-actions">
      <button class="btn btn-ghost" onclick="_auditExportJSON()">Αντιγραφή JSON</button>
      <button class="btn btn-new-order" onclick="renderMetricsAudit()">${(typeof icon==='function')?icon('refresh',12):''} Ανανέωση</button>
    </div>
  </div>

  ${failBanner}

  <div class="ma-status ${cross.diffCount ? 'bad' : 'ok'}">
    ${cross.diffCount
      ? `⚠ ${cross.diffCount} ${cross.diffCount === 1 ? 'διαφορά εντοπίστηκε' : 'διαφορές εντοπίστηκαν'}`
      : '✓ Καμία ανεξήγητη διαφορά μεταξύ σελίδων'}
    <small>· ${cross.pagesSeen} ${cross.pagesSeen === 1 ? 'σελίδα έχει αναφέρει' : 'σελίδες έχουν αναφέρει'} τιμές σε αυτή τη συνεδρία</small>
  </div>

  <div class="ma-note">
    <b>Πώς να το χρησιμοποιήσεις:</b> άνοιξε τις σελίδες που σε ενδιαφέρουν (Πίνακας Ελέγχου, Συντήρηση, Τιμολόγηση…)
    και γύρνα εδώ. Κάθε σελίδα καταγράφει τα νούμερα που έδειξε, και ο πίνακας «Διασταυρώσεις» τα συγκρίνει
    αυτόματα. <b>Κόκκινη λωρίδα «διαφορά»</b> = δύο σελίδες διαφωνούν χωρίς εξήγηση. <b>Κίτρινη γραμμή «δηλωμένη»</b> = η διαφορά είναι
    σωστή και γράφει από πού προκύπτει.
    ${unseenPages.length ? `<div style="margin-top:4px">Δεν έχουν ανοίξει ακόμη: <b>${unseenPages.map(escapeHtml).join(', ')}</b></div>` : ''}
  </div>

  <div class="ma-section">ΔΙΑΣΤΑΥΡΩΣΕΙΣ ΜΕΤΑΞΥ ΣΕΛΙΔΩΝ</div>
  <div class="ma-grid">${_auditCrossHTML(cross, q)}</div>

  <div class="ma-section">ΜΕΤΡΗΣΕΙΣ</div>
  <div class="ma-filters">
    <input id="auditSearch" type="search" class="ma-search" value="${escapeHtml(AUDIT.q)}"
      oninput="_auditSetQuery(this.value)" placeholder="Αναζήτηση μέτρησης ή κλειδιού…">
    ${catTabs.map(t => {
      const n = tabCount(t.k);
      return `<button class="btn btn-ghost btn-sm ma-tab${AUDIT.cat === t.k ? ' on' : ''}" ${n ? '' : 'disabled'}
        onclick="_auditSetCat('${t.k}')">${t.name}<span class="ma-cnt">${n}</span></button>`;
    }).join('')}
  </div>

  ${shownCats.map(catHTML).join('') || `<div class="ma-empty">Καμία μέτρηση δεν ταιριάζει με «${escapeHtml(AUDIT.q)}».</div>`}

  <div class="ma-legend">
    <b>Υπόμνημα:</b> κίτρινη γραμμή = προειδοποίηση ή σφάλμα στη μέτρηση· «—» = δεν υπολογίζεται (λείπουν δεδομένα), όχι μηδέν.
    <b>Τύποι:</b> <code>METRICS.md</code> και <code>core/metrics.js</code>.
    <b>Διασταυρώσεις:</b> οι τιμές των σελίδων καταγράφονται κατά το render και ζουν όσο το tab —
    το εργαλείο δεν αλλάζει τίποτα, μόνο διαβάζει.
  </div>
  </div>`;
}

function _auditExportJSON() {
  const out = {
    loadedAt: AUDIT.loadedAt?.toISOString(),
    // Carried into the export deliberately: this JSON gets pasted into
    // messages as evidence, and a figure computed from a table that failed to
    // load must not travel as a bare number with no indication it is unsound.
    // Omitted entirely on a healthy load so normal exports are unchanged.
    ...((AUDIT.failedSources || []).length ? {
      warning: 'INCOMPLETE: some source tables could not be loaded; metrics derived from them are not reliable.',
      failedSources: AUDIT.failedSources,
    } : {}),
    metrics: AUDIT.results,
    // The cross-checks travel with the export: the whole reason someone pastes
    // this JSON is "these two screens disagree", and the disagreement is now a
    // computed fact rather than something the reader has to spot by eye.
    crossChecks: (() => {
      try {
        const x = _auditCrossCompute();
        return {
          diffCount: x.diffCount,
          pagesSeen: x.pagesSeen,
          checks: x.checks.map(c => ({
            id: c.id, label: c.label, canonical: c.canonical,
            rows: c.rows.map(r => ({
              page: r.page, key: r.key, label: r.label,
              value: r.value, diff: r.diff,
              declared: r.declared || null, seen: r.seen, at: r.at,
            })),
          })),
        };
      } catch (_) { return null; }
    })(),
  };
  navigator.clipboard.writeText(JSON.stringify(out, null, 2)).then(() => {
    toast('Το JSON αντιγράφηκε');
  }).catch(() => toast('Η αντιγραφή απέτυχε — δοκίμασε ξανά', 'error'));
}

// Expose
window.renderMetricsAudit = renderMetricsAudit;
window._auditExportJSON = _auditExportJSON;
window._auditSetQuery = _auditSetQuery;
window._auditSetCat = _auditSetCat;
