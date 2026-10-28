// ═══════════════════════════════════════════════════════════════════════════
// ORDER QUICK EDIT — the accountant's «Διόρθωση» on an order card
//
// Owner 20/10/2026 (option A): Eirini and Alexia correct an order and fill its
// price WITHOUT the full order form. The full form can write stops, national
// loads, groupage and ramp on save; the Worker gives the accountant only
// GET+PATCH on orders/national_orders/order_stops and nothing on the others,
// so a full save would write the order and then 403 half-way — half a
// cascade nobody sees. These five fields live on the order row itself and
// nothing in the browser cascades from them (the date triggers in the base
// move what follows), so ONE PATCH either lands whole or not at all.
// Stops, Veroia Switch, groupage and pallets stay with the full form.
// ═══════════════════════════════════════════════════════════════════════════
const OrderQuickEdit = (() => {
  'use strict';

  // Same labels in ORDERS and NATIONAL ORDERS (Worker TABLES map, checked 20/10).
  const FIELDS = [
    { key: 'Price', label: 'Τιμή €', type: 'number' },
    { key: 'Reference', label: 'Αναφορά πελάτη', type: 'text' },
    { key: 'Loading DateTime', label: 'Ημ. φόρτωσης', type: 'date' },
    { key: 'Delivery DateTime', label: 'Ημ. παράδοσης', type: 'date' },
    { key: 'Notes', label: 'Σημειώσεις', type: 'textarea' },
  ];
  let S = null;   // { table, rec, onSaved }

  // Only where the full form is NOT offered: a role with 'orders' full keeps it.
  const allowed = () => typeof ROLE !== 'undefined' && ROLE === 'accountant'
    && typeof can === 'function' && can('orders') !== 'full';

  const ymd = v => (v ? String(v).slice(0, 10) : '');
  const cur = (f, k) => (k.endsWith('DateTime') ? ymd(f[k]) : f[k] == null ? '' : String(f[k]));
  const idOf = k => 'oqe-' + k.replace(/\W+/g, '-');
  // An invoiced order's price is the ERP invoice's amount: changing it here
  // would split the TMS from the issued invoice with no warning (the base lets
  // it through, the number is there). Price is locked; the rest stays open.
  const invoiced = f => !!(f && (f['Invoiced'] === true || (typeof OrdersCommon !== 'undefined' && OrdersCommon.isInvoiced && OrdersCommon.isInvoiced(f))));
  const locked = (f, k) => k === 'Price' && invoiced(f);

  function open(table, rec, onSaved) {
    if (!allowed()) return;
    S = { table, rec, onSaved };
    const f = rec.fields || {};
    const body = FIELDS.map(x => {
      const v = escapeHtml(cur(f, x.key)), id = idOf(x.key);
      const input = x.type === 'textarea'
        ? `<textarea class="form-input" id="${id}" rows="3">${v}</textarea>`
        : `<input class="form-input" id="${id}" type="${x.type}"${x.type === 'number' ? ' min="0" step="0.01"' : ''}${locked(f, x.key) ? ' disabled' : ''} value="${v}">`;
      const why = locked(f, x.key) ? '<div class="oi-note">Τιμολογημένη — η τιμή είναι του τιμολογίου ERP και δεν αλλάζει από εδώ.</div>' : '';
      return `<div class="form-field"><label class="form-label" for="${id}">${x.label}</label>${input}${why}</div>`;
    }).join('')
      + '<div class="oi-note">Στάσεις, Veroia Switch, groupage και παλέτες αλλάζουν από τον dispatcher.</div>'
      + '<div id="oqe-err" class="oiv-bad" role="alert"></div>';
    openModal('Διόρθωση παραγγελίας', body,
      '<button type="button" class="btn btn-ghost" onclick="closeModal()">Άκυρο</button>'
      + '<button type="button" class="btn btn-primary" id="oqe-save" onclick="OrderQuickEdit.save()">Αποθήκευση</button>');
  }

  // Only changed fields go out: an untouched field is never re-written.
  function changes(f, read) {
    const out = {};
    for (const x of FIELDS) {
      if (locked(f, x.key)) continue;
      const v = String(read(x.key) || '').trim();
      if (v === cur(f, x.key)) continue;
      out[x.key] = v === '' ? null : x.type === 'number' ? Number(v) : v;
    }
    return out;
  }

  async function save() {
    if (!S || !allowed()) return;
    const err = document.getElementById('oqe-err'), btn = document.getElementById('oqe-save');
    const fields = changes(S.rec.fields || {}, k => (document.getElementById(idOf(k)) || {}).value);
    if ('Price' in fields && fields.Price !== null && !(fields.Price >= 0)) { err.textContent = 'Η τιμή δεν είναι αριθμός'; return; }
    if (!Object.keys(fields).length) { closeModal(); return; }
    btn.disabled = true; btn.textContent = 'Αποθήκευση…'; err.textContent = '';
    // F5 Ε16 / Q-10: on a national order after day L the accountant keeps the price only (Invoiced and the
    // invoice number are not in this form); the Worker refuses the rest, so it is said here first.
    if (typeof PlanConfig !== 'undefined' && PlanConfig.isLegacyTable(S.table) && Object.keys(fields).some(k => k !== 'Price')) {
      const pc = await PlanConfig.load({ fresh: true });
      if (pc.state !== 'before') {
        btn.disabled = false; btn.textContent = 'Αποθήκευση';
        err.textContent = PlanConfig.LEGACY_TEXT[pc.state] + ' (εδώ μόνο η τιμή)';
        return;
      }
    }
    try {
      await atPatch(S.table, S.rec.id, fields);
    } catch (e) {
      // The Worker/base refusal stays in the form, where she is looking — never
      // a green toast on a failed write (core/api.js already raised the red one).
      btn.disabled = false; btn.textContent = 'Αποθήκευση';
      err.textContent = (e && e.message) || 'Η αποθήκευση απέτυχε';
      return;
    }
    Object.assign(S.rec.fields, fields);
    if (typeof invalidateCache === 'function') invalidateCache(S.table);
    if (typeof OrdersData !== 'undefined' && OrdersData.invalidate) OrdersData.invalidate();
    if (typeof OrdersHub !== 'undefined' && OrdersHub.refreshBadges) OrdersHub.refreshBadges();
    const done = S; S = null;
    closeModal();
    toast('Η παραγγελία αποθηκεύτηκε');
    if (typeof done.onSaved === 'function') done.onSaved(done.rec);
  }

  return { can: allowed, open, save, changes, FIELDS };
})();
if (typeof module !== 'undefined') module.exports = OrderQuickEdit;
