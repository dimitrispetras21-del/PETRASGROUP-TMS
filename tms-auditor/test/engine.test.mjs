// run_checks / incidents semantics on synthetic data: new → same (occurrences) → new entity (worsened) →
// green (resolved) → red again (recurred); errors are results + MECH, never silence; queues never alert.
import { test } from 'node:test';
import assert from 'node:assert';
import { freshDb, onlyChecks, assignedOrder, roundTripFor, one, all } from './helpers.mjs';

test('incident lifecycle for B-01 (new, repeat, new entity, resolved, recurred)', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  const a = await assignedOrder(db, { minutesAgo: 30 });
  await db.query("SELECT monitoring.run_checks('fast')");
  let i = await one(db, "SELECT * FROM monitoring.incidents WHERE incident_key='B-01'");
  assert.equal(i.state, 'new'); assert.equal(Number(i.value), 1); assert.deepEqual(i.entity_ids, [a.legacy_id]);
  await db.query("SELECT monitoring.record_notification($1,'alert','mock','x','sent','t')", [i.id]);   // notified at value 1

  await db.query("SELECT monitoring.run_checks('fast')");
  i = await one(db, "SELECT * FROM monitoring.incidents WHERE incident_key='B-01'");
  assert.equal(i.occurrences, 2); assert.equal(i.worsened_at, null, 'same value, same ids ⇒ not worse');
  assert.equal((await all(db, 'SELECT * FROM monitoring.v_alerts_due')).length, 0, 'already notified ⇒ not due again');

  const b = await assignedOrder(db, { minutesAgo: 20 });
  await db.query("SELECT monitoring.run_checks('fast')");
  i = await one(db, "SELECT * FROM monitoring.incidents WHERE incident_key='B-01'");
  assert.ok(i.worsened_at, 'a NEW broken order under the open incident ⇒ worsened');
  assert.deepEqual([...i.entity_ids].sort(), [a.legacy_id, b.legacy_id].sort());
  assert.equal((await all(db, 'SELECT * FROM monitoring.v_alerts_due')).length, 1, 'worsened ⇒ due again');

  await roundTripFor(db, a); await roundTripFor(db, b);
  await db.query("SELECT monitoring.run_checks('fast')");
  i = await one(db, "SELECT * FROM monitoring.incidents WHERE incident_key='B-01'");
  assert.equal(i.state, 'resolved'); assert.ok(i.resolved_verified_at, 'closed only by a green run');

  await assignedOrder(db, { minutesAgo: 16 });
  await db.query("SELECT monitoring.run_checks('fast')");
  const open = await one(db, "SELECT * FROM monitoring.incidents WHERE incident_key='B-01' AND state IN ('new','recurred')");
  assert.equal(open.state, 'recurred');
});

test('tolerance: an assignment younger than 15′ is not red yet', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  await assignedOrder(db, { minutesAgo: 5 });
  await db.query("SELECT monitoring.run_checks('fast')");
  assert.equal((await one(db, "SELECT status FROM monitoring.results WHERE check_id='B-01'")).status, 'green');
});

test('a broken check is an error result + MECH incident + incomplete run — never green', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01', 'B-26']);
  await db.query("UPDATE monitoring.checks SET sql_text='SELECT count(*) FROM no_such_table' WHERE id='B-26'");
  await db.query("SELECT monitoring.run_checks('fast')");
  const r = await one(db, "SELECT status, err FROM monitoring.results WHERE check_id='B-26'");
  assert.equal(r.status, 'error'); assert.match(r.err, /no_such_table/);
  assert.equal((await one(db, "SELECT state FROM monitoring.incidents WHERE incident_key='MECH:check:B-26'")).state, 'new');
  const run = await one(db, "SELECT complete, ran_n, error_n FROM monitoring.runs WHERE tag='fast'");
  assert.deepEqual([run.complete, run.ran_n, run.error_n], [false, 1, 1]);
  assert.ok((await all(db, 'SELECT * FROM monitoring.v_alerts_due')).some((d) => d.incident_key === 'MECH:check:B-26'), 'MECH is pushed');
  const h = await all(db, 'SELECT problem FROM monitoring.v_health');
  assert.ok(h.some((x) => x.problem === 'incident:MECH:check:B-26'));
});

test('NULL result is an error (absence is not green)', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  await db.query("UPDATE monitoring.checks SET sql_text='SELECT NULL::numeric' WHERE id='B-01'");
  await db.query("SELECT monitoring.run_checks('fast')");
  assert.equal((await one(db, "SELECT status FROM monitoring.results WHERE check_id='B-01'")).status, 'error');
});

test('queues never alert; baseline is not a finding; decrease compares with the previous run', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-13', 'B-11', 'B-29a']);
  await db.query("INSERT INTO orders (legacy_id, status, price, delivery_datetime) VALUES ('recQ1','Delivered',0,current_date-10)");
  await db.query("INSERT INTO orders (legacy_id, invoiced, invoice_number, price) VALUES ('recI1',true,'',100),('recI2',true,NULL,100)");
  await db.query("INSERT INTO groupage_lines (legacy_id) VALUES ('recG1'),('recG2')");
  await db.query("SELECT monitoring.run_checks('daily')");
  await db.query("SELECT monitoring.run_checks('hourly')");
  const st = Object.fromEntries((await all(db, 'SELECT check_id, status FROM monitoring.results')).map((r) => [r.check_id, r.status]));
  assert.deepEqual(st, { 'B-13': 'queue', 'B-11': 'green', 'B-29a': 'green' });
  await db.query("INSERT INTO orders (legacy_id, invoiced, invoice_number, price) VALUES ('recI3',true,'',100)");   // a THIRD one
  await db.query("DELETE FROM groupage_lines WHERE legacy_id='recG2'");                                           // never allowed
  await db.query("SELECT monitoring.run_checks('daily')"); await db.query("SELECT monitoring.run_checks('hourly')");
  const inc = (await all(db, "SELECT incident_key FROM monitoring.incidents ORDER BY 1")).map((r) => r.incident_key);
  assert.deepEqual(inc, ['B-11', 'B-29a']);
});

test('storm control and render_alert (≤ 8 lines, what/extent/impact/evidence/confidence/next)', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  const a = await assignedOrder(db, { minutesAgo: 30 });
  await db.query("SELECT monitoring.run_checks('fast')");
  const { body } = await one(db, 'SELECT body FROM monitoring.v_alerts_due');
  const lines = body.split('\n');
  assert.ok(lines.length <= 8, body);
  for (const k of ['🔴 P1', 'Έκταση:', 'Επίπτωση:', 'Αποδεικτικά:', 'Βεβαιότητα:', 'Επόμενο:', 'Διάγνωση: εκκρεμεί']) assert.ok(body.includes(k), `missing ${k}`);
  assert.ok(body.includes(a.legacy_id), 'the affected id is in the alert');
});
