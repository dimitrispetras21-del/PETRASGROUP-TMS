// node --test tests/wn5-search.test.js
// National v5 F4α Task T7 — the board searches with THE SAME fhSearchNorm / fhSearchBlob as the Weekly boards
// (Pantelis 21/10; tests/wi4-search-norm.test.js pins the functions themselves). The v5 module must call them and
// carry no normaliser of its own (principle 3); a row's search text is WN5L.searchParts(row) kept field by field, so
// a query never matches across two fields. The REAL core files run in a vm on the synthetic W42.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/wn5-week.json'), 'utf8'));

test('F4α-T7: the v5 module calls fhSearchBlob/fhSearchNorm and carries no normaliser or Greek→Latin table of its own', () => {
  const V5 = read('modules/weekly_natl_v5.js');
  assert.ok(/fhSearchBlob\(/.test(V5), 'the v5 board must build its search text with fhSearchBlob');
  assert.ok(/fhSearchNorm\(/.test(V5), 'the v5 board must normalise the query with fhSearchNorm');
  assert.ok(!/function\s+_?\w*[Nn]orm\w*\s*\(/.test(V5), 'a normaliser of its own in modules/weekly_natl_v5.js');
  assert.ok(!/_FH_EL|'θ'\s*:\s*'th'|normalize\(\s*'NFD'\s*\)/.test(V5), 'a copy of the Greek→Latin table in modules/weekly_natl_v5.js');
});

test('F4α-T7: Greek finds the Latin names; «τστ 2104» finds the two cycles of TST-2104; a query never matches across two fields', () => {
  const ctx = { console: { log() {}, warn() {}, error() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['core/form-helpers.js', 'core/wi4-logic.js', 'core/wn5-logic.js']) vm.runInContext(read(f), ctx, { filename: f });
  const m = ctx.WN5L.model(FIX, { today: '2026-10-13' });
  const rows = m.days.flatMap((d) => d.rows);
  const find = (q) => Array.from(rows.filter((r) => ctx.fhSearchBlob(ctx.WN5L.searchParts(r)).includes(ctx.fhSearchNorm(q))), (r) => r.key);
  assert.ok(ctx.fhSearchNorm('Thessaloniki Test').includes(ctx.fhSearchNorm('θεσσαλονίκη')), 'Greek must find the Latin-stored place');
  assert.deepStrictEqual(find('τστ 2104'), ['rt:101', 'rt:107']);
  assert.deepStrictEqual(find('Pelagos'), ['rt:104']);
  assert.deepStrictEqual(find('pelagoss'), []);
  assert.deepStrictEqual(find('vs-t118'), ['wait:4101']);
  assert.deepStrictEqual(find('θεσσαλονίκη'), ['rt:105']);
  assert.deepStrictEqual(find('TST-2104 TRL-5102'), [], 'truck + trailer is two fields: never one match');
  assert.deepStrictEqual(find('2104 TRL'), []);
});
