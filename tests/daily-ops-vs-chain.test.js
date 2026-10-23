// node --test tests/daily-ops-vs-chain.test.js   (TZ=Europe/Athens)
// WP-A gate 11/10: Daily Ops «Σε μεταφορά» on a VS export writes the Veroia
// day and awaits the VS chain (plan §3.4). Only the 'VS chain' stage moves
// the national load, so only its failure may say «ΔΕΝ ακολούθησε»; any other
// stage that failed is said in its own words (plan §5.2 D), and a chain that
// threw is unknown, not «did not follow». The REAL modules/daily_ops.js runs
// in a vm; the facade and syncOrderDownstream are in-memory stubs. Nothing is
// sent anywhere.
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'core', 'data-helpers.js'), 'utf8'));
global.TmsWeek = require('../core/tms-week.js');
const { OrdersStock } = require('../core/orders-common.js');
const SRC = fs.readFileSync(path.join(ROOT, 'modules', 'daily_ops.js'), 'utf8');

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOff = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); };
const TODAY = dayOff(0);

const VS_EXP = 'recVSX0000000001', VS_SET = 'recVSX0000000002', PLAIN = 'recEXP0000000003';
function dayList() {
  return [
    // a VS export with no Veroia day yet: «Σε μεταφορά» stamps today's
    { id: VS_EXP, fields: { Direction: 'Export', 'Veroia Switch': true, Client: ['recCLIA'], 'Loading DateTime': TODAY, 'Delivery DateTime': dayOff(3), Status: 'Assigned', Truck: ['recTRK1'], 'Total Pallets': 33 } },
    // a VS export whose Veroia day is already set: nothing to stamp, no chain
    { id: VS_SET, fields: { Direction: 'Export', 'Veroia Switch': true, Client: ['recCLIA'], 'Loading DateTime': TODAY, 'Delivery DateTime': dayOff(3), Status: 'Assigned', Truck: ['recTRK1'], 'VS CD Date': dayOff(1), 'Total Pallets': 33 } },
    // an ordinary export: no Veroia day, no chain
    { id: PLAIN, fields: { Direction: 'Export', Client: ['recCLIA'], 'Loading DateTime': TODAY, 'Delivery DateTime': dayOff(3), Status: 'Assigned', Truck: ['recTRK1'], 'Total Pallets': 20 } },
  ];
}

// sync: what the stubbed syncOrderDownstream answers — an object, or an Error to throw.
function load(sync) {
  const S = { patches: [], toasts: [], syncCalls: [], errors: [], content: { innerHTML: '' } };
  const clone = a => a.map(r => ({ id: r.id, fields: JSON.parse(JSON.stringify(r.fields)) }));
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    OrdersStock, getLinkedId, escapeHtml: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    TABLES: { ORDERS: 'tblO', ORDER_STOPS: 'tblS' }, F: { STOP_PARENT_ORDER: 'Parent Order', STOP_TYPE: 'Stop Type', STOP_NUMBER: 'Stop Number', STOP_LOCATION: 'Location' },
    FEATURES: {}, localToday: () => TODAY, localTomorrow: () => dayOff(1), _plus: (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x); },
    toLocalDate: raw => { if (!raw) return ''; const d = new Date(String(raw).length === 10 ? raw + 'T12:00:00' : raw); return isNaN(d) ? '' : ymd(d); },
    showLoading: () => '', preloadReferenceData: async () => {}, getRefTrucks: () => [], getRefDrivers: () => [], getRefLocations: () => [], getRefClients: () => [], getRefTrailers: () => [],
    getLocationName: id => (id ? 'Τοποθεσία ' + id : ''), getClientName: () => 'Πελάτης Α', getTruckPlate: () => 'ΑΒΓ-1234', getDriverName: () => '', getPartnerName: () => '',
    isPreorder: () => false, preorderCounterHtml: () => '', preorderChipHtml: () => '', preorderCountryText: () => '', preorderLevel: () => '',
    can: () => 'full', confirmAction: async () => true, fmtDate: d => d,
    toast: (m, t) => S.toasts.push({ m, t }),
    logError: (e, where) => S.errors.push(where),
    atSafePatch: async (t, id, f) => { S.patches.push({ t, id, f }); return { id, fields: f }; },
    paSyncStatus: async () => null,
    syncOrderDownstream: async (id, opts) => { S.syncCalls.push({ id, opts }); if (sync instanceof Error) throw sync; return sync; },
    atGetAll: async (table, opts) => {
      const fm = (opts && opts.filterByFormula) || '';
      if (table === 'tblO' && fm.startsWith('OR(IS_SAME(')) return clone(dayList());
      return [];
    },
    document: { getElementById: id => (id === 'content' ? S.content : null), querySelectorAll: () => [], querySelector: () => null, removeEventListener() {} },
  };
  ctx.window = ctx;
  vm.runInNewContext(SRC, ctx);
  return { ctx, S };
}
const last = S => S.toasts[S.toasts.length - 1] || { m: '' };

test('ok chain: the Veroia day is written, the VS chain is awaited once with the date-write options, plain ✓', async () => {
  const { ctx, S } = load({ ok: true, failed: [] });
  await ctx.renderDailyOps();
  await ctx._opsStat(VS_EXP, 'In Transit');
  const p = S.patches.find(x => x.t === 'tblO' && x.id === VS_EXP);
  assert.ok(p, 'the order write is missing');
  assert.strictEqual(p.f['VS CD Date'], TODAY);
  assert.strictEqual(S.syncCalls.length, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(S.syncCalls[0])), { id: VS_EXP, opts: { source: 'intl', changedFields: ['VS CD Date'], skipPA: true } });
  assert.deepStrictEqual(last(S), { m: 'Φορτώθηκε ✓', t: undefined });
});

test('VS chain failed → «ΔΕΝ ακολούθησε», warn', async () => {
  const { ctx, S } = load({ ok: false, failed: ['VS chain'] });
  await ctx.renderDailyOps();
  await ctx._opsStat(VS_EXP, 'In Transit');
  assert.strictEqual(last(S).t, 'warn');
  assert.match(last(S).m, /εθνικό φορτίο ΔΕΝ ακολούθησε την ημέρα Βέροιας/);
  assert.ok(!/Δεν ενημερώθηκε επίσης/.test(last(S).m), last(S).m);
});

for (const [stage, words] of [['GRP→GL→CL→NL cascade', 'το groupage εθνικών'], ['RAMP sync', 'η ράμπα'], ['PL feed sync', 'οι παλέτες'], ['paSyncStatus', 'οι αναθέσεις συνεργατών']]) {
  test(`only «${stage}» failed → its own words, never «ακολούθησε»`, async () => {
    const { ctx, S } = load({ ok: false, failed: [stage] });
    await ctx.renderDailyOps();
    await ctx._opsStat(VS_EXP, 'In Transit');
    assert.strictEqual(last(S).t, 'warn');
    assert.strictEqual(last(S).m, `Φορτώθηκε — δεν ενημερώθηκε: ${words}.`);
    assert.ok(!S.toasts.some(x => /ακολούθησε/.test(x.m)), S.toasts.map(x => x.m).join(' / '));
  });
}

test('VS chain AND the ramp failed → «ΔΕΝ ακολούθησε» plus the ramp in its own words', async () => {
  const { ctx, S } = load({ ok: false, failed: ['VS chain', 'RAMP sync'] });
  await ctx.renderDailyOps();
  await ctx._opsStat(VS_EXP, 'In Transit');
  assert.match(last(S).m, /ΔΕΝ ακολούθησε/);
  assert.match(last(S).m, /Δεν ενημερώθηκε επίσης: η ράμπα\.$/);
});

test('a chain that threw is unknown, not «did not follow»; it is one logError line', async () => {
  const { ctx, S } = load(new Error('boom'));
  await ctx.renderDailyOps();
  await ctx._opsStat(VS_EXP, 'In Transit');
  assert.strictEqual(last(S).t, 'warn');
  assert.match(last(S).m, /συγχρονισμός δεν ολοκληρώθηκε/);
  assert.ok(!/ακολούθησε/.test(last(S).m), last(S).m);
  assert.deepStrictEqual(S.errors, ['daily-ops: VS chain after the Veroia day ' + VS_EXP]);
});

test('no Veroia day written (already set, or not VS) → no chain, plain ✓', async () => {
  for (const id of [VS_SET, PLAIN]) {
    const { ctx, S } = load({ ok: false, failed: ['VS chain'] });
    await ctx.renderDailyOps();
    await ctx._opsStat(id, 'In Transit');
    const p = S.patches.find(x => x.t === 'tblO' && x.id === id);
    assert.ok(p && !('VS CD Date' in p.f), id);
    assert.strictEqual(S.syncCalls.length, 0, id);
    assert.strictEqual(last(S).m, 'Φορτώθηκε ✓', id);
  }
});
