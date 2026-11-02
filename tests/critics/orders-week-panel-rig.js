// Rig — «Παραγγελίες › Εβδομάδα»: the Weekly boards' row order, and the order
// card opened IN the week (owner 2/11/2026, for Ειρήνη).
//
// Same synthetic week and mocks as tests/critics/orders-week-proof.js (invented
// data only — the repo is public), plus 'Client Name' on every order (the text
// the Weekly sorts by). Judged on the DOM and on the requests that left, never
// on the code under test:
//   order  — for each day, the RT rows of «Εβδομάδα» come in the order their
//            orders first appear on the Weekly International board of the SAME
//            mocked week (read from that board's DOM, rows by data-oid).
//   card   — a click on an RT / a national row opens the catalog's card
//            (#intlDetail / #natlDetail) over the week: the week is still on
//            screen, the hub still on «Εβδομάδα»; Esc closes it.
//   save   — «Διόρθωση» (accountant) in that card sends ONE PATCH to ORDERS
//            with the new Price, the week repaints the amount, the card stays.
//
// Run from the MAIN repo root (node_modules + .har), against a server of the
// tree under test:
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && \
//   PW_BASE_URL=http://127.0.0.1:8791/ node <tree>/tests/critics/orders-week-panel-rig.js
const P = require('./orders-week-proof.js');
const path = require('path');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));

const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8791/';
const SHOTS = process.env.PW_SHOT_DIR || path.join(__dirname, '..', '..', '.rig-shots', 'orders-week-panel');
require('fs').mkdirSync(SHOTS, { recursive: true });

// The Weekly sorts by the order's own 'Client Name' text: give every order the
// name of its linked client (as the base does).
for (const r of P.ORDERS) {
  const id = (r.fields.Client || [])[0];
  if (id) r.fields['Client Name'] = P.CL[Number(id.replace('recC', ''))];
}

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); } };
const dm = ymd => `${Number(ymd.slice(8, 10))}/${Number(ymd.slice(5, 7))}`;
// order rec id → RT code, from the mocked /costs/rt (Order No = the pg id the legs carry)
const rtOfOrder = new Map();
for (const rt of P.RTS) if (rt.status !== 'cancelled') for (const l of rt.ct_rt_legs) {
  const o = P.ORDERS.find(x => x.fields['Order No'] === l.order_id);
  if (o && !rtOfOrder.has(o.id)) rtOfOrder.set(o.id, rt.code);
}

// «Εβδομάδα»: { 'd/m': [RT codes of that day's own rows] } (guests and «ΧΩΡΙΣ RT» left out).
const weekDays = page => page.evaluate(() => {
  const out = {}; let cur = null;
  const card = document.querySelector('.ow4-sec .ow4-card');
  for (const el of card.children) {
    if (el.classList.contains('ow4-day')) { const m = el.textContent.match(/(\d{1,2}\/\d{1,2})/); cur = m && !/ΧΩΡΙΣ|ΜΕΤΑΦΕΡΘΗΚΕ/.test(el.textContent) ? m[1] : null; if (cur) out[cur] = []; continue; }
    if (!cur || !el.classList.contains('ow4-row') || el.classList.contains('ow4-hd')) continue;
    const tag = (el.querySelector('.ow4-c-rt .ow4-l2') || {}).textContent || '';
    if (/^από /.test(tag)) continue;   // a guest: the Weekly has no row for it on this day
    out[cur].push(el.querySelector('.ow4-c-rt .ow4-l1').textContent.trim());
  }
  return out;
});
// Weekly International: { 'YYYY-MM-DD': [order rec ids, in row order] }.
const boardDays = page => page.evaluate(() => {
  const out = {};
  document.querySelectorAll('section.wi4-day[data-day]').forEach(s => {
    out[s.dataset.day] = [...s.querySelectorAll('.wi4-row[data-oid]')].map(r => r.dataset.oid).filter(Boolean);
  });
  return out;
});

async function scnOrder(browser) {
  console.log('\n[order] «Εβδομάδα» = Weekly International, day by day');
  const page = await P.newPage(browser, 'owner');
  // The Weekly reads exports and imports apart ({Direction}='Export' / 'Import'); the shared
  // mock answers every ORDERS read with all orders, which would draw each export twice.
  await page.route(`**/${P.T.ORDERS}**`, route => {
    const u = decodeURIComponent(route.request().url());
    const ex = /\{Direction\}='Export'/.test(u), im = /\{Direction\}='Import'/.test(u);
    if (route.request().method() !== 'GET' || ex === im || /RECORD_ID/.test(u)) return route.fallback();
    const recs = P.ORDERS.filter(r => r.fields.Direction === (ex ? 'Export' : 'Import') && r.fields.Status !== 'Cancelled');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ records: recs }) });
  });
  await P.openWeek(page);
  const week = await weekDays(page);
  await page.screenshot({ path: path.join(SHOTS, 'week-intl.png') });
  // One day, for the owner: from its header to the next one, in each view.
  const TUE = P.day(3).slice(0, 10);
  const weekTue = await page.evaluate(label => {
    const days = [...document.querySelectorAll('.ow4-sec .ow4-card > .ow4-day')];
    const i = days.findIndex(d => d.textContent.includes(label));
    const a = days[i].getBoundingClientRect(), b = days[i + 1].getBoundingClientRect(), c = days[i].parentElement.getBoundingClientRect();
    return { x: c.left, y: a.top + scrollY, width: c.width, height: b.top - a.top };
  }, dm(TUE));
  await page.setViewportSize({ width: 1440, height: 2000 });
  const weekPng = await page.screenshot({ clip: weekTue });
  await page.setViewportSize({ width: 1440, height: 960 });
  await gotoPage(page, 'weekly_intl', BASE_URL);
  await page.waitForSelector('section.wi4-day', { timeout: 30000 });
  // the board opens on today's week; the proof week is the last complete one
  await page.click('button[aria-label="Προηγούμενη εβδομάδα"]');
  await page.waitForFunction(from => !!document.querySelector(`section.wi4-day[data-day="${from}"]`), P.WEEK_FROM, { timeout: 30000 });
  await page.waitForTimeout(400);
  const board = await boardDays(page);
  await page.screenshot({ path: path.join(SHOTS, 'weekly-intl.png') });
  const boardPng = await page.locator(`section.wi4-day[data-day="${TUE}"]`).screenshot();
  // side by side: Weekly left, «Εβδομάδα» right, same day, same mocked week
  const img = b => 'data:image/png;base64,' + b.toString('base64');
  const cmp = await page.context().newPage();
  await cmp.setViewportSize({ width: 2600, height: 900 });
  await cmp.setContent(`<body style="margin:0;background:#F4F6F9;font:600 15px 'DM Sans',sans-serif;color:#0B1929"><div style="display:flex;gap:24px;padding:16px;align-items:flex-start">
    <div><div style="margin:0 0 8px">Εβδομαδιαίο Διεθνών · ${dm(TUE)}</div><img src="${img(boardPng)}"></div>
    <div><div style="margin:0 0 8px">Παραγγελίες › Εβδομάδα · ${dm(TUE)}</div><img src="${img(weekPng)}"></div></div></body>`);
  await cmp.screenshot({ path: path.join(SHOTS, 'same-day-side-by-side.png'), fullPage: true });
  await cmp.close();
  let compared = 0;
  for (const [ymd, oids] of Object.entries(board)) {
    if (ymd < P.WEEK_FROM || ymd > P.WEEK_TO) continue;
    const mine = week[dm(ymd)] || [];
    // the Weekly's order, one RT per first appearance, only RTs that are rows of this day here
    const seen = new Set(), expect = [];
    for (const oid of oids) { const c = rtOfOrder.get(oid); if (c && !seen.has(c) && mine.includes(c)) { seen.add(c); expect.push(c); } }
    if (!expect.length && !mine.length) continue;
    compared++;
    ok(JSON.stringify(mine.filter(c => seen.has(c))) === JSON.stringify(expect),
      `${dm(ymd)}: «Εβδομάδα» ${JSON.stringify(mine)} follows the Weekly ${JSON.stringify(expect)}`);
  }
  ok(compared >= 3, `${compared} days compared (≥ 3)`);
  ok(P.realErrors(page).length === 0, 'order: 0 page/console errors ' + JSON.stringify(P.realErrors(page)).slice(0, 300));
  await page.context().close();
}

async function scnCard(browser) {
  console.log('\n[card] the catalog\'s card opens over the week');
  const page = await P.newPage(browser, 'accountant');
  const patches = [];
  // Registered after installMocks: a PATCH on ORDERS is recorded and answered as the Worker does.
  await page.route(`**/${P.T.ORDERS}/**`, route => {
    const req = route.request();
    if (req.method() !== 'PATCH') return route.fallback();
    const body = req.postDataJSON();
    patches.push({ url: req.url(), body });
    const rid = req.url().split('/').pop().split('?')[0];
    const rec = P.ORDERS.find(r => r.id === rid);
    if (rec) Object.assign(rec.fields, body.fields);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: rid, fields: rec ? rec.fields : body.fields }) });
  });
  await P.openWeek(page);
  // RT-1204 (export #1248 Pella, 3.650,00): its row opens #1248's card
  const row = () => page.locator('.ow4-row', { has: page.locator('.ow4-c-rt .ow4-l1', { hasText: 'RT-1204' }) });
  await row().locator('.ow4-c-rt').click();
  await page.waitForSelector('.owv-cards #intlDetail:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(600);   // the card's own slide-in (oi-slide) before measuring / the shot
  const s1 = await page.evaluate(() => ({
    body: (document.querySelector('#intlDetail') || {}).textContent || '',
    week: !!document.querySelector('.ow4 .ow4-state'),
    fixed: getComputedStyle(document.getElementById('intlDetail')).position,
    right: Math.round(document.getElementById('intlDetail').getBoundingClientRect().right) === innerWidth,
    natlHidden: document.getElementById('natlDetail').classList.contains('hidden'),
  }));
  ok(/PO-4471/.test(s1.body), 'RT-1204 → the card of #1248 (PO-4471) is open');
  ok(s1.week, 'the week is still painted under the card');
  ok(s1.fixed === 'fixed' && s1.right, 'the card floats over the board, flush right (position ' + s1.fixed + ')');
  ok(s1.natlHidden, 'the national panel stays closed');
  await page.screenshot({ path: path.join(SHOTS, 'card-intl-over-week.png') });

  // «Διόρθωση» → one PATCH on ORDERS, the week repaints, the card stays
  const before = await row().locator('.ow4-l .ow4-n').first().textContent();
  await page.click('#intlDetail [data-oi-act="quick-edit"]');
  await page.waitForSelector('#oqe-Price', { timeout: 10000 });
  await page.fill('#oqe-Price', '3700');
  await page.click('#oqe-save');
  // closeModal() keeps the DOM and drops .open; a refused save keeps it open with #oqe-err
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open') || (document.getElementById('oqe-err') || {}).textContent, null, { timeout: 10000 });
  ok(!(await page.evaluate(() => (document.getElementById('oqe-err') || {}).textContent || '')), 'the form closed without an error line');
  await page.waitForTimeout(300);
  const after = await row().locator('.ow4-l .ow4-n').first().textContent();
  ok(patches.length === 1, `one PATCH left (${patches.length})`);
  ok(patches[0] && /recO1248/.test(patches[0].url) && patches[0].body.fields && Number(patches[0].body.fields.Price) === 3700
    && Object.keys(patches[0].body.fields).length === 1, 'PATCH ORDERS/recO1248 {Price: 3700} only: ' + JSON.stringify(patches[0] && patches[0].body));
  ok(/3\.650,00/.test(before) && /3\.700,00/.test(after), `the week repainted the amount: ${before.trim()} → ${after.trim()}`);
  ok(await page.locator('.owv-cards #intlDetail:not(.hidden)').count() === 1, 'the card is still open after the save');
  await page.screenshot({ path: path.join(SHOTS, 'card-after-correction.png') });

  // a national row → #natlDetail, the international card closes; ΑΝΑΘΕΣΗ from the week's load
  await page.locator('.ow4-row.ow4-nat[data-owvopen="natl:recN427"] .ow4-c-rt').click();
  await page.waitForSelector('.owv-cards #natlDetail:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(600);
  const s2 = await page.evaluate(() => {
    const a = document.querySelector('#natlDetail [data-assign]');
    return { intlHidden: document.getElementById('intlDetail').classList.contains('hidden'), assign: a ? a.dataset.assign : '', text: a ? a.textContent : '' };
  });
  ok(s2.intlHidden, 'opening a national closes the international card');
  ok(s2.assign === 'own', `national #427: ΑΝΑΘΕΣΗ from its load = own truck («${s2.text.trim()}»)`);
  await page.screenshot({ path: path.join(SHOTS, 'card-natl-over-week.png') });
  // #430: no load, not groupage → the catalog's own «εκτός Εβδομαδιαίου»
  await page.locator('.ow4-row.ow4-nat[data-owvopen="natl:recN430"] .ow4-c-rt').click();
  await page.waitForTimeout(300);
  const a430 = await page.evaluate(() => { const a = document.querySelector('#natlDetail [data-assign]'); return a ? a.dataset.assign : ''; });
  ok(a430 === 'out', `national #430 without a load: «${a430}» (the catalog rule), never a guess`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok(await page.locator('.owv-cards #natlDetail.hidden').count() === 1, 'Esc closes the card');
  ok(await page.locator('.ow4 .ow4-state').count() === 1, 'and the week is still there');
  ok(P.realErrors(page).length === 0, 'card: 0 page/console errors ' + JSON.stringify(P.realErrors(page)).slice(0, 300));
  await page.context().close();
}

(async () => {
  console.log('Στόχος: ' + BASE_URL + ' · εβδομάδα ' + P.WEEK_FROM + ' – ' + P.WEEK_TO);
  const browser = await chromium.launch();
  try {
    await scnOrder(browser);
    await scnCard(browser);
  } catch (e) {
    failed++;
    console.log('  ✗ ΚΑΤΑΡΡΕΥΣΗ: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  console.log(`\n${passed}/${passed + failed} assertions · screenshots → ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})();
