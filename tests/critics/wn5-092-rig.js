// Rig — National v5, 092 (F45, owner 1/11 option a): the national desk sets the pallets and the Veroia day of a VS, the
// international follows. The kit's week (tests/critics/wn5-rig-kit.js): VS-T118 (order 2101, piece 4001, 21 pallets)
// is loaded at Veroia on Mon 12/10 by RT-T101 (stop 1001) and delivered on Tue 13/10 (stop 1002).
// Judged by what reached the fake /plan/* (S.plan = «the table» of the rig) and by what the page shows:
//   mark      the international has the VS at Veroia on Sun 11/10 (GET /plan/vs-state cross_dock_date, 092): the row of
//             RT-T101 says «VS Κυρ 11/10» beside its Veroia; the same answer without the key (before 092) = no mark
//   day       the leg form's «Ημέρα Βέροιας» = the international's day; «Ορισμός ημέρας» previews it WITH its trucks
//             (POST /plan/vs/day {…, preview: true}), «Επιβεβαίωση» does it (option a, coordinator 1/11)
//   pallets   the VS point's pallets are a field: 21 → 19 = ONE POST /plan/vs/day {order_id, piece_id, pallets}; the
//             same number, 2,55 or 0 send nothing and say why
// Usage: cd <main repo> && node <this tree>/tests/critics/wn5-092-rig.js [mark|day|pallets]
'use strict';
const K = require('./wn5-rig-kit');

const LEG = '.wi4-dlg[role="dialog"][data-wn5="leg"]';
const V = `${LEG} [data-vs="2101"]`;
// 092's plan_vs_state: cross_dock_date, and the cycles that carry a WHOLE piece of the VS (root_rts)
const entry = (cd, first, rts) => Object.assign({ carriers: [], all_executed: false, all_planned: true, first_hub_day: first, n_pieces: 1 },
  cd === undefined ? {} : { cross_dock_date: cd, root_rts: rts });
const state = (cd, first = '2026-10-12', rts = [101]) => ({ 2101: entry(cd, first, rts) });
const vsState = (cd, first, rts) => ({ 'GET /plan/vs-state': () => [200, state(cd, first, rts)] });
const MARK = '#content .wn5-vsday:not([hidden])';
// VS 610's shape on the kit's RT-T102: an EXPORT (order 2102, piece 4005, 12 pallets) loaded at ATHENS TEST on Wed 14/10
// 12:00 (stop 1101) and brought to Veroia that evening (stop 1102), beside the national N-T003
function exportWeek() {
  const b = K.week();
  const VSX = { kind: 'vs_export', order_id: 2102, reference: 'VS-T120', client_id: 43, client: 'ΠΕΛΑΤΗΣ Γ', temperature_c: 2 };
  const c = b.cycles.find((x) => x.rt_id === 102);
  c.stops.find((x) => x.stop_id === 1101).legs.push(K.leg(5102, 4005, 'load', 12, VSX));
  c.stops.find((x) => x.stop_id === 1102).legs.push(K.leg(5102, 4005, 'unload', 12, VSX));
  return b;
}

async function scnMark({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { plan: vsState('2026-10-11') });
  await page.waitForTimeout(800);
  const reads = K.planOf(S, 'GET', '/plan/vs-state');
  ok(scn, 'the board reads GET /plan/vs-state for the VS at its hub stops (order_ids=2101)', reads.length >= 1 && reads[0].q.order_ids === '2101', reads.map((x) => x.q));
  const mark = await K.text(page, '#content .wn5-row[data-rt="101"] .wn5-vsday:not([hidden])');
  ok(scn, 'the row of RT-T101 says «VS Κυρ 11/10» beside its Veroia', /^VS Κυρ 11\/10$/.test(mark), mark);
  const title = await page.evaluate(() => (document.querySelector('#content .wn5-row[data-rt="101"] .wn5-vsday:not([hidden])') || {}).title || '');
  ok(scn, 'its title says both days (the international, the truck)', /Βέροια Κυρ 11\/10/.test(title) && /φορτηγό Δευ 12\/10/.test(title), title);
  ok(scn, 'no other row is marked', await K.count(page, MARK) === 1);
  ok(scn, 'the late read repainted nothing: the mark was filled in place (one paint)', await page.evaluate(() => !!document.querySelector('#content .wn5-row[data-rt="101"] [data-vsmark="1001"]')));
  await page.context().close();
  // the same day = no mark
  const p2 = await K.openApp(browser, origin, { plan: vsState('2026-10-12') });
  await p2.page.waitForTimeout(800);
  ok(scn, 'the days agree → no mark', await K.count(p2.page, MARK) === 0);
  await p2.page.context().close();
  // before 092: the answer has no cross_dock_date → no mark, nothing else changes
  const p3 = await K.openApp(browser, origin, { plan: vsState(undefined) });
  await p3.page.waitForTimeout(800);
  ok(scn, 'before 092 (no cross_dock_date in the answer) → no mark', await K.count(p3.page, MARK) === 0);
  ok(scn, 'no page errors', !p3.S.pageErrors.length, p3.S.pageErrors);
  await p3.page.context().close();
  // the read fails → the board is whole, no mark (planFetch logged the failure)
  const p4 = await K.openApp(browser, origin, { plan: { 'GET /plan/vs-state': () => K.planErr(503, 'SERVER', 'slow') } });
  await p4.page.waitForTimeout(800);
  ok(scn, 'the read fails → the board painted, no mark', await K.count(p4.page, '#content .wn5-row[data-rt="101"]') === 1 && await K.count(p4.page, MARK) === 0);
  await p4.page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
  await p4.page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  ok(scn, 'the read fails → the leg form says the VS day and pallets were not read, no pallets field', await K.count(p4.page, `${V} [data-vsunread]`) === 1
    && await K.count(p4.page, `${V} [data-f="vspal"]`) === 0);
  await p4.page.context().close();
  // a part split at Veroia and loaded by this truck on Mon 12/10 on purpose (RT-T101 carries no whole piece of the
  // VS): neither the row nor the form calls it a mismatch, even with the international on Sat 10/10
  const p5 = await K.openApp(browser, origin, { plan: vsState('2026-10-10', '2026-10-11', []) });
  await p5.page.waitForTimeout(800);
  ok(scn, 'a split part on a later truck → no mark', await K.count(p5.page, MARK) === 0);
  await p5.page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
  await p5.page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  ok(scn, 'a split part on a later truck → no «other day» line', (await K.text(p5.page, `${V} [data-vstruck]`)) === '');
  await p5.page.context().close();
}

async function scnDay({ browser, origin, ok, scn }) {
  // option a (coordinator 1/11): «Ορισμός ημέρας» previews the international's day AND its trucks; «Επιβεβαίωση» does it
  const PREVIEW = { vs_day: { from: '2026-10-11', to: '2026-10-10' }, trucks: [{ rt_id: 101, rt_code: 'RT-T101', truck: 'TST-2104', from: '2026-10-12', to: '2026-10-10' }],
    pallets: null, warnings: [{ code: 'vs_truck_kept', rt_code: 'RT-T999', truck: 'TST-9999', day: '2026-10-12', reason: 'executed' }] };
  const plan = Object.assign(vsState('2026-10-11'), {
    'POST /plan/vs/day': (e) => (e.body && e.body.preview === true
      ? [200, { ok: true, op: 'plan_vs_set_day', dry_run: true, preview: PREVIEW }]
      : [200, { ok: true, op: 'plan_vs_set_day', dry_run: false, ids: { order_id: 2101 }, trucks: PREVIEW.trucks, warnings: [], notice_ids: [9201] }]),
  });
  const { page, S } = await K.openApp(browser, origin, { plan });
  await page.waitForTimeout(800);
  await page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
  await page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  const lab = await K.text(page, `${V} .wn5f-vsday label span`);
  ok(scn, 'the field is «Ημέρα Βέροιας»', lab === 'Ημέρα Βέροιας', lab);
  ok(scn, 'its value is the international\'s day (Κυρ 11/10), not the truck\'s', (await page.evaluate((v) => (document.querySelector(`${v} [data-f="vsday"]`) || {}).value, V)) === '2026-10-11');
  const truck = await K.text(page, `${V} [data-vstruck]`);
  ok(scn, 'the truck on another day is said (no separate step any more)', /φορτηγό στη Βέροια Δευ 12\/10/.test(truck) && await K.count(page, `${V} [data-act="vs-truck-day"]`) === 0, truck);
  await page.fill(`${V} [data-f="vsday"]`, '2026-10-10');
  await page.click(`${V} [data-act="vs-day"]`);
  await page.waitForTimeout(1000);
  let days = K.planOf(S, 'POST', '/plan/vs/day');
  ok(scn, '«Ορισμός ημέρας» = ONE preview POST {order_id:2101, day:"2026-10-10", preview:true}', days.length === 1 && JSON.stringify(days[0].body) === JSON.stringify({ order_id: 2101, day: '2026-10-10', preview: true }), days.map((x) => x.body));
  const prev = await K.text(page, `${V} [data-vsprev]`);
  ok(scn, 'the preview says the day, each truck by its plate, and what stays', /Βέροια Σάβ 10\/10 \(ήταν Κυρ 11\/10\)/.test(prev) && /TST-2104: Δευ 12\/10 → Σάβ 10\/10/.test(prev)
    && /TST-9999 μένει στη Βέροια 12\/10 — η στάση του έγινε/.test(prev) && !/RT-/.test(prev), prev);
  // a day changed after the preview is previewed again, never sent unseen
  await page.fill(`${V} [data-f="vsday"]`, '2026-10-09');
  await page.click(`${V} [data-act="vs-day-ok"]`);
  await page.waitForTimeout(1000);
  days = K.planOf(S, 'POST', '/plan/vs/day');
  ok(scn, 'a day changed after the preview → a new preview, nothing kept', days.length === 2 && days[1].body.preview === true && days[1].body.day === '2026-10-09', days.map((x) => x.body));
  await page.click(`${V} [data-act="vs-day-ok"]`);
  await page.waitForTimeout(1200);
  days = K.planOf(S, 'POST', '/plan/vs/day');
  ok(scn, '«Επιβεβαίωση» = ONE POST {order_id:2101, day:"2026-10-09"} (no preview key)', days.length === 3 && JSON.stringify(days[2].body) === JSON.stringify({ order_id: 2101, day: '2026-10-09' }), days.map((x) => x.body));
  ok(scn, 'after the 200: «γράφτηκε στη διεθνή και στα φορτηγά», the preview closed', /γράφτηκε στη διεθνή και στα φορτηγά/.test(await K.text(page, `${V} [data-vsok]`)) && (await K.text(page, `${V} [data-vsprev]`)) === '');
  ok(scn, 'the trucks move in the base, not from the screen (no PATCH /plan/rt)', !S.plan.some((x) => x.m === 'PATCH'));
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
  ok(scn, 'the days agree → no «other day» line', (await K.text(page, `${V} [data-vstruck]`)) === '');
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
  // before 092 (the answer has no cross_dock_date): the pallets stay the international's, no field, no button
  const p2 = await K.openApp(browser, origin, { plan: vsState(undefined) });
  await p2.page.waitForTimeout(800);
  await p2.page.evaluate(() => WN5Form.openLeg(101, 'KATHODOS'));
  await p2.page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  ok(scn, 'before 092: no pallets field, no «Ορισμός παλετών»', await K.count(p2.page, `${V} [data-f="vspal"]`) === 0 && await K.count(p2.page, `${V} [data-act="vs-pal"]`) === 0
    && /21/.test(await K.text(p2.page, `${V} .wn5f-row`)));
  await p2.page.context().close();
}

// the real cases (610, 630, 644) are exports on the ΑΝΟΔΟΣ: the mark at the truck's arrival in Veroia (r.end), the leg
// form's truck step on that stop, the pallets field on the Greek loading
async function scnExport({ browser, origin, ok, scn }) {
  const plan = { 'GET /plan/vs-state': () => [200, { 2101: entry('2026-10-12', '2026-10-12', [101]), 2102: entry('2026-10-13', '2026-10-14', [102]) }],
    'POST /plan/vs/day': () => [200, { ok: true, op: 'plan_vs_set_day', dry_run: false, ids: { order_id: 2102, piece_id: 4005 }, warnings: [], notice_ids: [9401] }] };
  const { page, S } = await K.openApp(browser, origin, { board: exportWeek(), plan });
  await page.waitForTimeout(800);
  const mark = await K.text(page, '#content .wn5-row[data-rt="102"] .wn5-ato .wn5-vsday:not([hidden])');
  ok(scn, 'RT-T102\'s arrival in Veroia says «VS Τρί 13/10» (the truck: Wed 14/10)', /^VS Τρί 13\/10$/.test(mark), mark);
  ok(scn, 'only that row', await K.count(page, MARK) === 1);
  await page.evaluate(() => WN5Form.openLeg(102, 'ANODOS'));
  await page.waitForSelector(LEG, { timeout: 6000 }).catch(() => {});
  const VX = `${LEG} [data-vs="2102"]`;
  ok(scn, 'the export\'s «Ημέρα Βέροιας» = the international\'s Tue 13/10', (await page.evaluate((v) => (document.querySelector(`${v} [data-f="vsday"]`) || {}).value, VX)) === '2026-10-13');
  const info = await K.text(page, `${VX} [data-vstruck]`);
  ok(scn, 'the truck\'s own day at its Veroia arrival (Wed 14/10) is said', /φορτηγό στη Βέροια Τετ 14\/10/.test(info), info);
  const P = `${VX} [data-f="vspal"][data-piece="4005"]`;
  ok(scn, 'the pallets field is on the Greek loading (12)', await K.count(page, P) === 1 && (await page.evaluate((x) => document.querySelector(x).value, P)) === '12');
  await page.fill(P, '11');
  await page.click(`${VX} [data-act="vs-pal"]`);
  await page.waitForTimeout(1200);
  const sent = K.planOf(S, 'POST', '/plan/vs/day');
  ok(scn, '12 → 11 = ONE POST /plan/vs/day {order_id:2102, piece_id:4005, pallets:11}', sent.length === 1 && JSON.stringify(sent[0].body) === JSON.stringify({ order_id: 2102, piece_id: 4005, pallets: 11 }), sent.map((x) => x.body));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

K.run({
  scenarios: { mark: scnMark, day: scnDay, pallets: scnPallets, export: scnExport },
  globals: ['WN5Form', 'WN5'],
  go: '092: the board marks a truck on another Veroia day, the leg form sets the VS day and pallets with one POST each',
}).catch((e) => { console.error(e); process.exit(1); });
