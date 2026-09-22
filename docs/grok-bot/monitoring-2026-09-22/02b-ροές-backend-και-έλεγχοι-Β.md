# 02b — Ροές backend & βάσης · Επίπεδο Β (σταθεροί έλεγχοι SQL)

Σύνταξη 22/9/2026 βράδυ · ερευνητής 2b του πακέτου «αυτόματη παρακολούθηση» · **μόνο ανάγνωση**: repo `main` (`worker/src/index.js` 4.805 γρ., `wrangler.toml`, `worker/migrations/`, `.github/workflows/`), ζωντανή βάση (`pg_trigger`, `pg_get_functiondef`, `pg_constraint`, `information_schema`, `pg_extension`), και τα `docs/grok-bot/02-έλεγχοι.md` + 2 reviews ροών 22/9. Κάθε SQL παρακάτω **έτρεξε μία φορά σήμερα** (SELECT, LIMIT) και η στήλη «22/9» είναι η μέτρηση. Τίποτα δεν εγκαταστάθηκε.

Συμβάσεις: ώρες ομάδας **05:30–14:30 Europe/Athens** (η βάση μετρά UTC — στα SQL χρησιμοποιείται `AT TIME ZONE 'Europe/Athens'`). Σοβαρότητα: **P1** = άμεσα (μήνυμα τη στιγμή) · **P2** = ίδια μέρα (πρωινή αναφορά 05:00) · **P3** = εβδομαδιαίο digest (Σάββατο). «Ουρά» = νούμερο εργασίας που πρέπει να **φαίνεται**, ποτέ κόκκινο.

---

## Μέρος 1 — Χάρτης backend

### 1.1 Ο σκελετός του Worker (`index_default.fetch`, γρ. 4737–4805)
1. `OPTIONS` → 204. 2. `Origin` εκτός `ALLOWED_ORIGIN` (μόνο `https://dimitrispetras21-del.github.io`) → **403** «Origin not allowed» — ισχύει για ΟΛΕΣ τις διαδρομές, και το `/health`. 3. Δρομολόγηση με `url.pathname`. 4. Ό,τι δεν ταιριάζει → **404**. **Δεν υπάρχει `scheduled()` export** — ο Worker δεν έχει καμία χρονοπρογραμματισμένη εργασία.

Ταυτότητα: `getCaller()` = `Authorization: Bearer <JWT>` → `jwtVerify(JWT_SECRET)`. Χωρίς/ληγμένο token → `null` → **401** σε κάθε προστατευμένη διαδρομή (JWT 8 ωρών από `/auth/login`).

### 1.2 Οι διαδρομές

| Διαδρομή | Ποιος (ρόλοι) | Γράφει | Καταγράφει | Σιωπηλά χάνει | Σφάλματα |
|---|---|---|---|---|---|
| `GET /health` | όλοι (χωρίς token) | — | — | — | 403 μόνο σε ξένο Origin |
| `POST /auth/login` | όλοι | — (RPC `verify_login`, bcrypt) | `console.error` μόνο αν το RPC πέσει | **Καμία εγγραφή αποτυχημένου login** — ούτε audit, ούτε app_errors | 400 κενά πεδία · 401 λάθος στοιχεία · 500 RPC |
| `GET /audit` | owner, management | — | — | — | 401/403 · 500 «AUDIT READ FAILED» |
| `POST /app-errors` | **οποιοσδήποτε με σωστό Origin, token προαιρετικό** (`actor` NULL χωρίς token) | `app_errors` (message/stack/page/user_agent/sw_version, κομμένα) | `console.error` «APP ERROR INSERT FAILED» | Χωρίς ρόλο, χωρίς έκδοση app | 403 χωρίς Origin · 400 · 500 |
| `GET /app-errors` | owner, management | — | — | — | 401/403/500 |
| `POST /v1/ai/messages` | κάθε ρόλος με token | — (proxy προς Anthropic, μοντέλα σε allow-list, `stream` αφαιρείται) | `console.error` αν λείπει το κλειδί ή πέσει το upstream | **Καμία καταγραφή χρήσης/κόστους AI** | 503 χωρίς κλειδί · 400 · 502 upstream |
| `GET/POST /api/locations` | `can(role,'locations',…)` | `locations` (5 πεδία) | `console.error` | — | 401/403/400/500 |
| `GET /print/pdf` | token | — (Browser Rendering, cache 60s) | `console.error` «PRINT PDF» | — | 501 χωρίς binding · 502 render |
| `GET /performance/delivery` | ανά `PERF_SCOPES[scope].roles` | — | — | Άγνωστο scope = **400 ρητά** (αρχή 1) | 400/403 |
| `/v0/<base>/<tableId>` (facade) | `PERMISSIONS[role][table] ∥ ['*']` — βλ. 1.3 | βλ. παρακάτω | βλ. παρακάτω | βλ. παρακάτω | 401 · 403 · 404 «Table not available» / «Record not found» · 400 «No writable fields» · 422 φίλτρο/σύνδεσμος · 500 |
| `/costs/*` | `COSTS_PERMS` | βλ. παρακάτω | `audit()` σε κάθε εγγραφή · `console.error` «COSTS …» | — | 400 (85 σημεία συνολικά) · 404 · 409 · 422 · 500 |
| `/pallets/*` | `PL_PERMS` | βλ. παρακάτω | `audit()` (create/update/delete/confirm/reverse/upload) | — | 400 · 404 · 409 (μόνο pending σβήνεται) · 500 |

**Facade `/v0` — τι γίνεται ανά μέθοδο**

| Μέθοδος | Χειριστής | Εγγραφή | Audit | Σιωπηλή απώλεια → `facade_unknown_fields` (RPC `log_unknown_field`, `ctx.waitUntil`, dedupe 60″/isolate, 20 labels/αίτημα) |
|---|---|---|---|---|
| GET λίστα | `handleFacadeGet` | — | όχι (οι αναγνώσεις ΔΕΝ καταγράφονται) | `kind='read'` (άγνωστο `fields[]`) · `kind='sort'` · `kind='filter'` (422 — η ΜΟΝΗ θορυβώδης διαδρομή, αλλά τα front `catch` και σιωπούν) |
| GET ένα | `handleFacadeGetOne` | — | όχι | — |
| POST | `handleFacadeCreate` / `facadeBatchCreate` | `INSERT` στον πίνακα Postgres, `legacy_id` νέο `rec…` | `create` (`auditMany` σε batch) | `kind='write'` — **το αίτημα επιστρέφει 201 ακόμη κι αν έπεσαν πεδία** |
| PATCH ένα | `handleFacadeUpdate` | `UPDATE … WHERE legacy_id` (χωρίς φίλτρο `deleted_at`) | `update` (before/after) | `kind='write'`, ίδιο: 200 με χαμένα πεδία |
| PATCH batch | `handleFacadeBatchUpdate` | ίδιο ×N | `update` ×N | ίδιο |
| DELETE | `handleFacadeDelete` | **soft-delete** (`deleted_at=now()`) | `delete` | — |
| DELETE ORDERS | `handleOrderCascadeDelete` | RPC `delete_order_cascade` (stops, NL, GL→Unassigned, CL, ramp, pallets) — **δικαίωμα PATCH, όχι DELETE** | `cascade_delete` με το summary | — |

Το `audit()`/`auditMany()` **ποτέ δεν μπλοκάρει**: αν το INSERT στο `audit_log` αποτύχει, γράφει `console.error("AUDIT WRITE FAILED")` και η απάντηση είναι επιτυχής — άρα «επιτυχία χωρίς audit» είναι εφικτή και ανιχνεύεται μόνο από τα console logs (βλ. Μέρος 3).

**`/costs/*` (COSTS_PERMS, γρ. 2967)** — resources: `lookups` GET · `settings` GET/PATCH(owner) · `rt` POST(idempotent attach)/GET/PATCH(status, dates, km, οχήματα — **κλείσιμο RT = `status:'closed'` από το front**)/DELETE `:id/legs`(αφαίρεση σκέλους, ποτέ RT) · `lines` POST/GET/PATCH/DELETE (PATCH/DELETE με υποχρεωτικό `reason`) · `ledger` GET/POST/PATCH/`import` (μισθοδοσία `dl_entries`, `dl_import_batches`) · `pnl` GET(owner) · `pallet-gate` GET · `import` `parse`/`commit`/`docs` (DKV → `ct_cost_docs`+`ct_cost_lines`). Ρόλοι: owner όλα · accountant rt GET/POST, lines όλα, ledger, import · dispatcher **μόνο** rt+lookups · management ανάγνωση + ledger εγγραφή · warehouse τίπoτα. Γράφουν: `ct_round_trips`, `ct_rt_legs`, `ct_cost_lines`, `ct_cost_docs`, `ct_settings`, `dl_entries`, `dl_import_batches`, `import_rules`/`scan_examples`. Λάθος `pay_source`/`category` → **400** (η βάση έχει CHECK — δεύτερη γραμμή άμυνας). `dl_cash_lock` της βάσης μεταφράζεται σε 400 με ελληνικό μήνυμα (`dlCashLockError`).

**`/pallets/*` (PL_PERMS, γρ. 4201)** — `movements` CRUD (DELETE μόνο pending → 409 αλλιώς) · `:id/confirm` · `:id/reverse` · `sheets` GET/POST · `balances` · `gate` GET (όλοι πλην management που έχει δικό του) · `override` POST **μόνο owner** · `lookups/search`. Γράφει `pl_movements`, `pl_sheets`. Οι `taken/given` ακέραιοι ≥ 0, `ADJUSTMENT` θέλει `reason` (400).

### 1.3 Ο κανόνας του wildcard (γρ. 602–606) — τρεις πίνακες, τρεις συμπεριφορές
```js
const tableRule = roleMap[table] || roleMap["*"];   // ΑΝΤΙΚΑΘΙΣΤΑ, δεν συγχωνεύει
```
- **`PERMISSIONS` (facade)**: owner `*` όλα · management/accountant `*: GET` + ρητές γραμμές · dispatcher/warehouse **χωρίς `*`** (ό,τι δεν είναι γραμμένο = 403). Συνέπεια: **νέος πίνακας** ανοίγει αυτόματα σε ανάγνωση σε management/accountant, κλείνει σε dispatcher· **ρητή γραμμή που ξεχνά μέθοδο** την αφαιρεί (το 403 του accountant στα `order_stops` 11/9).
- **`COSTS_PERMS` / `PL_PERMS`**: `ctCan`/`plCan` = `r[resource].includes(method)` — **κανένα wildcard**, ό,τι λείπει = 403. Ο ίδιος ρόλος υπακούει σε τρεις διαφορετικούς κανόνες ανάλογα με το prefix (αρχή 3: τρεις πηγές αλήθειας).
- Φρουρός των τριών (CLAUDE.md): `dispatcher.order_stops` έχει DELETE ✅ · `"VS CD Date": "cross_dock_date"` στο `main` ✅ (δεν επαληθεύτηκε στο deployed bundle — θέλει CF token) · 4 πεδία WORKSHOPS ✅.

### 1.4 Triggers ζωντανοί στη βάση — 23 (`pg_trigger`, `tgisinternal=false`, όλοι `tgenabled='O'`)

| Πίνακας | Trigger | Πότε | Τι κάνει (από `pg_get_functiondef`) | Migration |
|---|---|---|---|---|
| orders | `rt_create_from_order` | AFTER INS/UPD | Ανάθεση (truck ή partner) σε μη-ακυρωμένη, μη-γονική παραγγελία → δημιουργεί/προσαρτά RT (`ct_round_trips`+`ct_rt_legs`), audit `rt_sync_audit` | 031+033 ✅ |
| orders | `rt_sync_from_order` | AFTER UPD | Αλλαγή οδηγού/φορτηγού/partner ή ακύρωση/διαγραφή → ενημερώνει RT ή σβήνει σκέλος + `rt_recompute` | 013 ✅ |
| orders | `rt_link_split` | AFTER UPD | Παραγγελία με RT που δένεται (group/matched_import/rotation) με άλλη σε ΑΛΛΟ RT → συγχώνευση ή audit «split» (`after_data->>'split'`) | 037 ✅ |
| orders | `order_dates_follow` | AFTER UPD | Μετακίνηση loading/delivery → μετακινεί τα `order_stops` κατά την ίδια διαφορά, audit `trigger:order_dates_follow` | **028 — ΖΩΝΤΑΝΟ** |
| orders | `national_load_follow_order` | AFTER UPD | VS: order Cancelled/Delivered (Export: και In Transit) → `national_loads.status`, audit `trigger:national_load_follow` | 030_national_load_follow ✅ |
| orders | `order_soft_delete_unlink` | AFTER UPD | Soft-delete → μηδενίζει `matched_import_id`/`rotation_id` που δείχνουν σε αυτήν, σβήνει σκέλη, audit `trigger:order_unlink` | 023 ✅ |
| orders | `order_leg_depth` / `order_leg_inherit` | BEFORE INS(/UPD) | Σκέλος split: απαγορεύει βάθος > 1, κληρονομεί client/direction | 018 |
| orders | `order_leg_status_sync` / `order_legs_to_parent` / `order_parent_to_legs` | AFTER | Γονέας ↔ σκέλη: status, ημερομηνίες άκρων, στοιχεία φορτίου (`order_legs_audit`) | 020 |
| orders, national_orders | `*_invoice_mark_guard` | BEFORE INS/UPD | `invoiced=true` (νέο ή αλλαγή αριθμού/τιμής) χωρίς `invoice_number` ή `price<=0` → **exception** (`check_violation`) | 043 ✅ |
| national_orders | `trg_national_orders_soft_delete_cascade` | AFTER UPD | Soft-delete → `national_loads`, `order_stops` | 022/023 |
| national_loads | `trg_national_loads_soft_delete_cascade` | AFTER UPD | Soft-delete → `order_stops`, `local_moves`, `ramp` | 022 ✅ |
| national_loads | `national_load_soft_delete_unlink` | AFTER UPD | Λύνει `matched_load` άλλων φορτίων, audit | 023 |
| ct_round_trips | `rt_sync_to_orders` | AFTER UPD | Αλλαγή οχήματος/οδηγού στο RT → σε ΟΛΕΣ τις παραγγελίες-σκέλη, audit | 013 ✅ |
| ct_round_trips | `dl_sync_from_rt` | AFTER INS/UPD | OWNED με οδηγό → γραμμή `dl_entries` (`source='auto'`)· χωρίς οδηγό → ακυρώνει ή `needs_review` αν έχει ποσά | 011 ✅ |
| ct_rt_legs | `rt_sync_legs` | AFTER INS/DEL | Νέο σκέλος: το RT παίρνει όχημα από την παραγγελία ή η παραγγελία από το RT· DELETE → `rt_recompute` | 013 ✅ |
| ct_rt_legs | `rt_reopen_on_leg` | AFTER INS/UPD | Σκέλος σε closed/complete RT με παραγγελία όχι Delivered/Cancelled → RT `planned`, `closed_at=NULL`, audit «reopened … (045)» | **045 ✅ (ζωντανό)** |
| ct_cost_lines | `dl_cash_sync_line` | AFTER INS/UPD/DEL | Γραμμή CASH → `dl_cash_sync(rt_id)` = Σ CASH στο `dl_entries.expenses` (`expenses_auto`) | 042 ✅ |
| dl_entries | `dl_cash_lock` | BEFORE UPD | Χειροκίνητο `expenses` σε RT με γραμμές CASH → exception (παρακάμπτεται μόνο με `dl.cash_sync='1'`) | 042 ✅ |
| dl_entries | `dl_cash_sync_entry` | AFTER INS/UPD | Νέα trip-γραμμή → ξανασυγχρονίζει τα μετρητά | 042 ✅ |

**Δεν υπάρχουν audit triggers** στη βάση: το `audit_log` γράφεται μόνο από τον Worker (`audit()`) και από τα sync triggers (`rt_sync_audit`, `trigger:*`). Εγγραφή απευθείας στη βάση (SQL editor, PostgREST με service key) **δεν αφήνει ίχνος** εκτός αν περάσει από trigger.

### 1.5 «Το main λέει» vs «η βάση έχει» — ασυμφωνίες κεφαλίδων migrations

| Migration | Κεφαλίδα στο main | Ζωντανή βάση | Συμπέρασμα |
|---|---|---|---|
| 028_order_dates_follow | χωρίς STATUS· CLAUDE.md: «028, εκκρεμεί» | trigger `order_dates_follow` **ζωντανός** | **CLAUDE.md παλιό** — η μετακίνηση ημερομηνιών ΙΣΧΥΕΙ |
| 030_fuel_lines | «DRAFT — NOT EXECUTED» | στήλες `liters`, `km_reading`, `station`, `fuel_source` + CHECK `ct_line_fuel_source_chk` **υπάρχουν** | **Κεφαλίδα ψεύδεται** — εκτελέστηκε |
| 032_pay_source | «DRAFT — NOT EXECUTED» | `pay_source` + CHECK υπάρχουν (η 040 το έκανε NOT NULL) | Κεφαλίδα ψεύδεται |
| 035_pay_source_credit | «DRAFT — NOT EXECUTED» | CHECK περιέχει `'CREDIT'` | Κεφαλίδα ψεύδεται (μνήμη 16/9: «035 ΕΓΙΝΕ») |
| 036_cost_docs_vat_refund | «DRAFT — NOT EXECUTED» | `ct_cost_docs.vat_refund numeric` **υπάρχει** | Κεφαλίδα ψεύδεται |
| 034_rt_create_national | «ΔΕΝ ΕΓΚΡΙΘΗΚΕ» | κανένα trigger στο `national_loads` για RT | Συμφωνεί (εθνικά RT δεν αυτο-δημιουργούνται) |
| 044 (drafts) ops_status CHECK | DRAFT | 0 CHECK με `ops_status` | Συμφωνεί |
| 045_rt_reopen_on_leg | «ΕΚΤΕΛΕΣΤΗΚΕ 22/9» (η MEMORY.md λέει ακόμη «DRAFT, owner εκτελεί») | ζωντανό | Συμφωνεί με το αρχείο, **η μνήμη έμεινε πίσω** |

Πέντε κεφαλίδες «DRAFT» για πράγματα που ζουν στην παραγωγή — αρχή 8 (ο νεκρός κώδικας λέει ψέματα). Πρόταση για τον έλεγχο Η4 του `02`: **η πηγή είναι το `pg_catalog`, ποτέ η κεφαλίδα.**

### 1.6 Χρονοπρογραμματισμένη εργασία — ΚΑΜΙΑ
- `pg_cron`: **δεν είναι εγκατεστημένο** (`pg_extension` χωρίς `pg_cron`/`pg_net`, δεν υπάρχει schema `cron`).
- `wrangler.toml`: **χωρίς `[triggers] crons`**· ο Worker δεν εξάγει `scheduled()`.
- `.github/workflows/code-guards.yml`: μόνο `on: push/pull_request` (`tests/check-fail-open.sh`) — **χωρίς `schedule:`**.
- Το «ramp autosync» και το κλείσιμο RT τρέχουν **μόνο όταν ανοίξει κάποιος την οθόνη** (daily_ramp render, `rtOnOrderSaved`). Αν κανείς δεν ανοίξει την οθόνη, τίποτα δεν συμβαίνει — και τίποτα δεν το λέει.

---

## Μέρος 2 — Επίπεδο Β: κατάλογος σταθερών ελέγχων

Μεγέθη 22/9 (`n_live_tup`): orders 223 · ct_round_trips 116 · ct_rt_legs 195 · dl_entries 11.178 · ct_cost_lines 641 · pl_movements 135 · national_loads 64 · groupage_lines 2 · ramp 85 · order_stops 783 · locations 1.252 · audit_log 6.519 · app_errors 1.533 · facade_unknown_fields 281. **Όλα < 10 MB.** Ο ακριβότερος έλεγχος (Β-07, EXPLAIN ANALYZE) = **0,5 ms**. Ολόκληρος ο κατάλογος < 100 ms ανά run — το κόστος είναι μηδενικό, ο κίνδυνος είναι μόνο ο θόρυβος.

Κανόνες κατά των ψευδών συναγερμών (ισχύουν σε όλα): (α) **κλειδί ειδοποίησης** = `check_id + record_id`, ένα μήνυμα ανά κλειδί μέχρι να πρασινίσει· (β) **ανοχή ηλικίας** σε ό,τι γράφεται από trigger/front σε δεύτερο βήμα· (γ) **ουρές** συγκρίνονται με χθες (Δ > +20 % = κίτρινο), ποτέ κόκκινο· (δ) ένα κόκκινο που **επιμένει 3 runs** ανεβαίνει επίπεδο, ένα που εμφανίστηκε μία φορά και χάθηκε γράφεται μόνο στο digest.

### Α. Ανάθεση → Round trip → Μισθοδοσία

**Β-01 · assigned_no_live_rt** — ροή 033/rt-feed · **P1** · κάθε 15′ (05:00–15:00) · 22/9: **0**
```sql
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status IN ('Assigned','In Transit','Delivered') AND o.parent_order_id IS NULL
 AND (o.truck_id IS NOT NULL OR (coalesce(o.is_partner_trip,false) AND o.partner_id IS NOT NULL))
 AND NOT EXISTS (SELECT 1 FROM orders c WHERE c.parent_order_id=o.id AND c.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN ct_round_trips r ON r.id=l.rt_id WHERE l.order_id=o.id AND r.status<>'cancelled')
 AND coalesce(o.assigned_at,o.created_at) < now()-interval '15 minutes';
```
Αναμ. **0** · Εξαιρ.: γονείς split (τα σκέλη έχουν το RT), Cancelled · Ανοχή 15′ (ο trigger είναι σύγχρονος, η ανοχή καλύπτει το front που γράφει σε δύο PATCH) · Ψευδ.: παραγγελία χωρίς όχημα αλλά `is_partner_trip` χωρίς partner — δεν μετρά (ίδιος όρος με τον trigger).

**Β-02 · closed_rt_open_leg** — ροή 045 · **P2** · ωριαία · 22/9: **0**
```sql
SELECT count(DISTINCT r.id) FROM ct_round_trips r JOIN ct_rt_legs l ON l.rt_id=r.id JOIN orders o ON o.id=l.order_id
 WHERE r.status IN ('closed','complete') AND o.deleted_at IS NULL AND o.status NOT IN ('Delivered','Cancelled');
```
Αναμ. 0 · Εξαιρ.: σκέλη `nat_load_id` (χωρίς status παραγγελίας) · Ψευδ.: παραγγελία που γύρισε από Delivered σε In Transit — είναι ακριβώς αυτό που θέλουμε να δούμε.

**Β-03 · planned_all_delivered_old** — «ξεχασμένα ανοιχτά» (review RT #3) · **ουρά, P3 digest** · ημερήσιο · 22/9: **23**
```sql
SELECT count(*) FROM ct_round_trips r WHERE r.status IN ('planned','in_progress')
 AND EXISTS (SELECT 1 FROM ct_rt_legs l WHERE l.rt_id=r.id AND l.order_id IS NOT NULL)
 AND NOT EXISTS (SELECT 1 FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id WHERE l.rt_id=r.id AND o.deleted_at IS NULL AND o.status NOT IN ('Delivered','Cancelled'))
 AND (SELECT max(coalesce(o.actual_delivery_date,o.delivery_datetime)) FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id WHERE l.rt_id=r.id) < current_date-3;
```
Το κλείσιμο ζει μόνο στο front (`rtOnOrderSaved`) — μέχρι το DRAFT 046 το νούμερο δεν θα πέσει μόνο του. (Το review μέτρησε 28 με χαλαρότερο ορισμό.)

**Β-04 · owned_driver_no_dl** — 011 · **P2** · ημερήσιο 05:00 · 22/9: **0**
```sql
SELECT count(*) FROM dl_v_rt_gap;
```
Εξαιρ.: PARTNER RT και RT χωρίς οδηγό **δεν** έχουν μισθοδοσία by design (011) — η όψη τα εξαιρεί. Δεν πιάνει «άδεια» γραμμή (`trip_value IS NULL`) — αυτό είναι ουρά καταχώρισης, όχι ελάττωμα.

**Β-05 · rt_two_drivers** — 013 · **P2** · ωριαία · 22/9: **0**
```sql
SELECT count(*) FROM (SELECT l.rt_id FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id JOIN ct_round_trips r ON r.id=l.rt_id
 WHERE o.deleted_at IS NULL AND r.status<>'cancelled' AND o.driver_id IS NOT NULL GROUP BY l.rt_id HAVING count(DISTINCT o.driver_id)>1) x;
```

**Β-06 · rt_vehicle_drift** — 013 (`rt_sync_to_orders`/`rt_sync_from_order`) · **P2** · ωριαία · 22/9: **0**
```sql
SELECT count(*) FROM ct_rt_legs l JOIN orders o ON o.id=l.order_id JOIN ct_round_trips r ON r.id=l.rt_id
 WHERE o.deleted_at IS NULL AND r.status<>'cancelled' AND o.status<>'Cancelled'
 AND (o.truck_id IS DISTINCT FROM r.truck_id OR o.driver_id IS DISTINCT FROM r.driver_id);
```
Ανοχή: καμία (σύγχρονοι triggers)· αν βγει > 0 κάποιος έγραψε **παρακάμπτοντας** τα triggers (SQL editor) ή ένας trigger απενεργοποιήθηκε.

**Β-07 · dl_cash_mismatch** — 042 · **P1** (λεφτά οδηγού) · ωριαία · 22/9: **0** · κόστος 0,5 ms
```sql
SELECT count(*) FROM (SELECT l.rt_id, sum(l.net+coalesce(l.vat,0)) s FROM ct_cost_lines l WHERE l.pay_source='CASH' AND l.rt_id IS NOT NULL GROUP BY 1) c
 JOIN dl_entries e ON e.rt_id=c.rt_id AND e.entry_type='trip' AND e.deleted_at IS NULL WHERE abs(coalesce(e.expenses,0)-c.s)>0.01;
```
Εξαιρ.: γραμμές CASH χωρίς `rt_id` (Β-23) — δεν φτάνουν ποτέ στη μισθοδοσία.

**Β-08 · dl_needs_review** — 042/011 · **ουρά, P3** · ημερήσιο · 22/9: **5**
```sql
SELECT count(*) FROM dl_entries WHERE needs_review AND deleted_at IS NULL;
```

**Β-09 · dl_auto_orphan** — 011 · **P2** · ημερήσιο · 22/9: **0**
```sql
SELECT count(*) FROM dl_entries d WHERE d.entry_type='trip' AND d.source='auto' AND d.deleted_at IS NULL
 AND (d.rt_id IS NULL OR EXISTS (SELECT 1 FROM ct_round_trips r WHERE r.id=d.rt_id AND r.status='cancelled'));
```
Εξαιρ.: `source='excel'` (ιστορικό 6/9, 11.078 γραμμές, χωρίς RT — **ποτέ** στον έλεγχο).

**Β-10 · stale_planned_rt** — · **P3 digest** · εβδομαδιαίο · 22/9: **6** (RT-1017 έως 19/8, RT-1015, 4× 7/9)
```sql
SELECT count(*) FROM ct_round_trips WHERE status='planned' AND date_end < current_date-14;
```

### Β. Τιμολόγηση

**Β-11 · invoiced_no_number** — 043 · **P1** αν > 2 · ωριαία · 22/9: **2** (orders) + **0** (national_orders)
```sql
SELECT (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND invoiced AND coalesce(btrim(invoice_number),'')='')
     + (SELECT count(*) FROM national_orders WHERE deleted_at IS NULL AND invoiced AND coalesce(btrim(invoice_number),'')='');
```
Εξαιρ.: **ακριβώς 2 = ΙΣΤΟΡΙΚΟ 21/8** (owner: ανέγγιχτες)· κόκκινο μόνο σε **αύξηση** — ο trigger 043 το απαγορεύει, άρα > 2 σημαίνει ότι ο trigger έπεσε ή κάποιος έγραψε με SQL. Καλύτερα: αποθήκευσε τα 2 ids και μέτρα `id NOT IN (…)` = 0.

**Β-12 · invoiced_no_price** — 043 · **P1** · ωριαία · 22/9: **0**
```sql
SELECT count(*) FROM orders WHERE deleted_at IS NULL AND invoiced AND coalesce(price,0)<=0;
```

**Β-13 · delivered_no_price_3d** — review τιμολόγησης Ε1 · **P2** (ουρά dispatcher με όριο) · ημερήσιο 05:00 · 22/9: **24**
```sql
SELECT count(*) FROM orders WHERE deleted_at IS NULL AND status='Delivered' AND coalesce(price,0)<=0 AND parent_order_id IS NULL
 AND coalesce(actual_delivery_date,delivery_datetime) < current_date-3;
```
Εξαιρ.: σκέλη split (ο γονέας κρατά την τιμή)· VS εθνικό σκέλος δεν τιμολογείται (ζει σε `national_loads`, όχι εδώ). Ψευδ.: `price=0` για δωρεάν μεταφορά — δεν υπάρχει τέτοια κατηγορία σήμερα· αν εμφανιστεί, θέλει στήλη, όχι εξαίρεση.

**Β-14 · negative_money** — υγιεινή · **P2** · ημερήσιο · 22/9: **0** (το id 335 με −2 της 21:30 διορθώθηκε)
```sql
SELECT (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND (price<0 OR partner_rate<0))
     + (SELECT count(*) FROM ct_cost_lines WHERE net<0 AND category<>'restatement')
     + (SELECT count(*) FROM pl_movements WHERE taken<0 OR given<0);
```
Εξαιρ.: `restatement` (αναμόρφωση, owner 21/9) μπορεί να είναι αρνητική.

**Β-15 · delivered_not_invoiced_30d** — ουρά λογίστριας · **ουρά, P3** · ημερήσιο · 22/9: **58** (σύνολο ατιμολόγητων Delivered: 179)
```sql
SELECT count(*) FROM orders WHERE deleted_at IS NULL AND status='Delivered' AND invoiced IS NOT TRUE AND parent_order_id IS NULL
 AND coalesce(actual_delivery_date,delivery_datetime) < current_date-30;
```
Κίτρινο μόνο αν Δ > +20 % από την προηγούμενη εβδομάδα. Εξαιρ.: ό,τι μπλοκάρει η πύλη παλετών (Β-16) — μετριέται χωριστά.

### Γ. Πύλη παλετών

**Β-16 · pe_gate_blocked** — 007/009, κλειδωμένο «ποτέ cutoff» (25/8) · **ουρά, P3** · ημερήσιο · 22/9: **63**
```sql
SELECT count(*) FROM pl_v_order_gate g JOIN orders o ON o.id=g.order_id
 WHERE NOT g.sheets_ok AND o.deleted_at IS NULL AND o.status='Delivered' AND o.invoiced IS NOT TRUE AND coalesce(o.pallet_exchange,false);
```
Δεν πιάνει παραγγελίες PE **χωρίς καμία στάση φόρτωσης** (λείπουν από την όψη) — συμπληρωματικό: `count(*) FROM orders o WHERE pallet_exchange AND NOT EXISTS (SELECT 1 FROM order_stops s WHERE s.order_id=o.id AND s.stop_type='Loading' AND s.deleted_at IS NULL)`.

**Β-17 · pl_pending_7d** — · **ουρά, P3** · ημερήσιο · 22/9: **44** (σύνολο pending 51)
```sql
SELECT count(*) FROM pl_movements WHERE status='pending' AND movement_date < current_date-7;
```

**Β-18 · pl_integrity** — «ποτέ δεν σβήνεται» (003) · **P2** · ημερήσιο · 22/9: **0 + 0**
```sql
SELECT (SELECT count(*) FROM pl_movements WHERE status='confirmed' AND (confirmed_at IS NULL OR confirmed_by IS NULL))
     + (SELECT count(*) FROM pl_movements m WHERE m.reversal_of IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pl_movements o WHERE o.id=m.reversal_of));
```
Συμπλήρωμα: `count(*)` του πίνακα **δεν πρέπει ποτέ να μειώνεται** μεταξύ runs (αποθήκευση χθεσινού)· ο Worker σβήνει μόνο pending (409 αλλιώς).

**Β-19 · delivered_stop_no_stamp** — Daily Ops (accountant 403 11/9) · **P3** · ημερήσιο · 22/9: **2**
```sql
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status='Delivered' AND coalesce(o.actual_delivery_date,o.delivery_datetime) >= date '2026-09-06'
 AND EXISTS (SELECT 1 FROM order_stops s WHERE s.order_id=o.id AND s.deleted_at IS NULL AND s.stop_type='Unloading' AND s.completed_at IS NULL);
```
Εξαιρ.: παραδόσεις πριν 6/9 (backfill 029 μερικό) — γι' αυτό το όριο ημερομηνίας.

### Δ. Έξοδα / DKV

**Β-20 · pay_source_null** — 040 · **P1** (constraint έπεσε) · ημερήσιο · 22/9: **0**
```sql
SELECT count(*) FROM ct_cost_lines WHERE pay_source IS NULL;
```

**Β-21 · doc_totals** — E-SUMMARY (024/038/041) · **P2** · ημερήσιο + μετά από κάθε `import/commit` · 22/9: **0 + 0** (4 docs)
```sql
SELECT (SELECT count(*) FROM ct_cost_docs d WHERE d.status<>'rejected' AND abs(coalesce(d.total_gross,0)-(SELECT coalesce(sum(net+coalesce(vat,0)),0) FROM ct_cost_lines l WHERE l.doc_id=d.id))>0.01)
     + (SELECT count(*) FROM ct_cost_docs d WHERE d.lines_total IS NOT NULL AND d.lines_total <> (SELECT count(*) FROM ct_cost_lines l WHERE l.doc_id=d.id)+coalesce(d.lines_deleted,0));
```
Εξαιρ.: `status='draft'` (parse χωρίς commit) — σήμερα `confirmed,draft`· το draft ίσως έχει 0 γραμμές, εξαίρεσέ το αν θορυβεί. **Το PDF είναι η αλήθεια**, όχι το `total_gross`.

**Β-22 · lines_no_rt_14d** — ουρά Αλεξίας · **ουρά, P3** · ημερήσιο · 22/9: **160** (σύνολο χωρίς RT 164)
```sql
SELECT count(*) FROM ct_cost_lines WHERE rt_id IS NULL AND line_date < current_date-14;
```
Εξαιρ.: τέλη DKV χωρίς φορτηγό (fees ανά έγγραφο) — μεγάλο μέρος των 160· χρειάζεται `category` breakdown στο digest, όχι ένα νούμερο.

**Β-23 · cash_no_rt** — 042 (δεν φτάνει στη μισθοδοσία) · **P2** · ημερήσιο · 22/9: **0**
```sql
SELECT count(*) FROM ct_cost_lines WHERE pay_source='CASH' AND rt_id IS NULL;
```

**Β-24 · dkv_dup_after_038** — 038 · **P2** · μετά από κάθε commit + ημερήσιο · 22/9: **0**
```sql
SELECT count(*) FROM (SELECT doc_id, rt_id, coalesce(toll_country,'') tc FROM ct_cost_lines
 WHERE doc_id IS NOT NULL AND rt_id IS NOT NULL AND category IN ('tolls','dkv') GROUP BY 1,2,3 HAVING count(*)>1) x;
```
⚠️ **Χωρίς `rt_id IS NOT NULL` δίνει 12** (γραμμές χωρίς RT ομαδοποιούνται μαζί — ψευδές διπλό). Το `02` το είχε ΓΚΡΙ· τώρα μετρήθηκε.

**Β-25 · line_date_outside_rt** — αντιστοίχιση σε λάθος δρομολόγιο · **P3** · ημερήσιο · 22/9: **2** (μόνο καύσιμα/διόδια ±5 ημ.)
```sql
SELECT count(*) FROM ct_cost_lines l JOIN ct_round_trips r ON r.id=l.rt_id
 WHERE l.category IN ('fuel','reefer_fuel','tolls','adblue') AND l.line_date IS NOT NULL AND r.date_start IS NOT NULL
 AND (l.line_date < r.date_start-5 OR l.line_date > coalesce(r.date_end,r.date_start)+5);
```
Εξαιρ.: `dkv` (μηνιαία τέλη, 35 εκτός παραθύρου — νόμιμα), `accommodation`, `other`. Με ±2 ημ. και όλες τις κατηγορίες βγαίνει 50 — θόρυβος.

### Ε. Veroia Switch / Groupage / Ράμπα

**Β-26 · vs_no_national_load** — sync chain · **P1** · κάθε 15′ (ώρες εργασίας) · 22/9: **0**
```sql
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.veroia_switch AND o.status<>'Cancelled' AND o.created_at < now()-interval '15 minutes'
 AND NOT EXISTS (SELECT 1 FROM national_loads nl WHERE nl.source_order_id=o.id AND nl.deleted_at IS NULL);
```
Ανοχή 15′: το NL γράφεται από το **front** (`order-sync.js`) σε δεύτερο αίτημα — αν ο χρήστης κλείσει τη σελίδα ανάμεσα, μένει ορφανό· αυτό ακριβώς πιάνει ο έλεγχος. `national_orders` άδειο = σωστό (23/8), δεν ελέγχεται.

**Β-27 · vs_nl_status_lag** — trigger 030 · **P2** · ωριαία · 22/9: **5 → 0 με εξαίρεση**
```sql
SELECT count(*) FROM orders o JOIN national_loads nl ON nl.source_order_id=o.id AND nl.deleted_at IS NULL AND nl.source_type='Direct'
 WHERE o.deleted_at IS NULL AND o.veroia_switch AND coalesce(o.actual_delivery_date,o.delivery_datetime) >= date '2026-09-13'
 AND ((o.status='Cancelled' AND nl.status<>'Cancelled') OR (o.status='Delivered' AND nl.status NOT IN ('Delivered','Cancelled')));
```
Εξαιρ.: **5 παραγγελίες Import παραδομένες 9–11/9** (ids 275, 281, 302, 306, 309 → NL 77/82/83/84/87 «Assigned») — πριν εγκατασταθεί ο trigger 13/9· ΙΣΤΟΡΙΚΟ, ουρά για owner (εφάπαξ SQL). Το φίλτρο ημερομηνίας τα εξαιρεί.

**Β-28 · vs_consistency** — Ε1–Ε3 του `02` · **P2** · ημερήσιο · 22/9: **0 + 0**
```sql
SELECT (SELECT count(*) FROM national_loads nl JOIN orders o ON o.id=nl.source_order_id WHERE nl.deleted_at IS NULL AND o.deleted_at IS NOT NULL)
     + (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND veroia_switch AND cross_dock_date IS NULL AND status<>'Cancelled');
```

**Β-29 · groupage_lines_never_deleted** — κανόνας never-delete (FK RESTRICT) · **P1** αν μειωθεί · ημερήσιο · 22/9: total **2**, deleted **0**, ασυνέπειες **0**
```sql
SELECT (SELECT count(*) FROM groupage_lines) AS total,
       (SELECT count(*) FROM groupage_lines WHERE deleted_at IS NOT NULL) AS soft_deleted,
       (SELECT count(*) FROM groupage_lines g LEFT JOIN consolidated_loads c ON c.id=g.cons_load_id WHERE g.deleted_at IS NULL AND g.status='Assigned' AND (g.cons_load_id IS NULL OR c.deleted_at IS NOT NULL)) AS assigned_dead_cl;
```
Κόκκινο: `total` < χθεσινό **ή** `assigned_dead_cl` > 0. Θέλει αποθήκευση χθεσινής τιμής (schema `monitoring`, βλ. `02` §Αποθήκευση).

**Β-30 · ramp_links** — Ε4 + cascade 022 · **P2** · ημερήσιο · 22/9: **0 + 0**
```sql
SELECT (SELECT count(*) FROM ramp WHERE created_at>now()-interval '7 days' AND deleted_at IS NULL AND order_id IS NULL AND national_load_id IS NULL AND national_order_id IS NULL)
     + (SELECT count(*) FROM ramp r LEFT JOIN orders o ON o.id=r.order_id LEFT JOIN national_loads nl ON nl.id=r.national_load_id
        WHERE r.deleted_at IS NULL AND ((r.order_id IS NOT NULL AND o.deleted_at IS NOT NULL) OR (r.national_load_id IS NOT NULL AND nl.deleted_at IS NOT NULL)));
```
Εξαιρ.: 44 παλιές ράμπες χωρίς δεσμό (πριν 6/9) — το `created_at` τις κόβει.

**Β-31 · vs_next3d_no_ramp** — ramp autosync τρέχει μόνο στο render · **P3** (πληροφορία 05:00) · ημερήσιο · 22/9: **2** (ids 365, 369 για 23/9)
```sql
SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.veroia_switch AND o.status NOT IN ('Cancelled','Delivered')
 AND o.cross_dock_date BETWEEN current_date-1 AND current_date+3
 AND NOT EXISTS (SELECT 1 FROM ramp r WHERE r.deleted_at IS NULL AND (r.order_id=o.id OR r.national_load_id IN (SELECT id FROM national_loads WHERE source_order_id=o.id AND deleted_at IS NULL)));
```
Ψευδ.: **αναμενόμενο** > 0 το πρωί πριν ανοίξει κανείς τη Ράμπα· κόκκινο μόνο αν παραμένει > 0 στις 07:00 (η βάρδια ξεκίνησε 05:30 και κανείς δεν άνοιξε την οθόνη = ή δεν δουλεύει η ράμπα ή δεν δουλεύει το autosync).

### ΣΤ. Υγιεινή δεδομένων

**Β-32 · data_hygiene** — · **P3 digest** · εβδομαδιαίο · 22/9: dates_reversed **0** · inactive_refs **0** · nonlatin **23**
```sql
SELECT (SELECT count(*) FROM orders WHERE deleted_at IS NULL AND loading_datetime>delivery_datetime) AS dates_reversed,
       (SELECT count(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status NOT IN ('Cancelled','Delivered')
          AND (EXISTS (SELECT 1 FROM trucks t WHERE t.id=o.truck_id AND (t.deleted_at IS NOT NULL OR t.active IS FALSE))
            OR EXISTS (SELECT 1 FROM drivers d WHERE d.id=o.driver_id AND (d.deleted_at IS NOT NULL OR d.active IS FALSE)))) AS inactive_refs,
       (SELECT count(*) FROM locations WHERE deleted_at IS NULL AND (name ~ '[Α-Ωα-ωΆ-ώ]' OR city ~ '[Α-Ωα-ωΆ-ώ]')) AS nonlatin;
```
«Νεκροί σύνδεσμοι» (`orders.truck_id` εκτός `trucks`) **δεν γίνονται**: όλα FK στη βάση — μετριέται αντ' αυτού η αναφορά σε **ανενεργό/διαγραμμένο** όχημα/οδηγό. Nonlatin: 23 (π.χ. «Χρυσανίδη, Αφοί, Α.Ε.», «Α.Σ. ΑΝΟΔΟΣ») — ΙΣΤΟΡΙΚΟ μετά τη μετατροπή 9/8, ουρά καθαρισμού· κόκκινο μόνο σε **αύξηση** (νέα εγγραφή με ελληνικά).

### Ζ. Σιωπή και σφάλματα μηχανισμού

**Β-33 · unknown_fields_write_24h** — παγίδα #1 του facade · **P2** (P1 μετά από deploy) · ωριαία · 22/9: **0** (και read/sort/filter: 0)
```sql
SELECT table_name, field_label, method, role, count FROM facade_unknown_fields WHERE last_seen>now()-interval '24 hours' AND kind='write' ORDER BY count DESC LIMIT 20;
```
Κλειδί dedupe: `(table_name, field_label)` — η βάση ήδη συμπτύσσει ανά ημέρα (008). Μία γραμμή = μία φόρμα που **δείχνει επιτυχία και δεν γράφει**.

**Β-34 · app_errors_24h** — `POST /app-errors` · **P2** αν > 5 ή νέο μήνυμα · ωριαία · 22/9: **11** (τελευταίο πριν 6 ώρες)
```sql
SELECT left(message,70) msg, count(*) n, max(created_at) last FROM app_errors WHERE created_at>now()-interval '24 hours' GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```
22/9: 8× «API retry exhausted: signal is aborted without reason», 3× «safeFetch: dashboard alerts: national loads: signal is aborted» — **timeouts/abort, όχι ελάττωμα κώδικα**. Εξαιρ.: «Permission denied» (χρήστης χωρίς δικαίωμα). Ψευδ.: dedupe ανά `left(message,40)`· «νέο» = μήνυμα που δεν υπήρχε τις προηγούμενες 7 ημέρες. Σημείωση: το `02` έγραψε «ΓΚΡΙ, 5 ημέρες σιωπή» — σήμερα ρέει ξανά.

**Β-35 · audit_silence_work_hours** — «η γραμμή είναι νεκρή» · **P1** · κάθε 30′ · 22/9: τελευταία εγγραφή πριν **14′**, 24h: dispatcher 123 · owner 43 · system 22
```sql
SELECT now()-max(created_at) AS silence,
       (extract(isodow FROM (now() AT TIME ZONE 'Europe/Athens')) BETWEEN 1 AND 6
        AND (now() AT TIME ZONE 'Europe/Athens')::time BETWEEN '06:30' AND '14:30') AS in_shift
FROM audit_log;
```
Κόκκινο: `in_shift AND silence > 90 minutes`. Εκτός βάρδιας/Κυριακή: μόνο ΓΚΡΙ. Ψευδ.: αργία — λίστα αργιών στο `monitoring` (χωρίς αυτήν, 4–5 ψευδή/έτος, αποδεκτό). Το Σάββατο η ομάδα δουλεύει (εβδομάδα TMS = Σάββατο) — γι' αυτό isodow ≤ 6.

**Β-36 · trigger_events_24h** — 037/045 ορατότητα · **P2 πληροφορία** · ημερήσιο · 22/9: split **0** · reopen **0**
```sql
SELECT count(*) FILTER (WHERE (after_data->>'split')='true') AS splits,
       count(*) FILTER (WHERE table_name='ct_round_trips' AND after_data->>'reason' LIKE 'reopened:%') AS reopens
FROM audit_log WHERE created_at>now()-interval '24 hours';
```
Κάθε > 0 μπαίνει **ονομαστικά** στην πρωινή αναφορά (ποιο RT, ποια παραγγελία) — δεν είναι σφάλμα, είναι γεγονός που κάποιος πρέπει να δει.

**Β-37 · jwt_401_bursts — ΚΕΝΟ.** Δεν υπάρχει πηγή: τα CF invocation logs κλείστηκαν 22/9 (P1 header), ο Worker δεν γράφει δική του γραμμή αιτήματος, το `/auth/login` δεν καταγράφει αποτυχίες. Μένει ΓΚΡΙ μέχρι: (α) ο Worker να γράφει `console.log` μία γραμμή ανά αίτημα χωρίς headers (08 option ii), ή (β) πίνακα `auth_events` (νέα migration, έγκριση owner).

### Σύνοψη 22/9
- **37 έλεγχοι** (36 εκτελέσιμοι + 1 κενό). **Μη-μηδενικά σήμερα: 15** — Β-03 23 · Β-08 5 · Β-10 6 · Β-11 2 (ιστορικό) · Β-13 24 · Β-15 58 · Β-16 63 · Β-17 44 · Β-19 2 · Β-22 160 · Β-25 2 · Β-27 5 (ιστορικό, 0 με φίλτρο) · Β-31 2 · Β-32 23 · Β-34 11. Από αυτά **κόκκινο με τον ορισμό του ελέγχου: κανένα** — όλα ουρές, ιστορικό ή πληροφορία.
- **Πρώτα να εγκατασταθούν (5):** Β-01 (ανάθεση χωρίς RT — P1, η ρίζα της μισθοδοσίας), Β-35 (σιωπή audit — ο μόνος τρόπος να μάθουμε ότι «έσπασε στις 06:00 Δευτέρα»), Β-07 (μετρητά ≠ μισθοδοσία — λεφτά οδηγού), Β-33 (άγνωστο πεδίο σε εγγραφή — η παγίδα που κόστισε 10 ευρήματα), Β-26 (VS χωρίς εθνικό φορτίο — το front γράφει σε δύο βήματα).
- Εκτέλεση: όπως προτείνει το `02` §Εκτέλεση (pg_cron + `monitoring.health_checks`) — **τίποτα δεν υπάρχει σήμερα** (1.6). Οι έλεγχοι «ανά 15′ ώρες εργασίας» θέλουν 2 cron entries (05:00–15:00 Athens = 02:00–12:00 UTC EEST· προσοχή στην αλλαγή ώρας 25/10).

---

## Μέρος 3 — Κενά παρακολούθησης (τι ΔΕΝ βλέπει η βάση) → για το Επίπεδο Α

1. **Αιτήματα που απορρίφθηκαν** (400/403/409/422/500): ο Worker δεν τα γράφει πουθενά. Από 22/9 ούτε το CF (invocation logs off). Ένα 403 στο checkbox της λογίστριας είναι αόρατο μέχρι να το πει η ίδια.
2. **Exceptions του Worker** (`console.error` 54 σημεία, uncaught): πάνε στα Workers Logs (observability on) — αναγνώσιμα **μόνο με CF token**, που το bot δεν έχει (P1 08). Το «AUDIT WRITE FAILED» είναι το χειρότερο: επιτυχία στον χρήστη, τρύπα στο ιστορικό, μόνο console.
3. **Αποτυχημένα logins / 401**: καμία εγγραφή (Β-37).
4. **Front που δεν έστειλε ποτέ**: `safeFetch` και `catch` που σιωπούν, offline, SW cache που σερβίρει παλιό `app.html` (5/9), ουρά αιτημάτων του SW — τίποτα δεν φτάνει στον Worker. Το `app_errors` δείχνει μόνο ό,τι πέρασε από `logError`, **χωρίς ρόλο και χωρίς έκδοση app** (`sw_version` υπάρχει, δεν αρκεί για συσχέτιση με deploy).
5. **Cache staleness**: memory 2′ (ORDERS) / localStorage 30′ (LOCATIONS, TRUCKS…) — ένας χρήστης μπορεί να βλέπει φορτηγό που διαγράφηκε πριν 25′. Δεν μετριέται από πουθενά.
6. **Cascades χωρίς audit**: `delete_order_cascade` γράφει ένα summary (counts) — όχι ποια ids· τα `*_soft_delete_cascade` triggers (national_orders/national_loads → stops/ramp/local_moves) **δεν γράφουν audit καθόλου**· `order_parent_to_legs` γράφει μόνο μέσω `order_legs_audit`. Γ3 του `02` (pg_stat vs audit) είναι η μόνη έμμεση ένδειξη.
7. **Οθόνες-εξαρτημένη εργασία**: ramp autosync, κλείσιμο RT (`rtOnOrderSaved`), εθνικό φορτίο VS (`order-sync.js`) — τρέχουν μόνο αν κάποιος ανοίξει τη σωστή σελίδα. Η βάση βλέπει το αποτέλεσμα (Β-03, Β-26, Β-31), όχι το αν η σελίδα άνοιξε.
8. **AI proxy**: καμία καταγραφή κλήσεων/tokens/κόστους/σφαλμάτων upstream εκτός console.
9. **Deployed ≠ main**: ο φρουρός των τριών, το `SW_VERSION`, τα `?v=` — θέλουν HTTP GET στο Pages + CF bundle, όχι SQL (Η1/Η3 του `02`).
10. **Δικαιώματα**: τρεις πίνακες (`PERMISSIONS`, `COSTS_PERMS`, `PL_PERMS`) ζουν μόνο στον κώδικα — ένα λάθος deploy που αφαιρεί μέθοδο φαίνεται μόνο ως 403 στον χρήστη (κενό 1).
11. **Απευθείας εγγραφές στη βάση** (SQL editor, migrations του owner): χωρίς trigger, χωρίς audit — Γ3 + Β-06/Β-29 τις πιάνουν μόνο αν αφήσουν ασυνέπεια.
