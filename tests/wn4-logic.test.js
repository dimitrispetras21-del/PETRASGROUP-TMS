// tests/wn4-logic.test.js — run: node --test tests/wn4-logic.test.js
// core/wn4-logic.js (Weekly National v4 plan rev 6, WP4): §3.5 node line 2
// (hr / hs), §4.3 flags (PAIR_SPLIT, INTL_NOT_VS, dirOf; INTL_NO_TRUCK only
// information; no collapse rule), §2.4 dateEditable, §4.4β returnCandidates,
// §6.1. Zero dependencies. Days are Athens days, as in the browser.
'use strict';
process.env.TZ = 'Europe/Athens';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const WN4 = require('../core/wn4-logic.js');
const WI4 = require('../core/wi4-logic.js');
const { OrdersCommon } = require('../core/orders-common.js');

const VER = 'recVEROIA';
const T = '2026-10-13'; // a Tuesday
const add = (d, n) => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)); return t.toISOString().slice(0, 10); };
const dt = (d) => (d ? d + 'T12:00:00.000Z' : undefined);
const codes = (r) => r.reasons.map((x) => x.code);
const reasonOf = (r, code) => r.reasons.find((x) => x.code === code);
// The facade omits NULL columns (trap 2): build records without the keys we do not set.
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// A national load. dir 'down' = ΚΑΘΟΔΟΣ (North→South), 'up' = ΑΝΟΔΟΣ.
function nl({ dir = 'down', load, del, truck, driver, trailer, partner, rate, status = 'Pending', src = 'Direct' } = {}) {
  return clean({
    Direction: dir === 'up' ? 'South→North' : 'North→South', 'Source Type': src, Status: status,
    'Loading DateTime': dt(load), 'Delivery DateTime': dt(del),
    Truck: truck ? [truck] : undefined, Driver: driver ? [driver] : undefined, Trailer: trailer ? [trailer] : undefined,
    Partner: partner ? [partner] : undefined, 'Partner Rate': rate,
  });
}
// An international order as the Worker answers it: the cross-dock ONLY as 'VS CD Date'.
function intl({ dir = 'Import', load, del, cd, vs = true, grp, status = 'Pending', invoiced, truck, partner } = {}) {
  return clean({
    Direction: dir, 'Loading DateTime': dt(load), 'Delivery DateTime': dt(del), 'VS CD Date': cd,
    'Veroia Switch': vs === undefined ? undefined : vs, 'National Groupage': grp, Status: status, Invoiced: invoiced,
    Truck: truck ? [truck] : undefined, Partner: partner ? [partner] : undefined,
  });
}
const stop = (type, d, loc = VER, n = 1) => ({ id: 'st' + n, fields: clean({ 'Stop Type': type, Location: [loc], DateTime: dt(d), 'Stop Number': n }) });

// A healthy VS ΚΑΘΟΔΟΣ: intl delivers Wed 14/10, Veroia (cross-dock) Tue 13/10.
function downLeg(o = {}) {
  const cd = o.cd === undefined ? '2026-10-13' : o.cd;
  const natLoad = o.natLoad === undefined ? cd : o.natLoad;
  return {
    nl: nl(Object.assign({ dir: 'down', load: natLoad, del: '2026-10-14' }, o.nl)),
    intl: o.intl === null ? null : intl(Object.assign({ dir: 'Import', load: '2026-10-09', del: '2026-10-14', cd }, o.intlF)),
    intlState: o.intlState,
    hubStops: o.hubStops === undefined ? [stop('Loading', o.hs === undefined ? natLoad : o.hs), stop('Unloading', '2026-10-14', 'recCUST', 2)] : o.hubStops,
    hubState: o.hubState,
    veroiaLoc: VER,
    needsLocal: o.needsLocal,
  };
}
// A healthy VS ΑΝΟΔΟΣ: intl (export) loads Thu 15/10 at the supplier, Veroia Fri 16/10.
function upLeg(o = {}) {
  const cd = o.cd === undefined ? '2026-10-16' : o.cd;
  const natDel = o.natDel === undefined ? cd : o.natDel;
  return {
    nl: nl(Object.assign({ dir: 'up', load: '2026-10-15', del: natDel }, o.nl)),
    intl: o.intl === null ? null : intl(Object.assign({ dir: 'Export', load: '2026-10-15', del: '2026-10-19', cd }, o.intlF)),
    intlState: o.intlState,
    hubStops: o.hubStops === undefined ? [stop('Loading', '2026-10-15', 'recSUPP', 1), stop('Unloading', o.hs === undefined ? natDel : o.hs, VER, 2)] : o.hubStops,
    hubState: o.hubState,
    veroiaLoc: VER,
  };
}
const own = { truck: 'recT1', driver: 'recD1', trailer: 'recR1' };
// A partner with the trip rate: no EMPTY_RETURN (one way is a fact) and no NO_RATE,
// so a test of the node sees only the node.
const carrier = { partner: 'recP1', rate: 400 };

// ─── load: node and browser ────────────────────────────────────────────
test('loads as a node module and as a browser global (only window.WN4), frozen', () => {
  assert.ok(Object.isFrozen(WN4));
  assert.strictEqual(typeof WN4.flags, 'function');
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const before = new Set(Object.keys(ctx));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/wn4-logic.js'), 'utf8'), ctx, { filename: 'core/wn4-logic.js' });
  assert.deepStrictEqual(Object.keys(ctx).filter((k) => !before.has(k)), ['WN4']);
});

test('at load it defines WN4 only: no listener, timer, observer or fetch', () => {
  const calls = [];
  const rec = (name) => () => { calls.push(name); };
  const ctx = { console, addEventListener: rec('addEventListener'), setTimeout: rec('setTimeout'), setInterval: rec('setInterval'),
    requestAnimationFrame: rec('requestAnimationFrame'), fetch: rec('fetch'), MutationObserver: function () { calls.push('MutationObserver'); },
    document: { addEventListener: rec('document.addEventListener') } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/wn4-logic.js'), 'utf8'), ctx);
  assert.deepStrictEqual(calls, []);
});

test('browser: dependencies are resolved when a function runs, and a missing one is loud', () => {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/wn4-logic.js'), 'utf8'), ctx);
  // Wrong script order: never a silent «no flags».
  assert.throws(() => ctx.WN4.rowDay(nl({ load: T })), /VsDates is not loaded/);
  for (const f of ['core/wi4-logic.js', 'core/vs-dates.js', 'core/orders-common.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  const r = ctx.WN4.flags({ kind: 'trip', desc: downLeg(), asc: null }, T);
  assert.strictEqual(JSON.stringify(r.reasons.map((x) => x.code)), '["NO_TRUCK"]');
  assert.strictEqual(ctx.WN4.dateEditable(nl({ load: T, del: add(T, 1) }), intl({ del: add(T, 1), cd: T })).ok, true);
});

test('the labels it reads are config.js F.STOP_* / F.CL_* (a rename there fails here)', () => {
  const cfg = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
  const val = (k) => { const m = new RegExp(k + ":\\s*'([^']+)'").exec(cfg); assert.ok(m, k); return m[1]; };
  const src = fs.readFileSync(path.join(ROOT, 'core/wn4-logic.js'), 'utf8');
  for (const [k, label] of [['STOP_TYPE', 'Stop Type'], ['STOP_LOCATION', 'Location'], ['STOP_DATETIME', 'DateTime'], ['STOP_NUMBER', 'Stop Number']]) {
    assert.strictEqual(val(k), label, k);
    assert.ok(src.includes(`'${label}'`), label);
  }
  assert.strictEqual(val('CL_KATHODOS'), 'North→South');
  assert.strictEqual(val('CL_ANODOS'), 'South→North');
});

test('never reads the cross-dock as «Cross-dock Date» (the Worker answers only «VS CD Date»)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core/wn4-logic.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.ok(!src.includes('Cross-dock Date'));
});

// ─── dirOf (PLAN §2.4 datapath-6) ──────────────────────────────────────
test('dirOf: the international Direction wins; else the national arrow; else null', () => {
  assert.strictEqual(WN4.dirOf(nl({ dir: 'up' }), null), 'Export');
  assert.strictEqual(WN4.dirOf(nl({ dir: 'down' }), null), 'Import');
  assert.strictEqual(WN4.dirOf(nl({ dir: 'up' }), {}), 'Export', 'Direction absent from the answer');
  assert.strictEqual(WN4.dirOf(nl({ dir: 'down' }), { Direction: 'Export' }), 'Export', 'the order decides');
  assert.strictEqual(WN4.dirOf(nl({ dir: 'up' }), { Direction: 'Import' }), 'Import');
  assert.strictEqual(WN4.dirOf({ Direction: 'ΑΝΟΔΟΣ' }, null), null, 'Greek words belong to CONSOLIDATED LOADS');
  assert.strictEqual(WN4.dirOf({}, { Direction: 'export' }), null);
  assert.strictEqual(WN4.dirOf(null, null), null);
});

test('dirOf: a South→North load with no international Direction → Export → its hub and the «before loading» question', () => {
  const leg = upLeg({ intlF: { dir: undefined }, cd: '2026-10-14', natDel: '2026-10-14' });
  delete leg.intl.Direction;
  const ln = WN4.hubLine(leg);
  // Veroia Wed 14/10 is BEFORE the supplier loading Thu 15/10: does not hold.
  assert.strictEqual(ln.dir, 'Export');
  assert.strictEqual(ln.f, '2026-10-14');
  assert.strictEqual(ln.code, 'DATE_MISMATCH');
  assert.strictEqual(ln.text, 'Βέροια Τετ 14/10 · φόρτωση Πέμ 15/10');
  // Read as an import (the bug dirOf prevents) it would never be asked.
  const VsDates = require('../core/vs-dates.js');
  assert.strictEqual(VsDates.vsHubBad('Import', dt('2026-10-15'), dt('2026-10-19'), '2026-10-14'), false);
  assert.strictEqual(VsDates.vsHubBad('Export', dt('2026-10-15'), dt('2026-10-19'), '2026-10-14'), true);
});

// ─── hubLine: the §3.5 table ───────────────────────────────────────────
test('§3.5 all equal → nothing (no «διεθνές στη Βέροια» line, owner 21:10)', () => {
  assert.strictEqual(WN4.hubLine(downLeg()), null);
  assert.strictEqual(WN4.hubLine(upLeg()), null);
  // A cross-dock 2 days from the delivery is the dispatcher's day, kept as it is.
  assert.strictEqual(WN4.hubLine(downLeg({ cd: '2026-10-12' })), null);
  // The same day as the delivery is allowed without a question.
  assert.strictEqual(WN4.hubLine(downLeg({ cd: '2026-10-14' })), null);
  // Empty cross-dock: the ±1 estimate is the hub (delivery − 1).
  assert.strictEqual(WN4.hubLine(downLeg({ cd: null, natLoad: '2026-10-13' })), null);
});

test('§3.5 hr ≠ f → red «το εθνικό δεν ακολούθησε», Ξαναδοκίμασε + Επαναφορά', () => {
  const ln = WN4.hubLine(downLeg({ cd: '2026-10-13', natLoad: '2026-10-11', hs: '2026-10-11' }));
  assert.strictEqual(ln.code, 'HUB_NOT_FOLLOWED');
  assert.strictEqual(ln.tone, 'red');
  assert.strictEqual(ln.text, 'το εθνικό δεν ακολούθησε: διεθνές Τρί 13/10 · εθνικό Κυρ 11/10');
  assert.deepStrictEqual(ln.acts, ['retry', 'revert']);
  assert.strictEqual(ln.hr, '2026-10-11');
  assert.strictEqual(ln.f, '2026-10-13');
  // The stop that stayed with the line is part of the same retry, not a second item.
  assert.deepStrictEqual(ln.all, ['HUB_NOT_FOLLOWED']);
});

test('§3.5 hr = f but hs ≠ f → red «η στάση Βέροιας δεν ακολούθησε», only Ξαναδοκίμασε (also after a reload)', () => {
  const ln = WN4.hubLine(downLeg({ hs: '2026-10-11' }));
  assert.strictEqual(ln.code, 'HUB_STOP_NOT_FOLLOWED');
  assert.strictEqual(ln.tone, 'red');
  assert.strictEqual(ln.text, 'η στάση Βέροιας δεν ακολούθησε: Κυρ 11/10 — η Ράμπα τη δείχνει εκεί');
  assert.deepStrictEqual(ln.acts, ['retry']);
  // hr and hs are judged separately.
  assert.strictEqual(ln.hr, ln.f);
  // ΑΝΟΔΟΣ: the Veroia stop is its Unloading stop.
  assert.strictEqual(WN4.hubLine(upLeg({ hs: '2026-10-17' })).code, 'HUB_STOP_NOT_FOLLOWED');
  // A Loading stop at Veroia on an ΑΝΟΔΟΣ is not its Veroia stop.
  const wrongType = upLeg({ hubStops: [stop('Loading', '2026-10-16')] });
  assert.strictEqual(WN4.hubLine(wrongType).code, 'HUB_STOP_NOT_FOLLOWED');
  // Read worked, no Veroia stop at all → said, never «fine».
  const none = WN4.hubLine(downLeg({ hubStops: [stop('Unloading', '2026-10-14', 'recCUST')] }));
  assert.strictEqual(none.code, 'HUB_STOP_NOT_FOLLOWED');
  assert.match(none.text, /λείπει/);
  // Two Veroia stops: both must follow.
  const two = downLeg({ hubStops: [stop('Loading', '2026-10-13', VER, 1), stop('Loading', '2026-10-12', VER, 2)] });
  assert.strictEqual(WN4.hubLine(two).hs, '2026-10-12');
});

test('§3.5 vsHubBad → amber, with the text of each direction', () => {
  // ΚΑΘΟΔΟΣ: loads in Veroia Thu 15/10 after delivering Wed 14/10.
  const d = WN4.hubLine(downLeg({ cd: '2026-10-15' }));
  assert.strictEqual(d.code, 'DATE_MISMATCH');
  assert.strictEqual(d.tone, 'amber');
  assert.strictEqual(d.text, 'φορτώνει Πέμ 15/10 · παράδοση Τετ 14/10');
  // ΑΝΟΔΟΣ (export): Veroia Wed 14/10 before the loading Thu 15/10.
  const u = WN4.hubLine(upLeg({ cd: '2026-10-14' }));
  assert.strictEqual(u.code, 'DATE_MISMATCH');
  assert.strictEqual(u.text, 'Βέροια Τετ 14/10 · φόρτωση Πέμ 15/10');
});

test('§3.5 unread → grey, never «fine»: the order, or the Veroia stop', () => {
  for (const leg of [downLeg({ intl: null }), downLeg({ intlState: 'err' }), downLeg({ intlState: 'ok', intl: null })]) {
    const ln = WN4.hubLine(leg);
    assert.strictEqual(ln.code, 'INTL_UNKNOWN');
    assert.strictEqual(ln.tone, 'grey');
    assert.strictEqual(ln.text, 'διεθνές: δεν φορτώθηκε');
  }
  for (const leg of [downLeg({ hubState: 'err' }), downLeg({ hubStops: null }), Object.assign(downLeg(), { veroiaLoc: '' })]) {
    const ln = WN4.hubLine(leg);
    assert.strictEqual(ln.code, 'HUB_STOP_UNKNOWN');
    assert.strictEqual(ln.text, 'στάση Βέροιας: δεν φορτώθηκε');
  }
  // An unread stop does not hide a line that did not follow.
  assert.strictEqual(WN4.hubLine(downLeg({ natLoad: '2026-10-11', hubState: 'err' })).code, 'HUB_NOT_FOLLOWED');
});

test('§3.5 only Source Type Direct: groupage and national-order loads never get line 2', () => {
  for (const src of ['Groupage', 'National', undefined]) {
    const leg = downLeg({ natLoad: '2026-10-01', nl: { src } });
    if (src === undefined) delete leg.nl['Source Type'];
    assert.strictEqual(WN4.hubLine(leg), null, String(src));
    assert.deepStrictEqual(codes(WN4.flags({ kind: 'trip', desc: Object.assign(leg, { nl: Object.assign(leg.nl, { Partner: ['recP1'], 'Partner Rate': 400 }) }) }, T)), [], String(src));
  }
});

test('INTL_NOT_VS: VS absent from the answer is NOT VS; VS false; groupage; the order gone', () => {
  const a = downLeg(); delete a.intl['Veroia Switch'];
  const b = downLeg({ intlF: { vs: false } });
  const c = downLeg({ intlF: { grp: true } });
  const d = downLeg({ intlState: 'missing', intl: null });
  for (const leg of [a, b, c]) {
    const ln = WN4.hubLine(leg);
    assert.strictEqual(ln.code, 'INTL_NOT_VS');
    assert.strictEqual(ln.tone, 'red');
    assert.strictEqual(ln.text, 'το διεθνές δεν είναι πια VS — το εθνικό έμεινε');
  }
  assert.strictEqual(WN4.hubLine(d).code, 'INTL_NOT_VS');
  assert.match(WN4.hubLine(d).text, /δεν βρέθηκε/);
  // 'Veroia Switch': 1 is not === true.
  assert.strictEqual(WN4.hubLine(downLeg({ intlF: { vs: 1 } })).code, 'INTL_NOT_VS');
  // A red flag of the row, with retry.
  const r = WN4.flags({ kind: 'trip', desc: Object.assign(b, { nl: Object.assign(b.nl, { Truck: ['recT1'] }) }) }, T);
  assert.strictEqual(reasonOf(r, 'INTL_NOT_VS').level, 'red');
  assert.strictEqual(reasonOf(r, 'INTL_NOT_VS').act, 'retry');
});

test('hubLine reads the cross-dock only through cdOf (VS CD Date): a 2-day gap is not red', () => {
  // The server answers cross_dock_date only as «VS CD Date»; a reader of
  // «Cross-dock Date» would see the estimate (Tue 13/10) and call Mon 12/10 red.
  const leg = downLeg({ cd: '2026-10-12' });
  assert.strictEqual(leg.intl['Cross-dock Date'], undefined);
  assert.strictEqual(WN4.hubLine(leg), null);
});

// ─── flags ─────────────────────────────────────────────────────────────
test('NO_TRUCK: red today and tomorrow, amber beyond, never nothing; past and no date are red', () => {
  const lv = (load) => reasonOf(WN4.flags({ kind: 'trip', desc: downLeg({ cd: load, natLoad: load, intlF: { del: add(load, 1) }, nl: { del: add(load, 1) } }) }, T), 'NO_TRUCK');
  assert.strictEqual(lv(T).level, 'red');
  assert.strictEqual(lv(add(T, 1)).level, 'red');
  assert.strictEqual(lv(add(T, 2)).level, 'amber');
  // «the amber flag never goes quiet far away»
  assert.strictEqual(lv(add(T, 30)).level, 'amber');
  assert.strictEqual(lv(add(T, -3)).level, 'red');
  assert.strictEqual(lv(T).text, 'χωρίς φορτηγό');
  assert.strictEqual(lv(T).act, 'assign');
  const undated = WN4.flags({ kind: 'trip', desc: { nl: nl({ src: 'National' }) } }, T);
  assert.strictEqual(reasonOf(undated, 'NO_TRUCK').level, 'red');
  assert.strictEqual(reasonOf(undated, 'NO_TRUCK').date, null);
});

test('today–tomorrow counts CALENDAR days: Friday → Saturday red, Sunday amber (owner 11/10)', () => {
  const FRI = '2026-10-16';
  const at = (d) => reasonOf(WN4.flags({ kind: 'lone', asc: { nl: nl({ dir: 'up', load: d, del: d, src: 'National' }) } }, FRI), 'NO_TRUCK').level;
  assert.strictEqual(at('2026-10-17'), 'red');   // Saturday
  assert.strictEqual(at('2026-10-18'), 'amber'); // Sunday
  assert.strictEqual(at('2026-10-19'), 'amber'); // Monday of W+1
});

test('a lone ΑΝΟΔΟΣ carries its own assignment; a matched ΑΝΟΔΟΣ under an assigned ΚΑΘΟΔΟΣ is not a second NO_TRUCK', () => {
  assert.deepStrictEqual(codes(WN4.flags({ kind: 'lone', asc: upLeg() }, T)), ['NO_TRUCK']);
  assert.deepStrictEqual(codes(WN4.flags({ kind: 'lone', asc: upLeg({ nl: own }) }, T)), []);
  const both = WN4.flags({ kind: 'trip', desc: downLeg(), asc: upLeg() }, T);
  assert.deepStrictEqual(codes(both), ['NO_TRUCK'], 'one row, one assignment');
});

test('a cancelled load owes nothing', () => {
  assert.deepStrictEqual(codes(WN4.flags({ kind: 'trip', desc: downLeg({ nl: { status: 'Cancelled' }, natLoad: '2026-10-01' }) }, T)), []);
});

test('EMPTY_RETURN: own truck, ΚΑΘΟΔΟΣ without ΑΝΟΔΟΣ — nothing while R > today+2, amber R−2..R, red after R', () => {
  const er = (del) => reasonOf(WN4.flags({ kind: 'trip', desc: { nl: nl({ load: add(del, -1), del, src: 'National', ...own }) }, asc: null, returnPlace: 'Πάτρα' }, T), 'EMPTY_RETURN');
  assert.strictEqual(er(add(T, 3)), undefined);
  assert.strictEqual(er(add(T, 2)).level, 'amber');
  assert.strictEqual(er(T).level, 'amber');
  assert.strictEqual(er(add(T, -1)).level, 'red');
  assert.strictEqual(er(add(T, -1)).age, 1);
  assert.strictEqual(er(T).text, 'κενό γύρισμα · από Τρί 13/10 · Πάτρα');
  assert.strictEqual(er(T).date, T);
  assert.strictEqual(er(T).group, 'cost');
  assert.strictEqual(er(T).act, 'newSn');
  // A partner never: one way is a fact.
  const p = WN4.flags({ kind: 'trip', desc: { nl: nl({ load: T, del: T, src: 'National', partner: 'recP1', rate: 400 }) } }, T);
  assert.strictEqual(reasonOf(p, 'EMPTY_RETURN'), undefined);
  // With an ΑΝΟΔΟΣ, never.
  const m = WN4.flags({ kind: 'trip', desc: { nl: nl({ load: T, del: T, src: 'National', ...own }) }, asc: { nl: nl({ dir: 'up', load: add(T, 1), del: add(T, 1), src: 'National', ...own }) } }, T);
  assert.strictEqual(reasonOf(m, 'EMPTY_RETURN'), undefined);
  // No R = amber (we know it comes back empty, not since when).
  const noR = WN4.flags({ kind: 'trip', desc: { nl: nl({ load: T, src: 'National', ...own }) } }, T);
  assert.strictEqual(reasonOf(noR, 'EMPTY_RETURN').level, 'amber');
});

test('NO_RATE: a partner without the trip rate; the ΑΝΟΔΟΣ rate counts (one rate per trip); 0 is no rate', () => {
  const desc = (rate) => ({ nl: nl({ load: add(T, 3), del: add(T, 3), src: 'National', partner: 'recP1', rate }) });
  assert.strictEqual(reasonOf(WN4.flags({ kind: 'trip', desc: desc() }, T), 'NO_RATE').level, 'amber');
  assert.strictEqual(reasonOf(WN4.flags({ kind: 'trip', desc: desc(0) }, T), 'NO_RATE').text, 'χωρίς κόμιστρο');
  assert.strictEqual(reasonOf(WN4.flags({ kind: 'trip', desc: desc(450) }, T), 'NO_RATE'), undefined);
  const withAsc = { kind: 'trip', desc: desc(), asc: { nl: nl({ dir: 'up', load: add(T, 4), del: add(T, 4), src: 'National', partner: 'recP1', rate: 450 }) } };
  assert.strictEqual(reasonOf(WN4.flags(withAsc, T), 'NO_RATE'), undefined);
  // Own truck: no rate is asked.
  assert.strictEqual(reasonOf(WN4.flags({ kind: 'trip', desc: { nl: nl({ load: add(T, 3), src: 'National', ...own }) } }, T), 'NO_RATE'), undefined);
  assert.strictEqual(WN4.pairRate({ 'Partner Rate': 300 }, { 'Partner Rate': 450 }), '300');
  assert.strictEqual(WN4.pairRate({}, { 'Partner Rate': 450 }), '450');
  assert.strictEqual(WN4.pairRate(null, null), '');
});

test('NO_LOCAL_DRIVER: by the local move\'s own day when given, else the leg\'s', () => {
  const r = WN4.flags({ kind: 'trip', desc: Object.assign(downLeg({ nl: own }), { needsLocal: add(T, 5) }) }, T);
  assert.strictEqual(reasonOf(r, 'NO_LOCAL_DRIVER').date, add(T, 5));
  assert.strictEqual(reasonOf(r, 'NO_LOCAL_DRIVER').level, 'amber');
  assert.strictEqual(reasonOf(r, 'NO_LOCAL_DRIVER').text, 'χρειάζεται τοπικό');
  const r2 = WN4.flags({ kind: 'trip', desc: Object.assign(downLeg({ nl: own }), { needsLocal: true }) }, T);
  assert.strictEqual(reasonOf(r2, 'NO_LOCAL_DRIVER').date, T);
  assert.strictEqual(reasonOf(r2, 'NO_LOCAL_DRIVER').level, 'red');
});

test('PAIR_SPLIT: truck, driver and partner each on their own; trailer is not compared; equal is quiet', () => {
  const pair = (a, b) => WN4.flags({ kind: 'trip', desc: downLeg({ nl: a }), asc: upLeg({ nl: b }) }, T);
  assert.deepStrictEqual(codes(pair(own, own)), []);
  const truck = reasonOf(pair(own, Object.assign({}, own, { truck: 'recT2' })), 'PAIR_SPLIT');
  assert.deepStrictEqual(truck.diff, ['truck']);
  assert.strictEqual(truck.text, 'μισό ζευγάρι: άλλο φορτηγό στην άνοδο');
  assert.deepStrictEqual(reasonOf(pair(own, Object.assign({}, own, { driver: 'recD2' })), 'PAIR_SPLIT').diff, ['driver']);
  assert.deepStrictEqual(reasonOf(pair({ partner: 'recP1', rate: 400 }, { partner: 'recP2' }), 'PAIR_SPLIT').diff, ['partner']);
  // Half pair: the ΚΑΘΟΔΟΣ written, the ΑΝΟΔΟΣ still empty — survives a reload.
  assert.deepStrictEqual(reasonOf(pair(own, {}), 'PAIR_SPLIT').diff, ['truck', 'driver']);
  assert.deepStrictEqual(codes(pair(own, Object.assign({}, own, { trailer: 'recR9' }))), []);
  // Red today–tomorrow (the row's day), amber beyond — the NO_TRUCK grammar.
  assert.strictEqual(reasonOf(pair(own, {}), 'PAIR_SPLIT').level, 'red');
  assert.strictEqual(reasonOf(pair(own, {}), 'PAIR_SPLIT').act, 'assign');
});

test('INTL_NO_TRUCK is information only: never a reason, a day count or a queue item', () => {
  const leg = downLeg({ nl: carrier }); // the order has no truck and no partner
  const r = WN4.flags({ kind: 'trip', desc: leg }, T);
  assert.deepStrictEqual(codes(r), []);
  assert.strictEqual(r.level, null);
  assert.deepStrictEqual(WN4.dayCounts([{ kind: 'trip', desc: leg }], T).byCode, {});
  assert.deepStrictEqual(WN4.items({ kind: 'trip', desc: leg }, T, { key: 'nl1' }), []);
  assert.ok(!Object.keys(WN4.ACT).includes('INTL_NO_TRUCK'));
  assert.deepStrictEqual(WN4.intlInfo(leg.intl), { noTruck: true, text: 'το διεθνές δεν έχει φορτηγό' });
  assert.deepStrictEqual(WN4.intlInfo(intl({ truck: 'recT9' })), { noTruck: false, text: '' });
  assert.deepStrictEqual(WN4.intlInfo(intl({ partner: 'recP9' })), { noTruck: false, text: '' });
  assert.deepStrictEqual(WN4.intlInfo(null, 'err'), { noTruck: false, text: '' });
});

test('the node reasons ride the rail: hub red, the bad-day amber (red when its earliest day is today–tomorrow)', () => {
  const nf = WN4.flags({ kind: 'trip', desc: downLeg({ nl: carrier, natLoad: '2026-10-11', hs: '2026-10-11' }) }, T);
  assert.strictEqual(reasonOf(nf, 'HUB_NOT_FOLLOWED').level, 'red');
  assert.strictEqual(reasonOf(nf, 'HUB_NOT_FOLLOWED').side, 'desc');
  assert.strictEqual(nf.lines.desc.code, 'HUB_NOT_FOLLOWED');
  const st = WN4.flags({ kind: 'trip', desc: downLeg({ nl: carrier, hs: '2026-10-11' }) }, T);
  assert.deepStrictEqual(codes(st), ['HUB_STOP_NOT_FOLLOWED']);
  // ΚΑΘΟΔΟΣ delivering Wed 14/10 (tomorrow) with Veroia Thu 15/10: red.
  const bad = WN4.flags({ kind: 'trip', desc: downLeg({ nl: carrier, cd: '2026-10-15' }) }, T);
  assert.strictEqual(reasonOf(bad, 'DATE_MISMATCH').level, 'red');
  assert.strictEqual(reasonOf(bad, 'DATE_MISMATCH').date, '2026-10-14');
  assert.strictEqual(reasonOf(bad, 'DATE_MISMATCH').text, 'Βέροια μετά την παράδοση');
  // The same, three weeks out: amber, never quiet.
  const far = WN4.flags({ kind: 'trip', desc: downLeg({ nl: carrier, cd: '2026-10-15' }) }, '2026-09-20');
  assert.strictEqual(reasonOf(far, 'DATE_MISMATCH').level, 'amber');
  // ΑΝΟΔΟΣ words.
  const up = WN4.flags({ kind: 'lone', asc: upLeg({ nl: own, cd: '2026-10-14' }) }, '2026-09-20');
  assert.strictEqual(reasonOf(up, 'DATE_MISMATCH').text, 'Βέροια πριν τη φόρτωση');
  // Grey line 2 is not a row reason (its read failure is one board item).
  const grey = WN4.flags({ kind: 'trip', desc: downLeg({ nl: carrier, intl: null }) }, T);
  assert.deepStrictEqual(codes(grey), []);
  assert.strictEqual(grey.lines.desc.code, 'INTL_UNKNOWN');
});

test('sourceReasons: one board item per failed read; W+1 «—», never 0', () => {
  assert.deepStrictEqual(WN4.sourceReasons({}), []);
  const all = WN4.sourceReasons({ intlState: 'err', hubState: 'err', w1State: 'err', localsFailed: true });
  assert.deepStrictEqual(all.map((r) => r.source), ['intl', 'hub', 'w1', 'locals']);
  assert.ok(all.every((r) => r.code === 'SOURCE_UNKNOWN' && r.level === 'amber' && /δεν σημαίνει ότι δεν υπάρχουν/.test(r.text)));
  assert.strictEqual(WN4.w1Count('err', 0).text, '—');
  assert.strictEqual(WN4.w1Count(undefined, 3).text, '—');
  assert.strictEqual(WN4.w1Count('loading', 0).text, '…');
  assert.strictEqual(WN4.w1Count('ok', 0).text, '0');
  assert.strictEqual(WN4.w1Count('ok', 4).text, '4');
});

// ─── one source: rails = day headers = queue ───────────────────────────
test('one source: the reasons of the rails = the day counts = the queue', () => {
  const week = [
    { date: T, facts: [
      { kind: 'trip', desc: downLeg() },                                                    // NO_TRUCK
      { kind: 'trip', desc: downLeg({ nl: carrier, natLoad: '2026-10-11', hs: '2026-10-11' }) }, // HUB_NOT_FOLLOWED
      { kind: 'trip', desc: downLeg({ nl: own }), asc: upLeg({ nl: {} }) },                  // PAIR_SPLIT
    ] },
    { date: add(T, 2), facts: [
      { kind: 'lone', asc: upLeg({ nl: own, cd: '2026-10-14' }) },                           // DATE_MISMATCH
      { kind: 'trip', desc: { nl: nl({ load: add(T, 1), del: add(T, 2), src: 'National', partner: 'recP1' }) } }, // NO_RATE
    ] },
  ];
  let rails = 0, heads = 0;
  const q = [];
  week.forEach((d, i) => {
    d.facts.forEach((f, j) => { rails += WN4.flags(f, T).reasons.length; q.push(...WN4.items(f, T, { key: `nl${i}${j}`, rowKey: `${i}-${j}` })); });
    const c = WN4.dayCounts(d.facts, T);
    heads += Object.values(c.byCode).reduce((s, n) => s + n, 0);
    assert.strictEqual(c.trips, d.facts.length);
  });
  const ordered = WN4.queue(q, T);
  assert.strictEqual(rails, 5);
  assert.strictEqual(heads, rails);
  assert.strictEqual(ordered.length, rails);
  // WI4's ordering: red before amber, stop before cost before look.
  // (The ΑΝΟΔΟΣ reaches Veroia Wed 14/10 = tomorrow: its bad day is red.)
  assert.deepStrictEqual(ordered.map((x) => x.level), ['red', 'red', 'red', 'red', 'amber']);
  assert.deepStrictEqual(ordered.map((x) => x.group), ['stop', 'stop', 'stop', 'look', 'cost']);
  assert.deepStrictEqual(ordered.slice(3).map((x) => x.code), ['DATE_MISMATCH', 'NO_RATE']);
  // The closed-day dot reads the same counts.
  const m = WN4.dayMark(WN4.dayCounts(week[0].facts, T));
  assert.strictEqual(m.tone, 'red');
  assert.match(m.words, /1 χωρίς φορτηγό/);
  assert.strictEqual(WN4.dayMark(WN4.dayCounts([], T)), null);
});

test('no day closes by itself: no collapse rule exists; openDay only picks where to scroll', () => {
  assert.deepStrictEqual(Object.keys(WN4).filter((k) => /collaps|fold|closed/i.test(k)), []);
  const days = [{ date: add(T, 3), facts: [{ kind: 'trip', desc: downLeg({ nl: carrier, natLoad: '2026-10-11', hs: '2026-10-11' }) }] },
    { date: add(T, 1), facts: [{ kind: 'trip', desc: downLeg({ nl: carrier }) }] }];
  assert.strictEqual(WN4.openDay(days, T), add(T, 3));
  assert.strictEqual(WN4.openDay([{ date: add(T, 1), facts: [] }], T), T);
});

test('rowDay: the loading; the delivery only when the loading is missing', () => {
  assert.strictEqual(WN4.rowDay(nl({ load: '2026-10-17', del: '2026-10-18' })), '2026-10-17');
  assert.strictEqual(WN4.rowDay(nl({ del: '2026-10-18' })), '2026-10-18');
  assert.strictEqual(WN4.rowDay({}), null);
  // Athens day, not the UTC slice: 23:30Z on the 16th is Saturday the 17th here.
  assert.strictEqual(WN4.rowDay({ 'Loading DateTime': '2026-10-16T23:30:00.000Z' }), '2026-10-17');
});

// ─── dateEditable (PLAN §2.4, Ε8 still open) ───────────────────────────
function withNow(iso, fn) {
  const real = Date.now;
  Date.now = () => Date.parse(iso);
  try { return fn(); } finally { Date.now = real; }
}

test('dateEditable: a pending VS load whose order is not executed is editable (the 10 of 11/10, intl In Transit included)', () => {
  withNow('2026-10-13T08:00:00Z', () => {
    assert.deepStrictEqual(WN4.dateEditable(nl({ load: T, del: add(T, 1) }), intl({ del: add(T, 1), cd: T })), { ok: true, mode: 'edit', code: null, why: '' });
    assert.strictEqual(WN4.dateEditable(nl({ load: T, del: add(T, 1), status: 'Assigned' }), intl({ del: add(T, 1), cd: T, status: 'In Transit' })).ok, true);
  });
});

test('dateEditable: every locked state, the reason a dated fact, never «Παραδομ…» / «Delivered»', () => {
  withNow('2026-10-13T08:00:00Z', () => {
    const fut = { load: T, del: add(T, 1) };
    const cases = [
      ['NL_LOADED', nl(Object.assign({ status: 'In Transit' }, fut)), intl({ del: add(T, 1) }), 'το εθνικό φορτώθηκε (Τρί 13/10)'],
      ['NL_EXECUTED', nl(Object.assign({ status: 'Delivered' }, fut)), intl({ del: add(T, 1) }), 'το εθνικό γράφτηκε εκτελεσμένο από το διεθνές'],
      ['NL_PAST', nl({ load: '2026-10-11', del: '2026-10-12', status: 'Assigned' }), intl({ del: '2026-10-12' }), 'η παράδοση πέρασε (Δευ 12/10)'],
      ['NL_PAST', nl({ load: '2026-10-11', del: '2026-10-12', status: 'Delivered' }), intl({ del: '2026-10-12' }), 'η παράδοση πέρασε (Δευ 12/10)'],
      ['NL_CANCELLED', nl(Object.assign({ status: 'Cancelled' }, fut)), intl({ del: add(T, 1) }), 'το εθνικό ακυρώθηκε'],
      ['INTL_EXECUTED', nl(fut), intl({ del: add(T, 1), status: 'Delivered' }), 'το διεθνές εκτελέστηκε (Τετ 14/10)'],
      ['INTL_CANCELLED', nl(fut), intl({ del: add(T, 1), status: 'Cancelled' }), 'το διεθνές ακυρώθηκε'],
      ['INTL_INVOICED', nl(fut), intl({ del: add(T, 1), invoiced: true }), 'το διεθνές τιμολογήθηκε'],
      ['INTL_UNREAD', nl(fut), null, 'διεθνές: δεν φορτώθηκε'],
    ];
    for (const [code, n, i, why] of cases) {
      const r = WN4.dateEditable(n, i);
      assert.strictEqual(r.ok, false, code);
      assert.strictEqual(r.mode, 'read', code);
      assert.strictEqual(r.code, code);
      assert.strictEqual(r.why, why, code);
      assert.ok(!/Παραδομ|Delivered/i.test(r.why), code);
    }
  });
});

test('dateEditable(nl, null) → {ok:false}; groupage disabled with the reason; a national order opens its form', () => {
  assert.strictEqual(WN4.dateEditable(nl({ load: T }), null).ok, false);
  assert.strictEqual(WN4.dateEditable(null, null).ok, false);
  const g = WN4.dateEditable(nl({ load: T, src: 'Groupage' }), null);
  assert.deepStrictEqual([g.ok, g.mode], [false, 'off']);
  assert.ok(g.why);
  const n = WN4.dateEditable(nl({ load: T, src: 'National' }), null);
  assert.deepStrictEqual([n.ok, n.mode], [false, 'form']);
});

test('dateEditable: the computed «delivered» is OrdersCommon.deliveredByDate (the board\'s _wnIsDelivered), at the same instant', () => {
  // Delivery written as T12:00Z (15:00 Athens): not past at 11:59Z, past at 12:01Z.
  const n = nl({ load: '2026-10-12', del: T, status: 'Assigned' });
  const i = intl({ del: T });
  for (const at of ['2026-10-13T11:59:00Z', '2026-10-13T12:01:00Z']) {
    withNow(at, () => {
      const past = OrdersCommon.deliveredByDate(n.Status, n['Delivery DateTime']);
      assert.strictEqual(WN4.dateEditable(n, i).code === 'NL_PAST', past, at);
    });
  }
});

test('dateEditable: a fresh read decides — the same load locks once the order is invoiced after the paint', () => {
  withNow('2026-10-13T08:00:00Z', () => {
    const n = nl({ load: T, del: add(T, 1) });
    assert.strictEqual(WN4.dateEditable(n, intl({ del: add(T, 1) })).ok, true);
    assert.strictEqual(WN4.dateEditable(n, intl({ del: add(T, 1), invoiced: true })).ok, false);
    assert.strictEqual(WN4.dateEditable(Object.assign({}, n, { Status: 'In Transit' }), intl({ del: add(T, 1) })).ok, false);
  });
});

// ─── keyboard ──────────────────────────────────────────────────────────
test('KEYMAP_NATL: A · P · D · M · N by e.code (a Greek layout works); no intl-only O / Q', () => {
  const byCode = Object.fromEntries(WN4.KEYMAP_NATL.filter((k) => !k.shift).map((k) => [k.code, k.action]));
  assert.strictEqual(byCode.KeyA, 'assign');
  assert.strictEqual(byCode.KeyP, 'print');
  assert.strictEqual(byCode.KeyD, 'date');
  assert.strictEqual(byCode.KeyM, 'match');
  assert.strictEqual(byCode.KeyN, 'newSn');
  assert.strictEqual(byCode.KeyO, undefined);
  assert.strictEqual(byCode.KeyQ, undefined);
  assert.ok(Object.isFrozen(WN4.KEYMAP_NATL) && WN4.KEYMAP_NATL.every(Object.isFrozen));
  assert.strictEqual(WN4.keyHint('match'), 'M');
  assert.strictEqual(WN4.keyHint('nope'), '');
  // The print label says it prints the TRIP (P = load on Weekly Intl).
  assert.match(WN4.KEYMAP_NATL.find((k) => k.action === 'print').label, /ταξιδιού/);
});

test('keyAction rides WI4.keyAction(ev, st, map); until WP1 lands the map parameter it answers null, never an intl action', () => {
  const ev = { code: 'KeyM' }, st = { onPage: true, rootPresent: true, hasFocusRow: true };
  // main today: WI4.keyAction has no map parameter.
  if (WI4.keyAction.length < 3) assert.strictEqual(WN4.keyAction(ev, st), null);
  // With the WP0-contract engine (a stand-in here), the national map is passed.
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  let seen = null;
  ctx.WI4 = { keyAction(e, s, map) { seen = map; const k = map.find((x) => x.code === e.code); return k ? k.action : null; } };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/wn4-logic.js'), 'utf8'), ctx);
  assert.strictEqual(ctx.WN4.keyAction(ev, st), 'match');
  assert.strictEqual(seen, ctx.WN4.KEYMAP_NATL);
});

// ─── returnCandidates (PLAN §4.4β) ─────────────────────────────────────
test('returnCandidates: our empty trucks first (nearest first), then our others, then partners; nothing is picked', () => {
  const target = { day: '2026-10-15', lat: 40.52, lng: 22.20 }; // near Veroia
  const cands = [
    { id: 'p1', label: 'Συνεργάτης Α', kind: 'partner', lastRate: { rate: 420, day: '2026-10-06' } },
    { id: 'p2', label: 'Συνεργάτης Β', kind: 'partner' },
    { id: 't3', label: 'ΚΖΧ-3', kind: 'own', lastDrop: { day: '2026-10-14', place: 'Αθήνα', lat: 37.98, lng: 23.73 } },
    { id: 't1', label: 'ΚΖΧ-1', kind: 'own', lastDrop: { day: '2026-10-14', place: 'Λάρισα', lat: 39.64, lng: 22.42 } },
    { id: 't2', label: 'ΚΖΧ-2', kind: 'own', lastDrop: { day: '2026-10-14', place: 'Πάτρα' } },              // no coordinates
    { id: 't4', label: 'ΚΖΧ-4', kind: 'own', lastDrop: { day: '2026-10-14', place: 'Βόλος' }, laterLoad: true }, // booked again
    { id: 't5', label: 'ΚΖΧ-5', kind: 'own', lastDrop: { day: '2026-10-16', place: 'Κόρινθος', lat: 37.94, lng: 22.93 } }, // ends after
    { id: 't6', label: 'ΚΖΧ-6', kind: 'own', noGps: true, lastDrop: { day: '2026-10-13', place: 'Τρίπολη' } },
  ];
  const frozen = JSON.stringify(cands);
  const r = WN4.returnCandidates(target, cands);
  assert.strictEqual(JSON.stringify(cands), frozen, 'pure: the input is not touched');
  assert.deepStrictEqual(r.map((x) => x.id), ['t1', 't3', 't2', 't6', 't4', 't5', 'p1', 'p2']);
  assert.deepStrictEqual(r.map((x) => x.group), ['emptyOwn', 'emptyOwn', 'emptyOwn', 'emptyOwn', 'own', 'own', 'partner', 'partner']);
  assert.match(r[0].where, /^~1\d\d km σε ευθεία από Λάρισα$/);
  assert.ok(r[0].km < r[1].km);
  assert.strictEqual(r[2].where, 'θέση άγνωστη');
  assert.strictEqual(r[3].where, 'θέση άγνωστη (χωρίς GPS)');
  assert.strictEqual(r[4].where, '');
  // No history → no price line, never «0 €»; a history → the last rate.
  assert.strictEqual(r[7].priceLine, null);
  assert.strictEqual(r[6].priceLine, 'τελευταίο κόμιστρο 420 € · Τρί 6/10');
  assert.ok(r.every((x) => !/ 0 €/.test(x.priceLine || '')));
  assert.deepStrictEqual(WN4.returnCandidates(target, [{ id: 'p', kind: 'partner', lastRate: { rate: 0 } }])[0].priceLine, null);
  assert.deepStrictEqual(WN4.returnCandidates(null, null), []);
});

// ─── pallets cell ──────────────────────────────────────────────────────
test('palletCell: badges drop whole in the given order; the pallet figure never drops; no order = no guess', () => {
  const chips = [{ key: 'pallets', w: 30 }, { key: 'src', w: 24 }, { key: 'pe', w: 22 }];
  assert.deepStrictEqual(WN4.palletCell(chips, 200, ['src', 'pe']), { shown: ['pallets', 'src', 'pe'], dropped: [], overflow: false });
  assert.deepStrictEqual(WN4.palletCell(chips, 60, ['src', 'pe']), { shown: ['pallets', 'pe'], dropped: ['src'], overflow: false });
  assert.deepStrictEqual(WN4.palletCell(chips, 30, ['pallets', 'pe', 'src']), { shown: ['pallets'], dropped: ['pe', 'src'], overflow: false });
  assert.deepStrictEqual(WN4.palletCell(chips, 20, ['src', 'pe']).shown, ['pallets']);
  assert.strictEqual(WN4.palletCell(chips, 20, ['src', 'pe']).overflow, true);
  assert.deepStrictEqual(WN4.palletCell(chips, 60), { shown: ['pallets', 'src', 'pe'], dropped: [], overflow: true });
  // Unmeasured column: never shrink on a guess.
  assert.deepStrictEqual(WN4.palletCell(chips, 0, ['src', 'pe']).dropped, []);
});
