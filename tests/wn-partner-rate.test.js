// Owner 4/10/2026 (§8.5): ONE partner rate for the whole round trip, written on
// the ΚΑΘΟΔΟΣ only. Migration 034 puts a matched national pair in one RT and
// sums national_loads.partner_rate per leg, so a rate on both legs counted
// twice. UNIT ONLY: helpers extracted verbatim from the module sources; the
// browser rig (tests/critics/wn-wave1-proof.js, «§8.5») checks the writes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const WN = src('modules/weekly_natl.js');
const PA = src('core/pa-helpers.js');
const pick = (s, re, name) => { const m = s.match(re); assert.ok(m, name + ' not found'); return m[0]; };

test('_wnPairRate: the ΚΑΘΟΔΟΣ rate wins; an ΑΝΟΔΟΣ-only rate (pre-4/10) is read as the round-trip rate; standalone rows keep their own', () => {
  const ctx = { WNATL: { data: { southnorth: [{ id: 'sn1', fields: { 'Partner Rate': 400 } }, { id: 'sn2', fields: {} }] } } };
  vm.runInNewContext(pick(WN, /function _wnPairRate\(row\) \{[\s\S]*?\n\}\n/, '_wnPairRate') + '\nthis.f=_wnPairRate;', ctx);
  assert.strictEqual(ctx.f({ partnerRate: '450', matchedId: 'sn1' }), '450');
  assert.strictEqual(ctx.f({ partnerRate: '', matchedId: 'sn1' }), '400');
  assert.strictEqual(ctx.f({ partnerRate: '', matchedId: 'sn2' }), '');
  assert.strictEqual(ctx.f({ partnerRate: '180' }), '180');           // standalone ΑΝΟΔΟΣ row
  assert.strictEqual(ctx.f({ partnerRate: '' }), '');
});

async function runPaUpsert(args, existing) {
  const calls = [];
  const ctx = {
    F: { PA_PARTNER: 'Partner', PA_ASSIGN_DATE: 'Assignment Date', PA_STATUS: 'Status', PA_NAT_LOAD: 'Nat Load', PA_ORDER: 'Order', PA_RATE: 'Partner Rate', PA_NOTES: 'Notes' },
    TABLES: { PARTNER_ASSIGN: 'PA' }, localToday: () => '2026-10-05',
    atGetAll: async () => existing, atPatch: async (t, id, f) => { calls.push(['PATCH', id, f]); return {}; },
    atCreate: async (t, f) => { calls.push(['POST', null, f]); return {}; },
  };
  vm.runInNewContext(PA + '\nthis.paUpsert=paUpsert;', ctx);
  await ctx.paUpsert(args);
  return calls;
}

test('paUpsert clearRate: writes Partner Rate = null on the existing ΑΝΟΔΟΣ row', async () => {
  const c = await runPaUpsert({ parentType: 'nat_load', parentId: 'sn1', partnerId: 'p1', rate: null, clearRate: true },
    [{ id: 'pa1', fields: { 'Nat Load': ['sn1'], 'Partner Rate': 400 } }]);
  assert.strictEqual(c.length, 1); assert.strictEqual(c[0][0], 'PATCH');
  assert.ok('Partner Rate' in c[0][2] && c[0][2]['Partner Rate'] === null);
});

test('paUpsert default (no clearRate): a null rate is NOT written — every other caller unchanged', async () => {
  const c = await runPaUpsert({ parentType: 'nat_load', parentId: 'sn1', partnerId: 'p1', rate: null },
    [{ id: 'pa1', fields: { 'Nat Load': ['sn1'], 'Partner Rate': 400 } }]);
  assert.ok(!('Partner Rate' in c[0][2]));
});

test('paUpsert: a real rate still wins over clearRate', async () => {
  const c = await runPaUpsert({ parentType: 'nat_load', parentId: 'n1', partnerId: 'p1', rate: 450, clearRate: true }, []);
  assert.strictEqual(c[0][0], 'POST'); assert.strictEqual(c[0][2]['Partner Rate'], 450);
});

test('popover save wiring: the matched ΑΝΟΔΟΣ is written with Partner Rate null and its PA row with clearRate', () => {
  const save = pick(WN, /async function _wnSaveFromPopover\(rowId\) \{[\s\S]*?\n\}\n/, '_wnSaveFromPopover');
  assert.match(save, /const snFields = isPartner \? Object\.assign\(\{\}, fields, \{ 'Partner Rate': null \}\) : fields;/);
  assert.match(save, /atSafePatch\(TABLES\.NAT_LOADS, row\.matchedId, _wnPlanFields\(snFields, /);
  assert.match(save, /rate: snOfPair \? null : rate, clearRate: snOfPair,/);
});

// ── the same pair, owner 4/10 Q7 + Q2/Q3/Q8 (one RT per pair under 034) ──────
test('_wnSnVehicleSwap (Q7): a different own vehicle on the ΑΝΟΔΟΣ is swapped to the ΚΑΘΟΔΟΣ one; same vehicle / none → null', () => {
  const ctx = { getLinkedId: v => (Array.isArray(v) ? v[0] : v) || null,
    WNATL: { data: { trucks: [{ id: 't1', label: 'ΚΖΗ 1001' }, { id: 't2', label: 'ΚΖΗ 1002' }], partners: [{ id: 'p1', label: 'Partner Co' }] } } };
  vm.runInNewContext(pick(WN, /function _wnSnVehicleSwap\(row, snF\) \{[\s\S]*?\n\}\n/, '_wnSnVehicleSwap') + '\nthis.f=_wnSnVehicleSwap;', ctx);
  const own = { saved: true, truckId: 't1', driverId: 'd1' };
  const sw = ctx.f(own, { Truck: ['t2'] });
  assert.ok(sw && sw.from === 'φορτηγό ΚΖΗ 1002' && sw.to === 'φορτηγό ΚΖΗ 1001');
  assert.strictEqual(JSON.stringify(sw.veh.Truck), '["t1"]'); assert.strictEqual(sw.veh['Partner Rate'], null); assert.strictEqual(JSON.stringify(sw.veh.Partner), '[]');   // vm realm: compare by JSON
  assert.strictEqual(ctx.f(own, { Truck: ['t1'] }), null);                 // same truck
  assert.strictEqual(ctx.f(own, {}), null);                                 // no vehicle → _wnVehicleForSn
  assert.strictEqual(ctx.f({ saved: false }, { Truck: ['t2'] }), null);     // ΚΑΘΟΔΟΣ without vehicle
  const ps = ctx.f({ saved: true, partnerId: 'p1', partnerPlates: 'ΙΑΒ 1' }, { Truck: ['t2'] });
  assert.ok(ps && ps.veh['Is Partner Trip'] === true && ps.veh.Partner[0] === 'p1' && ps.veh['Partner Rate'] === null);
  assert.strictEqual(ctx.f({ saved: true, partnerId: 'p1' }, { Partner: ['p1'] }), null);   // same partner
});

test('_wnUnmatch (Q2/Q3/Q8): match cleared on BOTH loads before the ΑΝΟΔΟΣ vehicle; no executed exception; Status via _wnUnplanFields', () => {
  const fn = pick(WN, /async function _wnUnmatch\(rowId, snId\) \{[\s\S]*?\n\}\n/, '_wnUnmatch');
  const iNs = fn.indexOf("atSafePatch(TABLES.NAT_LOADS, row.orderIds[0], { 'Matched Load': '' })");
  const iSn = fn.indexOf("atSafePatch(TABLES.NAT_LOADS, snId, { 'Matched Load': '' })");
  const iVeh = fn.indexOf('atSafePatch(TABLES.NAT_LOADS, snId, _wnUnplanFields(clr, stSn))');
  assert.ok(iNs > 0 && iSn > iNs && iVeh > iSn, 'order: ΚΑΘΟΔΟΣ match → ΑΝΟΔΟΣ match → ΑΝΟΔΟΣ vehicle');
  assert.ok(!/_wnExecuted\(stSn\)\)\s*left\s*=/.test(fn) && !/κρατά το όχημά της/.test(fn), 'no «executed keeps its vehicle» branch left');
  assert.match(fn, /_wnConfirmExecuted\(/);
});
