// Proof rig — national Wave 0 (4/10/2026, before the first national dispatcher):
//   P1-α  editing a national order with 2+ delivery points must keep each stop's
//         pallets/date, never write 0, never reset the load to Pending, and a
//         removed point must leave the load too;
//   P1-β  a groupage without ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ is refused (the truck would sit in no column);
//   PU-1  «National Groupage» is hidden on the international form, its value kept.
// The forms OPEN in a real browser (CLAUDE.md: order forms are opened and tested
// before push) against a small in-memory facade; every write is captured and the
// assertions read the PAYLOADS — what reaches the base — not the toast.
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/natl-wave0-proof.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { NO: 'tblGHCCsTMqAy4KR2', NL: 'tblVW42cZnfC47gTb', ST: 'tblaeY5QOHAS1gyE8', CL: 'tblFWKAQVUzAM8mCE', LOC: 'tblxu8DRfTQOFRCzS', ORD: 'tblgHlNmLBH3JTdIM' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// ── The «base» ──────────────────────────────────────────────────────────────
function seed() {
  const L = ['recLocLoad00000A', 'recLocDelA00000B', 'recLocDelB00000C', 'recLocDelC00000D'];
  const db = {
    [T.LOC]: L.map((id, i) => ({ id, fields: { Name: ['Fruit Pack', 'Store Alpha', 'Store Beta', 'Store Gamma'][i], City: ['Veroia', 'Athens', 'Patra', 'Larisa'][i], Country: 'Greece' } })),
    [T.CL]: [{ id: 'recClient000001A', fields: { 'Company Name': 'Test Client AE' } }],
    [T.NO]: [{ id: 'recNatOrder0001A', fields: {
      Direction: 'North→South', Type: 'Independent', Goods: 'Fruit', Pallets: 20, 'Pallet Exchange': false,
      'Loading DateTime': '2026-10-05', 'Delivery DateTime': '2026-10-06',
      Client: ['recClient000001A'], 'Pickup Location 1': [L[0]],
      'Delivery Location 1': [L[1]], 'Delivery Location 2': [L[2]], 'Delivery Location 3': [L[3]],
      Notes: 'old note', 'National Groupage': false } }],
    [T.NL]: [{ id: 'recNatLoad00001A', fields: {
      'Source National Order': ['recNatOrder0001A'], Direction: 'North→South', Status: 'Assigned', Truck: ['recTruck000001AA'],
      'Total Pallets': 20, 'Pickup Location 1': [L[0]],
      'Delivery Location 1': [L[1]], 'Delivery Location 2': [L[2]], 'Delivery Location 3': [L[3]] } }],
    [T.ST]: [
      st('recStopL1000000A', 'Parent Nat Order', 'recNatOrder0001A', 'Loading', 1, L[0], 20, '2026-10-05'),
      st('recStopU1000000A', 'Parent Nat Order', 'recNatOrder0001A', 'Unloading', 1, L[1], 8, '2026-10-06'),
      st('recStopU2000000A', 'Parent Nat Order', 'recNatOrder0001A', 'Unloading', 2, L[2], 6, '2026-10-07', 'πρωί'),
      st('recStopU3000000A', 'Parent Nat Order', 'recNatOrder0001A', 'Unloading', 3, L[3], 6, '2026-10-08'),
      st('recNlStopL100000', 'Parent Nat Load', 'recNatLoad00001A', 'Loading', 1, L[0], 20, '2026-10-05'),
      st('recNlStopU100000', 'Parent Nat Load', 'recNatLoad00001A', 'Unloading', 1, L[1], 8, '2026-10-06'),
      st('recNlStopU200000', 'Parent Nat Load', 'recNatLoad00001A', 'Unloading', 2, L[2], 6, '2026-10-06'),
      st('recNlStopU300000', 'Parent Nat Load', 'recNatLoad00001A', 'Unloading', 3, L[3], 6, '2026-10-06'),
    ],
  };
  return { db, L };
}
function st(id, parent, pid, type, n, loc, pal, date, note) {
  const f = { [parent]: [pid], 'Stop Number': n, 'Stop Type': type, Location: [loc], Pallets: pal, DateTime: date };
  if (note) f.Notes = note;
  return { id, fields: f };
}
let seq = 0;
const newId = () => 'recNew' + String(++seq).padStart(10, '0');
function withReverse(db, rec, tableId) {
  if (tableId !== T.NO && tableId !== T.NL) return rec;
  const key = tableId === T.NO ? 'Parent Nat Order' : 'Parent Nat Load';
  const ids = db[T.ST].filter(s => (s.fields[key] || [])[0] === rec.id).map(s => s.id);
  return { id: rec.id, fields: Object.assign({}, rec.fields, ids.length ? { 'ORDER STOPS': ids } : {}) };
}
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
      if (opts.stopsFail && tid === T.ST) return json(route, { error: 'stub: stops down' }, 500);
      if (rid) { const r = tbl.find(x => x.id === rid); return r ? json(route, withReverse(db, r, tid)) : json(route, { error: { type: 'NOT_FOUND' } }, 404); }
      const f = u.searchParams.get('filterByFormula') || '';
      let out = tbl;
      const ids = f.match(/RECORD_ID\(\)="(rec[A-Za-z0-9]+)"/g);
      if (ids) { const want = new Set(ids.map(x => x.match(/"(rec[^"]+)"/)[1])); out = tbl.filter(r => want.has(r.id)); }
      const src = f.match(/FIND\("(rec[A-Za-z0-9]+)",\s*ARRAYJOIN\(\{Source National Order\}/);
      if (src) out = tbl.filter(r => (r.fields['Source National Order'] || [])[0] === src[1]);
      if (/Linked National Order/.test(f)) out = [];
      return json(route, { records: out.map(r => withReverse(db, r, tid)) });
    }
    const body = req.postDataJSON ? req.postDataJSON() : null;
    S.writes.push({ m, tid, rid, body });
    if (m === 'PATCH') {
      if (rid) { const r = tbl.find(x => x.id === rid); if (r) applyFields(r.fields, body.fields); return json(route, r ? withReverse(db, r, tid) : {}); }
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
  await page.waitForFunction(() => typeof openNatlEdit === 'function' && typeof submitNatlOrder === 'function', null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__toasts = [];
    const t0 = window.toast; window.toast = (m, k) => { window.__toasts.push([String(m), k || '']); try { return t0 && t0(m, k); } catch (_) {} };
    const e0 = window.showErrorToast; window.showErrorToast = (m, k) => { window.__toasts.push([String(m), k || 'error']); try { return e0 && e0(m, k); } catch (_) {} };
  });
  return { page, S };
}
const cards = page => page.$$eval('#sf_rows .grp-row', rows => rows.map(r => {
  const uid = r.id.replace('simr_', '');
  return { loc: (document.getElementById('lv_nsl' + uid) || {}).value || '', pal: document.getElementById('simp' + uid).value, date: document.getElementById('simd' + uid).value, note: document.getElementById('simn' + uid).value };
}));
const writesTo = (S, tid) => S.writes.filter(w => w.tid === tid && w.m !== 'GET');
const stopsOf = (S, key, id) => S.db[T.ST].filter(s => (s.fields[key] || [])[0] === id && s.fields['Stop Type'] === 'Unloading')
  .sort((a, b) => a.fields['Stop Number'] - b.fields['Stop Number']);

(async () => {
  const browser = await chromium.launch();

  console.log('\n── P1-α · edit a 3-point national order, change only the notes');
  let { page, S } = await newPage(browser);
  await page.evaluate(() => openNatlEdit('recNatOrder0001A'));
  await page.waitForSelector('#sf_rows .grp-row', { timeout: 20000 }); await page.waitForTimeout(400);
  let c = await cards(page);
  ok(c.length === 3 && c.map(x => x.pal).join('/') === '8/6/6', 'edit opens each card with ITS pallets: ' + c.map(x => x.pal).join('/'));
  ok(c.map(x => x.date).join(',') === '2026-10-06,2026-10-07,2026-10-08', 'edit opens each card with ITS date: ' + c.map(x => x.date).join(','));
  ok(c[1].note === 'πρωί', 'edit opens card 2 with its note');
  await page.fill('#nf_Notes', 'new note');
  await page.evaluate(() => submitNatlOrder('recNatOrder0001A'));
  await page.waitForTimeout(2500);
  const u = stopsOf(S, 'Parent Nat Order', 'recNatOrder0001A');
  ok(u.map(s => s.fields.Pallets).join('/') === '8/6/6', 'order stops after save: ' + u.map(s => s.fields.Pallets).join('/') + ' (no 0)');
  ok(u.map(s => s.fields.DateTime).join(',') === '2026-10-06,2026-10-07,2026-10-08', 'order stop dates kept: ' + u.map(s => s.fields.DateTime).join(','));
  const nlPatch = writesTo(S, T.NL).find(w => w.m === 'PATCH' && w.rid === 'recNatLoad00001A');
  ok(nlPatch && !('Status' in nlPatch.body.fields), 'load PATCH carries no Status (an assigned load is not reset to Pending)');
  ok(S.db[T.NL][0].fields.Status === 'Assigned' && (S.db[T.NL][0].fields.Truck || [])[0] === 'recTruck000001AA', 'load still Assigned with its truck');
  const nlU = stopsOf(S, 'Parent Nat Load', 'recNatLoad00001A');
  ok(nlU.map(s => s.fields.DateTime).join(',') === '2026-10-06,2026-10-07,2026-10-08', 'load stops take each delivery\'s own date: ' + nlU.map(s => s.fields.DateTime).join(','));
  ok(nlU.map(s => s.fields.Pallets).join('/') === '8/6/6', 'load stops pallets: ' + nlU.map(s => s.fields.Pallets).join('/'));
  ok(S.db[T.NO][0].fields.Notes === 'new note' && S.db[T.NO][0].fields.Pallets === 20, 'order: notes changed, total 20 kept');
  ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
  await page.context().close();

  console.log('\n── P1-α · a card left empty is refused, nothing written');
  ({ page, S } = await newPage(browser));
  await page.evaluate(() => openNatlEdit('recNatOrder0001A'));
  await page.waitForSelector('#sf_rows .grp-row', { timeout: 20000 }); await page.waitForTimeout(400);
  const uid2 = await page.$eval('#sf_rows .grp-row:nth-child(2)', r => r.id.replace('simr_', ''));
  await page.fill('#simp' + uid2, '');
  const before = S.writes.length;
  await page.evaluate(() => submitNatlOrder('recNatOrder0001A'));
  await page.waitForTimeout(1200);
  let toasts = await page.evaluate(() => window.__toasts);
  ok(toasts.some(([m]) => /Συμπλήρωσε παλέτες και ημερομηνία .*σημείο 2/.test(m)), 'message names the empty point: ' + JSON.stringify(toasts.map(t => t[0]).slice(-1)));
  ok(S.writes.length === before, 'no write at all (' + (S.writes.length - before) + ')');
  await page.context().close();

  console.log('\n── P1-α · remove the middle point');
  ({ page, S } = await newPage(browser));
  await page.evaluate(() => openNatlEdit('recNatOrder0001A'));
  await page.waitForSelector('#sf_rows .grp-row', { timeout: 20000 }); await page.waitForTimeout(400);
  const midUid = await page.$eval('#sf_rows .grp-row:nth-child(2)', r => r.id.replace('simr_', ''));
  await page.evaluate(uid => _simDelRow(Number(uid)), midUid);
  await page.evaluate(() => submitNatlOrder('recNatOrder0001A'));
  await page.waitForTimeout(2500);
  const no = S.db[T.NO][0].fields;
  ok((no['Delivery Location 2'] || [])[0] === S.L[3] && !no['Delivery Location 3'], 'order: point 3 moved to slot 2, slot 3 cleared');
  const u2 = stopsOf(S, 'Parent Nat Order', 'recNatOrder0001A');
  ok(u2.length === 2 && u2[1].fields.Location[0] === S.L[3] && u2[1].fields.Pallets === 6 && u2[1].fields.DateTime === '2026-10-08', 'order stop #2 carries the moved point with ITS 6 pallets and 8/10');
  const nl = S.db[T.NL][0].fields;
  ok((nl['Delivery Location 2'] || [])[0] === S.L[3] && !nl['Delivery Location 3'], 'load: removed point gone from the Weekly load (slot 3 cleared)');
  await page.context().close();

  console.log('\n── P1-α · stops cannot be read → empty cards → refused');
  ({ page, S } = await newPage(browser, { stopsFail: true }));
  await page.evaluate(() => openNatlEdit('recNatOrder0001A'));
  await page.waitForSelector('#sf_rows .grp-row', { timeout: 30000 }); await page.waitForTimeout(400);
  c = await cards(page);
  ok(c.length === 3 && c.every(x => x.pal === ''), 'cards open empty (no guess): ' + c.map(x => x.pal || '∅').join('/'));
  const b2 = S.writes.length;
  await page.evaluate(() => submitNatlOrder('recNatOrder0001A'));
  await page.waitForTimeout(1200);
  toasts = await page.evaluate(() => window.__toasts);
  ok(toasts.some(([m]) => /Συμπλήρωσε παλέτες και ημερομηνία/.test(m)) && S.writes.length === b2, 'save refused, nothing written');
  await page.context().close();

  console.log('\n── P1-β · groupage without direction');
  ({ page, S } = await newPage(browser));
  await page.evaluate(() => openNatlCreate());
  await page.waitForSelector('#nf_Direction', { timeout: 20000 }); await page.waitForTimeout(300);
  await page.evaluate(() => _natlMode(1));
  const b3 = S.writes.length;
  await page.evaluate(() => _grpSubmit());
  await page.waitForTimeout(600);
  toasts = await page.evaluate(() => window.__toasts);
  ok(/Η κατεύθυνση είναι υποχρεωτική/.test((toasts[toasts.length - 1] || [''])[0]) && S.writes.length === b3, 'refused: «Η κατεύθυνση είναι υποχρεωτική», nothing written');
  await page.selectOption('#nf_Direction', 'North→South');
  await page.evaluate(() => _grpSubmit());
  await page.waitForTimeout(600);
  toasts = await page.evaluate(() => window.__toasts);
  ok(/Σημείο φόρτωσης/.test((toasts[toasts.length - 1] || [''])[0]), 'with a direction the next check speaks (the guard does not block everything)');
  await page.context().close();

  console.log('\n── PU-1 · «National Groupage» hidden on the international form');
  ({ page, S } = await newPage(browser));
  await page.evaluate(() => openIntlCreate());
  await page.waitForSelector('#f_Groupage', { state: 'attached', timeout: 20000 });
  const g = await page.$eval('#f_Groupage', el => ({ visible: !!el.offsetParent, checked: el.checked, labelVisible: !!el.closest('label').offsetParent }));
  ok(!g.visible && !g.labelVisible, 'checkbox and label not visible');
  ok(g.checked === false, 'value kept (new order: unchecked)');
  const vs = await page.$eval('#f_VeroiaSwitch', el => !!el.offsetParent);
  ok(vs, 'Veroia Switch still visible next to it');
  await page.context().close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
