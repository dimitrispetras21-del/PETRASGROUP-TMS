// Shots + measurements — the Veroia board, live panel («before») vs the design variants A and B (usability test 2/11
// §3.5–3.8; draft for the owner's choice). The real app on a synthetic week (public repo: no real names), 1440×900,
// the variant switched by localStorage tms_wn5_hub_v as a user would. Measured per variant, never by eye:
//   rows  — list rows fully visible in the panel without scrolling it
//   words — words on the open panel (#wn5-hub innerText)
//   clicks / keys — from the open panel to the POST /plan/legs that loads VS-T232 (Tue 13/10) on TST-2108 (Tue)
// Usage: node tests/critics/wn5-veroia-variants-shots.js [before A B] --shots <dir>   (writes <dir>/measures.json)
'use strict';
const fs = require('fs');
const K = require('./wn5-rig-kit.js');

const OK = (op, ids) => [200, { ok: true, op, ids: ids || {}, warnings: [], notice_ids: [] }];
const VS = { kind: 'vs_import', order_id: 2301, nat_order_id: null, order_stop_id: null, reference: 'VS-T231', client_id: 42, client: 'ΠΕΛΑΤΗΣ Β',
  temperature_c: 2, is_stock: false, leave_by: null, overdue: false, inbound_rt_id: null, for_split: true, pallet_exchange: false, price: null,
  position_location_id: 1, nat_from_location_id: 1, load_from: null, load_to: null, deliver_from: null, deliver_to: null };
// one client on every VS row (§3.6: the international client is the same on all of them), 12 rows over four days,
// two late, two stock (one overdue), two VS at Veroia not sent yet (P-11: ΠΡΟΣ ΑΝΑΘΕΣΗ rows, only counted)
function board() {
  const b = K.week();
  let n = 0;
  const vs = (ready, due, loc, pal, o) => Object.assign({}, VS, { piece_id: 4500 + n, shipment_id: 5500 + n, order_id: 2300 + n, reference: 'VS-T2' + (30 + n++),
    nat_to_location_id: loc, nat_ready_day: ready, nat_due_day: due, pallets: pal }, o || {});
  b.hub = [
    vs('2026-10-11', '2026-10-12', 4, 6, { overdue: true }), vs('2026-10-11', '2026-10-12', 5, 4, { overdue: true }),
    vs('2026-10-13', '2026-10-14', 2, 8), vs('2026-10-13', '2026-10-14', 3, 5), vs('2026-10-13', '2026-10-14', 4, 3, { temperature_c: 4 }), vs('2026-10-13', '2026-10-14', 5, 6),
    vs('2026-10-14', '2026-10-15', 2, 7), vs('2026-10-14', '2026-10-15', 3, 4), vs('2026-10-14', '2026-10-15', 4, 9),
    vs('2026-10-15', '2026-10-16', 2, 5), vs('2026-10-15', '2026-10-16', 5, 6), vs('2026-10-15', '2026-10-16', 3, 3),
    vs('2026-10-13', '2026-10-14', 2, 10, { for_split: false }), vs('2026-10-14', '2026-10-15', 3, 12, { for_split: false }),
    Object.assign({}, VS, { piece_id: 4600, shipment_id: 5600, kind: 'national', order_id: null, nat_order_id: 3600, reference: 'N-T600', client: 'ΠΕΛΑΤΗΣ Α', client_id: 41,
      is_stock: true, for_split: false, leave_by: '2026-10-12', overdue: true, pallets: 4, nat_to_location_id: 4, nat_ready_day: '2026-10-11', nat_due_day: '2026-10-13' }),
    Object.assign({}, VS, { piece_id: 4601, shipment_id: 5601, kind: 'national', order_id: null, nat_order_id: 3601, reference: 'N-T601', client: 'ΠΕΛΑΤΗΣ Γ', client_id: 43,
      is_stock: true, for_split: false, leave_by: '2026-10-14', pallets: 6, nat_to_location_id: 5, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-15' }),
  ];
  // TST-2108 loads at Veroia Tue 13/10 16:00–18:00 (12 pallets on), delivers in Larisa Wed
  const L = { kind: 'vs_import', order_id: 2401, reference: 'VS-T401', client: 'ΠΕΛΑΤΗΣ Β', client_id: 42 };
  b.cycles.push({ rt_id: 104, code: 'RT-T104', trip_type: 'OWNED', truck_id: 12, truck: 'TST-2108', trailer_id: 22, trailer: 'TRL-5104', driver_id: 32, driver: 'Driver Test 02',
    partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-13T16:00:00+03:00', end_at: '2026-10-14T09:00:00+03:00', date_start: '2026-10-13', date_end: '2026-10-14', ended: false,
    stops: [K.stop(1301, 1, 'KATHODOS', 1, '2026-10-13T16:00:00+03:00', '2026-10-13T18:00:00+03:00', [K.leg(5301, 4301, 'load', 12, L)]),
      K.stop(1302, 2, 'KATHODOS', 4, '2026-10-14T07:00:00+03:00', '2026-10-14T09:00:00+03:00', [K.leg(5301, 4301, 'unload', 12, L)])] });
  return b;
}
const TARGET = 4502;   // VS of Tue 13/10 → ATHENS TEST, 8 pallets

async function open(browser, origin, V) {
  const o = await K.openApp(browser, origin, { board: board(), viewport: { width: 1440, height: 900 }, plan: { 'POST /plan/legs': async () => OK('plan_put_pieces', { rt_id: 104 }) } });
  await o.page.evaluate((v) => { if (v) localStorage.setItem('tms_wn5_hub_v', v); else localStorage.removeItem('tms_wn5_hub_v'); }, V);
  await o.page.reload();
  await o.page.waitForSelector('#content > .wi4.wn5[data-state="ok"]', { timeout: 8000 }).catch(() => {});
  return o;
}
const measure = (page) => page.evaluate(() => {
  const hub = document.getElementById('wn5-hub');
  const l = hub && hub.querySelector('.wn5-hub-l');
  const lr = l ? l.getBoundingClientRect() : null;
  const rows = l ? [...l.querySelectorAll('.wn5-hub-it')].filter((r) => { const q = r.getBoundingClientRect(); return q.top >= lr.top - 0.5 && q.bottom <= Math.min(lr.bottom, innerHeight) + 0.5; }).length : 0;
  const words = hub ? hub.innerText.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
  return { rows, rowsTotal: l ? l.querySelectorAll('.wn5-hub-it').length : 0, words, panelH: hub ? Math.round(hub.getBoundingClientRect().height) : 0 };
});

function scenario(V) {
  return async ({ browser, origin, ok, scn, shots }) => {
    const { page, S } = await open(browser, origin, V);
    const line = await page.evaluate(() => { const h = document.getElementById('wn5-hub'); return h ? h.innerText.replace(/\s+/g, ' ').trim() : null; });
    ok(scn, 'the closed line is there', !!line, line);
    if (shots) await page.screenshot({ path: `${shots}/${scn}-1-closed.png` });
    await page.click('#wn5-hub [data-hub="open"]');
    await page.evaluate(() => document.getElementById('wn5-hub').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(150);
    const m = await measure(page);
    if (shots) await page.screenshot({ path: `${shots}/${scn}-2-open.png` });
    // to a truck: count every press and key from the open panel to the POST
    let clicks = 0, keys = 0;
    const click = async (sel) => { await page.click(sel, { timeout: 4000 }); clicks++; await page.waitForTimeout(150); };
    const DLG = '.wn5-dlg.wn5a[data-wn5="assign"]';
    if (V === 'B') {
      await click(`#wn5-hub .wn5-hub-it[data-piece="${TARGET}"] [data-hub="load"]`);
      if (shots) await page.screenshot({ path: `${shots}/${scn}-3-menu.png` });
      await click('.wn5-hub-pop [data-v="rt:104"]');
      if (shots) await page.screenshot({ path: `${shots}/${scn}-4-confirm.png` });
      await click(`#wn5-hub .wn5-hv-askrow[data-ask="${TARGET}"] [data-hub="load-go"]`);
    } else {
      await click(`#wn5-hub .wn5-hub-it[data-piece="${TARGET}"] [data-hub="truck"]`);
      await click(`${DLG} [data-in="tk"]`);
      await page.keyboard.type('2108'); keys += 4;
      await page.waitForSelector('.wn5a-list [data-pick]', { timeout: 3000 }).catch(() => {});
      for (const o of await page.$$('.wn5a-list [data-pick]')) if ((await o.textContent()).startsWith('TST-2108')) { await o.dispatchEvent('mousedown'); clicks++; break; }
      await page.waitForTimeout(150);
      if (shots) await page.screenshot({ path: `${shots}/${scn}-3-form.png` });
      await click(`${DLG} [data-act="save"]`);
    }
    await page.waitForTimeout(500);
    const w = S.plan.filter((x) => x.m === 'POST' && x.path === '/plan/legs');
    ok(scn, `one POST /plan/legs loads ${TARGET} on RT-T104 (${clicks} clicks, ${keys} keys)`, w.length === 1 && JSON.stringify(w[0].body.pieces) === `[{"piece_id":${TARGET}}]`
      && w[0].body.target.rt_id === 104, w.map((x) => x.raw));
    ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
    const out = Object.assign({ variant: V || 'before', closedLine: line, clicks, keys }, m, { body: w[0] ? w[0].body : null });
    console.log('  ' + JSON.stringify(out));
    if (shots) { const f = `${shots}/measures.json`; const all = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; all[scn] = out; fs.writeFileSync(f, JSON.stringify(all, null, 2)); }
    await page.context().close();
  };
}

K.run({ scenarios: { before: scenario(''), A: scenario('A'), B: scenario('B') }, globals: ['WN5', 'WN5Hub'],
  go: 'the Veroia board: before / A / B drawn and measured, each loads the VS on a truck with one POST' });
