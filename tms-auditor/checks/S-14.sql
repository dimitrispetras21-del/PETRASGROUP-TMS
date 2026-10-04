-- id: S-14
-- title: Απόθεμα: ανοιχτή παρτίδα με διαγραμμένη αποθήκη
-- flows: F-05,F-30
-- severity: P2
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: no
-- entity: stock_lots
-- impact: Η τοποθεσία-αποθήκη μιας ανοιχτής παρτίδας διαγράφηκε (π.χ. καθάρισμα διπλότυπων): κάθε νέο κομμάτι παίρνει φόρτωση από τη διαγραμμένη τοποθεσία και οι οθόνες δεν δείχνουν όνομα αποθήκης.
-- next: Τοποθεσίες: επαναφορά της διαγραμμένης τοποθεσίας. Αν ήταν διπλότυπο και η παρτίδα δεν έχει ακόμη κομμάτια, αλλαγή του προορισμού της στη ζωντανή.
-- exceptions: Πλήρεις παρτίδες δεν μετρούν (δεν βγαίνει πια κομμάτι από αυτές).
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· γύρος 3, critic-3 Σ2-09 · ζωντανό μόνο μετά τα 057 + 057b
-- enabled: yes
SELECT count(*) FROM stock_v_lots l JOIN locations w ON w.id = l.warehouse_location_id WHERE w.deleted_at IS NOT NULL AND NOT l.complete
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT l.legacy_id AS x FROM stock_v_lots l JOIN locations w ON w.id = l.warehouse_location_id WHERE w.deleted_at IS NOT NULL AND NOT l.complete ORDER BY l.legacy_id LIMIT 50) s
