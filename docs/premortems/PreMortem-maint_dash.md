# Deep Pre-Mortem — Maintenance Dashboard

_2026-07-11 · modules/maintenance.js (σελίδα 5, γρ. 1229+) · Σενάριο:
6 μήνες μετά, το «Bloomberg-style command center» δείχνει εντυπωσιακό και
κανείς δεν το κοιτάει._

## Τι κάνει η σελίδα
Συγκεντρωτικό κέντρο συντήρησης: KPIs, top workshops, μηνιαία κόστη,
expiry σύνοψη, auto-refresh timer, skeleton loading. Read-only πάνω στα
TRUCKS/TRAILERS/MAINT_HISTORY/WORKSHOPS.

## 🐯 Tigers

### T1 — Auto-refresh timer που επιζεί της σελίδας _(Bug-prone pattern)_
`_maintDashRefreshTimer` (γρ. 1231): αν το navigation δεν κάνει πάντα
clearInterval, ο timer συνεχίζει να τραβά δεδομένα από άλλη σελίδα —
κρυφό API traffic + πιθανά σφάλματα σε DOM που δεν υπάρχει πια. Κλασικό
SPA leak· θέλει έλεγχο στο route-change.

### T2 — Τα μηνιαία κόστη θα γίνουν το §10.2 item 10 _(PnL dependency)_
Ο monthly cost aggregator είναι ο πρόδρομος του calibrated €/km. Σήμερα
αθροίζει ό,τι records υπάρχουν — με τα ιστορικά Cost/km προαιρετικά
(μέχρι χθες), οι μήνες δεν είναι συγκρίσιμοι. Χωρίς mini-backfill, το
πρώτο 12μηνο του rate θα είναι στρεβλό.

### T3 — Δεύτερο dark theme μέσα στο app _(UI συνέπεια)_
Το dashboard έχει δικό του σκούρο σύστημα (#0B1120 κ.λπ.) ενώ το υπόλοιπο
app είναι light — δύο οπτικές γλώσσες, διπλό CSS, μπερδεμένο mental model.
(Δεμένο με το UI audit εύρημα #8 — CSS κατακερματισμός.)

## 🐅 Paper Tigers
- «Auto-refresh = φόρτος» — λογικό interval + cache το καλύπτουν.

## 🐘 Elephants
1. Ποιος είναι ο χρήστης-στόχος; Αν είναι ο Θοδωρής, θέλει λίστες δράσης
   (τι λήγει, τι εκκρεμεί), όχι «Bloomberg». Αν είναι ο owner, τα κόστη
   συντήρησης θα ζουν στο COSTS στο Phase 2 — διπλό σπίτι για ίδια νούμερα.

## Δράσεις
| # | Σοβαρότητα | Δράση | Πότε |
|---|---|---|---|
| T1 | 🟡 | clearInterval στο route-change (έλεγχος) | ξεπάγωμα |
| T2 | 🟠 | mini-backfill Cost+km στα φετινά records | πριν Phase 2 |
| T3 | 🟡 | v3: μία οπτική γλώσσα | post-v2 |

**Verdict: 🟢→🟡 — read-only βιτρίνα· η αξία της κρίνεται από την
ποιότητα των service records, όχι από τον εαυτό της.**
