-- 063 ROLLBACK - puts back exactly what 060 left: the guard function text of 060 verbatim,
-- dl_local_day_sync's text of 060 verbatim (without 063's flag around its relabel), the trigger on
-- deleted_at only. DRAFT - NOT EXECUTED. ASCII only. ONE DO block (all or nothing) + one read-only
-- result SELECT. No superuser needed (only the owner's CREATE OR REPLACE / DROP / CREATE TRIGGER):
-- proven on the PGlite copy run by a NOSUPERUSER owner, as production's SQL editor role is.
--
-- No data to lose: 063 holds no rows, so this file has no data guard. What it gives back is F4:
-- after it, a local line's day, driver, route, RT, type and relay are again protected only by the
-- Worker's allow-list (worker/src/ledger-rules.mjs LOCAL_LINE_EDITABLE).
-- Proven on the PGlite copy of production: 063 -> rollback -> dl_local_line_guard and
-- dl_local_day_sync md5 are again 060's, owner/grants/SECURITY DEFINER/search_path unchanged, the
-- trigger is again BEFORE UPDATE OF deleted_at, the trigger count and B-54 never moved, 060's rules
-- test is again 54 OK, and 063 can run again.
DO $do$
DECLARE n int; trg_before int; trg_after int; deleted_at_attnum int;
  guard_src text; sync_src text; guard_owner oid; guard_acl text; sync_owner oid; sync_acl text;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  PERFORM set_config('lock_timeout', '5s', true); -- as 063: give up behind an idle transaction, never queue the app

  -- 0. GUARDS: 063 is applied, and nobody edited its two functions since.
  IF to_regprocedure('public.dl_local_line_guard()') IS NULL OR to_regprocedure('public.dl_local_day_sync(bigint,date)') IS NULL THEN
    RAISE EXCEPTION '063 rollback: 063 is not applied';
  END IF;
  SELECT prosrc, proowner, proacl::text INTO guard_src, guard_owner, guard_acl
    FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure;
  SELECT prosrc, proowner, proacl::text INTO sync_src, sync_owner, sync_acl
    FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure;
  IF position('local_relay:line_locked' IN guard_src) = 0 AND position('tms.local_day_sync' IN sync_src) = 0 THEN
    RAISE EXCEPTION '063 rollback: 063 is not applied';
  END IF;
  IF md5(guard_src) <> 'e7f0348ccc5764d29608b8701f0e83b6' THEN
    RAISE EXCEPTION '063 rollback: dl_local_line_guard is not the 063 text - edited by hand after 063, stop';
  END IF;
  IF md5(sync_src) <> 'a4a62603e5b0c4ad48124fea625aa611'
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure
                     AND prosecdef AND proconfig = ARRAY['search_path=public']) THEN
    RAISE EXCEPTION '063 rollback: dl_local_day_sync is not the 063 function - edited by hand after 063, stop';
  END IF;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before) THEN
    RAISE EXCEPTION '063 rollback: B-54 red_value is not the live trigger count % - re-measure', trg_before;
  END IF;

  -- 1. THE GUARD back to 060 (text of 060_local_relay.sql, verbatim; CREATE OR REPLACE keeps its ACL)
  CREATE OR REPLACE FUNCTION public.dl_local_line_guard() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
  BEGIN
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      RAISE EXCEPTION 'local_relay: a cancelled local payroll line is not restored - it comes back by itself when a relay of that driver and day returns'
        USING ERRCODE = '23514', HINT = 'local_relay:line_restore';
    END IF;
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
       AND EXISTS (SELECT 1 FROM local_moves lm
                    WHERE lm.driver_id = OLD.driver_id AND lm.move_date = OLD.entry_date AND lm.move_kind <> 'local'
                      AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled') THEN
      RAISE EXCEPTION 'local_relay: line % pays a live relay of that driver and day - enter value 0 or change the relay, do not cancel the line', OLD.id
        USING ERRCODE = '23514', HINT = 'local_relay:line_has_relay';
    END IF;
    RETURN NEW;
  END $f$;

  -- 2. THE SYNC back to 060 (text of 060_local_relay.sql, verbatim; CREATE OR REPLACE keeps owner
  --    and ACL, the statement repeats SECURITY DEFINER and the search_path)
  CREATE OR REPLACE FUNCTION public.dl_local_day_sync(p_driver bigint, p_day date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  DECLARE
    live dl_entries%rowtype; has_money boolean; valued boolean; anchor bigint; route_txt text;
    stamp text := ' (' || to_char(now() AT TIME ZONE 'Europe/Athens', 'DD/MM/YYYY') || ')';
    sep text := ' ' || chr(183) || ' ';
    -- Greek labels from base64 (this file stays ASCII). Transliterated:
    w_local   text := convert_from(decode('zqTOn86gzpnOms6f', 'base64'), 'UTF8');          -- TOPIKO
    w_deliv   text := convert_from(decode('z4DOsc+BzqzOtM6/z4POtw==', 'base64'), 'UTF8');  -- paradosi
    w_load    text := convert_from(decode('z4bPjM+Bz4TPic+Dzrc=', 'base64'), 'UTF8');      -- fortosi
    t_gone    text := convert_from(decode('zqTOv8+AzrnOus6tz4IgzrrOuc69zq7Pg861zrnPgjogzrrOsc68zq/OsSDOts+Jzr3PhM6xzr3OriDOus6vzr3Ot8+Dzrcgz4TOt8+CIM63zrzOrc+BzrHPgg==', 'base64'), 'UTF8');
                                    -- Topikes kiniseis: kamia zontani kinisi tis imeras
    r_gone    text := convert_from(decode('z4TOv8+AzrnOus6tz4IgzrrOuc69zq7Pg861zrnPgjogzrrOsc68zq/OsSDOts+Jzr3PhM6xzr3OriDPgM65zrE=', 'base64'), 'UTF8');
                                    -- topikes kiniseis: kamia zontani pia
    r_changed text := convert_from(decode('zqzOu867zrHOvs6xzr0gzr/OuSDPhM6/z4DOuc66zq3PgiDOus65zr3Ors+DzrXOuc+CIM+EzrfPgiDOt868zq3Pgc6xz4I=', 'base64'), 'UTF8');
                                    -- allaxan oi topikes kiniseis tis imeras
  BEGIN
    IF p_driver IS NULL OR p_day IS NULL THEN RETURN; END IF;
    -- Serialise every writer of this (driver, day). Without it two relays saved at once (api.js
    -- runs requests in parallel; two dispatchers; an order day move meeting a save) both see "no
    -- line", both INSERT, and the second dies on dl_local_day_live - taking the save with it.
    -- The day enters the key as a number: date-to-text follows DateStyle, and the SQL editor and
    -- PostgREST must take the SAME lock.
    PERFORM pg_advisory_xact_lock(hashtext('dl_local_day'), hashtext(p_driver::text || ':' || (p_day - DATE '2000-01-01')::text));

    -- OWNER-Q2 answered 5/10 (every relay driver: daily TOPIKO line): no driver is exempt and
    -- nothing about the driver is read - a live relay of his that day is the only thing that
    -- decides whether the day has a line.

    -- Label = order numbers only (Order No = orders.id, never renamed), so the label never goes
    -- stale and a changed label always means a changed set of relays.
    SELECT min(lm.id),
           w_local || sep || string_agg(CASE lm.move_kind WHEN 'relay_delivery' THEN w_deliv ELSE w_load END
                                        || ' ' || lm.parent_order_id, sep ORDER BY lm.id)
      INTO anchor, route_txt
      FROM local_moves lm
     WHERE lm.driver_id = p_driver AND lm.move_date = p_day AND lm.move_kind <> 'local'
       AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled';

    SELECT * INTO live FROM dl_entries
     WHERE driver_id = p_driver AND entry_date = p_day AND local_move_id IS NOT NULL AND deleted_at IS NULL;
    -- Money = a non-zero amount. "Value 0" is accounting saying "nothing is owed": a line holding
    -- only zeros is cancelled like an empty one, instead of waiting in review (B-08) for nothing.
    has_money := coalesce(live.trip_value, 0) <> 0 OR coalesce(live.advance, 0) <> 0 OR coalesce(live.expenses, 0) <> 0;
    -- Valued = accounting typed ANY amount, "value 0" included. Used for the relabel below, not for
    -- the cancel path: a day settled at 0 that then gets ANOTHER relay must be looked at again.
    -- With has_money there, the new relay would be settled at 0 silently - no NULL amount (not
    -- pending), a line exists (B-64 quiet). (front review, round 2, 4/10)
    valued := live.trip_value IS NOT NULL OR live.advance IS NOT NULL OR live.expenses IS NOT NULL;

    IF anchor IS NULL THEN                                  -- no live relay left that day
      IF live.id IS NULL THEN RETURN; END IF;
      IF has_money THEN                                     -- possibly owed: flag, never drop silently
        -- Skip only while the line is STILL flagged for this reason (a repeat sync adds no second
        -- note). Not "the reason is somewhere in the note": accounting's check clears the flag and
        -- keeps the note, so after clear -> relay re-added -> relay deleted again that test would
        -- leave a paid line with no relay and no flag (review round 3, 5/10).
        UPDATE dl_entries SET needs_review = true, updated_at = now(),
               review_note = concat_ws(sep, review_note, r_gone || stamp)
         WHERE id = live.id
           AND NOT (needs_review AND position(r_gone IN coalesce(review_note, '')) > 0);
      ELSE
        UPDATE dl_entries SET deleted_at = now(), updated_at = now(), deleted_reason = t_gone
         WHERE id = live.id;
      END IF;
      RETURN;
    END IF;

    IF live.id IS NULL THEN
      -- amounts stay NULL on purpose, same rule as RT lines (owner 5/9): accounting enters them
      INSERT INTO dl_entries (driver_id, entry_type, entry_date, date_end, route, local_move_id, source, created_by)
      VALUES (p_driver, 'trip', p_day, p_day, route_txt, anchor, 'auto', 'trigger:local_move');
      RETURN;
    END IF;

    -- The label belongs to the trigger, not to money: always refreshed. A changed set of relays
    -- after a value was written (even 0) goes to review (B-08); accounting clears it with a reason.
    UPDATE dl_entries SET local_move_id = anchor, route = route_txt, updated_at = now(),
           needs_review = needs_review OR (valued AND route IS DISTINCT FROM route_txt),
           review_note = CASE WHEN valued AND route IS DISTINCT FROM route_txt
                              THEN concat_ws(sep, review_note, r_changed || stamp) ELSE review_note END
     WHERE id = live.id AND (local_move_id IS DISTINCT FROM anchor OR route IS DISTINCT FROM route_txt);
  END $f$;

  -- 3. THE TRIGGER as 060 created it
  DROP TRIGGER dl_local_line_guard ON public.dl_entries;
  CREATE TRIGGER dl_local_line_guard BEFORE UPDATE OF deleted_at ON public.dl_entries
    FOR EACH ROW WHEN (OLD.local_move_id IS NOT NULL AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
    EXECUTE FUNCTION public.dl_local_line_guard();

  -- 4. PROOFS: back to the 060 fingerprints, owner and grants untouched
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure) <> '2b4de99653da7f0859f08b07a410225c' THEN
    RAISE EXCEPTION '063 rollback proof: dl_local_line_guard is not the 060 text';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure
                  AND md5(prosrc) = '297954261e9e8fe2936f6217f31f1e7a' AND prosecdef AND proconfig = ARRAY['search_path=public']) THEN
    RAISE EXCEPTION '063 rollback proof: dl_local_day_sync is not the 060 function';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure
                  AND proowner = sync_owner AND proacl::text IS NOT DISTINCT FROM sync_acl)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure
                     AND NOT prosecdef AND proconfig = ARRAY['search_path=public']
                     AND proowner = guard_owner AND proacl::text IS NOT DISTINCT FROM guard_acl) THEN
    RAISE EXCEPTION '063 rollback proof: owner, grants or settings of dl_local_day_sync / dl_local_line_guard changed';
  END IF;
  SELECT attnum INTO deleted_at_attnum FROM pg_attribute
   WHERE attrelid = 'public.dl_entries'::regclass AND attname = 'deleted_at' AND NOT attisdropped;
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.dl_entries'::regclass AND tgname = 'dl_local_line_guard' AND NOT tgisinternal
     AND tgenabled = 'O' AND tgtype = 19 AND tgfoid = 'public.dl_local_line_guard()'::regprocedure
     AND tgattr::text = deleted_at_attnum::text;
  IF n <> 1 THEN RAISE EXCEPTION '063 rollback proof: trigger dl_local_line_guard is not the 060 one'; END IF;
  IF has_function_privilege('public', 'public.dl_local_line_guard()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.dl_local_line_guard()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.dl_local_line_guard()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.dl_local_line_guard()', 'EXECUTE')
     OR has_function_privilege('public', 'public.dl_local_day_sync(bigint,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.dl_local_day_sync(bigint,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.dl_local_day_sync(bigint,date)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.dl_local_day_sync(bigint,date)', 'EXECUTE') THEN
    RAISE EXCEPTION '063 rollback proof: dl_local_line_guard or dl_local_day_sync is executable by PUBLIC/anon/authenticated/service_role';
  END IF;
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after) THEN
    RAISE EXCEPTION '063 rollback proof: trigger count % -> % (expected unchanged), or B-54 moved', trg_before, trg_after;
  END IF;
  RAISE NOTICE '063 ROLLBACK OK: guard and sync back to 060 (trigger on deleted_at only); triggers % -> %, B-54 = %', trg_before, trg_after, trg_after;
END $do$;

SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure) = '297954261e9e8fe2936f6217f31f1e7a'
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure) = '2b4de99653da7f0859f08b07a410225c'
             AND (SELECT cardinality(tgattr::int2[]) FROM pg_trigger
                   WHERE tgrelid = 'public.dl_entries'::regclass AND tgname = 'dl_local_line_guard') = 1
            THEN '063 ROLLED BACK' ELSE '063 STILL APPLIED' END AS result,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure) AS guard_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure) AS sync_md5;
