// node --test tests/costs-pnl-cut.test.js
// The P&L reads every RT (owner 8/11): the Worker pages to the exact count and answers truncated + total
// («truncated» = a failed read, never a limit); the old Worker cut at 300 without saying it. Runs the REAL ctPnlCut / ctPnlCutNote / ctReload from modules/costs.js in a vm.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'modules', 'costs.js'), 'utf8');
function load(pnlAnswer) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, innerHTML: '', style: {} });
  const ctx = { console: { log() {}, warn() {}, error() {} }, icon: () => '⚠', document: { getElementById: el } };
  ctx.window = ctx;
  vm.runInNewContext(SRC + '\nthis._ct = _ct; this.ctPnlCut = ctPnlCut; this.ctPnlCutNote = ctPnlCutNote; this.ctReload = ctReload;', ctx);
  // ctReload with every /costs/* answer stubbed; render steps are no-ops, so only the load contract runs.
  ctx.ctFetch = async (p) => (p === '/costs/pnl' ? pnlAnswer : p === '/costs/lookups' ? {} : { records: [] });
  for (const f of ['ctEnrich', 'ctStockLoad', 'ctRenderSummary', 'ctRenderVehBar', 'ctRenderList', 'ctRecon']) ctx[f] = async () => {};
  return { ctx, els };
}
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

test('new Worker, whole list - however long: no note (no cap, no «near the cap»)', () => {
  const { ctx } = load();
  for (const n of [248, 999, 1500]) assert.strictEqual(ctx.ctPnlCut({ records: rows(n), truncated: false, total: n }), null, String(n));
  assert.strictEqual(ctx.ctPnlCutNote(null), '');
});

test('new Worker, truncated (a failed read): said with how many of how many, and that the totals miss them', () => {
  const { ctx } = load();
  const cut = ctx.ctPnlCut({ records: rows(247), truncated: true, total: 248 });
  assert.deepStrictEqual({ ...cut }, { n: 247, total: 248 });
  assert.match(ctx.ctPnlCutNote(cut), /Η ανάγνωση δεν ολοκληρώθηκε: φορτώθηκαν 247 από 248 δρομολόγια\. .*λείπουν από τη λίστα ΚΑΙ από τα σύνολα/);
});

test('old Worker (no «truncated»): 300 RTs read as cut, fewer not', () => {
  const { ctx } = load();
  const cut = ctx.ctPnlCut({ records: rows(300) });
  assert.deepStrictEqual({ ...cut }, { n: 300, total: null });
  assert.match(ctx.ctPnlCutNote(cut), /Φορτώθηκαν μόνο 300 δρομολόγια: ο Worker που τρέχει κόβει στα 300, οπότε ίσως λείπουν/);
  assert.doesNotMatch(ctx.ctPnlCutNote(cut), /Ανανέωση/, 'a reload cannot clear a fixed limit');
  assert.strictEqual(ctx.ctPnlCut({ records: rows(299) }), null);
  assert.strictEqual(ctx.ctPnlCut({}), null);
});

test('ctReload keeps the cut for the banner, and resets it on the next load', async () => {
  const a = load({ records: rows(999), truncated: true, total: 1200 });
  await a.ctx.ctReload();
  assert.strictEqual(a.ctx._ct.loadFailed, false);
  assert.strictEqual(a.ctx._ct.pnlCut.total, 1200);
  a.ctx.ctFetch = async (p) => (p === '/costs/pnl' ? { records: rows(5), truncated: false, total: 5 } : { records: [] });
  await a.ctx.ctReload();
  assert.strictEqual(a.ctx._ct.pnlCut, null);
});

test('an empty list the count says is not empty: the error card, never the «first RT» onboarding', async () => {
  const { ctx, els } = load({ records: [], truncated: true, total: 198 });
  await ctx.ctReload();
  assert.strictEqual(ctx._ct.loadFailed, true);
  assert.match(ctx._ct.loadError, /κενό ενώ υπάρχουν 198 δρομολόγια/);
  assert.match(els.ctList.innerHTML, /δεν απάντησαν/);
});

test('really empty (total 0): no error, the onboarding stays possible', async () => {
  const { ctx } = load({ records: [], truncated: false, total: 0 });
  await ctx.ctReload();
  assert.strictEqual(ctx._ct.loadFailed, false);
  assert.strictEqual(ctx._ct.pnlCut, null);
});
