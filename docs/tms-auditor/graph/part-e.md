# Μέρος ε — Εγκάρσιοι μηχανισμοί + κατάλογος βάσης (22/9/2026, base `549a2a4`)

**Ομάδα ε.** Μόνο ανάγνωση: repo (worktree `feat/tms-auditor`) και ζωντανός κατάλογος Postgres.
Αρχεία: `part-e.json` (463 κόμβοι, 1.528 ακμές, 17 τρόποι αποτυχίας), `part-e-catalog.json` (ωμά μεταδεδομένα καταλόγου).

## 1. Τι καλύπτει
- **Front:** `core/api.js` (atGet/atPatch/atCreate/atDelete, `_atRetry`, ουρά offline `ls:tms_offline_queue`, caches `ls:at_*`, undo/κάδος, `atSafePatch`), `core/auth.js`, `core/router.js` (NAV: 33 σελίδες + `costs_dash`, με ορατότητα ανά ρόλο), `core/utils.js` (logError, `_postAppError`, safeFetch, renderErrorLog), toasts (`core/ui.js#toast`, `utils#showErrorToast`), `sw.js`, εκκίνηση `app.html`/`index.html`, roster `USERS` (12 εγγραφές σε **καθένα** από config.js και index.html, ίδιο σύνολο, ρόλοι 2 owner / 2 management / 3 accountant / 4 dispatcher / 1 warehouse — χωρίς ονόματα).
- **Worker:** σκελετός `fetch` (4737), `getCaller`/`jwtVerify`, CORS/Origin, **PERMISSIONS / COSTS_PERMS / PL_PERMS**, χάρτης `TABLES` (21 facade πίνακες → κόμβοι `tbl:` με το facade id στο `notes`), `audit()`/`auditMany()`, `logUnknownFields` → `facade_unknown_fields`, `/app-errors`, `/health`, `/auth/login`.
- **Έλεγχοι:** `.github/workflows/code-guards.yml`, `tests/check-fail-open.sh` (BASELINE=0), `tests/critics/run.js`, Β-33/34/35/37 του 02b.

Για κάθε (ρόλος × facade πίνακας × μέθοδος) υπάρχει ακμή `allows`/`denies` με τη γραμμή του κανόνα. Το ίδιο ισχύει για κάθε `/costs/*` και `/pallets/*` handler και για κάθε σελίδα του NAV. Οι μορφές `ep:<M> /v0/<t>/:id` είναι ψευδώνυμα που δείχνουν στον κόμβο-ομάδα. Εκεί «κρέμονται» τα δικαιώματα, και έτσι ενώνονται με τα μέρη a/d.

## 2. Κατάλογος βάσης — πότε και πώς
**3 batched SELECT** (όχι 15), `mcp__supabase__execute_sql`, **19:09:52–19:10:22 UTC (22:09–22:10 Αθήνα)**.
Διαβάστηκαν μόνο καταλόγοι: pg_trigger, pg_get_triggerdef, pg_proc/pg_get_functiondef, pg_class, pg_depend/pg_rewrite, pg_constraint, pg_extension, pg_namespace, pg_roles (3 στήλες), pg_views, pg_policy.
Καμία συνάρτηση TMS δεν εκτελέστηκε. Δεν διαβάστηκαν δεδομένα πινάκων, ούτε `users`, ούτε `audit_log`. Όλες οι ακμές `db:` είναι `confirmed`, εκτός από τις μεταβατικές `syncs` (βλ. παρακάτω).

- **Triggers: 23** (όλοι `enabled=O`) σε 7 πίνακες. Το 01 λέει «25 σε 8». Μετρημένα σήμερα είναι 23, όσα γράφει και το 02b.
  - `orders` (12): rt_create_from_order, rt_sync_from_order, rt_link_split, order_dates_follow, national_load_follow_order, order_soft_delete_unlink, orders_invoice_mark_guard, order_leg_depth, order_leg_inherit, order_leg_status_sync, order_legs_to_parent, order_parent_to_legs.
  - `ct_round_trips`: dl_sync_from_rt, rt_sync_to_orders.
  - `ct_rt_legs`: rt_sync_legs, rt_reopen_on_leg.
  - `dl_entries`: dl_cash_lock, dl_cash_sync_entry.
  - `ct_cost_lines`: dl_cash_sync_line.
  - `national_loads`: national_load_soft_delete_unlink, trg_national_loads_soft_delete_cascade.
  - `national_orders`: national_orders_invoice_mark_guard, trg_national_orders_soft_delete_cascade.
- **Τι γράφει κάθε trigger:** βγήκε από το κείμενο του `pg_get_functiondef` (regex `INSERT INTO|UPDATE|DELETE FROM <πίνακας public>`). Δεν ξεχωρίζει το ρήμα.
  - Άμεσες εγγραφές = `confirmed`.
  - Εγγραφές μέσω βοηθητικών (π.χ. `rt_recompute`, `rt_sync_audit`, `dl_cash_sync`, `rt_merge`) = `probable`, με το «via» στο `note`.
  - Οι αναφορές του `rt_merge` σε `dl_sync_from_rt`/`rt_sync_legs` μπορεί να είναι σχόλια: οι trigger functions δεν καλούνται απευθείας.
- **36 συναρτήσεις public** (30 SECURITY DEFINER). Το `delete_order_cascade` αγγίζει 10 πίνακες, ανάμεσά τους και `groupage_lines`.
- **24 views** με εξαρτήσεις (`computes`, κατεύθυνση καταναλωτής→πηγή όπως το `reads`). Το facade ORDERS διαβάζει την `orders_with_derived`, που εξαρτάται από `_old3 → _old2 → _old`. Τα «παλιά» views είναι λοιπόν **ζωντανός κρίκος**, όχι νεκρός κώδικας.
- **FK: 163** (ομαδοποιημένα σε `depends` ανά ζεύγος πινάκων): RESTRICT 6, CASCADE 3, SET NULL 3, NO ACTION 151. Όλα ενεργούν **μόνο σε hard DELETE**. Η εφαρμογή κάνει soft-delete παντού, άρα στην κανονική λειτουργία δεν ενεργοποιούνται ποτέ.
- **Extensions:** pg_stat_statements, pgcrypto, plpgsql, supabase_vault 0.3.1, uuid-ossp. **pg_cron / pg_net: ΑΠΟΝΤΑ**, όπως και τα schemas `cron`/`net`.
- **Vault:** υπάρχουν το schema `vault` και το view `vault.decrypted_secrets` (μόνο μεταδεδομένα). Δεν έγινε SELECT σε κανένα από τα δύο.
- **Ρόλοι:** rolsuper μόνο ο `supabase_admin`. rolbypassrls: postgres, service_role, supabase_admin, supabase_etl_admin, supabase_read_only_user.
- **RLS:** ενεργό και στους 37 πίνακες, με 0 πολιτικές ο καθένας.
- **Κρατήθηκαν εκτός αρχείων:** τα δικαιώματα `anon`/`authenticated` ανά πίνακα και οι επιλογές `security_invoker` των views. Το repo είναι δημόσιο και τα ευρήματα ασφαλείας δεν ανεβαίνουν πριν κλείσουν. Αναφέρθηκαν στον συντονιστή.

## 3. Οι τρεις πίνακες δικαιωμάτων — πού διαφωνούν (ρόλος × πόρος)
Κανόνας wildcard: `worker/src/index.js:604` `roleMap[table] || roleMap["*"]` — **αντικαθιστά, δεν συγχωνεύει**. Τα `ctCan` (2991) και `plCan` (4225) δεν έχουν wildcard.

| # | Ρόλος × πόρος | Facade / front | Costs / Pallets | Συνέπεια |
|---|---|---|---|---|
| 1 | [ευαίσθητο — ιδιωτική σημείωση S-1 προς συντονιστή· δεν δημοσιεύεται σε δημόσιο repo] | — | — | — |
| 2 | dispatcher × RT | front `costs:'none'`, κανόνας «όχι P&L» | COSTS `rt` GET/POST/PATCH/DELETE (2985) | Ο dispatcher έχει **περισσότερη** εξουσία στα RT από accountant/management (κλείσιμο, ημερομηνίες, km, αφαίρεση σκέλους). |
| 3 | accountant × RT | front `costs:'full'` | COSTS `rt` μόνο GET/POST (2982) | «Full» στο UI, αλλά PATCH RT = 403: η λογίστρια δεν κλείνει και δεν διορθώνει RT. |
| 4 | management × μισθοδοσία | front `costs:'view'` | COSTS `ledger` POST/PATCH (2988), `lines`/`rt` μόνο GET· `POST /costs/ledger/import` 403 inline (3569) παρά το COSTS_PERMS | Τρεις κανόνες για τον ίδιο πόρο (PERMS, COSTS_PERMS, inline). |
| 5 | warehouse × ράμπα/παλέτες/κύρια | front `planning/orders:'view'` → βλέπει στο μενού daily_ramp, weekly_*, invoicing, pallet_ledger | facade: χωρίς `ramp`, `clients`, `partners`, `drivers`, `trucks`, `trailers`, `pallet_ledger_*`· PL: movements GET/POST/PATCH + confirm + sheets | Οθόνες ανοίγουν και παίρνουν 403. Το `preloadReferenceData` (Promise.all) απορρίπτεται. Στις παλέτες ο warehouse μπορεί να γράφει κινήσεις που αλλού δεν βλέπει. |
| 6 | management × παλέτες | facade `pallet_ledger_*` πλήρες (471-472) | PL `movements` μόνο GET (4219) | Γράφει τους παλιούς πίνακες, διαβάζει μόνο τον νέο. |
| 7 | accountant × παλέτες | facade `pallet_ledger_suppliers` GET/POST/PATCH (525), `_partners` → `*`:GET | PL movements πλήρες με DELETE (4209) | Ασυμμετρία suppliers/partners από ρητή γραμμή που λείπει. |
| 8 | owner × `DELETE /v0/groupage_lines` | owner `*` περιέχει DELETE (437) → soft-delete | — | Ο κανόνας «GL ποτέ δεν σβήνονται» ισχύει μόνο για τον dispatcher. Το σχόλιο «η βάση το αρνείται» (~537) δεν ισχύει για soft-delete. |
| 9 | management/accountant × orders | front `orders:'view'` | facade PATCH (448/513) | Κλειδωμένη απόφαση 23/8 (ευρεία επεξεργασία). Καταγράφεται, δεν είναι bug. |
| 10 | management × σφάλματα | front `error_log` μόνο owner + `renderErrorLog` owner-only | `ERROR_READERS` owner+management (356) | Κανένα front δεν καλεί `GET /app-errors`. |
| 11 | pallet gate | — | `/costs/pallet-gate` μόνο owner · `/pallets/gate` όλοι | Δύο πύλες για το ίδιο ερώτημα. |
| 12 | performance | front `performance:'view'` (όλοι εκτός warehouse) | `PERF_SCOPES`: driver = owner/mgmt/dispatcher, client/partner = owner/mgmt/accountant | *probable*: ποιο scope ζητά η σελίδα ανά ρόλο δεν ελέγχθηκε. |

Πηγές κανόνων δικαιωμάτων σήμερα: `PERMS`, σημαίες `role` του NAV, έλεγχοι μέσα στα render, `PERMISSIONS`, `COSTS_PERMS`, `PL_PERMS`, `AUDIT_READERS`/`ERROR_READERS`/`PERF_SCOPES`, inline `caller.role` (3333, 3569, 4382…), `SCOPED_DELETE`, `AUDIT_UI_ROLES` (αντίγραφο στο front). Αρχή 3.

## 4. Τρόποι αποτυχίας (λεπτομέρεια στο JSON, FM-e-01…17)
- **F-02, 401 σε /costs και /pallets:** τα `ctFetch`/`plFetch` πετούν «Unauthorized» (ή «HTTP 401» όταν το σώμα δεν είναι JSON). Δεν γίνεται redirect ούτε logError. Μόνο το `_atRetry` του facade καθαρίζει session και γυρίζει στο login.
- **F-03, offline:**
  - Τα `atPatch`/`atCreate`/`atDelete` επιστρέφουν `{_offline:true}` και id `offline_<ts>` σαν επιτυχία, και οι αλυσίδες συνεχίζουν.
  - Το `_flushOfflineQueue` ξαναστέλνει με ωμό `fetch` και **δεν ελέγχει `res.ok`**: ένα 403/422 μετράει ως «συγχρονίστηκε».
  - Ο έλεγχος σύγκρουσης διαβάζει `Last Modified`, που δεν υπάρχει σε κανέναν χάρτη.
- **F-04, undo:**
  - Η επαναφορά διαγραφής φτιάχνει νέο id και δεν επαναφέρει το cascade.
  - Το `atSuppressUndo` δεν καλείται από πουθενά, οπότε η τελευταία υπο-εγγραφή μιας αλυσίδας γίνεται στόχος της αναίρεσης.
  - Το `atSafePatch` (71 σημεία) δεν ελέγχει ποτέ σύγκρουση: `atTrackVersion` χωρίς καλούντα, `Last Modified` πάντα null.
- **Audit:** τα `audit()`/`auditMany()` καταπίνουν το σφάλμα και απαντούν επιτυχία. Το `/pallets/override` είναι **μόνο** audit γραμμή, κι όμως απαντά `{recorded:true}`.
- **F-42, σφάλματα:**
  - Το `_postAppError` στέλνει ως 20 ανά φόρτωση σελίδας, όχι σε localhost, και χωρίς sw_version.
  - Το `index.html` δεν φορτώνει `utils.js`: τα σφάλματα της οθόνης login δεν φτάνουν ποτέ στη βάση.
  - Το `renderErrorLog` διαβάζει localStorage, όχι τον πίνακα. Επιπλέον το `logError` **ξαναγράφει** το `tms_errors` με τον πίνακα της τρέχουσας φόρτωσης, οπότε το ιστορικό χάνεται.
  - Το `safeFetch` σωπαίνει για κάθε «Unauthorized», και για ένα που δεν είναι λήξη (π.χ. αλλαγή `JWT_SECRET`).
- **Υγεία / Origin:** το `/health` απαντά στατικά χωρίς να αγγίξει τη βάση. Η πύλη Origin αφήνει να περάσουν αιτήματα **χωρίς** Origin. Μόνο το `POST /app-errors` το απαιτεί.
- **SW:** ο κλάδος `api.airtable.com` (cache, SW_OFFLINE, SW_CACHE_AGE) είναι νεκρός από το C2, άρα τα αντίστοιχα banners δεν ανάβουν ποτέ.
- **Γεννιέται ανοιχτό (αρχή 5):** κάθε νέος facade πίνακας δίνει αυτόματα GET σε management/accountant μέσω του `*`.

## 5. Έλεγχοι που υπάρχουν
- **CI (`code-guards.yml` → `check-fail-open.sh`):** σε push/PR στο main. Φυλάει μόνο ένα μοτίβο (`.catch(()=>[])`).
- **Critics:** χειροκίνητα, **μόνο με session owner**. Καμία ακμή ρόλου εκτός owner δεν έχει ελεγχθεί με εκτέλεση.
- **Φρουροί στη βάση (BEFORE trigger με raise):** invoice_mark_guard ×2, dl_cash_lock, order_leg_depth. Αυτοί είναι «θορυβώδεις».
- **Β-33/34/35:** SQL χωρίς χρονοδιακόπτη (runs: never). **Β-37** (401 bursts): χωρίς πηγή.

## 6. Τι ΔΕΝ επαληθεύτηκε
1. Ο Worker σε παραγωγή σε σχέση με το repo: δεν υπάρχει πρόσβαση στο CF. Όλες οι γραμμές `worker/src/index.js` αφορούν το **base `549a2a4` (4.805 γραμμές)**. Στη διάρκεια του session το αρχείο στο worktree άλλαξε από άλλο κανάλι (4.805 → 4.876 γραμμές, αδέσμευτο, +77/−6), μαζί με νέα DRAFT 047–050. **Η αλλαγή αυτή δεν χαρτογραφήθηκε** και οι αριθμοί γραμμών δεν ισχύουν πάνω της.
2. Τα `writes` των triggers προέρχονται από regex σε κείμενο (π.χ. `UPDATE` μέσα σε σχόλιο θα μετρούσε). Δεν έγινε εκτέλεση.
3. Αν οι 12 εγγραφές του roster αντιστοιχούν στους 6 λογαριασμούς της βάσης: απαγορεύεται η ανάγνωση `users`.
4. Η συμπεριφορά των ρόλων στην πράξη (κανένα login, κανένα αίτημα).
5. Αν κάποιο module ελέγχει ρόλο πριν το κουμπί διαγραφής παραγγελίας (#1). Ανήκει στα μέρη a/c.

## 7. Εξαρτήσεις προς άλλα μέρη
- **a:** triggers orders· `DELETE /v0/orders` με έλεγχο PATCH.
- **b:** ctFetch 401· φίλτρο `cash_m` εκτός `CT_CATEGORIES`· dl_sync_from_rt.
- **c:** override = μόνο audit· undo νέο id.
- **d:** warehouse × ράμπα 403.
