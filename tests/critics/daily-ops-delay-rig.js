// Rig: «Καθυστέρηση» with a reason on the Ημερήσιο (dispatcher Pantelis / owner 9/10/2026, migration 067).
//
// Usage (cwd = the MAIN repo root: it holds node_modules and .har/):
//   node <worktree>/tests/critics/daily-ops-delay-rig.js <baseURL> <outDir>
// Reference data (trucks, drivers, partners, locations, clients) replays from the 28/8 HAR
// (tests/critics/auth.js). ORDERS and ORDER STOPS are answered by an in-memory facade below that behaves
// like the Worker after 067: every write is CAPTURED (nothing is sent anywhere), the stop's answer carries
// «Delay Responsibility» derived from the code, NULL is absent (trap 2), and a write the base's CHECKs
// would refuse is answered 500 and recorded as a violation. F.dropLabels = a Worker that does not map the
// labels yet (answers 200 without them). Real app code throughout (daily_ops.js, the popover, the toasts);
// stubbed in the page: confirmAction (no human), paSyncStatus (partner sync), logError (captured).
//
// Run at 1440 and at 1280 (both in one run). Checks: delay on a LOADING, on a DELIVERY point (multi-stop),
// from the OVERDUE banner; «Άλλο» without a note refused; no reason refused; Άκυρο / Escape write nothing;
// the read-back warning when the Worker drops the label; a lot keeps «Παραλαβή (καθυστέρηση)»; the word
// «Καθυστέρησε» is gone; «Delay Responsibility» is never sent.
// Screens (for the owner's approval, existing screen = the real app): the panel open, a stop after a delay
// with its reason, the overdue banner — each at 1440 and 1280.
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '../..');
const req = m => require(require.resolve(m, { paths: [process.cwd(), ROOT] }));
const { chromium } = req('playwright');
const { preparePage, gotoPage } = require(path.join(__dirname, 'auth.js'));
const { repair } = require(path.join(__dirname, 'repair-har.js'));
const [,, baseURL, outDir] = process.argv;
if (!baseURL || !outDir) { console.error('usage: node daily-ops-delay-rig.js <baseURL> <outDir>'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const ORDERS = 'tblgHlNmLBH3JTdIM', STOPS = 'tblaeY5QOHAS1gyE8';

// Closest RECORDED request for reference reads whose fields[] grew since 28/8 (same as stock-other-rig).
const DATE_RE = /\d{4}-\d{2}-\d{2}/g;
const keyOf = u => { const x = new URL(u); return x.pathname + '?' + [...x.searchParams.entries()].filter(([k]) => k !== 'fields[]').map(([k, v]) => k + '=' + v.replace(DATE_RE, 'D')).sort().join('&'); };
const fieldsOf = u => new Set(new URL(u).searchParams.getAll('fields[]'));
let _idx = null;
function harIndex() {
  if (_idx) return _idx;
  const all = new Set(), byKey = new Map();
  for (const e of JSON.parse(fs.readFileSync(repair(), 'utf8')).log.entries) {
    if (!e.request.url.includes(HOST) || e.request.method !== 'GET') continue;
    all.add(e.request.url);
    const k = keyOf(e.request.url); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e.request.url);
  }
  return (_idx = { all, byKey });
}
function bridge(route) {
  const r = route.request(); const { all, byKey } = harIndex();
  if (r.method() !== 'GET' || all.has(r.url())) return route.fallback();
  const cands = byKey.get(keyOf(r.url())) || [];
  if (!cands.length) return route.fallback();
  const want = fieldsOf(r.url()); let best = null, bestN = -1;
  for (const c of cands) { const n = [...fieldsOf(c)].filter(f => want.has(f)).length; if (n > bestN) { bestN = n; best = c; } }
  return route.fallback({ url: best });
}

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); };

// The base after 067 (its CASE, its CHECKs) — the rig's own copy, independent of the screen's constant.
const BASE_RESP = { vehicle_breakdown: 'us', driver_hours: 'us', planning_error: 'us', previous_stop: 'us', cargo_not_ready: 'client', loading_wait: 'client',
  order_change: 'client', missing_docs: 'client', unloading_wait: 'consignee', closed_refused: 'consignee', border_queue: 'borders', customs: 'borders',
  traffic: 'external', weather: 'external', ferry_train: 'external', strike_roads: 'external', other: 'other' };
function baseRefuses(row) {
  const r = row['Delay Reason'], n = row['Delay Note'];
  if (r != null && !BASE_RESP[r]) return 'order_stops_delay_reason_check';
  if (r === 'other' && !/\S/.test(n || '')) return 'order_stops_delay_other_note_check';
  if ((r != null && row.Performance !== 'Delayed') || (n != null && r == null)) return 'order_stops_delay_only_delayed_check';
  return null;
}

function makeFacade() {
  const F = { orders: {}, stops: {}, writes: [], violations: [], ready: false, dropLabels: false };
  const isEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
  const read = o => { const f = {}; for (const [k, v] of Object.entries(o.fields)) if (!isEmpty(v)) f[k] = v; return { id: o.id, createdTime: '2026-10-01T00:00:00.000Z', fields: f }; };
  F.read = read;
  const d10 = v => String(v || '').slice(0, 10);
  F.list = (table, fm) => {
    fm = fm || '';
    if (table === STOPS) {
      const ids = [...new Set([...fm.matchAll(/RECORD_ID\(\)\s*=\s*["']([^"']+)["']/g)].map(m => m[1]))];
      return ids.map(id => F.stops[id]).filter(Boolean).map(read);
    }
    const live = Object.values(F.orders);
    if (!fm) return live.map(read);
    if (fm.startsWith('OR(IS_SAME(')) {
      const t = (/IS_SAME\(\{Loading DateTime\},'(\d{4}-\d{2}-\d{2})'/.exec(fm) || [])[1];
      return live.filter(o => d10(o.fields['Loading DateTime']) === t || d10(o.fields['Delivery DateTime']) === t).map(read);
    }
    const open = s => ['Assigned', 'Pending', ''].includes(s || '');
    if (fm.startsWith('AND(IS_BEFORE({Delivery DateTime}')) return live.filter(o => d10(o.fields['Delivery DateTime']) < day(0) && (open(o.fields.Status) || o.fields.Status === 'In Transit')).map(read);
    if (fm.startsWith('AND(IS_BEFORE({Loading DateTime}')) return live.filter(o => d10(o.fields['Loading DateTime']) < day(0) && open(o.fields.Status)).map(read);
    let m;
    if ((m = /RECORD_ID\(\)\s*=\s*['"]([^'"]+)['"]/.exec(fm))) return live.filter(o => o.id === m[1]).map(read);
    return [];
  };
  return F;
}

async function installRoutes(page, F) {
  await page.route(`**/${HOST}/**`, async route => {
    const r = route.request(), url = new URL(r.url());
    const hdr = { 'content-type': 'application/json', 'access-control-allow-origin': r.headers()['origin'] || '*' };
    const send = (status, body) => route.fulfill({ status, headers: hdr, body: JSON.stringify(body) });
    if (!F.ready) return bridge(route);
    const m = r.method();
    if (url.pathname.startsWith('/pallets/')) return send(200, { records: [] });
    const seg = url.pathname.split('/').filter(Boolean), table = seg[2], recId = seg[3];
    if (table === 'local_moves') return send(200, { records: [] });
    if (![ORDERS, STOPS].includes(table)) return bridge(route);
    const store = table === ORDERS ? F.orders : F.stops;
    if (m === 'GET' && !recId) return send(200, { records: F.list(table, url.searchParams.get('filterByFormula')) });
    if (m === 'GET') return store[recId] ? send(200, F.read(store[recId])) : send(404, { error: { type: 'NOT_FOUND' } });
    const body = r.postDataJSON ? r.postDataJSON() : null;
    const fields = { ...((body && body.fields) || {}) };
    F.writes.push({ m, table: table === ORDERS ? 'ORDERS' : 'STOPS', recId, fields: JSON.parse(JSON.stringify(fields)) });
    if (m === 'PATCH' && table === STOPS && store[recId]) {
      if ('Delay Responsibility' in fields) return send(400, { error: { type: 'INVALID_REQUEST', message: 'Read-only field (computed by the database): Delay Responsibility' } });
      if (F.dropLabels) { delete fields['Delay Reason']; delete fields['Delay Note']; }   // the old Worker: dropped, 200
      const next = { ...store[recId].fields, ...fields };
      const bad = baseRefuses(next);
      if (bad) { F.violations.push({ recId, bad, fields }); return send(500, { error: { type: 'SERVER_ERROR', message: 'Failed to update record' } }); }
      next['Delay Responsibility'] = next['Delay Reason'] != null ? BASE_RESP[next['Delay Reason']] : null;
      store[recId].fields = next;
      return send(200, F.read(store[recId]));
    }
    if (m === 'PATCH' && store[recId]) { Object.assign(store[recId].fields, fields); return send(200, F.read(store[recId])); }
    return send(200, { id: recId || 'recNEW', fields });
  });
}

async function open(browser, W, F) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, baseURL, locale: 'el-GR', timezoneId: 'Europe/Athens' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('requestfailed', r => { if (r.url().includes(HOST)) errs.push('requestfailed: ' + r.method() + ' ' + decodeURIComponent(r.url()).slice(0, 200)); });
  page.on('dialog', d => d.accept());
  await preparePage(page, 'dispatcher');
  await installRoutes(page, F);
  await gotoPage(page, 'daily_ops', baseURL);
  await page.locator('#sidebar').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => typeof OrdersStock !== 'undefined' && typeof preloadReferenceData === 'function', null, { timeout: 20000 });
  await page.evaluate(() => preloadReferenceData());
  // the app's own boot render reads the HAR; wait for it to settle before switching the facade on
  await page.waitForFunction(() => !!document.querySelector('.do-page .do-kpis, .do-page .do-err'), null, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll('#tms-toast-container > *').forEach(n => n.remove()));
  errs.length = 0;
  const ref = await page.evaluate(() => ({
    trucks: getRefTrucks().filter(r => r.fields.Active).slice(0, 2).map(r => r.id),
    drivers: getRefDrivers().filter(r => r.fields.Active).slice(0, 2).map(r => r.id),
    partners: getRefPartners().slice(0, 1).map(r => r.id),
    clients: getRefClients().filter(r => r.fields['Company Name']).slice(0, 4).map(r => r.id),
    locs: getRefLocations().filter(r => r.fields.Name && r.fields.Country).slice(0, 5).map(r => r.id),
  }));
  await page.evaluate(() => {
    window.__rig = { toasts: [], logged: [] };
    window.confirmAction = async () => true;
    window.paSyncStatus = async () => null;
    window.logError = (e, where) => { window.__rig.logged.push(String(where) + ' | ' + (e && e.message)); };
    const t0 = window.toast; window.toast = (m, ty) => { window.__rig.toasts.push((ty || 'success') + ': ' + m); return t0 && t0(m, ty); };
  });
  return { ctx, page, errs, ref };
}

(async () => {
  const out = { screens: [], checks: {} };
  const ok = (name, cond, detail) => { out.checks[name] = { ok: !!cond, detail: cond ? undefined : detail }; };
  const browser = await chromium.launch();

  for (const W of [1440, 1280]) {
    const F = makeFacade();
    const { ctx, page, errs, ref } = await open(browser, W, F);
    // the single #toast of the previous step would sit over the panel in the owner's picture
    const shot = async (name, full = true) => { const n = `${name}-${W}.png`; await page.evaluate(() => { const t = document.getElementById('toast'); if (t) { t.style.transition = 'none'; t.style.opacity = '0'; } }); await page.screenshot({ path: path.join(outDir, n), fullPage: full }); out.screens.push(n); };
    const c = (k) => `${W}_${k}`;
    const [T1, T2] = ref.trucks, [D1, D2] = ref.drivers, [PA1] = ref.partners, [C1, C2, C3, C4] = ref.clients, [L1, L2, L3, L4, WH] = ref.locs;
    const o = (id, f, stops) => {
      F.orders[id] = { id, fields: Object.assign({ Type: 'International' }, f, { 'ORDER STOPS': stops.map(s => s[0]) }) };
      stops.forEach(([sid, type, loc, n, num]) => { F.stops[sid] = { id: sid, fields: { 'Parent Order': [id], 'Stop Type': type, 'Stop Number': num || 1, Location: [loc], Pallets: n, DateTime: type === 'Loading' ? f['Loading DateTime'] : f['Delivery DateTime'] } }; });
    };
    o('recRIGEXL0000001', { Direction: 'Export', Client: [C1], 'Loading DateTime': day(0), 'Delivery DateTime': day(2), Truck: [T1], Driver: [D1], Status: 'Assigned', 'Total Pallets': 33, Reference: 'TEST-D1' },
      [['recRIGSEXL1L', 'Loading', L1, 33], ['recRIGSEXL1U', 'Unloading', L2, 33]]);
    o('recRIGEXL0000002', { Direction: 'Export', Client: [C2], 'Loading DateTime': day(0), 'Delivery DateTime': day(2), Truck: [T2], Driver: [D2], Status: 'Assigned', 'Total Pallets': 26, Reference: 'TEST-D2' },
      [['recRIGSEXL2L', 'Loading', L3, 26], ['recRIGSEXL2U', 'Unloading', L4, 26]]);
    o('recRIGIMD0000001', { Direction: 'Import', Client: [C3], 'Loading DateTime': day(-2), 'Delivery DateTime': day(0), Truck: [T1], Driver: [D1], Status: 'In Transit', 'Total Pallets': 20 },
      [['recRIGSIMD1L', 'Loading', L2, 20], ['recRIGSIMD1U', 'Unloading', L1, 20]]);
    o('recRIGIMD0000002', { Direction: 'Import', Client: [C4], 'Loading DateTime': day(-2), 'Delivery DateTime': day(0), Truck: [T2], Driver: [D2], Status: 'In Transit', 'Total Pallets': 18 },
      [['recRIGSIMD2L', 'Loading', L4, 18], ['recRIGSIMD2U', 'Unloading', L3, 18]]);
    o('recRIGIMM0000001', { Direction: 'Import', Client: [C2], 'Loading DateTime': day(-2), 'Delivery DateTime': day(0), Truck: [T2], Driver: [D2], Status: 'In Transit', 'Total Pallets': 24 },
      [['recRIGSIMML', 'Loading', L4, 24], ['recRIGSIMMU1', 'Unloading', L1, 12, 1], ['recRIGSIMMU2', 'Unloading', L3, 12, 2]]);
    o('recRIGLOT0000001', { Direction: 'Import', Client: [C1], 'Loading DateTime': day(-1), 'Delivery DateTime': day(0), Partner: [PA1], 'Is Partner Trip': true, Status: 'In Transit', 'Total Pallets': 30, 'Own Stock Lot': 'recRIGSTOCKLOT1', 'Order No': 401 },
      [['recRIGSLOTL', 'Loading', L2, 30], ['recRIGSLOTU', 'Unloading', WH, 30]]);
    o('recRIGOVD0000001', { Direction: 'Import', Client: [C3], 'Loading DateTime': day(-4), 'Delivery DateTime': day(-1), Truck: [T1], Driver: [D1], Status: 'In Transit', 'Total Pallets': 22 },
      [['recRIGSOVDL', 'Loading', L3, 22], ['recRIGSOVDU', 'Unloading', L2, 22]]);
    o('recRIGOVD0000002', { Direction: 'Export', Client: [C4], 'Loading DateTime': day(-3), 'Delivery DateTime': day(-1), Truck: [T2], Driver: [D2], Status: 'In Transit', 'Total Pallets': 15 },
      [['recRIGSOV2L', 'Loading', L1, 15], ['recRIGSOV2U', 'Unloading', L4, 15]]);
    F.ready = true;
    await page.evaluate(async () => { invalidateCache(TABLES.ORDERS); OPS.date = 'today'; await renderDailyOps(); });
    await page.locator('.do-page .do-kpis').waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);

    const rowText = id => page.evaluate(i => ((document.getElementById('r_' + i) || {}).innerText || '').replace(/\s+/g, ' '), id);
    const panel = page.locator('.do-dlyp');
    const lateBtn = id => page.locator(`#r_${id} button.do-late-btn`);
    const writesSince = n => F.writes.slice(n);
    const clearToasts = () => page.evaluate(() => { window.__rig.toasts.length = 0; window.__rig.logged.length = 0; document.querySelectorAll('#tms-toast-container > *').forEach(n => n.remove()); });
    const domToasts = () => page.evaluate(() => [...document.querySelectorAll('#tms-toast-container > *')].map(n => n.innerText.replace(/\s+/g, ' ')));
    const settle = async (pred, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await pred()) return true; await page.waitForTimeout(150); } return false; };

    // ── 0) the page: words and buttons ────────────────────────────────────────
    const html0 = await page.evaluate(() => document.querySelector('.do-page').innerHTML);
    ok(c('word_renamed_everywhere'), !/Καθυστέρησε/.test(html0) && (await lateBtn('recRIGEXL0000001').innerText()) === 'Καθυστέρηση' && (await lateBtn('recRIGIMD0000001').innerText()) === 'Καθυστέρηση', null);
    ok(c('lot_keeps_its_wording'), /Παραλαβή \(καθυστέρηση\)/.test(await rowText('recRIGLOT0000001')) && !/Καθυστέρηση/.test(await rowText('recRIGLOT0000001')), await rowText('recRIGLOT0000001'));
    ok(c('overdue_banner_has_the_button'), (await lateBtn('recRIGOVD0000001').innerText()) === 'Καθυστέρηση', null);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot('delay-overdue-banner', false);

    // ── 1) Άκυρο and Escape write nothing ─────────────────────────────────────
    let n0 = F.writes.length;
    await lateBtn('recRIGIMD0000001').click();
    await panel.waitFor({ timeout: 5000 });
    await panel.locator('input[value="traffic"]').check();
    await panel.locator('button.do-ghost', { hasText: 'Άκυρο' }).click();
    const cancelGone = await panel.count() === 0;
    await lateBtn('recRIGIMD0000001').click();
    await panel.waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    ok(c('cancel_and_escape_write_nothing'), cancelGone && await panel.count() === 0 && writesSince(n0).length === 0, writesSince(n0));

    // ── 2) no reason → refused, nothing sent, the panel stays and says why ────
    await lateBtn('recRIGIMD0000001').click();
    await panel.waitFor({ timeout: 5000 });
    await panel.locator('button.do-btn', { hasText: 'Αποθήκευση' }).click();
    await page.waitForTimeout(300);
    const err0 = await panel.locator('#doDlyErr').innerText();
    ok(c('no_reason_refused'), /Διάλεξε αιτία/.test(err0) && await panel.count() === 1 && writesSince(n0).length === 0, { err0, w: writesSince(n0) });
    await page.keyboard.press('Escape');

    // ── 3) delay on a LOADING (single point): panel → reason → one stop PATCH → order In Transit ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await lateBtn('recRIGEXL0000001').click();
    await panel.waitFor({ timeout: 5000 });
    await panel.locator('input[value="loading_wait"]').check();
    await panel.scrollIntoViewIfNeeded();
    await shot('delay-panel-open');
    n0 = F.writes.length;
    await panel.locator('button.do-btn', { hasText: 'Αποθήκευση' }).click();
    await settle(async () => /Καθυστέρηση · Πελάτης: Αναμονή στη φόρτωση/.test(await rowText('recRIGEXL0000001')));
    let w = writesSince(n0);
    const sp = w.filter(x => x.table === 'STOPS');
    ok(c('loading_one_stop_patch'), sp.length === 1 && sp[0].recId === 'recRIGSEXL1L' && sp[0].fields.Performance === 'Delayed' && sp[0].fields['Delay Reason'] === 'loading_wait'
      && sp[0].fields['Delay Note'] === null && sp[0].fields['Completed At'] && sp[0].fields['Completed By'] && !('Delay Responsibility' in sp[0].fields), w);
    ok(c('loading_then_order_in_transit'), w.length === 2 && w[1].table === 'ORDERS' && w[1].fields.Status === 'In Transit' && F.stops.recRIGSEXL1L.fields['Delay Responsibility'] === 'client', w);
    ok(c('loading_row_says_why'), /Φορτώθηκε ✓.*Καθυστέρηση · Πελάτης: Αναμονή στη φόρτωση/.test(await rowText('recRIGEXL0000001')), await rowText('recRIGEXL0000001'));
    await page.locator('#r_recRIGEXL0000001').scrollIntoViewIfNeeded();

    // ── 4) «Άλλο» without a note refused; with a note written ─────────────────
    n0 = F.writes.length;
    await lateBtn('recRIGEXL0000002').click();
    await panel.waitFor({ timeout: 5000 });
    await panel.locator('input[value="other"]').check();
    const hintOther = await panel.locator('#doDlyHint').innerText();
    const noteFocused = await page.evaluate(() => document.activeElement && document.activeElement.id === 'doDlyNote');
    await panel.locator('#doDlyNote').fill('   ');
    await panel.locator('button.do-btn', { hasText: 'Αποθήκευση' }).click();
    await page.waitForTimeout(300);
    const errOther = await panel.locator('#doDlyErr').innerText();
    ok(c('other_without_note_refused'), /«Άλλο»/.test(errOther) && /υποχρεωτική/.test(hintOther) && noteFocused && writesSince(n0).length === 0 && await panel.count() === 1, { errOther, hintOther, noteFocused, w: writesSince(n0) });
    await panel.locator('#doDlyNote').fill('Ο αποστολέας άλλαξε ράμπα <b>χωρίς</b> ειδοποίηση');
    await panel.locator('button.do-btn', { hasText: 'Αποθήκευση' }).click();
    await settle(async () => /Άλλο: Ο αποστολέας/.test(await rowText('recRIGEXL0000002')));
    w = writesSince(n0);
    ok(c('other_with_note_written_and_escaped'), w[0] && w[0].fields['Delay Reason'] === 'other' && w[0].fields['Delay Note'] === 'Ο αποστολέας άλλαξε ράμπα <b>χωρίς</b> ειδοποίηση'
      && /Άλλο: Ο αποστολέας άλλαξε ράμπα <b>χωρίς<\/b> ειδοποίηση/.test(await rowText('recRIGEXL0000002')), { w, row: await rowText('recRIGEXL0000002') });

    // ── 5) delay on a DELIVERY point (multi-stop): only the stop, then the other point closes the order Delayed ──
    await page.locator('#r_recRIGIMM0000001 button.do-btn', { hasText: 'Παραδόθηκε' }).click();   // opens the points
    await page.waitForTimeout(400);
    n0 = F.writes.length;
    await page.locator('tr.do-sub button.do-late-btn').first().click();
    await panel.waitFor({ timeout: 5000 });
    const multiTitle = await panel.locator('h4').innerText();
    await panel.locator('input[value="unloading_wait"]').check();
    await panel.locator('#doDlyNote').fill('3 ώρες στη ράμπα');
    await panel.locator('button.do-btn', { hasText: 'Αποθήκευση' }).click();
    await settle(async () => F.writes.length > n0);
    await page.waitForTimeout(500);
    w = writesSince(n0);
    ok(c('delivery_point_only_stop_written'), /Καθυστέρηση παράδοσης · σημείο 1/.test(multiTitle) && w.length === 1 && w[0].recId === 'recRIGSIMMU1' && w[0].fields['Delay Reason'] === 'unloading_wait' && w[0].fields['Delay Note'] === '3 ώρες στη ράμπα', { multiTitle, w });
    const subTxt = await page.evaluate(() => [...document.querySelectorAll('tr.do-sub')].map(t => t.innerText.replace(/\s+/g, ' ')).join(' | '));
    ok(c('delivery_point_shows_its_reason'), /Καθυστέρηση ✓\s*Παραλήπτης: Αναμονή στην εκφόρτωση — 3 ώρες στη ράμπα/.test(subTxt), subTxt);
    await page.locator('tr.do-sub button.do-btn', { hasText: 'Παραδόθηκε' }).first().click();
    await settle(async () => F.writes.some((x, i) => i >= n0 && x.table === 'ORDERS'));
    await page.waitForTimeout(500);
    w = writesSince(n0);
    const op = w.find(x => x.table === 'ORDERS');
    ok(c('delivery_aggregate_delayed'), op && op.recId === 'recRIGIMM0000001' && op.fields.Status === 'Delivered' && op.fields['Delivery Performance'] === 'Delayed', w);
    // the declared order, its points opened: each point says what happened
    await page.evaluate(() => _opsToggleStops('recRIGIMM0000001'));
    await page.waitForTimeout(300);
    await page.locator('#r_recRIGIMM0000001').scrollIntoViewIfNeeded();
    ok(c('delivery_row_says_why'), /Παραδόθηκε ✓.*Καθυστέρηση · Παραλήπτης: Αναμονή στην εκφόρτωση — 3 ώρες στη ράμπα/.test(await rowText('recRIGIMM0000001')), await rowText('recRIGIMM0000001'));
    await shot('delay-stop-after');

    // ── 6) from the OVERDUE banner ────────────────────────────────────────────
    await page.evaluate(() => window.scrollTo(0, 0));
    n0 = F.writes.length;
    await lateBtn('recRIGOVD0000001').click();
    await panel.waitFor({ timeout: 5000 });
    await panel.locator('input[value="traffic"]').check();
    await shot('delay-panel-overdue', false);
    await panel.locator('button.do-btn', { hasText: 'Αποθήκευση' }).click();
    await settle(async () => (await page.locator('#r_recRIGOVD0000001').count()) === 0);
    w = writesSince(n0);
    ok(c('overdue_stop_then_order'), w.length === 2 && w[0].recId === 'recRIGSOVDU' && w[0].fields['Delay Reason'] === 'traffic' && w[0].fields.Performance === 'Delayed'
      && w[1].table === 'ORDERS' && w[1].fields.Status === 'Delivered' && w[1].fields['Delivery Performance'] === 'Delayed' && w[1].fields['Actual Delivery Date'] === day(0)
      && (await page.locator('#r_recRIGOVD0000001').count()) === 0, w);
    const tOv = await page.evaluate(() => window.__rig.toasts.slice(-1)[0] || '');
    ok(c('overdue_toast_names_the_reason'), /Σημειώθηκε ως καθυστερημένη · Εξωτερικοί: Κίνηση \/ ατύχημα/.test(tOv), tOv);

    // ── 7) the Worker drops the label: red, logged, the click not lost, nothing claimed ──
    await clearToasts();
    F.dropLabels = true;
    n0 = F.writes.length;
    await lateBtn('recRIGIMD0000002').click();
    await panel.waitFor({ timeout: 5000 });
    await panel.locator('input[value="customs"]').check();
    await panel.locator('button.do-btn', { hasText: 'Αποθήκευση' }).click();
    await settle(async () => F.writes.slice(n0).some(x => x.table === 'ORDERS'));
    await page.waitForTimeout(600);
    F.dropLabels = false;
    w = writesSince(n0);
    const red = await domToasts();
    const logged = await page.evaluate(() => window.__rig.logged.slice());
    const rowDrop = await rowText('recRIGIMD0000002');
    ok(c('readback_warns_red_and_logs'), red.some(t => /η ΑΙΤΙΑ ΔΕΝ κρατήθηκε από τον server/.test(t)) && logged.some(l => /daily-ops: delay reason recRIGSIMD2U \| Delay Reason not read back: sent customs, got nothing/.test(l)), { red, logged });
    ok(c('readback_click_not_lost'), w[0] && w[0].fields['Delay Reason'] === 'customs' && F.stops.recRIGSIMD2U.fields.Performance === 'Delayed'
      && w.some(x => x.table === 'ORDERS' && x.fields.Status === 'Delivered' && x.fields['Delivery Performance'] === 'Delayed'), w);
    ok(c('readback_screen_claims_nothing'), /Παραδόθηκε ✓.*Καθυστέρηση/.test(rowDrop) && !/Τελωνείο/.test(rowDrop), rowDrop);
    await page.locator('#r_recRIGIMD0000002').scrollIntoViewIfNeeded();
    await shot('delay-readback-warning', false);

    // ── 8) nothing the base would refuse was ever sent; the responsibility never written ──
    ok(c('no_base_violation'), F.violations.length === 0, F.violations);
    ok(c('responsibility_never_sent'), !F.writes.some(x => 'Delay Responsibility' in (x.fields || {})), null);
    out['errors_' + W] = errs.filter(e => !/favicon|Failed to load resource/.test(e));
    ok(c('no_page_errors'), !out['errors_' + W].some(e => /pageerror/.test(e)), out['errors_' + W]);
    await ctx.close();
  }

  await browser.close();
  const failed = Object.entries(out.checks).filter(([, v]) => !v.ok).map(([k]) => k);
  fs.writeFileSync(path.join(outDir, 'daily-ops-delay-rig.json'), JSON.stringify(out, null, 2));
  console.log(`checks ${Object.keys(out.checks).length - failed.length}/${Object.keys(out.checks).length}` + (failed.length ? ' · FAILED: ' + failed.join(', ') : ''));
  console.log('screens: ' + out.screens.join(', '));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
