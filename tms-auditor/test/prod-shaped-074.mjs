// The production-shaped PGlite copy as production holds it AFTER day L (28/10/2026): the 073b copy of
// prod-shaped-072.mjs (live money views, 072b, the v1 money fixture, 073, 073b), fixtures/live-074.sql (028, 030, the
// national-load and order soft-delete triggers), 074a, the test rows of the old model at their production ids, 074
// and 074b. ONE builder for the migrations after 074 (075 on), so their md5 guards are derived on the database their
// proofs run on (principle 3). Day L: the next Saturday after today (the constant of 074 is replaced in ONE place),
// so 074's guard "after today" holds whenever this runs; production holds 31/10.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodShaped072, TRG } from './prod-shaped-072.mjs';
import { migrationFile } from '../lib/db.mjs';
import { IDS as IDS_073B } from '../../worker/migrations/drafts/tools/build-073b.mjs';
import { NEW_IDS, OLD } from '../../worker/migrations/drafts/tools/build-074.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');
const L_CONST = "DATE '2026-10-31'";
export function nextSaturday() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Athens' })); d.setHours(12, 0, 0, 0);
  do d.setDate(d.getDate() + 1); while (d.getDay() !== 6);
  return d.toISOString().slice(0, 10);
}
// the live test rows of the old model at their production ids (074 PART 7 accepts exactly these)
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

export async function prodShaped074() {
  const db = await prodShaped072(true, { money: 'live', with072b: true });
  await db.exec(fixture('v1-money-073.sql'));
  await db.exec(read('073_plan_money.sql'));
  // the local seed (047b) holds every check file; production got 073b's / 074b's checks from those migrations
  await db.query('DELETE FROM monitoring.checks WHERE id = ANY($1)', [[...IDS_073B, ...NEW_IDS]]);
  for (const [id, o] of Object.entries(OLD)) {
    await db.query('UPDATE monitoring.checks SET sql_text = $2, ids_sql = $3, exceptions = $4 WHERE id = $1', [id, o.sql, o.ids_sql, o.exceptions]);
  }
  await db.exec(read('073b_plan_monitoring.sql'));
  await db.exec(fixture('live-074.sql'));
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}) WHERE id = 'B-54'`);
  await db.exec(read('074a_plan_reads.sql'));
  await db.exec(PROD_TESTS);
  const src = read('074_plan_cutover.sql');
  if (!src.includes(L_CONST)) throw new Error('prodShaped074: the Q-1 constant of 074 moved');
  await db.exec(src.replace(L_CONST, `DATE '${nextSaturday()}'`));
  await db.exec(read('074b_plan_cutover_monitoring.sql'));
  return db;
}
