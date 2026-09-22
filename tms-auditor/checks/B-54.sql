-- id: B-54
-- title: Απογραφή triggers της βάσης (το δίχτυ ασφαλείας είναι ακέραιο;)
-- flows: F-14,F-26,F-30,F-33
-- severity: P1
-- schedule: hourly
-- red: <> 25
-- baseline: 
-- queue: no
-- entity: 
-- impact: Ένας trigger έλειψε ή απενεργοποιήθηκε: οι αλυσίδες ανάθεση→γύρος→μισθοδοσία, ημερομηνίες, μετρητά ή ο φραγμός τιμολόγησης σταματούν σιωπηλά.
-- next: SELECT c.relname, t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal (ανάγνωση καταλόγου) και σύγκριση με baseline/2026-09-22-prod.json.
-- exceptions: Νέα εγκεκριμένη migration που προσθέτει/αφαιρεί trigger ⇒ ο αριθμός ενημερώνεται ΜΑΖΙ με τη migration (η αλλαγή γίνεται ορατή, αυτό είναι το ζητούμενο).
-- tolerance: 
-- source: part-z NEW-z1 · 25 ενεργοί triggers στο public μετά την 046 (μέτρηση 22/9 19:33 UTC)
-- enabled: yes
SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND n.nspname='public';
