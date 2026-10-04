// Proof rig — national ORDER, Wave 1 (4/10/2026, national readiness §4):
//   #8   the national order card reads its assignment from the order's NATIONAL
//        LOAD (truck → plate, groupage → «μέσω ομαδοποίησης», load read failed →
//        «unknown», never «ΠΡΟΣ ΑΝΑΘΕΣΗ»);
//   #9   toolbar Undo right after creating a national order removes the ORDER
//        (not its load), and a national order is never «restored» as a new Ε-n
//        without a load;
//   STOPS a failed ORDER_STOPS write is heard (logError + warn) and the load is
//        not synced from stale stops.
// The screens OPEN in a real browser against a small in-memory facade; every
// write is captured and the assertions read the PAYLOADS, not the toast.
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/natl-order-wave1-proof.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { NO: 'tblGHCCsTMqAy4KR2', NL: 'tblVW42cZnfC47gTb', ST: 'tblaeY5QOHAS1gyE8', CL: 'tblFWKAQVUzAM8mCE', LOC: 'tblxu8DRfTQOFRCzS',
  TR: 'tblEAPExIAjiA3asD', DR: 'tbl7UGmYhc2Y82pPs' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

function seed() {
  const L = ['recLocLoad00000A', 'recLocDelA00000B', 'recLocDelB00000C'];
  const order = (id, client, extra) => ({ id, fields: Object.assign({
    Direction: 'North→South', Type: 'Independent', Goods: 'Fruit', Pallets: 10, 'Pallet Exchange': false,
    'Loading DateTime': '2026-10-12', 'Delivery DateTime': '2026-10-13', Client: [client],
    'Pickup Location 1': [L[0]], 'Delivery Location 1': [L[1]], 'National Groupage': false }, extra || {}) });
  const db = {
    [T.LOC]: L.map((id, i) => ({ id, fields: { Name: ['Fruit Pack', 'Store Alpha', 'Store Beta'][i], City: ['Veroia', 'Athens', 'Patra'][i], Country: 'Greece' } })),
    [T.CL]: [{ id: 'recClient000001A', fields: { 'Company Name': 'Test Client AE' } },
             { id: 'recClient000002B', fields: { 'Company Name': 'Fresh Client AE' } }],
    [T.TR]: [{ id: 'recTruck000001AA', fields: { 'License Plate': 'ΚΖΗ-4321', Active: true } }],
    [T.DR]: [{ id: 'recDriver00001AA', fields: { 'Full Name': 'Γιώργος Οδηγός', Active: true } }],
    [T.NO]: [
      order('recNatOrdTruck01', 'recClient000001A', { Reference: 'WITH-TRUCK' }),
      order('recNatOrdGroup02', 'recClient000001A', { Reference: 'GROUPAGE', 'National Groupage': true }),
      order('recNatOrdOpen003', 'recClient000001A', { Reference: 'NO-TRUCK' }),
    ],
    [T.NL]: [
      { id: 'recNatLoadTruck1', fields: { 'Source National Order': ['recNatOrdTruck01'], Direction: 'North→South', Status: 'Assigned', Truck: ['recTruck000001AA'], Driver: ['recDriver00001AA'] } },
      { id: 'recNatLoadOpen03', fields: { 'Source National Order': ['recNatOrdOpen003'], Direction: 'North→South', Status: 'Pending' } },
    ],
    [T.ST]: [],
  };
  return { db, L };
}
let seq = 0;
const newId = () => 'recNew' + String(++seq).padStart(10, '0');
function applyFields(target, fields) {
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === null || (Array.isArray(v) && v.length === 0)) delete target[k]; else target[k] = v;
  }
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const { db, L } = seed();
  const S = { db, L, writes: [], errors: [] };
  page.on('pageerror', e => S.errors.push(String(e)));
  page.on('dialog', d => d.accept());
  await preparePage(page, 'dispatcher');
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, async route => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const mm = u.pathname.match(/\/v0\/[^/]+\/(tbl[A-Za-z0-9]+)(?:\/(rec[A-Za-z0-9]+))?$/);
    if (!mm) return m === 'GET' ? json(route, { records: [] }) : json(route, { ok: true });
    const [, tid, rid] = mm; const tbl = db[tid] || (db[tid] = []);
    if (m === 'GET') {
      if (opts.nlFail && tid === T.NL) return json(route, { error: 'stub: national loads down' }, 500);
      if (rid) { const r = tbl.find(x => x.id === rid); return r ? json(route, r) : json(route, { error: { type: 'NOT_FOUND' } }, 404); }
      const f = u.searchParams.get('filterByFormula') || '';
      let out = tbl;
      const ids = f.match(/RECORD_ID\(\)="(rec[A-Za-z0-9]+)"/g);
      if (ids) { const want = new Set(ids.map(x => x.match(/"(rec[^"]+)"/)[1])); out = tbl.filter(r => want.has(r.id)); }
      // Every FIND("rec…",ARRAYJOIN({Field})) in the formula (natLoadsFor ORs up to 90).
      const finds = [...f.matchAll(/FIND\("(rec[A-Za-z0-9]+)",\s*ARRAYJOIN\(\{([^}]+)\}/g)];
      if (finds.length) out = tbl.filter(r => finds.some(([, id, fld]) => (r.fields[fld] || []).includes(id)));
      return json(route, { records: out });
    }
    const body = req.postDataJSON ? req.postDataJSON() : null;
    S.writes.push({ m, tid, rid, body });
    if (opts.stopsWriteFail && tid === T.ST) return json(route, { error: 'stub: stops write down' }, 500);
    if (m === 'PATCH') {
      if (rid) { const r = tbl.find(x => x.id === rid); if (r) applyFields(r.fields, body.fields); return json(route, r || {}); }
      const out = (body.records || []).map(x => { const r = tbl.find(y => y.id === x.id); if (r) applyFields(r.fields, x.fields); return r; });
      return json(route, { records: out.filter(Boolean) });
    }
    if (m === 'POST') {
      const recs = body.records || [{ fields: body.fields }];
      const made = recs.map(x => { const r = { id: newId(), fields: {} }; applyFields(r.fields, x.fields); tbl.push(r); return r; });
      return json(route, body.records ? { records: made } : made[0]);
    }
    if (m === 'DELETE') { const i = tbl.findIndex(x => x.id === rid); if (i >= 0) tbl.splice(i, 1); return json(route, { id: rid, deleted: true }); }
    return route.fallback();
  });
  await page.addInitScript(() => localStorage.setItem('tms_orders_hub_demo_dispatcher', JSON.stringify({ scope: 'natl', view: 'catalog' })));
  await gotoPage(page, 'orders', BASE);
  // The module lives in an IIFE: wait for the catalog to show the seeded rows
  // (loadOrdersNatlData resolved → the orders AND their loads were read).
  await page.waitForFunction(() => typeof openNatlEdit === 'function' && typeof submitNatlOrder === 'function'
    && document.body.innerText.includes('WITH-TRUCK'), null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__toasts = []; window.__logs = [];
    const t0 = window.toast; window.toast = (m, k) => { window.__toasts.push([String(m), k || '']); try { return t0 && t0(m, k); } catch (_) {} };
    const e0 = window.showErrorToast; window.showErrorToast = (m, k) => { window.__toasts.push([String(m), k || 'error']); try { return e0 && e0(m, k); } catch (_) {} };
    const l0 = window.logError; window.logError = (e, ctx) => { window.__logs.push(String(ctx)); try { return l0 && l0(e, ctx); } catch (_) {} };
  });
  return { page, S };
}
const card = async (page, id) => {
  await page.evaluate(id => selectNatlOrder(id), id);
  return page.$eval('#natlDetail', el => ({ text: el.innerText, key: (el.querySelector('[data-assign]') || {}).dataset?.assign || '' }));
};
// Fill the national create form: client 2 (no orders → the duplicate guard stays quiet).
async function fillCreate(page, L) {
  await page.evaluate(() => openNatlCreate());
  await page.waitForSelector('#nf_Direction', { timeout: 20000 }); await page.waitForTimeout(400);
  await page.evaluate(L => {
    document.getElementById('nf_Direction').value = 'North→South';
    document.getElementById('nf_LoadDate').value = '2026-10-12';
    document.getElementById('lv_nclient').value = 'recClient000002B';
    document.getElementById('lv_npickup').value = L[0];
    const no = document.querySelector('input[name="nf_PalletExch"][value="no"]'); if (no) no.checked = true;
    const uid = document.querySelector('#sf_rows .grp-row').id.replace('simr_', '');
    document.getElementById('lv_nsl' + uid).value = L[1];
    document.getElementById('simp' + uid).value = '12';
    document.getElementById('simd' + uid).value = '2026-10-13';
  }, L);
}
const since = (S, n, pred) => S.writes.slice(n).filter(pred);

(async () => {
  const browser = await chromium.launch();

  console.log('\n── #8 · the card reads the assignment from the national LOAD');
  let { page, S } = await newPage(browser);
  let c = await card(page, 'recNatOrdTruck01');
  ok(c.key === 'own' && /ΚΖΗ-4321/.test(c.text) && /Γιώργος Οδηγός/.test(c.text), 'load with a truck → card shows plate + driver (' + c.key + ')');
  ok(!/ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(c.text), 'no «ΠΡΟΣ ΑΝΑΘΕΣΗ» anywhere on that card');
  c = await card(page, 'recNatOrdGroup02');
  ok(c.key === 'grp' && /Μέσω ομαδοποίησης/.test(c.text) && !/ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(c.text), 'groupage order → «μέσω ομαδοποίησης» (' + c.key + ')');
  c = await card(page, 'recNatOrdOpen003');
  ok(c.key === 'pa' && /ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(c.text), 'load without a vehicle → honest «ΠΡΟΣ ΑΝΑΘΕΣΗ» (' + c.key + ')');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();

  console.log('\n── #8 · national load read returns 500');
  ({ page, S } = await newPage(browser, { nlFail: true }));
  c = await card(page, 'recNatOrdTruck01');
  ok(c.key === 'unknown' && /Άγνωστη/.test(c.text) && /ΑΝΑΘΕΣΗ ΑΓΝΩΣΤΗ/.test(c.text), 'card says the assignment is unknown (' + c.key + ')');
  ok(!/ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(c.text), 'never «ΠΡΟΣ ΑΝΑΘΕΣΗ» when the load was not read');
  c = await card(page, 'recNatOrdGroup02');
  ok(c.key === 'grp', 'groupage still «μέσω ομαδοποίησης» (needs no load)');
  await page.context().close();

  console.log('\n── #9 · Undo right after creating a national order');
  ({ page, S } = await newPage(browser));
  await fillCreate(page, S.L);
  let n0 = S.writes.length;
  await page.evaluate(() => submitNatlOrder());
  await page.waitForFunction(() => window.__toasts.some(([m]) => /καταχωρήθηκε/.test(m)), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const noPost = since(S, n0, w => w.m === 'POST' && w.tid === T.NO)[0];
  const newNo = noPost && S.db[T.NO].find(r => r.fields.Client && r.fields.Client[0] === 'recClient000002B');
  const newNl = newNo && S.db[T.NL].find(r => (r.fields['Source National Order'] || [])[0] === newNo.id);
  ok(!!newNo && !!newNl, 'created: order ' + (newNo && newNo.id) + ' + its load ' + (newNl && newNl.id));
  const ua = await page.evaluate(() => { const a = getUndoAction(); return a && { type: a.type, tableId: a.tableId, recId: a.recId }; });
  ok(ua && ua.type === 'create' && ua.tableId === T.NO && ua.recId === (newNo && newNo.id), 'the toolbar Undo points at the ORDER: ' + JSON.stringify(ua));
  n0 = S.writes.length;
  await page.evaluate(() => undoLastAction());
  await page.waitForTimeout(2500);
  const dels = since(S, n0, w => w.m === 'DELETE');
  ok(dels.length && dels[0].tid === T.NO && dels[0].rid === newNo.id, 'Undo DELETEs the order first: ' + dels.map(d => d.tid.slice(0, 6) + '/' + d.rid).join(', '));
  ok(!S.db[T.NO].some(r => r.id === newNo.id), 'the order is gone (its load and stops cascade in the base: trg_national_orders_soft_delete_cascade)');
  ok(since(S, n0, w => w.m === 'POST').length === 0, 'Undo creates nothing');
  const ua2 = await page.evaluate(() => getUndoAction());
  ok(ua2 === null, 'no «Restore» is offered for the national order afterwards');
  n0 = S.writes.length;
  const restored = await page.evaluate(NO => { const i = getTrash().findIndex(t => t.table === NO); return i < 0 ? 'no-trash' : atRestoreFromTrash(i).then(r => r ? r.id : null); }, T.NO);
  await page.waitForTimeout(500);
  const toasts = await page.evaluate(() => window.__toasts);
  ok(restored === null && since(S, n0, w => w.m === 'POST' && w.tid === T.NO).length === 0, 'trash «Επαναφορά» of a national order writes nothing (no new Ε-n without a load): ' + restored);
  ok(toasts.some(([m]) => /Η επαναφορά εθνικής παραγγελίας δεν γίνεται/.test(m)), 'and says why: ' + JSON.stringify((toasts[toasts.length - 1] || [''])[0]).slice(0, 90));
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();

  console.log('\n── STOPS · the ORDER_STOPS write returns 500 on a new order');
  ({ page, S } = await newPage(browser, { stopsWriteFail: true }));
  await fillCreate(page, S.L);
  n0 = S.writes.length;
  await page.evaluate(() => submitNatlOrder());
  await page.waitForFunction(() => window.__toasts.some(([m]) => /σημεία παράδοσης/.test(m)), null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(1500);
  let t = await page.evaluate(() => ({ toasts: window.__toasts, logs: window.__logs }));
  ok(since(S, n0, w => w.m === 'POST' && w.tid === T.NO).length === 1, 'the order itself was written');
  ok(since(S, n0, w => w.tid === T.ST && w.m !== 'GET').length > 0, 'the stops write was attempted (and 500ed)');
  ok(t.toasts.some(([m, k]) => /αποθηκεύτηκε, αλλά τα σημεία παράδοσης ΔΕΝ αποθηκεύτηκαν/.test(m) && k === 'warn'), 'warn: order saved, delivery points NOT saved');
  ok(t.logs.some(x => /ORDER_STOPS/.test(x)), 'logError recorded: ' + JSON.stringify(t.logs.filter(x => /ORDER_STOPS/.test(x))));
  ok(since(S, n0, w => w.tid === T.NL).length === 0, 'NO load write from stale stops (' + since(S, n0, w => w.tid === T.NL).length + ')');
  ok(!t.toasts.some(([m]) => /^Η παραγγελία καταχωρήθηκε$/.test(m)), 'no green «καταχωρήθηκε» over the warning');
  await page.context().close();

  console.log('\n── STOPS · the ORDER_STOPS write returns 500 on an edit');
  ({ page, S } = await newPage(browser, { stopsWriteFail: true }));
  await page.evaluate(() => openNatlEdit('recNatOrdTruck01'));
  await page.waitForSelector('#sf_rows .grp-row', { timeout: 20000 }); await page.waitForTimeout(500);
  await page.evaluate(() => { const uid = document.querySelector('#sf_rows .grp-row').id.replace('simr_', ''); document.getElementById('simp' + uid).value = '10'; document.getElementById('simd' + uid).value = '2026-10-13'; });
  await page.fill('#nf_Notes', 'edited');
  n0 = S.writes.length;
  await page.evaluate(() => submitNatlOrder('recNatOrdTruck01'));
  await page.waitForFunction(() => window.__toasts.some(([m]) => /σημεία παράδοσης/.test(m)), null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(1500);
  t = await page.evaluate(() => ({ toasts: window.__toasts, logs: window.__logs }));
  ok(S.db[T.NO].find(r => r.id === 'recNatOrdTruck01').fields.Notes === 'edited', 'the order edit itself was written');
  ok(t.toasts.some(([m, k]) => /ΔΕΝ αποθηκεύτηκαν/.test(m) && /φορτίο .*ΔΕΝ ενημερώθηκε/.test(m) && k === 'warn'), 'warn names the stops AND the un-updated load');
  ok(since(S, n0, w => w.tid === T.NL).length === 0, 'the load is not PATCHed from stale stops');
  ok(S.db[T.NL][0].fields.Status === 'Assigned' && (S.db[T.NL][0].fields.Truck || [])[0] === 'recTruck000001AA', 'the assigned load is untouched');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
