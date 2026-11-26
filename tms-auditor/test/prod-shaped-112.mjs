// The production-shaped PGlite copy as production holds it on 25/11/2026: prod-shaped-093.mjs + every executed national
// v5 migration after it, in the order they ran (095 ... 113). The md5 of the texts 114 patches are asserted against the
// production measure of 25/11 (SELECT only) in plan-114.test.mjs.
import fs from 'node:fs';
import { prodShaped093 } from './prod-shaped-093.mjs';
import { migrationFile } from '../lib/db.mjs';

export const AFTER_093 = ['095_plan_small_relaxed.sql', '096_plan_handover_accept_busy.sql', '097_plan_vs_state_hub_only.sql',
  '098_plan_transfer_point.sql', '099_plan_transfer.sql', '102_plan_drafts.sql',
  '109_plan_board_intl_trips.sql', '110_plan_rt_expect_change.sql', '112_plan_board_local_truck.sql'];

export async function prodShaped112() {
  const db = await prodShaped093();
  for (const f of AFTER_093) {
    try { await db.exec(fs.readFileSync(migrationFile(f), 'utf8')); }
    catch (e) { throw new Error(`prod-shaped-112: ${f} failed: ${e.message}`); }
  }
  return db;
}
