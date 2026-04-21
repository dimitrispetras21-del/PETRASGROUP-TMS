// ═══════════════════════════════════════════════════════════════
// MODULE — CEO DASHBOARD v2
// Scaling Up · People · Strategy · Execution · Cash
// Owner-only · No Chart.js (pure SVG) · Token-based · PoP deltas
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── State ───────────────────────────────────────────────────
  let _period = 'month';   // week | month | quarter | ytd
  let _timer  = null;
  const _ic   = (n, size) => (typeof icon === 'function') ? icon(n, size || 14) : '';

  // ── Entry point ─────────────────────────────────────────────
  async function renderCEODashboard() {
    const c = document.getElementById('content');
    if (can('ceo_dashboard') !== 'full') {
      c.innerHTML = '<div class="access-denied"><h2>Access Denied</h2><p>CEO Dashboard is restricted to the account owner.</p></div>';
      return;
    }
    if (_timer) clearInterval(_timer);
    c.innerHTML = _shellHTML();
    _bindPeriodButtons();
    await _loadAll();
    _timer = setInterval(_loadAll, 10 * 60 * 1000);
  }

  // ── Period helpers ───────────────────────────────────────────
  function _getPeriodRange(p, offset) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    let start, end;
    const off = offset || 0;
    if (p === 'week') {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      start = new Date(now); start.setDate(now.getDate() + diff + off * 7); start.setHours(0,0,0,0);
      end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
    } else if (p === 'month') {
      start = new Date(y, m + off, 1);
      end   = new Date(y, m + off + 1, 0, 23, 59, 59, 999);
    } else if (p === 'quarter') {
      const q = Math.floor(m / 3) + off;
      start = new Date(y, q * 3, 1);
      end   = new Date(y, q * 3 + 3, 0, 23, 59, 59, 999);
    } else { // ytd
      start = new Date(y + off, 0, 1);
      end   = off === 0 ? new Date() : new Date(y + off, 11, 31, 23, 59, 59, 999);
    }
    return { start, end };
  }

  function _iso(d) { return d.toISOString().split('T')[0]; }

  function _periodLabel(p) {
    const m = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
    const now = new Date();
    if (p === 'week') return 'W' + _getWeekNum(now);
    if (p === 'month') return m[now.getMonth()] + ' ' + now.getFullYear();
    if (p === 'quarter') return 'Q' + (Math.floor(now.getMonth() / 3) + 1) + ' ' + now.getFullYear();
    return 'YTD ' + now.getFullYear();
  }

  function _prevPeriodLabel(p) {
    const m = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
    const now = new Date();
    if (p === 'week') return 'W' + (_getWeekNum(now) - 1);
    if (p === 'month') { const nm = new Date(now); nm.setMonth(nm.getMonth()-1); return m[nm.getMonth()]; }
    if (p === 'quarter') return 'Q' + (Math.floor(now.getMonth() / 3));
    return (now.getFullYear() - 1) + '';
  }

  function _getWeekNum(d) {
    const date = new Date(d);
    date.setHours(0,0,0,0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  // ── Data loader (fetches current + previous period for deltas) ──
  async function _loadAll() {
    const { start, end } = _getPeriodRange(_period);
    const { start: prevStart, end: prevEnd } = _getPeriodRange(_period, -1);
    const s = _iso(start), e = _iso(end);
    const ps = _iso(prevStart), pe = _iso(prevEnd);
    const now = new Date();
    const plus48 = new Date(now.getTime() + 48 * 3600000).toISOString();
    const sparkS = _iso(new Date(now.getTime() - 56 * 86400000));

    const updEl = document.getElementById('ceo-updated');
    if (updEl) updEl.textContent = 'Φόρτωση...';

    try {
      const [allOrders, prevOrders, activeDrivers, tripCosts, maintHistory, highRiskOrders, sparkOrders] = await Promise.all([
        atGet(TABLES.ORDERS, `AND(IS_AFTER({Loading DateTime},'${s}'),IS_BEFORE({Loading DateTime},'${e}'))`),
        atGet(TABLES.ORDERS, `AND(IS_AFTER({Loading DateTime},'${ps}'),IS_BEFORE({Loading DateTime},'${pe}'))`).catch(() => []),
        atGet(TABLES.DRIVERS, `{Active}=1`),
        atGet(TABLES.TRIP_COSTS, `AND(IS_AFTER({Trip Start Date},'${s}'),IS_BEFORE({Trip Start Date},'${e}'))`).catch(() => []),
        atGet(TABLES.MAINT_HISTORY).catch(() => []),
        atGet(TABLES.ORDERS, `AND(IS_BEFORE({Delivery DateTime},'${plus48}'),{Status}!='Delivered',{Status}!='Cancelled',{Status}!='')`),
        atGet(TABLES.ORDERS, `IS_AFTER({Loading DateTime},'${sparkS}')`),
      ]);

      const deliveredOrders = allOrders.filter(r => r.fields['Status'] === 'Delivered');
      const prevDelivered   = prevOrders.filter(r => r.fields['Status'] === 'Delivered');

      _renderAll({ allOrders, deliveredOrders, prevOrders, prevDelivered, activeDrivers, tripCosts, maintHistory, highRiskOrders, sparkOrders });

      if (updEl) updEl.textContent = 'Updated ' + now.toLocaleTimeString('el-GR', {hour:'2-digit',minute:'2-digit'});
    } catch (err) {
      if (typeof logError === 'function') logError(err, 'CEO Dashboard loadAll');
      const c = document.getElementById('content');
      if (c) c.innerHTML = `<div style="padding:40px;text-align:center;color:#DC2626">Σφάλμα φόρτωσης. <button onclick="renderCEODashboard()" style="margin-left:12px;padding:8px 16px;background:#0284C7;color:#fff;border:none;border-radius:6px;cursor:pointer">Ανανέωση</button></div>`;
    }
  }

  // ── Full page render ─────────────────────────────────────────
  function _renderAll(data) {
    const el = id => document.getElementById(id);

    // Brand Promises
    const speed    = _calcSpeed(data.deliveredOrders);
    const quality  = _calcQuality(data.deliveredOrders);
    const anxiety  = _calcAnxiety();
    const prevSpeed = _calcSpeed(data.prevDelivered);
    const prevQuality = _calcQuality(data.prevDelivered);

    // Speed card
    el('brand-speed-val').textContent = speed.hasData ? _pctShort(speed.value) : '—';
    el('brand-speed-sub').innerHTML   = speed.hasData
      ? `${speed.onTime} on-time / ${speed.total}${prevSpeed.hasData ? ' ' + _deltaHTML(speed.value, prevSpeed.value, false) : ''}`
      : '';
    const speedCard = document.querySelector('.ceo-brand-card.speed');
    if (speedCard) {
      speedCard.classList.toggle('no-data', !speed.hasData);
      const ring = speedCard.querySelector('.ceo-gauge-ring');
      if (ring && speed.hasData) {
        const col = _colorScoreHex(speed.value, 98);
        ring.style.setProperty('--g-color', col);
        ring.style.setProperty('--g-deg', Math.min(speed.value, 100) * 3.6 + 'deg');
        el('brand-speed-val').style.color = col;
      }
    }

    // Quality card
    el('brand-quality-val').textContent = quality.hasData ? _pctShort(quality.value) : '—';
    el('brand-quality-sub').innerHTML   = quality.hasData
      ? `${quality.sent} proof / ${quality.total}${prevQuality.hasData ? ' ' + _deltaHTML(quality.value, prevQuality.value, false) : ''}`
      : '';
    const qualityCard = document.querySelector('.ceo-brand-card.quality');
    if (qualityCard) {
      qualityCard.classList.toggle('no-data', !quality.hasData);
      const ring = qualityCard.querySelector('.ceo-gauge-ring');
      if (ring && quality.hasData) {
        const col = _colorScoreHex(quality.value, 100);
        ring.style.setProperty('--g-color', col);
        ring.style.setProperty('--g-deg', Math.min(quality.value, 100) * 3.6 + 'deg');
        el('brand-quality-val').style.color = col;
      }
    }

    // Anxiety card (reverse scale — 10 is max bad, 0 is perfect)
    el('brand-anxiety-val').textContent = anxiety.value;
    const wkNum = _getWeekNum(new Date());
    el('brand-anxiety-sub').textContent = `W${wkNum} · ${anxiety.value} ${anxiety.value === 1 ? 'κλήση' : 'κλήσεις'}`;
    const anxietyRing = document.querySelector('.ceo-brand-card.anxiety .ceo-gauge-ring');
    if (anxietyRing) {
      const clamped = Math.min(anxiety.value, 10);
      const col = anxiety.value === 0 ? '#34D399' : anxiety.value <= 3 ? '#F59E0B' : '#F87171';
      anxietyRing.style.setProperty('--g-color', col);
      anxietyRing.style.setProperty('--g-deg', clamped * 36 + 'deg');
      el('brand-anxiety-val').style.color = col;
    }
    const ainput = el('anxiety-input');
    if (ainput) ainput.value = anxiety.value || 0;

    // ── Q1: People ──
    const { utilPct, driversUsed, driverCount } = _calcDriverUtil(data.allOrders, data.activeDrivers);
    const { partnerPct, partnerCount, ownedCount } = _calcPartnerRatio(data.allOrders);
    const availableDrivers = driverCount - driversUsed;

    const prevUtil = data.prevOrders.length ? _calcDriverUtil(data.prevOrders, data.activeDrivers).utilPct : 0;
    const prevPart = data.prevOrders.length ? _calcPartnerRatio(data.prevOrders).partnerPct : 0;

    el('people-util-val').innerHTML = `${_pctShort(utilPct)}${_deltaHTML(utilPct, prevUtil, false)}`;
    el('people-util-val').className = 'ceo-kpi-num ' + _cssScoreClass(utilPct, 80);
    el('people-util-sub').textContent = `${driversUsed} / ${driverCount} οδηγοί σε δράση`;
    el('people-util-bar').style.width  = Math.min(utilPct, 100) + '%';
    el('people-util-bar').style.background = _colorScoreHex(utilPct, 80);

    el('people-partner-val').innerHTML = `${_pctShort(partnerPct)}${_deltaHTML(partnerPct, prevPart, true)}`;
    el('people-partner-val').className = 'ceo-kpi-num sm ' + (partnerPct > 40 ? 'ceo-val-bad' : partnerPct > 30 ? 'ceo-val-warn' : 'ceo-val-ok');
    el('people-partner-sub').textContent = `${partnerCount} partner · ${ownedCount} ιδιόκτητα`;
    // Partner split bar (replaces donut)
    const total = ownedCount + partnerCount || 1;
    el('people-split-owned').style.width = (ownedCount / total * 100) + '%';
    el('people-split-partner').style.width = (partnerCount / total * 100) + '%';

    el('people-avail-val').textContent = availableDrivers;
    el('people-avail-val').className = 'ceo-kpi-num sm ' + (availableDrivers > 0 ? 'ceo-val-ok' : 'ceo-val-muted');
    el('people-avail-sub').textContent = 'διαθέσιμοι';

    // Workload list (replaces horizontal bar chart)
    el('people-workload').innerHTML = _renderWorkloadList(data.allOrders, data.activeDrivers);

    // ── Q2: Strategy ──
    const revenue = _calcRevenue(data.allOrders);
    const prevRevenue = _calcRevenue(data.prevOrders);
    const revTarget = _getRevTarget();
    const revPct = revTarget ? (revenue / revTarget * 100) : 0;
    const deadKM = _calcDeadKM(data.allOrders);
    const topClients = _calcTopClients(data.allOrders, 5);

    el('strat-revenue-val').innerHTML = `${_eur(revenue)}${_deltaHTML(revenue, prevRevenue, false)}`;
    el('strat-revenue-val').className = 'ceo-kpi-num ' + (revTarget ? _cssScoreClass(revPct, 100) : '');
    el('strat-revenue-sub').textContent = revTarget ? `${_pctShort(revPct)} vs στόχο ${_eur(revTarget)}` : 'Πατήστε ✎ για στόχο';
    if (revTarget) {
      el('strat-rev-bar').style.width = Math.min(revPct, 100) + '%';
      el('strat-rev-bar').style.background = _colorScoreHex(revPct, 100);
    } else {
      el('strat-rev-bar').style.width = '0%';
    }

    if (deadKM.hasData) {
      el('strat-deadkm-val').textContent = _km(deadKM.totalDead);
      el('strat-deadkm-val').className = 'ceo-kpi-num ' + (deadKM.pct < 15 ? 'ceo-val-ok' : deadKM.pct < 25 ? 'ceo-val-warn' : 'ceo-val-bad');
      el('strat-deadkm-sub').textContent = `${_pctShort(deadKM.pct)} του συνόλου — ${_km(deadKM.totalLoaded)} loaded`;
      el('strat-deadkm-bar').style.width = Math.min(deadKM.pct, 100) + '%';
      el('strat-deadkm-bar').style.background = deadKM.pct < 15 ? '#34D399' : deadKM.pct < 25 ? '#F59E0B' : '#F87171';
      // Sparkline (inline SVG, no Chart.js)
      const weeklyDead = _computeWeeklyDeadKM(data.sparkOrders);
      el('strat-deadkm-spark').innerHTML = _ceoSpark(weeklyDead.map(d => d.value), '#D97706', 64);
    } else {
      el('strat-deadkm-val').textContent = 'N/A';
      el('strat-deadkm-val').className = 'ceo-kpi-num ceo-val-muted';
      el('strat-deadkm-sub').textContent = deadKM.hint || '';
      el('strat-deadkm-bar').style.width = '0%';
      el('strat-deadkm-spark').innerHTML = '';
    }

    // Top Clients with mini bars
    const maxClientRev = topClients.length ? topClients[0].revenue : 0;
    el('strat-clients-body').innerHTML = topClients.length
      ? topClients.map((cl, i) => `
          <tr>
            <td style="width:24px"><span class="ceo-client-rank">#${i+1}</span></td>
            <td style="font-weight:600;color:var(--ceo-text)">${escapeHtml(cl.name)}</td>
            <td class="mono" style="color:var(--ceo-ok);text-align:right;white-space:nowrap">${_eur(cl.revenue)}</td>
            <td style="min-width:80px">
              <div class="ceo-client-mini-bar">
                <div class="ceo-client-mini-bar-track">
                  <div class="ceo-client-mini-bar-fill" style="width:${maxClientRev ? (cl.revenue/maxClientRev*100) : 0}%"></div>
                </div>
                <span style="color:var(--ceo-text-dim);font-size:11px;font-weight:600;width:36px;text-align:right">${_pctShort(cl.pct)}</span>
              </div>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="4" style="color:var(--ceo-text-dim);text-align:center;padding:20px">Χωρίς δεδομένα</td></tr>';

    // ── Q3: Execution ──
    const { onTimePct } = speed; // reuse speed calc (on-time pct is the same)
    const weeklyOnTime = _computeWeeklyOnTime(data.sparkOrders);
    const vsRate = _calcVSRate(data.allOrders);
    const assignedPct = _calcAssignedRate(data.allOrders);
    const prevVsRate = data.prevOrders.length ? _calcVSRate(data.prevOrders) : 0;
    const prevAssigned = data.prevOrders.length ? _calcAssignedRate(data.prevOrders) : 0;

    el('exec-ontime-val').textContent = speed.hasData ? _pctShort(speed.value) : 'N/A';
    el('exec-ontime-val').className = 'ceo-kpi-num ' + (speed.hasData ? _cssScoreClass(speed.value, 98) : 'ceo-val-muted');
    el('exec-ontime-sub').textContent = `4-εβδ. μέσος: ${_weekAvg(weeklyOnTime)}%`;
    // Inline sparkline
    el('exec-ontime-spark').innerHTML = speed.hasData && weeklyOnTime.length
      ? _ceoSpark(weeklyOnTime.map(w => w.value), '#0284C7', 64)
      : '';

    el('exec-risk-val').textContent = data.highRiskOrders.length;
    el('exec-risk-val').className = 'ceo-kpi-num ' + (data.highRiskOrders.length === 0 ? 'ceo-val-ok' : 'ceo-val-bad');
    el('exec-risk-sub').textContent = data.highRiskOrders.length === 0
      ? 'Καμία κρίσιμη στις επόμενες 48h'
      : 'Παράδοση <48h χωρίς Delivered';

    el('exec-vs-val').innerHTML = `${_pctShort(vsRate)}${_deltaHTML(vsRate, prevVsRate, false)}`;
    el('exec-vs-val').className = 'ceo-kpi-num ' + (vsRate >= 60 ? 'ceo-val-ok' : vsRate >= 40 ? 'ceo-val-warn' : 'ceo-val-muted');
    el('exec-vs-sub').textContent = 'Veroia Switch σε exports';

    el('exec-assign-val').innerHTML = `${_pctShort(assignedPct)}${_deltaHTML(assignedPct, prevAssigned, false)}`;
    el('exec-assign-val').className = 'ceo-kpi-num sm ' + _cssScoreClass(assignedPct, 90);
    el('exec-assign-sub').textContent = 'με truck';

    // ── Q4: Cash ──
    const { deliveredRev, uninvoicedCount, uninvoicedRev } = _calcCashMetrics(data.allOrders);
    const prevCash = _calcCashMetrics(data.prevOrders);
    const maintCost = _calcMaintCost(data.maintHistory);
    const { partnerMargin } = _calcPartnerMargin(data.allOrders);
    const lossTrips = _calcLossTrips(data.tripCosts);

    el('cash-revenue-val').innerHTML = `${_eur(deliveredRev)}${_deltaHTML(deliveredRev, prevCash.deliveredRev, false)}`;
    el('cash-revenue-val').className = 'ceo-kpi-num ceo-val-ok';
    el('cash-revenue-sub').textContent = 'παραδοθέντα + τιμολογημένα';

    el('cash-uninv-val').textContent = uninvoicedCount;
    el('cash-uninv-val').className = 'ceo-kpi-num ' + (uninvoicedRev > 5000 ? 'ceo-val-bad' : uninvoicedCount > 0 ? 'ceo-val-warn' : 'ceo-val-ok');
    el('cash-uninv-sub').textContent = uninvoicedRev > 0 ? `${_eur(uninvoicedRev)} αδρανούν` : 'Όλα τιμολογημένα';

    const maintPct = deliveredRev > 0 ? (maintCost / deliveredRev * 100) : 0;
    el('cash-maint-val').textContent = _eur(maintCost);
    el('cash-maint-val').className = 'ceo-kpi-num sm ' + (maintPct < 8 ? 'ceo-val-ok' : maintPct < 12 ? 'ceo-val-warn' : 'ceo-val-bad');
    el('cash-maint-sub').textContent = deliveredRev > 0 ? `${_pctShort(maintPct)} εσόδων` : 'χωρίς έσοδα';

    el('cash-partner-val').textContent = data.tripCosts.length > 0 ? _pctShort(partnerMargin) : 'N/A';
    el('cash-partner-val').className = 'ceo-kpi-num sm ' + (data.tripCosts.length > 0
      ? (partnerMargin > 30 ? 'ceo-val-ok' : partnerMargin > 15 ? 'ceo-val-warn' : 'ceo-val-bad')
      : 'ceo-val-muted');
    el('cash-partner-sub').textContent = data.tripCosts.length > 0 ? 'partner margin' : 'Trip Costs ?';

    // Loss trips banner (conditional, above quadrants)
    const lossBanner = document.getElementById('ceo-loss-banner-wrap');
    if (lossBanner) {
      if (lossTrips.length > 0) {
        const totalLoss = lossTrips.reduce((s, t) => s + t.loss, 0);
        lossBanner.innerHTML = `<div class="ceo-loss-banner">
          <div class="ceo-loss-icon">${_ic('alert_triangle', 16)}</div>
          <div class="ceo-loss-text">
            <strong>${lossTrips.length} ζημιογόνες διαδρομές</strong> — συνολική ζημία <strong>${_eur(totalLoss)}</strong> για ${_periodLabel(_period)}
          </div>
        </div>`;
      } else {
        lossBanner.innerHTML = '';
      }
    }

    el('cash-loss-body').innerHTML = lossTrips.length
      ? lossTrips.map(t => `<tr>
          <td style="color:var(--ceo-text);font-weight:500">${escapeHtml(t.route)}</td>
          <td class="mono" style="color:var(--ceo-ok);text-align:right;white-space:nowrap">${_eur(t.revenue)}</td>
          <td class="mono" style="color:var(--ceo-text-mid);text-align:right;white-space:nowrap">${_eur(t.cost)}</td>
          <td class="mono" style="color:var(--ceo-bad);font-weight:700;text-align:right;white-space:nowrap">-${_eur(t.loss)}</td>
        </tr>`).join('')
      : `<tr><td colspan="4" style="color:var(--ceo-text-dim);text-align:center;padding:var(--space-4)">
          ${data.tripCosts.length === 0 ? 'Απαιτείται Trip Costs data' : 'Καμία ζημιογόνος διαδρομή'}
        </td></tr>`;

    // Executive Briefing
    _renderBrief({ allOrders: data.allOrders, deliveredOrders: data.deliveredOrders, speed, deadKM, highRiskCount: data.highRiskOrders.length, revenue: deliveredRev, prevRevenue: prevCash.deliveredRev, uninvoicedRev, lossTripsCount: lossTrips.length });

    const tgt = el('rev-target-input');
    if (tgt) tgt.value = _getRevTarget() || '';
  }

  // ── Calculators (unchanged from v1) ─────────────────────────
  function _calcSpeed(deliveredOrders) {
    const withActual = deliveredOrders.filter(r => r.fields['Actual Delivery Date'] && r.fields['Delivery DateTime']);
    if (withActual.length > 0) {
      const onTime = withActual.filter(r => new Date(r.fields['Actual Delivery Date']) <= new Date(r.fields['Delivery DateTime'])).length;
      const val = onTime / withActual.length * 100;
      return { value: val, onTimePct: val, onTime, total: withActual.length, hasData: true };
    }
    const withPerf = deliveredOrders.filter(r => r.fields['Delivery Performance']);
    if (withPerf.length > 0) {
      const onTime = withPerf.filter(r => r.fields['Delivery Performance'] === 'On Time').length;
      const val = onTime / withPerf.length * 100;
      return { value: val, onTimePct: val, onTime, total: withPerf.length, hasData: true };
    }
    return { value: 0, onTimePct: 0, onTime: 0, total: deliveredOrders.length, hasData: false };
  }

  function _calcQuality(deliveredOrders) {
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

  function _calcDeadKM(allOrders) {
    const withDead = allOrders.filter(r => r.fields['Dead KM'] != null && r.fields['Dead KM'] !== '');
    if (withDead.length > 0) {
      const totalDead   = withDead.reduce((s, r) => s + (parseFloat(r.fields['Dead KM']) || 0), 0);
      const totalLoaded = withDead.reduce((s, r) => s + (parseFloat(r.fields['Loaded KM'] || r.fields['Total KM']) || 0), 0);
      const totalAll    = totalDead + totalLoaded;
      return { hasData: true, totalDead, totalLoaded, pct: totalAll ? totalDead / totalAll * 100 : 0, source: 'explicit' };
    }
    const withBoth = allOrders.filter(r => r.fields['Total KM'] != null && r.fields['Loaded KM'] != null);
    if (withBoth.length > 0) {
      const totalKM   = withBoth.reduce((s, r) => s + (parseFloat(r.fields['Total KM']) || 0), 0);
      const loadedKM  = withBoth.reduce((s, r) => s + (parseFloat(r.fields['Loaded KM']) || 0), 0);
      const deadKM    = Math.max(totalKM - loadedKM, 0);
      return { hasData: true, totalDead: deadKM, totalLoaded: loadedKM, pct: totalKM ? deadKM / totalKM * 100 : 0, source: 'computed' };
    }
    const matched = allOrders.filter(r => r.fields['Matched Import ID']);
    const unmatched = allOrders.filter(r => r.fields['Direction'] === 'Export' && !r.fields['Matched Import ID']);
    if (matched.length + unmatched.length > 0) {
      const estDead = matched.length * 50 + unmatched.length * 600;
      const estTotal = matched.length * 1200 + unmatched.length * 1200;
      return {
        hasData: true, totalDead: estDead, totalLoaded: estTotal - estDead,
        pct: estTotal ? estDead / estTotal * 100 : 0,
        source: 'estimate', isEstimate: true
      };
    }
    return { hasData: false, totalDead: 0, totalLoaded: 0, pct: 0, hint: 'Προσθέστε "Dead KM" στο ORDERS' };
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

  // ── Revenue target ─────────────────────────────────────────
  function _getRevTarget() {
    return parseFloat(localStorage.getItem('ceo_rev_target')) || 0;
  }

  window._ceoSetRevTarget = function() {
    const current = _getRevTarget();
    const raw = prompt('Μηνιαίος Στόχος Εσόδων (€):', current || '');
    if (raw === null) return;
    const v = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (!isNaN(v) && v > 0) {
      localStorage.setItem('ceo_rev_target', v);
      _loadAll();
    }
  };

  window._ceoSaveAnxiety = function() {
    const v = parseInt(document.getElementById('anxiety-input').value, 10) || 0;
    const wk = _getWeekNum(new Date());
    const yr = new Date().getFullYear();
    localStorage.setItem(`ceo_anxiety_${yr}_W${wk}`, v);
    _loadAll();
  };

  // ── SVG Sparkline (replaces Chart.js) ───────────────────────
  function _ceoSpark(values, color, width) {
    if (!values || values.length < 2) return '';
    const w = width || 120, h = 36, pad = 2;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = (w - pad * 2) / (values.length - 1);
    const points = values.map((v, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const lastX = pad + (values.length - 1) * step;
    const lastY = pad + (h - pad * 2) * (1 - (values[values.length - 1] - min) / range);
    const areaPoints = `${pad},${h-pad} ${points} ${lastX.toFixed(1)},${h-pad}`;
    const gradId = 'cs' + Math.random().toString(36).slice(2,8);
    return `<svg class="ceo-spark-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <defs><linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      <polygon points="${areaPoints}" fill="url(#${gradId})"/>
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2" fill="${color}"/>
    </svg>`;
  }

  // ── Workload list (replaces horizontal bar chart) ──────────
  function _renderWorkloadList(allOrders, activeDrivers) {
    const driverMap = {};
    activeDrivers.forEach(d => { driverMap[d.id] = d.fields['Full Name'] || d.id; });
    const counts = {};
    allOrders.forEach(r => {
      const d = r.fields['Driver'];
      const ids = Array.isArray(d) ? d : (d ? [d] : []);
      ids.forEach(id => {
        const name = driverMap[id] || null;
        if (!name) return;
        const short = name.split(' ')[0];
        counts[short] = (counts[short] || 0) + 1;
      });
    });
    const entries = Object.entries(counts).sort(([,a],[,b]) => b - a).slice(0, 8);
    if (!entries.length) return '<div style="color:var(--ceo-text-dim);font-size:12px;text-align:center;padding:var(--space-4)">Χωρίς δεδομένα οδηγών</div>';
    const maxV = Math.max(...entries.map(([,v]) => v));
    const minV = Math.min(...entries.map(([,v]) => v));
    return `<div class="ceo-workload-list">${entries.map(([name, v]) => {
      const cls = v === maxV ? 'max' : v === minV ? 'min' : 'mid';
      const pct = maxV ? (v / maxV * 100) : 0;
      return `<div class="ceo-workload-row">
        <span class="ceo-workload-name">${escapeHtml(name)}</span>
        <div class="ceo-workload-bar"><div class="ceo-workload-fill ${cls}" style="width:${pct}%"></div></div>
        <span class="ceo-workload-count">${v}</span>
      </div>`;
    }).join('')}</div>`;
  }

  // ── Executive Briefing (was Nakis) ──────────────────────────
  function _renderBrief({ allOrders, deliveredOrders, speed, deadKM, highRiskCount, revenue, prevRevenue, uninvoicedRev, lossTripsCount }) {
    const el = document.getElementById('ceo-brief-body');
    if (!el) return;
    const lines = [];
    const period = _periodLabel(_period);

    if (allOrders.length === 0) {
      el.innerHTML = `<div class="ceo-brief-line"><span class="ceo-brief-bullet">—</span>Δεν υπάρχουν φορτία για ${period}. Έλεγχος Airtable filters.</div>`;
      return;
    }

    lines.push(`<strong>${allOrders.length}</strong> φορτία, <strong>${deliveredOrders.length}</strong> παραδοθέντα για ${period}.`);

    if (speed.hasData) {
      if (speed.value >= 98) lines.push(`Speed Score **${_pctShort(speed.value)}** — εξαιρετική απόδοση (στόχος ≥98%).`);
      else if (speed.value >= 90) lines.push(`Speed Score **${_pctShort(speed.value)}** — κοντά στον στόχο (≥98%). Επικέντρωση σε πρόσφατες καθυστερήσεις.`);
      else lines.push(`Speed Score **${_pctShort(speed.value)}** — κάτω από στόχο. Απαιτείται έλεγχος της διαδικασίας παράδοσης.`);
    }

    if (deadKM.hasData && deadKM.pct > 15) {
      lines.push(`Dead KM **${_pctShort(deadKM.pct)}** — πάνω από στόχο (<15%). Βελτίωσε import matching.`);
    }

    if (highRiskCount > 0) {
      lines.push(`**${highRiskCount} κρίσιμες** παραδόσεις στις επόμενες 48h — δώστε προτεραιότητα.`);
    }

    if (lossTripsCount > 0) {
      lines.push(`**${lossTripsCount} ζημιογόνες** διαδρομές εντοπίστηκαν στο Cash section — δες λεπτομέρειες.`);
    }

    if (uninvoicedRev > 5000) {
      lines.push(`**${_eur(uninvoicedRev)} αδρανούν** σε παραδοθέντα χωρίς τιμολόγιο — δώσε προτεραιότητα.`);
    }

    if (revenue > 0) {
      const deltaTxt = prevRevenue > 0 ? ` (${revenue > prevRevenue ? '+' : ''}${Math.round((revenue - prevRevenue)/prevRevenue * 100)}% vs προηγ.)` : '';
      lines.push(`Έσοδα **${_eur(revenue)}** για ${period}${deltaTxt}.`);
    }

    el.innerHTML = lines.map(l => `<div class="ceo-brief-line">
      <span class="ceo-brief-bullet">${_ic('chevron_right', 14)}</span>
      <span>${l.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</span>
    </div>`).join('');
  }

  // ── Helpers ────────────────────────────────────────────────
  function _colorScoreHex(value, target) {
    return value >= target ? '#34D399' : value >= target * 0.97 ? '#F59E0B' : '#F87171';
  }
  function _cssScoreClass(value, target) {
    return value >= target ? 'ceo-val-ok' : value >= target * 0.97 ? 'ceo-val-warn' : 'ceo-val-bad';
  }
  function _pctShort(n) { return (n || 0).toFixed(1).replace('.0', '') + '%'; }
  function _eur(n) { return '€' + Math.round(n || 0).toLocaleString('el-GR'); }
  function _km(n) { return Math.round(n || 0).toLocaleString('el-GR') + ' km'; }

  // Delta HTML — handles lower-is-better semantics
  function _deltaHTML(curr, prev, lowerIsBetter) {
    if (!prev || prev === 0 || isNaN(prev)) return '';
    const diff = curr - prev;
    const pct = Math.round(diff / prev * 100);
    if (pct === 0) return `<span class="ceo-delta flat">${_ic('minus', 10)}0%</span>`;
    const isUp = pct > 0;
    const cls = lowerIsBetter
      ? (isUp ? 'up-bad' : 'down')
      : (isUp ? 'up' : 'down-bad');
    const iconName = isUp ? 'trending_up' : 'trending_down';
    return `<span class="ceo-delta ${cls}">${_ic(iconName, 10)}${isUp ? '+' : ''}${pct}%</span>`;
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

  // ── Shell HTML (all styling via .ceo-* classes in style.css) ──
  function _shellHTML() {
    return `
<div class="ceo-wrap">

  <!-- Header -->
  <div class="ceo-header">
    <div class="ceo-title-block">
      <div class="ceo-title">CEO Dashboard</div>
      <div class="ceo-subtitle">Scaling Up · People · Strategy · Execution · Cash</div>
    </div>
    <div class="ceo-period-seg">
      <button class="ceo-period-btn${_period==='week'?' active':''}"    data-period="week">Εβδομάδα</button>
      <button class="ceo-period-btn${_period==='month'?' active':''}"   data-period="month">Μήνας</button>
      <button class="ceo-period-btn${_period==='quarter'?' active':''}" data-period="quarter">Τρίμηνο</button>
      <button class="ceo-period-btn${_period==='ytd'?' active':''}"     data-period="ytd">YTD</button>
    </div>
    <div id="ceo-updated">Φόρτωση...</div>
  </div>

  <!-- Loss trips banner (conditional) -->
  <div id="ceo-loss-banner-wrap"></div>

  <!-- Brand Promises -->
  <div class="ceo-section-label">${_ic('sparkles', 12)} Brand Promises — The 3 Numbers That Matter</div>
  <div class="ceo-brand-row">

    <!-- Speed -->
    <div class="ceo-brand-card speed">
      <div class="ceo-brand-head">
        <div class="ceo-brand-icon">${_ic('zap', 18)}</div>
        <div><div class="ceo-brand-label">Brand Promise 1</div><div class="ceo-brand-name">Speed Score — Faster to Shelf</div></div>
      </div>
      <div class="ceo-brand-body">
        <div class="ceo-gauge-ring" style="--g-color:#38BDF8;--g-deg:0deg">
          <div class="ceo-gauge-inner">
            <div class="ceo-brand-big" id="brand-speed-val">—</div>
          </div>
        </div>
        <div class="ceo-setup-badge">
          ${_ic('info', 14)}<span>Απαιτείται πεδίο <strong>Actual Delivery Date</strong> στον πίνακα ORDERS</span>
        </div>
        <div class="ceo-brand-sub" id="brand-speed-sub"></div>
      </div>
      <div class="ceo-target">Στόχος: ≥98%</div>
    </div>

    <!-- Quality -->
    <div class="ceo-brand-card quality">
      <div class="ceo-brand-head">
        <div class="ceo-brand-icon">${_ic('check_circle', 18)}</div>
        <div><div class="ceo-brand-label">Brand Promise 2</div><div class="ceo-brand-name">Quality Score — Verified Freshness</div></div>
      </div>
      <div class="ceo-brand-body">
        <div class="ceo-gauge-ring" style="--g-color:#34D399;--g-deg:0deg">
          <div class="ceo-gauge-inner">
            <div class="ceo-brand-big" id="brand-quality-val">—</div>
          </div>
        </div>
        <div class="ceo-setup-badge">
          ${_ic('info', 14)}<span>Απαιτείται πεδίο <strong>Temp Graph Sent</strong> στον πίνακα ORDERS</span>
        </div>
        <div class="ceo-brand-sub" id="brand-quality-sub"></div>
      </div>
      <div class="ceo-target">Στόχος: 100%</div>
    </div>

    <!-- Anxiety -->
    <div class="ceo-brand-card anxiety">
      <div class="ceo-brand-head">
        <div class="ceo-brand-icon">${_ic('shield', 18)}</div>
        <div><div class="ceo-brand-label">Brand Promise 3</div><div class="ceo-brand-name">Anxiety Score — Zero Anxiety Service</div></div>
      </div>
      <div class="ceo-brand-body">
        <div class="ceo-gauge-ring" style="--g-color:#3B82F6;--g-deg:0deg">
          <div class="ceo-gauge-inner">
            <div class="ceo-brand-big" id="brand-anxiety-val">—</div>
          </div>
        </div>
        <div class="ceo-brand-sub" id="brand-anxiety-sub"></div>
      </div>
      <div class="ceo-target">Στόχος: 0 κλήσεις / εβδομάδα</div>
      <div class="ceo-anxiety-entry">
        <label>Αυτή την εβδ.:</label>
        <input type="number" id="anxiety-input" min="0" max="99">
        <button onclick="_ceoSaveAnxiety()">Αποθήκευση</button>
      </div>
    </div>
  </div>

  <!-- Scaling Up Quadrants -->
  <div class="ceo-section-label" style="margin-top:var(--space-5)">${_ic('target', 12)} Scaling Up Framework</div>
  <div class="ceo-quadrants">

    <!-- Q1: People -->
    <div class="ceo-quad quad-people">
      <div class="ceo-quad-title">
        <span class="ceo-quad-icon">${_ic('users', 12)}</span>
        People — Ομάδα & Στόλος
      </div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num" id="people-util-val">—</div>
          <div class="ceo-kpi-label">Driver Utilization</div>
          <div class="ceo-kpi-sub" id="people-util-sub">Φόρτωση...</div>
          <div class="ceo-bar-track"><div class="ceo-bar-fill" id="people-util-bar" style="width:0%"></div></div>
        </div>
        <div style="text-align:right">
          <div class="ceo-kpi-num sm" id="people-avail-val">—</div>
          <div class="ceo-kpi-label">Διαθέσιμοι</div>
          <div class="ceo-kpi-sub" id="people-avail-sub"></div>
        </div>
      </div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num sm" id="people-partner-val">—</div>
          <div class="ceo-kpi-label">Partner Ratio</div>
          <div class="ceo-kpi-sub" id="people-partner-sub">Φόρτωση...</div>
          <div class="ceo-split-bar">
            <div class="ceo-split-seg owned" id="people-split-owned" style="width:0%"></div>
            <div class="ceo-split-seg partner" id="people-split-partner" style="width:0%"></div>
          </div>
          <div class="ceo-split-legend">
            <span class="ceo-split-legend-item"><span class="ceo-split-dot" style="background:var(--ceo-accent)"></span>Ιδιόκτητα</span>
            <span class="ceo-split-legend-item"><span class="ceo-split-dot" style="background:var(--ceo-warn)"></span>Partner</span>
          </div>
        </div>
      </div>

      <div style="margin-top:var(--space-3)">
        <div class="ceo-kpi-label">Workload Distribution</div>
        <div id="people-workload"></div>
      </div>
    </div>

    <!-- Q2: Strategy -->
    <div class="ceo-quad quad-strategy">
      <div class="ceo-quad-title">
        <span class="ceo-quad-icon">${_ic('trending_up', 12)}</span>
        Strategy — Ανάπτυξη & Θέση
      </div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            <div class="ceo-kpi-num" id="strat-revenue-val">—</div>
            <button style="background:none;border:none;cursor:pointer;color:var(--ceo-text-faint);padding:2px 6px;border-radius:var(--radius-sm);transition:color var(--duration-fast)" onmouseover="this.style.color='var(--ceo-accent)'" onmouseout="this.style.color='var(--ceo-text-faint)'" onclick="_ceoSetRevTarget()" title="Ορισμός στόχου">${_ic('edit', 12)}</button>
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
          <div class="ceo-spark-wrap" style="padding:var(--space-1) var(--space-3)">
            <span class="ceo-spark-label">8 εβδ.</span>
            <div id="strat-deadkm-spark" style="flex:1"></div>
          </div>
        </div>
      </div>

      <div style="margin-top:var(--space-3)">
        <div class="ceo-kpi-label">Top 5 Πελάτες (Revenue)</div>
        <table class="ceo-mini-table">
          <tbody id="strat-clients-body"><tr><td colspan="4" style="color:var(--ceo-text-dim);text-align:center;padding:var(--space-4)">Φόρτωση...</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- Q3: Execution -->
    <div class="ceo-quad quad-exec">
      <div class="ceo-quad-title">
        <span class="ceo-quad-icon">${_ic('activity', 12)}</span>
        Execution — Επιχειρησιακή Απόδοση
      </div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num" id="exec-ontime-val">—</div>
          <div class="ceo-kpi-label">On-Time Delivery</div>
          <div class="ceo-kpi-sub" id="exec-ontime-sub">Φόρτωση...</div>
          <div class="ceo-spark-wrap" style="padding:var(--space-1) var(--space-3)">
            <span class="ceo-spark-label">8 εβδ.</span>
            <div id="exec-ontime-spark" style="flex:1"></div>
          </div>
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
          <div class="ceo-kpi-label">Veroia Switch Usage</div>
          <div class="ceo-kpi-sub" id="exec-vs-sub">Φόρτωση...</div>
        </div>
        <div style="text-align:right">
          <div class="ceo-kpi-num sm" id="exec-assign-val">—</div>
          <div class="ceo-kpi-label">Assigned</div>
          <div class="ceo-kpi-sub" id="exec-assign-sub"></div>
        </div>
      </div>
    </div>

    <!-- Q4: Cash -->
    <div class="ceo-quad quad-cash">
      <div class="ceo-quad-title">
        <span class="ceo-quad-icon">${_ic('coins', 12)}</span>
        Cash — Χρηματοροές & Κόστος
      </div>

      <div class="ceo-kpi-row">
        <div style="flex:1">
          <div class="ceo-kpi-num" id="cash-revenue-val">—</div>
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
        <div style="text-align:right">
          <div class="ceo-kpi-num sm" id="cash-maint-val">—</div>
          <div class="ceo-kpi-label">Maintenance</div>
          <div class="ceo-kpi-sub" id="cash-maint-sub"></div>
        </div>
      </div>

      <div class="ceo-kpi-row">
        <div>
          <div class="ceo-kpi-num sm" id="cash-partner-val">—</div>
          <div class="ceo-kpi-label">Partner Margin</div>
          <div class="ceo-kpi-sub" id="cash-partner-sub">Φόρτωση...</div>
        </div>
      </div>

      <div style="margin-top:var(--space-3)">
        <div class="ceo-kpi-label">Top 3 Ζημιογόνες Διαδρομές</div>
        <table class="ceo-mini-table">
          <thead><tr>
            <th>Διαδρομή</th>
            <th style="text-align:right">Έσοδο</th>
            <th style="text-align:right">Κόστος</th>
            <th style="text-align:right">Ζημία</th>
          </tr></thead>
          <tbody id="cash-loss-body"><tr><td colspan="4" style="color:var(--ceo-text-dim);text-align:center;padding:var(--space-4)">Φόρτωση...</td></tr></tbody>
        </table>
      </div>
    </div>

  </div>

  <!-- Executive Briefing -->
  <div class="ceo-brief">
    <div class="ceo-brief-title">
      <span class="ceo-brief-title-icon">${_ic('brain', 14)}</span>
      Executive Briefing — Σύνοψη Περιόδου
    </div>
    <div id="ceo-brief-body">Φόρτωση...</div>
  </div>

</div>`;
  }

  // ── Expose globally ──────────────────────────────────────────
  window.renderCEODashboard = renderCEODashboard;
})();
