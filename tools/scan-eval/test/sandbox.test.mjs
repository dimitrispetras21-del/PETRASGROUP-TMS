// Runs today's scanner code (loaded from the repo) against the mock Worker.
// No network: the only fetch is the mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createScannerSandbox, toPrediction, extractFunction, INTL_SCAN_FUNCTIONS, REF_FIELDS, browserMimeType } from '../lib/app-sandbox.mjs';
import { createMockFetch } from '../lib/mock-fetch.mjs';
import { recordingFetch, callCost, jwtExpiry } from '../run-current.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const FIX = path.join(HERE, '..', 'fixtures');
const refData = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-ref.json'), 'utf8'));
const extraction = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-extraction.json'), 'utf8'));

// Invented bytes; the upload gate and preprocessing look at the MIME type only.
const pdf = () => new File([Buffer.from('%PDF-1.4\n% synthetic test document\n%%EOF\n')], 'synthetic-order.pdf', { type: browserMimeType('x.pdf') });

function sandbox() {
  const fetch = recordingFetch(createMockFetch({ refData, extraction }));
  return { fetch, sb: createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'test.jwt.value', refData }) };
}

test('every scan-path function is found and parses on its own', () => {
  const src = fs.readFileSync(path.join(REPO, 'modules/orders_intl.js'), 'utf8');
  for (const fn of INTL_SCAN_FUNCTIONS) assert.doesNotThrow(() => new vm.Script(extractFunction(src, fn)), fn);
});

test('REF_FIELDS match what the app preloads (core/api.js _REF_FIELDS)', () => {
  const api = fs.readFileSync(path.join(REPO, 'core/api.js'), 'utf8');
  const block = api.slice(api.indexOf('const _REF_FIELDS'), api.indexOf('};', api.indexOf('const _REF_FIELDS')));
  const list = key => JSON.parse(block.match(new RegExp(`\\n\\s*${key}:\\s*(\\[[^\\]]*\\])`))[1].replace(/'/g, '"'));
  assert.deepEqual(list('clients'), REF_FIELDS.clients);
  assert.deepEqual(list('locations'), REF_FIELDS.locations);
});

test('PDF goes through classify → Opus tool loop → form prefill', async () => {
  const { fetch, sb } = sandbox();
  const r = await sb.scanFile(pdf());
  assert.equal(r.status, 'ok', r.error);
  const consts = sb.constants();
  const ai = fetch.calls.filter(c => c.path === '/v1/ai/messages');
  assert.deepEqual(ai.map(c => c.model), [consts.MODELS.HAIKU, consts.MODELS.OPUS, consts.MODELS.OPUS]);
  assert.equal(ai[0].max_tokens, 20);
  assert.equal(ai[1].max_tokens, consts.SCAN_MAX_TOKENS);
  assert.equal(ai[1].tools, 2);
  const p = toPrediction(r, consts.F);
  assert.equal(p.client_id, 'recSynthClient0001');
  assert.equal(p.reference, 'SYN-0001');
  assert.equal(p.temperature_c, -18);
  assert.equal(p.pallets, 20);
  assert.equal(p.pallet_type, null);
  assert.deepEqual(p.stops.map(s => [s.type, s.location_id, s.date]), [
    ['loading', 'recSynthLoc000001', '2031-01-10'],
    ['delivery', 'recSynthLoc000002', '2031-01-13'],       // matched by the app's fuzzy fallback
  ]);
  assert.equal(p.confidence.client_name, 0.95);
});

test('Origin header is added (Worker answers 403 without it) and the token never lands in the call log', async () => {
  const mock = createMockFetch({ refData, extraction });
  const fetch = recordingFetch(mock);
  const sb = createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'secret.jwt.value', refData });
  await sb.scanFile(pdf());
  assert.ok(mock.calls.length > 0 && mock.calls.every(c => c.origin === 'https://dimitrispetras21-del.github.io' && c.hasAuth));
  assert.ok(!JSON.stringify(fetch.calls).includes('secret.jwt.value'));
});

test('legacy .doc is refused by the upload gate before any AI call', async () => {
  const { fetch, sb } = sandbox();
  const doc = new File([Buffer.from('synthetic')], 'synthetic-order.doc', { type: browserMimeType('x.doc') });
  const r = await sb.scanFile(doc);
  assert.equal(r.status, 'rejected');
  assert.match(r.error, /μη υποστηριζόμενος τύπος/);
  assert.equal(fetch.calls.length, 0);
});

test('cost and token helpers', () => {
  assert.equal(callCost('claude-opus-5', { input_tokens: 1e6 }), 5);
  assert.equal(callCost('claude-opus-5', { cache_read_input_tokens: 1e6 }), 0.5);
  assert.equal(callCost('claude-haiku-4-5-20251001', { output_tokens: 1e6 }), 5);
  assert.equal(callCost('unknown-model', {}), null);
  const tok = ['x', Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url'), 'y'].join('.');
  assert.equal(jwtExpiry(tok).getTime(), 1000);
  assert.equal(jwtExpiry('garbage'), null);
});
