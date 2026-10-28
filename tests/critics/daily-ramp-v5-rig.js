// Rig — Daily Ramp Board, national v5 at the Veroia hub (F5, Ε14, stream d2).
//
// The real app (app.html → modules/daily_ramp.js, core/plan-config.js, core/plan-api.js, WN5L) against an
// in-memory Worker: the RAMP facade holds ONE legacy line, /plan/config says before / after, /plan/board holds a
// synthetic week (invented names only — the repo is public). Nothing leaves the machine. Clock frozen at
// Mon 2/11/2026 09:00 Athens. app.html is served with core/plan-config.js added after core/plan-api.js, as stream
// (e)'s bump will load it (scenario `noconfig` serves app.html as it is today).
//
// Usage (cwd = the main repo, which has node_modules — memory «Κριτές από worktree»):
//   node <tree>/tests/critics/daily-ramp-v5-rig.js [scenario…] [--shots <dir>]
// Scenarios: before (after deploy 1: cutover_day null) · before404 (before deploy 1: no route — its one 404 resource
//   line is plan-config's designed probe, stream c) · same (before = the pre-Ε14 tip's daily_ramp.js, byte for byte) ·
//   after · warehouse · fail · noconfig · legacy (after deploy 2, a dispatcher marks a legacy NL loading Done: the
//   Worker answers 422 legacy_closed (Q-10) — the Greek refusal shows, one PATCH, no retry; a v5 id writes nothing)
// Exit: 0 all green · 1 a check failed.
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');
const req = m => require(require.resolve(m, { paths: [process.cwd(), path.join(__dirname, '../..')] }));
const { chromium } = req('playwright');

const TREE = path.join(__dirname, '../..');
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const RAMP_T = 'tblT8W5WcuToBQNiY';
const NOW = '2026-11-02T07:00:00.000Z';     // Mon 2/11 09:00 Athens
const D = '2026-11-02', WEEK = '2026-10-31', HUB = 77;
const argv = process.argv.slice(2);
const shotsAt = argv.indexOf('--shots');
const OUT = shotsAt >= 0 ? argv[shotsAt + 1] : null;
const want = argv.filter((a, i) => !a.startsWith('--') && !(shotsAt >= 0 && i === shotsAt + 1));
const on = n => !want.length || want.includes(n);
if (OUT) fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const check = (scn, name, cond, detail) => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${scn} ${name}${cond || detail === undefined ? '' : '  → ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)}`);
};

const leg = (leg_id, piece_id, act, pallets, kind, client, temperature_c) => ({ leg_id, piece_id, act, pallets, kind, client, temperature_c, order_id: null, nat_order_id: null, reference: 'R' + piece_id, client_id: 1 });
const stop = (stop_id, seq, location_id, location, stop_day, planned_from, legs) =>
  ({ stop_id, seq, side: 'KATHODOS', location_id, location, planned_from, planned_to: planned_from, stop_day, executed: false, has_vehicle: true, has_late: false, dim: false, side_dim: false, cycle_dim: false, local_loading: null, legs });
const BOARD = {
  week: WEEK,
  cycles: [{ rt_id: 1, code: 'RT-1', trip_type: 'OWNED', truck: 'ΑΒΓ-1001', trailer: null, driver: 'Οδηγός Α', partner: null, partner_rate: 100, stops: [
    stop(10, 1, HUB, 'VEROIA CROSS-DOCK', D, '2026-11-02T06:00:00+00:00', [leg(1, 1, 'load', 10, 'vs_import', 'Πελάτης Ε', 2), leg(2, 2, 'load', 4.5, 'national', 'Πελάτης Ν', 4)]),
    stop(11, 2, 501, 'Θεσσαλονίκη', D, '2026-11-02T08:00:00+00:00', [leg(1, 1, 'unload', 10, 'vs_import', 'Πελάτης Ε', 2)]),
    stop(12, 3, 502, 'Λάρισα', D, '2026-11-02T10:00:00+00:00', [leg(2, 2, 'unload', 4.5, 'national', 'Πελάτης Ν', 4)]),
    stop(13, 4, 503, 'Κατερίνη', D, '2026-11-02T12:00:00+00:00', [leg(3, 3, 'load', 6, 'vs_export', 'Πελάτης Χ', 2)]),
    stop(14, 5, HUB, 'VEROIA CROSS-DOCK', D, '2026-11-02T14:00:00+00:00', [leg(3, 3, 'unload', 6, 'vs_export', 'Πελάτης Χ', 2)]),
  ] }],
  hub: [{ piece_id: 40, kind: 'vs_import', pallets: 8, nat_ready_day: D, nat_due_day: '2026-11-03', inbound_rt_id: null, leave_by: null, client: 'Πελάτης Η', temperature_c: 2 }],
  waiting: [{ piece_id: 50, kind: 'vs_export', pallets: 5, nat_from_location_id: 505, nat_to_location_id: HUB, nat_ready_day: '2026-11-01', nat_due_day: D, client: 'Πελάτης Κ', temperature_c: 3 }],
  notices: [],
};
const NL_T = 'tblVW42cZnfC47gTb';
const CLOSED_MSG = 'Τα παλιά εθνικά φορτία είναι μόνο για ανάγνωση από την ημέρα L (rig)';
const LEGACY_NL = { id: 'recRAMP00000002', createdTime: '2026-10-30T10:00:00.000Z', fields: { 'Plan Date': D, Time: '2026-11-02T06:00:00.000Z', Type: 'Φόρτωση', Status: 'Planned', Pallets: 12, 'Supplier/Client': 'Πελάτης Ο', 'Ramp Category': 'VS Simple', 'Is Veroia Switch': true, Notes: 'STOP:recSTOP0000000002', 'National Load': ['recNL0000000001'] } };
const LEGACY = { id: 'recRAMP00000001', createdTime: '2026-10-30T10:00:00.000Z', fields: { 'Plan Date': D, Time: '2026-11-02T05:00:00.000Z', Type: 'Παραλαβή', Status: 'Planned', Pallets: 20, 'Supplier/Client': 'Πελάτης Δ', 'Ramp Category': 'VS Simple', 'Is Veroia Switch': true, Notes: 'STOP:recSTOP0000000001' } };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function serve() {
  const srv = http.createServer((rq, res) => {
    const u = new URL(rq.url, 'http://x');
    const file = path.join(TREE, decodeURIComponent(u.pathname === '/' ? '/app.html' : u.pathname));
    if (!file.startsWith(TREE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// opts: config 'before'|'before404'|'after' · board object | 500 · role · withConfig (default true) · rampSrc (override daily_ramp.js)
async function open(browser, origin, opts) {
  const o = Object.assign({ config: 'after', board: BOARD, role: 'owner', withConfig: true, legacy: [LEGACY] }, opts);
  const ctx = await browser.newContext({ baseURL: origin + '/', viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  const S = { plan: [], facadeWrites: [], appErrors: [], consoleErrors: [], pageErrors: [], unknown: [], aborted: 0 };
  page.on('console', m => { if (m.type() === 'error') S.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => S.pageErrors.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(role => {
    localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig', role, username: 'demo_' + role, loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600 * 1000 }));
    localStorage.setItem('tms_jwt', 'rig.ramp.no-real-token');
    localStorage.setItem('tms_page', 'daily_ramp');
  }, o.role);
  // fonts and Sentry (SRI-pinned, so it cannot be answered empty): aborted, and EXACTLY that many
  // «net::ERR_FAILED» console lines are the rig's own — clean() subtracts them, no more
  await page.route(u => !u.href.startsWith(origin) && !u.href.includes(HOST), route => { S.aborted++; return route.abort(); });
  if (o.withConfig) {
    await page.route(u => u.href.startsWith(origin) && /^\/(app\.html)?$/.test(new URL(u.href).pathname), async route => {
      const r = await route.fetch(); let body = await r.text();
      const re = /(<script src="core\/plan-api\.js[^"]*"><\/script>)/;
      if (!re.test(body)) throw new Error('app.html changed: the rig cannot find core/plan-api.js');
      if (!/core\/plan-config\.js/.test(body)) body = body.replace(re, '$1\n<script src="core/plan-config.js"></script>');
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    });
  }
  if (o.rampSrc) {
    await page.route(u => u.href.startsWith(origin) && new URL(u.href).pathname === '/modules/daily_ramp.js',
      route => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: o.rampSrc }));
  }
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, async route => {
    const rq = route.request(); const u = new URL(rq.url()); const m = rq.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.startsWith('/plan/')) {
      S.plan.push(m + ' ' + u.pathname + u.search);
      if (u.pathname === '/plan/config') {
        if (o.config === 'before404') return json(route, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'Άγνωστη διαδρομή' } }, 404);
        if (o.config === 'before') return json(route, { cutover_day: null, opened_at: null, writes_open: false });
        return json(route, { cutover_day: '2026-10-31', opened_at: '2026-10-30T15:30:00Z', writes_open: true });
      }
      if (u.pathname === '/plan/board') {
        if (o.board === 500) return json(route, { error: { type: 'SERVER_ERROR', code: 'plan_error', message: 'rig: forced' } }, 500);
        return json(route, u.searchParams.get('week') === WEEK ? o.board : Object.assign({}, o.board, { week: u.searchParams.get('week'), cycles: [], hub: [], waiting: [] }));
      }
      // deploy 1's catalogue (Ε-2): the hub is the one is_hub location
      if (u.pathname === '/plan/lookups') return json(route, { locations: [{ id: HUB, legacy_id: 'recJucKOhC1zh4IP3', name: 'VEROIA CROSS-DOCK', is_hub: true }, { id: 501, legacy_id: 'recLOC501', name: 'Θεσσαλονίκη', is_hub: false }], clients: [], trucks: [], trailers: [], drivers: [], partners: [] });
      S.unknown.push(m + ' ' + u.pathname);
      return json(route, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'rig' } }, 404);
    }
    if (/app-errors/.test(u.pathname)) { S.appErrors.push(rq.postData()); return json(route, { ok: true }); }
    const mm = u.pathname.match(/\/v0\/[^/]+\/([A-Za-z_][A-Za-z0-9_]*)(?:\/(rec[A-Za-z0-9]+))?/);
    if (mm) {
      if (m !== 'GET') {
        S.facadeWrites.push(m + ' ' + mm[1] + ' ' + (rq.postData() || ''));
        // deploy 2 + Q-10: a legacy national load is closed to every role but the owner (stream b, 422 legacy_closed)
        if (mm[1] === NL_T && o.role !== 'owner') return json(route, { error: { type: 'LEGACY_CLOSED', code: 'legacy_closed', message: CLOSED_MSG } }, 422);
        return json(route, { id: mm[2] || 'recRIGNEW000001', fields: {} });
      }
      if (mm[2]) return json(route, { id: mm[2], createdTime: '2026-10-30T10:00:00.000Z', fields: mm[1] === NL_T ? { Status: 'Assigned' } : {} });
      return json(route, { records: mm[1] === RAMP_T ? o.legacy : [] });
    }
    S.unknown.push(m + ' ' + u.pathname);
    return json(route, {});
  });
  await page.goto('app.html');
  await page.waitForFunction(() => /ΕΙΣΕΡΧΟΜΕΝΑ/.test((document.getElementById('content') || {}).textContent || ''), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  // logError keeps its rows in localStorage on 127.0.0.1 (core/utils.js _postAppError never posts from a rig)
  S.logged = async () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('tms_errors') || '[]').map(e => e.ctx + ' | ' + e.msg); } catch (_) { return ['unreadable']; } });
  return { ctx, page, S };
}
const content = page => page.evaluate(() => document.getElementById('content').innerHTML);
const rows = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].map(tr => tr.innerText.replace(/\s+/g, ' ').trim()), sel);
const IN = '.ramp-pair > div:nth-child(1) tbody tr', OUTR = '.ramp-pair > div:nth-child(2) tbody tr';
const clean = async (scn, S, allow) => {
  let own = S.aborted;
  const errs = S.consoleErrors.filter(t => !(allow && allow.test(t))).filter(t => !(own > 0 && /net::ERR_FAILED/.test(t) && own--));
  check(scn, '0 console errors, 0 page errors' + (allow ? ' (besides ' + allow + ')' : ''), !errs.length && !S.pageErrors.length, errs.concat(S.pageErrors));
  check(scn, 'no unknown request', !S.unknown.length, S.unknown);
  const logged = await S.logged();
  check(scn, 'nothing logged (tms_errors)', !logged.length, logged);
};

(async () => {
  const srv = await serve();
  const origin = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    if (on('before')) {
      const { ctx, page, S } = await open(browser, origin, { config: 'before' });
      await clean('before', S);
      check('before', 'only GET /plan/config, never /plan/board', JSON.stringify(S.plan) === JSON.stringify(['GET /plan/config']), S.plan);
      const html = await content(page);
      check('before', 'no v5 word, no strip', !/v5/.test(html), html.match(/.{60}v5.{60}/));
      check('before', 'the legacy line only', JSON.stringify((await rows(page, IN)).length) === '1' && (await rows(page, OUTR)).every(t => !/Πελάτης/.test(t)));
      check('before', 'nothing written', !S.facadeWrites.length, S.facadeWrites);
      if (OUT) await page.screenshot({ path: path.join(OUT, 'ramp-before-1440.png'), fullPage: true });
      await ctx.close();
    }
    if (on('before404')) {
      const { ctx, page, S } = await open(browser, origin, { config: 'before404' });
      await clean('before404', S, /status of 404/);
      check('before404', 'exactly one 404 resource line (GET /plan/config)', S.consoleErrors.filter(t => /status of 404/.test(t)).length === 1, S.consoleErrors);
      check('before404', 'only GET /plan/config, no v5 word', JSON.stringify(S.plan) === JSON.stringify(['GET /plan/config']) && !/v5/.test(await content(page)), S.plan);
      await ctx.close();
    }
    if (on('same')) {
      let main = null;
      // pinned: after the merge origin/main IS this file (the comparison would be with itself)
      try { main = execSync('git show 5f55a943:modules/daily_ramp.js', { cwd: TREE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { /* below */ }
      check('same', 'the pre-Ε14 tip 5f55a943 readable', !!main);
      if (main) {
        const a = await open(browser, origin, { config: 'before' });
        const b = await open(browser, origin, { config: 'before', rampSrc: main });
        // the router appends .page-footer to #content after the module draws: when it lands is timing, not the module
        const strip = h => h.replace(/<div class="page-footer">[\s\S]*?<\/div>\s*$/, '');
        const ha = strip(await content(a.page)), hb = strip(await content(b.page));
        check('same', 'before L: #content identical to 5f55a943\'s daily_ramp.js', ha === hb, `${ha.length} vs ${hb.length}`);
        await clean('same(main)', b.S);
        await a.ctx.close(); await b.ctx.close();
      }
    }
    for (const role of ['owner', 'warehouse']) {
      const scn = role === 'owner' ? 'after' : 'warehouse';
      if (!on(scn)) continue;
      const { ctx, page, S } = await open(browser, origin, { config: 'after', role });
      await clean(scn, S);
      check(scn, 'one /plan/board of the week', S.plan.filter(p => p.startsWith('GET /plan/board')).join() === 'GET /plan/board?week=' + WEEK, S.plan);
      const inb = await rows(page, IN), out = await rows(page, OUTR);
      check(scn, 'ΕΙΣΕΡΧΟΜΕΝΑ = legacy + hub unload + piece to Veroia (3)', inb.length === 3 && inb.some(t => /Πελάτης Χ.*Κατερίνη.*6.*ΑΒΓ-1001/.test(t)) && inb.some(t => /Πελάτης Κ.*5/.test(t)), inb);
      check(scn, 'ΕΞΕΡΧΟΜΕΝΑ = hub load (14.5, two places) + piece at Veroia (2)', out.length === 2 && out.some(t => /08:00.*Πελάτης Ε \/ Πελάτης Ν.*Θεσσαλονίκη \/ Λάρισα.*14\.5.*ΑΒΓ-1001.*v5 · Εβδομαδιαίο Εθνικών/.test(t)) && out.some(t => /Πελάτης Η.*8.*v5 · προς ανάθεση/.test(t)), out);
      const ctl = await page.evaluate(() => [...document.querySelectorAll('.ramp-pair tbody tr')].filter(tr => /v5 ·/.test(tr.innerText)).map(tr => tr.querySelectorAll('select,button').length));
      check(scn, 'v5 lines have no control (no time picker, no button)', ctl.length === 4 && ctl.every(n => n === 0), ctl);
      const kpis = await page.evaluate(() => [...document.querySelectorAll('.ramp-kpi-val')].map(e => e.textContent));
      check(scn, 'KPI in +31, out -22.5', kpis.includes('+31') && kpis.includes('-22.5'), kpis);
      check(scn, 'nothing written to the facade', !S.facadeWrites.length, S.facadeWrites);
      if (OUT) await page.screenshot({ path: path.join(OUT, `ramp-${scn}-1440.png`), fullPage: true });
      await ctx.close();
    }
    if (on('fail')) {
      const { ctx, page, S } = await open(browser, origin, { config: 'after', board: 500 });
      const html = await content(page);
      check('fail', 'red strip with Ξαναδοκίμασε', /Οι εθνικές κινήσεις v5 δεν διαβάστηκαν/.test(html) && /Ξαναδοκίμασε/.test(html));
      check('fail', 'the legacy line still there', (await rows(page, IN)).some(t => /Πελάτης Δ/.test(t)));
      const logged = await S.logged();
      check('fail', 'the failure is logged once (planFetch GET /plan/board)', logged.length === 1 && /planFetch GET \/plan\/board/.test(logged[0]), logged);
      let own = S.aborted;
      const rest = S.consoleErrors.filter(t => !(own > 0 && /net::ERR_FAILED/.test(t) && own--));
      check('fail', 'console: the 500 resource line + that one [TMS ERROR], no script error', !S.pageErrors.length && rest.every(t => /status of 500|\[TMS ERROR\] planFetch GET \/plan\/board/.test(t)), rest.concat(S.pageErrors));
      if (OUT) await page.screenshot({ path: path.join(OUT, 'ramp-fail-1440.png'), fullPage: false });
      await ctx.close();
    }
    if (on('legacy')) {
      const { ctx, page, S } = await open(browser, origin, { config: 'after', role: 'dispatcher', legacy: [LEGACY, LEGACY_NL] });
      await page.evaluate(() => { window.confirmAction = async () => true; });
      await page.locator('.ramp-pair > div:nth-child(2) tbody tr', { hasText: 'Πελάτης Ο' }).getByRole('button', { name: 'Φορτώθηκε' }).click();
      await page.waitForTimeout(2500);      // longer than _atRetry's first back-off (1 s): a retry would show here
      const nlPatches = S.facadeWrites.filter(w => w.startsWith('PATCH ' + NL_T));
      check('legacy', 'the RAMP row is marked Done (ramp is not frozen)', S.facadeWrites.some(w => w.startsWith('PATCH ' + RAMP_T) && /"Status":"Done"/.test(w)), S.facadeWrites);
      check('legacy', 'exactly ONE PATCH of the national load — no retry after 422 legacy_closed', nlPatches.length === 1, nlPatches);
      // two places: showErrorToast's container (the Worker's words, api.js) and the one #toast of core/ui.js (the ramp's own)
      const toasts = await page.evaluate(() => ['tms-toast-container', 'toast'].map(id => (document.getElementById(id) || { innerText: '' }).innerText).join(' | '));
      check('legacy', 'the Worker\'s Greek refusal is on screen', toasts.includes(CLOSED_MSG), toasts.slice(0, 300));
      check('legacy', 'and the ramp says the load did NOT advance — not overwritten by a green «Done ✓»', /ΔΕΝ ενημερώθηκε/.test(toasts) && !/Done ✓/.test(toasts), toasts.slice(0, 300));
      check('legacy', 'no script error', !S.pageErrors.length, S.pageErrors);
      const logged = await S.logged();
      check('legacy', 'the refusal is in the error log (not silent)', logged.some(l => l.includes(CLOSED_MSG)), logged);
      const before = S.facadeWrites.length;
      await page.evaluate(() => Promise.all([window._rampDone('v5:stop:10:load', 'false'), window._rampPostpone('v5:hub:40'), window._rampSvTime('v5:stop:10:load', '10:00')]));
      await page.waitForTimeout(500);
      check('legacy', 'a v5 id never reaches a write (Done / Postpone / time)', S.facadeWrites.length === before, S.facadeWrites.slice(before));
      if (OUT) await page.screenshot({ path: path.join(OUT, 'ramp-legacy-closed-1440.png'), fullPage: false });
      await ctx.close();
    }
    if (on('noconfig')) {
      const { ctx, page, S } = await open(browser, origin, { config: 'before', withConfig: false });
      const html = await content(page);
      check('noconfig', 'app.html without core/plan-config.js = unknown: amber strip (the dependency on (e)\'s bump)', /Η κατάσταση μετάβασης εθνικών \(v5\) δεν διαβάστηκε/.test(html));
      check('noconfig', 'no script error', !S.pageErrors.length, S.pageErrors);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  console.log(fails ? `\nNO-GO: ${fails} check(s) failed` : '\nGO');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
