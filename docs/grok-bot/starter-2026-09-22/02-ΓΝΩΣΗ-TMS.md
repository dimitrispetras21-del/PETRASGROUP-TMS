# Γνώση του PETRAS GROUP TMS — εγχειρίδιο για τον ανεξάρτητο ελεγκτή (έκδοση 22/9/2026)

Απόσταγμα από `CLAUDE.md`, `docs/DECISION_LOG.md` (Σεπτέμβριος 2026), `docs/grok-bot/skill-tms-knowledge.md` και ανάγνωση κώδικα του `main` στις 22/9/2026 (`55f101c`). Κάθε κανόνας έχει **πηγή και ημερομηνία**. Ό,τι δεν έχει, δεν είναι κανόνας. Οι αριθμοί που αναφέρονται είναι **μετρήσεις της ημέρας που σημειώνεται**, όχι κανόνες — ξαναμετριούνται, δεν υποτίθενται.

Δύο είδη προτάσεων εδώ, και τα ξεχωρίζεις πάντα:
- **[ΑΠΟΦΑΣΗ]** — επιχειρησιακή απόφαση του ιδιοκτήτη. Δεν είναι bug, δεν «διορθώνεται». Παραβίασή της από κώδικα = εύρημα.
- **[ΥΛΟΠΟΙΗΣΗ]** — περιγραφή του τι κάνει ο κώδικας σήμερα. Μπορεί να αλλάξει· αν ο κώδικας που βλέπεις διαφέρει, ισχύει ο κώδικας και η διαφορά είναι εύρημα τεκμηρίωσης (P3/P4).

## 1. Τι είναι

Σύστημα διαχείρισης μεταφορών εταιρείας ψυχρής αλυσίδας: διεθνή δρομολόγια (Ελλάδα ↔ Ευρώπη) και εθνικά. Σε παραγωγική χρήση από 12/8/2026, πιλοτικά. Ομάδα εργάζεται **05:30–14:30**· αλλαγές με ρίσκο γίνονται μετά τις 15:00 [ΑΠΟΦΑΣΗ, CLAUDE.md αρχή 7]. Δεύτερο εμπορικό σήμα: DPS Logistics. Ένα περιβάλλον: **η παραγωγή** — δεν υπάρχει δοκιμαστικό.

## 2. Αρχιτεκτονική

```
Browser (GitHub Pages, δημόσιο repo, σερβίρει τη ρίζα του main)
   │  Airtable-style URLs (/v0/<base>/<tableId>) + JWT 8 ωρών
   ▼
Cloudflare Worker «petras-tms-backend-staging»   ← ΕΙΝΑΙ η παραγωγή, το όνομα είναι ιστορικό
   │  facade: μεταφράζει labels → στήλες, μιμείται το Airtable API, μιλά με service_role
   ▼
Supabase Postgres «Petrasgroup TMS»
```
- **Το Airtable δεν χρησιμοποιείται από 28/7/2026** [ΥΛΟΠΟΙΗΣΗ, CLAUDE.md]. Τα `tbl…` ids είναι ids διαδρομών του Worker.
- **Front end**: `app.html` φορτώνει `core/*.js` και `modules/*.js` με `?v=<timestamp>` ανά αρχείο· `sw.js` έχει ενιαίο `SW_VERSION`. Σε κάθε αλλαγή module πρέπει να αλλάξουν **και τα δύο** [ΑΠΟΦΑΣΗ, CLAUDE.md 5/9/2026: αλλιώς ο service worker σερβίρει παλιό `app.html`]. Η μονάδα ελέγχου είναι το **push** (σύνολο commits), όχι το μεμονωμένο commit — το bump μπορεί να έρθει σε επόμενο commit του ίδιου push [ΑΠΟΦΑΣΗ συντονιστή 22/9, `07-change-review-runbook.md` §1].
- **Worker**: πηγή `worker/src/index.js` (bundle ~4.800 γραμμές) + `worker/wrangler.toml`. Deploy **μόνο** από τον ιδιοκτήτη με `wrangler deploy`, μετά τις 15:00 [ΑΠΟΦΑΣΗ, CLAUDE.md]. **Το `main` μπορεί να περιέχει κώδικα Worker που δεν έχει γίνει deploy** — η έκδοση της παραγωγής είναι άγνωστη σε όποιον βλέπει μόνο το repo. Τελευταίο γνωστό deploy: 21/9/2026 βράδυ.
- **Migrations**: `worker/migrations/NNN_*.sql`. Η κεφαλίδα κάθε αρχείου δηλώνει **DRAFT** ή **ΕΚΤΕΛΕΣΤΗΚΕ <ημερομηνία>**. Ο πίνακας `schema_migrations` ΔΕΝ είναι αξιόπιστος (σταματημένος 23/8) — πηγή αλήθειας = κεφαλίδα + `pg_trigger` [ΥΛΟΠΟΙΗΣΗ, DECISION_LOG 22/9]. Αρχεία σε `worker/migrations/drafts/` δεν έχουν εκτελεστεί.
- **Auth**: `POST /auth/login` → Postgres `verify_login` (bcrypt) → JWT 8 ωρών `{sub, role, name}`. Ο Worker διαβάζει το `Authorization: Bearer` (`worker/src/index.js:149`). Οι λίστες `USERS` σε `config.js`/`index.html` είναι μόνο roster για tamper guard — δεν χρησιμοποιούνται για είσοδο [ΥΛΟΠΟΙΗΣΗ, CLAUDE.md].
- **Καταγραφές**: `audit_log` (κάθε επιτυχής αλλαγή μέσω Worker, `actor`/`role`/`action`/πίνακας)· `app_errors` (σφάλματα browser, `POST /app-errors`)· `facade_unknown_fields` (πεδία που ο Worker δεν αναγνώρισε)· Cloudflare Workers Logs (`[observability] enabled = true`, `worker/wrangler.toml:36-37` — περιέχουν request headers).

## 3. Σελίδες (id → ελληνικός τίτλος → σκοπός → ποιος → γράφει στο άνοιγμα;)

Πηγή: `core/router.js:23-94` (NAV), `config.js` `PERMS` (UI), `worker/src/index.js` `PERMISSIONS` (backend). Κώδικας 22/9/2026.

| id | Τίτλος | Σκοπός | Ποιος (UI) | Γράφει στο άνοιγμα; |
|---|---|---|---|---|
| `dashboard` | Πίνακας Ελέγχου | KPI ημέρας, διαβάζει `Price` | planning | όχι |
| `weekly_intl` | Εβδομαδιαίο Διεθνών | Kanban εβδομάδας διεθνών, ανάθεση φορτηγού/οδηγού/συνεργάτη, ταίριασμα export↔import, σπάσιμο σκελών, ρότα | planning full: owner/dispatcher· view: λοιποί | όχι (γράφει σε drag/κλικ) |
| `weekly_natl` | Εβδομαδιαίο Εθνικών | Ίδιο για εθνικά φορτία (ΑΝΟΔΟΣ/ΚΑΘΟΔΟΣ)· καρτέλα VS μόνο-ανάγνωσης | ίδιο | όχι |
| `weekly_pickups` | Εθνικές Παραλαβές | iframe εξωτερικού repo `petras-assign` με δικό του JWT (`core/router.js:358`) | owner | **ΑΓΝΩΣΤΟ — απαγορευμένη** |
| `daily_ops` | Ημερήσιο Πλάνο | Τέσσερις ενότητες ημέρας, δηλώσεις κατάστασης | planning | όχι |
| `daily_ramp` | Πίνακας Ράμπας | Ράμπα Βέροιας: παραλαβές/φορτώσεις ημέρας, Planned/Done | orders | **ΝΑΙ** — `_rampAutoSync()` δημιουργεί RAMP από παραγγελίες, για `planning:'full'` (`modules/daily_ramp.js:95`, `:324`) |
| `orders_intl` / `orders_natl` | Διεθνείς / Εθνικές Παραγγελίες | Λίστα + φόρμα με στάσεις, Veroia Switch, Groupage, καρτέλα· στήλη ΤΙΜ. (invoiced) | orders | όχι |
| `locations` `clients` `partners` `drivers` `trucks` `trailers` `workshops` | Master data | entity engine (`core/entity.js`) | clients/drivers/maintenance | όχι |
| `payroll` | Μισθοδοσία Οδηγών | Κάρτες, καρτέλα, A4, CSV· `dl_entries` | costs (owner/accountant full, management view) | όχι |
| `maint_*` | Συντήρηση/Στόλος | Εντολές εργασίας, λήξεις εγγράφων, ιστορικό service | maintenance | όχι |
| `invoicing` | Τιμολόγηση | Παραδομένες ατιμολόγητες, «Καταχώρηση τιμολογίου ERP» (`modules/invoicing.js`) | orders (accountant γράφει) | όχι |
| `pallet_ledger` | Ισοζύγιο Παλετών | `pl_movements`, πύλη δελτίων | orders | όχι |
| `expenses` | Έξοδα Δρομολογίων | Εβδομαδιαίο φύλλο RT × κατηγορία, εισαγωγή DKV | costs | όχι |
| `costs` | TRIP PnL | Έσοδα/κόστη ανά RT | owner μόνο | όχι |
| `ceo_dashboard` `performance` | Πίνακας Διοίκησης / Η Απόδοσή μου | Δείκτες (αρκετοί δομικά 0) | ceo_dashboard / performance | όχι |
| `settings` `trash` `metrics_audit` `error_log` `audit_trail` | Διαχείριση | Ρυθμίσεις, κάδος, έλεγχος μετρήσεων, σφάλματα, ιστορικό ενεργειών | owner (audit_trail: + management) | όχι |

Οι αλυσίδες `core/order-sync.js`, `core/rt-feed.js`, `core/pallet-feed.js`, `core/pa-helpers.js` ξεκινούν **μόνο** από αποθήκευση/διαγραφή/ταίριασμα (κλικ), όχι από render [ΥΛΟΠΟΙΗΣΗ, έλεγχος κώδικα 22/9 — `daily_ramp` είναι η μόνη επιβεβαιωμένη εξαίρεση· το iframe δεν ελέγχθηκε].

## 4. Ρόλοι και δικαιώματα — δύο πίνακες που πρέπει να συμφωνούν

Πέντε ρόλοι: `owner`, `management`, `accountant`, `dispatcher`, `warehouse`.

- **UI**: `config.js` `PERMS` (planning/orders/clients/maintenance/drivers/costs/settings/performance/ceo_dashboard → `full`/`view`/`none`). Κρύβει μενού και κουμπιά. **Δεν προστατεύει τίποτα** — μόνο ο Worker.
- **Worker**: `worker/src/index.js` `PERMISSIONS` (ανά ρόλο → ανά πίνακα → μέθοδοι), `COSTS_PERMS` (`/costs/*`), `PL_PERMS` (`/pallets/*`), `SCOPED_DELETE` (dispatcher σβήνει `orders` μόνο αν είναι σκέλος, `:2820`).
- **Παγίδα wildcard** [ΥΛΟΠΟΙΗΣΗ]: `roleMap[table] || roleMap["*"]` — το `"*"` **αντικαθιστά**, δεν συγχωνεύεται. Ρόλος με `"*": ["GET"]` και **χωρίς** ρητή γραμμή για έναν πίνακα έχει εκεί μόνο GET· ρόλος με ευρύ `"*"` ανοίγει αυτόματα σε κάθε νέο πίνακα. Ρητή γραμμή που ξεχνά μια μέθοδο την αφαιρεί σιωπηλά.
- [ΑΠΟΦΑΣΗ, owner 23/8/2026] Δικαιώματα προσωρινά **ευρέα** για όλους (πιλοτικό: ένα 403 σε λάθος στιγμή σταματά δουλειά)· το `DELETE` μένει **στενό**. Θα σφίξουν αργότερα. Ευρύ δικαίωμα ≠ εύρημα, εκτός αν παραβιάζει κλειδωμένη απόφαση.
- [ΑΠΟΦΑΣΗ, owner 23/8/2026] **Dispatcher δεν βλέπει P&L** (`Gross Profit`, `Margin Percent`, `Client Revenue`, καύσιμα)· την **τιμή πώλησης** `Price` τη βλέπει.
- [ΑΠΟΦΑΣΗ, 5/9/2026] Μισθοδοσία κλειστή για dispatcher· round trip δεν διαγράφεται από accountant/management.
- **Δεν υπάρχει ρόλος μόνο-ανάγνωσης** ούτε στο TMS ούτε στη βάση (22/9/2026).

## 5. Δεδομένα

### 5α. Facade ids → πίνακες Postgres (πλήρης χάρτης, CLAUDE.md, ισχύει 22/9)
| Facade id | Όνομα στον κώδικα | Πίνακας |
|---|---|---|
| tblgHlNmLBH3JTdIM | ORDERS | `orders` (διεθνείς· σκέλη split με `parent_order_id`) |
| tblGHCCsTMqAy4KR2 | NATIONAL ORDERS | `national_orders` |
| tblVW42cZnfC47gTb | NATIONAL LOADS | `national_loads` (ο **ένας** πίνακας σχεδιασμού εθνικών) |
| tblaeY5QOHAS1gyE8 | ORDER STOPS | `order_stops` |
| tblxUAaIsUMEDl3qQ | GROUPAGE LINES | `groupage_lines` |
| tbl5XSLQjOnG6yLCW | CONSOLIDATED LOADS | `consolidated_loads` |
| tblUhgqnmiam5MGNK | PARTNER ASSIGNMENTS | `partner_assignments` |
| tblT8W5WcuToBQNiY | RAMP | `ramp` |
| tblxRFsMeVhlLrBjF | FUEL | `fuel` |
| tblAAH3N1bIcBRPXi / tblAUixdjwpgnJ1hK | PALLET_LEDGER_SUPPLIERS / _PARTNERS | `pallet_ledger_suppliers` / `pallet_ledger_partners` |
| tblMiFxbm9ky8PCQi | WORKSHOPS | `workshops` |
| tbllPbPPd6N3zEZF1 / tbl3vhUmzKDWhJynR | MAINT_HISTORY / MAINT_REQ | `maint_history` / `maint_req` |
| tblFWKAQVUzAM8mCE / tblLHl5m8bqONfhWv | CLIENTS / PARTNERS | `clients` / `partners` |
| tblxu8DRfTQOFRCzS | LOCATIONS | `locations` |
| tbl7UGmYhc2Y82pPs / tblEAPExIAjiA3asD / tblDcrqRJXzPrtYLm | DRIVERS / TRUCKS / TRAILERS | `drivers` / `trucks` / `trailers` |

Εκτός facade, δικές τους διαδρομές: `/costs/*` → `ct_round_trips`, `ct_rt_legs`, `ct_cost_docs`, `ct_cost_lines`, `ct_settings`, `ct_import_rules`, `ct_plate_aliases` · `/costs/ledger` → `dl_entries`, `dl_import_batches` · `/pallets/*` → `pl_movements` · `/audit` → `audit_log` · `/app-errors` → `app_errors` · `/performance/delivery` · `/print/pdf` · `/api/locations` · `/v1/ai/messages`. Όψεις (από migrations): `orders_with_derived`, `ct_v_rt_pnl`, `ct_v_rt_costs`, `ct_v_rt_revenue`, `ct_v_rt_pallet_gate`, `ct_v_fuel`, `ct_v_consumption`, `ct_v_wear_rate`, `dl_v_entries`, `dl_v_balance`, `dl_v_rt_gap`, `dl_v_rt_route`, `pl_v_balance_clients`, `pl_v_balance_partners`, `pl_v_order_gate`, `pl_v_client_locations`, `v_client_delivery`, `v_driver_delivery`, `v_partner_delivery`, `maint_plan_status`.

### 5β. Οι τρεις μηχανισμοί-παγίδες του facade [ΥΛΟΠΟΙΗΣΗ — το έδαφος, όχι bug που θα φύγει αύριο]
1. **Άγνωστο όνομα πεδίου σε εγγραφή = σιωπηλή απόρριψη με 200 OK.** Ο χάρτης `TABLES.<πίνακας>.fields` (+ `aliases`) μεταφράζει label → στήλη· ό,τι δεν βρίσκει, το πετά χωρίς σφάλμα. Μόνο ίχνος: πίνακας `facade_unknown_fields`. Στην ανάγνωση: το άγνωστο πεδίο απλώς δεν μπαίνει στο select. **Σε φίλτρο** (`filterByFormula`): 422 — η μόνη θορυβώδης διαδρομή.
2. **Στήλη NULL δεν εμφανίζεται καθόλου** στην απάντηση. `'X' in rec.fields` είναι false και για κενό και για ανύπαρκτο. Οι οθόνες συχνά μεταφράζουν την απουσία σε `0` ή «όλα εντάξει».
3. **RBAC wildcard αντικαθιστά** (βλ. §4).

Συνέπεια: **κάθε νέο label πεδίου επιβεβαιώνεται στον χάρτη `TABLES` για τον συγκεκριμένο πίνακα, πριν χρησιμοποιηθεί.** Παγίδα αναζήτησης: μονολεκτικά κλειδιά γράφονται **χωρίς εισαγωγικά** (`Price: "price"`), πολυλεκτικά **με** (`"VAT Number": "tax_id"`). Ένα grep για `"Price"` γυρίζει ψευδώς «δεν υπάρχει».

### 5γ. Παγίδες ονομάτων (επαληθευμένες στον χάρτη 23/8, ξανά 22/9)
- `Adress` (ένα d) σε CLIENTS/PARTNERS· `Address` σε LOCATIONS/WORKSHOPS.
- `Order Number` **δεν υπάρχει** → `Reference`. `Order No` υπάρχει (από 7/9). `Net Price` **δεν υπάρχει** → `Price`. `Week Number` = formula, δεν γράφεται. `Veroia Switch` χωρίς κενό στο τέλος.
- `Name` δεν είναι πεδίο NATIONAL ORDERS (ανήκει στα NATIONAL LOADS).
- Linked records: σκέτος πίνακας string ids (`['recABC']`). Φίλτρο linked: `FIND("recX", ARRAYJOIN({Field}, ","))>0` — δουλεύει μόνο αν ο πίνακας έχει `links` block στον Worker.
- Checkbox σε φίλτρο: `{National Groupage}=1`.
- Direction: NATIONAL ORDERS `'North→South'/'South→North'`· CONSOLIDATED LOADS `'ΚΑΘΟΔΟΣ'/'ΑΝΟΔΟΣ'`. ΑΝΟΔΟΣ = South→North (προμηθευτές → Βέροια).

### 5δ. Status λεξιλόγιο [ΑΠΟΦΑΣΗ, owner 23/8/2026]
`Pending → Assigned → In Transit → Delivered`, συν `Cancelled`. Εξαιρέσεις: GROUPAGE LINES `Unassigned/Assigned`· RAMP `Planned/Done`. **«Invoiced» δεν είναι status** — μόνο checkbox. Το «παραδόθηκε» είναι πράξη ανθρώπου, δεν υπολογίζεται [ΑΠΟΦΑΣΗ, owner 10/8].

## 6. Ροές

### 6α. Sync chain (CLAUDE.md, `docs/SYNC_MAP.md`, triggers)
```
ORDERS (veroia_switch=true) ──► NATIONAL_LOADS (source_type='Direct')   ΔΕΝ περνά από NATIONAL_ORDERS
ORDERS / NATIONAL_ORDERS (national_groupage) ──► GROUPAGE_LINES (1/στάση) ──► CONSOLIDATED_LOADS (1/φορτηγό) ──► Weekly Εθνικών ΑΝΟΔΟΣ
ORDERS (ανάθεση) ──► ct_round_trips + ct_rt_legs      [core/rt-feed.js + DB triggers rt_create_from_order/rt_sync_from_order]
ct_round_trips (OWNED, με οδηγό) ──► dl_entries        [trigger dl_sync_from_rt, migration 011]
ct_cost_lines (pay_source='CASH') ──► dl_entries.expenses   [triggers 042]
ORDERS (Pallet Exchange) ──► pl_movements               [core/pallet-feed.js, μόνο μετά αποθήκευση]
ORDERS ──► RAMP                                          [_rampAutoSync στο άνοιγμα Ράμπας + order-sync μετά αποθήκευση]
```
Οι εγγραφές από trigger γράφουν στο `audit_log` με `actor='trigger:…'`, `role='system'`.

### 6β. Βασική ροή μιας μεταφοράς
Παραγγελία (Pending) → ανάθεση φορτηγού/οδηγού ή συνεργάτη (Assigned) → In Transit → Delivered. **Το RT γεννιέται στην ανάθεση, όχι στην καταχώρηση** [ΑΠΟΦΑΣΗ, owner 24/8, αναθεώρηση 14/9]. Από το RT: μισθοδοσία (OWNED με οδηγό), έξοδα (γραμμές DKV/μετρητών ανά RT), P&L (owner). Παράλληλα: τιμολόγηση (checkbox `invoiced` + αριθμός ΤΠΥ + ημερομηνία από το ERP) και παλέτες (κινήσεις ανά στάση φόρτωσης, πύλη δελτίων).

### 6γ. Τα 8 κυκλώματα (για να ξέρεις πού ανήκει μια αλλαγή — `docs/grok-bot/10-χάρτης-κάλυψης.md`)
1 παραγγελία → ανάθεση → RT → σκέλη · 2 μισθοδοσία · 3 έξοδα + DKV · 4 τιμολόγηση ΤΠΥ · 5 παλέτες/πύλη · 6 εθνικά/VS/ράμπα/Ημερήσιο · 7 στόλος/λήξεις · 8 δικαιώματα ανά ρόλο και deploy/εκδόσεις.

## 7. Κλειδωμένες αποφάσεις — ΔΕΝ είναι bugs

| Κανόνας | Πηγή / ημερομηνία |
|---|---|
| **Το TMS δεν εκδίδει τιμολόγια — το ERP.** Το TMS κρατά checkbox `Invoiced` + `Invoice Number` (αριθμός ΤΠΥ του ERP, **υποχρεωτικός**, χωρίς αυτόματη αρίθμηση) + `Invoice Date`. Σήμανση χωρίς αριθμό ή χωρίς τιμή απορρίπτεται από τον Worker (`invoiceMarkError`, `worker/src/index.js:2750-2762`) και από trigger στη βάση (migration 043, ΕΚΤΕΛΕΣΤΗΚΕ 21/9). | owner 23/8 · owner 21/9 (DECISION_LOG) |
| Η **μία πόρτα** για τη σήμανση «τιμολογήθηκε» είναι η οθόνη Τιμολόγησης (φόρμα ΤΠΥ). | owner 22/9 (DECISION_LOG) |
| Τιμολόγηση δέχεται μόνο `Delivered`. Παραδομένη χωρίς τιμή: ο dispatcher βάζει τιμή, η λογίστρια ζητά. | owner 21/9 |
| `national_orders` σχεδόν άδειο = **σωστό**. Το Veroia Switch γράφει **κατευθείαν** στο `national_loads`. | CLAUDE.md 23/8 |
| Cross-dock: **ΜΙΑ** στήλη `cross_dock_date`· `VS CD Date` είναι συνώνυμο της ίδιας (από 9/9)· `vs_cd_date` νεκρή. Εκτίμηση όταν κενή: export = Loading+1, import = Delivery−1. | CLAUDE.md 9/9 |
| `Net Price` / επιμερισμός τιμής VS: **σκόπιμα ανυλοποίητο** μέχρι τη φάση P&L. | CLAUDE.md 23/8 |
| GROUPAGE LINES **ποτέ δεν διαγράφονται** — στην επαναφορά `Status='Unassigned'`. Η βάση το επιβάλλει (`ON DELETE RESTRICT`). | CLAUDE.md· FK |
| Dashboard διαβάζει `Price` μέχρι το P&L. | owner 23/8 |
| Daily Ops = **τέσσερις** ενότητες· η ενοποίηση ακυρώθηκε. | owner |
| Ράμπα + National Pick Up **τελευταία** στην ουρά ανάπτυξης. | owner 24/8 |
| Πύλη δελτίων παλετών: **ΠΟΤΕ cutoff** — ξεμπλοκάρισμα μόνο με πραγματική καταχώρηση δελτίου. | owner 25/8 |
| Ονόματα τοποθεσιών **μόνο λατινικά** (greeklish/ELOT 743). | owner 9/8 |
| `plan_week_start` γράφεται **μόνο** από χειροκίνητη μετάθεση εβδομάδας στο Weekly· NULL = φυσιολογικό (το Weekly τοποθετεί από ημερομηνίες). | owner 6/9 · 22/9 |
| **Η εβδομάδα του TMS ξεκινά Σάββατο** (Σάββατο→Παρασκευή) — `weekly_intl.js` και λωρίδα Εξόδων. | κώδικας + συντονιστής 22/9 |
| RT: **ένα φορτηγό / ένας οδηγός** ανά round trip, κανόνας στη βάση· `POST /costs/rt` idempotent (προσαρτά αντί να διπλασιάζει). | DECISION_LOG 5/9 · migration 033 |
| Επικαλυπτόμενα RT ίδιου φορτηγού ≤ 3 ημέρες = **αποδεκτό** (διαδοχικοί κύκλοι, lag παράδοσης). Ελάττωμα μόνο: κομμένος κύκλος export/import (`matched_import_id`, migration 037 `rt_link_split`) ή τομή > 3 ημέρες. | owner 14/9 · 19/9 |
| Σκέλη split: παιδί με `parent_order_id`· RT και **τιμή** ανήκουν στον γονέα. «Groupage σε 3» = σπάσιμο σκέλους, όχι groupage. | DECISION_LOG 20–21/9 |
| Ιστορικό μισθοδοσίας από Excel (`source='excel_import'`) **δεν** επαναϋπολογίζεται· διπλά Excel↔auto ανέγγιχτα. | DECISION_LOG 5–6/9 |
| Μετρητά Μ στη μισθοδοσία = Σ γραμμών `pay_source='CASH'` του RT (`expenses_auto`), κλείδωμα `dl_cash_lock`. | migration 042, ΕΚΤΕΛΕΣΤΗΚΕ 21/9 |
| Εισαγωγή DKV: πύλη E-SUMMARY (το έγγραφο = άθροισμα γραμμών), 409 σε διπλό έγγραφο = σωστή άρνηση. | DECISION_LOG 8/9, 17/9 |
| Worker deploy μόνο μετά τις 15:00, με «φρουρό των τριών» πριν/μετά (`order_stops … "DELETE"` για dispatcher· `"VS CD Date": "cross_dock_date"`· 4 πεδία WORKSHOPS). | CLAUDE.md |
| Από 22/9: κάθε αλλαγή κώδικα → branch → ανεξάρτητος ελεγκτής → go → `main`. Docs-only εξαιρούνται. | συντονιστής 22/9 |
| Οι αλυσίδες `order-sync` **δεν σιωπούν ποτέ**: αποτυχία → toast/`logError`, όχι `catch {}`. | DECISION_LOG 9/9 |
| Οι ημερομηνίες μιας μεταφοράς κινούνται μαζί (trigger 028). | DECISION_LOG 9/9 |

## 8. Εγκεκριμένες «ασυμφωνίες» που ΔΕΝ αναφέρονται ως ελαττώματα

- Partner RT χωρίς οδηγό (`driver_id` NULL) και χωρίς μισθοδοσία.
- Παραγγελία Delivered χωρίς `actual_delivery_date` (κανείς δεν το γράφει — owner 10/8).
- `management` με λίγες ή καθόλου εγγραφές στο audit (ρόλος ανάγνωσης).
- 401 σε GET από ανοιχτές καρτέλες μετά από 8 ώρες (λήξη JWT).
- `app_errors` «Permission denied: <σελίδα>» = χρήστης χωρίς δικαίωμα πάτησε σύνδεσμο.
- Παλιές εγγραφές RAMP χωρίς δεσμό (πριν ~13/9) — ιστορικό.
- `ct_cost_lines` χωρίς RT — ουρά αντιστοίχισης της λογίστριας· ενδιαφέρει μόνο η **αύξηση**.
- `invoiced=true` χωρίς `invoice_number`: υπάρχουν **ιστορικές** γραμμές (21/8, πριν το 043) — μέτρηση 22/9: 2. Περισσότερες από το ιστορικό πλήθος = εύρημα.
- Χρήστης χωρίς `last_login` (δεν υπάρχει η στήλη).
- Ο πίνακας `schema_migrations` ξεπερασμένος (βλ. §2).
- `docs/SECURITY.md`, `docs/AUDIT_ACCESS.md`: **ξεπερασμένα** (Μάιος 2026, εποχή Airtable) — όχι πηγή για ρόλους/κλειδιά.

## 9. Μετρήσεις της 22/9/2026 (σημείο αναφοράς, ΟΧΙ κανόνες — ξαναμέτρησε πριν κρίνεις)

`users` 18 λογαριασμοί / 5 ρόλοι, ~7 ενεργοί · `orders` ~192 · `national_orders` 12 · `dl_entries` από Excel 11.078 · `app_errors` χωρίς εγγραφή από 17/9 (άγνωστο αν υγεία ή βλάβη) · Cloudflare invocation logs ~50k/εβδομάδα · 36 πίνακες, RLS ενεργό με 0 policies (ο Worker μιλά με `service_role`, το RLS δεν προστατεύει τίποτα).

## 10. Άγνωστα (22/9/2026) — μην τα συμπληρώσεις με υπόθεση

- Ποια έκδοση του Worker τρέχει στην παραγωγή (τελευταίο γνωστό deploy 21/9 βράδυ).
- Γιατί το `app_errors` σιωπά από 17/9.
- Γιατί τα `console.error` του Worker δεν φαίνονται στα Cloudflare logs.
- Τι κάνει το iframe `weekly_pickups` στο άνοιγμα.
- Περιεχόμενο του branch `feat/demo-users`.
- Οι στήλες `order_id/truck_id/driver_id` της RAMP: μετρήθηκαν 0/30 στις 24/8· δεσμοί προστέθηκαν 7/9 — τρέχουσα κατάσταση θέλει μέτρηση.

## 11. Πώς μιλάς στον ιδιοκτήτη

Δεν είναι developer. Κάθε εύρημα: τι σημαίνει για τη δουλειά (ποιος ρόλος, ποια οθόνη, τι θα δει λάθος), πόσο σίγουρο είναι (ΓΕΓΟΝΟΣ / ΥΠΟΘΕΣΗ), και **ένα** επόμενο βήμα. Ελληνικά. Ποτέ «κανένα πρόβλημα» για κάτι που δεν ελέγχθηκε — «δεν ελέγχθηκε». Ποτέ ονόματα ανθρώπων.
