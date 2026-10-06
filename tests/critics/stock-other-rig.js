// Rig: stock lots Φ1 on the Ημερήσιο and the TRIP PnL (impact map 4/10 C-01, C-03, C-04, C-05,
// E-15, D-11, D-12).
//
// Usage (cwd = the MAIN repo root: it holds node_modules and .har/):
//   node <worktree>/tests/critics/stock-other-rig.js <baseURL> <outDir>
// Reference data (trucks, drivers, partners, locations, clients) replays from the 28/8 HAR
// (tests/critics/auth.js). ORDERS, ORDER STOPS, /pallets/* and /costs/* are answered by an in-memory
// facade below: every write is CAPTURED, nothing is sent anywhere. Real app code throughout
// (daily_ops.js, costs.js, pallet-feed.js, OrdersStock); stubbed in the page: confirmAction (no human),
// paSyncStatus (partner-assignment sync, not exercised here).
//
// Screens at 1440: Ημερήσιο with a lot intake + a piece loading + a loose piece (round 1 C1-02: in the
// overdue LOADINGS zone with the K6 hint), the same after «Παραλαβή αποθήκης», and after a REFUSED
// «Φορτώθηκε» on a piece (round 1 X1: the stop stamp is put back); TRIP PnL with a lot RT and a VS export + piece RT, and the same
// with the allocation read failing.
// Round 3 (fix list X1–X3): the top-bar Undo of the intake removes its PENDING movement and only says a
// CONFIRMED one (X3, critic-1 R2-4); a double click on «Παραλαβή αποθήκης» writes ONE movement (X2,
// critic-3 Σ2-07); a lot on our own truck gets a line that names the lot and its pallets (X1, R2-1).
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '../..');
const req = m => require(require.resolve(m, { paths: [process.cwd(), ROOT] }));
const { chromium } = req('playwright');
const { preparePage, gotoPage } = require(path.join(__dirname, 'auth.js'));
const { repair } = require(path.join(__dirname, 'repair-har.js'));
const [,, baseURL, outDir] = process.argv;
if (!baseURL || !outDir) { console.error('usage: node stock-other-rig.js <baseURL> <outDir>'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const ORDERS = 'tblgHlNmLBH3JTdIM', STOPS = 'tblaeY5QOHAS1gyE8';
const W = +(process.env.RIG_W || 1440);

// Closest RECORDED request for reference reads whose fields[] grew since 28/8 (same as stock-shelf-rig).
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

function makeFacade() {
  // refuse: { orderRec: <422 body> } — the facade answers that ORDERS PATCH with a designed refusal (round 1 X1)
  const F = { orders: {}, stops: {}, writes: [], pallets: [], costs: [], stockFail: false, ready: false, refuse: {}, movs: [], movSeq: 0, palletGetDelay: 0 };
  const isEmpty = v => v == null || (Array.isArray(v) && !v.length);
  const read = o => { const f = {}; for (const [k, v] of Object.entries(o.fields)) if (!isEmpty(v)) f[k] = v; return { id: o.id, createdTime: '2026-10-01T00:00:00.000Z', fields: f }; };
  F.read = read;
  const d10 = v => String(v || '').slice(0, 10);
  F.list = (table, fm) => {
    fm = fm || '';
    if (table === STOPS) {
      const ids = [...new Set([...fm.matchAll(/RECORD_ID\(\)\s*=\s*["']([^"']+)["']/g)].map(m => m[1]))];   // a record once, like the Worker
      return ids.map(id => F.stops[id]).filter(Boolean).map(read);
    }
    const live = Object.values(F.orders);
    let m;
    if (!fm) return live.map(read);
    if (fm.startsWith('OR(IS_SAME(')) {            // the day window
      const t = (/IS_SAME\(\{Loading DateTime\},'(\d{4}-\d{2}-\d{2})'/.exec(fm) || [])[1];
      return live.filter(o => d10(o.fields['Loading DateTime']) === t || d10(o.fields['Delivery DateTime']) === t).map(read);
    }
    const open = s => ['Assigned', 'Pending', ''].includes(s || '');
    if (fm.startsWith('AND(IS_BEFORE({Delivery DateTime}')) return live.filter(o => d10(o.fields['Delivery DateTime']) < day(0) && (open(o.fields.Status) || o.fields.Status === 'In Transit')).map(read);
    if (fm.startsWith('AND(IS_BEFORE({Loading DateTime}')) return live.filter(o => d10(o.fields['Loading DateTime']) < day(0) && open(o.fields.Status)).map(read);
    if ((m = /\{Matched Import ID\}='([^']*)'/.exec(fm))) return [];
    if ((m = /RECORD_ID\(\)\s*=\s*['"]([^'"]+)['"]/.exec(fm))) return live.filter(o => o.id === m[1]).map(read);
    return [];
  };
  return F;
}

async function installRoutes(page, F, costs) {
  await page.route(`**/${HOST}/**`, async route => {
    const r = route.request(), url = new URL(r.url());
    const hdr = { 'content-type': 'application/json', 'access-control-allow-origin': r.headers()['origin'] || '*' };
    const send = (status, body) => route.fulfill({ status, headers: hdr, body: JSON.stringify(body) });
    if (!F.ready) return bridge(route);
    const m = r.method();
    if (url.pathname.startsWith('/pallets/')) {
      F.pallets.push(m + ' ' + url.pathname + url.search);
      if (m === 'POST') (F.palletBodies = F.palletBodies || []).push(r.postDataJSON());
      if (url.pathname === '/pallets/gate') {
        const recs = (url.searchParams.get('order_recs') || '').split(',').filter(Boolean);
        return send(200, { records: recs.filter(x => F.orders[x]).map(x => ({ order_rec: x, order_id: F.orders[x].pg })) });
      }
      // Round 3: movements are KEPT (GET by stop/order, DELETE of a pending row only — the Worker answers
      // 409 for any other), so a second intake, an undo and a double click see what was written.
      if (url.pathname === '/pallets/movements') {
        if (m === 'POST') { const b = r.postDataJSON() || {}; const row = { id: ++F.movSeq, status: b.confirm ? 'confirmed' : 'pending', ...b }; F.movs.push(row); return send(200, { record: row }); }
        const stop = url.searchParams.get('order_stop_rec'), ord = url.searchParams.get('order_rec');
        // read NOW, answered after the delay: a read that ran before another call's write landed (X2)
        const recs = F.movs.filter(x => (!stop || x.order_stop_rec === stop) && (!ord || x.order_rec === ord)).map(x => ({ ...x }));
        if (F.palletGetDelay) await new Promise(res => setTimeout(res, F.palletGetDelay));
        return send(200, { records: recs });
      }
      const mv = /^\/pallets\/movements\/(\d+)$/.exec(url.pathname);
      if (mv && m === 'DELETE') {
        const i = F.movs.findIndex(x => x.id === +mv[1] && x.status === 'pending');
        if (i < 0) return send(409, { error: 'Confirmed movements are never deleted — use reverse' });
        F.movs.splice(i, 1); return send(200, { deleted: true });
      }
      return send(200, { records: [] });
    }
    if (url.pathname.startsWith('/costs/')) {
      const res = url.pathname.split('/')[2];
      F.costs.push(res);
      if (res === 'stock-lots' && F.stockFail) return send(500, { error: 'Ο επιμερισμός δεν διαβάστηκε' });
      return costs && costs[res] ? send(200, costs[res]) : send(200, { records: [] });
    }
    const seg = url.pathname.split('/').filter(Boolean), table = seg[2], recId = seg[3];
    // With the local relays (060) in the same release, Daily Ops reads LOCAL MOVES for the day's
    // orders. The 28/8 HAR has no such read, so it went to the network, failed, and its retries held
    // the re-render past this rig's waits (X3 read an empty row). No relays here: an empty answer.
    if (table === 'local_moves') return send(200, { records: [] });
    if (![ORDERS, STOPS].includes(table)) return bridge(route);
    const store = table === ORDERS ? F.orders : F.stops;
    if (m === 'GET' && !recId) return send(200, { records: F.list(table, url.searchParams.get('filterByFormula')) });
    if (m === 'GET') return store[recId] ? send(200, F.read(store[recId])) : send(404, { error: { type: 'NOT_FOUND' } });
    const body = r.postDataJSON ? r.postDataJSON() : null;
    F.writes.push({ m, table, recId, fields: body && body.fields, refused: !!(m === 'PATCH' && table === ORDERS && F.refuse[recId]) });
    if (m === 'PATCH' && table === ORDERS && F.refuse[recId]) return send(422, F.refuse[recId]);
    if (m === 'PATCH' && store[recId]) { Object.assign(store[recId].fields, body.fields || {}); return send(200, F.read(store[recId])); }
    return send(200, { id: recId || 'recNEW', fields: (body && body.fields) || {} });
  });
}

async function open(browser, role, route, F, costs, bootDone) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, baseURL, locale: 'el-GR', timezoneId: 'Europe/Athens' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('requestfailed', r => { if (r.url().includes(HOST)) errs.push('requestfailed: ' + r.method() + ' ' + decodeURIComponent(r.url()).slice(0, 200)); });
  page.on('dialog', d => d.accept());
  await preparePage(page, role);
  await installRoutes(page, F, costs);
  await gotoPage(page, route, baseURL);
  await page.locator('#sidebar').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => typeof OrdersStock !== 'undefined' && typeof preloadReferenceData === 'function', null, { timeout: 20000 });
  await page.evaluate(() => preloadReferenceData());
  // The app's own boot render of the page (before the facade is ready) reads the HAR; wait for it to
  // settle, or its late answer overwrites the rig's data after the first screenshot (seen 4/10).
  // Its last step paints `bootDone`; only then is the facade switched on.
  await page.waitForFunction(sel => !!document.querySelector(sel), bootDone, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  // The boot render ran against the 28/8 HAR, which has no answer for today's queries: its
  // «Σφάλμα σύνδεσης» toasts and failed requests are the recording's, not the code's — cleared.
  await page.evaluate(() => document.querySelectorAll('#tms-toast-container > *').forEach(n => n.remove()));
  errs.length = 0;
  const ref = await page.evaluate(() => ({
    trucks: getRefTrucks().filter(r => r.fields.Active).slice(0, 2).map(r => r.id),
    drivers: getRefDrivers().filter(r => r.fields.Active).slice(0, 2).map(r => r.id),
    partners: getRefPartners().slice(0, 1).map(r => r.id),
    clients: getRefClients().filter(r => r.fields['Company Name']).slice(0, 2).map(r => r.id),
    locs: getRefLocations().filter(r => r.fields.Name && r.fields.Country).slice(0, 4).map(r => r.id),
  }));
  await page.evaluate(() => {
    window.__rig = { toasts: [] };
    window.confirmAction = async () => true;
    window.paSyncStatus = async () => null;
    const t0 = window.toast; window.toast = (m, ty) => { window.__rig.toasts.push((ty || 'success') + ': ' + m); return t0 && t0(m, ty); };
  });
  return { ctx, page, errs, ref };
}

(async () => {
  const out = { screens: [], checks: {} };
  const ok = (name, cond, detail) => { out.checks[name] = { ok: !!cond, detail }; };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(outDir, name), fullPage: true }); out.screens.push(name); };
  const browser = await chromium.launch();

  // ── 1) Ημερήσιο (dispatcher) ───────────────────────────────────────────────
  {
    const F = makeFacade();
    const { ctx, page, errs, ref } = await open(browser, 'dispatcher', 'daily_ops', F, null, '.do-page .do-kpis, .do-page .do-err');
    const [T1] = ref.trucks, [D1] = ref.drivers, [PA1] = ref.partners, [C1, C2] = ref.clients, [L1, L2, WH] = ref.locs;
    const o = (id, f, stops) => {
      F.orders[id] = { id, fields: Object.assign({ Type: 'International' }, f, { 'ORDER STOPS': stops.map(s => s[0]) }) };
      stops.forEach(([sid, type, loc, n]) => { F.stops[sid] = { id: sid, fields: { 'Parent Order': [id], 'Stop Type': type, 'Stop Number': 1, Location: [loc], Pallets: n } }; });
    };
    o('recRIGLOT0000312', { Direction: 'Import', Client: [C1], 'Loading DateTime': day(-1), 'Delivery DateTime': day(0), Partner: [PA1], 'Is Partner Trip': true, Status: 'In Transit', 'Total Pallets': 33, 'Pallet Exchange': true, 'Own Stock Lot': 'recRIGSTOCKLOTA1', 'Order No': 312, Reference: 'LOT-A' },
      [['recRIGSTLOTL0001', 'Loading', L1, 33], ['recRIGSTLOTU0001', 'Unloading', WH, 33]]);
    o('recRIGIMP0000001', { Direction: 'Import', Client: [C2], 'Loading DateTime': day(-2), 'Delivery DateTime': day(0), Truck: [T1], Driver: [D1], Status: 'In Transit', 'Total Pallets': 20 },
      [['recRIGSTIMPL0001', 'Loading', L2, 20], ['recRIGSTIMPU0001', 'Unloading', L1, 20]]);
    o('recRIGPC10000001', { Direction: 'Import', Client: [C1], 'Loading DateTime': day(0), 'Delivery DateTime': day(2), Truck: [T1], Driver: [D1], 'Group ID': 'GI-RIG|recRIGIMP0000002', Status: 'Assigned', 'Total Pallets': 5, 'Stock Lot': ['recRIGSTOCKLOTA1'], 'Stock Lot Order No': 312, 'Stock Lot Source': 'intl', Reference: 'TEST-STOCK-P1' },
      [['recRIGSTPC1L0001', 'Loading', WH, 5], ['recRIGSTPC1U0001', 'Unloading', L2, 5]]);
    o('recRIGPC20000002', { Direction: 'Import', Client: [C1], 'Loading DateTime': day(-3), 'Delivery DateTime': day(-2), Status: 'Pending', 'Total Pallets': 4, 'Stock Lot': ['recRIGSTOCKLOTA1'], 'Stock Lot Order No': 312, Reference: 'TEST-STOCK-P2' },
      [['recRIGSTPC2L0001', 'Loading', WH, 4], ['recRIGSTPC2U0001', 'Unloading', L2, 4]]);
    o('recRIGOLD0000001', { Direction: 'Export', Client: [C2], 'Loading DateTime': day(-2), 'Delivery DateTime': day(1), Status: 'Pending', 'Total Pallets': 12 },
      [['recRIGSTOLDL0001', 'Loading', L1, 12], ['recRIGSTOLDU0001', 'Unloading', L2, 12]]);
    o('recRIGEXP0000001', { Direction: 'Export', Client: [C2], 'Loading DateTime': day(0), 'Delivery DateTime': day(2), Truck: [T1], Driver: [D1], Status: 'Assigned', 'Total Pallets': 18 },
      [['recRIGSTEXPL0001', 'Loading', L1, 18], ['recRIGSTEXPU0001', 'Unloading', L2, 18]]);
    F.ready = true;
    await page.evaluate(async () => { invalidateCache(TABLES.ORDERS); OPS.date = 'today'; await renderDailyOps(); });
    await page.locator('.do-page .do-kpis').waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => {
      const row = id => { const el = document.getElementById('r_' + id); return el ? el.innerText.replace(/\s+/g, ' ') : null; };
      const kpis = [...document.querySelectorAll('.do-kpi')].map(k => k.innerText.replace(/\s+/g, ' '));
      const inZone = (key, id) => !!document.querySelector('#' + key + ' #r_' + id);
      const heads = Object.fromEntries([...document.querySelectorAll('.do-sec-h')].map(h => [h.firstChild.textContent.trim(), (h.querySelector('span') || {}).textContent]));
      return { lot: row('recRIGLOT0000312'), imp: row('recRIGIMP0000001'), piece: row('recRIGPC10000001'), loose: row('recRIGPC20000002'), old: row('recRIGOLD0000001'), kpis, heads,
        looseInLoads: inZone('ovLoad', 'recRIGPC20000002'), looseInDels: inZone('ovL', 'recRIGPC20000002'),
        zones: [...document.querySelectorAll('.do-zone')].map(z => z.innerText.replace(/\s+/g, ' ')) };
    });
    ok('C01_lot_tag_and_button', /→ ΑΠΟΘΗΚΗ/.test(s.lot || '') && /Παραλαβή αποθήκης/.test(s.lot || '') && !/Παραδόθηκε/.test(s.lot || ''), s.lot);
    ok('C01_ordinary_delivery_unchanged', /Παραδόθηκε/.test(s.imp || '') && !/ΑΠΟΘΗΚΗ/.test(s.imp || ''), s.imp);
    ok('C01_kpi_deliveries_without_lot', /ΠΑΡΑΔΟΣΕΙΣ 0 \/ 1 δηλωμένη/.test(s.kpis.join(' | ')), s.kpis);
    ok('C04_piece_subline', /ΑΠ · 5p · παρτίδα #312/.test(s.piece || ''), s.piece);
    // Round 1 C1-02 (was C-05 «in no zone»): the loose piece is the late item — in the LOADINGS zone,
    // once, with the K6 hint and its lot line (C4-09), never with «Φορτώθηκε».
    ok('C102_loose_piece_in_loadings_zone', s.looseInLoads && !s.looseInDels && /χωρίς φορτηγό — από το ΑΠΟΘΕΜΑ του Εβδομαδιαίου/.test(s.loose || '')
      && /ΑΠ · 4p · παρτίδα #312/.test(s.loose || '') && !/Φορτώθηκε|Παραδόθηκε/.test(s.loose || '') && s.old !== null && /Φορτώθηκε/.test(s.old || ''), { loose: s.loose, zones: s.zones });
    ok('C108_lot_late_is_intake', /Παραλαβή \(καθυστέρηση\)/.test(s.lot || '') && !/Καθυστέρησε/.test(s.lot || '') && /Καθυστέρησε/.test(s.imp || ''), s.lot);
    ok('C111_section_counts_like_kpi', s.heads['ΠΑΡΑΔΟΣΕΙΣ ΕΙΣΑΓΩΓΗΣ'] === '1 · 0 δηλωμένες · 1 παραλαβή αποθήκης', s.heads);
    await shot(page, 'daily-ops-stock-1440.png');

    const n0 = F.writes.length;
    await page.locator('#r_recRIGLOT0000312 button.do-btn', { hasText: 'Παραλαβή αποθήκης' }).click();
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => ({ row: (document.getElementById('r_recRIGLOT0000312') || {}).innerText, toasts: window.__rig.toasts.slice() }));
    const w = F.writes.slice(n0).map(x => ({ m: x.m, table: x.table === ORDERS ? 'ORDERS' : 'STOPS', rec: x.recId, fields: x.fields }));
    const patch = w.find(x => x.table === 'ORDERS' && x.rec === 'recRIGLOT0000312');
    ok('C01_intake_write_is_delivered', patch && patch.fields.Status === 'Delivered' && patch.fields['Actual Delivery Date'], w);
    ok('C01_done_word_and_toast', /Στην αποθήκη ✓/.test(after.row || '') && after.toasts.some(t => /Στην αποθήκη ✓/.test(t)), after);
    // OWNER-Q7 answered 4/10 (coordinator queue #6, «Να γράφεται και η αποθήκη»): the intake writes ONE
    // pending partner movement (locked pallet case #4) — never a client DELIVERY (Ε5: the client exchanges
    // once, at the lot's loading).
    const palletPosts = F.pallets.filter(p => p.startsWith('POST'));
    const pb = (F.palletBodies || [])[0] || {};
    ok('C03_lot_intake_one_partner_movement', palletPosts.length === 1 && pb.counterparty_type === 'PARTNER' && pb.event_type === 'PARTNER_PICKUP'
      && pb.given === 33 && pb.taken === 0 && !pb.confirm && !pb.client_rec, { posts: F.pallets, body: pb });
    await shot(page, 'daily-ops-stock-after-intake-1440.png');

    // Round 3 X3 (critic-1 R2-4): the top-bar Undo of the intake takes its PENDING movement with it —
    // the order back first, then the movement; a CONFIRMED one is said once and never deleted.
    const clearToasts = () => page.evaluate(() => { window.__rig.toasts.length = 0; document.querySelectorAll('#tms-toast-container > *').forEach(n => n.remove()); });
    const domToasts = () => page.evaluate(() => [...document.querySelectorAll('#tms-toast-container > *')].map(n => n.innerText.replace(/\s+/g, ' ')));
    const intakeRows = () => F.movs.filter(x => x.order_stop_rec === 'recRIGSTLOTU0001' && x.event_type === 'PARTNER_PICKUP');
    const undo = async () => {
      await clearToasts();
      const label = await page.locator('#undoBtn').getAttribute('title');
      const p0 = F.pallets.length;
      await page.locator('#undoBtn').click();
      await page.waitForTimeout(2500);
      return { label, pallets: F.pallets.slice(p0), toasts: await page.evaluate(() => window.__rig.toasts.slice()), dom: await domToasts(),
        row: await page.evaluate(() => ((document.getElementById('r_recRIGLOT0000312') || {}).innerText || '').replace(/\s+/g, ' ')) };
    };
    const pendId = (intakeRows()[0] || {}).id;
    const u1 = await undo();
    ok('X3_undo_deletes_pending_intake', !!pendId && u1.pallets.includes('DELETE /pallets/movements/' + pendId) && !intakeRows().length
      && F.orders.recRIGLOT0000312.fields.Status === 'In Transit' && /Παραλαβή αποθήκης/.test(u1.row) && !/Στην αποθήκη ✓/.test(u1.row), { pendId, ...u1, movs: F.movs });
    await shot(page, 'daily-ops-stock-undo-intake-1440.png');
    // the same lot taken in again; its movement then CONFIRMED (the sheet came in) before the Undo
    await page.locator('#r_recRIGLOT0000312 button.do-btn', { hasText: 'Παραλαβή αποθήκης' }).click();
    await page.waitForTimeout(2500);
    intakeRows().forEach(x => { x.status = 'confirmed'; });
    const nConf = intakeRows().length;
    const u2 = await undo();
    const confLine = 'Παλέτες αποθήκης #312 (33p): η κίνηση παλετών επιβεβαιώθηκε — αντιλογισμός από το Ισοζύγιο';
    ok('X3_confirmed_said_never_deleted', nConf === 1 && !u2.pallets.some(x => x.startsWith('DELETE')) && intakeRows().length === 1
      && u2.dom.filter(t => t.includes(confLine)).length === 1, { nConf, ...u2 });
    await shot(page, 'daily-ops-stock-undo-confirmed-1440.png');

    // Round 1 X1 (critic-3 Σ-02): the order write is REFUSED after the stop stamp → the stamp is put
    // back, the Greek reason shows ONCE (core/api.js), the context line never says «Ξαναδοκίμασε».
    F.refuse.recRIGPC10000001 = { error: { type: 'STOCK_RULE', code: 'lot_invoiced', message: 'Η παρτίδα είναι τιμολογημένη — η κατάσταση του κομματιού δεν αλλάζει' } };
    await page.evaluate(() => { window.__rig.toasts.length = 0; document.querySelectorAll('#tms-toast-container > *').forEach(n => n.remove()); });
    const n1 = F.writes.length;
    await page.locator('#r_recRIGPC10000001 button.do-btn', { hasText: 'Φορτώθηκε' }).click();
    await page.waitForTimeout(2500);
    const rf = await page.evaluate(() => ({ row: (document.getElementById('r_recRIGPC10000001') || {}).innerText, toasts: window.__rig.toasts.slice(),
      dom: [...document.querySelectorAll('#tms-toast-container > *')].map(n => n.innerText.replace(/\s+/g, ' ')) }));
    const w1 = F.writes.slice(n1).map(x => ({ m: x.m, table: x.table === ORDERS ? 'ORDERS' : 'STOPS', rec: x.recId, fields: x.fields, refused: x.refused }));
    const stopW = w1.filter(x => x.table === 'STOPS' && x.rec === 'recRIGSTPC1L0001');
    ok('X1_refused_stamp_rolled_back', stopW.length === 2 && stopW[0].fields['Completed At'] && stopW[1].fields['Completed At'] === null && stopW[1].fields['Completed By'] === null
      && w1.some(x => x.table === 'ORDERS' && x.refused) && !F.stops.recRIGSTPC1L0001.fields['Completed At'] && F.orders.recRIGPC10000001.fields.Status === 'Assigned', w1);
    const reason = rf.dom.filter(t => /τιμολογημένη/.test(t)).length + rf.toasts.filter(t => /τιμολογημένη/.test(t)).length;
    ok('X1_said_once_and_true', reason === 1 && rf.toasts.some(t => /σφραγίδα του σημείου αναιρέθηκε/.test(t)) && !rf.toasts.concat(rf.dom).some(t => /Ξαναδοκίμασε|δεν γράφτηκε τίποτα/.test(t))
      && /Φορτώθηκε/.test(rf.row || '') && !/Φορτώθηκε ✓/.test(rf.row || ''), rf);
    await shot(page, 'daily-ops-stock-refused-1440.png');

    // Round 3 X2 (critic-3 Σ2-07): a DOUBLE click on «Παραλαβή αποθήκης» of a partner lot. Each read of the
    // movements answers 1 s late with what was there when it ran, so both intakes read «none».
    o('recRIGLOT0000314', { Direction: 'Import', Client: [C1], 'Loading DateTime': day(-1), 'Delivery DateTime': day(0), Partner: [PA1], 'Is Partner Trip': true, Status: 'In Transit', 'Total Pallets': 20, 'Pallet Exchange': true, 'Own Stock Lot': 'recRIGSTOCKLOTB1', 'Order No': 314, Reference: 'LOT-B' },
      [['recRIGSTLOTL0314', 'Loading', L1, 20], ['recRIGSTLOTU0314', 'Unloading', WH, 20]]);
    // X1 (critic-1 R2-1): a lot on our own truck — no partner to write a movement with
    o('recRIGLOT0000313', { Direction: 'Import', Client: [C1], 'Loading DateTime': day(-1), 'Delivery DateTime': day(0), Truck: [T1], Driver: [D1], Status: 'In Transit', 'Total Pallets': 20, 'Pallet Exchange': true, 'Own Stock Lot': 'recRIGSTOCKLOTC1', 'Order No': 313, Reference: 'LOT-C' },
      [['recRIGSTLOTL0313', 'Loading', L2, 20], ['recRIGSTLOTU0313', 'Unloading', WH, 20]]);
    await page.evaluate(async () => { invalidateCache(TABLES.ORDERS); invalidateCache(TABLES.ORDER_STOPS); await renderDailyOps(); });
    await page.locator('#r_recRIGLOT0000314 button.do-btn', { hasText: 'Παραλαβή αποθήκης' }).waitFor({ timeout: 15000 });
    F.palletGetDelay = 1000;
    const p2 = F.pallets.length;
    await page.locator('#r_recRIGLOT0000314 button.do-btn', { hasText: 'Παραλαβή αποθήκης' }).dblclick();
    await page.waitForTimeout(4000);
    F.palletGetDelay = 0;
    const posts314 = (F.palletBodies || []).filter(b => b.order_rec === 'recRIGLOT0000314');
    ok('X2_double_click_one_movement', posts314.length === 1 && F.movs.filter(x => x.order_stop_rec === 'recRIGSTLOTU0314').length === 1, { posts: posts314.length, calls: F.pallets.slice(p2) });

    await clearToasts();
    const nb = (F.palletBodies || []).length;
    await page.locator('#r_recRIGLOT0000313 button.do-btn', { hasText: 'Παραλαβή αποθήκης' }).click();
    await page.waitForTimeout(2500);
    const x1 = await domToasts();
    const x1Line = 'Παλέτες αποθήκης #313 (20p): χωρίς συνεργάτη — καταχώρησέ τις στο Ισοζύγιο';
    ok('X1_own_truck_line_names_lot_and_pallets', x1.filter(t => t.includes(x1Line)).length === 1 && (F.palletBodies || []).length === nb, x1);
    await shot(page, 'daily-ops-stock-intake-no-partner-1440.png');
    out.dailyOpsErrors = errs.filter(e => !/favicon|Failed to load resource/.test(e));
    await ctx.close();
  }

  // ── 2) TRIP PnL (owner) ─────────────────────────────────────────────────────
  for (const fail of [false, true]) {
    const F = makeFacade(); F.stockFail = fail;
    const t1 = { id: 501, code: 'RT-RIG-LOT', trip_type: 'PARTNER', partner_id: 9, revenue: 300, cost_gross: 300, cost_net: 300, profit_worst: 0, margin_worst_pct: 0, status: 'closed', date_start: day(-2), date_end: day(-1), scope: 'INTL' };
    const t2 = { id: 502, code: 'RT-RIG-PIECE', trip_type: 'OWNED', truck_id: 1, driver_id: 2, revenue: 2000 - 850 + 454.55, cost_gross: 900, cost_net: 800, profit_worst: 704.55, margin_worst_pct: 43.9, status: 'closed', date_start: day(-1), date_end: day(2), scope: 'INTL' };
    const costs = {
      pnl: { records: [t1, t2] },
      rt: { records: [{ id: 501, ct_rt_legs: [{ order_id: 9312, direction: 'IMPORT' }] }, { id: 502, ct_rt_legs: [{ order_id: 9401, direction: 'EXPORT' }, { order_id: 9402, direction: 'IMPORT' }] }] },
      lookups: { trucks: [{ id: 1, license_plate: 'ΑΒΓ-1234' }], drivers: [{ id: 2, full_name: 'Οδηγός Α' }], partners: [{ id: 9, company_name: 'Συνεργάτης Α' }] },
      'pallet-gate': { records: [] },
      lines: { records: [{ id: 1, rt_id: 501, category: 'partner_rate', net: 300, vat: 0 }, { id: 2, rt_id: 502, category: 'fuel', net: 800, vat: 100 }] },
      // stock_v_lot_money since round 2 #1: partner_cost / warehouse_charge / charge_total
      'stock-lots': { lots: [{ lot_rec: 'recRIGSTOCKLOTA1', allocation_status: 'ok', partner_cost: 300, warehouse_charge: null, charge_total: 300, net: 3000 }], pieces: [{ lot_rec: 'recRIGSTOCKLOTA1', piece_rec: 'recRIGPC10000001', amount: 454.55 }] },
    };
    const { ctx, page, errs, ref } = await open(browser, 'owner', 'costs', F, costs, '#ctList .ct-fail, #ctList .ct-card, #ctList > div:not(.ct-empty)');
    const [C1, C2] = ref.clients, [L1, L2, WH] = ref.locs;
    F.orders.recRIGLOT0000312 = { id: 'recRIGLOT0000312', pg: 9312, fields: { Direction: 'Import', Client: [C1], 'Loading Location 1': [L1], 'Unloading Location 1': [WH], 'Delivery DateTime': day(-1), Price: 3300, 'Order No': 312, 'Own Stock Lot': 'recRIGSTOCKLOTA1', Status: 'Delivered' } };
    F.orders.recRIGEXP0000001 = { id: 'recRIGEXP0000001', pg: 9401, fields: { Direction: 'Export', Client: [C2], 'Loading Location 1': [L1], 'Unloading Location 1': [L2], 'Loading DateTime': day(-1), Price: 2000, 'Veroia Switch': true, Status: 'Delivered' } };
    F.orders.recRIGPC10000001 = { id: 'recRIGPC10000001', pg: 9402, fields: { Direction: 'Import', Client: [C1], 'Loading Location 1': [WH], 'Unloading Location 1': [L1], 'Delivery DateTime': day(1), 'Stock Lot': ['recRIGSTOCKLOTA1'], 'Stock Lot Order No': 312, 'Stock Lot Source': 'intl', Status: 'In Transit' } };
    F.ready = true;
    await page.evaluate(async () => { invalidateCache(TABLES.ORDERS); await renderTripPnl(); });
    await page.waitForFunction(() => document.querySelectorAll('.ct-card').length >= 2, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const cards = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.ct-card')].map(c => [c.id, c.innerText.replace(/\s+/g, ' ')])));
    const lot = cards.ctCard501 || '', pc = cards.ctCard502 || '';
    const tag = fail ? 'unread_' : '';
    if (!fail) {
      ok('D11_lot_rt_no_unexplained', !/ανεξήγητη/.test(lot) && /€300/.test(lot) && !/€3\.300/.test(lot), lot);
      // Round 1 O11 (critic-5 S5-10): the lot line ≤ 6 words; one name for the one amount — since
      // round 2 #1 the partner's rate is «κόμιστρο συνεργάτη» (the owner's «Χρέωση αποθήκης» is another amount)
      ok('O11_lot_line_short_one_name', /· παρτίδα #312 · κόμιστρο συνεργάτη/.test(lot) && !/το καθαρό μοιράζεται/.test(lot) && !/κόστος αποθήκης/.test(lot) && /κόμιστρο συνεργάτη — καύσιμα/.test(lot), lot);
      ok('D12_piece_amount_and_vs_850', /από παρτίδα #312/.test(pc) && /€455/.test(pc) && /Veroia Switch: −€850 /.test(pc) && !/ανεξήγητη/.test(pc), pc);
    } else {
      ok(tag + 'said_per_leg_no_diff', /ο επιμερισμός δεν διαβάστηκε/.test(lot) && /ο επιμερισμός δεν διαβάστηκε/.test(pc) && !/ανεξήγητη|Veroia Switch: −/.test(lot + pc), { lot, pc });
    }
    ok(tag + 'stock_lots_read_once', F.costs.filter(c => c === 'stock-lots').length === 1, F.costs);
    await shot(page, fail ? 'trip-pnl-stock-unread-1440.png' : 'trip-pnl-stock-1440.png');
    out[fail ? 'tripPnlUnreadErrors' : 'tripPnlErrors'] = errs.filter(e => !/favicon|Failed to load resource/.test(e));
    await ctx.close();
  }

  await browser.close();
  const failed = Object.entries(out.checks).filter(([, v]) => !v.ok).map(([k]) => k);
  fs.writeFileSync(path.join(outDir, 'stock-other-rig.json'), JSON.stringify(out, null, 2));
  console.log(`checks ${Object.keys(out.checks).length - failed.length}/${Object.keys(out.checks).length}` + (failed.length ? ' · FAILED: ' + failed.join(', ') : ''));
  console.log('screens: ' + out.screens.join(', '));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
