// Rig kit — National v5 F4α, batch C (forms, sheet, vehicle handover). Shared by tests/critics/wn5-form-rig.js and
// tests/critics/wn5-handover-rig.js so the two rigs judge against ONE fake /plan/* and ONE synthetic week
// (principle 3). Self-serving (pattern of tests/critics/wi4-board-rig.js): serves the tree in WN5_TREE (default:
// this tree), rewrites config.js in memory (WN_V5 'on'; the repo keeps 'off'), aborts everything else that would
// leave the machine. The fake /plan/* answers with THE one error shape {error:{type,code,message}} and SENTINEL
// messages («rig sentinel <code>»), never a copy of a Worker text: a screen that shows the sentinel proves it shows
// error.message as is. Every /plan request is recorded in S.plan {m, path, q, raw, body, status, at} — that is
// «the table» of these rigs (CLAUDE.md: the proof is the table, never the toast). Synthetic data only (public repo).
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const WT = path.join(__dirname, '../..');
const TREE = path.resolve(process.env.WN5_TREE || WT);
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const NOW = '2026-10-13T09:30:00+03:00';   // Tue 13/10 09:30 Athens: inside the kit week Sat 10/10 – Fri 16/10
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DRY = ['POST /plan/move', 'PATCH /plan/rt/:id', 'POST /plan/rt/:id/clear', 'POST /plan/delete',
  'POST /plan/rt/:id/handover', 'PATCH /plan/segments/:id', 'POST /plan/segments/:id/remove'];
const clone = (o) => JSON.parse(JSON.stringify(o));
const routeOf = (m, p) => m + ' ' + p.replace(/\/\d+(?=\/|$)/g, '/:id');
const planErr = (status, type, code) => [status, { error: { type, code, message: `rig sentinel ${code}` } }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Every console error of every page of the run (T29: «0 σφάλματα κονσόλας»), judged once at the end of run().
// Console rule (coordinator 27/10): a line caused by a PLANNED stub answer is excluded and listed — Chrome's «Failed to
// load resource» for a request the kit aborted (external host) or for a /plan/* answer the stub gave with status ≥ 400,
// and planFetch's one log line per scripted answer («rig sentinel …»); a rig may name its own designed log lines
// (run opts.designedConsole). Any other line is an app error and fails the run.
const CONSOLE = [];
const PLANNED = new Map();   // request url → the statuses ≥ 400 the stub answered for it

// Places, clients, vehicles: legacy rec ids (the facade pickers) ↔ numeric ids (/plan, Ε-2).
const LOOKUPS = {
  locations: [
    { id: 1, legacy_id: 'recJucKOhC1zh4IP3', name: 'ΒΕΡΟΙΑ TEST', address: 'Test Industrial Area 1, 59100', city: 'Veria', phone: 'TEST-PHONE-01' },
    { id: 2, legacy_id: 'recWn5LocAth', name: 'ATHENS TEST', address: 'Test Street 2, 10442', city: 'Athens', phone: 'TEST-PHONE-02' },
    { id: 3, legacy_id: 'recWn5LocAsp', name: 'ASPROPYRGOS TEST', address: 'Test Street 3, 19300', city: 'Aspropyrgos', phone: 'TEST-PHONE-03' },
    { id: 4, legacy_id: 'recWn5LocLar', name: 'LARISA TEST', address: 'Test Street 4, 41500', city: 'Larisa', phone: 'TEST-PHONE-04' },
    { id: 5, legacy_id: 'recWn5LocThe', name: 'THESSALONIKI TEST', address: 'Test Street 5, 57022', city: 'Thessaloniki', phone: 'TEST-PHONE-05' }],
  clients: [{ id: 41, legacy_id: 'recWn5Cli41', company_name: 'ΠΕΛΑΤΗΣ Α' }, { id: 42, legacy_id: 'recWn5Cli42', company_name: 'ΠΕΛΑΤΗΣ Β' },
    { id: 43, legacy_id: 'recWn5Cli43', company_name: 'ΠΕΛΑΤΗΣ Γ' }],
  trucks: [{ id: 11, legacy_id: 'recWn5Trk11', license_plate: 'TST-2104', active: true }, { id: 12, legacy_id: 'recWn5Trk12', license_plate: 'TST-2108', active: true },
    { id: 13, legacy_id: 'recWn5Trk13', license_plate: 'TST-2106', active: true }],
  trailers: [{ id: 21, legacy_id: 'recWn5Trl21', license_plate: 'TRL-5102', active: true }, { id: 22, legacy_id: 'recWn5Trl22', license_plate: 'TRL-5104', active: true }],
  drivers: [{ id: 31, legacy_id: 'recWn5Drv31', full_name: 'Driver Test 01', active: true }, { id: 32, legacy_id: 'recWn5Drv32', full_name: 'Driver Test 02', active: true },
    { id: 33, legacy_id: 'recWn5Drv33', full_name: 'Driver Test 03', active: true }],
  partners: [{ id: 51, legacy_id: 'recWn5Par51', company_name: 'Partner Test 01', active: true }],
};
const FACADE_LOCS = LOOKUPS.locations.map((l) => ({ id: l.legacy_id, fields: { Name: l.name, City: l.city, Country: 'GR' } }));
const FACADE_CLIENTS = LOOKUPS.clients.map((c) => ({ id: c.legacy_id, fields: { 'Company Name': c.company_name } }));

// The kit week, in the shape of the LIVE plan_board (072:2365): cycles[] (stops[] with legs[]), waiting[], hub[],
// notices[]. No money key (amount/advance/expenses/invoice_number): the dispatcher's board has none.
function leg(leg_id, piece_id, act, pallets, o) {
  return Object.assign({ leg_id, piece_id, act, pallets, kind: 'national', order_id: null, nat_order_id: null, reference: null, client_id: null, client: null, temperature_c: null }, o);
}
function stop(stop_id, seq, side, location_id, from, to, legs) {
  const loc = LOOKUPS.locations.find((l) => l.id === location_id);
  return { stop_id, seq, side, location_id, location: loc.name, planned_from: from, planned_to: to, stop_day: from.slice(0, 10),
    executed: false, has_vehicle: true, has_late: false, dim: false, side_dim: false, cycle_dim: false, local_loading: null, legs };
}
function week() {
  const VS = { kind: 'vs_import', order_id: 2101, reference: 'VS-T118', client_id: 42, client: 'ΠΕΛΑΤΗΣ Β', temperature_c: 2 };
  const NA = { nat_order_id: 3001, reference: 'N-T001', client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', temperature_c: 4 };
  const NB = { nat_order_id: 3002, reference: 'N-T002', client_id: 43, client: 'ΠΕΛΑΤΗΣ Γ', temperature_c: 4 };
  const NC = { nat_order_id: 3003, reference: 'N-T003', client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', temperature_c: 2 };
  return {
    week: '2026-10-10',
    cycles: [
      { rt_id: 101, code: 'RT-T101', trip_type: 'OWNED', truck_id: 11, truck: 'TST-2104', trailer_id: 21, trailer: 'TRL-5102', driver_id: 31, driver: 'Driver Test 01',
        partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-12T16:00:00+03:00', end_at: '2026-10-13T22:00:00+03:00',
        date_start: '2026-10-12', date_end: '2026-10-13', ended: false,
        stops: [
          stop(1001, 1, 'KATHODOS', 1, '2026-10-12T16:00:00+03:00', '2026-10-12T18:00:00+03:00', [leg(5001, 4001, 'load', 21, VS), leg(5002, 4002, 'load', 6, NA)]),
          stop(1002, 2, 'KATHODOS', 2, '2026-10-13T06:00:00+03:00', '2026-10-13T08:00:00+03:00', [leg(5001, 4001, 'unload', 21, VS)]),
          stop(1003, 3, 'KATHODOS', 3, '2026-10-13T07:00:00+03:00', '2026-10-13T09:00:00+03:00', [leg(5002, 4002, 'unload', 6, NA)]),
          stop(1004, 4, 'ANODOS', 3, '2026-10-13T12:00:00+03:00', '2026-10-13T14:00:00+03:00', [leg(5003, 4003, 'load', 20, NB)]),
          stop(1005, 5, 'ANODOS', 1, '2026-10-13T20:00:00+03:00', '2026-10-13T22:00:00+03:00', [leg(5003, 4003, 'unload', 20, NB)])] },
      { rt_id: 102, code: 'RT-T102', trip_type: 'OWNED', truck_id: 12, truck: 'TST-2108', trailer_id: 22, trailer: 'TRL-5104', driver_id: 32, driver: 'Driver Test 02',
        partner_id: null, partner: null, partner_rate: null, start_at: '2026-10-14T10:00:00+03:00', end_at: '2026-10-14T22:00:00+03:00',
        date_start: '2026-10-14', date_end: '2026-10-14', ended: false,
        stops: [
          stop(1101, 1, 'ANODOS', 2, '2026-10-14T12:00:00+03:00', '2026-10-14T14:00:00+03:00', [leg(5101, 4004, 'load', 10, NC)]),
          stop(1102, 2, 'ANODOS', 1, '2026-10-14T20:00:00+03:00', '2026-10-14T22:00:00+03:00', [leg(5101, 4004, 'unload', 10, NC)])] }],
    waiting: [
      { piece_id: 4101, shipment_id: 5201, kind: 'national', order_id: null, nat_order_id: 3101, order_stop_id: null, pallets: 8, leave_by: null,
        position_location_id: 3, nat_from_location_id: 3, nat_to_location_id: 2, nat_ready_day: '2026-10-14', nat_due_day: '2026-10-15', overdue: false,
        is_stock: false, client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', reference: 'N-T101', temperature_c: 4, pallet_exchange: false,
        load_from: '2026-10-14T05:00:00+00:00', load_to: '2026-10-14T07:00:00+00:00', deliver_from: '2026-10-15T05:00:00+00:00', deliver_to: '2026-10-15T07:00:00+00:00', price: 310 }],
    hub: [],
    notices: [],
  };
}

// GET /plan/orders/:id (077 plan_order_read, F13): the kit week's national orders as the edit form reads them - 3101
// waits (two points, PE yes, notes), 3001 rides on the KATHODOS of RT-T101 (its price and notes are NOT on the board).
function orders() {
  const sh = (shipment_id, o, d, pallets, lf, lt, df, dt, rides, rt_codes) => ({ shipment_id, origin_location_id: o, dest_location_id: d, pallets,
    load_from: lf, load_to: lt, deliver_from: df, deliver_to: dt, vs_locked: false, rides, rt_codes });
  return {
    3101: { ok: true, op: 'plan_order_read',
      order: { nat_order_id: 3101, legacy_id: 'recWn5Nat3101', client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', price: 310, reference: 'N-T101', goods: 'Γιαούρτι',
        notes: 'ράμπα 2', temperature_c: 4, pallet_exchange: true, direction: 'KATHODOS', pallets: 8 },
      shipments: [sh(5201, 3, 2, 8, '2026-10-14T05:00:00+00:00', '2026-10-14T07:00:00+00:00', '2026-10-15T05:00:00+00:00', '2026-10-15T07:00:00+00:00', false, [])] },
    3001: { ok: true, op: 'plan_order_read',
      order: { nat_order_id: 3001, legacy_id: 'recWn5Nat3001', client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', price: 420, reference: 'N-T001', goods: null,
        notes: 'κλήση πριν', temperature_c: 4, pallet_exchange: false, direction: 'KATHODOS', pallets: 6 },
      shipments: [sh(5202, 1, 3, 6, '2026-10-12T13:00:00+00:00', '2026-10-12T15:00:00+00:00', '2026-10-13T04:00:00+00:00', '2026-10-13T06:00:00+00:00', true, ['RT-T101'])] },
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function serve() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const file = path.join(TREE, decodeURIComponent(u.pathname === '/' ? '/app.html' : u.pathname));
    if (!file.startsWith(TREE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
function makeOk() {
  let fails = 0;
  const ok = (scn, name, cond, detail) => {
    if (!cond) fails++;
    console.log(`${cond ? '✓' : '✗'} ${scn} ${name}${cond || detail === undefined ? '' : '  → ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`);
    return !!cond;
  };
  ok.fails = () => fails;
  return ok;
}
// Runs in the page before any script: a demo_* roster user (config.js USERS) or the tamper guard bounces.
function initScript(role) {
  localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig Test', role, username: 'demo_' + role, loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600 * 1000 }));
  localStorage.setItem('tms_jwt', 'rig.wn5.no-real-token');
  localStorage.setItem('tms_page', 'weekly_natl');
  localStorage.setItem('tms_sidebar_v2_migrated', '1');
  localStorage.setItem('tms_sidebar_collapsed', 'true');
}
function defaultPlan(e, S) {
  const r = routeOf(e.m, e.path);
  if (r === 'GET /plan/board') return [200, S.board];
  if (r === 'GET /plan/lookups') return [200, S.lookups];
  if (r === 'GET /plan/notices') return [200, { desk: e.q.desk || 'natl', unread: [], recent: [] }];
  if (r === 'GET /plan/orders/:id') {
    const o = S.orders[e.path.split('/').pop()];
    return o ? [200, o] : planErr(422, 'PLAN_RULE', 'order_gone');
  }
  if (e.body && e.body.dry_run === true && DRY.includes(r))
    return [200, { ok: true, op: 'rig_dry', dry_run: true, needs_confirm: false, confirm_token: 'rig-token-0', consequences: [] }];
  return planErr(409, 'WRITES_CLOSED', 'writes_closed');   // as deployed until day L
}
// opts: role · flag ('on') · board · lookups · plan {'<M> <exact path>': async (entry, S) => [status, body]} · viewport · clipboard
// · sidebar ('open': the app's default 228px sidebar; else collapsed)
async function openApp(browser, origin, opts = {}) {
  const ctx = await browser.newContext({ baseURL: origin + '/', viewport: opts.viewport || { width: 1920, height: 1080 },
    serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  if (opts.clipboard) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(NOW));   // BEFORE the session is stamped (wn-wave1-proof.js note)
  const S = { plan: [], facade: [], pageErrors: [], console: [], preflight: [], t0: Date.now(),
    board: clone(opts.board || week()), lookups: clone(opts.lookups || LOOKUPS), orders: clone(opts.orders || orders()) };
  page.on('pageerror', (e) => S.pageErrors.push(String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') { const x = m.text().slice(0, 300); S.console.push(x); CONSOLE.push({ t: x, url: (m.location() || {}).url || '' }); } });
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(initScript, opts.role || 'dispatcher');
  if (opts.sidebar === 'open') await page.addInitScript(() => localStorage.setItem('tms_sidebar_collapsed', 'false'));
  await page.route((u) => !u.href.startsWith(origin) && !u.href.includes(HOST), (route) => route.abort());
  await page.route((u) => u.href.startsWith(origin) && new URL(u.href).pathname === '/config.js', async (route) => {
    const r = await route.fetch();
    let body = await r.text();
    // Plain main has no WN_V5: a preflight line, never a throw (a throw would end the run before any check).
    const re = /WN_V5:\s*(?:false|true|'(?:off|pilot|on)')/;
    if (re.test(body)) body = body.replace(re, `WN_V5: '${opts.flag || 'on'}'`);
    else S.preflight.push('FEATURES.WN_V5 not found in config.js');
    await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body });
  });
  const cors = { 'access-control-allow-origin': '*' };
  await page.route(`**/${HOST}/**`, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, cors) });
    // F5 FE-2: GET /plan/config (Q-10, is this week ≥ day L?) answered as the deploy-1 Worker does before L, counted
    // in S.config and kept out of S.plan, the table of the board's own traffic (see tests/critics/wn5-board-rig.js).
    if (m === 'GET' && u.pathname === '/plan/config' && !(opts.plan || {})['GET /plan/config']) {
      S.config = (S.config || 0) + 1;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ cutover_day: null, opened_at: null, writes_open: false }) });
    }
    if (u.pathname.startsWith('/plan/')) {
      const raw = req.postData();
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = '<<not json>>'; }
      const e = { m, path: u.pathname, q: Object.fromEntries(u.searchParams), raw, body, headers: req.headers(), at: Date.now() - S.t0 };
      S.plan.push(e);
      const fn = (opts.plan || {})[`${m} ${u.pathname}`] || defaultPlan;
      const [status, ans] = await fn(e, S);
      e.status = status;
      if (status >= 400) PLANNED.set(req.url(), [...new Set((PLANNED.get(req.url()) || []).concat(status))]);
      return route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(ans) });
    }
    S.facade.push({ m, path: u.pathname });
    const tid = (u.pathname.match(/\/v0\/[^/]+\/([A-Za-z0-9]+)/) || [])[1];
    let ans = m === 'GET' ? { records: [] } : { ok: true };
    if (m === 'GET' && tid === 'tblxu8DRfTQOFRCzS') ans = { records: FACADE_LOCS };
    if (m === 'GET' && tid === 'tblFWKAQVUzAM8mCE') ans = { records: FACADE_CLIENTS };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(ans) });
  });
  await page.goto('app.html');
  try { await page.waitForFunction(() => !!document.querySelector('#content > .wi4.wn5[data-state="ok"]'), null, { timeout: 20000 }); }
  catch (_) { S.preflight.push('the v5 board did not paint (#content > .wi4.wn5[data-state=ok])'); }
  await page.evaluate(() => {
    const E = window.__ev = [];
    const wrap = (name, k, call) => {
      const fn = window[name];
      if (typeof fn !== 'function') return;
      window[name] = function () {
        E.push({ k, a: [...arguments].map((x) => { try { return typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : String(x).slice(0, 300); } catch (_) { return String(x); } }) });
        return call ? fn.apply(this, arguments) : undefined;
      };
    };
    wrap('toast', 'toast', true); wrap('showErrorToast', 'errtoast', true); wrap('logError', 'logError', true); wrap('tmsSessionExpired', 'expired', false);
  }).catch(() => {});
  return { page, S };
}
const has = (page, g) => page.evaluate((x) => typeof window[x] !== 'undefined', g).catch(() => false);
const count = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const text = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }, sel);
const planOf = (S, m, p) => S.plan.filter((x) => x.m === m && (p instanceof RegExp ? p.test(x.path) : x.path === p));

async function preflight(browser, origin, ok, globals) {
  const scn = 'preflight';
  const { page, S } = await openApp(browser, origin);
  const st = await page.evaluate((gs) => ({ api: typeof planFetch === 'function', root: !!document.querySelector('#content > .wi4.wn5'),
    g: gs.map((g) => typeof window[g] !== 'undefined') }), globals);
  ok(scn, 'FEATURES.WN_V5 exists in config.js', !S.preflight.some((x) => /WN_V5/.test(x)), S.preflight);
  ok(scn, 'core/plan-api.js loaded (planFetch)', st.api, st);
  ok(scn, 'the v5 board painted (#content .wn5)', st.root, S.preflight);
  ok(scn, 'board read through GET /plan/board?week=<Saturday>', S.plan.some((x) => x.m === 'GET' && x.path === '/plan/board' && /^\d{4}-\d{2}-\d{2}$/.test(x.q.week || '')), S.plan.map((x) => x.m + ' ' + x.path));
  globals.forEach((g, i) => ok(scn, `${g} defined`, st.g[i], st));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}
// opts: { scenarios: {name: async ({browser, origin, ok, scn, shots}) => void}, globals: [..], go: 'what holds' }
async function run(opts) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--shots');
  const shots = at >= 0 ? argv[at + 1] : null;
  const want = argv.filter((a, i) => !a.startsWith('--') && !(at >= 0 && i === at + 1));
  const names = Object.keys(opts.scenarios);
  const bad = want.filter((w) => !names.includes(w));
  if (bad.length) { console.error('unknown scenario(s): ' + bad.join(', ') + ' — known: ' + names.join(' ')); process.exit(2); }
  const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), WT] }));
  const ok = makeOk();
  const srv = await serve();
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  try {
    await preflight(browser, origin, ok, opts.globals);   // ✗ lines on plain main, never an early exit
    for (const n of names) {
      if (want.length && !want.includes(n)) continue;
      let t = null;
      try {
        await Promise.race([opts.scenarios[n]({ browser, origin, ok, scn: n, shots }),
          new Promise((_, rej) => { t = setTimeout(() => rej(new Error('watchdog: still running after 120 s')), 120000); })]);
      } catch (e) {
        ok(n, 'scenario ran to the end', false, String(e && e.stack || e));
        for (const c of browser.contexts()) await c.close().catch(() => {});
      } finally { clearTimeout(t); }
    }
    const kind = (c) => {
      if (/^Failed to load resource/.test(c.t)) {
        if (PLANNED.has(c.url)) return `planned stub ${PLANNED.get(c.url).join('/')} · ${new URL(c.url).pathname}`;
        if (c.url && !c.url.startsWith(origin) && !c.url.includes(HOST)) return `aborted external host · ${new URL(c.url).host}`;
        return null;
      }
      if (/^\[TMS ERROR\] planFetch [A-Z]+ \/plan\/\S*: PlanError: rig sentinel /.test(c.t)) return 'planFetch log of a scripted answer (rig sentinel)';
      if ((opts.designedConsole || []).some((re) => re.test(c.t))) return 'designed log line of a scenario';
      return null;
    };
    const excl = {};
    const app = [];
    for (const c of CONSOLE) { const k = kind(c); if (k) excl[k] = (excl[k] || 0) + 1; else app.push(c.t); }
    for (const [k, n] of Object.entries(excl)) console.log(`  · excluded console line ×${n}: ${k}`);
    ok('final', 'no console errors on any page of the run', !app.length, app.slice(0, 5));
  } finally {
    await browser.close();
    srv.close();
    const n = ok.fails();
    console.log(n ? `\nNO-GO: ${n} check(s) failed` : `\nGO: ${opts.go}`);
    process.exit(n ? 1 : 0);
  }
}

module.exports = { WT, TREE, HOST, NOW, UUID4, LOOKUPS, FACADE_LOCS, week, orders, leg, stop, clone, routeOf, planErr, sleep,
  openApp, has, count, text, planOf, run };
