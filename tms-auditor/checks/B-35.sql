-- id: B-35
-- title: Σιωπή audit μέσα στη βάρδια (λεπτά)
-- flows: 
-- severity: P1
-- schedule: half
-- red: > 90
-- baseline: 
-- queue: no
-- entity: 
-- impact: Κανείς δεν γράφει τίποτα στη βάρδια — ή η εφαρμογή/ο Worker πέθανε ή η καταγραφή σταμάτησε.
-- next: Άνοιγμα της εφαρμογής και /health· αν δουλεύει, ερώτηση σε dispatcher αν μπορεί να αποθηκεύσει.
-- exceptions: Εκτός βάρδιας/Κυριακή επιστρέφει 0. Αργίες: 4–5 ψευδή/έτος.
-- tolerance: 
-- source: 02b Β-35 · 22/9 = 14′
-- enabled: yes
SELECT CASE WHEN (extract(isodow FROM (now() AT TIME ZONE 'Europe/Athens')) BETWEEN 1 AND 6
   AND (now() AT TIME ZONE 'Europe/Athens')::time BETWEEN '06:30' AND '14:30')
   THEN coalesce(round(extract(epoch FROM (now()-max(created_at)))/60), 99999) ELSE 0 END FROM audit_log;
