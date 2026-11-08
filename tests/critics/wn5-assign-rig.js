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
  // owner 3/11: TRL-5102 runs RT-T101 Mon–Tue, the load is Wed–Thu — a trip of the day before says nothing
  ok(scn, 'pick trailer TRL-5102', await pickIn(page, 'tl', '5102', 'TRL-5102'));
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
  ok(scn, 'body: the order whole (group), target new_rt OWNED 13 / trailer 21 / driver 33, side KATHODOS, no accept_busy (nothing said)',
    body && body.group && body.group.nat_order_id === 3101 && body.target.side === 'KATHODOS' && !('accept_busy' in body.target)
    && JSON.stringify(body.target.new_rt) === JSON.stringify({ trip_type: 'OWNED', truck_id: 13, trailer_id: 21, driver_id: 33 }), body);
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

// 086 (owner 1/11): a busy truck is a warning with an explicit yes — «Αποθήκευση έτσι κι αλλιώς» on the refusal sends
// the SAME body with target.accept_busy = true, once; another refusal code offers nothing
async function accept_busy({ browser, origin, ok, scn }) {
  let n = 0;
  const { page, S } = await K.openApp(browser, origin, { board: board(), plan: { 'POST /plan/legs': async (req) => {
    n++;
    if (n === 1) return K.planErr(422, 'PLAN_RULE', 'no_vehicle');
    if (n === 2 || n === 3) return K.planErr(422, 'PLAN_RULE', 'truck_busy');
    return OK('plan_put_group');
  } } });
  await openWaiting(page, 4101);
  ok(scn, 'pick partner Partner Test 01', await pickIn(page, 'pt', 'Partner', 'Partner Test 01'));
  await page.fill(`${DLG} [data-rate]`, '350');
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  const btn = (p2) => p2.evaluate((s) => { const d = document.querySelector(s); const b = d && d.querySelector('.wn5-strip [data-act="accept-busy-send"]'); return b ? b.textContent : null; }, DLG);
  ok(scn, 'another refusal (no_vehicle): no «Αποθήκευση έτσι κι αλλιώς»', (await btn(page)) === null);
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  ok(scn, 'truck_busy: the strip offers «Αποθήκευση έτσι κι αλλιώς»', (await btn(page)) === 'Αποθήκευση έτσι κι αλλιώς', await btn(page));
  // an edit after the refusal takes the offer away (it would send the values of before the edit)
  await page.fill(`${DLG} [data-rate]`, '360');
  ok(scn, 'an edit of the form takes the offer away', (await btn(page)) === null);
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  ok(scn, 'the next refusal offers it again', (await btn(page)) === 'Αποθήκευση έτσι κι αλλιώς', await btn(page));
  await page.click(`${DLG} .wn5-strip [data-act="accept-busy-send"]`);
  await page.waitForTimeout(700);
  const w = saves(S);
  const b2 = w[2] && w[2].body, b3 = w[3] && w[3].body;
  ok(scn, 'four POSTs: the fourth is the third (after the edit, rate 360) plus target.accept_busy = true, nothing else changed', w.length === 4 && b3 && b3.target && b3.target.new_rt && b3.target.new_rt.partner_rate === 360 && b3 && b3.target && b3.target.accept_busy === true
    && JSON.stringify(Object.assign({}, b3, { target: Object.assign({}, b3.target, { accept_busy: undefined }) })) === JSON.stringify(Object.assign({}, b2, { target: Object.assign({}, b2.target, { accept_busy: undefined }) })), { b2, b3 });
  const open = await page.evaluate((s) => !!document.querySelector(s), DLG);
  ok(scn, 'the accepted save closes the form (a 200)', !open);
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

// 5b · 089 (P-7): a partner trip with a ΚΑΘΟΔΟΣ and an ΑΝΟΔΟΣ: two fields; the body = the whole fee + the ΑΝΟΔΟΥ part;
// an empty ΑΝΟΔΟΥ = «λείπει» (null, never 0); an ΑΝΟΔΟΥ alone asks for the ΚΑΘΟΔΟΥ; a fee with no part = «σύνολο»; a
// trip with one side keeps one field, named by its side
function partnerBoard(part) {
  const b = board();
  const seg = (c, an) => [{ segment_id: 900 + c.rt_id, label: null, from_at: c.start_at, to_at: c.end_at, trip_type: 'PARTNER', truck_id: null, truck: null,
    trailer_id: null, trailer: null, driver_id: null, driver: null, partner_id: 51, partner: 'Partner Test 01', partner_rate: c.partner_rate,
    partner_rate_anodos: an, place_note: null, reason: null, reason_note: null, has_vehicle: true, stop_ids: c.stops.map((x) => x.stop_id) }];
  for (const c of b.cycles) {
    Object.assign(c, { trip_type: 'PARTNER', truck_id: null, truck: null, trailer_id: null, trailer: null, driver_id: null, driver: null,
      partner_id: 51, partner: 'Partner Test 01', partner_rate: c.rt_id === 101 ? 700 : 500 });
    c.segments = seg(c, c.rt_id === 101 ? part : null);
  }
  return b;
}
// the Δ1 list («Μεταφορά σε…») of a piece on an own trip of Mon 12/10: the partner trip 101 is a candidate
function delta1Board(part) {
  const b = partnerBoard(part);
  const NX = { nat_order_id: 3901, reference: 'N-T901', client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', temperature_c: 4 };
  b.cycles.push({ rt_id: 103, code: 'RT-T103', trip_type: 'OWNED', truck_id: 13, truck: 'TST-2106', trailer_id: null, trailer: null,
    driver_id: 33, driver: 'Driver Test 03', partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-12T16:00:00+03:00',
    end_at: '2026-10-13T09:00:00+03:00', date_start: '2026-10-12', date_end: '2026-10-13', ended: false,
    stops: [K.stop(1201, 1, 'KATHODOS', 1, '2026-10-12T16:00:00+03:00', '2026-10-12T18:00:00+03:00', [K.leg(5901, 4901, 'load', 5, NX)]),
      K.stop(1202, 2, 'KATHODOS', 4, '2026-10-13T07:00:00+03:00', '2026-10-13T09:00:00+03:00', [K.leg(5901, 4901, 'unload', 5, NX)])] });
  return b;
}
async function rate2({ browser, origin, ok, scn, shots }) {
  const open = async (part, rt) => {
    const app = await K.openApp(browser, origin, { board: partnerBoard(part), plan: { ['PATCH /plan/rt/' + rt]: async () => OK('plan_rt_update') } });
    await app.page.evaluate((id) => WN5Act.assign(null, { entry: 'menu', rtId: id }), rt);
    await app.page.waitForSelector(DLG, { timeout: 4000 });
    return app;
  };
  const lbl = (page, px) => page.evaluate(({ s, px }) => { const f = document.querySelector(`${s} [data-f="${px}"] .wi-pop-lbl`); return f ? f.textContent : null; }, { s: DLG, px });
  // fee 700, part 300: ΚΑΘΟΔΟΥ 400, ΑΝΟΔΟΥ 300
  let { page, S } = await open(300, 101);
  let k1 = await field(page, 'rate'), a1 = await field(page, 'rate2');
  ok(scn, 'two fields «Κόμιστρο ΚΑΘΟΔΟΥ €» 400 and «Κόμιστρο ΑΝΟΔΟΥ €» 300', k1 && a1 && k1.val === '400' && a1.val === '300'
    && (await lbl(page, 'rate')) === 'Κόμιστρο ΚΑΘΟΔΟΥ €' && (await lbl(page, 'rate2')) === 'Κόμιστρο ΑΝΟΔΟΥ €', { k1, a1 });
  let f = await foot(page);
  ok(scn, 'unchanged: save off', f.off, f);
  if (shots) await page.screenshot({ path: shots + '/rate2.png' });
  await page.fill(`${DLG} [data-rate2]`, '250,5');
  f = await foot(page);
  ok(scn, 'ΑΝΟΔΟΥ 250,5: save on', !f.off, f);
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  let w = saves(S);
  ok(scn, 'PATCH /plan/rt/101 {set: PARTNER 51, partner_rate 650.5 (400 + 250.5), partner_rate_anodos 250.5}', w.length === 1
    && JSON.stringify(w[0].body) === JSON.stringify({ set: { trip_type: 'PARTNER', partner_id: 51, partner_rate: 650.5, partner_rate_anodos: 250.5 } }), w.map((x) => x.raw));
  await page.context().close();
  // ΑΝΟΔΟΥ emptied: «λείπει» beside it, never a block; the body says null (never 0)
  ({ page, S } = await open(300, 101));
  await page.fill(`${DLG} [data-rate2]`, '');
  a1 = await field(page, 'rate2');
  f = await foot(page);
  ok(scn, 'empty ΑΝΟΔΟΥ: «λείπει» beside it, nothing in «Λείπει:», save on', /λείπει/.test(a1.av) && !f.miss && !f.off, { a1, f });
  k1 = await field(page, 'rate');
  ok(scn, 'the fee the P&L reads changes and it is said before the press: «σύνολο 700 → 400 €» under ΚΑΘΟΔΟΥ, not red', k1.av === 'σύνολο 700 → 400 €' && !k1.bad, k1);
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  w = saves(S);
  ok(scn, 'body: partner_rate 400, partner_rate_anodos null', w.length === 1
    && JSON.stringify(w[0].body) === JSON.stringify({ set: { trip_type: 'PARTNER', partner_id: 51, partner_rate: 400, partner_rate_anodos: null } }), w.map((x) => x.raw));
  await page.context().close();
  // ΑΝΟΔΟΥ alone: the ΚΑΘΟΔΟΥ is asked for, the save is off (a silent 0 is never sent)
  ({ page, S } = await open(300, 101));
  await page.fill(`${DLG} [data-rate]`, '');
  await page.fill(`${DLG} [data-rate2]`, '300');
  k1 = await field(page, 'rate');
  f = await foot(page);
  ok(scn, 'ΑΝΟΔΟΥ alone: ΚΑΘΟΔΟΥ red «γράψε ποσό», «Λείπει: κόμιστρο ΚΑΘΟΔΟΥ», save off', k1.bad && /γράψε ποσό/.test(k1.av) && /κόμιστρο ΚΑΘΟΔΟΥ/.test(f.miss) && f.off, { k1, f });
  await page.context().close();
  // a fee with no part (the trip got its second side later): both empty, «σύνολο 700 €», save off until typed
  ({ page, S } = await open(null, 101));
  k1 = await field(page, 'rate'); a1 = await field(page, 'rate2');
  f = await foot(page);
  ok(scn, 'no part: both empty, «σύνολο 700 €» under ΚΑΘΟΔΟΥ, ΑΝΟΔΟΥ «λείπει», save off', k1.val === '' && a1.val === '' && /σύνολο 700 €/.test(k1.av) && /λείπει/.test(a1.av) && f.off, { k1, a1, f });
  await page.fill(`${DLG} [data-rate]`, '400');
  await page.fill(`${DLG} [data-rate2]`, '300');
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  w = saves(S);
  ok(scn, 'typed 400 + 300: partner_rate 700, partner_rate_anodos 300', w.length === 1
    && JSON.stringify(w[0].body) === JSON.stringify({ set: { trip_type: 'PARTNER', partner_id: 51, partner_rate: 700, partner_rate_anodos: 300 } }), w.map((x) => x.raw));
  const t = await dlgText(page);
  ok(scn, 'no jargon', !jargon(t).length, t);
  await page.context().close();
  // before 089 runs (the segments do not name partner_rate_anodos): one field, the body as before (never the new key)
  const pre = partnerBoard(null);
  for (const c of pre.cycles) for (const g of c.segments) delete g.partner_rate_anodos;
  ({ page, S } = await (async () => {
    const app = await K.openApp(browser, origin, { board: pre, plan: { 'PATCH /plan/rt/101': async () => OK('plan_rt_update') } });
    await app.page.evaluate(() => WN5Act.assign(null, { entry: 'menu', rtId: 101 }));
    await app.page.waitForSelector(DLG, { timeout: 4000 });
    return app;
  })());
  k1 = await field(page, 'rate');
  ok(scn, 'before 089: one field «Κόμιστρο €» (the whole fee 700, named by no side), no ΑΝΟΔΟΥ field', k1 && k1.val === '700'
    && (await lbl(page, 'rate')) === 'Κόμιστρο €' && !(await field(page, 'rate2')), k1);
  await page.fill(`${DLG} [data-rate]`, '720');
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  w = saves(S);
  ok(scn, 'before 089: {partner_rate 720}, no partner_rate_anodos key (the base would refuse it)', w.length === 1
    && JSON.stringify(w[0].body) === JSON.stringify({ set: { trip_type: 'PARTNER', partner_id: 51, partner_rate: 720 } }), w.map((x) => x.raw));
  await page.context().close();
  // the Δ1 list («Μεταφορά σε…»): the partner trip with both sides says both fees, or «κόμιστρο ΑΝΟΔΟΥ λείπει»
  for (const [part, want, flag] of [[300, 'ΚΑΘΟΔΟΥ 400 € · ΑΝΟΔΟΥ 300 €', false], [null, 'κόμιστρο 700 €', true]]) {
    const app = await K.openApp(browser, origin, { board: delta1Board(part) });
    await app.page.evaluate(() => { WN5Act.move({ piece_ids: [4901], rt_id: 103 }, {}); });
    await app.page.waitForTimeout(400);
    const row = await app.page.evaluate(() => { const b = document.querySelector('.wi4-dlg[data-wn5="move"] [data-cand="rt:101"]'); const r = b && b.closest('.wn5-cand, li, div'); return r ? r.parentElement.textContent.replace(/\s+/g, ' ') : null; });
    ok(scn, 'Δ1: ' + want + (flag ? ' + «κόμιστρο ΑΝΟΔΟΥ λείπει»' : ', no flag'), row !== null && row.includes(want) && row.includes('κόμιστρο ΑΝΟΔΟΥ λείπει') === flag, row);
    await app.page.context().close();
  }
  // one side (ΑΝΟΔΟΣ only, as the 4 live partner trips of 1/11): one field, «Κόμιστρο ΑΝΟΔΟΥ €», the fee as before
  ({ page, S } = await open(null, 102));
  k1 = await field(page, 'rate');
  ok(scn, 'ΑΝΟΔΟΣ only: one field «Κόμιστρο ΑΝΟΔΟΥ €» 500, no second field', k1 && k1.val === '500' && (await lbl(page, 'rate')) === 'Κόμιστρο ΑΝΟΔΟΥ €' && !(await field(page, 'rate2')), k1);
  await page.fill(`${DLG} [data-rate]`, '520');
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  w = saves(S);
  ok(scn, 'one side: {partner_rate 520}, no partner_rate_anodos key', w.length === 1
    && JSON.stringify(w[0].body) === JSON.stringify({ set: { trip_type: 'PARTNER', partner_id: 51, partner_rate: 520 } }), w.map((x) => x.raw));
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
  // owner 3/11 («λιγότερα»): a Veroia day after the deliveries' day is no longer a warning on the panel
  ok(scn, 'owner 3/11: a Veroia day after the deliveries\' day says nothing («θα φύγουν αργά» is gone)', !/αργά/.test(t), t);
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
  // Π2 (owner 2/11) + owner 3/11: the truck, trailer and driver of the trip it came back with the same day are said
  // BEFORE the press, amber, by name, day and places (no hours); the save stays on and sends accept_busy from the
  // first press (one POST, no refusal first)
  const foot = await page.evaluate((s) => { const m = document.querySelector(s + ' [data-miss]'); return m ? { t: m.textContent, soft: m.classList.contains('wn5-soft'), color: getComputedStyle(m).color } : null; }, DLG);
  ok(scn, 'Π2: footer «TST-2104 / θάλαμος TRL-5102 / Driver Test 01 είναι σε άλλο δρομολόγιο Τρί 13/10 · Athens → Βέροια.», amber',
    !!foot && foot.t === 'TST-2104 / θάλαμος TRL-5102 / Driver Test 01 είναι σε άλλο δρομολόγιο Τρί 13/10 · Athens → Βέροια.' && foot.soft && foot.color === 'rgb(124, 45, 18)', foot);
  const n0 = saves(S).length;
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  let x = saves(S).pop();
  ok(scn, 'POST /plan/legs: new_rt OWNED 11 / 21 / 31, every stop of Tue from 22:00', !!x && JSON.stringify(x.body.target.new_rt) === JSON.stringify({ trip_type: 'OWNED', truck_id: 11, trailer_id: 21, driver_id: 31 })
    && x.body.stops.every((s) => s.planned_from === '2026-10-13T22:00:00+03:00'), x && x.body);
  ok(scn, 'Π2: ONE POST, target.accept_busy = true from the first press', saves(S).length === n0 + 1 && !!x && x.body.target.accept_busy === true, x && x.body);
  await openWaiting(page, 4401);
  await pickIn(page, 'tk', '2104', 'TST-2104');
  await page.click(`${DLG} [data-act="opt"][data-i="0"]`);
  l = await lineOf(page);
  const tl2 = await field(page, 'tl');
  ok(scn, '«στο ίδιο φορτίο»: the line names the trip, its trailer read-only', /^TST-2104 · Δευ 12\/10|^TST-2104 · στο δρόμο από Δευ 12\/10/.test(l.txt) && tl2.dis && !/πρόταση/.test(tl2.av), { l, tl2 });
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(500);
  x = saves(S).pop();
  ok(scn, '… POST /plan/legs into rt 101, no accept_busy (its own trip is not an overlap)', !!x && x.body.target.rt_id === 101 && x.body.target.accept_busy === undefined, x && x.body);
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

// 11 · 083 «Φορτηγό αργότερα» (owner 31/10): the load is made with no vehicle — new_rt {OWNED, later: true}, one POST;
// «Με φορτηγό τώρα» gives the truck picked before back. NO-GO on #184 alone (no such choice).
async function veroia_later({ browser, origin, ok, scn, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: hubBoard(), plan: { 'POST /plan/legs': async () => OK('plan_put_pieces', { rt_id: 903 }) } });
  await page.click('#wn5-hub [data-hub="open"]');
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4201"] .wn5-hub-ck');
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4202"] .wn5-hub-ck');
  const has = await K.count(page, '#wn5-hub [data-act="nf-later"]');
  ok(scn, '«Με φορτηγό τώρα | Φορτηγό αργότερα» under ΦΟΡΤΗΓΟ', has === 1);
  if (!has) { await page.context().close(); return; }
  await page.click('#wn5-hub .wn5-nf-pick');
  await page.waitForSelector(DLG, { timeout: 4000 });
  await pickIn(page, 'tk', '2106', 'TST-2106');
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(150);
  await page.click('#wn5-hub [data-act="nf-now"]');   // the option already chosen: nothing changes
  ok(scn, 'a press on «Με φορτηγό τώρα» while it is chosen keeps the truck', /TST-2106/.test(await nfText(page)));
  await page.click('#wn5-hub [data-act="nf-later"]');
  let t = await nfText(page);
  ok(scn, '«Φορτηγό αργότερα»: no truck line, «Δημιουργία φορτίου · 22π» on, no «Λείπει»', !/TST-2106/.test(t) && /Δημιουργία φορτίου · 22π$/.test(t)
    && !(await page.isDisabled('#wn5-hub [data-act="nf-create"]')) && !/Λείπει/.test(t), t);
  if (shots) await page.screenshot({ path: shots + '/veroia-later.png' });
  await page.click('#wn5-hub [data-act="nf-now"]');
  t = await nfText(page);
  ok(scn, '«Με φορτηγό τώρα» brings TST-2106 back', /TST-2106/.test(t), t);
  await page.click('#wn5-hub [data-act="nf-later"]');
  await page.click('#wn5-hub [data-act="nf-create"]');
  await page.waitForTimeout(600);
  const w = saves(S);
  const body = w[0] && w[0].body;
  ok(scn, 'ONE POST /plan/legs: {pieces 4201, 4202, target {new_rt {OWNED, later: true}, side KATHODOS}} — no vehicle key at all',
    w.length === 1 && JSON.stringify(body.pieces) === '[{"piece_id":4201},{"piece_id":4202}]' && JSON.stringify(body.target) === '{"new_rt":{"trip_type":"OWNED","later":true},"side":"KATHODOS"}', w.map((x) => x.raw));
  ok(scn, 'stops: Veroia on the panel\'s day, whole day; the two deliveries on their day', !!body && body.stops.length === 3 && body.stops.every((s) => s.location_id && s.planned_from && s.planned_to), body && body.stops);
  await page.context().close();
}

// 11 · third PR, group B (owner via coordinator 1/11). One Veroia default: an ΑΝΟΔΟΣ national to Veroia whose arrival
// the order form wrote as «ως 23:59» (23:59 = 23:59, as it did until 1/11) opens «Ανάθεση» on «όλη η ημέρα», never the
// hours «23:59–23:59» (plain c533d04e: the hours). B-27 (Figma audit 28/10): the Veroia board's «ΑΠΟΘΕΜΑ · n · π» with
// stock in the data — verified here, its code is modules/wn5_veroia.js (pack 4), not changed.
async function pr3b({ browser, origin, ok, scn }) {
  const b = hubBoard();
  b.waiting.push({ piece_id: 4401, shipment_id: 5501, kind: 'national', order_id: null, nat_order_id: 3401, order_stop_id: null, pallets: 6, leave_by: null,
    position_location_id: 4, nat_from_location_id: 4, nat_to_location_id: 1, nat_ready_day: '2026-10-14', nat_due_day: '2026-10-14', overdue: false,
    is_stock: false, client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', reference: 'N-T401', temperature_c: 4, pallet_exchange: false, direction: 'ANODOS',
    load_from: '2026-10-14T05:00:00+00:00', load_to: '2026-10-14T07:00:00+00:00', deliver_from: '2026-10-14T20:59:00+00:00', deliver_to: '2026-10-14T20:59:00+00:00', price: null });
  b.hub.push(Object.assign({}, VS_BASE, { piece_id: 4204, shipment_id: 5304, order_id: 2203, reference: 'VS-T203', pallets: 13, is_stock: true,
    nat_to_location_id: null, nat_ready_day: '2026-10-12', nat_due_day: null }));
  const { page, S } = await K.openApp(browser, origin, { board: b });
  await openWaiting(page, 4401).catch(() => {});
  const row = await page.evaluate((s) => { const r = document.querySelector(`${s} .wn5a-win[data-row="hub"]`); if (!r) return null;
    const hm = [...r.querySelectorAll('input')].map((i) => i.value), on = r.querySelector('.wn5a-all.on');
    return { label: r.querySelector('.wn5a-wl').textContent, hm, on: on ? on.textContent : null }; }, DLG);
  ok(scn, 'one default · ΑΝΟΔΟΣ N-T401 → Veroia «ως 23:59»: «Άφιξη · Βέροια» opens on «όλη η ημέρα», no «23:59–23:59» — main: the hours 23:59|23:59',
    !!row && row.on === 'όλη η ημέρα' && !row.hm.length, row);
  await page.keyboard.press('Escape');
  await page.click('#wn5-hub [data-hub="open"]').catch(() => {});
  const gh = await page.evaluate(() => [...document.querySelectorAll('#wn5-hub .wn5-hub-l > .wn5-hub-gh')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  const st = await page.evaluate(() => { const h = [...document.querySelectorAll('#wn5-hub .wn5-hub-l > .wn5-hub-gh')].pop(); const n = h && h.nextElementSibling; return n ? n.dataset.piece || null : null; });
  ok(scn, 'B-27 · stock in the data: the Veroia board shows «ΑΠΟΘΕΜΑ · 1 · 13π» after the day groups, with its row (verified, not changed)',
    gh.length > 1 && gh[gh.length - 1] === 'ΑΠΟΘΕΜΑ · 1 · 13π' && st === '4204', { gh, st });
  ok(scn, 'nothing written', !saves(S).length, saves(S).map((x) => x.path));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 12 · Π2 (owner 2/11) + owner 3/11: the Veroia board's «Νέο φορτίο» with a driver already on a trip the same day
// (Driver Test 01 on TST-2104's RT-T101, Mon 16:00 → Tue 22:00; the new load runs Tue): said in amber beside
// «Δημιουργία φορτίου» before the press, by name, day and places (no RT code, no hours, never Monday: the row's day is
// not the trip's), and ONE POST carries target.accept_busy — the panel is the one that saves
async function veroia_busy({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: hubBoard(), plan: { 'POST /plan/legs': async () => OK('plan_put_pieces', { rt_id: 903 }) } });
  await page.click('#wn5-hub [data-hub="open"]');
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4201"] .wn5-hub-ck');
  await page.click('#wn5-hub .wn5-nf-pick');
  await page.waitForSelector(DLG, { timeout: 4000 });
  await pickIn(page, 'tk', '2106', 'TST-2106');
  await pickIn(page, 'tl', '5104', 'TRL-5104');
  await pickIn(page, 'dr', 'Test 01', 'Driver Test 01');
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(200);
  ok(scn, '«Επιλογή» wrote nothing', !saves(S).length, saves(S).map((x) => x.path));
  const why = await page.evaluate(() => { const m = document.querySelector('#wn5-hub [data-nfwhy]'); return m ? { t: m.textContent, soft: m.classList.contains('wn5-soft'), color: getComputedStyle(m).color } : null; });
  const T = 'Driver Test 01 είναι σε άλλο δρομολόγιο Τρί 13/10 · Athens → Βέροια.';
  ok(scn, 'the panel says «' + T + '» in amber beside the save, no RT code, «Δημιουργία φορτίου» on',
    !!why && why.t === T && why.soft && why.color === 'rgb(124, 45, 18)' && !jargon(why.t).length && !(await page.isDisabled('#wn5-hub [data-act="nf-create"]')), why);
  await page.click('#wn5-hub [data-act="nf-create"]');
  await page.waitForTimeout(600);
  const w = saves(S);
  ok(scn, 'ONE POST /plan/legs, target new_rt OWNED 13 / 22 / 31 + accept_busy: true (no refusal first)', w.length === 1 && w[0].path === '/plan/legs' && !!w[0].body
    && JSON.stringify(w[0].body.target) === JSON.stringify({ new_rt: { trip_type: 'OWNED', truck_id: 13, trailer_id: 22, driver_id: 31 }, side: 'KATHODOS', accept_busy: true }), w.map((x) => x.raw));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 13 · the Veroia board bugs of the usability test (docs/national-v5/usability-test-2026-11-02.md §3, items 1–4):
// «Σπάσε…» on the load's own day (not the panel's first), the day beside the hours, «κανένα φορτηγό» said; the list
// keeps its place on a tick; the hour fields of «Νέο φορτίο» keep the focus and a press right after typing is not
// eaten; «Λείπει» says a word once and marks the empty fields; a disabled «Δημιουργία φορτίου» does not look navy.
// The week: hubBoard without the late VS-T202 (the panel's first day is then Mon 12/10, RT-T101's Veroia day) + a VS
// ready Wed 14/10 (VS-T204) and RT-T103, which loads at Veroia on Wed 14/10 + 14 more VS rows (the list scrolls).
function fixBoard() {
  const b = hubBoard();
  b.hub = b.hub.filter((h) => h.piece_id !== 4203);
  b.hub.push(Object.assign({}, VS_BASE, { piece_id: 4204, shipment_id: 5304, order_id: 2204, reference: 'VS-T204', pallets: 20, nat_to_location_id: 4,
    nat_ready_day: '2026-10-14', nat_due_day: '2026-10-15', for_split: true }));
  for (let i = 0; i < 14; i++) b.hub.push(Object.assign({}, VS_BASE, { piece_id: 4210 + i, shipment_id: 5310 + i, order_id: 2210 + i, reference: 'VS-T2' + (10 + i),
    pallets: 2, nat_to_location_id: 2 + (i % 4), nat_ready_day: '2026-10-15', nat_due_day: '2026-10-16', for_split: true }));
  b.cycles.push({ rt_id: 103, code: 'RT-T103', trip_type: 'OWNED', truck_id: 13, truck: 'TST-2106', trailer_id: 22, trailer: 'TRL-5104', driver_id: 33, driver: 'Driver Test 03',
    partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-14T16:00:00+03:00', end_at: '2026-10-15T09:00:00+03:00',
    date_start: '2026-10-14', date_end: '2026-10-15', ended: false,
    stops: [K.stop(1201, 1, 'KATHODOS', 1, '2026-10-14T16:00:00+03:00', '2026-10-14T18:00:00+03:00', []),
      K.stop(1202, 2, 'KATHODOS', 4, '2026-10-15T07:00:00+03:00', '2026-10-15T09:00:00+03:00', [])] });
  return b;
}
async function veroia_fixes({ browser, origin, ok, scn, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: fixBoard() });
  await page.click('#wn5-hub [data-hub="open"]');
  const SP = '.wn5-dlg[data-wn5="split"]';
  const opts = () => page.$$eval(`${SP} select[data-part-target][data-i="0"] option`, (os) => os.map((o) => o.textContent)).catch(() => []);
  // 1 · VS-T204 loads at Veroia Wed 14/10: RT-T103 of that day, its day beside its hours — never RT-T101 of Mon 12/10
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4204"] [data-hub="more"]');
  await page.click('.wn5-hub-pop [data-v="split"]');
  await page.waitForSelector(SP, { timeout: 3000 }).catch(() => {});
  let o = await opts();
  ok(scn, '1 · «Σπάσε…» of a load of Wed 14/10 offers the truck of Wed 14/10 with its day «TST-2106 · Βέροια Τετ 14/10 16:00–18:00», not Mon\'s TST-2104',
    JSON.stringify(o) === JSON.stringify(['— διάλεξε —', 'μένει στη Βέροια', 'TST-2106 · Βέροια Τετ 14/10 16:00–18:00']), o);
  if (shots) await page.screenshot({ path: shots + '/fix-split-own-day.png' });
  await page.click(`${SP} [data-act="cancel"]`).catch(() => {});
  await page.waitForTimeout(150);
  // a load of Thu 15/10: no truck loads at Veroia that day → said, never an empty list
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4210"] [data-hub="more"]');
  await page.click('.wn5-hub-pop [data-v="split"]');
  await page.waitForSelector(SP, { timeout: 3000 }).catch(() => {});
  o = await opts();
  const none = await page.$eval(`${SP} .wn5-split-none`, (e) => e.textContent).catch(() => null);
  ok(scn, '1 · a load of Thu 15/10, when no truck loads at Veroia: «Κανένα φορτηγό δεν φορτώνει στη Βέροια Πέμ 15/10», only «μένει στη Βέροια»',
    JSON.stringify(o) === JSON.stringify(['— διάλεξε —', 'μένει στη Βέροια']) && none === 'Κανένα φορτηγό δεν φορτώνει στη Βέροια Πέμ 15/10', { o, none });
  await page.click(`${SP} [data-act="cancel"]`).catch(() => {});
  await page.waitForTimeout(150);
  // 2 · a tick keeps the list where it was (16 rows: the list scrolls inside)
  const sc = await page.evaluate(() => {
    const l = document.querySelector('#wn5-hub .wn5-hub-l');
    l.scrollTop = 300;
    const before = l.scrollTop;
    document.querySelector('#wn5-hub .wn5-hub-it[data-piece="4220"] .wn5-hub-ck').click();
    const n = document.querySelector('#wn5-hub .wn5-hub-l');
    return { before, after: n.scrollTop, ticked: !!document.querySelector('#wn5-hub .wn5-hub-it[data-piece="4220"] .wn5-hub-ck:checked'), max: n.scrollHeight - n.clientHeight };
  });
  ok(scn, '2 · a tick deep in the list keeps its place (scrollTop 300 → 300), the row ticked', sc.before === 300 && sc.after === 300 && sc.ticked, sc);
  // 4 · a disabled «Δημιουργία φορτίου» is grey, never the navy of a button that works
  const look = await page.evaluate(() => {
    const b = document.querySelector('#wn5-hub [data-act="nf-create"]');
    const probe = document.createElement('span'); probe.style.color = 'var(--wi4-ink)'; document.body.appendChild(probe);
    const navy = getComputedStyle(probe).color; probe.remove();
    return b ? { off: b.disabled, bg: getComputedStyle(b).backgroundColor, navy } : null;
  });
  ok(scn, '4 · a disabled «Δημιουργία φορτίου» is not navy', !!look && look.off && look.bg !== look.navy, look);
  // pick a truck (the form writes nothing), then «ώρες…» with empty fields
  await page.evaluate(() => document.querySelector('#wn5-hub .wn5-hub-it[data-piece="4220"] .wn5-hub-ck').click());   // untick 4220
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4201"] .wn5-hub-ck');
  await page.click('#wn5-hub .wn5-nf-pick');
  await page.waitForSelector(DLG, { timeout: 4000 });
  await pickIn(page, 'tk', '2108', 'TST-2108');
  await pickIn(page, 'tl', '5104', 'TRL-5104');
  await pickIn(page, 'dr', 'Test 02', 'Driver Test 02');
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(150);
  await page.click('#wn5-hub .wn5-nf .wn5a-hrs');
  const miss = await page.evaluate(() => ({ why: (document.querySelector('#wn5-hub [data-nfwhy]') || {}).textContent,
    bad: [...document.querySelectorAll('#wn5-hub [data-nfhm]')].map((i) => i.classList.contains('bad')) }));
  ok(scn, '3 · «Λείπει: παράθυρο Βέροιας» once, both empty hour fields marked', miss.why === 'Λείπει: παράθυρο Βέροιας' && JSON.stringify(miss.bad) === '[true,true]', miss);
  // 2 · the hour fields keep the focus: type, Tab, type — never a redraw under the caret
  await page.focus('#wn5-hub [data-nfhm="from"]');
  await page.keyboard.type('1600');
  await page.keyboard.press('Tab');
  const foc = await page.evaluate(() => { const a = document.activeElement; return a && a.dataset ? a.dataset.nfhm || a.tagName : null; });
  await page.keyboard.type('1800');
  const vals = await page.evaluate(() => [...document.querySelectorAll('#wn5-hub [data-nfhm]')].map((i) => i.value + (i.classList.contains('bad') ? '!' : '')));
  ok(scn, '2 · «ώρες»: 1600, Tab, 1800 typed without a click → the focus moves to «έως», both values kept, «από» normalised and unmarked',
    foc === 'to' && JSON.stringify(vals) === JSON.stringify(['16:00', '1800']), { foc, vals });
  // a press on «Αλλαγή ▾» right after typing (no Tab) is not eaten: the assignment form opens
  await page.click('#wn5-hub .wn5-nf-ch');
  const opened = await page.waitForSelector(DLG, { timeout: 2000 }).then(() => true, () => false);
  ok(scn, '2 · a press on «Αλλαγή ▾» right after typing «έως» opens the form (the press is not eaten)', opened);
  if (opened) await page.click(`${DLG} [data-act="save"]`).catch(() => {});
  await page.waitForTimeout(150);
  const fin = await page.evaluate(() => ({ why: (document.querySelector('#wn5-hub [data-nfwhy]') || {}).textContent,
    off: (document.querySelector('#wn5-hub [data-act="nf-create"]') || {}).disabled, vals: [...document.querySelectorAll('#wn5-hub [data-nfhm]')].map((i) => i.value) }));
  ok(scn, '2 · the window 16:00–18:00 stays and «Δημιουργία φορτίου» is on', JSON.stringify(fin.vals) === '["16:00","18:00"]' && fin.off === false, fin);
  if (shots) await page.screenshot({ path: shots + '/fix-new-load.png' });
  ok(scn, 'nothing written', !saves(S).length, saves(S).map((x) => x.path));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// 15 · owner 3/11 («λιγότερα»): the ONE warning of the form — the driver, the truck or the trailer («θάλαμος») on another
// trip the SAME calendar day, by name, day and places, amber beside the save, which stays on and sends accept_busy
// from the first press. A trip of another day says nothing and sends nothing. The kit week: RT-T102 = TST-2108 /
// TRL-5104 / Driver Test 02 on Wed 14/10 (Athens → Βέροια); RT-T101 = TST-2104 / TRL-5102 / Driver Test 01 Mon–Tue.
// N-T101 (4101) loads Wed 14/10; N-T401 (4401, added here) loads Tue 13/10.
async function busy3({ browser, origin, ok, scn }) {
  const AMBER = 'rgb(124, 45, 18)';
  const tue = () => { const b = board(); b.waiting.push({ piece_id: 4401, shipment_id: 5501, kind: 'national', order_id: null, nat_order_id: 3401, order_stop_id: null, pallets: 6, leave_by: null,
    position_location_id: 2, nat_from_location_id: 2, nat_to_location_id: 4, nat_ready_day: '2026-10-13', nat_due_day: '2026-10-13', overdue: false,
    is_stock: false, client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', reference: 'N-T401', temperature_c: 4, pallet_exchange: false, direction: 'KATHODOS',
    load_from: null, load_to: null, deliver_from: null, deliver_to: null, price: null }); return b; };
  const footOf = (page) => page.evaluate((s) => { const m = document.querySelector(s + ' [data-miss]'); return m ? { t: m.textContent, soft: m.classList.contains('wn5-soft'), color: getComputedStyle(m).color } : null; }, DLG);
  const plain = (t) => !/\d\d:\d\d|RT-|κύκλ|Επικάλυψη/.test(String(t || ''));
  async function one(piece, picks, o) {
    const { page, S } = await K.openApp(browser, origin, { board: o && o.board || board(), plan: { 'POST /plan/legs': async () => OK('plan_put_group', { rt_id: 905 }) } });
    await openWaiting(page, piece);
    await pickIn(page, 'tk', picks[0], picks[0].length === 4 ? 'TST-' + picks[0] : picks[0]);
    if (o && o.opt) { await page.click(`${DLG} [data-act="opt"]:has-text("${o.opt}")`).catch(() => {}); await page.waitForTimeout(100); }
    await pickIn(page, 'tl', picks[1], 'TRL-' + picks[1]);
    await pickIn(page, 'dr', picks[2], 'Driver ' + picks[2]);
    const f = await footOf(page), tl = await field(page, 'tl'), dr = await field(page, 'dr'), tk = await field(page, 'tk');
    const off = await page.isDisabled(`${DLG} [data-act="save"]`);
    await page.click(`${DLG} [data-act="save"]`).catch(() => {});
    await page.waitForTimeout(500);
    const w = saves(S);
    await page.context().close();
    return { f, off, w, av: { tk: tk && tk.av, tl: tl && tl.av, dr: dr && dr.av }, errs: S.pageErrors };
  }
  let r = await one(4101, ['2106', '5104', 'Test 03']);
  const TL = 'θάλαμος TRL-5104 είναι σε άλλο δρομολόγιο Τετ 14/10 · Athens → Βέροια.';
  ok(scn, 'trailer the same day: «' + TL + '» amber beside the save, the save on', !!r.f && r.f.t === TL && r.f.soft && r.f.color === AMBER && !r.off && plain(r.f.t), r.f);
  ok(scn, 'trailer the same day: under the field «άλλο δρομολόγιο · Athens → Βέροια» (no hours)', /^άλλο δρομολόγιο · Athens → Βέροια/.test(r.av.tl || ''), r.av);
  ok(scn, 'trailer the same day: ONE POST /plan/legs, target.accept_busy = true from the first press', r.w.length === 1 && r.w[0].body.target.accept_busy === true, r.w.map((x) => x.raw));
  r = await one(4101, ['2106', '5102', 'Test 02']);
  const DR = 'Driver Test 02 είναι σε άλλο δρομολόγιο Τετ 14/10 · Athens → Βέροια.';
  ok(scn, 'driver the same day: «' + DR + '» amber, the save on, ONE POST with accept_busy', !!r.f && r.f.t === DR && r.f.soft && !r.off && plain(r.f.t)
    && r.w.length === 1 && r.w[0].body.target.accept_busy === true, { f: r.f, w: r.w.map((x) => x.raw) });
  r = await one(4101, ['2108', '5102', 'Test 03'], { opt: 'νέο φορτίο' });
  const TK = 'TST-2108 είναι σε άλλο δρομολόγιο Τετ 14/10 · Athens → Βέροια.';
  ok(scn, 'truck the same day (a new load, not its trip): «' + TK + '» amber, ONE POST new_rt 12 with accept_busy', !!r.f && r.f.t === TK && r.f.soft && !r.off
    && r.w.length === 1 && !!r.w[0].body.target.new_rt && r.w[0].body.target.new_rt.truck_id === 12 && r.w[0].body.target.accept_busy === true, { f: r.f, w: r.w.map((x) => x.raw) });
  r = await one(4401, ['2106', '5104', 'Test 02'], { board: tue() });
  ok(scn, 'busy only the NEXT day (TRL-5104 / Driver Test 02 on Wed, the load Tue): nothing said, «✓», one POST without accept_busy',
    !!r.f && !r.f.t && !r.f.soft && !r.off && /✓/.test(r.av.tl || '') && /✓/.test(r.av.dr || '') && r.w.length === 1 && !('accept_busy' in r.w[0].body.target), { f: r.f, av: r.av, w: r.w.map((x) => x.raw) });
  r = await one(4101, ['2106', '5102', 'Test 01']);
  ok(scn, 'busy only the day BEFORE (TRL-5102 / Driver Test 01 Mon–Tue, the load Wed): nothing said, no «Χ+2», one POST without accept_busy',
    !!r.f && !r.f.t && !/Χ\+2/.test(r.av.dr || '') && r.w.length === 1 && !('accept_busy' in r.w[0].body.target), { f: r.f, av: r.av });
  ok(scn, 'no page errors', !r.errs.length, r.errs);
}

// 16 · owner 3/11 (bigger forms): at a laptop height (1440×900, 1280×800) the form opens whole — inside the window,
// nothing scrolls inside it — with its longest content: a VS of two deliveries (three day rows) and a same-day trailer
// line beside the save; the Veroia board's «Νέο φορτίο» picks its truck in the same form. --shots: the screenshots.
async function fit({ browser, origin, ok, scn, shots }) {
  for (const vp of K.FIT_VIEWPORTS) {
    const tag = vp.width + 'x' + vp.height;
    {
      const { page } = await K.openApp(browser, origin, { board: board(), viewport: vp });
      await openWaiting(page, 4201);
      await pickIn(page, 'tk', '2106', 'TST-2106');
      await pickIn(page, 'tl', '5104', 'TRL-5104');
      await pickIn(page, 'dr', 'Test 03', 'Driver Test 03');
      await page.waitForTimeout(150);
      const f = await K.fitOf(page, DLG);
      ok(scn, tag + ' «Ανάθεση»: inside the window, nothing scrolls in it', K.fits(f), f);
      ok(scn, tag + ' «Ανάθεση»: wider than the 600px of before', !!f && f.w > 600, f);
      if (shots) await page.screenshot({ path: shots + '/assign-' + tag + '.png' });
      await page.context().close();
    }
    {
      const { page } = await K.openApp(browser, origin, { board: hubBoard(), viewport: vp });
      await page.click('#wn5-hub [data-hub="open"]');
      await page.click('#wn5-hub .wn5-hub-it[data-piece="4201"] .wn5-hub-ck');
      await page.click('#wn5-hub .wn5-hub-it[data-piece="4202"] .wn5-hub-ck');
      await page.click('#wn5-hub .wn5-nf-pick');
      await page.waitForSelector(DLG, { timeout: 4000 });
      await pickIn(page, 'tk', '2106', 'TST-2106');
      await pickIn(page, 'tl', '5104', 'TRL-5104');
      await pickIn(page, 'dr', 'Test 01', 'Driver Test 01');
      await page.waitForTimeout(150);
      const f = await K.fitOf(page, DLG);
      ok(scn, tag + ' «Νέο φορτίο» → the truck form: inside the window, nothing scrolls in it', K.fits(f), f);
      if (shots) await page.screenshot({ path: shots + '/veroia-pick-' + tag + '.png' });
      await page.click(`${DLG} [data-act="save"]`);
      await page.waitForTimeout(200);
      if (shots) await page.screenshot({ path: shots + '/veroia-panel-' + tag + '.png' });
      await page.context().close();
    }
  }
}

// Sotiris report 8/11, item 1: a VS piece left at Veroia past its delivery day (4203: due Mon 12/10, overdue) goes on a
// new load of today Tue 13/10. Before: its delivery was sent on 12/10, before the Veroia pickup of 13/10, and the base
// refused it (093 stop_order). Now its delivery goes on the pickup day; the international is not touched.
async function sotiris_late({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: hubBoard(), plan: { 'POST /plan/legs': async () => OK('plan_put_pieces', { rt_id: 903 }) } });
  await page.click('#wn5-hub [data-hub="open"]');
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4203"] .wn5-hub-ck');
  ok(scn, 'the Veroia day is today Tue 13/10 (a late row leaves today at the earliest)', (await page.evaluate(() => document.querySelector('#wn5-hub .wn5-nf-day').value)) === '2026-10-13');
  await page.click('#wn5-hub .wn5-nf-pick');
  await page.waitForSelector(DLG, { timeout: 4000 });
  await pickIn(page, 'tk', '2106', 'TST-2106');
  await pickIn(page, 'tl', '5104', 'TRL-5104');
  await pickIn(page, 'dr', 'Test 03', 'Driver Test 03');
  const f0 = await dlgText(page);
  ok(scn, 'the form (header and delivery row) says the day it sends: Τρί 13/10, never the passed Δευ 12/10', /Παράδοση · [^·]+ · Τρί 13\/10/.test(f0) && !/Δευ 12\/10/.test(f0), f0);
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(150);
  await page.click('#wn5-hub [data-act="nf-create"]');
  await page.waitForTimeout(600);
  const w = saves(S);
  const st = (w[0] && w[0].body && w[0].body.stops) || [];
  const drop = st.find((x) => x.location_id === 2) || {};
  const hub = st.find((x) => x.location_id === 1) || {};
  ok(scn, 'ONE write; the Veroia pickup Tue 13/10 and the delivery Tue 13/10 whole day (not Mon 12/10)', w.length === 1 && /^2026-10-13/.test(hub.planned_from || '')
    && drop.planned_from === '2026-10-13T00:00:00+03:00' && drop.planned_to === '2026-10-13T23:59:00+03:00', st);
  ok(scn, 'no key the base does not know on a stop (late_from stays on the screen)', st.every((x) => Object.keys(x).every((k) => ['ref', 'stop_id', 'location_id', 'side', 'planned_from', 'planned_to'].includes(k))), st);
  ok(scn, 'nothing written to the international (no orders / order_stops request)', !S.plan.some((x) => /orders|order_stops/.test(x.path)), S.plan.map((x) => x.path));
  await page.context().close();
}

// Sotiris report 8/11, items 4 / 5 / 7: an own truck on an INTERNATIONAL trip those days (109 intl_trips) is not
// «ελεύθερο»; a save without a driver is said in amber; the board takes no click while it is re-read after the save.
async function sotiris_warn({ browser, origin, ok, scn }) {
  // two international trips of the same truck overlapping on Thu 15/10 (live 8/11, IAZ8302): ONE sentence, days joined
  const b = board({ intl_trips: [{ rt_id: 9001, truck_id: 13, truck: 'TST-2106', date_start: '2026-10-14', date_end: '2026-10-15' },
    { rt_id: 9002, truck_id: 13, truck: 'TST-2106', date_start: '2026-10-15', date_end: '2026-10-16' }] });
  let n = 0;
  const { page, S } = await K.openApp(browser, origin, { board: b, plan: {
    'POST /plan/legs': async () => OK('plan_put_group', { rt_id: 901 }),
    'GET /plan/board': async () => { n += 1; if (n > 1) await K.sleep(1200); return [200, b]; } } });
  await openWaiting(page, 4101);
  ok(scn, 'pick truck TST-2106 (on an international trip Wed–Fri)', await pickIn(page, 'tk', '2106', 'TST-2106'));
  const tk = await field(page, 'tk');
  ok(scn, 'item 4: the truck is «άλλο δρομολόγιο · διεθνές», never «✓ ελεύθερο»', /άλλο δρομολόγιο · διεθνές/.test(tk.av) && !/ελεύθερο/.test(tk.av), tk);
  const ln = await lineOf(page);
  ok(scn, 'item 4 (screenshot 8/11): the line under the fields says the same, never «TST-2106 · ελεύθερο»', !!ln && /TST-2106 · άλλο δρομολόγιο · διεθνές/.test(ln.txt), ln);
  await pickIn(page, 'tl', '5102', 'TRL-5102');
  let f = await foot(page);
  ok(scn, 'items 4 + 5: amber beside the save — the international trip by name and «χωρίς οδηγό» — the save stays on', !f.off && /TST-2106 είναι σε άλλο δρομολόγιο/.test(f.miss) && /διεθνές/.test(f.miss) && /[Χχ]ωρίς οδηγό/.test(f.miss) && !/\. ·/.test(f.miss) && (f.miss.match(/είναι σε άλλο δρομολόγιο/g) || []).length === 1, f);
  await pickIn(page, 'dr', 'Test 03', 'Driver Test 03');
  f = await foot(page);
  ok(scn, 'item 5: a driver picked — «χωρίς οδηγό» gone', !/[Χχ]ωρίς οδηγό/.test(f.miss), f);
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForTimeout(400);
  const busy = await page.evaluate(() => { const c = document.getElementById('content'); const r = document.querySelector('#content .wn5-row'); return { cls: c.classList.contains('wn5-reloading'), aria: c.getAttribute('aria-busy'), pe: r ? getComputedStyle(document.querySelector('#content > .wn5')).pointerEvents : null }; });
  ok(scn, 'item 7: while the board is re-read the old rows take no click (#content.wn5-reloading, aria-busy, pointer-events none)', busy.cls && busy.aria === 'true' && busy.pe === 'none', busy);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => document.getElementById('content').classList.contains('wn5-reloading'));
  ok(scn, 'item 7: the mark leaves once the re-read lands', !after && n >= 2, { after, reads: n });
  await page.context().close();
}

// Sotiris report 8/11, item 8 on the board's dialogs: Esc over typed work asks once, the second Esc closes; untouched
// = closes at once; nothing is written either way.
async function sotiris_esc({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: board() });
  await openWaiting(page, 4101);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  ok(scn, 'an untouched assignment form closes at the first Esc', !(await K.count(page, DLG)));
  await openWaiting(page, 4101);
  await pickIn(page, 'tk', '2106', 'TST-2106');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const ask = await page.evaluate((s) => { const a = document.querySelector(s + ' > .wn5-dlg-ask'); return a ? a.textContent : null; }, DLG);
  ok(scn, 'typed: the first Esc keeps the form and says «Δεν αποθηκεύτηκε…»', (await K.count(page, DLG)) === 1 && /Δεν αποθηκεύτηκε/.test(ask || ''), ask);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  ok(scn, 'the second Esc closes it, nothing written', !(await K.count(page, DLG)) && !saves(S).length, saves(S).map((x) => x.path));
  await page.context().close();
}

// screenshot 8/11 (item 6 on the Veroia board): TST-2104 is back at Veroia Tue 22:00, so a new load of Tue starts there —
// the form's «Φόρτωση · Βέροια» row says «από 22:00» (what req sends), never «όλη η ημέρα»
async function sotiris_hub_after({ browser, origin, ok, scn }) {
  const { page } = await K.openApp(browser, origin, { board: hubBoard() });
  await page.click('#wn5-hub [data-hub="open"]');
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4203"] .wn5-hub-ck');
  await page.click('#wn5-hub .wn5-nf-pick');
  await page.waitForSelector(DLG, { timeout: 4000 });
  await pickIn(page, 'tk', '2104', 'TST-2104');
  const t = await dlgText(page);
  ok(scn, 'the Veroia row of a new load after the 22:00 return reads «από 22:00»', /Φόρτωση · Βέροια · Τρί 13\/10 ?από 22:00/.test(t) && /ελεύθερο από 22:00/.test(t), t);
  await page.context().close();
}

K.run({ scenarios: { own_new, own_join, only_hours, partner, accept_busy, vehicle, rate2, handover, veroia_list, veroia_new, f61, f54, veroia_later, pr3b, veroia_busy, veroia_fixes, busy3, fit, sotiris_late, sotiris_warn, sotiris_esc, sotiris_hub_after }, globals: ['WN5', 'WN5Act', 'WN5Assign', 'WN5Hand'],
  go: 'the assignment form (own new / join / only / hours / F39 / partner / vehicle / F51-F61 / F54 / F56 / 089 two fees), ✈ «Αλλαγή οχήματος…» and the Veroia board v2 «Νέο φορτίο» hold' });
