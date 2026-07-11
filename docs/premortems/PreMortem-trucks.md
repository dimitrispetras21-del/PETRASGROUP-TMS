# Deep Pre-Mortem — Trucks (& Trailers) master data

_2026-07-11 · core/entity.js (configs γρ. 147-255) · Σενάριο: 6 μήνες μετά,
το allocation engine του PnL πετά το 15% των DKV γραμμών στο unallocated
bucket — και η αιτία είναι αυτή η «βαρετή» σελίδα._

## Τι κάνει η σελίδα
Config-driven CRUD στόλου: License Plate (**req: true** — σωστά), Brand/
Model/Year/Euro Standard, Insurance/KTEO/KEK expiries, Active toggle
(γρ. 1063). Στο v2 **μένει στο Airtable ως reference table** (Valuedriven
split) και γίνεται **το κλειδί του allocation engine** (πινακίδα+ημ/νία).

## 🐯 Tigers

### T1 — Πινακίδα χωρίς κανονικοποίηση = αόρατα ορφανά κόστη _(PnL launch-blocking)_
Το πεδίο είναι υποχρεωτικό αλλά **ελεύθερο κείμενο**: «IAZ 8302», «IAZ-8302»
και «ΙΑΖ8302» (ελληνικά Ι/Α/Ζ — ομόγλυφα!) είναι τρεις διαφορετικές τιμές.
Το DKV/DADI matching (spec §11.5) θα αποτυγχάνει σιωπηλά σε κάθε
απόκλιση. Τα ελληνικά κεφαλαία ομόγλυφα (ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ) είναι ο ύπουλος
εχθρός — δεν φαίνονται με το μάτι. _Fix: normalize on save (κεφαλαία,
χωρίς κενά/παύλες, λατινικοί χαρακτήρες) + one-off hygiene πέρασμα στα
υπάρχοντα + το alias table του spec._

### T2 — Διπλοεγγραφές οχημάτων _(Data)_
Καμία μοναδικότητα στην πινακίδα — δεύτερη εγγραφή ίδιου φορτηγού μοιράζει
το ιστορικό (maintenance, κόστη) σε δύο μισά. _Fix: duplicate check στο
save (ίδια normalized πινακίδα → μπλόκο)._

### T3 — Plain atPatch/atCreate, 0 conflict _(κοινό, χαμηλό εδώ)_
Λίγες εγγραφές, σπάνιες αλλαγές — αποδεκτό μέχρι το v2.

## 🐅 Paper Tigers
- «Το Active toggle είναι επικίνδυνο» — αντίθετα: είναι η σωστή λύση
  απόσυρσης οχήματος (όχι delete) — να γίνει ρητός κανόνας.

## 🐘 Elephants
1. **Reference στο Airtable + operational στο Postgres** σημαίνει ότι το
   allocation engine θα κάνει cross-DB lookups στην πιο hot διαδρομή του.
   Caching στο API layer = ρητό requirement για τη Valuedriven.
2. Τρέιλερ πινακίδες (P61335 στο Trivium παράδειγμα): τα τιμολόγια
   αναφέρουν πότε τράκτορα, πότε τρέιλερ — το alias/matching πρέπει να
   ξέρει ΚΑΙ τα δύο και να καταλήγει στον τράκτορα του trip.

## Δράσεις
| # | Σοβαρότητα | Δράση | Πότε |
|---|---|---|---|
| T1 | 🔴 | normalize-on-save + hygiene πέρασμα + aliases | πριν Phase 2 (το πέρασμα: τώρα) |
| T2 | 🟠 | duplicate check στο save | ξεπάγωμα |
| E1 | 🟠 | reference-cache requirement στη Valuedriven | Stage 2 kickoff |
| E2 | 🟠 | trailer→tractor mapping στο allocation spec | Phase 2 |

**Verdict: 🔴 — η πιο υποτιμημένη σελίδα του app: master data που αύριο
γίνεται το JOIN key των χρημάτων. Ό,τι καθαρίσει τώρα, δεν θα πονέσει μετά.**
