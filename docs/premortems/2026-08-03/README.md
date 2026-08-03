# Pre-Mortems v2 — ένα αρχείο ανά σελίδα (μετά το C2 cutover)

_2026-08-03 · Δεύτερος πλήρης γύρος per-page pre-mortem. Ο πρώτος
([../](../) , 11/7) γράφτηκε **πριν** το cutover· αυτός μετρά τι άλλαξε, τι
διορθώθηκε και τι χειροτέρεψε, με έμφαση στη **λογική** και στις
**διασυνδέσεις**. Κάθε αρχείο: ρόλος · τι άλλαξε · σενάριο αποτυχίας ·
Tigers με file:line · διασυνδέσεις μέσα/έξω · κατάσταση ευρημάτων 11/7 ·
verdict._

| Σελίδα | Verdict | Το κρίσιμο σημείο |
|---|:---:|---|
| [National Pick Ups](weekly_pickups.md) | 🔴🚨 | **Ενεργό περιστατικό**: γράφει σε νεκρή βάση από 28/7 |
| [Weekly International](weekly_intl.md) | 🔴 | Unmatch/Clear αγνοούν conflicts· sync με 4 skips |
| [Weekly National](weekly_natl.md) | 🔴 | Μονόπλευρα matches· εδώ θα ζήσει το VS split |
| [International Orders](orders_intl.md) | 🔴 | Ρίζα 8 πινάκων· Price χωρίς validation |
| [Daily Ops Plan](daily_ops.md) | 🔴 | Μόνος συγγραφέας του Actual Delivery Date |
| [Invoicing](invoicing.md) | 🔴 | Client-side αρίθμηση τιμολογίων |
| [CEO Dashboard](ceo_dashboard.md) | 🔴 | Owner-only μόνο στον browser· on-time% κολακεύει |
| [My Performance](performance.md) | 🔴 | Δείχνει margins σε μη-owner |
| [Trucks](trucks.md) | 🔴 | Πινακίδες = JOIN key των χρημάτων, χωρίς normalize |
| [Expiry Alerts](maint_expiry.md) | 🔴 | Pull-only· 37 ληγμένα ήδη σήμερα |
| [Trash](trash.md) | 🔴 | Υπόσχεται restore που δεν κάνει |
| [Error Log](error_log.md) | 🔴 | Sentry σβηστό· σφάλματα σε σημειωματάριο |
| [National Orders](orders_natl.md) | 🟠 | `source` field για VS vs χειροκίνητα |
| [Daily Ramp Board](daily_ramp.md) | 🟠 | Χωρίς reconcile με το πλάνο· tablet UX |
| [Pallet Upload](pallet_upload.md) | 🟠 | Διπλή εγγραφή χωρίς ατομικότητα |
| [Pallet Ledger](pallet_ledger.md) | 🟠 | Υπόλοιπα χωρίς αποδεικτικά |
| [Locations](locations.md) | 🟠 | Το Veroia Cross-Dock διαγράφεται ελεύθερα |
| [Clients](clients.md) | 🟠 | Χωρίς μοναδικότητα → σπασμένο PnL ανά πελάτη |
| [Partners](partners.md) | 🟠 | Χωρίς rate card → η ταυτοποίηση Ειρήνης δεν έχει βάση |
| [Trailers](trailers.md) | 🟠 | Πινακίδες + FRC ως εμπορικό ρίσκο |
| [Metrics Audit](metrics_audit.md) | 🟠 | Το management βλέπει έσοδα |
| [Dashboard](dashboard.md) | 🟡 | Όλα μηδέν στις 3/8 — Αύγουστος ή κενό δεδομένων; |
| [Service Records](maint_svc.md) | 🟡 | Ιστορικό προ-validation· OCR χωρίς credits banner |
| [Work Orders](maint_req.md) | 🟡 | Καμία γέφυρα προς service record |
| [Maintenance Dashboard](maint_dash.md) | 🟡 | Timer· πρόδρομος του €/km |
| [Drivers](drivers.md) | 🟡 | Ήσυχη σήμερα, ευαίσθητη αύριο |
| [Audit Trail](audit_trail.md) | ✅🟡 | **Η καλύτερη προσθήκη του v2** — αλλά τυφλή στο iframe |
| [Trucks/Trailers History](maint_history.md) | 🟢 | Σύνολα χωρίς σήμανση πληρότητας |
| [Workshops](workshops.md) | 🟢 | Η πιο υγιής entity σελίδα |

_Κρυμμένες από 3/8 (unbuilt): Driver Payroll · Costs · Settings — βλ.
[design/ux batch 1](../../design/UI_UX_AUDIT_2026-08-03.md)._

## Τι δείχνει ο γύρος συνολικά
- **12 σελίδες κόκκινες** (από 7 στις 11/7) — όχι επειδή χάλασε ο κώδικας,
  αλλά επειδή το cutover ανέβασε το διακύβευμα και τα γνωστά ευρήματα έμειναν
  ανοιχτά.
- **Διορθώθηκαν:** GL never-delete, γλώσσα+validation στο Service Records,
  γλώσσα στο Weekly International, /app-errors, και **προστέθηκε το Audit Trail**.
- **Το μοτίβο:** σχεδόν κάθε 🔴 είναι είτε *conflict που αγνοείται*, είτε
  *πεδίο χωρίς επιβολή*, είτε *ασφάλεια που ζει στον browser*.

_Συνοδευτικά: [ALL_ISSUES.md](../ALL_ISSUES.md) (τι είναι σπασμένο) ·
[INTEGRATION-2026-08-03.md](../INTEGRATION-2026-08-03.md) (γιατί σπάει μαζί) ·
[AUDIT-2026-08-03.md](../../AUDIT-2026-08-03.md) (πόσο γερό είναι το θεμέλιο)._
