-- id: B-54
-- title: Απογραφή triggers της βάσης (το δίχτυ ασφαλείας είναι ακέραιο;)
-- flows: F-14,F-26,F-30,F-33
-- severity: P1
-- schedule: hourly
-- red: <> 31
-- baseline: 
-- queue: no
-- entity: 
-- impact: Ένας trigger έλειψε ή απενεργοποιήθηκε: οι αλυσίδες ανάθεση→γύρος→μισθοδοσία, ημερομηνίες, μετρητά ή ο φραγμός τιμολόγησης σταματούν σιωπηλά.
-- next: SELECT c.relname, t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal (ανάγνωση καταλόγου) και σύγκριση με baseline/2026-09-22-prod.json.
-- exceptions: Νέα εγκεκριμένη migration που προσθέτει/αφαιρεί trigger ⇒ ο αριθμός ενημερώνεται ΜΑΖΙ με τη migration (η αλλαγή γίνεται ορατή, αυτό είναι το ζητούμενο).
-- tolerance: 
-- source: part-z NEW-z1 · 25 ενεργοί triggers στο public μετά την 046 (μέτρηση 22/9 19:33 UTC) · ζωντανά 27 μετά την 034 (red_value 27, μέτρηση 4/10 με το ίδιο κείμενο) · DRAFT 057 §8 (4/10, ΔΕΝ εκτελέστηκε): red_value = μετρημένο + 4 (stock_guard_lots/_orders/_natl, orders_group_id_blank_null) = 31 — ΙΣΟ με τη NOTICE «057: B-54 red_value 27 → 31»· αν η NOTICE τυπώσει άλλο N, γράφεται εδώ το N και ξαναβγαίνει το 047b
-- enabled: yes
SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND t.tgenabled <> 'D' AND n.nspname='public';
