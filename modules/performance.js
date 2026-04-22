// ═══════════════════════════════════════════════════════════════
// MY PERFORMANCE — HR Performance Dashboard
// Per-user KPIs, trends, and AI feedback via Νάκης
// ═══════════════════════════════════════════════════════════════
(function() {
'use strict';

const PERF = { orders: [], natLoads: [], trucks: [], drivers: [], maint: [] };

// Per-person KPI definitions based on org chart
const PERF_KPIS_BY_USER = {
  // Dimitris Petras — Founder: Approval & Strategy
  dimitris: [
    { id: 'weekly_score',  label: 'Weekly Score',          unit: '/100', target: 85 },
    { id: 'fleet_usage',   label: 'Fleet Usage Rate',      unit: '%',  target: 80 },
    { id: 'dead_km',       label: 'Dead Kilometers',       unit: 'km', target: 50, invert: true },
    { id: 'on_time',       label: 'On-Time Delivery',      unit: '%',  target: 90 },
  ],
  // Dimitris Kelesmitos — Master Planner: plan routes, assign trucks, find return loads
  kelesmitos: [
    { id: 'plan_complete', label: 'Plan Completion',        unit: '%',  target: 100, desc: 'Exports assigned by Thursday' },
    { id: 'dead_km',       label: 'Dead Kilometers',        unit: 'km', target: 50, invert: true, desc: 'Export delivery to Import loading distance' },
    { id: 'fleet_usage',   label: 'Fleet Usage Rate',       unit: '%',  target: 80, desc: 'Working days vs available days' },
    { id: 'sub_cost_pct',  label: 'Subcontractor Cost',     unit: '%',  target: 30, invert: true, desc: 'Partner trips vs total trips' },
  ],
  // Pantelis Tsanaktsidis — Control Tower: execution, tracking, client updates
  pantelis: [
    { id: 'on_time',       label: 'On-Time Delivery',       unit: '%',  target: 90, desc: 'Deliveries on time vs total' },
    { id: 'cmr_collected', label: 'CMR Same-Day',           unit: '%',  target: 95, desc: 'CMR collected within 24h of delivery' },
    { id: 'client_updates',label: 'Client Updates Sent',    unit: '%',  target: 100, desc: 'Zero Anxiety: Loaded/In Transit/Delivered updates' },
    { id: 'response_time', label: 'Response Time',          unit: 'h',  target: 2, invert: true, desc: 'Avg time to handle issues' },
  ],
  // Sotiris Koulouriotis — Chief Ops: national transport, plan review, crisis management
  sotiris: [
    { id: 'natl_on_time',  label: 'National On-Time',       unit: '%',  target: 90, desc: 'National deliveries on time' },
    { id: 'plan_reviewed', label: 'Plan Review by Friday',  unit: '',   target: 1, desc: 'Weekly plan checked before submission' },
    { id: 'crisis_count',  label: 'Crises Resolved',        unit: '',   target: 0, desc: 'Issues escalated and resolved this week' },
    { id: 'natl_profit',   label: 'National Profitability',  unit: '%',  target: 15, desc: 'National routes margin' },
  ],
  // Thodoris Vainas — Equipment Manager + HR: fleet maintenance, driver payroll
  thodoris: [
    { id: 'expired_docs',  label: 'Expired Documents',      unit: '',   target: 0, invert: true, desc: 'KTEO/Insurance/ATP expired count' },
    { id: 'work_orders',   label: 'Work Orders Resolved',   unit: '%',  target: 80, desc: 'Resolved vs total this week' },
    { id: 'downtime_hrs',  label: 'Fleet Downtime',         unit: 'h',  target: 24, invert: true, desc: 'Total hours trucks out of service' },
    { id: 'service_adherence', label: 'Service Schedule',   unit: '%',  target: 100, desc: 'Preventive maintenance on time' },
  ],
  // Eirini Papazoi — Invoicing: invoices, CMR archive, pallet tracking
  eirini: [
    { id: 'invoiced_pct',  label: 'Orders Invoiced',        unit: '%',  target: 100, desc: 'Delivered orders with invoice issued' },
    { id: 'cmr_archived',  label: 'CMR Archived',           unit: '%',  target: 95, desc: 'CMR documents filed and archived' },
    { id: 'outstanding',   label: 'Outstanding Balance',    unit: 'EUR',  target: 0, invert: true, desc: 'Unpaid client invoices total' },
    { id: 'pallet_balance',label: 'Pallet Balance',         unit: '',   target: 0, desc: 'EUR-pallet net balance with partners' },
  ],
};

// Fallback role-based mapping
const PERF_KPIS = {
  owner: PERF_KPIS_BY_USER.dimitris,
  dispatcher: PERF_KPIS_BY_USER.kelesmitos,
  management: PERF_KPIS_BY_USER.thodoris,
  accountant: PERF_KPIS_BY_USER.eirini,
};

/* ── CSS moved to assets/style.css ── */

/* ── ENTRY ────────────────────────────────────────────────── */
async function renderPerformance() {
  const c = document.getElementById('content');
  document.getElementById('topbarTitle').textContent = 'My Performance';
  c.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:80px;color:var(--text-dim)">
    <div class="spinner"></div> Loading performance data…</div>`;

  try {
    await _perfLoad();
    _perfDraw();
  } catch(e) {
    // Use unified error banner instead of raw red text
    const safeMsg = (e && e.message ? e.message : 'Unknown error').replace(/[<>&]/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[ch]));
    c.innerHTML = `
      <div class="tms-page-header">
        <div class="tms-page-titles">
          <h1 class="tms-page-title">My Performance</h1>
          <div class="tms-page-sub">Personal KPIs and goals</div>
        </div>
      </div>
      <div class="tms-error-banner" role="alert">
        <span class="tms-error-icon">⚠</span>
        <div class="tms-error-content">
          <div class="tms-error-title">Δεν φορτώθηκαν τα δεδομένα</div>
          <div class="tms-error-msg">${safeMsg}</div>
          <button class="tms-error-action" onclick="renderPerformance()">Δοκιμή ξανά</button>
        </div>
      </div>`;
    console.error('Performance:', e);
    if (typeof logError === 'function') logError(e, 'renderPerformance');
  }
}

/* ── LOAD ─────────────────────────────────────────────────── */
async function _perfLoad() {
  const [orders, natLoads, trucks, maint] = await Promise.all([
    atGetAll(TABLES.ORDERS, {
      fields: ['Direction','Delivery Performance','Status','Truck','Driver','Partner',
               'Is Partner Trip','Loading DateTime','Delivery DateTime','Matched Import ID',
               'Total Pallets','Client','Week Number','Client Notified','ORDER STOPS',
               'Assigned At','Actual Delivery Date',
               'Loading Summary','Delivery Summary','Loading Points','Delivery Points']
    }, true),
    atGetAll(TABLES.NAT_LOADS, {
      fields: ['Direction','Status','Loading DateTime','Delivery DateTime','Truck','Driver',
               'Actual Delivery Date']
    }, true).catch(() => []),
    preloadReferenceData().then(() => getRefTrucks()),
    atGetAll(TABLES.MAINT_REQ, { fields: ['Status','Priority','Date Reported'] }, true).catch(() => []),
  ]);
  PERF.orders = orders || [];
  PERF.natLoads = natLoads || [];
  PERF.trucks = trucks || [];
  PERF.maint = maint || [];
  PERF.locs = getRefLocations() || [];

  // Build location coordinates lookup (for dead_km calc)
  PERF.locCoords = {};
  PERF.locs.forEach(l => {
    const lat = l.fields['Latitude'], lng = l.fields['Longitude'];
    if (lat && lng) PERF.locCoords[l.id] = { lat: +lat, lng: +lng };
  });

  // Batch fetch ORDER_STOPS for dead_km calc (this week's exports + imports)
  const wn = typeof currentWeekNumber === 'function' ? currentWeekNumber() : 0;
  const weekOrders = orders.filter(r => r.fields['Week Number'] == wn && r.fields['Truck']);
  const stopIds = weekOrders.flatMap(r => r.fields['ORDER STOPS'] || []);
  PERF.stopsByOrder = {};
  if (stopIds.length) {
    try {
      for (let b = 0; b < stopIds.length; b += 90) {
        const batch = stopIds.slice(b, b + 90);
        const ff = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
        const recs = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: ff }, false);
        recs.forEach(sr => {
          const pid = (sr.fields[F.STOP_PARENT_ORDER] || [])[0];
          if (pid) { if (!PERF.stopsByOrder[pid]) PERF.stopsByOrder[pid] = []; PERF.stopsByOrder[pid].push(sr); }
        });
      }
    } catch(e) { console.warn('Performance ORDER_STOPS fetch:', e); }
  }
}

// Haversine distance in km between two lat/lng pairs
function _perfHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ── COMPUTE KPIs ─────────────────────────────────────────── */
function _perfCompute() {
  const wn = typeof currentWeekNumber === 'function' ? currentWeekNumber() : 0;
  const orders = PERF.orders;
  const weekOrders = orders.filter(r => r.fields['Week Number'] == wn);
  const activeTrucks = PERF.trucks.filter(t => t.fields['Active']).length;

  // On-Time %
  const withPerf = orders.filter(r => r.fields['Delivery Performance']);
  const onTime = withPerf.filter(r => r.fields['Delivery Performance'] === 'On Time').length;
  const on_time = withPerf.length ? Math.round(onTime / withPerf.length * 100) : 0;

  // Empty Legs % (this week)
  const weekExports = weekOrders.filter(r => r.fields['Direction'] === 'Export' && r.fields['Truck']);
  const noReturn = weekExports.filter(r => !r.fields['Matched Import ID']).length;
  const empty_legs = weekExports.length ? Math.round(noReturn / weekExports.length * 100) : 0;

  // Fleet Usage Rate (working days formula)
  const ownedWeek = weekOrders.filter(r => r.fields['Truck'] && !r.fields['Is Partner Trip']);
  const truckDays = {};
  ownedWeek.forEach(r => {
    const tid = getLinkId(r.fields['Truck']);
    if (!tid) return;
    if (!truckDays[tid]) truckDays[tid] = 0;
    const ld = toLocalDate(r.fields['Loading DateTime']);
    const dd = toLocalDate(r.fields['Delivery DateTime']);
    if (ld && dd) {
      const diff = Math.round((new Date(dd+'T12:00:00') - new Date(ld+'T12:00:00')) / 864e5);
      if (diff > 0) truckDays[tid] += diff;
    }
  });
  const rates = PERF.trucks.filter(t => t.fields['Active']).map(t => {
    const days = truckDays[t.id] || 0;
    // Usage rate: ~5 working days/week = 100%. Each day ≈ 20.25 pp.
    return Math.min(days * 4.5 * 4.5, 100);
  });
  const fleet_usage = rates.length ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : 0;

  // Plan Completion (assigned / total this week)
  const totalWeek = weekOrders.filter(r => r.fields['Direction'] === 'Export').length;
  const assignedWeek = weekOrders.filter(r => r.fields['Direction'] === 'Export' && r.fields['Truck']).length;
  const plan_complete = totalWeek ? Math.round(assignedWeek / totalWeek * 100) : 0;

  // Assignment Speed — avg hours from order creation to truck/partner assignment
  // Uses Airtable's native Created Time + our custom Assigned At timestamp
  // (Assigned At is stamped by the app on first assignment in weekly_intl.js)
  const assignedWeekly = weekOrders.filter(r => r.fields['Assigned At']);
  const assignHrs = assignedWeekly.map(r => {
    const assignedAt = new Date(r.fields['Assigned At']).getTime();
    // Airtable doesn't expose createdTime via API without a Created Time field on the table
    // Fallback: use Loading DateTime - 48h as proxy creation time (orders usually created ~2d ahead)
    const loadingTime = r.fields['Loading DateTime'] ? new Date(r.fields['Loading DateTime']).getTime() : null;
    if (!loadingTime || !assignedAt) return null;
    const createdProxy = loadingTime - 2*24*3600*1000; // 2 days before loading
    const hrs = (assignedAt - createdProxy) / 3600000;
    return hrs > 0 && hrs < 480 ? hrs : null; // ignore outliers (>20 days)
  }).filter(v => v !== null);
  const assign_speed = assignHrs.length ? Math.round(assignHrs.reduce((s,v)=>s+v,0)/assignHrs.length * 10)/10 : 0;

  // Dead KM — avg distance between Export Delivery and matched Import Loading (this week)
  // Uses ORDER_STOPS + LOCATIONS coords + Haversine (same algo as dashboard.js)
  const weekExportsAll = weekOrders.filter(r => r.fields['Direction'] === 'Export' && r.fields['Truck']);
  const weekImportsAll = weekOrders.filter(r => r.fields['Direction'] === 'Import' && r.fields['Truck']);
  const deadKmList = [];
  weekExportsAll.forEach(exp => {
    const expTruck = getLinkId(exp.fields['Truck']);
    if (!expTruck) return;
    const matchedImp = weekImportsAll.find(imp => getLinkId(imp.fields['Truck']) === expTruck);
    if (!matchedImp) return;
    const expUnloads = (PERF.stopsByOrder[exp.id] || [])
      .filter(s => s.fields[F.STOP_TYPE] === 'Unloading')
      .sort((a,b) => (b.fields[F.STOP_NUMBER]||0) - (a.fields[F.STOP_NUMBER]||0));
    const impLoads = (PERF.stopsByOrder[matchedImp.id] || [])
      .filter(s => s.fields[F.STOP_TYPE] === 'Loading')
      .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
    const expLocId = expUnloads.length ? (expUnloads[0].fields[F.STOP_LOCATION] || [])[0] : null;
    const impLocId = impLoads.length ? (impLoads[0].fields[F.STOP_LOCATION] || [])[0] : null;
    if (expLocId && impLocId && PERF.locCoords[expLocId] && PERF.locCoords[impLocId]) {
      deadKmList.push(Math.round(_perfHaversine(
        PERF.locCoords[expLocId].lat, PERF.locCoords[expLocId].lng,
        PERF.locCoords[impLocId].lat, PERF.locCoords[impLocId].lng
      )));
    }
  });
  const dead_km = deadKmList.length ? Math.round(deadKmList.reduce((s,v)=>s+v,0)/deadKmList.length) : 0;

  // National On-Time — derive from Actual Delivery Date vs expected Delivery DateTime
  // On time if Actual Delivery Date <= Delivery DateTime (date only comparison)
  const natlDelivered = (PERF.natLoads || []).filter(r => {
    const f = r.fields;
    return ['Delivered','Invoiced'].includes(f['Status']||'') && f['Actual Delivery Date'] && f['Delivery DateTime'];
  });
  const natlOnTime = natlDelivered.filter(r => {
    const actual = (r.fields['Actual Delivery Date']||'').slice(0,10);
    const expected = (r.fields['Delivery DateTime']||'').slice(0,10);
    return actual && expected && actual <= expected;
  }).length;
  const natl_on_time = natlDelivered.length ? Math.round(natlOnTime / natlDelivered.length * 100) : 0;

  // Invoiced %
  const deliveredOrders = orders.filter(r => r.fields['Status'] === 'Delivered' || r.fields['Status'] === 'Invoiced');
  const invoicedOrders = orders.filter(r => r.fields['Status'] === 'Invoiced');
  const invoiced_pct = deliveredOrders.length ? Math.round(invoicedOrders.length / deliveredOrders.length * 100) : 0;

  // CMR collected — use explicit 'CMR Photo Received' or 'CMR Received' field if present,
  // fall back to Delivery Performance presence as proxy only if field is missing entirely.
  const deliveredForCmr = deliveredOrders;
  const cmrFieldPresent = deliveredForCmr.some(r => 'CMR Photo Received' in r.fields || 'CMR Received' in r.fields);
  let cmr_collected;
  if (cmrFieldPresent) {
    const cmrOk = deliveredForCmr.filter(r => r.fields['CMR Photo Received'] || r.fields['CMR Received']).length;
    cmr_collected = deliveredForCmr.length ? Math.round(cmrOk / deliveredForCmr.length * 100) : 0;
  } else {
    // Proxy: Delivery Performance set implies order was closed with docs
    cmr_collected = withPerf.length && deliveredForCmr.length ? Math.round(withPerf.length / deliveredForCmr.length * 100) : 0;
  }

  // Maintenance
  const pendingMaint = PERF.maint.filter(r => r.fields['Status'] !== 'Done').length;
  const resolvedMaint = PERF.maint.filter(r => r.fields['Status'] === 'Done').length;
  const totalMaint = PERF.maint.length;
  const work_orders = totalMaint ? Math.round(resolvedMaint / totalMaint * 100) : 100;

  // Subcontractor cost % (partner trips vs total assigned trips)
  const assignedTrips = weekOrders.filter(r => r.fields['Truck'] || r.fields['Partner']);
  const partnerTrips = assignedTrips.filter(r => r.fields['Is Partner Trip']);
  const sub_cost_pct = assignedTrips.length ? Math.round(partnerTrips.length / assignedTrips.length * 100) : 0;

  // Client updates — % of delivered orders this week with Client Notified=true
  const weekDelivered = weekOrders.filter(r => r.fields['Status'] === 'Delivered' || r.fields['Status'] === 'Invoiced');
  const weekNotified = weekDelivered.filter(r => r.fields['Client Notified']).length;
  const client_updates = weekDelivered.length ? Math.round(weekNotified / weekDelivered.length * 100) : 0;

  // Response time — proxy from open maintenance age (avg hours since reported)
  const today = new Date();
  const openWithDate = PERF.maint.filter(r => r.fields['Status'] !== 'Done' && r.fields['Date Reported']);
  const totalAgeHrs = openWithDate.reduce((s, r) => {
    const d = new Date(r.fields['Date Reported']);
    return s + Math.max(0, Math.round((today - d) / 3600000));
  }, 0);
  const response_time = openWithDate.length ? Math.round(totalAgeHrs / openWithDate.length) : 0;

  // Expired documents count — trucks with KTEO/KEK/Insurance expiry <= today
  const todayStr = (typeof localToday === 'function') ? localToday() : new Date().toISOString().slice(0,10);
  const expFields = ['KTEO Expiry','KEK Expiry','Insurance Expiry'];
  let expired_docs = 0;
  PERF.trucks.filter(t => t.fields['Active']).forEach(t => {
    expFields.forEach(f => {
      const val = t.fields[f];
      if (val && val <= todayStr) expired_docs++;
    });
  });

  // Fleet downtime — proxy from open maintenance count × 24h
  const downtime_hrs = pendingMaint * 24;

  // Service schedule adherence — % of service records on/before their due date.
  // Previously aliased to work_orders which is NOT the same metric.
  // Better proxy: % of completed maintenance items with Status='Done' that had
  // their Date (completion) not more than 7 days past Date Reported.
  const resolvedTimely = PERF.maint.filter(r => {
    if (r.fields['Status'] !== 'Done') return false;
    const reported = r.fields['Date Reported'];
    const done = r.fields['Date'] || r.fields['Date Completed'];
    if (!reported || !done) return false;
    const deltaDays = (new Date(done) - new Date(reported)) / 864e5;
    return deltaDays <= 7;  // resolved within SLA (7 days)
  }).length;
  const service_adherence = resolvedMaint ? Math.round(resolvedTimely / resolvedMaint * 100) : 100;

  // National profitability — margin from NAT_LOADS where both Revenue and Cost exist.
  // Previously hardcoded to 0.
  const natlWithFinancials = (PERF.natLoads || []).filter(r => {
    const rev = parseFloat(r.fields['Revenue'] || r.fields['Net Price']) || 0;
    const cost = parseFloat(r.fields['Total Cost'] || r.fields['Cost']) || 0;
    return rev > 0 && cost > 0;
  });
  const natl_profit = natlWithFinancials.length
    ? Math.round(natlWithFinancials.reduce((s, r) => {
        const rev = parseFloat(r.fields['Revenue'] || r.fields['Net Price']) || 0;
        const cost = parseFloat(r.fields['Total Cost'] || r.fields['Cost']) || 0;
        return s + ((rev - cost) / rev * 100);
      }, 0) / natlWithFinancials.length)
    : 0;

  // CMR archived — distinct from collected.
  // Use explicit 'CMR Archived' field if present, otherwise proxy to 100% of what's collected
  // AND has already been invoiced (invoicing implies the CMR is filed).
  const cmrArchiveField = deliveredForCmr.some(r => 'CMR Archived' in r.fields);
  let cmr_archived;
  if (cmrArchiveField) {
    const archivedCount = deliveredForCmr.filter(r => r.fields['CMR Archived']).length;
    cmr_archived = deliveredForCmr.length ? Math.round(archivedCount / deliveredForCmr.length * 100) : 0;
  } else {
    const invoicedOrders2 = deliveredForCmr.filter(r => r.fields['Status'] === 'Invoiced');
    cmr_archived = deliveredForCmr.length ? Math.round(invoicedOrders2.length / deliveredForCmr.length * 100) : 0;
  }

  // Outstanding balance (Eirini's KPI) — total Net Price of delivered-but-not-invoiced orders.
  // Previously hardcoded to 0.
  const outstandingOrders = orders.filter(r => r.fields['Status'] === 'Delivered');
  const outstanding = Math.round(outstandingOrders.reduce((s, r) => s + (parseFloat(r.fields['Net Price']) || 0), 0));

  // Pallet balance (Eirini's KPI) — sum of Net Pallets from PALLET_LEDGER if available.
  // Stored in localStorage as a manually-updated value if no data source is loaded.
  let pallet_balance = 0;
  const storedPallets = localStorage.getItem('perf_pallet_balance');
  if (storedPallets && !isNaN(parseInt(storedPallets))) pallet_balance = parseInt(storedPallets);

  // Weekly plan reviewed (Sotiris's KPI) — localStorage flag, set via /review-plan weekly.
  // Previously hardcoded to 1 (always "reviewed").
  const plan_reviewed_key = `perf_plan_reviewed_${new Date().getFullYear()}_W${wn}`;
  const plan_reviewed = localStorage.getItem(plan_reviewed_key) === '1' ? 1 : 0;

  // Crisis count — maintenance with 'SOS'/'Άμεσα' priority (Greek).
  // Bugfix: old code checked English strings ('high'/'critical'/'urgent') which never match.
  const crisisHighPriority = new Set(['SOS', 'Άμεσα', 'Amesa', 'High', 'Critical', 'Urgent']);
  const crisis_count = PERF.maint.filter(r => {
    const p = (r.fields['Priority'] || '').trim();
    return r.fields['Status'] !== 'Done' && crisisHighPriority.has(p);
  }).length;

  // Weekly Score (composite) — matches Dashboard formula so both show same number.
  // Canonical weights 30/30/25/15 per METRICS.md:
  //   assignment_rate (plan_complete) / on_time / compliance (service_adherence) /
  //   dead_km_score (derived from dead_km with same mapping as Dashboard).
  const _ontimeForScore = on_time >= 0 ? on_time : 80; // default matches Dashboard fallback
  const _deadKmScore = dead_km < 0 ? 100
    : dead_km <= 50 ? 100
    : dead_km <= 150 ? Math.round(100 - (dead_km - 50))
    : Math.max(0, Math.round(50 - (dead_km - 150) * 0.33));
  const weekly_score = (typeof metrics !== 'undefined' && metrics.weeklyScore)
    ? metrics.weeklyScore({
        assignment_rate: plan_complete,
        on_time: _ontimeForScore,
        compliance: service_adherence,
        dead_km_score: _deadKmScore,
      }).score
    : Math.round(plan_complete * 0.30 + _ontimeForScore * 0.30 + service_adherence * 0.25 + _deadKmScore * 0.15);

  return {
    on_time, dead_km, fleet_usage, plan_complete, assign_speed,
    natl_on_time, invoiced_pct, cmr_collected, cmr_archived, weekly_score,
    sub_cost_pct, client_updates, response_time,
    expired_docs, work_orders, downtime_hrs, service_adherence,
    natl_profit, crisis_count, plan_reviewed,
    outstanding, pallet_balance,
    zero_anxiety: 0,
    _meta: { wn, totalWeek, assignedWeek, activeTrucks, weekExports: weekExports.length }
  };
}

// Compute weekly trends (last 4 weeks)
function _perfTrends() {
  const wn = typeof currentWeekNumber === 'function' ? currentWeekNumber() : 0;
  const trends = [];
  for (let w = wn - 3; w <= wn; w++) {
    if (w < 1) continue;
    const weekOrders = PERF.orders.filter(r => r.fields['Week Number'] == w);
    const exports = weekOrders.filter(r => r.fields['Direction'] === 'Export');
    const assigned = exports.filter(r => r.fields['Truck']).length;
    const noReturn = exports.filter(r => r.fields['Truck'] && !r.fields['Matched Import ID']).length;
    const withPerf = weekOrders.filter(r => r.fields['Delivery Performance']);
    const onTime = withPerf.filter(r => r.fields['Delivery Performance'] === 'On Time').length;

    const assignPct = exports.length ? Math.round(assigned / exports.length * 100) : 0;
    const emptyPct = assigned ? Math.round(noReturn / assigned * 100) : 0;
    const otPct = withPerf.length ? Math.round(onTime / withPerf.length * 100) : 0;

    const score = Math.round(assignPct * 0.30 + otPct * 0.30 + (100 - emptyPct) * 0.25 + 50 * 0.15);
    trends.push({ week: w, score, assignPct, emptyPct, otPct, orders: exports.length });
  }
  return trends;
}

/* ── DRAW ─────────────────────────────────────────────────── */
function _perfDraw() {
  const role = typeof ROLE !== 'undefined' ? ROLE : 'owner';
  const userName = typeof user !== 'undefined' ? (user.name || 'User') : 'User';
  const uname = typeof user !== 'undefined' ? (user.username || '') : '';
  const wn = typeof currentWeekNumber === 'function' ? currentWeekNumber() : 0;
  const kpiDefs = PERF_KPIS_BY_USER[uname] || PERF_KPIS[role] || PERF_KPIS.owner;
  const vals = _perfCompute();
  const trends = _perfTrends();
  const _i = (n, size) => (typeof icon === 'function') ? icon(n, size || 14) : '';

  const roleLabels = {
    dimitris: 'Founder — Approval & Strategy',
    kelesmitos: 'Master Planner — Chief Dispatcher',
    pantelis: 'Control Tower — Execution & Zero Anxiety',
    sotiris: 'Chief Ops — National Transport & Oversight',
    thodoris: 'Equipment Manager & HR Director',
    eirini: 'Invoicing & Finance',
  };
  const roleLabelsFallback = {
    owner: 'Founder — Approval & Strategy',
    dispatcher: 'Planner / Dispatcher',
    management: 'Management',
    accountant: 'Finance',
  };

  // KPI → Lucide icon map (optional visual cue)
  const kpiIconMap = {
    weekly_score: 'award',
    fleet_usage: 'truck',
    dead_km: 'route',
    on_time: 'check_circle',
    plan_complete: 'checklist',
    sub_cost_pct: 'coins',
    cmr_collected: 'file_check',
    client_updates: 'bell',
    response_time: 'clock',
    natl_on_time: 'check_circle',
    plan_reviewed: 'check',
    crisis_count: 'alert_triangle',
    natl_profit: 'trending_up',
    expired_docs: 'alert_triangle',
    work_orders: 'checklist',
    downtime_hrs: 'pause_circle',
    service_adherence: 'file_check',
    invoiced_pct: 'euro',
    cmr_archived: 'file_text',
    outstanding: 'euro',
    pallet_balance: 'package',
  };

  // WoW delta helper (current week vs previous trend entry)
  const prevTrend = trends.length >= 2 ? trends[trends.length - 2] : null;
  // Delta data per KPI (where we have trend values)
  const kpiDeltaSrc = {
    weekly_score: prevTrend?.score,
    on_time:      prevTrend?.otPct,
    plan_complete: prevTrend?.assignPct,
  };
  function _wowDelta(kpiId, curr, lowerBetter) {
    const prev = kpiDeltaSrc[kpiId];
    if (prev == null || prev === 0 || isNaN(prev)) return '';
    const diff = curr - prev;
    const pct = Math.round(diff / prev * 100);
    if (pct === 0) return `<span class="perf-delta flat">${_i('minus', 10)}0%</span>`;
    const isUp = pct > 0;
    const cls = lowerBetter
      ? (isUp ? 'up-bad' : 'down')
      : (isUp ? 'up' : 'down-bad');
    const iconName = isUp ? 'trending_up' : 'trending_down';
    return `<span class="perf-delta ${cls}">${_i(iconName, 10)}${isUp ? '+' : ''}${pct}%</span>`;
  }

  // KPI cards — with Lucide icon + WoW delta
  const kpiCards = kpiDefs.map(kpi => {
    const raw = vals[kpi.id] ?? 0;
    const val = typeof raw === 'number' ? raw : 0;
    const pct = kpi.target ? Math.min(Math.round((kpi.invert ? (kpi.target / Math.max(val, 0.1)) : (val / kpi.target)) * 100), 120) : 0;
    const valCls = kpi.invert
      ? (val <= kpi.target ? 'perf-val-ok' : val <= kpi.target * 1.5 ? 'perf-val-warn' : 'perf-val-bad')
      : (val >= kpi.target ? 'perf-val-ok' : val >= kpi.target * 0.7 ? 'perf-val-warn' : 'perf-val-bad');
    const barColor = kpi.invert
      ? (val <= kpi.target ? '#34D399' : val <= kpi.target * 1.5 ? '#F59E0B' : '#F87171')
      : (val >= kpi.target ? '#34D399' : val >= kpi.target * 0.7 ? '#F59E0B' : '#F87171');
    const glowColor = barColor;
    const iconName = kpiIconMap[kpi.id] || 'activity';
    return `<div class="perf-kpi">
      <div class="perf-kpi-glow" style="background:linear-gradient(90deg,${glowColor},transparent)"></div>
      <div class="perf-kpi-label">${_i(iconName, 11)} ${kpi.label}</div>
      <div class="perf-kpi-val ${valCls}">${val}${kpi.unit}${_wowDelta(kpi.id, val, !!kpi.invert)}</div>
      <div class="perf-kpi-target">Target: ${kpi.invert ? '≤' : '≥'}${kpi.target}${kpi.unit}</div>
      <div class="perf-kpi-bar"><div class="perf-kpi-fill" style="width:${Math.min(pct, 100)}%;background:${barColor}"></div></div>
    </div>`;
  }).join('');

  // Trend bars (overall weekly score last 4 weeks)
  const trendHTML = trends.map(t => {
    const color = t.score >= 85 ? '#34D399' : t.score >= 70 ? '#F59E0B' : '#F87171';
    return `<div class="perf-trend-row">
      <div class="perf-trend-wk">W${t.week}</div>
      <div class="perf-trend-bar">
        <div class="perf-trend-fill" style="width:${t.score}%;background:${color}">${t.score}</div>
      </div>
      <div class="perf-trend-val" style="color:${color}">${t.score}/100</div>
    </div>`;
  }).join('');

  // Recent activity (last 10 delivered orders)
  const delivered = PERF.orders
    .filter(r => r.fields['Delivery Performance'])
    .sort((a, b) => (b.fields['Delivery DateTime'] || '').localeCompare(a.fields['Delivery DateTime'] || ''))
    .slice(0, 10);

  const activityRows = delivered.map(r => {
    const f = r.fields;
    const perf = f['Delivery Performance'];
    const pill = perf === 'On Time'
      ? '<span class="perf-pill perf-pill-ok">On Time</span>'
      : '<span class="perf-pill perf-pill-bad">Delayed</span>';
    // Fallback chain: Summary (formula) → Points (lookup) → '?'
    const _loadRaw = f['Loading Summary'] || f['Loading Points'] || '';
    const _delRaw  = f['Delivery Summary'] || f['Delivery Points'] || '';
    const _load = (Array.isArray(_loadRaw) ? _loadRaw.join(' / ') : _loadRaw).split('/')[0]?.trim().slice(0, 15) || '?';
    const _del  = (Array.isArray(_delRaw) ? _delRaw.join(' / ') : _delRaw).split('/')[0]?.trim().slice(0, 15) || '?';
    const route = `${escapeHtml(_load)} → ${escapeHtml(_del)}`;
    const date = toLocalDate(f['Delivery DateTime']);
    return `<tr>
      <td style="color:var(--p-text-dim)">${date ? date.split('-').reverse().join('/') : '—'}</td>
      <td style="font-weight:600;color:var(--p-text)">${route}</td>
      <td style="color:var(--p-text-mid);font-weight:600">${f['Total Pallets'] || '—'}</td>
      <td>${pill}</td>
    </tr>`;
  }).join('');

  // Conic score ring — weekly score
  const scoreColor = vals.weekly_score >= 85 ? '#34D399' : vals.weekly_score >= 70 ? '#F59E0B' : '#F87171';
  const scoreDeg = Math.min(vals.weekly_score, 100) * 3.6;

  // Executive Briefing (was Nakis Feedback)
  const feedback = vals.weekly_score >= 85
    ? `Εξαιρετικη εβδομαδα! On-time ${vals.on_time}%, dead km μολις ${vals.dead_km || 0}km.`
    : vals.weekly_score >= 70
    ? `Καλη εβδομαδα. Προσεξε: dead km ${vals.dead_km || 0}km (target ≤50km).`
    : `Χρειαζεται βελτιωση. Plan completion ${vals.plan_complete}%, on-time ${vals.on_time}%.`;
  const warnings = [
    (vals.dead_km || 0) > 100 ? 'Dead KM >100km — έλεγξε import matching' : '',
    vals.fleet_usage < 60 ? 'Fleet usage χαμηλό — αδρανή φορτηγά' : '',
  ].filter(Boolean).join(' · ');

  // Goals
  const goalsKey = `perf_goals_${user?.name?.replace(/\s/g,'_')||'default'}`;
  const goals = JSON.parse(localStorage.getItem(goalsKey) || '[]');
  const goalsHTML = goals.length ? goals.map((g, i) => `
    <div class="perf-goal-row">
      <input type="checkbox" class="perf-goal-check" ${g.done ? 'checked' : ''} onchange="_perfToggleGoal(${i})">
      <span class="perf-goal-text ${g.done ? 'done' : ''}">${escapeHtml(g.text)}</span>
      <button class="perf-goal-remove" onclick="_perfRemoveGoal(${i})" title="Remove">${_i('x', 12)}</button>
    </div>`).join('') : '<div class="perf-goal-empty">Δεν έχουν οριστεί στόχοι</div>';
  const goalInput = `<div class="perf-goal-input-row">
    <input id="perf-goal-input" type="text" placeholder="Νέος στόχος..." onkeydown="if(event.key==='Enter')_perfAddGoal()">
    <button onclick="_perfAddGoal()">${_i('plus', 12)}</button>
  </div>`;

  document.getElementById('content').innerHTML = `
    <div class="perf-wrap">
      <div class="perf-header">
        <div>
          <div class="perf-name">${escapeHtml(userName)}</div>
          <div class="perf-role">${escapeHtml(roleLabels[uname] || roleLabelsFallback[role] || role)} · Εβδομάδα ${wn}</div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
          <div class="perf-live">
            <span class="perf-live-dot"></span>
            LIVE
          </div>
          <button class="btn btn-secondary btn-sm" onclick="renderPerformance()">${_i('refresh', 14)} Refresh</button>
          <button class="btn btn-ghost btn-sm" onclick="_perfExportCSV()">${_i('file_text', 14)} Export CSV</button>
        </div>
      </div>

      <div class="perf-kpi-grid">${kpiCards}</div>

      <div class="perf-grid">
        <div class="perf-left">
          <!-- Weekly Trend -->
          <div class="perf-card">
            <div class="perf-card-head">
              <div class="perf-card-title">${_i('activity', 12)} WEEKLY SCORE TREND</div>
              <span class="perf-card-meta">Last 4 weeks</span>
            </div>
            <div class="perf-card-body">
              ${trendHTML || '<div style="color:var(--p-text-dim);font-size:12px;padding:var(--space-3) 0">No trend data yet</div>'}
            </div>
          </div>

          <!-- Recent Activity -->
          <div class="perf-card">
            <div class="perf-card-head">
              <div class="perf-card-title">${_i('truck', 12)} ΠΡΟΣΦΑΤΕΣ ΠΑΡΑΔΟΣΕΙΣ</div>
              <span class="perf-card-meta">${delivered.length} orders</span>
            </div>
            <div class="perf-card-body flush">
              <table class="perf-activity">
                <thead><tr><th>Date</th><th>Route</th><th>Pal</th><th>Performance</th></tr></thead>
                <tbody>${activityRows || '<tr><td colspan="4" style="text-align:center;color:var(--p-text-dim);padding:var(--space-5)">No delivered orders yet</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="perf-right">
          <!-- Weekly Score Conic Ring -->
          <div class="perf-card">
            <div class="perf-card-head">
              <div class="perf-card-title">${_i('award', 12)} ΕΒΔΟΜΑΔΙΑΙΟ SCORE</div>
              <span class="perf-card-meta">W${wn}</span>
            </div>
            <div class="perf-card-body perf-score-wrap">
              <div class="perf-score-ring" style="--perf-score-color:${scoreColor};--perf-score-deg:${scoreDeg}deg">
                <div class="perf-score-num" style="color:${scoreColor}">${vals.weekly_score}</div>
              </div>
              <div class="perf-score-label">συνολική απόδοση</div>
              <div class="perf-score-bars">
                ${kpiDefs.map(kpi => {
                  const v = vals[kpi.id] ?? 0;
                  const c = kpi.invert ? (v <= kpi.target ? '#34D399' : '#F87171') : (v >= kpi.target ? '#34D399' : '#F87171');
                  const pctFill = Math.min(kpi.invert ? (kpi.target / Math.max(v, 1) * 100) : (v / kpi.target * 100), 100);
                  return `<div class="perf-score-bar-row">
                    <span class="perf-score-bar-lbl">${kpi.label.split(' ').slice(0,2).join(' ')}</span>
                    <div class="perf-score-bar-track">
                      <div class="perf-score-bar-fill" style="width:${pctFill}%;background:${c}"></div>
                    </div>
                    <span class="perf-score-bar-val" style="color:${c}">${v}${kpi.unit}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>

          <!-- Executive Briefing (was Nakis) -->
          <div class="perf-brief">
            <div class="perf-brief-title">
              ${_i('brain', 12)} EXECUTIVE BRIEFING · W${wn}
            </div>
            <div class="perf-brief-body">
              ${feedback}
              ${warnings ? `<div class="perf-brief-warn">${_i('alert_triangle', 11)} ${warnings}</div>` : ''}
            </div>
          </div>

          <!-- Goals -->
          <div class="perf-card">
            <div class="perf-card-head">
              <div class="perf-card-title">${_i('target', 12)} ΣΤΟΧΟΙ</div>
              <span class="perf-card-meta">${goals.filter(g=>g.done).length}/${goals.length}</span>
            </div>
            <div class="perf-card-body">
              ${goalsHTML}
              ${goalInput}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/* ── GOALS MANAGEMENT ─────────────────────────────────────── */
function _perfGoalsKey() {
  // Crash-test fix: sanitize all non-alphanumeric chars (was only spaces).
  // Prevents localStorage key collisions for names with "/", "!", "." etc.
  return `perf_goals_${(user?.name || 'default').replace(/[^a-zA-Z0-9]/g, '_')}`;
}
function _perfGetGoals() {
  try { return JSON.parse(localStorage.getItem(_perfGoalsKey()) || '[]'); }
  catch { return []; }
}
function _perfSaveGoals(goals) {
  try { localStorage.setItem(_perfGoalsKey(), JSON.stringify(goals)); }
  catch (e) {
    if (typeof logError === 'function') logError(e, 'perf goals save (quota?)');
    if (typeof toast === 'function') toast('Error saving goal — storage full?', 'error');
  }
}
function _perfAddGoal() {
  const input = document.getElementById('perf-goal-input');
  if (!input || !input.value.trim()) return;
  const goals = _perfGetGoals();
  // Crash-test fix: cap goals at 50 to prevent unbounded localStorage growth.
  if (goals.length >= 50) {
    if (typeof toast === 'function') toast('Max 50 goals — delete some first', 'warn');
    return;
  }
  goals.push({ text: input.value.trim().slice(0, 200), done: false, created: localToday() });
  _perfSaveGoals(goals);
  renderPerformance();
}
function _perfToggleGoal(i) {
  const goals = _perfGetGoals();
  // Crash-test fix: bounds check (splice on invalid index silently does nothing, but
  // we want to detect + warn on bad input rather than silent no-op).
  if (!Number.isInteger(i) || i < 0 || i >= goals.length) return;
  goals[i].done = !goals[i].done;
  _perfSaveGoals(goals);
}
function _perfRemoveGoal(i) {
  const goals = _perfGetGoals();
  if (!Number.isInteger(i) || i < 0 || i >= goals.length) return;
  goals.splice(i, 1);
  _perfSaveGoals(goals);
  renderPerformance();
}

// Expose functions used from onclick handlers
window.renderPerformance = renderPerformance;
window._perfRemoveGoal = _perfRemoveGoal;
window._perfAddGoal = _perfAddGoal;
window._perfToggleGoal = _perfToggleGoal;
window._perfExportCSV = _perfExportCSV;

function _perfExportCSV() {
  const orders = PERF.orders;
  if (!orders || !orders.length) { toast('No data to export', 'error'); return; }
  const rows = [['Order No','Direction','Week','Client','Load Date','Del Date','Pallets','Truck','Driver','Partner','Delivery Performance','Status']];
  orders.forEach(r => { const f = r.fields;
    rows.push([f['Order Number']||'', f['Direction']||'', f['Week Number']||'',
      typeof getClientName==='function' ? getClientName((f['Client']||[])[0]) : '',
      f['Loading DateTime']||'', f['Delivery DateTime']||'', f['Total Pallets']||0,
      typeof getTruckPlate==='function' ? getTruckPlate((f['Truck']||[])[0]) : '',
      typeof getDriverName==='function' ? getDriverName((f['Driver']||[])[0]) : '',
      typeof getPartnerName==='function' ? getPartnerName((f['Partner']||[])[0]) : '',
      f['Delivery Performance']||'', f['Status']||'',
    ]); });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `performance_${localToday()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  toast('CSV exported');
}

})();
