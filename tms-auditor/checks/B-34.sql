-- id: B-34
-- title: Σφάλματα εφαρμογής (24 ώρες)
-- flows: 
-- severity: P2
-- schedule: hourly
-- red: > 5
-- baseline: 
-- queue: no
-- entity: 
-- impact: 
-- next: 
-- exceptions: Timeouts/abort ενός browser (22/9: 11). Γραμμές «queue: offline flush» εξαιρούνται με ΠΡΟΘΕΜΑ και όχι με app_errors.kind, γιατί η στήλη kind υπάρχει μόνο μετά τη 049 — ο έλεγχος πρέπει να τρέχει και πριν· μετά τη 049 το φίλτρο γίνεται «kind IS DISTINCT FROM 'offline'» (ουρά, 07).
-- tolerance: 
-- source: 02b Β-34 · 22/9 = 11 · DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε): + «AND message NOT LIKE '_atRetry 422 rule%'» (σχεδιασμένη άρνηση αποθέματος = απάντηση, όχι σφάλμα — impact map 4/10 AU-07)· ζωντανό μόνο μετά το 057b
-- enabled: yes
SELECT count(*) FROM app_errors WHERE created_at>now()-interval '24 hours' AND message NOT LIKE 'queue: offline flush%'
 AND message NOT LIKE '_atRetry 422 rule%';
