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

function sandbox({ page = 'orders', busy = null, wn5 = false, worker = null } = {}) {
  let now = 1_800_000_000_000;
  let timers = [];
  const listeners = { doc: {}, win: {} };
  const calls = { navigate: [], ref: 0, drop: 0, wn5: [], errors: [], swWatch: 0, asks: [] };
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
  if (worker) {
    // POST /changes {since}: `worker(since)` answers {status, body}; every ask is recorded with its cursor
    ctx.PROXY_URL = 'https://w.invalid';
    ctx.__jwt = 'jwt-test';
    ctx.__queue = null;
    ctx.localStorage = { getItem: (k) => (k === 'tms_jwt' ? ctx.__jwt : k === 'tms_offline_queue' ? ctx.__queue : null) };
    ctx.AbortController = AbortController;
    ctx.fetch = async (url, init) => {
      if (url !== 'https://w.invalid/changes' || init.method !== 'POST') throw new Error('unexpected fetch ' + url);
      const since = JSON.parse(init.body).since;
      calls.asks.push(since);
      calls.lastAuth = init.headers.Authorization;
      const a = worker(since);
      return { status: a.status, json: async () => a.body };
    };
  }
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
      now = Math.max(now, due.at); timers = timers.filter((t) => t !== due); due.fn(); await flush();   // never back in time (a clock jump)
    }
    now = end; await flush();
  };
  const jump = (ms) => { now += ms; };
  return {
    ctx, calls, listeners, els, fields, advance, fire, jump,
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

// ── POST /changes: someone else changed what the page shows ──
const answer = (latest, tables = {}, more = false) => ({ status: 200, body: { latest, tables, n: 0, more } });
// a worker whose log is at `log.latest`; `log.next` (tables) is reported once to the next ask with a cursor
function logWorker() {
  const log = { latest: 1000, next: null, status: 200 };
  const fn = (since) => {
    if (log.status !== 200) return { status: log.status, body: { error: 'x' } };
    if (since === null) return answer(log.latest);
    if (log.next) { const t = log.next; log.next = null; log.latest += 1; return answer(log.latest, t); }
    return answer(log.latest);
  };
  return { log, fn };
}
const idle = async (s) => { await s.advance(21_000); };

test('the first ask only finds where the log is; a later ask with another user\'s change to this page\'s tables draws it', async () => {
  const w = logWorker();
  const s = sandbox({ worker: w.fn });
  ready(s);
  await s.advance(0);
  assert.deepStrictEqual(s.calls.asks, [null]);
  assert.deepStrictEqual(s.calls.navigate, []);
  w.log.next = { orders: 2 };
  await s.advance(30_000);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
  assert.strictEqual(s.calls.drop, 1, 'once, before the draw');
  // the draw first moved the cursor (an ask with no since), then the asking goes on from there
  assert.deepStrictEqual(s.calls.asks, [null, 1000, null]);
  await s.advance(30_000);
  assert.deepStrictEqual(s.calls.asks.slice(-1), [1001]);
});

test('a change to a table the page does not show draws nothing', async () => {
  const w = logWorker();
  const s = sandbox({ worker: w.fn });
  ready(s);
  await s.advance(0);
  w.log.next = { pl_movements: 3 };
  await s.advance(30_000);
  assert.deepStrictEqual(s.calls.navigate, []);
});

test('while the user is working the change waits, the top bar says how many; it is drawn once they stop for 20 s', async () => {
  const w = logWorker();
  const s = sandbox({ page: 'dashboard', worker: w.fn });
  ready(s);
  await s.advance(0);
  w.log.next = { orders: 1, order_stops: 2 };
  await s.advance(25_000);
  s.fire('doc', 'pointerdown', { isTrusted: true });   // the user clicks just before the ask
  await s.advance(5_000);
  assert.deepStrictEqual(s.calls.navigate, []);
  assert.strictEqual(s.els.tmsFresh.textContent, '3 αλλαγές · ↻');
  await s.advance(20_000);
  assert.deepStrictEqual(s.calls.navigate, ['dashboard']);
  assert.match(s.els.tmsFresh.textContent, /^Ενημερώθηκε /);
});

test('Orders, Weekly Διεθνών and the reading pages every order change reaches wait for 2 min without a click, key or mouse move', async () => {
  for (const page of ['orders', 'weekly_intl', 'expenses', 'payroll', 'pallet_ledger']) {
    const w = logWorker();
    const s = sandbox({ page, worker: w.fn });
    ready(s);
    await s.advance(0);
    s.fire('doc', 'mousemove', { isTrusted: true });   // reading, mouse on the board
    w.log.next = { orders: 1 };
    await s.advance(30_000);
    await s.advance(60_000);
    assert.deepStrictEqual(s.calls.navigate, [], page);
    await s.advance(40_000);
    assert.deepStrictEqual(s.calls.navigate, [page], page);
  }
});

test('change draws come at most every 2 minutes', async () => {
  const w = logWorker();
  const s = sandbox({ worker: w.fn });
  ready(s);
  await s.advance(0);
  w.log.next = { orders: 1 };
  await s.advance(30_000);
  assert.strictEqual(s.calls.navigate.length, 1);
  w.log.next = { orders: 1 };
  await s.advance(30_000);
  assert.strictEqual(s.calls.navigate.length, 1, 'a second change 30 s later waits');
  await s.advance(90_000);
  assert.strictEqual(s.calls.navigate.length, 2);
});

test('a page with its own clock shows the count only while changes wait', async () => {
  const w = logWorker();
  const s = sandbox({ page: 'weekly_intl', worker: w.fn });
  ready(s);
  await s.advance(0);
  assert.strictEqual(s.els.tmsFresh.style.display, 'none');
  w.log.next = { orders: 1 };
  s.setBusy('open');
  await s.advance(30_000);
  assert.strictEqual(s.els.tmsFresh.style.display, '');
  assert.strictEqual(s.els.tmsFresh.textContent, '1 αλλαγή · ↻');
});

test('a change to a reference table makes the next draw read the reference lists first', async () => {
  const w = logWorker();
  const s = sandbox({ page: 'clients', worker: w.fn });
  ready(s);
  await s.advance(0);
  w.log.next = { clients: 1 };
  await s.advance(30_000);
  assert.deepStrictEqual(s.calls.navigate, ['clients']);
  assert.strictEqual(s.calls.ref, 1);
});

test('no ask while the tab is hidden; a short absence asks at once on the return', async () => {
  const w = logWorker();
  const s = sandbox({ worker: w.fn });
  ready(s);
  await s.advance(0);
  const before = s.calls.asks.length;
  s.ctx.document.visibilityState = 'hidden'; s.fire('doc', 'visibilitychange');
  await s.advance(10 * 60_000);
  assert.strictEqual(s.calls.asks.length, before);
  s.ctx.document.visibilityState = 'visible'; s.fire('doc', 'visibilitychange');
  await s.advance(0);
  assert.ok(s.calls.asks.length > before);
});

test('410 (the owner\'s switch) stops quietly, 403 stops and says so once, 404 (Worker without the route) stops with a console line only', async () => {
  for (const [status, logged] of [[410, 0], [403, 1], [404, 0]]) {
    const w = logWorker();
    const s = sandbox({ worker: w.fn });
    ready(s);
    await s.advance(0);
    w.log.status = status;
    await s.advance(30_000);
    const n = s.calls.asks.length;
    await s.advance(10 * 60_000);
    assert.strictEqual(s.calls.asks.length, n, `${status}: no more asks`);
    assert.strictEqual(s.calls.errors.length, logged, `${status}: logged`);
  }
});

test('a failed ask keeps the page, is logged once, and is retried after 2 minutes', async () => {
  const w = logWorker();
  const s = sandbox({ worker: w.fn });
  ready(s);
  await s.advance(0);
  w.log.status = 503;
  await s.advance(30_000);
  const n = s.calls.asks.length;
  await s.advance(60_000);
  assert.strictEqual(s.calls.asks.length, n, 'no ask within 2 min of a failure');
  await s.advance(60_000);
  assert.strictEqual(s.calls.asks.length, n + 1);
  await s.advance(2 * 60_000);
  assert.strictEqual(s.calls.errors.length, 1);
  assert.deepStrictEqual(s.calls.navigate, []);
});

test('`more`: the next page of the log is asked at once', async () => {
  let calls = 0;
  const s = sandbox({ worker: (since) => {
    calls++;
    if (since === null) return answer(1000);
    if (since === 1000) return answer(1500, { pl_movements: 500 }, true);
    return answer(1600, {});
  } });
  ready(s);
  await s.advance(0);
  await s.advance(30_000);
  assert.deepStrictEqual(s.calls.asks, [null, 1000, 1500]);
});

test('an ask that comes back after a draw moved the cursor keeps only the position, not its counts', async () => {
  let hold = null;
  // the log is at 2000 when the tab starts; 5 changes to orders land (2001 to 2005) before the slow ask returns
  let baselines = 0;
  const s = sandbox({ worker: (since) => (since === null ? answer(baselines++ === 0 ? 2000 : 2005) : since < 2005 ? answer(2005, { orders: 5 }) : answer(2005)) });
  // the periodic ask is slow: it answers only when released
  const fetch0 = s.ctx.fetch;
  s.ctx.fetch = (url, init) => (JSON.parse(init.body).since !== null && !hold ? new Promise((r) => { hold = () => r(fetch0(url, init)); }) : fetch0(url, init));
  ready(s);
  await s.advance(0);                     // cursor 2000
  await s.advance(30_000);                // the ask with since=2000 is out
  assert.ok(hold, 'the ask is in flight');
  s.els.tmsFresh.onclick();               // the user's ↻: the draw moves the cursor (an ask with no since)
  await s.advance(0);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
  hold();                                 // the old ask lands with 5 «changes» the draw already showed
  await s.advance(0);
  await s.advance(25_000);
  assert.deepStrictEqual(s.calls.navigate, ['orders'], 'no second draw from the stale answer');
  assert.notStrictEqual(s.els.tmsFresh.textContent, '5 αλλαγές · ↻');
});

test('401: asking pauses on the expired token and resumes by itself once the user logs in again', async () => {
  const w = logWorker();
  const s = sandbox({ worker: w.fn });
  ready(s);
  await s.advance(0);
  w.log.status = 401;
  await s.advance(30_000);
  const n = s.calls.asks.length;
  await s.advance(5 * 60_000);
  assert.strictEqual(s.calls.asks.length, n, 'no ask with the dead token');
  assert.strictEqual(s.calls.errors.length, 0);
  w.log.status = 200;
  s.ctx.__jwt = 'jwt-new';            // core/relogin.js wrote the new token, the page stayed
  await s.advance(30_000);
  assert.ok(s.calls.asks.length > n);
  assert.strictEqual(s.calls.lastAuth, 'Bearer jwt-new');
});

test('a hung ask is aborted after 8 s and counts as a failure; draws are not held by it', async () => {
  const s = sandbox({ worker: () => answer(1) });
  const fetch0 = s.ctx.fetch;
  let aborted = false;
  s.ctx.fetch = (url, init) => (JSON.parse(init.body).since === null && s.calls.asks.length > 0
    ? new Promise((_, rej) => { init.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }); s.calls.asks.push('hung'); })
    : fetch0(url, init));
  ready(s);
  await s.advance(0);
  s.els.tmsFresh.onclick();           // the draw's baseline ask hangs
  await s.advance(0);
  assert.strictEqual(s.els.tmsFresh.textContent, 'Ανανέωση…');
  await s.advance(8_000);
  assert.ok(aborted);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
  assert.match(s.els.tmsFresh.textContent, /^Ενημερώθηκε /);
});

test('after the network returns, writes waiting in the offline queue hold the draw until they have gone out', async () => {
  const w = logWorker();
  const s = sandbox({ worker: w.fn });
  ready(s);
  await s.advance(60_000);
  s.ctx.__queue = '[{"op":"patch"}]';
  s.ctx.navigator.onLine = false;
  await s.away(30_000);                 // a return while offline: held
  s.ctx.navigator.onLine = true;
  s.fire('win', 'online');              // the queue starts to go out
  await s.advance(0);
  assert.deepStrictEqual(s.calls.navigate, []);
  s.ctx.__queue = '[]';
  await s.advance(5_000);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
});

test('an item stuck in the offline queue holds the draw for 60 s at most, never for the day', async () => {
  const w = logWorker();
  const s = sandbox({ worker: w.fn });
  ready(s);
  await s.advance(60_000);
  s.ctx.__queue = '[{"op":"patch"}]';
  s.ctx.navigator.onLine = false;
  await s.away(30_000);
  s.ctx.navigator.onLine = true;
  s.fire('win', 'online');
  await s.advance(55_000);
  assert.deepStrictEqual(s.calls.navigate, []);
  await s.advance(10_000);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
});

test('a change to any table makes the next draw (a menu click too) drop the cached reads first, once', async () => {
  const w = logWorker();
  const s = sandbox({ page: 'clients', worker: w.fn });
  ready(s);
  await s.advance(0);
  w.log.next = { orders: 1 };        // not a table the Clients page shows
  await s.advance(30_000);
  assert.deepStrictEqual(s.calls.navigate, []);
  assert.strictEqual(s.calls.drop, 0, 'nothing dropped until a page reads');
  s.ctx.navigate('orders');           // the user clicks Orders
  assert.strictEqual(s.calls.drop, 1);
  s.ctx.navigate('clients');
  assert.strictEqual(s.calls.drop, 1, 'only once per change');
});

test('an expired token on an untouched visible tab does not redraw it every few minutes', async () => {
  const w = logWorker();
  const s = sandbox({ worker: w.fn });
  ready(s);
  await s.advance(0);
  w.log.status = 401;
  await s.advance(30_000);
  await s.advance(10 * 60_000);
  assert.deepStrictEqual(s.calls.navigate, []);
});

test('a long silence while visible (a laptop asleep) is treated as a return: cursor moved and page drawn', async () => {
  const w = logWorker();
  const s = sandbox({ worker: w.fn });
  ready(s);
  await s.advance(0);
  await s.advance(30_000);
  const asks = s.calls.asks.length;
  // the machine sleeps: timers do not run; when it wakes, the clock has jumped 3 h
  s.jump(3 * 60 * 60_000);
  await s.advance(30_000);
  assert.deepStrictEqual(s.calls.navigate, ['orders']);
  assert.ok(s.calls.asks.slice(asks).includes(null), 'the draw moved the cursor with a fresh first ask');
});

test('a change counted while the v5 board reloads is kept and drawn after it, never dropped by the reload', async () => {
  const w = logWorker();
  const s = sandbox({ page: 'weekly_natl', wn5: true, worker: w.fn });
  let release;
  s.ctx.WN5.reload = (r) => { s.calls.wn5.push(r); return new Promise((res) => { release = res; }); };
  ready(s);
  await s.advance(0);
  s.els.tmsFresh.onclick();            // the board reloads (slowly)
  await s.advance(0);
  w.log.next = { rt_stops: 1 };        // a colleague moves a stop meanwhile
  await s.advance(30_000);             // the ask counts it while the reload is still out
  release();
  await s.advance(0);
  assert.strictEqual(s.els.tmsFresh.textContent, '1 αλλαγή · ↻');
  await s.advance(2 * 60_000);
  assert.deepStrictEqual(s.calls.wn5, ['return', 'return']);
});

test('rows committed after a draw moved the cursor are still counted when a slow ask lands late', async () => {
  // log at 2000; rows 2001-2003 land, the user's ↻ draw reads up to 2003; rows 2004-2005 land after it
  let baselines = 0, hold = null;
  const s = sandbox({ worker: (since) => {
    if (since === null) return answer(baselines++ === 0 ? 2000 : 2003);
    if (since < 2003) return answer(2005, { orders: 5 });
    if (since < 2005) return answer(2005, { orders: 2 });
    return answer(2005);
  } });
  const fetch0 = s.ctx.fetch;
  s.ctx.fetch = (url, init) => (JSON.parse(init.body).since === 2000 && !hold ? new Promise((r) => { hold = () => r(fetch0(url, init)); }) : fetch0(url, init));
  ready(s);
  await s.advance(0);
  await s.advance(30_000);            // the ask since 2000 is out
  s.els.tmsFresh.onclick();           // the draw: cursor 2003
  await s.advance(0);
  hold();                             // the late answer: 5 rows, 2 of them after the draw
  await s.advance(0);
  await s.advance(1_000);
  // the 2 rows after the draw are counted (the user is idle, so they are drawn at once): a second draw
  assert.deepStrictEqual(s.calls.navigate, ['orders', 'orders']);
  assert.ok(s.calls.asks.includes(2003), 'asked again from the draw\'s cursor');
});
