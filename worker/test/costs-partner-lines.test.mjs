// Q6-1 (owner 26/10, money): «a cycle with two PARTNER segments costs the SUM of the segments' partner rates; a
// partner's invoice replaces ONLY that partner's own rate» (073 ct_v_rt_partner_cost). POST / PATCH /costs/lines take
// partner_id on a partner_rate line (ct_cost_lines.partner_id, 073) and check it when the line is written: only with
// partner_rate; on a v5 cycle one of the partners of its live PARTNER segments; on a cycle with two or more partners a
// line must name one. Today's round trips (model 1) and other categories take today's path. PostgREST stubbed via
// fetch (as costs-lines-paging.test.mjs); synthetic ids only.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_PATH = path.resolve(HERE, '../src/index.js');
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(spec, ctx);
}`));
const { default: worker } = await import(pathToFileURL(SRC_PATH).href);

const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { JWT_SECRET: 'test-secret-not-real', ALLOWED_ORIGIN: ORIGIN, SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_KEY: 'svc-test' };
const ctx = { waitUntil() {} };
const b64u = (b) => Buffer.from(b).toString('base64url');
async function token(role, sub = 'tester') {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}
async function call(method, pathAndQuery, body, role = 'accountant') {
  const req = new Request(`https://w.invalid${pathAndQuery}`, { method, headers: { Origin: ORIGIN, Authorization: `Bearer ${await token(role)}`,
    'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const res = await worker.fetch(req, env, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// cycle 40: v5, partners 7 (segment 1) and 8 (segment 2); cycle 41: v5, one partner 7; trip 5: today's model;
// round 3: cycle 42 v5 one partner 8, cycle 44 v5 partners 8 and 9, cycle 45 v5 with no PARTNER segment
const TRIPS = { 40: { id: 40, model: 2 }, 41: { id: 41, model: 2 }, 42: { id: 42, model: 2 }, 44: { id: 44, model: 2 }, 45: { id: 45, model: 2 }, 5: { id: 5, model: 1 } };
const SEGS0 = { 40: [{ partner_id: 7 }, { partner_id: 8 }], 41: [{ partner_id: 7 }], 42: [{ partner_id: 8 }], 44: [{ partner_id: 8 }, { partner_id: 9 }] };
let SEGS;
const LINE = { id: 900, rt_id: 41, category: 'partner_rate', net: 280, vat: 0, pay_source: 'CREDIT', doc_id: null, partner_id: null };
let row900;
const json = (rows, status = 200) => new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } });
let calls; let insertError;
const realConsole = { log: console.log, error: console.error, warn: console.warn };
beforeEach(() => {
  console.log = console.error = console.warn = () => {};
  calls = []; insertError = null;
  SEGS = structuredClone(SEGS0); row900 = { ...LINE };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const table = u.pathname.replace(/^\/rest\/v1\//, '');
    calls.push({ method, table, params: u.searchParams, body: init.body ? JSON.parse(init.body) : null });
    const eq = (k) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
    if (method === 'GET' && table === 'ct_round_trips') return json(TRIPS[eq('id')] ? [TRIPS[eq('id')]] : []);
    if (method === 'GET' && table === 'rt_vehicle_segments') return json(SEGS[eq('rt_id')] || []);
    if (method === 'GET' && table === 'ct_cost_lines') return json(eq('id') === '900' ? [row900] : []);
    if (method === 'POST' && table === 'ct_cost_lines') {
      if (insertError) return json(insertError, 400);
      return json([{ id: 901, ...JSON.parse(init.body) }], 201);
    }
    if (method === 'PATCH' && table === 'ct_cost_lines') return json([{ ...row900, ...JSON.parse(init.body) }]);
    if (table === 'audit_log') return json([], 201);
    throw new Error(`unmocked fetch: ${method} ${table}?${u.searchParams}`);
  };
});
afterEach(() => { Object.assign(console, realConsole); });

const line = (o) => ({ category: 'partner_rate', net: 280, vat: 0, pay_source: 'CREDIT', line_date: '2026-10-20', ...o });
const inserted = () => calls.filter((c) => c.method === 'POST' && c.table === 'ct_cost_lines');

test('POST: a two-partner cycle - the invoice names one of its partners, and is stored with it', async () => {
  const r = await call('POST', '/costs/lines', line({ rt_id: 40, partner_id: 8 }));
  assert.equal(r.status, 201, r.text);
  assert.equal(inserted()[0].body.partner_id, 8);
});

test('POST: a two-partner cycle - a line that names nobody, or a partner who drives no segment, is refused before the insert', async () => {
  const none = await call('POST', '/costs/lines', line({ rt_id: 40 }));
  assert.equal(none.status, 409, none.text);
  assert.match(none.json.error, /διάλεξε ποιανού είναι το τιμολόγιο/);
  const other = await call('POST', '/costs/lines', line({ rt_id: 40, partner_id: 9 }));
  assert.equal(other.status, 409, other.text);
  assert.match(other.json.error, /δεν εκτελεί τμήμα αυτού του κύκλου/);
  assert.equal(inserted().length, 0, 'nothing written');
});

test('POST: one partner - a line without a name is that partner\'s, and is STORED with it (final round 2, finding 2); today\'s trips read no segment', async () => {
  const one = await call('POST', '/costs/lines', line({ rt_id: 41 }));
  assert.equal(one.status, 201, one.text);
  // stamped at the write: a later handover to a second partner cannot turn it into an unmatched row
  assert.equal(inserted()[0].body.partner_id, 7);
  calls = [];
  const v1 = await call('POST', '/costs/lines', line({ rt_id: 5 }));
  assert.equal(v1.status, 201, v1.text);
  assert.equal(inserted()[0].body.partner_id, undefined, 'today\'s model: nothing stamped');
  assert.equal(calls.filter((c) => c.table === 'rt_vehicle_segments').length, 0);
  calls = [];
  const fuel = await call('POST', '/costs/lines', line({ rt_id: 40, category: 'fuel' }));
  assert.equal(fuel.status, 201, 'another category: as before');
  assert.equal(calls.filter((c) => c.table === 'rt_vehicle_segments').length, 0);
});

test('POST: partner_id only on a partner_rate line, and a whole id', async () => {
  const r = await call('POST', '/costs/lines', line({ rt_id: 41, category: 'fuel', partner_id: 7 }));
  assert.equal(r.status, 400, r.text);
  assert.match(r.json.error, /μόνο σε γραμμή «Κόμιστρο συνεργάτη»/);
  const bad = await call('POST', '/costs/lines', line({ rt_id: 41, partner_id: '7' }));
  assert.equal(bad.status, 400, bad.text);
  assert.equal(inserted().length, 0);
});

test('PATCH: the EFFECTIVE line is checked - moved to a two-partner cycle without a name is refused; naming one is written', async () => {
  const move = await call('PATCH', '/costs/lines/900', { rt_id: 40, reason: 'TEST' });
  assert.equal(move.status, 409, move.text);
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 0, 'nothing written');
  calls = [];
  const named = await call('PATCH', '/costs/lines/900', { rt_id: 40, partner_id: 7, reason: 'TEST' });
  assert.equal(named.status, 200, named.text);
  const w = calls.find((c) => c.method === 'PATCH' && c.table === 'ct_cost_lines');
  assert.equal(w.body.partner_id, 7);
});

test('PATCH (final round 2, finding 2): an unnamed line of a one-partner cycle is stamped with that partner on any edit', async () => {
  const r = await call('PATCH', '/costs/lines/900', { note: 'TEST', reason: 'TEST' });
  assert.equal(r.status, 200, r.text);
  const w = calls.find((c) => c.method === 'PATCH' && c.table === 'ct_cost_lines');
  assert.equal(w.body.partner_id, 7);
});

// Final round 3 (review finding 1): a stamped name is derived, not sticky. No screen sends partner_id, so each case
// below was a 400/409 with no way out but SQL (probe rv-r2/probe-sticky.test.mjs) and is now written.
const written = () => calls.find((c) => c.method === 'PATCH' && c.table === 'ct_cost_lines');

test('PATCH round 3: a stamped line recategorised away from partner_rate is written, and its partner cleared', async () => {
  row900 = { ...LINE, partner_id: 7 };
  const r = await call('PATCH', '/costs/lines/900', { category: 'other', reason: 'TEST' });
  assert.equal(r.status, 200, r.text);
  assert.equal(written().body.partner_id, null);
});

test('PATCH round 3: a stamped line moved to a one-partner cycle of another partner takes that partner', async () => {
  row900 = { ...LINE, partner_id: 7 };
  const r = await call('PATCH', '/costs/lines/900', { rt_id: 42, reason: 'TEST' });
  assert.equal(r.status, 200, r.text);
  assert.equal(written().body.partner_id, 8);
});

test('PATCH round 3: the segment\'s partner corrected 7 -> 9, a note edit re-derives the stamp (the invoice follows the new partner)', async () => {
  row900 = { ...LINE, partner_id: 7 };
  SEGS[41] = [{ partner_id: 9 }];
  const r = await call('PATCH', '/costs/lines/900', { note: 'x', reason: 'TEST' });
  assert.equal(r.status, 200, r.text);
  assert.equal(written().body.partner_id, 9);
});

test('PATCH round 3: a stored name that still fits is kept - the screen\'s edit (category re-sent unchanged), and a move to a cycle it still drives', async () => {
  row900 = { ...LINE, partner_id: 7 };
  const edit = await call('PATCH', '/costs/lines/900', { category: 'partner_rate', net: 300, reason: 'TEST' });
  assert.equal(edit.status, 200, edit.text);
  assert.equal('partner_id' in written().body, false, 'nothing re-written');
  calls = [];
  const move = await call('PATCH', '/costs/lines/900', { rt_id: 40, reason: 'TEST' });
  assert.equal(move.status, 200, move.text);
  assert.equal('partner_id' in written().body, false, '7 drives a segment of cycle 40: kept, no name asked');
});

test('PATCH round 3: a stale stored name on a two-partner cycle is refused like an unnamed line; a move to today\'s model clears it; a v5 cycle with no PARTNER segment keeps it', async () => {
  row900 = { ...LINE, partner_id: 7 };
  const two = await call('PATCH', '/costs/lines/900', { rt_id: 44, reason: 'TEST' });
  assert.equal(two.status, 409, two.text);
  assert.match(two.json.error, /διάλεξε ποιανού είναι το τιμολόγιο/);
  assert.equal(written(), undefined, 'nothing written');
  calls = [];
  const v1 = await call('PATCH', '/costs/lines/900', { rt_id: 5, reason: 'TEST' });
  assert.equal(v1.status, 200, v1.text);
  assert.equal(written().body.partner_id, null);
  calls = [];
  row900 = { ...LINE, rt_id: 45, partner_id: 7 };
  const none = await call('PATCH', '/costs/lines/900', { note: 'x', reason: 'TEST' });
  assert.equal(none.status, 200, none.text);
  assert.equal('partner_id' in written().body, false, 'kept: unmatched either way, B-94 names the cycle');
});

// Final round 4 (review r3 finding 3, probes A and B): on a cycle with two or more partners, ANY edit of a line that
// names nobody, or names a partner who drives none of its segments, is refused - a note or an amount fix too, not only
// a move. Latent while PLAN_WRITES_OPEN = false; the way out is F4's partner picker (plan D-17), never a guessed name.
test('PATCH round 4: a two-partner cycle refuses a note or an amount fix on an unnamed line, and on a stale name; nothing is written', async () => {
  for (const [stored, body] of [[null, { note: 'x' }], [null, { net: 300 }], [7, { note: 'x' }], [7, { category: 'partner_rate', net: 300 }]]) {
    calls = [];
    row900 = { ...LINE, rt_id: stored == null ? 40 : 44, partner_id: stored };
    const r = await call('PATCH', '/costs/lines/900', { ...body, reason: 'TEST' });
    assert.equal(r.status, 409, `${JSON.stringify({ stored, body })}: ${r.text}`);
    assert.match(r.json.error, /διάλεξε ποιανού είναι το τιμολόγιο/);
    assert.equal(written(), undefined, 'nothing written');
  }
});

test('deploy order: a Worker that meets no ct_cost_lines.partner_id (073 not run) says so by name', async () => {
  insertError = { code: 'PGRST204', message: "Could not find the 'partner_id' column of 'ct_cost_lines' in the schema cache" };
  const r = await call('POST', '/costs/lines', line({ rt_id: 5, partner_id: 7 }));
  // model 1: the check passes (partner_rate + an id); the base refuses the unknown column - 503 that names 073
  assert.equal(r.status, 503, r.text);
  assert.match(r.json.error, /f3_missing/);
});
