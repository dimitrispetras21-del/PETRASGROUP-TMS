# Deep Pre-Mortem — National Orders

_2026-07-11 · modules/orders_natl.js (1.613 γρ.) · Σενάριο: 6 μήνες μετά,
εθνικές παραγγελίες «εξαφανίζονται» ή διπλογράφονται και το εθνικό PnL
ξεκινά με βρώμικη βάση._

## Τι κάνει η σελίδα
CRUD εθνικών παραγγελιών. Δύο δρόμοι γέννησης: (α) χειροκίνητα εδώ,
(β) **αυτόματα από ORDERS με Veroia Switch=ON** — δηλαδή η σελίδα δείχνει
και δεδομένα που ΔΕΝ δημιούργησε. Sync προς NAT_LOADS + GROUPAGE LINES,
cancel/delete cascade όπως το intl.

## Το αφήγημα της αποτυχίας
Ένας dispatcher επεξεργάζεται ένα VS-created order που το σύστημα
ξαναδημιουργεί από τη διεθνή πλευρά — διπλοεγγραφή. Ένα cancel πατάει πάνω
σε ταυτόχρονο edit χωρίς έλεγχο. Και όταν ήρθε η ώρα του v2, το «ποια NO
είναι VS και ποια αυτόνομα» δεν ήταν πάντα ξεκάθαρο στα δεδομένα.

## 🐯 Tigers

### T1 — Το «hard-delete bug» της Valuedriven: τι ακριβώς είναι σήμερα; _(Verify)_
Το proposal (26/05) γράφει «Fix the hard-delete bug in national orders» ως
Stage-1 στόχο. Ο κώδικας ΣΗΜΕΡΑ έχει FIXME(audit) σχόλια (γρ. 655, 807,
1021) και τα GL γίνονται σωστά `Status:'Unassigned'` με atSafePatch — άρα
μέρος του bug έχει ήδη διορθωθεί ΜΕΤΑ το proposal. **Κίνδυνος:** η
Valuedriven να «φτιάξει» κάτι που άλλαξε — ή να θεωρήσει το item κλειστό
ενώ μένει το ασύμμετρο restore (T2). _Δράση: sync call πριν το Stage 1 με
diff του σημερινού κώδικα._

### T2 — Ίδιο ασύμμετρο delete/restore με το intl _(Major)_
Soft ο γονιός (`atSoftDelete` γρ. 1076), hard τα παιδιά (NL/CL/RAMP/PL/
STOPS/PA, γρ. 991-1070). Restore = μισή παραγγελία. Θετικό: τα failures
μετριούνται ΚΑΙ γράφονται στο error log (γρ. 1085) — καλύτερο pattern από
το intl· να αντιγραφεί εκεί.

### T3 — Cancel χωρίς conflict-check _(Minor-Major)_
Γρ. 958: σκέτο `atPatch({'Status':'Cancelled'})` — πατάει ταυτόχρονες
αλλαγές. Μόνο 2 conflict-checked σημεία στο module (form save 550,
invoiced 706).

### T4 — Διπλή προέλευση NO χωρίς σαφές σήμα ιδιοκτησίας _(Migration)_
Τα VS-created NO συνυπάρχουν με τα χειροκίνητα. Αν ο χρήστης επεξεργαστεί
VS-created NO, η επόμενη VS sync από τη διεθνή πλευρά μπορεί να το
ξαναγράψει/αναδημιουργήσει. Στο v2 το `source` (VS | Independent | Direct)
πρέπει να γίνει σκληρό πεδίο με κανόνες edit — κρίσιμο και για το ποια NO
γίνονται round trips με revenue=X (VS) vs agreed price (λοιπά).

### T5 — NL upsert με σκέτο atPatch _(Minor)_
`_syncNationalLoad` (γρ. 911): plain atPatch στο υπάρχον NAT_LOAD — race
με το Weekly National που γράφει στο ίδιο record (assignment) → χαμένα
πεδία. Σπάνιο αλλά υπαρκτό όσο NO-edits και ανάθεση συμβαίνουν παράλληλα.

## 🐅 Paper Tigers
- «Ο κανόνας GL never-delete παραβιάζεται» — ΟΧΙ πλέον: και τα 3 σημεία
  κάνουν Status='Unassigned' (audit fix). Ο φόβος είναι ιστορικός.
- «Direction arrows» — εδώ γράφονται σωστά από το UI· ο κίνδυνος είναι σε
  εξωτερικά scripts/imports, όχι στη σελίδα.

## 🐘 Elephants
1. **Pure-domestic («Independent») orders στο PnL:** το spec αρχικά τα
   άφηνε εκτός costing, τα NOTES τα έβαλαν μέσα (national round trips).
   Ισχύει για ΟΛΑ τα NO ή μόνο όσα περνούν από Weekly National; Τα
   ανεξάρτητα που δεν μπαίνουν ποτέ σε planner μένουν χωρίς trip;
2. Το iframe (consolidation) και αυτή η σελίδα γράφουν GL/CL παράλληλα —
   βλ. PreMortem-weekly_pickups T2.

## Ταξινόμηση & δράσεις
| # | Σοβαρότητα | Δράση | Πότε |
|---|---|---|---|
| T1 | 🔴 | sync call με Valuedriven: τι έχει ήδη διορθωθεί | πριν Stage 1 |
| T2 | 🟠 | v2 transactional soft-delete· αντιγραφή logError στο intl | Stage 2 / τώρα |
| T3 | 🟡 | conflict-check στο cancel | Stage 1 |
| T4 | 🔴 | source field + edit rules στο v2 schema | Stage 2 design |
| T5 | 🟡 | atSafePatch στο NL upsert | Stage 1 |

**Verdict: 🔴→🟡 — καλύτερο από τη φήμη του (GL rule τηρείται, cascade
καταγράφεται)· το κρίσιμο είναι το T4 (VS ownership) γιατί καθορίζει το
εθνικό PnL, και το T1 για να μη γίνει διπλή/λάθος δουλειά στο Stage 1.**
