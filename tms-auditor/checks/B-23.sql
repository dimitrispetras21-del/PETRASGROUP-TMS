-- id: B-23
-- title: Μετρητά χωρίς δρομολόγιο
-- flows: F-33
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: ct_cost_lines
-- impact: Έξοδο μετρητών που δεν φτάνει ποτέ στη μισθοδοσία του οδηγού.
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 02b Β-23 · 22/9 = 0
-- enabled: yes
SELECT count(*) FROM ct_cost_lines WHERE pay_source='CASH' AND rt_id IS NULL;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT id::text AS x FROM ct_cost_lines WHERE pay_source='CASH' AND rt_id IS NULL LIMIT 50) s;
