---
name: tms-knowledge
description: Γνώση του PETRASGROUP TMS για έναν agent μόνο-ανάγνωσης — τι κάνει κάθε σελίδα, πώς δένουν τα δεδομένα, ποιοι κανόνες είναι κλειδωμένοι και τι ΔΕΝ ξέρουμε. Ανεξάρτητο μοντέλου. Ημερομηνία επαλήθευσης ανά κανόνα.
version: 2026-09-22
---

# Γνώση PETRASGROUP TMS (skill 4.1)

**Ποιος το διαβάζει:** ένας agent (Grok, Claude, Hermes ή άνθρωπος) που θα κρίνει αν κάτι στο TMS είναι λάθος. **Δεν είναι εγχειρίδιο χρήστη.** Κάθε κανόνας έχει ΠΗΓΗ και ΗΜΕΡΟΜΗΝΙΑ ΕΠΑΛΗΘΕΥΣΗΣ. Ό,τι δεν έχει, δεν είναι κανόνας.

Πηγές: `CLAUDE.md` (ρίζα repo), `docs/DECISION_LOG.md` (81 αποφάσεις, 61 τον Σεπτέμβριο 2026), `docs/SYNC_MAP.md`, ο κώδικας του Worker (`worker/src/index.js`), και η βάση (SELECT 22/9/2026).

## 1. Τι είναι

Σύστημα διαχείρισης μεταφορών μιας εταιρείας ψυχρής αλυσίδας (διεθνή και εθνικά δρομολόγια, Ελλάδα ↔ Ευρώπη). Σε παραγωγική χρήση από 12/8/2026, πιλοτικά, με ~7 ενεργούς λογαριασμούς. Ομάδα 05:30–14:30. **Ένα περιβάλλον** (παραγωγή), βλ. `01-σημερινή-κατάσταση.md`.

```
Browser (GitHub Pages, δημόσιο repo, main)
   │  Airtable-style URLs + JWT 8h
   ▼
Cloudflare Worker  «petras-tms-backend-staging»  (= ΠΑΡΑΓΩΓΗ, το όνομα είναι ιστορικό)
   │  μεταφράζει labels → στήλες, μιμείται Airtable API, service_role
   ▼
Supabase Postgres  «Petrasgroup TMS»  (36 πίνακες, 24 όψεις, 22 triggers)
```
Επαλήθευση: 22/9/2026 (CF workers_list, config.js ζωντανό, SELECT).

## 2. Σελίδες — σκοπός, ποιος, τι γράφει

Πηγή: `core/router.js:23-94` (NAV), `config.js:333-346` (PERMS UI), `worker/src/index.js:435-600` (PERMISSIONS backend). Επαλήθευση κώδικα 22/9/2026.

| Σελίδα (id) | Σκοπός | Ποιος τη βλέπει (UI) | Γράφει στο ΑΝΟΙΓΜΑ; |
|---|---|---|---|
| `dashboard` Πίνακας Ελέγχου | KPI ημέρας, διαβάζει `Price` (κλειδωμένο μέχρι P&L) | όλοι με planning | ΟΧΙ |
| `weekly_intl` Εβδομαδιαίο Διεθνών | Kanban εβδομάδας διεθνών παραγγελιών, ανάθεση φορτηγού/οδηγού/συνεργάτη, ταίριασμα export↔import | planning: full=owner/dispatcher, view=λοιποί | ΟΧΙ (γράφει μόνο σε drag/κλικ) |
| `weekly_natl` Εβδομαδιαίο Εθνικών | Ίδιο για εθνικά φορτία (ΑΝΟΔΟΣ/ΚΑΘΟΔΟΣ), VS καρτέλα μόνο-ανάγνωσης | ίδιο | ΟΧΙ |
| `weekly_pickups` Εθνικές Παραλαβές | iframe, μόνο owner | owner | ΔΕΝ ΕΛΕΓΧΘΗΚΕ (iframe με δικό του JWT) |
| `daily_ops` Ημερήσιο Πλάνο | Τέσσερις ενότητες ημέρας (owner ακύρωσε ενοποίηση) | planning | ΟΧΙ |
| `daily_ramp` Πίνακας Ράμπας | Ράμπα Βέροιας: παραλαβές/φορτώσεις ημέρας, Planned/Done | orders | **ΝΑΙ** για owner/dispatcher: `_rampAutoSync()` δημιουργεί εγγραφές RAMP από παραγγελίες (`modules/daily_ramp.js:95`) |
| `orders_intl` / `orders_natl` | CRUD παραγγελιών, φόρμα με στάσεις, Veroia Switch, Groupage | orders | ΟΧΙ |
| `locations`, `clients`, `partners`, `drivers`, `trucks`, `trailers`, `workshops` | Master data (entity engine) | clients/drivers | ΟΧΙ |
| `payroll` Μισθοδοσία Οδηγών | Κάρτες οδηγών, καρτέλα, A4, CSV· αξία ανά δρομολόγιο | costs (owner, accountant· management view) | ΟΧΙ |
| `maint_*` (dash, req, expiry, svc, trucks, trailers) | Στόλος: εντολές εργασίας, λήξεις εγγράφων, ιστορικό service | maintenance | ΟΧΙ |
| `invoicing` Τιμολόγηση | Λίστα παραδομένων ατιμολόγητων, «Καταχώρηση τιμολογίου ERP» (αριθμός ΤΠΥ υποχρεωτικός) | orders (accountant γράφει PATCH) | ΟΧΙ |
| `pallet_ledger` Ισοζύγιο Παλετών | Κινήσεις παλετών (`pl_movements`), πύλη δελτίων | orders | ΟΧΙ |
| `expenses` Έξοδα Δρομολογίων | Εβδομαδιαίο φύλλο RT × κατηγορία, εισαγωγή DKV | costs | ΟΧΙ |
| `costs` TRIP PnL | Έσοδα/κόστη ανά RT | **owner μόνο** | ΟΧΙ |
| `ceo_dashboard`, `performance` | Δείκτες διοίκησης / προσωπικοί (αρκετοί δομικά 0) | ceo_dashboard / performance | ΟΧΙ |
| `settings`, `trash`, `metrics_audit`, `error_log` | Ρυθμίσεις, κάδος, έλεγχος μετρήσεων, καταγραφή σφαλμάτων | owner | ΟΧΙ |
| `audit_trail` Ιστορικό Ενεργειών | Διαβάζει `audit_log` | owner, management | ΟΧΙ |

**Κανόνας για bot:** χωρίς λογαριασμό μόνο-ανάγνωσης, καμία σελίδα με login. Με τέτοιο λογαριασμό (δεν υπάρχει 22/9), όλες εκτός `daily_ramp` και `weekly_pickups`.

## 3. Ρόλοι

5 ρόλοι: `owner`, `management`, `accountant`, `dispatcher`, `warehouse`. 18 λογαριασμοί στη βάση (`users`), 7 ενεργοί. Επαλήθευση SELECT 22/9/2026.

- Dispatcher **δεν βλέπει P&L** (κλειδωμένο 23/8/2026): `Gross Profit`, `Margin`, `Client Revenue`, καύσιμα. Την **τιμή πώλησης** (`Price`) τη βλέπει.
- Accountant έχει PATCH σε `orders`/`national_orders` (όλα τα πεδία, όχι μόνο Invoiced — γνωστό ρίσκο, `worker/src/index.js:506-511`).
- Warehouse: μόνο GET σε 7 πίνακες + παλέτες.
- **Δεν υπάρχει ρόλος μόνο-ανάγνωσης.**
- Το wildcard `"*"` **αντικαθιστά**, δεν συγχωνεύεται: `roleMap[table] || roleMap["*"]`. Νέος πίνακας ανοίγει αυτόματα σε όποιον έχει `"*"`.

## 4. Σχέσεις δεδομένων

### 4α. Facade IDs → πίνακες
Τα «table IDs» τύπου `tbl…` **δεν είναι Airtable** (το Airtable δεν χρησιμοποιείται από 28/7/2026). Είναι IDs διαδρομών του Worker. Πλήρης χάρτης στο `CLAUDE.md` §Αρχιτεκτονική. Οι κύριοι:

| ID | Πίνακας | Ρόλος |
|---|---|---|
| tblgHlNmLBH3JTdIM | `orders` | Διεθνείς παραγγελίες (και σκέλη split με `parent_order_id`) |
| tblVW42cZnfC47gTb | `national_loads` | Εθνικά φορτία — **ο ένας πίνακας σχεδιασμού εθνικών** |
| tblGHCCsTMqAy4KR2 | `national_orders` | Εθνικές παραγγελίες — **σχεδόν άδειο = σωστό** (12 γραμμές) |
| tblaeY5QOHAS1gyE8 | `order_stops` | Στάσεις (φόρτωση/εκφόρτωση) ανά παραγγελία |
| tblxUAaIsUMEDl3qQ | `groupage_lines` | Γραμμές groupage — **ποτέ δεν διαγράφονται** (ON DELETE RESTRICT) |
| tbl5XSLQjOnG6yLCW | `consolidated_loads` | Ενοποιημένα φορτία groupage |
| tblT8W5WcuToBQNiY | `ramp` | Ράμπα Βέροιας |
| tblFWKAQVUzAM8mCE / tblLHl5m8bqONfhWv | `clients` / `partners` | Πεδίο διεύθυνσης λέγεται `Adress` (ένα d) |
| tbl7UGmYhc2Y82pPs / tblEAPExIAjiA3asD / tblDcrqRJXzPrtYLm | `drivers` / `trucks` / `trailers` | Στόλος |

Εκτός facade (δικές τους διαδρομές): `/costs/*` → `ct_round_trips`, `ct_rt_legs`, `ct_cost_docs`, `ct_cost_lines`, `ct_settings` · `/payroll` → `dl_entries` · `/pallets/*` → `pl_movements` · `/audit` → `audit_log` · `/app-errors` → `app_errors`.

### 4β. Παγίδες ονομάτων (επαληθευμένες στον χάρτη 23/8/2026, ξανά 22/9 από κώδικα)
- Μονολεκτικά κλειδιά στον χάρτη **χωρίς εισαγωγικά** (`Price: "price"`), πολυλεκτικά **με** (`"VAT Number": "tax_id"`). Ένα grep με εισαγωγικά επιστρέφει ψευδώς «δεν υπάρχει».
- `Order Number` **δεν υπάρχει** → `Reference`. `Net Price` **δεν υπάρχει** (κλειδωμένη αναβολή) → `Price`. `Week Number` = formula, δεν γράφεται.
- **Άγνωστο όνομα πεδίου σε εγγραφή = σιωπηλή απόρριψη με 200 OK.** Το μόνο ίχνος: πίνακας `facade_unknown_fields`. Σε **φίλτρο**: 422.
- **Στήλη NULL δεν εμφανίζεται καθόλου** στην απάντηση. Οι οθόνες μεταφράζουν την απουσία σε 0 ή «όλα καλά».

### 4γ. Sync chain (πηγή: CLAUDE.md, SYNC_MAP.md E1–E14, triggers στη βάση 22/9)
```
ORDERS (veroia_switch=true) ──► NATIONAL_LOADS (source_type='Direct', source_order_id)
                                 ΔΕΝ περνά από NATIONAL_ORDERS
ORDERS / NATIONAL_ORDERS (national_groupage) ──► GROUPAGE_LINES ──► CONSOLIDATED_LOADS ──► Weekly ΑΝΟΔΟΣ
ORDERS (ανάθεση + status In Transit/Delivered) ──► ct_round_trips + ct_rt_legs   [rt-feed.js + trigger rt_create_from_order]
ct_round_trips (OWNED, με οδηγό) ──► dl_entries (μισθοδοσία)                         [trigger dl_sync_from_rt]
ct_cost_lines (pay_source='CASH') ──► dl_entries.expenses (expenses_auto)           [trigger dl_cash_sync_line, migration 042]
ORDERS (Pallet Exchange) ──► pl_movements                                            [pallet-feed.js, μόνο μετά από αποθήκευση]
ORDERS ──► RAMP                                                                      [_rampAutoSync στο άνοιγμα της Ράμπας, owner/dispatcher]
```
Όλα τα «──►» που περνούν από trigger γράφουν στο `audit_log` με `actor='trigger:rt_sync'`, `role='system'`.

### 4δ. Βασική ροή
Παραγγελία (Pending) → ανάθεση φορτηγού/οδηγού ή συνεργάτη (Assigned) → In Transit → Delivered. **Το RT γεννιέται στην ανάθεση/εκτέλεση, όχι στην καταχώρηση** (owner 24/8). Από το RT: μισθοδοσία (OWNED), έξοδα (γραμμές DKV/μετρητών ανά RT), P&L (owner). Παράλληλα: τιμολόγηση (checkbox `invoiced` + αριθμός ΤΠΥ από ERP) και παλέτες (κινήσεις ανά στάση φόρτωσης, πύλη δελτίων).

Status λεξιλόγιο (κλειδωμένο): `Pending → Assigned → In Transit → Delivered`, συν `Cancelled`. Εξαιρέσεις: GROUPAGE LINES `Unassigned/Assigned`, RAMP `Planned/Done`. **«Invoiced» δεν είναι status.**

## 5. Κλειδωμένες αποφάσεις — ΔΕΝ είναι bugs

| Κανόνας | Πηγή | Επαλήθευση |
|---|---|---|
| Το TMS **δεν εκδίδει** τιμολόγια· το ERP. Το TMS κρατά checkbox + αριθμό ΤΠΥ (υποχρεωτικός, χωρίς προσυμπλήρωση). Χωρίς τιμή → καμία φόρμα. | CLAUDE.md 23/8 · DECISION_LOG 21/9 | 22/9: 2 invoiced χωρίς αριθμό = ιστορικό 21/8, trigger 043 ενεργός (εκτελέστηκε 21/9 βράδυ) |
| `national_orders` σχεδόν άδειο = σωστό. Το Veroia Switch γράφει **κατευθείαν** στο `national_loads`. | CLAUDE.md 23/8 | 22/9: 12 γραμμές, 0 VS χωρίς national load |
| Cross-dock: **ΜΙΑ** στήλη `cross_dock_date`. Εκτίμηση όταν κενή: export = Loading+1, import = Delivery−1. `vs_cd_date` νεκρή. | CLAUDE.md 9/9 | 22/9: 42/42 VS με τιμή |
| `plan_week_start` γράφεται **μόνο** από χειροκίνητη μετάθεση εβδομάδας στο Weekly· όταν NULL, το Weekly τοποθετεί από loading/delivery datetime. Η όψη 018 περνά τη στήλη ως έχει. **NULL ≠ πρόβλημα.** | owner 6/9 · συντονιστής 22/9 | 22/9: 190/192 NULL = φυσιολογικό |
| **Η εβδομάδα του TMS ξεκινά ΣΑΒΒΑΤΟ** (Σάββατο→Παρασκευή)· ίδιος υπολογισμός ISO week σε `weekly_intl.js:103-111` και στη λωρίδα Εξόδων («Εβδ. 36 · 29/08–04/09»). Άρα `plan_week_start`, όταν υπάρχει, είναι Σάββατο (isodow=6). | κώδικας + συντονιστής 22/9 | 22/9: 2/2 μη-NULL τιμές = Σάββατο 29/8 |
| `Net Price` / επιμερισμός VS: **ανυλοποίητο σκόπιμα** μέχρι P&L. | CLAUDE.md 23/8 | κώδικας 22/9 |
| GROUPAGE LINES ποτέ δεν διαγράφονται (Status=Unassigned στην επαναφορά). | CLAUDE.md, FK RESTRICT | κώδικας 22/9 |
| Δικαιώματα προσωρινά ευρέα (πιλοτικό)· DELETE στενό. | CLAUDE.md 23/8 | PERMISSIONS 22/9 |
| Πύλη δελτίων παλετών: **ΠΟΤΕ cutoff** — ξεμπλοκάρισμα μόνο με πραγματική καταχώρηση. | owner 25/8 | — |
| Daily Ops = τέσσερις ενότητες (ακυρώθηκε ενοποίηση). | owner | — |
| Ράμπα + National Pick Up **τελευταία** στην ουρά. | owner 24/8 | — |
| Ιστορικό μισθοδοσίας από Excel: 11.078 γραμμές, `source='excel_import'`, **δεν** επαναϋπολογίζονται, διπλά Excel↔auto ανέγγιχτα. | DECISION_LOG 5–6/9 | 22/9: 11.078 |
| RT: ένα φορτηγό/οδηγός ανά roundtrip, κανόνας στη βάση· POST /costs/rt idempotent (attach αντί create). | DECISION_LOG 5/9, migration 033 | triggers 22/9 |
| Επικαλυπτόμενα RT ίδιου φορτηγού = **ΑΠΟΔΕΚΤΟ** μοτίβο (διαδοχικοί κύκλοι, lag ημερομηνίας παράδοσης — owner 14/9, w10 19/9: 23/24 ζεύγη). Ελάττωμα μόνο: κομμένος κύκλος export/import με `matched_import_id` (το πιάνει `rt_link_split`/037) ή τομή > 3 ημέρες. | συντονιστής 22/9 | 22/9: 22 ζεύγη |
| Σκέλη split: παραγγελία-παιδί με `parent_order_id`, το RT και η **τιμή** ανήκουν στον γονέα. «Groupage σε 3» = σπάσιμο σκέλους, όχι groupage. | DECISION_LOG 20–21/9 | 22/9: 4 παιδιά |
| Παραδομένη χωρίς τιμή (γονέας/απλή): ο dispatcher βάζει τιμή, η λογίστρια ζητά· κόκκινο μετά από 3 ημέρες από παράδοση. | owner 21/9 #3 | — |
| Τα ονόματα τοποθεσιών **μόνο λατινικά** (greeklish/ELOT). | owner 9/8 | — |
| Τα `?v=` είναι **ανά αρχείο**· `SW_VERSION` ενιαίο· bump και τα δύο σε κάθε deploy. | CLAUDE.md 5/9 | 22/9 ζωντανό = repo |
| Worker deploy **μόνο μετά τις 15:00**, με φρουρό των τριών πριν/μετά. | CLAUDE.md | — |

## 6. Αποδεκτές «ασυμφωνίες» που ΔΕΝ αναφέρονται ως ελαττώματα

- Partner RT χωρίς οδηγό (`driver_id` NULL) και χωρίς μισθοδοσία.
- Παραγγελία Delivered χωρίς `actual_delivery_date` (το «παραδόθηκε» δεν γράφεται από κανέναν — owner 10/8).
- `management` με 0 εγγραφές στο audit (ο ρόλος διαβάζει κυρίως).
- 401 σε GET από ανοιχτές καρτέλες μετά από 8 ώρες.
- `app_errors` «Permission denied: payroll» = χρήστης χωρίς δικαίωμα πάτησε σύνδεσμο.
- Ράμπα: 44 παλιές εγγραφές χωρίς δεσμό (πριν ~13/9) — ιστορικό.
- `ct_cost_lines` χωρίς RT (164 στις 22/9) — ουρά αντιστοίχισης της λογίστριας, όχι ελάττωμα· μόνο η αύξηση ενδιαφέρει.
- 409 στο `/costs/import/parse` = διπλό έγγραφο DKV, σωστή άρνηση.
- `invoiced` χωρίς `invoice_number` = **ακριβώς 2** (21/8) μέχρι απόφαση owner· > 2 = ελάττωμα.

## 7. ΑΓΝΩΣΤΟ / ΔΕΝ ΕΠΙΒΕΒΑΙΩΘΗΚΕ (22/9/2026)

- Γιατί το `app_errors` σιωπά από 17/9 (υγεία ή βλάβη).
- Γιατί οι `console.error` του Worker δεν εμφανίζονται στο CF observability.
- Ποιο νούμερο είναι «οι μπλοκαρισμένες πύλης» (159 Delivered / 167 σύνολο / 60 της 21/9).
- Ο ορισμός «Delivered χωρίς τιμή»: 17 με `price IS NULL` (SELECT 22/9) έναντι 31 που ανέφερε ο συντονιστής (πιθανόν `price IS NULL OR price = 0`) — να οριστεί ένα.
- Περιεχόμενο branch `feat/demo-users`.
- Retention των CF logs, scopes του CF token του owner.
- Τι κάνει το iframe `weekly_pickups` στο άνοιγμα.
- Τα `docs/SECURITY.md` και `docs/AUDIT_ACCESS.md` είναι **ξεπερασμένα** (7/5/2026, εποχή Airtable) — μην τα χρησιμοποιείς ως πηγή για ρόλους/κλειδιά.

## 8. Πώς να μιλάς στον owner

Ο owner **δεν είναι developer**. Κάθε εύρημα: τι σημαίνει για τη δουλειά (ποιος χρήστης, ποια οθόνη, τι θα δει λάθος), πόσο σίγουρο είναι (επιβεβαιωμένο με SELECT / υπόθεση), και **ένα** επόμενο βήμα. Ελληνικά. Ποτέ «κανένα πρόβλημα» για κάτι που δεν ελέγχθηκε — «δεν ελέγχθηκε».
