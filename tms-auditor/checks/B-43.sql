-- id: B-43
-- title: Σκέλος που παραβιάζει το «πρώτα βγαίνει από το RT, μετά φεύγει το όχημα»
-- flows: F-15,F-17,F-07,F-08,F-23
-- severity: P2
-- schedule: hourly
-- red: > 0
-- baseline: 
-- queue: no
-- entity: ct_round_trips
-- impact: Σκέλος που δεν τρέχει πια με το ταξίδι μένει μέσα του: το RT, το P&L και η μισθοδοσία το μετρούν, και μια αλλαγή οχήματος περνά σε όλο το ταξίδι (μοτίβο RT-1193, 30/9).
-- next: Τα ids είναι RT: σε καθένα δες ποιο σκέλος είναι νεκρό ή χωρίς όχημα — βγαίνει από το RT ή ξαναπαίρνει όχημα; Απόφαση owner (ανάγνωση).
-- exceptions: Μετρά σκέλη (τα ids είναι τα RT τους), σε κάθε status εκτός από cancelled. Τρεις περιπτώσεις: (α) σκέλος ακυρωμένης/διαγραμμένης παραγγελίας ή φορτίου· (β) παραγγελία χωρίς όχημα δίπλα σε παραγγελία με όχημα· (γ) εθνικό φορτίο χωρίς όχημα σε RT με άλλα σκέλη. Όχημα = φορτηγό ή συνεργάτης με is_partner_trip (ίδιος κανόνας με B-01/033/034). ΔΕΝ μετρούν: RT μίας παραγγελίας που περιμένει νέο όχημα, ταίριασμα που καθαρίστηκε ολόκληρο (owner 4/10: φεύγει και από τις δύο), σκέλος VS που κράτησε το φορτηγό του. Ως το 059a η βάση αντιγράφει το κενό όχημα στις αδελφές παραγγελίες, οπότε το (β) δεν φαίνεται ακόμη.
-- tolerance: 
-- source: σχέδιο rt-never-closed v4 §Θ 062a = απόδειξη P3 της §Δ · owner 4/10 Q1/Q2 «ναι» · DRAFT 059z · 4/10 = 0 (243 σκέλη, 0 εθνικά)
-- enabled: yes
SELECT count(*) FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id
 LEFT JOIN orders o ON o.id=l.order_id LEFT JOIN national_loads nl ON nl.id=l.nat_load_id
 WHERE r.status<>'cancelled'
 AND (coalesce(o.deleted_at, nl.deleted_at) IS NOT NULL OR coalesce(o.status, nl.status, '')='Cancelled'
  OR (l.order_id IS NOT NULL AND o.truck_id IS NULL AND NOT (coalesce(o.is_partner_trip,false) AND o.partner_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM ct_rt_legs l2 JOIN orders o2 ON o2.id=l2.order_id WHERE l2.rt_id=l.rt_id AND l2.id<>l.id AND o2.deleted_at IS NULL
    AND (o2.truck_id IS NOT NULL OR (coalesce(o2.is_partner_trip,false) AND o2.partner_id IS NOT NULL))))
  OR (l.nat_load_id IS NOT NULL AND nl.truck_id IS NULL AND NOT (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM ct_rt_legs l3 WHERE l3.rt_id=l.rt_id AND l3.id<>l.id)));
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT l.rt_id::text AS x FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id
 LEFT JOIN orders o ON o.id=l.order_id LEFT JOIN national_loads nl ON nl.id=l.nat_load_id
 WHERE r.status<>'cancelled'
 AND (coalesce(o.deleted_at, nl.deleted_at) IS NOT NULL OR coalesce(o.status, nl.status, '')='Cancelled'
  OR (l.order_id IS NOT NULL AND o.truck_id IS NULL AND NOT (coalesce(o.is_partner_trip,false) AND o.partner_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM ct_rt_legs l2 JOIN orders o2 ON o2.id=l2.order_id WHERE l2.rt_id=l.rt_id AND l2.id<>l.id AND o2.deleted_at IS NULL
    AND (o2.truck_id IS NOT NULL OR (coalesce(o2.is_partner_trip,false) AND o2.partner_id IS NOT NULL))))
  OR (l.nat_load_id IS NOT NULL AND nl.truck_id IS NULL AND NOT (coalesce(nl.is_partner_trip,false) AND nl.partner_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM ct_rt_legs l3 WHERE l3.rt_id=l.rt_id AND l3.id<>l.id))) LIMIT 50) s;
