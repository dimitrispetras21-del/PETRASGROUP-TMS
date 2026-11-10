// node --test tests/week-paper.test.js
// The printed week (core/week-paper.js) is pure: plain rows in, HTML out. These tests hold the two promises the
// paper makes: every number it prints is counted from the rows it draws, and the page arithmetic keeps a normal
// week on one page and a 52-truck week on two.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const WP = require('../core/week-paper.js');

const own = (n) => ({ kind: 'own', plate: 'TST-' + n, name: 'Driver ' + n });
const ex = (o) => Object.assign({ date: 'Δευ 5', client: 'ΠΕΛΑΤΗΣ Α', dest: 'Beta Market DE', more: 0, pallets: 20, done: false }, o);
const im = (o) => Object.assign({ load: 'Τετ 7', del: 'Παρ 9', client: 'ΠΕΛΑΤΗΣ Β', dest: 'Delta Cash', more: 0, pallets: 10, done: false, pre: false }, o);
const WEEK = { week: 41, range: '3–9 Οκτωβρίου', stamp: 'Τρί 6/10 09:40', days: [
  { head: 'ΔΕΥΤΕΡΑ 5/10', today: false, rows: [
    { no: 1, up: { points: ['Irinoupoli Sud (ΟΤ 12), Aspropyrgos', 'Beta Farm', 'Gamma Coop'], date: 'Σάβ 3', state: 'done' }, ex: ex({ done: true }), truck: own(1), im: im({ dest: 'Βέροια' }), dn: { points: ['Lidl Trikala'], date: 'Πέμ 8', state: 'none' } },
    { no: 2, up: { points: ['Knosos'], date: 'Σάβ 3', state: 'none' }, ex: ex({ pallets: null }), truck: own(2), gap: true },
  ] },
  { head: 'ΤΡΙΤΗ 6/10', today: true, rows: [
    { no: 3, ex: ex({ more: 3 }), truck: { kind: 'par', name: 'Partner <One>' } },
    { no: 4, truck: { kind: 'none' }, im: im({ pre: true, pallets: null }) },
    { no: '↳', truck: own(5), im: im({}), dn: { points: ['Doukato', 'Epsilon'], date: 'Παρ 9', state: 'unknown' } },
  ] },
  { head: 'ΤΕΤΑΡΤΗ 7/10', today: false, rows: [] },
] };

test('counts: one tally behind the strip and every day header', () => {
  const all = WEEK.days.reduce((a, d) => a.concat(d.rows), []);
  assert.deepStrictEqual(WP.tally(all), { exports: 3, pallets: 40, palUnknown: 1, palMark: 0, empty: 1, noTruck: 1, dnNone: 1, upNone: 1, pre: 1, piece: 0, lot: 0 });
  const h = WP.intlHTML(WEEK);
  assert.match(h, /<b>3<\/b><span>εξαγωγές<\/span>/);
  for (const w of ['<b>1</b>κενό γύρισμα', '<b>1</b>χωρίς φορτηγό', '<b>1</b>κάθοδος χωρίς εθνικό', '<b>1</b>άνοδος χωρίς εθνικό', '<b>1</b>pre-order']) assert.ok(h.includes(w), w);
  // the marks under the headers are as many as the headers say
  const body = h.slice(h.indexOf('<tbody>'), h.indexOf('</tbody>'));
  assert.strictEqual((body.match(/>Κενό γύρισμα</g) || []).length, 1);
  assert.strictEqual((body.match(/class="tk x"/g) || []).length, 1);
  assert.strictEqual((body.match(/class="vs x"/g) || []).length, 2);
});

test('rows: a day without rows is not printed, today is the one blue day, unknown is never zero or «no truck»', () => {
  const h = WP.intlHTML(WEEK);
  assert.strictEqual((h.match(/<tr class="day/g) || []).length, 2);
  assert.strictEqual((h.match(/<tr class="day today"/g) || []).length, 1);
  assert.ok(!h.includes('ΤΕΤΑΡΤΗ 7/10'));
  assert.ok(h.includes('<td class="p">—</td>'), 'unknown export pallets are «—»');
  assert.ok(h.includes('20 π. +;'), 'a day sum with an unknown says so');
  assert.ok(h.includes('<span class="vs q"><span class="pt">Doukato</span><span class="pt">Epsilon</span></span>'), 'a national read that has not answered is its own state');
  assert.ok(h.includes('<span class="vs ok"><span class="pt">✓ Irinoupoli Sud</span><span class="pt">Beta Farm</span>'), 'the point, not the town; done = ✓');
  assert.ok(h.includes('Partner &lt;One&gt;') && !h.includes('<One>'), 'names are escaped');
  assert.ok(h.includes('1 εισαγωγή') === false && h.includes('1 εξαγωγή · 20 π.'), 'the day header counts its own rows');
});

test('stock marks and partly known pallets are said, and the legend explains only what the sheet holds', () => {
  const one = (row) => WP.intlHTML({ week: 1, range: '', stamp: '', days: [{ head: 'ΔΕΥΤΕΡΑ 12/10', today: false, rows: [row] }] });
  const plain = one({ no: 1, ex: ex({}), truck: own(1), im: im({}) });
  assert.ok(!/class="legend">[\s\S]*(Veroia Switch|Pre-order|ΑΠ |ΑΠΟΘΗΚΗ|\+;)/.test(plain), 'a plain week has a two-item legend');
  const h = one({ no: 1, ex: ex({ pallets: 22, palMiss: true, lot: true }), truck: own(1), im: im({ piece: true }) });
  assert.ok(h.includes('22<span class="more">+;</span>') && h.includes('<span>π. +;</span>'), 'the row and the masthead both say the sum is partial');
  assert.ok(h.includes('<span class="more">ΑΠ</span> <span class="cl">') && h.includes('<span class="more">→ ΑΠΟΘΗΚΗ</span>'));
  assert.ok(h.includes('ΑΠ από απόθεμα') && h.includes('παράδοση σε αποθήκη') && h.includes('παλέτες χωρίς καταγραφή'));
  // «+;» on an import alone still gets its legend line; a pre-order's 0 is not printed as a count
  const imOnly = one({ no: 1, ex: ex({}), truck: own(1), im: im({ pallets: 18, palMiss: true }) });
  assert.ok(imOnly.includes('18<span class="more">+;</span>') && imOnly.includes('παλέτες χωρίς καταγραφή') && !imOnly.includes('<span>π. +;</span>'));
  const preEx = one({ no: 1, ex: ex({ pre: true }), truck: own(1), im: im({ pre: true }) });
  assert.strictEqual((preEx.slice(preEx.indexOf('<tbody>'), preEx.indexOf('</tbody>')).match(/>Pre-order</g) || []).length, 2, 'an export pre-order is tagged too, each once');
  assert.ok(preEx.includes('<b>2</b>pre-order'));
  const pre0 = one({ no: 1, truck: { kind: 'none' }, im: im({ pre: true, pallets: 0 }) });
  assert.ok(pre0.includes('<td class="p"></td><td class="wr"></td></tr>'), 'no «0» for a pre-order');
});

test('a day of imports only says «εισαγωγές», never «0 εξαγωγές»', () => {
  const h = WP.intlHTML({ week: 1, range: '', stamp: '', days: [{ head: 'ΔΕΥΤΕΡΑ 12/10', today: false, rows: [{ no: 31, truck: { kind: 'none' }, im: im({}) }] }] });
  assert.ok(h.includes('<span>1 εισαγωγή</span>') && !h.includes('0 εξαγωγ'));
});

test('words: no code, no jargon, column headers written in capitals without tonos', () => {
  const h = WP.intlHTML(WEEK).replace(/<style>[\s\S]*?<\/style>/, '');
  assert.ok(!/RT-\d|κύκλ|σκέλ|κομμάτι|undefined|NaN|\[object/i.test(h));
  assert.ok(h.includes('>ΦΟΡΤΩΣΗ<') && h.includes('ΚΑΘΟΔΟΣ · ΠΑΡΑΔΟΣΗ ΣΕ') && h.includes('ΦΟΡΤΗΓΟ · ΘΑΛΑΜΟΣ'));
  assert.ok(!/text-transform:\s*uppercase/.test(WP.intlHTML(WEEK)), 'CSS upper-casing keeps the Greek tonos');
});

test('size: a normal week fills one page, 52 trucks fit two, rows never under 4.4mm', () => {
  assert.deepStrictEqual(WP.size(18, 7), { pages: 1, rh: 5.83, fs: 8.5 });
  const big = WP.size(62, 7);
  assert.strictEqual(big.pages, 2);
  assert.ok(big.rh >= 4.4 && big.fs >= 7.6 && big.fs <= 8.5, JSON.stringify(big));
  for (let n = 1; n < 200; n++) { const s = WP.size(n, 7); assert.ok(s.rh >= WP.PAGE.minRow && s.rh <= WP.PAGE.maxRow, n + ' ' + JSON.stringify(s)); }
  assert.strictEqual(WP.size(0, 0).pages, 1);
});

test('the board prints through the paper, and the paper never recomputes the board', () => {
  const v2 = fs.readFileSync(path.join(__dirname, '../modules/weekly_intl_v2.js'), 'utf8');
  assert.ok(v2.includes('onclick="WIV2.printWeek()">Εκτύπωση εβδομάδας</button>'), 'the «Προβολή» menu entry');
  assert.ok(/printWeek, _paperModel,/.test(v2));
  const src = fs.readFileSync(path.join(__dirname, '../core/week-paper.js'), 'utf8');
  assert.ok(!/WINTL|WI_INTERNAL|document\.|atGet|fetch\(/.test(src), 'pure: no board, no DOM, no network');
});

test('owner + Pantelis 10/11: every national point with its day, the import days beside their points, the trailer plate', () => {
  const h = WP.intlHTML({ week: 46, range: 'r', stamp: 's', days: [{ head: 'ΔΕΥΤΕΡΑ 9/11', rows: [
    { no: 1, up: { points: ['Alpha Depot, Athens', 'Beta Farm', 'Gamma Coop'], date: 'Σάβ 7', state: 'plan' },
      ex: ex({}), truck: { kind: 'own', plate: 'TST-1', trailer: 'TRL-9', name: 'Driver 1' },
      im: im({ load: 'Τρί 10', del: '≈Τετ 11', dest: 'Βέροια' }), dn: { points: ['Delta Cash', 'Epsilon Market'], date: 'Πέμ 12', state: 'none' } },
    { no: 2, ex: ex({}), truck: { kind: 'par', name: 'Partner One', plates: 'PRT-1 / PRT-2' } }] }] });
  // all three loading points, none hidden behind «+2», the day first
  assert.ok(h.includes('<div class="vw"><span class="vd">Σάβ 7</span><span class="vs"><span class="pt">Alpha Depot</span><span class="pt">Beta Farm</span><span class="pt">Gamma Coop</span></span></div>'));
  // both delivery points, red dashed (no national truck), the day last
  assert.ok(h.includes('<div class="vw r"><span class="vs x"><span class="pt">Delta Cash</span><span class="pt">Epsilon Market</span></span><span class="vd">Πέμ 12</span></div>'));
  // the import: loading day before it, delivery day after it, in cells of their own
  assert.ok(/<td class="dt">Τρί 10<\/td><td class="wr">.*?Βέροια<\/td><td class="dt">≈Τετ 11<\/td>/.test(h));
  assert.ok(h.includes('<span class="pl">TST-1</span><span class="tr">· TRL-9</span><span class="dr">Driver 1</span>'));
  assert.ok(h.includes('<span class="dr">Partner One</span><span class="tr">PRT-1 / PRT-2</span>'));
  // every row has the eleven cells of the header
  const cells = (h.match(/<tr class="f[^"]*">(.*?)<\/tr>/) || [])[1].match(/<td/g).length;
  assert.strictEqual(cells, 11);
});


// ─── The national sheet ───────────────────────────────────────────────────────────────────────────────────────
const WN5L = require('../core/wn5-logic.js');
const BOARD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/wn5-week.json'), 'utf8'));
function natl(platesOf, today) {
  const m = WN5L.model(BOARD, { today: today || '2026-10-12', place: (id) => ({ name: 'Τόπος ' + id }) });
  const p = WP.natlModel(BOARD, m, { numbers: WN5L.boardNumbers(m), platesOf, weekNoOf: () => 43, weekNo: 42, range: '10–16 Οκτωβρίου', stamp: 'Δευ 12/10 09:00' });
  return { m, p, h: WP.natlHTML(p) };
}

test('national: every row of the board is on the sheet, with the board\'s own numbers', () => {
  const { m, p, h } = natl(() => []);
  const boardRows = m.days.reduce((a, d) => a + d.rows.length + d.rows.reduce((b, r) => b + (r.rota || []).length, 0), 0);
  const rows = p.days.reduce((a, d) => a.concat(d.rows), []);
  assert.strictEqual(rows.length, boardRows);
  assert.strictEqual((h.match(/<tr class="(?!day)[^"]*"><td class="i">/g) || []).length, boardRows);
  const nums = WN5L.boardNumbers(m);
  assert.deepStrictEqual(rows.filter((r) => r.kind === 'cycle' && r.no !== '').map((r) => r.no), [...nums.values()]);
  assert.strictEqual(WP.natlTally(p).trips, BOARD.cycles.length);
});

test('national: the strip and the day headers count the marks drawn', () => {
  const { p, h } = natl(() => []);
  const T = WP.natlTally(p);
  const body = h.slice(h.lastIndexOf('<tbody>'));
  assert.strictEqual((body.match(/class="tk x"/g) || []).length, T.dnNone + T.upNone);
  assert.strictEqual((body.match(/>Χωρίς άνοδο</g) || []).length, T.noUp);
  assert.ok(T.dnNone > 0 && T.noUp > 0, 'the fixture holds both');
  const strip = h.slice(h.indexOf('class="act"'), h.indexOf('class="h"'));
  assert.ok(strip.includes(`<b>${T.dnNone}</b>κάθοδοι χωρίς φορτηγό`) && strip.includes(`<b>${T.noUp}</b>δρομολόγιο χωρίς άνοδο`), strip);
});

test('national ledger: international pallets per day at Veroia, with a truck from the stops, without from the waiting rows', () => {
  const { m, p } = natl(() => []);
  // with a truck = every vs_import leg loaded at a Veroia stop of a cycle THAT HAS A VEHICLE; a trip still without
  // one is work: its pallets are «χωρίς φορτηγό», with a name
  let want = 0, bare = 0, bareTrips = 0;
  for (const c of BOARD.cycles) for (const s of c.stops) if (Number(s.location_id) === m.hubId) {
    const pal = s.legs.filter((l) => l.kind === 'vs_import' && l.act === 'load').reduce((a, l) => a + l.pallets, 0);
    if (!pal) continue;
    if (s.has_vehicle === true) want += pal; else { bare += pal; bareTrips++; }
  }
  assert.strictEqual(p.ledger.reduce((a, l) => a + l.dn.w, 0), want);
  assert.ok(want > 0 && bare > 0, 'the fixture holds a VS trip with a truck and one without');
  // without = the pallets of the VS rows no truck has taken + those trips
  const rows = m.days.reduce((a, d) => a.concat(d.rows), []).filter((r) => r.kind === 'unassigned' && r.vs);
  assert.strictEqual(p.ledger.reduce((a, l) => a + l.dn.x + l.up.x, 0), rows.reduce((a, r) => a + (r.kath || r.anod).pallets, 0) + bare);
  assert.strictEqual(p.ledger.reduce((a, l) => a + l.dn.items.length + l.up.items.length, 0), rows.length + bareTrips);
  assert.strictEqual(p.ledger.filter((l) => !l.tone).length >= 7, true, 'the seven days are always listed');
});

test('national plates: read = the plate in the blue box; not read = said, never an empty or wrong box', () => {
  const some = natl((id) => (id === 2101 ? ['TST-9001', 'TST-9002'] : []));
  assert.ok(some.h.includes('<span class="mono">TST-9001 · TST-9002</span>'));
  assert.strictEqual(some.p.platesUnread, false);
  assert.ok(!some.h.includes('διεθνές ;'));
  const none = natl(() => undefined);
  assert.strictEqual(none.p.platesUnread, true);
  assert.ok(none.h.includes('διεθνές ;') && none.h.includes('η πινακίδα δεν διαβάστηκε'));
  assert.ok(!/TST-900\d/.test(none.h));
});

test('national words and days: no code, no jargon; empty days are one line; a done side is grey with a tick', () => {
  const { h, p } = natl(() => []);
  const text = h.replace(/<style>[\s\S]*?<\/style>/, '');
  assert.ok(!/RT-|κύκλ|σκέλ|κομμάτι|undefined|NaN|\[object/i.test(text), (text.match(/RT-\S*|κύκλ\S*|σκέλ\S*|κομμάτι|undefined|NaN/i) || [])[0]);
  assert.ok(/ΣΑΒΒΑΤΟ 10 – ΚΥΡΙΑΚΗ 11\/10<span class="mu">κανένα δρομολόγιο/.test(h), 'a run of empty days before today is one quiet line');
  assert.ok(h.includes('<span class="tick">✓</span>'));
  assert.strictEqual((h.match(/<tr class="day today"/g) || []).length, 1);
  assert.ok(p.days.every((d) => d.rows.every((r) => r.kind !== 'cycle' || r.truck.kind !== undefined)));
});

test('the national screen prints through the paper', () => {
  const v5 = fs.readFileSync(path.join(__dirname, '../modules/weekly_natl_v5.js'), 'utf8');
  assert.ok(v5.includes('data-act="print-week" title="Εκτύπωση εβδομάδας"') && v5.includes('onclick="WN5.printWeek()"') && /printWeek, _intlPlates,/.test(v5));
});

test('national: what is over is not work — a done descent has no «Χωρίς άνοδο», an empty day behind today is quiet', () => {
  const late = natl(() => [], '2026-10-16');   // Friday: Tuesday's descents are done by then? only if the base says so (side_dim)
  const rows = late.p.days.reduce((a, d) => a.concat(d.rows), []);
  for (const r of rows.filter((x) => x.noUp)) assert.strictEqual(r.dn.done, false, 'a done descent is never counted as work');
  const b = JSON.parse(JSON.stringify(BOARD));
  // the base marks a whole own descent done: its trip leaves the strip
  const m0 = WN5L.model(BOARD, { today: '2026-10-12' });
  const open = m0.days.reduce((a, d) => a.concat(d.rows), []).find((r) => r.kind === 'cycle' && r.kath && r.anod && r.anod.gap && r.tiles[0].type === 'own');
  assert.ok(open, 'the fixture holds an own trip with no ascent');
  for (const c of b.cycles) if (c.rt_id === open.rtId) for (const st of c.stops) { st.executed = true; st.dim = true; st.side_dim = true; }
  const m1 = WN5L.model(b, { today: '2026-10-16' });
  const p1 = WP.natlModel(b, m1, { numbers: WN5L.boardNumbers(m1), platesOf: () => [] });
  assert.strictEqual(WP.natlTally(p1).noUp, WP.natlTally(natl(() => []).p).noUp - 1);
  assert.ok(/<span class="mu">κανένα δρομολόγιο/.test(late.h) && !/<span class="w">κανένα δρομολόγιο/.test(late.h), 'every empty day is behind Friday');
  const noToday = WN5L.model(BOARD, {});
  const pn = WP.natlModel(BOARD, noToday, { numbers: WN5L.boardNumbers(noToday), platesOf: () => [] });
  assert.ok(!/<span class="w">κανένα δρομολόγιο/.test(WP.natlHTML(pn)), 'today unknown: an empty day is never painted as work');
});

test('national: a missing driver comes from the base\'s field, a rota line never counts a second missing truck', () => {
  const b = JSON.parse(JSON.stringify(BOARD));
  const c = b.cycles.find((x) => x.trip_type === 'OWNED' && x.driver);
  c.driver = null; c.driver_id = null;
  const m = WN5L.model(b, { today: '2026-10-12' });
  const p = WP.natlModel(b, m, { numbers: WN5L.boardNumbers(m), platesOf: () => [] });
  assert.strictEqual(WP.natlTally(p).noDriver, 1);
  assert.ok(WP.natlHTML(p).includes('<span class="gap">χωρίς οδηγό</span>'));
  const fake = { week: 1, range: '', stamp: '', ledger: [], days: [{ date: '2026-10-12', head: 'ΔΕΥΤΕΡΑ 12/10', today: false, ahead: false, rows: [
    { no: 1, kind: 'cycle', truck: { kind: 'none' }, dn: { dates: 'Δευ 12', from: { name: 'Α', more: 0 }, to: { name: 'Β', more: 0 }, pallets: 5, done: false }, up: null, noUp: false },
    { no: '↳', kind: 'rota', truck: { kind: 'none' }, dn: { dates: 'Δευ 12', from: { name: 'Γ', more: 0 }, to: { name: 'Δ', more: 0 }, pallets: 2, done: false }, up: null, noUp: false }] }] };
  assert.strictEqual(WP.natlTally(fake).dnNone, 1);
  assert.ok(WP.natlHTML(fake).includes('<span class="w">1 χωρίς φορτηγό</span>'));
});

test('national ledger: an overdue trip without a truck stays («Εκκρεμή»), one with a truck belongs to its own week, a stop with no day is said', () => {
  const b = JSON.parse(JSON.stringify(BOARD));
  const hub = WN5L.model(BOARD, {}).hubId;
  const stops = b.cycles.flatMap((c) => c.stops).filter((s) => Number(s.location_id) === hub && s.legs.some((l) => l.kind === 'vs_import' && l.act === 'load'));
  const withV = stops.find((s) => s.has_vehicle === true), bare = stops.find((s) => s.has_vehicle !== true);
  assert.ok(withV && bare);
  const palOf = (s) => s.legs.filter((l) => l.kind === 'vs_import' && l.act === 'load').reduce((a, l) => a + l.pallets, 0);
  const base = natl(() => []).p, sumW = (p) => p.ledger.reduce((a, l) => a + l.dn.w, 0);
  withV.stop_day = '2026-10-09'; bare.stop_day = '2026-10-08';
  const m = WN5L.model(b, { today: '2026-10-12' });
  const p = WP.natlModel(b, m, { numbers: WN5L.boardNumbers(m), platesOf: () => [] });
  assert.strictEqual(sumW(p), sumW(base) - palOf(withV), 'a truck that loaded before the week is the earlier sheet\'s');
  const old = p.ledger.find((l) => l.tone === 'am');
  assert.ok(old && old.dn.x >= palOf(bare) && old.dn.w === 0 && old.note === 'από 8/10', JSON.stringify(old));
  bare.stop_day = null; bare.planned_to = null;
  const m2 = WN5L.model(b, { today: '2026-10-12' });
  const p2 = WP.natlModel(b, m2, { numbers: WN5L.boardNumbers(m2), platesOf: () => [], dayOf: () => null });
  assert.strictEqual(p2.noDay, 1);
  assert.ok(WP.natlHTML(p2).includes('1 στάση Βέροιας χωρίς ημέρα δεν μετρήθηκε'));
});

test('live week 46 (10/11): long names take lines, and the page arithmetic counts them', () => {
  const long = { no: 1, up: { points: ['A', 'B', 'C'], date: 'Τετ 4', state: 'plan' }, ex: ex({ client: 'A CLIENT WITH A LONG NAME GmbH', dest: 'A Destination With A Long Name AT' }), truck: own(1) };
  const short = { no: 2, ex: ex({}), truck: own(2) };
  const mk = (r) => ({ week: 1, range: 'r', stamp: 's', days: [{ head: 'D', rows: Array.from({ length: 24 }, () => r) }] });
  const rh = (h) => +h.match(/--rh:([\d.]+)mm/)[1];
  // the same number of rows needs more room when each takes three lines: shorter rows, or a page more
  assert.ok(rh(WP.intlHTML(mk(long))) < rh(WP.intlHTML(mk(short))));
  // the cells that hold words may wrap; pallets and days never do
  const h = WP.intlHTML(mk(long));
  assert.ok(h.includes('<td class="wr">') && /<td class="p">20<\/td>/.test(h) && !/<td class="(p|dt)[^"]*wr/.test(h));
});
