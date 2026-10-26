// Re-derives 072b's md5 guards on 072 as executed (plan Task B2 Steps 1-3): PART 0's pairs from the copy, then each
// hook's "after" md5 from 072b's own refusal message, hook by hook. Kept in the repo (rule 4: the memory is the repo)
// because every later change of a hooked 072 function, or of a hook text, needs it again. Not a test (no .test.mjs).
// Usage, from tms-auditor/: node test/measure-072b.mjs [--write]. It prints the old -> new md5 map and writes it to
// test/.md5map-072b.json (git-ignored scratch); --write also rewrites 072b. Then apply the same map to
// 072b_plan_vehicle_segments_verify.sql, regenerate with build-072b.mjs, and compare PART 0 with production by SELECT.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb } from './helpers.mjs';
import { DRAFTS } from '../lib/db.mjs';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(DRAFTS, f), 'utf8');
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
const TRG = `SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public'`;

const db = await freshDb({ extensions: { btree_gist, pgcrypto } });
await db.exec(`DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $r$;`);
await db.exec(fixture('live-071.sql'));
await db.exec(fixture('live-072.sql'));
await db.exec(STUBS);
await db.exec(`CREATE SCHEMA IF NOT EXISTS extensions`);
await db.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions`);
await db.exec(`INSERT INTO public.locations (legacy_id, name) VALUES ('recJucKOhC1zh4IP3', 'CROSS-DOCK')`);
await db.exec(`UPDATE monitoring.checks SET red_value = (${TRG}), baseline = NULL WHERE id = 'B-54'`);
await db.exec(readDone('071_plan_schema.sql'));
await db.exec(readDone('071b_plan_one_vehicle.sql'));
await db.exec(readDone('072_plan_functions.sql'));

const FILE = path.join(DRAFTS, '072b_plan_vehicle_segments.sql');
let src = fs.readFileSync(FILE, 'utf8');
const orig = src;

// 1. PART 0 pairs -> the live md5
const part0 = src.slice(src.indexOf('===== PART 0'), src.indexOf('===== PART 1'));
const pairs = [...part0.matchAll(/\('(public\.[^']+)', '([0-9a-f]{32})'\)/g)].map((m) => [m[1], m[2]]);
const map = new Map(); // old md5 -> new md5
for (const [sig, m] of pairs) {
  const r = (await db.query('SELECT md5(prosrc) AS m, l.lanname, p.proconfig FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = to_regprocedure($1)', [sig])).rows[0];
  const now = r?.m ?? 'MISSING';
  console.log(`${now === m ? '  same' : 'CHANGED'} ${sig} ${m} -> ${now} ${r?.lanname} ${JSON.stringify(r?.proconfig)}`);
  if (now !== m) map.set(m, now);
}
console.log('plan_* now:', (await db.query(`SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'plan\\_%'`)).rows[0].n);
for (const [a, b] of map) src = src.split(a).join(b);

// 2. hooks: iterate on the generated-text messages (B2 Step 3)
for (let i = 0; i < 60; i++) {
  let err = null;
  try { await db.exec('BEGIN'); await db.exec(src); } catch (e) { err = String(e.message); }
  await db.exec('ROLLBACK');
  if (!err) { console.log('072b APPLIES on the implemented 072 (rolled back)'); break; }
  let m = err.match(/is not the text expected before hook (\d+) \(md5 ([0-9a-f]{32})\)/);
  if (m) { console.log('UNEXPECTED before-mismatch', err); break; }
  m = err.match(/the generated text of (\S+) \(hook (\d+)\) is not the one measured \(md5 ([0-9a-f]{32})\)/);
  if (m) {
    const k = Number(m[2]); const now = m[3];
    const row = src.match(new RegExp(`\\(${k}, '[^']+', \\w+, \\w+,\\n\\s+'([0-9a-f]{32})', '([0-9a-f]{32})'\\)`));
    const old = row[2];
    console.log(`hook ${k}: after ${old} -> ${now}`);
    map.set(old, now);
    src = src.split(old).join(now);
    continue;
  }
  console.log('STOP:', err.slice(0, 600)); break;
}
console.log('md5 map (old -> new):');
for (const [a, b] of map) console.log(`  ${a} -> ${b}`);
fs.writeFileSync(path.join(HERE, '.md5map-072b.json'), JSON.stringify([...map], null, 1));
if (process.argv.includes('--write') && src !== orig) { fs.writeFileSync(FILE, src); console.log('written', FILE); }
