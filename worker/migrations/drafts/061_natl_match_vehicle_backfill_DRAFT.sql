-- 061 — ΑΝΟΔΟΣ loads matched under an assigned ΚΑΘΟΔΟΣ but left without a
-- vehicle (report national-readiness 5/10, §4 #5, UX-03).
-- ✅ ΕΚΤΕΛΕΣΤΗΚΕ 4/10/2026 (owner, evening — after §8.4: the 11 old national
--    orders 24/8–14/9 are REAL). Verified with SELECT: loads 99/102/103 =
--    Assigned with the same vehicle as 80/76/77 · still_uncovered 0 · audit
--    'migration:061' = 3 · ct_rt_legs for 99/102/103 = 0 · NATL RT 0 · new
--    payroll lines 0 · INTL fingerprint unchanged.
-- Was: owner runs it, after 15:00, only after his explicit go in the chat.
--
-- WHY: until 4/10/2026 matching an ΑΝΟΔΟΣ to a ΚΑΘΟΔΟΣ (drag, or «νέα άνοδος» from
-- the empty cell) wrote only 'Matched Load'. Weekly National drew the pair under
-- the ΚΑΘΟΔΟΣ vehicle (covered) while the ΑΝΟΔΟΣ row in the base stayed Pending
-- with no truck/driver. The front is fixed on branch fix/wn-wave1
-- (_wnVehicleForSn in modules/weekly_natl.js); this repairs the 3 rows the old
-- rule left behind, by the same rule: the ΑΝΟΔΟΣ takes the vehicle of its
-- ΚΑΘΟΔΟΣ, Status Pending → Assigned, partner_rate untouched (owner §8.5 open).
--
-- Measured 4/10/2026 (SELECT only), all 4 live matched pairs:
--   ΚΑΘΟΔΟΣ 73 → ΑΝΟΔΟΣ 74   ok (both truck 10 / driver 33)            — not touched
--   ΚΑΘΟΔΟΣ 80 → ΑΝΟΔΟΣ 99   80: truck 26, trailer 8, driver 37 · 99: none, Pending
--   ΚΑΘΟΔΟΣ 76 → ΑΝΟΔΟΣ 102  76: truck 5, driver 125            · 102: none, Pending
--   ΚΑΘΟΔΟΣ 77 → ΑΝΟΔΟΣ 103  77: truck 5, driver 125            · 103: none, Pending
-- All three are own fleet (no partner on either side).
--
-- RT / payroll: migration 034 IS LIVE (executed 4/10/2026). Its trigger
-- rt_sync_national_load (AFTER UPDATE OF status, truck_id, driver_id, … ON
-- national_loads) creates a NATL round trip — and so a payroll line — only for
-- a load executed from 5/10/2026 (Athens: first of loading / delivery / actual
-- delivery / creation), or follows a leg that already exists. These three load
-- 7/9, 7/9 and 9/9 (Athens) and have NO ct_rt_legs row (0 of 243 legs carry a
-- nat_load_id), so setting their vehicle creates no RT and no payroll line —
-- verified read-only 4/10/2026 (dates + trigger source + leg count). The
-- block proves it again after the update (0 new legs for 99/102/103).
--
-- Owner check BEFORE running (answered 4/10: REAL, §8.4): 99/102/103 come from
-- national orders 8, 13, 14 (loading 7/9 and 9/9) — inside the «11 old
-- national orders 24/8–14/9» of decision §8.4. Had they been tests, this
-- would have assigned a vehicle to a test load.
-- Only the national LOAD is touched; the source national order's Status is
-- left as is (the board's own popover does not touch it for a matched leg).
--
-- ONE statement: the Supabase SQL editor is NOT atomic across statements
-- (lesson of 056, 3/10/2026), so the guard, the change, the audit lines and
-- the proof live in ONE DO block — any RAISE rolls back everything.
-- Reversible: UPDATE national_loads SET truck_id=NULL, trailer_id=NULL,
--   driver_id=NULL, status='Pending' WHERE id IN (99,102,103);
--   (and DELETE FROM audit_log WHERE actor='migration:061').

-- BEFORE (read only) — expect 3 rows, sn_* all NULL, sn_status Pending
SELECT sn.id sn_id, sn.status sn_status, sn.truck_id sn_truck, sn.trailer_id sn_trailer, sn.driver_id sn_driver, sn.partner_id sn_partner,
       ns.id ns_id, ns.truck_id, ns.trailer_id, ns.driver_id, ns.partner_id
FROM national_loads sn JOIN national_loads ns ON ns.legacy_id = sn.matched_load
WHERE sn.id IN (99, 102, 103) ORDER BY sn.id;

DO $$
DECLARE
  n_ok   int;
  n_upd  int;
  n_aud  int;
  n_bad  int;
  n_legs int;
BEGIN
  -- Guard: exactly the 3 measured pairs, still in the measured state.
  SELECT count(*) INTO n_ok
  FROM national_loads sn
  JOIN national_loads ns ON ns.legacy_id = sn.matched_load AND ns.matched_load = sn.legacy_id
  WHERE (sn.id, ns.id) IN ((99, 80), (102, 76), (103, 77))
    AND sn.direction = 'South→North' AND ns.direction = 'North→South'
    AND sn.deleted_at IS NULL AND ns.deleted_at IS NULL
    AND sn.truck_id IS NULL AND sn.trailer_id IS NULL AND sn.driver_id IS NULL AND sn.partner_id IS NULL
    AND sn.status = 'Pending'
    AND ns.truck_id IS NOT NULL AND ns.partner_id IS NULL;
  IF n_ok <> 3 THEN
    RAISE EXCEPTION '061: expected the 3 measured pairs (99←80, 102←76, 103←77) unchanged, found % — nothing written', n_ok;
  END IF;

  WITH upd AS (
    UPDATE national_loads sn
       SET truck_id = ns.truck_id, trailer_id = ns.trailer_id, driver_id = ns.driver_id,
           is_partner_trip = false, status = 'Assigned'
      FROM national_loads ns
     WHERE ns.legacy_id = sn.matched_load
       AND sn.id IN (99, 102, 103)
       AND sn.truck_id IS NULL AND sn.partner_id IS NULL AND sn.status = 'Pending'
    RETURNING sn.id, ns.id AS ns_id, sn.truck_id, sn.trailer_id, sn.driver_id
  ), aud AS (
    INSERT INTO audit_log (actor, role, action, table_name, record_id, before_data, after_data, created_at)
    SELECT 'migration:061', 'system', 'update', 'national_loads', id::text,
           jsonb_build_object('truck_id', null, 'trailer_id', null, 'driver_id', null, 'status', 'Pending'),
           jsonb_build_object('truck_id', truck_id, 'trailer_id', trailer_id, 'driver_id', driver_id, 'status', 'Assigned',
                              'reason', 'ΑΝΟΔΟΣ takes the vehicle of its matched ΚΑΘΟΔΟΣ ' || ns_id || ' (061, §4 #5)'),
           now()
    FROM upd
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM upd), (SELECT count(*) FROM aud) INTO n_upd, n_aud;
  IF n_upd <> 3 OR n_aud <> 3 THEN
    RAISE EXCEPTION '061: updated % rows, % audit lines (expected 3 / 3) — rolled back', n_upd, n_aud;
  END IF;

  -- Proof inside the same block: each ΑΝΟΔΟΣ now carries exactly its ΚΑΘΟΔΟΣ vehicle.
  SELECT count(*) INTO n_bad
  FROM national_loads sn JOIN national_loads ns ON ns.legacy_id = sn.matched_load
  WHERE sn.id IN (99, 102, 103)
    AND (sn.truck_id IS DISTINCT FROM ns.truck_id OR sn.trailer_id IS DISTINCT FROM ns.trailer_id
         OR sn.driver_id IS DISTINCT FROM ns.driver_id OR sn.partner_id IS NOT NULL OR sn.status <> 'Assigned');
  IF n_bad <> 0 THEN
    RAISE EXCEPTION '061: % ΑΝΟΔΟΣ rows do not match their ΚΑΘΟΔΟΣ after the update — rolled back', n_bad;
  END IF;

  -- Proof: 034's trigger ran on this UPDATE and must have created nothing —
  -- the loads are before its 5/10 cut. A leg here would mean an RT + payroll
  -- line for an old September trip: roll back and look.
  SELECT count(*) INTO n_legs FROM ct_rt_legs WHERE nat_load_id IN (99, 102, 103);
  IF n_legs <> 0 THEN
    RAISE EXCEPTION '061: % ct_rt_legs now point at loads 99/102/103 (034 created a round trip) — rolled back', n_legs;
  END IF;

  RAISE NOTICE '061 ok: % ΑΝΟΔΟΣ loads got their ΚΑΘΟΔΟΣ vehicle, % audit lines, 0 round-trip legs', n_upd, n_aud;
END $$;

-- AFTER (read only) — expect 3 rows, sn_truck = truck_id etc., sn_status Assigned;
-- and 0 matched pairs anywhere with an assigned ΚΑΘΟΔΟΣ and a vehicle-less ΑΝΟΔΟΣ.
SELECT sn.id sn_id, sn.status sn_status, sn.truck_id sn_truck, sn.trailer_id sn_trailer, sn.driver_id sn_driver,
       ns.id ns_id, ns.truck_id, ns.trailer_id, ns.driver_id
FROM national_loads sn JOIN national_loads ns ON ns.legacy_id = sn.matched_load
WHERE sn.id IN (99, 102, 103) ORDER BY sn.id;
SELECT count(*) AS still_uncovered   -- expect 0
FROM national_loads ns JOIN national_loads sn ON sn.legacy_id = ns.matched_load
WHERE ns.direction = 'North→South' AND ns.deleted_at IS NULL AND sn.deleted_at IS NULL
  AND (ns.truck_id IS NOT NULL OR ns.partner_id IS NOT NULL)
  AND sn.truck_id IS NULL AND sn.partner_id IS NULL;
SELECT count(*) AS audit_lines FROM audit_log WHERE actor = 'migration:061';   -- expect 3
SELECT count(*) AS rt_legs FROM ct_rt_legs WHERE nat_load_id IN (99, 102, 103);  -- expect 0 (034 cut 5/10)
