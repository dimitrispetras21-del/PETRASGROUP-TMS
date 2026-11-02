// The production-shaped PGlite copy as production will hold it once 093 has run (order 093 -> 095, coordinator 2/11:
// both patch plan_rt_update, 095 guards on 093's text). prod-shaped-092.mjs + 093 itself when 093 is in the tree;
// until 093's PR is merged, its ONE hunk on plan_rt_update (copied from 093's source, the side_time warning line) with
// plan_h_side_warn as a stub - the text, and so its md5, is 093's own (asserted below), and 095 changes nothing near it.
// Once 093 is in the tree the copy below is never read; delete it then.
import fs from 'node:fs';
import { prodShaped092 } from './prod-shaped-092.mjs';
import { migrationFile } from '../lib/db.mjs';

export const RT_UPDATE_093 = '70476c188bab027722ceab6c81c6702c';
const A = `    v_warn := v_warn || plan_h_seg_v1_warn(v_rt) || plan_h_seg_stop_warn(v_rt, v_seg0);
`;
const B = `    v_warn := v_warn || plan_h_seg_v1_warn(v_rt) || plan_h_seg_stop_warn(v_rt, v_seg0);
    -- 093 (owner 2/11): an ANODOS that runs before a KATHODOS of this trip is saved and said (amber on the screen),
    -- in the dry run's preview and in the answer of the save
    v_warn := v_warn || plan_h_side_warn(v_rt);
`;

export async function prodShaped093() {
  const db = await prodShaped092();
  let real = null;
  try { real = migrationFile('093_plan_hours_relaxed.sql'); } catch (_) { real = null; }
  if (real) {
    await db.exec(fs.readFileSync(real, 'utf8'));
  } else {
    await db.exec(`CREATE FUNCTION public.plan_h_side_warn(p_rt bigint) RETURNS jsonb LANGUAGE sql STABLE AS $f$ select '[]'::jsonb $f$`);
    const src = (await db.query(`SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_rt_update(jsonb,text,text)'::regprocedure`)).rows[0].prosrc;
    if (src.split(A).length !== 2) throw new Error('prod-shaped-093: the 093 anchor is not in plan_rt_update exactly once');
    // the way the migrations replace a text: same arguments, result, volatility and security, the new body
    await db.exec(`CREATE FUNCTION pg_temp.t93_set(p_src text) RETURNS void LANGUAGE plpgsql AS $t$
      declare p pg_proc%rowtype;
      begin
        select * into p from pg_proc where oid = 'public.plan_rt_update(jsonb,text,text)'::regprocedure;
        execute format('CREATE OR REPLACE FUNCTION public.plan_rt_update(%s) RETURNS %s LANGUAGE plpgsql %s %s SET search_path = public AS %L',
          pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
          case p.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' else 'VOLATILE' end,
          case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end, p_src);
      end $t$`);
    await db.query(`SELECT pg_temp.t93_set($1)`, [src.replace(A, () => B)]);
  }
  const m = (await db.query(`SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = 'public.plan_rt_update(jsonb,text,text)'::regprocedure`)).rows[0].m;
  if (m !== RT_UPDATE_093) throw new Error(`prod-shaped-093: plan_rt_update is not 093's text (md5 ${m})`);
  return db;
}
