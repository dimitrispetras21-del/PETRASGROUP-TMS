-- 065 ROLLBACK - puts back exactly what 057 and 020 left: orders without temp_per_cmr, orders_with_derived =
-- the 057 text (md5 4f82b738847c4770ccc379b1d558d542), 137 columns, same owner, grants, comments and
-- (no) options; order_parent_to_legs and its trigger = the 020 texts read on production 4/10, byte for
-- byte (function md5 b1f552325162375855244a4161685fdc, trigger md5 a0ce809945f493872557b6e1a08001a3),
-- same function oid, owner, grants, SECURITY DEFINER and search_path. DRAFT - NOT EXECUTED. ASCII only.
-- ONE DO block (all or nothing) + one read-only result SELECT. After 15:00, with an explicit yes from
-- the owner.
--
-- ORDER (binding): screens without the flag -> Worker without the label "Temp Per CMR" -> THIS. A
--   Worker that still maps the label after this runs turns every ORDERS save naming it into a 500
--   and every read asking for it by name (fields[]) into a 500.
-- REFUSES while any order is marked (temp_per_cmr = true): dropping the column would lose that answer
--   silently (principle 1). Decide first - the dispatcher writes a number on those orders, or the list
--   (SELECT id, reference FROM orders WHERE temp_per_cmr) is kept elsewhere and the marks cleared.
-- HOW: a view cannot lose a column through CREATE OR REPLACE, so orders_with_derived is dropped and
--   created again from its live text minus the one line 065 added (proven: md5 = the 057 text), and its
--   grants and comments are given back from what was read just before (proven: same ACL text, same
--   comments). Supabase's default privileges in schema public hand every NEW view ALL for anon,
--   authenticated and service_role the moment it is created, so right after the CREATE the block
--   revokes everything from PUBLIC and those three (as 060's rollback does) and only then grants back
--   what was there - otherwise the view would come back wider than before and the ACL proof refuses.
--   One transaction: other sessions never see the view missing; a request already waiting on the lock
--   at that instant may get one error (the view was re-created) - hence after 15:00.
--   Refuses if anything else depends on the view or its row type (a DROP would need CASCADE), if the
--   view has options or triggers, or if a grant on it was made by someone other than its owner - each
--   of those could not be given back exactly; the coordinator decides.
--   The leg sync goes back BEFORE the column is dropped: the trigger names the column in its UPDATE OF
--   list (a DROP COLUMN would refuse) and the function reads new.temp_per_cmr (it would fail on the next
--   parent save). Both are rebuilt from their live 065 texts minus exactly what 065 added (md5-guarded);
--   CREATE OR REPLACE FUNCTION keeps oid, owner and grants (no default privileges apply), the trigger is
--   dropped and created again under its own name (still 35 triggers).
-- NO SUPERUSER NEEDED, but it must run as the OWNER of orders_with_derived (the SQL editor's
--   postgres): the re-created view belongs to whoever runs this, so anyone else is refused.
-- Proven on the PGlite copy of production (057 + 060 + 063 as executed, then 065) with Supabase's default
-- privileges in place, as superuser and as a NOSUPERUSER owner that is not a member of service_role:
-- 065 -> rollback -> orders_with_derived md5 4f82b738... again, 137 columns, ACL text identical,
-- order_parent_to_legs and its trigger md5 b1f55232... / a0ce8099... again, no temp_per_cmr anywhere,
-- triggers and B-54 35 throughout, and 065 can run again.
-- EXPECTED: NOTICE "065 rollback OK: ..." and ONE row
--   "065 ROLLED BACK | 137 | {postgres=arwdDxtm/postgres,service_role=arwDxtm/postgres} | 35 | 35 | true"
--   (the ACL is whatever V0 read before 065 - it comes back unchanged).
DO $do$
DECLARE
  n bigint; trg_before int; trg_after int; orders_before bigint; owd_rows_before bigint;
  cur_view text; old_view text; dep text;
  view_oid oid; view_type oid; view_owner oid; view_acl text; view_comment text;
  col_acls text; col_comments text; give_back text[]; stmt text;
  -- 065's ONE change to the view text, the other way round (the same two strings as in 065).
  anchor_old text := E' AS stock_lot_reference\n   FROM ';
  anchor_new text := E' AS stock_lot_reference,\n    o.temp_per_cmr\n   FROM ';
  -- 065's two pieces in order_parent_to_legs and its one name in the trigger, the other way round (the
  -- same strings as in 065).
  fn_set_old text := 'temperature_c = new.temperature_c,';
  fn_set_new text := 'temperature_c = new.temperature_c, temp_per_cmr = new.temp_per_cmr,';
  fn_dif_old text := 'temperature_c is distinct from new.temperature_c or ';
  fn_dif_new text := 'temperature_c is distinct from new.temperature_c or temp_per_cmr is distinct from new.temp_per_cmr or ';
  trg_col_old text := 'temperature_c, pallet_type,';
  trg_col_new text := 'temperature_c, temp_per_cmr, pallet_type,';
  fn_oid oid; cur_fn text; old_fn text; fn_attrs text;
  trg_oid oid; cur_trg text; old_trg text; trg_comment text;
BEGIN
  -- pg_get_viewdef prints names relative to the search_path (md5 guards below): pin it, as 065 did.
  PERFORM set_config('search_path', 'public, extensions', true);
  -- DROP/CREATE VIEW and ALTER TABLE orders take ACCESS EXCLUSIVE locks: give up after 5 s rather
  -- than queue every ORDERS request behind an idle transaction (as 065).
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS (SELECT only): 065 is applied, nobody changed the view since, nothing would be lost.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.orders'::regclass
                  AND attname = 'temp_per_cmr' AND attnum > 0 AND NOT attisdropped) THEN
    RAISE EXCEPTION '065 rollback: 065 is not applied (orders has no temp_per_cmr)';
  END IF;
  view_oid := 'public.orders_with_derived'::regclass;
  cur_view := pg_get_viewdef(view_oid);
  IF md5(cur_view) <> '55736818891a8f4e06193b23265cacf4' THEN
    RAISE EXCEPTION '065 rollback: orders_with_derived is not the 065 text (md5 %) - changed after 065, stop', md5(cur_view);
  END IF;
  IF (length(cur_view) - length(replace(cur_view, anchor_new, ''))) <> length(anchor_new) THEN
    RAISE EXCEPTION '065 rollback: the line 065 added is not where 065 put it';
  END IF;
  old_view := replace(cur_view, anchor_new, anchor_old);
  IF md5(old_view) <> '4f82b738847c4770ccc379b1d558d542' THEN
    RAISE EXCEPTION '065 rollback: the view text without the flag is not the 057 text (md5 %) - stop', md5(old_view);
  END IF;
  -- the leg sync: exactly what 065 left, and without 065's pieces exactly what 020 left
  fn_oid := to_regprocedure('public.order_parent_to_legs()');
  IF fn_oid IS NULL THEN
    RAISE EXCEPTION '065 rollback: function public.order_parent_to_legs() does not exist - stop';
  END IF;
  cur_fn := pg_get_functiondef(fn_oid);
  IF md5(cur_fn) <> '7ffe6ccd14b19f5c2b22934520ed6c9b' THEN
    RAISE EXCEPTION '065 rollback: order_parent_to_legs is not the 065 text (md5 %) - changed after 065, stop', md5(cur_fn);
  END IF;
  IF (length(cur_fn) - length(replace(cur_fn, fn_set_new, ''))) <> length(fn_set_new)
     OR (length(cur_fn) - length(replace(cur_fn, fn_dif_new, ''))) <> length(fn_dif_new) THEN
    RAISE EXCEPTION '065 rollback: the temp_per_cmr copy 065 added to order_parent_to_legs is not where 065 put it';
  END IF;
  old_fn := replace(replace(cur_fn, fn_set_new, fn_set_old), fn_dif_new, fn_dif_old);
  IF md5(old_fn) <> 'b1f552325162375855244a4161685fdc' THEN
    RAISE EXCEPTION '065 rollback: order_parent_to_legs without the flag is not the 020 text (md5 %) - stop', md5(old_fn);
  END IF;
  SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                   proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
    INTO fn_attrs FROM pg_proc WHERE oid = fn_oid;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'order_parent_to_legs' AND NOT tgisinternal) <> 1 THEN
    RAISE EXCEPTION '065 rollback: trigger order_parent_to_legs on orders is missing - stop';
  END IF;
  SELECT oid, pg_get_triggerdef(oid), obj_description(oid, 'pg_trigger') INTO trg_oid, cur_trg, trg_comment
    FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'order_parent_to_legs' AND NOT tgisinternal;
  IF md5(cur_trg) <> 'cb0735f6fa07cba7d340ab9f3a3ace4c'
     OR (SELECT tgenabled FROM pg_trigger WHERE oid = trg_oid) <> 'O'
     OR (SELECT tgfoid FROM pg_trigger WHERE oid = trg_oid) <> fn_oid THEN
    RAISE EXCEPTION '065 rollback: trigger order_parent_to_legs is not the one 065 left, enabled, calling order_parent_to_legs() (md5 %) - stop', md5(cur_trg);
  END IF;
  IF (length(cur_trg) - length(replace(cur_trg, trg_col_new, ''))) <> length(trg_col_new) THEN
    RAISE EXCEPTION '065 rollback: temp_per_cmr in the UPDATE OF list of trigger order_parent_to_legs is not where 065 put it';
  END IF;
  old_trg := replace(cur_trg, trg_col_new, trg_col_old);
  IF md5(old_trg) <> 'a0ce809945f493872557b6e1a08001a3' THEN
    RAISE EXCEPTION '065 rollback: trigger order_parent_to_legs without the flag is not the 020 trigger (md5 %) - stop', md5(old_trg);
  END IF;
  SELECT reltype, relowner, relacl::text, obj_description(oid, 'pg_class') INTO view_type, view_owner, view_acl, view_comment
    FROM pg_class WHERE oid = view_oid;
  IF view_owner <> (SELECT oid FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION '065 rollback: run it as the owner of orders_with_derived (%), not as % - the re-created view would belong to %',
      pg_get_userbyid(view_owner), current_user, current_user;
  END IF;
  IF (SELECT reloptions FROM pg_class WHERE oid = view_oid) IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = view_oid) THEN
    RAISE EXCEPTION '065 rollback: orders_with_derived has view options or triggers that a re-create would lose - the coordinator decides';
  END IF;
  IF EXISTS (SELECT 1 FROM aclexplode((SELECT relacl FROM pg_class WHERE oid = view_oid)) a WHERE a.grantor <> view_owner)
     OR EXISTS (SELECT 1 FROM pg_attribute t, aclexplode(t.attacl) a WHERE t.attrelid = view_oid AND a.grantor <> view_owner) THEN
    RAISE EXCEPTION '065 rollback: a grant on orders_with_derived was made by someone other than its owner - it cannot be given back as it was';
  END IF;
  SELECT string_agg(DISTINCT pg_describe_object(d.classid, d.objid, d.objsubid), ', ') INTO dep
    FROM pg_depend d
   WHERE d.deptype NOT IN ('i', 'a')
     AND ((d.refclassid = 'pg_class'::regclass AND d.refobjid = view_oid)
       OR (d.refclassid = 'pg_type'::regclass AND d.refobjid = view_type))
     AND NOT (d.classid = 'pg_rewrite'::regclass AND d.objid IN (SELECT oid FROM pg_rewrite WHERE ev_class = view_oid));
  IF dep IS NOT NULL THEN
    RAISE EXCEPTION '065 rollback: % depend(s) on orders_with_derived - dropping it would need CASCADE; stop', dep;
  END IF;
  SELECT count(*) INTO n FROM public.orders WHERE temp_per_cmr;
  IF n > 0 THEN
    RAISE EXCEPTION '065 rollback: % order(s) are marked "temperature as on the CMR" - dropping the column loses that; decide first (see the header)', n;
  END IF;
  -- What the DROP takes with it, read now and given back after the CREATE: table grants (in ACL
  -- order; the owner's own entry comes back by itself with the first grant), column grants, the
  -- view comment and column comments (not those of 065's own column, which goes). Proven after
  -- against the same reads.
  SELECT string_agg(attname || '=' || attacl::text, ',' ORDER BY attnum) INTO col_acls
    FROM pg_attribute WHERE attrelid = view_oid AND attnum > 0 AND NOT attisdropped AND attname <> 'temp_per_cmr' AND attacl IS NOT NULL;
  SELECT string_agg(attname || '=' || col_description(view_oid, attnum), ',' ORDER BY attnum) INTO col_comments
    FROM pg_attribute WHERE attrelid = view_oid AND attnum > 0 AND NOT attisdropped AND attname <> 'temp_per_cmr' AND col_description(view_oid, attnum) IS NOT NULL;
  give_back := ARRAY(
    SELECT format('GRANT %s ON public.orders_with_derived TO %s%s', a.privilege_type,
                  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
                  CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
      FROM unnest(view_acl::aclitem[]) WITH ORDINALITY AS e(item, pos), aclexplode(ARRAY[e.item]) a
     WHERE a.grantee <> view_owner ORDER BY e.pos)
  || ARRAY(
    SELECT format('GRANT %s (%I) ON public.orders_with_derived TO %s%s', a.privilege_type, t.attname,
                  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
                  CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
      FROM pg_attribute t, aclexplode(t.attacl) a
     WHERE t.attrelid = view_oid AND t.attnum > 0 AND NOT t.attisdropped AND t.attname <> 'temp_per_cmr' AND a.grantee <> view_owner
     ORDER BY t.attnum)
  || ARRAY(
    SELECT format('COMMENT ON COLUMN public.orders_with_derived.%I IS %L', attname, col_description(view_oid, attnum))
      FROM pg_attribute WHERE attrelid = view_oid AND attnum > 0 AND NOT attisdropped AND attname <> 'temp_per_cmr' AND col_description(view_oid, attnum) IS NOT NULL
     ORDER BY attnum);
  IF view_comment IS NOT NULL THEN
    give_back := give_back || format('COMMENT ON VIEW public.orders_with_derived IS %L', view_comment);
  END IF;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before) THEN
    RAISE EXCEPTION '065 rollback: B-54 red_value is not the live trigger count % - re-measure', trg_before;
  END IF;
  SELECT count(*) INTO orders_before FROM public.orders;
  SELECT count(*) INTO owd_rows_before FROM public.orders_with_derived;

  -- 1. THE VIEW back to the 057 text, then what the DROP took with it (read above). The REVOKE comes
  --    first: Supabase's default privileges have just given the new view ALL for anon, authenticated
  --    and service_role (060's rollback does the same); give_back then restores exactly what was read.
  DROP VIEW public.orders_with_derived;
  EXECUTE 'CREATE VIEW public.orders_with_derived AS ' || old_view;
  REVOKE ALL ON public.orders_with_derived FROM PUBLIC, anon, authenticated, service_role;
  FOREACH stmt IN ARRAY give_back LOOP
    EXECUTE stmt;
  END LOOP;

  -- 2. THE LEG SYNC back to the 020 texts, before the column goes (the trigger depends on it).
  EXECUTE old_fn;
  DROP TRIGGER order_parent_to_legs ON public.orders;
  EXECUTE old_trg;
  IF trg_comment IS NOT NULL THEN
    EXECUTE format('COMMENT ON TRIGGER order_parent_to_legs ON public.orders IS %L', trg_comment);
  END IF;

  -- 3. THE COLUMN
  ALTER TABLE public.orders DROP COLUMN temp_per_cmr;

  -- 4. PROOFS inside the block: any failure rolls back everything above.
  IF md5(pg_get_viewdef('public.orders_with_derived'::regclass)) <> '4f82b738847c4770ccc379b1d558d542'
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass
          AND attnum > 0 AND NOT attisdropped) <> 137 THEN
    RAISE EXCEPTION '065 rollback proof: orders_with_derived is not the 057 text with 137 columns';
  END IF;
  view_oid := 'public.orders_with_derived'::regclass;            -- the re-created view
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = view_oid
                  AND relowner = view_owner AND relacl::text IS NOT DISTINCT FROM view_acl AND reloptions IS NULL
                  AND obj_description(oid, 'pg_class') IS NOT DISTINCT FROM view_comment)
     OR (SELECT string_agg(attname || '=' || attacl::text, ',' ORDER BY attnum) FROM pg_attribute
          WHERE attrelid = view_oid AND attnum > 0 AND NOT attisdropped AND attname <> 'temp_per_cmr' AND attacl IS NOT NULL) IS DISTINCT FROM col_acls
     OR (SELECT string_agg(attname || '=' || col_description(view_oid, attnum), ',' ORDER BY attnum) FROM pg_attribute
          WHERE attrelid = view_oid AND attnum > 0 AND NOT attisdropped AND attname <> 'temp_per_cmr' AND col_description(view_oid, attnum) IS NOT NULL) IS DISTINCT FROM col_comments THEN
    RAISE EXCEPTION '065 rollback proof: orders_with_derived owner, grants, options or comments differ from before';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.orders'::regclass AND attname = 'temp_per_cmr' AND NOT attisdropped)
     OR (SELECT count(*) FROM public.orders) <> orders_before
     OR (SELECT count(*) FROM public.orders_with_derived) <> owd_rows_before THEN
    RAISE EXCEPTION '065 rollback proof: the column is still there, or orders / view rows changed';
  END IF;
  -- the leg sync is the 020 text again, byte for byte, on the SAME function with every attribute as
  -- before; ONE trigger of that name, the 020 trigger again, enabled, calling it, same comment
  IF to_regprocedure('public.order_parent_to_legs()') IS DISTINCT FROM fn_oid
     OR pg_get_functiondef(fn_oid) IS DISTINCT FROM old_fn
     OR md5(pg_get_functiondef(fn_oid)) <> 'b1f552325162375855244a4161685fdc'
     OR (SELECT concat_ws('|', oid, proowner, proacl::text, prosecdef, proconfig::text, prolang, provolatile, proisstrict,
                          proleakproof, proparallel, procost, prorows, prorettype, proargtypes::text, prokind)
           FROM pg_proc WHERE oid = fn_oid) IS DISTINCT FROM fn_attrs THEN
    RAISE EXCEPTION '065 rollback proof: order_parent_to_legs is not the 020 text with the same owner, grants and attributes';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'order_parent_to_legs' AND NOT tgisinternal) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_trigger t
                     WHERE t.tgrelid = 'public.orders'::regclass AND t.tgname = 'order_parent_to_legs' AND NOT t.tgisinternal
                       AND pg_get_triggerdef(t.oid) = old_trg AND md5(pg_get_triggerdef(t.oid)) = 'a0ce809945f493872557b6e1a08001a3'
                       AND t.tgenabled = 'O' AND t.tgfoid = fn_oid
                       AND obj_description(t.oid, 'pg_trigger') IS NOT DISTINCT FROM trg_comment) THEN
    RAISE EXCEPTION '065 rollback proof: trigger order_parent_to_legs is not the 020 trigger again';
  END IF;
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after) THEN
    RAISE EXCEPTION '065 rollback proof: trigger count % -> % (expected unchanged), or B-54 moved', trg_before, trg_after;
  END IF;

  RAISE NOTICE '065 rollback OK: orders_with_derived is the 057 text again (137 columns, same owner/grants), order_parent_to_legs and its trigger are the 020 texts again, orders.temp_per_cmr gone; triggers % -> %, B-54 = %',
    trg_before, trg_after, trg_after;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                              AND table_name IN ('orders', 'orders_with_derived') AND column_name = 'temp_per_cmr')
            THEN '065 ROLLED BACK' ELSE '065 STILL APPLIED' END AS result,
       (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass
         AND attnum > 0 AND NOT attisdropped) AS owd_columns,
       (SELECT relacl::text FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass) AS owd_acl,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       -- the leg sync is 020's again: no temp_per_cmr in the function, its trigger still there and enabled
       -- (structure only; verify V0 compares the md5s with search_path pinned)
       (position('temp_per_cmr' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.order_parent_to_legs()'::regprocedure)) = 0
        AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname = 'order_parent_to_legs'
                     AND tgenabled = 'O')) AS legs_sync_020;
