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
    c.innerHTML = `<div style="color:var(--danger);padding:40px">Error: ${e.message}</div>`;
    console.error('Performance:', e);
  }
}

/* ── LOAD ─────────────────────────────────────────────────── */
async function _perfLoad() {
  const [orders, natLoads, trucks, maint] = await Promise.all([
    atGetAll(TABLES.ORDERS, {
      fields: ['Direction','Delivery Performance','Status','Truck','Driver','Partner',
               'Is Partner Trip','Loading DateTime','Delivery DateTime','Matched Import ID',
               'Total Pallets','Client','Week Number','Client Notified','ORDER STOPS']
    }, true),
    atGetAll(TABLES.NAT_LOADS, {
      fields: ['Direction','Status','Loading DateTime','Delivery DateTime','Truck','Driver','Delivery Performance']
    }, true).catch(() => []),
    preloadReferenceData().then(() => getRefTrucks()),
    atGetAll(TABLES.MAINT_REQ, { fields: ['Status','Priority','Date Reported'] }, true).catch(() => []),
  ]);
  PERF.orders = orders;
  PERF.natLoads = natLoads;
  PERF.trucks = trucks;
  PERF.maint = maint;
  PERF.locs = getRefLocations();

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
    return Math.min(days * 4.5 * 4.5, 100);
  });
  const fleet_usage = rates.length ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : 0;

  // Plan Completion (assigned / total this week)
  const totalWeek = weekOrders.filter(r => r.fields['Direction'] === 'Export').length;
  const assignedWeek = weekOrders.filter(r => r.fields['Direction'] === 'Export' && r.fields['Truck']).length;
  const plan_complete = totalWeek ? Math.round(assignedWeek / totalWeek * 100) : 0;

  // Assignment Speed (avg hours from creation to truck assigned — simplified)
  const assign_speed = 3.2; // placeholder — would need Created field + assignment timestamp

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

  // National On-Time — from NAT_LOADS Delivery Performance
  const natlWithPerf = PERF.natLoads.filter(r => r.fields['Delivery Performance']);
  const natlOnTime = natlWithPerf.filter(r => r.fields['Delivery Performance'] === 'On Time').length;
  const natl_on_time = natlWithPerf.length ? Math.round(natlOnTime / natlWithPerf.length * 100) : 0;

  // Invoiced %
  const deliveredOrders = orders.filter(r => r.fields['Status'] === 'Delivered' || r.fields['Status'] === 'Invoiced');
  const invoicedOrders = orders.filter(r => r.fields['Status'] === 'Invoiced');
  const invoiced_pct = deliveredOrders.length ? Math.round(invoicedOrders.length / deliveredOrders.length * 100) : 0;

  // CMR collected (orders with Delivery Performance set = CMR likely collected)
  const cmr_collected = withPerf.length && deliveredOrders.length ? Math.round(withPerf.length / deliveredOrders.length * 100) : 0;

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

  // Response time — proxy from open maintenance age (avg days since reported)
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

  // Fleet downtime — proxy from open maintenance count × 24h (each open WO = est 1 day downtime)
  const downtime_hrs = pendingMaint * 24;

  // Service schedule adherence — % of maintenance items resolved on time
  const service_adherence = work_orders;

  // National profitability (placeholder — needs trip cost data not yet available)
  const natl_profit = 0;

  // CMR archived (same as collected for now)
  const cmr_archived = cmr_collected;

  // Crisis count — high/critical priority maintenance issues open
  const crisis_count = PERF.maint.filter(r => {
    const p = (r.fields['Priority']||'').toLowerCase();
    return r.fields['Status'] !== 'Done' && (p === 'high' || p === 'critical' || p === 'urgent');
  }).length;

  // Weekly Score (composite)
  const weekly_score = Math.round(
    (plan_complete * 0.30) +
    (on_time * 0.30) +
    ((100 - empty_legs) * 0.25) +
    (fleet_usage * 0.15)
  );

  return {
    on_time, dead_km, fleet_usage, plan_complete, assign_speed,
    natl_on_time, invoiced_pct, cmr_collected, cmr_archived, weekly_score,
    sub_cost_pct, client_updates, response_time,
    expired_docs, work_orders, downtime_hrs, service_adherence,
    natl_profit, crisis_count,
    plan_reviewed: 1, zero_anxiety: 0,
    outstanding: 0, pallet_balance: 0,
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
  // Per-username KPIs first, fallback to role-based
  const kpiDefs = PERF_KPIS_BY_USER[uname] || PERF_KPIS[role] || PERF_KPIS.owner;
  const vals = _perfCompute();
  const trends = _perfTrends();

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

  // KPI cards
  const kpiCards = kpiDefs.map(kpi => {
    const raw = vals[kpi.id] ?? 0;
    const val = typeof raw === 'number' ? raw : 0;
    const pct = kpi.target ? Math.min(Math.round((kpi.invert ? (kpi.target / Math.max(val, 0.1)) : (val / kpi.target)) * 100), 120) : 0;
    const color = kpi.invert
      ? (val <= kpi.target ? '#10B981' : val <= kpi.target * 1.5 ? '#F59E0B' : '#EF4444')
      : (val >= kpi.target ? '#10B981' : val >= kpi.target * 0.7 ? '#F59E0B' : '#EF4444');
    return `<div class="perf-kpi">
      <div class="perf-kpi-label">${kpi.label}</div>
      <div class="perf-kpi-val" style="color:${color}">${val}${kpi.unit}</div>
      <div class="perf-kpi-target">Target: ${kpi.invert ? '≤' : '≥'}${kpi.target}${kpi.unit}</div>
      <div class="perf-kpi-bar"><div class="perf-kpi-fill" style="width:${Math.min(pct, 100)}%;background:${color}"></div></div>
    </div>`;
  }).join('');

  // Trend bars
  const trendHTML = trends.map(t => {
    const color = t.score >= 85 ? '#10B981' : t.score >= 70 ? '#F59E0B' : '#EF4444';
    return `<div class="perf-trend-row">
      <div class="perf-trend-wk">W${t.week}</div>
      <div class="perf-trend-bar">
        <div class="perf-trend-fill" style="width:${t.score}%;background:${color}">
          <span style="font-size:9px;font-weight:700;color:#fff">${t.score}</span>
        </div>
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
    const route = `${escapeHtml((f['Loading Summary'] || '').split('/')[0]?.trim().slice(0, 15) || '?')} → ${escapeHtml((f['Delivery Summary'] || '').split('/')[0]?.trim().slice(0, 15) || '?')}`;
    const date = toLocalDate(f['Delivery DateTime']);
    return `<tr>
      <td>${date ? date.split('-').reverse().join('/') : '—'}</td>
      <td style="font-weight:600">${route}</td>
      <td>${f['Total Pallets'] || '—'}</td>
      <td>${pill}</td>
    </tr>`;
  }).join('');

  // Score circle SVG
  const scoreColor = vals.weekly_score >= 85 ? '#10B981' : vals.weekly_score >= 70 ? '#F59E0B' : '#EF4444';
  const scoreDash = Math.round(vals.weekly_score * 3.77); // circumference ~377 for r=60

  // Feedback text
  const feedback = vals.weekly_score >= 85
    ? `Εξαιρετικη εβδομαδα! On-time ${vals.on_time}%, dead km μολις ${vals.dead_km || 0}km.`
    : vals.weekly_score >= 70
    ? `Καλη εβδομαδα. Προσεξε: dead km ${vals.dead_km || 0}km (target ≤50km).`
    : `Χρειαζεται βελτιωση. Plan completion ${vals.plan_complete}%, on-time ${vals.on_time}%.`;
  const warnings = [
    (vals.dead_km || 0) > 100 ? 'Dead KM >100km — ελεγξε import matching' : '',
    vals.fleet_usage < 60 ? 'Fleet usage χαμηλο — αδρανη φορτηγα' : '',
  ].filter(Boolean).join(' · ');

  // Goals (from localStorage)
  const goalsKey = `perf_goals_${user?.name?.replace(/\s/g,'_')||'default'}`;
  const goals = JSON.parse(localStorage.getItem(goalsKey) || '[]');
  const goalsHTML = goals.length ? goals.map((g, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
      <input type="checkbox" ${g.done ? 'checked' : ''} onchange="_perfToggleGoal(${i})" style="accent-color:#38BDF8">
      <span style="font-size:12px;color:${g.done?'#64748B':'#E2E8F0'};${g.done?'text-decoration:line-through;':''}flex:1">${escapeHtml(g.text)}</span>
      <button onclick="_perfRemoveGoal(${i})" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:11px;padding:2px 6px">x</button>
    </div>`).join('') : '<div style="color:var(--d-text-dim);font-size:11px;padding:8px 0">Δεν εχουν οριστει στοχοι</div>';
  const goalInput = `<div style="display:flex;gap:6px;margin-top:8px">
    <input id="perf-goal-input" type="text" placeholder="Νεος στοχος..." style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#E2E8F0;font-size:11px">
    <button onclick="_perfAddGoal()" style="padding:4px 12px;border-radius:6px;background:#0284C7;color:#fff;border:none;font-size:10px;font-weight:600;cursor:pointer">+</button>
  </div>`;

  document.getElementById('content').innerHTML = `
    <div class="perf-wrap">
      <div class="perf-header">
        <div>
          <div class="perf-name">${escapeHtml(userName)}</div>
          <div class="perf-role">${escapeHtml(roleLabels[uname] || roleLabelsFallback[role] || role)} · Εβδομάδα ${wn}</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="display:flex;align-items:center;gap:6px;font-size:10px;color:#64748B;letter-spacing:.5px;text-transform:uppercase">
            <span style="width:6px;height:6px;border-radius:50%;background:#10B981;animation:dash-pulse 2s infinite"></span>
            LIVE
          </span>
          <button class="btn btn-ghost" onclick="renderPerformance()">Refresh</button>
        </div>
      </div>

      <div class="perf-kpi-grid">${kpiCards}</div>

      <div class="perf-grid">
        <div class="perf-left">
          <!-- Weekly Trend -->
          <div class="perf-card">
            <div class="perf-card-head">
              <div class="perf-card-title">WEEKLY SCORE TREND</div>
              <span style="font-size:10px;color:#64748B">Last 4 weeks</span>
            </div>
            <div class="perf-card-body">
              ${trendHTML || '<div style="color:var(--d-text-dim);font-size:12px">No trend data yet</div>'}
            </div>
          </div>

          <!-- Recent Activity -->
          <div class="perf-card">
            <div class="perf-card-head">
              <div class="perf-card-title">ΠΡΟΣΦΑΤΕΣ ΠΑΡΑΔΟΣΕΙΣ</div>
              <span style="font-size:10px;color:#64748B">${delivered.length} orders</span>
            </div>
            <div class="perf-card-body" style="padding:0">
              <table class="perf-activity">
                <thead><tr><th>Date</th><th>Route</th><th>Pal</th><th>Performance</th></tr></thead>
                <tbody>${activityRows || '<tr><td colspan="4" style="text-align:center;color:var(--d-text-dim);padding:20px">No delivered orders yet</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="perf-right">
          <!-- Weekly Score Circle -->
          <div class="perf-card">
            <div class="perf-card-head">
              <div class="perf-card-title">ΕΒΔΟΜΑΔΙΑΙΟ SCORE</div>
              <span style="font-size:10px;color:#64748B">W${wn}</span>
            </div>
            <div class="perf-card-body" style="text-align:center;padding:20px 16px">
              <div class="perf-score-ring">
                <svg viewBox="0 0 140 140" style="transform:rotate(-90deg)">
                  <circle cx="70" cy="70" r="60" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8"/>
                  <circle cx="70" cy="70" r="60" fill="none" stroke="${scoreColor}" stroke-width="8"
                    stroke-dasharray="${scoreDash} 377" stroke-linecap="round"/>
                </svg>
                <div class="perf-score-num" style="color:${scoreColor}">${vals.weekly_score}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;text-align:left">
                ${kpiDefs.map(kpi => {
                  const v = vals[kpi.id] ?? 0;
                  const c = kpi.invert ? (v <= kpi.target ? '#10B981' : '#EF4444') : (v >= kpi.target ? '#10B981' : '#EF4444');
                  return `<div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:10px;color:var(--d-text-mid);width:80px">${kpi.label.split(' ').slice(0,2).join(' ')}</span>
                    <div style="flex:1;height:6px;background:rgba(255,255,255,0.04);border-radius:3px;overflow:hidden">
                      <div style="height:100%;width:${Math.min(kpi.invert?(kpi.target/Math.max(v,1)*100):(v/kpi.target*100),100)}%;background:${c};border-radius:3px"></div>
                    </div>
                    <span style="font-size:10px;font-weight:700;color:${c};width:35px;text-align:right">${v}${kpi.unit}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>

          <!-- Νάκης Feedback -->
          <div class="perf-card" style="background:linear-gradient(135deg,#0B1929,#172C45);border:none">
            <div class="perf-card-body" style="padding:16px">
              <div style="font-family:'Syne',sans-serif;font-size:11px;font-weight:700;color:#38BDF8;margin-bottom:8px;letter-spacing:.5px">
                ΝΑΚΗΣ FEEDBACK — W${wn}
              </div>
              <div style="font-size:12px;line-height:1.6;color:#CBD5E1">
                ${feedback}
                ${warnings ? `<div style="margin-top:6px;color:#F59E0B;font-size:11px;font-weight:600">${warnings}</div>` : ''}
              </div>
            </div>
          </div>

          <!-- Goals -->
          <div class="perf-card">
            <div class="perf-card-head">
              <div class="perf-card-title">ΣΤΟΧΟΙ</div>
              <span style="font-size:10px;color:#64748B">${goals.filter(g=>g.done).length}/${goals.length}</span>
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
  return `perf_goals_${user?.name?.replace(/\s/g,'_')||'default'}`;
}
function _perfGetGoals() {
  return JSON.parse(localStorage.getItem(_perfGoalsKey()) || '[]');
}
function _perfSaveGoals(goals) {
  localStorage.setItem(_perfGoalsKey(), JSON.stringify(goals));
}
function _perfAddGoal() {
  const input = document.getElementById('perf-goal-input');
  if (!input || !input.value.trim()) return;
  const goals = _perfGetGoals();
  goals.push({ text: input.value.trim(), done: false, created: localToday() });
  _perfSaveGoals(goals);
  renderPerformance();
}
function _perfToggleGoal(i) {
  const goals = _perfGetGoals();
  if (goals[i]) { goals[i].done = !goals[i].done; _perfSaveGoals(goals); }
}
function _perfRemoveGoal(i) {
  const goals = _perfGetGoals();
  goals.splice(i, 1);
  _perfSaveGoals(goals);
  renderPerformance();
}

// Expose functions used from onclick handlers
window.renderPerformance = renderPerformance;
window._perfRemoveGoal = _perfRemoveGoal;
window._perfAddGoal = _perfAddGoal;
window._perfToggleGoal = _perfToggleGoal;
})();
