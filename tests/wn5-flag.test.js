// node --test tests/wn5-flag.test.js
// National v5 F4α Tasks T3/T10 — the switch is born closed (principle 5) and the old board has ONE seam:
//   - FEATURES.WN_V5 is 'off' until day L: F5 changes this assertion in the same commit as the flag (owner decision);
//   - modules/weekly_natl.js gains exactly one line, the first statement of renderWeeklyNatl(), before _wnLoadAll:
//     v5 owns its load, and with the switch off that line is false and nothing else of the old board runs differently.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function config() {
  const ctx = { console: { log() {}, warn() {}, error() {} }, document: { querySelector: () => null, getElementById: () => null },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('config.js'), ctx, { filename: 'config.js' });
  return (e) => vm.runInContext(e, ctx);
}
// The text of `[async] function name(…){…}` (brace counter), or a loud «not found».
function grab(src, name, file) {
  const m = new RegExp('(?:^|\\n)[ \\t]*(?:async[ \\t]+)?function[ \\t]+' + name.replace(/\$/g, '\\$') + '[ \\t]*\\(').exec(src);
  assert.ok(m, `${name} not found in ${file}`);
  const i = m.index + (m[0].startsWith('\n') ? 1 : 0);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + name);
}
const SEAM = "if (typeof WN5 !== 'undefined' && WN5.active()) { ++_wnLoadId; return WN5.render(); }";

test("F4α-T3: FEATURES.WN_V5 is 'off' until day L (F5 changes this line with the flag)", () => {
  const v = config();
  assert.strictEqual(v('FEATURES.WN_V5'), 'off', 'FEATURES.WN_V5 undefined or open: ' + v('String(FEATURES.WN_V5)'));
  assert.strictEqual(v('JSON.stringify(WN_V5_USERS)'), '[]', 'WN_V5_USERS must exist and name nobody');
});

test('F4α-T3: weekly_natl.js has exactly one v5 line, first statement of renderWeeklyNatl, before _wnLoadAll', () => {
  const src = read('modules/weekly_natl.js');
  const fn = grab(src, 'renderWeeklyNatl', 'modules/weekly_natl.js');
  const body = fn.slice(fn.indexOf('{') + 1).split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('//'));
  assert.strictEqual(body[0], SEAM, 'WN5 seam not found as the first statement of renderWeeklyNatl');
  assert.ok(fn.indexOf(SEAM) < fn.indexOf('_wnLoadAll()'), 'the seam must come before _wnLoadAll');
  assert.strictEqual(src.split('\n').filter((l) => /\bWN5\b/.test(l)).length, 1, 'only ONE line of weekly_natl.js may name WN5');
});
