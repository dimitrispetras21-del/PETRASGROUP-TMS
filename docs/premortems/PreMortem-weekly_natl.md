# Deep Pre-Mortem — Weekly National

_2026-07-11 · modules/weekly_natl.js (1.207 γρ.) · Σενάριο: 6 μήνες μετά, τα
εθνικά round trips του PnL βγαίνουν λάθος και κανείς δεν ξέρει γιατί._

## Τι κάνει η σελίδα
ΚΑΘΟΔΟΣ (N→S) + ΑΝΟΔΟΣ (S→N) ανά ημέρα/εβδομάδα πάνω στο NAT_LOADS·
matching Ν→S↔S→N (drag & drop, πεδίο `Matched Load` και στις δύο πλευρές)·
ανάθεση truck/driver ή partner· split groupage. Στο v2 είναι **η single
source of truth για τα εθνικά round trips** (spec) — ό,τι σφάλμα εδώ,
σφάλμα στο εθνικό PnL και στο VS split (X=650/850).

## Το αφήγημα της αποτυχίας
Ένα unmatch που δεν γράφτηκε ποτέ (κανείς δεν το είδε), ένα match που
γράφτηκε μισό (μόνο η μία πλευρά), και τρία loads με λάθος Direction που
εξαφανίστηκαν από τα φίλτρα. Όταν το v2 άρχισε να γεννά round trips από
αυτά τα δεδομένα, τα εθνικά margins έβγαιναν αλλόκοτα· η εμπιστοσύνη στο
εθνικό PnL δεν χτίστηκε ποτέ.

## 🐯 Tigers

### T1 — Unmatch τυφλό σε conflicts & errors _(ενεργό bug)_
`_wnUnmatch` (γρ. 740-741): δύο `atSafePatch` χωρίς έλεγχο `res.conflict` ή
`res.error` — μόνο το exception path πιάνεται. Conflict → το UI λέει
«Σύνδεση αφαιρέθηκε», η βάση κρατά τη σύνδεση. Ίδιο μοτίβο και στο unassign
του matched S→N (γρ. 1074). _Fix: 4 γραμμές, ίδιο pattern με το match._

### T2 — Διπλής όψης link χωρίς ατομικότητα → μονόπλευρα matches _(Major)_
Το match γράφει `Matched Load` ΚΑΙ στις δύο εγγραφές σειριακά (γρ. 723-726).
Αν το r1 πετύχει και το r2 βρει conflict, η συνάρτηση κάνει return με **τη
μία πλευρά συνδεδεμένη και την άλλη όχι** — ασύμμετρος γράφος που κανένα
UI δεν εμφανίζει σωστά. Στο v2: το ζεύγος γίνεται ΕΝΑ round_trip record
(λύνεται δομικά)· μέχρι τότε αξίζει reconcile check (`A.matched=B ⟺
B.matched=A`).

### T3 — Optimistic UI πριν το save _(Major)_
`row.matchedId = snId; _wnPaint();` πριν τα patches (γρ. 719-721) — σε
αποτυχία ο dispatcher βλέπει ψεύτικη κατάσταση μέχρι το επόμενο render.

### T4 — Τρία value-sets στο Direction _(γνωστό M1, εδώ πονάει πιο πολύ)_
ORDERS: Export/Import · NAT_ORDERS: `North→South` (με χαρακτήρα βέλους) ·
CONS_LOADS: `ΑΝΟΔΟΣ/ΚΑΘΟΔΟΣ`. Ένα λάθος βέλος/κείμενο από import ή script
→ η εγγραφή χάνεται από τα φίλτρα χωρίς error. Στο v2: ενιαίο enum + CHECK
constraint στο Postgres.

### T5 — Εδώ θα ζήσει το VS split (X=650/850) _(PnL dependency)_
Τα NAT_LOADS Source=VS θα γεννούν το εθνικό round trip με revenue=X (spec
§10.2#6). Λάθος matching/direction εδώ = λάθος revenue σε ΔΥΟ trips
(διεθνές price−X + εθνικό X). Η ποιότητα αυτής της σελίδας είναι
προϋπόθεση του transfer pricing.

## 🐅 Paper Tigers
- «Το split είναι επικίνδυνο» — όχι πια: audit fix N-1 (γρ. 1108-1120) το
  έκανε awaited + allSettled με σωστό reporting. Καλό παράδειγμα pattern.
- «Πολλά δεδομένα ανά εβδομάδα» — ο όγκος εθνικών είναι διαχειρίσιμος.

## 🐘 Elephants
1. Το NAT_LOADS γράφεται ΚΑΙ από το iframe (national_consolidation.html,
   άλλο repo) — δύο υλοποιήσεις των ίδιων κανόνων, drift αναπόφευκτο χωρίς
   κοινό contract test.
2. «Κλείσιμο εβδομάδας» — όπως στο intl: δεν υπάρχει lock event πριν τα
   δεδομένα γίνουν πηγή round trips.

## Ταξινόμηση & δράσεις
| # | Σοβαρότητα | Δράση | Πότε |
|---|---|---|---|
| T1 | 🔴 Fix τώρα | conflict/error checks στο unmatch + unassign | ξεπάγωμα ή Valuedriven Stage 1 |
| T2 | 🟠 | reconcile έλεγχος συμμετρίας· δομική λύση στο v2 (round_trip) | Stage 2 |
| T3 | 🟠 | persist-then-paint | Stage 2 |
| T4 | 🟠 | ενιαίο Direction enum + DB constraint | Stage 2 schema |
| T5 | 🔴 | ρητό requirement στο Phase 2: VS split γεννιέται από εδώ | Phase 2 kickoff |

**Verdict: 🔴 — ίδια οικογένεια προβλημάτων με το Weekly Intl (T1 ενεργό),
συν τη μοναδική ευθύνη του εθνικού PnL και του VS split.**
