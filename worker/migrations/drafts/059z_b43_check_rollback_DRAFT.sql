-- 059z ROLLBACK - puts back the B-43 row of 047b (27/9, origin/main 6235895c tms-auditor/checks/B-43.sql).
-- DRAFT - run ONLY if 059z must be undone (owner, SQL editor, after 15:00). ASCII only (base64 Greek).
-- After it, tms-auditor/checks/B-43.sql must be reverted too (git revert of the 059z commit), or the
-- catalog and production disagree again (principle 3). Results already written by the new B-43 stay
-- in monitoring.results (history; harmless: the runner compares only with the previous value).
-- ONE DO block: refuses unless B-43 holds exactly the 059z row, then proves the old row is back.
DO $do$
DECLARE
  fp_old constant text := '1c60d29025b0867f030df24dfc1353e9';
  fp_new constant text := '1afc44fa8c2c79ea59be6c12c6bed784';
  fp_now text; n_rows int;
BEGIN
  SELECT md5(k.title||'|'||array_to_string(k.flows,',')||'|'||k.sql_text||'|'||coalesce(k.ids_sql,'')||'|'||coalesce(k.entity_table,'')
      ||'|'||k.red_op||'|'||k.red_value::text||'|'||coalesce(k.baseline::text,'')||'|'||k.severity||'|'||k.schedule_tag
      ||'|'||k.is_queue::text||'|'||coalesce(k.impact,'')||'|'||coalesce(k.next_step,'')||'|'||coalesce(k.exceptions,'')
      ||'|'||coalesce(k.tolerance,'')||'|'||k.enabled::text||'|'||coalesce(k.disabled_reason,'')) INTO fp_now
    FROM monitoring.checks k WHERE k.id = 'B-43';
  IF fp_now IS DISTINCT FROM fp_new THEN
    RAISE EXCEPTION '059z rollback: B-43 is not the 059z row (fingerprint %) - stop', fp_now;
  END IF;
  UPDATE monitoring.checks SET
    title = convert_from(decode('zpXOvc61z4HOs8+Mz4IgzrPPjc+Bzr/PgiDOvM61IM+DzrrOrc67zr/PgiDPh8+Jz4HOr8+CIM+Mz4fOt868zrE=', 'base64'), 'UTF8'),
    flows = ARRAY['F-15']::text[],
    sql_text = $m$SELECT count(DISTINCT r.id) FROM ct_round_trips r JOIN ct_rt_legs l ON l.rt_id=r.id JOIN orders o ON o.id=l.order_id
 WHERE r.status NOT IN ('cancelled','closed','complete') AND o.deleted_at IS NULL AND o.status<>'Cancelled'
 AND o.truck_id IS NULL AND o.partner_id IS NULL$m$,
    ids_sql = $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT r.id::text AS x FROM ct_round_trips r JOIN ct_rt_legs l ON l.rt_id=r.id JOIN orders o ON o.id=l.order_id
 WHERE r.status NOT IN ('cancelled','closed','complete') AND o.deleted_at IS NULL AND o.status<>'Cancelled'
 AND o.truck_id IS NULL AND o.partner_id IS NULL LIMIT 50) s$m$,
    entity_table = 'ct_round_trips',
    red_op = '>',
    red_value = 0,
    baseline = NULL,
    severity = 'P3',
    schedule_tag = 'hourly',
    is_queue = false,
    impact = NULL,
    next_step = NULL,
    exceptions = NULL,
    tolerance = NULL,
    enabled = true,
    disabled_reason = NULL
   WHERE id = 'B-43';
  GET DIAGNOSTICS n_rows = ROW_COUNT;
  IF n_rows <> 1 THEN RAISE EXCEPTION '059z rollback: B-43 updated % rows', n_rows; END IF;
  SELECT md5(k.title||'|'||array_to_string(k.flows,',')||'|'||k.sql_text||'|'||coalesce(k.ids_sql,'')||'|'||coalesce(k.entity_table,'')
      ||'|'||k.red_op||'|'||k.red_value::text||'|'||coalesce(k.baseline::text,'')||'|'||k.severity||'|'||k.schedule_tag
      ||'|'||k.is_queue::text||'|'||coalesce(k.impact,'')||'|'||coalesce(k.next_step,'')||'|'||coalesce(k.exceptions,'')
      ||'|'||coalesce(k.tolerance,'')||'|'||k.enabled::text||'|'||coalesce(k.disabled_reason,'')) INTO fp_now
    FROM monitoring.checks k WHERE k.id = 'B-43';
  IF fp_now IS DISTINCT FROM fp_old THEN
    RAISE EXCEPTION '059z rollback proof: fingerprint % <> 047b row %', fp_now, fp_old;
  END IF;
  RAISE NOTICE '059z rollback OK: B-43 is the 047b row again';
END $do$;

SELECT CASE WHEN md5(k.title||'|'||array_to_string(k.flows,',')||'|'||k.sql_text||'|'||coalesce(k.ids_sql,'')||'|'||coalesce(k.entity_table,'') ||'|'||k.red_op||'|'||k.red_value::text||'|'||coalesce(k.baseline::text,'')||'|'||k.severity||'|'||k.schedule_tag ||'|'||k.is_queue::text||'|'||coalesce(k.impact,'')||'|'||coalesce(k.next_step,'')||'|'||coalesce(k.exceptions,'') ||'|'||coalesce(k.tolerance,'')||'|'||k.enabled::text||'|'||coalesce(k.disabled_reason,'')) = '1c60d29025b0867f030df24dfc1353e9'
            THEN '059z ROLLED BACK' ELSE '059z rollback NOT APPLIED' END AS result, k.severity, k.enabled
  FROM monitoring.checks k WHERE k.id = 'B-43';
