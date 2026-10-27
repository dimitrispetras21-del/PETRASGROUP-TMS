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

const SCN = { tiles: scnTiles };
module.exports = { seg, handWeek, ROW, HAND, guard, appConsole, SCN };
if (require.main === module) {
  K.run({ scenarios: SCN, globals: ['WN5L', 'WN5Lab'], go: 'the vehicle handover screens hold on the 072b stub' })
    .catch((e) => { console.error(e); process.exit(1); });
}
