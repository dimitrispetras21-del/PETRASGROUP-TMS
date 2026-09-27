-- 052 — DRAFT (ΔΕΝ ΕΚΤΕΛΕΣΤΗΚΕ) — Pre-order: «Χώρα προορισμού» όταν δεν ξέρουμε ακόμη το σημείο.
--        Απόφαση owner 27/9 (DECISION_LOG 27/9 βράδυ §4, Παντελής: «πολλές φορές δεν έχουμε ακριβή
--        τόπο προορισμού»). Branch feat/preorder. Τρέχει ο owner, μετά τις 15:00.
--
-- ΣΕΙΡΑ (υποχρεωτική): 044 → 052 → deploy Worker (label "Destination Country" → dest_country).
--   Αν γίνει deploy ΠΡΙΝ το 052: το Ημερήσιο ζητά ρητά «Destination Country» στο fields[] και η
--   ανάγνωση από τη view θα σκάσει (στήλη που δεν υπάρχει) — όλη η σελίδα. Αντίστροφα (052 χωρίς
--   deploy) είναι ακίνδυνο: η φόρμα pre-order λέει ρητά «η χώρα δεν αποθηκεύτηκε» (αρχή 1).
--
-- WHY μια στήλη και όχι κάτι υπάρχον (μετρημένο στον χάρτη ORDERS 27/9):
--   * Τα orders ΔΕΝ έχουν στήλη χώρας — η χώρα ζει μόνο στις locations (locations.country).
--   * «Τοποθεσία-χώρα» (ψεύτικο σημείο «Ιταλία») θα μόλυνε τον πίνακα τοποθεσιών και θα έγραφε
--     Unloading Location + ORDER STOPS που δεν υπάρχουν — ψέμα στη βάση.
--   * Στο Notes ως κείμενο: αμέτρητο, αφιλτράριστο, και μένει «Ιταλία» ακόμη κι όταν το σημείο
--     είναι στη Γερμανία (δύο πηγές, αρχή 3).
-- Τιμή = ISO 3166-1 alpha-2 (GR, IT, DE …), η ίδια σύμβαση με clients/workshops/core/countries.js.
-- Ζει ΜΟΝΟ όσο η παραγγελία είναι pre-order: στη μετατροπή η φόρμα γράφει null (η τοποθεσία
-- παράδοσης έχει τη δική της χώρα). Ο δεύτερος CHECK το κάνει κανόνα της βάσης (αρχή 4) —
-- προϋποθέτει ότι η μετατροπή στέλνει 'Ops Status' ΚΑΙ 'Destination Country' null μαζί (έτσι κάνει
-- το submitIntlOrder στο feat/preorder).
--
-- Η VIEW: ο Worker διαβάζει τα ORDERS από την orders_with_derived (readView), που έχει ΡΗΤΗ λίστα
-- στηλών — νέα στήλη στον πίνακα ΔΕΝ φτάνει μόνη της στη view (ίδιο μάθημα με 018/019). Το CREATE OR
-- REPLACE κρατά τις υπάρχουσες στήλες στη θέση τους και προσθέτει μία στο τέλος.
-- ⚠ ΠΡΙΝ: η τρέχουσα ορισμός πρέπει να είναι ΑΚΡΙΒΩΣ της 019 (παρακάτω SELECT). Αν διαφέρει, ΣΤΑΜΑΤΑ
--   — κάποιος άλλαξε τη view εκτός repo και το REPLACE θα έσβηνε την αλλαγή του.
--
-- Αναστρέψιμο (το REPLACE δεν αφαιρεί στήλη — χρειάζεται drop + ξανά ο ορισμός της 019):
--   drop view public.orders_with_derived;  -- και μετά το create view της 019 αυτούσιο
--   (αν η drop αρνηθεί λόγω εξαρτώμενων views, άφησε τη view: μια στήλη που κανείς δεν διαβάζει
--    δεν βλάπτει — φεύγει μόνο το label από τον Worker και οι CHECK)
--   alter table public.orders drop constraint orders_dest_country_preorder_only,
--                             drop constraint orders_dest_country_iso2, drop column dest_country;
--   (ΠΡΩΤΑ Worker χωρίς το label, αλλιώς το Ημερήσιο σκάει — ίδιος λόγος με τη ΣΕΙΡΑ πάνω.)

-- ΠΡΙΝ (εκτός συναλλαγής, μόνο ανάγνωση): ο ορισμός της view = 019;
--   select pg_get_viewdef('public.orders_with_derived'::regclass, true);
--   αναμενόμενο: SELECT v.*, o.group_id, o.plan_week_start, o.id AS order_no
--                FROM orders_with_derived_old3 v JOIN orders o ON o.id = v.id;  (v.* αναπτυγμένο)

BEGIN;

-- ΠΡΙΝ: η στήλη δεν υπάρχει ήδη (πρέπει 0).
SELECT count(*) AS already_there FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'dest_country';

ALTER TABLE public.orders ADD COLUMN dest_country text;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_dest_country_iso2
  CHECK (dest_country IS NULL OR dest_country ~ '^[A-Z]{2}$');

ALTER TABLE public.orders
  ADD CONSTRAINT orders_dest_country_preorder_only
  CHECK (dest_country IS NULL OR ops_status = 'Provisional');

create or replace view public.orders_with_derived as
select v.*, o.group_id, o.plan_week_start, o.id as order_no, o.dest_country
  from public.orders_with_derived_old3 v
  join public.orders o on o.id = v.id;

-- ΜΕΤΑ: στήλη στον πίνακα + στη view (πρέπει 1 και 1), περιορισμοί έγκυροι.
SELECT (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='orders' AND column_name='dest_country') AS in_table,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='orders_with_derived' AND column_name='dest_country') AS in_view;
SELECT conname, convalidated FROM pg_constraint
 WHERE conrelid = 'public.orders'::regclass
   AND conname IN ('orders_dest_country_iso2', 'orders_dest_country_preorder_only');

COMMIT;

-- Επανάληψη ελέγχου session (CLAUDE.md «ο επαναλαμβανόμενος έλεγχος»), μετά την πρώτη χρήση:
--   SELECT count(*) FILTER (WHERE dest_country IS NOT NULL) AS γραμμένα,
--          count(*) FILTER (WHERE ops_status = 'Provisional') AS preorders
--     FROM orders WHERE deleted_at IS NULL;
