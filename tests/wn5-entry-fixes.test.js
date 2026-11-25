// node --test tests/wn5-entry-fixes.test.js
// National v5, entry test 25/11 (findings 1 and 4): the pure parts, on the REAL files in a vm, synthetic data only.
//  - finding 1: «-6865» finds the international whose reference ends in 6865; any other query matches the words.
//  - finding 4: a driver / plate that STARTS with the query comes before one that only holds it.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function load(files) {
  const ctx = { console: { log() {}, warn() {}, error() {} } };
  ctx.window = ctx;
  ctx.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, getElementById: () => null };
  ctx.addEventListener = () => {};
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}

test('finding 1: «-6865» matches the end of the reference digits, words match as before', () => {
  const ctx = load(['core/form-helpers.js', 'core/load-plan.js', 'core/wi4-logic.js', 'core/wn5-logic.js', 'core/wn5-labels.js', 'modules/wn5_actions.js']);
  const m = ctx.WN5Act._plusMatch;
  const s = ctx.fhSearchNorm('ΠΕΛΑΤΗΣ Α 6100136865 LARISA TEST');
  assert.strictEqual(m('-6865', s, '6100136865'), true);
  assert.strictEqual(m('– 6865', s, '6100136865'), true, 'an en dash and a space too');
  assert.strictEqual(m('-6865', s, '6100168651'), false, 'the digits must END the reference');
  assert.strictEqual(m('6865', s, '6100136865'), true, 'digits alone: anywhere in the line, as before');
  assert.strictEqual(m('λαρισα', s, ''), true, 'Greek finds the Latin place (fhSearchNorm)');
  assert.strictEqual(m('', s, ''), true);
  assert.strictEqual(m('-6865', s, ''), false, 'a line with no reference is not an international ending in 6865');
});

test('finding 4: starts-with ranks above a word that starts with it, above contains; the catalogue order inside', () => {
  const ctx = load(['core/form-helpers.js', 'modules/wn5_assign.js']);
  const items = [{ id: 1, label: 'Driver Agrigoris Test' }, { id: 2, label: 'Rigas Test' }, { id: 3, label: 'Test Rigopoulos' }, { id: 4, label: 'Rigakis Test' }];
  const nq = ctx.fhSearchNorm('Ρηγ');
  const out = Array.from(ctx.WN5Assign._ranked(items.filter((x) => ctx.fhSearchNorm(x.label).includes(nq)), nq, ctx.fhSearchNorm), (x) => x.id);
  assert.deepStrictEqual(out, [2, 4, 3, 1]);
  assert.deepStrictEqual(Array.from(ctx.WN5Assign._ranked(items, '', ctx.fhSearchNorm), (x) => x.id), [1, 2, 3, 4], 'no query: as given');
});
