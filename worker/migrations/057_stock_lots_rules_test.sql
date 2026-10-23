-- 057 RULES TEST — ONE DO block that ALWAYS ends with an exception, so NOTHING it writes survives:
-- every test row, every trigger side effect (audit_log rows, leg status sync) rolls back with it.
-- Run AFTER 057 (and after 057_stock_lots_verify.sql V1–V8). Expected FIRST line of the error panel
-- (the editor may prefix it with «ERROR: P0001:»):
--
--     RESULT: 119/119 OK
--
-- followed by one line per case («OK   01 expected over_draw · got over_draw»). Anything less = STOP,
-- copy the panel to the coordinator. 78 refusals + 21 accepted paths + 20 money cases (Ε1).
-- Cases 36–49 and P11, P14 are the round-0 rules of the impact map (4/10): E-04 cancel (36, 37, P14),
-- B-16 lot_grouped (38–43), C-15 lot_vs (44, 45, P11), C-05 piece_no_truck (46–49). 50–51: K7.
-- Round 1 of the critics (4/10): D1 «on a truck» = truck or partner (13, 52, P12, P13), Σ-08 / E2-11
-- an invoiced lot's statuses are frozen (53–55, 61), Σ-05 lot_grouped covers the rota (56–60),
-- D3 pieces_moving (P15). Round 1b of the SQL reviewer (P3-3): 62–66 reach the last five codes
-- (lot_empty, lot_is_piece, piece_is_lot, lot_missing, lot_source_missing).
-- Round 2 (4/10):
--   * P3 (3) of the SQL reviewer: 67–72 reach the NATIONAL raise sites of lot_empty (mark, source
--     save), lot_is_piece, piece_is_lot and lot_missing, and 69 the international source-save site of
--     lot_empty. The two piece_is_lot sites in the LOT SOURCE blocks are backstops that only a
--     bypassed guard can reach (a piece marked as a lot while stock_guard_lots was off) — proved in
--     the local harness with the guard disabled, never here (no DDL in a production test).
--   * «Χρέωση αποθήκης» (contract round 2 #1): 74 (CHECK ≥ 0),
--     P16 (editable while closed, same value re-sent after the invoice passes), M7–M11 (own truck
--     with / without / cleared / 0 charge, partner + charge, tms_reader blind to the column), and
--     OWNER-Q7 answered 4/10 (same rule): P8 + M12 (national lot without / with a charge).
--   * OWNER-Q5 answered 4/10 (any location can be a warehouse): case 18 (warehouse_rule) is gone
--     with its code; P17 (untyped location) and P18 ('Client Depot') are accepted; 75–78 refuse a
--     NULL or deleted destination (lot_no_dest) at all four sites. Lots A and B sit at 424, which
--     057 no longer types — itself a lot at an untyped location.
--   * OWNER-Q3 answered 4/10 (VS on piece prorated /F): VS1–VS4 the piece's share (15/33 → 295.45,
--     33/33 → 650, 40 → capped 650, an Export piece on 850), VS5 both legs of the deployed
--     ct_v_rt_revenue call the one function with the piece's own pallets, VS6 an ordinary VS order
--     keeps the full charge. The amounts assume x_import 650, x_export 850, F 33 (4/10) — each line
--     prints the X and F it used. The RT-level sums (intl leg − share, national leg + share, total =
--     allocation) are proved in the local harness: this test never opens a round trip.
-- Round 3 (4/10, the round-2 critics + OWNER-Q4b):
--   * OWNER-Q4b answered 4/10 (warehouse charge open after invoice): round 2's case 73 (charge
--     refused after the invoice) is now P19 — accepted, the net recomputed. 73 and 79 now prove what
--     DOES freeze with the invoice: the lot price (international and national source).
--   * Σ2-03 M13: an assignment without a rate is 'no_partner_rate', not «no assignment».
--   * Σ2-04 M14: a charge above the price stays 'ok' with a negative net (S-11 reports it, 057b).
-- Round 4 (4/10, the independent SQL reviewer's GO, P2): the price lock reaches ONLY a lot source —
--   P20 an ordinary invoiced order's price still changes (043 allows it); P21 re-sending the
--   unchanged price of an invoiced lot source is no change.
--
-- HOW IT STAYS HARMLESS
--   * Test rows use NEGATIVE ids written with OVERRIDING SYSTEM VALUE: no identity sequence moves,
--     so the next real order number (#…) is not skipped. References start with TEST-STOCK-.
--   * No test row has a truck or a partner trip, so rt_create_from_order never opens a round trip
--     (RT codes come from a sequence that a rollback would not give back). A piece born In Transit
--     or Delivered must be «on a truck» (piece_no_truck; round 1 D1: a truck or a partner — a group
--     no longer counts): the IP: shorthand gives it the first live PARTNER with is_partner_trip left
--     false — rt_create_from_order opens a round trip only for a truck or a partner TRIP.
--   * Reads two live clients, one Greek location (not 'Partner Warehouse' / 'Veroia Hub'), 424 and
--     360 (any location can be a warehouse since OWNER-Q5), one other live UNTYPED location, one live
--     'Client Depot' location, one DELETED location and one live partner; never updates a real row.
--   * Each case runs in its own sub-block and is rolled back on its own (it always ends by raising),
--     so the cases are independent of each other and of their order.
--
-- HOW A CASE PASSES
--   refusal: the error's hint is 'stock:<expected code>', or its constraint/index name is the
--            expected CHECK / unique index;
--   accepted / money: the statements pass and the check query returns exactly the expected text.
-- Shorthand in the statement lists (expanded by the runner, so the 87 cases stay readable):
--   'IP:id,lot,pallets,status[,client[,pickup]]' = an international piece (Import, to a Greek site;
--      status In Transit / Delivered → partner_id = the live partner, see above)
--   'NP:id,lot,pallets,status[,client[,pickup]]' = a national piece
--   defaults: client = first client, pickup = 424. %1$s..%9$s = client 1, client 2, Greek site, 424, 360,
--   the live partner, a 'Client Depot' location, an untyped location, a deleted location.
-- Base fixtures (built once, before the cases): lot A = order -9001 (33p, Delivered at 424, price
-- 3300.00, warehouse partner assignment 300.00 'Assigned') anchored as -9301; lot B = order -9002
-- (33p, Delivered at 424, price 2000.00, NO partner assignment — the lot our own truck carried in,
-- no warehouse charge entered) anchored as -9302.

do $test$
declare
  c1 bigint; c2 bigint; gr bigint; pt bigint; cd bigint; ut bigint; dl bigint;
  wh  constant bigint := 424;
  hub constant bigint := 360;
  r record; s text; a text[];
  v_txt text; v_got text; v_line text;
  v_state text; v_msg text; v_hint text; v_con text;
  v_ok int := 0; v_total int := 0; v_report text := '';
begin
  select id into c1 from public.clients where deleted_at is null order by id limit 1;
  select id into c2 from public.clients where deleted_at is null and id <> c1 order by id limit 1;
  select id into gr from public.locations
   where deleted_at is null and country in ('Greece', 'GR')
     and coalesce(type, '') not in ('Partner Warehouse', 'Veroia Hub')
   order by id limit 1;
  select id into pt from public.partners where deleted_at is null order by id limit 1;
  select id into cd from public.locations where deleted_at is null and type = 'Client Depot' order by id limit 1;
  select id into ut from public.locations where deleted_at is null and type is null and id not in (wh, hub) order by id limit 1;
  select id into dl from public.locations where deleted_at is not null order by id limit 1;
  if c1 is null or c2 is null or gr is null or pt is null or cd is null or ut is null or dl is null
     or to_regclass('public.stock_lots') is null
     or (select count(*) from public.locations where id in (wh, hub) and deleted_at is null) <> 2 then
    raise exception 'RESULT: 0/119 — SETUP FAILED: run 057 first (needs 2 clients, a Greek site, a partner, an untyped, a Client Depot and a deleted location, 424 + 360 live)';
  end if;
  -- VS5 reads the revenue view's text: pin the deparse context (rolled back with everything else).
  perform set_config('search_path', 'public', true);

  insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
                             loading_location_1_id, unloading_location_1_id, loading_pallets_1,
                             loading_datetime, delivery_datetime, price, created_at)
  overriding system value values
    (-9001, 'recTSTSTK9001', 'TEST-STOCK-LOT-A', 'International', 'Export', 'Delivered', c1, gr, wh, 33,
     current_date - 5, current_date - 2, 3300.00, now()),
    (-9002, 'recTSTSTK9002', 'TEST-STOCK-LOT-B', 'International', 'Export', 'Delivered', c1, gr, wh, 33,
     current_date - 5, current_date - 2, 2000.00, now());
  insert into public.partner_assignments (id, order_id, partner_rate, status)
  overriding system value values (-9201, -9001, 300.00, 'Assigned');
  insert into public.stock_lots (id, order_id) values (-9301, -9001), (-9302, -9002);

  for r in
    select * from (values
    -- ── Refusals (66) ───────────────────────────────────────────────────────────────────────────
    ('01', 'over_draw', array['IP:-9101,-9301,5,Pending', 'IP:-9102,-9301,15,Pending', 'IP:-9103,-9301,14,Pending'], null::text),
    ('02', 'orders_stock_piece_no_money', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status,
        client_id, loading_location_1_id, unloading_location_1_id, loading_pallets_1, stock_lot_id, price)
        overriding system value values (-9101, 'recTSTSTK9101', 'TEST-STOCK-9101', 'International', 'Import', 'Pending',
        %1$s, %4$s, %3$s, 5, -9301, 100)$q$], null),
    ('03', 'piece_mismatch', array['IP:-9101,-9301,5,Pending,%2$s'], null),
    ('04', 'piece_pickup', array['IP:-9101,-9301,5,Pending,%1$s,%3$s'], null),
    ('05', 'piece_empty', array['IP:-9101,-9301,0,Pending'], null),
    ('06', 'orders_stock_piece_shape', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status,
        client_id, loading_location_1_id, unloading_location_1_id, loading_pallets_1, stock_lot_id, pallet_exchange)
        overriding system value values (-9101, 'recTSTSTK9101', 'TEST-STOCK-9101', 'International', 'Import', 'Pending',
        %1$s, %4$s, %3$s, 5, -9301, true)$q$], null),
    ('07', 'orders_stock_piece_shape', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status,
        client_id, loading_location_1_id, unloading_location_1_id, loading_pallets_1, stock_lot_id, ops_status)
        overriding system value values (-9101, 'recTSTSTK9101', 'TEST-STOCK-9101', 'International', 'Import', 'Pending',
        %1$s, %4$s, %3$s, 5, -9301, 'Provisional')$q$], null),
    ('08', 'lot_provisional', array[$q$update public.orders set ops_status = 'Provisional' where id = -9001$q$,
        'IP:-9101,-9301,5,Pending'], null),
    ('09', 'lot_has_pieces', array['IP:-9101,-9301,5,Pending',
        $q$select public.delete_order_cascade('recTSTSTK9001')$q$], null),
    ('10', 'lot_has_pieces', array['IP:-9101,-9301,5,Pending',
        $q$update public.stock_lots set deleted_at = now() where id = -9301$q$], null),
    -- (on a vehicle before In Transit — piece_no_truck; a partner without «partner trip» opens no
    --  round trip, a truck would)
    ('11', 'piece_executed', array['IP:-9101,-9301,5,Assigned',
        $q$update public.orders set partner_id = %6$s where id = -9101$q$,
        $q$update public.orders set status = 'In Transit' where id = -9101$q$,
        $q$update public.orders set deleted_at = now() where id = -9101$q$], null),
    ('12', 'piece_on_truck', array['IP:-9101,-9301,5,Assigned',
        $q$update public.orders set partner_id = %6$s where id = -9101$q$,
        $q$update public.orders set deleted_at = now() where id = -9101$q$], null),
    -- D1 (round 1): an export's match is a plan, not a vehicle — the matched piece is not delivered
    -- (round 0 accepted this as «on a truck»; its delete is P13).
    ('13', 'piece_no_truck', array['IP:-9101,-9301,5,Assigned',
        $q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, matched_import_id)
           overriding system value values (-9004, 'recTSTSTK9004', 'TEST-STOCK-EXPORT', 'International', 'Export',
           'Pending', %2$s, %3$s, %4$s, 10, 'recTSTSTK9101')$q$,
        $q$update public.orders set status = 'Delivered' where id = -9101$q$], null),
    ('14', 'invoice_incomplete', array['IP:-9101,-9301,5,Pending',
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-14' where id = -9001$q$], null),
    ('15', 'invoice_incomplete', array['IP:-9101,-9301,33,Delivered',
        $q$update public.orders set status = null, invoiced = true, invoice_number = 'TEST-ERP-15' where id = -9001$q$], null),
    ('16', 'no_split', array[$q$insert into public.orders (id, legacy_id, reference, parent_order_id, leg_no)
        overriding system value values (-9005, 'recTSTSTK9005', 'TEST-STOCK-LEG', -9001, 1)$q$], null),
    ('17', 'no_split', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %4$s, 10)$q$,
        $q$insert into public.orders (id, legacy_id, reference, parent_order_id, leg_no)
           overriding system value values (-9007, 'recTSTSTK9007', 'TEST-STOCK-LEG', -9006, 1)$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    -- (18: warehouse_rule — gone with its code, OWNER-Q5 answered 4/10 (any location can be a
    --  warehouse); the same shape, a lot to an ordinary site, is accepted case P17/P18.)
    ('19', 'lot_multi_dest', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, unloading_location_2_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %4$s, %3$s, 10)$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    ('20', 'close_early', array['IP:-9101,-9301,5,Pending',
        $q$update public.stock_lots set closed_note = 'TEST' where id = -9301$q$], null),
    ('21', 'stock_lots_close_shape', array[$q$update public.stock_lots set closed_note = '   ' where id = -9301$q$], null),
    ('22', 'lot_closed', array[$q$update public.stock_lots set closed_note = 'TEST: κλείσιμο' where id = -9301$q$,
        'IP:-9101,-9301,5,Pending'], null),
    ('23', 'lot_invoiced', array[$q$update public.stock_lots set closed_note = 'TEST: κλείσιμο' where id = -9301$q$,
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-23' where id = -9001$q$,
        'IP:-9101,-9301,5,Pending'], null),
    ('24', 'lot_frozen', array[$q$update public.orders set loading_pallets_1 = 30 where id = -9001$q$], null),
    ('25', 'lot_below_drawn', array[$q$update public.orders set status = 'In Transit' where id = -9001$q$,
        'IP:-9101,-9301,20,Pending',
        $q$update public.orders set loading_pallets_1 = 10 where id = -9001$q$], null),
    ('26', 'piece_relink', array['IP:-9101,-9301,5,Pending',
        $q$update public.orders set stock_lot_id = -9302 where id = -9101$q$], null),
    ('27', 'reopen_invoiced', array[$q$update public.stock_lots set closed_note = 'TEST: κλείσιμο' where id = -9301$q$,
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-27' where id = -9001$q$,
        $q$update public.stock_lots set closed_note = null where id = -9301$q$], null),
    ('28', 'over_draw', array['IP:-9101,-9301,28,Pending',
        $q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Import',
           'Pending', %1$s, %4$s, %3$s, 20)$q$,
        $q$update public.orders set stock_lot_id = -9301 where id = -9006$q$], null),
    ('29', 'over_draw', array['IP:-9101,-9301,20,Pending',
        $q$update public.orders set deleted_at = now() where id = -9101$q$,
        'IP:-9102,-9301,20,Pending',
        $q$update public.orders set deleted_at = null where id = -9101$q$], null),
    ('30', 'stock_lots_order_live', array[$q$insert into public.stock_lots (id, order_id) values (-9305, -9001)$q$], null),
    ('31', 'orders_stock_piece_shape', array['IP:-9101,-9301,5,Pending',
        $q$update public.orders set status = 'Cancelled' where id = -9101$q$], null),
    ('32', 'over_draw', array['IP:-9101,-9301,30,Pending', 'NP:-9501,-9301,5,Pending'], null),
    ('33', 'piece_pickup', array['NP:-9501,-9301,5,Pending,%1$s,%3$s'], null),
    ('34', 'national_orders_stock_piece_no_money', array[$q$insert into public.national_orders (id, legacy_id, reference, status,
        client_id, pickup_location_1_id, delivery_location_1_id, pallets, stock_lot_id, price)
        overriding system value values (-9501, 'recTSTSTK9501', 'TEST-STOCK-9501', 'Pending', %1$s, %4$s, %3$s, 5, -9301, 50)$q$], null),
    ('35', 'lot_relink', array[$q$update public.stock_lots set order_id = -9002 where id = -9301$q$], null),
    -- E-04: a lot source with live pieces is not cancelled (international and national source).
    ('36', 'lot_has_pieces', array['IP:-9101,-9301,5,Pending',
        $q$update public.orders set status = 'Cancelled' where id = -9001$q$], null),
    ('37', 'lot_has_pieces', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, pallets, price, loading_datetime, delivery_datetime)
           overriding system value values (-9502, 'recTSTSTK9502', 'TEST-STOCK-NLOT', 'Pending', %1$s, %3$s, %5$s, 12, 500,
           current_date, current_date + 1)$q$,
        $q$insert into public.stock_lots (id, nat_order_id) values (-9304, -9502)$q$,
        'NP:-9501,-9304,4,Pending,%1$s,%5$s',
        $q$update public.national_orders set status = 'Cancelled' where id = -9502$q$], null),
    -- B-16: a lot source never sits in a group or a match — at the mark (38–40), on its own save
    -- (41, 42) and when an export takes it as its matched import (43).
    ('38', 'lot_grouped', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, group_id)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %4$s, 10, 'GI-TEST|recTSTSTK9006')$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    ('39', 'lot_grouped', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, matched_import_id)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %4$s, 10, 'recTSTSTK9101')$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    ('40', 'lot_grouped', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Import',
           'Pending', %1$s, %3$s, %4$s, 10)$q$,
        $q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, matched_import_id)
           overriding system value values (-9004, 'recTSTSTK9004', 'TEST-STOCK-EXPORT', 'International', 'Export',
           'Pending', %2$s, %3$s, %4$s, 10, 'recTSTSTK9006')$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    ('41', 'lot_grouped', array[$q$update public.orders set group_id = 'GI-TEST|recTSTSTK9001' where id = -9001$q$], null),
    ('42', 'lot_grouped', array[$q$update public.orders set matched_import_id = 'recTSTSTK9101' where id = -9001$q$], null),
    ('43', 'lot_grouped', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9004, 'recTSTSTK9004', 'TEST-STOCK-EXPORT', 'International', 'Export',
           'Pending', %2$s, %3$s, %4$s, 10)$q$,
        $q$update public.orders set matched_import_id = 'recTSTSTK9001' where id = -9004$q$], null),
    -- C-15 (OWNER-Q1 answered 4/10 (no VS on a lot)): no Veroia Switch on a lot source — at the mark
    -- (44), on its save (45).
    ('44', 'lot_vs', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, veroia_switch)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %4$s, 10, true)$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    ('45', 'lot_vs', array[$q$update public.orders set veroia_switch = true where id = -9001$q$], null),
    -- C-05: a piece is loaded / delivered only while on a truck (update, insert, national mirror).
    ('46', 'piece_no_truck', array['IP:-9101,-9301,5,Pending',
        $q$update public.orders set status = 'In Transit' where id = -9101$q$], null),
    ('47', 'piece_no_truck', array['IP:-9101,-9301,5,Assigned',
        $q$update public.orders set status = 'Delivered' where id = -9101$q$], null),
    ('48', 'piece_no_truck', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status,
        client_id, loading_location_1_id, unloading_location_1_id, loading_pallets_1, stock_lot_id)
        overriding system value values (-9101, 'recTSTSTK9101', 'TEST-STOCK-9101', 'International', 'Import', 'Delivered',
        %1$s, %4$s, %3$s, 5, -9301)$q$], null),
    ('49', 'piece_no_truck', array['NP:-9501,-9301,5,Pending',
        $q$update public.national_orders set status = 'In Transit' where id = -9501$q$], null),
    -- K7 (round 1): an empty lot whose source was cancelled gives no pieces, intl and natl.
    ('50', 'lot_cancelled', array[$q$update public.orders set status = 'Cancelled' where id = -9001$q$,
        'IP:-9101,-9301,5,Pending'], null),
    ('51', 'lot_cancelled', array[$q$update public.orders set status = 'Cancelled' where id = -9001$q$,
        'NP:-9501,-9301,5,Pending'], null),
    -- D1 (round 1): a Group ID without a vehicle is a plan — the piece is not loaded (critic-3 Σ-03:
    -- «Καθαρισμός ανάθεσης» leaves exactly this shape; round 0 let it go In Transit with no RT leg).
    ('52', 'piece_no_truck', array['IP:-9101,-9301,5,Assigned',
        $q$update public.orders set group_id = 'GI-TEST|recTSTSTK9101' where id = -9101$q$,
        $q$update public.orders set status = 'In Transit' where id = -9101$q$], null),
    -- Σ-08 / E2-11 (round 1): once the lot is invoiced no status steps back — a piece (53), a national
    -- piece by its delivery date (54), the international source (55), the national source (61).
    ('53', 'lot_invoiced', array['IP:-9101,-9301,33,Delivered',
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-53' where id = -9001$q$,
        $q$update public.orders set status = 'In Transit' where id = -9101$q$], null),
    ('54', 'lot_invoiced', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, pallets, stock_lot_id, loading_datetime, delivery_datetime)
           overriding system value values (-9501, 'recTSTSTK9501', 'TEST-STOCK-9501', 'Pending', %1$s, %4$s, %3$s, 33, -9301,
           current_date - 2, current_date - 1)$q$,
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-54' where id = -9001$q$,
        $q$update public.national_orders set delivery_datetime = current_date + 3 where id = -9501$q$], null),
    ('55', 'lot_invoiced', array['IP:-9101,-9301,33,Delivered',
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-55' where id = -9001$q$,
        $q$update public.orders set status = 'In Transit' where id = -9001$q$], null),
    -- Σ-05 (round 1): no rota around a lot source — at the mark when it is a rota leg (56) or a rota
    -- parent (57), on its own save (58), and when another order points its rotation at it (59 update,
    -- 60 insert). 'recTSTSTK9007' is a rota parent that is no lot (it need not exist).
    ('56', 'lot_grouped', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, rotation_id)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %4$s, 10, 'recTSTSTK9007')$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    ('57', 'lot_grouped', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %4$s, 10)$q$,
        $q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, rotation_id)
           overriding system value values (-9004, 'recTSTSTK9004', 'TEST-STOCK-ROTA', 'International', 'Export',
           'Pending', %2$s, %4$s, %3$s, 10, 'recTSTSTK9006')$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    ('58', 'lot_grouped', array[$q$update public.orders set rotation_id = 'recTSTSTK9007' where id = -9001$q$], null),
    ('59', 'lot_grouped', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9004, 'recTSTSTK9004', 'TEST-STOCK-ROTA', 'International', 'Export',
           'Pending', %2$s, %4$s, %3$s, 10)$q$,
        $q$update public.orders set rotation_id = 'recTSTSTK9001' where id = -9004$q$], null),
    ('60', 'lot_grouped', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, rotation_id)
           overriding system value values (-9004, 'recTSTSTK9004', 'TEST-STOCK-ROTA', 'International', 'Export',
           'Pending', %2$s, %4$s, %3$s, 10, 'recTSTSTK9001')$q$], null),
    ('61', 'lot_invoiced', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, pallets, price, loading_datetime, delivery_datetime)
           overriding system value values (-9502, 'recTSTSTK9502', 'TEST-STOCK-NLOT', 'Pending', %1$s, %3$s, %5$s, 12, 500,
           current_date - 3, current_date - 2)$q$,
        $q$insert into public.stock_lots (id, nat_order_id) values (-9304, -9502)$q$,
        $q$insert into public.national_orders (id, legacy_id, reference, status, client_id, pickup_location_1_id,
           delivery_location_1_id, pallets, stock_lot_id, loading_datetime, delivery_datetime)
           overriding system value values (-9501, 'recTSTSTK9501', 'TEST-STOCK-9501', 'Pending', %1$s, %5$s, %3$s, 12, -9304,
           current_date - 2, current_date - 1)$q$,
        $q$update public.national_orders set invoiced = true, invoice_number = 'TEST-ERP-61' where id = -9502$q$,
        $q$update public.national_orders set delivery_datetime = current_date + 3 where id = -9502$q$], null),
    -- Round 1b (SQL reviewer P3-3): the five codes no case reached until now, one case each.
    -- 62: a lot without pallets (an order to the warehouse with no pallet count) is never marked.
    ('62', 'lot_empty', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %4$s)$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    -- 63: a piece of lot A is marked as a lot itself.
    ('63', 'lot_is_piece', array['IP:-9101,-9301,5,Pending',
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9101)$q$], null),
    -- 64: lot B's source becomes a piece of lot A (the guard speaks before the no-money CHECK).
    ('64', 'piece_is_lot', array[$q$update public.orders set stock_lot_id = -9301 where id = -9002$q$], null),
    -- 65: a piece of lot B is deleted, the empty lot B is unmarked, then the piece is revived.
    ('65', 'lot_missing', array['IP:-9101,-9302,5,Pending',
        $q$update public.orders set deleted_at = now() where id = -9101$q$,
        $q$update public.stock_lots set deleted_at = now() where id = -9302$q$,
        $q$update public.orders set deleted_at = null where id = -9101$q$], null),
    -- 66: a deleted order is marked as a lot.
    ('66', 'lot_source_missing', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %4$s, 10)$q$,
        $q$update public.orders set deleted_at = now() where id = -9006$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    -- Round 2, P3 (3): the national raise sites (and lot_empty's international source save).
    -- 67: a national order without pallets is never marked (stock_guard_lots, national branch).
    ('67', 'lot_empty', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, price, loading_datetime, delivery_datetime)
           overriding system value values (-9502, 'recTSTSTK9502', 'TEST-STOCK-NLOT', 'Pending', %1$s, %3$s, %5$s, 500,
           current_date, current_date + 1)$q$,
        $q$insert into public.stock_lots (id, nat_order_id) values (-9304, -9502)$q$], null),
    -- 68: a national lot source saved with 0 pallets (stock_guard_natl, LOT SOURCE).
    ('68', 'lot_empty', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, pallets, price, loading_datetime, delivery_datetime)
           overriding system value values (-9502, 'recTSTSTK9502', 'TEST-STOCK-NLOT', 'Pending', %1$s, %3$s, %5$s, 12, 500,
           current_date, current_date + 1)$q$,
        $q$insert into public.stock_lots (id, nat_order_id) values (-9304, -9502)$q$,
        $q$update public.national_orders set pallets = 0 where id = -9502$q$], null),
    -- 69: an international lot source (not yet delivered) saved with 0 pallets (stock_guard_orders, LOT SOURCE).
    ('69', 'lot_empty', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %4$s, 10)$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$,
        $q$update public.orders set loading_pallets_1 = 0 where id = -9006$q$], null),
    -- 70: a national piece of lot A is marked as a lot itself.
    ('70', 'lot_is_piece', array['NP:-9501,-9301,5,Pending',
        $q$insert into public.stock_lots (id, nat_order_id) values (-9305, -9501)$q$], null),
    -- 71: a national lot source becomes a piece of lot A (the guard speaks before the no-money CHECK).
    ('71', 'piece_is_lot', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, pallets, price, loading_datetime, delivery_datetime)
           overriding system value values (-9502, 'recTSTSTK9502', 'TEST-STOCK-NLOT', 'Pending', %1$s, %3$s, %5$s, 12, 500,
           current_date, current_date + 1)$q$,
        $q$insert into public.stock_lots (id, nat_order_id) values (-9304, -9502)$q$,
        $q$update public.national_orders set stock_lot_id = -9301 where id = -9502$q$], null),
    -- 72: a national piece of lot B is deleted, the empty lot B is unmarked, then the piece is revived.
    ('72', 'lot_missing', array['NP:-9501,-9302,5,Pending',
        $q$update public.national_orders set deleted_at = now() where id = -9501$q$,
        $q$update public.stock_lots set deleted_at = now() where id = -9302$q$,
        $q$update public.national_orders set deleted_at = null where id = -9501$q$], null),
    -- 73 (round 3): the lot PRICE freezes with the client invoice (OWNER-Q4 answered 4/10 (open until
    -- invoice)) — the warehouse charge does not (P19). 74 — a negative charge (CHECK).
    ('73', 'lot_invoiced', array['IP:-9101,-9301,33,Delivered',
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-73' where id = -9001$q$,
        $q$update public.orders set price = 3400 where id = -9001$q$], null),
    ('74', 'stock_lots_charge_nonneg', array[$q$update public.stock_lots set warehouse_charge = -1 where id = -9301$q$], null),
    -- OWNER-Q5 answered 4/10: any location, but ONE live one — NULL / deleted destination at the four
    -- sites: intl mark (75, NULL), natl mark (76, deleted), intl source save (77, deleted), natl
    -- source save (78, NULL).
    ('75', 'lot_no_dest', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, 10)$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
    ('76', 'lot_no_dest', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, pallets, price, loading_datetime, delivery_datetime)
           overriding system value values (-9502, 'recTSTSTK9502', 'TEST-STOCK-NLOT', 'Pending', %1$s, %3$s, %9$s, 12, 500,
           current_date, current_date + 1)$q$,
        $q$insert into public.stock_lots (id, nat_order_id) values (-9304, -9502)$q$], null),
    ('77', 'lot_no_dest', array[$q$update public.orders set unloading_location_1_id = %9$s where id = -9001$q$], null),
    ('78', 'lot_no_dest', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, pallets, price, loading_datetime, delivery_datetime)
           overriding system value values (-9502, 'recTSTSTK9502', 'TEST-STOCK-NLOT', 'Pending', %1$s, %3$s, %5$s, 12, 500,
           current_date, current_date + 1)$q$,
        $q$insert into public.stock_lots (id, nat_order_id) values (-9304, -9502)$q$,
        $q$update public.national_orders set delivery_location_1_id = null where id = -9502$q$], null),
    -- 79 (round 3): the price of an invoiced NATIONAL lot source freezes too (stock_guard_natl).
    ('79', 'lot_invoiced', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, pallets, price, loading_datetime, delivery_datetime)
           overriding system value values (-9502, 'recTSTSTK9502', 'TEST-STOCK-NLOT', 'Pending', %1$s, %3$s, %5$s, 12, 500,
           current_date - 3, current_date - 2)$q$,
        $q$insert into public.stock_lots (id, nat_order_id) values (-9304, -9502)$q$,
        $q$insert into public.national_orders (id, legacy_id, reference, status, client_id, pickup_location_1_id,
           delivery_location_1_id, pallets, stock_lot_id, loading_datetime, delivery_datetime)
           overriding system value values (-9501, 'recTSTSTK9501', 'TEST-STOCK-9501', 'Pending', %1$s, %5$s, %3$s, 12, -9304,
           current_date - 2, current_date - 1)$q$,
        $q$update public.national_orders set invoiced = true, invoice_number = 'TEST-ERP-79' where id = -9502$q$,
        $q$update public.national_orders set price = 600 where id = -9502$q$], null),

    -- ── Accepted paths (21) ──────────────────────────────────────────────────────────────────────
    -- P1: the form re-sends every field; only the reference changes; the lot is CLOSED.
    ('P1', 'true', array['IP:-9101,-9301,31,Delivered',
        $q$update public.stock_lots set closed_note = 'TEST: 2 χαλασμένες' where id = -9301$q$,
        $q$update public.orders set reference = 'TEST-STOCK-P1-EDIT', client_id = %1$s, direction = 'Import',
           order_type = 'International', status = 'Delivered', loading_location_1_id = %4$s, unloading_location_1_id = %3$s,
           loading_pallets_1 = 31, loading_datetime = current_date, delivery_datetime = current_date + 2,
           stock_lot_id = -9301, pallet_exchange = false, price = null, invoiced = false, invoice_number = null,
           truck_id = null, partner_id = null, group_id = null where id = -9101$q$],
        $q$select (reference = 'TEST-STOCK-P1-EDIT')::text from public.orders where id = -9101$q$),
    -- P2: same on a piece of an INVOICED lot.
    ('P2', 'true', array['IP:-9101,-9301,33,Delivered',
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-P2' where id = -9001$q$,
        $q$update public.orders set reference = 'TEST-STOCK-P2-EDIT', client_id = %1$s, direction = 'Import',
           order_type = 'International', status = 'Delivered', loading_location_1_id = %4$s, unloading_location_1_id = %3$s,
           loading_pallets_1 = 33, loading_datetime = current_date, delivery_datetime = current_date + 2,
           stock_lot_id = -9301, pallet_exchange = false, price = null, invoiced = false, invoice_number = null,
           truck_id = null, partner_id = null, group_id = null where id = -9101$q$],
        $q$select (reference = 'TEST-STOCK-P2-EDIT')::text from public.orders where id = -9101$q$),
    -- P3: re-save the lot after intake with the same pallets (and a piece already out); the form
    --     re-sends VS off and no group/match — unchanged values are never judged (lot_vs, lot_grouped).
    ('P3', 'true', array['IP:-9101,-9301,5,Pending',
        $q$update public.orders set reference = 'TEST-STOCK-LOT-A-EDIT', client_id = %1$s, direction = 'Export',
           order_type = 'International', status = 'Delivered', loading_location_1_id = %3$s, unloading_location_1_id = %4$s,
           loading_pallets_1 = 33, price = 3300.00, invoiced = false, veroia_switch = false, group_id = null,
           matched_import_id = null where id = -9001$q$],
        $q$select (reference = 'TEST-STOCK-LOT-A-EDIT')::text from public.orders where id = -9001$q$),
    -- P4: close with everything delivered; a client-sent closed_at is ignored, the DB writes now().
    ('P4', 'true', array['IP:-9101,-9301,31,Delivered',
        $q$update public.stock_lots set closed_note = 'TEST: 2 χαλασμένες', closed_at = '2000-01-01' where id = -9301$q$],
        $q$select (closed_at = now())::text from public.stock_lots where id = -9301$q$),
    -- P5: 5 + 15 + 13 delivered → complete; invoicing with an ERP number passes.
    ('P5', 'true true', array['IP:-9101,-9301,5,Delivered', 'IP:-9102,-9301,15,Delivered', 'IP:-9103,-9301,13,Delivered',
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-P5' where id = -9001$q$],
        $q$select complete || ' ' || invoiced from public.stock_v_lots where id = -9301$q$),
    -- P6: 31/33 delivered + close → 2 written off, complete, invoicing passes.
    ('P6', '2 true true', array['IP:-9101,-9301,5,Delivered', 'IP:-9102,-9301,15,Delivered', 'IP:-9103,-9301,11,Delivered',
        $q$update public.stock_lots set closed_note = 'TEST: 2 χαλασμένες' where id = -9301$q$,
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-P6' where id = -9001$q$],
        $q$select written_off_pallets || ' ' || complete || ' ' || invoiced from public.stock_v_lots where id = -9301$q$),
    -- P7 (Ε2): a lot in our own hub (360, 'Veroia Hub') feeding a NATIONAL piece.
    ('P7', '6 1 natl', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, loading_datetime, delivery_datetime)
           overriding system value values (-9003, 'recTSTSTK9003', 'TEST-STOCK-LOT-HUB', 'International', 'Import',
           'Delivered', %1$s, %3$s, %5$s, 10, current_date - 3, current_date - 1)$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9303, -9003)$q$,
        'NP:-9501,-9303,4,Pending,%1$s,%5$s'],
        $q$select remaining_pallets || ' ' || pieces || ' ' || (select piece_kind from public.stock_v_pieces where lot_id = -9303)
             from public.stock_v_lots where id = -9303$q$),
    -- P8 (Ε2): a NATIONAL order as the lot source (delivering to 360) — no assignment cost in Φ1 and
    --     no warehouse charge entered → no_charge (OWNER-Q7 answered 4/10 (same rule); with one: M12).
    ('P8', 'natl no_charge', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, pallets, price, loading_datetime, delivery_datetime)
           overriding system value values (-9502, 'recTSTSTK9502', 'TEST-STOCK-NLOT', 'Pending', %1$s, %3$s, %5$s, 12, 500,
           current_date, current_date + 1)$q$,
        $q$insert into public.stock_lots (id, nat_order_id) values (-9304, -9502)$q$],
        $q$select source_kind || ' ' || allocation_status from public.stock_v_lot_money where lot_id = -9304$q$),
    -- P9: «Επιστροφή στο απόθεμα» exactly as _wiCancelGroupMember writes it (Group ID '' — the base
    --     stores it as NULL, P10), then the loose piece can be deleted.
    ('P9', 'true', array['IP:-9101,-9301,5,Assigned',
        $q$update public.orders set group_id = 'GI-TEST|recTSTSTK9101' where id = -9101$q$,
        $q$update public.orders set group_id = '', truck_id = null, trailer_id = null, driver_id = null, partner_id = null,
           status = 'Pending' where id = -9101$q$,
        $q$update public.orders set deleted_at = now() where id = -9101$q$],
        $q$select (deleted_at is not null)::text from public.orders where id = -9101$q$),
    -- P10: a blank Group ID is stored as NULL (057 normaliser). A piece returned exactly as
    --      _wiCancelGroupMember writes it, one created with '' and one with blanks carry NO group, so
    --      the round-trip walks («cur.group_id is not null and n.group_id = cur.group_id») can never
    --      join them. Without the normaliser this reads «0 2» (-9101 and -9102 = one '' group).
    ('P10', '3 0', array['IP:-9101,-9301,5,Assigned',
        $q$update public.orders set group_id = 'GI-TEST|recTSTSTK9101' where id = -9101$q$,
        $q$update public.orders set group_id = '', truck_id = null, trailer_id = null, driver_id = null, partner_id = null,
           status = 'Pending' where id = -9101$q$,
        $q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, stock_lot_id, group_id)
           overriding system value values (-9102, 'recTSTSTK9102', 'TEST-STOCK-9102', 'International', 'Import',
           'Pending', %1$s, %4$s, %3$s, 5, -9301, '')$q$,
        $q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, stock_lot_id, group_id)
           overriding system value values (-9103, 'recTSTSTK9103', 'TEST-STOCK-9103', 'International', 'Import',
           'Pending', %1$s, %4$s, %3$s, 5, -9301, '   ')$q$],
        $q$select count(*) filter (where group_id is null) || ' '
                  || (select count(*) from public.orders a join public.orders b on b.group_id = a.group_id and b.id <> a.id
                       where a.id in (-9101, -9102, -9103))
             from public.orders where id in (-9101, -9102, -9103)$q$),
    -- P11 (C-15): a PIECE may keep Veroia Switch — only the lot source may not.
    ('P11', 'true', array['IP:-9101,-9301,5,Pending',
        $q$update public.orders set veroia_switch = true where id = -9101$q$],
        $q$select veroia_switch::text from public.orders where id = -9101$q$),
    -- P12 (round 1 D1): a piece with only a Group ID (-9101) or only an export's match (-9102) has no
    --      vehicle: on_truck false, both counted «without truck» — the same answer as the shelf.
    ('P12', '2 false,false', array['IP:-9101,-9301,5,Assigned',
        $q$update public.orders set group_id = 'GI-TEST|recTSTSTK9101' where id = -9101$q$,
        'IP:-9102,-9301,5,Assigned',
        $q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, matched_import_id)
           overriding system value values (-9004, 'recTSTSTK9004', 'TEST-STOCK-EXPORT', 'International', 'Export',
           'Pending', %2$s, %3$s, %4$s, 10, 'recTSTSTK9102')$q$],
        $q$select pieces_without_truck || ' ' || (select string_agg(on_truck::text, ',' order by piece_id)
                                                     from public.stock_v_pieces where lot_id = -9301)
             from public.stock_v_lots where id = -9301$q$),
    -- P13 (round 1 D1, critic-3 Σ-04): such loose pieces are deletable (the shelf offers [Διαγραφή]);
    --      deleting the matched one clears the export's match (order_soft_delete_unlink).
    ('P13', '2 null', array['IP:-9101,-9301,5,Assigned',
        $q$update public.orders set group_id = 'GI-TEST|recTSTSTK9101' where id = -9101$q$,
        'IP:-9102,-9301,5,Assigned',
        $q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, matched_import_id)
           overriding system value values (-9004, 'recTSTSTK9004', 'TEST-STOCK-EXPORT', 'International', 'Export',
           'Pending', %2$s, %3$s, %4$s, 10, 'recTSTSTK9102')$q$,
        $q$update public.orders set deleted_at = now() where id = -9101$q$,
        $q$update public.orders set deleted_at = now() where id = -9102$q$],
        $q$select count(*) filter (where deleted_at is not null) || ' '
                  || coalesce((select matched_import_id from public.orders where id = -9004), 'null')
             from public.orders where id in (-9101, -9102)$q$),
    -- P14 (E-04): a lot WITHOUT pieces may be cancelled.
    ('P14', 'Cancelled', array[$q$update public.orders set status = 'Cancelled' where id = -9002$q$],
        $q$select status from public.orders where id = -9002$q$),
    -- P15 (round 1 D3): pieces_moving = pieces that LEFT a warehouse whose intake is not marked. Lot A
    --      back to In Transit (not received): -9101 In Transit, loaded yesterday → counts; -9102
    --      Assigned (planned, not moving) and -9103 In Transit loading today → do not. Lot B is
    --      received → 0, although its piece -9104 left yesterday. Expected «1 0» (lot A, lot B).
    ('P15', '1 0', array[$q$update public.orders set status = 'In Transit' where id = -9001$q$,
        'IP:-9101,-9301,5,In Transit', 'IP:-9102,-9301,5,Assigned', 'IP:-9103,-9301,5,In Transit',
        'IP:-9104,-9302,5,In Transit',
        $q$update public.orders set loading_datetime = current_date - 1 where id in (-9101, -9102, -9104)$q$],
        $q$select string_agg(pieces_moving::text, ' ' order by id desc) from public.stock_v_lots where id in (-9301, -9302)$q$),
    -- P16 (round 2): the warehouse charge is editable on a CLOSED lot that is not invoiced, and the same
    --      value re-sent after the invoice is no change (the Worker may re-PATCH it) — closed_at kept.
    ('P16', '50.00 true', array['IP:-9101,-9301,31,Delivered',
        $q$update public.stock_lots set closed_note = 'TEST: 2 χαλασμένες' where id = -9301$q$,
        $q$update public.stock_lots set warehouse_charge = 50 where id = -9301$q$,
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-P16' where id = -9001$q$,
        $q$update public.stock_lots set warehouse_charge = 50 where id = -9301$q$],
        $q$select warehouse_charge || ' ' || (closed_at is not null) from public.stock_lots where id = -9301$q$),
    -- P19 (round 3, OWNER-Q4b answered 4/10 (warehouse charge open after invoice)): the warehouse
    --      bills after the client invoice — the owner enters 120 on the invoiced lot A, the net is
    --      recomputed (3300 − 300 − 120 = 2880.00) and the one 33-pallet piece earns all of it.
    ('P19', 'ok invoiced 420.00 2880.00 2880.00', array['IP:-9101,-9301,33,Delivered',
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-P19' where id = -9001$q$,
        $q$update public.stock_lots set warehouse_charge = 120 where id = -9301$q$],
        $q$select m.allocation_status || ' ' || case when l.invoiced then 'invoiced' else 'open' end || ' ' || m.charge_total
                  || ' ' || m.net || ' ' || (select amount from public.stock_v_lot_alloc where piece_id = -9101)
             from public.stock_v_lot_money m join public.stock_v_lots l on l.id = m.lot_id where m.lot_id = -9301$q$),
    -- P20 (round 4): the lot price lock lives in the LOT SOURCE branch (a live anchor) and must never
    --      reach an ordinary order — an invoiced order that is no lot still takes a price fix (043 allows
    --      it while the price stays > 0 with an ERP number).
    ('P20', '1100.00 true', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, price, invoiced, invoice_number)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Delivered', %1$s, %3$s, %4$s, 10, 1000.00, true, 'TEST-ERP-P20')$q$,
        $q$update public.orders set price = 1100.00 where id = -9006$q$],
        $q$select price || ' ' || invoiced from public.orders where id = -9006$q$),
    -- P21 (round 4): the order form re-sends every field — the UNCHANGED price of an invoiced lot source
    --      (written without decimals, numerically equal) is no change and passes.
    ('P21', 'TEST-STOCK-P21 true', array['IP:-9101,-9301,33,Delivered',
        $q$update public.orders set invoiced = true, invoice_number = 'TEST-ERP-P21' where id = -9001$q$,
        $q$update public.orders set price = 3300, reference = 'TEST-STOCK-P21' where id = -9001$q$],
        $q$select reference || ' ' || (price = 3300.00) from public.orders where id = -9001$q$),
    -- P17 / P18 (OWNER-Q5 answered 4/10 (any location can be a warehouse)): a lot to an UNTYPED
    --      location and to a 'Client Depot' location are marked — no type is a condition any more.
    ('P17', 'untyped', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %8$s, 10)$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$],
        $q$select coalesce(w.type, 'untyped') from public.stock_v_lots l join public.locations w on w.id = l.warehouse_location_id
            where l.id = -9305$q$),
    ('P18', 'Client Depot', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %3$s, %7$s, 10)$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$],
        $q$select coalesce(w.type, 'untyped') from public.stock_v_lots l join public.locations w on w.id = l.warehouse_location_id
            where l.id = -9305$q$),

    -- ── Money (20, Ε1) — lot A: price 3300, warehouse rate 300, 33 pallets → net 3000.00 ─────────
    ('M1', '454.55/1363.63/1181.82 Σ3000.00 net 3000.00 in_stock 0.00',
        array['IP:-9101,-9301,5,Pending', 'IP:-9102,-9301,15,Pending', 'IP:-9103,-9301,13,Pending'],
        $q$select string_agg(a.amount::text, '/' order by a.seq) || ' Σ' || sum(a.amount) || ' net ' || max(m.net)
                  || ' in_stock ' || max(m.in_stock_amount)
             from public.stock_v_lot_alloc a join public.stock_v_lot_money m on m.lot_id = a.lot_id
            where a.lot_id = -9301$q$),
    ('M2', 'allocated 1818.18 in_stock 1181.82',
        array['IP:-9101,-9301,5,Pending', 'IP:-9102,-9301,15,Pending'],
        $q$select 'allocated ' || allocated_amount || ' in_stock ' || in_stock_amount
             from public.stock_v_lot_money where lot_id = -9301$q$),
    ('M3', 'Σ2818.18 written_off 181.82 in_stock 0.00 pallets 2',
        array['IP:-9101,-9301,5,Delivered', 'IP:-9102,-9301,15,Delivered', 'IP:-9103,-9301,11,Delivered',
              $q$update public.stock_lots set closed_note = 'TEST: 2 χαλασμένες' where id = -9301$q$],
        $q$select 'Σ' || (select sum(amount) from public.stock_v_lot_alloc where lot_id = -9301)
                  || ' written_off ' || written_off_amount || ' in_stock ' || in_stock_amount
                  || ' pallets ' || written_off_pallets
             from public.stock_v_lot_money where lot_id = -9301$q$),
    -- M4 (round 2 case 2): our own truck carried lot B in (no assignment) and no warehouse charge was
    --     entered → no_charge: no allocation, today's rule (no row in stock_v_rt_amounts).
    ('M4', 'no_charge rows=0', array['IP:-9101,-9302,5,Pending'],
        $q$select allocation_status || ' rows=' || (select count(*) from public.stock_v_rt_amounts where order_id in (-9002, -9101))
             from public.stock_v_lot_money where lot_id = -9302$q$),
    ('M5', 'no_price', array[$q$update public.orders set price = null where id = -9002$q$],
        $q$select allocation_status from public.stock_v_lot_money where lot_id = -9302$q$),
    ('M6', '-9103=1181.82 -9102=1363.63 -9101=454.55 -9001=300.00',
        array['IP:-9101,-9301,5,Pending', 'IP:-9102,-9301,15,Pending', 'IP:-9103,-9301,13,Pending'],
        $q$select string_agg(order_id || '=' || rt_amount, ' ' order by order_id)
             from public.stock_v_rt_amounts where order_id in (-9001, -9101, -9102, -9103)$q$),
    -- Round 2 «Χρέωση αποθήκης» (contract round 2 #1). Lot B = our own truck, no assignment.
    -- M7 (case 1): own-truck lot WITH a charge (200) → ok; net 2000 − 200 = 1800.00; the source's RT
    --     earns 0 (owner: «μόνο τα κομμάτια»); Σ pieces + in stock + written off = net, to the cent.
    ('M7', 'ok src=0 pieces 272.73/818.18 Σ1090.91 + 709.09 + 0.00 = 1800.00',
        array[$q$update public.stock_lots set warehouse_charge = 200 where id = -9302$q$,
              'IP:-9101,-9302,5,Pending', 'IP:-9102,-9302,15,Pending'],
        $q$select max(m.allocation_status) || ' src=' || (select rt_amount from public.stock_v_rt_amounts where order_id = -9002)
                  || ' pieces ' || string_agg(a.amount::text, '/' order by a.seq) || ' Σ' || sum(a.amount)
                  || ' + ' || max(m.in_stock_amount) || ' + ' || max(m.written_off_amount) || ' = ' || max(m.net)
             from public.stock_v_lot_alloc a join public.stock_v_lot_money m on m.lot_id = a.lot_id
            where a.lot_id = -9302$q$),
    -- M8 (case 2, the field emptied again): charge 200 entered, then cleared → no_charge again, no
    --     allocation, no RT amount (today's rule).
    ('M8', 'no_charge total=null net=null rows=0',
        array[$q$update public.stock_lots set warehouse_charge = 200 where id = -9302$q$,
              $q$update public.stock_lots set warehouse_charge = null where id = -9302$q$,
              'IP:-9101,-9302,5,Pending'],
        $q$select allocation_status || ' total=' || coalesce(charge_total::text, 'null') || ' net=' || coalesce(net::text, 'null')
                  || ' rows=' || (select count(*) from public.stock_v_rt_amounts where order_id in (-9002, -9101))
             from public.stock_v_lot_money where lot_id = -9302$q$),
    -- M9 (case 3): own-truck lot with charge 0 (the warehouse charges nothing) → ok, net = the price.
    ('M9', 'ok total=0.00 net=2000.00 piece=303.03 src=0',
        array[$q$update public.stock_lots set warehouse_charge = 0 where id = -9302$q$, 'IP:-9101,-9302,5,Pending'],
        $q$select allocation_status || ' total=' || charge_total || ' net=' || net
                  || ' piece=' || (select amount from public.stock_v_lot_alloc where piece_id = -9101)
                  || ' src=' || (select rt_amount from public.stock_v_rt_amounts where order_id = -9002)
             from public.stock_v_lot_money where lot_id = -9302$q$),
    -- M10 (case 4): partner lot + an extra charge → net = price − rate − charge = 3300 − 300 − 150; the
    --     partner RT still earns exactly its rate (margin 0) — the extra charge is in no RT.
    ('M10', '300.00 + 150.00 = 450.00 net=2850.00 src=300.00',
        array[$q$update public.stock_lots set warehouse_charge = 150 where id = -9301$q$,
              'IP:-9101,-9301,5,Pending', 'IP:-9102,-9301,15,Pending', 'IP:-9103,-9301,13,Pending'],
        $q$select partner_cost || ' + ' || warehouse_charge || ' = ' || charge_total || ' net=' || net
                  || ' src=' || (select rt_amount from public.stock_v_rt_amounts where order_id = -9001)
             from public.stock_v_lot_money where lot_id = -9301$q$),
    -- M11 (case 7): tms_reader cannot read the charge; the auditor can; tms_reader still reads the
    --     lot's other columns (id, legacy_id, closed_at). Privilege functions, not SET ROLE: the
    --     editor's postgres may not SET ROLE tms_reader (measured live 4/10).
    ('M11', 'false true true true true', array[]::text[],
        $q$select has_column_privilege('tms_reader', 'public.stock_lots', 'warehouse_charge', 'select')
                  || ' ' || has_column_privilege('tms_check_runner', 'public.stock_lots', 'warehouse_charge', 'select')
                  || ' ' || has_column_privilege('tms_reader', 'public.stock_lots', 'id', 'select')
                  || ' ' || has_column_privilege('tms_reader', 'public.stock_lots', 'legacy_id', 'select')
                  || ' ' || has_column_privilege('tms_reader', 'public.stock_lots', 'closed_at', 'select')$q$),
    -- M12 (OWNER-Q7 answered 4/10 (same rule)): a NATIONAL lot WITH a warehouse charge → ok
    --     (no assignment cost in Φ1, so the charge is the field alone): 500 − 50 = 450.00.
    ('M12', 'natl ok total=50.00 net=450.00',
        array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
           pickup_location_1_id, delivery_location_1_id, pallets, price, loading_datetime, delivery_datetime)
           overriding system value values (-9502, 'recTSTSTK9502', 'TEST-STOCK-NLOT', 'Pending', %1$s, %3$s, %5$s, 12, 500,
           current_date, current_date + 1)$q$,
              $q$insert into public.stock_lots (id, nat_order_id) values (-9304, -9502)$q$,
              $q$update public.stock_lots set warehouse_charge = 50 where id = -9304$q$],
        $q$select source_kind || ' ' || allocation_status || ' total=' || charge_total || ' net=' || net
             from public.stock_v_lot_money where lot_id = -9304$q$),
    -- M13 (round 3, Σ2-03): lot B's source HAS an assignment whose rate is empty — not «no assignment»:
    --     'no_partner_rate', no total, no allocation, even with a warehouse charge entered (that charge
    --     would otherwise allocate the net without the partner's rate, which arrives later and counts twice).
    ('M13', 'no_partner_rate true total=null rows=0',
        array[$q$insert into public.partner_assignments (id, order_id, partner_rate, status)
                 overriding system value values (-9202, -9002, null, 'Assigned')$q$,
              $q$update public.stock_lots set warehouse_charge = 200 where id = -9302$q$, 'IP:-9101,-9302,5,Pending'],
        $q$select allocation_status || ' ' || has_assignment || ' total=' || coalesce(charge_total::text, 'null')
                  || ' rows=' || (select count(*) from public.stock_v_rt_amounts where order_id in (-9002, -9101))
             from public.stock_v_lot_money where lot_id = -9302$q$),
    -- M14 (round 3, Σ2-04): a charge above the price (2500 on 2000) stays 'ok' and is allocated as it is
    --     (net = price − charge, the owner's rule) — negative; S-11 (057b) is what says so.
    ('M14', 'ok net=-500.00 piece=-75.76',
        array[$q$update public.stock_lots set warehouse_charge = 2500 where id = -9302$q$, 'IP:-9101,-9302,5,Pending'],
        $q$select allocation_status || ' net=' || net || ' piece=' || (select amount from public.stock_v_lot_alloc where piece_id = -9101)
             from public.stock_v_lot_money where lot_id = -9302$q$),
    -- OWNER-Q3 answered 4/10 (VS on piece prorated /F): the VS charge of a piece, computed exactly as
    -- both legs of ct_v_rt_revenue compute it — X by the order's direction, the pallets of the order's
    -- stock_v_pieces row, stock_vs_charge(). Printed «X × pallets/F = charge» («full» = not a piece).
    ('VS1', '650 × 15/33 = 295.45',
        array['IP:-9101,-9301,15,Pending', $q$update public.orders set veroia_switch = true where id = -9101$q$],
        $q$select k.x || ' × ' || coalesce(vp.pallets || '/' || public.ct_setting('full_truck_pallets'), 'full')
                  || ' = ' || public.stock_vs_charge(k.x, vp.pallets)
             from public.orders o
             cross join lateral (select case when o.direction = 'Export' then public.ct_setting('x_export')
                                             else public.ct_setting('x_import') end as x) k
             left join public.stock_v_pieces vp on vp.piece_kind = 'intl' and vp.piece_id = o.id
            where o.id = -9101$q$),
    ('VS2', '650 × 33/33 = 650.00',
        array['IP:-9101,-9301,33,Pending', $q$update public.orders set veroia_switch = true where id = -9101$q$],
        $q$select k.x || ' × ' || coalesce(vp.pallets || '/' || public.ct_setting('full_truck_pallets'), 'full')
                  || ' = ' || public.stock_vs_charge(k.x, vp.pallets)
             from public.orders o
             cross join lateral (select case when o.direction = 'Export' then public.ct_setting('x_export')
                                             else public.ct_setting('x_import') end as x) k
             left join public.stock_v_pieces vp on vp.piece_kind = 'intl' and vp.piece_id = o.id
            where o.id = -9101$q$),
    -- VS3: a 40-pallet piece (of a 45-pallet lot) pays the full charge, never more (capped at F).
    ('VS3', '650 × 40/33 = 650.00',
        array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, loading_datetime, delivery_datetime, price)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Delivered', %1$s, %3$s, %4$s, 45, current_date - 5, current_date - 2, 4500)$q$,
              $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$,
              'IP:-9101,-9305,40,Pending', $q$update public.orders set veroia_switch = true where id = -9101$q$],
        $q$select k.x || ' × ' || coalesce(vp.pallets || '/' || public.ct_setting('full_truck_pallets'), 'full')
                  || ' = ' || public.stock_vs_charge(k.x, vp.pallets)
             from public.orders o
             cross join lateral (select case when o.direction = 'Export' then public.ct_setting('x_export')
                                             else public.ct_setting('x_import') end as x) k
             left join public.stock_v_pieces vp on vp.piece_kind = 'intl' and vp.piece_id = o.id
            where o.id = -9101$q$),
    -- VS4: an EXPORT piece prorates the export charge (850 base).
    ('VS4', '850 × 15/33 = 386.36',
        array['IP:-9101,-9301,15,Pending',
              $q$update public.orders set direction = 'Export', veroia_switch = true where id = -9101$q$],
        $q$select k.x || ' × ' || coalesce(vp.pallets || '/' || public.ct_setting('full_truck_pallets'), 'full')
                  || ' = ' || public.stock_vs_charge(k.x, vp.pallets)
             from public.orders o
             cross join lateral (select case when o.direction = 'Export' then public.ct_setting('x_export')
                                             else public.ct_setting('x_import') end as x) k
             left join public.stock_v_pieces vp on vp.piece_kind = 'intl' and vp.piece_id = o.id
            where o.id = -9101$q$),
    -- VS5: the national leg earns what the international leg pays — the DEPLOYED ct_v_rt_revenue calls
    --      stock_vs_charge exactly twice, the international leg with vp (the leg's order) and the
    --      national Direct leg with svp (the load's source order), both joined to stock_v_pieces.
    ('VS5', '2 calls · true true true true', array[]::text[],
        $q$select (length(d) - length(replace(d, 'stock_vs_charge(', ''))) / length('stock_vs_charge(') || ' calls · '
                  || (d like '%END, vp.pallets)%') || ' ' || (d like '%END, svp.pallets)%')
                  || ' ' || (d like '%LEFT JOIN stock_v_pieces vp ON vp.piece_kind = ''intl''::text AND vp.piece_id = o.id%')
                  || ' ' || (d like '%LEFT JOIN stock_v_pieces svp ON svp.piece_kind = ''intl''::text AND svp.piece_id = so.id%')
             from (select pg_get_viewdef('public.ct_v_rt_revenue'::regclass, true) as d) v$q$),
    -- VS6: an ORDINARY VS order of 15 pallets (no lot) keeps the full charge — no stock_v_pieces row.
    ('VS6', '650 × full = 650',
        array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1, veroia_switch)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Import',
           'Pending', %1$s, %4$s, %3$s, 15, true)$q$],
        $q$select k.x || ' × ' || coalesce(vp.pallets || '/' || public.ct_setting('full_truck_pallets'), 'full')
                  || ' = ' || public.stock_vs_charge(k.x, vp.pallets)
             from public.orders o
             cross join lateral (select case when o.direction = 'Export' then public.ct_setting('x_export')
                                             else public.ct_setting('x_import') end as x) k
             left join public.stock_v_pieces vp on vp.piece_kind = 'intl' and vp.piece_id = o.id
            where o.id = -9006$q$)
    ) t(num, expect, stmts, check_sql)
  loop
    v_total := v_total + 1;
    v_txt := null;
    begin
      foreach s in array r.stmts loop
        s := format(s, c1, c2, gr, wh, hub, pt, cd, ut, dl);
        if left(s, 3) = 'IP:' then
          a := string_to_array(substr(s, 4), ',');
          s := format($x$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
                  loading_location_1_id, unloading_location_1_id, loading_pallets_1, loading_datetime, delivery_datetime,
                  stock_lot_id, partner_id, created_at)
                  overriding system value values (%s, %L, %L, 'International', 'Import', %L, %s, %s, %s, %s,
                  current_date, current_date + 2, %s, %s, now() + make_interval(secs => %s))$x$,
                  a[1], 'recTSTSTK' || abs(a[1]::bigint), 'TEST-STOCK-' || abs(a[1]::bigint), a[4],
                  coalesce(a[5], c1::text), coalesce(a[6], wh::text), gr, a[3], a[2],
                  case when a[4] in ('In Transit', 'Delivered') then pt::text else 'null' end,
                  abs(a[1]::bigint) % 1000);
        elsif left(s, 3) = 'NP:' then
          a := string_to_array(substr(s, 4), ',');
          s := format($x$insert into public.national_orders (id, legacy_id, reference, status, client_id,
                  pickup_location_1_id, delivery_location_1_id, pallets, loading_datetime, delivery_datetime,
                  stock_lot_id, created_at)
                  overriding system value values (%s, %L, %L, %L, %s, %s, %s, %s, current_date, current_date + 2, %s,
                  now() + make_interval(secs => %s))$x$,
                  a[1], 'recTSTSTK' || abs(a[1]::bigint), 'TEST-STOCK-' || abs(a[1]::bigint), a[4],
                  coalesce(a[5], c1::text), coalesce(a[6], wh::text), gr, a[3], a[2], abs(a[1]::bigint) % 1000);
        end if;
        execute s;
      end loop;
      if r.check_sql is not null then
        execute r.check_sql into v_txt;
      end if;
      raise exception using errcode = 'P0001', message = 'TEST_DONE';   -- roll this case back
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_hint = pg_exception_hint, v_con = constraint_name;
      if v_msg = 'TEST_DONE' then
        v_got := case when r.check_sql is null then 'ACCEPTED' else coalesce(v_txt, '<null>') end;
      elsif v_hint like 'stock:%' then
        v_got := substr(v_hint, 7);
      elsif coalesce(v_con, '') <> '' then
        v_got := v_con;
      else
        v_got := 'SQLSTATE ' || v_state;
      end if;
      if v_got = r.expect then
        v_ok := v_ok + 1; v_line := 'OK  ';
      else
        v_line := 'FAIL';
      end if;
      v_report := v_report || E'\n' || v_line || ' ' || r.num || ' expected ' || r.expect || ' · got ' || v_got
                  || case when v_got <> r.expect and v_msg <> 'TEST_DONE' then ' · ' || v_msg else '' end;
    end;
  end loop;

  raise exception 'RESULT: %', format('%s/%s %s', v_ok, v_total, case when v_ok = v_total then 'OK' else 'FAILED' end) || v_report;
end
$test$;
