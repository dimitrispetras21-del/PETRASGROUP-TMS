// POST /presence — live presence on Weekly International v4 (TECH_DESIGN
// §g.2; owner 10/10 option A: an indication, never a lock). Two layers, both
// against worker/src/index.js itself (the deploy source — principle 3):
//   1. constants lifted out of the source text: the role list (explicit, not
//      PERMISSIONS), the action whitelist (equal to the SQL CHECK of 068), the
//      deploy guard markers;
//   2. the real bundle in Node with PostgREST stubbed via fetch: what the RPC
//      receives (identity from the JWT only), what each failure answers (401,
//      403, 400, 429, 410, 503 — never a 200 with an empty list), and the
//      owner's two levers PRESENCE_OFF / PRESENCE_MS.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(HERE, '../src/index.js');
const SQL_PATH = path.resolve(HERE, '../migrations/drafts/068_presence.sql');
const src = readFileSync(SRC_PATH, 'utf8');

// ─────────────────────────────── 1. lifted constants ───────────────────────────────
function liftArray(name) {
  const m = src.match(new RegExp(`\\nvar ${name} = (\\[[^\\]]*\\]);\\n`));
  assert.ok(m, `${name} not found in worker/src/index.js`);
  return JSON.parse(m[1]);
}
const PRESENCE_ROLES = liftArray('PRESENCE_ROLES');
const PRESENCE_ACTIONS = liftArray('PRESENCE_ACTIONS');
// The whitelist as TECH_DESIGN §g.1 fixes it (the SQL CHECK of 068).
const DESIGN_ACTIONS = ['view', 'menu', 'assign', 'date:Loading DateTime', 'date:Delivery DateTime', 'date:VS CD Date'];

test('PRESENCE_ROLES: an explicit list of today\'s five roles — no wildcard, not derived from PERMISSIONS', () => {
  assert.deepEqual(PRESENCE_ROLES, ['owner', 'management', 'accountant', 'dispatcher', 'warehouse']);
  assert.ok(!PRESENCE_ROLES.includes('*'));
  const PERMISSIONS = new Function(src.match(/var PERMISSIONS = \{[\s\S]*?\n\};\n/)[0] + '\nreturn PERMISSIONS;')();
  for (const r of PRESENCE_ROLES) assert.ok(PERMISSIONS[r], `${r} is a real role`);
  assert.doesNotMatch(src, /PRESENCE_ROLES\s*=\s*Object\.keys/, 'a future role is born without presence (principle 5)');
});

test('PRESENCE_ACTIONS equals the design whitelist, and the SQL CHECK of 068 when that file is on this branch', (t) => {
  assert.deepEqual(PRESENCE_ACTIONS, DESIGN_ACTIONS);
  if (!existsSync(SQL_PATH)) {
    // 068 is WP9's file (worker/migrations/drafts/). Said out loud, never a silent pass.
    t.skip('068_presence.sql is not on this branch yet — compared against the design list only');
    return;
  }
  const sql = readFileSync(SQL_PATH, 'utf8');
  // inline or named CONSTRAINT; quotes may be doubled inside an EXECUTE string
  const m = sql.match(/CHECK\s*\(\s*action\s+IN\s*\(([^)]*)\)/i);
  assert.ok(m, 'action CHECK not found in 068_presence.sql');
  const list = [...m[1].matchAll(/'+([^']+)'+/g)].map((x) => x[1]);
  assert.deepEqual(list, PRESENCE_ACTIONS, 'Worker whitelist ≠ SQL CHECK');
});

test('deploy guard still holds: the three + stock lots + local relay, and the new feature markers are present', () => {
  const TABLES = new Function(src.match(/var TABLES = \{[\s\S]*?\n\};\n/)[0] + '\nreturn TABLES;')();
  assert.equal(TABLES.tblgHlNmLBH3JTdIM.fields['VS CD Date'], 'cross_dock_date');
  const w = TABLES.tblMiFxbm9ky8PCQi.fields;
  assert.deepEqual([w.Country, w.Aliases, w['VAT Number'], w['Legal Name']], ['country', 'aliases', 'tax_id', 'legal_name']);
  assert.match(src, /\n {2}dispatcher: \{\n(?:[^\n]*\n)*? {4}order_stops: \["GET", "POST", "PATCH", "DELETE"\]/);
  assert.ok(src.includes('tblStockLots: {'), 'tblStockLots');
  assert.equal(src.split('"Move Kind": "move_kind"').length - 1, 1, 'Move Kind');
  // markers that go into CLAUDE.md «σημάδι ανά λειτουργία» after the deploy
  assert.ok(src.includes('var PRESENCE_ROLES = ['), 'PRESENCE_ROLES');
  assert.ok(src.includes('_expectChecked'), '_expectChecked');
});

// ─────────────────────────────── 2. the real bundle ───────────────────────────────
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}`));
const { default: worker } = await import(pathToFileURL(SRC_PATH).href);

const ORIGIN = 'https://dimitrispetras21-del.github.io';
const BASE_ENV = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const ctx = { waitUntil() {} };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub = 'tester', name = 'Χρήστης Δοκιμής') {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, name, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(BASE_ENV.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
let tabSeq = 0;
const newTab = () => `tab${String(++tabSeq).padStart(5, '0')}x`;   // [a-z0-9]{8,16}, unique per test (the guard is per isolate)
const beat = (over = {}) => ({ board: 'weekly_intl', week: 41, tab: newTab(), record: null, part: null, action: 'view', ttl_ms: 7500, changes_since: null, ...over });
async function post(body, { role = 'dispatcher', sub = 'disp1', name, auth = true, bearer, env = BASE_ENV, method = 'POST', raw } = {}) {
  const headers = { Origin: ORIGIN };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  else if (auth) headers.Authorization = `Bearer ${await token(role, sub, name)}`;
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  const req = new Request('https://w.invalid/presence', { method, headers, body: method === 'POST' ? (raw ?? JSON.stringify(body)) : undefined });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

const jsonRes = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
let calls, rpcAnswer;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
let errors;
beforeEach(() => {
  errors = [];
  console.log = console.warn = () => {};
  console.error = (...a) => errors.push(a.join(' '));
  calls = [];
  rpcAnswer = () => jsonRes({ others: [{ user_sub: 'disp2', user_name: 'Συνάδελφος', records: [] }], changes: { n: 0, last_by: null, last_at: null, auto_n: 0 } });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method || 'GET', table, body });
    if (table === 'rpc/presence_beat') return rpcAnswer(body);
    throw new Error(`unmocked fetch: ${table}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });
const rpcCalls = () => calls.filter((c) => c.table === 'rpc/presence_beat');

test('valid beat → 200 {others, changes, now, next_ms}; the RPC gets every p_* argument, identity from the JWT', async () => {
  const b = beat({ record: 'recORDER0001', part: 'export', action: 'date:Loading DateTime', ttl_ms: 7500, changes_since: '2026-10-11T05:30:00.000Z' });
  const r = await post(b, { role: 'dispatcher', sub: 'disp1', name: 'Πρώτος Χρήστης' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(Object.keys(r.json).sort(), ['changes', 'next_ms', 'now', 'others']);
  assert.equal(r.json.others.length, 1);
  assert.equal(r.json.next_ms, 5000);
  assert.ok(Number.isFinite(Date.parse(r.json.now)));
  assert.equal(rpcCalls().length, 1);
  assert.deepEqual(rpcCalls()[0].body, {
    p_sub: 'disp1', p_tab: b.tab, p_name: 'Πρώτος Χρήστης', p_role: 'dispatcher', p_board: 'weekly_intl', p_week: 41,
    p_record: 'recORDER0001', p_part: 'export', p_action: 'date:Loading DateTime', p_ttl_ms: 7500, p_leave: false,
    p_changes_since: '2026-10-11T05:30:00.000Z', p_names: false
  });
});

test('identity never comes from the body: sub/name/role keys are refused, the JWT is what the RPC sees', async () => {
  for (const k of ['sub', 'user_sub', 'name', 'role']) {
    const r = await post({ ...beat(), [k]: 'owner' });
    assert.equal(r.status, 400, `${k}: ${r.text}`);
  }
  assert.equal(rpcCalls().length, 0);
  const r = await post(beat(), { role: 'warehouse', sub: 'wh1', name: 'Αποθήκη' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([rpcCalls()[0].body.p_sub, rpcCalls()[0].body.p_role, rpcCalls()[0].body.p_name], ['wh1', 'warehouse', 'Αποθήκη']);
});

test('a JWT without a name falls back to the username, never to anything in the body', async () => {
  const r = await post(beat(), { role: 'dispatcher', sub: 'disp9', name: '' });
  assert.equal(r.status, 200, r.text);
  assert.equal(rpcCalls()[0].body.p_name, 'disp9');
});

test('p_names is true only for owner and management (today\'s AUDIT_READERS)', async () => {
  const seen = {};
  for (const role of ['owner', 'management', 'accountant', 'dispatcher', 'warehouse']) {
    calls.length = 0;
    const r = await post(beat(), { role, sub: `u_${role}` });
    assert.equal(r.status, 200, `${role}: ${r.text}`);
    seen[role] = rpcCalls()[0].body.p_names;
  }
  assert.deepEqual(seen, { owner: true, management: true, accountant: false, dispatcher: false, warehouse: false });
});

test('401 without a token or with a bad one; 403 for a role outside PRESENCE_ROLES — no RPC', async () => {
  assert.equal((await post(beat(), { auth: false })).status, 401);
  const good = await token('owner', 'boss');
  const forged = await post(beat(), { bearer: good.slice(0, -4) + (good.endsWith('AAAA') ? 'BBBB' : 'AAAA') });
  assert.equal(forged.status, 401, 'a token with a wrong signature');
  const r = await post(beat(), { role: 'driver' });
  assert.equal(r.status, 403, r.text);
  assert.equal(rpcCalls().length, 0);
});

test('400 on a bad body — whitelist and regexes, including HTML in action/record — and no RPC', async () => {
  const bad = [
    { action: 'x<script>' }, { action: '<img src=x onerror=alert(1)>' }, { action: 'date:Price' }, { action: 'View' },
    { record: 'recX<script>alert(1)</script>' }, { record: 'rec12' }, { record: 'ORDER0001' }, { record: 42 },
    { tab: 'short' }, { tab: 'UPPERCASE123' }, { tab: 'a'.repeat(17) }, { tab: undefined },
    { week: 0 }, { week: 54 }, { week: '41' }, { week: 41.5 }, { week: undefined },
    { board: 'weekly_natl' }, { board: undefined },
    { part: 'cab' }, { ttl_ms: 1.5 }, { ttl_ms: -1 }, { ttl_ms: 0 }, { ttl_ms: 600001 }, { ttl_ms: undefined }, { ttl_ms: '7500' },
    { leave: 'yes' }, { changes_since: 'yesterday' }, { changes_since: '12' }, { changes_since: '2026-10-11' }, { changes_since: 1728625800000 },
    { record_id: 'recORDER0001' }   // a typo'd key is loud, never silently ignored
  ];
  for (const over of bad) {
    const b = beat(over);
    for (const k of Object.keys(over)) if (over[k] === undefined) delete b[k];
    const r = await post(b);
    assert.equal(r.status, 400, `${JSON.stringify(over)} → ${r.status} ${r.text}`);
  }
  for (const raw of ['not json', '[1,2]', 'null', '"x"']) {
    const r = await post(null, { raw });
    assert.equal(r.status, 400, `${raw} → ${r.text}`);
  }
  assert.equal(rpcCalls().length, 0);
});

test('every whitelisted action and part is accepted; record/part/action may be null', async () => {
  for (const action of DESIGN_ACTIONS) assert.equal((await post(beat({ action }))).status, 200, action);
  for (const part of ['truck', 'export', 'import']) assert.equal((await post(beat({ part, record: 'recORDER0001' }))).status, 200, part);
  assert.equal((await post(beat({ action: null, part: null, record: null }))).status, 200);
});

test('429 when the same (sub, tab) beats within 2 s, with retry_after_ms in the JSON body; another tab or user is not throttled', async () => {
  const b = beat();
  assert.equal((await post(b)).status, 200);
  const r = await post(b);
  assert.equal(r.status, 429, r.text);
  assert.deepEqual(r.json, { error: 'too fast', retry_after_ms: 2500 });
  assert.equal((await post({ ...b, tab: newTab() })).status, 200, 'second tab of the same user');
  assert.equal((await post(b, { sub: 'disp2' })).status, 200, 'same tab id, other user');
  assert.equal(rpcCalls().length, 3, 'the throttled beat never reached the DB');
  // a pagehide leave right after a beat is accepted: refusing it would keep the row until its TTL
  const leave = await post({ tab: b.tab, leave: true });
  assert.equal(leave.status, 200, leave.text);
  // and after 2 s the same tab may beat again
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 2100;
    assert.equal((await post(b)).status, 200);
  } finally { Date.now = realNow; }
});

test('leave: {tab, leave:true} is enough → RPC with p_leave true and null context', async () => {
  const tab = newTab();
  rpcAnswer = () => jsonRes({ others: [] });
  const r = await post({ tab, leave: true });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.others, []);
  const a = rpcCalls()[0].body;
  assert.deepEqual([a.p_tab, a.p_leave, a.p_week, a.p_action, a.p_ttl_ms, a.p_board], [tab, true, null, null, null, 'weekly_intl']);
});

test('PRESENCE_OFF=1 → 410 {stop:true} before auth or any DB call', async () => {
  const env = { ...BASE_ENV, PRESENCE_OFF: '1' };
  let r = await post(beat(), { env });
  assert.equal(r.status, 410, r.text);
  assert.deepEqual(r.json, { stop: true });
  r = await post(beat(), { env, auth: false });
  assert.equal(r.status, 410);
  assert.equal(calls.length, 0);
  assert.equal((await post(beat(), { env: { ...BASE_ENV, PRESENCE_OFF: '0' } })).status, 200, 'only "1" stops');
});

test('next_ms follows PRESENCE_MS (integer, never below 2500, unreadable → 5000)', async () => {
  const cases = [[undefined, 5000], ['', 5000], ['10000', 10000], ['30000', 30000], ['2500', 2500], ['1000', 2500], ['abc', 5000], ['7.5', 5000]];
  for (const [v, want] of cases) {
    const env = { ...BASE_ENV };
    if (v !== undefined) env.PRESENCE_MS = v;
    const r = await post(beat(), { env });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.next_ms, want, `PRESENCE_MS=${v}`);
  }
});

test('RPC failure → 503 «presence unavailable» + console.error, never a 200 with an empty list', async () => {
  rpcAnswer = () => jsonRes({ code: '42883', message: 'function presence_beat does not exist' }, 404);
  let r = await post(beat());
  assert.equal(r.status, 503, r.text);
  assert.deepEqual(r.json, { error: 'presence unavailable' });
  assert.ok(errors.some((e) => e.includes('PRESENCE rpc failed')));
  rpcAnswer = () => jsonRes({ changes: { n: 0 } });   // an answer without the list is not «nobody here»
  r = await post(beat());
  assert.equal(r.status, 503, r.text);
  rpcAnswer = () => jsonRes(null);
  r = await post(beat());
  assert.equal(r.status, 503, r.text);
});

test('router: only POST /presence is served; GET is 404, OPTIONS is the usual preflight', async () => {
  assert.equal((await post(null, { method: 'GET' })).status, 404);
  const pre = await worker.fetch(new Request('https://w.invalid/presence', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), BASE_ENV, ctx);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});
