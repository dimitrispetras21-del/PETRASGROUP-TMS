// Level A (feat/tms-auditor): the fetch wrapper of worker/src/index.js, exercised on the REAL bundle
// (imported, not copied) with Supabase replaced by a fetch mock. Proves, without any network:
//  1. CORS allows x-tms-req/x-tms-app and exposes x-tms-worker-req (else the front never sends the id);
//  2. exactly one JSON line per request, with NO Authorization/query/body/username in it;
//  3. audit_log rows carry req_id;
//  4. if migration 049 has not run, the audit row is STILL written (retry without req_id) and it is loud;
//  5. a forged/oversized x-tms-req is dropped;
//  6. app_errors gets the req of the failed action + role (never the username).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { register } from 'node:module';

// The bundle imports @cloudflare/puppeteer (PDF rendering, Browser binding) which does not exist in Node.
// Stub ONLY that specifier; every other line of the deployed source runs as is.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}`));
const { default: worker } = await import('../src/index.js');

const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { ALLOWED_ORIGIN: ORIGIN, JWT_SECRET: 'test-secret-not-production', SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const LOCATIONS = 'tblxu8DRfTQOFRCzS';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function jwt(payload) {
  const enc = new TextEncoder();
  const h = b64u(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc.encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

let calls, lines, errs, missingReqColumn;
const realLog = console.log, realErr = console.error;
beforeEach(() => {
  calls = []; lines = []; errs = []; missingReqColumn = false;
  console.log = (s) => { lines.push(String(s)); };
  console.error = (...a) => { errs.push(a.join(' ')); };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, path: u.pathname, search: u.search, body });
    const rows = Array.isArray(body) ? body : [body];
    // "049 not run": audit_log lacks req_id; app_errors lacks req_id AND role (audit_log.role exists since 001)
    const missing = u.pathname.endsWith('/audit_log') ? ['req_id'] : u.pathname.endsWith('/app_errors') ? ['req_id', 'role'] : [];
    if (method === 'POST' && missingReqColumn && rows.some((r) => r && missing.some((k) => k in r))) {
      return new Response(JSON.stringify({ code: 'PGRST204', message: "Could not find the 'req_id' column of 'audit_log' in the schema cache" }), { status: 400 });
    }
    if (method === 'GET') return Response.json([{ id: 7, legacy_id: 'recLOC7', name: 'X', deleted_at: null }]);
    if (method === 'PATCH') return Response.json([{ id: 7, legacy_id: 'recLOC7', name: 'X', deleted_at: '2026-09-22T20:00:00Z' }]);
    return Response.json(Array.isArray(body) ? body : [{ id: 1, ...body }], { status: 201 });
  };
});
const restore = () => { console.log = realLog; console.error = realErr; };

// Workers ctx: collect waitUntil promises so a test can await the (deliberately deferred) request line.
const mkCtx = () => { const p = []; return { waitUntil: (x) => p.push(x), flush: () => Promise.all(p) }; };
const reqLines = () => lines.filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)).filter((j) => j.kind === 'req');

test('CORS preflight allows the correlation headers and exposes the capability flag', async () => {
  const res = await worker.fetch(new Request('https://w.invalid/health', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env, {});
  restore();
  assert.equal(res.status, 204);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /x-tms-req/);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /x-tms-app/);
  assert.match(res.headers.get('Access-Control-Expose-Headers'), /x-tms-worker-req/);
  assert.equal(reqLines().length, 0, 'preflight is not logged');
});

test('one request line, capability header, and nothing sensitive in the line', async () => {
  const token = await jwt({ sub: 'someuser', role: 'owner', exp: Math.floor(Date.now() / 1000) + 600 });
  const ctx = mkCtx();
  const res = await worker.fetch(new Request(`https://w.invalid/v0/appX/${LOCATIONS}?filterByFormula=SECRETQUERY&pageSize=1`, {
    headers: { Origin: ORIGIN, Authorization: `Bearer ${token}`, 'x-tms-req': 'abcdef0123456789abcdef0123-2', 'x-tms-app': '1790105400' } }), env, ctx);
  assert.equal(reqLines().length, 0, 'the line is NOT written before the response is returned (waitUntil)');
  await ctx.flush();
  restore();
  const ts = Number(res.headers.get('x-tms-worker-req'));
  assert.ok(Math.abs(ts - Date.now() / 1000) < 5, 'capability header is a fresh unix timestamp');
  const ls = reqLines();
  assert.equal(ls.length, 1, 'exactly one kind:"req" line');
  const l = ls[0];
  assert.deepEqual([l.req, l.method, l.table, l.action, l.role, l.app], ['abcdef0123456789abcdef0123-2', 'GET', 'locations', 'read', 'owner', '1790105400']);
  assert.equal(l.status, res.status);
  const raw = lines.join('\n');
  for (const secret of ['SECRETQUERY', 'filterByFormula', token, 'someuser', 'Bearer']) assert.ok(!raw.includes(secret), `line leaks ${secret}`);
});

test('audit_log carries req_id; without migration 049 the audit row is still written and it is loud', async () => {
  const token = await jwt({ sub: 'someuser', role: 'owner', exp: Math.floor(Date.now() / 1000) + 600 });
  const dctx = mkCtx();
  const doDelete = () => worker.fetch(new Request(`https://w.invalid/v0/appX/${LOCATIONS}/recLOC7`, {
    method: 'DELETE', headers: { Origin: ORIGIN, Authorization: `Bearer ${token}`, 'x-tms-req': 'aaaabbbbccccdddd0000-1' } }), env, dctx);

  let res = await doDelete();
  const withCol = calls.filter((c) => c.method === 'POST' && c.path.endsWith('/audit_log'));
  assert.equal(res.status < 300, true, `delete ok (${res.status})`);
  assert.equal(withCol.length, 1);
  assert.equal(withCol[0].body.req_id, 'aaaabbbbccccdddd0000-1');

  calls = []; errs = []; missingReqColumn = true;
  res = await doDelete();
  await dctx.flush();                               // deferred request lines must not leak into the next test
  restore();
  const posts = calls.filter((c) => c.method === 'POST' && c.path.endsWith('/audit_log'));
  assert.equal(posts.length, 2, 'first with req_id (rejected), then without');
  assert.ok(!('req_id' in posts[1].body), 'retry drops req_id');
  assert.ok(errs.some((e) => e.includes('REQ_ID COLUMN MISSING')), 'the fallback is loud');
  assert.ok(!errs.some((e) => e.includes('AUDIT WRITE FAILED')), 'the audit row was NOT lost');
});

test('forged x-tms-req is dropped (never reaches logs or audit)', async () => {
  const res = await worker.fetch(new Request('https://w.invalid/health', { headers: { Origin: ORIGIN, 'x-tms-req': "x'; DROP TABLE users;--" } }), env, {});
  restore();
  assert.equal(res.status, 200);
  assert.equal(reqLines()[0].req, null);
});

test('app_errors gets the failed action req + role, never the username', async () => {
  const token = await jwt({ sub: 'someuser', role: 'accountant', exp: Math.floor(Date.now() / 1000) + 600 });
  const res = await worker.fetch(new Request('https://w.invalid/app-errors', { method: 'POST',
    headers: { Origin: ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'HTTP 401', req: 'feedfacefeedface-3' }) }), env, {});
  restore();
  assert.equal(res.status, 201);
  const ins = calls.find((c) => c.method === 'POST' && c.path.endsWith('/app_errors'));
  assert.equal(ins.body.req_id, 'feedfacefeedface-3');
  assert.equal(ins.body.role, 'accountant');
  const line = reqLines()[0];
  assert.equal(line.table, 'app-errors');
  assert.ok(!JSON.stringify(line).includes('someuser'));
});

test('preflight: logged ONLY when refused (header not allowed / foreign origin), never when it succeeds', async () => {
  let res = await worker.fetch(new Request('https://w.invalid/costs/rt', { method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Headers': 'content-type, authorization, x-tms-req' } }), env, mkCtx());
  assert.equal(reqLines().length, 0, 'a successful preflight writes nothing');
  res = await worker.fetch(new Request('https://w.invalid/costs/rt', { method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Headers': 'content-type, x-evil-header' } }), env, mkCtx());
  res = await worker.fetch(new Request('https://w.invalid/costs/rt', { method: 'OPTIONS', headers: { Origin: 'https://evil.invalid' } }), env, mkCtx());
  restore();
  const ls = reqLines();
  assert.deepEqual(ls.map((l) => [l.method, l.err]), [['OPTIONS', 'preflight-refused: headers x-evil-header'], ['OPTIONS', 'preflight-refused: origin']]);
});

test('every route family gets a line: /costs, /pallets, /print, /audit, /app-errors, /health', async () => {
  const token = await jwt({ sub: 'someuser', role: 'owner', exp: Math.floor(Date.now() / 1000) + 600 });
  const ctx = mkCtx();
  for (const [m, p] of [['GET', '/costs/rt?from=2026-09-01&to=2026-09-07'], ['GET', '/pallets/gate?order_recs=recA'], ['GET', '/audit'],
                        ['GET', '/print/pdf?x=1'], ['GET', '/health']]) {
    await worker.fetch(new Request('https://w.invalid' + p, { method: m, headers: { Origin: ORIGIN, Authorization: `Bearer ${token}`, 'x-tms-req': 'ffffeeeeddddcccc0000-1' } }), env, ctx);
  }
  await ctx.flush(); restore();
  const t = reqLines().map((l) => [l.table, l.req]);
  assert.deepEqual(t.map((x) => x[0]), ['costs', 'pallets', 'audit', 'print', 'health']);
  assert.ok(t.every((x) => x[1] === 'ffffeeeeddddcccc0000-1'));
  assert.ok(!lines.join('\n').includes('order_recs'), 'no query string in any line');
});

test('app_errors kind=offline is stored as a non-error; unknown kind is ignored', async () => {
  await worker.fetch(new Request('https://w.invalid/app-errors', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'queue: offline flush synced 1', kind: 'offline' }) }), env, mkCtx());
  await worker.fetch(new Request('https://w.invalid/app-errors', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'boom', kind: 'drop table' }) }), env, mkCtx());
  restore();
  const ins = calls.filter((c) => c.method === 'POST' && c.path.endsWith('/app_errors')).map((c) => c.body.kind ?? null);
  assert.deepEqual(ins, ['offline', null]);
});
