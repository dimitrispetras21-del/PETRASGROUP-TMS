// node --test tests/wn5-logic.test.js
// National v5 F4α Task T4 — core/wn5-logic.js (WN5L): the board model from the JSON of GET /plan/board.
//   - every rule of the base (dim / side_dim / cycle_dim / has_late / has_vehicle / overdue) is COPIED, never
//     computed (spec §3 Board, S-89): a past stop with dim:false stays bold;
//   - days by the Veroia loading day of ΚΑΘΟΔΟΣ, the Veroia window on the side (never on the vehicle, owner 25/10);
//   - an absent `segments` key = one tile from the cycle, a malformed one is loud (OPEN-9);
//   - the fixture is the shape of 072 plan_board, key for key, and carries no money key (drift test, principle 3).
// The module is require()d (UMD) and also run in a vm to prove it adds only WN5L.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const L = require(path.join(ROOT, 'core/wn5-logic.js'));
const FIX_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures/wn5-week.json'), 'utf8');
const fix = () => JSON.parse(FIX_TEXT);
// The Ε-26 keys the live 072 hub[] does NOT carry (072:2450): a variant adds them, as the Worker chain would.
const E26 = { 4101: [2, ['2026-10-12', '14:00', '17:00'], ['2026-10-13', '06:00', '08:00']], 4102: [3, ['2026-10-12', '14:00', '17:00'], ['2026-10-13', '07:00', '09:00']],
  4103: [4, ['2026-10-12', '18:00', '20:00'], ['2026-10-13', '09:00', '11:00']], 4104: [2, ['2026-10-16', '10:00', '12:00'], ['2026-10-17', '06:00', '08:00']] };
function withE26(b = fix()) {
  const t = (d, hm) => `${d}T${hm}:00+03:00`;
  for (const h of b.hub) {
    const e = E26[h.piece_id];
    if (e) Object.assign(h, { nat_to_location_id: e[0], load_from: t(e[1][0], e[1][1]), load_to: t(e[1][0], e[1][2]), deliver_from: t(e[2][0], e[2][1]), deliver_to: t(e[2][0], e[2][2]) });
  }
  return b;
}
const TODAY = '2026-10-13';
const M = (b = fix()) => L.model(b, { today: TODAY });
const rowOf = (m, key) => m.days.flatMap((d) => d.rows).find((r) => r.key === key);
const dayOf = (m, key) => (m.days.find((d) => d.rows.some((r) => r.key === key)) || {}).date;

test("F4α-T4: rows sorted by the Veroia loading day of KATHODOS; ANODOS-only cycle on its ANODOS day with 'Χωρίς κάθοδο'", () => {
  const m = M();
  assert.deepStrictEqual(m.days.map((d) => d.head), ['ΣΑΒΒΑΤΟ 10/10', 'ΚΥΡΙΑΚΗ 11/10', 'ΔΕΥΤΕΡΑ 12/10', 'ΤΡΙΤΗ 13/10', 'ΤΕΤΑΡΤΗ 14/10', 'ΠΕΜΠΤΗ 15/10', 'ΠΑΡΑΣΚΕΥΗ 16/10']);
  assert.deepStrictEqual(m.days.map((d) => d.rows.map((r) => r.key)), [
    ['rt:101'], [], ['rt:102', 'rt:103', 'rt:104', 'wait:4101', 'wait:4103'], [],
    ['rt:105', 'rt:106', 'wait:4105'], ['rt:107'], ['rt:108', 'wait:4104']]);
  assert.strictEqual(rowOf(m, 'rt:106').kath, null, 'an ANODOS-only cycle has no ΚΑΘΟΔΟΣ («Χωρίς κάθοδο»)');
  assert.strictEqual(rowOf(m, 'rt:105').dayKey, '2026-10-14', 'the Veroia loading day, not the first (Thessaloniki) stop');
  assert.deepStrictEqual(m.days.map((d) => d.empty), [false, true, false, true, false, false, false]);
  // VS-T133 comes without nat_ready_day (orders.cross_dock_date empty, a live 072 state): the day before its
  // nat_due_day (owner rule for an import VS, 23/8), never the week's Saturday
  assert.strictEqual(fix().hub.find((h) => h.piece_id === 4104).nat_ready_day, null);
  assert.strictEqual(rowOf(m, 'wait:4104').dayKey, '2026-10-16');
});

test('F4α-T4: cycle numbering «κύκλος 1» alone, «1/2» «2/2» for two cycles of one truck', () => {
  const m = M();
  assert.deepStrictEqual(rowOf(m, 'rt:101').cycleNo, { n: 1, m: 2 });
  assert.deepStrictEqual(rowOf(m, 'rt:107').cycleNo, { n: 2, m: 2 });
  assert.strictEqual(rowOf(m, 'rt:101').tiles[0].line2, 'Driver Test 01 · κύκλος 1/2');
  assert.strictEqual(rowOf(m, 'rt:103').tiles[0].line2, 'Driver Test 03 · κύκλος 1');
  assert.strictEqual(rowOf(m, 'rt:104').cycleNo, null, 'a partner is not numbered');
  assert.deepStrictEqual([...L.cycleNumbers(fix().cycles).keys()].sort(), [101, 102, 103, 105, 106, 107]);
});

test('F4α-T4: Veroia window lives on the side (side.veroia), never on the tile', () => {
  const m = M();
  assert.deepStrictEqual(rowOf(m, 'rt:102').kath.veroia, { stopId: 1101, from: '16:00', to: '18:00' });
  // live 072: the VS sits in hub[] without load_from/load_to (Ε-26) — «Βέροια» with «—», never an invented time
  assert.deepStrictEqual(rowOf(m, 'wait:4101').kath.veroia, { stopId: null, from: null, to: null }, 'a VS at the hub says «Βέροια» before its window is on the board');
  assert.deepStrictEqual(rowOf(M(withE26()), 'wait:4101').kath.veroia, { stopId: null, from: '14:00', to: '17:00' }, 'and its Veroia time once the Ε-26 keys come');
  for (const r of m.days.flatMap((d) => d.rows)) {
    assert.ok(!/\d{1,2}:\d{2}/.test(JSON.stringify(r.tiles)), `${r.key}: a time inside the ΑΝΑΘΕΣΗ tile: ${JSON.stringify(r.tiles)}`);
  }
  assert.strictEqual(rowOf(m, 'rt:101').end.place, 'Βέροια');
  assert.strictEqual(L.athensTime(rowOf(m, 'rt:101').end.by), '22:00');
});

test("F4α-T4 / F5 FE-2: a VS no truck took (hub[]) → row kind 'unassigned', rail red, never dims; «—»; without the Ε-26 keys a shape error, never a waiting line", () => {
  const m = M();
  const r = rowOf(m, 'wait:4101');
  assert.ok(r, 'VS-T118 is in hub[] (071:419 at_hub, 072:2443) and must still be a «ΠΡΟΣ ΑΝΑΘΕΣΗ» row');
  assert.deepStrictEqual({ kind: r.kind, rail: r.rail, rowDim: r.rowDim, pallets: r.kath.pallets, points: r.kath.to.length, group: r.group, pieces: r.pieceIds },
    { kind: 'unassigned', rail: 'red', rowDim: false, pallets: 27, points: 2, group: { order_id: 2101 }, pieces: [4101, 4102] });
  assert.ok(r.kath.to.every((p) => p.dim === false && p.from === null && p.to === null) && r.kath.headDim === false, 'no invented window');
  // FE-2 (owner 28/10): the «… δεν ήρθαν (Worker)» line is gone; from day L 074a sends the keys, so their absence is
  // a broken board in the error strip — one line per row, naming the key
  assert.ok(!('miss' in r), 'no waiting line on the row: ' + r.miss);
  assert.deepStrictEqual(m.errors.filter((e) => /ήρθε χωρίς/.test(e)),
    ['VS-T118: ο πίνακας ήρθε χωρίς «deliver_from» — τα παράθυρα δείχνουν «—»', 'VS-T121: ο πίνακας ήρθε χωρίς «deliver_from» — τα παράθυρα δείχνουν «—»',
     'VS-T133: ο πίνακας ήρθε χωρίς «deliver_from» — τα παράθυρα δείχνουν «—»']);
  assert.strictEqual(r.tiles[0].type, 'un');
  assert.ok(!m.hub.split.some((x) => [4101, 4102, 4103, 4104].includes(x.pieceId)), 'a never-assigned VS is never «για μοίρασμα»');
  const m2 = M(withE26()), r2 = rowOf(m2, 'wait:4101');
  assert.deepStrictEqual(m2.errors, [], 'with the Ε-26 keys the board draws without a shape error');
  // a key PRESENT with null (a stop without a window) is not a broken board: «—», no error
  const bn = withE26();
  for (const h of bn.hub) if (h.piece_id === 4103) h.deliver_from = h.deliver_to = null;
  const mn = M(bn);
  assert.deepStrictEqual([mn.errors, rowOf(mn, 'wait:4103').kath.to.map((p) => p.from)], [[], [null]]);
  assert.deepStrictEqual(r2.kath.to.map((p) => [p.from, p.to]), [['06:00', '08:00'], ['07:00', '09:00']]);
  // a national that loads at Veroia without a truck sits in hub[] too (same 071 rule): a row, never ΕΠΟΜΕΝΑ, never «σπάσιμο»
  const b = fix();
  b.hub.push(Object.assign({}, b.hub.find((h) => h.piece_id === 4101), { piece_id: 4190, shipment_id: 4290, kind: 'national', order_id: null, nat_order_id: 3290, order_stop_id: null, reference: 'N-T090', pallets: 6 }));
  const m3 = M(b);
  assert.strictEqual((rowOf(m3, 'wait:4190') || {}).kind, 'unassigned');
  assert.ok(!m3.hub.split.some((x) => x.pieceId === 4190) && !m3.queue.some((q) => q.pieceId === 4190));
  assert.strictEqual(rowOf(m, 'rt:108').rail, 'red', 'a cycle without a vehicle is «ΠΡΟΣ ΑΝΑΘΕΣΗ» too');
  // one national order that loads at Veroia (hub[]) AND at Lamia (waiting[]), Ε-19 N×1: ONE row, as the base assigns
  // it (plan_put_group takes the order's waiting pieces whole), with the «Βέροια» head AND the Lamia loading point —
  // the lowest piece does not decide alone
  const b4 = fix();
  b4.hub.push(Object.assign({}, b4.hub.find((h) => h.piece_id === 4101), { piece_id: 4191, shipment_id: 4291, kind: 'national', order_id: null, nat_order_id: 3291, order_stop_id: null, reference: 'N-T091', pallets: 5 }));
  b4.waiting.push(Object.assign({}, b4.waiting[0], { piece_id: 4192, shipment_id: 4292, nat_order_id: 3291, reference: 'N-T091', pallets: 7 }));
  const m4 = M(b4), r4 = rowOf(m4, 'wait:4191');
  assert.ok(r4 && !rowOf(m4, 'wait:4192'), 'one row for the order');
  assert.deepStrictEqual({ veroia: r4.kath.veroia, from: r4.kath.from.map((p) => [p.name, p.from, p.to, p.pallets]), pieces: r4.pieceIds, group: r4.group, pallets: r4.kath.pallets, day: r4.dayKey },
    { veroia: { stopId: null, from: null, to: null }, from: [['—', '08:00', '10:00', 7]], pieces: [4191, 4192], group: { nat_order_id: 3291 }, pallets: 12, day: '2026-10-12' });
});

test('F4α-T4: dim/headDim/sideDim/rowDim copied from dim/side_dim/cycle_dim; the model computes no date rule', () => {
  const m = M();
  const r101 = rowOf(m, 'rt:101'), r102 = rowOf(m, 'rt:102');
  assert.strictEqual(r101.rowDim, true);
  assert.deepStrictEqual({ head: r102.kath.headDim, side: r102.kath.sideDim, row: r102.rowDim, to: r102.kath.to.map((p) => p.dim) },
    { head: true, side: false, row: false, to: [false, false, false] });
  // S-89: a stop whose day has passed but the base says dim:false stays bold — and the reverse.
  const b = fix();
  b.cycles.find((c) => c.rt_id === 101).stops.find((s) => s.stop_id === 1002).dim = false;
  b.cycles.find((c) => c.rt_id === 105).stops.find((s) => s.stop_id === 1403).dim = true;
  const m2 = M(b);
  assert.strictEqual(rowOf(m2, 'rt:101').kath.to.find((p) => p.stopId === 1002).dim, false);
  assert.strictEqual(rowOf(m2, 'rt:105').kath.to.find((p) => p.stopId === 1403).dim, true, 'a future stop the base calls dim is dim');
  // and «today» changes no flag
  assert.deepStrictEqual(JSON.stringify(L.model(fix(), { today: '2026-12-31' }).days.map((d) => d.rows.map((r) => r.rowDim))),
    JSON.stringify(M().days.map((d) => d.rows.map((r) => r.rowDim))));
});

test('F4α-T4: capacity sums load legs of the side; over = pallets − 33', () => {
  const c101 = fix().cycles.find((c) => c.rt_id === 101);
  assert.deepStrictEqual(L.capacity(c101.stops.filter((s) => s.side === 'KATHODOS')), { pallets: 31, over: 0 });
  assert.deepStrictEqual(L.capacity(c101.stops.filter((s) => s.side === 'ANODOS')), { pallets: 14, over: 0 });
  const big = [{ legs: [{ act: 'load', pallets: 20.5 }, { act: 'load', pallets: 15.6 }, { act: 'unload', pallets: 99 }] }];
  assert.deepStrictEqual(L.capacity(big), { pallets: 36.1, over: 3.1 });
  assert.strictEqual(rowOf(M(), 'rt:108').kath.over, 0, '33 is full, not over');
});

test('F4α-T4: queue = the VS of the «ΠΡΟΣ ΑΝΑΘΕΣΗ» rows (hub[] never-assigned + waiting[]); late = overdue; no stock, no national, no VS already on a truck', () => {
  const q = M().queue;
  assert.deepStrictEqual(q.map((x) => [x.code, x.reason, x.pallets, x.day]),
    [['VS-T118', 'no_truck', 27, '2026-10-12'], ['VS-T121', 'late', 3, '2026-10-12'], ['VS-T133', 'no_truck', 33, '2026-10-16']]);
  assert.ok(!q.some((x) => x.code === 'N-T020'), 'a national load is not in ΕΠΟΜΕΝΑ');
  const b = fix();
  b.hub.push(Object.assign({}, b.hub.find((h) => h.piece_id === 4101), { piece_id: 4199, shipment_id: 4299, order_id: 2199, reference: 'VS-T199', is_stock: true }));
  assert.ok(!M(b).queue.some((x) => x.code === 'VS-T199'), 'stock never enters the queue');
  // «late» = the base's overdue of a VS still WITHOUT a truck (v_piece_state.overdue). A VS on a cycle that delivers
  // after its day is that row's amber rail (has_late), never an ΕΠΟΜΕΝΑ card: it already has a truck.
  const b2 = fix();
  b2.cycles.find((c) => c.rt_id === 102).stops.find((s) => s.stop_id === 1103).has_late = true;   // VS-T102 delivers late on RT-T102
  const m2 = M(b2);
  assert.ok(rowOf(m2, 'rt:102').late && !m2.queue.some((x) => x.code === 'VS-T102'), 'a VS on a truck that is late stays on its row');
});

test('F4α-T4: hub split = unloaded at Veroia by a cycle (inbound_rt_id) or for_split, never a never-assigned piece; stock; overdue → red; nothing to split or hold → hub.empty', () => {
  const h = M().hub;
  assert.deepStrictEqual({ day: h.day, split: h.split.map((x) => x.pieceId), stock: h.stock.map((x) => [x.pieceId, x.overdue, x.leave_by]), pallets: h.pallets, empty: h.empty },
    { day: TODAY, split: [4302], stock: [[4301, true, '2026-10-12']], pallets: { split: 20, stock: 13 }, empty: false });
  // the Ε-41 key (not in 072): what ✈ «Σπάσιμο» sent back is «για μοίρασμα», and leaves the rows and the queue
  const b = fix();
  for (const x of b.hub) if (x.order_id === 2101) x.for_split = true;
  const m2 = M(b);
  assert.deepStrictEqual(m2.hub.split.map((x) => x.pieceId), [4101, 4102, 4302]);
  assert.ok(!rowOf(m2, 'wait:4101') && !m2.queue.some((x) => x.code === 'VS-T118'), 'for_split: the Veroia board only');
  const b3 = fix(); b3.hub = b3.hub.filter((x) => x.is_stock !== true && x.inbound_rt_id == null);
  assert.strictEqual(M(b3).hub.empty, true, 'only never-assigned pieces: rows, and the Veroia line stays hidden');
  const b4 = fix(); b4.hub = [];
  assert.strictEqual(M(b4).hub.empty, true);
});

test('F4α-T4: the hub id from base facts; a week with no VS on a truck still says «Βέροια» on hub[] rows, cycles take opts.hubId', () => {
  assert.strictEqual(M().hubId, 1);
  const b = withE26();   // the 074a shape (FE-2): only the hub line may be in errors, compared exactly
  for (const c of b.cycles) for (const s of c.stops) s.legs = s.legs.filter((l) => !String(l.kind).startsWith('vs_'));
  const m = M(b);
  assert.strictEqual(m.hubId, null, 'no VS leg, no vs_export waiting: nothing on the 072 board names the hub (Ε-27)');
  assert.ok(rowOf(m, 'wait:4101').kath.veroia, 'a hub[] row is at Veroia by the base rule (071 at_hub), whatever the id');
  assert.strictEqual(rowOf(m, 'rt:102').kath.veroia, null, 'without an id a cycle cannot name its Veroia stop');
  // ... and the board SAYS so (principle 1, Ε-44): the Veroia times are missing and Veroia reads as an ordinary stop
  assert.deepStrictEqual(m.errors, [L.HUB_UNKNOWN], 'a week whose hub is not identified carries one visible line');
  assert.ok(/Βέροια δεν αναγνωρίστηκε/.test(L.HUB_UNKNOWN), L.HUB_UNKNOWN);
  const mh = L.model(b, { today: TODAY, hubId: 1 });
  assert.deepStrictEqual(rowOf(mh, 'rt:102').kath.veroia, { stopId: 1101, from: '16:00', to: '18:00' }, 'opts.hubId (PlanIds.hub) names it');
  assert.deepStrictEqual(mh.errors, [], 'with opts.hubId the line goes');
  const be = withE26(); be.cycles = [];
  assert.deepStrictEqual([M(be).hubId, M(be).errors], [null, [L.HUB_UNKNOWN]],
    'no cycle but a waiting national: its side needs the hub, so the line stays');
  const bn = withE26(); bn.cycles = []; bn.waiting = bn.waiting.filter((w) => w.kind !== 'national');
  assert.deepStrictEqual([M(bn).hubId, M(bn).errors], [null, []], 'no cycle and no waiting national: nothing to place, no line');
});

test('F4α-T4: WN5L.CAP = the over_33 threshold of 072', () => {
  // principle 3: the x/33 of the screen and the base's warning are one number; a change in 072 breaks the build here
  const m = /'over_33'[\s\S]{0,600}?having\s+sum\(pp\.pallets\)\s*>\s*(\d+)/.exec(fs.readFileSync(path.join(ROOT, 'worker/migrations/072_plan_functions.sql'), 'utf8'));
  assert.ok(m, 'the over_33 HAVING of 072 not found');
  assert.strictEqual(L.CAP, Number(m[1]));
});

test("F4α-T4: no segments key → one tile from the cycle (segSource 'cycle'); segments [] or non-array → ShapeError", () => {
  const c = fix().cycles[0];
  assert.deepStrictEqual(L.segmentsOf(c).source, 'cycle');
  assert.strictEqual(L.segmentsOf(c).segments.length, 1);
  assert.strictEqual(rowOf(M(), 'rt:101').segSource, 'cycle');
  for (const bad of [[], 'x', null, {}]) {
    assert.throws(() => L.segmentsOf(Object.assign({}, c, { segments: bad })), L.ShapeError, JSON.stringify(bad));
  }
  const b = fix(); b.cycles[0].segments = [];
  assert.throws(() => M(b), L.ShapeError);
  for (const k of ['cycles', 'waiting', 'hub', 'notices']) {
    const x = fix(); x[k] = {};
    assert.throws(() => M(x), (e) => e instanceof L.ShapeError && e.what === k, k);
  }
});

test('F4α-T4: partner_rate null → rates.missing (open item, never 0)', () => {
  const r = rowOf(M(), 'rt:104');
  assert.deepStrictEqual(r.rates, { partner_rate: null, missing: true });
  // one-segment cycle = F0 7745 / H1 rows 2–6: line 2 is the partner's plate, which the 072 board does not carry
  // (Ε-35, Ε-36) → «—»; the rate / «κόμιστρο λείπει» lives in Δ1, the move list and the H3 segment tiles (Ε-13)
  assert.deepStrictEqual([r.tiles[0].line1, r.tiles[0].line2, r.tiles[0].missing], ['Partner Test Pelagos', '—', false]);
  const b = fix(); b.cycles.find((c) => c.rt_id === 104).partner_rate = 300;
  const r2 = rowOf(M(b), 'rt:104');
  assert.deepStrictEqual(r2.rates, { partner_rate: 300, missing: false });
  assert.deepStrictEqual([r2.tiles[0].line2, r2.tiles[0].partnerRate], ['—', 300], 'the rate stays data, never on the one-segment tile');
  const segs = (rate) => [{ segment_id: 1, label: 'initial', trip_type: 'OWNED', truck: 'TST-2104', driver: 'Driver Test 01', has_vehicle: true, stop_ids: [] },
    { segment_id: 2, label: 'final', trip_type: 'PARTNER', partner: 'Partner Test Pelagos', partner_rate: rate, has_vehicle: true, stop_ids: [] }];
  const b2 = fix(); b2.cycles.find((c) => c.rt_id === 104).segments = segs(null);
  assert.deepStrictEqual([rowOf(M(b2), 'rt:104').tiles[1].line2, rowOf(M(b2), 'rt:104').tiles[1].missing], ['κόμιστρο λείπει', true], 'H3 segment tile');
  b2.cycles.find((c) => c.rt_id === 104).segments = segs(300);
  assert.strictEqual(rowOf(M(b2), 'rt:104').tiles[1].line2, '300 €');
});

test('F4α-T4: the module never calls Date.now() / new Date() without an argument', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core/wn5-logic.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/Date\.now\s*\(/.test(src), 'Date.now() in core/wn5-logic.js');
  assert.ok(!/new Date\(\s*\)/.test(src), 'new Date() without an argument in core/wn5-logic.js');
  const ctx = {}; ctx.window = ctx;
  const before = new Set(Object.keys(ctx));
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'core/wn5-logic.js'), 'utf8'), ctx);
  assert.deepStrictEqual(Object.keys(ctx).filter((k) => !before.has(k)), ['WN5L']);
});

// ── drift: the fixture's keys are the jsonb_build_object keys of 072 plan_board (and of the 071 view / table it
//    serialises whole), both ways. A key the base adds or drops fails here, at build time, not on the screen.
const SQL072 = fs.readFileSync(path.join(ROOT, 'worker/migrations/072_plan_functions.sql'), 'utf8');
const SQL071 = fs.readFileSync(path.join(ROOT, 'worker/migrations/071_plan_schema.sql'), 'utf8');
function seg(text, from, to, what) {
  const a = text.indexOf(from); assert.ok(a >= 0, `${what}: «${from}» not found`);
  const b = text.indexOf(to, a); assert.ok(b > a, `${what}: «${to}» not found`);
  return text.slice(a, b);
}
const keysIn = (s) => [...new Set([...s.matchAll(/'([a-z_]+)',/g)].map((m) => m[1]))];
function boardShape() {
  const fn = seg(SQL072, 'CREATE FUNCTION public.plan_board(', 'CREATE FUNCTION public.plan_vs_state(', 'plan_board');
  const view = seg(SQL071, 'CREATE VIEW public.v_hub_bucket', 'WHERE ps.at_hub', 'v_hub_bucket');
  const viewCols = view.slice(view.indexOf('SELECT') + 6, view.indexOf('FROM')).split(',').map((c) => c.trim().split(/\s+AS\s+|\./i).pop().trim());
  const table = seg(SQL071, 'CREATE TABLE public.plan_notices (', 'CONSTRAINT', 'plan_notices');
  return {
    top: ['week', 'cycles', 'waiting', 'hub', 'notices'],
    cycle: [...keysIn(seg(fn, "'rt_id', vc.rt_id", "'stops', coalesce((", 'cycle')), 'stops', 'partner_rate'],
    stop: [...keysIn(seg(fn, "'stop_id', ss.stop_id", "'local_loading', (", 'stop')), 'local_loading', 'legs'],
    local: keysIn(seg(fn, "'local_move_id', lm.id", 'from local_moves lm', 'local_loading')).concat(['time_to']),
    leg: keysIn(seg(fn, "'leg_id', l.id", 'from piece_legs l', 'legs')).concat(['temperature_c']),
    waiting: keysIn(seg(fn, "'piece_id', ps.piece_id", 'from v_piece_state ps', 'waiting')).concat(['deliver_to']),
    hub: [...viewCols, ...keysIn(seg(fn, "jsonb_build_object('client_id', vs.client_id", 'order by hb.nat_due_day', 'hub')), 'temperature_c'],
    notice: [...table.matchAll(/\b([a-z_]+)\s+(?:bigint|text|timestamptz)\b/g)].map((m) => m[1]),
  };
}
const same = (got, want, what) => assert.deepStrictEqual([...new Set(got)].sort(), [...new Set(want)].sort(), what);

test('F4α-T4: fixture keys = jsonb_build_object keys of plan_board in 072; no money key', () => {
  const W = boardShape();
  const f = fix();
  same(Object.keys(f), W.top, 'top level');
  for (const c of f.cycles) {
    same(Object.keys(c), W.cycle, `cycle ${c.rt_id}`);
    for (const s of c.stops) {
      same(Object.keys(s), W.stop, `stop ${s.stop_id}`);
      if (s.local_loading) same(Object.keys(s.local_loading), W.local, `local_loading of ${s.stop_id}`);
      for (const l of s.legs) same(Object.keys(l), W.leg, `leg ${l.leg_id}`);
    }
  }
  // price only on a national waiting load (072: «|| case when ps.nat_order_id is not null then price»)
  for (const w of f.waiting) same(Object.keys(w), w.nat_order_id != null ? W.waiting : W.waiting.filter((k) => k !== 'price'), `waiting ${w.piece_id}`);
  for (const h of f.hub) same(Object.keys(h), W.hub, `hub ${h.piece_id}`);
  for (const n of f.notices) same(Object.keys(n), W.notice, `notice ${n.id}`);
  assert.ok(!/"(amount|advance|expenses|invoice_number)"/.test(FIX_TEXT), 'a money key in the dispatcher fixture');
  // the fixture is the 072 shape (hub[] without the Ε-26 keys): from day L that IS a shape error (FE-2); with the
  // keys 074a adds, it draws clean
  assert.deepStrictEqual(M(withE26()).errors, [], 'the fixture + Ε-26 keys draws without a shape error');
});

// ── F4α-T24 (072b): a stop takes its segment ONLY from segments[].stop_ids (H-9) ─────────────────────────────
const WN5L_T24 = require(path.join(ROOT, 'core', 'wn5-logic.js'));
function segCycle() {
  const st = (stop_id, seq, side, from, to) => ({ stop_id, seq, side, location_id: stop_id, location: 'LOC ' + stop_id, planned_from: from, planned_to: to,
    stop_day: from.slice(0, 10), executed: false, has_vehicle: true, has_late: false, dim: false, side_dim: false, cycle_dim: false, local_loading: null, legs: [] });
  return { rt_id: 7, code: 'RT-T7', trip_type: 'OWNED', truck_id: 1, truck: 'TST-1', trailer_id: null, trailer: null, driver_id: 1, driver: 'Driver Test 01',
    partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-12T06:00:00+03:00', end_at: '2026-10-15T22:00:00+03:00',
    date_start: '2026-10-12', date_end: '2026-10-15', ended: false,
    stops: [st(1, 1, 'KATHODOS', '2026-10-12T06:00:00+03:00', '2026-10-12T08:00:00+03:00'),
            st(2, 2, 'KATHODOS', '2026-10-13T18:00:00+03:00', '2026-10-13T20:00:00+03:00'),
            st(3, 3, 'ANODOS', '2026-10-15T10:00:00+03:00', '2026-10-15T12:00:00+03:00')],
    segments: [
      { segment_id: 70, label: 'initial', from_at: '2026-10-12T06:00:00+03:00', to_at: '2026-10-13T14:30:00+03:00', trip_type: 'OWNED', truck_id: 1, truck: 'TST-1', trailer_id: null, trailer: null,
        driver_id: 1, driver: 'Driver Test 01', partner_id: null, partner: null, partner_rate: null, place_note: null, reason: null, reason_note: null, has_vehicle: true, stop_ids: [1] },
      // stop 3 lies inside this segment's TIME window but in no stop_ids: it must get no segment
      { segment_id: 71, label: 'final', from_at: '2026-10-13T14:30:00+03:00', to_at: '2026-10-15T22:00:00+03:00', trip_type: 'OWNED', truck_id: 2, truck: 'TST-2', trailer_id: null, trailer: null,
        driver_id: 2, driver: 'Driver Test 02', partner_id: null, partner: null, partner_rate: null, place_note: 'Λαμία', reason: 'vehicle_breakdown', reason_note: null, has_vehicle: true, stop_ids: [2] }] };
}
test('F4α-T24: a stop is coloured only from segments[].stop_ids (a stop in no stop_ids gets no segment)', () => {
  const m = WN5L_T24.stopSegments(segCycle());
  assert.deepStrictEqual(m.get(1), { segmentId: 70, label: 'initial' });
  assert.deepStrictEqual(m.get(2), { segmentId: 71, label: 'final' });
  assert.strictEqual(m.get(3), undefined);
  const one = segCycle(); one.segments = [Object.assign({}, one.segments[0], { label: null, stop_ids: [1, 2, 3] })];
  assert.strictEqual(WN5L_T24.stopSegments(one).size, 0, 'one segment = exactly today: no label (R-59)');
});
test('F4α-T24: the handover sits between the last stop of the segment before and the first stop after', () => {
  assert.deepStrictEqual(WN5L_T24.handoversOf(segCycle()), [{ at: '2026-10-13T14:30:00+03:00', place_note: 'Λαμία', reason: 'vehicle_breakdown', segmentId: 71, label: 'final', beforeStopId: 1, afterStopId: 2 }]);
  const no = segCycle(); delete no.segments;
  assert.deepStrictEqual(WN5L_T24.handoversOf(no), []);
});
test('F4α-T24: the board model carries segLabel per point and the handovers per row', () => {
  const mdl = WN5L_T24.model({ week: '2026-10-10', cycles: [segCycle()], waiting: [], hub: [], notices: [] }, { today: '2026-10-13' });
  const row = mdl.days.flatMap((d) => d.rows).find((r) => r.rtId === 7);
  const pts = [row.kath, row.anod].filter(Boolean).flatMap((s) => s.from.concat(s.to));
  const lab = Object.fromEntries(pts.map((p) => [p.stopId, p.segLabel]));
  assert.deepStrictEqual([lab[1], lab[2], lab[3]], ['initial', 'final', null]);
  assert.strictEqual(row.handovers.length, 1);
  assert.strictEqual(row.tiles.length, 2);
});

// Live fixes 28/10 (W45, the first day of the v5 board): waiting / hub places by id → name through opts.place, ΑΝΟΔΟΣ
// ΠΡΟΣ = «Βέροια», temperatures only where known, the queue's piece count.
test('live 28/10: waiting rows name their places from opts.place; an unknown id is «—» and ONE error line; no catalogue = «—», no line', () => {
  const b = { week: '2026-10-10', cycles: [], notices: [],
    waiting: [{ piece_id: 20, kind: 'vs_export', order_id: 616, client: 'ΠΕΛΑΤΗΣ Α', pallets: 24, temperature_c: 7, nat_from_location_id: 6, nat_to_location_id: 1, nat_ready_day: '2026-10-10', load_from: null, load_to: null },
      { piece_id: 21, kind: 'vs_export', order_id: 616, client: 'ΠΕΛΑΤΗΣ Α', pallets: 8, temperature_c: 7, nat_from_location_id: 9, nat_to_location_id: 1, nat_ready_day: '2026-10-10', load_from: null, load_to: null }],
    hub: [{ piece_id: 16, kind: 'vs_import', order_id: 604, client: 'ΠΕΛΑΤΗΣ Β', pallets: 11, temperature_c: null, nat_to_location_id: 3, nat_ready_day: '2026-10-12', is_stock: false, inbound_rt_id: null, deliver_from: null, deliver_to: null }] };
  const names = { 3: 'Aspropyrgos', 6: 'Thessaloniki' };
  const m = L.model(b, { today: TODAY, hubId: 1, place: (id) => (names[id] ? { name: names[id] } : null) });
  const rows = m.days.flatMap((d) => d.rows);
  const ex = rows.find((r) => r.pieceIds.includes(20)), im = rows.find((r) => r.pieceIds.includes(16));
  assert.strictEqual(ex.kath, null);
  assert.deepStrictEqual(ex.anod.from.map((p) => p.name), ['Thessaloniki', '—']);
  assert.deepStrictEqual(ex.anod.to.map((p) => p.name), ['Βέροια'], 'ΠΡΟΣ of a vs_export = the hub');
  assert.deepStrictEqual(ex.anod.from[0].temps, [7]);
  assert.deepStrictEqual(im.kath.to.map((p) => p.name), ['Aspropyrgos']);
  assert.deepStrictEqual(im.kath.to[0].temps, [], 'a missing temperature is no temperature, never 0');
  assert.deepStrictEqual(m.errors, ['τόπος #9 δεν υπάρχει στον κατάλογο τόπων — δείχνεται «—»']);
  assert.deepStrictEqual(m.queue.map((q) => [q.orderId, q.pieces]).sort(), [[604, 1], [616, 2]]);
  const bare = L.model(b, { today: TODAY, hubId: 1 });
  assert.deepStrictEqual(bare.days.flatMap((d) => d.rows).find((r) => r.pieceIds.includes(16)).kath.to.map((p) => p.name), ['—']);
  assert.deepStrictEqual(bare.errors, [], 'no catalogue: the screen says it in its own strip, not as a shape line per id');
});

test('075: waitSide — the hub ends first, then the order\'s own direction, else ΚΑΘΟΔΟΣ (one rule for the board and Δ1)', () => {
  assert.strictEqual(L.waitSide({ kind: 'national', nat_from_location_id: 5, nat_to_location_id: 6, direction: 'ANODOS' }, 1), 'ANODOS');
  assert.strictEqual(L.waitSide({ kind: 'national', nat_from_location_id: 5, nat_to_location_id: 6, direction: 'KATHODOS' }, 1), 'KATHODOS');
  assert.strictEqual(L.waitSide({ kind: 'national', nat_from_location_id: 5, nat_to_location_id: 6 }, 1), 'KATHODOS', 'no key (before 075) = as before');
  assert.strictEqual(L.waitSide({ kind: 'national', nat_from_location_id: 5, nat_to_location_id: 6, direction: null }, 1), 'KATHODOS');
  assert.strictEqual(L.waitSide({ kind: 'national', nat_from_location_id: 5, nat_to_location_id: 1, direction: 'KATHODOS' }, 1), 'ANODOS', 'towards the hub wins over a direction');
  assert.strictEqual(L.waitSide({ kind: 'national', nat_from_location_id: 1, nat_to_location_id: 6, direction: 'ANODOS' }, 1), 'KATHODOS', 'from the hub wins over a direction');
  assert.strictEqual(L.waitSide({ kind: 'vs_export', nat_to_location_id: 1 }, 1), 'ANODOS');
  assert.strictEqual(L.waitSide({ kind: 'vs_import', at_hub: true, nat_to_location_id: 3 }, 1), 'KATHODOS');
});
