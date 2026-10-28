// The production-shaped PGlite copy as production holds it after 28/10's cutover: 072 + 072b + 073 + 073b (the 072
// builder), the 074 fixture, 074a, 074 (day L = the next Saturday, as plan-074.test.mjs applies it) and 075. Used by
// the readers built on 075's plan_board (076: plan-076.test.mjs, tools/measure-076.mjs).
// plan_config is emptied after 074 (the bridge and freeze triggers inert, as plan-074.test.mjs's C24 does): the
// fixtures written by hand on this copy (VS rows with their own bridges) would otherwise be bridged a second time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodShaped072, TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { IDS as IDS_073B } from '../../worker/migrations/drafts/tools/build-073b.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');

// production's old-model test rows at their ids (074 PART 7 cleans exactly these; plan-074.test.mjs, same rows)
const PROD_TESTS = `
UPDATE national_loads SET deleted_at = now() WHERE legacy_id = 'rec073VNL2';
UPDATE national_orders SET deleted_at = now() WHERE legacy_id = 'rec073VN1';
INSERT INTO national_orders (id, legacy_id, reference, price) OVERRIDING SYSTEM VALUE
  SELECT i, 'rec074TN' || i, 'WN074-OLD', 10 FROM unnest('{5,6,7,8,13,14}'::bigint[]) i;
INSERT INTO national_loads (id, legacy_id, source_type, status, source_national_order_id) OVERRIDING SYSTEM VALUE
  SELECT i, 'rec074TL' || i, CASE WHEN i < 99 THEN 'National' ELSE 'Groupage' END, 'Pending', 5 FROM unnest('{93,96,97,98,99,102,103}'::bigint[]) i;
INSERT INTO consolidated_loads (id, legacy_id, status) OVERRIDING SYSTEM VALUE VALUES (5, 'rec074TC5', 'Assigned');
INSERT INTO groupage_lines (id, legacy_id, status, cons_load_id, national_order_id) OVERRIDING SYSTEM VALUE
  VALUES (52, 'rec074TG52', 'Assigned', 5, 6), (53, 'rec074TG53', 'Assigned', 5, 7);
SELECT setval(pg_get_serial_sequence('public.' || t, 'id'), (SELECT max(id) FROM national_loads) + 1000)
  FROM unnest(ARRAY['national_orders', 'national_loads', 'consolidated_loads', 'groupage_lines']) t;`;
const L_CONST = "DATE '2026-10-31'";
function nextSaturday() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Athens' })); d.setHours(12, 0, 0, 0);
  do d.setDate(d.getDate() + 1); while (d.getDay() !== 6);
  return d.toISOString().slice(0, 10);
}

export async function prodShaped075() {
  const db = await prodShaped072(true, { money: 'live', with072b: true });
  await db.exec(fixture('v1-money-073.sql'));
  await db.exec(read('073_plan_money.sql'));
  await db.query('DELETE FROM monitoring.checks WHERE id = ANY($1)', [IDS_073B]);   // 073b seeds its own checks
  await db.exec(read('073b_plan_monitoring.sql'));
  await db.exec(fixture('live-074.sql'));
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}) WHERE id = 'B-54'`);
  await db.exec(read('074a_plan_reads.sql'));
  await db.exec(PROD_TESTS);
  const src074 = read('074_plan_cutover.sql');
  if (!src074.includes(L_CONST)) throw new Error('prodShaped075: 074 no longer holds its day L constant');
  await db.exec(src074.replace(L_CONST, `DATE '${nextSaturday()}'`));
  await db.exec(read('075_plan_order_side.sql'));
  await db.exec('DELETE FROM plan_config');
  return db;
}
