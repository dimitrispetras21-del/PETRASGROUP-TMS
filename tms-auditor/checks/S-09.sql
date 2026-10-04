-- id: S-09
-- title: Απόθεμα: κλείσιμο υπολοίπου (24ωρο)
-- flows: F-30,F-36
-- severity: P3
-- schedule: daily
-- red: > 0
-- baseline:
-- queue: yes
-- entity:
-- impact: Κάθε κλείσιμο υπολοίπου γράφει παλέτες ως χαμένες: το «χαμένο υπόλοιπο» δεν πιστώνεται σε κανένα RT (Ε3 «β»). Ο owner το βλέπει με όνομα, παλέτες, ποσό και αιτιολογία.
-- next: Ανάγνωση της γραμμής· αν η αιτιολογία δεν πείθει, μιλάμε με όποιον το έκλεισε πριν το τιμολόγιο.
-- exceptions: Ποσό «—» = η παρτίδα δεν έχει επιμερισμό (βλ. S-11). «?» = δεν βρέθηκε γραμμή audit_log (κλείσιμο εκτός Worker).
-- tolerance:
-- source: DRAFT 057b_stock_monitoring.sql (4/10, ΔΕΝ εκτελέστηκε) — καθρέφτης της γραμμής του· plan §6 Ε3 · ζωντανό μόνο μετά τα 057 + 057b · ids = περιγραφές, όχι εγγραφές (entity κενό)
-- enabled: yes
SELECT count(*) FROM stock_v_lots WHERE closed_at >= now() - interval '24 hours'
-- @ids
SELECT coalesce(array_agg(x ORDER BY x),'{}') FROM (SELECT '#' || l.lot_no || ' · ' || l.written_off_pallets || 'p · ' || coalesce(round(m.written_off_amount, 2) || ' €', '—') || ' · ' || coalesce((SELECT al.actor || '/' || al.role FROM audit_log al WHERE al.table_name = 'stock_lots' AND al.record_id = l.legacy_id AND al.action = 'update' AND ((al.after_data #>> '{}')::jsonb ->> 'closed_note') IS NOT NULL ORDER BY al.created_at DESC LIMIT 1), '?') || ' · ' || left(l.closed_note, 80) AS x FROM stock_v_lots l LEFT JOIN stock_v_lot_money m ON m.lot_id = l.id WHERE l.closed_at >= now() - interval '24 hours' ORDER BY l.lot_no LIMIT 50) s
