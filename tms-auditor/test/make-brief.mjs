// Builds the SAME synthetic incident as chain.test.mjs (B-01, two orders assigned without a round trip) and
// writes the investigator brief (prompt + package) to out/brief-B-01.md — the exact text a routine would read.
// Used once to obtain a REAL Claude diagnosis from an isolated session (no builder context) → fixture.
import fs from 'node:fs';
import { freshDb, onlyChecks, assignedOrder, one } from './helpers.mjs';
import { enrich } from '../investigate/package.mjs';
import { brief } from '../investigate/diagnose.mjs';
export async function buildIncident() {
  const db = await freshDb(); await onlyChecks(db, ['B-01']);
  const a = await assignedOrder(db, { minutesAgo: 25, legacy: 'recTEST0001' });
  await db.query('SELECT monitoring.run_checks($1)', ['fast']);
  const b = await assignedOrder(db, { minutesAgo: 18, legacy: 'recTEST0002' });
  await db.query('SELECT monitoring.run_checks($1)', ['fast']);
  const inc = await one(db, "SELECT id FROM monitoring.incidents WHERE incident_key='B-01'");
  const { pkg } = await one(db, 'SELECT monitoring.build_package($1) AS pkg', [inc.id]);
  return { db, a, b, inc, pkg: enrich(pkg) };
}
if (process.argv[1].endsWith('make-brief.mjs')) {
  const { pkg } = await buildIncident();
  fs.writeFileSync('out/brief-B-01.md', brief(pkg));
  fs.writeFileSync('out/package-B-01.json', JSON.stringify(pkg, null, 1));
  console.log('brief bytes', fs.statSync('out/brief-B-01.md').size, 'code_pointers', pkg.code_pointers.length, 'times', pkg.times_athens.length);
}
