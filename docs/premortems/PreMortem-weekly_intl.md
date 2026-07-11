# Deep Pre-Mortem — Weekly International

_2026-07-11 · modules/weekly_intl.js (1.814 γρ.) · Σενάριο: 6 μήνες μετά, οι
dispatchers έχουν γυρίσει σε Excel για τον προγραμματισμό. Τι έφταιξε;_

## Τι κάνει η σελίδα
Ο εβδομαδιαίος προγραμματισμός διεθνών: λίστα exports ανά εβδομάδα, matching
με imports (drag & drop), ανάθεση σε φορτηγό/οδηγό/τρέιλερ ή partner (με
rates), badges (GRP κ.λπ.), print. Γράφει ΜΟΝΟ στο ORDERS + PARTNER
ASSIGNMENTS και πυροδοτεί `syncOrderDownstream`.

## Το αφήγημα της αποτυχίας
Δύο dispatchers δουλεύουν την ίδια εβδομάδα. Ο ένας «καθαρίζει» μια ανάθεση
την ώρα που ο άλλος την επεξεργάζεται — το clear δεν βλέπει το conflict, το
UI δείχνει καθαρό, η βάση όχι. Σε ένα groupage 5 παραγγελιών το σύστημα
σώζει τις 2 και σταματά στην 3η — μισο-ανατεθειμένο γκρουπ που κανείς δεν
καταλαβαίνει. Τα Partner Assignments ξεμένουν πίσω σιωπηλά. Η εμπιστοσύνη
πέφτει, το Excel επιστρέφει.

## 🐯 Tigers

### T1 — Unmatch/Clear ΔΕΝ ελέγχουν conflict _(Launch-blocking για v2)_
Το match και το assignment save ελέγχουν `res?.conflict` και κάνουν refresh
(σωστά — γρ. 1098, 1441-49, 1584). Όμως **`_wiRemoveImport` (γρ. ~1129) και
`_wiClear` (γρ. ~1618) ελέγχουν μόνο `res?.error`**. Το `atSafePatch` σε
conflict επιστρέφει `{conflict:true}` ΧΩΡΙΣ error → ο βρόχος το περνάει για
επιτυχία → **το UI δείχνει «καθαρίστηκε», η βάση κρατά την παλιά τιμή**.
Σενάριο: dispatcher A καθαρίζει ενώ ο B αποθηκεύει → φαντομά ανάθεση.
_Fix: ίδιο conflict-check και στους δύο βρόχους (4 γραμμές)._

### T2 — Ομαδικές αποθηκεύσεις χωρίς ατομικότητα _(Major)_
Όλα τα saves είναι `for(orderId of row.orderIds){ atSafePatch… }`. Σε
groupage με 5 orders: conflict στο 3ο → `return` με τα 1-2 γραμμένα και τα
3-5 όχι (γρ. 1441-46) → **μισο-ανατεθειμένο γκρουπ**. Στο v2/Postgres αυτό
πρέπει να γίνει transaction· μέχρι τότε το refresh-on-conflict το κάνει
ορατό αλλά όχι ακίνδυνο.

### T3 — Optimistic UI πριν την αποθήκευση _(Major)_
`row.importId=null; _wiPaint();` ΠΡΙΝ τα patches (`_wiRemoveImport`)· σε
αποτυχία το UI δείχνει τη νέα κατάσταση, η βάση την παλιά, μέχρι το επόμενο
πλήρες render. Μαζί με το T1, ο dispatcher δεν έχει κανένα σήμα ότι κάτι
δεν γράφτηκε.

### T4 — Fire-and-forget sync & PA drift _(Major)_
`syncOrderDownstream(...).catch(console.warn)` (γρ. 1102-03) και PA
upsert/delete με `catch(console.warn)` (γρ. ~1460, 1602-08): οι αποτυχίες
πάνε ΜΟΝΟ στην κονσόλα — ούτε toast, ούτε error log. Τα κατάντη (GL/CL/NL)
και τα PARTNER ASSIGNMENTS ξεφεύγουν από τα ORDERS χωρίς κανένα ίχνος.
_Fix: logError() αντί για console.warn + περιοδικό reconcile._

### T5 — Το matching ζει σε text field που το v2 αποσύρει _(Migration)_
Η αντιστοίχιση export↔import = `'Matched Import ID'` (κείμενο στο ORDERS).
Το spec το αποσύρει υπέρ των round_trips. **Το migration script πρέπει να
διαβάσει αυτό το πεδίο για να χτίσει τα ιστορικά ζεύγη** — αν έχει σκουπίδια
(κενά, λάθος ids), τα round trips γεννιούνται λάθος. Θέλει validation pass
πριν το cutover.

### T6 — Partner Rate προαιρετικό στο assignment _(PnL dependency)_
Το rate γράφεται στο order μόνο αν το συμπληρώσει ο dispatcher
(`row.partnerRate?parseFloat(...):null`, γρ. ~1433). Στο v2 αυτό είναι ΤΟ
κόστος του partner trip (spec §10.1#4) → null rate = trip με κόστος 0 και
ψεύτικο 100% margin. _Fix στο v2: rate υποχρεωτικό όταν partner._

## 🐅 Paper Tigers
- «XSS από ονόματα πελατών» — escapeHtml/_wiClean χρησιμοποιούνται συνεπώς.
- «Το full re-render μετά από κάθε save είναι αργό» — είναι και η ασφαλέστερη
  επιλογή εδώ· με cache δεν ενοχλεί στην πράξη.
- «Rate limit Airtable» — σειριακά patches, εντός ορίων.

## 🐘 Elephants
1. **Ποιος «κλείνει» την εβδομάδα;** Δεν υπάρχει τελικό confirm/lock — στο v2
   αυτή η σελίδα γεννά round trips· χρειάζεται σαφές γεγονός «η εβδομάδα
   κλείδωσε» πριν φύγουν trips προς PnL.
2. **Groupage merge UI** (COSTS E2) — θα ζήσει εδώ· κανείς δεν το έχει σχεδιάσει.
3. **Trips που σπάνε εβδομάδες** — export week 28, return week 29: σε ποια
   εβδομάδα ανήκει το round trip; (θέμα date-window, COSTS T2).

## Ταξινόμηση & δράσεις
| # | Σοβαρότητα | Δράση | Πότε |
|---|---|---|---|
| T1 | 🔴 Fix τώρα (4 γραμμές) | conflict-check σε unmatch/clear | με το ξεπάγωμα ή αίτημα στη Valuedriven Stage 1 |
| T2 | 🟠 v2 transaction | ομαδικό save ατομικό στο Postgres | Stage 2 |
| T3 | 🟠 v2 pattern | persist-then-paint ή rollback UI | Stage 2 |
| T4 | 🟠 Quick win | logError + reconcile δρομολόγιο | Stage 1 |
| T5 | 🔴 Migration gate | validation του Matched Import ID πριν το cutover | πριν Stage 2 cutover |
| T6 | 🟠 v2 κανόνας | Partner rate υποχρεωτικό | Phase 2 (PnL) |

**Verdict: 🔴 — λειτουργεί καθημερινά, αλλά T1 είναι ενεργό bug συνθηκών
αγώνα και T5/T6 καθορίζουν την ποιότητα του αυριανού PnL.**
