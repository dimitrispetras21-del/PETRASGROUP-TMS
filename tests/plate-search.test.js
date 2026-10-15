// _fhPlateNorm (core/form-helpers.js): the vehicle pickers' search (T33, walkthrough
// 13/10 item 1). Plates are stored in Latin letters; a Greek keyboard types the
// look-alike letter, and users type spaces or dashes at will.
// UNIT ONLY: the function is extracted verbatim from core/form-helpers.js (the file
// itself needs a browser) and run in a vm, like tests/csv-safe-cell.test.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'core', 'form-helpers.js'), 'utf8');
const map = (SRC.match(/const _FH_PLATE_GR = \{[^\n]*\};\n/) || [''])[0];
const fn = (SRC.match(/function _fhPlateNorm\(s\) \{[\s\S]*?\n\}\n/) || [''])[0];
const ctx = {};
if (map && fn) vm.runInNewContext(map + fn + '\nthis._fhPlateNorm = _fhPlateNorm;', ctx);
const norm = ctx._fhPlateNorm || (() => { throw new Error('_fhPlateNorm missing'); });
const finds = (query, label) => norm(label).includes(norm(query));

test('_fhPlateNorm source found in core/form-helpers.js', () => assert.ok(map && fn));

test('Greek look-alike letters find the Latin plate', () => {
  assert.ok(finds('ΙΑΒ', 'IAB-1234 (Φορτηγό)'));
  assert.ok(finds('ιαβ 12', 'IAB-1234 (Φορτηγό)'));
  assert.ok(finds('ΡΧΕ', 'PXE 5678'));
  assert.ok(finds('ΚΗΜ', 'KHM9012'));
});

test('case, spaces and dashes do not matter', () => {
  assert.ok(finds('iab1234', 'IAB-1234'));
  assert.ok(finds('IAB 1234', 'IAB-1234'));
  assert.ok(finds('cb 1286 ke', 'CB1286KE'));
});

test('a different plate does not match', () => {
  assert.ok(!finds('ΙΑΖ', 'IAB-1234'));
  assert.ok(!finds('1235', 'IAB-1234'));
});

test('Greek letters with no Latin look-alike stay Greek, so the type label is searchable', () => {
  assert.ok(finds('ρυμουλ', 'TR-77 (Ρυμουλκούμενο)'));
  assert.ok(finds('φορτηγό', 'IAB-1234 (Φορτηγό)'));
});

// ── Guard: every vehicle dropdown gets the search (T33) ──────────────────────
// The search is one component (fhSelectSearch, core/form-helpers.js); a screen
// switches it on per <select>. A plate dropdown added later without it would
// quietly be the old scroll-only list, so this fails instead. The rule for a new
// one: put data-fh-search on the <select>, then call fhSelectSearch on it (or
// fhSelectSearchIn on the container) right after the markup is in the page.
const FILES = ['core', 'modules'].flatMap(d => fs.readdirSync(path.join(ROOT, d))
  .filter(f => f.endsWith('.js') && f !== 'form-helpers.js').map(f => path.join(d, f)));
// A plate dropdown: its own tag names a vehicle (id, onchange), or its options
// come from the fleet. Body capped and nested <select> excluded, so a «<select>»
// written inside a comment never swallows code up to a later </select>.
const OPEN_KW = /truck|trailer|veh|plate|trk|trl|tractor/i;
const BODY_FLEET = /license_plate|License Plate|\.trucks\b|\.trailers\b|allVehicles|vehicleOpts|_opts\(tr/;
// Named in the tag but not a vehicle list, each with its reason.
const NOT_PLATES = [
  /exVehSetRange/, // Έξοδα › Όχημα: the «Εύρος» weeks selector beside the vehicle one
];
function plateSelects() {
  const found = [];
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const re = /<select(\s[^>]*)?>((?:(?!<select)[\s\S]){0,600}?)<\/select>/g;
    let m;
    while ((m = re.exec(src))) {
      const open = m[1] || '', body = m[2];
      if (!/<option|\$\{/.test(body)) continue;
      if (!OPEN_KW.test(open) && !BODY_FLEET.test(body)) continue;
      if (NOT_PLATES.some(rx => rx.test(open))) continue;
      found.push({ f, line: src.slice(0, m.index).split('\n').length, open, src });
    }
  }
  return found;
}

test('every vehicle dropdown carries data-fh-search (18 at T33)', () => {
  const sel = plateSelects();
  assert.ok(sel.length >= 18, 'found only ' + sel.length + ' vehicle dropdowns: the detector is broken, not the code');
  const bare = sel.filter(s => !/data-fh-search/.test(s.open)).map(s => s.f + ':' + s.line);
  assert.deepStrictEqual(bare, [], 'vehicle dropdown(s) without the search: add data-fh-search and call fhSelectSearch / fhSelectSearchIn');
});

test('every file that marks data-fh-search also switches it on', () => {
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!/<select[^>]*data-fh-search/.test(src)) continue;
    assert.ok(/fhSelectSearch(In)?\(/.test(src), f + ' marks data-fh-search but never calls fhSelectSearch or fhSelectSearchIn');
  }
});

test('the assign popovers match truck and trailer like the dropdowns (_wiSdF uses _fhPlateNorm)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'modules', 'weekly_intl.js'), 'utf8');
  const fn = (src.match(/function _wiSdF\(uid,q\)\{[\s\S]*?\n\}\n/) || [''])[0];
  assert.ok(fn, '_wiSdF not found');
  const code = fn.replace(/\/\/.*$/gm, ''); // its comment names _fhPlateNorm too: judge the code only
  assert.ok(/\?\s*_fhPlateNorm\s*:/.test(code), '_wiSdF no longer uses _fhPlateNorm for tk_/tl_ fields');
});
