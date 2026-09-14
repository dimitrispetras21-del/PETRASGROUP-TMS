// tests/payroll-format.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { dlEur, dlBalanceWord, dlDelta, dlTypeLabel, dlDateRange, dlMoney } = require('../modules/payroll.js');

test('unknown is not zero: null/undefined render as a dash, real zero as 0,00 €', () => {
  assert.strictEqual(dlEur(null), '—');
  assert.strictEqual(dlEur(undefined), '—');
  assert.strictEqual(dlEur(''), '—');
  assert.strictEqual(dlEur(0), '0,00 €');
  assert.strictEqual(dlEur(354.76), '354,76 €');
  assert.strictEqual(dlEur(1240), '1.240,00 €');
});

test('balance carries a word, not only a sign or colour (DESIGN.md #2)', () => {
  assert.deepStrictEqual(dlBalanceWord(354.76), { text: 'του χρωστάμε', cls: 'dl-owe' });
  assert.deepStrictEqual(dlBalanceWord(-120), { text: 'μας χρωστά', cls: 'dl-owed' });
  assert.deepStrictEqual(dlBalanceWord(0), { text: 'τακτοποιημένο', cls: 'dl-zero' });
  assert.deepStrictEqual(dlBalanceWord(null), { text: 'χωρίς καρτέλα', cls: 'dl-zero' });
  assert.deepStrictEqual(dlBalanceWord(undefined), { text: 'χωρίς καρτέλα', cls: 'dl-zero' });
  assert.deepStrictEqual(dlBalanceWord(''), { text: 'χωρίς καρτέλα', cls: 'dl-zero' });
});

test('line delta: unknown balance shows dash, trip pending shows dash, payments are negative with a real minus sign', () => {
  assert.strictEqual(dlDelta({ entry_type: 'trip', pending: true, balance_delta: -300 }), '—');
  assert.strictEqual(dlDelta({ entry_type: 'trip', pending: false, balance_delta: 555 }), '+555,00');
  assert.strictEqual(dlDelta({ entry_type: 'payment_bank', pending: false, balance_delta: -950.47 }), '−950,47');
  assert.strictEqual(dlDelta({ entry_type: 'adjustment', pending: false, balance_delta: null }), '—');
  assert.strictEqual(dlDelta({ entry_type: 'adjustment', pending: false, balance_delta: undefined }), '—');
});

test('type labels and date ranges', () => {
  assert.strictEqual(dlTypeLabel('payment_bank'), 'Τράπεζα');
  assert.strictEqual(dlTypeLabel('trip'), 'Δρομολόγιο');
  assert.strictEqual(dlDateRange('2026-08-10', '2026-08-17'), '10–17/08');
  assert.strictEqual(dlDateRange('2026-08-31', '2026-09-02'), '31/08–02/09');
  assert.strictEqual(dlDateRange('2026-08-13', null), '13/08');
  assert.strictEqual(dlDateRange('2026-12-29', '2027-01-04'), '29/12/26–04/01/27');
});

test('dlMoney: balance display — positive plain, negative parenthesised, unknown dash (v2 UI rule #1)', () => {
  assert.strictEqual(dlMoney(354.76), '354,76 €');
  assert.strictEqual(dlMoney(-95.2), '(95,20 €)');
  assert.strictEqual(dlMoney(null), '—');
});

test('dlPeriod: opening = running balance before the period, closing = after the last row in it, live sums only', () => {
  const { dlPeriod } = require('../modules/payroll.js');
  const E = [
    { id: 1, entry_type: 'trip', entry_date: '2026-07-20', trip_value: 500, advance: 100, expenses: 50, balance_delta: 450, running_balance: 450, cancelled: false, pending: false },
    { id: 2, entry_type: 'payment_bank', entry_date: '2026-08-02', amount: 300, balance_delta: -300, running_balance: 150, cancelled: false, pending: false },
    { id: 3, entry_type: 'trip', entry_date: '2026-08-10', trip_value: null, balance_delta: null, running_balance: 150, cancelled: false, pending: true },
    { id: 4, entry_type: 'adjustment', entry_date: '2026-08-15', amount: -20, balance_delta: -20, running_balance: 130, cancelled: false, pending: false },
    { id: 5, entry_type: 'trip', entry_date: '2026-08-18', trip_value: 900, balance_delta: 900, running_balance: 130, cancelled: true, pending: false },
    { id: 6, entry_type: 'trip', entry_date: '2026-09-01', trip_value: 200, balance_delta: 200, running_balance: 330, cancelled: false, pending: false },
  ];
  const aug = dlPeriod(E.slice().reverse(), '2026', '08');
  assert.strictEqual(aug.opening, 450);
  assert.strictEqual(aug.closing, 130);
  assert.deepStrictEqual(aug.rows.map(r => r.id), [2, 3, 4, 5]);
  assert.strictEqual(aug.totals.payments, 300);
  assert.strictEqual(aug.totals.adjustments, -20);
  assert.strictEqual(aug.totals.pendingCount, 1);
  assert.strictEqual(aug.totals.value, 0);      // the cancelled 900 never counts
  assert.strictEqual(aug.totals.delta, -320);
  const year = dlPeriod(E, '2026', '');
  assert.strictEqual(year.opening, 0);
  assert.strictEqual(year.closing, 330);
  assert.strictEqual(year.rows.length, 6);
  const empty = dlPeriod(E, '2026', '10');
  assert.strictEqual(empty.opening, 330);
  assert.strictEqual(empty.closing, 330);
  assert.strictEqual(empty.rows.length, 0);
  assert.strictEqual(dlPeriod(E, 'all', '').opening, 0);
});
