import { test } from 'node:test';
import assert from 'node:assert';
import { validateNewEntry, validatePatch } from '../src/ledger-rules.mjs';

test('trip: value/advance/expenses optional (pending), amount forbidden', () => {
  const r = validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', date_end: '2026-08-17', route: 'ΒΕΡΟΙΑ-ΠΟΛΩΝΙΑ-ΒΕΡΟΙΑ' });
  assert.deepStrictEqual(r, { row: { driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', date_end: '2026-08-17', route: 'ΒΕΡΟΙΑ-ΠΟΛΩΝΙΑ-ΒΕΡΟΙΑ', source: 'manual' } });
  assert.match(validateNewEntry({ driver_id: 46, entry_type: 'trip', entry_date: '2026-08-10', amount: 5 }).error, /amount/);
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
