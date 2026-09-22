#!/usr/bin/env node
// Local runner: the SAME catalog + the SAME monitoring SQL as production, on an in-process Postgres (PGlite)
// with the production column schema, mocked pg_net/Vault and NO network. Nothing here can reach production.
//   node run-checks.mjs                 → run every tag on an empty fixture, print results
//   node run-checks.mjs --scenario b01  → add a synthetic «assigned without round trip» order first
//   node run-checks.mjs --chain         → full local chain (check → incident → fire → p1 → digest), prints the alert
import { createDb } from './lib/db.mjs';
import { memoryTransport, runP1, runDigest } from './routines/sim.mjs';
import { assignedOrder, vault } from './test/helpers.mjs';

const args = new Set(process.argv.slice(2));
const db = await createDb({ roles: true });
if (args.has('--scenario') || args.has('b01') || args.has('--chain')) await assignedOrder(db, { minutesAgo: 20, legacy: 'recTEST0001' });
for (const tag of ['fast', 'half', 'hourly', 'daily', 'weekly']) await db.query('SELECT monitoring.run_checks($1)', [tag]);
const res = (await db.query(`SELECT r.check_id, k.severity, r.status, r.value, r.ms, left(coalesce(r.err,''),60) AS err
                               FROM monitoring.results r JOIN monitoring.checks k ON k.id = r.check_id ORDER BY r.status DESC, r.check_id`)).rows;
console.table(res.filter((r) => r.status !== 'green'));
const sum = res.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
console.log('results:', sum, '· incidents:', (await db.query('SELECT incident_key, severity, state FROM monitoring.incidents ORDER BY 1')).rows);
if (args.has('--chain')) {
  await vault(db, { routine_p1_fire_url: 'https://api.anthropic.invalid/v1/claude_code/routines/trig_TEST/fire', routine_p1_fire_token: 'test' });
  await db.query("SELECT monitoring.beat('routine-watchdog','local','alive')");
  console.log('fire_due →', (await db.query('SELECT monitoring.fire_due() AS n')).rows[0].n, 'incident(s); payload:', (await db.query('SELECT body FROM net.mock_requests')).rows.map((r) => r.body));
  const t = memoryTransport(); await runP1(db, t); await runDigest(db, t, { provider: 'mock' });
  console.log('\nPUSH:', t.pushes.join('\n      '), '\n\nEMAIL:', t.emails.map((e) => `[${e.subject}]\n${e.body}`).join('\n\n'));
}
