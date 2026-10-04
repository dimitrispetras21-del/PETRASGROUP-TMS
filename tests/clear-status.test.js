// node --test tests/clear-status.test.js
// 28/9/2026 — «Καθαρισμός» emptied the vehicle but left Status 'Assigned'
// (order 387, auditor B-43). Covers Weekly International (_wiClear, ORDERS) and
// Weekly National (_wnClear, NATIONAL LOADS), the two clear paths that had the
// gap. UNIT ONLY: the functions are extracted verbatim from the module source
// (same technique as tests/critics/rot-cands-sim.js) and run against stubbed
// facade calls; nothing is sent anywhere.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const fn = (text, re, name) => { const m = text.match(re); if (!m) throw new Error(name + ' not found'); return m[0]; };
const stubGetOne = statusById => async (_t, id) => {
  const s = statusById[id];
  if (s instanceof Error) throw s;
  return { id, fields: s ? { Status: s } : {} };
};

// ── weekly_intl.js ────────────────────────────────────────────────────────
const WI = src('modules/weekly_intl.js');
const wiSrc = [
  fn(WI, /const WI_EXECUTING=\[[^\]]*\];/, 'WI_EXECUTING'),
  fn(WI, /async function _wiStatusLive\(oid\)\{[\s\S]*?\n\}\n/, '_wiStatusLive'),
  fn(WI, /async function _wiExecutingLive\(oid\)\{[\s\S]*?\n\}\n/, '_wiExecutingLive'),
  fn(WI, /async function _wiLiveOrders\(ids\)\{[\s\S]*?\n\}\n/, '_wiLiveOrders'),
  fn(WI, /function _wiExecConfirmText\(execs,what,closedOk\)\{[\s\S]*?\n\}\n/, '_wiExecConfirmText'),
  fn(WI, /async function _wiClear\(rowId\)\{[\s\S]*?\n\}\n/, '_wiClear'),
].join('\n');
async function runWiClear(statusById, row) {
  const patches = [];
  const ctx = {
    WINTL: { rows: [row], ui: {}, data: { exports: [], imports: [] } }, TABLES: { ORDERS: 'O' },
    confirmAction: async () => true,
    // 4/10: _wiClear also gathers the GI- group of the matched import; a lone
    // import is its own group (what _wiGiGroup returns without a GI- id).
    _wiGiGroup: async id => ({ lead: id, members: [id] }), reportError: () => {},
    // leg-first lookup (_wiRtOf, fix/unmatch-leg-first): no round trip here.
    _wiRtOf: async () => ({ ok: true, pg: 1, rt: null }), _wiRtLeave: async () => ({ ok: true }),
    atGetOne: stubGetOne(statusById),
    atSafePatch: async (_t, id, f) => { patches.push({ id, f }); return { id, fields: f }; },
    logError: () => {}, plOnIntlPartnerAssigned: () => {}, _wiSync: () => {}, toast: () => {},
    _wiDeletePartnerAssignments: async () => {}, renderWeeklyIntl: async () => {},
  };
  vm.runInNewContext(wiSrc + '\nthis._wiClear=_wiClear;this._wiExecutingLive=_wiExecutingLive;', ctx);
  await ctx._wiClear(row.id);
  return { patches, ctx };
}

test('_wiClear: Assigned → vehicle emptied AND Status Pending in the same PATCH (order 387)', async () => {
  const { patches } = await runWiClear({ recA: 'Assigned' }, { id: 1, orderIds: ['recA'], importId: null });
  assert.strictEqual(patches.length, 1);
  assert.strictEqual(patches[0].f.Truck.length, 0, 'vehicle emptied');
  assert.strictEqual(patches[0].f.Status, 'Pending');
});

test('_wiClear: matched import cleared too, each by its own status', async () => {
  const { patches } = await runWiClear({ recE: 'Assigned', recI: 'Pending' }, { id: 1, orderIds: ['recE'], importId: 'recI' });
  assert.strictEqual(patches.find(x => x.id === 'recE').f.Status, 'Pending');
  assert.ok(!('Status' in patches.find(x => x.id === 'recI').f), 'Pending is not rewritten');
});

// 4/10/2026 (owner «Η ανάθεση δεν κλειδώνει ποτέ»): executing orders are no
// longer skipped — after one confirm their vehicle is cleared too, and their
// Status is never written (only Assigned → Pending). Before: skipped entirely.
test('_wiClear: executing orders cleared without Status; unreadable status → vehicle cleared, no Status written', async () => {
  const { patches } = await runWiClear({ recT: 'In Transit', recD: 'Delivered', recX: new Error('boom') },
    { id: 1, orderIds: ['recT', 'recD', 'recX'], importId: null });
  assert.deepStrictEqual(patches.map(x => x.id), ['recT', 'recD', 'recX']);
  for (const p of patches) {
    assert.ok(!('Status' in p.f), p.id + ': no Status');
    assert.strictEqual(p.f.Truck.length, 0, p.id + ': vehicle emptied');
  }
});

test('_wiExecutingLive: behaviour unchanged after the _wiStatusLive split', async () => {
  const { ctx } = await runWiClear({}, { id: 1, orderIds: [], importId: null });
  ctx.atGetOne = stubGetOne({ a: 'In Transit', b: 'Delivered', c: 'Assigned', d: new Error('x') });
  // re-bind: the extracted functions close over the context's global atGetOne
  assert.strictEqual(await ctx._wiExecutingLive('a'), true);
  assert.strictEqual(await ctx._wiExecutingLive('b'), true);
  assert.strictEqual(await ctx._wiExecutingLive('c'), false);
  assert.strictEqual(await ctx._wiExecutingLive('d'), false, 'read failure = planning, as before');
});

// ── weekly_natl.js «Καθαρισμός» (NATIONAL LOADS) ───────────────────────────
const WN = src('modules/weekly_natl.js');
const wnSrc = [
  fn(WN, /async function _wnClear\(rowId\) \{[\s\S]*?\n\}\n/, '_wnClear'),
  fn(WN, /async function _wnDoneLive\(id\) \{[\s\S]*?\n\}\n/, '_wnDoneLive'),
  fn(WN, /async function _wnStatusLive\(id\) \{[\s\S]*?\n\}\n/, '_wnStatusLive'),
].join('\n');
async function runWnClear(statusById, orderIds) {
  const patches = []; const errs = [];
  const ctx = {
    WNATL: { rows: [{ id: 1, orderIds }] }, TABLES: { NAT_LOADS: 'NL' },
    _wnBlockReadOnly: () => false,
    atGetOne: stubGetOne(statusById),
    atSafePatch: async (_t, id, f) => { patches.push({ id, f }); return { id, fields: f }; },
    showErrorToast: m => errs.push(m), toast: () => {}, paDelete: async () => {},
    _wnRevertNoStatus: async () => {}, invalidateCache: () => {}, renderWeeklyNatl: async () => {},
    console,
  };
  vm.runInNewContext(wnSrc + '\nthis._wnClear=_wnClear;this._wnDoneLive=_wnDoneLive;', ctx);
  await ctx._wnClear(1);
  return { patches, errs, ctx };
}

test('_wnClear: Assigned NAT_LOAD → Status Pending with the vehicle clear; Pending untouched', async () => {
  const { patches } = await runWnClear({ n1: 'Assigned', n2: 'Pending' }, ['n1', 'n2']);
  assert.strictEqual(patches.find(x => x.id === 'n1').f.Status, 'Pending');
  assert.ok(!('Status' in patches.find(x => x.id === 'n2').f));
});

test('_wnClear: Delivered/Cancelled still refused (unchanged guard)', async () => {
  for (const st of ['Delivered', 'Cancelled']) {
    const { patches, errs } = await runWnClear({ n1: st }, ['n1']);
    assert.strictEqual(patches.length, 0, st);
    assert.strictEqual(errs.length, 1, st);
  }
});

test('_wnDoneLive: behaviour unchanged after the _wnStatusLive split', async () => {
  const { ctx } = await runWnClear({}, []);
  ctx.atGetOne = stubGetOne({ a: 'Delivered', b: 'Cancelled', c: 'Assigned', d: new Error('x') });
  assert.strictEqual(await ctx._wnDoneLive('a'), 'Delivered');
  assert.strictEqual(await ctx._wnDoneLive('b'), 'Cancelled');
  assert.strictEqual(await ctx._wnDoneLive('c'), '');
  assert.strictEqual(await ctx._wnDoneLive('d'), '');
});
