// 050 in a real Postgres (PGlite): read-only is a PRIVILEGE. Every forbidden action is attempted and must be
// refused by the database itself — not by a prompt. Also runs the 050 verification SELECTs (no writes).
import { test } from 'node:test';
import assert from 'node:assert';
import { freshDb, one, all } from './helpers.mjs';

async function as(db, role, sql, params) {
  await db.exec(`SET ROLE ${role}`);
  try { return { ok: true, rows: (await db.query(sql, params)).rows }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec('RESET ROLE'); }
}

test('tms_reader: SELECT on the list works; every write and every forbidden read is refused', async () => {
  const db = await freshDb();
  await db.query("INSERT INTO users (username, password_hash, role) VALUES ('synthetic','x','owner')");
  assert.ok((await as(db, 'tms_reader', 'SELECT count(*) FROM orders')).ok);
  assert.ok((await as(db, 'tms_reader', 'SELECT id, created_at, role, action, table_name, record_id FROM audit_log')).ok);
  for (const sql of ["INSERT INTO orders (legacy_id) VALUES ('recX')", "UPDATE orders SET price = 1", 'DELETE FROM audit_log',
                     'SELECT * FROM users', 'SELECT before_data FROM audit_log', 'SELECT actor FROM audit_log',
                     "INSERT INTO monitoring.incidents (incident_key, check_id, severity) VALUES ('x','x','P1')",
                     "UPDATE monitoring.checks SET sql_text = 'SELECT 1'", "SELECT monitoring.run_checks('fast')",
                     "SELECT monitoring.record_notification(NULL,'test','mock','x','sent','t')",
                     'CREATE TABLE public.evil (x int)', 'GRANT SELECT ON users TO tms_reader', 'ALTER ROLE tms_reader SUPERUSER']) {
    const r = await as(db, 'tms_reader', sql);
    assert.equal(r.ok, false, `tms_reader must NOT be able to: ${sql}`);
  }
});

test('tms_monitor_writer: only the three monitoring functions write — nothing in the TMS', async () => {
  const db = await freshDb();
  assert.ok((await as(db, 'tms_monitor_writer', "SELECT monitoring.beat('routine-p1','t','x')")).ok);
  assert.ok((await as(db, 'tms_monitor_writer', "SELECT monitoring.record_notification(NULL,'test','mock','x','sent','t')")).ok);
  for (const sql of ["INSERT INTO orders (legacy_id) VALUES ('recX')", "UPDATE monitoring.incidents SET state='resolved'",
                     "DELETE FROM monitoring.notifications", "SELECT monitoring.run_checks('fast')",
                     "SELECT monitoring.raise_incident('x','x','P1',1,'x')", "UPDATE monitoring.checks SET enabled=false, disabled_reason='x'"]) {
    const r = await as(db, 'tms_monitor_writer', sql);
    assert.equal(r.ok, false, `writer must NOT be able to: ${sql}`);
  }
  assert.equal((await one(db, "SELECT count(*)::int n FROM monitoring.notifications")).n, 1);
});

test('050 verification SELECTs (as postgres, no writes): 0 writable tables, only the 3 SECURITY DEFINER fns', async () => {
  const db = await freshDb();
  const w = await all(db, `SELECT r.rolname, count(*) FILTER (WHERE has_table_privilege(r.rolname, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE'))::int AS writable
     FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE r.rolname IN ('tms_reader','tms_monitor_writer') AND n.nspname IN ('public','monitoring') AND c.relkind IN ('r','p','v')
    GROUP BY 1 ORDER BY 1`);
  assert.deepEqual(w.map((x) => x.writable), [0, 0]);
  const fns = await all(db, `SELECT r.rolname, n.nspname || '.' || p.proname AS fn
     FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE r.rolname IN ('tms_reader','tms_monitor_writer') AND p.prosecdef
      AND n.nspname NOT IN ('pg_catalog','information_schema') AND has_function_privilege(r.rolname, p.oid, 'EXECUTE') ORDER BY 1, 2`);
  assert.deepEqual(fns, [{ rolname: 'tms_monitor_writer', fn: 'monitoring.beat' }, { rolname: 'tms_monitor_writer', fn: 'monitoring.record_diagnosis' },
                         { rolname: 'tms_monitor_writer', fn: 'monitoring.record_notification' }]);
  const roles = await all(db, "SELECT rolname, rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname LIKE 'tms\\_%' ORDER BY 1");
  assert.ok(roles.length === 2 && roles.every((r) => !r.rolsuper && !r.rolbypassrls && !r.rolcreaterole));
});
