// The production-shaped PGlite copy as production holds it once 084 (#188) and 086 (#195) have run: prod-shaped-074.mjs
// + 075, 076, 077, 078, 080, 082 and 081 (executed), then 084 and 086 - the same steps as plan-086.test.mjs, in one
// place for the migrations that build on 086 (089). B-54 is measured after 082's fixture, as in plan-086.
import fs from 'node:fs';
import { prodShaped074 } from './prod-shaped-074.mjs';
import { migrationFile } from '../lib/db.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');

export async function prodShaped086() {
  const db = await prodShaped074();
  for (const f of ['075_plan_order_side.sql', '076_plan_board_speed.sql', '077_plan_order_edit.sql', '078_audit_actions.sql']) await db.exec(read(f));
  await db.exec(`DELETE FROM monitoring.checks WHERE id = 'B-100'`);
  await db.exec(read('080_plan_optional_price_pallets.sql'));
  await db.exec(fs.readFileSync(new URL('./fixtures/live-082.sql', import.meta.url), 'utf8'));
  await db.query(`UPDATE monitoring.checks SET red_value = (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') WHERE id = 'B-54'`);
  await db.exec(read('082_plan_bridge_keeps_cycles.sql'));
  await db.exec(read('081_plan_stop_order_follows.sql'));
  await db.exec(read('084_plan_move_busy_skip.sql'));
  await db.exec(read('086_plan_busy_overlap_ok.sql'));
  return db;
}
