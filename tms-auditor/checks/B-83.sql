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
-- exceptions: Ο ΙΔΙΟΣ κανόνας με το ct_v_rt_pnl.partner_rate_missing, διαβασμένος από την ίδια όψη ct_v_rt_partner_cost (073, Q6-1 owner 26/10, αρχή 3): ανά συνεργάτη των τμημάτων PARTNER ενός κύκλου v5, τμήμα χωρίς κόμιστρο και κανένα τιμολόγιο αυτού του συνεργάτη· ο κύκλος όχι ακυρωμένος.
-- tolerance: 
-- source: DRAFT 073b (plan F3, spec 8) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy, red in the scenario of plan-073b.test.mjs · final round 1 26/10: per segment (Q6-1), from the view
-- enabled: yes
SELECT count(*) FROM ct_v_rt_partner_cost p JOIN ct_round_trips r ON r.id = p.rt_id WHERE p.rate_missing AND r.status <> 'cancelled';
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT r.code AS x FROM ct_v_rt_partner_cost p JOIN ct_round_trips r ON r.id = p.rt_id
 WHERE p.rate_missing AND r.status <> 'cancelled' ORDER BY r.code LIMIT 50) s
