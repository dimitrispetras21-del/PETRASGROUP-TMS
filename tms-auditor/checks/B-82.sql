-- id: B-82
-- title: Άδειος εθνικός κύκλος (χωρίς κίνηση, όχι ακυρωμένος)
-- flows: F-23
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline:
-- queue: no
-- entity: ct_round_trips
-- impact: Ο κύκλος μένει στο board και στη μισθοδοσία χωρίς φορτίο: οι plan_* ακυρώνουν μόνοι τους τον κύκλο που αδειάζει, άρα κάτι πέρασε δίπλα τους.
-- next: Εβδομαδιαίο Εθνικών: ο κύκλος των ids. Ακύρωση με Καθαρισμό/Διαγραφή, όχι με το χέρι.
-- exceptions: v_rt_cycle (model 2) με n_legs = 0 και status <> cancelled.
-- tolerance: 
-- source: DRAFT 073b (plan F3, spec 8) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy, red in the scenario of plan-073b.test.mjs
-- enabled: yes
SELECT count(*) FROM v_rt_cycle WHERE status <> 'cancelled' AND n_legs = 0;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT code AS x FROM v_rt_cycle WHERE status <> 'cancelled' AND n_legs = 0 ORDER BY code LIMIT 50) s
