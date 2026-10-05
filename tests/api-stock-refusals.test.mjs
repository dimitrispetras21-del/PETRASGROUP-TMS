// node --test tests/api-stock-refusals.test.mjs
// Stock lots Φ1, core/api.js (impact map 4/10):
//   AU-07  a designed refusal (Worker 422 STOCK_RULE) is logged as «_atRetry 422 rule: …», so the
//          auditor's B-34/B-34b can exclude it; the Greek toast is unchanged; the error carries _rule.
//   DL-04  a REFUSED delete leaves no Κάδος entry and no «Restore» undo (they used to be written first).
//   DL-05  a piece / a lot is never re-created from the trash — Greek refusal, no POST, no green «Restored».
// The REAL core/utils.js + core/api.js (+ data-helpers / orders-common for OrdersStock) run in a vm with a
// scripted fetch — same sandbox as tests/level-a-api.test.mjs. Nothing leaves the process.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function sandbox(script) {
  const calls = [], toasts = [], store = new Map();
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, crypto: webcrypto, URL, URLSearchParams, AbortController, Response, Headers, JSON, Math, Date, Promise, Array, Uint8Array, Error, Object, Set, Map,
    setTimeout: (fn) => setImmediate(fn), clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    navigator: { onLine: true, userAgent: 'test' }, location: { hostname: 'dimitrispetras21-del.github.io', href: 'https://x/app.html#orders' },
    document: { currentScript: { src: 'https://x/core/api.js?v=1790200000' }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    USE_PROXY: true, PROXY_URL: 'https://w.invalid', AT_BASE: 'appX',
    invalidateCache() {}, atNotifyChange() {},
  };
  ctx.window = { addEventListener() {}, location: ctx.location };
  ctx.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    return script(String(url), init.method || 'GET');
  };
  vm.createContext(ctx);
  for (const f of ['core/constants.js', 'core/utils.js', 'core/data-helpers.js', 'core/orders-common.js', 'core/api.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  ctx.__toasts = toasts;
  vm.runInContext("showErrorToast = function (m, t) { __toasts.push((t || 'error') + ': ' + m); }; toast = function (m, t) { __toasts.push((t || 'success') + ': ' + m); };", ctx);
  return { ctx, calls, toasts, store, run: (code) => vm.runInContext(code, ctx) };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const RULE = { error: { type: 'STOCK_RULE', code: 'piece_on_truck', message: 'Το κομμάτι είναι σε φορτηγό — «Επιστροφή στο απόθεμα» πρώτα' } };
const appErrors = (calls) => calls.filter((c) => c.url.includes('/app-errors')).map((c) => c.body.message);
const flush = () => new Promise((r) => setImmediate(r));
// B-34 / B-34b exclusion (tms-auditor checks, extended by the SQL builder of this round)
const b34Counts = (m) => !m.startsWith('queue: offline flush') && !m.startsWith('_atRetry 422 rule');

test('AU-07: a STOCK_RULE 422 is logged as «_atRetry 422 rule», keeps its Greek toast and its code', async () => {
  const s = sandbox((url) => (url.includes('/v0/') ? json(422, RULE) : json(201, {})));
  const err = JSON.parse(await s.run("atPatch('tblO', 'recP1', { Status: 'Pending' }).then(() => 'null', (e) => JSON.stringify({ m: e.message, rule: e._rule || null }))"));
  await flush();
  assert.deepStrictEqual(err, { m: RULE.error.message, rule: 'piece_on_truck' });
  assert.ok(s.toasts.includes('error: ' + RULE.error.message), s.toasts.join(' / '));
  const logged = appErrors(s.calls);
  assert.strictEqual(logged.length, 1, logged.join(' / '));
  assert.ok(logged[0].startsWith('_atRetry 422 rule: ' + RULE.error.message), logged[0]);
  assert.strictEqual(logged.filter(b34Counts).length, 0, 'B-34/B-34b would still count it');
});

test('AU-07: any other 422 keeps «_atRetry 422» (still counted by B-34)', async () => {
  const s = sandbox((url) => (url.includes('/v0/') ? json(422, { error: { type: 'INVALID_VALUE_FOR_COLUMN', message: 'bad value' } }) : json(201, {})));
  await s.run("atPatch('tblO', 'recA', { Notes: 'x' }).catch(() => null)");
  await flush();
  const logged = appErrors(s.calls);
  assert.ok(logged.length === 1 && logged[0].startsWith('_atRetry 422: '), logged.join(' / '));
  assert.strictEqual(logged.filter(b34Counts).length, 1);
});

const PIECE = { id: 'recP1', fields: { Reference: 'TEST-STOCK-P1', 'Stock Lot': ['recSTOCKLOT1'], Truck: ['recT1'], Status: 'Assigned' } };

test('DL-04: a REFUSED delete leaves no Κάδος entry and no «Restore» undo', async () => {
  const s = sandbox((url, m) => (!url.includes('/v0/') ? json(201, {}) : m === 'GET' ? json(200, PIECE) : json(422, RULE)));
  const threw = await s.run("atSoftDelete('tblO', 'recP1').then(() => false, () => true)");
  assert.strictEqual(threw, true);
  assert.strictEqual(s.run('getUndoAction()'), null);
  assert.strictEqual(s.run('getTrash().length'), 0);
});

test('DL-04: a successful delete still writes the trash entry and the undo', async () => {
  const ORD = { id: 'recO1', fields: { Reference: 'ORD-1', Status: 'Pending' } };
  const s = sandbox((url, m) => (!url.includes('/v0/') ? json(201, {}) : m === 'GET' ? json(200, ORD) : json(200, { id: 'recO1', deleted: true })));
  await s.run("atSoftDelete('tblO', 'recO1')");
  assert.strictEqual(s.run('getUndoAction().recId'), 'recO1');
  assert.strictEqual(s.run('getTrash()[0].fields.Reference'), 'ORD-1');
});

// critic-1 C1-07 (round 1 X4): the restore of a piece/lot is refused (DL-05), so the «Restore» undo
// offered right after its delete was a button that could only say «no». No undo for it — and the
// previous action's undo is cleared too, or the toolbar «Undo» would revert an older, unrelated edit.
for (const [name, fields] of [['piece', { 'Stock Lot': ['recSTOCKLOT1'], Reference: 'P', Status: 'Pending' }], ['lot', { 'Own Stock Lot': 'recSTOCKLOT1', Reference: 'L', Status: 'Pending' }]]) {
  test(`X4: deleting a ${name} keeps the Κάδος entry but offers no «Restore» (and no older undo)`, async () => {
    const s = sandbox((url, m) => (!url.includes('/v0/') ? json(201, {}) : m === 'GET' ? json(200, { id: 'recX1', fields }) : json(200, { id: 'recX1', deleted: true })));
    s.run("_undoSet({ type: 'patch', tableId: 'tblO', recId: 'recOTHER', prevFields: { Notes: 'x' }, label: 'older edit' })");
    await s.run("atSoftDelete('tblO', 'recX1')");
    assert.strictEqual(s.run('getUndoAction()'), null);
    assert.strictEqual(s.run('getTrash()[0].id'), 'recX1', 'the Κάδος keeps the record of what went');
  });
}

for (const [name, fields] of [['piece', { 'Stock Lot': ['recSTOCKLOT1'], Reference: 'P' }], ['lot', { 'Own Stock Lot': 'recSTOCKLOT1', Reference: 'L' }]]) {
  test(`DL-05: a ${name} is not re-created from the trash (Greek refusal, no POST, no «Restored»)`, async () => {
    const s = sandbox((url) => json(200, { id: 'recNEW', fields: {} }));
    s.store.set('tms_trash', JSON.stringify([{ id: 'recX1', table: 'tblO', fields, deletedAt: '2026-10-04T10:00:00Z' }]));
    const r = await s.run('atRestoreFromTrash(0)');
    assert.strictEqual(r, null);
    assert.strictEqual(s.calls.filter((c) => c.method === 'POST' && c.url.includes('/v0/')).length, 0);
    assert.ok(s.toasts.some((t) => /Η επαναφορά κομματιού\/παρτίδας γίνεται από το ΑΠΟΘΕΜΑ/.test(t)), s.toasts.join(' / '));
    assert.strictEqual(s.run('getTrash().length'), 1, 'the entry stays as a record');
    // the global «Undo» path: no green «Restored» after the refusal
    s.run("_undoSet({ type: 'delete', tableId: 'tblO', recId: 'recX1', label: 'X' })");
    await s.run('undoLastAction()');
    assert.ok(!s.toasts.some((t) => /^success: Restored/.test(t)), s.toasts.join(' / '));
    assert.strictEqual(s.run('getUndoAction()'), null);
  });
}

test('DL-05: an ordinary order is still restored from the trash', async () => {
  const s = sandbox(() => json(200, { id: 'recNEW', fields: { Reference: 'ORD-1' } }));
  s.store.set('tms_trash', JSON.stringify([{ id: 'recO1', table: 'tblO', fields: { Reference: 'ORD-1' } }]));
  const r = await s.run('atRestoreFromTrash(0)');
  assert.strictEqual(r.id, 'recNEW');
  assert.strictEqual(s.calls.filter((c) => c.method === 'POST' && c.url.includes('/v0/')).length, 1);
});
