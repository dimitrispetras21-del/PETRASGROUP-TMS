-- id: B-48
-- title: Ταίριασμα ΑΝΟΔΟΣ↔ΚΑΘΟΔΟΣ μη αμοιβαίο
-- flows: F-24
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: national_loads
-- impact: 
-- next: 
-- exceptions: matched_load = text με το legacy id του άλλου φορτίου (κατάλογος 22/9).
-- tolerance: 
-- source: 04 ΝΕΟΣ Β-48 (ασάφεια Α8)
-- enabled: yes
SELECT count(*) FROM national_loads a JOIN national_loads b ON b.legacy_id=a.matched_load
 WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND coalesce(a.matched_load,'')<>'' AND b.matched_load IS DISTINCT FROM a.legacy_id;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT a.legacy_id AS x FROM national_loads a JOIN national_loads b ON b.legacy_id=a.matched_load
 WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL AND coalesce(a.matched_load,'')<>'' AND b.matched_load IS DISTINCT FROM a.legacy_id LIMIT 50) s;
