# Deep Pre-Mortem — Daily Ops Plan

_2026-07-11 · modules/daily_ops.js (590 γρ.) · Σενάριο: 6 μήνες μετά, οι
ημερομηνίες παράδοσης — το καύσιμο του invoicing aging και των KPIs —
είναι ελλιπείς ή λάθος._

## Τι κάνει η σελίδα
Το πλάνο της ημέρας: inline επεξεργασία πεδίων στα ORDERS, αλλαγή Status,
και το κρίσιμο **"Delivered" flow** (γρ. 518, 571): γράφει
`Status='Delivered' + Delivery Performance + Actual Delivery Date` και
πυροδοτεί sync κατάντη. Print όψη.

## 🐯 Tigers

### T1 — atSafePatch παντού, conflict handling ΠΟΥΘΕΝΑ _(Major)_
8 σημεία εγγραφής με `atSafePatch`, **0 εμφανίσεις "conflict"** στο module.
Σε conflict το `{conflict:true}` επιστρέφεται και αγνοείται → η inline
αλλαγή «φαίνεται» ότι γράφτηκε, δεν γράφτηκε, κανείς δεν το μαθαίνει. Το
inline-edit UI (πολλά μικρά πεδία) είναι ο ΠΙΟ πιθανός τόπος ταυτόχρονης
δουλειάς dispatcher↔dispatcher. _Fix: κοινό helper `safePatchOrWarn()` —
μία υλοποίηση, παντού (αφορά και daily_ramp)._

### T2 — Το Actual Delivery Date γεννιέται εδώ — ή πουθενά _(Upstream truth)_
Το invoicing aging (πότε «γερνάει» ένα τιμολόγιο) και τα on-time KPIs
πατάνε στο `Actual Delivery Date` που γράφεται ΜΟΝΟ από αυτό το flow.
Παράδοση που κλείνει τηλεφωνικά/εκτός σελίδας = order Delivered χωρίς
ημερομηνία (ή με λάθος αυτόματη). Στο v2 (spec T2/COSTS): οι actual dates
γίνονται και allocation keys — αυτό το flow αναβαθμίζεται σε κρίσιμη
τελετουργία, όχι «βοηθητική σελίδα».

### T3 — Ο sync κατάντη ξανά fire-and-forget _(κοινό με weekly)_
`syncOrderDownstream(...)` χωρίς await/handling (γρ. 574) — αποτυχία
propagation σε NAT_LOADS/GL/RAMP αόρατη.

## 🐅 Paper Tigers
- «Το print flow είναι Chrome-only» — γνωστό (M4), οι χρήστες είναι σε
  Chrome· αποδεκτό μέχρι το v2.

## 🐘 Elephants
1. Στο v2 το «Delivered» εδώ πρέπει να γίνει ΤΟ event που τροφοδοτεί το
   round-trip closure (μαζί με το MyGeotab geofence αργότερα). Να δηλωθεί
   ρητά στο Phase-2 spec ποιος «κλείνει» τι: ramp; daily ops; GPS;

## Δράσεις
| # | Σοβαρότητα | Δράση | Πότε |
|---|---|---|---|
| T1 | 🟠 | κοινός conflict-aware helper | Stage 1 |
| T2 | 🔴 | delivered-date υποχρεωτικό στο Delivered + διαδικασία | Stage 1 / Phase 2 |
| T3 | 🟡 | logError στο sync | Stage 1 |

**Verdict: 🟡 — μικρό module, αλλά κατέχει το πιο πολύτιμο γεγονός του
συστήματος (πότε παραδόθηκε πραγματικά)· αυτό του δίνει βαρύτητα Phase-2.**
