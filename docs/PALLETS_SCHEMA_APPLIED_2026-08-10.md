# ΠΑΛΕΤΕΣ — Τι δημιουργήθηκε στη Supabase (Migration 003)

_Εκτελέστηκε 2026-08-10 μέσω SQL editor (Monaco setValue injection — όχι
πληκτρολόγηση) · «Success. No rows returned» · verification queries: όλα
τα αντικείμενα υπάρχουν, κενά, χωρίς errors._
_RLS ενεργό στον πίνακα· τα views με `security_invoker = true` (ΔΕΝ
παρακάμπτουν το RLS — final review fix, commit fcf8844)._

## Πίνακας (1)

### pl_movements — το ημερολόγιο παλετών (21 στήλες)
`id* · code* (auto PM-1001+) · movement_date* · counterparty_type* CLIENT/PARTNER ·
client_id → clients · partner_id → partners · location_id → locations ·
event_type* (7: LOADING, DELIVERY, PARTNER_PICKUP, PARTNER_DROPOFF,
RETURN_OUT, RETURN_IN, ADJUSTMENT) · taken*/given* (≥0, από τη δική μας
σκοπιά: taken = πήραμε εμείς) · order_stop_id → order_stops ·
cons_load_id → consolidated_loads · sheet_url · sheet_source
UPLOAD_AI/UPLOAD/MANUAL · status* pending→confirmed→reversed ·
reversal_of → pl_movements (η νέα σωστή εγγραφή δείχνει την αντιλογισμένη) ·
reason · notes · created_by* · created_at* · confirmed_by · confirmed_at`
Constraints: one_counterparty (XOR CLIENT/PARTNER), adjustment_needs_reason.
Indexes: (client_id,status) · (partner_id,status) · partial σε order_stop_id, cons_load_id.

## Views (3) — υπόλοιπα ΜΟΝΟ από confirmed, pending χωριστή στήλη

| View | Επιστρέφει |
|---|---|
| pl_v_balance_clients | client_id, client_name, balance = Σ(given−taken) confirmed, pending_count |
| pl_v_balance_partners | ομοίως ανά partner |
| pl_v_client_locations | ανάλυση πελάτη ανά σημείο (drill-down) |

Inner join: αντισυμβαλλόμενοι ΧΩΡΙΣ κινήσεις δεν εμφανίζονται (σκόπιμο —
διάκριση άγραφου/μηδενικού, audit Π2).

## Worker deploy

`petras-tms-backend-staging` version `ad450f15-44ff-4152-9e46-b74a6edbff02`
(2026-08-10, wrangler 4.120.0) — routes `/pallets/*`: movements CRUD ·
confirm · reverse · balances · lookups. Enforcement `PL_PERMS` ανά ρόλο·
ADJUSTMENT owner-only σε ΟΛΑ τα write paths.

## Smoke που έτρεξε (14/14 ✅, in-page fetch από το app origin)

1. GET movements → `[]` · lookups → client_id 813
2. POST LOADING taken=33/given=10 → 201 **pending, code PM-1001**
3. Balances πριν: **bal 0, pending 1** (τα pending ΔΕΝ μετράνε)
4. Confirm → confirmed · Balances: **bal −23** (οφείλουμε 23)
5. Reverse με άκυρο replacement → **400 ΚΑΙ η αρχική έμεινε confirmed**
   (validate-before-mutate — final review fix)
6. Κανονικό reverse → reversed · Balances: **bal 0**
7. DELETE σε reversed → **409** («use reverse»)
8. String ποσότητα ("5") → 400 · drill-down ανύπαρκτου → `[]` ·
   `type=Partners` → πέφτει σε clients (case-sensitive, σημείωση Φ3 UI)

Η δοκιμαστική κίνηση PM-1001 μένει στο ιστορικό ως reversed («δοκιμή Φ1 -
καθαρισμός») — μηδενική επίδραση στα υπόλοιπα.

---

# Φ2 — Τροφοδότες (εφαρμόστηκε 2026-08-12)

Spec: `docs/PALLETS_F2_FEEDERS.md` · Πλάνο: `docs/superpowers/plans/2026-08-12-pallets-f2-feeders.md`

## Βάση

- **Migration 004** ✅ — στήλη `pl_movements.order_id` (+ partial index)· τα FKs
  `order_stop_id` / `cons_load_id` / `order_id` έγιναν **ON DELETE SET NULL**
  ώστε το ιστορικό να επιβιώνει της διαγραφής παραγγελίας· private bucket
  `pallet-sheets`. Επαλήθευση: `confdeltype='n'` και στα τρία (τα υπόλοιπα `a`).
- **Migration 005** ✅ — `grant delete on pl_movements to service_role`.
  **Εύρημα παραγωγής:** ο service_role είχε INSERT/SELECT/UPDATE αλλά ΟΧΙ
  DELETE, οπότε κάθε διαγραφή κίνησης γύριζε 403. Το smoke της Φ1 δεν το
  έπιασε γιατί είχε δοκιμάσει μόνο την ΑΠΑΓΟΡΕΥΣΗ διαγραφής (409 σε confirmed).

## Worker (version 56a467d2)

- `PL_PERMS.accountant` διευρύνθηκε: movements GET/POST/PATCH + confirm +
  reverse + sheets (η Αλεξία έχει αναλάβει τις παλέτες). ΟΧΙ delete/ADJUSTMENT.
- `plResolveRefs` — μοναδικό σημείο μετάφρασης legacy `recXXX` → pg bigint
  (`*_rec` keys). GET φίλτρα `order_stop_rec` / `order_rec`.
- `/pallets/sheets` — POST upload (base64 → Storage, Content-Type από την
  κατάληξη) + GET signed URL 1 ώρας. Το `path` επικυρώνεται με regex ώστε
  να μην μπορεί να υπογραφεί αρχείο εκτός του bucket.
- Το DELETE επιστρέφει πλέον τον κωδικό της PostgREST στο μήνυμα σφάλματος.

## Frontend

- **`core/pallet-feed.js`** (νέο) — όλοι οι feeders: `plOnOrderSaved`,
  `plOnDelivered`, `plOnIntlPartnerAssigned`, `plOnExchangeOff`,
  `plOnOrderDeleted`. Idempotent (έλεγχος ανά στάση + σάρωση ορφανών),
  μη-μπλοκάροντες (αποτυχία → toast, η παραγγελία σώζεται κανονικά).
- **Hooks**: orders_intl (save + cascade delete), orders_natl (save + delete),
  daily_ops (Delivered ×2 — εκεί γράφεται το status, όχι στον stepper),
  weekly_intl (ανάθεση export **και import** + καθαρισμός ανάθεσης),
  order-sync (PE toggle). Αφαιρέθηκε ο νεκρός κώδικας PALLET_LEDGER (4 σημεία
  + `cleanupPLorphans`).
- **`modules/pallet_ledger.js`** ξαναγράφτηκε (514→292 γραμμές): Εκκρεμείς /
  Χωρίς πλήρη επιστροφή / Όλες, φίλτρα + Export CSV (διατηρήθηκαν από την
  παλιά σελίδα), modal επιβεβαίωσης με upload δελτίου, «Διόρθωση ανταλλαγής»
  (σενάριο Lidl), φόρμα «Νέα κίνηση». Ίδιο route/entry `renderPalletLedger`.

## Επαλήθευση live (2026-08-12)

Feeders (API): 2 εκκρεμείς από 2 στάσεις φόρτωσης με σωστές ποσότητες ✓ ·
cross-dock/παράδοσης αγνοήθηκαν ✓ · idempotency ✓ · σάρωση ορφανών ✓ ·
partner feeder σε μη-partner παραγγελία δεν γράφει τίποτα ✓ · PE off καθαρίζει ✓.

Φόρμα παραγγελιών (browser, κανόνας CLAUDE.md): η φόρμα ανοίγει με 25 πεδία
χωρίς σφάλματα ✓ · validation δουλεύει ✓ · **νέα παραγγελία → PM-1005 pending
taken=33 αυτόματα** ✓ · re-save χωρίς διπλό ✓ · διαγραφή → η κίνηση
καθαρίστηκε, κανένα ορφανό ✓.

UI Ισοζυγίου: αποδίδει σωστά, καρτέλες/φίλτρα/CSV λειτουργούν, φόρμα «Νέα
κίνηση» στέλνει σωστό payload (dry-run με παγίδευση αιτήματος) ✓.

## Εκκρεμότητες μετά τη Φ2

- **Φ3**: πλήρες Ισοζύγιο (υπόλοιπα ανά πελάτη/partner, drill-down ανά σημείο).
- **Φ4**: gates Invoiced + Partner PnL. **Φ5**: pallet_upload AI → κινήσεις.
- Τα **εθνικά δεν έχουν μετάβαση σε Delivered** στο UI — μέχρι να αποκτήσουν,
  οι εθνικές παραδόσεις καταχωρούνται από τη φόρμα «Νέα κίνηση».
- Follow-up chip: `security_invoker` retrofit στα ct_* views του 001.
