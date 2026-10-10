// node --test tests/wi-readonly-guards.test.js
// Inventory 10/10 (origin/main 21353c40): Weekly Διεθνών write paths that did
// NOT go through _wiBlockReadOnly, the board's one rule for a role whose
// can('planning') is not 'full' (accountant / management / warehouse = 'view'):
//   1. date chip      _wi2Date → _wk3PickDate          PATCH order date
//   2. inline «×»     _wiUnmatch / _wiUnmatchRow       unmatch (→ _wiRemoveImport)
//   3. leg row        «⨯ αποσύνδεση» → _wiRotUnlink   RT leg DELETE + Rotation ID
//   4. Καρτέλα Ρότας  _wiRota / _wiRotaSave / _wiRotaSplit   Group ID / dissolve
//   5. softer         _wiNewImport (opens the form) · _wiAutoMatch (confirm, then
//                     one refusal per pair and a green «εφαρμόστηκαν ✓» anyway) —
//                     REMOVED instead, owner 10/10: «δεν χρειάζομαι τελείως το
//                     αυτόματο ταίριασμα»; the last case checks it stays gone
//   6. order form     _wk3Edit (route/leg/import cell, split header, rota card
//                     «Επεξεργασία») · _wiStockOpenLotOrder · _wiStockOpenPiece
//                     (ΑΠΟΘΕΜΑ shelf, drawn for every role). Added 10/10: the
//                     form's own «Αποθήκευση» (submitIntlOrder) asks no role,
//                     and the Worker accepts PATCH orders from management and
//                     accountant — so the ORDERS row was written, then the
//                     stops/cascade writes those roles lack were refused.
//                     A view role gets the read-only card instead (reviewer
//                     P3-2): openIntlReadOnlyCard, as Weekly Εθνικών does.
// plus «ΚΕΝΟ EXPORT», whose tooltip promises the first export to assign while
// it jumped to the first IMPORT without a vehicle (_wiJumpFirstUnassigned).
// Follow-up 10/10 (reviewer P3s on a16a34f0): the jump walks EVERY candidate
// to the first visible row, and says «hidden by the filter» apart from «not
// drawn»; a door's tooltip says what the click does for the role (card for a
// view role, _wiDoorTip); the read-only card opened FROM Weekly Διεθνών has no
// «άνοιγμα στο Εβδομαδιαίο Διεθνών →» link (orders_intl.js, OI_SRC=<path>).
//
// Each case runs the REAL function, extracted verbatim from the module source,
// once as a view role (nothing may be written, opened or confirmed; exactly one
// «Μόνο ανάγνωση» toast) and once as 'full' (the guard lets it through to its
// first real step). The owner's 23/8 decision stands: the Worker still lets
// roles edit broadly — this is the front agreeing with its own rule only.
// UNIT ONLY: nothing leaves the process. WI_SRC=<path> runs the same cases
// against another copy of weekly_intl.js (the «before» proof: 21353c40 fails).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WI = fs.readFileSync(process.env.WI_SRC || path.join(__dirname, '..', 'modules/weekly_intl.js'), 'utf8');
const OI = fs.readFileSync(process.env.OI_SRC || path.join(__dirname, '..', 'modules/orders_intl.js'), 'utf8');
const fnIn = (src, name, optional) => {
  const m = src.match(new RegExp('(?:async )?function ' + name + '\\([^)]*\\) ?\\{[\\s\\S]*?\\n\\}\\n'));
  if (!m && !optional) throw new Error(name + ' not found');
  return m ? m[0] : '';
};
const fn = (name, optional) => fnIn(WI, name, optional);
const NAMES = ['_wiBlockReadOnly', '_wk3PickDate', '_wk3IsoOnDay', '_wiUnmatch', '_wiUnmatchRow',
  '_wiRotUnlink', '_wiRota', '_wiRotaSave', '_wiRotaSplit', '_wiNewImport',
  '_wk3Edit', '_wiStockOpenLotOrder', '_wiStockOpenPiece', '_wiStockPieceLine'];
const NEW = ['_wiFirstPendingExp', '_wiPendingExps', '_wiJumpFirstPendingExp', '_wiReadOnlyOrder', '_wiDoorTip']
  .filter(n => fn(n, true));   // absent in one «before» copy or the other
const SRC = NAMES.concat(NEW).map(n => fn(n)).join('\n');
const RO = 'Μόνο ανάγνωση για τον ρόλο σου';

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
    openIntlReadOnlyCard: (id, note, o) => log.opened.push('read-only card ' + id + ' | ' + note + (o && o.fromWeeklyIntl ? ' | from Weekly Διεθνών' : '')),
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
// A blocked call: one «Μόνο ανάγνωση» warn, and nothing else touched.
function assertBlocked(log) {
  assert.deepStrictEqual(log.toasts, [{ m: RO, k: 'warn' }], 'exactly one read-only toast');
  assert.deepStrictEqual(log.patches, [], 'no PATCH');
  assert.deepStrictEqual(log.confirms, [], 'no confirm dialog');
  assert.deepStrictEqual(log.opened, [], 'no form or card opened');
  assert.deepStrictEqual(log.removed, [], 'no unmatch');
  assert.deepStrictEqual(log.appended, [], 'no date picker');
  assert.deepStrictEqual(log.calls, [], 'no other step');
}

// 1. date chip
test('date chip: a view role gets no picker and no PATCH; the click still does not reach the row', () => {
  const { ctx, log, ev } = world('view'); const e = ev();
  ctx._wk3PickDate(e, 'recE1', 'Loading DateTime', '2026-10-12T06:00:00Z');
  assertBlocked(log);
  assert.ok(e.stopped && e.prevented, 'the row underneath must not open the form instead');
});
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
test('inline «×» on a matched import (_wiUnmatch): view role — one toast, no unmatch', async () => {
  const { ctx, log } = world('view');
  await ctx._wiUnmatch('recI1');
  assertBlocked(log);
});
test('inline «×» on a GI group (_wiUnmatchRow): view role — one toast, no unmatch', async () => {
  const { ctx, log } = world('view');
  await ctx._wiUnmatchRow(1);
  assertBlocked(log);
});
test('inline «×»: full role still unmatches', async () => {
  const { ctx, log } = world('full');
  await ctx._wiUnmatch('recI1');
  assert.deepStrictEqual(log.removed, [1]);
  assert.deepStrictEqual(log.toasts, []);
});

// 3. «⨯ αποσύνδεση» on a rota leg row
test('«⨯ αποσύνδεση» (_wiRotUnlink): view role — no confirm, no leg DELETE, no Rotation ID PATCH', async () => {
  const { ctx, log, ev } = world('view'); const e = ev();
  await ctx._wiRotUnlink(e, 'recL1');
  assertBlocked(log);
  assert.ok(e.prevented && e.stopped);
});
test('«⨯ αποσύνδεση» with skipConfirm (panel path): view role — still nothing written', async () => {
  const { ctx, log } = world('view');
  await ctx._wiRotUnlink(null, 'recL1', true);
  assertBlocked(log);
});
test('«⨯ αποσύνδεση»: full role still asks, then writes', async () => {
  const { ctx, log, ev } = world('full'); ctx._confirmAnswer = true;
  await ctx._wiRotUnlink(ev(), 'recL1');
  assert.strictEqual(log.confirms.length, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(log.patches)), [{ id: 'recL1', f: { 'Rotation ID': '' } }]);
});

// 4. Καρτέλα Ρότας
test('Καρτέλα Ρότας (_wiRota): view role — the card does not open', () => {
  const { ctx, log } = world('view');
  ctx._wiRota(1);
  assertBlocked(log);
  assert.ok(!ctx._wiRotaState, 'no card state');
});
test('Καρτέλα Ρότας: full role still opens the card', () => {
  const { ctx, log } = world('full');
  ctx._wiRota(1);
  assert.deepStrictEqual(log.opened, ['rota card']);
  assert.deepStrictEqual([...ctx._wiRotaState.ids], ['recE1', 'recE2']);
});
test('«Αποθήκευση σειράς» (_wiRotaSave): view role — no Group ID PATCH', async () => {
  const { ctx, log } = world('view'); ctx._wiRotaState = { rowId: 1, ids: ['recE2', 'recE1'] };
  await ctx._wiRotaSave();
  assertBlocked(log);
});
test('«Αποθήκευση σειράς»: full role still writes the order on every member', async () => {
  const { ctx, log } = world('full'); ctx._wiRotaState = { rowId: 1, ids: ['recE2', 'recE1'] };
  await ctx._wiRotaSave();
  assert.deepStrictEqual(log.patches.map(p => [p.id, p.f['Group ID']]), [['recE2', 'GRP-1|recE2,recE1'], ['recE1', 'GRP-1|recE2,recE1']]);
});
test('«Διάλυση ομάδας» (_wiRotaSplit): view role — no confirm, no dissolve', async () => {
  const { ctx, log } = world('view'); ctx._wiRotaState = { rowId: 1, ids: ['recE1', 'recE2'] };
  await ctx._wiRotaSplit();
  assertBlocked(log);
});
test('«Διάλυση ομάδας»: full role still confirms, then dissolves', async () => {
  const { ctx, log } = world('full'); ctx._confirmAnswer = true; ctx._wiRotaState = { rowId: 1, ids: ['recE1', 'recE2'] };
  await ctx._wiRotaSplit();
  assert.strictEqual(log.confirms.length, 1);
  assert.deepStrictEqual(log.calls, ['split 1']);
});

// 5. softer paths
test('empty import box (_wiNewImport): view role — no form, no pending match', () => {
  const { ctx, log } = world('view');
  ctx.WINTL.rows[0].importId = null;
  ctx._wiNewImport(1);
  assertBlocked(log);
  assert.ok(!ctx._wiPendingMatch, 'no match left waiting for a form');
});
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

// 6. order form — the door is the only place a view role is stopped: the
// form's «Αποθήκευση» asks no role and the Worker takes PATCH orders from
// management/accountant. A view role reads the order on the read-only card
// (no actions) — never the edit form, never a dead end. openIntlEditWith is
// re-stubbed to record id + fields.
const formLog = (ctx, log) => { ctx.openIntlEditWith = (id, f) => log.opened.push({ id, f }); };
// A view role at an order door: the read-only card of THAT order, nothing else.
function assertCard(log, id) {
  // the card's reason line is this board's, not the VS-load default («Veroia
  // Switch …»), and the card knows it was opened from this board (no link back here)
  assert.deepStrictEqual(log.opened, ['read-only card ' + id + ' | ' + RO + ' | from Weekly Διεθνών'], 'the read-only card, not the form');
  assert.deepStrictEqual(log.toasts, [], 'no dead-end toast');
  assert.deepStrictEqual(log.patches, []);
  assert.deepStrictEqual(log.confirms, []);
}
test('route / leg / import cell (_wk3Edit): view role — the read-only card, no form', () => {
  const { ctx, log } = world('view'); formLog(ctx, log);
  ctx._wk3Edit('recE1');
  assertCard(log, 'recE1');
});
test('route / leg / import cell: full role still opens the form with the row\'s own fields', () => {
  const { ctx, log } = world('full'); formLog(ctx, log);
  ctx._wk3Edit('recI1');
  assert.strictEqual(log.opened.length, 1);
  assert.strictEqual(log.opened[0].id, 'recI1');
  assert.strictEqual(log.opened[0].f, ctx.WINTL.data.imports[0].fields);
  assert.deepStrictEqual(log.toasts, []);
});
test('order door without the read-only card loaded: a view role is told, still no form', () => {
  const { ctx, log } = world('view'); formLog(ctx, log);
  delete ctx.openIntlReadOnlyCard;
  ctx._wk3Edit('recE1');
  assertBlocked(log);
});
test('ΑΠΟΘΕΜΑ «Άνοιγμα παρτίδας» (_wiStockOpenLotOrder): view role — the lot order\'s read-only card, no form, no read', async () => {
  const { ctx, log } = world('view'); formLog(ctx, log);
  ctx.WINTL._stkLot = { fields: { Order: ['recE1'] } };
  await ctx._wiStockOpenLotOrder();
  assertCard(log, 'recE1');
  assert.deepStrictEqual(log.calls, ['panel close'], 'the panel closes as for a full role; the card reads by itself');
});
test('ΑΠΟΘΕΜΑ «Άνοιγμα παρτίδας»: full role still opens the lot\'s order', async () => {
  const { ctx, log } = world('full'); formLog(ctx, log);
  ctx.WINTL._stkLot = { fields: { Order: ['recE1'] } };
  await ctx._wiStockOpenLotOrder();
  assert.deepStrictEqual(log.opened.map(o => o.id), ['recE1']);
  assert.deepStrictEqual(log.calls, ['panel close']);
});
test('ΑΠΟΘΕΜΑ piece line (_wiStockOpenPiece): view role — the piece\'s read-only card, no form', () => {
  const { ctx, log } = world('view'); formLog(ctx, log);
  ctx.WINTL._stkPieces = [{ id: 'recP1', fields: { Direction: 'Import' } }];
  ctx._wiStockOpenPiece('recP1');
  assertCard(log, 'recP1');
});
test('ΑΠΟΘΕΜΑ piece line: full role still opens the piece form', () => {
  const { ctx, log } = world('full'); formLog(ctx, log);
  ctx.WINTL._stkPieces = [{ id: 'recP1', fields: { Direction: 'Import' } }];
  ctx._wiStockOpenPiece('recP1');
  assert.deepStrictEqual(log.opened.map(o => o.id), ['recP1']);
});
// Caught when written, not by the next audit: a NEW door into an order form
// fails here unless _wiBlockReadOnly() or _wiReadOnlyOrder() precedes it in
// the same function. openIntlPieceCreate is left out on purpose — its one
// caller _wiStockOpenForm is reached only through _wiStockJoin (gated) and the
// «+ Κομμάτι» button, which is drawn for OrdersStock.canWrite() roles only.
test('every order-form opener in weekly_intl.js is gated for a view role first', () => {
  const lines = WI.split('\n'), opener = /\b(openIntlEditWith|openIntlCreate|openIntlScan|openPreorder)\(/;
  const ungated = [];
  lines.forEach((l, i) => {
    if (!opener.test(l) || /^\s*\/\//.test(l)) return;
    let h = i; while (h >= 0 && !/^(async )?function \w+/.test(lines[h])) h--;
    const name = h >= 0 ? lines[h].match(/function (\w+)/)[1] : '(top level)';
    if (h < 0 || !/_wiBlockReadOnly\(\)|_wiReadOnlyOrder\(/.test(lines.slice(h, i + 1).join('\n'))) ungated.push(name + ' @' + (i + 1));
  });
  assert.deepStrictEqual(ungated, []);
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

// P3-2: a view role clicking a door gets the read-only card (_wiReadOnlyOrder);
// a title still saying «φόρμα» tells it something the click no longer does.
test('ΑΠΟΘΕΜΑ piece line: the tooltip says the card for a view role, the form for a full one', () => {
  for (const [role, want, wrong] of [['view', /^Κλικ: καρτέλα κομματιού \(μόνο ανάγνωση\)$/, /φόρμα/], ['full', /^Κλικ: φόρμα κομματιού$/, /μόνο ανάγνωση/]]) {
    const { ctx } = world(role);
    Object.assign(ctx, {
      escapeHtml: s => String(s == null ? '' : s), _wiFlatLocName: () => 'Αποθήκη Χ', _wiLooseLate: () => false,
      _wiStockPieceRelay: () => '', OrdersStock: { statusWord: s => s, canWrite: () => false, lotNumLabel: () => '#1' },
    });
    const html = ctx._wiStockPieceLine({ id: 'recP1', fields: { Status: 'Pending' } }, false);
    const title = (html.match(/class="wi-panel-opt wi-stk-piece"[^>]*?title="([^"]*)"/) || [])[1];
    assert.match(title, want, role + ': ' + title);
    assert.doesNotMatch(title, wrong, role + ': ' + title);
  }
});
test('_wiDoorTip: a view role reads the order card (or the given view text), a full role the given title', () => {
  assert.strictEqual(typeof world('view').ctx._wiDoorTip, 'function', '_wiDoorTip missing');
  assert.strictEqual(world('full').ctx._wiDoorTip('Κλικ: φόρμα παραγγελίας'), 'Κλικ: φόρμα παραγγελίας');
  assert.strictEqual(world('view').ctx._wiDoorTip('Κλικ: φόρμα παραγγελίας'), 'Κλικ: καρτέλα παραγγελίας (μόνο ανάγνωση)');
  assert.strictEqual(world('view').ctx._wiDoorTip('Κλικ: καρτέλα ρότας ομάδας', RO), RO);
});
// Caught when written: a NEW «κλικ … φόρμα» title on this board fails here
// unless it goes through _wiDoorTip (route cell, import card, leg row, GI
// member line, matched import, ΑΠΟΘΕΜΑ piece — six doors on 10/10).
test('no tooltip on the board promises a form to a role that gets the card: every «κλικ … φόρμα» title goes through _wiDoorTip', () => {
  const bad = [];
  WI.split('\n').forEach((l, i) => {
    if (/^\s*\/\//.test(l)) return;
    for (const m of l.matchAll(/title="([^"]*)"/g)) {
      if (/[Κκ]λικ[^"]*φόρμ/.test(m[1]) && !/^\$\{_wiDoorTip\(/.test(m[1])) bad.push((i + 1) + ': ' + m[1].slice(0, 70));
    }
  });
  assert.deepStrictEqual(bad, []);
});

// P3-3: the card's «άνοιγμα στο Εβδομαδιαίο Διεθνών →» repaints the board the
// card was opened from and closes the card — hidden there, kept everywhere else.
const WEEKLY_LINK = 'άνοιγμα στο Εβδομαδιαίο Διεθνών';
function cardWorld() {
  const panel = { innerHTML: '', scrollTop: 5, classList: { remove() {} } };
  const rec = { id: 'recE1', fields: { Direction: 'Export', Reference: 'R-1', Truck: ['recT1'] } };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    escapeHtml: s => String(s == null ? '' : s),
    can: () => 'full',
    OrdersCommon: { isInvoiced: () => false, tempText: () => '' },
    _OI_STATUS: {}, _OI_REEFER: {}, _OI_DIR_W: {},
    isPreorder: () => false, preorderChipHtml: () => '',
    _stopsTotalPallets: () => 0, _oiLocOf: () => ({}), _oiDate: () => '', _oiStops: () => [],
    F: { STOP_PARENT_ORDER: 'Parent Order' },
    _cleanSummary: s => s || '—', _clientName: () => 'Πελάτης Α', _oiIsPiece: () => false, _oiMoney: v => String(v),
    INTL_ORDERS: { data: [rec] },
    atGetOne: async () => { throw new Error('the record is in INTL_ORDERS — no read expected'); },
    TABLES: { ORDERS: 'tblO' },
    _oiEnsureStyles() {}, fhLoadLocations: async () => {}, fhBatchResolveClients: async () => {}, stopsLoad: async () => [],
    document: { getElementById: id => (id === 'intlDetail' ? panel : null) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fnIn(OI, '_oiCardHtml') + '\n' + fnIn(OI, 'openIntlReadOnlyCard') + '\nObject.assign(this,{_oiCardHtml,openIntlReadOnlyCard});', ctx);
  return { ctx, panel, rec };
}
test('read-only card opened FROM Weekly Διεθνών: no link back to the same board; the reason line and «Ανάθεση» stay', async () => {
  const { ctx, panel } = cardWorld();
  await ctx.openIntlReadOnlyCard('recE1', RO, { fromWeeklyIntl: true });   // the call _wiReadOnlyOrder makes
  assert.ok(!panel.innerHTML.includes(WEEKLY_LINK), 'the link would repaint the board and close the card');
  assert.ok(panel.innerHTML.includes(RO), 'reason line');
  assert.match(panel.innerHTML, /oi-sect-t">Ανάθεση</);
  assert.doesNotMatch(panel.innerHTML, /data-oi-act=/, 'still no actions');
});
test('read-only card from Weekly Εθνικών (VS load, no opts) and the Orders page card keep the link to Weekly Διεθνών', async () => {
  const { ctx, panel, rec } = cardWorld();
  await ctx.openIntlReadOnlyCard('recE1');   // weekly_natl.js
  assert.ok(panel.innerHTML.includes(WEEKLY_LINK), 'Weekly Εθνικών → the VS order is edited on Weekly Διεθνών');
  assert.ok(panel.innerHTML.includes('Veroia Switch · μόνο ανάγνωση'), 'VS default reason line');
  assert.ok(ctx._oiCardHtml(rec).includes(WEEKLY_LINK), 'Orders page card');
});
