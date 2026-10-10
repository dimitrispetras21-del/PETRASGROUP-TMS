-- ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ — owner, μετά τις 15:00
-- 068 - PRESENCE (Weekly International v4, sheet 16, option A): who else is on the board right now,
--       and how many changes others made to international orders since this tab last looked.
--       An INDICATION, never a lock: nothing here refuses, blocks or delays a save.
--
-- DRAFT - NOT EXECUTED. The owner runs it in the Supabase SQL editor AFTER 15:00 (team works
-- 05:30-14:30), with an explicit yes in the conversation. Spec: docs/weekly-intl-redesign/
-- TECH_DESIGN.md section g.1 (revision 2, 14972c2a). WP9 of the v4 build.
-- (The first line is the only non-ASCII text in this file, on purpose: it is a comment, and the rest
-- stays ASCII because a clipboard transfer corrupted Greek text on 27/9 - pbcopy.)
--
-- ORDER OF THE RELEASE (section j): 068_presence_dryrun.sql -> THIS FILE -> 068_presence_verify.sql
-- -> 068_presence_test.sql -> Worker deploy of branch deploy/worker-presence (POST /presence calls
-- presence_beat). This block can go live first: nothing reads the table until the Worker route
-- exists, and the front only beats when FEATURES.WI_PRESENCE = true (ships false). The other way
-- round (Worker before 068) is loud, not silent: every beat gets 503 "presence unavailable" and the
-- board shows "Zontani eikona se pafsi" - never "nobody is here" (principle 1).
--
-- EXPECTED: "Success. No rows returned" (the SQL editor may also show NOTICE "068 OK: ..."). A red
-- error = nothing changed (ONE DO block: any RAISE rolls everything back): stop, copy the panel to
-- the coordinator. Then 068_presence_verify.sql - its (deliberate) red message carries the result.
--
-- ONE DO block (lesson of 056/058: the SQL editor is not atomic across statements; inside ONE DO
-- block any RAISE undoes everything, so either all of 068 exists or none of it). No temp tables.
--
-- WHAT IT CREATES (names checked free in the guards):
--   table public.presence - one row per (user, browser tab), PK (user_sub, tab_id)
--   function public.presence_beat(...) RETURNS jsonb - the ONLY writer and reader (the Worker's
--     POST /presence calls it through PostgREST /rpc with service_role)
-- NOTHING ELSE: no trigger, no audit row per beat (presence is not a data change), no change to
-- audit_log or orders (only read), no monitoring check.
--
-- WHY each choice (TECH_DESIGN g.1, review round 1 findings 5, 9, 10, 25):
--   * Key (user_sub, tab_id), not user_sub alone: two visible windows of the same user would
--     otherwise overwrite each other's record/action, and one window's "leave" would erase the
--     other. The reader dedupes by user_sub: one avatar per person, the union of his open records.
--   * expires_at per row (seen_at + clamped TTL), not a fixed "last 15 s" window: an idle tab beats
--     every 30 s with TTL 45 s and must never blink out between beats. The client sends 1.5 x its
--     next interval; the server clamps it to 7.5-90 s, so a forged TTL can neither hide a user
--     instantly nor keep a ghost for hours.
--   * Values are born closed (principle 5): action is a whitelist (the SAME six strings as the
--     Worker's PRESENCE_ACTIONS - a Worker test compares them), record_id and tab_id are
--     regex-checked, role is one of the five roles, board is only 'weekly_intl'. Nothing free-text
--     that a colleague's browser renders is stored (user_name comes from the JWT, never the body).
--     The Worker validates the same rules first (400); these CHECKs catch every other path.
--   * RLS on, every privilege REVOKEd from anon / authenticated / PUBLIC, only service_role (the
--     Worker) granted: Supabase gives anon and authenticated full access to every new table and
--     EXECUTE to every new function by default (principle 5 - "what is born, is born closed").
--     RLS has no policies, as in all of v2 (SECURITY.md): service_role bypasses it anyway; RLS on
--     only closes the door if a grant ever reappears. Same pattern as 024 and 053.
--   * SECURITY INVOKER (not DEFINER): the caller is service_role, which already holds every grant
--     it needs; a DEFINER function would be a second door with the owner's rights.
--   * changes: international orders' audit rows since the tab last looked, clamped to at most
--     15 minutes ago server-side (a forged or stale p_changes_since cannot force a large audit_log
--     scan every 5 s). audit_log mixes two key styles and two kinds of actor (measured in the
--     migrations 013/020/023/028/033: Worker rows store record_id = legacy id and actor = username
--     with the caller's role; trigger rows store record_id = id::text, actor 'trigger:...' and role
--     'system'; data migrations 'migration:...' with role 'system'). So the join covers BOTH key
--     styles, and the counts are split:
--       n / last_by / last_at - HUMAN changes by someone else: role is one of the five roles, actor
--         is not the caller and not trigger:% / migration:%. The caller's own saves never count,
--         so a user never sees a permanent "N changes by trigger:rt_sync" caused by himself.
--       auto_n - role 'system' rows NOT caused by the caller. A trigger row is the caller's when he
--         has a human row on the SAME order within 1 second of it (the trigger fires in the same
--         transaction as his PATCH; the Worker's audit row follows with its own clock a moment
--         later, so a +-1 s window and not date_trunc('second'), which would split a pair across a
--         second boundary). Known limit, by the spec's rule "same order": a cascade to a SIBLING
--         order (rt_sync on the group/pair) is counted in auto_n - shown as "N automatic updates",
--         never under a person's name, so it is not a false accusation, only a softer number.
--       last_by is returned only when p_names is true. The Worker sets p_names from its existing
--         AUDIT_READERS list (owner, management - the roles that can read /audit today), so no role
--         gains anything; every other role gets the count only. Whether dispatchers should see
--         names is an owner question (TECH_DESIGN j.6).
--     orders.order_type = 'International' (the spec's "o.type" is the facade label "Type"; the
--     column is order_type - Worker map "Type: order_type", 028 filters the same way).
--   * since (when this record/action started, shown as "apo 08:41") is kept while record_id and
--     action are unchanged AND the old row was still live; otherwise it restarts at now(). Without
--     the liveness part a tab that comes back hours later on the same record would claim it has
--     been editing since the morning (principle 1).
--   * Housekeeping inside the beat: rows expired for more than 1 day are deleted (no cron needed;
--     expired rows are already invisible to every reader).
--
-- RESULT SHAPE (contract with the Worker WP8 and the client WP7 - change all three together):
--   leave:  {"others": []}
--   beat:   {"others": [ {"sub": text, "name": text, "seen_at": timestamptz,
--                         "weeks": [int, ...],
--                         "records": [ {"record": text, "part": text|null, "action": text|null,
--                                       "since": timestamptz|null, "week": int|null}, ... ]}, ... ],
--            "changes": {"n": int, "last_by": text|null, "last_at": timestamptz|null, "auto_n": int}}
--   "others" = live rows (expires_at > now()) of OTHER users on the same board, one entry per user,
--   ordered by name; "records" = only the tabs that have a record open.
--
-- REQUEST BUDGET: one beat = one Worker request + one RPC. Levers (Worker env PRESENCE_OFF /
-- PRESENCE_MS) live in the Worker, not here (TECH_DESIGN g.5).
-- Reverse: 068_presence_rollback.sql (drops both objects; presence rows are indications that
-- expire within 90 s - nothing of value is lost).

DO $do$
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
END
$do$;
