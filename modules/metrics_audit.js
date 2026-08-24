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
  orders: 'Orders', natOrders: 'National Orders', natLoads: 'National Loads',
  trucks: 'Trucks', trailers: 'Trailers', drivers: 'Drivers', partners: 'Partners',
  locations: 'Locations', clients: 'Clients', ramp: 'Ramp Plan',
  maintReq: 'Maintenance Requests', plSup: 'Pallet Ledger (Suppliers)',
  plPart: 'Pallet Ledger (Partners)',
};

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
      { page: 'dashboard',    key: 'weekNumber',        label: 'Dashboard' },
      { page: 'orders_intl',  key: 'weekNumberDefault', label: 'International Orders' },
      { page: 'performance',  key: 'weekNumberDefault', label: 'My Performance' },
      { page: 'weekly_intl',  key: 'weekNumberDefault', label: 'Weekly International',
        note: 'δικός του τύπος _wiCurrentWeek() (Sunday-start)' },
      { page: 'weekly_natl',  key: 'weekNumberDefault', label: 'Weekly National',
        note: 'δικός του τύπος _wnCurrentWeek() (Sunday-start)' },
    ],
  },
  {
    id: 'expired_docs',
    label: 'Ληγμένα έγγραφα στόλου',
    why: 'Τρεις οθόνες, τρία νούμερα. Δύο μετρούν έγγραφα με ΔΙΑΦΟΡΕΤΙΚΑ πεδία, μία μετρά οχήματα.',
    canonical: null,
    canonicalNote: 'Δεν υπάρχει κανονική μέτρηση στο core/metrics.js — οι σελίδες συγκρίνονται μεταξύ τους, με βάση το Maintenance Dashboard.',
    baseline: 'maint_dash',
    rows: [
      { page: 'maint_dash',   key: 'expiredDocRows',   label: 'Maintenance Dashboard', unit: 'έγγραφα' },
      { page: 'dashboard',    key: 'expiredFleetDocs', label: 'Dashboard', unit: 'έγγραφα',
        note: 'για ρυμούλκες διαβάζει ATP+Insurance· το Maintenance διαβάζει KTEO+FRC+Insurance' },
      { page: 'maint_expiry', key: 'expiredVehicles',  label: 'Expiry Alerts', unit: 'οχήματα',
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
      { page: 'maint_expiry', key: 'expiredVehicles', label: 'Expiry Alerts', unit: 'οχήματα' },
      { page: 'maint_dash',   key: 'expiredVehicles', label: 'Maintenance Dashboard', unit: 'οχήματα' },
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
      { page: 'dashboard',    key: 'compliancePct', label: 'Dashboard', unit: '%' },
      { page: 'maint_expiry', key: 'compliancePct', label: 'Expiry Alerts', unit: '%',
        declared: 'Μετρά φορτηγά + ρυμούλκες — ευρύτερος στόλος από την κανονική' },
      { page: 'maint_dash',   key: 'compliancePct', label: 'Maintenance Dashboard', unit: '%',
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
      { page: 'performance', key: 'weeklyScore',      label: 'My Performance — κάρτα KPI', unit: '/100' },
      { page: 'performance', key: 'weeklyScoreTrend', label: 'My Performance — γράφημα', unit: '/100',
        note: 'τοπικός τύπος στο _perfTrends(): αντικαθιστά τη συμμόρφωση με empty legs και καρφώνει 50 για dead km' },
      { page: 'dashboard',   key: 'weeklyScore',      label: 'Dashboard — δαχτυλίδι', unit: '/100' },
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
        declared: 'Ξεπερνά το σύνολο εκ κατασκευής — το Overdue είναι φίλτρο ηλικίας πάνω στα ίδια Ready/Blocked, άρα μετριούνται δύο φορές' },
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
    label: 'Expiry Alerts — «συμμόρφωση» vs «VALID»',
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
    why: 'Η σελίδα Φορτηγά λέει 36, το Dashboard και η Συντήρηση λένε 27 — χωρίς να γράφει πουθενά γιατί.',
    canonical: null,
    canonicalNote: 'Δεν υπάρχει κανονική μέτρηση· βάση σύγκρισης τα ενεργά φορτηγά της σελίδας Φορτηγά.',
    baseline: 'trucks',
    baselineKey: 'active',
    rows: [
      { page: 'trucks',     key: 'active',       label: 'Φορτηγά — ενεργά' },
      { page: 'trucks',     key: 'total',        label: 'Φορτηγά — όλες οι εγγραφές',
        declared: 'Περιλαμβάνει και ανενεργά· η σελίδα δεν το δηλώνει στον τίτλο' },
      { page: 'dashboard',  key: 'activeTrucks', label: 'Dashboard' },
      { page: 'maint_dash', key: 'activeTrucks', label: 'Maintenance Dashboard' },
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
      return Object.assign({}, r, { value, at: entry ? entry.at : null, seen: !!entry });
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
  c.innerHTML = `<div style="text-align:center;padding:60px;color:var(--panel-dim)">Loading audit data...</div>`;

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
      safeFetch(() => atGetAll(TABLES.TRAILERS, { fields: ['License Plate','ATP Expiry','Insurance Expiry'] }, true), 'metrics audit: TRAILERS'),
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
    c.innerHTML = `<div style="padding:40px;color:var(--danger)">Failed to load audit data</div>`;
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

  // ════ OPERATIONAL ═══════════════════════════════
  try {
    const unassignedExp = metrics.unassignedOrders(d.orders, { direction: 'Export', period: period30 });
    add('op', 'op.unassigned_export', 'Unassigned Exports (30d)', unassignedExp, 'Orders without truck/partner');

    const unassignedImp = metrics.unassignedOrders(d.orders, { direction: 'Import', period: period30 });
    add('op', 'op.unassigned_import', 'Unassigned Imports (30d)', unassignedImp);

    const pending = metrics.pendingToday(d.orders);
    add('op', 'op.pending_today', 'Pending Today', pending, "Loading date=today, not started");

    const loadDone = metrics.loadingsDone(d.orders);
    add('op', 'op.loadings_today_done', 'Loadings Done Today', loadDone);

    const delDone = metrics.deliveriesDone(d.orders);
    add('op', 'op.deliveries_today_done', 'Deliveries Done Today', delDone);

    const chkProg = metrics.checklistProgress(d.orders);
    add('op', 'op.checklist_pct', 'Checklist Progress (all orders)', chkProg.pct + '%', `${chkProg.done}/${chkProg.total} checks`);

    const overdue = metrics.overdueDeliveries(d.orders);
    add('op', 'op.overdue_deliveries', 'Overdue Deliveries', overdue.length, 'Delivery date past, not yet delivered',
      overdue.length > 0 ? [`Sample: ${overdue.slice(0,3).map(r => r.fields['Order Number']||r.id.slice(-6)).join(', ')}`] : []);

    const highRisk = metrics.highRiskDeliveries(d.orders);
    add('op', 'op.high_risk', 'High-Risk Deliveries (<48h unassigned)', highRisk);

    const flow = metrics.rampPalletFlow(d.ramp);
    add('op', 'op.pallet_flow', 'Ramp Pallet Flow Today', `${flow.inbound} IN / ${flow.outbound} OUT / ${flow.net} NET`, 'RAMP records');

    const stock = metrics.stockInWarehouse(d.ramp);
    add('op', 'op.stock_pallets', 'Stock in Warehouse', stock + ' pallets', 'Done + In Stock');
  } catch(e) { add('op', '_error', 'OP error', 'ERR: '+e.message); }

  // ════ PERFORMANCE ══════════════════════════════
  try {
    const otAll = metrics.onTimePct(d.orders);
    add('perf', 'perf.on_time_pct', 'On-Time % (all-time)', otAll.pct + '%', `${otAll.onTime}/${otAll.total} with performance set`,
      otAll.total === 0 ? ['⚠ No orders with Delivery Performance set — cannot compute'] : []);

    const ot30 = metrics.onTimePct(d.orders, { period: { daysBack: 30 } });
    add('perf', 'perf.on_time_pct_30d', 'On-Time % (30 days)', ot30.pct + '%', `${ot30.onTime}/${ot30.total}`);

    const cmr = metrics.cmrSameDayPct(d.orders, { period: period30 });
    add('perf', 'perf.cmr_pct', 'CMR Received % (30d delivered)', cmr.pct + '%', `${cmr.withCMR}/${cmr.total}`);

    const clientUp = metrics.clientUpdatePct(d.orders, { period: period30 });
    add('perf', 'perf.client_update_pct', 'Client Notified % (30d delivered)', clientUp.pct + '%', `${clientUp.notified}/${clientUp.total}`);

    const streak = metrics.onTimeStreak(d.orders, { currentWeek: curWeek, threshold: 90 });
    add('perf', 'perf.on_time_streak', 'On-Time Streak (weeks ≥90%)', streak + ' weeks');

    const trend = metrics.onTimeTrend(d.orders, { weeks: 4, currentWeek: curWeek });
    add('perf', 'perf.on_time_trend', 'On-Time Trend (last 4 weeks)',
      trend.map(t => `W${t.week}: ${t.pct}%(${t.total})`).join(' | '));

    const exports = d.orders.filter(r => r.fields['Direction'] === 'Export');
    const imports = d.orders.filter(r => r.fields['Direction'] === 'Import');
    const el = metrics.emptyLegs(exports, imports);
    add('perf', 'perf.empty_legs', 'Empty Legs (heuristic)', el.total, `${el.soloExp} solo exp + ${el.soloImp} solo imp`);
  } catch(e) { add('perf', '_error', 'PERF error', 'ERR: '+e.message); }

  // ════ FINANCIAL ══════════════════════════════════
  try {
    const out = metrics.outstandingBalance(d.orders, d.natOrders);
    add('fin', 'fin.outstanding_balance', 'Outstanding Balance', `€${out.toLocaleString('el-GR')}`,
      'Delivered but not Invoiced', out === 0 ? ['⚠ Zero — check Invoiced field and Status values'] : []);

    const revInv = metrics.revenueInvoiced(d.orders, d.natOrders);
    add('fin', 'fin.revenue_invoiced', 'Revenue (Invoiced total)', `€${revInv.toLocaleString('el-GR')}`, 'All-time');

    const rev30 = metrics.revenueInvoiced(d.orders, d.natOrders, { period: period30 });
    add('fin', 'fin.revenue_invoiced_30d', 'Revenue Invoiced (30d)', `€${rev30.toLocaleString('el-GR')}`);

    const ready = metrics.revenueReadyToInvoice(d.orders);
    add('fin', 'fin.revenue_ready', 'Revenue Ready to Invoice', `€${ready.toLocaleString('el-GR')}`, 'Delivered + sheets OK');

    const overdueInv = metrics.overdueInvoices(d.orders);
    add('fin', 'fin.overdue_invoices', 'Overdue Invoices (>30d)', overdueInv.length);

    const palSup = metrics.palletBalance(d.plSup, { counterpartyField: 'Loading Supplier' });
    add('fin', 'fin.pallet_balance_sup', 'Suppliers Net Pallets Owed', palSup.total,
      `${Object.keys(palSup.balances).length} suppliers`);

    const palPart = metrics.palletBalance(d.plPart, { counterpartyField: 'Partner' });
    add('fin', 'fin.pallet_balance_part', 'Partners Net Pallets Owed', palPart.total,
      `${Object.keys(palPart.balances).length} partners`);
  } catch(e) { add('fin', '_error', 'FIN error', 'ERR: '+e.message); }

  // ════ FLEET ═══════════════════════════════════════
  try {
    const util = metrics.fleetUtilization(d.trucks, d.orders, { week: curWeek });
    add('fleet', 'fleet.utilization', 'Fleet Utilization (this week)', util.pct + '%', `${util.busy}/${util.total} busy`);

    const idle = metrics.idleTrucks(d.trucks, d.orders, { week: curWeek });
    add('fleet', 'fleet.idle', 'Idle Trucks (this week)', idle);

    const expAlerts = metrics.expiryAlerts(d.trucks, { daysAhead: 30 });
    add('fleet', 'fleet.expiry_30d', 'Trucks with Expiring Docs (30d)',
      `${expAlerts.total} trucks`, `KTEO: ${expAlerts.kteo.length}, KEK: ${expAlerts.kek.length}, Insurance: ${expAlerts.insurance.length}`);

    const trailAlerts = metrics.expiryAlertsTrailers(d.trailers, { daysAhead: 30 });
    add('fleet', 'fleet.expiry_trailers', 'Trailers with Expiring Docs (30d)',
      `${trailAlerts.total} trailers`, `KTEO: ${trailAlerts.kteo.length}, FRC: ${trailAlerts.frc.length}, Insurance: ${trailAlerts.insurance.length}`);

    const comp = metrics.compliancePct(d.trucks);
    add('fleet', 'fleet.compliance', 'Compliance % (all docs valid)', comp.pct + '%', `${comp.valid}/${comp.total} active trucks`);

    const down = metrics.fleetDowntime(d.maintReq);
    add('fleet', 'fleet.downtime', 'Fleet Downtime (est)', down + ' hrs', `Based on ${d.maintReq.filter(r=>r.fields['Status']!=='Done').length} pending maintenance`);
  } catch(e) { add('fleet', '_error', 'FLEET error', 'ERR: '+e.message); }

  // ════ HR ═════════════════════════════════════════
  try {
    const ar = metrics.assignmentRate(d.orders, { week: curWeek });
    add('hr', 'hr.assignment_rate', 'Assignment Rate (this week)', ar.pct + '%', `${ar.assigned}/${ar.total}`);

    const ptp = metrics.partnerTripPct(d.orders, { week: curWeek });
    add('hr', 'hr.partner_trip_pct', 'Partner Trip % (this week)', ptp.pct + '%', `${ptp.partners}/${ptp.assigned} of assigned`);

    const wor = metrics.workOrdersResolvedPct(d.maintReq);
    add('hr', 'hr.work_orders_resolved', 'Work Orders Resolved %', wor.pct + '%', `${wor.resolved}/${wor.total}`);

    const crisis = metrics.crisisEventsResolved(d.maintReq);
    add('hr', 'hr.crisis_resolved', 'Crisis Events Resolved', crisis);
  } catch(e) { add('hr', '_error', 'HR error', 'ERR: '+e.message); }

  // ════ INVENTORY ═════════════════════════════════
  try {
    const sheets = metrics.palletSheetsComplete(d.orders);
    add('inv', 'inv.sheets_complete', 'PE Sheets Complete %', sheets.pct + '%', `${sheets.complete}/${sheets.total} orders with PE`);

    const ages = metrics.stockAgeBuckets(d.ramp);
    add('inv', 'inv.stock_age', 'Stock Age Buckets',
      `Fresh(≤1d): ${ages.fresh_le_1d} · Aging(2-3d): ${ages.aging_2_3d} · Old(>3d): ${ages.old_gt_3d}`);
  } catch(e) { add('inv', '_error', 'INV error', 'ERR: '+e.message); }

  // ════ BUSINESS HEALTH ═══════════════════════════
  try {
    const ar = metrics.assignmentRate(d.orders, { week: curWeek });
    const ot = metrics.onTimePct(d.orders, { period: period30 });
    const comp = metrics.compliancePct(d.trucks);
    const score = metrics.weeklyScore({
      assignment_rate: ar.pct, on_time: ot.pct, compliance: comp.pct, dead_km_score: 75,
    });
    add('biz', 'biz.weekly_score', 'Weekly Score (composite)', score.score + '/100',
      `${score.color.toUpperCase()} · AR:${ar.pct}% OT:${ot.pct}% Comp:${comp.pct}% DKS:75%(est)`);

    const impCount = d.orders.filter(r => r.fields['Direction']==='Import' && r.fields['Week Number']===curWeek).length;
    const expCount = d.orders.filter(r => r.fields['Direction']==='Export' && r.fields['Week Number']===curWeek).length;
    const imb = metrics.directionImbalance(expCount, impCount);
    add('biz', 'biz.imbalance', 'Direction Imbalance (this week)', imb, `${expCount} exports vs ${impCount} imports`);
  } catch(e) { add('biz', '_error', 'BIZ error', 'ERR: '+e.message); }

  return results;
}

/**
 * Render the cross-check section: canonical value · page value · difference.
 * @param {{checks: Array, diffCount: number, pagesSeen: number}} cross
 * @param {string} q - lowercased search term, '' for none
 */
function _auditCrossHTML(cross, q) {
  const match = chk => !q
    || chk.label.toLowerCase().includes(q)
    || chk.rows.some(r => r.label.toLowerCase().includes(q) || r.page.includes(q) || r.key.toLowerCase().includes(q));
  const visible = cross.checks.filter(match);

  if (!visible.length) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;color:var(--text-dim);font-size:13px">
      Καμία διασταύρωση δεν ταιριάζει με «${escapeHtml(q)}».
    </div>`;
  }

  const cell = (r) => {
    // Not opened yet is a different state from opened-and-reported-nothing, and
    // the difference matters: the first is "go look at that page", the second
    // is "that page stopped reporting this figure".
    if (!r.seen)          return `<span style="color:var(--text-dim)" title="Άνοιξε τη σελίδα για να καταγραφεί">δεν άνοιξε</span>`;
    if (r.value === null) return `<span style="color:var(--text-dim)">δεν αναφέρθηκε</span>`;
    return `<b>${r.value}${r.unit ? ' ' + escapeHtml(r.unit) : ''}</b>`;
  };

  const diffCell = (r) => {
    if (r.diff === null) return `<span style="color:var(--text-dim)">—</span>`;
    if (r.isBase)        return `<span style="color:var(--text-dim)">βάση</span>`;
    if (r.diff === 0)    return `<span style="color:var(--success)">✓ ίδιο</span>`;
    const sign = r.diff > 0 ? '+' : '';
    const color = r.declared ? 'var(--warning)' : 'var(--danger)';
    return `<b style="color:${color}">${r.declared ? '' : '🔴 '}${sign}${r.diff}</b>`;
  };

  return visible.map(chk => {
    const faults = chk.rows.filter(r => r.fault).length;
    const canonLine = chk.canonical !== null
      ? `<b>${chk.canonical}</b> <span style="color:var(--text-dim)">· ${escapeHtml(chk.canonicalLabel || 'core/metrics.js')}</span>`
      : `<span style="color:var(--text-dim)">${escapeHtml(chk.canonicalNote || 'Δεν υπάρχει κανονική τιμή.')}</span>`;

    return `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px">
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;color:${faults ? 'var(--danger)' : 'var(--accent)'}">
          ${escapeHtml(chk.label)}
        </div>
        ${faults ? `<span style="background:var(--danger-bg);color:var(--danger);font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px">${faults} ${faults === 1 ? 'διαφορά' : 'διαφορές'}</span>` : ''}
      </div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">${escapeHtml(chk.why)}</div>
      <div style="font-size:12px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim)">Κανονική τιμή</span>
        &nbsp;${canonLine}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="color:var(--text-dim);font-size:10px;text-transform:uppercase;letter-spacing:0.5px">
          <th style="text-align:left;padding:6px 8px;width:34%">Σελίδα</th>
          <th style="text-align:right;padding:6px 8px;width:16%">Τιμή σελίδας</th>
          <th style="text-align:right;padding:6px 8px;width:14%">Διαφορά</th>
          <th style="text-align:left;padding:6px 8px;width:36%">Σημείωση</th>
        </tr></thead>
        <tbody>
          ${chk.rows.map(r => {
            // Declared differences get the warm tint, real ones the red: the
            // reader must be able to tell "this is expected and here is why"
            // from "nobody knows why these disagree" at a glance.
            const bg = r.fault ? 'background:var(--danger-bg);'
                     : (r.declared && r.diff !== null && r.diff !== 0) ? 'background:var(--warning-bg);' : '';
            const note = r.declared
              ? `<span style="color:var(--warning)">Δηλωμένη διαφορά: ${escapeHtml(r.declared)}</span>`
              : (r.note ? `<span style="color:var(--text-dim)">${escapeHtml(r.note)}</span>` : '');
            return `<tr style="border-bottom:1px solid var(--border);${bg}">
              <td style="padding:8px;font-weight:600">${escapeHtml(r.label)}
                <div style="font-family:monospace;font-size:10px;color:var(--text-dim)">${escapeHtml(r.page)}.${escapeHtml(r.key)}</div></td>
              <td style="padding:8px;text-align:right;font-family:'Syne',sans-serif;font-size:15px">${cell(r)}</td>
              <td style="padding:8px;text-align:right;font-size:12px">${diffCell(r)}</td>
              <td style="padding:8px;font-size:11px">${note}${r.at ? `<div style="color:var(--text-dim);font-size:10px">καταγράφηκε ${new Date(r.at).toLocaleTimeString('el-GR')}</div>` : ''}</td>
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
    op: { name: 'ΛΕΙΤΟΥΡΓΙΚΕΣ', ic: 'target', color: 'var(--accent)' },
    perf: { name: 'ΑΠΟΔΟΣΗ', ic: 'bar_chart', color: 'var(--panel-ok)' },
    fin: { name: 'ΟΙΚΟΝΟΜΙΚΕΣ', ic: 'euro', color: 'var(--panel-warn)' },
    fleet: { name: 'ΣΤΟΛΟΣ', ic: 'truck', color: '#8B5CF6' },
    hr: { name: 'ΟΜΑΔΑ', ic: 'users', color: '#EC4899' },
    inv: { name: 'ΑΠΟΘΕΜΑ', ic: 'package', color: '#06B6D4' },
    biz: { name: 'ΕΠΙΧΕΙΡΗΣΗ', ic: 'building', color: '#1E40AF' },
  };

  // Sources that failed to load on this run. On a healthy load this is empty
  // and everything below behaves exactly as before.
  const failed = AUDIT.failedSources || [];
  const failedLabels = failed.map(k => AUDIT_SOURCE_LABELS[k] || k);

  // Page-level banner. The point is to stop a reader trusting a number that was
  // computed from nothing: before this, an unreachable table just produced
  // zeroes that looked like real zeroes on the page meant to verify accuracy.
  const failBanner = failed.length ? `
    <div style="background:var(--warning-soft);border:1px solid var(--panel-warn);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:#78350F">
      <b>⚠ Some figures below may be wrong.</b>
      ${failedLabels.length} source ${failedLabels.length === 1 ? 'table' : 'tables'} could not be loaded:
      <b>${failedLabels.map(escapeHtml).join(', ')}</b>.
      Metrics computed from ${failedLabels.length === 1 ? 'it' : 'them'} are shown as
      <b>unavailable</b> rather than zero. Reload to retry; the failure has been reported.
    </div>` : '';

  const catHTML = cat => {
    const label = catLabels[cat] || { name: cat, color: '#6B7280' };
    // MA-6: 38 rows over 2.627px meant scanning four screens to find one
    // metric. Search matches the human label, the key, and the note.
    const items = (byCategory[cat] || []).filter(r => !q
      || r.label.toLowerCase().includes(q)
      || r.key.toLowerCase().includes(q)
      || String(r.note || '').toLowerCase().includes(q));
    if (!items.length) return '';
    // Does this category read any source that failed? If so its numbers are
    // not trustworthy, and saying so beats printing a confident zero.
    const catFailed = (AUDIT_CATEGORY_SOURCES[cat] || []).filter(s => failed.includes(s));
    const catWarn = catFailed.length ? `
      <div style="font-size:11px;color:#B45309;margin:-6px 0 10px;font-weight:600">
        ⚠ Unreliable: ${catFailed.map(s => escapeHtml(AUDIT_SOURCE_LABELS[s] || s)).join(', ')} could not be loaded
      </div>` : '';
    return `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;color:${label.color};margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${label.color}33">${(typeof icon==='function'&&label.ic)?icon(label.ic,12):''} ${label.name}</div>
      ${catWarn}
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="color:var(--text-dim);font-size:10px;text-transform:uppercase;letter-spacing:0.5px">
          <th style="text-align:left;padding:6px 8px;width:40%">Metric</th>
          <th style="text-align:left;padding:6px 8px;width:20%">Key</th>
          <th style="text-align:right;padding:6px 8px;width:15%">Value</th>
          <th style="text-align:left;padding:6px 8px;width:25%">Note</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const hasWarn = (r.diag||[]).length > 0 || String(r.value).includes('ERR') || catFailed.length > 0;
            // A metric whose source did not load is displayed as "—" with an
            // explanation, never as the 0 the computation produced from an
            // empty array. That substitution is the whole point of this page's
            // conversion: on the accuracy-checking screen, a wrong number is
            // worse than a missing one.
            const value = catFailed.length ? '<span style="color:#B45309" title="Source data could not be loaded">—</span>' : r.value;
            const note = catFailed.length
              ? `<span style="color:#B45309">Unavailable: source data could not be loaded</span>`
              : `${r.note || ''}${r.diag && r.diag.length ? '<br><span style="color:#D97706">⚠ '+r.diag.join(' · ')+'</span>' : ''}`;
            return `<tr style="border-bottom:1px solid var(--border);${hasWarn?'background:var(--warning-soft)':''}">
              <td style="padding:8px;font-weight:600">${r.label}</td>
              <td style="padding:8px;color:var(--text-dim);font-family:monospace;font-size:11px">${r.key}</td>
              <td style="padding:8px;text-align:right;font-weight:700;font-family:'Syne',sans-serif;font-size:15px">${value}</td>
              <td style="padding:8px;color:var(--text-dim);font-size:11px">${note}</td>
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
  )];

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
  const shownCats = AUDIT.cat === 'all'
    ? ['op','perf','fin','fleet','hr','inv','biz']
    : [AUDIT.cat];

  c.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div>
      <h2 style="font-family:'Syne',sans-serif;font-size:22px;margin:0">Έλεγχος Μετρήσεων</h2>
      <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
        ${AUDIT.results.length} μετρήσεις · φορτώθηκε ${AUDIT.loadedAt?.toLocaleTimeString('el-GR')||'—'} · κανονικές τιμές από <code>metrics.js</code>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" onclick="_auditExportJSON()">Copy JSON</button>
      <button class="btn btn-new-order" onclick="renderMetricsAudit()">${(typeof icon==='function')?icon('refresh',12):''} Ανανέωση</button>
    </div>
  </div>

  ${failBanner}

  <div style="background:${cross.diffCount ? 'var(--danger-bg)' : 'var(--success-bg)'};border:1px solid ${cross.diffCount ? 'var(--danger)' : 'var(--success)'};border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:14px;color:${cross.diffCount ? 'var(--danger)' : 'var(--success)'};font-weight:700">
    ${cross.diffCount
      ? `⚠ ${cross.diffCount} ${cross.diffCount === 1 ? 'διαφορά εντοπίστηκε' : 'διαφορές εντοπίστηκαν'}`
      : '✓ Καμία ανεξήγητη διαφορά μεταξύ σελίδων'}
    <span style="font-weight:400;font-size:12px;color:var(--text-dim)">
      · ${cross.pagesSeen} ${cross.pagesSeen === 1 ? 'σελίδα έχει αναφέρει' : 'σελίδες έχουν αναφέρει'} τιμές σε αυτή τη συνεδρία
    </span>
  </div>

  <div style="background:#DBEAFE;border:1px solid #3B82F6;color:#1E40AF;padding:12px 16px;border-radius:6px;margin-bottom:16px;font-size:13px">
    <b>Πώς να το χρησιμοποιήσεις:</b> άνοιξε τις σελίδες που σε ενδιαφέρουν (Dashboard, Συντήρηση, Τιμολόγηση…)
    και γύρνα εδώ. Κάθε σελίδα καταγράφει τα νούμερα που έδειξε, και ο πίνακας «Διασταυρώσεις» τα συγκρίνει
    αυτόματα. <b>Κόκκινη γραμμή</b> = δύο σελίδες διαφωνούν χωρίς εξήγηση. <b>Πορτοκαλί</b> = η διαφορά είναι
    σωστή και γράφει από πού προκύπτει.
    ${unseenPages.length ? `<div style="margin-top:6px">Δεν έχουν ανοίξει ακόμη: <b>${unseenPages.map(escapeHtml).join(', ')}</b></div>` : ''}
  </div>

  <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;color:var(--text-mid);margin:0 0 10px">
    ΔΙΑΣΤΑΥΡΩΣΕΙΣ ΜΕΤΑΞΥ ΣΕΛΙΔΩΝ
  </div>
  ${_auditCrossHTML(cross, q)}

  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:20px 0 12px">
    <input id="auditSearch" type="search" value="${escapeHtml(AUDIT.q)}"
      oninput="_auditSetQuery(this.value)" placeholder="Αναζήτηση μέτρησης ή κλειδιού…"
      style="flex:1;min-width:200px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:'DM Sans',sans-serif">
    ${catTabs.map(t => `<button class="btn btn-ghost" onclick="_auditSetCat('${t.k}')"
      style="font-size:11px;padding:6px 10px;${AUDIT.cat === t.k ? 'background:var(--accent-light);color:var(--accent);font-weight:700' : ''}">${t.name}</button>`).join('')}
  </div>

  ${shownCats.map(catHTML).join('') || `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px;color:var(--text-dim);font-size:13px">Καμία μέτρηση δεν ταιριάζει με «${escapeHtml(AUDIT.q)}».</div>`}

  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:14px;margin-top:12px;font-size:12px;color:var(--text-dim)">
    <b>Υπόμνημα:</b> κίτρινη γραμμή = warning ή error στη μέτρηση.
    <b>Τύποι:</b> <code>METRICS.md</code> και <code>core/metrics.js</code>.
    <b>Διασταυρώσεις:</b> οι τιμές των σελίδων καταγράφονται κατά το render και ζουν όσο το tab —
    το εργαλείο δεν αλλάζει τίποτα, μόνο διαβάζει.
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
    toast('JSON copied to clipboard');
  }).catch(() => toast('Copy failed', 'error'));
}

// Expose
window.renderMetricsAudit = renderMetricsAudit;
window._auditExportJSON = _auditExportJSON;
window._auditSetQuery = _auditSetQuery;
window._auditSetCat = _auditSetCat;
