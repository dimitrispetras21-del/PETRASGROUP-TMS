// Proof rig — TRIP PnL: GET /costs/lines stops at 300 rows (4/10/2026).
// Live, the owner's screen read «73 από 128 χωρίς καταχωρημένο κόστος» while
// the base had costs on 81 of the 128 RTs: the batch call returns the 300
// NEWEST lines (line_date desc) and the live Worker has no offset, so RTs whose
// lines are all older read «χωρίς κόστος». Two fixes, and the page must be
// right with EITHER Worker live, because the paging one deploys only after
// 057+060 and a rollback brings the old one back:
//   • OLD Worker (no next_offset in the answer): a full batch is re-read per
//     RT with ?rt_id=.
//   • NEW Worker (deploy/worker-local-relay 9fac16aa): ?offset= & ?limit=
//     (≤ 999), answer { records, next_offset } — the page follows
//     next_offset to null, asking ?limit=999.
// Every paging Worker here sits on a PostgREST that cuts each answer at
// db-max-rows = 1000, as the live one does (measured 4/10/2026: limit=1001
// returns 1000). Without that cap this rig passed 0142e44d + a front asking
// 1000: the Worker asked 1001 for its «more?» probe, got 1000, answered
// next_offset null with lines left — silent truncation (reviewer NO_GO).
// This rig serves facades that behave exactly like each Worker and OPENS the
// screen; expectations are written out by hand, not recomputed with the
// page's functions. Synthetic data only.
//
// Run from the MAIN repo root:
//   PW_BASE_URL=http://127.0.0.1:8788/.claude/worktrees/<wt>/ node .claude/worktrees/<wt>/tests/critics/pnl-lines-cap-proof.js
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const mkPnl = (id, hasCost, cost) => ({
  id, code: 'RT-' + id, scope: 'INTL', trip_type: 'OWNED', truck_id: 1, driver_id: null, partner_id: null,
  date_start: '2026-09-28', date_end: null, status: 'in_progress', total_km: null,
  revenue: 1000, revenue_intl: 1000, revenue_natl: 0, cost_net: hasCost ? cost : 0, cost_gross: hasCost ? cost : 0, cost_vat: 0,
  profit_worst: hasCost ? 1000 - cost : 1000, margin_worst_pct: hasCost ? (1000 - cost) / 10 : 100,
  dl_trip_value: null, dl_expenses: null, driver_pay_pending: false, driver_pay_missing: false,
});
const day = back => new Date(Date.UTC(2026, 8, 30) - back * 86400000).toISOString().slice(0, 10);

// ── Dataset A: 41 RTs in one planning week. RTs 1–40 carry 10 fuel lines each
// (400 lines): RTs 1–30 hold the 300 newest, RTs 31–40 only older ones. RT 41
// has NO line at all — the one truly without costs. Expected «1 από 41».
const A = { pnl: [], lines: [] };
for (let k = 1; k <= 41; k++) A.pnl.push(mkPnl(k, k < 41, 400));
for (let k = 1; k < 41; k++) for (let j = 0; j < 10; j++) A.lines.push({ id: k * 100 + j, rt_id: k, category: 'fuel', net: 40, vat: 0, line_date: day(k - 1) });

// ── Dataset B: the live shape of 4/10/2026 — 128 RTs, costs on 81, so the
// correct banner is «47 από 128». 2,600 lines: 170 unallocated (rt_id null,
// the newest) + 30 per costed RT, RT 1 newest … RT 81 oldest, 30 lines sharing
// each date (the id tiebreaker keeps pages disjoint). The old Worker's 300
// cover RTs 1–5 only; one 1000-page covers ~RT 28; the full read is 3 pages.
const B = { pnl: [], lines: [] };
for (let k = 1; k <= 128; k++) B.pnl.push(mkPnl(k, k <= 81, 1200));
for (let j = 0; j < 170; j++) B.lines.push({ id: 900000 + j, rt_id: null, category: 'fuel', net: 40, vat: 0, line_date: '2026-10-03' });
for (let k = 1; k <= 81; k++) for (let j = 0; j < 30; j++) B.lines.push({ id: k * 100 + j, rt_id: k, category: 'fuel', net: 40, vat: 0, line_date: day(k - 1) });

const byNewest = (a, b) => (a.line_date < b.line_date ? 1 : a.line_date > b.line_date ? -1 : b.id - a.id);
const LOOKUPS = { trucks: [{ id: 1, license_plate: 'ΤΕΣΤ-1001', active: true }], trailers: [], drivers: [], partners: [] };

// The OLD Worker (main / deploy/worker-0410): reads rt_id + alloc_status only,
// ignores everything else, order line_date.desc,id.desc, limit 300, {records}.
function oldWorker(ds, u) {
  const rid = u.searchParams.get('rt_id');
  return { status: 200, body: { records: ds.lines.filter(l => !rid || String(l.rt_id) === rid).sort(byNewest).slice(0, 300) } };
}
// The NEW Worker (9fac16aa): same filters + offset/limit as the contract says —
// bad value → 400, limit default 300 / max opts.cap (999; 1000 = the NO_GO
// 0142e44d), limit+1 probe, next_offset ALWAYS present. The probe goes to a
// PostgREST that returns at most opts.maxRows rows (1000 live; 999 models a
// Worker whose probe row is cut). opts.shiftFrom: from that offset on, the
// window is one row early (a line inserted between two calls) → the boundary
// row repeats.
function newWorker(ds, u, opts) {
  const q = u.searchParams, ro = q.get('offset'), rl = q.get('limit');
  const cap = opts.cap || 999, maxRows = opts.maxRows || 1000;
  if (ro && !/^\d+$/.test(ro)) return { status: 400, body: { error: 'Μη έγκυρο offset — θέλει ακέραιο από 0 και πάνω' } };
  if (rl && !(/^\d+$/.test(rl) && Number(rl) >= 1)) return { status: 400, body: { error: 'Μη έγκυρο limit' } };
  const offset = ro ? Number(ro) : 0, limit = rl ? Math.min(Number(rl), cap) : 300;
  const rid = q.get('rt_id');
  const all = ds.lines.filter(l => !rid || String(l.rt_id) === rid).sort(byNewest);
  const from = opts.shiftFrom != null && offset >= opts.shiftFrom ? offset - 1 : offset;
  let rows = all.slice(from, from + Math.min(limit + 1, maxRows));
  const next = rows.length > limit ? offset + limit : null;
  if (next !== null) rows = rows.slice(0, limit);
  const body = { records: rows, next_offset: next };
  if (opts.rollbackAt != null && offset >= opts.rollbackAt) delete body.next_offset;   // old Worker answers mid-read
  return { status: 200, body };
}

async function open(browser, ds, opts = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const S = { req: [], errors: [] };
  page.on('pageerror', e => S.errors.push(String(e)));
  page.on('dialog', d => d.accept());
  await preparePage(page, 'owner');
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const rts = ds.pnl.map(t => ({ id: t.id, ct_rt_legs: [{ order_id: 500 + t.id, direction: 'Export' }] }));
  await page.route(`**/${HOST}/**`, route => {
    const u = new URL(route.request().url()); const p = u.pathname;
    S.req.push(route.request().method() + ' ' + p + u.search);
    if (p.endsWith('/costs/pnl')) return json(route, { records: ds.pnl });
    if (p.endsWith('/costs/rt')) return json(route, { records: rts });
    if (p.endsWith('/costs/lookups')) return json(route, LOOKUPS);
    if (p.endsWith('/costs/pallet-gate')) return json(route, { records: [] });
    if (p.endsWith('/costs/lines')) {
      const rid = u.searchParams.get('rt_id');
      if (rid && opts.failRt === rid) return json(route, { error: 'boom' }, 500);
      if (opts.failOffset != null && u.searchParams.get('offset') === String(opts.failOffset)) return json(route, { error: 'boom' }, 500);
      const r = opts.worker === 'new' ? newWorker(ds, u, opts) : oldWorker(ds, u);
      return json(route, r.body, r.status);
    }
    return route.request().method() === 'GET' ? json(route, { records: [] }) : json(route, { ok: true });
  });
  await gotoPage(page, 'costs', BASE);
  await page.waitForSelector('.ct-stake .ct-stop .t', { timeout: 60000 });
  await page.waitForTimeout(500);
  return { page, S };
}
const title = page => page.$eval('.ct-stake .ct-stop .t', el => el.textContent.trim());
const eqq = page => page.$eval('.ct-stake .ct-eqq', el => el.textContent.trim()).catch(() => null);
const notes = page => page.$$eval('.ct-note', ns => ns.map(n => n.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
const linesReq = S => S.req.filter(r => r.startsWith('GET /costs/lines'));
const perRtIds = S => S.req.filter(r => /^GET \/costs\/lines\?rt_id=\d+$/.test(r)).map(r => r.split('=')[1]).sort((a, b) => a - b);
// what the page holds per RT — read from its state, compared with numbers written by hand
const heldCounts = page => page.evaluate(() => Object.fromEntries(Object.entries(_ct.linesByRt || {}).map(([k, v]) => [k, v.length])));
const UNKNOWN = 'Οι γραμμές κόστους δεν φόρτωσαν — άγνωστη πληρότητα';

(async () => {
  const browser = await chromium.launch();

  console.log('\n── OLD Worker · A: capped batch (300 of 400 lines) → re-read per RT');
  {
    const { page, S } = await open(browser, A);
    ok(S.req.includes('GET /costs/lines?limit=999'), 'one batch call GET /costs/lines?limit=999 (old Worker ignores limit → 300 = full)');
    const perRt = perRtIds(S);
    ok(perRt.length === 41 && perRt.join() === A.pnl.map(t => t.id).join(), `then one GET /costs/lines?rt_id= per RT on the page: ${perRt.length}/41`);
    ok(!S.req.some(r => /offset=/.test(r)), 'no offset request to a Worker that never offered one');
    ok(await title(page) === '1 από 41 δρομολόγια χωρίς καταχωρημένο κόστος', 'banner: «' + await title(page) + '» (only RT 41 has no line)');
    ok(await eqq(page) === '40/41', 'cost range next to «Κόστη»: 40/41');
    ok(!/300/.test(await notes(page)), 'no «300 lines» cap warning (old or new wording) — every RT was read in full');
    ok(!/ΔΕΝ φόρτωσαν/.test(await notes(page)), 'no «γραμμές κόστους ΔΕΝ φόρτωσαν» warning');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  console.log('\n── OLD Worker · A: one per-RT read fails → completeness UNKNOWN, never «χωρίς κόστος»');
  {
    const { page, S } = await open(browser, A, { failRt: '35' });
    const t = await title(page);
    ok(t === UNKNOWN, 'banner: «' + t + '»');
    ok(!/χωρίς καταχωρημένο κόστος/.test(t), 'no «N από M χωρίς καταχωρημένο κόστος» claim');
    ok(/ΔΕΝ φόρτωσαν/.test(await notes(page)), 'visible «γραμμές κόστους ΔΕΝ φόρτωσαν» note with «Ανανέωση»');
    ok(!/300/.test(await notes(page)), 'no contradicting «όριο 300 … ίσως ψευδώς χωρίς κόστη» banner next to «άγνωστη»');
    // grouped view (by truck): unknown completeness → no margins of a partial set
    await page.selectOption('#ctGroup', 'truck'); await page.waitForTimeout(400);
    const g = await page.$$eval('#ctList table.ct-tbl tbody tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent.trim())));
    ok(g.length === 1 && g[0][1] === '41' && g[0][4] === '—' && g[0][5] === '—', 'grouped by truck: all 41 RTs counted, Καθαρό and Περιθώριο «—»: ' + JSON.stringify(g));
    ok(!/ελλιπή κόστη ΔΕΝ μετρούν/.test(await page.$eval('#ctList', el => el.textContent)), 'grouped by truck: no «ελλιπή κόστη ΔΕΝ μετρούν» claim');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  console.log('\n── OLD Worker · B (live shape: 128 RTs, 2,600 lines) → «47 από 128» through 128 per-RT reads');
  {
    const { page, S } = await open(browser, B);
    ok(await title(page) === '47 από 128 δρομολόγια χωρίς καταχωρημένο κόστος', 'banner: «' + await title(page) + '»');
    ok(await eqq(page) === '81/128', 'cost range: «' + await eqq(page) + '» (expected 81/128)');
    ok(perRtIds(S).length === 128, `per-RT reads: ${perRtIds(S).length}/128`);
    const held = await heldCounts(page);
    ok(Object.keys(held).length === 81 && Object.values(held).every(n => n === 30), `held: 81 RTs × 30 lines (got ${Object.keys(held).length} RTs)`);
    ok(!/ΔΕΝ φόρτωσαν|300/.test(await notes(page)), 'no «ΔΕΝ φόρτωσαν» / «300» note');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  console.log('\n── NEW Worker · B → «47 από 128» in 3 paged calls, no per-RT reads');
  {
    const { page, S } = await open(browser, B, { worker: 'new' });
    ok(await title(page) === '47 από 128 δρομολόγια χωρίς καταχωρημένο κόστος', 'banner: «' + await title(page) + '»');
    ok(await eqq(page) === '81/128', 'cost range: «' + await eqq(page) + '» (expected 81/128)');
    const lr = linesReq(S);
    ok(JSON.stringify(lr) === JSON.stringify(['GET /costs/lines?limit=999', 'GET /costs/lines?limit=999&offset=999', 'GET /costs/lines?limit=999&offset=1998']),
      'lines calls = batch + offset 999 + offset 1998: ' + JSON.stringify(lr));
    ok(perRtIds(S).length === 0, 'no ?rt_id= fan-out');
    const held = await heldCounts(page);
    ok(Object.keys(held).length === 81 && Object.values(held).every(n => n === 30), `held: 81 RTs × 30 lines (got ${Object.keys(held).length} RTs)`);
    ok(!/ΔΕΝ φόρτωσαν|300/.test(await notes(page)), 'no «ΔΕΝ φόρτωσαν» / «300» note');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  console.log('\n── NEW Worker · A (400 lines) → «1 από 41» in ONE call (next_offset null)');
  {
    const { page, S } = await open(browser, A, { worker: 'new' });
    ok(await title(page) === '1 από 41 δρομολόγια χωρίς καταχωρημένο κόστος', 'banner: «' + await title(page) + '»');
    ok(JSON.stringify(linesReq(S)) === JSON.stringify(['GET /costs/lines?limit=999']), 'one lines call: ' + JSON.stringify(linesReq(S)));
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  console.log('\n── NEW Worker · B: page 2 fails → UNKNOWN, never «χωρίς κόστος» from the 1st page');
  {
    const { page, S } = await open(browser, B, { worker: 'new', failOffset: 999 });
    const t = await title(page);
    ok(t === UNKNOWN, 'banner: «' + t + '»');
    ok(/ΔΕΝ φόρτωσαν/.test(await notes(page)), 'visible «ΔΕΝ φόρτωσαν» note');
    ok(!linesReq(S).some(r => /offset=1998/.test(r)), 'stops at the failed page (no offset=1998 call)');
    ok(perRtIds(S).length === 0, 'no ?rt_id= fan-out on the paging Worker');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  console.log('\n── NEW Worker · B: rolled back mid-read (page 2 has no next_offset) → UNKNOWN');
  {
    const { page, S } = await open(browser, B, { worker: 'new', rollbackAt: 999 });
    const t = await title(page);
    ok(t === UNKNOWN, 'banner: «' + t + '» — a page without next_offset is not «the last page»');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  console.log('\n── NEW Worker · B: a line inserted between calls (boundary row repeats) → kept once');
  {
    const { page, S } = await open(browser, B, { worker: 'new', shiftFrom: 999 });
    ok(await title(page) === '47 από 128 δρομολόγια χωρίς καταχωρημένο κόστος', 'banner: «' + await title(page) + '»');
    const held = await heldCounts(page);
    const over = Object.entries(held).filter(([, n]) => n !== 30);
    ok(Object.keys(held).length === 81 && over.length === 0, 'held: 81 RTs × 30 lines — no RT holds a line twice' + (over.length ? ': ' + JSON.stringify(over) : ''));
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  console.log('\n── NO_GO Worker 0142e44d (cap 1000) on PostgREST max-rows 1000 · B → still «47 από 128»: the page asks 999, so the probe row fits');
  {
    const { page, S } = await open(browser, B, { worker: 'new', cap: 1000 });
    ok(await title(page) === '47 από 128 δρομολόγια χωρίς καταχωρημένο κόστος', 'banner: «' + await title(page) + '» (a front asking 1000 here reads 1000 lines, next_offset null, and claims ~100 χωρίς κόστος)');
    ok(JSON.stringify(linesReq(S)) === JSON.stringify(['GET /costs/lines?limit=999', 'GET /costs/lines?limit=999&offset=999', 'GET /costs/lines?limit=999&offset=1998']),
      'lines calls = 999 + 999 + rest: ' + JSON.stringify(linesReq(S)));
    const held = await heldCounts(page);
    ok(Object.keys(held).length === 81 && Object.values(held).every(n => n === 30), `held: 81 RTs × 30 lines (got ${Object.keys(held).length} RTs)`);
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  console.log('\n── Worker whose probe row is cut (max-rows 999) · B: a FULL page that says «last» → UNKNOWN, never a silent cut');
  {
    const { page, S } = await open(browser, B, { worker: 'new', maxRows: 999 });
    const t = await title(page);
    ok(t === UNKNOWN, 'banner: «' + t + '» — 999 records + next_offset null is not proof of «last»');
    ok(!/χωρίς καταχωρημένο κόστος/.test(t), 'no «N από 128 χωρίς καταχωρημένο κόστος» claim from the first 999 lines');
    ok(/ΔΕΝ φόρτωσαν/.test(await notes(page)), 'visible «ΔΕΝ φόρτωσαν» note with «Ανανέωση»');
    ok(JSON.stringify(linesReq(S)) === JSON.stringify(['GET /costs/lines?limit=999']), 'one lines call (the Worker said «last»): ' + JSON.stringify(linesReq(S)));
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  // ── Dataset C: 41 RTs, RTs 1–40 carry 25 lines each minus the tail, RT 41
  // none. 998 lines = a short page, trusted; 999 = a full page that says
  // «last» → UNKNOWN: the documented price of the guard above (rare: the
  // lines left must be exactly a full page; the next line or reload clears it).
  const mkC = total => {
    const C = { pnl: A.pnl, lines: [] };
    for (let k = 1; k < 41; k++) for (let j = 0; j < 25; j++) C.lines.push({ id: k * 100 + j, rt_id: k, category: 'fuel', net: 40, vat: 0, line_date: day(k - 1) });
    C.lines.length = total;
    return C;
  };
  console.log('\n── NEW Worker · C: 998 lines (short page) → «1 από 41» · 999 lines (full page, «last») → UNKNOWN');
  {
    const { page, S } = await open(browser, mkC(998), { worker: 'new' });
    ok(await title(page) === '1 από 41 δρομολόγια χωρίς καταχωρημένο κόστος', '998 lines: banner «' + await title(page) + '»');
    ok(JSON.stringify(linesReq(S)) === JSON.stringify(['GET /costs/lines?limit=999']), '998 lines: one call');
    await page.context().close();
  }
  {
    const { page, S } = await open(browser, mkC(999), { worker: 'new' });
    ok(await title(page) === UNKNOWN, '999 lines: banner «' + await title(page) + '» (loud, not a silent claim)');
    ok(S.errors.length === 0, 'no page errors: ' + S.errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
