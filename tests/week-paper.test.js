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
const im = (o) => Object.assign({ dates: 'Τετ 7 → Παρ 9', client: 'ΠΕΛΑΤΗΣ Β', dest: 'Delta Cash', more: 0, pallets: 10, done: false, pre: false }, o);
const WEEK = { week: 41, range: '3–9 Οκτωβρίου', stamp: 'Τρί 6/10 09:40', days: [
  { head: 'ΔΕΥΤΕΡΑ 5/10', today: false, rows: [
    { no: 1, up: { name: 'Irinoupoli Sud (ΟΤ 12), Aspropyrgos', more: 2, state: 'done' }, ex: ex({ done: true }), truck: own(1), im: im({ dest: 'Βέροια' }), dn: { name: 'Lidl Trikala', more: 0, state: 'none' } },
    { no: 2, up: { name: 'Knosos', more: 0, state: 'none' }, ex: ex({ pallets: null }), truck: own(2), gap: true },
  ] },
  { head: 'ΤΡΙΤΗ 6/10', today: true, rows: [
    { no: 3, ex: ex({ more: 3 }), truck: { kind: 'par', name: 'Partner <One>' } },
    { no: 4, truck: { kind: 'none' }, im: im({ pre: true, pallets: null }) },
    { no: '↳', truck: own(5), im: im({}), dn: { name: 'Doukato', more: 1, state: 'unknown' } },
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
  assert.ok(h.includes('class="vs q">Doukato +1'), 'a national read that has not answered is its own state');
  assert.ok(h.includes('class="vs ok">✓ Irinoupoli Sud +2'), 'the point, not the town; done = ✓');
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
  assert.ok(pre0.includes('<td class="p"></td><td></td></tr>'), 'no «0» for a pre-order');
});

test('a day of imports only says «εισαγωγές», never «0 εξαγωγές»', () => {
  const h = WP.intlHTML({ week: 1, range: '', stamp: '', days: [{ head: 'ΔΕΥΤΕΡΑ 12/10', today: false, rows: [{ no: 31, truck: { kind: 'none' }, im: im({}) }] }] });
  assert.ok(h.includes('<span>1 εισαγωγή</span>') && !h.includes('0 εξαγωγ'));
});

test('words: no code, no jargon, column headers written in capitals without tonos', () => {
  const h = WP.intlHTML(WEEK).replace(/<style>[\s\S]*?<\/style>/, '');
  assert.ok(!/RT-\d|κύκλ|σκέλ|κομμάτι|undefined|NaN|\[object/i.test(h));
  assert.ok(h.includes('>ΦΟΡΤΩΣΗ<') && h.includes('ΚΑΘΟΔΟΣ · ΠΡΟΣ'));
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
