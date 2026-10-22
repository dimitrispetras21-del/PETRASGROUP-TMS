-- 069 - ONE VEROIA DAY PER VS LOAD: the cross-dock moves ONCE when its order's date moves, the order's
--       Cross-dock stop follows the cross-dock, a Ramp line follows its stop.
--
-- EXECUTED 12/10/2026 by the owner. Approved by the owner 11/10 night (question E1, docs/DECISION_LOG.md entry of 11/10 night "E1 approved").
-- The owner runs it in the Supabase SQL editor AFTER 15:00 (the team works 05:30-14:30), the evening
-- of WP-A, in this order (plan docs/weekly-natl-redesign/PLAN.md sections 3.4 and 7.1 step 1):
--   1. 069_hub_day_once_dryrun.sql          this block + a deliberate error: NOTHING kept
--   2. 069_hub_day_once.sql                 (this file)
--   3. 069_hub_day_once_verify.sql          read-only; before the repair it shows the 7
--   4. 069_hub_day_once_test.sql            the rules on TEST rows, ends in a deliberate error: nothing kept
--   5. 069_hub_day_once_repair_dryrun.sql -> 069_hub_day_once_repair.sql -> 069_hub_day_once_verify.sql (all 0)
--   6. the push of the WP-A front (branch feat/wn4-wpa-on-parity: WP-A on fix/wi4-live-parity) - THE SAME
--      EVENING (see LIMIT below).
-- No Worker change goes with it (both labels "Cross-dock Date" and "VS CD Date" already write
-- cross_dock_date). ASCII only (clipboard-safe). ONE DO block = ONE statement: an error anywhere
-- undoes all of it (the SQL editor is not atomic across statements - lesson 056).
--
-- WHY (SELECT only, 11/10): the owner's rule 11/10 21:10 - ONE Veroia day per VS load, the column
-- orders.cross_dock_date; the national load, its Veroia stop, the order's Cross-dock stop and the Ramp
-- follow it. Today three things break it:
--   - the DOUBLE MOVE. The international form wrote cross-dock = new delivery - 1 in the SAME write as
--     the new delivery, and 028 step 2 then moved that fresh value AGAIN by the delta. From 9/9: 12
--     cross-dock moves by 028, 8 of them within 3 s of a write that had already set the cross-dock, on
--     exactly the 7 orders whose cross-dock disagrees with their national load today (nl 90, 106,
--     116, 118, 120, 131, 134). The front stops sending the estimate on an existing VS order (WP-A,
--     core/vs-dates.js vsCdOnSave); this block makes the base refuse to move it twice anyway
--     (principle 4: the rule as low as it holds - every path, the future ones too).
--   - the order's Cross-dock stop (what the Ramp shows as "Paralavi" (pick-up) on an import) moved only with
--     the order's dates (028 step 1). A board's date panel changes ONLY the cross-dock: the stop
--     stayed on the old day.
--   - a Ramp line is born for the day someone opens the Ramp board and never moves: 26 of 85 lines
--     from Veroia stops sit on a day their stop no longer has (13 + 13), 18 stops have >= 2 Planned
--     lines on different days.
--
-- WHAT IT CHANGES (nothing else):
--   1. order_dates_follow() (028) - CREATE OR REPLACE from its LIVE text (prosrc md5-guarded: read
--      11/10 = the 028 file without its comment lines), with exactly TWO substitutions, generated,
--      not retyped (every other byte is the live text; proven below: the swap back gives the old
--      text byte for byte - the rollback's way):
--        a. step 2 moves cross_dock_date by the delta ONLY IF this same write did not change it
--           (old.cross_dock_date IS NOT DISTINCT FROM new.cross_dock_date). The double move is gone.
--        b. step 1 leaves the order's Cross-dock stop alone when new.cross_dock_date IS NOT NULL - the
--           new trigger (2) keeps it on the cross-dock. With an EMPTY cross-dock it moves it by the
--           delta as today: otherwise an order with no cross-dock and a dated Cross-dock stop would be
--           left behind (step 2 skipped, trigger 2 not fired). 0 such orders today; future-proofing.
--      Step 3 (the Pending Direct national load and its stops, +delta) is unchanged: the net for
--      paths without the front's sync (SQL by hand). It moves the load by the SAME delta as the
--      cross-dock, so with the double move gone the two writers (028 and the sync, which writes the
--      load ABSOLUTELY from the cross-dock) land on the same day whatever their order.
--   2. NEW order_cd_stop_follow - AFTER UPDATE OF cross_dock_date ON orders, when it changed and is
--      not NULL: the order's Cross-dock stop(s) take the cross-dock day. Catches every writer: the
--      boards' date panels, the form, Daily Ops, and 028's own step 2. A NULL cross-dock (VS closed)
--      moves nothing: the form owns the stop then.
--   3. NEW ramp_follows_stop - AFTER UPDATE OF datetime ON order_stops, when the day changed: the
--      stop's Ramp line follows. Link ramp.notes = 'STOP:' || order_stops.legacy_id (what
--      modules/daily_ramp.js writes - the facade id, NEVER the primary key; 95 of 95 live lines match,
--      SELECT 12/10). Only Planned, not postponed lines dated the stop's OLD day move (lines already
--      left on a third day are not touched: moving them too would land two lines of one stop on the
--      new day). One line per stop and day: if the new day already has a live line of the stop, the
--      old day's lines get deleted_at - never a second line. Done / postponed lines never move.
--   4. One audit_log row per move (actor trigger:<name>), as 028 does.
--   5. Born closed (principle 5): EXECUTE on the two new functions revoked from PUBLIC, anon,
--      authenticated, service_role (trigger functions are never called directly; the default ACL of a
--      new function would open them to the API roles).
--   6. Auditor B-54 (enabled triggers in public): +2 in this block. It requires red_value = the live
--      count before (35 measured 12/10), proves after = before + 2, then sets it. Local mirror
--      tms-auditor/checks/B-54.sql ("red: <> 35") + 047b are regenerated by the coordinator after the
--      run (they must not say 37 while production holds 35).
--
-- LIMIT WE ACCEPT (owner: no marker column; the "why" also sits next to the condition in 028's text):
--   "once" cannot tell "this write did not touch the cross-dock" from "this write set it to the value
--   it already had". When a write sets a new delivery AND a cross-dock equal to the old one, the
--   cross-dock still moves by the delta, against that write. Who does it: the OLD form between this
--   SQL and the front push (it sends the estimate on every save), and the estimate on a direction
--   change. Why it is acceptable: the sync that follows every such save writes the national load from
--   whatever the cross-dock is then, so the two boards never disagree; and SQL + front go the same
--   evening, which closes the old-form window. Case 6 of 069_hub_day_once_test.sql pins it.
--
-- NOT CHANGED, on purpose: the Worker; national_loads triggers (rt_sync_national_load moves round trip
-- and payroll with the load, as it should); the national load's own Veroia stop (written together with
-- the load by its two writers - the sync and 028 step 3 - 63/63 equal 11/10; the front now FAILS
-- loudly when that stops write fails); the 26 Ramp lines already on a wrong day (history, all in the
-- past, all Planned - a separate decision); 028's backfill (it ran 9/9).
--
-- REVERSE: 069_hub_day_once_rollback.sql - 028 back to its live text byte for byte, both triggers and
-- functions out, B-54 -2. Order (plan section 7.3): front first (revert + SW_VERSION), then this rollback.
--
-- EXPECTED: NOTICE "069 OK: ..." and ONE result row "069 OK | <T+2> | <T+2> | 2 | 2".
-- Anything else (an ERROR): nothing was kept - copy the message to the coordinator.

DO $do$
DECLARE
  old_src text; new_src text; back_src text;
  a_old CONSTANT text := 'where s.order_id = new.id and s.deleted_at is null and s.datetime is not null';
  a_new CONSTANT text := 'where s.order_id = new.id and s.deleted_at is null and s.datetime is not null' || E'\n'
    || '             and (s.stop_type is distinct from ''Cross-dock'' or new.cross_dock_date is null) -- 069: a dated cross-dock owns its stop (order_cd_stop_follow)';
  b_old CONSTANT text := 'if d_cd <> 0 and new.cross_dock_date is not null then';
  b_new CONSTANT text := 'if d_cd <> 0 and new.cross_dock_date is not null' || E'\n'
    || '     and old.cross_dock_date is not distinct from new.cross_dock_date then -- 069: once - never on top of a value this same write set';
  trg_before int; trg_after int; k int;
BEGIN
  -- CREATE TRIGGER on orders / order_stops takes a strong lock: behind an idle open transaction it
  -- would wait forever while every app read queues behind it. Give up after 5 s instead - the whole
  -- block rolls back, nothing half-done; run it again a little later (same as 057/060).
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (read only): the base is what was measured 11/10-12/10.
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '069: monitoring.checks does not exist (047 must run first)';
  END IF;
  IF to_regprocedure('public.order_cd_stop_follow()') IS NOT NULL OR to_regprocedure('public.ramp_follows_stop()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('order_cd_stop_follow', 'ramp_follows_stop')) THEN
    RAISE EXCEPTION '069: already applied (a 069 name exists) - run 069_hub_day_once_verify.sql instead';
  END IF;
  SELECT p.prosrc INTO old_src FROM pg_proc p WHERE p.oid = 'public.order_dates_follow()'::regprocedure;
  IF md5(old_src) <> 'e977a5a31a3cd2dce85dae6e39b0764f' THEN
    RAISE EXCEPTION '069: order_dates_follow is not the 028 text read 11/10 (md5 %) - stop, re-measure', md5(old_src);
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relname = 'orders' AND t.tgname = 'order_dates_follow' AND t.tgenabled <> 'D'
         AND md5(pg_get_triggerdef(t.oid)) = 'e95e30c69f61455a25b750224bba0f98') <> 1 THEN
    RAISE EXCEPTION '069: trigger order_dates_follow is missing, disabled or not the 028 definition - stop';
  END IF;
  -- The new triggers compare DAYS: the three columns must be DATE (order_stops.datetime IS a date).
  SELECT count(*) INTO k FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'date'
     AND ((table_name = 'orders' AND column_name = 'cross_dock_date') OR (table_name = 'order_stops' AND column_name = 'datetime')
       OR (table_name = 'ramp' AND column_name = 'plan_date') OR (table_name = 'ramp' AND column_name = 'postponed_to'));
  IF k <> 4 THEN RAISE EXCEPTION '069: cross_dock_date / order_stops.datetime / ramp.plan_date / ramp.postponed_to are not all DATE'; END IF;
  -- Each substitution target is in the live text exactly once.
  IF (length(old_src) - length(replace(old_src, a_old, ''))) <> length(a_old)
     OR (length(old_src) - length(replace(old_src, b_old, ''))) <> length(b_old) THEN
    RAISE EXCEPTION '069: a substitution target is not in order_dates_follow exactly once - stop';
  END IF;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  -- run_checks compares against coalesce(baseline, red_value): a baseline would make the bump below
  -- a no-op and B-54 a standing P1 red.
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL) THEN
    RAISE EXCEPTION '069: B-54 red_value is not the live trigger count % (or has a baseline) - a migration changed triggers without bumping it, re-measure', trg_before;
  END IF;

  -- 1. 028 from its live text, two substitutions (a, b above).
  new_src := replace(replace(old_src, a_old, a_new), b_old, b_new);
  back_src := replace(replace(new_src, a_new, a_old), b_new, b_old);
  IF back_src <> old_src OR md5(new_src) <> '4b5d279f21f981a11d35a5deb655269a' THEN
    RAISE EXCEPTION '069: the generated 028 text is not the one measured (md5 %) - stop', md5(new_src);
  END IF;
  -- CREATE OR REPLACE keeps the oid, owner, grants and the trigger that calls it.
  EXECUTE format('CREATE OR REPLACE FUNCTION public.order_dates_follow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L', new_src);
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.order_dates_follow()'::regprocedure) <> md5(new_src) THEN
    RAISE EXCEPTION '069 proof: order_dates_follow does not hold the generated text';
  END IF;

  -- 2. The order's Cross-dock stop IS the Veroia day.
  CREATE FUNCTION public.order_cd_stop_follow() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare
  r record;
begin
  -- 069 (owner 11/10 21:10, one Veroia day): the order's Cross-dock stop follows every change of a
  -- dated cross-dock - a board's date panel, the form, Daily Ops, or 028's own step 2. The UPDATE ...
  -- FROM the same row reads the old day for the audit row.
  for r in update order_stops s set datetime = new.cross_dock_date
             from order_stops o
            where o.id = s.id and s.order_id = new.id and s.stop_type = 'Cross-dock'
              and s.deleted_at is null and s.datetime is distinct from new.cross_dock_date
            returning s.id, o.datetime as old_day loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_cd_stop_follow', 'system', 'update', 'order_stops', r.id::text,
            jsonb_build_object('datetime', r.old_day),
            jsonb_build_object('datetime', new.cross_dock_date, 'order_id', new.id), now());
  end loop;
  return null;
end
$f$;
  CREATE TRIGGER order_cd_stop_follow
    AFTER UPDATE OF cross_dock_date ON public.orders
    FOR EACH ROW WHEN (old.cross_dock_date IS DISTINCT FROM new.cross_dock_date AND new.cross_dock_date IS NOT NULL)
    EXECUTE FUNCTION public.order_cd_stop_follow();

  -- 3. A Ramp line follows its stop.
  CREATE FUNCTION public.ramp_follows_stop() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
declare
  k text;
  keep_id bigint;
  r record;
begin
  -- 069: the Ramp line of a stop is linked by ramp.notes = 'STOP:' || the stop's facade id (what
  -- modules/daily_ramp.js writes), never by the primary key. Lines already on a third day are not
  -- touched: moving all of them could put two lines of one stop on the new day.
  if new.legacy_id is null then return null; end if;
  k := 'STOP:' || new.legacy_id;
  if not exists (select 1 from ramp where notes = k and deleted_at is null and status = 'Planned'
                  and postponed_to is null and plan_date = old.datetime) then
    return null;
  end if;
  -- One line per stop and day: a live line already on the new day stays the stop's line.
  select id into keep_id from ramp where notes = k and deleted_at is null and plan_date = new.datetime
   order by id limit 1;
  if keep_id is null then
    select id into keep_id from ramp where notes = k and deleted_at is null and status = 'Planned'
       and postponed_to is null and plan_date = old.datetime order by id limit 1;
    update ramp set plan_date = new.datetime where id = keep_id;
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:ramp_follows_stop', 'system', 'update', 'ramp', keep_id::text,
            jsonb_build_object('plan_date', old.datetime),
            jsonb_build_object('plan_date', new.datetime, 'stop', new.legacy_id), now());
  end if;
  -- Any other Planned line of the old day would be a SECOND line of the stop: deleted_at, never two.
  for r in update ramp set deleted_at = now()
            where notes = k and deleted_at is null and status = 'Planned' and postponed_to is null
              and plan_date = old.datetime and id <> keep_id
            returning id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:ramp_follows_stop', 'system', 'update', 'ramp', r.id::text,
            jsonb_build_object('plan_date', old.datetime, 'deleted_at', null),
            jsonb_build_object('deleted_at', now(), 'stop', new.legacy_id,
              'reason', 'the stop moved to a day that already has its line'), now());
  end loop;
  return null;
end
$f$;
  CREATE TRIGGER ramp_follows_stop
    AFTER UPDATE OF datetime ON public.order_stops
    FOR EACH ROW WHEN (old.datetime IS DISTINCT FROM new.datetime AND old.datetime IS NOT NULL AND new.datetime IS NOT NULL)
    EXECUTE FUNCTION public.ramp_follows_stop();

  -- 5. Born closed.
  REVOKE ALL ON FUNCTION public.order_cd_stop_follow(), public.ramp_follows_stop()
    FROM PUBLIC, anon, authenticated, service_role;

  -- 6. B-54: exactly two triggers more.
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before + 2 THEN
    RAISE EXCEPTION '069 proof: trigger count % -> % (expected +2)', trg_before, trg_after;
  END IF;
  UPDATE monitoring.checks SET red_value = trg_after WHERE id = 'B-54' AND red_value = trg_before;
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '069: B-54 not updated (% rows)', k; END IF;

  RAISE NOTICE '069 OK: 028 moves the cross-dock once, order_cd_stop_follow and ramp_follows_stop in place; triggers % -> %, B-54 = %', trg_before, trg_after, trg_after;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN to_regprocedure('public.order_cd_stop_follow()') IS NOT NULL AND to_regprocedure('public.ramp_follows_stop()') IS NOT NULL
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.order_dates_follow()'::regprocedure) = '4b5d279f21f981a11d35a5deb655269a'
            THEN '069 OK' ELSE '069 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgname IN ('order_cd_stop_follow', 'ramp_follows_stop')) AS new_triggers,
       (SELECT count(*) FROM pg_proc p WHERE p.proname IN ('order_cd_stop_follow', 'ramp_follows_stop')
           AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS new_functions_closed;
