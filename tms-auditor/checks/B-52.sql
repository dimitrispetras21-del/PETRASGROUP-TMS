-- id: B-52
-- title: Διαγραφές παραγγελιών από μη-owner (24 ώρες)
-- flows: F-08
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: Ενημερωτικό: η διαγραφή μένει ανοιχτή σε όλους τους ρόλους επεξεργασίας (απόφαση owner 22/9) — μετριέται, δεν απαγορεύεται.
-- next: Ιστορικό Ενεργειών → φίλτρο orders/διαγραφή (ανάγνωση).
-- exceptions: Soft delete (deleted_at)· σκέλη split από dispatcher («Ένωση ξανά») μετρούν επίσης.
-- tolerance: 
-- source: απόφαση owner 22/9 23:40 (μέτρηση αντί για φραγμό)
-- enabled: yes
SELECT count(*) FROM audit_log WHERE table_name='orders' AND action IN ('delete','cascade_delete') AND role<>'owner'
 AND created_at>now()-interval '24 hours';
