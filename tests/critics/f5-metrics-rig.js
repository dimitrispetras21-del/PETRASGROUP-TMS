// F5 stream (d4), Ε15 rig — «Η Απόδοσή μου» (Chief Ops profile), «Έλεγχος Μετρήσεων», «Ιστορικό Ενεργειών» read
// v5 national work from day L (plan 2026-10-28 §10 d4; read spec in the PR). Self-serving, like
// tests/critics/wn5-rig-kit.js: serves the tree in F5_TREE (default: this tree), fakes the Worker (facade + /plan/*
// + /audit) with synthetic ids only (public repo), aborts every other host.
//   node tests/critics/f5-metrics-rig.js                       — this tree
//   F5_BASE=<tree of origin/main> node tests/critics/f5-metrics-rig.js   — + flag off compared with main, byte for byte
//   F5_TREE=<tree of origin/main> node tests/critics/f5-metrics-rig.js   — NO-GO expected (no v5 reader there)
// app.html on main does not load core/plan-config.js yet: stream (e) adds it in the same bump that ships these
// modules. The rig adds that one <script> line in memory, right after core/plan-api.js, so it tests the shipped pair.
// «The table» of this rig = the requests it records (S.facade, S.plan) and the numbers on screen computed by hand
// from the fixtures below (comment at each check), never a toast.
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const WT = path.join(__dirname, '../..');
const TREE = path.resolve(process.env.F5_TREE || WT);
const BASE = process.env.F5_BASE ? path.resolve(process.env.F5_BASE) : null;
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const NOW = '2026-11-03T10:00:00+02:00';   // Tue 3/11 Athens, after the planned L (Sat 31/10)
const T = { NAT_ORDERS: 'tblGHCCsTMqAy4KR2', NAT_LOADS: 'tblVW42cZnfC47gTb' };

// ── fixtures ────────────────────────────────────────────────────────────────
// One old national load, delivered on time (Actual 20/10 ≤ planned 21/10).
const NAT_LOADS = [{ id: 'recRigNl1', fields: { Direction: 'North→South', Status: 'Delivered',
  'Delivery DateTime': '2026-10-21T08:00:00.000Z', 'Actual Delivery Date': '2026-10-20' } }];
// 9001/9002/9004 are v5 (nat-state answers a state), 9003 is the old model ("missing").
const NAT_ORDERS = [
  { id: 'recRigNo1', fields: { 'Order No': 9001, Price: 300, 'Delivery DateTime': '2026-11-02T08:00:00.000Z' } },
  { id: 'recRigNo2', fields: { 'Order No': 9002, Price: 200, Invoiced: true, 'Delivery DateTime': '2026-11-01T08:00:00.000Z' } },
  { id: 'recRigNo3', fields: { 'Order No': 9003, Price: 150, Status: 'Delivered' } },
  { id: 'recRigNo4', fields: { 'Order No': 9004, Price: 90, 'Delivery DateTime': '2026-11-06T08:00:00.000Z' } },
];
const st = (o) => Object.assign({ n_pieces: 1, n_executed: 0, executed: false, planned: true, late: false, hub_side: null, carriers: [] }, o);
const NAT_STATE = { 9001: st({ executed: true, n_executed: 1 }), 9002: st({ executed: true, n_executed: 1, late: true }),
  9003: 'missing', 9004: st({ planned: false, late: true }) };
const CONFIG = {
  before: [200, { cutover_day: null, opened_at: null, writes_open: false }],
  after: [200, { cutover_day: '2026-10-31', opened_at: '2026-10-30T15:30:00+02:00', writes_open: true }],
  unknown: [500, { error: { type: 'SERVER', code: 'rig_down', message: 'rig sentinel rig_down' } }],
};
const AUDIT_ROWS = [
  { id: 3, created_at: '2026-11-02T09:00:00+02:00', actor: 'rig', role: 'dispatcher', action: 'update', table_name: 'rt_stops', record_id: '701',
    before_data: { id: 701, side: 'KATHODOS', planned_from: '2026-11-02T06:00:00+02:00' }, after_data: { id: 701, side: 'ANODOS', planned_from: '2026-11-02T06:00:00+02:00' } },
  { id: 2, created_at: '2026-11-02T08:00:00+02:00', actor: 'rig', role: 'dispatcher', action: 'create', table_name: 'rt_vehicle_segments', record_id: '801',
    before_data: null, after_data: { id: 801, rt_id: 55 } },
  { id: 1, created_at: '2026-11-02T07:00:00+02:00', actor: 'rig', role: 'owner', action: 'create', table_name: 'local_moves', record_id: '901',
    before_data: null, after_data: { id: 901 } },
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function serve(tree) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const file = path.join(tree, decodeURIComponent(u.pathname === '/' ? '/app.html' : u.pathname));
    if (!file.startsWith(tree) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    let body = fs.readFileSync(file);
    // stream (e)'s line: core/plan-config.js right after core/plan-api.js (only if the tree lacks it)
    if (u.pathname === '/app.html' && !/core\/plan-config\.js/.test(body.toString())) {
      body = Buffer.from(body.toString().replace(/(<script src="core\/plan-api\.js[^"]*"><\/script>)/, '$1\n<script src="core/plan-config.js"></script>'));
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

let fails = 0;
const ok = (scn, name, cond, detail) => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${scn} ${name}${cond || detail === undefined ? '' : '  → ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600)}`);
  return !!cond;
};
const CONSOLE = [];
const PLANNED = new Set();

// opts: page ('performance'|'metrics_audit'|'audit_trail') · user ({username, role}) · config ('before'|'after'|'unknown')
//       · natState ('ok'|'fail'|'noroute') · natOrders ('ok'|'fail')
async function open(browser, origin, opts) {
  const ctx = await browser.newContext({ baseURL: origin + '/', viewport: { width: 1600, height: 1000 },
    serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  const S = { plan: [], facade: [], audit: [], pageErrors: [] };
  page.on('pageerror', (e) => S.pageErrors.push(String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') CONSOLE.push({ t: m.text().slice(0, 300), url: (m.location() || {}).url || '' }); });
  await page.addInitScript(({ u, pg }) => {
    localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig Test', role: u.role, username: u.username, loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600 * 1000 }));
    localStorage.setItem('tms_jwt', 'rig.f5.no-real-token');
    localStorage.setItem('tms_page', pg);
    localStorage.setItem('tms_sidebar_v2_migrated', '1');
    localStorage.setItem('tms_sidebar_collapsed', 'true');
  }, { u: opts.user, pg: opts.page });
  await page.route((u) => !u.href.startsWith(origin) && !u.href.includes(HOST), (route) => route.abort());
  const cors = { 'access-control-allow-origin': '*' };
  await page.route(`**/${HOST}/**`, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, cors) });
    const send = (status, ans) => {
      if (status >= 400) PLANNED.add(req.url());
      return route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(ans) });
    };
    if (u.pathname.startsWith('/plan/')) {
      S.plan.push({ m, path: u.pathname, q: Object.fromEntries(u.searchParams) });
      if (u.pathname === '/plan/config') return send(...CONFIG[opts.config]);
      if (u.pathname === '/plan/nat-state') {
        if (opts.natState === 'noroute') return send(404, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'rig sentinel no_route' } });
        if (opts.natState === 'fail') return send(500, { error: { type: 'SERVER', code: 'rig_down', message: 'rig sentinel rig_down' } });
        const ids = (u.searchParams.get('nat_order_ids') || '').split(',');
        return send(200, Object.fromEntries(ids.map((id) => [id, NAT_STATE[id] || 'missing'])));
      }
      return send(404, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'rig sentinel no_route' } });
    }
    if (u.pathname === '/audit') { S.audit.push(u.search); return send(200, { entries: AUDIT_ROWS }); }
    const tid = (u.pathname.match(/\/v0\/[^/]+\/([A-Za-z0-9]+)/) || [])[1];
    S.facade.push({ m, tid, q: u.search });
    if (m !== 'GET') return send(200, { ok: true });
    if (tid === T.NAT_ORDERS && opts.natOrders === 'fail') return send(500, { error: { type: 'SERVER', message: 'rig sentinel nat_orders' } });
    if (tid === T.NAT_ORDERS) return send(200, { records: NAT_ORDERS });
    if (tid === T.NAT_LOADS) return send(200, { records: NAT_LOADS });
    return send(200, { records: [] });
  });
  await page.goto('app.html');
  const ready = { performance: '.perf-kpi-grid', metrics_audit: '.ma-wrap', audit_trail: 'table' }[opts.page];
  try { await page.waitForSelector(`#content ${ready}`, { timeout: 20000 }); } catch (_) { S.pageErrors.push(`${opts.page} did not paint (${ready})`); }
  await page.waitForTimeout(300);
  return { page, S, ctx };
}
const SOTIRIS = { username: 'sotiris', role: 'dispatcher' };
const OWNER = { username: 'dimitris', role: 'owner' };
// The card whose label is `label`: its value and its «Στόχος …» line.
const card = (page, label) => page.evaluate((l) => {
  const k = [...document.querySelectorAll('.perf-kpi')].find((x) => x.querySelector('.perf-kpi-label').textContent.includes(l));
  return k ? { val: k.querySelector('.perf-kpi-val').textContent.replace(/\s+/g, ' ').trim(), target: k.querySelector('.perf-kpi-target').textContent.replace(/\s+/g, ' ').trim() } : null;
}, label);
// A metrics-audit row by key: [label, key, value, note].
const row = (page, key) => page.evaluate((k) => {
  const tr = [...document.querySelectorAll('.ma-table tr')].find((x) => (x.querySelector('.ma-key') || {}).textContent === k);
  return tr ? [...tr.children].map((td) => td.textContent.replace(/\s+/g, ' ').trim()) : null;
}, key);
const contentHtml = (page) => page.evaluate(() => document.getElementById('content').innerHTML);
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return { at: i, mine: a.slice(Math.max(0, i - 80), i + 120), base: b.slice(Math.max(0, i - 80), i + 120) }; };
const natOrdersReq = (S) => S.facade.filter((x) => x.tid === T.NAT_ORDERS).map((x) => x.q);

async function main() {
  const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), WT, path.join(WT, '../../..')] }));
  const srv = await serve(TREE);
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const bsrv = BASE ? await serve(BASE) : null;
  const borigin = bsrv ? `http://127.0.0.1:${bsrv.address().port}` : null;
  const browser = await chromium.launch();
  const sc = async (name, fn) => {
    try { await fn(name); } catch (e) { ok(name, 'scenario ran to the end', false, String(e && e.stack || e)); }
    for (const c of browser.contexts()) await c.close().catch(() => {});
  };
  console.log(`tree: ${TREE}${BASE ? `\nbase: ${BASE}` : ''}`);
  try {
    // ── BEFORE L: today's page, today's requests ──────────────────────────────
    await sc('perf-before', async (n) => {
      const { page, S } = await open(browser, origin, { page: 'performance', user: SOTIRIS, config: 'before' });
      ok(n, 'painted, no page errors', !S.pageErrors.length, S.pageErrors);
      ok(n, '/plan/*: only GET /plan/config', S.plan.length >= 1 && S.plan.every((x) => x.path === '/plan/config'), S.plan);
      ok(n, 'no NAT_ORDERS request (not made before L)', natOrdersReq(S).length === 0, natOrdersReq(S));
      // NAT_LOADS fixture: 1 delivered on time → today's formula gives 100%, no v5 note
      const c = await card(page, 'ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ');
      ok(n, 'ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ = 100% from the old load alone, no v5 note', c && /^100%/.test(c.val) && !/v5/.test(c.target), c);
      const p = await card(page, 'ΚΕΡΔΟΦΟΡΙΑ ΕΘΝΙΚΩΝ');
      ok(n, 'ΚΕΡΔΟΦΟΡΙΑ ΕΘΝΙΚΩΝ as today (0%)', p && /^0%/.test(p.val), p);
      if (borigin) {
        const mine = await contentHtml(page);
        const b = await open(browser, borigin, { page: 'performance', user: SOTIRIS, config: 'before' });
        const theirs = await contentHtml(b.page);
        ok(n, 'flag off: #content identical to the base tree, byte for byte', mine === theirs, firstDiff(mine, theirs));
        // Same requests, as a multiset: this page now awaits GET /plan/config before its facade reads, so their
        // ORDER against the app-wide reads (reference data, notifications) is not today's — their content is.
        const bag = (xs) => JSON.stringify(xs.map((x) => JSON.stringify(x)).sort());
        const extra = (a, b) => { const r = b.map((x) => JSON.stringify(x)); return a.map((x) => JSON.stringify(x)).filter((x) => { const i = r.indexOf(x); if (i < 0) return true; r.splice(i, 1); return false; }); };
        ok(n, 'flag off: same facade requests as the base tree (as a multiset)', bag(S.facade) === bag(b.S.facade),
          { onlyMine: extra(S.facade, b.S.facade), onlyBase: extra(b.S.facade, S.facade) });
      }
    });
    await sc('audit-before', async (n) => {
      const { page, S } = await open(browser, origin, { page: 'metrics_audit', user: OWNER, config: 'before' });
      ok(n, 'painted, no page errors', !S.pageErrors.length, S.pageErrors);
      ok(n, '/plan/*: only GET /plan/config', S.plan.every((x) => x.path === '/plan/config'), S.plan);
      ok(n, 'NAT_ORDERS request without Order No (today\'s fields)', natOrdersReq(S).length === 1 && !/Order(\+|%20)No/.test(natOrdersReq(S)[0]), natOrdersReq(S));
      ok(n, 'no «Εθνικά v5» tab or group', !(await page.evaluate(() => /Εθνικά v5|ΕΘΝΙΚΑ v5/.test(document.getElementById('content').textContent))));
      // core rule only: 9003 (Status Delivered, not invoiced, 150) → €150
      const r = await row(page, 'fin.outstanding_balance');
      ok(n, 'Ανεξόφλητο = €150 (old rule only), no v5 note', r && r[2] === '€150' && !/v5/.test(r[3]), r);
      if (borigin) {
        // the «φορτώθηκε HH:MM:SS» stamp is the real clock of each load (toLocaleTimeString), masked on both sides
        const mask = (h) => h.replace(/φορτώθηκε [^·<]*·/, 'φορτώθηκε <t> ·');
        const mine = mask(await contentHtml(page));
        const b = await open(browser, borigin, { page: 'metrics_audit', user: OWNER, config: 'before' });
        const theirs = mask(await contentHtml(b.page));
        ok(n, 'flag off: #content identical to the base tree (load stamp masked)', mine === theirs, firstDiff(mine, theirs));
        const bag = (xs) => JSON.stringify(xs.map((x) => JSON.stringify(x)).sort());
        ok(n, 'flag off: same facade requests as the base tree (as a multiset)', bag(S.facade) === bag(b.S.facade), { mine: natOrdersReq(S), base: natOrdersReq(b.S) });
      }
    });
    await sc('trail-before', async (n) => {
      const { S } = await open(browser, origin, { page: 'audit_trail', user: OWNER, config: 'before' });
      ok(n, 'painted, no page errors', !S.pageErrors.length, S.pageErrors);
      ok(n, 'no /plan/* request (the trail has no flag)', S.plan.length === 0, S.plan);
    });

    // ── AFTER L ───────────────────────────────────────────────────────────────
    await sc('perf-after', async (n) => {
      const { page, S } = await open(browser, origin, { page: 'performance', user: SOTIRIS, config: 'after' });
      ok(n, 'painted, no page errors', !S.pageErrors.length, S.pageErrors);
      const ns = S.plan.filter((x) => x.path === '/plan/nat-state');
      ok(n, 'one GET /plan/nat-state with the 4 national order ids', ns.length === 1 && ns[0].q.nat_order_ids === '9001,9002,9003,9004', ns);
      // old 1 on time + v5 executed 9001 (on time) and 9002 (late) → 2 of 3 = 67%
      const c = await card(page, 'ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ');
      ok(n, 'ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ = 67% (old 1 + v5 2)', c && /^67%/.test(c.val), c);
      ok(n, 'the card names its sample and leaves out VS legs', c && /v5 2 · παλιό 1 · χωρίς σκέλη VS/.test(c.target), c);
      const p = await card(page, 'ΚΕΡΔΟΦΟΡΙΑ ΕΘΝΙΚΩΝ');
      ok(n, 'ΚΕΡΔΟΦΟΡΙΑ ΕΘΝΙΚΩΝ = «—» «εκτός … P&L», never 0', p && p.val === '—' && /εκτός: το περιθώριο των εθνικών μετριέται στο P&L/.test(p.target), p);
    });
    await sc('perf-natfail', async (n) => {
      const { page } = await open(browser, origin, { page: 'performance', user: SOTIRIS, config: 'after', natState: 'fail' });
      const c = await card(page, 'ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ');
      ok(n, 'nat-state 500 → «—» «δεν διαβάστηκε», never the old-only 100%', c && c.val === '—' && /δεν διαβάστηκε/.test(c.target), c);
    });
    await sc('perf-natorders-fail', async (n) => {
      const { page } = await open(browser, origin, { page: 'performance', user: SOTIRIS, config: 'after', natOrders: 'fail' });
      const c = await card(page, 'ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ');
      ok(n, 'NAT_ORDERS 500 → «—» «δεν διαβάστηκε»', c && c.val === '—' && /δεν διαβάστηκε/.test(c.target), c);
    });
    await sc('perf-noroute-unknown', async (n) => {
      const { page } = await open(browser, origin, { page: 'performance', user: SOTIRIS, config: 'unknown', natState: 'noroute' });
      const c = await card(page, 'ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ');
      // L not known + no route: a Worker before deploy 1, so no v5 order can exist → the old sample, said so (v5 0)
      ok(n, 'L unknown + nat-state 404 no_route → old sample, «v5 0», not a failure', c && /^100%/.test(c.val) && /v5 0 · παλιό 1/.test(c.target), c);
    });
    await sc('perf-noroute-after', async (n) => {
      const { page } = await open(browser, origin, { page: 'performance', user: SOTIRIS, config: 'after', natState: 'noroute' });
      const c = await card(page, 'ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ');
      // after L the same 404 hides every v5 order (Worker rolled back / deploy without the read): a failure
      ok(n, 'after L + nat-state 404 no_route → «—» «δεν διαβάστηκε», never «v5 0»', c && c.val === '—' && /δεν διαβάστηκε/.test(c.target), c);
    });
    await sc('perf-unknown', async (n) => {
      const { page } = await open(browser, origin, { page: 'performance', user: SOTIRIS, config: 'unknown' });
      const c = await card(page, 'ΣΥΝΕΠΕΙΑ ΕΘΝΙΚΩΝ');
      ok(n, '/plan/config 500 → v5 read anyway, and the card says «μετάβαση εθνικών: άγνωστη»', c && /^67%/.test(c.val) && /μετάβαση εθνικών: άγνωστη/.test(c.target), c);
    });
    await sc('audit-after', async (n) => {
      const { page, S } = await open(browser, origin, { page: 'metrics_audit', user: OWNER, config: 'after' });
      ok(n, 'painted, no page errors', !S.pageErrors.length, S.pageErrors);
      ok(n, 'NAT_ORDERS request carries Order No and Delivery DateTime', natOrdersReq(S).length === 1 && /Order(\+|%20)No/.test(natOrdersReq(S)[0]) && /Delivery(\+|%20)DateTime/.test(natOrdersReq(S)[0]), natOrdersReq(S));
      // 150 (old 9003) + 300 (v5 9001: executed, not invoiced) = 450
      const r = await row(page, 'fin.outstanding_balance');
      ok(n, 'Ανεξόφλητο = €450 with «εθνικές v5: €300 (1)»', r && r[2] === '€450' && /εθνικές v5: €300 \(1\)/.test(r[3]), r);
      // only v5 9002 is invoiced (200); delivered 1/11, inside 30 days of 3/11
      const ri = await row(page, 'fin.revenue_invoiced');
      ok(n, 'Έσοδα τιμολογημένα = €200 (v5 9002)', ri && ri[2] === '€200' && /εθνικές v5: €200 \(1\)/.test(ri[3]), ri);
      const r30 = await row(page, 'fin.revenue_invoiced_30d');
      ok(n, 'Έσοδα 30ημ = €200', r30 && r30[2] === '€200', r30);
      const g = { c: await row(page, 'natl.cutover'), o: await row(page, 'natl.v5_orders'), e: await row(page, 'natl.v5_executed'),
        u: await row(page, 'natl.v5_unplanned'), l: await row(page, 'natl.v5_late') };
      ok(n, 'group «Εθνικά v5»: L 2026-10-31, 3 orders, 2 executed, 1 unplanned, 2 late',
        g.c && /2026-10-31/.test(g.c[2]) && g.o && g.o[2] === '3' && g.e && g.e[2] === '2' && g.u && g.u[2] === '1' && g.l && g.l[2] === '2', g);
      ok(n, 'tab «Εθνικά v5» exists', await page.evaluate(() => [...document.querySelectorAll('.ma-tab')].some((b) => /Εθνικά v5/.test(b.textContent))));
    });
    await sc('audit-natfail', async (n) => {
      const { page } = await open(browser, origin, { page: 'metrics_audit', user: OWNER, config: 'after', natState: 'fail' });
      const banner = await page.evaluate(() => (document.querySelector('.ma-warn') || {}).textContent || '');
      ok(n, 'banner names «Κατάσταση εθνικών v5»', /Κατάσταση εθνικών v5/.test(banner), banner.slice(0, 300));
      const r = await row(page, 'fin.outstanding_balance');
      ok(n, 'Ανεξόφλητο = «—», never €150 without the v5 share', r && r[2] === '—', r);
      const o = await row(page, 'natl.v5_orders');
      ok(n, 'Εθνικές v5 = «—», never 0', o && o[2] === '—', o);
      const c = await row(page, 'natl.cutover');
      ok(n, 'the transition state (read from /plan/config) stays visible', c && /μετά τη μετάβαση · ημέρα L 2026-10-31/.test(c[2]), c);
    });
    await sc('audit-unknown', async (n) => {
      const { page } = await open(browser, origin, { page: 'metrics_audit', user: OWNER, config: 'unknown' });
      const c = await row(page, 'natl.cutover');
      ok(n, 'Μετάβαση εθνικών = «άγνωστη» with its warning', c && c[2] === 'άγνωστη' && /δεν διαβάστηκε/.test(c[3]), c);
      const r = await row(page, 'fin.outstanding_balance');
      ok(n, 'the v5 share still counts (€450)', r && r[2] === '€450', r);
    });
    await sc('trail-labels', async (n) => {
      const { page, S } = await open(browser, origin, { page: 'audit_trail', user: OWNER, config: 'after' });
      ok(n, 'painted, no page errors', !S.pageErrors.length, S.pageErrors);
      const t = await page.evaluate(() => document.getElementById('content').textContent.replace(/\s+/g, ' '));
      ok(n, 'tables in Greek: Στάσεις κύκλων · Αλλαγές οχήματος κύκλου · Τοπικές μετακινήσεις',
        /Στάσεις κύκλων/.test(t) && /Αλλαγές οχήματος κύκλου/.test(t) && /Τοπικές μετακινήσεις/.test(t), t.slice(0, 400));
      ok(n, 'no raw table name left (RT VEHICLE SEGMENTS / LOCAL MOVES)', !/RT VEHICLE SEGMENTS|LOCAL MOVES/.test(t));
      ok(n, 'side change reads «Πλευρά: ΚΑΘΟΔΟΣ → ΑΝΟΔΟΣ»', /Πλευρά: ΚΑΘΟΔΟΣ → ΑΝΟΔΟΣ/.test(t), (t.match(/.{0,40}ΑΝΟΔΟΣ.{0,20}/) || [t.slice(0, 200)])[0]);
    });
    // Console rule (coordinator 27/10): Chrome's «Failed to load resource» for a planned ≥400 stub answer or an
    // aborted external host, and planFetch's one log line per scripted answer («rig sentinel»), are excluded and
    // counted; anything else fails the run.
    const excl = {};
    const app = [];
    for (const c of CONSOLE) {
      const ours = (x) => x.startsWith(origin) || (borigin && x.startsWith(borigin)) || x.includes(HOST);
      const k = /^Failed to load resource/.test(c.t) && PLANNED.has(c.url) ? 'planned stub answer ≥400'
        : /^Failed to load resource/.test(c.t) && c.url && !ours(c.url) ? 'aborted external host'
        : /rig sentinel/.test(c.t) ? 'log of a scripted answer (rig sentinel)'
        : null;
      if (k) excl[k] = (excl[k] || 0) + 1; else app.push(c.t);
    }
    for (const [k, v] of Object.entries(excl)) console.log(`  · excluded console line ×${v}: ${k}`);
    ok('final', 'no console errors on any page of the run', !app.length, app.slice(0, 6));
  } finally {
    await browser.close();
    srv.close();
    if (bsrv) bsrv.close();
    console.log(fails ? `\nNO-GO: ${fails} check(s) failed` : '\nGO: Ε15 readers count v5 national work from L; flag off = today');
    process.exit(fails ? 1 : 0);
  }
}
main();
