-- 104 - PALLETS WEEK: THE "ELEGXTHIKE" MARK (owner 2/11/2026 "Nai"), BORN CLOSED, 0 ROWS.
--
-- Design: docs/design/pallets-weekly-view-2026-11-02.md, round 4, point 7 (PR #246, approved 3/11).
-- Number 104: 103 is reserved (the swap / EPOMENA work), 102 ran 2/11.
-- The owner runs it in the Supabase SQL editor AFTER 15:00 (the team works 05:30-14:30), with an explicit yes,
-- one step at a time:
--   1. 104_pl_week_checks_dryrun.sql   this block + a deliberate error: NOTHING kept
--   2. 104_pl_week_checks.sql          (this file)
--   3. 104_pl_week_checks_verify.sql   read-only, one row
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
--
-- WHAT IT ADDS (and nothing else: no row of an existing table is written but B-54's)
--   * table pl_week_checks: one row per "checked" act. week_start = the TMS week's Saturday. checked_by = the
--     JWT's sub (the Worker passes it, never the request body). snap = the week AS IT WAS when checked:
--     {moves: [{id, taken, given, status, counterparty_type, client_id, partner_id, location_id}] read HERE from
--     pl_movements (never numbers from the browser), missing_stops: [stop ids], missing_from: 'browser'}.
--     Undo = undone_by / undone_at, never a delete. ONE live mark per week = a UNIQUE index (principle 4);
--   * 3 acts, SECURITY DEFINER, EXECUTE to service_role only:
--       pl_week_check(p, actor, role)          mark a week; with again=true the live mark is undone and a new one
--                                              written in the SAME transaction (both or neither);
--       pl_week_uncheck(p, actor, role)        undo a live mark;
--       pl_week_check_changes(p, actor, role)  what changed since the mark, per movement (read);
--     the acts write their own audit_log rows (create = a mark, update = an undo) through plan_h_audit, the one
--     audit writer of the plan functions: a failed audit fails the act (no mark without a trace);
--   * 1 trigger (B-54 +1): a hard DELETE on pl_week_checks is refused (plan_draft_no_delete, 102's function);
--   * born closed: RLS on, SELECT only to service_role / tms_reader / tms_check_runner, policy monitor_read for the
--     two auditor roles (D-14), no INSERT / UPDATE / DELETE for any API role: writes only through the acts.
-- REFUSALS: SQLSTATE 23514, HINT 'plw:<code>' (the Worker's Greek texts are in PLW_RULE_TEXT): role, week,
--   no_moves, bad_ids, already, gone.
-- REVERSE: 104_pl_week_checks_rollback.sql.
-- EXPECTED: NOTICE "104 OK: ..." and ONE row: result = '104 OK', tables = 1, acts = 3,
--   public_triggers = <before + 1> = b54_red_value.

DO $do$
DECLARE
  v_sig text; v_trg0 int; v_trg1 int; v_k bigint;
  c_acts CONSTANT text[] := ARRAY['public.pl_week_check(jsonb,text,text)', 'public.pl_week_uncheck(jsonb,text,text)',
    'public.pl_week_check_changes(jsonb,text,text)'];
  c_helpers CONSTANT text[] := ARRAY['public.plw_h_raise(text,text)', 'public.plw_h_json(jsonb)'];
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('search_path', 'public', true);

  -- ===== PART 0: GUARDS (nothing written before them) =====
  IF to_regclass('public.pl_week_checks') IS NOT NULL THEN
    RAISE EXCEPTION '104: pl_week_checks already exists - 104 has run, nothing to do';
  END IF;
  IF to_regprocedure('public.plan_h_audit(text,text,text,text,text,jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.plan_draft_no_delete()') IS NULL THEN
    RAISE EXCEPTION '104: plan_h_audit (072) or plan_draft_no_delete (102) is missing - stop';
  END IF;
  IF to_regclass('public.pl_movements') IS NULL OR to_regclass('public.audit_log') IS NULL OR to_regclass('public.app_errors') IS NULL THEN
    RAISE EXCEPTION '104: pl_movements / audit_log / app_errors missing - stop';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'tms_reader', 'tms_check_runner')) <> 5 THEN
    RAISE EXCEPTION '104: an API or auditor role is missing - stop';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value::int = v_trg0 AND baseline IS NULL) THEN
    RAISE EXCEPTION '104: B-54 red_value is not the live trigger count % - re-measure', v_trg0;
  END IF;

  -- ===== PART 1: THE TABLE =====
  CREATE TABLE public.pl_week_checks (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    week_start   date NOT NULL CHECK (extract(isodow FROM week_start) = 6),
    checked_by   text NOT NULL CHECK (length(checked_by) > 0),
    checked_role text NOT NULL,
    checked_at   timestamptz NOT NULL DEFAULT now(),
    snap         jsonb NOT NULL CHECK (jsonb_typeof(snap -> 'moves') = 'array'),
    undone_by    text,
    undone_at    timestamptz,
    CHECK ((undone_by IS NULL) = (undone_at IS NULL))
  );
  CREATE UNIQUE INDEX pl_week_checks_live ON public.pl_week_checks (week_start) WHERE undone_at IS NULL;
  CREATE INDEX pl_week_checks_week ON public.pl_week_checks (week_start, checked_at DESC);
  CREATE TRIGGER pl_week_checks_no_delete BEFORE DELETE ON public.pl_week_checks
    FOR EACH ROW EXECUTE FUNCTION public.plan_draft_no_delete();

  -- ===== PART 2: CLOSED HELPERS =====
  CREATE FUNCTION public.plw_h_raise(p_code text, p_detail text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
  begin
    -- Same shape as plan_h_raise, its own prefix: the Worker maps 'plw:<code>' to a Greek 422 / 409.
    raise exception 'plw rule broken: %:%', p_code, coalesce(p_detail, '')
      using errcode = '23514', hint = 'plw:' || p_code;
  end $f$;

  -- The Worker's audit() stores JSON.stringify(...) into the jsonb column, so its rows hold a jsonb STRING;
  -- plan_h_audit stores an object. Read both the same way.
  CREATE FUNCTION public.plw_h_json(x jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE SET search_path = public AS $f$
    SELECT CASE WHEN x IS NULL THEN NULL WHEN jsonb_typeof(x) = 'string' THEN (x #>> '{}')::jsonb ELSE x END
  $f$;

  -- ===== PART 3: THE ACTS =====
  -- p = {week_start, movement_ids:[...], missing_stop_ids:[...], empty_week:bool, again:bool}
  CREATE FUNCTION public.pl_week_check(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  DECLARE
    v_week date; v_ids bigint[]; v_n int; v_found int; v_live pl_week_checks%ROWTYPE; v_new pl_week_checks%ROWTYPE; v_moves jsonb;
  BEGIN
    -- Principle 4: the role rule lives here too, not only in the Worker's PL_PERMS.
    IF p_role IS NULL OR p_role NOT IN ('owner', 'accountant') THEN PERFORM plw_h_raise('role', p_role); END IF;
    IF p_actor IS NULL OR length(p_actor) = 0 THEN PERFORM plw_h_raise('role', 'no actor'); END IF;
    BEGIN v_week := (p ->> 'week_start')::date; EXCEPTION WHEN others THEN v_week := NULL; END;
    IF v_week IS NULL OR extract(isodow FROM v_week) <> 6 THEN PERFORM plw_h_raise('week', p ->> 'week_start'); END IF;
    IF jsonb_typeof(coalesce(p -> 'movement_ids', '[]'::jsonb)) <> 'array' THEN PERFORM plw_h_raise('bad_ids', 'not a list'); END IF;
    v_n := jsonb_array_length(coalesce(p -> 'movement_ids', '[]'::jsonb));
    SELECT coalesce(array_agg(DISTINCT x::bigint), '{}') INTO v_ids
      FROM jsonb_array_elements_text(coalesce(p -> 'movement_ids', '[]'::jsonb)) x WHERE x ~ '^[0-9]{1,18}$';
    IF v_n <> cardinality(v_ids) THEN PERFORM plw_h_raise('bad_ids', 'not numeric or repeated'); END IF;
    -- An empty list is accepted only when the screen says the week is empty: a browser bug must not store half a
    -- snapshot in silence.
    IF v_n = 0 AND coalesce((p ->> 'empty_week')::boolean, false) IS NOT TRUE THEN
      PERFORM plw_h_raise('no_moves', v_week::text);
    END IF;
    SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'taken', m.taken, 'given', m.given, 'status', m.status,
             'counterparty_type', m.counterparty_type, 'client_id', m.client_id, 'partner_id', m.partner_id,
             'location_id', m.location_id) ORDER BY m.id), '[]'::jsonb)
      INTO v_found, v_moves
      FROM pl_movements m WHERE m.id = ANY (v_ids);
    IF v_found <> v_n THEN PERFORM plw_h_raise('bad_ids', (v_n - v_found)::text || ' not found'); END IF;

    SELECT * INTO v_live FROM pl_week_checks WHERE week_start = v_week AND undone_at IS NULL FOR UPDATE;
    IF FOUND THEN
      IF coalesce((p ->> 'again')::boolean, false) IS NOT TRUE THEN PERFORM plw_h_raise('already', v_live.id::text); END IF;
      UPDATE pl_week_checks SET undone_by = p_actor, undone_at = now() WHERE id = v_live.id;
      PERFORM plan_h_audit(p_actor, p_role, 'update', 'pl_week_checks', v_live.id::text, to_jsonb(v_live),
        (SELECT to_jsonb(c) FROM pl_week_checks c WHERE c.id = v_live.id));
    END IF;

    INSERT INTO pl_week_checks (week_start, checked_by, checked_role, snap)
    VALUES (v_week, p_actor, p_role, jsonb_build_object('moves', v_moves,
            'missing_stops', coalesce(p -> 'missing_stop_ids', '[]'::jsonb), 'missing_from', 'browser'))
    RETURNING * INTO v_new;
    PERFORM plan_h_audit(p_actor, p_role, 'create', 'pl_week_checks', v_new.id::text, NULL, to_jsonb(v_new));
    RETURN (to_jsonb(v_new) - 'snap') || jsonb_build_object('moves', v_found);
  END $f$;

  -- p = {id}
  CREATE FUNCTION public.pl_week_uncheck(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  DECLARE v_row pl_week_checks%ROWTYPE; v_after pl_week_checks%ROWTYPE;
  BEGIN
    IF p_role IS NULL OR p_role NOT IN ('owner', 'accountant') THEN PERFORM plw_h_raise('role', p_role); END IF;
    IF coalesce(p ->> 'id', '') !~ '^[0-9]{1,18}$' THEN PERFORM plw_h_raise('gone', p ->> 'id'); END IF;
    SELECT * INTO v_row FROM pl_week_checks WHERE id = (p ->> 'id')::bigint AND undone_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN PERFORM plw_h_raise('gone', p ->> 'id'); END IF;
    UPDATE pl_week_checks SET undone_by = p_actor, undone_at = now() WHERE id = v_row.id RETURNING * INTO v_after;
    PERFORM plan_h_audit(p_actor, p_role, 'update', 'pl_week_checks', v_row.id::text, to_jsonb(v_row), to_jsonb(v_after));
    RETURN to_jsonb(v_after) - 'snap';
  END $f$;

  -- p = {id, movement_ids:[the ids the week shows NOW]}. Read only. Per movement:
  --   changed   = it differs from the snap (taken / given / status / counterparty, or new, or gone) and the log has
  --               its trace (its own row after the mark, or a reverse row naming it as the replacement);
  --   note      = a log trace and nothing differs (a note) - counted apart, never in "N allaxan";
  --   moved     = it left or entered the week with no trace of its own, and the order's week-deciding dates
  --               (loading / delivery / plan_week_start) changed in the log after the mark;
  --   untracked = it differs and the log has no trace (a write outside the Worker / plan functions) - red.
  -- audit_failed = "AUDIT WRITE FAILED ... pl_movements" rows in app_errors after the mark: the log is incomplete.
  CREATE FUNCTION public.pl_week_check_changes(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
  DECLARE v_chk pl_week_checks%ROWTYPE; v_now bigint[]; v_out jsonb;
  BEGIN
    IF coalesce(p ->> 'id', '') !~ '^[0-9]{1,18}$' THEN PERFORM plw_h_raise('gone', p ->> 'id'); END IF;
    SELECT * INTO v_chk FROM pl_week_checks WHERE id = (p ->> 'id')::bigint;
    IF NOT FOUND THEN PERFORM plw_h_raise('gone', p ->> 'id'); END IF;
    SELECT coalesce(array_agg(DISTINCT x::bigint), '{}') INTO v_now
      FROM jsonb_array_elements_text(coalesce(p -> 'movement_ids', '[]'::jsonb)) x WHERE x ~ '^[0-9]{1,18}$';
    WITH s AS (
      SELECT (e ->> 'id')::bigint AS id, e AS v FROM jsonb_array_elements(v_chk.snap -> 'moves') e
    ), n AS (SELECT unnest(v_now) AS id),
    u AS (SELECT id FROM s UNION SELECT id FROM n),
    a AS (
      SELECT al.record_id, al.action, al.actor, al.created_at, plw_h_json(al.after_data) AS af
        FROM audit_log al
       WHERE al.table_name = 'pl_movements' AND al.created_at > v_chk.checked_at
    ),
    tr AS (  -- every trace, keyed by the movement it touched: its own row, or the replacement a reverse made
      SELECT record_id::bigint AS id, actor, created_at FROM a WHERE record_id ~ '^[0-9]{1,18}$'
      UNION ALL
      SELECT (af ->> 'replacement_id')::bigint, actor, created_at FROM a
       WHERE action = 'reverse' AND af ->> 'replacement_id' ~ '^[0-9]{1,18}$'
    ),
    r AS (
      SELECT u.id, s.v AS was, (u.id IN (SELECT id FROM n)) AS in_now,
             CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object('id', m.id, 'taken', m.taken, 'given', m.given,
               'status', m.status, 'counterparty_type', m.counterparty_type, 'client_id', m.client_id,
               'partner_id', m.partner_id, 'location_id', m.location_id) END AS cur,
             m.order_id,
             (SELECT count(*) FROM tr WHERE tr.id = u.id) AS n_trace,
             (SELECT tr.actor FROM tr WHERE tr.id = u.id ORDER BY tr.created_at DESC LIMIT 1) AS last_actor,
             (SELECT max(tr.created_at) FROM tr WHERE tr.id = u.id) AS last_at
        FROM u LEFT JOIN s ON s.id = u.id LEFT JOIN pl_movements m ON m.id = u.id
    ),
    k AS (
      SELECT r.*,
        CASE
          WHEN r.was IS NOT NULL AND r.in_now AND r.cur IS NOT DISTINCT FROM r.was
            THEN CASE WHEN r.n_trace > 0 THEN 'note' END
          -- it only left / entered the week (values as at the mark, or new) and the order's dates moved: 'moved',
          -- even if a note was written on it meanwhile
          WHEN ((r.was IS NULL) OR (NOT r.in_now)) AND r.cur IS NOT NULL AND (r.was IS NULL OR r.cur = r.was)
           AND r.order_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM audit_log o JOIN orders od ON od.legacy_id = o.record_id
             WHERE od.id = r.order_id AND o.table_name = 'orders' AND o.action = 'update' AND o.created_at > v_chk.checked_at
               AND (plw_h_json(o.before_data) ->> 'loading_datetime' IS DISTINCT FROM plw_h_json(o.after_data) ->> 'loading_datetime'
                 OR plw_h_json(o.before_data) ->> 'delivery_datetime' IS DISTINCT FROM plw_h_json(o.after_data) ->> 'delivery_datetime'
                 OR plw_h_json(o.before_data) ->> 'plan_week_start' IS DISTINCT FROM plw_h_json(o.after_data) ->> 'plan_week_start'))
            THEN 'moved'
          WHEN r.n_trace > 0 THEN 'changed'
          ELSE 'untracked'
        END AS kind
        FROM r
    )
    SELECT jsonb_build_object(
      'check_id', v_chk.id, 'checked_by', v_chk.checked_by, 'checked_at', v_chk.checked_at, 'undone_at', v_chk.undone_at,
      'changed', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'was', was, 'now', cur, 'in_week', in_now,
                   'by', last_actor, 'at', last_at) ORDER BY last_at DESC NULLS LAST) FROM k WHERE kind = 'changed'), '[]'::jsonb),
      'moved', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'was', was, 'now', cur, 'in_week', in_now)) FROM k WHERE kind = 'moved'), '[]'::jsonb),
      'untracked', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'was', was, 'now', cur, 'in_week', in_now)) FROM k WHERE kind = 'untracked'), '[]'::jsonb),
      'note_only', (SELECT count(*) FROM k WHERE kind = 'note'),
      'audit_failed', (SELECT count(*) FROM app_errors e WHERE e.created_at > v_chk.checked_at
                         AND e.message LIKE 'AUDIT WRITE FAILED%pl_movements%'),
      'missing_stops_then', v_chk.snap -> 'missing_stops')
      INTO v_out;
    RETURN v_out;
  END $f$;

  -- ===== PART 4: BORN CLOSED =====
  ALTER TABLE public.pl_week_checks ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.pl_week_checks FROM PUBLIC, anon, authenticated, service_role;
  GRANT SELECT ON public.pl_week_checks TO service_role, tms_reader, tms_check_runner;
  REVOKE ALL ON SEQUENCE public.pl_week_checks_id_seq FROM PUBLIC, anon, authenticated, service_role;
  FOREACH v_sig IN ARRAY c_acts || c_helpers LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_sig);
  END LOOP;
  FOREACH v_sig IN ARRAY c_acts LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
  -- The auditor roles are NOBYPASSRLS, so the GRANT alone would show them 0 rows. SELECT only, the two roles only.
  CREATE POLICY monitor_read ON public.pl_week_checks FOR SELECT TO tms_check_runner, tms_reader USING (true);

  -- ===== PART 5: PROOFS =====
  FOREACH v_sig IN ARRAY c_acts || c_helpers LOOP
    IF to_regprocedure(v_sig) IS NULL THEN RAISE EXCEPTION '104 proof: % was not created', v_sig; END IF;
  END LOOP;
  SELECT count(*) INTO v_k FROM unnest(c_acts) s
   WHERE (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(s))
     AND has_function_privilege('service_role', to_regprocedure(s), 'EXECUTE')
     AND NOT has_function_privilege('anon', to_regprocedure(s), 'EXECUTE')
     AND NOT has_function_privilege('authenticated', to_regprocedure(s), 'EXECUTE');
  IF v_k <> 3 THEN RAISE EXCEPTION '104 proof: the 3 acts are not definer + service_role only (% of 3)', v_k; END IF;
  SELECT count(*) INTO v_k FROM unnest(c_helpers) s
   WHERE has_function_privilege('anon', to_regprocedure(s), 'EXECUTE') OR has_function_privilege('authenticated', to_regprocedure(s), 'EXECUTE')
      OR has_function_privilege('service_role', to_regprocedure(s), 'EXECUTE');
  IF v_k <> 0 THEN RAISE EXCEPTION '104 proof: % closed helper(s) executable by an API role', v_k; END IF;
  IF has_table_privilege('anon', 'public.pl_week_checks', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.pl_week_checks', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('service_role', 'public.pl_week_checks', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION '104 proof: pl_week_checks open to an API role beyond SELECT';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pl_week_checks'::regclass)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pl_week_checks') <> 1 THEN
    RAISE EXCEPTION '104 proof: RLS off, or the policy is not the one monitor_read';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid = 'public.pl_week_checks_live'::regclass AND i.indisunique) THEN
    RAISE EXCEPTION '104 proof: the one-live-mark-per-week index is not unique';
  END IF;
  IF (SELECT count(*) FROM public.pl_week_checks) <> 0 THEN RAISE EXCEPTION '104 proof: a mark exists'; END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 + 1 THEN RAISE EXCEPTION '104 proof: trigger count % -> % (expected +1)', v_trg0, v_trg1; END IF;
  UPDATE monitoring.checks SET red_value = v_trg1 WHERE id = 'B-54' AND red_value::int = v_trg0;
  GET DIAGNOSTICS v_k = ROW_COUNT;
  IF v_k <> 1 THEN RAISE EXCEPTION '104: B-54 not updated (% rows)', v_k; END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '104 OK: pl_week_checks (born closed, 0 rows), 3 acts, 2 closed helpers, 1 policy; triggers % -> %, B-54 = %',
    v_trg0, v_trg1, v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN to_regprocedure('public.pl_week_check(jsonb,text,text)') IS NOT NULL THEN '104 OK' ELSE '104 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'pl_week_checks') AS tables,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
          AND proname IN ('pl_week_check', 'pl_week_uncheck', 'pl_week_check_changes')) AS acts,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
