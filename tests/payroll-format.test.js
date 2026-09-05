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
