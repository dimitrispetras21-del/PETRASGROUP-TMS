// node --test tests/wi-weekly-doors.test.js
// Weekly Διεθνών doors (10/10). History: that morning a guard was added on
// eight doors so that accountant / management / warehouse could not write
// from this board (date chip, inline «×», «⨯ αποσύνδεση», Καρτέλα Ρότας and
// its save/dissolve, empty import box, the order form from a row and from the
// ΑΠΟΘΕΜΑ shelf). The owner took it back the same day: «αναίρεση. δεν το
// θέλω αυτό». Those roles act on these doors as before; the last case keeps a
// role gate from coming back here without the owner's word.
// What stays from that day: «Αυτόματο ταίριασμα» is gone (owner 10/10), and
// «ΚΕΝΟ EXPORT» jumps to the first export still to assign — walking every
// candidate, saying «hidden by the filter» apart from «not drawn» — never to
// an import, never a click that does nothing.
// Each case runs the REAL function, extracted verbatim from the module source.
// UNIT ONLY: nothing leaves the process. WI_SRC=<path> runs the same cases
// against another copy of weekly_intl.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WI = fs.readFileSync(process.env.WI_SRC || path.join(__dirname, '..', 'modules/weekly_intl.js'), 'utf8');
const fnIn = (src, name, optional) => {
  const m = src.match(new RegExp('(?:async )?function ' + name + '\\([^)]*\\) ?\\{[\\s\\S]*?\\n\\}\\n'));
  if (!m && !optional) throw new Error(name + ' not found');
  return m ? m[0] : '';
};
const fn = (name, optional) => fnIn(WI, name, optional);
const NAMES = ['_wiBlockReadOnly', '_wk3PickDate', '_wk3IsoOnDay', '_wiUnmatch', '_wiUnmatchRow',
  '_wiRotUnlink', '_wiRota', '_wiRotaSave', '_wiRotaSplit', '_wiNewImport',
  '_wk3Edit', '_wiStockOpenLotOrder', '_wiStockOpenPiece', '_wiStockPieceLine'];
const NEW = ['_wiFirstPendingExp', '_wiPendingExps', '_wiJumpFirstPendingExp']
  .filter(n => fn(n, true));   // absent in one «before» copy or the other
const SRC = NAMES.concat(NEW).map(n => fn(n)).join('\n');

function world(role) {
  const log = { toasts: [], patches: [], confirms: [], opened: [], removed: [], appended: [], jumps: [], calls: [] };
  const ev = () => { const e = { clientX: 10, clientY: 10, stopped: 0, prevented: 0 };
    e.stopPropagation = () => { e.stopped++; }; e.preventDefault = () => { e.prevented++; }; return e; };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    innerWidth: 1200, innerHeight: 800,
    can: area => (area === 'planning' ? role : 'none'),
    toast: (m, k) => log.toasts.push({ m, k: k || 'success' }),
    reportError: (m) => log.toasts.push({ m, k: 'error' }),
    confirmAction: async (m) => { log.confirms.push(m); return ctx._confirmAnswer; },
    _confirmAnswer: false,
    TABLES: { ORDERS: 'tblO' },
    WI_EXECUTING: ['In Transit', 'Delivered'],
    atSafePatch: async (_t, id, f) => { log.patches.push({ id, f }); return { id, fields: f }; },
    atGetOne: async (_t, id) => ({ id, fields: {} }),
    invalidateCache() {},
    renderWeeklyIntl: async () => {},
    document: {
      createElement: tag => ({ tag, style: {}, value: '', focus() {}, showPicker() {}, remove() {} }),
      body: { appendChild: el => { log.appended.push(el); } },
      getElementById: id => ctx._dom[id] || null,
    },
    // _wiUnmatchRow
    _wiPieceIn: () => [],
    _wiRemoveImport: async rowId => { log.removed.push(rowId); return true; },
    // _wiRotUnlink (rtFindForOrder left undefined: straight to the Rotation ID PATCH)
    _wiRtLegDelete: async () => ({ ok: true, status: 200 }),
    // _wiRota / _wiRotaSave / _wiRotaSplit
    _wiGrpOrder: recs => recs,
    _wiRotaRender: () => log.opened.push('rota card'),
    _wiRotaClose: () => { ctx._wiRotaState = null; },
    _wiRepaintRow: () => {},
    _wiSplit: async rid => { log.calls.push('split ' + rid); },
    // _wiNewImport
    openIntlEditWith: (id, f) => log.opened.push('import form ' + (f && f.Direction)),
    // gap box
    _ccJump: id => log.jumps.push(id),
    _dom: {},   // the rows drawn on the board, by element id
    // order form doors (_wk3Edit / _wiStockOpenLotOrder / _wiStockOpenPiece)
    getLinkedId: v => (Array.isArray(v) ? v[0] : v) || null,
    _wiPanelClose: () => log.calls.push('panel close'),
    _wiRecOf: id => ctx.WINTL.data.exports.concat(ctx.WINTL.data.imports).find(r => r.id === id) || null,
    _wiReadOrder: async id => { log.calls.push('read ' + id); return { id, fields: {} }; },
    WINTL: {
      data: {
        exports: [{ id: 'recE1', fields: { 'Group ID': 'GRP-1' } }, { id: 'recE2', fields: { 'Group ID': 'GRP-1' } }],
        imports: [{ id: 'recI1', fields: {} }],
      },
      rows: [
        { id: 1, type: 'export', orderIds: ['recE1', 'recE2'], importId: 'recI1', saved: true },
        { id: 2, type: 'import', orderId: 'recI1', orderIds: ['recI1'], matchedTo: 'recE1', saved: true },
      ],
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC + '\nObject.assign(this,{' + NAMES.concat(NEW).join(',') + '});', ctx);
  return { ctx, log, ev };
}

// 1. date chip
test('date chip: full role still opens the picker and PATCHes the new day', async () => {
  const { ctx, log, ev } = world('full');
  ctx._wk3PickDate(ev(), 'recE1', 'Loading DateTime', '2026-10-12T06:00:00Z');
  assert.strictEqual(log.appended.length, 1, 'picker opened');
  const inp = log.appended[0]; inp.value = '2026-10-13';
  await inp.onchange();
  assert.strictEqual(log.patches.length, 1);
  assert.strictEqual(log.patches[0].id, 'recE1');
  assert.ok('Loading DateTime' in log.patches[0].f);
});

// 2. inline «×» unmatch
test('inline «×»: full role still unmatches', async () => {
  const { ctx, log } = world('full');
  await ctx._wiUnmatch('recI1');
  assert.deepStrictEqual(log.removed, [1]);
  assert.deepStrictEqual(log.toasts, []);
});

// 3. «⨯ αποσύνδεση» on a rota leg row
test('«⨯ αποσύνδεση»: full role still asks, then writes', async () => {
  const { ctx, log, ev } = world('full'); ctx._confirmAnswer = true;
  await ctx._wiRotUnlink(ev(), 'recL1');
  assert.strictEqual(log.confirms.length, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(log.patches)), [{ id: 'recL1', f: { 'Rotation ID': '' } }]);
});

// 4. Καρτέλα Ρότας
test('Καρτέλα Ρότας: full role still opens the card', () => {
  const { ctx, log } = world('full');
  ctx._wiRota(1);
  assert.deepStrictEqual(log.opened, ['rota card']);
  assert.deepStrictEqual([...ctx._wiRotaState.ids], ['recE1', 'recE2']);
});
test('«Αποθήκευση σειράς»: full role still writes the order on every member', async () => {
  const { ctx, log } = world('full'); ctx._wiRotaState = { rowId: 1, ids: ['recE2', 'recE1'] };
  await ctx._wiRotaSave();
  assert.deepStrictEqual(log.patches.map(p => [p.id, p.f['Group ID']]), [['recE2', 'GRP-1|recE2,recE1'], ['recE1', 'GRP-1|recE2,recE1']]);
});
test('«Διάλυση ομάδας»: full role still confirms, then dissolves', async () => {
  const { ctx, log } = world('full'); ctx._confirmAnswer = true; ctx._wiRotaState = { rowId: 1, ids: ['recE1', 'recE2'] };
  await ctx._wiRotaSplit();
  assert.strictEqual(log.confirms.length, 1);
  assert.deepStrictEqual(log.calls, ['split 1']);
});

// 5. softer paths
test('empty import box: full role still opens the import form', () => {
  const { ctx, log } = world('full');
  ctx.WINTL.rows[0].importId = null;
  ctx._wiNewImport(1);
  assert.deepStrictEqual(log.opened, ['import form Import']);
  assert.strictEqual(ctx._wiPendingMatch.rowId, 1);
});
test('«Αυτόματο ταίριασμα» is gone (owner 10/10): no button, no function, no window export, no scorer', () => {
  assert.doesNotMatch(WI, /Αυτόματο ταίριασμα|_wiAutoMatch|autoN|_wiMatchableImp/);
});

// 6. order form doors: owner/dispatcher get the edit form with the row's own
// fields. openIntlEditWith is re-stubbed to record id + fields.
const formLog = (ctx, log) => { ctx.openIntlEditWith = (id, f) => log.opened.push({ id, f }); };
test('route / leg / import cell: full role still opens the form with the row\'s own fields', () => {
  const { ctx, log } = world('full'); formLog(ctx, log);
  ctx._wk3Edit('recI1');
  assert.strictEqual(log.opened.length, 1);
  assert.strictEqual(log.opened[0].id, 'recI1');
  assert.strictEqual(log.opened[0].f, ctx.WINTL.data.imports[0].fields);
  assert.deepStrictEqual(log.toasts, []);
});
test('ΑΠΟΘΕΜΑ «Άνοιγμα παρτίδας»: full role still opens the lot\'s order', async () => {
  const { ctx, log } = world('full'); formLog(ctx, log);
  ctx.WINTL._stkLot = { fields: { Order: ['recE1'] } };
  await ctx._wiStockOpenLotOrder();
  assert.deepStrictEqual(log.opened.map(o => o.id), ['recE1']);
  assert.deepStrictEqual(log.calls, ['panel close']);
});
test('ΑΠΟΘΕΜΑ piece line: full role still opens the piece form', () => {
  const { ctx, log } = world('full'); formLog(ctx, log);
  ctx.WINTL._stkPieces = [{ id: 'recP1', fields: { Direction: 'Import' } }];
  ctx._wiStockOpenPiece('recP1');
  assert.deepStrictEqual(log.opened.map(o => o.id), ['recP1']);
});

// «ΚΕΝΟ EXPORT»
test('«ΚΕΝΟ EXPORT» jumps to the first export still to assign — never to an import', () => {
  const { ctx, log } = world('view');   // a jump is reading: no role gate
  assert.strictEqual(typeof ctx._wiJumpFirstPendingExp, 'function', '_wiJumpFirstPendingExp missing');
  ctx.WINTL.rows = [
    { id: 1, type: 'import', orderId: 'recI9', saved: false },               // what the old jump picked
    { id: 2, type: 'export', orderIds: ['recE2'], saved: true },
    { id: 3, type: 'export', orderIds: ['recE3'], saved: false, legOf: 9 },  // a rota leg is not a row to assign
    { id: 4, type: 'export', orderIds: ['recE4'], saved: false },
  ];
  ctx._dom['wi-row-4'] = { style: {} };
  ctx._wiJumpFirstPendingExp();
  assert.deepStrictEqual(log.jumps, ['wi-row-4']);
  assert.deepStrictEqual(log.toasts, []);
});
test('«ΚΕΝΟ EXPORT» skips a split parent (no row of its own) and jumps to the next export', () => {
  const { ctx, log } = world('full');
  ctx.WINTL.rows = [
    { id: 5, type: 'export', orderIds: ['recE5'], saved: false, hasSplitLegs: true },   // drawn as a frame, no wi-row-5
    { id: 6, type: 'export', orderIds: ['recE6'], saved: false },
  ];
  ctx._dom['wi-row-6'] = { style: {} };
  ctx._wiJumpFirstPendingExp();
  assert.deepStrictEqual(log.jumps, ['wi-row-6']);
  assert.deepStrictEqual(log.toasts, []);
});
test('«ΚΕΝΟ EXPORT» to a row the filter hides — or one not drawn — says so, no silent jump', () => {
  for (const dom of [{ 'wi-row-4': { style: { display: 'none' } } }, {}]) {
    const { ctx, log } = world('full');
    ctx.WINTL.rows = [{ id: 4, type: 'export', orderIds: ['recE4'], saved: false }];
    Object.assign(ctx._dom, dom);
    ctx._wiJumpFirstPendingExp();
    assert.deepStrictEqual(log.jumps, []);
    assert.strictEqual(log.toasts.length, 1);
    assert.strictEqual(log.toasts[0].k, 'info');
  }
});
test('«ΚΕΝΟ EXPORT» with nothing to assign says so instead of doing nothing', () => {
  const { ctx, log } = world('full');
  assert.strictEqual(typeof ctx._wiJumpFirstPendingExp, 'function', '_wiJumpFirstPendingExp missing');
  ctx.WINTL.rows = [{ id: 1, type: 'import', orderId: 'recI9', saved: false }, { id: 2, type: 'export', orderIds: ['recE2'], saved: true }];
  ctx._wiJumpFirstPendingExp();
  assert.deepStrictEqual(log.jumps, []);
  assert.strictEqual(log.toasts.length, 1);
  assert.strictEqual(log.toasts[0].k, 'info');
});
test('«ΚΕΝΟ EXPORT» box calls the export jump; the dead header jump and the import jumper are gone', () => {
  const box = WI.split('\n').find(l => l.includes('>ΚΕΝΟ EXPORT<'));
  assert.ok(box, 'ΚΕΝΟ EXPORT box not found');
  assert.match(box, /_wiJumpFirstPendingExp\(\)/);
  assert.doesNotMatch(WI, /jumpPending|_wiJumpFirstUnassigned/);
  assert.match(WI, /window\._wiJumpFirstPendingExp\s*=\s*_wiJumpFirstPendingExp;/, 'inline onclick needs the window export');
});

// ── Follow-up 10/10 (reviewer P3s on a16a34f0) ──────────────────────────────
// P3-1: the jump stopped at the FIRST candidate — hidden or never drawn, a
// later visible export was never reached and the toast blamed the filter even
// when no filter was on.
const exps = ids => ids.map(id => ({ id, type: 'export', orderIds: ['recE' + id], saved: false }));
test('«ΚΕΝΟ EXPORT»: the first export to assign is hidden by the filter — it jumps to the next VISIBLE one', () => {
  const { ctx, log } = world('full');
  ctx.WINTL.rows = exps([4, 7]);
  ctx._dom['wi-row-4'] = { style: { display: 'none' } };
  ctx._dom['wi-row-7'] = { style: {} };
  ctx._wiJumpFirstPendingExp();
  assert.deepStrictEqual(log.jumps, ['wi-row-7']);
  assert.deepStrictEqual(log.toasts, []);
});
test('«ΚΕΝΟ EXPORT»: the first export to assign is not drawn — it jumps to the next drawn, visible one', () => {
  const { ctx, log } = world('full');
  ctx.WINTL.rows = exps([8, 9]);
  ctx._dom['wi-row-9'] = { style: {} };
  ctx._wiJumpFirstPendingExp();
  assert.deepStrictEqual(log.jumps, ['wi-row-9']);
  assert.deepStrictEqual(log.toasts, []);
});
test('«ΚΕΝΟ EXPORT» with none visible: «hidden by the filter» and «not drawn» are two different messages, neither the «nothing to assign» one', () => {
  const run = (rows, dom) => {
    const { ctx, log } = world('full');
    ctx.WINTL.rows = rows; Object.assign(ctx._dom, dom);
    ctx._wiJumpFirstPendingExp();
    assert.deepStrictEqual(log.jumps, []);
    assert.strictEqual(log.toasts.length, 1);
    assert.strictEqual(log.toasts[0].k, 'info');
    return log.toasts[0].m;
  };
  const hidden = run(exps([4, 5]), { 'wi-row-4': { style: { display: 'none' } }, 'wi-row-5': { style: { display: 'none' } } });
  // one hidden + one not drawn: clearing the filter WOULD show one, so the filter is what to say
  const mixed = run(exps([4, 5]), { 'wi-row-5': { style: { display: 'none' } } });
  const notDrawn = run(exps([4, 5]), {});
  const none = run([], {});
  assert.match(hidden, /φίλτρο|αναζήτηση/);
  assert.strictEqual(mixed, hidden);
  assert.doesNotMatch(notDrawn, /φίλτρο|αναζήτηση/, 'no filter is on — the toast must not blame it');
  assert.notStrictEqual(notDrawn, none);
  assert.notStrictEqual(hidden, none);
});

// Owner 10/10 «αναίρεση. δεν το θέλω αυτό»: no role gate on these doors. A
// gate coming back here is the owner's decision, not a refactor.
test('owner 10/10: no role gate on the date chip, «×», «⨯ αποσύνδεση», Καρτέλα Ρότας, empty import box or the order-form doors', () => {
  for (const n of ['_wk3PickDate', '_wiUnmatchRow', '_wiNewImport', '_wiRotUnlink', '_wiRota', '_wiRotaSave', '_wiRotaSplit',
    '_wk3Edit', '_wiStockOpenLotOrder', '_wiStockOpenPiece'])
    assert.doesNotMatch(fn(n), /_wiBlockReadOnly\(\)|_wiReadOnlyOrder\(/, n + ' carries a role gate');
  assert.doesNotMatch(WI, /function _wiReadOnlyOrder|function _wiDoorTip/);
});

// The same owner decision, as behaviour: a view role reaches the real first
// step at these doors again (picker opens; the edit form opens).
test('owner 10/10: a view role opens the date picker again', async () => {
  const { ctx, log, ev } = world('view');
  ctx._wk3PickDate(ev(), 'recE1', 'Loading DateTime', '2026-10-08');
  assert.strictEqual(log.appended.length, 1, 'the date picker is opened');
  assert.deepStrictEqual(log.toasts, [], 'no read-only toast');
});
test('owner 10/10: a view role opens the order form from a row again', () => {
  const { ctx, log } = world('view'); formLog(ctx, log);
  ctx._wk3Edit('recI1');
  assert.deepStrictEqual(log.opened.map(o => o.id), ['recI1'], 'the edit form, not a read-only card');
  assert.deepStrictEqual(log.toasts, []);
});
