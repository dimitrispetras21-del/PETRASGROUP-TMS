-- 034 — Round trips for NATIONAL LOADS → TRIP PnL + payroll (rewrite 4/10/2026)
--
-- ✅ ΕΚΤΕΛΕΣΤΗΚΕ 4/10/2026 (owner, Supabase SQL editor, ONE statement). Verified with SELECT:
--    V1 the 2 triggers + the 2 PnL columns (revenue_intl, revenue_natl) exist, closed to anon/auth;
--    V2 0 NATL round trips / 0 national legs; V3 identical before/after: 138 RTs, revenue
--    498.190,65 (= revenue_intl, natl 0), costs and payroll totals unchanged; V5 0.
--    Before running it was reviewed read-only against the live DB (GO) and compiled + run in a
--    local PGlite copy of the full public schema (20/20 scenarios, rollback restores the md5s).
--    Written 4/10/2026 ~22:30 by Claude (read-only SELECT against the live DB). How it was run:
--    owner, Supabase SQL editor, nobody working (it LOCKs 6 tables for a few seconds). Paste the
--    WHOLE «ΤΟ BLOCK» section as ONE statement. Then run «VERIFY».
--    The 20/9 draft (two triggers, separate backfill, BEGIN/COMMIT) is recoverable with
--    `git show e1a66597:worker/migrations/034_rt_create_national.sql`.
--
-- OWNER, verbatim:
--   4/10: «Τρέχουμε το 034 τώρα, πριν ξεκινήσει, καθε RT εθνικων δημιουργει πλεον PnL και
--          μισθοδοσια. στο PnL καλυπτουμε ολα τα κομματια και θελω σε ξεχωριστο πεδιο-εθνικων/διεθνων»
--   4/10: «μόνο από 5/10.»  → NO backfill; the cut lives INSIDE the trigger function.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- WHY (root cause, not data repair — owner 7/9)
--   031/033 create a round trip only from `orders` (scope hard-coded 'INTL'). Nothing ever creates
--   one from `national_loads`, so a national load with a truck and a driver never reaches
--   dl_sync_from_rt (011) → no payroll line, and never reaches ct_v_rt_pnl → no PnL.
--   Measured 4/10: 62 live national loads, 14 with a vehicle, 0 legs with nat_load_id, 0 NATL RTs.
--
-- WHAT THIS DOES (one DO block, all-or-nothing)
--   1. rt_sync_national_load() + trigger on national_loads (ONE function, ONE trigger — the 20/9
--      draft had two, and with alphabetical AFTER-trigger order the «create» one returned early
--      while the leg still existed, so a vehicle change never re-created the trip).
--        • creation threshold = ASSIGNMENT (truck, or partner on a partner trip), not status —
--          same rule as 033 (owner 14/9);
--        • and only when the load's execution date (Athens) is ≥ 5/10/2026 (owner «μόνο από 5/10»);
--        • VS leg on the SAME truck (+compatible driver) as the international RT of its source
--          order → becomes one more leg of that RT (owner 19/9 «attach_to_source_rt = true»):
--          one physical trip = one payroll line;
--        • otherwise joins a live RT of a related national load (matched_load pair, same
--          consolidated load) on the same vehicle, or creates a new RT with scope 'NATL';
--        • VEHICLE CHANGE / REMOVAL — LEG FIRST (coordinator 4/10, RT-1193 lesson 30/9: clearing a
--          vehicle on one leg wrote NULL on the WHOLE RT and wiped payroll):
--            – sole leg of its RT  → the RT follows the load in place (keeps code + payroll line);
--              removal (no vehicle) or cancel/delete → the leg leaves → rt_recompute cancels the
--              empty RT → dl_sync_from_rt soft-deletes or flags the payroll line;
--            – shared RT           → the national leg LEAVES the RT FIRST, then (if it still has a
--              vehicle) creates/joins its own trip. The RT row, the other legs and their payroll
--              line are NEVER written by a national-load change. Proven inside the block (probe).
--   2. rt_sync_to_national_loads() + trigger on ct_round_trips: an RT re-assigned from TRIP PnL or
--      by an order (013) passes its vehicle to its national legs — but NEVER a removal (no NULL is
--      ever written into a national load from an RT; RT-1193).
--   3. rt_auto_close / rt_status_guard (046) count national legs too (open = not Delivered /
--      Cancelled, same definition). Without it a NATL RT would stay «planned» for ever. Bodies are
--      the live 4/10 text with only the leg-count query widened (UNION ALL of the two leg kinds).
--   4. PnL views:
--        • ct_v_rt_revenue: + revenue_intl, revenue_natl (owner: «ξεχωριστό πεδίο») and the national
--          revenue rule below; `revenue` for every RT that has no national leg is byte-identical.
--        • ct_v_rt_pnl: + revenue_intl, revenue_natl appended (Worker reads select=*, harmless).
--        • ct_v_rt_costs: a national partner trip's national_loads.partner_rate counts as
--          partner_planned (same slot as partner_assignments for orders). Columns unchanged.
--      The scope field ('NATL'/'INTL') already exists on ct_round_trips/ct_v_rt_pnl and the TRIP
--      PnL screen already filters by it («Πεδίο: Διεθνές/Εθνικό», modules/costs.js:859) —
--      that is the «separate field» for national round trips; revenue_natl covers the mixed RT.
--
-- REVENUE RULE (no double counting — proven by the probe and by VERIFY V4/V5)
--   • order leg (unchanged, 021): price − (x_export | x_import) when the order is Veroia Switch.
--   • VS national leg (source_type 'Direct', source_order_id): EXACTLY the share the order gave up:
--       veroia_switch of the source order (or its parent) ? (direction 'Export' ? x_export : x_import) : 0
--     counted ONCE per source order (only on the lowest-id live Direct load). order share + national
--     share = order price, wherever the two legs sit.
--     ⚠ The 021 view tested nl.direction = 'ΑΝΟΔΟΣ', but national_loads.direction holds
--       'South→North'/'North→South' (measured 4/10: 13 / 49) → every VS leg would have got x_import
--       (650) even for exports where the order gave up x_export (850): −200 per export leg. Fixed by
--       reading the source ORDER's direction — the same field the order side uses.
--   • national order (national_orders.price, not derived from an international order): counted
--     ONCE, on its «home» load = lowest-id live load with source_national_order_id, else the
--     lowest-id live load of the consolidated load holding its first groupage line.
--   • groupage line of an INTERNATIONAL order: 0 (the international order already carries the price).
--
-- SAFETY PROOF (inside the block — any failure RAISEs and NOTHING stays)
--   • pre-flight: md5 of the 2 functions and 3 views this replaces must equal what was read 4/10
--     (someone else changed them → stop, re-read; a second run also stops here);
--   • BEFORE/AFTER snapshot of EVERY round trip (vehicle, window, status, closed_at, revenue, all
--     cost columns, PnL profit) and EVERY dl_entries row; one cent / one field different → RAISE;
--   • counts of RTs, legs, dl_entries, national loads, NATL RTs unchanged (the migration itself
--     creates nothing — owner «μόνο από 5/10»);
--   • PROBE in a sub-block rolled back by a caught exception: (A) an OLD load (< 5/10) gets a
--     vehicle → no RT; (B) a VS load attaches to a live international RT, then CHANGES truck
--     (leaves first, own NATL RT) and then LOSES its vehicle — the international RT row and its
--     payroll line are identical to the start, and its revenue_intl never moves; (C) a standalone
--     national load → new NATL RT + payroll line; truck/driver change in place; Delivered closes;
--     removal cancels and soft-deletes the payroll line.
--     The probe burns ≤2 RT codes; ct_rt_code_seq is put back afterwards when nobody else used it.
--
-- BORN CLOSED (principle 5): the two new functions: REVOKE from public/anon/authenticated,
-- EXECUTE only to service_role (trigger functions do not need it to fire). Replaced objects keep
-- their ACL (CREATE OR REPLACE).
-- ═════════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════ ΤΟ BLOCK ═══════════════════════════════════════════
DO $mig$
DECLARE
  -- hashes read 4/10/2026 with SELECT md5(pg_get_functiondef(...)) / md5(pg_get_viewdef(...))
  h_auto_close constant text := 'a23ffea6e4fbc3dbe4ac16cf237568d4';
  h_guard      constant text := '51b71ebc3c55f060a94e3d4de175fb35';
  h_rev        constant text := 'c1e781f35114f0b72766c8f4122e87a4';
  h_costs      constant text := 'b0c176a3e0acb544a078c795ea8eb5ba';
  h_pnl        constant text := '0240f8caf1de7dc6c624180ebdd11a29';

  snap_rt_before jsonb; snap_rt_after jsonb;
  snap_dl_before jsonb; snap_dl_after jsonb;
  n_rt0 int; n_leg0 int; n_dl0 int; n_nl0 int; n_natl0 int; n_trg_nl0 int; n_trg_rt0 int; n_trg_leg0 int; n_trg_ord0 int;
  n_rt1 int; n_leg1 int; n_dl1 int; n_nl1 int; n_natl1 int; n_trg_nl1 int; n_trg_rt1 int; n_trg_leg1 int; n_trg_ord1 int;
  diff text;
  seq_val bigint; seq_called boolean; seq_after_probe bigint;
  probe_done boolean := false;
  would_qualify int;
BEGIN
  SET LOCAL search_path = public;
  SET LOCAL lock_timeout = '5s';

  -- ── 0. pre-flight ────────────────────────────────────────────────────────────────────────
  IF md5(pg_get_functiondef('public.rt_auto_close(bigint)'::regprocedure)) <> h_auto_close
  OR md5(pg_get_functiondef('public.rt_status_guard()'::regprocedure))     <> h_guard
  OR md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass)) <> h_rev
  OR md5(pg_get_viewdef('public.ct_v_rt_costs'::regclass))   <> h_costs
  OR md5(pg_get_viewdef('public.ct_v_rt_pnl'::regclass))     <> h_pnl THEN
    RAISE EXCEPTION '034 STOP: rt_auto_close / rt_status_guard / ct_v_rt_revenue / ct_v_rt_costs / ct_v_rt_pnl differ from what was read 4/10 (already applied, or changed by someone else) — re-read before running';
  END IF;
  IF to_regprocedure('public.rt_sync_national_load()') IS NOT NULL
  OR to_regprocedure('public.rt_sync_to_national_loads()') IS NOT NULL THEN
    RAISE EXCEPTION '034 STOP: rt_sync_national_load / rt_sync_to_national_loads already exist — already applied?';
  END IF;

  -- Freeze the inputs of the proof: nobody may write these tables while the snapshot is compared.
  LOCK TABLE public.orders, public.national_orders, public.national_loads,
             public.ct_round_trips, public.ct_rt_legs, public.dl_entries IN SHARE ROW EXCLUSIVE MODE;

  -- ── 1. BEFORE ────────────────────────────────────────────────────────────────────────────
  SELECT count(*) INTO n_rt0  FROM ct_round_trips;
  SELECT count(*) INTO n_leg0 FROM ct_rt_legs;
  SELECT count(*) INTO n_dl0  FROM dl_entries;
  SELECT count(*) INTO n_nl0  FROM national_loads;
  SELECT count(*) INTO n_natl0 FROM ct_round_trips WHERE scope = 'NATL';
  SELECT count(*) INTO n_trg_nl0  FROM pg_trigger WHERE tgrelid = 'public.national_loads'::regclass AND NOT tgisinternal;
  SELECT count(*) INTO n_trg_rt0  FROM pg_trigger WHERE tgrelid = 'public.ct_round_trips'::regclass AND NOT tgisinternal;
  SELECT count(*) INTO n_trg_leg0 FROM pg_trigger WHERE tgrelid = 'public.ct_rt_legs'::regclass AND NOT tgisinternal;
  SELECT count(*) INTO n_trg_ord0 FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal;

  SELECT jsonb_object_agg(rt.id::text, jsonb_build_object(
           'code', rt.code, 'scope', rt.scope, 'status', rt.status, 'trip_type', rt.trip_type,
           'truck', rt.truck_id, 'driver', rt.driver_id, 'trailer', rt.trailer_id, 'partner', rt.partner_id,
           'date_start', rt.date_start, 'date_end', rt.date_end, 'closed_at', rt.closed_at, 'total_km', rt.total_km,
           'revenue', rv.revenue,
           'lines_net', c.lines_net, 'vat', c.vat, 'wear', c.wear, 'dl_trip_value', c.dl_trip_value,
           'dl_expenses', c.dl_expenses, 'pay_pending', c.driver_pay_pending, 'pay_missing', c.driver_pay_missing,
           'partner_planned', c.partner_planned, 'partner_invoiced', c.partner_invoiced,
           'pnl_cost_gross', p.cost_gross, 'pnl_profit_worst', p.profit_worst, 'pnl_profit_ex_vat', p.profit_ex_vat))
    INTO snap_rt_before
  FROM ct_round_trips rt
  JOIN ct_v_rt_revenue rv ON rv.rt_id = rt.id
  JOIN ct_v_rt_costs   c  ON c.rt_id  = rt.id
  LEFT JOIN ct_v_rt_pnl p ON p.id     = rt.id;

  SELECT jsonb_object_agg(e.id::text, to_jsonb(e)) INTO snap_dl_before FROM dl_entries e;

  -- ── 2. national load → round trip (create / join / follow / leave) ──────────────────────
  EXECUTE $ddl$
CREATE FUNCTION public.rt_sync_national_load()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
declare
  -- owner 19/9: a VS national leg on the SAME truck as the international RT of its source order is
  -- one physical trip → one RT, one payroll line. false = always a separate NATL RT.
  attach_to_source_rt constant boolean := true;
  -- owner 4/10/2026, verbatim: «μόνο από 5/10.» Loads executed before this date never get an RT
  -- (no backfill). Execution date = first of loading / delivery / actual delivery / creation, Athens.
  rt_cutoff constant date := date '2026-10-05';
  exec_date   date;
  new_type    text;
  has_vehicle boolean;
  alive       boolean;
  dir         text;
  cur_leg_id  bigint;
  cur_rt      ct_round_trips%rowtype;
  n_other     int;
  compatible  boolean;
  src_rt_id   bigint;
  target      ct_round_trips%rowtype;
  n_targets   int;
  target_ids  text;
  next_seq    smallint;
  leg_rows    int;
  new_rt_id   bigint;
  d_start     date;
  d_end       date;
  init_status text;
  reason      text;
begin
  new_type := case when coalesce(new.is_partner_trip, false) then 'PARTNER' else 'OWNED' end;
  -- Vehicle consistent with the trip type: 033 tests «truck OR partner», which would try to insert a
  -- PARTNER trip without partner (CHECK partner_needs_partner) and abort the dispatcher's save.
  has_vehicle := case when new_type = 'PARTNER' then new.partner_id is not null else new.truck_id is not null end;
  alive := new.deleted_at is null and new.status is distinct from 'Cancelled';
  -- national_loads.direction = 'South→North' / 'North→South' (measured 4/10), not Import/Export.
  dir := case when new.direction = 'South→North' then 'ANODOS' else 'KATHODOS' end;

  select l.id into cur_leg_id
    from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
   where l.nat_load_id = new.id and r.status <> 'cancelled';

  if cur_leg_id is not null then
    select r.* into cur_rt from ct_round_trips r join ct_rt_legs l on l.rt_id = r.id where l.id = cur_leg_id;
    select count(*) into n_other from ct_rt_legs where rt_id = cur_rt.id and id <> cur_leg_id;

    -- Leg FIRST (RT-1193, 30/9): a load that is dead or has no vehicle leaves its round trip. The
    -- RT row is NOT written here; rt_sync_legs → rt_recompute cancels it only if no leg is left,
    -- and dl_sync_from_rt then soft-deletes (or flags, if amounts exist) ITS payroll line only.
    if not alive or not has_vehicle then
      delete from ct_rt_legs where id = cur_leg_id;
      perform rt_sync_audit('delete', 'ct_rt_legs', cur_leg_id::text,
        jsonb_build_object('rt_id', cur_rt.id, 'nat_load_id', new.id),
        jsonb_build_object('reason', case when not alive
          then 'national load cancelled/deleted — leaves its round trip (034)'
          else 'national load lost its vehicle — leaves its round trip, the other legs keep theirs (034)' end));
      return null;
    end if;

    compatible := cur_rt.trip_type = new_type and case
      when new_type = 'PARTNER' then cur_rt.partner_id is not distinct from new.partner_id
      else cur_rt.truck_id is not distinct from new.truck_id
           and (new.driver_id is null or cur_rt.driver_id is null or cur_rt.driver_id = new.driver_id) end;

    if n_other = 0 then
      -- Sole leg: this RT IS the load's trip → it follows the load in place (same code, same payroll
      -- line; dl_sync_from_rt flags a driver change made after amounts were entered).
      if cur_rt.trip_type <> new_type
         or (new_type = 'OWNED' and (cur_rt.truck_id is distinct from new.truck_id or cur_rt.driver_id is distinct from new.driver_id
                                     or cur_rt.trailer_id is distinct from new.trailer_id or cur_rt.partner_id is not null))
         or (new_type = 'PARTNER' and (cur_rt.partner_id is distinct from new.partner_id or cur_rt.truck_id is not null
                                       or cur_rt.driver_id is not null or cur_rt.trailer_id is not null)) then
        update ct_round_trips
           set trip_type  = new_type,
               truck_id   = case when new_type = 'OWNED' then new.truck_id end,
               trailer_id = case when new_type = 'OWNED' then new.trailer_id end,
               driver_id  = case when new_type = 'OWNED' then new.driver_id end,
               partner_id = case when new_type = 'PARTNER' then new.partner_id end,
               updated_at = now()
         where id = cur_rt.id;
        perform rt_sync_audit('update', 'ct_round_trips', cur_rt.id::text,
          jsonb_build_object('trip_type', cur_rt.trip_type, 'truck_id', cur_rt.truck_id, 'driver_id', cur_rt.driver_id,
                             'trailer_id', cur_rt.trailer_id, 'partner_id', cur_rt.partner_id),
          jsonb_build_object('trip_type', new_type, 'truck_id', new.truck_id, 'driver_id', new.driver_id,
                             'trailer_id', new.trailer_id, 'partner_id', new.partner_id,
                             'source_national_load', new.id, 'reason', 'sole national leg — the round trip follows its load (034)'));
      end if;
      perform rt_recompute(cur_rt.id);
      perform rt_auto_close(cur_rt.id);
      return null;
    end if;

    if compatible then
      -- dates / status only (or a driver cleared on a shared trip: never propagated, RT-1193)
      perform rt_recompute(cur_rt.id);
      perform rt_auto_close(cur_rt.id);
      return null;
    end if;

    -- Shared RT and this load now runs another vehicle/driver: LEAVE FIRST, then fall through to
    -- create/join. The shared RT and its other legs are not touched (coordinator 4/10, RT-1193).
    delete from ct_rt_legs where id = cur_leg_id;
    perform rt_sync_audit('delete', 'ct_rt_legs', cur_leg_id::text,
      jsonb_build_object('rt_id', cur_rt.id, 'nat_load_id', new.id, 'rt_truck', cur_rt.truck_id, 'rt_driver', cur_rt.driver_id),
      jsonb_build_object('truck_id', new.truck_id, 'driver_id', new.driver_id,
                         'reason', 'national load changed vehicle/driver — left the shared round trip FIRST, the other legs keep their truck and payroll (034)'));
    -- An already-existing trip is followed even for a load before the cut: it was planned under the
    -- old rule and leaving it must not orphan the vehicle change.
  else
    if not alive or not has_vehicle then return null; end if;
    -- owner 4/10 «μόνο από 5/10.»: creation only for loads executed from 5/10/2026 on.
    exec_date := (coalesce(new.loading_datetime, new.delivery_datetime,
                           new.actual_delivery_date::timestamptz, new.created_at) at time zone 'Europe/Athens')::date;
    if exec_date < rt_cutoff then return null; end if;
  end if;

  if not alive or not has_vehicle then return null; end if;

  -- A leg on a CANCELLED RT is an abandoned plan (mirror 033): free it, then go on.
  delete from ct_rt_legs l using ct_round_trips r
   where l.nat_load_id = new.id and r.id = l.rt_id and r.status = 'cancelled';
  get diagnostics leg_rows = row_count;
  if leg_rows > 0 then
    perform rt_sync_audit('delete', 'ct_rt_legs', new.id::text,
      jsonb_build_object('nat_load_id', new.id), jsonb_build_object('reason', 'stale national leg on a cancelled round trip freed (034)'));
  end if;

  -- VS leg on the same truck (and a compatible driver) as the international RT of its source order.
  if attach_to_source_rt and new.source_order_id is not null and new_type = 'OWNED' then
    select r.id into src_rt_id
      from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
     where l.order_id = new.source_order_id and r.status <> 'cancelled'
       and r.trip_type = 'OWNED' and r.truck_id = new.truck_id
       and (new.driver_id is null or r.driver_id is null or r.driver_id = new.driver_id)
     limit 1;
    if src_rt_id is not null then
      select coalesce(max(seq), 0) + 1 into next_seq from ct_rt_legs where rt_id = src_rt_id;
      insert into ct_rt_legs (rt_id, direction, nat_load_id, seq)
      values (src_rt_id, dir, new.id, next_seq)
      on conflict (nat_load_id) where nat_load_id is not null do nothing;
      get diagnostics leg_rows = row_count;
      if leg_rows = 0 then return null; end if;
      -- reopening a closed RT for an open leg is rt_auto_close's job (046, via rt_z_auto_close_legs)
      perform rt_sync_audit('update', 'ct_round_trips', src_rt_id::text, null,
        jsonb_build_object('leg_nat_load', new.id, 'direction', dir, 'seq', next_seq, 'source_order', new.source_order_id,
                           'reason', 'VS national leg attached to the international round trip of its source order — same truck (034)'));
      return null;
    end if;
  end if;

  -- Live RTs of related national loads: Veroia Switch pair (matched_load ⇄ legacy_id) and loads of
  -- the same consolidated load. No other grouping column exists on national_loads (checked 4/10).
  with recursive walk as (
    select new.id as node, 0 as depth
    union
    select n.id, w.depth + 1
    from walk w
    join national_loads cur on cur.id = w.node
    join national_loads n on n.deleted_at is null and n.id <> cur.id and (
         (cur.source_cons_load_id is not null and n.source_cons_load_id = cur.source_cons_load_id)
      or (cur.matched_load is not null and n.legacy_id = cur.matched_load)
      or (n.matched_load is not null and n.matched_load = cur.legacy_id))
    where w.depth < 6
  )
  select count(distinct r.id), string_agg(distinct r.id::text, ',')
    into n_targets, target_ids
  from walk w
  join ct_rt_legs l on l.nat_load_id = w.node
  join ct_round_trips r on r.id = l.rt_id
  where w.node <> new.id and r.status <> 'cancelled';

  if n_targets > 1 then
    perform rt_sync_audit('update', 'national_loads', new.id::text, null,
      jsonb_build_object('conflict', true, 'rt_ids', target_ids,
                         'reason', 'conflict: related national loads sit on more than one live round trip — not merged, no round trip created (034)'));
    return null;
  end if;

  if n_targets = 1 then
    select * into target from ct_round_trips where id = target_ids::bigint;
    if target.trip_type = new_type
       and (new_type = 'PARTNER' or (target.truck_id = new.truck_id
            and (new.driver_id is null or target.driver_id is null or target.driver_id = new.driver_id)))
       and (new_type = 'OWNED' or target.partner_id = new.partner_id) then
      select coalesce(max(seq), 0) + 1 into next_seq from ct_rt_legs where rt_id = target.id;
      insert into ct_rt_legs (rt_id, direction, nat_load_id, seq)
      values (target.id, dir, new.id, next_seq)
      on conflict (nat_load_id) where nat_load_id is not null do nothing;
      get diagnostics leg_rows = row_count;
      if leg_rows = 0 then return null; end if;
      perform rt_sync_audit('update', 'ct_round_trips', target.id::text, null,
        jsonb_build_object('leg_nat_load', new.id, 'direction', dir, 'seq', next_seq,
                           'reason', 'related national load attached to the pair/groupage round trip (034)'));
      return null;
    end if;
    reason := 'related round trip ' || target.code || ' runs another vehicle — separate trip (034)';
  else
    reason := 'no related round trip — first executed national load of its pair/groupage (034)';
  end if;

  d_start := coalesce(new.loading_datetime, new.actual_delivery_date, new.delivery_datetime, current_date);
  d_end   := coalesce(new.actual_delivery_date, new.delivery_datetime);
  if d_end is not null and d_end < d_start then d_end := null; end if;
  init_status := case when new.status = 'Delivered' then 'closed' else 'planned' end;

  insert into ct_round_trips
    (scope, trip_type, truck_id, trailer_id, driver_id, partner_id,
     date_start, date_end, status, source, created_by)
  values
    ('NATL', new_type,
     case when new_type = 'OWNED' then new.truck_id end,
     case when new_type = 'OWNED' then new.trailer_id end,
     case when new_type = 'OWNED' then new.driver_id end,
     case when new_type = 'PARTNER' then new.partner_id end,
     d_start, d_end, init_status, 'planner', 'trigger:rt_create_natl')
  returning id into new_rt_id;

  insert into ct_rt_legs (rt_id, direction, nat_load_id, seq)
  values (new_rt_id, dir, new.id, 1)
  on conflict (nat_load_id) where nat_load_id is not null do nothing;
  get diagnostics leg_rows = row_count;

  if leg_rows = 0 then
    delete from ct_round_trips where id = new_rt_id;
    perform rt_sync_audit('delete', 'ct_round_trips', new_rt_id::text,
      jsonb_build_object('nat_load_id', new.id, 'reason', 'lost race for the leg — another process attached it first (034)'), null);
    return null;
  end if;

  perform rt_sync_audit('create', 'ct_round_trips', new_rt_id::text, null,
    jsonb_build_object('scope', 'NATL', 'trip_type', new_type, 'date_start', d_start, 'date_end', d_end,
                       'status', init_status, 'source_national_load', new.id, 'reason', reason));
  return null;
end $body$
$ddl$;

  EXECUTE $ddl$
CREATE TRIGGER rt_sync_national_load
  AFTER INSERT OR UPDATE OF status, truck_id, partner_id, driver_id, trailer_id, is_partner_trip,
                            loading_datetime, delivery_datetime, actual_delivery_date, deleted_at,
                            matched_load, source_cons_load_id, source_order_id, source_type
  ON public.national_loads FOR EACH ROW EXECUTE FUNCTION public.rt_sync_national_load()
$ddl$;

  -- ── 3. round trip → its national legs (never a removal) ──────────────────────────────────
  EXECUTE $ddl$
CREATE FUNCTION public.rt_sync_to_national_loads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
declare sib record; is_partner boolean;
begin
  if new.status = 'cancelled' then return null; end if;
  -- An RT that LOST its vehicle (an order cleared on a shared RT, RT-1193 30/9) must not spread the
  -- loss to national loads: only a real re-assignment travels, and NULL is never written.
  if not ((new.trip_type = 'OWNED' and new.truck_id is not null)
       or (new.trip_type = 'PARTNER' and new.partner_id is not null)) then
    return null;
  end if;
  is_partner := new.trip_type = 'PARTNER';
  for sib in
    select nl.id, nl.driver_id, nl.truck_id, nl.trailer_id, nl.partner_id, nl.is_partner_trip
    from ct_rt_legs l join national_loads nl on nl.id = l.nat_load_id
    where l.rt_id = new.id and nl.deleted_at is null
      and (coalesce(nl.is_partner_trip, false) <> is_partner
        or (is_partner and nl.partner_id is distinct from new.partner_id)
        or (not is_partner and (nl.truck_id is distinct from new.truck_id
                                or nl.driver_id is distinct from coalesce(new.driver_id, nl.driver_id)
                                or nl.trailer_id is distinct from coalesce(new.trailer_id, nl.trailer_id))))
  loop
    if is_partner then
      update national_loads set is_partner_trip = true, partner_id = new.partner_id where id = sib.id;
    else
      update national_loads
         set is_partner_trip = false, truck_id = new.truck_id,
             driver_id = coalesce(new.driver_id, driver_id), trailer_id = coalesce(new.trailer_id, trailer_id)
       where id = sib.id;
    end if;
    perform rt_sync_audit('update', 'national_loads', sib.id::text, to_jsonb(sib) - 'id',
      jsonb_build_object('truck_id', new.truck_id, 'driver_id', new.driver_id, 'trailer_id', new.trailer_id,
                         'partner_id', new.partner_id, 'is_partner_trip', is_partner, 'source_rt', new.id,
                         'reason', 'round trip re-assigned — its national leg follows (034)'));
  end loop;
  return null;
end $body$
$ddl$;

  EXECUTE $ddl$
CREATE TRIGGER rt_sync_to_national_loads
  AFTER UPDATE OF driver_id, truck_id, trailer_id, partner_id, trip_type
  ON public.ct_round_trips FOR EACH ROW
  WHEN (old.driver_id  IS DISTINCT FROM new.driver_id  OR old.truck_id   IS DISTINCT FROM new.truck_id
     OR old.trailer_id IS DISTINCT FROM new.trailer_id OR old.partner_id IS DISTINCT FROM new.partner_id
     OR old.trip_type  IS DISTINCT FROM new.trip_type)
  EXECUTE FUNCTION public.rt_sync_to_national_loads()
$ddl$;

  -- Born closed (principle 5).
  EXECUTE 'REVOKE ALL ON FUNCTION public.rt_sync_national_load() FROM PUBLIC, anon, authenticated';
  EXECUTE 'REVOKE ALL ON FUNCTION public.rt_sync_to_national_loads() FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.rt_sync_national_load() TO service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.rt_sync_to_national_loads() TO service_role';

  -- ── 4. 046 rules count national legs too (live 4/10 text; only the two leg counts widened) ──
  EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.rt_auto_close(p_rt bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
declare
  r        ct_round_trips%rowtype;
  n_live   int;
  n_open   int;
  live_dl  dl_entries%rowtype;
begin
  if p_rt is null then return; end if;
  select * into r from ct_round_trips where id = p_rt;
  if r.id is null or r.status = 'cancelled' then return; end if;

  -- 034 (4/10): national legs count with the same definition of «open» as order legs.
  select count(*) filter (where x.deleted_at is null),
         count(*) filter (where x.deleted_at is null
                          and x.status is distinct from 'Delivered'
                          and x.status is distinct from 'Cancelled')
    into n_live, n_open
  from (select o.deleted_at, o.status from ct_rt_legs l join orders o on o.id = l.order_id where l.rt_id = p_rt
        union all
        select nl.deleted_at, nl.status from ct_rt_legs l join national_loads nl on nl.id = l.nat_load_id where l.rt_id = p_rt) x;

  if n_live = 0 then return; end if;

  if n_open > 0 and r.status in ('closed', 'complete') then
    update ct_round_trips
       set status = 'planned', closed_at = null, updated_at = now()
     where id = p_rt;
    perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
      jsonb_build_object('status', r.status, 'closed_at', r.closed_at),
      jsonb_build_object('status', 'planned', 'closed_at', null, 'open_legs', n_open,
                         'reason', 'reopened: ' || n_open || ' leg(s) not delivered/cancelled (046)'));

    select * into live_dl from dl_entries where rt_id = p_rt and deleted_at is null limit 1;
    if live_dl.id is not null
       and (live_dl.trip_value is not null or live_dl.advance is not null or live_dl.expenses is not null) then
      update dl_entries
         set needs_review = true,
             review_note = concat_ws(' · ', review_note,
               'ο γύρος ' || r.code || ' ξανάνοιξε ' || to_char(now(), 'DD/MM/YYYY') ||
               ' μετά την καταχώρηση ποσών — νέο σκέλος, έλεγξε την αξία (046)'),
             updated_at = now()
       where id = live_dl.id;
    end if;
    return;
  end if;

  if n_open = 0 and r.status in ('planned', 'in_progress') then
    if r.trip_type = 'OWNED' and r.truck_id is null then
      if not exists (
        select 1 from audit_log
         where actor = 'trigger:rt_sync' and table_name = 'ct_round_trips' and record_id = p_rt::text
           and after_data->>'blocked' = 'true'
           and created_at > now() - interval '7 days') then
        perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
          jsonb_build_object('status', r.status),
          jsonb_build_object('status', r.status, 'blocked', true,
                             'reason', 'not auto-closed: OWNED round trip without a truck (owned_needs_truck) — assign a truck (046)'));
      end if;
      return;
    end if;

    update ct_round_trips
       set status = 'closed', closed_at = now(), updated_at = now()
     where id = p_rt;
    perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
      jsonb_build_object('status', r.status, 'closed_at', r.closed_at),
      jsonb_build_object('status', 'closed', 'closed_at', now(), 'legs', n_live,
                         'reason', 'auto-closed: all legs delivered/cancelled (046)'));
  end if;
end $body$
$ddl$;

  EXECUTE $ddl$
CREATE OR REPLACE FUNCTION public.rt_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
declare n_open int;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('closed', 'complete') then return new; end if;

  -- 034 (4/10): an open national leg blocks a manual close exactly like an open order leg.
  select count(*) into n_open
  from (select o.deleted_at, o.status from ct_rt_legs l join orders o on o.id = l.order_id where l.rt_id = new.id
        union all
        select nl.deleted_at, nl.status from ct_rt_legs l join national_loads nl on nl.id = l.nat_load_id where l.rt_id = new.id) x
  where x.deleted_at is null
    and x.status is distinct from 'Delivered' and x.status is distinct from 'Cancelled';

  if n_open > 0 then
    raise exception 'Ο γύρος % δεν κλείνει: έχει % σκέλος/σκέλη που δεν είναι Delivered/Cancelled. Κλείνει μόνος του μόλις παραδοθούν όλα (046).',
      new.code, n_open using errcode = 'P0001';
  end if;
  return new;
end $body$
$ddl$;

  -- ── 5. PnL views ─────────────────────────────────────────────────────────────────────────
  -- Order-leg expression copied verbatim from the live 4/10 view (021); columns appended at the end.
  EXECUTE $ddl$
CREATE OR REPLACE VIEW public.ct_v_rt_revenue AS
 WITH natord_home AS (
         SELECT nord.id AS national_order_id,
            nord.price,
            COALESCE(( SELECT min(h1.id) FROM national_loads h1
                        WHERE h1.source_national_order_id = nord.id AND h1.deleted_at IS NULL),
                     ( SELECT min(h2.id) FROM national_loads h2
                        WHERE h2.deleted_at IS NULL
                          AND h2.source_cons_load_id = ( SELECT gl.cons_load_id FROM groupage_lines gl
                                                          WHERE gl.national_order_id = nord.id AND gl.deleted_at IS NULL
                                                            AND gl.cons_load_id IS NOT NULL
                                                          ORDER BY gl.id LIMIT 1))) AS home_nat_load_id
           FROM national_orders nord
          WHERE nord.deleted_at IS NULL AND nord.price IS NOT NULL AND nord.source_order_id IS NULL
        ), legs AS (
         SELECT rt.id AS rt_id,
                CASE
                    WHEN l.order_id IS NOT NULL THEN COALESCE(o.price,
                    CASE
                        WHEN o.leg_no = 1 THEN p.price
                        ELSE NULL::numeric
                    END, 0::numeric) -
                    CASE
                        WHEN
                        CASE
                            WHEN o.parent_order_id IS NOT NULL THEN p.veroia_switch
                            ELSE o.veroia_switch
                        END THEN
                        CASE
                            WHEN
                            CASE
                                WHEN o.parent_order_id IS NOT NULL THEN p.direction
                                ELSE o.direction
                            END = 'Export'::text THEN ct_setting('x_export'::text)
                            ELSE ct_setting('x_import'::text)
                        END
                        ELSE 0::numeric
                    END
                    ELSE 0::numeric
                END AS rev_intl,
                CASE
                    WHEN l.nat_load_id IS NOT NULL THEN
                    CASE
                        WHEN nl.source_type = 'Direct'::text AND nl.source_order_id IS NOT NULL
                         AND nl.id = ( SELECT min(d.id) FROM national_loads d
                                        WHERE d.source_order_id = nl.source_order_id AND d.source_type = 'Direct'::text
                                          AND d.deleted_at IS NULL)
                         AND
                         CASE
                             WHEN so.parent_order_id IS NOT NULL THEN sp.veroia_switch
                             ELSE so.veroia_switch
                         END THEN
                         CASE
                             WHEN
                             CASE
                                 WHEN so.parent_order_id IS NOT NULL THEN sp.direction
                                 ELSE so.direction
                             END = 'Export'::text THEN ct_setting('x_export'::text)
                             ELSE ct_setting('x_import'::text)
                         END
                        ELSE 0::numeric
                    END + COALESCE(( SELECT sum(h.price) FROM natord_home h WHERE h.home_nat_load_id = nl.id), 0::numeric)
                    ELSE 0::numeric
                END AS rev_natl
           FROM ct_round_trips rt
             LEFT JOIN ct_rt_legs l ON l.rt_id = rt.id
             LEFT JOIN orders o ON o.id = l.order_id
             LEFT JOIN orders p ON p.id = o.parent_order_id
             LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
             LEFT JOIN orders so ON so.id = nl.source_order_id
             LEFT JOIN orders sp ON sp.id = so.parent_order_id
        )
 SELECT legs.rt_id,
    COALESCE(sum(legs.rev_intl + legs.rev_natl), 0::numeric) AS revenue,
    COALESCE(sum(legs.rev_intl), 0::numeric) AS revenue_intl,
    COALESCE(sum(legs.rev_natl), 0::numeric) AS revenue_natl
   FROM legs
  GROUP BY legs.rt_id
$ddl$;

  EXECUTE $ddl$
CREATE OR REPLACE VIEW public.ct_v_rt_costs AS
 WITH lines AS (
         SELECT ct_cost_lines.rt_id,
            sum(ct_cost_lines.net) FILTER (WHERE ct_cost_lines.category <> 'partner_rate'::text) AS net_other,
            sum(ct_cost_lines.vat) AS vat,
            sum(ct_cost_lines.net) FILTER (WHERE ct_cost_lines.category = 'partner_rate'::text) AS partner_invoiced
           FROM ct_cost_lines
          WHERE ct_cost_lines.rt_id IS NOT NULL
          GROUP BY ct_cost_lines.rt_id
        ), carried AS (
         SELECT l.rt_id,
            o.id AS order_id
           FROM ct_rt_legs l
             JOIN orders o ON o.id = l.order_id
        UNION
         SELECT l.rt_id,
            s.id
           FROM ct_rt_legs l
             JOIN orders o ON o.id = l.order_id AND o.parent_order_id IS NOT NULL
             JOIN orders s ON s.parent_order_id = o.parent_order_id AND s.id <> o.id AND s.deleted_at IS NULL AND s.partner_id IS NOT NULL
          WHERE NOT (EXISTS ( SELECT 1
                   FROM ct_rt_legs l2
                     JOIN ct_round_trips r2 ON r2.id = l2.rt_id
                  WHERE l2.order_id = s.id AND r2.status <> 'cancelled'::text))
        ), planned AS (
         SELECT x.rt_id,
            sum(x.partner_rate) AS partner_planned
           FROM ( SELECT c.rt_id,
                    pa.partner_rate
                   FROM carried c
                     JOIN LATERAL ( SELECT pa_1.partner_rate
                           FROM partner_assignments pa_1
                          WHERE pa_1.order_id = c.order_id AND pa_1.deleted_at IS NULL AND pa_1.status <> 'Cancelled'::text
                          ORDER BY pa_1.id DESC
                         LIMIT 1) pa ON true
                UNION ALL
                 SELECT l.rt_id,
                    nl.partner_rate
                   FROM ct_rt_legs l
                     JOIN national_loads nl ON nl.id = l.nat_load_id
                  WHERE nl.deleted_at IS NULL AND COALESCE(nl.is_partner_trip, false) AND nl.partner_rate IS NOT NULL) x
          GROUP BY x.rt_id
        )
 SELECT rt.id AS rt_id,
    COALESCE(li.net_other, 0::numeric) + COALESCE(NULLIF(li.partner_invoiced, 0::numeric), pl.partner_planned, 0::numeric) + COALESCE(dl.trip_value, 0::numeric) + COALESCE(dl.expenses, 0::numeric) AS lines_net,
    COALESCE(li.vat, 0::numeric) AS vat,
        CASE
            WHEN rt.trip_type = 'OWNED'::text AND rt.total_km IS NOT NULL THEN round(COALESCE(w.eur_per_km, ct_setting('wear_fallback_eur_km'::text)) * rt.total_km::numeric, 2)
            ELSE 0::numeric
        END AS wear,
    dl.trip_value AS dl_trip_value,
    dl.expenses AS dl_expenses,
    dl.id IS NOT NULL AND dl.trip_value IS NULL AS driver_pay_pending,
    rt.trip_type = 'OWNED'::text AND rt.driver_id IS NOT NULL AND dl.id IS NULL AS driver_pay_missing,
    COALESCE(pl.partner_planned, 0::numeric) AS partner_planned,
    COALESCE(li.partner_invoiced, 0::numeric) AS partner_invoiced
   FROM ct_round_trips rt
     LEFT JOIN lines li ON li.rt_id = rt.id
     LEFT JOIN planned pl ON pl.rt_id = rt.id
     LEFT JOIN dl_entries dl ON dl.rt_id = rt.id AND dl.deleted_at IS NULL
     LEFT JOIN ct_v_wear_rate w ON w.truck_id = rt.truck_id
$ddl$;

  EXECUTE $ddl$
CREATE OR REPLACE VIEW public.ct_v_rt_pnl AS
 SELECT rt.id,
    rt.code,
    rt.scope,
    rt.trip_type,
    rt.truck_id,
    rt.driver_id,
    rt.partner_id,
    rt.date_start,
    rt.date_end,
    rt.status,
    rt.total_km,
    r.revenue,
    c.lines_net + c.wear AS cost_net,
    c.vat AS cost_vat,
    c.lines_net + c.wear + c.vat AS cost_gross,
    r.revenue - (c.lines_net + c.wear + c.vat) AS profit_worst,
    r.revenue - (c.lines_net + c.wear) AS profit_ex_vat,
        CASE
            WHEN r.revenue > 0::numeric THEN round((r.revenue - (c.lines_net + c.wear + c.vat)) / r.revenue * 100::numeric, 1)
            ELSE NULL::numeric
        END AS margin_worst_pct,
        CASE
            WHEN r.revenue > 0::numeric THEN round((r.revenue - (c.lines_net + c.wear)) / r.revenue * 100::numeric, 1)
            ELSE NULL::numeric
        END AS margin_ex_vat_pct,
    c.dl_trip_value,
    c.dl_expenses,
    c.driver_pay_pending,
    c.driver_pay_missing,
    c.partner_planned,
    c.partner_invoiced,
    r.revenue_intl,
    r.revenue_natl
   FROM ct_round_trips rt
     JOIN ct_v_rt_revenue r ON r.rt_id = rt.id
     JOIN ct_v_rt_costs c ON c.rt_id = rt.id
  WHERE rt.status <> 'cancelled'::text
$ddl$;

  -- ── 6. PROBE — real behaviour, rolled back by a caught exception (nothing of it stays) ──────
  SELECT last_value, is_called INTO seq_val, seq_called FROM ct_rt_code_seq;
  DECLARE
    x_rt ct_round_trips%rowtype; x_order bigint; x_dl jsonb; x_rt_j jsonb; x_rev_intl0 numeric; x_share numeric;
    l_id bigint; n_id bigint; m_id bigint; t2 bigint; t3 bigint; d2 bigint; d3 bigint;
    rid bigint; rid2 bigint; k int; v_rev record; r2 ct_round_trips%rowtype;
  BEGIN
    -- (X) a live international OWNED RT with truck + driver + live payroll line; prefer one with an
    --     open order leg (a closed RT would be reopened by 046 and its payroll flagged by design).
    SELECT r.* INTO x_rt FROM ct_round_trips r
     WHERE r.scope = 'INTL' AND r.status <> 'cancelled' AND r.trip_type = 'OWNED'
       AND r.truck_id IS NOT NULL AND r.driver_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM dl_entries e WHERE e.rt_id = r.id AND e.deleted_at IS NULL)
       AND EXISTS (SELECT 1 FROM ct_rt_legs l WHERE l.rt_id = r.id AND l.order_id IS NOT NULL)
     ORDER BY (r.status = 'planned' AND EXISTS (SELECT 1 FROM ct_rt_legs l2 JOIN orders o2 ON o2.id = l2.order_id
                                                 WHERE l2.rt_id = r.id AND o2.deleted_at IS NULL
                                                   AND o2.status NOT IN ('Delivered','Cancelled'))) DESC, r.id DESC LIMIT 1;
    IF x_rt.id IS NULL THEN RAISE EXCEPTION '034 PROBE: no international RT with truck+driver+payroll to test against'; END IF;
    SELECT l.order_id INTO x_order FROM ct_rt_legs l JOIN orders o ON o.id = l.order_id
     WHERE l.rt_id = x_rt.id ORDER BY (o.status NOT IN ('Delivered','Cancelled')) DESC, l.id LIMIT 1;
    SELECT id INTO t2 FROM trucks  WHERE id <> x_rt.truck_id ORDER BY id LIMIT 1;
    SELECT id INTO t3 FROM trucks  WHERE id NOT IN (x_rt.truck_id, t2) ORDER BY id LIMIT 1;
    SELECT id INTO d2 FROM drivers WHERE id <> x_rt.driver_id ORDER BY id LIMIT 1;
    SELECT id INTO d3 FROM drivers WHERE id NOT IN (x_rt.driver_id, d2) ORDER BY id LIMIT 1;
    -- three live national loads without any leg
    SELECT id INTO l_id FROM national_loads nl WHERE deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM ct_rt_legs WHERE nat_load_id = nl.id) ORDER BY id LIMIT 1;
    SELECT id INTO n_id FROM national_loads nl WHERE deleted_at IS NULL AND id <> l_id
       AND NOT EXISTS (SELECT 1 FROM ct_rt_legs WHERE nat_load_id = nl.id) ORDER BY id LIMIT 1;
    SELECT id INTO m_id FROM national_loads nl WHERE deleted_at IS NULL AND id NOT IN (l_id, n_id)
       AND NOT EXISTS (SELECT 1 FROM ct_rt_legs WHERE nat_load_id = nl.id) ORDER BY id LIMIT 1;
    IF t3 IS NULL OR d3 IS NULL OR m_id IS NULL OR x_order IS NULL THEN
      RAISE EXCEPTION '034 PROBE: test material missing (trucks %/%, drivers %/%, loads %/%/%, order %)', t2, t3, d2, d3, l_id, n_id, m_id, x_order;
    END IF;

    -- (A) OLD load (executed 1/10) gets a vehicle → NO round trip (owner «μόνο από 5/10»)
    UPDATE national_loads
       SET source_type = 'National', source_order_id = NULL, source_national_order_id = NULL,
           matched_load = NULL, source_cons_load_id = NULL, is_partner_trip = false, partner_id = NULL,
           status = 'Assigned', loading_datetime = '2026-10-01 06:00+03', delivery_datetime = '2026-10-02 06:00+03',
           actual_delivery_date = NULL, truck_id = t2, driver_id = d2
     WHERE id = l_id;
    IF EXISTS (SELECT 1 FROM ct_rt_legs WHERE nat_load_id = l_id) THEN
      RAISE EXCEPTION '034 PROBE A: a load executed before 5/10 got a round trip';
    END IF;

    -- (B) VS load on the international RT's truck → attaches; revenue split, no double count
    PERFORM rt_recompute(x_rt.id);                       -- settle X's window first, so «before» = «after»
    SELECT r.* INTO x_rt FROM ct_round_trips r WHERE r.id = x_rt.id;
    -- What RT-1193 destroyed: the RT's vehicle/driver/window and its payroll line. (status/closed_at
    -- are left out on purpose: on a CLOSED X, 046 legitimately reopens for the open national leg and
    -- re-closes after it leaves — documented behaviour, not a vehicle write.)
    x_rt_j := jsonb_build_object('trip_type', x_rt.trip_type, 'truck', x_rt.truck_id, 'driver', x_rt.driver_id,
                                 'trailer', x_rt.trailer_id, 'partner', x_rt.partner_id,
                                 'date_start', x_rt.date_start, 'date_end', x_rt.date_end);
    SELECT jsonb_build_object('id', e.id, 'driver', e.driver_id, 'entry_date', e.entry_date, 'date_end', e.date_end,
                              'trip_value', e.trip_value, 'advance', e.advance, 'expenses', e.expenses, 'deleted_at', e.deleted_at)
      INTO x_dl FROM dl_entries e WHERE e.rt_id = x_rt.id AND e.deleted_at IS NULL LIMIT 1;
    SELECT revenue_intl INTO x_rev_intl0 FROM ct_v_rt_revenue WHERE rt_id = x_rt.id;
    SELECT CASE WHEN (CASE WHEN so.parent_order_id IS NOT NULL THEN sp.veroia_switch ELSE so.veroia_switch END)
                     AND NOT EXISTS (SELECT 1 FROM national_loads d WHERE d.source_order_id = x_order
                                       AND d.source_type = 'Direct' AND d.deleted_at IS NULL AND d.id < n_id)
                THEN CASE WHEN (CASE WHEN so.parent_order_id IS NOT NULL THEN sp.direction ELSE so.direction END) = 'Export'
                          THEN ct_setting('x_export') ELSE ct_setting('x_import') END
                ELSE 0 END
      INTO x_share FROM orders so LEFT JOIN orders sp ON sp.id = so.parent_order_id WHERE so.id = x_order;

    UPDATE national_loads
       SET source_type = 'Direct', source_order_id = x_order, source_national_order_id = NULL,
           matched_load = NULL, source_cons_load_id = NULL, is_partner_trip = false, partner_id = NULL,
           status = 'Assigned', loading_datetime = '2026-10-06 06:00+03', delivery_datetime = '2026-10-07 06:00+03',
           actual_delivery_date = NULL, trailer_id = NULL, truck_id = x_rt.truck_id, driver_id = x_rt.driver_id
     WHERE id = n_id;
    SELECT rt_id INTO rid FROM ct_rt_legs WHERE nat_load_id = n_id;
    IF rid IS DISTINCT FROM x_rt.id THEN
      RAISE EXCEPTION '034 PROBE B1: VS load on the same truck did not attach to %, leg rt=%', x_rt.code, rid;
    END IF;
    SELECT * INTO v_rev FROM ct_v_rt_revenue WHERE rt_id = x_rt.id;
    IF v_rev.revenue_intl <> x_rev_intl0 OR v_rev.revenue_natl <> x_share OR v_rev.revenue <> x_rev_intl0 + x_share THEN
      RAISE EXCEPTION '034 PROBE B2: revenue split wrong on % (intl % → %, natl % expected %, total %)',
        x_rt.code, x_rev_intl0, v_rev.revenue_intl, v_rev.revenue_natl, x_share, v_rev.revenue;
    END IF;

    -- B3: CHANGE truck on the shared RT → the national leg leaves FIRST; X untouched
    UPDATE national_loads SET truck_id = t2, driver_id = d2 WHERE id = n_id;
    SELECT rt_id INTO rid FROM ct_rt_legs WHERE nat_load_id = n_id;
    SELECT r.* INTO r2 FROM ct_round_trips r WHERE r.id = rid;
    IF rid IS NULL OR rid = x_rt.id OR r2.scope <> 'NATL' OR r2.truck_id IS DISTINCT FROM t2 OR r2.driver_id IS DISTINCT FROM d2 THEN
      RAISE EXCEPTION '034 PROBE B3: after a truck change the national leg should sit on its own NATL RT with truck %, found rt % (%/%/%)',
        t2, rid, r2.scope, r2.truck_id, r2.driver_id;
    END IF;
    IF (SELECT jsonb_build_object('trip_type', r.trip_type, 'truck', r.truck_id, 'driver', r.driver_id,
                                 'trailer', r.trailer_id, 'partner', r.partner_id,
                                 'date_start', r.date_start, 'date_end', r.date_end)
         FROM ct_round_trips r WHERE r.id = x_rt.id) IS DISTINCT FROM x_rt_j
    OR (SELECT jsonb_build_object('id', e.id, 'driver', e.driver_id, 'entry_date', e.entry_date, 'date_end', e.date_end,
                                 'trip_value', e.trip_value, 'advance', e.advance, 'expenses', e.expenses, 'deleted_at', e.deleted_at)
         FROM dl_entries e WHERE e.id = (x_dl->>'id')::bigint) IS DISTINCT FROM x_dl THEN
      RAISE EXCEPTION '034 PROBE B3: a national truck change touched the international RT % or its payroll line (RT-1193 pattern)', x_rt.code;
    END IF;

    -- B4: back onto X's truck (re-attach), then REMOVE the vehicle → leg leaves; X and payroll untouched
    UPDATE national_loads SET truck_id = x_rt.truck_id, driver_id = x_rt.driver_id WHERE id = n_id;
    -- the NATL RT of B3 had a single leg, so it followed the load in place (same RT, new truck)
    SELECT rt_id INTO rid2 FROM ct_rt_legs WHERE nat_load_id = n_id;
    IF rid2 IS DISTINCT FROM rid THEN
      RAISE EXCEPTION '034 PROBE B4: sole-leg NATL RT should follow its load in place (rt % → %)', rid, rid2;
    END IF;
    UPDATE national_loads SET truck_id = NULL, driver_id = NULL WHERE id = n_id;
    IF EXISTS (SELECT 1 FROM ct_rt_legs WHERE nat_load_id = n_id) THEN
      RAISE EXCEPTION '034 PROBE B4: a load without vehicle kept its leg';
    END IF;
    IF (SELECT status FROM ct_round_trips WHERE id = rid) <> 'cancelled'
    OR EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = rid AND deleted_at IS NULL) THEN
      RAISE EXCEPTION '034 PROBE B4: the emptied NATL RT % is not cancelled or kept a live payroll line', rid;
    END IF;
    -- B5: attach to X once more and REMOVE the vehicle while sitting on the SHARED RT
    UPDATE national_loads SET truck_id = x_rt.truck_id, driver_id = x_rt.driver_id WHERE id = n_id;
    IF (SELECT rt_id FROM ct_rt_legs WHERE nat_load_id = n_id) IS DISTINCT FROM x_rt.id THEN
      RAISE EXCEPTION '034 PROBE B5: re-attach to % failed', x_rt.code;
    END IF;
    UPDATE national_loads SET truck_id = NULL, driver_id = NULL WHERE id = n_id;
    IF EXISTS (SELECT 1 FROM ct_rt_legs WHERE nat_load_id = n_id)
    OR (SELECT jsonb_build_object('trip_type', r.trip_type, 'truck', r.truck_id, 'driver', r.driver_id,
                                 'trailer', r.trailer_id, 'partner', r.partner_id,
                                 'date_start', r.date_start, 'date_end', r.date_end)
         FROM ct_round_trips r WHERE r.id = x_rt.id) IS DISTINCT FROM x_rt_j
    OR (SELECT jsonb_build_object('id', e.id, 'driver', e.driver_id, 'entry_date', e.entry_date, 'date_end', e.date_end,
                                 'trip_value', e.trip_value, 'advance', e.advance, 'expenses', e.expenses, 'deleted_at', e.deleted_at)
         FROM dl_entries e WHERE e.id = (x_dl->>'id')::bigint) IS DISTINCT FROM x_dl
    OR (SELECT revenue_intl FROM ct_v_rt_revenue WHERE rt_id = x_rt.id) <> x_rev_intl0 THEN
      RAISE EXCEPTION '034 PROBE B5: removing the national vehicle on the shared RT % touched its truck/driver/window/payroll/revenue (RT-1193 pattern)', x_rt.code;
    END IF;

    -- (C) standalone national load → new NATL RT + payroll; in-place changes; close; removal
    UPDATE national_loads
       SET source_type = 'National', source_order_id = NULL, source_national_order_id = NULL,
           matched_load = NULL, source_cons_load_id = NULL, is_partner_trip = false, partner_id = NULL,
           status = 'Assigned', loading_datetime = '2026-10-06 06:00+03', delivery_datetime = '2026-10-07 06:00+03',
           actual_delivery_date = NULL, trailer_id = NULL, truck_id = t2, driver_id = d2
     WHERE id = m_id;
    SELECT rt_id INTO rid FROM ct_rt_legs WHERE nat_load_id = m_id;
    SELECT r.* INTO r2 FROM ct_round_trips r WHERE r.id = rid;
    IF rid IS NULL OR r2.scope <> 'NATL' OR r2.trip_type <> 'OWNED' OR r2.truck_id <> t2 OR r2.driver_id <> d2 OR r2.status <> 'planned' THEN
      RAISE EXCEPTION '034 PROBE C1: no proper NATL RT for a standalone national load (rt %)', rid;
    END IF;
    SELECT count(*) INTO k FROM dl_entries WHERE rt_id = rid AND deleted_at IS NULL AND driver_id = d2;
    IF k <> 1 THEN RAISE EXCEPTION '034 PROBE C1: payroll line for the NATL RT: % (expected 1)', k; END IF;
    UPDATE national_loads SET truck_id = t3 WHERE id = m_id;
    UPDATE national_loads SET driver_id = d3 WHERE id = m_id;
    SELECT r.* INTO r2 FROM ct_round_trips r WHERE r.id = rid;
    IF (SELECT rt_id FROM ct_rt_legs WHERE nat_load_id = m_id) IS DISTINCT FROM rid OR r2.truck_id <> t3 OR r2.driver_id <> d3
    OR (SELECT count(*) FROM dl_entries WHERE rt_id = rid AND deleted_at IS NULL AND driver_id = d3) <> 1 THEN
      RAISE EXCEPTION '034 PROBE C2: truck/driver change on a sole-leg NATL RT did not follow in place';
    END IF;
    UPDATE national_loads SET status = 'Delivered' WHERE id = m_id;
    IF (SELECT status FROM ct_round_trips WHERE id = rid) <> 'closed' THEN
      RAISE EXCEPTION '034 PROBE C3: NATL RT did not auto-close when its only load was Delivered';
    END IF;
    UPDATE national_loads SET truck_id = NULL WHERE id = m_id;
    IF EXISTS (SELECT 1 FROM ct_rt_legs WHERE nat_load_id = m_id)
    OR (SELECT status FROM ct_round_trips WHERE id = rid) <> 'cancelled'
    OR EXISTS (SELECT 1 FROM dl_entries WHERE rt_id = rid AND deleted_at IS NULL) THEN
      RAISE EXCEPTION '034 PROBE C4: removing the vehicle did not cancel the NATL RT / soft-delete its payroll line';
    END IF;

    SELECT last_value INTO seq_after_probe FROM ct_rt_code_seq;
    probe_done := true;
    RAISE EXCEPTION USING ERRCODE = 'T0340', MESSAGE = '034 probe rollback';
  EXCEPTION WHEN SQLSTATE 'T0340' THEN
    NULL;   -- every probe write is undone here; only plpgsql variables survive
  END;
  IF NOT probe_done THEN RAISE EXCEPTION '034 STOP: probe did not complete'; END IF;
  -- Sequences are not transactional: give back the RT codes the probe used, unless someone else
  -- took one meanwhile (then a gap is the lesser harm than a duplicate code).
  IF (SELECT last_value FROM ct_rt_code_seq) = seq_after_probe THEN
    PERFORM setval('ct_rt_code_seq', seq_val, seq_called);
  ELSE
    RAISE NOTICE '034: ct_rt_code_seq moved during the probe — RT codes % … % stay unused', seq_val + 1, seq_after_probe;
  END IF;

  -- ── 7. AFTER — the proof ─────────────────────────────────────────────────────────────────
  SELECT count(*) INTO n_rt1  FROM ct_round_trips;
  SELECT count(*) INTO n_leg1 FROM ct_rt_legs;
  SELECT count(*) INTO n_dl1  FROM dl_entries;
  SELECT count(*) INTO n_nl1  FROM national_loads;
  SELECT count(*) INTO n_natl1 FROM ct_round_trips WHERE scope = 'NATL';
  SELECT count(*) INTO n_trg_nl1  FROM pg_trigger WHERE tgrelid = 'public.national_loads'::regclass AND NOT tgisinternal;
  SELECT count(*) INTO n_trg_rt1  FROM pg_trigger WHERE tgrelid = 'public.ct_round_trips'::regclass AND NOT tgisinternal;
  SELECT count(*) INTO n_trg_leg1 FROM pg_trigger WHERE tgrelid = 'public.ct_rt_legs'::regclass AND NOT tgisinternal;
  SELECT count(*) INTO n_trg_ord1 FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal;

  IF n_rt1 <> n_rt0 OR n_leg1 <> n_leg0 OR n_dl1 <> n_dl0 OR n_nl1 <> n_nl0 OR n_natl1 <> n_natl0 THEN
    RAISE EXCEPTION '034 ABORT: counts changed — RT %→%, legs %→%, dl %→%, national loads %→%, NATL RT %→%',
      n_rt0, n_rt1, n_leg0, n_leg1, n_dl0, n_dl1, n_nl0, n_nl1, n_natl0, n_natl1;
  END IF;
  IF n_trg_nl1 <> n_trg_nl0 + 1 OR n_trg_rt1 <> n_trg_rt0 + 1 OR n_trg_leg1 <> n_trg_leg0 OR n_trg_ord1 <> n_trg_ord0
  OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'rt_sync_national_load' AND tgrelid = 'public.national_loads'::regclass)
  OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'rt_sync_to_national_loads' AND tgrelid = 'public.ct_round_trips'::regclass) THEN
    RAISE EXCEPTION '034 ABORT: unexpected trigger set (national_loads %→%, ct_round_trips %→%, ct_rt_legs %→%, orders %→%)',
      n_trg_nl0, n_trg_nl1, n_trg_rt0, n_trg_rt1, n_trg_leg0, n_trg_leg1, n_trg_ord0, n_trg_ord1;
  END IF;
  IF has_function_privilege('anon', 'public.rt_sync_national_load()', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.rt_sync_to_national_loads()', 'EXECUTE') THEN
    RAISE EXCEPTION '034 ABORT: new functions are not born closed';
  END IF;

  SELECT jsonb_object_agg(rt.id::text, jsonb_build_object(
           'code', rt.code, 'scope', rt.scope, 'status', rt.status, 'trip_type', rt.trip_type,
           'truck', rt.truck_id, 'driver', rt.driver_id, 'trailer', rt.trailer_id, 'partner', rt.partner_id,
           'date_start', rt.date_start, 'date_end', rt.date_end, 'closed_at', rt.closed_at, 'total_km', rt.total_km,
           'revenue', rv.revenue,
           'lines_net', c.lines_net, 'vat', c.vat, 'wear', c.wear, 'dl_trip_value', c.dl_trip_value,
           'dl_expenses', c.dl_expenses, 'pay_pending', c.driver_pay_pending, 'pay_missing', c.driver_pay_missing,
           'partner_planned', c.partner_planned, 'partner_invoiced', c.partner_invoiced,
           'pnl_cost_gross', p.cost_gross, 'pnl_profit_worst', p.profit_worst, 'pnl_profit_ex_vat', p.profit_ex_vat))
    INTO snap_rt_after
  FROM ct_round_trips rt
  JOIN ct_v_rt_revenue rv ON rv.rt_id = rt.id
  JOIN ct_v_rt_costs   c  ON c.rt_id  = rt.id
  LEFT JOIN ct_v_rt_pnl p ON p.id     = rt.id;

  SELECT jsonb_object_agg(e.id::text, to_jsonb(e)) INTO snap_dl_after FROM dl_entries e;

  IF snap_rt_after IS DISTINCT FROM snap_rt_before THEN
    SELECT string_agg(k || ': ' || coalesce((snap_rt_before->k)::text, '∅') || ' → ' || coalesce((snap_rt_after->k)::text, '∅'), ' | ')
      INTO diff
      FROM (SELECT k FROM jsonb_object_keys(coalesce(snap_rt_before, '{}') || coalesce(snap_rt_after, '{}')) k
             WHERE snap_rt_before->k IS DISTINCT FROM snap_rt_after->k LIMIT 5) d;
    RAISE EXCEPTION '034 ABORT: round trip figures changed (revenue/costs/PnL/vehicle/window/status): %', diff;
  END IF;
  IF snap_dl_after IS DISTINCT FROM snap_dl_before THEN
    SELECT string_agg(k, ',') INTO diff
      FROM (SELECT k FROM jsonb_object_keys(coalesce(snap_dl_before, '{}') || coalesce(snap_dl_after, '{}')) k
             WHERE snap_dl_before->k IS DISTINCT FROM snap_dl_after->k LIMIT 10) d;
    RAISE EXCEPTION '034 ABORT: payroll lines changed (dl_entries ids): %', diff;
  END IF;

  SELECT count(*) INTO would_qualify FROM national_loads nl
   WHERE nl.deleted_at IS NULL AND nl.status IS DISTINCT FROM 'Cancelled'
     AND CASE WHEN coalesce(nl.is_partner_trip, false) THEN nl.partner_id IS NOT NULL ELSE nl.truck_id IS NOT NULL END
     AND (coalesce(nl.loading_datetime, nl.delivery_datetime, nl.actual_delivery_date::timestamptz, nl.created_at)
          AT TIME ZONE 'Europe/Athens')::date >= date '2026-10-05';
  RAISE NOTICE '034 OK: % round trips and % payroll lines byte-identical; NATL RT %→% (0 created); probe A/B/C passed; national loads ≥5/10 with a vehicle right now: % (they get their RT on their next save)',
    n_rt1, n_dl1, n_natl0, n_natl1, would_qualify;
END
$mig$;


-- ═══════════════════════════════════════ VERIFY (SELECT only) ═══════════════════════════════
-- Run AFTER the block. Expected values 4/10 in brackets.
--
-- V1. objects in place
-- select tgname, tgrelid::regclass from pg_trigger
--  where tgname in ('rt_sync_national_load','rt_sync_to_national_loads') order by 1;          -- [2 rows]
-- select proname, proacl from pg_proc where proname in ('rt_sync_national_load','rt_sync_to_national_loads'); -- [no anon/authenticated/=X]
-- select column_name from information_schema.columns where table_name = 'ct_v_rt_pnl'
--    and column_name in ('revenue_intl','revenue_natl');                                       -- [2 rows]
--
-- V2. nothing created by the migration itself (owner «μόνο από 5/10»)
-- select count(*) from ct_round_trips where scope = 'NATL';                                    -- [0]
-- select count(*) from ct_rt_legs where nat_load_id is not null;                               -- [0]
--
-- V3. international totals — compare with the same query run BEFORE the block (must be equal)
-- select count(*), sum(revenue), sum(revenue_intl), sum(revenue_natl) from ct_v_rt_revenue;   -- revenue = revenue_intl, natl 0
-- select count(*), sum(lines_net), sum(vat), sum(wear), sum(partner_planned) from ct_v_rt_costs;
-- select count(*) filter (where deleted_at is null), sum(trip_value), sum(advance), sum(expenses) from dl_entries;
--
-- V4. VS: no double count — for every VS order whose order leg AND national leg are both on RTs,
--     order share + national share = order price  [0 rows]
-- with o as (select o.id, coalesce(o.price,0) price,
--                   case when o.direction='Export' then ct_setting('x_export') else ct_setting('x_import') end x
--              from orders o where o.veroia_switch and o.parent_order_id is null and o.deleted_at is null)
-- select o.id from o
--  join ct_rt_legs lo on lo.order_id = o.id
--  join national_loads nl on nl.source_order_id = o.id and nl.source_type='Direct' and nl.deleted_at is null
--  join ct_rt_legs ln on ln.nat_load_id = nl.id
--  where (o.price - o.x) + o.x <> o.price;   -- identity by construction; the real check is V5
--
-- V5. per round trip: revenue = revenue_intl + revenue_natl, and no national order counted twice  [0 / 0]
-- select count(*) from ct_v_rt_revenue where revenue <> revenue_intl + revenue_natl;
-- select nl.source_national_order_id, count(distinct l.rt_id) from ct_rt_legs l
--   join national_loads nl on nl.id = l.nat_load_id where nl.source_national_order_id is not null
--  group by 1 having count(*) > 1;
--
-- V6. Monday onwards — every national load ≥ 5/10 with a vehicle has a live leg, and every OWNED
--     NATL RT with a driver has a payroll line  [0 / 0]
-- select nl.id, nl.status, nl.truck_id, nl.driver_id from national_loads nl
--  where nl.deleted_at is null and nl.status is distinct from 'Cancelled'
--    and case when coalesce(nl.is_partner_trip,false) then nl.partner_id is not null else nl.truck_id is not null end
--    and (coalesce(nl.loading_datetime, nl.delivery_datetime, nl.actual_delivery_date::timestamptz, nl.created_at)
--         at time zone 'Europe/Athens')::date >= date '2026-10-05'
--    and not exists (select 1 from ct_rt_legs l join ct_round_trips r on r.id = l.rt_id
--                     where l.nat_load_id = nl.id and r.status <> 'cancelled');
--   (a load that had its vehicle BEFORE the block ran shows here until its next save — re-save it)
-- select * from dl_v_rt_gap;   -- [same rows as before the block; RT-1203 is planned without truck/driver today]
--
-- V7. old loads stay out (owner «μόνο από 5/10»): loads before 5/10 with a vehicle and no RT — expected,
--     informational [14 on 4/10: Aug 2, Sep 12]
-- select date_trunc('month', coalesce(loading_datetime, delivery_datetime))::date m, count(*)
--   from national_loads nl where deleted_at is null and truck_id is not null
--    and not exists (select 1 from ct_rt_legs where nat_load_id = nl.id) group by 1 order by 1;
--
-- V8. what the triggers did (after Monday)
-- select created_at, action, table_name, record_id, after_data->>'reason' reason from audit_log
--  where actor = 'trigger:rt_sync' and after_data->>'reason' like '%(034)%' order by id desc limit 50;


-- ═══════════════════════════════════════ ROLLBACK (only if needed) ══════════════════════════
-- Undoes EXACTLY the objects of the block. Round trips / legs / payroll lines that the trigger
-- created AFTER go-live are real history and are NOT deleted here (decide them separately; they
-- are listed by: select * from ct_round_trips where created_by = 'trigger:rt_create_natl';).
-- Bodies/views below = live text read 4/10/2026. Paste as ONE statement.
--
-- DO $rb$
-- BEGIN
--   SET LOCAL search_path = public;
--   DROP TRIGGER IF EXISTS rt_sync_national_load ON public.national_loads;
--   DROP FUNCTION IF EXISTS public.rt_sync_national_load();
--   DROP TRIGGER IF EXISTS rt_sync_to_national_loads ON public.ct_round_trips;
--   DROP FUNCTION IF EXISTS public.rt_sync_to_national_loads();
--
--   EXECUTE $ddl$
-- CREATE OR REPLACE FUNCTION public.rt_auto_close(p_rt bigint)
--  RETURNS void
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- declare
--   r        ct_round_trips%rowtype;
--   n_live   int;
--   n_open   int;
--   live_dl  dl_entries%rowtype;
-- begin
--   if p_rt is null then return; end if;
--   select * into r from ct_round_trips where id = p_rt;
--   if r.id is null or r.status = 'cancelled' then return; end if;
--
--   select count(*) filter (where o.deleted_at is null),
--          count(*) filter (where o.deleted_at is null
--                           and o.status is distinct from 'Delivered'
--                           and o.status is distinct from 'Cancelled')
--     into n_live, n_open
--   from ct_rt_legs l
--   join orders o on o.id = l.order_id
--   where l.rt_id = p_rt;
--
--   if n_live = 0 then return; end if;
--
--   if n_open > 0 and r.status in ('closed', 'complete') then
--     update ct_round_trips
--        set status = 'planned', closed_at = null, updated_at = now()
--      where id = p_rt;
--     perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
--       jsonb_build_object('status', r.status, 'closed_at', r.closed_at),
--       jsonb_build_object('status', 'planned', 'closed_at', null, 'open_legs', n_open,
--                          'reason', 'reopened: ' || n_open || ' leg(s) not delivered/cancelled (046)'));
--
--     select * into live_dl from dl_entries where rt_id = p_rt and deleted_at is null limit 1;
--     if live_dl.id is not null
--        and (live_dl.trip_value is not null or live_dl.advance is not null or live_dl.expenses is not null) then
--       update dl_entries
--          set needs_review = true,
--              review_note = concat_ws(' · ', review_note,
--                'ο γύρος ' || r.code || ' ξανάνοιξε ' || to_char(now(), 'DD/MM/YYYY') ||
--                ' μετά την καταχώρηση ποσών — νέο σκέλος, έλεγξε την αξία (046)'),
--              updated_at = now()
--        where id = live_dl.id;
--     end if;
--     return;
--   end if;
--
--   if n_open = 0 and r.status in ('planned', 'in_progress') then
--     if r.trip_type = 'OWNED' and r.truck_id is null then
--       if not exists (
--         select 1 from audit_log
--          where actor = 'trigger:rt_sync' and table_name = 'ct_round_trips' and record_id = p_rt::text
--            and after_data->>'blocked' = 'true'
--            and created_at > now() - interval '7 days') then
--         perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
--           jsonb_build_object('status', r.status),
--           jsonb_build_object('status', r.status, 'blocked', true,
--                              'reason', 'not auto-closed: OWNED round trip without a truck (owned_needs_truck) — assign a truck (046)'));
--       end if;
--       return;
--     end if;
--
--     update ct_round_trips
--        set status = 'closed', closed_at = now(), updated_at = now()
--      where id = p_rt;
--     perform rt_sync_audit('update', 'ct_round_trips', p_rt::text,
--       jsonb_build_object('status', r.status, 'closed_at', r.closed_at),
--       jsonb_build_object('status', 'closed', 'closed_at', now(), 'legs', n_live,
--                          'reason', 'auto-closed: all legs delivered/cancelled (046)'));
--   end if;
-- end $function$
-- $ddl$;
--
--   EXECUTE $ddl$
-- CREATE OR REPLACE FUNCTION public.rt_status_guard()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- declare n_open int;
-- begin
--   if new.status is not distinct from old.status then return new; end if;
--   if new.status not in ('closed', 'complete') then return new; end if;
--
--   select count(*) into n_open
--   from ct_rt_legs l
--   join orders o on o.id = l.order_id
--   where l.rt_id = new.id and o.deleted_at is null
--     and o.status is distinct from 'Delivered' and o.status is distinct from 'Cancelled';
--
--   if n_open > 0 then
--     raise exception 'Ο γύρος % δεν κλείνει: έχει % σκέλος/σκέλη που δεν είναι Delivered/Cancelled. Κλείνει μόνος του μόλις παραδοθούν όλα (046).',
--       new.code, n_open using errcode = 'P0001';
--   end if;
--   return new;
-- end $function$
-- $ddl$;
--
--   -- views: the appended columns cannot be removed by CREATE OR REPLACE → drop the two that got
--   -- new columns (pnl depends on revenue), recreate them as they were, restore their grants.
--   DROP VIEW public.ct_v_rt_pnl;
--   DROP VIEW public.ct_v_rt_revenue;
--   EXECUTE $ddl$
-- CREATE VIEW public.ct_v_rt_revenue AS
--  SELECT rt.id AS rt_id,
--     COALESCE(sum(
--         CASE
--             WHEN l.order_id IS NOT NULL THEN COALESCE(o.price,
--             CASE
--                 WHEN o.leg_no = 1 THEN p.price
--                 ELSE NULL::numeric
--             END, 0::numeric) -
--             CASE
--                 WHEN
--                 CASE
--                     WHEN o.parent_order_id IS NOT NULL THEN p.veroia_switch
--                     ELSE o.veroia_switch
--                 END THEN
--                 CASE
--                     WHEN
--                     CASE
--                         WHEN o.parent_order_id IS NOT NULL THEN p.direction
--                         ELSE o.direction
--                     END = 'Export'::text THEN ct_setting('x_export'::text)
--                     ELSE ct_setting('x_import'::text)
--                 END
--                 ELSE 0::numeric
--             END
--             WHEN nl.source_type = 'Direct'::text AND nl.source_order_id IS NOT NULL THEN
--             CASE
--                 WHEN nl.direction = 'ΑΝΟΔΟΣ'::text THEN ct_setting('x_export'::text)
--                 ELSE ct_setting('x_import'::text)
--             END
--             ELSE 0::numeric
--         END), 0::numeric) AS revenue
--    FROM ct_round_trips rt
--      LEFT JOIN ct_rt_legs l ON l.rt_id = rt.id
--      LEFT JOIN orders o ON o.id = l.order_id
--      LEFT JOIN orders p ON p.id = o.parent_order_id
--      LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
--   GROUP BY rt.id
-- $ddl$;
--   EXECUTE $ddl$
-- CREATE OR REPLACE VIEW public.ct_v_rt_costs AS
--  WITH lines AS (
--          SELECT ct_cost_lines.rt_id,
--             sum(ct_cost_lines.net) FILTER (WHERE ct_cost_lines.category <> 'partner_rate'::text) AS net_other,
--             sum(ct_cost_lines.vat) AS vat,
--             sum(ct_cost_lines.net) FILTER (WHERE ct_cost_lines.category = 'partner_rate'::text) AS partner_invoiced
--            FROM ct_cost_lines
--           WHERE ct_cost_lines.rt_id IS NOT NULL
--           GROUP BY ct_cost_lines.rt_id
--         ), carried AS (
--          SELECT l.rt_id,
--             o.id AS order_id
--            FROM ct_rt_legs l
--              JOIN orders o ON o.id = l.order_id
--         UNION
--          SELECT l.rt_id,
--             s.id
--            FROM ct_rt_legs l
--              JOIN orders o ON o.id = l.order_id AND o.parent_order_id IS NOT NULL
--              JOIN orders s ON s.parent_order_id = o.parent_order_id AND s.id <> o.id AND s.deleted_at IS NULL AND s.partner_id IS NOT NULL
--           WHERE NOT (EXISTS ( SELECT 1
--                    FROM ct_rt_legs l2
--                      JOIN ct_round_trips r2 ON r2.id = l2.rt_id
--                   WHERE l2.order_id = s.id AND r2.status <> 'cancelled'::text))
--         ), planned AS (
--          SELECT c.rt_id,
--             sum(pa.partner_rate) AS partner_planned
--            FROM carried c
--              JOIN LATERAL ( SELECT pa_1.partner_rate
--                    FROM partner_assignments pa_1
--                   WHERE pa_1.order_id = c.order_id AND pa_1.deleted_at IS NULL AND pa_1.status <> 'Cancelled'::text
--                   ORDER BY pa_1.id DESC
--                  LIMIT 1) pa ON true
--           GROUP BY c.rt_id
--         )
--  SELECT rt.id AS rt_id,
--     COALESCE(li.net_other, 0::numeric) + COALESCE(NULLIF(li.partner_invoiced, 0::numeric), pl.partner_planned, 0::numeric) + COALESCE(dl.trip_value, 0::numeric) + COALESCE(dl.expenses, 0::numeric) AS lines_net,
--     COALESCE(li.vat, 0::numeric) AS vat,
--         CASE
--             WHEN rt.trip_type = 'OWNED'::text AND rt.total_km IS NOT NULL THEN round(COALESCE(w.eur_per_km, ct_setting('wear_fallback_eur_km'::text)) * rt.total_km::numeric, 2)
--             ELSE 0::numeric
--         END AS wear,
--     dl.trip_value AS dl_trip_value,
--     dl.expenses AS dl_expenses,
--     dl.id IS NOT NULL AND dl.trip_value IS NULL AS driver_pay_pending,
--     rt.trip_type = 'OWNED'::text AND rt.driver_id IS NOT NULL AND dl.id IS NULL AS driver_pay_missing,
--     COALESCE(pl.partner_planned, 0::numeric) AS partner_planned,
--     COALESCE(li.partner_invoiced, 0::numeric) AS partner_invoiced
--    FROM ct_round_trips rt
--      LEFT JOIN lines li ON li.rt_id = rt.id
--      LEFT JOIN planned pl ON pl.rt_id = rt.id
--      LEFT JOIN dl_entries dl ON dl.rt_id = rt.id AND dl.deleted_at IS NULL
--      LEFT JOIN ct_v_wear_rate w ON w.truck_id = rt.truck_id
-- $ddl$;
--   EXECUTE $ddl$
-- CREATE VIEW public.ct_v_rt_pnl AS
--  SELECT rt.id, rt.code, rt.scope, rt.trip_type, rt.truck_id, rt.driver_id, rt.partner_id,
--     rt.date_start, rt.date_end, rt.status, rt.total_km, r.revenue,
--     c.lines_net + c.wear AS cost_net,
--     c.vat AS cost_vat,
--     c.lines_net + c.wear + c.vat AS cost_gross,
--     r.revenue - (c.lines_net + c.wear + c.vat) AS profit_worst,
--     r.revenue - (c.lines_net + c.wear) AS profit_ex_vat,
--         CASE
--             WHEN r.revenue > 0::numeric THEN round((r.revenue - (c.lines_net + c.wear + c.vat)) / r.revenue * 100::numeric, 1)
--             ELSE NULL::numeric
--         END AS margin_worst_pct,
--         CASE
--             WHEN r.revenue > 0::numeric THEN round((r.revenue - (c.lines_net + c.wear)) / r.revenue * 100::numeric, 1)
--             ELSE NULL::numeric
--         END AS margin_ex_vat_pct,
--     c.dl_trip_value, c.dl_expenses, c.driver_pay_pending, c.driver_pay_missing,
--     c.partner_planned, c.partner_invoiced
--    FROM ct_round_trips rt
--      JOIN ct_v_rt_revenue r ON r.rt_id = rt.id
--      JOIN ct_v_rt_costs c ON c.rt_id = rt.id
--   WHERE rt.status <> 'cancelled'::text
-- $ddl$;
--   -- grants as read 4/10: service_role=arwDxtm (no DELETE), postgres owner
--   GRANT SELECT, INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.ct_v_rt_revenue, public.ct_v_rt_pnl TO service_role;
--
--   IF md5(pg_get_functiondef('public.rt_auto_close(bigint)'::regprocedure)) <> 'a23ffea6e4fbc3dbe4ac16cf237568d4'
--   OR md5(pg_get_functiondef('public.rt_status_guard()'::regprocedure))     <> '51b71ebc3c55f060a94e3d4de175fb35'
--   OR md5(pg_get_viewdef('public.ct_v_rt_costs'::regclass)) <> 'b0c176a3e0acb544a078c795ea8eb5ba' THEN
--     RAISE EXCEPTION '034 ROLLBACK: restored text differs from the 4/10 originals — nothing changed, compare by hand';
--   END IF;
--   -- revenue/pnl md5 may differ only in whitespace normalisation; prove by numbers instead:
--   IF EXISTS (SELECT 1 FROM ct_v_rt_pnl p JOIN ct_round_trips r ON r.id = p.id WHERE p.scope IS DISTINCT FROM r.scope) THEN
--     RAISE EXCEPTION '034 ROLLBACK: ct_v_rt_pnl broken';
--   END IF;
-- END
-- $rb$;
