-- 073 ROLLBACK - puts back exactly what 073 changed: the 5 functions of 072 + 072b (their text before 073, byte for
-- byte: the md5s of 073's PART 0), the 6 views (their live text, measured on production 23/10 and 26/10: the same
-- rows, options and rights), and removes ct_v_v5_revenue, ct_v_rt_partner_cost, ct_cost_lines.partner_id (Q6-1),
-- plan_h_pallet_sync and pl_mov_stop_once. Only with an explicit yes, after 15:00.
-- ORDER (K-18 + 072b): 073b's rollback first (its checks read ct_v_v5_revenue), then THIS, then 072b's (it refuses
--   while 073 is applied: it guards its hooked texts, which 073 changes), then 072's (it drops every plan_*).
-- It REFUSES as soon as one v5 row exists (spec 2.2: after the first real v5 row there is no going back, only fixes
-- forward; with the /plan/* writes closed until day L there is none before L), while 073b's checks exist, and while a
-- cost line names its partner (ct_cost_lines.partner_id: dropping it would lose whose invoice it is, Q6-1).
-- plan_h_drop_consequences and plan_rt_update hold 072b's hooks: their "before 073" md5 is derived on the
-- production-shaped PGlite copy from 072 + the 072b draft and is re-derived from production after 072b runs.
-- ASCII only (the arrows of the route are U&'' escapes). ONE DO block = ONE statement: an error anywhere undoes all of it.
-- EXPECTED: NOTICE "073 ROLLBACK OK ..." and ONE row "073 ROLLED BACK | 7bd4c2b3... (ct_v_rt_revenue) | aa9645fa...".

DO $do$
DECLARE
  snap_sql CONSTANT text := $q$
    SELECT concat_ws(' ',
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.ct_v_rt_revenue v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.ct_v_rt_costs v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg((to_jsonb(v) - 'partner_rate_missing')::text, '|' ORDER BY v.id), '')) FROM public.ct_v_rt_pnl v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.dl_v_rt_route v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.rt_id), '')) FROM public.ct_v_rt_pallet_gate v),
      (SELECT count(*) || ':' || md5(coalesce(string_agg(to_jsonb(v)::text, '|' ORDER BY v.piece_kind, v.piece_id), '')) FROM public.stock_v_pieces v)) $q$;
  v_g record; v_src text; v_new text; v_def text; v_k bigint; v_snap0 text; v_snap1 text; v_acl0 text; v_acl1 text;
  v_grants text[]; v_trg0 int; v_trg1 int; v_role text;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF to_regprocedure('public.plan_h_pallet_sync(bigint[],text,text)') IS NULL THEN
    RAISE EXCEPTION '073 rollback: 073 is not applied - nothing to undo';
  END IF;
  SELECT (SELECT count(*) FROM public.shipments) + (SELECT count(*) FROM public.shipment_pieces)
       + (SELECT count(*) FROM public.rt_stops) + (SELECT count(*) FROM public.piece_legs)
       + (SELECT count(*) FROM public.plan_notices) + (SELECT count(*) FROM public.ct_round_trips WHERE model = 2)
       + (SELECT count(*) FROM public.pl_movements WHERE piece_leg_id IS NOT NULL)
    INTO v_k;
  IF v_k <> 0 THEN
    RAISE EXCEPTION '073 rollback: % v5 row(s) exist - after the first real v5 row there is no rollback, only fixes forward (spec 2.2)', v_k;
  END IF;
  -- 073b's checks (B-78..B-90, B-94) read ct_v_v5_revenue, ct_v_rt_partner_cost and the v5 rows: without the views
  -- they would fail at every run
  IF EXISTS (SELECT 1 FROM monitoring.checks WHERE id IN ('B-78', 'B-79', 'B-80', 'B-81', 'B-82', 'B-83', 'B-84', 'B-85',
                                                          'B-86', 'B-87', 'B-88', 'B-89', 'B-90', 'B-94')) THEN
    RAISE EXCEPTION '073 rollback: 073b''s checks (B-78..B-90, B-94) exist - run 073b''s rollback first';
  END IF;
  SELECT count(*) INTO v_k FROM public.ct_cost_lines WHERE partner_id IS NOT NULL;
  IF v_k <> 0 THEN
    RAISE EXCEPTION '073 rollback: % cost line(s) name their partner (ct_cost_lines.partner_id, Q6-1) - the column would take it with it; stop, show them to the owner', v_k;
  END IF;
  SELECT count(*) INTO v_trg0 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  EXECUTE snap_sql INTO v_snap0;
  -- the rights of ct_v_rt_pnl, the one view that must be dropped (CREATE OR REPLACE cannot remove its new last column)
  SELECT coalesce(array_agg(format('GRANT %s ON public.ct_v_rt_pnl TO %s%s', a.privilege_type,
                                   CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
                                   CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
                            ORDER BY a.grantee, a.privilege_type), '{}'),
         (SELECT relacl::text FROM pg_class WHERE oid = 'public.ct_v_rt_pnl'::regclass)
    INTO v_grants, v_acl0
    FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE c.oid = 'public.ct_v_rt_pnl'::regclass AND a.grantee <> c.relowner;

  -- 1. 072's five functions: the hook out, from the LIVE text (073's PART 2 md5), checked against 073's PART 0 md5
  FOR v_g IN SELECT * FROM (VALUES
      ('public.plan_h_leg_add(bigint,bigint,bigint,bigint,text,text,integer)',
       E'  -- 073 (E11): the pallet feeder of this leg (pl_movements.piece_leg_id), in the same transaction.\n'
       || E'  perform plan_h_pallet_sync(array[l.id], p_actor, p_role);\n',
       E'  -- F3 hook: the pallet feeder of this leg (pl_movements.piece_leg_id, 073) is written here.\n',
       '0d95758b35f6095d42b551c287e3008b', 'aa9645fa495976bbca7c7de0635f4c22'),
      ('public.plan_h_leg_drop(bigint,text,text,text)',
       E'  perform plan_h_audit(p_actor, p_role, ''delete'', ''piece_legs'', p_leg::text, to_jsonb(a), to_jsonb(b));\n'
       || E'  -- 073 (E11): what this leg wrote in the pallet ledger is withdrawn with it (never deleted)\n'
       || E'  perform plan_h_pallet_sync(array[p_leg], p_actor, p_role);\n',
       E'  perform plan_h_audit(p_actor, p_role, ''delete'', ''piece_legs'', p_leg::text, to_jsonb(a), to_jsonb(b));\n',
       'cb48e1aeba2d8e78191b9fc47eae6d67', '4533385f7284c9ba5af52cf585a03250'),
      ('public.plan_h_drop_consequences(bigint[],bigint,bigint[])',
       E'  -- 073 (E11, D-8): a confirmed pallet row of a leg that goes is withdrawn after the token - listed first\n'
       || E'  v := v || coalesce((select jsonb_agg(jsonb_build_object(''kind'', ''pallets_confirmed'', ''leg_id'', m.piece_leg_id,\n'
       || E'                                                         ''pl_movement_id'', m.id, ''event_type'', m.event_type,\n'
       || E'                                                         ''taken'', m.taken, ''given'', m.given))\n'
       || E'                        from pl_movements m join piece_legs l on l.id = m.piece_leg_id\n'
       || E'                       where l.id = any (p_legs) and l.deleted_at is null and m.status = ''confirmed''), ''[]''::jsonb);\n'
       || E'  for r in select distinct l.rt_id from piece_legs l\n',
       E'  for r in select distinct l.rt_id from piece_legs l\n',
       'e370e52c9dd96d7e4e152b3ce348736e', '80b789fcdfc3fb6dad2b1d2f8b83b487'),
      ('public.plan_order_update(jsonb,text,text)',
       E'  -- 073 (E11): the pallet rows of this order''s legs follow the correction (pallets, pallet exchange)\n'
       || E'  perform plan_h_pallet_sync(array(select l.id from piece_legs l join shipment_pieces sp on sp.id = l.piece_id\n'
       || E'                                     join shipments sh on sh.id = sp.shipment_id\n'
       || E'                                    where sh.nat_order_id = n.id and l.deleted_at is null), p_actor, p_role);\n'
       || E'  perform plan_h_finish();\n  return plan_h_ok(''plan_order_update''',
       E'  perform plan_h_finish();\n  return plan_h_ok(''plan_order_update''',
       '114a6555848062a18b7f7fe8e57d70d6', '3ce41ac45650910c1024cb0a8846176f'),
      ('public.plan_rt_update(jsonb,text,text)',
       E'    -- 073 (E11, flows gap 11): the pending pallet rows of the cycle follow its stop days\n'
       || E'    perform plan_h_pallet_sync(array(select l.id from piece_legs l where l.rt_id = v_rt and l.deleted_at is null),\n'
       || E'                               p_actor, p_role);\n'
       || E'    -- 6. the international day follows the cycle that carries the first piece (decision 16)',
       E'    -- 6. the international day follows the cycle that carries the first piece (decision 16)',
       'be70612fb940356278c7c66705c8ee33', 'e427e7a24ef6e88d83555c98d4bc7622')
    ) v(sig, a, b, m073, m072) LOOP
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = to_regprocedure(v_g.sig);
    IF v_src IS NULL OR md5(v_src) <> v_g.m073 THEN
      RAISE EXCEPTION '073 rollback: % is not the text 073 wrote (md5 %) - stop', v_g.sig, md5(v_src);
    END IF;
    v_new := replace(v_src, v_g.a, v_g.b);
    IF md5(v_new) <> v_g.m072 THEN
      RAISE EXCEPTION '073 rollback: the 072 text of % does not come back (md5 %) - stop', v_g.sig, md5(v_new);
    END IF;
    v_def := pg_get_functiondef(to_regprocedure(v_g.sig));
    IF (length(v_def) - length(replace(v_def, v_src, ''))) <> length(v_src) THEN
      RAISE EXCEPTION '073 rollback: the body of % is not in its definition exactly once - stop', v_g.sig;
    END IF;
    EXECUTE replace(v_def, v_src, v_new);
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure(v_g.sig)) <> v_g.m072 THEN
      RAISE EXCEPTION '073 rollback proof: % does not hold its text before 073', v_g.sig;
    END IF;
  END LOOP;

  -- 2. the views, back to their live text before 073 (the revenue first: it stops reading ct_v_v5_revenue)
  CREATE OR REPLACE VIEW public.ct_v_rt_revenue AS
 WITH natord_home AS (
         SELECT nord.id AS national_order_id,
            nord.price,
            COALESCE(( SELECT min(h1.id) AS min
                   FROM national_loads h1
                  WHERE h1.source_national_order_id = nord.id AND h1.deleted_at IS NULL), ( SELECT min(h2.id) AS min
                   FROM national_loads h2
                  WHERE h2.deleted_at IS NULL AND h2.source_cons_load_id = (( SELECT gl.cons_load_id
                           FROM groupage_lines gl
                          WHERE gl.national_order_id = nord.id AND gl.deleted_at IS NULL AND gl.cons_load_id IS NOT NULL
                          ORDER BY gl.id
                         LIMIT 1)))) AS home_nat_load_id
           FROM national_orders nord
          WHERE nord.deleted_at IS NULL AND nord.price IS NOT NULL AND nord.source_order_id IS NULL
        ), legs AS (
         SELECT rt.id AS rt_id,
                CASE
                    WHEN l.order_id IS NOT NULL THEN COALESCE(sa.rt_amount, o.price,
                    CASE
                        WHEN o.leg_no = 1 THEN p.price
                        ELSE NULL::numeric
                    END, 0::numeric) -
                    CASE
                        WHEN
                        CASE
                            WHEN o.parent_order_id IS NOT NULL THEN p.veroia_switch
                            ELSE o.veroia_switch
                        END THEN stock_vs_charge(
                        CASE
                            WHEN
                            CASE
                                WHEN o.parent_order_id IS NOT NULL THEN p.direction
                                ELSE o.direction
                            END = 'Export'::text THEN ct_setting('x_export'::text)
                            ELSE ct_setting('x_import'::text)
                        END, vp.pallets)
                        ELSE 0::numeric
                    END
                    ELSE 0::numeric
                END AS rev_intl,
                CASE
                    WHEN l.nat_load_id IS NOT NULL THEN
                    CASE
                        WHEN nl.source_type = 'Direct'::text AND nl.source_order_id IS NOT NULL AND nl.id = (( SELECT min(d.id) AS min
                           FROM national_loads d
                          WHERE d.source_order_id = nl.source_order_id AND d.source_type = 'Direct'::text AND d.deleted_at IS NULL)) AND
                        CASE
                            WHEN so.parent_order_id IS NOT NULL THEN sp.veroia_switch
                            ELSE so.veroia_switch
                        END THEN stock_vs_charge(
                        CASE
                            WHEN
                            CASE
                                WHEN so.parent_order_id IS NOT NULL THEN sp.direction
                                ELSE so.direction
                            END = 'Export'::text THEN ct_setting('x_export'::text)
                            ELSE ct_setting('x_import'::text)
                        END, svp.pallets)
                        ELSE 0::numeric
                    END + COALESCE(( SELECT sum(h.price) AS sum
                       FROM natord_home h
                      WHERE h.home_nat_load_id = nl.id), 0::numeric)
                    ELSE 0::numeric
                END AS rev_natl
           FROM ct_round_trips rt
             LEFT JOIN ct_rt_legs l ON l.rt_id = rt.id
             LEFT JOIN orders o ON o.id = l.order_id
             LEFT JOIN orders p ON p.id = o.parent_order_id
             LEFT JOIN stock_v_rt_amounts sa ON sa.order_id = o.id
             LEFT JOIN stock_v_pieces vp ON vp.piece_kind = 'intl'::text AND vp.piece_id = o.id
             LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
             LEFT JOIN orders so ON so.id = nl.source_order_id
             LEFT JOIN orders sp ON sp.id = so.parent_order_id
             LEFT JOIN stock_v_pieces svp ON svp.piece_kind = 'intl'::text AND svp.piece_id = so.id
        )
 SELECT rt_id,
    COALESCE(sum(rev_intl + rev_natl), 0::numeric) AS revenue,
    COALESCE(sum(rev_intl), 0::numeric) AS revenue_intl,
    COALESCE(sum(rev_natl), 0::numeric) AS revenue_natl
   FROM legs
  GROUP BY rt_id;
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
     LEFT JOIN ct_v_wear_rate w ON w.truck_id = rt.truck_id;
  DROP VIEW public.ct_v_rt_pnl;
  CREATE VIEW public.ct_v_rt_pnl AS
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
  WHERE rt.status <> 'cancelled'::text;
  -- A new view gets the default privileges (production 26/10: service_role=arwxtm/postgres, not the old view's
  -- arwDxtm), so first every right the CREATE gave, then exactly the saved ones; the acl proof below compares.
  REVOKE ALL ON public.ct_v_rt_pnl FROM PUBLIC;
  FOR v_role IN SELECT DISTINCT quote_ident(pg_get_userbyid(a.grantee)) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
                 WHERE c.oid = 'public.ct_v_rt_pnl'::regclass AND a.grantee <> c.relowner AND a.grantee <> 0 LOOP
    EXECUTE format('REVOKE ALL ON public.ct_v_rt_pnl FROM %s', v_role);
  END LOOP;
  FOR v_k IN 1 .. coalesce(array_length(v_grants, 1), 0) LOOP EXECUTE v_grants[v_k]; END LOOP;
  CREATE OR REPLACE VIEW public.dl_v_rt_route WITH (security_invoker = true) AS
 WITH leg AS (
         SELECT l.rt_id,
            l.id AS leg_id,
            l.direction,
            l.seq,
            COALESCE(o.loading_datetime::timestamp with time zone, nl.loading_datetime)::date AS load_d,
            COALESCE(o.actual_delivery_date, nl.actual_delivery_date, o.delivery_datetime, nl.delivery_datetime::date) AS deliv_d,
            COALESCE(o.loading_location_1_id, nl.pickup_location_1_id) AS from_id,
            COALESCE(o.unloading_location_10_id, o.unloading_location_9_id, o.unloading_location_8_id, o.unloading_location_7_id, o.unloading_location_6_id, o.unloading_location_5_id, o.unloading_location_4_id, o.unloading_location_3_id, o.unloading_location_2_id, o.unloading_location_1_id, nl.delivery_location_10_id, nl.delivery_location_9_id, nl.delivery_location_8_id, nl.delivery_location_7_id, nl.delivery_location_6_id, nl.delivery_location_5_id, nl.delivery_location_4_id, nl.delivery_location_3_id, nl.delivery_location_2_id, nl.delivery_location_1_id) AS to_id,
            ( SELECT count(*) AS count
                   FROM ( VALUES (o.loading_location_2_id), (o.loading_location_3_id), (o.loading_location_4_id), (o.loading_location_5_id), (o.loading_location_6_id), (o.loading_location_7_id), (o.loading_location_8_id), (o.loading_location_9_id), (o.loading_location_10_id), (o.unloading_location_2_id), (o.unloading_location_3_id), (o.unloading_location_4_id), (o.unloading_location_5_id), (o.unloading_location_6_id), (o.unloading_location_7_id), (o.unloading_location_8_id), (o.unloading_location_9_id), (o.unloading_location_10_id), (nl.pickup_location_2_id), (nl.pickup_location_3_id), (nl.pickup_location_4_id), (nl.pickup_location_5_id), (nl.pickup_location_6_id), (nl.pickup_location_7_id), (nl.pickup_location_8_id), (nl.pickup_location_9_id), (nl.pickup_location_10_id), (nl.delivery_location_2_id), (nl.delivery_location_3_id), (nl.delivery_location_4_id), (nl.delivery_location_5_id), (nl.delivery_location_6_id), (nl.delivery_location_7_id), (nl.delivery_location_8_id), (nl.delivery_location_9_id), (nl.delivery_location_10_id)) v(x)
                  WHERE v.x IS NOT NULL) AS extra_stops
           FROM ct_rt_legs l
             LEFT JOIN orders o ON o.id = l.order_id
             LEFT JOIN national_loads nl ON nl.id = l.nat_load_id
        )
 SELECT leg.rt_id,
    string_agg((COALESCE(lf.city, lf.name) || U&' \2192 '::text) || COALESCE(lt.city, lt.name), U&' \00B7 '::text ORDER BY leg.seq, leg.load_d, leg.leg_id) AS route_text,
    jsonb_agg(jsonb_build_object('dir', leg.direction, 'load', leg.load_d, 'deliv', leg.deliv_d, 'from', jsonb_build_object('name', lf.name, 'city', lf.city, 'country', lf.country), 'to', jsonb_build_object('name', lt.name, 'city', lt.city, 'country', lt.country), 'extra_stops', leg.extra_stops) ORDER BY leg.seq, leg.load_d, leg.leg_id) AS route_legs
   FROM leg
     LEFT JOIN locations lf ON lf.id = leg.from_id
     LEFT JOIN locations lt ON lt.id = leg.to_id
  GROUP BY leg.rt_id;
  CREATE OR REPLACE VIEW public.ct_v_rt_pallet_gate WITH (security_invoker = true) AS
 WITH rt_orders AS (
         SELECT l.rt_id,
            l.order_id
           FROM ct_rt_legs l
             JOIN orders o ON o.id = l.order_id AND o.deleted_at IS NULL
          WHERE l.order_id IS NOT NULL AND o.pallet_exchange = true
        ), sheets AS (
         SELECT DISTINCT pl_movements.order_id
           FROM pl_movements
          WHERE pl_movements.status = 'confirmed'::text AND (pl_movements.event_type = ANY (ARRAY['PARTNER_PICKUP'::text, 'PARTNER_DROPOFF'::text])) AND pl_movements.order_id IS NOT NULL
        )
 SELECT ro.rt_id,
    count(*) AS legs_needing_sheet,
    count(s.order_id) AS legs_with_sheet,
    count(*) = count(s.order_id) AS sheets_ok
   FROM rt_orders ro
     LEFT JOIN sheets s ON s.order_id = ro.order_id
  GROUP BY ro.rt_id;
  CREATE OR REPLACE VIEW public.stock_v_pieces AS
 SELECT o.stock_lot_id AS lot_id,
    'intl'::text AS piece_kind,
    o.id AS piece_id,
    o.legacy_id AS piece_rec,
    o.client_id,
    o.loading_location_1_id AS pickup_location_id,
    order_pallets(o.*) AS pallets,
    o.status,
    o.loading_datetime AS loading_date,
    COALESCE(o.status = 'Delivered'::text, false) AS delivered,
        CASE
            WHEN o.status = 'Delivered'::text THEN COALESCE(o.actual_delivery_date, o.delivery_datetime)
            ELSE NULL::date
        END AS delivered_on,
    o.truck_id IS NOT NULL OR o.partner_id IS NOT NULL AS on_truck,
    o.created_at
   FROM orders o
  WHERE o.deleted_at IS NULL AND o.stock_lot_id IS NOT NULL
UNION ALL
 SELECT n.stock_lot_id AS lot_id,
    'natl'::text AS piece_kind,
    n.id AS piece_id,
    n.legacy_id AS piece_rec,
    n.client_id,
    n.pickup_location_1_id AS pickup_location_id,
    COALESCE(n.pallets, 0::numeric) AS pallets,
    n.status,
    n.loading_datetime AS loading_date,
    stock_natl_delivered(n.status, n.delivery_datetime) AS delivered,
        CASE
            WHEN stock_natl_delivered(n.status, n.delivery_datetime) THEN COALESCE(n.actual_delivery_date, n.delivery_datetime)
            ELSE NULL::date
        END AS delivered_on,
    n.truck_id IS NOT NULL OR n.partner_id IS NOT NULL AS on_truck,
    n.created_at
   FROM national_orders n
  WHERE n.deleted_at IS NULL AND n.stock_lot_id IS NOT NULL;
  DROP VIEW public.ct_v_v5_revenue;
  -- after ct_v_rt_costs and ct_v_rt_pnl stopped reading them (above)
  DROP VIEW public.ct_v_rt_partner_cost;
  ALTER TABLE public.ct_cost_lines DROP COLUMN partner_id;
  DROP FUNCTION public.plan_h_pallet_sync(bigint[],text,text);
  DROP INDEX public.pl_mov_stop_once;

  -- PROOFS
  EXECUTE snap_sql INTO v_snap1;
  IF v_snap1 <> v_snap0 THEN RAISE EXCEPTION '073 rollback proof: a number changed (% -> %)', v_snap0, v_snap1; END IF;
  SELECT relacl::text INTO v_acl1 FROM pg_class WHERE oid = 'public.ct_v_rt_pnl'::regclass;
  IF v_acl1 IS DISTINCT FROM v_acl0 THEN RAISE EXCEPTION '073 rollback proof: ct_v_rt_pnl rights % -> %', v_acl0, v_acl1; END IF;
  SELECT count(*) INTO v_k FROM (VALUES
      ('public.ct_v_rt_revenue', '7bd4c2b3206af115a5cfff5478dfdfc9'),
      ('public.ct_v_rt_costs', '3349bcf0e25e567075243f94755de4ff'),
      ('public.ct_v_rt_pnl', 'abc2a49270d8ac7bda9852782ab21f78'),
      ('public.dl_v_rt_route', 'cfb5f85b913657fba8d8d365d38df323'),
      ('public.ct_v_rt_pallet_gate', '3672742c7ac8e537502058c8de6c8e8e'),
      ('public.stock_v_pieces', '9a17994f3476293c585e3ace7a07e2be')) g(rel, m)
   WHERE md5(pg_get_viewdef(to_regclass(g.rel), true)) <> g.m;
  IF v_k <> 0 THEN RAISE EXCEPTION '073 rollback proof: % view(s) are not the live text before 073', v_k; END IF;
  IF (SELECT reloptions FROM pg_class WHERE oid = 'public.dl_v_rt_route'::regclass) IS DISTINCT FROM ARRAY['security_invoker=true']
     OR (SELECT reloptions FROM pg_class WHERE oid = 'public.ct_v_rt_pallet_gate'::regclass) IS DISTINCT FROM ARRAY['security_invoker=true'] THEN
    RAISE EXCEPTION '073 rollback proof: security_invoker lost';
  END IF;
  SELECT count(*) INTO v_trg1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND ns.nspname = 'public';
  IF v_trg1 <> v_trg0 THEN RAISE EXCEPTION '073 rollback proof: triggers % -> %', v_trg0, v_trg1; END IF;
  IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'plan\_%'
        AND has_function_privilege('service_role', p.oid, 'EXECUTE')) <> 19 THEN
    RAISE EXCEPTION '073 rollback proof: service_role does not execute exactly the 19 public plan_* of 072 + 072b';
  END IF;
  PERFORM pg_notify('pgrst', 'reload schema');
  IF to_regclass('public.ct_v_rt_partner_cost') IS NOT NULL OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.ct_cost_lines'::regclass
       AND attname = 'partner_id' AND NOT attisdropped) THEN
    RAISE EXCEPTION '073 rollback proof: ct_v_rt_partner_cost or ct_cost_lines.partner_id still there';
  END IF;
  RAISE NOTICE '073 ROLLBACK OK: 5 functions back to 072 + 072b, 6 views back to their live text, the two money views, the partner column, the helper and the index gone; numbers %', v_snap1;
END $do$;

SELECT CASE WHEN to_regprocedure('public.plan_h_pallet_sync(bigint[],text,text)') IS NULL AND to_regclass('public.ct_v_v5_revenue') IS NULL
             AND to_regclass('public.ct_v_rt_partner_cost') IS NULL AND to_regclass('public.pl_mov_stop_once') IS NULL THEN '073 ROLLED BACK' ELSE '073 STILL IN PLACE' END AS result,
       md5(pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true)) AS revenue_md5,
       (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.plan_h_leg_add(bigint,bigint,bigint,bigint,text,text,integer)'::regprocedure) AS leg_add_md5;
