import { test } from 'node:test';
import assert from 'node:assert';
import { validateNewEntry, validatePatch, localLineLockError, DL_FIELDS } from '../src/ledger-rules.mjs';

test('trip: value/advance/expenses optional (pending), amount forbidden', () => {
  const r = validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', date_end: '2026-08-17', route: 'ΒΕΡΟΙΑ-ΠΟΛΩΝΙΑ-ΒΕΡΟΙΑ' });
  assert.deepStrictEqual(r, { row: { driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', date_end: '2026-08-17', route: 'ΒΕΡΟΙΑ-ΠΟΛΩΝΙΑ-ΒΕΡΟΙΑ', source: 'manual' } });
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', amount: 5 }).error, /amount/);
});

test('trip: route or rt_id required — a bare trip is unidentifiable in the ledger', () => {
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10' }).error, /route or rt_id/);
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', route: '   ' }).error, /route or rt_id/);
  assert.deepStrictEqual(validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', rt_id: 7 }),
    { row: { driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', rt_id: 7, source: 'manual' } });
});

test('payment: amount > 0 required, trip fields forbidden', () => {
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'payment_cash', entry_date: '2026-07-31' }).error, /amount/);
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'payment_bank', entry_date: '2026-07-31', amount: 950.47, trip_value: 1 }).error, /trip_value/);
  assert.deepStrictEqual(validateNewEntry({ driver_id: 46, entry_type: 'payment_bank', entry_date: '2026-07-31', amount: 950.47 }),
    { row: { driver_id: 46, entry_type: 'payment_bank', entry_date: '2026-07-31', amount: 950.47, source: 'manual' } });
});

test('unknown field is named in the error, never dropped silently', () => {
  const r = validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', salary: 100 });
  assert.match(r.error, /salary/);
});

test('bad type / bad date / date_end before start', () => {
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'bonus', entry_date: '2026-08-10' }).error, /entry_type/);
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '10/08/2026' }).error, /entry_date/);
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', date_end: '2026-08-01' }).error, /date_end/);
});

test('patch: filling an empty value needs no reason; changing a written one does', () => {
  const before = { entry_type: 'trip', trip_value: null, advance: 300, expenses: null };
  assert.deepStrictEqual(validatePatch({ trip_value: 800 }, before), { patch: { trip_value: 800 }, needsReason: false });
  assert.deepStrictEqual(validatePatch({ advance: 200 }, before), { patch: { advance: 200 }, needsReason: true });
  assert.match(validatePatch({ amount: 5 }, before).error, /amount/);
});

test('patch: cancel needs a reason; review clear needs a reason', () => {
  const before = { entry_type: 'trip', trip_value: 800 };
  assert.match(validatePatch({ cancel: true }, before).error, /reason/);
  const c = validatePatch({ cancel: true, reason: 'διπλή καταχώρηση' }, before);
  assert.strictEqual(c.patch.deleted_reason, 'διπλή καταχώρηση');
  assert.ok(c.patch.deleted_at);
  assert.deepStrictEqual(validatePatch({ needs_review: false, reason: 'ελέγχθηκε' }, before).patch, { needs_review: false, review_note: 'ελέγχθηκε' });
});

// --- review round 1 fixes below ---

test('patch: date pair re-checked after merging with before', () => {
  const before = { entry_type: 'trip', entry_date: '2026-08-10', date_end: '2026-08-17' };
  assert.match(validatePatch({ date_end: '2026-08-05' }, before).error, /date_end/);
  assert.match(validatePatch({ entry_date: '2026-08-20' }, before).error, /date_end/);
});

test('patch: per-type amount invariant (payment > 0, adjustment != 0)', () => {
  assert.match(validatePatch({ amount: 0 }, { entry_type: 'payment_bank', amount: 950.47 }).error, /amount/);
  assert.deepStrictEqual(validatePatch({ amount: -50 }, { entry_type: 'adjustment', amount: 20 }),
    { patch: { amount: -50 }, needsReason: true });
});

test('patch: rt_id must be an integer or null', () => {
  const before = { entry_type: 'trip', rt_id: null };
  assert.match(validatePatch({ rt_id: 'abc' }, before).error, /rt_id/);
});

test('patch: cancel / needs_review clear reject extra fields', () => {
  const before = { entry_type: 'trip', trip_value: 800 };
  assert.deepStrictEqual(validatePatch({ cancel: true, reason: 'x', trip_value: 500 }, before),
    { error: 'cancel cannot be combined with other fields: trip_value' });
  assert.match(validatePatch({ needs_review: false, reason: 'x', trip_value: 500 }, before).error,
    /needs_review cannot be combined with other fields: trip_value/);
});

test('patch: editing note never needs a reason (spec exempts notes, not amounts/dates)', () => {
  const before = { entry_type: 'trip', note: 'old' };
  assert.deepStrictEqual(validatePatch({ note: 'new' }, before), { patch: { note: 'new' }, needsReason: false });
});

test('adjustment creation: negative amount allowed, zero rejected', () => {
  assert.deepStrictEqual(
    validateNewEntry({ driver_id: 46, entry_type: 'adjustment', entry_date: '2026-08-10', amount: -25.5 }),
    { row: { driver_id: 46, entry_type: 'adjustment', entry_date: '2026-08-10', amount: -25.5, source: 'manual' } });
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'adjustment', entry_date: '2026-08-10', amount: 0 }).error, /amount/);
});

// 060 local relays (owner 4/10/2026): the local driver's day line belongs to
// the system — money, note and review flag only.
const localLine = { id: 50, entry_type: 'trip', local_move_id: 7, rt_id: null, entry_date: '2026-10-05', trip_value: null, deleted_at: null };
test('local line: cancel, restore, day, route, RT are refused and named', () => {
  for (const body of [
    { cancel: true, reason: 'x' }, { restore: true, reason: 'x' }, { entry_date: '2026-10-06' },
    { date_end: '2026-10-06' }, { route: 'κάτι' }, { rt_id: 5 }, { trip_value: 1, rt_id: 5 }
  ]) {
    const err = localLineLockError(body, localLine);
    assert.ok(err, JSON.stringify(body) + ' must be refused');
    assert.match(err, /την κρατά το σύστημα/);
    for (const k of Object.keys(body).filter(k => !['trip_value', 'reason'].includes(k))) assert.ok(err.includes(k), k + ' named');
  }
});
test('local line: amounts («Αξία 0»), note and clearing review pass this guard', () => {
  for (const body of [
    { trip_value: 0 }, { trip_value: 1, reason: 'διόρθωση' }, { advance: 1 }, { expenses: 1 },
    { note: 'πλήρωσε διόδια' }, { needs_review: false, reason: 'ελέγχθηκε' }
  ]) assert.strictEqual(localLineLockError(body, localLine), null, JSON.stringify(body));
  // and validatePatch still applies its own rules after the guard
  assert.ok(validatePatch({ trip_value: 0 }, localLine).patch);
});
test('ordinary lines are not touched by the local-line guard', () => {
  const rtLine = { id: 51, entry_type: 'trip', local_move_id: null, rt_id: 9 };
  assert.strictEqual(localLineLockError({ cancel: true, reason: 'x' }, rtLine), null);
  assert.strictEqual(localLineLockError({ rt_id: 3 }, { id: 52, entry_type: 'trip', rt_id: null }), null);
});
test('local_move_id is never writable through /costs/ledger (DL_FIELDS unchanged)', () => {
  assert.ok(!DL_FIELDS.includes('local_move_id'));
  assert.match(validateNewEntry({ driver_id: 1, entry_type: 'trip', entry_date: '2026-10-05', route: 'x', local_move_id: 3 }).error, /local_move_id/);
  assert.match(validatePatch({ local_move_id: 3 }, { entry_type: 'trip' }).error, /local_move_id/);
});
