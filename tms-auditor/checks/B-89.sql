-- id: B-89
-- title: Στάση VS με εγγραφή παλετών από το σχέδιο εθνικών (δεύτερος συγγραφέας)
-- flows: F-23,F-27
-- severity: P1
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity: pl_movements
-- impact: Η στάση μιας VS έχει ήδη συγγραφέα (οι feeders της διεθνούς): μια δεύτερη εγγραφή από κίνηση κομματιού διπλασιάζει το υπόλοιπο του πελάτη.
-- next: Owner: Ισοζύγιο → αντιλογισμός της μίας από τις δύο.
-- exceptions: Η 073 δεν γράφει ποτέ για γέφυρα VS (απόφαση D-6)· 0 πάντα, αλλιώς παρακάμφθηκε ο κανόνας.
-- tolerance: 
-- source: DRAFT 073b (plan F3, spec 8) · PGlite 26/10 (072 + 072b + 073): 0 on the production copy, red in the scenario of plan-073b.test.mjs
-- enabled: yes
SELECT count(*) FROM pl_movements m JOIN piece_legs l ON l.id = m.piece_leg_id JOIN shipment_pieces p ON p.id = l.piece_id
 JOIN shipments s ON s.id = p.shipment_id WHERE s.order_stop_id IS NOT NULL AND m.status <> 'reversed';
