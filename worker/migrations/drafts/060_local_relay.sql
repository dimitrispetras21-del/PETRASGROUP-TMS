-- 060 - LOCAL RELAY, phase 1 (international orders only): a local driver does the delivery
--       (import) or the loading (export) of an international order while the order, its round
--       trip (RT), its trip value and its payroll line stay with the international driver.
--
-- DRAFT - NOT EXECUTED. The owner runs it in the Supabase SQL editor AFTER 15:00 (team works
-- 05:30-14:30), with an explicit yes in the conversation. Order of the release: this SQL ->
-- Worker (branch deploy/worker-local-relay) -> screens. The Worker and the screens must not go
-- live before this block; the block can go live first. Its only visible effect before the
-- screens: Weekly International's old "local move (Veroia)" form (0 rows ever written) can no
-- longer save a move bound to an ORDER (local_moves_kind_parent) - the screens replace that form.
--
-- THIS FILE IS ASCII ONLY, on purpose: a clipboard transfer corrupted Greek text on 27/9
-- (pbcopy). Greek labels stored in the data are built from base64 (convert_from/decode);
-- refusal messages are ASCII and carry a machine code in HINT, the Greek text per code lives in
-- the Worker (same convention as the stock-lots Worker, SQLSTATE 23514 + HINT 'family:code').
--
-- ONE DO block (lesson of 056/058: the SQL editor is not atomic across statements; inside ONE DO
-- block any RAISE rolls back everything, so either all of 060 exists or none of it), then ONE
-- read-only SELECT that prints the result row. No temp tables.
--
-- Why (owner 4/10/2026, plan .claude/plans/local-relay-plan.md v4, coordinator corrections 4/10):
--   Today the only way to say "a local driver delivered this import / loaded this export" is to
--   change the driver ON THE ORDER, which moves the whole round trip, the matched export and the
--   payroll to the local driver - the international driver silently loses his trip. A relay is a
--   row in local_moves bound to the order (local_moves was built 10/8 for exactly this and has
--   0 rows). The order is never written by a relay.
--   Owner answers (one at a time, via the coordinator):
--     Q1 vehicle: BOTH happen - the local drives the SAME truck while the international rests, or
--        his OWN tractor with a trailer swap. truck_id NULL = same truck as the order; trailer
--        is always recorded when a local driver is set.
--     Q2 pay: BOTH kinds of drivers exist - salaried drivers (fixed monthly pay): their relays are
--        a track record only, NO payroll line; per-trip drivers: ONE payroll line per local
--        driver per day, amount entered by accounting (never automatic, "value 0" allowed).
--        Pay basis unknown (NULL) behaves as per-trip so pay is never silently lost, and the
--        auditor (B-64) lists those drivers until accounting classifies them.
--        Marked in code: OWNER-Q2 answered 4/10 (both: salary = track record only,
--        per_trip = daily TOPIKO line).
--     Q3 rest/availability: NOT built ("we do not use the available-drivers view yet, we skip
--        this part, later we build it properly"). No handover column, no availability change.
--     Q4 the international's trip value is never auto-reduced (OWNER-Q4 default): accounting
--        sees the relay on the RT line through dl_v_entries.relay_info.
--   Weekly National (Sotiris, from Mon 5/10) keeps its plain local moves EXACTLY as today:
--   move_kind 'local' (default), Parent Nat Load allowed, no derived status, no new refusal, no
--   payroll. Relays are Phase 1 international only; national relays (Phase 1b) wait for Q5.
--
-- What it creates (all names checked free in the guards):
--   drivers.pay_basis text NULL ('salary' | 'per_trip' | NULL = unknown) + drivers_pay_basis_chk
--   local_moves.move_kind ('local' | 'relay_delivery' | 'relay_loading'), 6 CHECKs, UNIQUE
--     local_moves_relay_once (one live relay of each kind per order)
--   trigger local_moves_before (BEFORE INSERT/UPDATE on local_moves): relay rules + derived
--     status + derived day (= the order's customer day; orders dates are DATE)
--   order_soft_delete_unlink (023) = the live text VERBATIM + step 6 (soft-delete the relays of a
--     deleted order). Generated below from the md5-guarded live definition, not retyped.
--   trigger local_moves_follow_order (AFTER UPDATE on orders): order cancelled -> relays
--     Cancelled; order day moved -> relay day follows. Never refuses an order edit.
--   dl_entries.local_move_id (FK), CHECKs dl_one_origin / dl_lm_is_trip, UNIQUE
--     dl_local_day_live (driver, day) - the rule "one line per local driver per day" lives here.
--   dl_local_day_sync(driver, day) - SECURITY DEFINER, advisory lock per (driver, day), callable
--     by nobody but its owner; triggers dl_sync_from_local_move (local_moves) and
--     dl_local_pay_basis_sync (drivers.pay_basis) call it.
--   dl_v_entries: the 30 columns unchanged + local_move_id + relay_info (jsonb, ASCII keys).
--   monitoring: B-09 excludes local lines (same run, so B-09 never sees a local line first);
--     new B-63 / B-64 / B-65; B-54 trigger count +4 (27 -> 31 measured 4/10).
--
-- Refusal codes (SQLSTATE 23514, HINT 'local_relay:<code>', ASCII message) - the Worker maps
-- them to 422 with a Greek text: kind_locked, final, status, no_order, partner, points,
-- no_trailer, order_gone, preorder, vs, direction, split_parent, relay_exists, same_driver,
-- no_order_date. Row CHECKs cannot carry a hint; the Worker maps them by constraint name:
-- local_moves_kind_chk, local_moves_kind_parent, local_moves_relay_points,
-- local_moves_relay_status, local_moves_relay_executor, local_moves_relay_trailer,
-- drivers_pay_basis_chk, dl_one_origin, dl_lm_is_trip; unique (23505): local_moves_relay_once,
-- dl_local_day_live.
--
-- Measured read-only 4/10 (Supabase MCP, SELECT only): local_moves 0 rows, 0 triggers;
-- order_soft_delete_unlink md5 7b873ab86adbfb2db10590e0c47f87bc; dl_v_entries md5
-- c81a268c7312574d10da6c78ef316326 (search_path pinned below); B-09 md5 b8f8d0e7.../b96ff398...;
-- B-54 red_value 27 = 27 enabled non-internal triggers in public; B-63..B-65 free (B-59..B-62
-- taken by 058). Tested end to end on a local PGlite copy of the production schema (catalog read
-- 4/10): this block, the dry run, the verify SELECTs and the rollback.
--
-- ORDER WITH 057 (stock lots): 057 adds 4 triggers and does not touch B-54. If 057 runs first,
-- the B-54 guard below refuses (red_value 27 <> live count 31) - correct and loud: re-measure,
-- bump the guard, never force.
-- Reverse: worker/migrations/drafts/060_local_relay_rollback.sql (refuses once relays or pay
-- bases exist - data would be lost).

DO $do$
DECLARE
  n int; k int;
  trg_before int; trg_after int;
  dl_live_before bigint; orders_before bigint; rts_before bigint;
  old_unlink text; new_unlink text; tail text; step6 text;
  old_view text; new_view text; view_acl_before text; view_cols_before int; sel_prefix text; old_joins text;
  r record; v numeric; ids text[];
BEGIN
  -- pg_get_viewdef (md5 guard below) prints names relative to the search_path: pin it.
  PERFORM set_config('search_path', 'public, extensions', true);

  -- 0. GUARDS (SELECT only): the base is what was measured on 4/10.
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '060: monitoring.checks does not exist (047 must run first)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
              AND ((table_name = 'local_moves' AND column_name = 'move_kind')
                OR (table_name = 'drivers' AND column_name = 'pay_basis')
                OR (table_name = 'dl_entries' AND column_name = 'local_move_id'))) THEN
    RAISE EXCEPTION '060: already applied (a 060 column exists)';
  END IF;
  IF to_regprocedure('public.local_moves_before()') IS NOT NULL
     OR to_regprocedure('public.local_moves_follow_order()') IS NOT NULL
     OR to_regprocedure('public.dl_local_day_sync(bigint,date)') IS NOT NULL
     OR to_regprocedure('public.dl_sync_from_local_move()') IS NOT NULL
     OR to_regprocedure('public.dl_local_pay_basis_sync()') IS NOT NULL
     OR to_regclass('public.local_moves_relay_once') IS NOT NULL
     OR to_regclass('public.dl_local_day_live') IS NOT NULL THEN
    RAISE EXCEPTION '060: a name 060 creates is taken - stop';
  END IF;
  -- Plain rows written by Weekly National before this runs are welcome (they become 'local').
  -- A row naming an ORDER would violate local_moves_kind_parent: decide before running.
  SELECT count(*) INTO n FROM public.local_moves WHERE parent_order_id IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '060: % local_moves rows carry parent_order_id (old Weekly International local UI) - ask the coordinator', n;
  END IF;
  -- orders dates are DATE (national_loads are timestamptz): the relay day is compared as is.
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders'
     AND column_name IN ('loading_datetime', 'delivery_datetime') AND data_type = 'date';
  IF n <> 2 THEN RAISE EXCEPTION '060: orders loading/delivery_datetime are not both DATE'; END IF;
  -- Two objects are extended from their live text: refuse if either changed since 4/10.
  old_unlink := pg_get_functiondef('public.order_soft_delete_unlink()'::regprocedure);
  IF md5(old_unlink) <> '7b873ab86adbfb2db10590e0c47f87bc' THEN
    RAISE EXCEPTION '060: order_soft_delete_unlink changed since 4/10 (md5 %) - re-measure', md5(old_unlink);
  END IF;
  old_view := pg_get_viewdef('public.dl_v_entries'::regclass);
  IF md5(old_view) <> 'c81a268c7312574d10da6c78ef316326' THEN
    RAISE EXCEPTION '060: dl_v_entries changed since 4/10 (md5 %) - re-measure', md5(old_view);
  END IF;
  SELECT relacl::text INTO view_acl_before FROM pg_class WHERE oid = 'public.dl_v_entries'::regclass;
  SELECT count(*) INTO view_cols_before FROM pg_attribute
   WHERE attrelid = 'public.dl_v_entries'::regclass AND attnum > 0 AND NOT attisdropped;
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-09'
                  AND md5(sql_text) = 'b8f8d0e705f8466a3f6305c9e38c544f'
                  AND md5(coalesce(ids_sql, '')) = 'b96ff398c369f06b6eb9c99d343e155c') THEN
    RAISE EXCEPTION '060: B-09 is not the text measured on 4/10 - production was edited, stop';
  END IF;
  IF EXISTS (SELECT 1 FROM monitoring.checks WHERE id IN ('B-63', 'B-64', 'B-65')) THEN
    RAISE EXCEPTION '060: check ids B-63..B-65 are taken - ask the coordinator';
  END IF;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before) THEN
    RAISE EXCEPTION '060: B-54 red_value is not the live trigger count % - another migration ran in between (057?), re-measure', trg_before;
  END IF;
  SELECT count(*) INTO dl_live_before FROM public.dl_entries WHERE deleted_at IS NULL;
  SELECT count(*) INTO orders_before FROM public.orders WHERE deleted_at IS NULL;
  SELECT count(*) INTO rts_before FROM public.ct_round_trips;

  -- 1. PAY BASIS OF A DRIVER. OWNER-Q2 answered 4/10 (both: salary = track record only,
  --    per_trip = daily TOPIKO line). NULL = unknown = paid like per_trip until classified.
  --    Not drivers.type: it holds Internal/External (2 rows, 79 NULL) - another meaning, and two
  --    meanings in one column is two truths (principle 3).
  ALTER TABLE public.drivers ADD COLUMN pay_basis text;
  ALTER TABLE public.drivers ADD CONSTRAINT drivers_pay_basis_chk CHECK (pay_basis IN ('salary', 'per_trip'));

  -- 2. WHAT A LOCAL MOVE IS. Plain rows (Weekly National) default to 'local' and keep every
  --    freedom they have today; only relays are constrained.
  ALTER TABLE public.local_moves ADD COLUMN move_kind text NOT NULL DEFAULT 'local';
  ALTER TABLE public.local_moves
    ADD CONSTRAINT local_moves_kind_chk CHECK (move_kind IN ('local', 'relay_delivery', 'relay_loading')),
    -- ONE way to say "a local driver worked on this international order": a relay. A plain move
    -- never names an order (Weekly National's "assign to local driver" names a national load and
    -- stays allowed). Phase 1: relays serve international orders only.
    ADD CONSTRAINT local_moves_kind_parent CHECK (
         (move_kind = 'local' AND parent_order_id IS NULL)
      OR (move_kind <> 'local' AND parent_order_id IS NOT NULL AND parent_nat_load_id IS NULL)),
    -- A relay stores ONLY the handover point; the customer's stops are read live from the order.
    ADD CONSTRAINT local_moves_relay_points CHECK (
          (move_kind <> 'relay_delivery' OR (from_location_id IS NOT NULL AND to_location_id IS NULL))
      AND (move_kind <> 'relay_loading' OR (to_location_id IS NOT NULL AND from_location_id IS NULL))),
    -- "Done" is the order's status (Delivered / In Transit), never copied into the relay; the
    -- relay's own status is derived from the driver (local_moves_before) and only that.
    ADD CONSTRAINT local_moves_relay_status CHECK (
         move_kind = 'local' OR status = 'Cancelled'
      OR (status = 'Assigned' AND driver_id IS NOT NULL) OR (status = 'Pending' AND driver_id IS NULL)),
    -- A partner relay would leave no cost trace anywhere (phase 1: own drivers only).
    ADD CONSTRAINT local_moves_relay_executor CHECK (move_kind = 'local' OR partner_id IS NULL),
    -- The RT keeps ONE trailer (rt_sync); the relay records what the local driver pulls (Q1).
    ADD CONSTRAINT local_moves_relay_trailer CHECK (move_kind = 'local' OR driver_id IS NULL OR trailer_id IS NOT NULL);
  CREATE UNIQUE INDEX local_moves_relay_once ON public.local_moves (parent_order_id, move_kind)
    WHERE deleted_at IS NULL AND status <> 'Cancelled' AND move_kind <> 'local';

  -- 3. RELAY RULES AT WRITE TIME. The CHECKs above are the floor (principle 4); this trigger
  --    refuses first with a machine code the Worker turns into a Greek 422 (principle 1), and
  --    derives what nobody types: status from the driver, day from the order.
  CREATE FUNCTION public.local_moves_before() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
  DECLARE o record; d date;
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      NEW.updated_at := now();
      -- Kind and order are what the payroll line and the auditor key on: never re-pointed.
      IF (OLD.move_kind <> 'local' OR NEW.move_kind <> 'local')
         AND (NEW.move_kind, NEW.parent_order_id, NEW.parent_nat_load_id)
             IS DISTINCT FROM (OLD.move_kind, OLD.parent_order_id, OLD.parent_nat_load_id) THEN
        RAISE EXCEPTION 'local_relay: the kind and the order of a relay never change - delete it and add a new one'
          USING ERRCODE = '23514', HINT = 'local_relay:kind_locked';
      END IF;
    END IF;
    -- Plain local moves (Weekly National, move_kind 'local'): today's behaviour exactly - no
    -- derived status, no refusal here (coordinator 4/10). An unknown kind falls through to
    -- local_moves_kind_chk.
    IF NEW.move_kind IS DISTINCT FROM 'relay_delivery' AND NEW.move_kind IS DISTINCT FROM 'relay_loading' THEN
      RETURN NEW;
    END IF;
    -- Un-deleting or un-cancelling would bring back a relay whose order may have moved on
    -- (rule of 023): the dispatcher adds a new one.
    IF TG_OP = 'UPDATE' AND ((OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)
                             OR (OLD.status = 'Cancelled' AND NEW.status IS DISTINCT FROM 'Cancelled')) THEN
      RAISE EXCEPTION 'local_relay: a deleted or cancelled relay is not revived - add a new one'
        USING ERRCODE = '23514', HINT = 'local_relay:final';
    END IF;
    IF NEW.status IS NULL OR NEW.status IN ('Pending', 'Assigned') THEN
      NEW.status := CASE WHEN NEW.driver_id IS NOT NULL THEN 'Assigned' ELSE 'Pending' END;
    ELSIF NEW.status <> 'Cancelled' THEN
      RAISE EXCEPTION 'local_relay: a relay is Pending, Assigned or Cancelled - done is read from the order'
        USING ERRCODE = '23514', HINT = 'local_relay:status';
    END IF;
    IF NEW.deleted_at IS NOT NULL OR NEW.status = 'Cancelled' THEN
      RETURN NEW;                                   -- gone: nothing more to check, nothing paid
    END IF;
    IF NEW.parent_order_id IS NULL OR NEW.parent_nat_load_id IS NOT NULL THEN
      RAISE EXCEPTION 'local_relay: a relay serves exactly one international order'
        USING ERRCODE = '23514', HINT = 'local_relay:no_order';
    END IF;
    IF NEW.partner_id IS NOT NULL THEN
      RAISE EXCEPTION 'local_relay: a partner cannot be the local driver of a relay (phase 1)'
        USING ERRCODE = '23514', HINT = 'local_relay:partner';
    END IF;
    IF (NEW.move_kind = 'relay_delivery' AND (NEW.from_location_id IS NULL OR NEW.to_location_id IS NOT NULL))
       OR (NEW.move_kind = 'relay_loading' AND (NEW.to_location_id IS NULL OR NEW.from_location_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'local_relay: a local delivery stores only From (the handover point), a local loading only To'
        USING ERRCODE = '23514', HINT = 'local_relay:points';
    END IF;
    IF NEW.driver_id IS NOT NULL AND NEW.trailer_id IS NULL THEN
      RAISE EXCEPTION 'local_relay: with a local driver the trailer is required'
        USING ERRCODE = '23514', HINT = 'local_relay:no_trailer';
    END IF;

    SELECT id, direction, veroia_switch, status, ops_status, deleted_at, driver_id, loading_datetime, delivery_datetime
      INTO o FROM orders WHERE id = NEW.parent_order_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'local_relay: order % does not exist', NEW.parent_order_id
        USING ERRCODE = '23514', HINT = 'local_relay:no_order';
    END IF;
    -- Shape of the ORDER is checked when the relay is written; an order that changes later is
    -- never blocked - B-65 reports the mismatch the next day.
    IF TG_OP = 'INSERT' THEN
      IF o.deleted_at IS NOT NULL OR o.status = 'Cancelled' THEN
        RAISE EXCEPTION 'local_relay: order % is deleted or cancelled', o.id
          USING ERRCODE = '23514', HINT = 'local_relay:order_gone';
      END IF;
      IF o.ops_status = 'Provisional' THEN
        RAISE EXCEPTION 'local_relay: order % is a pre-order - convert it first', o.id
          USING ERRCODE = '23514', HINT = 'local_relay:preorder';
      END IF;
      IF coalesce(o.veroia_switch, false) THEN
        RAISE EXCEPTION 'local_relay: order % goes through Veroia Switch (cross-dock)', o.id
          USING ERRCODE = '23514', HINT = 'local_relay:vs';
      END IF;
      IF o.direction IS DISTINCT FROM (CASE NEW.move_kind WHEN 'relay_delivery' THEN 'Import' ELSE 'Export' END) THEN
        RAISE EXCEPTION 'local_relay: a local delivery only on an import, a local loading only on an export (order %)', o.id
          USING ERRCODE = '23514', HINT = 'local_relay:direction';
      END IF;
      IF EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id = o.id AND l.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'local_relay: order % is split - put the relay on the leg', o.id
          USING ERRCODE = '23514', HINT = 'local_relay:split_parent';
      END IF;
      -- local_moves_relay_once is the floor; this only gives the refusal its code.
      IF EXISTS (SELECT 1 FROM local_moves x WHERE x.parent_order_id = o.id AND x.move_kind = NEW.move_kind
                    AND x.deleted_at IS NULL AND x.status <> 'Cancelled') THEN
        RAISE EXCEPTION 'local_relay: order % already has a live relay of this kind', o.id
          USING ERRCODE = '23514', HINT = 'local_relay:relay_exists';
      END IF;
    END IF;
    -- The relay exists because ANOTHER driver does this part; checked whenever the driver is set.
    IF NEW.driver_id IS NOT NULL AND NEW.driver_id = o.driver_id
       AND (TG_OP = 'INSERT' OR NEW.driver_id IS DISTINCT FROM OLD.driver_id) THEN
      RAISE EXCEPTION 'local_relay: the local driver is the international driver of order %', o.id
        USING ERRCODE = '23514', HINT = 'local_relay:same_driver';
    END IF;
    -- The relay day IS the order's customer day (orders dates are DATE: no time zone). Derived,
    -- never typed: a typed Date is replaced, so the Daily, the payroll day and the order agree.
    d := CASE NEW.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END;
    IF d IS NOT NULL THEN
      NEW.move_date := d;
    ELSIF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'local_relay: order % has no % date', o.id,
        CASE NEW.move_kind WHEN 'relay_delivery' THEN 'delivery' ELSE 'loading' END
        USING ERRCODE = '23514', HINT = 'local_relay:no_order_date';
    END IF;  -- an UPDATE after the order lost its date keeps the last day (never block); B-65 'day'
    RETURN NEW;
  END $f$;
  CREATE TRIGGER local_moves_before BEFORE INSERT OR UPDATE ON public.local_moves
    FOR EACH ROW EXECUTE FUNCTION public.local_moves_before();

  -- 4. DELETING AN ORDER already has ONE home: order_soft_delete_unlink (023). Its new text is
  --    the live text (md5-guarded above) with step 6 inserted before the final return - steps
  --    1-5 are not retyped, so they cannot drift.
  tail := E'  return null;\nend $function$\n';
  IF (length(old_unlink) - length(replace(old_unlink, tail, ''))) <> length(tail) THEN
    RAISE EXCEPTION '060: the end of order_soft_delete_unlink is not where it was measured';
  END IF;
  step6 := $s6$  -- 6. local relays (060): a deleted order takes its local delivery/loading with it.
  --    dl_sync_from_local_move then cancels the local driver's day line, or flags it for review
  --    when amounts were written. Split legs reach here too (step 3 re-fires this trigger).
  for r in update local_moves lm set deleted_at = new.deleted_at
           where lm.parent_order_id = new.id and lm.deleted_at is null returning lm.id loop
    insert into audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    values ('trigger:order_unlink', 'system', 'delete', 'local_moves', r.id::text,
            jsonb_build_object('parent_order_id', new.id), jsonb_build_object('reason', procedure_note), now());
  end loop;
$s6$;
  new_unlink := replace(old_unlink, tail, step6 || tail);
  EXECUTE new_unlink;

  -- 5. THE ORDER MOVES, THE RELAY FOLLOWS. Cancel and day moves only, per kind; an audit row only
  --    when something really changed. Never refuses: an order edit is never blocked by a relay.
  CREATE FUNCTION public.local_moves_follow_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  DECLARE r record;
  BEGIN
    IF NEW.deleted_at IS NOT NULL THEN RETURN NULL; END IF;     -- deletion belongs to 023 step 6
    IF NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
      FOR r IN UPDATE local_moves lm SET status = 'Cancelled'
               WHERE lm.parent_order_id = NEW.id AND lm.move_kind <> 'local'
                 AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled'
               RETURNING lm.id LOOP
        INSERT INTO audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
        VALUES ('trigger:local_moves_follow', 'system', 'update', 'local_moves', r.id::text,
                jsonb_build_object('parent_order_id', NEW.id),
                jsonb_build_object('status', 'Cancelled', 'reason', 'order ' || NEW.id || ' cancelled'), now());
      END LOOP;
      RETURN NULL;
    END IF;
    -- Un-cancelling the order never revives a relay (local_moves_before refuses it).
    FOR r IN UPDATE local_moves lm
             SET move_date = CASE lm.move_kind WHEN 'relay_delivery' THEN NEW.delivery_datetime ELSE NEW.loading_datetime END
             WHERE lm.parent_order_id = NEW.id AND lm.move_kind <> 'local'
               AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled'
               AND (   (lm.move_kind = 'relay_delivery' AND NEW.delivery_datetime IS NOT NULL
                        AND lm.move_date IS DISTINCT FROM NEW.delivery_datetime)
                    OR (lm.move_kind = 'relay_loading' AND NEW.loading_datetime IS NOT NULL
                        AND lm.move_date IS DISTINCT FROM NEW.loading_datetime))
             RETURNING lm.id, lm.move_date LOOP
      INSERT INTO audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
      VALUES ('trigger:local_moves_follow', 'system', 'update', 'local_moves', r.id::text,
              jsonb_build_object('parent_order_id', NEW.id),
              jsonb_build_object('move_date', r.move_date, 'reason', 'order ' || NEW.id || ' day moved'), now());
    END LOOP;
    RETURN NULL;
  END $f$;
  CREATE TRIGGER local_moves_follow_order
    AFTER UPDATE OF status, loading_datetime, delivery_datetime ON public.orders
    FOR EACH ROW WHEN (
         (NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled')
      OR OLD.delivery_datetime IS DISTINCT FROM NEW.delivery_datetime
      OR OLD.loading_datetime IS DISTINCT FROM NEW.loading_datetime)
    EXECUTE FUNCTION public.local_moves_follow_order();

  -- 6. PAYROLL: ONE line per (local driver, day), from relays only. rt_id stays NULL on purpose:
  --    ct_v_rt_costs and dl_rt_live key on one ledger line per RT - the international's.
  ALTER TABLE public.dl_entries ADD COLUMN local_move_id bigint REFERENCES public.local_moves (id);
  ALTER TABLE public.dl_entries
    ADD CONSTRAINT dl_one_origin CHECK (rt_id IS NULL OR local_move_id IS NULL),
    ADD CONSTRAINT dl_lm_is_trip CHECK (local_move_id IS NULL OR entry_type = 'trip');
  -- The rule against paying a groupage three times lives here, not in a screen.
  CREATE UNIQUE INDEX dl_local_day_live ON public.dl_entries (driver_id, entry_date)
    WHERE local_move_id IS NOT NULL AND deleted_at IS NULL;

  CREATE FUNCTION public.dl_local_day_sync(p_driver bigint, p_day date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  DECLARE
    live dl_entries%rowtype; has_amounts boolean; anchor bigint; route_txt text; salaried boolean;
    stamp text := ' (' || to_char(now() AT TIME ZONE 'Europe/Athens', 'DD/MM/YYYY') || ')';
    sep text := ' ' || chr(183) || ' ';
    -- Greek labels from base64 (this file stays ASCII). Transliterated:
    w_local   text := convert_from(decode('zqTOn86gzpnOms6f', 'base64'), 'UTF8');          -- TOPIKO
    w_deliv   text := convert_from(decode('z4DOsc+BzqzOtM6/z4POtw==', 'base64'), 'UTF8');  -- paradosi
    w_load    text := convert_from(decode('z4bPjM+Bz4TPic+Dzrc=', 'base64'), 'UTF8');      -- fortosi
    t_gone    text := convert_from(decode('zqTOv8+AzrnOus6tz4IgzrrOuc69zq7Pg861zrnPgjogzrrOsc68zq/OsSDOts+Jzr3PhM6xzr3OriDOus6vzr3Ot8+Dzrcgz4TOt8+CIM63zrzOrc+BzrHPgg==', 'base64'), 'UTF8');
                                    -- Topikes kiniseis: kamia zontani kinisi tis imeras
    t_salary  text := convert_from(decode('zqTOv8+AzrnOus6tz4IgzrrOuc69zq7Pg861zrnPgjogzr8gzr/OtM63zrPPjM+CIM61zq/Ovc6xzrkgzrzOuc+DzrjPic+Ez4zPgiAozrzPjM69zr8gzrnPg8+Ezr/Pgc65zrrPjCk=', 'base64'), 'UTF8');
                                    -- Topikes kiniseis: o odigos einai misthotos (mono istoriko)
    r_gone    text := convert_from(decode('z4TOv8+AzrnOus6tz4IgzrrOuc69zq7Pg861zrnPgjogzrrOsc68zq/OsSDOts+Jzr3PhM6xzr3OriDPgM65zrE=', 'base64'), 'UTF8');
                                    -- topikes kiniseis: kamia zontani pia
    r_salary  text := convert_from(decode('zr8gzr/OtM63zrPPjM+CIM6tzrPOuc69zrUgzrzOuc+DzrjPic+Ez4zPgiAozrzPjM69zr8gzrnPg8+Ezr/Pgc65zrrPjCk=', 'base64'), 'UTF8');
                                    -- o odigos egine misthotos (mono istoriko)
    r_changed text := convert_from(decode('zqzOu867zrHOvs6xzr0gzr/OuSDPhM6/z4DOuc66zq3PgiDOus65zr3Ors+DzrXOuc+CIM+EzrfPgiDOt868zq3Pgc6xz4I=', 'base64'), 'UTF8');
                                    -- allaxan oi topikes kiniseis tis imeras
  BEGIN
    IF p_driver IS NULL OR p_day IS NULL THEN RETURN; END IF;
    -- Serialise every writer of this (driver, day). Without it two relays saved at once (api.js
    -- runs requests in parallel; two dispatchers; an order day move meeting a save) both see "no
    -- line", both INSERT, and the second dies on dl_local_day_live - taking the save with it.
    PERFORM pg_advisory_xact_lock(hashtext('dl_local_day'), hashtext(p_driver::text || ':' || p_day::text));

    -- OWNER-Q2 answered 4/10 (both: salary = track record only, per_trip = daily TOPIKO line).
    -- NULL (unknown) is paid like per_trip: pay is never silently lost; B-64 lists the driver.
    SELECT coalesce(d.pay_basis = 'salary', false) INTO salaried FROM drivers d WHERE d.id = p_driver;
    salaried := coalesce(salaried, false);

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
    has_amounts := live.trip_value IS NOT NULL OR live.advance IS NOT NULL OR live.expenses IS NOT NULL;

    IF anchor IS NULL OR salaried THEN                      -- nothing to pay by a line that day
      IF live.id IS NULL THEN RETURN; END IF;
      IF has_amounts THEN                                   -- money written: flag, never drop silently
        UPDATE dl_entries SET needs_review = true, updated_at = now(),
               review_note = concat_ws(sep, review_note, CASE WHEN salaried THEN r_salary ELSE r_gone END || stamp)
         WHERE id = live.id
           AND position(CASE WHEN salaried THEN r_salary ELSE r_gone END IN coalesce(review_note, '')) = 0;
      ELSE
        UPDATE dl_entries SET deleted_at = now(), updated_at = now(),
               deleted_reason = CASE WHEN salaried THEN t_salary ELSE t_gone END
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
    -- after amounts were written goes to review (B-08).
    UPDATE dl_entries SET local_move_id = anchor, route = route_txt, updated_at = now(),
           needs_review = needs_review OR (has_amounts AND route IS DISTINCT FROM route_txt),
           review_note = CASE WHEN has_amounts AND route IS DISTINCT FROM route_txt
                              THEN concat_ws(sep, review_note, r_changed || stamp) ELSE review_note END
     WHERE id = live.id AND (local_move_id IS DISTINCT FROM anchor OR route IS DISTINCT FROM route_txt);
  END $f$;

  CREATE FUNCTION public.dl_sync_from_local_move() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  BEGIN
    -- Plain local moves are never paid by a line (Weekly National errands, as today).
    IF NEW.move_kind = 'local' THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' AND (OLD.driver_id, OLD.move_date) IS DISTINCT FROM (NEW.driver_id, NEW.move_date) THEN
      -- fixed lock order (earlier day, then lower driver id first): two crossing moves cannot deadlock
      IF (OLD.move_date, coalesce(OLD.driver_id, 0)) < (NEW.move_date, coalesce(NEW.driver_id, 0)) THEN
        PERFORM dl_local_day_sync(OLD.driver_id, OLD.move_date);
        PERFORM dl_local_day_sync(NEW.driver_id, NEW.move_date);
      ELSE
        PERFORM dl_local_day_sync(NEW.driver_id, NEW.move_date);
        PERFORM dl_local_day_sync(OLD.driver_id, OLD.move_date);
      END IF;
    ELSE
      PERFORM dl_local_day_sync(NEW.driver_id, NEW.move_date);
    END IF;
    RETURN NULL;
  END $f$;
  -- Only what changes who/when is paid; kind and order are immutable (step 3); time, pallets,
  -- notes, trailer, truck do not touch payroll.
  CREATE TRIGGER dl_sync_from_local_move
    AFTER INSERT OR UPDATE OF driver_id, move_date, deleted_at, status ON public.local_moves
    FOR EACH ROW EXECUTE FUNCTION public.dl_sync_from_local_move();

  CREATE FUNCTION public.dl_local_pay_basis_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  DECLARE d date;
  BEGIN
    -- OWNER-Q2 answered 4/10 (both: salary = track record only, per_trip = daily TOPIKO line).
    -- The pay basis decides whether a relay day is paid by a line, so every such day of this
    -- driver is re-synced: to 'salary' -> lines without amounts are cancelled, lines with amounts
    -- go to review (money never disappears silently); to per_trip/NULL -> missing lines appear.
    -- The pay basis is an attribute of the driver, not of the day: a change applies to every
    -- relay day of the driver, past ones included (a real salary <-> per-trip change is rare;
    -- its effect is visible - lines without amounts appear or are cancelled - never silent).
    -- Ascending days = the lock order of dl_sync_from_local_move (no deadlock).
    FOR d IN SELECT lm.move_date FROM local_moves lm
              WHERE lm.driver_id = NEW.id AND lm.move_kind <> 'local'
                AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled'
             UNION
             SELECT e.entry_date FROM dl_entries e
              WHERE e.driver_id = NEW.id AND e.local_move_id IS NOT NULL AND e.deleted_at IS NULL
             ORDER BY 1 LOOP
      PERFORM dl_local_day_sync(NEW.id, d);
    END LOOP;
    RETURN NULL;
  END $f$;
  CREATE TRIGGER dl_local_pay_basis_sync
    AFTER UPDATE OF pay_basis ON public.drivers
    FOR EACH ROW WHEN (OLD.pay_basis IS DISTINCT FROM NEW.pay_basis)
    EXECUTE FUNCTION public.dl_local_pay_basis_sync();

  -- 7. THE LEDGER VIEW: the 30 columns exactly as today (deparsed text of 4/10, proven below
  --    against the live definition) + two appended (CREATE OR REPLACE VIEW only allows appending;
  --    owner and grants are kept). relay_info is jsonb with ASCII keys - the screens render it:
  --      local day line: {"kind":"local_day","pay_basis":null|"per_trip"|"salary",
  --                       "moves":[{"id","rec","move_kind","order_id","order_rec","reference","rt_code"}]}
  --        (pay_basis null = show "pay basis unknown" on the line - read live, never stale)
  --      RT line with relays on its orders: {"kind":"rt","relays":[{"id","rec","move_kind",
  --                       "order_id","reference","driver_id","driver_name","move_date"}]}
  --        (OWNER-Q4 default: the international's value is never reduced; accounting sees this)
  --      anything else: NULL. No amounts in relay_info.
  CREATE OR REPLACE VIEW public.dl_v_entries WITH (security_invoker = true) AS
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
      e.expenses_auto,
      e.local_move_id,
      CASE WHEN e.local_move_id IS NOT NULL THEN lr.info ELSE rl.info END AS relay_info
     FROM (((dl_entries e
       LEFT JOIN ct_round_trips rt ON ((rt.id = e.rt_id)))
       LEFT JOIN dl_v_rt_route rr ON ((rr.rt_id = e.rt_id)))
       LEFT JOIN LATERAL ( SELECT count(*) AS n,
              sum((l.net + COALESCE(l.vat, (0)::numeric))) AS s
             FROM ct_cost_lines l
            WHERE ((l.rt_id = e.rt_id) AND (l.pay_source = 'CASH'::text))) c ON ((e.rt_id IS NOT NULL)))
       -- local day line -> its relays and the RTs they serve (live, so an RT made later shows)
       LEFT JOIN LATERAL ( SELECT jsonb_build_object(
                'kind', 'local_day',
                'pay_basis', (SELECT d.pay_basis FROM drivers d WHERE d.id = e.driver_id),
                'moves', coalesce(jsonb_agg(jsonb_build_object(
                    'id', lm.id, 'rec', lm.legacy_id, 'move_kind', lm.move_kind,
                    'order_id', lm.parent_order_id, 'order_rec', o.legacy_id, 'reference', o.reference,
                    'rt_code', r2.code) ORDER BY lm.id), '[]'::jsonb)) AS info
             FROM local_moves lm
             JOIN orders o ON o.id = lm.parent_order_id
             LEFT JOIN ct_rt_legs l2 ON l2.order_id = lm.parent_order_id
             LEFT JOIN ct_round_trips r2 ON r2.id = l2.rt_id AND r2.status <> 'cancelled'
            WHERE lm.driver_id = e.driver_id AND lm.move_date = e.entry_date AND lm.move_kind <> 'local'
              AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled') lr ON e.local_move_id IS NOT NULL
       -- international RT line -> who did the local part, when (no amounts)
       LEFT JOIN LATERAL ( SELECT jsonb_build_object('kind', 'rt', 'relays', jsonb_agg(jsonb_build_object(
                    'id', lm.id, 'rec', lm.legacy_id, 'move_kind', lm.move_kind, 'order_id', lm.parent_order_id,
                    'reference', o.reference, 'driver_id', lm.driver_id, 'driver_name', d.full_name,
                    'move_date', lm.move_date) ORDER BY lm.id)) AS info
             FROM ct_rt_legs l3
             JOIN local_moves lm ON lm.parent_order_id = l3.order_id AND lm.move_kind <> 'local'
                                AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled'
             JOIN orders o ON o.id = lm.parent_order_id
             LEFT JOIN drivers d ON d.id = lm.driver_id
            WHERE l3.rt_id = e.rt_id
           HAVING count(*) > 0) rl ON e.rt_id IS NOT NULL;

  -- 8. BORN CLOSED (principle 5): Supabase's default ACL gives EXECUTE on every new function to
  --    PUBLIC, anon, authenticated and service_role. Trigger functions are never called directly
  --    and EXECUTE is not checked when a trigger fires; dl_local_day_sync is callable and SECURITY
  --    DEFINER - only its owner (postgres, via the two SECURITY DEFINER triggers) may run it.
  REVOKE ALL ON FUNCTION public.local_moves_before(), public.local_moves_follow_order(),
    public.dl_local_day_sync(bigint, date), public.dl_sync_from_local_move(), public.dl_local_pay_basis_sync()
    FROM PUBLIC, anon, authenticated, service_role;

  -- 9. AUDITOR in the SAME run, so B-09 never sees a local line first. Texts = the catalog files
  --    tms-auditor/checks/B-09, B-63, B-64, B-65 .sql (generated, base64 for Greek; md5-proven below).
  --    B-09 sql/ids/exceptions only: every column the owner may have changed by hand stays.
  UPDATE monitoring.checks SET
    sql_text = $m$SELECT count(*) FROM dl_entries d WHERE d.entry_type='trip' AND d.source='auto' AND d.deleted_at IS NULL AND d.local_move_id IS NULL
 AND (d.rt_id IS NULL OR EXISTS (SELECT 1 FROM ct_round_trips r WHERE r.id=d.rt_id AND r.status='cancelled'))$m$,
    ids_sql = $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT d.id::text AS x FROM dl_entries d WHERE d.entry_type='trip' AND d.source='auto' AND d.deleted_at IS NULL AND d.local_move_id IS NULL
 AND (d.rt_id IS NULL OR EXISTS (SELECT 1 FROM ct_round_trips r WHERE r.id=d.rt_id AND r.status='cancelled')) LIMIT 50) s$m$,
    exceptions = convert_from(decode('c291cmNlPSdleGNlbCcgKM65z4PPhM6/z4HOuc66z4wgNi85KSDPgM6/z4TOrS4gzpPPgc6xzrzOvM6tz4Igz4TOv8+AzrnOus6/z40gzr/OtM63zrPOv8+NIChsb2NhbF9tb3ZlX2lkLCDPh8+Jz4HOr8+CIM6zz43Pgc6/IM61zrogz4PPh861zrTOuc6xz4POvM6/z40pIM61zrrPhM+Mz4I6IM+EzrnPgiDOtc67zq3Os8+HzrXOuSDOvyBCLTY0Lg==', 'base64'), 'UTF8')
   WHERE id = 'B-09';
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '060: B-09 updated % rows', k; END IF;
  INSERT INTO monitoring.checks (id, title, flows, sql_text, ids_sql, entity_table, red_op, red_value, baseline, severity,
    schedule_tag, is_queue, impact, next_step, exceptions, tolerance, enabled, disabled_reason) VALUES
    ($m$B-63$m$,
     convert_from(decode('zqTOv8+AzrnOus6uIM+AzrHPgc6szrTOv8+Dzrcvz4bPjM+Bz4TPic+Dzrcgz4fPic+Bzq/PgiDPhM6/z4DOuc66z4wgzr/OtM63zrPPjCAoz4POrs68zrXPgc6xLCDOsc+Nz4HOuc6/IM6uIM61zrrPgM+Bz4zOuM61z4POvM63KQ==', 'base64'), 'UTF8'),
     ARRAY[$m$F-22$m$,$m$F-35$m$]::text[],
     $m$SELECT count(*) FROM local_moves lm JOIN orders o ON o.id=lm.parent_order_id
 WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND lm.driver_id IS NULL
 AND lm.move_date <= (now() AT TIME ZONE 'Europe/Athens')::date + 1
 AND NOT (coalesce(o.status,'')='Delivered' OR (lm.move_kind='relay_loading' AND coalesce(o.status,'')='In Transit'))$m$,
     $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(lm.legacy_id, lm.id::text) AS x FROM local_moves lm JOIN orders o ON o.id=lm.parent_order_id
 WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND lm.driver_id IS NULL
 AND lm.move_date <= (now() AT TIME ZONE 'Europe/Athens')::date + 1
 AND NOT (coalesce(o.status,'')='Delivered' OR (lm.move_kind='relay_loading' AND coalesce(o.status,'')='In Transit')) LIMIT 50) s$m$,
     $m$local_moves$m$,
     $m$>$m$,
     0,
     NULL,
     $m$P2$m$,
     $m$hourly$m$,
     false,
     convert_from(decode('zpcgz4DOsc+BzrHOs86zzrXOu86vzrEgzrTOt867z47OuM63zrrOtSDCq868zrUgz4TOv8+AzrnOus+MIM6/zrTOt86zz4zCuyDOsc67zrvOrCDOus6xzr3Otc6vz4IgzrTOtc69IM6/z4HOr8+Dz4TOt866zrU6IM+Dz4TOuc+CIDA1OjMwIM+Ezr8gzpfOvM61z4HOrs+DzrnOvyDOtM61zq/Ph869zrXOuSDCq86kzp/OoC4gzqDOoc6fzqMgzpHOnc6RzpjOlc6jzpfCuyDOus6xzrkgzrcgz4DOsc+BzqzOtM6/z4POty/Phs+Mz4HPhM+Jz4POtyDOtM61zr0gzq3Ph861zrkgzrXOus+EzrXOu861z4PPhM6uLg==', 'base64'), 'UTF8'),
     convert_from(decode('zpXOss60zr/OvM6xzrTOuc6xzq/OvyDOlM65zrXOuM69z47OvSDihpIgzrcgz4DOsc+BzrHOs86zzrXOu86vzrEg4oaSIMKr4oCmzrzOtSDPhM6/z4DOuc66z4wgzr/OtM63zrPPjMK7OiDPgM6/zrnOv8+CIM+EzrfOvSDOus6szr3Otc65OyAozrHOvc6szrPOvc+Jz4POtyk=', 'base64'), 'UTF8'),
     convert_from(decode('zpzOtc+Ez4HOrCDOvM+Mzr3OvyDPhM6/z4DOuc66zq3PgiDOvM61IM+AzrHPgc6xzrPOs861zrvOr86xIChyZWxheV9kZWxpdmVyeS9yZWxheV9sb2FkaW5nKSDOvM61IM68zq3Pgc6xIM6tz4nPgiDOsc+Nz4HOuc6/ICjOkc64zq7Ovc6xKSDOriDOtc66z4DPgc+MzrjOtc+DzrzOtc+CLiDOoM6xz4HOsc6zzrPOtc67zq/OsSDOrs60zrcgRGVsaXZlcmVkICjOriBJbiBUcmFuc2l0IM6zzrnOsSDPhM6/z4DOuc66zq4gz4bPjM+Bz4TPic+DzrcpIM61zrrPhM+Mz4I6IM63IM60zr/Phc67zrXOuc6sIM6tzrPOuc69zrUuIM6fzrkgzrHPgM67zq3PgiDPhM6/z4DOuc66zq3PgiDOus65zr3Ors+DzrXOuc+CIM+Ezr/PhSDOlc6yzrTOv868zrHOtM65zrHOr86/z4UgzpXOuM69zrnOus+Ozr0gKG1vdmVfa2luZD0nbG9jYWwnKSDOtc66z4TPjM+CLg==', 'base64'), 'UTF8'),
     NULL,
     true,
     NULL),
    ($m$B-64$m$,
     convert_from(decode('zqTOv8+AzrnOus+Mz4Igzr/OtM63zrPPjM+CIOKGlCDOvM65z4POuM6/zrTOv8+Dzq/OsSAozrTOv8+FzrvOtc65zqwgz4fPic+Bzq/PgiDOs8+BzrHOvM68zq4sIM6zz4HOsc68zrzOriDPh8+Jz4HOr8+CIM60zr/Phc67zrXOuc6sLCDOrM6zzr3Pic+Dz4TOv8+CIM+Ez43PgM6/z4IgzrHOvM6/zrnOss6uz4Ip', 'base64'), 'UTF8'),
     ARRAY[$m$F-22$m$,$m$F-35$m$]::text[],
     $m$SELECT (SELECT count(*) FROM (SELECT lm.driver_id, lm.move_date FROM local_moves lm JOIN drivers d ON d.id=lm.driver_id
   WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND coalesce(d.pay_basis,'')<>'salary'
   GROUP BY lm.driver_id, lm.move_date) k
  WHERE NOT EXISTS (SELECT 1 FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND e.driver_id=k.driver_id AND e.entry_date=k.move_date))
 + (SELECT count(*) FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review
  AND NOT EXISTS (SELECT 1 FROM local_moves lm WHERE lm.move_kind<>'local' AND lm.driver_id=e.driver_id AND lm.move_date=e.entry_date AND lm.deleted_at IS NULL AND lm.status<>'Cancelled'))
 + (SELECT count(*) FROM dl_entries e JOIN drivers d ON d.id=e.driver_id WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review AND d.pay_basis='salary')
 + (SELECT count(*) FROM drivers d WHERE d.pay_basis IS NULL
  AND EXISTS (SELECT 1 FROM local_moves lm WHERE lm.driver_id=d.id AND lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled'))$m$,
     $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT 'unpaid:' || k.driver_id || ':' || k.move_date AS x FROM (SELECT lm.driver_id, lm.move_date FROM local_moves lm JOIN drivers d ON d.id=lm.driver_id
   WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND coalesce(d.pay_basis,'')<>'salary'
   GROUP BY lm.driver_id, lm.move_date) k
  WHERE NOT EXISTS (SELECT 1 FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND e.driver_id=k.driver_id AND e.entry_date=k.move_date)
 UNION ALL SELECT 'orphan:' || e.id FROM dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review
  AND NOT EXISTS (SELECT 1 FROM local_moves lm WHERE lm.move_kind<>'local' AND lm.driver_id=e.driver_id AND lm.move_date=e.entry_date AND lm.deleted_at IS NULL AND lm.status<>'Cancelled')
 UNION ALL SELECT 'salaried:' || e.id FROM dl_entries e JOIN drivers d ON d.id=e.driver_id WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review AND d.pay_basis='salary'
 UNION ALL SELECT 'paybasis:' || d.id FROM drivers d WHERE d.pay_basis IS NULL
  AND EXISTS (SELECT 1 FROM local_moves lm WHERE lm.driver_id=d.id AND lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled') LIMIT 50) s$m$,
     NULL,
     $m$>$m$,
     0,
     NULL,
     $m$P2$m$,
     $m$hourly$m$,
     false,
     convert_from(decode('zqTOv8+AzrnOus+Mz4Igzr/OtM63zrPPjM+CIM+Azr/PhSDPgM67zrfPgc+Ozr3Otc+EzrHOuSDOsc69zqwgzrTPgc6/zrzOv867z4zOs865zr8gzrzOrc69zrXOuSDPh8+Jz4HOr8+CIM6zz4HOsc68zrzOriDCq86kzp/OoM6ZzprOn8K7ICjOsc+AzrvOrs+Bz4nPhM63IM60zr/Phc67zrXOuc6sKSwgzq4gz4XPgM6sz4HPh861zrkgzrPPgc6xzrzOvM6uIM+Hz4nPgc6vz4IgzrTOv8+FzrvOtc65zqwgzq4gz4POtSDOvM65z4POuM+Jz4TPjMK3IM6uIM6/IM6/zrTOt86zz4zPgiDOrc66zrHOvc61IM+Ezr/PgM65zrrOriDPh8+Jz4HOr8+CIM60zrfOu8+JzrzOrc69zr8gz4TPjc+Azr8gzrHOvM6/zrnOss6uz4Iu', 'base64'), 'UTF8'),
     convert_from(decode('zpzOuc+DzrjOv860zr/Pg86vzrEg4oaSIM6/IM6/zrTOt86zz4zPgiDihpIgzrcgzrzOrc+BzrHCtyDOs865zrEgwqtwYXliYXNpc8K7IM6fzrTOt86zzr/OryDihpIgzr8gzr/OtM63zrPPjM+CIOKGkiDCq86kz43PgM6/z4IgzrHOvM6/zrnOss6uz4LCuyAozrHOvc6szrPOvc+Jz4POtyku', 'base64'), 'UTF8'),
     convert_from(decode('zpzOuc+DzrjPic+Ezr/OryAocGF5X2Jhc2lzPSdzYWxhcnknKTogzrcgz4TOv8+AzrnOus6uIM+Ezr/Phc+CIM61zq/Ovc6xzrkgzrzPjM69zr8gzrnPg8+Ezr/Pgc65zrrPjCwgzqfOqc6hzpnOoyDOs8+BzrHOvM68zq4gKG93bmVyIDQvMTApLiDOhs6zzr3Pic+Dz4TOv8+CIM+Ez43PgM6/z4IgKM66zrXOvc+MKSA9IM+DzrHOvSDOsc69zqwgzrTPgc6/zrzOv867z4zOs865zr8sIM+Oz4PPhM61IM69zrEgzrzOtyDPh86xzrjOtc6vIM+AzrvOt8+Bz4nOvM6uIOKAlCDOus6xzrkgzrHOvc6xz4bOrc+BzrXPhM6xzrkgz4nPgiDCq3BheWJhc2lzwrsgzrzOrc+Hz4HOuSDOvc6xIM60zrfOu8+JzrjOtc6vLiDOk8+BzrHOvM68zq3PgiDCq864zq3Ou861zrkgzq3Ou861zrPPh86/wrsgzrXOus+Ez4zPgiAoz4TOuc+CIM68zrXPhM+Bzqwgzr8gQi0wOCkuIGlkczogdW5wYWlkOjzOv860zrfOs8+Mz4I+OjzOvM6tz4HOsT4gwrcgb3JwaGFuOjzOs8+BzrHOvM68zq4+IMK3IHNhbGFyaWVkOjzOs8+BzrHOvM68zq4+IMK3IHBheWJhc2lzOjzOv860zrfOs8+Mz4I+Lg==', 'base64'), 'UTF8'),
     NULL,
     true,
     NULL),
    ($m$B-65$m$,
     convert_from(decode('zqTOv8+AzrnOus6uIM+AzrHPgc6szrTOv8+Dzrcvz4bPjM+Bz4TPic+DzrcgzrHPg8+Fzr3Otc+Azq7PgiDOvM61IM+EzrfOvSDPgM6xz4HOsc6zzrPOtc67zq/OsSDPhM63z4I=', 'base64'), 'UTF8'),
     ARRAY[$m$F-22$m$,$m$F-35$m$]::text[],
     $m$SELECT count(*) FROM local_moves lm JOIN orders o ON o.id=lm.parent_order_id
 WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND (
 o.deleted_at IS NOT NULL OR coalesce(o.status,'')='Cancelled' OR coalesce(o.ops_status,'')='Provisional'
 OR (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END) IS NULL
 OR lm.move_date <> (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END)
 OR lm.driver_id = o.driver_id OR lm.truck_id = o.truck_id OR coalesce(o.veroia_switch,false)
 OR coalesce(o.direction,'') <> (CASE lm.move_kind WHEN 'relay_delivery' THEN 'Import' ELSE 'Export' END)
 OR EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id=o.id AND l.deleted_at IS NULL))$m$,
     $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT coalesce(lm.legacy_id, lm.id::text) || ':' || CASE
 WHEN o.deleted_at IS NOT NULL OR coalesce(o.status,'')='Cancelled' THEN 'parent'
 WHEN coalesce(o.ops_status,'')='Provisional' THEN 'preorder'
 WHEN (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END) IS NULL
   OR lm.move_date <> (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END) THEN 'day'
 WHEN lm.driver_id = o.driver_id THEN 'same-driver'
 WHEN lm.truck_id = o.truck_id THEN 'truck-copy'
 WHEN coalesce(o.veroia_switch,false) THEN 'vs'
 WHEN coalesce(o.direction,'') <> (CASE lm.move_kind WHEN 'relay_delivery' THEN 'Import' ELSE 'Export' END) THEN 'direction'
 ELSE 'split' END AS x
 FROM local_moves lm JOIN orders o ON o.id=lm.parent_order_id
 WHERE lm.move_kind<>'local' AND lm.deleted_at IS NULL AND lm.status<>'Cancelled' AND (
 o.deleted_at IS NOT NULL OR coalesce(o.status,'')='Cancelled' OR coalesce(o.ops_status,'')='Provisional'
 OR (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END) IS NULL
 OR lm.move_date <> (CASE lm.move_kind WHEN 'relay_delivery' THEN o.delivery_datetime ELSE o.loading_datetime END)
 OR lm.driver_id = o.driver_id OR lm.truck_id = o.truck_id OR coalesce(o.veroia_switch,false)
 OR coalesce(o.direction,'') <> (CASE lm.move_kind WHEN 'relay_delivery' THEN 'Import' ELSE 'Export' END)
 OR EXISTS (SELECT 1 FROM orders l WHERE l.parent_order_id=o.id AND l.deleted_at IS NULL)) LIMIT 50) s$m$,
     NULL,
     $m$>$m$,
     0,
     NULL,
     $m$P3$m$,
     $m$daily$m$,
     false,
     convert_from(decode('zpcgz4TOv8+AzrnOus6uIM60zrXOvSDPhM6xzrnPgc65zqzOts61zrkgz4DOuc6xIM68zrUgz4TOt869IM+AzrHPgc6xzrPOs861zrvOr86xOiDOu86szrjOv8+CIM68zq3Pgc6xIM+Dz4TOvyDOl868zrXPgc6uz4POuc6/IM66zrHOuSDPg8+EzrcgzrzOuc+DzrjOv860zr/Pg86vzrEgz4TOv8+FIM+Ezr/PgM65zrrOv8+NLCDOriDPhM6/z4DOuc66zq4gz4DOrM69z4kgz4POtSDPgM6xz4HOsc6zzrPOtc67zq/OsSDPgM6/z4UgzrTOtc69IM64zrEgzrXOus+EzrXOu861z4PPhM61zq8gzq3PhM+Dzrku', 'base64'), 'UTF8'),
     convert_from(decode('zpXOss60zr/OvM6xzrTOuc6xzq/OvyDOlM65zrXOuM69z47OvSDihpIgzrcgz4DOsc+BzrHOs86zzrXOu86vzrE6IM60zrnPjM+BzrjPic+DzrUgzq4gz4POss6uz4POtSDPhM63zr0gz4TOv8+AzrnOus6uICjOsc69zqzOs869z4nPg863KS4=', 'base64'), 'UTF8'),
     convert_from(decode('aWRzID0gPM61zrPOs8+BzrHPhs6uPjo8zrvPjM6zzr/Pgj4sIM6tzr3Osc+CIM67z4zOs86/z4IgzrHOvc6sIM+Ezr/PgM65zrrOriDOvM61IM6xz4XPhM6uIM+Ezrcgz4POtc65z4HOrDogcGFyZW50ICjPg86yzrfPg868zq3Ovc63L86xzrrPhc+Bz4nOvM6tzr3OtyDPgM6xz4HOsc6zzrPOtc67zq/OsSkgwrcgcHJlb3JkZXIgwrcgZGF5ICjOvM6tz4HOsSDiiaAgzrzOrc+BzrEgz4DOtc67zqzPhM63IM6uIM66zrXOvc6uKSDCtyBzYW1lLWRyaXZlciAozr8gz4TOv8+AzrnOus+Mz4IgPSDOvyDOtM65zrXOuM69zq7PgikgwrcgdHJ1Y2stY29weSAoz4TOvyDCq86szrvOu86/wrsgz4bOv8+Bz4TOt86zz4wgPSDPhM63z4Igz4DOsc+BzrHOs86zzrXOu86vzrHPgikgwrcgdnMgwrcgZGlyZWN0aW9uIMK3IHNwbGl0ICjOtyDPgM6xz4HOsc6zzrPOtc67zq/OsSDPg8+AzqzPg8+EzrfOus61IM+DzrUgz4POus6tzrvOtykuIM6XIM6yzqzPg863IM6xz4HOvc61zq/PhM6xzrkgz4TOsSDOr860zrnOsSDPjM+EzrHOvSDOs8+BzqzPhs61z4TOsc65IM63IM+Ezr/PgM65zrrOrsK3IM61zrTPjiDPhs6xzq/Ovc6/zr3PhM6xzrkgz4zPg86xIM+Az4HOv86tzrrPhc+IzrHOvSDOsc+Az4wgzrHOu867zrHOs86uIM+EzrfPgiDPgM6xz4HOsc6zzrPOtc67zq/Osc+CIM68zrXPhM6sLg==', 'base64'), 'UTF8'),
     NULL,
     true,
     NULL);
  -- B-54 counts enabled non-internal triggers in public: 060 adds exactly 4.
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before + 4 THEN
    RAISE EXCEPTION '060 proof: trigger count % -> % (expected +4)', trg_before, trg_after;
  END IF;
  UPDATE monitoring.checks SET red_value = trg_after WHERE id = 'B-54' AND red_value = trg_before;
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 1 THEN RAISE EXCEPTION '060: B-54 not updated (% rows)', k; END IF;

  -- 10. PROOFS inside the block: any failure rolls back everything above.
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = 'public.local_moves'::regclass AND contype = 'c'
     AND conname IN ('local_moves_kind_chk', 'local_moves_kind_parent', 'local_moves_relay_points',
                     'local_moves_relay_status', 'local_moves_relay_executor', 'local_moves_relay_trailer');
  IF n <> 6 THEN RAISE EXCEPTION '060 proof: local_moves CHECKs %/6', n; END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = 'public.dl_entries'::regclass AND contype = 'c'
     AND conname IN ('dl_one_origin', 'dl_lm_is_trip');
  IF n <> 2 THEN RAISE EXCEPTION '060 proof: dl_entries CHECKs %/2', n; END IF;
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'public.dl_entries'::regclass AND contype = 'f' AND confrelid = 'public.local_moves'::regclass;
  IF n <> 1 THEN RAISE EXCEPTION '060 proof: dl_entries.local_move_id FK %/1', n; END IF;
  SELECT count(*) INTO n FROM pg_constraint WHERE conrelid = 'public.drivers'::regclass AND conname = 'drivers_pay_basis_chk';
  IF n <> 1 THEN RAISE EXCEPTION '060 proof: drivers_pay_basis_chk missing'; END IF;
  SELECT count(*) INTO n FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname IN ('local_moves_relay_once', 'dl_local_day_live') AND i.indisunique AND i.indisvalid;
  IF n <> 2 THEN RAISE EXCEPTION '060 proof: unique indexes %/2', n; END IF;
  SELECT count(*) INTO n FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O'
     AND (   (tgrelid = 'public.local_moves'::regclass AND tgname IN ('local_moves_before', 'dl_sync_from_local_move'))
          OR (tgrelid = 'public.orders'::regclass AND tgname = 'local_moves_follow_order')
          OR (tgrelid = 'public.drivers'::regclass AND tgname = 'dl_local_pay_basis_sync'));
  IF n <> 4 THEN RAISE EXCEPTION '060 proof: triggers %/4', n; END IF;
  -- 023 = the old text + step 6, character for character
  IF pg_get_functiondef('public.order_soft_delete_unlink()'::regprocedure) <> new_unlink
     OR position('update local_moves lm set deleted_at' IN new_unlink) = 0
     OR position('partner_assignments' IN new_unlink) = 0 THEN
    RAISE EXCEPTION '060 proof: order_soft_delete_unlink is not the 4/10 text + step 6';
  END IF;
  -- dl_v_entries: the 30 old columns deparse exactly as before, the old joins are intact, two
  -- columns appended, same options and grants.
  new_view := pg_get_viewdef('public.dl_v_entries'::regclass);
  sel_prefix := left(old_view, position('e.expenses_auto' IN old_view) + length('e.expenses_auto') - 1);
  old_joins := substring(old_view FROM 'LEFT JOIN ct_round_trips rt.*c ON \(\(e\.rt_id IS NOT NULL\)\)');
  IF left(new_view, length(sel_prefix)) <> sel_prefix OR old_joins IS NULL OR position(old_joins IN new_view) = 0 THEN
    RAISE EXCEPTION '060 proof: dl_v_entries old columns or joins changed';
  END IF;
  SELECT count(*) INTO n FROM pg_attribute
   WHERE attrelid = 'public.dl_v_entries'::regclass AND attnum > 0 AND NOT attisdropped;
  IF n <> view_cols_before + 2
     OR (SELECT attname FROM pg_attribute WHERE attrelid = 'public.dl_v_entries'::regclass AND attnum = view_cols_before + 1) <> 'local_move_id'
     OR (SELECT attname FROM pg_attribute WHERE attrelid = 'public.dl_v_entries'::regclass AND attnum = view_cols_before + 2) <> 'relay_info'
     OR (SELECT relacl::text FROM pg_class WHERE oid = 'public.dl_v_entries'::regclass) IS DISTINCT FROM view_acl_before
     OR NOT (SELECT coalesce('security_invoker=true' = ANY (reloptions), false) FROM pg_class WHERE oid = 'public.dl_v_entries'::regclass) THEN
    RAISE EXCEPTION '060 proof: dl_v_entries columns/options/grants not as expected';
  END IF;
  -- born closed
  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.oid IN ('public.local_moves_before()'::regprocedure, 'public.local_moves_follow_order()'::regprocedure,
                   'public.dl_local_day_sync(bigint,date)'::regprocedure, 'public.dl_sync_from_local_move()'::regprocedure,
                   'public.dl_local_pay_basis_sync()'::regprocedure)
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF n <> 5 THEN RAISE EXCEPTION '060 proof: only % of 5 new functions are closed', n; END IF;
  IF has_table_privilege('anon', 'public.local_moves', 'SELECT') OR has_table_privilege('authenticated', 'public.local_moves', 'SELECT') THEN
    RAISE EXCEPTION '060 proof: anon/authenticated can read local_moves';
  END IF;
  -- auditor rows = catalog (md5 of the generated texts)
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-09' AND md5(sql_text) = '8be3476c69ef6dba15c0778a2b318ec8' AND md5(ids_sql) = 'f511f0a106d53b6b85d4f4dd04c34979' AND md5(exceptions) = '7d53ecfa0ac2936cd6e29aa2c7bfed2a') THEN
    RAISE EXCEPTION '060 proof: B-09 is not the catalog text';
  END IF;
  SELECT count(*) INTO n FROM monitoring.checks k
    JOIN (VALUES
      ('B-63', '9c8b0400fcea4adcdde4dccdf90e3d09'),
      ('B-64', '467ea6ff17512682d74d34e6fd85e999'),
      ('B-65', 'f7044ffebcb2e15e551abcc1c2a71b8e')
    ) e(id, fp) ON e.id = k.id
   WHERE md5(k.title||'|'||k.sql_text||'|'||coalesce(k.ids_sql,'')||'|'||coalesce(k.impact,'')||'|'||coalesce(k.next_step,'')||'|'||coalesce(k.exceptions,'')||'|'||coalesce(k.entity_table,'')||'|'||k.red_op||'|'||k.red_value::text||'|'||k.severity||'|'||k.schedule_tag) = e.fp AND k.enabled;
  IF n <> 3 THEN RAISE EXCEPTION '060 proof: only % of B-63..B-65 match the catalog', n; END IF;
  -- nothing else moved
  IF (SELECT count(*) FROM public.dl_entries WHERE deleted_at IS NULL) <> dl_live_before
     OR (SELECT count(*) FROM public.orders WHERE deleted_at IS NULL) <> orders_before
     OR (SELECT count(*) FROM public.ct_round_trips) <> rts_before THEN
    RAISE EXCEPTION '060 proof: payroll, orders or round trips changed';
  END IF;
  -- Each touched check runs the way run_checks (047) runs it: guard, 10 s timeout, as
  -- tms_check_runner (SELECT only) - a missing GRANT fails HERE. Texts are read before the role
  -- switch (tms_check_runner cannot read schema monitoring).
  FOR r IN SELECT id, sql_text, ids_sql FROM monitoring.checks
            WHERE id IN ('B-09', 'B-54', 'B-63', 'B-64', 'B-65') AND enabled ORDER BY id LOOP
    PERFORM monitoring.check_sql_guard(r.sql_text);
    IF r.ids_sql IS NOT NULL THEN PERFORM monitoring.check_sql_guard(r.ids_sql); END IF;
    PERFORM set_config('statement_timeout', '10000', true);
    SET LOCAL ROLE tms_check_runner;
    EXECUTE r.sql_text INTO v;
    ids := NULL;
    IF r.ids_sql IS NOT NULL THEN EXECUTE r.ids_sql INTO ids; END IF;
    RESET ROLE;
    IF v IS NULL THEN RAISE EXCEPTION '060 proof: % returned NULL', r.id; END IF;
    -- no relay can exist yet, so the three new checks must be 0; B-54 must be green
    IF (r.id IN ('B-63', 'B-64', 'B-65') AND v <> 0) OR (r.id = 'B-54' AND v <> trg_after) THEN
      RAISE EXCEPTION '060 proof: % = % right after the migration', r.id, v;
    END IF;
    RAISE NOTICE '060: % = % (ids %)', r.id, v, coalesce(array_to_string(ids, ','), '');
  END LOOP;

  RAISE NOTICE '060 OK: local relay phase 1 in place; triggers % -> %, B-54 = %; B-63/B-64/B-65 = 0', trg_before, trg_after, trg_after;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                          AND table_name = 'local_moves' AND column_name = 'move_kind')
             AND (SELECT count(*) FROM monitoring.checks WHERE id IN ('B-63', 'B-64', 'B-65')) = 3
            THEN '060 OK' ELSE '060 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM public.local_moves) AS local_moves_rows,
       (SELECT count(*) FROM public.dl_entries WHERE deleted_at IS NULL) AS dl_entries_live;
