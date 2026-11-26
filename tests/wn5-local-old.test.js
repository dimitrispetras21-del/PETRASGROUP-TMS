// node --test tests/wn5-local-old.test.js
// National v5, item D (owner 25/11): the distance rule of the local pickups and the fold of the old requests, on the
// REAL files, synthetic data only (places and clients are invented; coordinates are round numbers near Veroia).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
global.LoadPlan = require(path.join(ROOT, 'core/load-plan.js'));
const L = require(path.join(ROOT, 'core/wn5-logic.js'));

const HUB = 1;
// hub at 40.52 / 22.20; place 6 ≈ 14 km, place 7 ≈ 78 km, place 8 ≈ 82 km, place 9 ≈ 300 km, place 10 no coordinates
const COORDS = { 1: { lat: 40.52, lon: 22.2 }, 6: { lat: 40.64, lon: 22.25 }, 7: { lat: 40.52, lon: 23.124 }, 8: { lat: 40.52, lon: 23.171 },
  9: { lat: 37.98, lon: 23.72 }, 10: { lat: NaN, lon: NaN } };
const coord = (id) => COORDS[id] || null;

const vsExp = (piece, order, from, day, extra) => Object.assign({ piece_id: piece, kind: 'vs_export', order_id: order, client: 'ΠΕΛΑΤΗΣ Τ', reference: 'T-' + order,
  pallets: 10, nat_from_location_id: from, nat_to_location_id: HUB, nat_ready_day: day, nat_due_day: day, load_from: null, load_to: null, deliver_from: null, deliver_to: null }, extra || {});
const board = (waiting) => ({ week: '2026-11-21', cycles: [], waiting, hub: [], notices: [] });
const rowsOf = (m) => m.days.flatMap((d) => d.rows);
const row = (m, piece) => rowsOf(m).find((r) => r.pieceIds && r.pieceIds.includes(piece));

test('distance rule: 80 km, haversine to the hub, one named constant', () => {
  assert.strictEqual(L.LOCAL_PICKUP_KM, 80);
  assert.ok(Math.abs(L.kmBetween(COORDS[1], COORDS[7]) - 78) < 1);
  assert.ok(Math.abs(L.kmBetween(COORDS[1], COORDS[8]) - 82) < 1);
  assert.strictEqual(L.localPlace(6, coord, HUB), true);
  assert.strictEqual(L.localPlace(7, coord, HUB), true, '78 km is local');
  assert.strictEqual(L.localPlace(8, coord, HUB), false, '82 km is not');
  assert.strictEqual(L.localPlace(9, coord, HUB), false);
});

test('distance rule: a place or a hub without coordinates is never local (null = cannot tell)', () => {
  assert.strictEqual(L.localPlace(10, coord, HUB), null);
  assert.strictEqual(L.localPlace(99, coord, HUB), null, 'a place the catalogue does not hold');
  assert.strictEqual(L.localPlace(6, coord, null), null, 'no hub id');
  assert.strictEqual(L.localPlace(6, null, HUB), null, 'no catalogue');
  assert.strictEqual(L.localPlace(HUB, coord, HUB), null, 'the hub is not a pickup');
  assert.strictEqual(L.localPlace(6, (id) => (id === HUB ? null : coord(id)), HUB), null, 'the hub has none');
});

test('board: a VS export picked up near Veroia is a local pickup, out of ΕΠΟΜΕΝΑ; a far one stays', () => {
  const m = L.model(board([vsExp(1, 11, 6, '2026-11-23'), vsExp(2, 12, 9, '2026-11-23'), vsExp(3, 13, 8, '2026-11-24')]), { hubId: HUB, today: '2026-11-23', coord });
  assert.strictEqual(row(m, 1).pickupLocal, true);
  assert.strictEqual(row(m, 2).pickupLocal, false);
  assert.strictEqual(row(m, 3).pickupLocal, false, '82 km');
  assert.deepStrictEqual(m.queue.map((q) => q.pieceId).sort(), [2, 3], 'the local pickup is no ΕΠΟΜΕΝΑ card');
  assert.deepStrictEqual(m.errors, []);
});

test('board: without the coordinates catalogue nothing is local and the model adds no line', () => {
  const m = L.model(board([vsExp(1, 11, 6, '2026-11-23')]), { hubId: HUB, today: '2026-11-23' });
  assert.strictEqual(row(m, 1).pickupLocal, false);
  assert.strictEqual(m.queue.length, 1);
  assert.deepStrictEqual(m.errors, []);
});

test('board: a place without coordinates keeps the row ΠΡΟΣ ΑΝΑΘΕΣΗ and is said once', () => {
  const place = (id) => ({ name: 'ΤΟΠΟΣ ' + id });
  const m = L.model(board([vsExp(1, 11, 10, '2026-11-23'), vsExp(2, 12, 10, '2026-11-24')]), { hubId: HUB, today: '2026-11-23', coord, place });
  assert.strictEqual(row(m, 1).pickupLocal, false);
  assert.strictEqual(m.queue.length, 2);
  assert.strictEqual(m.errors.filter((e) => e.includes('ΤΟΠΟΣ 10') && e.includes('συντεταγμένες')).length, 1);
});

test('board: a groupage with one near and one far loading point is not local', () => {
  const m = L.model(board([vsExp(1, 11, 6, '2026-11-23'), vsExp(2, 11, 9, '2026-11-23')]), { hubId: HUB, today: '2026-11-23', coord });
  assert.strictEqual(row(m, 1).pickupLocal, false);
});

test('a national near Veroia is not a local pickup (only VS exports are)', () => {
  const nat = vsExp(1, null, 6, '2026-11-23', { kind: 'national', order_id: null, nat_order_id: 31, direction: 'ANODOS' });
  const m = L.model(board([nat]), { hubId: HUB, today: '2026-11-23', coord });
  assert.strictEqual(row(m, 1).pickupLocal, false);
});

test('old requests: a load waiting since before the week is marked old on the first day, counted apart in ΕΠΟΜΕΝΑ', () => {
  const m = L.model(board([vsExp(1, 11, 9, '2026-10-29'), vsExp(2, 12, 9, '2026-11-23')]), { hubId: HUB, today: '2026-11-23', coord });
  assert.strictEqual(row(m, 1).old, true);
  assert.strictEqual(row(m, 2).old, false);
  assert.ok(m.days[0].rows.includes(row(m, 1)), 'carried to the week\'s first day, as before');
  assert.deepStrictEqual(m.queue.map((q) => [q.pieceId, q.old]).sort(), [[1, true], [2, false]]);
});

test('old requests: in another (not the current) week they stay out, as before', () => {
  const m = L.model(board([vsExp(1, 11, 9, '2026-10-29')]), { hubId: HUB, today: '2026-12-01', coord });
  assert.strictEqual(row(m, 1), undefined);
});

test('screen: the fold, the local group and ΕΠΟΜΕΝΑ read the model; no screen keeps a copy of the rule', () => {
  const src = fs.readFileSync(path.join(ROOT, 'modules/weekly_natl_v5.js'), 'utf8');
  assert.match(src, /παλιά αιτήματα · \$\{old\.length\}/);
  assert.match(src, /Τοπικές παραλαβές · \$\{loc\.length\}/);
  assert.match(src, /const q = m\.queue\.filter\(\(it\) => !it\.old\);/, 'ΕΠΟΜΕΝΑ · N = the week\'s own (owner 25/11)');
  assert.doesNotMatch(src, /LOCAL_PICKUP_KM\s*=|kmBetween\s*\(|6371/, 'no copy in the board');
  const act = fs.readFileSync(path.join(ROOT, 'modules/wn5_actions.js'), 'utf8');
  assert.match(act, /WN5L\.localPlace\(/, 'the «+» list reads the same rule');
  assert.doesNotMatch(act, /LOCAL_PICKUP_KM\s*=|6371/, 'no copy in the actions');
});
