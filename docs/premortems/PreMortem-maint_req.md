# Deep Pre-Mortem — Work Orders (Maintenance Requests)

_2026-07-11 · modules/maintenance.js (γρ. 1721-2071) · Σενάριο: 6 μήνες
μετά, βλάβες δηλώνονται στο Viber και τα Work Orders είναι κενά._

## Τι κάνει η σελίδα
CRUD αιτημάτων συντήρησης (MAINT_REQ): δημιουργία (γρ. 1954, 2060),
status flips (1962), edit (2056), soft delete (2071). Ροή: βλάβη →
αίτημα → εργασία → (ιδανικά) service record με κόστος.

## 🐯 Tigers

### T1 — Καμία γέφυρα Work Order → Service Record _(Process gap)_
Το κλείσιμο ενός Work Order δεν δημιουργεί/απαιτεί service record. Η
εργασία έγινε, το κόστος δεν γράφτηκε πουθενά → το ιστορικό €/km (SPEC
item 10) χάνει ακριβώς τις εγγραφές των βλαβών — τις πιο ακριβές.
_Fix: στο "Completed" του Work Order, πρόταση auto-δημιουργίας service
record προσυμπληρωμένου (όχημα/περιγραφή/workshop)._

### T2 — Ίδιο τυφλό atSafePatch _(κοινό pattern)_
Status flips χωρίς conflict handling (0 στο module). Δύο άτομα πάνω στο
ίδιο αίτημα → χαμένη αλλαγή χωρίς σήμα.

### T3 — Υιοθέτηση: ο ανταγωνιστής είναι το τηλέφωνο _(Product)_
Ο οδηγός στον δρόμο δεν ανοίγει TMS — παίρνει τηλέφωνο. Αν ο Θοδωρής δεν
καταχωρεί ΕΚΕΙΝΟΣ το αίτημα με τηλεφωνική ροή 30 δευτερολέπτων, η σελίδα
μένει κενή. (Μελλοντικά: το WhatsApp/Telegram Phase-2+ του Valuedriven
roadmap είναι η φυσική είσοδος εδώ.)

## 🐅 Paper Tigers
- «Χρειάζεται προτεραιότητες/SLA» — με 10-15 οχήματα, ένα απλό status
  αρκεί· μην το κάνουμε Jira.

## 🐘 Elephants
1. Συνεργείο-εκτός-έδρας (βλάβη Γερμανία): ποιος ανοίγει Work Order και
   ποιος πληρώνει; Δένει με το ferry/standalone invoice flow του COSTS.

## Δράσεις
| # | Σοβαρότητα | Δράση | Πότε |
|---|---|---|---|
| T1 | 🟠 | Completed → auto-πρόταση service record | ξεπάγωμα/v2 |
| T2 | 🟡 | κοινός conflict helper | Stage 1 |
| T3 | 🟠 | ροή 30" για Θοδωρή + μελλοντικό chat intake | Phase 2 |

**Verdict: 🟡 — τεχνικά απλό και υγιές· ο κίνδυνος είναι διαδικαστικός
(κενό δεδομένων) και η χαμένη γέφυρα προς τα κόστη.**
