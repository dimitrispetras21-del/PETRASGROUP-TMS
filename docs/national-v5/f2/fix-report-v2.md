# Φ2 · πλάνο v2: ο κώδικας ακολουθεί τις αποφάσεις του owner (23/10) και ξανα-αποδείχθηκε (24/10/2026)

**Αρχείο που άλλαξε:** `docs/superpowers/plans/2026-10-22-f2-national-v5-plan-functions.md`, 9.084 → **9.278 γραμμές**, 29 Tasks (κανένα νέο· το Γ6 σημειώθηκε εκτελεσμένο). Κανένα deploy, καμία εγγραφή στη Supabase: μόνο SELECT (md5 των ζωντανών συναρτήσεων, η λήψη `live-072.sql`, μετρήσεις της Αφετηρίας, ευρετήρια και CHECK του `audit_log`).

**Πώς έγινε:** script ακριβών αντικαταστάσεων με έλεγχο πλήθους (174 αλλαγές, καμία με το χέρι) πάνω στο v1 (`74a315b6`)· μετά η εξαγωγή του `final-report.md` (κάθε «πρόσθεσε πάνω από…», κάθε «αντικατέστησε») πάνω στο τελικό αρχείο. Scratch εκτός repo (scratchpad της συνεδρίας).

---

## Τι άλλαξε στον κώδικα, ανά απόφαση

| Απόφαση | Αλλαγή | Πού |
|---|---|---|
| 10 (καμία «πληρωμένη») | `payroll_amount` = `{…, month: 'YYYY-MM' του dl_entries.entry_date, ποσά}`· χωρίς `paid` / `paid_week`. Το `tms_week(date)` δεν το καλεί πια καμία συνάρτηση: βγήκε από τον φρουρό (23 → **22** md5, σε PART 0, PART 5, verify, build test, bootstrap, harness, Κ2). | Α1 `plan_h_rt_consequences`, περιπτώσεις 13, 14, 65, B40· Worker `WITH_AMOUNT`· Interfaces· Κ1 |
| 41 (όλοι οι ρόλοι) | Νέο `PLAN_PERMS`: οι 5 ρόλοι έχουν κάθε πράξη του board· `rt-clear` και `delete` (και το dry run τους) μόνο owner/dispatcher. `plan_board`: τιμή, κόμιστρο και ειδοποιήσεις για όλους (το `p_role` μένει, ελέγχεται). Τα ποσά μισθοδοσίας/DKV αμετάβλητα (`plan_h_strip_amounts`). | Interfaces, Β7, B72, Γ3 (literal, `EXPECT`, 6 απαγορευμένα κελιά, νέο test «management/accountant/warehouse γράφουν», `amount_leak` για dispatcher, management, warehouse), Γ7 smoke, Κ1 (και το CLAUDE.md για το κόμιστρο) |
| 44 (`request_id`) | Δύο βοηθοί στο Α1: `plan_h_replay(p, p_op)` (πρώτη φορά `NULL`· επανάληψη = η πρώτη απάντηση + `replayed: true`· άλλο σώμα ή άλλη πράξη = `plan:request_reused`· όχι uuid = `bad_input`· `pg_advisory_xact_lock` ανά id) και `plan_h_remember(...)`. Κλήσεις στις `plan_orders_create`, `plan_split_piece` και στη δημιουργία του `plan_local_loading` (στην ακύρωση: `bad_input`). Νέος κωδικός 072: `request_reused` (27 → **28**) με ελληνικό κείμενο στο `PLAN_RULE_TEXT`. Worker: test ότι το `request_id` περνά όπως είναι και ότι στο 500, 503, 409 και 422 γίνεται **μία** κλήση RPC· το σχόλιο «the F4 client retries once» έφυγε. | Α1, Α2, Α5, Β6, Α8 (83–87), Β9 (B98–B99), Γ2, Γ3, Interfaces |
| 42 / βάση | Αφετηρία ξαναμετρημένη· Task 0, Γ1, Γ7 πάνω στο main @ `639a5a50` (PR #82), ζωντανή πηγή `0273aa06` (Worker b00d59f3)· Γ4 Step 4 με την άγκυρα του stop-delay (`"Delay Responsibility"`)· φρουρός +3 σημάδια (`"Delay Reason": "delay_reason"`, `var PRESENCE_ROLES`, `Temp Per CMR`): 12 πριν, 14 μετά· Γ7 ελέγχει ότι το `wrangler.toml` κρατά `PRESENCE_OFF` / `PRESENCE_MS`· Γ6 = ΕΓΙΝΕ (DECISION_LOG 23/10, Worker 3439b1e3). | Αφετηρία, Global Constraints, Task 0, Γ1, Γ4, Γ5, Σ1, Γ7, Κ2, Κ3 |
| 36 | Καμία αλλαγή κώδικα. Η Φ2 δεν αγγίζει τα EXCLUDE της 071b ούτε το σχήμα του `ct_round_trips`· το `PLAN_PERMS` δεν έχει resource αλλαγής οχήματος. Κ1: η γραμμή (36) γράφει το spec της αλλαγής οχήματος. | Κ1, Self-review |

**Γιατί γραμμή `audit_log` και όχι πίνακας για το `request_id`:** η 072 δεν προσθέτει πίνακες (κανόνας του πλάνου και build test)· η γραμμή γράφεται στην ίδια συναλλαγή με τις εγγραφές, άρα μια πράξη που αναιρείται δεν αφήνει ίχνος· βρίσκεται με το υπάρχον `audit_log_record_idx (record_id)` (13.827 γραμμές, 24/10)· το `action = 'create'` περνά το CHECK `audit_log_action_check`· και το rules test τη διαβάζει (83, 85, B98).

**Άνοιγμα για τον owner:** το «ίδιο `request_id`, άλλο σώμα = `request_reused`» το έγραψε το v2 από την εντολή του συντονιστή· το Task 0 Step 1 ζητά την επιβεβαίωση του owner στη συνομιλία.

---

## Ξανα-απόδειξη (κατά γράμμα από το τελικό αρχείο)

**Η λήψη:** το ερώτημα του Α1 Step 1, αυτούσιο, μέσω MCP (SELECT): 151.912 χαρακτήρες, md5 κελιού στη βάση = md5 του αρχείου = `1df9d47dbf165795b62000ede7d0c26e`· 12 συναρτήσεις· 0 αντικείμενα της 071· περιέχει ήδη τις στήλες `delay_*` του 067. Τα 22 md5 μετρήθηκαν ζωντανά: ίδια με 22/10 και 23/10.

| Έλεγχος | Αποτέλεσμα |
|---|---|
| Αφετηρία (v1 με την πραγματική λήψη, πριν από κάθε αλλαγή) | 179 OK, 0 FAIL· harness 9/9· build 12/12 (το v1 αντέχει και τη λήψη) |
| Harness της Β8 (`plan-072.test.mjs`, χωρίς καμία χαλάρωση) | **9/9**: η λήψη κρατά τα 22 ζωντανά κείμενα· dry run· apply· verify `changed_live 0`· ρόλοι API· rules· rollback (άρνηση, επιτυχία, ξανά apply)· μεταλλαγή B38 |
| Verify | `072 in place`, 54 `plan_%` (6 + 48), 16 δημόσιες, `service_role` 16, ανοιχτές στο API 0, `changed_live 0`, 0 γραμμές v5 |
| **Rules test** | **`Result: 186 OK, 0 FAIL`** (87 Α + 99 Β) |
| `tests/sql-072-drafts.test.js` | 12/12· `DRYRUN-IDIO`· 0 μη-ASCII χαρακτήρες |
| Bootstrap του Α1 (`sql-072`, 6 έλεγχοι) | 6/6 πάνω στην τελική 072 |
| Μεταλλαγές SQL, μία τη φορά | 22/22 ρίχνουν τις περιπτώσεις τους (πίνακας πιο κάτω) |
| Worker, Task προς Task, αντίγραφο `worker/` του main @ `639a5a50` + τελική 072 (md5 `ab7d7a50…`) | 236 (235 + 1 skip) → Γ2 Step 4 `fail 4` → **242** → Γ3 Step 4 `pass 6, fail 5` → **272** → Γ4 Step 2 `pass 24, fail 3` → **275** → Γ5 Step 2 `fail 6` → **281 (280 pass + 1 skip)** |
| Contract | 3 γραμμές `checked:` (071, 071b, `drafts/072`), `pass 8` |
| Φρουρός | `GUARD OK (14 markers, plan=1)` στη νέα πηγή και σε διπλό bundle esbuild 0.20.2· `GUARD OK (12 markers, plan=0)` στην πηγή του main |
| Μεταλλαγές Worker | `delete` για management → 3 κόκκινα (perms ×2, «decision 41»)· χωρίς κείμενο `request_reused` → contract κόκκινο· επαναφορά 281 / `fail 0` |
| JS blocks | 34: 23 περνούν `node --check` αυτούσια, 11 αποσπάσματα find/replace (ίδια με το v1) που περνούν μέσα στα αρχεία που συναρμολογούνται |

**Μεταλλαγές SQL (22):**

| Μεταλλαγή | Πέφτει |
|---|---|
| `plan_h_replay` χωρίς επανάληψη | 83, 84, 85 (`piece_split`), 87 (`not_at_hub`), B98, B99 (`local_exists`) |
| `plan_local_loading` χωρίς `plan_h_replay` | B98, B99 |
| χωρίς έλεγχο σώματος | 84, B99 |
| `month` κενό | 14, 65, B40 |
| `partner_rate` κατά ρόλο (το v1) | B72 |
| οι 11 της δεύτερης κριτικής (παλιό token, `piece_split` στην πλευρά, κομμάτι χωρίς σκέλος, `stops` πίνακας, οδηγός ίδιου κύκλου, δεκαδικά, «πρώτος» μετά το shift, ειδοποίηση μία, `recent`, στήλη διεθνούς, αύξηση σε κομμάτι που ταξιδεύει) | 5 · B88 · B89 · B90 · B91 · B92–B94 · B95 · B96 · B97 · B56–B58 · 69 (ίδια με το v1) |
| οι 5 πρώτες (first, later, localpay, sweep, keys) + payroll του harness | 78 · 79–80 · 81 · B85 · B79 · B38 |

Η μεταλλαγή «ειδοποιήσεις στο board για όλους» του v1 δεν εφαρμόζεται πια: είναι η συμπεριφορά της απόφασης 40.

---

## Τι δεν έγινε / δεν αποδείχθηκε

- **Το bootstrap `plan-072.test.mjs` του Α1** περιμένει τις 87 περιπτώσεις της Α· πάνω στο πλήρες test (με τη Β) δίνει 186 και αποτυγχάνει όπως πρέπει (το αντικαθιστά η Β8). Δεν ξανατρέχτηκε σε στάδιο «μόνο Α».
- **Ταυτόχρονες κλήσεις με το ίδιο `request_id`:** το PGlite είναι μία σύνδεση· το `pg_advisory_xact_lock` δεν δοκιμάστηκε με δύο συνεδρίες.
- **PostgREST και CF:** τα smoke του Γ7 (πραγματικό PostgREST, ζωντανά bindings) μένουν για το βράδυ του deploy.
- **Ένα test του main παραλείπεται** (`PRESENCE_ACTIONS equals the design whitelist…`): ψάχνει το `068_presence.sql` στο `drafts/`, απ' όπου βγήκε 24/10. Δεν είναι της Φ2· δεν διορθώθηκε εδώ (νεκρή διαδρομή test, αρχή 8: θέλει δικό του PR).
- **CLAUDE.md:** η λίστα «σημάδι ανά λειτουργία» έχει ακόμη μόνο `tblStockLots: {` και `"Move Kind"`. Τα σημάδια του stop-delay, του presence και του `Temp Per CMR` (που ήδη ελέγχει ο φρουρός των deploys της 24/10) δεν έχουν γραφτεί εκεί· το πλάνο τα βάζει στο Κ3 Step 2, αλλά ως τότε η λίστα του CLAUDE.md είναι ελλιπής.
- Το σημάδι της VD (`{0,49}$/`), που ο φρουρός του deploy VD/stop-delay έλεγξε, δεν μπήκε στο εργαλείο του Γ5 (δεν το ζητά καμία απόφαση).
