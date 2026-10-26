-- id: B-84
-- title: Έξοδα (DKV, καύσιμα) σε ακυρωμένο δρομολόγιο: λείπει δρομολόγιο
-- flows: F-33,F-34
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: ct_cost_lines
-- impact: Η Μεταφορά, ο Καθαρισμός ή η Διαγραφή άφησε έξοδα στον κύκλο που ακυρώθηκε (F2 απόφαση 13: μένουν για ίχνος): δεν μετρούν σε κανένα P&L.
-- next: Λογιστήριο: Έξοδα → μεταφορά των γραμμών στο σωστό δρομολόγιο.
-- exceptions: Το B-22 μετρά τις γραμμές χωρίς δρομολόγιο· αυτός τις γραμμές σε δρομολόγιο cancelled (v1 και v5). Μετρήθηκε 26/10: 0.
-- tolerance: 
-- source: DRAFT 073b (plan F3, spec 8) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy, red in the scenario of plan-073b.test.mjs
-- enabled: yes
SELECT count(*) FROM ct_cost_lines c JOIN ct_round_trips r ON r.id = c.rt_id WHERE r.status = 'cancelled';
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT r.code AS x FROM ct_cost_lines c JOIN ct_round_trips r ON r.id = c.rt_id
 WHERE r.status = 'cancelled' ORDER BY 1 LIMIT 50) s
