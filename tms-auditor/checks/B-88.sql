-- id: B-88
-- title: Εκκρεμής κίνηση παλετών σε σβησμένη κίνηση κομματιού
-- flows: F-23,F-27
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity: pl_movements
-- impact: Ο feeder της 073 αποσύρει κάθε εγγραφή του σκέλους που φεύγει· μια pending που έμεινε σημαίνει ότι κάτι πέρασε δίπλα του: η αποθήκη θα επιβεβαιώσει κάτι που δεν έγινε.
-- next: Owner/λογιστήριο: Ισοζύγιο → η κίνηση των ids (αντιλογισμός ή διαγραφή εκκρεμούς).
-- exceptions: Δίχτυ του feeder (tech B-80).
-- tolerance: 
-- source: DRAFT 073b (plan F3, spec 8) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy, red in the scenario of plan-073b.test.mjs
-- enabled: yes
SELECT count(*) FROM pl_movements m JOIN piece_legs l ON l.id = m.piece_leg_id WHERE m.status = 'pending' AND l.deleted_at IS NOT NULL;
-- @ids
SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM (SELECT m.code AS x FROM pl_movements m JOIN piece_legs l ON l.id = m.piece_leg_id
 WHERE m.status = 'pending' AND l.deleted_at IS NOT NULL ORDER BY m.code LIMIT 50) s
