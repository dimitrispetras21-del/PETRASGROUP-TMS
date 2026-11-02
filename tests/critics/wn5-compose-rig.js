// Rig + shots — «Σύνθεση φορτίων» (owner 2/11, draft behind localStorage tms_wn5_compose = '1'). The real app on a
// synthetic week (public repo: no real names), 1440×900. Judged by what reached the fake /plan/* (S.plan is «the
// table»): ONE POST /plan/legs, target new_rt {later: true} — the load without a truck — and then the new load as a
// «ΠΡΟΣ ΑΝΑΘΕΣΗ» row of the Weekly, read back through GET /plan/board (the stub writes the cycle into its board).
// ΚΑΘΟΔΟΣ: three VS deliveries at Veroia; ΑΝΟΔΟΣ: three southern pickups, one of them going on past Veroia (to_hub).
// Clicks are counted from the open panel to the POST. Flag off: the Veroia board as it is (one check).
// Usage: node tests/critics/wn5-compose-rig.js [off kath anod] [--shots <dir>]
'use strict';
const K = require('./wn5-rig-kit.js');

const VS = { kind: 'vs_import', nat_order_id: null, order_stop_id: null, client_id: 42, client: 'ΠΕΛΑΤΗΣ Β', temperature_c: 2, is_stock: false, leave_by: null, overdue: false,
  inbound_rt_id: null, for_split: true, pallet_exchange: false, price: null, position_location_id: 1, nat_from_location_id: 1, load_from: null, load_to: null, deliver_from: null, deliver_to: null };
const NAT = { kind: 'national', order_id: null, order_stop_id: null, client_id: 43, client: 'ΠΕΛΑΤΗΣ Γ', temperature_c: 4, is_stock: false, leave_by: null, overdue: false,
  pallet_exchange: false, price: null, direction: 'ANODOS', deliver_from: null, deliver_to: null };
function board() {
  const b = K.week();
  const vs = (id, ready, due, loc, pal, o) => Object.assign({}, VS, { piece_id: id, shipment_id: id + 1000, order_id: id - 2000, reference: 'VS-T' + id,
    nat_to_location_id: loc, nat_ready_day: ready, nat_due_day: due, pallets: pal }, o || {});
  b.hub = [vs(4801, '2026-10-12', '2026-10-13', 4, 6, { overdue: true }),
    vs(4802, '2026-10-13', '2026-10-14', 2, 8), vs(4803, '2026-10-13', '2026-10-14', 3, 5), vs(4804, '2026-10-13', '2026-10-14', 4, 9, { temperature_c: 4 }), vs(4805, '2026-10-13', '2026-10-14', 5, 4),
    vs(4806, '2026-10-14', '2026-10-15', 2, 7), vs(4807, '2026-10-14', '2026-10-15', 3, 6)];
  // ΑΝΟΔΟΣ waiting in the South: two end at Veroia, one goes on to Thessaloniki (via Veroia)
  const an = (id, pos, to, pal, from, o) => Object.assign({}, NAT, { piece_id: id, shipment_id: id + 1000, nat_order_id: id - 1000, reference: 'N-T' + id, pallets: pal,
    position_location_id: pos, nat_from_location_id: pos, nat_to_location_id: to, nat_ready_day: '2026-10-14', nat_due_day: '2026-10-15',
    load_from: '2026-10-14T' + from + ':00+03:00', load_to: '2026-10-14T' + String(Number(from.slice(0, 2)) + 2).padStart(2, '0') + from.slice(2) + ':00+03:00' }, o || {});
  b.waiting.push(an(4901, 2, 1, 10, '08:00'), an(4902, 3, 1, 8, '11:00', { temperature_c: 2 }), an(4903, 2, 5, 6, '09:00', { client: 'ΠΕΛΑΤΗΣ Α', client_id: 41 }));
  // TST-2108 loads at Veroia Tue 13/10 16:00–18:00 (12 on): «Φορτηγά της ημέρας»
  const L = { kind: 'vs_import', order_id: 2401, reference: 'VS-T401', client: 'ΠΕΛΑΤΗΣ Β', client_id: 42 };
  b.cycles.push({ rt_id: 104, code: 'RT-T104', trip_type: 'OWNED', truck_id: 12, truck: 'TST-2108', trailer_id: 22, trailer: 'TRL-5104', driver_id: 32, driver: 'Driver Test 02',
    partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-13T16:00:00+03:00', end_at: '2026-10-14T09:00:00+03:00', date_start: '2026-10-13', date_end: '2026-10-14', ended: false,
    stops: [K.stop(1301, 1, 'KATHODOS', 1, '2026-10-13T16:00:00+03:00', '2026-10-13T18:00:00+03:00', [K.leg(5301, 4301, 'load', 12, L)]),
      K.stop(1302, 2, 'KATHODOS', 4, '2026-10-14T07:00:00+03:00', '2026-10-14T09:00:00+03:00', [K.leg(5301, 4301, 'unload', 12, L)])] });
  return b;
}
// the stub's «write»: the new cycle with no vehicle, its stops and legs, the pieces off the waiting lists (as 083 + 072)
function write(e, S) {
  const b = e.body, side = b.target.side, rt = 900 + S.plan.filter((x) => x.m === 'POST').length;
  const all = [...S.board.hub, ...S.board.waiting];
  let sid = 9000 + rt * 10, lid = 9500 + rt * 10;
  // has_vehicle false: what plan_board sends for the stops of a load with no vehicle (the kit's stop() says true)
  const stops = b.stops.map((s, i) => Object.assign(K.stop(sid++, i + 1, side, s.location_id, s.planned_from, s.planned_to, []), { has_vehicle: false }));
  const at = (loc) => stops.find((x) => x.location_id === loc);
  for (const p of b.pieces) {
    const it = all.find((x) => x.piece_id === p.piece_id);
    const o = { kind: it.kind, order_id: it.order_id, nat_order_id: it.nat_order_id, reference: it.reference, client: it.client, client_id: it.client_id, temperature_c: it.temperature_c };
    const l = lid++;
    const pick = at(it.position_location_id), drop = at(p.to_hub ? 1 : it.nat_to_location_id);
    if (pick) pick.legs.push(K.leg(l, it.piece_id, 'load', it.pallets, o));
    if (drop) drop.legs.push(K.leg(l, it.piece_id, 'unload', it.pallets, o));
  }
  stops.sort((a, z) => Date.parse(a.planned_from) - Date.parse(z.planned_from)).forEach((s, i) => { s.seq = i + 1; });
  S.board.cycles.push({ rt_id: rt, code: 'RT-T' + rt, trip_type: 'OWNED', truck_id: null, truck: null, trailer_id: null, trailer: null, driver_id: null, driver: null,
    partner_id: null, partner: null, partner_rate: null, start_at: stops[0].planned_from, end_at: stops[stops.length - 1].planned_to, date_start: stops[0].stop_day,
    date_end: stops[stops.length - 1].stop_day, ended: false, stops });
  const ids = new Set(b.pieces.map((p) => p.piece_id));
  S.board.hub = S.board.hub.filter((h) => !ids.has(h.piece_id));
  S.board.waiting = S.board.waiting.filter((w) => !ids.has(w.piece_id));
  return [200, { ok: true, op: 'plan_put_pieces', ids: { rt_id: rt }, warnings: [], notice_ids: [] }];
}
async function open(browser, origin, flag) {
  const o = await K.openApp(browser, origin, { board: board(), viewport: { width: 1440, height: 900 }, plan: { 'POST /plan/legs': async (e, S) => write(e, S) } });
  await o.page.evaluate((f) => { if (f) localStorage.setItem('tms_wn5_compose', '1'); else localStorage.removeItem('tms_wn5_compose'); }, flag);
  await o.page.reload();
  await o.page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  o.S.plan.length = 0;
  return o;
}
const txt = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);

async function off({ browser, origin, ok, scn }) {
  const { page, S } = await open(browser, origin, false);
  const t = await txt(page, '#wn5-hub');
  ok(scn, 'flag off: the Veroia board as it is («ΒΕΡΟΙΑ», no «ΣΥΝΘΕΣΗ»)', !!t && /^ΒΕΡΟΙΑ/.test(t) && !/ΣΥΝΘΕΣΗ/.test(t), t);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

function sideScn(side) {
  const ids = side === 'KATHODOS' ? [4802, 4803, 4805] : [4901, 4902, 4903];
  return async ({ browser, origin, ok, scn, shots }) => {
    const { page, S } = await open(browser, origin, true);
    const line = await txt(page, '#wn5-hub');
    ok(scn, 'closed: «ΣΥΝΘΕΣΗ ΦΟΡΤΙΩΝ · ΚΑΘΟΔΟΣ 7 στη Βέροια … · ΑΝΟΔΟΣ 3 προς Βέροια …»', /^ΣΥΝΘΕΣΗ ΦΟΡΤΙΩΝ · ΚΑΘΟΔΟΣ 7 στη Βέροια · 45π · ΑΝΟΔΟΣ 3 προς Βέροια · 24π/.test(line || ''), line);
    if (shots) await page.screenshot({ path: `${shots}/${scn}-1-closed.png` });
    await page.click('#wn5-hub [data-cmp="open"]');
    await page.evaluate(() => document.getElementById('wn5-hub').scrollIntoView({ block: 'start' }));
    let clicks = 0;
    const click = async (sel) => { await page.click(sel, { timeout: 4000 }); clicks++; await page.waitForTimeout(120); };
    if (side === 'ANODOS') await click('#wn5-hub .wn5-cmp-tab[data-side="ANODOS"]');
    const empty = await txt(page, '#wn5-hub .wn5-cb');
    ok(scn, 'the load being built, empty: says to tick and that it goes to the Weekly «προς ανάθεση»', /Τσέκαρε φορτία αριστερά/.test(empty || '') && /προς ανάθεση/.test(empty || ''), empty);
    const hid = await page.$eval('#wn5-hub .wn5-cr .wn5-cr-acts', (e) => getComputedStyle(e).visibility).catch(() => null);
    ok(scn, 'a row\'s «Σε φορτηγό ▾» is hidden until the row is hovered or ticked', hid === 'hidden', hid);
    for (const id of ids) await click(`#wn5-hub .wn5-cr[data-piece="${id}"] .wn5-hub-ck`);
    await page.mouse.move(1300, 880);
    const b = await txt(page, '#wn5-hub .wn5-cb');
    const go = await page.$eval('#wn5-hub [data-act="cmp-create"]', (x) => ({ off: x.disabled, t: x.textContent })).catch(() => null);
    ok(scn, 'three ticked: stops in road order, the bar against 33, «Δημιουργία φορτίου … → προς ανάθεση» on', !!go && !go.off && /→ προς ανάθεση$/.test(go.t) && /\/33/.test(b || ''), { go, b });
    if (shots) await page.screenshot({ path: `${shots}/${scn}-2-building.png` });
    if (side === 'KATHODOS') {
      await page.click('#wn5-hub [data-cmp="trucks"]');
      if (shots) await page.screenshot({ path: `${shots}/${scn}-2b-day-trucks.png` });
      await page.click('#wn5-hub [data-cmp="trucks"]');
    }
    await click('#wn5-hub [data-act="cmp-create"]');
    await page.waitForTimeout(700);
    const w = S.plan.filter((x) => x.m === 'POST' && x.path === '/plan/legs');
    const body = w[0] && w[0].body;
    ok(scn, `ONE POST /plan/legs, target new_rt {later: true} side ${side}, the three pieces (${clicks} clicks)`, w.length === 1 && !!body
      && JSON.stringify(body.target) === JSON.stringify({ new_rt: { trip_type: 'OWNED', later: true }, side })
      && JSON.stringify(body.pieces.map((p) => p.piece_id).sort()) === JSON.stringify(ids.slice().sort()), w.map((x) => x.raw));
    if (side === 'ANODOS') {
      ok(scn, 'ΑΝΟΔΟΣ: the piece going on to Thessaloniki carries to_hub (cross-docked at Veroia), the two ending at Veroia do not',
        !!body && JSON.stringify(body.pieces) === '[{"piece_id":4901},{"piece_id":4902},{"piece_id":4903,"to_hub":true}]', body && body.pieces);
      const locs = body ? body.stops.map((s) => s.location_id).sort() : [];
      ok(scn, 'ΑΝΟΔΟΣ: stops = the two southern pickups + Veroia, nothing past Veroia', JSON.stringify(locs) === '[1,2,3]', body && body.stops);
    }
    const reread = S.plan.filter((x) => x.m === 'GET' && x.path === '/plan/board').length;
    const row = await page.evaluate(() => { const r = [...document.querySelectorAll('#content .wn5-row[data-rt]')].find((x) => Number(x.dataset.rt) >= 900); if (!r) return null; r.scrollIntoView({ block: 'center' }); return r.innerText.replace(/\s+/g, ' ').trim(); });
    ok(scn, 'after the 200: the board read again, the new load a «ΠΡΟΣ ΑΝΑΘΕΣΗ» row of the Weekly', reread >= 1 && !!row && /ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(row), { reread, row });
    await page.waitForTimeout(200);
    if (shots) await page.screenshot({ path: `${shots}/${scn}-3-weekly-row.png` });
    ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
    console.log(`  clicks from the open panel to the POST: ${clicks}`);
    await page.context().close();
  };
}

K.run({ scenarios: { off, kath: sideScn('KATHODOS'), anod: sideScn('ANODOS') }, globals: ['WN5', 'WN5Hub', 'WN5Compose'],
  go: '«Σύνθεση φορτίων»: a load of 3 pieces without a truck, ΚΑΘΟΔΟΣ and ΑΝΟΔΟΣ, one POST each, then ΠΡΟΣ ΑΝΑΘΕΣΗ on the Weekly' });
