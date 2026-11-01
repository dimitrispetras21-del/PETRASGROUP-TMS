// Rig — National v5, 092 (F45, owner 1/11 option a): the national desk sets the pallets and the Veroia day of a VS, the
// international follows. The kit's week (tests/critics/wn5-rig-kit.js): VS-T118 (order 2101, piece 4001, 21 pallets)
// is loaded at Veroia on Mon 12/10 by RT-T101 (stop 1001) and delivered on Tue 13/10 (stop 1002).
// Judged by what reached the fake /plan/* (S.plan = «the table» of the rig) and by what the page shows:
//   mark      the international has the VS at Veroia on Sun 11/10 (GET /plan/vs-state cross_dock_date, 092): the row of
//             RT-T101 says «VS Κυρ 11/10» beside its Veroia; the same answer without the key (before 092) = no mark
//   day       the leg form's «Ημέρα Βέροιας» = the international's day; the truck's day is said with a «Φορτηγό → …»
//             press that opens the stop's own day panel with that day chosen (its dry run); «Ορισμός ημέρας» sends
//             ONE POST /plan/vs/day {order_id, day} and then offers the truck's step for the new day
//   pallets   the VS point's pallets are a field: 21 → 19 = ONE POST /plan/vs/day {order_id, piece_id, pallets}; the
//             same number, 2,55 or 0 send nothing and say why
// Usage: cd <main repo> && node <this tree>/tests/critics/wn5-092-rig.js [mark|day|pallets]
'use strict';
const K = require('./wn5-rig-kit');

const LEG = '.wi4-dlg[role="dialog"][data-wn5="leg"]';
const V = `${LEG} [data-vs="2101"]`;
const state = (cd) => ({ 2101: Object.assign({ carriers: [], all_executed: false, all_planned: true, first_hub_day: '2026-10-12', n_pieces: 1 },
  cd === undefined ? {} : { cross_dock_date: cd }) });
const vsState = (cd) => ({ 'GET /plan/vs-state': () => [200, state(cd)] });

async function scnMark({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { plan: vsState('2026-10-11') });
  await page.waitForTimeout(800);
  const reads = K.planOf(S, 'GET', '/plan/vs-state');
  ok(scn, 'the board reads GET /plan/vs-state for the VS at its hub stops (order_ids=2101)', reads.length >= 1 && reads[0].q.order_ids === '2101', reads.map((x) => x.q));
  const mark = await K.text(page, '#content .wn5-row[data-rt="101"] .wn5-vsday');
  ok(scn, 'the row of RT-T101 says «VS Κυρ 11/10» beside its Veroia', /^VS Κυρ 11\/10$/.test(mark), mark);
  const title = await page.evaluate(() => (document.querySelector('#content .wn5-row[data-rt="101"] .wn5-vsday') || {}).title || '');
  ok(scn, 'its title says both days (the international, the truck)', /Βέροια Κυρ 11\/10/.test(title) && /φορτηγό Δευ 12\/10/.test(title), title);
  ok(scn, 'no other row is marked', await K.count(page, '#content .wn5-vsday') === 1);
  await page.context().close();
  // the same day = no mark
  const p2 = await K.openApp(browser, origin, { plan: vsState('2026-10-12') });
  await p2.page.waitForTimeout(800);
  ok(scn, 'the days agree → no mark', await K.count(p2.page, '#content .wn5-vsday') === 0);
  await p2.page.context().close();
  // before 092: the answer has no cross_dock_date → no mark, nothing else changes
  const p3 = await K.openApp(browser, origin, { plan: vsState(undefined) });
  await p3.page.waitForTimeout(800);
  ok(scn, 'before 092 (no cross_dock_date in the answer) → no mark', await K.count(p3.page, '#content .wn5-vsday') === 0);
  ok(scn, 'no page errors', !p3.S.pageErrors.length, p3.S.pageErrors);
  await p3.page.context().close();
  // the read fails → the board is whole, no mark (planFetch logged the failure)
  const p4 = await K.openApp(browser, origin, { plan: { 'GET /plan/vs-state': () => K.planErr(503, 'SERVER', 'slow') } });
  await p4.page.waitForTimeout(800);
  ok(scn, 'the read fails → the board painted, no mark', await K.count(p4.page, '#content .wn5-row[data-rt="101"]') === 1 && await K.count(p4.page, '#content .wn5-vsday') === 0);
  await p4.page.context().close();
}

async function scnDay({ browser, origin, ok, scn }) {
  const plan = Object.assign(vsState('2026-10-11'), {
    'POST /plan/vs/day': () => [200, { ok: true, op: 'plan_vs_set_day', dry_run: false, ids: { order_id: 2101 }, warnings: [], notice_ids: [9201] }],
    // the stop's day panel: a dry run answers its preview (072 plan_rt_update), here with the international following
    'PATCH /plan/rt/101': (e) => (e.body && e.body.dry_run === true
      ? [200, { ok: true, op: 'plan_rt_update', dry_run: true, preview: { before: {}, after: {}, next_rt: null, conflict: null,
          vs_day: [{ order_id: 2101, from: '2026-10-10', to: '2026-10-10' }], warnings: [] } }]
      : K.planErr(409, 'WRITES_CLOSED', 'writes_closed')),
  });
  const { page, S } = await K.openApp(browser, origin, { plan });
  await page.waitForTimeout(800);
  await page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
  await page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  const lab = await K.text(page, `${V} .wn5f-vsday label span`);
  ok(scn, 'the field is «Ημέρα Βέροιας»', lab === 'Ημέρα Βέροιας', lab);
  ok(scn, 'its value is the international\'s day (Κυρ 11/10), not the truck\'s', (await page.evaluate((v) => (document.querySelector(`${v} [data-f="vsday"]`) || {}).value, V)) === '2026-10-11');
  const truck = await K.text(page, `${V} [data-vstruck]`);
  ok(scn, 'the truck\'s own day is said, with the step «Φορτηγό → Κυρ 11/10 ›»', /φορτηγό στη Βέροια Δευ 12\/10/.test(truck) && /Φορτηγό → Κυρ 11\/10 ›/.test(truck), truck);
  // «Ορισμός ημέρας» to Sat 10/10: one POST, then the truck's step follows the new day
  await page.fill(`${V} [data-f="vsday"]`, '2026-10-10');
  await page.click(`${V} [data-act="vs-day"]`);
  await page.waitForTimeout(1200);
  const days = K.planOf(S, 'POST', '/plan/vs/day');
  ok(scn, 'one press = ONE POST /plan/vs/day {order_id:2101, day:"2026-10-10"}', days.length === 1 && JSON.stringify(days[0].body) === JSON.stringify({ order_id: 2101, day: '2026-10-10' }), days.map((x) => x.body));
  const truck2 = await K.text(page, `${V} [data-vstruck]`);
  ok(scn, 'after the 200 the truck\'s step is for the new day (Σάβ 10/10)', /Φορτηγό → Σάβ 10\/10 ›/.test(truck2), truck2);
  ok(scn, 'no truck stop was moved by «Ορισμός ημέρας» (no PATCH /plan/rt)', !S.plan.some((x) => x.m === 'PATCH'));
  // the second step: the stop's day panel with that day chosen, its dry run on screen; the save stays the user's
  await page.click(`${V} [data-act="vs-truck-day"]`);
  await page.waitForTimeout(1200);
  ok(scn, 'the leg form closed and the stop\'s day panel opened for stop 1001', await K.count(page, LEG) === 0 && await K.count(page, '.wn5-dlg[data-stop="1001"]') === 1);
  const dry = S.plan.filter((x) => x.m === 'PATCH' && x.path === '/plan/rt/101');
  const b = dry[0] && dry[0].body;
  ok(scn, 'its dry run moves stop 1001 to Sat 10/10 (PATCH /plan/rt/101, dry_run)', dry.length === 1 && b && b.dry_run === true
    && Array.isArray(b.stops) && b.stops.length === 1 && b.stops[0].stop_id === 1001 && /^2026-10-10/.test(new Date(b.stops[0].planned_from).toLocaleString('sv-SE', { timeZone: 'Europe/Athens' })), dry.map((x) => x.body));
  ok(scn, 'nothing is saved without the press (only the dry run)', S.plan.filter((x) => x.m === 'PATCH' && !(x.body && x.body.dry_run)).length === 0);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

async function scnPallets({ browser, origin, ok, scn }) {
  const plan = Object.assign(vsState('2026-10-12'), {
    'POST /plan/vs/day': () => [200, { ok: true, op: 'plan_vs_set_day', dry_run: false, ids: { order_id: 2101, piece_id: 4001 }, warnings: [], notice_ids: [9301] }],
  });
  const { page, S } = await K.openApp(browser, origin, { plan });
  await page.waitForTimeout(800);
  await page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
  await page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  const P = `${V} [data-f="vspal"][data-piece="4001"]`;
  ok(scn, 'the VS point\'s pallets are a field with 21', await K.count(page, P) === 1 && (await page.evaluate((s) => document.querySelector(s).value, P)) === '21');
  ok(scn, 'the days agree → no truck step', (await K.text(page, `${V} [data-vstruck]`)) === '');
  await page.click(`${V} [data-act="vs-pal"]`);
  await page.waitForTimeout(400);
  ok(scn, 'the same number → nothing sent, said', K.planOf(S, 'POST', '/plan/vs/day').length === 0 && /ίδιος αριθμός/.test(await K.text(page, `${LEG} [data-err]`)));
  for (const bad of ['2,55', '0']) {
    await page.fill(P, bad);
    await page.click(`${V} [data-act="vs-pal"]`);
    await page.waitForTimeout(300);
    const said = await K.text(page, `${LEG} [data-err]`);
    ok(scn, `«${bad}» → nothing sent, said`, K.planOf(S, 'POST', '/plan/vs/day').length === 0 && /θετικό αριθμό, το πολύ ένα δεκαδικό/.test(said), said);
  }
  await page.fill(P, '19');
  await page.click(`${V} [data-act="vs-pal"]`);
  await page.waitForTimeout(1200);
  const sent = K.planOf(S, 'POST', '/plan/vs/day');
  ok(scn, '21 → 19 = ONE POST /plan/vs/day {order_id:2101, piece_id:4001, pallets:19}', sent.length === 1 && JSON.stringify(sent[0].body) === JSON.stringify({ order_id: 2101, piece_id: 4001, pallets: 19 }), sent.map((x) => x.body));
  ok(scn, 'after 200 with notice_ids: «γράφτηκαν και στη διεθνή, ο διεθνών ειδοποιήθηκε»', /γράφτηκαν και στη διεθνή, ο διεθνών ειδοποιήθηκε/.test(await K.text(page, `${V} [data-vspalok]`)));
  ok(scn, 'not through the form\'s «Αποθήκευση» (no PATCH /plan/orders)', !S.plan.some((x) => x.m === 'PATCH'));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

K.run({
  scenarios: { mark: scnMark, day: scnDay, pallets: scnPallets },
  globals: ['WN5Form', 'WN5'],
  go: '092: the board marks a truck on another Veroia day, the leg form sets the VS day and pallets with one POST each',
}).catch((e) => { console.error(e); process.exit(1); });
