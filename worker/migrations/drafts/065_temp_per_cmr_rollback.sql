-- 065 ROLLBACK - puts back exactly what 057 left: orders without temp_per_cmr, orders_with_derived =
-- the 057 text (md5 4f82b738847c4770ccc379b1d558d542), 137 columns, same owner, grants, comments and
-- (no) options. DRAFT - NOT EXECUTED. ASCII only. ONE DO block (all or nothing) + one read-only result
-- SELECT. After 15:00, with an explicit yes from the owner.
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
--   comments). One transaction: other sessions never see the view missing; a request already waiting
--   on the lock at that instant may get one error (the view was re-created) - hence after 15:00.
--   Refuses if anything else depends on the view or its row type (a DROP would need CASCADE), if the
--   view has options or triggers, or if a grant on it was made by someone other than its owner - each
--   of those could not be given back exactly; the coordinator decides.
-- NO SUPERUSER NEEDED, but it must run as the OWNER of orders_with_derived (the SQL editor's
--   postgres): the re-created view belongs to whoever runs this, so anyone else is refused.
-- Proven on the PGlite copy of production (057 + 060 + 063 as executed, then 065), as superuser and as
-- a NOSUPERUSER owner: 065 -> rollback -> orders_with_derived md5 4f82b738... again, 137 columns, ACL
-- text identical, no temp_per_cmr anywhere, triggers and B-54 35 throughout, and 065 can run again.
DO $do$
DECLARE
  n bigint; trg_before int; trg_after int; orders_before bigint; owd_rows_before bigint;
  cur_view text; old_view text; dep text;
  view_oid oid; view_type oid; view_owner oid; view_acl text; view_comment text;
  col_acls text; col_comments text; give_back text[]; stmt text;
  -- 065's ONE change to the view text, the other way round (the same two strings as in 065).
  anchor_old text := E' AS stock_lot_reference\n   FROM ';
  anchor_new text := E' AS stock_lot_reference,\n    o.temp_per_cmr\n   FROM ';
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

  -- 1. THE VIEW back to the 057 text, then what the DROP took with it (read above).
  DROP VIEW public.orders_with_derived;
  EXECUTE 'CREATE VIEW public.orders_with_derived AS ' || old_view;
  FOREACH stmt IN ARRAY give_back LOOP
    EXECUTE stmt;
  END LOOP;

  -- 2. THE COLUMN
  ALTER TABLE public.orders DROP COLUMN temp_per_cmr;

  -- 3. PROOFS inside the block: any failure rolls back everything above.
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
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after) THEN
    RAISE EXCEPTION '065 rollback proof: trigger count % -> % (expected unchanged), or B-54 moved', trg_before, trg_after;
  END IF;

  RAISE NOTICE '065 rollback OK: orders_with_derived is the 057 text again (137 columns, same owner/grants), orders.temp_per_cmr gone; triggers % -> %, B-54 = %',
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
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
