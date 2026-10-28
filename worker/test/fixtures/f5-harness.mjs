// F5 (national v5, day L) tests: the real Worker in Node, PostgREST stubbed via fetch — the harness of
// plan-routes.test.mjs, shared by the F5 test files only. Two instances of the same source: as deployed (deploy 1,
// writes closed) and one with the single switch flipped by a loader hook (deploy 2, day L), so the day-L behaviour
// is tested without a second switch in the source.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRC_PATH = path.resolve(HERE, '../../src/index.js');

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (!url.endsWith('/worker/src/index.js?plan-writes-open')) return next(url, ctx);
  const r = await next(url, { ...ctx, format: 'module' });
  const text = new TextDecoder().decode(r.source);
  const needle = 'var PLAN_WRITES_OPEN = false;';
  if (text.split(needle).length !== 2) throw new Error('f5-harness: the writes switch is not exactly once in index.js');
  return { format: 'module', source: text.replace(needle, 'var PLAN_WRITES_OPEN = true;'), shortCircuit: true };
}`));
const { default: worker } = await import(pathToFileURL(SRC_PATH).href);
const { default: workerOpen } = await import(pathToFileURL(SRC_PATH).href + '?plan-writes-open');

export const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const ctx = { waitUntil() {} };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub = 'tester') {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function callOn(w, role, method, p, body) {
  const headers = { Origin: ORIGIN, Authorization: `Bearer ${await token(role)}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const raw = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const res = await w.fetch(new Request(`https://w.invalid${p}`, { method, headers, body: raw }), env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}
export const call = (...a) => callOn(worker, ...a);       // deploy 1: writes closed
export const callOpen = (...a) => callOn(workerOpen, ...a); // deploy 2 (day L): writes open

export const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
export const pgError = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// routes: [{ method, table, handler(url, body) → Response | null }], first answer wins; `calls` records every fetch.
export const routes = [];
export const calls = [];
export const on = (method, table, handler) => routes.push({ method, table, handler });
export const rpcCalls = () => calls.filter((c) => c.table.startsWith('rpc/'));
// the DB writes a request reached (the audit row and the unknown-field log are not the write under test)
export const writes = () => calls.filter((c) => c.method !== 'GET' && c.table !== 'audit_log' && c.table !== 'rpc/log_unknown_field');
const realConsole = { log: console.log, error: console.error, warn: console.warn };
const realFetch = globalThis.fetch;
// install before each test: an empty stub where an unmocked call throws (the test names what it expects)
export function reset() {
  console.log = console.error = console.warn = () => {};
  routes.length = 0;
  calls.length = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, table, params: u.searchParams, body });
    for (const r of routes) {
      if (r.method === method && r.table === table) {
        const out = await r.handler(u, body);
        if (out) return out;
      }
    }
    if (method === 'POST' && table === 'audit_log') return json(Array.isArray(body) ? body : [body], 201);
    if (method === 'POST' && table === 'rpc/log_unknown_field') return json(null);
    throw new Error(`unmocked fetch: ${method} ${table}?${u.searchParams}`);
  };
}
export function restore() {
  Object.assign(console, realConsole);
  globalThis.fetch = realFetch;
}
