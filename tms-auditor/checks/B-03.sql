-- id: B-03
-- title: Γύροι ανοιχτοί ενώ όλα παραδόθηκαν (> 3 ημέρες)
-- flows: F-36
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline: 
-- queue: no
-- entity: 
-- impact: Η 046 κλείνει αυτόματα γύρους με όλα τα σκέλη Delivered/Cancelled· >0 = ο trigger δεν έτρεξε ή παρακάμφθηκε.
-- next: 
-- exceptions: Κενό status = ΑΝΟΙΧΤΟ (όπως η 046). Γνωστές εξαιρέσεις της 046 (part-z): ιδιόκτητος γύρος χωρίς φορτηγό, υπόλοιπο συγχώνευσης 037, σκέλη με όλες τις παραγγελίες διαγραμμένες. 
-- tolerance: 
-- source: 02b Β-03 · 22/9 = 23 ΠΡΙΝ την 046· μετά την 046 (22/9 23:05, 30 auto-closed) αναμένεται 0 — ΑΝΕΠΑΛΗΘΕΥΤΟ ως τη μέτρηση
-- enabled: yes
SELECT count(*) FROM ct_round_trips r WHERE r.status IN ('planned','in_progress')
 AND EXISTS (SELECT 1 FROM ct_rt_legs l WHERE l.rt_id=r.id AND l.order_id IS NOT NULL)
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id WHERE l.rt_id=r.id AND o.deleted_at IS NULL AND coalesce(o.status,'') NOT IN ('Delivered','Cancelled'))
 AND (SELECT max(coalesce(o.actual_delivery_date,o.delivery_datetime)) FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id WHERE l.rt_id=r.id) < current_date-3;
