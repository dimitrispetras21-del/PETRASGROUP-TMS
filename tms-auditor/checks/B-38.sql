-- id: B-38
-- title: «Αναίρεση» διαγραφής ως νέα εγγραφή (νέο id)
-- flows: F-04
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: Οι δεσμοί (στάσεις, φορτίο, σκέλη) δείχνουν στη διαγραμμένη εγγραφή.
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 04 ΝΕΟΣ Β-38
-- enabled: yes
SELECT count(*) FROM audit_log d WHERE d.action='delete' AND d.created_at>now()-interval '26 hours'
 AND EXISTS (SELECT 1 FROM audit_log c WHERE c.action='create' AND c.table_name=d.table_name AND c.actor=d.actor
             AND c.created_at BETWEEN d.created_at AND d.created_at+interval '60 seconds');
