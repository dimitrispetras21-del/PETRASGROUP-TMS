-- 089 - NATIONAL v5: THE PARTNER RATE OF THE ANODOS ("komistro ANODOU", P-7; owner 31/10 and 1/11).
-- DRAFT. Never run by an agent. Run by the owner after 15:00 (or with his explicit yes): the dry run, this file, verify.
-- NEEDS 086 APPLIED (#195, which needs 084 #188): plan_rt_update is patched on the text 086 writes. Order 084 -> 086 -> 089.
-- Independent of 083 (#186), 085 (#191) and 088 (#194): none of them touches what 089 touches (plan_rt_update's set
-- keys, plan_h_seg_json, rt_vehicle_segments' partner columns). 087 (pack 4) was not final on 1/11: if it patches
-- plan_rt_update or plan_h_seg_json, PART 0 stops on the md5 and the order is measured again (never a silent pass).
--
-- The owner: a partner truck that does the KATHODOS and the ANODOS of one trip is paid two agreed amounts, and the
-- assignment form shows two fields, "Komistro KATHODOU EUR" and "Komistro ANODOU EUR".
-- HOW IT IS KEPT (coordinator 1/11, "total + the ANODOS part"; principle 3, one source):
--   - rt_vehicle_segments.partner_rate stays what it is today: the segment's WHOLE partner fee. The cycle's copy
--     (plan_seg_copy), ct_v_rt_partner_cost, ct_v_rt_costs, ct_v_rt_pnl, rate_missing and the fingerprints of 073 read
--     it as today and do not change: the P&L reads the same total the screen shows (KATHODOU + ANODOU).
--   - NEW rt_vehicle_segments.partner_rate_anodos: the part of that fee that is the ANODOS. The KATHODOS part is the
--     difference and is never stored. NULL = not split (a trip with one side needs no split; on a trip with both sides
--     the board says "komistro ANODOU leipei" - never 0 in silence). Only on the segment: the cycle carries no copy.
--     The board reads it through plan_h_seg_json (the segments of every cycle), and ONLY on a trip with ONE vehicle:
--     a split is the agreement of the one partner who does both sides. After a handover each segment is its own fee
--     (plan_seg_change / prev_partner_rate, seg_many here), so a part kept on the first segment is not shown and the
--     P&L never read it (it reads the fee); removing the handover shows it again with the fee it belongs to.
--   - Why not "partner_rate = KATHODOU" (the note of 31/10): measured 1/11, the 4 partner cycles of v5 are ANODOS only
--     and their partner_rate IS the ANODOS fee (RT-1295/1321/1322/1324: 500/380/640/400). That reading would have
--     relabelled them, moved 4 rows and changed the cost views. This one moves no row.
--   - CHECK seg_partner_rate_anodos (the rule in the base, principle 4): NULL, or a PARTNER segment with a fee, the
--     part finite, >= 0 and <= the fee.
--   - BEFORE UPDATE trigger plan_seg_rate_split: a write that changes the fee, the partner or the type and does not name
--     the split itself leaves no split (the part of an old fee is not a part of the new one). So every other writer
--     (the vehicle change at a point, a correction, "Clear", PARTNER -> OWNED) needs no hunk and can never keep a stale
--     part. NOT SILENT (principle 1): every plan_* writer of a segment audits its row before and after (the part there,
--     then null - proven on PGlite), and the board says "komistro ANODOU leipei" on a trip with both sides and no split.
--
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: day L, 086 applied (plan_rt_update = 086's text), the LIVE text of plan_h_seg_json, nothing of 089
--           yet, B-54 = the enabled triggers
--   PART 1  schema: the column (no default: no row rewritten, every row NULL), its CHECK, plan_seg_rate_split + its
--           trigger (closed to every role), B-54 = measured + 1
--   PART 2  live text + hunks: plan_rt_update (set.partner_rate_anodos: a present key wins, even null = "not split"; a
--           finite number the column holds, else bad_input; written on the cycle's ONE segment after the vehicle, with
--           its audit row; a cycle with a handover = seg_many as for the vehicle), plan_h_seg_json (+ the key)
--   PART 3  proofs, NOTICE "089 OK: ..."
-- No row is written by this file. Worker: PLAN_RULE_TEXT.seg_partner_rate_anodos (the CHECK's own words) + the guard
-- marker, on the chain of #191; the body already reaches plan_rt_update as it is (PATCH /plan/rt).
-- RUN: 089_plan_partner_rate_anodos_dryrun.sql, then this file, then 089_plan_partner_rate_anodos_verify.sql.
-- REVERSE: 089_plan_partner_rate_anodos_rollback.sql (the splits are lost - the fees, and so the money, stay; it says
-- how many in its NOTICE).
DO $do$
DECLARE
  -- the hunks: (anchor in the live text, replacement); each anchor is in the live text exactly once
  u_1a CONSTANT text := $h$  v_type text; v_truck bigint; v_trailer bigint; v_driver bigint; v_partner bigint; v_rate numeric;
$h$;
  u_1b CONSTANT text := $h$  v_type text; v_truck bigint; v_trailer bigint; v_driver bigint; v_partner bigint; v_rate numeric;
  v_rate2 numeric;  -- 089: the ANODOS part of the partner fee (owner 31/10, 1/11)
$h$;
  u_2a CONSTANT text := $h$  perform plan_h_keys(v_set, array['trip_type', 'truck_id', 'trailer_id', 'driver_id', 'partner_id', 'partner_rate'], 'set');
$h$;
  u_2b CONSTANT text := $h$  perform plan_h_keys(v_set, array['trip_type', 'truck_id', 'trailer_id', 'driver_id', 'partner_id', 'partner_rate',
                                 'partner_rate_anodos'], 'set');
$h$;
  u_3a CONSTANT text := $h$    v_rate := (v_set->>'partner_rate')::numeric;
$h$;
  u_3b CONSTANT text := $h$    v_rate := (v_set->>'partner_rate')::numeric;
    v_rate2 := (v_set->>'partner_rate_anodos')::numeric;
$h$;
  u_4a CONSTANT text := $h$    perform plan_h_raise('bad_input', 'partner_rate:finite');
  end if;
$h$;
  u_4b CONSTANT text := $h$    perform plan_h_raise('bad_input', 'partner_rate:finite');
  end if;
  -- 089: the same input rule for the ANODOS part (NaN, +-Infinity, past numeric(10,2)): refused before anything is read
  if v_rate2 is not null and not (abs(v_rate2) < 'Infinity'::numeric) then
    perform plan_h_raise('bad_input', 'partner_rate_anodos:finite');
  end if;
  if v_rate2 is not null and abs(round(v_rate2, 2)) >= 100000000 then perform plan_h_raise('bad_input', 'partner_rate_anodos:range'); end if;
$h$;
  u_5a CONSTANT text := $h$    -- 5. one truck, one driver at a time, on the window after the change
$h$;
  u_5b CONSTANT text := $h$    -- 089: the ANODOS part of the fee, AFTER the vehicle (a fee or partner change above has just emptied the old
    -- part - plan_seg_rate_split - and this sets the new one). A present key wins, even null ("not split"). The cycle's
    -- ONE segment, as plan_h_seg_set_only; with a handover the cycle has no single fee (seg_many). What the part may be
    -- (PARTNER, <= the fee, >= 0) is CHECK seg_partner_rate_anodos: one rule, in the base.
    if v_set ? 'partner_rate_anodos' then
      if (select count(*) from rt_vehicle_segments where rt_id = v_rt and deleted_at is null) <> 1 then
        perform plan_h_raise('seg_many', r.code);
      end if;
      select to_jsonb(s) into v_old from rt_vehicle_segments s where s.rt_id = v_rt and s.deleted_at is null for no key update;
      update rt_vehicle_segments set partner_rate_anodos = v_rate2, updated_at = now()
       where id = (v_old->>'id')::bigint and partner_rate_anodos is distinct from v_rate2;
      if found then
        perform plan_h_audit(p_actor, p_role, 'update', 'rt_vehicle_segments', v_old->>'id', v_old,
                             (select to_jsonb(s) from rt_vehicle_segments s where s.id = (v_old->>'id')::bigint));
      end if;
    end if;
    -- 5. one truck, one driver at a time, on the window after the change
$h$;
  j_1a CONSTANT text := $h$'partner_rate', s.partner_rate, $h$;
  j_1b CONSTANT text := $h$'partner_rate', s.partner_rate,
           -- 089: the ANODOS part of the fee (NULL = not split; the KATHODOS part is the difference), only on a trip
           -- with ONE vehicle: after a handover each segment is its own fee and a part kept there would be a stale claim
           'partner_rate_anodos', case when s.n_segments = 1
             then (select g.partner_rate_anodos from rt_vehicle_segments g where g.id = s.segment_id) end, $h$;
  v_g record; v_h record; v_src text; v_new text; p pg_proc%rowtype; v_trg0 int; v_trg1 int; v_b54 int;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS =====
  IF to_regprocedure('public.plan_cutover_day()') IS NULL OR public.plan_cutover_day() IS NULL THEN
    RAISE EXCEPTION '089: day L is not set (074 / 079) - stop';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.plan_rt_update(jsonb,text,text)'))
     = 'be70612fb940356278c7c66705c8ee33' THEN
    RAISE EXCEPTION '089: 086 is not applied (order 084 -> 086 -> 089) - stop';
  END IF;
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_rt_update(jsonb,text,text)', 'd8de8c443ddc601469c53a90c4e5c1fc'),
      ('public.plan_h_seg_json(bigint)', '0db9e46033ee00a7daae9223f209df14')) g(sig, m) LOOP
    IF to_regprocedure(v_g.sig) IS NULL
       OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) IS DISTINCT FROM v_g.m THEN
      RAISE EXCEPTION '089: % is not its text after 086 (089 already applied, or changed since) - stop', v_g.sig;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.rt_vehicle_segments'::regclass AND attname = 'partner_rate_anodos')
     OR to_regprocedure('public.plan_seg_rate_split()') IS NOT NULL THEN
    RAISE EXCEPTION '089: partner_rate_anodos or plan_seg_rate_split already exists (089 already applied?) - stop';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  SELECT red_value INTO v_b54 FROM monitoring.checks WHERE id = 'B-54';
  IF v_b54 IS DISTINCT FROM v_trg0 THEN
    RAISE EXCEPTION '089: B-54 holds % but % triggers are enabled - stop, re-measure', v_b54, v_trg0;
  END IF;

  -- ===== PART 1: SCHEMA =====
  -- no default: no table rewrite, every existing segment is "not split" (none has both sides today, measured 1/11)
  ALTER TABLE public.rt_vehicle_segments ADD COLUMN partner_rate_anodos numeric(10,2);
  COMMENT ON COLUMN public.rt_vehicle_segments.partner_rate_anodos IS
    '089 (owner 31/10, 1/11): the part of partner_rate (the whole fee of this PARTNER segment) that is the ANODOS; the KATHODOS part = partner_rate - this, never stored. NULL = not split. Emptied by plan_seg_rate_split when the fee, partner or type change without naming it.';
  ALTER TABLE public.rt_vehicle_segments ADD CONSTRAINT seg_partner_rate_anodos CHECK (partner_rate_anodos IS NULL OR
    (trip_type = 'PARTNER' AND partner_rate IS NOT NULL AND partner_rate_anodos <> 'NaN'::numeric
     AND partner_rate_anodos >= 0 AND partner_rate_anodos <= partner_rate));

  -- a fee, partner or type change that does not name the split leaves none (never a part of another fee); BEFORE, so
  -- the CHECK reads the final row. The writer's own audit row shows the part before and the NULL after.
  CREATE FUNCTION public.plan_seg_rate_split() RETURNS trigger
    LANGUAGE plpgsql SET search_path = public AS $f$
begin
  if new.partner_rate_anodos is not distinct from old.partner_rate_anodos
     and (new.partner_rate, new.partner_id, new.trip_type) is distinct from (old.partner_rate, old.partner_id, old.trip_type) then
    new.partner_rate_anodos := null;
  end if;
  return new;
end
$f$;
  CREATE TRIGGER plan_seg_rate_split BEFORE UPDATE ON public.rt_vehicle_segments
    FOR EACH ROW WHEN (old.partner_rate_anodos IS NOT NULL) EXECUTE FUNCTION public.plan_seg_rate_split();
  -- internal, as 072b's own segment functions: no role calls it directly
  REVOKE ALL ON FUNCTION public.plan_seg_rate_split() FROM PUBLIC, anon, authenticated, service_role;
  -- B-54 (the auditor's hourly trigger inventory) follows the trigger this block adds, never red by surprise
  UPDATE monitoring.checks SET red_value = v_trg0 + 1 WHERE id = 'B-54';

  -- ===== PART 2: LIVE TEXT + HUNKS (md5 after = measured on the production-shaped PGlite copy) =====
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_rt_update(jsonb,text,text)', ARRAY[u_1a, u_2a, u_3a, u_4a, u_5a], ARRAY[u_1b, u_2b, u_3b, u_4b, u_5b], 'f232250e4672f3133b4a3fe06cb1da5c'),
      ('public.plan_h_seg_json(bigint)', ARRAY[j_1a], ARRAY[j_1b], 'b92f3666e087ddfd621959d47f95a4cb')) g(sig, a, b, m) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    -- plan_rt_update is plpgsql, plan_h_seg_json is sql (072b): each keeps its own language
    IF p.proconfig IS DISTINCT FROM ARRAY['search_path=public']
       OR (SELECT lanname FROM pg_language WHERE oid = p.prolang) NOT IN ('plpgsql', 'sql') THEN
      RAISE EXCEPTION '089: % is not a plpgsql / sql function with search_path=public - stop', v_g.sig;
    END IF;
    v_src := p.prosrc;
    v_new := v_src;
    FOR v_h IN SELECT * FROM unnest(v_g.a, v_g.b) h(a, b) LOOP
      IF (length(v_new) - length(replace(v_new, v_h.a, ''))) <> length(v_h.a) THEN
        RAISE EXCEPTION '089: a patch target is not in % exactly once - stop', v_g.sig;
      END IF;
      v_new := replace(v_new, v_h.a, v_h.b);
    END LOOP;
    IF md5(v_new) <> v_g.m THEN
      RAISE EXCEPTION '089: the generated text of % is not the one measured (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    -- CREATE OR REPLACE keeps the oid, owner and grants; language, SECURITY DEFINER / INVOKER and volatility as they were
    EXECUTE format('CREATE OR REPLACE FUNCTION %s(%s) RETURNS %s LANGUAGE %s %s %s SET search_path = public AS %L',
      split_part(v_g.sig, '(', 1), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
      (SELECT lanname FROM pg_language WHERE oid = p.prolang),
      CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END,
      CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p.oid) <> v_g.m
       OR (SELECT proacl::text FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.proacl::text
       OR (SELECT prosecdef FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prosecdef
       OR (SELECT provolatile FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.provolatile
       OR (SELECT prolang FROM pg_proc WHERE oid = p.oid) IS DISTINCT FROM p.prolang THEN
      RAISE EXCEPTION '089 proof: % does not hold its generated text with its old rights', v_g.sig;
    END IF;
  END LOOP;

  -- ===== PART 3: PROOFS =====
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 + 1 OR (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') IS DISTINCT FROM v_trg1 THEN
    RAISE EXCEPTION '089 proof: triggers % -> % (089 adds one), B-54 must follow', v_trg0, v_trg1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.rt_vehicle_segments'::regclass
                   AND conname = 'seg_partner_rate_anodos' AND contype = 'c' AND convalidated) THEN
    RAISE EXCEPTION '089 proof: CHECK seg_partner_rate_anodos is not in place';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rt_vehicle_segments WHERE partner_rate_anodos IS NOT NULL) THEN
    RAISE EXCEPTION '089 proof: a segment holds a split by the migration itself';
  END IF;
  RAISE NOTICE '089 OK: rt_vehicle_segments.partner_rate_anodos (the ANODOS part of the fee), its CHECK and trigger, plan_rt_update set.partner_rate_anodos, plan_h_seg_json, triggers %',
    v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_rt_update(jsonb,text,text)'::regprocedure) AS rt_update_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_seg_json(bigint)'::regprocedure) AS seg_json_md5,
       (SELECT count(*) FROM public.rt_vehicle_segments WHERE partner_rate_anodos IS NOT NULL) AS split;
