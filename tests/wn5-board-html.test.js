// node --test tests/wn5-board-html.test.js
// National v5 F4α Task T5 — the board HTML of the synthetic W42 against the owner changes of 25/10 (Figma H1
// 2120:7738, spec of the vehicle handover §7): no time in the ΑΝΑΘΕΣΗ column, the Veroia loading time under «Βέροια»
// in ΦΟΡΤΩΣΗ on EVERY row that loads there, the head «ΑΝΑΘΕΣΗ» alone, a one-segment cycle drawn as today (no
// label, no slanted edge), no hex in the module. The REAL core/wi4-logic.js, core/wn5-logic.js and
// modules/weekly_natl_v5.js run in a vm; WN5._html(model) is the board body, a pure function of the model.
// Cells hold spans and buttons only (a rule of the module), so a cell is the text up to its first </div>.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/wn5-week.json'), 'utf8'));
function load() {
  const store = new Map();
  const ctx = { console: { log() {}, warn() {}, error() {} }, location: { search: '', href: 'https://x/app.html' }, history: { state: null, replaceState() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['core/wi4-logic.js', 'core/wn5-logic.js', 'modules/weekly_natl_v5.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  assert.ok(ctx.WN5 && typeof ctx.WN5._html === 'function', 'renderer _html not found in modules/weekly_natl_v5.js (WN5._html)');
  return ctx;
}
const html = (board = FIX) => { const c = load(); return c.WN5._html(c.WN5L.model(board, { today: '2026-10-13' })); };
// One chunk per row: from `<div class="wn5-row` to the next row (or the end of the day body).
const rows = (h) => h.split('<div class="wn5-row').slice(1).map((s) => '<div class="wn5-row' + s);
const keyOf = (chunk) => (/data-key="([^"]+)"/.exec(chunk) || [])[1];
const cell = (chunk, cls) => { const m = new RegExp(`<div class="${cls}"(?: [^>]*)?>([\\s\\S]*?)</div>`).exec(chunk); return m ? m[1] : null; };

test('F4α-T5: no hh:mm inside any .wn5-asg', () => {
  const all = rows(html());
  assert.ok(all.length >= 10, `the board drew ${all.length} rows`);
  for (const r of all) {
    const asg = cell(r, 'wn5-asg');
    assert.ok(asg !== null, `${keyOf(r)}: no .wn5-asg cell`);
    assert.ok(!/\d{1,2}:\d{2}/.test(asg), `${keyOf(r)}: a time in ΑΝΑΘΕΣΗ: ${asg}`);
  }
});

test('F4α-T5: every row loading at Veroia has .wn5-vtime inside .wn5-fl', () => {
  const c = load();
  const m = c.WN5L.model(FIX, { today: '2026-10-13' });
  const want = m.days.flatMap((d) => d.rows).filter((r) => r.kath && r.kath.veroia);
  assert.deepStrictEqual(Array.from(want, (r) => r.key), ['rt:101', 'rt:102', 'rt:103', 'rt:104', 'wait:4101', 'wait:4103', 'rt:105', 'rt:108', 'wait:4104']);
  const byKey = new Map(rows(c.WN5._html(m)).map((r) => [keyOf(r), r]));
  for (const r of want) {
    const fl = cell(byKey.get(r.key), 'wn5-fl');
    // the class list may grow (T6 adds the day dimming); the order «Βέροια» then its window may not
    assert.ok(fl && /<span class="wn5-vh[^"]*">Βέροια<\/span>/.test(fl), `${r.key}: no «Βέροια» in ΦΟΡΤΩΣΗ: ${fl}`);
    // a hub[] row of 072 has no load window yet (Ε-26): «—» under «Βέροια», never «null–null»
    const win = r.kath.veroia.from ? `${r.kath.veroia.from}–${r.kath.veroia.to}` : '—';
    assert.ok(new RegExp(`<span class="wn5-vh[^"]*">Βέροια</span><span class="wn5-vtime[^"]*">${win}</span>`).test(fl), `${r.key}: no Veroia time under «Βέροια»: ${fl}`);
  }
  for (const r of rows(c.WN5._html(m))) assert.ok(!/wn5-vtime/.test(cell(r, 'wn5-asg') || ''), `${keyOf(r)}: a Veroia time in ΑΝΑΘΕΣΗ`);
});

test('F4α-T5: header text is exactly «ΑΝΑΘΕΣΗ»', () => {
  const h = html();
  const head = /<div class="wn5-cols" role="row">([\s\S]*?)<\/div>/.exec(h);
  assert.ok(head, 'no .wn5-cols header');
  assert.ok(head[1].includes('<span class="wn5-c-asg wn5-h-asg">ΑΝΑΘΕΣΗ</span>'), head[1]);
  assert.ok(!/ΦΟΡΤΩΣΗ ΒΕΡΟΙΑΣ/.test(head[1]), 'the F0 head «ΑΝΑΘΕΣΗ · ΦΟΡΤΩΣΗ ΒΕΡΟΙΑΣ» is back');
});

test('F4α-T5: no hex colour in the module', () => {
  const { check } = require(path.join(ROOT, 'tests/critics/static.js'));
  const unit = require(path.join(ROOT, 'tests/critics/units.js')).find((u) => u.unit === 'weekly_natl_v5');
  assert.ok(unit, 'unit weekly_natl_v5 not found in tests/critics/units.js');
  const cwd = process.cwd();
  process.chdir(ROOT);
  try { const r = check(unit, { hex: 0, truncate: 0 }); assert.strictEqual(r.pass, true, r.failures.join(' · ')); }
  finally { process.chdir(cwd); }
});

test('F4α-T5: one-segment cycle has no label and no slanted edge', () => {
  for (const r of rows(html()).filter((x) => /data-rt=/.test(x))) {
    const asg = cell(r, 'wn5-asg');
    assert.ok(!/wn5-tile|data-label|data-seg/.test(asg), `${keyOf(r)}: a segment tile on a cycle without segments: ${asg}`);
    assert.ok(!/ΑΡΧΙΚΟ|ΕΝΔΙΑΜΕΣΟ|ΤΕΛΙΚΟ/.test(asg), `${keyOf(r)}: a segment label`);
  }
});

test('F4α-T5: «Χωρίς κάθοδο», «Κενό γύρισμα», «Μόνο κάθοδος · συνεργάτης», partner tile «—», «ως Δευ 22:00», ↳ τοπικός; no hub[] waiting line (F5 FE-2)', () => {
  const by = new Map(rows(html()).map((r) => [keyOf(r), r]));
  assert.ok(/Χωρίς κάθοδο/.test(by.get('rt:106')), 'rt:106');
  assert.ok(/<span class="wn5-gaph">Κενό γύρισμα<\/span> · ελεύθερο από Τρί 11:00 · Athens Test/.test(by.get('rt:103')), 'rt:103');
  assert.ok(/Μόνο κάθοδος · συνεργάτης/.test(by.get('rt:104')), 'rt:104');
  // F0 7745 / H1: a one-segment partner cycle shows the partner and its plate (the 072 board has none → «—»), never the rate (Ε-36)
  const p104 = cell(by.get('rt:104'), 'wn5-asg');
  assert.ok(/Partner Test Pelagos/.test(p104) && /title="—">—</.test(p104) && !/κόμιστρο λείπει|€/.test(p104), 'rt:104 partner tile: ' + p104);
  // live 072: VS-T118 is in hub[] without its destination / windows (Ε-26): «—» on the points and a visible line
  // FE-2 (owner 28/10): the «… δεν ήρθαν (Worker)» line is gone — an absent key is the error strip (tests/wn5-logic.test.js)
  assert.ok(!/wn5-miss|δεν ήρθαν με τον πίνακα/.test(by.get('wait:4101')), 'wait:4101 still carries the waiting line');
  assert.ok(!/null/.test(by.get('wait:4101')), 'wait:4101 prints no «null»');
  assert.ok(/Βέροια<span class="wn5-endx"> · τέλος κύκλου<\/span><\/span><span class="wi4-l2">ως Δευ 22:00/.test(by.get('rt:101')), 'rt:101 end');
  // whole-frame r4: «↳» in the index column (as the ⇄ sub-row's .wn5-hand-ar), the text from the ΚΑΘΟΔΟΣ chip column
  assert.ok(/<span class="wn5-c-idx"><span class="wn5-hand-ar">↳<\/span><\/span> <span class="wn5-sub-t"><b>Φόρτωση με τοπικό<\/b> · Driver Test 11 · Δευ 12\/10 11:00–12:00 · για Oinofyta Test \(στάση 2\)/.test(by.get('rt:103')), 'rt:103 local');
  // live fix 3 (owner 28/10): a waiting row of one side names its side in the box and draws the dashed empty side
  assert.ok(/class="wi4-box un wn5-un-a" data-act="assign"><span class="wi4-l1">ΠΡΟΣ ΑΝΑΘΕΣΗ<\/span><span class="wi4-l2 wn5-un-side">← ΚΑΘΟΔΟΣ<\/span>/.test(by.get('wait:4101'))
    && /wi4-r-red/.test(by.get('wait:4101')) && /<span class="wn5-gapbox">Χωρίς άνοδο<\/span>/.test(by.get('wait:4101')), 'wait:4101 ΠΡΟΣ ΑΝΑΘΕΣΗ');
});

test('F4α-T5: a loading before Veroia comes first in ΦΟΡΤΩΣΗ, numbered «1», then «Βέροια» (WN5L Side.vBefore, Figma H1 row 5)', () => {
  const c = load();
  const m = c.WN5L.model(FIX, { today: '2026-10-13' });
  const all = m.days.flatMap((d) => d.rows);
  const r105 = all.find((r) => r.key === 'rt:105');
  assert.ok(r105 && r105.kath, 'rt:105 has no ΚΑΘΟΔΟΣ side');
  assert.strictEqual(r105.kath.vBefore, 1, 'rt:105 loads at Thessaloniki Test before Veroia (stop seq order)');
  // gap and waiting sides make no loading before the hub: 0, never undefined
  for (const r of all) for (const s of [r.kath, r.anod]) if (s && (s.gap || r.key.startsWith('wait:'))) assert.strictEqual(s.vBefore, 0, `${r.key} ${s.side}: vBefore ${s.vBefore}`);
  const fl = cell(rows(c.WN5._html(m)).find((x) => keyOf(x) === 'rt:105'), 'wn5-fl');
  // the number inside the place line since 28/10 (long names: number + place are one run, cut at two lines)
  assert.ok(/<span class="wi4-l1"><span class="wi4-pt-n">1<\/span> Thessaloniki Test<\/span>[\s\S]*<span class="wn5-vh[^"]*">Βέροια<\/span>/.test(fl), `rt:105 ΦΟΡΤΩΣΗ: ${fl}`);
});

test('F4α-T17 fidelity: a local loading on a pickup names what is loaded → Βέροια and the delivery it is for (Figma 2011:8305)', () => {
  const board = JSON.parse(JSON.stringify(FIX));
  const c105 = board.cycles.find((c) => c.rt_id === 105);
  // RT 105: Thessaloniki Test loads leg 5017 (ΠΕΛΑΤΗΣ Δ, 6π), unloaded at Aspropyrgos Test = delivery 2 of the row
  c105.stops.find((s) => s.stop_id === 1401).local_loading = { local_move_id: 7009, driver_id: 35, driver: 'Driver Test 11',
    move_date: '2026-10-12', time_from: '11:00:00', time_to: '12:00:00' };
  const by = new Map(rows(html(board)).map((r) => [keyOf(r), r]));
  const r = by.get('rt:105');
  assert.ok(/<span class="wn5-hand-ar">↳<\/span><\/span> <span class="wn5-sub-t"><b>Φόρτωση με τοπικό<\/b> · Driver Test 11 · Δευ 12\/10 11:00–12:00 · ΠΕΛΑΤΗΣ Δ, Thessaloniki Test → Βέροια · 6π · για ΠΕΛΑΤΗΣ Δ \(στάση 2\)/.test(r), 'rt:105 local: ' + r);
  assert.ok(!/για Thessaloniki Test/.test(r), 'the pickup place is named after «για»');
  // a delivery stop (rt:103, the fixture's own) keeps the T5 line
  assert.ok(/· για Oinofyta Test \(στάση 2\)/.test(by.get('rt:103')), 'rt:103 local');
});
