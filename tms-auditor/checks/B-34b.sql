-- id: B-34b
-- title: Νέο μήνυμα σφάλματος (όχι στις προηγούμενες 7 ημέρες)
-- flows: 
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: Εμφανίστηκε σφάλμα εφαρμογής που δεν έχει ξαναφανεί σε 7 ημέρες — πιθανή συνέπεια πρόσφατης αλλαγής.
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 02b Β-34 σημείωση («νέο» = πρώτη φορά σε 7 ημέρες)
-- enabled: yes
SELECT count(DISTINCT left(e.message,40)) FROM app_errors e WHERE e.created_at>now()-interval '1 hour' AND e.message NOT LIKE 'queue: offline flush%'
 AND NOT EXISTS (SELECT 1 FROM app_errors p WHERE left(p.message,40)=left(e.message,40) AND p.created_at BETWEEN now()-interval '8 days' AND now()-interval '1 hour');
