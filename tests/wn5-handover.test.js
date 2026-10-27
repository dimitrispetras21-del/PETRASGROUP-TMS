// node --test tests/wn5-handover.test.js
// National v5 F4α-T25 (gated 072b): modules/wn5_handover.js — the cycle card and the change form's rules.
// Why: the card has NO change history (Ε-11 «γ», owner 26/10: it stays in the Audit Trail), so R-63 is dropped here;
// «Άλλο» without its note would only reach the Worker to be refused (seg_other_note); and the change's request_id
// belongs to the execution only (072b: required except on a dry run).
// The REAL module runs in a vm; on plain main: ENOENT … modules/wn5_handover.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const FILE = 'modules/wn5_handover.js';
const SRC = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));
function load(extra) {
  const acts = [];
  const rec = (w) => () => { acts.push(w); return 0; };
  const win = { addEventListener: rec('window.addEventListener') };
  const ctx = { console: { log() {}, warn() {}, error() {} }, window: win, Intl, Date, Math, JSON, Object, Array, String, Number, Map, Set, Promise, Error, RegExp, Symbol,
    setTimeout: rec('setTimeout'), setInterval: rec('setInterval'), fetch: rec('fetch'), addEventListener: rec('addEventListener'),
    document: { createElement: rec('document.createElement'), addEventListener: rec('document.addEventListener'), body: { appendChild: rec('body.appendChild') } },
    WN5Lab: { REASON: { other: { text: 'Άλλο', group: 'other', noteRequired: true }, vehicle_breakdown: { text: 'Βλάβη φορτηγού', group: 'unplanned' } } } };
  Object.assign(ctx, extra);
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: FILE });
  return { acts, added: Object.keys(win).filter((k) => k !== 'addEventListener'), H: win.WN5Hand };
}
const { H } = load();
const grab = (name) => {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(SRC);
  if (!m) throw new Error(name + ' not found in ' + FILE);
  let d = 0;
  for (let j = SRC.indexOf('{', m.index); j < SRC.length; j++) { if (SRC[j] === '{') d++; else if (SRC[j] === '}' && --d === 0) return SRC.slice(m.index, j + 1); }
  throw new Error(name + ' unbalanced');
};

test('F4α-T25: wn5_handover.js adds exactly WN5Hand and acts zero times at load', () => {
  const r = load();
  assert.deepStrictEqual(J(r.added), ['WN5Hand']);
  assert.deepStrictEqual(J(r.acts), []);
});

test('F4α-T25: app.html loads wn5_handover.js once, right after wn5_sheet.js, with ?v=', () => {
  const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  assert.strictEqual((html.match(/<script src="modules\/wn5_handover\.js\?v=\d+"><\/script>/g) || []).length, 1);
  assert.ok(/modules\/wn5_sheet\.js\?v=\d+"><\/script>\s*<script src="modules\/wn5_handover\.js\?v=\d+"/.test(html));
});

test('F4α-T25: the cycle card has no change history and reads no /audit (Ε-11 «γ», owner 26/10)', () => {
  // The owner chose «γ»: history stays in the Audit Trail (owner and management). A card that rebuilt it would be a
  // second place for the same fact (principle 3) and would put audit rows in front of roles that do not read them.
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');   // the header comment names the decision; only code counts
  assert.ok(!/ΙΣΤΟΡΙΚΟ|data-hist|\/audit|historyGroups/.test(code), 'the card must not build or read a change history');
  assert.deepStrictEqual(Object.keys(load().H).filter((k) => /hist/i.test(k)), []);
});

test('F4α-T25: «Άλλο» without a note → a form line, no body is built for the Worker (seg_other_note)', () => {
  const st = { at: '2026-10-13T14:30:00+03:00', place_note: 'Θήβα', reason: 'other', reason_note: '', own: true, truck_id: 12, trailer_id: null, driver_id: 32, same_driver: false };
  assert.ok(J(H._changeProblems(st)).includes('Με «Άλλο» η σημείωση είναι υποχρεωτική'));
  assert.deepStrictEqual(J(H._changeProblems(Object.assign({}, st, { reason_note: 'λάστιχο' }))), []);
  assert.ok(J(H._changeProblems(Object.assign({}, st, { place_note: '' }))).some((l) => /^Πού \*/.test(l)), 'place_note is required by 072b plan_seg_change');
});

test('F4α-T25: the change body — exactly plan_seg_change\'s keys; same_driver sends no driver_id; partner rate optional', () => {
  const own = { at: '2026-10-13T14:30:00+03:00', place_note: 'Λαμία', reason: 'vehicle_breakdown', reason_note: '', own: true, truck_id: 12, trailer_id: 22, driver_id: 32, same_driver: false };
  assert.deepStrictEqual(J(H._changeBody(own)), { at: own.at, place_note: 'Λαμία', reason: 'vehicle_breakdown', vehicle: { trip_type: 'OWNED', truck_id: 12, trailer_id: 22, driver_id: 32 } });
  assert.deepStrictEqual(J(H._changeBody(Object.assign({}, own, { same_driver: true }))).vehicle, { trip_type: 'OWNED', truck_id: 12, trailer_id: 22 });
  assert.strictEqual(J(H._changeBody(Object.assign({}, own, { same_driver: true }))).same_driver, true);
  const par = Object.assign({}, own, { own: false, partner_id: 51, partner_rate: null });
  assert.deepStrictEqual(J(H._changeBody(par)).vehicle, { trip_type: 'PARTNER', partner_id: 51 });
  assert.ok(!('request_id' in J(H._changeBody(own))) && !('dry_run' in J(H._changeBody(own))), 'planFetch adds them, never the body');
});

test('F4α-T25: request_id on the change execution only, never on its dry run', () => {
  const pre = grab('_preview'), save = grab('_changeSave');
  assert.ok(/planFetch\('POST',[^)]*\{\s*body,\s*dry:\s*true\s*\}/.test(pre) && !/requestId/.test(pre), 'the dry run');
  assert.ok(/requestId:\s*d\.slot\.id/.test(save) && !/dry:\s*true/.test(save), 'the execution');
});

// T25 fidelity: the preview's payroll foot follows R-41 (073 live): one line per driver of the cycle, the same driver
// twice is one line, a partner has none. Figma 2122:7832 «Μισθοδοσία: 2 γραμμές (Γιώργος, Νίκος)».
test('F4α-T25: the preview payroll foot — one line per driver, same driver once, partners none (R-41)', () => {
  const o = (id, name) => ({ trip_type: 'OWNED', driver_id: id, driver: name });
  assert.strictEqual(H._payrollLine([o(31, 'Γιώργος'), o(32, 'Νίκος')]), 'Μισθοδοσία: 2 γραμμές (Γιώργος, Νίκος)');
  assert.strictEqual(H._payrollLine([o(31, 'Γιώργος'), o(31, 'Γιώργος')]), 'Μισθοδοσία: 1 γραμμή (Γιώργος)');
  assert.strictEqual(H._payrollLine([o(31, 'Γιώργος'), { trip_type: 'PARTNER', partner_id: 51, driver_id: null }]), 'Μισθοδοσία: 1 γραμμή (Γιώργος)');
  assert.strictEqual(H._payrollLine([{ trip_type: 'PARTNER', partner_id: 51 }]), '');
});

// T25 fidelity: «ελεύθερο ως …» is read from the board's week (the lookups carry no availability): the next use of the
// vehicle in ANOTHER cycle after the change time, capped at this cycle's end; in use at that time → null (the dry
// run's truck_busy says it). Real WN5L, so a 072 cycle without segments counts with its own window.
test('F4α-T25: free-until from the week — next use in another cycle, capped at the cycle end, null when in use', () => {
  const L = require(path.join(ROOT, 'core/wn5-logic.js'));
  const H2 = load({ WN5L: L }).H;
  const end = '2026-10-13T22:00:00+03:00';
  const board = { cycles: [
    { rt_id: 101, truck_id: 11, driver_id: 31, start_at: '2026-10-12T16:00:00+03:00', end_at: end, stops: [] },
    { rt_id: 102, truck_id: 12, driver_id: 32, start_at: '2026-10-13T20:00:00+03:00', end_at: '2026-10-14T22:00:00+03:00', stops: [] },
    { rt_id: 103, truck_id: 13, driver_id: 33, start_at: '2026-10-12T10:00:00+03:00', end_at: '2026-10-14T10:00:00+03:00',
      segments: [{ segment_id: 1, truck_id: 13, driver_id: 33, from_at: '2026-10-12T10:00:00+03:00', to_at: '2026-10-13T01:00:00+03:00' },
        { segment_id: 2, truck_id: 14, driver_id: 34, from_at: '2026-10-13T01:00:00+03:00', to_at: '2026-10-14T10:00:00+03:00' }] }] };
  const at = '2026-10-13T03:00:00+03:00';
  assert.strictEqual(H2._freeUntil(board, 101, 'truck_id', 12, at, end), '2026-10-13T20:00:00+03:00', 'next use before the end');
  assert.strictEqual(H2._freeUntil(board, 101, 'truck_id', 13, at, end), end, 'its segment ended before the change: free to the end');
  assert.strictEqual(H2._freeUntil(board, 101, 'driver_id', 34, at, end), null, 'in use at the change time');
  assert.strictEqual(H2._freeUntil(board, 101, 'truck_id', 11, at, end), end, 'this cycle never counts against itself');
  assert.strictEqual(H2._freeUntil(board, 101, 'truck_id', null, at, end), null, 'nothing picked');
  assert.strictEqual(H2._freeUntil(board, 101, 'truck_id', 12, null, end), null, 'no time yet');
  assert.strictEqual(H2._freeUntil(board, 101, 'truck_id', 12, '2026-10-13T21:00:00+03:00', end), null, 'RT-102 holds it at 21:00');
});
