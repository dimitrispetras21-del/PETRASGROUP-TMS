// The production-shaped PGlite copy as production holds it on 2/11, once 083 ... 092 have run: prod-shaped-086.mjs +
// 083, 085, 087, 088, 089 and 092 (090 changes locations only). For the migrations that build on 092 (095): the six
// texts 095 guards on are the live ones here (md5 = production, SELECT 2/11).
import fs from 'node:fs';
import { prodShaped086 } from './prod-shaped-086.mjs';
import { migrationFile } from '../lib/db.mjs';

const read = (f) => fs.readFileSync(migrationFile(f), 'utf8');

export async function prodShaped092() {
  const db = await prodShaped086();
  for (const f of ['083_plan_load_without_truck.sql', '085_plan_invoiced_client_price.sql', '087_plan_board_reads_hub_mark.sql',
                   '088_plan_split_leave_by.sql', '089_plan_partner_rate_anodos.sql', '092_plan_vs_pallets_day.sql']) await db.exec(read(f));
  return db;
}
