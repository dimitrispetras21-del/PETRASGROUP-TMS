// node --test tests/wi4-vs-state.test.mjs
// F5 FE-1 Ε1/Ε20 (plan 2026-10-28, Task F): the Weekly Διεθνών tiles read ONE map, WINTL.data.natBySrc, built
// from NATIONAL LOADS (no bridge) or from /plan/vs-state (a v5 bridge). This runs the REAL builders of
// modules/weekly_intl.js (cut out of the source by name) and pins the read path: before day L only NATIONAL
// LOADS; otherwise vs-state first, NL only for «missing», and a failed read is 'err', never «χωρίς εθνικό».
// Synthetic data only.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.resolve(HERE, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'modules/weekly_intl.js'), 'utf8');
const V2 = fs.readFileSync(path.join(ROOT, 'modules/weekly_intl_v2.js'), 'utf8');
function fn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' exists');
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  throw new Error('unbalanced ' + name);
}
function ctx() {
  const c = { WINTL: { data: { partners: [{ id: 'recP1', label: 'Partner Test' }], trucks: [{ id: 'recT1', label: 'TST-1' }], drivers: [{ id: 'recD1', label: 'Driver Test' }] } } };
  vm.createContext(c);
  vm.runInContext(fn(SRC, '_wiNatFromNl') + '\n' + fn(SRC, '_wiNatFromV5'), c);
  return c;
}
const run = (c, code) => JSON.parse(vm.runInContext('JSON.stringify(' + code + ')', c));

test('F5-FE1 Ε1: from NATIONAL LOADS — partner first, then truck; Delivered/Invoiced = done (as v1/v4 read it)', () => {
  const c = ctx();
  assert.deepStrictEqual(run(c, "_wiNatFromNl({ fields: { Partner: ['recP1'], 'Partner Truck Plates': 'PX-1', Status: 'Delivered' } })"),
    { carrier: { kind: 'par', text: 'Partner Test · PX-1' }, done: true, src: 'nl' });
  assert.deepStrictEqual(run(c, "_wiNatFromNl({ fields: { Truck: ['recT1'], Driver: ['recD1'], Status: 'Assigned' } })"),
    { carrier: { kind: 'own', text: 'TST-1 · Driver Test' }, done: false, src: 'nl' });
  assert.deepStrictEqual(run(c, "_wiNatFromNl({ fields: { Status: 'Pending' } })"), { carrier: null, done: false, src: 'nl' });
});

test('F5-FE1 Ε20: from /plan/vs-state — the base\'s names; none = not assigned; done = all_executed only', () => {
  const c = ctx();
  assert.deepStrictEqual(run(c, "_wiNatFromV5({ carriers: [], all_executed: false, n_pieces: 1 })"), { carrier: null, done: false, src: 'v5' });
  assert.deepStrictEqual(run(c, "_wiNatFromV5({ carriers: [{ kind: 'none', text: '' }], all_executed: true })"), { carrier: null, done: true, src: 'v5' });
  assert.deepStrictEqual(run(c, "_wiNatFromV5({ carriers: [{ kind: 'partner', text: 'Partner Test' }], all_executed: false })"),
    { carrier: { kind: 'par', text: 'Partner Test' }, done: false, src: 'v5' });
  assert.deepStrictEqual(run(c, "_wiNatFromV5({ carriers: [{ kind: 'owned', text: 'TST-1 / Driver Test' }, { kind: 'partner', text: 'Partner Test' }], all_executed: 'true' })"),
    { carrier: { kind: 'own', text: 'TST-1 / Driver Test + Partner Test' }, done: false, src: 'v5' }, 'a non-boolean all_executed is not done');
});

test('F5-FE1: the read path — before = NL only; otherwise vs-state, NL only for «missing», a failure = err', () => {
  const block = SRC.slice(SRC.indexOf('const natMap = {};'), SRC.indexOf("console.warn('[weekly intl] national carriers:'"));
  assert.match(block, /PlanConfig\.load\(\)/);
  assert.match(block, /if \(pc\.state !== 'before'\)/, 'the vs-state read is skipped only on the base\'s «before»');
  assert.match(block, /PlanConfig\.vsState\(vsIds\)/);
  assert.match(block, /catch \(e\)[\s\S]{0,500}nlState = 'err'/, 'a failed vs-state read is err');
  assert.match(block, /vsIds = vsIds\.filter\(id => v5\.get\(id\) === 'missing'\)/, 'NL only for the orders without a bridge');
  assert.doesNotMatch(block, /cutoverDay|cutover_day/, 'no day L on the screen: the rule is the base\'s');
});

test('F5-FE1: every tile reads natBySrc — no reader of nlBySrc left in the tiles', () => {
  for (const [src, name] of [[SRC, '_wi2Carrier'], [V2, '_carrierOf']]) {
    const body = fn(src, name);
    assert.match(body, /natBySrc/, name);
    assert.doesNotMatch(body, /nlBySrc/, name);
  }
  const done = V2.slice(V2.indexOf('const natDone = (oid) =>'), V2.indexOf('const natDone = (oid) =>') + 300);
  assert.match(done, /natBySrc/);
  assert.match(done, /n\.done === true/);
});
