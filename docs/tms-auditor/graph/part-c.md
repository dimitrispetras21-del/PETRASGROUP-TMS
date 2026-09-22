# Graph part-c — Τιμολόγηση + Παλέτες (base SHA 549a2a4)

Ομάδα γ. Ιδιοκτησία: `modules/invoicing.js`, `modules/pallet_ledger.js`, `modules/pallet_upload.js`,
`core/pallet-feed.js`· Worker `/pallets/*` + `invoiceMarkError` + PATCH orders/national_orders (invoiced)·
πίνακες `pl_movements`, `pallet_ledger_suppliers/partners`· views `pl_v_*`, `ct_v_rt_pallet_gate`· trigger 043.
84 nodes, 69 edges, 5 failure_modes.

## Η αλυσίδα Τιμολόγησης (F-30)

`_invMarkInvoiced` (invoicing.js:853-882) ελέγχει με σειρά: `_invPESheetsOK` (πύλη παλετών) → `_invHasPrice`
(price>0, ίδιος κανόνας παντού μετά το cf970ce 22/9) → αριθμός ΤΠΥ → `_invWriteInvoice` → `atPatch`
Invoiced/Invoice Number/Invoice Date (ΠΟΤΕ Status). Ο Worker (`invoiceMarkError`, γρ. 2750-2762) και το trigger
043 επαναλαμβάνουν ΜΟΝΟ τον έλεγχο τιμής+αριθμού — τριπλή άμυνα εκεί. Η πύλη παλετών όμως **δεν έχει καμία
άμυνα στον Worker**: `invoiceMarkError` δεν κοιτάζει ποτέ το `pl_v_order_gate`. Εύρημα **FM-c-05**: οποιοσδήποτε
ρόλος με PATCH σε orders/national_orders (owner, management, accountant, dispatcher) μπορεί να τιμολογήσει μια
παραγγελία PE χωρίς κανένα δελτίο, χωρίς 422, χωρίς να περάσει καν από `/pallets/override` — ολόκληρη η §4.1 του
`docs/PALLETS_ARCHITECTURE.md` είναι σύμβαση UI, όχι εγγύηση βάσης. Ο έλεγχος B-16 δεν το πιάνει, γιατί μετρά
ΜΟΝΟ γραμμές `invoiced IS NOT TRUE` — μια γραμμή που τιμολογήθηκε παρακάμπτοντας την πύλη απλώς βγαίνει από το
ερώτημα.

Όταν το `/pallets/gate` πέσει (`_invLoadGate`, invoicing.js:247-265), η οθόνη γυρίζει σε παλιό έλεγχο ανά-στάση
(`_invPESheetsOKPerStop`, γρ. 142-148) που διαβάζει `Pallet Sheet 1/2 Uploaded`. Αυτά τα πεδία όμως δεν τα γράφει
πια ΚΑΝΕΙΣ ζωντανά: το `modules/pallet_upload.js` (σημείο εισόδου `openPalletUpload`) έχει **μηδέν callers** σε
όλη την εφαρμογή — αφαιρέθηκε 7/9/2026, το ίδιο το σχόλιο στο `orders_intl.js:2159-2168` το τεκμηριώνει ως
γνωστό κρίσιμο εύρημα του χάρτη TMS. Άρα μια διακοπή της πύλης δεν «υποβαθμίζει» — μπλοκάρει σχεδόν 100% της
τιμολόγησης PE (**FM-c-01**). Νεκρό επίσης: `orders_intl.js#_checkPalletSheets` (γρ. 2142-2153), αντίγραφο του
ίδιου ελέγχου, μηδέν callers.

**Undo** (`_invUndoInvoice`, γρ. 899-919, commit 4801db4): το `if (ROLE !== 'owner') return` είναι **μόνο στο
UI**. Ο Worker δεν ξαναελέγχει ρόλο σε αυτή τη μετάβαση (invoiced:true→false) — το `invoiceMarkError` αφήνει
ρητά περάσει `patch.invoiced===false`. Επειδή accountant ΚΑΙ dispatcher έχουν πλήρες PATCH σε orders/
national_orders (`PERMISSIONS`, γρ. 513/517/534-535), οποιοσδήποτε από τους δύο ρόλους μπορεί να καλέσει το ίδιο
PATCH απευθείας και να αναιρέσει σήμανση χωρίς να είναι owner — σιωπηλά, χωρίς 403 (**FM-c-02**). Καμία δοκιμή
δεν το καλύπτει (το `tests/invoicing-price.test.js` δοκιμάζει μόνο το σχήμα των πεδίων undo, όχι τον φραγμό
ρόλου — δεν υπάρχει φραγμός στον Worker να δοκιμαστεί).

**Παράκαμψη owner** (`_invOverrideInvoice`, γρ. 921-944): `POST /pallets/override` γράφει ΜΟΝΟ μια γραμμή audit
(`action:'invoice_override'`) — καμία σύνδεση με pl_movements ή με το επόμενο PATCH. Η ίδια η γραφή τιμολόγησης
ακολουθεί σε ξεχωριστό, ασύνδετο κάλεσμα (`_invWriteInvoice`). Αν το δεύτερο αποτύχει, η εγγραφή audit μένει
«ορφανή» — σκόπιμο σχέδιο (σχόλιο invoicing.js:887-891), αλλά και απόδειξη ότι η παράκαμψη είναι προαιρετική
από τη σκοπιά του Worker: βλ. FM-c-05 — μπορεί κανείς να τιμολογήσει χωρίς καν να καλέσει `/pallets/override`.

## Ισοζύγιο Παλετών — 3-step confirm (F-31)

`plvDoConfirm` (pallet_ledger.js:1010-1042): POST `/pallets/sheets` → PATCH `/pallets/movements/:id`
(taken/given/sheet_source) → POST `.../confirm`. Τρία ξεχωριστά HTTP calls, **καμία συναλλαγή** τα δένει
(**FM-c-03**). Αν το PATCH περάσει και το confirm αποτύχει, η κίνηση μένει `pending` με ποσότητες ήδη γραμμένες
— αόρατη διαφορά από μια ανέγγιχτη pending μέχρι να την ανοίξεις ξανά. Ο έλεγχος B-17 (`pl_pending_7d`) το
πιάνει μόνο μετά από 7 μέρες. Το ίδιο μοτίβο στο `plvDoFix` (διόρθωση Lidl, γρ. 1138-1158): το `reverse` με
`replacement` ΕΙΝΑΙ ατομικό μέσα στο ίδιο Worker call (validation πριν την αλλαγή, γρ. 4474-4497), αλλά το
confirm του replacement είναι πάλι ξεχωριστό κάλεσμα (γρ. 1154).

Αντίθετα με το invoicing.js, το `renderPalletLedger` (γρ. 30-60) δείχνει **δυνατό** σφάλμα σε αποτυχία φόρτωσης
(πλήρης σελίδα με «Ξαναδοκίμασε», όχι σιωπηλό fallback) — καλή πρακτική, καταγράφεται ως θετικό.

## Feeders και callers τους (F-32, για ομάδα α)

`core/pallet-feed.js` έχει 5 feeders, όλα μέσα σε `_plSafe` (γρ. 23-32): catch-all, toast 8", `plOnOrderSaved`
επιστρέφει null — ΠΟΤΕ δεν μπλοκάρει το save/delete που τα καλεί. Callers (file:line):
- `plOnOrderSaved`: `core/order-sync.js:98` (μόνο όταν άλλαξε 'Pallet Exchange'), `orders_intl.js:2073`
  (submitIntlOrder, ανεξάρτητα), `orders_natl.js:1443` (submitNatlOrder, ΜΕΣΑ σε try/catch γύρω από τα
  ORDER_STOPS — μια αποτυχία εκεί προσπερνά σιωπηλά τον feeder).
- `plOnOrderDeleted`→`plOnExchangeOff`: `orders_intl.js:3026`, `orders_natl.js:1953`.
- `plOnDelivered`: `daily_ops.js:936` και `:1103` — **χωρίς await** (fire-and-forget) και από τα δύο σημεία
  παράδοσης (κανονική + καθυστερημένη).
- `plOnIntlPartnerAssigned`: `weekly_intl.js:3249`, `:3259` (σκέλος εισαγωγής/PARTNER_DROPOFF), `:3430`
  (αποδέσμευση) — και τα τρία χωρίς await.

Επειδή κανένα δεν περιμένεται, ένα toast αποτυχίας μπορεί να εμφανιστεί ενώ ο χρήστης έχει ήδη αλλάξει οθόνη —
η κίνηση παλετών χάνεται χωρίς κανένα ίχνος πέρα από ένα toast που ίσως δεν το είδε κανείς (**FM-c-04**). Δεν
υπάρχει έλεγχος που να συγκρίνει πληθυσμιακά «παραγγελίες με PE + στάση Loading» έναντι «έχουν κίνηση
pl_movements» — τα B-16/B-17 βλέπουν μόνο κινήσεις που ΥΠΑΡΧΟΥΝ.

## Schema pl_* και Storage

`pl_movements` (003): confirmed ποτέ δεν σβήνεται/επεξεργάζεται (409 στον Worker αν status≠pending) — εφαρμογή
σε επίπεδο API, όχι DB trigger/constraint. `pl_v_order_gate`/`ct_v_rt_pallet_gate` (007): και τα δύο ορίζονται
στο ίδιο migration· το δεύτερο είναι cross_dep προς ομάδα β (Trip PnL). Το `/pallets/sheets` **δεν** γράφει σε
πίνακα `pl_sheets` (δεν υπάρχει τέτοιος πίνακας — διόρθωση στο brief) αλλά σε Supabase Storage bucket
`pallet-sheets`, με path validation κατά path traversal (γρ. 4574-4576).

## Δεν επαληθεύτηκαν

Ζωντανό Worker bundle έναντι `worker/src/index.js` (δεν έγινε δίκτυο)· αν `_wiSaveFromPopover`/`_opsDelFinal`
πραγματικά «χάνουν» toast σε πραγματική χρήση (μόνο ανάγνωση κώδικα, όχι κλικ)· η ακριβής συχνότητα της
ασυμφωνίας 63 vs 51 (πηγή: review doc, όχι δική μας μέτρηση)· αν `modules/pallet_upload.js` γράφει όντως σε
`pallet_ledger_suppliers` (probable, όχι confirmed — δεν διαβάστηκε ολόκληρο το αρχείο).

## cross_deps
Προς **α**: `syncOrderDownstream` (ποιοι άλλοι το καλούν) + `Total Pallets` στον χάρτη ORDERS. Προς **β**:
`ct_v_rt_pallet_gate` (ίδιο σχήμα κενής επιβολής με FM-c-05;). Προς **ε**: `plFetch` 401 handling· ο ρόλος του
`audit_log` action `invoice_override` στο audit trail UI.
