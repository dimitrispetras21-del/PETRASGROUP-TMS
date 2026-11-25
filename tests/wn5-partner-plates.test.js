// node --test tests/wn5-partner-plates.test.js
// 115 (owner 25/11 «on the trip»): the partner's plates and driver, free text on the national trip. Two trucks of one
// partner on one day were two anonymous rows. The board row, its search, the week paper and the driver sheet say them
// where a truck plate stands; a board before 115 names neither key and everything reads exactly as before.
// The REAL core/wn5-logic.js, core/week-paper.js and modules/wn5_sheet.js (in a vm, as tests/wn5-sheet.test.js).
// On plain main: the line under the partner's name stays empty.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const L = require(path.join(ROOT, 'core/wn5-logic.js'));
const WP = require(path.join(ROOT, 'core/week-paper.js'));
const FIX = fs.readFileSync(path.join(__dirname, 'fixtures/wn5-week.json'), 'utf8');
// the fixture's partner trip is 104; a second truck of the same partner, the same days, as on 25/11
function board(ptx) {
  const b = JSON.parse(FIX);
  const p = b.cycles.find((c) => c.rt_id === 104);
  const q = Object.assign(JSON.parse(JSON.stringify(p)), { rt_id: 109, code: 'RT-T109' });
  q.stops = q.stops.map((s) => Object.assign({}, s, { stop_id: s.stop_id + 900, legs: [] }));
  b.cycles.push(q);
  if (ptx) {
    for (const c of b.cycles) Object.assign(c, { partner_plates: null, partner_driver: null });
    Object.assign(p, { partner_plates: 'TST-P 104', partner_driver: 'Driver P1' });
    Object.assign(q, { partner_plates: 'TST-P 109' });
  }
  return b;
}
const rowOf = (m, rt) => m.days.flatMap((d) => d.rows).find((r) => r.rtId === rt);

test('115: the board row of a partner trip says its plates and driver under the company; two trucks differ', () => {
  const m = L.model(board(true), { today: '2026-10-13' });
  assert.strictEqual(rowOf(m, 104).tiles[0].line2, 'TST-P 104 · Driver P1');
  assert.strictEqual(rowOf(m, 109).tiles[0].line2, 'TST-P 109');
  // the search finds a trip by what was typed
  assert.ok(L.searchParts(rowOf(m, 104)).includes('TST-P 104'));
  assert.ok(L.searchParts(rowOf(m, 104)).includes('Driver P1'));
});

test('115: a board before 115 (no keys) and a trip with nothing typed read as before: nothing under the name', () => {
  const m0 = L.model(board(false), { today: '2026-10-13' });
  assert.strictEqual(rowOf(m0, 104).tiles[0].line2, '');
  const b = board(true);
  Object.assign(b.cycles.find((c) => c.rt_id === 104), { partner_plates: null, partner_driver: null });
  assert.strictEqual(rowOf(L.model(b, { today: '2026-10-13' }), 104).tiles[0].line2, '');
});

test('115: the week paper prints the plates beside the company; never a rate', () => {
  const b = board(true);
  const m = L.model(b, { today: '2026-10-12', place: (id) => ({ name: 'Τόπος ' + id }) });
  const p = WP.natlModel(b, m, { numbers: L.boardNumbers(m), platesOf: () => [], weekNoOf: () => 43, weekNo: 42, range: '—', stamp: '—' });
  const trucks = p.days.flatMap((d) => d.rows).map((r) => r.truck).filter((t) => t && t.kind === 'par');
  assert.deepStrictEqual(trucks.map((t) => t.plates).sort(), ['TST-P 104 · Driver P1', 'TST-P 109']);
  const h = WP.natlHTML(p);
  assert.match(h, /<span class="tr">TST-P 104 · Driver P1<\/span>/);
  assert.doesNotMatch(h, /€/);
});

function sheet() {
  const win = {};
  const ctx = { console: { log() {}, warn() {}, error() {} }, window: win, Intl, Date, Math, JSON, Object, Array, String, Number, Map, Set, Promise, Error, RegExp, Symbol,
    setTimeout() {}, setInterval() {}, addEventListener() {}, document: { addEventListener() {}, createElement() {}, querySelector() {}, body: { appendChild() {} } } };
  vm.createContext(ctx);
  for (const f of ['core/wi4-logic.js', 'core/load-plan.js', 'core/wn5-logic.js', 'modules/wn5_forms.js', 'core/wn5-labels.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
    Object.assign(ctx, { WI4: win.WI4, LoadPlan: win.LoadPlan || ctx.LoadPlan, WN5L: win.WN5L, WN5Form: win.WN5Form, WN5Lab: win.WN5Lab });
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules/wn5_sheet.js'), 'utf8'), ctx, { filename: 'modules/wn5_sheet.js' });
  return win.WN5Sheet;
}

test('115: the driver sheet of a partner trip: the plates where a truck stands, the driver where a driver signs', () => {
  const S = sheet();
  const PL = { hubId: 1, byId: {} };
  const ls = S.lines(board(true).cycles.find((x) => x.rt_id === 104), PL, 'ALL');
  const h = ls.find((l) => l.t === 'head');
  assert.deepStrictEqual([h.plates, h.pdriver], ['TST-P 104', 'Driver P1']);
  assert.match(S.text(ls, {}).split('\n')[0], /· TST-P 104 · Driver P1\*$/);
  const html = S.html(ls, {}, '');
  assert.match(html, /ΦΟΡΤΗΓΟ/);
  assert.match(html, /TST-P 104/);
  // nothing typed: the head is the old one, key for key (no plates / pdriver keys)
  const h0 = S.lines(board(false).cycles.find((x) => x.rt_id === 104), PL, 'ALL').find((l) => l.t === 'head');
  assert.ok(!('plates' in h0) && !('pdriver' in h0));
});
