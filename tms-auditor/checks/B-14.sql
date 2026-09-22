-- id: B-14
-- title: Αρνητικά ποσά
-- flows: F-30,F-33,F-31
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: 
-- next: 
-- exceptions: restatement (αναμόρφωση 21/9).
-- tolerance: 
-- source: 02b Β-14 · 22/9 = 0
-- enabled: yes
SELECT (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND (price<0 OR partner_rate<0))
     + (SELECT count(*) FROM ct_cost_lines WHERE net<0 AND category<>'restatement')
     + (SELECT count(*) FROM pl_movements WHERE taken<0 OR given<0);
