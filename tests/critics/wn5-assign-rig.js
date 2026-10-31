// Rig — National v5, the assignment form = the Weekly International form (owner 28/10 + 31/10, Figma 2394:7793,
// docs/national-v5/assign-intl-form-2026-10-28.md, modules/wn5_assign.js), the ✈ «Αλλαγή οχήματος…» entry (B-13 = α)
// and the Veroia board v2 «Νέο φορτίο» (Figma 2383:7736 / 2396:8024).
//
// Judged by what reached the fake /plan/* — method, path, raw body (S.plan is «the table» of this rig) — and by the
// DOM; never by a screenshot. Synthetic data only (the repo is public). Writes answer 200 in the plan_* shape (day L
// is past: PLAN_WRITES_OPEN = true) unless a scenario scripts a refusal (rig sentinel).
//
// Usage: node tests/critics/wn5-assign-rig.js [scenario …] [--shots <dir>]
//        WN5_TREE=<git archive origin/main> node tests/critics/wn5-assign-rig.js     (plain-main proof: NO-GO, exit 1)
// Exit: 0 green · 1 a check failed · 2 unknown scenario.
'use strict';
const K = require('./wn5-rig-kit.js');

const OK = (op, ids) => [200, { ok: true, op, ids: ids || {}, warnings: [], notice_ids: [] }];
const VS_BASE = { kind: 'vs_import', order_id: 2201, nat_order_id: null, order_stop_id: null, reference: 'VS-T201', client_id: 42, client: 'ΠΕΛΑΤΗΣ Β',
  temperature_c: 2, is_stock: false, leave_by: null, overdue: false, inbound_rt_id: null, for_split: false, pallet_exchange: false, price: null,
  position_location_id: 1, nat_from_location_id: 1, load_from: null, load_to: null, deliver_from: null, deliver_to: null };
// The kit week + a VS import of two deliveries standing at Veroia (hub[], never on a truck: a ΠΡΟΣ ΑΝΑΘΕΣΗ row and the
// Veroia board), its Veroia day Mon 12/10 (nat_ready_day = the cross-dock), deliveries Tue 13/10 with no window (a
// VS bridge: order_stops hold dates only).
function board(o) {
  const b = K.week();
  b.hub = [
    Object.assign({}, VS_BASE, { piece_id: 4201, shipment_id: 5301, pallets: 12, nat_to_location_id: 4, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-13' }),
    Object.assign({}, VS_BASE, { piece_id: 4202, shipment_id: 5302, pallets: 10, nat_to_location_id: 5, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-13' }),
  ];
  return Object.assign(b, o || {});
}
const DLG = '.wn5-dlg.wn5a[data-wn5="assign"]';
const dlgText = (page) => page.evaluate((s) => { const d = document.querySelector(s); return d ? d.textContent.replace(/\s+/g, ' ').trim() : null; }, DLG);
const saves = (S, path) => S.plan.filter((x) => x.m !== 'GET' && (!path || x.path === path));
async function openWaiting(page, piece) {
  await page.click(`#content .wn5-row[data-piece="${piece}"] [data-act="assign"]`, { timeout: 4000 });
  await page.waitForSelector(DLG, { timeout: 4000 });
}
// pick from a field's list: type, then press the option (the International dropdown)
async function pickIn(page, px, typed, label) {
  await page.click(`${DLG} [data-in="${px}"]`, { clickCount: 3 });
  await page.keyboard.type(typed);
  await page.waitForSelector('.wn5a-list [data-pick]', { timeout: 3000 });
  const opts = await page.$$('.wn5a-list [data-pick]');
  for (const o of opts) if ((await o.textContent()).startsWith(label)) { await o.dispatchEvent('mousedown'); await page.waitForTimeout(50); return true; }
  return false;
}
const field = (page, px) => page.evaluate(({ s, px }) => {
  const f = document.querySelector(`${s} [data-f="${px}"]`);
  if (!f) return null;
  const i = f.querySelector('input');
  return { bad: f.classList.contains('wn5a-bad'), val: i ? i.value : null, dis: i ? i.disabled : null, av: (f.querySelector('.wn5a-av') || {}).textContent || '' };
}, { s: DLG, px });
const foot = (page) => page.evaluate((s) => {
  const d = document.querySelector(s);
  const b = d && d.querySelector('[data-act="save"]');
  return d ? { miss: d.querySelector('[data-miss]').textContent, save: b ? b.textContent : null, off: b ? b.disabled : null } : null;
}, DLG);
const lineOf = (page) => page.evaluate((s) => {
  const l = document.querySelector(`${s} [data-line]`);
  return l ? { txt: l.querySelector('.wn5a-lt').textContent, cap: l.querySelector('[data-cap]').textContent, over: l.querySelector('[data-cap]').classList.contains('over'), text: l.textContent } : null;
}, DLG);
// the screen words the owner ruled out (31/10): no «κύκλος», no RT code, no «σκέλος / γέφυρα / κομμάτι / τμήμα»
// («μόνο αυτό το κομμάτι» is the one approved label, Figma 2395:8022)
const jargon = (t) => (String(t || '').replace('μόνο αυτό το κομμάτι', '').match(/κύκλ|RT-|σκέλ|γέφυρ|κομμάτ|τμήμα/gi) || []);

// 1 · own truck, new: free truck + trailer + driver, one line «… · ελεύθερο», one POST /plan/legs with new_rt
async function own_new({ browser, origin, ok, scn, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: board(), plan: { 'POST /plan/legs': async () => OK('plan_put_group', { rt_id: 901 }) } });
  await openWaiting(page, 4101);
  const t0 = await dlgText(page);
  ok(scn, 'the form opens (Ανάθεση · ΗΜΕΡΑ ΚΑΙ ΠΑΡΑΘΥΡΟ · ΔΙΚΟΣ ΣΤΟΛΟΣ · ΣΥΝΕΡΓΑΤΗΣ), no tabs, no candidate list',
    /Ανάθεση/.test(t0) && /ΗΜΕΡΑ ΚΑΙ ΠΑΡΑΘΥΡΟ/.test(t0) && /ΔΙΚΟΣ ΣΤΟΛΟΣ/.test(t0) && /ΣΥΝΕΡΓΑΤΗΣ/.test(t0) && !(await K.count(page, `${DLG} .wn5-cand, ${DLG} .wn5-seg`)), t0);
  ok(scn, 'no «κύκλος», RT code, «σκέλος / γέφυρα / κομμάτι / τμήμα» in the form', !jargon(t0).length, jargon(t0));
  ok(scn, 'the partner\'s «Πινακίδες» and an ΑΝΟΔΟΥ rate are not drawn (no column / needs SQL)', !/Πινακίδες/.test(t0) && !/ΑΝΟΔΟΥ/.test(t0), t0);
  let f = await foot(page);
  ok(scn, 'nothing chosen: save off, «Λείπει: φορτηγό ή συνεργάτης»', f.off && /Λείπει: φορτηγό ή συνεργάτης/.test(f.miss), f);
  ok(scn, 'pick truck TST-2106 from the list', await pickIn(page, 'tk', '2106', 'TST-2106'));
  const tk = await field(page, 'tk');
  ok(scn, 'the truck field holds the plate, «✓ ελεύθερο» under it', tk.val === 'TST-2106' && /✓ ελεύθερο/.test(tk.av), tk);
  ok(scn, 'pick trailer TRL-5104', await pickIn(page, 'tl', '5104', 'TRL-5104'));
  ok(scn, 'pick driver Driver Test 03', await pickIn(page, 'dr', 'Test 03', 'Driver Test 03'));
  const l = await lineOf(page);
  ok(scn, 'one line: «TST-2106 · ελεύθερο» and «0 → 8/33»', l && l.txt === 'TST-2106 · ελεύθερο' && l.cap === '0 → 8/33' && !l.over, l);
  f = await foot(page);
  ok(scn, 'save on, «Αποθήκευση ανάθεσης», no «Λείπει»', !f.off && f.save === 'Αποθήκευση ανάθεσης' && !f.miss, f);
  if (shots) await page.screenshot({ path: shots + '/own-new.png' });
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  const w = saves(S);
  ok(scn, 'exactly one write: POST /plan/legs', w.length === 1 && w[0].m === 'POST' && w[0].path === '/plan/legs', w.map((x) => x.m + ' ' + x.path));
  const body = w[0] && w[0].body;
  ok(scn, 'body: the order whole (group), target new_rt OWNED 13 / trailer 22 / driver 33, side KATHODOS',
    body && body.group && body.group.nat_order_id === 3101 && body.target.side === 'KATHODOS'
    && JSON.stringify(body.target.new_rt) === JSON.stringify({ trip_type: 'OWNED', truck_id: 13, trailer_id: 22, driver_id: 33 }), body);
  ok(scn, 'stops: the order\'s own windows, new stops (location_id), never a seq', body && body.stops.length === 2 && body.stops.every((s) => s.location_id && s.planned_from && s.planned_to && !('seq' in s)), body && body.stops);
  ok(scn, 'after the 200: the form closed and the board was read again', !(await K.count(page, DLG)) && K.planOf(S, 'GET', '/plan/board').length >= 2);
  await page.context().close();
}

// 2 · own truck, join: the truck already loads at Veroia that day → its cycle, its trailer and driver, «27 → 49/33» red
async function own_join({ browser, origin, ok, scn, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: board(), plan: { 'POST /plan/legs': async () => OK('plan_put_group') } });
  await openWaiting(page, 4201);
  const t0 = await dlgText(page);
  ok(scn, 'header: the VS, Veroia on its own day (Mon 12/10), its deliveries, 22π, ΚΑΘΟΔΟΣ',
    /VS-T201 · Βέροια Δευ 12\/10 → LARISA TEST Τρί 13\/10 \+1 · 22π/.test(t0) && /ΚΑΘΟΔΟΣ/.test(t0), t0);
  ok(scn, 'F42: «VS-T201 · 2 παραδόσεις · 22π» with «μόνο αυτό το κομμάτι» unticked', /VS-T201 · 2 παραδόσεις · 22π/.test(t0) && !(await page.isChecked(`${DLG} [data-only]`)), t0);
  ok(scn, 'pick truck TST-2104 (it loads at Veroia Mon 16:00–18:00)', await pickIn(page, 'tk', '2104', 'TST-2104'));
  const tk = await field(page, 'tk'), tl = await field(page, 'tl'), dr = await field(page, 'dr');
  ok(scn, 'under the truck: «Βέροια 16:00–18:00 · 27π»', /Βέροια 16:00–18:00 · 27π/.test(tk.av), tk);
  ok(scn, 'joining keeps the truck\'s trailer and driver, read-only', tl.val === 'TRL-5102' && tl.dis && dr.val === 'Driver Test 01' && dr.dis, { tl, dr });
  const l = await lineOf(page);
  ok(scn, 'the line: «TST-2104 · Δευ 12/10» and «27 → 49/33» red (over 33 = the number red, F31)', l && l.txt === 'TST-2104 · Δευ 12/10' && l.cap === '27 → 49/33' && l.over, l);
  const rows = await page.evaluate((s) => [...document.querySelectorAll(`${s} .wn5a-win`)].map((r) => [...r.children].map((c) => c.textContent.trim()).join(' ')), DLG);
  ok(scn, 'ΗΜΕΡΑ ΚΑΙ ΠΑΡΑΘΥΡΟ: Veroia read-only from the truck\'s stop; each delivery «όλη η ημέρα» + «ώρες…»',
    rows[0] === 'Φόρτωση · Βέροια · Δευ 12/10 16:00–18:00' && rows.length === 3 && rows.slice(1).every((r) => /^Παράδοση · .* · Τρί 13\/10 όλη η ημέρα ώρες…$/.test(r)), rows);
  const f = await foot(page);
  ok(scn, 'over 33 never blocks: save on, no «Λείπει»', !f.off && !f.miss, f);
  if (shots) await page.screenshot({ path: shots + '/own-join.png' });
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  const w = saves(S);
  const body = w[0] && w[0].body;
  ok(scn, 'one POST /plan/legs: {group: {order_id: 2201}, target {rt_id: 101, side KATHODOS}}', w.length === 1 && body.group && body.group.order_id === 2201 && body.target.rt_id === 101 && body.target.side === 'KATHODOS', w.map((x) => x.raw));
  const hub = body && body.stops.find((s) => s.stop_id === 1001);
  const drops = body ? body.stops.filter((s) => s.location_id) : [];
  ok(scn, 'stops: the truck\'s Veroia stop by stop_id; the deliveries Tue 13/10 00:00–23:59 (whole day, Athens)', !!hub && drops.length === 2
    && drops.every((s) => s.planned_from === '2026-10-13T00:00:00+03:00' && s.planned_to === '2026-10-13T23:59:00+03:00'), body && body.stops);
  await page.context().close();
}

// 3 · F42 «μόνο αυτό», hours, F39 a name typed and not picked
async function only_hours({ browser, origin, ok, scn, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: board(), plan: { 'POST /plan/legs': async () => OK('plan_put_pieces') } });
  await openWaiting(page, 4201);
  await page.check(`${DLG} [data-only]`);
  await page.waitForTimeout(100);
  const t = await dlgText(page);
  ok(scn, '«μόνο αυτό»: the header counts 12π and one delivery', /VS-T201 · Βέροια Δευ 12\/10 → LARISA TEST Τρί 13\/10 · 12π/.test(t), t);
  // F39: a driver name typed and not picked
  await page.click(`${DLG} [data-in="dr"]`);
  await page.keyboard.type('Driver Te');
  await page.click(`${DLG} .wn5a-sub`);
  await page.waitForTimeout(100);
  const dr = await field(page, 'dr');
  let f = await foot(page);
  ok(scn, 'F39: the typed name stays in the field, red, «διάλεξε από τη λίστα»', dr.val === 'Driver Te' && dr.bad && dr.av === 'διάλεξε από τη λίστα', dr);
  ok(scn, 'F39: «Λείπει: οδηγός (διάλεξε από τη λίστα)», save off', f.off && /οδηγός \(διάλεξε από τη λίστα\)/.test(f.miss), f);
  await pickIn(page, 'dr', '', 'Driver Test 02');
  await pickIn(page, 'tk', '2106', 'TST-2106');
  // hours: «ώρες…» on the delivery, empty = red; 0700–0900 written on the delivery's own day
  await page.click(`${DLG} .wn5a-win[data-row^="drop"] [data-act="hours"]`);
  await page.waitForTimeout(100);
  f = await foot(page);
  const red = await page.evaluate((s) => !!document.querySelector(`${s} .wn5a-win[data-row^="drop"] .wn5a-wl.bad`) && !!document.querySelector(`${s} .wn5a-werr`), DLG);
  ok(scn, 'empty hours: the row red, «γράψε ώρες ή «όλη η ημέρα»», «Λείπει: ώρες παράδοσης Larisa», save off', red && f.off && /ώρες παράδοσης Larisa/.test(f.miss), f);
  if (shots) await page.screenshot({ path: shots + '/missing.png' });
  await page.fill(`${DLG} [data-hm="from"]`, '0700');
  await page.fill(`${DLG} [data-hm="to"]`, '0900');
  await page.click(`${DLG} .wn5a-sub`);
  f = await foot(page);
  ok(scn, 'hours typed: save on', !f.off && !f.miss, f);
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  const body = (saves(S)[0] || {}).body;
  ok(scn, '«μόνο αυτό» sends {pieces: [{piece_id: 4201}]}, never the group', body && !body.group && JSON.stringify(body.pieces) === '[{"piece_id":4201}]', body);
  const drop = body && body.stops.find((s) => s.location_id === 4);
  const hubS = body && body.stops.find((s) => s.location_id === 1);
  ok(scn, 'the delivery 07:00–09:00 on Tue 13/10; Veroia whole day Mon 12/10 (its own day, #171)', drop && drop.planned_from === '2026-10-13T07:00:00+03:00' && drop.planned_to === '2026-10-13T09:00:00+03:00'
    && hubS && hubS.planned_from === '2026-10-12T00:00:00+03:00' && hubS.planned_to === '2026-10-12T23:59:00+03:00', body && body.stops);
  await page.context().close();
}

// 4 · partner: search, rate, «abc» red; the base's refusal stays in the form with its words
async function partner({ browser, origin, ok, scn, shots }) {
  let n = 0;
  const { page, S } = await K.openApp(browser, origin, { board: board(), plan: { 'POST /plan/legs': async () => (++n === 1 ? K.planErr(422, 'PLAN_RULE', 'truck_busy') : OK('plan_put_group')) } });
  await openWaiting(page, 4101);
  ok(scn, 'pick partner Partner Test 01', await pickIn(page, 'pt', 'Partner', 'Partner Test 01'));
  await page.fill(`${DLG} [data-rate]`, 'abc');
  let f = await foot(page);
  const r = await field(page, 'rate');
  ok(scn, 'rate «abc»: red «μόνο αριθμός», «Λείπει: κόμιστρο (αριθμός)», save off', r.bad && /μόνο αριθμός/.test(r.av) && f.off && /κόμιστρο \(αριθμός\)/.test(f.miss), { r, f });
  await page.fill(`${DLG} [data-rate]`, '350,50');
  const l = await lineOf(page);
  ok(scn, 'the line: «Partner Test 01 · ελεύθερο · 0 → 8/33»', l && l.txt === 'Partner Test 01 · ελεύθερο' && l.cap === '0 → 8/33', l);
  if (shots) await page.screenshot({ path: shots + '/partner.png' });
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  const st = await page.evaluate((s) => { const d = document.querySelector(s); return d ? (d.querySelector('.wn5-strip') || {}).textContent || '' : null; }, DLG);
  ok(scn, 'the base\'s refusal: the form stays open with the Worker\'s words (rig sentinel)', st !== null && /rig sentinel truck_busy/.test(st), st);
  f = await foot(page);
  ok(scn, 'after the refusal the save is on again (the next press is the user\'s)', !f.off, f);
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  const w = saves(S);
  ok(scn, 'two presses = two POSTs (no automatic resend); the second the same bytes', w.length === 2 && w[0].raw === w[1].raw, w.map((x) => x.raw));
  const body = w[1] && w[1].body;
  ok(scn, 'body: new_rt PARTNER 51, partner_rate 350.5', body && JSON.stringify(body.target.new_rt) === JSON.stringify({ trip_type: 'PARTNER', partner_id: 51, partner_rate: 350.5 }), body);
  await page.context().close();
}

// 5 · ✈ «Ανάθεση / αλλαγή» on a cycle: the same form, PATCH /plan/rt/:id with only what changed; «Καθαρισμός» there
async function vehicle({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: board(), plan: { 'PATCH /plan/rt/101': async () => OK('plan_rt_update') } });
  await page.evaluate(() => WN5Act.assign(null, { entry: 'menu', rtId: 101 }));
  await page.waitForSelector(DLG, { timeout: 4000 });
  const t = await dlgText(page);
  ok(scn, 'the vehicle form: no ΗΜΕΡΑ rows, no line, «Καθαρισμός», no RT code', !/ΗΜΕΡΑ ΚΑΙ ΠΑΡΑΘΥΡΟ/.test(t) && !(await K.count(page, `${DLG} [data-line]`)) && /Καθαρισμός/.test(t) && !jargon(t).length, t);
  let f = await foot(page);
  ok(scn, 'unchanged: save off', f.off, f);
  await pickIn(page, 'dr', 'Test 02', 'Driver Test 02');
  f = await foot(page);
  ok(scn, 'a new driver: save on', !f.off, f);
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  const w = saves(S);
  ok(scn, 'one PATCH /plan/rt/101 {set: {trip_type OWNED, truck 11, trailer 21, driver 32}}', w.length === 1 && w[0].m === 'PATCH'
    && JSON.stringify(w[0].body) === JSON.stringify({ set: { trip_type: 'OWNED', truck_id: 11, trailer_id: 21, driver_id: 32 } }), w.map((x) => x.m + ' ' + x.path + ' ' + x.raw));
  await page.context().close();
}

// 6 · ✈ «Αλλαγή οχήματος…»: a new line above «Καθαρισμός ανάθεσης», plates and hours, «Συνέχεια ›» → H2 without RT
async function handover({ browser, origin, ok, scn, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: board() });
  const items = await page.evaluate(() => WN5._menuItems(101).map((x) => x.label));
  ok(scn, '✈ has «Αλλαγή οχήματος…» right above «Καθαρισμός ανάθεσης»', items.indexOf('Αλλαγή οχήματος…') >= 0 && items.indexOf('Αλλαγή οχήματος…') === items.indexOf('Καθαρισμός ανάθεσης') - 1, items);
  await page.evaluate(() => WN5Hand.entry && WN5Hand.entry(101));
  const has = await page.waitForSelector('.wn5h-entry', { timeout: 4000 }).then(() => true, () => false);
  const e = has ? await page.evaluate(() => document.querySelector('.wn5h-entry').textContent.replace(/\s+/g, ' ').trim()) : '';
  ok(scn, 'the entry: «Αλλαγή οχήματος · TST-2104 · Driver Test 01 · Δευ 12/10 → Τρί 13/10», «ΕΝΑ ΦΟΡΤΗΓΟ ΩΣ ΤΩΡΑ», plates and hours', /Αλλαγή οχήματος/.test(e) && /TST-2104 · Driver Test 01/.test(e)
    && /ΕΝΑ ΦΟΡΤΗΓΟ ΩΣ ΤΩΡΑ/.test(e) && /TST-2104 · TRL-5102/.test(e) && /Δευ 16:00 → Τρί 22:00/.test(e) && !jargon(e).length, e);
  if (shots && has) await page.screenshot({ path: shots + '/handover-entry.png' });
  if (has) await page.click('.wn5h-entry [data-act="save"]');
  const h2 = await page.waitForSelector('.wn5h-handover', { timeout: 4000 }).then(() => true, () => false);
  const h = h2 ? await page.evaluate(() => document.querySelector('.wn5h-handover .wi4-dlg-hd').textContent.replace(/\s+/g, ' ').trim()) : '';
  ok(scn, '«Συνέχεια ›» opens H2, titled without an RT code', h2 && /^Αλλαγή οχήματος/.test(h) && !/RT-/.test(h), h);
  ok(scn, 'nothing was written by the entry', !saves(S).length, saves(S).map((x) => x.path));
  await page.context().close();
}

K.run({ scenarios: { own_new, own_join, only_hours, partner, vehicle, handover }, globals: ['WN5', 'WN5Act', 'WN5Assign', 'WN5Hand'],
  go: 'the assignment form (own new / join / only / hours / F39 / partner / vehicle) and ✈ «Αλλαγή οχήματος…» hold' });
