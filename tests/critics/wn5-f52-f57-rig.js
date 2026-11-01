// Rig — National v5, owner findings of the live simulation of 31/10 (F52, F53, F55, F57), front end only. Judged by
// what reached the fake /plan/* and the facade (S.plan / the routes below: method, path, query, body) and by the DOM;
// never by a toast or a screenshot. Synthetic data only (public repo).
//   f53  the «+» of a trip that runs past the loaded week's Friday lists the waiting loads of its own days
//   f55  a VS point's day in the leg form opens its stop's day panel («Αλλαγή ώρας ›») instead of doing nothing
//   f57  «+ → Νέα παραγγελία»: the points the screen filled follow the Veroia day; a typed point stays
//   f52  a place saved in «Τοποθεσίες» is in the order form's picker without a reload, and the save sends its number
//   f52c a client created in «Πελάτες» is in the v5 catalogue at the next save (one more GET /plan/lookups), not refused (F62)
// Usage: node tests/critics/wn5-f52-f57-rig.js [f53 f55 f57 f52 f52c]
//        WN5_TREE=<git archive origin/main> node tests/critics/wn5-f52-f57-rig.js   (plain-main proof: NO-GO, exit 1)
// Exit: 0 green · 1 a check failed · 2 unknown scenario.
'use strict';
const K = require('./wn5-rig-kit.js');

const PLUS = '.wi4-dlg[role="dialog"][data-wn5="plus"]';
const ORDER = '.wi4-dlg[role="dialog"][data-wn5="order"]';
const LEG = '.wi4-dlg[role="dialog"][data-wn5="leg"]';
const DATE = '.wi4-dlg[data-wn5="date"]';
const NEXT = '2026-10-17';   // the Saturday after the kit week (Sat 10/10 – Fri 16/10)

// The kit week plus RT-T103: starts Fri 16/10 at Veroia, delivers Sun 18/10 — past the loaded week's Friday.
function f53Week() {
  const b = K.week();
  const NE = { nat_order_id: 3010, reference: 'N-T010', client_id: 43, client: 'ΠΕΛΑΤΗΣ Γ', temperature_c: 4 };
  b.cycles.push({ rt_id: 103, code: 'RT-T103', trip_type: 'OWNED', truck_id: 13, truck: 'TST-2106', trailer_id: 21, trailer: 'TRL-5102', driver_id: 33, driver: 'Driver Test 03',
    partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-16T16:00:00+03:00', end_at: '2026-10-18T10:00:00+03:00',
    date_start: '2026-10-16', date_end: '2026-10-18', ended: false,
    stops: [
      K.stop(1201, 1, 'KATHODOS', 1, '2026-10-16T16:00:00+03:00', '2026-10-16T18:00:00+03:00', [K.leg(5201, 4020, 'load', 6, NE)]),
      K.stop(1202, 2, 'KATHODOS', 4, '2026-10-18T08:00:00+03:00', '2026-10-18T10:00:00+03:00', [K.leg(5201, 4020, 'unload', 6, NE)])] });
  return b;
}
const vsWait = (piece_id, order_id, reference, day, due) => ({ piece_id, shipment_id: 5800 + (piece_id % 100), kind: 'vs_import', order_id, nat_order_id: null, order_stop_id: null,
  pallets: 10, leave_by: null, position_location_id: 1, nat_from_location_id: 1, nat_to_location_id: 5, nat_ready_day: day, nat_due_day: due, overdue: false,
  is_stock: false, client_id: 42, client: 'ΠΕΛΑΤΗΣ Β', reference, temperature_c: 2, pallet_exchange: false,
  load_from: null, load_to: null, deliver_from: due + 'T09:00:00+03:00', deliver_to: due + 'T11:00:00+03:00' });
// the board of the next week as plan_board answers it: every waiting load ready by its Friday (072: ready <= week + 6)
function nextWeek() {
  const w = K.week();
  return { week: NEXT, cycles: [], hub: [], notices: [],
    waiting: [w.waiting[0],
      // one more piece of the loaded week's first waiting order, ready Sat 17/10: it joins that VS's group, never a second head (r9)
      Object.assign({}, w.waiting[0], { piece_id: 4804, shipment_id: 5804, nat_ready_day: '2026-10-17' }),
      vsWait(4801, 2201, 'VS-T801', '2026-10-18', '2026-10-18'), vsWait(4802, 2202, 'VS-T802', '2026-10-21', '2026-10-21'),
      // a VS without cross-dock: no nat_ready_day, its delivery Wed 21/10 — after the trip too
      Object.assign(vsWait(4803, 2203, 'VS-T803', '2026-10-21', '2026-10-21'), { nat_ready_day: null, nat_due_day: null })] };
}
const lines = (page) => page.evaluate((p) => [...document.querySelectorAll(`${p} .wn5-pline[data-piece]`)].map((x) => Number(x.dataset.piece)), PLUS);

async function f53({ browser, origin, ok, scn }) {
  { // the next week answers
    const { page, S } = await K.openApp(browser, origin, { board: f53Week(), plan: {
      'GET /plan/board': async (e, St) => (e.q.week === NEXT ? [200, nextWeek()] : [200, St.board]) } });
    await page.evaluate(() => WN5Act.plus(103, 'KATHODOS', document.querySelector('#content .wn5-row[data-rt="103"]') || document.querySelector('#content .wn5')));
    await page.waitForSelector(PLUS, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(600);
    const asked = K.planOf(S, 'GET', '/plan/board').filter((x) => x.q.week === NEXT);
    ok(scn, '«+» of RT-T103 (Fri 16/10 → Sun 18/10) reads GET /plan/board?week=2026-10-17 once — main: never', asked.length === 1, K.planOf(S, 'GET', '/plan/board').map((x) => x.q.week));
    const ls = await lines(page);
    ok(scn, 'the VS of Sun 18/10 (VS-T801, piece 4801) is in its list — main: missing', ls.includes(4801), ls);
    ok(scn, 'a load ready after the trip\'s last day (VS-T802, Wed 21/10) is not', !ls.includes(4802), ls);
    ok(scn, '… nor a VS without its ready day whose window is after it (VS-T803, Wed 21/10)', !ls.includes(4803), ls);
    ok(scn, 'a load on both boards (4101) is listed once', ls.filter((x) => x === 4101).length === 1, ls);
    const heads = await page.evaluate((p) => [...document.querySelectorAll(`${p} .wn5-grp-h`)].map((x) => x.textContent), PLUS);
    const w0 = K.week().waiting[0], ref0 = w0.kind === 'vs_import' ? w0.reference + ' · ' + w0.client : 'ΕΘΝ · ' + w0.client;
    ok(scn, `an order with pieces in both weeks («${ref0}», 4804 read later) is ONE group, its later piece under the loaded one (code review r9)`,
      ls.includes(4804) && heads.filter((h) => h.startsWith(ref0)).length === 1 && ls.indexOf(4804) > ls.indexOf(4101), { heads, ls });
    ok(scn, 'no «φορτώνει» / «δεν διαβάστηκε» line left once read', (await K.count(page, `${PLUS} [data-beyond]`)) === 0);
    await page.click(`${PLUS} [data-act="save"][data-piece="4801"]`, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
    const legs = K.planOf(S, 'POST', '/plan/legs');
    const b = (legs[0] && legs[0].body) || {};
    ok(scn, '«Πρόσθεσε» → ONE POST /plan/legs {pieces:[4801], target RT-T103 ΚΑΘΟΔΟΣ, the Veroia stop 1201 by id}', legs.length === 1
      && JSON.stringify(b.pieces) === JSON.stringify([{ piece_id: 4801 }]) && JSON.stringify(b.target) === JSON.stringify({ rt_id: 103, side: 'KATHODOS' })
      && (b.stops || []).some((s) => s.stop_id === 1201), legs.map((x) => x.raw));
    ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
    // a second «+» reads the next week again (no cache across openings until the owner says so) and lists it again
    await page.keyboard.press('Escape');
    await page.evaluate(() => WN5Act.plus(103, 'KATHODOS', document.querySelector('#content .wn5-row[data-rt="103"]') || document.querySelector('#content .wn5')));
    await page.waitForTimeout(500);
    ok(scn, 'a second «+» of RT-T103 lists VS-T801 again (one more GET of 2026-10-17)', (await lines(page)).includes(4801)
      && K.planOf(S, 'GET', '/plan/board').filter((x) => x.q.week === NEXT).length === 2, K.planOf(S, 'GET', '/plan/board').map((x) => x.q.week));
    // control: a trip inside the week reads no other week
    await page.keyboard.press('Escape');
    const n0 = K.planOf(S, 'GET', '/plan/board').length;
    await page.evaluate(() => WN5Act.plus(101, 'KATHODOS', document.querySelector('#content .wn5-row[data-rt="101"]') || document.querySelector('#content .wn5')));
    await page.waitForTimeout(500);
    ok(scn, 'control: «+» of RT-T101 (Mon–Tue) reads no other week', K.planOf(S, 'GET', '/plan/board').slice(n0).every((x) => x.q.week !== NEXT), K.planOf(S, 'GET', '/plan/board').slice(n0).map((x) => x.q.week));
    await page.context().close();
  }
  { // the next week fails: said with its days and the base's words, the loaded week's loads stay
    const { page, S } = await K.openApp(browser, origin, { board: f53Week(), plan: {
      'GET /plan/board': async (e, St) => (e.q.week === NEXT ? K.planErr(503, 'SERVER', 'slow') : [200, St.board]) } });
    await page.evaluate(() => WN5Act.plus(103, 'KATHODOS', document.querySelector('#content .wn5-row[data-rt="103"]') || document.querySelector('#content .wn5')));
    await page.waitForSelector(PLUS, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(800);
    const t = await K.text(page, `${PLUS} [data-beyond="failed"]`);
    ok(scn, 'a failed read says «Αναμονή Σάβ 17/10–Κυρ 18/10: δεν διαβάστηκε (rig sentinel slow)» — main: nothing', t === 'Αναμονή Σάβ 17/10–Κυρ 18/10: δεν διαβάστηκε (rig sentinel slow)', t);
    ok(scn, '… and the loaded week\'s load (4101) is still offered', (await lines(page)).includes(4101), await lines(page));
    ok(scn, 'no page errors (fail)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
}

async function f55({ browser, origin, ok, scn }) {
  const PV = { ok: true, op: 'plan_rt_update', dry_run: true, needs_confirm: false, preview: {
    before: { start_at: '2026-10-12T16:00:00+03:00', end_at: '2026-10-13T22:00:00+03:00', date_start: '2026-10-12', date_end: '2026-10-13' },
    after: { start_at: '2026-10-12T16:00:00+03:00', end_at: '2026-10-14T22:00:00+03:00', date_start: '2026-10-12', date_end: '2026-10-14' },
    next_rt: null, conflict: null, vs_day: [], warnings: [] } };
  const plan = { 'PATCH /plan/rt/101': (e) => (e.body && e.body.dry_run === true ? [200, PV]
    : [200, { ok: true, op: 'plan_rt_update', dry_run: false, ids: { rt_id: 101, stop_ids: [1002] }, warnings: [], notice_ids: [] }]) };
  const { page, S } = await K.openApp(browser, origin, { plan });
  await page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
  await page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  // the VS-T118 delivery at ATHENS TEST (stop 1002): its day cell is the row's second box, on main and on the branch
  const cell = `${LEG} [data-vs="2101"] .wn5f-row.ro > :nth-child(2)`;
  ok(scn, 'precondition: the VS delivery row shows «Τρί 13/10»', (await K.text(page, cell)) === 'Τρί 13/10', await K.text(page, cell));
  await page.click(cell, { timeout: 3000 }).catch(() => {});
  await page.waitForSelector(DATE, { timeout: 4000 }).catch(() => {});
  const head = await page.evaluate((d) => { const x = document.querySelector(d); return x && { t: x.querySelector('.wi4-dlg-t').textContent, stop: x.dataset.stop }; }, DATE);
  ok(scn, 'a click on the VS day opens the day panel of its stop: «Ώρα στάσης · ATHENS TEST», stop 1002 — main: nothing', !!head && head.stop === '1002'
    && head.t === 'Ώρα στάσης · ATHENS TEST' && (await K.count(page, LEG)) === 0, head);
  await page.click(`${DATE} [data-day="2026-10-14"]`, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.click(`${DATE} [data-act="save"]`, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(900);
  const real = K.planOf(S, 'PATCH', '/plan/rt/101').filter((x) => !(x.body && x.body.dry_run === true));
  const want = JSON.stringify({ stops: [{ stop_id: 1002, planned_from: '2026-10-14T06:00:00+03:00', planned_to: '2026-10-14T08:00:00+03:00' }] });
  ok(scn, 'another day + «Αποθήκευση» → ONE PATCH /plan/rt/101 of stop 1002 only, its hours kept (Wed 14/10 06:00–08:00)', real.length === 1 && real[0].raw === want, real.map((x) => x.raw));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

const dayOf = (page, sel) => page.$eval(sel, (i) => i.value).catch(() => null);
async function typeDay(page, sel, keys) {
  await page.click(sel, { timeout: 3000 }).catch(() => {});
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(keys);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
}
// The kit week with the ΑΝΟΔΟΣ of RT-T101 loading Tue 13/10 and arriving at Veroia Wed 14/10: the side's day (what the
// «+» hands the form) is not the Veroia day.
function f57Week() {
  const w = K.week();
  const c = w.cycles[0];
  const s = c.stops.find((x) => x.stop_id === 1005);
  Object.assign(s, { planned_from: '2026-10-14T20:00:00+03:00', planned_to: '2026-10-14T22:00:00+03:00', stop_day: '2026-10-14' });
  Object.assign(c, { end_at: '2026-10-14T22:00:00+03:00', date_end: '2026-10-14' });
  return w;
}
async function openPlusNew(page) {
  await page.evaluate(() => WN5Act.plus(101, 'ANODOS', document.querySelector('#content .wn5-row[data-rt="101"]') || document.querySelector('#content .wn5')));
  await page.click(`${PLUS} [data-act="seg"][data-v="new"]`, { timeout: 4000 }).catch(() => {});
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
}
async function f57({ browser, origin, ok, scn }) {
  const L = `${ORDER} .wn5f-rows[data-k="load"] [data-f="day"]`, LX = `${ORDER} .wn5f-rows[data-k="load"] .wn5f-dayx`;
  const D = `${ORDER} .wn5f-rows[data-k="drop"] [data-f="day"]`, V = `${ORDER} .wn5f-day:has(#wn5f-vday) .wn5f-dayx`;
  { // the real path: «+» of the ΑΝΟΔΟΣ of RT-T101 → «Νέα παραγγελία»; the points stay as the screen filled them
    const { page, S } = await K.openApp(browser, origin, { board: f57Week() });
    await openPlusNew(page);
    const v0 = await dayOf(page, `${ORDER} #wn5f-vday`), l0 = await dayOf(page, L), d0 = await dayOf(page, D);
    ok(scn, 'opens with the Veroia day Wed 14/10 and the filled points on it — main: the side\'s first day Tue 13/10', v0 === '2026-10-14' && l0 === '2026-10-14' && d0 === '2026-10-14', { v0, l0, d0 });
    await typeDay(page, V, '16/10');
    const l1 = await dayOf(page, L), d1 = await dayOf(page, D);
    ok(scn, 'Veroia day typed Fri 16/10 → the filled loading and delivery follow to Fri 16/10 — main: stay', l1 === '2026-10-16' && d1 === '2026-10-16', { l1, d1 });
    // the write: client, Aspropyrgos → Veroia (the arrival «ως»), pallets — the loading's day is still the screen's
    await page.evaluate((o) => {
      const b = document.querySelector(o).querySelector('.wn5f-ord');
      const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      fhPickLinked(b.querySelector('[data-cpick]').dataset.cpick, 'recWn5Cli41', 'ΠΕΛΑΤΗΣ Α');
      b.querySelector('[data-pe="no"]').click();
      const lr = b.querySelector('.wn5f-rows[data-k="load"] .wn5f-row'), dr = b.querySelector('.wn5f-rows[data-k="drop"] .wn5f-row');
      fhPickLinked(lr.dataset.pid, 'recWn5LocAsp', 'ASPROPYRGOS TEST');
      fhPickLinked(dr.dataset.pid, 'recJucKOhC1zh4IP3', 'ΒΕΡΟΙΑ TEST');
      set(lr.querySelector('[data-f="pal"]'), '6');
      set(dr.querySelector('[data-f="to"]'), '20:00');
    }, ORDER);
    await page.waitForTimeout(200);
    await page.click(`${ORDER} [data-act="save"]`, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const posts = K.planOf(S, 'POST', '/plan/orders');
    const sh = posts[0] && posts[0].body && posts[0].body.orders && posts[0].body.orders[0] && posts[0].body.orders[0].shipments[0];
    ok(scn, 'ONE POST /plan/orders: the filled loading on Fri 16/10 (whole day), arrival at Veroia by Fri 16/10 20:00 — main: loading Tue 13/10', posts.length === 1 && !!sh
      && sh.load_from === '2026-10-16T00:00:00+03:00' && sh.deliver_to === '2026-10-16T20:00:00+03:00', posts.map((x) => x.raw));
    ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  { // ΚΑΘΟΔΟΣ: the Veroia day is the loading at Veroia; a filled delivery moves by as many days, never onto it
    const { page, S } = await K.openApp(browser, origin);
    await page.evaluate(() => WN5Form.openOrder({ side: 'KATHODOS', day: '2026-10-13', rtId: 101 }));
    await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
    const v0 = await dayOf(page, `${ORDER} #wn5f-vday`), d0 = await dayOf(page, D);
    await typeDay(page, V, '14/10');
    const d1 = await dayOf(page, D);
    ok(scn, 'ΚΑΘΟΔΟΣ (Veroia Mon 12/10, delivery filled Tue 13/10): Veroia → Wed 14/10 moves the delivery to Thu 15/10 — main: stays Tue 13/10',
      v0 === '2026-10-12' && d0 === '2026-10-13' && d1 === '2026-10-15', { v0, d0, d1 });
    ok(scn, 'no page errors (ΚΑΘΟΔΟΣ)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  { // ΚΑΘΟΔΟΣ with no Veroia stop yet (RT-T102 has only an ΑΝΟΔΟΣ): the first Veroia day the user sets moves the points
    const { page, S } = await K.openApp(browser, origin);
    await page.evaluate(() => WN5Form.openOrder({ side: 'KATHODOS', day: '2026-10-14', rtId: 102 }));
    await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
    const d0 = await dayOf(page, D);
    await typeDay(page, V, '15/10');
    const d1 = await dayOf(page, D), l1 = await dayOf(page, L);
    ok(scn, 'ΚΑΘΟΔΟΣ without a Veroia stop: points filled Wed 14/10, Veroia set Thu 15/10 → points Thu 15/10 — main: stay', d0 === '2026-10-14' && d1 === '2026-10-15' && l1 === '2026-10-15', { d0, d1, l1 });
    ok(scn, 'no page errors (ΚΑΘΟΔΟΣ no stop)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  { // a point the user typed keeps its day
    const { page, S } = await K.openApp(browser, origin, { board: f57Week() });
    await openPlusNew(page);
    await typeDay(page, LX, '15/10');
    await typeDay(page, V, '16/10');
    const l2 = await dayOf(page, L), d2 = await dayOf(page, D);
    ok(scn, 'a loading the user typed (Thu 15/10) stays when the Veroia day changes (Fri 16/10); the filled delivery follows — main: delivery stays', l2 === '2026-10-15' && d2 === '2026-10-16', { l2, d2 });
    ok(scn, 'no page errors (typed)', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
}

async function f52({ browser, origin, ok, scn }) {
  const NEW = { id: 'recWn5LocKoz', fields: { Name: 'KOZANI TEST', City: 'Kozani', Country: 'GR' } };
  const lookups = K.clone(K.LOOKUPS);
  let created = false;
  const { page, S } = await K.openApp(browser, origin, { lookups, plan: {
    // the base's catalogue has the place once it exists (plan_lookups reads the table)
    'GET /plan/lookups': async (e, St) => [200, created ? Object.assign(K.clone(St.lookups), { locations: St.lookups.locations.concat([{ id: 6, legacy_id: NEW.id, name: 'KOZANI TEST', address: null, city: 'Kozani', phone: null }]) }) : St.lookups] } });
  const fac = [];
  // the facade: the LOCATIONS create answers with the new record (registered after the kit's route, so it is asked first)
  await page.route(`**/${K.HOST}/v0/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && /\/tblxu8DRfTQOFRCzS$/.test(new URL(req.url()).pathname)) {
      fac.push(JSON.parse(req.postData() || '{}'));
      created = true;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(NEW) });
    }
    // a LOCATIONS read after the create has the place, as the table would (the app's background re-read included)
    if (req.method() === 'GET' && created && /\/tblxu8DRfTQOFRCzS$/.test(new URL(req.url()).pathname))
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ records: K.FACADE_LOCS.concat([NEW]) }) });
    return route.fallback();
  });
  // the national form read the places once (the board's «+ Νέα παραγγελία»)
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  await page.click(`${ORDER} [data-act="cancel"]`).catch(() => {});
  // the app's one background re-read of the reference lists (api.js _refDataRevalidate, 1.5 s after the preload) is
  // over before the place exists: what the picker shows next is this fix, never that re-read landing by chance
  await page.waitForTimeout(2500);
  const lk0 = K.planOf(S, 'GET', '/plan/lookups').length;
  // «Τοποθεσίες» → «Νέα τοποθεσία» → «Αποθήκευση»
  await page.evaluate(() => navigate('locations'));
  await page.waitForTimeout(500);
  await page.evaluate(() => _locOpenCreate());
  await page.waitForSelector('#locF_name', { timeout: 5000 }).catch(() => {});
  await page.fill('#locF_name', 'KOZANI TEST').catch(() => {});
  await page.fill('#locF_city', 'Kozani').catch(() => {});
  await page.selectOption('#locF_country', 'GR').catch(() => {});
  await page.click('#locSaveBtn').catch(() => {});
  await page.waitForTimeout(800);
  ok(scn, 'precondition: one facade POST to LOCATIONS with the typed place', fac.length === 1 && fac[0].fields && fac[0].fields.Name === 'KOZANI TEST', fac);
  // back to the board, no reload
  await page.evaluate(() => navigate('weekly_natl'));
  await page.waitForFunction(() => !!document.querySelector('#content > .wi4.wn5[data-state="ok"]'), null, { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  const offered = await page.evaluate((o) => {
    const r = document.querySelector(`${o} .wn5f-rows[data-k="load"] .wn5f-row`);
    fhLocDrop(r.dataset.pid, 'kozani');
    const d = document.getElementById('ls_' + r.dataset.pid + '_d');
    return d ? d.textContent : '';
  }, ORDER);
  ok(scn, 'the order form\'s place picker offers «KOZANI TEST, Kozani, …» without a reload — main: not found', /KOZANI TEST, Kozani/.test(offered), offered.slice(0, 200));
  ok(scn, 'the v5 catalogue was read again for the new place (one more GET /plan/lookups)', K.planOf(S, 'GET', '/plan/lookups').length === lk0 + 1, K.planOf(S, 'GET', '/plan/lookups').length - lk0);
  await page.evaluate((o) => {
    const b = document.querySelector(`${o} .wn5f-ord`);
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    fhPickLinked(b.querySelector('[data-cpick]').dataset.cpick, 'recWn5Cli41', 'ΠΕΛΑΤΗΣ Α');
    b.querySelector('[data-pe="no"]').click();
    const lr = b.querySelector('.wn5f-rows[data-k="load"] .wn5f-row'), dr = b.querySelector('.wn5f-rows[data-k="drop"] .wn5f-row');
    fhPickLinked(lr.dataset.pid, 'recWn5LocKoz', 'KOZANI TEST');
    fhPickLinked(dr.dataset.pid, 'recWn5LocAth', 'ATHENS TEST');
    set(lr.querySelector('[data-f="day"]'), '2026-10-14'); set(dr.querySelector('[data-f="day"]'), '2026-10-15');
    set(lr.querySelector('[data-f="pal"]'), '6');
    const v = document.querySelector('#wn5f-vday'); set(v, '2026-10-14');
  }, ORDER);
  await page.waitForTimeout(200);
  await page.click(`${ORDER} [data-act="save"]`, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const posts = K.planOf(S, 'POST', '/plan/orders');
  const sh = posts[0] && posts[0].body && posts[0].body.orders && posts[0].body.orders[0] && posts[0].body.orders[0].shipments[0];
  ok(scn, 'ONE POST /plan/orders loading at the new place by its number (origin_location_id 6)', posts.length === 1 && !!sh && sh.origin_location_id === 6 && sh.dest_location_id === 2,
    posts.map((x) => x.raw).concat([await K.text(page, `${ORDER} [data-err]`), await K.text(page, `${ORDER} [data-strip]`)]));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// F62 (live 1/11): a client created in the same session was not in the catalogue read before it, so the v5 save was
// refused with ids_missing until a reload. Same mechanism as the place above, for the CLIENTS entity.
async function f52c({ browser, origin, ok, scn }) {
  const NEW = { id: 'recWn5CliNew', fields: { 'Company Name': 'ΝΕΟΣ ΠΕΛΑΤΗΣ' } };
  const lookups = K.clone(K.LOOKUPS);
  let created = false;
  const { page, S } = await K.openApp(browser, origin, { lookups, plan: {
    'GET /plan/lookups': async (e, St) => [200, created ? Object.assign(K.clone(St.lookups), { clients: St.lookups.clients.concat([{ id: 43, legacy_id: NEW.id, company_name: 'ΝΕΟΣ ΠΕΛΑΤΗΣ' }]) }) : St.lookups] } });
  const fac = [];
  await page.route(`**/${K.HOST}/v0/**`, async (route) => {
    const req = route.request();
    const isClients = /\/tblFWKAQVUzAM8mCE$/.test(new URL(req.url()).pathname);
    const hdr = { 'access-control-allow-origin': '*' };
    if (req.method() === 'POST' && isClients) {
      fac.push(JSON.parse(req.postData() || '{}'));
      created = true;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify(NEW) });
    }
    if (req.method() === 'GET' && created && isClients)
      return route.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: JSON.stringify({ records: K.LOOKUPS.clients.map((c) => ({ id: c.legacy_id, fields: { 'Company Name': c.company_name } })).concat([NEW]) }) });
    return route.fallback();
  });
  // the catalogue is read once, by opening the national form (the board's «+ Νέα παραγγελία»), before the client exists
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  await page.click(`${ORDER} [data-act="cancel"]`).catch(() => {});
  await page.waitForTimeout(2500);
  const lk0 = K.planOf(S, 'GET', '/plan/lookups').length;
  // «Πελάτες» → «+ Client» → «Αποθήκευση», the real entity form
  await page.evaluate(() => navigate('clients'));
  await page.waitForTimeout(500);
  await page.evaluate(() => openEntityCreate('clients'));
  await page.waitForSelector('#ef_Company_Name', { timeout: 5000 }).catch(() => {});
  await page.fill('#ef_Company_Name', 'ΝΕΟΣ ΠΕΛΑΤΗΣ').catch(() => {});
  await page.click('#ef_save_clients').catch(() => {});
  await page.waitForTimeout(800);
  ok(scn, 'precondition: one facade POST to CLIENTS with the typed name', fac.length === 1 && fac[0].fields && fac[0].fields['Company Name'] === 'ΝΕΟΣ ΠΕΛΑΤΗΣ', fac);
  // back to the board, no reload; save an order for the new client
  await page.evaluate(() => navigate('weekly_natl'));
  await page.waitForFunction(() => !!document.querySelector('#content > .wi4.wn5[data-state="ok"]'), null, { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  await page.evaluate((o) => {
    const b = document.querySelector(`${o} .wn5f-ord`);
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    fhPickLinked(b.querySelector('[data-cpick]').dataset.cpick, 'recWn5CliNew', 'ΝΕΟΣ ΠΕΛΑΤΗΣ');
    b.querySelector('[data-pe="no"]').click();
    const lr = b.querySelector('.wn5f-rows[data-k="load"] .wn5f-row'), dr = b.querySelector('.wn5f-rows[data-k="drop"] .wn5f-row');
    fhPickLinked(lr.dataset.pid, 'recWn5LocAsp', 'ASPROPYRGOS TEST');
    fhPickLinked(dr.dataset.pid, 'recWn5LocAth', 'ATHENS TEST');
    set(lr.querySelector('[data-f="day"]'), '2026-10-14'); set(dr.querySelector('[data-f="day"]'), '2026-10-15');
    set(lr.querySelector('[data-f="pal"]'), '6');
    const v = document.querySelector('#wn5f-vday'); set(v, '2026-10-14');
  }, ORDER);
  await page.waitForTimeout(200);
  await page.click(`${ORDER} [data-act="save"]`, { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const posts = K.planOf(S, 'POST', '/plan/orders');
  ok(scn, 'the v5 catalogue was read again for the new client (one more GET /plan/lookups) — main: none', K.planOf(S, 'GET', '/plan/lookups').length === lk0 + 1, K.planOf(S, 'GET', '/plan/lookups').length - lk0);
  const o = posts[0] && posts[0].body && posts[0].body.orders && posts[0].body.orders[0];
  ok(scn, 'ONE POST /plan/orders with the new client by its number (client_id 43) — main: refused, nothing sent', posts.length === 1 && !!o && o.client_id === 43,
    posts.map((x) => x.raw).concat([await K.text(page, `${ORDER} [data-err]`), await K.text(page, `${ORDER} [data-strip]`)]));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

K.run({ scenarios: { f53, f55, f57, f52, f52c }, globals: ['WN5', 'WN5Act', 'WN5Form'],
  go: 'F53 / F55 / F57 / F52 / F62 hold' });
