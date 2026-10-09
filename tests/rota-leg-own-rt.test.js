// node --test tests/rota-leg-own-rt.test.js
// Reviewer 7/10 (main), coordinator 9/10: rota-adding an ASSIGNED leg that has
// its own live round trip onto an UNASSIGNED parent cancelled the LEG's round
// trip. _wiRotAdd wrote Rotation ID, rtOnOrderSaved(parent) saw «not
// executing», _rtFind(legPgs) found the leg's trip through the new rota link
// and PATCHed it to cancelled while the leg still had its truck — and the
// dispatcher got «✓» (a dispatcher cannot read /costs/lines: 403 → the vague
// «απέτυχε συγχρονισμός» toast, then «✓» all the same). Onto an ASSIGNED
// parent the same leg left the group on two live round trips (Worker 409).
// Now: (1) _wiRotAdd refuses up front, before any write, when the leg carries
// an assignment or sits on a live round trip of its own, whatever the parent;
// (2) rt-feed's cancel branch never cancels a trip a leg of which still
// carries a vehicle (or that it cannot prove bare) — logged, said, and the
// rota is reverted instead of a «✓».
//
// The REAL core/pallet-feed.js (plFetch) + core/rt-feed.js run in a vm with a
// scripted fetch; the Worker's POST /costs/rt decision is the REAL
// validateRtBody + planRtUpsert. _wiRotAdd and its helpers are extracted
// verbatim from modules/weekly_intl.js. Nothing leaves the process.
// RT_SRC=<path> / WI_SRC=<path> run the same cases against another copy (the
// «before» proof: origin/main 2779e3ee cancels RT-1300 and shows «✓»).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const RT_SRC = fs.readFileSync(process.env.RT_SRC || path.join(ROOT, 'core/rt-feed.js'), 'utf8');
const PL_SRC = fs.readFileSync(path.join(ROOT, 'core/pallet-feed.js'), 'utf8');
const WI = fs.readFileSync(process.env.WI_SRC || path.join(ROOT, 'modules/weekly_intl.js'), 'utf8');
const grab = (re, name, optional) => { const m = WI.match(re); if (!m && !optional) throw new Error(name + ' not found in weekly_intl.js'); return m ? m[0] : ''; };
const asyncFn = (name, optional) => grab(new RegExp('async function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n'), name, optional);
const fn = name => grab(new RegExp('(?:^|\\n)function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n'), name);
// _wiRotLegBare is new: optional, so the «before» run fails on behaviour, not on a missing name.
const WI_PARTS = [asyncFn('_wiRotAdd'), asyncFn('_wiRotLegBare', true), asyncFn('_wiRtOf'), fn('_wiAssignLbl'), fn('_wiRefuse')].join('\n');

const OWN_REFUSAL = 'Η #R467 έχει ήδη δική της ανάθεση (φορτηγό TRK-13) — πρώτα «Καθαρισμός ανάθεσης» στην #R467, μετά βάλ\' τη ρότα';

let rules;
// parentVeh: the parent's vehicle (null = unassigned). leg: the leg's fields.
// rts: the live round trips. role: 'owner' reads /costs/lines, 'dispatcher' gets 403.
async function world({ parentVeh = null, leg = {}, rts = [], role = 'owner', rtListFails = false, extraOrders = {} } = {}) {
  rules = rules || await import(pathToFileURL(path.join(ROOT, 'worker/src/rt-rules.mjs')).href);
  const when = { 'Loading DateTime': '2026-10-05T06:00:00Z', 'Delivery DateTime': '2026-10-07T06:00:00Z' };
  const orders = {
    rec438: { Reference: 'R438', 'Order No': 438, Direction: 'Export', Status: parentVeh ? 'Assigned' : 'Pending', ...(parentVeh || {}), ...when },
    rec467: { Reference: 'R467', 'Order No': 467, Direction: 'Export', Status: 'Pending', ...when, 'Loading DateTime': '2026-10-07T06:00:00Z', 'Delivery DateTime': '2026-10-09T06:00:00Z', ...leg },
    ...extraOrders,
  };
  const pgOf = id => Number(id.replace('rec', ''));
  let nextRt = 400, nextLeg = 100;
  const calls = [], toasts = [], logged = [], wiToasts = [], reports = [], patches = [];
  const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const T = (id, label) => ({ id, label });

  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {} }, JSON, Math, Date, Promise, Array, Object, Set, Map, Error, Number, String,
    setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    PROXY_URL: 'https://w.invalid',
    TABLES: { ORDERS: 'tblO' },
    getLinkedId: v => (Array.isArray(v) ? v[0] || null : v || null),
    getTruckPlate: id => ({ recT13: 'TRK-13', recT27: 'TRK-27' }[id] || ''),
    getDriverName: id => (id === 'recD16' ? 'Driver 16' : ''),
    getRefTrailers: () => [], getRefPartners: () => [],
    atGetOne: async (_t, id) => (orders[id] ? { id, fields: { ...orders[id] } } : null),
    atGetAll: async (_t, { filterByFormula }) => {
      const m = /^\{([^}]+)\}='(.*)'$/.exec(filterByFormula);
      return Object.keys(orders).filter(id => m && orders[id][m[1]] === m[2]).map(id => ({ id, fields: { ...orders[id] } }));
    },
    atSafePatch: async (_t, id, f) => { patches.push({ id, f }); Object.assign(orders[id], f); return { id, fields: { ...orders[id] } }; },
    showErrorToast: (m, type) => toasts.push({ m, type }),
    logError: (e, where) => logged.push({ msg: e && e.message, where }),
    toast: (m, k) => wiToasts.push({ m, k: k || 'success' }),
    reportError: (m) => reports.push(m),
    escapeHtml: s => String(s),
    renderWeeklyIntl: async () => {},
    WINTL: {
      rows: [{ id: 1, type: 'export', orderIds: ['rec438'], truckId: parentVeh ? (parentVeh.Truck || [])[0] || '' : '', driverId: parentVeh ? (parentVeh.Driver || [])[0] || '' : '' }],
      data: { trucks: [T('recT13', 'TRK-13'), T('recT27', 'TRK-27')], drivers: [T('recD16', 'Driver 16')], partners: [], trailers: [] },
    },
  };
  ctx.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const p = String(url).replace(ctx.PROXY_URL, '');
    calls.push(method + ' ' + p);
    if (p.startsWith('/pallets/gate')) return resp(200, { records: [{ order_id: pgOf(decodeURIComponent(p.split('order_recs=')[1])) }] });
    if (p === '/costs/lookups') return resp(200, { trucks: [{ id: 13, license_plate: 'TRK-13' }, { id: 27, license_plate: 'TRK-27' }], trailers: [], drivers: [{ id: 16, full_name: 'Driver 16' }], partners: [] });
    if (p.startsWith('/costs/lines')) return role === 'dispatcher' ? resp(403, { error: 'forbidden' }) : resp(200, { records: [] });
    if ((p === '/costs/rt' || p.startsWith('/costs/rt?')) && method === 'GET') return rtListFails ? resp(500, { error: 'boom' }) : resp(200, { records: rts });
    if (p.startsWith('/costs/rt/') && method === 'PATCH') { const r = rts.find(x => x.id === Number(p.split('/')[3])); Object.assign(r, JSON.parse(init.body)); return resp(200, { record: r }); }
    if (p === '/costs/rt' && method === 'POST') {
      const v = rules.validateRtBody(JSON.parse(init.body));
      if (!v.ok) return resp(v.status, { error: v.error });
      const existing = [];
      for (const r of rts) for (const l of r.ct_rt_legs) if (v.legs.some(x => x.order_id === l.order_id)) existing.push({ id: l.id, order_id: l.order_id, rt_id: r.id, seq: l.seq, rt_status: r.status });
      const plan = rules.planRtUpsert({ legs: v.legs, existing });
      if (plan.action === 'conflict') return resp(plan.status, { error: plan.error });
      if (plan.action === 'attach') {
        const r = rts.find(x => x.id === plan.rt_id);
        plan.legsToAdd.forEach(l => r.ct_rt_legs.push({ id: nextLeg++, ...l }));
        return resp(200, { record: r, legs: r.ct_rt_legs, attached: true });
      }
      const r = { status: 'planned', trip_type: 'OWNED', truck_id: 13, date_start: '2026-10-05', date_end: '2026-10-09', id: nextRt, code: 'RT-' + nextRt++, ct_rt_legs: v.legs.map(l => ({ id: nextLeg++, ...l })) };
      rts.push(r);
      return resp(201, { record: r, legs: r.ct_rt_legs });
    }
    return resp(404, { error: 'unexpected ' + method + ' ' + p });
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(PL_SRC, ctx, { filename: 'core/pallet-feed.js' });
  vm.runInContext(RT_SRC, ctx, { filename: 'core/rt-feed.js' });
  vm.runInContext(WI_PARTS + '\nwindow._wiRotAdd=_wiRotAdd;', ctx, { filename: 'modules/weekly_intl.js#rota' });
  const writes = () => calls.filter(c => !c.startsWith('GET '));
  return { ctx, orders, rts, calls, writes, toasts, logged, wiToasts, reports, patches };
}

const rt = (id, code, legs, extra = {}) => ({ id, code, status: 'planned', trip_type: 'OWNED', truck_id: 13, driver_id: 16, trailer_id: null, date_start: '2026-10-05', date_end: '2026-10-09', ct_rt_legs: legs.map((o, i) => ({ id: id * 10 + i, order_id: o, seq: i + 1, direction: 'EXPORT' })), ...extra });
const ownTruck = { Truck: ['recT13'], Driver: ['recD16'], Status: 'Assigned' };
const green = w => w.wiToasts.filter(t => /✓/.test(t.m));
const vague = w => w.toasts.filter(t => /απέτυχε συγχρονισμός/.test(t.m));

// ── (1) the up-front refusal ────────────────────────────────────────────

test('incident replica (owner): assigned leg 467 on its own RT-1300 onto UNASSIGNED parent 438 — refused, nothing written, RT-1300 untouched', async () => {
  const w = await world({ leg: ownTruck, rts: [rt(300, 'RT-1300', [467])] });
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.strictEqual(w.rts[0].status, 'planned', 'the leg\'s round trip was cancelled');
  assert.deepStrictEqual(w.writes(), [], 'something was written: ' + w.writes().join(', '));
  assert.deepStrictEqual(w.patches, [], 'an order was patched');
  assert.strictEqual(w.orders.rec467['Rotation ID'], undefined);
  assert.deepStrictEqual(green(w), [], 'a green ✓ over a refusal');
  assert.deepStrictEqual(w.toasts.map(t => t.m), [OWN_REFUSAL]);
  assert.strictEqual(w.logged.length, 1, 'logged once: ' + JSON.stringify(w.logged));
  assert.strictEqual(w.logged[0].msg, OWN_REFUSAL);
});

test('incident replica (dispatcher, /costs/lines = 403): the same refusal — no vague toast, no ✓', async () => {
  const w = await world({ leg: ownTruck, rts: [rt(300, 'RT-1300', [467])], role: 'dispatcher' });
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.deepStrictEqual(vague(w), [], 'the vague «απέτυχε συγχρονισμός» toast');
  assert.deepStrictEqual(green(w), []);
  assert.deepStrictEqual(w.toasts.map(t => t.m), [OWN_REFUSAL]);
  assert.deepStrictEqual(w.writes(), []);
});

test('parent ASSIGNED to another truck: refused — no 409 split, no second live trip for the rota', async () => {
  const w = await world({ parentVeh: { Truck: ['recT27'] }, leg: ownTruck, rts: [rt(301, 'RT-1217', [438], { truck_id: 27 }), rt(300, 'RT-1300', [467])] });
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.deepStrictEqual(w.writes(), []);
  assert.deepStrictEqual(w.rts.map(r => [r.code, r.status, r.ct_rt_legs.map(l => l.order_id)]), [['RT-1217', 'planned', [438]], ['RT-1300', 'planned', [467]]]);
  assert.deepStrictEqual(w.toasts.map(t => t.m), [OWN_REFUSAL]);
  assert.deepStrictEqual(green(w), []);
});

test('parent assigned to the SAME truck: refused too (the leg\'s own trip would still be a second one)', async () => {
  const w = await world({ parentVeh: { Truck: ['recT13'], Driver: ['recD16'] }, leg: ownTruck, rts: [rt(301, 'RT-1217', [438]), rt(300, 'RT-1300', [467])] });
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.deepStrictEqual(w.writes(), []);
  assert.deepStrictEqual(w.toasts.map(t => t.m), [OWN_REFUSAL]);
});

test('a driver alone counts as an assignment', async () => {
  const w = await world({ leg: { Driver: ['recD16'] } });
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.deepStrictEqual(w.writes(), []);
  assert.deepStrictEqual(w.toasts.map(t => t.m), ['Η #R467 έχει ήδη δική της ανάθεση (οδηγός Driver 16) — πρώτα «Καθαρισμός ανάθεσης» στην #R467, μετά βάλ\' τη ρότα']);
});

test('no vehicle but still on its own live round trip (what «Καθαρισμός ανάθεσης» leaves on a solo trip): refused, the trip named', async () => {
  const w = await world({ parentVeh: { Truck: ['recT13'] }, rts: [rt(301, 'RT-1217', [438]), rt(300, 'RT-1300', [467], { truck_id: null, driver_id: null })] });
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.deepStrictEqual(w.writes(), []);
  assert.deepStrictEqual(w.toasts.map(t => t.m), ['Η #R467 είναι ακόμη στο δικό της δρομολόγιο RT-1300 — σκέλος ρότας ταξιδεύει μόνο στο δρομολόγιο του γονέα· ζήτα από τον owner να ακυρώσει το RT-1300, μετά βάλ\' τη ρότα']);
  assert.strictEqual(w.logged.length, 1);
});

test('the leg\'s round trip cannot be read: refused, nothing written (never a guess)', async () => {
  const w = await world({ rtListFails: true });
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.deepStrictEqual(w.writes(), []);
  assert.strictEqual(w.toasts.length, 1);
  assert.match(w.toasts[0].m, /^Ο γύρος της #R467 δεν διαβάστηκε \(ο γύρος δεν διαβάστηκε \(boom\)\) — η ρότα ΔΕΝ γράφτηκε$/);
});

test('a BARE leg onto an assigned parent still goes in: rota written, attached to RT-1217, «✓»', async () => {
  const w = await world({ parentVeh: { Truck: ['recT13'], Driver: ['recD16'] }, rts: [rt(301, 'RT-1217', [438])] });
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.strictEqual(w.orders.rec467['Rotation ID'], 'rec438');
  assert.deepStrictEqual(w.rts[0].ct_rt_legs.map(l => l.order_id), [438, 467]);
  assert.deepStrictEqual(w.wiToasts, [{ m: '⤷ Σκέλος συνδέθηκε στη ρότα ✓', k: 'success' }]);
  assert.deepStrictEqual(w.toasts, []);
});

test('a BARE leg onto an unassigned parent: rota written, no trip touched, «✓» (nothing to attach to yet)', async () => {
  const w = await world();
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.strictEqual(w.orders.rec467['Rotation ID'], 'rec438');
  assert.ok(!w.writes().some(c => c.includes('/costs/rt')), 'a round trip was written: ' + w.writes().join(', '));
  assert.deepStrictEqual(green(w).length, 1);
});

// ── (2) rt-feed: defence in depth ───────────────────────────────────────

test('rt-feed: the parent\'s sync never cancels a trip a leg of which still has a vehicle — logged, said, cause recorded', async () => {
  // the rota is already there (written by another path / a race past the board check)
  const w = await world({ leg: { ...ownTruck, 'Rotation ID': 'rec438' }, rts: [rt(300, 'RT-1300', [467])] });
  await w.ctx.rtOnOrderSaved('rec438');
  assert.strictEqual(w.rts[0].status, 'planned', 'RT-1300 cancelled under a leg with a truck');
  assert.ok(!w.calls.some(c => c.startsWith('PATCH /costs/rt/')), 'a round trip was patched');
  assert.ok(!w.calls.some(c => c.includes('/costs/lines')), 'cost lines read on a trip that is not going to be cancelled');
  assert.strictEqual(w.logged.length, 1, 'not logged once: ' + JSON.stringify(w.logged));
  const msg = 'P&L: το RT-1300 ΔΕΝ ακυρώθηκε — η R467 έχει ακόμη όχημα ή οδηγό, ενώ η R438 είναι χωρίς φορτηγό · δες το στο TRIP PnL';
  assert.strictEqual(w.logged[0].msg, msg);
  assert.deepStrictEqual(w.toasts.map(t => t.m), [msg]);
  assert.strictEqual(w.ctx.rtHeldFor('rec438').message, msg);
});

test('rt-feed: same for a dispatcher — the specific message, not the 403 vague toast', async () => {
  const w = await world({ leg: { ...ownTruck, 'Rotation ID': 'rec438' }, rts: [rt(300, 'RT-1300', [467])], role: 'dispatcher' });
  await w.ctx.rtOnOrderSaved('rec438');
  assert.deepStrictEqual(vague(w), []);
  assert.strictEqual(w.rts[0].status, 'planned');
  assert.strictEqual(w.toasts.length, 1);
});

test('rt-feed: a leg it did not read (outside the gathered group) is not proof of «bare» — not cancelled', async () => {
  const w = await world({ rts: [rt(300, 'RT-1300', [438, 999])] });
  await w.ctx.rtOnOrderSaved('rec438');
  assert.strictEqual(w.rts[0].status, 'planned');
  assert.deepStrictEqual(w.toasts.map(t => t.m), ['P&L: το RT-1300 ΔΕΝ ακυρώθηκε — έχει σκέλη που δεν διαβάστηκαν (#999) · δες το στο TRIP PnL']);
  assert.strictEqual(w.logged.length, 1);
});

test('rt-feed: an order that lost its assignment with a bare trip still cancels it (the old rule, unchanged)', async () => {
  const w = await world({ extraOrders: { rec451: { Reference: 'R451', 'Order No': 451, Direction: 'Import', Status: 'Pending', 'Loading DateTime': '2026-10-06T06:00:00Z' } },
    rts: [rt(300, 'RT-1300', [438, 451], { truck_id: null, driver_id: null })] });
  w.orders.rec438['Matched Import ID'] = 'rec451';
  await w.ctx.rtOnOrderSaved('rec438');
  assert.strictEqual(w.rts[0].status, 'cancelled');
  assert.deepStrictEqual(w.toasts, []);
  assert.deepStrictEqual(w.logged, []);
  assert.strictEqual(w.ctx.rtHeldFor('rec438'), null);
});

test('rt-feed: truck cleared but driver kept — the order holds its own trip, named once', async () => {
  const w = await world({ parentVeh: { Driver: ['recD16'] }, rts: [rt(300, 'RT-1300', [438], { truck_id: null })] });
  await w.ctx.rtOnOrderSaved('rec438');
  assert.strictEqual(w.rts[0].status, 'planned');
  assert.deepStrictEqual(w.toasts.map(t => t.m), ['P&L: το RT-1300 ΔΕΝ ακυρώθηκε — η R438 έχει ακόμη όχημα ή οδηγό · δες το στο TRIP PnL']);
});

test('rt-feed: a Cancelled leg-mate that still carries its truck does not hold the trip', async () => {
  const w = await world({ leg: { ...ownTruck, Status: 'Cancelled', 'Rotation ID': 'rec438' }, rts: [rt(300, 'RT-1300', [438, 467], { truck_id: null })] });
  await w.ctx.rtOnOrderSaved('rec438');
  assert.strictEqual(w.rts[0].status, 'cancelled');
});

test('_wiRotAdd: a race past the board check (the leg got a truck meanwhile) — rt-feed holds the trip, the rota is reverted, never «✓»', async () => {
  const w = await world({ leg: ownTruck, rts: [rt(300, 'RT-1300', [467])] });
  w.ctx._wiRotLegBare = async () => '';   // the check saw a bare leg
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.strictEqual(w.rts[0].status, 'planned', 'RT-1300 cancelled');
  assert.strictEqual(w.orders.rec467['Rotation ID'], '', 'Rotation ID not reverted');
  assert.deepStrictEqual(green(w), []);
  assert.deepStrictEqual(w.wiToasts, [{ m: 'P&L: το RT-1300 ΔΕΝ ακυρώθηκε — η R467 έχει ακόμη όχημα ή οδηγό, ενώ η R438 είναι χωρίς φορτηγό · δες το στο TRIP PnL · η ρότα ΔΕΝ γράφτηκε', k: 'warn' }]);
});
