-- 067 ROLLBACK - takes out EXACTLY what 067_stop_delay_reason.sql put in: the three CHECKs and the three
-- columns delay_reason / delay_note / delay_responsibility of order_stops. Nothing else.
--
-- DRAFT - the owner runs it only on a decision to undo 067, AFTER 15:00, with an explicit yes.
-- ORDER (binding, the release order reversed): screens first (Daily Ops back to a build that does not
-- send "Delay Reason"/"Delay Note"), then the Worker without the three ORDER STOPS labels, then THIS.
--   Before the Worker: a read naming "Delay Reason" by fields[] and every delay save would meet a
--   missing column (PostgREST 42703 -> 500). The Daily Ops stop read is select=* (not affected).
-- REFUSES while any stop carries a reason or a note: dropping the columns would lose what dispatchers
-- declared (065 rollback, same rule). Copy them first if the owner decides to undo anyway:
--   SELECT legacy_id, order_id, stop_type, performance, delay_reason, delay_responsibility, delay_note,
--          completed_at, completed_by FROM public.order_stops WHERE delay_reason IS NOT NULL OR delay_note IS NOT NULL;
-- then clear them in their own reviewed statement (performance stays as declared).
--
-- EXPECTED: NOTICE "067 ROLLED BACK: order_stops without the delay columns and CHECKs; <n> stops,
--   <d> Delayed; ACL and owner unchanged; triggers 35 -> 35, B-54 = 35" and ONE row
--   "067 ROLLED BACK | 35 | 35 | <n> | <d>".
-- A red error = nothing changed (one DO block). ASCII only, ONE DO block, no temp tables, no superuser
-- (ALTER TABLE needs ownership of order_stops). lock_timeout 5 s as 067.

DO $do$
DECLARE
  trg_before int; trg_after int;
  stops_before bigint; delayed_before bigint; fp_before text; n bigint;
  acl_before text; owner_before oid; colacl_before text; cons_before text; cols_before text;
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  PERFORM set_config('lock_timeout', '5s', true);

  -- 0. GUARDS: 067 is there as 067 wrote it, and nobody's answer would be lost.
  IF to_regclass('monitoring.checks') IS NULL OR to_regclass('public.order_stops') IS NULL THEN
    RAISE EXCEPTION '067 rollback: monitoring.checks or public.order_stops does not exist - stop';
  END IF;
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND attnum > 0 AND NOT attisdropped
        AND attname IN ('delay_reason', 'delay_note', 'delay_responsibility')) <> 3
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass
          AND conname IN ('order_stops_delay_reason_check', 'order_stops_delay_other_note_check',
                          'order_stops_delay_only_delayed_check')) <> 3 THEN
    RAISE EXCEPTION '067 rollback: 067 is not applied (the three delay columns and the three CHECKs are not all there) - nothing to undo';
  END IF;
  IF (SELECT md5(coalesce(string_agg(conname || ':' || btrim(regexp_replace(pg_get_constraintdef(oid), '\s+', ' ', 'g')) || ';', '' ORDER BY conname), ''))
        FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname LIKE 'order_stops\_delay\_%') <> 'e17368e86ebf64f8131add2eb9426615'
     OR (SELECT md5(btrim(regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\s+', ' ', 'g')))
           FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE a.attrelid = 'public.order_stops'::regclass AND a.attname = 'delay_responsibility' AND NOT a.attisdropped AND a.attgenerated = 's')
        IS DISTINCT FROM 'd5f97f72bb703e385c95975e0241b2a8' THEN
    RAISE EXCEPTION '067 rollback: the delay CHECKs or the generated responsibility are not the 067 text - changed after 067, stop (the owner decides)';
  END IF;
  SELECT count(*) INTO n FROM public.order_stops WHERE delay_reason IS NOT NULL OR delay_note IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '067 rollback: % stop(s) carry a delay reason or note - dropping the columns would lose them; copy them first (SELECT in this file''s header), the owner decides', n;
  END IF;
  SELECT count(*) INTO trg_before FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_before AND baseline IS NULL) THEN
    RAISE EXCEPTION '067 rollback: B-54 red_value is not the live trigger count % (or has a baseline) - re-measure', trg_before;
  END IF;
  SELECT relacl::text, relowner INTO acl_before, owner_before FROM pg_class WHERE oid = 'public.order_stops'::regclass;
  SELECT coalesce(string_agg(attname || '=' || attacl::text, ',' ORDER BY attnum), '') INTO colacl_before
    FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL;
  -- what must remain: every other column (name, type, nullability, default, order) and constraint
  SELECT string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
                    || coalesce(' identity ' || nullif(a.attidentity::text, ''), '') || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), ''), ',' ORDER BY a.attnum)
    INTO cols_before
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.order_stops'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname NOT IN ('delay_reason', 'delay_note', 'delay_responsibility');
  SELECT string_agg(conname || ':' || pg_get_constraintdef(oid), ';' ORDER BY conname) INTO cons_before
    FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname NOT LIKE 'order_stops\_delay\_%';
  SELECT count(*), count(*) FILTER (WHERE performance = 'Delayed'),
         md5(coalesce(string_agg(md5((to_jsonb(s) - 'delay_reason' - 'delay_note' - 'delay_responsibility')::text), ',' ORDER BY s.id), ''))
    INTO stops_before, delayed_before, fp_before FROM public.order_stops s;

  -- 1. OUT: the CHECKs first (one of them reads the generated column), then the three columns.
  ALTER TABLE public.order_stops
    DROP CONSTRAINT order_stops_delay_only_delayed_check,
    DROP CONSTRAINT order_stops_delay_other_note_check,
    DROP CONSTRAINT order_stops_delay_reason_check,
    DROP COLUMN delay_responsibility,
    DROP COLUMN delay_note,
    DROP COLUMN delay_reason;

  -- 2. PROOFS: nothing of 067 left, everything else exactly as it was
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND attnum > 0 AND NOT attisdropped
              AND attname IN ('delay_reason', 'delay_note', 'delay_responsibility'))
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname LIKE 'order_stops\_delay\_%') THEN
    RAISE EXCEPTION '067 rollback proof: a delay column or CHECK is still there';
  END IF;
  IF (SELECT string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
                        || coalesce(' identity ' || nullif(a.attidentity::text, ''), '') || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), ''), ',' ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = 'public.order_stops'::regclass AND a.attnum > 0 AND NOT a.attisdropped) IS DISTINCT FROM cols_before
     OR (SELECT string_agg(conname || ':' || pg_get_constraintdef(oid), ';' ORDER BY conname)
           FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass) IS DISTINCT FROM cons_before THEN
    RAISE EXCEPTION '067 rollback proof: another column or constraint of order_stops moved';
  END IF;
  IF (SELECT relacl::text FROM pg_class WHERE oid = 'public.order_stops'::regclass) IS DISTINCT FROM acl_before
     OR (SELECT relowner FROM pg_class WHERE oid = 'public.order_stops'::regclass) IS DISTINCT FROM owner_before
     OR (SELECT coalesce(string_agg(attname || '=' || attacl::text, ',' ORDER BY attnum), '') FROM pg_attribute
          WHERE attrelid = 'public.order_stops'::regclass AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL)
        IS DISTINCT FROM colacl_before THEN
    RAISE EXCEPTION '067 rollback proof: owner, table ACL or a column ACL of order_stops changed';
  END IF;
  SELECT count(*) INTO n FROM public.order_stops;
  IF n <> stops_before OR (SELECT count(*) FROM public.order_stops WHERE performance = 'Delayed') <> delayed_before
     OR (SELECT md5(coalesce(string_agg(md5(to_jsonb(s)::text), ',' ORDER BY s.id), '')) FROM public.order_stops s) IS DISTINCT FROM fp_before THEN
    RAISE EXCEPTION '067 rollback proof: order_stops rows changed (% -> %) - nothing was kept; if a save by someone else landed in these seconds, run it again in a few minutes', stops_before, n;
  END IF;
  SELECT count(*) INTO trg_after FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF trg_after <> trg_before OR NOT EXISTS (SELECT 1 FROM monitoring.checks WHERE id = 'B-54' AND red_value = trg_after) THEN
    RAISE EXCEPTION '067 rollback proof: trigger count % -> % or B-54 moved', trg_before, trg_after;
  END IF;

  RAISE NOTICE '067 ROLLED BACK: order_stops without the delay columns and CHECKs; % stops, % Delayed; ACL and owner unchanged; triggers % -> %, B-54 = %',
    n, delayed_before, trg_before, trg_after, trg_after;
END $do$;

SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.order_stops'::regclass AND attnum > 0 AND NOT attisdropped
                              AND attname IN ('delay_reason', 'delay_note', 'delay_responsibility'))
             AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.order_stops'::regclass AND conname LIKE 'order_stops\_delay\_%')
            THEN '067 ROLLED BACK' ELSE '067 STILL APPLIED' END AS result,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value,
       (SELECT count(*) FROM public.order_stops) AS stops_total,
       (SELECT count(*) FROM public.order_stops WHERE performance = 'Delayed') AS stops_delayed;
