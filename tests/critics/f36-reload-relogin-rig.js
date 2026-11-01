// Rig — F36 (owner 31/10/2026): a new version never reloads over an open form, and a 401 on a save never leaves the page.
//
// The real app.html (every script as served) in Chromium against an in-memory Worker (invented names only — the repo is
// public; nothing leaves the machine). A «form» is the app's own shared modal (core/ui.js openModal) with a field the
// rig types into; the new version is the SW's controllerchange event, dispatched on navigator.serviceWorker (the rig
// blocks real service workers); the saves are the app's own atPatch / planFetch, answered 401 by the fake Worker.
//
// Usage (cwd = the main repo, which has node_modules — memory «Κριτές από worktree»):
//   node <tree>/tests/critics/f36-reload-relogin-rig.js [scenario…] [--tree <dir to serve>] [--shots <dir>]
//   --tree: serve another checkout with THIS rig, e.g. a detached worktree of origin/main → the NO-GO run.
// Scenarios: idle (no form: every main page reads «nothing open», and the new version reloads at once) ·
//   swform (a typed modal: no reload, the pill; the modal closes → the reload comes by itself) · pill (a click on it
//   reloads, form or not) · facade401 (atPatch → 401: page kept, form kept, login window with «πάτα ξανά
//   Αποθήκευση», after the login the PATCH is NOT re-sent; a second press sends it with the new token) ·
//   plan401 (planFetch POST /plan/orders with a request_id → 401: after the login it is sent once more, same id) ·
//   confirm (a confirm dialog open under the window: Enter in the password field logs in and never answers the
//   dialog; Tab never leaves the window)
// FEATURES.WN_V5 is 'on' (config.js), so «weekly_natl» in idle is the v5 board (with /plan/* answering 404: its
// empty / error state — the board with cycles is not drawn here).
// Exit: 0 all green (GO) · 1 a check failed (on origin/main before F36: NO-GO).
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const req = m => require(require.resolve(m, { paths: [process.cwd(), path.join(__dirname, '../..')] }));
const { chromium } = req('playwright');

const argv = process.argv.slice(2);
const treeAt = argv.indexOf('--tree');
const shotsAt = argv.indexOf('--shots');
const TREE = treeAt >= 0 ? path.resolve(argv[treeAt + 1]) : path.join(__dirname, '../..');
const OUT = shotsAt >= 0 ? argv[shotsAt + 1] : null;
const want = argv.filter((a, i) => !a.startsWith('--') && !(treeAt >= 0 && i === treeAt + 1) && !(shotsAt >= 0 && i === shotsAt + 1));
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const on = n => !want.length || want.includes(n);
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const RID = '0b6f4b52-5d43-4c0e-9a51-0d6a3c0f5e11';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '');
const NEW_TOKEN = b64({ alg: 'none' }) + '.' + b64({ sub: 'demo_owner', exp: Math.floor(Date.now() / 1000) + 8 * 3600 }) + '.rig';

let fails = 0;
const check = (scn, name, cond, detail) => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${scn} ${name}${cond || detail === undefined ? '' : '  → ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400)}`);
};

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

async function open(browser, origin, page0) {
  const ctx = await browser.newContext({ baseURL: origin + '/', viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  const S = { facadeWrites: [], plan: [], logins: 0, navs: [], pageErrors: [] };
  page.on('pageerror', e => S.pageErrors.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.accept());
  page.on('framenavigated', f => { if (f === page.mainFrame()) S.navs.push(new URL(f.url()).pathname); });
  await page.addInitScript(p => {
    if (sessionStorage.getItem('rig_seeded')) return;   // a reload keeps whatever the page itself stored
    sessionStorage.setItem('rig_seeded', '1');
    localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig', role: 'owner', username: 'demo_owner', loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600 * 1000 }));
    localStorage.setItem('tms_jwt', 'rig.old.token');
    localStorage.setItem('tms_page', p);
  }, page0 || 'dashboard');
  await page.route(u => !u.href.startsWith(origin) && !u.href.includes(HOST), route => route.abort());
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, async route => {
    const rq = route.request(); const u = new URL(rq.url()); const m = rq.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const auth = (rq.headers()['authorization'] || '');
    if (u.pathname === '/auth/login') {
      S.logins++;
      return json(route, { token: NEW_TOKEN, user: { username: 'demo_owner', role: 'owner', name: 'Rig' } });
    }
    if (/app-errors/.test(u.pathname)) return json(route, { ok: true });
    if (u.pathname.startsWith('/plan/')) {
      if (m !== 'GET') {
        S.plan.push({ m, p: u.pathname, body: rq.postData(), auth });
        if (S.planWrites401 && S.plan.length === 1) return json(route, { error: { type: 'AUTH', code: 'unauthorized', message: 'rig' } }, 401);
        return json(route, { ok: true, order_id: 7 });
      }
      return json(route, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'rig' } }, 404);
    }
    const mm = u.pathname.match(/\/v0\/[^/]+\/([A-Za-z_][A-Za-z0-9_]*)(?:\/(rec[A-Za-z0-9]+))?/);
    if (mm) {
      if (m !== 'GET') {
        S.facadeWrites.push({ m, t: mm[1], auth });
        if (S.facadeWrites401 && S.facadeWrites.length === 1) return json(route, { error: 'Unauthorized' }, 401);
        return json(route, { id: mm[2] || 'recRIGNEW000001', fields: {} });
      }
      if (S.get401) return json(route, { error: 'Unauthorized' }, 401);
      if (mm[2]) return json(route, { id: mm[2], createdTime: '2026-10-30T10:00:00.000Z', fields: {} });
      return json(route, { records: [] });
    }
    return json(route, {});
  });
  await page.goto('app.html');
  await page.waitForFunction(() => ((document.getElementById('content') || {}).innerHTML || '').length > 50, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  return { ctx, page, S };
}

// The rig's «form»: the app's shared modal with one typed field (a real keyboard, so the input event is trusted).
async function openForm(page) {
  await page.evaluate(() => openModal('Νέα παραγγελία (rig)', '<label>Πελάτης <input id="rigField" value=""></label><label>Σημείωση <input id="rigNote"></label>', '<button id="rigSave">Αποθήκευση</button>'));
  await page.click('#rigField');
  await page.keyboard.type('Πελάτης Ρ');
  await page.click('#modalTitle');   // focus leaves the field: only «open» keeps the page busy
}
const mark = page => page.evaluate(() => { window.__rigMark = 1; });
const marked = page => page.evaluate(() => window.__rigMark === 1).catch(() => false);
const newVersion = page => page.evaluate(() => {
  if (!('serviceWorker' in navigator)) return 'no navigator.serviceWorker';
  navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  return 'sent';
});

(async () => {
  console.log('tree: ' + TREE);
  const srv = await serve();
  const origin = 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch();
  try {
    if (on('idle')) {
      const { ctx, page, S } = await open(browser, origin);
      const hasBusy = await page.evaluate(() => typeof tmsFormBusy === 'function');
      check('idle', 'core/sw-update.js loaded (tmsFormBusy)', hasBusy);
      if (hasBusy) {
        for (const p of ['dashboard', 'weekly_intl', 'weekly_natl', 'daily_ops', 'daily_ramp', 'orders', 'locations', 'clients', 'trucks', 'drivers', 'maint_dash', 'maint_req', 'pallet_ledger', 'payroll', 'expenses', 'costs', 'ceo_dashboard', 'performance']) {
          await page.evaluate(x => navigate(x), p);
          await page.waitForTimeout(1500);
          await page.mouse.click(1300, 980);   // nothing focused
          const why = await page.evaluate(() => tmsFormBusy());
          check('idle', `${p}: nothing open → «not busy»`, why === null, why);
        }
        await page.evaluate(() => navigate('dashboard'));
        await page.waitForTimeout(800);
      }
      await mark(page);
      const navs0 = S.navs.length;
      const sent = await newVersion(page);
      check('idle', 'navigator.serviceWorker exists to send the event', sent === 'sent', sent);
      await page.waitForTimeout(1500);
      check('idle', 'no form open: the new version reloads at once', !(await marked(page)) && S.navs.length > navs0, S.navs);
      await ctx.close();
    }
    if (on('swform')) {
      const { ctx, page, S } = await open(browser, origin);
      await openForm(page);
      await mark(page);
      await newVersion(page);
      await page.waitForTimeout(2500);
      const kept = await marked(page);
      check('swform', 'a typed form open: NO reload', kept, S.navs);
      if (kept) {
        check('swform', 'the typed text is still there', (await page.inputValue('#rigField')) === 'Πελάτης Ρ');
        const pill = await page.evaluate(() => { const p = document.getElementById('tmsUpdatePill'); return p ? p.textContent : null; });
        check('swform', 'the pill «Νέα έκδοση · ανανέωση»', pill === 'Νέα έκδοση · ανανέωση', pill);
        if (OUT) await page.screenshot({ path: path.join(OUT, 'f36-pill-1440.png') });
        await page.waitForTimeout(2500);
        check('swform', 'still no reload 5 s later while the form is open', await marked(page));
        await page.evaluate(() => closeModal());
        await page.waitForTimeout(3500);
        check('swform', 'the form closed → the reload came by itself (≤ 2 checks)', !(await marked(page)), S.navs);
      }
      await ctx.close();
    }
    if (on('pill')) {
      const { ctx, page, S } = await open(browser, origin);
      await openForm(page);
      await mark(page);
      await newVersion(page);
      await page.waitForTimeout(800);
      const has = await page.$('#tmsUpdatePill');
      check('pill', 'the pill is there with the form open', !!has && await marked(page));
      if (has) {
        await page.click('#tmsUpdatePill');
        await page.waitForTimeout(1500);
        check('pill', 'a click reloads at once (the user\'s choice)', !(await marked(page)), S.navs);
      }
      await ctx.close();
    }
    if (on('facade401')) {
      const { ctx, page, S } = await open(browser, origin);
      S.facadeWrites401 = true;
      await openForm(page);
      await mark(page);
      const navs0 = S.navs.length;
      const err = await page.evaluate(() => atPatch(TABLES.ORDERS, 'recRIG000000001', { Notes: 'rig' }).then(() => 'saved', e => e.message));
      await page.waitForTimeout(1500);
      const stayed = await marked(page);
      check('facade401', 'the page stays (no index.html, no reload)', stayed && S.navs.length === navs0, S.navs);
      if (stayed) {
        check('facade401', 'the caller is told «Η σύνδεση έληξε» (no «Unauthorized» on screen)', err === 'Η σύνδεση έληξε', err);
        check('facade401', 'the form is still open with the typed text', await page.evaluate(() => document.getElementById('modalOverlay').classList.contains('open')) && (await page.inputValue('#rigField')) === 'Πελάτης Ρ');
        const win = await page.evaluate(() => { const w = document.getElementById('tmsRelogin'); return w && { lost: w.querySelector('#tmsReloginLost').textContent, shown: getComputedStyle(w.querySelector('#tmsReloginLost')).display, user: w.querySelector('#tmsReloginUser').value }; });
        check('facade401', 'the login window is over the page, user filled in', !!win && win.user === 'demo_owner', win);
        check('facade401', 'its red line «Η σύνδεση έληξε — πάτα ξανά Αποθήκευση»', !!win && win.shown === 'block' && win.lost === 'Η σύνδεση έληξε — πάτα ξανά Αποθήκευση', win);
        if (OUT) await page.screenshot({ path: path.join(OUT, 'f36-relogin-1440.png') });
        const busy = await page.evaluate(() => typeof tmsFormBusy === 'function' ? tmsFormBusy() : 'n/a');
        check('facade401', 'a new version now waits too (the login window counts as open)', busy === 'open' || busy === 'focus', busy);
        await page.keyboard.press('Escape');   // must reach the window, never the form under it
        check('facade401', 'Escape does not close the form underneath', await page.evaluate(() => document.getElementById('modalOverlay').classList.contains('open')));
        if (win) {
          await page.fill('#tmsReloginPass', 'rig-password');
          await page.click('#tmsReloginBtn');
          await page.waitForTimeout(1200);
          check('facade401', 'one /auth/login, then the window is gone', S.logins === 1 && !(await page.$('#tmsRelogin')), S.logins);
          check('facade401', 'still the same page and form', await marked(page) && (await page.inputValue('#rigField')) === 'Πελάτης Ρ');
          const toast = await page.evaluate(() => (document.getElementById('tms-toast-container') || {}).innerText || '');
          check('facade401', 'a red toast «πάτα ξανά Αποθήκευση»', /πάτα ξανά Αποθήκευση/.test(toast), toast);
          check('facade401', 'the refused PATCH was NOT re-sent by itself (1 write)', S.facadeWrites.length === 1, S.facadeWrites);
          const again = await page.evaluate(() => atPatch(TABLES.ORDERS, 'recRIG000000001', { Notes: 'rig' }).then(() => 'saved', e => e.message));
          check('facade401', 'the user\'s second press is sent, with the new token', again === 'saved' && S.facadeWrites.length === 2 && S.facadeWrites[1].auth === 'Bearer ' + NEW_TOKEN, S.facadeWrites.map(w => w.auth.slice(0, 20)));
          check('facade401', 'the new login is stored', await page.evaluate(t => localStorage.getItem('tms_jwt') === t && JSON.parse(localStorage.getItem('tms_user')).username === 'demo_owner', NEW_TOKEN));
        }
      }
      check('facade401', '0 page errors', !S.pageErrors.length, S.pageErrors);
      await ctx.close();
    }
    if (on('plan401')) {
      const { ctx, page, S } = await open(browser, origin);
      S.planWrites401 = true;
      await openForm(page);
      await mark(page);
      const navs0 = S.navs.length;
      await page.evaluate(rid => { window.__rigPlan = 'waiting'; planFetch('POST', '/plan/orders', { body: { client_id: 1 }, requestId: rid }).then(v => { window.__rigPlan = v; }, e => { window.__rigPlan = 'threw ' + e.message; }); }, RID);
      await page.waitForTimeout(1500);
      const stayed = await marked(page);
      check('plan401', 'the page stays', stayed && S.navs.length === navs0, S.navs);
      if (stayed) {
        check('plan401', 'the save waits (neither answered nor refused)', await page.evaluate(() => window.__rigPlan) === 'waiting', await page.evaluate(() => window.__rigPlan));
        const win = await page.evaluate(() => { const w = document.getElementById('tmsRelogin'); return w && getComputedStyle(w.querySelector('#tmsReloginLost')).display; });
        check('plan401', 'the login window, WITHOUT «πάτα ξανά» (it is sent by itself)', win === 'none', win);
        if (win) {
          await page.fill('#tmsReloginPass', 'rig-password');
          await page.click('#tmsReloginBtn');
          await page.waitForTimeout(1500);
          const out = await page.evaluate(() => window.__rigPlan);
          check('plan401', 'after the login the save completes', out && out.ok === true && out.order_id === 7, out);
          const ids = S.plan.map(p => JSON.parse(p.body).request_id);
          check('plan401', 'exactly 2 POST /plan/orders, the SAME request_id', S.plan.length === 2 && ids[0] === RID && ids[1] === RID, ids);
          check('plan401', 'the second one carries the new token', S.plan.length === 2 && S.plan[1].auth === 'Bearer ' + NEW_TOKEN);
          check('plan401', 'the form is still there', (await page.inputValue('#rigField')) === 'Πελάτης Ρ');
        }
      }
      check('plan401', '0 page errors', !S.pageErrors.length, S.pageErrors);
      await ctx.close();
    }
    if (on('confirm')) {
      const { ctx, page, S } = await open(browser, origin);
      await page.evaluate(() => { window.__rigConfirm = 'waiting'; confirmAction('Διαγραφή της παραγγελίας;', { danger: true }).then(v => { window.__rigConfirm = v; }); });
      await page.waitForTimeout(300);
      S.get401 = true;
      await page.evaluate(() => atGet(TABLES.ORDERS, '', true).catch(() => null));
      await page.waitForTimeout(800);
      const win = !!(await page.$('#tmsRelogin'));
      check('confirm', 'the login window opens over the confirm dialog', win);
      if (win) {
        S.get401 = false;
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        check('confirm', 'Tab keeps focus inside the window', await page.evaluate(() => document.getElementById('tmsRelogin').contains(document.activeElement)));
        await page.fill('#tmsReloginPass', 'rig-password');
        await page.focus('#tmsReloginPass');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1200);
        check('confirm', 'Enter logs in (one /auth/login, window gone)', S.logins === 1 && !(await page.$('#tmsRelogin')), S.logins);
        check('confirm', 'Enter did NOT answer the confirm dialog underneath', await page.evaluate(() => window.__rigConfirm) === 'waiting', await page.evaluate(() => window.__rigConfirm));
        check('confirm', 'the confirm dialog is still open', await page.evaluate(() => document.getElementById('modalOverlay').classList.contains('open')));
      }
      check('confirm', '0 page errors', !S.pageErrors.length, S.pageErrors);
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(fails ? `\n${fails} check(s) failed — NO-GO` : '\nall green — GO');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
