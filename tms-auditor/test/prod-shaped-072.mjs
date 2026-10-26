// The production-shaped PGlite copy that 072b is proved on (plan-072b.test.mjs) AND re-measured on
// (measure-072b.mjs): ONE builder, so the md5 guards are always derived on the database the proofs run on
// (principle 3; code review xhigh 26/10: the tool had its own copy of this setup).
// Shape = the 22/9 columns + live-071.sql + live-072.sql, 071 and 071b as executed 22/10, 072 as executed 26/10.
// Limits (as plan-072): money views are STUBS; the capture holds only the functions of its f/trg lists.
// 073 (F3 Task 1) builds on the SAME copy, with { money: 'live' }: fixtures/live-073.sql (the REAL money, route,
// gate and stock views, their grants and the 4 functions they call, captured 26/10) takes the place of the stubs,
// at the same point (after live-072.sql, before 071), and { with072b: true } applies the 072b draft after 072
// (order 072 -> 072b -> 073). The defaults are the 072b harness, unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb } from './helpers.mjs';
import { DRAFTS } from '../lib/db.mjs';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readDone = (f) => fs.readFileSync(path.join(DRAFTS, '..', f), 'utf8');
const fixture = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8');

const STUBS = `
CREATE OR REPLACE VIEW public.ct_v_rt_revenue AS SELECT id AS rt_id, 0::numeric AS revenue, 0::numeric AS revenue_intl,
  0::numeric AS revenue_natl FROM public.ct_round_trips;
CREATE OR REPLACE VIEW public.ct_v_rt_costs AS SELECT id AS rt_id, 0::numeric AS lines_net, 0::numeric AS vat, 0::numeric AS wear,
  0::numeric AS dl_trip_value, 0::numeric AS dl_expenses, 0::numeric AS driver_pay_pending, 0::bigint AS driver_pay_missing,
  0::numeric AS partner_planned, 0::numeric AS partner_invoiced FROM public.ct_round_trips;
CREATE OR REPLACE VIEW public.ct_v_rt_pnl AS SELECT id, 0::numeric AS cost_gross, 0::numeric AS profit_worst,
  0::numeric AS profit_ex_vat FROM public.ct_round_trips WHERE status <> 'cancelled';
CREATE OR REPLACE VIEW public.dl_v_rt_route AS SELECT id AS rt_id, ''::text AS route_text FROM public.ct_round_trips;
`;
export const TRG = `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`;

export async function prodShaped072(with072 = true, { money = 'stubs', with072b = false } = {}) {
  if (money !== 'stubs' && money !== 'live') throw new Error(`prodShaped072: money must be 'stubs' or 'live', not ${money}`);
  if (with072b && !with072) throw new Error('prodShaped072: 072b needs 072');
  const db = await freshDb({ extensions: { btree_gist, pgcrypto } });
  await db.exec(`DO $r$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  END $r$;`);
  await db.exec(fixture('live-071.sql'));
  await db.exec(fixture('live-072.sql'));
  await db.exec(money === 'live' ? fixture('live-073.sql') : STUBS);
  await db.exec(`CREATE SCHEMA IF NOT EXISTS extensions`);
  await db.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions`);
  await db.exec(`INSERT INTO public.locations (legacy_id, name) VALUES ('recJucKOhC1zh4IP3', 'CROSS-DOCK')`);
  await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}), baseline = NULL WHERE id = 'B-54'`);
  await db.exec(readDone('071_plan_schema.sql'));
  await db.exec(readDone('071b_plan_one_vehicle.sql'));
  if (with072) await db.exec(readDone('072_plan_functions.sql'));
  // 072b: a draft until the owner runs it (then it leaves drafts/ and this line reads it from worker/migrations/)
  if (with072b) await db.exec(fs.readFileSync(path.join(DRAFTS, '072b_plan_vehicle_segments.sql'), 'utf8'));
  return db;
}
