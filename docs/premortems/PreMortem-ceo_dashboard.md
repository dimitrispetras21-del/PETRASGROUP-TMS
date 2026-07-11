# Deep Pre-Mortem — CEO Dashboard

_2026-07-11 · modules/ceo_dashboard.js (1.030 γρ.) · Σενάριο: 6 μήνες μετά,
ο owner παίρνει στρατηγικές αποφάσεις από νούμερα που δεν σημαίνουν αυτό
που νομίζει — ή τα βλέπει και κάποιος άλλος._

## Τι κάνει η σελίδα
Στρατηγικά KPIs owner: revenue vs στόχο (επεξεργάσιμοι στόχοι ✎), deltas
vs προηγούμενη περίοδο, utilisation, placeholder «top loss-making routes»
(περιμένει το TRIP PnL). Έχει ρητό access check: `can('ceo_dashboard') !==
'full'` → Access Denied (γρ. 18-19).

## 🐯 Tigers

### T1 — Το «owner-only» είναι σκηνικό, όχι κλειδαριά _(Critical, κληρονομικό A4)_
Ο έλεγχος γρ. 18 τρέχει στον browser· ο ρόλος ζει σε unsigned localStorage.
Χειρισμός localStorage → πλήρης θέα στα στρατηγικά νούμερα. Με το §10.2
#11 (PnL owner-only) αυτή η σελίδα γίνεται το πιο ευαίσθητο σημείο του
app. _Fix: Worker JWT (Stage 1) ώστε τα data calls να απορρίπτονται
server-side για μη-owner· RLS στο v2._

### T2 — KPIs πάνω σε μολυσμένη βάση _(Major)_
`_calcRevenue(data.allOrders)` (γρ. 220) μετρά ΚΑΙ τα ~1.090 test records
(S3). Revenue vs στόχο με ψεύτικο revenue = ψεύτικη πρόοδος. Το cleanup
είναι προϋπόθεση για να έχει νόημα η σελίδα.

### T3 — Στόχοι χωρίς ιστορικό/ιδιοκτησία _(Minor)_
Οι στόχοι μπαίνουν με ✎ χωρίς καταγραφή ποιος/πότε/γιατί άλλαξε — ένα
«πειραγμένο» target αλλάζει το αφήγημα του dashboard αθόρυβα.

### T4 — Placeholder που υπόσχεται _(Product debt)_
Το «top loss-making routes» υπάρχει ως κενό panel εδώ και μήνες. Κενές
υποσχέσεις σε dashboard διαβρώνουν την εμπιστοσύνη· είτε κρύψε το μέχρι
το Phase 2, είτε βάλε ETA copy.

## 🐅 Paper Tigers
- «Θέλει real-time δεδομένα» — στρατηγική όψη· το cache/refresh αρκεί.

## 🐘 Elephants
1. Ποια νούμερα ΑΚΡΙΒΩΣ είναι «τελικά αποτελέσματα» (owner-only) και ποια
   επιτρέπονται σε management; Η γραμμή πρέπει να γραφτεί πεδίο-πεδίο στο
   v2 RLS spec — αλλιώς θα κριθεί ad hoc από τον εκάστοτε developer.

## Δράσεις
| # | Σοβαρότητα | Δράση | Πότε |
|---|---|---|---|
| T1 | 🔴 | server-side gate στα CEO data endpoints | Stage 1 |
| T2 | 🔴 | S3 cleanup πριν εμπιστευτούν τα KPIs | άμεσα |
| T3 | 🟡 | audit εγγραφή στους στόχους | Stage 2 |
| T4 | 🟡 | απόκρυψη/ETA στο loss panel | ξεπάγωμα |

**Verdict: 🔴 — όχι για τον κώδικά της (καθαρή, read-only), αλλά επειδή
είναι το σημείο όπου το client-side security συναντά τα πιο ευαίσθητα
νούμερα της εταιρείας.**
