-- id: B-24
-- title: Διπλές γραμμές DKV μετά την 038
-- flows: F-34
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: 
-- next: 
-- exceptions: ΠΡΟΣΟΧΗ: χωρίς rt_id IS NOT NULL δίνει 12 ψευδή.
-- tolerance: 
-- source: 02b Β-24 · 22/9 = 0
-- enabled: yes
SELECT count(*) FROM (SELECT doc_id, rt_id, coalesce(toll_country,'') tc FROM ct_cost_lines
 WHERE doc_id IS NOT NULL AND rt_id IS NOT NULL AND category IN ('tolls','dkv') GROUP BY 1,2,3 HAVING count(*)>1) x;
