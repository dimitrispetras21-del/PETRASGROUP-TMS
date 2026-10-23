// reportError → app_errors (T13, vd 16/10): a failure the user is told about
// also reaches logError, once per error object, in either call order.
// UNIT ONLY: reportError and logError are extracted verbatim from core/utils.js
// (the file needs a browser) and run in a vm with stubs for what logError
// calls; posts to /app-errors are counted at _postAppError.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const UTILS = fs.readFileSync(path.join(__dirname, '..', 'core', 'utils.js'), 'utf8');
const grab = (name) => (UTILS.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n')) || [''])[0];
const SRC = grab('reportError') + grab('logError');

function load() {
  const posts = [], toasts = [];
  const ctx = {
    posts, toasts, console: { warn() {}, error() {} }, window: {},
    localStorage: { getItem: () => null, setItem() {} },
    showErrorToast: (m, t) => toasts.push([m, t]), _tmsLog() {},
    _inferSeverity: () => 'error', _maybeDedup: () => false, _errorLog: [], MAX_ERROR_LOG: 100,
    _logBurstAdmit: () => true, _postAppError: (e) => posts.push(e),
  };
  vm.runInNewContext(SRC, ctx);
  return ctx;
}

test('both functions found in core/utils.js', () => {
  assert.match(SRC, /function reportError/); assert.match(SRC, /function logError/);
});

test('a failure with no detail posts one row carrying the user message', () => {
  const c = load();
  c.reportError('Η διάλυση δεν ολοκληρώθηκε');
  assert.strictEqual(c.posts.length, 1);
  assert.strictEqual(c.posts[0].msg, 'Η διάλυση δεν ολοκληρώθηκε');
  assert.match(c.posts[0].ctx, /^reportError: /);
  assert.strictEqual(c.toasts.length, 1);
});

test('the Error passed as detail is what is posted, with the message as context', () => {
  const c = load(); const e = new Error('HTTP 422');
  c.reportError('Αποτυχία σπασίματος', e);
  assert.strictEqual(c.posts.length, 1);
  assert.strictEqual(c.posts[0].msg, 'HTTP 422');
  assert.strictEqual(c.posts[0].ctx, 'reportError: Αποτυχία σπασίματος');
});

test('caller logs first, then reportError with the same error: one row', () => {
  const c = load(); const e = new Error('boom');
  c.logError(e, 'weekly: split'); c.reportError('Αποτυχία', e);
  assert.strictEqual(c.posts.length, 1);
  assert.strictEqual(c.posts[0].ctx, 'weekly: split');
});

test('reportError first, then the caller logs the same error: one row', () => {
  const c = load(); const e = new Error('boom');
  c.reportError('Αποτυχία', e); c.logError(e, 'weekly: split');
  assert.strictEqual(c.posts.length, 1);
});

test('two different failures are two rows', () => {
  const c = load();
  c.reportError('Α', new Error('one')); c.reportError('Β', new Error('two'));
  assert.strictEqual(c.posts.length, 2);
});

test('warn and info toasts post nothing', () => {
  const c = load();
  c.reportError('Δεν γίνεται', null, 'warn'); c.reportError('Σημείωση', undefined, 'info');
  assert.strictEqual(c.posts.length, 0);
  assert.strictEqual(c.toasts.length, 2);
});

test('a frozen error object is still logged (the mark is best effort)', () => {
  const c = load(); const e = Object.freeze(new Error('frozen'));
  c.reportError('Αποτυχία', e);
  assert.strictEqual(c.posts.length, 1);
});
