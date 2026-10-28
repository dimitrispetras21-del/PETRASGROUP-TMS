-- 076 - NATIONAL v5: THE BOARD ANSWERS IN TIME (GET /plan/board 503 "the database was late", day L 28/10). 0 ROWS.
--
-- DRAFT. Asked by the coordinator 28/10 with the owner's approval ("analysis + fix"; PRIME DIRECTIVE performance yes).
-- The owner runs it in the Supabase SQL editor with an explicit yes, after 15:00 (or before, with his yes):
--   1. 076_plan_board_speed_dryrun.sql   this block + a deliberate error: NOTHING kept (ANALYZE included)
--   2. 076_plan_board_speed.sql          (this file)
--   3. 076_plan_board_speed_verify.sql   read-only, one row
-- ASCII only. ONE DO block = ONE statement. 5 s lock timeout. No trigger (B-54 unchanged), no row written.
--
-- WHY (measured on production 28/10, SELECT and EXPLAIN only; the full record in docs/sessions/2026-10-28-dimitris-
-- plan-board-speed.md): plan_board of one week with 1 cycle and 9 pieces took 1.8-3.5 s through PostgREST and
-- 57-330 ms in a warm session; EXPLAIN (ANALYZE, BUFFERS) of its body: planning 118 ms, execution 116 ms, 3,659
-- buffers. Two causes, both under plan_board, neither in its text:
--   * v_rt_stop_state.has_late was a correlated EXISTS on v_piece_state, evaluated ONCE PER STOP: every stop walks the
--     recursive chain of EVERY piece again (v_piece_pos -> v_shipments), so the board costs stops x pieces;
--   * no table of public had statistics (pg_stat_user_tables: last_analyze / last_autoanalyze NULL everywhere; the v5
--     tables reltuples -1, under autovacuum's 50-row threshold). The planner guesses, and inside that chain it chose
--     a seq scan of order_stops (1,473 rows) and of orders repeated per row (loops=18).
--   On a PGlite copy with production's shape, the same statistics and 10x the volume (400 cycles, 2,400 pieces, 8
--   weeks), the board took 19 s (a fresh plan 100 s).
--
-- WHAT IT DOES
--   * v_rt_stop_state: has_late from ONE pass over the late end stops (a LEFT JOIN), not a sub-query per stop. Same
--     columns, same rule ("a piece ends late at this stop": v_piece_state.end_stop_id + late, 071), same rows - proved
--     in this block on the live data (the rows before = the rows after, md5 of every row). CREATE OR REPLACE VIEW
--     keeps the oid, the grants and security_invoker; nothing depends on this view (pg_depend 28/10).
--   * ANALYZE of the 17 tables the board, its views and the national readers read, so the planner knows their size;
--     from here autovacuum keeps them (its default thresholds: 50 rows + 10%).
-- NOT HERE: plan_board's text: guarded at 075's md5 (670f72f6, live 28/10) and proved unchanged after.
-- REVERSE: 076_plan_board_speed_rollback.sql puts 071's view back byte for byte (statistics stay: they change no row
--   and no answer).
-- EXPECTED: NOTICE "076 OK: ..." and ONE row: result = '076 OK', view_md5 = <new>, analyzed = 17,
--   public_triggers = b54_red_value (unchanged).

DO $do$
DECLARE
  v_rows0 text; v_rows1 text; v_acl text; v_opts text; v_cols text; v_board text;
  v_trg0 int; v_trg1 int; v_k int;
  -- 071's view, as live 28/10 (md5 of pg_get_viewdef): what the rollback puts back
  m_view_old CONSTANT text := 'f758827112c0a1a34f3feebb8cd36c44';
  m_view_new CONSTANT text := 'a4750de0d409439961612a18adbc8a58';
  -- plan_board after 075 (production 28/10): guarded, never changed here
  m_board CONSTANT text := '670f72f60edcf09f955fb1f6a74143b9';
  -- the tables ANALYZE reads (the board, its views, the readers of 074a)
  t_list CONSTANT text[] := ARRAY['shipments', 'shipment_pieces', 'piece_legs', 'rt_stops', 'ct_round_trips',
    'rt_vehicle_segments', 'plan_notices', 'orders', 'order_stops', 'national_orders', 'local_moves', 'locations',
    'clients', 'trucks', 'trailers', 'drivers', 'partners'];
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);

  -- ===== PART 0: GUARDS (read only) =====
  IF to_regprocedure('public.plan_lookups(text)') IS NULL OR to_regclass('public.v_rt_stop_state') IS NULL THEN
    RAISE EXCEPTION '076: 074a is not applied - stop';
  END IF;
  -- order 075 -> 076 (coordinator 28/10): 076 reads plan_board's text only for its md5, never rewrites it; it starts
  -- from 075's text (waiting[].direction), the one live since 28/10
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure)) <> m_board THEN
    RAISE EXCEPTION '076: plan_board is not 075''s text (md5 %) - run 075 first, or re-measure',
      md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure));
  END IF;
  IF md5(pg_get_viewdef('public.v_rt_stop_state'::regclass, true)) = m_view_new THEN
    RAISE EXCEPTION '076: already applied - run 076_plan_board_speed_verify.sql instead';
  END IF;
  IF md5(pg_get_viewdef('public.v_rt_stop_state'::regclass, true)) <> m_view_old THEN
    RAISE EXCEPTION '076: v_rt_stop_state is not 071''s view (md5 %) - stop, re-measure',
      md5(pg_get_viewdef('public.v_rt_stop_state'::regclass, true));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_depend d JOIN pg_rewrite w ON w.oid = d.objid
              WHERE d.refobjid = 'public.v_rt_stop_state'::regclass AND d.classid = 'pg_rewrite'::regclass
                AND w.ev_class <> 'public.v_rt_stop_state'::regclass) THEN
    RAISE EXCEPTION '076: a view now depends on v_rt_stop_state - stop, re-measure';
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  v_board := md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure));
  -- what the view answers today, every row (executed reads now(): one transaction, one now())
  SELECT md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.stop_id), '')) INTO v_rows0 FROM public.v_rt_stop_state v;
  SELECT coalesce(c.relacl::text, '-'), coalesce(c.reloptions::text, '-') INTO v_acl, v_opts FROM pg_class c
   WHERE c.oid = 'public.v_rt_stop_state'::regclass;
  SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum) INTO v_cols
    FROM pg_attribute a WHERE a.attrelid = 'public.v_rt_stop_state'::regclass AND a.attnum > 0 AND NOT a.attisdropped;

  -- ===== PART 1: has_late IN ONE PASS =====
  -- 071's rule unchanged: a stop "has a late piece" when a live piece ends there (v_piece_state.end_stop_id) and its
  -- planned delivery day is after the requested one (late). The late end stops are read ONCE per query and kept:
  -- MATERIALIZED, so that does not depend on the join the planner picks (plan_board reads this view once per cycle;
  -- an inlined CTE under a nested loop would walk every piece again per cycle - code review xhigh 28/10).
  CREATE OR REPLACE VIEW public.v_rt_stop_state WITH (security_invoker = true) AS
  WITH late AS MATERIALIZED (
    SELECT DISTINCT ps.end_stop_id FROM public.v_piece_state ps WHERE ps.late AND ps.end_stop_id IS NOT NULL
  ), st AS (
    SELECT s.id AS stop_id, s.rt_id, r.code, s.seq, s.side, s.location_id, s.planned_from, s.planned_to,
           (s.planned_to AT TIME ZONE 'Europe/Athens')::date AS stop_day,
           (r.status <> 'cancelled'
            AND (s.planned_to AT TIME ZONE 'Europe/Athens')::date < (now() AT TIME ZONE 'Europe/Athens')::date) AS executed,
           CASE r.trip_type WHEN 'OWNED' THEN r.truck_id IS NOT NULL ELSE r.partner_id IS NOT NULL END AS has_vehicle,
           (lt.end_stop_id IS NOT NULL) AS has_late,
           r.status AS rt_status
    FROM public.rt_stops s JOIN public.ct_round_trips r ON r.id = s.rt_id
    LEFT JOIN late lt ON lt.end_stop_id = s.id
    WHERE s.deleted_at IS NULL AND r.model = 2
  )
  -- spec 3, Board: what is executed dims (40%), per day; never without a vehicle, never when late
  SELECT st.*, (st.executed AND st.has_vehicle AND NOT st.has_late) AS dim,
         bool_and(st.executed AND st.has_vehicle AND NOT st.has_late) OVER (PARTITION BY st.rt_id, st.side) AS side_dim,
         bool_and(st.executed AND st.has_vehicle AND NOT st.has_late) OVER (PARTITION BY st.rt_id) AS cycle_dim
  FROM st;

  -- ===== PART 2: STATISTICS =====
  -- ANALYZE waits for an autovacuum working on the same table; past the 5 s lock timeout the whole block stops,
  -- nothing kept: run it again a minute later.
  FOR v_k IN 1..cardinality(t_list) LOOP
    EXECUTE format('ANALYZE public.%I', t_list[v_k]);
  END LOOP;

  -- ===== PART 3: PROOFS =====
  IF md5(pg_get_viewdef('public.v_rt_stop_state'::regclass, true)) <> m_view_new THEN
    RAISE EXCEPTION '076 proof: v_rt_stop_state is not the measured text (md5 %)', md5(pg_get_viewdef('public.v_rt_stop_state'::regclass, true));
  END IF;
  IF (SELECT coalesce(c.relacl::text, '-') FROM pg_class c WHERE c.oid = 'public.v_rt_stop_state'::regclass) <> v_acl
     OR (SELECT coalesce(c.reloptions::text, '-') FROM pg_class c WHERE c.oid = 'public.v_rt_stop_state'::regclass) <> v_opts
     OR (SELECT string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum) FROM pg_attribute a
          WHERE a.attrelid = 'public.v_rt_stop_state'::regclass AND a.attnum > 0 AND NOT a.attisdropped) <> v_cols THEN
    RAISE EXCEPTION '076 proof: v_rt_stop_state lost its grants, its security_invoker or its columns';
  END IF;
  SELECT md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.stop_id), '')) INTO v_rows1 FROM public.v_rt_stop_state v;
  IF v_rows1 <> v_rows0 THEN RAISE EXCEPTION '076 proof: v_rt_stop_state answers other rows than before'; END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.plan_board(date,text)'::regprocedure)) <> v_board THEN
    RAISE EXCEPTION '076 proof: plan_board changed';
  END IF;
  -- analyzed = a size estimate AND, for a table with rows, column statistics (pg_stats). A size estimate alone is not
  -- proof: CREATE INDEX writes one too (orders / order_stops had one, never a statistic, 28/10)
  SELECT count(*) INTO v_k FROM unnest(t_list) t
   WHERE EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = ('public.' || t)::regclass AND c.reltuples >= 0
                   AND (c.reltuples = 0 OR EXISTS (SELECT 1 FROM pg_stats ps WHERE ps.schemaname = 'public' AND ps.tablename = t)));
  IF v_k <> cardinality(t_list) THEN RAISE EXCEPTION '076 proof: % of % tables analyzed', v_k, cardinality(t_list); END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 OR (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') IS DISTINCT FROM v_trg1::numeric THEN
    RAISE EXCEPTION '076 proof: trigger count % -> % or B-54 % (expected all equal)', v_trg0, v_trg1,
      (SELECT red_value FROM monitoring.checks WHERE id = 'B-54');
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
  RAISE NOTICE '076 OK: v_rt_stop_state has_late in one pass (rows equal), % tables analyzed, plan_board unchanged; triggers % = B-54',
    cardinality(t_list), v_trg1;
END $do$;

-- The result row (read-only). If the block above failed, the editor stops before this line.
SELECT CASE WHEN md5(pg_get_viewdef('public.v_rt_stop_state'::regclass, true)) = 'a4750de0d409439961612a18adbc8a58' THEN '076 OK' ELSE '076 NOT APPLIED' END AS result,
       md5(pg_get_viewdef('public.v_rt_stop_state'::regclass, true)) AS view_md5,
       (SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.reltuples >= 0
         AND (c.reltuples = 0 OR EXISTS (SELECT 1 FROM pg_stats ps WHERE ps.schemaname = 'public' AND ps.tablename = c.relname))
         AND c.relname IN ('shipments', 'shipment_pieces', 'piece_legs', 'rt_stops', 'ct_round_trips', 'rt_vehicle_segments',
           'plan_notices', 'orders', 'order_stops', 'national_orders', 'local_moves', 'locations', 'clients', 'trucks',
           'trailers', 'drivers', 'partners')) AS analyzed,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public') AS public_triggers,
       (SELECT red_value FROM monitoring.checks WHERE id = 'B-54') AS b54_red_value;
