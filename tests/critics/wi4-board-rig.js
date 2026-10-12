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
// here. Clock frozen at Tue 6/10/2026 09:40 Athens (W41; presence scenarios
// start there and let it flow, see openBoard), role dispatcher,
// 1920×1080 with the sidebar collapsed.
//
// Usage (Playwright: cwd = the main repo, which has node_modules; a worktree
// has none — memory note «Κριτές από worktree»):
//   node <tree>/tests/critics/wi4-board-rig.js --check-fixture
//   [WI4_TREE=<tree to serve>] node <tree>/tests/critics/wi4-board-rig.js [scenario…] [--shots <dir>]
// WI4_TREE defaults to the tree this file lives in; the rig serves it itself.
// Scenarios: v1 · paint · invariants · relay · scans · unknown · drops · join · menu ·
//   date · keys · search · savefail · presence · conflict · fallback · styles ·
//   twins (unmatch, rota, split, stock piece, dissolve, member out, groupage
//   build, local relay, new import: v1 = v4 writes) ·
//   queue (card buttons after a row-id shift, Q, Print / WhatsApp) ·
//   fix round 3: print (view role, share menu) · shift (a save fails across a
//   re-read) · late (relays empty / national while a popover is open) ·
//   offline · quiet (a group member fails) · natmissing · w1440 ·
//   vs (WP-A of the Weekly National v4 plan: one Veroia day — assignment,
//   form, drop order by place, loud failures, Pallet Exchange)
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
      hasReturn: !!f['Matched Import ID'], pallets: f['Total Pallets'],
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
function initScript(role) {
  const r = role || 'dispatcher';   // a demo_* roster user (config.js) — the tamper guard knows it
  localStorage.setItem('tms_user', JSON.stringify({ name: 'Rig', role: r, username: 'demo_' + r,
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
//   flag 'on'|'off' · presence bool · fail {patch:{rec:500}, get:{rec:500}, nl, relay, crossWeek, stock}
//   hold {nl, relay} · expectLive (default true) · triggers (rt_sync / 028 emulation)
//   role (default 'dispatcher') · viewport (default 1920×1080)
//   vs (WP-A: the base after 069_hub_day_once — 028 moves the cross-dock once,
//       order_cd_stop_follow, ramp_follows_stop; see runVsTriggers)
async function openBoard(browser, origin, opts = {}) {
  const flag = opts.flag || 'on';
  const ctx = await browser.newContext({ baseURL: origin + '/', viewport: opts.viewport || { width: 1920, height: 1080 },
    serviceWorkers: 'block', timezoneId: 'Europe/Athens', locale: 'el-GR' });
  const page = await ctx.newPage();
  // Presence paces beats on Date.now() (never two closer than 2.5 s). A fixed
  // clock makes that gap never elapse, so only the first beat would ever leave;
  // presence scenarios start at the same instant and let the clock flow.
  if (opts.presence) await page.clock.setSystemTime(new Date(FIX._meta.now));
  else await page.clock.setFixedTime(new Date(FIX._meta.now));
  const db = clone(FIX.tables);
  if (typeof opts.mutate === 'function') opts.mutate(db);   // a scenario's own variant of the week
  const S = { db, log: [], inflight: 0, held: [], heldRelay: [], pageErrors: [], unknown: new Set(), mainReads: 0, beats: [],
    fail: Object.assign({ patch: {}, get: {} }, opts.fail || {}), hold: Object.assign({}, opts.hold || {}),
    expectLive: opts.expectLive !== false, triggers: !!opts.triggers, vs: !!opts.vs, gets: [], onGet: {}, delay: {}, seq: 0, ready: false, readyWaiters: [],
    presence: Object.assign({ mode: 200, others: [], changes: { n: 0, last_by: null, last_at: null, auto_n: 0 }, next_ms: 2500 }, opts.presenceCfg || {}) };
  page.on('pageerror', e => S.pageErrors.push(String(e).slice(0, 300)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(initScript, opts.role || 'dispatcher');
  await page.route(u => !u.href.startsWith(origin) && !u.href.includes(HOST), route => route.abort());
  // The flag lives in config.js; it is rewritten in memory, never on disk.
  await page.route(u => u.href.startsWith(origin) && new URL(u.href).pathname === '/config.js', async route => {
    const r = await route.fetch(); let body = await r.text();
    const sub = (re, to) => { if (!re.test(body)) throw new Error('config.js changed: the rig cannot find ' + re); body = body.replace(re, to); };
    sub(/WI_V2:\s*'(?:off|pilot|on)'/, `WI_V2: '${flag}'`);
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
    if (S.hold.relay && tid === T.LOCAL_MOVES) await new Promise(r => S.heldRelay.push(r));
    // The first beat leaves at the first v4 paint, before instrument() has
    // replaced tmsSessionExpired: a 401 answered then runs the real one and
    // sends the rig to the login page, so the board never settles. Beats are
    // held until the page is instrumented, outside `inflight` like held reads.
    if (u.pathname === '/presence') {
      if (!S.ready) await new Promise(r => S.readyWaiters.push(r));
      return presence(route, S, body, json);
    }
    S.inflight++;
    try {
      if (!mm) return json(route, m === 'GET' ? { records: [] } : { ok: true });
      const tbl = db[tid] || (db[tid] = []);
      if (m === 'GET') {
        const want = u.searchParams.getAll('fields[]');
        S.gets.push({ tid, rid, f, fields: want });
        const ans = readTable(S, tid, rid, f, tbl);
        // Scenario vs: a list read with fields[] answers ONLY those labels, as the
        // Worker's select does. The Weekly International assignment asked for a
        // list WITHOUT the cross-dock: a fake that answered every field hid it.
        if (S.vs && want.length && ans[0] && Array.isArray(ans[0].records))
          ans[0].records.forEach(r => { r.fields = Object.fromEntries(Object.entries(r.fields).filter(([k]) => want.includes(k))); });
        return json(route, ...ans);
      }
      if (m === 'PATCH' && rid) return await patchRecord(route, S, tid, rid, body, tbl, json);
      if (m === 'PATCH' && body && Array.isArray(body.records)) return patchBatch(route, S, tid, body, tbl, json);
      if (m === 'POST') {
        if (S.fail.natStops && tid === T.ORDER_STOPS && body && Array.isArray(body.records) && body.records.some(x => x && x.fields && x.fields['Parent Nat Load'])) {
          S.log.push({ k: 'post', tid, id: null, fields: clone(body.records), status: 500 });
          return json(route, { error: { type: 'SERVER_ERROR', message: 'rig: forced national stops failure' } }, 500);
        }
        const make = (fields) => {
          const id = 'recWiNEW' + String(++S.seq).padStart(3, '0');
          const rec = { id, fields: Object.assign({}, canonWrite(tid, fields || {})) };
          tbl.push(rec); S.log.push({ k: 'post', tid, id, fields: rec.fields });
          // The Worker serves an order's «ORDER STOPS» as the reverse link of
          // the stops' «Parent Order» (stopsLoad reads it back that way).
          if (tid === T.ORDER_STOPS && link(rec.fields['Parent Order'])) {
            const o = (S.db[T.ORDERS] || []).find(x => x.id === link(rec.fields['Parent Order']));
            if (o) o.fields['ORDER STOPS'] = [].concat(o.fields['ORDER STOPS'] || [], [id]);
          }
          return clone(rec);
        };
        // The batch shape {records:[{fields}]} (atCreateBatch — e.g. a split's
        // stops): one record per entry, answered as {records}, as the Worker does.
        if (body && Array.isArray(body.records)) return json(route, { records: body.records.map(x => make(x && x.fields)) });
        return json(route, make(body && body.fields));
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
  S.ready = true; S.readyWaiters.splice(0).forEach(r => r());
  return { page, S };
}

function readTable(S, tid, rid, f, tbl) {
  if (rid) {
    if (S.fail.get && S.fail.get[rid]) return [{ error: { type: 'SERVER_ERROR', message: 'rig: forced read failure' } }, S.fail.get[rid]];
    const r = tbl.find(x => x.id === rid);
    const out = r ? [clone(r)] : [{ error: { type: 'NOT_FOUND' } }, 404];
    // The Worker serves a national load's «ORDER STOPS» as the reverse link of
    // its stops' «Parent Nat Load» (TABLES reverseLinks) — computed, never stored.
    if (r && tid === T.NAT_LOADS) out[0].fields['ORDER STOPS'] = (S.db[T.ORDER_STOPS] || []).filter(s => link(s.fields['Parent Nat Load']) === rid).map(s => s.id);
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
    // {Source Record}="rec…": the Worker's alias filters the load's source order
    // (aliases + linkAliases). Answering every load here made a VS sync patch
    // the FIRST national load of the week, whatever order it was for.
    if (tid === T.NAT_LOADS && (g = f.match(/^\{Source Record\}="(rec[A-Za-z0-9]+)"$/))) return [{ records: clone(tbl.filter(r => link(r.fields['Source Order']) === g[1] || r.fields['Source Record'] === g[1])) }];
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
  applyFields(r.fields, canonWrite(tid, fields));
  if (S.triggers) runTriggers(S, r, before);
  if (S.vs) runVsTriggers(S, tid, r, before);
  entry.status = 200;
  const res = clone(r);
  if (body && body._expect && S.expectLive) res._expectChecked = true;
  return json(route, res);
}
// What the Worker stores for a label (WP-A): «Cross-dock Date» and «VS CD Date»
// write the SAME column and a read answers it ONLY as «VS CD Date» (the last
// label of the column wins in columnToLabel). A fake that echoed the written
// label back would hide exactly the trap core/vs-dates.js cdOf exists for.
// «Source Record» on a national load is a write alias of the «Source Order» link.
function canonWrite(tid, fields) {
  const out = Object.assign({}, fields || {});
  if (tid === T.ORDERS && 'Cross-dock Date' in out) {
    if (!('VS CD Date' in out)) out['VS CD Date'] = out['Cross-dock Date'];
    delete out['Cross-dock Date'];
  }
  if (tid === T.NAT_LOADS && 'Source Record' in out) {
    out['Source Order'] = out['Source Record'] ? [out['Source Record']] : [];
    delete out['Source Record'];
  }
  return out;
}
// Batch PATCH {records:[{id, fields}]} (atPatchBatch — e.g. stopsSave), answered
// {records} as the Worker does; each row goes through the same triggers.
function patchBatch(route, S, tid, body, tbl, json) {
  const natStop = (id) => { const r = tbl.find(x => x.id === id); return r && link(r.fields['Parent Nat Load']); };
  if (S.fail.natStops && tid === T.ORDER_STOPS && body.records.some(x => x && natStop(x.id))) {
    S.log.push({ k: 'patchBatch', tid, id: null, fields: clone(body.records), status: 500 });
    return json(route, { error: { type: 'SERVER_ERROR', message: 'rig: forced national stops failure' } }, 500);
  }
  const out = [];
  for (const x of body.records) {
    const r = tbl.find(y => y.id === x.id);
    S.log.push({ k: 'patch', tid, id: x.id, fields: clone(x.fields || {}), batch: true, status: r ? 200 : 404 });
    if (!r) continue;
    const before = clone(r.fields);
    applyFields(r.fields, canonWrite(tid, x.fields));
    if (S.vs) runVsTriggers(S, tid, r, before);
    out.push(clone(r));
  }
  return json(route, { records: out });
}
// The base after 069_hub_day_once (WP-A), for scenario `vs` only:
//  · 028: an order's loading/delivery moving by Δ days moves its stops of that
//    side (the Cross-dock stop only while the cross-dock is EMPTY), its
//    cross-dock by Δ ONCE (not when the same write set it), and its Pending
//    Direct national load with that load's stops;
//  · order_cd_stop_follow: the order's Cross-dock stop = a dated cross-dock;
//  · ramp_follows_stop: a stop's Planned, not postponed Ramp line of its OLD day
//    follows it; never two lines of one stop on one day.
// The SQL itself is proven by 069_hub_day_once_test.sql; this mirrors it so the
// browser's writes meet the base they will meet in production.
const RAMP_T = 'tblT8W5WcuToBQNiY';
const dayOf = (v) => (!v ? null : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : athensDay(v));
const shiftDay = (d, n) => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)); return t.toISOString().slice(0, 10); };
const shiftIso = (v, n) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? shiftDay(v, n) : new Date(Date.parse(v) + n * 86400000).toISOString());
const dDays = (a, b) => (dayOf(a) && dayOf(b) ? Math.round((Date.parse(dayOf(b)) - Date.parse(dayOf(a))) / 86400000) : 0);
function vsRampFollow(S, stopId, oldDay, newDay) {
  if (!oldDay || !newDay || oldDay === newDay) return;
  const ramp = S.db[RAMP_T] || [];
  const mine = ramp.filter(x => x.fields.Notes === 'STOP:' + stopId && !x.fields._deleted);
  const old = mine.filter(x => x.fields.Status === 'Planned' && !x.fields['Postponed To'] && dayOf(x.fields['Plan Date']) === oldDay);
  if (!old.length) return;
  let keep = mine.find(x => dayOf(x.fields['Plan Date']) === newDay);
  if (!keep) { keep = old[0]; keep.fields['Plan Date'] = newDay; S.log.push({ k: 'trigger', name: 'ramp_follows_stop', id: keep.id, to: newDay }); }
  old.filter(x => x !== keep).forEach(x => { x.fields._deleted = true; S.log.push({ k: 'trigger', name: 'ramp_follows_stop', id: x.id, deleted: true }); });
}
function vsMoveStop(S, s, n) {
  const was = dayOf(s.fields.DateTime);
  s.fields.DateTime = shiftIso(s.fields.DateTime, n);
  vsRampFollow(S, s.id, was, dayOf(s.fields.DateTime));
}
function vsCdStopFollow(S, oid, cd) {
  (S.db[T.ORDER_STOPS] || []).filter(s => link(s.fields['Parent Order']) === oid && s.fields['Stop Type'] === 'Cross-dock').forEach(s => {
    const was = dayOf(s.fields.DateTime);
    if (was === cd) return;
    s.fields.DateTime = cd;
    S.log.push({ k: 'trigger', name: 'order_cd_stop_follow', id: s.id, to: cd });
    vsRampFollow(S, s.id, was, cd);
  });
}
function runVsTriggers(S, tid, r, before) {
  const f = r.fields;
  if (tid === T.ORDER_STOPS) { vsRampFollow(S, r.id, dayOf(before.DateTime), dayOf(f.DateTime)); return; }
  if (tid !== T.ORDERS) return;
  const cd0 = before['VS CD Date'] || null, cd1 = f['VS CD Date'] || null;
  if (cd1 && dayOf(cd1) !== dayOf(cd0)) vsCdStopFollow(S, r.id, dayOf(cd1));   // order_cd_stop_follow fires first (name order)
  const dl = before['Loading DateTime'] && f['Loading DateTime'] ? dDays(before['Loading DateTime'], f['Loading DateTime']) : 0;
  const dd = before['Delivery DateTime'] && f['Delivery DateTime'] ? dDays(before['Delivery DateTime'], f['Delivery DateTime']) : 0;
  if (!dl && !dd) return;
  const dcd = f.Direction === 'Export' ? dl : dd;
  (S.db[T.ORDER_STOPS] || []).filter(s => link(s.fields['Parent Order']) === r.id && s.fields.DateTime).forEach(s => {
    const t = s.fields['Stop Type'];
    const n = t === 'Loading' ? dl : t === 'Unloading' ? dd : (cd1 ? 0 : dcd);
    if (n) vsMoveStop(S, s, n);
  });
  if (dcd && cd1 && dayOf(cd1) === dayOf(cd0)) {
    f['VS CD Date'] = shiftDay(dayOf(cd1), dcd);
    S.log.push({ k: 'trigger', name: '028 cross-dock', id: r.id, to: f['VS CD Date'] });
    vsCdStopFollow(S, r.id, f['VS CD Date']);
  }
  if (dcd && f['Veroia Switch']) (S.db[T.NAT_LOADS] || []).filter(nl => link(nl.fields['Source Order']) === r.id && nl.fields['Source Type'] === 'Direct' && nl.fields.Status === 'Pending').forEach(nl => {
    ['Loading DateTime', 'Delivery DateTime'].forEach(k => { if (nl.fields[k]) nl.fields[k] = shiftIso(nl.fields[k], dcd); });
    S.log.push({ k: 'trigger', name: '028 national load', id: nl.id, by: dcd });
    (S.db[T.ORDER_STOPS] || []).filter(s => link(s.fields['Parent Nat Load']) === nl.id && s.fields.DateTime).forEach(s => vsMoveStop(S, s, dcd));
  });
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
    const busy = S.inflight > 0 || !(await page.evaluate(([held, heldRelay]) => !!window.WINTL && WINTL.relay && (heldRelay || WINTL.relay.state !== 'loading')
      && !(WINTL.data.stock && WINTL.data.stock.status === 'loading') && (held || WINTL.data.nlState !== 'loading'), [!!S.hold.nl, !!S.hold.relay]).catch(() => false));
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
  // Rules «Άνοιγμα»: the first red day is Saturday, the FIRST day card — the
  // top of the board already. The title bar, the week tabs and the ΕΠΟΜΕΝΑ
  // band stay in view (review 11/10: it scrolled 166px and hid them all).
  const open = await page.evaluate(() => {
    // The board's scroller, found as v4 finds it (WIV2 _scroller).
    const sc = (() => { let el = document.querySelector('#content .wi4'); while (el && el !== document.body) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) return el; el = el.parentElement; } return document.scrollingElement; })();
    const q = document.querySelector('#content .wi4 .wi4-q').getBoundingClientRect();
    const t = document.getElementById('wi4-tabs').getBoundingClientRect();
    const b = document.querySelector('.wi4-bar').getBoundingClientRect();
    return { top: sc.scrollTop, qTop: q.top, qBottom: q.bottom, tabs: t.left + t.width / 2, bar: b.left + b.width / 2, h: innerHeight,
      first: (document.querySelector('#content .wi4 #wi-rows .wi4-day') || {}).dataset.day };
  });
  ok(scn, 'first paint: the first red day is the first card → no scroll; bar and ΕΠΟΜΕΝΑ band in view', open.first === '2026-10-03' && open.top === 0 && open.qTop >= 0 && open.qBottom <= open.h, open);
  ok(scn, 'the week tabs sit in the centre of the bar (their own grid track)', Math.abs(open.tabs - open.bar) <= 1.5, open);
  // Line 2 = the place, from the LOCATIONS label «Όνομα, Πόλη, Χώρα» the
  // board reads in production (Greek country names): «Veria», «Berlin, DE» —
  // a single stop keeps the comma as Figma writes it (1097:2668 «Veverská
  // Bitýška, CZ», parity r2); «Kecskemét HU 6π» is Figma's multi-stop line —
  // «χώρα μόνο εκτός GR» (rules 958:747). Every single point whose column has
  // room for a place shows one (the fixture's locations all have a city).
  const l2 = await page.evaluate(([js]) => {
    const row = eval(js);
    const empty = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-row .wi4-pts:not(.wi4-noplace) > .wi4-pt')]
      .filter(p => !p.querySelector('.wi4-pt-n') && !((p.querySelector('.wi4-l2') || {}).textContent || '').trim()).map(p => p.textContent.trim().slice(0, 40));
    const t = (oid, side) => { const r = row(oid); const e = r && r.querySelector('.wi4-c-exp .wi4-l-' + side + ' .wi4-l2'); return e ? e.textContent.trim() : null; };
    return { empty, e1from: t('recWiE001', 'from'), e1to: t('recWiE001', 'to'), shown: document.querySelectorAll('#content .wi4 #wi-rows .wi4-pts:not(.wi4-noplace) .wi4-l2').length };
  }, [ROW_JS]);
  ok(scn, 'line 2 shows the place on every single point with room (production label format)', !l2.empty.length && l2.shown > 20, l2);
  ok(scn, '«χώρα μόνο εκτός GR»: E001 loads at «Veria» (no GR), delivers to «Berlin, DE» (one stop: comma, Figma 1097:2668)', /Veria$/.test(l2.e1from || '') && !/GR/.test(l2.e1from || '') && /^Berlin, DE$/.test(l2.e1to || ''), l2);
  // Line 2 of a groupage member keeps its pallets whole: the PLACE is cut,
  // never «· 10π» (review 11/10: «Milan, IT…», «Zagreb, …»).
  const palCut = await page.evaluate(() => [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-pts:not(.wi4-noplace) .wi4-l2f.wi4-l2p')]
    .map(l => { const pal = l.querySelector('.wi4-pt-pal'); return pal && (pal.scrollWidth > pal.clientWidth + 1 || pal.getBoundingClientRect().right > l.getBoundingClientRect().right + 1) ? l.title : null; }).filter(Boolean));
  const palN = await page.evaluate(() => document.querySelectorAll('#content .wi4 #wi-rows .wi4-pt-pal').length);
  ok(scn, 'point line 2: the pallets are never cut (the place gives way)', palN > 3 && !palCut.length, { palN, palCut });
  // The stock strip starts at the board's left edge, chips in «π» (sheet 15).
  const sh = await page.evaluate(() => {
    const lbl = document.querySelector('#content .wi4 .wi-shelf-lbl'), srch = document.querySelector('#content .wi4 .wi4-search');
    const chips = [...document.querySelectorAll('#content .wi4 .wi-shelf-chip')].map(c => c.textContent);
    return { lbl: lbl ? Math.round(lbl.getBoundingClientRect().left) : null, search: srch ? Math.round(srch.getBoundingClientRect().left) : null, chips };
  });
  ok(scn, 'ΑΠΟΘΕΜΑ at the left edge (search box x ±4px); chips read «N/Mπ», never «p»', sh.lbl != null && Math.abs(sh.lbl - sh.search) <= 4 && sh.chips.length > 0 && sh.chips.every(c => /\d+\/\d+π/.test(c) && !/\d+\/\d+p/.test(c)), sh);
  // ΑΠΟ ΒΕΡΟΙΑ: day label and tile 8px inside the day card's border.
  const fr = await page.evaluate(() => [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-row .wi4-c-fr .wi4-nat')].map(n => {
    const row = n.closest('.wi4-row').getBoundingClientRect(); const d = n.querySelector('.wi4-nat-day'); const r = (d || n).getBoundingClientRect();
    return Math.round(row.right - r.right); }));
  ok(scn, 'ΑΠΟ ΒΕΡΟΙΑ keeps ≥7px from the card border (day label never cut)', fr.length > 0 && fr.every(g => g >= 7), fr);
  const g = await page.evaluate(() => {
    const cols = document.querySelector('#content .wi4 .wi4-cols');
    const tracks = cols ? getComputedStyle(cols).gridTemplateColumns.split(' ').map(parseFloat) : [];
    const h = sel => [...document.querySelectorAll('#content .wi4 ' + sel)].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height * 10) / 10);
    const cs = sel => { const e = document.querySelector('#content .wi4 ' + sel); if (!e) return null; const s = getComputedStyle(e); return { fam: s.fontFamily, size: s.fontSize, w: s.fontWeight }; };
    return { tracks, row: h('.wi4-row'), sub: h('.wi4-subrow'),
      l1: cs('#wi-rows .wi4-l1'), l2: cs('#wi-rows .wi4-l2'), dayh: cs('.wi4-dayh'), colh: cs('.wi4-cols'), plate: cs('.wi4-plate'),
      rowsText: [...document.querySelectorAll('#content .wi4 .wi4-row')].map(e => e.innerText).join('\n') };
  });
  const W = [32, 140, 621, 204, 621, 140], at = [0, 1, 3, 5, 7, 9];
  ok(scn, 'grid at 1920 (sidebar collapsed): 32/140/621/204/621/140 ±1px', g.tracks.length === 10 && at.every((i, k) => Math.abs(g.tracks[i] - W[k]) <= 1), g.tracks);
  ok(scn, 'rows 32px', g.row.length > 10 && g.row.every(x => Math.abs(x - 32) <= 0.5), [...new Set(g.row)]);
  // Per-kind heights (Figma 1097:2830 relay 24, 1097:3046 rota 32, 1097:3388
  // split header 22): one 28px for all of them read as one more row.
  ok(scn, 'sub-rows are a relay (24) or a rota leg (32), never the old 28px', g.sub.length > 0 && g.sub.every(x => Math.abs(x - 24) <= 0.5 || Math.abs(x - 32) <= 0.5), [...new Set(g.sub)]);
  const sk = await page.evaluate(() => {
    const h = sel => [...document.querySelectorAll('#content .wi4 ' + sel)].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height * 10) / 10);
    const owners = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-row')].filter(r => r.nextElementSibling && r.nextElementSibling.classList.contains('wi4-subrow'));
    const conn = [...document.querySelectorAll('#content .wi4 .wi4-row > .wi4-c-idx')].filter(c => c.dataset.no === '↳1' || c.dataset.no === '↳2')
      .map(c => { const a = getComputedStyle(c, '::after'); return { no: c.dataset.no, on: a.content !== 'none' && a.borderLeftWidth === '1px', h: Math.round(parseFloat(a.height)) }; });
    return { relay: h('.wi4-subrow.wi4-sub-rl'), relayAttr: document.querySelectorAll('#content .wi4 .wi4-subrow[data-relay]:not(.wi4-sub-rl)').length,
      leg: h('.wi4-subrow.wi4-sub-leg'), split: h('.wi4-splithd'), owners: owners.map(r => getComputedStyle(r).borderBottomStyle), conn };
  });
  const each = (a, v) => a.length > 0 && a.every(x => Math.abs(x - v) <= 0.5);
  ok(scn, 'relay sub-rows 24px, rota legs 32px, split headers 22px (each kind present)', each(sk.relay, 24) && !sk.relayAttr && each(sk.leg, 32) && each(sk.split, 22), sk);
  ok(scn, 'a row followed by its sub-row ends on a dashed hairline (Figma 1097:2781)', sk.owners.length > 0 && sk.owners.every(s => s === 'dashed'), sk.owners);
  ok(scn, 'split legs ↳1 → ↳2 are tied by the 1px connector (full ↳1, half ↳2)', sk.conn.length >= 2 && sk.conn.every(c => c.on) && sk.conn.some(c => c.no === '↳1' && c.h >= 32) && sk.conn.some(c => c.no === '↳2' && c.h >= 15 && c.h <= 17), sk.conn);
  // Sub-row type (Figma 1097:2830, 1097:3388, 1097:3046/3055).
  const ty = await page.evaluate(([tok]) => {
    const token = eval(tok);
    const cs = e => { if (!e) return null; const s = getComputedStyle(e); return { size: s.fontSize, w: s.fontWeight, ls: s.letterSpacing, c: s.color }; };
    const q = sel => document.querySelector('#content .wi4 ' + sel);
    const un = q('.wi4-sub-leg .wi4-unlink'), asg = un && un.closest('.wi4-c-asg');
    return { ink: token('--wi4-ink'), g1: token('--wi4-grey-1'), g2: token('--wi4-grey-2'),
      rlTag: cs(q('.wi4-sub-rl .wi4-tag')), rlDrv: cs(q('.wi4-sub-rl .wi4-rl-drv')), rlSep: cs(q('.wi4-sub-rl .wi4-rl-sep')),
      spTag: cs(q('.wi4-splithd .wi4-tag')), spBody: cs(q('.wi4-splithd .wi4-split-t')), spBodyTitle: !!(q('.wi4-splithd .wi4-split-t') || {}).title,
      spInset: q('.wi4-splithd .wi4-tag') ? Math.round(q('.wi4-splithd .wi4-tag').getBoundingClientRect().left - q('.wi4-cols .wi4-c-exp').getBoundingClientRect().left) : null,
      legT: cs(q('.wi4-sub-leg .wi4-sub-leg-t')), legTxt: (q('.wi4-sub-leg .wi4-sub-leg-t') || {}).textContent || '', idx: cs(q('.wi4-legidx')),
      un: un ? Object.assign(cs(un), { h: un.getBoundingClientRect().height, pad: getComputedStyle(un).paddingLeft, dx: Math.round(un.getBoundingClientRect().left - asg.getBoundingClientRect().left) }) : null };
  }, [TOKEN_JS]);
  ok(scn, 'relay: tag SemiBold 10.5 untracked, the driver SemiBold 11 in ink, «·» in grey-2',
    !!ty.rlTag && ty.rlTag.size === '10.5px' && ty.rlTag.w === '600' && ty.rlTag.ls === 'normal' && !!ty.rlDrv && ty.rlDrv.size === '11px' && ty.rlDrv.w === '600' && ty.rlDrv.c === ty.ink && !!ty.rlSep && ty.rlSep.c === ty.g2, ty);
  ok(scn, 'split header: tag SemiBold 10.5 untracked 10px inside the leg; route Medium 11.5 in ink, cut with a title',
    !!ty.spTag && ty.spTag.size === '10.5px' && ty.spTag.w === '600' && ty.spTag.ls === 'normal' && ty.spInset === 10 && !!ty.spBody && ty.spBody.size === '11.5px' && ty.spBody.w === '500' && ty.spBody.c === ty.ink && ty.spBodyTitle, ty);
  ok(scn, 'rota: «ΣΚΕΛΟΣ ΡΟΤΑΣ · ίδιο φορτηγό» one SemiBold 10.5 run; unlink 22px, padding 8, Medium 11, 4px off the cell; «↳» 12 SemiBold',
    !!ty.legT && ty.legT.size === '10.5px' && ty.legT.w === '600' && ty.legT.c === ty.g1 && ty.legTxt === 'ΣΚΕΛΟΣ ΡΟΤΑΣ · ίδιο φορτηγό' && !!ty.un && Math.abs(ty.un.h - 22) <= 0.5 && ty.un.pad === '8px'
    && ty.un.size === '11px' && ty.un.w === '500' && ty.un.dx === 4 && !!ty.idx && ty.idx.size === '12px' && ty.idx.w === '600', ty);
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
    // Row chips only: the queue band's cards carry a red chip for a NO_TRUCK
    // item too, and they are not rows.
    const redChipRows = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-row .wi4-dc.red')].map(c => !!c.closest('.wi4-row').querySelector('.wi4-box.un'));
    const plates = [...document.querySelectorAll('#content .wi4 .wi4-box.own .wi4-plate')].map(p => getComputedStyle(p).color);
    const lastSep = [...document.querySelectorAll('#content .wi4 .wi4-day-body')].map(b => b.lastElementChild && getComputedStyle(b.lastElementChild).borderBottomWidth);
    return { grpRef: txt('recWiE011', '.wi4-c-exp .wi4-ref'), impRef: txt('recWiE001', '.wi4-c-imp .wi4-ref'), outsideChip,
      done: !!done, doneFrame: doneBorder && doneBorder.borderTopStyle !== 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(doneBorder.borderTopColor),
      redChipRows, plates, ink: token('--wi4-ink'), lastSep,
      pe: !!(row('recWiE001') && row('recWiE001').querySelector('.wi4-l-pal .wi4-pe')) };
  }, [ROW_JS, TOKEN_JS]);
  ok(scn, '(a) a groupage shows «3 φορτία» in place of ΑΝΑΦ.', /3 φορτία/.test(d.grpRef || ''), d.grpRef);
  ok(scn, '(b) ΑΝΑΦ. also under the matched import\'s date', /REF-I001/.test(d.impRef || ''), d.impRef);
  // Owner 11/10 21:20: the VS date warning («φτάνει …») left with DATE_MISMATCH,
  // so no date at all sits outside a chip.
  ok(scn, '(c) no date outside a chip — no VS warning (DATE_MISMATCH gone, owner 11/10 21:20), the place line never carries one', d.outsideChip.length === 0, d.outsideChip);
  ok(scn, '(d) a done date is plain grey (no frame); red chips only on rows without a truck', d.done && !d.doneFrame && d.redChipRows.every(Boolean), d);
  ok(scn, '(e) own-fleet plates dark: --wi4-ink (WP3 vocabulary)', d.plates.length > 3 && d.plates.every(c => c === d.ink), { plates: [...new Set(d.plates)], ink: d.ink });
  ok(scn, '(f) no separator under the last row of a day', d.lastSep.length >= 6 && d.lastSep.every(w => w === '0px'), d.lastSep);
  ok(scn, 'PE sits next to the pallets', d.pe);
  // Finding qcard-reason-verb-eats-name (r2): the band's NO_TRUCK card says
  // «Nπ · σήμερα / αύριο» without the verb, as Figma 1115:2722 / 1115:2730
  // («φορτώνει αύριο» took 111px and cut the destination at 1800); the
  // «Όλα» panel sentence keeps it (1117:2699 «φορτώνει σήμερα · χωρίς φορτηγό»).
  const qv = await page.evaluate(() => {
    const items = WIV2.queueItems().slice(0, 3);
    const cards = [...document.querySelectorAll('#content .wi4 #wi4-qwrap .wi4-qcard')].filter(c => c.querySelector('.wi4-qcard-t'));
    return cards.map((c, i) => ({ code: items[i] && items[i].code, sub: items[i] && items[i].sub, l2: ((c.querySelector('.wi4-qcard-t > .wi4-l2') || {}).textContent || '').trim(),
      l1w: Math.round(((c.querySelector('.wi4-l1') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect()).width * 10) / 10 }));
  });
  const nt = qv.filter(c => c.code === 'NO_TRUCK');
  ok(scn, 'queue band: a NO_TRUCK card reads «Nπ · αύριο» (no «φορτώνει»), the panel sentence keeps «φορτώνει αύριο · χωρίς φορτηγό»',
    nt.length >= 1 && nt.every(c => /^\d+π · (σήμερα|αύριο|[Α-Ωα-ωά-ώ]{3} \d{1,2}\/\d{1,2}|φόρτωση ήταν .+)$/.test(c.l2) && !/φορτώνει/.test(c.l2)
      && /^(φορτώνει (σήμερα|αύριο|.+)|φόρτωση ήταν .+) · χωρίς φορτηγό$/.test(c.sub)), qv);
  // Fix round 3 (11/10): a chip with ΑΝΑΦ. under it fits the 32px row with
  // room (≤ 28px; it was 31 and touched the next row's border); over 33 is a
  // shape as well as a colour (the alert icon before the number).
  const z = await page.evaluate(([js]) => {
    const stacks = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-l-date')].filter(c => c.querySelector('.wi4-ref') && c.offsetParent)
      .map(c => { const a = c.querySelector('.wi4-dc'), b = c.querySelector('.wi4-ref'); return a ? Math.round(b.getBoundingClientRect().bottom - a.getBoundingClientRect().top) : 0; });
    const over = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-pal.over')].map(x => !!x.querySelector('.wi4-pal-ic svg'));
    // The SAME count as v1's preFields (_wiPaint): export rows + board import rows, each order once.
    const met = WI_INTERNAL.paintMetrics(); const ids = new Set();
    met.expRows.concat(met.impRows).forEach(r => (r.orderIds || [r.orderId]).forEach(id => ids.add(id)));
    const want = [...ids].filter(id => { const r = WI_INTERNAL.recOf(id); return r && typeof isPreorder === 'function' && isPreorder(r.fields); }).length;
    const btn = [...document.querySelectorAll('.wi4-bar-r .wi4-btn')].find(b => /Pre-order/.test(b.textContent));
    const got = btn ? Number(((btn.querySelector('.wi4-cnt') || {}).textContent) || 0) : null;
    return { maxStack: Math.max(0, ...stacks), n: stacks.length, over, want, got };
  }, [ROW_JS]);
  ok(scn, 'chip + ΑΝΑΦ. under it ≤ 28px inside the 32px row', z.n > 5 && z.maxStack <= 28, z);
  ok(scn, 'over 33: the alert icon before the number (shape + colour)', z.over.length >= 1 && z.over.every(Boolean), z.over);
  // Parity r1 (legs-national): the leg sits 10px inside its 621px track
  // (Figma 1097:2658), every row chip is the 70px DateChip (898:12), «→
  // ΑΠΟΘΗΚΗ» rides on the delivery point (it spilled out of the 72px pallets
  // track), and the national columns sit 8px inside theirs with the ΑΠΟ label
  // on its tiles' edge (1097:2445).
  const lg = await page.evaluate(([js]) => {
    const row = eval(js), R = e => e.getBoundingClientRect();
    const vis = e => e.getClientRects().length > 0;
    const lotEls = [...document.querySelectorAll('#content .wi4 #wi-rows .wi-b-lot')].filter(vis);
    const lotOut = lotEls.filter(b => { const to = b.closest('.wi4-l-to'); return !to || R(b).left < R(to).left - 0.5 || R(b).right > R(to).right + 0.5; }).map(b => b.textContent);
    const palOver = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-l-pal')].filter(vis)
      .flatMap(p => [...p.children].filter(c => R(c).left < R(p).left - 0.5 || R(c).right > R(p).right + 0.5).map(c => c.className || c.tagName));
    const r1 = row('recWiE001'), cell = r1 && r1.querySelector('.wi4-c-exp');
    const chip = cell && cell.querySelector('.wi4-l-date .wi4-dc'), pal = cell && cell.querySelector('.wi4-l-pal');
    const e1 = cell && chip && pal ? { chipIn: +(R(chip).left - R(cell).left).toFixed(1), palIn: +(R(cell).right - R(pal).right).toFixed(1) } : null;
    const chips = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-l-date .wi4-dc')].filter(vis).map(c => +R(c).width.toFixed(1));
    const apo = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-row .wi4-c-fr .wi4-nat')].filter(vis).map(n => {
      const p = n.closest('.wi4-row').querySelector('.wi4-c-imp .wi4-l-pal'); const last = p && p.lastElementChild;
      return last ? +(R(n.querySelector('.wi4-l1')).left - R(last).right).toFixed(1) : null; }).filter(x => x != null);
    const pros = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-row .wi4-c-fl .wi4-tile')].filter(vis).map(t => {
      const c = t.closest('.wi4-row').querySelector('.wi4-c-exp .wi4-l-date .wi4-dc'); return c ? +(R(c).left - R(t).right).toFixed(1) : null; }).filter(x => x != null);
    const hd = document.querySelector('#content .wi4 .wi4-cols .wi4-c-fr .wi4-ftog-t'), t0 = document.querySelector('#content .wi4 #wi-rows .wi4-row .wi4-c-fr .wi4-nat');
    return { e1, chips, apo, pros, apoHdr: hd && t0 ? +(R(hd).left - R(t0).left).toFixed(1) : null, lots: lotEls.length, lotOut, palOver };
  }, [ROW_JS]);
  ok(scn, 'E001: the export date chip starts 10±1px inside its cell, the pallets end 10±1px before its right edge (Figma px 10)', !!lg.e1 && Math.abs(lg.e1.chipIn - 10) <= 1 && Math.abs(lg.e1.palIn - 10) <= 1, lg.e1);
  ok(scn, 'every row date chip is 70±1px wide (Figma DateChip)', lg.chips.length > 10 && lg.chips.every(w => Math.abs(w - 70) <= 1), [...new Set(lg.chips)]);
  ok(scn, 'the import pallets end ≥24px before the ΑΠΟ ΒΕΡΟΙΑ name', lg.apo.length >= 1 && lg.apo.every(g => g >= 24), lg.apo);
  ok(scn, 'every «→ ΑΠΟΘΗΚΗ» lies inside its delivery column; nothing in the pallets track overflows it', lg.lots >= 1 && !lg.lotOut.length && !lg.palOver.length, lg);
  ok(scn, '«ΑΠΟ ΒΕΡΟΙΑ» in the header starts within 2px of its tiles; a ΠΡΟΣ tile ends ≥20px before the export date chip', lg.apoHdr != null && Math.abs(lg.apoHdr) <= 2 && lg.pros.length >= 1 && lg.pros.every(g => g >= 20), { apoHdr: lg.apoHdr, pros: lg.pros });
  ok(scn, 'the Pre-order counter = v1\'s count (each order once — a matched import is not counted twice)', z.got === z.want && z.want >= 1, z);

  // Points (§d.1, owner lock): up to 4 all shown with ≥56px each IF they fit,
  // otherwise as many as fit + «+N»; 5+ = the first 3 + «+N» only if 3 fit.
  // The expectation is the rule itself (WI4.points) at the MEASURED column
  // width, never a number: at ~217px 4 stops are 2 + «+2» (3 + chip = 226px).
  const STOPS = FIX.cases.stops_1_to_9.expect.stops;
  const pts = () => page.evaluate(([js, want]) => { const row = eval(js); const P = (oid, total) => { const r = row(oid); const to = r && r.querySelector('.wi4-c-exp .wi4-l-to');
    if (!to) return null; const w = to.clientWidth; const k = WI4.points(Array.from({ length: total }, (_, i) => ({ n: i + 1, label: 'x' })), w).shown.length;
    return { w, total, want: k, n: to.querySelectorAll('.wi4-pt').length, more: (to.querySelector('.wi4-more b') || {}).textContent || '', title: (to.querySelector('.wi4-more') || { title: '' }).title, badge: !!to.querySelector('.wi4-pt-n') }; };
    return { e19: P('recWiE019', want.e19), e20: P('recWiE020', want.e20), e01: P('recWiE001', want.e01) }; }, [ROW_JS, { e19: STOPS.recWiE019[1], e20: STOPS.recWiE020[1], e01: STOPS.recWiE001[1] }]);
  // The OWNER'S table (§d.1 lock), written out here — never WI4.points, the
  // code under test (review 11/10: it was its own oracle, and the pinned case
  // was vacuous from 226px up). min 56 · gap 8 · «+N» chip 34:
  //   4 stops: all 4 from 248px · 3 + «+1» from 226 · 2 + «+2» from 162 · else 1 + «+3»
  //   9 stops: 3 + «+6» from 226 · 2 + «+7» from 162 · else 1 + «+8»
  const own4 = w => (w >= 248 ? 4 : w >= 226 ? 3 : w >= 162 ? 2 : 1);
  const own9 = w => (w >= 226 ? 3 : w >= 162 ? 2 : 1);
  const table = (x, n) => !!x && x.n === n && (x.total === n ? !x.more : x.more === '+' + (x.total - n));
  let p = await pts();
  ok(scn, `4 stops at ${p.e19 && p.e19.w}px = the owner table (all from 248, 3 + «+1» from 226, else 2 + «+2»)`, !!p.e19 && p.e19.total === 4 && table(p.e19, own4(p.e19.w)), p.e19);
  ok(scn, `9 stops at ${p.e20 && p.e20.w}px = the owner table (3 + «+6» from 226, 2 + «+7» from 162); title lists the hidden ones`, !!p.e20 && p.e20.total === 9 && table(p.e20, own9(p.e20.w)) && /Iota|Kappa|Lambda|Mu|Xi/.test(p.e20.title), p.e20);
  ok(scn, 'a single stop has no number badge', p.e01 && p.e01.n <= 1 && !p.e01.badge, p.e01);
  // One week is drawn one way: the points of the first paint equal those after
  // a full re-render (the column is re-measured when the board resizes —
  // e.g. the sidebar collapsing after the first paint — not only on window resize).
  const grp = () => page.evaluate(js => { const r = eval(js)('recWiE011'); const to = r && r.querySelector('.wi4-c-exp .wi4-l-to'); return to ? { w: to.clientWidth, n: to.querySelectorAll('.wi4-pt').length, more: (to.querySelector('.wi4-more b') || {}).textContent || '' } : null; }, ROW_JS);
  const g0 = await grp();
  await page.evaluate(() => WI_INTERNAL.renderWeeklyIntl()); await settle(page, S);
  const g1 = await grp();
  ok(scn, 'groupage ×3: the same points on first paint and after renderWeeklyIntl()', !!g0 && !!g1 && g0.n === g1.n && g0.more === g1.more, { g0, g1 });
  // Plates are the key of the assignment column: «TST-1005 · TRL-2005» whole at
  // 1920 — with the print slot reserved beside the paper plane (fix round 3).
  const cut = await page.evaluate(() => [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-box.own .wi4-plate')].filter(p => p.scrollWidth > p.clientWidth + 1).map(p => p.textContent));
  ok(scn, 'own-fleet plates (truck · trailer) are never cut at 1920', !cut.length, cut);
  // A groupage member hidden behind «+N» stays a drag tile (its fold draws the
  // same tiles): at 1440 the 3-member groupage no longer fits its column.
  await page.setViewportSize({ width: 1440, height: 1080 }); await page.waitForTimeout(500);
  const fold = await page.evaluate(js => { const r = eval(js)('recWiE011'); const to = r && r.querySelector('.wi4-c-exp .wi4-l-to'); const more = to && to.querySelector('.wi4-more');
    if (!more) return { more: false, w: to && to.clientWidth };
    more.click(); const f = to.querySelector('.wi4-fold.open');
    return { more: true, open: !!f, tiles: f ? [...f.querySelectorAll('[ondragstart*="_wiSegDragStart"]')].map(t => t.getAttribute('data-order-id')) : [] }; }, ROW_JS);
  ok(scn, 'at 1440 the hidden groupage members sit in the «+N» fold as draggable tiles', fold.more && fold.open && fold.tiles.length >= 1, fold);
  await page.evaluate(() => document.querySelectorAll('#content .wi4 .wk3-xfold.open').forEach(f => f.classList.remove('open')));
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(500);
  const toggles = page.locator('#content .wi4 .wi4-cols .wi4-ftog');
  if (await toggles.count() >= 2) {
    await toggles.first().click(); await toggles.last().click(); await page.waitForTimeout(300);
    p = await pts();
    ok(scn, 'national columns collapsed → all 4 points of E019, no «+N»', p.e19 && p.e19.n === 4 && !p.e19.more, p.e19);
    await shot(page, 'paint-nat-collapsed');
    // A collapsed column still tells the truth: the dot takes its tile's
    // state (E014's ΑΠΟ leg has no carrier → amber ring), as information
    // only (owner 11/10 21:20): no data-r, never red.
    const dot = await page.evaluate(js => { const r = eval(js)('recWiE014'); const d = r && r.querySelector('.wi4-c-fr .wi4-natdot'); return d ? { cls: d.className, r: d.getAttribute('data-r'), t: d.title } : null; }, ROW_JS);
    ok(scn, 'collapsed: E014\'s ΑΠΟ dot is «un» (no carrier), its title says so; no data-r, never red', !!dot && /\bun\b/.test(dot.cls) && !/\bred\b/.test(dot.cls) && dot.r === null && /ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(dot.t), dot);
    const namedC = await reasonsNamed(page);
    ok(scn, 'collapsed: per day, every reason the header counts is still named (by the dots)', namedC.bad.length === 0, namedC.bad);
    // Collapsed, the header still offers the way back (rules «ανοιγοκλείνουν με
    // κλικ στην κεφαλίδα») — never only through «Προβολή ▾».
    const back = await toggles.first().click({ timeout: 5000 }).then(() => true, () => false) && await toggles.last().click({ timeout: 5000 }).then(() => true, () => false);
    await page.waitForTimeout(300);
    ok(scn, 'collapsed columns reopen from their header toggle', back && await page.evaluate(() => { const r = document.querySelector('#content .wi4'); return !!r && !r.classList.contains('wi4-fl-off') && !r.classList.contains('wi4-fr-off'); }));
  } else ok(scn, 'two national column toggles (ΠΡΟΣ / ΑΠΟ ΒΕΡΟΙΑ) in the column header', false, await toggles.count());
  // Finding group-grip-always-visible (r2): the matched group's «⋮⋮» shows
  // on row hover only (Figma sheet 14 1065:2257; Row 18 1097:2921 at rest
  // holds only the figure). Opacity, so the drag (drops.grip) still finds it.
  const gripSel = '#content .wi4 #wi-rows .wi4-grip[ondragstart*="_wiImpDragStart"]';
  const grip0 = await page.evaluate(sel => { const g = document.querySelector(sel); if (!g) return null; g.closest('.wi4-row').setAttribute('data-rig-grip', '1');
    return { op: getComputedStyle(g).opacity, drag: g.getAttribute('draggable'), cur: getComputedStyle(g).cursor }; }, gripSel);
  if (grip0) await page.hover('[data-rig-grip="1"] .wi4-c-exp');
  const grip1 = grip0 ? await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).opacity, gripSel) : null;
  await page.mouse.move(5, 5);
  ok(scn, 'the group grip «⋮⋮» is hidden at rest (opacity 0) and shows on row hover (1); still draggable, cursor grab',
    !!grip0 && grip0.op === '0' && grip1 === '1' && grip0.drag === 'true' && grip0.cur === 'grab', { grip0, grip1 });
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// Each day section as drawn: open/closed, card, the reason codes it counts,
// aria-expanded, and whether its closed-day marker is on screen.
const daysOf = pg => pg.evaluate(() => [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-day')].map(d => {
  const c = d.querySelector('[data-codes]'), h = d.querySelector('.wi4-dayh[aria-expanded]');
  return { day: d.dataset.day, closed: d.classList.contains('closed'), body: !!d.querySelector('.wi4-day-body'),
    codes: c ? c.getAttribute('data-codes') : null, exp: h ? h.getAttribute('aria-expanded') : null,
    dot: [...d.querySelectorAll('[data-dc] .wi4-dayh-dot')].some(x => x.getClientRects().length > 0) };
}));
const allOpenDays = ds => ds.every(d => !d.closed && (!d.body || d.exp === 'true'));

async function scnInvariants(browser, origin) {
  const scn = 'invariants';
  const { page, S } = await openBoard(browser, origin);
  const r = await page.evaluate(() => {
    const Q = WIV2.queueItems();
    const rowIdsOf = el => { const rid = Number(el.getAttribute('data-row-id')); const row = WINTL.rows.find(x => x.id === rid); const oid = el.getAttribute('data-oid');
      const imp = row && row.importId ? (WINTL.rows.find(x => x.type === 'import' && (x.orderIds || []).includes(row.importId)) || { orderIds: [row.importId] }).orderIds : [];
      return [...new Set([...(row ? (row.orderIds || [row.orderId]) : []), ...imp, ...(oid ? [oid] : [])])]; };
    // A local relay shares its order id with the row it hangs under, so its
    // items (relayId) belong to the relay sub-row alone, never to that row.
    const qOf = (ids, el) => (el && el.dataset.relay ? Q.filter(q => q.relayId === el.dataset.relay)
      : Q.filter(q => !q.relayId && (ids.includes(q.key) || ids.includes(q.rowKey))));
    const un = [...document.querySelectorAll('#content .wi4 .wi4-box.un')].map(b => { const el = b.closest('.wi4-row,.wi4-subrow'); const ids = el ? rowIdsOf(el) : [];
      return { ids, rail: !!el && (el.classList.contains('wi4-r-red') || el.classList.contains('wi4-r-amb')), q: qOf(ids, el).some(q => q.code === 'NO_TRUCK') }; });
    const days = [...document.querySelectorAll('#content .wi4 .wi4-day')].map(day => {
      // Owner 11/10: the visible header is name + date (+ «σήμερα»); the
      // header's words live in the closed-day marker's label (_dayCountHTML),
      // read here whether the day is open (marker hidden) or not.
      const head = ((day.querySelector('.wi4-dayh') || {}).innerText || '').replace(/\s+/g, ' ').trim();
      const dot = day.querySelector('[data-dc] .wi4-dayh-dot');
      const words = dot ? dot.getAttribute('aria-label') || '' : '';
      const rows = [...day.querySelectorAll('.wi4-row,.wi4-subrow')].map(el => ({ el, ids: rowIdsOf(el), rail: el.classList.contains('wi4-r-red') || el.classList.contains('wi4-r-amb') }));
      const items = [...new Set(rows.flatMap(x => qOf(x.ids, x.el)))];
      const num = re => { const m = words.match(re); return m ? Number(m[1]) : 0; };
      return { day: day.dataset.day, head, words, tip: (day.querySelector('.wi4-dayn') || {}).title || '',
        body: !!day.querySelector('.wi4-day-body'), chev: !!day.querySelector('.wi4-chev'),
        railsWithoutItem: rows.filter(x => x.rail && !qOf(x.ids, x.el).length).map(x => x.ids), itemsWithoutRail: rows.filter(x => !x.rail && qOf(x.ids, x.el).length).map(x => x.ids),
        hdrNoTruck: num(/(\d+) χωρίς φορτηγό/), qNoTruck: items.filter(q => q.code === 'NO_TRUCK').length,
        // «1 κενό γύρισμα» / «2 κενά γυρίσματα»: the accent moves (γύρισμα, γυρίσματα).
        hdrEmpty: num(/(\d+) κεν(?:ό γύρισμα|ά γυρίσματα)/), qEmpty: items.filter(q => q.code === 'EMPTY_RETURN').length };
    });
    const tabB = [...document.querySelectorAll('.wi4-top .wi4-tab')].map(t => ({ t: t.innerText, b: (t.querySelector('.wi4-tab-b') || {}).textContent || '' }));
    return { un, days, tabB, qn: Q.length, codes: Q.map(q => q.code), text: document.querySelector('#content .wi4').innerText };
  });
  ok(scn, 'every «ΠΡΟΣ ΑΝΑΘΕΣΗ» box has a rail AND a NO_TRUCK queue item (§d.2)', r.un.length >= 4 && r.un.every(x => x.rail && x.q), r.un.filter(x => !x.rail || !x.q));
  ok(scn, 'per day: every railed row has a queue item and every row with an item has a rail', r.days.every(d => !d.railsWithoutItem.length && !d.itemsWithoutRail.length), r.days.filter(d => d.railsWithoutItem.length || d.itemsWithoutRail.length));
  ok(scn, 'per day: header counts = queue items (χωρίς φορτηγό, κενά γυρίσματα)', r.days.every(d => d.hdrNoTruck === d.qNoTruck && d.hdrEmpty === d.qEmpty), r.days.map(d => [d.head, d.words, d.hdrNoTruck, d.qNoTruck, d.hdrEmpty, d.qEmpty]));
  // Owner 11/10 (decision 1): a day header shows its name and date only —
  // never a count, a reason or «Καμία κίνηση».
  ok(scn, 'every day header reads only «DAY d/m» (+ «· σήμερα») or «ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ»', r.days.length >= 7 && r.days.every(d => /^(?:[Α-Ω]+ \d{1,2}\/\d{1,2}|ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ)(?: ?· σήμερα)?$/.test(d.head)), r.days.map(d => d.head));
  ok(scn, 'today\'s header says «σήμερα»', r.days.some(d => /6\/10/.test(d.head) && /σήμερα/.test(d.head)), r.days.map(d => d.head));
  ok(scn, 'the empty day 4/10 is its header alone: name + date, no card, no chevron', r.days.some(d => d.day === '2026-10-04' && d.head === 'ΚΥΡΙΑΚΗ 4/10' && !d.body && !d.chev), r.days.map(d => [d.day, d.head, d.body, d.chev]));
  ok(scn, 'today\'s empty return reads «(N από σήμερα)» (closed-day marker label)', r.days.some(d => /από σήμερα/.test(d.words)), r.days.map(d => d.words));
  ok(scn, 'the W+1 tab badge = 1 (W+1 loads today–tomorrow)', r.tabB.some(t => /42/.test(t.t) && t.b.trim() === '1'), r.tabB);
  // P1 review 11/10: «1 καθυστέρηση», «1 ίδια μέρα», «2 pre-order» were in the
  // headers with no row saying which load. Every reason a header counts is
  // NAMED on its row (data-r): per day, per code, counted = named, exactly.
  const named = await reasonsNamed(page);
  ok(scn, 'per day: every reason the header counts is named on exactly that many rows (λωρίδα, λέξη, κεφαλίδα = ίδιο επίπεδο)', named.days.length >= 6 && named.bad.length === 0, named.bad);
  ok(scn, 'the fixture\'s reasons are all exercised (LATE, PREORDER, SAME_DAY, OVER_33)', ['LATE', 'PREORDER', 'SAME_DAY', 'OVER_33'].every(c => named.seen.includes(c)), named.seen);
  // Owner 11/10 21:20: Weekly Intl carries NO national work. The fixture
  // still holds a leg without carrier (E014's ΑΠΟ = I005) and a VS date
  // mismatch (I006): neither may reach the queue, a row's data-r, a closed-day
  // marker or the band count, and the tile stays the amber info chip.
  const nat = await page.evaluate(([js, codes]) => {
    const row = eval(js), hit = c => codes.includes(c);
    const tile = (() => { const r = row('recWiE014'); const t = r && r.querySelector('.wi4-c-fr .wi4-tile'); if (!t) return null;
      const cs = getComputedStyle(t); return { cls: t.className, t: t.textContent, r: t.getAttribute('data-r'), bg: cs.backgroundColor, bs: cs.borderTopStyle, c: cs.color, w: cs.fontWeight }; })();
    const marks = [...document.querySelectorAll('#content .wi4 #wi-rows [data-codes]')];
    const hd = (document.querySelector('#content .wi4 .wi4-q-hd') || {}).innerText || '';
    return { q: WIV2.queueItems().map(q => q.code).filter(hit),
      dr: [...document.querySelectorAll('#content .wi4 #wi-rows [data-r]')].map(e => e.getAttribute('data-r')).filter(hit),
      codes: marks.map(m => m.getAttribute('data-codes') || '').filter(c => codes.some(k => c.includes(k))),
      labels: marks.map(m => { const d = m.querySelector('.wi4-dayh-dot'); return d ? d.getAttribute('aria-label') || '' : ''; }).filter(l => /εθνικ|μεταφορέα|δεν βρέθηκ|ασυνέπει/.test(l)),
      bandN: (hd.match(/ΕΠΟΜΕΝΑ · ≥?(\d+)/) || [])[1], qn: WIV2.queueItems().length, hd,
      redNat: document.querySelectorAll('#content .wi4 .wi4-tile.un.red, #content .wi4 .wi4-natdot.un.red').length, tile };
  }, [ROW_JS, NAT_CODES]);
  ok(scn, 'no national code (NAT_NO_CARRIER / NAT_MISSING / NAT_UNKNOWN / DATE_MISMATCH) in the queue, on a row (data-r) or in a marker (data-codes, aria-label)',
    !nat.q.length && !nat.dr.length && !nat.codes.length && !nat.labels.length, nat);
  ok(scn, '«ΕΠΟΜΕΝΑ · N» = WIV2.queueItems().length (counter = board)', nat.bandN != null && +nat.bandN === nat.qn, { hd: nat.hd, qn: nat.qn });
  ok(scn, 'E014\'s ΑΠΟ tile (I005) still reads «ΠΡΟΣ ΑΝΑΘΕΣΗ» as information: amber dashed chip (#fff7ed, #b45309, 600), no data-r, never red',
    !!nat.tile && nat.tile.t === 'ΠΡΟΣ ΑΝΑΘΕΣΗ' && nat.tile.cls === 'wi4-tile un' && nat.tile.r === null && nat.tile.bg === 'rgb(255, 247, 237)'
    && nat.tile.bs === 'dashed' && nat.tile.c === 'rgb(180, 83, 9)' && nat.tile.w === '600' && nat.redNat === 0, nat.tile);
  ok(scn, 'every railed row names its reasons in the title of its number', named.railNoTitle.length === 0, named.railNoTitle);
  ok(scn, 'the moved-in day is drawn; «μεταφέρθηκε · W…» is in its date\'s title', r.days.some(d => /μεταφέρθηκε · W\d+/.test(d.tip)), r.days.map(d => [d.day, d.tip]));
  // A day the user closes keeps saying it holds work: one marker whose label
  // names its reasons; it goes again when the day reopens. Monday 5/10
  // carries an empty return and a late load (its VS date mismatch is no
  // reason any more, owner 11/10 21:20).
  const RX = { NO_TRUCK: /χωρίς φορτηγό/, EMPTY_RETURN: /κεν(?:ό γύρισμα|ά γυρίσματα)/,
    OVER_33: /πάνω από 33π/, SAME_DAY: /ίδια μέρα/, LATE: /καθυστέρησ/, PREORDER: /pre-order/, RELAY_NO_DRIVER: /χωρίς οδηγό/, MATCH_UNREAD: /εκτός προβολής/,
    PALLETS_UNKNOWN: /παλέτες χωρίς καταγραφή/, SAVE_FAILED: /δεν αποθηκεύτηκ/ };
  const mon = () => page.evaluate(() => { const day = document.querySelector('#content .wi4 .wi4-day[data-day="2026-10-05"]'); const dot = day && day.querySelector('[data-dc] .wi4-dayh-dot');
    const b = dot && dot.getBoundingClientRect();
    return { closed: !!day && day.classList.contains('closed'), codes: day ? (day.querySelector('[data-codes]') || {}).getAttribute('data-codes') : null,
      dot: dot ? { cls: dot.className, label: dot.getAttribute('aria-label') || '', title: dot.title, shown: dot.getClientRects().length > 0, w: Math.round(b.width), h: Math.round(b.height) } : null,
      head: ((day && day.querySelector('.wi4-dayh')) || {}).innerText || '' }; });
  // Owner 12/10: every day is open on every load, week change and repaint;
  // a day closes ONLY by the user's click and opens again the same way
  // (WI4.collapsible, the auto-collapse, is removed). A quiet day is proven
  // open on its own board below (invariants.quiet): this week has none.
  const d0 = await daysOf(page);
  ok(scn, 'first paint: every day is open (no .closed, aria-expanded true on every card)', d0.length >= 7 && allOpenDays(d0), d0);
  ok(scn, 'the empty Sunday 4/10 is never closed (its header alone)', d0.some(d => d.day === '2026-10-04' && !d.body && !d.closed), d0.map(d => [d.day, d.body, d.closed]));
  ok(scn, 'first paint: no closed-day marker is shown anywhere', d0.every(d => !d.dot), d0.filter(d => d.dot).map(d => d.day));
  const m0 = await mon();
  await page.click('#content .wi4 .wi4-day[data-day="2026-10-05"] .wi4-dayh');
  const m1 = await mon();
  await shot(page, 'invariants-closed-day');
  // The user's close is kept for the session: a repaint and a full re-read
  // draw Monday closed again, and every other day still open.
  await page.evaluate(() => WIV2.paint()); await settle(page, S);
  const dRp = await daysOf(page);
  await page.evaluate(() => WI_INTERNAL.renderWeeklyIntl()); await settle(page, S);
  const dRd = await daysOf(page);
  const onlyMon = ds => ds.length >= 7 && ds.every(d => d.closed === (d.day === '2026-10-05')) && ds.filter(d => d.dot).map(d => d.day).join() === '2026-10-05';
  ok(scn, 'repaint: Monday stays as the user left it (closed, its marker shown); every other day open', onlyMon(dRp), dRp.map(d => [d.day, d.closed, d.dot]));
  ok(scn, 'full re-read: the same — only the user\'s Monday closed', onlyMon(dRd), dRd.map(d => [d.day, d.closed, d.dot]));
  await page.click('#content .wi4 .wi4-day[data-day="2026-10-05"] .wi4-dayh');
  const m2 = await mon();
  // A week change draws every day open, and so does coming back.
  await page.evaluate(() => { WINTL.week = 42; return WI_INTERNAL.renderWeeklyIntl(); }); await settle(page, S);
  const d42 = await daysOf(page);
  await page.evaluate(() => { WINTL.week = 41; return WI_INTERNAL.renderWeeklyIntl(); }); await settle(page, S);
  const d41 = await daysOf(page);
  ok(scn, 'week change: W42 opens with every day open, no marker shown', d42.length >= 1 && allOpenDays(d42) && d42.every(d => !d.dot), d42);
  ok(scn, 'back to W41: every day open again, no marker shown', d41.length >= 7 && allOpenDays(d41) && d41.every(d => !d.dot), d41);
  const named5 = m1.dot ? (m1.codes || '').split(',').filter(Boolean).map(p => p.split(':')[0]).every(c => RX[c] && RX[c].test(m1.dot.label)) : false;
  ok(scn, 'Monday 5/10 open: its marker exists but is hidden', !m0.closed && !!m0.dot && !m0.dot.shown && !!m0.codes, m0);
  ok(scn, 'closed by the user: one 6px marker after the date, its label naming every counted reason, data-codes unchanged', m1.closed && m1.dot && m1.dot.shown && m1.dot.w === 6 && m1.dot.h === 6
    && /\b(red|amb)\b/.test(m1.dot.cls) && m1.dot.title === m1.dot.label && named5 && m1.codes === m0.codes && (m1.codes || '').split(',').filter(Boolean).length >= 2, m1);
  ok(scn, 'reopened: the marker hides again', !m2.closed && m2.dot && !m2.dot.shown && m2.codes === m0.codes, m2);
  ok(scn, 'never «κανείς» on the board', !/κανείς/i.test(r.text));
  ok(scn, 'no auto-match: nothing written at load', !writes(S).length, writes(S));
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
  // A quiet day — a card with no reason at all — is what the removed
  // auto-collapse folded by itself. Saturday 3/10 holds one export (E010)
  // whose only reason is its empty return; carried by a partner it has none.
  {
    const scn2 = 'invariants.quiet', SAT = '2026-10-03';
    const { page: p2, S: S2 } = await openBoard(browser, origin, { mutate: db => {
      const f = db[T.ORDERS].find(r => r.id === 'recWiE010').fields;
      delete f.Truck; delete f.Driver; delete f.Trailer;
      Object.assign(f, { Partner: ['recWiP001'], 'Is Partner Trip': true, 'Partner Truck Plates': 'PRT-310', 'Partner Rate': 900 });
    } });
    const sat = ds => ds.find(d => d.day === SAT) || {};
    const q0 = await daysOf(p2);
    ok(scn2, 'Saturday 3/10 is quiet (a card, no reason counted) and open on first paint; every day open', sat(q0).body && sat(q0).codes === '' && !sat(q0).closed && sat(q0).exp === 'true' && allOpenDays(q0), q0.map(d => [d.day, d.codes, d.closed]));
    await p2.evaluate(() => WIV2.paint()); await settle(p2, S2);
    const q1 = await daysOf(p2);
    await p2.evaluate(() => WI_INTERNAL.renderWeeklyIntl()); await settle(p2, S2);
    const q2 = await daysOf(p2);
    ok(scn2, 'still open after a repaint and after a full re-read (nothing folds by itself)', !sat(q1).closed && !sat(q2).closed && allOpenDays(q1) && allOpenDays(q2), { q1: sat(q1), q2: sat(q2) });
    const satH = `#content .wi4 .wi4-day[data-day="${SAT}"] .wi4-dayh`;
    await p2.click(satH);
    const q3 = await daysOf(p2);
    await p2.click(satH);
    const q4 = await daysOf(p2);
    ok(scn2, 'closed by the user: closed, aria-expanded false, and NO marker (no work under it)', sat(q3).closed && sat(q3).exp === 'false' && !sat(q3).dot, sat(q3));
    ok(scn2, 'the same click opens it again', !sat(q4).closed && sat(q4).exp === 'true', sat(q4));
    ok(scn2, 'no page errors; nothing written', !S2.pageErrors.length && !writes(S2).length, { e: S2.pageErrors, w: writes(S2) });
    await p2.context().close();
  }
}

// The reason codes each day header counts (data-codes, the SAME WI4.flags
// output) against the words drawn on its rows (data-r), visible ones only.
const REASON_CODES = ['NO_TRUCK', 'EMPTY_RETURN', 'OVER_33', 'SAME_DAY', 'LATE', 'PREORDER',
  'RELAY_NO_DRIVER', 'MATCH_UNREAD', 'PALLETS_UNKNOWN'];
// Codes that no longer exist on Weekly Intl (owner 11/10 21:20): national work
// lives on Weekly National, DATE_MISMATCH is obsolete (one synchronized VS date).
const NAT_CODES = ['NAT_NO_CARRIER', 'NAT_MISSING', 'NAT_UNKNOWN', 'DATE_MISMATCH'];
const reasonsNamed = page => page.evaluate(codes => {
  const days = [], bad = [], seen = new Set(), railNoTitle = [];
  document.querySelectorAll('#content .wi4 #wi-rows .wi4-day').forEach(day => {
    const hc = day.querySelector('[data-codes]'); if (!hc) return;
    const counted = {}; (hc.getAttribute('data-codes') || '').split(',').filter(Boolean).forEach(p => { const [k, n] = p.split(':'); counted[k] = +n; });
    const shown = {};
    day.querySelectorAll('[data-r]').forEach(el => { if (el.getClientRects().length === 0) return; const k = el.getAttribute('data-r'); shown[k] = (shown[k] || 0) + 1; });
    for (const k of codes) { if ((counted[k] || 0) !== (shown[k] || 0)) bad.push({ day: day.dataset.day, code: k, counted: counted[k] || 0, named: shown[k] || 0 }); if (counted[k]) seen.add(k); }
    days.push(day.dataset.day);
    day.querySelectorAll('.wi4-row.wi4-r-red, .wi4-row.wi4-r-amb').forEach(r => { const no = r.querySelector('.wi4-c-idx .wi4-no'); if (!no || !no.title) railNoTitle.push(r.dataset.oid); });
  });
  return { days, bad, seen: [...seen], railNoTitle };
}, REASON_CODES);

// A local relay drawn «ΠΡΟΣ ΑΝΑΘΕΣΗ» is work like any row (live since 6/10):
// rail, day header, queue item — and its day never folds it away.
async function scnRelay(browser, origin) {
  const scn = 'relay';
  const { page, S } = await openBoard(browser, origin, { mutate: db => { const m = db[T.LOCAL_MOVES].find(r => r.id === 'recWiM002'); delete m.fields.Driver; } });
  const r = await page.evaluate(() => {
    const sub = document.querySelector('#content .wi4 .wi4-subrow[data-relay="recWiM002"]');
    const day = sub && sub.closest('.wi4-day');
    const q = WIV2.queueItems().filter(x => x.relayId === 'recWiM002');
    return { sub: !!sub, rail: sub ? ['wi4-r-red', 'wi4-r-amb'].filter(c => sub.classList.contains(c)) : [], text: sub ? sub.innerText : '',
      // The header's words: the closed-day marker's label (owner 11/10, name + date visible).
      q: q.map(x => [x.code, x.level, x.act, x.rowKey]), head: day ? ((day.querySelector('[data-dc] .wi4-dayh-dot') || { getAttribute: () => '' }).getAttribute('aria-label') || '') : '', open: !!day && !day.classList.contains('closed') };
  });
  ok(scn, 'the driverless relay sub-row is drawn «ΠΡΟΣ ΑΝΑΘΕΣΗ» with a dashed amber rail (Παρ 9/10 = today+3)', r.sub && /ΠΡΟΣ ΑΝΑΘΕΣΗ/.test(r.text) && r.rail.join() === 'wi4-r-amb', r);
  ok(scn, 'one queue item RELAY_NO_DRIVER (amber, «Τοπικός οδηγός» → relayOpen), keyed by the relay record', r.q.length === 1 && r.q[0][0] === 'RELAY_NO_DRIVER' && r.q[0][1] === 'amber' && r.q[0][2] === 'relay', r.q);
  ok(scn, 'its day\'s header words (closed-day marker) say «1 τοπική χωρίς οδηγό» and it stays open', /1 τοπική χωρίς οδηγό/.test(r.head) && r.open, r);
  const named = await reasonsNamed(page);
  ok(scn, 'the relay\'s RELAY_NO_DRIVER is named on its sub-row (counted = named, per day)', named.bad.length === 0 && named.seen.includes('RELAY_NO_DRIVER'), named);
  ok(scn, 'no page errors; nothing written', !S.pageErrors.length && !writes(S).length, { e: S.pageErrors, w: writes(S) });
  await page.context().close();
  // Parity r2 (relay-subrow-cuts-status / -cut-at-1440 / -text-glyphs): the
  // status came last in one ellipsized string — «✓ φορτώθηκε» cut at 1800,
  // everything after «άλλο φορτηγ…» at 1440. A second week where both relays
  // carry a status: M001 loaded (✓), M002's day ≠ its order's (⚠).
  {
    const scn2 = 'relay.fit';
    const { page: p2, S: S2 } = await openBoard(browser, origin, { mutate: db => { db[T.LOCAL_MOVES].find(r => r.id === 'recWiM002').fields.Date = '2026-10-08'; } });
    for (const width of [1800, 1440]) {
      await p2.setViewportSize({ width, height: width === 1800 ? 800 : 900 }); await p2.waitForTimeout(400);
      const f = await relayFit(p2);
      const by = id => f.find(x => x.id === id) || { st: [], diff: [] };
      // At 1440 a ⚠ plus two «what differs» parts no longer fit a 514px
      // delivery cell: the parts give way, the status never does (the
      // fixture's own week keeps «άλλο φορτηγό …» whole at 1440 — w1440).
      ok(scn2, `${width}: both relays drawn as a flex line, each status whole and inside its row${width === 1800 ? ', the first «άλλο φορτηγό …» whole' : ''}`,
        f.length === 2 && f.every(x => x.flex && x.st.length >= 1 && x.st.every(s => s.whole) && x.diff.length >= 1 && /^άλλο φορτηγό /.test(x.diff[0].t) && (width !== 1800 || x.diff[0].whole)), f);
      ok(scn2, `${width}: done = the 10px check icon in .wi4-ok (no «✓» glyph on screen); ⚠ = the alert icon (no «⚠» glyph)`,
        by('recWiM001').st.some(s => /φορτώθηκε/.test(s.t) && s.okSvg === 10) && by('recWiM002').st.some(s => /μέρα ≠ παραγγελίας/.test(s.t) && s.svg === 11) && f.every(x => !/[✓⚠]/.test(x.text)), f);
      ok(scn2, `${width}: the text takes the empty track (pickup: ΕΞΑΓΩΓΗ + ΑΝΑΘΕΣΗ, delivery: ΕΙΣΑΓΩΓΗ + ΑΠΟ ΒΕΡΟΙΑ); the whole sentence stays in the title`,
        by('recWiM001').span === 'exp+asg' && by('recWiM002').span === 'imp+fr' && f.every(x => /^ΤΟΠΙΚΗ (ΦΟΡΤΩΣΗ|ΠΑΡΑΔΟΣΗ) · /.test(x.title) && /[✓⚠]/.test(x.title)), f);
      await shot(p2, 'relay-fit-' + width);
    }
    const r = await p2.evaluate(([js]) => eval(js)('#content .wi4'), [SCAN_JS]);
    ok(scn2, '1440: overflow scan green with the relay statuses drawn', r.n === 1 && !r.over.length, r.over.slice(0, 10));
    ok(scn2, 'no page errors; nothing written', !S2.pageErrors.length && !writes(S2).length, { e: S2.pageErrors, w: writes(S2) });
    await p2.context().close();
  }
}
// Each read relay sub-row (.wi4-rlf): its statuses (whole = not cut and
// inside the visible line and the row), its «what differs» parts, which
// tracks the text spans (by the column header's cells), its icons.
const relayFit = page => page.evaluate(() => {
  const R = e => e.getBoundingClientRect();
  const hd = c => R(document.querySelector('#content .wi4 .wi4-cols .wi4-c-' + c));
  return [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-sub-rl[data-relay]')].filter(e => e.getClientRects().length).map(sub => {
    const f = sub.querySelector('.wi4-rlf'); if (!f) return { id: sub.dataset.relay, flex: false, st: [], diff: [] };
    const fr = R(f), row = R(sub), cell = R(f.parentElement);
    const whole = x => x.scrollWidth <= x.clientWidth + 1 && R(x).left >= fr.left - 0.5 && R(x).right <= fr.right + 0.5 && R(x).right <= row.right;
    const near = (a, b) => Math.abs(a - b) <= 11;
    const span = near(cell.left, hd('exp').left) && near(cell.right, hd('asg').right) ? 'exp+asg' : near(cell.left, hd('imp').left) && near(cell.right, hd('fr').right) ? 'imp+fr' : 'other';
    return { id: sub.dataset.relay, flex: getComputedStyle(f).display === 'flex', text: f.innerText, title: f.title, span,
      st: [...f.querySelectorAll(':scope > .wi4-rl-st')].map(x => { const ok = x.querySelector('.wi4-ok > svg'), sv = x.querySelector(':scope > svg');
        return { t: x.textContent, whole: whole(x), okSvg: ok ? Math.round(R(ok).width) : null, svg: sv ? Math.round(R(sv).width) : null }; }),
      diff: [...f.querySelectorAll(':scope > .wi4-ell')].map(x => ({ t: x.textContent, whole: whole(x), title: x.title })) };
  });
});

// Overflow: every node whose text overflows carries the full text in a title.
// Contrast: text ≥ 4.5:1 against its effective background (placeholders and
// disabled controls excepted — --wi4-grey-3 is for those only).
const SCAN_JS = `(rootSel)=>{
  const roots=[...document.querySelectorAll(rootSel)]; const over=[], low=[];
  const rgb=s=>{const m=String(s).match(/rgba?\\(([^)]+)\\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x)); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
  const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);};
  const blend=(top,bot)=>({r:top.r*top.a+bot.r*(1-top.a),g:top.g*top.a+bot.g*(1-top.a),b:top.b*top.a+bot.b*(1-top.a),a:1});
  // Every background the text can sit on: a gradient (e.g. the shared navy→blue
  // primary button) counts with EACH of its stops, and the worst one decides.
  const bgsOf=el=>{const stack=[]; for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);
      const g=/gradient\\(/.test(s.backgroundImage||'')?(s.backgroundImage.match(/rgba?\\([^)]+\\)/g)||[]).map(rgb).filter(Boolean):[];
      if(g.length){stack.push({grad:g}); break;}
      const c=rgb(s.backgroundColor); if(c&&c.a>0){stack.push(c); if(c.a>=1) break;}}
    let accs=[{r:255,g:255,b:255,a:1}];
    for(let i=stack.length-1;i>=0;i--){const l=stack[i]; accs=l.grad?l.grad.flatMap(gc=>accs.map(a=>blend(gc,a))):accs.map(a=>blend(l,a));}
    return accs;};
  for(const root of roots) for(const el of root.querySelectorAll('*')){
    if(!el.offsetParent&&getComputedStyle(el).position!=='fixed') continue;
    const own=[...el.childNodes].some(n=>n.nodeType===3&&n.nodeValue.trim()); if(!own) continue;
    const st=getComputedStyle(el); if(st.visibility==='hidden'||parseFloat(st.opacity)===0) continue;
    const text=el.textContent.trim();
    if(st.display!=='inline'&&el.clientWidth>0&&el.scrollWidth>el.clientWidth+1){
      const t=(el.closest('[title]')||{}).title||''; if(!t||t.replace(/\\s+/g,' ').indexOf(text.replace(/\\s+/g,' ').slice(0,40))<0) over.push(text.slice(0,60)+' ['+el.className+']');
    }
    if(el.disabled||el.closest(':disabled')) continue;
    const fg=rgb(st.color); if(!fg) continue;
    const ratio=Math.min(...bgsOf(el).map(bg=>{const f=blend(fg,bg), L1=lum(f), L2=lum(bg); return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);}));
    if(ratio<4.5) low.push(text.slice(0,40)+' ['+el.className+'] '+ratio.toFixed(2));
  }
  return {over,low,n:roots.length};}`;
async function scnScans(browser, origin) {
  const scn = 'scans';
  const { page } = await openBoard(browser, origin);
  let r = await page.evaluate(([js]) => eval(js)('#content .wi4'), [SCAN_JS]);
  ok(scn, 'overflow scan (board): every overflowing text has its full text in a title', r.n === 1 && !r.over.length, r.over.slice(0, 15));
  ok(scn, 'contrast scan (board): text ≥ 4.5:1', r.n === 1 && !r.low.length, r.low.slice(0, 15));
  // The queue cards cut the NAME, never the reason (review 11/10: «34π ·
  // φορτώνει αύριο · χωρ…»); a NO_TRUCK card leaves «χωρίς φορτηγό» to its
  // chip and button (sheet 15).
  const qc = await page.evaluate(() => [...document.querySelectorAll('#content .wi4 #wi4-qwrap .wi4-qcard')].map(c => {
    const l2 = c.querySelector('.wi4-qcard-t > .wi4-l2');
    return { t: l2 ? l2.textContent : '', cut: !!l2 && l2.scrollWidth > l2.clientWidth + 1 }; }));
  ok(scn, 'queue cards at 1920: the reason is whole on every card; a card never repeats «χωρίς φορτηγό»', qc.length === 3 && qc.every(c => !c.cut && !/χωρίς φορτηγό/.test(c.t)), qc);
  // «Όλα N ▾» (sheet 15 B, fix round 3): ~600px, under the queue band from its
  // LEFT edge, one line per item (it was 440px at «Όλα»'s right edge, over the
  // import column, and wrapped every second item).
  await page.locator('#content .wi4 .wi4-q-all').click(); await page.waitForTimeout(250);
  const qp = await page.evaluate(() => { const p = document.querySelector('.wi4-qp'), q = document.querySelector('#content .wi4 .wi4-q');
    if (!p || !q) return null; const b = p.getBoundingClientRect(), qb = q.getBoundingClientRect();
    const items = [...p.querySelectorAll('.wi4-qp-i')].map(i => Math.round(i.getBoundingClientRect().height));
    const cut = [...p.querySelectorAll('.wi4-qp-i .wi4-l2')].filter(l => l.scrollWidth > l.clientWidth + 1 && !l.title).length;
    return { w: Math.round(b.width), left: Math.round(b.left), qLeft: Math.round(qb.left), top: Math.round(b.top), qBottom: Math.round(qb.bottom), tall: items.filter(h => h > 34).length, n: items.length, cut }; });
  ok(scn, '«Όλα» opens 640px (Figma 1117:2676) under the queue band from its left edge, one line per item', !!qp && qp.w >= 560 && qp.w <= 640 && Math.abs(qp.left - qp.qLeft) <= 2 && qp.top >= qp.qBottom && qp.n > 10 && !qp.tall && !qp.cut, qp);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // Overlays too: the per-load menu and the date panel.
  await page.locator('#content .wi4 .wi4-plane').first().click(); await page.waitForTimeout(300);
  r = await page.evaluate(([js]) => eval(js)('#wi-ctx'), [SCAN_JS]);
  ok(scn, 'contrast + overflow scan (per-load menu)', !r.low.length && !r.over.length, r);
  await page.keyboard.press('Escape');
  const chip = await page.evaluate(js => { const r = eval(js)('recWiE014'); const c = r && r.querySelector('.wi4-c-exp .wi4-dc'); if (c) c.setAttribute('data-rig', 'chip'); return !!c; }, ROW_JS);
  if (chip) { await page.locator('[data-rig="chip"]').click(); await page.waitForTimeout(300); }
  r = await page.evaluate(([js]) => eval(js)('.wi4-datep'), [SCAN_JS]);
  ok(scn, 'contrast + overflow scan (date panel)', r.n === 1 && !r.low.length && !r.over.length, r);
  await shot(page, 'date-panel');
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
    // The evidence is the FAILURE (review 11/10: the shot was taken after the retry).
    await shot(page, 'unknown-relay');
    S.fail.relay = 0;
    const retry = page.locator('#content .wi4 .wi4-banner .wi4-link, #content .wi4 .wi4-banner button').first();
    if (await retry.count()) { await retry.click(); await settle(page, S); }
    ok(scn, '«Ξαναδοκίμασε» re-reads and the banner goes', !(await page.evaluate(() => /δεν φορτώθηκαν/.test((document.querySelector('#content .wi4') || {}).innerText || ''))));
    // …and the failed read's own toasts go with it: the board now HAS the data.
    const stale = await page.evaluate(() => [...((document.getElementById('tms-toast-container') || {}).children || [])].map(t => (t.textContent || '').trim()).filter(t => /Τα δεδομένα δεν φορτώθηκαν|Σφάλμα (server|σύνδεσης)/.test(t)));
    ok(scn, 'after a successful retry no stale «Τα δεδομένα δεν φορτώθηκαν» / «Σφάλμα …» toast is left', !stale.length, stale);
    await shot(page, 'unknown-relay-retried');
    await page.context().close();
  }
  scn = 'unknown.national';
  {
    const { page, S } = await openBoard(browser, origin, { fail: { nl: 500 } });
    await settle(page, S, 2600);
    const r = await page.evaluate(() => ({ un: document.querySelectorAll('#content .wi4 .wi4-tile.un').length,
      unk: [...document.querySelectorAll('#content .wi4 .wi4-tile.unk')].map(t => t.title || (t.closest('[title]') || {}).title || ''),
      codes: WIV2.queueItems().map(q => q.code), hd: (document.querySelector('#content .wi4 .wi4-q-hd') || {}).innerText || '',
      heads: [...document.querySelectorAll('#content .wi4 [data-dc] .wi4-dayh-dot')].map(h => h.getAttribute('aria-label') || '') }));
    ok(scn, 'national read 500 → never «ΠΡΟΣ ΑΝΑΘΕΣΗ» on an unread leg', r.un === 0, r.un);
    ok(scn, '«—» tiles titled «απέτυχε — δεν σημαίνει ότι δεν έχουν μεταφορέα»', r.unk.length >= 3 && r.unk.every(t => /απέτυχε/.test(t) && /δεν σημαίνει/.test(t)), r.unk);
    // Owner 11/10 21:20: a failed national read is said on its tiles only —
    // never an intl queue item, a «≥» on the band or a closed-day marker.
    ok(scn, 'zero NAT_UNKNOWN (no national code at all) in the queue', !r.codes.some(c => NAT_CODES.includes(c)), r.codes);
    ok(scn, 'no «≥» on the band caused by the national read alone', !/≥/.test(r.hd) && !/φορτώνει/.test(r.hd), r.hd);
    ok(scn, 'no closed-day marker says «εθνικά σκέλη»', !r.heads.some(h => /εθνικ/.test(h)), r.heads);
    await page.context().close();
  }
  scn = 'unknown.national-slow';
  {
    const { page, S } = await openBoard(browser, origin, { hold: { nl: true } });
    await settle(page, S);   // every other source answered: only the national read is in flight
    const r = await page.evaluate(() => ({ un: document.querySelectorAll('#content .wi4 .wi4-tile.un').length,
      unk: [...document.querySelectorAll('#content .wi4 .wi4-tile.unk')].map(t => t.title || (t.closest('[title]') || {}).title || ''),
      codes: WIV2.queueItems().map(q => q.code), q: ((document.querySelector('#content .wi4 .wi4-q-hd') || {}).innerText || ''),
      heads: [...document.querySelectorAll('#content .wi4 [data-dc] .wi4-dayh-dot')].map(h => (h.getAttribute('aria-label') || '') + ' ' + h.className) }));
    ok(scn, 'while the national read is pending: «—» titled «δεν φορτώθηκε ακόμη», no «ΠΡΟΣ ΑΝΑΘΕΣΗ»', r.un === 0 && r.unk.length >= 3 && r.unk.every(t => /δεν φορτώθηκε ακόμη/.test(t)), r);
    // Owner 11/10 21:20: a national read in flight is not intl work — no
    // «≥N · φορτώνει…» on the band and no marker words because of it.
    ok(scn, 'no national item while loading; the band says neither «≥» nor «φορτώνει» because of the national read alone', !r.codes.some(c => NAT_CODES.includes(c)) && !/≥/.test(r.q) && !/φορτώνει/.test(r.q), r);
    ok(scn, 'no closed-day marker says «εθνικά σκέλη» or wears the grey ring', !r.heads.some(h => /εθνικ|\bunk\b/.test(h)), r.heads);
    S.hold.nl = false; S.held.splice(0).forEach(fn => fn()); await settle(page, S);
    const after = await page.evaluate(([js, codes]) => { const row = eval(js); const el = (oid, sel) => { const r = row(oid); return r && r.querySelector(sel); };
      const fr = el('recWiE014', '.wi4-c-fr .wi4-tile.un');
      return { e14own: !!el('recWiE014', '.wi4-c-fl .wi4-tile.own'), i05un: !!fr && fr.textContent === 'ΠΡΟΣ ΑΝΑΘΕΣΗ' && fr.getAttribute('data-r') === null && !/\bred\b/.test(fr.className),
        nat: WIV2.queueItems().filter(q => codes.includes(q.code) || q.key === 'recWiI005').map(q => q.code) }; }, [ROW_JS, NAT_CODES]);
    ok(scn, 'after it lands: E014\'s own carrier tile, I005\'s «ΠΡΟΣ ΑΝΑΘΕΣΗ» (no data-r, not red) and NO queue item for it', after.e14own && after.i05un && !after.nat.length, after);
    await page.context().close();
  }
  scn = 'unknown.w1';
  {
    const { page, S } = await openBoard(browser, origin, { fail: { crossWeek: 500 } });
    await page.waitForTimeout(1000); await settle(page, S, 2600);   // the W+1 read has no state seam: wait out its retries
    const r = await page.evaluate(() => ({ q: WIV2.queueItems().filter(q => q.code === 'SOURCE_UNKNOWN').map(q => q.source),
      hd: (document.querySelector('#content .wi4 .wi4-q') || {}).innerText || '',
      tabB: [...document.querySelectorAll('.wi4-top .wi4-tab')].map(t => (t.querySelector('.wi4-tab-b') || {}).textContent || '').filter(Boolean) }));
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
    res[flag] = { r, w: writeSig(S), db: ordersSig(S), S, errs: S.pageErrors.slice(), exp: patches(S).filter(p => p.expect !== undefined).length,
      toasts: (await evs(page).catch(() => [])).filter(e => /toast|reportError/.test(e.k)).map(e => String(e.a[0]).slice(0, 160)) };
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
    // As a user reaches it: from the row, on screen. The handler is eval'd
    // here, and the old panel places itself under its anchor row — with the
    // row below the fold (v4 opens at the top of the week) it flipped above
    // an off-screen anchor and its buttons were out of reach.
    await page.evaluate(([js]) => { const r = eval(js)('recWiI014'); if (r) r.scrollIntoView({ block: 'center' }); }, [ROW_JS]);
    const okOpen = await page.evaluate(h => { try { (0, eval)(h); return true; } catch (e) { return String(e); } }, handler);
    await page.waitForTimeout(400);
    // A click that never landed is a failed check, never a silent pass.
    const picked = await page.locator(`#wi-panel .wiGrpPick[value="${pick}"]`).check({ timeout: 5000 }).then(() => true, () => false);
    const title = await page.evaluate(() => ({ t: (document.querySelector('#wi-panel .wi-panel-title') || {}).textContent || '', b: (document.querySelector('#wi-panel .wi-panel-ft .btn-primary') || {}).textContent || '' }));
    const confirmed = await page.locator('#wi-panel .wi-panel-ft .btn-primary').click({ timeout: 5000 }).then(() => true, () => false);
    await page.waitForTimeout(1500);
    return { okOpen, title, picked, confirmed };
  });
  ok(scn, 'panel opened on both boards', res.off.r.okOpen === true && res.on.r.okOpen === true, [res.off.r.okOpen, res.on.r.okOpen]);
  ok(scn, 'the pick and the confirm click landed on both boards', res.off.r.picked && res.off.r.confirmed && res.on.r.picked && res.on.r.confirmed, { v1: res.off.r, v4: res.on.r });
  ok(scn, 'v4 panel title + primary button relabelled «Groupage εισαγωγών»', /Groupage εισαγωγών/.test(res.on.r.title.t) && /Groupage εισαγωγών/.test(res.on.r.title.b), res.on.r.title);
  ok(scn, 'v4 writes = v1 writes; every member of the joining group moved', JSON.stringify(res.on.w) === JSON.stringify(res.off.w) && res.on.w.length >= 2, { v1: res.off.w, v4: res.on.w });
  ok(scn, 'table: I016 and I017 carry I014\'s Group ID and truck', ['recWiI016', 'recWiI017'].every(id => fld(res.on.S, id, 'Group ID') === fld(res.on.S, 'recWiI014', 'Group ID') && link(fld(res.on.S, id, 'Truck')) === 'recWiT018'));
  ok(scn, 'final ORDERS table identical', res.on.db === res.off.db);
}

// The handler string of a v4 menu item, by label — top level first, then the
// member/relay submenus. The SAME string then runs on both boards (§e.9: only
// labels are relabelled), so the twin compares the writes of one action.
async function menuHandler(page, oid, re) {
  const m = await openMenu(page, oid);
  let it = m.items.find(i => !i.more && i.onclick && re.test(i.label));
  if (!it) for (const s of await readSubs(page)) { it = s.items.find(i => i.onclick && re.test(i.label)); if (it) break; }
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  return it ? it.onclick : null;
}
const lmSig = S => JSON.stringify((S.db[T.LOCAL_MOVES] || []).map(r => [r.id, r.fields]).sort());
// The order-write rule of CLAUDE.md («ανοίγει και δοκιμάζεται πριν το push»)
// for the actions v4 reaches through its menu (review 11/10, P2 coverage):
// unmatch, rota, split, stock piece → truck, local relay. Same handler, both
// boards, same writes and the same final ORDERS / LOCAL_MOVES tables.
async function scnTwins(browser, origin) {
  const cases = [
    { scn: 'twins.unmatch', oid: 'recWiE001', label: /^Αφαίρεση ταιριάσματος$/,
      act: async (page) => { await confirmIfAsked(page, 3000); return {}; },
      check: (S) => !fld(S, 'recWiE001', 'Matched Import ID') },
    // A leg must be bare (no assignment of its own, _wiRotLegBare): I004 — the
    // free import loading at E007's delivery place — is the candidate a
    // dispatcher would pick; the panel's first one carries a truck and is refused.
    { scn: 'twins.rota', oid: 'recWiE007', label: /^Σκέλος προώθησης \(ρότα\)…$/,
      act: async (page) => {
        const picked = await page.evaluate(() => { const all = [...document.querySelectorAll('#wi-panel input[name="wiRotaPick"]')];
          const r = all.find(x => x.value === 'leg:recWiI004') || all.find(x => x.checked); if (r) r.checked = true; return { v: r ? r.value : null, all: all.map(x => x.value) }; });
        const clicked = await page.locator('#wi-panel .wi-panel-ft .btn-primary').click({ timeout: 5000 }).then(() => true, () => false);
        await confirmIfAsked(page, 3000); await page.waitForTimeout(800); return { picked, clicked }; },
      check: (S, r) => !!r.picked && r.picked.v === 'leg:recWiI004' && fld(S, 'recWiI004', 'Rotation ID') === 'recWiE007' },
    { scn: 'twins.split', oid: 'recWiE007', label: /^Σπάσιμο σκέλους…$/,
      act: async (page) => {
        await page.waitForSelector('#wi-panel #wiSplitGo', { timeout: 5000 }).catch(() => {});
        const set = await page.evaluate(() => { const l = document.getElementById('lv_wiSplitLoc'), d = document.getElementById('wiSplitDt'); if (!l || !d) return false; l.value = 'recWiL021'; d.value = '2026-10-07T10:00'; return true; });
        const clicked = set && await page.locator('#wi-panel #wiSplitGo').click({ timeout: 5000 }).then(() => true, () => false);
        await confirmIfAsked(page, 3000); await page.waitForTimeout(1500); return { set, clicked }; },
      check: (S) => S.db[T.ORDERS].filter(x => link(x.fields['Parent Order']) === 'recWiE007').length === 2 },
    { scn: 'twins.piece', oid: 'recWiE006', label: /^\+ Κομμάτι από απόθεμα…$/,
      act: async (page) => {
        const btn = page.locator(`#wi-panel .wi-stk-opt[onclick*="'piece'"]`).first();
        const clicked = await btn.click({ timeout: 5000 }).then(() => true, () => false);
        await confirmIfAsked(page, 3000); await page.waitForTimeout(1200); return { clicked }; },
      check: (S) => fld(S, 'recWiE006', 'Matched Import ID') === 'recWiI012' && link(fld(S, 'recWiI012', 'Truck')) === 'recWiT006' },
    // Fix round 3 (review 11/10, coverage): the groupage writes — dissolve, one
    // member out, a new groupage built through the panel.
    { scn: 'twins.dissolve', oid: 'recWiE011', label: /^Διάλυση groupage$/,
      act: async (page) => { await confirmIfAsked(page, 3000); await page.waitForTimeout(1200); return {}; },
      check: (S) => ['recWiE011', 'recWiE012', 'recWiE013'].every(id => !fld(S, id, 'Group ID')) },
    { scn: 'twins.member', oid: 'recWiE011', label: /^Βγάλε από το groupage$/,
      act: async (page) => { await confirmIfAsked(page, 3000); await page.waitForTimeout(1500); return {}; },
      check: (S) => { const g = ['recWiE011', 'recWiE012', 'recWiE013'].map(id => fld(S, id, 'Group ID') || null); return g.filter(Boolean).length === 2 && new Set(g.filter(Boolean)).size === 1; } },
    { scn: 'twins.groupBuild', oid: 'recWiE007', label: /^Groupage εξαγωγών…$/,
      act: async (page) => {
        const pick = await page.evaluate(() => { const i = document.querySelector('#wi-panel .wiGrpPick'); if (i) { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); } return i ? i.value : null; });
        const clicked = !!pick && await page.locator('#wi-panel .wi-panel-ft .btn-primary').click({ timeout: 5000 }).then(() => true, () => false);
        await confirmIfAsked(page, 2000); await page.waitForTimeout(1500); return { pick, clicked }; },
      check: (S) => !!fld(S, 'recWiE007', 'Group ID') && S.db[T.ORDERS].filter(o => o.fields['Group ID'] && o.fields['Group ID'] === fld(S, 'recWiE007', 'Group ID')).length >= 2 },
    { scn: 'twins.relay', oid: 'recWiE007', label: /τοπικό οδηγό/,
      act: async (page) => {
        await page.waitForSelector('#rly_submit', { timeout: 6000 }).catch(() => {});
        const set = await page.evaluate(() => { const d = document.getElementById('rly_drv'), t = document.getElementById('rly_time'); if (!d || d.options.length < 2) return false;
          d.value = d.options[1].value; d.dispatchEvent(new Event('change', { bubbles: true })); if (t) { t.value = '06:00'; t.dispatchEvent(new Event('input', { bubbles: true })); } return d.value; });
        const clicked = !!set && await page.locator('#rly_submit').click({ timeout: 5000 }).then(() => true, () => false);
        await page.waitForTimeout(1500); return { set, clicked }; },
      check: (S) => (S.db[T.LOCAL_MOVES] || []).some(m => link(m.fields.Order) === 'recWiE007' || link(m.fields['Parent Order']) === 'recWiE007' || JSON.stringify(m.fields).includes('recWiE007')) },
  ];
  for (const c of cases) {
    let handler = null;
    { const { page } = await openBoard(browser, origin); handler = await menuHandler(page, c.oid, c.label); await page.context().close(); }
    ok(c.scn, `the v4 menu of ${c.oid.slice(-4)} offers it`, !!handler, handler);
    if (!handler) continue;
    const res = await twin(browser, origin, c.scn, async (page, S) => {
      await page.evaluate(([js, oid]) => { const r = eval(js)(oid); if (r) r.scrollIntoView({ block: 'center' }); }, [ROW_JS, c.oid]);
      const opened = await page.evaluate(h => { try { const p = (0, eval)(h); return Promise.resolve(p).then(() => true, e => String(e)); } catch (e) { return String(e); } }, handler);
      await page.waitForTimeout(500);
      return Object.assign({ opened }, await c.act(page, S));
    });
    ok(c.scn, 'it ran on both boards (panel/form found, buttons clicked)', res.off.r.opened === true && res.on.r.opened === true && Object.values(res.off.r).concat(Object.values(res.on.r)).every(v => v !== false), { v1: res.off.r, v4: res.on.r });
    ok(c.scn, 'something was written', res.on.w.length > 0, res.on.w);
    ok(c.scn, 'v4 writes = v1 writes (table, record, fields)', JSON.stringify(res.on.w) === JSON.stringify(res.off.w), { v1: res.off.w, v4: res.on.w });
    ok(c.scn, 'final ORDERS and LOCAL_MOVES tables identical', res.on.db === res.off.db && lmSig(res.on.S) === lmSig(res.off.S));
    const brief = res.on.w.map(w => { const [k, tid, id, f] = JSON.parse(w); return `${k} ${String(tid).slice(-5)} ${id} {${Object.keys(f || {}).join(',').slice(0, 60)}}`; });
    ok(c.scn, 'the table says so', c.check(res.on.S, res.on.r), { r: res.on.r, writes: brief, toasts: (res.on.toasts || []).slice(-4) });
    ok(c.scn, 'no page errors', !res.on.errs.length && !res.off.errs.length, { v1: res.off.errs, v4: res.on.errs });
  }
  // «+ Νέα εισαγωγή» on an empty return (the gap cell, not a menu item): the
  // pending match the order form consumes. The rig does not type the whole
  // form: the record is created as orders_intl does, then the match consumed.
  {
    const scn = 'twins.newImport';
    const res = await twin(browser, origin, scn, async (page, S) => {
      const rid = await rowOf(page, 'recWiE008');
      await page.evaluate(id => WI_INTERNAL.newImport(id), rid); await page.waitForTimeout(800);
      const pending = await page.evaluate(id => !!window._wiPendingMatch && window._wiPendingMatch.rowId === id, rid);
      S.db[T.ORDERS].push({ id: 'recWiNEW902', fields: { Type: 'International', Direction: 'Import', Status: 'Pending',
        'Loading DateTime': '2026-10-08T05:00:00.000Z', 'Delivery DateTime': '2026-10-10T07:00:00.000Z', 'Total Pallets': 4 } });
      await page.evaluate(() => _wiConsumePendingMatch('recWiNEW902', { Direction: 'Import' }));
      await page.evaluate(() => { if (typeof closeModal === 'function') closeModal(); });
      await page.waitForTimeout(1500);
      return { pending };
    });
    ok(scn, 'the form held the pending match for E008 on both boards', res.off.r.pending === true && res.on.r.pending === true, { v1: res.off.r, v4: res.on.r });
    ok(scn, 'something was written', res.on.w.length > 0, res.on.w);
    ok(scn, 'v4 writes = v1 writes (table, record, fields)', JSON.stringify(res.on.w) === JSON.stringify(res.off.w), { v1: res.off.w, v4: res.on.w });
    ok(scn, 'final ORDERS table identical', res.on.db === res.off.db);
    ok(scn, 'the table says so: E008 is matched to the new import', fld(res.on.S, 'recWiE008', 'Matched Import ID') === 'recWiNEW902', res.on.w);
    ok(scn, 'no page errors', !res.on.errs.length && !res.off.errs.length, { v1: res.off.errs, v4: res.on.errs });
  }
}

// The queue band's buttons and Q resolve the card's ORDER at click time (§f):
// a repaint that shifts every row id must not send «Ανάθεση» to the wrong row.
// Print / WhatsApp from the menu and from P reach the existing sheet for the
// right order (review 11/10, P2 coverage).
async function scnQueue(browser, origin) {
  const scn = 'queue';
  const { page, S } = await openBoard(browser, origin);
  const ids0 = await page.evaluate(() => Object.fromEntries(WIV2.queueItems().filter(q => q.key).map(q => [q.key, WIV2.rowIdOf(q.key)])));
  // A new export delivered on Saturday sorts first: every row id after it moves.
  S.db[T.ORDERS].push({ id: 'recWiZZZ001', fields: { Type: 'International', Direction: 'Export', Status: 'Pending', Client: ['recWiC001'],
    'Loading DateTime': '2026-10-02T05:00:00.000Z', 'Delivery DateTime': '2026-10-03T06:00:00.000Z', 'Total Pallets': 10, Reference: 'REF-Z001' } });
  await page.evaluate(() => WI_INTERNAL.renderWeeklyIntl()); await settle(page, S, 1200);
  const shift = await page.evaluate(ids0 => Object.keys(ids0).filter(k => WIV2.rowIdOf(k) != null && WIV2.rowIdOf(k) !== ids0[k]).length, ids0);
  ok(scn, 'the repaint shifted the row ids of the queue\'s orders', shift > 0, shift);
  const cards = await page.evaluate(() => WIV2.queueItems().slice(0, 3).map(q => ({ key: q.key, act: q.act, code: q.code })));
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    await neutral(page);
    const btn = page.locator('#content .wi4 #wi4-qwrap .wi4-qcard').nth(i).locator('button');
    const clicked = await btn.click({ timeout: 4000 }).then(() => true, () => false);
    await page.waitForTimeout(400);
    const got = await page.evaluate(() => {
      const p = document.getElementById('wi-popover'); const open = !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim();
      const row = open ? WINTL.rows.find(r => r.id === Number(p.dataset.rowId)) : null;
      return { pop: open, popOrders: row ? (row.orderIds || [row.orderId]) : [], pending: window._wiPendingMatch ? window._wiPendingMatch.rowId : null,
        modal: !!(document.querySelector('#modalOverlay.open') || document.querySelector('.mf-overlay')) };
    });
    const target = await page.evaluate(k => WIV2.rowIdOf(k), c.key);
    const okAct = c.act === 'assign' ? got.pop && got.popOrders.includes(c.key)
      : c.act === 'newImport' ? got.pending === target
      : c.act === 'open' || c.act === 'convert' ? got.modal : true;
    ok(scn, `card ${i + 1} «${c.code}» → its action on ${c.key.slice(-4)} (resolved at click time)`, clicked && okAct, { c, got, target });
    await page.evaluate(() => { if (typeof _wiClosePopover === 'function') _wiClosePopover(); if (typeof closeModal === 'function') closeModal(); window._wiPendingMatch = null; });
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  // Q walks the queue in its order, over the items whose row is on the board.
  await neutral(page);
  const want = await page.evaluate(() => WIV2.queueItems().filter(q => q.rowKey && WIV2.rowIdOf(q.rowKey) != null).map(q => q.rowKey).filter((k, i, a) => a.indexOf(k) === i).slice(0, 3));
  const seen = [];
  for (let i = 0; i < want.length; i++) { await page.keyboard.press('KeyQ'); await page.waitForTimeout(120); seen.push(await page.evaluate(() => WINTL.ui && WINTL.ui.v4Focus)); }
  ok(scn, 'Q cycles the queue\'s rows in queue order', want.length >= 2 && seen.join() === want.join(), { want, seen });
  // Print / WhatsApp: the menu item and P open the existing sheet for the right order.
  await page.evaluate(() => { window.__prints = []; window.printOrderSheet = function () { window.__prints.push([...arguments]); }; });
  const pr = await menuHandler(page, 'recWiE001', /^Εκτύπωση \/ WhatsApp…$/);
  if (pr) await page.evaluate(h => (0, eval)(h), pr);
  await neutral(page);
  await page.evaluate(() => WIV2.focusRow('recWiI020')); await page.keyboard.press('KeyP'); await page.waitForTimeout(200);
  const prints = await page.evaluate(() => window.__prints);
  ok(scn, 'Print / WhatsApp from the menu → the sheet of E001 (export); P on I020 → the sheet of I020', !!pr && prints.length === 2 && prints[0][0] === 'recWiE001' && prints[0][1] === 'export' && prints[1][0] === 'recWiI020', { pr, prints });
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();

  // ═══ Parity round 1 (queue-stock): the band's cards and the ΑΠΟΘΕΜΑ strip
  // against Figma sheet 15 (1115:2706 / 1115:2746), at 1920. Two more lots
  // give the strip its red and amber chips: one moving without intake
  // («nointake»), one fully delivered with pallets left («close»).
  {
    const { page: pg, S: S2 } = await openBoard(browser, origin, { mutate: db => {
      const L = db[T.STOCK_LOTS], f0 = L[0].fields;
      L.push({ id: 'recWiLOT901', fields: Object.assign({}, f0, { Order: [], 'Warehouse Name': 'Rho Warehouse', 'Intake Delivered': false, Pieces: 2, 'Pieces Moving': 2 }) });
      L.push({ id: 'recWiLOT902', fields: Object.assign({}, f0, { Order: [], 'Warehouse Name': 'Sigma Warehouse', 'Intake Status': 'Delivered', 'Intake Delivered': true,
        Pieces: 2, 'Pieces Delivered': 2, 'Remaining Pallets': 5, 'Received On': '2026-10-01' }) });
    } });
    await shot(pg, 'queue-band-1920');
    const g = await pg.evaluate(() => {
      const cs = el => getComputedStyle(el), R = el => el.getBoundingClientRect(), px = v => Math.round(parseFloat(v) * 100) / 100;
      const cards = [...document.querySelectorAll('#content .wi4 #wi4-qwrap .wi4-qcard')].filter(c => c.querySelector('.wi4-qcard-t'));
      const card = c => { const s = cs(c), b = c.querySelector('.wi4-btn'), dc = c.querySelector('.wi4-dc'), bs = b && cs(b), rail = getComputedStyle(c, '::before');
        return { w: px(R(c).width), padL: s.paddingLeft, padR: s.paddingRight, gap: s.columnGap, border: s.borderTopColor, chipW: dc ? px(R(dc).width) : null,
          textX: px(R(c.querySelector('.wi4-qcard-t')).left - R(c).left), l1: cs(c.querySelector('.wi4-l1')).fontSize, l2: (c.querySelector('.wi4-l2') && cs(c.querySelector('.wi4-l2')).fontSize) || null,
          btn: bs ? [bs.fontSize, bs.borderTopLeftRadius, bs.paddingLeft] : null, rail: [rail.left, rail.top, rail.bottom] }; };
      const all = document.querySelector('#content .wi4 .wi4-q-all'), hd = document.querySelector('#content .wi4 .wi4-q-hd'), qn = document.querySelector('#content .wi4 .wi4-q-n');
      const lbl = document.querySelector('#content .wi4 .wi-shelf-lbl'), k = lbl && lbl.querySelector('.wi-shelf-k');
      const chipEls = [...document.querySelectorAll('#content .wi4 .wi-shelf-chip')];
      const chips = chipEls.map(c => { const s = cs(c), gl = c.querySelector('span[aria-hidden]'), fl = c.querySelector('.fl');
        return { cls: c.className.replace('wi-shelf-chip', '').trim(), h: px(R(c).height), radius: s.borderTopLeftRadius, bg: s.backgroundColor, border: s.borderTopColor, gap: s.columnGap,
          fw: s.fontWeight, b: cs(c.querySelector('b')).fontWeight, glyph: gl ? [cs(gl).fontSize, cs(gl).color] : null, fl: fl ? [cs(fl).color, cs(fl).fontWeight] : null, text: c.textContent }; });
      // Parity r2 (Figma 1115:2746): chip → chip, and the label's TEXT end → the first chip.
      const chipGaps = chipEls.slice(1).map((c, i) => px(R(c).left - R(chipEls[i]).right));
      const rg = lbl && document.createRange(); if (rg) rg.selectNodeContents(lbl);
      const lblToChip = rg && chipEls[0] ? px(R(chipEls[0]).left - rg.getBoundingClientRect().right) : null;
      const sv = document.querySelector('#content .wi4 .wi4-search > svg');
      const stockSub = WIV2.queueItems().filter(q => q.code === 'STOCK_LOT').map(q => [q.lotId, q.sub]);
      const lo = document.querySelector('#content .wi4 .wi-shelf-loose'), late = lo && lo.querySelector('.wi-shelf-late'), los = lo && cs(lo);
      return { cards: cards.map(card), all: all ? [cs(all).fontSize, cs(all).fontWeight] : null,
        hd: hd ? { fs: cs(hd).fontSize, ls: cs(hd).letterSpacing, color: cs(hd).color, w: px(R(hd).width), n: qn && cs(qn).fontSize } : null,
        lbl: lbl ? { ff: cs(lbl).fontFamily, fs: cs(lbl).fontSize, fw: cs(lbl).fontWeight, ls: cs(lbl).letterSpacing, color: cs(lbl).color, text: lbl.textContent,
          k: k ? [k.textContent, cs(k).color, cs(k).fontSize, cs(k).fontWeight] : null } : null,
        chips, chipGaps, lblToChip, searchIco: sv ? cs(sv).color : null, stockSub, loose: lo ? { text: lo.textContent, h: px(R(lo).height), radius: los.borderTopLeftRadius, border: [los.borderTopStyle, los.borderTopColor], bg: los.backgroundColor,
          color: los.color, late: late ? [late.textContent, cs(late).color] : null } : null };
    });
    const c = g.cards;
    // F7 (Figma 1115:2710): pl 10 / pr 8, gap 10, border #eaecf0 (--wi4-line-3, parity r2), a 70px centred chip so every
    // name starts at the same x (1 + 10 + 70 + 10 = 91), the rail over the card's own border.
    ok(scn, 'F7 queue card: pl 10 · pr 8 · gap 10 · border --wi4-line-3 #eaecf0 · the text at x=91 on every card (70px chip)', c.length === 3 && c.every(x => x.padL === '10px' && x.padR === '8px' && x.gap === '10px'
      && x.border === 'rgb(234, 236, 240)' && x.chipW >= 70 && Math.abs(x.textX - 91) <= 1), c);
    ok(scn, 'F7 queue card type: name 12.5px, reason 11px, button 12px radius 4 px 10; the rail covers the border (−1px); «Όλα» 12.5px 500',
      c.every(x => x.l1 === '12.5px' && x.l2 === '11px' && x.btn && x.btn.join() === '12px,4px,10px' && x.rail.join() === '-1px,-1px,-1px') && !!g.all && g.all.join() === '12.5px,500', { c, all: g.all });
    // F8 (1115:2707): label column 150px, ΕΠΟΜΕΝΑ 10.5px / .42 in #344054, sub 11.5px.
    ok(scn, 'F8 queue label: 150px column, 10.5px, tracking .42px, --wi4-grey-1; sub 11.5px', !!g.hd && g.hd.w >= 150 && g.hd.fs === '10.5px' && g.hd.ls === '0.42px' && g.hd.color === 'rgb(52, 64, 84)' && g.hd.n === '11.5px', g.hd);
    // Parity r2 (Figma 1115:2735): the search magnifier is stroked #5B6B7F, not the box's ink.
    ok(scn, 'F8 search icon: --wi4-grey-2 rgb(91, 107, 127)', g.searchIco === 'rgb(91, 107, 127)', g.searchIco);
    // F4 (1115:2748/2749): DM Sans 600 10.5 / .42 #344054; «· 2 προς έλεγχο» Medium 11 in amber — words, never «⚠».
    const L4 = g.lbl;
    ok(scn, 'F4 ΑΠΟΘΕΜΑ: DM Sans 600 10.5px, tracking .42px, --wi4-grey-1; «· 2 προς έλεγχο» 500 11px --wi4-amber', !!L4 && /DM Sans/.test(L4.ff) && !/Syne/.test(L4.ff) && L4.fs === '10.5px' && L4.fw === '600'
      && L4.ls === '0.42px' && L4.color === 'rgb(52, 64, 84)' && !!L4.k && L4.k[0] === '· 2 προς έλεγχο' && L4.k[1] === 'rgb(180, 83, 9)' && L4.k[2] === '11px' && L4.k[3] === '500' && !/⚠/.test(L4.text), L4);
    // F5 (1115:2750/2757/2764): h24, radius 4, gap 5, white; red / amber / neutral outlines; flags 600 in red / amber.
    const by = k => g.chips.find(x => x.cls === k);
    ok(scn, 'F5 lot chips: 24px, radius 4px, white, gap 5, 400 with 600 names; ▣ 10px in --wi4-grey-2', g.chips.length === 3 && g.chips.every(x => x.h === 24 && x.radius === '4px' && x.bg === 'rgb(255, 255, 255)'
      && x.gap === '5px' && x.fw === '400' && x.b === '600' && !!x.glyph && x.glyph.join() === '10px,rgb(91, 107, 127)'), g.chips);
    ok(scn, 'F5 lot chips: nointake outlined #fca5a5 with its flag in --wi4-red; close outlined #fcd34d with its flag in --wi4-amber; ok #E2E8F0',
      !!by('nointake') && by('nointake').border === 'rgb(252, 165, 165)' && by('nointake').fl.join() === 'rgb(185, 28, 28),600'
      && !!by('close') && by('close').border === 'rgb(252, 211, 77)' && by('close').fl.join() === 'rgb(180, 83, 9),600' && !!by('ok') && by('ok').border === 'rgb(226, 232, 240)', g.chips);
    // Parity r2 (Figma 1115:2746): chips 8px apart; 16px from the label's text to the first chip (pr 8 + gap 8).
    ok(scn, 'F5 lot chips 8±1px apart; label text end → first chip 16±1px', g.chipGaps.length >= 2 && g.chipGaps.every(v => Math.abs(v - 8) <= 1) && g.lblToChip != null && Math.abs(g.lblToChip - 16) <= 1,
      { gaps: g.chipGaps, lblToChip: g.lblToChip });
    // Parity r2 (Figma 1115:2763 / 1117:2799): «να κλείσει;» on the chip AND on the queue's STOCK_LOT item — one word list (LOT_WORDS).
    const s902 = g.stockSub.find(x => x[0] === 'recWiLOT902');
    ok(scn, 'F5 close lot: the chip ends «να κλείσει;» and its STOCK_LOT queue item says the same', !!by('close') && /να κλείσει;$/.test(by('close').text) && !!s902 && s902[1] === 'να κλείσει;',
      { chip: by('close') && by('close').text, stockSub: g.stockSub });
    // F6 (1115:2777): the count stays neutral, only «· 1 εκπρόθεσμο» is red.
    const lo = g.loose;
    ok(scn, 'F6 loose pieces: 24px, radius 4, solid --wi4-ctl, white, --wi4-grey-1; only «· 1 εκπρόθεσμο» in --wi4-red', !!lo && lo.h === 24 && lo.radius === '4px' && lo.border.join() === 'solid,rgb(208, 213, 221)'
      && lo.bg === 'rgb(255, 255, 255)' && lo.color === 'rgb(52, 64, 84)' && !!lo.late && lo.late[0] === '· 1 εκπρόθεσμο' && lo.late[1] === 'rgb(185, 28, 28)'
      && lo.text === '1 κομμάτι χωρίς φορτηγό · 1 εκπρόθεσμο', lo);
    ok(scn, 'parity page: no page errors', !S2.pageErrors.length, S2.pageErrors);
    await pg.context().close();
  }

  // ═══ «Όλα N ▾» on the owner's screen (1800×800 CSS px): Figma sheet 15 B
  // 1117:2676. Opening hangs the panel from the band and moves nothing; Q
  // walks the board under it; a wheel over the board closes it; the panel
  // owns the keyboard while open and Esc gives focus back to «Όλα».
  {
    const { page: pg, S: S3 } = await openBoard(browser, origin, { viewport: { width: 1800, height: 800 } });
    const top = () => pg.evaluate(() => document.getElementById('content').scrollTop);
    const t0 = await top();
    await pg.locator('#content .wi4 .wi4-q-all').click(); await pg.waitForTimeout(300);
    await shot(pg, 'queue-panel-1800');
    const p = await pg.evaluate(() => {
      const el = document.querySelector('.wi4-qp'), band = document.querySelector('#content .wi4 .wi4-q'), all = document.querySelector('#content .wi4 .wi4-q-all');
      if (!el || !band) return null;
      const cs = x => getComputedStyle(x), on = el.querySelector('.wi4-qp-i.on'), b = el.querySelector('.wi4-qp-i .wi4-btn'), hd = el.querySelector('.wi4-qp-hd'), k = el.querySelector('.wi4-qp-hd .wi4-key');
      const r = el.getBoundingClientRect();
      return { gap: Math.round(r.top - band.getBoundingClientRect().bottom), w: Math.round(r.width), radius: cs(el).borderTopLeftRadius, label: el.getAttribute('aria-label'),
        expanded: all && all.getAttribute('aria-expanded'), inside: el.contains(document.activeElement), onIsFirst: on === el.querySelector('.wi4-qp-i'),
        onBg: on && cs(on).backgroundColor, onOutline: on && cs(on).outlineStyle, head: hd ? hd.innerText.replace(/\s+/g, ' ').trim() : null, headFs: hd && [cs(hd).fontSize, cs(hd).fontWeight, cs(hd).color],
        key: k && [cs(k).fontFamily, cs(k).fontSize, cs(k).backgroundColor, cs(k).borderTopColor, cs(k).borderTopLeftRadius, Math.round(k.getBoundingClientRect().height)],
        btn: b && [cs(b).fontSize, cs(b).fontWeight, cs(b).borderTopLeftRadius, cs(b).paddingLeft, Math.round(b.getBoundingClientRect().height)],
        grp: (() => { const h = el.querySelector('.wi4-qp-h'); return h && [cs(h).fontSize, cs(h).letterSpacing]; })(),
        l2: (() => { const l = el.querySelector('.wi4-qp-i .wi4-l2'); return l && cs(l).fontSize; })() };
    });
    const t1 = await top();
    ok(scn, 'F1 «Όλα» at 1800×800: the board does not move and the panel hangs from the band (≤8px under it)', !!p && t1 === t0 && p.gap >= 0 && p.gap <= 8, { t0, t1, p });
    ok(scn, 'F10 open: focus on the panel\'s selected first line, «Όλα» aria-expanded=true, the dialog is named', !!p && p.inside && p.onIsFirst && p.expanded === 'true' && p.label === 'Επόμενες ενέργειες', p);
    ok(scn, 'F3 head: «ΕΠΟΜΕΝΑ · N Q επόμενο Esc κλείσιμο» — not upper-cased; 600 11px --wi4-grey-1; keys DM Mono 10.5 on #f9fafb, #d0d5dd, radius 4, 18px',
      !!p && /^ΕΠΟΜΕΝΑ · ≥?\d+ Q επόμενο Esc κλείσιμο$/.test(p.head || '') && p.headFs.join() === '11px,600,rgb(52, 64, 84)'
      && /DM Mono/.test(p.key[0]) && p.key.slice(1).join() === '10.5px,rgb(249, 250, 251),rgb(208, 213, 221),4px,18', p);
    ok(scn, 'F2 panel buttons: 11.5px 500, radius 5, px 9, 23px tall', !!p && !!p.btn && p.btn.join() === '11.5px,500,5px,9px,23', p && p.btn);
    ok(scn, 'F9 panel: 640px, radius 10; selected line #f0f9ff with no outline; group labels 10.5px / .42; reason 11px', !!p && p.w === 640 && p.radius === '10px'
      && p.onBg === 'rgb(240, 249, 255)' && p.onOutline === 'none' && !!p.grp && p.grp.join() === '10.5px,0.42px' && p.l2 === '11px', p);
    // Parity r2: at 1800×800 the panel holds fewer lines than it has and macOS
    // hides the scrollbar — .ovf (a fade at the visible bottom) says more
    // follow; scrolled to the end it goes. Scrolled back after, for the checks below.
    const ov0 = await pg.evaluate(() => { const el = document.querySelector('.wi4-qp'); return el && { ovf: el.classList.contains('ovf'), sh: el.scrollHeight, ch: el.clientHeight,
      fade: getComputedStyle(el, '::after').position }; });
    await pg.evaluate(() => { const el = document.querySelector('.wi4-qp'); if (el) el.scrollTop = el.scrollHeight; });
    await pg.waitForTimeout(150);
    await shot(pg, 'queue-panel-1800-end');
    const ov1 = await pg.evaluate(() => { const el = document.querySelector('.wi4-qp'); return el && { ovf: el.classList.contains('ovf'), top: el.scrollTop }; });
    await pg.evaluate(() => { const el = document.querySelector('.wi4-qp'); if (el) el.scrollTop = 0; });
    await pg.waitForTimeout(150);
    const ov2 = await pg.evaluate(() => { const el = document.querySelector('.wi4-qp'); return !!el && el.classList.contains('ovf'); });
    ok(scn, 'F9 panel taller than the window: .ovf (sticky fade) while lines remain below, none at the end, back at the top again', !!ov0 && ov0.sh > ov0.ch && ov0.ovf && ov0.fade === 'sticky'
      && !!ov1 && !ov1.ovf && ov1.top > 0 && ov2, { ov0, ov1, ov2 });
    // Tab stays inside the panel: it went to the ΑΠΟΘΕΜΑ label and scrolled the board 769 → 0.
    for (let i = 0; i < 40; i++) await pg.keyboard.press('Tab');
    const tab = await pg.evaluate(() => ({ inside: !!document.querySelector('.wi4-qp') && document.querySelector('.wi4-qp').contains(document.activeElement), top: document.getElementById('content').scrollTop }));
    for (let i = 0; i < 3; i++) await pg.keyboard.press('Shift+Tab');
    const stab = await pg.evaluate(() => !!document.querySelector('.wi4-qp') && document.querySelector('.wi4-qp').contains(document.activeElement));
    ok(scn, 'F10 Tab / Shift+Tab stay inside the open panel; the board does not move', tab.inside && stab && tab.top === t0, { tab, stab, t0 });
    // Q: the next item's row comes into view under the open panel, which stays.
    const want = await pg.evaluate(() => { const r = [...document.querySelectorAll('.wi4-qp .wi4-qp-i')]; const i = r.findIndex(x => x.classList.contains('on')); return { i, n: r.length }; });
    await pg.keyboard.press('KeyQ'); await pg.waitForTimeout(250);
    const q = await pg.evaluate(() => {
      const el = document.querySelector('.wi4-qp'); const on = el && el.querySelector('.wi4-qp-i.on'); const rows = el ? [...el.querySelectorAll('.wi4-qp-i')] : [];
      const oid = WINTL.ui && WINTL.ui.v4Focus; const sc = document.getElementById('content').getBoundingClientRect();
      const row = oid && document.querySelector(`#content .wi4 #wi-rows .wi4-row[data-oid="${oid}"]`); const rr = row && row.getBoundingClientRect();
      return { open: !!el, idx: rows.indexOf(on), oid, inView: !!rr && rr.bottom > sc.top && rr.top < sc.bottom, inside: !!el && el.contains(document.activeElement) };
    });
    ok(scn, 'F1 Q with the panel open: the next line is selected, its row is focused and in view, the panel stays', q.open && q.idx === (want.i + 1) % want.n && !!q.oid && q.inView && q.inside, { want, q });
    // Parity r2: ↓ onto a line under the fade scrolls the panel so that line stops ABOVE the fade (scroll-padding 24).
    const below = await pg.evaluate(() => { const el = document.querySelector('.wi4-qp'); if (!el) return null; const r = [...el.querySelectorAll('.wi4-qp-i')];
      const lim = el.getBoundingClientRect().bottom - 1 - 24; return { on: r.findIndex(x => x.classList.contains('on')), first: r.findIndex(x => x.getBoundingClientRect().bottom > lim) }; });
    if (below && below.first > below.on) for (let i = below.on; i < below.first; i++) { await pg.keyboard.press('ArrowDown'); await pg.waitForTimeout(60); }
    const fd = await pg.evaluate(() => { const el = document.querySelector('.wi4-qp'), on = el && el.querySelector('.wi4-qp-i.on'); if (!on) return null;
      return { ovf: el.classList.contains('ovf'), top: el.scrollTop, gap: Math.round(el.getBoundingClientRect().bottom - 1 - on.getBoundingClientRect().bottom) }; });
    ok(scn, 'F9 ↓ onto a line under the fade: the panel scrolls and the line stops ≥23px above the bottom (above the fade)', !!below && below.first > below.on && !!fd && fd.ovf && fd.top > 0 && fd.gap >= 23, { below, fd });
    // A wheel over the board (outside the panel) closes it: the panel must not float over rows that moved.
    await pg.mouse.move(1700, 600); await pg.mouse.wheel(0, 400); await pg.waitForTimeout(300);
    const wh = await pg.evaluate(() => ({ open: !!document.querySelector('.wi4-qp'), exp: (document.querySelector('#content .wi4 .wi4-q-all') || {}).getAttribute && document.querySelector('#content .wi4 .wi4-q-all').getAttribute('aria-expanded') }));
    ok(scn, 'F1 a wheel over the board closes the panel (aria-expanded=false)', !wh.open && wh.exp === 'false', wh);
    // Esc: the panel goes and focus returns to «Όλα».
    await pg.evaluate(() => { document.getElementById('content').scrollTop = 0; });
    await pg.locator('#content .wi4 .wi4-q-all').click(); await pg.waitForTimeout(250);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
    const es = await pg.evaluate(() => { const a = document.querySelector('#content .wi4 .wi4-q-all');
      return { open: !!document.querySelector('.wi4-qp'), focus: document.activeElement === a, exp: a && a.getAttribute('aria-expanded') }; });
    ok(scn, 'F10 Esc closes the panel, focus back on «Όλα», aria-expanded=false', !es.open && es.focus && es.exp === 'false', es);
    ok(scn, '«Όλα» page: no page errors, nothing written', !S3.pageErrors.length && !writes(S3).length, { e: S3.pageErrors, w: writes(S3) });
    await pg.context().close();
  }
}

// The per-load menu as data: header, sections, items (label without the hint
// letter, onclick, whether inside a member submenu). A row without a
// paper-plane (a split's frame header: Figma draws none there) opens by
// right-click, as users reach it.
async function openMenu(page, oid, how = 'plane') {
  const sel = await page.evaluate(([js, oid]) => { const r = eval(js)(oid); if (!r) return null; r.setAttribute('data-rig-row', oid); return { plane: !!r.querySelector('.wi4-plane') }; }, [ROW_JS, oid]);
  if (!sel) return { ok: false, items: [] };
  const row = page.locator(`[data-rig-row="${oid}"]`);
  if (how === 'plane' && !sel.plane) how = 'right';
  if (how === 'plane') await row.locator('.wi4-plane').first().click(); else await row.click({ button: 'right', position: { x: 300, y: 12 } });
  await page.waitForTimeout(300);
  return Object.assign(await readMenu(page), { how });
}
// The open menu as data. Member submenus are built only while open (so
// _wiCtxKeydown never lands on a hidden item): readSubs opens every «▸» in
// turn and reads its items under their own section (the submenu's head).
const readMenu = page => page.evaluate(() => {
  const ctx = document.getElementById('wi-ctx');
  const shown = !!ctx && ctx.style.display === 'block';
  const items = []; let sec = null;
  for (const el of (ctx ? ctx.querySelectorAll('.wi4-m-sec, .wi-ctx-i') : [])) {
    if (el.classList.contains('wi4-m-sec')) { sec = (el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.nodeValue : el.textContent).trim(); continue; }
    if (el.classList.contains('wi4-m-more')) { items.push({ more: true, member: el.classList.contains('wi4-m-mem'), label: el.textContent.trim(), sec, icon: !!el.querySelector('.wi4-m-ic svg') && !!el.querySelector('.wi4-m-chev svg') }); continue; }
    const c = el.cloneNode(true); c.querySelectorAll('.wi4-m-k,.wi4-m-ic').forEach(x => x.remove());
    items.push({ label: c.textContent.trim(), onclick: el.getAttribute('onclick') || '', sec, sub: !!el.closest('.wi4-m-sub'), d: el.classList.contains('d') });
  }
  return { ok: shown, header: (ctx && ctx.querySelector('.wi4-m-hd') || {}).innerText || '', items };
});
async function readSubs(page) {
  const n = await page.evaluate(() => document.querySelectorAll('#wi-ctx .wi4-m-more').length);
  const subs = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate(i => { const b = document.querySelectorAll('#wi-ctx .wi4-m-more')[i]; if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); }, i);
    await page.waitForTimeout(80);
    subs.push({ i, items: (await readMenu(page)).items.filter(x => x.sub) });
  }
  return subs;
}
async function scnMenu(browser, origin) {
  const { page, S } = await openBoard(browser, origin);
  const TRUCK = /^(_wiPanelAssign|_wiClear|_wiStockPanel)\(/;
  for (const oid of ['recWiE001', 'recWiE011', 'recWiE022', 'recWiI020', 'recWiI004', 'recWiE025', 'recWiI009', 'recWiE023']) {
    const scn = 'menu.' + oid.slice(-4);
    const m = await openMenu(page, oid);
    const top = m.items.filter(i => !i.more);
    const onclicks = top.map(i => i.onclick).filter(Boolean);
    const subs = await readSubs(page);
    const subItems = subs.flatMap(s => s.items.map(it => Object.assign({}, it, { sec: 'sub#' + s.i })));
    ok(scn, 'opens inside #wi-ctx with a header', m.ok && !!m.header, m.header);
    const allOn = onclicks.concat(subItems.map(i => i.onclick).filter(Boolean));
    ok(scn, 'no onclick twice (top level and every submenu)', new Set(allOn).size === allOn.length, allOn.filter((x, i) => allOn.indexOf(x) !== i));
    // Unique per SECTION: «Άνοιγμα παραγγελίας» / «Εκτύπωση / WhatsApp…» open
    // each load section by design (§e.9), so a pair repeats them once per load.
    const bySec = {}; top.concat(subItems).forEach(i => { const k = (i.sub ? 'sub:' : 'top:') + (i.sec || '—'); (bySec[k] = bySec[k] || []).push(i.label); });
    const dup = Object.entries(bySec).filter(([, l]) => new Set(l).size !== l.length);
    ok(scn, 'labels unique within each section and submenu', !dup.length, dup);
    // A groupage section opens no single order (which one?): its members do,
    // each in its own «▸» submenu. A split leg keeps «Αρχική παραγγελία…».
    // The order opens from the FIRST item of every single-load section: the
    // v4 «Άνοιγμα παραγγελίας», or the builder's own _wk3Edit where one exists
    // (a pre-order's «Μετατροπή…», a lot's «Άνοιγμα», a split leg's «Αρχική
    // παραγγελία…»), which v4 moves first instead of adding a twin.
    const loadSecs = [...new Set(top.filter(i => /ΕΞΑΓΩΓΗ|ΕΙΣΑΓΩΓΗ/.test(i.sec || '') && !/^GROUPAGE/.test(i.sec || '')).map(i => i.sec))];
    const firstOk = loadSecs.every(s => { const f = top.find(i => i.sec === s); return f && /^_wk3Edit\(/.test(f.onclick); });
    const memberSubs = subs.filter((s, k) => (m.items.filter(i => i.more)[k] || {}).member);
    const subFirstOk = memberSubs.every(s => s.items[0] && /^_wk3Edit\(/.test(s.items[0].onclick));
    ok(scn, 'the order opens from the first item (_wk3Edit) of every single-load section and every member submenu', (loadSecs.length > 0 || memberSubs.length > 0 || m.how === 'right') && firstOk && subFirstOk,
      { top: top.map(i => [i.sec, i.label]), subs: memberSubs.map(s => s.items.map(i => i.label)) });
    ok(scn, 'no truck item inside a member submenu', !subItems.some(i => TRUCK.test(i.onclick)), subItems.filter(i => TRUCK.test(i.onclick)));
    ok(scn, 'no «Καθυστέρηση…», no old «Ομαδοποίηση…»', !top.concat(subItems).some(i => /Καθυστέρηση|^Ομαδοποίηση/.test(i.label)), top.map(i => i.label));
    // Parity r1 F6 (Figma 1097:3858, sheet 14 1064:2376): every list reads the
    // same way — the opener first, print next to it (first in a groupage
    // list), red items after every plain one. F13: inside one load's list no
    // « — εξαγωγή REF-…» tail repeats the section head (cut at 300px).
    const lists = {}; top.concat(subItems).forEach(i => { const k = (i.sub ? 'sub:' : 'top:') + (i.sec || '—'); (lists[k] = lists[k] || []).push(i); });
    const badOrder = Object.entries(lists).filter(([, l]) => {
      const p = l.findIndex(i => /^Εκτύπωση/.test(i.label)), d = l.findIndex(i => i.d);
      return !(p < 0 || p === 0 || (p === 1 && /^_wk3Edit\(/.test(l[0].onclick))) || (d >= 0 && l.slice(d).some(i => !i.d));
    }).map(([k, l]) => [k, l.map(i => (i.d ? '(d) ' : '') + i.label)]);
    ok(scn, 'order in every list: opener, print, the rest, red items last', !badOrder.length, badOrder);
    ok(scn, 'no label carries a « — εξαγωγή/εισαγωγή REF-…» tail', !top.concat(subItems).some(i => / — (εξαγωγή|εισαγωγή) REF-/.test(i.label)), top.concat(subItems).map(i => i.label).filter(l => / — /.test(l)));
    if (oid === 'recWiE001' || oid === 'recWiE023') {
      const imp = m.items.filter(i => i.sec === 'ΕΙΣΑΓΩΓΗ'), last = imp[imp.length - 1] || {};
      ok(scn, 'the last ΕΙΣΑΓΩΓΗ line is «Αφαίρεση ταιριάσματος», red (Figma 1097:3933)', last.label === 'Αφαίρεση ταιριάσματος' && last.d === true, imp.map(i => (i.d ? '(d) ' : '') + i.label));
    }
    if (oid === 'recWiE011') {
      ok(scn, 'every member submenu ends with «Βγάλε από το groupage» (sheet 14 1064:2413)', memberSubs.length === 3 && memberSubs.every(s => (s.items[s.items.length - 1] || {}).label === 'Βγάλε από το groupage'), memberSubs.map(s => s.items.map(i => i.label)));
    }
    if (oid === 'recWiE011') {
      await shot(page, 'menu-E011-groupage-member-open');
      const mem = m.items.filter(i => i.member);
      ok(scn, 'groupage ×3: one «▸» line per member (box icon + chevron), each with its own «Άνοιγμα παραγγελίας»', mem.length === 3 && mem.every(i => i.icon)
        && memberSubs.length === 3 && memberSubs.every(s => /^Άνοιγμα παραγγελίας/.test((s.items[0] || {}).label || '')), { mem, subs: memberSubs.map(s => s.items.map(i => i.label)) });
      ok(scn, 'relabels: «Groupage εξαγωγών…», «Εκτύπωση / WhatsApp…»', top.some(i => /^Groupage εξαγωγών/.test(i.label)) && top.concat(subItems).some(i => /^Εκτύπωση \/ WhatsApp/.test(i.label)), top.map(i => i.label));
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    if (m.how === 'plane') {
      const rc = await openMenu(page, oid, 'right');
      const rcOn = rc.items.filter(i => !i.more).map(i => i.onclick).filter(Boolean).sort();
      ok(scn, 'right-click opens the same menu as the paper-plane', JSON.stringify(rcOn) === JSON.stringify(onclicks.slice().sort()), { plane: onclicks.length, right: rcOn.length });
      await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    }
    ok(scn, 'Esc closes it', await page.evaluate(() => ((document.getElementById('wi-ctx') || {}).style || {}).display !== 'block'));
  }
  // Width (P1 review 11/10): E003 (5 deliveries, no truck) — the menu stays
  // ~320px (sheet 14: 300px), inside the window; section lines are ONE line
  // with the whole in title; the disabled «+ Κομμάτι από απόθεμα…» sits with
  // the truck items, its icon in the icon column.
  {
    await openMenu(page, 'recWiE003');
    const w = await page.evaluate(() => {
      const c = document.getElementById('wi-ctx'), b = c.getBoundingClientRect();
      const subs = [...c.querySelectorAll('.wi4-m-sec .wi4-l2, .wi4-m-hd .wi4-l2')].map(s => ({ t: s.textContent, h: Math.round(s.getBoundingClientRect().height), title: s.title }));
      const firstSec = c.querySelector('.wi4-m-sec');
      const stock = [...c.querySelectorAll('.wi-ctx-i')].find(x => /Κομμάτι από απόθεμα/.test(x.textContent));
      const stockInTruck = !!stock && !!firstSec && !!(stock.compareDocumentPosition(firstSec) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { w: Math.round(b.width), right: Math.round(b.right), vw: innerWidth, subs, stock: !!stock, stockInTruck, stockIcon: !!(stock && stock.querySelector('.wi4-m-ic svg')),
        hd: (c.querySelector('.wi4-m-hd .wi4-l2') || {}).textContent || '' };
    });
    ok('menu.width', 'E003: the menu is ≤ 330px wide and inside the window', w.w <= 330 && w.right <= w.vw - 8, w);
    ok('menu.width', 'section and header lines: one line each, the whole in title, in the row\'s words (no «Ελλάδα», no country names)', w.subs.length >= 2 && w.subs.every(s => s.h <= 16 && s.title === s.t) && !w.subs.some(s => /Ελλάδα|Γερμανία/.test(s.t)), w.subs);
    ok('menu.width', 'header dates in the board\'s format «Τετ 7/10 → Πέμ 8/10» (never «07/10»)', /^[Α-Ωα-ωά-ώ]{3} \d{1,2}\/\d{1,2} → [Α-Ωα-ωά-ώ]{3} \d{1,2}\/\d{1,2}/.test(w.hd) && !/\b0\d\/\d/.test(w.hd), w.hd);
    if (w.stock) ok('menu.width', 'the disabled «+ Κομμάτι από απόθεμα…» is a truck item with its icon', w.stockInTruck && w.stockIcon, w);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  // rota-matched-import: the matched import's section offers the rota leg
  // panel (the export section offers its own, with the export's row id).
  const m = await openMenu(page, 'recWiE023');
  const rota = m.items.find(i => /_wiPanelRota\(/.test(i.onclick || '') && /ΕΙΣΑΓΩΓΗ/.test(i.sec || ''));
  ok('menu.rota', 'the matched import section offers «Σκέλος προώθησης…» (_wiPanelRota)', !!rota, m.items.filter(i => /_wiPanelRota|^ΕΙΣ/.test((i.onclick || '') + ' ' + (i.sec || ''))).map(i => [i.sec, i.label, i.onclick]));
  if (rota) {
    await page.locator(`#wi-ctx .wi-ctx-i[onclick="${rota.onclick.replace(/"/g, '\\"')}"]`).click(); await page.waitForTimeout(400);
    ok('menu.rota', 'it opens #wi-panel (body.wi4-on set)', await page.evaluate(() => (document.getElementById('wi-panel') || {}).style.display === 'block' && document.body.classList.contains('wi4-on')));
    await page.keyboard.press('Escape');
  }
  // The menu never runs past the bottom of the window (it scrolls inside).
  await page.setViewportSize({ width: 1920, height: 600 });
  await openMenu(page, 'recWiE011');
  await readSubs(page);
  ok('menu.fit', 'the open menu fits the window (scrolls inside, never past the bottom edge)', await page.evaluate(() => { const c = document.getElementById('wi-ctx'); const b = c.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 1; }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(300);
  // Hovering a section highlights its load in the row.
  await openMenu(page, 'recWiE001');
  // Fix round 3 (11/10): every item on ONE line (label cut with «…», whole in
  // its title — long labels wrapped under the icon), the header's plate in
  // DM Mono (sheet 14 «TST-1001 · Driver Test 01»).
  const mi = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#wi-ctx .wi-ctx-i')].filter(b => b.offsetParent);
    const plate = document.querySelector('#wi-ctx .wi4-m-hd .wi4-m-plate');
    return { tall: items.filter(b => b.getBoundingClientRect().height > 34).map(b => b.textContent.trim().slice(0, 50)), n: items.length,
      untitled: items.filter(b => { const l = b.querySelector('.wi4-m-l'); return l && l.scrollWidth > l.clientWidth + 1 && !b.title; }).length,
      plate: plate ? { t: plate.textContent, fam: getComputedStyle(plate).fontFamily } : null };
  });
  ok('menu.lines', 'menu items are one line each (cut ones carry their title); the plate in the header is DM Mono', mi.n > 3 && !mi.tall.length && !mi.untitled && !!mi.plate && /TST-1001/.test(mi.plate.t) && /DM Mono|mono/i.test(mi.plate.fam), mi);
  const sec = page.locator('#wi-ctx .wi4-m-sec').nth(1);
  if (await sec.count()) { await sec.hover(); await page.waitForTimeout(150); }
  ok('menu.hover', 'hovering a section highlights its load in the row', await page.evaluate(() => !!document.querySelector('#content .wi4 .wi4-mhl')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // Parity r1 F14 (Figma 1097:3858): opened by the arrow the menu docks to it
  // — right edges flush, just under it; where the room under it is short it
  // opens ABOVE the arrow (r2 finding menu-covers-own-row: no longer pushed
  // up over it). A right-click keeps the pointer.
  for (const oid of ['recWiE010', 'recWiE001']) {
    await openMenu(page, oid);
    const pl = await page.evaluate(([js, oid]) => { const r = eval(js)(oid); const p = r && r.querySelector('.wi4-plane'); if (!p) return null; const b = p.getBoundingClientRect(); return { top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom) }; }, [ROW_JS, oid]);
    const mr = await page.evaluate(() => { const b = document.getElementById('wi-ctx').getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom), vh: innerHeight }; });
    const below = pl && mr.top >= pl.bottom, up = pl && mr.bottom <= pl.top && mr.top >= 8;
    ok('menu.anchor', `${oid.slice(-4)} via the arrow: right edge on the arrow's, top under it (or above it when the room under it is short)`, !!pl && Math.abs(mr.right - pl.right) <= 2 && (below || up) && (oid !== 'recWiE010' || below), { pl, mr });
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  {
    const pt = await page.evaluate(([js]) => { const r = eval(js)('recWiE010').getBoundingClientRect(); return { x: Math.round(r.left + 300), y: Math.round(r.top + 12) }; }, [ROW_JS]);
    await openMenu(page, 'recWiE010', 'right');
    const mr = await page.evaluate(() => { const b = document.getElementById('wi-ctx').getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top) }; });
    ok('menu.anchor', 'E010 by right-click: at the pointer', Math.abs(mr.left - pt.x) <= 1 && Math.abs(mr.top - pt.y) <= 1, { pt, mr });
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  // Parity r1 F4/F5/F9–F12 (Figma 1097:3858): the card, the header, the
  // section lines, the items, icons and key letters as Figma draws them.
  // Fonts are blocked here: families are judged from computed style.
  {
    await openMenu(page, 'recWiE001');
    const t = await page.evaluate(([tok]) => {
      const c = document.getElementById('wi-ctx'), cs = getComputedStyle(c), q = s => c.querySelector(s), st = s => getComputedStyle(q(s));
      const items = [...c.querySelectorAll('.wi-ctx-i')].map(b => getComputedStyle(b));
      const ic = q('.wi-ctx-i:not(.d) .wi4-m-ic svg'), icd = q('.wi-ctx-i.d .wi4-m-ic');
      const k = q('.wi4-m-k'), plate = q('.wi4-m-hd .wi4-m-plate'), secL = q('.wi4-m-sec .wi4-l2');
      return {
        card: [Math.round(c.getBoundingClientRect().width), cs.borderTopLeftRadius, cs.paddingTop, cs.borderTopColor === eval(tok)('--border')],
        items: items.every(s => /DM Sans/.test(s.fontFamily) && s.fontSize === '13px' && s.fontWeight === '400' && s.paddingLeft === '12px' && s.paddingRight === '12px'),
        icon: ic ? [ic.getAttribute('width'), getComputedStyle(ic.parentNode).color === eval(tok)('--text-mid')] : null,
        iconRed: icd ? getComputedStyle(icd).color === eval(tok)('--danger') : null,
        key: k ? [getComputedStyle(k).borderTopWidth, getComputedStyle(k).fontSize, getComputedStyle(k).fontWeight, getComputedStyle(k).color === eval(tok)('--wi4-grey-2')] : null,
        plate: plate ? [plate.textContent, getComputedStyle(plate).fontSize, getComputedStyle(plate).fontWeight] : null,
        hdL2: st('.wi4-m-hd .wi4-l2').fontSize,
        sec: secL ? [getComputedStyle(secL).fontSize, getComputedStyle(secL).fontWeight, getComputedStyle(secL).lineHeight] : null,
      };
    }, [TOKEN_JS]);
    ok('menu.type', 'card 300px, radius 10, 6px padding, --border line (F9)', t.card[0] === 300 && t.card[1] === '10px' && t.card[2] === '6px' && t.card[3], t.card);
    ok('menu.type', 'every item DM Sans 13 regular, 12px sides (F4)', t.items, t);
    ok('menu.type', 'icons 15px in --text-mid, a red item\'s icon red (F5)', !!t.icon && t.icon[0] === '15' && t.icon[1] && t.iconRed === true, t);
    ok('menu.type', 'key letter plain: no box, Medium 11 in --wi4-grey-2 (F12)', !!t.key && t.key[0] === '0px' && t.key[1] === '11px' && t.key[2] === '500' && t.key[3], t.key);
    ok('menu.type', 'header: the own truck\'s whole line mono 11.5/500, line 2 11px (F10); section line Medium 11.5/15 (F11)', !!t.plate && /TST-1001 · Driver Test 01/.test(t.plate[0]) && t.plate[1] === '11.5px' && t.plate[2] === '500' && t.hdL2 === '11px'
      && !!t.sec && t.sec[0] === '11.5px' && t.sec[1] === '500' && t.sec[2] === '15px', t);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  // Parity r1 F2/F1 (sheet 14 1064:2376): a member's submenu is a flyout
  // beside the menu, the menu does not move; → on its line opens it, ←
  // returns; the week never changes behind an open menu (←/→ used to throw
  // the menu AND the week away).
  {
    await openMenu(page, 'recWiE011');
    const st = () => page.evaluate(() => {
      const c = document.getElementById('wi-ctx'), b = c.getBoundingClientRect(), a = document.activeElement, sub = c.querySelector('.wi4-m-sub.open');
      const s = sub && sub.getBoundingClientRect();
      const on = sub ? document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2) : null;
      return { week: WINTL.week, open: c.style.display === 'block', rect: [b.left, b.top, b.width, b.height].map(Math.round),
        sub: s ? [s.left, s.top, s.width, s.height].map(Math.round) : null, onTop: !!(on && sub.contains(on)),
        head: sub ? (sub.querySelector('.wi4-m-sec') || {}).firstChild.nodeValue : '', inSub: !!(a && a.closest && a.closest('.wi4-m-sub.open')),
        lit: !!c.querySelector('.wi4-m-more[aria-expanded="true"]') && getComputedStyle(c.querySelector('.wi4-m-more[aria-expanded="true"]')).backgroundColor !== 'rgba(0, 0, 0, 0)',
        focus: a ? a.textContent.trim().slice(0, 30) : '', vw: innerWidth, vh: innerHeight };
    });
    await page.evaluate(() => document.querySelectorAll('#wi-ctx .wi4-m-mem')[2].focus());
    const s0 = await st();
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
    const s1 = await st();
    await shot(page, 'menu-E011-flyout-member3');
    ok('menu.keys', '→ on member 3\'s line opens its submenu with the focus inside; the menu stays, the week stays', s1.open && !!s1.sub && s1.inSub && s1.week === s0.week, { s0, s1 });
    ok('menu.flyout', 'opening member 3 leaves the menu\'s box as it was (no growth, no jump)', JSON.stringify(s0.rect) === JSON.stringify(s1.rect), { before: s0.rect, after: s1.rect });
    const [x, y, w, h] = s1.sub || [], [mx, , mw] = s1.rect;
    ok('menu.flyout', 'the flyout: 260px beside the menu (6px over its edge), on top, inside the window, «ΦΟΡΤΙΟ 3 ΤΗΣ ΟΜΑΔΑΣ», its line lit', !!s1.sub && Math.abs(w - 260) <= 1
      && (Math.abs(x - (mx + mw - 6)) <= 1 || Math.abs(x + w - (mx + 6)) <= 1) && x >= 0 && x + w <= s1.vw && y >= 0 && y + h <= s1.vh && s1.onTop && s1.head === 'ΦΟΡΤΙΟ 3 ΤΗΣ ΟΜΑΔΑΣ' && s1.lit, s1);
    // A menu against the window's right edge mirrors its flyout to the left.
    await page.evaluate(() => { const c = document.getElementById('wi-ctx'); c.style.left = (innerWidth - 8 - c.offsetWidth) + 'px';
      const m = c.querySelector('.wi4-m-sub.open')._more; m.click(); m.click(); m.focus(); });
    await page.waitForTimeout(120);
    const sf = await st();
    ok('menu.flyout', 'against the right edge the flyout opens on the menu\'s left (6px over its edge), inside the window', !!sf.sub && Math.abs(sf.sub[0] + sf.sub[2] - (sf.rect[0] + 6)) <= 1 && sf.sub[0] >= 0, sf);
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150);
    const s2 = await st();
    ok('menu.keys', '← inside the flyout closes it and gives the focus back to its line', s2.open && !s2.sub && /^3 ·/.test(s2.focus) && s2.week === s0.week, s2);
    await page.evaluate(() => [...document.querySelectorAll('#wi-ctx .wi-ctx-i')].find(b => !b.classList.contains('wi4-m-more') && !b.disabled).focus());
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(400);
    const s3 = await st();
    ok('menu.keys', 'on a plain item ←/→ leave the week and the menu as they are', s3.open && !s3.sub && s3.week === s0.week, s3);
    // F3 (sheet 14 note 1064:2416): pointing at member k lights only that
    // load's points (or the «+N» chip a folded one sits behind), never the row.
    const hov = [];
    for (let k = 0; k < 3; k++) {
      await page.locator('#wi-ctx .wi4-m-mem').nth(k).hover(); await page.waitForTimeout(120);
      hov.push(await page.evaluate(k => {
        const oid = WINTL.rows.find(r => (r.orderIds || []).includes('recWiE011')).orderIds[k];
        const want = new Set([...document.querySelectorAll('#content .wi4 [data-order-id="' + oid + '"]')].map(p => (p.getClientRects().length ? p : p.closest('.wi4-pts').querySelector('.wi4-more'))));
        const lit = [...document.querySelectorAll('#content .wi4 .wi4-mhl')];
        return { oid, want: want.size, lit: lit.length, same: lit.length === want.size && lit.every(el => want.has(el)), row: lit.some(el => el.matches('.wi4-row, .wi4-c-idx, [data-oid]')) };
      }, k));
    }
    ok('menu.hover', 'hovering member k lights exactly member k\'s point(s) (or its «+N» chip), never the row', hov.every(r => r.want > 0 && r.same && !r.row), hov);
    const dark = () => page.evaluate(() => !document.querySelector('#content .wi4 .wi4-mhl'));
    await page.mouse.move(5, 5); await page.waitForTimeout(120);
    const gone1 = await dark();
    await page.locator('#wi-ctx .wi4-m-mem').nth(1).hover(); await page.waitForTimeout(120);
    await page.locator('#wi-ctx .wi4-m-sec').first().hover(); await page.waitForTimeout(120);
    const back = await page.evaluate(() => !!document.querySelector('#content .wi4 .wi4-row.wi4-mhl, #content .wi4 .wi4-c-idx.wi4-mhl'));
    await page.mouse.move(5, 5); await page.waitForTimeout(120);
    const gone2 = await dark();
    ok('menu.hover', 'from a member line back to its section head the section lights again; off the menu (from a member line or the head) nothing stays lit', back && gone1 && gone2, { back, gone1, gone2 });
    // At 1440 members 2–3 of E011 sit behind «+N»: pointing at one lights the
    // chip that holds it.
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(600);
    await openMenu(page, 'recWiE011');
    await page.locator('#wi-ctx .wi4-m-mem').nth(1).hover(); await page.waitForTimeout(150);
    const fold = await page.evaluate(() => {
      const oid = WINTL.rows.find(r => (r.orderIds || []).includes('recWiE011')).orderIds[1];
      const pts = [...document.querySelectorAll('#content .wi4 [data-order-id="' + oid + '"]')];
      const lit = [...document.querySelectorAll('#content .wi4 .wi4-mhl')];
      return { oid, folded: pts.filter(p => !p.getClientRects().length).length, chips: lit.filter(el => el.classList.contains('wi4-more')).length, lit: lit.length,
        hiddenLit: lit.some(el => !el.getClientRects().length), row: lit.some(el => el.matches('.wi4-row, .wi4-c-idx, [data-oid]')) };
    });
    ok('menu.hover', '1440: pointing at a member folded behind «+N» lights that «+N» chip (nothing hidden, never the row)', fold.folded > 0 && fold.chips > 0 && !fold.hiddenLit && !fold.row, fold);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(600);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
    const w4 = await page.evaluate(() => WINTL.week);
    ok('menu.keys', 'after Esc, → changes the week again (the guard left with the menu)', w4 === s0.week + 1, { w0: s0.week, w4 });
    await settle(page, S);
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300); await settle(page, S);
  }
  // Parity r2 (load-menu). Finding menu-covers-own-row (Figma 1097:3858: the
  // card hangs under its arrow, the load stays visible): for EVERY visible
  // arrow at 1920×1080 and 1800×800 (the owner's screen) the menu never
  // touches its arrow, stays inside the window, and nothing it lights in the
  // row (hovering each section) sits under it.
  for (const vp of [{ width: 1920, height: 1080 }, { width: 1800, height: 800 }]) {
    await page.setViewportSize(vp); await page.waitForTimeout(500);
    await page.mouse.move(5, 5);
    const oids = await page.evaluate(() => [...new Set([...document.querySelectorAll('#content .wi4 .wi4-plane')].filter(p => {
      const b = p.getBoundingClientRect(); if (!b.width || b.top < 0 || b.bottom > innerHeight) return false;
      const on = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!on && p.contains(on);
    }).map(p => { const r = p.closest('[data-oid]'); return r && r.getAttribute('data-oid'); }).filter(Boolean))]);
    const bad = [], seen = [];
    for (const oid of oids) {
      const m = await openMenu(page, oid);
      if (!m.ok || m.how !== 'plane') { bad.push([oid.slice(-4), 'not opened by its arrow', m.how]); await page.keyboard.press('Escape'); continue; }
      const g = await page.evaluate(([js, oid]) => {
        const p = eval(js)(oid).querySelector('.wi4-plane').getBoundingClientRect(), c = document.getElementById('wi-ctx').getBoundingClientRect();
        return { p: [p.left, p.top, p.right, p.bottom].map(Math.round), c: [c.left, c.top, c.right, c.bottom].map(Math.round), vw: innerWidth, vh: innerHeight,
          hit: !(c.bottom <= p.top || c.top >= p.bottom || c.right <= p.left || c.left >= p.right), side: c.top >= p.bottom ? 'below' : 'above' };
      }, [ROW_JS, oid]);
      const inside = g.c[0] >= 0 && g.c[1] >= 0 && g.c[2] <= g.vw && g.c[3] <= g.vh;
      const under = [];
      const nSec = await page.evaluate(() => document.querySelectorAll('#wi-ctx > div > .wi4-m-sec').length);
      for (let k = 0; k < nSec; k++) {
        await page.locator('#wi-ctx > div > .wi4-m-sec').nth(k).hover(); await page.waitForTimeout(60);
        under.push(...await page.evaluate(() => [...document.querySelectorAll('#content .wi4 .wi4-mhl')].filter(el => {
          const b = el.getBoundingClientRect(); const on = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return !!on && !!on.closest('#wi-ctx');
        }).map(el => el.className.slice(0, 40))));
      }
      if (vp.height === 800 && oid === 'recWiE001') await shot(page, 'menu-E001-1800x800');
      seen.push([oid.slice(-4), g.side]);
      if (g.hit || !inside || under.length) bad.push({ oid: oid.slice(-4), g, inside, under });
      await page.mouse.move(5, 5); await page.keyboard.press('Escape'); await page.waitForTimeout(120);
    }
    ok('menu.place', `${vp.width}×${vp.height}: ${seen.length} menus by their arrow — none over its arrow, all inside the window, nothing lit under the menu`, oids.length >= 6 && !bad.length, { bad, seen });
  }
  // The owner's screen with a menu taller than the room on either side of
  // its arrow: the roomier side, capped there, scrolling inside, never over
  // the arrow; the next open (right-click) loses the cap again.
  {
    await page.setViewportSize({ width: 1800, height: 560 }); await page.waitForTimeout(500);
    const oid = 'recWiE001';
    await page.evaluate(([js, oid]) => { const r = eval(js)(oid); r.scrollIntoView({ block: 'center' }); }, [ROW_JS, oid]); await page.waitForTimeout(200);
    await openMenu(page, oid);
    const g = await page.evaluate(([js, oid]) => {
      const p = eval(js)(oid).querySelector('.wi4-plane').getBoundingClientRect(), ctx = document.getElementById('wi-ctx'), c = ctx.getBoundingClientRect();
      return { p: [p.top, p.bottom].map(Math.round), c: [c.top, c.bottom].map(Math.round), vh: innerHeight, cap: ctx.style.maxHeight, scrolls: ctx.scrollHeight > ctx.clientHeight + 1 };
    }, [ROW_JS, oid]);
    await shot(page, 'menu-capped-1800x560');
    ok('menu.place', '1800×560: a menu taller than both sides takes the roomier one, capped and scrolling, 4px off its arrow, inside the window',
      !!g.cap && g.scrolls && (g.c[1] <= g.p[0] - 3 || g.c[0] >= g.p[1] + 3) && g.c[0] >= 7 && g.c[1] <= g.vh - 7, g);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await openMenu(page, 'recWiE010', 'right');
    const cap2 = await page.evaluate(() => document.getElementById('wi-ctx').style.maxHeight);
    ok('menu.place', 'the next open (right-click) has no height cap left over', cap2 === '', cap2);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(500);
  }
  // A load's own sub-rows (E001's two local relays «↳») light with it: with
  // the row near the top of the board the menu opens below and hangs under
  // the last of them, never over them (1920 / 1800×800 / 1440).
  for (const vp of [{ width: 1920, height: 1080 }, { width: 1800, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(vp); await page.waitForTimeout(500);
    await page.evaluate(([js, oid]) => { const r = eval(js)(oid); r.scrollIntoView({ block: 'start' });
      let sc = r.parentNode; while (sc && sc !== document.body && !(sc.scrollHeight > sc.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentNode;
      if (sc && sc !== document.body) sc.scrollTop -= 60; }, [ROW_JS, 'recWiE001']);
    await page.waitForTimeout(150);
    await openMenu(page, 'recWiE001');
    const g = await page.evaluate(([js, oid]) => { const r = eval(js)(oid), p = r.querySelector('.wi4-plane').getBoundingClientRect(), c = document.getElementById('wi-ctx').getBoundingClientRect();
      const subs = []; for (let n = r; (n = n.nextElementSibling) && n.classList.contains('wi4-subrow');) subs.push(Math.round(n.getBoundingClientRect().bottom));
      return { p: [Math.round(p.top), Math.round(p.bottom)], c: [Math.round(c.top), Math.round(c.bottom)], subs }; }, [ROW_JS, 'recWiE001']);
    const under = [];
    const nSec = await page.evaluate(() => document.querySelectorAll('#wi-ctx > div > .wi4-m-sec').length);
    for (let k = 0; k < nSec; k++) {
      await page.locator('#wi-ctx > div > .wi4-m-sec').nth(k).hover(); await page.waitForTimeout(60);
      under.push(...await page.evaluate(() => [...document.querySelectorAll('#content .wi4 .wi4-mhl')].filter(el => { const b = el.getBoundingClientRect();
        const on = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!on && !!on.closest('#wi-ctx'); }).map(el => el.className.slice(0, 40))));
    }
    const litSubs = await page.evaluate(() => { const r = document.querySelector('[data-rig-row="recWiE001"]'); const out = [];
      for (let n = r; (n = n.nextElementSibling) && n.classList.contains('wi4-subrow');) out.push(n.getAttribute('data-oid')); return out; });
    ok('menu.place', `${vp.width}: E001 near the top — the menu hangs under its relay sub-rows (4px), nothing it lights under it`,
      g.subs.length >= 2 && Math.abs(g.c[0] - (Math.max(...g.subs) + 4)) <= 1 && !under.length, { g, under, litSubs });
    await page.mouse.move(5, 5); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(500);
  // Finding menu-hint-keys-dead (Figma 1097:3867 «A», 1097:3885 «P»): the
  // letter an item shows runs that item while the menu is open, by e.code
  // (a Greek layout sends Α/Ο/Π on the same keys); the week never moves.
  {
    await page.evaluate(() => { window.__prints = []; window.printOrderSheet = function () { window.__prints.push([...arguments]); };
      window.__opens = []; window.open = function (u) { window.__opens.push(String(u)); return null; }; });
    const st = () => page.evaluate(() => { const p = document.getElementById('wi-popover');
      return { ctx: document.getElementById('wi-ctx').style.display === 'block', pop: !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim(),
        modal: !!(document.querySelector('#modalOverlay.open') || document.querySelector('.mf-overlay')), prints: window.__prints.slice(), opens: window.__opens.slice(), week: WINTL.week }; });
    const reset = () => page.evaluate(() => { if (typeof _wiClosePopover === 'function') _wiClosePopover(); if (typeof closeModal === 'function') closeModal(); window.__prints.length = 0; window.__opens.length = 0; });
    const w0 = writes(S).length, wk0 = (await st()).week;
    await openMenu(page, 'recWiE010'); await page.waitForTimeout(100);
    const hints = await page.evaluate(() => [...document.querySelectorAll('#wi-ctx .wi4-m-k')].map(k => [k.textContent, k.closest('.wi-ctx-i').querySelector('.wi4-m-l').textContent]));
    const inMenu = await page.evaluate(() => document.getElementById('wi-ctx').contains(document.activeElement));
    await page.keyboard.press('KeyA'); await page.waitForTimeout(400);
    const a = await st();
    ok('menu.hintkeys', 'E010: A with the menu open (focus on an item) → «Ανάθεση…»: #wi-popover open, menu closed', inMenu && a.pop && !a.ctx, { hints, inMenu, a });
    await reset(); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await openMenu(page, 'recWiE010'); await page.waitForTimeout(100);
    await page.keyboard.press('KeyO'); await page.waitForTimeout(600);
    const o = await st();
    ok('menu.hintkeys', 'E010: O → «Άνοιγμα παραγγελίας» (the order form opens, menu closed)', o.modal && !o.ctx, o);
    await reset(); await page.waitForTimeout(300);
    await openMenu(page, 'recWiE010'); await page.waitForTimeout(100);
    await page.keyboard.press('KeyP'); await page.waitForTimeout(300);
    const p = await st();
    ok('menu.hintkeys', 'E010: P → «Εκτύπωση / WhatsApp…» = the sheet of E010 (export), menu closed', p.prints.length === 1 && p.prints[0][0] === 'recWiE010' && p.prints[0][1] === 'export' && !p.ctx, p);
    await reset();
    await openMenu(page, 'recWiE011'); await page.waitForTimeout(100);
    await page.keyboard.press('KeyP'); await page.waitForTimeout(300);
    const pg = await st();
    const grp = await page.evaluate(() => WINTL.rows.find(r => (r.orderIds || []).includes('recWiE011')).orderIds);
    ok('menu.hintkeys', 'E011 (groupage): P → «Εκτύπωση / WhatsApp όλων…» = one packet of the whole group', pg.opens.length === 1 && grp.every(id => pg.opens[0].includes(id)) && !pg.prints.length && !pg.ctx, { pg, grp });
    await reset();
    await openMenu(page, 'recWiE010'); await page.waitForTimeout(100);
    await page.evaluate(() => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'α', code: 'KeyA', bubbles: true, cancelable: true })));
    await page.waitForTimeout(400);
    const g = await st();
    ok('menu.hintkeys', 'Greek layout: e.key «α» with e.code KeyA → «Ανάθεση…» as well', g.pop && !g.ctx, g);
    await reset(); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await openMenu(page, 'recWiE010'); await page.waitForTimeout(100);
    await page.keyboard.press('KeyQ'); await page.waitForTimeout(200);
    const q = await st();
    ok('menu.hintkeys', 'a bound key no item shows (Q) does nothing while the menu is open', q.ctx && !q.pop && !q.modal && !q.prints.length, q);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    ok('menu.hintkeys', 'the letters wrote nothing and never moved the week', writes(S).length === w0 && (await st()).week === wk0, writes(S).slice(w0));
  }
  // Finding menu-item-empty-key-track (Figma 1097:3870/3873/3881 x 37 w 249;
  // 1097:3866 «Ανάθεση…» w 231 next to its «A»): no key → the label runs the
  // full 249px; with a key → 249 − key − 10.
  {
    await openMenu(page, 'recWiE001');
    const lw = await page.evaluate(() => [...document.querySelectorAll('#wi-ctx .wi-ctx-i')].filter(b => b.getClientRects().length).map(b => {
      const l = b.querySelector('.wi4-m-l'), k = b.querySelector(':scope > .wi4-m-k'), ch = b.querySelector(':scope > .wi4-m-chev');
      return { t: l.textContent.slice(0, 30), w: Math.round(l.getBoundingClientRect().width * 10) / 10, k: k ? k.getBoundingClientRect().width : null, ch: !!ch };
    }));
    const plain = lw.filter(x => x.k == null && !x.ch), keyed = lw.filter(x => x.k != null);
    ok('menu.track', 'E001: an item without a key: label 249px (±1); with a key: 249 − key − 10 (±1)', plain.length >= 5 && keyed.length >= 2
      && plain.every(x => Math.abs(x.w - 249) <= 1) && keyed.every(x => Math.abs(x.w - (249 - x.k - 10)) <= 1), lw);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  // Finding menu-relay-line-cuts-date: a relay «▸» line cuts the driver,
  // never the day — at 1920, 1800 and 1440, and with a long driver name.
  for (const vp of [{ width: 1920, height: 1080 }, { width: 1800, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(vp); await page.waitForTimeout(500);
    await openMenu(page, 'recWiE001');
    const r = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('#wi-ctx .wi4-m-more:not(.wi4-m-mem)')].filter(b => /^Τοπική/.test(b.title));
      const whole = (l) => { const who = l.querySelector('.wi4-ell'), day = who && who.nextElementSibling, lb = l.getBoundingClientRect();
        return day ? { day: day.textContent, sw: day.scrollWidth, cw: day.clientWidth, inLabel: day.getBoundingClientRect().right <= lb.right + 1, cut: who.scrollWidth > who.clientWidth + 1 } : null; };
      const out = lines.map(b => whole(b.querySelector('.wi4-m-l')));
      // Stress: a long invented driver name on the same line (CSS under test).
      const l0 = lines[0] && lines[0].querySelector('.wi4-m-l .wi4-ell');
      if (l0) l0.textContent = 'Τοπική φόρτωση · Driver Test 99 Μακρύ-Επώνυμο-Δοκιμής-Οδηγού';
      return { out, long: lines[0] ? whole(lines[0].querySelector('.wi4-m-l')) : null, titles: lines.map(b => b.title) };
    });
    const good = (x) => !!x && /^ · \S+ \d{1,2}\/\d{1,2}$/.test(x.day) && x.sw <= x.cw + 1 && x.inLabel;
    ok('menu.relay', `${vp.width}: every relay «▸» line keeps its day whole (a long driver is cut, the day is not)`, r.out.length >= 1 && r.out.every(good) && good(r.long) && r.long.cut, r);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(500);
  // Finding menu-section-dot-missing (Figma 1097:3907: 6×6 #0284C7 at left 4,
  // 14px under the divider): the section the pointer is in, and only it.
  {
    await openMenu(page, 'recWiE001');
    const dots = async () => page.evaluate(([tok]) => { const on = [...document.querySelectorAll('#wi-ctx .wi4-m-sec.wi4-m-on')];
      const all = [...document.querySelectorAll('#wi-ctx > div > .wi4-m-sec')];
      const b = on[0] && getComputedStyle(on[0], '::before');
      return { n: on.length, idx: on.map(s => all.indexOf(s)), dot: b ? [b.width, b.height, b.left, b.top, b.borderTopLeftRadius, b.backgroundColor === eval(tok)('--accent')] : null }; }, [TOKEN_JS]);
    await page.evaluate(() => [...document.querySelectorAll('#wi-ctx > div > .wi4-m-sec')].forEach((s, k) => {
      const it = [...s.parentNode.children].find(c => c.matches('.wi-ctx-i')); if (it) it.setAttribute('data-rig-it', String(k)); }));
    await page.locator('[data-rig-it="1"]').hover(); await page.waitForTimeout(100);
    const d1 = await dots();
    await page.locator('[data-rig-it="0"]').hover(); await page.waitForTimeout(100);
    const d0 = await dots();
    await shot(page, 'menu-E001-section-dot');
    await page.mouse.move(5, 5); await page.waitForTimeout(100);
    const dn = await dots();
    ok('menu.dot', 'hovering an item of a section shows exactly one dot, on that section (6×6 accent, left 4, top 14); none off the menu',
      d1.n === 1 && d1.idx[0] === 1 && d0.n === 1 && d0.idx[0] === 0 && !!d1.dot && d1.dot.slice(0, 4).join() === '6px,6px,4px,14px' && d1.dot[5] && dn.n === 0, { d1, d0, dn });
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  // Finding menu-keyboard-no-row-highlight (sheet 14: the pointer on a «▸»
  // line lights that load; sheet 15: the board is keyboard-driven): ↓ onto
  // member k lights exactly member k's points, like the pointer; leaving the
  // menu clears them.
  {
    await page.mouse.move(5, 5);
    await openMenu(page, 'recWiE011'); await page.mouse.move(5, 5); await page.waitForTimeout(100);
    const res = [];
    for (let k = 0; k < 3; k++) {
      await page.evaluate(k => { const items = [...document.querySelectorAll('#wi-ctx .wi-ctx-i:not([disabled])')];
        const mem = document.querySelectorAll('#wi-ctx .wi4-m-mem')[k]; items[items.indexOf(mem) - 1].focus(); }, k);
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
      res.push(await page.evaluate(k => {
        const oid = WINTL.rows.find(r => (r.orderIds || []).includes('recWiE011')).orderIds[k];
        const want = new Set([...document.querySelectorAll('#content .wi4 [data-order-id="' + oid + '"]')].map(p => (p.getClientRects().length ? p : p.closest('.wi4-pts').querySelector('.wi4-more'))));
        const lit = [...document.querySelectorAll('#content .wi4 .wi4-mhl')];
        return { k, onMember: document.activeElement === document.querySelectorAll('#wi-ctx .wi4-m-mem')[k], want: want.size, lit: lit.length,
          same: lit.length === want.size && lit.every(el => want.has(el)), dot: document.querySelectorAll('#wi-ctx .wi4-m-sec.wi4-m-on').length };
      }, k));
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({ lit: document.querySelectorAll('#content .wi4 .wi4-mhl').length, dot: document.querySelectorAll('#wi-ctx .wi4-m-on').length }));
    ok('menu.kbdlight', 'E011: ↓ onto member k lights exactly member k\'s points (and its section\'s dot); Esc clears them', res.every(r => r.onMember && r.want > 0 && r.same && r.dot === 1) && !after.lit && !after.dot, { res, after });
  }
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
  conf: (p.querySelector('.wi4-conf') || {}).textContent || '',
  timeVal: (p.querySelector('.wi4-time') || {}).value, timeType: (p.querySelector('.wi4-time') || {}).type,
  id: (p.querySelector('.wi4-datep-id') || {}).textContent || '', idH: Math.round(((p.querySelector('.wi4-datep-id') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect()).height) } : null; });
async function scnDate(browser, origin) {
  const { page, S } = await openBoard(browser, origin);
  const plusDay = (day, n) => new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const FIELDS = [['Loading DateTime', 'Φόρτωση', 'Ημερομηνία φόρτωσης'], ['Delivery DateTime', 'Εκφόρτωση', 'Ημερομηνία εκφόρτωσης'], ['VS CD Date', 'Βέροια', 'Ημερομηνία Βέροιας']];
  for (const [field, seg, title] of FIELDS) {
    const scn = 'date.' + seg;
    S.log = []; await page.evaluate(() => { window.__ev.length = 0; });
    const before = clone(S.db[T.ORDERS].find(r => r.id === 'recWiE014').fields);
    ok(scn, 'the chip opens the date panel', await openDatePanel(page, 'recWiE014'));
    // E014 is a VS export: its chip IS the Βέροια day (§e #7: the ≈ VS chip
    // opens «Βέροια»), so every field is reached through its own segment.
    // Exact text: «Φόρτωση» is also inside «Εκφόρτωση».
    await page.locator('.wi4-datep .wi4-seg button', { hasText: new RegExp('^' + seg + '$') }).click(); await page.waitForTimeout(150);
    const info = await panelInfo(page);
    ok(scn, `title «${title}», switch Φόρτωση · Εκφόρτωση · Βέροια (VS order)`, info && info.title === title && ['Φόρτωση', 'Εκφόρτωση', 'Βέροια'].every(s => info.segs.includes(s)), info);
    ok(scn, field === 'VS CD Date' ? 'no time input for Βέροια (date only, as today)' : 'a time input', info && info.time === (field !== 'VS CD Date'), info);
    // 24-hour HH:MM whatever the browser's locale (a native time input showed
    // «07:00 AM», review 11/10); one identity line «client · from — to».
    if (field !== 'VS CD Date') ok(scn, 'the time reads 24-hour «HH:MM» (a text field, not the locale\'s time input)', info && info.timeType === 'text' && /^([01]\d|2[0-3]):[0-5]\d$/.test(info.timeVal || '') && !/AM|PM/i.test(info.timeVal || ''), info);
    // One line = the text box: since parity r2 the id line also carries the
    // head's 12px + the divider under the text (Figma 1125:2803).
    const idc = await page.evaluate(() => { const e = document.querySelector('.wi4-datep-id'), s = e && getComputedStyle(e); return e ? Math.round(e.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) : 0; });
    ok(scn, 'the identity line is one line, «client · place — place», no country names', info && idc > 0 && idc <= 16 && / · .+ — .+/.test(info.id) && !/Ελλάδα|Γερμανία/.test(info.id), info && [info.id, info.idH, idc]);
    ok(scn, 'the panel says what changes and what does not', info && /Η Εβδομάδα δεν αλλάζει από εδώ/.test(info.note), info && info.note);
    // Per field (review 11/10: the Βέροια field said «…και τη Βέροια»).
    if (field === 'VS CD Date') ok(scn, 'the Βέροια note names what a Βέροια change moves — never «τις στάσεις»', info && /ημερομηνία Βέροιας/.test(info.note) && /εθνικού σκέλους/.test(info.note) && !/στάσεις/.test(info.note), info && info.note);
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
  // The chip of a VS export opens «Βέροια», the chip of a plain order opens
  // «Φόρτωση», and the D key opens the same field as the row's own chip.
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await openDatePanel(page, 'recWiE014');
  ok('date.chip', 'a VS export\'s chip opens «Ημερομηνία Βέροιας»', ((await panelInfo(page)) || {}).title === 'Ημερομηνία Βέροιας', await panelInfo(page));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await neutral(page);
  await page.evaluate(() => WIV2.focusRow('recWiE014')); await page.keyboard.press('KeyD'); await page.waitForTimeout(250);
  ok('date.keyD', 'D on a VS export opens the same field as its chip (Βέροια)', ((await panelInfo(page)) || {}).title === 'Ημερομηνία Βέροιας', await panelInfo(page));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  // A non-VS order has no Βέροια tab.
  await openDatePanel(page, 'recWiE003');
  ok('date.nonVS', 'a plain order\'s chip opens «Ημερομηνία φόρτωσης»', ((await panelInfo(page)) || {}).title === 'Ημερομηνία φόρτωσης', await panelInfo(page));
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
  // The overlays live on <body>, outside .wi4: their buttons fell back to the
  // UA font (Arial 13.33px day cells). Figma 1125:2799 / 2843: 300 wide,
  // 16px inset, day cells DM Sans 12, a 32px time field.
  {
    const fams = sel => page.evaluate(s => [...document.querySelectorAll(s)].map(b => ({ t: b.textContent.trim().slice(0, 16), fam: getComputedStyle(b).fontFamily, size: getComputedStyle(b).fontSize })), sel);
    const dm = list => list.length > 0 && list.every(b => /^"?DM Sans/.test(b.fam));
    await neutral(page);
    ok('date.geometry', 'the date panel opens', await openDatePanel(page, 'recWiE003'));
    const g = await page.evaluate(() => { const p = document.querySelector('.wi4-datep'); if (!p) return null; const t = p.querySelector('.wi4-time');
      return { w: p.getBoundingClientRect().width, pad: getComputedStyle(p).paddingLeft, time: t ? t.getBoundingClientRect().height : null, cell: getComputedStyle(p.querySelectorAll('.wi4-cal')[1].querySelector('.wi4-cal-d')).fontSize }; });
    ok('date.geometry', 'panel 300px wide with a 16px inset, time field 32px (Figma 1125:2799)', !!g && Math.abs(g.w - 300) <= 1 && g.pad === '16px' && Math.abs(g.time - 32) <= 1, g);
    // Parity r2 (1125:2799): three bands — head closed by a full-width
    // divider, body, a grey footer band flush with the panel's bottom.
    const bd = await page.evaluate(() => { const p = document.querySelector('.wi4-datep'); if (!p) return null;
      const cs = el => getComputedStyle(el), pb = p.getBoundingClientRect(), bw = parseFloat(cs(p).borderLeftWidth), inner = pb.width - 2 * bw;
      const hd = p.querySelector('.wi4-datep-hd'), id = p.querySelector('.wi4-datep-id'), ft = p.querySelector('.wi4-datep-ft'), t = p.querySelector('.wi4-time'), tl = p.querySelector('.wi4-time-l'), n = p.querySelector('.wi4-datep-note');
      const ib = id.getBoundingClientRect(), fb = ft.getBoundingClientRect();
      return { head: cs(hd).fontWeight + ' ' + cs(hd).fontSize, div: { w: cs(id).borderBottomWidth, c: cs(id).borderBottomColor, span: Math.round(ib.width - inner), x: Math.round(ib.left - pb.left - bw) },
        ft: { bg: cs(ft).backgroundColor, span: Math.round(ft.getBoundingClientRect().width - inner), x: Math.round(fb.left - pb.left - bw), gap: Math.round(pb.bottom - bw - fb.bottom),
          r: [cs(ft).borderBottomLeftRadius, cs(ft).borderBottomRightRadius], want: (parseFloat(cs(p).borderBottomLeftRadius) - bw) + 'px' },
        btn: [...ft.querySelectorAll('.wi4-btn')].map(b => cs(b).borderTopLeftRadius + ' ' + cs(b).fontSize),
        time: [cs(t).fontSize, cs(t).borderTopLeftRadius, cs(t).paddingLeft].join(' '), label: cs(tl).fontSize + ' ' + cs(tl).letterSpacing, note: cs(n).fontSize }; });
    ok('date.geometry', 'head 700 15px; a 1px #f2f4f7 divider under the identity line across the full inner width (1125:2803)',
      !!bd && bd.head === '700 15px' && bd.div.w === '1px' && bd.div.c === 'rgb(242, 244, 247)' && Math.abs(bd.div.span) <= 1 && Math.abs(bd.div.x) <= 1, bd);
    ok('date.geometry', 'footer band rgb(249, 250, 251) across the inner width, flush with the bottom, corners = panel radius − border; buttons radius 4px, 12.5px (1125:2879)',
      !!bd && bd.ft.bg === 'rgb(249, 250, 251)' && Math.abs(bd.ft.span) <= 1 && Math.abs(bd.ft.x) <= 1 && Math.abs(bd.ft.gap) <= 1 && bd.ft.r.every(r => r === bd.ft.want)
      && bd.btn.length === 2 && bd.btn.every(b => b === '4px 12.5px'), bd);
    ok('date.geometry', 'time 12.5px, radius 4px, 10px in; «Ώρα» 10.5px tracked .525px; note 11.5px (1125:2873/2878)',
      !!bd && bd.time === '12.5px 4px 10px' && bd.label === '10.5px 0.525px' && bd.note === '11.5px', bd);
    if (OUT) await page.locator('.wi4-datep').screenshot({ path: path.join(OUT, 'date-panel-crop.png') });
    const pb = await fams('.wi4-datep button');
    ok('date.fonts', 'every date-panel button (days, switch, footer) is DM Sans; the day cells 12px', dm(pb) && !!g && g.cell === '12px', pb.filter(b => !/^"?DM Sans/.test(b.fam)).concat([g && g.cell]));
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await neutral(page); await page.keyboard.press('Shift+Slash'); await page.waitForTimeout(250);
    // The Esc cap is a key cap: DM Mono like every cap of the sheet (Figma
    // 1119:2841, DM Mono Medium 11 — `keys` checks it); any other button is
    // DM Sans. What this guards is the fallback: never Syne from the title,
    // never the UA font.
    const hb = await page.evaluate(() => [...document.querySelectorAll('.wi4-dlg-back button')].map(b => ({ t: b.textContent.trim().slice(0, 16), cap: b.classList.contains('wi4-key'), fam: getComputedStyle(b).fontFamily, size: getComputedStyle(b).fontSize })));
    ok('date.fonts', 'the «?» sheet\'s buttons: key caps (the Esc cap) DM Mono, the rest DM Sans — none Syne or the UA font',
      hb.length > 0 && hb.every(b => (b.cap ? /^"?DM Mono/ : /^"?DM Sans/).test(b.fam)), hb);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    await page.evaluate(() => WI4Actions.queuePanel()); await page.waitForTimeout(250);
    const qb = await fams('.wi4-qp button');
    ok('date.fonts', 'the «Όλα» panel\'s buttons are DM Sans', dm(qb), qb.filter(b => !/^"?DM Sans/.test(b.fam)).concat([qb.length]));
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  ok('date', 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
  // A downstream stage that fails (review 11/10, P2): the national load did
  // not move, so the panel says so — never «Ημερομηνία ενημερώθηκε ✓» (the
  // Λάβδας 7/9 incident). The VS chain re-reads the order; that read fails.
  {
    const scn2 = 'date.downstream';
    const { page: p2, S: S2 } = await openBoard(browser, origin);
    await p2.evaluate(() => { window.__ev.length = 0; });
    ok(scn2, 'E014\'s chip opens the date panel', await openDatePanel(p2, 'recWiE014'));
    await p2.locator('.wi4-datep .wi4-seg button', { hasText: /^Φόρτωση$/ }).click(); await p2.waitForTimeout(150);
    await p2.keyboard.press('ArrowRight');
    S2.fail.get.recWiE014 = 500;
    await p2.locator('.wi4-datep .wi4-datep-ft .wi4-btn.pri').click();
    const t0 = Date.now(); let toasts = [];
    while (Date.now() - t0 < 15000) { toasts = (await evs(p2, 'toast')).map(e => String(e.a[0])); if (toasts.some(t => /Ημερομηνία|ημερομηνία/.test(t))) break; await p2.waitForTimeout(250); }
    S2.fail.get = {};
    ok(scn2, 'the date IS written (one PATCH, 200), and the failed VS chain is said instead of the ✓', patches(S2, 'recWiE014').some(x => x.status === 200 && x.fields && x.fields['Loading DateTime'])
      && toasts.some(t => /Η ημερομηνία άλλαξε — ο συγχρονισμός του εθνικού φορτίου απέτυχε/.test(t)) && !toasts.some(t => /Ημερομηνία ενημερώθηκε ✓/.test(t)), toasts);
    await p2.context().close();
  }
}

async function scnKeys(browser, origin) {
  const { page, S } = await openBoard(browser, origin);
  const st = () => page.evaluate(() => ({ focus: WINTL.ui && WINTL.ui.v4Focus, kbd: !!document.querySelector('#content .wi4.wi4-kbd'),
    ring: document.querySelectorAll('#content .wi4 .wi4-focus').length, ctx: ((document.getElementById('wi-ctx') || {}).style || {}).display === 'block',
    pop: (() => { const p = document.getElementById('wi-popover'); return !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim(); })(),
    help: !!document.querySelector('.wi4-dlg .wi4-help-row'), active: document.activeElement && document.activeElement.className }));
  // The bar's own buttons (Figma 1097:2310, sheet 15; F3): Pre-order carries
  // its 15px calendar, «Προβολή» a chevron, and they share the 8px radius of
  // the shared Σάρωση / Νέα παραγγελία beside them.
  const own = await page.evaluate(() => { const bs = [...document.querySelectorAll('.wi4-bar-r .wi4-btn')], pre = bs.find(b => /Pre-order/.test(b.textContent));
    const sv = pre && pre.querySelector('svg'), r = el => el ? getComputedStyle(el).borderTopLeftRadius : null;
    return { preSvg: sv ? Math.round(sv.getBoundingClientRect().width) : 0, viewSvg: !!document.querySelector('.wi4-bar .wk-more-t svg'),
      radii: [...bs, document.querySelector('.wi4-bar .btn-scan'), document.querySelector('.wi4-bar .btn-new-order')].map(r) }; });
  ok('keys', 'bar buttons: Pre-order has a 15px icon, «Προβολή» a chevron, all four share an 8px radius', own.preSvg === 15 && own.viewSvg && own.radii.length === 4 && own.radii.every(x => x === '8px'), own);
  // «Προβολή» owns its keys (sheets 14/15, F1): Enter opens it with the focus
  // on the first item, ↓ moves, Esc closes it and gives the toggle back.
  const vk = () => page.evaluate(() => { const m = document.getElementById('wi4-view'), t = document.querySelector('.wi4-top .wk-more-t'), a = document.activeElement, its = m ? [...m.querySelectorAll('[role^="menuitem"]')] : [];
    return { hidden: !!m && m.hidden, exp: t.getAttribute('aria-expanded'), onToggle: a === t, item: its.indexOf(a), week: WINTL.week }; });
  await page.focus('.wi4-top .wk-more-t'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  const v1 = await vk();
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(50);
  const v2 = await vk();
  await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  const v3 = await vk();
  ok('keys', '«Προβολή»: Enter opens it on its first item, ↓ moves to the next, Esc closes it (aria-expanded false) and focuses the toggle',
    !v1.hidden && v1.exp === 'true' && v1.item === 0 && v2.item === 1 && v3.hidden && v3.exp === 'false' && v3.onToggle, { v1, v2, v3 });
  // ←/→ = week only when no overlay is open (owner, locked): under the open
  // «Προβολή», the avatar menu or the «Όλα» panel the week stays.
  const wk0 = await page.evaluate(() => WINTL.week);
  // Each key read on its own: ← then → would cancel out and hide a step.
  const under = async (open, close) => { await open(); await page.waitForTimeout(100); const r = [];
    for (const k of ['ArrowLeft', 'ArrowRight']) { await page.keyboard.press(k); await page.waitForTimeout(600); r.push(await page.evaluate(() => WINTL.week)); }
    await close(); await page.waitForTimeout(100);
    if (r.some(w => w !== wk0)) { await page.evaluate(w => { WINTL.week = w; return renderWeeklyIntl(); }, wk0); await settle(page, S); }
    return r; };
  // Closed by a click that lands on nothing (a click on the board could open a cell's panel).
  const away = () => page.evaluate(() => document.body.click());
  const wView = await under(() => page.click('.wi4-top .wk-more-t'), away);
  const wUser = await under(() => page.click('.topbar .user-chip'), away);
  const wAll = await under(() => page.evaluate(() => WI4Actions.queuePanel()), () => page.keyboard.press('Escape'));
  ok('keys', '←/→ under an open «Προβολή», avatar menu or «Όλα» panel leave the week unchanged', [wView, wUser, wAll].every(r => r.every(w => w === wk0)), { wk0, wView, wUser, wAll });
  await neutral(page);
  const open0 = await page.evaluate(() => [...document.querySelectorAll('[role="menu"],[role="dialog"],[role="alertdialog"],#wi-ctx,#wi-panel,#wi-popover')]
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(el => el.id || el.className));
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1500);
  const wNone = await page.evaluate(() => WINTL.week);
  if (wNone !== wk0) { await page.evaluate(w => { WINTL.week = w; return renderWeeklyIntl(); }, wk0); await settle(page, S); }
  ok('keys', 'with nothing open → still steps the week (locked)', wNone === wk0 + 1, { wk0, wNone, open0 });
  await neutral(page);
  await page.keyboard.press('ArrowDown');
  let s1 = await st();
  ok('keys', '↓ focuses the first row, blue ring only after a key (wi4-kbd)', !!s1.focus && s1.kbd && s1.ring === 1, s1);
  // Sheet 15 C (F8): the key-hint strip shows with the keyboard, built from
  // the live keymap, at the foot of the board; a mouse press takes it away.
  const kh = await page.evaluate(() => { const h = document.querySelector('#content .wi4 .wi4-khint'); if (!h) return null; const b = h.getBoundingClientRect();
    const sc = document.getElementById('content'), end = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 2;
    return { keys: [...h.querySelectorAll('.wi4-key')].map(k => k.textContent.trim()), h: Math.round(b.height), bottom: Math.round(b.bottom), vh: innerHeight, end, vis: getComputedStyle(h).visibility,
      w: Math.round(b.width), radius: getComputedStyle(h).borderTopLeftRadius, bt: getComputedStyle(h).borderTopWidth }; });
  // On the window's bottom edge while the board scrolls on (in the flow under the last row at the end).
  ok('keys', '↓ shows the key-hint strip (≥5 keys from the keymap, 32px, on the window\'s bottom edge)', !!kh && kh.keys.length >= 5 && kh.keys.includes('Enter') && kh.keys.includes('?') && kh.h === 32 && kh.vis === 'visible' && kh.bottom <= kh.vh && (kh.end || kh.bottom >= kh.vh - 1), kh);
  const endChk = await page.evaluate(() => new Promise((res) => { const sc = document.getElementById('content'); const top0 = sc.scrollTop; sc.scrollTop = sc.scrollHeight;
    requestAnimationFrame(() => { const last = document.getElementById('wi-rows').getBoundingClientRect(), h = document.querySelector('#content .wi4 .wi4-khint');
      const out = { lastBottom: Math.round(last.bottom), stripTop: h ? Math.round(h.getBoundingClientRect().top) : null }; sc.scrollTop = top0; res(out); }); }));
  ok('keys', 'at the end of the scroll the strip sits under the last row, never on it', endChk.stripTop != null && endChk.stripTop >= endChk.lastBottom, endChk);
  // Parity r2 (1119:2812): a pill the size of its keys (Figma 719), radius 6,
  // no rule over it — not a full-width band.
  ok('keys', 'the key-hint strip is sized to its keys (<900px), radius 6px, no top border', !!kh && kh.w < 900 && kh.radius === '6px' && kh.bt === '0px', kh);
  if (OUT) await page.screenshot({ path: path.join(OUT, 'keys-hint-strip.png'), clip: { x: 0, y: 1080 - 120, width: 1920, height: 120 } });
  await page.keyboard.press('ArrowDown');
  const s2 = await st();
  ok('keys', '↓ again moves to the next row', !!s2.focus && s2.focus !== s1.focus, [s1.focus, s2.focus]);
  // Figma 1119:2676 row 16: a step shows the ring only — the 1.5 s flash of
  // each row left both rows lit after ↓↓ (well inside the 1.5 s).
  const trail = await page.evaluate(() => { const f = document.querySelectorAll('#content .wi4 .wi4-focus');
    return { hl: document.querySelectorAll('#content .wi4 .wi4-hl').length, ring: f.length, on: f.length ? (f[0].dataset.oid || (f[0].closest('[data-oid]') || { dataset: {} }).dataset.oid) : null, focus: WINTL.ui && WINTL.ui.v4Focus }; });
  ok('keys', 'after ↓↓ no row is flashed (.wi4-hl) and only the focused row has the ring', trail.hl === 0 && trail.ring === 1 && trail.on === trail.focus, trail);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  ok('keys', 'Enter opens the per-load menu', (await st()).ctx);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  // Greek layout: same e.code, Greek e.key.
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'α', bubbles: true })));
  await page.waitForTimeout(300);
  ok('keys', 'A (Greek «α», code KeyA) opens the assignment popover', (await st()).pop);
  await page.evaluate(() => { if (typeof _wiClosePopover === 'function') _wiClosePopover(); });
  // A jump keeps the flash: the eye must find where the board landed.
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(150);
  const qf = await page.evaluate(() => { const el = document.querySelector('#content .wi4 .wi4-focus'); return { focus: WINTL.ui && WINTL.ui.v4Focus, hl: !!el && el.classList.contains('wi4-hl') }; });
  ok('keys', 'Q (a jump to the queue\'s next) still flashes the row it lands on', !!qf.focus && qf.hl, qf);
  await page.keyboard.press('Shift+Slash'); await page.waitForTimeout(200);
  const help = await page.evaluate(() => [...document.querySelectorAll('.wi4-dlg .wi4-help-row')].map(r => [...r.querySelectorAll('.wi4-key')].map(k => k.textContent.trim()).join('+')));
  const keymap = await page.evaluate(() => WI4.KEYMAP.map(k => k.keys));
  // F7: the keys bound outside the board (←/→ week in core/ui.js, ⌘K in the
  // palette) are listed too; keys nothing binds (E, I, [ ], ⌘Z) never.
  ok('keys', '«?» lists the live keymap + ← → (εβδομάδα) + ⌘K, and no E, I, [ ], ⌘Z', help.length > 0 && keymap.every(k => help.some(h => h.includes(k)))
    && help.includes('←+→') && help.some(h => /^(⌘K|Ctrl\+K)$/.test(h)) && !help.some(h => /^(E|I|\[|\]|\[\+\]|⌘Z|Ctrl\+Z)$/.test(h)), { help, keymap });
  // F6: the sheet's geometry is Figma 1119:2836's.
  const hg = await page.evaluate(() => { const d = document.querySelector('.wi4-dlg.wi4-help'), t = d && d.querySelector('.wi4-dlg-t'), row = d && d.querySelector('.wi4-help-row'), k = row && row.querySelector('.wi4-key'), esc = t && t.querySelector('.wi4-key');
    const c = el => el && getComputedStyle(el);
    return d ? { w: Math.round(d.getBoundingClientRect().width), title: c(t).fontSize + '/' + c(t).fontWeight + ' ' + c(t).fontFamily.split(',')[0].replace(/"/g, ''),
      key: c(row).gridTemplateColumns.split(' ')[0], cap: c(k).fontSize + ' ' + c(k).fontFamily.split(',')[0].replace(/"/g, ''), esc: c(esc).fontFamily.split(',')[0].replace(/"/g, '') } : null; });
  ok('keys', '«?» sheet: 600 wide, Syne 17/700 title, 110px key column, DM Mono 11 caps (Esc too)', !!hg && hg.w === 600 && hg.title === '17px/700 Syne' && hg.key === '110px' && hg.cap === '11px DM Mono' && hg.esc === 'DM Mono', hg);
  // Figma 1119:2907: ΓΕΝΙΚΑ reads ⌘K · Esc · ? (its ⌘Z is not bound).
  const gen = await page.evaluate(() => { const out = []; let on = false;
    for (const el of document.querySelectorAll('.wi4-dlg.wi4-help > *')) {
      if (el.classList.contains('wi4-qp-h')) { on = el.textContent.trim() === 'ΓΕΝΙΚΑ'; continue; }
      if (on && el.classList.contains('wi4-help-row')) out.push([...el.querySelectorAll('.wi4-key')].map(k => k.textContent.trim()).join('+'));
    }
    return out; });
  ok('keys', '«?» ΓΕΝΙΚΑ in Figma\'s order: ⌘K, Esc, ?', gen.length === 3 && /^(⌘K|Ctrl\+K)$/.test(gen[0]) && gen[1] === 'Esc' && gen[2] === '?', gen);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.keyboard.press('Slash'); await page.waitForTimeout(100);
  ok('keys', '/ focuses the search box', await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.wi4-search')));
  await page.keyboard.type('a'); await page.waitForTimeout(150);
  ok('keys', 'typing inside the search box triggers no action', !(await st()).pop && !(await st()).ctx);
  await page.keyboard.press('Escape'); await neutral(page);
  // A press that lands on nothing (a real click here could open a row's cell).
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); await page.waitForTimeout(100);
  // Hidden, not removed: the board's height never changes under the pointer.
  ok('keys', 'a mouse press takes the key-hint strip away', await page.evaluate(() => { const h = document.querySelector('#content .wi4 .wi4-khint'); return !h || getComputedStyle(h).visibility === 'hidden'; }));
  await neutral(page);
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
  // core/ui.js is shared on purpose: Weekly National's ⋯ menu gets the same
  // keys — Esc closes it, ← under it leaves WNATL.week (F1).
  await page.evaluate(() => navigate('weekly_natl')); await page.waitForTimeout(2500);
  const wn = await page.evaluate(() => ({ btn: !!document.querySelector('#content .wk-more-t'), week: typeof WNATL !== 'undefined' ? WNATL.week : null }));
  if (wn.btn) {
    await page.click('#content .wk-more-t'); await page.waitForTimeout(100);
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(600);
    const wl = await page.evaluate(() => ({ week: WNATL.week, open: !document.querySelector('#content .wk-more-m').hidden }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    const we = await page.evaluate(() => { const t = document.querySelector('#content .wk-more-t'); return { open: !document.querySelector('#content .wk-more-m').hidden, exp: t.getAttribute('aria-expanded'), focus: document.activeElement === t }; });
    ok('keys', 'Weekly National ⋯: ← under it leaves WNATL.week, Esc closes it and focuses ⋯', wl.week === wn.week && wl.open && !we.open && we.exp === 'false' && we.focus, { wn, wl, we });
  } else ok('keys', 'Weekly National renders its ⋯ menu in the rig', false, wn);
  // Off the page: a v4 key must never act on another page.
  await page.evaluate(() => navigate('dashboard')); await page.waitForTimeout(1200);
  const errs0 = S.pageErrors.length;
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.keyboard.press('KeyA');
  await page.waitForTimeout(300);
  ok('keys', 'off-page: no v4 action, no error', !(await page.evaluate(() => !!document.querySelector('#content .wi4') || ((document.getElementById('wi-ctx') || {}).style || {}).display === 'block')) && S.pageErrors.length === errs0, S.pageErrors.slice(errs0));
  ok('keys', 'keys wrote nothing', !writes(S).length, writes(S));
  await page.context().close();
}

async function scnSearch(browser, origin) {
  const { page, S } = await openBoard(browser, origin);
  // F8 (Figma 1115:2734 / 1115:2707): the box 240×30, radius 7, border
  // #e2e8f0, input 12.5px, «/» key 10.5px 500; label column 150px, so the
  // first queue card starts 406px after the box (24 → 430 in the frame).
  const sb = await page.evaluate(() => {
    const s = document.querySelector('#content .wi4 .wi4-search'), c = document.querySelector('#content .wi4 #wi4-qwrap .wi4-qcard'), k = s && s.querySelector('.wi4-key');
    const cs = x => getComputedStyle(x), r = s.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), radius: cs(s).borderTopLeftRadius, border: cs(s).borderTopColor, input: cs(s.querySelector('input')).fontSize,
      key: k && [cs(k).fontSize, cs(k).fontWeight, cs(k).borderTopColor, cs(k).borderTopLeftRadius], off: c ? Math.round(c.getBoundingClientRect().left - r.left) : null };
  });
  ok('search', 'F8 the box: 240×30, radius 7, border #E2E8F0, input 12.5px; «/» 10.5px 500, radius 4', sb.w === 240 && sb.h === 30 && sb.radius === '7px' && sb.border === 'rgb(226, 232, 240)'
    && sb.input === '12.5px' && !!sb.key && sb.key.join() === '10.5px,500,rgb(226, 232, 240),4px', sb);
  ok('search', 'F8 first queue card 406±2px after the search box (150px label column)', sb.off != null && Math.abs(sb.off - 406) <= 2, sb);
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

// A promise the page left on window.__p (an old write function the scenario
// called directly). Never awaited for ever: a write that does not settle is a
// failed check, and an open conflict dialog is closed (× = «Κράτα …») so the
// scenario goes on. Before this, one hang blocked every scenario after it.
async function waitP(page, scn, what, ms = 8000) {
  const done = await page.evaluate(ms => Promise.race([Promise.resolve(window.__p).then(() => true, () => true),
    new Promise(r => setTimeout(() => r(false), ms))]), ms);
  if (!done) {
    ok(scn, `${what}: the write settled within ${ms / 1000} s`, false, 'still pending');
    await page.evaluate(() => { const x = document.querySelector('.wi4-dlg-x, .wi4-dlg [aria-label="Κλείσιμο"]'); if (x) x.click(); });
  }
  return done;
}
// §e.14: the failure line is drawn once the write has stopped retrying
// (core/api.js _atRetry backs off 1 s and 2 s); settle() alone can end inside
// that window, while the slot still says ⟳.
async function syncSettled(page, oid, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const st = await page.evaluate(o => ((WINTL._syncLog || {})[o] || {}).state || null, oid);
    if (st && st !== 'pend') return st;
    await page.waitForTimeout(150);
  }
  return null;
}

// The reason codes of every day header, as the board counts them (data-codes).
const dayCodes = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#content .wi4 #wi-rows [data-codes]')].map(el => [el.getAttribute('data-dc'), el.getAttribute('data-codes') || ''])));
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
// The row is brought to mid-screen first: the old popover (unchanged in v4)
// places itself for a 380px height, and a row at the window's bottom edge put
// its taller form — and its Save — below the window.
async function openPopover(page, oid) {
  await page.evaluate(([js, oid]) => { const r = eval(js)(oid); const b = r && r.querySelector('.wi4-box'); if (b) { b.setAttribute('data-rig-box', oid); b.scrollIntoView({ block: 'center' }); } }, [ROW_JS, oid]);
  await page.locator(`[data-rig-box="${oid}"]`).click(); await page.waitForTimeout(300);
  return page.evaluate(() => { const p = document.getElementById('wi-popover'); return !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim(); });
}
// After a FAILED match E006 ← I004 (review 11/10, P2): the board must not
// contradict itself. E006's import cell draws what the table holds — the
// empty-return slot, naming E006's EMPTY_RETURN (Figma sheet 14 #5: the row
// goes back to what is written; parity r2) — the failure is the ONE line under
// it, I004 is drawn as a ghost line in its own loading day (naming its
// NO_TRUCK), and per day: counted = named, header = queue.
const dayAgree = page => page.evaluate(() => {
  const Q = WIV2.queueItems();
  const idsOf = el => { const rid = Number(el.getAttribute('data-row-id')); const row = WINTL.rows.find(x => x.id === rid); const oid = el.getAttribute('data-oid');
    // A row whose match FAILED does not own the import it still holds
    // (its import cell is marked data-unconfirmed: it draws the table).
    const ns = !!(el.querySelector && el.querySelector('[data-unconfirmed]'));
    const imp = row && row.importId && !ns ? (WINTL.rows.find(x => x.type === 'import' && (x.orderIds || []).includes(row.importId)) || { orderIds: [row.importId] }).orderIds : [];
    return [...new Set([...(row ? (row.orderIds || [row.orderId]) : []), ...imp, ...(oid ? [oid] : [])])]; };
  const qOf = (ids, el) => (el && el.dataset.relay ? Q.filter(q => q.relayId === el.dataset.relay) : Q.filter(q => !q.relayId && (ids.includes(q.key) || ids.includes(q.rowKey))));
  return [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-day')].map(day => {
    // The header's words = the closed-day marker's label (owner 11/10).
    const dot = day.querySelector('[data-dc] .wi4-dayh-dot');
    const head = dot ? dot.getAttribute('aria-label') || '' : '';
    const els = [...day.querySelectorAll('.wi4-row,.wi4-subrow,.wi4-ghost')];
    const items = [...new Set(els.flatMap(el => qOf(idsOf(el), el)))];
    const num = re => { const m = head.match(re); return m ? Number(m[1]) : 0; };
    return { day: day.dataset.day, head, hdrNoTruck: num(/(\d+) χωρίς φορτηγό/), qNoTruck: items.filter(q => q.code === 'NO_TRUCK').length,
      hdrEmpty: num(/(\d+) κεν(?:ό γύρισμα|ά γυρίσματα)/), qEmpty: items.filter(q => q.code === 'EMPTY_RETURN').length };
  });
});
async function savefailBoard(page, scn, r6) {
  const b = await page.evaluate(([rid]) => {
    const cell = document.getElementById('wi-ci-' + rid);
    const gap = cell && cell.querySelector('.wi4-gap');
    const vis = e => !!e && e.getClientRects().length > 0;
    const msg = document.querySelector('#content .wi4 [data-msg="recWiE006"]');
    const g = document.querySelector('#content .wi4 .wi4-ghost[data-oid="recWiI004"]');
    const gd = g && g.closest('.wi4-day');
    return { unc: cell ? cell.getAttribute('data-unconfirmed') : null, cell: cell ? cell.textContent : '', gap: gap ? gap.textContent : '', gapR: gap ? gap.getAttribute('data-r') : null,
      act: vis(cell && cell.querySelector('.wi4-gap-act')), stk: vis(cell && cell.querySelector('.wi2-gapstk')), drop: !!(cell && cell.getAttribute('ondrop')),
      leg: !!(cell && cell.querySelector('.wi4-leg')), msg: msg ? msg.textContent : '',
      ghost: g ? g.textContent : '', ghostR: g ? [...g.querySelectorAll('[data-r]')].map(x => x.getAttribute('data-r')) : [], ghostDay: gd ? gd.dataset.day : null,
      ghostH: g ? Math.round(g.getBoundingClientRect().height) : 0, rows: WINTL.rows.length };
  }, [r6]);
  // Parity r2 (savefail-slot-hides-written-state): the cell is what is
  // WRITTEN — no match, an own truck: «Κενό γύρισμα» with its EMPTY_RETURN —
  // and the failure is said once, by the line under the row.
  ok(scn, 'E006\'s import cell draws what the TABLE holds: «Κενό γύρισμα» (data-r EMPTY_RETURN), no failure words inside it, still the drop target', b.unc === '1' && /Κενό γύρισμα/.test(b.gap) && b.gapR === 'EMPTY_RETURN' && !/αποθηκεύτηκε/.test(b.cell) && !b.leg && b.drop, b);
  ok(scn, 'the failure is the ONE line under E006 and names REF-I004', /Δεν αποθηκεύτηκε/.test(b.msg) && /REF-I004/.test(b.msg), b.msg);
  // «+ Νέα εισαγωγή» would be refused there (_wiNewImport: row.importId is
  // the failed I004), and the stock panel would count I004 on the truck.
  ok(scn, 'the unconfirmed slot offers no «+ Νέα εισαγωγή» / stock link (both would act on the unsaved match)', !b.act && !b.stk, b);
  ok(scn, 'I004 is a 24px ghost line in its own loading day, naming its NO_TRUCK', /REF-I004/.test(b.ghost) && b.ghostR.includes('NO_TRUCK') && !!b.ghostDay && b.ghostH === 24, b);
  const named = await reasonsNamed(page);
  ok(scn, 'per day after the failure: every reason the header counts is named on exactly that many rows', named.bad.length === 0, named.bad);
  const agree = await dayAgree(page);
  ok(scn, 'per day after the failure: header counts = queue items (χωρίς φορτηγό, κενά γυρίσματα)', agree.every(d => d.hdrNoTruck === d.qNoTruck && d.hdrEmpty === d.qEmpty), agree.filter(d => d.hdrNoTruck !== d.qNoTruck || d.hdrEmpty !== d.qEmpty));
}
async function scnSaveFail(browser, origin) {
  let scn = 'savefail.popover';
  {
    const { page, S } = await openBoard(browser, origin);
    const r7 = await rowOf(page, 'recWiE007'), r6 = await rowOf(page, 'recWiE006');
    // What the TABLE says before the failed match: the day counts and the queue.
    const codes0 = await dayCodes(page), q0 = await page.evaluate(() => WIV2.queueItems().map(q => q.code + ':' + q.key).sort());
    await page.evaluate(() => { window.__ev.length = 0; });
    // The race of §e.14: a match on E006 is written (its optimistic paint
    // already happened), the user opens E007's popover meanwhile, and only
    // then the write fails. The first attempt is held 1.5 s, every attempt 500s.
    S.fail.patch.recWiE006 = 500; S.delay.recWiE006 = 1500; S.log = [];
    await htmlDrag(page, '#wi-imp-recWiI004', `#wi-ci-${r6}`);
    await page.waitForTimeout(700);
    ok(scn, 'E007\'s popover is open while E006\'s write is in flight', await openPopover(page, 'recWiE007'));
    const reads0 = S.mainReads;
    await page.waitForTimeout(500); await settle(page, S, 2600);
    ok(scn, 'E006\'s write stopped retrying and is logged as failed', (await syncSettled(page, 'recWiE006')) === 'err', await page.evaluate(() => WINTL._syncLog));
    await page.waitForTimeout(200);
    const r = await page.evaluate(([js]) => ({ msg: (() => { const row = eval(js)('recWiE006'); const n = row && (row.querySelector('.wi4-msg') || (row.nextElementSibling && row.nextElementSibling.classList.contains('wi4-msg') ? row.nextElementSibling : null)); return n ? n.innerText : ''; })(),
      msgH: (() => { const n = document.querySelector('#content .wi4 .wi4-msg'); return n ? Math.round(n.getBoundingClientRect().height) : null; })(),
      upd: (document.getElementById('wi4-upd-err') || {}).innerText || '', tok: (document.getElementById('wi4-upd') || {}).innerText || '',
      pop: (() => { const p = document.getElementById('wi-popover'); return !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim(); })(), rows: WINTL.rows.length }), [ROW_JS]);
    ok(scn, 'a 24px line under E006 «Δεν αποθηκεύτηκε …»', /Δεν αποθηκεύτηκε/.test(r.msg) && r.msgH === 24, r);
    // ONE message (sheet 14 #5): it names what stayed as it was — from the
    // table — and no generic toast stacks on top (review 11/10: four).
    ok(scn, 'the line names what stayed as it was: «η εισαγωγή REF-I004 μένει χωρίς φορτηγό»', /REF-I004 μένει χωρίς φορτηγό/.test(r.msg), r.msg);
    const toasts = (await evs(page)).filter(e => e.k === 'toast' || e.k === 'errtoast' || e.k === 'reportError').map(e => e.a[0]);
    ok(scn, 'no stacked toast for the failed match: no «Σφάλμα server», no «Save failed», no «Το ταίριασμα δεν γράφτηκε»', !toasts.some(t => /Σφάλμα server|Save failed|ταίριασμα δεν γράφτηκε/.test(String(t))), toasts);
    // The counts follow the TABLE, not the optimistic paint (review 11/10:
    // Tuesday lost «1 κενό γύρισμα», Wednesday «1 χωρίς φορτηγό», while the
    // table still had both). Only the failure itself is new.
    const codes1 = await dayCodes(page), q1 = await page.evaluate(() => WIV2.queueItems().map(q => q.code + ':' + q.key).sort());
    const noSave = c => Object.fromEntries(Object.entries(c).map(([d, s]) => [d, s.split(',').filter(x => x && !/^SAVE_FAILED:/.test(x)).join(',')]));
    ok(scn, 'after the failed match the day counts equal the counts before it (SAVE_FAILED aside)', JSON.stringify(noSave(codes1)) === JSON.stringify(noSave(codes0)), { before: codes0, after: codes1 });
    ok(scn, 'the queue still holds I004\'s NO_TRUCK and E006\'s EMPTY_RETURN, plus the SAVE_FAILED item', JSON.stringify(q1.filter(x => !/^SAVE_FAILED:/.test(x))) === JSON.stringify(q0) && q1.some(x => /^SAVE_FAILED:recWiE006$/.test(x)), { q0, q1 });
    // The day of the row the user just acted on never folds away under them:
    // no day folds by itself at all (owner 12/10).
    ok(scn, 'E006\'s day stayed open through the match and the failure', await page.evaluate(js => { const r = eval(js)('recWiE006'); const d = r && r.closest('.wi4-day'); return !!d && !d.classList.contains('closed'); }, ROW_JS));
    ok(scn, 'title bar «1 αλλαγή δεν αποθηκεύτηκε»', /1 αλλαγή δεν αποθηκεύτηκε/.test(r.upd), r.upd);
    // Sheet 14 #9 (F5): the failure has its own slot; the freshness / changes
    // token stays beside it — it vanished exactly when another dispatcher's
    // change is the likeliest cause of the failure.
    ok(scn, 'title bar shows the failure AND the freshness token side by side', /1 αλλαγή δεν αποθηκεύτηκε/.test(r.upd) && /μόλις τώρα|πριν|αλλαγ|ζωντανά/.test(r.tok) && !/δεν αποθηκεύτηκε/.test(r.tok), { upd: r.upd, tok: r.tok });
    await savefailBoard(page, scn, r6);
    await shot(page, 'save-failure');
    // The title bar too (review 11/10: the shot was scrolled past it).
    await page.evaluate(() => { const sc = document.scrollingElement; const c = document.querySelector('.content'); if (c) c.scrollTop = 0; if (sc) sc.scrollTop = 0; });
    await page.waitForTimeout(150);
    await shot(page, 'save-failure-title');
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
    // The same match again, now accepted: the failure slot empties (F5).
    await settle(page, S, 1500);
    const r6b = await rowOf(page, 'recWiE006');
    await htmlDrag(page, '#wi-imp-recWiI004', `#wi-ci-${r6b}`);
    await page.waitForTimeout(500); await settle(page, S, 1500);
    const ue = await page.evaluate(() => ({ err: (document.getElementById('wi4-upd-err') || {}).textContent, log: JSON.parse(JSON.stringify(WINTL._syncLog || {})) }));
    ok(scn, 'after a successful retry #wi4-upd-err is empty', ue.err === '' && link(fld(S, 'recWiE006', 'Matched Import ID')) === 'recWiI004', { ue, matched: fld(S, 'recWiE006', 'Matched Import ID') });
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
    await syncSettled(page, 'recWiE006');
    await savefailBoard(page, scn, r6);
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
  // A «+ Νέα εισαγωγή» whose form was CANCELLED leaves _wiPendingMatch set
  // with nothing open (only a create clears it): it blocked every re-read for
  // the session (review 11/10). Older than 2 minutes, it no longer does.
  scn = 'savefail.stalePending';
  {
    const { page, S } = await openBoard(browser, origin);
    const r6 = await rowOf(page, 'recWiE006');
    await page.evaluate(() => { window._wiPendingMatch = { rowId: 1, at: Date.now() - 130000 }; });
    const reads0 = S.mainReads;
    S.fail.patch.recWiE006 = 500;
    await htmlDrag(page, '#wi-imp-recWiI004', `#wi-ci-${r6}`);
    await syncSettled(page, 'recWiE006');
    S.fail.patch = {};
    const t0 = Date.now(); while (S.mainReads === reads0 && Date.now() - t0 < 8000) await page.waitForTimeout(200);
    ok(scn, 'a stale pending match (form long cancelled) does not block the re-read', S.mainReads > reads0, { reads: S.mainReads - reads0 });
    await page.context().close();
  }
}

// An export matched to an import this week's read does not hold (it loads
// outside ±8 days, or was cancelled): unknown ≠ empty (§d.2a) — said in the
// cell, an amber look in the queue and the header, its day never folded.
async function scnUnread(browser, origin) {
  const scn = 'unread';
  const { page, S } = await openBoard(browser, origin, { mutate: db => { db[T.ORDERS].find(r => r.id === 'recWiE010').fields['Matched Import ID'] = 'recWiI099'; } });
  const r = await page.evaluate(([js]) => { const row = eval(js)('recWiE010'); const cell = row && row.querySelector('.wi4-c-imp');
    const day = row && row.closest('.wi4-day');
    return { cell: cell ? cell.innerText : '', marker: !!(cell && cell.querySelector('[data-r="MATCH_UNREAD"]')), gap: !!(cell && cell.querySelector('.wi4-gap')),
      q: WIV2.queueItems().filter(x => x.code === 'MATCH_UNREAD').map(x => [x.key, x.level, x.act]), open: !!day && !day.classList.contains('closed'),
      head: day ? ((day.querySelector('[data-dc] .wi4-dayh-dot') || { getAttribute: () => '' }).getAttribute('aria-label') || '') : '' }; }, [ROW_JS]);
  ok(scn, 'the cell says «εισαγωγή εκτός προβολής · άνοιγμα», never the open drop slot or an empty return', /εισαγωγή εκτός προβολής/.test(r.cell) && r.marker && !r.gap, r);
  ok(scn, 'one amber MATCH_UNREAD item that opens it; the header names it; the day stays open', r.q.length === 1 && r.q[0][0] === 'recWiI099' && r.q[0][1] === 'amber' && r.q[0][2] === 'open' && /εισαγωγή εκτός προβολής/.test(r.head) && r.open, r);
  ok(scn, 'no page errors; nothing written', !S.pageErrors.length && !writes(S).length, { e: S.pageErrors, w: writes(S) });
  await page.context().close();
}

async function scnPresence(browser, origin) {
  // The shape presence_beat() returns (068: jsonb_build_object('sub', 'name',
  // 'records')) and the Worker passes through unchanged. Column names
  // (user_sub/user_name) never reach the browser; the client drops entries
  // without `sub`, so a fake in the column shape would prove nothing.
  const others = [{ sub: 'rig_user_b', name: 'Χρήστης Β',
    records: [{ record: 'recWiE003', part: 'export', action: 'date:Loading DateTime', since: '2026-10-06T06:39:40.000Z' }] }];
  let scn = 'presence.live';
  {
    const { page, S } = await openBoard(browser, origin, { presence: true, presenceCfg: { others } });
    await page.waitForTimeout(3500);
    const r = await page.evaluate(([js]) => ({ av: document.querySelectorAll('.wi4-pres .wi4-av').length,
      t: (document.querySelector('.wi4-pres') || {}).innerText || '',
      idx: (() => { const row = eval(js)('recWiE003'); const c = row && row.querySelector('.wi4-c-idx'); return c ? { t: c.innerText, title: c.title || (c.querySelector('[title]') || {}).title || '' } : null; })(),
      text: document.querySelector('#content .wi4').innerText }), [ROW_JS]);
    ok(scn, 'avatars + «Χρήστης Β · εδώ τώρα»', r.av >= 1 && /Χρήστης Β/.test(r.t) && /εδώ τώρα/.test(r.t), r);
    ok(scn, 'the initial replaces E003\'s number, tooltip from the whitelist', r.idx && /Χ/.test(r.idx.t) && /αλλάζει την ημερομηνία φόρτωσης/.test(r.idx.title), r.idx);
    ok(scn, 'never «κανείς»', !/κανείς/i.test(r.text));
    const b = S.beats.filter(x => !x.body || !x.body.leave);
    ok(scn, 'beat body: tab id per tab, ttl_ms, board — no name/role in the body', b.length >= 1 && b.every(x => /^[a-z0-9]{8,16}$/.test(x.body.tab) && Number.isInteger(x.body.ttl_ms) && x.body.board === 'weekly_intl' && !('user_name' in x.body) && !('role' in x.body)), b.map(x => x.body));
    // Before any save nobody has confirmed the Worker checks _expect: unknown =
    // closed (principle 5) — the note never promises «θα σου πει ποια μένει».
    const p0 = await openDatePanel(page, 'recWiE003') && await panelInfo(page);
    // Unconfirmed, the note is a real warning: it keeps the amber fill.
    const bg0 = await page.evaluate(([tok]) => { const n = document.querySelector('.wi4-datep .wi4-pnote'); return n ? { bg: getComputedStyle(n).backgroundColor, amber: eval(tok)('--wi4-amber-bg'), info: n.classList.contains('info') } : null; }, [TOKEN_JS]);
    ok(scn, 'date panel note while the check is unconfirmed: no promise, says so — amber, a warning', !!p0 && /Χρήστης Β έχει ανοιχτή αυτή την ημερομηνία/.test(p0.pnote) && !/θα σου πει ποια μένει/.test(p0.pnote) && /δεν έχει επιβεβαιωθεί/.test(p0.pnote)
      && !!bg0 && bg0.bg === bg0.amber && !bg0.info, [p0, bg0]);
    await page.keyboard.press('Escape');
    // A Worker that confirmed the check (TMS_EXPECT_LIVE true): the verbatim promise.
    await page.evaluate(() => { window.TMS_EXPECT_LIVE = true; });
    ok(scn, 'date panel note, verbatim shape (§e #10) once the check is confirmed', await openDatePanel(page, 'recWiE003') && /Χρήστης Β έχει ανοιχτή αυτή την ημερομηνία/.test((await panelInfo(page)).pnote) && /θα σου πει ποια μένει/.test((await panelInfo(page)).pnote), await panelInfo(page));
    // Confirmed, it is news (Figma 1125:2885): light blue, the colleague's
    // avatar (the row marker's disc), the panel's full inner width.
    const pn = await page.evaluate(([tok]) => { const p = document.querySelector('.wi4-datep'), n = p && p.querySelector('.wi4-pnote'); if (!n) return null;
      const pb = p.getBoundingClientRect(), nb = n.getBoundingClientRect(), bw = parseFloat(getComputedStyle(p).borderLeftWidth), av = n.querySelector('.wi4-av');
      return { info: n.classList.contains('info'), ini: av ? av.textContent : null, bg: getComputedStyle(n).backgroundColor, want: eval(tok)('--wi4-info-bg'), inner: pb.width - 2 * bw, w: nb.width, x: nb.left - pb.left - bw }; }, [TOKEN_JS]);
    ok(scn, 'the confirmed note is light blue with the colleague\'s avatar, across the panel\'s inner width', !!pn && pn.info && pn.ini === 'Χ' && pn.bg === pn.want && Math.abs(pn.w - pn.inner) <= 2 && Math.abs(pn.x) <= 1, pn);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { delete window.TMS_EXPECT_LIVE; });
    // The week tabs stay in the centre of the bar with the presence strip in
    // it (they jumped ~105px when it arrived, review 11/10).
    const tc = await page.evaluate(() => { const b = document.querySelector('.wi4-bar').getBoundingClientRect(), t = document.getElementById('wi4-tabs').getBoundingClientRect(); return { bar: b.left + b.width / 2, tabs: t.left + t.width / 2 }; });
    ok(scn, 'the week tabs keep the centre of the bar with the presence strip shown', Math.abs(tc.bar - tc.tabs) <= 1.5, tc);
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
    // A week change reaches the next beat (colleagues never see us on the old week).
    await page.evaluate(() => { if (typeof _wiClosePopover === 'function') _wiClosePopover(); WINTL.week = 42; return WI_INTERNAL.renderWeeklyIntl(); });
    const nW = S.beats.length; const tW = Date.now();
    while (!S.beats.slice(nW).some(x => x.body && x.body.week === 42) && Date.now() - tW < 15000) await page.waitForTimeout(250);
    ok(scn, 'after a week change the next beat carries the new week', S.beats.slice(nW).some(x => x.body && x.body.week === 42), S.beats.slice(nW).map(x => x.body && x.body.week));
    await page.context().close();
  }
  const quiet = async (mode, check) => {
    const scn = 'presence.' + mode;
    const { page, S } = await openBoard(browser, origin, { presence: true, presenceCfg: { mode } });
    await page.waitForTimeout(6500);
    // The strip shows its state WORD (fix round 3) and carries the whole
    // sentence of §e #18 in the title of each piece.
    const r = await page.evaluate(() => ({ cls: (document.querySelector('.wi4-pres') || { className: '' }).className,
      t: (document.querySelector('.wi4-pres') || {}).textContent || '', av: document.querySelectorAll('.wi4-pres .wi4-av').length,
      title: ((document.querySelector('.wi4-pres .wi4-pres-w') || {}).title) || '',
      text: (document.querySelector('#content .wi4') || {}).innerText || '' }));
    await check(scn, r, S, await evs(page, 'expired'));
    ok(scn, 'never «κανείς»', !/κανείς/i.test(r.text));
    await page.context().close();
  };
  await quiet(404, (s, r) => ok(s, '404 → «σε παύση» shown; title «Ζωντανή εικόνα σε παύση — δεν ξέρουμε ποιος άλλος είναι μέσα»', /paused/.test(r.cls) && /σε παύση/.test(r.t) && /^Ζωντανή εικόνα σε παύση — δεν ξέρουμε ποιος άλλος είναι μέσα/.test(r.title), r));
  await quiet(429, (s, r, S) => {
    ok(s, '429 → not paused (our own pacing), beats continue', !/paused/.test(r.cls) && S.beats.length >= 2, { r, beats: S.beats.length });
    // Every beat answered 429: no successful beat yet, so no claim either way.
    ok(s, 'before a successful beat the strip claims nothing (no «↻ ζωντανά»)', !/ζωντανά/.test(r.t) && r.av === 0, r);
  });
  await quiet(401, (s, r, S, ex) => ok(s, '401 → session expiry once, then no more beats', ex.length === 1 && S.beats.length === 1, { expired: ex.length, beats: S.beats.length }));
  await quiet(403, (s, r, S) => ok(s, '403 → «μη διαθέσιμη» shown, title «Η ζωντανή εικόνα δεν είναι διαθέσιμη για τον ρόλο σου», no more beats', /μη διαθέσιμη/.test(r.t) && r.title === 'Η ζωντανή εικόνα δεν είναι διαθέσιμη για τον ρόλο σου' && S.beats.length === 1, { r, beats: S.beats.length }));
  // Review 11/10 (P2): at 1920 ONE colleague already cut the strip to «… · ↻
  // ζ…», and the paused / forbidden sentences — the «unknown ≠ empty»
  // warnings — would shrink to a few letters. For every state, at 1920 and
  // 1440, the state word is whole, the sync token is whole and inside the bar,
  // and there is one ↻ (never «↻ ζωντανά» beside «↻ Ενημερώθηκε»).
  const STATES = [
    ['live', { others: [{ sub: 'rig_b', name: 'Χρήστης Β', records: [] }] }, /εδώ τώρα/, /ζωντανά/],
    ['live3', { others: ['Παντελής', 'Ειρήνη', 'Θοδωρής'].map((n, i) => ({ sub: 'rig_' + i, name: n, records: [] })) }, /εδώ τώρα/, /ζωντανά/],
    ['paused', { mode: 404 }, /σε παύση/, /μόλις τώρα|πριν/],
    ['forbidden', { mode: 403 }, /μη διαθέσιμη/, /μόλις τώρα|πριν/],
    ['changes', { others: [{ sub: 'rig_b', name: 'Χρήστης Β', records: [] }], changes: { n: 3, last_by: 'Χρήστης Γ', last_at: '2026-10-06T06:30:00Z', auto_n: 0 } }, /εδώ τώρα/, /3 αλλαγές/],
  ];
  for (const [name, cfg, word, token] of STATES) {
    const scn = 'presence.layout.' + name;
    const { page } = await openBoard(browser, origin, { presence: true, presenceCfg: cfg });
    await page.waitForTimeout(6500);
    for (const vw of [1920, 1440]) {
      await page.setViewportSize({ width: vw, height: 1080 }); await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const bar = document.querySelector('.wi4-bar-l').getBoundingClientRect();
        const w = document.querySelector('.wi4-pres .wi4-pres-w'), u = document.getElementById('wi4-upd');
        const tabs = document.getElementById('wi4-tabs').getBoundingClientRect(), right = document.querySelector('.wi4-bar-r').getBoundingClientRect();
        const whole = el => !!el && el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= bar.right + 1 && el.getBoundingClientRect().width > 0;
        return { word: w ? w.textContent : '', wordWhole: whole(w), token: u ? u.textContent : '', tokenWhole: whole(u),
          refresh: document.querySelectorAll('.wi4-bar-l svg').length, overlap: tabs.right > right.left + 1,
          dbg: { barL: Math.round(bar.width), kids: [...document.querySelector('.wi4-bar-l').children].map(c => [c.className.toString().slice(0, 18), Math.round(c.getBoundingClientRect().width), c.scrollWidth]), tok: u ? [u.scrollWidth, u.clientWidth, Math.round(u.getBoundingClientRect().right), Math.round(bar.right)] : null, tabsL: Math.round(tabs.left), rightW: Math.round(right.width) },
          // F4: names whole or hidden whole (their title still lists them); a tint per person.
          names: (() => { const n = document.querySelector('.wi4-pres .wi4-pres-n'); if (!n) return null; const shown = n.getClientRects().length > 0;
            const w = document.querySelector('.wi4-pres .wi4-pres-w'); return { text: n.textContent, shown, whole: shown && n.scrollWidth <= n.clientWidth + 1, titled: !!w && n.textContent.split(',').every(x => w.title.includes(x.trim())) }; })(),
          tints: [...document.querySelectorAll('.wi4-pres .wi4-av')].map(a => (a.className.match(/\bt\d\b/) || [''])[0]),
          // F13: paused / forbidden keep the range whole and some of the sentence.
          range: (() => { const g = document.querySelector('.wi4-range'); return g ? { whole: g.scrollWidth <= g.clientWidth + 1, w: Math.round(g.getBoundingClientRect().width) } : null; })(),
          restW: (() => { const x = document.querySelector('.wi4-pres .wi4-pres-r'); return x ? Math.round(x.getBoundingClientRect().width) : null; })(),
          // r2/topbar-presence-gaps, -sync-token-type, -paused-word-lowercase.
          gaps: (() => { const R = (s) => { const e = document.querySelector(s); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; };
            const avs = [...document.querySelectorAll('.wi4-pres .wi4-av')], la = avs.length ? avs[avs.length - 1].getBoundingClientRect() : null;
            const n = R('.wi4-pres .wi4-pres-n'), ic = R('.wi4-pres .wi4-pres-ic'), pw = R('.wi4-pres .wi4-pres-w'), up = document.getElementById('wi4-upd'), sv = up && up.querySelector('svg');
            const d = (a, b) => (a && b ? Math.round((b.left - a.right) * 10) / 10 : null);
            return { avToNames: d(la, n), dotToWord: ic && pw ? d(ic, pw) : null, wl: ((document.querySelector('.wi4-pres .wi4-pres-wl') || {}).textContent) || null,
              tokFs: up ? getComputedStyle(up).fontSize : null, tokIcon: sv ? Math.round(sv.getBoundingClientRect().width) : 0,
              wordToRule: up && pw ? d(pw, up.getBoundingClientRect()) : null, ruleToIcon: up && sv ? Math.round((sv.getBoundingClientRect().left - up.getBoundingClientRect().left - parseFloat(getComputedStyle(up).borderLeftWidth)) * 10) / 10 : null }; })() };
      });
      ok(scn, `${vw}: the state word is whole («${r.word}»), the sync token is whole and in the bar, one ↻ while live, the tabs clear of the actions`,
        word.test(r.word) && r.wordWhole && token.test(r.token) && r.tokenWhole && !r.overlap && (!/^live/.test(name) || r.refresh === 1), r);
      if (/^live/.test(name)) {
        ok(scn, `${vw}: names whole or hidden whole (title lists them), never cut`, !!r.names && (r.names.whole || (!r.names.shown && r.names.titled)), r.names);
        ok(scn, `${vw}: every avatar has a tint, two people never the same one`, r.tints.length >= 1 && r.tints.every(Boolean) && new Set(r.tints).size === r.tints.length, r.tints);
      }
      if (vw === 1920 && (name === 'paused' || name === 'forbidden'))
        ok(scn, '1920: the range is whole and some of the sentence shows', !!r.range && r.range.whole && r.restW > 0, { range: r.range, restW: r.restW });
      // Figma sheet 16 A 1123:2720 (avatars → names → rule → text, 14 each), 1123:2730
      // («↻ ζωντανά» 11.5, a 13px icon); A2 1123:2731 (dot → sentence 14,
      // «Ζωντανή» capital, 1123:2735), the token 12px (1115:2700).
      if (vw === 1920 && name === 'live')
        ok(scn, '1920: 14px from the avatars to the names and on either side of the rule; «↻ ζωντανά» 11.5px with a 13px icon', Math.abs(r.gaps.avToNames - 14) <= 0.6 && Math.abs(r.gaps.wordToRule - 14) <= 0.6 && Math.abs(r.gaps.ruleToIcon - 14) <= 0.6 && r.gaps.tokFs === '11.5px' && r.gaps.tokIcon === 13, r.gaps);
      if (vw === 1920 && name === 'paused')
        ok(scn, '1920: 14px from the amber dot to «Ζωντανή εικόνα σε παύση» (capital Ζ); the token 12px with a 13px icon', Math.abs(r.gaps.dotToWord - 14) <= 0.6 && /^Ζωντανή εικόνα/.test(r.gaps.wl || '') && r.gaps.tokFs === '12px' && r.gaps.tokIcon === 13, r.gaps);
    }
    await page.context().close();
  }
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
    // Figma 1125:2976: who AND from → to in the bold lead, «Η δική σου
    // επιλογή: … Ποια κρατάμε;» one regular line, buttons DM Sans Medium
    // 11.5 / 25px, the --wi4-conf-line border, across the panel's inner width.
    const cf = await page.evaluate(([tok]) => { const p = document.querySelector('.wi4-datep'), c = p && p.querySelector('.wi4-conf'); if (!c) return null; const t = eval(tok);
      const lead = c.querySelector('.wi4-conf-lead'), kids = [...c.children].filter(k => !k.classList.contains('wi4-conf-lead') && !k.classList.contains('wi4-dlg-ft'));
      const pb = p.getBoundingClientRect(), cb = c.getBoundingClientRect(), bw = parseFloat(getComputedStyle(p).borderLeftWidth);
      return { lead: lead ? lead.textContent : '', leadW: lead ? getComputedStyle(lead).fontWeight : null, lines: kids.map(k => ({ t: k.textContent, w: getComputedStyle(k).fontWeight })),
        border: getComputedStyle(c).borderTopColor, want: t('--wi4-conf-line'), radius: getComputedStyle(c).borderTopLeftRadius, inner: pb.width - 2 * bw, w: cb.width, x: cb.left - pb.left - bw, boxH: Math.round(cb.height),
        btn: [...c.querySelectorAll('button')].map(b => ({ t: b.textContent, top: Math.round(b.getBoundingClientRect().top), fam: getComputedStyle(b).fontFamily, size: getComputedStyle(b).fontSize, w: getComputedStyle(b).fontWeight, h: b.getBoundingClientRect().height, out: b.getBoundingClientRect().left < cb.left || b.getBoundingClientRect().right > cb.right })) }; }, [TOKEN_JS]);
    ok(scn, 'the lead names who AND both dates («… : Τετ 7/10 06:00 → Τετ 7/10 12:00»), SemiBold', !!cf && /άλλαξε/.test(cf.lead) && /:\s*\S+ \d{1,2}\/\d{1,2}.*→.*\d{1,2}\/\d{1,2}/.test(cf.lead) && cf.leadW === '600', cf);
    ok(scn, '«Η δική σου επιλογή: … Ποια κρατάμε;» is ONE regular line', !!cf && cf.lines.length === 1 && /^Η δική σου επιλογή: .+\. Ποια κρατάμε;$/.test(cf.lines[0].t) && cf.lines[0].w === '400', cf && cf.lines);
    ok(scn, 'box: conf-line border, radius 6, the panel\'s inner width; buttons DM Sans Medium 11.5, 25px, inside the box',
      !!cf && cf.border === cf.want && cf.radius === '6px' && Math.abs(cf.w - cf.inner) <= 2 && Math.abs(cf.x) <= 1 && cf.btn.length === 2
      && cf.btn.every(b => /^"?DM Sans/.test(b.fam) && b.size === '11.5px' && b.w === '500' && Math.abs(b.h - 25) <= 0.5 && !b.out), cf);
    // Parity r2 (Figma 1125:2982): the rig's 409 is anonymous (by 'user');
    // «Κράτα του άλλου χρήστη» stacked the two buttons and pushed the
    // calendar down. «Κράτα την τρέχουσα» keeps them on one row.
    ok(scn, 'anonymous 409: «Κράτα την τρέχουσα» + «Γράψε τη δική μου» on ONE row, box ≤110px tall (1125:2982)',
      !!cf && cf.btn.length === 2 && cf.btn[0].t === 'Κράτα την τρέχουσα' && Math.abs(cf.btn[0].top - cf.btn[1].top) <= 1 && cf.boxH <= 110, cf && { btn: cf.btn.map(b => [b.t, b.top]), boxH: cf.boxH });
    if (OUT) await page.locator('.wi4-datep').screenshot({ path: path.join(OUT, 'conflict-date-panel-crop.png') });
    const mine = page.locator('.wi4-datep .wi4-conf button', { hasText: 'Γράψε τη δική μου' });
    ok(scn, 'buttons «Κράτα …» and «Γράψε τη δική μου»', (await mine.count()) === 1 && (await page.locator('.wi4-datep .wi4-conf button', { hasText: 'Κράτα' }).count()) === 1);
    if (await mine.count()) { await mine.click(); await page.waitForTimeout(500); await settle(page, S, 1000); }
    // Only the date writes: syncOrderDownstream's own follow-up PATCH on the
    // order (e.g. 'National Order Created') is today's cascade, not a resend.
    const P = patches(S, 'recWiE009').filter(p => p.fields && 'Loading DateTime' in p.fields);
    ok(scn, '«Γράψε τη δική μου» resends with _expect = the server\'s current value and writes', P.length === 2 && P[1].status === 200 && WI4.sameValue(P[1].expect['Loading DateTime'], '2026-10-07T09:00:00.000Z', 'Loading DateTime'), P);
    // The keep label itself: a named author stays «Κράτα του Χ»; only the
    // anonymous one became «Κράτα την τρέχουσα».
    const keep = await page.evaluate(async () => { const out = {};
      for (const by of ['Χρήστης Β', 'user']) {
        const p = WI4Actions.conflictDialog({ by, fields: [] }, { kind: 'assign' });
        const b = document.querySelector('.wi4-dlg .wi4-conf .wi4-dlg-ft .wi4-btn:not(.pri)'); out[by] = b ? b.textContent : null;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await p;
      }
      return out; });
    ok(scn, 'keep button: «Κράτα του Χρήστης Β» for a named author, «Κράτα την τρέχουσα» for an anonymous one', keep['Χρήστης Β'] === 'Κράτα του Χρήστης Β' && keep.user === 'Κράτα την τρέχουσα', keep);
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
    // Rules «Μηνύματα»: a plate, a reference or a client — never an internal id;
    // «Η δική σου επιλογή» is what the user picked, not «κενό».
    ok(scn, 'the dialog names plates (theirs TST-1015, mine TST-1016), never a record id', /TST-1015/.test(r.dlg) && /TST-1016/.test(r.dlg) && !/rec[A-Za-z0-9]{8,}/.test(r.dlg), r.dlg);
    // Same split as in the panel; the modal lives on <body>, so its buttons
    // were Arial until the overlay reset (F1).
    const md = await page.evaluate(() => { const c = document.querySelector('.wi4-dlg .wi4-conf');
      return c ? { lead: (c.querySelector('.wi4-conf-lead') || {}).textContent || '', line: [...c.children].filter(k => !k.className).map(k => k.textContent).join('|'),
        fams: [...document.querySelectorAll('.wi4-dlg-back button')].map(b => getComputedStyle(b).fontFamily) } : null; });
    ok(scn, 'modal: «…: TST-1007 → TST-1015» in the lead, «Η δική σου επιλογή: TST-1016. Ποια κρατάμε;» under it, every button DM Sans',
      !!md && /→ TST-1015/.test(md.lead) && md.line === 'Η δική σου επιλογή: TST-1016. Ποια κρατάμε;' && md.fams.length >= 3 && md.fams.every(f => /^"?DM Sans/.test(f)), md);
    await shot(page, 'conflict-dialog-assign');
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
    // A DIFFERENT truck: with the same one the facade's «body equals current
    // → nothing can be lost» exemption hid any 409, so the case proved
    // nothing about a stale _expect (review 11/10). The proof is the _expect
    // itself: it must carry the truck rt_sync cascaded (T016), not the
    // painted value from before our own export save.
    const legLog0 = S.log.length;
    await setPopoverTruck(page, legRow, 'recWiT009', 'TST-1009');
    await page.evaluate(id => { window.__p = _wiSaveFromPopover(id); }, legRow); await confirmIfAsked(page); await waitP(page, scn, '(a) rota leg save'); await settle(page, S, 1500);
    no409('assign → assign (another truck) on a rota leg of the same RT');
    const legP = S.log.slice(legLog0).filter(x => x.k === 'patch' && x.id === 'recWiI010' && x.fields && x.fields.Truck);
    ok(scn, '(a) the leg\'s _expect carries the cascaded truck (TST-1016), and the new one is written', !!legP[0] && legP[0].expect && JSON.stringify(legP[0].expect.Truck) === '["recWiT016"]' && link(fld(S, 'recWiI010', 'Truck')) === 'recWiT009',
      legP.map(p => ({ expect: p.expect, fields: p.fields, status: p.status })));
    // (b) cancel a groupage member, then assign that member.
    await page.evaluate(id => { window.__p = _wiCancelGroupMember(id, 'recWiE013', false); }, await rowOf(page, 'recWiE011'));
    await confirmIfAsked(page, 4000); await waitP(page, scn, '(b) cancel member'); await settle(page, S, 1500);
    const r13 = await rowOf(page, 'recWiE013');
    await page.evaluate(id => _wiOpenPopover({ currentTarget: document.querySelector('#content .wi4') || document.body, stopPropagation() {}, preventDefault() {} }, id), r13);
    await page.waitForTimeout(300); await setPopoverTruck(page, r13, 'recWiT009', 'TST-1009');
    await page.evaluate(id => { window.__p = _wiSaveFromPopover(id); }, r13); await confirmIfAsked(page); await waitP(page, scn, '(b) member save'); await settle(page, S, 1500);
    no409('cancel-member → assign that member');
    // (c) match, then edit the matched import from its own popover.
    await htmlDrag(page, '#wi-imp-recWiI004', `#wi-ci-${await rowOf(page, 'recWiE006')}`); await page.waitForTimeout(300); await settle(page, S, 1500);
    const ri4 = await rowOf(page, 'recWiI004');   // the matched import's own row
    await page.evaluate(id => _wiOpenImpPopover({ currentTarget: document.querySelector('#content .wi4') || document.body, stopPropagation() {}, preventDefault() {} }, 'recWiI004', id), ri4);
    await page.waitForTimeout(300); await setPopoverTruck(page, ri4, 'recWiT006', 'TST-1006');
    await page.evaluate(id => { window.__p = _wiSaveFromPopover(id); }, ri4); await confirmIfAsked(page); await waitP(page, scn, '(c) matched import save'); await settle(page, S, 1500);
    no409('edit the matched import after a match');
    // (c2) × unmatch, then match again on the same export: the export's
    // 'Matched Import ID' the board holds must be what our own unmatch wrote
    // (empty), not the match it painted from.
    await page.evaluate(id => { window.__p = _wiRemoveImport(id); }, await rowOf(page, 'recWiE006')); await confirmIfAsked(page);
    await waitP(page, scn, '(c2) unmatch'); await settle(page, S, 1500);
    ok(scn, '(c2) the unmatch reached the table', !fld(S, 'recWiE006', 'Matched Import ID'), fld(S, 'recWiE006', 'Matched Import ID'));
    await htmlDrag(page, '#wi-imp-recWiI004', `#wi-ci-${await rowOf(page, 'recWiE006')}`); await confirmIfAsked(page); await page.waitForTimeout(300); await settle(page, S, 1500);
    no409('unmatch → match again on the same export');
    ok(scn, '(c2) the table holds the new match', fld(S, 'recWiE006', 'Matched Import ID') === 'recWiI004', fld(S, 'recWiE006', 'Matched Import ID'));
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
    const view = page.locator('.wi4-top .wi4-btn', { hasText: 'Προβολή' });
    if (await view.count()) { await view.first().click(); await page.waitForTimeout(300); }
    const vm = await page.evaluate(() => { const m = document.getElementById('wi4-view'); return { open: !!m && !m.hidden, text: m ? m.innerText : null, panel: !!document.querySelector('.wi4-datep'), live: window.TMS_EXPECT_LIVE }; });
    ok(scn, '«Προβολή ▾» says «ο έλεγχος "το άλλαξε άλλος" δεν είναι ενεργός ακόμη»', vm.open && /ο έλεγχος .το άλλαξε άλλος. δεν είναι ενεργός ακόμη/.test(vm.text || ''), vm);
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
    // normFlag/v2Decide are spared: they decide active() (whether v4 is asked
    // at all), and a throw there only makes active() false; the scenario is a
    // PAINT that throws once v4 has been chosen.
    const spare = new Set(['normFlag', 'v2Decide']);
    window.WI4 = new Proxy(real, { get(t, k) { const v = t[k]; return typeof v === 'function' && !spare.has(k) ? () => { throw new Error('rig: forced paint failure'); } : v; } });
    const le0 = window.__ev.filter(e => e.k === 'logError').length;
    // _wiPaint lives inside the old module's closure (not on window); the
    // reachable path to it is a full render, whose paint asks WIV2.paint first.
    await WI_INTERNAL.renderWeeklyIntl();
    await new Promise(r => setTimeout(r, 2000));
    const one = { broken: WIV2._broken === true, active: WIV2.active(), v1: !!document.querySelector('#content .wk3.wi2'), v4: !!document.querySelector('#content .wi4'),
      banners: (document.body.innerText.match(/Η νέα προβολή απέτυχε/g) || []).length, le: window.__ev.filter(e => e.k === 'logError').length - le0 };
    await WI_INTERNAL.renderWeeklyIntl(); await new Promise(r => setTimeout(r, 2000));
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
  ok(scn, 'no v4 hook or listener acts afterwards', await page.evaluate(() => !document.querySelector('.wi4-focus') && ((document.getElementById('wi-ctx') || {}).style || {}).display !== 'block' && !document.querySelector('.wi4-datep')));
  ok(scn, 'nothing written', !writes(S).length, writes(S));
  await page.context().close();
}

// §c.3: overlays live outside .wi4; the .wk3.wi2-scoped rules do not reach
// them in v4. Same opener on both boards, computed styles compared.
async function scnStyles(browser, origin) {
  const PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'color', 'backgroundColor', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderBottomWidth', 'borderBottomColor'];
  // The popover's primary («Ενημέρωση/Αποθήκευση ανάθεσης») is navy in v4 —
  // the board's ONE primary (fix round 3, review 11/10): an intended
  // difference, so it is left out here and checked on its own below.
  const SKIN = '.wi-pop-save';
  const cap = (page, rootSel) => page.evaluate(([sel, props, skin]) => {
    const root = document.querySelector(sel); if (!root) return null;
    const out = {}; const walk = (el, p) => { [...el.children].forEach((c, i) => { const k = p + '/' + c.tagName + i; const s = getComputedStyle(c);
      if (!c.matches(skin)) out[k] = props.map(x => s[x]).join('|'); walk(c, k); }); };
    walk(root, ''); return out;
  }, [rootSel, PROPS, SKIN]);
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
    C.save = await page.evaluate(([tok]) => { const b = document.querySelector('#wi-popover .wi-pop-save'); return b ? { bg: getComputedStyle(b).backgroundColor, ink: eval(tok)('--wi4-ink') } : null; }, [TOKEN_JS]);
    await page.evaluate(() => _wiClosePopover());
    // Both menus open the same way (a synthetic event, no pointer), and the
    // item focus that _wiCtxShow sets is dropped before the capture: which
    // item opens focused follows the menu ORDER, a decided v4 difference
    // (truck section first), not a style.
    if (flag === 'off') await page.evaluate(e => _wiCtx((0, eval)(e), WINTL.rows.find(x => (x.orderIds || []).includes('recWiE001')).id), ev);
    else await page.evaluate(e => WI4Actions.openRowMenu((0, eval)(e), 'recWiE001'), ev);
    await page.waitForTimeout(250);
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    // .wi-ctx-i fades its focus background over 70 ms: captured at once, the
    // value was whatever frame the round trip landed on (rgba …, 0.62 on one
    // board, opaque on the other — a flake, not a style). At rest, both boards.
    await page.waitForTimeout(300);
    C.menu = await menuStyles(page);
    C.danger = await page.evaluate(([tok]) => eval(tok)('--danger'), [TOKEN_JS]);
    await page.evaluate(() => _wiCtxClose());
    const r23 = await rowOf(page, 'recWiE023'), r24 = await rowOf(page, 'recWiE024'), r14 = await rowOf(page, 'recWiI014');
    for (const h of [`_wiPanelGroupBuild(${r7},false)`, `_wiPanelGroupBuild(${r14},true)`, `_wiPanelRota(${r23})`, `_wiPanelJoinLoad(${r24})`]) {
      await page.evaluate(x => { try { (0, eval)(x); } catch (e) { /* the twin decides */ } }, h); await page.waitForTimeout(350);
      C['panel ' + h] = await cap(page, '#wi-panel');
      await page.evaluate(() => { if (typeof _wiPanelClose === 'function') _wiPanelClose(); }); await page.waitForTimeout(150);
    }
    await page.context().close();
  }
  ok('styles', 'v4 skin: the popover\'s primary is navy (--wi4-ink), v1\'s stays as it was', !!caps.on.save && caps.on.save.bg === caps.on.save.ink && !!caps.off.save && caps.off.save.bg !== caps.on.save.bg, { v1: caps.off.save, v4: caps.on.save });
  // The per-load menu's intended v4 differences (parity r1, Figma 1097:3858;
  // TECH_DESIGN §c.3), checked on their own like the navy primary:
  //   F4  every item DM Sans 13 regular with 12px sides — #wi-ctx sits outside
  //       .wi4, so v1's items draw in the browser's button font (Arial 12) at 14px;
  //   F6  «Αφαίρεση ταιριάσματος» red (.d) in v4, plain in v1 (its 0px
  //       borders take the text colour, so their colour follows).
  // Everything else — top/bottom padding, borders, background, and the colour
  // of every other item — stays v1's.
  {
    const P = i => PROPS.indexOf(i);
    const FONT = [P('fontFamily'), P('fontSize'), P('fontWeight')], SIDES = [P('paddingLeft'), P('paddingRight')];
    const INK = [P('color'), P('borderTopColor'), P('borderBottomColor')];
    const a = caps.off.menu || {}, b = caps.on.menu || {};
    const keys = Object.keys(a).filter(x => x in b);
    const UNMATCH = /^_wiUnmatch(Row)?\(/;
    const diff = keys.flatMap(x => { const va = a[x].split('|'), vb = b[x].split('|');
      return PROPS.map((p, i) => (FONT.includes(i) || SIDES.includes(i) || (INK.includes(i) && UNMATCH.test(x)) || va[i] === vb[i] ? null : `${x} ${p}: v1 ${va[i]} ≠ v4 ${vb[i]}`)).filter(Boolean); });
    ok('styles', `menu: computed styles v4 = v1 apart from the intended differences (${keys.length} nodes compared)`, keys.length > 0 && !diff.length, diff.slice(0, 8));
    const v4 = Object.values(b).map(s => s.split('|'));
    ok('styles', 'menu (intended, F4): every v4 item is DM Sans 13px 400 with 12px sides', v4.length > 0 && v4.every(s => /DM Sans/.test(s[P('fontFamily')]) && s[P('fontSize')] === '13px' && s[P('fontWeight')] === '400' && s[P('paddingLeft')] === '12px' && s[P('paddingRight')] === '12px'), v4.slice(0, 3));
    const un = keys.find(x => UNMATCH.test(x));
    ok('styles', 'menu (intended, F6): «Αφαίρεση ταιριάσματος» is red (--danger) in v4, plain in v1', !!un && b[un].split('|')[P('color')] === caps.on.danger && a[un].split('|')[P('color')] !== caps.on.danger, { un, v1: un && a[un], v4: un && b[un], danger: caps.on.danger });
  }
  for (const k of Object.keys(caps.off)) {
    if (k === 'save' || k === 'menu' || k === 'danger') continue;
    const a = caps.off[k] || {}, b = caps.on[k] || {};
    const keys = Object.keys(a).filter(x => x in b);
    const diff = keys.filter(x => a[x] !== b[x]).map(x => `${x}: v1 ${a[x]} ≠ v4 ${b[x]}`);
    ok('styles', `${k}: computed styles v4 = v1 (${keys.length} nodes compared)`, keys.length > 0 && !diff.length, diff.slice(0, 8));
  }
}


// ═══ Fix round 3 (11/10) ═══════════════════════════════════════════════
// Roles with planning:'view' print by mouse only through the row's print
// button (review 11/10, P2): the per-load menu is behind _wiBlockReadOnly,
// exactly like v1's row menu — no role gains or loses a right. A right-click
// on the button is the share menu, for every role.
async function scnPrint(browser, origin) {
  let scn = 'print.view';
  {
    const { page, S } = await openBoard(browser, origin, { role: 'accountant' });
    await page.evaluate(() => { window.__prints = []; window.printOrderSheet = function () { window.__prints.push([...arguments]); }; });
    const has = await page.evaluate(([js]) => { const r = eval(js)('recWiE001'); if (r) { r.setAttribute('data-rig-row', 'E001'); r.scrollIntoView({ block: 'center' }); } return !!r; }, [ROW_JS]);
    const rowL = page.locator('[data-rig-row="E001"]');
    await rowL.hover({ position: { x: 600, y: 16 } }); await page.waitForTimeout(150);
    const btn = rowL.locator('.wi4-asg .wk3-prt');
    const vis = await btn.evaluate(b => getComputedStyle(b).visibility).catch(() => 'missing');
    const clicked = await btn.click({ timeout: 4000 }).then(() => true, () => false);
    await page.waitForTimeout(250);
    const prints = await page.evaluate(() => window.__prints);
    ok(scn, 'accountant (planning:view): hovering E001 shows the print button; a mouse click prints E001 (export)', has && vis === 'visible' && clicked && prints.length === 1 && prints[0][0] === 'recWiE001' && prints[0][1] === 'export', { vis, clicked, prints });
    await rowL.locator('.wi4-plane').click(); await page.waitForTimeout(250);
    const menu = await page.evaluate(() => ((document.getElementById('wi-ctx') || {}).style || {}).display === 'block');
    const ro = (await evs(page, 'toast')).some(e => /Μόνο ανάγνωση/.test(String(e.a[0])));
    ok(scn, 'the per-load menu keeps today\'s read-only gate for this role («Μόνο ανάγνωση»): no gate added, none removed', !menu && ro, { menu, ro });
    ok(scn, 'nothing written; no page errors', !writes(S).length && !S.pageErrors.length, { w: writes(S), e: S.pageErrors });
    await page.context().close();
  }
  scn = 'print.share';
  {
    const { page, S } = await openBoard(browser, origin);
    await page.evaluate(([js]) => { const r = eval(js)('recWiE001'); if (r) { r.setAttribute('data-rig-row', 'E001'); r.scrollIntoView({ block: 'center' }); } }, [ROW_JS]);
    const rowL = page.locator('[data-rig-row="E001"]');
    await rowL.hover({ position: { x: 600, y: 16 } }); await page.waitForTimeout(150);
    await rowL.locator('.wi4-asg .wk3-prt').click({ button: 'right', timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => { const m = document.getElementById('shMenu');
      return { sh: !!m, items: m ? [...m.querySelectorAll('button')].map(b => b.textContent) : [], ctx: ((document.getElementById('wi-ctx') || {}).style || {}).display === 'block' }; });
    ok(scn, 'right-click on the row\'s print button opens the share menu (Λήψη PDF · Κοινή χρήση), not the per-load menu', r.sh && !r.ctx && r.items.some(t => /Κοινή χρήση/.test(t)), r);
    // Parity r1 F7 (Figma Assign 1097:2501): pill 176, 6px, the arrow; print
    // out of the flow, in the gutter past the cell — on neither the pill nor
    // the arrow, and clear of the import cell's first chip.
    await page.mouse.click(5, 5); await page.waitForTimeout(150);
    await rowL.hover({ position: { x: 600, y: 16 } }); await page.waitForTimeout(150);
    const g = await rowL.evaluate(row => {
      const R = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }; };
      const asg = row.querySelector('.wi4-asg');
      const chip = row.querySelector('.wi4-c-imp .wi4-dc, .wi4-c-imp button, .wi4-c-imp .wi4-gap');
      return { cell: R(asg), box: R(asg.querySelector('.wi4-box')), plane: R(asg.querySelector('.wi4-plane')), prt: R(asg.querySelector('.wk3-prt')), chip: R(chip),
        vis: getComputedStyle(asg.querySelector('.wk3-prt')).visibility };
    });
    ok(scn, 'at 1920 the pill is 176±1 wide, the arrow 6±1px after it; print sits past the cell, on neither, clear of the import\'s first chip', !!g.box && Math.abs(g.box.w - 176) <= 1
      && Math.abs(g.plane.l - g.box.r - 6) <= 1 && g.prt.l >= g.plane.r && g.prt.l >= g.cell.r - 1 && (!g.chip || g.prt.r <= g.chip.l) && g.vis === 'visible', g);
    ok(scn, 'nothing written', !writes(S).length, writes(S));
    await page.context().close();
  }
}

// P1 review 11/10: a write takes its row id at the start and reports after
// its awaits. A re-read in between (a week tab, «Ανανέωση», another row's
// date save) renumbers the rows: the result must land on the ORDER that was
// written — never under another load, never a ⟳ for ever — and be heard.
async function scnShift(browser, origin) {
  const scn = 'shift';
  const { page, S } = await openBoard(browser, origin);
  const r7 = await rowOf(page, 'recWiE007');
  ok(scn, 'E007\'s popover opens', await openPopover(page, 'recWiE007'));
  ok(scn, 'the popover form accepts a truck', await setPopoverTruck(page, r7, 'recWiT016', 'TST-1016'));
  await page.evaluate(() => { window.__ev.length = 0; });
  S.fail.patch.recWiE007 = 500; S.delay.recWiE007 = 2500; S.log = [];
  await page.locator('#wi-popover [onclick*="_wiSaveFromPopover"]').first().click(); await confirmIfAsked(page, 1000);
  // While the first attempt is held: an export delivered on Saturday sorts
  // first (every row id after it moves), and the board re-reads.
  S.db[T.ORDERS].push({ id: 'recWiZZZ002', fields: { Type: 'International', Direction: 'Export', Status: 'Pending', Client: ['recWiC001'],
    'Loading DateTime': '2026-10-02T05:00:00.000Z', 'Delivery DateTime': '2026-10-03T06:00:00.000Z', 'Total Pallets': 10, Reference: 'REF-Z002' } });
  await page.evaluate(() => WI_INTERNAL.renderWeeklyIntl());
  const st = await syncSettled(page, 'recWiE007', 20000);
  await page.waitForTimeout(500);
  const r = await page.evaluate(([js]) => {
    const log = WINTL._syncLog || {};
    const row = eval(js)('recWiE007');
    const msg = document.querySelector('#content .wi4 [data-msg="recWiE007"]');
    let prev = msg && msg.previousElementSibling; while (prev && !prev.classList.contains('wi4-row')) prev = prev.previousElementSibling;
    return { r7now: WIV2.rowIdOf('recWiE007'), keys: Object.entries(log).filter(([, x]) => x && (x.state === 'err' || x.state === 'pend')).map(([k, x]) => k + ':' + x.state),
      msg: msg ? msg.textContent : '', under: !!(prev && prev.getAttribute('data-oid') === 'recWiE007'), slot: row ? ((row.querySelector('.wi-sync') || {}).textContent || '') : null,
      others: [...document.querySelectorAll('#content .wi4 [data-msg]')].map(m => m.getAttribute('data-msg')).filter(o => o !== 'recWiE007') };
  }, [ROW_JS]);
  ok(scn, 'the re-read renumbered the rows while the write was in flight', r.r7now != null && r.r7now !== r7, { r7, now: r.r7now });
  ok(scn, 'the result is logged on the ORDER written (E007 err); no other load is ⚠ or ⟳', st === 'err' && r.keys.length === 1 && r.keys[0] === 'recWiE007:err', r.keys);
  ok(scn, 'the failure line sits under E007 and no other load carries one; E007\'s slot says ⚠', r.under && !r.others.length && /Δεν αποθηκεύτηκε/.test(r.msg) && r.slot === '⚠', r);
  const heard = (await evs(page)).filter(e => e.k === 'reportError' || e.k === 'toast').map(e => String(e.a[0]));
  ok(scn, 'the row moved under the write, so the failure is ALSO a toast — it surely reaches the user', heard.some(t => /Σφάλμα αποθήκευσης αντιστοίχισης/.test(t)), heard);
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
  // The other write paths key their slot the same way (join, groupage, stock
  // piece): a dissolve (_wiGroupPatch) whose first PATCH fails while a re-read
  // renumbers the rows is logged on the group's OWN order.
  {
    const scn2 = 'shift.group';
    const { page: p2, S: S2 } = await openBoard(browser, origin);
    const g = await p2.evaluate(() => { const id = WIV2.rowIdOf('recWiE011'); const r = WINTL.rows.find(x => x.id === id); return r ? { id, ids: [...(r.orderIds || [])] } : null; });
    ok(scn2, 'E011 heads a groupage row', !!(g && g.ids.length > 1 && g.ids[0] === 'recWiE011'), g);
    if (g && g.ids[0] === 'recWiE011') {
      S2.fail.patch.recWiE011 = 500; S2.delay.recWiE011 = 2500; S2.log = [];
      await p2.evaluate((id) => { _wiSplit(id); }, g.id);
      S2.db[T.ORDERS].push({ id: 'recWiZZZ003', fields: { Type: 'International', Direction: 'Export', Status: 'Pending', Client: ['recWiC001'],
        'Loading DateTime': '2026-10-02T05:00:00.000Z', 'Delivery DateTime': '2026-10-03T06:00:00.000Z', 'Total Pallets': 10, Reference: 'REF-Z003' } });
      await p2.evaluate(() => WI_INTERNAL.renderWeeklyIntl());
      const st = await syncSettled(p2, 'recWiE011', 20000);
      await p2.waitForTimeout(800);
      const r = await p2.evaluate(() => ({
        keys: Object.entries(WINTL._syncLog || {}).filter(([, x]) => x && (x.state === 'err' || x.state === 'pend')).map(([k, x]) => k + ':' + x.state),
        others: [...document.querySelectorAll('#content .wi4 [data-msg]')].map(m => m.getAttribute('data-msg')).filter(o => o !== 'recWiE011') }));
      ok(scn2, 'the dissolve\'s failure is logged on E011; no other load is ⚠ or ⟳, and none carries a failure line', st === 'err' && r.keys.length === 1 && r.keys[0] === 'recWiE011:err' && !r.others.length, r);
    }
    ok(scn2, 'no page errors', !S2.pageErrors.length, S2.pageErrors);
    await p2.context().close();
  }
}

// A late source landing (review 11/10): relays answering last and EMPTY left
// the queue on «≥N … φορτώνει…» for ever (P2); a national read landing while
// a popover was open repainted #content and closed it (P3).
async function scnLate(browser, origin) {
  let scn = 'late.relayEmpty';
  {
    const { page, S } = await openBoard(browser, origin, { hold: { relay: true }, mutate: db => { db[T.LOCAL_MOVES] = []; } });
    const before = await page.evaluate(() => (document.querySelector('#content .wi4 .wi4-q-hd') || {}).innerText || '');
    ok(scn, 'while the relay read is pending the queue says «≥N … φορτώνει…»', /≥/.test(before) && /φορτώνει/.test(before), before);
    S.hold.relay = false; S.heldRelay.splice(0).forEach(fn => fn()); await settle(page, S); await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ hd: (document.querySelector('#content .wi4 .wi4-q-hd') || {}).innerText || '', st: WINTL.relay.state, n: Object.keys(WINTL.relay.byOrder || {}).length }));
    ok(scn, 'relays answer ok and EMPTY after the first paint → the header loses «≥» and «φορτώνει…»', after.st === 'ok' && after.n === 0 && !/≥/.test(after.hd) && !/φορτώνει/.test(after.hd), after);
    ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
  scn = 'late.nlPopover';
  {
    const { page, S } = await openBoard(browser, origin, { hold: { nl: true } });
    ok(scn, 'E007\'s popover is open while the national read is pending', await openPopover(page, 'recWiE007'));
    await setPopoverTruck(page, await rowOf(page, 'recWiE007'), 'recWiT016', 'TST-1016');   // the user is typing in it
    S.hold.nl = false; S.held.splice(0).forEach(fn => fn()); await settle(page, S); await page.waitForTimeout(800);
    const mid = await page.evaluate(([js]) => { const p = document.getElementById('wi-popover'); const v = p && document.getElementById('wsd-v-tk_p_' + p.dataset.rowId);
      const row = eval(js)('recWiE014'); return { pop: !!p && getComputedStyle(p).display !== 'none' && !!p.innerHTML.trim(), typed: v ? v.value : null,
        tile: row ? ((row.querySelector('.wi4-c-fl .wi4-tile') || {}).className || '') : '', nl: WINTL.data.nlState }; }, [ROW_JS]);
    ok(scn, 'the national read landed with the popover open: the popover and what was typed stay; the board waits', mid.nl === 'ok' && mid.pop && mid.typed === 'recWiT016' && /unk/.test(mid.tile), mid);
    const named0 = await reasonsNamed(page);
    ok(scn, 'meanwhile header and rows agree (no national count without its tile)', named0.bad.length === 0, named0.bad);
    await page.evaluate(() => _wiClosePopover()); await page.waitForTimeout(1800);
    const after = await page.evaluate(([js]) => { const row = eval(js)('recWiE014'); return row ? ((row.querySelector('.wi4-c-fl .wi4-tile') || {}).className || '') : ''; }, [ROW_JS]);
    ok(scn, 'once the popover closes the board repaints with the carriers', /own/.test(after), after);
    ok(scn, 'nothing written; no page errors', !writes(S).length && !S.pageErrors.length, { w: writes(S), e: S.pageErrors });
    await page.context().close();
  }
}

// Offline, atPatch QUEUES the change and echoes the body: not a write. The
// assignment and the match say so — no ✓, no «γράφτηκε», no downstream sync —
// as the date panel already did (P3 review 11/10).
async function scnOffline(browser, origin) {
  let scn = 'offline.assign';
  {
    const { page, S } = await openBoard(browser, origin);
    ok(scn, 'E007\'s popover opens', await openPopover(page, 'recWiE007'));
    await setPopoverTruck(page, await rowOf(page, 'recWiE007'), 'recWiT016', 'TST-1016');
    await page.evaluate(() => { window.__ev.length = 0; });
    await page.context().setOffline(true);
    S.log = [];
    await page.locator('#wi-popover [onclick*="_wiSaveFromPopover"]').first().click(); await confirmIfAsked(page, 800);
    const st = await syncSettled(page, 'recWiE007', 20000);
    const r = await page.evaluate(() => (WINTL._syncLog || {}).recWiE007 || null);
    const ev = await evs(page);
    const ticks = ev.filter(e => e.k === 'toast' && /✓/.test(String(e.a[0]))).map(e => String(e.a[0]));
    ok(scn, 'logged «Χωρίς σύνδεση — … μπήκε σε αναμονή, δεν είναι ακόμη στη βάση», never «η ανάθεση γράφτηκε»', st === 'err' && !!r && /Χωρίς σύνδεση/.test(r.msg), r);
    ok(scn, 'no ✓ toast, no downstream sync, zero PATCHes at the facade (queued only)', !ticks.length && !ev.some(e => e.k === 'sync') && !patches(S).length, { ticks, p: patches(S) });
    await page.context().setOffline(false);
    await page.context().close();
  }
  scn = 'offline.match';
  {
    const { page, S } = await openBoard(browser, origin);
    await page.evaluate(() => { window.__ev.length = 0; });
    const r6 = await rowOf(page, 'recWiE006');
    await page.context().setOffline(true);
    S.log = [];
    await htmlDrag(page, '#wi-imp-recWiI004', `#wi-ci-${r6}`);
    const st = await syncSettled(page, 'recWiE006', 30000);
    const r = await page.evaluate(() => (WINTL._syncLog || {}).recWiE006 || null);
    const ev = await evs(page);
    ok(scn, 'the match is logged «Χωρίς σύνδεση — … μπήκε σε αναμονή», not «Αποθηκεύτηκε»', st === 'err' && !!r && /Χωρίς σύνδεση/.test(r.msg), r);
    ok(scn, 'no downstream sync for it, zero PATCHes at the facade', !ev.some(e => e.k === 'sync') && !patches(S).length, patches(S));
    await page.context().setOffline(false);
    await page.context().close();
  }
}

// One failed save is ONE message (review 11/10): the follow-up PATCHes of a
// group are quiet like its first — a 500 on the 2nd member of three stacked
// «Σφάλμα server — δοκιμάστε ξανά» toasts on each retry.
async function scnQuiet(browser, origin) {
  const scn = 'quiet';
  const { page, S } = await openBoard(browser, origin);
  const rg = await rowOf(page, 'recWiE011');
  ok(scn, 'the groupage row\'s popover opens', await openPopover(page, 'recWiE011'));
  await setPopoverTruck(page, rg, 'recWiT016', 'TST-1016');
  await page.evaluate(() => { window.__ev.length = 0; });
  S.fail.patch.recWiE012 = 500; S.log = [];
  await page.locator('#wi-popover [onclick*="_wiSaveFromPopover"]').first().click(); await confirmIfAsked(page);
  const st = await syncSettled(page, 'recWiE011', 20000);
  await page.waitForTimeout(400);
  const ev = await evs(page);
  const loud = ev.filter(e => e.k === 'errtoast' || e.k === 'reportError' || (e.k === 'toast' && /Σφάλμα|Save failed|απέτυχε/.test(String(e.a[0])))).map(e => e.k + ': ' + String(e.a[0]));
  const r = await page.evaluate(() => ({ msgs: [...document.querySelectorAll('#content .wi4 [data-msg]')].map(m => m.textContent) }));
  ok(scn, 'the 2nd member of a 3-member groupage fails (500): the save is logged failed on the group', st === 'err', st);
  ok(scn, 'ONE message — the line under the row, «1 από 3» — and no stacked toast («Σφάλμα server», «Save failed»)', r.msgs.length === 1 && /1 από 3/.test(r.msgs[0]) && !loud.length, { msgs: r.msgs, loud });
  ok(scn, 'the table: E011 and E013 written, E012 not', patches(S, 'recWiE011').some(x => x.status === 200) && patches(S, 'recWiE013').some(x => x.status === 200) && patches(S, 'recWiE012').every(x => x.status === 500),
    S.log.filter(x => x.k === 'patch').map(x => [x.id, x.status]));
  // Once the table is read again, the line says what LANDED — 2 of 3 — never
  // «έμεινε όπως ήταν» (review 11/10, P2: the words came from the screen).
  const reads0 = S.mainReads;
  await page.evaluate(() => { if (typeof _wiClosePopover === 'function') _wiClosePopover(); });
  const t0 = Date.now(); while (S.mainReads === reads0 && Date.now() - t0 < 8000) await page.waitForTimeout(200);
  await settle(page, S, 800); await page.waitForTimeout(300);
  const after = await page.evaluate(() => [...document.querySelectorAll('#content .wi4 [data-msg]')].map(m => m.textContent));
  ok(scn, 'after the re-read: «γράφτηκε σε 2 από 3 · έλεγξε», from the table', S.mainReads > reads0 && after.length === 1 && /γράφτηκε σε 2 από 3/.test(after[0]) && !/έμεινε όπως ήταν/.test(after[0]), { reads: S.mainReads - reads0, after });
  await page.context().close();
}

// A VS order whose NATIONAL LOADS row the read did not return (the chain never
// created it, or failed) is not «χωρίς μεταφορέα» — there is nothing to assign
// on Weekly National (review 11/10, P2). Owner 11/10 21:20: it is INFORMATION
// on Weekly Intl — the tile says «δεν υπάρχει εθνικό» and opens the order, but
// it is no reason: no data-r, never red, no queue item. The same week also
// takes E014's national carrier away: its ΠΡΟΣ leg loaded 5/10 (yesterday),
// which the old rule drew as a RED «ΠΡΟΣ ΑΝΑΘΕΣΗ» with a red NAT_NO_CARRIER.
async function scnNatMissing(browser, origin) {
  const scn = 'natmissing';
  const { page, S } = await openBoard(browser, origin, { mutate: db => {
    db[T.NAT_LOADS] = db[T.NAT_LOADS].filter(n => n.id !== 'recWiN002');
    delete db[T.NAT_LOADS].find(n => n.id === 'recWiN001').fields.Truck;
  } });
  const r = await page.evaluate(([js]) => { const row = eval(js)('recWiI005'); const t = row && row.querySelector('.wi4-c-fr .wi4-tile');
    if (t) t.setAttribute('data-rig-natmiss', '1');
    return { tile: t ? t.textContent : '', r: t ? t.getAttribute('data-r') : null, cls: t ? t.className : '', bg: t ? getComputedStyle(t).backgroundColor : '',
      q: WIV2.queueItems().filter(q => q.key === 'recWiI005' || q.rowKey === 'recWiI005').map(q => [q.code, q.level, q.act]) }; }, [ROW_JS]);
  ok(scn, 'I005\'s national tile says «δεν υπάρχει εθνικό», never «ΠΡΟΣ ΑΝΑΘΕΣΗ»; no data-r, not red (amber info chip)', r.tile === 'δεν υπάρχει εθνικό' && r.r === null && r.cls === 'wi4-tile un' && r.bg === 'rgb(255, 247, 237)', r);
  ok(scn, 'zero queue items for I005', !r.q.length, r.q);
  const e14 = await page.evaluate(([js, codes]) => { const row = eval(js)('recWiE014'); const t = row && row.querySelector('.wi4-c-fl .wi4-tile');
    const cs = t && getComputedStyle(t);
    return { tile: t ? t.textContent : '', cls: t ? t.className : '', r: t ? t.getAttribute('data-r') : null, bg: cs ? cs.backgroundColor : '', bs: cs ? cs.borderTopStyle : '',
      red: document.querySelectorAll('#content .wi4 .wi4-tile.red, #content .wi4 .wi4-natdot.red').length,
      q: WIV2.queueItems().filter(q => codes.includes(q.code)).map(q => [q.code, q.key]) }; }, [ROW_JS, NAT_CODES]);
  ok(scn, 'E014\'s ΠΡΟΣ leg without carrier, loaded yesterday: the amber dashed «ΠΡΟΣ ΑΝΑΘΕΣΗ» chip, no data-r — no red national tile or dot anywhere',
    e14.tile === 'ΠΡΟΣ ΑΝΑΘΕΣΗ' && e14.cls === 'wi4-tile un' && e14.r === null && e14.bg === 'rgb(255, 247, 237)' && e14.bs === 'dashed' && e14.red === 0, e14);
  ok(scn, 'no national code in the queue', !e14.q.length, e14.q);
  await shot(page, 'natmissing');
  const named = await reasonsNamed(page);
  ok(scn, 'counted = named per day', named.bad.length === 0, named);
  await page.click('[data-rig-natmiss="1"]'); await page.waitForTimeout(500);
  const opened = await page.evaluate(() => !!(document.querySelector('#modalOverlay.open') || document.querySelector('.mf-overlay')));
  ok(scn, 'a click on «δεν υπάρχει εθνικό» opens the order (saving it re-runs the Veroia Switch chain)', opened);
  ok(scn, 'nothing written; no page errors', !writes(S).length && !S.pageErrors.length, { w: writes(S), e: S.pageErrors });
  await page.context().close();
}

// §e #20: 1440 is not designed yet (Φ8, the owner's Figma) — but nothing on it
// may be cut without its title, overlap, or break the 32px rows.

async function scnW1440(browser, origin) {
  const scn = 'w1440';
  const { page, S } = await openBoard(browser, origin, { viewport: { width: 1440, height: 900 } });
  await shot(page, 'paint-1440');
  const r = await page.evaluate(([js]) => eval(js)('#content .wi4'), [SCAN_JS]);
  ok(scn, 'overflow scan at 1440: every overflowing text has its full text in a title', r.n === 1 && !r.over.length, r.over.slice(0, 15));
  ok(scn, 'contrast scan at 1440: text ≥ 4.5:1', r.n === 1 && !r.low.length, r.low.slice(0, 15));
  const g = await page.evaluate(() => { const t = document.getElementById('wi4-tabs').getBoundingClientRect(), a = document.querySelector('.wi4-bar-r').getBoundingClientRect();
    const rows = [...document.querySelectorAll('#content .wi4 .wi4-row')].map(e => Math.round(e.getBoundingClientRect().height));
    return { overlap: t.right > a.left + 1, rowsOk: rows.every(h => h === 32), n: rows.length }; });
  ok(scn, 'week tabs clear of the actions; rows still 32px', !g.overlap && g.rowsOk && g.n > 10, g);
  // Parity r1 (legs-national): at 1440 «→ ΑΠΟΘΗΚΗ» stays inside its
  // delivery column (it read «Phi Warehouse→ ΑΠΟΘΗΚΗ») and nothing spills
  // out of the pallets track. The VS warning («! ¢ 9/10 ·.. 8/10» at 1440) is
  // gone with DATE_MISMATCH (owner 11/10 21:20): none may be drawn.
  const lg = await page.evaluate(() => {
    const R = e => e.getBoundingClientRect(), vis = e => e.getClientRects().length > 0;
    const lots = [...document.querySelectorAll('#content .wi4 #wi-rows .wi-b-lot')].filter(vis);
    const lotOut = lots.filter(b => { const to = b.closest('.wi4-l-to'); return !to || R(b).left < R(to).left - 0.5 || R(b).right > R(to).right + 0.5; }).map(b => b.textContent);
    const palOver = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-l-pal')].filter(vis)
      .flatMap(p => [...p.children].filter(c => R(c).left < R(p).left - 0.5 || R(c).right > R(p).right + 0.5).map(c => c.className || c.tagName));
    return { lots: lots.length, lotOut, palOver, warns: document.querySelectorAll('#content .wi4 .wi4-l2w').length };
  });
  ok(scn, 'at 1440 every «→ ΑΠΟΘΗΚΗ» lies inside its delivery column; nothing in the pallets track overflows it', lg.lots >= 1 && !lg.lotOut.length && !lg.palOver.length, lg);
  ok(scn, 'no .wi4-l2w (VS date warning) on the board', lg.warns === 0, lg);
  // The reused popover places itself for a 380px form; its real form is
  // taller. Opened from a row near the window's bottom it ran past the edge,
  // its Save out of reach (review 11/10): v4 lifts it back inside.
  const low = await page.evaluate(() => { const rows = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-row')].filter(r => r.querySelector('.wi4-box'));
    const r = rows.find(x => { const b = x.getBoundingClientRect(); return b.top > innerHeight - 140 && b.bottom < innerHeight - 4; }) || rows.find(x => x.getBoundingClientRect().bottom < innerHeight - 4 && x.getBoundingClientRect().top > innerHeight / 2);
    if (!r) return null; r.querySelector('.wi4-box').setAttribute('data-rig-low', '1'); return Math.round(r.getBoundingClientRect().top); });
  if (low != null) {
    await page.locator('[data-rig-low="1"]').click(); await page.waitForTimeout(500);
    const pb = await page.evaluate(() => { const p = document.getElementById('wi-popover'); if (!p || getComputedStyle(p).display === 'none') return null;
      const b = p.getBoundingClientRect(), s = p.querySelector('.wi-pop-save'); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: innerHeight, save: s ? Math.round(s.getBoundingClientRect().bottom) : null }; });
    ok(scn, 'a popover opened from a low row stays inside the window, its Save in reach', !!pb && pb.top >= 11 && pb.bottom <= pb.h - 11 && pb.save != null && pb.save <= pb.h, { low, pb });
    await page.evaluate(() => { if (typeof _wiClosePopover === 'function') _wiClosePopover(); });
  } else ok(scn, 'a row near the bottom of the window to open the popover from', false, 'none found');
  // Parity r2 (row-cells). Relay sub-rows on the fixture's week: each status
  // whole, the first «άλλο φορτηγό …» whole (it hid everything after
  // «άλλο φορτηγ…» at 1440).
  const rf = await relayFit(page);
  ok(scn, '1440: both fixture relays — statuses whole and inside the row, the first «άλλο φορτηγό …» whole',
    rf.length === 2 && rf.every(x => x.flex && x.st.every(s => s.whole) && x.diff.length >= 1 && /^άλλο φορτηγό /.test(x.diff[0].t) && x.diff[0].whole) && rf.some(x => x.st.length), rf);
  // «→ ΑΠΟΘΗΚΗ» ≤1600 is a 22px icon chip (lot-badge-eats-name-1440): the
  // warehouse name keeps ≥56px (rules 985:1117), the chip stays in its column.
  const pc = () => page.evaluate(() => {
    const R = e => e.getBoundingClientRect(), vis = e => e.getClientRects().length > 0;
    const lots = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-pt .wi4-l1f > .wi-b-lot')].filter(vis).map(b => {
      const nm = b.parentElement.querySelector(':scope > .wi4-ell'), to = b.closest('.wi4-l-to'), cs = getComputedStyle(b);
      return { name: nm ? Math.round(R(nm).width * 10) / 10 : 0, w: Math.round(R(b).width), fs: cs.fontSize, inCol: !!to && R(b).left >= R(to).left - 0.5 && R(b).right <= R(to).right + 0.5,
        bg: cs.backgroundColor, bd: cs.borderTopColor, r: cs.borderTopLeftRadius, h: Math.round(R(b).height), title: !!b.title };
    });
    // The paperclip 4px after PE, in grey-2 (pallets-track-clip-gap, Figma 1097:2878).
    const clips = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-l-pal')].filter(vis).map(p => {
      const pe = p.querySelector('.wi4-pe'), sv = p.querySelector('.wi4-att svg'); if (!pe || !sv) return null;
      return { dx: Math.round((R(sv).left - R(pe).right) * 10) / 10, c: getComputedStyle(sv).color, w: Math.round(R(sv).width) };
    }).filter(Boolean);
    // A single stop with a country reads «City, CC» (Figma 1097:2663 / 2668).
    // scnPaint's «Berlin DE» check took Figma's multi-stop line («Kecskemét
    // HU 6π») for the single-stop rule; with this rule it reads «Berlin, DE».
    const places = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-pts')].filter(p => vis(p) && p.querySelectorAll(':scope > .wi4-pt').length === 1 && !p.querySelector('.wi4-more, .wi4-pt-n'))
      .map(p => (p.querySelector('.wi4-pt-pl') || {}).textContent || '').filter(t => /\S [A-Z]{2}$/.test(t) || /, [A-Z]{2}$/.test(t));
    return { lots, clips, places };
  });
  const p14 = await pc();
  ok(scn, '1440: every lot point\'s warehouse name ≥56px; the badge a 22px chip inside its delivery column, its title kept', p14.lots.length >= 1 && p14.lots.every(l => l.name >= 56 && l.w === 22 && l.inCol && l.title), p14.lots);
  ok(scn, 'the lot badge is PE\'s family: white fill, the #e2e8f0 line, radius 3, 17px', p14.lots.every(l => l.bg === 'rgb(255, 255, 255)' && l.bd === 'rgb(226, 232, 240)' && l.r === '3px' && l.h === 17), p14.lots);
  ok(scn, '1440: the paperclip sits 4±1px after PE, rgb(91, 107, 127), 12px', p14.clips.length >= 1 && p14.clips.every(c => Math.abs(c.dx - 4) <= 1 && c.c === 'rgb(91, 107, 127)' && c.w === 12), p14.clips);
  ok(scn, 'single-stop place lines with a country read «City, CC»', p14.places.length >= 3 && p14.places.every(t => /, [A-Z]{2}$/.test(t)), p14.places);
  // 1920: the badge keeps its words (unchanged above 1600).
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(400);
  const p19 = await pc();
  ok(scn, '1920: «→ ΑΠΟΘΗΚΗ» keeps its words (10px), inside its column; the paperclip still 4±1px after PE',
    p19.lots.length >= 1 && p19.lots.every(l => l.fs === '10px' && l.w > 22 && l.inCol) && p19.clips.length >= 1 && p19.clips.every(c => Math.abs(c.dx - 4) <= 1), { lots: p19.lots, clips: p19.clips });
  ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  await page.context().close();
}

// Live parity (owner 11/10: «τσέκαρε την πραγματική οθόνη… μέχρι το αποτέλεσμα
// του Figma»). The owner's real screen (Chrome, 80% zoom on 1440×900 = 1800×800
// CSS px) showed what the earlier rounds never measured: the app's own top bar
// stacked over the board's bar, the collapsed sidebar without its icon rail,
// the chat button over the rows, plates without DM Mono. Figma 1097:2254:
// ONE 60px top bar (title · weeks · actions · bell · avatar), content from
// y = 60 + 12, a 64px rail with every page's icon.
async function scnParity(browser, origin) {
  const fontLink = /fonts\.googleapis\.com\/css2\?[^"']*family=DM\+Mono/.test(fs.readFileSync(path.join(TREE, 'app.html'), 'utf8'));
  ok('parity', 'app.html loads DM Mono (the plates\' face in Figma) with Syne and DM Sans', fontLink);
  for (const vp of [{ width: 1920, height: 1080 }, { width: 1800, height: 800 }, { width: 1440, height: 900 }]) {
    const scn = 'parity.' + vp.width;
    const { page, S } = await openBoard(browser, origin, { viewport: vp });
    await shot(page, 'parity-' + vp.width);
    const g = await page.evaluate(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) }; };
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && +getComputedStyle(el).opacity > 0.05;
      const bar = document.querySelector('.wi4-bar');
      const tb = document.querySelector('.topbar');
      const items = [...document.querySelectorAll('#sidebarNav .nav-item')];
      const shown = items.filter((a) => { const b = a.getBoundingClientRect(); const ic = a.querySelector('.nav-icon svg'); const g = a.closest('.nav-group-items'); const gb = g ? g.getBoundingClientRect() : b; const ib = ic ? ic.getBoundingClientRect() : null;
        return vis(a) && b.height > 0 && ib && ib.width > 0 && ib.left >= b.left - 0.5 && ib.right <= b.right + 0.5 && (!g || (+getComputedStyle(g).opacity > 0.05 && ib.top >= gb.top - 0.5 && ib.bottom <= gb.bottom + 0.5)); });
      const fab = document.getElementById('aic-toggle');
      const rows = [...document.querySelectorAll('#content .wi4 .wi4-row')].map((e) => e.getBoundingClientRect());
      const fb = fab && vis(fab) ? fab.getBoundingClientRect() : null;
      const hit = fb ? rows.filter((b) => b.bottom > fb.top && b.top < fb.bottom && b.right > fb.left && b.left < fb.right).length : 0;
      const q = document.querySelector('#content .wi4 .wi4-q');
      return { bar: r(bar), barInTopbar: !!(bar && tb && tb.contains(bar)), topbarShown: vis(tb) ? r(tb) : null,
        title: vis(document.getElementById('topbarTitle')), crumbs: vis(document.getElementById('topbarBreadcrumb')),
        bell: vis(document.querySelector('.notif-bell')) ? r(document.querySelector('.notif-bell')) : null, avatar: vis(document.getElementById('userAvatar')) ? r(document.getElementById('userAvatar')) : null,
        name: vis(document.getElementById('userName')), logout: vis(document.querySelector('.btn-logout')),
        q: r(q), items: items.length, shown: shown.length, navDbg: items.map((a) => [a.id, Math.round(a.getBoundingClientRect().y), Math.round(a.getBoundingClientRect().height), (a.querySelector('.nav-icon') || {}).innerHTML ? a.querySelector('.nav-icon').innerHTML.length : 0, getComputedStyle(a.closest('.nav-group-items') || a).maxHeight]), fabHitsRows: hit, fab: fb ? r(fab) : null };
    });
    ok(scn, 'ONE top bar: the board\'s bar sits at y=0 in the app\'s top bar (Figma Top bar 1097:2283)', g.barInTopbar && g.bar && g.bar.y <= 1 && !g.title && !g.crumbs, g);
    // r2/topbar-switcher-off-centre: Figma 1097:2287 centres the switcher
    // between the title's left edge and the avatar's right edge (the bell and
    // the avatar are inside Actions 1097:2309); live it sat 41px left at 1920.
    // At 1440 the actions win the room (max-content) — no centring claimed,
    // only that nothing of the bar covers the bell or the avatar.
    const cg = await page.evaluate(() => {
      const R = (el) => el && el.getBoundingClientRect();
      const t = R(document.querySelector('.wi4-top .wi4-title')), tabs = R(document.getElementById('wi4-tabs')), av = R(document.getElementById('userAvatar'));
      const bell = document.querySelector('.topbar .notif-bell'), chip = document.querySelector('.topbar .user-chip'), bb = R(bell);
      const hits = (a, b) => a.right > b.left + 0.5 && a.left < b.right - 0.5 && a.bottom > b.top + 0.5 && a.top < b.bottom - 0.5;
      const rBoxes = [document.querySelector('.wi4-top .wi4-bar-r'), ...document.querySelectorAll('.wi4-top .wi4-bar-r *')].filter((e) => e.getClientRects().length).map(R);
      const at = (b) => document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { mid: (t.left + av.right) / 2, tabs: (tabs.left + tabs.right) / 2, title: Math.round(t.left), avatarR: Math.round(av.right),
        cover: rBoxes.filter((b) => hits(b, bb) || hits(b, av)).length, bellHit: !!bell && bell.contains(at(bb)), avatarHit: !!chip && chip.contains(at(av)) };
    });
    if (vp.width !== 1440) ok(scn, 'the week tabs are centred between the title\'s left edge and the avatar\'s right edge (±3px, Figma 1097:2287)', Math.abs(cg.tabs - cg.mid) <= 3, cg);
    ok(scn, 'no box of the bar\'s actions covers the bell or the avatar; both answer a click at their centre', cg.cover === 0 && cg.bellHit && cg.avatarHit, cg);
    // r2/topbar-current-week-dot (Figma 1097:2298): a 5×5 #027BBD disc 5px
    // after «W41», named «τρέχουσα»; r2/topbar-sync-token-type (1115:2700):
    // DM Sans 12, a 13px icon, «Ενημερώθηκε πριν…» spaced as ONE text.
    const tk = await page.evaluate(() => {
      const d = document.querySelector('.wi4-top .wi4-tab.on .wi4-tab-cur'), b = d && d.getBoundingClientRect(), cs = d && getComputedStyle(d);
      const tab = d && d.parentElement, tn = tab && [...tab.childNodes].find((n) => n.nodeType === 3 && /W\d/.test(n.textContent));
      const rg = tn && document.createRange(); if (rg) rg.selectNodeContents(tn);
      const u = document.getElementById('wi4-upd'), l = u && u.querySelector('.wi4-upd-l'), nx = l && l.nextElementSibling, sv = u && u.querySelector('svg');
      return { dot: d ? { w: b.width, h: b.height, round: cs.borderTopLeftRadius, bg: cs.backgroundColor, role: d.getAttribute('role'), name: d.getAttribute('aria-label'), gap: rg ? Math.round((b.left - rg.getBoundingClientRect().right) * 10) / 10 : null } : null,
        upd: u ? { fs: getComputedStyle(u).fontSize, icon: sv ? Math.round(sv.getBoundingClientRect().width) : 0, wordGap: l && nx && l.getClientRects().length ? Math.round((nx.getBoundingClientRect().left - l.getBoundingClientRect().right) * 10) / 10 : null } : null };
    });
    ok(scn, 'the current week\'s tab holds a 5×5 round rgb(2, 123, 189) dot named «τρέχουσα», 5px after the week (Figma 1097:2298)', !!tk.dot && tk.dot.w === 5 && tk.dot.h === 5 && tk.dot.round === '50%' && tk.dot.bg === 'rgb(2, 123, 189)' && tk.dot.role === 'img' && tk.dot.name === 'τρέχουσα' && tk.dot.gap !== null && Math.abs(tk.dot.gap - 5) <= 0.6, tk.dot);
    // ≤1600 «Ενημερώθηκε» gives way (wordGap null): the type is still checked.
    ok(scn, 'sync token: 12px with a 13px refresh icon; «Ενημερώθηκε» and the time a word space apart, not the 5px gap (Figma 1115:2700)', !!tk.upd && tk.upd.fs === '12px' && tk.upd.icon === 13 && (vp.width <= 1600 ? tk.upd.wordGap === null : tk.upd.wordGap !== null && tk.upd.wordGap >= 2 && tk.upd.wordGap <= 4.5), tk.upd);
    ok(scn, 'the top bar is 60px and ends with the bell and the avatar', g.topbarShown && Math.abs(g.topbarShown.h - 60) <= 1 && g.bell && g.avatar && g.avatar.x > g.bell.x, g);
    ok(scn, 'the queue starts 8px under the bar (sheet 15 A 1115:2706: band y = 60 + 8)', g.q && Math.abs(g.q.y - 68) <= 2, { q: g.q });
    ok(scn, 'the collapsed sidebar is an icon rail: every page\'s icon visible', g.items > 0 && g.shown === g.items, { items: g.items, shown: g.shown, nav: g.navDbg });
    ok(scn, 'the chat button covers no row of the board', g.fabHitsRows === 0, { fab: g.fab, hits: g.fabHitsRows });
    // The parked chat button has its own slot: the rail's scroll area ends
    // above it, so no icon is ever under it, at any scroll (live 11/10).
    const rail = await page.evaluate(() => {
      const nav = document.getElementById('sidebarNav'), fab = document.getElementById('aic-toggle');
      if (!nav || !fab) return { ok: false, why: 'nav or chat button missing' };
      const scroller = nav.closest('.sidebar-nav') || nav, n = scroller.getBoundingClientRect(), f = fab.getBoundingClientRect();
      return { ok: n.bottom <= f.top + 0.5, navBottom: Math.round(n.bottom), fabTop: Math.round(f.top) };
    });
    ok(scn, 'the rail\'s scroll area ends above the parked chat button', rail.ok, rail);
    // Owner 12/10 («όπως το Wels», Figma points sheet): every number of a
    // multi-stop cell is a dark box with a white digit, ≥4.5:1, 14px tall,
    // radius 3; a single stop has no number. Read from computed style, in
    // the row and in each kind of «+N» fold (a groupage's tiles reuse
    // .wi4-pt-n; any other cell's fold lists the stops as .wk3-stopn).
    const bx = await page.evaluate(() => {
      const rgb = (s) => (String(s).match(/[\d.]+/g) || []).map(Number);
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const vis = (e) => e.getClientRects().length > 0;
      const look = (n) => { const s = getComputedStyle(n), b = n.getBoundingClientRect(), bg = rgb(s.backgroundColor), fg = rgb(s.color), L1 = lum(fg), L2 = lum(bg);
        return { t: n.textContent, bg: s.backgroundColor, fg: s.color, h: Math.round(b.height * 10) / 10, w: Math.round(b.width * 10) / 10, r: s.borderTopLeftRadius,
          cr: Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 10) / 10, solid: bg.length < 4 || bg[3] === 1, tab: s.fontVariantNumeric, al: s.textAlign }; };
      const cells = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-pts')].filter(vis);
      const multi = cells.filter((p) => p.querySelectorAll(':scope > .wi4-pt').length > 1 || p.querySelector(':scope > .wi4-more'));
      const single = cells.filter((p) => !multi.includes(p));
      const shown = multi.flatMap((p) => [...p.querySelectorAll(':scope > .wi4-pt')]);
      const out = { multi: multi.length, single: single.length, unnumbered: shown.filter((t) => !t.querySelector(':scope > .wi4-pt-n')).length,
        singleNumbered: single.filter((p) => p.querySelector('.wi4-pt-n')).length, row: shown.map((t) => t.querySelector(':scope > .wi4-pt-n')).filter(Boolean).map(look) };
      // One fold of each kind, opened the way a click opens it, then closed.
      const fold = (grp) => { const btn = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-pts > .wi4-more')].filter(vis)
          .find((b) => { const f = b.closest('.wi4-l-from, .wi4-l-to').querySelector('.wk3-xfold'); return f && f.classList.contains('wi4-fold') === grp; });
        if (!btn) return null; btn.click(); const f = btn.closest('.wi4-l-from, .wi4-l-to').querySelector('.wk3-xfold.open');
        const r = f ? [...f.querySelectorAll(grp ? '.wi4-pt-n' : '.wk3-stopn')].map(look) : [];
        document.querySelectorAll('#content .wi4 .wk3-xfold.open').forEach((x) => x.classList.remove('open')); return r; };
      out.foldGroup = fold(true); out.foldStops = fold(false);
      return out;
    });
    const dark = (b) => b.bg === 'rgb(11, 25, 41)' && b.solid && b.fg === 'rgb(255, 255, 255)' && b.cr >= 4.5 && b.h === 14 && b.w >= 14 && b.r === '3px' && b.tab === 'tabular-nums' && b.al === 'center';
    ok(scn, 'multi-stop cells: every shown point carries a number, each a 14px rgb(11, 25, 41) box with a white tabular digit (≥4.5:1, radius 3); no single stop is numbered',
      bx.multi >= 3 && bx.single >= 3 && bx.unnumbered === 0 && bx.singleNumbered === 0 && bx.row.length >= 6 && bx.row.every(dark),
      { multi: bx.multi, single: bx.single, unnumbered: bx.unnumbered, singleNumbered: bx.singleNumbered, bad: bx.row.filter((b) => !dark(b)).slice(0, 5) });
    // The fixture's 9-stop export folds at every width; the groupage of
    // three folds only once its column is narrow (1440, scnPaint).
    ok(scn, '«+N» fold: its numbers are the same dark boxes' + (vp.width === 1440 ? ' (a groupage\'s tiles and a plain cell\'s list)' : ''),
      !!bx.foldStops && bx.foldStops.length >= 2 && bx.foldStops.every(dark) && (vp.width !== 1440 || (!!bx.foldGroup && bx.foldGroup.length >= 1)) && (!bx.foldGroup || bx.foldGroup.every(dark)),
      { foldStops: bx.foldStops, foldGroup: bx.foldGroup });
    // Review 11/10 (P1): .wi4-cols sticks at minus the scroller's top padding;
    // with the padding at 12px and the offset left at -32px the header slid
    // 20px out of view on any scroll. No other scenario scrolls the board.
    await page.evaluate(() => { document.getElementById('content').scrollTop = 700; });
    await page.waitForTimeout(150);
    const st = await page.evaluate(() => { const sc = document.getElementById('content'), c = sc.getBoundingClientRect(), h = document.querySelector('#content .wi4 .wi4-cols').getBoundingClientRect();
      return { scrolled: sc.scrollTop, cTop: Math.round(c.top), hTop: Math.round(h.top), hBot: Math.round(h.bottom) }; });
    ok(scn, 'scrolled, the column header stays whole at the board\'s top edge', st.scrolled > 100 && Math.abs(st.hTop - st.cTop) <= 1 && st.hBot - st.hTop >= 31, st);
    // Figma 1097:3856 «Scrolled shadow»: under the header only once scrolled.
    const shAt = () => page.evaluate(() => +getComputedStyle(document.querySelector('#content .wi4 .wi4-cols'), '::after').opacity);
    const sh700 = await shAt();
    await page.evaluate(() => { document.getElementById('content').scrollTop = 0; });
    await page.waitForTimeout(150);
    const sh0 = await shAt();
    ok(scn, 'the column header\'s shadow shows when scrolled (opacity > .5) and not at the top (< .1)', sh700 > 0.5 && sh0 < 0.1, { sh700, sh0 });
    await page.evaluate(() => { document.getElementById('content').scrollTop = 700; });
    await page.waitForTimeout(150);
    if (vp.width === 1920) {
      // Owner 11/10 (decision 2), Figma 1097:2254 / sheet 15 A: the board on
      // the grey page, only the day cards white; bands 8px apart, no rules.
      // Measured unscrolled; the scrolled checks below scroll back to 700.
      await page.evaluate(() => { document.getElementById('content').scrollTop = 0; });
      await page.waitForTimeout(150);
      const fr = await page.evaluate(() => {
        const cs = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e) : null; };
        const y = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().y) : null; };
        const cards = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-day-body')].filter(b => b.getClientRects().length).map(b => { const s = getComputedStyle(b); return [s.backgroundColor, s.borderLeftWidth, s.borderLeftStyle, s.borderTopLeftRadius].join('|'); });
        const day = [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-day')];
        const open = day.filter(d => d.querySelector('.wi4-day-body') && !d.classList.contains('closed'));
        const gaps = open.slice(0, -1).map(d => { const nx = d.nextElementSibling; const nb = nx && !nx.classList.contains('closed') && nx.querySelector('.wi4-day-body');
          return nb ? Math.round(nb.getBoundingClientRect().top - d.querySelector('.wi4-day-body').getBoundingClientRect().bottom) : null; }).filter(v => v != null);
        const first = day[0], fb = first && first.querySelector('.wi4-day-body'), cols = document.querySelector('#content .wi4 .wi4-cols').getBoundingClientRect();
        const nm = first && first.querySelector('.wi4-dayn'), ch = first && first.querySelector('.wi4-chev');
        const today = document.querySelector('#content .wi4 .wi4-day.today .wi4-day-body');
        const dn = cs('#content .wi4 .wi4-dayn'), dd = cs('#content .wi4 .wi4-dayd');
        return { wi4: cs('#content .wi4').backgroundColor, content: cs('#content').backgroundColor, cards: [...new Set(cards)],
          rules: ['.wi4-q', '.wi4-shelf', '.wi4-cols'].map(c => (cs('#content .wi4 ' + c) || {}).borderBottomWidth), shelf: y('#content .wi4 .wi4-shelf'), cols: Math.round(cols.y),
          firstCard: fb ? Math.round(fb.getBoundingClientRect().top - cols.top) : null, gaps: [...new Set(gaps)],
          chevX: ch && fb ? Math.round(ch.getBoundingClientRect().left - fb.getBoundingClientRect().left) : null, nameX: nm && fb ? Math.round(nm.getBoundingClientRect().left - fb.getBoundingClientRect().left) : null,
          todayTop: today ? [getComputedStyle(today).borderTopWidth, getComputedStyle(today).borderTopColor] : null,
          todaySide: today ? [getComputedStyle(today).borderLeftWidth, getComputedStyle(today).borderLeftColor, getComputedStyle(today).borderBottomColor] : null,
          // Chrome snaps a border width down to whole device pixels in the computed value: 1.5px reads «1px» at DPR 1.
          todaySnap: Math.floor(1.5 * devicePixelRatio) / devicePixelRatio + 'px',
          todayRule: (() => { for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch (_) { continue; }
            for (const r of rs) if (r.selectorText === '.wi4-day.today .wi4-day-body') return r.style.borderTop; } return null; })(),
          dayn: dn ? [dn.fontFamily, dn.letterSpacing] : null, dayd: dd ? dd.fontFamily : null };
      });
      // Parity r2: radius 8 (Figma Surface 1097:2462 / 2645 / 3592).
      ok(scn, 'grey page: .wi4 transparent, #content rgb(244, 246, 249); every day card white, 1px border, 8px radius', fr.wi4 === 'rgba(0, 0, 0, 0)' && fr.content === 'rgb(244, 246, 249)'
        && fr.cards.length === 1 && fr.cards[0] === 'rgb(255, 255, 255)|1px|solid|8px', fr);
      ok(scn, 'no full-width rules under the queue, the stock strip or the column header', fr.rules.every(w => w === '0px'), fr.rules);
      ok(scn, 'bands 8px apart (sheet 15 A): stock strip y 110±2, column header y 146±2', Math.abs(fr.shelf - 110) <= 2 && Math.abs(fr.cols - 146) <= 2, { shelf: fr.shelf, cols: fr.cols });
      // Figma 1097:2448: column header 24 + gap 8 + name 16 + 6 = the first card
      // 54px under the header's top; card → card 36px (name 16 between).
      ok(scn, 'day rhythm: first card 54±2px under the column header, open cards 36±1px apart', Math.abs(fr.firstCard - 54) <= 2 && fr.gaps.length > 0 && fr.gaps.every(v => Math.abs(v - 36) <= 1), { firstCard: fr.firstCard, gaps: fr.gaps });
      ok(scn, 'day header: chevron at x4, name at x26 (Figma 1097:2640); Syne tracking .8 + DM Sans date (1097:2642)', fr.chevX === 4 && fr.nameX === 26 && fr.dayn && /Syne/.test(fr.dayn[0]) && fr.dayn[1] === '0.8px' && /DM Sans/.test(fr.dayd || ''), fr);
      // Parity r2 (Figma 1097:3592): 1.5px accent at 55% on top (as the browser snaps it to device pixels), no side /
      // bottom line (1px transparent keeps the tracks).
      ok(scn, 'today\'s card: 1.5px (device-snapped) rgba(2, 123, 189, 0.55) on top; sides and bottom transparent, sides still 1px', !!fr.todayTop && fr.todayTop[0] === fr.todaySnap && /^1\.5px solid/.test(fr.todayRule || '')
        && fr.todayTop[1] === 'rgba(2, 123, 189, 0.55)' && !!fr.todaySide && fr.todaySide.join() === '1px,rgba(0, 0, 0, 0),rgba(0, 0, 0, 0)', { top: fr.todayTop, snap: fr.todaySnap, rule: fr.todayRule, side: fr.todaySide });
      // Rails on a card's first/last row follow the card's curve (Figma 1097:2648).
      const rc = await page.evaluate(() => [...document.querySelectorAll('#content .wi4 #wi-rows .wi4-day-body')].flatMap(b => {
        const out = [], f = b.firstElementChild, l = b.lastElementChild, rail = (e) => e && /wi4-r-(red|amb)/.test(e.className);
        const st = (e) => { const s = getComputedStyle(e, '::before'); return [s.width, s.borderLeftWidth, s.borderLeftStyle, s.borderLeftColor, /wi4-r-red/.test(e.className) ? 'red' : 'amb']; };
        if (rail(f)) out.push(['first', getComputedStyle(f, '::before').borderTopLeftRadius, ...st(f)]);
        if (rail(l)) out.push(['last', getComputedStyle(l, '::before').borderBottomLeftRadius, ...st(l)]);
        return out; }));
      // Parity r2: the card's 7px inner curve (8 − 1px border) on an 8px box, so the radius is not scaled down;
      // the stripe itself is still 3px (red solid / amber dashed).
      ok(scn, 'a rail on a card\'s first/last row is rounded 7px with the card (8px box); the stripe still 3px rgb(185, 28, 28) / dashed amber', rc.length > 0
        && rc.every(x => x[1] === '7px' && x[2] === '8px' && x[3] === '3px' && (x[6] === 'red' ? x[4] === 'solid' && x[5] === 'rgb(185, 28, 28)' : x[4] === 'dashed' && x[5] === 'rgb(180, 83, 9)')), rc);
      // Parity r2, column header and top bar: «ΑΝΑΘΕΣΗ · ΕΝΤΟΛΗ» 10px into its track (Figma 1097:2433), in line with
      // the pills; the Regular «· N φορτία…» keeps the header's .7px tracking (1097:2428); the Pre-order count
      // on #eaecf0 (1097:2313).
      const ch = await page.evaluate(() => {
        const asg = document.querySelector('#content .wi4 .wi4-cols .wi4-c-asg'), card = document.querySelector('#content .wi4 #wi-rows .wi4-day-body');
        const rg = asg && document.createRange(); if (rg) rg.selectNodeContents(asg);
        const n = [...document.querySelectorAll('#content .wi4 .wi4-cols .wi4-n')].map(e => getComputedStyle(e).letterSpacing);
        const pre = [...document.querySelectorAll('.wi4-bar .wi4-btn')].find(b => /Pre-order/.test(b.textContent)), cnt = pre && pre.querySelector('.wi4-cnt');
        return { asgX: rg && card ? Math.round(rg.getBoundingClientRect().left - card.getBoundingClientRect().left) : null, n, cnt: cnt ? getComputedStyle(cnt).backgroundColor : null };
      });
      ok(scn, 'column header: «ΑΝΑΘΕΣΗ · ΕΝΤΟΛΗ» text 828±2px from the card\'s left (Figma 1097:2433 px 10)', ch.asgX != null && Math.abs(ch.asgX - 828) <= 2, ch);
      ok(scn, 'column header: the Regular «· N φορτία…» spans keep tracking 0.7px (Figma 1097:2428 / 2439)', ch.n.length >= 2 && ch.n.every(v => v === '0.7px'), ch.n);
      ok(scn, 'top bar: the Pre-order count on #eaecf0 rgb(234, 236, 240) (Figma 1097:2313)', ch.cnt === 'rgb(234, 236, 240)', ch);
      await page.evaluate(() => { document.getElementById('content').scrollTop = 700; });
      await page.waitForTimeout(150);
      // Scrolled: the header sits right under the bar. The bar's menus must
      // open OVER it (review 11/10, P2: same z-index, DOM order lost).
      await page.click('.wi4-top .wk-more-t');
      const vs = await page.evaluate(() => { const m = document.getElementById('wi4-view'); if (!m || m.hidden) return { open: false }; const it = m.querySelector('button, [role="menuitem"], a') || m; const b = it.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { open: true, onTop: !!top && m.contains(top) }; });
      await page.mouse.click(900, 600);
      await page.click('.topbar .notif-bell');
      // The panel shows once its list is read (_toggleNotifPanel → _refreshNotifs).
      await page.waitForFunction(() => getComputedStyle(document.getElementById('notifPanel')).display !== 'none', null, { timeout: 4000 }).catch(() => {});
      const np = await page.evaluate(() => { const p = document.getElementById('notifPanel'); if (!p || getComputedStyle(p).display === 'none') return { open: false }; const b = p.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, Math.min(b.bottom - 2, b.top + 16)); return { open: true, onTop: !!top && p.contains(top) }; });
      await page.evaluate(() => { if (typeof _toggleNotifPanel === 'function' && getComputedStyle(document.getElementById('notifPanel')).display !== 'none') _toggleNotifPanel(); });
      ok(scn, 'scrolled: «Προβολή ▾» and the bell\'s panel open over the sticky header', vs.open && vs.onTop && np.open && np.onTop, { vs, np });
      await page.evaluate(() => { document.getElementById('content').scrollTop = 0; });
      // Keyboard, the «Προβολή ▾» model (r2/topbar-avatar-menu-keyboard): Enter
      // on the chip opens the menu ON its first item, ↓/Home/End stay on the
      // items, Esc closes it, gives the chip back and leaves the board's
      // search alone; Enter on «Αποσύνδεση» signs out (review 11/10, P2: the
      // chip's key handler once cancelled it); Tab out closes it.
      await page.evaluate(() => { window.__lo = 0; window.logout = () => { window.__lo++; }; });
      await page.fill('#wi4-search', 'Alpha');
      const km = () => page.evaluate(() => { const m = document.querySelector('.topbar .wi4-umenu'), c = document.querySelector('.topbar .user-chip'), a = document.activeElement;
        return { open: !!m && !m.hidden, exp: c.getAttribute('aria-expanded'), item: !!m && a && a.getAttribute('role') === 'menuitem' && m.contains(a), onChip: a === c, inChip: c.contains(a), week: WINTL.week, q: document.getElementById('wi4-search').value }; });
      await page.focus('.topbar .user-chip'); await page.keyboard.press('Enter');
      const kOpen = await km();
      await page.keyboard.press('ArrowDown'); const kDown = await km();
      await page.keyboard.press('End'); await page.keyboard.press('Home'); const kHome = await km();
      await page.keyboard.press('Escape');
      const kEsc = await km();
      await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
      const lo = await page.evaluate(() => window.__lo);
      const kLo = await km();
      await page.focus('.topbar .user-chip'); await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
      const kTab = await km();
      // …and with the chip focused, «/» still reaches the board (search).
      await page.focus('.topbar .user-chip'); await page.keyboard.press('/');
      const slash = await page.evaluate(() => document.activeElement && document.activeElement.id === 'wi4-search');
      ok(scn, 'keyboard: Enter opens the avatar menu on its first item, ↓/End/Home stay on the items, Esc closes it onto the chip (search kept), Enter on the item signs out, Tab out closes it',
        kOpen.open && kOpen.exp === 'true' && kOpen.item && kDown.open && kDown.item && kHome.open && kHome.item && kDown.week === kOpen.week
        && !kEsc.open && kEsc.exp === 'false' && kEsc.onChip && kEsc.q === 'Alpha' && lo === 1 && !kLo.open && !kTab.open && !kTab.inChip && slash, { kOpen, kDown, kHome, kEsc, lo, kLo, kTab, slash });
      await page.fill('#wi4-search', '');
      await page.mouse.click(900, 600);
      // A read that fails while v4 stays active: the error card must not sit
      // under the previous week's bar (review 11/10, P2) — the app's title and
      // Sign out show; the next good paint mounts the bar again.
      const rr = await page.evaluate(async () => {
        const orig = window.atGetAll; window.atGetAll = () => Promise.reject(new Error('rig: the read fails'));
        try { WINTL.week += 1; await renderWeeklyIntl(); } catch (_) {}
        await new Promise((r) => setTimeout(r, 400));
        const res = { root: !!document.querySelector('#content .wi4'), slot: !!document.getElementById('wi4-top'), topOn: document.body.classList.contains('wi4-top-on'),
          title: getComputedStyle(document.getElementById('topbarTitle')).display !== 'none', logout: getComputedStyle(document.querySelector('.btn-logout')).display !== 'none' };
        window.atGetAll = orig; WINTL.week -= 1;
        try { await renderWeeklyIntl(); } catch (_) {}
        await new Promise((r) => setTimeout(r, 400));
        res.back = !!document.getElementById('wi4-top') && document.body.classList.contains('wi4-top-on') && !!document.querySelector('#content .wi4');
        return res;
      });
      ok(scn, 'a failed read: no board bar over the error card, the app\'s title and Sign out instead; the next paint brings the bar back', !rr.root && !rr.slot && !rr.topOn && rr.title && rr.logout && rr.back, rr);
      // Avatar menu: name and role from the chip, one «Αποσύνδεση»; any click
      // elsewhere closes it. «Προβολή ▾» opens ABOVE the board, not under it.
      await page.click('.topbar .user-chip');
      const um = await page.evaluate(() => { const m = document.querySelector('.topbar .wi4-umenu'), mb = m && m.getBoundingClientRect(), av = document.getElementById('userAvatar').getBoundingClientRect();
        return { open: !!m && !m.hidden, text: m ? m.innerText : '', btn: !!m && /Αποσύνδεση/.test(m.innerText), right: mb ? Math.round(mb.right * 10) / 10 : null, avatarR: Math.round(av.right * 10) / 10 }; });
      await page.mouse.click(900, 600);
      const closed = await page.evaluate(() => { const m = document.querySelector('.topbar .wi4-umenu'); return !m || m.hidden; });
      ok(scn, 'the avatar opens name · role · «Αποσύνδεση»; a click elsewhere closes it', um.open && um.btn && /Rig/.test(um.text) && closed, { um, closed });
      // Figma ends the bar with the avatar at R−20 (1097:2324): the menu's
      // right edge is the avatar's, not the 44px chip's 8px further out.
      ok(scn, 'the avatar menu\'s right edge is the avatar\'s right edge (±1px)', um.right !== null && Math.abs(um.right - um.avatarR) <= 1, um);
      await page.click('.wi4-top .wk-more-t');
      const vm = await page.evaluate(() => { const m = document.getElementById('wi4-view'); if (!m || m.hidden) return { open: false }; const b = m.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height - 2, 40)); return { open: true, onTop: !!top && m.contains(top), b: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }; });
      ok(scn, '«Προβολή ▾» opens above the board', vm.open && vm.onTop, vm);
      await page.mouse.click(900, 600);
      // Leaving the page gives the app its own title back and takes the bar out.
      await page.evaluate(() => navigate('dashboard'));
      await page.waitForTimeout(400);
      const left = await page.evaluate(() => ({ slot: !!document.getElementById('wi4-top'), on: document.body.classList.contains('wi4-on'), title: getComputedStyle(document.getElementById('topbarTitle')).display !== 'none', menu: !!document.querySelector('.wi4-umenu'), chipRole: document.querySelector('.topbar .user-chip').getAttribute('role') }));
      ok(scn, 'leaving the page: no board bar in the app\'s top bar, the page title back, no avatar menu', !left.slot && !left.on && left.title && !left.menu && !left.chipRole, left);
    }
    ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
    await page.context().close();
  }
}

// ═══ WP-A — one Veroia day (Weekly National v4 plan §3.6, §6.2) ═══════════
// One VS import of its own, added to the week by `mutate`: delivery Fri 9/10,
// Veroia day Wed 7/10 — TWO days before the delivery, where the ±1 estimate
// would say Thu 8/10 (the assignment bug's case); two drops whose national
// order is the REVERSE of the international one (the national dispatcher's
// drag); Pallet Exchange ON; one Planned Ramp line per Veroia stop. The fake
// answers the cross-dock only as «VS CD Date» and runs the base after
// 069_hub_day_once (opts.vs). Invented names only.
const VS = { O: 'recWiVA01', NL: 'recWiVN01', L: 'recWiVS01', U1: 'recWiVS02', U2: 'recWiVS03', CD: 'recWiVS04',
  H: 'recWiVS11', N1: 'recWiVS12', N2: 'recWiVS13', R1: 'recWiVR01', R2: 'recWiVR02', HUB: 'recJucKOhC1zh4IP3' };
function vsWorld(db) {
  const add = (tid, id, fields) => (db[tid] || (db[tid] = [])).push({ id, fields });
  add(T.LOCATIONS, VS.HUB, { Name: 'Hub Test', City: 'Veria', Country: 'GR' });
  add(T.ORDERS, VS.O, { Type: 'International', Direction: 'Import', Status: 'Assigned', Client: ['recWiC001'], Reference: 'REF-VA01', 'Order No': 9901,
    'Total Pallets': 20, 'Temperature °C': 2, Goods: 'TEST GOODS', Price: 1200, 'Refrigerator Mode': 'Continuous', 'Pallet Type': 'EUR', 'Loading DateTime': '2026-10-05T05:00:00.000Z', 'Delivery DateTime': '2026-10-09T07:00:00.000Z',
    'Loading Location 1': ['recWiL003'], 'Unloading Location 1': ['recWiL004'], 'Unloading Location 2': ['recWiL005'],
    Truck: ['recWiT019'], Driver: ['recWiD019'], Trailer: ['recWiR019'], 'Veroia Switch': true, 'VS CD Date': '2026-10-07', 'Pallet Exchange': true,
    'ORDER STOPS': [VS.L, VS.U1, VS.U2, VS.CD] });
  add(T.ORDER_STOPS, VS.L, { 'Parent Order': [VS.O], 'Stop Type': 'Loading', 'Stop Number': 1, Location: ['recWiL003'], Pallets: 20, DateTime: '2026-10-05T05:00:00.000Z' });
  add(T.ORDER_STOPS, VS.U1, { 'Parent Order': [VS.O], 'Stop Type': 'Unloading', 'Stop Number': 1, Location: ['recWiL004'], Pallets: 12, DateTime: '2026-10-09T07:00:00.000Z' });
  add(T.ORDER_STOPS, VS.U2, { 'Parent Order': [VS.O], 'Stop Type': 'Unloading', 'Stop Number': 2, Location: ['recWiL005'], Pallets: 8, DateTime: '2026-10-09T07:00:00.000Z' });
  add(T.ORDER_STOPS, VS.CD, { 'Parent Order': [VS.O], 'Stop Type': 'Cross-dock', 'Stop Number': 1, Location: [VS.HUB], Pallets: 20, DateTime: '2026-10-07' });
  add(T.NAT_LOADS, VS.NL, { Name: 'ΠΕΛΑΤΗΣ Α — 2026-10-07', Direction: 'North→South', 'Source Type': 'Direct', 'Source Order': [VS.O], Status: 'Pending',
    'Loading DateTime': '2026-10-07T12:00:00.000Z', 'Delivery DateTime': '2026-10-09T12:00:00.000Z', 'Pallet Exchange': true, 'Total Pallets': 20,
    'Pickup Location 1': [VS.HUB], 'Delivery Location 1': ['recWiL005'], 'Delivery Location 2': ['recWiL004'] });
  add(T.ORDER_STOPS, VS.H, { 'Parent Nat Load': [VS.NL], 'Stop Type': 'Loading', 'Stop Number': 1, Location: [VS.HUB], Pallets: 20, DateTime: '2026-10-07' });
  add(T.ORDER_STOPS, VS.N1, { 'Parent Nat Load': [VS.NL], 'Stop Type': 'Unloading', 'Stop Number': 1, Location: ['recWiL005'], Pallets: 8, DateTime: '2026-10-09' });
  add(T.ORDER_STOPS, VS.N2, { 'Parent Nat Load': [VS.NL], 'Stop Type': 'Unloading', 'Stop Number': 2, Location: ['recWiL004'], Pallets: 12, DateTime: '2026-10-09' });
  add(RAMP_T, VS.R1, { 'Plan Date': '2026-10-07', Type: 'Φόρτωση', Status: 'Planned', Notes: 'STOP:' + VS.H });
  add(RAMP_T, VS.R2, { 'Plan Date': '2026-10-07', Type: 'Παραλαβή', Status: 'Planned', Notes: 'STOP:' + VS.CD });
}
const vsRow = (S, tid, id) => ((S.db[tid] || []).find(r => r.id === id) || { fields: {} }).fields;
const vsNlPatches = (S, from) => S.log.slice(from).filter(x => x.k === 'patch' && x.tid === T.NAT_LOADS && x.id === VS.NL && !x.batch);
// The national load's drops as the table holds them, in stop order.
const vsDrops = S => (S.db[T.ORDER_STOPS] || []).filter(s => link(s.fields['Parent Nat Load']) === VS.NL && s.fields['Stop Type'] === 'Unloading')
  .sort((a, b) => a.fields['Stop Number'] - b.fields['Stop Number']).map(s => [link(s.fields.Location), s.fields.Pallets, dayOf(s.fields.DateTime)]);
async function vsOpenForm(page) {
  await page.evaluate(id => { const r = [...(WINTL.data.imports || []), ...(WINTL.data.exports || [])].find(x => x.id === id); openIntlEditWith(id, r.fields); }, VS.O);
  await page.waitForSelector('#btnSubmit', { timeout: 15000 });
  await page.waitForTimeout(400);
}
async function vsSubmit(page, S) {
  const t0 = await page.evaluate(() => window.__ev.length);
  await page.evaluate(id => { window.__p = submitIntlOrder(id); }, VS.O);
  await page.evaluate(() => Promise.resolve(window.__p).catch(() => {}));
  await settle(page, S, 1500);
  return page.evaluate(n => window.__ev.slice(n), t0);
}
const vsSaid = (evs, re) => evs.some(e => (e.k === 'toast' || e.k === 'errtoast' || e.k === 'reportError') && re.test(String(e.a[0])));
const vsLogged = (evs, re) => evs.some(e => e.k === 'logError' && re.test(JSON.stringify(e.a)));
async function scnVs(browser, origin) {
  let scn = 'vs.assign';
  const { page, S } = await openBoard(browser, origin, { vs: true, mutate: vsWorld });
  {
    // A truck change on the Weekly International: the national day STAYS (7/10, not the
    // ±1 estimate 8/10), the order is read ONCE, inside _syncVeroiaSwitch, and the
    // national drop order (the dispatcher's) is kept.
    const ok0 = await openPopover(page, VS.O);
    ok(scn, 'the VS import opens its assignment popover', ok0);
    const rid = await rowOf(page, VS.O);
    const g0 = S.gets.length, l0 = S.log.length;
    await setPopoverTruck(page, rid, 'recWiT015', 'TST-1015');
    await page.evaluate(id => { window.__p = _wiSaveFromPopover(id); }, rid); await confirmIfAsked(page);
    await waitP(page, scn, 'assignment save'); await settle(page, S, 1500);
    const gets = S.gets.slice(g0).filter(g => g.tid === T.ORDERS);
    ok(scn, 'the truck change reached the table', link(vsRow(S, T.ORDERS, VS.O).Truck) === 'recWiT015', vsRow(S, T.ORDERS, VS.O).Truck);
    ok(scn, 'the order is read by id inside the sync — the old field-list read (no cross-dock) is gone',
      gets.some(g => g.rid === VS.O) && !gets.some(g => !g.rid && g.f.includes(VS.O) && g.fields.length), gets);
    const np = vsNlPatches(S, l0);
    ok(scn, 'one national PATCH, Veroia day 7/10 kept (the estimate would be 8/10)', np.length === 1 && athensDay(np[0].fields['Loading DateTime']) === '2026-10-07'
      && athensDay(vsRow(S, T.NAT_LOADS, VS.NL)['Loading DateTime']) === '2026-10-07', np.map(x => x.fields['Loading DateTime']));
    ok(scn, 'Pallet Exchange travels with the assignment: the order\'s current value (true), never false by omission', np[0] && np[0].fields['Pallet Exchange'] === true, np[0] && np[0].fields);
    ok(scn, 'the national drop order is the national dispatcher\'s (L005 then L004), matched by place',
      np[0] && JSON.stringify([np[0].fields['Delivery Location 1'], np[0].fields['Delivery Location 2']]) === '[["recWiL005"],["recWiL004"]]', np[0] && np[0].fields);
    ok(scn, 'the drops keep their place, pallets and day (L005 8 · L004 12, both 9/10)', JSON.stringify(vsDrops(S)) === JSON.stringify([['recWiL005', 8, '2026-10-09'], ['recWiL004', 12, '2026-10-09']]), vsDrops(S));
    ok(scn, 'the national stops were read once, by the load, before they were written', S.gets.slice(g0).filter(g => g.tid === T.ORDER_STOPS && g.f.includes('FIND("' + VS.NL + '",ARRAYJOIN({Parent Nat Load}')).length === 1, S.gets.slice(g0).filter(g => g.tid === T.ORDER_STOPS).map(g => g.f));
    ok(scn, 'the Veroia stop and the Ramp stay on 7/10', dayOf(vsRow(S, T.ORDER_STOPS, VS.H).DateTime) === '2026-10-07' && vsRow(S, RAMP_T, VS.R1)['Plan Date'] === '2026-10-07');
  }
  scn = 'vs.form';
  {
    // A save of the international form WITHOUT a date change: no 'Cross-dock Date' in
    // the order's PATCH, the Cross-dock stop goes without DateTime, the day stays.
    await vsOpenForm(page);
    const l0 = S.log.length;
    const ev = await vsSubmit(page, S);
    const op = S.log.slice(l0).filter(x => x.k === 'patch' && x.tid === T.ORDERS && x.id === VS.O && x.fields && 'Direction' in x.fields);
    ok(scn, 'the form saved the order', op.length === 1 && op[0].status === 200, op.map(x => x.status));
    ok(scn, 'no cross-dock in the order\'s PATCH (it already has one)', op[0] && !('Cross-dock Date' in op[0].fields) && !('VS CD Date' in op[0].fields), op[0] && Object.keys(op[0].fields));
    const cdw = S.log.slice(l0).filter(x => x.k === 'patch' && x.id === VS.CD);
    ok(scn, 'the Cross-dock stop is written WITHOUT DateTime', cdw.length >= 1 && cdw.every(x => !('DateTime' in x.fields)), cdw.map(x => x.fields));
    ok(scn, 'the Veroia day stays 7/10 everywhere (order, its stop, national load, Veroia stop, Ramp)', vsRow(S, T.ORDERS, VS.O)['VS CD Date'] === '2026-10-07'
      && dayOf(vsRow(S, T.ORDER_STOPS, VS.CD).DateTime) === '2026-10-07' && athensDay(vsRow(S, T.NAT_LOADS, VS.NL)['Loading DateTime']) === '2026-10-07'
      && dayOf(vsRow(S, T.ORDER_STOPS, VS.H).DateTime) === '2026-10-07' && vsRow(S, RAMP_T, VS.R2)['Plan Date'] === '2026-10-07');
    ok(scn, 'the form says «Το εθνικό φορτίο συγχρονίστηκε ✓» after a sync that went through', vsSaid(ev, /Το εθνικό φορτίο συγχρονίστηκε ✓/), ev.filter(e => /toast/i.test(e.k)).map(e => e.a[0]));
    ok(scn, 'the national drop order survives a form save', JSON.stringify(vsDrops(S).map(d => d[0])) === '["recWiL005","recWiL004"]', vsDrops(S));
    ok(scn, 'the base never holds «Cross-dock Date» (the Worker answers only «VS CD Date»)', !(S.db[T.ORDERS] || []).some(r => 'Cross-dock Date' in r.fields));

    // Delivery +1 (both drops): the base moves the cross-dock by the same Δ, ONCE (7 → 8),
    // the stop, the national load, its Veroia stop and both Ramp lines follow — no copy.
    scn = 'vs.form.delivery';
    await vsOpenForm(page);
    const moved = await page.evaluate(() => [1, 2].map(i => { const el = document.getElementById('dt_u_' + i); if (!el || !el.value) return null;
      const v = el.value; const d = new Date(Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10) + 1)).toISOString().slice(0, 10);
      el.value = d + v.slice(10); el.dispatchEvent(new Event('change', { bubbles: true })); return [v, el.value]; }));
    ok(scn, 'both delivery dates moved one day in the form', moved.every(Boolean), moved);
    const l1 = S.log.length;
    await vsSubmit(page, S);
    const op2 = S.log.slice(l1).filter(x => x.k === 'patch' && x.tid === T.ORDERS && x.id === VS.O && x.fields && 'Direction' in x.fields);
    ok(scn, 'still no cross-dock in the order\'s PATCH', op2[0] && !('Cross-dock Date' in op2[0].fields) && !('VS CD Date' in op2[0].fields), op2[0] && op2[0].fields);
    const trig = S.log.slice(l1).filter(x => x.k === 'trigger' && x.name === '028 cross-dock');
    ok(scn, 'the cross-dock moved ONCE (7/10 → 8/10)', trig.length === 1 && vsRow(S, T.ORDERS, VS.O)['VS CD Date'] === '2026-10-08', [trig, vsRow(S, T.ORDERS, VS.O)['VS CD Date']]);
    ok(scn, 'its Cross-dock stop, the national load, its Veroia stop and both Ramp lines on 8/10, no second line',
      dayOf(vsRow(S, T.ORDER_STOPS, VS.CD).DateTime) === '2026-10-08' && athensDay(vsRow(S, T.NAT_LOADS, VS.NL)['Loading DateTime']) === '2026-10-08'
      && dayOf(vsRow(S, T.ORDER_STOPS, VS.H).DateTime) === '2026-10-08' && vsRow(S, RAMP_T, VS.R1)['Plan Date'] === '2026-10-08'
      && vsRow(S, RAMP_T, VS.R2)['Plan Date'] === '2026-10-08' && !(S.db[RAMP_T] || []).some(x => x.fields._deleted),
      { cdStop: vsRow(S, T.ORDER_STOPS, VS.CD).DateTime, nl: vsRow(S, T.NAT_LOADS, VS.NL)['Loading DateTime'], h: vsRow(S, T.ORDER_STOPS, VS.H).DateTime, r1: vsRow(S, RAMP_T, VS.R1), r2: vsRow(S, RAMP_T, VS.R2) });
    ok(scn, 'the drops keep the national order, each with its own pallets, on the new day', JSON.stringify(vsDrops(S)) === JSON.stringify([['recWiL005', 8, '2026-10-10'], ['recWiL004', 12, '2026-10-10']]), vsDrops(S));
  }
  scn = 'vs.pe';
  {
    // Pallet Exchange follows the order: OFF then ON from the form, OFF from the VS chain
    // stage, and NULL (absent from the answer — facade trap 2) → false. Each national PATCH
    // carries the order's value AT THAT MOMENT; the Weekly National reads it from the load.
    const pe = async (val) => { await vsOpenForm(page); await page.evaluate(v => { const r = document.querySelector(`input[name="f_PalletExch"][value="${v}"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } return !!r; }, val);
      const l = S.log.length; await vsSubmit(page, S); return vsNlPatches(S, l); };
    let np = await pe('no');
    ok(scn, 'form: PE OFF → the national PATCH carries false, the load holds false', np.length === 1 && np[0].fields['Pallet Exchange'] === false && vsRow(S, T.NAT_LOADS, VS.NL)['Pallet Exchange'] !== true, np.map(x => x.fields['Pallet Exchange']));
    np = await pe('yes');
    ok(scn, 'form: PE ON → the national PATCH carries true', np.length === 1 && np[0].fields['Pallet Exchange'] === true && vsRow(S, T.NAT_LOADS, VS.NL)['Pallet Exchange'] === true, np.map(x => x.fields['Pallet Exchange']));
    let l = S.log.length;
    const r1 = await page.evaluate(async id => { await atPatch(TABLES.ORDERS, id, { 'Pallet Exchange': false }); return syncOrderDownstream(id, { source: 'intl', changedFields: ['Pallet Exchange'], skipPA: true }); }, VS.O);
    np = vsNlPatches(S, l);
    ok(scn, 'VS chain stage: PE OFF on the order → the national PATCH carries false', r1 && np.length === 1 && np[0].fields['Pallet Exchange'] === false, { r1, pe: np.map(x => x.fields['Pallet Exchange']) });
    // A date change from the Weekly International v4 panel (the chain): PE stays what the order says.
    l = S.log.length;
    const w = await page.evaluate(id => WI_INTERNAL.dateWrite(id, 'VS CD Date', '2026-10-08', '2026-10-07'), VS.O);
    np = vsNlPatches(S, l);
    ok(scn, 'a Veroia day change (v4 panel, VS chain): the national load follows (7/10) and carries the order\'s PE (false), never a default',
      w && w.ok && np.length === 1 && athensDay(np[0].fields['Loading DateTime']) === '2026-10-07' && np[0].fields['Pallet Exchange'] === false, { w: w && w.downstream, np: np.map(x => x.fields) });
    delete vsRow(S, T.ORDERS, VS.O)['Pallet Exchange'];   // NULL in the base = absent from the answer
    l = S.log.length;
    const r2 = await page.evaluate(id => syncOrderDownstream(id, { source: 'intl', changedFields: ['VS CD Date'], skipPA: true, skipGRP: true, skipRamp: true }), VS.O);
    np = vsNlPatches(S, l);
    ok(scn, 'PE NULL on the order (absent from the answer) → false on the national load, as today', r2 && r2.ok && np.length === 1 && np[0].fields['Pallet Exchange'] === false, { r2, np: np.map(x => x.fields['Pallet Exchange']) });
  }
  scn = 'vs.fail';
  {
    // The national stops write fails: the load's line moved, its Veroia stop did not — the
    // form must NOT say «συγχρονίστηκε ✓»; one app_errors line names it.
    S.fail.natStops = true;
    await vsOpenForm(page);
    const ev = await vsSubmit(page, S);
    ok(scn, 'stops write fails (form): no «συγχρονίστηκε ✓», the failure is said', !vsSaid(ev, /συγχρονίστηκε ✓/) && vsSaid(ev, /συγχρονισμός εθνικού φορτίου απέτυχε/), ev.filter(e => /toast|reportError/.test(e.k)).map(e => e.a[0]));
    ok(scn, 'stops write fails (form): one app_errors line from the form', vsLogged(ev, /orders_intl form: VS sync/), ev.filter(e => e.k === 'logError').map(e => e.a));
    const t0 = await page.evaluate(() => window.__ev.length);
    const st = await page.evaluate(id => syncOrderDownstream(id, { source: 'intl', changedFields: ['VS CD Date'], skipPA: true, skipGRP: true, skipRamp: true }), VS.O);
    let ev2 = await page.evaluate(n => window.__ev.slice(n), t0);
    ok(scn, 'stops write fails (VS chain stage): the stage is «failed» with an app_errors line, never «ok»', st && !st.ok && st.failed.includes('VS chain') && vsLogged(ev2, /order-sync\.VS chain/), { st, logs: ev2.filter(e => e.k === 'logError').map(e => e.a) });
    S.fail.natStops = false;
    // The national load's own PATCH fails (500 after the retries): failed + app_errors.
    S.fail.patch[VS.NL] = 500;
    const t1 = await page.evaluate(() => window.__ev.length);
    const st2 = await page.evaluate(id => syncOrderDownstream(id, { source: 'intl', changedFields: ['VS CD Date'], skipPA: true, skipGRP: true, skipRamp: true }), VS.O);
    ev2 = await page.evaluate(n => window.__ev.slice(n), t1);
    ok(scn, 'the national PATCH fails: the stage is «failed» with an app_errors line', st2 && !st2.ok && st2.failed.includes('VS chain') && vsLogged(ev2, /order-sync\.VS chain/), { st2 });
    delete S.fail.patch[VS.NL];
    ok(scn, 'no page errors', !S.pageErrors.length, S.pageErrors);
  }
  await page.context().close();
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
    const S = { paint: scnPaint, invariants: scnInvariants, relay: scnRelay, scans: scnScans, unknown: scnUnknown, drops: scnDrops, join: scnJoin, menu: scnMenu,
      date: scnDate, keys: scnKeys, search: scnSearch, savefail: scnSaveFail, presence: scnPresence, conflict: scnConflict, fallback: scnFallback, styles: scnStyles,
      twins: scnTwins, queue: scnQueue, unread: scnUnread,
      print: scnPrint, shift: scnShift, late: scnLate, offline: scnOffline, quiet: scnQuiet, natmissing: scnNatMissing, w1440: scnW1440, parity: scnParity,
      vs: scnVs };
    // A watchdog per scenario: one missing locator or one write that never
    // settles fails THAT scenario, closes its pages, and the run goes on.
    const WATCHDOG_MS = 360000;
    for (const [name, fn] of Object.entries(S)) {
      if (!on(name)) continue;
      let t = null;
      try {
        await Promise.race([fn(browser, origin), new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`watchdog: still running after ${WATCHDOG_MS / 1000} s`)), WATCHDOG_MS); })]);
      } catch (e) {
        ok(name, 'scenario ran to the end', false, String(e && e.stack || e).slice(0, 600));
        for (const c of browser.contexts()) await c.close().catch(() => {});
      } finally { clearTimeout(t); }
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
