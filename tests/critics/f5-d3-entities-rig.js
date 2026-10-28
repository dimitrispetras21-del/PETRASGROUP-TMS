// Proof rig — National v5 F5, stream (d3), Ε12 + Ε13, in the real app (fully stubbed backend, ids only).
// Plan: docs/superpowers/plans/2026-10-28-f5-national-v5-cutover.md §10 d3. Contract: GET /plan/activity
// (partner_id | driver_id | truck_id | trailer_id = N, location_id = N | all) + GET /plan/lookups.
//   AFTER (PlanConfig 'after'):
//     A. partner card «Αναθέσεις»: the v5 cycle is one more «NAT» row and counts (assignments, active, τζίρος)
//     B. driver card: a cycle the driver joined by a handover (2nd segment) is listed; an ended v5 cycle reads
//        «ολοκληρωμένο»
//     C. location card: v5 stop + a national shipment still to assign in the history, ΚΑΘΟΔΟΣ chip
//     D. location list, filter ΑΝΟΔΟΣ: a place with v5 stops only is in it
//     E. /plan/activity fails → each card keeps today's half and shows a visible line
//   BEFORE (PlanConfig 'before') and NONE (no PlanConfig — today's app.html — and a Worker without the routes):
//     the same text as PW_BASE_URL_TIP (origin/main served) on every screen above, and 0 /plan/activity calls in
//     BEFORE.
//   Every case: 0 console errors.
// Run from a checkout root that has node_modules (cwd = the main repo, see tests/critics/auth.js):
//   PW_BASE_URL=http://127.0.0.1:<port>/ PW_BASE_URL_TIP=http://127.0.0.1:<tip-port>/ node <worktree>/tests/critics/f5-d3-entities-rig.js
// NO-GO: PW_BASE_URL=<tip> → A–E fail. Exit 1 on any ✗.
const { chromium } = require('playwright');
const path = require('path');
const { preparePage, gotoPage } = require(path.resolve(__dirname, 'auth.js'));
const BASE = process.env.PW_BASE_URL || 'http://127.0.0.1:8788/';
const TIP = process.env.PW_BASE_URL_TIP || '';
const HOST = 'petras-tms-backend-staging.petrasgroup.workers.dev';
const T = { PARTNERS: 'tblLHl5m8bqONfhWv', PA: 'tblUhgqnmiam5MGNK', DRIVERS: 'tbl7UGmYhc2Y82pPs', LOC: 'tblxu8DRfTQOFRCzS',
  STOPS: 'tblaeY5QOHAS1gyE8', ORDERS: 'tblgHlNmLBH3JTdIM' };
const R = (id, fields) => ({ id, createdTime: '2026-01-01T00:00:00.000Z', fields });
const TABLE_ROWS = {
  [T.PARTNERS]: [R('recPa32', { 'Company Name': 'Partner 32', Active: true, Country: 'GR' })],
  [T.PA]: [R('recPA2', { Partner: ['recPa32'], Status: 'Assigned', 'Partner Rate': 50, 'Assignment Date': '2026-10-02' })],
  [T.DRIVERS]: [R('recDr7', { 'Full Name': 'Driver 7', Active: true })],
  [T.LOC]: [R('recLoc1', { Name: 'Loc 1', City: 'Veroia', Country: 'GR', Latitude: 40.5, Longitude: 22.2 }),
            R('recLoc2', { Name: 'Loc 2', City: 'Athens', Country: 'GR', Latitude: 37.9, Longitude: 23.7 })],
  [T.STOPS]: [R('recS1', { Location: ['recLoc1'], 'Parent Order': ['recO1'], 'Stop Type': 'Loading', DateTime: '2026-09-01T08:00:00', Pallets: 10 })],
  [T.ORDERS]: [R('recO1', { Direction: 'Export', Reference: 'O1' })],
};
const LOOKUPS = {
  locations: [{ id: 11, legacy_id: 'recLoc1', name: 'Loc 1', is_hub: false }, { id: 12, legacy_id: 'recLoc2', name: 'Loc 2', is_hub: false }],
  clients: [{ id: 21, legacy_id: 'recCl1', company_name: 'Client 21' }],
  trucks: [{ id: 3, legacy_id: 'recTr3', license_plate: 'TRK-3' }, { id: 4, legacy_id: 'recTr4', license_plate: 'TRK-4' }],
  trailers: [], drivers: [{ id: 7, legacy_id: 'recDr7', full_name: 'Driver 7' }],
  partners: [{ id: 32, legacy_id: 'recPa32', company_name: 'Partner 32' }],
};
const ACTIVITY = {
  'partner_id=32': { cycles: [{ rt_id: 901, code: 'RT-901', status: 'planned', ended: false, start_at: '2026-10-25T06:00:00Z',
    segs: [{ from_at: '2026-10-25T06:00:00Z', to_at: '2026-10-25T18:00:00Z', trip_type: 'PARTNER', first: true, partner_id: 32, partner_rate: 400 }] }], truncated: false },
  'driver_id=7': { cycles: [{ rt_id: 903, code: 'RT-903', status: 'planned', ended: true, start_at: '2026-10-20T06:00:00Z', end_at: '2026-10-22T18:00:00Z',
    route_text: 'Hub → X', segs: [{ from_at: '2026-10-21T06:00:00Z', to_at: '2026-10-22T18:00:00Z', trip_type: 'OWNED', first: false, truck_id: 4, driver_id: 7 }] }], truncated: false },
  'location_id=11': { stops: [{ stop_id: 1, rt_id: 904, code: 'RT-904', side: 'KATHODOS', planned_from: '2026-11-02T07:00:00Z', planned_to: '2026-11-02T09:00:00Z',
      executed: false, rt_status: 'planned', carrier: { trip_type: 'OWNED', truck_id: 3, partner_id: null },
      loads: [{ act: 'drop', shipment_id: 61, kind: 'national', nat_order_id: 2, reference: 'REF-A', client_id: 21, pallets: 6 }] }],
    shipments: [{ shipment_id: 63, nat_order_id: 3, reference: 'REF-B', client_id: 21, pallets: 4, end: 'origin', day: '2026-11-04' }], truncated: false },
  'location_id=all': { sides: [{ location_id: 12, kathodos: 0, anodos: 2 }] },
};
const RT_LIST = { records: [{ id: 801, model: 1, status: 'closed', date_start: '2026-09-10', date_end: '2026-09-12', driver_id: 7, truck_id: 3, route_text: 'A → B' }] };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

// mode: 'after' | 'before' | 'none'; activity: 'ok' | 'fail' | 'absent' (404 no_route)
async function fresh(base, route, mode, activity) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [], calls = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  await preparePage(page, 'owner');
  if (mode !== 'none') {
    // app.html loads core/plan-config.js only from stream (e)'s bump: the rig stands in for it with the contract
    await page.addInitScript(st => {
      window.PlanConfig = Object.freeze({ STATE: { BEFORE: 'before', AFTER: 'after', UNKNOWN: 'unknown' },
        load: async () => ({ state: st, cutoverDay: st === 'after' ? '2026-10-31' : null, writesOpen: false, err: null }) });
    }, mode);
  }
  const J = (r, status, body) => r.fulfill({ status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-credentials': 'true' },
    body: JSON.stringify(body) });
  await page.route(`**/${HOST}/**`, async r => {
    const req = r.request(); const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const p = u.pathname;
    if (p.startsWith('/plan/')) calls.push(p + u.search);
    if (p === '/plan/lookups') return mode === 'none' ? J(r, 404, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'no route' } }) : J(r, 200, LOOKUPS);
    if (p === '/plan/activity') {
      if (activity === 'absent' || mode === 'none') return J(r, 404, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'no route' } });
      if (activity === 'fail') return J(r, 500, { error: { type: 'PLAN_FAILED', code: 'plan_failed', message: 'stub failure' } });
      const body = ACTIVITY[u.search.slice(1)];
      return body ? J(r, 200, body) : J(r, 200, { cycles: [], stops: [], shipments: [], sides: [], truncated: false });
    }
    if (p.startsWith('/plan/')) return J(r, 404, { error: { type: 'NOT_FOUND', code: 'no_route', message: 'no route' } });
    if (p === '/costs/lookups') return J(r, 200, { drivers: LOOKUPS.drivers, trucks: LOOKUPS.trucks, trailers: [], partners: LOOKUPS.partners, pay_sources: [] });
    if (p === '/costs/rt') return J(r, 200, RT_LIST);
    if (p.startsWith('/pallets/')) return J(r, 200, { records: [] });
    const m = p.match(/\/v0\/[^/]+\/([^/]+)(?:\/([^/]+))?$/);
    if (req.method() === 'GET' && m) {
      const [, table, rec] = m;
      const rows = TABLE_ROWS[table] || [];
      if (rec) { const hit = rows.find(x => x.id === rec); return hit ? J(r, 200, hit) : J(r, 404, { error: { type: 'NOT_FOUND', message: 'stub' } }); }
      return J(r, 200, { records: rows });
    }
    return J(r, 200, {});
  });
  await gotoPage(page, route, base);
  return { browser, page, errors, calls };
}
const settle = page => page.waitForTimeout(1500);
const txt = (page, sel) => page.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '(missing ' + sel + ')');

const SCREENS = {
  async partnerCard(base, mode, activity) {
    const s = await fresh(base, 'partners', mode, activity);
    await s.page.waitForFunction(() => typeof selectEntity === 'function' && document.getElementById('row_recPa32'), null, { timeout: 30000 });
    await s.page.evaluate(() => selectEntity('partners', 'recPa32'));
    await s.page.waitForFunction(() => { const e = document.getElementById('ec_recPa32_act'); return e && !/Φόρτωση/.test(e.innerText); }, null, { timeout: 15000 });
    await settle(s.page);
    s.text = (await txt(s.page, '#ec_recPa32_act')) + ' || ' + (await txt(s.page, '#ec_recPa32_recent'));
    s.title = await s.page.$$eval('#ec_recPa32_recent .ecard-row', els => els.map(e => e.getAttribute('title') || '').join(','));
    return s;
  },
  async driverCard(base, mode, activity) {
    const s = await fresh(base, 'drivers', mode, activity);
    await s.page.waitForFunction(() => typeof selectEntity === 'function' && document.getElementById('row_recDr7'), null, { timeout: 30000 });
    await s.page.evaluate(() => selectEntity('drivers', 'recDr7'));
    await s.page.waitForFunction(() => { const e = document.getElementById('ec_recDr7_rt'); return e && !/Φόρτωση/.test(e.innerText); }, null, { timeout: 15000 });
    await settle(s.page);
    s.text = (await txt(s.page, '#ec_recDr7_rt')) + ' || ' + (await txt(s.page, '#ec_recDr7_agg'));
    return s;
  },
  async locCard(base, mode, activity) {
    const s = await fresh(base, 'locations', mode, activity);
    await s.page.waitForFunction(() => typeof _locOpenCard === 'function' && typeof LOC !== 'undefined' && LOC.records && LOC.records.length === 2, null, { timeout: 30000 });
    await s.page.evaluate(() => _locOpenCard('recLoc1'));
    await s.page.waitForFunction(() => { const e = document.getElementById('loccPanel'); return e && !/Φόρτωση ιστορικού/.test(e.innerText); }, null, { timeout: 15000 });
    await settle(s.page);
    s.text = await txt(s.page, '#loccPanel');
    return s;
  },
  async moveFilter(base, mode, activity) {
    const s = await fresh(base, 'locations', mode, activity);
    await s.page.waitForFunction(() => typeof LOC !== 'undefined' && LOC.records && LOC.records.length === 2 && document.getElementById('locMoveFilter'), null, { timeout: 30000 });
    await s.page.selectOption('#locMoveFilter', 'ΑΝΟΔΟΣ');
    await settle(s.page);
    s.text = await s.page.evaluate(() => JSON.stringify(LOC.moveIdx ? [...LOC.moveIdx].map(([k, v]) => [k, [...v].sort()]) : null))
      + ' || ' + (await txt(s.page, '#locTableWrap'));
    return s;
  },
};

async function run(name, base, mode, activity) {
  const s = await SCREENS[name](base, mode, activity);
  if (process.env.RIG_DEBUG) {
    console.log('    [debug] /plan calls ' + JSON.stringify(s.calls));
    console.log('    [debug] ' + JSON.stringify(await s.page.evaluate(() => ({ gate: typeof _v5Gate, ids: typeof PlanIds, pf: typeof planFetch, pc: typeof PlanConfig }))));
  }
  await s.browser.close();
  return s;
}

(async () => {
  console.log('BASE ' + BASE + (TIP ? '   TIP ' + TIP : ''));

  console.log('\n── A. partner card, after L');
  { const s = await run('partnerCard', BASE, 'after', 'ok');
    ok(/2 αναθέσεις/.test(s.text) && /2 ενεργές/.test(s.text), 'PA + v5 cycle counted: ' + s.text.slice(0, 120));
    ok(/€450 τζίρος/.test(s.text), 'τζίρος 50 + 400');
    ok(/NAT/.test(s.text) && /RT-901/.test(s.title) && !/RT-901/.test(s.text), 'v5 row «NAT», RT code in the title only');
    ok(!s.errors.length, '0 console errors ' + JSON.stringify(s.errors)); }

  console.log('\n── B. driver card, after L');
  { const s = await run('driverCard', BASE, 'after', 'ok');
    ok(/ολοκληρωμένο/.test(s.text) && /Hub → X/.test(s.text), 'handover cycle listed, ended → «ολοκληρωμένο»: ' + s.text.slice(0, 160));
    ok(/TRK-4/.test(s.text), '«Με ποια φορτηγά» counts the segment truck');
    ok(!s.errors.length, '0 console errors ' + JSON.stringify(s.errors)); }

  console.log('\n── C. location card, after L');
  { const s = await run('locCard', BASE, 'after', 'ok');
    ok(/3 κινήσεις/.test(s.text), 'history = 1 old + 1 v5 stop + 1 to assign: ' + (s.text.match(/Ιστορικό.{0,40}/) || [''])[0]);
    ok(/ΚΑΘΟΔΟΣ 1×/.test(s.text), 'ΚΑΘΟΔΟΣ chip');
    ok(/REF-B · — προς ανάθεση/.test(s.text) && /REF-A · TRK-3/.test(s.text), 'v5 rows: shipment to assign + stop with plate');
    ok(!s.errors.length, '0 console errors ' + JSON.stringify(s.errors)); }

  console.log('\n── D. location list, filter ΑΝΟΔΟΣ, after L');
  { const s = await run('moveFilter', BASE, 'after', 'ok');
    ok(/\["recLoc2",\["ΑΝΟΔΟΣ"\]\]/.test(s.text) && /Loc 2/.test(s.text), 'v5-only place found under ΑΝΟΔΟΣ');
    ok(!s.errors.length, '0 console errors ' + JSON.stringify(s.errors)); }

  console.log('\n── E. /plan/activity fails (500) → today\'s half stays, a visible line');
  for (const name of ['partnerCard', 'driverCard', 'locCard']) {
    const s = await run(name, BASE, 'after', 'fail');
    ok(/Τα εθνικά v5 δεν διαβάστηκαν/.test(s.text) && !/Καμία κίνηση/.test(s.text), name + ': ' + s.text.slice(0, 140));
    // a real failure is logged ONCE (planFetch's logError, principle 1) — never twice, never not at all; the 500
    // itself is a network line the browser prints. Nothing else may be red.
    const logged = s.errors.filter(e => /\[TMS ERROR\] planFetch GET \/plan\/activity/.test(e));
    const other = s.errors.filter(e => !/status of 500/.test(e) && !logged.includes(e));
    ok(logged.length === 1, name + ': the failure logged exactly once (' + logged.length + ')');
    ok(!other.length, name + ': no other console error ' + JSON.stringify(other));
  }

  if (TIP) {
    for (const mode of ['before', 'none']) {
      console.log(`\n── F. ${mode === 'before' ? "PlanConfig 'before'" : 'no PlanConfig + Worker without the routes'} = the same text as the tip`);
      for (const name of Object.keys(SCREENS)) {
        const a = await run(name, BASE, mode, mode === 'none' ? 'absent' : 'ok');
        const b = await run(name, TIP, mode, mode === 'none' ? 'absent' : 'ok');
        ok(a.text === b.text, `${name}: identical (${a.text.length} chars)` + (a.text === b.text ? '' : '\n      new: ' + a.text + '\n      tip: ' + b.text));
        if (mode === 'before') ok(!a.calls.some(c => c.startsWith('/plan/activity')), `${name}: 0 /plan/activity calls`);
        // 'none' (new code served WITHOUT core/plan-config.js against a Worker before deploy 1) does not occur in
        // production: stream (e)'s bump ships this code and plan-config.js together, and PlanConfig reads a 404 as
        // 'before'. If it did, the only red line is the browser's own network line for the 404 — no app error.
        const ownErr = a.errors.filter(e => !/status of 404/.test(e));
        ok(!ownErr.length, `${name}: 0 app console errors` + (a.errors.length ? ` (browser network lines: ${a.errors.length})` : ''));
      }
    }
  } else {
    console.log('\n(no PW_BASE_URL_TIP: the flag-off comparison is skipped)');
  }

  console.log(`\n${pass} ✓  ${fail} ✗`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
