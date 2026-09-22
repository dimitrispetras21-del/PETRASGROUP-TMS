// 048 wake-up path with pg_net mocked: the DB fires the routine's /fire endpoint with ids only; the same due
// set is not re-fired inside 30′; a non-2xx answer becomes a MECH incident; missing secrets are said loudly.
import { test } from 'node:test';
import assert from 'node:assert';
import { freshDb, onlyChecks, assignedOrder, vault, one, all } from './helpers.mjs';

const FIRE = 'https://api.anthropic.invalid/v1/claude_code/routines/trig_TEST/fire';

test('fire_due posts ids only, with the beta headers; not twice for the same set', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  await vault(db, { routine_p1_fire_url: FIRE, routine_p1_fire_token: 'test-token' });
  const a = await assignedOrder(db, { minutesAgo: 30 });
  await db.query("SELECT monitoring.run_checks('fast')");
  assert.equal((await one(db, 'SELECT monitoring.fire_due() AS n')).n, 1);
  const req = await one(db, 'SELECT method, url, headers, body FROM net.mock_requests');
  assert.equal(req.url, FIRE);
  assert.equal(req.headers['anthropic-beta'], 'experimental-cc-routine-2026-04-01');
  assert.match(req.body.text, /^tms-auditor due incidents: \d+$/);
  assert.ok(!JSON.stringify(req.body).includes(a.legacy_id), 'no record ids/data in the fire payload — the routine reads them itself');
  assert.equal((await one(db, 'SELECT monitoring.fire_due() AS n')).n, 0, 'same due set within 30′ ⇒ no second wake-up');
});

test('non-2xx from /fire ⇒ MECH:fire incident (the wake-up failed; the hourly net still runs)', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  await vault(db, { routine_p1_fire_url: FIRE, routine_p1_fire_token: 'bad' });
  await db.query('INSERT INTO net.mock_status VALUES ($1, 401)', [FIRE]);
  await assignedOrder(db, { minutesAgo: 30 });
  await db.query("SELECT monitoring.run_checks('fast')"); await db.query('SELECT monitoring.fire_due()');
  await db.query("UPDATE monitoring.fires SET fired_at = fired_at - interval '2 minutes'");     // pg_net answers async
  assert.equal((await one(db, 'SELECT monitoring.fire_verify() AS n')).n, 1);
  assert.equal((await one(db, "SELECT value::int v FROM monitoring.incidents WHERE incident_key='MECH:fire:routine-p1'")).v, 401);
});

test('no secrets configured ⇒ MECH:fire-not-configured, never a silent no-op', async () => {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  await assignedOrder(db, { minutesAgo: 30 });
  await db.query("SELECT monitoring.run_checks('fast')"); await db.query('SELECT monitoring.fire_due()');
  assert.ok(await one(db, "SELECT 1 FROM monitoring.incidents WHERE incident_key='MECH:fire-not-configured'"));
  assert.equal((await all(db, 'SELECT * FROM net.mock_requests')).length, 0);
});
