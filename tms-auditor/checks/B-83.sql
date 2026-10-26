-- id: B-83
-- title: Εθνικός κύκλος συνεργάτη χωρίς κόμιστρο
-- flows: F-23,F-36
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity: ct_round_trips
-- impact: Το κόστος του συνεργάτη λείπει: το P&L του κύκλου φαίνεται κερδοφόρο (spec 3: «φαίνεται ως εκκρεμότητα, και στο P&L»).
-- next: Dispatcher: κόμιστρο στον κύκλο (Εβδομαδιαίο Εθνικών), ή λογιστήριο: τιμολόγιο συνεργάτη ως γραμμή κόστους.
-- exceptions: Ίδιος κανόνας με το ct_v_rt_pnl.partner_rate_missing: model 2, PARTNER, όχι ακυρωμένος, χωρίς κόμιστρο και χωρίς γραμμή partner_rate.
-- tolerance: 
-- source: DRAFT 073b (plan F3, spec 8) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy, red in the scenario of plan-073b.test.mjs
-- enabled: yes
SELECT count(*) FROM ct_round_trips r WHERE r.model = 2 AND r.trip_type = 'PARTNER' AND r.status <> 'cancelled' AND r.partner_rate IS NULL
 AND NOT EXISTS (SELECT 1 FROM ct_cost_lines c WHERE c.rt_id = r.id AND c.category = 'partner_rate');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT r.code AS x FROM ct_round_trips r WHERE r.model = 2 AND r.trip_type = 'PARTNER' AND r.status <> 'cancelled'
 AND r.partner_rate IS NULL AND NOT EXISTS (SELECT 1 FROM ct_cost_lines c WHERE c.rt_id = r.id AND c.category = 'partner_rate') ORDER BY r.code LIMIT 50) s
