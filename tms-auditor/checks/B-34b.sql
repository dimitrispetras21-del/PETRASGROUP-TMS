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
-- exceptions: Γραμμές «queue: offline flush» εξαιρούνται με ΠΡΟΘΕΜΑ και όχι με app_errors.kind, γιατί η στήλη kind υπάρχει μόνο μετά τη 049 — ο έλεγχος πρέπει να τρέχει και πριν· μετά τη 049 το φίλτρο γίνεται «kind IS DISTINCT FROM 'offline'» (ουρά, 07).
-- tolerance: 
-- source: 02b Β-34 σημείωση («νέο» = πρώτη φορά σε 7 ημέρες) · DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε): + «AND e.message NOT LIKE '_atRetry 422 rule%'» (impact map 4/10 AU-07)· ζωντανό μόνο μετά το 057b · DRAFT 064_b34_session_rows.sql (7/10): + «AND e.message NOT LIKE 'session: expired%'» — the routine row names its user within the first 40 characters, so each user's first one after deploy (or after 8 days without one) would be a «new message» here: ~6 red hours that say nothing. The other «session:» kinds keep counting. The source line is not seeded, so 064 changes sql_text only
-- enabled: yes
SELECT count(DISTINCT left(e.message,40)) FROM app_errors e WHERE e.created_at>now()-interval '1 hour' AND e.message NOT LIKE 'queue: offline flush%'
 AND NOT EXISTS (SELECT 1 FROM app_errors p WHERE left(p.message,40)=left(e.message,40) AND p.created_at BETWEEN now()-interval '8 days' AND now()-interval '1 hour')
 AND e.message NOT LIKE '_atRetry 422 rule%'
 AND e.message NOT LIKE 'session: expired%';
