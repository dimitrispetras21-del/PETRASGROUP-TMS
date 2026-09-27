// Worker /v1/ai/messages: what the dispatcher sees when Anthropic refuses.
// Runs the repo's worker/src/index.js (the deploy source) in Node with
// Anthropic stubbed — no network, invented secret and token.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

// The bundle imports @cloudflare/puppeteer (PDF rendering, unrelated to the AI
// proxy), which only exists in worker/node_modules after `npm install` there.
const hook = `export async function resolve(s, c, next) {
  if (s === '@cloudflare/puppeteer') return { url: 'data:text/javascript,export default {}', shortCircuit: true };
  return next(s, c);
}`;
register('data:text/javascript,' + encodeURIComponent(hook), import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(path.resolve(HERE, '../../../worker/src/index.js')).href)).default;
const ORIGIN = 'https://dimitrispetras21-del.github.io';
const env = { JWT_SECRET: 'test-secret-not-real', ANTHROPIC_API_KEY: 'test-key-not-real', ALLOWED_ORIGIN: ORIGIN };

const b64u = b => Buffer.from(b).toString('base64url');
async function token() {
  const input = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ sub: 'test', role: 'dispatcher', exp: Math.floor(Date.now() / 1000) + 600 }))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${input}.${b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))}`;
}

async function callWithUpstream(status, body) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  try {
    const req = new Request('https://worker.test/v1/ai/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + await token(), Origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 100, messages: [{ role: 'user', content: 'x' }] }),
    });
    const res = await worker.fetch(req, env, { waitUntil() {}, passThroughOnException() {} });
    return { status: res.status, body: await res.json() };
  } finally { globalThis.fetch = realFetch; }
}

test('credit exhausted upstream → 402 with a message the dispatcher can act on', async () => {
  const r = await callWithUpstream(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } });
  assert.equal(r.status, 402);
  assert.match(r.body.error, /πίστωση AI/);
});

test('any other upstream 400 stays a generic 502 (no upstream text leaks to the browser)', async () => {
  const r = await callWithUpstream(400, { type: 'error', error: { type: 'invalid_request_error', message: 'messages: field required' } });
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'AI request failed');
});

test('success passes through untouched', async () => {
  const r = await callWithUpstream(200, { content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1 } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.usage, { input_tokens: 1 });
});
