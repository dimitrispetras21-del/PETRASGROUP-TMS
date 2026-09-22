-- id: B-07
-- title: Μετρητά εξόδων ≠ μισθοδοσία οδηγού
-- flows: F-33,F-35
-- severity: P1
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: ct_round_trips
-- impact: Λάθος ποσό εξόδων στη μισθοδοσία οδηγού (λεφτά).
-- next: Μισθοδοσία → RT → σύγκριση «Έξοδα» με Έξοδα Δρομολογίων (ανάγνωση).
-- exceptions: Γραμμές CASH χωρίς rt_id (B-23).
-- tolerance: 
-- source: 02b Β-07 · 22/9 = 0, 0,5 ms
-- enabled: yes
SELECT count(*) FROM (SELECT l.rt_id, sum(l.net+coalesce(l.vat,0)) s FROM ct_cost_lines l WHERE l.pay_source='CASH' AND l.rt_id IS NOT NULL GROUP BY 1) c
 JOIN dl_entries e ON e.rt_id=c.rt_id AND e.entry_type='trip' AND e.deleted_at IS NULL WHERE abs(coalesce(e.expenses,0)-c.s)>0.01;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT c.rt_id::text AS x FROM (SELECT l.rt_id, sum(l.net+coalesce(l.vat,0)) s FROM ct_cost_lines l WHERE l.pay_source='CASH' AND l.rt_id IS NOT NULL GROUP BY 1) c
 JOIN dl_entries e ON e.rt_id=c.rt_id AND e.entry_type='trip' AND e.deleted_at IS NULL WHERE abs(coalesce(e.expenses,0)-c.s)>0.01 LIMIT 50) s;
