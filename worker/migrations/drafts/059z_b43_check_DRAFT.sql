-- 059z - auditor check B-43 redefined: "first the order leaves the RT, then the vehicle goes"
--        (plan rt-never-closed v4, phase 0b = section Theta "062a"). Touches ONLY the B-43 row of
--        monitoring.checks. No TMS table, no TMS data, no Worker, no front end.
--
-- EXECUTED 4/10/2026 evening by the owner (result row: 059z OK, P2, hourly, true, b43_now 0).
-- Verified by SELECT: B-43 row fingerprint = 1afc44fa... (equals tms-auditor/checks/B-43.sql), B-54 green 27.
-- Was: DRAFT - NOT EXECUTED. The owner runs it in the Supabase SQL editor AFTER 15:00 (team works
-- 05:30-14:30), with an explicit yes in the conversation. Plan order is binding: 0b -> 1 -> 2 -> 4 -> 5,
-- so phase 1 (screens stop cancelling round trips) must not ship before this row is live.
-- Rollback: 059z_b43_check_rollback_DRAFT.sql (same folder).
--
-- THIS FILE IS ASCII ONLY, on purpose (a clipboard transfer corrupted Greek text on 27/9): the Greek
-- title / impact / next step / exceptions are stored from base64 (convert_from/decode), the same
-- convention as 060. The readable Greek lives in tms-auditor/checks/B-43.sql; the fingerprint proof
-- below ties the two together byte for byte.
--
-- ONE DO block (lesson of 056/058: the SQL editor is not atomic across statements; inside ONE DO block
-- any RAISE rolls back everything), then ONE read-only SELECT that prints the result row. No temp tables.
--
-- Why (owner 4/10/2026, plan v4: Q1 "yes"; Q2 "yes" with the amendment "in a matched export+import
-- pair, removing the truck removes it from BOTH orders; on unmatch the import leaves with no vehicle
-- and the export keeps it"). RT-1193 (30/9) is what breaking the rule costs: on an unmatch the import's
-- truck was cleared while its leg was still in the RT, trigger rt_sync (013) copied the NULL onto the
-- RT and onto the export in the same statement, and the trip lost its truck and its payroll line.
-- Phase 1 stops the screens from cancelling round trips; until 059a (phase 2) moves leg removal into
-- the database, a cancelled order can stay a leg of a live RT. B-43 is the alarm for that window and
-- afterwards the permanent guard of the 059a invariant (059a proof P3 is the same WHERE).
--
-- What B-43 counts (= plan section Delta, 059a proof P3): legs of a round trip whose status is not
-- 'cancelled' (closed/complete included) where
--   (a) the order or the national load is soft-deleted or Cancelled;
--   (b) an ORDER leg has no vehicle while another live order leg of the same RT has one;
--   (c) a NATIONAL LOAD leg has no vehicle while the RT has any other leg (034 already removes such a
--       leg first - B-43 proves it keeps doing so).
-- Vehicle = truck_id, or is_partner_trip AND partner_id (the same rule as B-01, 033 and 034).
-- Not counted, by design: a one-order RT left without a vehicle (it waits for the next assignment,
-- Q2); a matched pair cleared as a whole (owner amendment: both orders lose the truck, no sibling keeps
-- one); a VS leg that kept its own truck (034 never writes NULL onto a national load).
-- Value = number of legs; ids = their RT ids (ct_round_trips.id, like B-02/B-05 and the old B-43):
-- build_package (047) finds the RT's audit rows (trigger:rt_sync truck changes) by that id, while
-- ct_rt_legs audit rows are keyed sometimes by RT id, sometimes by leg id (measured 4/10).
--
-- Known blind spot until 059a, written down so that nobody reads a green B-43 as "RT-1193 cannot
-- happen": today trigger rt_sync copies a cleared vehicle onto the RT and onto every sibling order in
-- the SAME statement, so the RT-1193 end state (both orders without a truck) never shows up as (b).
-- B-43 sees (a) and (c) from day one and (b) once 059a stops the copy. Until then the RT-1193 path is
-- closed by the front fix (fix/unmatch-leg-first, main f896b588: leg removed before the vehicle) and
-- is visible only in audit_log.
--
-- Why UPDATE and not INSERT: B-43 exists in production since 27/9 (047b) as "active RT with a leg
-- without vehicle" (P3, F-15): 171 runs, 10 of them non-zero, one incident (resolved 28/9). The plan
-- (062a) redefines it in place, so the id, its results history and its incident key stay. The guard
-- refuses unless the row is EXACTLY the 047b row (fingerprint 1c60d29025b0867f030df24dfc1353e9, measured live
-- 4/10 ~20:30 Athens) or EXACTLY the new row (1afc44fa8c2c79ea59be6c12c6bed784; a re-run writes nothing). Any
-- other state means the row was edited by hand -> stop. The whole row is written: title, flows,
-- severity P3 -> P2, texts; entity stays ct_round_trips, schedule stays hourly, enabled stays true.
--
-- Measured read-only on production 4/10/2026 ~20:25-20:35 Athens (Supabase MCP, SELECT only), with the
-- EXACT sql_text and ids_sql below:
--   B-43 new = 0, ids {}   [(a) 0, (b) 0, (c) 0; 243 legs, 0 of them national; 128 live RTs]
--   B-43 old = 0           (last production run 20:07, green)
--   tms_check_runner has SELECT on ct_rt_legs, ct_round_trips, orders, national_loads (047 GRANT list).
--   production monitoring.check_sql_guard() accepts both texts (called read-only, it only raises).
-- Both statements pass tms-auditor lintSql (the same allow-list as monitoring.check_sql_guard) and run
-- on the PGlite fixture schema (npm test in tms-auditor). This block was run in PGlite on the 047b seed
-- of origin/main: applies, re-run is a no-op, a hand-edited row is refused, the rollback restores it;
-- with synthetic rows (a), (b) and (c) each turn it red with the RT id, while a one-order RT without a
-- vehicle, a pair cleared as a whole and a VS leg that kept its truck stay green.
--
-- Catalog (principle 3): tms-auditor/checks/B-43.sql is the source; 047b is regenerated from it
-- (checks/build-seed.mjs). The literal texts below are what checks/load.mjs parses from that file; the
-- two fingerprints are md5 of every column written, computed from the catalog file (new: this branch,
-- old: origin/main 6235895c). Edit the .sql file and the block refuses until both are rebuilt.
--
-- After the next hourly run (read-only):
-- SELECT check_id, run_at, value, status, ids, err FROM monitoring.results WHERE check_id = 'B-43'
--  ORDER BY run_at DESC LIMIT 3;

DO $do$
DECLARE
  fp_old constant text := '1c60d29025b0867f030df24dfc1353e9';   -- the 047b row of 27/9 (origin/main 6235895c), measured live 4/10
  fp_new constant text := '1afc44fa8c2c79ea59be6c12c6bed784';   -- tms-auditor/checks/B-43.sql of this branch
  fp_now text; v numeric; ids text[]; n_rows int; r record;
BEGIN
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '059z: monitoring.checks does not exist (047 must run first)';
  END IF;

  -- Guard: B-43 must hold EXACTLY the 047b row (apply) or EXACTLY the new row (re-run = no-op). Anything
  -- else means someone edited it by hand (enabled, severity, text...) and 059z must not overwrite that.
  SELECT md5(k.title||'|'||array_to_string(k.flows,',')||'|'||k.sql_text||'|'||coalesce(k.ids_sql,'')||'|'||coalesce(k.entity_table,'')
      ||'|'||k.red_op||'|'||k.red_value::text||'|'||coalesce(k.baseline::text,'')||'|'||k.severity||'|'||k.schedule_tag
      ||'|'||k.is_queue::text||'|'||coalesce(k.impact,'')||'|'||coalesce(k.next_step,'')||'|'||coalesce(k.exceptions,'')
      ||'|'||coalesce(k.tolerance,'')||'|'||k.enabled::text||'|'||coalesce(k.disabled_reason,'')) INTO fp_now
    FROM monitoring.checks k WHERE k.id = 'B-43';
  IF fp_now IS NULL THEN
    RAISE EXCEPTION '059z: B-43 does not exist in monitoring.checks (047b must run first)';
  ELSIF fp_now = fp_new THEN
    RAISE NOTICE '059z: B-43 already holds the new definition - nothing written';
  ELSIF fp_now <> fp_old THEN
    RAISE EXCEPTION '059z: B-43 is neither the 047b row nor the new one (fingerprint %) - edited by hand, stop', fp_now;
  ELSE
    -- Whole row: this is a redefinition (title, severity P3 -> P2, entity and texts all change).
    -- Greek texts are base64 so this file stays ASCII (pbcopy corrupted Greek on 27/9).
    UPDATE monitoring.checks SET
      title = convert_from(decode('zqPOus6tzrvOv8+CIM+Azr/PhSDPgM6xz4HOsc6yzrnOrM62zrXOuSDPhM6/IMKrz4DPgc+Oz4TOsSDOss6zzrHOr869zrXOuSDOsc+Az4wgz4TOvyBSVCwgzrzOtc+Ezqwgz4bOtc+NzrPOtc65IM+Ezr8gz4zPh863zrzOscK7', 'base64'), 'UTF8'),
      flows = ARRAY['F-15', 'F-17', 'F-07', 'F-08', 'F-23']::text[],
      sql_text = $m$SELECT count(*) FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id
 LEFT JOIN orders o ON o.id=l.order_id LEFT JOIN national_loads nl ON nl.id=l.nat_load_id
 WHERE r.status<>'cancelled'
 AND (coalesce(o.deleted_at, nl.deleted_at) IS NOT NULL OR coalesce(o.status, nl.status, '')='Cancelled'
  OR (l.order_id IS NOT NULL AND o.truck_id IS NULL AND NOT (coalesce(o.is_partner_trip,false) AND o.partner_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM ct_rt_legs l2 JOIN orders o2 ON o2.id=l2.order_id WHERE l2.rt_id=l.rt_id AND l2.id<>l.id AND o2.deleted_at IS NULL
    AND (o2.truck_id IS NOT NULL OR (coalesce(o2.is_partner_trip,false) AND o2.partner_id IS NOT NULL))))
  OR (l.nat_load_id IS NOT NULL AND nl.truck_id IS NULL AND NOT (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM ct_rt_legs l3 WHERE l3.rt_id=l.rt_id AND l3.id<>l.id)))$m$,
      ids_sql = $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT l.rt_id::text AS x FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id
 LEFT JOIN orders o ON o.id=l.order_id LEFT JOIN national_loads nl ON nl.id=l.nat_load_id
 WHERE r.status<>'cancelled'
 AND (coalesce(o.deleted_at, nl.deleted_at) IS NOT NULL OR coalesce(o.status, nl.status, '')='Cancelled'
  OR (l.order_id IS NOT NULL AND o.truck_id IS NULL AND NOT (coalesce(o.is_partner_trip,false) AND o.partner_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM ct_rt_legs l2 JOIN orders o2 ON o2.id=l2.order_id WHERE l2.rt_id=l.rt_id AND l2.id<>l.id AND o2.deleted_at IS NULL
    AND (o2.truck_id IS NOT NULL OR (coalesce(o2.is_partner_trip,false) AND o2.partner_id IS NOT NULL))))
  OR (l.nat_load_id IS NOT NULL AND nl.truck_id IS NULL AND NOT (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM ct_rt_legs l3 WHERE l3.rt_id=l.rt_id AND l3.id<>l.id))) LIMIT 50) s$m$,
      entity_table = 'ct_round_trips',
      red_op = '>',
      red_value = 0,
      baseline = NULL,
      severity = 'P2',
      schedule_tag = 'hourly',
      is_queue = false,
      impact = convert_from(decode('zqPOus6tzrvOv8+CIM+Azr/PhSDOtM61zr0gz4TPgc6tz4fOtc65IM+AzrnOsSDOvM61IM+Ezr8gz4TOsc6+zq/OtM65IM68zq3Ovc61zrkgzrzOrc+DzrEgz4TOv8+FOiDPhM6/IFJULCDPhM6/IFAmTCDOus6xzrkgzrcgzrzOuc+DzrjOv860zr/Pg86vzrEgz4TOvyDOvM61z4TPgc6/z43OvSwgzrrOsc65IM68zrnOsSDOsc67zrvOsc6zzq4gzr/Ph86uzrzOsc+Ezr/PgiDPgM61z4HOvc6sIM+DzrUgz4zOu86/IM+Ezr8gz4TOsc6+zq/OtM65ICjOvM6/z4TOr86yzr8gUlQtMTE5MywgMzAvOSku', 'base64'), 'UTF8'),
      next_step = convert_from(decode('zqTOsSBpZHMgzrXOr869zrHOuSBSVDogz4POtSDOus6xzrjOrc69zrEgzrTOtc+CIM+Azr/Ouc6/IM+DzrrOrc67zr/PgiDOtc6vzr3Osc65IM69zrXOus+Bz4wgzq4gz4fPic+Bzq/PgiDPjM+HzrfOvM6xIOKAlCDOss6zzrHOr869zrXOuSDOsc+Az4wgz4TOvyBSVCDOriDOvs6xzr3Osc+AzrHOr8+Bzr3Otc65IM+Mz4fOt868zrE7IM6Rz4DPjM+GzrHPg863IG93bmVyICjOsc69zqzOs869z4nPg863KS4=', 'base64'), 'UTF8'),
      exceptions = convert_from(decode('zpzOtc+Ez4HOrCDPg866zq3Ou863ICjPhM6xIGlkcyDOtc6vzr3Osc65IM+EzrEgUlQgz4TOv8+Fz4IpLCDPg861IM66zqzOuM61IHN0YXR1cyDOtc66z4TPjM+CIM6xz4DPjCBjYW5jZWxsZWQuIM6kz4HOtc65z4Igz4DOtc+BzrnPgM+Ez47Pg861zrnPgjogKM6xKSDPg866zq3Ou86/z4IgzrHOus+Fz4HPic68zq3Ovc63z4IvzrTOuc6xzrPPgc6xzrzOvM6tzr3Ot8+CIM+AzrHPgc6xzrPOs861zrvOr86xz4Igzq4gz4bOv8+Bz4TOr86/z4XCtyAozrIpIM+AzrHPgc6xzrPOs861zrvOr86xIM+Hz4nPgc6vz4Igz4zPh863zrzOsSDOtM6vz4DOu86xIM+DzrUgz4DOsc+BzrHOs86zzrXOu86vzrEgzrzOtSDPjM+HzrfOvM6xwrcgKM6zKSDOtc64zr3Ouc66z4wgz4bOv8+Bz4TOr86/IM+Hz4nPgc6vz4Igz4zPh863zrzOsSDPg861IFJUIM68zrUgzqzOu867zrEgz4POus6tzrvOty4gzozPh863zrzOsSA9IM+Gzr/Pgc+EzrfOs8+MIM6uIM+Dz4XOvc61z4HOs86sz4TOt8+CIM68zrUgaXNfcGFydG5lcl90cmlwICjOr860zrnOv8+CIM66zrHOvc+Mzr3Osc+CIM68zrUgQi0wMS8wMzMvMDM0KS4gzpTOlc6dIM68zrXPhM+Bzr/Pjc69OiBSVCDOvM6vzrHPgiDPgM6xz4HOsc6zzrPOtc67zq/Osc+CIM+Azr/PhSDPgM61z4HOuc68zq3Ovc61zrkgzr3Orc6/IM+Mz4fOt868zrEsIM+EzrHOr8+BzrnOsc+DzrzOsSDPgM6/z4UgzrrOsc64zrHPgc6vz4PPhM63zrrOtSDOv867z4zOus67zrfPgc6/IChvd25lciA0LzEwOiDPhs61z43Os861zrkgzrrOsc65IM6xz4DPjCDPhM65z4IgzrTPjc6/KSwgz4POus6tzrvOv8+CIFZTIM+Azr/PhSDOus+BzqzPhM63z4POtSDPhM6/IM+Gzr/Pgc+EzrfOs8+MIM+Ezr/PhS4gzqnPgiDPhM6/IDA1OWEgzrcgzrLOrM+DzrcgzrHOvc+EzrnOs8+BzqzPhs61zrkgz4TOvyDOus61zr3PjCDPjM+HzrfOvM6xIM+Dz4TOuc+CIM6xzrTOtc67z4bOrc+CIM+AzrHPgc6xzrPOs861zrvOr861z4IsIM6/z4DPjM+EzrUgz4TOvyAozrIpIM60zrXOvSDPhs6xzq/Ovc61z4TOsc65IM6xzrrPjM68zrcu', 'base64'), 'UTF8'),
      tolerance = NULL,
      enabled = true,
      disabled_reason = NULL
     WHERE id = 'B-43';
    GET DIAGNOSTICS n_rows = ROW_COUNT;
    IF n_rows <> 1 THEN RAISE EXCEPTION '059z: B-43 updated % rows', n_rows; END IF;
  END IF;

  -- Proof 1: what is stored is the catalog row, field for field.
  SELECT md5(k.title||'|'||array_to_string(k.flows,',')||'|'||k.sql_text||'|'||coalesce(k.ids_sql,'')||'|'||coalesce(k.entity_table,'')
      ||'|'||k.red_op||'|'||k.red_value::text||'|'||coalesce(k.baseline::text,'')||'|'||k.severity||'|'||k.schedule_tag
      ||'|'||k.is_queue::text||'|'||coalesce(k.impact,'')||'|'||coalesce(k.next_step,'')||'|'||coalesce(k.exceptions,'')
      ||'|'||coalesce(k.tolerance,'')||'|'||k.enabled::text||'|'||coalesce(k.disabled_reason,'')) INTO fp_now
    FROM monitoring.checks k WHERE k.id = 'B-43';
  IF fp_now IS DISTINCT FROM fp_new THEN
    RAISE EXCEPTION '059z proof: B-43 fingerprint % <> catalog %', fp_now, fp_new;
  END IF;
  -- Proof 2: the check runs the way run_checks (047) runs it: guard, 10 s timeout, as tms_check_runner
  -- (SELECT only), so a missing GRANT or a refused function fails HERE and not at 06:07 on Monday.
  -- Texts are read before the role switch (tms_check_runner cannot read schema monitoring).
  SELECT sql_text, ids_sql INTO r FROM monitoring.checks WHERE id = 'B-43';
  PERFORM monitoring.check_sql_guard(r.sql_text);
  PERFORM monitoring.check_sql_guard(r.ids_sql);
  PERFORM set_config('statement_timeout', '10000', true);
  SET LOCAL ROLE tms_check_runner;
  EXECUTE r.sql_text INTO v;
  EXECUTE r.ids_sql INTO ids;
  RESET ROLE;
  IF v IS NULL THEN RAISE EXCEPTION '059z proof: B-43 returned NULL'; END IF;
  -- A non-zero value is NOT a reason to refuse: it is the check doing its job (a real leg to look at).
  -- The value is handed to the result row below (the editor shows the grid, not NOTICEs).
  PERFORM set_config('tms.b43_059z', v::text || ' ' || coalesce(array_to_string(ids, ','), ''), false);
  RAISE NOTICE '059z OK: B-43 = % (RT ids %)', v, coalesce(array_to_string(ids, ','), '');
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
-- Expect: result = '059z OK', severity P2, enabled true, b43_now = '0 ' (value, then RT ids if any).
SELECT CASE WHEN md5(k.title||'|'||array_to_string(k.flows,',')||'|'||k.sql_text||'|'||coalesce(k.ids_sql,'')||'|'||coalesce(k.entity_table,'') ||'|'||k.red_op||'|'||k.red_value::text||'|'||coalesce(k.baseline::text,'')||'|'||k.severity||'|'||k.schedule_tag ||'|'||k.is_queue::text||'|'||coalesce(k.impact,'')||'|'||coalesce(k.next_step,'')||'|'||coalesce(k.exceptions,'') ||'|'||coalesce(k.tolerance,'')||'|'||k.enabled::text||'|'||coalesce(k.disabled_reason,'')) = '1afc44fa8c2c79ea59be6c12c6bed784'
            THEN '059z OK' ELSE '059z NOT APPLIED' END AS result,
       k.severity, k.schedule_tag, k.enabled, current_setting('tms.b43_059z', true) AS b43_now
  FROM monitoring.checks k WHERE k.id = 'B-43';
