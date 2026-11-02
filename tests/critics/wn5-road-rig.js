// Rig — National v5 «Αλλαγή στον δρόμο» (owner 2/11, transfer piece 5; modules/wn5_road.js behind FEATURES.WN_ROAD).
// Same kit, same synthetic week as the forms / handover rigs (tests/critics/wn5-rig-kit.js). POST /plan/transfer answers
// as the Worker of PR #239 does: the dry run's preview served as is ({trucks, vs_day, waiting, whole_vehicle, warnings,
// conflict}), a preview conflict carrying the Worker's message (here the kit's SENTINEL), a refusal as 422 PLAN_RULE,
// the save as plan_h_ok ({ok, op, dry_run:false, ids, warnings, notice_ids}). Every /plan request is in S.plan: the
// table of this rig. Synthetic data only (public repo).
// Usage: node tests/critics/wn5-road-rig.js [scenarios …] [--shots <dir>]   ·   WN5_TREE=<plain main> … → NO-GO
'use strict';
const K = require('./wn5-rig-kit.js');

const ROW = (rt) => `#content .wn5-row[data-rt="${rt}"]`;
const DLG = '.wn5f.wn5r';
const TP = { id: 9, legacy_id: 'v5_transfer_point', name: 'TRANSFER POINT (free text)', address: null, city: null, phone: null };
const LAM = { id: 6, legacy_id: 'recWn5LocLam', name: 'LAMIA TEST', address: 'Test Street 6, 35100', city: 'Lamia', phone: 'TEST-PHONE-06' };
function lookups() { const l = K.clone(K.LOOKUPS); l.locations.push(LAM, TP); return l; }
// the facade's LOCATIONS read (the app's pickers) carries the same place, under its legacy id
if (!K.FACADE_LOCS.some((r) => r.id === TP.legacy_id)) K.FACADE_LOCS.push({ id: TP.legacy_id, fields: { Name: TP.name, Country: 'GR' } });
// busy: TST-2106 (truck 13) has a short trip the same Tuesday morning, which ends before the transfer
function busyWeek() {
  const b = K.week();
  b.cycles.push({ rt_id: 103, code: 'RT-T103', trip_type: 'OWNED', truck_id: 13, truck: 'TST-2106', trailer_id: null, trailer: null, driver_id: 33, driver: 'Driver Test 03',
    partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-13T08:00:00+03:00', end_at: '2026-10-13T12:00:00+03:00',
    date_start: '2026-10-13', date_end: '2026-10-13', ended: false,
    stops: [K.stop(1301, 1, 'ANODOS', 2, '2026-10-13T08:00:00+03:00', '2026-10-13T09:00:00+03:00', [K.leg(5301, 4301, 'load', 5, { nat_order_id: 3301, reference: 'N-T301' })]),
      K.stop(1302, 2, 'ANODOS', 1, '2026-10-13T11:00:00+03:00', '2026-10-13T12:00:00+03:00', [K.leg(5301, 4301, 'unload', 5, { nat_order_id: 3301, reference: 'N-T301' })])] });
  return b;
}
// the 099 preview of the main scenario: RT-T101 keeps 1004, gets the point; a new trip of TST-2106 loads there and
// goes to Veroia; 8 pallets wait at the point; the base removed RT-T101's Veroia arrival on ΑΝΟΔΟΣ
const TS = (h) => `2026-10-13T${h}:00+03:00`;
function preview(o) {
  return Object.assign({ trucks: [
    { rt_id: 101, code: 'RT-T101', stops: [
      { stop_id: 1004, seq: 4, location_id: 3, place: 'ASPROPYRGOS TEST', text: null, side: 'ANODOS', planned_from: TS('12:00'), planned_to: TS('14:00'), transfer_reason: null, transfer_from_stop_id: null, transfer_waits: false, new: false, removed: false },
      { stop_id: 1201, seq: 5, location_id: 9, place: TP.name, text: 'Λαμία, πάρκινγκ', side: 'ANODOS', planned_from: TS('15:00'), planned_to: TS('15:01'), transfer_reason: 'vehicle_breakdown', transfer_from_stop_id: null, transfer_waits: true, new: true, removed: false },
      { stop_id: 1005, seq: 6, location_id: 1, place: 'ΒΕΡΟΙΑ TEST', text: null, side: 'ANODOS', planned_from: TS('20:00'), planned_to: TS('22:00'), transfer_reason: null, transfer_from_stop_id: null, transfer_waits: false, new: false, removed: true }] },
    { rt_id: 104, code: 'RT-T104', stops: [
      { stop_id: 1202, seq: 1, location_id: 9, place: TP.name, text: 'Λαμία, πάρκινγκ', side: 'ANODOS', planned_from: TS('15:00'), planned_to: TS('15:01'), transfer_reason: null, transfer_from_stop_id: 1201, transfer_waits: false, new: true, removed: false },
      { stop_id: 1203, seq: 2, location_id: 1, place: 'ΒΕΡΟΙΑ TEST', text: null, side: 'ANODOS', planned_from: TS('20:00'), planned_to: TS('22:00'), transfer_reason: null, transfer_from_stop_id: null, transfer_waits: false, new: true, removed: false }] }],
    vs_day: [], waiting: [{ piece_id: 9002, pallets: 8 }], whole_vehicle: false, warnings: [], conflict: null }, o);
}
const SAVED = { ok: true, op: 'plan_transfer', dry_run: false, ids: { rt_id: 101, stop_id: 1201, rt_ids: [104], leg_ids: [7001, 7002], piece_ids: [9001, 9002], new_piece_ids: [9001, 9002] }, warnings: [], notice_ids: [] };
// /plan/transfer and the 072b handover of RT-T101 as the Worker answers them; o.pv / o.refuse / o.conflict per scenario
function plan(o) {
  return {
    'POST /plan/transfer': async (e) => {
      if (o.refuse) return K.planErr(422, 'PLAN_RULE', o.refuse);
      if (e.body && e.body.dry_run === true) {
        const pv = o.conflict ? { trucks: null, vs_day: [], waiting: [], whole_vehicle: false, warnings: [], conflict: { code: o.conflict, sqlstate: '23514', detail: '4003', message: `rig sentinel ${o.conflict}` } } : (o.pv || preview());
        return [200, { ok: true, op: 'plan_transfer', dry_run: true, preview: pv }];
      }
      return [200, SAVED];
    },
    'POST /plan/rt/101/handover': async (e) => (e.body && e.body.dry_run === true
      ? [200, { ok: true, op: 'plan_seg_change', dry_run: true, needs_confirm: false, consequences: [], preview: { segments: [], warnings: [], conflict: null } }]
      : [200, { ok: true, op: 'plan_seg_change', dry_run: false, ids: { segment_id: 801 }, warnings: [], notice_ids: [] }]),
  };
}
async function openRoad(browser, origin, o) {
  const { page, S } = await K.openApp(browser, origin, Object.assign({ lookups: lookups(), plan: plan(o || {}) }, o && o.app));
  if (!(o && o.off)) await page.evaluate(() => { FEATURES.WN_ROAD = true; });
  return { page, S };
}
async function menuItem(page, rt) {
  await page.click(`${ROW(rt)} .wi4-plane`);
  return page.evaluate(() => { const b = document.querySelector('#wn5-menu [data-item="handover"]'); return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), pop: b.getAttribute('aria-haspopup') } : null; });
}
async function openWin(page) {
  await menuItem(page, 101);
  await page.click('#wn5-menu [data-item="handover"]');
  await page.waitForSelector(DLG, { timeout: 5000 });
}
// the form of the main scenario: «Λαμία, πάρκινγκ» as text, Tue 15:00, Βλάβη φορτηγού, ΑΝΟΔΟΣ
async function fill(page, o) {
  await page.click(`${DLG} [data-side="ANODOS"]`);
  await page.fill(`${DLG} [data-where]`, 'Λαμία, πάρκινγκ');
  await page.click(`${DLG} [data-list] .wn5r-opt:last-child`);
  await page.fill(`${DLG} [data-hm]`, '1500');
  await page.selectOption(`${DLG} [data-reason]`, 'vehicle_breakdown');
  if (o && o.pal != null) await page.fill(`${DLG} .wn5r-ld[data-piece="4003"] [data-pal]`, String(o.pal));
  if (o && o.go) await page.selectOption(`${DLG} .wn5r-ld[data-piece="4003"] [data-go]`, o.go);
  if (o && o.rest) await page.selectOption(`${DLG} .wn5r-ld[data-piece="4003"] [data-restgo]`, o.rest);
}
const posts = (S, p) => K.planOf(S, 'POST', p);
async function shot(page, shots, name) { if (shots) await page.screenshot({ path: require('path').join(shots, name + '.png') }); }

async function scnFlagOff({ browser, origin, ok, scn }) {
  const { page, S } = await openRoad(browser, origin, { off: true });
  const it = await menuItem(page, 101);
  ok(scn, 'flag off: ✈ keeps «Αλλαγή οχήματος…» with its «›» (nothing changes for the users)', !!it && it.text.startsWith('Αλλαγή οχήματος…') && it.text.includes('›'), it);
  await page.keyboard.press('Escape');
  await page.click(`${ROW(101)} .wn5-pt[data-stop="1004"]`, { button: 'right' });
  const items = await page.evaluate(() => [...document.querySelectorAll('#wn5-menu [data-item]')].map((b) => b.dataset.item));
  ok(scn, 'flag off: no «Αλλαγή στον δρόμο από εδώ…» on the right-click', items.length > 0 && !items.includes('road'), items);
  ok(scn, 'flag off: WN5Road.open writes nothing and opens nothing', await page.evaluate(async () => (await WN5Road.open(101)) === false && !document.querySelector('.wn5r')));
  ok(scn, 'no /plan/transfer', !posts(S, '/plan/transfer').length);
  await page.context().close();
}

async function scnEntry({ browser, origin, ok, scn, shots }) {
  const { page, S } = await openRoad(browser, origin);
  const it = await menuItem(page, 101);
  ok(scn, '✈ «Αλλαγή στον δρόμο…», one line, no submenu (owner Q2)', !!it && it.text === 'Αλλαγή στον δρόμο…' && !it.pop, it);
  await page.click('#wn5-menu [data-item="handover"]');
  await page.waitForSelector(DLG, { timeout: 5000 }).catch(() => {});
  const h = await page.evaluate((s) => { const d = document.querySelector(s); return d ? { t: d.querySelector('.wi4-dlg-t').textContent, w: Math.round(d.getBoundingClientRect().width), side: d.querySelector('[data-sidecap]').textContent } : null; }, DLG);
  ok(scn, 'the window «Αλλαγή στον δρόμο», 600 wide, its side in caps', !!h && h.t === 'Αλλαγή στον δρόμο' && h.w === 600 && /^(ΚΑΘΟΔΟΣ|ΑΝΟΔΟΣ)$/.test(h.side), h);
  ok(scn, 'no «κύκλος», no RT code on the window', !/κύκλ|RT-/i.test(await K.text(page, DLG)), await K.text(page, DLG));
  await shot(page, shots, 'road-1-empty');
  const lack = await K.text(page, `${DLG} [data-lack]`);
  ok(scn, 'nothing filled: «Συνέχεια ›» off, ONE «Λείπει: …» naming point, time, reason and a truck', lack === 'Λείπει: σημείο, ημέρα και ώρα, λόγος, φορτηγό για ένα φορτίο τουλάχιστον'
    && await page.evaluate((s) => document.querySelector(s + ' [data-act="next"]').disabled, DLG), lack);
  await page.keyboard.press('Escape');
  await page.click(`${ROW(101)} .wn5-pt[data-stop="1004"]`, { button: 'right' });
  const rc = await page.evaluate(() => [...document.querySelectorAll('#wn5-menu [data-item]')].map((b) => [b.dataset.item, b.textContent.trim()]));
  ok(scn, 'right-click on a load: «Αλλαγή στον δρόμο από εδώ…» after «Μεταφορά σε…»', rc.findIndex((x) => x[0] === 'road') === rc.findIndex((x) => x[0] === 'move') + 1
    && (rc.find((x) => x[0] === 'road') || [])[1] === 'Αλλαγή στον δρόμο από εδώ…', rc);
  await page.click('#wn5-menu [data-item="road"]');
  await page.waitForSelector(DLG, { timeout: 5000 }).catch(() => {});
  const r = await page.evaluate((s) => { const d = document.querySelector(s); const f = d && d.querySelector('.wn5r-ld'); return d && { side: d.querySelector('[data-sidecap]').textContent, first: f ? f.dataset.piece : null, day: d.querySelector('[data-day]').value }; }, DLG);
  ok(scn, '«από εδώ» opens on that stop: ΑΝΟΔΟΣ, its day, its load first', !!r && r.side === 'ΑΝΟΔΟΣ' && r.first === '4003' && r.day === '2026-10-13', r);
  ok(scn, 'nothing written by opening', !posts(S, /^\/plan\/(transfer|rt\/\d+\/handover)$/).length);
  await page.context().close();
}

async function scnLists({ browser, origin, ok, scn }) {
  const { page } = await openRoad(browser, origin);
  await openWin(page);
  const opts = async (q) => { await page.fill(`${DLG} [data-where]`, q); return page.evaluate((s) => [...document.querySelectorAll(s + ' [data-list] .wn5r-opt')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), DLG); };
  const a = await opts('λαμ');
  ok(scn, 'Greek typed finds the Latin place; the typed text is the last line «… σημείο με κείμενο»', a.length === 2 && a[0] === 'LAMIA TEST' && a[1] === '«λαμ»σημείο με κείμενο', a);
  const b = await opts('transfer');
  ok(scn, '099\'s «TRANSFER POINT» is never offered', b.length === 1 && !b.some((x) => /TRANSFER POINT/.test(x)), b);
  const c = await opts('βερ');
  ok(scn, 'Veroia is never offered (transfer_at_hub: split and assigned on the Veroia board)', !c.some((x) => /ΒΕΡΟΙΑ/.test(x)), c);
  await page.click(`${DLG} [data-list] .wn5r-opt:last-child`);
  ok(scn, 'a picked text stays in the field, the list closes', await page.evaluate((s) => document.querySelector(s + ' [data-where]').value === 'βερ' && document.querySelector(s + ' [data-list]').hidden, DLG));
  const cat = await page.evaluate(() => ({ plan: PlanIds.list('location').map((x) => x.legacy_id), place: (PlanIds.place(9) || {}).name || null }));
  ok(scn, 'PlanIds.list(location) leaves the point out; PlanIds.place still names it', !cat.plan.includes('v5_transfer_point') && cat.plan.length >= 6 && cat.place === TP.name, cat);
  const fh = await page.evaluate(async () => { await fhLoadLocations(); return _fhLocationsArr.map((x) => x.id); });
  ok(scn, 'the app\'s place pickers (fhLoadLocations) leave it out', fh.length >= 5 && !fh.includes('v5_transfer_point'), fh);
  await page.context().close();
}

async function scnTransfer({ browser, origin, ok, scn, shots }) {
  const { page, S } = await openRoad(browser, origin);
  await openWin(page);
  await fill(page, { pal: 12, go: 'tk:13', rest: 'wait' });
  const f = await page.evaluate((s) => {
    const d = document.querySelector(s);
    const L = d.querySelector('.wn5r-ld[data-piece="4003"]');
    return { w: Math.round(d.getBoundingClientRect().width), rest: !L.querySelector('[data-rest]').hidden,
      restPal: L.querySelector('[data-restpal]').textContent, hint: L.querySelector('[data-resthint]').textContent,
      built: !d.querySelector('[data-built]').hidden ? d.querySelector('[data-built]').textContent.replace(/\s+/g, ' ').trim() : null,
      tl: (d.querySelector('[data-trucks]') || {}).textContent, lack: d.querySelector('[data-lack]').textContent, next: !d.querySelector('[data-act="next"]').disabled };
  }, DLG);
  ok(scn, 'fewer pallets = the split: «↳ υπόλοιπο 8» with its own «Πάει σε»', f.rest && f.restPal === '8', f);
  ok(scn, 'the rest «Νέο φορτίο · φορτηγό αργότερα»: the red «περιμένει στη Λαμία από Τρί 13/10» (text up to the first comma, owner Q1)', f.hint === 'περιμένει στη Λαμία από Τρί 13/10', f.hint);
  ok(scn, 'the read-only «Νέο φορτίο» column (Σύνθεση φορτίων): 800 wide, from Λαμία, 8/33', f.w === 800 && !!f.built && f.built.includes('ΝΕΟ ΦΟΡΤΙΟ · ΑΝΟΔΟΣ') && f.built.includes('Φεύγει από Λαμία') && f.built.includes('8/33'), f);
  ok(scn, 'the other truck\'s line «TST-2106 · Τρί 13/10 · 0 → 12/33»', /TST-2106 · Τρί 13\/10\s*0 → 12\/33/.test(f.tl || ''), f.tl);
  ok(scn, 'ready: no «Λείπει», «Συνέχεια ›» on', f.lack === '' && f.next, f);
  await shot(page, shots, 'road-2-split-wait');
  await page.click(`${DLG} [data-act="next"]`);
  await page.waitForFunction((s) => !document.querySelector(s + ' [data-preview]').hidden, DLG, { timeout: 5000 }).catch(() => {});
  const dry = posts(S, '/plan/transfer');
  const b = dry[0] && dry[0].body;
  const want = { rt_id: 101, point: { text: 'Λαμία, πάρκινγκ' }, side: 'ANODOS', planned_from: TS('15:00'), planned_to: TS('15:01'), reason: 'vehicle_breakdown',
    loads: [{ piece_id: 4003, pallets: 12, go: 0, rest: 'wait' }],
    trucks: [{ target: { new_rt: { trip_type: 'OWNED', truck_id: 13 }, side: 'ANODOS' }, stops: [{ ref: 'n1', location_id: 1, side: 'ANODOS', planned_from: TS('20:00'), planned_to: TS('22:00') }] }], dry_run: true };
  ok(scn, 'ONE dry run, exactly 099\'s keys and values (no request_id on it)', dry.length === 1 && JSON.stringify(b) === JSON.stringify(want), { got: b, want });
  const pv = await K.text(page, `${DLG} [data-preview]`);
  ok(scn, 'preview: A gets «⇄ Λαμία, πάρκινγκ» (whole text inside the window), Veroia struck', /ΤΙ ΘΑ ΓΙΝΕΙ/.test(pv) && pv.includes('⇄ Λαμία, πάρκινγκ · Τρί 13/10 15:00')
    && await page.evaluate((s) => [...document.querySelectorAll(s + ' [data-preview] s')].some((x) => x.textContent === 'Βέροια'), DLG), pv);
  ok(scn, 'preview: the new trip of TST-2106 and the new load «φορτηγό αργότερα · 8π … στο προς ανάθεση»', pv.includes('TST-2106') && pv.includes('φορτηγό αργότερα · 8π') && pv.includes('περιμένει στη Λαμία από Τρί 13/10 · στο προς ανάθεση'), pv);
  ok(scn, 'no «Διεθνής» block when no Veroia day moves', !/ΔΙΕΘΝΗΣ/.test(pv), pv);
  ok(scn, 'the new trip is named by its plate, never its RT code (owner 31/10)', !/RT-T/.test(pv), pv);
  await shot(page, shots, 'road-3-preview');
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForFunction((s) => !document.querySelector(s + ' [data-done]').hidden, DLG, { timeout: 5000 }).catch(() => {});
  const all = posts(S, '/plan/transfer');
  const sv = all[1] && all[1].body;
  ok(scn, 'the save: the same body, no dry_run, a v4 request_id', all.length === 2 && !!sv && !('dry_run' in sv) && K.UUID4.test(sv.request_id || '')
    && JSON.stringify(Object.assign({}, sv, { request_id: undefined })) === JSON.stringify(Object.assign({}, want, { dry_run: undefined })), sv);
  ok(scn, '«Η αλλαγή στον δρόμο γράφτηκε» and the board is read again', (await K.text(page, `${DLG} [data-done]`)) === 'Η αλλαγή στον δρόμο γράφτηκε'
    && K.planOf(S, 'GET', '/plan/board').length >= 2, await K.text(page, `${DLG} [data-done]`));
  ok(scn, 'no handover call on a transfer', !posts(S, '/plan/rt/101/handover').length);
  await page.context().close();
}

async function scnWhole({ browser, origin, ok, scn, shots }) {
  const pv = preview({ whole_vehicle: true, waiting: [] });
  const { page, S } = await openRoad(browser, origin, { pv });
  await openWin(page);
  await fill(page, { go: 'tk:13' });
  await page.click(`${DLG} [data-act="next"]`);
  await page.waitForFunction(() => document.querySelectorAll('.wn5r [data-drv]').length === 1, null, { timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.wn5r [data-act="save"]').disabled, null, { timeout: 5000 }).catch(() => {});
  const txt = await K.text(page, `${DLG} [data-preview]`);
  ok(scn, 'whole_vehicle (the base said it): «… γράφεται ως αλλαγή οχήματος», the driver «ίδιος οδηγός»', txt.includes('γράφεται ως αλλαγή οχήματος') && txt.includes('ίδιος οδηγός (Driver Test 01)'), txt);
  const hd = posts(S, '/plan/rt/101/handover');
  const want = { at: TS('15:00'), place_note: 'Λαμία, πάρκινγκ', reason: 'vehicle_breakdown', vehicle: { trip_type: 'OWNED', truck_id: 13 }, same_driver: true, dry_run: true };
  ok(scn, 'then the 072b dry run of THAT change, its keys only', hd.length === 1 && JSON.stringify(hd[0].body) === JSON.stringify(want), { got: hd[0] && hd[0].body, want });
  await shot(page, shots, 'road-4-whole');
  await page.click(`${DLG} [data-act="save"]`);
  await page.waitForFunction((s) => !document.querySelector(s + ' [data-done]').hidden, DLG, { timeout: 5000 }).catch(() => {});
  const h2 = posts(S, '/plan/rt/101/handover');
  ok(scn, 'the save is the 072b change (request_id), never a transfer save', h2.length === 2 && K.UUID4.test(h2[1].body.request_id || '') && !('dry_run' in h2[1].body)
    && posts(S, '/plan/transfer').length === 1, h2.map((x) => x.body));
  ok(scn, '«Η αλλαγή οχήματος γράφτηκε»', (await K.text(page, `${DLG} [data-done]`)) === 'Η αλλαγή οχήματος γράφτηκε');
  await page.context().close();
}

async function scnConflict({ browser, origin, ok, scn, shots }) {
  const { page, S } = await openRoad(browser, origin, { conflict: 'transfer_not_on_board' });
  await openWin(page);
  await fill(page, { go: 'wait' });
  await page.click(`${DLG} [data-act="next"]`);
  await page.waitForFunction((s) => !!document.querySelector(s + ' .wn5-strip'), DLG, { timeout: 5000 }).catch(() => {});
  const g = await page.evaluate((s) => { const d = document.querySelector(s); return { strip: (d.querySelector('.wn5-strip') || {}).textContent || '', save: d.querySelector('[data-act="save"]').hidden, back: !d.querySelector('[data-act="back"]').hidden }; }, DLG);
  ok(scn, 'a preview conflict: the Worker\'s message as is, no save, «‹ Πίσω»', g.strip.includes('rig sentinel transfer_not_on_board') && g.save && g.back, g);
  await shot(page, shots, 'road-5-conflict');
  await page.click(`${DLG} [data-act="back"]`);
  ok(scn, '«‹ Πίσω»: the form as it was (the text point kept)', await page.evaluate((s) => !document.querySelector(s + ' [data-form]').hidden && document.querySelector(s + ' [data-where]').value === 'Λαμία, πάρκινγκ' && !document.querySelector(s + ' .wn5-strip'), DLG));
  ok(scn, 'one dry run only, no save', posts(S, '/plan/transfer').length === 1);
  await page.context().close();
}

async function scnRefusal({ browser, origin, ok, scn }) {
  const { page, S } = await openRoad(browser, origin, { refuse: 'transfer_at_hub' });
  await openWin(page);
  await fill(page, { go: 'wait' });
  await page.click(`${DLG} [data-act="next"]`);
  await page.waitForFunction((s) => !!document.querySelector(s + ' .wn5-strip'), DLG, { timeout: 5000 }).catch(() => {});
  const g = await page.evaluate((s) => ({ strip: (document.querySelector(s + ' .wn5-strip') || {}).textContent || '', form: !document.querySelector(s + ' [data-form]').hidden }), DLG);
  ok(scn, 'a 422 refusal on the dry run: the Worker\'s words, the form stays', g.strip.includes('rig sentinel transfer_at_hub') && g.form, g);
  ok(scn, 'nothing saved', posts(S, '/plan/transfer').every((x) => x.body.dry_run === true));
  await page.context().close();
}

async function scnBusy({ browser, origin, ok, scn, shots }) {
  const { page, S } = await openRoad(browser, origin, { app: { board: busyWeek() } });
  await openWin(page);
  await fill(page, { go: 'tk:13' });
  const g = await page.evaluate((s) => { const st = document.querySelector(s + ' .wn5r-busy'); return st ? { kind: st.dataset.kind, text: st.textContent.replace(/\s+/g, ' ').trim(), btn: !!st.querySelector('[data-act="time"]') } : null; }, DLG);
  ok(scn, 'busy said BEFORE the press: the amber strip (warning) naming the other trip, with «Αλλαγή ώρας»', !!g && g.kind === 'warning' && /ΑΠΑΣΧΟΛΗΜΕΝΟ/.test(g.text) && g.text.includes('φορτηγό και σε') && g.btn, g);
  await shot(page, shots, 'road-6-busy');
  await page.click(`${DLG} .wn5r-busy [data-act="time"]`);
  const foc = await page.evaluate((s) => ({ hm: document.activeElement === document.querySelector(s + ' [data-hm]'), at: document.activeElement ? document.activeElement.outerHTML.slice(0, 120) : null }), DLG);
  ok(scn, '«Αλλαγή ώρας» opens the time field (the screen guesses no arrival)', foc.hm, foc);
  await page.click(`${DLG} [data-act="next"]`);
  await page.waitForFunction((s) => !document.querySelector(s + ' [data-preview]').hidden, DLG, { timeout: 5000 }).catch(() => {});
  const b = (posts(S, '/plan/transfer')[0] || {}).body || {};
  ok(scn, 'one press: accept_busy inside THAT truck\'s target, not on the body', !!b.trucks && b.trucks[0].target.accept_busy === true && !('accept_busy' in b), b);
  await page.context().close();
}

K.run({
  scenarios: { flag_off: scnFlagOff, entry: scnEntry, lists: scnLists, transfer: scnTransfer, whole: scnWhole, conflict: scnConflict, refusal: scnRefusal, busy: scnBusy },
  globals: ['WN5Road', 'WN5Act', 'WN5'],
  go: '«Αλλαγή στον δρόμο» — flag off as before; ✈ / right-click entry; place lists; transfer dry run + save; whole vehicle via 072b; conflict, refusal, busy',
});
