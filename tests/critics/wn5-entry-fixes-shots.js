// Screenshots before / after of the entry-test findings 25/11 (owner rule 8/11: screenshot + table of differences).
// The SAME synthetic scenario on two trees:
//   WN5_SHOT_TAG=before WN5_TREE=<git archive of origin/main> node tests/critics/wn5-entry-fixes-shots.js --shots <dir>
//   WN5_SHOT_TAG=after  node tests/critics/wn5-entry-fixes-shots.js --shots <dir>
// Each scenario saves <dir>/<tag>-<item>.png and prints one «FACTS» line per item (what a reader compares: the words
// on screen, the focus, the requests sent). Never fails a check: it records what each tree does. Synthetic data only.
'use strict';
const K = require('./wn5-rig-kit.js');

const TAG = process.env.WN5_SHOT_TAG || 'shot';
const OK = (op, ids) => [200, { ok: true, op, ids: ids || {}, warnings: [], notice_ids: [] }];
const PLUS = '.wn5-dlg[data-wn5="plus"]';
const DLG = '.wn5-dlg.wn5a[data-wn5="assign"]';
const ORDER = '.wi4-dlg[role="dialog"][data-wn5="order"]';
const facts = (item, o) => console.log('FACTS ' + TAG + ' ' + item + ' ' + JSON.stringify(o));
async function shot(page, shots, item, clip) {
  if (!shots) return;
  const el = clip ? await page.$(clip) : null;
  if (el) await el.screenshot({ path: `${shots}/${TAG}-${item}.png` }).catch(() => page.screenshot({ path: `${shots}/${TAG}-${item}.png` }));
  else await page.screenshot({ path: `${shots}/${TAG}-${item}.png` });
}

// ΑΝΟΔΟΣ requests towards Veroia (location 1) of four orders, one of three weeks ago, and a second trip of TST-2108 on
// Wed 14/10 (the truck of RT-T102): the busy warning of every Wed request.
function anodBoard() {
  const b = K.week();
  const req = (piece_id, nat_order_id, client, ref, day, pallets) => ({ piece_id, shipment_id: piece_id + 1000, kind: 'national', order_id: null, nat_order_id,
    order_stop_id: null, pallets, leave_by: null, position_location_id: 3, nat_from_location_id: 3, nat_to_location_id: 1, nat_ready_day: day, nat_due_day: day,
    overdue: false, is_stock: false, client_id: 41, client, reference: ref, temperature_c: 4, pallet_exchange: false, load_from: null, load_to: null,
    deliver_from: null, deliver_to: null, price: null });
  b.waiting.push(req(4301, 3301, 'ΠΕΛΑΤΗΣ ΠΑΛΙΟΣ', '6100120001', '2026-09-23', 4), req(4302, 3302, 'ΠΕΛΑΤΗΣ Γ', '6100136865', '2026-10-14', 6),
    req(4303, 3302, 'ΠΕΛΑΤΗΣ Γ', '6100136865', '2026-10-14', 3), req(4304, 3303, 'ΠΕΛΑΤΗΣ Α', '6100139999', '2026-10-15', 5), req(4305, 3304, 'ΠΕΛΑΤΗΣ Β', '6100130003', '2026-10-10', 2));
  b.cycles.push({ rt_id: 103, code: 'RT-T103', trip_type: 'OWNED', truck_id: 12, truck: 'TST-2108', trailer_id: 22, trailer: 'TRL-5104', driver_id: 32, driver: 'Driver Test 02',
    partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-14T04:00:00+03:00', end_at: '2026-10-14T09:00:00+03:00', date_start: '2026-10-14', date_end: '2026-10-14', ended: false,
    stops: [K.stop(1201, 1, 'KATHODOS', 1, '2026-10-14T04:00:00+03:00', '2026-10-14T05:00:00+03:00', []), K.stop(1202, 2, 'KATHODOS', 4, '2026-10-14T08:00:00+03:00', '2026-10-14T09:00:00+03:00', [])] });
  return b;
}
const plusFacts = (page) => page.evaluate((s) => {
  const d = document.querySelector(s);
  if (!d) return null;
  const vis = (x) => !x.hidden && x.offsetParent !== null;
  return { search: !!d.querySelector('[data-q]'), lines: d.querySelectorAll('.wn5-pline').length,
    heads: [...d.querySelectorAll('.wn5-grp-h')].filter(vis).map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
    busyPerLine: [...d.querySelectorAll('.wn5-pline .wn5-why')].filter((x) => /άλλο δρομολόγιο/.test(x.textContent)).length,
    busyTop: (d.querySelector('[data-pbusy]:not([hidden])') || {}).textContent || null };
}, PLUS);

async function f01_anod({ browser, origin, shots }) {
  const { page } = await K.openApp(browser, origin, { board: anodBoard(), viewport: { width: 1440, height: 900 } });
  await page.click('#content .wn5-row[data-rt="102"] [data-act="plus"][data-side="ANODOS"]');
  await page.waitForSelector(PLUS, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(300);
  facts('01-list', await plusFacts(page));
  await shot(page, shots, '01-anod-list');
  const q = await page.$(`${PLUS} [data-q]`);
  if (q) { await q.type('-6865'); await page.waitForTimeout(150); }
  const seen = await page.evaluate((s) => [...document.querySelectorAll(`${s} .wn5-pline`)].filter((x) => !x.hidden).map((x) => x.title), PLUS);
  facts('01-search', { typed: q ? '-6865' : '(no search box)', visible: seen });
  await shot(page, shots, '01-anod-search');
  await page.context().close();
}
async function f02_keep({ browser, origin, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: anodBoard(), viewport: { width: 1440, height: 900 },
    plan: { 'POST /plan/legs': async () => OK('plan_put_pieces', { rt_id: 102 }) } });
  await page.click('#content .wn5-row[data-rt="102"] [data-act="plus"][data-side="ANODOS"]');
  await page.waitForSelector(PLUS, { timeout: 4000 }).catch(() => {});
  await page.click(`${PLUS} .wn5-pline[data-piece="4302"] [data-act="save"]`).catch(() => {});
  await page.waitForTimeout(1500);
  const open = await page.evaluate((s) => !!document.querySelector(s), PLUS);
  facts('02', { posts: S.plan.filter((x) => x.m === 'POST').map((x) => x.path), open_after_add: open });
  await shot(page, shots, '02-after-add');
  await page.context().close();
}
// the assignment form: what has the focus at open, after a pick by Enter; «Ρηγ» in the driver list
async function f03_04_assign({ browser, origin, shots }) {
  const lk = K.clone(K.LOOKUPS);
  lk.drivers.push({ id: 34, legacy_id: 'recWn5Drv34', full_name: 'Agrigoris Test', active: true }, { id: 35, legacy_id: 'recWn5Drv35', full_name: 'Rigas Test', active: true });
  const { page } = await K.openApp(browser, origin, { lookups: lk, viewport: { width: 1440, height: 900 } });
  await page.click('#content .wn5-row[data-piece="4101"] [data-act="assign"]');
  await page.waitForSelector(DLG, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(200);
  const at0 = await page.evaluate(() => (document.activeElement && (document.activeElement.getAttribute('data-in') || document.activeElement.tagName)) || null);
  await page.keyboard.type('2106');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const at1 = await page.evaluate(() => (document.activeElement && (document.activeElement.getAttribute('data-in') || document.activeElement.tagName)) || null);
  await shot(page, shots, '03-assign-after-truck', DLG);
  const dr = await page.$(`${DLG} [data-in="dr"]`);
  if (dr) { await dr.click({ clickCount: 3 }); await page.keyboard.type('Ρηγ'); await page.waitForTimeout(200); }
  const list = await page.evaluate(() => [...document.querySelectorAll('.wn5a-list [data-pick]')].map((x) => x.firstElementChild.textContent));
  await shot(page, shots, '04-driver-list');
  facts('03', { typed_at_open_goes_to: at0, after_truck_enter_focus: at1 });
  facts('04', { typed: 'Ρηγ', list });
  await page.context().close();
}
// a VS of two deliveries assigned from one of them
async function f05_only({ browser, origin, shots }) {
  const b = K.week();
  const VS = { kind: 'vs_import', order_id: 2201, nat_order_id: null, order_stop_id: null, reference: 'VS-T201', client_id: 42, client: 'ΠΕΛΑΤΗΣ Β', temperature_c: 2,
    is_stock: false, leave_by: null, overdue: false, inbound_rt_id: null, for_split: false, pallet_exchange: false, price: null, position_location_id: 1,
    nat_from_location_id: 1, load_from: null, load_to: null, deliver_from: null, deliver_to: null };
  b.hub = [Object.assign({}, VS, { piece_id: 4201, shipment_id: 5301, pallets: 12, nat_to_location_id: 4, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-13' }),
    Object.assign({}, VS, { piece_id: 4202, shipment_id: 5302, pallets: 10, nat_to_location_id: 5, nat_ready_day: '2026-10-12', nat_due_day: '2026-10-13' })];
  const { page } = await K.openApp(browser, origin, { board: b, viewport: { width: 1440, height: 900 } });
  await page.click('#content .wn5-row[data-piece="4201"] [data-act="assign"]');
  await page.waitForSelector(DLG, { timeout: 4000 }).catch(() => {});
  const band = await page.evaluate((s) => { const x = document.querySelector(`${s} .wn5a-band`); return x ? x.textContent.replace(/\s+/g, ' ').trim() : null; }, DLG);
  await shot(page, shots, '05-only-point', `${DLG} .wn5a-band`);
  facts('05', { band });
  await page.context().close();
}
// the new-order form, ΚΑΘΟΔΟΣ: a loading at ATHENS TEST (not Veroia) on Thu 15/10 — the head's Veroia day, the delivery day
async function f06_form({ browser, origin, shots }) {
  const { page } = await K.openApp(browser, origin, { viewport: { width: 1440, height: 900 } });
  await page.evaluate(() => WN5Form.openOrder({ side: 'KATHODOS', day: '2026-10-14' }));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  await page.evaluate((s) => {
    const rows = [...document.querySelectorAll(`${s} .wn5f-row`)];
    fhPickLinked(rows[0].dataset.pid, 'recWn5LocAth', 'ATHENS TEST');
    fhPickLinked(rows[1].dataset.pid, 'recWn5LocLar', 'LARISA TEST');
  }, ORDER);
  const day = await page.$(`${ORDER} .wn5f-rows[data-k="load"] .wn5f-dayx`);
  if (day) { await day.click(); await page.keyboard.press('Meta+A'); await page.keyboard.type('15/10'); await page.keyboard.press('Tab'); }
  await page.waitForTimeout(250);
  const f = await page.evaluate((s) => {
    const d = document.querySelector(s);
    const head = d.querySelector('[data-vdayl]').closest('.wn5f-f');
    return { head_veroia_day_shown: !head.classList.contains('off') && head.offsetParent !== null, head_label: head.textContent.replace(/\s+/g, ' ').trim(),
      load_day: d.querySelector('.wn5f-rows[data-k="load"] [data-f="day"]').value, drop_day: d.querySelector('.wn5f-rows[data-k="drop"] [data-f="day"]').value };
  }, ORDER);
  await shot(page, shots, '06-new-order', ORDER);
  facts('06', f);
  await page.context().close();
}
// a truck whose trip ends Mon 12/10 but is on the board to Thu 15/10: a load of Wed 14/10 — join or new by default?
async function f08_newload({ browser, origin, shots }) {
  const b = K.week();
  b.cycles.push({ rt_id: 104, code: 'RT-T104', trip_type: 'OWNED', truck_id: 13, truck: 'TST-2106', trailer_id: 21, trailer: 'TRL-5102', driver_id: 33, driver: 'Driver Test 03',
    partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-12T06:00:00+03:00', end_at: '2026-10-12T13:00:00+03:00', date_start: '2026-10-12', date_end: '2026-10-15', ended: false,
    stops: [K.stop(1301, 1, 'KATHODOS', 1, '2026-10-12T06:00:00+03:00', '2026-10-12T07:00:00+03:00', []), K.stop(1302, 2, 'KATHODOS', 2, '2026-10-12T12:00:00+03:00', '2026-10-12T13:00:00+03:00', [])] });
  const { page } = await K.openApp(browser, origin, { board: b, viewport: { width: 1440, height: 900 } });
  await page.click('#content .wn5-row[data-piece="4101"] [data-act="assign"]');
  await page.waitForSelector(DLG, { timeout: 4000 }).catch(() => {});
  await page.click(`${DLG} [data-in="tk"]`, { clickCount: 3 });
  await page.keyboard.type('2106');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const o = await page.evaluate((s) => ({ opts: [...document.querySelectorAll(`${s} .wn5a-opt`)].map((x) => (x.classList.contains('on') ? '●' : '○') + x.textContent),
    line: (document.querySelector(`${s} [data-line] .wn5a-lt`) || {}).textContent || null }), DLG);
  await shot(page, shots, '08-new-load-default', DLG);
  facts('08', o);
  await page.context().close();
}

K.run({ scenarios: { f01_anod, f02_keep, f03_04_assign, f05_only, f06_form, f08_newload }, globals: ['WN5', 'WN5Act', 'WN5Form'],
  go: 'screenshots taken (facts printed per item)' });
