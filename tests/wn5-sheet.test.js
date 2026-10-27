// node --test tests/wn5-sheet.test.js
// National v5 F4α-T23: the driver sheet (A4) and its WhatsApp text, modules/wn5_sheet.js (Figma 2011:10998, Δ10).
// Why: the sheet leaves the building — no price, no partner rate, no amount, and Veroia only as «Αποθήκη
// Βέροιας» (the hub is never shown to a client); every unknown is «—», never an empty cell (Δ12, principle 2);
// a <table> with table-layout:fixed and a colspan larger than its colgroup adds phantom columns (S4 15/9).
// The REAL core/wi4-logic.js, modules/wn5_forms.js (time helpers) and modules/wn5_sheet.js run in a vm.
// On plain main: ENOENT … modules/wn5_sheet.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const FILE = 'modules/wn5_sheet.js';
const SRC = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));

function load(withDeps) {
  const acts = [];
  const rec = (w) => () => { acts.push(w); return 0; };
  const win = { addEventListener: rec('window.addEventListener') };
  const ctx = { console: { log() {}, info() {}, warn() {}, error() {}, debug() {} }, window: win, Intl, Date, Math, JSON, Object, Array, String, Number, Map, Set, Promise, Error, RegExp, Symbol,
    setTimeout: rec('setTimeout'), setInterval: rec('setInterval'), fetch: rec('fetch'), addEventListener: rec('addEventListener'),
    MutationObserver: function () { acts.push('MutationObserver'); },
    document: { addEventListener: rec('document.addEventListener'), createElement: rec('document.createElement'), querySelector: rec('document.querySelector'), body: { appendChild: rec('body.appendChild') } } };
  vm.createContext(ctx);
  if (withDeps) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/wi4-logic.js'), 'utf8'), ctx, { filename: 'core/wi4-logic.js' });
    ctx.WI4 = win.WI4;
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules/wn5_forms.js'), 'utf8'), ctx, { filename: 'modules/wn5_forms.js' });
    ctx.WN5Form = win.WN5Form;
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/wn5-labels.js'), 'utf8'), ctx, { filename: 'core/wn5-labels.js' });
    ctx.WN5Lab = win.WN5Lab;
  }
  const before = Object.keys(win);
  vm.runInContext(SRC, ctx, { filename: FILE });
  return { acts, added: Object.keys(win).filter((k) => !before.includes(k)), S: win.WN5Sheet };
}
const { S } = load(true);

const L = (leg_id, piece_id, act, pallets, o) => Object.assign({ leg_id, piece_id, act, pallets, kind: 'national', order_id: null, nat_order_id: 1, reference: 'N-T1', client_id: 41, client: 'ΠΕΛΑΤΗΣ Α', temperature_c: 2 }, o);
const ST = (stop_id, seq, side, location_id, from, to, legs) => ({ stop_id, seq, side, location_id, location: 'LOC ' + location_id, planned_from: from, planned_to: to, stop_day: from.slice(0, 10), legs });
const VS = { kind: 'vs_import', order_id: 2101, nat_order_id: null, reference: 'REF-INT-118', client: 'ΠΕΛΑΤΗΣ Β', temperature_c: 2 };
const CYC = { rt_id: 101, code: 'RT-T101', trip_type: 'OWNED', truck: 'TST-2104', trailer: 'TRL-5102', driver: 'Driver Test 01', partner: null, partner_rate: 777.5,
  stops: [
    ST(1001, 1, 'KATHODOS', 1, '2026-10-12T16:00:00+03:00', '2026-10-12T18:00:00+03:00', [L(1, 11, 'load', 21, VS), L(2, 12, 'load', 6, { reference: 'N-T001', temperature_c: 4 })]),
    ST(1002, 2, 'KATHODOS', 2, '2026-10-13T06:00:00+03:00', '2026-10-13T08:00:00+03:00', [L(1, 11, 'unload', 21, VS)]),
    ST(1003, 3, 'KATHODOS', 3, '2026-10-13T07:00:00+03:00', '2026-10-13T09:00:00+03:00', [L(2, 12, 'unload', 6, { reference: 'N-T001', temperature_c: null })]),
    ST(1004, 4, 'ANODOS', 3, '2026-10-13T12:00:00+03:00', '2026-10-13T14:00:00+03:00', [L(3, 13, 'load', 20, { reference: 'N-T002', client: 'ΠΕΛΑΤΗΣ Γ', temperature_c: 4 })]),
    ST(1005, 5, 'ANODOS', 1, '2026-10-13T20:00:00+03:00', '2026-10-13T22:00:00+03:00', [L(3, 13, 'unload', 20, { reference: 'N-T002', client: 'ΠΕΛΑΤΗΣ Γ', temperature_c: 4 })])] };
const PL = { hubId: 1, byId: {
  1: { name: 'ΒΕΡΟΙΑ TEST', address: 'Test Industrial Area 1, 59100', city: 'Veria', phone: 'TEST-PHONE-01' },
  2: { name: 'ATHENS TEST', address: 'Test Street 2, 10442', city: 'Athens', phone: 'TEST-PHONE-02' } } };
const META = { week: 'W41', cycleNo: '1/2', issued: 'Τρί 13/10/2026 09:30 · R.T.' };

test('F4α-T23: wn5_sheet.js adds exactly WN5Sheet and acts zero times at load', () => {
  const r = load(false);
  assert.deepStrictEqual(J(r.added), ['WN5Sheet']);
  assert.deepStrictEqual(J(r.acts), []);
});

test('F4α-T23: app.html loads wn5_sheet.js once, right after wn5_forms.js, with ?v=', () => {
  const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  assert.strictEqual((html.match(/<script src="modules\/wn5_sheet\.js\?v=\d+"><\/script>/g) || []).length, 1);
  assert.ok(/modules\/wn5_forms\.js\?v=\d+"><\/script>\s*<script src="modules\/wn5_sheet\.js\?v=\d+"/.test(html), 'not right after wn5_forms.js');
});

test('F4α-T23: no price, no rate, no amount anywhere in lines / WhatsApp / A4', () => {
  const ls = S.lines(CYC, PL, 'ALL');
  const all = JSON.stringify(ls) + S.text(ls, META) + S.html(ls, META, '');
  assert.ok(!/777|€|price|partner_rate|κόμιστρο|τιμή/i.test(all), all.match(/.{0,40}(777|€|price|κόμιστρο|τιμή).{0,40}/i));
});

test('F4α-T23: Veroia appears only as «Αποθήκη Βέροιας» (and «· τέλος κύκλου» at the end of the ANODOS)', () => {
  const ls = S.lines(CYC, PL, 'ALL');
  const txt = S.text(ls, META) + S.html(ls, META, '');
  assert.ok(!/ΒΕΡΟΙΑ TEST|LOC 1\b/.test(txt), 'the hub under its catalogue name');
  const stops = J(ls).filter((l) => l.t === 'stop');
  assert.strictEqual(stops[0].name, 'Αποθήκη Βέροιας');
  assert.strictEqual(stops[stops.length - 1].name, 'Αποθήκη Βέροιας · τέλος κύκλου');
  assert.strictEqual(stops[stops.length - 1].act, 'ΕΚΦΟΡΤΩΣΗ');
  assert.strictEqual(stops[stops.length - 1].window, 'ως Τρί 22:00');
});

test('F4α-T23: WhatsApp — sections «*ΚΑΘΟΔΟΣ*»/«*ΑΝΟΔΟΣ*», one number per stop across the cycle, singular/plural', () => {
  const t = S.text(S.lines(CYC, PL, 'ALL'), META);
  const lines = t.split('\n');
  assert.strictEqual(lines[0], '*TST-2104 · TRL-5102 · Driver Test 01*');
  assert.strictEqual(lines[1], 'W41 · κύκλος 1/2');
  assert.ok(lines.includes('*ΚΑΘΟΔΟΣ* · φόρτωση Βέροια · 27π'), t);
  assert.ok(lines.includes('*ΑΝΟΔΟΣ* · 1 φόρτωση · 20π'), t);
  assert.deepStrictEqual(lines.filter((l) => /^\d+\) /.test(l)).map((l) => l.split(')')[0]), ['1', '2', '3', '4', '5']);
  assert.strictEqual(lines[lines.length - 1], 'Χάρτης ανά στάση: στον σύνδεσμο της εφαρμογής');
  const a4 = S.html(S.lines(CYC, PL, 'ALL'), META, '');
  assert.ok(a4.includes('ΚΑΘΟΔΟΣ · 2 παραδόσεις · 27 παλέτες'), 'plural');
  assert.ok(a4.includes('ΑΝΟΔΟΣ · 1 φόρτωση · 20 παλέτες'), 'singular');
});

test('F4α-T23: only the asked part — «Κάθοδος» has no ANODOS stop', () => {
  const ls = J(S.lines(CYC, PL, 'KATHODOS'));
  assert.ok(ls.filter((l) => l.t === 'stop').every((l) => l.side === 'KATHODOS'));
  assert.ok(!S.text(S.lines(CYC, PL, 'KATHODOS'), META).includes('*ΑΝΟΔΟΣ*'));
});

test('F4α-T23: unknown address / phone / temperature / PE → «—», never empty', () => {
  const ls = J(S.lines(CYC, PL, 'ALL')).filter((l) => l.t === 'stop');
  const s3 = ls.find((l) => l.stop_id === 1003);   // location 3 is not in the catalogue, the leg has no temperature
  assert.deepStrictEqual([s3.address, s3.phone, s3.temp, s3.pe], ['—', '—', '—', '—']);
  for (const l of ls) for (const k of ['name', 'address', 'phone', 'window', 'temp', 'pe', 'refs']) assert.ok(String(l[k]).trim() !== '', `${l.stop_id}.${k} empty`);
});

test('F4α-T23: every <table> colspan equals its <colgroup> count', () => {
  const a4 = S.html(S.lines(CYC, PL, 'ALL'), META, '');
  const tables = a4.split('<table').slice(1);
  assert.ok(tables.length >= 2, 'one table per section');
  for (const t of tables) {
    const cols = (t.split('</colgroup>')[0].match(/<col\b/g) || []).length;
    const spans = [...t.matchAll(/colspan="(\d+)"/g)].map((m) => Number(m[1]));
    assert.ok(cols > 0, 'a table without colgroup');
    for (const s of spans) assert.strictEqual(s, cols, `colspan ${s} ≠ ${cols} cols`);
  }
});

test('F4α-T23: a VS stop carries the reference of the international (legs[].reference), nothing derived', () => {
  const ls = J(S.lines(CYC, PL, 'KATHODOS')).filter((l) => l.t === 'stop');
  assert.strictEqual(ls.find((l) => l.stop_id === 1002).refs, 'REF-INT-118');
});

test('F4α-T23: the module has no hex colour (the A4 takes the tokens\' values)', () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(SRC.replace(/\/\/[^\n]*/g, '')), 'hex in modules/wn5_sheet.js');
});

// ── F4α-T27 (072b): one sheet per segment (H5) ───────────────────────────────────────────────────────────────
function segCyc() {
  const c = JSON.parse(JSON.stringify(CYC));
  // stop 1002's window lies BEFORE the handover time, yet it is in the ΤΕΛΙΚΟ's stop_ids: it belongs there (H-9)
  c.stops[1].planned_from = '2026-10-13T01:00:00+03:00'; c.stops[1].planned_to = '2026-10-13T02:00:00+03:00';
  const base = { trip_type: 'OWNED', trailer_id: null, trailer: null, partner_id: null, partner: null, partner_rate: null, reason_note: null, has_vehicle: true };
  c.segments = [
    Object.assign({}, base, { segment_id: 701, label: 'initial', from_at: '2026-10-12T16:00:00+03:00', to_at: '2026-10-13T03:00:00+03:00', truck_id: 11, truck: 'TST-2104', trailer: 'TRL-5102', driver_id: 31, driver: 'Driver Test 01', place_note: null, reason: null, stop_ids: [1001] }),
    Object.assign({}, base, { segment_id: 702, label: 'final', from_at: '2026-10-13T03:00:00+03:00', to_at: '2026-10-13T22:00:00+03:00', truck_id: 12, truck: 'TST-2108', trailer: 'TRL-5104', driver_id: 32, driver: 'Driver Test 02', place_note: 'Λαμία', reason: 'vehicle_breakdown', stop_ids: [1002, 1003, 1004, 1005] })];
  return c;
}
test('F4α-T27: the ΑΡΧΙΚΟ sheet has no stop after the change, the ΤΕΛΙΚΟ none before; the change line on both', () => {
  const a = J(S.lines(segCyc(), PL, 'ALL', 701)), f = J(S.lines(segCyc(), PL, 'ALL', 702));
  assert.deepStrictEqual(a.filter((l) => l.t === 'stop').map((l) => l.stop_id), [1001]);
  assert.deepStrictEqual(f.filter((l) => l.t === 'stop').map((l) => l.stop_id), [1002, 1003, 1004, 1005]);
  const ha = a.filter((l) => l.t === 'hand'), hf = f.filter((l) => l.t === 'hand');
  assert.deepStrictEqual(ha.map((h) => [h.dir, h.other.vehicle, h.other.driver, h.place, h.pallets]), [['out', 'TST-2108', 'Driver Test 02', 'Λαμία', 27]]);
  assert.deepStrictEqual(hf.map((h) => [h.dir, h.other.vehicle, h.other.driver, h.place, h.pallets]), [['in', 'TST-2104', 'Driver Test 01', 'Λαμία', 27]]);
  assert.strictEqual(a[0].segment, 'ΑΡΧΙΚΟ');
  assert.strictEqual(f[0].truck, 'TST-2108', 'the head names the segment\'s vehicle, not the cycle\'s');
});
test('F4α-T27: a stop belongs to the segment whose stop_ids hold it, never by its time on screen', () => {
  const a = J(S.lines(segCyc(), PL, 'KATHODOS', 701));
  assert.ok(!a.some((l) => l.t === 'stop' && l.stop_id === 1002), 'stop 1002 (window before the change, in the ΤΕΛΙΚΟ stop_ids) on the ΑΡΧΙΚΟ sheet');
});
test('F4α-T27: WhatsApp of the ΤΕΛΙΚΟ starts with where and from whom; the A4 band says ΤΜΗΜΑ / ΣΗΜΕΙΟ ΑΛΛΑΓΗΣ', () => {
  const ls = S.lines(segCyc(), PL, 'ALL', 702);
  const t = S.text(ls, META).split('\n');
  assert.strictEqual(t[0], '⇄ παραλαβή από TST-2104 · Λαμία Τρί 03:00');
  assert.strictEqual(t[1], 'παραδίδει ο Driver Test 01');
  assert.strictEqual(t[2], '*TST-2108 · TRL-5104 · Driver Test 02*');
  const a4 = S.html(ls, META, '');
  assert.ok(a4.includes('ΤΜΗΜΑ') && a4.includes('ΤΕΛΙΚΟ') && a4.includes('ΣΗΜΕΙΟ ΑΛΛΑΓΗΣ') && !a4.includes('ΦΟΡΤΩΣΗ ΒΕΡΟΙΑ'));
  assert.ok(/ΑΛΛΑΓΗ ΟΧΗΜΑΤΟΣ/.test(a4) && a4.includes('Βλάβη φορτηγού') && a4.includes('παραλαβή από TST-2104 · Λαμία 03:00'));
  const tables = a4.split('<table').slice(1);
  for (const tb of tables) for (const m of tb.matchAll(/colspan="(\d+)"/g)) assert.strictEqual(Number(m[1]), (tb.split('</colgroup>')[0].match(/<col\b/g) || []).length);
});
test('F4α-T27: without a segment the sheet is exactly T23\'s (R-59)', () => {
  assert.strictEqual(JSON.stringify(S.lines(segCyc(), PL, 'ALL')), JSON.stringify(S.lines(Object.assign(segCyc(), { segments: undefined }), PL, 'ALL')));
});
