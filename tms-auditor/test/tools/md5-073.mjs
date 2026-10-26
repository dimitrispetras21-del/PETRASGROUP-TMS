// Measures the "after" md5s 073 must state, on the SAME production-shaped PGlite copy plan-073.test.mjs proves 073 on
// (prod-shaped-072.mjs with { money: 'live', with072b: true } + fixtures/v1-money-073.sql: one builder, principle 3;
// F3 Task 1 review, minor 1). Usage, from tms-auditor/:
//   node test/tools/md5-073.mjs
// Prints, for the 073 text as it stands (worker/migrations/): the md5 of each of its 5 hooked 072 functions after the hook
// (computed exactly as the block computes it: replace() of the hook place in the LIVE prosrc) and of each of its 8
// views after it ran (pg_get_viewdef(oid, true)). Use it after every change of 073 (an owner choice M-x, a review
// fix, a re-measured 072 / 072b): paste the numbers into 073 PART 2 / PART 5 and 073_plan_money_verify.sql;
// tests/sql-073-drafts.test.js then checks the three lists agree.
// The md5 proofs of the block are relaxed HERE ONLY (they are what is being measured); every other guard stays, so a
// stale PART 0 (072 / 072b texts) or a hook place that is not there exactly once still stops this tool.
// Not a test (no .test.mjs): it changes nothing in the repo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodShaped072 } from '../prod-shaped-072.mjs';
import { migrationFile } from '../../lib/db.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = (f) => fs.readFileSync(path.join(HERE, '..', 'fixtures', f), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

const db = await prodShaped072(true, { money: 'live', with072b: true });
await db.exec(fixture('v1-money-073.sql'));
const src = fs.readFileSync(migrationFile('073_plan_money.sql'), 'utf8');
const out = {};
const hooks = [...src.matchAll(/\('(public\.[a-z_]+\([^)]*\))',\n\s+(E'[\s\S]*?),\n\s+(E'[\s\S]*?),\n\s+'[0-9a-f]{32}'\)/g)];
if (hooks.length !== 5) throw new Error(`073 PART 2: ${hooks.length} hook rows found, 5 expected`);
for (const [, sig, a, b] of hooks) {
  const r = (await db.query(`SELECT (${a}) AS a, (${b}) AS b, (SELECT prosrc FROM pg_proc WHERE oid = '${sig}'::regprocedure) AS s`)).rows[0];
  if (r.s.split(r.a).length !== 2) throw new Error(`${sig}: the hook place is not there exactly once`);
  out[sig] = md5(r.s.split(r.a).join(r.b));
}
const RELAX = [
  "RAISE EXCEPTION '073: the generated text of % is not the one measured (md5 %) - stop'",
  "RAISE EXCEPTION '073 proof: % does not hold the generated text'",
  "RAISE EXCEPTION '073 proof: view % has md5 %, the plan says %'",
];
let relaxed = src;
for (const r of RELAX) {
  if (relaxed.split(r).length !== 2) throw new Error(`073 no longer holds exactly one: ${r}`);
  relaxed = relaxed.replace(r, r.replace('RAISE EXCEPTION', 'RAISE NOTICE'));
}
await db.exec(relaxed);
for (const [sig, m] of Object.entries(out)) {
  const now = (await db.query(`SELECT md5(prosrc) AS m FROM pg_proc WHERE oid = '${sig}'::regprocedure`)).rows[0].m;
  if (now !== m) throw new Error(`${sig}: the block wrote md5 ${now}, the hook computes ${m}`);
}
for (const v of ['ct_v_v5_revenue', 'ct_v_rt_partner_cost', 'ct_v_rt_revenue', 'ct_v_rt_costs', 'ct_v_rt_pnl', 'dl_v_rt_route', 'ct_v_rt_pallet_gate', 'stock_v_pieces'])
  out[`public.${v}`] = (await db.query(`SELECT md5(pg_get_viewdef('public.${v}'::regclass, true)) AS m`)).rows[0].m;
console.log(JSON.stringify(out, null, 1));
