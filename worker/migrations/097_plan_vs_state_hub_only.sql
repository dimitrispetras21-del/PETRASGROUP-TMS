-- 097 - NATIONAL v5: THE VEROIA DAY OF A VS IS READ ONLY FROM A STOP AT VEROIA (transfer at any point, piece 1).
-- Design docs/national-v5/relax-leg-place-design-2026-11-02.md, section 4 piece 1 and table L3 (owner 2/11: a load may
-- be transferred to another truck at any point; this piece goes in and is verified BEFORE leg_place is relaxed).
-- DRAFT. Never run by an agent. Run by the owner after 15:00 (or with his explicit yes): the dry run, this file, verify.
--
-- WHAT WAS THERE (071, the only text of the view; no later migration recreated it): v_vs_state takes as the "Veroia day"
-- of a VS the day of EVERY loading of an import piece and of EVERY delivery of an export piece, and never asks whether
-- that stop is at Veroia. Today that is harmless only because leg_place (071) lets a VS stop be nothing but Veroia: an
-- import loads at Veroia (its national origin), an export delivers at Veroia (its national end).
-- WHY NOW: once a transfer point is allowed (piece 2), an export VS unloaded at Larisa on Tuesday and taken on to Veroia
-- on Wednesday would have Tuesday as its first Veroia day: plan_h_vs_follow (072) would write Tuesday into
-- orders.cross_dock_date and 069 would move the Cross-dock stop and the Ramp line with it. The Weekly International
-- would show the wrong day.
-- NOW: a stop gives a Veroia day only when it IS Veroia (locations.is_hub, the one hub: locations_one_hub): the loading
-- there of an import, the delivery there of an export. Any other stop of a VS has none (NULL). Same columns, same
-- types, same rows; first_hub_day = min over the Veroia stops only; carriers still lists EVERY cycle that carries the
-- VS (a truck that met it at a transfer point is a carrier too - design 2/11, the Weekly International "follows" shows
-- both), its hub_day NULL when that cycle does not touch Veroia for it.
--
-- WHAT, in ONE DO block (ASCII only):
--   PART 0  guards: the view is 071's text (md5 of pg_get_viewdef, the live text: measured on the production-shaped
--           copy from 071's executed file, the method 076 used for v_rt_stop_state - the dry run confirms it on
--           production); no view depends on it; what it answers now, every VS order, kept for the proof; the VS legs
--           whose counted stop is not Veroia, counted (0 expected: leg_place)
--   PART 1  CREATE OR REPLACE VIEW (keeps the oid, the grants, security_invoker; the readers are plpgsql / sql texts:
--           plan_h_vs_follow, plan_rt_update, plan_vs_set_day, plan_vs_state, plan_h_vs_carriers - none rewritten)
--   PART 2  proofs: the new text; grants, options, columns as before; EVERY VS order answers as before, row by row -
--           any that does not is named (its order id) with how many Veroia days and carrier lists changed, and the
--           block stops: nothing kept; the trigger count unchanged; NOTICE "097 OK: ..."
-- No table, no column, no trigger, no grant, no row written. No Worker change (no route reads the view directly;
-- /plan/vs-state reads plan_vs_state, whose answer is the same). No screen change.
-- ORDER: after 071 only (093, 095, 096 do not touch this view). Before piece 2 (098, the transfer point), which guards on
-- 097's md5. RUN: 097_plan_vs_state_hub_only_dryrun.sql, then this file, then 097_plan_vs_state_hub_only_verify.sql.
-- REVERSE: 097_plan_vs_state_hub_only_rollback.sql (071's view, byte for byte; refused while a VS stop off Veroia exists,
-- that is after 098 is in use: 098's rollback first).
DO $do$
DECLARE
  -- 071's view (md5 of pg_get_viewdef(.., true)): what 097 replaces and what the rollback puts back
  m_view_old CONSTANT text := '863fb6b5ff81349b9739883323e0d51b';
  m_view_new CONSTANT text := '041915cfb57a58b09f29e5232232d515';
  v_old jsonb; v_new jsonb; v_acl text; v_opts text; v_cols text; v_trg0 int; v_trg1 int;
  v_vs int; v_off int; v_days int; v_carr int; v_diff text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS (read only) =====
  IF to_regclass('public.v_vs_state') IS NULL THEN
    RAISE EXCEPTION '097: v_vs_state does not exist (071 is not applied) - stop';
  END IF;
  IF md5(pg_get_viewdef('public.v_vs_state'::regclass, true)) = m_view_new THEN
    RAISE EXCEPTION '097: already applied - run 097_plan_vs_state_hub_only_verify.sql instead';
  END IF;
  IF md5(pg_get_viewdef('public.v_vs_state'::regclass, true)) <> m_view_old THEN
    RAISE EXCEPTION '097: v_vs_state is not 071''s view (md5 %) - stop, re-measure',
      md5(pg_get_viewdef('public.v_vs_state'::regclass, true));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite w ON w.oid = d.objid
              WHERE d.refobjid = 'public.v_vs_state'::regclass AND d.classid = 'pg_rewrite'::regclass
                AND w.ev_class <> 'public.v_vs_state'::regclass) THEN
    RAISE EXCEPTION '097: a view now depends on v_vs_state - stop, re-measure';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  -- the cause of every change 097 can make: a live VS leg whose counted stop (the loading of an import, the delivery of
  -- an export) is not Veroia. leg_place keeps it 0 until the transfer point exists.
  SELECT count(*) INTO v_off
    FROM public.v_piece_state ps
    JOIN public.piece_legs l ON l.piece_id = ps.piece_id AND l.deleted_at IS NULL
    JOIN public.rt_stops pk ON pk.id = l.pickup_stop_id
    JOIN public.rt_stops dr ON dr.id = l.drop_stop_id
    LEFT JOIN public.locations hub ON hub.is_hub
   WHERE (ps.kind = 'vs_import' AND pk.location_id IS DISTINCT FROM hub.id)
      OR (ps.kind = 'vs_export' AND dr.location_id IS DISTINCT FROM hub.id);
  -- what the view answers now, every VS order (executed reads now(): one transaction, one now())
  SELECT coalesce(jsonb_object_agg(v.order_id::text, to_jsonb(v)), '{}'::jsonb), count(*) INTO v_old, v_vs
    FROM public.v_vs_state v;
  SELECT coalesce(c.relacl::text, '-'), coalesce(c.reloptions::text, '-') INTO v_acl, v_opts FROM pg_class c
   WHERE c.oid = 'public.v_vs_state'::regclass;
  SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a WHERE a.attrelid = 'public.v_vs_state'::regclass AND a.attnum > 0 AND NOT a.attisdropped;

  -- ===== PART 1: THE VEROIA DAY ONLY AT VEROIA =====
  CREATE OR REPLACE VIEW public.v_vs_state WITH (security_invoker = true) AS
  SELECT ps.order_id,
         count(DISTINCT ps.piece_id) AS n_pieces,
         bool_and(ps.executed) AS all_executed,
         bool_and(NOT ps.waiting) AS all_planned,
         -- spec 3, VS: the international shows the FIRST hub day, the others as a hint. 097: a hub day comes only from
         -- a stop AT Veroia - the loading there of an import, the delivery there of an export; a transfer point never
         -- becomes the international's cross-dock day (design 2/11, L3)
         min(CASE WHEN ps.kind = 'vs_import' AND pk.location_id = hub.id THEN (pk.planned_from AT TIME ZONE 'Europe/Athens')::date
                  WHEN ps.kind = 'vs_export' AND dr.location_id = hub.id THEN (dr.planned_to AT TIME ZONE 'Europe/Athens')::date
             END) AS first_hub_day,
         -- every cycle that carries the VS stays a carrier; its hub_day is NULL when it does not touch Veroia for it
         coalesce(jsonb_agg(DISTINCT jsonb_build_object('rt_id', r.id, 'code', r.code, 'trip_type', r.trip_type,
                    'truck_id', r.truck_id, 'driver_id', r.driver_id, 'partner_id', r.partner_id,
                    'hub_day', CASE WHEN ps.kind = 'vs_import' AND pk.location_id = hub.id
                                    THEN (pk.planned_from AT TIME ZONE 'Europe/Athens')::date
                                    WHEN ps.kind = 'vs_export' AND dr.location_id = hub.id
                                    THEN (dr.planned_to AT TIME ZONE 'Europe/Athens')::date END))
                  FILTER (WHERE r.id IS NOT NULL), '[]'::jsonb) AS carriers
  FROM public.v_piece_state ps
  LEFT JOIN public.piece_legs l ON l.piece_id = ps.piece_id AND l.deleted_at IS NULL
  LEFT JOIN public.rt_stops pk ON pk.id = l.pickup_stop_id
  LEFT JOIN public.rt_stops dr ON dr.id = l.drop_stop_id
  LEFT JOIN public.ct_round_trips r ON r.id = l.rt_id
  LEFT JOIN public.locations hub ON hub.is_hub
  WHERE ps.kind IN ('vs_import', 'vs_export')
  GROUP BY ps.order_id;

  -- ===== PART 2: PROOFS =====
  IF md5(pg_get_viewdef('public.v_vs_state'::regclass, true)) <> m_view_new THEN
    RAISE EXCEPTION '097 proof: v_vs_state is not the measured text (md5 %)', md5(pg_get_viewdef('public.v_vs_state'::regclass, true));
  END IF;
  IF (SELECT coalesce(c.relacl::text, '-') FROM pg_class c WHERE c.oid = 'public.v_vs_state'::regclass) <> v_acl
     OR (SELECT coalesce(c.reloptions::text, '-') FROM pg_class c WHERE c.oid = 'public.v_vs_state'::regclass) <> v_opts
     OR (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum) FROM pg_attribute a
          WHERE a.attrelid = 'public.v_vs_state'::regclass AND a.attnum > 0 AND NOT a.attisdropped) <> v_cols THEN
    RAISE EXCEPTION '097 proof: v_vs_state lost its grants, its security_invoker or its columns';
  END IF;
  -- row by row: a VS order that answers otherwise is named, never passed in silence (principle 1). Today none can:
  -- every counted stop is Veroia (v_off = 0). If one does, nothing is kept and the line goes to the coordinator.
  SELECT coalesce(jsonb_object_agg(v.order_id::text, to_jsonb(v)), '{}'::jsonb) INTO v_new FROM public.v_vs_state v;
  SELECT count(*) FILTER (WHERE (o.value->'first_hub_day') IS DISTINCT FROM (n.value->'first_hub_day')),
         count(*) FILTER (WHERE (o.value->'carriers') IS DISTINCT FROM (n.value->'carriers')),
         string_agg(coalesce(o.key, n.key), ', ' ORDER BY coalesce(o.key, n.key)::bigint)
           FILTER (WHERE o.value IS DISTINCT FROM n.value)
    INTO v_days, v_carr, v_diff
    FROM jsonb_each(v_old) o FULL JOIN jsonb_each(v_new) n ON n.key = o.key;
  IF v_diff IS NOT NULL THEN
    RAISE EXCEPTION '097 proof: VS orders that answer otherwise: % (Veroia day changed %, carriers changed %, VS legs off Veroia %) - nothing kept, send this line to the coordinator',
      v_diff, v_days, v_carr, v_off;
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '097 proof: trigger count % -> %', v_trg0, v_trg1; END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '097 OK: v_vs_state reads a Veroia day only at Veroia; VS orders %, Veroia day changed %, carriers changed %, VS legs off Veroia %; triggers %',
    v_vs, v_days, v_carr, v_off, v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN md5(pg_get_viewdef('public.v_vs_state'::regclass, true)) = '041915cfb57a58b09f29e5232232d515' THEN '097 OK' ELSE '097 NOT APPLIED' END AS result,
       md5(pg_get_viewdef('public.v_vs_state'::regclass, true)) AS view_md5,
       (SELECT count(*) FROM public.v_vs_state) AS vs_orders;
