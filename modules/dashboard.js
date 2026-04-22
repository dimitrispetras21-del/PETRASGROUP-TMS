// ═══════════════════════════════════════════════
// MODULE — OPERATIONS DASHBOARD v2
// Design tokens · Lucide icons · harmonized palette
// ═══════════════════════════════════════════════
(function() {
'use strict';

let _dashRefreshTimer = null;
const _i = (n, size) => (typeof icon === 'function') ? icon(n, size || 14) : '';

async function renderDashboard() {
  const c = document.getElementById('content');
  c.innerHTML = _dashSkeleton();

  try {
    // Load all data in parallel — orders limited to last 30 days for performance
    const _dashCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await preloadReferenceData();
    const trucks = getRefTrucks();
    const drivers = getRefDrivers();
    const clients = getRefClients();
    const trailers = getRefTrailers();
    const [orders, natLoads] = await Promise.all([
      atGet(TABLES.ORDERS, `IS_AFTER({Loading DateTime}, '${_dashCutoff}')`),
      atGet(TABLES.NAT_LOADS),
    ]);

    // Batch fetch ORDER_STOPS for deadheading calc
    const _dashStopsByOrder = {};
    const _dashStopIds = orders.flatMap(r => r.fields['ORDER STOPS'] || []);
    if (_dashStopIds.length) {
      try {
        for (let b = 0; b < _dashStopIds.length; b += 90) {
          const batch = _dashStopIds.slice(b, b + 90);
          const ff = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
          const recs = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: ff }, false);
          recs.forEach(sr => {
            const pid = (sr.fields[F.STOP_PARENT_ORDER] || [])[0];
            if (pid) { if (!_dashStopsByOrder[pid]) _dashStopsByOrder[pid] = []; _dashStopsByOrder[pid].push(sr); }
          });
        }
      } catch(e) {
        console.warn('Dashboard ORDER_STOPS fetch:', e);
        if (typeof logError === 'function') logError(e, 'dashboard ORDER_STOPS fetch');
      }
    }

    // Lookup maps
    const truckMap = {}; trucks.forEach(t => { truckMap[t.id] = t.fields; });
    const driverMap = {}; drivers.forEach(d => { driverMap[d.id] = d.fields; });
    const clientMap = {}; clients.forEach(cl => { clientMap[cl.id] = cl.fields; });

    const now = new Date();
    const today = localToday();
    const tmrw = localTomorrow();
    const wn = currentWeekNumber();
    const weekStart = _getWeekStart(now);
    const weekEnd = new Date(weekStart.getTime() + 6 * 864e5);

    // ═══ CALCULATIONS ═══
    const unassignedExport = orders.filter(r => {
      const f = r.fields;
      return f['Direction'] === 'Export' && (!f['Truck'] || (Array.isArray(f['Truck']) && f['Truck'].length === 0));
    }).length;
    const unassignedImport = orders.filter(r => {
      const f = r.fields;
      return f['Direction'] === 'Import' && (!f['Truck'] || (Array.isArray(f['Truck']) && f['Truck'].length === 0));
    }).length;

    const activeTrucks = trucks.filter(t => t.fields['Active']).length;
    const trucksInUse = new Set();
    orders.filter(r => {
      const w = r.fields['Week Number'];
      return w == wn && r.fields['Truck'] && (Array.isArray(r.fields['Truck']) ? r.fields['Truck'].length > 0 : true);
    }).forEach(r => {
      const tid = getLinkId(r.fields['Truck']);
      if (tid) trucksInUse.add(tid);
    });
    const utilPct = activeTrucks ? Math.round(trucksInUse.size / activeTrucks * 100) : 0;

    // Dead KM
    const locs = getRefLocations();
    const locCoords = {};
    locs.forEach(l => {
      const lat = l.fields['Latitude'], lng = l.fields['Longitude'];
      if (lat && lng) locCoords[l.id] = { lat: +lat, lng: +lng };
    });
    function _dashHaversine(lat1,lon1,lat2,lon2) {
      const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
      const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
      return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    }
    const weekExports = orders.filter(r => Number(r.fields['Week Number'])===Number(wn) && r.fields['Direction']==='Export' && r.fields['Truck']);
    const weekImports = orders.filter(r => Number(r.fields['Week Number'])===Number(wn) && r.fields['Direction']==='Import' && r.fields['Truck']);
    const deadKmList = [];
    weekExports.forEach(exp => {
      const expTruck = getLinkId(exp.fields['Truck']);
      if (!expTruck) return;
      const matchedImp = weekImports.find(imp => getLinkId(imp.fields['Truck']) === expTruck);
      if (!matchedImp) return;
      let expLocId = null;
      const expUnloads = (_dashStopsByOrder[exp.id] || [])
        .filter(s => s.fields[F.STOP_TYPE] === 'Unloading')
        .sort((a,b) => (b.fields[F.STOP_NUMBER]||0) - (a.fields[F.STOP_NUMBER]||0));
      if (expUnloads.length) expLocId = (expUnloads[0].fields[F.STOP_LOCATION] || [])[0] || null;
      let impLocId = null;
      const impLoads = (_dashStopsByOrder[matchedImp.id] || [])
        .filter(s => s.fields[F.STOP_TYPE] === 'Loading')
        .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
      if (impLoads.length) impLocId = (impLoads[0].fields[F.STOP_LOCATION] || [])[0] || null;
      if (expLocId && impLocId && locCoords[expLocId] && locCoords[impLocId]) {
        const d = _dashHaversine(locCoords[expLocId].lat, locCoords[expLocId].lng, locCoords[impLocId].lat, locCoords[impLocId].lng);
        deadKmList.push(Math.round(d));
      }
    });
    const avgDeadKm = deadKmList.length ? Math.round(deadKmList.reduce((s,v)=>s+v,0)/deadKmList.length) : -1;
    const maxDeadKm = deadKmList.length ? Math.max(...deadKmList) : 0;

    // On-Time
    const deliveredWithPerf = orders.filter(r => r.fields['Delivery Performance']);
    const onTimeCount = deliveredWithPerf.filter(r => r.fields['Delivery Performance'] === 'On Time').length;
    const delayedCount = deliveredWithPerf.filter(r => r.fields['Delivery Performance'] === 'Delayed').length;
    const totalDelivered = onTimeCount + delayedCount;
    const onTimePct = totalDelivered ? Math.round(onTimeCount / totalDelivered * 100) : 0;

    // Departures / Deliveries
    const departures = [];
    const deliveries = [];
    orders.forEach(r => {
      const f = r.fields;
      const loadDt = toLocalDate(f['Loading DateTime']);
      const delDt = toLocalDate(f['Delivery DateTime']);
      const loadRaw = f['Loading DateTime'] || '';
      const delRaw = f['Delivery DateTime'] || '';
      const loadTime = loadRaw.includes('T') ? loadRaw.split('T')[1]?.substring(0,5) || '—' : '—';
      const delTime = delRaw.includes('T') ? delRaw.split('T')[1]?.substring(0,5) || '—' : '—';
      const clientId = getLinkId(f['Client']);
      const clientName = escapeHtml(clientId && clientMap[clientId] ? clientMap[clientId]['Company Name'] : (f['Client Name'] || f['Client Summary'] || '').split(',')[0].trim() || '—');
      const truckId = getLinkId(f['Truck']);
      const truckPlate = escapeHtml(truckId && truckMap[truckId] ? truckMap[truckId]['License Plate'] : '');
      const route = `${escapeHtml((f['Loading Summary'] || '').slice(0, 20))} → ${escapeHtml((f['Delivery Summary'] || '').slice(0, 20))}`;
      const pallets = f['Total Pallets'] || 0;
      const status = f['Status'] || 'Pending';

      if (loadDt === today || loadDt === tmrw) {
        departures.push({ day: loadDt === today ? 'Σήμερα' : 'Αύριο', client: clientName, route, pallets, time: loadTime || '—', truck: truckPlate, status, id: r.id });
      }
      if (delDt === today || delDt === tmrw) {
        deliveries.push({ day: delDt === today ? 'Σήμερα' : 'Αύριο', client: clientName, route, pallets, time: delTime || '—', truck: truckPlate, status, id: r.id });
      }
    });
    departures.sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
    deliveries.sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));

    // Fleet Usage
    const nextWn = wn + 1;
    const activeTruckList = trucks.filter(t => t.fields['Active']);
    function _calcUsageRate(weekNum) {
      const weekOrders = orders.filter(r => r.fields['Week Number'] == weekNum && r.fields['Truck'] && !r.fields['Is Partner Trip']);
      const truckDays = {};
      weekOrders.forEach(r => {
        const tid = getLinkId(r.fields['Truck']);
        if (!tid) return;
        if (!truckDays[tid]) truckDays[tid] = 0;
        const loadDate = toLocalDate(r.fields['Loading DateTime']);
        const delDate = toLocalDate(r.fields['Delivery DateTime']);
        if (!loadDate || !delDate) return;
        const diff = Math.round((new Date(delDate+'T12:00:00') - new Date(loadDate+'T12:00:00')) / 864e5);
        if (diff > 0) truckDays[tid] += diff;
      });
      const rates = [];
      activeTruckList.forEach(t => {
        const days = truckDays[t.id] || 0;
        // Usage rate formula: days × 4.5 × 4.5 (capped at 100%).
        // Reasoning: a truck is considered "fully utilized" at ~5 working days
        // per week. 5 × 4.5 × 4.5 = 101.25, capped to 100%. Each day contributes
        // ≈20.25 percentage points. Stays accurate for partial weeks (e.g. 3 days = 61%).
        const rate = Math.min(days * 4.5 * 4.5, 100);
        rates.push({ id: t.id, plate: t.fields['License Plate'] || '?', days, rate: Math.round(rate) });
      });
      return rates;
    }
    const currentRates = _calcUsageRate(wn);
    const nextRates = _calcUsageRate(nextWn);
    const avgCurrent = currentRates.length ? Math.round(currentRates.reduce((s, r) => s + r.rate, 0) / currentRates.length) : 0;
    const avgNext = nextRates.length ? Math.round(nextRates.reduce((s, r) => s + r.rate, 0) / nextRates.length) : 0;
    const idleTrucks = currentRates.filter(r => r.days === 0);
    const idlePlates = idleTrucks.map(r => r.plate).slice(0, 6);
    const topTrucks = currentRates.filter(r => r.days > 0).sort((a, b) => b.rate - a.rate);

    // ═══ HISTORICAL TRENDS (last 7 weeks for sparklines) ═══
    const trendWeeks = [];
    for (let i = 6; i >= 0; i--) {
      const w = wn - i;
      if (w < 1) continue;
      trendWeeks.push(w);
    }
    // Utilization trend per week
    const utilTrend = trendWeeks.map(w => {
      const wkOrders = orders.filter(r => r.fields['Week Number'] == w && r.fields['Truck']);
      const used = new Set();
      wkOrders.forEach(r => { const t = getLinkId(r.fields['Truck']); if (t) used.add(t); });
      return activeTrucks ? Math.round(used.size / activeTrucks * 100) : 0;
    });
    // Dead KM trend per week (using same haversine logic)
    const deadKmTrend = trendWeeks.map(w => {
      const wExp = orders.filter(r => r.fields['Week Number']==w && r.fields['Direction']==='Export' && r.fields['Truck']);
      const wImp = orders.filter(r => r.fields['Week Number']==w && r.fields['Direction']==='Import' && r.fields['Truck']);
      const list = [];
      wExp.forEach(exp => {
        const et = getLinkId(exp.fields['Truck']);
        if (!et) return;
        const mi = wImp.find(imp => getLinkId(imp.fields['Truck']) === et);
        if (!mi) return;
        const expUn = (_dashStopsByOrder[exp.id]||[]).filter(s => s.fields[F.STOP_TYPE]==='Unloading').sort((a,b)=>(b.fields[F.STOP_NUMBER]||0)-(a.fields[F.STOP_NUMBER]||0));
        const impLd = (_dashStopsByOrder[mi.id]||[]).filter(s => s.fields[F.STOP_TYPE]==='Loading').sort((a,b)=>(a.fields[F.STOP_NUMBER]||0)-(b.fields[F.STOP_NUMBER]||0));
        const el = expUn.length ? (expUn[0].fields[F.STOP_LOCATION]||[])[0] : null;
        const il = impLd.length ? (impLd[0].fields[F.STOP_LOCATION]||[])[0] : null;
        if (el && il && locCoords[el] && locCoords[il]) {
          list.push(_dashHaversine(locCoords[el].lat, locCoords[el].lng, locCoords[il].lat, locCoords[il].lng));
        }
      });
      return list.length ? Math.round(list.reduce((s,v)=>s+v,0)/list.length) : 0;
    });
    // On-time trend per week
    const onTimeTrend = trendWeeks.map(w => {
      const wkDel = orders.filter(r => r.fields['Week Number']==w && r.fields['Delivery Performance']);
      const onT = wkDel.filter(r => r.fields['Delivery Performance']==='On Time').length;
      return wkDel.length ? Math.round(onT / wkDel.length * 100) : 0;
    });
    // Unassigned trend — snapshot per week (approximation: count unassigned at end of each week)
    const unassignedExpTrend = trendWeeks.map(w => {
      return orders.filter(r => r.fields['Week Number']==w && r.fields['Direction']==='Export' && (!r.fields['Truck'] || (Array.isArray(r.fields['Truck']) && r.fields['Truck'].length===0))).length;
    });
    const unassignedImpTrend = trendWeeks.map(w => {
      return orders.filter(r => r.fields['Week Number']==w && r.fields['Direction']==='Import' && (!r.fields['Truck'] || (Array.isArray(r.fields['Truck']) && r.fields['Truck'].length===0))).length;
    });

    // WoW deltas (current vs previous week)
    function _deltaPct(curr, prev, lowerIsBetter) {
      if (prev === 0 || prev == null) return null;
      const diff = curr - prev;
      const pct = Math.round(diff / prev * 100);
      return { pct, raw: diff, lowerBetter: !!lowerIsBetter };
    }
    const prevWn = wn - 1;
    const utilPrev = utilTrend[utilTrend.length - 2] ?? 0;
    const deadKmPrev = deadKmTrend[deadKmTrend.length - 2] ?? 0;
    const onTimePrev = onTimeTrend[onTimeTrend.length - 2] ?? 0;
    const unExpPrev = unassignedExpTrend[unassignedExpTrend.length - 2] ?? 0;
    const unImpPrev = unassignedImpTrend[unassignedImpTrend.length - 2] ?? 0;
    const utilDelta = _deltaPct(utilPct, utilPrev);
    const deadKmDelta = avgDeadKm >= 0 ? _deltaPct(avgDeadKm, deadKmPrev, true) : null;
    const onTimeDelta = totalDelivered > 0 ? _deltaPct(onTimePct, onTimePrev) : null;
    const unExpDelta = _deltaPct(unassignedExport, unExpPrev, true);
    const unImpDelta = _deltaPct(unassignedImport, unImpPrev, true);

    // Aging
    const unassignedOrders = orders.filter(r => {
      const f = r.fields;
      return !f['Truck'] || (Array.isArray(f['Truck']) && f['Truck'].length === 0);
    }).filter(r => {
      const st = r.fields['Status'];
      return st && st !== 'Delivered' && st !== 'Invoiced' && st !== 'Cancelled';
    });
    const agingRows = unassignedOrders.map(r => {
      const f = r.fields;
      const clientId = getLinkId(f['Client']);
      const clientName = escapeHtml(clientId && clientMap[clientId] ? clientMap[clientId]['Company Name'] : (f['Client Name'] || f['Client Summary'] || '').split(',')[0].trim() || '—');
      const route = `${escapeHtml((f['Loading Summary'] || '').slice(0, 18))} → ${escapeHtml((f['Delivery Summary'] || '').slice(0, 18))}`;
      const delDate = (f['Delivery DateTime'] || '').substring(0, 10);
      const pallets = f['Total Pallets'] || 0;
      const created = r.createdTime || '';
      const hoursOld = created ? Math.round((Date.now() - new Date(created).getTime()) / 3600000) : 0;
      const dir = f['Direction'];
      const ref = f['Reference'] || '';
      const orderLabel = escapeHtml(ref ? `${dir === 'Export' ? 'EXP' : 'IMP'} ${ref}` : (f['Order Number'] || (dir === 'Export' ? 'EXP' : 'IMP')));
      return { id: r.id, orderNum: orderLabel, client: clientName, route, delDate, pallets, hoursOld, direction: dir };
    }).sort((a, b) => b.hoursOld - a.hoursOld).slice(0, 10);

    // High Risk (due in 48h, no truck)
    const in48h = toLocalDate(new Date(Date.now() + 48 * 3600000));
    const highRisk = unassignedOrders.filter(r => {
      const del = (r.fields['Delivery DateTime'] || '').substring(0, 10);
      return del && del <= in48h && del >= today;
    }).slice(0, 5);

    // Fleet Alerts
    const fleetAlerts = [];
    const alertThreshold = toLocalDate(new Date(Date.now() + 30 * 864e5));
    trucks.filter(t => t.fields['Active']).forEach(t => {
      const f = t.fields;
      const plate = escapeHtml(f['License Plate'] || '—');
      ['KTEO Expiry', 'KEK Expiry', 'Insurance Expiry'].forEach(field => {
        const dt = (f[field] || '').substring(0, 10);
        if (dt && dt <= alertThreshold) {
          const days = Math.ceil((new Date(dt) - now) / 864e5);
          const label = field.replace(' Expiry', '');
          fleetAlerts.push({ plate, label, dt, days, expired: days < 0 });
        }
      });
    });
    trailers.forEach(t => {
      const f = t.fields;
      const plate = escapeHtml(f['License Plate'] || '—');
      ['ATP Expiry', 'Insurance Expiry'].forEach(field => {
        const dt = (f[field] || '').substring(0, 10);
        if (dt && dt <= alertThreshold) {
          const days = Math.ceil((new Date(dt) - now) / 864e5);
          const label = field.replace(' Expiry', '');
          fleetAlerts.push({ plate, label, dt, days, expired: days < 0 });
        }
      });
    });
    fleetAlerts.sort((a, b) => a.days - b.days);

    // Compliance snapshot
    const complianceTrucks = trucks.filter(t => t.fields['Active']).slice(0, 8).map(t => {
      const f = t.fields;
      const plate = escapeHtml(f['License Plate'] || '—');
      const docs = {};
      ['KTEO Expiry', 'KEK Expiry', 'Insurance Expiry'].forEach(field => {
        const dt = (f[field] || '').substring(0, 10);
        const label = field === 'KTEO Expiry' ? 'KT' : field === 'KEK Expiry' ? 'KK' : 'INS';
        if (!dt) { docs[label] = 'none'; }
        else {
          const days = Math.ceil((new Date(dt) - now) / 864e5);
          docs[label] = days < 0 ? 'expired' : days < 30 ? 'warn' : 'ok';
        }
      });
      return { plate, docs };
    });

    // Weekly Score
    const assignmentRate = orders.length ? Math.round(orders.filter(r => r.fields['Truck'] && (Array.isArray(r.fields['Truck']) ? r.fields['Truck'].length > 0 : true) && r.fields['Week Number'] == wn).length / Math.max(orders.filter(r => r.fields['Week Number'] == wn).length, 1) * 100) : 0;
    const complianceOk = trucks.filter(t => {
      if (!t.fields['Active']) return false;
      const kteo = (t.fields['KTEO Expiry'] || '').substring(0, 10);
      const kek = (t.fields['KEK Expiry'] || '').substring(0, 10);
      const ins = (t.fields['Insurance Expiry'] || '').substring(0, 10);
      return (!kteo || kteo > today) && (!kek || kek > today) && (!ins || ins > today);
    }).length;
    const complianceRate = activeTrucks ? Math.round(complianceOk / activeTrucks * 100) : 100;
    const deadKmScore = avgDeadKm < 0 ? -1 : avgDeadKm <= 50 ? 100 : avgDeadKm <= 150 ? Math.round(100 - (avgDeadKm - 50)) : Math.max(0, Math.round(50 - (avgDeadKm - 150) * 0.33));
    const safeDeadKm = deadKmScore >= 0 ? deadKmScore : 100;
    const safeOnTime = totalDelivered > 0 ? onTimePct : -1;
    const weeklyScore = Math.round(assignmentRate * 0.30 + (safeOnTime >= 0 ? safeOnTime : 80) * 0.30 + complianceRate * 0.25 + safeDeadKm * 0.15);
    const scoreColor = weeklyScore > 85 ? '#10B981' : weeklyScore >= 70 ? '#F59E0B' : '#EF4444';

    // Alert banner
    const redAlerts = [];
    if (highRisk.length > 0) redAlerts.push(`${highRisk.length} παραγγελίες χωρίς φορτηγό — παράδοση σε 48ω`);
    const expiredDocs = fleetAlerts.filter(a => a.expired);
    if (expiredDocs.length > 0) redAlerts.push(`${expiredDocs.length} ληγμένα έγγραφα στόλου`);

    const greeting = now.getHours() < 12 ? 'Καλημέρα' : now.getHours() < 18 ? 'Καλό απόγευμα' : 'Καλό βράδυ';
    const dateStr = now.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' });

    // ═══ RENDER ═══
    c.innerHTML = `
      <div class="dash-wrap">
        <!-- Header -->
        <div class="dash-header">
          <div>
            <div class="dash-greeting">${greeting}, ${escapeHtml(user.name.split(' ')[0])}</div>
            <div class="dash-date">${dateStr} — Εβδομάδα ${wn}</div>
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-3)">
            ${typeof openCommandPalette === 'function' ? `<div class="dash-cmdk-hint" onclick="openCommandPalette()">${_i('command', 12)} <kbd>⌘K</kbd> Γρήγορες ενέργειες</div>` : ''}
            <div class="dash-live">
              <span class="dash-live-dot"></span>
              LIVE — ανανέωση κάθε 5'
            </div>
          </div>
        </div>

        <!-- Alert Banner -->
        ${redAlerts.length ? `<div class="dash-alert-banner">
          <div class="dash-alert-icon">${_i('alert_triangle', 16)}</div>
          <div class="dash-alert-text">${redAlerts.join(' · ')}</div>
        </div>` : ''}

        <!-- KPI Bar -->
        <div class="dash-kpi-bar">
          <div class="dash-kpi" onclick="window._dashNav={dir:'Export',trip:'unassigned'};navigate('orders_intl')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,#DC2626,transparent)"></div>
            <div class="dash-kpi-label">${_i('arrow_up_right', 11)} Export χωρίς Ανάθεση</div>
            <div class="dash-kpi-value dash-val-danger">${unassignedExport}${_dashDelta(unExpDelta)}</div>
            <div class="dash-kpi-bottom">
              <div class="dash-kpi-bottom-left"><div class="dash-kpi-sub">ανοιχτές εξαγωγές</div></div>
              ${_dashSpark(unassignedExpTrend, '#F87171')}
            </div>
          </div>
          <div class="dash-kpi" onclick="window._dashNav={dir:'Import',trip:'unassigned'};navigate('orders_intl')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,#D97706,transparent)"></div>
            <div class="dash-kpi-label">${_i('arrow_down_left', 11)} Import χωρίς Ανάθεση</div>
            <div class="dash-kpi-value dash-val-warning">${unassignedImport}${_dashDelta(unImpDelta)}</div>
            <div class="dash-kpi-bottom">
              <div class="dash-kpi-bottom-left"><div class="dash-kpi-sub">ανοιχτές εισαγωγές</div></div>
              ${_dashSpark(unassignedImpTrend, '#FBBF24')}
            </div>
          </div>
          <div class="dash-kpi" onclick="navigate('weekly_intl')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,#0284C7,transparent)"></div>
            <div class="dash-kpi-label">${_i('truck', 11)} Αξιοποίηση Στόλου</div>
            <div class="dash-kpi-value dash-val-accent">${utilPct}%${_dashDelta(utilDelta)}</div>
            <div class="dash-kpi-bottom">
              <div class="dash-kpi-bottom-left"><div class="dash-kpi-sub">${trucksInUse.size}/${activeTrucks} φορτηγά W${wn}</div></div>
              ${_dashSpark(utilTrend, '#38BDF8')}
            </div>
          </div>
          <div class="dash-kpi" onclick="navigate('weekly_intl')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,${avgDeadKm>=0 ? (avgDeadKm<=50?'#10B981':avgDeadKm<=150?'#D97706':'#DC2626') : '#475569'},transparent)"></div>
            <div class="dash-kpi-label">${_i('route', 11)} Dead Kilometers</div>
            <div class="dash-kpi-value ${avgDeadKm>=0 ? (avgDeadKm<=50?'dash-val-success':avgDeadKm<=150?'dash-val-warning':'dash-val-danger') : 'dash-val-muted'}">${avgDeadKm>=0 ? avgDeadKm+'km' : 'N/A'}${_dashDelta(deadKmDelta)}</div>
            <div class="dash-kpi-bottom">
              <div class="dash-kpi-bottom-left"><div class="dash-kpi-sub">${avgDeadKm>=0 ? `avg ${deadKmList.length} pairs · max ${maxDeadKm}km` : 'no matched pairs'}</div></div>
              ${_dashSpark(deadKmTrend, '#F59E0B')}
            </div>
          </div>
          <div class="dash-kpi" onclick="navigate('orders_intl')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,${totalDelivered > 0 ? '#10B981' : '#475569'},transparent)"></div>
            <div class="dash-kpi-label">${_i('check_circle', 11)} On-Time Παράδοση</div>
            <div class="dash-kpi-value ${totalDelivered > 0 ? 'dash-val-success' : 'dash-val-muted'}">${totalDelivered > 0 ? onTimePct + '%' : 'N/A'}${_dashDelta(onTimeDelta)}</div>
            <div class="dash-kpi-bottom">
              <div class="dash-kpi-bottom-left"><div class="dash-kpi-sub">${totalDelivered > 0 ? `${onTimeCount}/${totalDelivered} on time` : 'κανένα δεδομένο'}</div></div>
              ${_dashSpark(onTimeTrend, '#34D399')}
            </div>
          </div>
        </div>

        <!-- Main Grid -->
        <div class="dash-grid-main">
          <!-- Left Column -->
          <div class="dash-left">

            <!-- Today & Tomorrow Ops -->
            <div class="dash-ops-grid">
              <div class="dash-card">
                <div class="dash-card-header">
                  <div class="dash-card-title">${_i('arrow_up_right', 12)} ΑΝΑΧΩΡΗΣΕΙΣ</div>
                  <span class="dash-card-link" onclick="navigate('weekly_intl')">Εβδομαδιαίο ${_i('chevron_right', 12)}</span>
                </div>
                <div class="dash-card-body">
                  ${departures.length ? departures.slice(0, 6).map(d => _dashOpsRow(d, 'depart')).join('') : _dashEmpty('truck', 'Δεν υπάρχουν αναχωρήσεις σήμερα/αύριο')}
                  ${departures.length > 6 ? `<div style="text-align:center;padding:var(--space-2) 0 0"><span class="dash-card-link" onclick="navigate('weekly_intl')">Προβολή όλων (${departures.length}) ${_i('chevron_right', 12)}</span></div>` : ''}
                </div>
              </div>
              <div class="dash-card">
                <div class="dash-card-header">
                  <div class="dash-card-title">${_i('package', 12)} ΠΑΡΑΔΟΣΕΙΣ</div>
                  <span class="dash-card-link" onclick="navigate('orders_intl')">Orders ${_i('chevron_right', 12)}</span>
                </div>
                <div class="dash-card-body">
                  ${deliveries.length ? deliveries.slice(0, 6).map(d => _dashOpsRow(d, 'deliver')).join('') : _dashEmpty('package', 'Δεν υπάρχουν παραδόσεις σήμερα/αύριο')}
                  ${deliveries.length > 6 ? `<div style="text-align:center;padding:var(--space-2) 0 0"><span class="dash-card-link" onclick="navigate('orders_intl')">Προβολή όλων (${deliveries.length}) ${_i('chevron_right', 12)}</span></div>` : ''}
                </div>
              </div>
            </div>

            <!-- Fleet Usage Rate -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">${_i('activity', 12)} USAGE RATE ΣΤΟΛΟΥ</div>
                <span class="dash-card-meta">W${wn} avg ${avgCurrent}% · W${nextWn} avg ${avgNext}%</span>
              </div>
              <div class="dash-card-body">
                <div class="dash-util-row">
                  <div class="dash-util-label">W${wn}</div>
                  <div class="dash-util-bar">
                    <div class="dash-util-fill" style="width:${Math.min(avgCurrent,100)}%;background:linear-gradient(90deg,${avgCurrent>=80?'#059669,#34D399':avgCurrent>=50?'#0284C7,#38BDF8':'#DC2626,#F87171'})"></div>
                  </div>
                  <div class="dash-util-pct" style="color:${avgCurrent>=80?'#34D399':avgCurrent>=50?'#38BDF8':'#F87171'}">${avgCurrent}%</div>
                </div>
                <div class="dash-util-row">
                  <div class="dash-util-label">W${nextWn}</div>
                  <div class="dash-util-bar">
                    <div class="dash-util-fill" style="width:${Math.min(avgNext,100)}%;background:linear-gradient(90deg,${avgNext>=80?'#059669,#34D399':avgNext>=50?'#1E3A8A,#3B82F6':'#DC2626,#F87171'})"></div>
                  </div>
                  <div class="dash-util-pct" style="color:${avgNext>=80?'#34D399':avgNext>=50?'#3B82F6':'#F87171'}">${avgNext}%</div>
                </div>
                ${topTrucks.length ? `<div class="dash-util-divider">
                  <div class="dash-util-mini-label">W${wn} PER TRUCK</div>
                  ${topTrucks.slice(0, 6).map(t => `<div class="dash-util-mini-row">
                    <span class="dash-util-mini-plate">${t.plate}</span>
                    <div class="dash-util-mini-bar">
                      <div class="dash-util-mini-fill" style="width:${Math.min(t.rate,100)}%;background:${t.rate>=80?'#34D399':t.rate>=50?'#38BDF8':'#F87171'}"></div>
                    </div>
                    <span class="dash-util-mini-pct" style="color:${t.rate>=80?'#34D399':t.rate>=50?'#38BDF8':'#F87171'}">${t.rate}%</span>
                    <span class="dash-util-mini-days">${t.days}d</span>
                  </div>`).join('')}
                </div>` : ''}
                ${idleTrucks.length ? `<div class="dash-util-divider">
                  <div class="dash-util-mini-label" style="color:#F87171">${_i('pause_circle', 10)} ΑΔΡΑΝΗ W${wn}</div>
                  <div class="dash-idle-pills">${idlePlates.map(p =>
                    `<span class="dash-idle-pill">${p}</span>`
                  ).join('')}</div>
                </div>` : ''}
              </div>
            </div>

            <!-- Unassigned Orders Aging -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">${_i('clock', 12)} ΑΝΑΜΟΝΗ ΑΝΑΘΕΣΗΣ — AGING</div>
                <span class="dash-card-meta">${unassignedOrders.length} ανοιχτές</span>
              </div>
              <div class="dash-card-body flush">
                ${agingRows.length ? `<table class="dash-aging-table">
                  <thead><tr>
                    <th>Order</th>
                    <th>Πελάτης / Δρομολόγιο</th>
                    <th>Παράδοση</th>
                    <th style="text-align:center">PAL</th>
                    <th style="text-align:right">Aging</th>
                  </tr></thead>
                  <tbody>
                    ${agingRows.map(r => `<tr onclick="navigate('orders_intl')">
                      <td><span class="dash-aging-num">${r.orderNum}</span></td>
                      <td>
                        <div class="dash-aging-cell-primary">${r.client}</div>
                        <div class="dash-aging-cell-sub">${r.route}</div>
                      </td>
                      <td style="color:var(--dc-text-dim)">${r.delDate ? fmtDateDM(r.delDate) : '—'}</td>
                      <td style="text-align:center;font-weight:700;color:var(--dc-text-mid)">${r.pallets}</td>
                      <td style="text-align:right">${_dashAgingPill(r.hoursOld)}</td>
                    </tr>`).join('')}
                  </tbody>
                </table>` : `<div style="padding:var(--space-4)">${_dashEmpty('check', 'Δεν υπάρχουν ανοιχτές παραγγελίες')}</div>`}
              </div>
            </div>

          </div>

          <!-- Right Panel -->
          <div class="dash-right">

            <!-- HIGH RISK -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title is-danger">${_i('alert_triangle', 12)} ΥΨΗΛΟΣ ΚΙΝΔΥΝΟΣ</div>
                <span class="dash-card-link" onclick="window._dashNav={trip:'unassigned'};navigate('orders_intl')">Orders ${_i('chevron_right', 12)}</span>
              </div>
              <div class="dash-card-body">
                ${highRisk.length ? highRisk.map(r => {
                  const f = r.fields;
                  const del = (f['Delivery DateTime'] || '').substring(0, 10);
                  const route = `${escapeHtml((f['Loading Summary'] || '').slice(0, 15))} → ${escapeHtml((f['Delivery Summary'] || '').slice(0, 15))}`;
                  const hours = del ? Math.round((new Date(del) - now) / 3600000) : 0;
                  return `<div class="dash-risk-item" onclick="navigate('orders_intl')">
                    <div class="dash-risk-dot"></div>
                    <div class="dash-risk-text">${route}</div>
                    <div class="dash-risk-due">${hours}ω</div>
                  </div>`;
                }).join('') : _dashEmpty('check_circle', 'Κανένα κρίσιμο')}
              </div>
            </div>

            <!-- FLEET ALERTS -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">${_i('shield', 12)} ΕΙΔΟΠΟΙΗΣΕΙΣ ΣΤΟΛΟΥ</div>
                <span class="dash-card-link" onclick="navigate('expiry_alerts')">Expiry ${_i('chevron_right', 12)}</span>
              </div>
              <div class="dash-card-body">
                ${fleetAlerts.length ? fleetAlerts.slice(0, 6).map(a => `<div class="dash-fleet-row">
                  <div class="dash-fleet-plate">${a.plate}</div>
                  <div class="dash-fleet-doc">${a.label}</div>
                  <div class="dash-fleet-days ${a.expired ? 'expired' : a.days < 14 ? 'warn' : 'ok'}">${a.expired ? 'ΛΗΓΜΕΝΟ' : a.days + 'μ'}</div>
                </div>`).join('') : _dashEmpty('shield', 'Χωρίς ειδοποιήσεις')}
              </div>
            </div>

            <!-- COMPLIANCE -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">${_i('file_check', 12)} COMPLIANCE</div>
              </div>
              <div class="dash-card-body" style="padding:var(--space-2) var(--space-4)">
                ${complianceTrucks.map(t => `<div class="dash-comp-row">
                  <div class="dash-comp-plate">${t.plate}</div>
                  <div class="dash-comp-blocks">
                    ${Object.entries(t.docs).map(([label, status]) =>
                      `<span class="dash-comp-block ${status}">${label}</span>`
                    ).join('')}
                  </div>
                </div>`).join('')}
              </div>
            </div>

            <!-- WEEKLY SCORE -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">${_i('award', 12)} ΕΒΔΟΜΑΔΙΑΙΟ SCORE</div>
                <span class="dash-card-meta">W${wn}</span>
              </div>
              <div class="dash-card-body dash-score-wrap">
                <div class="dash-score-ring" style="--score-color:${scoreColor};--score-deg:${Math.round(weeklyScore * 3.6)}deg">
                  <div class="dash-score-num" style="color:${scoreColor}">${weeklyScore}</div>
                </div>
                <div class="dash-score-label">συνολική απόδοση</div>
                ${_dashScoreBar('Ανάθεση', assignmentRate, '#38BDF8')}
                ${_dashScoreBar('On-Time', totalDelivered > 0 ? onTimePct : 0, '#34D399')}
                ${_dashScoreBar('Compliance', complianceRate, '#3B82F6')}
                ${_dashScoreBar('Dead KM', deadKmScore >= 0 ? deadKmScore : 100, '#F59E0B')}
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    // Auto-refresh (smart — only if still on dashboard)
    if (_dashRefreshTimer) clearInterval(_dashRefreshTimer);
    _dashRefreshTimer = setInterval(() => {
      if (typeof currentPage !== 'undefined' && currentPage === 'dashboard') {
        renderDashboard();
      } else {
        clearInterval(_dashRefreshTimer);
        _dashRefreshTimer = null;
      }
    }, 5 * 60 * 1000);

  } catch (e) {
    console.error('Dashboard error:', e);
    c.innerHTML = showError(e.message);
  }
}

// ── Helpers ───────────────────────────────────────────────

function _dashOpsRow(d, type) {
  const dotColor =
    d.status === 'Delivered' ? 'var(--dc-ok)' :
    d.status === 'In Transit' ? '#3B82F6' :
    d.status === 'Assigned' ? 'var(--dc-accent)' :
    '#F59E0B';
  const dayCls = d.day === 'Σήμερα' ? 'today' : 'tmrw';
  return `<div class="dash-ops-row" onclick="navigate('orders_intl')">
    <div class="dash-status-dot" style="background:${dotColor}"></div>
    <span class="dash-day-tag ${dayCls}">${d.day}</span>
    <div class="dash-ops-info">
      <div class="dash-ops-client">${d.client}</div>
      <div class="dash-ops-route">${d.route}</div>
    </div>
    <div class="dash-ops-meta">
      <div class="dash-ops-pal">${d.pallets}p</div>
      <div class="dash-ops-time">${d.time}</div>
      ${d.truck ? `<div class="dash-ops-truck">${d.truck}</div>` : ''}
    </div>
  </div>`;
}

function _dashAgingPill(hours) {
  let cls, text;
  if (hours > 48)      { cls = 'red';   text = Math.round(hours / 24) + 'μ'; }
  else if (hours > 24) { cls = 'amber'; text = Math.round(hours / 24) + 'μ'; }
  else                 { cls = 'green'; text = hours + 'ω'; }
  return `<span class="dash-aging-pill ${cls}">${text}</span>`;
}

function _dashScoreBar(label, val, color) {
  return `<div class="dash-score-bar">
    <div class="dash-score-bar-label">${label}</div>
    <div class="dash-score-bar-track"><div class="dash-score-bar-fill" style="width:${val}%;background:${color}"></div></div>
    <div class="dash-score-bar-val">${val}%</div>
  </div>`;
}

function _dashEmpty(iconName, text) {
  return `<div class="dash-empty">${_i(iconName, 28)}<div>${text}</div></div>`;
}

// ── Sparkline (inline SVG polyline) ─────────────────────
function _dashSpark(values, color) {
  if (!values || values.length < 2) return '';
  const w = 54, h = 20, pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  // Last point dot
  const lastX = pad + (values.length - 1) * step;
  const lastY = pad + (h - pad * 2) * (1 - (values[values.length - 1] - min) / range);
  // Area fill (gradient below line)
  const areaPoints = `${pad},${h-pad} ${points} ${lastX.toFixed(1)},${h-pad}`;
  const gradId = 'sg' + Math.random().toString(36).slice(2,8);
  return `<svg class="dash-spark" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${areaPoints}" fill="url(#${gradId})"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="1.6" fill="${color}"/>
  </svg>`;
}

// ── WoW Delta pill ──────────────────────────────────────
function _dashDelta(d) {
  if (!d || d.pct === null || isNaN(d.pct)) return '';
  const abs = Math.abs(d.pct);
  if (abs === 0) {
    return `<span class="dash-delta flat">${_i('minus', 10)}0%</span>`;
  }
  const isUp = d.pct > 0;
  // Class logic: is this change GOOD or BAD?
  // lowerBetter: up = bad (red), down = good (green)
  // !lowerBetter: up = good (green), down = bad (red)
  let cls;
  if (d.lowerBetter) cls = isUp ? 'up-bad' : 'down';
  else              cls = isUp ? 'up'     : 'down-bad';
  const iconName = isUp ? 'trending_up' : 'trending_down';
  return `<span class="dash-delta ${cls}">${_i(iconName, 10)}${isUp ? '+' : ''}${d.pct}%</span>`;
}

function _getWeekStart(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(dt.setDate(diff));
}

// ── Skeleton ──────────────────────────────────────────────
function _dashSkeleton() {
  return `<div class="dash-wrap" style="padding:0;max-width:1600px">
    <style>
      @keyframes dash-sk { 0%,100% { opacity: 0.4; } 50% { opacity: 0.7; } }
      .dash-sk-block { background: #0F1C2F; border: 1px solid rgba(255,255,255,0.06); border-radius: var(--radius-md); animation: dash-sk 1.4s ease-in-out infinite; }
    </style>
    <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-5)">
      <div>
        <div class="dash-sk-block" style="width:240px;height:28px;margin-bottom:var(--space-1);border-radius:var(--radius-sm)"></div>
        <div class="dash-sk-block" style="width:180px;height:14px;border-radius:var(--radius-sm)"></div>
      </div>
      <div class="dash-sk-block" style="width:140px;height:20px;border-radius:var(--radius-sm);align-self:flex-end"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:var(--space-3);margin-bottom:var(--space-5)">
      ${[1,2,3,4,5].map(() => '<div class="dash-sk-block" style="height:92px"></div>').join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 320px;gap:var(--space-4)">
      <div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
          <div class="dash-sk-block" style="height:240px"></div>
          <div class="dash-sk-block" style="height:240px"></div>
        </div>
        <div class="dash-sk-block" style="height:130px"></div>
        <div class="dash-sk-block" style="height:220px"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-3)">
        <div class="dash-sk-block" style="height:150px"></div>
        <div class="dash-sk-block" style="height:140px"></div>
        <div class="dash-sk-block" style="height:130px"></div>
        <div class="dash-sk-block" style="height:200px"></div>
      </div>
    </div>
  </div>`;
}

window.renderDashboard = renderDashboard;
})();
