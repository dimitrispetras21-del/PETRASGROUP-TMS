import { test } from 'node:test';
import assert from 'node:assert';
import { monthRange, aggregateMonth } from '../src/ledger-month.mjs';

test('monthRange: last day of month, including leap years', () => {
  assert.deepStrictEqual(monthRange('2026-09'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepStrictEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepStrictEqual(monthRange('2024-02'), { from: '2024-02-01', to: '2024-02-29' });
});

test('monthRange: rejects an out-of-range month and a malformed string', () => {
  assert.match(monthRange('2026-13').error, /month/);
  assert.match(monthRange('abc').error, /month/);
  assert.match(monthRange('').error, /month/);
  assert.match(monthRange(undefined).error, /month/);
});

test('aggregateMonth: trips, pending, payments, adjustments per driver + last_payment', () => {
  const rows = [
    // driver 46: a valued trip, a pending trip, a bank payment, a cash payment, a negative adjustment
    { id: 1, driver_id: 46, entry_type: 'trip', entry_date: '2026-09-03', trip_value: '850.50', advance: '100', expenses: '20.25', pending: false, cancelled: false },
    { id: 2, driver_id: 46, entry_type: 'trip', entry_date: '2026-09-10', trip_value: null, advance: null, expenses: null, pending: true, cancelled: false },
    { id: 3, driver_id: 46, entry_type: 'payment_bank', entry_date: '2026-09-05', amount: '400', cancelled: false },
    { id: 4, driver_id: 46, entry_type: 'payment_cash', entry_date: '2026-09-12', amount: '150.75', cancelled: false },
    { id: 5, driver_id: 46, entry_type: 'adjustment', entry_date: '2026-09-06', amount: '-25.50', cancelled: false },
    // a cancelled trip for driver 46 must not count at all
    { id: 6, driver_id: 46, entry_type: 'trip', entry_date: '2026-09-08', trip_value: '999', pending: false, cancelled: true },
    // driver 90: one trip only, no payments this month
    { id: 7, driver_id: 90, entry_type: 'trip', entry_date: '2026-09-01', trip_value: '500', advance: '0', expenses: '10', pending: false, cancelled: false },
    // a deleted_at row (no `cancelled` column, as a raw dl_entries row would look) must also be excluded
    { id: 8, driver_id: 90, entry_type: 'payment_cash', entry_date: '2026-09-20', amount: '300', deleted_at: '2026-09-21T00:00:00Z' }
  ];

  const out = aggregateMonth(rows);

  assert.deepStrictEqual(out[46], {
    trips: 2,
    pending: 1,
    value: 850.50,
    expenses: 20.25,
    advance: 100,
    payments: 550.75,
    adjustments: -25.50,
    last_payment: { date: '2026-09-12', type: 'payment_cash', amount: 150.75 }
  });

  assert.deepStrictEqual(out[90], {
    trips: 1,
    pending: 0,
    value: 500,
    expenses: 10,
    advance: 0,
    payments: 0,
    adjustments: 0,
    last_payment: null
  });
});

test('aggregateMonth: last_payment tie-break by id when same date', () => {
  const rows = [
    { id: 10, driver_id: 5, entry_type: 'payment_bank', entry_date: '2026-09-15', amount: '100', cancelled: false },
    { id: 11, driver_id: 5, entry_type: 'payment_cash', entry_date: '2026-09-15', amount: '200', cancelled: false }
  ];
  assert.strictEqual(aggregateMonth(rows)[5].last_payment.type, 'payment_cash');
  assert.strictEqual(aggregateMonth(rows)[5].last_payment.amount, 200);
});

test('aggregateMonth: empty input yields an empty object', () => {
  assert.deepStrictEqual(aggregateMonth([]), {});
  assert.deepStrictEqual(aggregateMonth(undefined), {});
});
