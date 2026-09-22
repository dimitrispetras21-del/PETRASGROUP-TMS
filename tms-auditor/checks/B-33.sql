-- id: B-33
-- title: Άγνωστο πεδίο σε εγγραφή (24 ώρες)
-- flows: F-37,F-05,F-14
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: facade_unknown_fields
-- impact: Μία φόρμα λέει «επιτυχία» και ΔΕΝ γράφει ένα πεδίο (παγίδα #1 του facade).
-- next: SELECT table_name, field_label, role FROM facade_unknown_fields WHERE kind='write' ORDER BY last_seen DESC LIMIT 20
-- exceptions: 
-- tolerance: 
-- source: 02b Β-33 · 22/9 = 0
-- enabled: yes
SELECT count(*) FROM facade_unknown_fields WHERE last_seen>now()-interval '24 hours' AND kind='write';
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT table_name || '.' || field_label AS x FROM facade_unknown_fields WHERE last_seen>now()-interval '24 hours' AND kind='write' LIMIT 50) s;
