// Round 3 (docs/scan/04): pallet fallback, confidence calibration, duplicate/
// history location matching, and the eval harness's leakage guard. Only
// INVENTED data — no real client, location or document (same rule as
// engine-v2.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createScannerSandbox, browserMimeType } from '../lib/app-sandbox.mjs';
import { createMockFetch } from '../lib/mock-fetch.mjs';
import { recordingFetch } from '../run-current.mjs';
import { makePdf, makeDoc } from './synthetic-docs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const FIX = path.join(HERE, '..', 'fixtures');
const refData = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-ref.json'), 'utf8'));
const extraction = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-extraction.json'), 'utf8'));
const extractionV2 = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-extraction-v2.json'), 'utf8'));

// Loads ONLY core/scan-engine-v2.js in a bare vm (no config.js/countries.js),
// same lightweight pattern as the number-parsing test in engine-v2.test.mjs —
// every helper tested here degrades gracefully without _fhNorm/countryCode.
function loadEngineOnly() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(REPO, 'core/scan-engine-v2.js'), 'utf8'), ctx, { filename: 'core/scan-engine-v2.js' });
  return ctx;
}

// Same, plus core/countries.js's countryCode() — needed only by the country-
// mismatch test: without it, _sv2ScoreLocation treats every stop as
// same-country (its documented graceful degradation for tests that don't
// care about country at all), which would hide the exact thing that test
// checks.
function loadEngineWithCountries() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(REPO, 'core/countries.js'), 'utf8'), ctx, { filename: 'core/countries.js' });
  vm.runInContext(fs.readFileSync(path.join(REPO, 'core/scan-engine-v2.js'), 'utf8'), ctx, { filename: 'core/scan-engine-v2.js' });
  return ctx;
}

// ─── Task 1: pallets fallback ("Number: 33,00" sometimes left empty) ───────
test('v2: pallets fallback reads "Number:" from the cargo-summary line (round 3)', () => {
  const ctx = loadEngineOnly();
  const f = ctx._sv2PalletsFromText;
  // Real pattern seen on the golden set (docs/scan/04): pdf.js sometimes
  // splits "Weight" into "W  eight" from glyph-run reconstruction; the
  // fallback must not depend on that word being intact.
  assert.equal(f('Weight: 3 500,00 kg, Number: 33,00, CBM: 75,00, LDM: 13,60'), 33);
  assert.equal(f('W  eight: 3 500,00 kg, Number: 33,00, C  B  M: 75,00, LDM: 13,60'), 33);
  // The all-1,00 row is the document's own placeholder for "not stated" —
  // same rule the model is told to follow, honoured by the fallback too.
  assert.equal(f('W  eight: 1,00 kg, Number: 1,00, CBM: 1,00, LDM: 1,00'), null);
  // No LDM anchor on the line: could be an unrelated "Order Number", not the
  // cargo-summary line — must not guess.
  assert.equal(f('Order Number: 4711'), null);
  assert.equal(f(''), null);
  assert.equal(f(null), null);
});

test('v2: an empty model pallets field is filled from the document text, flagged, never silent', async () => {
  const lines = ['Sample Shipper Ltd', 'Transport order FB-0007', 'Loading: Alpha Cold Store, Testdorf, DE, 10.01.2031',
    'Delivery: Gamma Warehouse, Samplepolis, GR, 13.01.2031',
    'Weight: 3 500,00 kg, Number: 33,00, CBM: 75,00, LDM: 13,60'];
  const extractionV2Empty = structuredClone(extractionV2);
  extractionV2Empty.orders[0].pallets = { v: '', c: 0, q: '' };          // model missed it
  extractionV2Empty.orders[0].stops.forEach(s => { s.pallets = ''; });  // stops don't carry it either
  const fetch = recordingFetch(createMockFetch({ refData, extraction, extractionV2: extractionV2Empty }));
  const sb = createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'x.y.z', refData, engine: 'v2' });
  const r = await sb.scanFile(new File([makePdf(lines)], 'fb.pdf', { type: browserMimeType('x.pdf') }));
  assert.equal(r.status, 'ok', r.error);
  assert.equal(r.parsed.pallets, 33);
  assert.equal(r.parsed.field_confidence.pallets, 0.55);      // deterministic-but-unverified-by-model, not a guess
  assert.match(r.parsed.notes, /Number: 33/);                 // warning is visible, not silent
});

// ─── Task 2: confidence calibration ─────────────────────────────────────────
test('v2: calibration lifts a verified quote, caps an unverifiable one (round 3)', () => {
  const ctx = loadEngineOnly();
  const cal = ctx._sv2Calibrate;
  const text = 'Transport order ABC-99 for Acme.';
  assert.ok(cal(0.3, 'ABC-99', text) >= 0.9, 'low self-doubt but the quote IS in the document -> trusted');
  assert.ok(cal(0.95, 'XYZ-not-in-doc', text) <= 0.4, 'high self-claim but the quote is NOT in the document -> capped');
  assert.equal(cal(0.4, '', text), 0.4, 'no quote given -> left as reported');
  assert.equal(cal(0.4, 'ABC-99', null), 0.4, 'no text layer to check against (image/PDF mode) -> left as reported');
});

test('v2: confidence combine trusts a near-certain deterministic match over a hedging model score (round 3)', () => {
  const ctx = loadEngineOnly();
  const combine = ctx._sv2Combine;
  assert.equal(combine(0.3, 0.95), 0.95, 'near-certain match (>=0.85) wins even over a low model score');
  assert.equal(combine(0.9, 0), 0, 'no match at all -> 0 regardless of what the model claims');
  const mid = combine(0.9, 0.5);
  assert.ok(mid >= 0.5 && mid <= 0.65, `blended and bounded, got ${mid}`);
});

// ─── Task 3: location matching — duplicates, history, country override ────
test('v2: a tied duplicate pair (same company, different towns) is settled by the client\'s own history (round 3)', () => {
  const ctx = loadEngineOnly();
  const locations = [
    { id: 'recA', fields: { Name: 'Acme Depot', City: 'Springfield', Country: 'DE' } },
    { id: 'recB', fields: { Name: 'Acme Depot', City: 'Shelbyville', Country: 'DE' } },
  ];
  // The document's own city ("Northtown") matches neither registered site —
  // exactly the "duplicate records for one client" case (docs/scan/03 #2):
  // name alone ties the two records.
  const stop = { company: 'Acme Depot', city: 'Northtown', country: 'DE', postcode: '' };
  const noHistory = ctx._sv2PickLocation(stop, [], locations, new Set());
  assert.equal(noHistory.by, 'code');
  assert.equal(noHistory.id, 'recA');   // arbitrary (array order) — not wrong, just not informed

  const withHistory = ctx._sv2PickLocation({ ...stop }, [], locations, new Set(['recB']));
  assert.equal(withHistory.by, 'history-tiebreak');
  assert.equal(withHistory.id, 'recB'); // this client has actually shipped to recB before
});

test('v2: postcode in the document breaks a name/city tie via the record\'s stored Address (round 3)', () => {
  const ctx = loadEngineOnly();
  const locations = [
    { id: 'recX', fields: { Name: 'Big Retailer', City: 'Metropolis', Country: 'GR' } },
    { id: 'recY', fields: { Name: 'Big Retailer', City: 'Oldtown', Country: 'GR' } },
  ];
  const addrMap = new Map([['recY', '54628 oldtown industrial zone']]);
  const stop = { company: 'Big Retailer', city: 'Newname', country: 'GR', postcode: '54628' };
  const ranked = ctx.scanV2RankLocations(stop, locations, 0, addrMap);
  assert.equal(ranked[0].id, 'recY');
  assert.ok(ranked[0].pcHit);
});

test('v2: a country mismatch is only crossed with BOTH a real precedent AND a confirmed bad record (round 3)', () => {
  const ctx = loadEngineWithCountries();
  const locations = [{ id: 'recEU', fields: { Name: 'Foreign Depot', City: 'Prague', Country: 'GR' } }]; // really CZ, mis-filed as GR
  const cands = [{ code: 'L1', id: 'recEU', label: 'Foreign Depot | Prague | GR' }];
  const stop = { company: 'Foreign Depot', city: 'Prague', country: 'CZ', postcode: '', candidate: 'L1' };

  assert.equal(ctx._sv2PickLocation({ ...stop }, cands, locations, null, null).id, null, 'neither signal -> no pick');
  assert.equal(ctx._sv2PickLocation({ ...stop }, cands, locations, new Set(['recEU']), null).id, null, 'history alone -> not enough');
  assert.equal(ctx._sv2PickLocation({ ...stop }, cands, locations, null, new Set(['recEU'])).id, null, 'data-quality flag alone -> not enough');
  const both = ctx._sv2PickLocation({ ...stop }, cands, locations, new Set(['recEU']), new Set(['recEU']));
  assert.equal(both.id, 'recEU');
  assert.equal(both.by, 'history+dq-override');
});

// ─── Task 3: client history plumbing + leakage guard ───────────────────────
test('v2: with no clientHistory snapshot, order history is empty — today\'s production default (round 3)', async () => {
  const fetch = recordingFetch(createMockFetch({ refData, extraction, extractionV2 }));
  const sb = createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'x.y.z', refData, engine: 'v2' });
  const ids = await sb.run("scanV2ClientHistoryLocations('recSynthClient0001')");
  assert.equal(ids.size, 0);
});

test('eval harness: client history excludes the golden doc\'s own saved order and anything created after it (round 3)', async () => {
  const clientHistory = {
    byClient: {
      recSynthClient0001: [
        { id: 'recOwn',   fields: { 'Loading Location 1': ['recSynthLoc000001'], 'Created At': '2026-01-15T00:00:00Z' } },
        { id: 'recOlder', fields: { 'Unloading Location 1': ['recSynthLoc000002'], 'Created At': '2026-01-01T00:00:00Z' } },
        { id: 'recNewer', fields: { 'Loading Location 1': ['recSynthLoc000003'], 'Created At': '2026-02-01T00:00:00Z' } },
      ],
    },
  };
  const fetch = recordingFetch(createMockFetch({ refData, extraction, extractionV2 }));
  const sb = createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'x.y.z', refData, engine: 'v2', clientHistory });

  const all = await sb.run("scanV2ClientHistoryLocations('recSynthClient0001')");
  assert.deepEqual([...all].sort(), ['recSynthLoc000001', 'recSynthLoc000002', 'recSynthLoc000003']);

  // Scoring "recOwn"'s own document: exclude it and anything saved at/after it.
  const r = await sb.scanFile(new File([makeDoc('Synthetic filler text for a Word 97 document, long enough to pass the content-length gate.')], 'a.doc', { type: browserMimeType('x.doc') }),
    { excludeOrderId: 'recOwn', excludeCreatedAtOrAfter: '2026-01-15T00:00:00Z' });
  assert.equal(r.status, 'ok', r.error);
  // The cache is keyed by client id only (see scanV2ResetPerScanCaches's
  // comment) — a fresh lookup after the excludes were set must be a cache
  // MISS, not the "all" answer captured above.
  sb.run('typeof scanV2ResetPerScanCaches === "function" && scanV2ResetPerScanCaches()');
  const filtered = await sb.run("scanV2ClientHistoryLocations('recSynthClient0001')");
  assert.deepEqual([...filtered], ['recSynthLoc000002'], 'own order and the later one are both gone; only the strictly-older one remains');
});

test('eval harness: two golden docs sharing a client never leak each other\'s exclude through the cache (round 3)', async () => {
  const clientHistory = {
    byClient: {
      recSynthClient0001: [
        { id: 'recDocA', fields: { 'Loading Location 1': ['recSynthLoc000001'], 'Created At': '2026-01-01T00:00:00Z' } },
        { id: 'recDocB', fields: { 'Loading Location 1': ['recSynthLoc000002'], 'Created At': '2026-01-02T00:00:00Z' } },
      ],
    },
  };
  const fetch = recordingFetch(createMockFetch({ refData, extraction, extractionV2 }));
  const sb = createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'x.y.z', refData, engine: 'v2', clientHistory });
  const file = () => new File([makeDoc('Synthetic filler text for a Word 97 document, long enough to pass the content-length gate.')], 'a.doc', { type: browserMimeType('x.doc') });

  // Score doc A (exclude recDocA) — must NOT be reused for doc B below without
  // a reset, which run-current.mjs always does between documents.
  await sb.scanFile(file(), { excludeOrderId: 'recDocA' });
  sb.run('typeof scanV2ResetPerScanCaches === "function" && scanV2ResetPerScanCaches()');
  await sb.scanFile(file(), { excludeOrderId: 'recDocB' });
  sb.run('typeof scanV2ResetPerScanCaches === "function" && scanV2ResetPerScanCaches()');
  const historyForB = await sb.run("scanV2ClientHistoryLocations('recSynthClient0001')");
  assert.deepEqual([...historyForB], ['recSynthLoc000001'], 'recDocB excluded, recDocA (not this doc\'s own record) correctly still counts as history');
});
