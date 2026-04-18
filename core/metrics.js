// ═══════════════════════════════════════════════════════════
// CORE — Canonical Metrics Library
// The ONLY place where metrics are computed. See METRICS.md.
// ═══════════════════════════════════════════════════════════

const metrics = (function() {
  'use strict';

  // ── Period helpers ─────────────────────────────────────
  function _today() { return typeof localToday === 'function' ? localToday() : new Date().toISOString().slice(0,10); }
  function _toISO(d) { if (!d) return null; if (typeof d === 'string') return d.slice(0,10); try { return d.toISOString().slice(0,10); } catch { return null; } }
  function _daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
  function _inPeriod(dateStr, period) {
    if (!period || !dateStr) return true;
    const d = _toISO(dateStr);
    if (period.from && d < period.from) return false;
    if (period.to && d > period.to) return false;
    if (period.daysBack) { const from = _daysAgo(period.daysBack); if (d < from) return false; }
    return true;
  }
  function _weekOf(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const y = d.getFullYear(), j = new Date(y,0,1);
    return Math.ceil(((d-j)/86400000 + j.getDay() + 1) / 7);
  }

  // ── Utilities ──────────────────────────────────────────
  const _fieldArr = v => Array.isArray(v) ? v : (v ? [v] : []);
  const _pct = (n, d) => d > 0 ? Math.round(n/d*100) : 0;

  // ════ OPERATIONAL ═══════════════════════════════════

  function unassignedOrders(orders, opts = {}) {
    const { direction, period } = opts;
    return orders.filter(r => {
      const f = r.fields;
      if (direction && f['Direction'] !== direction) return false;
      if (period && !_inPeriod(f['Loading DateTime'], period)) return false;
      const hasTruck = _fieldArr(f['Truck']).length > 0;
      const hasPartner = _fieldArr(f['Partner']).length > 0;
      return !hasTruck && !hasPartner;
    }).length;
  }

  function pendingToday(orders, date) {
    const today = date || _today();
    const doneStatuses = new Set(['In Transit','Delivered','Invoiced']);
    return orders.filter(r => {
      const f = r.fields;
      const ld = _toISO(f['Loading DateTime']);
      return ld === today && !doneStatuses.has(f['Status']||'');
    }).length;
  }

  function loadingsDone(orders, date) {
    const today = date || _today();
    const doneStatuses = new Set(['In Transit','Delivered','Invoiced']);
    return orders.filter(r => {
      const f = r.fields;
      return _toISO(f['Loading DateTime']) === today && doneStatuses.has(f['Status']||'');
    }).length;
  }

  function deliveriesDone(orders, date) {
    const today = date || _today();
    return orders.filter(r => {
      const f = r.fields;
      return _toISO(f['Delivery DateTime']) === today && ['Delivered','Invoiced'].includes(f['Status']||'');
    }).length;
  }

  function checklistProgress(orders) {
    const checks = ['Docs Ready','Temp OK','CMR Photo Received','Client Notified','Driver Notified'];
    let total = 0, done = 0;
    orders.forEach(r => checks.forEach(k => {
      if (r.fields[k] !== undefined) { total++; if (r.fields[k]) done++; }
    }));
    return { done, total, pct: _pct(done, total) };
  }

  function overdueDeliveries(orders) {
    const today = _today();
    const delivered = new Set(['Delivered','Invoiced']);
    return orders.filter(r => {
      const f = r.fields;
      const del = _toISO(f['Delivery DateTime']);
      return del && del < today && !delivered.has(f['Status']||'');
    });
  }

  function highRiskDeliveries(orders) {
    const now = Date.now();
    const cutoff = now + 48*3600*1000;
    return orders.filter(r => {
      const f = r.fields;
      const hasTruck = _fieldArr(f['Truck']).length > 0;
      const hasPartner = _fieldArr(f['Partner']).length > 0;
      if (hasTruck || hasPartner) return false;
      if (!f['Delivery DateTime']) return false;
      const t = new Date(f['Delivery DateTime']).getTime();
      return t >= now && t <= cutoff;
    }).length;
  }

  function rampPalletFlow(rampRecs, date) {
    const today = date || _today();
    let inb = 0, out = 0;
    rampRecs.forEach(r => {
      const f = r.fields;
      if (_toISO(f['Plan Date']) !== today) return;
      const p = f['Pallets'] || 0;
      if (f['Type'] === 'Παραλαβή') inb += p;
      else if (f['Type'] === 'Φόρτωση') out += p;
    });
    return { inbound: inb, outbound: out, net: inb - out };
  }

  function stockInWarehouse(rampRecs) {
    return rampRecs.filter(r => {
      const f = r.fields;
      return f['Type'] === 'Παραλαβή' && f['Status'] === 'Done' && f['Stock Status'] === 'In Stock';
    }).reduce((sum, r) => sum + (r.fields['Pallets']||0), 0);
  }

  // ════ PERFORMANCE ═══════════════════════════════════

  function onTimePct(orders, opts = {}) {
    const { period } = opts;
    const considered = orders.filter(r => {
      const f = r.fields;
      if (period && !_inPeriod(f['Delivery DateTime'], period)) return false;
      return ['On Time','Delayed'].includes(f['Delivery Performance']||'');
    });
    const onTime = considered.filter(r => r.fields['Delivery Performance'] === 'On Time').length;
    return { pct: _pct(onTime, considered.length), onTime, total: considered.length };
  }

  function delayedPct(orders, opts = {}) {
    const r = onTimePct(orders, opts);
    return { pct: 100 - r.pct, delayed: r.total - r.onTime, total: r.total };
  }

  function onTimeTrend(orders, opts = {}) {
    const { weeks = 4, currentWeek } = opts;
    const curW = currentWeek || _weekOf(_today());
    const byWeek = {};
    orders.forEach(r => {
      const f = r.fields;
      const w = f['Week Number'];
      if (!w || w < curW - weeks || w > curW) return;
      if (!['On Time','Delayed'].includes(f['Delivery Performance']||'')) return;
      if (!byWeek[w]) byWeek[w] = { total: 0, onTime: 0 };
      byWeek[w].total++;
      if (f['Delivery Performance'] === 'On Time') byWeek[w].onTime++;
    });
    const out = [];
    for (let w = curW - weeks; w <= curW; w++) {
      const d = byWeek[w] || { total: 0, onTime: 0 };
      out.push({ week: w, pct: _pct(d.onTime, d.total), total: d.total });
    }
    return out;
  }

  function onTimeStreak(orders, opts = {}) {
    const { currentWeek, threshold = 90, lookback = 8 } = opts;
    const curW = currentWeek || _weekOf(_today());
    const trend = onTimeTrend(orders, { weeks: lookback, currentWeek: curW });
    let streak = 0;
    for (let i = trend.length - 2; i >= 0; i--) {
      const t = trend[i];
      if (!t.total) break;
      if (t.pct >= threshold) streak++;
      else break;
    }
    return streak;
  }

  function cmrSameDayPct(orders, opts = {}) {
    const { period } = opts;
    const delivered = orders.filter(r => {
      const f = r.fields;
      if (period && !_inPeriod(f['Delivery DateTime'], period)) return false;
      return ['Delivered','Invoiced'].includes(f['Status']||'');
    });
    const withCMR = delivered.filter(r => r.fields['CMR Photo Received'] === true).length;
    return { pct: _pct(withCMR, delivered.length), withCMR, total: delivered.length };
  }

  function clientUpdatePct(orders, opts = {}) {
    const { period } = opts;
    const delivered = orders.filter(r => {
      const f = r.fields;
      if (period && !_inPeriod(f['Delivery DateTime'], period)) return false;
      return ['Delivered','Invoiced'].includes(f['Status']||'');
    });
    const notified = delivered.filter(r => r.fields['Client Notified'] === true).length;
    return { pct: _pct(notified, delivered.length), notified, total: delivered.length };
  }

  function emptyLegs(exports, imports) {
    const exp = exports.map(e => ((e.fields['Delivery Summary']||'').split(',').pop()||'').trim().slice(0,3).toUpperCase());
    const imp = imports.map(i => ((i.fields['Loading Summary']||'').split(',').pop()||'').trim().slice(0,3).toUpperCase());
    const impSet = new Set(imp.filter(Boolean));
    const expSet = new Set(exp.filter(Boolean));
    const soloExp = exp.filter(r => r && !impSet.has(r)).length;
    const soloImp = imp.filter(r => r && !expSet.has(r)).length;
    return { soloExp, soloImp, total: soloExp + soloImp };
  }

  // Haversine distance in km
  function _haversine(lat1, lon1, lat2, lon2) {
    if (lat1==null||lat2==null||lon1==null||lon2==null) return 0;
    const R = 6371;
    const dLat = (lat2-lat1) * Math.PI / 180;
    const dLon = (lon2-lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function deadKmForPeriod(stops, locations, opts = {}) {
    // stops: ORDER_STOPS records (must include linked Order per stop)
    // locations: LOCATIONS records with Latitude/Longitude
    const { period } = opts;
    const locMap = {};
    (locations||[]).forEach(l => { locMap[l.id] = l.fields; });

    // Group stops by truck assignment (from linked parent Order)
    // Assumption: stops array already filtered to target period
    // We'd compute per-truck the distance between trip N unload → trip N+1 load
    // For simplicity of the canonical definition, we return the structure and let callers implement

    // Simpler version: compute distance between linked orders' unload/load pairs
    const distances = [];
    stops.forEach(s => {
      const f = s.fields;
      const loc = (f['Location']||[])[0];
      if (!loc || !locMap[loc]) return;
      // Need pairing logic — caller must sort by truck + date
      // For now, just return empty result, force callers to build this with context
    });

    // Fallback: if no distances computed, return zeros
    const avg = distances.length ? Math.round(distances.reduce((a,b)=>a+b,0) / distances.length) : 0;
    const max = distances.length ? Math.max(...distances) : 0;
    const score = avg <= 50 ? 100
      : avg <= 150 ? Math.round(100 - (avg-50) * 0.5)
      : Math.max(0, Math.round(50 - (avg-150) * 0.5));
    return { avg, max, score, count: distances.length, list: distances };
  }

  // ════ FINANCIAL ═════════════════════════════════════

  function outstandingBalance(orders, natOrders = []) {
    const pool = [...orders, ...natOrders];
    return pool
      .filter(r => r.fields['Status'] === 'Delivered' && !r.fields['Invoiced'])
      .reduce((sum, r) => sum + (parseFloat(r.fields['Price'])||0), 0);
  }

  function revenueInvoiced(orders, natOrders = [], opts = {}) {
    const { period } = opts;
    const pool = [...orders, ...natOrders];
    return pool
      .filter(r => r.fields['Status'] === 'Invoiced')
      .filter(r => !period || _inPeriod(r.fields['Invoice Date']||r.fields['Delivery DateTime'], period))
      .reduce((sum, r) => sum + (parseFloat(r.fields['Price'])||0), 0);
  }

  function revenueReadyToInvoice(orders) {
    return orders
      .filter(r => {
        const f = r.fields;
        if (f['Status'] !== 'Delivered' || f['Invoiced']) return false;
        if (f['Pallet Exchange']) {
          // Must have both sheets uploaded (if VS) or sheet 1 only (if not VS)
          if (!f['Pallet Sheet 1 Uploaded']) return false;
          if (f['Veroia Switch '] && !f['Pallet Sheet 2 Uploaded']) return false;
        }
        return true;
      })
      .reduce((sum, r) => sum + (parseFloat(r.fields['Price'])||0), 0);
  }

  function overdueInvoices(orders, opts = {}) {
    const { daysCutoff = 30 } = opts;
    const cutoff = _daysAgo(daysCutoff);
    return orders.filter(r => {
      const f = r.fields;
      if (f['Status'] !== 'Delivered' || f['Invoiced']) return false;
      return _toISO(f['Delivery DateTime']) < cutoff;
    });
  }

  function palletBalance(ledgerRecs, opts = {}) {
    const { counterpartyField = 'Loading Supplier' } = opts;
    const balances = {};
    ledgerRecs.forEach(r => {
      const f = r.fields;
      const sign = f['Direction'] === 'OUT' ? 1 : -1;
      const id = _fieldArr(f[counterpartyField])[0];
      if (!id) return;
      balances[id] = (balances[id] || 0) + sign * (f['Pallets']||0);
    });
    const total = Object.values(balances).reduce((a,b)=>a+b, 0);
    return { balances, total };
  }

  function topDebtors(ledgerRecs, opts = {}) {
    const { counterpartyField = 'Loading Supplier', topN = 5 } = opts;
    const { balances } = palletBalance(ledgerRecs, { counterpartyField });
    return Object.entries(balances)
      .filter(([,v]) => v > 0)
      .sort((a,b) => b[1] - a[1])
      .slice(0, topN)
      .map(([id, amount]) => ({ id, amount }));
  }

  // ════ FLEET ═════════════════════════════════════════

  function fleetUtilization(trucks, orders, opts = {}) {
    const { week } = opts;
    const active = trucks.filter(t => t.fields['Active']);
    const assignedIds = new Set();
    orders.forEach(o => {
      if (week && o.fields['Week Number'] !== week) return;
      _fieldArr(o.fields['Truck']).forEach(id => assignedIds.add(id));
    });
    const busy = active.filter(t => assignedIds.has(t.id)).length;
    return { busy, total: active.length, pct: _pct(busy, active.length) };
  }

  function idleTrucks(trucks, orders, opts = {}) {
    const { week } = opts;
    const active = trucks.filter(t => t.fields['Active']);
    const assignedIds = new Set();
    orders.forEach(o => {
      if (week && o.fields['Week Number'] !== week) return;
      _fieldArr(o.fields['Truck']).forEach(id => assignedIds.add(id));
    });
    return active.filter(t => !assignedIds.has(t.id)).length;
  }

  function expiryAlerts(trucks, opts = {}) {
    const { daysAhead = 30 } = opts;
    const cutoff = _daysAgo(-daysAhead); // +N days from today
    const today = _today();
    const kteo = [], kek = [], insurance = [];
    trucks.forEach(t => {
      if (!t.fields['Active']) return;
      const k = _toISO(t.fields['KTEO Expiry']); if (k && k <= cutoff) kteo.push(t);
      const e = _toISO(t.fields['KEK Expiry']); if (e && e <= cutoff) kek.push(t);
      const i = _toISO(t.fields['Insurance Expiry']); if (i && i <= cutoff) insurance.push(t);
    });
    return { kteo, kek, insurance, total: new Set([...kteo, ...kek, ...insurance].map(t=>t.id)).size };
  }

  function expiryAlertsTrailers(trailers, opts = {}) {
    const { daysAhead = 30 } = opts;
    const cutoff = _daysAgo(-daysAhead);
    const atp = [], insurance = [];
    trailers.forEach(t => {
      const a = _toISO(t.fields['ATP Expiry']); if (a && a <= cutoff) atp.push(t);
      const i = _toISO(t.fields['Insurance Expiry']); if (i && i <= cutoff) insurance.push(t);
    });
    return { atp, insurance, total: new Set([...atp, ...insurance].map(t=>t.id)).size };
  }

  function compliancePct(trucks) {
    const active = trucks.filter(t => t.fields['Active']);
    const today = _today();
    const valid = active.filter(t => {
      const f = t.fields;
      const ok = d => !d || _toISO(d) >= today;
      return ok(f['KTEO Expiry']) && ok(f['KEK Expiry']) && ok(f['Insurance Expiry']);
    }).length;
    return { valid, total: active.length, pct: _pct(valid, active.length) };
  }

  function fleetDowntime(maintRecs) {
    const pending = maintRecs.filter(r => r.fields['Status'] !== 'Done').length;
    return pending * 24; // estimate: 24h per pending maintenance
  }

  // ════ HR ══════════════════════════════════════════

  function assignmentRate(orders, opts = {}) {
    const { week } = opts;
    const periodOrders = week ? orders.filter(o => o.fields['Week Number'] === week) : orders;
    const assigned = periodOrders.filter(o => {
      const f = o.fields;
      return _fieldArr(f['Truck']).length > 0 || _fieldArr(f['Partner']).length > 0;
    }).length;
    return { assigned, total: periodOrders.length, pct: _pct(assigned, periodOrders.length) };
  }

  function partnerTripPct(orders, opts = {}) {
    const { week } = opts;
    const periodOrders = week ? orders.filter(o => o.fields['Week Number'] === week) : orders;
    const assigned = periodOrders.filter(o => {
      const f = o.fields;
      return _fieldArr(f['Truck']).length > 0 || _fieldArr(f['Partner']).length > 0;
    });
    const partners = assigned.filter(o => _fieldArr(o.fields['Partner']).length > 0).length;
    return { partners, assigned: assigned.length, pct: _pct(partners, assigned.length) };
  }

  function workOrdersResolvedPct(maintRecs, opts = {}) {
    const { period } = opts;
    const filtered = period ? maintRecs.filter(r => _inPeriod(r.fields['Date Reported'], period)) : maintRecs;
    const resolved = filtered.filter(r => r.fields['Status'] === 'Done').length;
    return { resolved, total: filtered.length, pct: _pct(resolved, filtered.length) };
  }

  function crisisEventsResolved(maintRecs) {
    return maintRecs.filter(r => {
      const f = r.fields;
      return ['High','Critical'].includes(f['Priority']) && f['Status'] === 'Done';
    }).length;
  }

  // ════ INVENTORY ═══════════════════════════════════

  function palletSheetsComplete(orders) {
    const withPE = orders.filter(r => r.fields['Pallet Exchange']);
    const complete = withPE.filter(r => {
      const f = r.fields;
      if (!f['Pallet Sheet 1 Uploaded']) return false;
      if (f['Veroia Switch '] && !f['Pallet Sheet 2 Uploaded']) return false;
      return true;
    }).length;
    return { complete, missing: withPE.length - complete, total: withPE.length, pct: _pct(complete, withPE.length) };
  }

  function stockAgeBuckets(rampRecs) {
    const today = new Date(_today());
    let fresh = 0, aging = 0, old = 0;
    rampRecs
      .filter(r => r.fields['Type']==='Παραλαβή' && r.fields['Status']==='Done' && r.fields['Stock Status']==='In Stock')
      .forEach(r => {
        const planDate = _toISO(r.fields['Plan Date']);
        if (!planDate) return;
        const days = Math.floor((today - new Date(planDate)) / 86400000);
        const p = r.fields['Pallets'] || 0;
        if (days <= 1) fresh += p;
        else if (days <= 3) aging += p;
        else old += p;
      });
    return { fresh_le_1d: fresh, aging_2_3d: aging, old_gt_3d: old };
  }

  // ════ BUSINESS HEALTH ═════════════════════════════

  function weeklyScore(inputs) {
    const { assignment_rate = 0, on_time = 0, compliance = 0, dead_km_score = 0 } = inputs;
    const score = Math.round(0.30 * assignment_rate + 0.30 * on_time + 0.25 * compliance + 0.15 * dead_km_score);
    const color = score >= 85 ? 'green' : score >= 70 ? 'amber' : 'red';
    return { score, color, components: inputs };
  }

  function ordersDelta(curOrders, prevOrders) {
    const cur = Array.isArray(curOrders) ? curOrders.length : curOrders;
    const prev = Array.isArray(prevOrders) ? prevOrders.length : prevOrders;
    const delta = cur - prev;
    const deltaPct = prev ? Math.round(delta / prev * 100) : 0;
    return { current: cur, prev, delta, deltaPct };
  }

  function directionImbalance(exportCount, importCount) {
    return Math.abs(exportCount - importCount);
  }

  // ════ SNAPSHOT CAPTURE (historical storage) ═══════════

  /**
   * Capture a metric snapshot to METRICS_SNAPSHOTS Airtable table.
   * @param {Object} snapshot - { key, category, periodType, periodLabel, value, unit, source, notes }
   */
  async function captureSnapshot(snapshot) {
    if (typeof atCreate !== 'function' || typeof TABLES === 'undefined') return null;
    const s = snapshot || {};
    const now = new Date().toISOString();
    const fields = {
      'Snapshot ID': `${s.key}__${s.periodLabel||_today()}__${now.slice(0,19)}`,
      'Captured At': now,
      'Period Type': s.periodType || 'day',
      'Period Label': s.periodLabel || _today(),
      'Metric Key': s.key,
      'Metric Category': s.category || 'op',
    };
    if (s.unit) fields['Unit'] = s.unit;
    if (s.source) fields['Source'] = s.source;
    if (s.notes) fields['Notes'] = s.notes;
    // Value dispatch: numeric vs structured
    if (typeof s.value === 'number') fields['Value Numeric'] = s.value;
    else if (typeof s.value === 'string') fields['Value Text'] = s.value;
    else if (s.value && typeof s.value === 'object') {
      fields['Value JSON'] = JSON.stringify(s.value);
      if (typeof s.value.pct === 'number') fields['Value Numeric'] = s.value.pct;
      else if (typeof s.value.total === 'number') fields['Value Numeric'] = s.value.total;
    }
    try { return await atCreate(TABLES.METRICS_SNAPSHOTS, fields); }
    catch(e) { console.warn('Metric snapshot failed:', s.key, e); return null; }
  }

  /**
   * Batch capture — writes up to 10 snapshots at once (Airtable limit).
   */
  async function captureSnapshotsBatch(list) {
    if (typeof atCreateBatch !== 'function' || typeof TABLES === 'undefined') return null;
    const now = new Date().toISOString();
    const recs = list.map(s => {
      const fields = {
        'Snapshot ID': `${s.key}__${s.periodLabel||_today()}__${now.slice(0,19)}`,
        'Captured At': now,
        'Period Type': s.periodType || 'day',
        'Period Label': s.periodLabel || _today(),
        'Metric Key': s.key,
        'Metric Category': s.category || 'op',
      };
      if (s.unit) fields['Unit'] = s.unit;
      if (s.source) fields['Source'] = s.source;
      if (s.notes) fields['Notes'] = s.notes;
      if (typeof s.value === 'number') fields['Value Numeric'] = s.value;
      else if (typeof s.value === 'string') fields['Value Text'] = s.value;
      else if (s.value && typeof s.value === 'object') {
        fields['Value JSON'] = JSON.stringify(s.value);
        if (typeof s.value.pct === 'number') fields['Value Numeric'] = s.value.pct;
        else if (typeof s.value.total === 'number') fields['Value Numeric'] = s.value.total;
      }
      return { fields };
    });
    try { return await atCreateBatch(TABLES.METRICS_SNAPSHOTS, recs); }
    catch(e) { console.warn('Batch snapshot failed:', e); return null; }
  }

  /**
   * Fetch historical snapshots for a metric key.
   */
  async function getSnapshotHistory(metricKey, opts = {}) {
    if (typeof atGetAll !== 'function' || typeof TABLES === 'undefined') return [];
    const { periodType, from, to } = opts;
    const filters = [`{Metric Key}='${metricKey}'`];
    if (periodType) filters.push(`{Period Type}='${periodType}'`);
    if (from) filters.push(`IS_AFTER({Captured At},'${from}')`);
    if (to) filters.push(`IS_BEFORE({Captured At},'${to}')`);
    try {
      return await atGetAll(TABLES.METRICS_SNAPSHOTS, {
        filterByFormula: filters.length > 1 ? `AND(${filters.join(',')})` : filters[0],
        sort: [{ field: 'Captured At', direction: 'desc' }]
      }, false);
    } catch(e) { console.warn('History fetch failed:', e); return []; }
  }

  // ── Public API ─────────────────────────────────────
  return {
    // Operational
    unassignedOrders, pendingToday, loadingsDone, deliveriesDone,
    checklistProgress, overdueDeliveries, highRiskDeliveries,
    rampPalletFlow, stockInWarehouse,
    // Performance
    onTimePct, delayedPct, onTimeTrend, onTimeStreak,
    cmrSameDayPct, clientUpdatePct, emptyLegs, deadKmForPeriod,
    // Financial
    outstandingBalance, revenueInvoiced, revenueReadyToInvoice,
    overdueInvoices, palletBalance, topDebtors,
    // Fleet
    fleetUtilization, idleTrucks, expiryAlerts, expiryAlertsTrailers,
    compliancePct, fleetDowntime,
    // HR
    assignmentRate, partnerTripPct, workOrdersResolvedPct, crisisEventsResolved,
    // Inventory
    palletSheetsComplete, stockAgeBuckets,
    // Business health
    weeklyScore, ordersDelta, directionImbalance,
    // Snapshot capture & history
    captureSnapshot, captureSnapshotsBatch, getSnapshotHistory,
    // Utilities (exposed for callers)
    _today, _toISO, _daysAgo, _weekOf,
  };
})();

if (typeof window !== 'undefined') window.metrics = metrics;
