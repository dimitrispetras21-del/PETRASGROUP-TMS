// node --test tests/rt-conflict-loud.test.js
// Live 7/10: import group GI-MUV7FNKE (orders 449 + 451) sat on TWO round trips
// (451 with its export 438 on RT-1217, 449 alone on RT-1220). Every front sync
// that gathered the group got 409 «legs already belong to different round
// trips» from the Worker (worker/src/rt-rules.mjs planRtUpsert); core/rt-feed.js
// _rtSafe turned it into its generic 8 s toast, and modules/weekly_intl.js
// _wiRotAdd reverted the rota with «Το σκέλος δεν μπήκε στο δρομολόγιο» — the
// dispatcher could not add rota order 467 for hours and never saw why.
// Now: a persistent banner naming the round trips + logError, and the rota
// revert says the same cause.
//
// The REAL core/pallet-feed.js (plFetch) + core/rt-feed.js run in a vm with a
// scripted fetch; the Worker's POST /costs/rt decision is the REAL
// validateRtBody + planRtUpsert, so a drift in the Worker's 409 wording turns
// this red. _wiRotAdd is extracted verbatim from modules/weekly_intl.js.
// Nothing leaves the process.
// RT_SRC=<path> / WI_SRC=<path> run the same cases against another copy (the
// «before» proof: origin/main 0ab4d820 fails the split cases).
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
const ROT_ADD = (WI.match(/async function _wiRotAdd\(parentRowId, legOid\)\{[\s\S]*?\n\}\n/) || [])[0];
if (!ROT_ADD) throw new Error('_wiRotAdd not found in weekly_intl.js');

const SPLIT_MSG = 'Η ομάδα είναι μοιρασμένη σε δύο δρομολόγια: RT-1217, RT-1220 — ζήτα συγχώνευση από τον owner';

// Just enough DOM for a banner: create, append, find by id, remove.
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this.attrs = {}; this.style = {}; this._text = ''; this.id = ''; this.className = ''; }
  appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach(c => this.appendChild(c)); }
  remove() { const p = this.parentNode; if (p) { p.children = p.children.filter(x => x !== this); this.parentNode = null; } }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  set textContent(t) { this._text = String(t); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
}
const walk = (el, fn) => { fn(el); el.children.forEach(c => walk(c, fn)); };

let rules;
async function world({ listOmits = [], postFails = null } = {}) {
  rules = rules || await import(pathToFileURL(path.join(ROOT, 'worker/src/rt-rules.mjs')).href);
  const veh = { 'Truck': ['recT13'], 'Driver': ['recD16'] };
  const when = { 'Loading DateTime': '2026-10-05T06:00:00Z', 'Delivery DateTime': '2026-10-07T06:00:00Z' };
  const orders = {
    rec438: { Reference: 'R438', Direction: 'Export', Status: 'Assigned', 'Matched Import ID': 'rec451', ...veh, ...when },
    rec451: { Reference: 'R451', Direction: 'Import', Status: 'Assigned', 'Group ID': 'GI-MUV7FNKE|rec451,rec449', ...veh, ...when },
    rec449: { Reference: 'R449', Direction: 'Import', Status: 'Assigned', 'Group ID': 'GI-MUV7FNKE|rec451,rec449', ...veh, ...when },
    rec467: { Reference: 'R467', Direction: 'Export', Status: 'Pending', ...when },
  };
  const pgOf = id => Number(id.replace('rec', ''));
  const rtBase = { status: 'planned', trip_type: 'OWNED', truck_id: 13, driver_id: 16, trailer_id: null, date_start: '2026-10-05', date_end: '2026-10-07' };
  // ids deliberately unlike the codes: the Worker's 409 names ids, the screen must name codes
  const rts = [
    { ...rtBase, id: 301, code: 'RT-1217', ct_rt_legs: [{ id: 1, order_id: 438, seq: 1, direction: 'EXPORT' }, { id: 2, order_id: 451, seq: 2, direction: 'IMPORT' }] },
    { ...rtBase, id: 304, code: 'RT-1220', ct_rt_legs: [{ id: 3, order_id: 449, seq: 1, direction: 'IMPORT' }] },
  ];
  let nextRt = 400, nextLeg = 100;
  const calls = [], toasts = [], logged = [], wiToasts = [], reports = [], patches = [], timers = [];
  const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });

  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {} }, JSON, Math, Date, Promise, Array, Object, Set, Map, Error, Number, String,
    setTimeout: (fn, ms) => { timers.push(ms); return 0; }, clearTimeout() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    PROXY_URL: 'https://w.invalid',
    TABLES: { ORDERS: 'tblO' },
    getLinkedId: v => (Array.isArray(v) ? v[0] || null : v || null),
    getTruckPlate: id => (id === 'recT13' ? 'TRK-13' : ''),
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
    renderWeeklyIntl: async () => {},
    WINTL: { rows: [{ id: 1, type: 'export', orderIds: ['rec438'], truckId: 'recT13', driverId: 'recD16' }] },
  };
  ctx.document = { body: new El('body'), createElement: t => new El(t), getElementById: id => { let hit = null; walk(ctx.document.body, e => { if (!hit && e.id === id) hit = e; }); return hit; } };
  ctx.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const p = String(url).replace(ctx.PROXY_URL, '');
    calls.push(method + ' ' + p);
    if (p.startsWith('/pallets/gate')) return resp(200, { records: [{ order_id: pgOf(decodeURIComponent(p.split('order_recs=')[1])) }] });
    if (p === '/costs/lookups') return resp(200, { trucks: [{ id: 13, license_plate: 'TRK-13' }], trailers: [], drivers: [{ id: 16, full_name: 'Driver 16' }], partners: [] });
    if (p.startsWith('/costs/lines')) return resp(200, { records: [] });
    if (p === '/costs/rt' && method === 'GET') return resp(200, { records: rts.filter(r => !listOmits.includes(r.id)) });
    if (p.startsWith('/costs/rt/') && method === 'PATCH') { const r = rts.find(x => x.id === Number(p.split('/')[3])); Object.assign(r, JSON.parse(init.body)); return resp(200, { record: r }); }
    if (p === '/costs/rt' && method === 'POST') {
      if (postFails) return resp(postFails, { error: 'boom' });
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
      const r = { ...rtBase, id: nextRt, code: 'RT-' + nextRt++, ct_rt_legs: v.legs.map(l => ({ id: nextLeg++, ...l })) };
      rts.push(r);
      return resp(201, { record: r, legs: r.ct_rt_legs });
    }
    return resp(404, { error: 'unexpected ' + method + ' ' + p });
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(PL_SRC, ctx, { filename: 'core/pallet-feed.js' });
  vm.runInContext(RT_SRC, ctx, { filename: 'core/rt-feed.js' });
  vm.runInContext(ROT_ADD + '\nwindow._wiRotAdd=_wiRotAdd;', ctx, { filename: 'modules/weekly_intl.js#_wiRotAdd' });
  const banners = () => { const out = []; walk(ctx.document.body, e => { if (e.getAttribute('role') === 'alert') out.push(e); }); return out; };
  return { ctx, orders, rts, calls, toasts, logged, wiToasts, reports, patches, timers, banners };
}

const vague = t => /απέτυχε συγχρονισμός|δεν πήρε το σκέλος/.test(t.m);

test('incident replica: rota 467 onto 438 while the group sits on RT-1217 + RT-1220 — named banner, logged, rota reverted with the cause', async () => {
  const w = await world();
  await w.ctx._wiRotAdd(1, 'rec467');

  assert.ok(w.calls.includes('POST /costs/rt'), 'the sync never reached the Worker');
  const b = w.banners();
  assert.strictEqual(b.length, 1, 'expected ONE persistent banner, got ' + b.length);
  assert.ok(b[0].textContent.includes(SPLIT_MSG), 'banner text: ' + b[0].textContent);
  assert.strictEqual(w.timers.length, 0, 'something scheduled a dismissal — the banner must stay until closed');
  assert.strictEqual(w.logged.length, 1, 'logError not called once: ' + JSON.stringify(w.logged));
  assert.match(w.logged[0].msg, /different round trips/);
  assert.match(w.logged[0].where, /RT-1217, RT-1220/);
  assert.deepStrictEqual(w.toasts.filter(vague), [], 'the vague toast still shows on top of the named one');

  assert.strictEqual(w.orders.rec467['Rotation ID'], '', 'Rotation ID not reverted');
  assert.ok(!w.patches.some(p => p.id === 'rec467' && 'Truck' in p.f), 'vehicle hand-copied onto the leg — the DB trigger would open a THIRD round trip');
  assert.deepStrictEqual(w.wiToasts, [{ m: SPLIT_MSG + ' · η ρότα ΔΕΝ γράφτηκε', k: 'warn' }]);
  assert.strictEqual(w.reports.length, 0);
  assert.strictEqual(w.rts.length, 2, 'a round trip was created');
  assert.deepStrictEqual(w.rts.map(r => r.ct_rt_legs.map(l => l.order_id)), [[438, 451], [449]], 'legs moved');
});

test('one banner per split: a second sync of the same group adds none; × closes it; the next sync shows it again', async () => {
  const w = await world();
  await w.ctx.rtOnOrderSaved('rec438');
  await w.ctx.rtOnOrderSaved('rec451');      // the import side redirects to the same export
  assert.strictEqual(w.banners().length, 1);
  assert.strictEqual(w.logged.length, 2, 'every refused sync is logged (logError de-duplicates on its own)');
  assert.deepStrictEqual([...w.ctx.rtSplitFor('rec451').codes], ['RT-1217', 'RT-1220']);   // spread: the vm's arrays are another realm
  const close = w.banners()[0].children.find(c => c.tagName === 'BUTTON');
  assert.ok(close && typeof close.onclick === 'function', 'no close button');
  assert.strictEqual(close.getAttribute('aria-label'), 'Κλείσιμο');
  close.onclick();
  assert.strictEqual(w.banners().length, 0);
  await w.ctx.rtOnOrderSaved('rec438');
  assert.strictEqual(w.banners().length, 1);
});

test('an id the /costs/rt list cannot place is still named, never dropped', async () => {
  const w = await world({ listOmits: [304] });
  await w.ctx.rtOnOrderSaved('rec438');
  const b = w.banners();
  assert.strictEqual(b.length, 1);
  assert.ok(b[0].textContent.includes('Η ομάδα είναι μοιρασμένη σε δύο δρομολόγια: RT-1217, RT id 304 — ζήτα συγχώνευση από τον owner'), b[0].textContent);
});

test('every other POST failure keeps the generic _rtSafe toast — no banner, no recorded cause', async () => {
  const w = await world({ postFails: 500 });
  await w.ctx.rtOnOrderSaved('rec438');
  assert.strictEqual(w.banners().length, 0);
  assert.strictEqual(w.toasts.filter(t => /απέτυχε συγχρονισμός round trip/.test(t.m)).length, 1);
  assert.strictEqual(w.ctx.rtSplitFor('rec438'), null);
});

test('after the merge a clean sync attaches and clears the recorded cause', async () => {
  const w = await world();
  await w.ctx.rtOnOrderSaved('rec438');
  assert.ok(w.ctx.rtSplitFor('rec438'));
  // the owner's merge (7/10): leg 449 moves to RT-1217, the DB cancels the empty RT-1220
  w.rts[0].ct_rt_legs.push({ id: 9, order_id: 449, seq: 3, direction: 'IMPORT' });
  w.rts[1].ct_rt_legs = []; w.rts[1].status = 'cancelled';
  await w.ctx.rtOnOrderSaved('rec438');
  assert.strictEqual(w.ctx.rtSplitFor('rec438'), null);
  assert.deepStrictEqual(w.toasts.filter(vague), []);
  // and the rota now goes in
  w.wiToasts.length = 0;
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.ok(w.rts[0].ct_rt_legs.some(l => l.order_id === 467), 'rota leg not attached to RT-1217');
  assert.strictEqual(w.orders.rec467['Rotation ID'], 'rec438');
  assert.deepStrictEqual(w.wiToasts, [{ m: '⤷ Σκέλος συνδέθηκε στη ρότα ✓', k: 'success' }]);
});

test('_wiRotAdd: a split with no round trip found for the parent still reverts — no vehicle copy, no green ✓', async () => {
  const w = await world();
  w.ctx.rtFindForOrder = async () => ({ pg: null, rt: null });   // e.g. the parent has no live loading stop
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.strictEqual(w.orders.rec467['Rotation ID'], '');
  assert.ok(!w.patches.some(p => p.id === 'rec467' && 'Truck' in p.f), 'vehicle hand-copied onto the leg');
  assert.deepStrictEqual(w.wiToasts, [{ m: SPLIT_MSG + ' · η ρότα ΔΕΝ γράφτηκε', k: 'warn' }]);
});

test('_wiRotAdd without a split keeps its own message for any other non-attach', async () => {
  const w = await world();
  w.ctx.rtOnOrderSaved = async () => null;
  w.ctx.rtFindForOrder = async id => ({ pg: 1, rt: id === 'rec467' ? null : { id: 301, code: 'RT-1217', status: 'planned' } });
  await w.ctx._wiRotAdd(1, 'rec467');
  assert.strictEqual(w.orders.rec467['Rotation ID'], '');
  assert.deepStrictEqual(w.wiToasts, [{ m: 'Το σκέλος δεν μπήκε στο δρομολόγιο RT-1217 · η ρότα ΔΕΝ γράφτηκε', k: 'warn' }]);
  assert.strictEqual(w.banners().length, 0);
});
