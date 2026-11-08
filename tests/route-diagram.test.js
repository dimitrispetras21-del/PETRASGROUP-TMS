// node --test tests/route-diagram.test.js
// The route diagram (owner 8/11/2026: «το feature με το διάγραμμα» in Weekly National v5, «Παραγγελίες › Εβδομάδα»,
// «Παλέτες › Εβδομάδα»). The REAL core/wn5-logic.js, core/wn5-labels.js, core/route-diagram.js and
// core/route-diagram-adapters.js run in a vm with the synthetic cases of tests/fixtures/route-diagram-cases.js —
// the same list the preview page tests/critics/route-diagram-preview.html draws. One test per case family of
// docs/order-route/CASES.md / RT-CASES.md, the ⇄ rows, the missing-data states and escaping.
// vm objects come from another realm: compare them as plain JSON (eq), never by prototype.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const sb = { console };
sb.window = sb;
vm.createContext(sb);
for (const f of ['core/wn5-logic.js', 'core/wn5-labels.js', 'core/route-diagram.js', 'core/route-diagram-adapters.js', 'tests/fixtures/route-diagram-cases.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
}
const { RouteDiagram: RD, RouteDiagramAdapters: A, RD_CASES } = sb;
const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);
const byId = (id) => { const c = RD_CASES.cases.find((x) => x.id === id); assert.ok(c, 'case ' + id); return c; };
const model = (id, i) => { const ins = [].concat(byId(id).build(A)); return RD.build(ins[i || 0]); };
const html = (id, i) => RD.html(model(id, i));
// a compact picture of a section: kind/dot(+flag)(#tag) per row, executor bars as ex:who
const pic = (sec) => sec.rows.map((r) => (r.kind === 'executor' ? 'ex:' + r.who + (r.done ? '(done)' : '')
  : r.kind[0] + '/' + r.dot + (r.flag ? '!' + r.flag.text : '') + (r.tag ? '#' + r.tag.text : ''))).join(' ');
const titles = (m) => m.sections.map((s) => s.title + (s.chip ? ' ' + s.chip : ''));

test('every designed case builds and renders, with no thrown error and no empty route', () => {
  const ids = RD_CASES.cases.map((c) => c.id);
  // CASES.md Δ1–Δ20 without the abolished Δ18 (owner 26/10), Π (with data-less cases), Ν1–Ν8; RT-CASES.md RT0–RT20
  for (const want of ['Δ1', 'Δ2', 'Δ3', 'Δ4', 'Δ5', 'Δ6', 'Δ7', 'Δ8', 'Δ9', 'Δ10', 'Δ11', 'Δ12', 'Δ13', 'Δ14', 'Δ15', 'Δ16', 'Δ17', 'Δ19', 'Δ20',
    'Π1', 'Π2', 'Π4', 'Π5', 'Π6', 'Π8', 'Π9', 'Π11', 'Ν1', 'Ν2', 'Ν3', 'Ν4', 'Ν5', 'Ν6', 'Ν7', 'Ν8',
    ...Array.from({ length: 21 }, (_, i) => 'RT' + i)]) assert.ok(ids.includes(want), 'missing case ' + want);
  assert.ok(!ids.includes('Δ18'), 'Δ18 was abolished by the owner 26/10');
  for (const c of RD_CASES.cases) {
    for (const input of [].concat(c.build(A))) {
      const m = RD.build(input);
      const h = RD.html(m);
      assert.ok(h.startsWith('<div class="rd">'), c.id);
      assert.ok(m.empty || m.sections.some((s) => s.rows.length), c.id + ' drew nothing and said nothing');
    }
  }
});

test('Δ1/Δ2/Δ6/Δ14 plain orders: one section, one row per stop, the executor bar last; delivered dims the bar', () => {
  const d1 = model('Δ1');
  eq(titles(d1), ['ΕΞΑΓΩΓΗ #901']);
  assert.strictEqual(pic(d1.sections[0]), 's/done s/done ex:own(done)');
  assert.strictEqual(d1.sections[0].aside, 'παραδόθηκε');
  assert.strictEqual(d1.sections[0].rows[0].dayText, 'Δευ 19/10');
  eq(d1.sections[0].rows[1].meta.map((x) => x.text), ['Πόλη HR, HR', '26π']);
  assert.strictEqual(d1.sections[0].rows[0].nameTone, 'done');
  assert.strictEqual(pic(model('Δ2').sections[0]).split(' ').length, 6);
  const d6 = model('Δ6');
  assert.strictEqual(d6.sections[0].aside, 'PE · 4°');
  assert.strictEqual(d6.sections[0].rows[0].dayText, 'Δευ 26/10 · σήμερα');
  assert.strictEqual(d6.sections[0].rows[0].dayTone, 'today');
  assert.strictEqual(pic(model('Δ14').sections[0]), 's/future s/future ex:own');
});

test('Δ3/Δ8/Δ11/Π1/Π9 VS: the Veroia boundary splits the order between the two desks, cross-dock in the international part', () => {
  const d8 = model('Δ8');
  eq(titles(d8), ['ΕΙΣΑΓΩΓΗ #910', 'ΕΘΝΙΚΟ ΣΚΕΛΟΣ NL 910']);
  assert.strictEqual(pic(d8.sections[0]), 's/missed!δεν σημειώθηκε s/missed!δεν σημειώθηκε c/today ex:own');
  assert.strictEqual(pic(d8.sections[1]), 's/unassigned s/unassigned s/unassigned ex:none');
  assert.strictEqual(d8.sections[1].rows[3].text, 'Εθνικών · χωρίς ανάθεση');
  const cd = d8.sections[0].rows[2];
  assert.strictEqual(cd.label, 'Cross-dock');
  assert.ok(cd.vs);
  eq(cd.meta.map((x) => x.text), ['32π', 'όριο']);
  // export VS: the national leg comes FIRST (Greek points → Veroia), then cross-dock → abroad
  eq(titles(model('Δ3')), ['ΕΘΝΙΚΟ ΣΚΕΛΟΣ NL 903', 'ΕΞΑΓΩΓΗ #903']);
  assert.strictEqual(pic(model('Δ3').sections[1]), 'c/node s/future ex:own');
  assert.strictEqual(pic(model('Δ11').sections[1]), 's/future ex:partner');
  assert.strictEqual(pic(model('Π1').sections[0]), 's/future s/future c/node ex:own');
  assert.strictEqual(pic(model('Π9').sections[0]), 's/future c/node ex:partner');
});

test('Δ4/Π5 Veroia as a plain place or VS closed: no cross-dock row is invented', () => {
  for (const id of ['Δ4', 'Π5']) assert.ok(!model(id).sections[0].rows.some((r) => r.kind === 'crossdock'), id);
});

test('Δ5/RT8 split leg: ΑΡΧΙΚΟ → ⇄ Μεταφόρτωση at the join → ΤΕΛΙΚΟ, one executor bar per leg', () => {
  const s = model('Δ5').sections[0];
  assert.strictEqual(pic(s), 's/missed!δεν σημειώθηκε#ΑΡΧΙΚΟ h/handover s/done#ΤΕΛΙΚΟ ex:own ex:partner');
  const h = s.rows[1];
  assert.strictEqual(h.label, 'Μεταφόρτωση');
  assert.strictEqual(h.name, 'Σημείο SI');
  eq(h.meta.map((x) => x.text), ['τέλος #906 · αρχή #907']);
  assert.strictEqual(pic(model('RT8').sections[0]), 's/done#ΑΡΧΙΚΟ h/handover s/done#ΤΕΛΙΚΟ ex:own ex:partner');
});

test('Δ7/S-country N2: a place known to have no country says «χώρα;» in red, never a guessed GR', () => {
  const r = model('Δ7').sections[0].rows[1];
  eq(r.meta, [{ text: 'Πόλη Χ', tone: null }, { text: 'χώρα;', tone: 'red' }, { text: '8π', tone: null }]);
  const b = model('S-country').sections[0].rows;
  eq(b[0].meta.map((x) => x.text), ['GR', '6π']);
  eq(b[1].meta[0], { text: 'χώρα;', tone: 'red' });
  // a country nobody asked for (no countryOf) is simply not printed
  const plain = RD.build(A.boardCycle(byIdCycle('S-country'), { today: '2026-10-26', hubId: 360 }));
  eq(plain.sections[0].rows[1].meta.map((x) => x.text), ['6π']);
  assert.ok(!html('Ν1').includes('χώρα;'));
});

test('Δ9/Δ10 Bulgaria: same grammar, only the country changes (K5)', () => {
  eq(model('Δ9').sections[0].rows.slice(1, 3).map((r) => r.meta[0].text), ['Πόλη BG1, BG', 'Πόλη BG2, BG']);
  eq(model('Δ10').sections[0].rows.slice(1, 3).map((r) => r.meta[0].text.slice(-2)), ['BG', 'GR']);
});

test('Δ12/Δ17/Ν8 stock: «Από απόθεμα» first / «Σε απόθεμα» last, amber node dot', () => {
  const d12 = model('Δ12').sections[0].rows[0];
  assert.strictEqual(d12.label, 'Από απόθεμα');
  assert.strictEqual(d12.dot, 'node');
  const d17 = model('Δ17').sections[0].rows;
  assert.strictEqual(d17[d17.length - 2].label, 'Σε απόθεμα');
  assert.strictEqual(model('Ν8').sections[0].rows[0].label, 'Από απόθεμα');
});

test('Δ13/Ν7/RT9 partner: the green bar «… · συνεργάτης»', () => {
  const ex = model('Δ13').sections[0].rows.find((r) => r.kind === 'executor');
  assert.strictEqual(ex.text, 'Διεθνών · συνεργάτης');
  assert.match(html('Δ13'), /class="rd-ex" data-who="partner"/);
  assert.strictEqual(model('Ν7').sections[0].rows.find((r) => r.kind === 'executor').text, 'Εθνικών · συνεργάτης');
  assert.ok(model('RT9').sections.every((s) => s.rows.some((r) => r.who === 'partner')));
});

test('Δ15/RT14 third-party warehouse and Δ19/RT15 customs: amber nodes with «—» day and amber notes (card values)', () => {
  const d15 = model('Δ15').sections[0];
  assert.strictEqual(pic(d15), 's/done n/node c/node s/today ex:own');
  const w = d15.rows[1];
  assert.strictEqual(w.label, 'Φόρτωση · αποθήκη τρίτου');
  assert.strictEqual(w.dayText, '—');
  eq(w.notes, [{ tone: 'amber', text: '7 π. φεύγουν με την #918 →' }]);
  assert.strictEqual(model('RT14').sections[0].rows[1].label, 'Φόρτωση · αποθήκη τρίτου');
  eq(model('Δ19').sections[0].rows.slice(1, 4).map((r) => r.label), ['Τελωνείο', 'Σύνορα', 'Τελωνείο']);
  assert.ok(model('RT15').sections[0].rows.some((r) => r.label === 'Σύνορα'));
});

test('Δ16 load between deliveries: «Παράδοση + φόρτωση» and the notes-only load in amber', () => {
  const r = model('Δ16').sections[0].rows[2];
  assert.strictEqual(r.label, 'Παράδοση + φόρτωση');
  assert.strictEqual(r.notes[0].tone, 'amber');
});

test('Δ20/Π8 client vehicle and local driver: their bars, and the ⇄ «Μεταφόρτωση» at Veroia', () => {
  const s = model('Δ20').sections[0];
  assert.strictEqual(pic(s), 'h/handover s/future ex:client ex:own');
  eq(s.rows.filter((r) => r.kind === 'executor').map((r) => r.text), ['Διεθνών · όχημα πελάτη', 'Διεθνών · δικό μας φορτηγό']);
  assert.strictEqual(model('Π8').sections[0].rows[2].text, 'Εθνικών · τοπικός οδηγός');
});

test('Π2/Π4/Π6 national parts: the same truck, two national trucks as per-stop tags, pieces joining at Veroia', () => {
  assert.strictEqual(model('Π2').sections[1].rows[1].text, 'Εθνικών · το ίδιο διεθνές φορτηγό');
  eq(model('Π4').sections[1].rows.slice(0, 3).map((r) => r.tag), [{ text: 'ΕΘΝΙΚΟ ΦΟΡΤΗΓΟ 2', seg: null }, { text: 'ΕΘΝΙΚΟ ΦΟΡΤΗΓΟ 2', seg: null }, { text: 'ΕΘΝΙΚΟ ΦΟΡΤΗΓΟ 3', seg: null }]);
  eq(model('Π4').kv, [{ k: 'Παλέτες', v: '25 = 20 φορτηγό 2 · 5 φορτηγό 3', tone: null }]);
  eq(titles(model('Π6')), ['ΑΝΟΔΟΣ NL 927', 'ΕΞΑΓΩΓΗ #927']);
});

test('Ν1–Ν6 national cycles from the v5 board: ΚΑΘΟΔΟΣ / ΑΝΟΔΟΣ sections; Veroia without a VS leg is an ordinary stop (card RT17)', () => {
  eq(titles(model('Ν1')), ['ΚΑΘΟΔΟΣ']);
  assert.strictEqual(pic(model('Ν2').sections[0]), 's/future s/future s/future s/future ex:own');
  assert.strictEqual(model('Ν2').sections[0].rows[0].label, 'Φόρτωση');
  eq(titles(model('Ν3')), ['ΑΝΟΔΟΣ']);
  assert.strictEqual(model('Ν3').sections[0].rows[1].label, 'Παράδοση');
  // Ν4: one unknown pallet count makes the Veroia sum unknown («;π»), never a smaller number
  eq(model('Ν4').sections[0].rows[3].meta.map((x) => x.text), ['GR', ';π']);
  assert.strictEqual(model('Ν6').sections[0].rows[0].kind, 'stop');
});

test('RT0 empty or cancelled RT and S-K0 order without stops: said, never an empty panel', () => {
  const rt0 = model('RT0');
  eq(rt0.sections, []);
  assert.strictEqual(rt0.empty, 'Ακυρωμένο δρομολόγιο · χωρίς σκέλος.');
  assert.match(html('RT0'), /class="rd-empty">Ακυρωμένο δρομολόγιο/);
  assert.strictEqual(model('S-K0').empty, 'Η παραγγελία δεν έχει στάσεις.');
});

test('RT1 the Figma frame 2283:10025: export delivered, import VS with two unmarked loadings and cross-dock today, national leg unassigned', () => {
  const m = model('RT1');
  eq(titles(m), ['ΕΞΑΓΩΓΗ #930', 'ΕΙΣΑΓΩΓΗ #931', 'ΕΘΝΙΚΟ ΣΚΕΛΟΣ NL 931']);
  eq(m.sections.map(pic), ['s/done s/done ex:own(done)', 's/missed!δεν σημειώθηκε s/missed!δεν σημειώθηκε c/today ex:own',
    's/unassigned s/unassigned s/unassigned ex:none']);
  eq(m.sections.map((s) => s.aside), ['παραδόθηκε', 'PE · 4°', null]);
  assert.strictEqual(m.sections[1].rows[2].dayText, 'Δευ 26/10 · σήμερα');
  // lines: every point but the last of its section
  eq(m.sections[1].rows.map((r) => r.line), [true, true, false, false]);
});

test('RT2–RT7, RT13 international RTs through facadeRt: one section per order in RT order (rota, groupage, return via Veroia)', () => {
  eq(titles(model('RT2')), ['ΕΞΑΓΩΓΗ #932']);
  eq(titles(model('RT3')), ['ΕΙΣΑΓΩΓΗ #933']);
  eq(titles(model('RT4')), ['ΕΞΑΓΩΓΗ #934', 'ΕΙΣΑΓΩΓΗ #935', 'ΕΙΣΑΓΩΓΗ #936']);
  assert.strictEqual(model('RT5').sections[0].title, 'GROUPAGE ΕΞΑΓΩΓΩΝ · 3 παραγγελίες');
  assert.strictEqual(model('RT5').sections[0].rows[1].dayText, 'Πέμ 29 – Παρ 30/10');
  assert.strictEqual(model('RT6').sections.length, 4);
  eq(titles(model('RT7')), ['ΕΘΝΙΚΟ ΣΚΕΛΟΣ NL 945', 'ΕΞΑΓΩΓΗ #945', 'ΕΞΑΓΩΓΗ #946', 'ΕΙΣΑΓΩΓΗ #947']);
  eq(titles(model('RT13')), ['ΕΞΑΓΩΓΗ #956', 'ΕΙΣΑΓΩΓΗ #957', 'ΕΘΝΙΚΟ ΣΚΕΛΟΣ NL 957', 'ΕΙΣΑΓΩΓΗ #958']);
});

test('RT10/RT11/RT16 the same vehicle twice: side-by-side inputs and the overlapping days in orange', () => {
  const two = [].concat(byId('RT10').build(A));
  assert.strictEqual(two.length, 2);
  assert.strictEqual(RD.build(two[0]).sections[0].rows[1].dayTone, 'overlap');
  assert.strictEqual(RD.build(two[1]).sections[0].rows[0].dayTone, 'overlap');
  assert.match(RD.render(two[0]), /class="rd-day" data-tone="overlap"/);
  eq(model('RT11').sections[0].rows.slice(0, 2).map((r) => r.dayTone), ['overlap', 'overlap']);
  assert.strictEqual([].concat(byId('RT16').build(A)).length, 3);
});

test('RT12/RT20 national cycle down and up, mixed VS and national legs: the hub is the cross-dock only with a VS leg', () => {
  eq(model('RT12').sections.map(pic), ['c/node s/missed!δεν σημειώθηκε ex:own', 's/today c/node ex:own']);
  const rt20 = model('RT20');
  eq(rt20.sections.map((s) => s.rows.filter((r) => r.kind !== 'executor').map((r) => r.kind)), [['crossdock', 'stop', 'stop'], ['stop', 'crossdock']]);
  assert.strictEqual(rt20.sections[0].rows[2].label, 'Παράδοση + φόρτωση');
});

test('⇄ RT17 vehicle change: ΑΡΧΙΚΟ / ΤΕΛΙΚΟ tags, the row after the last stop of ΑΡΧΙΚΟ, from WN5L (not a second rule)', () => {
  const m = model('RT17');
  eq(m.sections.map(pic), ['s/future#ΑΡΧΙΚΟ h/handover s/future#ΤΕΛΙΚΟ', 's/future#ΤΕΛΙΚΟ s/future#ΤΕΛΙΚΟ']);
  const h = m.sections[0].rows[1];
  assert.strictEqual(h.label, 'Αλλαγή οχήματος');
  assert.strictEqual(h.name, 'Πόλη Β');
  assert.strictEqual(h.dayText, 'Τρί 10:30');
  eq(h.meta.map((x) => x.text), ['τέλος ΑΡΧΙΚΟΥ · αρχή ΤΕΛΙΚΟΥ', 'Προγραμματισμένη αλλαγή φορτηγού']);
  assert.strictEqual(m.sections[0].rows[0].dayText, 'Τρί 06:00');
  // RT17 card: each point names its segment's vehicle, and no executor bar
  eq(m.sections[0].rows[0].meta.map((x) => x.text), ['GR', '20π', 'φορτηγό Α · οδηγός Α']);
  assert.ok(!m.sections.some((s) => s.rows.some((r) => r.kind === 'executor')));
  assert.match(RD.html(m), /<span class="rd-hand" aria-hidden="true">⇄<\/span>/);
  assert.match(RD.html(m), /class="rd-tag" data-seg="initial">ΑΡΧΙΚΟ/);
  // the board's own rule decides the handover: break WN5L.handoversOf and the ⇄ row disappears
  const real = sb.WN5L;
  const fake = Object.assign({}, real, { handoversOf: () => [] });
  const without = RD.build(A.boardCycle(JSON.parse(JSON.stringify(byIdCycle('RT17'))), { today: '2026-10-26', hubId: 360, WN5L: fake }));
  assert.ok(!without.sections.some((s) => s.rows.some((r) => r.kind === 'handover')));
});
// the raw board cycle of a case (re-built through a capturing adapter)
function byIdCycle(id) { let got = null; byId(id).build({ boardCycle: (c) => { got = c; return { sections: [] }; } }); return got; }

test('⇄ RT17b three segments: ΑΡΧΙΚΟ → ΕΝΔΙΑΜΕΣΟ → ΤΕΛΙΚΟ, reasons from WN5Lab, partner segment named', () => {
  const s = model('RT17b').sections[0];
  assert.strictEqual(pic(s), 's/done#ΑΡΧΙΚΟ h/handover s/future#ΕΝΔΙΑΜΕΣΟ h/handover s/future#ΤΕΛΙΚΟ');
  eq(s.rows[1].meta.map((x) => x.text), ['τέλος ΑΡΧΙΚΟΥ · αρχή ΕΝΔΙΑΜΕΣΟΥ', 'Βλάβη φορτηγού']);
  eq(s.rows[3].meta.map((x) => x.text), ['τέλος ΕΝΔΙΑΜΕΣΟΥ · αρχή ΤΕΛΙΚΟΥ', 'Ώρες οδηγού (ταχογράφος)']);
  assert.ok(s.rows[4].meta.some((x) => x.text === 'ΣΥΝΕΡΓΑΤΗΣ Α'));
  assert.match(html('RT17b'), /class="rd-tag" data-seg="intermediate">ΕΝΔΙΑΜΕΣΟ/);
});

test('⇄ RT18 driver change and Π11 the same order in two legs', () => {
  const h = model('RT18').sections[0].rows[1];
  assert.strictEqual(h.label, 'Αλλαγή οδηγού');
  eq(h.meta.map((x) => x.text), ['τέλος ΑΡΧΙΚΟΥ · αρχή ΤΕΛΙΚΟΥ', 'Προγραμματισμένη αλλαγή οδηγού']);
  const p = model('Π11').sections[0].rows[1];
  eq(p.meta.map((x) => x.text), ['τέλος σκέλους 1 · αρχή σκέλους 2 · ίδια παραγγελία']);
});

test('RT19 ship or train: only as the executor text (no Figma design, no data)', () => {
  assert.match(model('RT19').sections[0].rows[2].text, /πλοίο/);
});

test('states: «δεν σημειώθηκε» only for a past unmarked day, «καθυστέρηση» for late, «χωρίς ημέρα» for E8', () => {
  const s = model('S-missed').sections[0];
  assert.strictEqual(pic(s), 's/missed!δεν σημειώθηκε s/missed!καθυστέρηση s/future!χωρίς ημέρα ex:own');
  assert.strictEqual(s.rows[2].dayText, '—');
  // marked wins over the date; today is not «missed»
  const b = (r) => RD.build({ today: '2026-10-26', sections: [{ title: 'Χ', rows: [Object.assign({ kind: 'stop', act: 'load', name: 'n' }, r)] }] }).sections[0].rows[0];
  assert.strictEqual(b({ day: '2026-10-20', marked: true }).dot, 'done');
  assert.strictEqual(b({ day: '2026-10-26' }).dot, 'today');
  assert.strictEqual(b({ day: '2026-10-27' }).dot, 'future');
  assert.strictEqual(b({ day: '2026-10-20', assigned: false }).dot, 'unassigned');
  assert.match(RD.render({ today: '2026-10-26', sections: [{ title: 'Χ', rows: [{ kind: 'stop', act: 'load', name: 'n', day: '2026-10-20' }] }] }),
    /class="rd-flag" data-tone="red">δεν σημειώθηκε/);
});

test('states: K10 «χωρίς ανάθεση» — dashed red dots and the dashed red bar; unknown pallets «;π», never 0', () => {
  const s = model('S-unassigned').sections[0];
  assert.strictEqual(pic(s), 'c/node s/unassigned ex:none');
  eq(s.rows[0].meta.map((x) => x.text), [';π', 'όριο']);
  assert.match(html('S-unassigned'), /class="rd-ex" data-who="none" data-desk="natl">Εθνικών · χωρίς ανάθεση/);
  assert.strictEqual(RD.palText(null), ';π');
  assert.strictEqual(RD.palText(12.5), '12,5π');
  assert.strictEqual(RD.palText(undefined), null);
});

test('states: VS without a cross-dock stop, and a national leg the host did not read, are said in red in the heading', () => {
  const [noHub, noLeg] = [].concat(byId('S-vs-no-hub').build(A)).map((i) => RD.build(i));
  eq([noHub.sections[0].aside, noHub.sections[0].asideTone], ['VS χωρίς στάση cross-dock', 'red']);
  eq([noLeg.sections[1].aside, noLeg.sections[1].asideTone], ['εκτελεστής: δεν διαβάστηκε', 'red']);
  assert.ok(!noLeg.sections[1].rows.some((r) => r.kind === 'executor'), 'no bar claims an executor nobody read');
});

test('escaping: every text from data comes out escaped, in names, meta, notes, chips, asides, executors and kv', () => {
  const x = '<img src=x onerror=alert(1)>"\'&';
  const h = RD.render({ today: '2026-10-26', sections: [{ title: x, chip: x, aside: x, executor: { desk: 'intl', kind: 'own', text: x }, rows: [
    { kind: 'stop', act: 'load', day: '2026-10-27', name: x, city: x, cc: 'GR', extra: [x], tag: x, notes: [{ tone: 'amber', text: x }] },
    { kind: 'handover', what: 'vehicle', place: x, meta: x, reason: x },
    { kind: 'node', node: 'customs', name: x }] }], kv: [[x, x]] });
  assert.ok(!h.includes('<img'), 'raw tag leaked');
  assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;'));
  // a facade order with a hostile place name goes through the adapter escaped as well
  const o = RD.render(A.facadeOrder({ fields: { 'Order No': '<b>1</b>', Direction: 'Export' } },
    [{ fields: { 'Stop Type': 'Loading', DateTime: '2026-10-27T10:00:00+03:00', Location: ['r'] } }], { today: '2026-10-26', locMeta: () => ({ name: '<script>', city: '', cc: 'GR' }) }));
  assert.ok(!o.includes('<script>') && !o.includes('<b>1</b>'));
});

test('input errors are loud: an unknown row kind, act, node or executor throws, never a silent blank row', () => {
  const bad = (rows) => () => RD.build({ sections: [{ title: 'Χ', rows }] });
  assert.throws(bad([{ kind: 'mystery' }]), /row kind/);
  assert.throws(bad([{ kind: 'stop', act: 'fly', name: 'n' }]), /stop act/);
  assert.throws(bad([{ kind: 'node', node: 'moon' }]), /node/);
  assert.throws(() => RD.build({ sections: [{ title: 'Χ', rows: [], executor: { desk: 'intl', kind: 'robot' } }] }), /executor/);
  assert.throws(() => RD.build({ today: '26/10/2026', sections: [] }), /today/);
});

test('day texts follow the Figma frames: «Δευ 19/10», «Τρί 06:00», ranges across months', () => {
  assert.strictEqual(RD.dayText('2026-10-19'), 'Δευ 19/10');
  assert.strictEqual(RD.dayText('2026-10-27', '06:00'), 'Τρί 06:00');
  assert.strictEqual(RD.dayText('2026-10-24', null, '2026-10-25'), 'Σάβ 24 – Κυρ 25/10');
  assert.strictEqual(RD.dayText('2026-10-31', null, '2026-11-01'), 'Σάβ 31/10 – Κυρ 1/11');
  assert.strictEqual(RD.dayText(null), null);
});

test('adapters read the facade as the Worker maps it and the board as 072 sends it — no second copy of a board rule', () => {
  const src = fs.readFileSync(path.join(ROOT, 'core/route-diagram-adapters.js'), 'utf8');
  for (const label of ["'Stop Type'", "'Stop Number'", 'DateTime', "'Completed At'", 'Location', 'Pallets', "'Veroia Switch'", "'Order No'", 'Direction', 'Partner', 'Truck']) {
    assert.ok(src.includes(label), 'adapter label ' + label);
  }
  // every ORDER STOPS label the adapter reads exists in the Worker map (facade trap 1: an unknown label is dropped silently)
  const worker = fs.readFileSync(path.join(ROOT, 'worker/src/index.js'), 'utf8');
  const stopsMap = worker.slice(worker.indexOf('tblaeY5QOHAS1gyE8: {'), worker.indexOf('tblaeY5QOHAS1gyE8: {') + 3000);
  for (const k of ['"Stop Type"', 'DateTime:', 'Pallets:', '"Completed At"', '"Stop Number"']) assert.ok(stopsMap.includes(k), 'ORDER STOPS map lacks ' + k);
  assert.ok(src.includes('L.handoversOf(cycle)') && src.includes('L.stopSegments(cycle)'), 'the ⇄ rows must come from WN5L');
});

test('natLegFromBoard: the national leg of a VS order from the v5 board — on a cycle, waiting, or unknown (null, never «χωρίς ανάθεση»)', () => {
  const board = { cycles: [
    { code: 'RT-T7', trip_type: 'OWNED', stops: [{ has_vehicle: true, legs: [{ order_id: 7001 }] }] },
    { code: 'RT-T8', trip_type: 'PARTNER', stops: [{ has_vehicle: true, legs: [{ order_id: 7002 }] }] },
    { code: 'RT-T9', trip_type: 'OWNED', stops: [{ has_vehicle: false, legs: [{ order_id: 7003 }] }] }],
  waiting: [{ order_id: 7004 }], hub: [{ order_id: 7005 }] };
  eq(A.natLegFromBoard(board, 7001), { ref: 'RT-T7', kind: 'own' });
  eq(A.natLegFromBoard([null, board], '7002'), { ref: 'RT-T8', kind: 'partner' });
  eq(A.natLegFromBoard(board, 7003), { ref: 'RT-T9', kind: 'none' });
  eq(A.natLegFromBoard(board, 7004), { ref: null, kind: 'none' });
  eq(A.natLegFromBoard(board, 7005), { ref: null, kind: 'none' });
  assert.strictEqual(A.natLegFromBoard(board, 9999), null);
  assert.strictEqual(A.natLegFromBoard(null, 7001), null);
});

test('boardCycle with cityOf prints «City, CC» like the international rows', () => {
  const m = RD.build(A.boardCycle(byIdCycle('Ν1'), { today: '2026-10-26', hubId: 360, countryOf: () => 'GR', cityOf: (id) => (id === 901 ? 'Πόλη Α' : null) }));
  eq(m.sections[0].rows.slice(0, 2).map((r) => r.meta[0].text), ['Πόλη Α, GR', 'GR']);
});
