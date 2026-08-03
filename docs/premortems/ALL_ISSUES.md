# MASTER ISSUES REGISTER — όλα τα ευρήματα από όλα τα pre-mortems

_2026-07-11 · Πηγές: PreMortem-COSTS + PreMortem-PAGES + 24 deep per-page
pre-mortems (docs/premortems/). Οργάνωση ανά **χρόνο δράσης**. ID = σελίδα-εύρημα
(π.χ. WI-T1 = weekly_intl Tiger 1) — λεπτομέρειες στο αντίστοιχο αρχείο._

**Σύνοψη: 78 issues** · 🔴 18 · 🟠 32 · 🟡 28 — εκ των οποίων **11 του COSTS
έχουν ήδη κλειδώσει** (§10.2) και φαίνονται στο τέλος.

---

## 1️⃣ ΑΜΕΣΑ — αποφάσεις & κανόνες λειτουργίας (μηδέν κώδικας, μηδέν κόστος)

| ID | Issue | Σοβ. |
|---|---|:---:|
| INV-T1α | **Κανόνας: τιμολογεί ΕΝΑΣ χρήστης τη φορά** (διπλοί αριθμοί τιμολογίων) | 🔴 |
| GLB-S3 | **Cleanup ~1.090 test records** — προϋπόθεση για ΚΑΘΕ KPI/ισοζύγιο (Dashboard, CEO, Performance, Pallet, Invoicing aging) | 🔴 |
| TRK-T1α | **Hygiene πέρασμα πινακίδων TRUCKS/TRAILERS** (κενά/παύλες/ελληνικά ομόγλυφα) + κανόνας γραφής | 🔴 |
| PAY-T1 | **Απόφαση ΠΡΙΝ χτιστεί το Payroll: per-trip pay = πηγή, το Payroll αθροίζει** (όχι δεύτερη καταχώρηση) | 🔴 |
| ENT-4 | Κανόνας: οχήματα/οδηγοί γίνονται **inactive, ποτέ delete** (ιστορικό) | 🟠 |
| ME-E1 | Renewal διαδικασία λήξεων (ποιος πληρώνει ΚΤΕΟ/ασφάλεια και κλείνει τον κύκλο) | 🟠 |
| ADM-4 | Trash retention απόφαση (πρόταση: 90 μέρες) | 🟡 |
| C-T3 | **Εβδομαδιαίο ritual Αλεξίας** για manual κόστη (πότε, από ποια παραστατικά, checklist) | 🔴 |
| C-E1 | Walkthrough του TRIP PnL mockup με την Αλεξία (1 ώρα) | 🟠 |
| C-E9 | Ack στα success criteria του PnL (≥90% Πλήρη σε 21 μέρες, unallocated <5%) | 🟡 |
| PERF-E1 | Οι μετρούμενοι να ξέρουν/αποδεχθούν τα KPIs τους | 🟡 |

## 2️⃣ ΞΕΠΑΓΩΜΑ — μικρά fixes στο τωρινό TMS (όταν επιτραπεί ή μέσω Valuedriven)

| ID | Issue | Σοβ. |
|---|---|:---:|
| WI-T1 | Conflict-check σε unmatch/clear στο Weekly Intl (ενεργό bug, ~4 γραμμές) | 🔴 |
| WN-T1 | Ίδιο για unmatch/unassign στο Weekly Natl | 🔴 |
| OI-T2α | **Price υποχρεωτικό** στη φόρμα διεθνών (1 γραμμή — το αυριανό revenue) | 🔴 |
| PERF-T1 | Αφαίρεση margin KPIs από μη-owner mappings στο My Performance | 🔴 |
| ME-T1 | Εβδομαδιαίο **expiry digest** εκτός app (email/Viber, <30 ημερών λήξεις + FRC) | 🔴 |
| TRK-T2 | Duplicate-plate check στο save οχημάτων | 🟠 |
| MS-T2 | Credits-low banner + σωστό μήνυμα 402 στα AI scans (κοινό A5) | 🟠 |
| PUP-T1 | Ρητό tap στα low-confidence πεδία του pallet confirm | 🟠 |
| MR-T1 | Work Order «Completed» → auto-πρόταση service record | 🟠 |
| MH-T1 | Σήμανση πληρότητας στα σύνολα ιστορικού («M records χωρίς κόστος») | 🟠 |
| ADM-1 | Ειλικρινές copy στο Trash restore (τα παιδιά δεν επανέρχονται) | 🟠 |
| MS-T3 | Odometer sanity warning (μονοτονία, άλματα >50k) | 🟡 |
| ENT-1 | Country dropdown (ISO) στα Locations | 🟡 |
| ENT-2 | Uniqueness checks (VAT πελάτη) | 🟡 |
| PU-T3 | Config URL + fallback μήνυμα στο iframe των Pick Ups | 🟡 |
| DR-T3 | Toast «X/Y γραμμές δημιουργήθηκαν» στο ramp batch | 🟡 |
| DB-T2 | Failure state ανά KPI κάρτα στο Dashboard | 🟡 |
| MD-T1 | clearInterval του maint-dash timer στο route-change | 🟡 |
| CEO-T4 | Απόκρυψη/ETA στο κενό «top loss routes» panel | 🟡 |

## 3️⃣ VALUEDRIVEN STAGE 1 (Stabilise) — να ζητηθούν ΡΗΤΑ στο kickoff

| ID | Issue | Σοβ. |
|---|---|:---:|
| GLB-S1 | API proxy + rotation των εκτεθειμένων tokens (στο proposal ✓) | 🔴 |
| PU-T1 | **Το proxy/auth να καλύψει ΚΑΙ τα petras-assign apps** — δημόσιο URL με token, επιβεβαιωμένο 200 χωρίς login. ΔΕΝ το λέει το proposal | 🔴 |
| GLB-A4 | Server-side roles (JWT) — προϋπόθεση του «PnL owner-only» (CEO-T1, MA-T1) | 🔴 |
| ON-T1 | **Sync call πριν το Stage 1**: μέρος του natl hard-delete bug ήδη διορθωμένο (FIXME audit fixes) — να μη γίνει διπλή/λάθος δουλειά | 🔴 |
| GLB-S2 | Automated backups (στο proposal ✓ — επιβεβαίωση ότι καλύπτει και reference Airtable) | 🔴 |
| ALL-CONFLICT | **Ένας κοινός conflict-aware helper** αντί για ad-hoc checks — λύνει μαζικά: OI-T3, ON-T3/T5, INV-T2, DO-T1, DR-T1, ME-T2, MR-T2, PL-T3 (write-pattern unification, στο proposal ✓) | 🟠 |
| ALL-SYNC | Fire-and-forget syncs → logError + reconcile sweep (WI-T4, DO-T3, orphans OI-T4) | 🟠 |
| ADM-2 | Ενεργοποίηση Sentry (ήδη wired — στο proposal ✓) | 🟠 |
| INV-T3 | Delivered-at υποχρεωτικό όταν Status=Delivered (DO-T2 πηγή) | 🟠 |
| ENT-5 | Προστασία «ιερών» records (Veroia Cross-Dock recJucKOhC1zh4IP3) | 🟠 |
| MA-T1 | Περιορισμός πρόσβασης Metrics Audit (revenue figures) | 🟠 |
| ENT-drivers | GDPR βασικά για στοιχεία οδηγών (λύνεται με το auth) | 🟡 |

## 4️⃣ VALUEDRIVEN STAGE 2 (DB migration) — schema & migration requirements

| ID | Issue | Σοβ. |
|---|---|:---:|
| WI-T5 | **Validation του `Matched Import ID` πριν το cutover** — από αυτό χτίζονται τα ιστορικά ζεύγη/round trips | 🔴 |
| PU-T2 | **Απόφαση migration-blocker: το consolidation iframe γράφει Airtable ενώ το TMS θα διαβάζει Postgres** — μέσα στο TMS στο v2 ή κοινό API | 🔴 |
| ON-T4 | `source` field (VS/Independent/Direct) στα NAT_ORDERS με edit rules — καθορίζει ποιο εθνικό trip παίρνει revenue X | 🔴 |
| OI-T1 | Transactional soft-delete ΟΛΗΣ της αλυσίδας (Trash που επιστρέφει ολόκληρα) — επίσης ON-T2 | 🔴 |
| WN-T4 | Ενιαίο Direction enum + CHECK constraint (τέλος στα 3 value-sets) | 🟠 |
| INV-T1β | Invoice numbering = Postgres sequence | 🔴 |
| ENT-3 | `Adress`→`Address` rename στο schema (μία και καλή) | 🟠 |
| WI-T2/WN-T2 | Ομαδικά saves ατομικά (transactions)· συμμετρία matches | 🟠 |
| WI-T3/WN-T3 | Persist-then-paint pattern στο νέο frontend layer | 🟠 |
| OI-E2 | Οι business κανόνες των cascades (GL exception κ.λπ.) γραμμένοι στο migration spec ως FK/triggers | 🟠 |
| TRK-E1 | Reference-cache στο API layer (allocation engine → Airtable lookups) | 🟠 |
| CEO-E1 | **Πεδίο-πεδίο λίστα του τι είναι «owner-only»** για το RLS spec (και INV-E1) | 🟠 |
| PL-T1 | Reason+attachment στις διορθώσεις παλετών + audit table | 🟠 |
| PUP-T2 | Idempotency key στο pallet upload (διπλή εγγραφή σε retry) | 🟠 |
| INV-T4 | Ενοποίηση διπλού «Invoiced» σήματος (Status vs checkbox) | 🟡 |
| MS-T4/PUP-E1 | Attachments παραστατικών στα records (maintenance + pallet sheets) | 🟡 |
| OI-T5 | `source: scan|manual` flag στο audit log | 🟡 |
| DR-T2 | Reconcile ράμπας↔πλάνου (badge διαφορών) | 🟠 |
| CEO-T3 | Audit ιστορικό στους στόχους του CEO dashboard | 🟡 |
| PU-T4 | Version handshake TMS↔iframe (αν επιβιώσει το iframe) | 🟡 |
| MA-E1 | Metrics audit v2: σύγκριση frontend engine vs SQL (ανεξάρτητος έλεγχος) | 🟡 |

## 5️⃣ PHASE 2 (COSTS build) — απαιτήσεις που γεννήθηκαν από τα pre-mortems

| ID | Issue | Σοβ. |
|---|---|:---:|
| C-T4 | **Ορισμός κανόνα «Πλήρες» (cost-complete):** invoice coverage periods ανά πηγή + manual checklist ⇒ badge | 🔴 |
| C-T9 | Idempotent invoice import + αρνητικές γραμμές/πιστωτικά στο allocation | 🔴 |
| WN-T5 | Ρητό requirement: το VS split (X=650/850) γεννιέται από το Weekly National | 🔴 |
| OI-T2β | Gate: round trip δεν κλείνει με κενό Price σε linked order | 🔴 |
| WI-T6 | Partner rate υποχρεωτικό όταν trip_type=PARTNER | 🟠 |
| TRK-E2 | Trailer→tractor mapping στο plate matching του allocation | 🟠 |
| C-E2/WI-E2 | Groupage «merge orders → one leg» UI στους planners | 🟠 |
| WI-E1/WN-E2 | Event «κλείσιμο εβδομάδας/trip» πριν τροφοδοτηθεί το PnL (+ DO-E1: ποιος κλείνει τι — ramp/ops/GPS) | 🟠 |
| C-E7 | Repositioning trips χωρίς orders (πρόταση: trip με 0 legs, €0 revenue) | 🟠 |
| C-E5 | Entity διάσταση (VERMION/EUROFRESH) και στο revenue, όχι μόνο στα κόστη | 🟠 |
| C-E8 | Double-manning/relay: δύο οδηγοί σε ένα trip (driver_pay split) | 🟡 |
| C-E10 | Κανόνας αναθεώρησης X (ετήσιο review, effective date, όχι αναδρομικά) | 🟡 |
| INV-T5 | Reconciliation view: Price vs τιμολογημένο vs εισπραχθέν (δουλειά Ειρήνης) | 🟠 |
| MS-T1/MD-T2 | Mini-backfill Cost+km στα φετινά service records (τροφοδοτεί το €/km item 10) | 🟠 |
| MH-E1 | €/km ανά όχημα ορατό στα vehicle histories | 🟡 |
| DR-E1 | Ώρες ράμπας ως πηγή actual dates εθνικών σκελών | 🟡 |
| ON-E1 | Independent (pure-domestic) orders: μπαίνουν σε round trips ή μένουν εκτός PnL; | 🟠 |
| ENT-partners | Rate card ανά partner/lane (βάση σύγκρισης για Ειρήνη) | 🟡 |
| MR-T3 | Ροή 30" για βλάβες + μελλοντικό WhatsApp intake | 🟡 |
| PL-E1 | Μηνιαίο pallet statement PDF ανά πελάτη | 🟡 |
| PAY-T2/T3 | Payroll = επισκόπηση (όχι μισθοδοσία)· ορατότητα owner+accountant | 🟠 |
| ADM-3 | Settings v2: owner-only edit + audit + effective-date στα χρηματικά (X, €/km) | 🟠 |
| C-E3 | Glossary + handoff session στην construction team | 🟠 |

## 6️⃣ v3 UI (post-v2) — από το UI/UX audit + PMs

| ID | Issue | Σοβ. |
|---|---|:---:|
| UI-1 | Contrast fix (--text-dim 2.5:1 → 4.8:1) + focus rings + buttons αντί για div onclick | 🔴 |
| UI-2 | Token discipline (102 hex → <30)· z-index κλίμακα· font scale | 🟠 |
| UI-3 | components.css — μία υλοποίηση των 8 κοινών components | 🟠 |
| DR-T4 | Tablet πέρασμα για Ramp Board (γάντια, touch targets) | 🟠 |
| MD-T3 | Ένα visual theme (τέλος το δεύτερο dark σύστημα του maint dash) | 🟡 |
| DB-E1 | Per-role πρώτη ζώνη στο Dashboard | 🟡 |
| UI-4 | Skeletons παντού, διδακτικά empty states, καθολικό reduced-motion | 🟡 |

---

## ✅ Κλειδωμένα από το COSTS pre-mortem (2026-07-11, SPEC §10.2 — για το αρχείο)

| ID | Ήταν | Λύση |
|---|---|---|
| C-T1 | Round-trip lifecycle χωρίς state machine | Auto-create στο πλήρες round trip + auto-sync σε αλλαγές (#2) |
| C-T2 | Planned vs actual dates | MyGeotab geofence έδρας + interim manual close (#3) |
| C-T5 | Ποιο ποσό (ΦΠΑ) | Net convention· τιμολόγια με ΦΠΑ ολόκληρα ως έξοδο, worst case (#5) |
| C-T6 | Migration sequencing | Valuedriven v2 πρώτα· Costs = Phase 2+ (#1) |
| C-T8 | RLS enforcement | Ρητό requirement + owner-only results (#11) |
| C-E6 | Partner rate ή invoice | Agreed price· ταυτοποίηση από Ειρήνη (#7) |
| C-E11 | Ιστορικό | Καθαρή αφετηρία, no backfill (#8) |
| — | X τιμές | Import €650 / Export €850 (#6) |
| — | Μενού COSTS v1 | TRIP PnL · Καταχώρηση · Partner PnL · Κατανάλωση (#9) |
| — | Συντήρηση 5η σελίδα; | Όχι — maintenance bridge, calibrated €/km (#10) |
| — | Cost-entry owner | Αλεξία, DKV upload+OCR / manual (#4) |

_Ό,τι ανοίγει/κλείνει από εδώ και πέρα: ενημερώνεται ΑΥΤΟ το αρχείο +
το TRIP_COSTS_DECISION_LOG.md._
