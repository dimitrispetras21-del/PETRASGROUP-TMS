// Round 4 (docs/scan/04 follow-up): pallet-type default, abbreviation/
// compound-word name matching, and the two prompt-guidance additions (later
// date on an "X or Y" pair, supplier code as reference). Only INVENTED data —
// no real client, location or document (same rule as engine-v2.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createScannerSandbox, browserMimeType } from '../lib/app-sandbox.mjs';
import { createMockFetch } from '../lib/mock-fetch.mjs';
import { recordingFetch } from '../run-current.mjs';
import { makePdf } from './synthetic-docs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const FIX = path.join(HERE, '..', 'fixtures');
const refData = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-ref.json'), 'utf8'));
const extraction = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-extraction.json'), 'utf8'));
const extractionV2 = JSON.parse(fs.readFileSync(path.join(FIX, 'synthetic-extraction-v2.json'), 'utf8'));

function loadEngineOnly() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(REPO, 'core/scan-engine-v2.js'), 'utf8'), ctx, { filename: 'core/scan-engine-v2.js' });
  return ctx;
}

// ─── Prompt guidance (locks the wording so a future edit can't silently drop it) ───
// SCAN_V2_SYSTEM is declared `const`, so it never becomes a property of the
// vm context's global object (only `var`/function declarations do, which is
// why every other helper here is read as ctx.<name>) — read it by evaluating
// an expression in the context instead.
function systemPrompt(ctx) {
  return vm.runInContext('SCAN_V2_SYSTEM', ctx);
}

test('v2 prompt: a supplier code at a specific stop is told to outrank the top document number (round 4)', () => {
  const ctx = loadEngineOnly();
  assert.match(systemPrompt(ctx), /separate "code".*prefer THAT over a generic order/);
});

// ─── Ambiguous "day X or day Y" dates: warn + low confidence, don't gamble ─
// (round 4: an earlier attempt made the prompt always pick the LATER day —
// reverted after a live run showed it flips as many correct dates wrong as
// it fixes; see the comment above `ambiguousDateInDoc` in scan-engine-v2.js.)
test('v2: a document offering two candidate dates keeps the model\'s date but warns and caps confidence (round 4)', async () => {
  const fetch = recordingFetch(createMockFetch({ refData, extraction, extractionV2 }));
  const sb = createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'x.y.z', refData, engine: 'v2' });
  const lines = ['Sample Shipper Ltd', 'Transport order FB-0012',
    'Loading: Alpha Cold Store, Testdorf, DE, Thursday 10 or Friday 11/01/2031',
    'Delivery: Gamma Warehouse, Samplepolis, GR, 13.01.2031', '20 EUR pallets frozen peas'];
  const r = await sb.scanFile(new File([makePdf(lines)], 'fb5.pdf', { type: browserMimeType('x.pdf') }));
  assert.equal(r.status, 'ok', r.error);
  assert.match(r.parsed.notes, /δύο πιθανές ημερομηνίες/);
  assert.ok(r.parsed.field_confidence.dates <= 0.4, `dates confidence should be capped, got ${r.parsed.field_confidence.dates}`);
});

test('v2: an ordinary single-date document gets no ambiguous-date warning or cap (round 4)', async () => {
  const fetch = recordingFetch(createMockFetch({ refData, extraction, extractionV2 }));
  const sb = createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'x.y.z', refData, engine: 'v2' });
  const lines = ['Sample Shipper Ltd', 'Transport order FB-0013', 'Loading: Alpha Cold Store, Testdorf, DE, 10.01.2031',
    'Delivery: Gamma Warehouse, Samplepolis, GR, 13.01.2031', '20 EUR pallets frozen peas'];
  const r = await sb.scanFile(new File([makePdf(lines)], 'fb6.pdf', { type: browserMimeType('x.pdf') }));
  assert.equal(r.status, 'ok', r.error);
  assert.doesNotMatch(r.parsed.notes || '', /δύο πιθανές ημερομηνίες/);
});

// ─── Pallet-type default (round 4) ─────────────────────────────────────────
test('v2: pallet type defaults to EUR, low confidence, always warned, when the document never states one', async () => {
  const extractionV2NoType = structuredClone(extractionV2);
  extractionV2NoType.orders[0].pallet_type = { v: '', c: 0, q: '' };   // model correctly found nothing
  const fetch = recordingFetch(createMockFetch({ refData, extraction, extractionV2: extractionV2NoType }));
  const sb = createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'x.y.z', refData, engine: 'v2' });
  const lines = ['Sample Shipper Ltd', 'Transport order FB-0009', 'Loading: Alpha Cold Store, Testdorf, DE, 10.01.2031',
    'Delivery: Gamma Warehouse, Samplepolis, GR, 13.01.2031', '20 pallets frozen peas'];
  const r = await sb.scanFile(new File([makePdf(lines)], 'fb2.pdf', { type: browserMimeType('x.pdf') }));
  assert.equal(r.status, 'ok', r.error);
  assert.equal(r.parsed.pallet_type, 'EUR');
  assert.ok(r.parsed.field_confidence.pallet_type < 0.6, 'stays below the "must check" line');
  assert.match(r.parsed.notes, /Τύπος παλέτας δεν αναφέρεται.*EUR/);
});

test('v2: pallet type is NOT overridden when the model actually reads a different one (round 4)', async () => {
  const extractionV2Industrial = structuredClone(extractionV2);
  extractionV2Industrial.orders[0].pallet_type = { v: 'Industrial', c: 0.9, q: 'Industrial pallets' };
  const fetch = recordingFetch(createMockFetch({ refData, extraction, extractionV2: extractionV2Industrial }));
  const sb = createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'x.y.z', refData, engine: 'v2' });
  const lines = ['Sample Shipper Ltd', 'Transport order FB-0010', 'Loading: Alpha Cold Store, Testdorf, DE, 10.01.2031',
    'Delivery: Gamma Warehouse, Samplepolis, GR, 13.01.2031', '20 Industrial pallets'];
  const r = await sb.scanFile(new File([makePdf(lines)], 'fb3.pdf', { type: browserMimeType('x.pdf') }));
  assert.equal(r.status, 'ok', r.error);
  assert.equal(r.parsed.pallet_type, 'Industrial');
  assert.doesNotMatch(r.parsed.notes || '', /υποτέθηκε EUR/);
});

test('v2: no pallet-type default when there are no pallets at all (nothing to default for)', async () => {
  const extractionV2Empty = structuredClone(extractionV2);
  extractionV2Empty.orders[0].pallet_type = { v: '', c: 0, q: '' };
  extractionV2Empty.orders[0].pallets = { v: '', c: 0, q: '' };
  extractionV2Empty.orders[0].stops.forEach(s => { s.pallets = ''; });
  const fetch = recordingFetch(createMockFetch({ refData, extraction, extractionV2: extractionV2Empty }));
  const sb = createScannerSandbox({ repoRoot: REPO, fetch, jwt: 'x.y.z', refData, engine: 'v2' });
  const lines = ['Sample Shipper Ltd', 'Transport order FB-0011', 'Loading: Alpha Cold Store, Testdorf, DE, 10.01.2031',
    'Delivery: Gamma Warehouse, Samplepolis, GR, 13.01.2031'];
  const r = await sb.scanFile(new File([makePdf(lines)], 'fb4.pdf', { type: browserMimeType('x.pdf') }));
  assert.equal(r.status, 'ok', r.error);
  assert.equal(r.parsed.pallet_type, null);
});

// ─── Name matching: abbreviation / compound-word identity (round 4) ───────
test('v2: an initialism record ("BRD") matches a document that spells the name out in full (round 4)', () => {
  const ctx = loadEngineOnly();
  const locations = [
    // Same abbreviation-vs-duplicate shape as the real case this fixes
    // (docs/scan/04): the WRONG record shares an unrelated common word with
    // the document ("cheese"/"cheddar" both contain no real overlap here,
    // kept deliberately unrelated) and must lose to the right one.
    { id: 'recAbbrev', fields: { Name: 'BRD ABC', City: 'Testdorf', Country: 'DE' } },
    { id: 'recUnrelated', fields: { Name: 'Best Cheese Traders', City: 'Testdorf', Country: 'DE' } },
  ];
  const stop = { company: 'Blue Ridge Dairy', city: 'Testdorf', country: 'DE', postcode: '' };
  const pick = ctx._sv2PickLocation(stop, [], locations, new Set());
  assert.equal(pick.id, 'recAbbrev');
});

test('v2: a compound-word record name ("Coldline") matches a document that spells it as two words (round 4)', () => {
  const ctx = loadEngineOnly();
  const locations = [
    { id: 'recCompound', fields: { Name: 'Coldline Traders', City: 'Testdorf', Country: 'DE' } },
    { id: 'recUnrelated', fields: { Name: 'Other Foods Group', City: 'Testdorf', Country: 'DE' } },
  ];
  const stop = { company: 'Cold Line', city: 'Testdorf', country: 'DE', postcode: '' };
  const pick = ctx._sv2PickLocation(stop, [], locations, new Set());
  assert.equal(pick.id, 'recCompound');
});

test('v2: the client picker gets the same abbreviation-identity boost (round 4)', () => {
  const ctx = loadEngineOnly();
  const clients = [
    { id: 'recClientAbbrev', fields: { 'Company Name': 'BRD Trading' } },
    { id: 'recClientUnrelated', fields: { 'Company Name': 'Continental Cheese Traders' } },
  ];
  const order = { client_name: { v: 'Blue Ridge Dairy', c: 0.9, q: 'Blue Ridge Dairy' }, client_candidate: '' };
  const pick = ctx._sv2PickClient(order, [], clients);
  assert.equal(pick.id, 'recClientAbbrev');
});

// Review of round 4 (B1): initials are not an identity. Logistics firms
// routinely go by three letters, so a spelled-out name also "equals" an
// unrelated company whose record IS those three letters.
test('v2: initials-only match vs a record sharing real words → left empty (ambiguous), not the initials company', () => {
  const ctx = loadEngineOnly();
  const locations = [
    { id: 'recTrue', fields: { Name: 'Euro Cold Store Ltd', City: 'Testdorf', Country: 'DE' } },
    { id: 'recInitials', fields: { Name: 'ECS Forwarding', City: 'Testdorf', Country: 'DE' } },
  ];
  const pick = ctx._sv2PickLocation({ company: 'European Cold Storage', city: 'Testdorf', country: 'DE', postcode: '' }, [], locations, new Set());
  assert.notEqual(pick.id, 'recInitials');
  if (pick.id === null) assert.equal(pick.by, 'acronym-ambiguous');
});

test('v2: initials-only match with no other plausible record → kept but low (never certain), flagged', () => {
  const ctx = loadEngineOnly();
  const locations = [
    { id: 'recInitials', fields: { Name: 'ECS Forwarding', City: 'Testdorf', Country: 'DE' } },
    { id: 'recOther', fields: { Name: 'Other Foods Group', City: 'Elsewhere', Country: 'DE' } },
  ];
  const pick = ctx._sv2PickLocation({ company: 'European Cold Storage', city: 'Testdorf', country: 'DE', postcode: '' }, [], locations, new Set());
  if (pick.id) {
    assert.ok(pick.score <= 0.45, `initials-only pick must stay below the must-check line (got ${pick.score})`);
    assert.match(pick.by, /acronym/);
  }
});

test('v2: two truly identical name/city duplicates still tie (no false identity match on ordinary names)', () => {
  const ctx = loadEngineOnly();
  const locations = [
    { id: 'recA', fields: { Name: 'Acme Depot', City: 'Testdorf', Country: 'DE' } },
    { id: 'recB', fields: { Name: 'Acme Storage', City: 'Testdorf', Country: 'DE' } },
  ];
  const ranked = ctx.scanV2RankLocations({ company: 'Acme Depot', city: 'Testdorf', country: 'DE', postcode: '' }, locations, 0);
  assert.equal(ranked[0].id, 'recA');
  assert.ok(ranked[0].score > (ranked[1]?.score ?? 0), 'the exact-name record still wins outright, not by the abbreviation shortcut');
});
