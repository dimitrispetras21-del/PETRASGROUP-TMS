# Deep Pre-Mortem — Entity pages (Locations · Clients · Partners · Drivers · Workshops · Trailers)

_2026-07-11 · core/entity.js (config-driven CRUD) + modules/locations.js ·
Ένα κοινό engine, έξι σελίδες. Το Trucks έχει δικό του αρχείο
(PreMortem-trucks.md) λόγω PnL βαρύτητας. Σενάριο: 6 μήνες μετά, «σκουπίδια
μπήκαν, σκουπίδια βγήκαν» σε κάθε σελίδα που κάνει lookup._

## Κοινά χαρακτηριστικά (engine)
Plain atPatch/atCreate (0 conflict handling — αποδεκτό: λίγες, σπάνιες
εγγραφές), Active toggles, config validation (`req: true` σε βασικά),
το θρυλικό **`Adress`** (ένα d) τεκμηριωμένο στον κώδικα (γρ. 293 σχόλιο).
Στο v2 ΟΛΕΣ μένουν Airtable (reference split) — **επιβιώνουν της
μετάβασης ως έχουν**, άρα αξίζουν φροντίδα, όχι παραμέληση.

## Ανά σελίδα

### Locations — 🟡
- 🐯 Οι διευθύνσεις/πόλεις τροφοδοτούν τα lane labels (GR→DE) των planners
  και αύριο του PnL per-lane. Ελεύθερο κείμενο χώρας/πόλης → «Γερμανία»,
  «Germany», «DE» = τρία lanes. _Fix: country dropdown (ISO), όχι κείμενο._
- 🐘 Το Veroia Cross-Dock (recJucKOhC1zh4IP3) είναι hardcoded ιερό record —
  διαγραφή/επεξεργασία του σπάει το VS flow. Θέλει προστασία (lock badge).

### Clients — 🟡
- 🐯 Χωρίς VAT/uniqueness check: διπλός πελάτης = μοιρασμένο ιστορικό,
  λάθος per-customer PnL lens αύριο (NOTES §8 — το #1 ρίσκο πελατών).
- 🐘 Credit terms/όρια δεν υπάρχουν ως πεδία — το invoicing aging δεν έχει
  «πόσο πίστωση δίνουμε σε αυτόν;» πλαίσιο.

### Partners — 🟡
- 🐯 Το `Adress` typo ζει εδώ: κάθε νέος dev/agent/script που γράφει
  "Address" σπάει σιωπηλά. Πρέπει να διορθωθεί ΣΤΟ SCHEMA στο v2 migration
  (μία και καλή) — όχι άλλα workarounds.
- 🐯 Τα partner rates ΔΕΝ ζουν εδώ (μπαίνουν ανά order στο Weekly) — άρα
  δεν υπάρχει «τιμοκατάλογος partner» για σύγκριση agreed vs invoice
  (δουλειά Ειρήνης). Elephant για Phase 2: rate card ανά partner/lane;

### Drivers — 🟡
- 🐯 Στο Phase 2 αποκτούν οικονομική διάσταση (driver pay per trip, ΚΕΚ
  expiry ήδη στο maintenance). Ανενεργός οδηγός πρέπει να γίνεται
  inactive, ΠΟΤΕ delete (ιστορικό trips/pay).
- 🐘 GDPR ελάχιστα: τηλέφωνα/έγγραφα οδηγών σε δημόσια-URL apps (βλ.
  pickups T1) — τακτοποιείται με το Stage-1 auth.

### Workshops — 🟢
- Active flag + specialty — υγιής. Μόνο σημείωση: το maintenance OCR
  κάνει fuzzy match στο όνομα → κρατήστε ονόματα καθαρά/μοναδικά.

### Trailers — 🟡
- Ό,τι ισχύει για Trucks T1/T2 (πινακίδες, ομόγλυφα, duplicates) ισχύει
  κι εδώ — συν το FRC (βλ. maint_expiry T3) και το trailer→tractor
  mapping του allocation (Trucks E2).

## Δράσεις (κοινές)
| # | Δράση | Πότε |
|---|---|---|
| 1 | Country dropdown στα Locations | ξεπάγωμα |
| 2 | Uniqueness checks (VAT πελάτη, πινακίδες) | ξεπάγωμα |
| 3 | `Adress`→`Address` rename ΣΤΟ v2 schema | Stage 2 migration |
| 4 | Κανόνας «inactive, όχι delete» σε οχήματα/οδηγούς | άμεσα (process) |
| 5 | Προστασία ιερών records (Veroia Cross-Dock) | Stage 1 |

**Verdict: 🟡 συνολικά — βαρετές σελίδες, κρίσιμα δεδομένα. Επειδή
επιβιώνουν της μετάβασης ως Airtable reference, ό,τι καθαριστεί εδώ
πληρώνει τόκους σε ΟΛΟ το v2.**
