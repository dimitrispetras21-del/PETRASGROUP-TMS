-- 097: a pair that got its link BEFORE the import's truck is looked at again WHEN the truck lands.
--
-- WHY (owner 2/11/2026, Dragan's return from Voitsberg, "Orders > Week"): export #602 sits on RT-1278 and its
-- matched import #606 on RT-1283 - one physical trip (truck 2), two round trips. One more since September:
-- #525 / #528 (RT-1240 / RT-1242, truck 8). Measured on production 2/11 (SELECT only, audit_log):
--   #606 / RT-1283                                 #528 / RT-1242
--   27/10 12:17:55 import gets truck 2, NOT yet    14/10 07:28:34 import gets truck 32, not matched
--                  matched -> 033 opens RT-1283    11:45:29       truck removed: RT-1242 keeps the leg,
--   28/10 10:28:49 truck removed: RT-1283 keeps                   no vehicle (013 by design: an RT waits)
--                  the leg, no vehicle (013)       11:45:51       export #525 matched to #528 -> 037 audits
--   28/10 14:26:59 export #602 matched to #606                    "split" (audit 11480), no merge: truck 8
--                  -> 037 audits "split" (audit                   vs none
--                  15254), no merge: truck 2 vs    11:45:53       import gets truck 8 -> 013 puts truck 8 on
--                  none                                           RT-1242; nothing looks at the pair again
--   28/10 14:27:01 import gets truck 2 -> 013
--                  puts truck 2 on RT-1283; nothing looks at the pair again
-- rt_link_split (037) merges a split pair only when both round trips run the same vehicle, and it runs only
-- when a LINK changes. The front end writes the link first and the import's truck a second later, so at the
-- one moment 037 looks, the import's round trip has no vehicle. rt_create_from_order (033) walks the pair only
-- for an order WITHOUT a live leg; the import already had one. The split stays. B-77 saw both within the hour
-- (114 red runs each) but is P2: no push.
--
-- WHAT: ONE new trigger, rt_y_link_split_vehicle, AFTER UPDATE OF truck_id, partner_id, is_partner_trip ON
-- orders, WHEN one of them changed: it calls the SAME rt_link_split() (text unchanged, md5 below). Its name
-- sorts after rt_sync_from_order and before rt_z_auto_close_order (PostgreSQL fires same-event triggers in name
-- order), so it looks when 013 has already put the new vehicle on the order's round trip - the moment the two
-- round trips run the same truck. Same-vehicle export-only + import-only = 037's one merge shape: rt_merge keeps
-- the older round trip (its cost lines, its payroll line), moves the leg, cancels the other (never deletes it),
-- and dl_sync_from_rt soft-deletes that one's empty payroll line. Any other shape = 037's "split" audit row, no
-- merge (a pair on two trucks stays two trips: 033's own rule). B-54 (count of public triggers) moves by one.
-- Nothing is repaired here: the two existing pairs are 097b, a separate file.
-- KNOWN LIMIT (037's, unchanged; code review 2/11, owner to decide): the merge compares trucks only and keeps the
-- older round trip's driver and trailer. An import given the export's truck with ANOTHER driver ends on the export's
-- round trip with its own driver on the order: B-06 (round trip vehicle/driver <> order) and B-05 (two drivers on one
-- round trip) show it within the hour - P2, so no push (see B-77 above).
--
-- WHEN: after 15:00 (the team works 05:30-14:30), after the owner's explicit yes in chat.
-- BEFORE IT: 097_rt_split_vehicle_recheck_dryrun.sql - this same block, generated from this file, undone.
-- EXPECTED: NOTICE "097 OK: ..." and ONE result row "097 OK | T+1 | T+1 | B-77 value" where T = the public trigger
--   count before (60 on 2/11). B-77 is 1 until 097b repairs the pair it names (#602 / #606).
--   A red error = nothing changed (one DO block): stop, copy the panel.
-- AFTER IT: 097_rt_split_vehicle_recheck_verify.sql (read-only). Reverse: 097_rt_split_vehicle_recheck_rollback.sql.
--
-- THIS FILE IS ASCII ONLY (pbcopy corrupted Greek on 27/9). ONE DO block (056/058: the SQL editor is not atomic
-- across statements; inside ONE DO block any RAISE rolls back everything), then ONE read-only SELECT.
-- Measured on production 2/11 (pg_get_functiondef): rt_link_split md5(def) d8a4a03dca0e8e26d4e8d227f1287590,
-- md5(prosrc) 6f954b256f103f1c6a8f8ab400a67808 (066); rt_merge md5(prosrc) 41d629e48ba519c458848a9572b346c8 (037);
-- rt_sync_from_order md5(prosrc) 1a1c357803bc1c0c7368e1ba5b1335cc (082); public triggers 60 = B-54.

DO $do$
DECLARE
  fn_split oid; fn_merge oid; fn_sync oid;
  trg_before int; trg_after int; orders_before bigint; rts_before bigint; legs_before bigint;
  names text[]; r record; v numeric; ids text[]; b77 numeric; b77_ids text;
BEGIN
  -- pg_get_triggerdef prints names relative to the search_path (trigger proof below): pin it.
  PERFORM set_config('search_path', 'public, extensions', true);
  -- CREATE TRIGGER takes a SHARE ROW EXCLUSIVE lock on orders: never queue the app behind an idle transaction.
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (SELECT only)
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '097: monitoring.checks does not exist (047 must run first)';
  END IF;
  fn_split := to_regprocedure('public.rt_link_split()');
  fn_merge := to_regprocedure('public.rt_merge(bigint,bigint,text)');
  fn_sync  := to_regprocedure('public.rt_sync_from_order()');
  IF fn_split IS NULL OR fn_merge IS NULL OR fn_sync IS NULL THEN
    RAISE EXCEPTION '097: rt_link_split / rt_merge / rt_sync_from_order missing - stop';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'rt_y_link_split_vehicle') THEN
    RAISE EXCEPTION '097: already applied (trigger rt_y_link_split_vehicle exists)';
  END IF;
  -- the new trigger calls rt_link_split as it is, and relies on 013 putting the vehicle on the round trip first:
  -- refuse if any of the three moved since 2/11 (re-measure, then re-prove on the copy)
  IF md5(pg_get_functiondef(fn_split)) <> 'd8a4a03dca0e8e26d4e8d227f1287590'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = fn_split) <> '6f954b256f103f1c6a8f8ab400a67808'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = fn_merge) <> '41d629e48ba519c458848a9572b346c8'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = fn_sync)  <> '1a1c357803bc1c0c7368e1ba5b1335cc' THEN
    RAISE EXCEPTION '097: rt_link_split, rt_merge or rt_sync_from_order is not the text measured 2/11 - re-measure';
  END IF;
  -- firing order: no other trigger may sort between rt_sync_from_order and rt_z_auto_close_order (it would fire
  -- between 013 and the new trigger and could see, or make, a half-done state)
  SELECT array_agg(tgname::text ORDER BY tgname) INTO names FROM pg_trigger
   WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
     AND tgname > 'rt_sync_from_order' AND tgname < 'rt_z_auto_close_order';
  IF names IS NOT NULL THEN
    RAISE EXCEPTION '097: a trigger sorts between rt_sync_from_order and rt_z_auto_close_order (%) - re-measure', names;
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal AND tgenabled = 'O'
        AND ((tgname = 'rt_sync_from_order' AND tgfoid = fn_sync) OR (tgname = 'rt_link_split' AND tgfoid = fn_split))) <> 2 THEN
    RAISE EXCEPTION '097: triggers rt_sync_from_order / rt_link_split on orders are not both there and enabled - stop';
  END IF;
  -- B-54 counts enabled non-internal public triggers; it must be green before (= the live count, no baseline)
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL) THEN
    RAISE EXCEPTION '097: B-54 red_value is not the live trigger count % (or has a baseline) - re-measure', trg_before;
  END IF;
  SELECT count(*) INTO orders_before FROM public.orders;
  SELECT count(*) INTO rts_before FROM public.ct_round_trips;
  SELECT count(*) INTO legs_before FROM public.ct_rt_legs;

  -- 1. THE ONE CHANGE: rt_link_split also runs when an order's vehicle changes. No existing row is touched: it
  --    acts on the next vehicle write to an order of a split pair.
  CREATE TRIGGER rt_y_link_split_vehicle
    AFTER UPDATE OF truck_id, partner_id, is_partner_trip ON public.orders
    FOR EACH ROW
    WHEN (old.truck_id IS DISTINCT FROM new.truck_id OR old.partner_id IS DISTINCT FROM new.partner_id
          OR old.is_partner_trip IS DISTINCT FROM new.is_partner_trip)
    EXECUTE FUNCTION public.rt_link_split();
  UPDATE monitoring.checks SET red_value = trg_before + 1 WHERE id = 'B-54';

  -- 2. PROOFS inside the block: any failure rolls back everything above.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'rt_y_link_split_vehicle'
                   AND tgfoid = fn_split AND tgenabled = 'O' AND NOT tgisinternal
                   AND md5(pg_get_triggerdef(oid)) = 'b1db54c1bcc73d086bc6cfa06a3e677e') THEN
    RAISE EXCEPTION '097 proof: rt_y_link_split_vehicle is not the trigger proven on the copy';
  END IF;
  SELECT array_agg(tgname::text ORDER BY tgname) INTO names FROM pg_trigger
   WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
     AND tgname >= 'rt_sync_from_order' AND tgname <= 'rt_z_auto_close_order';
  IF names IS DISTINCT FROM ARRAY['rt_sync_from_order', 'rt_y_link_split_vehicle', 'rt_z_auto_close_order'] THEN
    RAISE EXCEPTION '097 proof: firing order is not rt_sync_from_order -> rt_y_link_split_vehicle -> rt_z_auto_close_order (%)', names;
  END IF;
  IF md5(pg_get_functiondef(fn_split)) <> 'd8a4a03dca0e8e26d4e8d227f1287590' THEN
    RAISE EXCEPTION '097 proof: rt_link_split changed';
  END IF;
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before + 1
     OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after AND baseline IS NULL) THEN
    RAISE EXCEPTION '097 proof: triggers % -> % or B-54 does not equal them', trg_before, trg_after;
  END IF;
  IF (SELECT count(*) FROM public.orders) <> orders_before
     OR (SELECT count(*) FROM public.ct_round_trips) <> rts_before
     OR (SELECT count(*) FROM public.ct_rt_legs) <> legs_before THEN
    -- 097 writes none of them; a save by someone else in the same second also lands here (fails closed)
    RAISE EXCEPTION '097 proof: orders, round trips or legs changed while the block ran - nothing was kept; run it again in a few minutes';
  END IF;
  -- B-54 and B-77 run the way run_checks (047) runs them: guard, 10 s, as tms_check_runner. B-77 is reported,
  -- not required: it measures data (the split pairs 097b repairs), not 097.
  FOR r IN SELECT id, sql_text, ids_sql FROM monitoring.checks WHERE id IN ('B-54', 'B-77') AND enabled ORDER BY id LOOP
    PERFORM monitoring.check_sql_guard(r.sql_text);
    IF r.ids_sql IS NOT NULL THEN PERFORM monitoring.check_sql_guard(r.ids_sql); END IF;
    PERFORM set_config('statement_timeout', '10000', true);
    SET LOCAL ROLE tms_check_runner;
    EXECUTE r.sql_text INTO v;
    ids := NULL;
    IF r.ids_sql IS NOT NULL THEN EXECUTE r.ids_sql INTO ids; END IF;
    RESET ROLE;
    IF v IS NULL THEN RAISE EXCEPTION '097 proof: % returned NULL', r.id; END IF;
    IF r.id = 'B-54' AND v IS DISTINCT FROM trg_after::numeric THEN
      RAISE EXCEPTION '097 proof: B-54 = % right after the migration (expected %)', v, trg_after;
    END IF;
    IF r.id = 'B-77' THEN b77 := v; b77_ids := coalesce(array_to_string(ids, ','), ''); END IF;
  END LOOP;

  RAISE NOTICE '097 OK: rt_link_split also runs on a vehicle change (rt_y_link_split_vehicle, after rt_sync_from_order); triggers % -> %, B-54 = %; B-77 = % (ids %)',
    trg_before, trg_after, trg_after, b77, b77_ids;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'rt_y_link_split_vehicle' AND tgenabled = 'O')
            THEN '097 OK' ELSE '097 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
