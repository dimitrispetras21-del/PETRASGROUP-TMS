-- ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ — owner, μετά τις 15:00
-- 068 VERIFY - READ-ONLY proofs (catalog and SELECT only, no writes). ASCII only after the first line.
-- Run right after 068_presence.sql, and any time later (before a Worker deploy, when in doubt).
--
-- ONE DO block that ENDS WITH A DELIBERATE ERROR: a DO block cannot return rows, and the SQL editor does
-- not reliably show NOTICEs, so the red error message IS the result. It changed nothing - there was
-- nothing to change.
-- EXPECTED:
--   ERROR: P0001: VERIFY 068 finished - read-only, nothing changed. Result: 7 OK, 0 FAIL || V1 ok ... | ... || INFO ...
--   Any FAIL = STOP: no Worker deploy of deploy/worker-presence, copy the panel to the coordinator.
--   A different message ("relation ... does not exist" etc.) = 068 is not applied.
-- The INFO part is not pass/fail - it is for the owner's decision before presence goes live:
--   * audit_log indexes: presence_beat reads audit_log rows of the last <= 15 minutes on EVERY beat
--     (every 5 s per visible tab). "created_at index: no" means each beat scans audit_log - add the index
--     (a separate, owner-approved statement) BEFORE turning FEATURES.WI_PRESENCE on (TECH_DESIGN j.2).
--   * policies: 0 expected (RLS on without policies, as in all of v2 - SECURITY.md).
--   * rows: live = tabs beating now; total includes rows expired less than a day ago (housekeeping).
-- Scenarios:
--   V1 the 12 columns, names / types / nullability exactly as 068 created them
--   V2 primary key (user_sub, tab_id)
--   V3 RLS enabled on public.presence
--   V4 table closed: 0 privileges for PUBLIC / anon / authenticated; service_role has SELECT/INSERT/UPDATE/DELETE
--   V5 function: exactly one presence_beat, 13 args, SECURITY INVOKER, search_path pinned; EXECUTE for
--      service_role only (0 entries for PUBLIC / anon / authenticated)
--   V6 the 8 named constraints, and the whitelists inside them (6 actions, 5 roles, tab and record regex)
--   V7 at most 12 live rows (6 users x at most 2 tabs; PLAN phi7 said <= 6 with one row per user)

DO $vfy$
DECLARE
  ok int := 0; bad int := 0; res text[] := '{}'; info text[] := '{}';
  v text; n int; m int;
  sig constant text := 'public.presence_beat(text,text,text,text,text,integer,text,text,text,integer,boolean,timestamptz,boolean)';
  want_cols constant text := 'user_sub:text:NO,tab_id:text:NO,user_name:text:NO,role:text:NO,board:text:NO,'
    || 'week:integer:YES,record_id:text:YES,part:text:YES,action:text:YES,since:timestamp with time zone:YES,'
    || 'seen_at:timestamp with time zone:NO,expires_at:timestamp with time zone:NO';
  w text;
BEGIN
  IF to_regclass('public.presence') IS NULL THEN
    RAISE EXCEPTION 'VERIFY 068: public.presence does not exist - 068 is not applied';
  END IF;

  -- V1 columns
  SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' ORDER BY ordinal_position) INTO v
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'presence';
  IF v = want_cols THEN ok := ok + 1; res := res || 'V1 ok 12 columns'::text;
  ELSE bad := bad + 1; res := res || format('V1 FAIL columns %s', v); END IF;

  -- V2 primary key
  SELECT string_agg(a.attname, ',' ORDER BY k.ord) INTO v
    FROM pg_constraint c
    CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
   WHERE c.conrelid = 'public.presence'::regclass AND c.contype = 'p';
  IF v = 'user_sub,tab_id' THEN ok := ok + 1; res := res || 'V2 ok PK (user_sub, tab_id)'::text;
  ELSE bad := bad + 1; res := res || format('V2 FAIL primary key %s', coalesce(v, 'none')); END IF;

  -- V3 RLS
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.presence'::regclass) THEN
    ok := ok + 1; res := res || 'V3 ok RLS on'::text;
  ELSE bad := bad + 1; res := res || 'V3 FAIL RLS is off'::text; END IF;

  -- V4 table privileges
  SELECT count(*) INTO n
    FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) e
   WHERE c.oid = 'public.presence'::regclass
     AND (e.grantee = 0 OR e.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated')));
  IF n = 0
     AND has_table_privilege('service_role', 'public.presence', 'SELECT')
     AND has_table_privilege('service_role', 'public.presence', 'INSERT')
     AND has_table_privilege('service_role', 'public.presence', 'UPDATE')
     AND has_table_privilege('service_role', 'public.presence', 'DELETE') THEN
    ok := ok + 1; res := res || 'V4 ok table closed to PUBLIC/anon/authenticated, service_role SIUD'::text;
  ELSE
    SELECT string_agg(e.grantee::regrole::text || ':' || e.privilege_type, ' ') INTO v
      FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) e
     WHERE c.oid = 'public.presence'::regclass;
    bad := bad + 1; res := res || format('V4 FAIL %s open entries; acl %s', n, v);
  END IF;

  -- V5 function
  SELECT count(*) INTO m FROM pg_proc WHERE proname = 'presence_beat' AND pronamespace = 'public'::regnamespace;
  IF m = 1 AND to_regprocedure(sig) IS NOT NULL THEN
    SELECT count(*) INTO n
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) e
     WHERE p.oid = to_regprocedure(sig)
       AND (e.grantee = 0 OR e.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated')));
    IF n = 0
       AND has_function_privilege('service_role', sig, 'EXECUTE')
       AND NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(sig))
       AND (SELECT 'search_path=public, pg_temp' = ANY (proconfig) FROM pg_proc WHERE oid = to_regprocedure(sig))
       AND (SELECT prorettype = 'jsonb'::regtype FROM pg_proc WHERE oid = to_regprocedure(sig)) THEN
      ok := ok + 1; res := res || 'V5 ok presence_beat: invoker, search_path pinned, EXECUTE service_role only'::text;
    ELSE
      SELECT concat_ws(' ', 'secdef=' || prosecdef, 'config=' || coalesce(array_to_string(proconfig, ';'), '-'),
                       'acl=' || coalesce(proacl::text, 'default')) INTO v
        FROM pg_proc WHERE oid = to_regprocedure(sig);
      bad := bad + 1; res := res || format('V5 FAIL %s open entries; %s', n, v);
    END IF;
  ELSE
    bad := bad + 1; res := res || format('V5 FAIL %s functions named presence_beat, 068 signature present: %s', m, to_regprocedure(sig) IS NOT NULL);
  END IF;

  -- V6 constraints and the whitelists inside them
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.presence'::regclass
     AND conname IN ('presence_pkey', 'presence_tab_chk', 'presence_role_chk', 'presence_board_chk',
                     'presence_week_chk', 'presence_record_chk', 'presence_part_chk', 'presence_action_chk');
  v := NULL;
  FOREACH w IN ARRAY ARRAY['view', 'menu', 'assign', 'date:Loading DateTime', 'date:Delivery DateTime', 'date:VS CD Date'] LOOP
    IF position('''' || w || '''' IN coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid = 'public.presence'::regclass AND conname = 'presence_action_chk'), '')) = 0 THEN
      v := concat_ws(',', v, 'action:' || w);
    END IF;
  END LOOP;
  FOREACH w IN ARRAY ARRAY['owner', 'management', 'accountant', 'dispatcher', 'warehouse'] LOOP
    IF position('''' || w || '''' IN coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid = 'public.presence'::regclass AND conname = 'presence_role_chk'), '')) = 0 THEN
      v := concat_ws(',', v, 'role:' || w);
    END IF;
  END LOOP;
  IF position('^[a-z0-9]{8,16}$' IN coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.presence'::regclass AND conname = 'presence_tab_chk'), '')) = 0 THEN
    v := concat_ws(',', v, 'tab regex');
  END IF;
  IF position('^rec[A-Za-z0-9]{6,30}$' IN coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid = 'public.presence'::regclass AND conname = 'presence_record_chk'), '')) = 0 THEN
    v := concat_ws(',', v, 'record regex');
  END IF;
  IF n = 8 AND v IS NULL THEN ok := ok + 1; res := res || 'V6 ok 8 constraints, whitelists complete'::text;
  ELSE bad := bad + 1; res := res || format('V6 FAIL %s of 8 constraints; missing %s', n, coalesce(v, '-')); END IF;

  -- V7 live rows
  SELECT count(*) FILTER (WHERE expires_at > now()), count(*) INTO n, m FROM public.presence;
  IF n <= 12 THEN ok := ok + 1; res := res || format('V7 ok %s live rows', n);
  ELSE bad := bad + 1; res := res || format('V7 FAIL %s live rows (> 12: 6 users x 2 tabs)', n); END IF;

  -- INFO (not pass/fail)
  SELECT count(*) INTO n FROM pg_policy WHERE polrelid = 'public.presence'::regclass;
  info := info || format('rows live %s / total %s', (SELECT count(*) FROM public.presence WHERE expires_at > now()), m)
               || format('policies %s', n);
  SELECT string_agg(DISTINCT a.attname, ',') INTO v
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
   WHERE i.indrelid = 'public.audit_log'::regclass AND i.indisvalid
     AND a.attname IN ('created_at', 'record_id');
  info := info || format('audit_log created_at index: %s', CASE WHEN position('created_at' IN coalesce(v, '')) > 0 THEN 'yes' ELSE 'NO - add before presence goes live' END)
               || format('audit_log record_id index: %s', CASE WHEN position('record_id' IN coalesce(v, '')) > 0 THEN 'yes' ELSE 'no' END);

  RAISE EXCEPTION 'VERIFY 068 finished - read-only, nothing changed. Result: % OK, % FAIL || % || INFO %',
    ok, bad, array_to_string(res, ' | '), array_to_string(info, ' | ');
END
$vfy$;
