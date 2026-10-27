// node --test tests/wn5-labels.test.js
// National v5 F4α T11: core/wn5-labels.js holds the ONLY texts the v5 screens own — the codes the Worker sends
// without a text (warnings[].code, consequences[].kind of a dry run). Everything else the screen shows is
// error.message / preview.conflict.message / notice.message as the Worker or the DB wrote it (principle 3).
// Why a drift test: a code added to 072 without a label would show «άλλη επίπτωση · <code>» in a confirmation
// list the morning it ships; here it breaks the build instead (principle 6).
// Amounts: the DB strips amount/advance/expenses/invoice_number for every role but owner/accountant
// (plan_h_strip_amounts, 072:381); a line shows an amount ONLY when the key is in the item — never a role check.
// Owner 23/10 (decision 10, S-85): no line ever says «πληρωμένη».
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const L = require(path.join(ROOT, 'core', 'wn5-labels.js'));
const SQL = fs.readFileSync(path.join(ROOT, 'worker', 'migrations', '072_plan_functions.sql'), 'utf8');
// Literal codes only: `'code', 'over_33'` is a warning; `'code', c.code` (a cycle code) is not.
const literals = (re) => [...new Set([...SQL.matchAll(re)].map((m) => m[1]))].sort();

test('F4α-T11: WARNING keys = the warning codes raised in 072 (over_33, mixed_temp, v1_same_truck, local_payroll_review, vs_day_differs)', () => {
  const codes = literals(/jsonb_build_object\(\s*'code',\s*'([a-z0-9_]+)'/g);
  assert.deepStrictEqual(codes, ['local_payroll_review', 'mixed_temp', 'over_33', 'v1_same_truck', 'vs_day_differs'], 'the 072 warning set changed: label the new code here');
  assert.deepStrictEqual(Object.keys(L.WARNING).sort(), codes);
  assert.ok(Object.isFrozen(L.WARNING));
});

test('F4α-T11: CONSEQUENCE keys = the consequence kinds built in 072', () => {
  const kinds = literals(/jsonb_build_object\(\s*'kind',\s*'([a-z_]+)'/g);
  assert.deepStrictEqual(kinds, ['costs', 'executed_leg', 'invoiced', 'later_leg', 'local_loading', 'local_payroll', 'payroll_amount', 'rt_cancelled']);
  assert.deepStrictEqual(Object.keys(L.CONSEQUENCE).sort(), kinds);
  assert.ok(Object.isFrozen(L.CONSEQUENCE));
});

test('F4α-T11: amounts appear only when the key is in the consequence; «γραμμή μισθοδοσίας με ποσό (Οκτώβριος)» without it (S-84)', () => {
  const disp = { kind: 'payroll_amount', rt_id: 101, dl_entry_id: 7, driver_id: 31, month: '2026-10' };
  // the Figma words (H4/H6, approval 25/10): drift-pinned here, so a reword is a test change, never a silent one
  assert.deepStrictEqual(L.consequenceLine(disp), { text: 'γραμμή μισθοδοσίας με ποσό (Οκτώβριος)', unknown: false });
  const own = Object.assign({ amount: 120, advance: null, expenses: null }, disp);
  assert.strictEqual(L.consequenceLine(own).text, 'γραμμή μισθοδοσίας με ποσό (Οκτώβριος) · ποσό 120,00 €');
  assert.strictEqual(L.consequenceLine({ kind: 'local_payroll', rt_id: 101, local_move_id: 5, month: '2026-01' }).text, 'γραμμή μισθοδοσίας τοπικού με ποσό (Ιανουάριος) · πάει για έλεγχο στο λογιστήριο');
  assert.strictEqual(L.consequenceLine({ kind: 'costs', rt_id: 101, pay_source: 'DKV', count: 3 }).text, '3 γραμμές DKV');
  assert.strictEqual(L.consequenceLine({ kind: 'costs', rt_id: 101, pay_source: 'DKV', count: 1, amount: 186.4 }).text, '1 γραμμή DKV · 186,40 €');
  assert.strictEqual(L.consequenceLine({ kind: 'invoiced', nat_order_id: 3111 }).text, 'τιμολογήθηκε: το ERP κάνει το πιστωτικό');
  assert.strictEqual(L.consequenceLine({ kind: 'invoiced', nat_order_id: 3111, invoice_number: 'T-77' }).text, 'τιμολογήθηκε (T-77): το ERP κάνει το πιστωτικό');
  assert.strictEqual(L.consequenceLine({ kind: 'rt_cancelled', rt_id: 101, code: 'RT-T101' }).text, 'το δρομολόγιο RT-T101 θα σβηστεί');
  assert.strictEqual(L.warningLine({ code: 'over_33', rt_id: 101, side: 'KATHODOS', pallets: 54 }).text, 'Υπέρβαση 21π στην ΚΑΘΟΔΟ · 54/33');
  // Δ12 tile 7 after a save: the vehicle the screen added (saved_on), Figma's words
  assert.strictEqual(L.warningLine({ code: 'over_33', rt_id: 101, side: 'KATHODOS', pallets: 54, saved_on: 'TST-2106' }).text, 'Υπέρβαση 21π στο TST-2106 — αποθηκεύτηκε');
  // principle 3: the 33 of these lines IS WN5L.CAP (held to the 072 HAVING by tests/wn5-logic.test.js). A literal 33
  // in the over_33 entry fails here, and a page whose WN5L.CAP were 30 must say «24π · 54/30».
  const src = fs.readFileSync(path.join(ROOT, 'core', 'wn5-labels.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  const entry = src.slice(src.indexOf('over_33:'), src.indexOf('mixed_temp:'));
  assert.ok(entry.length > 0 && !/\b33\b/.test(entry.replace(/over_33/g, '')), 'a literal 33 in WARNING.over_33: ' + entry);
  const ctx = { WN5L: { CAP: 30 } }; ctx.window = ctx;
  require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'core', 'wn5-labels.js'), 'utf8'), ctx);
  assert.strictEqual(ctx.WN5Lab.warningLine({ code: 'over_33', side: 'KATHODOS', pallets: 54 }).text, 'Υπέρβαση 24π στην ΚΑΘΟΔΟ · 54/30');
});

test('F4α-T11: no line says «πληρωμένη» (S-85)', () => {
  const full = { rt_id: 1, dl_entry_id: 2, driver_id: 3, month: '2026-10', amount: 1, advance: 2, expenses: 3, pay_source: 'DKV', count: 2,
    leg_id: 4, stop_day: '2026-10-12', code: 'RT-1', local_move_id: 5, move_date: '2026-10-12', nat_order_id: 6, invoice_number: 'X' };
  const all = [...Object.keys(L.CONSEQUENCE).map((k) => L.consequenceLine(Object.assign({ kind: k }, full)).text),
    ...Object.keys(L.WARNING).map((k) => L.warningLine({ code: k, side: 'ANODOS', pallets: 40, delta_c: 4, rt_code: 'RT-1', first_hub_day: '2026-10-12' }).text)];
  for (const t of all) assert.ok(!/πληρωμ/i.test(t), t);
});

test('F4α-T11: unknown kind / code → {unknown:true}, never dropped (S-52, Ε-21)', () => {
  assert.deepStrictEqual(L.consequenceLine({ kind: 'seg_removed', rt_id: 1 }), { text: 'άλλη επίπτωση · seg_removed', unknown: true });
  assert.deepStrictEqual(L.warningLine({ code: 'zz_new' }), { text: 'προειδοποίηση · zz_new', unknown: true });
  assert.deepStrictEqual(L.consequenceLine(null), { text: 'άλλη επίπτωση · —', unknown: true });
});

test('F4α-T11: the labels file builds no date of its own (no Date.now / new Date())', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core', 'wn5-labels.js'), 'utf8');
  assert.ok(!/Date\.now\(|new Date\(\s*\)/.test(src), 'a label must not depend on the clock');
});
