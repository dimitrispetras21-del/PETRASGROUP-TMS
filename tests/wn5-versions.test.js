// node --test tests/wn5-versions.test.js
// National v5 F4α-T29: the last guards of the PR.
// Why: a served file whose ?v= did not change is not reloaded by the browsers, and without a new SW_VERSION the
// service worker keeps the old app.html — the new module «does not exist» (5/9/2026, CLAUDE.md deploy pattern);
// planFetch is the ONE client of /plan/* (no resend, decision 44): a second fetch toward /plan anywhere would
// bypass it; and the v5 screens never write the facade's national tables (no mirror, spec 2.1).
// On plain main (TMS_ROOT=<git archive origin/main>): the first test fails — core/plan-api.js is missing.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const list = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.js')).map((f) => dir + '/' + f);
const V5_FILES = () => list('core').filter((f) => /^core\/(wn5-|plan-ids|plan-api)/.test(f))
  .concat(list('modules').filter((f) => /^modules\/(wn5_|weekly_natl_v5)/.test(f)));

test('F4α-T29: core/plan-api.js exists (the one /plan client)', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'core/plan-api.js')), 'core/plan-api.js missing');
});

test('F4α-T29: no file outside core/plan-api.js sends fetch( toward /plan/', () => {
  const bad = [];
  for (const f of list('core').concat(list('modules'))) {
    if (f === 'core/plan-api.js') continue;
    const src = read(f).replace(/\/\/[^\n]*/g, '');
    for (const m of src.matchAll(/fetch\s*\(([^;]{0,200})/g)) if (/\/plan\//.test(m[1])) bad.push(f + ': fetch(' + m[1].slice(0, 80));
  }
  assert.deepStrictEqual(bad, []);
});

test('F4α-T29: no v5 file writes through the facade (atCreate/atPatch/atDelete & co.)', () => {
  const bad = [];
  for (const f of V5_FILES()) {
    const src = read(f).replace(/\/\/[^\n]*/g, '');
    const m = src.match(/\bat(?:Create|CreateBatch|Patch|PatchBatch|SafePatch|Delete)\s*\(/g);
    if (m) bad.push(`${f}: ${m.join(', ')}`);
  }
  assert.ok(V5_FILES().length >= 9, 'v5 files found: ' + V5_FILES().join(', '));
  assert.deepStrictEqual(bad, []);
});

test('F4α-T29: every served file changed vs origin/main has a new ?v=, and SW_VERSION changed', (t) => {
  if (!fs.existsSync(path.join(ROOT, '.git'))) { t.skip('no .git (plain-main export): the version rule needs git'); return; }
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const changed = git('diff', '--name-only', 'origin/main').split('\n').filter(Boolean);
  const base = git('show', 'origin/main:app.html');
  const now = read('app.html');
  const vOf = (html) => Object.fromEntries([...html.matchAll(/(?:src|href)="([^"?]+)\?v=(\d+)"/g)].map((m) => [m[1], m[2]]));
  const b = vOf(base), n = vOf(now);
  const stale = changed.filter((f) => f in n && n[f] === b[f]);
  assert.deepStrictEqual(stale, [], 'changed but served with the old ?v=');
  const sw = (s) => (/const SW_VERSION = '(\d+)'/.exec(s) || [])[1];
  if (changed.some((f) => f in n)) assert.notStrictEqual(sw(read('sw.js')), sw(git('show', 'origin/main:sw.js')), 'SW_VERSION not bumped');
});
