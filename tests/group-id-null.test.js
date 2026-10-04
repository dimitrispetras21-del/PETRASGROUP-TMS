// node --test tests/group-id-null.test.js
// 4/10/2026 (owner go) — leaving a group must write orders.group_id = NULL,
// never ''. The Worker facade copies '' verbatim, and the round-trip triggers
// (rt_link_split / rt_create_from_order) walk `cur.group_id is not null and
// n.group_id = cur.group_id`: every order cleared to '' becomes ONE group and
// their RT legs merge. Covers the three clear paths in Weekly International:
// dissolve (_wiSplit → _wiGroupPatch), lone survivor (_wiSyncGroupResidue) and
// «Ακύρωση groupage» (_wiCancelGroupMember). UNIT ONLY: functions are
// extracted verbatim from the module source (same technique as
// tests/clear-status.test.js) and run against a stubbed facade; nothing is sent.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const fn = (text, re, name) => { const m = text.match(re); if (!m) throw new Error(name + ' not found'); return m[0]; };

const WI = src('modules/weekly_intl.js');
const wiSrc = [
  fn(WI, /function _wiGrpOrder\(exps,fallbackField\)\{[\s\S]*?\n\}\n/, '_wiGrpOrder'),
  fn(WI, /async function _wiGroupPatch\(orderIds, gid, rowId\)\{[\s\S]*?\n\}\n/, '_wiGroupPatch'),
  fn(WI, /async function _wiSplit\(rowId\)\{[\s\S]*?\n\}\n/, '_wiSplit'),
  fn(WI, /async function _wiRewriteGroupSuffix\(recs,isImp\)\{[\s\S]*?\n\}\n/, '_wiRewriteGroupSuffix'),
  fn(WI, /async function _wiSyncGroupResidue\(row\)\{[\s\S]*?\n\}\n/, '_wiSyncGroupResidue'),
  // leg-first helper the clear paths call before touching a vehicle (tests/unmatch-leg-first.test.js)
  fn(WI, /async function _wiRtOf\(orderId\)\{[\s\S]*?\n\}\n/, '_wiRtOf'),
  fn(WI, /async function _wiRtLeave\(orderId\)\{[\s\S]*?\n\}\n/, '_wiRtLeave'),
  fn(WI, /async function _wiCancelGroupMember\(rowId,orderId,isImportSide\)\{[\s\S]*?\n\}\n/, '_wiCancelGroupMember'),
].join('\n');

// The facade answers like the real one: a NULL column is absent from the
// response (toAirtableRecord), '' comes back as ''.
function world({ exports = [], imports = [], rows = [], executing = {} } = {}) {
  const patches = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    WINTL: { rows, data: { exports, imports }, _seq: 100, ui: {} },
    TABLES: { ORDERS: 'O' },
    atSafePatch: async (_t, id, f) => {
      patches.push({ id, f });
      const fields = {};
      for (const [k, v] of Object.entries(f)) if (v !== null && v !== undefined) fields[k] = v;
      return { id, fields };
    },
    getLinkedId: v => (Array.isArray(v) ? v[0] || null : v || null),
    confirmAction: async () => true,
    _wiExecutingLive: async id => !!executing[id],
    // round-trip lookup (_wiRtOf): the order has an Order No, no trip holds it
    atGetOne: async (_t, id) => ({ id, fields: { 'Order No': 1, 'Loading DateTime': '2026-10-01T06:00:00Z' } }), plFetch: async () => ({ records: [] }),
    // 4/10 (fix/wi-assign-never-locks): _wiCancelGroupMember reads the live
    // status through _wiLiveOrders (it needs Reference/Status for its one
    // confirm) instead of _wiExecutingLive — same `executing` map drives both.
    WI_EXECUTING: ['In Transit', 'Delivered'],
    _wiLiveOrders: async ids => ids.map(id => ({ id, st: executing[id] ? 'Delivered' : 'Assigned', f: {} })),
    _wiExecConfirmText: () => 'executing',
    _wiDissolveClearMember: async () => undefined,
    _wiSync() {}, toast() {}, _wiPaint() {}, reportError() {},
    renderWeeklyIntl: async () => {},
  };
  vm.runInNewContext(wiSrc + '\nObject.assign(this,{_wiGroupPatch,_wiSplit,_wiSyncGroupResidue,_wiCancelGroupMember});', ctx);
  return { ctx, patches };
}
const groupWrites = patches => patches.filter(p => 'Group ID' in p.f).map(p => p.f['Group ID']);
const assertNoBlank = (patches, label) => {
  const gw = groupWrites(patches);
  assert.ok(gw.length > 0, label + ': expected at least one Group ID write');
  for (const v of gw) assert.notStrictEqual(v, '', label + ": wrote '' to Group ID");
};
const rec = (id, gid) => ({ id, fields: gid ? { 'Group ID': gid } : {} });

test('dissolve (_wiSplit): every member is cleared with null, never empty string', async () => {
  const exports = [rec('recA', 'GRP-A|recA,recB,recC'), rec('recB', 'GRP-A|recA,recB,recC'), rec('recC', 'GRP-A|recA,recB,recC')];
  const row = { id: 1, type: 'export', orderId: 'recA', orderIds: ['recA', 'recB', 'recC'], importId: null };
  const { ctx, patches } = world({ exports, rows: [row] });
  await ctx._wiSplit(1);
  assertNoBlank(patches, '_wiSplit');
  assert.deepStrictEqual(groupWrites(patches), [null, null, null]);
});

test('_wiGroupPatch: a falsy gid from any caller is sent as null', async () => {
  const { ctx, patches } = world();
  await ctx._wiGroupPatch(['recA', 'recB'], '', 1);
  assert.deepStrictEqual(groupWrites(patches), [null, null]);
});

test('lone survivor (_wiSyncGroupResidue): cleared with null, local cache too', async () => {
  const exports = [rec('recA', 'GRP-A|recA,recB')];
  const { ctx, patches } = world({ exports });
  const ok = await ctx._wiSyncGroupResidue({ type: 'export', orderIds: ['recA'] });
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(groupWrites(patches), [null]);
  assert.strictEqual(exports[0].fields['Group ID'], null, 'cache mirrors the DB (no empty string)');
});

for (const executing of [false, true]) {
  test(`«Ακύρωση groupage» (_wiCancelGroupMember, executing=${executing}): leaver AND lone survivor get null`, async () => {
    const exports = [rec('recA', 'GRP-A|recA,recB'), rec('recB', 'GRP-A|recA,recB')];
    const row = { id: 1, type: 'export', orderId: 'recA', orderIds: ['recA', 'recB'], importId: null };
    const { ctx, patches } = world({ exports, rows: [row], executing: { recB: executing } });
    await ctx._wiCancelGroupMember(1, 'recB', false);
    assertNoBlank(patches, '_wiCancelGroupMember');
    const byId = Object.fromEntries(patches.filter(p => 'Group ID' in p.f).map(p => [p.id, p.f['Group ID']]));
    assert.strictEqual(byId.recB, null, 'the order that left');
    assert.strictEqual(byId.recA, null, 'the lone survivor');
    assert.strictEqual(exports[1].fields['Group ID'], null, 'cache of the leaver');
  });
}

test('no module or core file writes an empty-string Group ID literal', () => {
  const files = [
    ...fs.readdirSync(path.join(__dirname, '..', 'modules')).map(f => 'modules/' + f),
    ...fs.readdirSync(path.join(__dirname, '..', 'core')).map(f => 'core/' + f),
  ].filter(f => f.endsWith('.js'));
  const bad = [];
  for (const f of files) {
    src(f).split('\n').forEach((line, i) => {
      if (/['"]Group ID['"]\]?\s*[:=]\s*(''|"")/.test(line) || /_wiGroupPatch\([^,]+,\s*(''|"")/.test(line)) bad.push(`${f}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(bad, []);
});
