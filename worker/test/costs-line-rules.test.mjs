import { test } from 'node:test';
import assert from 'node:assert';
import { validateLineBody, CT_PAY_SOURCES } from '../src/costs-line-rules.mjs';

// Migration 035 (owner 16/9): 'CREDIT' is a fourth payment method. The list is
// also what GET /costs/lookups returns as pay_sources — the screen offers only
// these, so this test pins both what is accepted and what is offered.
test('pay_source: DKV/CASH/REVOLUT/CREDIT accepted, anything else names the field', () => {
  assert.deepStrictEqual(CT_PAY_SOURCES, ['DKV', 'CASH', 'REVOLUT', 'CREDIT']);
  for (const src of CT_PAY_SOURCES) {
    assert.strictEqual(validateLineBody({ category: 'spedition', pay_source: src }).ok, true, src + ' accepted');
  }
  const bad = validateLineBody({ category: 'spedition', pay_source: 'BANK' });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.status, 400);
  assert.match(bad.error, /pay_source must be one of DKV\|CASH\|REVOLUT\|CREDIT/);
});

test('pay_source: omitted or null is still allowed (old manual lines carry none)', () => {
  assert.strictEqual(validateLineBody({ category: 'other' }).ok, true);
  assert.strictEqual(validateLineBody({ category: 'other', pay_source: null }).ok, true);
});

test('tolls still require an ISO-2 toll_country regardless of pay_source', () => {
  const r = validateLineBody({ category: 'tolls', pay_source: 'CREDIT' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /toll_country required/);
  assert.deepStrictEqual(validateLineBody({ category: 'tolls', pay_source: 'CREDIT', toll_country: 'de' }), { ok: true, toll_country: 'DE' });
});
