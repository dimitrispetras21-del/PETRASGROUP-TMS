// node --test tests/wn5-flag.test.js
// National v5 F4α Tasks T3/T10 — the switch is born closed (principle 5) and the old board has ONE seam:
//   - FEATURES.WN_V5: 'off' in F4α, 'pilot' for the owner alone from the F5 pilot (Q-9), 'on' at day L (FE-2) — each
//     change of the flag changes its assertion here in the same commit (owner decision);
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

// F5 pilot (plan Q-9, owner 28/10): 'pilot' for the owner alone until day L; FE-2 changes this to 'on'.
test("F5 pilot: FEATURES.WN_V5 is 'pilot' and WN_V5_USERS names the owner only", () => {
  const v = config();
  assert.strictEqual(v('FEATURES.WN_V5'), 'pilot', 'FEATURES.WN_V5 is not the pilot: ' + v('String(FEATURES.WN_V5)'));
  assert.strictEqual(v('JSON.stringify(WN_V5_USERS)'), '["dimitris"]', 'WN_V5_USERS must name the owner and nobody else');
  assert.strictEqual(v("USERS.filter(u => WN_V5_USERS.includes(u.username)).map(u => u.role).join()"), 'owner',
    'a WN_V5_USERS name is not an owner in the USERS roster');
});

test('F5 pilot: the real config.js + WI4.v2Decide open v5 for the owner alone (a ?wn5=0 browser stays old)', () => {
  const v = config();
  const lg = require(path.join(ROOT, 'core/wi4-logic.js'));
  const decide = (user, optIn) => lg.v2Decide({ flag: v('FEATURES.WN_V5'), pilot: JSON.parse(v('JSON.stringify(WN_V5_USERS)')), user, optIn });
  assert.strictEqual(decide('dimitris', null), 'v4');
  assert.strictEqual(decide('dimitris', '0'), 'old');
  const others = JSON.parse(v("JSON.stringify(USERS.map(u => u.username).filter(n => n !== 'dimitris'))"));
  assert.ok(others.length > 5, 'roster not read: ' + others.join());
  assert.deepStrictEqual(others.filter((n) => decide(n, null) !== 'old'), [], 'a user other than the owner gets v5 without opting in');
});

test('F4α-T3: weekly_natl.js has exactly one v5 line, first statement of renderWeeklyNatl, before _wnLoadAll', () => {
  const src = read('modules/weekly_natl.js');
  const fn = grab(src, 'renderWeeklyNatl', 'modules/weekly_natl.js');
  const body = fn.slice(fn.indexOf('{') + 1).split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('//'));
  assert.strictEqual(body[0], SEAM, 'WN5 seam not found as the first statement of renderWeeklyNatl');
  assert.ok(fn.indexOf(SEAM) < fn.indexOf('_wnLoadAll()'), 'the seam must come before _wnLoadAll');
  assert.strictEqual(src.split('\n').filter((l) => /\bWN5\b/.test(l)).length, 1, 'only ONE line of weekly_natl.js may name WN5');
});

// F4α T10 — the readers of the old board's state under v5.
test('F4α-T10: under WN5.active() ai-chat context for weekly_natl does not read WNATL.rows', () => {
  const fn = grab(read('core/ai-chat.js'), '_aicPageContext', 'core/ai-chat.js');
  let touched = 0;
  const ctx = { currentPage: 'weekly_natl', WN5: { active: () => true }, WNATL: { week: 42, get rows() { touched++; return []; } } };
  const out = vm.runInNewContext(fn + '\n_aicPageContext()', ctx);
  assert.strictEqual(touched, 0, 'WNATL.rows was read under v5 (the chat would describe rows that are not on screen)');
  assert.match(out, /νέα προβολή v5/);
  ctx.WN5 = { active: () => false };
  vm.runInNewContext(fn + '\n_aicPageContext()', ctx);
  assert.ok(touched > 0, 'with v5 off the old summary must still read WNATL.rows');
});

test('F4α-T10: weekly_natl_v5.js never calls reportPageMetrics', () => {
  const src = read('modules/weekly_natl_v5.js').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/reportPageMetrics\s*\(/.test(src), 'modules/weekly_natl_v5.js reports page metrics under the old board\'s key');
});

test('F4α-T10: the old entry points of the national form stay as they are (Ε-16)', () => {
  // The v5 form is reached only from the v5 board in F4α; the catalog and the old orders page keep the old form.
  for (const f of ['modules/orders_catalog.js', 'modules/orders_natl.js']) {
    assert.ok(!/\bWN5(Form)?\b/.test(read(f)), `${f} names WN5 / WN5Form: an old entry point was rerouted in F4α`);
  }
  assert.ok(/openNatlCreate/.test(read('modules/orders_catalog.js')), 'orders_catalog.js no longer opens the old national form');
});
