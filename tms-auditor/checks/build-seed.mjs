// Regenerates worker/migrations/drafts/047b_monitoring_seed.sql from checks/*.sql. Exit 1 on lint errors.
import fs from 'node:fs';
import path from 'node:path';
import { loadChecks, seedSql, CHECKS_DIR } from './load.mjs';
const { checks, errors } = loadChecks();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const out = path.join(CHECKS_DIR, '../../worker/migrations/drafts/047b_monitoring_seed.sql');
fs.writeFileSync(out, seedSql(checks));
console.log(`seed: ${checks.length} checks (${checks.filter(c => c.enabled).length} enabled) → ${path.relative(process.cwd(), out)}`);
