-- ════════════════════════════════════════════════════════════════════════════
-- ΟΡΙΣΤΙΚΗ ΔΙΑΓΡΑΦΗ ΠΑΡΑΓΓΕΛΙΩΝ — καθαρό ξεκίνημα TMS (owner 12/8/2026)
--
-- ΓΙΑΤΙ hard delete και όχι το κανονικό DELETE της εφαρμογής:
-- το facade DELETE είναι soft (deleted_at) και η delete_order_cascade ΔΕΝ
-- σβήνει ποτέ groupage_lines — τα γυρίζει σε 'Unassigned' (κανόνας never-delete,
-- spec §6). Μετά από soft-delete όλων των παραγγελιών θα έμεναν 48 ορφανές
-- γραμμές στην ουρά του National Pick Ups και ~600 εγγραφές στη βάση. Αυτό δεν
-- είναι «από την αρχή», γι' αυτό ο owner ζήτησε ρητά οριστική διαγραφή.
--
-- ΤΟ NEVER-DELETE ΤΩΝ GL ΔΕΝ ΚΑΤΑΡΓΕΙΤΑΙ. Ισχύει για τη ΛΕΙΤΟΥΡΓΙΑ της
-- εφαρμογής (αφαίρεση στάσης = Status→Unassigned, ποτέ delete). Αυτό εδώ είναι
-- εφάπαξ διοικητικός μηδενισμός εκτός εφαρμογής, με backup από πριν.
--
-- BACKUP ΠΡΙΝ ΤΗΝ ΕΚΤΕΛΕΣΗ (υποχρεωτικό):
--   node scripts/backup_supabase.js backups/<ημερομηνία>_pre-wipe \
--     orders national_orders order_stops groupage_lines consolidated_loads \
--     national_loads cons_load_source_orders partner_assignments pl_movements \
--     local_moves ramp
--
-- ΤΙ ΔΕΝ ΑΓΓΙΖΕΙ: clients, partners, locations, drivers, trucks, trailers,
-- workshops, maint_*, users, ct_* (κόστη), ramp (καμία από τις 28 γραμμές της
-- δεν δείχνει σε παραγγελία), pl_movements χωρίς σύνδεση με παραγγελία.
--
-- ΕΚΤΕΛΕΣΗ: Supabase SQL editor. Το service_role ΔΕΝ έχει grant DELETE σε
-- αυτούς τους πίνακες — μέσω PostgREST γυρίζει 403 σε όλους (μετρημένο 12/8).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Η σειρά είναι η σειρά των FK: κάθε παιδί πριν τον γονέα του. Το
-- national_loads προηγείται του consolidated_loads γιατί κρατά
-- source_cons_load_id — αν αντιστραφούν, το DELETE σκοντάφτει σε RESTRICT.

-- 1. Join table CL ↔ πηγαίες παραγγελίες
DELETE FROM public.cons_load_source_orders;

-- 2. Κινήσεις παλετών δεμένες σε παραγγελία/στάση. Οι χειροκίνητες (χωρίς
--    order_id/order_stop_id) μένουν — δεν είναι παραγγελίες.
DELETE FROM public.pl_movements
 WHERE order_id IS NOT NULL OR order_stop_id IS NOT NULL;

-- 3. Αναθέσεις συνεργατών σε παραγγελία ή εθνικό φορτίο
DELETE FROM public.partner_assignments
 WHERE order_id IS NOT NULL OR national_load_id IS NOT NULL;

-- 4. Τοπικές κινήσεις (1 γραμμή smoke test, ήδη soft-deleted)
DELETE FROM public.local_moves;

-- 5. Στάσεις — δείχνουν σε orders, national_orders ΚΑΙ national_loads
DELETE FROM public.order_stops;

-- 6. Γραμμές groupage — δείχνουν σε orders, national_orders, consolidated_loads
DELETE FROM public.groupage_lines;

-- 7. Εθνικά φορτία (source_order_id, source_cons_load_id)
DELETE FROM public.national_loads;

-- 8. Ενοποιημένα φορτία (matched_order_id)
DELETE FROM public.consolidated_loads;

-- 9. Εθνικές παραγγελίες (source_order_id, matched_order_id)
DELETE FROM public.national_orders;

-- 10. Διεθνείς παραγγελίες — ο γονέας όλης της αλυσίδας
DELETE FROM public.orders;

COMMIT;

-- Απόδειξη, όχι πίστη: ό,τι δεν είναι μηδέν σημαίνει ότι κάτι δεν έφυγε.
SELECT 'orders' AS t, count(*) FROM public.orders
UNION ALL SELECT 'national_orders',          count(*) FROM public.national_orders
UNION ALL SELECT 'order_stops',              count(*) FROM public.order_stops
UNION ALL SELECT 'groupage_lines',           count(*) FROM public.groupage_lines
UNION ALL SELECT 'consolidated_loads',       count(*) FROM public.consolidated_loads
UNION ALL SELECT 'national_loads',           count(*) FROM public.national_loads
UNION ALL SELECT 'cons_load_source_orders',  count(*) FROM public.cons_load_source_orders
UNION ALL SELECT 'partner_assignments',      count(*) FROM public.partner_assignments
UNION ALL SELECT 'local_moves',              count(*) FROM public.local_moves
UNION ALL SELECT 'pl_movements (υπολοιπες)', count(*) FROM public.pl_movements
UNION ALL SELECT 'ramp (athikto)',           count(*) FROM public.ramp
UNION ALL SELECT 'clients (athikto)',        count(*) FROM public.clients;
