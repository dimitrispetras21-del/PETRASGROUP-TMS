// Pure helpers for GET /costs/ledger?month=YYYY-MM (Μισθοδοσία v3, αρχική με
// κάρτες — Figma 614/616:1011). Lives outside index.js so it can be tested
// with node:test without a Worker runtime, like ledger-rules.mjs.

const MONTH_RE = /^(\d{4})-(\d{2})$/;

// month "YYYY-MM" -> { from: 'YYYY-MM-01', to: 'YYYY-MM-<last day>' } for a
// PostgREST entry_date range (two filters: gte.from, lte.to — one filter per
// param.append call, as the Worker's existing ?year= param already does).
export function monthRange(month) {
  const m = MONTH_RE.exec(month || '');
  if (!m) return { error: 'month must be YYYY-MM' };
  const [, yearStr, monStr] = m;
  const mon = Number(monStr);
  if (mon < 1 || mon > 12) return { error: 'month must be YYYY-MM' };
  // Day 0 of the following month is the last day of this one (handles Feb/leap years).
  const lastDay = new Date(Date.UTC(Number(yearStr), mon, 0)).getUTCDate();
  return { from: `${yearStr}-${monStr}-01`, to: `${yearStr}-${monStr}-${String(lastDay).padStart(2, '0')}` };
}

function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// null/undefined -> 0, numeric string (PostgREST numeric columns) -> number.
function num(v) {
  return v == null ? 0 : Number(v);
}

// dl_v_entries rows for one month -> { [driver_id]: { trips, pending, value,
// expenses, advance, payments, adjustments, last_payment } }. Filters
// cancelled/deleted rows itself — correct even if the caller's query forgets
// the filter (CLAUDE.md αρχή 3: don't rely on a second copy of the same rule).
export function aggregateMonth(rows) {
  const out = {};
  for (const r of rows || []) {
    if (r.cancelled === true || r.deleted_at != null) continue;
    const driverId = r.driver_id;
    if (driverId == null) continue;
    if (!out[driverId]) {
      out[driverId] = { trips: 0, pending: 0, value: 0, expenses: 0, advance: 0, payments: 0, adjustments: 0, last_payment: null };
    }
    const d = out[driverId];
    if (r.entry_type === 'trip') {
      d.trips += 1;
      // pending: a trip with no value yet — trust the view's flag, but also
      // recheck trip_value directly in case a raw dl_entries row (no `pending`
      // column) is ever passed in.
      if (r.pending === true || r.trip_value == null) d.pending += 1;
      d.value += num(r.trip_value);
      d.expenses += num(r.expenses);
      d.advance += num(r.advance);
    } else if (r.entry_type === 'payment_bank' || r.entry_type === 'payment_cash') {
      d.payments += num(r.amount);
      const isLater = !d.last_payment
        || r.entry_date > d.last_payment.date
        || (r.entry_date === d.last_payment.date && Number(r.id) > d.last_payment._id);
      if (isLater) d.last_payment = { date: r.entry_date, type: r.entry_type, amount: num(r.amount), _id: Number(r.id) };
    } else if (r.entry_type === 'adjustment') {
      d.adjustments += num(r.amount);
    }
  }
  for (const d of Object.values(out)) {
    d.value = round2(d.value);
    d.expenses = round2(d.expenses);
    d.advance = round2(d.advance);
    d.payments = round2(d.payments);
    d.adjustments = round2(d.adjustments);
    if (d.last_payment) {
      d.last_payment.amount = round2(d.last_payment.amount);
      delete d.last_payment._id;
    }
  }
  return out;
}
