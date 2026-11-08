// node --test tests/loc-search-fold.test.js
// The places picker's rule (Sotiris report 8/11, item 11): fhLocWords / fhLocMatch / fhLocFold in core/form-helpers.js —
// every typed word, in any order, as typed OR folded to one Latin spelling (mp/b, nt/d, oi/i …), so «Μπάρμπα Στάθης
// Σίνδος» finds «BARMPA STATHIS MAVEE …, Sindos» and «Barba Stathis» finds «BARMPA STATHIS», while a half-typed word
// («Vero», «Ken») still finds what the old whole-phrase rule found. The REAL functions are cut out of the file.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'core', 'form-helpers.js'), 'utf8');
function grab(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' not found in core/form-helpers.js');
  let depth = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') depth++;
    else if (SRC[k] === '}' && --depth === 0) return SRC.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}
const EL = SRC.match(/const _FH_EL = \{[^}]*\};/);
const { match, norm } = new Function(EL[0] + '\n' + ['_fhNorm', 'fhLocFold', 'fhLocWords', 'fhLocMatch'].map(grab).join('\n')
  + '\nreturn { match: fhLocMatch, norm: _fhNorm };')();

// synthetic labels in the picker's shape «Name, City, Country» (the repo is public)
const L = ['BARMPA STATHIS MAVEE - BARBA STATHIS S.A., Sindos, Ελλάδα', 'BARMPA STATHIS, GR, Sindos, Ελλάδα',
  'ΜΠΑΡΜΠΑ ΣΤΑΘΗΣ ΜΑΒΕΕ - BARBA STATHIS S.A., θεσσαλονικη, Ελλάδα', 'Veroia Cross-Dock, Veroia, Ελλάδα',
  'Kentro Dianomis, Larisa, Ελλάδα', 'Test Depot Ampelokipoi, Athens, Ελλάδα'].map((label) => ({ label }));
const find = (q) => L.filter((o) => match(o, q)).map((o) => o.label.split(',')[0]);

test('every word in any order, commas and the words between ignored', () => {
  assert.deepStrictEqual(find('Μπάρμπα Στάθης Σίνδος'), ['BARMPA STATHIS MAVEE - BARBA STATHIS S.A.', 'BARMPA STATHIS']);
  assert.deepStrictEqual(find('sindos barba'), ['BARMPA STATHIS MAVEE - BARBA STATHIS S.A.', 'BARMPA STATHIS']);
});
test('one spelling: «Barba» finds «BARMPA», Greek finds Latin', () => {
  assert.strictEqual(find('barba stathis').length, 3);
  assert.deepStrictEqual(find('Βέροια'), ['Veroia Cross-Dock']);
  assert.deepStrictEqual(find('Αμπελόκηποι'), ['Test Depot Ampelokipoi']);
});
test('a half-typed word finds what the whole-phrase rule found (never lost mid-typing)', () => {
  for (const q of ['Ve', 'Vero', 'Veroi', 'Βερ', 'Κεν', 'Ken', 'Kent', 'Am', 'Amp', 'cross-d', 'Veroia Cross']) {
    const old = L.filter((o) => norm(o.label).includes(norm(q))).map((o) => o.label.split(',')[0]);
    for (const x of old) assert.ok(find(q).includes(x), q + ' lost ' + x);
  }
});
test('an empty query is every place; a word in no label finds nothing', () => {
  assert.strictEqual(find('').length, L.length);
  assert.deepStrictEqual(find('zzz'), []);
});
