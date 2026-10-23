-- ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ — owner, μετά τις 15:00
-- 068 DRY RUN - 068_presence.sql's own DO block, run and then UNDONE. Nothing it does is kept.
-- (The first line is the only non-ASCII text in this file; the rest is ASCII, clipboard-safe.)
--
-- WHAT: ONE outer DO block that first fingerprints the data 068 must not touch (audit_log, orders),
--   then runs 068_presence.sql's DO body VERBATIM as a nested block (every guard, change and proof -
--   an error there stops everything, exactly as 068 itself would), then exercises the new function as
--   the Worker will (service_role, one beat and one leave of a synthetic tab), checks the fingerprint,
--   and ENDS WITH A DELIBERATE ERROR. The error rolls the whole block back: no table, no function, no
--   row is kept.
-- WHEN: the same evening, AFTER 15:00 (the team works 05:30-14:30), BEFORE 068_presence.sql.
-- WHY ONE DO BLOCK: the Supabase SQL editor is NOT atomic across statements (lesson 056), but ONE DO
--   block is ONE statement: its final error undoes everything inside it.
-- EXPECTED (the red ERROR is deliberate):
--   ERROR: P0001: DRY RUN 068 finished - EVERYTHING UNDONE, nothing kept. Result: 4 OK, 0 FAIL || A ok ... | B ok ... | C ok ... | D ok ...
--   Anything with FAIL in it: do NOT run 068, copy the panel to the coordinator.
--   ONE exception: "3 OK, 1 FAIL" where the FAIL is C alone. C fingerprints audit_log and orders while
--   the block runs, so ONE save by someone else in those seconds turns it red - it fails closed,
--   nothing was kept. Wait 5 minutes and run the dry run once more; if C fails again, stop.
--   A different message altogether ("068: ...", "068 proof: ...", a lock timeout) is the guard or proof
--   of 068 that stopped - exactly what 068 itself would have said. Do NOT run 068.
-- AFTER: nothing to check by hand - SELECT to_regclass('public.presence') must still be NULL.
-- Scenarios: A 068's objects exist inside the block and the table starts empty; B one beat and one
--   leave as service_role (the Worker's role): the answer has the agreed shape (others = array,
--   changes.n / changes.auto_n = numbers), and the leave removes the row; C audit_log and orders are
--   unchanged (068 only reads them); D the action whitelist refuses 'x<script>' (SQLSTATE 23514).
--
-- KEEPING IT IN STEP WITH 068 (principle 3 - two copies drift): the nested block below is the text
-- between "DO $do$" and "$do$;" of 068_presence.sql, byte for byte. There is no generator file in
-- this package; check it from the repo root before running (prints "in step"):
--   node -e "const f=require('fs'),d='worker/migrations/drafts/',b=f.readFileSync(d+'068_presence.sql','utf8').split('DO \$do\$\n')[1].split('\n\$do\$;')[0],r=f.readFileSync(d+'068_presence_dryrun.sql','utf8').split('-- ===== BEGIN 068 body =====\n')[1].split('\n-- ===== END 068 body =====')[0];console.log(r===b+';'?'in step':'DRIFT - re-copy the 068 body')"

DO $dry$
DECLARE
  ok int := 0; bad int := 0; res text[] := '{}';
  dry_fp_before text; dry_fp_after text; dry_j jsonb; dry_n int; dry_st text;
BEGIN
  -- the data 068 must leave alone (it only reads audit_log and orders)
  SELECT (SELECT count(*) || ':' || coalesce(max(id), 0) FROM public.audit_log) || '|' ||
         (SELECT count(*) || ':' || coalesce(max(id), 0) || ':' || md5(coalesce(string_agg(id || '=' || coalesce(legacy_id, '') || '=' || coalesce(order_type, ''), ',' ORDER BY id), ''))
            FROM public.orders)
    INTO dry_fp_before;

-- ===== BEGIN 068 body =====
DECLARE
  n int;
  bad text;
BEGIN
  PERFORM set_config('search_path', 'public, pg_temp', true);
  -- CREATE TABLE / FUNCTION take only new-object locks, but keep the house rule: never queue the app
  -- behind an idle open transaction - give up after 5 s, the whole block rolls back (as 057/060).
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (read-only): the base is what this file was written against.
  IF to_regclass('public.presence') IS NOT NULL THEN
    RAISE EXCEPTION '068: public.presence already exists (068 applied, or a name clash) - stop';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'presence_beat' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION '068: a function public.presence_beat already exists - stop';
  END IF;
  SELECT count(*) INTO n FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role');
  IF n <> 3 THEN
    RAISE EXCEPTION '068: expected the Supabase roles anon, authenticated, service_role (found %)', n;
  END IF;
  -- the columns presence_beat reads (a missing one would fail at the first beat, at 06:00, not here)
  SELECT string_agg(want, ', ') INTO bad
    FROM unnest(ARRAY['audit_log.actor', 'audit_log.role', 'audit_log.table_name', 'audit_log.record_id',
                      'audit_log.created_at', 'audit_log.id', 'orders.id', 'orders.legacy_id', 'orders.order_type']) AS want
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                      WHERE c.table_schema = 'public'
                        AND c.table_name = split_part(want, '.', 1) AND c.column_name = split_part(want, '.', 2));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '068: missing column(s) %', bad;
  END IF;

  -- 1. THE TABLE. Constraint names are explicit: 068_presence_verify.sql checks them by name.
  CREATE TABLE public.presence (
    user_sub   text NOT NULL,                       -- JWT sub (username), from the JWT only
    tab_id     text NOT NULL,                       -- random per browser tab, not personal data
    user_name  text NOT NULL,                       -- JWT name, from the JWT only
    role       text NOT NULL,
    board      text NOT NULL,
    week       integer,
    record_id  text,                                -- order legacy id open in this tab, or null
    part       text,
    action     text,
    since      timestamptz,                         -- when this record/action started
    seen_at    timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,                -- seen_at + clamped TTL; readers see live rows only
    CONSTRAINT presence_pkey PRIMARY KEY (user_sub, tab_id),
    CONSTRAINT presence_tab_chk    CHECK (tab_id ~ '^[a-z0-9]{8,16}$'),
    CONSTRAINT presence_role_chk   CHECK (role IN ('owner', 'management', 'accountant', 'dispatcher', 'warehouse')),
    CONSTRAINT presence_board_chk  CHECK (board IN ('weekly_intl')),
    CONSTRAINT presence_week_chk   CHECK (week BETWEEN 1 AND 53),
    CONSTRAINT presence_record_chk CHECK (record_id ~ '^rec[A-Za-z0-9]{6,30}$'),
    CONSTRAINT presence_part_chk   CHECK (part IN ('truck', 'export', 'import')),
    CONSTRAINT presence_action_chk CHECK (action IN ('view', 'menu', 'assign',
                   'date:Loading DateTime', 'date:Delivery DateTime', 'date:VS CD Date'))
  );
  ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.presence FROM anon, authenticated, PUBLIC;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.presence TO service_role;

  -- 2. THE BEAT. Thirteen arguments, always all passed by the Worker (PostgREST matches by name).
  CREATE FUNCTION public.presence_beat(
      p_sub text, p_tab text, p_name text, p_role text, p_board text, p_week integer,
      p_record text, p_part text, p_action text, p_ttl_ms integer, p_leave boolean,
      p_changes_since timestamptz, p_names boolean)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY INVOKER
    SET search_path = public, pg_temp
  AS $f$
  DECLARE
    -- clamp: never further back than 15 minutes, whatever the client sends (greatest() skips NULL)
    v_floor   timestamptz := greatest(p_changes_since, now() - interval '15 minutes');
    v_others  jsonb;
    v_changes jsonb;
  BEGIN
    IF p_sub IS NULL OR p_tab IS NULL THEN
      RAISE EXCEPTION 'presence_beat: p_sub and p_tab are required' USING ERRCODE = '22023';
    END IF;

    -- 1. leave (pagehide): only this tab's own row goes; the user's other tabs stay.
    IF p_leave IS TRUE THEN
      DELETE FROM presence WHERE user_sub = p_sub AND tab_id = p_tab;
      RETURN jsonb_build_object('others', '[]'::jsonb);
    END IF;

    -- 2. upsert this tab. The CHECKs refuse anything outside the whitelists (SQLSTATE 23514).
    INSERT INTO presence AS p (user_sub, tab_id, user_name, role, board, week, record_id, part, action,
                               since, seen_at, expires_at)
    VALUES (p_sub, p_tab, p_name, p_role, p_board, p_week, p_record, p_part, p_action,
            now(), now(),
            now() + make_interval(secs => (least(greatest(p_ttl_ms, 7500), 90000) / 1000.0)::double precision))
    ON CONFLICT (user_sub, tab_id) DO UPDATE SET
      user_name  = EXCLUDED.user_name,
      role       = EXCLUDED.role,
      board      = EXCLUDED.board,
      week       = EXCLUDED.week,
      record_id  = EXCLUDED.record_id,
      part       = EXCLUDED.part,
      action     = EXCLUDED.action,
      since      = CASE WHEN p.expires_at > now()
                         AND p.record_id IS NOT DISTINCT FROM EXCLUDED.record_id
                         AND p.action IS NOT DISTINCT FROM EXCLUDED.action
                        THEN coalesce(p.since, EXCLUDED.since)
                        ELSE EXCLUDED.since END,
      seen_at    = EXCLUDED.seen_at,
      expires_at = EXCLUDED.expires_at;

    -- housekeeping (spec step 5): expired rows are invisible already; drop them after a day.
    DELETE FROM presence WHERE expires_at < now() - interval '1 day';

    -- 3. the others on this board: each row visible until its OWN expiry, one entry per person.
    SELECT coalesce(jsonb_agg(u.entry ORDER BY u.name, u.sub), '[]'::jsonb) INTO v_others
      FROM (SELECT x.user_sub AS sub,
                   (array_agg(x.user_name ORDER BY x.seen_at DESC, x.tab_id))[1] AS name,
                   jsonb_build_object(
                     'sub',     x.user_sub,
                     'name',    (array_agg(x.user_name ORDER BY x.seen_at DESC, x.tab_id))[1],
                     'seen_at', max(x.seen_at),
                     'weeks',   coalesce(to_jsonb(array_agg(DISTINCT x.week) FILTER (WHERE x.week IS NOT NULL)), '[]'::jsonb),
                     'records', coalesce(jsonb_agg(jsonb_build_object(
                                    'record', x.record_id, 'part', x.part, 'action', x.action,
                                    'since', x.since, 'week', x.week) ORDER BY x.since, x.tab_id)
                                  FILTER (WHERE x.record_id IS NOT NULL), '[]'::jsonb)
                   ) AS entry
              FROM presence x
             WHERE x.user_sub <> p_sub AND x.board = p_board AND x.expires_at > now()
             GROUP BY x.user_sub) u;

    -- 4. changes to INTERNATIONAL orders since the tab last looked (clamped), both key styles.
    WITH ch AS (
      SELECT a.id, a.actor, a.role, a.created_at, o.id AS order_id
        FROM audit_log a
        JOIN orders o ON (o.legacy_id = a.record_id OR o.id::text = a.record_id)
       WHERE a.table_name = 'orders'
         AND o.order_type = 'International'
         AND a.created_at > v_floor
    ), human AS (
      SELECT c.* FROM ch c
       WHERE c.actor <> p_sub
         AND c.role IN ('owner', 'management', 'accountant', 'dispatcher', 'warehouse')
         AND c.actor NOT LIKE 'trigger:%'
         AND c.actor NOT LIKE 'migration:%'
    ), auto AS (
      SELECT c.* FROM ch c
       WHERE c.role = 'system'
         AND NOT EXISTS (SELECT 1 FROM ch m
                          WHERE m.actor = p_sub
                            AND m.role IN ('owner', 'management', 'accountant', 'dispatcher', 'warehouse')
                            AND m.order_id = c.order_id
                            AND m.created_at BETWEEN c.created_at - interval '1 second'
                                                 AND c.created_at + interval '1 second')
    )
    SELECT jsonb_build_object(
             'n',       (SELECT count(*) FROM human),
             'last_by', CASE WHEN p_names IS TRUE
                             THEN (SELECT h.actor FROM human h ORDER BY h.created_at DESC, h.id DESC LIMIT 1)
                        END,
             'last_at', (SELECT max(h.created_at) FROM human h),
             'auto_n',  (SELECT count(*) FROM auto))
      INTO v_changes;

    RETURN jsonb_build_object('others', v_others, 'changes', v_changes);
  END;
  $f$;
  -- Supabase grants EXECUTE on every new function to PUBLIC, anon and authenticated by default.
  REVOKE ALL ON FUNCTION public.presence_beat(text, text, text, text, text, integer, text, text, text,
                                              integer, boolean, timestamptz, boolean)
    FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.presence_beat(text, text, text, text, text, integer, text, text, text,
                                                 integer, boolean, timestamptz, boolean)
    TO service_role;

  -- 3. PROOFS inside the block (a failure here undoes 1 and 2).
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.presence'::regclass) THEN
    RAISE EXCEPTION '068 proof: RLS is not enabled on public.presence';
  END IF;
  -- no ACL entry for PUBLIC (grantee 0), anon or authenticated, on the table or the function
  SELECT count(*) INTO n
    FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) e
   WHERE c.oid = 'public.presence'::regclass
     AND (e.grantee = 0 OR e.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated')));
  IF n <> 0 THEN
    RAISE EXCEPTION '068 proof: % privilege(s) on public.presence still open to PUBLIC/anon/authenticated', n;
  END IF;
  IF NOT (has_table_privilege('service_role', 'public.presence', 'SELECT')
      AND has_table_privilege('service_role', 'public.presence', 'INSERT')
      AND has_table_privilege('service_role', 'public.presence', 'UPDATE')
      AND has_table_privilege('service_role', 'public.presence', 'DELETE')) THEN
    RAISE EXCEPTION '068 proof: service_role lacks SELECT/INSERT/UPDATE/DELETE on public.presence';
  END IF;
  SELECT count(*) INTO n
    FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) e
   WHERE p.proname = 'presence_beat' AND p.pronamespace = 'public'::regnamespace
     AND (e.grantee = 0 OR e.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated')));
  IF n <> 0 THEN
    RAISE EXCEPTION '068 proof: EXECUTE on presence_beat still open to PUBLIC/anon/authenticated (% entries)', n;
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.presence_beat(text,text,text,text,text,integer,text,text,text,integer,boolean,timestamptz,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION '068 proof: service_role cannot EXECUTE presence_beat';
  END IF;
  -- the service_role can read what the function reads (SECURITY INVOKER: its rights are the caller's)
  IF NOT (has_table_privilege('service_role', 'public.audit_log', 'SELECT')
      AND has_table_privilege('service_role', 'public.orders', 'SELECT')) THEN
    RAISE EXCEPTION '068 proof: service_role cannot SELECT audit_log/orders - presence_beat would fail';
  END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.presence'::regclass
     AND conname IN ('presence_pkey', 'presence_tab_chk', 'presence_role_chk', 'presence_board_chk',
                     'presence_week_chk', 'presence_record_chk', 'presence_part_chk', 'presence_action_chk');
  IF n <> 8 THEN
    RAISE EXCEPTION '068 proof: % of 8 constraints on public.presence', n;
  END IF;

  RAISE NOTICE '068 OK: public.presence (RLS on, closed to anon/authenticated/PUBLIC, 8 constraints) and presence_beat (EXECUTE service_role only)';
END;
-- ===== END 068 body =====

  -- A. the objects exist and the table starts empty
  IF to_regclass('public.presence') IS NOT NULL
     AND to_regprocedure('public.presence_beat(text,text,text,text,text,integer,text,text,text,integer,boolean,timestamptz,boolean)') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.presence) THEN
    ok := ok + 1; res := res || 'A ok table + function, 0 rows'::text;
  ELSE
    bad := bad + 1; res := res || 'A FAIL objects missing or table not empty'::text;
  END IF;

  -- B. one beat and one leave, as the Worker calls it (service_role through PostgREST)
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT public.presence_beat('dry068a', 'dry068tab001', 'DRY 068', 'dispatcher', 'weekly_intl', 41,
                                'recDRY068AAAA', 'truck', 'menu', 45000, false, NULL, false) INTO dry_j;
    SELECT count(*) INTO dry_n FROM public.presence WHERE user_sub = 'dry068a';
    PERFORM public.presence_beat('dry068a', 'dry068tab001', 'DRY 068', 'dispatcher', 'weekly_intl', 41,
                                 NULL, NULL, NULL, 0, true, NULL, false);
    RESET ROLE;
    IF jsonb_typeof(dry_j -> 'others') = 'array'
       AND jsonb_typeof(dry_j -> 'changes' -> 'n') = 'number'
       AND jsonb_typeof(dry_j -> 'changes' -> 'auto_n') = 'number'
       AND (dry_j -> 'changes' -> 'last_by') = 'null'::jsonb      -- p_names false: never a name
       AND dry_n = 1
       AND NOT EXISTS (SELECT 1 FROM public.presence WHERE user_sub = 'dry068a') THEN
      ok := ok + 1; res := res || format('B ok beat + leave as service_role (changes n=%s auto_n=%s, others=%s)',
                                         dry_j -> 'changes' ->> 'n', dry_j -> 'changes' ->> 'auto_n',
                                         jsonb_array_length(dry_j -> 'others'));
    ELSE
      bad := bad + 1; res := res || format('B FAIL answer %s, rows after beat %s', left(dry_j::text, 300), dry_n);
    END IF;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    bad := bad + 1; res := res || format('B FAIL error %s %s', SQLSTATE, SQLERRM);
  END;

  -- C. audit_log and orders unchanged
  SELECT (SELECT count(*) || ':' || coalesce(max(id), 0) FROM public.audit_log) || '|' ||
         (SELECT count(*) || ':' || coalesce(max(id), 0) || ':' || md5(coalesce(string_agg(id || '=' || coalesce(legacy_id, '') || '=' || coalesce(order_type, ''), ',' ORDER BY id), ''))
            FROM public.orders)
    INTO dry_fp_after;
  IF dry_fp_after = dry_fp_before THEN
    ok := ok + 1; res := res || 'C ok audit_log and orders unchanged'::text;
  ELSE
    bad := bad + 1; res := res || format('C FAIL fingerprint %s -> %s (someone saved meanwhile? see header)', dry_fp_before, dry_fp_after);
  END IF;

  -- D. the whitelist refuses a script string in action (the CHECK, not only the Worker)
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.presence_beat('dry068a', 'dry068tab001', 'DRY 068', 'dispatcher', 'weekly_intl', 41,
                                 NULL, NULL, 'x<script>', 7500, false, NULL, false);
    RESET ROLE;
    bad := bad + 1; res := res || 'D FAIL action x<script> was accepted'::text;
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS dry_st = RETURNED_SQLSTATE;
    RESET ROLE;
    IF dry_st = '23514' THEN ok := ok + 1; res := res || 'D ok x<script> refused (23514)'::text;
    ELSE bad := bad + 1; res := res || format('D FAIL got %s %s', dry_st, SQLERRM); END IF;
  END;

  RAISE EXCEPTION 'DRY RUN 068 finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL || %',
    ok, bad, array_to_string(res, ' | ');
END
$dry$;
