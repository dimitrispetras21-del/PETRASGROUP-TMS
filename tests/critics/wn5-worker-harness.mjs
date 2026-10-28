// National v5 F4α — the REAL worker/src/index.js in Node behind a stub PostgREST, for tests and rigs that must meet
// the Worker's own statuses, codes and Greek texts (never a copy of them: principle 3). Pattern of
// worker/test/plan-routes.test.mjs: a loader hook shims @cloudflare/puppeteer and, for the «day L» instance, flips the
// ONE switch `var PLAN_WRITES_OPEN = false;` (asserting it occurs exactly once, as that test does).
//   makeWorker({ writesOpen, role, sub, db }) → { fetch(request) → Promise<Response>, calls[] }
//   - the browser's Origin and a JWT signed for `role` replace whatever the request carried (the screen keeps a fake
//     token; the Worker verifies HS256 with the test secret);
//   - db(fnName, p) answers every rpc/<fn> call: return { status, body } (a PostgREST answer) or throw (a lost link —
//     the Worker's fetch rejects). p = the RPC body exactly as the Worker sent it ({p, p_actor, p_role} for writes).
//   - calls[] records { fn, p, p_actor, p_role, args } per RPC: «the table» of a test that goes through the Worker.
// One request at a time (the stub routes DB calls to the request in flight). Synthetic data only.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TMS_ROOT ? path.resolve(process.env.TMS_ROOT) : path.resolve(HERE, '../..');
const SRC = path.join(ROOT, 'worker/src/index.js');

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (!url.endsWith('/worker/src/index.js?wn5-writes-open')) return next(url, ctx);
  const r = await next(url, { ...ctx, format: 'module' });
  const text = new TextDecoder().decode(r.source);
  const needle = 'var PLAN_WRITES_OPEN = false;';
  if (text.split(needle).length !== 2) throw new Error('wn5-worker-harness: the writes switch is not exactly once in index.js');
  return { format: 'module', source: text.replace(needle, 'var PLAN_WRITES_OPEN = true;'), shortCircuit: true };
}`));
const closedWorker = (await import(pathToFileURL(SRC).href)).default;
const openWorker = (await import(pathToFileURL(SRC).href + '?wn5-writes-open')).default;

export const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub) {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}

// The PostgREST stub: the Worker reaches the DB only through globalThis.fetch (dbRpc, audit, log_unknown_field).
let active = null;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (!active) throw new Error('wn5-worker-harness: a DB call with no request in flight: ' + u.pathname);
  const table = u.pathname.replace(/^\/rest\/v1\//, '');
  const body = init.body ? JSON.parse(init.body) : undefined;
  const reply = (status, b) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (table === 'audit_log' || table === 'rpc/log_unknown_field') { active.side.push({ table, body }); return reply(201, Array.isArray(body) ? body : [body]); }
  if (!table.startsWith('rpc/')) throw new Error('wn5-worker-harness: unmocked ' + (init.method || 'GET') + ' ' + table);
  const fn = table.slice(4);
  active.calls.push({ fn, p: body && body.p, p_actor: body && body.p_actor, p_role: body && body.p_role, args: body });
  const out = await active.db(fn, body);          // a throw here = the link dropped: the Worker's fetch rejects
  if (!out || typeof out.status !== 'number') throw new Error('wn5-worker-harness: no DB answer scripted for ' + fn);
  return reply(out.status, out.body);
};

export function makeWorker({ writesOpen = false, role = 'dispatcher', sub = 'demo_' + role, db = () => undefined } = {}) {
  const calls = [], side = [];
  const w = writesOpen ? openWorker : closedWorker;
  return {
    calls, side,
    async fetch(request) {
      const h = new Headers(request.headers);
      h.set('Origin', ORIGIN);
      h.set('Authorization', 'Bearer ' + await token(role, sub));
      const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
      const req = new Request(request.url, { method: request.method, headers: h, body });
      if (active) throw new Error('wn5-worker-harness: one request at a time');
      active = { calls, side, db };
      const quiet = console.error;
      console.error = () => {};               // the Worker logs every refusal it maps; the test reads the answer instead
      try { return await w.fetch(req, env, { waitUntil() {} }); }
      finally { console.error = quiet; active = null; }
    },
  };
}
