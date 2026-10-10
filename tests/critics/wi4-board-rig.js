// Rig — Weekly International v4, THE BOARD (TECH_DESIGN §h.2, §h.4; WP10).
//
// Why: v4 is a second renderer over the old module's state and writes. A
// screenshot or a green toast proves nothing about either half (CLAUDE.md
// «η απόδειξη είναι ο πίνακας»). This rig drives the real app against an
// in-memory facade loaded from ONE synthetic week (tests/fixtures/wi4-week.json,
// invented data only — the repo is public) and judges every scenario by what
// reached the fake table: PATCH bodies, rows, request counts. Where v4 must do
// exactly what v1 does (drops, joins, panels), the same action runs on the old
// board too and the writes are compared.
//
// Two modes:
//   --check-fixture   plain node, no browser, runs TODAY: every §h.2 case is in
//                     the fixture, its links resolve, its dates land on the
//                     intended Athens day, and the flag boundaries it claims
//                     hold under the real WI4.flags (core/wi4-logic.js).
//   (default)         the browser rig. It needs WP4 (modules/weekly_intl_v2.js)
//                     and WP5 (modules/wi4_actions.js) INTEGRATED: until then
//                     v4 never activates, the preflight says so and the rig
//                     exits 3 (NOT READY) — that is expected, not a pass.
//                     Scenario `v1` (the fixture on today's board, flag 'off')
//                     runs before integration as well.
//
// The flag: config.js is served rewritten in memory (WI_V2 'on', optionally
// WI_PRESENCE true and a 2.5 s active beat) — the repo keeps 'off'. Nothing
// leaves the machine: fonts, Sentry and the live Worker are aborted or answered
// here. Clock frozen at Tue 6/10/2026 09:40 Athens (W41), role dispatcher,
// 1920×1080 with the sidebar collapsed.
//
// Usage (Playwright: cwd = the main repo, which has node_modules; a worktree
// has none — memory note «Κριτές από worktree»):
//   node <tree>/tests/critics/wi4-board-rig.js --check-fixture
//   [WI4_TREE=<tree to serve>] node <tree>/tests/critics/wi4-board-rig.js [scenario…] [--shots <dir>]
// WI4_TREE defaults to the tree this file lives in; the rig serves it itself.
// Scenarios: v1 · paint · invariants · scans · unknown · drops · join · menu ·
//   date · keys · search · savefail · presence · conflict · fallback · styles
// Exit: 0 all green · 1 a check failed · 2 usage · 3 NOT READY (v4 inactive).
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');

const WT = path.join(__dirname, '../..');
const TREE = path.resolve(process.env.WI4_TREE || WT);
const FIX_PATH = path.join(WT, 'tests/fixtures/wi4-week.json');
const FIX = JSON.parse(fs.readFileSync(FIX_PATH, 'utf8'));
const WI4 = require(path.join(WT, 'core/wi4-logic.js'));
const argv = process.argv.slice(2);
const shotsAt = argv.indexOf('--shots');
const OUT = shotsAt >= 0 ? argv[shotsAt + 1] : null;
const want = argv.filter((a, i) => !a.startsWith('--') && !(shotsAt >= 0 && i === shotsAt + 1));
const T = FIX._meta.tables;
const TODAY = FIX._meta.today;
const clone = o => JSON.parse(JSON.stringify(o));

let fails = 0;
function ok(scn, name, cond, detail) {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${scn} ${name}${cond || detail === undefined ? '' : '  → ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`);
  return !!cond;
}

// ═══ Part 1 — the fixture check (no browser) ════════════════════════════
// Athens day of an ISO instant (the board groups by local calendar day).
const athensDay = iso => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : '');
// §h.2, verbatim: the cases the fixture must hold. A case key missing from
// FIX.cases fails, so the list cannot shrink silently.
const H2 = ['stops_1_to_9', 'vs_export', 'vs_import', 'groupage_export_x3', 'groupage_import_x2', 'matched_pair',
  'partner_no_import', 'empty_return_boundaries', 'import_only_own_truck', 'free_import', 'rota', 'local_relay', 'split',
  'preorder', 'lot_and_piece', 'pallets_34', 'same_day_clash', 'national_leg_with_and_without_carrier', 'date_mismatch',
  'empty_day', 'moved_row'];

function checkFixture() {
  const S = 'fixture';
  const tbl = id => FIX.tables[id] || [];
  const all = new Map();
  Object.values(FIX.tables).forEach(list => list.forEach(r => all.set(r.id, r)));
  const ord = id => tbl(T.ORDERS).find(r => r.id === id);
  const link = v => (Array.isArray(v) ? v[0] : v) || null;
  ok(S, 'meta: synthetic, W41 Sat–Fri, today inside the week', FIX._meta.synthetic === true && FIX._meta.week === 41
    && FIX._meta.range.ws === '2026-10-03' && FIX._meta.range.we === '2026-10-09' && TODAY >= FIX._meta.range.ws && TODAY <= FIX._meta.range.we, FIX._meta);
  ok(S, 'ids are unique across tables', all.size === Object.values(FIX.tables).reduce((n, l) => n + l.length, 0));
  // Presence (§g.1) and the facade only accept rec + 6–30 alphanumerics.
  const badIds = [...all.keys()].filter(id => !/^rec[A-Za-z0-9]{6,30}$/.test(id));
  ok(S, 'every id matches ^rec[A-Za-z0-9]{6,30}$ (presence record_id CHECK)', !badIds.length, badIds);
  for (const k of H2) {
    const c = FIX.cases[k];
    ok(S, `§h.2 case «${c ? c.h2 : k}» present, its ids exist`, !!c && (c.ids || []).every(id => all.has(id)), c ? (c.ids || []).filter(id => !all.has(id)) : 'missing');
  }
  // Invented data only. Greek plates use letters shared with Latin; S is not
  // one of them, so «TST/TRL/PRT-…» cannot collide with a real plate.
  const plates = [...tbl(T.TRUCKS), ...tbl(T.TRAILERS)].map(r => r.fields['License Plate']).concat(tbl(T.ORDERS).map(r => r.fields['Partner Truck Plates']).filter(Boolean));
  ok(S, 'plates are invented (TST/TRL/PRT-n)', plates.every(p => /^(TST|TRL|PRT)-\d{3,4}$/.test(p)), plates.filter(p => !/^(TST|TRL|PRT)-\d{3,4}$/.test(p)));
  const people = tbl(T.DRIVERS).map(r => r.fields['Full Name']);
  ok(S, 'drivers are «Driver Test NN»', people.every(n => /^Driver Test \d{2}$/.test(n)), people);
  ok(S, 'clients/partners are placeholders', tbl(T.CLIENTS).every(r => /^ΠΕΛΑΤΗΣ [Α-Ω]$/.test(r.fields['Company Name'])) && tbl(T.PARTNERS).every(r => /^Partner Test /.test(r.fields['Company Name'])));
  const text = JSON.stringify(FIX.tables);
  ok(S, 'no e-mail, phone or VAT-looking strings', !/@[a-z0-9-]+\.[a-z]{2,}|\+30|\b69\d{8}\b|\bEL\d{9}\b/i.test(text));
  // Facade trap 2: derived labels the Worker never returns must not be in the
  // week, or a screen that reads them would pass here and show «—» live.
  ok(S, 'no derived labels the Worker never returns (Loading/Delivery Summary, Client Name)', !/"(Loading Summary|Delivery Summary|Client Name)"/.test(text));

  // Links resolve.
  const O = tbl(T.ORDERS);
  const dangling = [];
  const need = (from, id) => { if (id && !all.has(id)) dangling.push(from + '→' + id); };
  O.forEach(r => {
    const f = r.fields;
    ['Truck', 'Driver', 'Trailer', 'Partner', 'Client', 'Loading Location 1', 'Unloading Location 1', 'Parent Order', 'Stock Lot'].forEach(k => need(r.id + '.' + k, link(f[k])));
    need(r.id + '.Matched Import ID', f['Matched Import ID']); need(r.id + '.Rotation ID', f['Rotation ID']); need(r.id + '.Own Stock Lot', f['Own Stock Lot']);
    (f['ORDER STOPS'] || []).forEach(s => need(r.id + '.ORDER STOPS', s));
    if (f['Group ID']) (String(f['Group ID']).split('|')[1] || '').split(',').filter(Boolean).forEach(m => {
      need(r.id + '.Group ID', m);
      if (ord(m) && ord(m).fields['Group ID'] !== f['Group ID']) dangling.push(r.id + ' group member ' + m + ' carries another Group ID');
    });
  });
  tbl(T.ORDER_STOPS).forEach(s => { need(s.id + '.Parent Order', link(s.fields['Parent Order'])); need(s.id + '.Location', link(s.fields.Location)); });
  [...tbl(T.NAT_LOADS), ...tbl(T.LOCAL_MOVES), ...tbl(T.STOCK_LOTS), ...tbl(T.ORDER_DOCS)].forEach(r =>
    ['Source Order', 'Parent Order', 'Order', 'Truck', 'Driver', 'Partner', 'From Location', 'To Location'].forEach(k => need(r.id + '.' + k, link(r.fields[k]))));
  ok(S, 'every link resolves; every group member carries the same Group ID', !dangling.length, dangling);
  ok(S, 'matched imports are imports, matched by exports', O.filter(r => r.fields['Matched Import ID']).every(r => r.fields.Direction === 'Export' && ord(r.fields['Matched Import ID']).fields.Direction === 'Import'));
  ok(S, 'national legs hang off VS orders only', tbl(T.NAT_LOADS).every(n => (ord(link(n.fields['Source Order'])) || { fields: {} }).fields['Veroia Switch'] === true));
  ok(S, 'local relays carry «Move Kind» (relay.js refuses rows without it)', tbl(T.LOCAL_MOVES).every(m => ['relay_delivery', 'relay_loading'].includes(m.fields['Move Kind'])));

  // Stops: counts per order, and 1..9 all present (§h.2 «1–9 stops»).
  const stopsOf = (id, type) => tbl(T.ORDER_STOPS).filter(s => link(s.fields['Parent Order']) === id && s.fields['Stop Type'] === type).length;
  const exp = FIX.cases.stops_1_to_9.expect.stops;
  const wrong = Object.entries(exp).filter(([id, [l, d]]) => stopsOf(id, 'Loading') !== l || stopsOf(id, 'Unloading') !== d);
  ok(S, 'stop counts per order as declared', !wrong.length, wrong.map(([id, e]) => `${id}: want ${e} got ${[stopsOf(id, 'Loading'), stopsOf(id, 'Unloading')]}`));
  const counts = new Set(O.flatMap(r => [stopsOf(r.id, 'Loading'), stopsOf(r.id, 'Unloading')]));
  ok(S, 'every stop count 1…9 occurs', [1, 2, 3, 4, 5, 6, 7, 8, 9].every(n => counts.has(n)), [...counts].sort());
  ok(S, 'every order has ≥1 loading and ≥1 delivery stop', O.every(r => stopsOf(r.id, 'Loading') >= 1 && stopsOf(r.id, 'Unloading') >= 1));

  // Days: the empty day is empty; the «μεταφέρθηκε» and ±1-week rows are where they claim.
  const { ws, we } = FIX._meta.range;
  const effExp = r => athensDay(r.fields['Delivery DateTime'] || r.fields['Loading DateTime']);
  const ld = r => athensDay(r.fields['Loading DateTime']);
  const onEmpty = O.filter(r => (r.fields.Direction === 'Export' ? effExp(r) : ld(r)) === FIX._meta.emptyDay);
  ok(S, `the empty day ${FIX._meta.emptyDay} has no export delivery and no import loading`, !onEmpty.length, onEmpty.map(r => r.id));
  const moved = ord(FIX.cases.moved_row.ids[0]);
  ok(S, '«μεταφέρθηκε»: Plan Week Start = this Saturday, real loading day outside the week', moved.fields['Plan Week Start'] === ws && (ld(moved) < ws || ld(moved) > we));
  const adj = ord(FIX.cases.adjacent_import.ids[0]);
  ok(S, 'adjacent import loads within ±8 days but outside the week', ld(adj) > we && ld(adj) <= '2026-10-17');
  const w1 = FIX.cases.cross_week_w1.ids.map(ord);
  const tomorrow = new Date(Date.parse(TODAY + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  ok(S, 'W+1: Week Number 42, exactly one loads today–tomorrow', w1.every(r => r.fields['Week Number'] === 42) && w1.filter(r => [TODAY, tomorrow].includes(ld(r))).length === FIX.cases.cross_week_w1.expect.badge);

  // Flag boundaries hold under the REAL logic (core/wi4-logic.js). Facts are
  // the plain reading of the record — enough to prove the fixture sits on the
  // boundaries it claims; WIV2.factsOf is the browser rig's business.
  const factsOf = r => {
    const f = r.fields, isExp = f.Direction === 'Export';
    return { kind: isExp ? 'export' : 'import', saved: !!(link(f.Truck) || link(f.Partner)), partner: !!link(f.Partner),
      loadDate: ld(r), delDate: athensDay(f['Delivery DateTime']), returnDate: athensDay(f['Delivery DateTime']),
      hasReturn: !!f['Matched Import ID'], natState: 'ok', natLegs: [], pallets: f['Total Pallets'],
      vsCdDate: f['VS CD Date'] || null, natDelDate: athensDay(f['Delivery DateTime']), natLoadDate: ld(r),
      late: f['Delivery Performance'] === 'Delayed',
      preorder: f['Ops Status'] === 'Provisional' ? { level: (() => { const n = Math.round((Date.parse(ld(r)) - Date.parse(TODAY)) / 86400000); return n <= 1 ? 'red' : n <= 3 ? 'amber' : 'normal'; })() } : null };
  };
  for (const c of Object.values(FIX.cases)) {
    for (const [id, want] of Object.entries((c.expect && c.expect.flags) || {})) {
      const got = WI4.flags(factsOf(ord(id)), TODAY).reasons;
      for (const [code, level] of Object.entries(want)) {
        const r = got.find(x => x.code === code);
        ok(S, `${id} ${code} = ${level || 'none'} on ${TODAY} (${c.h2})`, level ? !!r && r.level === level : !r, got.map(x => x.code + ':' + x.level));
      }
    }
  }
  const e5 = WI4.flags(factsOf(ord('recWiE005')), TODAY);
  ok(S, 'two reasons on one row → the worst wins (E005: red)', e5.reasons.length >= 2 && e5.level === 'red', e5);
  ok(S, 'a partner row never gets EMPTY_RETURN', O.filter(r => link(r.fields.Partner) && r.fields.Direction === 'Export').every(r => !WI4.flags(factsOf(r), TODAY).reasons.some(x => x.code === 'EMPTY_RETURN')));
  // §d.2 «every ΠΡΟΣ ΑΝΑΘΕΣΗ box has a rail and a queue item»: every unassigned
  // export/import row in the week gets a NO_TRUCK reason (never silent).
  const unassigned = O.filter(r => !link(r.fields.Truck) && !link(r.fields.Partner) && !r.fields['Parent Order'] && !r.fields['Rotation ID']
    && !r.fields['Stock Lot'] && !r.fields['Week Number'] && !O.some(p => link(p.fields['Parent Order']) === r.id)
    && (r.fields.Direction === 'Export' ? effExp(r) >= ws && effExp(r) <= we : ld(r) >= ws && ld(r) <= we));
  ok(S, 'every unassigned row in the week carries NO_TRUCK (red or amber, never none)', unassigned.length >= 4 && unassigned.every(r => WI4.flags(factsOf(r), TODAY).reasons.some(x => x.code === 'NO_TRUCK')), unassigned.map(r => r.id));
}

if (argv.includes('--check-fixture')) {
  checkFixture();
  console.log(fails ? `\nFIXTURE NO-GO: ${fails} check(s) failed` : '\nFIXTURE GO: every §h.2 case is in the week');
  process.exit(fails ? 1 : 0);
}

// ═══ Part 2 — the browser rig ══════════════════════════════════════════
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), WT] }));
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const on = n => !want.length || want.includes(n);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function serve() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const file = path.join(TREE, decodeURIComponent(u.pathname === '/' ? '/app.html' : u.pathname));
    if (!file.startsWith(TREE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

function applyFields(target, fields) {
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) delete target[k]; else target[k] = v;
  }
}
const link = v => (Array.isArray(v) ? v[0] : v) || null;
// The Worker's label canonicalisation (§g.2): two labels, one column.
const canon = l => (l === 'Cross-dock Date' ? 'VS CD Date' : l);

// Runs in the page BEFORE any script: session, collapsed sidebar, recorders.
function initScript() {
  localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig', role: 'dispatcher', username: 'demo_dispatcher',
    loginAt: Date.now(), expiresAt: Date.now() + 8 * 3600 * 1000 }));
  localStorage.setItem('tms_jwt', 'rig.board.no-real-token');
  localStorage.setItem('tms_page', 'weekly_intl');
  localStorage.setItem('tms_sidebar_v2_migrated', '1');
  localStorage.setItem('tms_sidebar_collapsed', 'true');
  localStorage.removeItem('tms_wi4');
  localStorage.removeItem('tms_wk3_fl'); localStorage.removeItem('tms_wk3_fr');
  window.__ev = [];
}

// One page on one fresh copy of the week. opts:
//   flag 'on'|'off' · presence bool · fail {patch:{rec:500}, nl, relay, crossWeek, stock}
//   hold {nl} · expectLive (default true) · triggers (rt_sync / 028 emulation)
async function openBoard(browser, origin, opts = {}) {
  const flag = opts.flag || 'on';
  const ctx = await browser.newContext({ baseURL: origin + '/', viewport: { width: 1920, height: 1080 },
    serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(FIX._meta.now));
  const db = clone(FIX.tables);
  const S = { db, log: [], inflight: 0, held: [], pageErrors: [], unknown: new Set(), mainReads: 0, beats: [],
    fail: Object.assign({ patch: {} }, opts.fail || {}), hold: Object.assign({}, opts.hold || {}),
    expectLive: opts.expectLive !== false, triggers: !!opts.triggers, onGet: {}, delay: {}, seq: 0,
    presence: Object.assign({ mode: 200, others: [], changes: { n: 0, last_by: null, last_at: null, auto_n: 0 }, next_ms: 2500 }, opts.presenceCfg || {}) };
  page.on('pageerror', e => S.pageErrors.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(initScript);
  await page.route(u => !u.href.startsWith(origin) && !u.href.includes(HOST), route => route.abort());
  // The flag lives in config.js; it is rewritten in memory, never on disk.
  await page.route(u => u.href.startsWith(origin) && new URL(u.href).pathname === '/config.js', async route => {
    const r = await route.fetch(); let body = await r.text();
    const sub = (re, to) => { if (!re.test(body)) throw new Error('config.js changed: the rig cannot find ' + re); body = body.replace(re, to); };
    sub(/WI_V2:\s*'off'/, `WI_V2: '${flag}'`);
    if (opts.presence) { sub(/WI_PRESENCE:\s*false/, 'WI_PRESENCE: true'); sub(/active:\s*5000/, 'active: 2500'); }
    await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body });
  });
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, async route => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const body = (() => { try { return req.postDataJSON(); } catch (_) { return null; } })();
    const mm = u.pathname.match(/\/v0\/[^/]+\/([A-Za-z_][A-Za-z0-9_]*)(?:\/(rec[A-Za-z0-9]+))?$/);
    const tid = mm && mm[1], rid = mm && mm[2];
    const f = u.searchParams.get('filterByFormula') || '';
    // A held read is not «in flight» for settle(): the test decides when it lands.
    if (S.hold.nl && tid === T.NAT_LOADS) await new Promise(r => S.held.push(r));
    S.inflight++;
    try {
      if (u.pathname === '/presence') return presence(route, S, body, json);
      if (!mm) return json(route, m === 'GET' ? { records: [] } : { ok: true });
      const tbl = db[tid] || (db[tid] = []);
      if (m === 'GET') return json(route, ...readTable(S, tid, rid, f, tbl));
      if (m === 'PATCH' && rid) return await patchRecord(route, S, tid, rid, body, tbl, json);
      if (m === 'POST') {
        const id = 'recWiNEW' + String(++S.seq).padStart(3, '0');
        const rec = { id, fields: Object.assign({}, (body && body.fields) || {}) };
        tbl.push(rec); S.log.push({ k: 'post', tid, id, fields: rec.fields });
        return json(route, clone(rec));
      }
      if (m === 'DELETE') { S.log.push({ k: 'delete', tid, id: rid }); return json(route, { deleted: true, id: rid }); }
      return json(route, {});
    } finally { S.inflight--; }
  });
  await page.goto('app.html');
  await page.waitForFunction(() => window.WINTL && WINTL.rows && WINTL.rows.length > 0
    && !/Φόρτωση εβδομάδας/.test(document.getElementById('content').textContent), null, { timeout: 60000 });
  await settle(page, S);
  await instrument(page);
  return { page, S };
}

function readTable(S, tid, rid, f, tbl) {
  if (rid) {
    const r = tbl.find(x => x.id === rid);
    const out = r ? [clone(r)] : [{ error: { type: 'NOT_FOUND' } }, 404];
    if (S.onGet[rid]) { const fn = S.onGet[rid]; delete S.onGet[rid]; fn(); }   // a concurrent write lands AFTER this read
    return out;
  }
  const ids = new Set(f.match(/rec[A-Za-z0-9]+/g) || []);
  const finds = [...f.matchAll(/FIND\("(rec[A-Za-z0-9]+)",ARRAYJOIN\(\{([^}]+)\}/g)].map(x => ({ id: x[1], field: x[2] }));
  let out, g;
  if (tid === T.ORDERS) {
    if ((g = f.match(/\{Week Number\}=(\d+)/))) {
      if (S.fail.crossWeek) return [{ error: { type: 'SERVER_ERROR', message: 'rig: forced W+1 failure' } }, 500];
      out = tbl.filter(r => String(r.fields['Week Number']) === g[1]);
    } else if ((g = f.match(/\{Group ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Group ID'] === g[1]);
    else if ((g = f.match(/\{Matched Import ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Matched Import ID'] === g[1]);
    else if ((g = f.match(/\{Rotation ID\}='([^']+)'/))) out = tbl.filter(r => r.fields['Rotation ID'] === g[1]);
    else if ((g = f.match(/\{Parent Order\}='([^']+)'/))) out = tbl.filter(r => link(r.fields['Parent Order']) === g[1]);
    else if (/RECORD_ID\(\)/.test(f)) out = tbl.filter(r => ids.has(r.id));
    else if (finds.length) out = tbl.filter(r => finds.some(x => [].concat(r.fields[x.field] || []).includes(x.id)));
    else if (/\{Stock Lot\}!=BLANK\(\)/.test(f)) {
      if (S.fail.stock) return [{ error: { type: 'SERVER_ERROR', message: 'rig: forced stock failure' } }, 500];
      out = tbl.filter(r => link(r.fields['Stock Lot']) && !link(r.fields.Truck) && !link(r.fields.Partner) && r.fields.Status !== 'Delivered');
    } else if ((g = f.match(/\{Direction\}='(Export|Import)'/)) && /International/.test(f)) {
      if (g[1] === 'Export') S.mainReads++;
      out = tbl.filter(r => r.fields.Direction === g[1] && r.fields.Type === 'International');   // date window trimmed client-side
    } else { S.unknown.add('ORDERS ' + f.slice(0, 120)); out = []; }
  } else {
    if (tid === T.NAT_LOADS && S.fail.nl) return [{ error: { type: 'SERVER_ERROR', message: 'rig: forced national failure' } }, 500];
    if (tid === T.LOCAL_MOVES && S.fail.relay) return [{ error: { type: 'SERVER_ERROR', message: 'rig: forced relay failure' } }, 500];
    if (tid === T.STOCK_LOTS && S.fail.stock) return [{ error: { type: 'SERVER_ERROR', message: 'rig: forced stock failure' } }, 500];
    if (/RECORD_ID\(\)/.test(f)) out = tbl.filter(r => ids.has(r.id));
    else if (finds.length) out = tbl.filter(r => finds.some(x => [].concat(r.fields[x.field] || []).includes(x.id)));
    else if (/\{Complete\}=0/.test(f)) out = tbl.filter(r => !r.fields.Complete);
    else out = tbl;
  }
  return [{ records: clone(out) }];
}

// PATCH with the Worker's §g.2 rules: _expect compared label by label with the
// shared comparator (WI4.sameValue = the Worker's expectSame, one vector file),
// «body equals current → nothing can be lost», 409 writes nothing.
async function patchRecord(route, S, tid, rid, body, tbl, json) {
  // A one-shot delay keeps a write in flight while the test opens something
  // else — the §e.14 race (a write fails while another row's popover is open).
  if (S.delay[rid]) { const ms = S.delay[rid]; delete S.delay[rid]; await new Promise(r => setTimeout(r, ms)); }
  const r = tbl.find(x => x.id === rid);
  const fields = (body && body.fields) || {};
  const entry = { k: 'patch', tid, id: rid, fields: clone(fields), expect: body && body._expect !== undefined ? clone(body._expect) : undefined };
  S.log.push(entry);
  const forced = S.fail.patch[rid] || S.fail.patch['*'];
  if (forced) { entry.status = forced; return json(route, { error: { type: 'SERVER_ERROR', message: 'rig: forced write failure' } }, forced); }
  if (!r) { entry.status = 404; return json(route, { error: { type: 'NOT_FOUND' } }, 404); }
  if (body && body._expect && typeof body._expect === 'object') {
    const diff = Object.keys(body._expect).filter(l => {
      const c = canon(l), cur = r.fields[c];
      return !WI4.sameValue(body._expect[l], cur, c) && !WI4.sameValue(fields[l], cur, c);
    });
    if (diff.length) {
      entry.status = 409;
      const cur = {}; diff.forEach(l => { cur[l] = r.fields[canon(l)] === undefined ? null : r.fields[canon(l)]; });
      return json(route, { error: { type: 'conflict', fields: diff, by: 'user', at: FIX._meta.now, current: cur } }, 409);
    }
  }
  const before = clone(r.fields);
  applyFields(r.fields, fields);
  if (S.triggers) runTriggers(S, r, before);
  entry.status = 200;
  const res = clone(r);
  if (body && body._expect && S.expectLive) res._expectChecked = true;
  return json(route, res);
}
// Emulated triggers, ON only where a scenario needs its own cascade: rt_sync
// copies the vehicle to rota legs (013), 028 keeps VS CD Date next to the date
// it follows (export: loading + 1 day; import: delivery − 1 day).
function runTriggers(S, r, before) {
  const f = r.fields;
  const veh = ['Truck', 'Driver', 'Trailer'];
  if (veh.some(k => JSON.stringify(f[k]) !== JSON.stringify(before[k])))
    S.db[T.ORDERS].filter(x => x.fields['Rotation ID'] === r.id).forEach(leg => veh.forEach(k => { if (f[k]) leg.fields[k] = clone(f[k]); }));
  if (f['Veroia Switch']) {
    const shift = (iso, d) => athensDay(new Date(Date.parse(iso) + d * 86400000).toISOString());
    if (f.Direction === 'Export' && f['Loading DateTime'] !== before['Loading DateTime']) f['VS CD Date'] = shift(f['Loading DateTime'], 1);
    if (f.Direction === 'Import' && f['Delivery DateTime'] !== before['Delivery DateTime']) f['VS CD Date'] = shift(f['Delivery DateTime'], -1);
  }
}
function presence(route, S, body, json) {
  S.beats.push({ at: Date.now(), body: clone(body) });
  const p = S.presence;
  if (body && body.leave) return json(route, { others: [] });
  if (p.mode === 200) return json(route, { others: clone(p.others), changes: clone(p.changes), now: FIX._meta.now, next_ms: p.next_ms });
  if (p.mode === 429) return json(route, { error: 'too fast', retry_after_ms: 2500 }, 429);
  if (p.mode === 410) return json(route, { stop: true }, 410);
  if (p.mode === 503) return json(route, { error: 'presence unavailable' }, 503);
  return json(route, { error: 'rig ' + p.mode }, p.mode);
}

// Toasts, errors, downstream syncs and session expiry, recorded in the page.
async function instrument(page) {
  await page.evaluate(() => {
    const E = window.__ev = [];
    const wrap = (name, k, call = true) => { const fn = window[name]; if (typeof fn !== 'function') return;
      window[name] = function () { E.push({ k, a: [...arguments].map(x => { try { return typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : String(x).slice(0, 300); } catch (_) { return String(x); } }) }); return call ? fn.apply(this, arguments) : undefined; }; };
    wrap('toast', 'toast'); wrap('showErrorToast', 'errtoast'); wrap('logError', 'logError'); wrap('reportError', 'reportError');
    wrap('syncOrderDownstream', 'sync');
    // Never the real one: it would send the rig to the login page.
    wrap('tmsSessionExpired', 'expired', false);
  });
}
const evs = (page, k) => page.evaluate(k => window.__ev.filter(e => !k || e.k === k), k);
// A failing read or write is retried after 1 s and 2 s (core/api.js
// _atRetry): a scenario with a forced 500 waits with quietMs ≥ 2500.
async function settle(page, S, quietMs = 700, timeout = 30000) {
  const t0 = Date.now(); let quietSince = 0;
  while (Date.now() - t0 < timeout) {
    const busy = S.inflight > 0 || !(await page.evaluate(held => !!window.WINTL && WINTL.relay && WINTL.relay.state !== 'loading'
      && !(WINTL.data.stock && WINTL.data.stock.status === 'loading') && (held || WINTL.data.nlState !== 'loading'), !!S.hold.nl).catch(() => false));
    if (busy) quietSince = 0; else if (!quietSince) quietSince = Date.now(); else if (Date.now() - quietSince > quietMs) return;
    await page.waitForTimeout(100);
  }
  throw new Error('board never settled');
}
const writes = S => S.log.filter(x => ['patch', 'post', 'delete'].includes(x.k));
const patches = (S, id) => S.log.filter(x => x.k === 'patch' && (!id || x.id === id));
const fld = (S, id, k) => ((S.db[T.ORDERS].find(r => r.id === id) || { fields: {} }).fields)[k];
const rowOf = (page, oid) => page.evaluate(id => (WINTL.rows.find(r => (r.orderIds || [r.orderId]).includes(id)) || {}).id, oid);
// No input focused, no click on the app shell (a sidebar click navigates).
const neutral = page => page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
const shot = async (page, name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
// The element of an order's row on the v4 board, as v4 itself finds it.
const ROW_JS = `(oid)=>{const id=window.WIV2&&WIV2.rowIdOf?WIV2.rowIdOf(oid):null;
  const el=(id!=null&&document.getElementById('wi-row-'+id))||document.getElementById('wi-imp-'+oid)||document.querySelector('#content .wi4 [data-oid="'+oid+'"]');
  return el&&(el.closest('.wi4-row,.wi4-subrow')||el);}`;
// HTML5 drag with one shared DataTransfer: the inline handlers of BOTH boards
// run unchanged (§f — v4 emits today's handler strings), so the same drag can
// be replayed on v1 and v4 and the writes compared.
async function htmlDrag(page, srcSel, dstSel) {
  return page.evaluate(([s, d]) => {
    const src = document.querySelector(s), dst = document.querySelector(d);
    if (!src || !dst) return { ok: false, src: !!src, dst: !!dst };
    src.scrollIntoView({ block: 'center' });
    const r = dst.getBoundingClientRect(); const dt = new DataTransfer();
    const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 4, clientY: r.top + 4 }));
    fire(src, 'dragstart'); fire(dst, 'dragenter'); fire(dst, 'dragover'); fire(dst, 'drop'); fire(src, 'dragend');
    return { ok: true };
  }, [srcSel, dstSel]);
}
// Writes reduced to what both boards must agree on: table, record, fields.
// _expect is v4-only by design (§g.4) and is checked on its own.
const writeSig = S => writes(S).filter(w => w.status !== 409).map(w => JSON.stringify([w.k, w.tid, w.id, w.fields])).sort();
const ordersSig = S => JSON.stringify(S.db[T.ORDERS].map(r => [r.id, r.fields]).sort());

// Probe colours through the tokens themselves (no hex in the rig).
const TOKEN_JS = `(name)=>{const p=document.createElement('span');p.style.color='var('+name+')';document.body.appendChild(p);const c=getComputedStyle(p).color;p.remove();return c;}`;

// ═══ Scenarios ═════════════════════════════════════════════════════════
async function scnV1(browser, origin) {
  // The fixture on TODAY's board (flag 'off'): proves the week is readable by
  // the real old module before v4 exists — every case paints somewhere.
  const scn = 'v1';
  const { page, S } = await openBoard(browser, origin, { flag: 'off' });
  const r = await page.evaluate(() => {
    const ids = new Set(WINTL.rows.flatMap(x => x.orderIds || [x.orderId]));
    return { ids: [...ids], html: document.getElementById('content').innerHTML, text: document.getElementById('content').innerText,
      relay: WINTL.relay.state, nl: WINTL.data.nlState, stock: WINTL.data.stock && WINTL.data.stock.status,
      adj: WINTL.rows.filter(x => x.adj).map(x => x.orderId), legs: Object.keys(WINTL._legs || {}), split: Object.keys(WINTL._splitLegs || {}) };
  });
  ok(scn, 'old board painted, no page errors', /wi-row-/.test(r.html) && !S.pageErrors.length, S.pageErrors);
  ok(scn, 'every late source answered (relays, national, stock)', r.relay === 'ok' && r.nl === 'ok' && r.stock === 'ok', [r.relay, r.nl, r.stock]);
  const weekOrders = FIX.tables[T.ORDERS].filter(o => !o.fields['Week Number'] && o.id !== 'recWiI012').map(o => o.id);
  ok(scn, 'every order of the week is a row or a member of one (the loose piece lives on the shelf)', weekOrders.every(id => r.ids.includes(id)), weekOrders.filter(id => !r.ids.includes(id)));
  ok(scn, 'the empty day says «Καμία κίνηση»', /Καμία κίνηση/.test(r.text));
  // In the HTML, not innerText: v1's quiet mode hides .wi-cross (display:none).
  ok(scn, 'the «μεταφέρθηκε» section exists', /class="wi-cross"[^>]*>μεταφέρθηκε · W42/.test(r.html));
  ok(scn, 'the ±1-week import is adjacent', r.adj.includes('recWiI018'), r.adj);
  ok(scn, 'the rota leg and the split are recognised', r.legs.length > 0 && r.split.length > 0, { legs: r.legs, split: r.split });
  ok(scn, 'no ORDERS read the facade could not answer', !S.unknown.size, [...S.unknown]);
  await shot(page, 'v1-board');
  await page.context().close();
}

async function scnPaint(browser, origin) {
  const scn = 'paint';
  const { page, S } = await openBoard(browser, origin);
  await shot(page, 'paint-1920');
  const g = await page.evaluate(() => {
    const cols = document.querySelector('#content .wi4 .wi4-cols');
    const tracks = cols ? getComputedStyle(cols).gridTemplateColumns.split(' ').map(parseFloat) : [];
    const h = sel => [...document.querySelectorAll('#content .wi4 ' + sel)].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height * 10) / 10);
    const cs = sel => { const e = document.querySelector('#content .wi4 ' + sel); if (!e) return null; const s = getComputedStyle(e); return { fam: s.fontFamily, size: s.fontSize, w: s.fontWeight }; };
    return { tracks, row: h('.wi4-row'), sub: h('.wi4-subrow'),
      l1: cs('.wi4-l1'), l2: cs('.wi4-l2'), dayh: cs('.wi4-dayh'), colh: cs('.wi4-cols'), plate: cs('.wi4-plate'),
      rowsText: [...document.querySelectorAll('#content .wi4 .wi4-row')].map(e => e.innerText).join('\n') };
  });
  const W = [32, 140, 621, 204, 621, 140], at = [0, 1, 3, 5, 7, 9];
  ok(scn, 'grid at 1920 (sidebar collapsed): 32/140/621/204/621/140 ±1px', g.tracks.length === 10 && at.every((i, k) => Math.abs(g.tracks[i] - W[k]) <= 1), g.tracks);
  ok(scn, 'rows 32px', g.row.length > 10 && g.row.every(x => Math.abs(x - 32) <= 0.5), [...new Set(g.row)]);
  ok(scn, 'sub-rows 28px', g.sub.length > 0 && g.sub.every(x => Math.abs(x - 28) <= 0.5), [...new Set(g.sub)]);
  ok(scn, 'line 1 = DM Sans 12 Medium; line 2 = 10.5; day header 12.5 SemiBold; column header 10 SemiBold; plates DM Mono',
    g.l1 && /DM Sans/.test(g.l1.fam) && g.l1.size === '12px' && g.l1.w === '500' && g.l2 && g.l2.size === '10.5px'
    && g.dayh && g.dayh.size === '12.5px' && g.dayh.w === '600' && g.colh && g.colh.size === '10px' && g.colh.w === '600' && g.plate && /DM Mono/.test(g.plate.fam), g);
  ok(scn, 'no temperature on any row (owner lock)', !/°/.test(g.rowsText));

  // Row details (a)–(f), §e #7.
  const d = await page.evaluate(([js, tok]) => {
    const row = eval(js), token = eval(tok);
    const txt = (oid, sel) => { const r = row(oid); const e = r && r.querySelector(sel); return e ? e.textContent.trim() : null; };
    const outsideChip = [...document.querySelectorAll('#content .wi4 .wi4-row .wi4-leg')].flatMap(leg => {
      const w = document.createTreeWalker(leg, NodeFilter.SHOW_TEXT); const hits = []; let n;
      while ((n = w.nextNode())) if (/\b\d{1,2}\/\d{1,2}\b/.test(n.nodeValue) && !n.parentElement.closest('.wi4-dc, .wi4-gap, .wi4-noexp')) hits.push(n.nodeValue.trim());
      return hits;
    });
    const done = row('recWiE001') && row('recWiE001').querySelector('.wi4-c-exp .wi4-dc.done');
    const doneBorder = done ? getComputedStyle(done) : null;
    const redChipRows = [...document.querySelectorAll('#content .wi4 .wi4-dc.red')].map(c => !!(c.closest('.wi4-row') || c).querySelector('.wi4-box.un'));
    const plates = [...document.querySelectorAll('#content .wi4 .wi4-box.own .wi4-plate')].map(p => getComputedStyle(p).color);
    const lastSep = [...document.querySelectorAll('#content .wi4 .wi4-day-body')].map(b => b.lastElementChild && getComputedStyle(b.lastElementChild).borderBottomWidth);
    return { grpRef: txt('recWiE011', '.wi4-c-exp .wi4-ref'), impRef: txt('recWiE001', '.wi4-c-imp .wi4-ref'), outsideChip,
      done: !!done, doneFrame: doneBorder && doneBorder.borderTopStyle !== 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(doneBorder.borderTopColor),
      redChipRows, plates, ink: token('--wi4-ink'), lastSep,
      pe: !!(row('recWiE001') && row('recWiE001').querySelector('.wi4-l-pal .wi4-pe')) };
  }, [ROW_JS, TOKEN_JS]);
  ok(scn, '(a) a groupage shows «3 φορτία» in place of ΑΝΑΦ.', /3 φορτία/.test(d.grpRef || ''), d.grpRef);
  ok(scn, '(b) ΑΝΑΦ. also under the matched import\'s date', /REF-I001/.test(d.impRef || ''), d.impRef);
  ok(scn, '(c) the only date outside a chip is the VS warning «φτάνει …»', d.outsideChip.every(t => /φτάνει/.test(t)), d.outsideChip);
  ok(scn, '(d) a done date is plain grey (no frame); red chips only on rows without a truck', d.done && !d.doneFrame && d.redChipRows.every(Boolean), d);
  ok(scn, '(e) own-fleet plates dark: --wi4-ink (WP3 vocabulary)', d.plates.length > 3 && d.plates.every(c => c === d.ink), { plates: [...new Set(d.plates)], ink: d.ink });
  ok(scn, '(f) no separator under the last row of a day', d.lastSep.length >= 6 && d.lastSep.every(w => w === '0px'), d.lastSep);
  ok(scn, 'PE sits next to the pallets', d.pe);

  // Points (§d.1): ≤4 all if they fit, 5+ first 3 + «+N»; «+N» title lists the rest.
  const pts = () => page.evaluate(js => { const row = eval(js); const P = oid => { const r = row(oid); const to = r && r.querySelector('.wi4-c-exp .wi4-l-to');
    return to ? { n: to.querySelectorAll('.wi4-pt').length, more: (to.querySelector('.wi4-more') || {}).textContent || '', title: (to.querySelector('.wi4-more') || { title: '' }).title, badge: !!to.querySelector('.wi4-pt-n') } : null; };
    return { e19: P('recWiE019'), e20: P('recWiE020'), e01: P('recWiE001') }; }, ROW_JS);
  let p = await pts();
  ok(scn, '4 stops with national columns open → 3 + «+1» (§d.1 measured, §j.6)', p.e19 && p.e19.n === 3 && /\+1/.test(p.e19.more), p.e19);
  ok(scn, '9 stops → first 3 + «+6», title lists the hidden ones', p.e20 && p.e20.n === 3 && /\+6/.test(p.e20.more) && /Iota|Kappa|Lambda|Mu|Xi/.test(p.e20.title), p.e20);
  ok(scn, 'a single stop has no number badge', p.e01 && p.e01.n <= 1 && !p.e01.badge, p.e01);
  const toggles = page.locator('#content .wi4 .wi4-cols .wi4-ftog');
  if (await toggles.count() >= 2) {
    await toggles.first().click(); await toggles.last().click(); await page.waitForTimeout(300);
    p = await pts();
    ok(scn, 'national columns collapsed → all 4 points of E019, no «+N»', p.e19 && p.e19.n === 4 && !/\+/.test(p.e19.more), p.e19);
    await shot(page, 'paint-nat-collapsed');
    await toggles.first().click(); await toggles.last().click(); await page.waitForTimeout(300);
  } else ok(scn, 'two national column toggles (ΠΡΟΣ / ΑΠΟ ΒΕΡΟΙΑ) in the column header', false, await toggles.count());
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

async function scnInvariants(browser, origin) {
  const scn = 'invariants';
  const { page, S } = await openBoard(browser, origin);
  const r = await page.evaluate(() => {
    const Q = WIV2.queueItems();
    const rowIdsOf = el => { const rid = Number(el.getAttribute('data-row-id')); const row = WINTL.rows.find(x => x.id === rid); const oid = el.getAttribute('data-oid');
      const imp = row && row.importId ? (WINTL.rows.find(x => x.type === 'import' && (x.orderIds || []).includes(row.importId)) || { orderIds: [row.importId] }).orderIds : [];
      return [...new Set([...(row ? (row.orderIds || [row.orderId]) : []), ...imp, ...(oid ? [oid] : [])])]; };
    const qOf = ids => Q.filter(q => ids.includes(q.key) || ids.includes(q.rowKey));
    const un = [...document.querySelectorAll('#content .wi4 .wi4-box.un')].map(b => { const el = b.closest('.wi4-row,.wi4-subrow'); const ids = el ? rowIdsOf(el) : [];
      return { ids, rail: !!el && (el.classList.contains('wi4-r-red') || el.classList.contains('wi4-r-amb')), q: qOf(ids).some(q => q.code === 'NO_TRUCK') }; });
    const days = [...document.querySelectorAll('#content .wi4 .wi4-day')].map(day => {
      const head = (day.querySelector('.wi4-dayh') || {}).innerText || '';
      const rows = [...day.querySelectorAll('.wi4-row,.wi4-subrow')].map(el => ({ ids: rowIdsOf(el), rail: el.classList.contains('wi4-r-red') || el.classList.contains('wi4-r-amb') }));
      const items = qOf([...new Set(rows.flatMap(x => x.ids))]);
      const num = re => { const m = head.match(re); return m ? Number(m[1]) : 0; };
      return { head, railsWithoutItem: rows.filter(x => x.rail && !qOf(x.ids).length).map(x => x.ids), itemsWithoutRail: rows.filter(x => !x.rail && qOf(x.ids).length).map(x => x.ids),
        hdrNoTruck: num(/(\d+) χωρίς φορτηγό/), qNoTruck: items.filter(q => q.code === 'NO_TRUCK').length,
        hdrEmpty: num(/(\d+) κεν(?:ό|ά) γυρίσμα/), qEmpty: items.filter(q => q.code === 'EMPTY_RETURN').length, empty: /Καμία κίνηση/.test(day.innerText) };
    });
    const tabB = [...document.querySelectorAll('#content .wi4 .wi4-tab')].map(t => ({ t: t.innerText, b: (t.querySelector('.wi4-tab-b') || {}).textContent || '' }));
    return { un, days, tabB, qn: Q.length, codes: Q.map(q => q.code), text: document.querySelector('#content .wi4').innerText };
  });
  ok(scn, 'every «ΠΡΟΣ ΑΝΑΘΕΣΗ» box has a rail AND a NO_TRUCK queue item (§d.2)', r.un.length >= 4 && r.un.every(x => x.rail && x.q), r.un.filter(x => !x.rail || !x.q));
  ok(scn, 'per day: every railed row has a queue item and every row with an item has a rail', r.days.every(d => !d.railsWithoutItem.length && !d.itemsWithoutRail.length), r.days.filter(d => d.railsWithoutItem.length || d.itemsWithoutRail.length));
  ok(scn, 'per day: header counts = queue items (χωρίς φορτηγό, κενά γυρίσματα)', r.days.every(d => d.hdrNoTruck === d.qNoTruck && d.hdrEmpty === d.qEmpty), r.days.map(d => [d.head, d.hdrNoTruck, d.qNoTruck, d.hdrEmpty, d.qEmpty]));
  ok(scn, 'today\'s header says «σήμερα»', r.days.some(d => /6\/10/.test(d.head) && /σήμερα/.test(d.head)), r.days.map(d => d.head));
  ok(scn, 'the empty day is one line «Καμία κίνηση»', r.days.some(d => /4\/10/.test(d.head) && d.empty), r.days.map(d => d.head));
  ok(scn, 'today\'s empty return reads «(N από σήμερα)»', r.days.some(d => /από σήμερα/.test(d.head)), r.days.map(d => d.head));
  ok(scn, 'the W+1 tab badge = 1 (W+1 loads today–tomorrow)', r.tabB.some(t => /42/.test(t.t) && t.b.trim() === '1'), r.tabB);
  ok(scn, 'the «μεταφέρθηκε» section is drawn', /μεταφέρθηκε/.test(r.text));
  ok(scn, 'never «κανείς» on the board', !/κανείς/i.test(r.text));
  ok(scn, 'no auto-match: nothing written at load', !writes(S).length, writes(S));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// Overflow: every node whose text overflows carries the full text in a title.
// Contrast: text ≥ 4.5:1 against its effective background (placeholders and
// disabled controls excepted — --wi4-grey-3 is for those only).
const SCAN_JS = `(rootSel)=>{
  const roots=[...document.querySelectorAll(rootSel)]; const over=[], low=[];
  const rgb=s=>{const m=String(s).match(/rgba?\\(([^)]+)\\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x)); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
  const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);};
  const blend=(top,bot)=>({r:top.r*top.a+bot.r*(1-top.a),g:top.g*top.a+bot.g*(1-top.a),b:top.b*top.a+bot.b*(1-top.a),a:1});
  const bgOf=el=>{const stack=[]; for(let e=el;e;e=e.parentElement){const c=rgb(getComputedStyle(e).backgroundColor); if(c&&c.a>0){stack.push(c); if(c.a>=1) break;}}
    let acc={r:255,g:255,b:255,a:1}; for(let i=stack.length-1;i>=0;i--) acc=blend(stack[i],acc); return acc;};
  for(const root of roots) for(const el of root.querySelectorAll('*')){
    if(!el.offsetParent&&getComputedStyle(el).position!=='fixed') continue;
    const own=[...el.childNodes].some(n=>n.nodeType===3&&n.nodeValue.trim()); if(!own) continue;
    const st=getComputedStyle(el); if(st.visibility==='hidden'||parseFloat(st.opacity)===0) continue;
    const text=el.textContent.trim();
    if(st.display!=='inline'&&el.clientWidth>0&&el.scrollWidth>el.clientWidth+1){
      const t=(el.closest('[title]')||{}).title||''; if(!t||t.replace(/\\s+/g,' ').indexOf(text.replace(/\\s+/g,' ').slice(0,40))<0) over.push(text.slice(0,60)+' ['+el.className+']');
    }
    if(el.disabled||el.closest(':disabled')) continue;
    const fg=rgb(st.color), bg=bgOf(el); if(!fg) continue;
    const f=blend(fg,bg), L1=lum(f), L2=lum(bg), ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    if(ratio<4.5) low.push(text.slice(0,40)+' ['+el.className+'] '+ratio.toFixed(2));
  }
  return {over,low,n:roots.length};}`;
async function scnScans(browser, origin) {
  const scn = 'scans';
  const { page } = await openBoard(browser, origin);
  let r = await page.evaluate(([js]) => eval(js)('#content .wi4'), [SCAN_JS]);
  ok(scn, 'overflow scan (board): every overflowing text has its full text in a title', r.n === 1 && !r.over.length, r.over.slice(0, 15));
  ok(scn, 'contrast scan (board): text ≥ 4.5:1', r.n === 1 && !r.low.length, r.low.slice(0, 15));
  // Overlays too: the per-load menu and the date panel.
  await page.locator('#content .wi4 .wi4-plane').first().click(); await page.waitForTimeout(300);
  r = await page.evaluate(([js]) => eval(js)('#wi-ctx'), [SCAN_JS]);
  ok(scn, 'contrast + overflow scan (per-load menu)', !r.low.length && !r.over.length, r);
  await page.keyboard.press('Escape');
  const chip = await page.evaluate(js => { const r = eval(js)('recWiE014'); const c = r && r.querySelector('.wi4-c-exp .wi4-dc'); if (c) c.setAttribute('data-rig', 'chip'); return !!c; }, ROW_JS);
  if (chip) { await page.locator('[data-rig="chip"]').click(); await page.waitForTimeout(300); }
  r = await page.evaluate(([js]) => eval(js)('.wi4-datep'), [SCAN_JS]);
  ok(scn, 'contrast + overflow scan (date panel)', r.n === 1 && !r.low.length && !r.over.length, r);
  await page.context().close();
}

async function scnUnknown(browser, origin) {
  let scn = 'unknown.relay';
  {
    const { page, S } = await openBoard(browser, origin, { fail: { relay: 500 } });
    const r = await page.evaluate(() => ({ banner: [...document.querySelectorAll('#content .wi4 .wi4-banner')].map(b => b.innerText).join(' | '),
      q: WIV2.queueItems().filter(q => q.code === 'SOURCE_UNKNOWN').map(q => q.source) }));
    ok(scn, 'relay read 500 → banner «… δεν φορτώθηκαν … δεν σημαίνει ότι δεν υπάρχουν»', /δεν φορτώθηκαν/.test(r.banner) && /δεν σημαίνει ότι δεν υπάρχουν/.test(r.banner), r.banner);
    ok(scn, 'one SOURCE_UNKNOWN queue item for the relays', r.q.filter(s => /relay/.test(String(s))).length === 1, r.q);
    S.fail.relay = 0;
    const retry = page.locator('#content .wi4 .wi4-banner .wi4-link, #content .wi4 .wi4-banner button').first();
    if (await retry.count()) { await retry.click(); await settle(page, S); }
    ok(scn, '«Ξαναδοκίμασε» re-reads and the banner goes', !(await page.evaluate(() => /δεν φορτώθηκαν/.test((document.querySelector('#content .wi4') || {}).innerText || ''))));
    await shot(page, 'unknown-relay');
    await page.context().close();
  }
  scn = 'unknown.national';
  {
    const { page, S } = await openBoard(browser, origin, { fail: { nl: 500 } });
    await settle(page, S, 2600);
    const r = await page.evaluate(() => ({ un: document.querySelectorAll('#content .wi4 .wi4-tile.un').length,
      unk: [...document.querySelectorAll('#content .wi4 .wi4-tile.unk')].map(t => t.title || (t.closest('[title]') || {}).title || ''),
      codes: WIV2.queueItems().map(q => q.code), heads: [...document.querySelectorAll('#content .wi4 .wi4-dayh')].map(h => h.innerText) }));
    ok(scn, 'national read 500 → never «ΠΡΟΣ ΑΝΑΘΕΣΗ» on an unread leg', r.un === 0, r.un);
    ok(scn, '«—» tiles titled «απέτυχε — δεν σημαίνει ότι δεν έχουν μεταφορέα»', r.unk.length >= 3 && r.unk.every(t => /απέτυχε/.test(t) && /δεν σημαίνει/.test(t)), r.unk);
    ok(scn, 'exactly one NAT_UNKNOWN, zero NAT_NO_CARRIER', r.codes.filter(c => c === 'NAT_UNKNOWN').length === 1 && !r.codes.includes('NAT_NO_CARRIER'), r.codes);
    ok(scn, 'day headers say «εθνικά σκέλη: δεν φορτώθηκαν» instead of a count', r.heads.some(h => /εθνικά σκέλη: δεν φορτώθηκαν/.test(h)), r.heads);
    await page.context().close();
  }
  scn = 'unknown.national-slow';
  {
    const { page, S } = await openBoard(browser, origin, { hold: { nl: true } });
    const r = await page.evaluate(() => ({ un: document.querySelectorAll('#content .wi4 .wi4-tile.un').length,
      unk: [...document.querySelectorAll('#content .wi4 .wi4-tile.unk')].map(t => t.title || (t.closest('[title]') || {}).title || ''),
      codes: WIV2.queueItems().map(q => q.code), q: ((document.querySelector('#content .wi4 .wi4-q') || {}).innerText || '') }));
    ok(scn, 'while the national read is pending: «—» titled «δεν φορτώθηκε ακόμη», no «ΠΡΟΣ ΑΝΑΘΕΣΗ»', r.un === 0 && r.unk.length >= 3 && r.unk.every(t => /δεν φορτώθηκε ακόμη/.test(t)), r);
    ok(scn, 'no NAT_* item while loading; the queue header says «φορτώνει»', !r.codes.some(c => /^NAT_/.test(c)) && /φορτώνει/.test(r.q), r);
    S.hold.nl = false; S.held.splice(0).forEach(fn => fn()); await settle(page, S);
    const after = await page.evaluate(js => { const row = eval(js); const t = (oid, sel) => { const r = row(oid); return !!(r && r.querySelector(sel)); };
      return { e14own: t('recWiE014', '.wi4-c-fl .wi4-tile.own'), i05un: t('recWiE014', '.wi4-c-fr .wi4-tile.un'), codes: WIV2.queueItems().map(q => q.code) }; }, ROW_JS);
    ok(scn, 'after it lands: carrier tile own, the missing carrier becomes «ΠΡΟΣ ΑΝΑΘΕΣΗ» + a NAT_NO_CARRIER item', after.e14own && after.i05un && after.codes.includes('NAT_NO_CARRIER'), after);
    await page.context().close();
  }
  scn = 'unknown.w1';
  {
    const { page, S } = await openBoard(browser, origin, { fail: { crossWeek: 500 } });
    await page.waitForTimeout(1000); await settle(page, S, 2600);   // the W+1 read has no state seam: wait out its retries
    const r = await page.evaluate(() => ({ q: WIV2.queueItems().filter(q => q.code === 'SOURCE_UNKNOWN').map(q => q.source),
      hd: (document.querySelector('#content .wi4 .wi4-q') || {}).innerText || '',
      tabB: [...document.querySelectorAll('#content .wi4 .wi4-tab')].map(t => (t.querySelector('.wi4-tab-b') || {}).textContent || '').filter(Boolean) }));
    ok(scn, 'W+1 read 500 → one SOURCE_UNKNOWN item, the counter reads «≥N», the tab badge «—»', r.q.length === 1 && /≥/.test(r.hd) && r.tabB.includes('—'), r);
    await page.context().close();
  }
}

// Same action on v1 and v4, judged on the writes and the final table (§f, §h.4).
async function twin(browser, origin, scn, act, extra) {
  const res = {};
  for (const flag of ['off', 'on']) {
    const { page, S } = await openBoard(browser, origin, { flag });
    S.log = [];
    const r = await act(page, S, flag);
    await page.waitForTimeout(300); await settle(page, S, 1500);
    res[flag] = { r, w: writeSig(S), db: ordersSig(S), S, errs: S.pageErrors.slice(), exp: patches(S).filter(p => p.expect !== undefined).length };
    if (extra) await extra(page, S, flag);
    await shot(page, `${scn}-${flag === 'on' ? 'v4' : 'v1'}`);
    await page.context().close();
  }
  return res;
}
async function scnDrops(browser, origin) {
  const cell = oid => async page => `#wi-ci-${await rowOf(page, oid)}`;
  const cases = [
    { scn: 'drops.match', why: 'free import → empty-return cell = match', src: '#wi-imp-recWiI004', dst: cell('recWiE006'),
      check: (S) => fld(S, 'recWiE006', 'Matched Import ID') === 'recWiI004', wantWrites: true },
    { scn: 'drops.J1', why: 'free import → a matched GI load (free area) = join', src: '#wi-imp-recWiI004', dst: cell('recWiE024'),
      check: (S) => fld(S, 'recWiI004', 'Group ID') === fld(S, 'recWiI002', 'Group ID') && link(fld(S, 'recWiI004', 'Truck')) === 'recWiT017', wantWrites: true },
    { scn: 'drops.J2', why: 'free import → a tile of the matched GI load = join', src: '#wi-imp-recWiI004', dst: async () => `[ondrop*="_wiSegDrop"][ondrop*="'recWiI003'"]`,
      check: (S) => fld(S, 'recWiI004', 'Group ID') === fld(S, 'recWiI002', 'Group ID'), wantWrites: true },
    { scn: 'drops.reorder', why: 'export group tile onto another tile = reorder', src: `[ondragstart*="_wiSegDragStart"][ondragstart*="'recWiE013'"]`, dst: async () => `[ondrop*="_wiSegDrop"][ondrop*="'recWiE011'"]`,
      check: (S) => /\|recWiE013,/.test(String(fld(S, 'recWiE011', 'Group ID'))), wantWrites: true },
    { scn: 'drops.grip', why: 'matched group grip → another empty-return cell', src: `[ondragstart*="_wiImpDragStart"][ondragstart*="'recWiI002',true"]`, dst: cell('recWiE007'),
      check: () => true, wantWrites: null },
    { scn: 'drops.J9', why: 'stale drag id: a tile drag onto an empty cell writes nothing', pre: page => page.evaluate(() => { window._wiDragging = 'recWiI004'; }),
      src: `[ondragstart*="_wiSegDragStart"][ondragstart*="'recWiI014'"]`, dst: cell('recWiE006'), check: (S) => !fld(S, 'recWiE006', 'Matched Import ID'), wantWrites: false },
    { scn: 'drops.J16', why: 'import dropped on an EXPORT group tile is ignored', src: '#wi-imp-recWiI004', dst: async () => `[ondrop*="_wiSegDrop"][ondrop*="'recWiE012'"]`,
      check: (S) => !fld(S, 'recWiE012', 'Matched Import ID') && !fld(S, 'recWiI004', 'Truck'), wantWrites: false },
  ];
  for (const c of cases) {
    const res = await twin(browser, origin, c.scn, async (page, S) => {
      if (c.pre) await c.pre(page);
      return htmlDrag(page, c.src, await c.dst(page));
    });
    ok(c.scn, `${c.why}: source and target found on both boards`, res.off.r.ok && res.on.r.ok, { v1: res.off.r, v4: res.on.r });
    ok(c.scn, 'v4 writes = v1 writes (table, record, fields)', JSON.stringify(res.on.w) === JSON.stringify(res.off.w), { v1: res.off.w, v4: res.on.w });
    ok(c.scn, 'final ORDERS table identical', res.on.db === res.off.db);
    if (c.wantWrites !== null) ok(c.scn, c.wantWrites ? 'something was written' : 'nothing written', c.wantWrites ? res.on.w.length > 0 : res.on.w.length === 0, res.on.w);
    ok(c.scn, 'the table says so', c.check(res.on.S), res.on.w);
    if (c.scn === 'drops.match') ok(c.scn, '_expect only on v4\'s first export PATCH: {"Matched Import ID": null} (§g.4)',
      JSON.stringify((patches(res.on.S, 'recWiE006')[0] || {}).expect) === '{"Matched Import ID":null}' && res.off.exp === 0, { v4: patches(res.on.S, 'recWiE006').map(p => p.expect), v1exp: res.off.exp });
    ok(c.scn, 'no page errors', !res.on.errs.length && !res.off.errs.length, { v1: res.off.errs, v4: res.on.errs });
  }
  // §f: v4's own dragend/drop listener clears .wi4-dh/.dragover/.dragging.
  const { page } = await openBoard(browser, origin);
  const left = await page.evaluate(() => {
    const t = document.querySelector('#content .wi4 [ondrop*="_wiSegDrop"]'); if (!t) return null;
    t.classList.add('dragover', 'wi4-dh'); document.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    return document.querySelectorAll('#content .wi4 .wi4-dh, #content .wi4 .dragover, #content .wi4 .dragging').length;
  });
  ok('drops', 'a refused or ignored drop leaves no sticky hover class (§f listener)', left === 0, left);
  await page.context().close();
}

async function scnJoin(browser, origin) {
  // J10: a free group with no truck (I016+I017) joins the free group on our
  // truck (I014+I015) through the menu panel — every member moves. The
  // handler string comes from the v4 menu, and the SAME string runs on v1
  // (only the label is relabelled, §e.9).
  const scn = 'join.J10';
  let handler = null;
  {
    const { page } = await openBoard(browser, origin);
    handler = await openMenu(page, 'recWiI014').then(m => (m.items.find(i => /^Groupage εισαγωγών…$/.test(i.label)) || {}).onclick || null);
    await page.context().close();
  }
  ok(scn, 'the v4 menu offers «Groupage εισαγωγών…»', !!handler, handler);
  if (!handler) return;
  const res = await twin(browser, origin, scn, async (page) => {
    const pick = await rowOf(page, 'recWiI016');
    const okOpen = await page.evaluate(h => { try { (0, eval)(h); return true; } catch (e) { return String(e); } }, handler);
    await page.waitForTimeout(400);
    await page.locator(`#wi-panel .wiGrpPick[value="${pick}"]`).check().catch(() => {});
    const title = await page.evaluate(() => ({ t: (document.querySelector('#wi-panel .wi-panel-title') || {}).textContent || '', b: (document.querySelector('#wi-panel .wi-panel-ft .btn-primary') || {}).textContent || '' }));
    await page.locator('#wi-panel .wi-panel-ft .btn-primary').click().catch(() => {});
    await page.waitForTimeout(1500);
    return { okOpen, title };
  });
  ok(scn, 'panel opened on both boards', res.off.r.okOpen === true && res.on.r.okOpen === true, [res.off.r.okOpen, res.on.r.okOpen]);
  ok(scn, 'v4 panel title + primary button relabelled «Groupage εισαγωγών»', /Groupage εισαγωγών/.test(res.on.r.title.t) && /Groupage εισαγωγών/.test(res.on.r.title.b), res.on.r.title);
  ok(scn, 'v4 writes = v1 writes; every member of the joining group moved', JSON.stringify(res.on.w) === JSON.stringify(res.off.w) && res.on.w.length >= 2, { v1: res.off.w, v4: res.on.w });
  ok(scn, 'table: I016 and I017 carry I014\'s Group ID and truck', ['recWiI016', 'recWiI017'].every(id => fld(res.on.S, id, 'Group ID') === fld(res.on.S, 'recWiI014', 'Group ID') && link(fld(res.on.S, id, 'Truck')) === 'recWiT018'));
  ok(scn, 'final ORDERS table identical', res.on.db === res.off.db);
}

// The per-load menu as data: header, sections, items (label without the hint
// letter, onclick, whether inside a member submenu).
async function openMenu(page, oid, how = 'plane') {
  const sel = await page.evaluate(([js, oid]) => { const r = eval(js)(oid); if (!r) return null; r.setAttribute('data-rig-row', oid); return true; }, [ROW_JS, oid]);
  if (!sel) return { ok: false, items: [] };
  const row = page.locator(`[data-rig-row="${oid}"]`);
  if (how === 'plane') await row.locator('.wi4-plane').first().click(); else await row.click({ button: 'right', position: { x: 300, y: 12 } });
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const ctx = document.getElementById('wi-ctx');
    const shown = !!ctx && ctx.style.display === 'block';
    const items = []; let sec = null;
    for (const el of (ctx ? ctx.querySelectorAll('.wi4-m-sec, .wi-ctx-i') : [])) {
      if (el.classList.contains('wi4-m-sec')) { sec = el.textContent.trim(); continue; }
      if (el.classList.contains('wi4-m-more')) { items.push({ more: true, label: el.textContent.trim(), sec }); continue; }
      const c = el.cloneNode(true); c.querySelectorAll('.wi4-m-k,.wi4-m-ic').forEach(x => x.remove());
      items.push({ label: c.textContent.trim(), onclick: el.getAttribute('onclick') || '', sec, sub: !!el.closest('.wi4-m-sub') });
    }
    return { ok: shown, header: (ctx && ctx.querySelector('.wi4-m-hd') || {}).innerText || '', items };
  });
}
async function scnMenu(browser, origin) {
  const { page, S } = await openBoard(browser, origin);
  const TRUCK = /^(_wiPanelAssign|_wiClear|_wiStockPanel)\(/;
  for (const oid of ['recWiE001', 'recWiE011', 'recWiE022', 'recWiI020', 'recWiI004', 'recWiE025', 'recWiI009', 'recWiE023']) {
    const scn = 'menu.' + oid.slice(-4);
    const m = await openMenu(page, oid);
    const real = m.items.filter(i => !i.more);
    const onclicks = real.map(i => i.onclick).filter(Boolean);
    ok(scn, 'opens inside #wi-ctx with a header', m.ok && !!m.header, m.header);
    ok(scn, 'no onclick twice', new Set(onclicks).size === onclicks.length, onclicks.filter((x, i) => onclicks.indexOf(x) !== i));
    ok(scn, 'labels unique', new Set(real.map(i => i.label)).size === real.length, real.map(i => i.label));
    const loadSecs = [...new Set(real.filter(i => !i.sub && /ΕΞΑΓΩΓΗ|ΕΙΣΑΓΩΓΗ/.test(i.sec || '')).map(i => i.sec))];
    const firstOk = loadSecs.every(s => { const f = real.find(i => !i.sub && i.sec === s); return f && (/^Άνοιγμα παραγγελίας/.test(f.label) && /^_wk3Edit\(/.test(f.onclick) || /Αρχική παραγγελία/.test(f.label)); });
    ok(scn, '«Άνοιγμα παραγγελίας» → _wk3Edit first in every load section', loadSecs.length > 0 && firstOk, real.map(i => [i.sec, i.label]));
    ok(scn, 'no truck item inside a member submenu', !real.some(i => i.sub && TRUCK.test(i.onclick)), real.filter(i => i.sub && TRUCK.test(i.onclick)));
    ok(scn, 'no «Καθυστέρηση…», no old «Ομαδοποίηση…»', !real.some(i => /Καθυστέρηση|^Ομαδοποίηση/.test(i.label)), real.map(i => i.label));
    if (oid === 'recWiE011') {
      ok(scn, 'groupage ×3: one «▸» line per member, each with its own «Άνοιγμα παραγγελίας»', m.items.filter(i => i.more).length === 3
        && real.filter(i => i.sub && /^Άνοιγμα παραγγελίας/.test(i.label)).length === 3, m.items);
      ok(scn, 'relabels: «Groupage εξαγωγών…», «Εκτύπωση / WhatsApp…»', real.some(i => /^Groupage εξαγωγών/.test(i.label)) && real.some(i => /^Εκτύπωση \/ WhatsApp/.test(i.label)), real.map(i => i.label));
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    const rc = await openMenu(page, oid, 'right');
    const rcOn = rc.items.filter(i => !i.more).map(i => i.onclick).filter(Boolean).sort();
    ok(scn, 'right-click opens the same menu as the paper-plane', JSON.stringify(rcOn) === JSON.stringify(onclicks.slice().sort()), { plane: onclicks.length, right: rcOn.length });
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    ok(scn, 'Esc closes it', await page.evaluate(() => (document.getElementById('wi-ctx') || {}).style.display !== 'block'));
  }
  // rota-matched-import: the matched import's section offers the rota leg panel.
  const m = await openMenu(page, 'recWiE023');
  const rota = m.items.find(i => /_wiPanelRota\(/.test(i.onclick || ''));
  ok('menu.rota', 'the matched import section offers «Σκέλος προώθησης…» (_wiPanelRota)', !!rota && /ΕΙΣΑΓΩΓΗ/.test(rota.sec || ''), m.items);
  if (rota) {
    await page.locator(`#wi-ctx .wi-ctx-i[onclick="${rota.onclick.replace(/"/g, '\\"')}"]`).click(); await page.waitForTimeout(400);
    ok('menu.rota', 'it opens #wi-panel (body.wi4-on set)', await page.evaluate(() => (document.getElementById('wi-panel') || {}).style.display === 'block' && document.body.classList.contains('wi4-on')));
    await page.keyboard.press('Escape');
  }
  // Hovering a section highlights its load in the row.
  await openMenu(page, 'recWiE001');
  const sec = page.locator('#wi-ctx .wi4-m-sec').nth(1);
  if (await sec.count()) { await sec.hover(); await page.waitForTimeout(150); }
  ok('menu.hover', 'hovering a section highlights its load in the row', await page.evaluate(() => !!document.querySelector('#content .wi4 .wi4-mhl')));
  await page.keyboard.press('Escape');
  ok('menu', 'opening menus wrote nothing; no page errors', !writes(S).length && !S.pageErrors.length, { w: writes(S), e: S.pageErrors });
  await page.context().close();
}

// Date panel (§e #10): one write per field, the body = today's + _expect only.
async function openDatePanel(page, oid) {
  await page.evaluate(([js, oid]) => { const r = eval(js)(oid); const c = r && r.querySelector('.wi4-c-exp .wi4-dc, .wi4-dc'); if (c) c.setAttribute('data-rig-chip', oid); }, [ROW_JS, oid]);
  const c = page.locator(`[data-rig-chip="${oid}"]`);
  if (!(await c.count())) return false;
  await c.click(); await page.waitForTimeout(250);
  return page.evaluate(() => !!document.querySelector('.wi4-datep'));
}
const panelInfo = page => page.evaluate(() => { const p = document.querySelector('.wi4-datep'); return p ? {
  title: (p.querySelector('.wi4-datep-hd') || {}).textContent || '', segs: [...p.querySelectorAll('.wi4-seg button')].map(b => b.textContent.trim()),
  sel: (p.querySelector('.wi4-cal-d.sel') || { getAttribute: () => null }).getAttribute('aria-label'), time: !!p.querySelector('.wi4-time'),
  note: (p.querySelector('.wi4-datep-note') || {}).textContent || '', pnote: (p.querySelector('.wi4-pnote') || {}).textContent || '',
  conf: (p.querySelector('.wi4-conf') || {}).textContent || '' } : null; });
async function scnDate(browser, origin) {
  const { page, S } = await openBoard(browser, origin);
  const plusDay = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const FIELDS = [['Loading DateTime', 'Φόρτωση', 'Ημερομηνία φόρτωσης'], ['Delivery DateTime', 'Εκφόρτωση', 'Ημερομηνία εκφόρτωσης'], ['VS CD Date', 'Βέροια', 'Ημερομηνία Βέροιας']];
  for (const [field, seg, title] of FIELDS) {
    const scn = 'date.' + seg;
    S.log = []; await page.evaluate(() => { window.__ev.length = 0; });
    const before = clone(S.db[T.ORDERS].find(r => r.id === 'recWiE014').fields);
    ok(scn, 'the chip opens the date panel', await openDatePanel(page, 'recWiE014'));
    if (field !== 'Loading DateTime') { await page.locator('.wi4-datep .wi4-seg button', { hasText: seg }).click(); await page.waitForTimeout(150); }
    const info = await panelInfo(page);
    ok(scn, `title «${title}», switch Φόρτωση · Εκφόρτωση · Βέροια (VS order)`, info && info.title === title && ['Φόρτωση', 'Εκφόρτωση', 'Βέροια'].every(s => info.segs.includes(s)), info);
    ok(scn, field === 'VS CD Date' ? 'no time input for Βέροια (date only, as today)' : 'a time input', info && info.time === (field !== 'VS CD Date'), info);
    ok(scn, 'the panel says what changes and what does not', info && /Η Εβδομάδα δεν αλλάζει από εδώ/.test(info.note), info && info.note);
    const week0 = await page.evaluate(() => WINTL.week);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
    ok(scn, '→ moves one day in the calendar and never changes the week (capture listener, §d.4)', (await page.evaluate(() => WINTL.week)) === week0 && (await panelInfo(page)).sel !== info.sel, [(await panelInfo(page)).sel, info.sel]);
    await page.locator('.wi4-datep .wi4-datep-ft .wi4-btn.pri').click();
    await page.waitForTimeout(300); await settle(page, S, 1200);
    const P = patches(S, 'recWiE014');
    const cur = before[field] === undefined ? null : before[field];
    const curDay = field === 'VS CD Date' ? (cur || null) : athensDay(cur);
    const wantDay = plusDay(curDay || TODAY, 1);
    const sent = P[0] && P[0].fields[field];
    ok(scn, 'exactly one PATCH on the order, carrying only this field', P.length === 1 && Object.keys(P[0].fields).join() === field, P);
    ok(scn, 'the new day (old time kept for DateTimes)', !!sent && (field === 'VS CD Date' ? sent === wantDay : athensDay(sent) === wantDay && new Date(sent).getUTCHours() === new Date(cur).getUTCHours()), { sent, wantDay });
    ok(scn, '_expect = the value the panel showed at open (server truth)', P[0] && P[0].expect && WI4.sameValue(P[0].expect[field], cur, field), P[0] && P[0].expect);
    const sync = (await evs(page, 'sync')).filter(e => e.a[0] === 'recWiE014');
    ok(scn, 'syncOrderDownstream(order, {changedFields:[field]}) as today', sync.length === 1 && JSON.stringify(sync[0].a[1].changedFields) === JSON.stringify([field]), sync);
    ok(scn, 'the table holds it', JSON.stringify(fld(S, 'recWiE014', field)) === JSON.stringify(sent));
  }
  // A non-VS order has no Βέροια tab.
  await openDatePanel(page, 'recWiE003');
  ok('date.nonVS', 'no «Βέροια» on a non-VS order', !((await panelInfo(page)) || { segs: ['Βέροια'] }).segs.includes('Βέροια'));
  // Moved-row trace (§e #15): E003 delivery Thu → Fri.
  S.log = [];
  await page.locator('.wi4-datep .wi4-seg button', { hasText: 'Εκφόρτωση' }).click(); await page.waitForTimeout(100);
  await page.keyboard.press('ArrowRight'); await page.locator('.wi4-datep .wi4-datep-ft .wi4-btn.pri').click();
  await page.waitForTimeout(300); await settle(page, S, 1200);
  // E003 is ΠΕΛΑΤΗΣ Γ; E014's earlier delivery move may still show its own trace.
  const tr = await page.evaluate(() => [...document.querySelectorAll('#content .wi4 .wi4-trace')].map(t => t.innerText).filter(t => /ΠΕΛΑΤΗΣ Γ/.test(t)));
  ok('date.trace', '«↓ Πήγε στην …» trace at the old position', tr.length === 1 && /Πήγε στην/.test(tr[0]), tr);
  if (tr.length) {
    await page.locator('#content .wi4 .wi4-trace', { hasText: 'ΠΕΛΑΤΗΣ Γ' }).first().click(); await page.waitForTimeout(500);
    ok('date.trace', 'a click brings the moved row into view', await page.evaluate(js => { const r = eval(js)('recWiE003'); if (!r) return false; const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }, ROW_JS));
    await page.waitForTimeout(10500);
    ok('date.trace', 'the trace goes after 10 s', await page.evaluate(() => ![...document.querySelectorAll('#content .wi4 .wi4-trace')].some(t => /ΠΕΛΑΤΗΣ Γ/.test(t.innerText))));
  }
  ok('date', 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

async function scnKeys(browser, origin) {
  const { page, S } = await openBoard(browser, origin);
  const st = () => page.evaluate(() => ({ focus: WINTL.ui && WINTL.ui.v4Focus, kbd: !!document.querySelector('#content .wi4.wi4-kbd'),
    ring: document.querySelectorAll('#content .wi4 .wi4-focus').length, ctx: (document.getElementById('wi-ctx') || {}).style.display === 'block',
    pop: (() => { const p = document.getElementById('wi-popover'); return !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim(); })(),
    help: !!document.querySelector('.wi4-dlg .wi4-help-row'), active: document.activeElement && document.activeElement.className }));
  await neutral(page);
  await page.keyboard.press('ArrowDown');
  let s1 = await st();
  ok('keys', '↓ focuses the first row, blue ring only after a key (wi4-kbd)', !!s1.focus && s1.kbd && s1.ring === 1, s1);
  await page.keyboard.press('ArrowDown');
  const s2 = await st();
  ok('keys', '↓ again moves to the next row', !!s2.focus && s2.focus !== s1.focus, [s1.focus, s2.focus]);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  ok('keys', 'Enter opens the per-load menu', (await st()).ctx);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  // Greek layout: same e.code, Greek e.key.
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'α', bubbles: true })));
  await page.waitForTimeout(300);
  ok('keys', 'A (Greek «α», code KeyA) opens the assignment popover', (await st()).pop);
  await page.evaluate(() => { if (typeof _wiClosePopover === 'function') _wiClosePopover(); });
  await page.keyboard.press('Shift+Slash'); await page.waitForTimeout(200);
  const help = await page.evaluate(() => [...document.querySelectorAll('.wi4-dlg .wi4-help-row')].map(r => [...r.querySelectorAll('.wi4-key')].map(k => k.textContent.trim()).join('+')));
  const keymap = await page.evaluate(() => WI4.KEYMAP.map(k => k.keys));
  ok('keys', '«?» lists exactly the live keymap (no E/I, ←→, [ ], ⌘Z)', help.length > 0 && keymap.every(k => help.some(h => h.includes(k))) && !help.some(h => /^(E|I|←|→|\[|\]|⌘Z)$/.test(h)), { help, keymap });
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.keyboard.press('Slash'); await page.waitForTimeout(100);
  ok('keys', '/ focuses the search box', await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.wi4-search')));
  await page.keyboard.type('a'); await page.waitForTimeout(150);
  ok('keys', 'typing inside the search box triggers no action', !(await st()).pop && !(await st()).ctx);
  await page.keyboard.press('Escape'); await neutral(page);
  const f0 = (await st()).focus;
  await page.keyboard.press('Meta+ArrowDown');
  ok('keys', 'with ⌘ held nothing acts', (await st()).focus === f0);
  // Order form / palette open → keys do nothing.
  await page.evaluate(() => { const m = document.getElementById('modalOverlay'); if (m) m.classList.add('open'); });
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  ok('keys', 'with the order form open nothing acts', (await st()).focus === f0 && !(await st()).ctx);
  await page.evaluate(() => { const m = document.getElementById('modalOverlay'); if (m) m.classList.remove('open');
    let p = document.getElementById('cmdk-overlay'); if (!p) { p = document.createElement('div'); p.id = 'cmdk-overlay'; p.dataset.rig = '1'; document.body.appendChild(p); } p.style.display = 'flex'; });
  await page.keyboard.press('ArrowDown');
  ok('keys', 'with the command palette open nothing acts', (await st()).focus === f0);
  await page.evaluate(() => { const p = document.getElementById('cmdk-overlay'); if (p) { p.style.display = 'none'; if (p.dataset.rig) p.remove(); } });
  // Off the page: a v4 key must never act on another page.
  await page.evaluate(() => navigate('dashboard')); await page.waitForTimeout(1200);
  const errs0 = S.pageErrors.length;
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.keyboard.press('KeyA');
  await page.waitForTimeout(300);
  ok('keys', 'off-page: no v4 action, no error', !(await page.evaluate(() => !!document.querySelector('#content .wi4') || (document.getElementById('wi-ctx') || {}).style.display === 'block')) && S.pageErrors.length === errs0, S.pageErrors.slice(errs0));
  ok('keys', 'keys wrote nothing', !writes(S).length, writes(S));
  await page.context().close();
}

async function scnSearch(browser, origin) {
  const { page, S } = await openBoard(browser, origin);
  const box = page.locator('#content .wi4 .wi4-search input');
  const st = () => page.evaluate(() => ({ n: ((document.querySelector('#content .wi4 .wi4-search-n') || {}).textContent || '').trim(),
    dim: document.querySelectorAll('#content .wi4 .wi4-row.wi4-dim').length, rows: document.querySelectorAll('#content .wi4 .wi4-row').length }));
  // ΠΕΛΑΤΗΣ Β = E002, E018, I007: the client name comes from CLIENTS (the Worker never returns «Client Name»).
  await box.fill('ΠΕΛΑΤΗΣ Β'); await page.waitForTimeout(300);
  let s = await st();
  ok('search', 'client name: «1/3», the other rows dim', s.n === '1/3' && s.dim === s.rows - 3, s);
  await box.press('Enter'); await page.waitForTimeout(150);
  ok('search', 'Enter → «2/3»', (await st()).n === '2/3', await st());
  await box.fill('TST-1017'); await page.waitForTimeout(300);
  ok('search', 'plate: matches the E024 row', /^1\/\d+$/.test((await st()).n), await st());
  await box.fill('REF-E019'); await page.waitForTimeout(300);
  ok('search', 'ΑΝΑΦ.: «1/1»', (await st()).n === '1/1', await st());
  await box.fill('Driver Test 18'); await page.waitForTimeout(300);
  ok('search', 'driver: matches', /^1\/\d+$/.test((await st()).n), await st());
  await box.press('Escape'); await page.waitForTimeout(200);
  s = await st();
  ok('search', 'Esc clears: nothing dimmed', s.dim === 0, s);
  ok('search', 'search wrote nothing, hid nothing (dims, never _wiApplyFilter)', !writes(S).length && s.rows > 20, s);
  await page.context().close();
}

// The app's own confirm (confirmAction → #modalOverlay), answered «yes» when it asks.
async function confirmIfAsked(page, ms = 1500) {
  const b = page.locator('#modalOverlay.open #_cfaOk');
  try { await b.waitFor({ state: 'visible', timeout: ms }); await b.click(); return true; } catch (_) { return false; }
}
async function setPopoverTruck(page, rowId, truck, label) {
  return page.evaluate(([rid, t, l]) => {
    const v = document.getElementById(`wsd-v-tk_p_${rid}`); const i = document.querySelector(`#wsd-tk_p_${rid} .wi-sdi`);
    if (!v) return false; v.value = t; if (i) i.value = l; return true;
  }, [rowId, truck, label]);
}
async function openPopover(page, oid) {
  await page.evaluate(([js, oid]) => { const r = eval(js)(oid); const b = r && r.querySelector('.wi4-box'); if (b) b.setAttribute('data-rig-box', oid); }, [ROW_JS, oid]);
  await page.locator(`[data-rig-box="${oid}"]`).click(); await page.waitForTimeout(300);
  return page.evaluate(() => { const p = document.getElementById('wi-popover'); return !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim(); });
}
async function scnSaveFail(browser, origin) {
  let scn = 'savefail.popover';
  {
    const { page, S } = await openBoard(browser, origin);
    const r7 = await rowOf(page, 'recWiE007'), r6 = await rowOf(page, 'recWiE006');
    // The race of §e.14: a match on E006 is written (its optimistic paint
    // already happened), the user opens E007's popover meanwhile, and only
    // then the write fails. The first attempt is held 1.5 s, every attempt 500s.
    S.fail.patch.recWiE006 = 500; S.delay.recWiE006 = 1500; S.log = [];
    await htmlDrag(page, '#wi-imp-recWiI004', `#wi-ci-${r6}`);
    await page.waitForTimeout(700);
    ok(scn, 'E007\'s popover is open while E006\'s write is in flight', await openPopover(page, 'recWiE007'));
    const reads0 = S.mainReads;
    await page.waitForTimeout(500); await settle(page, S, 2600);
    const r = await page.evaluate(([js]) => ({ msg: (() => { const row = eval(js)('recWiE006'); const n = row && (row.querySelector('.wi4-msg') || (row.nextElementSibling && row.nextElementSibling.classList.contains('wi4-msg') ? row.nextElementSibling : null)); return n ? n.innerText : ''; })(),
      msgH: (() => { const n = document.querySelector('#content .wi4 .wi4-msg'); return n ? Math.round(n.getBoundingClientRect().height) : null; })(),
      upd: (document.querySelector('#content .wi4 .wi4-upd.err') || {}).innerText || '',
      pop: (() => { const p = document.getElementById('wi-popover'); return !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim(); })(), rows: WINTL.rows.length }), [ROW_JS]);
    ok(scn, 'a 24px line under E006 «Δεν αποθηκεύτηκε …»', /Δεν αποθηκεύτηκε/.test(r.msg) && r.msgH === 24, r);
    ok(scn, 'title bar «1 αλλαγή δεν αποθηκεύτηκε»', /1 αλλαγή δεν αποθηκεύτηκε/.test(r.upd), r.upd);
    ok(scn, 'E007\'s popover stays open; no re-read while it is open (§e.14)', r.pop && S.mainReads === reads0, { pop: r.pop, reads: S.mainReads - reads0 });
    ok(scn, 'the row ids did not move', (await rowOf(page, 'recWiE007')) === r7);
    S.fail.patch = {}; S.log = [];
    ok(scn, 'the popover form accepts a truck', await setPopoverTruck(page, r7, 'recWiT016', 'TST-1016'));
    await page.locator('#wi-popover [onclick*="_wiSaveFromPopover"]').first().click(); await confirmIfAsked(page);
    await page.waitForTimeout(500); await settle(page, S, 1500);
    const truckWrites = patches(S).filter(p => p.fields && p.fields.Truck);
    ok(scn, 'the popover\'s PATCH targets E007 — never the failed row', truckWrites.length >= 1 && truckWrites[0].id === 'recWiE007' && !truckWrites.some(p => p.id === 'recWiE006'), truckWrites);
    ok(scn, 'table: E007 has TST-1016', link(fld(S, 'recWiE007', 'Truck')) === 'recWiT016');
    ok(scn, 'once nothing is open, the row is re-read (debounced)', S.mainReads > reads0, S.mainReads - reads0);
    await page.context().close();
  }
  scn = 'savefail.pendingMatch';
  {
    const { page, S } = await openBoard(browser, origin);
    const r8 = await rowOf(page, 'recWiE008'), r6 = await rowOf(page, 'recWiE006');
    await page.evaluate(([js]) => { const row = eval(js)('recWiE008'); const b = row && row.querySelector('.wi4-gap-act'); if (b) b.setAttribute('data-rig-new', '1'); }, [ROW_JS]);
    const btn = page.locator('[data-rig-new="1"]');
    ok(scn, '«+ Νέα εισαγωγή» on E008\'s empty return', (await btn.count()) === 1);
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(800);
    ok(scn, 'the new-import form holds _wiPendingMatch for E008', await page.evaluate(id => !!window._wiPendingMatch && window._wiPendingMatch.rowId === id, r8));
    const reads0 = S.mainReads;
    S.fail.patch.recWiE006 = 500;
    await htmlDrag(page, '#wi-imp-recWiI004', `#wi-ci-${r6}`);
    await page.waitForTimeout(500); await settle(page, S, 2600);
    ok(scn, 'no re-read while the form is open; the row ids did not move', S.mainReads === reads0 && (await rowOf(page, 'recWiE008')) === r8, { reads: S.mainReads - reads0 });
    // The form's create, as orders_intl does it: the record exists, then the
    // pending match is consumed (the rig does not type the whole order form).
    S.fail.patch = {}; S.log = [];
    S.db[T.ORDERS].push({ id: 'recWiNEW901', fields: { Type: 'International', Direction: 'Import', Status: 'Pending', 'Loading DateTime': '2026-10-08T05:00:00.000Z', 'Delivery DateTime': '2026-10-10T07:00:00.000Z', 'Total Pallets': 4 } });
    await page.evaluate(() => _wiConsumePendingMatch('recWiNEW901', { Direction: 'Import' }));
    await page.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });
    await page.waitForTimeout(500); await settle(page, S, 1500);
    const mp = patches(S).filter(p => p.fields && 'Matched Import ID' in p.fields);
    ok(scn, 'the match PATCH targets the export the user chose (E008)', mp.length >= 1 && mp[0].id === 'recWiE008' && mp[0].fields['Matched Import ID'] === 'recWiNEW901', mp);
    await page.context().close();
  }
}

async function scnPresence(browser, origin) {
  const others = [{ user_sub: 'rig_user_b', user_name: 'Χρήστης Β', role: 'dispatcher',
    records: [{ record: 'recWiE003', part: 'export', action: 'date:Loading DateTime', since: '2026-10-06T06:39:40.000Z' }] }];
  let scn = 'presence.live';
  {
    const { page, S } = await openBoard(browser, origin, { presence: true, presenceCfg: { others } });
    await page.waitForTimeout(3500);
    const r = await page.evaluate(([js]) => ({ av: document.querySelectorAll('#content .wi4 .wi4-pres .wi4-av').length,
      t: (document.querySelector('#content .wi4 .wi4-pres') || {}).innerText || '',
      idx: (() => { const row = eval(js)('recWiE003'); const c = row && row.querySelector('.wi4-c-idx'); return c ? { t: c.innerText, title: c.title || (c.querySelector('[title]') || {}).title || '' } : null; })(),
      text: document.querySelector('#content .wi4').innerText }), [ROW_JS]);
    ok(scn, 'avatars + «Χρήστης Β · εδώ τώρα»', r.av >= 1 && /Χρήστης Β/.test(r.t) && /εδώ τώρα/.test(r.t), r);
    ok(scn, 'the initial replaces E003\'s number, tooltip from the whitelist', r.idx && /Χ/.test(r.idx.t) && /αλλάζει την ημερομηνία φόρτωσης/.test(r.idx.title), r.idx);
    ok(scn, 'never «κανείς»', !/κανείς/i.test(r.text));
    const b = S.beats.filter(x => !x.body || !x.body.leave);
    ok(scn, 'beat body: tab id per tab, ttl_ms, board — no name/role in the body', b.length >= 1 && b.every(x => /^[a-z0-9]{8,16}$/.test(x.body.tab) && Number.isInteger(x.body.ttl_ms) && x.body.board === 'weekly_intl' && !('user_name' in x.body) && !('role' in x.body)), b.map(x => x.body));
    ok(scn, 'date panel note, verbatim shape (§e #10)', await openDatePanel(page, 'recWiE003') && /Χρήστης Β έχει ανοιχτή αυτή την ημερομηνία/.test((await panelInfo(page)).pnote) && /θα σου πει ποια μένει/.test((await panelInfo(page)).pnote), await panelInfo(page));
    await page.keyboard.press('Escape');
    // A beat never repaints: popover, focus and scroll survive three beats.
    await openPopover(page, 'recWiE007');
    const before = await page.evaluate(() => { const i = document.querySelector('#wi-popover input'); if (i) i.focus();
      const sc = document.scrollingElement; sc.scrollTop = 200; return { focus: !!i && document.activeElement === i, top: sc.scrollTop, beats: 0 }; });
    const n0 = S.beats.length, reads0 = S.mainReads;
    const t0 = Date.now(); while (S.beats.length < n0 + 3 && Date.now() - t0 < 15000) await page.waitForTimeout(250);
    const after = await page.evaluate(() => { const p = document.getElementById('wi-popover'); const i = document.querySelector('#wi-popover input');
      return { pop: !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim(), focus: !!i && document.activeElement === i, top: document.scrollingElement.scrollTop }; });
    ok(scn, '3 beats later: popover open, focus and scroll unchanged, no re-read', S.beats.length >= n0 + 3 && after.pop && after.focus === before.focus && after.top === before.top && S.mainReads === reads0, { before, after, beats: S.beats.length - n0 });
    const gaps = S.beats.slice(1).map((x, i) => x.at - S.beats[i].at);
    ok(scn, 'never two beats closer than 2.5 s (coalesced)', gaps.every(g => g >= 2400), gaps);
    await page.context().close();
  }
  const quiet = async (mode, check) => {
    const scn = 'presence.' + mode;
    const { page, S } = await openBoard(browser, origin, { presence: true, presenceCfg: { mode } });
    await page.waitForTimeout(6500);
    const r = await page.evaluate(() => ({ cls: (document.querySelector('#content .wi4 .wi4-pres') || { className: '' }).className,
      t: (document.querySelector('#content .wi4 .wi4-pres') || {}).innerText || '', av: document.querySelectorAll('#content .wi4 .wi4-pres .wi4-av').length,
      text: (document.querySelector('#content .wi4') || {}).innerText || '' }));
    await check(scn, r, S, await evs(page, 'expired'));
    ok(scn, 'never «κανείς»', !/κανείς/i.test(r.text));
    await page.context().close();
  };
  await quiet(404, (s, r) => ok(s, '404 → «Ζωντανή εικόνα σε παύση — δεν ξέρουμε ποιος άλλος είναι μέσα»', /paused/.test(r.cls) && /Ζωντανή εικόνα σε παύση/.test(r.t), r));
  await quiet(429, (s, r, S) => ok(s, '429 → not paused (our own pacing), beats continue', !/paused/.test(r.cls) && S.beats.length >= 2, { r, beats: S.beats.length }));
  await quiet(401, (s, r, S, ex) => ok(s, '401 → session expiry once, then no more beats', ex.length === 1 && S.beats.length === 1, { expired: ex.length, beats: S.beats.length }));
  await quiet(403, (s, r, S) => ok(s, '403 → «Η ζωντανή εικόνα δεν είναι διαθέσιμη για τον ρόλο σου», no more beats', /δεν είναι διαθέσιμη για τον ρόλο σου/.test(r.t) && S.beats.length === 1, { r, beats: S.beats.length }));
  await quiet(410, (s, r, S) => ok(s, '410 → stop for the session, nothing drawn', r.av === 0 && !r.t.trim() && S.beats.length === 1, { r, beats: S.beats.length }));
}

async function scnConflict(browser, origin) {
  let scn = 'conflict.date';
  {
    const { page, S } = await openBoard(browser, origin);
    await openDatePanel(page, 'recWiE009');
    // Another user moves the loading between open and save.
    S.db[T.ORDERS].find(r => r.id === 'recWiE009').fields['Loading DateTime'] = '2026-10-07T09:00:00.000Z';
    S.log = [];
    await page.keyboard.press('ArrowRight'); await page.locator('.wi4-datep .wi4-datep-ft .wi4-btn.pri').click();
    await page.waitForTimeout(500); await settle(page, S, 1000);
    const info = await panelInfo(page);
    ok(scn, '409 → «Ποια κρατάμε;» inside the panel; nothing written', !!info && /Ποια κρατάμε|άλλαξε/.test(info.conf) && fld(S, 'recWiE009', 'Loading DateTime') === '2026-10-07T09:00:00.000Z', { info, log: S.log.filter(x => x.k === 'patch') });
    const mine = page.locator('.wi4-datep .wi4-conf button', { hasText: 'Γράψε τη δική μου' });
    ok(scn, 'buttons «Κράτα …» and «Γράψε τη δική μου»', (await mine.count()) === 1 && (await page.locator('.wi4-datep .wi4-conf button', { hasText: 'Κράτα' }).count()) === 1);
    if (await mine.count()) { await mine.click(); await page.waitForTimeout(500); await settle(page, S, 1000); }
    const P = patches(S, 'recWiE009');
    ok(scn, '«Γράψε τη δική μου» resends with _expect = the server\'s current value and writes', P.length === 2 && P[1].status === 200 && WI4.sameValue(P[1].expect['Loading DateTime'], '2026-10-07T09:00:00.000Z', 'Loading DateTime'), P);
    await page.context().close();
  }
  scn = 'conflict.assign';
  {
    const { page, S } = await openBoard(browser, origin);
    await openPopover(page, 'recWiE007');
    const r7 = await rowOf(page, 'recWiE007');
    S.db[T.ORDERS].find(r => r.id === 'recWiE007').fields.Truck = ['recWiT015'];
    S.log = [];
    await setPopoverTruck(page, r7, 'recWiT016', 'TST-1016');
    await page.locator('#wi-popover [onclick*="_wiSaveFromPopover"]').first().click(); await confirmIfAsked(page);
    await page.waitForTimeout(800); await settle(page, S, 1500);
    const r = await page.evaluate(id => ({ dlg: (document.querySelector('.wi4-dlg') || {}).innerText || '',
      pop: (() => { const p = document.getElementById('wi-popover'); return !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim(); })(),
      slot: (document.getElementById('wi-sync-' + id) || {}).textContent || '' }), await rowOf(page, 'recWiE007'));
    ok(scn, '409 → dialog with «Ξανάνοιξε την ανάθεση»; popover closed; slot not ⟳', /Ξανάνοιξε την ανάθεση/.test(r.dlg) && !r.pop && r.slot !== '⟳', r);
    ok(scn, 'table keeps the other user\'s truck; only the first PATCH was tried', link(fld(S, 'recWiE007', 'Truck')) === 'recWiT015' && patches(S, 'recWiE007').length === 1 && patches(S, 'recWiE007')[0].status === 409, patches(S));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(scn, 'Esc = «Κράτα του Χ»: the dialog closes, nothing written', !(await page.evaluate(() => !!document.querySelector('.wi4-dlg'))) && patches(S).length === 1);
    await page.context().close();
  }
  scn = 'conflict.match';
  {
    const { page, S } = await openBoard(browser, origin);
    const r6 = await rowOf(page, 'recWiE006');
    // A concurrent match lands AFTER the board's lock-check read of E006.
    S.onGet.recWiE006 = () => { S.db[T.ORDERS].find(r => r.id === 'recWiE006').fields['Matched Import ID'] = 'recWiI020'; };
    S.log = [];
    await htmlDrag(page, '#wi-imp-recWiI004', `#wi-ci-${r6}`);
    await page.waitForTimeout(800); await settle(page, S, 1500);
    const r = await page.evaluate(([js]) => { const row = eval(js)('recWiE006'); const id = WIV2.rowIdOf('recWiE006');
      return { dlg: (document.querySelector('.wi4-dlg') || {}).innerText || '', cell: (document.getElementById('wi-ci-' + id) || {}).innerText || '',
        slot: (document.getElementById('wi-sync-' + id) || {}).textContent || '', row: !!row }; }, [ROW_JS]);
    ok(scn, '409 → dialog; the import cell does not show I004; slot not ⟳', !!r.dlg && !/REF-I004/.test(r.cell) && r.slot !== '⟳', r);
    ok(scn, 'table: E006 keeps the other match, I004 got nothing', fld(S, 'recWiE006', 'Matched Import ID') === 'recWiI020' && !fld(S, 'recWiI004', 'Truck'), patches(S));
    await page.context().close();
  }
  // No false 409 on our own cascades (§g.4 rig cases).
  scn = 'conflict.own';
  {
    const { page, S } = await openBoard(browser, origin, { triggers: true });
    const no409 = (what) => ok(scn, what + ': no 409', !S.log.some(x => x.status === 409), S.log.filter(x => x.status === 409));
    // (a) assign the export, then its rota leg on the same truck (rt_sync copied it).
    await openPopover(page, 'recWiE023');
    await setPopoverTruck(page, await rowOf(page, 'recWiE023'), 'recWiT016', 'TST-1016');
    await page.locator('#wi-popover [onclick*="_wiSaveFromPopover"]').first().click(); await confirmIfAsked(page); await page.waitForTimeout(500); await settle(page, S, 1500);
    const legRow = await rowOf(page, 'recWiI010');
    await page.evaluate(id => _wiOpenPopover({ currentTarget: document.querySelector('#content .wi4') || document.body, stopPropagation() {}, preventDefault() {} }, id), legRow);
    await page.waitForTimeout(300);
    await setPopoverTruck(page, legRow, 'recWiT016', 'TST-1016');
    await page.evaluate(id => { window.__p = _wiSaveFromPopover(id); }, legRow); await confirmIfAsked(page); await page.evaluate(() => window.__p); await settle(page, S, 1500);
    no409('assign → assign on a rota leg of the same RT');
    // (b) cancel a groupage member, then assign that member.
    await page.evaluate(id => { window.__p = _wiCancelGroupMember(id, 'recWiE013', false); }, await rowOf(page, 'recWiE011'));
    await confirmIfAsked(page, 4000); await page.evaluate(() => window.__p); await settle(page, S, 1500);
    const r13 = await rowOf(page, 'recWiE013');
    await page.evaluate(id => _wiOpenPopover({ currentTarget: document.querySelector('#content .wi4') || document.body, stopPropagation() {}, preventDefault() {} }, id), r13);
    await page.waitForTimeout(300); await setPopoverTruck(page, r13, 'recWiT009', 'TST-1009');
    await page.evaluate(id => { window.__p = _wiSaveFromPopover(id); }, r13); await confirmIfAsked(page); await page.evaluate(() => window.__p); await settle(page, S, 1500);
    no409('cancel-member → assign that member');
    // (c) match, then edit the matched import from its own popover.
    await htmlDrag(page, '#wi-imp-recWiI004', `#wi-ci-${await rowOf(page, 'recWiE006')}`); await page.waitForTimeout(300); await settle(page, S, 1500);
    const ri4 = await rowOf(page, 'recWiI004');   // the matched import's own row
    await page.evaluate(id => _wiOpenImpPopover({ currentTarget: document.querySelector('#content .wi4') || document.body, stopPropagation() {}, preventDefault() {} }, 'recWiI004', id), ri4);
    await page.waitForTimeout(300); await setPopoverTruck(page, ri4, 'recWiT006', 'TST-1006');
    await page.evaluate(id => { window.__p = _wiSaveFromPopover(id); }, ri4); await confirmIfAsked(page); await page.evaluate(() => window.__p); await settle(page, S, 1500);
    no409('edit the matched import after a match');
    // (d) Loading change (028 cascades VS CD Date), then a VS CD change.
    await openDatePanel(page, 'recWiE014'); await page.keyboard.press('ArrowRight');
    await page.locator('.wi4-datep .wi4-datep-ft .wi4-btn.pri').click(); await page.waitForTimeout(300); await settle(page, S, 1500);
    await openDatePanel(page, 'recWiE014');
    await page.locator('.wi4-datep .wi4-seg button', { hasText: 'Βέροια' }).click(); await page.keyboard.press('ArrowRight');
    await page.locator('.wi4-datep .wi4-datep-ft .wi4-btn.pri').click(); await page.waitForTimeout(300); await settle(page, S, 1500);
    no409('VS CD change after a Loading change that 028 cascaded');
    ok(scn, 'the writes happened (not a vacuous pass)', patches(S).filter(p => p.status === 200).length >= 4, patches(S).map(p => [p.id, p.status]));
    await page.context().close();
  }
  scn = 'conflict.notLive';
  {
    const { page, S } = await openBoard(browser, origin, { expectLive: false });
    await openDatePanel(page, 'recWiE009'); await page.keyboard.press('ArrowRight');
    await page.locator('.wi4-datep .wi4-datep-ft .wi4-btn.pri').click(); await page.waitForTimeout(300); await settle(page, S, 1500);
    ok(scn, 'a 2xx without _expectChecked sets TMS_EXPECT_LIVE = false', await page.evaluate(() => window.TMS_EXPECT_LIVE === false));
    const view = page.locator('#content .wi4 .wi4-btn', { hasText: 'Προβολή' });
    if (await view.count()) { await view.first().click(); await page.waitForTimeout(300); }
    ok(scn, '«Προβολή ▾» says «ο έλεγχος "το άλλαξε άλλος" δεν είναι ενεργός ακόμη»', await page.evaluate(() => /ο έλεγχος .το άλλαξε άλλος. δεν είναι ενεργός ακόμη/.test(document.body.innerText)));
    await page.context().close();
  }
}

async function scnFallback(browser, origin) {
  const scn = 'fallback';
  const { page, S } = await openBoard(browser, origin);
  // Force the v4 paint to throw: every WI4 function throws from now on. If v4
  // captured WI4 at load, the forcing has no effect and the first check says so.
  const r = await page.evaluate(async () => {
    const real = window.WI4;
    window.WI4 = new Proxy(real, { get(t, k) { const v = t[k]; return typeof v === 'function' ? () => { throw new Error('rig: forced paint failure'); } : v; } });
    const le0 = window.__ev.filter(e => e.k === 'logError').length;
    _wiPaint();
    await new Promise(r => setTimeout(r, 300));
    const one = { broken: WIV2._broken === true, active: WIV2.active(), v1: !!document.querySelector('#content .wk3.wi2'), v4: !!document.querySelector('#content .wi4'),
      banners: (document.body.innerText.match(/Η νέα προβολή απέτυχε/g) || []).length, le: window.__ev.filter(e => e.k === 'logError').length - le0 };
    _wiPaint(); await new Promise(r => setTimeout(r, 300));
    one.banners2 = (document.body.innerText.match(/Η νέα προβολή απέτυχε/g) || []).length;
    one.le2 = window.__ev.filter(e => e.k === 'logError').length - le0;
    window.WI4 = real;
    return one;
  });
  ok(scn, 'the forced failure took effect (v4 paint threw)', r.broken, r);
  ok(scn, 'old board painted instead; _broken sticky; active() false', r.v1 && !r.v4 && r.broken && r.active === false, r);
  ok(scn, 'the banner once, one logError — also after a second paint', r.banners === 1 && r.banners2 === 1 && r.le === 1 && r.le2 === 1, r);
  await neutral(page);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(scn, 'no v4 hook or listener acts afterwards', await page.evaluate(() => !document.querySelector('.wi4-focus') && (document.getElementById('wi-ctx') || {}).style.display !== 'block' && !document.querySelector('.wi4-datep')));
  ok(scn, 'nothing written', !writes(S).length, writes(S));
  await page.context().close();
}

// §c.3: overlays live outside .wi4; the .wk3.wi2-scoped rules do not reach
// them in v4. Same opener on both boards, computed styles compared.
async function scnStyles(browser, origin) {
  const PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'color', 'backgroundColor', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderBottomWidth', 'borderBottomColor'];
  const cap = (page, rootSel) => page.evaluate(([sel, props]) => {
    const root = document.querySelector(sel); if (!root) return null;
    const out = {}; const walk = (el, p) => { [...el.children].forEach((c, i) => { const k = p + '/' + c.tagName + i; const s = getComputedStyle(c);
      out[k] = props.map(x => s[x]).join('|'); walk(c, k); }); };
    walk(root, ''); return out;
  }, [rootSel, PROPS]);
  const menuStyles = page => page.evaluate(props => Object.fromEntries([...document.querySelectorAll('#wi-ctx .wi-ctx-i[onclick]')].map(b => {
    const s = getComputedStyle(b); return [b.getAttribute('onclick'), props.map(x => s[x]).join('|')]; })), PROPS);
  const caps = {};
  for (const flag of ['off', 'on']) {
    const { page } = await openBoard(browser, origin, { flag });
    const C = caps[flag] = {};
    const r7 = await rowOf(page, 'recWiE007');
    const ev = `({currentTarget:document.getElementById('wi-row-${r7}')||document.body,target:document.body,stopPropagation(){},preventDefault(){},clientX:400,clientY:300})`;
    await page.evaluate(e => _wiOpenPopover((0, eval)(e), WINTL.rows.find(x => (x.orderIds || []).includes('recWiE007')).id), ev); await page.waitForTimeout(300);
    C.popover = await cap(page, '#wi-popover');
    await page.evaluate(() => _wiClosePopover());
    if (flag === 'off') await page.evaluate(e => _wiCtx((0, eval)(e), WINTL.rows.find(x => (x.orderIds || []).includes('recWiE001')).id), ev);
    else await openMenu(page, 'recWiE001');
    await page.waitForTimeout(250);
    C.menu = await menuStyles(page);
    await page.evaluate(() => _wiCtxClose());
    const r23 = await rowOf(page, 'recWiE023'), r24 = await rowOf(page, 'recWiE024'), r14 = await rowOf(page, 'recWiI014');
    for (const h of [`_wiPanelGroupBuild(${r7},false)`, `_wiPanelGroupBuild(${r14},true)`, `_wiPanelRota(${r23})`, `_wiPanelJoinLoad(${r24})`]) {
      await page.evaluate(x => { try { (0, eval)(x); } catch (e) { /* the twin decides */ } }, h); await page.waitForTimeout(350);
      C['panel ' + h] = await cap(page, '#wi-panel');
      await page.evaluate(() => { if (typeof _wiPanelClose === 'function') _wiPanelClose(); }); await page.waitForTimeout(150);
    }
    await page.context().close();
  }
  for (const k of Object.keys(caps.off)) {
    const a = caps.off[k] || {}, b = caps.on[k] || {};
    const keys = Object.keys(a).filter(x => x in b);
    const diff = keys.filter(x => a[x] !== b[x]).map(x => `${x}: v1 ${a[x]} ≠ v4 ${b[x]}`);
    ok('styles', `${k}: computed styles v4 = v1 (${keys.length} nodes compared)`, keys.length > 0 && !diff.length, diff.slice(0, 8));
  }
}

(async () => {
  const srv = await serve();
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  let notReady = null, ranV4 = false;
  try {
    if (on('v1')) await scnV1(browser, origin);
    if (want.length === 1 && want[0] === 'v1') return;
    // Preflight: v4 must activate with the flag 'on'. Until WP4/WP5 are
    // integrated, modules/weekly_intl_v2.js is the WP0 placeholder and nothing
    // below can run — say so instead of reporting a page of red.
    {
      const res = await openBoard(browser, origin).catch(e => ({ err: e }));
      const page = res.page;
      if (!page) notReady = 'the board did not load: ' + String(res.err && res.err.message || res.err);
      else {
        const st = await page.evaluate(() => ({ flag: typeof FEATURES !== 'undefined' ? FEATURES.WI_V2 : null, placeholder: !!(window.WIV2 && WIV2.__wi4Placeholder), active: !!(window.WIV2 && WIV2.active && WIV2.active()),
          root: !!document.querySelector('#content .wi4'), actions: !!(window.WI4Actions && !WI4Actions.__wi4Placeholder) }));
        if (st.flag !== 'on') throw new Error('the in-memory config.js rewrite did not take: FEATURES.WI_V2 = ' + st.flag);
        if (st.placeholder || !st.active || !st.root || !st.actions) notReady = JSON.stringify(st);
        await page.context().close();
      }
    }
    if (notReady) return;
    ranV4 = true;
    const S = { paint: scnPaint, invariants: scnInvariants, scans: scnScans, unknown: scnUnknown, drops: scnDrops, join: scnJoin, menu: scnMenu,
      date: scnDate, keys: scnKeys, search: scnSearch, savefail: scnSaveFail, presence: scnPresence, conflict: scnConflict, fallback: scnFallback, styles: scnStyles };
    for (const [name, fn] of Object.entries(S)) {
      if (!on(name)) continue;
      try { await fn(browser, origin); } catch (e) { ok(name, 'scenario ran to the end', false, String(e && e.stack || e).slice(0, 600)); }
    }
  } finally {
    await browser.close(); srv.close();
    if (notReady) {
      console.log(`\nNOT READY: v4 did not activate with FEATURES.WI_V2='on' (${notReady}).\nThis rig runs after WP4 (modules/weekly_intl_v2.js) and WP5 (modules/wi4_actions.js) are integrated on feat/wi-v4. Not a pass.`);
      process.exit(3);
    }
    // Never a v4 GO for a run that did not reach v4 (scenario v1 alone).
    console.log(fails ? `\nNO-GO: ${fails} check(s) failed` : ranV4 ? '\nGO: the v4 board holds on the synthetic week' : '\nGO (v1 only): the synthetic week paints on today\'s board — v4 not exercised');
    process.exit(fails ? 1 : 0);
  }
})().catch(e => { console.error(e); process.exit(1); });
