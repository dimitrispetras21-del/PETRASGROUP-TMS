#!/usr/bin/env node
// Round 3 (docs/scan/04, task 3 of the scan programme): snapshot each golden
// client's past ORDERS (loading/unloading location ids) and every LOCATIONS
// record's Address, so scanV2ClientHistoryLocations / scanV2LocationAddressMap
// (core/scan-engine-v2.js) can be measured offline with --replay, without a
// live Worker call on every scoring run.
//
// READ-ONLY: two GETs through the same Worker facade the browser uses
// (ORDERS filtered by Client, LOCATIONS Address field). Nothing is written —
// Supabase stays SELECT-only (CLAUDE.md). Output is a snapshot of real order
// and location data, so it stays under .local/ like everything else here.
//
//   node --env-file=.env.local tools/scan-eval/build-client-history.mjs
//
// LEAKAGE: the golden truth (golden.json) was built FROM these clients' saved
// orders (see docs/scan/*-baseline). This script does not filter anything out
// — it snapshots the client's full order history as it exists today. The
// exclusion happens at SCORING time, in app-sandbox.mjs's atGetAll stub: for
// each doc it drops that doc's own `matched[].legacy_id` record and anything
// with a later "Created At" (run-current.mjs's scanExcludeFor). Keeping the
// raw snapshot un-filtered here means the exclusion logic is inspectable and
// testable on its own (test/engine-v2.test.mjs), instead of being baked
// invisibly into how the snapshot was built.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScannerSandbox } from './lib/app-sandbox.mjs';
import { recordingFetch, jwtExpiry } from './run-current.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const APP_ORIGIN = 'https://dimitrispetras21-del.github.io';

function findGoldenDir() {
  if (process.env.SCAN_GOLDEN_DIR) return process.env.SCAN_GOLDEN_DIR;
  let d = REPO;
  for (let i = 0; i < 6; i++) {
    const c = path.join(d, '.local', 'scan-golden');
    if (fs.existsSync(c)) return c;
    d = path.dirname(d);
  }
  return path.join(REPO, '.local', 'scan-golden');
}

async function getAll(fetchFn, consts, jwt, table, filterByFormula, fields) {
  let out = [], offset = '';
  do {
    const qs = ['pageSize=100', ...fields.map(f => 'fields[]=' + encodeURIComponent(f))];
    if (filterByFormula) qs.push('filterByFormula=' + encodeURIComponent(filterByFormula));
    if (offset) qs.push('offset=' + offset);
    const res = await fetchFn(`${consts.PROXY_URL}/v0/${consts.AT_BASE}/${table}?${qs.join('&')}`,
      { headers: { Authorization: 'Bearer ' + jwt } });
    const body = await res.json();
    if (!res.ok || body.error) throw new Error(`${table}: HTTP ${res.status} ${body.error?.message || ''}`);
    out = out.concat(body.records || []);
    offset = body.offset || '';
  } while (offset);
  return out;
}

async function main() {
  const jwt = process.env.TMS_JWT;
  if (!jwt) throw new Error('TMS_JWT is not set — node --env-file=.env.local tools/scan-eval/build-client-history.mjs');
  const exp = jwtExpiry(jwt);
  if (exp && exp < new Date()) throw new Error(`TMS_JWT expired at ${exp.toISOString()} — log in again`);

  const goldenDir = findGoldenDir();
  const golden = JSON.parse(fs.readFileSync(path.join(goldenDir, 'golden.json'), 'utf8'));
  const clientIds = new Set();
  for (const d of golden.docs) for (const o of d.orders || []) {
    const c = o.client_id;
    if (c) { if (c.v) clientIds.add(c.v); for (const id of c.any_of || []) clientIds.add(id); }
  }
  console.log(`${clientIds.size} distinct client(s) in the golden set`);

  const fetchFn = recordingFetch(globalThis.fetch);
  const sandbox = createScannerSandbox({ repoRoot: REPO, fetch: fetchFn, jwt, refData: { clients: [], locations: [] } });
  const consts = sandbox.constants();
  const F = consts.F;
  const orderFields = [F.CLIENT, F.LOADING_LOC1, F.LOADING_LOC2, F.LOADING_LOC3,
    F.UNLOADING_LOC1, F.UNLOADING_LOC2, F.UNLOADING_LOC3, 'Created At', 'Reference'];

  const byClient = {};
  for (const clientId of clientIds) {
    const filter = `FIND("${clientId}",ARRAYJOIN({${F.CLIENT}},","))>0`;
    const recs = await getAll(fetchFn, consts, jwt, consts.TABLES.ORDERS, filter, orderFields);
    byClient[clientId] = recs.map(r => ({ id: r.id, fields: r.fields }));
    console.log(`  client ${clientId}: ${recs.length} past order(s)`);
  }

  console.log('fetching LOCATIONS Address field...');
  const locRecs = await getAll(fetchFn, consts, jwt, consts.TABLES.LOCATIONS, '', ['Address']);
  const address = {};
  for (const r of locRecs) if (r.fields?.Address) address[r.id] = r.fields.Address;
  console.log(`  ${Object.keys(address).length}/${locRecs.length} location(s) have an Address`);

  const outPath = path.join(goldenDir, 'client-history.json');
  if (!path.resolve(outPath).split(path.sep).includes('.local')) throw new Error('refusing to write outside .local/');
  fs.writeFileSync(outPath, JSON.stringify({ built_at: new Date().toISOString(), byClient, address }, null, 2));
  console.log(`wrote ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error('build-client-history:', e.message); process.exit(1); });
