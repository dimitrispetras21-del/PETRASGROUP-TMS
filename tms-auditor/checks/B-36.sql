-- id: B-36
-- title: Γεγονότα triggers 24h (split/reopen)
-- flows: F-16,F-18
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: yes
-- entity: 
-- impact: 
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 02b Β-36 · 22/9 = 0+0
-- enabled: yes
SELECT count(*) FILTER (WHERE (after_data->>'split')='true') + count(*) FILTER (WHERE table_name='ct_round_trips' AND after_data->>'reason' LIKE 'reopened:%')
 FROM audit_log WHERE created_at>now()-interval '24 hours';
