// ═══════════════════════════════════════════════════════════════
// PROACTIVE PULSE PROTOCOL — In-app reminders panel
// 3 Stages:
//   1. Mission Start    → notify driver when truck assigned for next-day load
//   2. Pre-Alert        → notify client 24h before delivery (Status='In Transit')
//   3. Fresh-Check Close → confirm delivery performance after delivery
//
// Tracking via existing fields (no new Airtable fields required):
//   - Driver Notified (checkbox) — Mission Start sent
//   - Client Notified (checkbox) — Pre-Alert sent
//   - Delivery Performance (singleSelect) — Fresh-Check completed
// ═══════════════════════════════════════════════════════════════
(function() {
'use strict';

const PULSE = { orders: [], clients: [], drivers: [], trucks: [], stopsByOrder: {} };

async function renderPulse() {
  const c = document.getElementById('content');
  document.getElementById('topbarTitle').textContent = 'Proactive Pulse';
  c.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:80px;color:var(--text-dim)">
    <div class="spinner"></div> Loading pulse data…</div>`;

  try { await _pulseLoad(); _pulseDraw(); }
  catch(e) { c.innerHTML = `<div style="color:var(--danger);padding:40px">Error: ${e.message}</div>`; console.error(e); }
}

async function _pulseLoad() {
  await preloadReferenceData();
  PULSE.clients = getRefClients();
  PULSE.drivers = getRefDrivers();
  PULSE.trucks = getRefTrucks();
  PULSE.locs = getRefLocations();

  const today = localToday();
  const tmrw = localTomorrow();
  const yest = toLocalDate(new Date(Date.now() - 86400000));
  // Pull orders that could need pulse action: loading today/tomorrow OR delivery today/tomorrow OR delivered today/yesterday
  const filter = `OR(
    IS_SAME({Loading DateTime},'${today}','day'),
    IS_SAME({Loading DateTime},'${tmrw}','day'),
    IS_SAME({Delivery DateTime},'${today}','day'),
    IS_SAME({Delivery DateTime},'${tmrw}','day'),
    AND(IS_SAME({Actual Delivery Date},'${today}','day'),{Status}='Delivered'),
    AND(IS_SAME({Actual Delivery Date},'${yest}','day'),{Status}='Delivered')
  )`.replace(/\s+/g,' ');

  PULSE.orders = await atGetAll(TABLES.ORDERS, {
    filterByFormula: filter,
    fields: ['Direction','Client','Status','Loading DateTime','Delivery DateTime',
             'Driver','Driver Notified','Client Notified','Delivery Performance',
             'Actual Delivery Date','Total Pallets','Truck','ORDER STOPS'],
  }, false);

  // Batch fetch ORDER_STOPS for route display
  const stopIds = PULSE.orders.flatMap(r => r.fields['ORDER STOPS'] || []);
  PULSE.stopsByOrder = {};
  if (stopIds.length) {
    try {
      for (let b = 0; b < stopIds.length; b += 90) {
        const batch = stopIds.slice(b, b + 90);
        const ff = `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(',')})`;
        const recs = await atGetAll(TABLES.ORDER_STOPS, { filterByFormula: ff }, false);
        recs.forEach(sr => {
          const pid = (sr.fields[F.STOP_PARENT_ORDER] || [])[0];
          if (pid) { if (!PULSE.stopsByOrder[pid]) PULSE.stopsByOrder[pid] = []; PULSE.stopsByOrder[pid].push(sr); }
        });
      }
    } catch(e) { console.warn('Pulse ORDER_STOPS fetch:', e); }
  }
}

function _pulseStopLoc(orderId, stopType) {
  const stops = (PULSE.stopsByOrder || {})[orderId];
  if (!stops) return null;
  const filtered = stops.filter(s => s.fields[F.STOP_TYPE] === stopType)
    .sort((a,b) => (a.fields[F.STOP_NUMBER]||0) - (b.fields[F.STOP_NUMBER]||0));
  return filtered.length ? (filtered[0].fields[F.STOP_LOCATION] || [])[0] || null : null;
}

function _pulseRoute(orderId) {
  const loadId = _pulseStopLoc(orderId, 'Loading');
  const delId = _pulseStopLoc(orderId, 'Unloading');
  return `${getLocationName(loadId) || '—'} → ${getLocationName(delId) || '—'}`;
}

function _pulseClient(f) {
  const cid = getLinkId(f['Client']);
  return getClientName(cid) || '—';
}

function _pulseClientPhone(f) {
  const cid = getLinkId(f['Client']);
  const cl = PULSE.clients.find(c => c.id === cid);
  return cl?.fields?.['Phone'] || '';
}

function _pulseDriverPhone(f) {
  const did = getLinkId(f['Driver']);
  const dr = PULSE.drivers.find(d => d.id === did);
  return dr?.fields?.['Phone'] || '';
}

function _pulseFmtTime(dt) {
  if (!dt) return '—';
  const s = String(dt);
  if (s.includes('T')) return s.split('T')[1].substring(0,5);
  return s;
}

function _pulseFmtDate(d) {
  if (!d) return '—';
  const ds = String(d).slice(0,10);
  const t = ds === localToday() ? 'Σήμερα' : ds === localTomorrow() ? 'Αύριο' : ds.split('-').reverse().join('/');
  return t;
}

/* ── COMPUTE: bucket orders into 3 pulse stages ─────────── */
function _pulseBuckets() {
  const today = localToday();
  const tmrw = localTomorrow();
  const yest = toLocalDate(new Date(Date.now() - 86400000));

  const missionStart = [];
  const preAlert = [];
  const freshCheck = [];

  for (const r of PULSE.orders) {
    const f = r.fields;
    const loadDt = toLocalDate(f['Loading DateTime']);
    const delDt = toLocalDate(f['Delivery DateTime']);
    const actualDel = toLocalDate(f['Actual Delivery Date']);
    const status = f['Status'] || '';
    const driverNotified = !!f['Driver Notified'];
    const clientNotified = !!f['Client Notified'];
    const perf = f['Delivery Performance'];
    const hasTruck = !!getLinkId(f['Truck']);

    // 1. Mission Start: truck assigned + loading today/tomorrow + driver not yet notified
    if (hasTruck && (loadDt === today || loadDt === tmrw) && !driverNotified
        && status !== 'Delivered' && status !== 'Invoiced' && status !== 'Cancelled') {
      missionStart.push(r);
    }

    // 2. Pre-Alert: in transit + delivery today/tomorrow + client not yet notified
    if ((status === 'In Transit' || status === 'Assigned')
        && (delDt === today || delDt === tmrw)
        && !clientNotified) {
      preAlert.push(r);
    }

    // 3. Fresh-Check Close: delivered today/yesterday with no performance set
    if (status === 'Delivered' && !perf
        && (actualDel === today || actualDel === yest || delDt === today || delDt === yest)) {
      freshCheck.push(r);
    }
  }

  // Sort each by datetime
  missionStart.sort((a,b) => (a.fields['Loading DateTime']||'').localeCompare(b.fields['Loading DateTime']||''));
  preAlert.sort((a,b) => (a.fields['Delivery DateTime']||'').localeCompare(b.fields['Delivery DateTime']||''));
  freshCheck.sort((a,b) => (a.fields['Actual Delivery Date']||a.fields['Delivery DateTime']||'').localeCompare(b.fields['Actual Delivery Date']||b.fields['Delivery DateTime']||''));

  return { missionStart, preAlert, freshCheck };
}

/* ── DRAW ────────────────────────────────────────────────── */
function _pulseDraw() {
  const b = _pulseBuckets();
  const total = b.missionStart.length + b.preAlert.length + b.freshCheck.length;

  document.getElementById('content').innerHTML = `
    <div class="page-header" style="margin-bottom:12px">
      <div>
        <div class="page-title">Proactive Pulse</div>
        <div class="page-sub">${total} pending action${total===1?'':'s'} · 3-stage client communication protocol</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" onclick="renderPulse()">Refresh</button>
      </div>
    </div>

    <div class="pulse-grid">
      ${_pulseSection('mission', '🚚 Mission Start', b.missionStart, 'Driver notification — truck assigned')}
      ${_pulseSection('alert', '⏰ Pre-Alert (24h)', b.preAlert, 'Client notification — delivery upcoming')}
      ${_pulseSection('check', '✅ Fresh-Check Close', b.freshCheck, 'Confirm delivery performance')}
    </div>
  `;
}

function _pulseSection(type, title, items, sub) {
  const empty = `<div class="pulse-empty">Όλα ✓ — δεν υπάρχουν εκκρεμότητες</div>`;
  const rows = items.length ? items.map(r => _pulseRow(r, type)).join('') : empty;
  const accent = type === 'mission' ? '#0284C7' : type === 'alert' ? '#D97706' : '#059669';

  return `<div class="pulse-card">
    <div class="pulse-card-head" style="border-left:3px solid ${accent}">
      <div>
        <div class="pulse-card-title">${title}</div>
        <div class="pulse-card-sub">${sub}</div>
      </div>
      <div class="pulse-card-count" style="background:${accent}">${items.length}</div>
    </div>
    <div class="pulse-card-body">${rows}</div>
  </div>`;
}

function _pulseRow(r, type) {
  const f = r.fields;
  const id = r.id;
  const client = escapeHtml(_pulseClient(f));
  const route = escapeHtml(_pulseRoute(id));
  const pal = f['Total Pallets'] || '';

  let dateLine = '', actionBtn = '', contactInfo = '';
  if (type === 'mission') {
    const dt = f['Loading DateTime'];
    dateLine = `<span style="color:var(--text-dim)">Loading:</span> ${_pulseFmtDate(toLocalDate(dt))} ${_pulseFmtTime(dt)}`;
    const phone = _pulseDriverPhone(f);
    contactInfo = phone ? `<a href="tel:${phone}" style="color:var(--accent);text-decoration:none;font-size:11px">📞 ${escapeHtml(phone)}</a>` : '';
    actionBtn = `<button class="btn btn-primary" style="padding:5px 12px;font-size:11px" onclick="_pulseMark('${id}','Driver Notified')">Mark Sent ✓</button>`;
  } else if (type === 'alert') {
    const dt = f['Delivery DateTime'];
    dateLine = `<span style="color:var(--text-dim)">Delivery:</span> ${_pulseFmtDate(toLocalDate(dt))} ${_pulseFmtTime(dt)}`;
    const phone = _pulseClientPhone(f);
    contactInfo = phone ? `<a href="tel:${phone}" style="color:var(--accent);text-decoration:none;font-size:11px">📞 ${escapeHtml(phone)}</a>` : '';
    actionBtn = `<button class="btn btn-primary" style="padding:5px 12px;font-size:11px" onclick="_pulseMark('${id}','Client Notified')">Mark Sent ✓</button>`;
  } else {
    const dt = f['Actual Delivery Date'] || f['Delivery DateTime'];
    dateLine = `<span style="color:var(--text-dim)">Delivered:</span> ${_pulseFmtDate(toLocalDate(dt))}`;
    const phone = _pulseClientPhone(f);
    contactInfo = phone ? `<a href="tel:${phone}" style="color:var(--accent);text-decoration:none;font-size:11px">📞 ${escapeHtml(phone)}</a>` : '';
    actionBtn = `<button class="btn btn-success" style="padding:5px 10px;font-size:11px" onclick="_pulsePerf('${id}','On Time')">On Time ✓</button>
                 <button class="btn btn-danger" style="padding:5px 10px;font-size:11px;margin-left:4px" onclick="_pulsePerf('${id}','Delayed')">Delayed</button>`;
  }

  return `<div class="pulse-row">
    <div class="pulse-row-main">
      <div class="pulse-row-client">${client}${pal?` <span style="color:var(--text-dim);font-size:11px">· ${pal} pal</span>`:''}</div>
      <div class="pulse-row-route">${route}</div>
      <div class="pulse-row-meta">${dateLine}${contactInfo?` · ${contactInfo}`:''}</div>
    </div>
    <div class="pulse-row-actions">${actionBtn}</div>
  </div>`;
}

/* ── ACTIONS ─────────────────────────────────────────────── */
async function _pulseMark(id, fieldName) {
  try {
    await atSafePatch(TABLES.ORDERS, id, { [fieldName]: true });
    invalidateCache(TABLES.ORDERS);
    const r = PULSE.orders.find(x => x.id === id);
    if (r) r.fields[fieldName] = true;
    toast('✓ Notified', 'success');
    _pulseDraw();
  } catch(e) { toast('Error', 'danger'); }
}

async function _pulsePerf(id, perf) {
  try {
    const today = localToday();
    await atSafePatch(TABLES.ORDERS, id, {
      'Delivery Performance': perf,
      'Actual Delivery Date': today,
    });
    invalidateCache(TABLES.ORDERS);
    const r = PULSE.orders.find(x => x.id === id);
    if (r) {
      r.fields['Delivery Performance'] = perf;
      r.fields['Actual Delivery Date'] = today;
    }
    toast(perf === 'On Time' ? '✓ On Time' : '✗ Delayed', perf === 'On Time' ? 'success' : 'danger');
    _pulseDraw();
  } catch(e) { toast('Error', 'danger'); }
}

window.renderPulse = renderPulse;
window._pulseMark = _pulseMark;
window._pulsePerf = _pulsePerf;
})();
