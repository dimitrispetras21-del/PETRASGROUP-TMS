-- RULES TEST 072b (vehicle handover at a point): every case on TEST rows, then undone.
-- Runs AFTER 072b said "072b OK". At build time on the PGlite copy (tms-auditor/test/plan-072b.test.mjs). On
-- production it is OPTIONAL, after 15:00, with an explicit yes: it writes TEST rows (locations, partners, trucks,
-- drivers, a client, one VS import order with its stops, two national orders with their shipments and pieces, v5
-- cycles, segments, payroll lines, cost lines, notices, audit rows)
-- and undoes ALL of them with a deliberate final error. Only trace: identity and code sequences advance.
-- ONE statement. The red error message IS the result:
--   "RULES TEST 072b finished - EVERYTHING UNDONE, nothing kept. Result: <N> OK, 0 FAIL || ...".
-- Any FAIL or ERROR = STOP, copy the panel to the coordinator.
-- Each case: build S (R1 = OWNED v5 cycle, truck 1 / driver 1, day D 06:00 -> D+1 14:00: stops A 06-08, Veroia 09-10,
-- B 12-14 KATHODOS and C D+1 12-14 ANODOS; R2 = truck 2 / driver 2 on D+2; written directly, as 072's S: the INSERT of
-- the cycle seeds its first segment), make the case's calls, read the verdict, undo (marker exception).
-- want[k] = 'ok' (the verdict must start with ok), 'plan:<code>' (the HINT), 'con:<constraint>' or 'state:<SQLSTATE>'.
-- ASCII only. Test ids: legacy_id rec072bT..., names "TEST 072b ...", plates TEST-072b-..., actor test:072b,
-- day D = Athens today + 50.
DO $t072b$
DECLARE
  td date; d date; e date; f date; k int;
  hub bigint; la bigint; lb bigint; lc bigint; pa bigint; pa2 bigint;
  trk1 bigint; trk2 bigint; trk3 bigint; trk4 bigint; drv1 bigint; drv2 bigint; drv3 bigint;
  vso bigint; vs_b bigint; x bigint; y bigint; z bigint;
  rt1 bigint; rt2 bigint; rt3 bigint; s1a bigint; s1h bigint; s1b bigint; s1c bigint;
  t0800 timestamptz; t0830 timestamptz; t0930 timestamptz; t1000 timestamptz; t1430 timestamptz; t1500 timestamptz;
  t1600 timestamptz; e1000 timestamptz;
  g1 bigint; g2 bigint; g3 bigint; n0 bigint; n1 bigint; j0 jsonb; j1 jsonb; r jsonb; r2 jsonb; tok text; m text;
  veh2 jsonb; veh3 jsonb; t1300 timestamptz; t1100 timestamptz; t1200 timestamptz;
  ld bigint; cl1 bigint; nk bigint; na bigint; pk bigint; pn bigint; e0900 timestamptz; e1500 timestamptz; e1600 timestamptz;
  j2 jsonb; rl text;
  want text[] := ARRAY[
    NULL
    , 'ok'               -- 1 the INSERT of a cycle seeds ONE segment over its window; the copy = it; no label
    , 'ok'               -- 2 a handover at 14:30: [A][T], A ends at 14:30, labels, one create row with reason/point/time/person
    , 'ok'               -- 3 a second handover inside A: [A][E][T], T byte for byte the same
    , 'ok'               -- 4 same driver: the new segment keeps driver 1, another truck
    , 'plan:bad_input'   -- 5 no point (place_note)
    , 'plan:bad_input'   -- 6 same driver AND a driver_id
    , 'plan:seg_time'    -- 7 at = start_at
    , 'plan:seg_time'    -- 8 at = end_at
    , 'plan:seg_time'    -- 9 before the cycle
    , 'plan:truck_busy'  -- 10 the new truck is in another cycle from the handover on
    , 'ok'               -- 11 truck_busy names the other cycle's RT code
    , 'plan:driver_busy' -- 12 the new driver is in another cycle from the handover on
    , 'ok'               -- 13 owner's example: 2104 in R1 until 14:30, in another cycle from 15:00 = accepted
    , 'plan:truck_busy'  -- 14 the same from 14:00 (overlap 14:00-14:30) = the EXCLUDE on the segments
    , 'con:seg_reason_list' -- 15 an unknown reason (23514)
    , 'con:seg_other_note'  -- 16 other without a note
    , 'ok'               -- 17 other with a note
    , 'plan:seg_copy'    -- 18 a direct UPDATE of the cycle's truck on model=2 is refused at COMMIT
    , 'plan:seg_not_v2'  -- 19 a segment on a model=1 round trip
    , 'plan:seg_none'    -- 20 a v5 cycle without a live segment
    , 'plan:seg_cover'   -- 21 a gap between two segments
    , 'plan:hard_delete' -- 22 a hard DELETE of a segment
    , 'plan:seg_first'   -- 23 a reason on the first segment
    , 'ok'               -- 24 the first and last stop move: the edges of the first and last segment follow in the same call
    , 'plan:need_token'  -- 25 a stop move that would end the cycle before a handover, without the token (owner q. 7 = b): refused before any write
    , 'ok'               -- 26 four segments (three handovers) pass every rule
    , 'ok'               -- 27 a handover yesterday, now and tomorrow (recorded after, on time, planned)
    , 'ok'               -- 28 OWNED -> PARTNER -> PARTNER -> OWNED, each with its own rate
    , 'ok'               -- 29 correction of the time: the segment before follows, no gap
    , 'plan:seg_time'    -- 30 correction of the time outside its neighbours
    , 'plan:vehicle_clear_use_clear' -- 31 correction that empties the truck
    , 'plan:seg_first'   -- 32 correction of the first segment's time
    , 'ok'               -- 33 removal of E: [A][T], A takes E's end; empty list, no token
    , 'ok'               -- 34 removal of the last: [A], A to the end, no label
    , 'plan:seg_first'   -- 35 removal of the first
    , 'ok'               -- 36 removal of a segment whose driver's line has an amount: list, month, token; no amount for the dispatcher
    , 'plan:need_token'  -- 37 the same without the token
    , 'ok'               -- 38 the same with the token: done, the line goes (soft), 0 needs_review
    , 'ok'               -- 39 removal of a segment whose truck has DKV lines: listed, lines stay, one notice
    , 'plan:payroll_locked' -- 40 correction of the driver of a segment whose line has an amount
    , 'ok'               -- 41 a handover to another driver keeps the first driver's line and amount
    , 'ok'               -- 42 clear assignment of [A][E][T]: one segment without assignment, the cycle empty
    , 'plan:seg_many'    -- 43 plan_rt_update of the vehicle on a cycle with a handover
    , 'ok'               -- 44 plan_rt_update of the vehicle on a cycle of one segment: as 072, the copy follows
    , 'ok'               -- 45 handover, correction, removal: stops, legs, pieces, shipments, locations unchanged
    , 'ok'               -- 46 decision 44: the same request_id again = the first answer, one segment
    , 'plan:request_reused' -- 47 the same request_id with another body
    , 'plan:request_missing' -- 48 a handover without request_id
    , 'ok'               -- 49 the dry run lists the segments after and keeps nothing
    , 'ok'               -- 50 the dry run of a busy truck shows the conflict and keeps nothing
    , 'plan:seg_same'    -- 51 a handover to the same vehicle
    , 'plan:seg_unassigned' -- 52 a handover on a cycle without assignment (assign it first)
    , 'ok'               -- 53 VS through Veroia at 09:00, handover at 08:30: "follows" shows truck 2
    , 'ok'               -- 54 VS through Veroia at 09:00, handover at 09:30: "follows" shows truck 1
    , 'ok'               -- 55 the board carries the segments with their labels
    , 'plan:driver_busy' -- 56 a local loading by the driver of the segment that holds the stop
    , 'ok'               -- 57 v_rt_vehicle_windows: one row per owned segment, today's round trips as they are
    , 'ok'               -- 58 the two delay codes of 067 are reasons here too
    , 'ok'               -- 59 correction of the first segment's truck: the copy and 011 follow
    , 'plan:seg_unassigned' -- 60 a segment without a vehicle in a cycle with a handover
    , 'plan:seg_cancel'  -- 61 a segment marked cancelled on a live cycle
    , 'ok'               -- 62 a cancelled cycle: its segments follow and free the truck
    , 'plan:seg_locked'  -- 63 a segment moved to another cycle
    , 'ok'               -- 64 the dispatcher's list has no amount; the token is the same for every role
    , 'plan:seg_gone'    -- 65 correction of a removed segment
    , 'ok'               -- 66 the card's history: every act leaves its audit rows by the person
    , 'plan:seg_reason'  -- 67 a later segment without a reason (written past plan_seg_change)
    , 'plan:rt_gone'     -- 68 a handover on a cycle that does not exist
    , 'plan:rt_cancelled' -- 69 a handover on a cancelled cycle
    , 'plan:stale_confirm' -- 70 the payroll amount changed after the removal's list
    , 'plan:seg_no_vehicle' -- 71 a handover to OWNED without a truck
    , 'plan:seg_no_vehicle' -- 72 a handover to PARTNER without a partner
    -- review R1 (25/10): finding 2 (the v1 warning and next_rt read the segments, not the ARCHIKO's copy)
    , 'ok'               -- 73 plan_rt_update after a handover: v1 of the TELIKO's truck warned, of the ARCHIKO's (gone at 14:30) not
    , 'ok'               -- 74 plan_seg_fix of the TELIKO's truck to one with a today's round trip: warned
    , 'ok'               -- 75 plan_seg_remove: the ARCHIKO's truck now drives to the end: its today's round trip warned
    , 'ok'               -- 76 plan_rt_update preview next_rt: the next cycle of the LAST segment's vehicle
    -- finding 3 (one rule "which segment executes a stop"; a stop that changes executor is said)
    , 'ok'               -- 77 a stop moved past the handover: seg_stop_moved (stop, segment before -> after)
    , 'ok'               -- 78 a stop whose window holds the handover time: seg_stop_straddles, not moved
    , 'ok'               -- 79 a handover inside a stop's window: seg_stop_straddles in plan_seg_change's answer
    , 'ok'               -- 80 the board's segments carry the stops each one executes (stop_ids)
    , 'ok'               -- 81 plan_seg_fix moves the handover before a stop: seg_stop_moved
    -- finding 7 (the removal's preview runs the busy check; a lost answer is a replay, not a false gone)
    , 'ok'               -- 82 the removal's dry run shows truck_busy of the longer segment, list and token, nothing kept
    , 'plan:truck_busy'  -- 83 the same removal for real
    , 'ok'               -- 84 the same person removes the same segment again: the same ok, replayed
    , 'plan:seg_gone'    -- 85 another person removes a removed segment
    -- finding 5 (the stop at the handover time belongs to the new segment, one rule)
    , 'plan:driver_busy' -- 86 a local loading by the new driver at a stop that starts at the handover time
    -- review R2 (25/10), DB finding 1, and owner question 7 = (b), 25/10: an act that narrows the cycle past a handover
    -- lists it (seg_removed) and removes it after the token
    , 'ok'               -- 87 Move (warehouse) of the ANODOS load to waiting: the dry run lists the handover, the token removes it, the ARCHIKO to the new end
    , 'ok'               -- 88 Delete (dispatcher) of that order: the dry run lists the handover with the token, the execution removes it
    , 'ok'               -- 89 plan_order_update of the order on a cycle with a handover: no stop moves, passes
    , 'ok'               -- 90 plan_put_pieces that widens the cycle past its end: the TELIKO follows to the new end
    , 'ok'               -- 91 a first stop moved later than the handover (owner, the start side): the ARCHIKO goes, the next becomes it
    -- DB finding 2: the payroll lock per segment = the driver LEAVES the cycle (one predicate with the removal's list)
    , 'ok'               -- 92 same driver: the TELIKO's driver corrected while the ARCHIKO's line has an amount: passes, the line stays
    -- DB finding 4: the stops that change hands are said by the removal too (the change: case 2)
    , 'ok'               -- 93 removal: the preview and the answer name the stops that pass to the vehicle before (seg_stop_moved)
    -- spec review R2, E3 / E6: gaps of the checks
    , 'ok'               -- 94 R-34: the three acts refuse without a person (plan:no_actor)
    , 'ok'               -- 95 R-25/R-29: a correction to a truck busy in another cycle = truck_busy with its RT code
    , 'ok'               -- 96 R-25/R-29: a correction to a driver busy in another cycle = driver_busy with its RT code
    , 'ok'               -- 97 R-29: a handover to a busy driver = driver_busy with the other cycle's RT code
    , 'plan:bad_input'   -- 98 R-19: no time (at)
    , 'plan:bad_input'   -- 99 R-19: no reason
    , 'plan:bad_input'   -- 100 R-19: no vehicle
    , 'ok'               -- 101 R-40: the accountant's list has the amounts (the dispatcher's has none: case 64)
    , 'ok'               -- 102 R-47 [B]: revenue, km and the P&L row of the cycle are the same before and after handover, correction, removal
    -- review R3 (25/10), DB finding 2: ONE segment per edge (an edge that passes exactly through a handover time in one call)
    , 'ok'               -- 103 the two ANODOS stops swapped in one plan_rt_update: the end is the handover time for a moment; ok, said
    , 'ok'               -- 104 the first stop and the hub swapped in one plan_rt_update: the start is the handover time for a moment; ok,
                         --     and the copy never flips to the TELIKO's driver (no false needs_review on a line with an amount)
    -- DB finding 1: a side shift never moves a handover (fixed in time, plan H-23)
    , 'ok'               -- 105 ANODOS +1 day after a planned change: the handover stays, the stop before it passes to the TELIKO, said
    , 'ok'               -- 106 ANODOS -6 hours (management): the cycle ends before the handover: listed, removed with the token (-1 day here = stop_order)
    , 'ok'               -- 107 ANODOS +3 hours: the handover stays, the stop before it passes to the TELIKO, said
    -- DB finding 5: every handover left outside, in time order
    , 'ok'               -- 108 a stop move that ends the cycle before two handovers (accountant): two lines, both removed with one token
    -- owner question 7 = (b), 25/10: the token, the roles, the payroll line, the net
    , 'plan:stale_confirm' -- 109 plan_rt_update with the token of another change
    , 'ok'               -- 110 Move of the KATHODOS load (the start side): the ARCHIKO's line with an amount listed (no amount for the dispatcher), gone after the token, 0 needs_review
    , 'plan:seg_outside' -- 111 the net: a write outside plan_* that ends the cycle before two handovers = seg_outside with both times
    , 'ok'               -- 112 Move (the start side) by each of the 5 roles: the line, amounts only to owner / accountant, one token, removed with the role in the history
    , 'ok'               -- 113 plan_rt_update by each of the 5 roles: the same
    , 'ok'               -- 114 Delete by owner and dispatcher (decision 26): the same
    , 'ok'               -- 115 a plan_rt_update that leaves every handover inside: 072's dry-run answer (no list keys), no token needed
    , 'ok'               -- 116 Move of a cycle's last load while a stop without a leg stays: the cycle is cancelled, its handover listed and removed
    -- review R5 (both critics): no exception to the owner's answer, and the list = the execution
    , 'ok'               -- 117 Move (warehouse) of the ANODOS load to the KATHODOS of its OWN cycle: the target is a source too, listed, removed after the token
    , 'plan:bad_input'   -- 118 plan_rt_update that names one stop twice ([narrow, restore]): refused before the list, never a list the execution breaks
    -- review R6 (DB findings 1, 2): the list follows the stops the put really uses; the narrowing from the start too
    , 'ok'               -- 119 the Move of 117 that also names the old C by stop_id, which the put does not use (the new C wins on the target side): swept, so listed and removed after the token - never a token the net refuses
    , 'ok'               -- 120 Move (management) of the KATHODOS load to the ANODOS of its OWN cycle, narrowing from the START past the handover: the ARCHIKO listed and removed, the next becomes the ARCHIKO, the copy and the payroll line follow driver 2, 0 needs_review
    -- @want (one line per case: "    , '<ok|plan:code|con:name|state:XXXXX>'  -- <k> <what>")
  ]::text[];
  verdict text; got text; hint text; msg text; cname text; st text;
  ok int := 0; bad int := 0; res text[] := '{}';
BEGIN
  want := want[2:];   -- drop the leading NULL that keeps every want line in the same ", '...'" shape
  IF to_regprocedure('public.plan_seg_change(jsonb,text,text)') IS NULL THEN
    RAISE EXCEPTION 'RULES TEST 072b: 072b is not applied - nothing to test';
  END IF;
  IF EXISTS (SELECT 1 FROM locations WHERE legacy_id LIKE 'rec072bT%') OR EXISTS (SELECT 1 FROM orders WHERE legacy_id LIKE 'rec072bT%')
     OR EXISTS (SELECT 1 FROM trucks WHERE license_plate LIKE 'TEST-072b-%')
     OR EXISTS (SELECT 1 FROM drivers WHERE full_name LIKE 'TEST 072b %')
     OR EXISTS (SELECT 1 FROM partners WHERE company_name LIKE 'TEST 072b %')
     OR EXISTS (SELECT 1 FROM clients WHERE company_name LIKE 'TEST 072b %')
     OR EXISTS (SELECT 1 FROM national_orders WHERE legacy_id LIKE 'rec072bT%') THEN
    RAISE EXCEPTION 'RULES TEST 072b: test ids (rec072bT..., TEST 072b ..., TEST-072b-...) already exist - stop';
  END IF;

  -- Fixture (undone by the final error).
  td := (now() AT TIME ZONE 'Europe/Athens')::date; d := td + 50; e := d + 1; f := d + 2;
  t0800 := (d + time '08:00') AT TIME ZONE 'Europe/Athens'; t0830 := (d + time '08:30') AT TIME ZONE 'Europe/Athens';
  t0930 := (d + time '09:30') AT TIME ZONE 'Europe/Athens'; t1000 := (d + time '10:00') AT TIME ZONE 'Europe/Athens';
  t1430 := (d + time '14:30') AT TIME ZONE 'Europe/Athens'; t1500 := (d + time '15:00') AT TIME ZONE 'Europe/Athens';
  t1600 := (d + time '16:00') AT TIME ZONE 'Europe/Athens'; e1000 := (e + time '10:00') AT TIME ZONE 'Europe/Athens';
  t1300 := (d + time '13:00') AT TIME ZONE 'Europe/Athens'; t1100 := (d + time '11:00') AT TIME ZONE 'Europe/Athens';
  t1200 := (d + time '12:00') AT TIME ZONE 'Europe/Athens';
  e0900 := (e + time '09:00') AT TIME ZONE 'Europe/Athens'; e1500 := (e + time '15:00') AT TIME ZONE 'Europe/Athens';
  e1600 := (e + time '16:00') AT TIME ZONE 'Europe/Athens';
  SELECT id INTO hub FROM locations WHERE is_hub;
  INSERT INTO locations (legacy_id, name) VALUES ('rec072bTA', 'TEST 072b A') RETURNING id INTO la;
  INSERT INTO locations (legacy_id, name) VALUES ('rec072bTB', 'TEST 072b B') RETURNING id INTO lb;
  INSERT INTO locations (legacy_id, name) VALUES ('rec072bTC', 'TEST 072b C') RETURNING id INTO lc;
  INSERT INTO locations (legacy_id, name) VALUES ('rec072bTD', 'TEST 072b D') RETURNING id INTO ld;
  INSERT INTO clients (company_name) VALUES ('TEST 072b client') RETURNING id INTO cl1;
  INSERT INTO partners (company_name) VALUES ('TEST 072b partner 1') RETURNING id INTO pa;
  INSERT INTO partners (company_name) VALUES ('TEST 072b partner 2') RETURNING id INTO pa2;
  INSERT INTO trucks (license_plate) VALUES ('TEST-072b-2104') RETURNING id INTO trk1;
  INSERT INTO trucks (license_plate) VALUES ('TEST-072b-2108') RETURNING id INTO trk2;
  INSERT INTO trucks (license_plate) VALUES ('TEST-072b-3') RETURNING id INTO trk3;
  INSERT INTO trucks (license_plate) VALUES ('TEST-072b-4') RETURNING id INTO trk4;
  INSERT INTO drivers (full_name) VALUES ('TEST 072b Giorgos') RETURNING id INTO drv1;
  INSERT INTO drivers (full_name) VALUES ('TEST 072b Nikos') RETURNING id INTO drv2;
  INSERT INTO drivers (full_name) VALUES ('TEST 072b driver 3') RETURNING id INTO drv3;
  -- a VS import: loads abroad at C, Veroia day D, delivered at B on D
  INSERT INTO orders (legacy_id, order_type, direction, status, veroia_switch, loading_datetime, delivery_datetime,
                      cross_dock_date, reference, client_id)
  VALUES ('rec072bTO1', 'International', 'Import', 'Pending', true, d - 3, d, d, 'WN072b-TEST', NULL) RETURNING id INTO vso;
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec072bTS1', 'Loading', 1, d - 3, vso, lc, 10);
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec072bTS2', 'Cross-dock', 1, d, vso, hub, 10);
  INSERT INTO order_stops (legacy_id, stop_type, stop_number, datetime, order_id, location_id, pallets)
  VALUES ('rec072bTS3', 'Unloading', 1, d, vso, lb, 10) RETURNING id INTO vs_b;
  -- two national orders (review R2, DB finding 1): K = A -> B on D (KATHODOS of R1), N = C -> D on D+1 (ANODOS of
  -- R1, a new stop D 15:00-16:00). Their pieces wait; a case puts them on R1 with plan_put_pieces.
  INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, goods, temperature_c)
  VALUES ('rec072bTN1', cl1, 'WN072b-TEST', 100, 10, 'TEST', 2) RETURNING id INTO nk;
  INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                         deliver_from, deliver_to, created_by)
  VALUES (nk, la, lb, 10, (d + time '06:00') AT TIME ZONE 'Europe/Athens', t0800, t1200,
          (d + time '14:00') AT TIME ZONE 'Europe/Athens', 'test:072b') RETURNING id INTO x;
  INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 10, 'test:072b') RETURNING id INTO pk;
  INSERT INTO national_orders (legacy_id, client_id, reference, price, pallets, goods, temperature_c)
  VALUES ('rec072bTN2', cl1, 'WN072b-TEST', 100, 8, 'TEST', 2) RETURNING id INTO na;
  INSERT INTO shipments (nat_order_id, origin_location_id, dest_location_id, pallets, load_from, load_to,
                         deliver_from, deliver_to, created_by)
  VALUES (na, lc, ld, 8, (e + time '12:00') AT TIME ZONE 'Europe/Athens', (e + time '14:00') AT TIME ZONE 'Europe/Athens',
          e1500, e1600, 'test:072b') RETURNING id INTO x;
  INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 8, 'test:072b') RETURNING id INTO pn;
  veh2 := jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk2, 'driver_id', drv2);
  veh3 := jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk3, 'driver_id', drv3);

  FOR k IN 1..coalesce(array_length(want, 1), 0) LOOP
    verdict := NULL;
    BEGIN
      SET CONSTRAINTS ALL DEFERRED;
      -- S
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk1, drv1, d, e, (d + time '06:00') AT TIME ZONE 'Europe/Athens',
              (e + time '14:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:072b') RETURNING id INTO rt1;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 1, la, 'KATHODOS', (d + time '06:00') AT TIME ZONE 'Europe/Athens', t0800, 'test:072b') RETURNING id INTO s1a;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 2, hub, 'KATHODOS', (d + time '09:00') AT TIME ZONE 'Europe/Athens', t1000, 'test:072b') RETURNING id INTO s1h;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 3, lb, 'KATHODOS', (d + time '12:00') AT TIME ZONE 'Europe/Athens', (d + time '14:00') AT TIME ZONE 'Europe/Athens',
              'test:072b') RETURNING id INTO s1b;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt1, 4, lc, 'ANODOS', (e + time '12:00') AT TIME ZONE 'Europe/Athens', (e + time '14:00') AT TIME ZONE 'Europe/Athens',
              'test:072b') RETURNING id INTO s1c;
      INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                  status, source, created_by)
      VALUES (2, 'NATL', 'OWNED', trk2, drv2, f, f, (f + time '06:00') AT TIME ZONE 'Europe/Athens',
              (f + time '14:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:072b') RETURNING id INTO rt2;
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 1, la, 'KATHODOS', (f + time '06:00') AT TIME ZONE 'Europe/Athens', (f + time '08:00') AT TIME ZONE 'Europe/Athens', 'test:072b');
      INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
      VALUES (rt2, 2, lb, 'KATHODOS', (f + time '12:00') AT TIME ZONE 'Europe/Athens', (f + time '14:00') AT TIME ZONE 'Europe/Athens', 'test:072b');
      SET CONSTRAINTS ALL IMMEDIATE;
      SET CONSTRAINTS ALL DEFERRED;
      SELECT count(*) INTO n0 FROM locations;
      j0 := jsonb_build_array((SELECT count(*) FROM rt_stops), (SELECT count(*) FROM piece_legs),
                              (SELECT count(*) FROM shipment_pieces), (SELECT count(*) FROM shipments));

      IF k = 1 THEN
        verdict := CASE WHEN (SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = rt1) = 1
                          AND (SELECT g.from_at = c.start_at AND g.to_at = c.end_at AND g.truck_id = trk1 AND g.driver_id = drv1
                                      AND g.trip_type = 'OWNED' AND g.reason IS NULL AND g.place_note IS NULL AND NOT g.rt_cancelled
                                      AND g.created_by = 'test:072b'
                                 FROM rt_vehicle_segments g JOIN ct_round_trips c ON c.id = g.rt_id WHERE g.rt_id = rt1)
                          AND (SELECT label IS NULL AND n_segments = 1 FROM v_rt_segments WHERE rt_id = rt1)
                        THEN 'ok one seeded segment' ELSE 'FAIL seed' END;
      ELSIF k IN (2, 3, 26, 33, 34, 35, 42, 43, 45, 55, 60, 61, 63, 65, 66) THEN
        -- the owner's example: 2104 / Giorgos breaks down at Lamia, Tue 14:30; 2108 / Nikos takes over
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'dispatcher');
        g2 := (r->'ids'->>'segment_id')::bigint; g1 := (r->'ids'->>'cut_segment_id')::bigint;
        IF k = 2 THEN
          verdict := CASE WHEN (SELECT to_at FROM rt_vehicle_segments WHERE id = g1) = t1430
                            AND (SELECT from_at = t1430 AND to_at = (e + time '14:00') AT TIME ZONE 'Europe/Athens'
                                        AND truck_id = trk2 AND driver_id = drv2 AND place_note = 'Lamia' AND reason = 'vehicle_breakdown'
                                   FROM rt_vehicle_segments WHERE id = g2)
                            AND (SELECT string_agg(coalesce(label, '-'), ',' ORDER BY n) FROM v_rt_segments WHERE rt_id = rt1) = 'initial,final'
                            AND (SELECT truck_id = trk1 AND driver_id = drv1 FROM ct_round_trips WHERE id = rt1)
                            AND (SELECT count(*) FROM audit_log WHERE table_name = 'rt_vehicle_segments' AND record_id = g2::text
                                   AND action = 'create' AND actor = 'test:072b' AND role = 'dispatcher'
                                   AND after_data->>'reason' = 'vehicle_breakdown' AND after_data->>'place_note' = 'Lamia'
                                   AND (after_data->>'from_at')::timestamptz = t1430) = 1
                            AND (SELECT count(*) FROM locations) = n0
                            -- review R2, DB finding 4: stop C (D+1 12:00) passes to the TELIKO, and the answer says so
                            AND r->>'ok' = 'true' AND r->'warnings' = jsonb_build_array(jsonb_build_object('code', 'seg_stop_moved',
                                  'stop_id', s1c, 'from_segment_id', g1, 'to_segment_id', g2))
                          THEN 'ok handover: [A][T], copy = A, one create row, stop C said' ELSE 'FAIL handover ' || r::text END;
        ELSIF k = 3 THEN
          j1 := (SELECT to_jsonb(s) FROM rt_vehicle_segments s WHERE id = g2);
          r2 := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1000,
                  'place_note', 'Larisa', 'reason', 'planned_truck', 'vehicle', veh3), 'test:072b', 'warehouse');
          verdict := CASE WHEN (SELECT to_jsonb(s) FROM rt_vehicle_segments s WHERE id = g2) = j1
                            AND (SELECT string_agg(label, ',' ORDER BY n) FROM v_rt_segments WHERE rt_id = rt1) = 'initial,intermediate,final'
                            AND (SELECT to_at FROM rt_vehicle_segments WHERE id = g1) = t1000
                          THEN 'ok [A][E][T], T unchanged' ELSE 'FAIL second handover' END;
        ELSIF k = 26 THEN
          PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1000,
                    'place_note', 'Larisa', 'reason', 'planned_truck', 'vehicle', veh3), 'test:072b', 'owner');
          PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e1000,
                    'place_note', 'Katerini', 'reason', 'driver_unavailable',
                    'vehicle', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk4, 'driver_id', drv1)), 'test:072b', 'owner');
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN (SELECT string_agg(label, ',' ORDER BY n) FROM v_rt_segments WHERE rt_id = rt1)
                                 = 'initial,intermediate,intermediate,final'
                          THEN 'ok four segments' ELSE 'FAIL four' END;
        ELSIF k = 33 THEN
          r2 := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1000,
                  'place_note', 'Larisa', 'reason', 'planned_truck', 'vehicle', veh3), 'test:072b', 'owner');
          g3 := (r2->'ids'->>'segment_id')::bigint;
          r := plan_seg_remove(jsonb_build_object('segment_id', g3), 'test:072b', 'dispatcher');
          verdict := CASE WHEN (SELECT to_at FROM rt_vehicle_segments WHERE id = g1) = t1430
                            AND (SELECT deleted_at IS NOT NULL AND deleted_by = 'test:072b' AND deleted_reason LIKE '%(test:072b)'
                                   FROM rt_vehicle_segments WHERE id = g3)
                            AND (SELECT string_agg(label, ',' ORDER BY n) FROM v_rt_segments WHERE rt_id = rt1) = 'initial,final'
                            AND r->>'ok' = 'true' AND (r->'ids'->>'prev_segment_id')::bigint = g1
                          THEN 'ok E removed, A takes its end' ELSE 'FAIL remove E ' || r::text END;
        ELSIF k = 34 THEN
          r := plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'owner');
          verdict := CASE WHEN (SELECT to_at FROM rt_vehicle_segments WHERE id = g1) = (SELECT end_at FROM ct_round_trips WHERE id = rt1)
                            AND (SELECT count(*) FROM v_rt_segments WHERE rt_id = rt1) = 1
                            AND (SELECT label FROM v_rt_segments WHERE rt_id = rt1) IS NULL
                          THEN 'ok last removed, no label' ELSE 'FAIL remove T' END;
        ELSIF k = 35 THEN
          PERFORM plan_seg_remove(jsonb_build_object('segment_id', g1), 'test:072b', 'owner');
        ELSIF k = 42 THEN
          PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1000,
                    'place_note', 'Larisa', 'reason', 'planned_truck', 'vehicle', veh3), 'test:072b', 'owner');
          r := plan_rt_clear(jsonb_build_object('rt_id', rt1), 'test:072b', 'owner');
          verdict := CASE WHEN (SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = rt1 AND deleted_at IS NULL) = 1
                            AND (SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = rt1 AND deleted_at IS NOT NULL) = 2
                            AND (SELECT NOT has_vehicle AND label IS NULL FROM v_rt_segments WHERE rt_id = rt1)
                            AND (SELECT truck_id IS NULL AND driver_id IS NULL AND trip_type = 'OWNED' FROM ct_round_trips WHERE id = rt1)
                            AND (SELECT to_at FROM rt_vehicle_segments WHERE rt_id = rt1 AND deleted_at IS NULL)
                                = (SELECT end_at FROM ct_round_trips WHERE id = rt1)
                          THEN 'ok clear: one segment without assignment' ELSE 'FAIL clear ' || r::text END;
        ELSIF k = 43 THEN
          PERFORM plan_rt_update(jsonb_build_object('rt_id', rt1, 'set', jsonb_build_object('truck_id', trk3)), 'test:072b', 'owner');
        ELSIF k = 45 THEN
          PERFORM plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('place_note', 'Lamia 2')), 'test:072b', 'owner');
          PERFORM plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'owner');
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN jsonb_build_array((SELECT count(*) FROM rt_stops), (SELECT count(*) FROM piece_legs),
                                                 (SELECT count(*) FROM shipment_pieces), (SELECT count(*) FROM shipments)) = j0
                            AND (SELECT count(*) FROM locations) = n0
                          THEN 'ok no stop, leg, piece, shipment or location' ELSE 'FAIL loads changed' END;
        ELSIF k = 55 THEN
          r := plan_board(d - ((extract(isodow from d)::int + 1) % 7), 'warehouse');   -- the TMS week: its Saturday
          j1 := (SELECT c->'segments' FROM jsonb_array_elements(r->'cycles') c WHERE (c->>'rt_id')::bigint = rt1);
          verdict := CASE WHEN jsonb_array_length(j1) = 2 AND j1->0->>'label' = 'initial' AND j1->1->>'label' = 'final'
                            AND j1->1->>'truck' = 'TEST-072b-2108' AND j1->1->>'place_note' = 'Lamia'
                          THEN 'ok board segments' ELSE 'FAIL board ' || coalesce(j1::text, 'null') END;
        ELSIF k = 60 THEN
          UPDATE rt_vehicle_segments SET truck_id = NULL WHERE id = g2;
        ELSIF k = 61 THEN
          UPDATE rt_vehicle_segments SET rt_cancelled = true WHERE id = g2;
        ELSIF k = 63 THEN
          UPDATE rt_vehicle_segments SET rt_id = rt2 WHERE id = g2;
        ELSIF k = 65 THEN
          PERFORM plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'owner');
          PERFORM plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('place_note', 'x')), 'test:072b', 'owner');
        ELSIF k = 66 THEN
          PERFORM plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('reason', 'accident')), 'test:072b', 'management');
          PERFORM plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'dispatcher');
          verdict := CASE WHEN (SELECT string_agg(action || ':' || role, ',' ORDER BY id) FROM audit_log
                                 WHERE table_name = 'rt_vehicle_segments' AND actor = 'test:072b' AND record_id = g2::text)
                                 = 'create:dispatcher,update:management,delete:dispatcher'
                          THEN 'ok history: create, update, delete by the person' ELSE 'FAIL history' END;
        END IF;
      ELSIF k IN (4, 58) THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
               'place_note', 'Lamia', 'reason', CASE WHEN k = 4 THEN 'planned_truck' ELSE 'driver_hours' END,
               'same_driver', true, 'vehicle', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk2)), 'test:072b', 'owner');
        verdict := CASE WHEN (SELECT driver_id = drv1 AND truck_id = trk2 FROM rt_vehicle_segments WHERE id = (r->'ids'->>'segment_id')::bigint)
                          AND (SELECT driver_id = drv1 AND truck_id = trk1 FROM rt_vehicle_segments WHERE id = (r->'ids'->>'cut_segment_id')::bigint)
                        THEN 'ok same driver, other truck' ELSE 'FAIL same driver ' || r::text END;
        IF k = 58 THEN
          PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1000,
                    'place_note', 'Kozani', 'reason', 'vehicle_breakdown', 'vehicle', veh3), 'test:072b', 'owner');
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN (SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = rt1
                                 AND reason IN ('vehicle_breakdown', 'driver_hours')) = 2 THEN 'ok 067 codes' ELSE 'FAIL 067 codes' END;
        END IF;
      ELSIF k = 5 THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
                  'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
      ELSIF k = 6 THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
                  'reason', 'vehicle_breakdown', 'same_driver', true, 'vehicle', veh2), 'test:072b', 'owner');
      ELSIF k IN (7, 8, 9) THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1,
                  'at', CASE k WHEN 7 THEN (SELECT start_at FROM ct_round_trips WHERE id = rt1)
                               WHEN 8 THEN (SELECT end_at FROM ct_round_trips WHERE id = rt1)
                               ELSE (SELECT start_at - interval '1 hour' FROM ct_round_trips WHERE id = rt1) END,
                  'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
      ELSIF k IN (10, 11, 12) THEN
        -- another cycle of truck 3 / driver 3 on D+1 12:00-16:00; R1 hands over to it on D+1 10:00 (overlap 12-14)
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', trk3, drv3, e, e, (e + time '12:00') AT TIME ZONE 'Europe/Athens',
                (e + time '16:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:072b') RETURNING id INTO rt3;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt3, 1, la, 'KATHODOS', (e + time '12:00') AT TIME ZONE 'Europe/Athens', (e + time '16:00') AT TIME ZONE 'Europe/Athens', 'test:072b');
        IF k = 11 THEN
          BEGIN
            PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e1000,
                      'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh3), 'test:072b', 'owner');
            verdict := 'FAIL no error';
          EXCEPTION WHEN others THEN
            GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, hint = PG_EXCEPTION_HINT;
            verdict := CASE WHEN hint = 'plan:truck_busy' AND msg LIKE '%' || (SELECT code FROM ct_round_trips WHERE id = rt3)
                            THEN 'ok truck_busy names ' || (SELECT code FROM ct_round_trips WHERE id = rt3) ELSE 'FAIL ' || msg END;
          END;
        ELSE
          PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e1000,
                    'place_note', 'Lamia', 'reason', 'vehicle_breakdown',
                    'vehicle', CASE WHEN k = 10 THEN jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk3, 'driver_id', drv2)
                                    ELSE jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk2, 'driver_id', drv3) END),
                  'test:072b', 'owner');
        END IF;
      ELSIF k IN (13, 14) THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
                  'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        -- truck 1 (2104) / driver 3 in another cycle the same afternoon, written as plan_rt_create would (deferred)
        PERFORM plan_h_ctx('test:072b', 'owner');
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', trk1, drv3, d, d, CASE WHEN k = 13 THEN t1500 ELSE (d + time '14:00') AT TIME ZONE 'Europe/Athens' END,
                (d + time '18:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:072b') RETURNING id INTO rt3;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt3, 1, la, 'KATHODOS', CASE WHEN k = 13 THEN t1500 ELSE (d + time '14:00') AT TIME ZONE 'Europe/Athens' END,
                (d + time '18:00') AT TIME ZONE 'Europe/Athens', 'test:072b');
        PERFORM plan_h_finish();
        IF k = 13 THEN verdict := 'ok 2104 free after 14:30'; END IF;
      ELSIF k IN (15, 16, 17) THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
               'reason', CASE k WHEN 15 THEN 'flat_tyre' ELSE 'other' END, 'vehicle', veh2)
             || CASE WHEN k = 17 THEN '{"reason_note": "TEST 072b note"}'::jsonb ELSE '{}'::jsonb END, 'test:072b', 'owner');
        IF k = 17 THEN
          verdict := CASE WHEN (SELECT reason_note FROM rt_vehicle_segments WHERE id = (r->'ids'->>'segment_id')::bigint) = 'TEST 072b note'
                          THEN 'ok other with its note' ELSE 'FAIL other' END;
        END IF;
      ELSIF k = 18 THEN
        UPDATE ct_round_trips SET truck_id = trk3 WHERE id = rt1;
      ELSIF k = 19 THEN
        INSERT INTO ct_round_trips (scope, trip_type, truck_id, date_start, status, source, created_by)
        VALUES ('NATL', 'OWNED', trk4, f + 5, 'planned', 'manual', 'test:072b') RETURNING id INTO rt3;
        INSERT INTO rt_vehicle_segments (rt_id, from_at, to_at, trip_type, truck_id, created_by)
        VALUES (rt3, (f + 5)::timestamptz, (f + 6)::timestamptz, 'OWNED', trk4, 'test:072b');
      ELSIF k = 20 THEN
        UPDATE rt_vehicle_segments SET deleted_at = now(), deleted_reason = 'test', deleted_by = 'test:072b' WHERE rt_id = rt1;
      ELSIF k = 21 THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
               'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        PERFORM plan_h_ctx('test:072b', 'owner');
        UPDATE rt_vehicle_segments SET from_at = t1500 WHERE id = (r->'ids'->>'segment_id')::bigint;
      ELSIF k = 22 THEN
        DELETE FROM rt_vehicle_segments WHERE rt_id = rt1;
      ELSIF k = 23 THEN
        UPDATE rt_vehicle_segments SET reason = 'accident', place_note = 'x' WHERE rt_id = rt1;
      ELSIF k IN (24, 25) THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1,
                  'at', CASE WHEN k = 24 THEN t1430 ELSE e1000 END, 'place_note', 'Lamia', 'reason', 'vehicle_breakdown',
                  'vehicle', veh2), 'test:072b', 'owner');
        IF k = 24 THEN
          r := plan_rt_update(jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(
                 jsonb_build_object('stop_id', s1a, 'planned_from', (d + time '05:00') AT TIME ZONE 'Europe/Athens', 'planned_to', t0800),
                 jsonb_build_object('stop_id', s1c, 'planned_from', (e + time '12:00') AT TIME ZONE 'Europe/Athens',
                                    'planned_to', (e + time '16:00') AT TIME ZONE 'Europe/Athens'))), 'test:072b', 'owner');
          verdict := CASE WHEN (SELECT min(from_at) = (d + time '05:00') AT TIME ZONE 'Europe/Athens'
                                       AND max(to_at) = (e + time '16:00') AT TIME ZONE 'Europe/Athens'
                                  FROM rt_vehicle_segments WHERE rt_id = rt1 AND deleted_at IS NULL)
                            AND (SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = rt1 AND deleted_at IS NULL AND (from_at = t1430 OR to_at = t1430)) = 2
                          THEN 'ok the edges follow the stops' ELSE 'FAIL edges' END;
        ELSE
          -- C moves to D 15:00-16:00: the cycle would end before the handover of D+1 10:00
          PERFORM plan_rt_update(jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(
                    jsonb_build_object('stop_id', s1c, 'planned_from', t1500, 'planned_to', t1600))), 'test:072b', 'owner');
        END IF;
      ELSIF k = 27 THEN
        -- a cycle around now: from now - 2 days to now + 2 days
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', trk4, drv3, ((now() - interval '2 days') AT TIME ZONE 'Europe/Athens')::date,
                ((now() + interval '2 days') AT TIME ZONE 'Europe/Athens')::date, now() - interval '2 days', now() + interval '2 days',
                'planned', 'planner', 'test:072b') RETURNING id INTO rt3;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt3, 1, la, 'KATHODOS', now() - interval '2 days', now() + interval '2 days', 'test:072b');
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt3, 'at', now() - interval '1 day',
                  'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk3)),
                  'test:072b', 'owner');
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt3, 'at', now(),
                  'place_note', 'Larisa', 'reason', 'accident', 'vehicle', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk2)),
                  'test:072b', 'owner');
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt3, 'at', now() + interval '1 day',
                  'place_note', 'Katerini', 'reason', 'planned_truck', 'vehicle', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk1)),
                  'test:072b', 'owner');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN (SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = rt3 AND deleted_at IS NULL) = 4
                        THEN 'ok past, now and future' ELSE 'FAIL times' END;
      ELSIF k = 28 THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1000,
                  'place_note', 'Larisa', 'reason', 'planned_truck',
                  'vehicle', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', pa, 'partner_rate', 300)), 'test:072b', 'dispatcher');
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1600,
                  'place_note', 'Lamia', 'reason', 'other', 'reason_note', 'TEST 072b swap',
                  'vehicle', jsonb_build_object('trip_type', 'PARTNER', 'partner_id', pa2, 'partner_rate', 200)), 'test:072b', 'dispatcher');
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e1000,
                  'place_note', 'Katerini', 'reason', 'planned_driver', 'vehicle', veh3), 'test:072b', 'dispatcher');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN (SELECT string_agg(trip_type || ':' || coalesce(partner_rate::text, '-'), ',' ORDER BY n)
                                FROM v_rt_segments WHERE rt_id = rt1) = 'OWNED:-,PARTNER:300.00,PARTNER:200.00,OWNED:-'
                        THEN 'ok each segment its own vehicle and rate' ELSE 'FAIL partner mix' END;
      ELSIF k IN (29, 30, 31, 32) THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
               'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g2 := (r->'ids'->>'segment_id')::bigint; g1 := (r->'ids'->>'cut_segment_id')::bigint;
        IF k = 29 THEN
          r2 := plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('at', t1600)), 'test:072b', 'accountant');
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN (SELECT to_at FROM rt_vehicle_segments WHERE id = g1) = t1600
                            AND (SELECT from_at FROM rt_vehicle_segments WHERE id = g2) = t1600
                          THEN 'ok the time moves, no gap' ELSE 'FAIL fix time' END;
        ELSIF k = 30 THEN
          PERFORM plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('at', (d + time '05:00') AT TIME ZONE 'Europe/Athens')),
                  'test:072b', 'owner');
        ELSIF k = 31 THEN
          PERFORM plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', '{"truck_id": null}'::jsonb), 'test:072b', 'owner');
        ELSE
          PERFORM plan_seg_fix(jsonb_build_object('segment_id', g1, 'set', jsonb_build_object('at', t1000)), 'test:072b', 'owner');
        END IF;
      ELSIF k IN (36, 37, 38, 64, 70) THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
               'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g2 := (r->'ids'->>'segment_id')::bigint;
        -- before 073 a cycle has ONE payroll line (011, the ARCHIKO's driver): to give Nikos (T) a line with an amount
        -- the test ends Giorgos' line and writes Nikos' (what 073's per-driver line will do)
        UPDATE dl_entries SET deleted_at = now(), deleted_reason = 'TEST 072b' WHERE rt_id = rt1 AND deleted_at IS NULL;
        INSERT INTO dl_entries (driver_id, entry_type, entry_date, rt_id, trip_value, source, created_by)
        VALUES (drv2, 'trip', e, rt1, 100, 'manual', 'test:072b') RETURNING id INTO x;
        r := plan_seg_remove(jsonb_build_object('segment_id', g2, 'dry_run', true), 'test:072b', 'owner');
        IF k = 36 THEN
          verdict := CASE WHEN (r->>'needs_confirm')::boolean AND length(r->>'confirm_token') = 32
                            AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'payroll_amount', 'dl_entry_id', x,
                                  'month', to_char(e, 'YYYY-MM'), 'amount', 100))
                            AND (SELECT deleted_at IS NULL FROM rt_vehicle_segments WHERE id = g2)
                          THEN 'ok list with the month and the token' ELSE 'FAIL list ' || r::text END;
        ELSIF k = 37 THEN
          PERFORM plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'owner');
        ELSIF k = 70 THEN
          UPDATE dl_entries SET trip_value = 120 WHERE id = x;
          PERFORM plan_seg_remove(jsonb_build_object('segment_id', g2, 'confirm_token', r->>'confirm_token'), 'test:072b', 'owner');
        ELSIF k = 38 THEN
          r2 := plan_seg_remove(jsonb_build_object('segment_id', g2, 'confirm_token', r->>'confirm_token'), 'test:072b', 'owner');
          verdict := CASE WHEN (SELECT deleted_at IS NOT NULL FROM dl_entries WHERE id = x)
                            AND (SELECT deleted_at IS NOT NULL FROM rt_vehicle_segments WHERE id = g2)
                            AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND needs_review) = 0
                          THEN 'ok removed with the token, line gone, 0 needs_review' ELSE 'FAIL token ' || r2::text END;
        ELSE
          r2 := plan_seg_remove(jsonb_build_object('segment_id', g2, 'dry_run', true), 'test:072b', 'dispatcher');
          verdict := CASE WHEN r2::text NOT LIKE '%"amount"%' AND r::text LIKE '%"amount": 100%'
                            AND r2->>'confirm_token' = r->>'confirm_token'
                          THEN 'ok no amount for the dispatcher, one token' ELSE 'FAIL strip ' || r2::text END;
        END IF;
      ELSIF k = 39 THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
               'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g2 := (r->'ids'->>'segment_id')::bigint;
        INSERT INTO ct_cost_lines (rt_id, category, net, vat, line_date, truck_id, alloc_status, created_by, pay_source)
        VALUES (rt1, 'tolls', 10, 2.4, e, trk2, 'allocated', 'test:072b', 'DKV'), (rt1, 'tolls', 5, 1.2, e, trk2, 'allocated', 'test:072b', 'DKV');
        SELECT count(*) INTO n1 FROM ct_cost_lines WHERE rt_id = rt1;
        r := plan_seg_remove(jsonb_build_object('segment_id', g2, 'dry_run', true), 'test:072b', 'owner');
        r2 := plan_seg_remove(jsonb_build_object('segment_id', g2, 'confirm_token', r->>'confirm_token'), 'test:072b', 'owner');
        verdict := CASE WHEN r->'consequences' @> '[{"kind": "costs", "pay_source": "DKV", "count": 2}]'::jsonb
                          AND (SELECT count(*) FROM ct_cost_lines WHERE rt_id = rt1) = n1
                          AND jsonb_array_length(r2->'notice_ids') = 1
                          AND (SELECT kind = 'costs_without_rt' AND rt_id = rt1 AND message LIKE '%TEST-072b-2108%'
                                 FROM plan_notices WHERE id = (r2->'notice_ids'->>0)::bigint)
                        THEN 'ok DKV listed, lines stay, one notice' ELSE 'FAIL dkv ' || r::text || r2::text END;
      ELSIF k IN (40, 41) THEN
        UPDATE dl_entries SET trip_value = 100 WHERE rt_id = rt1 AND deleted_at IS NULL;
        SELECT id INTO x FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL;
        IF k = 40 THEN
          PERFORM plan_seg_fix(jsonb_build_object('segment_id', (SELECT id FROM rt_vehicle_segments WHERE rt_id = rt1),
                    'set', jsonb_build_object('driver_id', drv3)), 'test:072b', 'owner');
        ELSE
          PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
                    'reason', 'driver_unavailable', 'vehicle', veh2), 'test:072b', 'owner');
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN (SELECT trip_value = 100 AND deleted_at IS NULL AND NOT needs_review AND driver_id = drv1
                                  FROM dl_entries WHERE id = x)
                          THEN 'ok the first driver keeps his line and amount' ELSE 'FAIL payroll kept' END;
        END IF;
      ELSIF k = 44 THEN
        r := plan_rt_update(jsonb_build_object('rt_id', rt1, 'set', jsonb_build_object('truck_id', trk3, 'driver_id', drv3)), 'test:072b', 'warehouse');
        verdict := CASE WHEN (SELECT truck_id = trk3 AND driver_id = drv3 FROM rt_vehicle_segments WHERE rt_id = rt1)
                          AND (SELECT truck_id = trk3 AND driver_id = drv3 FROM ct_round_trips WHERE id = rt1)
                          AND (SELECT driver_id FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL) = drv3
                        THEN 'ok one segment: as 072, the copy and 011 follow' ELSE 'FAIL rt_update ' || r::text END;
      ELSIF k IN (46, 47) THEN
        j1 := jsonb_build_object('request_id', 'aaaaaaaa-0000-4000-8000-00000000072b', 'rt_id', rt1, 'at', t1430,
                                 'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2);
        r := plan_seg_change(j1, 'test:072b', 'owner');
        IF k = 46 THEN
          r2 := plan_seg_change(j1, 'test:072b', 'owner');
          verdict := CASE WHEN r2->'ids' = r->'ids' AND (r2->>'replayed')::boolean
                            AND (SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = rt1) = 2
                          THEN 'ok replay: the same ids, one segment' ELSE 'FAIL replay ' || r2::text END;
        ELSE
          PERFORM plan_seg_change(j1 || '{"place_note": "Volos"}'::jsonb, 'test:072b', 'owner');
        END IF;
      ELSIF k = 48 THEN
        PERFORM plan_seg_change(jsonb_build_object('rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
                  'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
      ELSIF k IN (49, 50) THEN
        IF k = 50 THEN
          INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                      status, source, created_by)
          VALUES (2, 'NATL', 'OWNED', trk3, drv3, e, e, (e + time '12:00') AT TIME ZONE 'Europe/Athens',
                  (e + time '16:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:072b') RETURNING id INTO rt3;
          INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
          VALUES (rt3, 1, la, 'KATHODOS', (e + time '12:00') AT TIME ZONE 'Europe/Athens', (e + time '16:00') AT TIME ZONE 'Europe/Athens', 'test:072b');
        END IF;
        r := plan_seg_change(jsonb_build_object('rt_id', rt1, 'at', CASE WHEN k = 49 THEN t1430 ELSE e1000 END, 'place_note', 'Lamia',
               'reason', 'vehicle_breakdown', 'dry_run', true,
               'vehicle', CASE WHEN k = 49 THEN veh2 ELSE jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk3) END), 'test:072b', 'warehouse');
        verdict := CASE WHEN k = 49 AND (r->>'dry_run')::boolean AND jsonb_array_length(r->'preview'->'segments') = 2
                              AND (SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = rt1) = 1
                        THEN 'ok preview, nothing kept'
                        WHEN k = 50 AND r->'preview'->'conflict'->>'code' = 'truck_busy'
                              AND (SELECT count(*) FROM rt_vehicle_segments WHERE rt_id = rt1) = 1
                        THEN 'ok preview shows truck_busy, nothing kept' ELSE 'FAIL dry run ' || r::text END;
      ELSIF k = 51 THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
                  'reason', 'vehicle_breakdown', 'vehicle', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk1, 'driver_id', drv1)),
                  'test:072b', 'owner');
      ELSIF k = 52 THEN
        PERFORM plan_rt_clear(jsonb_build_object('rt_id', rt1), 'test:072b', 'owner');
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
                  'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
      ELSIF k IN (53, 54) THEN
        -- the VS bridge (10 pallets to B) waits at Veroia and rides R1 from the Veroia stop (09:00) to B
        INSERT INTO shipments (order_id, order_stop_id, created_by) VALUES (vso, vs_b, 'test:072b') RETURNING id INTO x;
        INSERT INTO shipment_pieces (shipment_id, pallets, created_by) VALUES (x, 10, 'test:072b') RETURNING id INTO y;
        INSERT INTO piece_legs (piece_id, leg_no, rt_id, pickup_stop_id, drop_stop_id, created_by) VALUES (y, 1, rt1, s1h, s1b, 'test:072b');
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1,
                  'at', CASE WHEN k = 53 THEN t0830 ELSE t0930 END, 'place_note', 'Lamia', 'reason', 'vehicle_breakdown',
                  'vehicle', veh2), 'test:072b', 'owner');
        r := plan_vs_state(ARRAY[vso]);
        verdict := CASE WHEN (r->vso::text->'carriers'->0->>'text') LIKE CASE WHEN k = 53 THEN 'TEST-072b-2108%' ELSE 'TEST-072b-2104%' END
                        THEN 'ok follows the vehicle at Veroia: ' || (r->vso::text->'carriers'->0->>'text')
                        ELSE 'FAIL follows ' || r::text END;
      ELSIF k = 56 THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1000, 'place_note', 'Lamia',
                  'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        -- stop B (12:00) is in Nikos' segment: Nikos is not also its local driver (decision 38, per segment)
        PERFORM plan_local_loading(jsonb_build_object('request_id', gen_random_uuid(), 'rt_stop_id', s1b, 'driver_id', drv2,
                  'truck_id', trk3), 'test:072b', 'owner');
      ELSIF k = 57 THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
                  'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        verdict := CASE WHEN (SELECT string_agg(truck_id::text || '@' || to_char(start_at AT TIME ZONE 'Europe/Athens', 'HH24:MI'), ',' ORDER BY start_at)
                                FROM v_rt_vehicle_windows WHERE id = rt1) = trk1 || '@06:00,' || trk2 || '@14:30'
                          AND (SELECT count(*) FROM v_rt_vehicle_windows WHERE model = 1) = (SELECT count(*) FROM ct_round_trips WHERE model = 1)
                        THEN 'ok windows per segment' ELSE 'FAIL windows' END;
      ELSIF k = 59 THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
                  'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        r := plan_seg_fix(jsonb_build_object('segment_id', (SELECT segment_id FROM v_rt_segments WHERE rt_id = rt1 AND n = 1),
               'set', jsonb_build_object('truck_id', trk3, 'driver_id', drv3)), 'test:072b', 'owner');
        verdict := CASE WHEN (SELECT truck_id = trk3 AND driver_id = drv3 FROM ct_round_trips WHERE id = rt1)
                          AND (SELECT driver_id FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL) = drv3
                        THEN 'ok the first segment drives the copy and 011' ELSE 'FAIL copy ' || r::text END;
      ELSIF k = 62 THEN
        UPDATE ct_round_trips SET status = 'cancelled' WHERE id = rt2;
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', trk2, drv2, f, f, (f + time '07:00') AT TIME ZONE 'Europe/Athens',
                (f + time '09:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner', 'test:072b') RETURNING id INTO rt3;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt3, 1, la, 'KATHODOS', (f + time '07:00') AT TIME ZONE 'Europe/Athens', (f + time '09:00') AT TIME ZONE 'Europe/Athens', 'test:072b');
        PERFORM plan_h_finish();
        verdict := CASE WHEN (SELECT bool_and(rt_cancelled) FROM rt_vehicle_segments WHERE rt_id = rt2)
                        THEN 'ok cancelled cycle frees its truck' ELSE 'FAIL cancel' END;
      ELSIF k IN (68, 69) THEN
        IF k = 69 THEN UPDATE ct_round_trips SET status = 'cancelled' WHERE id = rt1; END IF;
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', CASE WHEN k = 68 THEN -1 ELSE rt1 END,
                  'at', t1430, 'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
      ELSIF k IN (71, 72) THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
                  'reason', 'vehicle_breakdown', 'vehicle', CASE WHEN k = 71 THEN jsonb_build_object('trip_type', 'OWNED', 'driver_id', drv2)
                                                                ELSE jsonb_build_object('trip_type', 'PARTNER', 'partner_rate', 300) END), 'test:072b', 'owner');
      ELSIF k = 67 THEN
        UPDATE rt_vehicle_segments SET to_at = t1430 WHERE rt_id = rt1;
        INSERT INTO rt_vehicle_segments (rt_id, from_at, to_at, trip_type, truck_id, driver_id, created_by)
        VALUES (rt1, t1430, (e + time '14:00') AT TIME ZONE 'Europe/Athens', 'OWNED', trk2, drv2, 'test:072b');
      ELSIF k IN (73, 74, 75, 76, 77, 78, 80, 81, 82, 83, 84, 85) THEN
        IF k = 73 THEN
          -- today's round trips (model=1, no window) of truck 1 and truck 2 on D+1
          INSERT INTO ct_round_trips (scope, trip_type, truck_id, date_start, status, source, created_by)
          VALUES ('NATL', 'OWNED', trk1, e, 'planned', 'manual', 'test:072b') RETURNING id INTO x;
          INSERT INTO ct_round_trips (scope, trip_type, truck_id, date_start, status, source, created_by)
          VALUES ('NATL', 'OWNED', trk2, e, 'planned', 'manual', 'test:072b') RETURNING id INTO y;
        ELSIF k = 74 THEN
          INSERT INTO ct_round_trips (scope, trip_type, truck_id, date_start, status, source, created_by)
          VALUES ('NATL', 'OWNED', trk3, e, 'planned', 'manual', 'test:072b') RETURNING id INTO x;
        ELSIF k = 75 THEN
          INSERT INTO ct_round_trips (scope, trip_type, truck_id, date_start, status, source, created_by)
          VALUES ('NATL', 'OWNED', trk1, e, 'planned', 'manual', 'test:072b') RETURNING id INTO x;
        END IF;
        -- the owner's example again: 2104 / Giorgos until Lamia 14:30, then 2108 / Nikos
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'dispatcher');
        g2 := (r->'ids'->>'segment_id')::bigint; g1 := (r->'ids'->>'cut_segment_id')::bigint;
        IF k = 73 THEN
          r := plan_rt_update(jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(jsonb_build_object('stop_id', s1c,
                 'planned_from', (e + time '12:00') AT TIME ZONE 'Europe/Athens', 'planned_to', (e + time '15:00') AT TIME ZONE 'Europe/Athens'))),
                 'test:072b', 'owner');
          verdict := CASE WHEN r->'warnings' @> jsonb_build_array(jsonb_build_object('code', 'v1_same_truck',
                                 'rt_code', (SELECT code FROM ct_round_trips WHERE id = y)))
                            AND NOT r->'warnings' @> jsonb_build_array(jsonb_build_object('code', 'v1_same_truck',
                                 'rt_code', (SELECT code FROM ct_round_trips WHERE id = x)))
                          THEN 'ok v1 of the TELIKO, not of the ARCHIKO' ELSE 'FAIL v1 ' || r::text END;
        ELSIF k = 74 THEN
          r2 := plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('truck_id', trk3)), 'test:072b', 'owner');
          verdict := CASE WHEN r2->'warnings' @> jsonb_build_array(jsonb_build_object('code', 'v1_same_truck',
                                 'rt_code', (SELECT code FROM ct_round_trips WHERE id = x)))
                          THEN 'ok the corrected truck is warned' ELSE 'FAIL fix v1 ' || r2::text END;
        ELSIF k = 75 THEN
          r2 := plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'owner');
          verdict := CASE WHEN r2->'warnings' @> jsonb_build_array(jsonb_build_object('code', 'v1_same_truck',
                                 'rt_code', (SELECT code FROM ct_round_trips WHERE id = x)))
                          THEN 'ok the longer ARCHIKO is warned' ELSE 'FAIL remove v1 ' || r2::text END;
        ELSIF k = 76 THEN
          -- R2 (D+2) is driven by truck 2 / driver 2 = the TELIKO's vehicle; the ARCHIKO's (truck 1) has no next cycle
          r2 := plan_rt_update(jsonb_build_object('rt_id', rt1, 'dry_run', true), 'test:072b', 'owner');
          verdict := CASE WHEN r2->'preview'->'next_rt'->>'code' = (SELECT code FROM ct_round_trips WHERE id = rt2)
                          THEN 'ok next_rt of the last segment' ELSE 'FAIL next_rt ' || r2::text END;
        ELSIF k = 77 THEN
          r2 := plan_rt_update(jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(jsonb_build_object('stop_id', s1b,
                  'planned_from', t1500, 'planned_to', t1600))), 'test:072b', 'owner');
          verdict := CASE WHEN r2->'warnings' @> jsonb_build_array(jsonb_build_object('code', 'seg_stop_moved', 'stop_id', s1b,
                                 'from_segment_id', g1, 'to_segment_id', g2))
                            AND jsonb_array_length(r2->'warnings') = 1
                          THEN 'ok stop B now goes with the TELIKO, said' ELSE 'FAIL moved ' || r2::text END;
        ELSIF k = 78 THEN
          r2 := plan_rt_update(jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(jsonb_build_object('stop_id', s1b,
                  'planned_from', t1200, 'planned_to', t1600))), 'test:072b', 'owner');
          verdict := CASE WHEN r2->'warnings' = jsonb_build_array(jsonb_build_object('code', 'seg_stop_straddles', 'stop_id', s1b,
                                 'segment_id', g2))
                          THEN 'ok straddles, stays with the ARCHIKO' ELSE 'FAIL straddles ' || r2::text END;
        ELSIF k = 80 THEN
          j1 := plan_h_seg_json(rt1);
          verdict := CASE WHEN j1->0->'stop_ids' = jsonb_build_array(s1a, s1h, s1b) AND j1->1->'stop_ids' = jsonb_build_array(s1c)
                          THEN 'ok stop_ids per segment' ELSE 'FAIL stop_ids ' || j1::text END;
        ELSIF k = 81 THEN
          r2 := plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('at', t1100)), 'test:072b', 'owner');
          verdict := CASE WHEN r2->'warnings' = jsonb_build_array(jsonb_build_object('code', 'seg_stop_moved', 'stop_id', s1b,
                                 'from_segment_id', g1, 'to_segment_id', g2))
                          THEN 'ok the moved handover takes stop B, said' ELSE 'FAIL fix moved ' || r2::text END;
        ELSIF k IN (82, 83) THEN
          -- truck 1 (2104) takes another cycle at 15:00 the same day (free after its handover at 14:30)
          PERFORM plan_h_ctx('test:072b', 'owner');
          INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                      status, source, created_by)
          VALUES (2, 'NATL', 'OWNED', trk1, drv3, d, d, t1500, (d + time '18:00') AT TIME ZONE 'Europe/Athens', 'planned', 'planner',
                  'test:072b') RETURNING id INTO rt3;
          INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
          VALUES (rt3, 1, la, 'KATHODOS', t1500, (d + time '18:00') AT TIME ZONE 'Europe/Athens', 'test:072b');
          PERFORM plan_h_finish();
          IF k = 82 THEN
            r2 := plan_seg_remove(jsonb_build_object('segment_id', g2, 'dry_run', true), 'test:072b', 'owner');
            verdict := CASE WHEN r2->'preview'->'conflict'->>'code' = 'truck_busy'
                              AND r2->'preview'->'conflict'->>'detail' = (SELECT code FROM ct_round_trips WHERE id = rt3)
                              AND length(r2->>'confirm_token') = 32 AND (r2->>'dry_run')::boolean
                              AND (SELECT deleted_at IS NULL FROM rt_vehicle_segments WHERE id = g2)
                              AND (SELECT to_at FROM rt_vehicle_segments WHERE id = g1) = t1430
                            THEN 'ok the preview shows truck_busy ' || (r2->'preview'->'conflict'->>'detail') ELSE 'FAIL preview ' || r2::text END;
          ELSE
            PERFORM plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'owner');
          END IF;
        ELSIF k = 84 THEN
          r := plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'owner');
          r2 := plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'owner');
          verdict := CASE WHEN (r2->>'ok')::boolean AND (r2->>'replayed')::boolean AND r2->'ids' = r->'ids'
                            AND (SELECT count(*) FROM audit_log WHERE table_name = 'rt_vehicle_segments' AND record_id = g2::text
                                   AND action = 'delete') = 1
                          THEN 'ok replay, one removal' ELSE 'FAIL replay ' || r2::text END;
        ELSE
          PERFORM plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'owner');
          PERFORM plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b-other', 'dispatcher');
        END IF;
      ELSIF k = 79 THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1300,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        verdict := CASE WHEN r->'warnings' = jsonb_build_array(
                               jsonb_build_object('code', 'seg_stop_moved', 'stop_id', s1c,
                                 'from_segment_id', (r->'ids'->>'cut_segment_id')::bigint, 'to_segment_id', (r->'ids'->>'segment_id')::bigint),
                               jsonb_build_object('code', 'seg_stop_straddles', 'stop_id', s1b,
                                 'segment_id', (r->'ids'->>'segment_id')::bigint))
                        THEN 'ok a handover inside stop B is said (and stop C that passes)' ELSE 'FAIL change straddles ' || r::text END;
      ELSIF k = 86 THEN
        -- stop B starts at 12:00 = the handover time: it is the new segment's (Nikos), by the one rule
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1200,
                  'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        PERFORM plan_local_loading(jsonb_build_object('request_id', gen_random_uuid(), 'rt_stop_id', s1b, 'driver_id', drv2,
                  'truck_id', trk3), 'test:072b', 'owner');
      ELSIF k IN (87, 88, 89) THEN
        -- K on the KATHODOS (A -> B), N on the ANODOS (C -> a new stop D at D+1 15:00-16:00): the window is D 06:00 -> D+1 16:00
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pk)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072b', 'owner');
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pn)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'ANODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'c', 'stop_id', s1c),
                                             jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', e1500, 'planned_to', e1600))),
                  'test:072b', 'owner');
        -- the breakdown: 2108 / Nikos from D+1 09:00 (the TELIKO holds C and D)
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e0900,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'dispatcher');
        g2 := (r->'ids'->>'segment_id')::bigint; g1 := (r->'ids'->>'cut_segment_id')::bigint;
        -- the line the screen shows: "the handover Lamia DD/MM 09:00 will be removed" (owner question 7 = b)
        j1 := jsonb_build_array(jsonb_build_object('kind', 'seg_removed', 'rt_id', rt1, 'segment_id', g2, 'place_note', 'Lamia',
                'reason', 'vehicle_breakdown', 'at_athens', to_char(e0900 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI'),
                'code', (SELECT code FROM ct_round_trips WHERE id = rt1)));
        IF k IN (87, 88) THEN
          IF k = 87 THEN
            -- the rest of the broken truck's loads go back to waiting: C and D are swept, the cycle ends D 14:00
            r := plan_move_pieces(jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(pn)),
                   'target', jsonb_build_object('wait', true), 'dry_run', true), 'test:072b', 'warehouse');
            r2 := plan_move_pieces(jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(pn)),
                    'target', jsonb_build_object('wait', true), 'confirm_token', r->>'confirm_token'), 'test:072b', 'warehouse');
          ELSE
            r := plan_delete(jsonb_build_object('nat_order_id', na, 'dry_run', true), 'test:072b', 'dispatcher');
            r2 := plan_delete(jsonb_build_object('nat_order_id', na, 'reason', 'TEST 072b', 'confirm_token', r->>'confirm_token'),
                    'test:072b', 'dispatcher');
          END IF;
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN (r->>'ok')::boolean AND (r->>'dry_run')::boolean AND (r->>'needs_confirm')::boolean
                            AND r->'consequences' @> j1 AND (r2->>'ok')::boolean
                            AND (SELECT deleted_at IS NOT NULL AND deleted_by = 'test:072b'
                                        AND deleted_reason LIKE '%(test:072b, ' || CASE k WHEN 87 THEN 'plan_move_pieces' ELSE 'plan_delete' END || ')'
                                   FROM rt_vehicle_segments WHERE id = g2)
                            AND (SELECT g.to_at = c.end_at AND c.end_at = (d + time '14:00') AT TIME ZONE 'Europe/Athens' AND g.deleted_at IS NULL
                                   FROM rt_vehicle_segments g JOIN ct_round_trips c ON c.id = g.rt_id WHERE g.id = g1)
                            AND (SELECT count(*) FROM v_rt_segments WHERE rt_id = rt1) = 1
                            AND (SELECT label FROM v_rt_segments WHERE rt_id = rt1) IS NULL
                            AND (SELECT count(*) FROM audit_log WHERE table_name = 'rt_vehicle_segments' AND record_id = g2::text
                                   AND action = 'delete' AND role = CASE k WHEN 87 THEN 'warehouse' ELSE 'dispatcher' END) = 1
                            AND (k = 87 OR (SELECT deleted_at IS NOT NULL FROM national_orders WHERE id = na))
                          THEN 'ok listed, removed after the token, the ARCHIKO to the new end'
                          ELSE 'FAIL cut ' || r::text || ' ' || r2::text END;
        ELSE
          j1 := (SELECT to_jsonb(s) - 'updated_at' FROM rt_vehicle_segments s WHERE id = g2);
          r2 := plan_order_update(jsonb_build_object('nat_order_id', na, 'set', jsonb_build_object('price', 120)), 'test:072b', 'accountant');
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN (r2->>'ok')::boolean AND (SELECT to_jsonb(s) - 'updated_at' FROM rt_vehicle_segments s WHERE id = g2) = j1
                            AND (SELECT price FROM national_orders WHERE id = na) = 120
                          THEN 'ok order update, the segments unchanged' ELSE 'FAIL order update ' || r2::text END;
        END IF;
      ELSIF k = 90 THEN
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pk)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072b', 'owner');
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e0900,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'dispatcher');
        g2 := (r->'ids'->>'segment_id')::bigint;
        -- the TELIKO (2108) takes one more load to D at 15:00-16:00: the cycle grows past its end, the TELIKO follows
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pn)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'ANODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'c', 'stop_id', s1c),
                                             jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', e1500, 'planned_to', e1600))),
                  'test:072b', 'warehouse');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN (SELECT end_at FROM ct_round_trips WHERE id = rt1) = e1600
                          AND (SELECT from_at = e0900 AND to_at = e1600 FROM rt_vehicle_segments WHERE id = g2)
                        THEN 'ok the TELIKO follows the wider window' ELSE 'FAIL widen' END;
      ELSIF k = 91 THEN
        -- [A 06:00-08:30][T 08:30-...]; stop A moves to 08:45: the cycle starts after the handover. The handover goes:
        -- the ARCHIKO is removed, the TELIKO becomes the ARCHIKO from 08:45 (no point, no reason), the copy and 011 follow
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t0830,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g1 := (r->'ids'->>'cut_segment_id')::bigint; g2 := (r->'ids'->>'segment_id')::bigint;
        j2 := jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(jsonb_build_object('stop_id', s1a,
                'planned_from', (d + time '08:45') AT TIME ZONE 'Europe/Athens', 'planned_to', (d + time '08:50') AT TIME ZONE 'Europe/Athens')));
        r := plan_rt_update(j2 || jsonb_build_object('dry_run', true), 'test:072b', 'owner');
        r2 := plan_rt_update(j2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072b', 'owner');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN (r->>'needs_confirm')::boolean AND r->'preview'->'conflict' = 'null'::jsonb
                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'seg_removed', 'segment_id', g1,
                                'place_note', 'Lamia', 'at_athens', to_char(t0830 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI')))
                          AND (r2->>'ok')::boolean
                          AND (SELECT deleted_at IS NOT NULL FROM rt_vehicle_segments WHERE id = g1)
                          AND (SELECT from_at = (d + time '08:45') AT TIME ZONE 'Europe/Athens' AND reason IS NULL AND place_note IS NULL
                                 AND deleted_at IS NULL FROM rt_vehicle_segments WHERE id = g2)
                          AND (SELECT count(*) FROM v_rt_segments WHERE rt_id = rt1) = 1
                          AND (SELECT truck_id = trk2 AND driver_id = drv2 FROM ct_round_trips WHERE id = rt1)
                          AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL AND driver_id = drv2 AND NOT needs_review) = 1
                          AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL) = 1
                        THEN 'ok the start side: the ARCHIKO removed, the next is the ARCHIKO, copy and payroll follow'
                        ELSE 'FAIL start cut ' || r::text || ' ' || r2::text END;
      ELSIF k = 92 THEN
        -- same driver: [A 2104/Giorgos][T 2108/Giorgos]; accounting wrote an amount on Giorgos' line (011, the cycle's)
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'same_driver', true,
               'vehicle', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk2)), 'test:072b', 'owner');
        g2 := (r->'ids'->>'segment_id')::bigint;
        UPDATE dl_entries SET trip_value = 100 WHERE rt_id = rt1 AND deleted_at IS NULL;
        SELECT id INTO x FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL;
        r := plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('driver_id', drv2), 'dry_run', true), 'test:072b', 'owner');
        r2 := plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('driver_id', drv2)), 'test:072b', 'owner');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN r->'preview'->'conflict' = 'null'::jsonb AND (r2->>'ok')::boolean
                          AND (SELECT driver_id FROM rt_vehicle_segments WHERE id = g2) = drv2
                          AND (SELECT driver_id = drv1 AND trip_value = 100 AND deleted_at IS NULL FROM dl_entries WHERE id = x)
                        THEN 'ok Giorgos still drives the ARCHIKO: his line stays, the correction passes'
                        ELSE 'FAIL same driver fix ' || r::text || r2::text END;
      ELSIF k = 93 THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g2 := (r->'ids'->>'segment_id')::bigint; g1 := (r->'ids'->>'cut_segment_id')::bigint;
        r := plan_seg_remove(jsonb_build_object('segment_id', g2, 'dry_run', true), 'test:072b', 'dispatcher');
        r2 := plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'dispatcher');
        j1 := jsonb_build_object('code', 'seg_stop_moved', 'stop_id', s1c, 'from_segment_id', g2, 'to_segment_id', g1);
        verdict := CASE WHEN r->'preview'->'warnings' @> jsonb_build_array(j1) AND r2->'warnings' @> jsonb_build_array(j1)
                        THEN 'ok stop C back to 2104, said before and after' ELSE 'FAIL remove moved ' || r::text || r2::text END;
      ELSIF k = 94 THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g2 := (r->'ids'->>'segment_id')::bigint;
        m := '';
        FOR x IN 1..3 LOOP
          BEGIN
            IF x = 1 THEN
              PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1000,
                        'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh3), ' ', 'owner');
            ELSIF x = 2 THEN
              PERFORM plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('place_note', 'x')), '', 'owner');
            ELSE
              PERFORM plan_seg_remove(jsonb_build_object('segment_id', g2), NULL, 'owner');
            END IF;
            m := m || ' no error';
          EXCEPTION WHEN others THEN
            GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT;
            m := m || ' ' || hint;
          END;
        END LOOP;
        verdict := CASE WHEN m = ' plan:no_actor plan:no_actor plan:no_actor' THEN 'ok no_actor x3' ELSE 'FAIL no_actor' || m END;
      ELSIF k IN (95, 96, 97) THEN
        -- truck 3 / driver 3 in another cycle on D+1 12:00-16:00 (as cases 10-12)
        INSERT INTO ct_round_trips (model, scope, trip_type, truck_id, driver_id, date_start, date_end, start_at, end_at,
                                    status, source, created_by)
        VALUES (2, 'NATL', 'OWNED', trk3, drv3, e, e, (e + time '12:00') AT TIME ZONE 'Europe/Athens',
                e1600, 'planned', 'planner', 'test:072b') RETURNING id INTO rt3;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt3, 1, la, 'KATHODOS', (e + time '12:00') AT TIME ZONE 'Europe/Athens', e1600, 'test:072b');
        BEGIN
          IF k = 97 THEN
            PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e1000,
                      'place_note', 'Lamia', 'reason', 'vehicle_breakdown',
                      'vehicle', jsonb_build_object('trip_type', 'OWNED', 'truck_id', trk2, 'driver_id', drv3)), 'test:072b', 'owner');
          ELSE
            r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
                   'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
            PERFORM plan_seg_fix(jsonb_build_object('segment_id', (r->'ids'->>'segment_id')::bigint,
                      'set', CASE WHEN k = 95 THEN jsonb_build_object('truck_id', trk3) ELSE jsonb_build_object('driver_id', drv3) END),
                      'test:072b', 'owner');
          END IF;
          verdict := 'FAIL no error';
        EXCEPTION WHEN others THEN
          GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, hint = PG_EXCEPTION_HINT;
          verdict := CASE WHEN hint = CASE WHEN k = 95 THEN 'plan:truck_busy' ELSE 'plan:driver_busy' END
                            AND msg LIKE '%' || (SELECT code FROM ct_round_trips WHERE id = rt3)
                          THEN 'ok ' || substr(hint, 6) || ' names ' || (SELECT code FROM ct_round_trips WHERE id = rt3)
                          ELSE 'FAIL ' || coalesce(hint, '') || ' ' || msg END;
        END;
      ELSIF k IN (98, 99, 100) THEN
        PERFORM plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
                  'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2)
                  - CASE k WHEN 98 THEN 'at' WHEN 99 THEN 'reason' ELSE 'vehicle' END, 'test:072b', 'owner');
      ELSIF k = 101 THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
               'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g2 := (r->'ids'->>'segment_id')::bigint;
        -- as case 36: Nikos (T) gets a line with an amount (what 073's per-driver line will do)
        UPDATE dl_entries SET deleted_at = now(), deleted_reason = 'TEST 072b' WHERE rt_id = rt1 AND deleted_at IS NULL;
        INSERT INTO dl_entries (driver_id, entry_type, entry_date, rt_id, trip_value, source, created_by)
        VALUES (drv2, 'trip', e, rt1, 100, 'manual', 'test:072b') RETURNING id INTO x;
        r := plan_seg_remove(jsonb_build_object('segment_id', g2, 'dry_run', true), 'test:072b', 'accountant');
        r2 := plan_seg_remove(jsonb_build_object('segment_id', g2, 'dry_run', true), 'test:072b', 'owner');
        verdict := CASE WHEN r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'payroll_amount', 'dl_entry_id', x, 'amount', 100))
                          AND r->>'confirm_token' = r2->>'confirm_token'
                        THEN 'ok the accountant sees the amount' ELSE 'FAIL accountant ' || r::text END;
      ELSIF k = 102 THEN
        UPDATE ct_round_trips SET total_km = 900 WHERE id = rt1;
        j1 := jsonb_build_array((SELECT total_km FROM ct_round_trips WHERE id = rt1),
                                (SELECT to_jsonb(v) FROM ct_v_rt_revenue v WHERE v.rt_id = rt1),
                                (SELECT count(*) FROM ct_v_rt_pnl v WHERE v.id = rt1));
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430, 'place_note', 'Lamia',
               'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g2 := (r->'ids'->>'segment_id')::bigint;
        j2 := jsonb_build_array((SELECT total_km FROM ct_round_trips WHERE id = rt1),
                                (SELECT to_jsonb(v) FROM ct_v_rt_revenue v WHERE v.rt_id = rt1),
                                (SELECT count(*) FROM ct_v_rt_pnl v WHERE v.id = rt1));
        PERFORM plan_seg_fix(jsonb_build_object('segment_id', g2, 'set', jsonb_build_object('truck_id', trk3)), 'test:072b', 'owner');
        PERFORM plan_seg_remove(jsonb_build_object('segment_id', g2), 'test:072b', 'owner');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN j2 = j1 AND jsonb_build_array((SELECT total_km FROM ct_round_trips WHERE id = rt1),
                                (SELECT to_jsonb(v) FROM ct_v_rt_revenue v WHERE v.rt_id = rt1),
                                (SELECT count(*) FROM ct_v_rt_pnl v WHERE v.id = rt1)) = j1
                          AND (j1->>2)::int = 1
                        THEN 'ok revenue, km and one P&L row unchanged' ELSE 'FAIL R-47 ' || j1::text || j2::text END;
      ELSIF k IN (103, 105, 106, 107) THEN
        -- the ANODOS of review R3's probe B: X = stop C at D+1 07:00-08:00, Y = a new stop D+1 12:00-14:00 (written
        -- directly, as S), and a PLANNED change of truck and driver at D+1 09:00, between them
        UPDATE rt_stops SET planned_from = (e + time '07:00') AT TIME ZONE 'Europe/Athens',
                            planned_to = (e + time '08:00') AT TIME ZONE 'Europe/Athens' WHERE id = s1c;
        INSERT INTO rt_stops (rt_id, seq, location_id, side, planned_from, planned_to, created_by)
        VALUES (rt1, 5, ld, 'ANODOS', (e + time '12:00') AT TIME ZONE 'Europe/Athens', (e + time '14:00') AT TIME ZONE 'Europe/Athens',
                'test:072b') RETURNING id INTO z;
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e0900,
               'place_note', 'Lamia', 'reason', 'planned_driver', 'vehicle', veh3), 'test:072b', 'dispatcher');
        g1 := (r->'ids'->>'cut_segment_id')::bigint; g2 := (r->'ids'->>'segment_id')::bigint;
        IF k = 103 THEN
          -- the dispatcher swaps the two deliveries, Y first: after Y the end is D+1 09:00 = the handover time (both
          -- segments end there for a moment), after X D+1 14:00 again
          r2 := plan_rt_update(jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(
                  jsonb_build_object('stop_id', z, 'planned_from', (e + time '08:00') AT TIME ZONE 'Europe/Athens', 'planned_to', e0900),
                  jsonb_build_object('stop_id', s1c, 'planned_from', (e + time '12:00') AT TIME ZONE 'Europe/Athens',
                                     'planned_to', (e + time '14:00') AT TIME ZONE 'Europe/Athens'))), 'test:072b', 'dispatcher');
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN (SELECT from_at = (d + time '06:00') AT TIME ZONE 'Europe/Athens' AND to_at = e0900 FROM rt_vehicle_segments WHERE id = g1)
                            AND (SELECT from_at = e0900 AND to_at = (e + time '14:00') AT TIME ZONE 'Europe/Athens' FROM rt_vehicle_segments WHERE id = g2)
                            AND r2->'warnings' @> jsonb_build_array(
                                  jsonb_build_object('code', 'seg_stop_moved', 'stop_id', s1c, 'from_segment_id', g1, 'to_segment_id', g2),
                                  jsonb_build_object('code', 'seg_stop_moved', 'stop_id', z, 'from_segment_id', g2, 'to_segment_id', g1))
                          THEN 'ok one segment per edge, the swap said' ELSE 'FAIL end edge ' || r2::text END;
        ELSIF k = 106 THEN
          -- -6 hours: X D+1 01:00-02:00, Y 06:00-08:00: the cycle ends D+1 08:00, before the handover of 09:00 (H-23: it
          -- never moves with the side) - listed for management (decision 41: every role shifts), removed with the token
          j2 := jsonb_build_object('rt_id', rt1, 'shift', jsonb_build_object('side', 'ANODOS', 'delta', '-6 hours'));
          r := plan_rt_update(j2 || jsonb_build_object('dry_run', true), 'test:072b', 'management');
          r2 := plan_rt_update(j2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072b', 'management');
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN (r->>'needs_confirm')::boolean
                            AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'seg_removed', 'segment_id', g2,
                                  'reason', 'planned_driver', 'at_athens', to_char(e0900 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI')))
                            AND (r2->>'ok')::boolean AND (SELECT deleted_at IS NOT NULL FROM rt_vehicle_segments WHERE id = g2)
                            AND (SELECT g.to_at = c.end_at AND c.end_at = (e + time '08:00') AT TIME ZONE 'Europe/Athens'
                                   FROM rt_vehicle_segments g JOIN ct_round_trips c ON c.id = g.rt_id WHERE g.id = g1)
                          THEN 'ok shift back past the handover: listed, removed' ELSE 'FAIL shift cut ' || r::text || ' ' || r2::text END;
        ELSE
          r2 := plan_rt_update(jsonb_build_object('rt_id', rt1, 'shift', jsonb_build_object('side', 'ANODOS',
                  'delta', CASE k WHEN 105 THEN '1 day' ELSE '3 hours' END)), 'test:072b', 'dispatcher');
          SET CONSTRAINTS ALL IMMEDIATE;
          -- H-23: the handover stays at D+1 09:00; X now comes after it and passes to the TELIKO (said); the TELIKO
          -- follows the new end
          verdict := CASE WHEN (SELECT from_at = (d + time '06:00') AT TIME ZONE 'Europe/Athens' AND to_at = e0900 AND truck_id = trk1
                                  FROM rt_vehicle_segments WHERE id = g1)
                            AND (SELECT g.from_at = e0900 AND g.to_at = c.end_at AND g.truck_id = trk3
                                   FROM rt_vehicle_segments g JOIN ct_round_trips c ON c.id = g.rt_id WHERE g.id = g2)
                            AND (SELECT end_at FROM ct_round_trips WHERE id = rt1)
                                = CASE k WHEN 105 THEN (f + time '14:00') AT TIME ZONE 'Europe/Athens' ELSE (e + time '17:00') AT TIME ZONE 'Europe/Athens' END
                            AND r2->'warnings' @> jsonb_build_array(jsonb_build_object('code', 'seg_stop_moved', 'stop_id', s1c,
                                  'from_segment_id', g1, 'to_segment_id', g2))
                            AND jsonb_array_length(r2->'warnings') = 1
                          THEN 'ok the handover stays at its time, X changes hands, said' ELSE 'FAIL shift ' || r2::text END;
        END IF;
      ELSIF k = 104 THEN
        -- [A 06:00-08:30][T 08:30-...]; the dispatcher swaps stop A and the hub stop, A first: after A the start is
        -- 08:30 = the handover time (both segments start there for a moment), after the hub 06:00 again
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t0830,
               'place_note', 'Lamia', 'reason', 'planned_truck', 'vehicle', veh3), 'test:072b', 'dispatcher');
        g1 := (r->'ids'->>'cut_segment_id')::bigint; g2 := (r->'ids'->>'segment_id')::bigint;
        -- accounting wrote an amount on Giorgos' line: a copy that flips to driver 3 for a moment would leave it in
        -- needs_review "driver changed 3 -> 1" (011, K-13) - found re-proving review R3 (plan_seg_copy, H-2)
        UPDATE dl_entries SET trip_value = 100 WHERE rt_id = rt1 AND deleted_at IS NULL;
        j1 := (SELECT coalesce(jsonb_agg(to_jsonb(x0) - 'updated_at' ORDER BY x0.id), '[]'::jsonb) FROM dl_entries x0 WHERE x0.rt_id = rt1);
        r2 := plan_rt_update(jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(
                jsonb_build_object('stop_id', s1a, 'planned_from', t0830, 'planned_to', (d + time '08:45') AT TIME ZONE 'Europe/Athens'),
                jsonb_build_object('stop_id', s1h, 'planned_from', (d + time '06:00') AT TIME ZONE 'Europe/Athens', 'planned_to', t0800))),
              'test:072b', 'dispatcher');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN (SELECT from_at = (d + time '06:00') AT TIME ZONE 'Europe/Athens' AND to_at = t0830 AND truck_id = trk1
                                FROM rt_vehicle_segments WHERE id = g1)
                          AND (SELECT from_at = t0830 AND to_at = (e + time '14:00') AT TIME ZONE 'Europe/Athens' AND truck_id = trk3
                                 FROM rt_vehicle_segments WHERE id = g2)
                          AND (SELECT truck_id = trk1 AND driver_id = drv1 FROM ct_round_trips WHERE id = rt1)
                          AND (SELECT coalesce(jsonb_agg(to_jsonb(x0) - 'updated_at' ORDER BY x0.id), '[]'::jsonb) FROM dl_entries x0 WHERE x0.rt_id = rt1) = j1
                          AND jsonb_array_length(j1) = 1
                        THEN 'ok one segment per edge at the start, the copy and the payroll line unchanged'
                        ELSE 'FAIL start edge ' || r2::text || ' ' || j1::text || ' ' || (SELECT coalesce(jsonb_agg(to_jsonb(x0) - 'updated_at' ORDER BY x0.id), '[]'::jsonb) FROM dl_entries x0 WHERE x0.rt_id = rt1)::text END;
      ELSIF k IN (108, 111) THEN
        -- [A 2104 to D 14:30][E 2108 to D+1 10:00][T 3 to the end]; C moves to D 14:00-14:10: the cycle ends before BOTH
        -- handovers
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t1430,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g1 := (r->'ids'->>'cut_segment_id')::bigint; g2 := (r->'ids'->>'segment_id')::bigint;
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e1000,
               'place_note', 'Larisa', 'reason', 'driver_hours', 'vehicle', veh3), 'test:072b', 'owner');
        g3 := (r->'ids'->>'segment_id')::bigint;
        IF k = 108 THEN
          -- the accountant (decision 41): one list with BOTH lines in time order, one token, both removed
          j2 := jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(jsonb_build_object('stop_id', s1c,
                  'planned_from', (d + time '14:00') AT TIME ZONE 'Europe/Athens', 'planned_to', (d + time '14:10') AT TIME ZONE 'Europe/Athens')));
          r := plan_rt_update(j2 || jsonb_build_object('dry_run', true), 'test:072b', 'accountant');
          r2 := plan_rt_update(j2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072b', 'accountant');
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN (SELECT string_agg(c->>'at_athens', ', ' ORDER BY (c->>'at')::timestamptz) FROM jsonb_array_elements(r->'consequences') c
                                 WHERE c->>'kind' = 'seg_removed')
                                 = to_char(t1430 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI') || ', ' || to_char(e1000 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI')
                            AND (r2->>'ok')::boolean
                            AND (SELECT count(*) FROM rt_vehicle_segments WHERE id IN (g2, g3) AND deleted_at IS NOT NULL) = 2
                            AND (SELECT g.to_at = c.end_at AND c.end_at = (d + time '14:10') AT TIME ZONE 'Europe/Athens'
                                   FROM rt_vehicle_segments g JOIN ct_round_trips c ON c.id = g.rt_id WHERE g.id = g1)
                          THEN 'ok both handovers listed and removed' ELSE 'FAIL two handovers ' || r::text || ' ' || r2::text END;
        ELSE
          -- the net (review R3, DB finding 5): a write outside plan_* bypasses the list - seg_outside names both times
          BEGIN
            -- the last stop C (no leg) taken away directly: the cycle ends D 14:00, before both handovers (deferred, as
            -- inside any plan_*: the window follows the stop before the rules look)
            SET CONSTRAINTS ALL DEFERRED;
            UPDATE rt_stops SET deleted_at = now(), deleted_reason = 'TEST 072b', deleted_by = 'test:072b' WHERE id = s1c;
            SET CONSTRAINTS ALL IMMEDIATE;
          EXCEPTION WHEN others THEN
            GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT, hint = PG_EXCEPTION_HINT;
            -- the refusal goes on as it came (want plan:seg_outside) only with BOTH times in its detail
            IF hint = 'plan:seg_outside'
               AND msg LIKE '%seg_outside:' || (SELECT code FROM ct_round_trips WHERE id = rt1) || ' '
                            || to_char(t1430 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI') || ', '
                            || to_char(e1000 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI') THEN
              RAISE;
            END IF;
            RAISE EXCEPTION 'net: % %', coalesce(hint, ''), msg USING HINT = 'plan:net_detail_wrong';
          END;
        END IF;
      ELSIF k IN (109, 115) THEN
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e1000,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        IF k = 109 THEN
          -- the token belongs to the change it was shown for: another stop window is another list
          r := plan_rt_update(jsonb_build_object('rt_id', rt1, 'dry_run', true, 'stops', jsonb_build_array(
                 jsonb_build_object('stop_id', s1c, 'planned_from', t1500, 'planned_to', t1600))), 'test:072b', 'owner');
          PERFORM plan_rt_update(jsonb_build_object('rt_id', rt1, 'confirm_token', r->>'confirm_token', 'stops', jsonb_build_array(
                    jsonb_build_object('stop_id', s1c, 'planned_from', (d + time '14:00') AT TIME ZONE 'Europe/Athens',
                                       'planned_to', (d + time '14:10') AT TIME ZONE 'Europe/Athens'))), 'test:072b', 'owner');
        ELSE
          -- C later (D+1 12:00-15:00): every handover stays inside - the dry run is 072's, the change needs no token
          j2 := jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(jsonb_build_object('stop_id', s1c,
                  'planned_from', (e + time '12:00') AT TIME ZONE 'Europe/Athens', 'planned_to', e1500)));
          r := plan_rt_update(j2 || jsonb_build_object('dry_run', true), 'test:072b', 'warehouse');
          r2 := plan_rt_update(j2, 'test:072b', 'warehouse');
          SET CONSTRAINTS ALL IMMEDIATE;
          verdict := CASE WHEN NOT (r ? 'needs_confirm') AND NOT (r ? 'confirm_token') AND NOT (r ? 'consequences')
                            AND r->'preview'->'conflict' = 'null'::jsonb AND (r2->>'ok')::boolean
                            AND (SELECT count(*) FROM v_rt_segments WHERE rt_id = rt1) = 2
                          THEN 'ok nothing removed, no list, no token' ELSE 'FAIL no cut ' || r::text END;
        END IF;
      ELSIF k = 110 THEN
        -- the start side by a Move: K (A -> B) goes back to waiting, A and B are swept, the cycle starts at the hub 09:00,
        -- after the handover of 08:30. Giorgos (the ARCHIKO) leaves the cycle, his line has an amount. N stays (ANODOS).
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pk)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072b', 'owner');
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pn)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'ANODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'c', 'stop_id', s1c),
                                             jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', e1500, 'planned_to', e1600))),
                  'test:072b', 'owner');
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t0830,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g1 := (r->'ids'->>'cut_segment_id')::bigint; g2 := (r->'ids'->>'segment_id')::bigint;
        UPDATE dl_entries SET trip_value = 100 WHERE rt_id = rt1 AND deleted_at IS NULL;
        SELECT id INTO x FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL;
        j2 := jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(pk)), 'target', jsonb_build_object('wait', true));
        r := plan_move_pieces(j2 || jsonb_build_object('dry_run', true), 'test:072b', 'owner');
        r2 := plan_move_pieces(j2 || jsonb_build_object('dry_run', true), 'test:072b', 'dispatcher');
        j1 := plan_move_pieces(j2 || jsonb_build_object('confirm_token', r2->>'confirm_token'), 'test:072b', 'dispatcher');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN r->'consequences' @> jsonb_build_array(
                               jsonb_build_object('kind', 'seg_removed', 'segment_id', g1, 'at_athens', to_char(t0830 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI')),
                               jsonb_build_object('kind', 'payroll_amount', 'dl_entry_id', x, 'amount', 100, 'month', to_char(d, 'YYYY-MM')))
                          AND r2::text NOT LIKE '%"amount"%' AND r2->>'confirm_token' = r->>'confirm_token'
                          AND (j1->>'ok')::boolean
                          AND (SELECT deleted_at IS NOT NULL AND deleted_reason LIKE '%(test:072b, plan_move_pieces)' FROM dl_entries WHERE id = x)
                          AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND needs_review) = 0
                          AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL AND driver_id = drv2) = 1
                          AND (SELECT from_at = (d + time '09:00') AT TIME ZONE 'Europe/Athens' AND reason IS NULL FROM rt_vehicle_segments WHERE id = g2)
                          AND (SELECT driver_id = drv2 FROM ct_round_trips WHERE id = rt1)
                        THEN 'ok the ARCHIKO and its line with an amount go after the token, 0 needs_review'
                        ELSE 'FAIL start cut payroll ' || r::text || ' ' || j1::text END;
      ELSIF k IN (112, 113, 114) THEN
        -- one act, each role that may do it (decision 41; Delete owner + dispatcher, decision 26), each undone after
        IF k IN (112, 114) THEN
          PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pk)),
                    'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                    'test:072b', 'owner');
          PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pn)),
                    'target', jsonb_build_object('rt_id', rt1, 'side', 'ANODOS'),
                    'stops', jsonb_build_array(jsonb_build_object('ref', 'c', 'stop_id', s1c),
                                               jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', e1500, 'planned_to', e1600))),
                    'test:072b', 'owner');
        END IF;
        -- the start side, with what is real before 073: the cycle's ONE payroll line is the ARCHIKO's (Giorgos), with an
        -- amount; the handover at 08:30 and the act takes the stops before it (A, B), so Giorgos leaves the cycle
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t0830,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g1 := (r->'ids'->>'cut_segment_id')::bigint; g2 := g1;
        UPDATE dl_entries SET trip_value = 100 WHERE rt_id = rt1 AND deleted_at IS NULL;
        SELECT id INTO x FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL;
        j2 := CASE k WHEN 112 THEN jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(pk)),
                                                       'target', jsonb_build_object('wait', true))
                     WHEN 113 THEN jsonb_build_object('rt_id', rt1, 'stops', jsonb_build_array(jsonb_build_object('stop_id', s1a,
                                     'planned_from', (d + time '08:45') AT TIME ZONE 'Europe/Athens',
                                     'planned_to', (d + time '08:50') AT TIME ZONE 'Europe/Athens')))
                     ELSE jsonb_build_object('nat_order_id', nk, 'reason', 'TEST 072b') END;
        m := ''; tok := NULL;
        FOREACH rl IN ARRAY CASE WHEN k = 114 THEN ARRAY['owner', 'dispatcher']
                                 ELSE ARRAY['owner', 'dispatcher', 'management', 'accountant', 'warehouse'] END LOOP
          BEGIN
            SET CONSTRAINTS ALL DEFERRED;
            IF k = 112 THEN
              r := plan_move_pieces(j2 || jsonb_build_object('dry_run', true), 'test:072b', rl);
              r2 := plan_move_pieces(j2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072b', rl);
            ELSIF k = 113 THEN
              r := plan_rt_update(j2 || jsonb_build_object('dry_run', true), 'test:072b', rl);
              r2 := plan_rt_update(j2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072b', rl);
            ELSE
              r := plan_delete(j2 || jsonb_build_object('dry_run', true), 'test:072b', rl);
              r2 := plan_delete(j2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072b', rl);
            END IF;
            SET CONSTRAINTS ALL IMMEDIATE;
            m := m || ' ' || rl || CASE WHEN (r->>'needs_confirm')::boolean
                                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'seg_removed', 'segment_id', g2,
                                                'place_note', 'Lamia', 'at_athens', to_char(t0830 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI')))
                                          AND CASE WHEN rl IN ('owner', 'accountant') THEN r::text LIKE '%"amount": 100%'
                                                   ELSE r::text NOT LIKE '%"amount"%' END
                                          AND (r2->>'ok')::boolean
                                          AND (SELECT deleted_at IS NOT NULL FROM rt_vehicle_segments WHERE id = g2)
                                          AND (SELECT deleted_at IS NOT NULL FROM dl_entries WHERE id = x)
                                          AND (SELECT count(*) FROM audit_log WHERE table_name = 'rt_vehicle_segments' AND record_id = g2::text
                                                 AND action = 'delete' AND role = rl) = 1
                                        THEN ':ok' ELSE ':FAIL ' || r::text || ' ' || r2::text END;
            IF tok IS NULL THEN tok := r->>'confirm_token';
            ELSIF tok IS DISTINCT FROM r->>'confirm_token' THEN m := m || ' (another token)'; END IF;
            RAISE EXCEPTION 'role undo' USING HINT = 'wn072b_role_undo';
          EXCEPTION WHEN others THEN
            GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT;
            IF hint IS DISTINCT FROM 'wn072b_role_undo' THEN m := m || ' ' || rl || ':ERROR ' || coalesce(hint, '') || ' ' || msg; END IF;
          END;
        END LOOP;
        SET CONSTRAINTS ALL DEFERRED;
        verdict := CASE WHEN m = CASE WHEN k = 114 THEN ' owner:ok dispatcher:ok'
                                      ELSE ' owner:ok dispatcher:ok management:ok accountant:ok warehouse:ok' END
                        THEN 'ok every role:' || m ELSE 'FAIL roles' || m END;
      ELSIF k = 116 THEN
        -- only K (A -> B) on R1; the hub stop and C have no leg (written directly, as S). The handover at 08:30; K goes
        -- back to waiting: A and B are swept, the window narrows to the hub (09:00) - past the handover - and the cycle,
        -- left without a leg, is cancelled. The list names both; the token does both (before (b): seg_outside)
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pk)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072b', 'owner');
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t0830,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'owner');
        g1 := (r->'ids'->>'cut_segment_id')::bigint; g2 := (r->'ids'->>'segment_id')::bigint;
        j2 := jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(pk)), 'target', jsonb_build_object('wait', true));
        r := plan_move_pieces(j2 || jsonb_build_object('dry_run', true), 'test:072b', 'dispatcher');
        r2 := plan_move_pieces(j2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072b', 'dispatcher');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'rt_cancelled', 'rt_id', rt1),
                               jsonb_build_object('kind', 'seg_removed', 'segment_id', g1))
                          AND (r2->>'ok')::boolean AND r2->'ids'->'cancelled_rt_ids' = jsonb_build_array(rt1)
                          AND (SELECT status = 'cancelled' FROM ct_round_trips WHERE id = rt1)
                          AND (SELECT deleted_at IS NOT NULL FROM rt_vehicle_segments WHERE id = g1)
                          AND (SELECT rt_cancelled AND reason IS NULL AND deleted_at IS NULL FROM rt_vehicle_segments WHERE id = g2)
                        THEN 'ok cancelled, the handover listed and removed' ELSE 'FAIL emptied cut ' || r::text || ' ' || r2::text END;
      ELSIF k = 117 THEN
        -- K on the KATHODOS, N on the ANODOS (C -> a new stop D), the breakdown at D+1 09:00 (the TELIKO holds C and D).
        -- N moves to the KATHODOS of the SAME cycle (072: same_rt only when the side does not change), on two new
        -- stops C and D on D 10:15 - 11:45: the old C and D are swept, the cycle ends D 14:00 - past the handover. The
        -- target is a source, so its list is read with the request's stops (plan_h_seg_cut_keep); before review R5 this
        -- Move was refused at COMMIT by the net (seg_outside), the exception the owner's answer does not have.
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pk)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072b', 'owner');
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pn)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'ANODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'c', 'stop_id', s1c),
                                             jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', e1500, 'planned_to', e1600))),
                  'test:072b', 'owner');
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e0900,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'dispatcher');
        g2 := (r->'ids'->>'segment_id')::bigint; g1 := (r->'ids'->>'cut_segment_id')::bigint;
        j2 := jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(pn)),
                'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                'stops', jsonb_build_array(
                  jsonb_build_object('ref', 'c2', 'location_id', lc, 'side', 'KATHODOS',
                                     'planned_from', (d + time '10:15') AT TIME ZONE 'Europe/Athens',
                                     'planned_to', (d + time '10:45') AT TIME ZONE 'Europe/Athens'),
                  jsonb_build_object('ref', 'd2', 'location_id', ld, 'side', 'KATHODOS',
                                     'planned_from', (d + time '11:00') AT TIME ZONE 'Europe/Athens',
                                     'planned_to', (d + time '11:45') AT TIME ZONE 'Europe/Athens')));
        r := plan_move_pieces(j2 || jsonb_build_object('dry_run', true), 'test:072b', 'warehouse');
        r2 := plan_move_pieces(j2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072b', 'warehouse');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN (r->>'needs_confirm')::boolean
                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'seg_removed', 'rt_id', rt1,
                                'segment_id', g2, 'place_note', 'Lamia', 'at_athens', to_char(e0900 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI')))
                          AND (r2->>'ok')::boolean AND r2->'ids'->>'rt_id' = rt1::text
                          AND (SELECT deleted_at IS NOT NULL AND deleted_reason LIKE '%(test:072b, plan_move_pieces)' FROM rt_vehicle_segments WHERE id = g2)
                          AND (SELECT g.to_at = c.end_at AND c.end_at = (d + time '14:00') AT TIME ZONE 'Europe/Athens' AND g.deleted_at IS NULL
                                 FROM rt_vehicle_segments g JOIN ct_round_trips c ON c.id = g.rt_id WHERE g.id = g1)
                          AND (SELECT count(*) FROM v_rt_segments WHERE rt_id = rt1) = 1
                          AND (SELECT count(*) FROM audit_log WHERE table_name = 'rt_vehicle_segments' AND record_id = g2::text
                                 AND action = 'delete' AND role = 'warehouse') = 1
                        THEN 'ok own cycle: listed, removed after the token' ELSE 'FAIL own cycle ' || r::text || ' ' || r2::text END;
      ELSIF k = 118 THEN
        -- the handover at D+1 09:00; C named twice: first narrowed to D 14:05 - 14:20 (the cycle would end before
        -- the handover), then back to its own window. 072's step 1 applies both in order (nothing would be cut), the
        -- list read only the first: a stale_confirm nobody can clear (and in the other order, seg_outside)
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e0900,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'dispatcher');
        r := plan_rt_update(jsonb_build_object('rt_id', rt1, 'dry_run', true, 'stops', jsonb_build_array(
               jsonb_build_object('stop_id', s1c, 'planned_from', (d + time '14:05') AT TIME ZONE 'Europe/Athens',
                                  'planned_to', (d + time '14:20') AT TIME ZONE 'Europe/Athens'),
               jsonb_build_object('stop_id', s1c, 'planned_from', (e + time '12:00') AT TIME ZONE 'Europe/Athens',
                                  'planned_to', (e + time '14:00') AT TIME ZONE 'Europe/Athens'))), 'test:072b', 'dispatcher');
        verdict := 'ok no refusal ' || r::text;
      ELSIF k = 119 THEN
        -- 117 with the old C (ANODOS) named by stop_id too. plan_h_stop_at gives the piece's pickup at C to the new C2,
        -- on the target side: the old C keeps no leg and is swept, the cycle ends D 14:00 - past the handover. Before
        -- review R6 the list counted every named stop as kept: no list, a token, and the net refused (seg_outside).
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pk)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072b', 'owner');
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pn)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'ANODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'c', 'stop_id', s1c),
                                             jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', e1500, 'planned_to', e1600))),
                  'test:072b', 'owner');
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', e0900,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'dispatcher');
        g2 := (r->'ids'->>'segment_id')::bigint; g1 := (r->'ids'->>'cut_segment_id')::bigint;
        j2 := jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(pn)),
                'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                'stops', jsonb_build_array(
                  jsonb_build_object('ref', 'cx', 'stop_id', s1c),
                  jsonb_build_object('ref', 'c2', 'location_id', lc, 'side', 'KATHODOS',
                                     'planned_from', (d + time '10:15') AT TIME ZONE 'Europe/Athens',
                                     'planned_to', (d + time '10:45') AT TIME ZONE 'Europe/Athens'),
                  jsonb_build_object('ref', 'd2', 'location_id', ld, 'side', 'KATHODOS',
                                     'planned_from', (d + time '11:00') AT TIME ZONE 'Europe/Athens',
                                     'planned_to', (d + time '11:45') AT TIME ZONE 'Europe/Athens')));
        r := plan_move_pieces(j2 || jsonb_build_object('dry_run', true), 'test:072b', 'warehouse');
        r2 := plan_move_pieces(j2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072b', 'warehouse');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN (r->>'needs_confirm')::boolean
                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'seg_removed', 'rt_id', rt1,
                                'segment_id', g2, 'place_note', 'Lamia', 'at_athens', to_char(e0900 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI')))
                          AND (r2->>'ok')::boolean
                          AND (SELECT deleted_at IS NOT NULL FROM rt_stops WHERE id = s1c)
                          AND (SELECT deleted_at IS NOT NULL AND deleted_reason LIKE '%(test:072b, plan_move_pieces)' FROM rt_vehicle_segments WHERE id = g2)
                          AND (SELECT g.to_at = c.end_at AND c.end_at = (d + time '14:00') AT TIME ZONE 'Europe/Athens' AND g.deleted_at IS NULL
                                 FROM rt_vehicle_segments g JOIN ct_round_trips c ON c.id = g.rt_id WHERE g.id = g1)
                          AND (SELECT count(*) FROM v_rt_segments WHERE rt_id = rt1) = 1
                        THEN 'ok a named stop the put does not use: swept, listed, removed after the token'
                        ELSE 'FAIL named unused stop ' || r::text || ' ' || r2::text END;
      ELSIF k = 120 THEN
        -- the handover at D 08:30 (the ARCHIKO: truck 1 / Giorgos until then). K moves from the KATHODOS to the ANODOS
        -- of the SAME cycle, on two new stops A and B on D+1 16:30 - 18:00: the old A and B are swept, the cycle starts
        -- at the hub 09:00 - past the handover. The ARCHIKO is outside: listed and removed after the token, the next
        -- becomes the ARCHIKO from the new start; the cycle's copy and its payroll line follow truck 2 / Nikos.
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pk)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'KATHODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'a', 'stop_id', s1a), jsonb_build_object('ref', 'b', 'stop_id', s1b))),
                  'test:072b', 'owner');
        PERFORM plan_put_pieces(jsonb_build_object('pieces', jsonb_build_array(jsonb_build_object('piece_id', pn)),
                  'target', jsonb_build_object('rt_id', rt1, 'side', 'ANODOS'),
                  'stops', jsonb_build_array(jsonb_build_object('ref', 'c', 'stop_id', s1c),
                                             jsonb_build_object('ref', 'd', 'location_id', ld, 'planned_from', e1500, 'planned_to', e1600))),
                  'test:072b', 'owner');
        r := plan_seg_change(jsonb_build_object('request_id', gen_random_uuid(), 'rt_id', rt1, 'at', t0830,
               'place_note', 'Lamia', 'reason', 'vehicle_breakdown', 'vehicle', veh2), 'test:072b', 'dispatcher');
        g1 := (r->'ids'->>'cut_segment_id')::bigint; g2 := (r->'ids'->>'segment_id')::bigint;
        j2 := jsonb_build_object('from', jsonb_build_object('piece_ids', jsonb_build_array(pk)),
                'target', jsonb_build_object('rt_id', rt1, 'side', 'ANODOS'),
                'stops', jsonb_build_array(
                  jsonb_build_object('ref', 'a2', 'location_id', la, 'side', 'ANODOS',
                                     'planned_from', (e + time '16:30') AT TIME ZONE 'Europe/Athens',
                                     'planned_to', (e + time '17:00') AT TIME ZONE 'Europe/Athens'),
                  jsonb_build_object('ref', 'b2', 'location_id', lb, 'side', 'ANODOS',
                                     'planned_from', (e + time '17:30') AT TIME ZONE 'Europe/Athens',
                                     'planned_to', (e + time '18:00') AT TIME ZONE 'Europe/Athens')));
        r := plan_move_pieces(j2 || jsonb_build_object('dry_run', true), 'test:072b', 'management');
        r2 := plan_move_pieces(j2 || jsonb_build_object('confirm_token', r->>'confirm_token'), 'test:072b', 'management');
        SET CONSTRAINTS ALL IMMEDIATE;
        verdict := CASE WHEN (r->>'needs_confirm')::boolean
                          AND r->'consequences' @> jsonb_build_array(jsonb_build_object('kind', 'seg_removed', 'rt_id', rt1,
                                'segment_id', g1, 'place_note', 'Lamia', 'at_athens', to_char(t0830 AT TIME ZONE 'Europe/Athens', 'DD/MM HH24:MI')))
                          AND (r2->>'ok')::boolean AND r2->'ids'->>'rt_id' = rt1::text
                          AND (SELECT deleted_at IS NOT NULL AND deleted_reason LIKE '%(test:072b, plan_move_pieces)' FROM rt_vehicle_segments WHERE id = g1)
                          AND (SELECT count(*) FROM v_rt_segments WHERE rt_id = rt1) = 1
                          AND (SELECT g.from_at = c.start_at AND c.start_at = (d + time '09:00') AT TIME ZONE 'Europe/Athens'
                                      AND g.to_at = c.end_at AND c.end_at = (e + time '18:00') AT TIME ZONE 'Europe/Athens'
                                      AND g.reason IS NULL AND g.place_note IS NULL AND g.deleted_at IS NULL
                                      AND g.truck_id = trk2 AND g.driver_id = drv2
                                 FROM rt_vehicle_segments g JOIN ct_round_trips c ON c.id = g.rt_id WHERE g.id = g2)
                          AND (SELECT truck_id = trk2 AND driver_id = drv2 FROM ct_round_trips WHERE id = rt1)
                          AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL AND driver_id = drv2) = 1
                          AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND deleted_at IS NULL AND driver_id <> drv2) = 0
                          AND (SELECT count(*) FROM dl_entries WHERE rt_id = rt1 AND needs_review) = 0
                          AND (SELECT count(*) FROM audit_log WHERE table_name = 'rt_vehicle_segments' AND record_id = g1::text
                                 AND action = 'delete' AND role = 'management') = 1
                        THEN 'ok own cycle from the start: the ARCHIKO listed and removed, the copy and the line on driver 2'
                        ELSE 'FAIL own cycle start ' || r::text || ' ' || r2::text END;
      -- @case (each task adds its "ELSIF k = <n> THEN" branches above this line)
      END IF;
      SET CONSTRAINTS ALL IMMEDIATE;
      -- @verdict
      IF want[k] <> 'ok' THEN verdict := 'FAIL no error'; END IF;
      RAISE EXCEPTION 'wn072b undo' USING HINT = 'wn072b_undo';
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS hint = PG_EXCEPTION_HINT, msg = MESSAGE_TEXT, cname = CONSTRAINT_NAME, st = RETURNED_SQLSTATE;
      got := CASE WHEN hint = 'wn072b_undo' THEN coalesce(verdict, 'FAIL no verdict')
                  WHEN hint LIKE 'plan:%' THEN hint
                  WHEN coalesce(cname, '') <> '' THEN 'con:' || cname
                  ELSE 'state:' || st END;
      IF (want[k] = 'ok' AND got LIKE 'ok%') OR got = want[k] THEN
        ok := ok + 1; res := res || k::text;
      ELSE
        bad := bad + 1; res := res || (k || ' FAIL want ' || want[k] || ' got ' || got || ' (' || msg || ')');
      END IF;
    END;
  END LOOP;
  RAISE EXCEPTION 'RULES TEST 072b finished - EVERYTHING UNDONE, nothing kept. Result: % OK, % FAIL  ||  %',
    ok, bad, array_to_string(res, ' | ');
END
$t072b$;
