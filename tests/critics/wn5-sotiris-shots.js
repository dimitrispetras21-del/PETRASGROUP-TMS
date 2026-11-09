// Screenshots before / after of the Sotiris report 8/11 fixes (PR #278), owner rule 8/11: «καλό έλεγχο με screenshot
// και σύγκριση … εντοπίζοντας τις διαφορές από αυτό που θέλαμε ή έγινε». The SAME synthetic scenario on two trees:
//   WN5_SHOT_TAG=before WN5_TREE=<git archive of main before #278> node tests/critics/wn5-sotiris-shots.js --shots <dir>
//   WN5_SHOT_TAG=after  node tests/critics/wn5-sotiris-shots.js --shots <dir>
// Each scenario saves <dir>/<tag>-<item>.png and prints one «facts» line per item (the text a reader compares), so the
// comparison is the words on screen and the request sent (S.plan), never only the picture. Never fails a check: it
// records what each tree does. Synthetic data only (the repo is public).
'use strict';
const K = require('./wn5-rig-kit.js');

const TAG = process.env.WN5_SHOT_TAG || 'shot';
const OK = (op, ids) => [200, { ok: true, op, ids: ids || {}, warnings: [], notice_ids: [] }];
const VS_BASE = { kind: 'vs_import', order_id: 2201, nat_order_id: null, order_stop_id: null, reference: 'VS-T201', client_id: 42, client: 'ΠΕΛΑΤΗΣ Β',
  temperature_c: 2, is_stock: false, leave_by: null, overdue: false, inbound_rt_id: null, for_split: true, pallet_exchange: false, price: null,
  position_location_id: 1, nat_from_location_id: 1, load_from: null, load_to: null, deliver_from: null, deliver_to: null };
// the kit week + one VS piece left at Veroia past its delivery day (due Mon 12/10, today Tue 13/10) and an
// international trip of TST-2106 Wed–Fri (109 intl_trips: ignored by a tree before #278)
function board() {
  const b = K.week();
  b.hub = [Object.assign({}, VS_BASE, { piece_id: 4203, shipment_id: 5303, order_id: 2202, reference: 'VS-T202', client: 'ΠΕΛΑΤΗΣ Γ', pallets: 5,
    nat_to_location_id: 2, nat_ready_day: '2026-10-11', nat_due_day: '2026-10-12', overdue: true })];
  b.intl_trips = [{ rt_id: 9001, truck_id: 13, truck: 'TST-2106', date_start: '2026-10-14', date_end: '2026-10-16' }];
  return b;
}
const DLG = '.wn5-dlg.wn5a[data-wn5="assign"]';
const ORDER = '.wi4-dlg[role="dialog"][data-wn5="order"]';
const txt = (page, sel) => page.evaluate((s) => { const d = document.querySelector(s); return d ? d.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
async function pickIn(page, px, typed, label) {
  await page.click(`${DLG} [data-in="${px}"]`, { clickCount: 3 });
  await page.keyboard.type(typed);
  await page.waitForSelector('.wn5a-list [data-pick]', { timeout: 3000 }).catch(() => {});
  for (const o of await page.$$('.wn5a-list [data-pick]')) if ((await o.textContent()).startsWith(label)) { await o.dispatchEvent('mousedown'); await page.waitForTimeout(60); return true; }
  return false;
}
const facts = (item, o) => console.log('FACTS ' + TAG + ' ' + item + ' ' + JSON.stringify(o));
async function shot(page, shots, item, clip) {
  if (!shots) return;
  const el = clip ? await page.$(clip) : null;
  if (el) await el.screenshot({ path: `${shots}/${TAG}-${item}.png` }).catch(() => page.screenshot({ path: `${shots}/${TAG}-${item}.png` }));
  else await page.screenshot({ path: `${shots}/${TAG}-${item}.png` });
}

// item 1: the late VS piece on a new load of today — the form's delivery day and the stops sent
async function i01_late({ browser, origin, shots }) {
  const { page, S } = await K.openApp(browser, origin, { board: board(), plan: { 'POST /plan/legs': async () => OK('plan_put_pieces', { rt_id: 903 }) } });
  await page.click('#wn5-hub [data-hub="open"]');
  await page.click('#wn5-hub .wn5-hub-it[data-piece="4203"] .wn5-hub-ck');
  await page.click('#wn5-hub .wn5-nf-pick');
  await page.waitForSelector(DLG, { timeout: 4000 }).catch(() => {});
  await pickIn(page, 'tk', '2104', 'TST-2104');
  await pickIn(page, 'dr', 'Test 01', 'Driver Test 01');
  const form = await txt(page, DLG);
  await shot(page, shots, '01-late-form', DLG);
  await page.click(`${DLG} [data-act="save"]`).catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#wn5-hub [data-act="nf-create"]').catch(() => {});
  await page.waitForTimeout(600);
  const w = S.plan.filter((x) => x.m !== 'GET');
  const st = (w[0] && w[0].body && w[0].body.stops) || [];
  const drop = st.find((x) => x.location_id === 2) || {};
  facts('01', { header: (form || '').slice(0, 90), delivery_sent: drop.planned_from || null, veroia_sent: (st.find((x) => x.location_id === 1) || {}).planned_from || null });
  await page.context().close();
}
// items 4 + 5: an international truck in the picker, and no driver
async function i04_05({ browser, origin, shots }) {
  const { page } = await K.openApp(browser, origin, { board: board() });
  await page.click('#content .wn5-row[data-piece="4101"] [data-act="assign"]', { timeout: 4000 }).catch(() => {});
  await page.waitForSelector(DLG, { timeout: 4000 }).catch(() => {});
  await pickIn(page, 'tk', '2106', 'TST-2106');
  await pickIn(page, 'tl', '5102', 'TRL-5102');
  await page.waitForTimeout(150);
  const av = await page.evaluate((s) => { const f = document.querySelector(`${s} [data-f="tk"] .wn5a-av`); return f ? f.textContent : null; }, DLG);
  const miss = await page.evaluate((s) => { const m = document.querySelector(`${s} [data-miss]`); return m ? m.textContent : null; }, DLG);
  await shot(page, shots, '04-05-intl-nodriver', DLG);
  facts('04-05', { truck_line: av, beside_save: miss });
  await page.context().close();
}
// item 7: the board right after a save, while it is re-read (2 s)
async function i07_hold({ browser, origin, shots }) {
  let n = 0;
  const b = board();
  const { page } = await K.openApp(browser, origin, { board: b, plan: {
    'POST /plan/legs': async () => OK('plan_put_group', { rt_id: 901 }),
    'GET /plan/board': async () => { n += 1; if (n > 1) await K.sleep(2000); return [200, b]; } } });
  await page.click('#content .wn5-row[data-piece="4101"] [data-act="assign"]', { timeout: 4000 }).catch(() => {});
  await page.waitForSelector(DLG, { timeout: 4000 }).catch(() => {});
  await pickIn(page, 'tk', '2108', 'TST-2108');
  await pickIn(page, 'dr', 'Test 02', 'Driver Test 02');
  await page.click(`${DLG} [data-act="save"]`).catch(() => {});
  await page.waitForTimeout(500);
  const held = await page.evaluate(() => { const w = document.querySelector('#content > .wn5'); return { pointer: w ? getComputedStyle(w).pointerEvents : null, faded: !!document.querySelector('#content.wn5-reloading') }; });
  await shot(page, shots, '07-during-reread');
  facts('07', held);
  await page.context().close();
}
// item 8: Esc on a typed order form
async function i08_esc({ browser, origin, shots }) {
  const { page } = await K.openApp(browser, origin);
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  await page.click(`${ORDER} input[data-f="price"]`).catch(() => {});
  await page.keyboard.type('450');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const open = await K.count(page, ORDER);
  if (open) await shot(page, shots, '08-esc', ORDER); else await shot(page, shots, '08-esc');
  facts('08', { form_open_after_esc: open === 1, foot: open ? await txt(page, `${ORDER} .wn5f-ft-note`) : null });
  await page.context().close();
}
// item 11: a place typed with another spelling and the words in another order
async function i11_search({ browser, origin, shots }) {
  K.FACADE_LOCS.push({ id: 'recWn5LocBs1', fields: { Name: 'BARMPA TESTIS MAVEE - BARBA TESTIS S.A.', City: 'Sindos', Country: 'GR' } },
    { id: 'recWn5LocBs2', fields: { Name: 'BARBA TESTIS', City: 'Sindos', Country: 'GR' } });
  const { page } = await K.openApp(browser, origin);
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  const inp = await page.$(`${ORDER} .wn5f-loc input`);
  if (inp) { await inp.click(); await page.keyboard.type('Μπάρμπα Τέστης Σίνδος'); }
  await page.waitForTimeout(300);
  const list = await page.evaluate(() => [...document.querySelectorAll('.linked-drop-item')].filter((x) => x.offsetParent).map((x) => x.textContent.trim()));
  await shot(page, shots, '11-place-search', ORDER);
  facts('11', { typed: 'Μπάρμπα Τέστης Σίνδος', list });
  K.FACADE_LOCS.splice(-2, 2);
  await page.context().close();
}
// item 12: the board at rest (the «+» of an empty side), the order form's truck field
async function i12_small({ browser, origin, shots }) {
  const { page } = await K.openApp(browser, origin, { board: board() });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
  const plus = await page.evaluate(() => [...document.querySelectorAll('#content .wn5-row[data-rt] .wn5-gpal .wn5-plus')].map((x) => getComputedStyle(x).opacity));
  await shot(page, shots, '12-board-rest', '#content .wn5');
  await page.evaluate(() => WN5Form.openOrder({}));
  await page.waitForSelector(ORDER, { timeout: 8000 }).catch(() => {});
  const field = await page.evaluate((s) => { const sel = document.querySelector(`${s} #wn5f-tgt`); const l = sel && sel.closest('label'); return { label: l ? l.querySelector('span').textContent : null, options: sel ? [...sel.options].map((o) => o.textContent) : [] }; }, ORDER);
  await shot(page, shots, '12-truck-field', ORDER);
  facts('12', { empty_side_plus_opacity: [...new Set(plus)], field });
  await page.context().close();
}

K.run({ scenarios: { i01_late, i04_05, i07_hold, i08_esc, i11_search, i12_small }, globals: ['WN5', 'WN5Act', 'WN5Form'],
  go: 'screenshots taken (facts printed per item)' });
