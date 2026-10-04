// node --test tests/clear-status.test.js
// 28/9/2026 — «Καθαρισμός» emptied the vehicle but left Status 'Assigned'
// (order 387, auditor B-43). Covers Weekly International (_wiClear, ORDERS) and
// Weekly National (NATIONAL LOADS — since 4/10 the right-click unassign path), the two clear paths that had the
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
// Since 4/10/2026 (§4 #12, WN-05) the popover's «Καθαρισμός» runs the SAME
// function as the right-click «Αφαίρεση ανάθεσης» (_wnUnassign / _wnUnassignSn);
// the separate _wnClear is gone. The order-387 rule still holds on that path:
// an Assigned load goes back to Pending with its vehicle cleared.
const WN = src('modules/weekly_natl.js');
const wnSrc = [
  fn(WN, /async function _wnUnassign\(rowId\) \{[\s\S]*?\n\}\n/, '_wnUnassign'),
  fn(WN, /async function _wnDoneLive\(id\) \{[\s\S]*?\n\}\n/, '_wnDoneLive'),
  fn(WN, /async function _wnStatusLive\(id, table\) \{[\s\S]*?\n\}\n/, '_wnStatusLive'),
  fn(WN, /function _wnUnplans\(st\) \{[^\n]*\n/, '_wnUnplans'),
  fn(WN, /function _wnDoneOf\(st\) \{[^\n]*\n/, '_wnDoneOf'),
  fn(WN, /function _wnExecuted\(st\) \{[^\n]*\n/, '_wnExecuted'),
  fn(WN, /function _wnConfirmExecuted\(what\) \{[\s\S]*?\n\}\n/, '_wnConfirmExecuted'),
  fn(WN, /function _wnUnplanFields\(fields, st\) \{[\s\S]*?\n\}\n/, '_wnUnplanFields'),
].join('\n');
async function runWnUnassign(statusById, row, answer = true) {
  const patches = []; const paDeleted = []; const toasts = []; const confirms = [];
  const ctx = {
    WNATL: { rows: [Object.assign({ id: 1 }, row)] }, TABLES: { NAT_LOADS: 'NL' },
    _wnBlockReadOnly: () => false, confirmAction: async m => { confirms.push(m); return answer; },
    atGetOne: stubGetOne(statusById),
    atSafePatch: async (_t, id, f) => { patches.push({ id, f }); return { id, fields: f }; },
    toast: m => toasts.push(m), paDelete: async p => { paDeleted.push(p.parentId); },
    _wnRevertNoStatus: async () => {}, invalidateCache: () => {}, renderWeeklyNatl: async () => {}, _wnPaint: () => {},
    console,
  };
  vm.runInNewContext(wnSrc + '\nthis._wnUnassign=_wnUnassign;this._wnDoneLive=_wnDoneLive;', ctx);
  await ctx._wnUnassign(1);
  return { patches, paDeleted, toasts, confirms, ctx };
}

test('popover «Καθαρισμός» calls the right-click functions — no clear path of its own', () => {
  const btn = (WN.match(/<button class="wi-pop-cancel"[^\n]*Καθαρισμός<\/button>/) || [''])[0];
  assert.match(btn, /_wnUnassignSn\(\$\{rowId\},'\$\{row\.orderId\}'\)/, 'ΑΝΟΔΟΣ row → _wnUnassignSn, as in _wnCtxSn');
  assert.match(btn, /_wnUnassign\(\$\{rowId\}\)/, 'ΚΑΘΟΔΟΣ row → _wnUnassign, as in _wnCtx');
  assert.ok(!/function _wnClear\b/.test(WN), '_wnClear removed');
});

test('_wnUnassign: Assigned NAT_LOAD → Status Pending, vehicle + Partner Rate cleared; matched ΑΝΟΔΟΣ too; PA rows deleted', async () => {
  const { patches, paDeleted } = await runWnUnassign({ n1: 'Assigned', s1: 'Assigned' }, { orderIds: ['n1'], matchedId: 's1' });
  assert.deepStrictEqual(patches.map(x => x.id), ['n1', 's1']);
  for (const p of patches) {
    assert.strictEqual(p.f.Status, 'Pending');
    assert.strictEqual(p.f.Truck.length, 0);
    assert.strictEqual(p.f['Partner Rate'], null);
  }
  assert.deepStrictEqual(paDeleted, ['n1', 's1']);
});

test('_wnUnassign (owner 4/10): In Transit leg → vehicle cleared, Status NOT written; unreadable → no Status; empty → Pending', async () => {
  const { patches } = await runWnUnassign({ n1: 'In Transit', s1: new Error('x') }, { orderIds: ['n1'], matchedId: 's1' });
  assert.deepStrictEqual(patches.map(x => x.id), ['n1', 's1']);
  for (const p of patches) { assert.ok(!('Status' in p.f), p.id); assert.strictEqual(p.f.Truck.length, 0); }
  const e = await runWnUnassign({ n1: '' }, { orderIds: ['n1'] });
  assert.strictEqual(e.patches[0].f.Status, 'Pending');
});

test('_wnUnassign: a Cancelled leg keeps its assignment and its PA row (still refused — open owner question)', async () => {
  const { patches, paDeleted } = await runWnUnassign({ n1: 'Cancelled', s1: 'Assigned' }, { orderIds: ['n1'], matchedId: 's1' });
  assert.deepStrictEqual(patches.map(x => x.id), ['s1']);
  assert.deepStrictEqual(paDeleted, ['s1']);
  const all = await runWnUnassign({ n1: 'Cancelled' }, { orderIds: ['n1'] });
  assert.strictEqual(all.patches.length + all.confirms.length, 0, 'all legs cancelled → no dialog, no write');
});

test('_wnUnassign (owner 4/10): Delivered is NOT refused — ONE confirm (executed text), vehicle cleared, Status kept; Cancel → 0 writes', async () => {
  const ok = await runWnUnassign({ n1: 'Delivered', s1: 'Assigned' }, { orderIds: ['n1'], matchedId: 's1' });
  assert.strictEqual(ok.confirms.length, 1);
  assert.match(ok.confirms[0], /μεταφέρεται\/σβήνει δρομολόγιο \+ μισθοδοσία, ακόμη και σε κλειστό δρομολόγιο/);
  assert.deepStrictEqual(ok.patches.map(x => x.id), ['n1', 's1']);
  assert.ok(!('Status' in ok.patches[0].f) && ok.patches[0].f.Truck.length === 0, 'Delivered: vehicle out, Status untouched');
  assert.strictEqual(ok.patches[1].f.Status, 'Pending', 'the Assigned leg still → Pending');
  const no = await runWnUnassign({ n1: 'Delivered' }, { orderIds: ['n1'] }, false);
  assert.strictEqual(no.confirms.length, 1);
  assert.strictEqual(no.patches.length + no.paDeleted.length, 0, 'Ακύρωση → nothing written');
  const plain = await runWnUnassign({ n1: 'Assigned' }, { orderIds: ['n1'] });
  assert.deepStrictEqual(plain.confirms, ['Αφαίρεση ανάθεσης;'], 'a planned row keeps the plain dialog');
});

test('_wnDoneLive (owner 4/10): refuses Cancelled only', async () => {
  const { ctx } = await runWnUnassign({}, { orderIds: [] });
  ctx.atGetOne = stubGetOne({ a: 'Delivered', b: 'Cancelled', c: 'Assigned', d: new Error('x') });
  assert.strictEqual(await ctx._wnDoneLive('a'), '');
  assert.strictEqual(await ctx._wnDoneLive('b'), 'Cancelled');
  assert.strictEqual(await ctx._wnDoneLive('c'), '');
  assert.strictEqual(await ctx._wnDoneLive('d'), '');
});
