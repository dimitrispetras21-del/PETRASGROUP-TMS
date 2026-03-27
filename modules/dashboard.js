// ═══════════════════════════════════════════════
// MODULE — OPERATIONS DASHBOARD (Complete Rewrite)
// Bloomberg-meets-SaaS command center
// ═══════════════════════════════════════════════

let _dashRefreshTimer = null;

async function renderDashboard() {
  const c = document.getElementById('content');
  c.innerHTML = _dashSkeleton();

  try {
    // Load all data in parallel
    const [orders, natLoads, trucks, trailers, drivers, clients] = await Promise.all([
      atGet(TABLES.ORDERS),
      atGet(TABLES.NAT_LOADS),
      atGetAll(TABLES.TRUCKS, { fields: ['License Plate','Active','KTEO Expiry','KEK Expiry','Insurance Expiry'] }, true),
      atGetAll(TABLES.TRAILERS, { fields: ['Plate','ATP Expiry','Insurance Expiry'] }, true),
      atGetAll(TABLES.DRIVERS, { fields: ['Full Name'] }, true),
      atGetAll(TABLES.CLIENTS, { fields: ['Company Name'] }, true),
    ]);

    // Build lookup maps
    const truckMap = {};
    trucks.forEach(t => { truckMap[t.id] = t.fields; });
    const driverMap = {};
    drivers.forEach(d => { driverMap[d.id] = d.fields; });
    const clientMap = {};
    clients.forEach(cl => { clientMap[cl.id] = cl.fields; });

    // Time references
    const now = new Date();
    const today = localToday();
    const tmrw = localTomorrow();
    const wn = currentWeekNumber();
    const weekStart = _getWeekStart(now);
    const weekEnd = new Date(weekStart.getTime() + 6 * 864e5);

    // ═══ CALCULATIONS ═══

    // KPI 1 & 2: Unassigned Export/Import
    const unassignedExport = orders.filter(r => {
      const f = r.fields;
      return f['Direction'] === 'Export' && (!f['Truck'] || (Array.isArray(f['Truck']) && f['Truck'].length === 0));
    }).length;
    const unassignedImport = orders.filter(r => {
      const f = r.fields;
      return f['Direction'] === 'Import' && (!f['Truck'] || (Array.isArray(f['Truck']) && f['Truck'].length === 0));
    }).length;

    // KPI 3: Truck Utilization
    const activeTrucks = trucks.filter(t => t.fields['Active']).length;
    const trucksInUse = new Set();
    orders.filter(r => {
      const w = r.fields[' Week Number'];
      return w == wn && r.fields['Truck'] && (Array.isArray(r.fields['Truck']) ? r.fields['Truck'].length > 0 : true);
    }).forEach(r => {
      const tid = getLinkId(r.fields['Truck']);
      if (tid) trucksInUse.add(tid);
    });
    const utilPct = activeTrucks ? Math.round(trucksInUse.size / activeTrucks * 100) : 0;

    // KPI 4: Dead KM — avg distance between Export Delivery and matched Import Loading
    // Load locations for coordinate lookup
    const locs = await atGetAll(TABLES.LOCATIONS, { fields: ['Name','Latitude','Longitude'] }, true);
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

    // Find matched export-import pairs this week
    const weekExports = orders.filter(r => r.fields[' Week Number']==wn && r.fields['Direction']==='Export' && r.fields['Truck']);
    const weekImports = orders.filter(r => r.fields[' Week Number']==wn && r.fields['Direction']==='Import' && r.fields['Truck']);
    const deadKmList = [];
    weekExports.forEach(exp => {
      const expTruck = getLinkId(exp.fields['Truck']);
      if (!expTruck) return;
      const matchedImp = weekImports.find(imp => getLinkId(imp.fields['Truck']) === expTruck);
      if (!matchedImp) return;
      // Export last unloading location
      let expLocId = null;
      for (let i=10; i>=1; i--) {
        const ul = exp.fields[`Unloading Location ${i}`];
        if (ul) { expLocId = Array.isArray(ul) ? ul[0] : ul; break; }
      }
      // Import first loading location
      let impLocId = null;
      for (let i=1; i<=10; i++) {
        const ll = matchedImp.fields[`Loading Location ${i}`];
        if (ll) { impLocId = Array.isArray(ll) ? ll[0] : ll; break; }
      }
      if (expLocId && impLocId && locCoords[expLocId] && locCoords[impLocId]) {
        const d = _dashHaversine(locCoords[expLocId].lat, locCoords[expLocId].lng, locCoords[impLocId].lat, locCoords[impLocId].lng);
        deadKmList.push(Math.round(d));
      }
    });
    const avgDeadKm = deadKmList.length ? Math.round(deadKmList.reduce((s,v)=>s+v,0)/deadKmList.length) : -1;
    const maxDeadKm = deadKmList.length ? Math.max(...deadKmList) : 0;

    // KPI 5: On-Time Delivery
    const deliveredWithPerf = orders.filter(r => r.fields['Delivery Performance']);
    const onTimeCount = deliveredWithPerf.filter(r => r.fields['Delivery Performance'] === 'On Time').length;
    const delayedCount = deliveredWithPerf.filter(r => r.fields['Delivery Performance'] === 'Delayed').length;
    const totalDelivered = onTimeCount + delayedCount;
    const onTimePct = totalDelivered ? Math.round(onTimeCount / totalDelivered * 100) : 0;

    // Section 2: Departures & Deliveries (today + tomorrow)
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
      const clientName = clientId && clientMap[clientId] ? clientMap[clientId]['Company Name'] : (f['Client Name'] || f['Client Summary'] || '').split(',')[0].trim() || '—';
      const truckId = getLinkId(f['Truck']);
      const truckPlate = truckId && truckMap[truckId] ? truckMap[truckId]['License Plate'] : '';
      const route = `${(f['Loading Summary'] || '').slice(0, 20)} → ${(f['Delivery Summary'] || '').slice(0, 20)}`;
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

    // Section 3: Fleet Usage Rate — working days per week
    // Formula: usage = min(working_days * 4.5 * 4.5%, 100%)
    // A truck "works" on days between Loading→Delivery of any assigned order
    const nextWn = wn + 1;
    const activeTruckList = trucks.filter(t => t.fields['Active']);

    // Calculate working days per truck for current week
    function _calcUsageRate(weekNum) {
      const weekOrders = orders.filter(r => r.fields[' Week Number'] == weekNum && r.fields['Truck'] && !r.fields['Is Partner Trip']);
      const truckDays = {}; // truckId → Set of YYYY-MM-DD days active

      weekOrders.forEach(r => {
        const tid = getLinkId(r.fields['Truck']);
        if (!tid) return;
        if (!truckDays[tid]) truckDays[tid] = 0;
        const loadDate = toLocalDate(r.fields['Loading DateTime']);
        const delDate = toLocalDate(r.fields['Delivery DateTime']);
        if (!loadDate || !delDate) return;
        // Working days = difference in days (Mon morning → Wed morning = 2 days)
        const diff = Math.round((new Date(delDate+'T12:00:00') - new Date(loadDate+'T12:00:00')) / 864e5);
        if (diff > 0) truckDays[tid] += diff;
      });

      // Per-truck usage rates
      const rates = [];
      activeTruckList.forEach(t => {
        const days = truckDays[t.id] || 0;
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

    // Section 4: Unassigned Orders Aging
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
      const clientName = clientId && clientMap[clientId] ? clientMap[clientId]['Company Name'] : (f['Client Name'] || f['Client Summary'] || '').split(',')[0].trim() || '—';
      const route = `${(f['Loading Summary'] || '').slice(0, 18)} → ${(f['Delivery Summary'] || '').slice(0, 18)}`;
      const delDate = (f['Delivery DateTime'] || '').substring(0, 10);
      const pallets = f['Total Pallets'] || 0;
      const created = f['Created'] || f['Date Created'] || '';
      const hoursOld = created ? Math.round((Date.now() - new Date(created).getTime()) / 3600000) : 0;
      const dir = f['Direction'];
      const ref = f['Reference'] || '';
      const orderLabel = ref ? `${dir === 'Export' ? 'EXP' : 'IMP'} ${ref}` : (f['Order Number'] || (dir === 'Export' ? 'EXP' : 'IMP'));
      return { id: r.id, orderNum: orderLabel, client: clientName, route, delDate, pallets, hoursOld, direction: dir };
    }).sort((a, b) => b.hoursOld - a.hoursOld).slice(0, 10);

    // Section 5a: High Risk — orders due in 48h with no truck
    const in48h = toLocalDate(new Date(Date.now() + 48 * 3600000));
    const highRisk = unassignedOrders.filter(r => {
      const del = (r.fields['Delivery DateTime'] || '').substring(0, 10);
      return del && del <= in48h && del >= today;
    }).slice(0, 5);

    // Section 5b: Fleet Alerts — expiring docs
    const fleetAlerts = [];
    const alertThreshold = toLocalDate(new Date(Date.now() + 30 * 864e5));
    trucks.filter(t => t.fields['Active']).forEach(t => {
      const f = t.fields;
      const plate = f['License Plate'] || '—';
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
      const plate = f['Plate'] || '—';
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

    // Section 5c: Compliance Snapshot — top trucks with expiry blocks
    const complianceTrucks = trucks.filter(t => t.fields['Active']).slice(0, 8).map(t => {
      const f = t.fields;
      const plate = f['License Plate'] || '—';
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

    // Section 5d: Weekly Score
    const assignmentRate = orders.length ? Math.round(orders.filter(r => r.fields['Truck'] && (Array.isArray(r.fields['Truck']) ? r.fields['Truck'].length > 0 : true) && r.fields[' Week Number'] == wn).length / Math.max(orders.filter(r => r.fields[' Week Number'] == wn).length, 1) * 100) : 0;
    const complianceOk = trucks.filter(t => {
      if (!t.fields['Active']) return false;
      const kteo = (t.fields['KTEO Expiry'] || '').substring(0, 10);
      const kek = (t.fields['KEK Expiry'] || '').substring(0, 10);
      const ins = (t.fields['Insurance Expiry'] || '').substring(0, 10);
      return (!kteo || kteo > today) && (!kek || kek > today) && (!ins || ins > today);
    }).length;
    const complianceRate = activeTrucks ? Math.round(complianceOk / activeTrucks * 100) : 100;
    // emptyLegScore removed — replaced by deadKmScore above
    // Dead KM score: <50km = 100%, 50-150km = linear 100→50%, >150km = linear 50→0%
    const deadKmScore = avgDeadKm < 0 ? -1 : avgDeadKm <= 50 ? 100 : avgDeadKm <= 150 ? Math.round(100 - (avgDeadKm - 50)) : Math.max(0, Math.round(50 - (avgDeadKm - 150) * 0.33));
    const safeDeadKm = deadKmScore >= 0 ? deadKmScore : 100;
    const safeOnTime = totalDelivered > 0 ? onTimePct : -1; // -1 = no data
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
      <style>
        /* ── Dark theme scoped to dashboard ── */
        .dash-wrap {
          --d-bg: transparent;
          --d-card: #0B1929;
          --d-card-hover: #0F2035;
          --d-border: rgba(0,0,0,0.08);
          --d-border-mid: rgba(0,0,0,0.12);
          --d-text: #E2E8F0;
          --d-text-mid: #94A3B8;
          --d-text-dim: #64748B;
          --d-accent: #38BDF8;
          --d-accent-hover: #7DD3FC;
          --d-success: #10B981;
          --d-danger: #EF4444;
          --d-warning: #F59E0B;
          padding: 0; max-width: 1600px;
        }

        .dash-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; padding: 0 2px; }
        .dash-greeting { font-family: 'Syne', sans-serif; font-size: 22px; font-weight: 700; color: #0F172A; letter-spacing: -0.3px; }
        .dash-date { font-size: 12px; color: #64748B; margin-top: 2px; font-weight: 400; }
        .dash-live { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #64748B; letter-spacing: 0.5px; text-transform: uppercase; }
        .dash-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--d-success); animation: dash-pulse 2s infinite; }
        @keyframes dash-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

        /* Alert Banner */
        .dash-alert-banner { background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15); border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
        .dash-alert-icon { width: 28px; height: 28px; border-radius: 50%; background: rgba(239,68,68,0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .dash-alert-text { font-size: 12px; color: #DC2626; font-weight: 500; }

        /* KPI Bar */
        .dash-kpi-bar { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
        .dash-kpi { background: var(--d-card); border: 1px solid var(--d-border); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: all 0.15s ease; position: relative; overflow: hidden; }
        .dash-kpi:hover { border-color: var(--d-border-mid); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
        .dash-kpi-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--d-text-dim); margin-bottom: 6px; }
        .dash-kpi-value { font-family: 'DM Sans', monospace; font-size: 26px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
        .dash-kpi-sub { font-size: 10px; color: var(--d-text-dim); }
        .dash-kpi-glow { position: absolute; top: 0; left: 0; right: 0; height: 2px; opacity: 0.6; }

        /* Section Grid */
        .dash-grid-main { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
        .dash-left { display: flex; flex-direction: column; gap: 16px; }
        .dash-right { display: flex; flex-direction: column; gap: 12px; }

        /* Cards */
        .dash-card { background: var(--d-card); border: 1px solid var(--d-border); border-radius: 8px; overflow: hidden; }
        .dash-card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--d-border); }
        .dash-card-title { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: var(--d-text-mid); }
        .dash-card-link { font-size: 10px; color: var(--d-accent); cursor: pointer; text-decoration: none; font-weight: 500; }
        .dash-card-link:hover { color: var(--d-accent-hover); }
        .dash-card-body { padding: 12px 16px; }

        /* Two Column Ops */
        .dash-ops-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        /* Ops rows */
        .dash-ops-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--d-border); cursor: pointer; transition: background 0.1s; }
        .dash-ops-row:last-child { border-bottom: none; }
        .dash-ops-row:hover { background: var(--d-card-hover); }
        .dash-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .dash-ops-info { flex: 1; min-width: 0; }
        .dash-ops-client { font-size: 12px; font-weight: 600; color: var(--d-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dash-ops-route { font-size: 10px; color: var(--d-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dash-ops-meta { text-align: right; flex-shrink: 0; }
        .dash-ops-pal { font-size: 11px; font-weight: 700; color: var(--d-text-mid); }
        .dash-ops-time { font-size: 9px; color: var(--d-text-dim); }
        .dash-ops-truck { font-size: 9px; color: var(--d-accent); font-weight: 500; }
        .dash-day-tag { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 4px; }

        /* Fleet Utilization Bars */
        .dash-util-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
        .dash-util-label { font-size: 11px; color: var(--d-text-mid); width: 60px; font-weight: 500; }
        .dash-util-bar { flex: 1; height: 20px; background: rgba(255,255,255,0.04); border-radius: 6px; overflow: hidden; position: relative; }
        .dash-util-fill { height: 100%; border-radius: 6px; transition: width 0.5s ease; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; }
        .dash-util-pct { font-size: 10px; font-weight: 700; color: var(--d-text); min-width: 30px; text-align: right; }

        /* Aging Table */
        .dash-aging-table { width: 100%; border-collapse: collapse; }
        .dash-aging-table th { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--d-text-dim); padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--d-border-mid); }
        .dash-aging-table td { font-size: 11px; color: var(--d-text); padding: 7px 8px; border-bottom: 1px solid var(--d-border); }
        .dash-aging-table tr { cursor: pointer; transition: background 0.1s; }
        .dash-aging-table tbody tr:hover { background: var(--d-card-hover); }
        .dash-aging-pill { font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }

        /* Right panel items */
        .dash-risk-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--d-border); }
        .dash-risk-item:last-child { border-bottom: none; }
        .dash-risk-icon { width: 6px; height: 6px; border-radius: 50%; background: var(--d-danger); flex-shrink: 0; }
        .dash-risk-text { font-size: 11px; color: var(--d-text); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dash-risk-due { font-size: 9px; color: var(--d-danger); font-weight: 600; flex-shrink: 0; }

        .dash-fleet-alert-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--d-border); font-size: 11px; }
        .dash-fleet-alert-row:last-child { border-bottom: none; }
        .dash-fleet-plate { color: var(--d-text); font-weight: 600; width: 70px; }
        .dash-fleet-doc { color: var(--d-text-mid); flex: 1; }
        .dash-fleet-days { font-weight: 700; font-size: 10px; }

        /* Compliance blocks */
        .dash-comp-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
        .dash-comp-plate { font-size: 10px; color: var(--d-text); font-weight: 600; width: 70px; }
        .dash-comp-blocks { display: flex; gap: 3px; }
        .dash-comp-block { font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.3px; }

        /* Weekly Score */
        .dash-score-ring { width: 80px; height: 80px; margin: 0 auto 8px; position: relative; }
        .dash-score-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-size: 24px; font-weight: 800; }
        .dash-score-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
        .dash-score-bar-label { font-size: 9px; color: var(--d-text-dim); width: 70px; }
        .dash-score-bar-track { flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
        .dash-score-bar-fill { height: 100%; border-radius: 2px; }
        .dash-score-bar-val { font-size: 9px; color: var(--d-text-mid); width: 28px; text-align: right; }

        /* Empty state */
        .dash-empty { text-align: center; padding: 20px; color: var(--d-text-dim); font-size: 11px; }

        @media (max-width: 1200px) {
          .dash-kpi-bar { grid-template-columns: repeat(3, 1fr); }
          .dash-grid-main { grid-template-columns: 1fr; }
          .dash-ops-grid { grid-template-columns: 1fr; }
        }
      </style>

      <div class="dash-wrap">
        <!-- Header -->
        <div class="dash-header">
          <div>
            <div class="dash-greeting">${greeting}, ${user.name.split(' ')[0]}</div>
            <div class="dash-date">${dateStr} — Εβδομάδα ${wn}</div>
          </div>
          <div class="dash-live">
            <span class="dash-live-dot"></span>
            LIVE — ανανέωση κάθε 5 λεπτά
          </div>
        </div>

        <!-- Alert Banner -->
        ${redAlerts.length ? `<div class="dash-alert-banner">
          <div class="dash-alert-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="dash-alert-text">${redAlerts.join(' — ')}</div>
        </div>` : ''}

        <!-- KPI Bar -->
        <div class="dash-kpi-bar">
          <div class="dash-kpi" onclick="navigate('orders_intl')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,#EF4444,transparent)"></div>
            <div class="dash-kpi-label">Χωρίς Ανάθεση (Export)</div>
            <div class="dash-kpi-value" style="color:var(--danger)">${unassignedExport}</div>
            <div class="dash-kpi-sub">ανοιχτές εξαγωγές</div>
          </div>
          <div class="dash-kpi" onclick="navigate('orders_intl')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,#F59E0B,transparent)"></div>
            <div class="dash-kpi-label">Χωρίς Ανάθεση (Import)</div>
            <div class="dash-kpi-value" style="color:var(--warning)">${unassignedImport}</div>
            <div class="dash-kpi-sub">ανοιχτές εισαγωγές</div>
          </div>
          <div class="dash-kpi" onclick="navigate('weekly_intl')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,#0284C7,transparent)"></div>
            <div class="dash-kpi-label">Αξιοποίηση Στόλου</div>
            <div class="dash-kpi-value" style="color:var(--accent)">${utilPct}%</div>
            <div class="dash-kpi-sub">${trucksInUse.size}/${activeTrucks} φορτηγά W${wn}</div>
          </div>
          <div class="dash-kpi" onclick="navigate('weekly_intl')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,${avgDeadKm>=0 ? (avgDeadKm<=50?'#10B981':avgDeadKm<=150?'#F59E0B':'#EF4444') : '#475569'},transparent)"></div>
            <div class="dash-kpi-label">Dead Kilometers</div>
            <div class="dash-kpi-value" style="color:${avgDeadKm>=0 ? (avgDeadKm<=50?'var(--success)':avgDeadKm<=150?'var(--warning)':'var(--danger)') : '#475569'}">${avgDeadKm>=0 ? avgDeadKm+'km' : 'N/A'}</div>
            <div class="dash-kpi-sub">${avgDeadKm>=0 ? `avg ${deadKmList.length} pairs W${wn} (max ${maxDeadKm}km)` : 'δεν υπάρχουν matched pairs'}</div>
          </div>
          <div class="dash-kpi" onclick="navigate('orders_intl')">
            <div class="dash-kpi-glow" style="background:linear-gradient(90deg,${totalDelivered > 0 ? '#10B981' : '#475569'},transparent)"></div>
            <div class="dash-kpi-label">On-Time Παράδοση</div>
            <div class="dash-kpi-value" style="color:${totalDelivered > 0 ? 'var(--success)' : '#475569'}">${totalDelivered > 0 ? onTimePct + '%' : 'N/A'}</div>
            <div class="dash-kpi-sub">${totalDelivered > 0 ? `${onTimeCount}/${totalDelivered} on time` : 'δεν υπάρχουν δεδομένα παράδοσης'}</div>
          </div>
        </div>

        <!-- Main Grid -->
        <div class="dash-grid-main">
          <!-- Left Column -->
          <div class="dash-left">

            <!-- Today & Tomorrow Ops -->
            <div class="dash-ops-grid">
              <!-- Departures -->
              <div class="dash-card">
                <div class="dash-card-header">
                  <div class="dash-card-title">ΑΝΑΧΩΡΗΣΕΙΣ</div>
                  <span class="dash-card-link" onclick="navigate('weekly_intl')">&#8594; Εβδομαδιαίο</span>
                </div>
                <div class="dash-card-body">
                  ${departures.length ? departures.slice(0, 6).map(d => _dashOpsRow(d, 'depart')).join('') : '<div class="dash-empty">Δεν υπάρχουν αναχωρήσεις σήμερα/αύριο</div>'}
                  ${departures.length > 6 ? `<div style="text-align:center;padding:6px"><span class="dash-card-link" onclick="navigate('weekly_intl')">Προβολή όλων (${departures.length}) &#8594;</span></div>` : ''}
                </div>
              </div>

              <!-- Deliveries -->
              <div class="dash-card">
                <div class="dash-card-header">
                  <div class="dash-card-title">ΠΑΡΑΔΟΣΕΙΣ</div>
                  <span class="dash-card-link" onclick="navigate('orders_intl')">&#8594; Παραγγελίες</span>
                </div>
                <div class="dash-card-body">
                  ${deliveries.length ? deliveries.slice(0, 6).map(d => _dashOpsRow(d, 'deliver')).join('') : '<div class="dash-empty">Δεν υπάρχουν παραδόσεις σήμερα/αύριο</div>'}
                  ${deliveries.length > 6 ? `<div style="text-align:center;padding:6px"><span class="dash-card-link" onclick="navigate('orders_intl')">Προβολή όλων (${deliveries.length}) &#8594;</span></div>` : ''}
                </div>
              </div>
            </div>

            <!-- Fleet Usage Rate -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">USAGE RATE ΣΤΟΛΟΥ</div>
                <span style="font-size:10px;color:#64748B">W${wn} avg ${avgCurrent}% · W${nextWn} avg ${avgNext}%</span>
              </div>
              <div class="dash-card-body">
                <div class="dash-util-row">
                  <div class="dash-util-label">W${wn}</div>
                  <div class="dash-util-bar">
                    <div class="dash-util-fill" style="width:${Math.min(avgCurrent,100)}%;background:linear-gradient(90deg,${avgCurrent>=80?'#059669,#34D399':avgCurrent>=50?'#0284C7,#38BDF8':'#DC2626,#F87171'})"></div>
                  </div>
                  <div class="dash-util-pct" style="color:${avgCurrent>=80?'#10B981':avgCurrent>=50?'#38BDF8':'#EF4444'}">${avgCurrent}%</div>
                </div>
                <div class="dash-util-row">
                  <div class="dash-util-label">W${nextWn}</div>
                  <div class="dash-util-bar">
                    <div class="dash-util-fill" style="width:${Math.min(avgNext,100)}%;background:linear-gradient(90deg,${avgNext>=80?'#059669,#34D399':avgNext>=50?'#7C3AED,#A78BFA':'#DC2626,#F87171'})"></div>
                  </div>
                  <div class="dash-util-pct" style="color:${avgNext>=80?'#10B981':avgNext>=50?'#A78BFA':'#EF4444'}">${avgNext}%</div>
                </div>
                ${topTrucks.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--d-border)">
                  <div style="font-size:9px;font-weight:600;color:#94A3B8;letter-spacing:.5px;margin-bottom:6px">W${wn} PER TRUCK</div>
                  ${topTrucks.slice(0, 6).map(t => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                    <span style="font-size:10px;font-weight:600;color:#E2E8F0;width:75px">${t.plate}</span>
                    <div style="flex:1;height:12px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden">
                      <div style="height:100%;width:${Math.min(t.rate,100)}%;background:${t.rate>=80?'#10B981':t.rate>=50?'#38BDF8':'#EF4444'};border-radius:4px"></div>
                    </div>
                    <span style="font-size:10px;font-weight:700;color:${t.rate>=80?'#10B981':t.rate>=50?'#38BDF8':'#EF4444'};width:35px;text-align:right">${t.rate}%</span>
                    <span style="font-size:9px;color:#64748B">${t.days}d</span>
                  </div>`).join('')}
                </div>` : ''}
                ${idleTrucks.length ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--d-border)">
                  <div style="font-size:9px;font-weight:700;color:#EF4444;letter-spacing:.5px;margin-bottom:4px">ΑΔΡΑΝΗ W${wn}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:4px">${idlePlates.map(p =>
                    `<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.08);color:#EF4444;border:1px solid rgba(239,68,68,0.15)">${p}</span>`
                  ).join('')}</div>
                </div>` : ''}
              </div>
            </div>

            <!-- Unassigned Orders Aging -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">ΑΝΑΜΟΝΗ ΑΝΑΘΕΣΗΣ — AGING</div>
                <span style="font-size:10px;color:#64748B">${unassignedOrders.length} ανοιχτές</span>
              </div>
              <div class="dash-card-body" style="padding:0">
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
                      <td style="font-weight:600;color:#64748B">${r.orderNum}</td>
                      <td>
                        <div style="font-weight:500;color:#E2E8F0;font-size:11px">${r.client}</div>
                        <div style="font-size:9px;color:#94A3B8">${r.route}</div>
                      </td>
                      <td style="color:#64748B">${r.delDate ? fmtDateDM(r.delDate) : '—'}</td>
                      <td style="text-align:center;font-weight:700;color:#94A3B8">${r.pallets}</td>
                      <td style="text-align:right">${_dashAgingPill(r.hoursOld)}</td>
                    </tr>`).join('')}
                  </tbody>
                </table>` : '<div class="dash-empty">Δεν υπάρχουν ανοιχτές παραγγελίες</div>'}
              </div>
            </div>

          </div>

          <!-- Right Panel -->
          <div class="dash-right">

            <!-- HIGH RISK -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title" style="color:var(--danger)">ΥΨΗΛΟΣ ΚΙΝΔΥΝΟΣ</div>
              </div>
              <div class="dash-card-body">
                ${highRisk.length ? highRisk.map(r => {
                  const f = r.fields;
                  const del = (f['Delivery DateTime'] || '').substring(0, 10);
                  const route = `${(f['Loading Summary'] || '').slice(0, 15)} → ${(f['Delivery Summary'] || '').slice(0, 15)}`;
                  const hours = del ? Math.round((new Date(del) - now) / 3600000) : 0;
                  return `<div class="dash-risk-item" onclick="navigate('orders_intl')" style="cursor:pointer">
                    <div class="dash-risk-icon"></div>
                    <div class="dash-risk-text">${route}</div>
                    <div class="dash-risk-due">${hours}ω</div>
                  </div>`;
                }).join('') : '<div class="dash-empty">Κανένα κρίσιμο</div>'}
              </div>
            </div>

            <!-- FLEET ALERTS -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">ΕΙΔΟΠΟΙΗΣΕΙΣ ΣΤΟΛΟΥ</div>
              </div>
              <div class="dash-card-body">
                ${fleetAlerts.length ? fleetAlerts.slice(0, 6).map(a => `<div class="dash-fleet-alert-row">
                  <div class="dash-fleet-plate">${a.plate}</div>
                  <div class="dash-fleet-doc">${a.label}</div>
                  <div class="dash-fleet-days" style="color:${a.expired ? 'var(--danger)' : a.days < 14 ? 'var(--warning)' : 'var(--text-dim)'}">${a.expired ? 'ΛΗΓΜΕΝΟ' : a.days + 'μ'}</div>
                </div>`).join('') : '<div class="dash-empty">Χωρίς ειδοποιήσεις</div>'}
              </div>
            </div>

            <!-- COMPLIANCE SNAPSHOT -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">COMPLIANCE</div>
              </div>
              <div class="dash-card-body" style="padding:8px 16px">
                ${complianceTrucks.map(t => `<div class="dash-comp-row">
                  <div class="dash-comp-plate">${t.plate}</div>
                  <div class="dash-comp-blocks">
                    ${Object.entries(t.docs).map(([label, status]) => {
                      const bg = status === 'ok' ? 'rgba(16,185,129,0.15)' : status === 'warn' ? 'rgba(245,158,11,0.15)' : status === 'expired' ? 'rgba(239,68,68,0.15)' : 'rgba(71,85,105,0.1)';
                      const color = status === 'ok' ? '#10B981' : status === 'warn' ? '#F59E0B' : status === 'expired' ? '#EF4444' : '#475569';
                      return `<span class="dash-comp-block" style="background:${bg};color:${color}">${label}</span>`;
                    }).join('')}
                  </div>
                </div>`).join('')}
              </div>
            </div>

            <!-- WEEKLY SCORE -->
            <div class="dash-card">
              <div class="dash-card-header">
                <div class="dash-card-title">ΕΒΔΟΜΑΔΙΑΙΟ SCORE</div>
                <span style="font-size:10px;color:#64748B">W${wn}</span>
              </div>
              <div class="dash-card-body" style="text-align:center">
                <div class="dash-score-ring">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
                    <circle cx="40" cy="40" r="34" fill="none" stroke="${scoreColor}" stroke-width="6"
                      stroke-dasharray="${Math.round(213.6 * weeklyScore / 100)} 213.6"
                      stroke-linecap="round" transform="rotate(-90 40 40)"
                      style="transition:stroke-dasharray 0.6s ease"/>
                  </svg>
                  <div class="dash-score-num" style="color:${scoreColor}">${weeklyScore}</div>
                </div>
                <div style="padding:0 4px">
                  ${_dashScoreBar('Ανάθεση', assignmentRate, '#0284C7')}
                  ${_dashScoreBar('On-Time', onTimePct, '#10B981')}
                  ${_dashScoreBar('Compliance', complianceRate, '#7C3AED')}
                  ${_dashScoreBar('Dead KM', deadKmScore >= 0 ? deadKmScore : 100, '#F59E0B')}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    // Set up auto-refresh
    if (_dashRefreshTimer) clearInterval(_dashRefreshTimer);
    _dashRefreshTimer = setInterval(() => {
      // Only refresh if we're still on the dashboard
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

// ── Helper: Ops Row ──
function _dashOpsRow(d, type) {
  const dotColor = d.status === 'Delivered' ? 'var(--success)' : d.status === 'In Transit' ? '#7C3AED' : d.status === 'Assigned' ? 'var(--accent)' : 'var(--warning)';
  const dayBg = d.day === 'Σήμερα' ? 'var(--accent-light)' : 'rgba(100,116,139,0.08)';
  const dayColor = d.day === 'Σήμερα' ? 'var(--accent)' : 'var(--text-dim)';
  return `<div class="dash-ops-row" onclick="navigate('orders_intl')">
    <div class="dash-status-dot" style="background:${dotColor}"></div>
    <span class="dash-day-tag" style="background:${dayBg};color:${dayColor}">${d.day}</span>
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

// ── Helper: Aging pill ──
function _dashAgingPill(hours) {
  let bg, color, text;
  if (hours > 48) {
    bg = 'var(--danger-bg)'; color = 'var(--danger)'; text = Math.round(hours / 24) + 'μ';
  } else if (hours > 24) {
    bg = 'var(--warning-bg)'; color = 'var(--warning)'; text = Math.round(hours / 24) + 'μ';
  } else {
    bg = 'var(--success-bg)'; color = 'var(--success)'; text = hours + 'ω';
  }
  return `<span class="dash-aging-pill" style="background:${bg};color:${color}">${text}</span>`;
}

// ── Helper: Score sub-bar ──
function _dashScoreBar(label, val, color) {
  return `<div class="dash-score-bar">
    <div class="dash-score-bar-label">${label}</div>
    <div class="dash-score-bar-track"><div class="dash-score-bar-fill" style="width:${val}%;background:${color}"></div></div>
    <div class="dash-score-bar-val">${val}%</div>
  </div>`;
}

// ── Helper: Get week start (Monday) ──
function _getWeekStart(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(dt.setDate(diff));
}

// ── Skeleton loader for dashboard ──
function _dashSkeleton() {
  return `<div style="padding:0;max-width:1600px">
    <style>
      @keyframes dash-sk { 0% { opacity: 0.4; } 50% { opacity: 0.8; } 100% { opacity: 0.4; } }
      .dash-sk-block { background: #0B1929; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; animation: dash-sk 1.4s ease-in-out infinite; }
    </style>
    <div style="display:flex;justify-content:space-between;margin-bottom:20px">
      <div>
        <div class="dash-sk-block" style="width:200px;height:24px;margin-bottom:6px;border-radius:6px"></div>
        <div class="dash-sk-block" style="width:160px;height:14px;border-radius:4px"></div>
      </div>
      <div class="dash-sk-block" style="width:120px;height:14px;border-radius:4px;align-self:flex-end"></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px">
      ${[1,2,3,4,5].map(() => '<div class="dash-sk-block" style="height:82px"></div>').join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 320px;gap:16px">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="dash-sk-block" style="height:220px"></div>
          <div class="dash-sk-block" style="height:220px"></div>
        </div>
        <div class="dash-sk-block" style="height:90px"></div>
        <div class="dash-sk-block" style="height:200px"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="dash-sk-block" style="height:140px"></div>
        <div class="dash-sk-block" style="height:130px"></div>
        <div class="dash-sk-block" style="height:120px"></div>
        <div class="dash-sk-block" style="height:180px"></div>
      </div>
    </div>
  </div>`;
}
