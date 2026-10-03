// Proof rig — audit A4 (owner go 3/10): unticking «National Groupage» on ONE
// national order must NOT delete the groupage truck (CONSOLIDATED LOAD) the
// other customers are still on. Drives the REAL edit form: openNatlEdit →
// untick → submitNatlOrder. Recorded 28/8 backend (HAR) for the screen; the
// groupage tables are an in-memory stub answering the Worker's filter shapes.
//   A. this order + ANOTHER order's Assigned line on the truck → no CL/NL
//      DELETE, this order's line PATCHed 'Unassigned', the other line untouched.
//   B. this order alone on the truck → CL + its national load DELETEd.
//   C. the share-check read fails (503) → no DELETE, a visible warning.
// Run from a checkout root that has node_modules + .har (symlinks are fine):
//   PW_BASE_URL=http://127.0.0.1:<port>/ node tests/critics/groupage-off-shared-cl-rig.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { GL: 'tblxUAaIsUMEDl3qQ', CL: 'tbl5XSLQjOnG6yLCW', NL: 'tblVW42cZnfC47gTb', NO: 'tblGHCCsTMqAy4KR2' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const J = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

async function run(name, { otherOnTruck, shareCheckFails = false }) {
  console.log(`\n── ${name}`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await preparePage(page, 'owner');
  const writes = [];
  const gl = new Map();
  let noId = null;
  await page.route(`**/${HOST}/**`, async route => {
    const req = route.request(); const u = new URL(req.url());
    const m = u.pathname.match(/\/v0\/[^/]+\/([^/]+)(?:\/([^/]+))?$/);
    if (!m) return route.fallback();
    const [, table, rec] = m;
    const f = u.searchParams.get('filterByFormula') || '';
    const method = req.method();
    if (method !== 'GET') {
      let body = null; try { body = req.postDataJSON(); } catch (_) {}
      writes.push({ method, table, rec, fields: body && body.fields });
      if (method === 'PATCH' && table === T.GL && gl.has(rec)) Object.assign(gl.get(rec).fields, body.fields || {});
      if (method === 'DELETE') return J(route, 200, { id: rec, deleted: true });
      return J(route, 200, { id: rec || 'recNEW', createdTime: new Date().toISOString(), fields: (body && body.fields) || {}, records: [] });
    }
    if (table === T.GL) {
      let mm;
      if ((mm = f.match(/Linked Consolidated Load.*\{Status\}="Assigned"/)) && /^AND\(FIND\("([^"]+)"/.test(f)) {
        if (shareCheckFails) return J(route, 503, { error: { type: 'UPSTREAM', message: 'stub 503' } });
        const cl = f.match(/^AND\(FIND\("([^"]+)"/)[1];
        return J(route, 200, { records: [...gl.values()].filter(r => (r.fields['Linked Consolidated Load'] || []).includes(cl) && r.fields.Status === 'Assigned') });
      }
      if ((mm = f.match(/FIND\("([^"]+)",ARRAYJOIN\(\{Linked National Order\}/)))
        return J(route, 200, { records: [...gl.values()].filter(r => (r.fields['Linked National Order'] || []).includes(mm[1])) });
      return J(route, 200, { records: [] });
    }
    if (table === T.NL && /Source Consolidated Load/.test(f)) {
      const cl = f.match(/FIND\("([^"]+)"/)[1];
      return J(route, 200, { records: cl === 'recCLtruck' ? [{ id: 'recNLtruck', createdTime: '', fields: { Name: 'GRP truck' } }] : [] });
    }
    if (table === T.CL && rec) return J(route, 200, { id: rec, createdTime: '', fields: {} });
    return route.fallback();
  });
  await gotoPage(page, 'orders_natl', BASE);
  await page.waitForFunction(() => typeof window.openNatlEdit === 'function' && typeof window.submitNatlOrder === 'function', null, { timeout: 30000 });
  noId = await page.evaluate(async () => {
    if (typeof loadOrdersNatlData === 'function') { try { await loadOrdersNatlData(); } catch (_) {} }
    const r = await atGetAll(TABLES.NAT_ORDERS, {}, true);
    return (r[0] || {}).id || null;
  });
  ok(!!noId, `a national order to edit: ${noId}`);
  if (!noId) { await browser.close(); return; }
  gl.set('recGLmine', { id: 'recGLmine', createdTime: '', fields: { Status: 'Assigned', 'Linked National Order': [noId], 'Linked Consolidated Load': ['recCLtruck'] } });
  if (otherOnTruck) gl.set('recGLother', { id: 'recGLother', createdTime: '', fields: { Status: 'Assigned', 'Linked National Order': ['recOTHERorder'], 'Linked Consolidated Load': ['recCLtruck'] } });

  await page.evaluate(id => openNatlEdit(id), noId);
  await page.waitForSelector('#nf_Groupage', { state: 'attached', timeout: 15000 });
  const toasts = await page.evaluate(async id => {
    window.__toasts = [];
    const t0 = window.toast; window.toast = (m, k) => { window.__toasts.push([String(m), k || '']); return t0 && t0(m, k); };
    const e0 = window.showErrorToast; window.showErrorToast = (m, k) => { window.__toasts.push([String(m), k || 'error']); return e0 && e0(m, k); };
    document.getElementById('nf_Groupage').checked = false;          // the user unticks «Εθνική Ομαδοποίηση»
    try { await submitNatlOrder(id); } catch (e) { window.__toasts.push(['THROW ' + e.message, 'throw']); }
    return window.__toasts;
  }, noId);
  await page.waitForTimeout(800);
  const patchedNO = writes.find(w => w.method === 'PATCH' && w.table === T.NO && w.rec === noId);
  ok(patchedNO && patchedNO.fields && patchedNO.fields['National Groupage'] === false, 'the order was saved with National Groupage = false' + (patchedNO ? '' : ' (no PATCH — toasts: ' + JSON.stringify(toasts) + ')'));
  const delCL = writes.filter(w => w.method === 'DELETE' && w.table === T.CL);
  const delNL = writes.filter(w => w.method === 'DELETE' && w.table === T.NL);
  const glPatches = writes.filter(w => w.method === 'PATCH' && w.table === T.GL);
  if (shareCheckFails) {
    ok(delCL.length === 0 && delNL.length === 0, 'read failed → NO truck deleted');
    ok(toasts.some(([m, k]) => k === 'warn' && /ΔΕΝ σβήστηκε|δεν σβήστηκε/.test(m)), 'a visible warning: ' + JSON.stringify(toasts.filter(t => t[1] === 'warn')));
  } else if (otherOnTruck) {
    ok(delCL.length === 0, 'shared truck NOT deleted' + (delCL.length ? ' — DELETE ' + delCL.map(d => d.rec) : ''));
    ok(delNL.length === 0, 'its national load NOT deleted');
    ok(gl.get('recGLmine').fields.Status === 'Unassigned', "this order's line → Unassigned");
    ok(gl.get('recGLother').fields.Status === 'Assigned' && !glPatches.some(w => w.rec === 'recGLother'), "the other order's line untouched");
  } else {
    ok(delCL.length === 1 && delCL[0].rec === 'recCLtruck', 'last order off the truck → CL deleted');
    ok(delNL.length === 1 && delNL[0].rec === 'recNLtruck', '…and its national load');
    ok(gl.get('recGLmine').fields.Status === 'Unassigned', 'line → Unassigned (never deleted)');
  }
  ok(!writes.some(w => w.method === 'DELETE' && w.table === T.GL), 'no groupage line DELETE');
  await browser.close();
}

(async () => {
  await run('A. two customers on the truck, untick one', { otherOnTruck: true });
  await run('B. last customer on the truck, untick', { otherOnTruck: false });
  await run('C. share check read fails', { otherOnTruck: true, shareCheckFails: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
