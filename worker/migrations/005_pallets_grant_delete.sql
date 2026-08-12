-- ============================================================
-- ΠΑΛΕΤΕΣ — Migration 005: grant DELETE στον service_role
-- Τρέξε ΟΛΟΚΛΗΡΟ στο Supabase SQL editor (project gatejgbpyodlepkvqkgf).
--
-- ΓΙΑΤΙ: ο πίνακας δημιουργήθηκε (003) με τον ρόλο postgres και ο service_role
-- πήρε INSERT/SELECT/UPDATE — ΟΧΙ DELETE. Ο Worker μιλάει με service key, άρα
-- ΚΑΘΕ διαγραφή κίνησης γύριζε 403 από την PostgREST. Το κενό δεν φάνηκε στο
-- smoke της Φ1 επειδή εκεί δοκιμάστηκε μόνο η ΑΠΑΓΟΡΕΥΣΗ διαγραφής (409 σε
-- confirmed) — ποτέ μια επιτυχής διαγραφή pending. Βρέθηκε 12/8 στη Φ2, όταν
-- ο feeder προσπάθησε να σαρώσει ορφανές εκκρεμείς.
--
-- Χρειάζεται για: PE toggle off, σάρωση ορφανών εκκρεμών, αφαίρεση ανάθεσης
-- partner, cascade delete παραγγελίας. (Οι confirmed ΔΕΝ διαγράφονται ποτέ —
-- αυτό το επιβάλλει ο Worker με 409, όχι τα δικαιώματα της βάσης.)
-- ============================================================

grant delete on pl_movements to service_role;

-- ============================================================
-- ΕΛΕΓΧΟΣ (περιμένεις να περιέχει DELETE):
--   select grantee, string_agg(privilege_type, ',' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_name = 'pl_movements' and grantee = 'service_role'
--   group by grantee;
--
-- ΠΡΟΣΟΧΗ για νέους πίνακες: ό,τι δημιουργείται με SQL editor κληρονομεί το
-- ίδιο κενό. Αν κάποιο endpoint χρειαστεί hard delete, θέλει ρητό grant.
-- (Τα ct_* δεν διαγράφουν τίποτα σήμερα — αν αλλάξει, ίδιο grant.)
-- ============================================================

-- 005_rollback:
-- revoke delete on pl_movements from service_role;
