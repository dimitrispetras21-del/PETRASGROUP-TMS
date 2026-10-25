-- id: B-92
-- title: Ίδιο φορτηγό ή ίδιος οδηγός σε δύο τμήματα οχήματος την ίδια ώρα
-- flows: F-23,F-14
-- severity: P1
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: ct_round_trips
-- impact: Ένα φορτηγό ή ένας οδηγός είναι γραμμένος σε δύο κύκλους (ή δύο τμήματα) ταυτόχρονα: ένας από τους δύο δεν θα εκτελεστεί όπως φαίνεται, η μισθοδοσία και το DKV πάνε σε λάθος κύκλο.
-- next: Owner: τα δύο RT του @ids, v_rt_segments. Η βάση το αρνείται (EXCLUDE rt_v2_truck_once / rt_v2_driver_once στα τμήματα): ένα μη μηδενικό σημαίνει ότι το EXCLUDE λείπει (072b verify: exclude_on_segments = 2).
-- exceptions: Κύκλοι ακυρωμένοι και τμήματα αφαιρεμένα δεν μετρούν (όπως το EXCLUDE). Τμήματα συνεργάτη δεν έχουν δικό μας φορτηγό ή οδηγό.
-- tolerance: 0
-- source: DRAFT 072b (plan vehicle handover, spec 6 «ίδιος οδηγός σε δύο τμήματα») · PGlite 25/10: 0 on the production copy, red with the EXCLUDE dropped
-- enabled: yes
SELECT count(*) FROM rt_vehicle_segments a JOIN rt_vehicle_segments b ON a.id < b.id
 AND (a.truck_id = b.truck_id OR a.driver_id = b.driver_id)
 AND tstzrange(a.from_at, greatest(a.from_at, a.to_at), '[)') && tstzrange(b.from_at, greatest(b.from_at, b.to_at), '[)')
 WHERE a.trip_type = 'OWNED' AND b.trip_type = 'OWNED' AND a.deleted_at IS NULL AND b.deleted_at IS NULL
 AND NOT a.rt_cancelled AND NOT b.rt_cancelled;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT ra.code || '/' || rb.code AS x
 FROM rt_vehicle_segments a JOIN rt_vehicle_segments b ON a.id < b.id
 AND (a.truck_id = b.truck_id OR a.driver_id = b.driver_id)
 AND tstzrange(a.from_at, greatest(a.from_at, a.to_at), '[)') && tstzrange(b.from_at, greatest(b.from_at, b.to_at), '[)')
 JOIN ct_round_trips ra ON ra.id = a.rt_id JOIN ct_round_trips rb ON rb.id = b.rt_id
 WHERE a.trip_type = 'OWNED' AND b.trip_type = 'OWNED' AND a.deleted_at IS NULL AND b.deleted_at IS NULL
 AND NOT a.rt_cancelled AND NOT b.rt_cancelled ORDER BY 1 LIMIT 50) s
