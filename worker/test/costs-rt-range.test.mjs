// F5 E18 (spec §5; plan W5, the additive half of 28/10) — GET /costs/rt, against the real Worker in Node:
//   - up to 999 trips, asked as 1000 (one probe row: PostgREST's db-max-rows is 1000, measured 4/10), and the answer
//     SAYS when it was cut: `truncated: true` with exactly 999 records, the newest; false otherwise, on every path;
//   - from/to stay optional in deploy 1 (seven callers in four streams; their own PR after day L): without them the
//     answer is as before, never a 400;
//   - the per-trip lookups (route, end of a v5 cycle, payroll line) read 200 RT ids per request, so 999 trips never
//     build a ~6 KB URL, and every trip still gets its route / ledger_entry.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { call, json, on, calls, reset, restore } from './fixtures/f5-harness.mjs';

beforeEach(reset);
afterEach(restore);
const trips = (n) => Array.from({ length: n }, (_, i) => ({ id: n - i, code: `RT-${n - i}`, model: 1, date_start: '2026-10-01', ct_rt_legs: [] }));
const idsOf = (params) => params.get('rt_id').slice(4, -1).split(',').map(Number);
function stubLookups() {
  on('GET', 'dl_v_rt_route', (u) => json(idsOf(u.searchParams).map((id) => ({ rt_id: id, route_text: `R${id}`, route_legs: [] }))));
  on('GET', 'dl_entries', (u) => json(idsOf(u.searchParams).map((id) => ({ id: id * 10, rt_id: id, expenses: 1 }))));
  on('GET', 'v_rt_cycle', (u) => json(idsOf(u.searchParams).map((id) => ({ rt_id: id, ended: false }))));
}

test('1000 rows back (the probe row arrived): truncated true, the 999 newest, every lookup ≤ 200 ids and complete', async () => {
  on('GET', 'ct_round_trips', () => json(trips(1000)));
  stubLookups();
  const r = await call('owner', 'GET', '/costs/rt');
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.equal(r.json.truncated, true);
  assert.equal(r.json.records.length, 999);
  assert.equal(r.json.records[0].id, 1000, 'newest first (date_start.desc): the oldest one is cut');
  assert.equal(calls.find((c) => c.table === 'ct_round_trips').params.get('limit'), '1000');
  for (const table of ['dl_v_rt_route', 'dl_entries']) {
    const reqs = calls.filter((c) => c.table === table);
    assert.equal(reqs.length, 5, `${table}: 999 ids in 5 requests`);
    for (const c of reqs) assert.ok(idsOf(c.params).length <= 200, table);
  }
  assert.ok(r.json.records.every((x) => x.route_text === `R${x.id}` && x.ledger_entry && x.ledger_entry.id === x.id * 10), 'every trip got its route and payroll line');
});

test('999 rows or fewer: truncated false, nothing cut; the answer without from/to is not a 400 (deploy 1)', async () => {
  for (const n of [999, 3, 0]) {
    reset();
    on('GET', 'ct_round_trips', () => json(trips(n)));
    stubLookups();
    const r = await call('owner', 'GET', '/costs/rt');
    assert.equal(r.status, 200, `${n}: ${r.text.slice(0, 200)}`);
    assert.equal(r.json.truncated, false, String(n));
    assert.equal(r.json.records.length, n);
  }
});

test('overlap=1 asks 1000 too (was 500) and says truncated; order_ids with no trip answers truncated false', async () => {
  on('GET', 'ct_round_trips', () => json(trips(1000)));
  stubLookups();
  let r = await call('owner', 'GET', '/costs/rt?overlap=1&from=2026-10-01&to=2026-10-31');
  assert.equal(r.status, 200);
  assert.equal(calls.find((c) => c.table === 'ct_round_trips').params.get('limit'), '1000');
  assert.equal(r.json.truncated, true);
  assert.equal(r.json.records.length, 999);
  reset();
  on('GET', 'ct_rt_legs', () => json([]));
  r = await call('owner', 'GET', '/costs/rt?order_ids=5');
  assert.deepEqual(r.json, { records: [], truncated: false });
});

test('the v5 end of cycle (E21) still reads per 200 ids: a v5 trip beyond the first 200 gets its ended', async () => {
  const rows = trips(450).map((t, i) => ({ ...t, model: i % 2 ? 2 : 1 }));
  on('GET', 'ct_round_trips', () => json(rows));
  stubLookups();
  const r = await call('owner', 'GET', '/costs/rt');
  assert.equal(r.status, 200);
  const v2 = r.json.records.filter((x) => x.model === 2);
  assert.equal(v2.length, 225);
  assert.ok(v2.every((x) => x.ended === false && !x.ended_unknown), 'every v5 trip read, none «unknown»');
  assert.equal(calls.filter((c) => c.table === 'v_rt_cycle').length, 2, '225 ids in 2 requests');
});
