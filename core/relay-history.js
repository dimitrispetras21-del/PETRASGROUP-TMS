// ═══════════════════════════════════════════════════════════════
// ΙΣΤΟΡΙΚΟ ΤΟΠΙΚΩΝ ΚΙΝΗΣΕΩΝ ΟΔΗΓΟΥ (060 · OWNER-Q2 answered 4/10 (both:
// salary = track record only, per_trip = daily ΤΟΠΙΚΟ line))
//
// The owner pays some drivers a fixed monthly salary and others per trip, and
// wants «a track record for every driver, knowing what he did on those days».
// The track record IS the local_moves rows — one source (principle 3). No
// copy, no payroll line for a salaried driver: this file reads the moves and
// draws them, for the Drivers card (every role that sees drivers, dispatcher
// included) and for the driver's payroll card. So: NO amounts, ever.
//
// Read through the facade's LOCAL MOVES links block (Worker 060):
//   FIND("<driver rec>",ARRAYJOIN({Driver},","))>0, sorted by Date desc.
// ═══════════════════════════════════════════════════════════════
'use strict';

const LH_FIELDS = ['Date', 'Move Kind', 'Parent Order', 'Truck', 'Trailer', 'From Location', 'To Location', 'Time From', 'Status', 'Description'];

// → rows newest first: { id, date, kind, orderId, orderNo, truck, trailer, from, to, time, desc }.
// Throws on a failed read AND on a response without «Move Kind»: the column is
// NOT NULL, so its absence means the Worker map lacks the label (facade trap 1)
// and the rows cannot be told apart — the caller says «not loaded», never «none».
// A Cancelled move did not happen, so it is not part of what the driver did.
async function lhLoad(driverRecId) {
  // Plates and place names come from the shared reference cache. The Drivers
  // page can draw its card before the app's start-up preload has landed —
  // measured in the rig: every plate read «—» — so wait for it here (one
  // shared promise, a no-op once loaded).
  const [recs] = await Promise.all([atGetAll(TABLES.LOCAL_MOVES, {
    filterByFormula: `FIND("${driverRecId}",ARRAYJOIN({Driver},","))>0`,
    fields: LH_FIELDS, sort: [{ field: 'Date', direction: 'desc' }]
  }, false), typeof preloadReferenceData === 'function' ? preloadReferenceData() : null]);
  if (recs.some(r => (r.fields || {})['Move Kind'] === undefined)) throw new Error('LOCAL MOVES without «Move Kind» — Worker map not deployed');
  const live = recs.filter(r => r.fields['Status'] !== 'Cancelled');
  // The order number (Order No = the order's own id, owner 7/9) and its truck
  // — «ίδιο φορτηγό» means the order's tractor, so its plate is read live from
  // the order, never copied into the relay.
  const parents = [...new Set(live.map(r => getLinkedId(r.fields['Parent Order'])).filter(Boolean))];
  const ord = {};
  for (let b = 0; b < parents.length; b += 50) {
    const ff = `OR(${parents.slice(b, b + 50).map(id => `RECORD_ID()="${id}"`).join(',')})`;
    (await atGetAll(TABLES.ORDERS, { filterByFormula: ff, fields: ['Order No', 'Truck'] }, false))
      .forEach(o => { ord[o.id] = o.fields || {}; });
  }
  return live.map(r => {
    const f = r.fields, pid = getLinkedId(f['Parent Order']), o = pid ? (ord[pid] || {}) : {};
    return {
      id: r.id, date: f['Date'] ? String(f['Date']).slice(0, 10) : '', kind: f['Move Kind'],
      orderId: pid, orderNo: o['Order No'] != null ? String(o['Order No']) : '',
      ownTruck: getLinkedId(f['Truck']), orderTruck: getLinkedId(o['Truck']),
      trailer: getLinkedId(f['Trailer']), from: getLinkedId(f['From Location']), to: getLinkedId(f['To Location']),
      time: f['Time From'] ? String(f['Time From']) : '', desc: f['Description'] ? String(f['Description']) : ''
    };
  });
}

// One table, same words as Daily Ops and the payroll line: «παράδοση 415»,
// «ίδιο CB1284KE» / «άλλο …», «ρυμ. …». Plain local moves (Weekly National's
// errands, no order) read «τοπική κίνηση» with their own description.
function lhWhat(m) {
  if (m.kind === 'relay_delivery') return 'Παράδοση ' + (m.orderNo || '—');
  if (m.kind === 'relay_loading') return 'Φόρτωση ' + (m.orderNo || '—');
  return 'Τοπική κίνηση' + (m.desc ? ' · ' + escapeHtml(m.desc) : '');
}
function lhVehicle(m) {
  const plate = id => (id && typeof getTruckPlate === 'function' ? getTruckPlate(id) : '') || '';
  const trl = m.trailer && typeof getRefTrailers === 'function' ? (getRefTrailers().find(t => t.id === m.trailer) || { fields: {} }).fields['License Plate'] : '';
  const tractor = m.ownTruck ? 'άλλο ' + (plate(m.ownTruck) || '—')
    : (m.kind === 'local' ? '' : 'ίδιο' + (plate(m.orderTruck) ? ' ' + plate(m.orderTruck) : ' φορτηγό'));
  return [tractor, trl ? 'ρυμ. ' + escapeHtml(trl) : ''].filter(Boolean).join(' · ') || '—';
}
function lhPlace(m) {
  const L = id => (id && typeof getLocationName === 'function' ? getLocationName(id) : '');
  // A relay stores only the hand-over point (060 CHECK local_moves_relay_points):
  // delivery = where the local takes the truck over, loading = where he hands it on.
  if (m.kind === 'relay_delivery') return m.from ? 'από ' + L(m.from) : '—';
  if (m.kind === 'relay_loading') return m.to ? 'προς ' + L(m.to) : '—';
  return [L(m.from), L(m.to)].filter(Boolean).join(' → ') || '—';
}
function lhDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'][d.getDay()] + ' ' + iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4);
}
// rows → <table>. Classes only (lh-*), styled by the host page's tokens.
function lhTableHtml(rows) {
  return `<table class="lh-t"><thead><tr><th>Ημέρα</th><th>Κίνηση</th><th>Όχημα</th><th>Σημείο</th><th>Ώρα</th></tr></thead><tbody>${
    rows.map(m => `<tr data-lm="${escapeHtml(m.id)}"><td>${lhDate(m.date)}</td><td>${lhWhat(m)}</td><td>${lhVehicle(m)}</td><td>${lhPlace(m)}</td><td>${m.time ? escapeHtml(m.time) : '—'}</td></tr>`).join('')
  }</tbody></table>`;
}
// Narrow hosts (the Drivers side card, ~440px): two lines per move instead of
// five columns, which wrapped every cell onto four lines there.
function lhListHtml(rows) {
  return `<div class="lh-l">${rows.map(m => {
    const veh = lhVehicle(m), place = lhPlace(m);
    return `<div class="lh-i" data-lm="${escapeHtml(m.id)}"><div class="lh-a"><b>${lhWhat(m)}</b><span>${lhDate(m.date)}${m.time ? ' · ' + escapeHtml(m.time) : ''}</span></div>`
      + `<div class="lh-b">${[veh, place].filter(x => x && x !== '—').join(' · ') || '—'}</div></div>`;
  }).join('')}</div>`;
}
const LH_STYLE = `<style>
  .lh-i{padding:6px 0;border-bottom:1px solid var(--border)}
  .lh-i:last-child{border-bottom:0}
  .lh-a{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--text)}
  .lh-a b{font-weight:600}
  .lh-a span{font-size:12px;color:var(--text-dim);white-space:nowrap;font-variant-numeric:tabular-nums}
  .lh-b{font-size:12px;color:var(--text-mid)}
  .lh-t{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
  .lh-t th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-mid);padding:4px 8px;border-bottom:1px solid var(--border)}
  .lh-t td{padding:4px 8px;border-bottom:1px solid var(--border);color:var(--text)}
  .lh-t tr:last-child td{border-bottom:0}
</style>`;

if (typeof window !== 'undefined') { window.lhLoad = lhLoad; window.lhTableHtml = lhTableHtml; window.lhListHtml = lhListHtml; window.LH_STYLE = LH_STYLE; }
