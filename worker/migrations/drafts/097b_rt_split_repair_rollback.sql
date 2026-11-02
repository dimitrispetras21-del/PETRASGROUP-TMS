-- 097b ROLLBACK: each import leg goes back to its own round trip, as measured 2/11 before 097b.
-- RT-1283 back to planned (no closed_at), RT-1242 back to closed (closed_at 19/10 05:14:43.74223+00), both notes
-- back to NULL (measured NULL 2/11). Each kept round trip takes its dates from its own leg again (rt_recompute) and
-- RT-1278 closes again by 046 (its one leg, #602, is Delivered). The payroll line soft-deleted by 097b stays
-- deleted: un-cancelling the round trip makes dl_sync_from_rt open a NEW empty line for its driver (same content:
-- no amounts were allowed on it by 097b's guard).
-- WHEN: only on the owner's word, after 15:00. Run 097's rollback FIRST if 097 must go too: with 097 in place a
-- later truck write to one of these orders would merge the pair again (that is 097 working, not a failure).
-- BEFORE IT: 097b_rt_split_repair_rollback_dryrun.sql (generated, undone).
-- EXPECTED: NOTICE "097b ROLLBACK OK: 2 pairs split back ..." and ONE result row "097b ROLLED BACK | 2".
-- THIS FILE IS ASCII ONLY. ONE DO block, then ONE read-only SELECT.

DO $do$
DECLARE
  pairs CONSTANT jsonb := '[{"keep":280,"drop":285,"exp":602,"imp":606,"status":"planned","closed_at":null},{"keep":242,"drop":244,"exp":525,"imp":528,"status":"closed","closed_at":"2026-10-19 05:14:43.74223+00"}]';
  p jsonb; k ct_round_trips%rowtype; d ct_round_trips%rowtype; done int := 0; n int;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  PERFORM set_config('lock_timeout', '5s', true);
  FOR p IN SELECT * FROM jsonb_array_elements(pairs) LOOP
    SELECT * INTO k FROM ct_round_trips WHERE id = (p->>'keep')::bigint FOR UPDATE;
    SELECT * INTO d FROM ct_round_trips WHERE id = (p->>'drop')::bigint FOR UPDATE;
    -- GUARDS: the state 097b left, nothing added since
    IF d.status <> 'cancelled' OR position('097b:' IN coalesce(d.notes, '')) = 0 OR k.status = 'cancelled'
       OR EXISTS (SELECT 1 FROM ct_rt_legs WHERE rt_id = d.id)
       OR (SELECT count(*) FROM ct_rt_legs WHERE rt_id = k.id) <> 2
       OR NOT EXISTS (SELECT 1 FROM ct_rt_legs WHERE rt_id = k.id AND order_id = (p->>'exp')::bigint AND direction = 'EXPORT')
       OR NOT EXISTS (SELECT 1 FROM ct_rt_legs WHERE rt_id = k.id AND order_id = (p->>'imp')::bigint AND direction = 'IMPORT')
       OR k.truck_id IS DISTINCT FROM d.truck_id THEN
      RAISE EXCEPTION '097b rollback: pair % is not as 097b left it (% cancelled by 097b, % holding exactly the two legs, same truck) - stop', p, d.code, k.code;
    END IF;
    -- 1. the import's round trip comes back first (empty for a moment: its status is set while it has no leg, so
    --    rt_status_guard lets "closed" through), then the leg moves back
    UPDATE ct_round_trips SET status = p->>'status', closed_at = (p->>'closed_at')::timestamptz, notes = NULL, updated_at = now()
     WHERE id = d.id;
    UPDATE ct_rt_legs SET rt_id = d.id, seq = 1 WHERE rt_id = k.id AND order_id = (p->>'imp')::bigint;
    PERFORM rt_recompute(k.id);
    PERFORM rt_recompute(d.id);
    PERFORM rt_sync_audit('update', 'ct_round_trips', d.id::text, jsonb_build_object('status', 'cancelled'),
      jsonb_build_object('status', p->>'status', 'leg_order', (p->>'imp')::bigint, 'from_rt', k.id, 'reason', '097b rollback: split back as measured 2/11'));
    -- 2. PROOFS
    IF NOT EXISTS (SELECT 1 FROM ct_rt_legs WHERE rt_id = d.id AND order_id = (p->>'imp')::bigint)
       OR (SELECT count(*) FROM ct_rt_legs WHERE rt_id = k.id) <> 1
       OR (SELECT status FROM ct_round_trips WHERE id = d.id) <> p->>'status'
       OR (SELECT count(*) FROM dl_entries WHERE rt_id = d.id AND deleted_at IS NULL) <> 1 THEN
      RAISE EXCEPTION '097b rollback proof: pair % did not split back (leg, status, or one live payroll line on %)', p, d.code;
    END IF;
    done := done + 1;
  END LOOP;
  SELECT count(*) INTO n FROM orders ex
    JOIN orders im ON im.legacy_id = ex.matched_import_id AND im.deleted_at IS NULL
    JOIN ct_rt_legs le ON le.order_id = ex.id JOIN ct_round_trips re ON re.id = le.rt_id AND re.status <> 'cancelled'
    JOIN ct_rt_legs li ON li.order_id = im.id JOIN ct_round_trips ri ON ri.id = li.rt_id AND ri.status <> 'cancelled'
   WHERE ex.deleted_at IS NULL AND re.id <> ri.id;
  RAISE NOTICE '097b ROLLBACK OK: % pairs split back as measured 2/11; split pairs now %', done, n;
END $do$;

SELECT CASE WHEN (SELECT count(*) FROM ct_rt_legs WHERE (order_id, rt_id) IN ((606, 285), (528, 244))) = 2
            THEN '097b ROLLED BACK' ELSE '097b STILL IN PLACE' END AS result,
       (SELECT count(*) FROM orders ex
          JOIN orders im ON im.legacy_id = ex.matched_import_id AND im.deleted_at IS NULL
          JOIN ct_rt_legs le ON le.order_id = ex.id JOIN ct_round_trips re ON re.id = le.rt_id AND re.status <> 'cancelled'
          JOIN ct_rt_legs li ON li.order_id = im.id JOIN ct_round_trips ri ON ri.id = li.rt_id AND ri.status <> 'cancelled'
         WHERE ex.deleted_at IS NULL AND re.id <> ri.id) AS split_pairs;
