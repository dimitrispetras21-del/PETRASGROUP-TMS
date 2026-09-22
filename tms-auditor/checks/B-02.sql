-- id: B-02
-- title: Κλειστός γύρος με ανοιχτό σκέλος
-- flows: F-36,F-18
-- severity: P1
-- schedule: fast
-- red: > 0
-- baseline: 
-- queue: no
-- entity: ct_round_trips
-- impact: Η μισθοδοσία/P&L του γύρου κλείνει ενώ η μεταφορά δεν τελείωσε.
-- next: Άνοιγμα του RT στο TRIP PnL / Μισθοδοσία (ανάγνωση).
-- exceptions: Κενό status = ΑΝΟΙΧΤΟ (όπως η 046· part-z σύγκρουση 22/9). Σκέλη nat_load_id χωρίς status παραγγελίας.
-- tolerance: 
-- source: 02b Β-02 · 22/9 = 0 · P1 μετά την 046 (rt_status_guard το απαγορεύει)
-- enabled: yes
SELECT count(DISTINCT r.id) FROM ct_round_trips r JOIN ct_rt_legs l ON l.rt_id=r.id JOIN orders o ON o.id=l.order_id
 WHERE r.status IN ('closed','complete') AND o.deleted_at IS NULL AND coalesce(o.status,'') NOT IN ('Delivered','Cancelled');
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT DISTINCT r.id::text AS x FROM ct_round_trips r JOIN ct_rt_legs l ON l.rt_id=r.id JOIN orders o ON o.id=l.order_id
 WHERE r.status IN ('closed','complete') AND o.deleted_at IS NULL AND coalesce(o.status,'') NOT IN ('Delivered','Cancelled') LIMIT 50) s;
