-- 101 - "AFTOPARADOSI" (SELF DELIVERY): AN ORDER COUNTS AS INVOICED WITHOUT AN ERP TRANSPORT INVOICE (owner 2/11/2026)
-- EXECUTED 2/11/2026 ~14:30-14:47 by the owner (his explicit "now", before 15:00): verify 'before 101', dry run, this file,
-- verify '101 in place,2,2,2,2,new,0,0,2'. Then Worker 7bb5003a (guard --self 1). Out of drafts/ (rule 5).
--
-- WHY: some loads carry goods that belong to our own group. No transport invoice (TPY) is issued for them in the ERP,
-- so Eirini could never mark them invoiced: 043 (owner 21/9, "a number that is not in the ERP is a lie") refuses
-- invoiced = true without an ERP number and without a price, and a placeholder number is exactly the lie 043 forbids.
-- Owner 2/11: a box "Aftoparadosi" next to the TPY box; ticking it counts as invoiced. "Eirini decides" - purely her
-- manual choice per order, no detection by client or location: nothing in the base guesses it.
--
-- WHAT, in ONE DO block (ASCII only; the Greek of 043's messages is never retyped - the function is the live text with
-- one ASCII hunk):
--   PART 0  guards (read only): the column does not exist yet; invoice_mark_guard() = 043's text (md5), SECURITY
--           INVOKER, no search_path; its two triggers exactly as 043 made them, enabled; orders_with_derived and
--           national_orders_with_derived = the texts read 2/11 (md5, search_path public); B-11 / B-12 = the texts read
--           2/11; B-54 = the live trigger count
--   PART 1  orders.self_delivery and national_orders.self_delivery boolean NOT NULL DEFAULT false (a constant default:
--           no table rewrite) with a CHECK each: a self delivery IS an invoiced row WITHOUT an ERP number
--           (orders_self_delivery_no_tpy / national_orders_self_delivery_no_tpy - code review xhigh: without it a
--           row could carry the box AND a real TPY, and the screens would hide that TPY and leave it off the ERP
--           sheet); invoice_mark_guard() = live text + one hunk; the two triggers also fire on
--           self_delivery; both views get the column LAST (CREATE OR REPLACE keeps every other column, the owner and
--           the rights); B-11 / B-12 stop counting self deliveries
--   PART 2  proofs, NOTICE "101 OK: ..."
-- THE RULE after 101 (the trigger fires on the same transitions as 043, plus a change of self_delivery on an invoiced
-- row):
--   - invoiced = true with self_delivery = true: passes with no number and no price (a price may be added later).
--   - everything else exactly as 043: no number -> refused, no price -> refused.
--   - the CHECK: self_delivery = true only together with invoiced = true and no invoice number. So the box cannot be
--     set on an uninvoiced row or on a row with a TPY, and invoiced = false alone on a self delivery is refused too.
--     Measured 2/11 (SELECT): 0 uninvoiced rows hold a number, 0 rows with invoiced NULL - nothing to repair.
--   - unticking self_delivery on an invoiced row WITHOUT a number is REFUSED (043's "no number" message). It does NOT
--     clear invoiced by itself: a trigger that silently rewrites invoiced would be a write nobody asked for
--     (principle 1). The screen's "Anairesi timologisis" sends invoiced = false and self_delivery = false in ONE write,
--     which passes (043 only guards the transition TO invoiced).
-- AUDITOR: B-11 ("invoiced without TPY", P1) and B-12 ("invoiced without price", P1) would turn red on every self
-- delivery: both now read "AND NOT self_delivery". The catalog files (tms-auditor/checks/B-11.sql, B-12.sql) and the
-- 047b seed follow in the "executed" PR, as for 095 / B-93 (the PGlite fixture gains the column then too).
-- NO data row is written. Existing invoiced rows keep self_delivery = false (they all have a number, but the two of
-- 21/8, which stay as they are).
--
-- ORDER (strict): 101 BEFORE the Worker that maps "Self Delivery" (every ORDERS / NATIONAL ORDERS read selects the
-- mapped columns from these two views: that Worker before 101 is a 500 on every read), then the front end.
-- RUN: 101_self_delivery_dryrun.sql, then this file, then 101_self_delivery_verify.sql.
-- REVERSE: 101_self_delivery_rollback.sql, AFTER the Worker is rolled back and the front end reverted. It stops while
-- a live row is invoiced as a self delivery (undo those from the screen first).
-- EXPECTED: NOTICE "101 OK: ..." and nothing else. Anything else (an ERROR): nothing was kept - copy it to the coordinator.

DO $do$
DECLARE
  -- the live texts read 2/11/2026 (SELECT only, search_path = public)
  c_fn_live CONSTANT text := 'dd975c4f04f95f528c7c79a80eb4d387';
  c_owd_live CONSTANT text := '55736818891a8f4e06193b23265cacf4';
  c_nowd_live CONSTANT text := 'ad3b72f14796c219f178893fd3254549';
  c_b11_sql CONSTANT text := 'e9c5a511168f40a9a377ec1d027fa012';
  c_b11_ids CONSTANT text := '08b777022db4216a2d001e8d446f2b39';
  c_b12_sql CONSTANT text := '15c4186a24376ddfd2c716de0b15baa7';
  c_b12_ids CONSTANT text := '18f88d7a9715ad03b857c6b3673e5e38';
  c_trg_o CONSTANT text := 'CREATE TRIGGER orders_invoice_mark_guard BEFORE INSERT OR UPDATE OF invoiced, invoice_number, price ON public.orders FOR EACH ROW EXECUTE FUNCTION invoice_mark_guard()';
  c_trg_n CONSTANT text := 'CREATE TRIGGER national_orders_invoice_mark_guard BEFORE INSERT OR UPDATE OF invoiced, invoice_number, price ON public.national_orders FOR EACH ROW EXECUTE FUNCTION invoice_mark_guard()';
  -- the hunks: (anchor in the live text, replacement); each anchor is in its live text exactly once
  fn_a CONSTANT text := $h$       or new.price is distinct from old.price) then
    if coalesce(btrim(new.invoice_number), '') = '' then
$h$;
  fn_b CONSTANT text := $h$       or new.price is distinct from old.price
       or new.self_delivery is distinct from old.self_delivery) then
    -- 101 (owner 2/11/2026): a self delivery (the goods are our own group's) is invoiced without an ERP invoice -
    -- no number, no price. Eirini decides it per order, by hand; nothing here detects it. Unticking it on an
    -- invoiced row falls through to the two rules below (the screen clears invoiced in the same write).
    if new.self_delivery is true then
      return new;
    end if;
    if coalesce(btrim(new.invoice_number), '') = '' then
$h$;
  owd_a CONSTANT text := $h$    o.temp_per_cmr
   FROM $h$;
  owd_b CONSTANT text := $h$    o.temp_per_cmr,
    o.self_delivery
   FROM $h$;
  nowd_a CONSTANT text := $h$    id AS order_no
   FROM national_orders n$h$;
  nowd_b CONSTANT text := $h$    id AS order_no,
    self_delivery
   FROM national_orders n$h$;
  chk_a CONSTANT text := 'AND invoiced AND ';
  chk_b CONSTANT text := 'AND invoiced AND NOT self_delivery AND ';
  v_src text; v_new text; v_owd text; v_nowd text; v_acl_o text; v_acl_n text; v_own_o oid; v_own_n oid;
  v_cols_o int; v_cols_n int; v_fn_acl text; trg_before int; trg_after int; k int; c record;
BEGIN
  -- ALTER TABLE takes a short ACCESS EXCLUSIVE lock on orders / national_orders: give up after 5 s instead of
  -- queueing behind a long read (the whole block rolls back, run it again later).
  PERFORM set_config('lock_timeout', '5s', true);
  -- pg_get_viewdef qualifies the names it prints by the search_path: the md5 below were read with public
  PERFORM set_config('search_path', 'public', true);

  -- ===== PART 0: GUARDS =====
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attname = 'self_delivery' AND NOT attisdropped
              AND attrelid IN ('public.orders'::regclass, 'public.national_orders'::regclass)) THEN
    RAISE EXCEPTION '101: self_delivery already exists - 101 ran: run 101_self_delivery_verify.sql instead';
  END IF;
  IF to_regclass('monitoring.checks') IS NULL THEN
    RAISE EXCEPTION '101: monitoring.checks does not exist (047 must run first)';
  END IF;
  SELECT p.prosrc, p.proacl::text INTO v_src, v_fn_acl FROM pg_proc p WHERE p.oid = to_regprocedure('public.invoice_mark_guard()');
  IF md5(v_src) IS DISTINCT FROM c_fn_live THEN
    RAISE EXCEPTION '101: invoice_mark_guard() is not 043''s text read 2/11 (md5 %) - stop, re-measure', md5(v_src);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = 'public.invoice_mark_guard()'::regprocedure
              AND (p.prosecdef OR p.proconfig IS NOT NULL OR p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'plpgsql'))) THEN
    RAISE EXCEPTION '101: invoice_mark_guard() is SECURITY DEFINER, has a search_path or is not plpgsql - not as 043 made it, stop';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O'
        AND ((tgrelid = 'public.orders'::regclass AND pg_get_triggerdef(oid) = c_trg_o)
          OR (tgrelid = 'public.national_orders'::regclass AND pg_get_triggerdef(oid) = c_trg_n))) <> 2
     OR (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgfoid = 'public.invoice_mark_guard()'::regprocedure) <> 2 THEN
    RAISE EXCEPTION '101: the two invoice_mark_guard triggers are not exactly as 043 made them (enabled) - stop';
  END IF;
  v_owd := pg_get_viewdef('public.orders_with_derived'::regclass);
  v_nowd := pg_get_viewdef('public.national_orders_with_derived'::regclass);
  IF md5(v_owd) IS DISTINCT FROM c_owd_live THEN
    RAISE EXCEPTION '101: orders_with_derived is not the view read 2/11 (md5 %) - stop, re-measure', md5(v_owd);
  END IF;
  IF md5(v_nowd) IS DISTINCT FROM c_nowd_live THEN
    RAISE EXCEPTION '101: national_orders_with_derived is not the view read 2/11 (md5 %) - stop, re-measure', md5(v_nowd);
  END IF;
  FOR c IN SELECT * FROM (VALUES ('B-11', c_b11_sql, c_b11_ids, 2), ('B-12', c_b12_sql, c_b12_ids, 1)) x(id, s, i, n) LOOP
    IF NOT EXISTS (SELECT 1 FROM monitoring.checks m WHERE m.id = c.id AND md5(m.sql_text) = c.s AND md5(m.ids_sql) = c.i
                    AND (length(m.sql_text) - length(replace(m.sql_text, chk_a, ''))) = c.n * length(chk_a)
                    AND (length(m.ids_sql) - length(replace(m.ids_sql, chk_a, ''))) = length(chk_a)) THEN
      RAISE EXCEPTION '101: auditor % is not the text read 2/11 - stop, re-measure', c.id;
    END IF;
  END LOOP;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class cl ON cl.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL) THEN
    RAISE EXCEPTION '101: B-54 red_value is not the live trigger count % - a migration changed triggers without bumping it, re-measure', trg_before;
  END IF;
  -- CREATE OR REPLACE VIEW without WITH resets a view's options (security_invoker, ...): measured none 2/11
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.orders_with_derived'::regclass, 'public.national_orders_with_derived'::regclass)
              AND reloptions IS NOT NULL) THEN
    RAISE EXCEPTION '101: a view has options (reloptions) - CREATE OR REPLACE VIEW would drop them, stop';
  END IF;
  IF (length(v_src) - length(replace(v_src, fn_a, ''))) <> length(fn_a)
     OR (length(v_owd) - length(replace(v_owd, owd_a, ''))) <> length(owd_a)
     OR (length(v_nowd) - length(replace(v_nowd, nowd_a, ''))) <> length(nowd_a) THEN
    RAISE EXCEPTION '101: a hunk anchor is not in its live text exactly once - stop';
  END IF;
  SELECT relacl::text, relowner INTO v_acl_o, v_own_o FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass;
  SELECT relacl::text, relowner INTO v_acl_n, v_own_n FROM pg_class WHERE oid = 'public.national_orders_with_derived'::regclass;
  SELECT count(*) INTO v_cols_o FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass AND attnum > 0 AND NOT attisdropped;
  SELECT count(*) INTO v_cols_n FROM pg_attribute WHERE attrelid = 'public.national_orders_with_derived'::regclass AND attnum > 0 AND NOT attisdropped;

  -- ===== PART 1: CHANGES =====
  ALTER TABLE public.orders ADD COLUMN self_delivery boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT orders_self_delivery_no_tpy CHECK (NOT self_delivery OR (invoiced IS TRUE AND coalesce(btrim(invoice_number), '') = ''));
  ALTER TABLE public.national_orders ADD COLUMN self_delivery boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT national_orders_self_delivery_no_tpy CHECK (NOT self_delivery OR (invoiced IS TRUE AND coalesce(btrim(invoice_number), '') = ''));
  COMMENT ON COLUMN public.orders.self_delivery IS '101 (owner 2/11/2026): self delivery - our own group''s goods, no ERP transport invoice. Set by hand on the invoicing screen; with invoiced = true it needs no invoice number and no price (invoice_mark_guard).';
  COMMENT ON COLUMN public.national_orders.self_delivery IS '101 (owner 2/11/2026): self delivery - our own group''s goods, no ERP transport invoice. Set by hand on the invoicing screen; with invoiced = true it needs no invoice number and no price (invoice_mark_guard).';

  v_new := replace(v_src, fn_a, fn_b);
  EXECUTE format('CREATE OR REPLACE FUNCTION public.invoice_mark_guard() RETURNS trigger LANGUAGE plpgsql AS %L', v_new);

  CREATE OR REPLACE TRIGGER orders_invoice_mark_guard
    BEFORE INSERT OR UPDATE OF invoiced, invoice_number, price, self_delivery ON public.orders
    FOR EACH ROW EXECUTE FUNCTION invoice_mark_guard();
  CREATE OR REPLACE TRIGGER national_orders_invoice_mark_guard
    BEFORE INSERT OR UPDATE OF invoiced, invoice_number, price, self_delivery ON public.national_orders
    FOR EACH ROW EXECUTE FUNCTION invoice_mark_guard();

  EXECUTE 'CREATE OR REPLACE VIEW public.orders_with_derived AS ' || rtrim(replace(v_owd, owd_a, owd_b), E'; \n');
  EXECUTE 'CREATE OR REPLACE VIEW public.national_orders_with_derived AS ' || rtrim(replace(v_nowd, nowd_a, nowd_b), E'; \n');

  UPDATE monitoring.checks SET sql_text = replace(sql_text, chk_a, chk_b), ids_sql = replace(ids_sql, chk_a, chk_b)
   WHERE (id = 'B-11' AND md5(sql_text) = c_b11_sql AND md5(ids_sql) = c_b11_ids)
      OR (id = 'B-12' AND md5(sql_text) = c_b12_sql AND md5(ids_sql) = c_b12_ids);
  GET DIAGNOSTICS k = ROW_COUNT;
  IF k <> 2 THEN RAISE EXCEPTION '101: B-11 / B-12 not both updated (% rows)', k; END IF;

  -- ===== PART 2: PROOFS =====
  IF (SELECT count(*) FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attname = 'self_delivery' AND a.atttypid = 'boolean'::regtype AND a.attnotnull AND NOT a.attisdropped
         AND pg_get_expr(d.adbin, d.adrelid) = 'false'
         AND a.attrelid IN ('public.orders'::regclass, 'public.national_orders'::regclass)) <> 2 THEN
    RAISE EXCEPTION '101 proof: self_delivery is not boolean NOT NULL DEFAULT false on both tables';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND convalidated
        AND ((conrelid = 'public.orders'::regclass AND conname = 'orders_self_delivery_no_tpy')
          OR (conrelid = 'public.national_orders'::regclass AND conname = 'national_orders_self_delivery_no_tpy'))) <> 2 THEN
    RAISE EXCEPTION '101 proof: the two CHECKs (self delivery = invoiced without a TPY) are not both there, validated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE self_delivery) OR EXISTS (SELECT 1 FROM public.national_orders WHERE self_delivery) THEN
    RAISE EXCEPTION '101 proof: a row is a self delivery right after 101 (expected none)';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.invoice_mark_guard()'::regprocedure) IS DISTINCT FROM md5(v_new)
     OR (SELECT proacl::text FROM pg_proc WHERE oid = 'public.invoice_mark_guard()'::regprocedure) IS DISTINCT FROM v_fn_acl
     OR EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.invoice_mark_guard()'::regprocedure AND (prosecdef OR proconfig IS NOT NULL)) THEN
    RAISE EXCEPTION '101 proof: invoice_mark_guard() is not the live text + the hunk, with its rights';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O'
        AND ((tgrelid = 'public.orders'::regclass AND pg_get_triggerdef(oid) = replace(c_trg_o, 'price ON', 'price, self_delivery ON'))
          OR (tgrelid = 'public.national_orders'::regclass AND pg_get_triggerdef(oid) = replace(c_trg_n, 'price ON', 'price, self_delivery ON')))) <> 2 THEN
    RAISE EXCEPTION '101 proof: the two triggers do not fire on self_delivery';
  END IF;
  IF (SELECT attname FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass AND attnum = v_cols_o + 1) IS DISTINCT FROM 'self_delivery'
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.orders_with_derived'::regclass AND attnum > 0 AND NOT attisdropped) <> v_cols_o + 1
     OR (SELECT attname FROM pg_attribute WHERE attrelid = 'public.national_orders_with_derived'::regclass AND attnum = v_cols_n + 1) IS DISTINCT FROM 'self_delivery'
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.national_orders_with_derived'::regclass AND attnum > 0 AND NOT attisdropped) <> v_cols_n + 1 THEN
    RAISE EXCEPTION '101 proof: the views do not end on self_delivery with every other column kept';
  END IF;
  IF md5(pg_get_viewdef('public.orders_with_derived'::regclass)) IS DISTINCT FROM md5(replace(v_owd, owd_a, owd_b))
     OR md5(pg_get_viewdef('public.national_orders_with_derived'::regclass)) IS DISTINCT FROM md5(replace(v_nowd, nowd_a, nowd_b)) THEN
    RAISE EXCEPTION '101 proof: a view is not its live text + the one column';
  END IF;
  IF (SELECT relacl::text FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass) IS DISTINCT FROM v_acl_o
     OR (SELECT relacl::text FROM pg_class WHERE oid = 'public.national_orders_with_derived'::regclass) IS DISTINCT FROM v_acl_n
     OR (SELECT relowner FROM pg_class WHERE oid = 'public.orders_with_derived'::regclass) <> v_own_o
     OR (SELECT relowner FROM pg_class WHERE oid = 'public.national_orders_with_derived'::regclass) <> v_own_n
     OR EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.orders_with_derived'::regclass, 'public.national_orders_with_derived'::regclass)
                 AND reloptions IS NOT NULL) THEN
    RAISE EXCEPTION '101 proof: a view changed its owner, its rights or its options';
  END IF;
  IF (SELECT count(*) FROM monitoring.checks WHERE id IN ('B-11', 'B-12') AND sql_text LIKE '%NOT self_delivery%' AND ids_sql LIKE '%NOT self_delivery%') <> 2 THEN
    RAISE EXCEPTION '101 proof: B-11 / B-12 do not leave self deliveries out';
  END IF;
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class cl ON cl.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = cl.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before THEN
    RAISE EXCEPTION '101 proof: trigger count % -> % (expected unchanged, B-54)', trg_before, trg_after;
  END IF;

  RAISE NOTICE '101 OK: self_delivery on orders + national_orders (default false, 0 rows, CHECK invoiced without a TPY), invoice_mark_guard % -> %, both triggers fire on it, both views end on it, B-11 / B-12 leave it out, triggers % unchanged',
    c_fn_live, md5(v_new), trg_after;
END $do$;
