// T188 (ValueDriven 26/11/2026): the REAL core/fresh-on-return.js in a vm sandbox with a fake clock, document and
// window. A return to the tab (hidden ≥ 30 s, page ≥ 60 s old) must drop the cached reads and draw the page again
// (navigate, or the v5 board's own reload); never on window focus, never over a form, a typed search or offline,
// and the reference lists at most every 10 min. Nothing may run at load.
// Run: node --test tests/fresh-on-return.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'core/fresh-on-return.js'), 'utf8');

function sandbox({ page = 'orders', busy = null, wn5 = false } = {}) {
  let now = 1_800_000_000_000;
  let timers = [];
  const listeners = { doc: {}, win: {} };
  const calls = { navigate: [], ref: 0, drop: 0, wn5: [], errors: [], swWatch: 0 };
  const els = {};
  const fields = [];   // what querySelectorAll('#content input, #content select') returns
  const mkEl = (id) => ({
    id, style: {}, textContent: '', title: '', parentNode: { insertBefore(el) { els[el.id] = el; } },
    addEventListener(t, fn) { this['on' + t] = fn; },
  });
  els.topbarBreadcrumb = mkEl('topbarBreadcrumb');
  const document = {
    visibilityState: 'visible',
    scrollingElement: { scrollTop: 0 },
    getElementById: (id) => els[id] || null,
    createElement: () => mkEl(''),
    querySelectorAll: () => fields,
    addEventListener: (t, fn) => { (listeners.doc[t] ||= []).push(fn); },
  };
  const ctx = {
    console, Promise, Math, String, Object,
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } },
    setTimeout: (fn, ms) => { const t = { fn, at: now + ms }; timers.push(t); return t; },
    clearTimeout: (t) => { timers = timers.filter((x) => x !== t); },
    document,
    navigator: { onLine: true },
    currentPage: page,
    tmsFormBusy: () => busy,
    tmsSwUpdateWatch: () => { calls.swWatch++; },
    refDataRefresh: async () => { calls.ref++; },
    cacheDropForReturn: () => { calls.drop++; },
    logError: (e, c) => calls.errors.push(c),
  };
  ctx.window = { addEventListener: (t, fn) => { (listeners.win[t] ||= []).push(fn); } };
  ctx.navigate = (p) => { calls.navigate.push(p); ctx.tmsFreshDrawn(); };
  if (wn5) ctx.WN5 = { active: () => true, reload: async (r) => { calls.wn5.push(r); } };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'core/fresh-on-return.js' });
  Object.assign(ctx, { tmsFreshDrawn: ctx.window.tmsFreshDrawn, tmsFreshNow: ctx.window.tmsFreshNow, tmsFreshWatch: ctx.window.tmsFreshWatch });
  const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };
  const fire = (where, type, ev) => (listeners[where][type] || []).forEach((fn) => fn(ev));
  const advance = async (ms) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at; timers = timers.filter((t) => t !== due); due.fn(); await flush();
    }
    now = end; await flush();
  };
  return {
    ctx, calls, listeners, els, fields, advance, fire,
    setBusy: (b) => { busy = b; ctx.tmsFormBusy = () => busy; },
    // a field on the page the user typed into or picked (a trusted input/change event inside #content)
    field: (props) => ({ isConnected: true, closest: (sel) => sel === '#content', ...props }),
    touch: (el, trusted = true) => fire('doc', el.tagName === 'SELECT' ? 'change' : 'input', { isTrusted: trusted, target: el }),
    // leave the tab for `awayMs`, then come back
    away: async (awayMs) => {
      document.visibilityState = 'hidden'; fire('doc', 'visibilitychange');
      await advance(awayMs);
      document.visibilityState = 'visible'; fire('doc', 'visibilitychange');
      await flush();
    },
  };
}
const ready = (s) => { s.ctx.tmsFreshWatch(); s.ctx.tmsFreshDrawn(); };

test('nothing happens at load: no listener, no DOM, until tmsFreshWatch', () => {
  const s = sandbox();
  assert.deepStrictEqual(s.listeners, { doc: {}, win: {} });
  assert.strictEqual(s.els.tmsFresh, undefined);
});

test('a return after 30 s away to a page over 60 s old drops the cached reads, then draws the page once', async () => {
  const s = sandbox();
  ready(s);
  await s.advance(40_000);
  await s.away(30_000);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
  assert.strictEqual(s.calls.drop, 1);
  assert.match(s.els.tmsFresh.textContent, /^Ενημερώθηκε \d\d:\d\d · ↻$/);
});

test('a short glance at another tab does nothing, however old the page', async () => {
  const s = sandbox();
  ready(s);
  await s.advance(10 * 60_000);
  await s.away(5_000);
  assert.deepStrictEqual(s.calls.navigate, []);
});

test('a page drawn under 60 s ago is not drawn again', async () => {
  const s = sandbox();
  ready(s);
  await s.away(45_000);
  assert.deepStrictEqual(s.calls.navigate, []);
});

test('window focus alone never draws (it fires before the click that brings the window back)', async () => {
  const s = sandbox();
  ready(s);
  await s.advance(10 * 60_000);
  s.fire('win', 'focus');
  await s.advance(0);
  assert.deepStrictEqual(s.calls.navigate, []);
  assert.strictEqual(s.listeners.win.focus, undefined);
});

test('an open form holds the draw; it runs once the form is closed, and the label says it waits', async () => {
  const s = sandbox({ busy: 'open' });
  ready(s);
  await s.advance(60_000);
  await s.away(30_000);
  assert.deepStrictEqual(s.calls.navigate, []);
  assert.match(s.els.tmsFresh.textContent, /^Δεδομένα από /);
  await s.advance(5_000);
  assert.deepStrictEqual(s.calls.navigate, []);
  s.setBusy(null);
  await s.advance(5_000);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
});

test('a search the user typed holds the draw (a redraw would clear it); clearing it lets the draw run', async () => {
  const s = sandbox({ page: 'clients' });
  ready(s);
  const search = s.field({ tagName: 'INPUT', type: 'search', value: 'Ital' });
  s.touch(search);
  await s.advance(60_000);
  await s.away(30_000);
  assert.deepStrictEqual(s.calls.navigate, []);
  search.value = '';
  await s.advance(5_000);
  assert.deepStrictEqual(s.calls.navigate, ['clients']);
});

test('a filter the user picked in a select holds the draw; an untrusted change does not count', async () => {
  const s = sandbox({ page: 'clients' });
  ready(s);
  const sel = s.field({ tagName: 'SELECT', selectedIndex: 1 });
  s.touch(sel, false);
  await s.advance(60_000);
  await s.away(30_000);
  assert.deepStrictEqual(s.calls.navigate, ['clients'], 'a script-set value is not the user\'s filter');
  const t = sandbox({ page: 'clients' });
  ready(t);
  t.touch(t.field({ tagName: 'SELECT', selectedIndex: 1 }));
  await t.advance(60_000);
  await t.away(30_000);
  assert.deepStrictEqual(t.calls.navigate, []);
});

test('fields the user never touched never hold the draw (selects drawn without a selected option)', async () => {
  const s = sandbox({ page: 'orders' });
  ready(s);
  await s.advance(60_000);
  await s.away(30_000);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
});

test('a draw forgets the fields touched on the page before it', async () => {
  const s = sandbox({ page: 'clients' });
  ready(s);
  s.touch(s.field({ tagName: 'INPUT', type: 'search', value: 'Ital' }));
  s.ctx.tmsFreshDrawn();   // the user went to another page and back
  await s.advance(60_000);
  await s.away(30_000);
  assert.deepStrictEqual(s.calls.navigate, ['clients']);
});

test('a filter on Orders never holds the draw: Orders keeps its filters across a draw', async () => {
  const s = sandbox({ page: 'orders' });
  ready(s);
  s.touch(s.field({ tagName: 'SELECT', selectedIndex: 2 }));
  s.touch(s.field({ tagName: 'INPUT', type: 'search', value: 'IAB' }));
  await s.advance(60_000);
  await s.away(30_000);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
});

test('a page drawn by the user meanwhile answers the wait: no second draw', async () => {
  const s = sandbox({ busy: 'open' });
  ready(s);
  await s.advance(60_000);
  await s.away(30_000);
  s.setBusy(null);
  s.ctx.tmsFreshDrawn();      // the user saved and the module drew its page
  await s.advance(10_000);
  assert.deepStrictEqual(s.calls.navigate, []);
  assert.match(s.els.tmsFresh.textContent, /^Ενημερώθηκε /);
});

test('offline: the old page stays; the draw comes with the online event', async () => {
  const s = sandbox();
  ready(s);
  s.ctx.navigator.onLine = false;
  await s.advance(60_000);
  await s.away(30_000);
  assert.deepStrictEqual(s.calls.navigate, []);
  assert.strictEqual(s.calls.drop, 0);
  s.ctx.navigator.onLine = true;
  s.fire('win', 'online');
  await s.advance(0);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
});

test('the user\'s ↻ reads now, form or not, and reads the reference lists too', async () => {
  const s = sandbox({ busy: 'typed' });
  ready(s);
  s.els.tmsFresh.onclick();
  await s.advance(0);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
  assert.strictEqual(s.calls.ref, 1);
});

test('the reference lists are read at most every 10 minutes on returns', async () => {
  const s = sandbox();
  ready(s);
  await s.advance(60_000); await s.away(30_000);
  assert.strictEqual(s.calls.ref, 0, 'the page load read them 90 s ago');
  await s.advance(10 * 60_000); await s.away(30_000);
  assert.strictEqual(s.calls.ref, 1);
  await s.advance(60_000); await s.away(30_000);
  assert.strictEqual(s.calls.ref, 1);
  assert.strictEqual(s.calls.navigate.length, 3);
});

test('the national v5 board reloads through its own reload, and pages with their own clock hide the top-bar one', async () => {
  const s = sandbox({ page: 'weekly_natl', wn5: true });
  ready(s);
  await s.advance(60_000);
  await s.away(30_000);
  assert.deepStrictEqual(s.calls.navigate, []);
  assert.deepStrictEqual(s.calls.wn5, ['return']);
  assert.strictEqual(s.els.tmsFresh.style.display, 'none');
  for (const p of ['weekly_intl', 'daily_ramp']) {
    const t = sandbox({ page: p }); ready(t);
    assert.strictEqual(t.els.tmsFresh.style.display, 'none', p);
  }
});

test('a failed reference read is logged and the page is still drawn', async () => {
  const s = sandbox();
  s.ctx.refDataRefresh = async () => { throw new Error('network'); };
  ready(s);
  s.els.tmsFresh.onclick();
  await s.advance(0);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
  assert.deepStrictEqual(s.calls.errors, ['fresh-on-return: reference lists (user)']);
});

test('tmsFreshWatch also makes tmsFormBusy remember typed fields', () => {
  const s = sandbox();
  s.ctx.tmsFreshWatch();
  assert.strictEqual(s.calls.swWatch, 1);
});
