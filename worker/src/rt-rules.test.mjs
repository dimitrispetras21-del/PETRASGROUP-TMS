import { test } from 'node:test';
import assert from 'node:assert';
import { validateRtBody, planRtUpsert, canRemoveLeg } from './rt-rules.mjs';

test('validateRtBody: happy path OWNED with two legs', () => {
  const r = validateRtBody({
    scope: 'INTL', trip_type: 'OWNED', truck_id: 5, date_start: '2026-09-01',
    legs: [{ direction: 'EXPORT', order_id: 100 }, { direction: 'IMPORT', order_id: 101 }]
  });
  assert.deepStrictEqual(r, {
    ok: true,
    row: { scope: 'INTL', trip_type: 'OWNED', truck_id: 5, date_start: '2026-09-01' },
    legs: [{ direction: 'EXPORT', order_id: 100 }, { direction: 'IMPORT', order_id: 101 }]
  });
});

test('validateRtBody: happy path PARTNER, no legs, with date_end', () => {
  const r = validateRtBody({ scope: 'NATL', trip_type: 'PARTNER', partner_id: 9, date_start: '2026-09-01', date_end: '2026-09-03' });
  assert.deepStrictEqual(r, {
    ok: true,
    row: { scope: 'NATL', trip_type: 'PARTNER', partner_id: 9, date_start: '2026-09-01', date_end: '2026-09-03' },
    legs: []
  });
});

test('validateRtBody: scope/trip_type/date_start required, named', () => {
  assert.match(validateRtBody({}).error, /scope/);
  assert.match(validateRtBody({ scope: 'INTL' }).error, /trip_type/);
  assert.match(validateRtBody({ scope: 'INTL', trip_type: 'OWNED', truck_id: 1 }).error, /date_start/);
  assert.strictEqual(validateRtBody({}).status, 400);
});

test('validateRtBody: OWNED needs truck_id, PARTNER needs partner_id', () => {
  assert.match(validateRtBody({ scope: 'INTL', trip_type: 'OWNED', date_start: '2026-09-01' }).error, /truck_id/);
  assert.match(validateRtBody({ scope: 'INTL', trip_type: 'PARTNER', date_start: '2026-09-01' }).error, /partner_id/);
  // wrong type doesn't sneak past
  assert.match(validateRtBody({ scope: 'INTL', trip_type: 'OWNED', truck_id: 'abc', date_start: '2026-09-01' }).error, /truck_id/);
});

test('validateRtBody: unknown scope/trip_type rejected', () => {
  assert.match(validateRtBody({ scope: 'DOMESTIC', trip_type: 'OWNED', truck_id: 1, date_start: '2026-09-01' }).error, /scope/);
  assert.match(validateRtBody({ scope: 'INTL', trip_type: 'LEASED', truck_id: 1, date_start: '2026-09-01' }).error, /trip_type/);
});

test('validateRtBody: date_end format and ordering', () => {
  const base = { scope: 'INTL', trip_type: 'OWNED', truck_id: 1, date_start: '2026-09-10' };
  assert.match(validateRtBody({ ...base, date_end: '10/09/2026' }).error, /date_end/);
  assert.match(validateRtBody({ ...base, date_end: '2026-09-05' }).error, /date_end/);
  assert.deepStrictEqual(validateRtBody({ ...base, date_end: null }).ok, true);
});

test('validateRtBody: legs max 20, rejected not silently truncated', () => {
  const legs = Array.from({ length: 21 }, (_, i) => ({ direction: 'EXPORT', order_id: i }));
  const r = validateRtBody({ scope: 'INTL', trip_type: 'OWNED', truck_id: 1, date_start: '2026-09-01', legs });
  assert.match(r.error, /legs: max 20/);
});

test('validateRtBody: leg direction and exactly-one-of invariant', () => {
  const base = { scope: 'INTL', trip_type: 'OWNED', truck_id: 1, date_start: '2026-09-01' };
  assert.match(validateRtBody({ ...base, legs: [{ direction: 'NORTH', order_id: 1 }] }).error, /direction/);
  assert.match(validateRtBody({ ...base, legs: [{ direction: 'EXPORT' }] }).error, /exactly one of/);
  assert.match(validateRtBody({ ...base, legs: [{ direction: 'EXPORT', order_id: 1, nat_load_id: 2 }] }).error, /exactly one of/);
  assert.match(validateRtBody({ ...base, legs: [{ direction: 'EXPORT', order_id: 'x' }] }).error, /order_id/);
  assert.match(validateRtBody({ ...base, legs: [{ direction: 'ANODOS', nat_load_id: 'x' }] }).error, /nat_load_id/);
});

test('validateRtBody: unknown fields on the row are simply not carried (facade pick, not a reject)', () => {
  // rt row fields are picked like ctPick — unlike ledger-rules, an unrelated
  // key is not itself an error here (kept identical to today's index.js POST
  // /costs/rt behaviour, which uses the same pick-and-ignore shape).
  const r = validateRtBody({ scope: 'INTL', trip_type: 'OWNED', truck_id: 1, date_start: '2026-09-01', bogus: 'x' });
  assert.strictEqual(r.row.bogus, undefined);
});

test('planRtUpsert: no existing legs -> create', () => {
  assert.deepStrictEqual(planRtUpsert({ legs: [{ direction: 'EXPORT', order_id: 1 }], existing: [] }), { action: 'create' });
});

test('planRtUpsert: all existing legs on one RT -> attach with only the missing ones', () => {
  const legs = [{ direction: 'EXPORT', order_id: 100 }, { direction: 'IMPORT', order_id: 101 }];
  const existing = [{ order_id: 100, nat_load_id: null, rt_id: 7 }];
  assert.deepStrictEqual(planRtUpsert({ legs, existing }),
    { action: 'attach', rt_id: 7, legsToAdd: [{ direction: 'IMPORT', order_id: 101 }] });
});

test('planRtUpsert: idempotent — same legs sent twice -> attach with legsToAdd empty', () => {
  const legs = [{ direction: 'EXPORT', order_id: 100 }, { direction: 'IMPORT', order_id: 101 }];
  const existing = [{ order_id: 100, nat_load_id: null, rt_id: 7 }, { order_id: 101, nat_load_id: null, rt_id: 7 }];
  assert.deepStrictEqual(planRtUpsert({ legs, existing }), { action: 'attach', rt_id: 7, legsToAdd: [] });
});

test('planRtUpsert: existing legs split across two RTs -> conflict, named', () => {
  const legs = [{ direction: 'EXPORT', order_id: 100 }, { direction: 'IMPORT', order_id: 101 }];
  const existing = [{ order_id: 100, nat_load_id: null, rt_id: 7 }, { order_id: 101, nat_load_id: null, rt_id: 8 }];
  const r = planRtUpsert({ legs, existing });
  assert.strictEqual(r.action, 'conflict');
  assert.strictEqual(r.status, 409);
  assert.match(r.error, /different round trips/);
});

test('planRtUpsert: matches by nat_load_id too', () => {
  const legs = [{ direction: 'ANODOS', nat_load_id: 55 }];
  const existing = [{ order_id: null, nat_load_id: 55, rt_id: 3 }];
  assert.deepStrictEqual(planRtUpsert({ legs, existing }), { action: 'attach', rt_id: 3, legsToAdd: [] });
});

test('canRemoveLeg: ok for planned/in_progress', () => {
  assert.deepStrictEqual(canRemoveLeg({ status: 'planned' }), { ok: true });
  assert.deepStrictEqual(canRemoveLeg({ status: 'in_progress' }), { ok: true });
});

test('canRemoveLeg: rejects closed/complete/cancelled, named with the status', () => {
  for (const status of ['closed', 'complete', 'cancelled']) {
    const r = canRemoveLeg({ status });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 409);
    assert.match(r.error, new RegExp(status));
  }
});
