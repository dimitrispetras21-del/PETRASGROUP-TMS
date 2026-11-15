// node --test tests/wi-assign-popover.test.js
// C1.1 / Β1 and C1.2 / Β2 (audit 15/11/2026), the assignment popover of the
// Εβδομαδιαίο Διεθνών:
// - Β1: a load on a partner could not be moved to an own truck from the
//   popover (the save sent the partner again and said «Ενημερώθηκε ✓»), and a
//   trailer or a driver could not be removed by emptying its box.
// - Β2: a pick wrote the row at once; closing with ✕ did not undo it, and a
//   match afterwards copied the unsaved truck onto the import. A refused save
//   (missing fee) left the picks on the row too.
// Each case runs the REAL functions, extracted verbatim from the module, with a
// small fake DOM. UNIT ONLY: nothing leaves the process (writes are recorded).
// WI_SRC=<path> runs the same cases against another copy of weekly_intl.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WI = fs.readFileSync(process.env.WI_SRC || path.join(__dirname, '..', 'modules/weekly_intl.js'), 'utf8');
const fnIn = (name, optional) => {
  const m = WI.match(new RegExp('\\n(?:async )?function ' + name + '\\([^)]*\\) ?\\{[\\s\\S]*?\\n\\}\\n'));
  if (!m && !optional) throw new Error(name + ' not found');
  return m ? m[0] : '';
};
const NAMES = ['_wiSdF', '_wiSdP', '_wiPopPicks', '_wi2PopWarn', '_wiField', '_wiSaveFromPopover', '_wiSaveFromPopoverRun', '_wiClosePopover'];

function world(row) {
  const log = { patches: [], toasts: [] };
  const els = {};
  const el = (id, value) => (els[id] = { id, value, style: {}, classList: { toggle() {}, add() {}, remove() {} }, querySelector: () => ({ textContent: '' }), querySelectorAll: () => [] });
  // the popover as _wiOpenPopover draws it from the row: hidden id + text box per picker
  const box = (px, id, label) => { el('wsd-v-' + px + '_p_' + row.id, id || ''); el('wsd-' + px + '_p_' + row.id + ' .wi-sdi', label || ''); el('wsd-l-' + px + '_p_' + row.id, ''); };
  box('tk', row.truckId, row.truckLabel); box('tl', row.trailerId, row.trailerLabel);
  box('dr', row.driverId, row.driverLabel); box('pt', row.partnerId, row.partnerLabel);
  el('wi-pop-pp-' + row.id, row.partnerPlates || ''); el('wi-pop-rate-exp-' + row.id, row.partnerRate || '');
  el('wi-popover', ''); el('wi2-pop-warn-' + row.id, '');
  const ctx = {
    console, Object, String, Array, JSON, parseInt, parseFloat, isNaN, Set, Promise,
    window: { innerWidth: 1200 },
    document: {
      getElementById: id => els[id] || null,
      querySelector: sel => els[sel.replace(/^#/, '')] || null,
      querySelectorAll: () => [],
      removeEventListener() {},
    },
    WINTL: { rows: [row], data: { exports: [{ id: 'recE1', fields: {} }], imports: [] } },
    TABLES: { ORDERS: 'tblO' }, WI_EXECUTING: ['In Transit', 'Delivered'], WI_PIECE_OWN_ONLY: 'piece',
    _wiBlockReadOnly: () => false, _tmsLog() {}, _fhPlateNorm: s => String(s).toLowerCase(),
    _wiPieceIn: () => [], _wiSameDayConflict: () => null, confirmAction: async () => true,
    _wiGiGroup: async () => ({ members: [] }), _wiLiveOrders: async () => [],
    _wiSync() {}, _wiPlanPatch: async (_id, f) => ({ ...f }), _wiExpectOpt: () => undefined, _wiQuietOpt: () => ({}),
    atSafePatch: async (_t, id, f) => { log.patches.push({ id, f }); return { id, fields: f }; },
    _wiV2Active: () => false, reportError: m => log.toasts.push(m), toast: m => log.toasts.push(m),
    _wiExpectNote: () => '', _wiCreatePartnerAssignments: async () => {}, _wiDeletePartnerAssignments: async () => {},
    renderWeeklyIntl: async () => {}, _wiPopoverOutside() {},
  };
  vm.createContext(ctx);
  vm.runInContext(NAMES.map(n => fnIn(n, n === '_wiPopPicks' || n === '_wiSaveFromPopoverRun')).join('\n')
    + '\nObject.assign(this,{' + NAMES.filter(n => fnIn(n, true)).join(',') + '});', ctx);
  const pick = (px, id, label) => ctx._wiSdP(px + '_p_' + row.id, id, label);
  const type = (px, text) => { els['wsd-' + px + '_p_' + row.id + ' .wi-sdi'].value = text; ctx._wiSdF(px + '_p_' + row.id, text); };
  return { ctx, log, pick, type, els };
}
const partnerRow = () => ({ id: 7, type: 'export', saved: true, orderIds: ['recE1'], importId: null,
  partnerId: 'recPX', partnerLabel: 'Partner X', partnerPlates: 'ΙΑΒ 1099', partnerRate: '2400',
  truckId: null, truckLabel: '', trailerId: null, trailerLabel: '', driverId: null, driverLabel: '' });
const ownRow = () => ({ id: 8, type: 'export', saved: true, orderIds: ['recE1'], importId: null,
  partnerId: null, partnerLabel: '', truckId: 'recTA', truckLabel: 'ΚΗΙ 1111', trailerId: 'recL1', trailerLabel: 'ΡΥΜ 1',
  driverId: 'recD1', driverLabel: 'Οδηγός Α' });

test('Β1: partner row → pick an own truck and driver → the save sends the truck, not the partner', async () => {
  const w = world(partnerRow());
  w.pick('tk', 'recTB', 'ΚΗΙ 1234'); w.pick('dr', 'recD2', 'Οδηγός Β');
  await w.ctx._wiSaveFromPopover(7);
  assert.strictEqual(w.log.patches.length, 1);
  const f = JSON.parse(JSON.stringify(w.log.patches[0].f));   // out of the vm realm
  assert.deepStrictEqual(f.Truck, ['recTB'], JSON.stringify(f));
  assert.deepStrictEqual(f.Driver, ['recD2']);
  assert.deepStrictEqual(f.Partner, []);
  assert.strictEqual(f['Is Partner Trip'], false);
});

test('Β1: own truck row → empty the trailer box → the save sends no trailer, keeps truck and driver', async () => {
  const w = world(ownRow());
  w.type('tl', '');
  await w.ctx._wiSaveFromPopover(8);
  const f = JSON.parse(JSON.stringify(w.log.patches[0].f));   // out of the vm realm
  assert.deepStrictEqual(f.Trailer, [], JSON.stringify(f));
  assert.deepStrictEqual(f.Truck, ['recTA']);
  assert.deepStrictEqual(f.Driver, ['recD1']);
});

test('Β2: a pick does not touch the row until the save; ✕ leaves the row as the table holds it', () => {
  const w = world(ownRow());
  w.pick('tk', 'recTB', 'ΚΗΙ 2222');
  const row = w.ctx.WINTL.rows[0];
  assert.strictEqual(row.truckId, 'recTA', 'the unsaved pick reached the row');
  w.ctx._wiClosePopover();
  assert.strictEqual(row.truckId, 'recTA');
  assert.strictEqual(row.truckLabel, 'ΚΗΙ 1111');
});

test('Β2: a refused save (partner without fee) writes nothing and leaves the row as it was', async () => {
  const w = world(ownRow());
  w.pick('pt', 'recPY', 'Partner Y');
  await w.ctx._wiSaveFromPopover(8);
  assert.strictEqual(w.log.patches.length, 0);
  assert.ok(w.log.toasts.some(t => /κόμιστρο/i.test(t)), JSON.stringify(w.log.toasts));
  const row = w.ctx.WINTL.rows[0];
  assert.strictEqual(row.partnerId, null, 'a refused save must not leave the partner on the row');
  assert.strictEqual(row.truckId, 'recTA');
});
