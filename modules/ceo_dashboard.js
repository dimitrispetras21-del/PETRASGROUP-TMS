// ═══════════════════════════════════════════════════════════════
// MODULE — CEO DASHBOARD
// Scaling Up Framework: People / Strategy / Execution / Cash
// Owner-only. Read-only. No orders, no plates, only patterns.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────
  let _period  = 'month';   // week | month | quarter | ytd
  let _timer   = null;
  let _charts  = {};        // Chart.js instance registry

  // ── Entry point ─────────────────────────────────────────────
  async function renderCEODashboard() {
    const c = document.getElementById('content');
    if (can('ceo_dashboard') !== 'full') {
      c.innerHTML = '<div class="access-denied"><h2>Access Denied</h2><p>CEO Dashboard is restricted to the account owner.</p></div>';
      return;
    }
    if (_timer) clearInterval(_timer);
    _destroyAllCharts();

    c.innerHTML = _shellHTML();
    _bindPeriodButtons();
    await _loadAll();
    _timer = setInterval(_loadAll, 10 * 60 * 1000);
  }

  // ── Period helpers ───────────────────────────────────────────
  function _getPeriodRange(p) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    let start, end;
    if (p === 'week') {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day; // Monday
      start = new Date(now); start.setDate(now.getDate() + diff); start.setHours(0,0,0,0);
      end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
    } else if (p === 'month') {
      start = new Date(y, m, 1);
      end   = new Date(y, m + 1, 0, 23, 59, 59, 999);
    } else if (p === 'quarter') {
      const q = Math.floor(m / 3);
      start = new Date(y, q * 3, 1);
      end   = new Date(y, q * 3 + 3, 0, 23, 59, 59, 999);
    } else { // ytd
      start = new Date(y, 0, 1);
      end   = new Date(); end.setHours(23,59,59,999);
    }
    return { start, end };
  }

  function _iso(d) { return d.toISOString().split('T')[0]; }

  function _periodLabel(p) {
    const m = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
    const now = new Date();
    if (p === 'week') return 'Εβδομάδα ' + _getWeekNum(now);
    if (p === 'month') return m[now.getMonth()] + ' ' + now.getFullYear();
    if (p === 'quarter') return 'Q' + (Math.floor(now.getMonth() / 3) + 1) + ' ' + now.getFullYear();
    return 'YTD ' + now.getFullYear();
  }

  function _getWeekNum(d) {
    const date = new Date(d);
    date.setHours(0,0,0,0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  // ── Data loader ──────────────────────────────────────────────
  async function _loadAll() {
    const { start, end } = _getPeriodRange(_period);
    const s = _iso(start), e = _iso(end);
    const now = new Date();
    const plus48 = new Date(now.getTime() + 48 * 3600000).toISOString();
    // Spark = last 8 weeks for trend charts
    const sparkS = _iso(new Date(now.getTime() - 56 * 86400000));

    // Update "updated" time immediately
    const updEl = document.getElementById('ceo-updated');
    if (updEl) updEl.textContent = 'Φόρτωση...';

    try {
      const [allOrders, activeDrivers, tripCosts, maintHistory, highRiskOrders, sparkOrders] = await Promise.all([
        atGet(TABLES.ORDERS, `AND(IS_AFTER({Loading DateTime},'${s}'),IS_BEFORE({Loading DateTime},'${e}'))`),
        atGet(TABLES.DRIVERS, `{Active}=1`),
        atGet(TABLES.TRIP_COSTS, `AND(IS_AFTER({Trip Start Date},'${s}'),IS_BEFORE({Trip Start Date},'${e}'))`).catch(() => []),
        atGet(TABLES.MAINT_HISTORY).catch(() => []),
        atGet(TABLES.ORDERS, `AND(IS_BEFORE({Delivery DateTime},'${plus48}'),{Status}!='Delivered',{Status}!='Cancelled',{Status}!='')`),
        atGet(TABLES.ORDERS, `IS_AFTER({Loading DateTime},'${sparkS}')`),
      ]);

      const deliveredOrders = allOrders.filter(r => r.fields['Status'] === 'Delivered');

      _renderAll({ allOrders, deliveredOrders, activeDrivers, tripCosts, maintHistory, highRiskOrders, sparkOrders });

      if (updEl) updEl.textContent = 'Updated: ' + now.toLocaleTimeString('el-GR', {hour:'2-digit',minute:'2-digit'});
    } catch (err) {
      if (typeof logError === 'function') logError(err, 'CEO Dashboard loadAll');
      const c = document.getElementById('content');
      if (c) c.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444">Σφάλμα φόρτωσης. <button onclick="renderCEODashboard()" style="margin-left:12px;padding:8px 16px;background:#0284C7;color:#fff;border:none;border-radius:6px;cursor:pointer">Ανανέωση</button></div>`;
    }
  }

  // ── Full page render ─────────────────────────────────────────
  function _renderAll(data) {
    _destroyAllCharts();

    const el = id => document.getElementById(id);

    // ── SECTION 0: Brand Promises ──
    const speed    = _calcSpeed(data.deliveredOrders);
    const quality  = _calcQuality(data.deliveredOrders);
    const anxiety  = _calcAnxiety();
    el('brand-speed-val').textContent    = speed.hasData    ? _pct(speed.value)    : 'N/A';
    el('brand-quality-val').textContent  = quality.hasData  ? _pct(quality.value)  : 'N/A';
    el('brand-anxiety-val').textContent  = anxiety.value;
    el('brand-speed-sub').textContent    = speed.hasData    ? `${speed.onTime} on-time από ${speed.total}` : '';
    el('brand-quality-sub').textContent  = quality.hasData  ? `${quality.sent} με proof από ${quality.total}` : '';
    const wkNum = _getWeekNum(new Date());
    el('brand-anxiety-sub').textContent  = `W${wkNum} · ${anxiety.value} ${anxiety.value === 1 ? 'κλήση' : 'κλήσεις'}`;
    el('brand-speed-val').style.color    = speed.hasData    ? _colorScore(speed.value, 98)    : '#cbd5e1';
    el('brand-quality-val').style.color  = quality.hasData  ? _colorScore(quality.value, 100) : '#cbd5e1';
    el('brand-anxiety-val').style.color  = anxiety.value === 0 ? '#22c55e' : anxiety.value <= 3 ? '#f59e0b' : '#ef4444';

    // Toggle no-data class for visual state
    const speedCard   = document.querySelector('.ceo-brand-card.speed');
    const qualityCard = document.querySelector('.ceo-brand-card.quality');
    if (speedCard)   speedCard.classList.toggle('no-data', !speed.hasData);
    if (qualityCard) qualityCard.classList.toggle('no-data', !quality.hasData);

    if (speed.hasData)   _gauge('gauge-speed',   speed.value,   98,  false);
    if (quality.hasData) _gauge('gauge-quality',  quality.value, 100, false);
    _gaugeAnxiety('gauge-anxiety', anxiety.value);

    // Pre-fill anxiety input with current week's saved value
    const ainput = el('anxiety-input');
    if (ainput) ainput.value = anxiety.value || 0;

    // ── SECTION 1: People ──
    const { utilPct, driversUsed, driverCount } = _calcDriverUtil(data.allOrders, data.activeDrivers);
    const { partnerPct, partnerCount, ownedCount } = _calcPartnerRatio(data.allOrders);
    const availableDrivers = driverCount - driversUsed;

    el('people-util-val').textContent  = _pct(utilPct);
    el('people-util-val').style.color  = _colorScore(utilPct, 80);
    el('people-util-sub').textContent  = `${driversUsed} από ${driverCount} οδηγοί ενεργοί`;
    el('people-util-bar').style.width  = Math.min(utilPct, 100) + '%';
    el('people-util-bar').style.background = _colorScore(utilPct, 80);

    el('people-partner-val').textContent = _pct(partnerPct);
    el('people-partner-val').style.color = partnerPct > 40 ? '#ef4444' : partnerPct > 30 ? '#f59e0b' : '#22c55e';
    el('people-partner-sub').textContent = `${partnerCount} partner | ${ownedCount} ιδιόκτητα`;
    _donut('chart-partner', [ownedCount || 0, partnerCount || 0], ['#0284C7','#f59e0b']);

    el('people-avail-val').textContent = availableDrivers;
    el('people-avail-val').style.color = availableDrivers > 0 ? '#22c55e' : '#7A92B0';
    el('people-avail-sub').textContent = `διαθέσιμοι αυτή την εβδομάδα`;

    _renderWorkloadChart('chart-workload', data.allOrders, data.activeDrivers);

    // ── SECTION 2: Strategy ──
    const revenue = _calcRevenue(data.allOrders);
    const revTarget = _getRevTarget();
    const revPct = revTarget ? (revenue / revTarget * 100) : 0;
    const deadKM = _calcDeadKM(data.allOrders);
    const topClients = _calcTopClients(data.allOrders, 5);

    el('strat-revenue-val').textContent = _eur(revenue);
    el('strat-revenue-sub').textContent = revTarget ? `${_pct(revPct)} vs στόχο ${_eur(revTarget)}` : 'Πατήστε ✎ για να ορίσετε μηνιαίο στόχο';
    el('strat-revenue-val').style.color  = revTarget ? _colorScore(revPct, 100) : '#0B1929';
    if (revTarget) {
      el('strat-rev-bar').style.width = Math.min(revPct, 100) + '%';
      el('strat-rev-bar').style.background = _colorScore(revPct, 100);
    }

    if (deadKM.hasData) {
      el('strat-deadkm-val').textContent = _km(deadKM.totalDead);
      el('strat-deadkm-val').style.color  = deadKM.pct < 15 ? '#22c55e' : deadKM.pct < 25 ? '#f59e0b' : '#ef4444';
      el('strat-deadkm-sub').textContent  = `${_pct(deadKM.pct)} του συνόλου — ${_km(deadKM.totalLoaded)} loaded`;
      el('strat-deadkm-bar').style.width  = Math.min(deadKM.pct, 100) + '%';
      el('strat-deadkm-bar').style.background = deadKM.pct < 15 ? '#22c55e' : deadKM.pct < 25 ? '#f59e0b' : '#ef4444';
      _sparkline('chart-deadkm', _computeWeeklyDeadKM(data.sparkOrders), '#f59e0b', 15, true);
    } else {
      el('strat-deadkm-val').textContent = 'N/A';
      el('strat-deadkm-val').style.color  = '#7A92B0';
      el('strat-deadkm-sub').textContent  = deadKM.hint;
      el('strat-deadkm-bar').style.width  = '0%';
    }

    // Top Clients table
    el('strat-clients-body').innerHTML = topClients.length
      ? topClients.map((cl, i) => `
          <tr>
            <td style="color:#94a3b8;font-size:11px">#${i+1}</td>
            <td style="color:#334155;font-weight:500">${escapeHtml(cl.name)}</td>
            <td style="color:#22c55e;font-family:monospace">${_eur(cl.revenue)}</td>
            <td style="color:#94a3b8">${_pct(cl.pct)}</td>
          </tr>`).join('')
      : '<tr><td colspan="4" style="color:#94a3b8;text-align:center;padding:20px">Χωρίς δεδομένα εσόδων</td></tr>';

    // ── SECTION 3: Execution ──
    const { onTimePct } = _calcSpeed(data.deliveredOrders);
    const weeklyOnTime  = _computeWeeklyOnTime(data.sparkOrders);
    const vsRate        = _calcVSRate(data.allOrders);
    const assignedPct   = _calcAssignedRate(data.allOrders);

    el('exec-ontime-val').textContent = data.deliveredOrders.length ? _pct(onTimePct || 0) : 'N/A';
    el('exec-ontime-val').style.color = data.deliveredOrders.length ? _colorScore(onTimePct || 0, 98) : '#cbd5e1';
    el('exec-ontime-sub').textContent = `4-εβδ. μέσος: ${_weekAvg(weeklyOnTime)}%`;
    _trendLine('chart-ontime', weeklyOnTime, 98);

    el('exec-risk-val').textContent  = data.highRiskOrders.length;
    el('exec-risk-val').style.color  = data.highRiskOrders.length === 0 ? '#22c55e' : '#ef4444';
    el('exec-risk-sub').textContent  = data.highRiskOrders.length === 0
      ? 'Καμία κρίσιμη αποστολή επόμενων 48h'
      : `Παράδοση σε <48h χωρίς Delivered status`;

    el('exec-vs-val').textContent = _pct(vsRate);
    el('exec-vs-val').style.color  = vsRate >= 60 ? '#22c55e' : vsRate >= 40 ? '#f59e0b' : '#7A92B0';
    el('exec-vs-sub').textContent  = 'Veroia Switch usage σε export φορτία';

    el('exec-assign-val').textContent = _pct(assignedPct);
    el('exec-assign-val').style.color  = _colorScore(assignedPct, 90);
    el('exec-assign-sub').textContent  = 'φορτία με ανατεθειμένο truck';

    // ── SECTION 4: Cash ──
    const { deliveredRev, uninvoicedCount, uninvoicedRev } = _calcCashMetrics(data.allOrders);
    const maintCost = _calcMaintCost(data.maintHistory);
    const { partnerRevPct, partnerMargin } = _calcPartnerMargin(data.allOrders);
    const lossTrips = _calcLossTrips(data.tripCosts);

    el('cash-revenue-val').textContent = _eur(deliveredRev);
    el('cash-revenue-sub').textContent = `Παραδοθέντα + Τιμολογημένα`;

    el('cash-uninv-val').textContent  = uninvoicedCount;
    el('cash-uninv-val').style.color  = uninvoicedRev > 5000 ? '#ef4444' : uninvoicedCount > 0 ? '#f59e0b' : '#22c55e';
    el('cash-uninv-sub').textContent  = uninvoicedRev > 0 ? `${_eur(uninvoicedRev)} αδρανούν (χωρίς τιμολόγιο)` : 'Όλα τιμολογημένα';

    const maintPct = deliveredRev > 0 ? (maintCost / deliveredRev * 100) : 0;
    el('cash-maint-val').textContent = _eur(maintCost);
    el('cash-maint-val').style.color  = maintPct < 8 ? '#22c55e' : maintPct < 12 ? '#f59e0b' : '#ef4444';
    el('cash-maint-sub').textContent  = deliveredRev > 0 ? `${_pct(maintPct)} των εσόδων (στόχος <8%)` : 'Χωρίς δεδομένα εσόδων';

    el('cash-partner-val').textContent = data.tripCosts.length > 0 ? _pct(partnerMargin) : 'N/A';
    el('cash-partner-val').style.color  = data.tripCosts.length > 0
      ? (partnerMargin > 30 ? '#22c55e' : partnerMargin > 15 ? '#f59e0b' : '#ef4444')
      : '#cbd5e1';
    el('cash-partner-sub').textContent  = data.tripCosts.length > 0 ? 'margin σε partner φορτία' : 'Απαιτείται TRIP COSTS data';

    el('cash-loss-body').innerHTML = lossTrips.length
      ? lossTrips.map(t => `<tr>
          <td style="color:#334155">${escapeHtml(t.route)}</td>
          <td style="color:#22c55e;font-family:monospace">${_eur(t.revenue)}</td>
          <td style="color:#64748b;font-family:monospace">${_eur(t.cost)}</td>
          <td style="color:#ef4444;font-weight:700;font-family:monospace">-${_eur(t.loss)}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" style="color:#94a3b8;text-align:center;padding:20px">
          ${data.tripCosts.length === 0 ? 'Απαιτείται Trip Costs data (D1)' : 'Καμία ζημιογόνος διαδρομή'}
        </td></tr>`;

    // ── NAKIS Commentary ──
    _renderNakis({ allOrders: data.allOrders, deliveredOrders: data.deliveredOrders, speed, deadKM, highRiskCount: data.highRiskOrders.length, revenue: deliveredRev, uninvoicedRev });

    // Revenue target setter
    const tgt = el('rev-target-input');
    if (tgt) tgt.value = _getRevTarget() || '';
  }

  // ── Calculators ─────────────────────────────────────────────

  function _calcSpeed(deliveredOrders) {
    // Try Actual Delivery Date field first
    const withActual = deliveredOrders.filter(r => r.fields['Actual Delivery Date'] && r.fields['Delivery DateTime']);
    if (withActual.length > 0) {
      const onTime = withActual.filter(r => new Date(r.fields['Actual Delivery Date']) <= new Date(r.fields['Delivery DateTime'])).length;
      return { value: onTime / withActual.length * 100, onTime, total: withActual.length, hasData: true };
    }
    // Fall back to Delivery Performance field
    const withPerf = deliveredOrders.filter(r => r.fields['Delivery Performance']);
    if (withPerf.length > 0) {
      const onTime = withPerf.filter(r => r.fields['Delivery Performance'] === 'On Time').length;
      return { value: onTime / withPerf.length * 100, onTime, total: withPerf.length, hasData: true };
    }
    return { value: 0, onTime: 0, total: deliveredOrders.length, hasData: false };
  }

  function _calcQuality(deliveredOrders) {
    // Check if field exists at all
    const withField = deliveredOrders.filter(r => 'Temp Graph Sent' in r.fields);
    if (withField.length === 0) return { value: 0, sent: 0, total: deliveredOrders.length, hasData: false };
    const sent = deliveredOrders.filter(r => r.fields['Temp Graph Sent']).length;
    return { value: deliveredOrders.length ? sent / deliveredOrders.length * 100 : 0, sent, total: deliveredOrders.length, hasData: true };
  }

  function _calcAnxiety() {
    const wk = _getWeekNum(new Date());
    const yr = new Date().getFullYear();
    const key = `ceo_anxiety_${yr}_W${wk}`;
    const stored = localStorage.getItem(key);
    return { value: stored ? parseInt(stored, 10) : 0, key };
  }

  function _calcDriverUtil(allOrders, activeDrivers) {
    const driverCount = activeDrivers.length;
    const usedSet = new Set();
    allOrders.forEach(r => {
      const d = r.fields['Driver'];
      if (Array.isArray(d)) d.forEach(id => usedSet.add(id));
      else if (d) usedSet.add(d);
    });
    return { utilPct: driverCount ? usedSet.size / driverCount * 100 : 0, driversUsed: usedSet.size, driverCount };
  }

  function _calcPartnerRatio(allOrders) {
    const partnerCount = allOrders.filter(r => {
      const p = r.fields['Partner'];
      return Array.isArray(p) ? p.length > 0 : !!p;
    }).length;
    const ownedCount = allOrders.length - partnerCount;
    return { partnerPct: allOrders.length ? partnerCount / allOrders.length * 100 : 0, partnerCount, ownedCount };
  }

  function _calcRevenue(allOrders) {
    return allOrders.reduce((s, r) => s + (parseFloat(r.fields['Net Price']) || 0), 0);
  }

  // Dead KM: checks for 'Dead KM' field OR computes from 'Total KM' - 'Loaded KM'
  // Add one of these to ORDERS in Airtable to activate this metric.
  function _calcDeadKM(allOrders) {
    // Option A: explicit Dead KM field
    const withDead = allOrders.filter(r => r.fields['Dead KM'] != null && r.fields['Dead KM'] !== '');
    if (withDead.length > 0) {
      const totalDead   = withDead.reduce((s, r) => s + (parseFloat(r.fields['Dead KM']) || 0), 0);
      const totalLoaded = withDead.reduce((s, r) => s + (parseFloat(r.fields['Loaded KM'] || r.fields['Total KM']) || 0), 0);
      const totalAll    = totalDead + totalLoaded;
      return { hasData: true, totalDead, totalLoaded, pct: totalAll ? totalDead / totalAll * 100 : 0 };
    }
    // Option B: Total KM + Loaded KM → Dead = Total - Loaded
    const withBoth = allOrders.filter(r => r.fields['Total KM'] != null && r.fields['Loaded KM'] != null);
    if (withBoth.length > 0) {
      const totalKM   = withBoth.reduce((s, r) => s + (parseFloat(r.fields['Total KM']) || 0), 0);
      const loadedKM  = withBoth.reduce((s, r) => s + (parseFloat(r.fields['Loaded KM']) || 0), 0);
      const deadKM    = Math.max(totalKM - loadedKM, 0);
      return { hasData: true, totalDead: deadKM, totalLoaded: loadedKM, pct: totalKM ? deadKM / totalKM * 100 : 0 };
    }
    // No data: return hint for what to add
    return {
      hasData: false, totalDead: 0, totalLoaded: 0, pct: 0,
      hint: 'Προσθέστε πεδίο "Dead KM" ή "Total KM" + "Loaded KM" στον πίνακα ORDERS'
    };
  }

  function _calcTopClients(allOrders, n) {
    const map = {};
    const total = allOrders.reduce((s, r) => s + (parseFloat(r.fields['Net Price']) || 0), 0);
    allOrders.forEach(r => {
      const name = (Array.isArray(r.fields['Client Name']) ? r.fields['Client Name'][0] : r.fields['Client Name']) || 'Unknown';
      const rev  = parseFloat(r.fields['Net Price']) || 0;
      if (!map[name]) map[name] = 0;
      map[name] += rev;
    });
    return Object.entries(map)
      .sort(([,a],[,b]) => b - a)
      .slice(0, n)
      .map(([name, revenue]) => ({ name, revenue, pct: total ? revenue / total * 100 : 0 }));
  }

  function _calcVSRate(allOrders) {
    const exports = allOrders.filter(r => r.fields['Direction'] === 'Export');
    if (!exports.length) return 0;
    const vsCount = allOrders.filter(r => r.fields['Veroia Switch']).length;
    return vsCount / exports.length * 100;
  }

  function _calcAssignedRate(allOrders) {
    if (!allOrders.length) return 0;
    const assigned = allOrders.filter(r => {
      const t = r.fields['Truck'];
      return Array.isArray(t) ? t.length > 0 : !!t;
    }).length;
    return assigned / allOrders.length * 100;
  }

  function _calcCashMetrics(allOrders) {
    const delivered = allOrders.filter(r => ['Delivered','Invoiced'].includes(r.fields['Status']));
    const deliveredRev = delivered.reduce((s, r) => s + (parseFloat(r.fields['Net Price']) || 0), 0);
    const uninvoiced = allOrders.filter(r => r.fields['Status'] === 'Delivered' && !r.fields['Invoiced']);
    const uninvoicedRev = uninvoiced.reduce((s, r) => s + (parseFloat(r.fields['Net Price']) || 0), 0);
    return { deliveredRev, uninvoicedCount: uninvoiced.length, uninvoicedRev };
  }

  function _calcMaintCost(maintHistory) {
    return maintHistory.reduce((s, r) => s + (parseFloat(r.fields['Cost']) || parseFloat(r.fields['Total Cost']) || 0), 0);
  }

  function _calcPartnerMargin(allOrders) {
    const partnerOrders = allOrders.filter(r => {
      const p = r.fields['Partner']; return Array.isArray(p) ? p.length > 0 : !!p;
    });
    const revenue = partnerOrders.reduce((s,r) => s + (parseFloat(r.fields['Net Price']) || 0), 0);
    const cost    = partnerOrders.reduce((s,r) => s + (parseFloat(r.fields['Partner Rate']) || 0), 0);
    const partnerMargin = revenue > 0 ? (revenue - cost) / revenue * 100 : 0;
    return { partnerRevPct: 0, partnerMargin };
  }

  function _calcLossTrips(tripCosts) {
    return tripCosts
      .map(r => ({
        route: r.fields['Route'] || r.fields['Name'] || 'Unknown route',
        revenue: parseFloat(r.fields['Revenue']) || 0,
        cost:    parseFloat(r.fields['Total Cost']) || parseFloat(r.fields['Cost']) || 0,
        loss: 0
      }))
      .map(t => ({ ...t, loss: t.cost - t.revenue }))
      .filter(t => t.loss > 0)
      .sort((a, b) => b.loss - a.loss)
      .slice(0, 3);
  }

  // ── Sparkline data builders ──────────────────────────────────

  function _computeWeeklyOnTime(sparkOrders) {
    const weeks = {};
    sparkOrders.filter(r => r.fields['Status'] === 'Delivered').forEach(r => {
      const d = new Date(r.fields['Loading DateTime'] || r.createdTime);
      const wk = `W${_getWeekNum(d)}`;
      if (!weeks[wk]) weeks[wk] = { total: 0, onTime: 0 };
      weeks[wk].total++;
      const perf = r.fields['Delivery Performance'];
      const actual = r.fields['Actual Delivery Date'];
      if (actual && r.fields['Delivery DateTime']) {
        if (new Date(actual) <= new Date(r.fields['Delivery DateTime'])) weeks[wk].onTime++;
      } else if (perf === 'On Time') {
        weeks[wk].onTime++;
      }
    });
    return Object.entries(weeks).sort(([a],[b]) => a.localeCompare(b)).slice(-8)
      .map(([label, v]) => ({ label, value: v.total ? Math.round(v.onTime / v.total * 100) : 0 }));
  }

  // Dead KM weekly trend — % dead of total per week
  function _computeWeeklyDeadKM(sparkOrders) {
    const weeks = {};
    sparkOrders.forEach(r => {
      const d  = new Date(r.fields['Loading DateTime'] || r.createdTime);
      const wk = `W${_getWeekNum(d)}`;
      if (!weeks[wk]) weeks[wk] = { dead: 0, total: 0 };
      const dead   = parseFloat(r.fields['Dead KM']) || 0;
      const loaded = parseFloat(r.fields['Loaded KM'] || r.fields['Total KM']) || 0;
      const totalKM = parseFloat(r.fields['Total KM']) || 0;
      if (dead > 0) { weeks[wk].dead += dead; weeks[wk].total += dead + loaded; }
      else if (totalKM > 0 && loaded > 0) { weeks[wk].dead += Math.max(totalKM - loaded, 0); weeks[wk].total += totalKM; }
    });
    return Object.entries(weeks).sort(([a],[b]) => a.localeCompare(b)).slice(-8)
      .map(([label, v]) => ({ label, value: v.total ? Math.round(v.dead / v.total * 100) : 0 }));
  }

  function _weekAvg(data) {
    if (!data.length) return 'N/A';
    return Math.round(data.slice(-4).reduce((s,d) => s + d.value, 0) / Math.min(data.length, 4));
  }

  // ── Revenue target (localStorage) ───────────────────────────
  function _getRevTarget() {
    return parseFloat(localStorage.getItem('ceo_rev_target')) || 0;
  }

  window._ceoSetRevTarget = function() {
    const current = _getRevTarget();
    const raw = prompt('Μηνιαίος Στόχος Εσόδων (€):', current || '');
    if (raw === null) return; // cancelled
    const v = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (!isNaN(v) && v > 0) {
      localStorage.setItem('ceo_rev_target', v);
      _loadAll();
    }
  };

  // ── Anxiety score widget ─────────────────────────────────────
  window._ceoSaveAnxiety = function() {
    const v = parseInt(document.getElementById('anxiety-input').value, 10) || 0;
    const wk = _getWeekNum(new Date());
    const yr = new Date().getFullYear();
    localStorage.setItem(`ceo_anxiety_${yr}_W${wk}`, v);
    _loadAll();
  };

  // ── Chart helpers ────────────────────────────────────────────

  function _destroyAllCharts() {
    Object.values(_charts).forEach(ch => { try { ch.destroy(); } catch(e) {} });
    _charts = {};
  }

  function _destroyChart(id) {
    if (_charts[id]) { try { _charts[id].destroy(); } catch(e) {} delete _charts[id]; }
  }

  function _gauge(id, value, target, lowerIsBetter) {
    _destroyChart(id);
    const el = document.getElementById(id);
    if (!el || !window.Chart) return;
    const color = lowerIsBetter
      ? (value < target * 0.7 ? '#22c55e' : value < target ? '#f59e0b' : '#ef4444')
      : _colorScore(value, target);
    // Light-theme track: visible gray arc even at value=0
    const clampedVal = Math.min(Math.max(value, 0), 100);
    _charts[id] = new Chart(el, {
      type: 'doughnut',
      data: { datasets: [{ data: [clampedVal, 100 - clampedVal], backgroundColor: [color, '#e8eef4'], borderWidth: 0, circumference: 180, rotation: 270 }] },
      options: { plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '72%', animation: { duration: 800 } }
    });
  }

  function _gaugeAnxiety(id, value) {
    _destroyChart(id);
    const el = document.getElementById(id);
    if (!el || !window.Chart) return;
    const safeVal = Math.min(Math.max(value, 0), 10);
    const color   = value === 0 ? '#22c55e' : value <= 3 ? '#f59e0b' : '#ef4444';
    _charts[id] = new Chart(el, {
      type: 'doughnut',
      data: { datasets: [{ data: [safeVal, 10 - safeVal], backgroundColor: [color, '#e8eef4'], borderWidth: 0, circumference: 180, rotation: 270 }] },
      options: { plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '72%', animation: { duration: 800 } }
    });
  }

  function _donut(id, dataVals, colors) {
    _destroyChart(id);
    const el = document.getElementById(id);
    if (!el || !window.Chart) return;
    _charts[id] = new Chart(el, {
      type: 'doughnut',
      data: { labels: ['Ιδιόκτητα', 'Partner'], datasets: [{ data: dataVals, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        plugins: { legend: { display: true, position: 'bottom', labels: { color: '#64748b', font: { size: 10 }, padding: 8 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } } },
        cutout: '60%',
        animation: { duration: 600 }
      }
    });
  }

  function _sparkline(id, weeklyData, color, targetVal, lowerIsBetter) {
    _destroyChart(id);
    const el = document.getElementById(id);
    if (!el || !window.Chart || !weeklyData.length) return;
    const labels = weeklyData.map(w => w.label);
    const values = weeklyData.map(w => w.value);
    _charts[id] = new Chart(el, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { data: values, borderColor: color, borderWidth: 2, pointRadius: 3, pointBackgroundColor: color, fill: false, tension: 0.3 },
          { data: labels.map(() => targetVal), borderColor: '#ef4444', borderWidth: 1, borderDash: [4,3], pointRadius: 0, fill: false }
        ]
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#94a3b8', font: { size: 9 }, callback: v => v + '%' }, grid: { color: '#f1f5f9' }, min: 0, max: 100 }
        },
        animation: { duration: 500 }
      }
    });
  }

  function _trendLine(id, weeklyData, targetVal) {
    _destroyChart(id);
    const el = document.getElementById(id);
    if (!el || !window.Chart || !weeklyData.length) return;
    const labels = weeklyData.map(w => w.label);
    const values = weeklyData.map(w => w.value);
    _charts[id] = new Chart(el, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: values, borderColor: '#0284C7', borderWidth: 2,
            backgroundColor: 'rgba(2,132,199,0.06)', fill: true,
            pointRadius: 4, pointBackgroundColor: values.map(v => _colorScore(v, targetVal)),
            tension: 0.3
          },
          { data: labels.map(() => targetVal), borderColor: '#22c55e', borderWidth: 1.5, borderDash: [5,4], pointRadius: 0, fill: false, label: 'Στόχος 98%' }
        ]
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#94a3b8', font: { size: 9 }, callback: v => v + '%' }, grid: { color: '#f1f5f9' }, min: 0, max: 100 }
        },
        animation: { duration: 600 }
      }
    });
  }

  function _renderWorkloadChart(id, allOrders, activeDrivers) {
    _destroyChart(id);
    const el = document.getElementById(id);
    if (!el || !window.Chart) return;

    // Count trips per driver name
    const driverMap = {};
    activeDrivers.forEach(d => { driverMap[d.id] = d.fields['Full Name'] || d.id; });
    const counts = {};
    allOrders.forEach(r => {
      const d = r.fields['Driver'];
      const ids = Array.isArray(d) ? d : (d ? [d] : []);
      ids.forEach(id => {
        const name = driverMap[id] || null;
        if (!name) return; // skip unknown/unmapped IDs (Airtable rec IDs)
        const short = name.split(' ')[0]; // First name only
        counts[short] = (counts[short] || 0) + 1;
      });
    });

    const entries = Object.entries(counts).sort(([,a],[,b]) => b - a).slice(0, 8);
    if (!entries.length) { el.parentNode.innerHTML = '<div style="color:#7A92B0;font-size:12px;text-align:center;padding:20px">Χωρίς δεδομένα οδηγών</div>'; return; }

    const maxV = Math.max(...entries.map(([,v]) => v));
    const minV = Math.min(...entries.map(([,v]) => v));
    const colors = entries.map(([,v]) => v === maxV ? '#f59e0b' : v === minV ? '#0284C7' : '#cbd5e1');

    // Horizontal bar chart — labels are readable without rotation
    _charts[id] = new Chart(el, {
      type: 'bar',
      data: {
        labels: entries.map(([k]) => k),
        datasets: [{ data: entries.map(([,v]) => v), backgroundColor: colors, borderRadius: 3 }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} φορτία` } } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 9 }, stepSize: 1 }, grid: { color: '#f1f5f9' } },
          y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } }
        },
        animation: { duration: 500 }
      }
    });
  }

  // ── Nakis Commentary ─────────────────────────────────────────

  function _renderNakis({ allOrders, deliveredOrders, speed, deadKM, highRiskCount, revenue, uninvoicedRev }) {
    const el = document.getElementById('nakis-commentary');
    if (!el) return;

    const lines = [];
    const total = allOrders.length;
    const period = _periodLabel(_period);

    lines.push(`**Σύνοψη ${period}:** ${total} φορτία στη βάση δεδομένων`
      + (deliveredOrders.length ? `, ${deliveredOrders.length} παραδόθηκαν.` : '.'));

    if (speed.hasData) {
      if (speed.value >= 98) lines.push(`**Speed Score ${_pct(speed.value)}** — εξαιρετική επίδοση on-time. Στόχος 98% επιτυγχάνεται.`);
      else if (speed.value >= 95) lines.push(`**Speed Score ${_pct(speed.value)}** — οριακά κάτω από στόχο. Έλεγξε τις καθυστερημένες αποστολές.`);
      else lines.push(`**Speed Score ${_pct(speed.value)}** — σημαντική απόκλιση. Απαιτείται άμεση ανάλυση αιτίων.`);
    } else {
      lines.push(`**Speed Score:** Δεν υπάρχουν δεδομένα on-time. Απαιτείται πεδίο "Actual Delivery Date" ή συμπλήρωση "Delivery Performance".`);
    }

    if (deadKM.hasData) {
      if (deadKM.pct < 15) lines.push(`**Dead KM ${_pct(deadKM.pct)}** — καλή απόδοση στόλου. ${_km(deadKM.totalDead)} νεκρά km σε σύνολο ${_km(deadKM.totalDead + deadKM.totalLoaded)}.`);
      else if (deadKM.pct < 25) lines.push(`**Dead KM ${_pct(deadKM.pct)}** — αξίζει βελτιστοποίηση δρομολογίων. Στόχος <15%.`);
      else lines.push(`**Dead KM ${_pct(deadKM.pct)}** — υψηλά νεκρά χιλιόμετρα. Εξέτασε backhaul και διαδρομές επιστροφής.`);
    } else {
      lines.push(`**Dead KM:** ${deadKM.hint}`);
    }

    if (highRiskCount > 0) lines.push(`**${highRiskCount} φορτία** με παράδοση <48h χωρίς Delivered status. Επιβεβαίωσε άμεσα τους οδηγούς.`);
    else lines.push(`**Κανένα high-risk** φορτίο για τις επόμενες 48h.`);

    if (uninvoicedRev > 5000) lines.push(`**${_eur(uninvoicedRev)} αδρανούν** σε παραδοθέντα χωρίς τιμολόγιο. Δώσε προτεραιότητα στην τιμολόγηση.`);

    if (revenue > 0) lines.push(`**Έσοδα ${_eur(revenue)}** για ${period} (παραδοθέντα + τιμολογημένα).`);

    el.innerHTML = lines.map(l => `<div class="nakis-line"><span class="nakis-dot">—</span>${l.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`).join('');
  }

  // ── Color / formatting helpers ───────────────────────────────

  function _colorScore(value, target) {
    return value >= target ? '#22c55e' : value >= target * 0.97 ? '#f59e0b' : '#ef4444';
  }

  function _pct(n) { return (n || 0).toFixed(1) + '%'; }

  function _eur(n) {
    return '€' + Math.round(n || 0).toLocaleString('el-GR');
  }

  function _km(n) {
    return Math.round(n || 0).toLocaleString('el-GR') + ' km';
  }

  // ── Period buttons ───────────────────────────────────────────

  function _bindPeriodButtons() {
    document.querySelectorAll('.ceo-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _period = btn.dataset.period;
        document.querySelectorAll('.ceo-period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _loadAll();
      });
    });
  }

  // ── Shell HTML ───────────────────────────────────────────────

  function _shellHTML() {
    return `
<style>
/* ── CEO Dashboard — Light Theme ────────────────────────────── */
.ceo-wrap { padding:28px 28px 60px; min-height:100vh; background:#F4F6F9; }

/* Header */
.ceo-header { display:flex; align-items:center; gap:16px; margin-bottom:32px; flex-wrap:wrap; }
.ceo-title-block { flex:1; }
.ceo-title { font-family:'Syne',sans-serif; font-size:26px; font-weight:800; color:#0B1929; letter-spacing:-0.3px; }
.ceo-subtitle { font-size:10px; color:#94a3b8; letter-spacing:2px; text-transform:uppercase; margin-top:4px; }
.ceo-period-sel { display:flex; gap:3px; background:#e2e8f0; padding:4px; border-radius:8px; }
.ceo-period-btn { padding:6px 16px; font-size:12px; font-family:'DM Sans',sans-serif; border:none; border-radius:6px; cursor:pointer; background:transparent; color:#64748b; transition:all 0.2s; font-weight:500; }
.ceo-period-btn.active { background:#0284C7; color:#fff; }
.ceo-period-btn:hover:not(.active) { color:#0B1929; background:#cbd5e1; }
#ceo-updated { font-size:10px; color:#94a3b8; white-space:nowrap; font-family:'DM Sans',monospace; }

/* Section labels */
.ceo-section-label { font-size:9px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#0284C7; margin:0 0 14px; padding-left:12px; border-left:3px solid #0284C7; }

/* Brand Promise cards — equal height, flex column */
.ceo-brand-row { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:24px; }
.ceo-brand-card { background:#ffffff; border-radius:14px; padding:24px; border:1px solid #e2e8f0; position:relative; overflow:hidden; display:flex; flex-direction:column; min-height:280px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
.ceo-brand-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; border-radius:14px 14px 0 0; }
.ceo-brand-card.speed::before   { background:linear-gradient(90deg,#0284C7,#38BDF8); }
.ceo-brand-card.quality::before { background:linear-gradient(90deg,#22c55e,#4ade80); }
.ceo-brand-card.anxiety::before { background:linear-gradient(90deg,#7c3aed,#a78bfa); }
.ceo-brand-label { font-size:9px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#94a3b8; margin-bottom:3px; }
.ceo-brand-name  { font-family:'Syne',sans-serif; font-size:13px; font-weight:700; color:#334155; margin-bottom:0; }
.ceo-brand-body  { flex:1; display:flex; flex-direction:column; justify-content:center; padding:12px 0 8px; }
.ceo-gauge-wrap  { height:80px; display:flex; align-items:flex-end; justify-content:center; }
.ceo-gauge-wrap canvas { max-height:80px; }
.ceo-brand-big   { font-family:'Syne',monospace; font-size:52px; font-weight:800; line-height:1; margin:4px 0; }
.ceo-brand-sub   { font-size:11px; color:#94a3b8; min-height:16px; }
.ceo-target      { font-size:10px; color:#cbd5e1; margin-top:auto; padding-top:8px; border-top:1px solid #f1f5f9; }

/* No-data state — hide gauge, show badge */
.ceo-brand-card.no-data .ceo-gauge-wrap { display:none; }
.ceo-brand-card.no-data .ceo-brand-big  { font-size:18px; color:#e2e8f0; letter-spacing:3px; font-family:'DM Sans',sans-serif; font-weight:400; margin:0 0 12px; }
.ceo-brand-card.no-data .ceo-brand-body { justify-content:flex-start; padding-top:16px; }
.ceo-setup-badge { display:none; align-items:flex-start; gap:10px; padding:12px 14px; background:#f8fafc; border-radius:8px; border:1px dashed #e2e8f0; margin:0 0 8px; }
.ceo-brand-card.no-data .ceo-setup-badge { display:flex; }
.ceo-setup-badge span { font-size:11px; color:#94a3b8; line-height:1.6; }
.ceo-setup-badge span strong { color:#64748b; }

/* Anxiety entry */
.anxiety-entry { display:flex; align-items:center; gap:8px; margin-top:auto; padding-top:12px; border-top:1px solid #f1f5f9; }
.anxiety-entry label { font-size:10px; color:#94a3b8; white-space:nowrap; }
.anxiety-entry input { width:58px; padding:5px 8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; color:#0B1929; font-size:15px; text-align:center; font-family:'Syne',monospace; }
.anxiety-entry input:focus { outline:none; border-color:#0284C7; }
.anxiety-entry button { padding:5px 12px; background:transparent; color:#94a3b8; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; font-size:11px; font-weight:600; transition:all 0.2s; }
.anxiety-entry button:hover { border-color:#0284C7; color:#0284C7; }

/* Quadrant grid */
.ceo-quadrants { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px; }
.ceo-quad { background:#ffffff; border-radius:14px; padding:22px; border:1px solid #e2e8f0; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
.ceo-quad-title { font-family:'Syne',sans-serif; font-size:9px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; color:#94a3b8; margin-bottom:16px; display:flex; align-items:center; gap:8px; }
.ceo-quad-title span.dot { width:7px; height:7px; border-radius:50%; display:inline-block; flex-shrink:0; }
.quad-people   .dot { background:#0284C7; box-shadow:0 0 6px #0284C740; }
.quad-strategy .dot { background:#22c55e; box-shadow:0 0 6px #22c55e40; }
.quad-exec     .dot { background:#f59e0b; box-shadow:0 0 6px #f59e0b40; }
.quad-cash     .dot { background:#7c3aed; box-shadow:0 0 6px #7c3aed40; }

/* KPI rows */
.ceo-kpi-row { display:flex; align-items:flex-start; gap:12px; padding:10px 0; border-bottom:1px solid #f1f5f9; }
.ceo-kpi-row:last-child { border-bottom:none; }
.ceo-kpi-num { font-family:'Syne',monospace; font-size:28px; font-weight:800; line-height:1; white-space:nowrap; min-width:90px; }
.ceo-kpi-label { font-size:10px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:#94a3b8; }
.ceo-kpi-sub   { font-size:11px; color:#b0bec5; margin-top:3px; }

/* Progress bars */
.ceo-bar-track { height:5px; background:#e2e8f0; border-radius:3px; margin-top:8px; }
.ceo-bar-fill  { height:5px; border-radius:3px; transition:width 0.7s cubic-bezier(0.4,0,0.2,1); }

/* Edit button for revenue target */
.ceo-edit-btn { background:none; border:none; cursor:pointer; color:#cbd5e1; font-size:13px; padding:1px 5px; border-radius:4px; transition:color 0.2s; vertical-align:middle; margin-left:6px; }
.ceo-edit-btn:hover { color:#0284C7; }

/* Charts */
.ceo-chart-wrap { margin-top:10px; height:80px; }
.ceo-chart-wrap canvas { max-height:80px; }

/* Tables */
.ceo-mini-table { width:100%; border-collapse:collapse; font-size:12px; }
.ceo-mini-table th { font-size:9px; letter-spacing:1px; text-transform:uppercase; color:#94a3b8; padding:6px 4px; border-bottom:1px solid #e2e8f0; text-align:left; }
.ceo-mini-table td { padding:7px 4px; border-bottom:1px solid #f8fafc; }
.ceo-mini-table tr:last-child td { border-bottom:none; }

/* Dead KM pending note */
.ceo-pending-note { display:flex; align-items:center; gap:10px; padding:10px 14px; background:#f8fafc; border-radius:8px; border:1px dashed #e2e8f0; margin-top:10px; }
.ceo-pending-note span { font-size:11px; color:#94a3b8; line-height:1.5; }
.ceo-pending-note strong { color:#64748b; }

/* Nakis */
.ceo-nakis { background:#ffffff; border-radius:14px; padding:22px; border:1px solid #e2e8f0; margin-bottom:20px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
.ceo-nakis-title { font-size:9px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; color:#0284C7; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
.nakis-line { font-size:13px; color:#64748b; line-height:1.7; padding:7px 0; border-bottom:1px solid #f8fafc; display:flex; gap:10px; }
.nakis-line:last-child { border-bottom:none; }
.nakis-line strong { color:#334155; }
.nakis-dot { color:#cbd5e1; font-size:14px; flex-shrink:0; margin-top:1px; font-style:normal; }

@media (max-width:768px) {
  .ceo-brand-row { grid-template-columns:1fr; }
  .ceo-quadrants { grid-template-columns:1fr; }
  .ceo-brand-big { font-size:38px; }
  .ceo-kpi-num   { font-size:22px; min-width:70px; }
  .ceo-header { flex-direction:column; align-items:flex-start; }
  .ceo-period-sel { width:100%; }
  .ceo-wrap { padding:16px 16px 48px; }
}
@media (max-width:480px) {
  .ceo-period-btn { padding:5px 10px; font-size:11px; }
  .ceo-title { font-size:20px; }
}
</style>

<div class="ceo-wrap">

  <!-- Header -->
  <div class="ceo-header">
    <div class="ceo-title-block">
      <div class="ceo-title">CEO Dashboard</div>
      <div class="ceo-subtitle">Scaling Up · People · Strategy · Execution · Cash</div>
    </div>
    <div class="ceo-period-sel">
      <button class="ceo-period-btn${_period==='week'?' active':''}"    data-period="week">Εβδομάδα</button>
      <button class="ceo-period-btn${_period==='month'?' active':''}"   data-period="month">Μήνας</button>
      <button class="ceo-period-btn${_period==='quarter'?' active':''}" data-period="quarter">Τρίμηνο</button>
      <button class="ceo-period-btn${_period==='ytd'?' active':''}"     data-period="ytd">YTD</button>
    </div>
    <div id="ceo-updated">Φόρτωση...</div>
  </div>

  <!-- Section 0: Brand Promises -->
  <div class="ceo-section-label">Brand Promises — The 3 Numbers That Matter Most</div>
  <div class="ceo-brand-row">

    <!-- Speed Score -->
    <div class="ceo-brand-card speed">
      <div class="ceo-brand-label">Brand Promise 1</div>
      <div class="ceo-brand-name">Speed Score — Faster to Shelf</div>
      <div class="ceo-brand-body">
        <div class="ceo-gauge-wrap"><canvas id="gauge-speed" height="80"></canvas></div>
        <div class="ceo-brand-big" id="brand-speed-val">—</div>
        <div class="ceo-setup-badge">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#3a5068" stroke-width="1.5"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l2.5 2.5"/></svg>
          <span>Απαιτείται πεδίο <strong>Actual Delivery Date</strong> στον πίνακα ORDERS</span>
        </div>
        <div class="ceo-brand-sub" id="brand-speed-sub"></div>
      </div>
      <div class="ceo-target">Στόχος: ≥98%</div>
    </div>

    <!-- Quality Score -->
    <div class="ceo-brand-card quality">
      <div class="ceo-brand-label">Brand Promise 2</div>
      <div class="ceo-brand-name">Quality Score — Verified Freshness</div>
      <div class="ceo-brand-body">
        <div class="ceo-gauge-wrap"><canvas id="gauge-quality" height="80"></canvas></div>
        <div class="ceo-brand-big" id="brand-quality-val">—</div>
        <div class="ceo-setup-badge">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#3a5068" stroke-width="1.5"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l2.5 2.5"/></svg>
          <span>Απαιτείται πεδίο <strong>Temp Graph Sent</strong> στον πίνακα ORDERS</span>
        </div>
        <div class="ceo-brand-sub" id="brand-quality-sub"></div>
      </div>
      <div class="ceo-target">Στόχος: 100%</div>
    </div>

    <!-- Anxiety Score -->
    <div class="ceo-brand-card anxiety">
      <div class="ceo-brand-label">Brand Promise 3</div>
      <div class="ceo-brand-name">Anxiety Score — Zero-Anxiety Service</div>
      <div class="ceo-brand-body">
        <div class="ceo-gauge-wrap"><canvas id="gauge-anxiety" height="80"></canvas></div>
        <div class="ceo-brand-big" id="brand-anxiety-val">—</div>
        <div class="ceo-brand-sub" id="brand-anxiety-sub"></div>
      </div>
      <div class="ceo-target">Στόχος: 0 inbound calls / εβδομάδα</div>
      <div class="anxiety-entry">
        <label>Αυτή την εβδ.:</label>
        <input type="number" id="anxiety-input" min="0" max="99">
        <button onclick="_ceoSaveAnxiety()">Αποθήκευση</button>
      </div>
    </div>
  </div>

  <!-- Quadrants 2x2 -->
  <div class="ceo-section-label" style="margin-top:28px">Scaling Up Framework</div>
  <div class="ceo-quadrants">

    <!-- Q1: People -->
    <div class="ceo-quad quad-people">
      <div class="ceo-quad-title"><span class="dot"></span>People — Ομάδα & Στόλος</div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num" id="people-util-val">—</div>
          <div class="ceo-kpi-label">Driver Utilization</div>
          <div class="ceo-kpi-sub" id="people-util-sub">Φόρτωση...</div>
          <div class="ceo-bar-track"><div class="ceo-bar-fill" id="people-util-bar" style="width:0%"></div></div>
        </div>
        <div>
          <div class="ceo-kpi-num" id="people-avail-val" style="font-size:22px;text-align:right">—</div>
          <div class="ceo-kpi-label" style="font-size:9px;text-align:right">Διαθέσιμοι</div>
          <div class="ceo-kpi-sub" id="people-avail-sub" style="text-align:right"></div>
        </div>
      </div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num" id="people-partner-val" style="font-size:22px">—</div>
          <div class="ceo-kpi-label">Partner Ratio</div>
          <div class="ceo-kpi-sub" id="people-partner-sub">Φόρτωση...</div>
        </div>
        <div style="width:100px; height:80px; flex-shrink:0;"><canvas id="chart-partner"></canvas></div>
      </div>

      <div style="margin-top:10px;">
        <div class="ceo-kpi-label" style="margin-bottom:8px">Workload Distribution</div>
        <div style="height:110px;"><canvas id="chart-workload"></canvas></div>
      </div>
    </div>

    <!-- Q2: Strategy -->
    <div class="ceo-quad quad-strategy">
      <div class="ceo-quad-title"><span class="dot"></span>Strategy — Ανάπτυξη & Θέση</div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div style="display:flex;align-items:baseline;gap:4px">
            <div class="ceo-kpi-num" id="strat-revenue-val">—</div>
            <button class="ceo-edit-btn" onclick="_ceoSetRevTarget()" title="Ορισμός μηνιαίου στόχου">✎</button>
          </div>
          <div class="ceo-kpi-label">Revenue vs Target</div>
          <div class="ceo-kpi-sub" id="strat-revenue-sub">Φόρτωση...</div>
          <div class="ceo-bar-track"><div class="ceo-bar-fill" id="strat-rev-bar" style="width:0%"></div></div>
        </div>
      </div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num" id="strat-deadkm-val">—</div>
          <div class="ceo-kpi-label">Dead KM — Νεκρά Χιλιόμετρα</div>
          <div class="ceo-kpi-sub" id="strat-deadkm-sub">Φόρτωση...</div>
          <div class="ceo-bar-track"><div class="ceo-bar-fill" id="strat-deadkm-bar" style="width:0%"></div></div>
          <div class="ceo-chart-wrap"><canvas id="chart-deadkm"></canvas></div>
          <div class="ceo-pending-note" id="deadkm-note" style="display:none">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#3a5068" stroke-width="1.5"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l2.5 2.5"/></svg>
            <span>Προσθέστε <strong>Dead KM</strong> ή <strong>Total KM + Loaded KM</strong> στο ORDERS</span>
          </div>
        </div>
      </div>

      <div style="margin-top:10px;">
        <div class="ceo-kpi-label" style="margin-bottom:8px">Top 5 Πελάτες (Revenue)</div>
        <table class="ceo-mini-table">
          <tbody id="strat-clients-body"><tr><td colspan="4" style="color:#2a3f55;text-align:center;padding:16px">Φόρτωση...</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- Q3: Execution -->
    <div class="ceo-quad quad-exec">
      <div class="ceo-quad-title"><span class="dot"></span>Execution — Επιχειρησιακή Αποτελεσματικότητα</div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num" id="exec-ontime-val">—</div>
          <div class="ceo-kpi-label">On-Time Delivery Trend</div>
          <div class="ceo-kpi-sub" id="exec-ontime-sub">Φόρτωση...</div>
          <div style="height:100px; margin-top:10px;"><canvas id="chart-ontime"></canvas></div>
        </div>
      </div>

      <div class="ceo-kpi-row">
        <div>
          <div class="ceo-kpi-num" id="exec-risk-val">—</div>
          <div class="ceo-kpi-label">High Risk — Επόμενες 48h</div>
          <div class="ceo-kpi-sub" id="exec-risk-sub">Φόρτωση...</div>
        </div>
      </div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num" id="exec-vs-val">—</div>
          <div class="ceo-kpi-label">Veroia Switch Utilization</div>
          <div class="ceo-kpi-sub" id="exec-vs-sub">Φόρτωση...</div>
        </div>
        <div>
          <div class="ceo-kpi-num" id="exec-assign-val" style="font-size:22px;text-align:right">—</div>
          <div class="ceo-kpi-label" style="font-size:9px;text-align:right">Assigned</div>
          <div class="ceo-kpi-sub" id="exec-assign-sub" style="text-align:right"></div>
        </div>
      </div>
    </div>

    <!-- Q4: Cash -->
    <div class="ceo-quad quad-cash">
      <div class="ceo-quad-title"><span class="dot"></span>Cash — Χρηματοροές & Κόστος</div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num" id="cash-revenue-val" style="font-size:30px">—</div>
          <div class="ceo-kpi-label">Revenue (Delivered + Invoiced)</div>
          <div class="ceo-kpi-sub" id="cash-revenue-sub">Φόρτωση...</div>
        </div>
      </div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num" id="cash-uninv-val">—</div>
          <div class="ceo-kpi-label">Αδρανή Τιμολόγια</div>
          <div class="ceo-kpi-sub" id="cash-uninv-sub">Φόρτωση...</div>
        </div>
        <div>
          <div class="ceo-kpi-num" id="cash-maint-val" style="font-size:20px;text-align:right">—</div>
          <div class="ceo-kpi-label" style="font-size:9px;text-align:right">Maintenance</div>
          <div class="ceo-kpi-sub" id="cash-maint-sub" style="text-align:right"></div>
        </div>
      </div>

      <div class="ceo-kpi-row">
        <div>
          <div class="ceo-kpi-num" id="cash-partner-val" style="font-size:22px">—</div>
          <div class="ceo-kpi-label">Partner Margin</div>
          <div class="ceo-kpi-sub" id="cash-partner-sub">Φόρτωση...</div>
        </div>
      </div>

      <div style="margin-top:10px;">
        <div class="ceo-kpi-label" style="margin-bottom:8px">Top 3 Ζημιογόνες Διαδρομές</div>
        <table class="ceo-mini-table">
          <thead><tr>
            <th>Διαδρομή</th><th>Έσοδο</th><th>Κόστος</th><th>Ζημία</th>
          </tr></thead>
          <tbody id="cash-loss-body"><tr><td colspan="4" style="color:#2a3f55;text-align:center;padding:16px">Φόρτωση...</td></tr></tbody>
        </table>
      </div>
    </div>

  </div><!-- end quadrants -->

  <!-- Nakis Commentary -->
  <div class="ceo-nakis">
    <div class="ceo-nakis-title">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#38BDF8" stroke-width="1.8"><circle cx="10" cy="10" r="8"/><path d="M7 10l2 2 4-4"/></svg>
      Νάκης — CEO Briefing
    </div>
    <div id="nakis-commentary" style="color:#2a3f55">Φόρτωση...</div>
  </div>

</div><!-- end ceo-wrap -->`;
  }

  // ── Chart.js loader ──────────────────────────────────────────
  function _ensureChartJs() {
    return new Promise((resolve) => {
      if (window.Chart) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      s.onload = resolve;
      s.onerror = resolve; // Resolve even on error; charts won't render but page won't break
      document.head.appendChild(s);
    });
  }

  // Override _loadAll to ensure Chart.js first
  const _originalLoadAll = _loadAll;
  async function _loadAllWithChart() {
    await _ensureChartJs();
    await _originalLoadAll();
  }

  // ── Expose globally ──────────────────────────────────────────
  window.renderCEODashboard = async function() {
    const c = document.getElementById('content');
    if (can('ceo_dashboard') !== 'full') {
      c.innerHTML = '<div style="padding:60px;text-align:center"><h3 style="color:#ef4444">Access Denied</h3><p style="color:#7A92B0">CEO Dashboard is restricted to the account owner.</p></div>';
      return;
    }
    if (_timer) clearInterval(_timer);
    _destroyAllCharts();
    // ceo-wrap handles its own dark background via CSS
    c.style.padding = '0';
    await _ensureChartJs();
    c.innerHTML = _shellHTML();
    _bindPeriodButtons();
    await _loadAll();
    _timer = setInterval(() => _loadAll(), 10 * 60 * 1000);
  };

})();
