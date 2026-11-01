// Rig for F5 stream (d1), Ε3 + Ε5 + Task F (orders_natl.js): the «Παραγγελίες» page and v5 national work.
// Read spec: docs/national-v5/f5/d1-orders-read-spec.md.
//
// Run from the MAIN repo root (its node_modules + .har), against a server that serves the tree under test:
//   python3 -m http.server 8791 -d <worktree> &
//   cd /Users/dimitrispetras/PETRASGROUP-TMS && PW_BASE_URL=http://127.0.0.1:8791/ node <worktree>/tests/critics/orders-natl-v5-rig.js
// NO-GO: the same against a server of the previous tip (origin/main) must FAIL the «after» scenarios.
//
// Everything is SYNTHETIC (no production names). The REAL core/plan-config.js (loaded by app.html since #126)
// reads a stubbed GET /plan/config — the Worker's answer {cutover_day, opened_at, writes_open} (planConfigAnswer,
// worker/src/index.js) — so the rig exercises the client the users run. Until #126 the rig set window.PlanConfig,
// which the real file now overwrites (stream e, 30/10): every scenario then ran as «before». /plan/nat-state
// answers with the contract of plan_nat_state (074a) / the read spec §2. The proof is DOM text and
// request bodies, computed here independently of the code under test — never a screenshot.

const path = require('path');
const MAIN_REPO = '/Users/dimitrispetras/PETRASGROUP-TMS';
const { chromium } = require(path.join(MAIN_REPO, 'node_modules', 'playwright'));
const { preparePage, gotoPage } = require(path.join(MAIN_REPO, 'tests', 'critics', 'auth.js'));
const BASE_URL = process.env.PW_BASE_URL || 'http://127.0.0.1:8791/';

const T = { NAT_ORDERS: 'tblGHCCsTMqAy4KR2', NAT_LOADS: 'tblVW42cZnfC47gTb', ORDERS: 'tblgHlNmLBH3JTdIM', TRUCKS: 'tblEAPExIAjiA3asD',
  DRIVERS: 'tbl7UGmYhc2Y82pPs', PARTNERS: 'tblLHl5m8bqONfhWv', LOCATIONS: 'tblxu8DRfTQOFRCzS', CLIENTS: 'tblFWKAQVUzAM8mCE' };
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const rel = k => { const d = new Date(); d.setDate(d.getDate() + k); return ymd(d); };
const TODAY = rel(0), PAST = rel(-1), FUTURE = rel(3);
// The «Εβδομάδα» view opens on the last COMPLETE Saturday–Friday week: every order loads on its Monday.
const _now = new Date(), _thisSat = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - (_now.getDay() + 1) % 7);
const LOAD_DAY = ymd(new Date(_thisSat.getFullYear(), _thisSat.getMonth(), _thisSat.getDate() - 5));

const LOCS = [{ id: 'recLocA', fields: { Name: 'Synthetic Depot A', City: 'Larisa', Country: 'GR' } },
  { id: 'recLocB', fields: { Name: 'Synthetic Market B', City: 'Patra', Country: 'GR' } }];
const CLIENTS = [{ id: 'recCl1', fields: { 'Company Name': 'Synthetic Client One' } }];
const TRUCKS = [{ id: 'recTr1', fields: { 'License Plate': 'ΤΣΤ-1001' } }];
const nat = (id, no, ref, del, extra) => ({ id, fields: Object.assign({ 'Order No': no, Reference: ref, Client: ['recCl1'], Price: 500,
  'Pickup Location 1': ['recLocA'], 'Delivery Location 1': ['recLocB'], 'Loading DateTime': LOAD_DAY, 'Delivery DateTime': del }, extra || {}) });
// V5A: v5, own truck, NOT executed, delivery date future · V5B: v5, no vehicle, NOT executed, date past
// V5C: v5, partner, executed, date past · OLDA: old, load with truck, date past · OLDB: old, no load, date future
const NAT = [nat('recV5A', 9001, 'SYN-V5A', FUTURE), nat('recV5B', 9002, 'SYN-V5B', PAST, { Price: '' }), nat('recV5C', 9003, 'SYN-V5C', PAST),
  nat('recOLDA', 9004, 'SYN-OLDA', PAST, { Direction: 'North→South' }), nat('recOLDB', 9005, 'SYN-OLDB', FUTURE, { Direction: 'North→South' })];
const NL = [{ id: 'recNL1', fields: { 'Source National Order': ['recOLDA'], Truck: ['recTr1'], Direction: 'North→South', 'Source Type': 'National' } }];
const car = (o) => Object.assign({ truck: null, trailer: null, driver: null, partner: null, code: 'RT-9', side: 'KATHODOS', day: TODAY }, o);
const ST = {
  9001: { n_pieces: 1, n_executed: 0, executed: false, planned: true, late: false, hub_side: null, carriers: [car({ kind: 'owned', truck: 'ΣΥΝ-5001', trailer: 'ΣΥΝ-Ρ1', driver: 'Synthetic Driver', code: 'RT-9101' })] },
  9002: { n_pieces: 1, n_executed: 0, executed: false, planned: false, late: false, hub_side: 'ANODOS', carriers: [] },
  9003: { n_pieces: 1, n_executed: 1, executed: true, planned: true, late: false, hub_side: null, carriers: [car({ kind: 'partner', partner: 'Synthetic Partner', side: 'ANODOS', code: 'RT-9102' })] },
};

let passed = 0, failed = 0;
const assert = (c, m) => { if (c) { passed++; console.log('  ✓ ' + m); } else { failed++; console.log('  ✗ ' + m); } };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

async function newPage(browser, role, sc) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();
  const errors = [], log = { natState: [], patches: [], nlPosts: 0, natDeletes: 0, config: 0 };
  page.on('pageerror', e => errors.push('pageerror: ' + e));
  // The resource URL goes with the text: Chrome's «Failed to load resource: … 500» names no route by itself.
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' @ ' + ((m.location() || {}).url || '')); });
  page.on('dialog', d => { errors.push('native dialog: ' + d.message()); d.dismiss(); });
  await preparePage(page, role);
  await page.addInitScript(([r, view]) => {
    localStorage.setItem('tms_orders_hub_demo_' + r, JSON.stringify({ scope: 'natl', view }));
  }, [role, sc.view || 'catalog']);
  page.route('**/petras-tms-backend-staging.petrasgroup.workers.dev/**', route => json(route, { records: [] }));
  // Day L as the Worker says it: 'after' = cutover_day set (074 ran); 'before' = null; 'unknown' = no answer.
  page.route('**/plan/config', route => {
    log.config++;
    if (sc.state === 'unknown') return json(route, { error: { type: 'INTERNAL', code: 'plan_failed', message: 'boom' } }, 500);
    return json(route, sc.state === 'after'
      ? { cutover_day: '2026-10-31', opened_at: '2026-10-30T15:30:00Z', writes_open: false }
      : { cutover_day: null, opened_at: null, writes_open: false });
  });
  page.route(`**/${T.NAT_ORDERS}**`, route => {
    const req = route.request();
    if (req.method() === 'PATCH') { log.patches.push({ url: req.url(), body: req.postDataJSON() }); return json(route, { id: 'recOLDA', fields: {} }); }
    if (req.method() === 'DELETE') { log.natDeletes++; return json(route, { deleted: true }); }
    return json(route, { records: NAT });
  });
  page.route(`**/${T.NAT_LOADS}**`, route => {
    if (route.request().method() !== 'GET') { log.nlPosts++; return json(route, { id: 'recNEW', fields: {} }); }
    const u = decodeURIComponent(route.request().url());
    return json(route, { records: NL.filter(l => u.includes('"' + l.fields['Source National Order'][0] + '"')) });
  });
  page.route(`**/${T.ORDERS}**`, route => json(route, { records: [] }));
  page.route(`**/${T.TRUCKS}**`, route => json(route, { records: TRUCKS }));
  page.route(`**/${T.LOCATIONS}**`, route => json(route, { records: LOCS }));
  page.route(`**/${T.CLIENTS}**`, route => json(route, { records: CLIENTS }));
  page.route('**/plan/nat-state**', route => {
    const u = new URL(route.request().url());
    log.natState.push(u.search);
    if (sc.natFail) return json(route, { error: { type: 'INTERNAL', code: 'boom', message: 'boom' } }, 500);
    const ids = (u.searchParams.get('nat_order_ids') || '').split(',');
    return json(route, Object.fromEntries(ids.map(id => [id, ST[id] || 'missing'])));
  });
  page._errors = errors; page._log = log;
  return page;
}
const rowText = (page, id) => page.locator('#ocrow_' + id).innerText().catch(() => '');
const kpi = async (page, label) => page.evaluate(l => { const s = [...document.querySelectorAll('#ocKpi .oc-stat')].find(x => x.querySelector('.oc-k').textContent.trim() === l); return s ? s.querySelector('.oc-v').textContent.trim() : null; }, label);
async function openCatalog(page) {
  await gotoPage(page, 'orders', BASE_URL);
  await page.waitForSelector('#ocrow_recOLDB', { timeout: 30000 });
  await page.waitForTimeout(400);
}
// Independent rule (spec 2.3 / read spec §3): delivered = v5 executed, else the date passed.
const expectedDelivered = (after) => NAT.filter(r => {
  const s = after ? ST[r.fields['Order No']] : null;
  return s ? s.executed : r.fields['Delivery DateTime'] < TODAY;
}).length;

async function before(browser) {
  console.log('\n[owner] before L: today\'s page');
  const page = await newPage(browser, 'owner', { state: 'before' });
  await openCatalog(page);
  assert(page._log.config >= 1, 'before: the real PlanConfig asked GET /plan/config');
  assert(page._log.natState.length === 0, 'before: no /plan/nat-state request');
  assert(/εκτός/.test(await rowText(page, 'recOLDB')), 'before: old order without load still «εκτός»');
  assert(/ΤΣΤ-1001/.test(await rowText(page, 'recOLDA')), 'before: old order shows its load\'s truck');
  assert(await kpi(page, 'Παραδόθηκαν') === String(expectedDelivered(false)), `before: Παραδόθηκαν = ${expectedDelivered(false)} (date rule)`);
  assert(page._errors.length === 0, 'before: 0 console/page errors ' + JSON.stringify(page._errors));
  await page.context().close();
}

async function after(browser) {
  console.log('\n[owner] after L: v5 orders read their cycle');
  const page = await newPage(browser, 'owner', { state: 'after' });
  await openCatalog(page);
  // One read per data set: the catalog's list and the counters' invoicing set (OrdersData), each with every Order No.
  assert(page._log.config >= 1, 'after: the real PlanConfig asked GET /plan/config');
  assert(page._log.natState.length >= 1 && page._log.natState.length <= 2 && page._log.natState.every(q => /nat_order_ids=9001(%2C|,)9002(%2C|,)9003(%2C|,)9004(%2C|,)9005$/.test(q)),
    'after: /plan/nat-state read once per data set (≤ 2), each with the 5 Order Nos ' + JSON.stringify(page._log.natState));
  const a = await rowText(page, 'recV5A'), b = await rowText(page, 'recV5B'), c = await rowText(page, 'recV5C');
  assert(/ΣΥΝ-5001/.test(a) && /Synthetic Driver/.test(a) && !/εκτός/.test(a), 'after: V5A shows the cycle truck + driver, not «εκτός»');
  assert(/προς ανάθεση/.test(b) && !/εκτός/.test(b), 'after: V5B (no vehicle) «προς ανάθεση», not «εκτός»');
  assert(/Synthetic Partner/.test(c), 'after: V5C shows the partner');
  const old = await rowText(page, 'recOLDB');
  assert(/εκτός/.test(old) && !/Στείλε/.test(old), 'after: old order without load «εκτός», WITHOUT «Στείλε →» (074 freeze)');
  assert(await kpi(page, 'Παραδόθηκαν') === String(expectedDelivered(true)), `after: Παραδόθηκαν = ${expectedDelivered(true)} (v5 executed, old by date)`);
  // «Εβδομάδα»
  await page.evaluate(() => OrdersHub.setView('week'));
  await page.waitForSelector('.ow4 .ow4-state', { timeout: 30000 });
  await page.waitForTimeout(300);
  const wk = await page.locator('.ow4').innerText();
  if (process.env.RIG_DEBUG) console.log(wk.slice(0, 3000));
  assert(/ΣΥΝ-5001/.test(wk) && /Synthetic Partner/.test(wk), 'after/week: v5 rows assigned from the cycle');
  const v5Rows = await page.$$eval('.ow4-nat', rs => rs.filter(r => /ΣΥΝ-5001|Synthetic Partner/.test(r.textContent)).map(r => r.textContent));
  assert(v5Rows.length >= 2 && v5Rows.every(t => !/εκτός φορτίου/.test(t)), 'after/week: no v5 row says «εκτός φορτίου»');
  assert(page._errors.length === 0, 'after: 0 console/page errors ' + JSON.stringify(page._errors));
  // «Χωρίς τιμή» (V5B is the one unpriced order): its ΑΝΑΘΕΣΗ from the invoicing set's v5 state, never «εκτός».
  await page.evaluate(() => OrdersHub.setView('noprice'));
  await page.waitForTimeout(1500);
  const np = await page.locator('#content').innerText();
  assert(/Ε-9002/.test(np) && /προς ανάθεση/.test(np) && !/εκτός/.test(np), 'after/noprice: the unpriced v5 order reads «προς ανάθεση», not «εκτός»');
  // Task F: «Νέα εθνική» goes to the board
  await page.evaluate(() => openNatlCreate());
  await page.waitForTimeout(800);
  assert(await page.evaluate(() => localStorage.getItem('tms_page')) === 'weekly_natl', 'after/F: «Νέα εθνική» opens the Weekly National, not the old form');
  await page.context().close();
}

async function fail(browser) {
  console.log('\n[owner] after L, /plan/nat-state fails');
  const page = await newPage(browser, 'owner', { state: 'after', natFail: true });
  await openCatalog(page);
  assert(page._log.config >= 1, 'fail: the real PlanConfig asked GET /plan/config');
  const warns = await page.locator('#ocWarns').innerText();
  assert(/κατάσταση των εθνικών v5 δεν διαβάστηκε/.test(warns), 'fail: the strip says the v5 state was not read');
  const a = await rowText(page, 'recV5A');
  assert(!/εκτός/.test(a) && /—/.test(a), 'fail: an order without load shows «—», never «εκτός»');
  assert(/ΤΣΤ-1001/.test(await rowText(page, 'recOLDA')), 'fail: an old order with a load keeps its truck');
  // «Προς τιμολόγηση» reads the same invoicing set: the same strip, the same words.
  await page.evaluate(() => OrdersHub.setView('invoicing'));
  await page.waitForSelector('.oiv', { timeout: 30000 });
  const inv = await page.$$eval('.oiv-banner', bs => bs.map(b => b.textContent));
  assert(inv.some(t => /κατάσταση των εθνικών v5 δεν διαβάστηκε/.test(t)), 'fail/invoicing: «Προς τιμολόγηση» shows the v5 strip');
  const unexpected = page._errors.filter(e => !/500|nat-state|planFetch|boom/i.test(e));
  assert(unexpected.length === 0, 'fail: no error besides the mocked 500 ' + JSON.stringify(unexpected));
  await page.context().close();
}

async function dispatcherEdit(browser) {
  console.log('\n[dispatcher] after L: old order, Q-10 fields only');
  const page = await newPage(browser, 'dispatcher', { state: 'after' });
  await openCatalog(page);
  await page.evaluate(() => openNatlEdit('recOLDA'));
  await page.waitForSelector('#nf_Price', { timeout: 15000 });
  await page.waitForTimeout(300);
  const enabled = await page.$$eval('#modalBody input, #modalBody select, #modalBody textarea, #modalBody button', els => els.filter(e => !e.disabled && e.type !== 'hidden' && e.offsetParent !== null).map(e => e.id || e.tagName));
  assert(JSON.stringify(enabled.sort()) === JSON.stringify(['nf_Notes', 'nf_Price']), 'dispatcher: only Price and Notes are editable ' + JSON.stringify(enabled));
  await page.fill('#nf_Price', '777');
  await page.click('#natlBtnSubmit');
  await page.waitForTimeout(800);
  const p = page._log.patches;
  // Only what changed: Price. The untouched empty Notes is not sent (NULL must not become '').
  assert(p.length === 1 && JSON.stringify(Object.keys((p[0].body || {}).fields || {})) === JSON.stringify(['Price']) && p[0].body.fields.Price === 777,
    'dispatcher: ONE PATCH of national_orders with the changed Price only ' + JSON.stringify(p));
  // Delete and «Στείλε →» refuse after L, with nothing sent.
  const before = page._log.patches.length;
  const del = await page.evaluate(() => deleteNatlOrder('recOLDB'));
  await page.evaluate(() => _natlSendToWeekly('recOLDB'));
  await page.waitForTimeout(400);
  assert(del === false && page._log.patches.length === before && page._log.nlPosts === 0 && page._log.natDeletes === 0, 'dispatcher: delete and «Στείλε →» refuse after L, nothing written');
  assert(page._errors.length === 0, 'dispatcher: 0 console/page errors ' + JSON.stringify(page._errors));
  await page.context().close();
}

async function unknown(browser) {
  console.log('\n[owner] PlanConfig unknown: today\'s path, SAID on the screen');
  const page = await newPage(browser, 'owner', { state: 'unknown' });
  await openCatalog(page);
  assert(/ΣΥΝ-5001/.test(await rowText(page, 'recV5A')), 'unknown: the read still runs and tells the truth (V5A from its cycle)');
  await page.evaluate(() => openNatlCreate());
  await page.waitForTimeout(1200);
  const t = await page.evaluate(() => document.body.innerText);
  assert(/Δεν διαβάστηκε αν έγινε η μετάβαση/.test(t), 'unknown: «Νέα εθνική» says the state is unknown (never a silent before)');
  // Only the mocked /plan/config failure may be logged (PlanConfig.load / planFetch name the route).
  const unexpected = page._errors.filter(e => !/plan\/config|PlanConfig\.load/i.test(e));
  assert(unexpected.length === 0, 'unknown: no error besides the mocked /plan/config 500 ' + JSON.stringify(unexpected));
  await page.context().close();
}

(async () => {
  console.log('Στόχος: ' + BASE_URL);
  const browser = await chromium.launch();
  for (const run of [before, after, fail, dispatcherEdit, unknown]) {
    try { await run(browser); } catch (e) { failed++; console.log('  ✗ ΚΑΤΑΡΡΕΥΣΗ ' + run.name + ': ' + (e && e.message || e)); }
  }
  await browser.close();
  console.log(`\n${passed}/${passed + failed} assertions`);
  process.exit(failed ? 1 : 0);
})();
