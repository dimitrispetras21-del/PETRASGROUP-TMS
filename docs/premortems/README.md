# Deep Pre-Mortems ανά σελίδα — Index

_2026-07-11 · Ένα βαθύ pre-mortem ανά σελίδα του TMS (ανάγνωση κώδικα με
line refs, Tigers/Paper Tigers/Elephants, verdict, δράσεις). Συμπληρώνουν
το συγκεντρωτικό `../PreMortem-PAGES-2026-07-11.md` και το
`../PreMortem-COSTS-2026-07-11.md`._

| Αρχείο | Σελίδα/ες | Verdict | #1 εύρημα |
|---|---|:---:|---|
| [weekly_intl](PreMortem-weekly_intl.md) | Weekly International | 🔴 | Unmatch/Clear τυφλά σε conflicts (ενεργό bug) |
| [weekly_natl](PreMortem-weekly_natl.md) | Weekly National | 🔴 | Μονόπλευρα matches (διπλό link χωρίς ατομικότητα) |
| [weekly_pickups](PreMortem-weekly_pickups.md) | National Pick Ups | 🔴 | Δημόσιο URL χωρίς auth + token (επιβεβαιωμένο 200) |
| [orders_intl](PreMortem-orders_intl.md) | International Orders | 🔴 | Trash επιστρέφει μισές παραγγελίες· Price χωρίς validation |
| [orders_natl](PreMortem-orders_natl.md) | National Orders | 🔴→🟡 | «Hard-delete bug» εν μέρει ήδη διορθωμένο — sync με Valuedriven |
| [invoicing](PreMortem-invoicing.md) | Invoicing | 🔴 | Client-side αρίθμηση → πιθανά διπλά τιμολόγια |
| [ceo_dashboard](PreMortem-ceo_dashboard.md) | CEO Dashboard | 🔴 | Owner-only μόνο στο UI (A4) |
| [trucks](PreMortem-trucks.md) | Trucks/Trailers master | 🔴 | Πινακίδες: ελληνικά ομόγλυφα/formats → αόρατα ορφανά κόστη |
| [dashboard](PreMortem-dashboard.md) | Dashboard | 🟡 | KPIs σε test data |
| [daily_ops](PreMortem-daily_ops.md) | Daily Ops Plan | 🟡 | Κατέχει το Actual Delivery Date — κρίσιμο για aging/PnL |
| [daily_ramp](PreMortem-daily_ramp.md) | Daily Ramp Board | 🟡 | Ράμπα↔πλάνο χωρίς reconcile· tablet UX |
| [maint_dash](PreMortem-maint_dash.md) | Maintenance Dashboard | 🟢→🟡 | Timer leak· πρόδρομος του €/km |
| [maint_req](PreMortem-maint_req.md) | Work Orders | 🟡 | Καμία γέφυρα προς service record (χαμένα κόστη) |
| [maint_expiry](PreMortem-maint_expiry.md) | Expiry Alerts | 🟡 | Pull-only ειδοποίηση — θέλει digest |
| [maint_svc](PreMortem-maint_svc.md) | Service Records | 🟡 | Ιστορικό προ-validation ελλιπές για €/km |
| [maint_history](PreMortem-maint_history.md) | Trucks/Trailers History | 🟢 | Σύνολα χωρίς σήμανση πληρότητας |
| [pallet_ledger](PreMortem-pallet_ledger.md) | Pallet Ledger | 🟡 | Διορθώσεις χωρίς παραστατικό/μόνιμο ίχνος |
| [pallet_upload](PreMortem-pallet_upload.md) | Pallet Upload | 🟡 | Κόπωση επιβεβαιωτή· μη ατομική διπλή εγγραφή |
| [performance](PreMortem-performance.md) | My Performance | 🟡→🔴 | Δείχνει margins σε μη-owner (συγκρούεται με §10.2 #11) |
| [metrics_audit](PreMortem-metrics_audit.md) | Metrics Audit | 🟢 | Αυτο-επαλήθευση, όχι ανεξάρτητη |
| [entities](PreMortem-entities.md) | Locations/Clients/Partners/Drivers/Workshops/Trailers | 🟡 | Reference data που επιβιώνει του v2 — καθάρισμα τώρα |
| [payroll](PreMortem-payroll.md) | Driver Payroll (placeholder) | 🟢/🔴 | Κλείδωμα «per-trip = πηγή» ΠΡΙΝ χτιστεί |
| [admin_pages](PreMortem-admin_pages.md) | Settings/Trash/Error Log | 🟡 | Trash υπόσχεται restore που δεν κάνει |

## Τα 5 μοτίβα που επαναλαμβάνονται (συστημικά)
1. **Τυφλά conflicts:** το `atSafePatch` επιστρέφει `{conflict:true}` και
   τα περισσότερα call sites δεν το κοιτάνε — μόνο weekly match/assign
   flows το χειρίζονται. Fix: ΕΝΑΣ κοινός helper.
2. **Soft γονιός, hard παιδιά** στα delete cascades → Trash που επιστρέφει
   μισά. Fix: v2 transactions.
3. **Fire-and-forget syncs** (`.catch(console.warn)`) → σιωπηλό drift.
   Fix: logError + reconcile sweeps.
4. **Test data (S3)** κάτω από κάθε KPI/ισοζύγιο. Fix: cleanup — προϋπόθεση
   κάθε εμπιστοσύνης.
5. **Client-side roles (A4)** κάτω από κάθε «owner-only». Fix: Stage-1
   JWT proxy + v2 RLS.
