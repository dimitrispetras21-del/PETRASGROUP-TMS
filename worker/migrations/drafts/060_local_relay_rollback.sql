-- 060 ROLLBACK - puts back exactly what existed before 060 (definitions read from production
-- on 4/10, verbatim) and removes everything 060 created. DRAFT - NOT EXECUTED.
-- ASCII only. ONE DO block (all or nothing) + one read-only result SELECT.
--
-- Refuses (and changes nothing) once 060 holds data a rollback would erase silently: relays or
-- payroll lines of local drivers (principle 1). Those need an owner decision first - never force
-- this file past its guards.
-- Proven on the local PGlite copy of production: 060 -> rollback -> the md5 of
-- order_soft_delete_unlink and dl_v_entries are again the 4/10 values, B-09 is again the 4/10
-- text, the trigger count and B-54 are back, and 060 can run again.
DO $do$
DECLARE n int; k int; trg_before int; trg_after int; view_acl text[]; view_acl_items aclitem[]; g record;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);

  -- 0. GUARDS
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                  AND table_name = 'local_moves' AND column_name = 'move_kind') THEN
    RAISE EXCEPTION '060 rollback: 060 is not applied';
  END IF;
  SELECT count(*) INTO n FROM public.local_moves WHERE move_kind <> 'local';
  IF n > 0 THEN
    RAISE EXCEPTION '060 rollback: % relays exist - rolling back erases who did the local part; owner decision first', n;
  END IF;
  SELECT count(*) INTO n FROM public.dl_entries WHERE local_move_id IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '060 rollback: % payroll lines belong to local drivers - owner decision first', n;
  END IF;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before) THEN
    RAISE EXCEPTION '060 rollback: B-54 red_value is not the live trigger count % - re-measure', trg_before;
  END IF;
  SELECT relacl INTO view_acl_items FROM pg_class WHERE oid = 'public.dl_v_entries'::regclass;
  SELECT array_agg(a::text ORDER BY a::text) INTO view_acl FROM unnest(view_acl_items) a;

  -- 1. AUDITOR back to 4/10. Open incidents of the removed checks are closed first: incidents has
  --    no foreign key to checks, so they would stay open in the report for a check that is gone.
  --    'confirmed' too - the check that a human confirmed no longer exists.
  UPDATE monitoring.incidents SET state = 'resolved', resolved_verified_at = clock_timestamp(),
         state_changed_by = '060 rollback (check removed)', state_changed_at = clock_timestamp()
   WHERE state IN ('new', 'confirmed', 'recurred')
     AND (check_id IN ('B-63', 'B-64', 'B-65')
          OR incident_key IN ('MECH:check:B-63', 'MECH:check:B-64', 'MECH:check:B-65',
                              'MECH:stale:B-63', 'MECH:stale:B-64', 'MECH:stale:B-65'));
  -- results next: monitoring.results references monitoring.checks
  DELETE FROM monitoring.results WHERE check_id IN ('B-63', 'B-64', 'B-65');
  DELETE FROM monitoring.checks WHERE id IN ('B-63', 'B-64', 'B-65');
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 3 THEN RAISE EXCEPTION '060 rollback: % of 3 checks deleted', k; END IF;
  UPDATE monitoring.checks SET
    sql_text = $m$SELECT count(*) FROM dl_entries d WHERE d.entry_type='trip' AND d.source='auto' AND d.deleted_at IS NULL
 AND (d.rt_id IS NULL OR EXISTS (SELECT 1 FROM ct_round_trips r WHERE r.id=d.rt_id AND r.status='cancelled'))$m$,
    ids_sql = $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT d.id::text AS x FROM dl_entries d WHERE d.entry_type='trip' AND d.source='auto' AND d.deleted_at IS NULL
 AND (d.rt_id IS NULL OR EXISTS (SELECT 1 FROM ct_round_trips r WHERE r.id=d.rt_id AND r.status='cancelled')) LIMIT 50) s$m$,
    exceptions = convert_from(decode('c291cmNlPSdleGNlbCcgKM65z4PPhM6/z4HOuc66z4wgNi85KSDPgM6/z4TOrS4=', 'base64'), 'UTF8')
   WHERE id = 'B-09' AND md5(sql_text) = '8be3476c69ef6dba15c0778a2b318ec8' AND md5(ids_sql) = 'f511f0a106d53b6b85d4f4dd04c34979';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '060 rollback: B-09 is not the 060 text (% rows) - edited by hand, stop', k; END IF;

  -- 2. TRIGGERS and the 023 text
  DROP TRIGGER dl_local_line_guard ON public.dl_entries;
  DROP TRIGGER dl_sync_from_local_move ON public.local_moves;
  DROP TRIGGER local_moves_follow_order ON public.orders;
  DROP TRIGGER local_moves_before ON public.local_moves;
CREATE OR REPLACE FUNCTION public.order_soft_delete_unlink()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
  procedure_note text := 'order ' || new.id || ' deleted';
begin
  if new.legacy_id is not null then
    for r in update orders o set matched_import_id = null
             where o.matched_import_id = new.legacy_id and o.deleted_at is null returning o.id loop
      insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
      values ('trigger:order_unlink', 'system', 'update', 'orders', r.id::text,
              jsonb_build_object('matched_import_id', new.legacy_id),
              jsonb_build_object('matched_import_id', null, 'reason', 'matched import ' || procedure_note), now());
    end loop;
    for r in update orders o set rotation_id = null
             where o.rotation_id = new.legacy_id and o.deleted_at is null returning o.id loop
      insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
      values ('trigger:order_unlink', 'system', 'update', 'orders', r.id::text,
              jsonb_build_object('rotation_id', new.legacy_id),
              jsonb_build_object('rotation_id', null, 'reason', 'rotation parent ' || procedure_note), now());
    end loop;
  end if;
  for r in update orders o set deleted_at = new.deleted_at
           where o.parent_order_id = new.id and o.deleted_at is null returning o.id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'delete', 'orders', r.id::text,
            jsonb_build_object('parent_order_id', new.id), jsonb_build_object('reason', 'split parent ' || procedure_note), now());
  end loop;
  for r in delete from ct_rt_legs l using ct_round_trips rt
           where l.order_id = new.id and rt.id = l.rt_id and rt.status <> 'closed'
           returning l.rt_id, rt.code loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'delete', 'ct_rt_legs', r.rt_id::text,
            jsonb_build_object('order_id', new.id, 'rt', r.code), jsonb_build_object('reason', procedure_note), now());
    update ct_round_trips set status = 'cancelled'
      where id = r.rt_id and status <> 'closed'
        and not exists (select 1 from ct_rt_legs l2 where l2.rt_id = r.rt_id);
  end loop;
  for r in update partner_assignments pa set deleted_at = new.deleted_at
           where pa.order_id = new.id and pa.deleted_at is null returning pa.id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'delete', 'partner_assignments', r.id::text,
            jsonb_build_object('order_id', new.id), jsonb_build_object('reason', procedure_note), now());
  end loop;
  return null;
end $function$;

  -- 3. THE LEDGER VIEW: a column cannot be removed by CREATE OR REPLACE, so drop and recreate
  --    with the 4/10 text, then put back exactly the grants it had (default ACLs differ by role).
  DROP VIEW public.dl_v_entries;
  CREATE VIEW public.dl_v_entries WITH (security_invoker=true) AS
 SELECT e.id,
    e.driver_id,
    e.entry_type,
    e.entry_date,
    e.date_end,
    e.rt_id,
    rt.code AS rt_code,
    COALESCE(e.route, rr.route_text, rt.code) AS route_text,
    e.trip_value,
    e.advance,
    e.expenses,
    e.amount,
    e.balance_delta,
    e.source,
    e.import_batch,
    e.needs_review,
    e.review_note,
    e.note,
    e.deleted_at,
    e.deleted_reason,
    e.created_by,
    e.created_at,
    e.updated_at,
    (e.deleted_at IS NOT NULL) AS cancelled,
    ((e.entry_type = 'trip'::text) AND (e.trip_value IS NULL) AND (e.deleted_at IS NULL)) AS pending,
    sum(
        CASE
            WHEN (e.deleted_at IS NULL) THEN e.balance_delta
            ELSE (0)::numeric
        END) OVER (PARTITION BY e.driver_id ORDER BY e.entry_date, e.id ROWS UNBOUNDED PRECEDING) AS running_balance,
        CASE
            WHEN (e.route IS NULL) THEN rr.route_legs
            ELSE NULL::jsonb
        END AS route_legs,
    (COALESCE(c.n, (0)::bigint))::integer AS cash_lines,
    COALESCE(c.s, (0)::numeric) AS cash_sum,
    e.expenses_auto
   FROM (((dl_entries e
     LEFT JOIN ct_round_trips rt ON ((rt.id = e.rt_id)))
     LEFT JOIN dl_v_rt_route rr ON ((rr.rt_id = e.rt_id)))
     LEFT JOIN LATERAL ( SELECT count(*) AS n,
            sum((l.net + COALESCE(l.vat, (0)::numeric))) AS s
           FROM ct_cost_lines l
          WHERE ((l.rt_id = e.rt_id) AND (l.pay_source = 'CASH'::text))) c ON ((e.rt_id IS NOT NULL)));
  REVOKE ALL ON public.dl_v_entries FROM PUBLIC, anon, authenticated, service_role;
  FOR g IN SELECT a.grantee, a.privilege_type FROM aclexplode(view_acl_items) a
            WHERE a.grantee <> (SELECT relowner FROM pg_class WHERE oid = 'public.dl_v_entries'::regclass) LOOP
    EXECUTE format('GRANT %s ON public.dl_v_entries TO %s', g.privilege_type,
                   CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE g.grantee::regrole::text END);
  END LOOP;

  -- 4. FUNCTIONS, INDEXES, CONSTRAINTS, COLUMNS
  DROP FUNCTION public.dl_local_line_guard();
  DROP FUNCTION public.dl_sync_from_local_move();
  DROP FUNCTION public.dl_local_day_sync(bigint, date);
  DROP FUNCTION public.local_moves_follow_order();
  DROP FUNCTION public.local_moves_before();
  DROP INDEX public.dl_local_day_live;
  ALTER TABLE public.dl_entries DROP CONSTRAINT dl_one_origin, DROP CONSTRAINT dl_lm_is_trip,
    DROP COLUMN local_move_id;                      -- its FK goes with the column
  DROP INDEX public.local_moves_relay_once;
  ALTER TABLE public.local_moves
    DROP CONSTRAINT local_moves_kind_chk, DROP CONSTRAINT local_moves_kind_parent,
    DROP CONSTRAINT local_moves_relay_points, DROP CONSTRAINT local_moves_relay_status,
    DROP CONSTRAINT local_moves_relay_executor, DROP CONSTRAINT local_moves_relay_trailer,
    DROP COLUMN move_kind;

  -- 5. B-54 back to the count without 060's 4 triggers
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before - 4 THEN
    RAISE EXCEPTION '060 rollback proof: trigger count % -> % (expected -4)', trg_before, trg_after;
  END IF;
  UPDATE monitoring.checks SET red_value = trg_after WHERE id = 'B-54' AND red_value = trg_before;
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '060 rollback: B-54 not updated'; END IF;

  -- 6. PROOFS: back to the 4/10 fingerprints
  IF md5(pg_get_functiondef('public.order_soft_delete_unlink()'::regprocedure)) <> '7b873ab86adbfb2db10590e0c47f87bc' THEN
    RAISE EXCEPTION '060 rollback proof: order_soft_delete_unlink is not the 4/10 text';
  END IF;
  IF md5(pg_get_viewdef('public.dl_v_entries'::regclass)) <> 'c81a268c7312574d10da6c78ef316326' THEN
    RAISE EXCEPTION '060 rollback proof: dl_v_entries is not the 4/10 text';
  END IF;
  IF (SELECT array_agg(a::text ORDER BY a::text) FROM pg_class c, unnest(c.relacl) a WHERE c.oid = 'public.dl_v_entries'::regclass)
     IS DISTINCT FROM view_acl THEN
    RAISE EXCEPTION '060 rollback proof: dl_v_entries grants differ from before';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-09' AND md5(sql_text) = 'b8f8d0e705f8466a3f6305c9e38c544f' AND md5(ids_sql) = 'b96ff398c369f06b6eb9c99d343e155c' AND md5(exceptions) = 'f93a59943f94028e83cc5f9ca2d67495') THEN
    RAISE EXCEPTION '060 rollback proof: B-09 is not the 4/10 text';
  END IF;
  IF EXISTS (SELECT 1 FROM monitoring.incidents WHERE state IN ('new', 'confirmed', 'recurred')
              AND (check_id IN ('B-63', 'B-64', 'B-65')
                   OR incident_key IN ('MECH:check:B-63', 'MECH:check:B-64', 'MECH:check:B-65',
                                       'MECH:stale:B-63', 'MECH:stale:B-64', 'MECH:stale:B-65'))) THEN
    RAISE EXCEPTION '060 rollback proof: an incident of B-63..B-65 is still open';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
              AND ((table_name = 'local_moves' AND column_name = 'move_kind')
                OR (table_name = 'dl_entries' AND column_name = 'local_move_id'))) THEN
    RAISE EXCEPTION '060 rollback proof: a 060 column survived';
  END IF;
  RAISE NOTICE '060 ROLLBACK OK: triggers % -> %, B-54 = %', trg_before, trg_after, trg_after;
END $do$;

SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                              AND table_name = 'local_moves' AND column_name = 'move_kind')
             AND NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id IN ('B-63', 'B-64', 'B-65'))
            THEN '060 ROLLED BACK' ELSE '060 STILL APPLIED' END AS result,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       md5(pg_get_viewdef('public.dl_v_entries'::regclass)) AS dl_v_entries_md5,
       md5(pg_get_functiondef('public.order_soft_delete_unlink()'::regprocedure)) AS unlink_md5;
