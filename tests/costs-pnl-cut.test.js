// node --test tests/costs-pnl-cut.test.js
// The P&L says when its list is cut (28/10): the Worker answers truncated + cap + total; the old Worker cut at 300
// without saying it. Runs the REAL ctPnlCut / ctPnlCutNote / ctReload from modules/costs.js in a vm.
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

test('new Worker, whole list: no note', () => {
  const { ctx } = load();
  assert.strictEqual(ctx.ctPnlCut({ records: rows(198), truncated: false, cap: 999, total: 198 }), null);
  assert.strictEqual(ctx.ctPnlCutNote(null), '');
});

test('new Worker, truncated: said with how many of how many, and that the totals miss them', () => {
  const { ctx } = load();
  const cut = ctx.ctPnlCut({ records: rows(999), truncated: true, cap: 999, total: 1200 });
  assert.deepStrictEqual({ ...cut }, { n: 999, cap: 999, total: 1200, cut: true });
  assert.match(ctx.ctPnlCutNote(cut), /Φορτώθηκαν 999 από 1200 δρομολόγια: .*λείπουν από τη λίστα ΚΑΙ από τα σύνολα/);
});

test('new Worker, near the cap (90%): said before it cuts', () => {
  const { ctx } = load();
  const cut = ctx.ctPnlCut({ records: rows(900), truncated: false, cap: 999, total: 900 });
  assert.strictEqual(cut.cut, false);
  assert.match(ctx.ctPnlCutNote(cut), /900 δρομολόγια, κοντά στο όριο των 999/);
  assert.strictEqual(ctx.ctPnlCut({ records: rows(899), truncated: false, cap: 999, total: 899 }), null);
});

test('old Worker (no «truncated»): 300 RTs read as cut, fewer not', () => {
  const { ctx } = load();
  const cut = ctx.ctPnlCut({ records: rows(300) });
  assert.strictEqual(cut.cut, true);
  assert.match(ctx.ctPnlCutNote(cut), /Φορτώθηκαν 300 δρομολόγια: /);
  assert.strictEqual(ctx.ctPnlCut({ records: rows(299) }), null);
  assert.strictEqual(ctx.ctPnlCut({}), null);
});

test('ctReload keeps the cut for the banner, and resets it on the next load', async () => {
  const a = load({ records: rows(999), truncated: true, cap: 999, total: 1200 });
  await a.ctx.ctReload();
  assert.strictEqual(a.ctx._ct.loadFailed, false);
  assert.strictEqual(a.ctx._ct.pnlCut.total, 1200);
  a.ctx.ctFetch = async (p) => (p === '/costs/pnl' ? { records: rows(5), truncated: false, cap: 999, total: 5 } : { records: [] });
  await a.ctx.ctReload();
  assert.strictEqual(a.ctx._ct.pnlCut, null);
});

test('an empty list the count says is not empty: the error card, never the «first RT» onboarding', async () => {
  const { ctx, els } = load({ records: [], truncated: true, cap: 999, total: 198 });
  await ctx.ctReload();
  assert.strictEqual(ctx._ct.loadFailed, true);
  assert.match(ctx._ct.loadError, /κενό ενώ υπάρχουν 198 δρομολόγια/);
  assert.match(els.ctList.innerHTML, /δεν απάντησαν/);
});

test('really empty (total 0): no error, the onboarding stays possible', async () => {
  const { ctx } = load({ records: [], truncated: false, cap: 999, total: 0 });
  await ctx.ctReload();
  assert.strictEqual(ctx._ct.loadFailed, false);
  assert.strictEqual(ctx._ct.pnlCut, null);
});
