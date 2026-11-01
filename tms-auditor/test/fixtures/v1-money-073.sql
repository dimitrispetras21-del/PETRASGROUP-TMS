-- SYNTHETIC (no production row): round trips of TODAY's model for the before = after proof of 073 on PGlite.
-- Every branch 073 rewrites has at least one row here: an export and an import with Veroia Switch (X charged), a
-- stock lot piece (X prorated, rt_amount), a Direct national load (X credited) and a national order at home, a
-- partner trip with an assignment, a national load by a partner, payroll and cost lines, a truck with km and
-- maintenance (wear), a pallet-exchange order with and without a partner sheet, a cancelled trip.
-- Names "TESTV 073 ...", legacy ids rec073V... ASCII only.
DO $v1$
DECLARE
  l1 bigint; l2 bigint; l3 bigint; c1 bigint; c2 bigint; p1 bigint; t1 bigint; t2 bigint; d1 bigint; d2 bigint;
  o1 bigint; o2 bigint; o3 bigint; o4 bigint; o5 bigint; lot bigint; nl1 bigint; nl2 bigint; n1 bigint;
  r1 bigint; r2 bigint; r3 bigint; r4 bigint; s1 bigint; s2 bigint; td date := current_date;
BEGIN
  INSERT INTO ct_settings (key, value) VALUES ('x_export', 850), ('x_import', 650), ('full_truck_pallets', 33),
    ('pallet_eur', 12), ('wear_fallback_eur_km', 0.082), ('vat_default', 0.24);
  INSERT INTO locations (legacy_id, name, city, country) VALUES ('rec073V1', 'TESTV 073 Thess', 'Thessaloniki', 'GR') RETURNING id INTO l1;
  INSERT INTO locations (legacy_id, name, city, country) VALUES ('rec073V2', 'TESTV 073 Munich', 'Munich', 'DE') RETURNING id INTO l2;
  INSERT INTO locations (legacy_id, name, city, country) VALUES ('rec073V3', 'TESTV 073 Athens', NULL, 'GR') RETURNING id INTO l3;
  INSERT INTO clients (legacy_id, company_name) VALUES ('rec073VC1', 'TESTV 073 client 1') RETURNING id INTO c1;
  INSERT INTO clients (legacy_id, company_name) VALUES ('rec073VC2', 'TESTV 073 client 2') RETURNING id INTO c2;
  INSERT INTO partners (legacy_id, company_name) VALUES ('rec073VP1', 'TESTV 073 partner') RETURNING id INTO p1;
  INSERT INTO trucks (legacy_id, license_plate) VALUES ('rec073VT1', 'TESTV-073-1') RETURNING id INTO t1;
  INSERT INTO trucks (legacy_id, license_plate) VALUES ('rec073VT2', 'TESTV-073-2') RETURNING id INTO t2;
  INSERT INTO drivers (legacy_id, full_name) VALUES ('rec073VD1', 'TESTV 073 driver 1') RETURNING id INTO d1;
  INSERT INTO drivers (legacy_id, full_name) VALUES ('rec073VD2', 'TESTV 073 driver 2') RETURNING id INTO d2;
  INSERT INTO maint_history (truck_id, service_date, cost) VALUES (t1, td - 30, 1000);

  -- orders: export VS (price 2000), import (1800, no VS), import VS by a partner (1500), a stock lot (VS import, 33
  -- pallets) and one of its pieces (VS, 20 pallets, on truck t1: the 057 guard refuses a delivered piece without a
  -- truck, stock_guard_orders; no price, orders_stock_piece_no_money), a pallet-exchange export with a partner sheet
  INSERT INTO orders (legacy_id, client_id, price, direction, veroia_switch, status, loading_datetime, delivery_datetime,
                      loading_location_1_id, unloading_location_1_id, loading_pallets_1, pallet_exchange)
  VALUES ('rec073VO1', c1, 2000, 'Export', true, 'Delivered', td - 10, td - 7, l1, l2, 33, true) RETURNING id INTO o1;
  INSERT INTO orders (legacy_id, client_id, price, direction, veroia_switch, status, loading_datetime, delivery_datetime,
                      loading_location_1_id, unloading_location_1_id, unloading_location_2_id, loading_pallets_1)
  VALUES ('rec073VO2', c2, 1800, 'Import', false, 'Delivered', td - 7, td - 5, l2, l1, l3, 20) RETURNING id INTO o2;
  INSERT INTO orders (legacy_id, client_id, price, direction, veroia_switch, status, loading_datetime, delivery_datetime,
                      loading_location_1_id, unloading_location_1_id, loading_pallets_1, partner_id, pallet_exchange)
  VALUES ('rec073VO3', c1, 1500, 'Import', true, 'Assigned', td - 2, td + 2, l2, l1, 30, p1, true) RETURNING id INTO o3;
  INSERT INTO orders (legacy_id, client_id, price, direction, veroia_switch, status, loading_datetime, delivery_datetime,
                      loading_location_1_id, unloading_location_1_id, loading_pallets_1)
  VALUES ('rec073VO4', c2, 3300, 'Import', false, 'Delivered', td - 20, td - 15, l2, l1, 33) RETURNING id INTO o4;
  INSERT INTO stock_lots (legacy_id, order_id, warehouse_charge) VALUES ('rec073VL1', o4, 0) RETURNING id INTO lot;
  INSERT INTO orders (legacy_id, client_id, price, direction, veroia_switch, status, loading_datetime, delivery_datetime,
                      loading_location_1_id, unloading_location_1_id, loading_pallets_1, stock_lot_id, truck_id)
  VALUES ('rec073VO5', c2, NULL, 'Import', true, 'Delivered', td - 12, td - 11, l1, l3, 20, lot, t1) RETURNING id INTO o5;
  INSERT INTO partner_assignments (order_id, partner_id, partner_rate, status) VALUES (o3, p1, 700, 'Assigned');
  -- national: a Direct load of the VS import o3 (X credited) and a national order at home on a National load
  INSERT INTO national_orders (legacy_id, client_id, price, pallets, status, delivery_datetime)
  VALUES ('rec073VN1', c1, 300, 10, 'Delivered', td - 3) RETURNING id INTO n1;
  INSERT INTO national_loads (legacy_id, source_type, source_order_id, pickup_location_1_id, delivery_location_1_id,
                              delivery_location_2_id, loading_datetime, delivery_datetime, status)
  VALUES ('rec073VNL1', 'Direct', o3, l1, l3, l2, td + 1, td + 2, 'Assigned') RETURNING id INTO nl1;
  INSERT INTO national_loads (legacy_id, source_type, source_national_order_id, pickup_location_1_id, delivery_location_1_id,
                              loading_datetime, delivery_datetime, status, is_partner_trip, partner_rate)
  VALUES ('rec073VNL2', 'National', n1, l1, l3, td - 4, td - 3, 'Delivered', true, 250) RETURNING id INTO nl2;

  -- round trips: OWNED closed with km (wear), PARTNER planned, OWNED with the national loads, a cancelled one
  INSERT INTO ct_round_trips (code, scope, trip_type, truck_id, driver_id, date_start, date_end, status, source, created_by, total_km)
  VALUES ('RT-T731', 'INTL', 'OWNED', t1, d1, td - 10, td - 5, 'closed', 'planner', 'test:073', 2000) RETURNING id INTO r1;
  INSERT INTO ct_round_trips (code, scope, trip_type, partner_id, date_start, date_end, status, source, created_by)
  VALUES ('RT-T732', 'INTL', 'PARTNER', p1, td - 2, td + 2, 'planned', 'planner', 'test:073') RETURNING id INTO r2;
  INSERT INTO ct_round_trips (code, scope, trip_type, truck_id, driver_id, date_start, date_end, status, source, created_by)
  VALUES ('RT-T733', 'INTL', 'OWNED', t2, d2, td - 4, td + 2, 'planned', 'planner', 'test:073') RETURNING id INTO r3;
  INSERT INTO ct_round_trips (code, scope, trip_type, truck_id, date_start, date_end, status, source, created_by)
  VALUES ('RT-T734', 'INTL', 'OWNED', t2, td - 30, td - 29, 'cancelled', 'planner', 'test:073') RETURNING id INTO r4;
  INSERT INTO ct_rt_legs (rt_id, order_id, direction, seq) VALUES (r1, o1, 'EXPORT', 1), (r1, o2, 'IMPORT', 2), (r1, o5, 'IMPORT', 3);
  INSERT INTO ct_rt_legs (rt_id, order_id, direction, seq) VALUES (r2, o3, 'IMPORT', 1);
  INSERT INTO ct_rt_legs (rt_id, nat_load_id, direction, seq) VALUES (r3, nl1, 'ANODOS', 1), (r3, nl2, 'KATHODOS', 2);
  INSERT INTO ct_rt_legs (rt_id, order_id, direction, seq) VALUES (r4, o4, 'IMPORT', 1);

  -- money around them: payroll lines with amounts, costs (one partner invoice), a confirmed partner sheet for o3
  UPDATE dl_entries SET trip_value = 450, expenses = 30 WHERE rt_id = r1 AND deleted_at IS NULL;
  INSERT INTO ct_cost_lines (rt_id, category, net, vat, alloc_status, pay_source, line_date, created_by)
  VALUES (r1, 'fuel', 500, 120, 'allocated', 'DKV', td - 8, 'test:073'), (r1, 'tolls', 80, 0, 'allocated', 'DKV', td - 8, 'test:073'),
         (r2, 'partner_rate', 690, 0, 'allocated', 'CREDIT', td - 1, 'test:073'), (r3, 'fuel', 100, 24, 'allocated', 'CASH', td - 3, 'test:073');
  INSERT INTO order_stops (legacy_id, order_id, stop_type, stop_number, location_id, datetime, pallets)
  VALUES ('rec073VS1', o3, 'Unloading', 1, l1, td + 2, 30) RETURNING id INTO s1;
  INSERT INTO order_stops (legacy_id, order_id, stop_type, stop_number, location_id, datetime, pallets)
  VALUES ('rec073VS2', o1, 'Loading', 1, l1, td - 10, 33) RETURNING id INTO s2;
  INSERT INTO pl_movements (movement_date, counterparty_type, partner_id, location_id, event_type, taken, given, status,
                            order_id, created_by, confirmed_by, confirmed_at, sheet_source)
  VALUES (td - 1, 'PARTNER', p1, l1, 'PARTNER_DROPOFF', 30, 28, 'confirmed', o3, 'test:073', 'test:073', now(), 'MANUAL');
  INSERT INTO pl_movements (movement_date, counterparty_type, client_id, location_id, event_type, taken, given, status,
                            order_id, order_stop_id, created_by)
  VALUES (td - 10, 'CLIENT', c1, l1, 'LOADING', 33, 0, 'pending', o1, s2, 'test:073');
END
$v1$;
