// Generates 073b_plan_monitoring.sql, its dry run and its rollback FROM tms-auditor/checks/B-78..B-94.sql:
//   node worker/migrations/drafts/tools/build-073b.mjs          (writes the three)
//   node worker/migrations/drafts/tools/build-073b.mjs --check  (exit 1 if a committed file drifted)
// Why generated (principle 3): the check files are the ONE source of a check (047b, 066 B-77); the migration that
// puts them into production carries their text byte for byte (Greek as base64) and proves it with md5.
// What 073b does, in ONE DO block: the read policy monitor_read on the five v5 tables of 071 (without it the
// auditor's roles read 0 rows from them and every v5 check is green for ever - RLS on, no policy, 071), SELECT on
// ct_settings and EXECUTE on stock_vs_charge for the check runner only (D-15: the functions inside ct_v_v5_revenue
// run as the caller; the EXECUTE was missed until the production dry run of 26/10 refused B-79), the 13
// checks of spec 8 that do not need day L (B-78..B-90, owner answers M-4 beta / M-5 delta / M-6 alpha), B-94 (final
// round 2, 26/10: a partner invoice that no partner of its cycle owns - Q6-1's unmatched row, counted and never
// replacing a rate, so nothing else would say it), and the 3 checks of 072b (B-91..B-93, handover P3-6: they waited
// outside the catalog for this seed; rt_vehicle_segments has its own policy from 072b, H-10, so it is NOT in the
// policy list here). ASCII in, ASCII out.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadChecks } from '../../../../tms-auditor/checks/load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The folder that holds the 073b files. After the owner runs them they leave drafts/ (CLAUDE.md rule 5): then
// this becomes path.resolve(HERE, '../..') and nothing else changes.
export const DIR = path.resolve(HERE, '..');
// F3's own checks: the ones that read 073's objects, so 073's rollback refuses while they exist (one list: the build
// test holds 073_plan_money_rollback.sql equal to it).
export const F3_IDS = ['B-78', 'B-79', 'B-80', 'B-81', 'B-82', 'B-83', 'B-84', 'B-85', 'B-86', 'B-87', 'B-88', 'B-89', 'B-90', 'B-94'];
// 072b's checks, seeded here (handover P3-6); they read only 072b's segments, so 073's rollback does not wait on them.
export const HANDOVER_IDS = ['B-91', 'B-92', 'B-93'];
export const IDS = [...F3_IDS, ...HANDOVER_IDS];
export const V5 = ['shipments', 'shipment_pieces', 'rt_stops', 'piece_legs', 'plan_notices'];
export const FILES = ['073b_plan_monitoring.sql', '073b_plan_monitoring_dryrun.sql', '073b_plan_monitoring_rollback.sql'];
// The one function under ct_v_v5_revenue the runner cannot execute in production (measured 26/10 with
// has_function_privilege over every function the 17 checks reach through their views: ct_setting is granted to
// PUBLIC, order_pallets and stock_natl_delivered to the runner by 057; stock_vs_charge to service_role only). Their
// bodies, which pg_depend does not see and a 0-row run never enters: stock_vs_charge calls ct_setting, ct_setting
// reads ct_settings (D-15's GRANT above), order_pallets and stock_natl_delivered touch nothing; the harness runs
// them with v5 rows under production's ACLs (plan-073b.test.mjs, prod-shaped-072.mjs FN_ACL).
export const RUNNER_FN = 'public.stock_vs_charge(numeric, numeric)';
const RUNNER_FN_NAME = RUNNER_FN.replace(/^public\.|\(.*$/g, '');   // the messages name the function the SQL guards
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const txt = (s) => (s == null ? 'NULL' : /^[\x20-\x7e\n]*$/.test(s) && !s.includes('$m$') ? `$m$${s}$m$`
  : `convert_from(decode('${b64(s)}', 'base64'), 'UTF8')`);
const list = (xs) => xs.map((x) => `'${x}'`).join(', ');
// a list of check ids as its runs, for the texts: B-78..B-90, B-94 (F3's ids are not one run since B-94 came after
// 072b's B-91..B-93; a first..last span would name 072b's checks as F3's)
export const runs = (xs) => {
  const out = [];
  for (const id of [...xs].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))) {
    const last = out[out.length - 1];
    const k = Number(id.slice(2));
    if (last && k === last.to + 1) last.to = k; else out.push({ from: k, to: k });
  }
  return out.map((r) => (r.from === r.to ? `B-${r.from}` : `B-${r.from}..B-${r.to}`)).join(', ');
};
// a number into SQL: never NaN or an endless value (the cross-cutting finite rule; a header typo would otherwise
// reach production as 'NaN')
const num = (v) => { if (!Number.isFinite(v)) throw new Error(`not a finite number: ${v}`); return String(v); };

export function build() {
  const { checks, errors } = loadChecks();
  if (errors.length) throw new Error('catalog lint: ' + errors.join('; '));
  const mine = IDS.map((id) => checks.find((c) => c.id === id));
  if (mine.some((c) => !c)) throw new Error('missing check file: ' + IDS.filter((id, i) => !mine[i]).join(','));
  const rows = mine.map((c) => `    (${[txt(c.id), txt(c.title), `ARRAY[${c.flows.map(txt).join(',')}]::text[]`, txt(c.sql), txt(c.ids_sql),
    txt(c.entity_table), txt(c.red_op), num(c.red_value), c.baseline == null ? 'NULL' : num(c.baseline), txt(c.severity), txt(c.schedule),
    c.is_queue, txt(c.impact), txt(c.next_step), txt(c.exceptions), txt(c.tolerance), c.enabled, txt(c.disabled_reason)].join(',\n     ')})`);
  const proof = mine.map((c) => `      ('${c.id}', '${md5(c.sql)}', '${md5(c.ids_sql || '')}', ${c.enabled})`).join(',\n');
  const nOn = mine.filter((c) => c.enabled).length;
  const done = `073b OK: ${IDS.length} checks (${F3_IDS.length} of F3 + ${HANDOVER_IDS.length} of 072b, ${nOn} enabled), ${V5.length} read policies, X readable and computable by the runner, every check 0 today`;
  const body = `DECLARE
  v_k int; v_trg0 int; v_g record; v_v numeric; v_sql text; v_ids text; v_a text[];
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- 0. GUARDS (order 072 -> 072b -> 073 -> 073b)
  IF to_regclass('public.ct_v_v5_revenue') IS NULL OR to_regprocedure('public.plan_h_pallet_sync(bigint[],text,text)') IS NULL THEN
    RAISE EXCEPTION '073b: 073 must be applied first';
  END IF;
  -- B-91..B-93 read rt_vehicle_segments through 072b's own policy: without it they would be blind (principle 1)
  IF to_regclass('public.rt_vehicle_segments') IS NULL OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
       AND tablename = 'rt_vehicle_segments' AND policyname = 'monitor_read' AND cmd = 'SELECT') THEN
    RAISE EXCEPTION '073b: 072b (rt_vehicle_segments and its monitor_read policy) must be applied first';
  END IF;
  IF EXISTS (SELECT 1 FROM monitoring.checks WHERE id IN (${list(IDS)})) THEN
    RAISE EXCEPTION '073b: already applied (a check ${runs(IDS)} exists) - stop, re-measure';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${list(V5)})) THEN
    RAISE EXCEPTION '073b: a policy already exists on a v5 table - stop, re-measure';
  END IF;
  IF has_table_privilege('tms_check_runner', 'public.ct_settings', 'SELECT') THEN
    RAISE EXCEPTION '073b: the runner already reads ct_settings - stop, re-measure';
  END IF;
  IF has_function_privilege('tms_check_runner', '${RUNNER_FN}', 'EXECUTE') THEN
    RAISE EXCEPTION '073b: the runner already executes ${RUNNER_FN_NAME} - stop, re-measure';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';

  -- 1. THE AUDITOR READS THE v5 TABLES (D-14). 071 left them RLS on, no policy: the grants to tms_check_runner and
  --    tms_reader give 0 rows, so a v5 check would be green for ever (principle 1). The same read-only policy as
  --    every table the auditor reads (050, 057's stock_lots, 072b's rt_vehicle_segments); service_role bypasses RLS.
${V5.map((t) => `  CREATE POLICY monitor_read ON public.${t} FOR SELECT TO tms_check_runner, tms_reader USING (true);`).join('\n')}

  -- 1b. X for the auditor (D-15): ct_v_v5_revenue runs as its owner, but ct_setting() and stock_vs_charge() inside it
  --     run as the CALLER (a view does not lend its rights to the functions it calls): without this, B-79 / B-80
  --     fail with "permission denied for table ct_settings" as soon as one v5 row exists (measured on PGlite).
  --     The auditor's runner only (it already reads money: stock_v_lot_money, 057); never tms_reader.
  GRANT SELECT ON public.ct_settings TO tms_check_runner;
  --     And the EXECUTE on stock_vs_charge: 057 gave it to service_role only, and the right to call a function is
  --     checked when the query starts, even with 0 rows, so the 073b dry run of 26/10 stopped at B-79 with "permission denied
  --     for function stock_vs_charge". Runner only, as above (ct_setting is already PUBLIC in production).
  GRANT EXECUTE ON FUNCTION ${RUNNER_FN} TO tms_check_runner;

  -- 2. THE ${IDS.length} CHECKS (text = tms-auditor/checks/<id>.sql, generated; md5-proven below)
  INSERT INTO monitoring.checks (id, title, flows, sql_text, ids_sql, entity_table, red_op, red_value, baseline, severity,
    schedule_tag, is_queue, impact, next_step, exceptions, tolerance, enabled, disabled_reason) VALUES
${rows.join(',\n')};
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> ${IDS.length} THEN RAISE EXCEPTION '073b: % checks inserted, expected ${IDS.length}', v_k; END IF;

  -- 3. PROOFS: the text and the on/off are the file's; each check (the disabled B-80 too) passes the same guard as
  --    monitoring.run_checks, runs as the auditor's role and says 0 today (no v5 row before day L). Its ids_sql runs
  --    too, under the same role as in run_checks: a right missing only on the ids path would otherwise pass here
  --    and fail the first red run (review high, 26/10). NULL ids is an error, as in 057b's proof: run_checks would
  --    turn it into '{}', a red incident that names nothing
  FOR v_g IN SELECT * FROM (VALUES
${proof}
    ) p(id, m_sql, m_ids, on_) LOOP
    IF (SELECT md5(sql_text) <> v_g.m_sql OR md5(coalesce(ids_sql, '')) <> v_g.m_ids OR enabled <> v_g.on_
          FROM monitoring.checks WHERE id = v_g.id) THEN
      RAISE EXCEPTION '073b proof: % is not the text (or the on/off) of its file', v_g.id;
    END IF;
    SELECT sql_text, ids_sql INTO v_sql, v_ids FROM monitoring.checks WHERE id = v_g.id;
    PERFORM monitoring.check_sql_guard(v_sql);
    IF v_ids IS NOT NULL THEN PERFORM monitoring.check_sql_guard(v_ids); END IF;
    SET LOCAL ROLE tms_check_runner;
    EXECUTE v_sql INTO v_v;
    v_a := '{}';
    IF v_ids IS NOT NULL THEN EXECUTE v_ids INTO v_a; END IF;
    RESET ROLE;
    IF v_v IS DISTINCT FROM 0 THEN RAISE EXCEPTION '073b proof: % gives % today, expected 0 before day L', v_g.id, v_v; END IF;
    IF v_a IS NULL THEN RAISE EXCEPTION '073b proof: % ids returned NULL', v_g.id; END IF;
    IF cardinality(v_a) IS DISTINCT FROM 0 THEN RAISE EXCEPTION '073b proof: % names % today, expected none', v_g.id, v_a; END IF;
  END LOOP;
  IF (SELECT count(*) FROM monitoring.checks WHERE id IN (${list(IDS)}) AND enabled) <> ${nOn} THEN
    RAISE EXCEPTION '073b proof: the enabled checks are not ${nOn}';
  END IF;
  IF NOT has_table_privilege('tms_check_runner', 'public.ct_settings', 'SELECT')
     OR has_table_privilege('tms_reader', 'public.ct_settings', 'SELECT') THEN
    RAISE EXCEPTION '073b proof: ct_settings is not readable by the runner only';
  END IF;
  IF NOT has_function_privilege('tms_check_runner', '${RUNNER_FN}', 'EXECUTE')
     OR has_function_privilege('tms_reader', '${RUNNER_FN}', 'EXECUTE') THEN
    RAISE EXCEPTION '073b proof: ${RUNNER_FN_NAME} is not executable by the runner only';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${list(V5)})) <> ${V5.length}
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname = 'monitor_read' AND cmd = 'SELECT'
           AND tablename IN (${list(V5)}) AND roles::text[] @> ARRAY['tms_check_runner', 'tms_reader']
           AND cardinality(roles) = 2 AND qual = 'true' AND with_check IS NULL) <> ${V5.length} THEN
    RAISE EXCEPTION '073b proof: the ${V5.length} read policies are not exactly monitor_read (SELECT, the two auditor roles only)';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') <> v_trg0 THEN
    RAISE EXCEPTION '073b proof: a trigger appeared';
  END IF;
  RAISE NOTICE '${done}';
`;
  const head = `-- 073b - NATIONAL v5, PHASE F3: THE AUDITOR LEARNS v5 (spec 8). GENERATED by worker/migrations/drafts/tools/build-073b.mjs
-- from tms-auditor/checks/${runs(F3_IDS)} (F3) and ${runs(HANDOVER_IDS)} (072b, handover P3-6).
-- DO NOT EDIT BY HAND (tests/sql-073-drafts.test.js fails on drift).
-- SEPARATE approval from 073 (C-17): run it AFTER 072b, 073 and 073's verify, after 15:00, with an explicit yes:
--   1. 073b_plan_monitoring_dryrun.sql   (this block + a deliberate error: NOTHING kept)
--   2. 073b_plan_monitoring.sql          (this file)
-- ASCII only (Greek texts are base64). ONE DO block.
-- After it: 071_plan_schema_verify.sql shows policies = 5 (expected from 073b on; it was 0 by design of 071), and
-- 072b's verify still shows auditor_policy = 1 (rt_vehicle_segments keeps its own policy, untouched here).
-- REVERSE: 073b_plan_monitoring_rollback.sql (before 073's rollback: 073's refuses while ${runs(F3_IDS)} exist).
-- EXPECTED: NOTICE "${done}".
`;
  const main = `${head}\nDO $do$\n${body}END $do$;\n`;
  const dry = `-- 073b DRY RUN - GENERATED by worker/migrations/drafts/tools/build-073b.mjs. DO NOT EDIT BY HAND.
-- 073b's block verbatim, ending with a deliberate error: NOTHING is kept. ASCII. ONE DO block.
-- EXPECTED: NOTICE "073b OK: ..." then ERROR: P0001: DRY RUN 073b finished - EVERYTHING UNDONE, nothing kept.

DO $dry$
${body}  RAISE EXCEPTION 'DRY RUN 073b finished - EVERYTHING UNDONE, nothing kept.';
END
$dry$;
`;
  // the open incidents of the removed checks, by check and by their MECH keys (047: MECH:check:<id> from run_checks,
  // MECH:stale:<id> from self_check) - the 060 rollback's rule, one predicate for the UPDATE and its proof
  const openOf = `state IN ('new', 'confirmed', 'recurred')
     AND (check_id IN (${list(IDS)})
          OR incident_key IN (${list(IDS.flatMap((id) => [`MECH:check:${id}`, `MECH:stale:${id}`]))}))`;
  const rollback = `-- 073b ROLLBACK - GENERATED by worker/migrations/drafts/tools/build-073b.mjs. DO NOT EDIT BY HAND.
-- The ${IDS.length} checks out of the catalog (with their results, their open incidents closed), the ${V5.length} read policies off,
-- ct_settings and stock_vs_charge back from the runner.
-- After it the auditor reads 0 rows from the v5 tables again (071's design), reads no ct_settings and cannot execute
-- stock_vs_charge (057's grants); 072b's own policy on rt_vehicle_segments stays. Only with an explicit yes, after
-- 15:00; BEFORE 073's rollback. ASCII. ONE DO block.
-- EXPECTED: NOTICE "073b ROLLBACK OK".
DO $do$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- Open incidents of the removed checks are closed first (as 060's rollback): incidents has no foreign key to
  -- checks and run_checks never runs a deleted check again, so they would stay red in the report for ever for a
  -- check that is gone (principles 1 and 8), and a later 073b would reopen the stale one through incidents_open_key.
  -- 'confirmed' too - the check that a human confirmed no longer exists.
  UPDATE monitoring.incidents SET state = 'resolved', resolved_verified_at = clock_timestamp(),
         state_changed_by = '073b rollback (check removed)', state_changed_at = clock_timestamp()
   WHERE ${openOf};
  -- results next: monitoring.results references monitoring.checks
  DELETE FROM monitoring.results WHERE check_id IN (${list(IDS)});
  DELETE FROM monitoring.checks WHERE id IN (${list(IDS)});
${V5.map((t) => `  DROP POLICY IF EXISTS monitor_read ON public.${t};`).join('\n')}
  REVOKE SELECT ON public.ct_settings FROM tms_check_runner;
  REVOKE EXECUTE ON FUNCTION ${RUNNER_FN} FROM tms_check_runner;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN (${list(V5)})) THEN
    RAISE EXCEPTION '073b rollback proof: a policy is left on a v5 table';
  END IF;
  IF EXISTS (SELECT 1 FROM monitoring.checks WHERE id IN (${list(IDS)})) THEN
    RAISE EXCEPTION '073b rollback proof: a check of 073b is left';
  END IF;
  IF EXISTS (SELECT 1 FROM monitoring.incidents WHERE ${openOf}) THEN
    RAISE EXCEPTION '073b rollback proof: an incident of ${runs(IDS)} is still open';
  END IF;
  IF has_table_privilege('tms_check_runner', 'public.ct_settings', 'SELECT') THEN
    RAISE EXCEPTION '073b rollback proof: the runner still reads ct_settings';
  END IF;
  IF has_function_privilege('tms_check_runner', '${RUNNER_FN}', 'EXECUTE') THEN
    RAISE EXCEPTION '073b rollback proof: the runner still executes ${RUNNER_FN_NAME}';
  END IF;
  RAISE NOTICE '073b ROLLBACK OK';
END $do$;
`;
  return { main, dry, rollback };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = build();
  const files = { [FILES[0]]: out.main, [FILES[1]]: out.dry, [FILES[2]]: out.rollback };
  for (const [f, s] of Object.entries(files)) if (/[^\x00-\x7f]/.test(s)) { console.error(`${f}: non-ASCII`); process.exit(1); }
  if (process.argv.includes('--check')) {
    const drift = Object.entries(files).filter(([f, s]) => !fs.existsSync(path.join(DIR, f)) || fs.readFileSync(path.join(DIR, f), 'utf8') !== s);
    if (drift.length) { console.error('drift: ' + drift.map(([f]) => f).join(', ')); process.exit(1); }
    process.exit(0);
  }
  for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(DIR, f), s);
  console.log('wrote 073b: ' + Object.keys(files).join(', '));
}
