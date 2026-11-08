-- 107 - PALLETS: "LEIPEI PARADOSI" (ONE DEFINITION) + "XORIS ANTALLAGI" (ONE ACT WITH ITS TRACE). BORN CLOSED.
--
-- Plan: docs/data-audit/2026-10/2026-10-27-alexia-pallets.md, step 2 = U4 (owner 27/10 answer 4b, 28/10 E5.1/E5.2).
-- Number 107: 106 ran 8/11 (grp match), 105 ran 8/11.
-- The owner runs it in the Supabase SQL editor AFTER 15:00, with an explicit yes, one step at a time:
--   1. 107_pl_missing_delivery_dryrun.sql   this block + one real "no exchange" act on a live candidate, checked,
--                                            then a deliberate error: NOTHING kept (prints the runtime)
--   2. 107_pl_missing_delivery.sql          (this file)
--   3. 107_pl_missing_delivery_verify.sql   read-only, one row
-- ASCII only. ONE DO block = ONE statement: an error anywhere undoes all of it.
--
-- WHAT IT ADDS (no table, no trigger, no row of an existing table is written)
--   * view pl_v_missing_delivery: every unloading stop with pallets of a DELIVERED international order WITH pallet
--     exchange that has no live DELIVERY movement. The same exceptions as the browser feeder (core/pallet-feed.js
--     plOrderGate): a leg of a split order (parent_order_id, ORDER_SPLIT is on since 6/9) and an own stock lot
--     (stock_lots.order_id) are not deliveries to a client. ONE definition read by the pallets page (GET
--     /pallets/missing) and, later, by the auditor (U5, F-32): never a second copy of the rule (principle 3).
--     Columns for the list: the stop, the order, the client and point names, the day, how many unloading stops the
--     order has and whether it has a national v5 leg (the two reasons the "no exchange" act refuses).
--   * act pl_no_exchange(p, actor, role), SECURITY DEFINER, EXECUTE to service_role only. p = {order_id,
--     order_stop_id, reason}. In ONE transaction: the order's pending movements are deleted (they never counted),
--     orders.pallet_exchange becomes false (this also opens the invoicing gate for the order: the gate applies only
--     to orders with exchange, owner 28/10 "me ixnos poios kai pote"), and the audit_log rows are written through
--     plan_h_audit (072): one 'delete' per pending movement, one 'update' on the order with the reason. A failed
--     audit fails the act: no switch without a trace (the Worker's audit() never fails a request, so it cannot
--     carry this rule). Confirmed movements stay; reversing a confirmed loading is the existing /reverse.
--   * helper pln_h_raise: refusals as SQLSTATE 23514, HINT 'pln:<code>' (the Worker's Greek texts in PLN_RULE_TEXT):
--     role, reason, bad_ids, gone, not_delivered, already, split_leg, lot, stop, done, multi, nat_leg.
-- BORN CLOSED: the view SELECT only to service_role and tms_check_runner; the act EXECUTE only to service_role.
-- RUNTIME: no table rewrite, no lock but the one order row the act touches; lock_timeout 5s, statement_timeout 60s.
-- REVERSE: 107_pl_missing_delivery_rollback.sql (drops the view and the two functions; writes made stay).
-- EXPECTED: NOTICE "107 OK: ..." ; then verify: result = '107 in place'.

DO $do$
DECLARE
  v_missing int; v_t0 timestamptz := clock_timestamp();
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  PERFORM set_config('statement_timeout', '60s', true);
  PERFORM set_config('search_path', 'public', true);

  -- ===== PART 0: GUARDS (nothing written before them) =====
  IF to_regclass('public.pl_v_missing_delivery') IS NOT NULL OR to_regprocedure('public.pl_no_exchange(jsonb,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION '107: pl_v_missing_delivery / pl_no_exchange already exist - 107 has run, nothing to do';
  END IF;
  IF to_regprocedure('public.plan_h_audit(text,text,text,text,text,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION '107: plan_h_audit (072) is missing - stop';
  END IF;
  IF to_regclass('public.pl_movements') IS NULL OR to_regclass('public.audit_log') IS NULL OR to_regclass('public.stock_lots') IS NULL
     OR to_regclass('public.shipments') IS NULL THEN
    RAISE EXCEPTION '107: pl_movements / audit_log / stock_lots / shipments missing - stop';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'tms_check_runner')) <> 4 THEN
    RAISE EXCEPTION '107: an API or auditor role is missing - stop';
  END IF;

  -- ===== PART 1: THE ONE DEFINITION =====
  CREATE VIEW public.pl_v_missing_delivery WITH (security_invoker = true) AS
  SELECT s.id AS order_stop_id, o.id AS order_id, o.direction,
         o.client_id, c.company_name AS client_name,
         s.location_id, l.name AS location_name, l.city AS location_city, l.country AS location_country,
         round(s.pallets)::int AS pallets, s.datetime AS stop_date, o.delivery_datetime, o.actual_delivery_date,
         coalesce(o.actual_delivery_date, s.datetime, o.delivery_datetime) AS delivered_on,
         (SELECT count(*) FROM public.order_stops u
           WHERE u.order_id = o.id AND u.stop_type = 'Unloading' AND u.deleted_at IS NULL AND coalesce(u.pallets, 0) > 0)::int AS unloading_stops,
         EXISTS (SELECT 1 FROM public.shipments sh WHERE sh.order_id = o.id AND sh.deleted_at IS NULL) AS has_nat_leg
    FROM public.orders o
    JOIN public.order_stops s ON s.order_id = o.id AND s.deleted_at IS NULL AND s.stop_type = 'Unloading' AND coalesce(s.pallets, 0) > 0
    LEFT JOIN public.clients c ON c.id = o.client_id
    LEFT JOIN public.locations l ON l.id = s.location_id
   WHERE o.deleted_at IS NULL AND o.status = 'Delivered' AND o.pallet_exchange IS TRUE AND o.parent_order_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.stock_lots sl WHERE sl.order_id = o.id AND sl.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.pl_movements m
                      WHERE m.order_stop_id = s.id AND m.event_type = 'DELIVERY' AND m.status <> 'reversed');

  -- ===== PART 2: THE REFUSAL HELPER =====
  CREATE FUNCTION public.pln_h_raise(p_code text, p_detail text) RETURNS void
    LANGUAGE plpgsql SET search_path = public AS $f$
  begin
    -- Same shape as plan_h_raise / plw_h_raise, its own prefix: the Worker maps 'pln:<code>' to a Greek 409 / 422.
    raise exception 'pln rule broken: %:%', p_code, coalesce(p_detail, '')
      using errcode = '23514', hint = 'pln:' || p_code;
  end $f$;

  -- ===== PART 3: THE ACT =====
  CREATE FUNCTION public.pl_no_exchange(p jsonb, p_actor text, p_role text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  DECLARE
    v_oid bigint; v_sid bigint; v_reason text; v_o orders%ROWTYPE; v_n int; v_m pl_movements%ROWTYPE;
    v_del jsonb := '[]'::jsonb; v_kept jsonb;
  BEGIN
    -- Principle 4: the role rule lives here too, not only in the Worker's PL_PERMS (owner 28/10 E5.2).
    IF p_role IS NULL OR p_role NOT IN ('owner', 'accountant') THEN PERFORM pln_h_raise('role', p_role); END IF;
    IF p_actor IS NULL OR length(p_actor) = 0 THEN PERFORM pln_h_raise('role', 'no actor'); END IF;
    v_reason := btrim(coalesce(p ->> 'reason', ''));
    IF length(v_reason) < 3 THEN PERFORM pln_h_raise('reason', NULL); END IF;
    BEGIN
      v_oid := (p ->> 'order_id')::bigint; v_sid := (p ->> 'order_stop_id')::bigint;
    EXCEPTION WHEN others THEN v_oid := NULL;
    END;
    IF v_oid IS NULL OR v_sid IS NULL THEN PERFORM pln_h_raise('bad_ids', NULL); END IF;

    -- The order row is locked: a dispatcher saving it now waits, never interleaves with this switch.
    SELECT * INTO v_o FROM orders WHERE id = v_oid AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN PERFORM pln_h_raise('gone', v_oid::text); END IF;
    IF v_o.status IS DISTINCT FROM 'Delivered' THEN PERFORM pln_h_raise('not_delivered', v_o.status); END IF;
    IF v_o.pallet_exchange IS NOT TRUE THEN PERFORM pln_h_raise('already', v_oid::text); END IF;
    IF v_o.parent_order_id IS NOT NULL THEN PERFORM pln_h_raise('split_leg', v_o.parent_order_id::text); END IF;
    IF EXISTS (SELECT 1 FROM stock_lots WHERE order_id = v_oid AND deleted_at IS NULL) THEN PERFORM pln_h_raise('lot', v_oid::text); END IF;
    IF NOT EXISTS (SELECT 1 FROM order_stops WHERE id = v_sid AND order_id = v_oid AND stop_type = 'Unloading' AND deleted_at IS NULL) THEN
      PERFORM pln_h_raise('stop', v_sid::text);
    END IF;
    -- The stop must still be missing: from a stale list the switch would contradict a delivery written meanwhile.
    IF EXISTS (SELECT 1 FROM pl_movements WHERE order_stop_id = v_sid AND event_type = 'DELIVERY' AND status <> 'reversed') THEN
      PERFORM pln_h_raise('done', v_sid::text);
    END IF;
    -- One delivery stop only (owner 28/10): with two or more, which of them had no exchange is the dispatcher's
    -- answer in the order, not the accountant's switch of the whole order.
    SELECT count(*) INTO v_n FROM order_stops
     WHERE order_id = v_oid AND stop_type = 'Unloading' AND deleted_at IS NULL AND coalesce(pallets, 0) > 0;
    IF v_n <> 1 THEN PERFORM pln_h_raise('multi', v_n::text); END IF;
    -- The national v5 legs read orders.pallet_exchange (071 v_shipment): refused until the owner decides.
    IF EXISTS (SELECT 1 FROM shipments WHERE order_id = v_oid AND deleted_at IS NULL) THEN PERFORM pln_h_raise('nat_leg', v_oid::text); END IF;

    -- The pending movements go (they never counted in a balance), each with its own trace.
    FOR v_m IN SELECT * FROM pl_movements WHERE order_id = v_oid AND status = 'pending' ORDER BY id FOR UPDATE LOOP
      DELETE FROM pl_movements WHERE id = v_m.id;
      PERFORM plan_h_audit(p_actor, p_role, 'delete', 'pl_movements', v_m.id::text, to_jsonb(v_m),
        jsonb_build_object('source', 'pallets/no-exchange', 'order_id', v_oid, 'reason', v_reason));
      v_del := v_del || to_jsonb(v_m.id);
    END LOOP;

    UPDATE orders SET pallet_exchange = false WHERE id = v_oid;
    -- record_id = the facade's id of the order (legacy_id), as the facade's own audit rows of orders: the switch
    -- sits in the same chain and the same search of the Audit Trail as every other change of that order.
    PERFORM plan_h_audit(p_actor, p_role, 'update', 'orders', coalesce(v_o.legacy_id, v_oid::text),
      jsonb_build_object('pallet_exchange', true),
      jsonb_build_object('pallet_exchange', false, 'reason', v_reason, 'order_stop_id', v_sid,
                         'source', 'pallets/no-exchange', 'invoice_gate', 'open', 'deleted_pending', v_del));

    SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_kept FROM pl_movements WHERE order_id = v_oid AND status = 'confirmed';
    RETURN jsonb_build_object('order_id', v_oid, 'order_stop_id', v_sid, 'deleted', v_del, 'confirmed_kept', v_kept);
  END $f$;

  -- ===== PART 4: BORN CLOSED =====
  REVOKE ALL ON public.pl_v_missing_delivery FROM PUBLIC, anon, authenticated;
  GRANT SELECT ON public.pl_v_missing_delivery TO service_role, tms_check_runner;
  REVOKE ALL ON FUNCTION public.pl_no_exchange(jsonb, text, text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.pl_no_exchange(jsonb, text, text) TO service_role;
  REVOKE ALL ON FUNCTION public.pln_h_raise(text, text) FROM PUBLIC, anon, authenticated;

  SELECT count(*) INTO v_missing FROM public.pl_v_missing_delivery;
  RAISE NOTICE '107 OK: pl_v_missing_delivery = % stops, pl_no_exchange in place, % ms', v_missing,
    round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);
END
$do$;
