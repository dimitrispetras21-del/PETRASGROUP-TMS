-- 063 - LOCAL LINE GUARD: a local driver's payroll day line (dl_entries.local_move_id set) keeps
--       its day, driver, route, round trip, type and relay as dl_local_day_sync wrote them.
--       Closes reviewer finding F4 of the local relay release (DECISION_LOG 6/10, "for later (P3):
--       lock entry_date/route of the local line in the base too - today only the Worker").
--
-- DRAFT - NOT EXECUTED. The owner runs it in the Supabase SQL editor AFTER 15:00 (team works
-- 05:30-14:30), with an explicit yes in the conversation. Needs 060 (live since 6/10). No Worker
-- and no screen change goes with it: the live Worker never sends these columns for a local line
-- (worker/src/ledger-rules.mjs LOCAL_LINE_EDITABLE), so nobody's daily work meets the new rule.
--
-- BEFORE IT: 063_local_line_guard_dryrun.sql - this same block, generated from this file, undone at the end.
-- EXPECTED (green, no red panel): NOTICE "063 OK: local line guard on 8 columns; triggers T -> T,
--   B-54 = T" and ONE result row "063 OK | T | T | <live local lines> | 0 | 0".
--   T = the live count of enabled triggers in public = B-54 = 35 after 057 + 060 (measured 6/10),
--   unchanged by this block (the trigger is dropped and created again under the same name).
--   The last two numbers are read-only counts of local lines a pre-063 path may already have moved:
--   expected 0; anything else -> copy the row to the coordinator (nothing is changed by them).
--   A red error = nothing changed (one DO block): stop. AFTER IT: 063_local_line_guard_test.sql.
--
-- THIS FILE IS ASCII ONLY, on purpose (pbcopy corrupted Greek on 27/9). ONE DO block (056/058:
-- the SQL editor is not atomic across statements; inside ONE DO block any RAISE rolls back
-- everything), then ONE read-only SELECT that prints the result row. No temp tables.
-- NO SUPERUSER NEEDED: the SQL editor's role postgres is rolsuper = false (only supabase_admin is).
-- Every statement here is one the OWNER of dl_entries and of the two functions may run; the PGlite
-- harness runs this file, its dry run, its rules test and its rollback as a NOSUPERUSER role that
-- owns those objects, the way production is (review of 6/10: the first draft's
-- "ALTER FUNCTION ... SET tms.local_day_sync" failed there with "permission denied to set parameter").
--
-- Why. 060's guard dl_local_line_guard fires only when deleted_at changes. Everything else that
-- ties a local line to its relays - entry_date, date_end, driver_id, route, rt_id, entry_type,
-- local_move_id - is "owned by the system" only through the Worker's allow-list. Any other path
-- (the pre-060 Worker d30184c6 that the 6/10 rollback plan would bring back - its ledger PATCH lets
-- entry_date/date_end/route through on any trip line -, a script, a future trigger) can move a valued local
-- line from day D to D2: dl_local_day_sync then writes a second, empty line for D at the next
-- relay save, the moved line sits on D2 with money and no relay, and B-64 ("orphan" = only lines
-- WITHOUT an amount) says nothing. Silent, and paid twice or never (principles 1 and 4).
--
-- What it changes (nothing else):
--   1. dl_local_line_guard(): 060's two rules (no restore; no cancel while a relay of that driver
--      and day lives) VERBATIM, after ONE new first rule: on a local line, a change of entry_date,
--      date_end, driver_id, route, rt_id, entry_type or local_move_id is refused unless it comes
--      from dl_local_day_sync. Also refused: a NON-local line being given a local_move_id (it would
--      become a local line nobody's relays created). A non-local line whose local_move_id stays
--      NULL never reaches the guard: RT, manual and Excel lines behave exactly as today.
--   2. dl_local_day_sync re-created (CREATE OR REPLACE) from 060's text character for character,
--      plus exactly three additions (proven below against 060's md5): a variable prev_flag, and
--      around its ONE write of a rule-1 column - the relabel UPDATE (local_move_id, route):
--        prev_flag := the caller's tms.local_day_sync; set_config(..., 'on', true); the UPDATE;
--        set_config(..., coalesce(prev_flag, ''), true).
--      No RETURN or EXIT sits between the set and the give-back; if the UPDATE fails, rolling back
--      the (sub)transaction restores the setting by itself.
--      Why not a SET clause on the function (the first draft): storing a custom setting on a
--      function needs superuser, or a GRANT SET ON PARAMETER that only a superuser can give - not
--      available to the SQL editor's postgres. Why not the 042 pattern (set_config('dl.cash_sync',
--      '1', true) at the top, '0' at the end): this function has four RETURNs, and a
--      transaction-local value left 'on' after an early return would unlock every later plain
--      UPDATE in the same transaction (a whole PostgREST request, a whole SQL editor run). Why give
--      back the caller's value and not '': a repair block that set the flag on purpose keeps it.
--      Its other writes need no flag: its INSERT is not guarded (the trigger is BEFORE UPDATE); its
--      cancel writes deleted_at only, which rule 1 does not look at, and 060's rules (unchanged)
--      let it through because the sync cancels only when no relay is left; its review flag writes
--      no guarded column, so the trigger does not even fire.
--      Kept as 060 left them, and proven below: owner, SECURITY DEFINER, search_path = public, and
--      EXECUTE revoked from PUBLIC/anon/authenticated/service_role (060 section 7). CREATE OR
--      REPLACE keeps owner and grants; the statement repeats SECURITY DEFINER and the search_path.
--      The flag is a MARKER, not a lock: an SQL editor user can set it (or drop the trigger). It
--      stops the accidental paths above; a deliberate repair that must move a local line sets it
--      in its own DO block (SET LOCAL tms.local_day_sync = 'on'), visible in its text and reviewed.
--   3. trigger dl_local_line_guard re-created: BEFORE UPDATE OF deleted_at + the seven columns,
--      on rows that are local before or after the write. A column list, not a plain UPDATE trigger:
--      only a write that names one of these columns can move a line, so an amount-only PATCH never
--      pays for the guard. WHEN filters to real changes, so a PATCH that repeats unchanged values
--      (PostgREST full rows) passes.
-- Still editable on a local line, as today: trip_value, advance, expenses, note, needs_review,
-- review_note, deleted_reason, updated_at (the Worker's LOCAL_LINE_EDITABLE + what its cancel and
-- review-clear write). Not covered: INSERT of a local line by another path - an INSERT trigger
-- would be a new trigger (B-54 +1, out of scope); the Worker cannot write local_move_id at all
-- (DL_FIELDS) and the UNIQUE dl_local_day_live still allows one live line per driver and day.
--
-- Refusal: SQLSTATE 23514, HINT 'local_relay:line_locked', ASCII message (060's family). The
-- live Worker (stockRuleError in worker/src/index.js) already turns ANY 'local_relay:' hint from
-- the ledger PATCH into a 409 - an unknown code gets its generic Greek text plus the code and this
-- message, never the 500 path. Its allow-list refuses these fields first (400), so only a race or
-- a bug could reach this code through it. Optional Worker polish (NOT part of 063, a separate
-- deploy decision): a Greek RELAY_RULE_TEXT.line_locked, with worker/test/local-relay-contract
-- reading 063's hints too (it reads only 060 today, so a key added alone would fail its dead-key
-- test). The pre-060 Worker d30184c6 has no 'local_relay:' mapping: there the refusal is its 500 -
-- loud, and the write does not happen (before 063 it happened silently).
--
-- Known effect on 060_local_relay_test.sql if it is ever run again after 063: S12a (rt_id on a
-- local line) now meets line_locked before dl_one_origin, and S14a's detach of a line (to show
-- B-64 "unpaid") is refused - both report FAIL by design; the other 52 stay OK (proven on the
-- PGlite copy). 063_local_line_guard_test.sql is the rules test from now on.
-- B-64 is NOT extended to list valued local lines with no relay: 060 keeps such a line on purpose
-- once accounting has checked it (needs_review cleared with a reason - 060 test S20e pins it), so
-- the extension would turn every kept line into a standing red. With this guard, a line can no
-- longer be moved off its relays without the flag; the result row counts what a pre-063 path
-- may have moved already.
-- B-54 counts enabled non-internal triggers in public: unchanged (same name, dropped and created
-- in the same transaction); proven below, B-54 not touched.
-- Measured on the PGlite copy of production after 057 + 060 (6/10): dl_local_line_guard prosrc md5
-- 2b4de99653da7f0859f08b07a410225c, dl_local_day_sync prosrc md5 297954261e9e8fe2936f6217f31f1e7a
-- (060 file md5 2e614f4dfaec27b66b2bab0f41067400 = the one executed 6/10), triggers 35 = B-54.
-- The coordinator re-reads them on production (SELECT only) before the owner's run.
-- After 063: dl_local_line_guard e7f0348ccc5764d29608b8701f0e83b6, dl_local_day_sync a4a62603e5b0c4ad48124fea625aa611.
-- Reverse: worker/migrations/drafts/063_local_line_guard_rollback.sql (no data to lose).

DO $do$
DECLARE
  n int;
  trg_before int; trg_after int; deleted_at_attnum int;
  dl_live_before bigint; dl_local_before bigint; lm_before bigint;
  old_src text; new_src text; old_rules text; old_sync text; new_sync text;
  guard_owner oid; guard_acl text; sync_owner oid; sync_acl text;
  -- The three additions to 060's dl_local_day_sync, as they stand in its new text below. Taking
  -- them out of the live text after the CREATE must give back 060's md5: the proof that nothing
  -- else in the function changed.
  sync_add_var text := $i$    prev_flag text;      -- 063: the caller's tms.local_day_sync, given back after the relabel
$i$;
  sync_add_set text := $i$    -- 063: dl_local_line_guard lets a local line's relay or route change only while
    -- tms.local_day_sync = 'on'. Set around the ONE write of this function that changes such a
    -- column, given back right after it - no RETURN in between. Not a SET clause on the function
    -- (a custom setting stored on a function needs superuser; the SQL editor's postgres is not) and
    -- not set once at the top (an early RETURN would leave it 'on' for the rest of the transaction).
    prev_flag := current_setting('tms.local_day_sync', true);
    PERFORM set_config('tms.local_day_sync', 'on', true);
$i$;
  sync_add_back text := $i$    PERFORM set_config('tms.local_day_sync', coalesce(prev_flag, ''), true);
$i$;
  r record; v numeric;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  -- DROP/CREATE TRIGGER on dl_entries need a strong lock: behind an idle open transaction they
  -- would wait forever while every ledger read queues behind them. Give up after 5 s instead -
  -- the whole block rolls back, nothing half-done; run it again later (same as 057/060).
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (SELECT only): 060 in place, as executed 6/10; 063 not yet.
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '063: monitoring.checks does not exist (047 must run first)';
  END IF;
  IF to_regprocedure('public.dl_local_line_guard()') IS NULL
     OR to_regprocedure('public.dl_local_day_sync(bigint,date)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                     AND table_name = 'dl_entries' AND column_name = 'local_move_id') THEN
    RAISE EXCEPTION '063: 060 is not applied (dl_local_line_guard / dl_local_day_sync / dl_entries.local_move_id missing) - stop';
  END IF;
  SELECT prosrc, proowner, proacl::text INTO old_src, guard_owner, guard_acl
    FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure;
  SELECT prosrc, proowner, proacl::text INTO old_sync, sync_owner, sync_acl
    FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure;
  IF position('tms.local_day_sync' IN old_sync) > 0 OR position('local_relay:line_locked' IN old_src) > 0 THEN
    RAISE EXCEPTION '063: already applied';
  END IF;
  -- The guard is replaced and the rollback puts 060's text back: refuse if it is not that text.
  IF md5(old_src) <> '2b4de99653da7f0859f08b07a410225c' THEN
    RAISE EXCEPTION '063: dl_local_line_guard is not the 060 text (md5 %) - re-measure', md5(old_src);
  END IF;
  -- The sync is re-created from 060's text below and the rollback puts that text back: refuse if
  -- the live one is anything else (body, SECURITY DEFINER, its one setting).
  IF md5(old_sync) <> '297954261e9e8fe2936f6217f31f1e7a'
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure
                     AND prosecdef AND proconfig = ARRAY['search_path=public']) THEN
    RAISE EXCEPTION '063: dl_local_day_sync is not the 060 function (body, SECURITY DEFINER, search_path) - re-measure';
  END IF;
  -- The trigger is 060's: row, BEFORE UPDATE OF deleted_at only, enabled, calling the guard.
  SELECT attnum INTO deleted_at_attnum FROM pg_attribute
   WHERE attrelid = 'public.dl_entries'::regclass AND attname = 'deleted_at' AND NOT attisdropped;
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.dl_entries'::regclass AND tgname = 'dl_local_line_guard' AND NOT tgisinternal
     AND tgenabled = 'O' AND tgtype = 19 AND tgfoid = 'public.dl_local_line_guard()'::regprocedure
     AND tgattr::text = deleted_at_attnum::text;
  IF n <> 1 THEN
    RAISE EXCEPTION '063: trigger dl_local_line_guard is not the 060 one (BEFORE UPDATE OF deleted_at) - re-measure';
  END IF;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  -- run_checks compares against coalesce(baseline, red_value): B-54 must be green before, and stay.
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL) THEN
    RAISE EXCEPTION '063: B-54 red_value is not the live trigger count % (or has a baseline) - a migration changed triggers without bumping it, re-measure', trg_before;
  END IF;
  SELECT count(*) INTO dl_live_before FROM public.dl_entries WHERE deleted_at IS NULL;
  SELECT count(*) INTO dl_local_before FROM public.dl_entries WHERE local_move_id IS NOT NULL;
  SELECT count(*) INTO lm_before FROM public.local_moves;

  -- 1. THE GUARD. Rule 1 is new; rules 2 and 3 are 060's text verbatim (proven below).
  CREATE OR REPLACE FUNCTION public.dl_local_line_guard() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
  BEGIN
    -- 063: who, when and what a local line pays is the relays' (dl_local_day_sync). A hand move
    -- would leave money on a day without a relay while the sync writes a second line for the old day.
    IF (NEW.entry_date, NEW.date_end, NEW.driver_id, NEW.route, NEW.rt_id, NEW.entry_type, NEW.local_move_id)
       IS DISTINCT FROM (OLD.entry_date, OLD.date_end, OLD.driver_id, OLD.route, OLD.rt_id, OLD.entry_type, OLD.local_move_id)
       AND current_setting('tms.local_day_sync', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'local_relay: line % belongs to the relays of its driver and day - its day, driver, route, round trip, type and relay are written only by the system; edit the amounts, the note or the review flag', OLD.id
        USING ERRCODE = '23514', HINT = 'local_relay:line_locked';
    END IF;
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

  -- 2. THE SYNC MARKS ITS OWN RELABEL: 060's text + the three additions above, nothing else.
  CREATE OR REPLACE FUNCTION public.dl_local_day_sync(p_driver bigint, p_day date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  DECLARE
    live dl_entries%rowtype; has_money boolean; valued boolean; anchor bigint; route_txt text;
    prev_flag text;      -- 063: the caller's tms.local_day_sync, given back after the relabel
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

    -- 063: dl_local_line_guard lets a local line's relay or route change only while
    -- tms.local_day_sync = 'on'. Set around the ONE write of this function that changes such a
    -- column, given back right after it - no RETURN in between. Not a SET clause on the function
    -- (a custom setting stored on a function needs superuser; the SQL editor's postgres is not) and
    -- not set once at the top (an early RETURN would leave it 'on' for the rest of the transaction).
    prev_flag := current_setting('tms.local_day_sync', true);
    PERFORM set_config('tms.local_day_sync', 'on', true);
    -- The label belongs to the trigger, not to money: always refreshed. A changed set of relays
    -- after a value was written (even 0) goes to review (B-08); accounting clears it with a reason.
    UPDATE dl_entries SET local_move_id = anchor, route = route_txt, updated_at = now(),
           needs_review = needs_review OR (valued AND route IS DISTINCT FROM route_txt),
           review_note = CASE WHEN valued AND route IS DISTINCT FROM route_txt
                              THEN concat_ws(sep, review_note, r_changed || stamp) ELSE review_note END
     WHERE id = live.id AND (local_move_id IS DISTINCT FROM anchor OR route IS DISTINCT FROM route_txt);
    PERFORM set_config('tms.local_day_sync', coalesce(prev_flag, ''), true);
  END $f$;

  -- 3. THE TRIGGER: the same name, now on the seven columns too.
  DROP TRIGGER dl_local_line_guard ON public.dl_entries;
  CREATE TRIGGER dl_local_line_guard
    BEFORE UPDATE OF deleted_at, entry_date, date_end, driver_id, route, rt_id, entry_type, local_move_id
    ON public.dl_entries
    FOR EACH ROW WHEN ((OLD.local_move_id IS NOT NULL OR NEW.local_move_id IS NOT NULL)
      AND (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
        OR (OLD.entry_date, OLD.date_end, OLD.driver_id, OLD.route, OLD.rt_id, OLD.entry_type, OLD.local_move_id)
           IS DISTINCT FROM (NEW.entry_date, NEW.date_end, NEW.driver_id, NEW.route, NEW.rt_id, NEW.entry_type, NEW.local_move_id)))
    EXECUTE FUNCTION public.dl_local_line_guard();

  -- 4. PROOFS inside the block: any failure rolls back everything above.
  -- the guard = rule 1 + 060's rules character for character (from the live text, not retyped here)
  SELECT prosrc INTO new_src FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure;
  old_rules := substring(old_src FROM position('    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN' IN old_src));
  IF position('    IF OLD.deleted_at IS NOT NULL' IN old_src) = 0 OR right(new_src, length(old_rules)) <> old_rules
     OR position('local_relay:line_locked' IN new_src) = 0 OR position('local_relay:line_locked' IN new_src) > position(old_rules IN new_src) THEN
    RAISE EXCEPTION '063 proof: dl_local_line_guard is not rule 1 + the 060 rules verbatim';
  END IF;
  -- the sync: the new text exactly (md5), and = 060's text once the three additions are taken out
  SELECT prosrc INTO new_sync FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure;
  IF md5(new_sync) <> 'a4a62603e5b0c4ad48124fea625aa611'
     OR md5(replace(replace(replace(new_sync, sync_add_var, ''), sync_add_set, ''), sync_add_back, '')) <> '297954261e9e8fe2936f6217f31f1e7a' THEN
    RAISE EXCEPTION '063 proof: dl_local_day_sync is not the 060 text + the three 063 additions (md5 %)', md5(new_sync);
  END IF;
  -- both functions: owner and grants exactly as 060 left them (CREATE OR REPLACE keeps them - proven,
  -- not assumed); the sync still SECURITY DEFINER with its one setting, the guard still INVOKER
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure
                  AND prosecdef AND proconfig = ARRAY['search_path=public']
                  AND proowner = sync_owner AND proacl::text IS NOT DISTINCT FROM sync_acl)
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure
                     AND NOT prosecdef AND proconfig = ARRAY['search_path=public']
                     AND proowner = guard_owner AND proacl::text IS NOT DISTINCT FROM guard_acl) THEN
    RAISE EXCEPTION '063 proof: owner, grants, SECURITY DEFINER or search_path of dl_local_day_sync / dl_local_line_guard changed';
  END IF;
  -- the trigger: ONE, enabled, row BEFORE UPDATE, the guard, exactly the eight columns
  SELECT count(*) INTO n FROM pg_trigger t
   WHERE t.tgrelid = 'public.dl_entries'::regclass AND t.tgname = 'dl_local_line_guard' AND NOT t.tgisinternal
     AND t.tgenabled = 'O' AND t.tgtype = 19 AND t.tgfoid = 'public.dl_local_line_guard()'::regprocedure
     AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM unnest(t.tgattr::int2[]) k JOIN pg_attribute a
           ON a.attrelid = t.tgrelid AND a.attnum = k)
         = ARRAY['date_end', 'deleted_at', 'driver_id', 'entry_date', 'entry_type', 'local_move_id', 'route', 'rt_id'];
  IF n <> 1 THEN RAISE EXCEPTION '063 proof: trigger dl_local_line_guard is not on the eight columns'; END IF;
  -- born closed (060 section 7), whatever the ACL text looked like: nobody but the owner runs them
  IF has_function_privilege('public', 'public.dl_local_line_guard()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.dl_local_line_guard()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.dl_local_line_guard()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.dl_local_line_guard()', 'EXECUTE')
     OR has_function_privilege('public', 'public.dl_local_day_sync(bigint,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.dl_local_day_sync(bigint,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.dl_local_day_sync(bigint,date)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.dl_local_day_sync(bigint,date)', 'EXECUTE') THEN
    RAISE EXCEPTION '063 proof: dl_local_line_guard or dl_local_day_sync is executable by PUBLIC/anon/authenticated/service_role';
  END IF;
  -- B-54: the same number of triggers, and B-54 still equals it (not touched by this block)
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after) THEN
    RAISE EXCEPTION '063 proof: trigger count % -> % (expected unchanged), or B-54 moved', trg_before, trg_after;
  END IF;
  -- nothing else moved: no payroll line, no relay written by this block
  IF (SELECT count(*) FROM public.dl_entries WHERE deleted_at IS NULL) <> dl_live_before
     OR (SELECT count(*) FROM public.dl_entries WHERE local_move_id IS NOT NULL) <> dl_local_before
     OR (SELECT count(*) FROM public.local_moves) <> lm_before THEN
    RAISE EXCEPTION '063 proof: payroll lines or local moves changed';
  END IF;
  -- B-54 runs the way run_checks (047) runs it: guard, 10 s timeout, as tms_check_runner. The text
  -- is read before the role switch (tms_check_runner cannot read schema monitoring).
  FOR r IN SELECT id, sql_text FROM monitoring.checks WHERE id = 'B-54' AND enabled LOOP
    PERFORM monitoring.check_sql_guard(r.sql_text);
    PERFORM set_config('statement_timeout', '10000', true);
    SET LOCAL ROLE tms_check_runner;
    EXECUTE r.sql_text INTO v;
    RESET ROLE;
    IF v IS DISTINCT FROM trg_after::numeric THEN
      RAISE EXCEPTION '063 proof: B-54 = % right after the migration (expected %)', v, trg_after;
    END IF;
  END LOOP;

  RAISE NOTICE '063 OK: local line guard on 8 columns; triggers % -> %, B-54 = %', trg_before, trg_after, trg_after;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
-- local_lines_moved: live local lines whose end day is not their day - dl_local_day_sync writes both
--   as the same day and never changes them, so a difference = a pre-063 path moved one end.
-- valued_lines_without_relay: live local lines with an amount, not in review, on a (driver, day)
--   with no live relay - a moved line, or one accounting checked and kept (B-64 is silent on both).
SELECT CASE WHEN (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_day_sync(bigint,date)'::regprocedure) = 'a4a62603e5b0c4ad48124fea625aa611'
             AND (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.dl_local_line_guard()'::regprocedure) = 'e7f0348ccc5764d29608b8701f0e83b6'
             AND (SELECT cardinality(tgattr::int2[]) FROM pg_trigger
                   WHERE tgrelid = 'public.dl_entries'::regclass AND tgname = 'dl_local_line_guard') = 8
            THEN '063 OK' ELSE '063 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM public.dl_entries WHERE local_move_id IS NOT NULL AND deleted_at IS NULL) AS local_lines_live,
       (SELECT count(*) FROM public.dl_entries WHERE local_move_id IS NOT NULL AND deleted_at IS NULL
           AND date_end IS DISTINCT FROM entry_date) AS local_lines_moved,
       (SELECT count(*) FROM public.dl_entries e WHERE e.local_move_id IS NOT NULL AND e.deleted_at IS NULL AND NOT e.needs_review
           AND (coalesce(e.trip_value, 0) <> 0 OR coalesce(e.advance, 0) <> 0 OR coalesce(e.expenses, 0) <> 0)
           AND NOT EXISTS (SELECT 1 FROM public.local_moves lm WHERE lm.move_kind <> 'local' AND lm.driver_id = e.driver_id
                            AND lm.move_date = e.entry_date AND lm.deleted_at IS NULL AND lm.status <> 'Cancelled')) AS valued_lines_without_relay;
