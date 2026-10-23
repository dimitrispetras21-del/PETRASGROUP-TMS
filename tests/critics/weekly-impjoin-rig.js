// Rig — «join a 2nd/3rd import into a truck's import load» on the Weekly
// International (Παντελής 8/10/2026: «πάμε να ενώσουμε δεύτερη εισαγωγή σε ένα
// φορτίο που έχει ήδη άλλα, οι παλέτες είναι ok δεν υπερβαίνουν τις 33 και
// εμφανίζει σφάλμα» + the board then sat on «Φόρτωση εβδομάδας 41…»).
// Grown from the investigation rig (scenarios S0…S11, 8/10). Week 41, Thu
// 8/10/2026 12:40 Athens, an in-memory facade (pattern of
// wi-assign-never-locks-proof.js) — the proof is the PATCH bodies and the
// rows of the fake table, never a toast.
//
// Usage (cwd = the MAIN repo root: it holds .har/ for tests/critics/auth.js):
//   PW_BASE_URL=http://127.0.0.1:8991/.claude/worktrees/<wt>/ \
//     node <wt>/tests/critics/weekly-impjoin-rig.js [scenario…] [--shots <dir>]
// Scenarios: J1 drop on the cell · J2 drop on a tile · J3 card menu ·
//   J3b tile menu item · J4 import menu (truck load as candidate) ·
//   J5 past 33 on a drop (owner 9/10: asked — «Άκυρο» writes nothing, «Να
//   μπει» joins, the toast says the total) · J4b past 33 from the import
//   menu's load · J5b two picks past 33, ONE question · J21 export
//   «Ομαδοποίηση» past 33 · J6 race · J6b pallets changed past 33 meanwhile
//   (nobody was asked → a race, not a silent over-33 write) · J7 unpinned group · J8 lone import · J9 stale drag (S9) ·
//   J10 group into group (S11) · J10b other vehicle · J11 free group (S1) ·
//   J12 watchdog (S7) · J13 stalled paperclip index (S7, docs)
// Review fixes (NO_GO 9/10, coordinator decisions):
//   J10c both free on the SAME truck · J14 same-truck joiner (P1, reviewer R1)
//   · J15 other-truck joiner · J16 drop on an EXPORT tile (P3-2, reviewer R2)
//   · J17 matched to an export of another week (P3-3) · J18 Cancelled (P3-4)
//   · J19 rota leg on every path (P3-5) · J20 no silent cap at 6
// The joiner's OWN round trip (fix/own-rt-join-rota, coordinator 9/10 — what
// «Καθαρισμός ανάθεσης» leaves on a solo trip; /costs/* played in memory):
//   J22 an empty own trip leaves first (DELETE before the PATCH, cancelled) ·
//   J23 cost lines · J24 a dispatcher's 403 on cost lines · J25 another order
//   on the trip · J26 the trips cannot be read · J27 a payroll line — all
//   refused, nothing written · J28 a two-member group on one empty trip
// Exit code 1 when any check fails. Prints one line per check + a summary.
const path = require('path');
const fs = require('fs');
const WT = path.join(__dirname, '../..');
const { chromium } = require(path.join(WT, 'node_modules/playwright'));
const { preparePage, gotoPage } = require(path.join(__dirname, 'auth.js'));
const argv = process.argv.slice(2);
const shotsAt = argv.indexOf('--shots');
const OUT = shotsAt >= 0 ? argv[shotsAt + 1] : null;
const want = argv.filter((a, i) => !(shotsAt >= 0 && (i === shotsAt || i === shotsAt + 1)));
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8991/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { ORD: 'tblgHlNmLBH3JTdIM', TRK: 'tblEAPExIAjiA3asD', DRV: 'tbl7UGmYhc2Y82pPs', DOCS: 'tblOrderDocuments' };
// «Order No» = orders.id (migration 019): the round-trip lookup (_wiRtOf) needs
// it. One stable number per record id for the whole run.
const PGS = {}; let pgNext = 5000;
const pgOf = id => PGS[id] || (PGS[id] = pgNext++);

const EXP = (id, ref, st, truck, extra = {}) => ({ id, fields: Object.assign({
  Type: 'International', Direction: 'Export', Client: ['recClient1'], Reference: ref, Status: st, 'Client Name': 'EXP ' + ref, 'Order No': pgOf(id),
  'Loading DateTime': '2026-10-06T08:00:00', 'Delivery DateTime': '2026-10-08T10:00:00', 'Total Pallets': 33,
  'Loading Summary': 'Veroia', 'Delivery Summary': 'Berlin',
}, truck ? { Truck: [truck], Driver: [truck.replace('recT', 'recD')] } : {}, extra) });
const IMP = (id, ref, st, truck, pal, load, extra = {}) => ({ id, fields: Object.assign({
  Type: 'International', Direction: 'Import', Client: ['recClient1'], Reference: ref, Status: st, 'Client Name': 'IMP ' + ref, 'Order No': pgOf(id),
  'Loading DateTime': load + 'T08:00:00', 'Delivery DateTime': '2026-10-12T10:00:00', 'Total Pallets': pal,
  'Loading Summary': 'Load ' + ref, 'Delivery Summary': 'Athens',
}, truck ? { Truck: [truck], Driver: [truck.replace('recT', 'recD')] } : {}, extra) });

function seed(opts) {
  const trucks = ['recT19', 'recT27', 'recT30', 'recT31', 'recT32', 'recT33', 'recT34', 'recT35'];
  const G27 = 'GI-MUXRGWY6|recI461,recI463';
  return {
    [T.TRK]: trucks.map(id => ({ id, fields: { 'License Plate': 'TRK-' + id.slice(4), Active: true } })),
    [T.DRV]: trucks.map(id => ({ id: id.replace('recT', 'recD'), fields: { 'Full Name': 'Driver ' + id.slice(4), Active: true } })),
    [T.ORD]: [
      // Export rows delivering Thu 8/10, two carrying a MATCHED import group (trucks 27 / 19)
      EXP('recE27', 'E27', 'In Transit', 'recT27', { 'Matched Import ID': 'recI461' }),
      EXP('recE19', 'E19', 'In Transit', 'recT19', { 'Matched Import ID': 'recI458' }),
      EXP('recE30', 'E30', 'Assigned', 'recT30'),                                   // empty import cell (control)
      // a matched group whose Group ID pins no order yet (J7), the export names its 2nd member
      EXP('recE33', 'E33', 'Assigned', 'recT33', { 'Matched Import ID': 'recIP2' }),
      // a matched LONE import (J8)
      EXP('recE34', 'E34', 'Assigned', 'recT34', { 'Matched Import ID': 'recIL' }),
      IMP('recI461', '461', 'In Transit', 'recT27', 12, '2026-10-08', { 'Group ID': G27 }),
      IMP('recI463', '463', 'Assigned', 'recT27', 12, '2026-10-09', { 'Group ID': G27 }),
      IMP('recI458', '458', 'In Transit', 'recT19', 25, '2026-10-07', { 'Group ID': 'GI-MUXR5RNG|recI458,recI459' }),
      IMP('recI459', '459', 'Delivered', 'recT19', 9, '2026-10-07', { 'Group ID': 'GI-MUXR5RNG|recI458,recI459' }),
      IMP('recIP1', 'P1', 'Assigned', 'recT33', 6, '2026-10-07', { 'Group ID': 'GI-NOPIN' }),
      IMP('recIP2', 'P2', 'Assigned', 'recT33', 6, '2026-10-08', { 'Group ID': 'GI-NOPIN' }),
      IMP('recIL', 'L1', 'Assigned', 'recT34', 5, '2026-10-08'),
      // the new import of 12:37 — In Transit, no truck, no group, 10 p
      IMP('recI471', '471', 'In Transit', null, 10, '2026-10-08'),
      // a free import on Wednesday 7/10
      IMP('recI470', '470', 'Pending', null, 8, '2026-10-07'),
      // UNMATCHED group, own truck (ΚΕΝΟ EXPORT row), 11+12 = 23 p
      IMP('recIA', 'IA', 'Assigned', 'recT31', 11, '2026-10-08', { 'Group ID': 'GI-SMALL|recIA,recIB' }),
      IMP('recIB', 'IB', 'Assigned', 'recT31', 12, '2026-10-08', { 'Group ID': 'GI-SMALL|recIA,recIB' }),
      // UNMATCHED group whose members already execute (In Transit + Delivered), 10+5 = 15 p
      IMP('recIC', 'IC', 'In Transit', 'recT32', 10, '2026-10-08', { 'Group ID': 'GI-EXEC|recIC,recID' }),
      IMP('recID', 'ID', 'Delivered', 'recT32', 5, '2026-10-08', { 'Group ID': 'GI-EXEC|recIC,recID' }),
      ...(opts.two ? [
        IMP('recIE', 'IE', 'Assigned', ({ truck: 'recT31', same: 'recT32' })[opts.two] || null, 5, '2026-10-09', { 'Group ID': 'GI-TWO|recIE,recIF' }),
        IMP('recIF', 'IF', 'Pending', ({ truck: 'recT31', same: 'recT32' })[opts.two] || null, 5, '2026-10-09', { 'Group ID': 'GI-TWO|recIE,recIF' }),
      ] : []),
      // P1: a free import already on the load's OWN truck (it has its own RT in prod) / on another truck
      ...(opts.same ? [IMP('recIX', 'IX', 'Assigned', 'recT27', 5, '2026-10-09')] : []),
      ...(opts.other ? [IMP('recIY', 'IY', 'Assigned', 'recT35', 5, '2026-10-09')] : []),
      // P3-2: a free EXPORT group (tiles in the export column), no import
      ...(opts.expGrp ? [
        EXP('recEA', 'EA', 'Assigned', 'recT35', { 'Group ID': 'GRP-AB|recEA,recEB', 'Total Pallets': 10 }),
        EXP('recEB', 'EB', 'Assigned', 'recT35', { 'Group ID': 'GRP-AB|recEA,recEB', 'Total Pallets': 10 }),
      ] : []),
      // P3-3: 470 is matched ON THE SERVER to an export of W43 the board never loads (S.off)
      ...(opts.offWeek ? [EXP('recEW', 'EW', 'Assigned', 'recT30', { 'Matched Import ID': 'recI470', 'Loading DateTime': '2026-10-20T08:00:00', 'Delivery DateTime': '2026-10-22T10:00:00' })] : []),
      // P3-4 / P3-5: a Cancelled import, a rota leg (hangs under E30)
      ...(opts.cancelled ? [IMP('recICX', 'CX', 'Cancelled', null, 4, '2026-10-08')] : []),
      ...(opts.leg ? [IMP('recILG', 'LG', 'Assigned', null, 3, '2026-10-08', { 'Rotation ID': 'recE30' })] : []),
      // 33 is a warning (owner 9/10): two unassigned exports, 20 + 15 = 35
      ...(opts.freeExp ? [
        EXP('recEF1', 'EF1', 'Pending', null, { 'Total Pallets': 20 }),
        EXP('recEF2', 'EF2', 'Pending', null, { 'Total Pallets': 15 }),
      ] : []),
      // no silent cap: eight more small free imports
      ...(opts.many ? [1, 2, 3, 4, 5, 6, 7, 8].map(k => IMP('recIM' + k, 'M' + k, 'Pending', null, 1, '2026-10-08')) : []),
    ],
  };
}
function applyFields(target, fields) {
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete target[k]; else target[k] = v;
  }
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-08T12:40:00+03:00'));
  const db = seed(opts);
  const S = { db, log: [], pageErrors: [], held: [], armed: false, latency: opts.latencyMs || 0, hang: {}, off: new Set(opts.offWeek ? ['recEW'] : []),
    // /costs/* in memory: the live round trips (rts), cost lines per trip, and
    // switches for a failing trip read / a dispatcher's 403 on cost lines.
    rts: JSON.parse(JSON.stringify(opts.rts || [])), lines: opts.lines || {}, rtFail: false, linesForbidden: !!opts.linesForbidden };
  page.on('pageerror', e => S.pageErrors.push(String(e).slice(0, 200)));
  page.on('dialog', d => { S.log.push({ k: 'dialog', msg: d.message() }); d.accept(); });
  await preparePage(page, 'dispatcher');
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, async route => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const body = (() => { try { return req.postDataJSON(); } catch (_) { return null; } })();
    const mm = u.pathname.match(/\/v0\/[^/]+\/(tbl[A-Za-z0-9]+)(?:\/(rec[A-Za-z0-9]+))?$/);
    const tid = mm && mm[1], rid = mm && mm[2];
    const f = u.searchParams.get('filterByFormula') || '';
    if (S.armed) S.log.push({ k: 'req', m, path: u.pathname.replace('/v0/app', ''), f: f.slice(0, 90) });
    // Hang switches: never answered (the browser side decides what to do)
    if (S.hang.docs && tid === T.DOCS) { S.held.push('docs'); return; }
    if (S.hang.exports && tid === T.ORD && m === 'GET' && !rid && /\{Direction\}='Export'/.test(f)) { S.held.push('exports'); return; }
    if (S.latency) await new Promise(r => setTimeout(r, S.latency));
    // The Worker's /costs/rt + DELETE …/legs + /costs/lines, and the DB's
    // rt_recompute (013): a trip left with no leg is cancelled.
    if (u.pathname === '/costs/rt' && m === 'GET') return S.rtFail ? json(route, { error: 'boom' }, 500) : json(route, { records: JSON.parse(JSON.stringify(S.rts)) });
    const legDel = u.pathname.match(/^\/costs\/rt\/(\d+)\/legs$/);
    if (legDel && m === 'DELETE') {
      const r = S.rts.find(x => x.id === Number(legDel[1])), pg = Number(u.searchParams.get('order_id'));
      if (S.armed) S.log.push({ k: 'delete', tid: 'ct_rt_legs', id: legDel[1], fields: { order_id: pg } });
      if (!r || !r.ct_rt_legs.some(l => l.order_id === pg)) return json(route, { error: 'Leg not found on this round trip' }, 404);
      r.ct_rt_legs = r.ct_rt_legs.filter(l => l.order_id !== pg);
      if (!r.ct_rt_legs.length) r.status = 'cancelled';
      return json(route, { deleted: true });
    }
    if (u.pathname === '/costs/lines' && m === 'GET') {
      if (S.linesForbidden) return json(route, { error: 'Forbidden' }, 403);
      const n = S.lines[u.searchParams.get('rt_id')] || 0;
      return json(route, { records: n ? [{ id: 1 }] : [], next_offset: n > 1 ? 1 : null });
    }
    if (!mm) return json(route, m === 'GET' ? { records: [] } : { ok: true });
    const tbl = db[tid] || (db[tid] = []);
    if (m === 'GET') {
      if (rid) { const r = tbl.find(x => x.id === rid); return r ? json(route, JSON.parse(JSON.stringify(r))) : json(route, { error: { type: 'NOT_FOUND' } }, 404); }
      if (tid !== T.ORD) return json(route, { records: tbl });
      let out = [], g;
      if ((g = f.match(/\{Group ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Group ID'] === g[1]);
      else if ((g = f.match(/\{Matched Import ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Matched Import ID'] === g[1]);
      else if ((g = f.match(/\{Rotation ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Rotation ID'] === g[1]);
      else if (/RECORD_ID\(\)/.test(f)) { const w = new Set((f.match(/rec[A-Za-z0-9]+/g) || [])); out = tbl.filter(r => w.has(r.id)); }
      else if ((g = f.match(/\{Direction\}='(Export|Import)'/)) && /International/.test(f)) out = tbl.filter(r => r.fields.Direction === g[1] && !S.off.has(r.id));
      return json(route, { records: JSON.parse(JSON.stringify(out)) });
    }
    if (S.armed) S.log.push({ k: m.toLowerCase(), tid, id: rid, fields: body && body.fields ? body.fields : body });
    if (m === 'PATCH' && rid) { const r = tbl.find(x => x.id === rid); if (r) applyFields(r.fields, body.fields); return json(route, r || {}); }
    if (m === 'POST') return json(route, { id: 'recNew', fields: (body && body.fields) || {} });
    return json(route, {});
  });
  for (let attempt = 0; attempt < 2; attempt++) {     // flaky network: one retry of the first load
    try { await gotoPage(page, 'weekly_intl', BASE); break; } catch (e) { if (attempt) throw e; }
  }
  await page.waitForFunction(() => window.WINTL && WINTL.rows && WINTL.rows.length > 0 && !/Φόρτωση εβδομάδας/.test(document.getElementById('content').textContent), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await instrument(page);
  return { page, S };
}
// Toasts, logError calls and the spinner timeline, recorded in the page.
async function instrument(page) {
  await page.evaluate(() => {
    window.__ev = []; const t0 = performance.now(); const at = () => Math.round(performance.now() - t0);
    window.__mark = () => { window.__ev = []; };
    const wrap = (name, kind) => { const fn = window[name]; window[name] = function (m, ty) { window.__ev.push({ t: at(), k: kind, msg: String(m).slice(0, 300), type: ty || (kind === 'toast' ? 'success' : 'error') }); return fn && fn.apply(this, arguments); }; };
    wrap('toast', 'toast'); wrap('showErrorToast', 'errtoast');
    const le = window.logError; window.logError = function (e, c) { window.__ev.push({ t: at(), k: 'logError', msg: (c || '') + ': ' + (e && e.message || e) }); return le && le.apply(this, arguments); };
    const ca = window.confirmAction; window.confirmAction = function (m) { window.__ev.push({ t: at(), k: 'confirm', msg: String(m).slice(0, 300) }); return ca.apply(this, arguments); };
    const c = document.getElementById('content'); let spin = /Φόρτωση εβδομάδας/.test(c.textContent);
    new MutationObserver(() => { const s = /Φόρτωση εβδομάδας/.test(c.textContent); if (s !== spin) { spin = s; window.__ev.push({ t: at(), k: s ? 'SPINNER_ON' : 'SPINNER_OFF', msg: s ? '' : (c.querySelector('.empty-state[role=alert]') ? 'ERROR_STATE' : 'BOARD') }); } })
      .observe(c, { childList: true, subtree: true, characterData: true });
  });
}
const rowOf = (page, oid) => page.evaluate(id => (WINTL.rows.find(r => (r.orderIds || []).includes(id)) || {}).id, oid);
const ev = page => page.evaluate(() => window.__ev);
const state = page => page.evaluate(() => { const c = document.getElementById('content'); return /Φόρτωση εβδομάδας/.test(c.textContent) ? 'SPINNER' : c.querySelector('.empty-state[role=alert]') ? 'ERROR_STATE' : (c.querySelector('.wk3-row') ? 'BOARD' : 'OTHER'); });
const patches = S => S.log.filter(x => x.k === 'patch');
const writes = S => S.log.filter(x => ['patch', 'post', 'delete'].includes(x.k));
const fld = (S, id, k) => (S.db[T.ORD].find(r => r.id === id) || { fields: {} }).fields[k];
const groupOf = (page, oid) => page.evaluate(id => { const r = WINTL.rows.find(x => x.type === 'import' && (x.orderIds || []).includes(id)); return r ? r.orderIds.slice().sort().join('+') : null; }, oid);
async function pointsIn(page, sel) {
  return page.evaluate(s => {
    const el = document.querySelector(s); if (!el) return null; el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); let free = null, tile = null;
    for (let y = r.top + 2; y < r.bottom - 1; y += 3) for (let x = r.left + 2; x < r.right - 1; x += 4) {
      const t = document.elementFromPoint(x, y); if (!t || !el.contains(t)) continue;
      if (t.closest('.wk3-seg')) { if (!tile) tile = { x, y }; }
      else if (!free) free = { x, y };
      if (free && tile) break;
    }
    return { free, tile };
  }, sel);
}
async function dragTo(page, srcSel, pt) {
  const s = await page.locator(srcSel).first().boundingBox();
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 10, s.y + s.height / 2 + 10, { steps: 3 });
  await page.mouse.move(pt.x, pt.y, { steps: 15 });
  await page.mouse.up();
}
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
// The 33 question (owner 9/10): the app's own modal (confirmAction), never
// the browser's dialog. palAsk waits for it and returns its text.
async function palAsk(page) {
  await page.waitForSelector('#modalOverlay.open #_cfaOk', { timeout: 8000 });
  return (await page.locator('#modalOverlay').innerText()).replace(/\n+/g, ' | ');
}
async function palAnswer(page, yes) {
  await page.locator(yes ? '#_cfaOk' : '#_cfaCancel').click();
  await page.waitForFunction(() => !document.getElementById('modalOverlay').classList.contains('open'), null, { timeout: 8000 });
}
const sumBox = page => page.evaluate(() => { const el = document.getElementById('wiGrpSum'); return el ? { text: el.textContent.trim(), over: el.classList.contains('over') } : null; });
const capDisabled = page => page.evaluate(() => [...document.querySelectorAll('#wi-panel .wiGrpPick')].filter(b => b.disabled && !b.dataset.fixed).map(b => b.value));

const results = [];
function ok(scn, name, cond, detail) {
  results.push({ scn, name, pass: !!cond });
  console.log(`${cond ? '✓' : '✗'} ${scn} ${name}${cond ? '' : '  → ' + String(JSON.stringify(detail)).slice(0, 400)}`);
}
const on = n => !want.length || want.includes(n);
const G27 = 'GI-MUXRGWY6|recI461,recI463';
// The P1 refusal, verbatim (coordinator 9/10).
const ASG = (n, what) => `Η #${n} έχει ήδη ανάθεση (${what}) — πρώτα «Καθαρισμός ανάθεσης» στην #${n}, μετά πρόσθεσέ τη στο φορτίο`;
// A refused join: nothing written, the words on screen, ONE log line, no reload.
async function checkRefused(scn, page, S, text) {
  const E = await ev(page);
  ok(scn, 'nothing written', writes(S).length === 0, writes(S));
  ok(scn, 'refusal, verbatim', E.some(e => e.k === 'errtoast' && e.type === 'warn' && e.msg === text), { want: text, got: E.filter(e => /toast/.test(e.k)) });
  ok(scn, 'exactly one logError', E.filter(e => e.k === 'logError').length === 1, E.filter(e => e.k === 'logError'));
  ok(scn, 'no reload spinner, final BOARD, no page errors', !E.some(e => e.k === 'SPINNER_ON') && (await state(page)) === 'BOARD' && !S.pageErrors.length, { E, err: S.pageErrors });
}
// The checks every successful join of 470 into E27's load must pass.
async function checkJoin470(scn, page, S, E) {
  const P = patches(S);
  ok(scn, 'exactly one PATCH, on 470', P.length === 1 && P[0].id === 'recI470', P.map(p => p.id));
  const f = (P[0] || {}).fields || {};
  ok(scn, '470 gets the load\'s exact Group ID', f['Group ID'] === G27, f['Group ID']);
  ok(scn, '470 gets the load\'s vehicle (truck + driver)', JSON.stringify(f.Truck) === '["recT27"]' && JSON.stringify(f.Driver) === '["recD27"]', f);
  ok(scn, 'every member carries the base Group ID (db)', ['recI461', 'recI463', 'recI470'].every(id => fld(S, id, 'Group ID') === G27), ['recI461', 'recI463', 'recI470'].map(id => fld(S, id, 'Group ID')));
  ok(scn, 'the export is not rewritten (db)', fld(S, 'recE27', 'Matched Import ID') === 'recI461', fld(S, 'recE27', 'Matched Import ID'));
  ok(scn, 'board: E27\'s load shows 461+463+470', (await groupOf(page, 'recI470')) === 'recI461+recI463+recI470', await groupOf(page, 'recI470'));
  ok(scn, 'no «Φόρτωση εβδομάδας» spinner', !E.some(e => e.k === 'SPINNER_ON'), E);
  ok(scn, 'a success toast names the load', E.some(e => e.k === 'toast' && e.type === 'success' && /470 μπήκε στο φορτίο TRK-27 \(461\+463\+470 · 32 π\.\)/.test(e.msg)), E);
  ok(scn, 'no logError', !E.some(e => e.k === 'logError'), E.filter(e => e.k === 'logError'));
  ok(scn, 'final state BOARD, no page errors', (await state(page)) === 'BOARD' && !S.pageErrors.length, S.pageErrors);
}

(async () => {
  const browser = await chromium.launch();
  const done = async page => page.context().close();

  if (on('J1') || on('J2')) for (const where of ['free', 'tile']) {   // drop 470 on E27's matched cell
    const scn = where === 'free' ? 'J1' : 'J2'; if (!on(scn)) continue;
    const { page, S } = await newPage(browser, { latencyMs: 60 });
    const e27 = await rowOf(page, 'recE27');
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    ok(scn, 'drop point found', pts && pts[where], pts);
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recI470 .wk3-num', pts[where]);
    await page.waitForTimeout(4000); S.armed = false;
    await checkJoin470(scn, page, S, await ev(page));
    ok(scn, 'the drag id is cleared after the drop', (await page.evaluate(() => window._wiDragging)) === null);
    await shot(page, scn + '-after-drop-' + where);
    await done(page);
  }

  if (on('J3')) {   // the matched card's menu «+ Εισαγωγή στο φορτίο…»
    const scn = 'J3';
    const { page, S } = await newPage(browser);
    const e27 = await rowOf(page, 'recE27');
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    await page.mouse.click(pts.free.x, pts.free.y, { button: 'right' }); await page.waitForTimeout(300);
    const menu = (await page.locator('#wi-ctx').innerText()).replace(/\n/g, ' | ');
    ok(scn, 'card menu offers «+ Εισαγωγή στο φορτίο…»', /\+ Εισαγωγή στο φορτίο/.test(menu), menu);
    await page.locator('#wi-ctx button:has-text("+ Εισαγωγή στο φορτίο")').click(); await page.waitForTimeout(300);
    const panel = (await page.locator('#wi-panel').innerText()).replace(/\n/g, ' | ');
    const box = id => page.locator(`#wi-panel .wiGrpPick[value="${id}"]`);
    ok(scn, 'panel lists 470 enabled', (await box('recI470').count()) === 1 && !(await box('recI470').isDisabled()), panel);
    ok(scn, 'panel lists 471 ENABLED, its sum «34 > 33» on screen (owner 9/10: asked, not refused)', !(await box('recI471').isDisabled()) && /461\+463 = 24 π\. \+ 471 = 10 π\. = 34 > 33/.test(panel), panel);
    await shot(page, 'J3-panel');
    S.armed = true; await page.evaluate(() => window.__mark());
    await box('recI470').check();
    await page.locator('#wi-panel button:has-text("Ένταξη")').click();
    await page.waitForTimeout(4000); S.armed = false;
    await checkJoin470(scn, page, S, await ev(page));
    await shot(page, 'J3-after');
    await done(page);
  }

  if (on('J3b')) {  // a tile of the matched group: its menu carries the join too
    const scn = 'J3b';
    const { page } = await newPage(browser);
    const e27 = await rowOf(page, 'recE27');
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    await page.mouse.click(pts.tile.x, pts.tile.y, { button: 'right' }); await page.waitForTimeout(300);
    const menu = (await page.locator('#wi-ctx').innerText()).replace(/\n/g, ' | ');
    ok(scn, 'tile menu offers «+ Εισαγωγή στο φορτίο…»', /\+ Εισαγωγή στο φορτίο/.test(menu), menu);
    await done(page);
  }

  if (on('J4')) {   // the import's own menu: a truck load is a candidate, labelled with its truck
    const scn = 'J4';
    const { page, S } = await newPage(browser);
    await page.locator('#wi-imp-recI470 .wk3-num').click({ button: 'right' }); await page.waitForTimeout(300);
    const btn = page.locator('#wi-ctx button:has-text("Groupage εισαγωγών")');
    ok(scn, '«Groupage εισαγωγών…» is enabled', !(await btn.isDisabled()));
    await btn.click(); await page.waitForTimeout(300);
    const panel = (await page.locator('#wi-panel').innerText()).replace(/\n/g, ' | ');
    ok(scn, 'panel has the truck loads, TRK-27 among them', /Σε φορτίο φορτηγού/.test(panel) && /TRK-27/.test(panel), panel);
    const load = page.locator('#wi-panel .wiGrpPick[value="L:recE27:recI461"]');
    ok(scn, 'E27\'s load can be picked', (await load.count()) === 1 && !(await load.isDisabled()), panel);
    ok(scn, 'E19\'s full load (34p) is listed ENABLED with its sum (owner 9/10)', /458\+459 = 34 π\. \+ 470 = 8 π\. = 42 > 33/.test(panel) && !(await page.locator('#wi-panel .wiGrpPick[value="L:recE19:recI458"]').isDisabled()), panel);
    await shot(page, 'J4-panel');
    S.armed = true; await page.evaluate(() => window.__mark());
    await load.check();
    await page.locator('#wi-panel button:has-text("Ομαδοποίηση")').click();
    await page.waitForTimeout(4000); S.armed = false;
    await checkJoin470(scn, page, S, await ev(page));
    await done(page);
  }

  if (on('J5')) {   // past 33 on a drop: asked with the numbers — «Άκυρο» writes nothing, «Να μπει» joins (owner 9/10)
    const scn = 'J5';
    const { page, S } = await newPage(browser);
    const e27 = await rowOf(page, 'recE27');
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recI471 .wk3-num', pts.free);
    const ask = await palAsk(page);
    ok(scn, 'the question states the numbers', ask.includes('Σύνολο 24 + 10 = 34 παλέτες — πάνω από 33. Να μπει;') && ask.includes('461+463 = 24 π. + 471 = 10 π. = 34 > 33'), ask);
    await shot(page, 'J5-asked');
    await palAnswer(page, false);
    await page.waitForTimeout(1500); S.armed = false;
    let E = await ev(page);
    ok(scn, 'Άκυρο: nothing written', writes(S).length === 0, writes(S));
    // The join's own reads are record GETs and Group ID / Matched Import ID
    // lookups; the board's background polls (reference data, the shell's
    // counters) run on their own timers and are not counted.
    const rq = S.log.filter(x => x.k === 'req' && x.path.includes(T.ORD) && (/\/rec/.test(x.path) || /Group ID|Matched Import ID/.test(x.f)));
    ok(scn, 'Άκυρο: no ORDERS read', rq.length === 0, rq);
    ok(scn, 'Άκυρο: no refusal, no logError, no spinner', !E.some(e => e.k === 'errtoast' || e.k === 'logError' || e.k === 'SPINNER_ON'), E);
    ok(scn, 'Άκυρο: 471 still free (db + board), final BOARD', !fld(S, 'recI471', 'Group ID') && (await groupOf(page, 'recI471')) === 'recI471' && (await state(page)) === 'BOARD', [fld(S, 'recI471', 'Group ID'), await groupOf(page, 'recI471')]);
    ok(scn, 'the dragged row is not left faded', (await page.evaluate(() => document.getElementById('wi-imp-recI471').style.opacity)) === '', await page.evaluate(() => document.getElementById('wi-imp-recI471').style.opacity));
    S.log = []; S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recI471 .wk3-num', pts.free);
    await palAsk(page); await palAnswer(page, true);
    await page.waitForTimeout(4000); S.armed = false;
    E = await ev(page);
    const P = patches(S), f = (P[0] || {}).fields || {};
    ok(scn, 'Να μπει: one PATCH, on 471', P.length === 1 && P[0].id === 'recI471', P.map(p => p.id));
    ok(scn, 'Να μπει: 471 gets the load\'s Group ID + TRK-27, no Status (In Transit kept)', f['Group ID'] === G27 && JSON.stringify(f.Truck) === '["recT27"]' && !('Status' in f), f);
    ok(scn, 'Να μπει: db — 461, 463, 471 carry the base Group ID', ['recI461', 'recI463', 'recI471'].every(id => fld(S, id, 'Group ID') === G27), ['recI461', 'recI463', 'recI471'].map(id => fld(S, id, 'Group ID')));
    ok(scn, 'Να μπει: board shows 461+463+471', (await groupOf(page, 'recI471')) === 'recI461+recI463+recI471', await groupOf(page, 'recI471'));
    ok(scn, 'Να μπει: the toast says it is over 33', E.some(e => e.k === 'toast' && e.type === 'success' && e.msg.includes('471 μπήκε στο φορτίο TRK-27 (461+463+471 · 34 π.) ✓ (34 π. — πάνω από 33)')), E.filter(e => /toast/.test(e.k)));
    ok(scn, 'exactly one question, no logError, no spinner, no browser dialog', E.filter(e => e.k === 'confirm').length === 1 && !E.some(e => e.k === 'logError' || e.k === 'SPINNER_ON') && !S.log.some(x => x.k === 'dialog'), E);
    ok(scn, 'final BOARD, no page errors', (await state(page)) === 'BOARD' && !S.pageErrors.length, S.pageErrors);
    await shot(page, 'J5-joined-over-33');
    await done(page);
  }

  if (on('J4b')) {  // the import's menu → E19's load (34p) + 470 (8p) = 42: pickable, red sum, ONE question, joined
    const scn = 'J4b';
    const { page, S } = await newPage(browser);
    await page.locator('#wi-imp-recI470 .wk3-num').click({ button: 'right' }); await page.waitForTimeout(300);
    await page.locator('#wi-ctx button:has-text("Groupage εισαγωγών")').click(); await page.waitForTimeout(300);
    const load = page.locator('#wi-panel .wiGrpPick[value="L:recE19:recI458"]');
    ok(scn, 'E19\'s load is pickable', (await load.count()) === 1 && !(await load.isDisabled()));
    await load.check();
    const sb = await sumBox(page);
    ok(scn, 'running sum red «42p / 33p · > 33»', sb && sb.text === '42p / 33p · > 33' && sb.over, sb);
    ok(scn, 'no box disabled for capacity', (await capDisabled(page)).length === 0, await capDisabled(page));
    await shot(page, 'J4b-panel-red-sum');
    S.armed = true; await page.evaluate(() => window.__mark());
    await page.locator('#wi-panel button:has-text("Ομαδοποίηση")').click();
    const ask = await palAsk(page);
    ok(scn, 'the question: load first, then 470', ask.includes('Σύνολο 34 + 8 = 42 παλέτες — πάνω από 33. Να μπει;') && ask.includes('458+459 = 34 π. + 470 = 8 π. = 42 > 33'), ask);
    await palAnswer(page, true);
    await page.waitForTimeout(4000); S.armed = false;
    const E = await ev(page), P = patches(S), f = (P[0] || {}).fields || {};
    ok(scn, 'one PATCH, on 470: E19\'s Group ID + TRK-19', P.length === 1 && P[0].id === 'recI470' && f['Group ID'] === 'GI-MUXR5RNG|recI458,recI459' && JSON.stringify(f.Truck) === '["recT19"]', P);
    ok(scn, 'board: E19\'s load shows 458+459+470', (await groupOf(page, 'recI470')) === 'recI458+recI459+recI470', await groupOf(page, 'recI470'));
    ok(scn, 'toast says 42 π. — πάνω από 33', E.some(e => e.k === 'toast' && e.type === 'success' && e.msg.includes('✓ (42 π. — πάνω από 33)')), E.filter(e => /toast/.test(e.k)));
    ok(scn, 'exactly one question, no logError, no spinner', E.filter(e => e.k === 'confirm').length === 1 && !E.some(e => e.k === 'logError' || e.k === 'SPINNER_ON'), E);
    await done(page);
  }

  if (on('J5b')) {  // the card's «+ Εισαγωγή στο φορτίο…» with two picks past 33: ONE question for both
    const scn = 'J5b';
    const { page, S } = await newPage(browser);
    const e27 = await rowOf(page, 'recE27');
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    const open = async () => {
      await page.mouse.click(pts.free.x, pts.free.y, { button: 'right' }); await page.waitForTimeout(300);
      await page.locator('#wi-ctx button:has-text("+ Εισαγωγή στο φορτίο")').click(); await page.waitForTimeout(300);
      await page.locator('#wi-panel .wiGrpPick[value="recI470"]').check();
      await page.locator('#wi-panel .wiGrpPick[value="recI471"]').check();
    };
    await open();
    const sb = await sumBox(page);
    ok(scn, 'running sum red «42p / 33p · > 33», no box disabled for capacity', sb && sb.text === '42p / 33p · > 33' && sb.over && (await capDisabled(page)).length === 0, sb);
    S.armed = true; await page.evaluate(() => window.__mark());
    await page.locator('#wi-panel button:has-text("Ένταξη")').click();
    const ask = await palAsk(page);
    ok(scn, 'one question with every pick', /Σύνολο 24 \+ (10 \+ 8|8 \+ 10) = 42 παλέτες — πάνω από 33\. Να μπει;/.test(ask), ask);
    await palAnswer(page, false);
    await page.waitForTimeout(1500); S.armed = false;
    ok(scn, 'Άκυρο: nothing written', writes(S).length === 0, writes(S));
    await open();
    S.log = []; S.armed = true; await page.evaluate(() => window.__mark());
    await page.locator('#wi-panel button:has-text("Ένταξη")').click();
    await palAsk(page); await palAnswer(page, true);
    await page.waitForTimeout(6000); S.armed = false;
    const E = await ev(page), P = patches(S);
    ok(scn, 'Να μπει: two PATCHes, 470 and 471, both with the load\'s Group ID', P.map(p => p.id).sort().join(',') === 'recI470,recI471' && P.every(p => p.fields['Group ID'] === G27), P.map(p => [p.id, p.fields['Group ID']]));
    ok(scn, 'board: 461+463+470+471', (await groupOf(page, 'recI470')) === 'recI461+recI463+recI470+recI471', await groupOf(page, 'recI470'));
    ok(scn, 'exactly ONE question for the two joins', E.filter(e => e.k === 'confirm').length === 1, E.filter(e => e.k === 'confirm'));
    ok(scn, 'the last toast says 42 π. — πάνω από 33', E.some(e => e.k === 'toast' && e.type === 'success' && e.msg.includes('✓ (42 π. — πάνω από 33)')), E.filter(e => /toast/.test(e.k)));
    ok(scn, 'no logError, no spinner, no page errors', !E.some(e => e.k === 'logError' || e.k === 'SPINNER_ON') && !S.pageErrors.length, E);
    await done(page);
  }

  if (on('J21')) {  // export «Ομαδοποίηση» past 33 (20 + 15 = 35): offered, red sum, asked, then grouped
    const scn = 'J21';
    const { page, S } = await newPage(browser, { freeExp: true });
    const r1 = await rowOf(page, 'recEF1'), r2 = await rowOf(page, 'recEF2');
    const open = async () => {
      await page.locator(`#wi-row-${r1} .wk3-leg:not(.imp)`).first().click({ button: 'right' }); await page.waitForTimeout(300);
      const btn = page.locator('#wi-ctx button:has-text("Ομαδοποίηση")');
      const en = !(await btn.isDisabled());
      await btn.click(); await page.waitForTimeout(300);
      return en;
    };
    ok(scn, '«Ομαδοποίηση…» enabled (35 > 33 is no longer hidden)', await open());
    const panel = (await page.locator('#wi-panel').innerText()).replace(/\n/g, ' | ');
    const bx = page.locator(`#wi-panel .wiGrpPick[value="${r2}"]`);
    ok(scn, 'EF2 listed, pickable, its sum on screen', (await bx.count()) === 1 && !(await bx.isDisabled()) && panel.includes('EF1 = 20 π. + EF2 = 15 π. = 35 > 33'), panel);
    await bx.check();
    const sb = await sumBox(page);
    ok(scn, 'running sum red «35p / 33p · > 33»', sb && sb.text === '35p / 33p · > 33' && sb.over, sb);
    await shot(page, 'J21-export-panel');
    S.armed = true; await page.evaluate(() => window.__mark());
    await page.locator('#wi-panel button:has-text("Ομαδοποίηση")').click();
    const ask = await palAsk(page);
    ok(scn, 'the question states 20 + 15 = 35', ask.includes('Σύνολο 20 + 15 = 35 παλέτες — πάνω από 33. Να μπει;'), ask);
    await palAnswer(page, false);
    await page.waitForTimeout(1500); S.armed = false;
    ok(scn, 'Άκυρο: nothing written, still two rows', writes(S).length === 0 && (await rowOf(page, 'recEF1')) !== (await rowOf(page, 'recEF2')), writes(S));
    await open(); await page.locator(`#wi-panel .wiGrpPick[value="${r2}"]`).check();
    S.log = []; S.armed = true; await page.evaluate(() => window.__mark());
    await page.locator('#wi-panel button:has-text("Ομαδοποίηση")').click();
    await palAsk(page); await palAnswer(page, true);
    await page.waitForTimeout(3000); S.armed = false;
    const E = await ev(page), P = patches(S);
    ok(scn, 'Να μπει: EF1 and EF2 carry one GRP- Group ID (db)', P.map(p => p.id).sort().join(',') === 'recEF1,recEF2' && /^GRP-/.test(fld(S, 'recEF1', 'Group ID') || '') && fld(S, 'recEF1', 'Group ID') === fld(S, 'recEF2', 'Group ID'), P.map(p => [p.id, p.fields]));
    ok(scn, 'Να μπει: the toast says 35 π. — πάνω από 33', E.some(e => e.k === 'toast' && e.msg === 'Ομαδοποιήθηκε (35 π. — πάνω από 33)'), E.filter(e => /toast/.test(e.k)));
    ok(scn, 'exactly one question, no logError, no page errors', E.filter(e => e.k === 'confirm').length === 1 && !E.some(e => e.k === 'logError') && !S.pageErrors.length, E);
    await done(page);
  }

  if (on('J6')) {   // a real race: the server's export points elsewhere — still reloads
    const scn = 'J6';
    const { page, S } = await newPage(browser);
    const e27 = await rowOf(page, 'recE27');
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    S.db[T.ORD].find(r => r.id === 'recE27').fields['Matched Import ID'] = 'recIZZ';   // another user, meanwhile
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recI470 .wk3-num', pts.free);
    await page.waitForTimeout(4000); S.armed = false;
    const E = await ev(page);
    ok(scn, 'nothing written', writes(S).length === 0, writes(S));
    ok(scn, 'the race reloads the week', E.some(e => e.k === 'SPINNER_ON'), E);
    ok(scn, 'exactly one logError (race)', E.filter(e => e.k === 'logError').length === 1 && E.some(e => e.k === 'logError' && /race/.test(e.msg)), E.filter(e => e.k === 'logError'));
    ok(scn, 'final BOARD', (await state(page)) === 'BOARD');
    await done(page);
  }

  if (on('J6b')) {  // the board says 24 + 8 = 32 (no question); the server meanwhile has 470 at 12 → 36: race, nothing written
    const scn = 'J6b';
    const { page, S } = await newPage(browser);
    const e27 = await rowOf(page, 'recE27');
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    S.db[T.ORD].find(r => r.id === 'recI470').fields['Total Pallets'] = 12;   // another user, meanwhile
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recI470 .wk3-num', pts.free);
    await page.waitForTimeout(4000); S.armed = false;
    const E = await ev(page);
    ok(scn, 'nothing written', writes(S).length === 0, writes(S));
    ok(scn, 'no question (the board was within 33)', !E.some(e => e.k === 'confirm'), E.filter(e => e.k === 'confirm'));
    ok(scn, 'the race says the server\'s sum and reloads', E.some(e => e.k === 'errtoast' && e.msg.includes('Οι παλέτες άλλαξαν στο μεταξύ (άλλος χρήστης): 461+463 = 24 π. + 470 = 12 π. = 36 > 33')) && E.some(e => e.k === 'SPINNER_ON'), E);
    ok(scn, 'exactly one logError (race)', E.filter(e => e.k === 'logError').length === 1 && E.some(e => e.k === 'logError' && /race/.test(e.msg)), E.filter(e => e.k === 'logError'));
    ok(scn, 'final BOARD', (await state(page)) === 'BOARD');
    await done(page);
  }

  if (on('J7')) {   // a matched group with no order pinned: pinned first (export's member first), then the joiner
    const scn = 'J7';
    const { page, S } = await newPage(browser);
    const e33 = await rowOf(page, 'recE33');
    const pts = await pointsIn(page, `#wi-ci-${e33}`);
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recI470 .wk3-num', pts.free || pts.tile);
    await page.waitForTimeout(4000); S.armed = false;
    const P = patches(S), G = 'GI-NOPIN|recIP2,recIP1';
    ok(scn, 'three PATCHes: P2, P1 pinned, then 470', P.map(p => p.id).join(',') === 'recIP2,recIP1,recI470', P.map(p => p.id));
    ok(scn, 'all three carry «GI-NOPIN|recIP2,recIP1» (db)', ['recIP1', 'recIP2', 'recI470'].every(id => fld(S, id, 'Group ID') === G), ['recIP1', 'recIP2', 'recI470'].map(id => fld(S, id, 'Group ID')));
    ok(scn, '470 on TRK-33', JSON.stringify(fld(S, 'recI470', 'Truck')) === '["recT33"]');
    ok(scn, 'board: one load P1+P2+470', (await groupOf(page, 'recI470')) === 'recI470+recIP1+recIP2', await groupOf(page, 'recI470'));
    ok(scn, 'no spinner', !(await ev(page)).some(e => e.k === 'SPINNER_ON'));
    await done(page);
  }

  if (on('J8')) {   // a matched LONE import: the lead is locked first, then the joiner
    const scn = 'J8';
    const { page, S } = await newPage(browser);
    const e34 = await rowOf(page, 'recE34');
    const pts = await pointsIn(page, `#wi-ci-${e34}`);
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recI470 .wk3-num', pts.free);
    await page.waitForTimeout(4000); S.armed = false;
    const P = patches(S), g = fld(S, 'recIL', 'Group ID') || '';
    ok(scn, 'two PATCHes: the lead L1 first, then 470', P.map(p => p.id).join(',') === 'recIL,recI470', P.map(p => p.id));
    ok(scn, 'a new group «GI-…|recIL» on both (db)', /^GI-[0-9A-Z]+\|recIL$/.test(g) && fld(S, 'recI470', 'Group ID') === g, [g, fld(S, 'recI470', 'Group ID')]);
    ok(scn, '470 on TRK-34', JSON.stringify(fld(S, 'recI470', 'Truck')) === '["recT34"]');
    ok(scn, 'board: one load L1+470', (await groupOf(page, 'recI470')) === 'recI470+recIL', await groupOf(page, 'recI470'));
    await done(page);
  }

  if (on('J9')) {   // S9: a stale drag id can no longer match the WRONG import
    const scn = 'J9';
    const { page, S } = await newPage(browser);
    const e30 = await rowOf(page, 'recE30');
    // (a) a drag that lands nowhere: dragend clears the id (it stayed set before)
    const leg = await page.locator(`#wi-row-${e30} .wk3-leg:not(.imp)`).first().boundingBox();
    await dragTo(page, '#wi-imp-recI470 .wk3-num', { x: leg.x + leg.width / 2, y: leg.y + leg.height / 2 });
    await page.waitForTimeout(400);
    ok(scn, 'a drag dropped nowhere leaves no stale id', (await page.evaluate(() => window._wiDragging)) === null, await page.evaluate(() => window._wiDragging));
    // (b) even a forced stale id: a TILE drag onto an empty import cell writes nothing
    await page.evaluate(() => { window._wiDragging = 'recI470'; });
    const p30 = await pointsIn(page, `#wi-ci-${e30}`);
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recIA .wk3-seg[data-order-id="recIA"]', p30.free);
    await page.waitForTimeout(2500); S.armed = false;
    ok(scn, 'nothing written', writes(S).length === 0, writes(S));
    ok(scn, 'E30 still has no import (db)', !fld(S, 'recE30', 'Matched Import ID'), fld(S, 'recE30', 'Matched Import ID'));
    ok(scn, '470 got no truck (db)', !fld(S, 'recI470', 'Truck'), fld(S, 'recI470', 'Truck'));
    await done(page);
  }

  if (on('J10')) {  // S11: a 2-member free group into another free group — EVERY member moves
    const scn = 'J10';
    const { page, S } = await newPage(browser, { two: 'none' });
    await page.locator('#wi-imp-recIC .wk3-num').click({ button: 'right' }); await page.waitForTimeout(300);
    await page.locator('#wi-ctx button:has-text("Groupage εισαγωγών")').click(); await page.waitForTimeout(300);
    const rTwo = await rowOf(page, 'recIE');
    S.armed = true; await page.evaluate(() => window.__mark());
    await page.locator(`.wiGrpPick[value="${rTwo}"]`).check();
    await page.locator('#wi-panel button:has-text("Ομαδοποίηση")').click();
    await page.waitForTimeout(4000); S.armed = false;
    const P = patches(S), G = 'GI-EXEC|recIC,recID';
    ok(scn, 'two PATCHes: IE and IF (both members)', P.map(p => p.id).sort().join(',') === 'recIE,recIF', P.map(p => p.id));
    ok(scn, 'IC, ID, IE, IF all carry «GI-EXEC|recIC,recID» (db)', ['recIC', 'recID', 'recIE', 'recIF'].every(id => fld(S, id, 'Group ID') === G), ['recIC', 'recID', 'recIE', 'recIF'].map(id => fld(S, id, 'Group ID')));
    ok(scn, 'IE and IF take TRK-32', ['recIE', 'recIF'].every(id => JSON.stringify(fld(S, id, 'Truck')) === '["recT32"]'));
    ok(scn, 'board: one row IC+ID+IE+IF', (await groupOf(page, 'recIE')) === 'recIC+recID+recIE+recIF', await groupOf(page, 'recIE'));
    ok(scn, 'no spinner, success toast', !(await ev(page)).some(e => e.k === 'SPINNER_ON') && (await ev(page)).some(e => e.k === 'toast' && e.type === 'success'), await ev(page));
    await shot(page, 'J10-after');
    await done(page);
  }

  if (on('J10b')) { // the same with the joining group on another truck: refused, named, logged, nothing written
    const scn = 'J10b';
    const { page, S } = await newPage(browser, { two: 'truck' });
    await page.locator('#wi-imp-recIC .wk3-num').click({ button: 'right' }); await page.waitForTimeout(300);
    await page.locator('#wi-ctx button:has-text("Groupage εισαγωγών")').click(); await page.waitForTimeout(300);
    const rTwo = await rowOf(page, 'recIE');
    S.armed = true; await page.evaluate(() => window.__mark());
    await page.locator(`.wiGrpPick[value="${rTwo}"]`).check();
    await page.locator('#wi-panel button:has-text("Ομαδοποίηση")').click();
    await page.waitForTimeout(2500); S.armed = false;
    const E = await ev(page);
    ok(scn, 'nothing written', writes(S).length === 0, writes(S));
    ok(scn, 'refusal, verbatim (P1)', E.some(e => e.k === 'errtoast' && e.type === 'warn' && e.msg === ASG('IE', 'φορτηγό TRK-31')), E);
    ok(scn, 'exactly one logError', E.filter(e => e.k === 'logError').length === 1, E.filter(e => e.k === 'logError'));
    await done(page);
  }

  if (on('J10c')) { // both free groups on the SAME truck (TRK-32): refused too — the joiner already has its own RT
    const scn = 'J10c';
    const { page, S } = await newPage(browser, { two: 'same' });
    await page.locator('#wi-imp-recIC .wk3-num').click({ button: 'right' }); await page.waitForTimeout(300);
    await page.locator('#wi-ctx button:has-text("Groupage εισαγωγών")').click(); await page.waitForTimeout(300);
    const rTwo = await rowOf(page, 'recIE');
    S.armed = true; await page.evaluate(() => window.__mark());
    await page.locator(`.wiGrpPick[value="${rTwo}"]`).check();
    await page.locator('#wi-panel button:has-text("Ομαδοποίηση")').click();
    await page.waitForTimeout(2500); S.armed = false;
    const E = await ev(page);
    ok(scn, 'nothing written', writes(S).length === 0, writes(S));
    ok(scn, 'refusal, verbatim (same truck)', E.some(e => e.k === 'errtoast' && e.type === 'warn' && e.msg === ASG('IE', 'φορτηγό TRK-32')), E);
    ok(scn, 'exactly one logError, no spinner', E.filter(e => e.k === 'logError').length === 1 && !E.some(e => e.k === 'SPINNER_ON'), E);
    ok(scn, 'db: IE/IF keep their own group', ['recIE', 'recIF'].every(id => fld(S, id, 'Group ID') === 'GI-TWO|recIE,recIF'));
    await done(page);
  }

  if (on('J11')) {  // S1: 471 into the FREE group GI-SMALL (own truck) — gets the truck, keeps In Transit
    const scn = 'J11';
    const { page, S } = await newPage(browser);
    await page.locator('#wi-imp-recI471 .wk3-num').click({ button: 'right' }); await page.waitForTimeout(300);
    await page.locator('#wi-ctx button:has-text("Groupage εισαγωγών")').click(); await page.waitForTimeout(300);
    const g = await rowOf(page, 'recIA');
    S.armed = true; await page.evaluate(() => window.__mark());
    await page.locator(`.wiGrpPick[value="${g}"]`).check();
    await page.locator('#wi-panel button:has-text("Ομαδοποίηση")').click();
    await page.waitForTimeout(4000); S.armed = false;
    const P = patches(S), f = (P[0] || {}).fields || {};
    ok(scn, 'one PATCH, on 471', P.length === 1 && P[0].id === 'recI471', P.map(p => p.id));
    ok(scn, '471: «GI-SMALL|recIA,recIB» + TRK-31, no Status (In Transit kept)', f['Group ID'] === 'GI-SMALL|recIA,recIB' && JSON.stringify(f.Truck) === '["recT31"]' && !('Status' in f), f);
    ok(scn, 'db: 471 still In Transit', fld(S, 'recI471', 'Status') === 'In Transit');
    ok(scn, 'board: IA+IB+471 one row', (await groupOf(page, 'recI471')) === 'recI471+recIA+recIB', await groupOf(page, 'recI471'));
    await done(page);
  }

  if (on('J12')) {  // S7: a week read that never answers → the error card within 30 s, ONE log line
    const scn = 'J12';
    const { page, S } = await newPage(browser);
    S.hang.exports = true;
    await page.evaluate(() => { window.__mark(); renderWeeklyIntl(); });
    let st = 'SPINNER', t = 0;
    while (t < 30000 && st !== 'ERROR_STATE') { await page.waitForTimeout(1000); t += 1000; st = await state(page); }
    const E = await ev(page);
    ok(scn, 'error card within 30 s', st === 'ERROR_STATE', { st, t });
    ok(scn, 'exactly one logError (week load stalled)', E.filter(e => e.k === 'logError').length === 1 && /week load stalled/.test((E.find(e => e.k === 'logError') || {}).msg || ''), E.filter(e => e.k === 'logError'));
    ok(scn, '«Ξαναδοκίμασε» offered', (await page.locator('#content button:has-text("Ξαναδοκίμασε")').count()) === 1);
    await shot(page, 'J12-watchdog-card');
    await done(page);
  }

  if (on('J13')) {  // S7 (docs): a stalled paperclip index no longer holds the week; dropped after 25 s
    const scn = 'J13';
    const { page, S } = await newPage(browser);
    S.hang.docs = true;
    await page.evaluate(() => { OrderDocs.invalidateIndex(); window.__mark(); renderWeeklyIntl(); });
    await page.waitForTimeout(3000);
    ok(scn, 'board paints while the index read hangs', (await state(page)) === 'BOARD', await ev(page));
    const held1 = S.held.length;
    await page.waitForTimeout(24000);
    await page.evaluate(() => { renderWeeklyIntl(); });
    await page.waitForTimeout(3000);
    ok(scn, 'after 25 s the next render asks the index again', S.held.length === held1 + 1, { held1, held: S.held.length });
    ok(scn, 'board again', (await state(page)) === 'BOARD');
    await done(page);
  }

  if (on('J14')) {  // P1 (reviewer R1): IX already on TRK-27 — E27's own truck — dropped on E27's load
    const scn = 'J14';
    const { page, S } = await newPage(browser, { same: true });
    const e27 = await rowOf(page, 'recE27');
    // the card menu's panel says it before any drop: listed, disabled, with the reason
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    await page.mouse.click(pts.free.x, pts.free.y, { button: 'right' }); await page.waitForTimeout(300);
    await page.locator('#wi-ctx button:has-text("+ Εισαγωγή στο φορτίο")').click(); await page.waitForTimeout(300);
    const panel = (await page.locator('#wi-panel').innerText()).replace(/\n/g, ' | ');
    const bx = page.locator('#wi-panel .wiGrpPick[value="recIX"]');
    ok(scn, 'panel lists IX disabled with the P1 reason', (await bx.count()) === 1 && (await bx.isDisabled()) && panel.includes(ASG('IX', 'φορτηγό TRK-27')), panel);
    await page.evaluate(() => _wiPanelClose());
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recIX .wk3-num', pts.free);
    await page.waitForTimeout(2500); S.armed = false;
    await checkRefused(scn, page, S, ASG('IX', 'φορτηγό TRK-27'));
    ok(scn, 'db: IX keeps no group, its truck unchanged', !fld(S, 'recIX', 'Group ID') && JSON.stringify(fld(S, 'recIX', 'Truck')) === '["recT27"]');
    await shot(page, 'J14-same-truck-refused');
    await done(page);
  }

  if (on('J15')) {  // P1: IY on another truck (TRK-35) dropped on E27's load
    const scn = 'J15';
    const { page, S } = await newPage(browser, { other: true });
    const e27 = await rowOf(page, 'recE27');
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recIY .wk3-num', pts.tile);
    await page.waitForTimeout(2500); S.armed = false;
    await checkRefused(scn, page, S, ASG('IY', 'φορτηγό TRK-35'));
    await done(page);
  }

  if (on('J16')) {  // P3-2 (reviewer R2): 470 dropped on an EXPORT group's tile — ignored, nothing written
    const scn = 'J16';
    const { page, S } = await newPage(browser, { expGrp: true });
    const ea = await rowOf(page, 'recEA');
    const pt = await page.evaluate(id => { const row = document.getElementById('wi-row-' + id); const seg = row && row.querySelector('.wk3-leg:not(.imp) .wk3-seg'); if (!seg) return null; seg.scrollIntoView({ block: 'center' }); const b = seg.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, ea);
    ok(scn, 'export tile found', !!pt, pt);
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recI470 .wk3-num', pt);
    await page.waitForTimeout(2500); S.armed = false;
    const E = await ev(page);
    ok(scn, 'nothing written', writes(S).length === 0, writes(S));
    ok(scn, 'db: EA/EB carry no import, 470 no truck', !fld(S, 'recEA', 'Matched Import ID') && !fld(S, 'recEB', 'Matched Import ID') && !fld(S, 'recI470', 'Truck'));
    ok(scn, 'board: EA\'s card unchanged (no import), 470 still free', await page.evaluate(id => { const r = WINTL.rows.find(x => x.id === id); const i = WINTL.rows.find(x => x.type === 'import' && x.orderId === 'recI470'); return !!r && !r.importId && !!i && !i.matchedTo; }, ea));
    ok(scn, 'no spinner, no logError, drag id cleared', !E.some(e => e.k === 'SPINNER_ON' || e.k === 'logError') && (await page.evaluate(() => window._wiDragging)) === null, E);
    await done(page);
  }

  if (on('J17')) {  // P3-3: 470 matched on the server to EW (W43), an export this board never loaded
    const scn = 'J17';
    const { page, S } = await newPage(browser, { offWeek: true });
    const w = await page.evaluate(() => TmsWeek.numOf('2026-10-22T10:00:00'));
    const text = `Η #470 είναι ήδη στο φορτίο της εξαγωγής EW της W${w} (εκτός αυτής της προβολής) — πρώτα «Αφαίρεση ταιριάσματος» εκεί· δεν γράφτηκε τίποτα`;
    ok(scn, 'the board shows 470 free (EW not loaded)', await page.evaluate(() => { const i = WINTL.rows.find(x => x.type === 'import' && x.orderId === 'recI470'); return !!i && !i.matchedTo && !WINTL.data.exports.some(x => x.id === 'recEW'); }));
    const e27 = await rowOf(page, 'recE27');
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    for (const k of [1, 2]) {   // twice: the same refusal, never a reload loop
      S.log = []; S.armed = true; await page.evaluate(() => window.__mark());
      await dragTo(page, '#wi-imp-recI470 .wk3-num', pts.free);
      await page.waitForTimeout(2500); S.armed = false;
      await checkRefused(scn + '.' + k, page, S, text);
    }
    ok(scn, 'W43 named', w === 43, w);
    await done(page);
  }

  if (on('J18')) {  // P3-4: a Cancelled import is never revived — by any path
    const scn = 'J18';
    const { page, S } = await newPage(browser, { cancelled: true });
    S.armed = true; await page.evaluate(() => window.__mark());
    const r = await page.evaluate(() => _wiImpJoin('recI461', 'recE27', 'recICX'));
    await page.waitForTimeout(500); S.armed = false;
    ok(scn, 'the join answers false', r === false, r);
    await checkRefused(scn, page, S, 'Η #CX είναι ακυρωμένη — ακυρωμένη παραγγελία δεν μπαίνει σε φορτίο');
    ok(scn, 'db: CX still Cancelled, no truck, no group', fld(S, 'recICX', 'Status') === 'Cancelled' && !fld(S, 'recICX', 'Truck') && !fld(S, 'recICX', 'Group ID'));
    await done(page);
  }

  if (on('J19')) {  // P3-5: a rota leg is refused on EVERY path — the join itself and the free-import groupage
    const scn = 'J19';
    const { page, S } = await newPage(browser, { leg: true });
    ok(scn, 'LG is a rota leg on the board', await page.evaluate(() => { const r = WINTL.rows.find(x => x.type === 'import' && x.orderId === 'recILG'); return !!r && r.legOf === 'recE30'; }));
    const text = 'Η εισαγωγή LG είναι σκέλος προώθησης (ρότα) — δεν μπαίνει σε groupage';
    S.armed = true; await page.evaluate(() => window.__mark());
    await page.evaluate(() => _wiImpJoin('recI461', 'recE27', 'recILG'));
    await page.waitForTimeout(500); S.armed = false;
    await checkRefused(scn + '.join', page, S, text);
    S.log = []; S.armed = true; await page.evaluate(() => window.__mark());
    await page.evaluate(() => { const a = WINTL.rows.find(x => x.type === 'import' && x.orderId === 'recI470'), b = WINTL.rows.find(x => x.type === 'import' && x.orderId === 'recILG'); return _wiImpGroup(a.id, b.id); });
    await page.waitForTimeout(500); S.armed = false;
    await checkRefused(scn + '.group', page, S, text);
    await done(page);
  }

  if (on('J20')) {  // no silent cap: «Groupage εισαγωγών…» lists EVERY free import, with its count
    const scn = 'J20';
    const { page } = await newPage(browser, { many: true });
    await page.locator('#wi-imp-recI470 .wk3-num').click({ button: 'right' }); await page.waitForTimeout(300);
    await page.locator('#wi-ctx button:has-text("Groupage εισαγωγών")').click(); await page.waitForTimeout(300);
    const n = await page.locator('#wiGrpList .wiGrpPick').count();
    const panel = (await page.locator('#wi-panel').innerText()).replace(/\n/g, ' | ');
    ok(scn, 'more than 6 free imports listed', n > 6, n);
    ok(scn, 'the count on screen = the boxes listed', panel.includes(`Ελεύθερες εισαγωγές (${n}) — κύλισε`), panel);
    ok(scn, 'all eight small imports listed (the cut at 6 hid some)', [1, 2, 3, 4, 5, 6, 7, 8].every(k => panel.includes('Load M' + k + ' (1p)')), panel);
    await shot(page, 'J20-free-list');
    await done(page);
  }

  // ── The joiner's OWN round trip (fix/own-rt-join-rota) ──
  // 470's own trip, as «Καθαρισμός ανάθεσης» leaves it on a solo trip: no
  // vehicle, the leg kept. ledger_entry = what GET /costs/rt carries (null = none).
  const own = (legs, extra = {}) => [{ id: 1300, code: 'RT-1300', status: 'planned', trip_type: 'OWNED', truck_id: null, driver_id: null,
    date_start: '2026-10-07', date_end: '2026-10-12', ledger_entry: null, ct_rt_legs: legs.map((id, i) => ({ id: 13000 + i, order_id: pgOf(id), seq: i + 1, direction: 'IMPORT' })), ...extra }];
  const OWN = why => `Η #470 είναι ακόμη στο δρομολόγιο RT-1300${why} · δεν γράφτηκε τίποτα`;
  async function drop470(page, S) {
    const e27 = await rowOf(page, 'recE27');
    const pts = await pointsIn(page, `#wi-ci-${e27}`);
    S.armed = true; await page.evaluate(() => window.__mark());
    await dragTo(page, '#wi-imp-recI470 .wk3-num', pts.free);
    await page.waitForTimeout(4000); S.armed = false;
  }

  if (on('J22')) {  // (b) 470 alone on its empty RT-1300: the leg leaves FIRST, then the join — one live trip, not two
    const scn = 'J22';
    const { page, S } = await newPage(browser, { rts: own(['recI470']) });
    await drop470(page, S);
    const E = await ev(page), W = writes(S);
    const del = W.findIndex(x => x.k === 'delete' && x.id === '1300' && x.fields.order_id === pgOf('recI470'));
    const pat = W.findIndex(x => x.k === 'patch' && x.id === 'recI470');
    ok(scn, 'the leg left RT-1300 BEFORE 470 was written', del >= 0 && pat > del, W.map(x => x.k + ' ' + x.id));
    ok(scn, 'a trip read between the DELETE and the PATCH (the proof)', S.log.slice(S.log.indexOf(W[del]) + 1, S.log.indexOf(W[pat])).some(x => x.k === 'req' && x.path === '/costs/rt'), S.log.map(x => x.k + ' ' + (x.path || x.id)));
    ok(scn, 'RT-1300 is cancelled (the DB, 013)', S.rts[0].status === 'cancelled', S.rts[0]);
    await checkJoin470(scn, page, S, E);
    ok(scn, 'the ✓ says the empty trip went', E.some(e => e.k === 'toast' && e.type === 'success' && /✓ · η #470 βγήκε από το άδειο RT-1300$/.test(e.msg)), E.filter(e => /toast/.test(e.k)));
    await shot(page, 'J22-own-empty-trip-freed');
    await done(page);
  }

  for (const [scn, opts, text] of [
    ['J23', { rts: own(['recI470']), lines: { 1300: 2 } }, OWN(', που έχει έξοδα — ζήτα από τον owner να το ακυρώσει')],
    ['J24', { rts: own(['recI470']), linesForbidden: true }, OWN(' και ο ρόλος σου δεν βλέπει αν έχει έξοδα — ζήτα από τον owner να το ακυρώσει')],
    ['J25', { rts: own(['recI470', 'recE30']) }, OWN(' μαζί με άλλες παραγγελίες — δεν βγαίνει αυτόματα· ζήτα από τον owner')],
    ['J26', { rts: own(['recI470']), failRt: true }, 'Ο γύρος της #470 δεν διαβάστηκε (ο γύρος δεν διαβάστηκε (boom)) · δεν γράφτηκε τίποτα'],
    ['J27', { rts: own(['recI470'], { ledger_entry: { id: 81, expenses: null } }) }, OWN(', που έχει γραμμή μισθοδοσίας — ζήτα από τον owner να το ακυρώσει')],
  ]) {
    if (!on(scn)) continue;
    const { page, S } = await newPage(browser, opts);
    if (opts.failRt) S.rtFail = true;    // after the board loaded: only the join's own read fails
    await drop470(page, S);
    await checkRefused(scn, page, S, text);
    ok(scn, 'db: 470 keeps no group, no truck; RT-1300 still holds it', !fld(S, 'recI470', 'Group ID') && !fld(S, 'recI470', 'Truck') && S.rts[0].status === 'planned' && S.rts[0].ct_rt_legs.some(l => l.order_id === pgOf('recI470')), S.rts[0]);
    if (scn === 'J23') await shot(page, 'J23-own-trip-with-costs-refused');
    await done(page);
  }

  if (on('J28')) {  // (b) a two-member free group IE+IF on ONE empty trip, grouped into GI-EXEC (TRK-32): both legs leave first
    const scn = 'J28';
    const { page, S } = await newPage(browser, { two: 'none', rts: [{ id: 1400, code: 'RT-1400', status: 'planned', trip_type: 'OWNED', truck_id: null, driver_id: null,
      date_start: '2026-10-09', date_end: '2026-10-12', ledger_entry: null, ct_rt_legs: [{ id: 14000, order_id: pgOf('recIE'), seq: 1 }, { id: 14001, order_id: pgOf('recIF'), seq: 2 }] }] });
    await page.locator('#wi-imp-recIC .wk3-num').click({ button: 'right' }); await page.waitForTimeout(300);
    await page.locator('#wi-ctx button:has-text("Groupage εισαγωγών")').click(); await page.waitForTimeout(300);
    const rTwo = await rowOf(page, 'recIE');
    S.armed = true; await page.evaluate(() => window.__mark());
    await page.locator(`.wiGrpPick[value="${rTwo}"]`).check();
    await page.locator('#wi-panel button:has-text("Ομαδοποίηση")').click();
    await page.waitForTimeout(4000); S.armed = false;
    const W = writes(S), firstPatch = W.findIndex(x => x.k === 'patch');
    const dels = W.filter(x => x.k === 'delete').map(x => x.fields.order_id).sort();
    ok(scn, 'both legs left RT-1400 before any member was written', dels.join(',') === [pgOf('recIE'), pgOf('recIF')].sort().join(',') && W.slice(0, firstPatch).filter(x => x.k === 'delete').length === 2, W.map(x => x.k + ' ' + x.id));
    ok(scn, 'RT-1400 cancelled', S.rts[0].status === 'cancelled', S.rts[0]);
    ok(scn, 'IE and IF carry «GI-EXEC|recIC,recID» + TRK-32 (db)', ['recIE', 'recIF'].every(id => fld(S, id, 'Group ID') === 'GI-EXEC|recIC,recID' && JSON.stringify(fld(S, id, 'Truck')) === '["recT32"]'), ['recIE', 'recIF'].map(id => [fld(S, id, 'Group ID'), fld(S, id, 'Truck')]));
    const E = await ev(page);
    ok(scn, 'the ✓ names both and the trip', E.some(e => e.k === 'toast' && e.type === 'success' && /οι #IE, #IF βγήκαν από το άδειο RT-1400$/.test(e.msg)), E.filter(e => /toast/.test(e.k)));
    ok(scn, 'no logError, no page errors', !E.some(e => e.k === 'logError') && !S.pageErrors.length, { E, err: S.pageErrors });
    await done(page);
  }

  await browser.close();
  const fail = results.filter(r => !r.pass);
  console.log(`\n${results.length - fail.length}/${results.length} checks passed`);
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('✗ rig crashed:', e && e.stack || e); process.exit(2); });
