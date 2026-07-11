# Deep Pre-Mortem — International Orders

_2026-07-11 · modules/orders_intl.js (2.640 γρ. — το μεγαλύτερο module) ·
Σενάριο: 6 μήνες μετά, μια διαγραφή παραγγελίας άφησε πίσω της χάος, και
το PnL ξεκίνησε με λάθος revenue._

## Τι κάνει η σελίδα
CRUD διεθνών παραγγελιών + AI scan εγγράφων + Veroia Switch cascade
(ORDERS→NAT_ORDERS→NAT_LOADS) + groupage (GL/CL) + delete/restore/cancel.
Είναι η ΡΙΖΑ της αλυσίδας sync — και στο v2 το `Price` της γίνεται το
revenue του TRIP PnL (spec §4).

## Το αφήγημα της αποτυχίας
Μια παραγγελία διαγράφηκε και επαναφέρθηκε από το Trash — γύρισε ο γονιός,
όχι τα παιδιά (stops, ramp, pallets). Ένα scan συμπλήρωσε τα πάντα εκτός
από την τιμή, κανείς δεν το πρόσεξε, και έξι μήνες μετά το trip έδειχνε
margin −100%. Το cancel πάτησε πάνω σε ταυτόχρονη επεξεργασία χωρίς έλεγχο.

## 🐯 Tigers

### T1 — Ασύμμετρο delete/restore: soft ο γονιός, hard τα παιδιά _(Major)_
Στη διαγραφή (γρ. 2252-2373): το ORDER πάει με `atSoftDelete` (2371 —
ανακτήσιμο από Trash), αλλά ΟΛΑ τα παιδιά (NAT_LOADS, CONS_LOADS, GL_LINES,
RAMP, PALLET, ORDER_STOPS, PARTNER_ASSIGN) διαγράφονται **hard** (2291-2364).
Restore από Trash → **μισο-αναστημένη παραγγελία**: υπάρχει στη λίστα, δεν
υπάρχει σε ράμπα/στάσεις/παλέτες. Ο χρήστης εμπιστεύεται τον «κάδο» που δεν
επιστρέφει τα πάντα. _Fix v2: transaction + soft-delete σε όλη την αλυσίδα
(ή restore που ξαναχτίζει τα παιδιά)._

### T2 — `Price` χωρίς κανένα validation _(PnL launch-blocking)_
Grep για validation στο Price: **μηδέν αποτελέσματα**. Άδεια/λάθος τιμή
περνάει σε create, edit και scan-prefill. Σήμερα = λάθος στατιστικά·
στο v2 = λάθος revenue σε round trip (spec §4: revenue ΠΟΤΕ δεν
ξαναπληκτρολογείται — ό,τι γράφει το order, αυτό μετράει). _Fix: required
στο form τώρα (1 γραμμή), gate «δεν κλείνει round trip χωρίς Price» στο v2._

### T3 — Conflict-checks μόνο σε 3 από τα ~40 σημεία εγγραφής _(Major)_
`atSafePatch` με έλεγχο conflict: μόνο form save (1463), Invoiced toggle
(1550), Status (1569). Το cancel (2252) και όλα τα cascade patches
(836, 858, 976…) είναι σκέτο `atPatch` — ταυτόχρονη επεξεργασία χάνεται
σιωπηλά. Δικαιολογημένο σε cascade internals, ΟΧΙ στο cancel.

### T4 — Cascade αποτυχίες μετρώνται αλλά δεν αποκαθίστανται _(Major)_
Κάθε βήμα του delete cascade έχει `try/catch { _delFail++ }` — σωστά δεν
σταματά στη μέση, αλλά τα failed deletes μένουν ως ορφανά που μόνο το
χειροκίνητο `cleanupOrphans()` (console-only, A7) καθαρίζει. Κανένα
αυτόματο follow-up.

### T5 — Scan prefill χωρίς σήμανση προέλευσης _(PnL data quality)_
Τα πεδία από AI scan δεν μαρκάρονται (no confidence/source flag στο record).
Λάθος OCR σε τιμή/ημερομηνίες = αόρατο. Το verify-before-commit υπάρχει στο
UI, αλλά μετά το save δεν ξεχωρίζεις scanned από typed. _Ελαφρύ fix v2:
`source: scan|manual` στο audit log._

## 🐅 Paper Tigers
- «Το VS sync θα αφήσει ορφανά» — έχει το ΚΑΛΥΤΕΡΟ pattern του app:
  `_createdIds` tracking → reverse rollback → logError σε ορφανά rollback →
  σαφές μήνυμα χρήστη (γρ. 763-1040). Να αντιγραφεί παντού, όχι να φοβίζει.
- «2.640 γραμμές = ασυντήρητο» — μεγάλο αλλά δομημένο σε καθαρές ενότητες.

## 🐘 Elephants
1. **Τι σημαίνει «Cancelled» οικονομικά;** Στο v2: cancelled order με
   δεσμευμένο truck = κόστος χωρίς revenue. Ποιος το βλέπει στο PnL;
2. Το delete cascade υλοποιεί business κανόνες (GL exception κ.λπ.) που
   ζουν ΜΟΝΟ στον κώδικα — πρέπει να γραφτούν στο migration spec για να
   επιβιώσουν στο Postgres ως FK/trigger κανόνες.

## Ταξινόμηση & δράσεις
| # | Σοβαρότητα | Δράση | Πότε |
|---|---|---|---|
| T2 | 🔴 | Price required στη φόρμα (τώρα) + v2 gate | ξεπάγωμα / Phase 2 |
| T1 | 🔴 | v2: transactional soft-delete όλης της αλυσίδας | Stage 2 |
| T3 | 🟠 | conflict-check στο cancel | Stage 1 |
| T4 | 🟠 | orphan sweep αυτόματο (ή admin κουμπί) | Stage 1-2 |
| T5 | 🟡 | source flag στο audit | Stage 2 |

**Verdict: 🔴 — η ρίζα της αλυσίδας και του αυριανού revenue· το Trash
που δεν επιστρέφει ολόκληρες παραγγελίες είναι θέμα εμπιστοσύνης χρήστη
σήμερα, το Price validation είναι θέμα σωστών αριθμών για πάντα.**
