// The catalog itself: lint, generated files in sync, every enabled check executes on the production-shaped
// schema, and the 050 GRANT list covers every table a check reads (principle 3 / principle 6).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { loadChecks, seedSql, tablesRead } from '../checks/load.mjs';
import { schemaSql } from './fixtures/build-schema.mjs';
import { DRAFTS } from '../lib/db.mjs';
import { freshDb, all } from './helpers.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);

test('every check file lints clean', () => {
  const { checks, errors } = loadChecks();
  assert.deepEqual(errors, []);
  assert.ok(checks.length >= 69, `catalog has ${checks.length} checks`);
  for (const c of checks.filter((x) => !x.enabled)) assert.ok(c.disabled_reason && c.disabled_reason.length > 20, `${c.id}: a disabled check must say why (it is reported as a GAP)`);
});

test('lint rejects writes, TMS functions and multiple statements', async () => {
  const { lintSql } = await import('../checks/load.mjs');
  assert.ok(lintSql("SELECT count(*) FROM orders; DELETE FROM orders", 'x').length > 0);
  assert.ok(lintSql("UPDATE orders SET price=0", 'x').length > 0);
  assert.ok(lintSql("SELECT delete_order_cascade('rec1')", 'x').some((e) => e.includes('not in allowlist')));
  assert.ok(lintSql("SELECT set_config('a','b',false)", 'x').length > 0);
  assert.deepEqual(lintSql("SELECT count(*) FROM orders WHERE status='Deleted; DROP'", 'x'), []);
});

test('committed seed (047b) and fixture schema are regenerated, never hand-edited', () => {
  const { checks } = loadChecks();
  assert.equal(fs.readFileSync(path.join(DRAFTS, '047b_monitoring_seed.sql'), 'utf8'), seedSql(checks), 'run: node checks/build-seed.mjs');
  assert.equal(fs.readFileSync(path.join(HERE, 'fixtures/schema.sql'), 'utf8'), schemaSql(), 'run: node test/fixtures/build-schema.mjs');
});

test('every enabled check executes on the production-shaped schema (0 errors, every run complete)', async () => {
  const db = await freshDb();
  for (const tag of ['fast', 'half', 'hourly', 'daily', 'weekly']) await db.query('SELECT monitoring.run_checks($1)', [tag]);
  const errs = await all(db, "SELECT check_id, err FROM monitoring.results WHERE status='error'");
  assert.deepEqual(errs, []);
  const runs = await all(db, 'SELECT tag, expected_n, ran_n, complete FROM monitoring.runs');
  assert.ok(runs.every((r) => r.complete && r.ran_n === r.expected_n), JSON.stringify(runs));
  const { checks } = loadChecks();
  assert.equal(runs.reduce((s, r) => s + r.expected_n, 0), checks.filter((c) => c.enabled).length);
});

test('050 grants SELECT on every table/view a check or the package builder reads', () => {
  const sql = fs.readFileSync(path.join(DRAFTS, '050_monitor_roles.sql'), 'utf8').replace(/--[^\n]*/g, '');   // grants only, not the verify comments
  const granted = new Set([...sql.matchAll(/public\.([a-z_]+)/g)].map((m) => m[1]));
  const { checks } = loadChecks();
  const needed = new Set();
  for (const c of checks.filter((x) => x.enabled)) for (const s of [c.sql, c.ids_sql || '']) for (const t of tablesRead(s)) {
    if (!t.includes('.') && !t.startsWith('pg_')) needed.add(t);
  }
  const missing = [...needed].filter((t) => !granted.has(t));
  assert.deepEqual(missing, [], 'tables read by checks but not granted to tms_reader');
  assert.ok(!granted.has('users'), 'tms_reader must never be granted users');
});

test('A1: the in-DB function allow-list equals the repo lint allow-list (no drift between the two guards)', async () => {
  const sql = fs.readFileSync(path.join(DRAFTS, '047_monitoring_schema.sql'), 'utf8');
  const m = sql.match(/allowed text\[\] := ARRAY\[([\s\S]*?)\];/);
  const db = new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
  const src = fs.readFileSync(path.join(HERE, '../checks/load.mjs'), 'utf8');
  const js = new Set([...src.matchAll(/(?:ALLOWED_FN|KEYWORDS) = new Set\(\[([\s\S]*?)\]\)/g)].flatMap((b) => [...b[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])));
  assert.deepEqual([...db].sort(), [...js].sort());
});

test('A1: the check runner role can read every table a check reads', () => {
  const sql = fs.readFileSync(path.join(DRAFTS, '047_monitoring_schema.sql'), 'utf8');
  const block = sql.match(/GRANT SELECT ON([\s\S]*?)TO tms_check_runner/)[1];
  const granted = new Set([...block.matchAll(/public\.([a-z_]+)/g)].map((x) => x[1]));
  const { checks } = loadChecks();
  const missing = new Set();
  for (const c of checks.filter((x) => x.enabled)) for (const q of [c.sql, c.ids_sql || '']) for (const t of tablesRead(q))
    if (!t.includes('.') && !t.startsWith('pg_') && !granted.has(t)) missing.add(t);
  assert.deepEqual([...missing], []);
});
