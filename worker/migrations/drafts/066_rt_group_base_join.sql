-- 066 - RELATED ORDERS JOIN THE SAME ROUND TRIP WHATEVER THE GROUP SUFFIX: the walks of
--       rt_create_from_order (033) and rt_link_split (037) compare the BASE Group ID - the part
--       before "|" - instead of the whole text. Plus auditor check B-77 (hourly, P2): related
--       orders (group / pair / rota) sitting on more than one live round trip.
--
-- DRAFT - NOT EXECUTED. The owner runs it in the Supabase SQL editor AFTER 15:00 (team works
-- 05:30-14:30), with an explicit yes in the conversation. No Worker and no screen change goes with
-- it (the screens' 409 banner for a split group is live since main b9c2956d, 7/10).
--
-- THE INCIDENT (7/10, proven by the coordinator from production audit_log, read-only): import group
-- GI-MUV7FNKE (#449 + #451, truck 13 / driver 16) sat on TWO round trips - #451 on RT-1217 with the
-- export #438, #449 alone on RT-1220. Pantelis could not add rota #467: every group sync got the
-- Worker's 409 "legs already belong to different round trips". Merged by hand 7/10 (owner yes);
-- production has 0 split groups since. The sequence on 5/10:
--   15:06:56 / 15:06:57  the front writes group_id "GI-MUV7FNKE" on #451, then on #449 (the import-
--                        group action writes members ONE AT A TIME)
--   15:07:04             export #438 matched_import_id -> #451
--   15:07:05             #451 gets truck 13 -> rt_create_from_order attaches it to RT-1217 (the pair)
--   15:07:06             _wiSaveSegOrder writes the delivery-order suffix on #451:
--                        "GI-MUV7FNKE|rec3VtYdr6rqPykbG,rec0iMsyPTnjncyDv" - and in the SAME second
--                        #449 gets truck 13 while ITS group_id is still the bare "GI-MUV7FNKE".
--                        033's walk compares n.group_id = cur.group_id EXACTLY -> no relative found
--                        -> RT-1220 ("no related round trip - first executed order of its pair/group").
--   then                 the suffix reaches #449 -> rt_link_split (037) logs "split" - but the shape
--                        (import-only vs export+import) is not its auto-merge shape -> audit row only.
-- WHY THE BASE, AND WHY HERE: the suffix is presentation (Weekly's delivery order, GRP trips the
-- same: "GRP-xxx|recA,recB"); the group is the base - the screens DISPLAY it as .split('|')[0].
-- NOT every front place relates by the base yet (review 7/10): core/rt-feed.js:218 (the related-order
-- walk) and :305 (the {Group ID}='...' filter) and modules/weekly_intl.js:811 (the row collapse) still
-- compare the FULL text. Harmless after 066 - the trigger attaches the leg first and the front only
-- adds legs, never removes them - but "related" still means two things front vs base (principle 3):
-- a front follow-up, not part of this SQL (the comment at weekly_intl.js:5585 quotes the old walk). The
-- front cannot write all members in one request through the facade, so between two members there
-- is always a moment where one carries the suffix and the other does not; any write in that moment
-- (a truck, a date, a rota) meets two different texts for one group. Fixing the order of the front's
-- writes would close one path; the walk in the base closes every path, present and future
-- (principle 4). Both walks change the same way, so "related" means one thing in the creation and in
-- the split detection (principle 3), and B-77 counts with the same relation.
--
-- What it changes (nothing else):
--   1. rt_create_from_order() and rt_link_split(): CREATE OR REPLACE from their LIVE text
--      (pg_get_functiondef, md5-guarded: read on production 7/10 = the 4/10 dump = 033 / 037), with
--      exactly ONE substitution each, in the walk's join:
--        (cur.group_id is not null and n.group_id = cur.group_id)
--      ->(cur.group_id is not null and split_part(n.group_id,'|',1) = split_part(cur.group_id,'|',1))
--      Generated, not retyped: every other byte (comments, the em dashes in 033's audit reasons -
--      this file stays ASCII -, whitespace) is the live text. Proven inside the block: the new text =
--      replace(old text, that condition, the new one), its md5 = the one measured on the copy, the
--      swap back gives the old text byte for byte (the rollback's way), the same function oid,
--      owner, grants, SECURITY DEFINER, search_path and every other attribute (CREATE OR REPLACE
--      keeps them; pg_get_functiondef prints the live header). No trigger is touched: the count stays
--      (read, asserted before = after), both triggers still call the same oids, B-54 not written.
--   2. monitoring.checks B-77 (text = tms-auditor/checks/B-77.sql, md5-proven; Greek as base64).
--      It counts pairs of DIRECTLY related orders (same base Group ID, matched_import_id or
--      rotation_id <-> legacy_id), both not deleted, on two different live (status <> cancelled)
--      round trips OF WHICH AT LEAST ONE IS STILL OPEN (status not in cancelled/closed/complete).
--      Why two closed round trips are out (coordinator 7/10): they are settled history - payroll and
--      expenses are booked, the owner would not act on them ("auditor report: only what is new"). The
--      first text (closed counted too) gave 1 on production 7/10: #268 (RT-1018, truck 15) and #302
--      (RT-1134, truck 2), linked by a stale August IMPORT->IMPORT matched_import_id - two physical
--      trips, both closed, not a split. Side a is always the open trip (open+open counted once by
--      b.id > a.id, open+closed once from the open side), so the cost follows the legs on open trips,
--      not the whole history. Run here as run_checks runs it (guard, 10 s timeout, tms_check_runner).
-- NOT changed, on purpose:
--   - 033's "two related live round trips -> audit row, return" branch: still no automatic merge.
--     Loud now: the round trips' orders form a related pair on two RTs -> B-77 (while one of the
--     two is open); the order left
--     WITHOUT a round trip -> B-01 (P1, fast).
--   - 037's auto-merge shape (owner 19/9: money stays where the accountant saw it): still ONLY
--     same vehicle + one RT export-only + the other import-only. Every other split stays an audit
--     row for a human - now also counted by B-77. Effect of the base compare on 037: a split
--     between members whose suffixes differ is now SEEN (before: invisible, no audit row); if such
--     members ever formed that one shape it would merge as any related pair does (rules test S12).
--   - 033's "related RT runs another vehicle -> separate round trip" (a separate physical trip):
--     unchanged; B-77 counts such a pair too while one of the two trips is open - a group / pair /
--     rota on two vehicles contradicts its own relation (fix the vehicle or the relation).
--   - orders_group_id_blank_null, stock_guard_lots, stock_guard_orders (they read group_id, but not
--     to relate orders to round trips); the Worker (its 409 compares legs, not group texts).
--
-- WHAT 059a (closed-RT plan, not written yet) MUST KEEP: every walk it re-creates or adds
--   (rt_create_from_order, rt_link_split, a national pair walk) compares split_part(group_id, '|', 1),
--   never the whole text; its md5 guards are the post-066 ones below, not the 4/10 dump; B-77 stays
--   (its ids B-66..B-76 are 062's, B-77 is this file's).
--
-- BEFORE IT: 066_rt_group_base_join_dryrun.sql - this same block, generated from this file, undone.
-- EXPECTED (green, no red panel): NOTICE "066 OK: rt_create_from_order + rt_link_split compare the
--   base Group ID (same oid/owner/grants/SECURITY DEFINER/search_path); triggers 35 -> 35, B-54 = 35;
--   B-77 = 0 (ids )" and ONE result row "066 OK | 35 | 35 | 0".
--   35 = the live trigger count = B-54 (read, not typed: asserted before = after). The last number is
--   B-77 on production: 0 after the 7/10 repair (the one closed+closed pair measured 7/10, #268 /
--   #302, is out by the rule above). Another number is NOT a failure of 066 (it changed
--   nothing in the data) - it is B-77 doing its job: copy the row and the NOTICE's ids to the
--   coordinator. A red error = nothing changed (one DO block): stop, copy the panel.
-- AFTER IT: 066_rt_group_base_join_test.sql (every rule, then undone).
-- Reverse: 066_rt_group_base_join_rollback.sql (both functions back byte for byte, B-77 removed).
--
-- THIS FILE IS ASCII ONLY (pbcopy corrupted Greek on 27/9). ONE DO block (056/058: the SQL editor is
-- not atomic across statements; inside ONE DO block any RAISE rolls back everything), then ONE
-- read-only SELECT that prints the result row. No temp tables.
-- NO SUPERUSER NEEDED (the SQL editor's postgres is rolsuper = false): CREATE OR REPLACE FUNCTION
-- needs ownership of the two functions, INSERT into monitoring.checks ownership of that table, SET
-- ROLE tms_check_runner membership (047). The PGlite harness ran this file, its dry run, its rules
-- test and its rollback as a NOSUPERUSER owner (not a member of service_role) with Supabase's
-- default privileges in place, and as superuser.
--
-- Measured: production 7/10 (coordinator, pg_get_functiondef) = the 4/10 dump = the PGlite copy after
-- 057 + 060 + 063: rt_create_from_order md5(def) 3f3a01204f7f4a4b6546e965fc231ae3, md5(prosrc)
-- f71d333b33e1404817779c4033534b30; rt_link_split md5(def) 6189950c70b289fd5075afd17e28ecec,
-- md5(prosrc) 75da6f6f0389ba01ffd86074191eb4d7; both SECURITY DEFINER, search_path=public, owner
-- postgres, EXECUTE for PUBLIC/anon/authenticated/service_role (unchanged by 066).
-- After 066: rt_create_from_order md5(def) 8e964f66556677a284eca13db70665c6, md5(prosrc)
-- 0845ec6170fd2918d21efd56856daa3e; rt_link_split md5(def) d8a4a03dca0e8e26d4e8d227f1287590,
-- md5(prosrc) 6f954b256f103f1c6a8f8ab400a67808.
-- B-77 fingerprint md5(title|sql|ids|impact|next|exceptions|entity|red_op|red_value|severity|schedule)
-- 06bc6d67d2913a42091c0aba197d4c45.

DO $do$
DECLARE
  -- THE ONE CHANGE, the same in both functions (the rollback swaps it back). Both strings are what
  -- pg_get_functiondef prints, so the proofs below compare like with like.
  cond_old text := $c$(cur.group_id is not null and n.group_id = cur.group_id)$c$;
  cond_new text := $c$(cur.group_id is not null and split_part(n.group_id,'|',1) = split_part(cur.group_id,'|',1))$c$;
  fn_create oid; fn_split oid;
  old_create text; old_split text; new_create text; new_split text;
  attrs_create text; attrs_split text; tg_before text; tg_after text;
  trg_before int; trg_after int;
  orders_before bigint; rts_before bigint; legs_before bigint; n int;
  r record; v numeric; ids text[]; b77 numeric; b77_ids text;
BEGIN
  -- pg_get_triggerdef prints names relative to the search_path (trigger proof below): pin it.
  PERFORM set_config('search_path', 'public, extensions', true);
  -- Neither CREATE OR REPLACE FUNCTION nor the INSERT is expected to wait on the app, but if one
  -- does (an idle open transaction), it must never queue the app behind it: give up after 5 s - the
  -- whole block rolls back; run it again a little later (as 057/060/063/065).
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (SELECT only): the two walks are the texts read on production 7/10; 066 not yet.
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '066: monitoring.checks does not exist (047 must run first)';
  END IF;
  fn_create := to_regprocedure('public.rt_create_from_order()');
  fn_split  := to_regprocedure('public.rt_link_split()');
  IF fn_create IS NULL OR fn_split IS NULL THEN
    RAISE EXCEPTION '066: public.rt_create_from_order() or public.rt_link_split() does not exist (033 / 037) - stop';
  END IF;
  old_create := pg_get_functiondef(fn_create);
  old_split  := pg_get_functiondef(fn_split);
  IF md5(old_create) = '8e964f66556677a284eca13db70665c6' OR md5(old_split) = 'd8a4a03dca0e8e26d4e8d227f1287590'
     OR EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-77') THEN
    RAISE EXCEPTION '066: already applied (a walk already compares the base Group ID, or check B-77 exists)';
  END IF;
  -- Re-created from the live text: refuse unless it is exactly what was measured. A hand fix since
  -- 7/10 would be overwritten silently otherwise, and the rollback could not give it back.
  IF md5(old_create) <> '3f3a01204f7f4a4b6546e965fc231ae3'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = fn_create) <> 'f71d333b33e1404817779c4033534b30' THEN
    RAISE EXCEPTION '066: rt_create_from_order is not the text read on production 7/10 (md5 %) - someone changed it, re-measure', md5(old_create);
  END IF;
  IF md5(old_split) <> '6189950c70b289fd5075afd17e28ecec'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = fn_split) <> '75da6f6f0389ba01ffd86074191eb4d7' THEN
    RAISE EXCEPTION '066: rt_link_split is not the text read on production 7/10 (md5 %) - someone changed it, re-measure', md5(old_split);
  END IF;
  -- the condition sits ONCE in each walk (else "one substitution" would not hold)
  IF (length(old_create) - length(replace(old_create, cond_old, ''))) <> length(cond_old)
     OR (length(old_split) - length(replace(old_split, cond_old, ''))) <> length(cond_old)
     OR position(cond_new IN old_create) > 0 OR position(cond_new IN old_split) > 0 THEN
    RAISE EXCEPTION '066: the group condition of a walk is not where it was measured (exactly once)';
  END IF;
  -- what must survive: SECURITY DEFINER with search_path=public (033/037), and every attribute
  -- CREATE OR REPLACE could move (oid, owner, grants, language, volatility, strictness, cost, ...)
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = fn_create AND prosecdef AND proconfig = ARRAY['search_path=public'])
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = fn_split AND prosecdef AND proconfig = ARRAY['search_path=public']) THEN
    RAISE EXCEPTION '066: a walk is not SECURITY DEFINER with search_path=public as measured - re-measure';
  END IF;
  SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                   proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
    INTO attrs_create FROM pg_proc WHERE oid = fn_create;
  SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                   proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
    INTO attrs_split FROM pg_proc WHERE oid = fn_split;
  -- the two triggers that call them: both on orders, enabled; their texts are proven unchanged after
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal AND tgenabled = 'O'
        AND ((tgname = 'rt_create_from_order' AND tgfoid = fn_create) OR (tgname = 'rt_link_split' AND tgfoid = fn_split))) <> 2 THEN
    RAISE EXCEPTION '066: triggers rt_create_from_order / rt_link_split on orders are not both there, enabled, calling these functions - stop';
  END IF;
  SELECT string_agg(t.tgname || ':' || t.tgrelid::regclass::text || ':' || t.tgenabled::text || ':' || t.tgfoid::text || ':' || md5(pg_get_triggerdef(t.oid)), ',' ORDER BY t.oid)
    INTO tg_before FROM pg_trigger t WHERE t.tgfoid IN (fn_create, fn_split) AND NOT t.tgisinternal;
  -- B-54 counts enabled non-internal triggers in public; run_checks compares against
  -- coalesce(baseline, red_value), so B-54 must be green before (and this block never writes it).
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL) THEN
    RAISE EXCEPTION '066: B-54 red_value is not the live trigger count % (or has a baseline) - a migration changed triggers without bumping it, re-measure', trg_before;
  END IF;
  SELECT count(*) INTO orders_before FROM public.orders;
  SELECT count(*) INTO rts_before FROM public.ct_round_trips;
  SELECT count(*) INTO legs_before FROM public.ct_rt_legs;

  -- 1. THE TWO WALKS: the live text, the one condition swapped. pg_get_functiondef prints a complete
  --    CREATE OR REPLACE FUNCTION with the live header, so only the body changes. No existing round
  --    trip, leg or order is touched: the new compare acts on the next write to an order.
  new_create := replace(old_create, cond_old, cond_new);
  new_split  := replace(old_split, cond_old, cond_new);
  EXECUTE new_create;
  EXECUTE new_split;

  -- 2. AUDITOR: B-77, text = tms-auditor/checks/B-77.sql (generated, base64 for Greek; md5-proven below).
  INSERT INTO monitoring.checks (id, title, flows, sql_text, ids_sql, entity_table, red_op, red_value, baseline, severity,
    schedule_tag, is_queue, impact, next_step, exceptions, tolerance, enabled, disabled_reason) VALUES
    ($m$B-77$m$,
     convert_from(decode('zqPPh861z4TOuc66zq3PgiDPgM6xz4HOsc6zzrPOtc67zq/Otc+CICjOv868zqzOtM6xL862zrXPjc6zzr/Pgi/Pgc+Mz4TOsSkgz4POtSA+MSDOts+Jzr3PhM6xzr3OrCDOtM+Bzr/OvM6/zrvPjM6zzrnOsQ==', 'base64'), 'UTF8'),
     ARRAY[$m$F-21$m$,$m$F-16$m$,$m$F-18$m$,$m$F-14$m$]::text[],
     $m$SELECT count(*) FROM orders a JOIN ct_rt_legs la ON la.order_id=a.id JOIN ct_round_trips ra ON ra.id=la.rt_id AND ra.status NOT IN ('cancelled','closed','complete')
 JOIN orders b ON b.id<>a.id AND b.deleted_at IS NULL JOIN ct_rt_legs lb ON lb.order_id=b.id JOIN ct_round_trips rb ON rb.id=lb.rt_id AND rb.status<>'cancelled'
 WHERE a.deleted_at IS NULL AND rb.id<>ra.id AND (b.id>a.id OR rb.status IN ('closed','complete'))
 AND ((a.group_id||'#'||b.group_id) ~ '^([^|#]*)(\|[^#]*)?#\1(\|[^#]*)?$'
  OR a.matched_import_id=b.legacy_id OR b.matched_import_id=a.legacy_id OR a.rotation_id=b.legacy_id OR b.rotation_id=a.legacy_id)$m$,
     $m$SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT coalesce(o.legacy_id, o.id::text) AS x FROM orders o JOIN (SELECT a.id AS a_id, b.id AS b_id FROM orders a
 JOIN ct_rt_legs la ON la.order_id=a.id JOIN ct_round_trips ra ON ra.id=la.rt_id AND ra.status NOT IN ('cancelled','closed','complete')
 JOIN orders b ON b.id<>a.id AND b.deleted_at IS NULL JOIN ct_rt_legs lb ON lb.order_id=b.id JOIN ct_round_trips rb ON rb.id=lb.rt_id AND rb.status<>'cancelled'
 WHERE a.deleted_at IS NULL AND rb.id<>ra.id AND (b.id>a.id OR rb.status IN ('closed','complete'))
 AND ((a.group_id||'#'||b.group_id) ~ '^([^|#]*)(\|[^#]*)?#\1(\|[^#]*)?$'
  OR a.matched_import_id=b.legacy_id OR b.matched_import_id=a.legacy_id OR a.rotation_id=b.legacy_id OR b.rotation_id=a.legacy_id)) p
 ON o.id IN (p.a_id, p.b_id) ORDER BY 1 LIMIT 50) s$m$,
     $m$orders$m$,
     $m$>$m$,
     0,
     NULL,
     $m$P2$m$,
     $m$hourly$m$,
     false,
     convert_from(decode('zojOvc6xIM+Gz4XPg865zrrPjCDOtM+Bzr/OvM6/zrvPjM6zzrnOvyAozr/OvM6szrTOsSwgzrbOtc+NzrPOv8+CIM61zr7Osc6zz4nOs86uz4IvzrXOuc+DzrHOs8+JzrPOrs+CIM6uIM+Bz4zPhM6xKSDOus6szrjOtc+EzrHOuSDPg861IM60z43OvyBSVDogzr8gV29ya2VyIM6xz4HOvc61zq/PhM6xzrkgzrrOrM64zrUgz4PPhc6zz4fPgc6/zr3Ouc+DzrzPjCDPhM63z4Igzr/OvM6szrTOsc+CICg0MDkpLCDOtyDPgc+Mz4TOsSDOtM61zr0gzrzPgM6xzq/Ovc61zrksIM66zrHOuSDOvM65z4POuM6/zrTOv8+Dzq/OsS/Orc6+zr/OtM6xIM+Ezr/PhSDOv860zrfOs86/z40gzrzOv865z4HOrM62zr/Ovc+EzrHOuSDPg861IM60z43OvyDOtM+Bzr/OvM6/zrvPjM6zzrnOsS4gzqDOtc+BzrnPg8+EzrHPhM65zrrPjCA3LzEwOiBHSS1NVVY3Rk5LRSwgIzQ1MSDPg8+Ezr8gUlQtMTIxNyDOus6xzrkgIzQ0OSDOvM+Mzr3OtyDPg8+Ezr8gUlQtMTIyMC4=', 'base64'), 'UTF8'),
     convert_from(decode('zpXOss60zr/OvM6xzrTOuc6xzq/OvyDOlM65zrXOuM69z47OvSDihpIgzr/OuSDPgM6xz4HOsc6zzrPOtc67zq/Otc+CIM+Ez4nOvSBpZHM6IM+Azr/Ouc6/IFJUIM61zq/Ovc6xzrkgz4TOvyDPg8+Jz4PPhM+MOyDOnM61z4TOsc+Gzr/Pgc6sIM+DzrrOrc67zr/Phc+CIM68zrUgz4TOuc+CIM61zr3PhM6/zrvOrc+CIM+Ezr/PhSBXb3JrZXIgKERFTEVURSBsZWcgKyBQT1NUIGF0dGFjaCksIM+Mz4DPic+CIM63IM61z4DOuc+DzrrOtc+Fzq4gz4TOt8+CIDcvMTAg4oCUIM68z4zOvc6/IM68zrUgwqvOvc6xzrnCuyDPhM6/z4Ugb3duZXIu', 'base64'), 'UTF8'),
     convert_from(decode('zpbOtc+NzrPOtyDPgM6xz4HOsc6zzrPOtc67zrnPjs69ICjOus6szrjOtSDOts61z43Os86/z4IgzrzOr86xIM+Gzr/Pgc6sKSDOvM61IM6RzpzOlc6jzpcgz4PPh86tz4POtywgz4zPgM+Jz4Igz4TOtyDOss67zq3PgM6/z4XOvSDOv865IHRyaWdnZXIgMDMzLzAzNyDOvM61z4TOrCDPhM6/IDA2Njogzq/OtM65zr8gzrLOsc+DzrnOus+MIEdyb3VwIElEICjPjCzPhM65IM61zq/Ovc6xzrkgz4DPgc65zr0gz4TOvyDCq3zCuyDigJQgz4TOvyBmcm9udCDOs8+BzqzPhs61zrkgz4TOtyDPg861zrnPgc6sIM+AzrHPgc6szrTOv8+DzrfPgiDCq3xyZWNBLHJlY0LCuyDOrc69zrEgzrzOrc67zr/PgiDPhM63IM+Gzr/Pgc6sKSwgbWF0Y2hlZF9pbXBvcnRfaWQgPSBsZWdhY3lfaWQgzq4gcm90YXRpb25faWQgPSBsZWdhY3lfaWQgKM66zrHOuSDOsc69zqzPgM6/zrTOsSkuIM6azrHOuSDOv865IM60z43OvyDOvM63IM60zrnOsc6zz4HOsc68zrzOrc69zrXPgiwgzrzOtSDPg866zq3Ou86/z4Igz4POtSDOts+Jzr3PhM6xzr3PjCBSVCAoc3RhdHVzIOKJoCBjYW5jZWxsZWQpLCDPg861IM6UzpnOkc6mzp/Ooc6VzqTOmc6azpEgUlQuIM6czrXPhM+BzqwgzpzOn86dzp8gz4zPhM6xzr0gz4TOv8+FzrvOrM+HzrnPg8+Ezr/OvSDOrc69zrEgzrHPgM+MIM+EzrEgzrTPjc6/IFJUIM61zq/Ovc6xzrkgzrHOus+MzrzOtyDOsc69zr/Ouc+Hz4TPjCAoc3RhdHVzIOKIiSBjYW5jZWxsZWQvY2xvc2VkL2NvbXBsZXRlKTogzrTPjc6/IM66zrvOtc65z4PPhM6sIFJUIM61zq/Ovc6xzrkgz4TOsc66z4TOv8+Azr/Ouc63zrzOrc69zrcgzrnPg8+Ezr/Pgc6vzrEg4oCUIM68zrnPg864zr/OtM6/z4POr86xIM66zrHOuSDOrc6+zr/OtM6xIM6tz4fOv8+Fzr0gzq7OtM63IM+AzrXPgc6xz4PPhM61zq8gzrrOsc65IM6/IG93bmVyIM60zrXOvSDOuM6xIM66zqzOvc61zrkgz4TOr8+Azr/PhM6xICjCq868z4zOvc6/IM+EzrEgzr3Orc6xwrspLiDOnM61z4TPgc63zrzOrc69zr8gNy8xMDogz4fPic+Bzq/PgiDOsc+Fz4TPjM69IM+Ezr/OvSDPjM+Bzr8gzr8gzq3Ou861zrPPh86/z4Igzq3OtM65zr3OtSAxIM+Dz4TOt869IM+AzrHPgc6xzrPPic6zzq4sIM+Ezr8gIzI2OCAoUlQtMTAxOCwgz4bOv8+Bz4TOt86zz4wgMTUpIOKGlCAjMzAyIChSVC0xMTM0LCDPhs6/z4HPhM63zrPPjCAyKSwgz4DOsc67zrnPjCBJTVBPUlTihpJJTVBPUlQgbWF0Y2hlZF9pbXBvcnRfaWQgz4TOv8+FIM6Rz4XOs86/z43Pg8+Ezr/PhTogzrTPjc6/IM+Gz4XPg865zrrOrCDOtM+Bzr/OvM6/zrvPjM6zzrnOsSwgzrrOsc65IM+EzrEgzrTPjc6/IM66zrvOtc65z4PPhM6sLCDPjM+HzrkgzrTOuc6sz4PPgM6xz4POty4gzpcgz4DOu861z4XPgc6sIGEgzrXOr869zrHOuSDPgM6szr3PhM6xIM+Ezr8gzrHOvc6/zrnPh8+Ez4wgUlQgKM6tzr3OsSDOts61z43Os86/z4IgzrHOvc6/zrnPh8+Ez4wrzrHOvc6/zrnPh8+Ez4wgzrzOr86xIM+Gzr/Pgc6sIM68zrUgYi5pZCA+IGEuaWQsIM6xzr3Ov865z4fPhM+MK866zrvOtc65z4PPhM+MIM68zq/OsSDPhs6/z4HOrCDOsc+Az4wgz4TOt869IM6xzr3Ov865z4fPhM6uIM+AzrvOtc+Fz4HOrCk6IM+Ezr8gzrrPjM+Dz4TOv8+CIM6xzrrOv867zr/Phc64zrXOryDPhM6xIM+DzrrOrc67zrcgz4TPic69IM6xzr3Ov865z4fPhM+Ozr0gUlQsIM+Mz4fOuSDPjM67zrcgz4TOt869IM65z4PPhM6/z4HOr86xLiDOnM61z4TPgc6sIM66zrHOuSDOts61z43Os863IM+DzrUgzqzOu867zr8gz4zPh863zrzOsTogz4TOvyAwMzMgzrHOvc6/zq/Os861zrkgz4TPjM+EzrUgz4fPic+BzrnPg8+Ez4wgUlQgzrXPgM6vz4TOt860zrXPgiwgzrHOu867zqwgzr/OvM6szrTOsS/Ots61z43Os86/z4Ivz4HPjM+EzrEgz4POtSDOtM+Nzr8gzr/Ph86uzrzOsc+EzrEgzrHOvc+EzrnPhs6sz4POus61zrkgzrzOtSDPhM63IM+Dz4fOrc+Dzrcg4oCUIM60zrnPjM+BzrjPic+DzrUgz4zPh863zrzOsSDOriDPg8+Hzq3Pg863LiDOoM6xz4HOsc6zzrPOtc67zq/OsSDPgM6/z4Ugzr8gMDMzIM6sz4bOt8+DzrUgzqfOqc6hzpnOoyBSVCDOtc+AzrXOuc60zq4gzr/OuSDPg8+FzrPOs861zr3Otc6vz4Igz4TOt8+CIM6uz4TOsc69IM6uzrTOtyDPg861IM60z43OvyBSVCDPhM63IM60zrXOr8+Hzr3Otc65IM+Ezr8gQi0wMS4gR3JvdXAgSUQgz4DOv8+FIM+AzrXPgc65zq3Ph861zrkgwqsjwrsgzrTOtc69IM+Dz4XOs866z4HOr869zrXPhM6xzrkgKM60zrnOsc+Hz4nPgc65z4PPhM65zrrPjCDPhM6/z4UgzrXOu86tzrPPh86/z4U6IM63IM67zq/Pg8+EzrEgz4PPhc69zrHPgc+Ezq7Pg861z4nOvSDPhM6/z4UgzrXOu861zrPOus+Ezq4gzrTOtc69IM6tz4fOtc65IHNwbGl0X3BhcnTCtyDPhM6/IGZyb250IM6zz4HOrM+GzrXOuSDOvM+Mzr3OvyDOs8+BzqzOvM68zrHPhM6xLCDPiM63z4bOr86xLCDCqy3Cuywgwqt8wrsgzrrOsc65IMKrLMK7KS4gaWRzID0gbGVnYWN5X2lkIM66zrHOuSDPhM+Jzr0gzrTPjc6/IM+AzrHPgc6xzrPOs861zrvOuc+Ozr0gzrrOrM64zrUgzrbOtc+NzrPOv8+Fz4Iu', 'base64'), 'UTF8'),
     NULL,
     true,
     NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '066: B-77 inserted % rows', n; END IF;

  -- 3. PROOFS inside the block: any failure rolls back everything above.
  -- 3a. each walk: the SAME function (oid) whose live text = replace(old text, condition), computed
  --     here from the old text AND equal to the md5 measured on the copy; the condition is there
  --     once and the old one is gone; swapping back gives the old text byte for byte (the
  --     rollback's way back); every attribute as before.
  IF to_regprocedure('public.rt_create_from_order()') IS DISTINCT FROM fn_create
     OR pg_get_functiondef(fn_create) IS DISTINCT FROM new_create
     OR md5(pg_get_functiondef(fn_create)) <> '8e964f66556677a284eca13db70665c6'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = fn_create) <> '0845ec6170fd2918d21efd56856daa3e'
     OR (length(new_create) - length(replace(new_create, cond_new, ''))) <> length(cond_new)
     OR position(cond_old IN new_create) > 0
     OR replace(pg_get_functiondef(fn_create), cond_new, cond_old) IS DISTINCT FROM old_create THEN
    RAISE EXCEPTION '066 proof: rt_create_from_order is not the 7/10 text with only the base Group ID compare (md5 %)', md5(pg_get_functiondef(fn_create));
  END IF;
  IF to_regprocedure('public.rt_link_split()') IS DISTINCT FROM fn_split
     OR pg_get_functiondef(fn_split) IS DISTINCT FROM new_split
     OR md5(pg_get_functiondef(fn_split)) <> 'd8a4a03dca0e8e26d4e8d227f1287590'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = fn_split) <> '6f954b256f103f1c6a8f8ab400a67808'
     OR (length(new_split) - length(replace(new_split, cond_new, ''))) <> length(cond_new)
     OR position(cond_old IN new_split) > 0
     OR replace(pg_get_functiondef(fn_split), cond_new, cond_old) IS DISTINCT FROM old_split THEN
    RAISE EXCEPTION '066 proof: rt_link_split is not the 7/10 text with only the base Group ID compare (md5 %)', md5(pg_get_functiondef(fn_split));
  END IF;
  IF (SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                       proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
        FROM pg_proc WHERE oid = fn_create) IS DISTINCT FROM attrs_create
     OR (SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                          proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
           FROM pg_proc WHERE oid = fn_split) IS DISTINCT FROM attrs_split THEN
    RAISE EXCEPTION '066 proof: owner, grants, SECURITY DEFINER, search_path or another attribute of a walk changed';
  END IF;
  -- 3b. triggers: the same two, same text, same functions; the same count; B-54 still equals it
  SELECT string_agg(t.tgname || ':' || t.tgrelid::regclass::text || ':' || t.tgenabled::text || ':' || t.tgfoid::text || ':' || md5(pg_get_triggerdef(t.oid)), ',' ORDER BY t.oid)
    INTO tg_after FROM pg_trigger t WHERE t.tgfoid IN (fn_create, fn_split) AND NOT t.tgisinternal;
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF tg_after IS DISTINCT FROM tg_before OR trg_after <> trg_before
     OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after AND baseline IS NULL) THEN
    RAISE EXCEPTION '066 proof: triggers changed (% -> %) or B-54 moved', trg_before, trg_after;
  END IF;
  -- 3c. the auditor row = the catalog file (md5 of the generated texts)
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks k WHERE k.id = 'B-77' AND k.enabled AND NOT k.is_queue AND k.baseline IS NULL
                  AND md5(k.title||'|'||k.sql_text||'|'||coalesce(k.ids_sql,'')||'|'||coalesce(k.impact,'')||'|'||coalesce(k.next_step,'')||'|'||coalesce(k.exceptions,'')||'|'||coalesce(k.entity_table,'')||'|'||k.red_op||'|'||k.red_value::text||'|'||k.severity||'|'||k.schedule_tag)
                      = '06bc6d67d2913a42091c0aba197d4c45') THEN
    RAISE EXCEPTION '066 proof: B-77 does not match the catalog (tms-auditor/checks/B-77.sql)';
  END IF;
  -- 3d. nothing else moved: no order, round trip or leg written by this block
  IF (SELECT count(*) FROM public.orders) <> orders_before
     OR (SELECT count(*) FROM public.ct_round_trips) <> rts_before
     OR (SELECT count(*) FROM public.ct_rt_legs) <> legs_before THEN
    -- 066 writes none of them; a save by someone else in the same second also lands here (fails
    -- closed, nothing kept)
    RAISE EXCEPTION '066 proof: orders, round trips or legs changed while the block ran - nothing was kept; run 066 again in a few minutes, and if this repeats, stop and copy the panel to the coordinator';
  END IF;
  -- 3e. B-54 and B-77 run the way run_checks (047) runs them: guard, 10 s timeout, as
  --     tms_check_runner (SELECT only) - a missing GRANT or a refused function fails HERE, not at the
  --     first hourly run. Texts are read before the role switch (tms_check_runner cannot read
  --     schema monitoring). B-77's value is reported, not required: it measures data, not 066.
  FOR r IN SELECT id, sql_text, ids_sql FROM monitoring.checks WHERE id IN ('B-54', 'B-77') AND enabled ORDER BY id LOOP
    PERFORM monitoring.check_sql_guard(r.sql_text);
    IF r.ids_sql IS NOT NULL THEN PERFORM monitoring.check_sql_guard(r.ids_sql); END IF;
    PERFORM set_config('statement_timeout', '10000', true);
    SET LOCAL ROLE tms_check_runner;
    EXECUTE r.sql_text INTO v;
    ids := NULL;
    IF r.ids_sql IS NOT NULL THEN EXECUTE r.ids_sql INTO ids; END IF;
    RESET ROLE;
    IF v IS NULL THEN RAISE EXCEPTION '066 proof: % returned NULL', r.id; END IF;
    IF r.id = 'B-54' AND v IS DISTINCT FROM trg_after::numeric THEN
      RAISE EXCEPTION '066 proof: B-54 = % right after the migration (expected %)', v, trg_after;
    END IF;
    IF r.id = 'B-77' THEN b77 := v; b77_ids := coalesce(array_to_string(ids, ','), ''); END IF;
  END LOOP;
  IF b77 IS NULL THEN RAISE EXCEPTION '066 proof: B-77 did not run'; END IF;

  RAISE NOTICE '066 OK: rt_create_from_order + rt_link_split compare the base Group ID (same oid/owner/grants/SECURITY DEFINER/search_path); triggers % -> %, B-54 = %; B-77 = % (ids %)',
    trg_before, trg_after, trg_after, b77, b77_ids;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
-- b77_related_on_two_rts: B-77's own SQL (tms-auditor/checks/B-77.sql), run here as the editor's role.
SELECT CASE WHEN md5(pg_get_functiondef('public.rt_create_from_order()'::regprocedure)) = '8e964f66556677a284eca13db70665c6'
             AND md5(pg_get_functiondef('public.rt_link_split()'::regprocedure)) = 'd8a4a03dca0e8e26d4e8d227f1287590'
             AND EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-77' AND enabled)
            THEN '066 OK' ELSE '066 NOT APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM orders a JOIN ct_rt_legs la ON la.order_id=a.id JOIN ct_round_trips ra ON ra.id=la.rt_id AND ra.status NOT IN ('cancelled','closed','complete')
 JOIN orders b ON b.id<>a.id AND b.deleted_at IS NULL JOIN ct_rt_legs lb ON lb.order_id=b.id JOIN ct_round_trips rb ON rb.id=lb.rt_id AND rb.status<>'cancelled'
 WHERE a.deleted_at IS NULL AND rb.id<>ra.id AND (b.id>a.id OR rb.status IN ('closed','complete'))
 AND ((a.group_id||'#'||b.group_id) ~ '^([^|#]*)(\|[^#]*)?#\1(\|[^#]*)?$'
  OR a.matched_import_id=b.legacy_id OR b.matched_import_id=a.legacy_id OR a.rotation_id=b.legacy_id OR b.rotation_id=a.legacy_id)) AS b77_related_on_two_rts;
