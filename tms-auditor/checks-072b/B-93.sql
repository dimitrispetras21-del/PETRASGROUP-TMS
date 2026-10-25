-- id: B-93
-- title: Αλλαγή οχήματος με λόγο «Άλλο» χωρίς σημείωση
-- flows: F-23
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity: ct_round_trips
-- impact: Η αλλαγή οχήματος δεν λέει τι συνέβη: οι λόγοι δεν μετριούνται και η καρτέλα του κύκλου δεν εξηγεί την αλλαγή.
-- next: Owner: v_rt_segments WHERE reason = 'other'. Το CHECK seg_other_note το αρνείται· ένα μη μηδενικό σημαίνει ότι το CHECK λείπει.
-- exceptions: Κανένα (spec 4: με «Άλλο» η σημείωση είναι υποχρεωτική).
-- tolerance: 0
-- source: DRAFT 072b (plan vehicle handover, spec 6 «λόγος other χωρίς σημείωση») · PGlite 25/10: 0 on the production copy, red with the CHECK dropped
-- enabled: yes
SELECT count(*) FROM rt_vehicle_segments g WHERE g.deleted_at IS NULL AND g.reason = 'other'
 AND NOT coalesce(g.reason_note ~ '[^[:space:]]', false);
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT r.code AS x FROM rt_vehicle_segments g
 JOIN ct_round_trips r ON r.id = g.rt_id WHERE g.deleted_at IS NULL AND g.reason = 'other'
 AND NOT coalesce(g.reason_note ~ '[^[:space:]]', false) ORDER BY 1 LIMIT 50) s
