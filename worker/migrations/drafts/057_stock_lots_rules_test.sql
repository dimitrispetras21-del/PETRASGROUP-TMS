-- 057 RULES TEST — ONE DO block that ALWAYS ends with an exception, so NOTHING it writes survives:
-- every test row, every trigger side effect (audit_log rows, leg status sync) rolls back with it.
-- Run AFTER 057 (and after 057_stock_lots_verify.sql V1–V8). Expected last line of the error panel:
--
--     RESULT: 82/82 OK
--
-- followed by one line per case («OK  01 expected over_draw · got over_draw»). Anything less = STOP,
-- copy the panel to the coordinator. 61 refusals + 15 accepted paths + 6 money cases (Ε1).
-- Cases 36–49 and P11, P14 are the round-0 rules of the impact map (4/10): E-04 cancel (36, 37, P14),
-- B-16 lot_grouped (38–43), C-15 lot_vs (44, 45, P11), C-05 piece_no_truck (46–49). 50–51: K7.
-- Round 1 of the critics (4/10): D1 «on a truck» = truck or partner (13, 52, P12, P13), Σ-08 / E2-11
-- an invoiced lot's statuses are frozen (53–55, 61), Σ-05 lot_grouped covers the rota (56–60),
-- D3 pieces_moving (P15).
--
-- HOW IT STAYS HARMLESS
--   * Test rows use NEGATIVE ids written with OVERRIDING SYSTEM VALUE: no identity sequence moves,
--     so the next real order number (#…) is not skipped. References start with TEST-STOCK-.
--   * No test row has a truck or a partner trip, so rt_create_from_order never opens a round trip
--     (RT codes come from a sequence that a rollback would not give back). A piece born In Transit
--     or Delivered must be «on a truck» (piece_no_truck; round 1 D1: a truck or a partner — a group
--     no longer counts): the IP: shorthand gives it the first live PARTNER with is_partner_trip left
--     false — rt_create_from_order opens a round trip only for a truck or a partner TRIP.
--   * Reads two live clients, one Greek non-warehouse location, 424 (warehouse after 057), 360
--     ('Veroia Hub') and one live partner; never updates a real row.
--   * Each case runs in its own sub-block and is rolled back on its own (it always ends by raising),
--     so the cases are independent of each other and of their order.
--
-- HOW A CASE PASSES
--   refusal: the error's hint is 'stock:<expected code>', or its constraint/index name is the
--            expected CHECK / unique index;
--   accepted / money: the statements pass and the check query returns exactly the expected text.
-- Shorthand in the statement lists (expanded by the runner, so the 82 cases stay readable):
--   'IP:id,lot,pallets,status[,client[,pickup]]' = an international piece (Import, to a Greek site;
--      status In Transit / Delivered → partner_id = the live partner, see above)
--   'NP:id,lot,pallets,status[,client[,pickup]]' = a national piece
--   defaults: client = first client, pickup = 424. %1$s..%6$s = client 1, client 2, Greek site, 424, 360,
--   the live partner.
-- Base fixtures (built once, before the cases): lot A = order -9001 (33p, Delivered at 424, price
-- 3300.00, warehouse partner assignment 300.00 'Assigned') anchored as -9301; lot B = order -9002
-- (33p, Delivered at 424, price 2000.00, NO partner assignment) anchored as -9302.

do $test$
declare
  c1 bigint; c2 bigint; gr bigint; pt bigint;
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
  if c1 is null or c2 is null or gr is null or pt is null or to_regclass('public.stock_lots') is null
     or not public.stock_is_warehouse(wh) or not public.stock_is_warehouse(hub) then
    raise exception 'RESULT: 0/82 — SETUP FAILED: run 057 first (needs 2 clients, a Greek site, a partner, 424 + 360 as warehouses)';
  end if;

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
    -- ── Refusals (61) ───────────────────────────────────────────────────────────────────────────
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
    ('18', 'warehouse_rule', array[$q$insert into public.orders (id, legacy_id, reference, order_type, direction, status, client_id,
           loading_location_1_id, unloading_location_1_id, loading_pallets_1)
           overriding system value values (-9006, 'recTSTSTK9006', 'TEST-STOCK-9006', 'International', 'Export',
           'Pending', %1$s, %4$s, %3$s, 10)$q$,
        $q$insert into public.stock_lots (id, order_id) values (-9305, -9006)$q$], null),
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
    -- C-15 (OWNER-Q1 default): no Veroia Switch on a lot source — at the mark (44), on its save (45).
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

    -- ── Accepted paths (15) ──────────────────────────────────────────────────────────────────────
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
    -- P8 (Ε2): a NATIONAL order as the lot source (delivering to 360) — no intake cost in Φ1.
    ('P8', 'natl no_intake_cost', array[$q$insert into public.national_orders (id, legacy_id, reference, status, client_id,
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

    -- ── Money (6, Ε1) — price 3300, warehouse rate 300, 33 pallets → net 3000.00 ─────────────────
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
    ('M4', 'no_intake_cost rows=0', array['IP:-9101,-9302,5,Pending'],
        $q$select allocation_status || ' rows=' || (select count(*) from public.stock_v_rt_amounts where order_id in (-9002, -9101))
             from public.stock_v_lot_money where lot_id = -9302$q$),
    ('M5', 'no_price', array[$q$update public.orders set price = null where id = -9002$q$],
        $q$select allocation_status from public.stock_v_lot_money where lot_id = -9302$q$),
    ('M6', '-9103=1181.82 -9102=1363.63 -9101=454.55 -9001=300.00',
        array['IP:-9101,-9301,5,Pending', 'IP:-9102,-9301,15,Pending', 'IP:-9103,-9301,13,Pending'],
        $q$select string_agg(order_id || '=' || rt_amount, ' ' order by order_id)
             from public.stock_v_rt_amounts where order_id in (-9001, -9101, -9102, -9103)$q$)
    ) t(num, expect, stmts, check_sql)
  loop
    v_total := v_total + 1;
    v_txt := null;
    begin
      foreach s in array r.stmts loop
        s := format(s, c1, c2, gr, wh, hub, pt);
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
