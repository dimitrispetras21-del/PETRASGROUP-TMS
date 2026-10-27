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
  // The preview reports a conflict (Step 8.4): the Worker's line stays, the save stays closed, and a refresh that
  // changes nothing keeps the line (_kept) without a second dry run (review T25 r1: no check held `!d.prev.conflict`).
  const pc = await K.openApp(browser, origin, { board: oneSegWeek(), plan: { 'POST /plan/rt/101/handover': (e) => {
    if (e.body.dry_run !== true) return K.planErr(409, 'WRITES_CLOSED', 'writes_closed');
    const r = dryOk(e.body);
    r[1].preview.conflict = { code: 'truck_busy', message: 'rig sentinel conflict truck_busy' };
    return r;
  } } });
  await pc.page.evaluate(() => WN5Hand.change(101));
  await pc.page.waitForSelector(HDLG, { timeout: 6000 }).catch(() => {});
  await fillChange(pc.page, CH);
  await pc.page.waitForTimeout(1200);
  const saveOff = () => pc.page.evaluate((d) => { const b = document.querySelector(`${d} [data-act="save"]`); return !!b && b.disabled; }, HDLG);
  ok(scn, 'preview.conflict → the Worker message in the line box, the save disabled', /rig sentinel conflict truck_busy/.test(await K.text(pc.page, `${HDLG} [data-err]`)) && await saveOff());
  await pc.page.evaluate(() => { document.getElementById('wn5h-place').dispatchEvent(new Event('input', { bubbles: true })); });
  await pc.page.waitForTimeout(900);
  ok(scn, 'conflict: after a no-op input the line is still there, the save still disabled, ONE dry run in all',
    /rig sentinel conflict truck_busy/.test(await K.text(pc.page, `${HDLG} [data-err]`)) && await saveOff() && posts(pc.S).length === 1, posts(pc.S).map((x) => x.body));
  ok(scn, 'conflict: no page or console errors', !pc.S.pageErrors.length && !appConsole(pc.S).length, pc.S.pageErrors.concat(appConsole(pc.S)));
  await pc.page.context().close();
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

  // A rate that is not a number (review T25 r1): NaN would be sent as partner_rate:null and wipe the rate. Both the
  // ΤΕΛΙΚΟ partner 703 and a partner ΑΡΧΙΚΟ (the first segment skips the other rules); then 350 as the control.
  const bp = handWeek(true);
  Object.assign(bp.cycles[0].segments[0], { trip_type: 'PARTNER', truck_id: null, truck: null, trailer_id: null, trailer: null, driver_id: null, driver: null, partner_id: 51, partner: 'Partner Test 01', partner_rate: 280 });
  const pr = await K.openApp(browser, origin, { board: bp, plan: { 'PATCH /plan/segments/703': (e) => (e.body.dry_run === true
    ? [200, { ok: true, op: 'plan_seg_fix', dry_run: true, preview: { segments: bp.cycles[0].segments, warnings: [], conflict: null } }] : K.planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
  const FX = '.wi4-dlg[data-wn5="fix"]';
  for (const sid of [703, 701]) {
    await pr.page.evaluate((x) => WN5Hand.fix(x), sid);
    await pr.page.waitForSelector(FX, { timeout: 6000 }).catch(() => {});
    await pr.page.fill(`${FX} #wn5h-rate`, 'abc');
    await pr.page.waitForTimeout(1000);
    ok(scn, `fix ${sid}: rate «abc» → «Κόμιστρο €: αριθμός 0 ή πάνω», the rate field red, no PATCH, the save disabled`,
      /Κόμιστρο €: αριθμός 0 ή πάνω/.test(await K.text(pr.page, `${FX} [data-err]`)) && await pr.page.evaluate((f) => document.querySelector(`${f} .wn5h-rate`).classList.contains('bad')
        && document.querySelector(`${f} [data-act="save"]`).disabled, FX) && K.planOf(pr.S, 'PATCH', '/plan/segments/' + sid).length === 0, K.planOf(pr.S, 'PATCH', /segments/).map((x) => x.body));
  }
  await pr.page.evaluate((x) => WN5Hand.fix(x), 703);
  await pr.page.waitForSelector(FX, { timeout: 6000 }).catch(() => {});
  await pr.page.fill(`${FX} #wn5h-rate`, '350');
  await pr.page.waitForTimeout(1200);
  const r3 = K.planOf(pr.S, 'PATCH', '/plan/segments/703');
  ok(scn, 'control: rate «350» → ONE dry run {set:{partner_rate:350}}, no line', r3.length === 1 && JSON.stringify(r3[0].body) === JSON.stringify({ set: { partner_rate: 350 }, dry_run: true })
    && !(await K.text(pr.page, `${FX} [data-err]`)), r3.map((x) => x.body));
  ok(scn, 'rate: no page or console errors', !pr.S.pageErrors.length && !appConsole(pr.S).length, pr.S.pageErrors.concat(appConsole(pr.S)));
  await pr.page.context().close();

  // The segment's own vehicle is not in the lookups (inactive, id 99): still offered and selected, so a place-only fix
  // does not send trailer_id:null (review T25 r1).
  const bm = handWeek(false);
  Object.assign(bm.cycles[0].segments[1], { trailer_id: 99, trailer: 'TRL-9999' });
  const pm = await K.openApp(browser, origin, { board: bm, plan: { 'PATCH /plan/segments/702': (e) => (e.body.dry_run === true
    ? [200, { ok: true, op: 'plan_seg_fix', dry_run: true, preview: { segments: bm.cycles[0].segments, warnings: [], conflict: null } }] : K.planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
  await pm.page.evaluate(() => WN5Hand.fix(702));
  await pm.page.waitForSelector(FX, { timeout: 6000 }).catch(() => {});
  const trl = await pm.page.evaluate((f) => { const s = document.querySelector(`${f} #wn5h-trailer`); return s ? [s.value, s.options[s.selectedIndex].textContent] : null; }, FX);
  ok(scn, 'a trailer missing from the lookups is still the selected value, under its board label', !!trl && trl[0] === '99' && trl[1] === 'TRL-9999', trl);
  await pm.page.fill(`${FX} #wn5h-place`, 'Λαμία κέντρο');
  await pm.page.waitForTimeout(1200);
  const rm = K.planOf(pm.S, 'PATCH', '/plan/segments/702');
  ok(scn, 'a place-only fix sends {set:{place_note}} alone, no trailer_id:null', rm.length === 1 && JSON.stringify(rm[0].body) === JSON.stringify({ set: { place_note: 'Λαμία κέντρο' }, dry_run: true }), rm.map((x) => x.body));
  ok(scn, 'missing vehicle: no page or console errors', !pm.S.pageErrors.length && !appConsole(pm.S).length, pm.S.pageErrors.concat(appConsole(pm.S)));
  await pm.page.context().close();

  // The lookups did not load: the fix is locked like the change (strip + save off), and the segment's own vehicles
  // stay its own, so the dry run still carries only what was typed.
  const pl = await K.openApp(browser, origin, { board: handWeek(false), plan: { 'GET /plan/lookups': () => K.planErr(404, 'NOT_FOUND', 'no_route'), 'PATCH /plan/segments/702': (e) => (e.body.dry_run === true
    ? [200, { ok: true, op: 'plan_seg_fix', dry_run: true, preview: { segments: handWeek(false).cycles[0].segments, warnings: [], conflict: null } }] : K.planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
  await pl.page.evaluate(() => WN5Hand.fix(702));
  await pl.page.waitForSelector(FX, { timeout: 6000 }).catch(() => {});
  await pl.page.fill(`${FX} #wn5h-place`, 'Λαμία κέντρο');
  await pl.page.waitForTimeout(1200);
  const rl = K.planOf(pl.S, 'PATCH', '/plan/segments/702');
  ok(scn, 'no lookups: the strip says it, the save stays disabled, the dry run = {set:{place_note}} only',
    /rig sentinel no_route/.test(await K.text(pl.page, `${FX} [data-strip]`)) && await pl.page.evaluate((f) => document.querySelector(`${f} [data-act="save"]`).disabled, FX)
      && rl.length === 1 && JSON.stringify(rl[0].body) === JSON.stringify({ set: { place_note: 'Λαμία κέντρο' }, dry_run: true }), rl.map((x) => x.body));
  ok(scn, 'no lookups: no page or console errors', !pl.S.pageErrors.length && !appConsole(pl.S).length, pl.S.pageErrors.concat(appConsole(pl.S)));
  await pl.page.context().close();
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

// T25 fidelity round: the preview never outlives its body, the payroll foot, «ίδιος οδηγός» shows the driver who
// keeps driving, «ελεύθερο ως …» from the week's cycles, stops wrap instead of an ellipsis, the «Άλλο» line on one
// line, and «Βέροια» from the board's own hub rule when the catalogue has no hub (the rig lookups have no is_hub).
async function scnFid({ browser, origin, ok, scn }) {
  const cd = await K.openApp(browser, origin, { board: handWeek(false) });
  if (!(await guard(cd.page, ok, scn, 'WN5Hand'))) return;
  await cd.page.evaluate(() => WN5Hand.cycleCard(101));
  await cd.page.waitForSelector('.wi4-dlg[data-wn5="cycle"]', { timeout: 6000 }).catch(() => {});
  const cs = await cd.page.evaluate(() => [...document.querySelectorAll('.wi4-dlg[data-wn5="cycle"] .wn5h-stops')].map((e) => ({ t: e.textContent, ws: getComputedStyle(e).whiteSpace,
    cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1, h: Math.round(e.getBoundingClientRect().height) })));
  ok(scn, 'card: the hub stop reads «Βέροια» (no catalogue hub → the board\'s VS legs), never «ΒΕΡΟΙΑ TEST · Veria»',
    cs.length === 2 && cs[0].t === 'Βέροια' && /· Βέροια$/.test(cs[1].t) && !cs.some((x) => /ΒΕΡΟΙΑ TEST|Veria/.test(x.t)), cs);
  ok(scn, 'card: the stops wrap, nothing is cut (no nowrap, no overflow)', cs.every((x) => x.ws !== 'nowrap' && !x.cut), cs);
  ok(scn, 'card: no page or console errors', !cd.S.pageErrors.length && !appConsole(cd.S).length, cd.S.pageErrors.concat(appConsole(cd.S)));
  await cd.page.context().close();

  const { page, S } = await K.openApp(browser, origin, { board: oneSegWeek(), plan: { 'POST /plan/rt/101/handover': (e) => (e.body.dry_run === true ? dryOk(e.body) : K.planErr(409, 'WRITES_CLOSED', 'writes_closed')) } });
  await page.evaluate(() => WN5Hand.change(101));
  await page.waitForSelector(HDLG, { timeout: 6000 }).catch(() => {});
  const prevText = () => K.text(page, `${HDLG} [data-preview]`);
  const hint = (k) => page.evaluate((s) => { const h = document.querySelector(s); return h ? [h.textContent, h.offsetParent !== null] : null; }, `${HDLG} [data-hint="${k}"]`);
  await page.evaluate(() => { const el = document.getElementById('wn5h-day'); el.value = '2026-10-13'; el.dispatchEvent(new Event('change', { bubbles: true })); const h = document.getElementById('wn5h-hm'); h.value = '03:00'; h.dispatchEvent(new Event('change', { bubbles: true })); });
  ok(scn, 'no hint before a vehicle is picked', JSON.stringify(await hint('truck')) === '["",false]' && JSON.stringify(await hint('driver')) === '["",false]', [await hint('truck'), await hint('driver')]);
  await fillChange(page, CH);
  await page.waitForTimeout(1200);
  ok(scn, 'hints from the week: «ελεύθερο ως Τρί 22:00» / «ελεύθερος ως Τρί 22:00» (RT-T102 uses them only from Τετ 10:00)',
    JSON.stringify(await hint('truck')) === '["ελεύθερο ως Τρί 22:00",true]' && JSON.stringify(await hint('driver')) === '["ελεύθερος ως Τρί 22:00",true]', [await hint('truck'), await hint('driver')]);
  const p1 = await prevText();
  ok(scn, 'preview foot «Μισθοδοσία: 2 γραμμές (Driver Test 01, Driver Test 02)»', p1.includes('Μισθοδοσία: 2 γραμμές (Driver Test 01, Driver Test 02)'), p1);
  ok(scn, 'preview ⇄ line names the reason of this body', p1.includes('Λαμία · Τρί 03:00 · Βλάβη φορτηγού'), p1);
  const ps = await page.evaluate((d) => [...document.querySelectorAll(`${d} [data-preview] .wn5h-stops`)].map((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1), HDLG);
  ok(scn, 'preview stops are not cut', ps.length === 2 && ps.every((c) => !c), ps);
  await page.evaluate(() => { const r = document.getElementById('wn5h-reason'); r.value = 'other'; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(300);
  ok(scn, '«Άλλο» without a note: the old preview is gone (no «Βλάβη φορτηγού» left on screen), the save off',
    !(await prevText()) && await page.evaluate((d) => document.querySelector(`${d} [data-act="save"]`).disabled, HDLG), await prevText());
  const fe = await page.evaluate((d) => { const e = document.querySelector(`${d} [data-note] [data-ferr]`), b = document.querySelector(`${d} .wn5f-body`).getBoundingClientRect(), r = e.getBoundingClientRect();
    return { h: Math.round(r.height), inside: r.left >= b.left && r.right <= b.right + 0.5, lh: parseFloat(getComputedStyle(e).lineHeight) || 0 }; }, HDLG);
  ok(scn, 'the «Άλλο» line is ONE line and stays inside the form body', fe.h > 0 && fe.h <= 16 && fe.inside, fe);
  await page.evaluate(() => { const r = document.getElementById('wn5h-reason'); r.value = 'vehicle_breakdown'; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(1200);
  ok(scn, 'the same body again → a preview again', /Μετά την αλλαγή · 2 τμήματα/.test(await prevText()));
  await page.click(`${HDLG} [data-vmode="partner"]`);
  await page.waitForTimeout(300);
  ok(scn, '«Συνεργάτης» with nothing picked: the own-vehicle preview is gone', !(await prevText()), await prevText());
  await page.click(`${HDLG} [data-vmode="own"]`);
  await page.waitForTimeout(300);
  // «ίδιος οδηγός»: driver 32 picked; ON → the disabled control shows the current driver (31), no driver hint; OFF → 32
  const drv = () => page.evaluate((d) => { const s = document.querySelector(`${d} #wn5h-driver`), q = document.querySelector(`${d} #wn5h-driver__q`);
    return { v: s.value, dis: s.disabled, shown: q ? q.value : s.options[s.selectedIndex] && s.options[s.selectedIndex].textContent, qdis: q ? q.disabled : null }; }, HDLG);
  await page.click(`${HDLG} #wn5h-same`);
  await page.waitForTimeout(300);
  const on = await drv();
  ok(scn, '«ίδιος οδηγός» ON: the disabled driver control shows «Driver Test 01», as the switch label', on.v === '31' && on.dis && on.shown === 'Driver Test 01'
    && (await K.text(page, `${HDLG} .wn5h-same`)).includes('Driver Test 01') && JSON.stringify(await hint('driver')) === '["",false]', [on, await hint('driver')]);
  await page.waitForTimeout(1000);
  const sameDry = posts(S).filter((x) => x.body.dry_run === true).pop();
  ok(scn, '«ίδιος οδηγός» ON: the dry run sends same_driver and no driver_id', !!sameDry && sameDry.body.same_driver === true && !('driver_id' in sameDry.body.vehicle), sameDry && sameDry.body);
  await page.click(`${HDLG} #wn5h-same`);
  await page.waitForTimeout(300);
  const off = await drv();
  ok(scn, '«ίδιος οδηγός» OFF: the pick «Driver Test 02» comes back, enabled', off.v === '32' && !off.dis && off.shown === 'Driver Test 02', off);
  ok(scn, 'fidelity: no page or console errors', !S.pageErrors.length && !appConsole(S).length, S.pageErrors.concat(appConsole(S)));
  await page.context().close();

  // RT-T102 moved to Τρί 20:00 with the same truck and driver: «ελεύθερο ως Τρί 20:00»; at Τρί 21:00 it is in use → no
  // hint (the dry run's truck_busy speaks, not a guess here).
  const bw = oneSegWeek();
  Object.assign(bw.cycles[1], { start_at: '2026-10-13T20:00:00+03:00' });
  Object.assign(bw.cycles[1].segments[0], { from_at: '2026-10-13T20:00:00+03:00' });
  const pw = await K.openApp(browser, origin, { board: bw, plan: { 'POST /plan/rt/101/handover': (e) => dryOk(e.body) } });
  await pw.page.evaluate(() => WN5Hand.change(101));
  await pw.page.waitForSelector(HDLG, { timeout: 6000 }).catch(() => {});
  await fillChange(pw.page, CH);
  await pw.page.waitForTimeout(300);
  const h1 = await pw.page.evaluate((d) => document.querySelector(`${d} [data-hint="truck"]`).textContent, HDLG);
  await fillChange(pw.page, Object.assign({}, CH, { hm: '21:00' }));
  await pw.page.waitForTimeout(300);
  const h2 = await pw.page.evaluate((d) => [document.querySelector(`${d} [data-hint="truck"]`).textContent, document.querySelector(`${d} [data-hint="driver"]`).textContent], HDLG);
  ok(scn, 'next use in the week: «ελεύθερο ως Τρί 20:00»; in use at the change time → no hint', h1 === 'ελεύθερο ως Τρί 20:00' && h2.join('|') === '|', [h1, h2]);
  ok(scn, 'hints: no page or console errors', !pw.S.pageErrors.length && !appConsole(pw.S).length, pw.S.pageErrors.concat(appConsole(pw.S)));
  await pw.page.context().close();
}

// T26 — removal (conflict first, then the shared two-step), the plan_rt_update token, clear with segments.
const RDLG = '.wi4-dlg[data-wn5="remove"]';
const toasts = (page) => page.evaluate(() => (window.__ev || []).filter((x) => x.k === 'toast').map((x) => x.a[0]));
async function scnRemove({ browser, origin, ok, scn }) {
  let n = 0;
  const plan = {
    'POST /plan/segments/702/remove': (e) => (e.body.dry_run === true
      ? [200, { ok: true, op: 'plan_seg_remove', dry_run: true, needs_confirm: true, confirm_token: 'tok-702',
        consequences: [{ kind: 'payroll_amount', rt_id: 101, dl_entry_id: 9, driver_id: 32, month: '2026-10' }, { kind: 'costs', rt_id: 101, pay_source: 'DKV', count: 2 }],
        preview: { segments: [seg(701, null, '2026-10-12T16:00:00+03:00', '2026-10-13T22:00:00+03:00', { stop_ids: [1001, 1002, 1003, 1004, 1005] })], warnings: [], conflict: null } }]
      : [200, { ok: true, op: 'plan_seg_remove', dry_run: false, ids: { rt_id: 101, segment_id: 702, prev_segment_id: 701 }, warnings: [], notice_ids: [], replayed: ++n > 1 }]),
    'POST /plan/segments/701/remove': () => K.planErr(422, 'PLAN_RULE', 'seg_first'),
  };
  const { page, S } = await K.openApp(browser, origin, { board: handWeek(false), role: 'dispatcher', plan });
  if (!(await guard(page, ok, scn, 'WN5Hand'))) return;
  await page.evaluate(() => WN5Hand.cycleCard(101));
  await page.waitForSelector('.wi4-dlg[data-wn5="cycle"]', { timeout: 6000 }).catch(() => {});
  await page.click('.wi4-dlg[data-wn5="cycle"] [data-act="remove"][data-seg="702"]');
  await page.waitForSelector(`${RDLG} .wn5-cons li`, { timeout: 6000 }).catch(() => {});
  const cons = await page.evaluate((D) => [...document.querySelectorAll(`${D} .wn5-cons li[data-kind]`)].map((x) => [x.dataset.kind, x.textContent]), RDLG);
  ok(scn, 'the H4 list: payroll line without an amount for the dispatcher, the DKV line', cons.length === 2 && cons.some((c) => c[0] === 'payroll_amount') && cons.every((c) => !/€|\d+,\d\d/.test(c[1])), cons);
  const h4 = await page.evaluate((D) => ({ t: (document.querySelector(`${D} .wi4-dlg-t`) || {}).textContent || '',
    what: [...document.querySelectorAll(`${D} .wn5-cons li[data-row="what"]`)].map((x) => x.textContent),
    tok: (document.querySelector(`${D} .wn5-dlg-b > p.wn5-tok:last-child`) || {}).textContent || '',
    verb: (document.querySelector(`${D} [data-act="confirm"].wn5-danger`) || {}).textContent || '' }), RDLG);
  ok(scn, 'H4 title «Αφαίρεση αλλαγής · RT-T101 · Λαμία Τρί 03:00;»', h4.t === 'Αφαίρεση αλλαγής · RT-T101 · Λαμία Τρί 03:00;', h4.t);
  ok(scn, 'H4 «Τι θα γίνει»: segment out, previous vehicle again to the end, payroll, DKV without notice, loads stay',
    JSON.stringify(h4.what) === JSON.stringify(['ΤΕΛΙΚΟ (TST-2108 · Driver Test 02) → αφαιρείται', 'TST-2104 · Driver Test 01 → ξανά ως Τρί 22:00',
      'η μισθοδοσία του Driver Test 02 σβήνεται', 'DKV: οι 2 γραμμές μένουν χωρίς δρομολόγιο', 'φορτία και στάσεις δεν αλλάζουν']), h4.what);
  ok(scn, 'the token note last in the body, and the red «Αφαίρεση»', h4.tok === 'Αν αλλάξει κάτι στο μεταξύ, η λίστα ξαναβγαίνει.' && h4.verb === 'Αφαίρεση', h4);
  await page.click(`${RDLG} [data-act="confirm"]`).catch(() => {});
  await page.waitForTimeout(1200);
  const all = K.planOf(S, 'POST', '/plan/segments/702/remove');
  const ex = all.filter((x) => x.body.dry_run !== true);
  ok(scn, 'conflict check + the two-step\'s dry run, then ONE execution with the token, no request_id', all.length === 3 && ex.length === 1 && ex[0].body.confirm_token === 'tok-702' && !('request_id' in ex[0].body), all.map((x) => x.body));
  // a second press of the same removal: the base answers replayed:true — the same success, no error
  await page.evaluate(() => { WN5Hand.remove(702); });   // not awaited: it resolves only after the confirm
  await page.waitForSelector(`${RDLG} [data-act="confirm"]`, { timeout: 6000 }).catch(() => {});
  await page.click(`${RDLG} [data-act="confirm"]`).catch(() => {});
  await page.waitForTimeout(1200);
  const ts = await toasts(page);
  ok(scn, 'replayed:true = the same success (two success toasts, the second says the first press was saved)',
    ts.filter((x) => /Η αλλαγή οχήματος αφαιρέθηκε/.test(x)).length === 2 && /είχε ήδη αποθηκευτεί/.test(ts[ts.length - 1] || ''), ts);
  await page.evaluate(() => WN5Hand.remove(701));
  await page.waitForTimeout(1000);
  ok(scn, 'removing the ΑΡΧΙΚΟ → seg_first, the Worker message', /rig sentinel seg_first/.test(await K.text(page, RDLG)));
  ok(scn, 'no page or console errors', !S.pageErrors.length && !appConsole(S).length, S.pageErrors.concat(appConsole(S)));
  await page.context().close();
  // a preview conflict refuses before any list
  const p2 = await K.openApp(browser, origin, { board: handWeek(false), plan: { 'POST /plan/segments/702/remove': () => [200, { ok: true, op: 'plan_seg_remove', dry_run: true,
    preview: { segments: null, warnings: [], conflict: { code: 'truck_busy', sqlstate: '23P01', detail: '', message: 'rig sentinel truck_busy' } } }] } });
  await p2.page.evaluate(() => WN5Hand.remove(702));
  await p2.page.waitForTimeout(1000);
  ok(scn, 'preview.conflict → the H7 strip «ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ · message», no list, no confirm, one request only',
    /^ΔΕΝ ΑΠΟΘΗΚΕΥΤΗΚΕ\s*rig sentinel truck_busy/.test(await K.text(p2.page, `${RDLG} [data-strip] .wn5-strip[data-kind="refusal"]`))
    && await K.count(p2.page, '.wn5-cons li') === 0 && await K.count(p2.page, '[data-act="confirm"]') === 0 && K.planOf(p2.S, 'POST', '/plan/segments/702/remove').length === 1);
  ok(scn, 'conflict: no page or console errors', !p2.S.pageErrors.length && !appConsole(p2.S).length, p2.S.pageErrors.concat(appConsole(p2.S)));
  await p2.page.context().close();
}
async function scnRtToken({ browser, origin, ok, scn }) {
  let tok = 0, exn = 0;
  const plan = { 'PATCH /plan/rt/101': (e) => (e.body.dry_run === true
    ? [200, { ok: true, op: 'plan_rt_update', dry_run: true, needs_confirm: true, confirm_token: 'tok-rt-' + (++tok),
      consequences: [{ kind: 'seg_removed', rt_id: 101, code: 'RT-T101', segment_id: 702, at: '2026-10-13T00:00:00Z', at_athens: '13/10 03:00', place_note: 'Λαμία', reason: 'vehicle_breakdown' }],
      preview: { before: {}, after: {}, next_rt: null, conflict: null, vs_day: [], warnings: [] } }]
    // the first execution meets a changed list (422 stale_confirm), the next one the closed writes (as until day L)
    : (++exn === 1 ? K.planErr(422, 'PLAN_RULE', 'stale_confirm') : K.planErr(409, 'WRITES_CLOSED', 'writes_closed'))) };
  const { page, S } = await K.openApp(browser, origin, { board: handWeek(false), plan });
  if (!(await guard(page, ok, scn, 'WN5Act'))) return;
  const D = '.wi4-dlg[data-wn5="date"]';
  await page.evaluate(() => WN5Act.datePanel(101, 'KATHODOS', document.querySelector('#content .wn5-row[data-rt="101"]')));
  await page.waitForSelector(D, { timeout: 6000 }).catch(() => {});
  const setDay = async (d) => { await page.click(`${D} [data-act="day"][data-day="${d}"]`).catch(() => {}); await page.waitForTimeout(1200); };
  const save = () => page.evaluate((D) => { const b = document.querySelector(`${D} [data-act="save"]`); return b ? { dis: b.disabled, t: b.textContent } : null; }, D);
  await setDay('2026-10-13');
  ok(scn, 'the dry run lists «θα αφαιρεθεί η αλλαγή οχήματος Λαμία 13/10 03:00»', /θα αφαιρεθεί η αλλαγή οχήματος Λαμία 13\/10 03:00/.test(await K.text(page, D)) && await K.count(page, `${D} .wn5-cons li[data-kind="seg_removed"]`) === 1);
  const s1 = await save();
  ok(scn, 'the save says «Αποθήκευση · επιβεβαίωση» and is on', !!s1 && !s1.dis && s1.t === 'Αποθήκευση · επιβεβαίωση', s1);
  // an edit of the window after the dry run (no dry run yet for it): the token dies, the list goes, the save is off
  await page.evaluate((D) => { const i = document.querySelector(`${D} [data-win="from"]`); if (i) { i.value = '15:00'; i.dispatchEvent(new Event('input', { bubbles: true })); } }, D);
  const s2 = await save();
  ok(scn, 'an edit after the dry run: no list, the save off until the next dry run', !!s2 && s2.dis && await K.count(page, `${D} .wn5-cons li[data-kind="seg_removed"]`) === 0, s2);
  await page.evaluate((D) => { const i = document.querySelector(`${D} [data-win="from"]`); if (i) { i.value = '16:00'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } }, D);
  await page.waitForTimeout(1200);
  await setDay('2026-10-14');   // another edit: the old token must die
  await page.click(`${D} [data-act="save"]`).catch(() => {});
  await page.waitForTimeout(1500);
  let pat = K.planOf(S, 'PATCH', '/plan/rt/101');
  let ex = pat.filter((x) => x.body.dry_run !== true);
  ok(scn, 'after an edit the save runs on a NEW dry run: the execution carries the latest token', pat.filter((x) => x.body.dry_run === true).length >= 3 && ex.length === 1 && ex[0].body.confirm_token === 'tok-rt-3' && !('dry_run' in ex[0].body), pat.map((x) => x.body));
  // 422 stale_confirm → a new dry run by itself, the new list, the strip says why; the next press sends the new token
  ok(scn, 'stale_confirm → a new dry run (tok-rt-4), the strip stays, the save is on again', tok === 4 && await K.count(page, `${D} .wn5-strip`) === 1 && !(await save()).dis, { tok, strip: await K.text(page, `${D} .wn5-strip`) });
  await page.click(`${D} [data-act="save"]`).catch(() => {});
  await page.waitForTimeout(1200);
  pat = K.planOf(S, 'PATCH', '/plan/rt/101');
  ex = pat.filter((x) => x.body.dry_run !== true);
  ok(scn, 'the second execution carries the new token tok-rt-4; 409 → the preview strip', ex.length === 2 && ex[1].body.confirm_token === 'tok-rt-4' && /ΠΡΟΕΠΙΣΚΟΠΗΣΗ/.test(await K.text(page, `${D} .wn5-strip`)), ex.map((x) => x.body));
  ok(scn, 'no page or console errors', !S.pageErrors.length && !appConsole(S).length, S.pageErrors.concat(appConsole(S)));
  await page.context().close();
}
async function scnClearSeg({ browser, origin, ok, scn }) {
  const PAY = (d) => ({ kind: 'payroll_amount', rt_id: 101, dl_entry_id: d, driver_id: d, month: '2026-10' });
  const plan = { 'POST /plan/rt/101/clear': (e) => (e.body.dry_run === true
    ? [200, { ok: true, op: 'plan_rt_clear', dry_run: true, needs_confirm: true, confirm_token: 'tok-clr', consequences: [PAY(31), PAY(32), { kind: 'costs', rt_id: 101, pay_source: 'DKV', count: 2 }] }]
    : K.planErr(409, 'WRITES_CLOSED', 'writes_closed')) };
  const { page, S } = await K.openApp(browser, origin, { board: handWeek(false), role: 'dispatcher', plan });
  if (!(await guard(page, ok, scn, 'WN5Hand'))) return;
  const D = '.wi4-dlg[data-wn5="clear"]';
  await page.evaluate(() => WN5Hand.cycleCard(101));
  await page.waitForSelector('.wi4-dlg[data-wn5="cycle"]', { timeout: 6000 }).catch(() => {});
  await page.click('.wi4-dlg[data-wn5="cycle"] [data-act="clear"]');
  await page.waitForSelector(`${D} [data-act="confirm"]`, { timeout: 6000 }).catch(() => {});
  const g = await page.evaluate((D) => ({ t: (document.querySelector(`${D} .wi4-dlg-t`) || {}).textContent || '', body: (document.querySelector(`${D} .wn5-dlg-b`) || {}).textContent || '',
    what: [...document.querySelectorAll(`${D} .wn5-cons li[data-row="what"]`)].map((x) => x.textContent), tok: !!document.querySelector(`${D} p.wn5-tok`),
    card: !!document.querySelector('.wi4-dlg[data-wn5="cycle"]') }), D);
  ok(scn, 'H6: the card gives way to the shared clear dialog «Καθαρισμός ανάθεσης · RT-T101;»', !g.card && g.t === 'Καθαρισμός ανάθεσης · RT-T101;', g.t);
  ok(scn, '«σβήνονται και τα 2 τμήματα (ΑΡΧΙΚΟ, ΤΕΛΙΚΟ)», «ο κύκλος μένει με ένα τμήμα χωρίς ανάθεση», 2 payroll lines, DKV notice, loads stay',
    JSON.stringify(g.what) === JSON.stringify(['σβήνονται και τα 2 τμήματα (ΑΡΧΙΚΟ, ΤΕΛΙΚΟ)', 'ο κύκλος μένει με ένα τμήμα χωρίς ανάθεση', 'οι 2 γραμμές μισθοδοσίας σβήνονται',
      'DKV: οι 2 γραμμές μένουν χωρίς δρομολόγιο → ειδοποίηση', 'φορτία και στάσεις δεν αλλάζουν']), g.what);
  ok(scn, 'no Δ5 line in H6, the token note at the end', !g.body.includes('Λάθος ανάθεση') && g.tok, g.body.slice(0, 300));
  const before = K.planOf(S, 'POST', '/plan/rt/101/clear');
  ok(scn, 'nothing written before «Καθαρισμός»: only its dry run', before.length === 1 && before[0].body.dry_run === true, before.map((x) => x.body));
  await page.click(`${D} [data-act="confirm"]`);
  await page.waitForTimeout(1200);
  const all = K.planOf(S, 'POST', '/plan/rt/101/clear');
  ok(scn, '«Καθαρισμός» → the execution with the token', all.length === 2 && all[1].body.confirm_token === 'tok-clr' && all[1].body.dry_run !== true, all.map((x) => x.body));
  ok(scn, 'no page or console errors', !S.pageErrors.length && !appConsole(S).length, S.pageErrors.concat(appConsole(S)));
  await page.context().close();
  // no document on the cycle: the H6 list still shows before anything is written (the segments that go are said)
  const p2 = await K.openApp(browser, origin, { board: handWeek(false) });
  await p2.page.evaluate(() => WN5Hand.cycleCard(101));
  await p2.page.waitForSelector('.wi4-dlg[data-wn5="cycle"]', { timeout: 6000 }).catch(() => {});
  await p2.page.click('.wi4-dlg[data-wn5="cycle"] [data-act="clear"]');
  await p2.page.waitForSelector(`${D} [data-act="confirm"]`, { timeout: 6000 }).catch(() => {});
  const w2 = await K.text(p2.page, D);
  ok(scn, 'an empty base list: the H6 dialog still opens, only the dry run sent', w2.includes('σβήνονται και τα 2 τμήματα (ΑΡΧΙΚΟ, ΤΕΛΙΚΟ)')
    && K.planOf(p2.S, 'POST', '/plan/rt/101/clear').length === 1, w2.slice(0, 300));
  // a one-segment cycle stays exactly today: the Δ5 clear (no H6 rows)
  await p2.page.evaluate(() => WN5Act.closeAll());
  await p2.page.evaluate(() => WN5Hand.cycleCard(102));
  await p2.page.waitForSelector('.wi4-dlg[data-wn5="cycle"]', { timeout: 6000 }).catch(() => {});
  await p2.page.click('.wi4-dlg[data-wn5="cycle"] [data-act="clear"]');
  await p2.page.waitForTimeout(1200);
  const one = K.planOf(p2.S, 'POST', '/plan/rt/102/clear');
  ok(scn, 'one segment = today: an empty list clears at once (dry run, then the execution), no H6 dialog', one.length === 2 && one[0].body.dry_run === true && await K.count(p2.page, D) === 0, one.map((x) => x.body));
  ok(scn, 'p2: no page or console errors', !p2.S.pageErrors.length && !appConsole(p2.S).length, p2.S.pageErrors.concat(appConsole(p2.S)));
  await p2.page.context().close();
}

const SCN = { tiles: scnTiles, card: scnCard, change: scnChange, fix: scnFix, h7: scnH7, fid: scnFid, remove: scnRemove, 'rt-token': scnRtToken, 'clear-seg': scnClearSeg };
module.exports = { seg, handWeek, ROW, HAND, guard, appConsole, SCN };
if (require.main === module) {
  K.run({ scenarios: SCN, globals: ['WN5L', 'WN5Lab', 'WN5Hand'], go: 'the vehicle handover screens hold on the 072b stub' })
    .catch((e) => { console.error(e); process.exit(1); });
}
