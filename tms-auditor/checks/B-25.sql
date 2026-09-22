-- id: B-25
-- title: Καύσιμα/διόδια εκτός παραθύρου γύρου (±5 ημ.)
-- flows: F-33,F-34
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 2
-- queue: no
-- entity: 
-- impact: 
-- next: 
-- exceptions: dkv (μηνιαία τέλη), accommodation, other.
-- tolerance: 
-- source: 02b Β-25 · 22/9 = 2
-- enabled: yes
SELECT count(*) FROM ct_cost_lines l JOIN ct_round_trips r ON r.id=l.rt_id
 WHERE l.category IN ('fuel','reefer_fuel','tolls','adblue') AND l.line_date IS NOT NULL AND r.date_start IS NOT NULL
 AND (l.line_date < r.date_start-5 OR l.line_date > coalesce(r.date_end,r.date_start)+5);
