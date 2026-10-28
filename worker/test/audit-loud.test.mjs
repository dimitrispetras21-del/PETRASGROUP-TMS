// An audit row that did not land is said (owner 28/10, Υ2). Measured 28/10: audit_log_action_check refused every
// confirm / reverse / invoice_override / upload row and audit() kept it to console.error, so 140 of 215
// confirmations and every invoicing override have no trace (A41). Now a refused audit row writes one app_errors
// row (the auditor's 24-hour count reads app_errors) and the user's action still answers as before.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { call, json, pgError, on, calls, reset, restore } from './fixtures/f5-harness.mjs';

beforeEach(reset);
afterEach(restore);
const CHECK_REFUSED = { code: '23514', message: 'new row for relation "audit_log" violates check constraint "audit_log_action_check"' };
const appErrors = () => calls.filter((c) => c.method === 'POST' && c.table === 'app_errors');

test('a refused audit row (invoice_override) → one app_errors row naming it; the override still answers 200', async () => {
  on('POST', 'audit_log', () => pgError(400, CHECK_REFUSED));
  on('POST', 'app_errors', (u, body) => json([body], 201));
  const r = await call('owner', 'POST', '/pallets/override', { order_rec: 'recO1', reason: 'paper lost' });
  assert.equal(r.status, 200, r.text);
  assert.equal(appErrors().length, 1);
  const row = appErrors()[0].body;
  assert.match(row.message, /^AUDIT WRITE FAILED: 1 row\(s\), invoice_override orders recO1: .*audit_log_action_check/);
  assert.equal(row.page, 'worker:audit');
  assert.equal(row.actor, 'tester');
});

test('an audit row that lands writes no app_errors row', async () => {
  const r = await call('owner', 'POST', '/pallets/override', { order_rec: 'recO1', reason: 'paper lost' });
  assert.equal(r.status, 200, r.text);
  assert.equal(calls.filter((c) => c.table === 'audit_log').length, 1);
  assert.equal(appErrors().length, 0);
});

test('app_errors also down: the action still answers, nothing thrown', async () => {
  on('POST', 'audit_log', () => pgError(400, CHECK_REFUSED));
  on('POST', 'app_errors', () => pgError(500, { message: 'down' }));
  const r = await call('owner', 'POST', '/pallets/override', { order_rec: 'recO1', reason: 'paper lost' });
  assert.equal(r.status, 200, r.text);
  assert.equal(appErrors().length, 1);
});

test('auditMany (facade create of several rows) refused → one app_errors row with the row count', async () => {
  on('POST', 'audit_log', () => pgError(400, CHECK_REFUSED));
  on('POST', 'app_errors', (u, body) => json([body], 201));
  on('POST', 'clients', (u, body) => json((Array.isArray(body) ? body : [body]).map((b, i) => ({ id: 900 + i, legacy_id: 'recC' + i, ...b })), 201));
  const r = await call('owner', 'POST', '/v0/appTEST/tblFWKAQVUzAM8mCE', { records: [{ fields: { 'Company Name': 'A' } }, { fields: { 'Company Name': 'B' } }] });
  assert.ok(r.status < 300, r.status + ' ' + r.text);
  assert.equal(appErrors().length, 1);
  assert.match(appErrors()[0].body.message, /^AUDIT WRITE FAILED: 2 row\(s\), create clients /);
});
