// Rig — National v5 board, pack 2 (owner 31/10): delete from the board, drag of a point to another truck / day, a new
// point on the same truck, B-22 (PE «Όχι»), the invoice price for owner / accountant only. Judged by what reached the
// fake /plan/* (S.plan: method, path, raw body, order — «the table» of this rig) and by the DOM; never by a toast or a
// screenshot. Synthetic data only (public repo).
// Usage: node tests/critics/wn5-pack2-rig.js [menu delpt half delwait listdel drag day newpt newanod price f64 f65 f63 b22] [--shots <dir>]
//        WN5_TREE=<git archive origin/main> node tests/critics/wn5-pack2-rig.js   (plain-main proof: NO-GO, exit 1)
// Exit: 0 green · 1 a check failed · 2 unknown scenario.
'use strict';
const path = require('path');
const K = require('./wn5-rig-kit.js');

const UUIDRE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MENU = '#wn5-menu[data-wn5e="point"]';
const dlg = (k) => `.wi4-dlg[role="dialog"][data-wn5="${k}"]`;
const writes = (S) => S.plan.filter((e) => e.m !== 'GET' && !(e.body && e.body.dry_run === true));
const dries = (S) => S.plan.filter((e) => e.body && e.body.dry_run === true);
const noDry = (b) => { const o = Object.assign({}, b); delete o.dry_run; delete o.confirm_token; delete o.request_id; return o; };
const toasts = (page) => page.evaluate(() => (window.__ev || []).filter((x) => x.k === 'toast').map((x) => String(x.a[0])));
const MOVE_OK = [200, { ok: true, op: 'plan_move_pieces', dry_run: false, ids: { leg_ids: [], rt_ids: [] }, warnings: [], notice_ids: [] }];
const UPD_OK = (id, extra) => [200, { ok: true, op: 'plan_order_update', dry_run: false,
  ids: Object.assign({ nat_order_id: id, shipment_ids: [], new_shipment_ids: [], new_piece_ids: [], removed_shipment_ids: [] }, extra || {}), warnings: [], notice_ids: [] }];
const ATH = (iso) => Date.parse(iso);

// The kit week with order 3001 (N-T001) on TWO points of RT-T101's ΚΑΘΟΔΟΣ: Athens (stop 1002, beside the VS) and
// Aspropyrgos (stop 1003). Deleting one of them is a point, not the order.
function week2() {
  const b = K.week();
  const NA = { nat_order_id: 3001, reference: 'N-T001', client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', temperature_c: 4 };
  b.cycles[0].stops[0].legs.push(K.leg(5004, 4005, 'load', 4, NA));
  b.cycles[0].stops[1].legs.push(K.leg(5004, 4005, 'unload', 4, NA));
  return b;
}
function orders2() {
  const o = K.orders();
  o[3001].shipments.push(Object.assign({}, o[3001].shipments[0], { shipment_id: 5203, dest_location_id: 2, pallets: 4 }));
  return o;
}
async function shot(page, shots, name) {
  if (!shots) return;
  await page.screenshot({ path: path.join(shots, name + '.png') }).catch(() => {});
}
async function rclick(page, sel) {
  await page.click(sel, { button: 'right' }).catch(() => {});
  await page.waitForTimeout(250);
}
const items = (page) => page.$$eval(`${MENU} [role="menuitem"]`, (xs) => xs.map((x) => x.textContent.trim())).catch(() => null);
const pick = (page, label) => page.evaluate(([m, l]) => { const b = [...document.querySelectorAll(`${m} [role="menuitem"]`)].find((x) => x.textContent.trim() === l); if (b) b.click(); return !!b; }, [MENU, label]);
const PT = (rt, stop) => `#content .wn5-row[data-rt="${rt}"] .wn5-pt[data-stop="${stop}"]`;

// 1 · the right-click menu of a point
async function menu({ browser, origin, ok, scn, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: week2(), orders: orders2(), viewport: { width: 1440, height: 900 } });
  // at 1440 one point per cell is drawn (the second under «+1»): Athens (stop 1002, a VS and N-T001)
  await rclick(page, PT(101, 1002));
  ok(scn, 'right-click on a point → its menu (#wn5-menu[data-wn5e=point]) — main: the browser\'s own menu', await K.count(page, MENU) === 1);
  const it = await items(page);
  ok(scn, '… «Μεταφορά σε άλλο φορτηγό…» · «Διαγραφή σημείου» · «Διαγραφή παραγγελίας», no «Ακύρωση»',
    JSON.stringify(it) === JSON.stringify(['Μεταφορά σε άλλο φορτηγό…', 'Διαγραφή σημείου', 'Διαγραφή παραγγελίας']), it);
  const hd = await K.text(page, `${MENU} .wn5-m-hd`);
  ok(scn, '… head: the place, its day and the truck (plates · driver) — no RT code, no «κύκλος»', /ATHENS TEST · Τρί 13\/10/.test(hd) && /TST-2104 · Driver Test 01/.test(hd) && !/RT-|κύκλ/.test(hd), hd);
  await shot(page, shots, 'pack2-menu-1440');
  await page.keyboard.press('Escape');
  ok(scn, 'Esc closes it', await K.count(page, MENU) === 0);
  // a stop with a VS and a national: only the national is deleted from here (a VS is the international's) — the
  // ΑΝΟΔΟΣ loading of N-T002 (stop 1004) is another order: its own lines
  await rclick(page, PT(101, 1004));
  const it2 = await items(page);
  ok(scn, 'another point, another order: its lines (one order = no reference in the labels)', JSON.stringify(it2) === JSON.stringify(['Μεταφορά σε άλλο φορτηγό…', 'Διαγραφή σημείου', 'Διαγραφή παραγγελίας']), it2);
  await page.mouse.click(5, 5);
  ok(scn, 'a click outside closes it', await K.count(page, MENU) === 0);
  ok(scn, 'the menu writes nothing', writes(S).length === 0 && dries(S).length === 0, S.plan.map((x) => x.m + ' ' + x.path));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 2 · «Διαγραφή σημείου» of a riding point: out of the truck (two steps), then the point removed (077, request_id)
async function delpt({ browser, origin, ok, scn, shots }) {
  const plan = {
    'POST /plan/move': (e) => (e.body.dry_run === true
      ? [200, { ok: true, op: 'plan_move_pieces', dry_run: true, needs_confirm: true, confirm_token: 'tok-mv-1',
        consequences: [{ kind: 'executed_leg', rt_id: 101, code: 'RT-T101', stop_id: 1002, stop_day: '2026-10-13' }] }]
      : MOVE_OK),
    'PATCH /plan/orders/3001': () => UPD_OK(3001, { removed_shipment_ids: [5203] }),
  };
  const { page, S } = await K.openApp(browser, origin, { board: week2(), orders: orders2(), plan, viewport: { width: 1440, height: 900 } });
  await rclick(page, PT(101, 1002));
  await pick(page, 'Διαγραφή σημείου');
  await page.waitForSelector(dlg('delete'), { timeout: 6000 }).catch(() => {});
  ok(scn, 'the order is read first: GET /plan/orders/3001', K.planOf(S, 'GET', '/plan/orders/3001').length === 1);
  const d = dries(S);
  ok(scn, 'ONE dry run: POST /plan/move {from:{rt_id:101, piece_ids:[4005]}, target:{wait:true}} — N-T001\'s piece only, never the VS beside it', d.length === 1 && d[0].path === '/plan/move'
    && JSON.stringify(noDry(d[0].body)) === JSON.stringify({ from: { rt_id: 101, piece_ids: [4005] }, target: { wait: true } }), d.map((x) => x.raw));
  const t = await K.text(page, dlg('delete'));
  ok(scn, 'the dialog: «Διαγραφή σημείου ATHENS TEST;», the point, the truck x/33, the base\'s «διόρθωση» line (a day that passed is allowed)',
    /Διαγραφή σημείου ATHENS TEST;/.test(t) && /σβήνεται το σημείο ATHENS TEST · #N-T001 · 4π/.test(t) && /TST-2104 · Driver Test 01 · 31 → 27\/33/.test(t) && /διόρθωση: η παράδοση/.test(t), t.slice(0, 400));
  ok(scn, 'nothing written before the confirmation', writes(S).length === 0, writes(S).map((x) => x.raw));
  await shot(page, shots, 'pack2-delete-point-1440');
  await page.click(`${dlg('delete')} [data-act="confirm"]`);
  await page.waitForTimeout(1200);
  const w = writes(S);
  ok(scn, 'then TWO writes, in order: POST /plan/move (the token) · PATCH /plan/orders/3001', w.length === 2 && w[0].path === '/plan/move' && w[0].body.confirm_token === 'tok-mv-1'
    && w[1].m === 'PATCH' && w[1].path === '/plan/orders/3001', w.map((x) => x.m + ' ' + x.path + ' ' + x.raw));
  ok(scn, '… the PATCH removes exactly the point (shipment 5203), never the other (5202), with a request_id', !!w[1]
    && JSON.stringify(noDry(w[1].body)) === JSON.stringify({ shipments: [{ shipment_id: 5203, remove: true }] }) && UUIDRE.test(String(w[1].body.request_id)), w[1] && w[1].raw);
  ok(scn, 'the board is read again after it', K.planOf(S, 'GET', '/plan/board').length >= 2);
  const ts = await toasts(page);
  ok(scn, 'the toast names the point and the order', ts.some((x) => /Σβήστηκε το σημείο ATHENS TEST · #N-T001/.test(x)), ts);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 2b · the second write refused: the point is out of the truck and not deleted — said, with where it is
async function half({ browser, origin, ok, scn }) {
  // after the move the piece (it loads at Veroia) stands at the hub: the board read after it lists it in hub[]
  let moved = false;
  const atHub = () => { const b = week2(); b.cycles[0].stops.forEach((x) => { x.legs = x.legs.filter((l) => l.piece_id !== 4002); });
    b.hub.push({ piece_id: 4002, shipment_id: 5202, kind: 'national', order_id: null, nat_order_id: 3001, order_stop_id: null, pallets: 6, leave_by: null,
      position_location_id: 1, nat_from_location_id: 1, nat_to_location_id: 3, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-13', overdue: false, is_stock: false,
      client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', reference: 'N-T001', temperature_c: 4, pallet_exchange: false,
      load_from: '2026-10-12T13:00:00+00:00', load_to: '2026-10-12T15:00:00+00:00', deliver_from: '2026-10-13T04:00:00+00:00', deliver_to: '2026-10-13T06:00:00+00:00', direction: 'KATHODOS' });
    return b; };
  const plan = { 'POST /plan/move': (e) => (e.body.dry_run === true ? [200, { ok: true, op: 'plan_move_pieces', dry_run: true, needs_confirm: false, confirm_token: 't0', consequences: [] }] : (moved = true, MOVE_OK)),
    'GET /plan/board': (e, S) => [200, moved ? atHub() : S.board],
    'PATCH /plan/orders/3001': () => K.planErr(422, 'PLAN_RULE', 'piece_busy') };
  const { page, S } = await K.openApp(browser, origin, { board: week2(), orders: orders2(), plan });
  await rclick(page, PT(101, 1003));
  await pick(page, 'Διαγραφή σημείου');
  await page.waitForSelector(dlg('delete'), { timeout: 6000 }).catch(() => {});
  await page.click(`${dlg('delete')} [data-act="confirm"]`);
  await page.waitForTimeout(1200);
  const st = await K.text(page, '#content .wn5-acthost .wn5-strip');
  ok(scn, 'refused PATCH → the board strip says it left the truck and was not deleted, with the base\'s words and where it is',
    /βγήκε από το φορτηγό αλλά δεν σβήστηκε \(rig sentinel piece_busy\)/.test(st) && /Πίνακα Βέροιας: Καρτέλα παραγγελίας → Επεξεργασία/.test(st) && !/ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(st), st);
  await page.context().close();
  // a point that also rides another truck: said before anything is written
  const o2 = orders2();
  o2[3001].shipments[0].rt_codes = ['RT-T101', 'RT-T999'];
  const b = await K.openApp(browser, origin, { board: week2(), orders: o2 });
  await rclick(b.page, PT(101, 1003));
  await pick(b.page, 'Διαγραφή σημείου');
  await b.page.waitForTimeout(600);
  const st2 = await K.text(b.page, '#content .wn5-acthost .wn5-strip');
  ok(scn, 'a point on another truck too → refused before any write (no dry run, no write), with the way out', /είναι και σε άλλο φορτηγό/.test(st2)
    && dries(b.S).length === 0 && writes(b.S).length === 0, st2);
  ok(scn, 'no page errors (2)', !b.S.pageErrors.length, b.S.pageErrors);
  await b.page.context().close();
  return;
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 3 · a waiting point (ΠΡΟΣ ΑΝΑΘΕΣΗ row): one confirmation, one PATCH; the only point of an order = the order
async function delwait({ browser, origin, ok, scn }) {
  const o = K.orders();
  o[3101].shipments.push(Object.assign({}, o[3101].shipments[0], { shipment_id: 5204, dest_location_id: 4, pallets: 2 }));
  { const { page, S } = await K.openApp(browser, origin, { orders: o, plan: { 'PATCH /plan/orders/3101': () => UPD_OK(3101, { removed_shipment_ids: [5201] }) } });
    await rclick(page, '#content .wn5-row[data-piece="4101"] .wn5-pts');
    const it = await items(page);
    ok(scn, 'right-click on a ΠΡΟΣ ΑΝΑΘΕΣΗ row → «Διαγραφή σημείου» · «Διαγραφή παραγγελίας» (nothing to move)', JSON.stringify(it) === JSON.stringify(['Διαγραφή σημείου', 'Διαγραφή παραγγελίας']), it);
    await pick(page, 'Διαγραφή σημείου');
    await page.waitForSelector(dlg('delete'), { timeout: 6000 }).catch(() => {});
    const t = await K.text(page, dlg('delete'));
    ok(scn, 'its dialog names the route by place (ASPROPYRGOS TEST → ATHENS TEST) and the order', /ASPROPYRGOS TEST → ATHENS TEST · #N-T101 · 8π/.test(t), t);
    ok(scn, 'no dry run, nothing written before the confirmation', dries(S).length === 0 && writes(S).length === 0);
    await page.click(`${dlg('delete')} [data-act="confirm"]`);
    await page.waitForTimeout(900);
    const w = writes(S);
    ok(scn, 'ONE write: PATCH /plan/orders/3101 {shipments:[{5201 remove}]} + request_id', w.length === 1 && w[0].m === 'PATCH'
      && JSON.stringify(noDry(w[0].body)) === JSON.stringify({ shipments: [{ shipment_id: 5201, remove: true }] }) && UUIDRE.test(String(w[0].body.request_id)), w.map((x) => x.raw));
    ok(scn, 'no page errors (a)', !S.pageErrors.length, S.pageErrors);
    await page.context().close(); }
  { const { page, S } = await K.openApp(browser, origin, {});
    await rclick(page, '#content .wn5-row[data-piece="4101"] .wn5-pts');
    await pick(page, 'Διαγραφή σημείου');
    await page.waitForSelector(dlg('delete'), { timeout: 6000 }).catch(() => {});
    const d = dries(S);
    ok(scn, 'the only point of the order → the order\'s delete: POST /plan/delete {nat_order_id:3101} (dry run, reason asked)', d.length === 1 && d[0].path === '/plan/delete'
      && JSON.stringify(noDry(d[0].body)) === '{"nat_order_id":3101}' && await K.count(page, `${dlg('delete')} [data-field]`) === 1, d.map((x) => x.raw));
    ok(scn, 'no page errors (b)', !S.pageErrors.length, S.pageErrors);
    await page.context().close(); }
}

// 4 · «Άνοιγμα παραγγελιών» of a cycle: «Διαγραφή» on each national line
async function listdel({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: week2() });
  await page.click('#content .wn5-row[data-rt="101"] .wi4-plane');
  await page.click('#wn5-menu [data-item="orders"]');
  await page.waitForSelector(dlg('card'), { timeout: 6000 }).catch(() => {});
  ok(scn, 'the cycle\'s list: «Διαγραφή» on each national line (N-T001, N-T002), none on the VS line', await K.count(page, `${dlg('card')} [data-line="nat"] [data-act="del"]`) === 2
    && await K.count(page, `${dlg('card')} [data-line="vs"] [data-act="del"]`) === 0);
  await page.click(`${dlg('card')} [data-line="nat"] [data-act="del"][data-no="3001"]`);
  await page.waitForTimeout(600);
  const d = dries(S);
  ok(scn, '«Διαγραφή» → POST /plan/delete {nat_order_id:3001} dry run, the reason field, nothing written', d.length === 1 && d[0].path === '/plan/delete'
    && JSON.stringify(noDry(d[0].body)) === '{"nat_order_id":3001}' && writes(S).length === 0, d.map((x) => x.raw));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 5 · drag a point onto another truck's row → «Μεταφορά» to that truck after one confirmation
async function drag({ browser, origin, ok, scn, shots }) {
  const plan = { 'POST /plan/move': (e) => (e.body.dry_run === true ? [200, { ok: true, op: 'plan_move_pieces', dry_run: true, needs_confirm: false, confirm_token: 't0', consequences: [] }] : MOVE_OK) };
  const { page, S } = await K.openApp(browser, origin, { board: week2(), orders: orders2(), plan, viewport: { width: 1440, height: 900 } });
  await page.dragAndDrop(PT(101, 1002), '#content .wn5-row[data-rt="102"]').catch((e) => S.pageErrors.push('drag: ' + e.message));
  await page.waitForSelector(dlg('move'), { timeout: 6000 }).catch(() => {});
  const t = await K.text(page, dlg('move'));
  ok(scn, 'drop on RT-T102\'s row → «Μεταφορά · ATHENS TEST · 25π»: from truck → to truck, its x/33 — main: nothing happens',
    /Μεταφορά · ATHENS TEST · 25π/.test(t) && /TST-2104 · Driver Test 01 → TST-2108 · Driver Test 02/.test(t) && /TST-2108 · Driver Test 02 · 0 → 25\/33/.test(t), t.slice(0, 400));
  ok(scn, 'a drop writes nothing by itself', writes(S).length === 0, writes(S).map((x) => x.raw));
  await shot(page, shots, 'pack2-drag-truck-1440');
  await page.click(`${dlg('move')} [data-act="confirm"]`);
  await page.waitForTimeout(900);
  const w = writes(S);
  const b = w[0] && noDry(w[0].body);
  ok(scn, 'confirm → ONE POST /plan/move: the pieces of stop 1002 (VS 4001, N-T001 4005) to rt 102 ΚΑΘΟΔΟΣ', w.length === 1 && w[0].path === '/plan/move'
    && JSON.stringify(b.from) === '{"rt_id":101,"piece_ids":[4001,4005]}' && JSON.stringify(b.target) === '{"rt_id":102,"side":"KATHODOS"}', w.map((x) => x.raw));
  const hubSt = b && (b.stops || []).find((s) => s.location_id === 1), ath = b && (b.stops || []).find((s) => s.location_id === 2);
  ok(scn, '… its stops on rt 102: ONE Veroia with its own window (Mon 12/10 16:00–18:00), Athens Tue 13/10 06:00–08:00',
    !!hubSt && ATH(hubSt.planned_from) === ATH('2026-10-12T16:00:00+03:00') && ATH(hubSt.planned_to) === ATH('2026-10-12T18:00:00+03:00')
    && !!ath && ATH(ath.planned_from) === ATH('2026-10-13T06:00:00+03:00') && ath.side === 'KATHODOS' && b.stops.length === 2, b && b.stops);
  // a drop on the same row opens nothing
  await page.dragAndDrop(PT(101, 1002), '#content .wn5-row[data-rt="101"] .wn5-asg').catch(() => {});
  await page.waitForTimeout(300);
  ok(scn, 'a drop on its own row: no dialog', await K.count(page, '.wi4-dlg[role="dialog"]') === 0);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 6 · drag a point onto another day's head → its one-stop day panel with that day chosen, the dry run on screen
async function day({ browser, origin, ok, scn, shots }) {
  const PV = [200, { ok: true, op: 'plan_rt_update', dry_run: true, preview: { before: {}, after: {}, next_rt: null, conflict: null, vs_day: [], warnings: [] } }];
  const plan = { 'PATCH /plan/rt/101': (e) => (e.body.dry_run === true ? PV : [200, { ok: true, op: 'plan_rt_update', dry_run: false, ids: {}, warnings: [], notice_ids: [] }]) };
  const { page, S } = await K.openApp(browser, origin, { board: week2(), plan, viewport: { width: 1440, height: 900 } });
  await page.dragAndDrop(PT(101, 1002), '#content .wn5-day[data-date="2026-10-15"]').catch((e) => S.pageErrors.push('drag: ' + e.message));
  await page.waitForSelector(dlg('date'), { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(500);
  ok(scn, 'drop on Thu 15/10 → the day panel of THAT stop (data-stop=1002) — main: nothing happens', await K.count(page, `${dlg('date')}[data-stop="1002"]`) === 1);
  const d = dries(S);
  ok(scn, '… its dry run at once: PATCH /plan/rt/101 {stops:[{stop_id:1002, Thu 15/10 06:00–08:00}]}, no shift of the side', d.length === 1 && d[0].path === '/plan/rt/101'
    && Array.isArray(d[0].body.stops) && d[0].body.stops.length === 1 && d[0].body.stops[0].stop_id === 1002
    && ATH(d[0].body.stops[0].planned_from) === ATH('2026-10-15T06:00:00+03:00') && ATH(d[0].body.stops[0].planned_to) === ATH('2026-10-15T08:00:00+03:00') && !d[0].body.shift, d.map((x) => x.raw));
  ok(scn, 'nothing written by the drop', writes(S).length === 0);
  await shot(page, shots, 'pack2-drag-day-1440');
  await page.click(`${dlg('date')} [data-act="save"]`).catch(() => {});
  await page.waitForTimeout(900);
  const w = writes(S);
  ok(scn, '«Αποθήκευση» → the same body, written once', w.length === 1 && !!d[0] && JSON.stringify(noDry(w[0].body)) === JSON.stringify(noDry(d[0].body)), w.map((x) => x.raw));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 7 · a new point of a riding order goes on the same truck, after its last stop
async function newpt({ browser, origin, ok, scn }) {
  let added = false;
  const after = () => {
    const b = K.week();
    b.hub.push({ piece_id: 4301, shipment_id: 5301, kind: 'national', order_id: null, nat_order_id: 3001, order_stop_id: null, pallets: 1, leave_by: null,
      position_location_id: 1, nat_from_location_id: 1, nat_to_location_id: 4, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-13', overdue: false, is_stock: false,
      client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', reference: 'N-T001', temperature_c: 4, pallet_exchange: false,
      load_from: '2026-10-11T21:00:00+00:00', load_to: '2026-10-12T20:59:00+00:00', deliver_from: '2026-10-12T21:00:00+00:00', deliver_to: '2026-10-13T20:59:00+00:00', direction: 'KATHODOS' });
    return b;
  };
  const plan = {
    'GET /plan/board': (e, S) => [200, added ? after() : S.board],
    'PATCH /plan/orders/3001': () => { added = true; return UPD_OK(3001, { new_shipment_ids: [5301], new_piece_ids: [4301] }); },
    'POST /plan/legs': () => [200, { ok: true, op: 'plan_put_pieces', dry_run: false, ids: { leg_ids: [9001], rt_id: 101 }, warnings: [], notice_ids: [] }],
  };
  const { page, S } = await K.openApp(browser, origin, { plan });
  const DLG = dlg('order');
  await page.evaluate(() => WN5Form.openOrder({ natOrderId: 3001 }));
  await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  await page.click(`${DLG} [data-act="add-ship"][data-k="drop"]`).catch(() => {});
  await page.evaluate((d) => { const r = document.querySelector(`${d} [data-newship]`); fhPickLinked(r.dataset.pd, 'recWn5LocLar', 'LARISA TEST');
    const p = r.querySelector('[data-f="pal"]'); p.value = '1'; p.dispatchEvent(new Event('input', { bubbles: true })); }, DLG).catch((e) => S.pageErrors.push(String(e)));
  await page.click(`${DLG} [data-act="save"]`).catch(() => {});
  await page.waitForTimeout(2000);
  const w = writes(S);
  ok(scn, 'two writes: PATCH /plan/orders/3001 (the new point) then POST /plan/legs — main: the point waits, one write', w.length === 2 && w[0].path === '/plan/orders/3001' && w[1].path === '/plan/legs', w.map((x) => x.m + ' ' + x.path));
  const b = w[1] && w[1].body;
  ok(scn, '… the new piece 4301 onto rt 101 ΚΑΘΟΔΟΣ (the truck its other points ride)', !!b && JSON.stringify(b.pieces) === '[{"piece_id":4301}]' && JSON.stringify(b.target) === '{"rt_id":101,"side":"KATHODOS"}', b);
  const v = b && (b.stops || []).find((s) => s.stop_id === 1001), lar = b && (b.stops || []).find((s) => s.location_id === 4);
  ok(scn, '… Veroia = the truck\'s own stop (1001); Larisa (whole day) starts when the last stop ends: Tue 13/10 09:00 → 23:59',
    !!v && !!lar && ATH(lar.planned_from) === ATH('2026-10-13T09:00:00+03:00') && ATH(lar.planned_to) === ATH('2026-10-13T23:59:00+03:00'), b && b.stops);
  const done = await K.text(page, `${DLG} [data-done]`);
  ok(scn, 'the form says where it went (the truck), not «ΠΡΟΣ ΑΝΑΘΕΣΗ»', /νέο σημείο στο TST-2104 · Driver Test 01/.test(done) && !/ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(done), done);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 7b · ΑΝΟΔΟΣ: a new loading point goes after the last pickup, never after the Veroia end; a lost answer is «maybe»
async function newanod({ browser, origin, ok, scn }) {
  const b = K.week();
  // N-T002 rides RT-T101's ΑΝΟΔΟΣ (Aspropyrgos 12–14 → Veroia 20–22, Tue 13/10); its new point waits at Larisa (whole day)
  b.waiting.push({ piece_id: 4302, shipment_id: 5302, kind: 'national', order_id: null, nat_order_id: 3002, order_stop_id: null, pallets: 2, leave_by: null,
    position_location_id: 4, nat_from_location_id: 4, nat_to_location_id: 1, nat_ready_day: '2026-10-13', nat_due_day: '2026-10-13', overdue: false, is_stock: false,
    client_id: 43, client: 'ΠΕΛΑΤΗΣ Γ', reference: 'N-T002', temperature_c: 4, pallet_exchange: false, direction: 'ANODOS',
    load_from: '2026-10-12T21:00:00+00:00', load_to: '2026-10-13T20:59:00+00:00', deliver_from: '2026-10-12T21:00:00+00:00', deliver_to: '2026-10-13T20:59:00+00:00', price: 120 });
  let n = 0;
  const plan = { 'POST /plan/legs': () => (++n === 1 ? [200, { ok: true, op: 'plan_put_pieces', dry_run: false, ids: {}, warnings: [{ code: 'over_33', rt_id: 101, side: 'ANODOS', pallets: 34 }], notice_ids: [] }]
    : K.planErr(422, 'PLAN_RULE', 'plan_unknown')) };
  const { page, S } = await K.openApp(browser, origin, { board: b, plan });
  const r1 = await page.evaluate(() => { const h = document.createElement('div'); h.id = 'rig-host'; document.body.appendChild(h);
    return WN5Edit.putNew({ natOrderId: 3002, shipmentIds: [5302], host: h }).then((x) => x && { ok: x.ok, text: x.text }); });
  const x = K.planOf(S, 'POST', '/plan/legs')[0];
  const lar = x && (x.body.stops || []).find((s) => s.location_id === 4);
  ok(scn, 'onto rt 101 ΑΝΟΔΟΣ; Larisa starts when the last PICKUP ends (14:00), not after the Veroia end (22:00)', !!x && JSON.stringify(x.body.target) === '{"rt_id":101,"side":"ANODOS"}'
    && !!lar && Date.parse(lar.planned_from) === Date.parse('2026-10-13T14:00:00+03:00') && (x.body.stops || []).some((s) => s.stop_id === 1005), x && x.body);
  ok(scn, 'its warning (over_33) in the host it was given, the form\'s', !!r1 && r1.ok && await K.count(page, '#rig-host .wn5-strip[data-kind="warning"]') === 1, r1);
  const r2 = await page.evaluate(() => WN5Edit.putNew({ natOrderId: 3002, shipmentIds: [5302], host: document.getElementById('rig-host') }).then((x) => x && { ok: x.ok, text: x.text }));
  ok(scn, 'a lost answer (plan_unknown) → «μπορεί να έγινε», never «έμεινε ΠΡΟΣ ΑΝΑΘΕΣΗ»', !!r2 && !r2.ok && /μπορεί να έγινε/.test(r2.text || '')
    && !/έμεινε ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(await K.text(page, '#rig-host')), [r2, await K.text(page, '#rig-host')]);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 8 · the price (owner 31/10, study Κ1): every role while the national is not invoiced; once invoiced (the read says
// invoiced: true), owner and accountant only. A new order: every role.
async function price({ browser, origin, ok, scn }) {
  const st = async (role, invoiced) => {
    const orders = K.orders();
    if (invoiced) orders[3101].order.invoiced = true;
    const { page, S } = await K.openApp(browser, origin, { role, orders });
    const DLG = dlg('order');
    await page.evaluate(() => WN5Form.openOrder({ natOrderId: 3101 }));
    await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
    const edit = await page.$eval(`${DLG} [data-f="price"]`, (x) => ({ dis: x.disabled, v: x.value, t: x.title })).catch(() => null);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => WN5Form.openOrder({}));
    await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
    const create = await page.$eval(`${DLG} [data-f="price"]`, (x) => x.disabled).catch(() => null);
    const errs = S.pageErrors.slice();
    await page.context().close();
    return { edit, create, errs };
  };
  const d = await st('dispatcher', false), di = await st('dispatcher', true), ai = await st('accountant', true), oi = await st('owner', true), mi = await st('management', true);
  ok(scn, 'not invoiced: the dispatcher changes the price (Σωτήρης writes it when he learns it)', !!d.edit && !d.edit.dis && d.edit.v === '310', d.edit);
  ok(scn, 'invoiced: read only for dispatcher and management, says why — main: editable', !!di.edit && di.edit.dis && /Τιμολογημένη/.test(di.edit.t) && !!mi.edit && mi.edit.dis, [di.edit, mi.edit]);
  ok(scn, 'invoiced: accountant and owner still change it', !!ai.edit && !ai.edit.dis && !!oi.edit && !oi.edit.dis, [ai.edit, oi.edit]);
  ok(scn, 'a NEW order takes its price from every role', d.create === false && di.create === false, [d.create, di.create]);
  ok(scn, 'no page errors', [d, di, ai, oi, mi].every((x) => !x.errs.length), [d, di, ai, oi, mi].flatMap((x) => x.errs));
}

// 10 · F64 (live 31/10, VS 644): the same hour twice is «at 08:00», that day — never 24 h to the next day
async function f64({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, {});
  const w = await page.evaluate(() => { const k = WN5Act._kit; return [k.win('2026-10-13', '08:00', '08:00'), k.win('2026-10-13', '23:59', '23:59'), k.win('2026-10-13', '22:00', '02:00'), k.win('2026-10-13', '08:00', '10:00')]; });
  ok(scn, '08:00–08:00 → Tue 08:00–08:01, the same day — main: Tue 08:00 → Wed 08:00', JSON.stringify(w[0]) === JSON.stringify(['2026-10-13T08:00:00+03:00', '2026-10-13T08:01:00+03:00']), w[0]);
  ok(scn, '23:59–23:59 → Tue 23:58–23:59, the same day', JSON.stringify(w[1]) === JSON.stringify(['2026-10-13T23:58:00+03:00', '2026-10-13T23:59:00+03:00']), w[1]);
  ok(scn, 'a night window 22:00–02:00 still ends the next day; 08:00–10:00 as it was', JSON.stringify(w[2]) === JSON.stringify(['2026-10-13T22:00:00+03:00', '2026-10-14T02:00:00+03:00'])
    && JSON.stringify(w[3]) === JSON.stringify(['2026-10-13T08:00:00+03:00', '2026-10-13T10:00:00+03:00']), [w[2], w[3]]);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 11 · F65 (live 31/10): the stop-time panel in a six-week month keeps «Αποθήκευση» in view, at 1440×900 and 1440×700
async function f65({ browser, origin, ok, scn, shots }) {
  for (const h of [900, 700]) {
    const { page, S } = await K.openApp(browser, origin, { board: week2(), viewport: { width: 1440, height: h } });
    // anchored low on the board (the live case: a row in the lower half), so the panel opens under it with little room
    await page.evaluate(() => WN5Act.datePanel(101, 'KATHODOS', document.querySelector('#content .wn5-row[data-rt="102"]'), { stopId: 1002 }));
    await page.waitForSelector(dlg('date'), { timeout: 6000 }).catch(() => {});
    await page.click(`${dlg('date')} [data-act="mon"][data-d="1"]`).catch(() => {});   // → November 2026: six weeks
    await page.waitForTimeout(300);
    const v = await page.evaluate((D) => {
      const dd = document.querySelector(D), b = document.querySelector(`${D} [data-act="save"]`), r = b.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { scrolls: dd.scrollHeight > dd.clientHeight, inView: r.bottom <= innerHeight && r.top >= 0, hit: !!at && (at === b || b.contains(at)),
        month: (document.querySelector(`${D} [data-cal]`) || {}).textContent.slice(0, 40) };
    }, dlg('date'));
    ok(scn, `${h}px high, November 2026: «Αποθήκευση» in the window and on top (not under the calendar) — main: under it`, v.inView && v.hit && /Νοέμβριος/.test(v.month), v);
    await shot(page, shots, 'pack2-f65-november-1440x' + h);
    ok(scn, `no page errors (${h})`, !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
}

// 12 · F63 (live 31/10): «+» → «Πρόσθεσε» wrote and the board kept «Κενό γύρισμα» until «Ανανέωση», with no word.
// After the press: the board is read AGAIN after the POST /plan/legs, a toast says it, the truck's row flashes (F50).
async function f63({ browser, origin, ok, scn, shots }) {
  let put = false;
  const NT = { nat_order_id: 3101, reference: 'N-T101', client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', temperature_c: 4 };
  const after = () => { const b = K.week(); const w = b.waiting.shift();
    b.cycles[0].stops.push(K.stop(1006, 6, 'KATHODOS', 3, '2026-10-14T08:00:00+03:00', '2026-10-14T10:00:00+03:00', [K.leg(5005, w.piece_id, 'load', w.pallets, NT)]),
      K.stop(1007, 7, 'KATHODOS', 2, '2026-10-15T08:00:00+03:00', '2026-10-15T10:00:00+03:00', [K.leg(5005, w.piece_id, 'unload', w.pallets, NT)]));
    return b; };
  const plan = {
    'GET /plan/board': (e, S) => [200, put ? after() : S.board],
    'POST /plan/legs': () => { put = true; return [200, { ok: true, op: 'plan_put_pieces', dry_run: false, ids: { leg_ids: [5005], rt_id: 101 }, warnings: [], notice_ids: [] }]; },
  };
  const { page, S } = await K.openApp(browser, origin, { plan, viewport: { width: 1440, height: 900 } });
  await page.evaluate(() => document.querySelector('#content .wn5-row[data-rt="101"] [data-act="plus"][data-side="KATHODOS"]').click()).catch((e) => S.pageErrors.push('plus: ' + e.message));
  await page.waitForSelector(dlg('plus'), { timeout: 6000 }).catch(() => {});
  const on = await page.$eval(`${dlg('plus')} .wn5-pline[data-piece="4101"] [data-act="save"]`, (b) => !b.disabled).catch(() => null);
  ok(scn, '«+» of TST-2104 ΚΑΘΟΔΟΣ: N-T101 waits there with «Πρόσθεσε» on', on === true, on);
  const t0 = S.plan.length;
  await page.click(`${dlg('plus')} .wn5-pline[data-piece="4101"] [data-act="save"]`).catch(() => {});
  await page.waitForTimeout(500);
  const seq = S.plan.slice(t0).map((x) => x.m + ' ' + x.path);
  const iLegs = seq.indexOf('POST /plan/legs');
  ok(scn, 'one POST /plan/legs, then GET /plan/board (the board read again) — the order of S.plan', iLegs >= 0 && seq.indexOf('GET /plan/board', iLegs) > iLegs
    && seq.filter((x) => x === 'POST /plan/legs').length === 1, seq);
  const fl = await page.evaluate(() => { const rs = [...document.querySelectorAll('#content .wn5-row.wn5-focus')];
    const r = rs[0] && rs[0].getBoundingClientRect(); return { keys: rs.map((e) => e.dataset.key), flash: !!(rs[0] && rs[0].classList.contains('wn5-flash')), inView: !!r && r.top >= 0 && r.bottom <= innerHeight }; });
  ok(scn, 'the truck\'s row (rt:101) is marked, flashes and is in view', JSON.stringify(fl.keys) === '["rt:101"]' && fl.flash && fl.inView, fl);
  const ts = await toasts(page);
  ok(scn, 'a toast says it was added', ts.some((x) => /^Προστέθηκε/.test(x)), ts);
  const pts = await page.$$eval('#content .wn5-row[data-rt="101"] .wn5-pt[data-stop]', (xs) => xs.map((x) => x.dataset.stop)).catch(() => []);
  ok(scn, 'the board shows the new points (stop 1006 or 1007) without «Ανανέωση»', pts.includes('1006') || pts.includes('1007'), pts);
  ok(scn, 'the popover closed', await K.count(page, dlg('plus')) === 0);
  await shot(page, shots, 'pack2-f63-after-add-1440');
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 9 · Figma audit B-22: a new order starts on PE «Όχι»

async function b22({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, {});
  const DLG = dlg('order');
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(DLG, { timeout: 8000 }).catch(() => {});
  const pe = await page.$eval(`${DLG} [data-peh]`, (x) => ({ v: x.dataset.peh, on: [...x.querySelectorAll('.on')].map((b) => b.textContent) })).catch(() => null);
  ok(scn, 'PE · ανταλλαγή παλετών starts on «Όχι» (data-peh=no) — main: nothing chosen', !!pe && pe.v === 'no' && JSON.stringify(pe.on) === '["Όχι"]', pe);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

K.run({ scenarios: { menu, delpt, half, delwait, listdel, drag, day, newpt, newanod, price, f64, f65, f63, b22 }, globals: ['WN5Act', 'WN5Form', 'WN5Edit'],
  go: 'board pack 2: delete from the board, drag to truck / day, new point on its truck, B-22, price roles' });
