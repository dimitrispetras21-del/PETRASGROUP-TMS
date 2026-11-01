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
// («μόνο αυτές οι παλέτες» replaced «μόνο αυτό το κομμάτι» of Figma 2395:8022: owner 31/10, no «κομμάτι» on screen)
const jargon = (t) => (String(t || '').replace('μόνο αυτές οι παλέτες', '').match(/κύκλ|RT-|σκέλ|γέφυρ|κομμάτ|τμήμα/gi) || []);

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
  ok(scn, 'F42: «VS-T201 · 2 παραδόσεις · 22π» with «μόνο αυτές οι παλέτες» unticked', /VS-T201 · 2 παραδόσεις · 22π/.test(t0) && !(await page.isChecked(`${DLG} [data-only]`)), t0);
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

// The Veroia board v2 week: the two VS pieces (Veroia day Mon 12/10), a late one (Sun 11/10, due Mon 12/10: before
// today Tue 13/10) and a national that loads elsewhere on Mon 12/10 09:00–10:00 (an «other loading» candidate).
function hubBoard() {
  const b = board();
  b.hub.push(Object.assign({}, VS_BASE, { piece_id: 4203, shipment_id: 5303, order_id: 2202, reference: 'VS-T202', client: 'ΠΕΛΑΤΗΣ Γ', pallets: 5, temperature_c: 4,
    nat_to_location_id: 2, nat_ready_day: '2026-10-11', nat_due_day: '2026-10-12', overdue: true }));
  b.waiting.push({ piece_id: 4301, shipment_id: 5401, kind: 'national', order_id: null, nat_order_id: 3301, order_stop_id: null, pallets: 4, leave_by: null,
    position_location_id: 3, nat_from_location_id: 3, nat_to_location_id: 2, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-13', overdue: false,
    is_stock: false, client_id: 43, client: 'ΠΕΛΑΤΗΣ Γ', reference: 'N-T301', temperature_c: 2, pallet_exchange: false, direction: 'KATHODOS',
    load_from: '2026-10-12T06:00:00+00:00', load_to: '2026-10-12T07:00:00+00:00', deliver_from: '2026-10-13T05:00:00+00:00', deliver_to: '2026-10-13T07:00:00+00:00', price: null });
  // P-11 (087, owner 28/10 answer 1): a VS is on the Veroia panel only once its ✈ sent it there (for_split)
  for (const h of b.hub) h.for_split = true;
  return b;
}
const nfText = (page) => page.evaluate(() => { const n = document.querySelector('#wn5-hub .wn5-nf'); return n ? n.innerText.replace(/\s+/g, ' ').trim() : null; });
const hubText = (page) => page.evaluate(() => { const h = document.getElementById('wn5-hub'); return h ? h.textContent.replace(/\s+/g, ' ').trim() : null; });

// 7 · the list: by day, oldest on top, the late day red, «παρ. <day>», places in the closed line, «⋯» → «Σπάσε…»
async function veroia_list({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: hubBoard() });
  const closed = await hubText(page);
  ok(scn, 'the closed line names delivery places, never clients', /LARISA TEST/.test(closed) && /THESSALONIKI TEST/.test(closed) && !/ΠΕΛΑΤΗΣ/.test(closed), closed);
  await page.click('#wn5-hub [data-hub="open"]');
  const g = await page.evaluate(() => [...document.querySelectorAll('#wn5-hub .wn5-hub-l > .wn5-hub-gh, #wn5-hub .wn5-hub-l > .wn5-hub-it')].map((e) => e.classList.contains('wn5-hub-gh') ? 'H ' + e.textContent.replace(/\s+/g, ' ').trim() : 'R ' + e.dataset.piece));
  ok(scn, 'by day, the oldest first: Sun 11/10 (late, red «αργό · παράδοση Δευ 12/10») then Mon 12/10', g[0] === 'H ΚΥΡ 11/10 · 1 · 5παργό · παράδοση Δευ 12/10' && g[1] === 'R 4203' && /^H ΔΕΥ 12\/10 · 2 · 22π$/.test(g[2]) && g[3] === 'R 4201' && g[4] === 'R 4202', g);
  const t = await hubText(page);
  ok(scn, 'a delivery without a window says its day: «παρ. Τρί 13/10» (never «παρ. —»)', /παρ\. Τρί 13\/10/.test(t) && !/παρ\. —/.test(t), t);
  ok(scn, 'the header counts the late: «1 αργό»', /1 αργό/.test(t), t);
  ok(scn, '«Σε φορτηγό ▾» on the row; «Σπάσε…» only in «⋯»', (await K.count(page, '#wn5-hub .wn5-hub-it[data-piece="4201"] [data-hub="truck"]')) === 1 && !(await K.count(page, '#wn5-hub .wn5-hub-it .wn5-split-b')));
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4201"] [data-hub="more"]');
  await page.click('.wn5-hub-pop [data-v="split"]');
  ok(scn, '«⋯» → «Σπάσε…» opens the split window', await page.waitForSelector('.wn5-dlg[data-wn5="split"]', { timeout: 3000 }).then(() => true, () => false));
  ok(scn, 'nothing written', !saves(S).length, saves(S).map((x) => x.path));
  await page.context().close();
}

// 8 · «Νέο φορτίο»: tick two rows, add another loading, pick the truck in the SAME form, one POST /plan/legs
async function veroia_new({ browser, origin, ok, scn, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: hubBoard(), plan: { 'POST /plan/legs': async () => OK('plan_put_pieces', { rt_id: 902 }) } });
  await page.click('#wn5-hub [data-hub="open"]');
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4201"] .wn5-hub-ck');
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4202"] .wn5-hub-ck');
  let t = await nfText(page);
  ok(scn, '«ΝΕΟ ΦΟΡΤΙΟ · 2 επιλεγμένα · 22π», the Veroia day today Tue 13/10 (the rows are late: never before today), «όλη η ημέρα»', /ΝΕΟ ΦΟΡΤΙΟ 2 επιλεγμένα · 22π/.test(t)
    && (await page.evaluate(() => document.querySelector('#wn5-hub .wn5-nf-day').value)) === '2026-10-13' && /όλη η ημέρα/.test(t), t);
  ok(scn, 'no truck yet: «Λείπει: φορτηγό», «Δημιουργία φορτίου» off', /Λείπει: φορτηγό/.test(t) && await page.isDisabled('#wn5-hub [data-act="nf-create"]'), t);
  ok(scn, 'no «κύκλος» on the panel (the Figma heading «…ΣΤΟΝ ΙΔΙΟ ΚΥΚΛΟ» reads «…ΣΤΟ ΙΔΙΟ ΦΟΡΤΗΓΟ»)', !jargon(t).length && /ΑΛΛΕΣ ΦΟΡΤΩΣΕΙΣ ΣΤΟ ΙΔΙΟ ΦΟΡΤΗΓΟ/.test(t), jargon(t));
  await page.selectOption('#wn5-hub .wn5-nf-day', '2026-10-14');
  t = await nfText(page);
  ok(scn, 'a Veroia day after the deliveries\' day says it, short: «2 παραδόσεις είναι για Τρί 13/10 · θα φύγουν αργά»', /2 παραδόσεις είναι για Τρί 13\/10 · θα φύγουν αργά/.test(t), t);
  await page.selectOption('#wn5-hub .wn5-nf-day', '2026-10-12');
  await page.click('#wn5-hub .wn5-nf .wn5a-hrs');
  await page.fill('#wn5-hub [data-nfhm="from"]', '1600');
  await page.press('#wn5-hub [data-nfhm="from"]', 'Tab');
  await page.fill('#wn5-hub [data-nfhm="to"]', '1800');
  await page.press('#wn5-hub [data-nfhm="to"]', 'Tab');
  await page.click('#wn5-hub .wn5-nf-add');
  await page.click('.wn5-hub-pop [data-v="4301"]');
  t = await nfText(page);
  ok(scn, '«+ φόρτωση από αναμονή» adds the national that loads elsewhere (3 επιλεγμένα · 26π), the note gone', /3 επιλεγμένα · 26π/.test(t) && /ΠΕΛΑΤΗΣ Γ/.test(t) && !/αργά/.test(t), t);
  await page.click('#wn5-hub .wn5-nf-pick');
  await page.waitForSelector(DLG, { timeout: 4000 });
  const f0 = await dlgText(page);
  ok(scn, 'the truck is chosen in the SAME form; Veroia read-only on the panel\'s day and window', /Ανάθεση/.test(f0) && /Φόρτωση · Βέροια · Δευ 12\/10 ?16:00–18:00/.test(f0) && /ΔΙΚΟΣ ΣΤΟΛΟΣ/.test(f0), f0);
  await pickIn(page, 'tk', '2106', 'TST-2106');
  await pickIn(page, 'tl', '5104', 'TRL-5104');
  await pickIn(page, 'dr', 'Test 03', 'Driver Test 03');
  const f1 = await foot(page);
  ok(scn, 'the form says «Επιλογή · TST-2106» (it writes nothing)', f1.save === 'Επιλογή · TST-2106' && !f1.off, f1);
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(150);
  ok(scn, '«Επιλογή» wrote nothing', !saves(S).length, saves(S).map((x) => x.path));
  t = await nfText(page);
  ok(scn, 'the panel: the truck line «TST-2106 · TRL-5104 · Driver Test 03 · ελεύθερο · 0 → 26/33 · Αλλαγή ▾»', /TST-2106 TRL-5104 · Driver Test 03 ελεύθερο 0 → 26\/33 Αλλαγή ▾/.test(t), t);
  ok(scn, 'the stop order (the base\'s: by start) and the load: «Σειρά: 1 Aspropyrgos φόρτωση 09:00–10:00 → 2 Βέροια φόρτωση 16:00–18:00 → 3 Larisa → 4 Thessaloniki → 5 Athens», «26/33 · 7 ελεύθερες»',
    /Σειρά: 1 Aspropyrgos φόρτωση 09:00–10:00 → 2 Βέροια φόρτωση 16:00–18:00 → 3 Larisa → 4 Thessaloniki → 5 Athens/.test(t) && /26\/33 · 7 ελεύθερες/.test(t), t);
  ok(scn, 'temperatures 2 °C one value: «2 °C ✓»', /2 °C ✓/.test(t), t);
  if (shots) await page.screenshot({ path: shots + '/veroia-new.png' });
  ok(scn, '«Δημιουργία φορτίου · 26π → TST-2106» on', !(await page.isDisabled('#wn5-hub [data-act="nf-create"]')) && /Δημιουργία φορτίου · 26π → TST-2106/.test(t), t);
  await page.click('#wn5-hub [data-act="nf-create"]');
  await page.waitForTimeout(600);
  const w = saves(S);
  const body = w[0] && w[0].body;
  ok(scn, 'ONE write: POST /plan/legs {pieces: 4201, 4202, 4301}', w.length === 1 && w[0].path === '/plan/legs' && body && JSON.stringify(body.pieces) === '[{"piece_id":4201},{"piece_id":4202},{"piece_id":4301}]', w.map((x) => x.raw));
  ok(scn, 'target: new_rt OWNED 13 / 22 / 33, side KATHODOS', body && JSON.stringify(body.target) === JSON.stringify({ new_rt: { trip_type: 'OWNED', truck_id: 13, trailer_id: 22, driver_id: 33 }, side: 'KATHODOS' }), body && body.target);
  const st = body ? body.stops : [];
  const at = (loc) => st.find((s) => s.location_id === loc) || {};
  ok(scn, 'stops: Veroia Mon 12/10 16:00–18:00 (the panel\'s), Aspropyrgos its own 09:00–10:00, the VS deliveries Tue 13/10 whole day, Athens its own',
    at(1).planned_from === '2026-10-12T16:00:00+03:00' && at(1).planned_to === '2026-10-12T18:00:00+03:00' && at(3).planned_from === '2026-10-12T06:00:00+00:00'
    && at(4).planned_from === '2026-10-13T00:00:00+03:00' && at(5).planned_to === '2026-10-13T23:59:00+03:00' && at(2).planned_from === '2026-10-13T05:00:00+00:00' && st.length === 5, st);
  ok(scn, 'after the 200: the board read again, the new load empty', K.planOf(S, 'GET', '/plan/board').length >= 2 && !(await K.count(page, '#wn5-hub .wn5-hub-ck:checked')));
  await page.context().close();
}

// 9 · F51 / F61 / F56 (owner 30-31/10): TST-2104 runs RT-T101 Mon 16:00 → Tue 22:00, back at Veroia. A ΚΑΘΟΔΟΣ load of
// Tue: «νέο φορτίο μετά την Βέροια · ελεύθερο από 22:00» by default (it came back), «στο ίδιο φορτίο» one click away;
// the new load's whole-day rows start at 22:00 (the base's [) busy check: no clash); trailer / driver suggested.
async function f61({ browser, origin, ok, scn, shots }) {
  const b = board();
  b.waiting.push({ piece_id: 4401, shipment_id: 5501, kind: 'national', order_id: null, nat_order_id: 3401, order_stop_id: null, pallets: 6, leave_by: null,
    position_location_id: 2, nat_from_location_id: 2, nat_to_location_id: 4, nat_ready_day: '2026-10-13', nat_due_day: '2026-10-13', overdue: false,
    is_stock: false, client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', reference: 'N-T401', temperature_c: 4, pallet_exchange: false, direction: 'KATHODOS',
    load_from: null, load_to: null, deliver_from: null, deliver_to: null, price: null });
  const { page, S } = await K.openApp(browser, origin, { board: b, plan: { 'POST /plan/legs': async () => OK('plan_put_group') } });
  await openWaiting(page, 4401);
  await pickIn(page, 'tk', '2104', 'TST-2104');
  let l = await lineOf(page);
  ok(scn, 'F61: two options «στο ίδιο φορτίο» | «νέο φορτίο», the new one chosen (the truck came back to Veroia that day)',
    !!l && /στο ίδιο φορτίο/.test(l.text) && /νέο φορτίο/.test(l.text) && l.txt === 'TST-2104 · νέο φορτίο μετά την Βέροια · ελεύθερο από 22:00', l);
  const tl = await field(page, 'tl'), dr = await field(page, 'dr');
  ok(scn, 'F56: trailer and driver of its last trip are SUGGESTED (shown «πρόταση», editable, not locked)', tl.val === 'TRL-5102' && dr.val === 'Driver Test 01'
    && /^πρόταση/.test(tl.av) && /^πρόταση/.test(dr.av) && !tl.dis && !dr.dis && (await K.count(page, `${DLG} .wn5a-sugg`)) === 2, { tl, dr });
  const chips = await page.evaluate((s) => [...document.querySelectorAll(`${s} .wn5a-all.on`)].map((x) => x.textContent), DLG);
  ok(scn, 'F51: the rows of that day read «από 22:00» (what is sent), never a silent 00:00', chips.length === 2 && chips.every((c) => c === 'από 22:00'), chips);
  if (shots) await page.screenshot({ path: shots + '/f61-new-after.png' });
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  let x = saves(S).pop();
  ok(scn, 'POST /plan/legs: new_rt OWNED 11 / 21 / 31, every stop of Tue from 22:00', !!x && JSON.stringify(x.body.target.new_rt) === JSON.stringify({ trip_type: 'OWNED', truck_id: 11, trailer_id: 21, driver_id: 31 })
    && x.body.stops.every((s) => s.planned_from === '2026-10-13T22:00:00+03:00'), x && x.body);
  await openWaiting(page, 4401);
  await pickIn(page, 'tk', '2104', 'TST-2104');
  await page.click(`${DLG} [data-act="opt"][data-i="0"]`);
  l = await lineOf(page);
  const tl2 = await field(page, 'tl');
  ok(scn, '«στο ίδιο φορτίο»: the line names the trip, its trailer read-only', /^TST-2104 · Δευ 12\/10|^TST-2104 · στο δρόμο από Δευ 12\/10/.test(l.txt) && tl2.dis && !/πρόταση/.test(tl2.av), { l, tl2 });
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  x = saves(S).pop();
  ok(scn, '… POST /plan/legs into rt 101', !!x && x.body.target.rt_id === 101, x && x.body);
  // code review: the joined trip's trailer / driver never stick to another truck unmarked
  await openWaiting(page, 4401);
  await pickIn(page, 'tk', '2104', 'TST-2104');
  await page.click(`${DLG} [data-act="opt"][data-i="0"]`);
  await pickIn(page, 'tk', '2106', 'TST-2106');
  const tl3 = await field(page, 'tl'), dr3 = await field(page, 'dr');
  ok(scn, 'join TST-2104, then pick free TST-2106: its trailer / driver are not the other truck\'s, unmarked', !(tl3.val === 'TRL-5102' && !/πρόταση/.test(tl3.av)) && !(dr3.val === 'Driver Test 01' && !/πρόταση/.test(dr3.av)), { tl3, dr3 });
  await page.context().close();
}

// 10 · F54: the load of a side is its peak along the stops, never the sum (30 off at Patra, then 27 on = 30, not 57)
async function f54({ browser, origin, ok, scn }) {
  const { page } = await K.openApp(browser, origin, { board: board() });
  const r = await page.evaluate(() => [WN5Assign._peak([{ t: 1, d: 30 }, { t: 2, d: -30 }, { t: 3, d: 27 }]), WN5Assign._peak([{ t: 1, d: 21 }, { t: 1, d: 6 }, { t: 5, d: -21 }, { t: 6, d: -6 }]),
    WN5Assign._peak([{ t: 2, d: 10 }, { t: 2, d: -10 }, { t: 2, d: 5 }])]);
  ok(scn, 'peak: 30 / 27 / 5 (an unload at the same time goes first)', JSON.stringify(r) === '[30,27,5]', r);
  await page.context().close();
}

K.run({ scenarios: { own_new, own_join, only_hours, partner, vehicle, handover, veroia_list, veroia_new, f61, f54 }, globals: ['WN5', 'WN5Act', 'WN5Assign', 'WN5Hand'],
  go: 'the assignment form (own new / join / only / hours / F39 / partner / vehicle / F51-F61 / F54 / F56), ✈ «Αλλαγή οχήματος…» and the Veroia board v2 «Νέο φορτίο» hold' });
