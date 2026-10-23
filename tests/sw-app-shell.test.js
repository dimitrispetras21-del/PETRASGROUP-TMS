// node --test tests/sw-app-shell.test.js
// sw.js pre-caches APP_SHELL with cache.addAll, which is all-or-nothing: ONE
// path that 404s rejects the install, and the new service worker never takes
// over — every user keeps serving the old cached shell, silently. Added with
// Weekly International v4, which brings four new files at once (TECH_DESIGN
// §a.1, WP0).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PREFIX = '/PETRASGROUP-TMS/';
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function appShell() {
  const m = /const APP_SHELL\s*=\s*\[([\s\S]*?)\];/.exec(sw);
  assert.ok(m, 'APP_SHELL array not found in sw.js');
  const body = m[1].replace(/\/\/[^\n]*/g, '');
  const entries = [...body.matchAll(/'([^']*)'|"([^"]*)"/g)].map((x) => x[1] ?? x[2]);
  assert.ok(entries.length > 10, `suspiciously short APP_SHELL (${entries.length}) — parser out of step with sw.js?`);
  return entries;
}

test('every APP_SHELL entry is under the Pages prefix and exists on disk', () => {
  const missing = [];
  for (const e of appShell()) {
    assert.ok(e.startsWith(PREFIX), `${e} is not under ${PREFIX}: cache.addAll would request the wrong URL`);
    if (!fs.existsSync(path.join(ROOT, e.slice(PREFIX.length)))) missing.push(e);
  }
  assert.deepStrictEqual(missing, [], 'these paths 404 and would fail the whole service-worker install');
});

test('APP_SHELL has no duplicate entry', () => {
  const list = appShell();
  assert.deepStrictEqual(list.filter((e, i) => list.indexOf(e) !== i), []);
});

test('the four Weekly International v4 files are pre-cached (§a.1)', () => {
  const list = appShell();
  for (const f of ['core/wi4-logic.js', 'core/wi4-presence.js', 'modules/weekly_intl_v2.js', 'modules/wi4_actions.js'])
    assert.ok(list.includes(PREFIX + f), `${f} missing from APP_SHELL`);
});
