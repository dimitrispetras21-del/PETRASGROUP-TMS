// tests/load-group.test.js — run: node --test tests/load-group.test.js
// core/load-group.js (16/11/2026): the rules every screen uses to put a groupage together — join by the BASE of the
// Group ID, the order list from the member that has one, the places «Load Seq» (113) used only when complete and
// distinct, the earliest day of an order's points. And the driver sheet (print.html groupRoute) on that rule.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const LG = require('../core/load-group.js');

const plain = v => JSON.parse(JSON.stringify(v));
const rec = (id, f) => ({ id, fields: f || {} });

test('base: a member with the base only and one with the full text are the same load', () => {
  assert.strictEqual(LG.base('GRP-AB12|recA,recB'), 'GRP-AB12');
  assert.strictEqual(LG.base('GRP-AB12'), 'GRP-AB12');
  assert.strictEqual(LG.base(null), '');
  assert.ok(LG.sameLoad('GRP-AB12', 'GRP-AB12|recA,recB'));
  assert.ok(!LG.sameLoad('GRP-AB12', 'GRP-AB123|recA'), 'a base that is part of another base is another load');
  assert.ok(!LG.sameLoad('', ''), 'no group is never «the same load»');
});

test('order list: from the member that has one, never from a member left with the base', () => {
  assert.deepStrictEqual(plain(LG.orderList([rec('recA', { 'Group ID': 'GI-X' }), rec('recB', { 'Group ID': 'GI-X|recB,recA' })])), ['recB', 'recA']);
  assert.deepStrictEqual(plain(LG.orderList([rec('recA', { 'Group ID': 'GI-X' })])), []);
  assert.deepStrictEqual(plain(LG.orderList([])), []);
});

test('the facade filter asks «contains» the base; a quote falls back to the identical text', () => {
  assert.strictEqual(LG.membersFormula('GRP-AB12|recA,recB'), 'SEARCH(LOWER("GRP-AB12"), LOWER({Group ID}))');
  assert.strictEqual(LG.membersFormula(''), null);
  assert.strictEqual(LG.membersFormula("GI-O'X|recA"), "{Group ID}='GI-O\\'X|recA'");
  // the Worker's own translation of the term (formula-translate.js) accepts this shape
  const W = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');
  const re = W.match(/m = t\.match\((\/\^SEARCH[^\n]*?\/i)\);/);
  assert.ok(re, 'SEARCH term found in the Worker');
  assert.ok((0, eval)(re[1]).test(LG.membersFormula('GRP-AB12|recA')), 'the Worker translates the members filter');
});

test('readMembers keeps only the load\'s own members (base part of another base is dropped) and throws on a failed read', async () => {
  const ctx = { console, TABLES: { ORDERS: 'O' }, calls: [] };
  ctx.atGetAll = async (_t, o) => { ctx.calls.push(o.filterByFormula); if (ctx.fail) throw new Error('down');
    return [rec('a', { 'Group ID': 'GI-X' }), rec('b', { 'Group ID': 'GI-X|b,a' }), rec('c', { 'Group ID': 'GI-XY|c' })]; };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'core', 'load-group.js'), 'utf8'), ctx);
  const got = await ctx.LoadGroup.readMembers('GI-X|b,a');
  assert.deepStrictEqual(got.map(r => r.id), ['a', 'b']);
  assert.deepStrictEqual(ctx.calls, ['SEARCH(LOWER("GI-X"), LOWER({Group ID}))']);
  ctx.fail = true;
  await assert.rejects(ctx.LoadGroup.readMembers('GI-X'), /down/);
});

test('places: used only when every point has one and none twice; else null (the caller keeps its rule)', () => {
  assert.ok(LG.seqUsable([2, 1, 3]));
  assert.ok(LG.seqUsable(['2', '1']));
  assert.ok(!LG.seqUsable([]));
  assert.ok(!LG.seqUsable([1, null]));
  assert.ok(!LG.seqUsable([1, 1]));
  assert.ok(!LG.seqUsable([0, 1]));
  assert.ok(!LG.seqUsable([1.5, 2]));
  const pts = [{ k: 'x', s: 3 }, { k: 'y', s: 1 }, { k: 'z', s: 2 }];
  assert.deepStrictEqual(LG.sortBySeq(pts, p => p.s).map(p => p.k), ['y', 'z', 'x']);
  assert.strictEqual(LG.sortBySeq([{ s: 1 }, { s: null }], p => p.s), null);
  assert.strictEqual(LG.sortBySeq([{ s: 2 }, { s: 2 }], p => p.s), null);
});

test('the week\'s route: a groupage\'s orders follow the load\'s places, in the slots they hold; anything else stays', () => {
  const st = (type, seq) => ({ fields: { 'Stop Type': type, 'Load Seq': seq } });
  const exp = (id, gid, dSeqs) => ({ rec: rec(id, { Direction: 'Export', 'Group ID': gid }), stops: [st('Loading', 1)].concat(dSeqs.map(s => st('Unloading', s))) });
  const imp = { rec: rec('recI', { Direction: 'Import' }), stops: [st('Loading', null)] };
  // export: the deliveries decide — B delivers first (place 1), A second (2 and 3)
  const items = [exp('recA', 'GRP-X|recA,recB', [2, 3]), exp('recB', 'GRP-X', [1]), imp];
  assert.deepStrictEqual(LG.orderByLoad(items).map(x => x.rec.id), ['recB', 'recA', 'recI']);
  // places missing on one point: the trip's order as it came
  const half = [exp('recA', 'GRP-X|recA,recB', [2, null]), exp('recB', 'GRP-X', [1]), imp];
  assert.deepStrictEqual(LG.orderByLoad(half).map(x => x.rec.id), ['recA', 'recB', 'recI']);
  // an import load: the loadings decide
  const ld = (id, seq) => ({ rec: rec(id, { Direction: 'Import', 'Group ID': 'GI-Y' }), stops: [st('Loading', seq), st('Unloading', 1)] });
  assert.deepStrictEqual(LG.orderByLoad([ld('a', 2), ld('b', 1)]).map(x => x.rec.id), ['b', 'a']);
  // no groupage: untouched
  assert.deepStrictEqual(LG.orderByLoad([imp]).map(x => x.rec.id), ['recI']);
});

test('the order\'s day: the earliest of its points, not the first in the panel', () => {
  assert.strictEqual(LG.earliest(['2026-11-18', '2026-11-16', '']), '2026-11-16');
  assert.strictEqual(LG.earliest(['2026-11-18T08:00:00.000Z', '2026-11-17']), '2026-11-17');
  assert.strictEqual(LG.earliest(['2026-11-16', '2026-11-16T09:00']), '2026-11-16', 'the same day: the first one stays');
  assert.strictEqual(LG.earliest([null, '']), null);
  // the form writes it so (orders_intl.js): never «the first Loading point»
  const OI = fs.readFileSync(path.join(__dirname, '..', 'modules', 'orders_intl.js'), 'utf8');
  assert.match(OI, /fields\['Loading DateTime'\] = _ldEarly;/);
  assert.match(OI, /fields\['Delivery DateTime'\] = _udEarly;/);
  assert.doesNotMatch(OI, /fields\['Loading DateTime'\] = _firstLoad\.dateTime/);
});

// print.html loads no module except share-helpers / countries / load-group: its groupRoute is run here with the page's
// own dtKey / hasTime and a routeStops that hands the stops through.
function printGroupRoute() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'print.html'), 'utf8');
  assert.match(html, /<script src="core\/load-group\.js\?v=\d+"><\/script>/, 'print.html loads core/load-group.js');
  const fn = name => { const m = html.match(new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}\\n')); assert.ok(m, name); return m[0]; };
  const ctx = { LoadGroup: LG, veroiaOf: () => null, logged: [], printLogError: (e) => ctx.logged.push(e.message),
    routeStops: (f, stops) => ({
      loads: stops.filter(s => s.fields['Stop Type'] === 'Loading').map(s => ({ name: s.fields.n, dt: s.fields.DateTime, sf: s.fields })),
      dels: stops.filter(s => s.fields['Stop Type'] === 'Unloading').map(s => ({ name: s.fields.n, dt: s.fields.DateTime, sf: s.fields })) }) };
  vm.createContext(ctx);
  vm.runInContext([fn('hasTime'), fn('dtKey'), fn('groupRoute')].join('\n'), ctx);
  return ctx;
}
const pst = (type, n, dt, seq) => ({ fields: { 'Stop Type': type, n, DateTime: dt, 'Load Seq': seq } });
const names = r => plain({ loads: r.loads.map(x => x.e.name), dels: r.dels.map(x => x.e.name) });

test('driver sheet: the points follow «Load Seq» per side when usable', () => {
  const c = printGroupRoute();
  const items = [
    { orderRec: rec('A', {}), stops: [pst('Loading', 'Kalamata', '2026-11-16', 2), pst('Unloading', 'Wien', '2026-11-19', 2)] },
    { orderRec: rec('B', {}), stops: [pst('Loading', 'Veria', '2026-11-16', 1), pst('Unloading', 'Linz', '2026-11-19', 1)] },
  ];
  assert.deepStrictEqual(names(c.groupRoute(items, false, true)), { loads: ['Veria', 'Kalamata'], dels: ['Linz', 'Wien'] });
});

test('driver sheet: without usable places, today\'s rule exactly (export: loads by day, deliveries as listed)', () => {
  const c = printGroupRoute();
  const items = [
    { orderRec: rec('A', {}), stops: [pst('Loading', 'Kalamata', '2026-11-17', null), pst('Unloading', 'Wien', '2026-11-19', 1)] },
    { orderRec: rec('B', {}), stops: [pst('Loading', 'Veria', '2026-11-16', null), pst('Unloading', 'Linz', '2026-11-18', 1)] },
  ];
  // loadings: no places → by day; deliveries: place 1 twice → not usable → as listed (export)
  assert.deepStrictEqual(names(c.groupRoute(items, false, true)), { loads: ['Veria', 'Kalamata'], dels: ['Wien', 'Linz'] });
  // import: loadings as listed, deliveries by day
  assert.deepStrictEqual(names(c.groupRoute(items, false, false)), { loads: ['Kalamata', 'Veria'], dels: ['Linz', 'Wien'] });
  assert.deepStrictEqual(c.logged, []);
});

test('the form, the board and the week\'s route read the one rule (no second copy)', () => {
  const IG = fs.readFileSync(path.join(__dirname, '..', 'modules', 'orders_intl_group.js'), 'utf8');
  assert.match(IG, /function seqUsable\(vals\) \{ return LoadGroup\.seqUsable\(vals\); \}/);
  const OWV = fs.readFileSync(path.join(__dirname, '..', 'modules', 'orders_week_view.js'), 'utf8');
  assert.match(OWV, /LoadGroup\.orderByLoad\(/);
  assert.match(OWV, /RT_STOP_FIELDS = \(\) => \[[^\]]*F\.STOP_LOAD_SEQ\]/, 'the route reads «Load Seq»');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  const at = f => app.indexOf('src="' + f);
  assert.ok(at('core/load-group.js') > 0 && at('core/load-group.js') < at('core/rt-feed.js') && at('core/load-group.js') < at('core/wi4-logic.js'),
    'app.html loads core/load-group.js before its readers');
  // no screen joins a load by the identical Group ID text any more
  for (const f of ['modules/weekly_intl.js', 'modules/orders_intl_group.js', 'core/rt-feed.js'])
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /filterByFormula:\s*`\{Group ID\}='/, f);
});

test('Weekly: one partner fee per load — the rate and the partner row on the first member of the load only', async () => {
  const WI = fs.readFileSync(path.join(__dirname, '..', 'modules', 'weekly_intl.js'), 'utf8');
  const fn = (re, name) => { const m = WI.match(re); assert.ok(m, name); return m[0]; };
  const src = [
    fn(/function _wiGrpOrder\(exps,fallbackField\)\{[\s\S]*?\n\}\n/, '_wiGrpOrder'),
    fn(/function _wiGiSortRecs\(recs\)\{[\s\S]*?\n\}\n/, '_wiGiSortRecs'),
    fn(/function _wiLoadOrderIds\(type,ids\)\{[\s\S]*?\n\}\n/, '_wiLoadOrderIds'),
    fn(/function _wiRateMemberId\(row\)\{[^\n]*\}\n/, '_wiRateMemberId'),
    fn(/async function _wiCreatePartnerAssignments\(row\)\{[\s\S]*?\n\}\n/, '_wiCreatePartnerAssignments'),
  ].join('\n');
  const ups = [];
  const ctx = { console, LoadGroup: LG, WI4: require('../core/wi4-logic.js'), paUpsert: async a => { ups.push([a.parentId, a.rate]); },
    WINTL: { data: { imports: [], exports: [
      rec('recA', { 'Group ID': 'GRP-X|recB,recA', 'Delivery DateTime': '2026-11-18' }),
      rec('recB', { 'Group ID': 'GRP-X', 'Delivery DateTime': '2026-11-19' }),
      rec('recI', { 'Partner Rate': 900 }) ] } } };
  vm.createContext(ctx);
  vm.runInContext(src + '\nObject.assign(this,{_wiRateMemberId,_wiCreatePartnerAssignments});', ctx);
  const row = { type: 'export', orderIds: ['recA', 'recB'], importId: 'recI', partnerId: 'recP', partnerRate: '1200', partnerRateImp: '900' };
  // the list (recB first) decides, even though recA is the row's lead and delivers earlier
  assert.strictEqual(ctx._wiRateMemberId(row), 'recB');
  await ctx._wiCreatePartnerAssignments(row);
  assert.deepStrictEqual(plain(ups), [['recB', '1200'], ['recI', '900']]);
  // the assignment save writes the fee on that member only
  assert.match(WI, /const pp=await _wiPlanPatch\(orderId,orderId===rateId\?expFields:\{\.\.\.fields\}\);/);
});
