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
          WHERE nord.deleted_at IS NULL AND nord.price IS NOT NULL AND nord.source_order_id IS NULL AND NOT (EXISTS ( SELECT 1
                   FROM shipments s5
                  WHERE s5.nat_order_id = nord.id AND s5.deleted_at IS NULL))
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
                        END AND NOT (EXISTS ( SELECT 1
                           FROM shipments b
                          WHERE (b.order_id = so.id OR b.order_id = sp.id) AND b.deleted_at IS NULL)) THEN stock_vs_charge(
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
        ), v5 AS (
         SELECT x.rt_id,
            0::numeric AS rev_intl,
            x.amount AS rev_natl,
            x.amount IS NULL AND x.kind = 'price'::text AS missing
           FROM ct_v_v5_revenue x
          WHERE x.rt_id IS NOT NULL
        ), allr AS (
         SELECT legs.rt_id,
            legs.rev_intl,
            legs.rev_natl,
            false AS missing
           FROM legs
        UNION ALL
         SELECT v5.rt_id,
            v5.rev_intl,
            v5.rev_natl,
            v5.missing
           FROM v5
        )
 SELECT rt_id,
    COALESCE(sum(rev_intl + rev_natl), 0::numeric) AS revenue,
    COALESCE(sum(rev_intl), 0::numeric) AS revenue_intl,
    COALESCE(sum(rev_natl), 0::numeric) AS revenue_natl,
    COALESCE(bool_or(missing), false) AS revenue_missing
   FROM allr
  GROUP BY rt_id
