// tests/wi4-presence.test.js — run: node --test tests/wi4-presence.test.js
// TECH_DESIGN §g.4 (+ §e #18, §g.5): the presence client with fetch, timers,
// clock, document and MutationObserver stubbed. Zero dependencies. The real
// core/wi4-logic.js supplies the pacing rules (WI4.beatDelay), as in the app.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'core/wi4-presence.js'), 'utf8');
const LOGIC = fs.readFileSync(path.join(ROOT, 'core/wi4-logic.js'), 'utf8');
const URL = 'https://worker.test';
const REC = 'recAAAAAAA1';
const LOADED = Date.UTC(2026, 9, 6, 6, 0, 0);

const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };
const store = (throws) => {
  const m = new Map();
  if (throws) return { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};
const live = (others = [], extra = {}) => ({ status: 200, body: Object.assign({ others, changes: { n: 0, last_by: null, last_at: null, auto_n: 0 }, now: 'x', next_ms: 5000 }, extra) });

// One browser tab: the file loaded into a vm world with every side effect recorded.
function world(o = {}) {
  let clock = LOADED + 60000;
  const timers = new Map(); let seq = 0;
  const calls = [];
  const listeners = [];
  const observers = [];
  const counts = { patch: 0, paint: 0, wiPaint: 0, expired: 0, logError: 0 };
  let responder = o.responder || (() => live());
  const mkPop = () => ({ style: { display: 'none' }, dataset: {} });
  const doc = {
    visibilityState: 'visible',
    pop: mkPop(),
    addEventListener(type, fn, opt) { listeners.push({ t: 'document', type, fn, opt }); },
    removeEventListener(type, fn) { const i = listeners.findIndex((l) => l.t === 'document' && l.type === type && l.fn === fn); if (i >= 0) listeners.splice(i, 1); },
    getElementById(id) { return id === 'wi-popover' ? doc.pop : null; },
  };
  class FakeDate extends Date { static now() { return clock; } }
  const ctx = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    Date: FakeDate,
    Uint8Array, Math, JSON, Promise, Map, Object, Array, Number, String, Error,
    crypto: { getRandomValues(b) { for (let i = 0; i < b.length; i++) b[i] = (i * 7 + 3) % 256; return b; } },
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: clock + Math.max(0, ms), fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, init) {
      const body = JSON.parse(init.body);
      calls.push({ url, init, body, at: clock });
      const r = responder(body, calls.length);
      if (r === 'network') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ status: r.status, json: async () => { if (r.body === undefined) throw new Error('no json'); return r.body; } });
    },
    MutationObserver: function (cb) { this.cb = cb; this.target = null; this.disconnected = false; this.observe = (t, opts) => { this.target = t; this.opts = opts; }; this.disconnect = () => { this.disconnected = true; }; observers.push(this); },
    document: doc,
    addEventListener(type, fn, opt) { listeners.push({ t: 'window', type, fn, opt }); },
    removeEventListener(type, fn) { const i = listeners.findIndex((l) => l.t === 'window' && l.type === type && l.fn === fn); if (i >= 0) listeners.splice(i, 1); },
    sessionStorage: o.sessionStorage || store(o.storageThrows),
    localStorage: store(),
    FEATURES: { WI_PRESENCE: o.presence !== false },
    PROXY_URL: URL,
    WI_PRESENCE_MS: { active: 5000, idle: 30000, idleAfter: 120000 },
    currentPage: 'weekly_intl',
    WIV2: { _active: true, active() { return this._active; }, presencePatch() { counts.patch++; }, paint() { counts.paint++; } },
    _wiPaint() { counts.wiPaint++; },
    WI_INTERNAL: { WINTL: { week: 41, rows: [{ id: 3, orderIds: [REC] }, { id: 4, orderId: 'recBBBBBBB2', orderIds: ['recBBBBBBB2'] }], _loadedAt: new FakeDate(LOADED) } },
    tmsSessionExpired() { counts.expired++; return new Error('session'); },
    logError() { counts.logError++; },
  };
  ctx.window = ctx;
  ctx.localStorage.setItem('tms_jwt', 'jwt.test.token');
  vm.createContext(ctx);
  vm.runInContext(LOGIC, ctx, { filename: 'core/wi4-logic.js' });
  vm.runInContext(SRC, ctx, { filename: 'core/wi4-presence.js' });
  async function advance(ms) {
    const end = clock + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      clock = due[1].at; timers.delete(due[0]);
      due[1].fn();
      await flush();
    }
    clock = end;
    await flush();
  }
  const P = ctx.WI4Presence;
  const beats = () => calls.filter((c) => !c.body.leave);
  return {
    ctx, P, doc, calls, beats, listeners, observers, counts, timers, advance, flush,
    now: () => clock, setClock: (v) => { clock = v; }, respond: (fn) => { responder = fn; },
    input() { for (const l of listeners) if (l.type === 'pointerdown') l.fn(); },
    fire(type) { for (const l of listeners.slice()) if (l.type === type) l.fn(); },
    newPop() { doc.pop = mkPop(); return doc.pop; },
  };
}
// Values made inside the vm realm carry its prototypes: compare them as plain JSON.
const plain = (x) => JSON.parse(JSON.stringify(x));
const gaps = (cs) => cs.slice(1).map((c, i) => c.at - cs[i].at);

// ─── load ──────────────────────────────────────────────────────────────
test('at load: only window.WI4Presence, frozen, no timer/listener/fetch/observer', () => {
  const w = world();
  assert.ok(Object.isFrozen(w.P));
  assert.strictEqual(w.P.__wi4Placeholder, undefined, 'the WP0 placeholder marker must be gone');
  assert.strictEqual(w.timers.size, 0);
  assert.strictEqual(w.listeners.length, 0);
  assert.strictEqual(w.calls.length, 0);
  assert.strictEqual(w.observers.length, 0);
  assert.strictEqual(w.P.state().status, 'off');
  assert.deepStrictEqual([...w.P.ACTIONS], ['view', 'menu', 'assign', 'date:Loading DateTime', 'date:Delivery DateTime', 'date:VS CD Date']);
});

test('FEATURES.WI_PRESENCE false → start() is a no-op: nothing sent, nothing installed', async () => {
  const w = world({ presence: false });
  assert.strictEqual(w.P.start({ week: 41 }), false);
  await w.advance(60000);
  assert.strictEqual(w.calls.length, 0);
  assert.strictEqual(w.listeners.length, 0);
  assert.strictEqual(w.observers.length, 0);
  assert.strictEqual(w.P.stripText(), '', 'closed presence claims nothing either way');
});

test('the 6 whitelisted actions are the SAME strings as the SQL CHECK of 068', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'worker/migrations/drafts/068_presence.sql'), 'utf8');
  const m = /action\s+text\s+CONSTRAINT\s+\w+\s+CHECK\s*\(action\s+IN\s*\(([^)]*)\)\)/i.exec(sql) || /action[^\n]*CHECK\s*\(action\s+IN\s*\(([^)]*)\)/i.exec(sql);
  assert.ok(m, 'action CHECK not found in 068_presence.sql');
  const list = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepStrictEqual(list, [...world().P.ACTIONS]);
});

// ─── per-tab id ────────────────────────────────────────────────────────
test('tab id: 12 × [a-z0-9], made once per tab, kept in sessionStorage, in memory if storage throws', async () => {
  const ss = store();
  const w1 = world({ sessionStorage: ss });
  const id = w1.P.tabId();
  assert.match(id, /^[a-z0-9]{12}$/);
  assert.strictEqual(w1.P.tabId(), id);
  assert.strictEqual(ss.getItem('tms_wi4_tab'), id);
  const w2 = world({ sessionStorage: ss });       // same tab, page reloaded
  assert.strictEqual(w2.P.tabId(), id);
  const w3 = world({ storageThrows: true });
  const id3 = w3.P.tabId();
  assert.match(id3, /^[a-z0-9]{12}$/);
  assert.strictEqual(w3.P.tabId(), id3);
  w3.P.start({ week: 41 }); await w3.advance(0);
  assert.strictEqual(w3.beats()[0].body.tab, id3);
});

// ─── the beat ──────────────────────────────────────────────────────────
test('first beat: immediate, plain POST /presence with the JWT, whitelisted body, TTL = 1.5 × next wait', async () => {
  const w = world();
  assert.strictEqual(w.P.start({ week: 41 }), true);
  assert.strictEqual(w.P.state().status, 'pending', 'before the first answer nothing is claimed');
  assert.strictEqual(w.P.stripText(), '');
  await w.advance(0);
  const [c] = w.beats();
  assert.ok(c, 'no beat sent');
  assert.strictEqual(c.url, URL + '/presence');
  assert.strictEqual(c.init.method, 'POST');
  assert.strictEqual(c.init.headers.Authorization, 'Bearer jwt.test.token');
  assert.strictEqual(c.init.headers['Content-Type'], 'application/json');
  assert.ok(!c.init.keepalive);
  assert.deepStrictEqual(Object.keys(c.body).sort(), ['action', 'board', 'changes_since', 'part', 'record', 'tab', 'ttl_ms', 'week']);
  assert.strictEqual(c.body.board, 'weekly_intl');
  assert.strictEqual(c.body.week, 41);
  assert.strictEqual(c.body.action, 'view');
  assert.strictEqual(c.body.record, null);
  assert.strictEqual(c.body.ttl_ms, 7500);
  assert.strictEqual(c.body.changes_since, new Date(LOADED).toISOString());
  assert.strictEqual(w.P.state().status, 'live');
});

test('pacing: 5 s while active, next_ms from the server wins when larger, 30 s idle — TTL follows', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  for (let i = 0; i < 3; i++) { w.input(); await w.advance(5000); }
  assert.deepStrictEqual(gaps(w.beats()), [5000, 5000, 5000]);
  w.respond(() => live([], { next_ms: 10000 }));
  w.input(); await w.advance(5000);                 // this answer carries next_ms 10 s
  w.input(); await w.advance(10000);
  const b = w.beats();
  assert.strictEqual(b[b.length - 1].at - b[b.length - 2].at, 10000);
  assert.strictEqual(b[b.length - 1].body.ttl_ms, 15000);
  w.respond(() => live());
  await w.advance(10000);                           // no input since → idle after 2′
  const n = w.beats().length;
  await w.advance(200000);
  const tail = w.beats().slice(n - 1);
  assert.ok(gaps(tail).slice(-2).every((g) => g === 30000), 'idle cadence must be 30 s: ' + gaps(tail));
  assert.strictEqual(tail[tail.length - 1].body.ttl_ms, 45000);
});

test('coalescing: a burst of context changes is ONE beat at ≥ 2.5 s, carrying the last context', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);        // beat 1 at t0
  await w.advance(300);
  w.P.setContext({ week: 41, record: REC, part: 'export', action: 'menu' });
  await w.advance(200);
  w.P.setContext({ week: 41, record: REC, part: 'export', action: 'date:Loading DateTime' });
  await w.advance(100);
  w.P.setContext({ week: 41, record: REC, part: 'export', action: 'date:Delivery DateTime' });
  await w.advance(3000);
  const b = w.beats();
  assert.strictEqual(b.length, 2, 'three changes inside the gap must coalesce into one beat');
  assert.strictEqual(b[1].at - b[0].at, 2500);
  assert.strictEqual(b[1].body.action, 'date:Delivery DateTime');
  assert.strictEqual(b[1].body.record, REC);
});

test('pacing floor: whatever the context does, two beats are never closer than 2.5 s', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  const acts = ['view', 'menu', 'assign', 'date:Loading DateTime', 'date:VS CD Date'];
  let r = 7;
  for (let i = 0; i < 400; i++) {
    r = (r * 1103515245 + 12345) % 2147483648;
    if (r % 3 === 0) w.P.setContext({ week: 41, record: r % 2 ? REC : null, part: 'truck', action: acts[r % acts.length] });
    if (r % 5 === 0) w.input();
    if (r % 17 === 0) { w.doc.visibilityState = 'hidden'; w.fire('visibilitychange'); }
    if (r % 19 === 0) { w.doc.visibilityState = 'visible'; w.fire('visibilitychange'); }
    await w.advance(50 + (r % 400));
  }
  const g = gaps(w.beats());
  assert.ok(w.beats().length > 10);
  assert.ok(Math.min(...g) >= 2500, 'min gap ' + Math.min(...g));
});

test('a context change while a beat is in flight goes out once, after the gap', async () => {
  const w = world();
  let release;
  w.respond((b, n) => (n === 1 ? live() : live()));
  // hold the first answer
  const orig = w.ctx.fetch;
  w.ctx.fetch = (url, init) => {
    const p = orig(url, init);
    if (w.calls.length === 1) return new Promise((res) => { release = () => res(p); });
    return p;
  };
  w.P.start({ week: 41 }); await w.advance(0);
  w.P.setContext({ week: 41, record: REC, part: 'truck', action: 'assign' });
  w.P.setContext({ week: 41, record: REC, part: 'truck', action: 'menu' });
  await w.advance(1000);
  assert.strictEqual(w.beats().length, 1);
  release(); await w.flush();
  await w.advance(2000);
  assert.strictEqual(w.beats().length, 2);
  assert.strictEqual(w.beats()[1].at - w.beats()[0].at, 2500);
  assert.strictEqual(w.beats()[1].body.action, 'menu');
});

test('setContext whitelists before anything travels', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  w.P.setContext({ week: 99, record: '<script>', part: 'cab', action: 'x<script>' });
  await w.advance(5000);
  const b = w.beats().pop().body;
  assert.strictEqual(b.action, 'view');
  assert.strictEqual(b.record, null);
  assert.strictEqual(b.part, null);
  assert.strictEqual(b.week, 41, 'an invalid week falls back to the board week');
});

// ─── statuses ──────────────────────────────────────────────────────────
test('404 (not deployed) → paused, list cleared, back-off 60 s → 120 s', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  w.respond(() => ({ status: 404, body: { error: 'Not found' } }));
  w.input(); await w.advance(5000);
  assert.strictEqual(w.P.state().status, 'paused');
  assert.deepStrictEqual(plain(w.P.others()), []);
  assert.match(w.P.stripText(), /^Ζωντανή εικόνα σε παύση — δεν ξέρουμε ποιος άλλος είναι μέσα/);
  await w.advance(60000 + 120000);
  assert.deepStrictEqual(gaps(w.beats()).slice(-2), [60000, 120000]);
});

test('while paused, context changes keep the back-off: no extra request to a failing endpoint', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  w.respond(() => ({ status: 404, body: {} }));
  w.input(); await w.advance(5000);
  const n = w.beats().length;
  for (let i = 0; i < 10; i++) { w.P.setContext({ week: 41, record: REC, part: 'truck', action: i % 2 ? 'menu' : 'assign' }); await w.advance(3000); }
  assert.strictEqual(w.beats().length, n, 'a context change must not cut a 60 s back-off short');
  await w.advance(30000);
  assert.strictEqual(w.beats().length, n + 1);
  assert.strictEqual(w.beats().pop().body.action, 'menu', 'the next allowed beat still carries the latest context');
});

test('5xx and network errors → paused, 15 s → 30 s; recovery → live again', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  w.respond((b, n) => (n === 2 ? { status: 503, body: { error: 'presence unavailable' } } : 'network'));
  w.input(); await w.advance(5000);
  assert.strictEqual(w.P.state().status, 'paused');
  await w.advance(15000 + 30000);
  assert.deepStrictEqual(gaps(w.beats()).slice(-2), [15000, 30000]);
  w.respond(() => live([{ sub: 'xa', name: 'Χρήστης Α', records: [] }]));
  await w.advance(60000);
  assert.strictEqual(w.P.state().status, 'live');
  assert.strictEqual(w.P.others().length, 1);
});

test('a 2xx without an `others` list is paused, never «nobody here»', async () => {
  const w = world({ responder: () => ({ status: 200, body: { ok: true } }) });
  w.P.start({ week: 41 }); await w.advance(0);
  assert.strictEqual(w.P.state().status, 'paused');
  assert.notStrictEqual(w.P.stripText(), '');
});

test('429 is NOT paused: keeps status and list, waits retry_after_ms from the body', async () => {
  const w = world({ responder: () => live([{ sub: 'xa', name: 'Χρήστης Α', records: [] }]) });
  w.P.start({ week: 41 }); await w.advance(0);
  w.respond((b, n) => (n === 2 ? { status: 429, body: { error: 'too fast', retry_after_ms: 4000 } } : live([{ sub: 'xa', name: 'Χρήστης Α', records: [] }])));
  w.input(); await w.advance(5000);
  assert.strictEqual(w.P.state().status, 'live');
  assert.strictEqual(w.P.others().length, 1);
  await w.advance(4000);
  assert.strictEqual(gaps(w.beats()).pop(), 4000);
});

test('401 → stop and tmsSessionExpired exactly once; no doomed beats; no restart', async () => {
  const w = world({ responder: () => ({ status: 401, body: { error: 'Unauthorized' } }) });
  w.P.start({ week: 41 }); await w.advance(0);
  assert.strictEqual(w.counts.expired, 1);
  await w.advance(600000);
  assert.strictEqual(w.beats().length, 1);
  assert.strictEqual(w.P.start({ week: 41 }), false);
  await w.advance(60000);
  assert.strictEqual(w.beats().length, 1);
  assert.strictEqual(w.counts.expired, 1);
  assert.strictEqual(w.timers.size, 0);
  assert.strictEqual(w.listeners.length, 0);
  assert.strictEqual(w.calls.filter((c) => c.body.leave).length, 0, 'no leave with a dead session');
});

test('403 → forbidden for the session, one logError, the role text', async () => {
  const w = world({ responder: () => ({ status: 403, body: { error: 'Forbidden' } }) });
  w.P.start({ week: 41 }); await w.advance(0);
  assert.strictEqual(w.P.state().status, 'forbidden');
  assert.strictEqual(w.P.stripText(), 'Η ζωντανή εικόνα δεν είναι διαθέσιμη για τον ρόλο σου');
  assert.strictEqual(w.counts.logError, 1);
  await w.advance(600000);
  assert.strictEqual(w.beats().length, 1);
  assert.strictEqual(w.P.start({ week: 41 }), false);
});

test('410 or {stop:true} (the owner\'s PRESENCE_OFF) → off for the session, nothing drawn', async () => {
  for (const r of [{ status: 410, body: { stop: true } }, { status: 200, body: { stop: true } }]) {
    const w = world({ responder: () => live() });
    w.P.start({ week: 41 }); await w.advance(0);
    w.respond(() => r);
    w.input(); await w.advance(5000);
    assert.strictEqual(w.P.state().status, 'off');
    assert.strictEqual(w.P.stripText(), '');
    assert.deepStrictEqual(plain(w.P.others()), []);
    await w.advance(600000);
    assert.strictEqual(w.beats().length, 2);
    assert.strictEqual(w.P.start({ week: 41 }), false);
    assert.strictEqual(w.timers.size, 0);
  }
});

test('400 (refused body) → paused, logged once, slow back-off — never a 5 s loop', async () => {
  const w = world({ responder: () => ({ status: 400, body: { error: 'Invalid presence: bad week' } }) });
  w.P.start({ week: 41 }); await w.advance(0);
  await w.advance(200000);
  assert.strictEqual(w.P.state().status, 'paused');
  assert.strictEqual(w.counts.logError, 1);
  assert.ok(Math.min(...gaps(w.beats())) >= 60000);
});

// ─── visibility, stop, leave ───────────────────────────────────────────
test('hidden tab sends nothing; visible again → an immediate beat', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  w.doc.visibilityState = 'hidden'; w.fire('visibilitychange');
  await w.advance(120000);
  assert.strictEqual(w.beats().length, 1);
  w.doc.visibilityState = 'visible'; w.fire('visibilitychange');
  await w.advance(0);
  assert.strictEqual(w.beats().length, 2);
  assert.strictEqual(w.beats()[1].at, w.now());
});

test('stop() (page change): one keepalive leave, timers/listeners/observer gone, status off', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  const id = w.P.tabId();
  w.P.stop('page');
  const leaves = w.calls.filter((c) => c.body.leave);
  assert.strictEqual(leaves.length, 1);
  assert.deepStrictEqual(leaves[0].body, { board: 'weekly_intl', tab: id, leave: true });
  assert.strictEqual(leaves[0].init.keepalive, true);
  assert.strictEqual(w.timers.size, 0);
  assert.strictEqual(w.listeners.length, 0);
  assert.ok(w.observers.every((o) => o.disconnected));
  assert.strictEqual(w.P.state().status, 'off');
  await w.advance(60000);
  assert.strictEqual(w.beats().length, 1);
  assert.strictEqual(w.P.start({ week: 41 }), true, 'a page change is not a session stop: coming back resumes');
});

test('pagehide → keepalive leave', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  w.fire('pagehide');
  const l = w.calls.filter((c) => c.body.leave);
  assert.strictEqual(l.length, 1);
  assert.strictEqual(l[0].init.keepalive, true);
});

test('v4 no longer active (fallback or another page) → stops at the next beat', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  w.ctx.WIV2._active = false;
  await w.advance(30000);
  assert.strictEqual(w.beats().length, 1);
  assert.strictEqual(w.P.state().status, 'off');
  assert.strictEqual(w.timers.size, 0);
});

// ─── popover observer ──────────────────────────────────────────────────
test('observer: popover open → context assign on its order; close → view; re-attached after every paint', async () => {
  const w = world();
  assert.strictEqual(w.P.reattach(), false, 'nothing is observed before start');
  assert.strictEqual(w.observers.length, 0);
  w.P.start({ week: 41 }); await w.advance(0);
  assert.strictEqual(w.observers.length, 1);
  const first = w.observers[0];
  assert.strictEqual(first.target, w.doc.pop);
  // a full paint re-creates #wi-popover: the old observer is disconnected first
  const pop = w.newPop();
  assert.strictEqual(w.P.reattach(), true);
  assert.strictEqual(first.disconnected, true);
  const obs = w.observers[1];
  assert.strictEqual(obs.target, pop);
  assert.deepStrictEqual([...obs.opts.attributeFilter], ['style', 'data-row-id']);
  pop.style.display = 'block'; pop.dataset.rowId = '3'; obs.cb([]);
  await w.advance(2500);
  let b = w.beats().pop().body;
  assert.deepStrictEqual([b.record, b.part, b.action], [REC, 'truck', 'assign']);
  pop.style.display = 'none'; obs.cb([]);
  await w.advance(2500);
  b = w.beats().pop().body;
  assert.deepStrictEqual([b.record, b.action], [null, 'view']);
  // closing the popover never clobbers a context someone else set
  w.P.setContext({ week: 41, record: REC, part: 'export', action: 'date:VS CD Date' });
  obs.cb([]);
  await w.advance(2500);
  assert.strictEqual(w.beats().pop().body.action, 'date:VS CD Date');
});

test('reattach(resolve) uses the caller\'s reader', async () => {
  const w = world();
  w.P.start({ week: 41 }); await w.advance(0);
  w.P.reattach(() => ({ record: 'recBBBBBBB2', part: 'import' }));
  w.observers[w.observers.length - 1].cb([]);
  await w.advance(2500);
  const b = w.beats().pop().body;
  assert.deepStrictEqual([b.record, b.part, b.action], ['recBBBBBBB2', 'import', 'assign']);
});

// ─── drawing: never a paint, never «κανείς» ────────────────────────────
test('a beat result calls WIV2.presencePatch, never a paint', async () => {
  const w = world({ responder: (b, n) => (n % 3 === 0 ? { status: 503, body: {} } : live([{ sub: 'xa', name: 'Χρήστης Α', records: [] }])) });
  w.P.start({ week: 41 }); await w.advance(0);
  for (let i = 0; i < 6; i++) { w.input(); await w.advance(16000); }
  assert.ok(w.counts.patch >= 3);
  assert.strictEqual(w.counts.patch, w.beats().length, 'one patch per answer');
  assert.strictEqual(w.counts.paint, 0);
  assert.strictEqual(w.counts.wiPaint, 0);
});

test('others(): one entry per person, whitelisted records only; tooltip from the whitelist', async () => {
  const w = world({ responder: () => live([
    { sub: 'xa', name: 'Χρήστης Α', seen_at: 't', weeks: [41], records: [{ record: REC, part: 'export', action: 'date:Loading DateTime', since: '2026-10-06T05:41:00Z', week: 41 }] },
    { sub: 'xa', name: 'Χρήστης Α', records: [{ record: 'recBBBBBBB2', part: 'truck', action: 'x<img onerror=1>', since: null }] },
    { sub: 'xb', name: 'Χρήστης Β', records: [] },
  ]) });
  w.P.start({ week: 41 }); await w.advance(0);
  const o = w.P.others();
  assert.deepStrictEqual(plain(o.map((p) => p.sub)), ['xa', 'xb']);
  assert.strictEqual(o[0].records.length, 1, 'a non-whitelisted action never reaches the screen');
  assert.strictEqual(w.P.actionText('x<img onerror=1>'), '');
  const tip = w.P.tipText(o[0].name, o[0].records[0]);
  assert.match(tip, /^Χρήστης Α · αλλάζει την ημερομηνία φόρτωσης · από \d{2}:\d{2}$/);
  assert.strictEqual(w.P.stripText(), 'Χρήστης Α, Χρήστης Β · εδώ τώρα · ↻ ζωντανά');
  o[0].records.length = 0;                         // a copy: callers cannot corrupt the store
  assert.strictEqual(w.P.others()[0].records.length, 1);
});

test('never «κανείς»: no state, text or tooltip ever claims an empty board', async () => {
  const seen = [];
  const sample = (w) => { seen.push(w.P.stripText(), JSON.stringify(w.P.state()), w.P.tipText('', {})); };
  const cases = [() => live([]), () => ({ status: 404, body: {} }), () => ({ status: 503, body: {} }), () => 'network',
    () => ({ status: 429, body: { retry_after_ms: 2500 } }), () => ({ status: 403, body: {} }), () => ({ status: 410, body: { stop: true } }),
    () => ({ status: 401, body: {} }), () => ({ status: 200, body: {} })];
  for (const r of cases) {
    const w = world({ responder: r });
    sample(w);
    w.P.start({ week: 41 }); sample(w);
    await w.advance(0); sample(w);
    await w.advance(20000); sample(w);
  }
  const w = world({ responder: () => live([]) });
  w.P.start({ week: 41 }); await w.advance(0);
  assert.strictEqual(w.P.stripText(), '↻ ζωντανά', 'live with nobody else seen says only that it is live');
  for (const s of seen) assert.ok(!/κανείς|κανένας|nobody/i.test(s), 'claims an empty board: ' + s);
});
