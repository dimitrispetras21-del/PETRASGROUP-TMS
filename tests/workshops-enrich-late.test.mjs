// node --test tests/workshops-enrich-late.test.mjs
// app_errors 6/10 06:55 (Παντελής): «workshops enrichment: Cannot set properties of null (setting 'innerHTML')».
// _enrichWorkshopsV2 (core/entity.js) fills three derived columns AFTER an await on maintenance history; if
// the user has left the Workshops list by then, applyEntityFilters wrote into a table that no longer exists.
// The REAL core/entity.js runs in a vm; the fill must skip quietly when its target is gone (or a newer
// render owns the state) — and must still report a real failure while the page is there.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function sandbox({ tablePresent, history }) {
  const logged = [], applied = [], bars = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    document: {
      getElementById: (id) => (id === 'workshops_table' && tablePresent() ? {} : null),
      querySelector: () => null, querySelectorAll: () => [],
    },
    window: {}, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    TABLES: { MAINT_HISTORY: 'tblH' },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/entity.js'), 'utf8'), ctx, { filename: 'core/entity.js' });
  Object.assign(ctx, { __logged: logged, __applied: applied, __bars: bars, __history: history });
  vm.runInContext(`
    atGetAll = async () => __history();
    safeFetch = async (fn) => { try { return await fn(); } catch (e) { const r = []; r.__failed = true; return r; } };
    didFail = (v) => !!(v && v.__failed);
    logError = (e, c) => { __logged.push(c + ': ' + (e && e.message)); };
    applyEntityFilters = (k) => { __applied.push(k); };
    _renderStatsBarV2 = (k) => { __bars.push(k); };
  `, ctx);
  return { ctx, logged, applied, bars, run: (code) => vm.runInContext(code, ctx) };
}
const WS = '[{ id: "recW1", fields: { Name: "Συνεργείο Α" } }]';
const HIST = () => [{ fields: { Workshop: ['recW1'], Cost: 100, Date: '2026-10-01' } }];

test('user left the page before the history arrived: no write, no error row', async () => {
  let present = true;
  const s = sandbox({ tablePresent: () => present, history: async () => { present = false; return HIST(); } });
  await s.run(`const ws = ${WS}; _entityState.workshops = { records: ws }; _enrichWorkshopsV2('workshops', ws)`);
  assert.deepStrictEqual(s.applied, [], 'nothing is rendered into a page that is gone');
  assert.deepStrictEqual(s.logged, [], 'leaving the page is not an error');
});

test('user reopened the list meanwhile (a newer render owns the state): the stale fill is skipped', async () => {
  const s = sandbox({ tablePresent: () => true, history: async () => HIST() });
  await s.run(`const ws = ${WS}; _entityState.workshops = { records: ${WS} }; _enrichWorkshopsV2('workshops', ws)`);
  assert.deepStrictEqual(s.applied, []);
  assert.deepStrictEqual(s.logged, []);
});

test('page still there: the columns are filled and the list re-rendered (unchanged)', async () => {
  const s = sandbox({ tablePresent: () => true, history: async () => HIST() });
  const n = await s.run(`const ws = ${WS}; _entityState.workshops = { records: ws }; _enrichWorkshopsV2('workshops', ws).then(() => ws[0].fields._serviceCount)`);
  assert.strictEqual(n, 1);
  assert.deepStrictEqual(s.applied, ['workshops']);
  assert.deepStrictEqual(s.bars, ['workshops']);
  assert.deepStrictEqual(s.logged, []);
});

test('page still there and the history failed: the failure is still reported', async () => {
  const s = sandbox({ tablePresent: () => true, history: async () => { throw new Error('HTTP 500'); } });
  await s.run(`const ws = ${WS}; _entityState.workshops = { records: ws }; _enrichWorkshopsV2('workshops', ws)`);
  assert.deepStrictEqual(s.logged, ['workshops enrichment: maintenance history failed']);
});
