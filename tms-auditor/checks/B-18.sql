-- id: B-18
-- title: Ακεραιότητα βιβλίου παλετών
-- flows: F-31
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: Επιβεβαιωμένη κίνηση χωρίς ποιος/πότε ή αντιλογισμός σε ανύπαρκτη — το βιβλίο παλετών δεν στέκει σε έλεγχο.
-- next: 
-- exceptions: 
-- tolerance: 
-- source: 02b Β-18 · 22/9 = 0+0
-- enabled: yes
SELECT (SELECT count(*) FROM pl_movements WHERE status='confirmed' AND (confirmed_at IS NULL OR confirmed_by IS NULL))
     + (SELECT count(*) FROM pl_movements m WHERE m.reversal_of IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pl_movements o WHERE o.id=m.reversal_of));
