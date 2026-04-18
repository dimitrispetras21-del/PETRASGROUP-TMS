// ═══════════════════════════════════════════════════════════
// MODULE — METRICS AUDIT
// Displays every canonical metric computed from live data.
// Purpose: verify accuracy. Compare values against what
// other pages (Dashboard, Invoicing, etc.) show.
// ═══════════════════════════════════════════════════════════

const AUDIT = {
  results: null,
  loadedAt: null,
  fetching: false,
};

async function renderMetricsAudit() {
  const c = document.getElementById('content');
  document.getElementById('topbarTitle').textContent = 'Metrics Audit';
  c.style.padding = '';
  c.innerHTML = `<div style="text-align:center;padding:60px;color:#94A3B8">Loading audit data...</div>`;

  if (AUDIT.fetching) return;
  AUDIT.fetching = true;

  try {
    // Fetch all source data in parallel (uses cache where available)
    const [orders, natOrders, natLoads, trucks, trailers, drivers, partners,
           locations, clients, ramp, maintReq, plSup, plPart] = await Promise.all([
      atGetAll(TABLES.ORDERS, { fields: [
        'Order Number','Direction','Status','Invoiced','Price','Loading DateTime','Delivery DateTime',
        'Truck','Partner','Trailer','Driver','Total Pallets','Week Number',
        'Delivery Performance','Pallet Exchange','Pallet Sheet 1 Uploaded','Pallet Sheet 2 Uploaded',
        'Veroia Switch ','Docs Ready','Temp OK','CMR Photo Received','Client Notified','Driver Notified'
      ]}, true).catch(() => []),
      atGetAll(TABLES.NAT_ORDERS, { fields: ['Status','Invoiced','Price','Truck','Partner','Loading DateTime'] }, true).catch(() => []),
      atGetAll(TABLES.NAT_LOADS, { fields: ['Status','Truck','Partner','Loading DateTime','Direction'] }, true).catch(() => []),
      atGetAll(TABLES.TRUCKS, { fields: ['License Plate','Active','KTEO Expiry','KEK Expiry','Insurance Expiry'] }, true).catch(() => []),
      atGetAll(TABLES.TRAILERS, { fields: ['License Plate','ATP Expiry','Insurance Expiry'] }, true).catch(() => []),
      atGetAll(TABLES.DRIVERS, { fields: ['Full Name','Active'] }, true).catch(() => []),
      atGetAll(TABLES.PARTNERS, { fields: ['Company Name'] }, true).catch(() => []),
      atGetAll(TABLES.LOCATIONS, { fields: ['Name','City'] }, true).catch(() => []),
      atGetAll(TABLES.CLIENTS, { fields: ['Company Name'] }, true).catch(() => []),
      atGetAll(TABLES.RAMP, { fields: ['Type','Status','Pallets','Plan Date','Stock Status'] }, false).catch(() => []),
      atGetAll(TABLES.MAINT_REQ, { fields: ['Status','Priority','Date Reported'] }, true).catch(() => []),
      atGetAll(TABLES.PALLET_LEDGER_SUPPLIERS, { fields: ['Direction','Pallets','Loading Supplier'] }, false).catch(() => []),
      atGetAll(TABLES.PALLET_LEDGER_PARTNERS, { fields: ['Direction','Pallets','Partner'] }, false).catch(() => []),
    ]);

    AUDIT.results = _runAllMetrics({ orders, natOrders, natLoads, trucks, trailers, drivers, partners, locations, clients, ramp, maintReq, plSup, plPart });
    AUDIT.loadedAt = new Date();
    _auditDraw();
  } catch(e) {
    c.innerHTML = `<div style="padding:40px;color:var(--danger)">Error: ${e.message}</div>`;
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
      `${trailAlerts.total} trailers`, `ATP: ${trailAlerts.atp.length}, Insurance: ${trailAlerts.insurance.length}`);

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

function _auditDraw() {
  const c = document.getElementById('content');
  if (!AUDIT.results) return;

  const byCategory = {};
  AUDIT.results.forEach(r => {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  });

  const catLabels = {
    op: { name: '🎯 OPERATIONAL', color: '#0284C7' },
    perf: { name: '📊 PERFORMANCE', color: '#10B981' },
    fin: { name: '💰 FINANCIAL', color: '#F59E0B' },
    fleet: { name: '🚛 FLEET', color: '#8B5CF6' },
    hr: { name: '👥 HR', color: '#EC4899' },
    inv: { name: '📦 INVENTORY', color: '#06B6D4' },
    biz: { name: '🏢 BUSINESS', color: '#1E40AF' },
  };

  const catHTML = cat => {
    const label = catLabels[cat] || { name: cat, color: '#6B7280' };
    const items = byCategory[cat] || [];
    return `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;color:${label.color};margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${label.color}33">${label.name}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="color:var(--text-dim);font-size:10px;text-transform:uppercase;letter-spacing:0.5px">
          <th style="text-align:left;padding:6px 8px;width:40%">Metric</th>
          <th style="text-align:left;padding:6px 8px;width:20%">Key</th>
          <th style="text-align:right;padding:6px 8px;width:15%">Value</th>
          <th style="text-align:left;padding:6px 8px;width:25%">Note</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const hasWarn = (r.diag||[]).length > 0 || String(r.value).includes('ERR');
            return `<tr style="border-bottom:1px solid var(--border);${hasWarn?'background:#FEF3C7':''}">
              <td style="padding:8px;font-weight:600">${r.label}</td>
              <td style="padding:8px;color:var(--text-dim);font-family:monospace;font-size:11px">${r.key}</td>
              <td style="padding:8px;text-align:right;font-weight:700;font-family:'Syne',sans-serif;font-size:15px">${r.value}</td>
              <td style="padding:8px;color:var(--text-dim);font-size:11px">${r.note || ''}${r.diag && r.diag.length ? '<br><span style="color:#D97706">⚠ '+r.diag.join(' · ')+'</span>' : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  };

  c.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div>
      <h2 style="font-family:'Syne',sans-serif;font-size:22px;margin:0">Metrics Audit</h2>
      <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
        ${AUDIT.results.length} metrics · Loaded ${AUDIT.loadedAt?.toLocaleTimeString('el-GR')||'—'} · All from canonical <code>metrics.js</code>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" onclick="_auditExportJSON()">Copy JSON</button>
      <button class="btn btn-new-order" onclick="renderMetricsAudit()">🔄 Refresh</button>
    </div>
  </div>

  <div style="background:#DBEAFE;border:1px solid #3B82F6;color:#1E40AF;padding:12px 16px;border-radius:6px;margin-bottom:16px;font-size:13px">
    <b>💡 Πώς να το χρησιμοποιήσεις:</b> Άνοιξε αυτή τη σελίδα σε 1 tab και το Dashboard/Invoicing/Ops σε άλλο tab.
    Σύγκρινε κάθε νούμερο. Αν κάπου διαφέρει, πες μου ποιο είναι το σωστό.
    Τα κίτρινα rows έχουν warnings ή errors που χρειάζονται προσοχή.
  </div>

  ${['op','perf','fin','fleet','hr','inv','biz'].map(catHTML).join('')}

  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:14px;margin-top:12px;font-size:12px;color:var(--text-dim)">
    <b>Legend:</b> Κίτρινο row = warning/error. <b>Formula:</b> see <code>METRICS.md</code> και <code>core/metrics.js</code>.
    <b>Drift check:</b> αν άλλη σελίδα δείχνει διαφορετικό νούμερο, το πρόβλημα είναι σε εκείνη τη σελίδα
    (πιθανόν δεν χρησιμοποιεί canonical functions ακόμα).
  </div>`;
}

function _auditExportJSON() {
  const out = {
    loadedAt: AUDIT.loadedAt?.toISOString(),
    metrics: AUDIT.results,
  };
  navigator.clipboard.writeText(JSON.stringify(out, null, 2)).then(() => {
    toast('JSON copied to clipboard');
  }).catch(() => toast('Copy failed', 'error'));
}

// Expose
window.renderMetricsAudit = renderMetricsAudit;
window._auditExportJSON = _auditExportJSON;
