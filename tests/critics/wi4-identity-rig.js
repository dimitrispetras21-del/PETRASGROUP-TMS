// Rig — Weekly International v4, FLAG-OFF IDENTITY (TECH_DESIGN §b, WP2).
//
// Why: v4 adds seams to modules/weekly_intl.js (hooks, extracted functions,
// WI_INTERNAL) and four new files to app.html. With FEATURES.WI_V2 = 'off' the
// old board must stay byte-identical — not «looks the same», the same bytes —
// and the new files must not ACT at load. A screenshot cannot prove that; a
// diff of everything the board produces can. Any byte of difference is NO-GO.
//
// What is compared, baseline vs candidate, on one synthetic week (invented
// names, plates and references only — the repo is public), clock frozen at
// Thu 8/10/2026 12:40 Athens (W41), an in-memory facade, role dispatcher:
//   1. #content.innerHTML after renderWeeklyIntl() settles (relays, national
//      carriers, stock and the W+1 chip read all answered);
//   2. #wi-ctx (innerHTML + inline style) after every menu opener, for every
//      row: _wiCtx, _wiImpCtx, _wiMatchedImpCtx, _wiSegCtx per member,
//      _wiLegCtx per rota leg, _wiRelayCtx per relay, _wiSplitHeaderCtx.
//      _wiPreCtx/_wiLotCtx are not on window: they are reached through
//      _wiCtx/_wiImpCtx on the pre-order and lot rows, as users reach them;
//   3. every facade request (method, path, filter, body) of three scripted
//      writes: a date change (date chip), an assignment save, a match (drop).
//      Compared as a sorted multiset: fire-and-forget downstream syncs run in
//      parallel, so their ORDER is not a property of the code under test;
//   4. every reportPageMetrics call (arguments) and WINTL._busy of a paint;
//   5. ZERO activity at load from the four v4 files: addEventListener (any
//      target), setTimeout/setInterval/requestAnimationFrame, fetch,
//      MutationObserver/ResizeObserver are wrapped before any script runs and
//      each call's stack is checked for the four file names.
// Steps 1–5 run twice: without a tms_wi4 key and with tms_wi4='1' (with the
// flag 'off' an opt-in must change nothing).
//
// Usage (needs Playwright: run with cwd = the main repo, which has
// node_modules; a worktree has none):
//   git archive origin/main | tar -x -C <scratch>/wi4-base     # the baseline
//   WI4_BASE_DIR=<scratch>/wi4-base [WI4_CAND_DIR=<candidate tree>] \
//     node <candidate tree>/tests/critics/wi4-identity-rig.js [--keep <dir>]
// WI4_CAND_DIR defaults to the tree this file lives in. --keep writes both
// capture sets as JSON for a manual diff. Exit code 1 on any difference.
// The rig serves both trees itself (one local static server, two mounts), so
// both pages share an origin shape and only the code differs.
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const WT = path.join(__dirname, '../..');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), WT] }));
const argv = process.argv.slice(2);
const keepAt = argv.indexOf('--keep');
const KEEP = keepAt >= 0 ? argv[keepAt + 1] : null;
const BASE_DIR = process.env.WI4_BASE_DIR;
const CAND_DIR = process.env.WI4_CAND_DIR || WT;
if (!BASE_DIR || !fs.existsSync(path.join(BASE_DIR, 'app.html'))) {
  console.error('WI4_BASE_DIR must point at a baseline tree (e.g. `git archive origin/main | tar -x -C <dir>`)');
  process.exit(2);
}
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const NOW = '2026-10-08T12:40:00+03:00';
const V4_FILES = /\/(core\/wi4-logic|core\/wi4-presence|modules\/weekly_intl_v2|modules\/wi4_actions)\.js/;
const T = {
  ORD: 'tblgHlNmLBH3JTdIM', TRK: 'tblEAPExIAjiA3asD', TRL: 'tblDcrqRJXzPrtYLm', DRV: 'tbl7UGmYhc2Y82pPs',
  PAR: 'tblLHl5m8bqONfhWv', CLI: 'tblFWKAQVUzAM8mCE', LOC: 'tblxu8DRfTQOFRCzS', NL: 'tblVW42cZnfC47gTb',
  LOTS: 'tblStockLots', MOVES: 'local_moves',
};

// ── Static server: /base/* → BASE_DIR, /cand/* → CAND_DIR ─────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function serve() {
  const roots = { base: path.resolve(BASE_DIR), cand: path.resolve(CAND_DIR) };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const m = u.pathname.match(/^\/(base|cand)(\/.*)$/);
    if (!m) { res.writeHead(404); return res.end(); }
    const file = path.join(roots[m[1]], decodeURIComponent(m[2] === '/' ? '/app.html' : m[2]));
    if (!file.startsWith(roots[m[1]]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ── Synthetic week (W41: Sat 3/10 – Fri 9/10/2026). Invented data only. ──
const ord = (id, dir, f) => ({ id, fields: Object.assign({ Type: 'International', Direction: dir, Status: 'Pending',
  Client: ['recCli1'], 'Client Name': 'CLIENT ' + id.slice(3), Reference: 'R-' + id.slice(3), 'Order No': 100 + parseInt(id.replace(/\D/g, '') || '0', 10),
  'Total Pallets': 10, 'Loading Summary': 'Alpha Farm, GR, Veria', 'Delivery Summary': 'Beta Market, DE, Berlin' }, f) });
const exp = (id, f) => ord(id, 'Export', Object.assign({ 'Loading DateTime': '2026-10-05T08:00:00.000Z', 'Delivery DateTime': '2026-10-07T10:00:00.000Z' }, f));
const imp = (id, f) => ord(id, 'Import', Object.assign({ 'Loading DateTime': '2026-10-07T08:00:00.000Z', 'Delivery DateTime': '2026-10-09T10:00:00.000Z',
  'Loading Summary': 'Gamma Foods, NL, Venlo', 'Delivery Summary': 'Delta Cash, GR, Athens' }, f));
const own = n => ({ Truck: ['recT' + n], Driver: ['recD' + n], Trailer: ['recR' + n], Status: 'Assigned' });
function seed() {
  const N = [1, 2, 3, 4, 5, 6, 7, 8];
  return {
    [T.TRK]: N.map(n => ({ id: 'recT' + n, fields: { 'License Plate': 'TST-10' + n, Active: true } })),
    [T.TRL]: N.map(n => ({ id: 'recR' + n, fields: { 'License Plate': 'TRL-20' + n } })),
    [T.DRV]: N.map(n => ({ id: 'recD' + n, fields: { 'Full Name': 'Driver Test ' + n, Active: true } })),
    [T.PAR]: [1, 2].map(n => ({ id: 'recP' + n, fields: { 'Company Name': 'Partner Test ' + n } })),
    [T.CLI]: [{ id: 'recCli1', fields: { 'Company Name': 'Client Test One' } }],
    [T.LOC]: [{ id: 'recLoc1', fields: { Name: 'Alpha Farm', City: 'Veria', Country: 'GR' } }],
    [T.ORD]: [
      exp('recE01', Object.assign(own(1), { 'Matched Import ID': 'recI01', 'Veroia Switch': true, 'Loading Summary': 'Alpha Farm, GR, Veria; Omega Pack, GR, Naousa' })),
      exp('recE02', { Partner: ['recP1'], 'Is Partner Trip': true, 'Partner Truck Plates': 'PRT-301', Status: 'Assigned', 'Partner Rate': 900 }),
      exp('recE03', { 'Delivery DateTime': '2026-10-08T10:00:00.000Z', 'Total Pallets': 34,
        'Delivery Summary': 'Beta Market, DE, Berlin; Kappa Store, DE, Hamburg; Lambda Shop, DK, Aarhus; Mu Hall, SE, Malmo; Nu Depot, NO, Oslo' }),
      exp('recE04', Object.assign(own(2), { 'Group ID': 'GRP-TST|recE04,recE05', 'Delivery DateTime': '2026-10-06T10:00:00.000Z' })),
      exp('recE05', Object.assign(own(2), { 'Group ID': 'GRP-TST|recE04,recE05', 'Delivery DateTime': '2026-10-06T14:00:00.000Z' })),
      exp('recE06', Object.assign(own(3), { 'Veroia Switch': true, 'Delivery DateTime': '2026-10-08T12:00:00.000Z' })),
      exp('recE07', { 'Ops Status': 'Provisional', 'Loading DateTime': '2026-10-09T08:00:00.000Z', 'Delivery DateTime': '2026-10-09T18:00:00.000Z' }),
      exp('recE08', { 'Delivery DateTime': '2026-10-09T10:00:00.000Z' }),
      exp('recE81', Object.assign(own(4), { 'Parent Order': ['recE08'], 'Leg No': 1, 'Delivery DateTime': '2026-10-06T10:00:00.000Z' })),
      exp('recE82', Object.assign(own(5), { 'Parent Order': ['recE08'], 'Leg No': 2, 'Loading DateTime': '2026-10-06T12:00:00.000Z', 'Delivery DateTime': '2026-10-09T10:00:00.000Z' })),
      exp('recE09', Object.assign(own(6), { 'Delivery DateTime': '2026-10-04T10:00:00.000Z', 'Loading DateTime': '2026-10-03T06:00:00.000Z', Status: 'In Transit' })),
      // W+1 plan that loads inside W41 (the T4 chip)
      exp('recE20', { 'Week Number': 42, 'Loading DateTime': '2026-10-09T06:00:00.000Z', 'Delivery DateTime': '2026-10-12T10:00:00.000Z', 'Loading Location 1': ['recLoc1'] }),
      imp('recI01', own(1)),
      imp('recI02', Object.assign(own(7), { 'Group ID': 'GI-TST|recI02,recI03', 'Total Pallets': 8 })),
      imp('recI03', Object.assign(own(7), { 'Group ID': 'GI-TST|recI02,recI03', 'Total Pallets': 6, 'Loading DateTime': '2026-10-07T12:00:00.000Z' })),
      imp('recI04', { 'Loading DateTime': '2026-10-06T08:00:00.000Z', 'Total Pallets': 12 }),
      imp('recI05', Object.assign(own(6), { 'Rotation ID': 'recE09', 'Loading DateTime': '2026-10-05T08:00:00.000Z' })),
      imp('recI06', { Partner: ['recP2'], 'Is Partner Trip': true, Status: 'Assigned', 'Own Stock Lot': 'recLot1', 'Total Pallets': 33 }),
      imp('recI07', { 'Ops Status': 'Provisional', 'Loading DateTime': '2026-10-08T08:00:00.000Z' }),
      imp('recI08', { 'Loading DateTime': '2026-10-12T08:00:00.000Z' }),   // next week: the ±1 «adj» section
    ],
    [T.NL]: [
      { id: 'recNL1', fields: { 'Source Order': ['recE01'], Truck: ['recT8'], Driver: ['recD8'] } },
      { id: 'recNL2', fields: { 'Source Order': ['recE06'] } },
    ],
    [T.LOTS]: [{ id: 'recLot1', fields: { Order: ['recI06'], Complete: false, 'Intake Status': 'Expected', Pallets: 33 } }],
    [T.MOVES]: [{ id: 'recMv1', fields: { 'Parent Order': ['recI01'], 'Move Kind': 'relay_delivery', Status: 'Planned',
      Driver: ['recD8'], Truck: ['recT8'], Date: '2026-10-09', 'Time From': '14:00' } }],
  };
}
function applyFields(target, fields) {
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete target[k]; else target[k] = v;
  }
}
const clone = o => JSON.parse(JSON.stringify(o));

// Runs in the page BEFORE any script: the session, the opt-in variant, and
// recorders on everything that would make a file act at load.
function initScript({ optIn }) {
  localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig', role: 'dispatcher', username: 'demo_dispatcher',
    loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600 * 1000 }));
  localStorage.setItem('tms_jwt', 'rig.identity.no-real-token');
  localStorage.setItem('tms_page', 'weekly_intl');
  if (optIn) localStorage.setItem('tms_wi4', optIn); else localStorage.removeItem('tms_wi4');
  const acts = window.__v4acts = [];
  const RE = /\/(core\/wi4-logic|core\/wi4-presence|modules\/weekly_intl_v2|modules\/wi4_actions)\.js/;
  const note = what => { const st = String(new Error().stack || ''); const m = st.match(RE); if (m) acts.push(what + ' ← ' + m[0]); };
  const wrapFn = (obj, name, what) => { const f = obj[name]; if (typeof f !== 'function') return;
    obj[name] = function () { note(what); return f.apply(this, arguments); }; };
  wrapFn(EventTarget.prototype, 'addEventListener', 'addEventListener');
  ['setTimeout', 'setInterval', 'requestAnimationFrame', 'fetch'].forEach(n => wrapFn(window, n, n));
  ['MutationObserver', 'ResizeObserver', 'IntersectionObserver'].forEach(n => {
    const C = window[n]; if (!C) return;
    window[n] = class extends C { constructor(cb) { note(n); super(cb); } };
  });
}

async function openBoard(browser, origin, tree, optIn) {
  const ctx = await browser.newContext({ baseURL: `${origin}/${tree}/`, viewport: { width: 1920, height: 1080 },
    serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  const db = seed();
  const S = { db, log: [], armed: false, inflight: 0, pageErrors: [] };
  page.on('pageerror', e => S.pageErrors.push(String(e).slice(0, 200)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(initScript, { optIn });
  // Nothing leaves the machine: fonts, Sentry, the live Worker — all answered here or aborted.
  await page.route(u => !u.href.startsWith(origin) && !u.href.includes(HOST), route => route.abort());
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, async route => {
    S.inflight++;
    try {
      const req = route.request(); const u = new URL(req.url()); const m = req.method();
      const body = (() => { try { return req.postDataJSON(); } catch (_) { return null; } })();
      const mm = u.pathname.match(/\/v0\/[^/]+\/([A-Za-z_][A-Za-z0-9_]*)(?:\/(rec[A-Za-z0-9]+))?$/);
      const tid = mm && mm[1], rid = mm && mm[2];
      const f = u.searchParams.get('filterByFormula') || '';
      if (S.armed) S.log.push(JSON.stringify({ m, path: u.pathname, q: [...u.searchParams].sort(), body }));
      if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (!mm) return json(route, m === 'GET' ? { records: [] } : { ok: true });
      const tbl = db[tid] || (db[tid] = []);
      if (m === 'GET') {
        if (rid) { const r = tbl.find(x => x.id === rid); return r ? json(route, clone(r)) : json(route, { error: { type: 'NOT_FOUND' } }, 404); }
        let out = tbl, g;
        if (tid === T.ORD) {
          if ((g = f.match(/\{Group ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Group ID'] === g[1]);
          else if ((g = f.match(/\{Matched Import ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Matched Import ID'] === g[1]);
          else if ((g = f.match(/\{Rotation ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Rotation ID'] === g[1]);
          else if ((g = f.match(/\{Week Number\}=(\d+)/))) out = tbl.filter(r => String(r.fields['Week Number']) === g[1]);
          else if (/RECORD_ID\(\)/.test(f)) { const w = new Set(f.match(/rec[A-Za-z0-9]+/g) || []); out = tbl.filter(r => w.has(r.id)); }
          else if ((g = f.match(/\{Direction\}='(Export|Import)'/)) && /International/.test(f)) out = tbl.filter(r => r.fields.Direction === g[1] && !r.fields['Week Number']);
          else out = [];
        } else if (tid === T.NL || tid === T.MOVES) {
          const want = new Set(f.match(/rec[A-Za-z0-9]+/g) || []);
          out = tbl.filter(r => [...(r.fields['Source Order'] || []), ...(r.fields['Parent Order'] || [])].some(id => want.has(id)));
        } else if (tid === T.LOTS) out = tbl.filter(r => !r.fields.Complete);
        return json(route, { records: clone(out) });
      }
      if (m === 'PATCH' && rid) { const r = tbl.find(x => x.id === rid); if (r) applyFields(r.fields, body && body.fields); return json(route, r ? clone(r) : {}); }
      if (m === 'POST') return json(route, { id: 'recNew1', fields: (body && body.fields) || {} });
      return json(route, {});
    } finally { S.inflight--; }
  });
  await page.goto('app.html');
  await page.waitForFunction(() => window.WINTL && WINTL.rows && WINTL.rows.length > 0
    && !/Φόρτωση εβδομάδας/.test(document.getElementById('content').textContent), null, { timeout: 60000 });
  await settle(page, S);
  return { page, S };
}
// Quiet = no facade request in flight for `quietMs` and every late source
// answered. After a write the downstream sync is fire-and-forget and some of
// its reads start late, so the scripted writes wait longer.
async function settle(page, S, quietMs = 800, timeout = 30000) {
  const t0 = Date.now(); let quietSince = 0;
  while (Date.now() - t0 < timeout) {
    const busy = S.inflight > 0 || !(await page.evaluate(() => !!window.WINTL && WINTL.relay && WINTL.relay.state !== 'loading'
      && !(WINTL.data.stock && WINTL.data.stock.status === 'loading')));
    if (busy) quietSince = 0; else if (!quietSince) quietSince = Date.now(); else if (Date.now() - quietSince > quietMs) return;
    await page.waitForTimeout(100);
  }
  throw new Error('board never settled');
}

async function captureMenus(page) {
  return page.evaluate(async () => {
    const out = {};
    const ctx = document.getElementById('wi-ctx');
    const host = document.getElementById('wi-rows') || document.body;
    const ev = () => ({ preventDefault() {}, stopPropagation() {}, currentTarget: host, target: host, clientX: 300, clientY: 200 });
    const tick = () => new Promise(r => setTimeout(r, 0));
    const cap = async (key, fn) => {
      ctx.innerHTML = ''; ctx.style.cssText = '';
      try { await fn(); } catch (e) { out[key] = 'THROW ' + (e && e.message); return; }
      await tick();
      out[key] = { html: ctx.innerHTML, style: ctx.style.cssText };
    };
    for (const r of WINTL.rows) {
      const k = `${r.type}:${(r.orderIds && r.orderIds[0]) || r.orderId}:${r.id}`;
      await cap('ctx ' + k, () => _wiCtx(ev(), r.id));
      await cap('impCtx ' + k, () => _wiImpCtx(ev(), r.id));
      await cap('matchedImpCtx ' + k, () => _wiMatchedImpCtx(ev(), r.id));
      await cap('splitHeaderCtx ' + k, () => _wiSplitHeaderCtx(ev(), r.id));
      if ((r.orderIds || []).length > 1) for (const oid of r.orderIds) {
        await cap(`segCtx ${k} ${oid} exp`, () => _wiSegCtx(ev(), r.id, oid, false));
        await cap(`segCtx ${k} ${oid} imp`, () => _wiSegCtx(ev(), r.id, oid, true));
      }
    }
    for (const legs of Object.values(WINTL._legs || {})) for (const l of legs) {
      const oid = (l.orderIds && l.orderIds[0]) || l.orderId;
      await cap('legCtx ' + oid, () => _wiLegCtx(ev(), oid));
    }
    for (const [oid, slot] of Object.entries((WINTL.relay && WINTL.relay.byOrder) || {}))
      for (const rec of Object.values(slot)) await cap(`relayCtx ${oid} ${rec.id}`, () => _wiRelayCtx(ev(), rec.id, oid));
    ctx.innerHTML = ''; ctx.style.cssText = '';
    return out;
  });
}
// The name-fit pass (_wi2Balance) measures names whose width depends on the
// --sL/--sR it wrote last time (scrollWidth never reads below clientWidth), so
// its output depends on HOW MANY passes ran — paints, late reads, resizes:
// timing, in v1 itself (measured: 0.380fr ↔ 0.390fr between two runs of the
// same tree). Before every capture both trees drop the previous split and run
// exactly one pass through the board's own debounced resize handler, so the
// fit is computed from the same starting layout instead of being masked.
async function content(page) {
  await page.evaluate(() => {
    const sheet = document.querySelector('#content .wk3.wi2');
    if (sheet) { sheet.style.removeProperty('--sL'); sheet.style.removeProperty('--sR'); }
    window.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(400);
  // An earlier pass that set and then cleared a font size leaves style="" —
  // a no-op attribute whose presence again only counts passes. Dropped in
  // both trees; any NON-empty style is compared as it is.
  return page.evaluate(() => {
    document.querySelectorAll('#content [style=""]').forEach(e => e.removeAttribute('style'));
    return document.getElementById('content').innerHTML;
  });
}
const rowOf = (page, oid) => page.evaluate(id => (WINTL.rows.find(r => (r.orderIds || [r.orderId]).includes(id)) || {}).id, oid);

async function runOne(browser, origin, tree, optIn) {
  const C = {};
  const { page, S } = await openBoard(browser, origin, tree, optIn);
  C.v4ActsAtLoad = await page.evaluate(() => window.__v4acts.slice());
  C.content = await content(page);
  C.menus = await captureMenus(page);
  // Metrics + busy map of one full paint (the side effect moved into
  // _wiPaintMetrics): wrapped after load — the global binding is writable.
  C.metrics = await page.evaluate(async () => {
    const calls = []; const real = window.reportPageMetrics;
    window.reportPageMetrics = function () { calls.push(JSON.stringify([...arguments])); return real && real.apply(this, arguments); };
    window.__rpm = calls; await renderWeeklyIntl(); return null;
  });
  await settle(page, S);
  C.metrics = await page.evaluate(() => ({ calls: window.__rpm.slice(), busy: JSON.stringify(WINTL._busy) }));
  C.contentAfterRepaint = await content(page);
  // 3 scripted writes. Each: arm, act, settle, disarm.
  const script = async (name, fn) => {
    S.log = []; S.armed = true;
    await fn();
    await settle(page, S, 2500); S.armed = false;
    C['requests:' + name] = S.log.slice().sort();
    C['content:' + name] = await content(page);
  };
  await script('date', () => page.evaluate(async () => {
    const host = document.getElementById('wi-rows');
    _wk3PickDate({ preventDefault() {}, stopPropagation() {}, clientX: 300, clientY: 200, currentTarget: host }, 'recE03', 'Loading DateTime', '2026-10-05T08:00:00.000Z');
    const inp = [...document.querySelectorAll('body > input[type=date]')].pop();
    inp.value = '2026-10-06'; await inp.onchange();
  }));
  const e03 = await rowOf(page, 'recE03');
  await script('assign', () => page.evaluate(async rid => {
    const r = WINTL.rows.find(x => x.id === rid);
    r.truckId = 'recT8'; r.truckLabel = 'TST-108'; r.driverId = 'recD8'; r.driverLabel = 'Driver Test 8';
    await _wiSaveFromPopover(rid);
  }, e03));
  const e06 = await rowOf(page, 'recE06');
  await script('match', () => page.evaluate(async rid => {
    const ev = { preventDefault() {}, stopPropagation() {}, dataTransfer: { getData: t => (t === 'application/x-wi-import' ? 'recI04' : '') } };
    await _wiDropOnRow(ev, rid);
  }, e06));
  C.db = clone(S.db[T.ORD]);
  C.pageErrors = S.pageErrors.slice();
  await page.context().close();
  return C;
}

function diff(a, b, at = '') {
  const out = [];
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a && typeof a === 'object') !== (b && typeof b === 'object')) return [`${at}: ${JSON.stringify(a)?.slice(0, 160)} ≠ ${JSON.stringify(b)?.slice(0, 160)}`];
  if (a && typeof a === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...diff(a[k], b[k], at ? `${at}.${k}` : k));
    return out;
  }
  if (a !== b) {
    const s1 = String(a), s2 = String(b); let i = 0; while (i < s1.length && s1[i] === s2[i]) i++;
    out.push(`${at}: first difference at char ${i}: «${s1.slice(Math.max(0, i - 60), i + 80)}» ≠ «${s2.slice(Math.max(0, i - 60), i + 80)}»`);
  }
  return out;
}

(async () => {
  const srv = await serve();
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  let fail = 0;
  const say = (ok, msg, detail) => { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} ${msg}${ok || !detail ? '' : '\n    ' + detail}`); };
  try {
    for (const optIn of [null, '1']) {
      const tag = optIn ? `tms_wi4='${optIn}'` : 'no tms_wi4';
      const base = await runOne(browser, origin, 'base', optIn);
      const cand = await runOne(browser, origin, 'cand', optIn);
      if (KEEP) {
        fs.mkdirSync(KEEP, { recursive: true });
        fs.writeFileSync(path.join(KEEP, `base-${optIn || 'none'}.json`), JSON.stringify(base, null, 1));
        fs.writeFileSync(path.join(KEEP, `cand-${optIn || 'none'}.json`), JSON.stringify(cand, null, 1));
      }
      say(base.content.length > 2000 && /wi-row-/.test(base.content), `[${tag}] the baseline painted a board (${base.content.length} chars)`);
      say(Object.keys(base.menus).filter(k => base.menus[k] && base.menus[k].html).length >= 10, `[${tag}] menus captured: ${Object.keys(base.menus).length} openers, ${Object.values(base.menus).filter(m => m && m.html).length} with items`);
      say(base['requests:date'].some(r => /PATCH/.test(r)) && base['requests:assign'].some(r => /PATCH/.test(r)) && base['requests:match'].some(r => /PATCH/.test(r)),
        `[${tag}] each scripted write reached the facade (date ${base['requests:date'].length}, assign ${base['requests:assign'].length}, match ${base['requests:match'].length} requests)`);
      say(cand.v4ActsAtLoad.length === 0, `[${tag}] zero listener/timer/observer/fetch from the four v4 files at load`, JSON.stringify(cand.v4ActsAtLoad));
      for (const key of Object.keys(base).filter(k => k !== 'v4ActsAtLoad')) {
        const d = diff(base[key], cand[key], key);
        say(d.length === 0, `[${tag}] ${key} identical`, d.slice(0, 5).join('\n    '));
      }
    }
  } finally {
    await browser.close(); srv.close();
  }
  console.log(fail ? `\nNO-GO: ${fail} check(s) failed` : '\nGO: flag-off identity holds');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
