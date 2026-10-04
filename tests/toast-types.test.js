// toast(): 'error' must render as danger, never as success (4/10/2026).
// 37 call sites passed 'error', which had no colour entry and fell back to the
// green success style with a check mark — a refusal looked like a save.
// UNIT ONLY: toast() is extracted verbatim from core/ui.js and run with a stub DOM.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UI = fs.readFileSync(path.join(__dirname, '..', 'core', 'ui.js'), 'utf8');
const src = (UI.match(/function toast\(msg, type = 'success'\) \{[\s\S]*?\n\}\n/) || [''])[0];

function run(type) {
  const el = { style: {}, id: '', innerHTML: '' };
  const warns = [];
  const ctx = {
    document: { getElementById: () => el, createElement: () => el, body: { appendChild() {} } },
    requestAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {},
    console: { warn: (...a) => warns.push(a.join(' ')) },
  };
  vm.runInNewContext(src + '\ntoast("m", ' + JSON.stringify(type) + ');', ctx);
  return { bg: el.style.background, html: el.innerHTML, warns };
}

test('toast source found', () => assert.ok(src, 'toast() not found in core/ui.js'));

test("'error' renders as danger (red, ×), not success", () => {
  for (const t of ['error']) {
    const r = run(t);
    assert.strictEqual(r.bg, 'var(--danger)', t);
    assert.match(r.html, /M6 6l8 8M14 6l-8 8/, t + ' uses the danger icon');
    assert.deepStrictEqual(r.warns, [], t + ' is a known alias');
  }
});

test("'warning' renders as warn", () => assert.strictEqual(run('warning').bg, 'var(--warn)'));

test('known types unchanged', () => {
  assert.strictEqual(run('success').bg, 'var(--ok)');
  assert.strictEqual(run('danger').bg, 'var(--danger)');
  assert.strictEqual(run('warn').bg, 'var(--warn)');
  assert.strictEqual(run('info').bg, 'var(--surface-dark)');
});

test('an unknown type is neutral info and is reported, never success', () => {
  const r = run('bogus');
  assert.strictEqual(r.bg, 'var(--surface-dark)');
  assert.strictEqual(r.warns.length, 1);
});
