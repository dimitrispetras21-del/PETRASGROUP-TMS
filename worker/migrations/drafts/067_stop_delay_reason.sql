-- 067 - WHY A STOP WAS LATE, AND WHOSE IT WAS: order_stops gets the reason of a delay (one of 17
--       codes), an optional note, and the responsibility DERIVED from the code by the base itself.
--       order_stops.delay_reason text NULL, order_stops.delay_note text NULL,
--       order_stops.delay_responsibility text GENERATED ALWAYS AS (CASE delay_reason ...) STORED,
--       and three CHECKs. Facade labels (branch deploy/worker-stop-delay): "Delay Reason",
--       "Delay Note", "Delay Responsibility" (read-only).
--
-- DRAFT - NOT EXECUTED. The owner runs it in the Supabase SQL editor AFTER 15:00 (team works
-- 05:30-14:30), with an explicit yes in the conversation.
-- RELEASE ORDER (binding): this block -> Worker (deploy/worker-stop-delay: the three ORDER STOPS
-- labels) -> screens (feat/delay-reasons: Daily Ops "Kathysterisi" (delay) opens the reasons
-- panel).
--   This block first: alone it changes nothing anyone sees (every stop reads NULL; no Worker label
--   and no screen names the columns yet; the Daily Ops stop read is select=*, which simply carries
--   three more columns the Worker does not map).
--   The Worker before this block fails LOUDLY: a save naming "Delay Reason" -> 500 (column does not
--   exist) and the Daily Ops stamp says "not written", the order is left as it was.
--   The screens before the Worker fail SILENTLY at the facade (an unknown label is dropped with a
--   200, CLAUDE.md trap 1) - so the screen reads "Delay Reason" back from the stop's PATCH answer
--   and says so in red (performance and stamp are still saved; only the reason is missing).
--
-- Why (dispatcher Pantelis via the owner, 9/10/2026): "Kathysterise" (was late) on Daily Ops records
-- THAT a loading or delivery was late, never WHY or WHOSE it was ("our fault, the client's, the
-- borders'..."). The owner approved the coordinator's list ("kane osa les" - do what you say): the
-- dispatcher picks a reason, the responsibility follows from it; "Allo" (other) needs a note.
--
-- THE LIST (code -> responsibility). The CASE below is the ONE place it lives in the base:
--   us        vehicle_breakdown, driver_hours, planning_error, previous_stop
--   client    cargo_not_ready, loading_wait, order_change, missing_docs     (client / shipper)
--   consignee unloading_wait, closed_refused
--   borders   border_queue, customs                                         (borders / authorities)
--   external  traffic, weather, ferry_train, strike_roads
--   other     other                                                         (a note is required)
-- The Greek labels live in ONE front constant (modules/daily_ops.js OPS_DELAY); its codes and
-- responsibilities are pinned to the CASE of THIS file by tests/daily-ops-delay.test.js (the drift
-- test reads the WHEN lines below) - edit both or the test fails.
--
-- What it changes (nothing else):
--   1. Three columns appended to order_stops (nothing existing moves):
--      delay_reason   text NULL - the code;
--      delay_note     text NULL - free text from the dispatcher;
--      delay_responsibility text GENERATED ALWAYS AS (CASE delay_reason ...) STORED - derived, so
--        "whose fault" can never disagree with the reason (principle 3: one source). Nobody writes
--        it: Postgres refuses (428C9) and the Worker refuses the label first (400).
--   2. Three CHECKs (principle 4: every path - facade, SQL editor, a future screen - meets them):
--      order_stops_delay_reason_check        delay_reason IS NULL OR delay_responsibility IS NOT NULL
--        = the code is one the CASE knows. Not a second list of the 17 codes: the CASE IS the list,
--        and this CHECK cannot drift from it.
--      order_stops_delay_other_note_check    "other" needs a note with at least one non-space character.
--      order_stops_delay_only_delayed_check  a reason only on a stop whose performance is 'Delayed',
--        and a note only beside a reason.
--   3. A comment on each new column.
--
-- DECISION: "a reason only when performance = 'Delayed'" (asked by the coordinator; decided here).
--   Kept, because two facts on one row must not contradict each other (principle 3): "On Time,
--   because the client's cargo was not ready" is a lie in the base whichever half is wrong, and the
--   monthly "whose delays" count would then include stops that were not late. Measured cost today
--   (coordinator SELECT 9/10, since 1/9: Loading On Time 50, Unloading On Time 188, Unloading
--   Delayed 2, none with a reason - the column does not exist): no row violates it, so the CHECK is
--   validated at once. Who writes performance today: ONLY modules/daily_ops.js (_opsMarkStop), and it
--   never re-marks a declared stop (a declared stop shows its result, no buttons). Its stamp rollback
--   (_opsWriteOrder, when the order write is refused) restores every key of the stamp in ONE PATCH -
--   performance AND reason together - so it passes. A future correction screen must clear reason and
--   note in the same write that moves the stop to 'On Time'; the base says so loudly (23514) if it
--   does not. No trigger clears them silently instead (that would be a 36th trigger and a silent
--   rewrite of what a dispatcher declared).
--   NOT required the other way round: 'Delayed' without a reason stays allowed - the 2 existing
--   Delayed stops, every stamp written by the Daily Ops of today until the new screen ships, and a
--   lot's late intake ("Paralavi (kathysterisi)", wording and path unchanged).
--   A note only beside a reason: the screens show "responsibility: reason - note"; a lone note would
--   be text nobody sees, and clearing the reason would leave it behind.
--
-- BORN CLOSED (principle 5): ADD COLUMN creates no grant. Supabase's default privileges (GRANT ALL to
--   anon/authenticated/service_role) act on NEW tables, sequences and functions - not on new columns of
--   an existing table - and a GENERATED column has no sequence. The columns are reachable exactly as
--   order_stops already is: service_role (the Worker) through its table grant, nobody else. Proven
--   inside the block: relacl and owner of order_stops unchanged, no column-level ACL on the new
--   columns, service_role can read all three and write reason/note, anon and authenticated can
--   neither read nor write any of them.
--
-- LOCKS: ADD COLUMN ... GENERATED ... STORED rewrites order_stops (every row gets its value) under an
--   ACCESS EXCLUSIVE lock, and each CHECK is validated by a scan. A few thousand rows: well under a
--   second (PGlite copy: see the harness log). Behind an idle open transaction it would wait forever
--   while every stop read of the app queues behind it: lock_timeout 5 s - the whole block rolls back,
--   run it again a little later (as 057/060/063/065/066).
--
-- NOT touched: performance and its CHECK (order_stops_performance_check: 'On Time'/'Delayed'),
--   orders.delivery_performance, national tables, every trigger (order_stops has none; the count
--   stays 35 = B-54, asserted, B-54 not written), every function, view and grant. The view
--   pl_v_order_gate reads order_stops with a fixed column list: unchanged.
--
-- BEFORE IT: 067_stop_delay_reason_dryrun.sql - this same block, generated from this file, undone.
-- EXPECTED (green, no red panel): NOTICE "067 OK: order_stops.delay_reason / delay_note /
--   delay_responsibility (generated) + 3 CHECKs; <n> stops, <d> Delayed, 0 with a reason; ACL and
--   owner unchanged, new columns closed to anon/authenticated; triggers 35 -> 35, B-54 = 35"
--   and ONE result row "067 OK | 35 | 35 | <n> | <d> | 0 | 0".
--   <n> = live + deleted stops, <d> = stops marked Delayed (2 on 9/10, coordinator). The last two
--   numbers: stops with a reason (0 - nobody can have written one yet) and new columns with a
--   column-level ACL (0).
--   A red error = nothing changed (one DO block): stop, copy the panel to the coordinator.
-- AFTER IT: 067_stop_delay_reason_test.sql (every rule on probe rows, then undone - safe on
--   production: the probes use ids -6701..-6799 with OVERRIDING SYSTEM VALUE, so no sequence moves,
--   and order_stops has no trigger).
-- Reverse: 067_stop_delay_reason_rollback.sql (screens and Worker without the labels FIRST; it
--   refuses while any stop carries a reason or a note - that answer would be lost).
--
-- THIS FILE IS ASCII ONLY (pbcopy corrupted Greek on 27/9). ONE DO block (056/058: the SQL editor is
-- not atomic across statements; inside ONE DO block any RAISE rolls back everything), then ONE
-- read-only SELECT that prints the result row. No temp tables.
-- NO SUPERUSER NEEDED (the SQL editor's postgres is rolsuper = false): ALTER TABLE and COMMENT need
-- only ownership of order_stops (postgres, as read 4/10). The PGlite harness ran this file, its dry
-- run, its rules test and its rollback as a NOSUPERUSER owner (NOT a member of service_role) with
-- Supabase's default privileges in place, and as superuser.
--
-- Measured on the PGlite copy of production (catalog read 4/10 + 057/060/063/066 as executed):
-- order_stops relacl {postgres=arwdDxtm/postgres,service_role=arwDxtm/postgres,
-- tms_check_runner=r/postgres,tms_reader=r/postgres}, no column ACL, no trigger; triggers 35 = B-54.
-- After 067 (whitespace collapsed, version-proof): md5 of the generated expression
-- d5f97f72bb703e385c95975e0241b2a8, of the three CHECKs (ordered by name, "name:def;")
-- e17368e86ebf64f8131add2eb9426615. The coordinator may re-read them on production after the run.

DO $do$
DECLARE
  trg_before int; trg_after int; b54_before numeric; b54_baseline numeric;
  stops_before bigint; delayed_before bigint; fp_before text;
  acl_before text; owner_before oid; colacl_before text; cons_before text;
  n bigint; r record; v numeric; got text;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  -- ALTER TABLE takes an ACCESS EXCLUSIVE lock on order_stops (and rewrites it for the generated
  -- column): behind an idle open transaction it would wait forever while every stop read queues
  -- behind it. Give up after 5 s - the whole block rolls back; run it again a little later.
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (SELECT only)
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '067: monitoring.checks does not exist (047 must run first)';
  END IF;
  IF to_regclass('public.order_stops') IS NULL
     OR (SELECT relkind FROM pg_class WHERE oid = 'public.order_stops'::regclass) <> 'r' THEN
    RAISE EXCEPTION '067: public.order_stops is not a plain table - stop';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND attnum > 0
              AND NOT attisdropped AND attname IN ('delay_reason', 'delay_note', 'delay_responsibility'))
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname LIKE 'order_stops\_delay\_%') THEN
    RAISE EXCEPTION '067: already applied (order_stops has a delay_ column or an order_stops_delay_ constraint)';
  END IF;
  -- The rule "a reason only on a Delayed stop" leans on performance and its CHECK as measured.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND attname = 'performance'
                  AND NOT attisdropped AND atttypid = 'text'::regtype)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass
                     AND conname = 'order_stops_performance_check' AND contype = 'c' AND convalidated
                     AND regexp_replace(pg_get_constraintdef(oid), '\s+', ' ', 'g')
                         = 'CHECK ((performance = ANY (ARRAY[''On Time''::text, ''Delayed''::text])))') THEN
    RAISE EXCEPTION '067: order_stops.performance or its CHECK (On Time / Delayed) is not what was measured - re-measure';
  END IF;
  -- B-54 counts enabled non-internal triggers in public; run_checks compares against
  -- coalesce(baseline, red_value), so a baseline would hide a change. 35 since 057 + 060 + 063
  -- (065 re-created one under its own name, 064/066 none).
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value, baseline INTO b54_before, b54_baseline FROM monitoring.checks WHERE id = 'B-54';
  IF trg_before <> 35 OR b54_before IS DISTINCT FROM 35 OR b54_baseline IS NOT NULL THEN
    RAISE EXCEPTION '067: expected 35 enabled triggers in public = B-54 red_value, no baseline; found % triggers, B-54 red_value % baseline % - something changed triggers or B-54, re-measure',
      trg_before, b54_before, b54_baseline;
  END IF;
  -- what must not move: owner, table ACL, column ACLs, the existing constraints, every row
  SELECT relacl::text, relowner INTO acl_before, owner_before FROM pg_class WHERE oid = 'public.order_stops'::regclass;
  SELECT coalesce(string_agg(attname || '=' || attacl::text, ',' ORDER BY attnum), '') INTO colacl_before
    FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL;
  SELECT string_agg(conname || ':' || pg_get_constraintdef(oid), ';' ORDER BY conname) INTO cons_before
    FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass;
  SELECT count(*), count(*) FILTER (WHERE performance = 'Delayed'),
         md5(coalesce(string_agg(md5(to_jsonb(s)::text), ',' ORDER BY s.id), ''))
    INTO stops_before, delayed_before, fp_before FROM public.order_stops s;

  -- 1. THE FACT, on the table. The CASE is THE list (the front's drift test reads these WHEN lines).
  ALTER TABLE public.order_stops
    ADD COLUMN delay_reason text,
    ADD COLUMN delay_note text,
    ADD COLUMN delay_responsibility text GENERATED ALWAYS AS (CASE delay_reason
      WHEN 'vehicle_breakdown' THEN 'us'
      WHEN 'driver_hours' THEN 'us'
      WHEN 'planning_error' THEN 'us'
      WHEN 'previous_stop' THEN 'us'
      WHEN 'cargo_not_ready' THEN 'client'
      WHEN 'loading_wait' THEN 'client'
      WHEN 'order_change' THEN 'client'
      WHEN 'missing_docs' THEN 'client'
      WHEN 'unloading_wait' THEN 'consignee'
      WHEN 'closed_refused' THEN 'consignee'
      WHEN 'border_queue' THEN 'borders'
      WHEN 'customs' THEN 'borders'
      WHEN 'traffic' THEN 'external'
      WHEN 'weather' THEN 'external'
      WHEN 'ferry_train' THEN 'external'
      WHEN 'strike_roads' THEN 'external'
      WHEN 'other' THEN 'other'
    END) STORED,
    ADD CONSTRAINT order_stops_delay_reason_check
      CHECK (delay_reason IS NULL OR delay_responsibility IS NOT NULL),
    ADD CONSTRAINT order_stops_delay_other_note_check
      CHECK (delay_reason IS DISTINCT FROM 'other' OR coalesce(delay_note ~ '[^[:space:]]', false)),
    ADD CONSTRAINT order_stops_delay_only_delayed_check
      CHECK ((delay_reason IS NULL OR performance IS NOT DISTINCT FROM 'Delayed')
             AND (delay_note IS NULL OR delay_reason IS NOT NULL));
  COMMENT ON COLUMN public.order_stops.delay_reason IS
    'Why the stop was late: one of the 17 codes of delay_responsibility (Daily Ops, dispatcher Pantelis / owner 9/10/2026, migration 067). Only on a Delayed stop. Facade label: Delay Reason.';
  COMMENT ON COLUMN public.order_stops.delay_note IS
    'Free text beside delay_reason; required (non-blank) when delay_reason = other (migration 067). Facade label: Delay Note.';
  COMMENT ON COLUMN public.order_stops.delay_responsibility IS
    'Whose the delay was - us / client / consignee / borders / external / other - DERIVED from delay_reason by the base (generated, never written; migration 067). Facade label: Delay Responsibility (read-only).';

  -- 2. PROOFS inside the block: any failure rolls back everything above.
  -- 2a. the three columns: text; reason and note plain and nullable; responsibility generated STORED
  --     with the CASE above (whitespace collapsed, so the proof does not depend on the deparser's layout)
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND NOT attisdropped
        AND atttypid = 'text'::regtype AND NOT attnotnull AND atthasdef = (attname = 'delay_responsibility')
        AND ((attname IN ('delay_reason', 'delay_note') AND attgenerated = '')
          OR (attname = 'delay_responsibility' AND attgenerated = 's'))) <> 3 THEN
    RAISE EXCEPTION '067 proof: the three columns are not delay_reason/delay_note text NULL + delay_responsibility text generated STORED';
  END IF;
  SELECT btrim(regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\s+', ' ', 'g')) INTO got
    FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.order_stops'::regclass AND a.attname = 'delay_responsibility' AND NOT a.attisdropped;
  IF md5(got) <> 'd5f97f72bb703e385c95975e0241b2a8' THEN
    RAISE EXCEPTION '067 proof: the generated responsibility is not the CASE measured on the copy (md5 %): %', md5(got), got;
  END IF;
  -- 2b. constraints: the three new ones validated, exactly as written; every older one unchanged
  SELECT string_agg(conname || ':' || btrim(regexp_replace(pg_get_constraintdef(oid), '\s+', ' ', 'g')) || ';', '' ORDER BY conname) INTO got
    FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname LIKE 'order_stops\_delay\_%' AND contype = 'c' AND convalidated;
  IF md5(coalesce(got, '')) <> 'e17368e86ebf64f8131add2eb9426615' THEN
    RAISE EXCEPTION '067 proof: the three CHECKs are not the ones measured on the copy (md5 %): %', md5(coalesce(got, '')), got;
  END IF;
  IF (SELECT string_agg(conname || ':' || pg_get_constraintdef(oid), ';' ORDER BY conname)
        FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname NOT LIKE 'order_stops\_delay\_%')
     IS DISTINCT FROM cons_before THEN
    RAISE EXCEPTION '067 proof: an existing constraint of order_stops changed';
  END IF;
  -- 2c. born closed: same owner and table ACL, no column-level ACL anywhere new or old
  IF (SELECT relacl::text FROM pg_class WHERE oid = 'public.order_stops'::regclass) IS DISTINCT FROM acl_before
     OR (SELECT relowner FROM pg_class WHERE oid = 'public.order_stops'::regclass) IS DISTINCT FROM owner_before
     OR (SELECT coalesce(string_agg(attname || '=' || attacl::text, ',' ORDER BY attnum), '') FROM pg_attribute
          WHERE attrelid = 'public.order_stops'::regclass AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL)
        IS DISTINCT FROM colacl_before THEN
    RAISE EXCEPTION '067 proof: owner, table ACL or a column ACL of order_stops changed';
  END IF;
  -- the Worker's path (service_role through PostgREST): reads all three, writes reason and note.
  -- A missing privilege here would be a 500 on every delay save after the Worker deploy.
  IF NOT has_column_privilege('service_role', 'public.order_stops', 'delay_reason', 'SELECT')
     OR NOT has_column_privilege('service_role', 'public.order_stops', 'delay_note', 'SELECT')
     OR NOT has_column_privilege('service_role', 'public.order_stops', 'delay_responsibility', 'SELECT')
     OR NOT has_column_privilege('service_role', 'public.order_stops', 'delay_reason', 'UPDATE')
     OR NOT has_column_privilege('service_role', 'public.order_stops', 'delay_note', 'UPDATE')
     OR NOT has_column_privilege('service_role', 'public.order_stops', 'delay_reason', 'INSERT')
     OR NOT has_column_privilege('service_role', 'public.order_stops', 'delay_note', 'INSERT') THEN
    RAISE EXCEPTION '067 proof: service_role (the Worker) cannot read the three columns or write delay_reason / delay_note';
  END IF;
  -- nobody else: anon and authenticated (the public API keys) reach none of the three
  FOR r IN SELECT rol, col, priv FROM unnest(ARRAY['anon', 'authenticated']) rol,
             unnest(ARRAY['delay_reason', 'delay_note', 'delay_responsibility']) col,
             unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) priv LOOP
    IF has_column_privilege(r.rol, 'public.order_stops', r.col, r.priv) THEN
      RAISE EXCEPTION '067 proof: % has % on order_stops.% - the new columns must be born closed', r.rol, r.priv, r.col;
    END IF;
  END LOOP;
  -- 2d. data: same rows, same values (the rewrite moved nothing), the new columns empty everywhere
  SELECT count(*) INTO n FROM public.order_stops;
  IF n <> stops_before
     OR (SELECT count(*) FROM public.order_stops WHERE performance = 'Delayed') <> delayed_before
     OR (SELECT md5(coalesce(string_agg(md5((to_jsonb(s) - 'delay_reason' - 'delay_note' - 'delay_responsibility')::text), ',' ORDER BY s.id), ''))
           FROM public.order_stops s) IS DISTINCT FROM fp_before
     OR EXISTS (SELECT 1 FROM public.order_stops WHERE delay_reason IS NOT NULL OR delay_note IS NOT NULL OR delay_responsibility IS NOT NULL) THEN
    RAISE EXCEPTION '067 proof: order_stops rows changed (% -> %) or a new column is not empty - nothing was kept; if a save by someone else landed in these seconds, run 067 again in a few minutes', stops_before, n;
  END IF;
  -- 2e. triggers: the same count, B-54 still equals it (not written), and B-54 runs the way
  --     run_checks (047) runs it: guard, 10 s timeout, as tms_check_runner. The text is read before
  --     the role switch (tms_check_runner cannot read schema monitoring).
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after AND baseline IS NULL) THEN
    RAISE EXCEPTION '067 proof: trigger count % -> % (expected unchanged), or B-54 moved', trg_before, trg_after;
  END IF;
  FOR r IN SELECT id, sql_text FROM monitoring.checks WHERE id = 'B-54' AND enabled LOOP
    PERFORM monitoring.check_sql_guard(r.sql_text);
    PERFORM set_config('statement_timeout', '10000', true);
    SET LOCAL ROLE tms_check_runner;
    EXECUTE r.sql_text INTO v;
    RESET ROLE;
    IF v IS DISTINCT FROM trg_after::numeric THEN
      RAISE EXCEPTION '067 proof: B-54 = % right after the migration (expected %)', v, trg_after;
    END IF;
  END LOOP;

  RAISE NOTICE '067 OK: order_stops.delay_reason / delay_note / delay_responsibility (generated) + 3 CHECKs; % stops, % Delayed, 0 with a reason; ACL and owner unchanged, new columns closed to anon/authenticated; triggers % -> %, B-54 = %',
    n, delayed_before, trg_before, trg_after, trg_after;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND NOT attisdropped
                   AND attname IN ('delay_reason', 'delay_note', 'delay_responsibility')) = 3
             AND (SELECT attgenerated FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass
                   AND attname = 'delay_responsibility' AND NOT attisdropped) = 's'
             AND (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass
                   AND conname IN ('order_stops_delay_reason_check', 'order_stops_delay_other_note_check',
                                   'order_stops_delay_only_delayed_check') AND convalidated) = 3
            THEN '067 OK' ELSE '067 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM public.order_stops) AS stops_total,
       (SELECT count(*) FROM public.order_stops WHERE performance = 'Delayed') AS stops_delayed,
       (SELECT count(*) FROM public.order_stops WHERE delay_reason IS NOT NULL) AS stops_with_reason,
       (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND NOT attisdropped
         AND attname IN ('delay_reason', 'delay_note', 'delay_responsibility') AND attacl IS NOT NULL) AS new_columns_with_acl;
