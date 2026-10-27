// Rig — National v5 F4α, vehicle handover screens (gated 072b: T24 tiles; T25 card / change / fix / H7; T26
// remove / rt-token / clear-seg; T27 sheet-seg). Same kit and week as the forms rig (tests/critics/wn5-rig-kit.js);
// the board variant here carries cycles[].segments[] in the keys of 072b plan_h_seg_json (the 19 keys were read
// from the live function text 27/10, T24 Step 8). The routes of 072b answer here as the Worker does; writes stay
// closed (dry runs pass the closed switch), so nothing here reaches production.
// Usage: node tests/critics/wn5-handover-rig.js [tiles …]   ·   WN5_TREE=<plain main> … → NO-GO, exit 1
'use strict';
const K = require('./wn5-rig-kit.js');

// plan_h_seg_json keys (072b): segment_id, label, from_at, to_at, trip_type, truck_id, truck, trailer_id, trailer,
// driver_id, driver, partner_id, partner, partner_rate, place_note, reason, reason_note, has_vehicle, stop_ids[]
function seg(id, label, from, to, o) {
  return Object.assign({ segment_id: id, label, from_at: from, to_at: to, trip_type: 'OWNED', truck_id: 11, truck: 'TST-2104', trailer_id: 21, trailer: 'TRL-5102',
    driver_id: 31, driver: 'Driver Test 01', partner_id: null, partner: null, partner_rate: null, place_note: null, reason: null, reason_note: null, has_vehicle: true, stop_ids: [] }, o);
}
// RT-T101: ΑΡΧΙΚΟ TST-2104 to Tue 03:00 (it holds the Veroia loading 1001), ΤΕΛΙΚΟ TST-2108 from Λαμία; with `three`
// an ΕΝΔΙΑΜΕΣΟ with no stop of its own and a partner ΤΕΛΙΚΟ. RT-T102: one segment (= today, R-59).
function handWeek(three) {
  const b = K.week();
  const c = b.cycles[0];
  c.segments = three
    ? [seg(701, 'initial', c.start_at, '2026-10-13T03:00:00+03:00', { stop_ids: [1001] }),
       seg(702, 'intermediate', '2026-10-13T03:00:00+03:00', '2026-10-13T05:30:00+03:00', { truck_id: 12, truck: 'TST-2108', trailer_id: 22, trailer: 'TRL-5104', driver_id: 32, driver: 'Driver Test 02', place_note: 'Λαμία', reason: 'vehicle_breakdown' }),
       seg(703, 'final', '2026-10-13T05:30:00+03:00', c.end_at, { trip_type: 'PARTNER', truck_id: null, truck: null, trailer_id: null, trailer: null, driver_id: null, driver: null, partner_id: 51, partner: 'Partner Test 01', partner_rate: 300, place_note: 'Θήβα · λάστιχο', reason: 'vehicle_breakdown', stop_ids: [1002, 1003, 1004, 1005] })]
    : [seg(701, 'initial', c.start_at, '2026-10-13T03:00:00+03:00', { stop_ids: [1001] }),
       seg(702, 'final', '2026-10-13T03:00:00+03:00', c.end_at, { truck_id: 12, truck: 'TST-2108', trailer_id: 22, trailer: 'TRL-5104', driver_id: 32, driver: 'Driver Test 02', place_note: 'Λαμία', reason: 'vehicle_breakdown', stop_ids: [1002, 1003, 1004, 1005] })];
  const d = b.cycles[1];
  d.segments = [seg(801, null, d.start_at, d.end_at, { truck_id: 12, truck: 'TST-2108', trailer_id: 22, trailer: 'TRL-5104', driver_id: 32, driver: 'Driver Test 02', stop_ids: [1101, 1102] })];
  return b;
}
// Aborted external fonts («Failed to load resource») are the kit's own routing, not the app (as the form rig).
const appConsole = (S) => S.console.filter((m) => !/^Failed to load resource/.test(m));
const ROW = (rt) => `#content .wn5-row[data-rt="${rt}"]`;
const HAND = (rt) => `#content .wn5-hand[data-rt="${rt}"]`;
async function guard(page, ok, scn, g) {
  if (ok(scn, `${g} present`, await K.has(page, g))) return true;
  await page.context().close();
  return false;
}

async function scnTiles({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: handWeek(false) });
  if (!(await guard(page, ok, scn, 'WN5L'))) return;
  const g = await page.evaluate((r) => {
    const row = document.querySelector(r);
    const asg = row && row.querySelector('.wn5-asg');
    const tiles = row ? [...row.querySelectorAll('.wn5-tile')] : [];
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
    const vt = row && row.querySelector('.wn5-fl .wn5-vtime');
    const end = row && row.querySelector('.wn5-end');
    return { n: tiles.length, labels: tiles.map((t) => t.dataset.label), asg: box(asg), tiles: tiles.map(box),
      plates: tiles.map((t) => box(t.querySelector('.wn5-tl-p'))), asgText: asg ? asg.textContent : '',
      clip: tiles.map((t) => getComputedStyle(t).clipPath), seg: [...(row ? row.querySelectorAll('.wn5-pt[data-stop]') : [])].map((p) => [p.dataset.stop, p.dataset.segLabel || null]),
      veroia: vt ? vt.dataset.segLabel || null : 'no head', end: end ? end.dataset.segLabel || null : 'no end',
      line: (() => { const p = row && row.querySelector('.wn5-pt[data-seg-label="final"]'); if (!p) return null; const a = getComputedStyle(p, '::after'); return { w: a.width, h: a.height, bg: a.backgroundColor }; })() };
  }, ROW(101));
  ok(scn, 'RT-T101 shows 2 tiles, ΑΡΧΙΚΟ then ΤΕΛΙΚΟ', g.n === 2 && g.labels.join() === 'initial,final', g.labels);
  ok(scn, 'the tiles stay inside the 266px ΑΝΑΘΕΣΗ (±1): 135 − 4 + 135', !!g.asg && Math.abs(g.asg.r - g.asg.l - 266) <= 1 && g.tiles.every((t) => t.l >= g.asg.l - 1 && t.r <= g.asg.r + 1)
    && g.tiles.length === 2 && Math.abs(g.tiles[0].r - g.tiles[0].l - 135) <= 1 && Math.abs(g.tiles[1].l - g.tiles[0].l - 131) <= 1, { asg: g.asg, tiles: g.tiles });
  ok(scn, 'no plate overlaps another', g.plates.length === 2 && g.plates.every(Boolean) && g.plates[0].r <= g.plates[1].l, g.plates);
  ok(scn, 'no hh:mm inside ΑΝΑΘΕΣΗ (R-56)', !/\d\d:\d\d/.test(g.asgText), g.asgText);
  ok(scn, 'the next tile has a slanted side (clip-path), on the board', g.clip[1] && g.clip[1] !== 'none', g.clip);
  ok(scn, 'two segments: 28px tiles, the ΑΝΑΘΕΣΗ does not grow (H1 2120:8904)', g.tiles.length === 2 && g.tiles.every((t) => Math.round(t.b - t.t) === 28), g.tiles);
  ok(scn, 'stops coloured from stop_ids: 1002 final, the Veroia loading 1001 initial, the cycle end final',
    (g.seg.find(([s]) => s === '1002') || [])[1] === 'final' && g.veroia === 'initial' && g.end === 'final', { seg: g.seg, veroia: g.veroia, end: g.end });
  ok(scn, 'the stop line is 24×2 in the ΤΕΛΙΚΟ colour (#0284C7)', !!g.line && g.line.w === '24px' && g.line.h === '2px' && g.line.bg === 'rgb(2, 132, 199)', g.line);
  const hand = await K.text(page, HAND(101));
  ok(scn, '↳ «⇄ Λαμία · Τρί 03:00 · Βλάβη φορτηγού»', hand.includes('⇄ Λαμία · Τρί 03:00') && hand.includes('Βλάβη φορτηγού'), hand);
  ok(scn, '⇄ in place of the arrow of the KATHODOS, and only there', await K.count(page, `${ROW(101)} .wn5-kto .wn5-hand-x`) === 1 && await K.count(page, `${ROW(101)} .wn5-hand-x`) === 1);
  // «In place of» is the → gone, not only the ⇄ present: the arrow is a ::before of the same cell (review T24 r1).
  const arrow = await page.evaluate((rs) => rs.map((sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el, '::before').content : 'no cell'; }),
    [`${ROW(101)} .wn5-kto`, `${ROW(101)} .wn5-ato`, `${ROW(102)} .wn5-ato`]);
  ok(scn, 'no → under the ⇄ (RT-T101 ΚΑΘΟΔΟΣ ::before none); the → stays where no ⇄ (RT-T101 ΑΝΟΔΟΣ, RT-T102)',
    arrow[0] === 'none' && arrow[1] === '"→"' && arrow[2] === '"→"', arrow);
  const one = await page.evaluate((r) => { const row = document.querySelector(r); return { tiles: row ? row.querySelectorAll('.wn5-tile').length : -1, box: row ? row.querySelectorAll('.wn5-asg .wi4-box').length : -1,
    labels: row ? row.querySelectorAll('[data-seg-label]').length : -1, hand: row ? row.querySelectorAll('.wn5-hand-x').length : -1 }; }, ROW(102));
  ok(scn, 'a one-segment cycle is exactly today: one box, no tile, no label, no ⇄, no ↳ (R-59)', one.tiles === 0 && one.box === 1 && one.labels === 0 && one.hand === 0 && await K.count(page, HAND(102)) === 0, one);
  await page.context().close();

  const p3 = await K.openApp(browser, origin, { board: handWeek(true) });
  const t3 = await p3.page.evaluate((r) => {
    const row = document.querySelector(r);
    const asg = row.querySelector('.wn5-asg').getBoundingClientRect();
    const tiles = [...row.querySelectorAll('.wn5-tile')].map((t) => t.getBoundingClientRect());
    // Each text line of a tile whose right side slants (ΑΡΧΙΚΟ, ΕΝΔΙΑΜΕΣΟ) must end before the cut at the line's own
    // bottom (fidelity 2123:8287): otherwise clip-path cuts a long driver / plate mid-glyph instead of the ellipsis.
    const cut = [...row.querySelectorAll('.wn5-tile:is([data-label="initial"], [data-label="intermediate"])')].flatMap((t) => {
      const b = t.getBoundingClientRect();
      const s = parseFloat(getComputedStyle(t).getPropertyValue('--s'));
      return [...t.querySelectorAll('.wn5-tl-l, .wn5-tl-p, .wn5-tl-d')].map((e) => {
        const r = e.getBoundingClientRect();
        return { label: t.dataset.label, cls: e.className, right: Math.round(r.right - b.left), cutAt: Math.round(b.width - s * (r.bottom - b.top) / b.height), ellipsis: getComputedStyle(e).textOverflow };
      });
    });
    return { n: tiles.length, fit: tiles.every((t) => t.left >= asg.left - 1 && t.right <= asg.right + 1), w: tiles.map((t) => Math.round(t.width)), h: row.getBoundingClientRect().height,
      partner: row.querySelector('.wn5-tile.par') ? row.querySelector('.wn5-tile.par').textContent : '', cut };
  }, ROW(101));
  ok(scn, '3 segments: every line of ΑΡΧΙΚΟ / ΕΝΔΙΑΜΕΣΟ ends before its slanted cut, plate and driver with an ellipsis',
    t3.cut.length === 6 && t3.cut.every((c) => c.right <= c.cutAt && (/wn5-tl-l/.test(c.cls) || c.ellipsis === 'ellipsis')), t3.cut);
  ok(scn, '3 segments: 3 tiles fit in 266px (93 / 99 / 92)', t3.n === 3 && t3.fit && t3.w.join() === '93,99,92', t3);
  ok(scn, '3 segments: the row is at least 48px', t3.h >= 48, t3.h);
  ok(scn, 'a partner ΤΕΛΙΚΟ shows its rate «300 €» (Ε-13, decision 41)', /ΤΕΛΙΚΟ/.test(t3.partner) && /300 €/.test(t3.partner), t3.partner);
  const hand3 = await K.text(p3.page, HAND(101));
  ok(scn, 'two changes: one ⇄ on the leg, two ↳ entries by time', await K.count(p3.page, `${ROW(101)} .wn5-hand-x`) === 1
    && hand3.indexOf('⇄ Λαμία · Τρί 03:00') >= 0 && hand3.indexOf('⇄ Λαμία · Τρί 03:00') < hand3.indexOf('⇄ Θήβα · λάστιχο · Τρί 05:30'), hand3);
  ok(scn, 'no page errors', !S.pageErrors.length && !p3.S.pageErrors.length, S.pageErrors.concat(p3.S.pageErrors));
  ok(scn, 'no console errors', !appConsole(S).length && !appConsole(p3.S).length, appConsole(S).concat(appConsole(p3.S)));
  const writes = S.plan.concat(p3.S.plan).filter((x) => x.m !== 'GET');
  ok(scn, 'read only: no /plan write', !writes.length, writes.map((x) => x.m + ' ' + x.path));
  await p3.page.context().close();

  // A reason code the map does not know (principle 1): said on the ↳ row, and logged once — not a blank, not a log row
  // per repaint. Its own page, because its one console error is the expected log line.
  const bz = handWeek(false);
  bz.cycles[0].segments[1].reason = 'zzz';
  const pz = await K.openApp(browser, origin, { board: bz });
  const handZ = await K.text(pz.page, HAND(101));
  const rowsZ = await pz.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('tms_errors') || '[]'); } catch (_) { return []; } });
  const zz = rowsZ.filter((x) => /unknown handover reason zzz/.test(x.msg || ''));
  ok(scn, 'unknown reason: ↳ says «άλλος λόγος · zzz»', handZ.includes('άλλος λόγος · zzz'), handZ);
  ok(scn, 'unknown reason: one logError row (count 1)', zz.length === 1 && (zz[0].count || 1) === 1, rowsZ.map((x) => x.msg + ' ×' + x.count));
  const otherZ = appConsole(pz.S).filter((m) => !/unknown handover reason zzz/.test(m));
  ok(scn, 'unknown reason: no other console or page error', !otherZ.length && !pz.S.pageErrors.length, otherZ.concat(pz.S.pageErrors));
  await pz.page.context().close();
}

// T25 — the cycle card, the change (dry run → execution), the fix, the H7 refusals.
function oneSegWeek() {
  const b = K.week();
  for (const c of b.cycles) c.segments = [seg(c.rt_id * 10, null, c.start_at, c.end_at, { truck_id: c.truck_id, truck: c.truck, trailer_id: c.trailer_id, trailer: c.trailer,
    driver_id: c.driver_id, driver: c.driver, stop_ids: c.stops.map((s) => s.stop_id) })];
  return b;
}
const HDLG = '.wi4-dlg[role="dialog"][data-wn5="handover"]';
const dryOk = (b) => [200, { ok: true, op: 'plan_seg_change', dry_run: true, preview: { segments: [
  seg(1010, 'initial', '2026-10-12T16:00:00+03:00', b.at, { stop_ids: [1001] }),
  seg(1011, 'final', b.at, '2026-10-13T22:00:00+03:00', { truck_id: 12, truck: 'TST-2108', trailer_id: 22, trailer: 'TRL-5104', driver_id: 32, driver: 'Driver Test 02', place_note: b.place_note, reason: b.reason, stop_ids: [1002, 1003, 1004, 1005] })],
  warnings: [], conflict: null } }];
async function fillChange(page, o) {
  await page.evaluate((o) => {
    const s = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    s('wn5h-day', o.day); s('wn5h-hm', o.hm); s('wn5h-place', o.place); s('wn5h-reason', o.reason);
    if (o.note != null) s('wn5h-note', o.note);
    s('wn5h-truck', String(o.truck)); if (o.trailer) s('wn5h-trailer', String(o.trailer)); s('wn5h-driver', String(o.driver));
  }, o);
}
const CH = { day: '2026-10-13', hm: '03:00', place: 'Λαμία', reason: 'vehicle_breakdown', truck: 12, trailer: 22, driver: 32 };
const posts = (S) => K.planOf(S, 'POST', '/plan/rt/101/handover');

async function scnCard({ browser, origin, ok, scn }) {
  const errs = [];
  for (const role of ['owner', 'management', 'dispatcher', 'accountant', 'warehouse']) {
    const { page, S } = await K.openApp(browser, origin, { board: handWeek(false), role });
    if (!(await guard(page, ok, scn, 'WN5Hand'))) return;
    await page.evaluate(() => WN5Hand.cycleCard(101));
    await page.waitForSelector('.wi4-dlg[data-wn5="cycle"]', { timeout: 6000 }).catch(() => {});
    const t = await K.text(page, '.wi4-dlg[data-wn5="cycle"] .wi4-dlg-hd');
    ok(scn, `${role}: «Κύκλος RT-T101 · … · 2 τμήματα»`, t.includes('Κύκλος RT-T101') && t.includes('2 τμήματα'), t);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.wi4-dlg[data-wn5="cycle"] .wn5h-seg')].map((r) => [r.dataset.label, getComputedStyle(r).clipPath, r.querySelectorAll('[data-act="fix"]').length, r.querySelectorAll('[data-act="remove"]').length]));
    ok(scn, `${role}: ΤΜΗΜΑΤΑ = ΑΡΧΙΚΟ + ΤΕΛΙΚΟ, «Διόρθωση» on both, «Αφαίρεση» on all but the first`, JSON.stringify(rows.map((r) => [r[0], r[2], r[3]])) === JSON.stringify([['initial', 1, 0], ['final', 1, 1]]), rows);
    ok(scn, `${role}: a straight line in the list, no slant (R-55)`, rows.every((r) => r[1] === 'none'), rows.map((r) => r[1]));
    ok(scn, `${role}: «Φύλλα οδηγών (2)» and «Καθαρισμός ανάθεσης» are there (no role guard)`, (await K.text(page, '.wi4-dlg[data-wn5="cycle"] .wn5h-acts')).includes('Φύλλα οδηγών (2)') && (await K.text(page, '.wi4-dlg[data-wn5="cycle"] .wn5h-acts')).includes('Καθαρισμός ανάθεσης'));
    await page.waitForTimeout(800);
    // Ε-11 «γ» (owner 26/10): no change history in the card for any role, and no /audit read behind it
    const card = await K.text(page, '.wi4-dlg[data-wn5="cycle"]');
    ok(scn, `${role}: no «ΙΣΤΟΡΙΚΟ ΑΛΛΑΓΩΝ» in the card and no /audit read (Ε-11 «γ»)`, !/ΙΣΤΟΡΙΚΟ/.test(card) && !S.facade.some((x) => x.path === '/audit'), card);
    await page.click('.wi4-dlg[data-wn5="cycle"] [data-act="change"]');
    await page.waitForSelector(HDLG, { timeout: 6000 }).catch(() => {});
    ok(scn, `${role}: «Αλλαγή οχήματος» opens the change form`, await K.count(page, HDLG) === 1);
    errs.push(...S.pageErrors, ...appConsole(S));
    await page.context().close();
  }
  ok(scn, 'no page or console errors (5 roles)', !errs.length, errs);
}

async function scnChange({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: oneSegWeek(), plan: { 'POST /plan/rt/101/handover': (e) => (e.body.dry_run === true ? dryOk(e.body) : K.planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
  if (!(await guard(page, ok, scn, 'WN5Hand'))) return;
  await page.evaluate(() => WN5Hand.change(101));
  await page.waitForSelector(HDLG, { timeout: 6000 }).catch(() => {});
  ok(scn, 'the reasons list: ΑΠΡΟΒΛΕΠΤΟ / ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΟ / Άλλο (H2)', await page.evaluate(() => [...document.querySelectorAll('#wn5h-reason optgroup')].map((g) => g.label).join() === 'ΑΠΡΟΒΛΕΠΤΟ,ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΟ' && !!document.querySelector('#wn5h-reason option[value="other"]')));
  await fillChange(page, Object.assign({}, CH, { reason: 'other', note: '' }));
  await page.waitForTimeout(900);
  // the line sits under the note field, which turns red (Figma 2122:7868), not in the form's line box
  ok(scn, '«Άλλο» without its note: the line under the note field, no dry run sent, save disabled', /Με «Άλλο» η σημείωση είναι υποχρεωτική/.test(await K.text(page, `${HDLG} [data-note] [data-ferr]`))
    && await page.evaluate((d) => document.querySelector(`${d} [data-note]`).classList.contains('bad'), HDLG) && posts(S).length === 0
    && await page.evaluate((d) => document.querySelector(`${d} [data-act="save"]`).disabled, HDLG));
  await fillChange(page, CH);
  await page.waitForTimeout(1200);
  const dry = posts(S).filter((x) => x.body.dry_run === true);
  ok(scn, 'a valid form runs ONE dry run, without request_id', dry.length === 1 && !('request_id' in dry[0].body), posts(S).map((x) => x.body));
  ok(scn, 'the dry body = the form state', dry[0] && JSON.stringify(dry[0].body) === JSON.stringify({ at: '2026-10-13T03:00:00+03:00', place_note: 'Λαμία', reason: 'vehicle_breakdown', vehicle: { trip_type: 'OWNED', truck_id: 12, trailer_id: 22, driver_id: 32 }, dry_run: true }), dry[0] && dry[0].body);
  ok(scn, 'preview «Μετά την αλλαγή · 2 τμήματα» before any save', /Μετά την αλλαγή · 2 τμήματα/.test(await K.text(page, `${HDLG} [data-preview]`)));
  await page.click(`${HDLG} [data-act="save"]`);
  await page.waitForTimeout(1000);
  const ex = posts(S).filter((x) => x.body.dry_run !== true);
  ok(scn, 'the execution = the same body + a uuid request_id, no dry_run', ex.length === 1 && K.UUID4.test(ex[0].body.request_id || '') && JSON.stringify(Object.assign({}, ex[0].body, { request_id: undefined })) === JSON.stringify(Object.assign({}, dry[0].body, { dry_run: undefined })), ex.map((x) => x.body));
  ok(scn, 'before day L: 409 → the preview strip with the Worker text, the save disabled (H7 tile 4)', /rig sentinel writes_closed/.test(await K.text(page, `${HDLG} [data-strip]`))
    && await page.evaluate((d) => document.querySelector(`${d} [data-act="save"]`).disabled, HDLG));
  await page.evaluate(() => { const el = document.getElementById('wn5h-place'); el.value = 'Λαμία κέντρο'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(1000);
  ok(scn, 'the dry run stays open after 409 (a change in the form → a new preview)', posts(S).filter((x) => x.body.dry_run === true).length === 2);
  ok(scn, 'closed: the cancel button reads «Κλείσιμο» (H7 tile 4)', (await K.text(page, `${HDLG} .wn5f-ft [data-act="cancel"]`)) === 'Κλείσιμο');
  ok(scn, 'no page or console errors', !S.pageErrors.length && !appConsole(S).length, S.pageErrors.concat(appConsole(S)));
  await page.context().close();
  // 404 before 072b is live
  const p2 = await K.openApp(browser, origin, { board: oneSegWeek(), plan: { 'POST /plan/rt/101/handover': () => K.planErr(404, 'NOT_FOUND', 'no_route') } });
  await p2.page.evaluate(() => WN5Hand.change(101));
  await p2.page.waitForSelector(HDLG, { timeout: 6000 }).catch(() => {});
  await fillChange(p2.page, CH);
  await p2.page.waitForTimeout(1200);
  ok(scn, '404 no_route → the Worker message + «δεν έχει ανέβει ακόμη (072b)»', /rig sentinel no_route/.test(await K.text(p2.page, `${HDLG} [data-strip]`)) && /072b/.test(await K.text(p2.page, `${HDLG} [data-err]`)));
  // A 404 is logged once by planFetch (Global Constraints: every 400/404 → app_errors; 072b is live, so a 404 now is a
  // real fault, not a designed answer): exactly that one line, nothing else.
  const c404 = appConsole(p2.S);
  ok(scn, '404: one planFetch log line for the 404, no other page or console error', !p2.S.pageErrors.length && c404.length === 1
    && /^\[TMS ERROR\] planFetch POST \/plan\/rt\/:id\/handover: PlanError: rig sentinel no_route/.test(c404[0]), p2.S.pageErrors.concat(c404));
  await p2.page.context().close();
}

async function scnFix({ browser, origin, ok, scn }) {
  const { page, S } = await K.openApp(browser, origin, { board: handWeek(false), plan: { 'PATCH /plan/segments/702': (e) => (e.body.dry_run === true
    ? [200, { ok: true, op: 'plan_seg_fix', dry_run: true, preview: { segments: handWeek(false).cycles[0].segments, warnings: [], conflict: null } }]
    : K.planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
  if (!(await guard(page, ok, scn, 'WN5Hand'))) return;
  await page.evaluate(() => WN5Hand.fix(702));
  await page.waitForSelector('.wi4-dlg[data-wn5="fix"]', { timeout: 6000 }).catch(() => {});
  await page.fill('.wi4-dlg[data-wn5="fix"] #wn5h-place', 'Λαμία κέντρο');
  await page.waitForTimeout(1200);
  const all = K.planOf(S, 'PATCH', '/plan/segments/702');
  ok(scn, 'only the changed key: {set:{place_note}} + dry_run', all.length === 1 && JSON.stringify(all[0].body) === JSON.stringify({ set: { place_note: 'Λαμία κέντρο' }, dry_run: true }), all.map((x) => x.body));
  await page.click('.wi4-dlg[data-wn5="fix"] [data-act="save"]');
  await page.waitForTimeout(1000);
  const ex = K.planOf(S, 'PATCH', '/plan/segments/702').filter((x) => x.body.dry_run !== true);
  ok(scn, 'the fix execution carries no request_id (a fix creates nothing)', ex.length === 1 && !('request_id' in ex[0].body), ex.map((x) => x.body));
  ok(scn, 'no page or console errors', !S.pageErrors.length && !appConsole(S).length, S.pageErrors.concat(appConsole(S)));
  await page.context().close();
}

async function scnH7({ browser, origin, ok, scn }) {
  const codes = ['truck_busy', 'driver_busy', 'payroll_locked', 'seg_outside', 'seg_many'];
  let n = 0;
  const { page, S } = await K.openApp(browser, origin, { board: oneSegWeek(), plan: { 'POST /plan/rt/101/handover': (e) => (e.body.dry_run === true ? dryOk(e.body) : K.planErr(422, 'PLAN_RULE', codes[n++])) } });
  if (!(await guard(page, ok, scn, 'WN5Hand'))) return;
  await page.evaluate(() => WN5Hand.change(101));
  await page.waitForSelector(HDLG, { timeout: 6000 }).catch(() => {});
  await fillChange(page, CH);
  await page.waitForTimeout(1200);
  for (const c of codes) {
    await page.click(`${HDLG} [data-act="save"]`).catch(() => {});
    await page.waitForTimeout(700);
    ok(scn, `${c} → the Worker message as is, the form stays open with what was typed`, (await K.text(page, `${HDLG} [data-strip]`)).includes('rig sentinel ' + c) && await K.count(page, HDLG) === 1
      && (await page.evaluate(() => document.getElementById('wn5h-place').value)) === 'Λαμία');
    // H7 2130:7745 / 2130:7809: the refused field turns red (truck for truck_busy, driver for payroll_locked)
    if (c === 'truck_busy' || c === 'payroll_locked') {
      const f = c === 'truck_busy' ? '.wn5h-truck' : '.wn5h-driver';
      ok(scn, `${c} → the ${f.slice(6)} field has the red border`, await page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.classList.contains('bad'); }, `${HDLG} ${f}`));
    }
  }
  const ex = posts(S).filter((x) => x.body.dry_run !== true);
  ok(scn, 'every press after a refusal carries the SAME request_id', ex.length === 5 && new Set(ex.map((x) => x.body.request_id)).size === 1, ex.map((x) => x.body.request_id));
  ok(scn, 'no page or console errors', !S.pageErrors.length && !appConsole(S).length, S.pageErrors.concat(appConsole(S)));
  await page.context().close();
}

const SCN = { tiles: scnTiles, card: scnCard, change: scnChange, fix: scnFix, h7: scnH7 };
module.exports = { seg, handWeek, ROW, HAND, guard, appConsole, SCN };
if (require.main === module) {
  K.run({ scenarios: SCN, globals: ['WN5L', 'WN5Lab', 'WN5Hand'], go: 'the vehicle handover screens hold on the 072b stub' })
    .catch((e) => { console.error(e); process.exit(1); });
}
