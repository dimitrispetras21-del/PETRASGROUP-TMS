// Weekly National «Τοπικές»: only plain local moves (4/10/2026, ahead of 060).
// Migration 060 will also write relays on INTERNATIONAL orders into
// local_moves (Move Kind relay_delivery / relay_loading); this board must not
// list them, or its «×» / «Ανάθεση» would edit them as local moves. Until the
// Worker maps «Move Kind» the field is absent on every row — and a NULL is
// absent too (facade trap #2) — so absent must keep today's behaviour.
// UNIT ONLY: the helper is extracted verbatim from the module source.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WN = fs.readFileSync(path.join(__dirname, '..', 'modules', 'weekly_natl.js'), 'utf8');
const helper = (WN.match(/function _wnIsLocalMove\(m\) \{[\s\S]*?\n\}\n/) || [''])[0];
const ctx = {};
vm.runInNewContext(helper + '\nthis._wnIsLocalMove=_wnIsLocalMove;', ctx);
const rec = (id, kind) => ({ id, fields: Object.assign({ Date: '2026-10-06' }, kind === undefined ? {} : { 'Move Kind': kind }) });

test('helper exists and is the filter applied where WNATL.data.locals is built', () => {
  assert.ok(helper, '_wnIsLocalMove not found in modules/weekly_natl.js');
  assert.match(WN, /WNATL\.data\.locals = WNATL\.data\._localsFailed \? \[\]\s*: \(locals \|\| \[\]\)\.filter\(_wnIsLocalMove\)\.sort\(/);
  // every other reader goes through WNATL.data.locals / data.locals, never the raw fetch result
  assert.strictEqual((WN.match(/\(locals \|\| \[\]\)/g) || []).length, 1, 'raw fetch result `locals` read in exactly one place');
});

test('absent Move Kind (today: label not on the Worker map; or NULL) → kept', () => {
  assert.strictEqual(ctx._wnIsLocalMove(rec('recA')), true);
  assert.strictEqual(ctx._wnIsLocalMove(rec('recB', null)), true);
  assert.strictEqual(ctx._wnIsLocalMove(rec('recC', '')), true);
});

test("Move Kind 'local' → kept", () => {
  assert.strictEqual(ctx._wnIsLocalMove(rec('recL', 'local')), true);
});

test('060 relays on international orders → NOT on the national board', () => {
  assert.strictEqual(ctx._wnIsLocalMove(rec('recR1', 'relay_delivery')), false);
  assert.strictEqual(ctx._wnIsLocalMove(rec('recR2', 'relay_loading')), false);
});

test('a mixed fetch keeps only the plain local moves, in their original order', () => {
  const rows = [rec('r1'), rec('r2', 'relay_delivery'), rec('r3', 'local'), rec('r4', 'relay_loading'), rec('r5', null)];
  assert.deepStrictEqual(rows.filter(ctx._wnIsLocalMove).map(r => r.id), ['r1', 'r3', 'r5']);
});
