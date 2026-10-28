# Πάνελ διαδρομής (παραγγελία / RT) στο Εβδομαδιαίο Εθνικών v5 · Πλάνο υλοποίησης

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ένα πλευρικό πάνελ 480px δίπλα στο Εβδομαδιαίο Εθνικών v5.
- Ανοίγει με κλικ σε έναν κύκλο (RT) ή σε μια παραγγελία, και δείχνει τη διαδρομή της.
- Το πάνελ **παράγεται από τα δεδομένα** με τους κανόνες K0–K10 του `docs/order-route/ROUTE-GRAMMAR.md`. Τίποτα δεν
  σχεδιάζεται με το χέρι.
- Ό,τι παραβιάζει κανόνα φαίνεται κόκκινο, χωρίς να το ρωτήσεις.
- Από την πρώτη έκδοση έχει **τέσσερις καρτέλες: Διαδρομή · Φορτίο · Έγγραφα · Ιστορικό** (owner 28/10).

**Architecture:** Τρία καθαρά στρώματα και ένας λεπτός οικοδεσπότης. Τα στρώματα 1–3 είναι pure JS και ελέγχονται
με `node --test`.
1. `core/route-grammar.js` (`window.RG`): από κανονικοποιημένη είσοδο βγάζει τύπο, κανόνες και σημάδια. Είναι η
   **runtime** μορφή της γραμματικής. Ένα test ισοτιμίας την κρατά ίδια με το `docs/order-route/route-grammar.sql`,
   που είναι ο ελεγκτής (αρχή 3).
2. `core/route-panel-model.js` (`window.RPM`): από έναν κύκλο του `/plan/board` και τα συμφραζόμενά του βγάζει το
   μοντέλο του πάνελ (κεφαλίδα, τμήματα ανά κατεύθυνση, μία γραμμή ανά στάση, γραμμές ⇄, κλειδί–τιμή, footer).
3. `core/route-panel-data.js` (`window.RPD`): μαζεύει τα συμφραζόμενα με **υπάρχοντα** endpoints μόνο:
   - το board που έχει ήδη φορτώσει το `WN5`·
   - το facade (LOCATIONS, ORDERS, ORDER STOPS) για ό,τι δεν έχει το board·
   - το `/costs/rt` για επικαλύψεις με διεθνή RT.

   Ο οικοδεσπότης `modules/route_panel.js` (`window.RoutePanel`) ζωγραφίζει το μοντέλο και ανοίγει από το
   `modules/weekly_natl_v5.js`.

**Ξηρή δοκιμή του πλάνου (28/10):** ο κώδικας και τα tests των T1–T4 και T9–T11, όπως είναι γραμμένα εδώ, έτρεξαν σε
scratchpad πάνω σε φρέσκια εξαγωγή της βάσης (404 παραγγελίες, 86 εθνικά φορτία, 213 RT): **29 / 29 pass**, ισοτιμία JS ↔ SQL
σε 703 / 703 εγγραφές, και οι αποδείξεις μετάλλαξης του T1 (K2 γονέα σπασίματος → αποτυγχάνει στη #269) και του T2
(K10 → αποτυγχάνει) πιάνουν, όπως και οι τρεις των καρτελών του T13 Step 3. Τα tests συγκρίνουν αντικείμενα του vm ως απλό JSON (`eq`), γιατί διαφορετικό realm
σπάει το `deepStrictEqual`. Τίποτα από αυτά δεν μπήκε στο repo· μπαίνει στην υλοποίηση, μετά το F4α.

**Tech Stack:** Vanilla JS (IIFE, `window.*`), CSS στο `assets/style.css`, `node --test` με vm sandbox (υπάρχον
μοτίβο `tests/wn5-*.test.js`), Playwright rig (μοτίβο `tests/critics/wn5-board-rig.js`), Figma MCP για τις τιμές.

## Global Constraints

- **Μόνο Εθνικών πρώτα** (owner 26/10, `docs/order-route/PANEL.md`). Οι λέξεις του: «ξεκινάμε υλοποίηση μόνο στο
  Εθνικών για αρχή· αφού δούμε ότι δουλεύει σωστά, μετά πάμε Διεθνών». Το πάνελ του Εβδομαδιαίου Διεθνών είναι
  **χωριστό πλάνο** (Φάση Β, §8). Δεν μπαίνει εδώ.
- **Τέσσερις καρτέλες από την πρώτη έκδοση** (owner 28/10). Οι λέξεις του: «Και οι τέσσερις καρτέλες του Figma από
  την πρώτη έκδοση». Frames `2283:10009`–`2283:10200`, με τις εθνικές τους παραλλαγές F5–F7 (§3).
- **Καμία υλοποίηση πριν από το merge του F4α** (owner 27/10). Λέξεις: «η υλοποίηση μετά το merge του F4α». Οι
  εργασίες με γραμμές ⇄ περιμένουν **επιπλέον** το merge των T24/T25 του F4α (branch `feat/national-v5-f4a-handover`,
  πλάνο F4α γρ. 62 και 488).
- **Σειρά merge:** πρώτα το PR #107 (γραμματική), μετά το PR αυτού του πλάνου.
- **Οι 8 κανόνες πάνελ του owner (26/10).** Είναι άγκυρες και δεν αλλάζουν:
  1. πάνελ 480px δίπλα στον πίνακα, που μένει ορατός στα 1440·
  2. τμήματα ανά κατεύθυνση (ΚΑΘΟΔΟΣ / ΑΝΟΔΟΣ στα εθνικά)·
  3. μία γραμμή ανά στάση·
  4. χρώμα κουκκίδας ανά κατάσταση·
  5. γραμμές «⇄» με τα χρώματα τμημάτων ΑΡΧΙΚΟ / ΕΝΔΙΑΜΕΣΟ / ΤΕΛΙΚΟ·
  6. «Cross-dock · Βέροια (VS)» στη στάση του κόμβου·
  7. πάνελ δίπλα-δίπλα με ευθυγραμμισμένο χρόνο όταν το ίδιο όχημα ή ο ίδιος οδηγός έχει δεύτερο RT τις ίδιες ημέρες·
  8. σταθερή σειρά footer: **WhatsApp · Εντολή · Καθυστέρηση…**.
- **Διαδικασία owner 27/10, σε κάθε εργασία:**
  - **Τιμές Figma πριν από τον κώδικα:** οι ακριβείς τιμές του κόμβου Figma γράφονται στο brief της εργασίας.
  - **Το πολύ ένας γύρος πιστότητας.** Αποκλίσεις ≤ 2px μπαίνουν στη λίστα `docs/route-panel/DEFERRED.md` για ένα
    πέρασμα σε όλο το frame στο τέλος (T12).
  - **Οι έλεγχοι ορθότητας μένουν όλοι:**
    - suite (`node --test tests/*.test.js tests/*.test.mjs tests/critics/*.test.js 2>&1 | grep -E '^ℹ (tests|pass|fail)'`)·
    - rig με 0 page errors·
    - αποδείξεις μετάλλαξης (κάθε test που προστατεύει κανόνα πρέπει να αποτύχει με χαλασμένο κώδικα)·
    - SELECT παραγωγής·
    - ελεγκτής·
    - `/code-review high` πριν από το PR υλοποίησης.
- **Γεννιέται κλειστό (αρχή 5):** `FEATURES.ROUTE_PANEL: false` στο `config.js`. Ανοίγει μόνο όπου είναι ανοιχτό το
  `WN_V5`, και μόνο με ρητή εντολή owner.
- **Μόνο ανάγνωση:** το πάνελ δεν γράφει τίποτα. Τα κουμπιά του footer καλούν **υπάρχουσες** ενέργειες του
  οικοδεσπότη. Καμία νέα ενέργεια ρόλου (owner 26/10, PANEL.md ερώτηση 2: «Εθνικό σκέλος μόνο για ανάγνωση»).
- **Κανένα όνομα πελάτη ή οδηγού** σε repo, fixtures ή tests: μόνο ids και συνθετικά δεδομένα. Το repo είναι
  δημόσιο.
- **Bump:** σε κάθε αρχείο που φορτώνει το `app.html`: το `?v=TIMESTAMP` του και το `SW_VERSION` του `sw.js`, με
  την ίδια τιμή.
- **Supabase = SELECT μόνο. Κανένα deploy.**

---

## 1 · Πού ανοίγει (entry points)

| Οικοδεσπότης | Σημείο | Τι ανοίγει |
|---|---|---|
| `modules/weekly_natl_v5.js` (F4α) | κλικ στο κουτί ανάθεσης `.wn5-asg` μιας σειράς με `data-rt` | πάνελ **κύκλου** (RT) |
| ίδιο | κλικ στο chip παραγγελίας μιας στάσης (`.wn5-pt`, πεδίο `order_id` / `nat_order_id` του leg) | πάνελ **παραγγελίας** |
| ίδιο | Esc · ✕ · δεύτερο κλικ στο ίδιο σημείο | κλείνει· ο πίνακας μένει ορατός |

- **Το μενού ✈ (`WN5.rowMenu`) δεν αλλάζει.** Το πάνελ δεν είναι ενέργεια, είναι ανάγνωση.
- **Σήμερα δεν υπάρχει πλευρικό πάνελ** σε κανένα από τα δύο Εβδομαδιαία, ούτε καρτέλα «Διαδρομή». Μετρήθηκε στο
  `main` 27/10. Τα `#wi-panel` / `_wiPanelOpen` (`modules/weekly_intl.js:4367`) είναι αγκυρωμένα πάνελ ενεργειών
  360px, όχι συρτάρι.
- **Πρότυπο συρταριού:** `.mnt-drawer` (`assets/style.css`, ενότητα «record drawer», 480px, `max-width:95vw`) και
  `modules/maintenance.js:418` (`_mntCloseDrawer`).

## 2 · Πηγές δεδομένων (μία νέα ανάγνωση: το Ιστορικό)

| Τι | Από πού | Υπάρχει; |
|---|---|---|
| Κύκλος: στάσεις, legs, τμήματα, `has_vehicle`, `has_late`, `executed`, `stop_day` | `WN5.state().board` (το board που φόρτωσε ήδη η οθόνη· `GET /plan/board?week=`, 072 `plan_board`, 072b `segments`) | ναι (F4α) |
| Κομμάτια σε αναμονή μιας παραγγελίας | `board.waiting[]` (`order_id` / `nat_order_id`) | ναι |
| Σκέλη της ίδιας παραγγελίας σε άλλη εβδομάδα | δεύτερο `GET /plan/board?week=` (±1) μέσω `planFetch` | ναι |
| Χώρα τόπου (N2) | facade LOCATIONS (`tblxu8DRfTQOFRCzS`, πεδίο `Country` στον χάρτη του Worker, `worker/src/index.js:939`) | ναι |
| Διεθνές σκέλος μιας VS (φόρτωση εξωτερικού → κόμβος) | facade ORDERS + ORDER STOPS (μόνο ανάγνωση) | ναι |
| Διεθνές RT του ίδιου φορτηγού ή οδηγού τις ίδιες ημέρες (Γ1 / Γ4) | `GET /costs/rt?truck_id=&from=&to=&overlap=1` και `?driver_id=` (`worker/src/index.js:4425`) | ναι |
| **Φορτίο:** παλέτες, θερμοκρασία | board `legs[].pallets`, `legs[].temperature_c` | ναι |
| **Φορτίο:** ανταλλαγή παλετών | facade ORDERS `"Pallet Exchange"` (`worker/src/index.js:1384`) · NATIONAL ORDERS `"Pallet Exchange"` (`:1663`) · `board.waiting[].pallet_exchange` | ναι |
| **Φορτίο:** χωρητικότητα 33, πιο φορτωμένη πλευρά | `WN5L.CAP`, `WN5L.capacity()` (F4α `core/wn5-logic.js:22,100`) | ναι (F4α) |
| **Έγγραφα** | `OrderDocs.listDocs(orderId)` → `GET /docs/list?order=` · `OrderDocs.fetchFileBlob(id)` → `GET /docs/file/<id>` (`core/order-docs.js:213,222`) | ναι, **μόνο για διεθνείς** παραγγελίες (FK `order_documents.order_id → orders`) |
| **Ιστορικό** | `audit_log` μέσω της **νέας** `GET /plan/history` (W-2) πάνω στη **νέα** `plan_history(...)` (M-1). Το υπάρχον `GET /audit` το διαβάζουν μόνο owner / management | **όχι**: M-1 + W-2 |

**Εξαρτήσεις Worker και SQL** (αλυσίδα Worker και διαδικασία βάσης, **όχι** front end):
- **M-1 (απαιτείται για το Ιστορικό):** συνάρτηση `plan_history(p_rt bigint, p_order_ids bigint[], p_nat_order_ids
  bigint[], p_names boolean, p_limit int) RETURNS jsonb`, `STABLE SECURITY DEFINER SET search_path = public`, μόνο
  ανάγνωση. Παίρνει τον αριθμό της επόμενης ελεύθερης migration (μετά τη 074).
  - **Διαβάζει** `audit_log (id, actor, role, action, table_name, record_id, before_data, after_data, created_at)` για
    τα κλειδιά του κύκλου και των παραγγελιών του:
    - `ct_round_trips` (το `p_rt`)·
    - `rt_stops`, `piece_legs`, `rt_vehicle_segments` (`WHERE rt_id = p_rt`)·
    - `shipments`, `shipment_pieces` (`order_id = ANY(p_order_ids)` / `nat_order_id = ANY(p_nat_order_ids)`)·
    - `local_moves` (`rt_stop_id` στις στάσεις του)·
    - `orders`, `order_stops`, `national_orders`, `national_loads` (`source_order_id`).
  - **Και τα δύο σχήματα κλειδιού:** οι γραμμές του Worker έχουν `record_id` = legacy id, οι γραμμές trigger και
    `plan_h_audit` έχουν `id::text`. Ίδιος κανόνας με το `expectAttribution`, `worker/src/index.js:3720`.
  - **Επιστρέφει** `{entries:[{at, table, record_id, action, actor_kind, actor|null, role, changed, order_ref}],
    since, v5_rows, truncated}`:
    - το `changed` είναι **μόνο τα ονόματα** των κλειδιών όπου `before_data` και `after_data` διαφέρουν, όταν και τα
      δύο είναι jsonb αντικείμενα, αλλιώς `null`. **Ποτέ τιμές:** ο dispatcher δεν βλέπει P&L (κλειδωμένη απόφαση
      23/8), και τα before / after κρατούν τιμές και κόμιστρα·
    - `actor` μόνο όταν `p_names`· `limit ≤ 200`.
  - **Γεννιέται κλειστό:** `REVOKE EXECUTE` από PUBLIC, anon, authenticated· `GRANT` μόνο στον service_role.
  - **Διαδικασία:** dry run, εκτέλεση μετά τις 15:00, ρητό «ναι» του owner, verify, test σε γραμμές δοκιμής που δεν
    κρατιούνται.
- **W-2 (απαιτείται για το Ιστορικό):** route `GET /plan/history?rt_id=|order_id=|nat_order_id=` στο `PLAN_ROUTES`, που
  καλεί το M-1.
  - `p_names = AUDIT_READERS.includes(role)`: ονόματα μόνο σε owner / management, όπως σήμερα το `/audit` και η
    παρουσία (`worker/src/index.js:7181`). Οι άλλοι ρόλοι βλέπουν ρόλο και είδος, όχι όνομα.
  - **Ποιοι ρόλοι διαβάζουν:** αλλάζει τι βλέπει ένας ρόλος, άρα **ερώτηση owner πριν** (§9 ερώτηση 3).
  - Αλυσίδα `deploy/worker-plan*`, από την ζωντανή πηγή, μετά τις 15:00. Νέο σημάδι φρουρού `rpc: "plan_history"`
    στη λίστα του CLAUDE.md.
- **W-1 (προαιρετικό):** `GET /plan/route?rt_id=|order_id=`, η διαδρομή ενός κύκλου ή μιας παραγγελίας χωρίς όλη την
  εβδομάδα. Σήμερα κανένα route δεν τη δίνει (`/plan/board` = όλη η εβδομάδα). Χρειάζεται μόνο αν το T3 μετρήσει ότι
  το δεύτερο board είναι αργό. Αν χρειαστεί, πάει στην αλυσίδα `deploy/worker-plan*` με δικό της πλάνο.
- **S-1 (Φάση Β):** εξαγωγή εισόδου γραμματικής για τα διεθνή. Καλύπτεται από το SELECT του T1, χωρίς αλλαγή βάσης.

**Πριν από την ημέρα L:**
- Το Ιστορικό, με M-1 + W-2 ζωντανά, δείχνει τις γραμμές των **παραγγελιών** (υπάρχουν: 4.585 `orders`, 4.165
  `order_stops`, 358 `national_loads`, 30 `national_orders`), και ρητά «Κύκλοι v5: 0 αλλαγές — γράφονται από την ημέρα
  L». Ποτέ κενό (T11).
- Οι πίνακες v5 έχουν 0 γραμμές, άρα στην παραγωγή το πάνελ δεν έχει τι να δείξει. Η απόδειξη πριν από το L είναι:
  rig με συνθετικά δεδομένα, και SELECT που δείχνει 0 κύκλους.
- Η απόδειξη με πραγματικά δεδομένα γίνεται την πρώτη εβδομάδα μετά το L (T13, βήμα 9).

## 3 · Frames Figma (αρχείο `KO7l2AfucR3HJEDIg1Yptr`)

| Frame | Κόμβος | Χρήση |
|---|---|---|
| Πρότυπο συρταριού R3 | `953:2417` | δομή: κεφαλίδα, καρτέλες, σώμα, κλειδί–τιμή, footer |
| Κάρτες «στυλ πάνελ» (26/10) | `2310:7917`–`2310:7926` (σελίδα `2306:7735`) | γλώσσα γραμμών: στάση, ⇄, cross-dock, κόκκινο / πορτοκαλί |
| RT17 (ΑΡΧΙΚΟ / ΤΕΛΙΚΟ) | `2310:7926` | γραμμή ⇄ εθνικού κύκλου |
| RT10 / RT16 δίπλα-δίπλα | `2310:7923` / `2310:7925` | δύο ή τρία πάνελ (χωρίς ευθυγράμμιση χρόνου, βλ. F3) |
| Σύνθεση 1440 + 480 (Διεθνών) | `2283:8132` | θέση του πάνελ δίπλα στον πίνακα |
| Καταστάσεις κεφαλίδας | `2284:8348` | ακυρωμένο, επικάλυψη, αποθήκη τρίτου, συνεργάτης χωρίς πινακίδες |
| F4α H1 / H3 / Ε5 / χρώματα τμημάτων | `2120:7738` · `2123:7735` · `2140:7810` · `2140:7735` | πλακίδια τμημάτων, ⇄, λόγοι H-19 |
| F4α κάρτα κύκλου H6 | `2129:7735` | σύνδεση «Αλλαγή οχήματος» από το πάνελ |

**Εργασίες «πρώτα Figma»** (έγκριση owner **πριν** από τον κώδικα της αντίστοιχης εργασίας):
- **F1** — Το πάνελ μέσα στο Εβδομαδιαίο Εθνικών v5 στα 1440 + 480: μία σύνθεση για κύκλο και μία για παραγγελία
  (εθνική και VS με το διεθνές σκέλος για ανάγνωση), μαζί με τα κλειδιά–τιμές του εθνικού πάνελ. Λείπει: υπάρχει μόνο
  η σύνθεση του Διεθνών, `2283:8132`.
- **F2** — Γραμμή ⇄ με **ΕΝΔΙΑΜΕΣΟ** (τρία τμήματα). Λείπει: το RT17 δείχνει μόνο ΑΡΧΙΚΟ / ΤΕΛΙΚΟ. Χρώματα από
  `2140:7735`.
- **F3** — Δύο πάνελ δίπλα-δίπλα **ευθυγραμμισμένα στον χρόνο**: κοινός άξονας ημέρας, ημέρες επικάλυψης πορτοκαλί.
  Λείπει: τα RT10 / RT16 είναι δίπλα-δίπλα, αλλά όχι ευθυγραμμισμένα.
- **F4** — Φύλλο καταστάσεων σφάλματος του §4 για τα εθνικά: «χωρίς ανάθεση», «καθυστέρηση», «χώρα;», «διεθνές RT
  ίδιο φορτηγό», «διεθνές RT ίδιος οδηγός». Μερικώς υπάρχει στο `2284:8348`.
- **F5** — Καρτέλα **Φορτίο** του εθνικού πάνελ. Αφετηρία το `2283:10077`, αλλά ανά ΚΑΘΟΔΟ / ΑΝΟΔΟ και ανά
  παραγγελία (VS ή εθνική), με το μπλοκ ΦΟΡΤΗΓΟ 33 και το «δεν γράφτηκε» για θερμοκρασία και ανταλλαγή.
- **F6** — Καρτέλα **Έγγραφα** που δείχνει μόνο ό,τι κρατά η βάση. Αφετηρία το `2283:10126`, χωρίς «CMR» και «Εντολή
  πελάτη», γιατί δεν υπάρχει στήλη είδους. Περιλαμβάνει «ίδιο αρχείο» (sha256), «0 αρχεία σε παραδομένη» κόκκινο, και
  «Οι εθνικές παραγγελίες δεν κρατούν έγγραφα στο TMS».
- **F7** — Καρτέλα **Ιστορικό**, με τις πέντε καταστάσεις του T11 (απέτυχε, 0 γραμμές, πριν από το L, κομμένο στις
  200, πεδίο που δεν καταγράφεται). Και το «ποιος» χωρίς όνομα για τους ρόλους εκτός owner / management.

## 4 · Σφάλματα δεδομένων → κανόνας → κόκκινο στο πάνελ → test

| Εύρημα (ROUTE-GRAMMAR §3) | Κανόνας | Στο πάνελ (Φάση Α) | Test |
|---|---|---|---|
| 64 VS χωρίς εθνικό εκτελεστή (E2) | K10 | στάση σε κύκλο με `has_vehicle=false`, ή κομμάτι σε αναμονή μετά την ημέρα του: κόκκινη κουκκίδα + «χωρίς ανάθεση» + γραμμή κεφαλίδας | `tests/route-panel-model.test.js` «K10 χωρίς όχημα = κόκκινο» (T2) και «κομμάτι σε αναμονή» (T8) + μετάλλαξη |
| `has_late` (καθυστέρηση, spec §2.3) | K5 (ημέρα = ιδιότητα, όριο η ζητούμενη) | κόκκινη κουκκίδα + «καθυστέρηση» | ίδιο αρχείο, «has_late = κόκκινο» |
| 25 τόποι χωρίς χώρα (N2) | σημάδι N2 | κόκκινο «χώρα;» στη μεταγραφή τόπου, ποτέ μαντεμένο «GR» | ίδιο αρχείο, «χώρα κενή = κόκκινο» |
| 79 RT με επικάλυψη ≥ 2 ημερών (E5) · Γ1 διεθνές φορτηγό σε εθνικό · Γ4 οδηγός | K8 | δεύτερο πάνελ δίπλα-δίπλα (κανόνας 7) + πορτοκαλί ημέρες + κόκκινη γραμμή κεφαλίδας. **Μία** κοινή ημέρα = κανονική αλλαγή, όχι σφάλμα | `tests/route-panel-data.test.js` «1 ημέρα δεν σημαίνει», «2 ημέρες σημαίνει», φορτηγό και οδηγός |
| #519 γονέας και σκέλος σε RT (E7) | K7 | Φάση Β (διεθνές) | `tests/route-grammar.test.js` ισοτιμία: η #519 έχει `E7` |
| #259 κατεύθυνση σκέλους ≠ παραγγελίας (E9) | K7 | Φάση Β (διεθνές) | ίδιο, η #259 έχει `E9` |
| Όλα τα σημάδια των 691 εγγραφών | K0–K10 | — | ισοτιμία JS ↔ `route-grammar-formulas.csv` (T1) |
| Πάνω από 33 παλέτες σε μία πλευρά | όριο 33 (`WN5L.CAP`, Ε-17) | Φορτίο: κόκκινο στο μπλοκ ΦΟΡΤΗΓΟ | `tests/route-panel-tabs.test.js` (T9) |
| Θερμοκρασία ή ανταλλαγή που δεν γράφτηκε | K5 (ιδιότητα που λείπει) | Φορτίο: «δεν γράφτηκε», ποτέ «Όχι» ή 0 | ίδιο, «missing» (T9) |
| Παραδομένη παραγγελία χωρίς έγγραφο | — | Έγγραφα: κόκκινο «Κανένα έγγραφο σε παραδομένη» | ίδιο (T10) |
| Ανάγνωση ιστορικού που απέτυχε · 0 γραμμές · πριν από το L | αρχή 1 | Ιστορικό: ρητό κείμενο ανά κατάσταση, ποτέ κενό | ίδιο (T11) |

## 5 · Αρχεία

| Αρχείο | Ευθύνη | Νέο / αλλαγή | Και στο F4α; |
|---|---|---|---|
| `core/route-grammar.js` | K0–K10: τύπος, κανόνες, σημάδια από κανονικοποιημένη είσοδο | νέο | όχι |
| `core/route-panel-model.js` | μοντέλο πάνελ από κύκλο ή παραγγελία του board | νέο | όχι |
| `core/route-panel-data.js` | συμφραζόμενα: board ±1 εβδομάδα, τόποι, διεθνή RT | νέο | όχι |
| `modules/route_panel.js` | DOM: συρτάρι 480, δίπλα-δίπλα, κλείσιμο | νέο | όχι |
| `docs/order-route/route-grammar-input.sql` | SELECT εξαγωγής εισόδου για το test ισοτιμίας | νέο | όχι |
| `tests/fixtures/route-grammar-input.json` | η είσοδος (μόνο ids και booleans) | νέο | όχι |
| `core/route-panel-tabs.js` | οι καρτέλες Φορτίο / Έγγραφα / Ιστορικό (καθαρό) | νέο | όχι |
| `tests/route-grammar.test.js` · `tests/route-panel-model.test.js` · `tests/route-panel-data.test.js` · `tests/route-panel-html.test.js` · `tests/route-panel-tabs.test.js` | unit tests | νέα | όχι |
| M-1 `worker/migrations/<επόμενο>_plan_history*.sql` · W-2 `worker/src/index.js` (`PLAN_ROUTES`) | ανάγνωση ιστορικού | νέα / αλλαγή | **όχι F4α: αλυσίδα Worker και διαδικασία βάσης**, δικό τους PR |
| `tests/critics/route-panel-rig.js` | rig στον πραγματικό browser με ψεύτικο `/plan/*` (μοτίβο wn5-board-rig) | νέο | όχι (διαβάζει το `tests/fixtures/wn5-week.json` του F4α) |
| `docs/route-panel/BRIEF-T*.md` · `docs/route-panel/DEFERRED.md` | τιμές Figma ανά εργασία · λίστα ≤ 2px | νέα | όχι |
| `modules/weekly_natl_v5.js` | ένας delegated click listener + κλήση `RoutePanel` | αλλαγή | **ναι** |
| `assets/style.css` | ενότητα `.rp-*` | αλλαγή | **ναι** |
| `app.html` | 4 νέα `<script>` + bump | αλλαγή | **ναι** |
| `sw.js` | `SW_VERSION` + νέα αρχεία στο app shell | αλλαγή | **ναι** |
| `config.js` | `FEATURES.ROUTE_PANEL: false` | αλλαγή | **ναι** |
| `core/wn5-logic.js` · `core/wn5-labels.js` | **μόνο ανάγνωση**: `WN5L.handoversOf`, `WN5L.stopSegments`, `WN5Lab.reasonLine` (T24) | καμία αλλαγή | ναι (T24) |

**Κοινά αρχεία με το F4α:** `modules/weekly_natl_v5.js`, `assets/style.css`, `app.html`, `sw.js`, `config.js`. Κάθε
εργασία που τα αγγίζει (T4, T5, T6, T7, T9, T10, T11, T12) τρέχει **μόνο μετά το merge του F4α**. Το T6 (⇄) τρέχει μετά το merge
των T24/T25. Τα T1–T3 και T8-μοντέλο δεν αγγίζουν κοινό αρχείο, αλλά δεν γίνεται merge πριν από το F4α (owner 27/10).

---

## 6 · Εργασίες

### Task 0: Πύλες εκκίνησης

**Files:** κανένα (έλεγχος).

- [ ] **Step 1: F4α στο `main`**

Run: `git fetch origin && git log --oneline origin/main --merges | grep -m1 "national-v5-f4a-screens"`
Expected: το merge commit του `feat/national-v5-f4a-screens`. Αν δεν υπάρχει: **ΣΤΑΜΑΤΑ** (owner 27/10).

- [ ] **Step 2: εγκρίσεις Figma**

Για κάθε εργασία που ξεκινά, ο αντίστοιχος κόμβος F1–F7 του §3 πρέπει να έχει «ναι» του owner, γραμμένο στο
`docs/DECISION_LOG.md`. Αλλιώς η εργασία περιμένει.

- [ ] **Step 3: M-1 + W-2 για το Ιστορικό**

Η πρώτη έκδοση έχει τέσσερις καρτέλες (owner 28/10), άρα το PR υλοποίησης περιμένει το M-1 εκτελεσμένο και το W-2
deployed. Έλεγχος: `curl -s -o /dev/null -w '%{http_code}' $PROXY_URL/plan/history?rt_id=1` → `401` (υπάρχει) και όχι
`404`. Οι T1–T10 μπορούν να προχωρούν στο μεταξύ. Το T11 περιμένει.

- [ ] **Step 4: νέο branch από φρέσκο `main`**

```bash
git fetch origin && git switch -c feat/route-panel origin/main
```

### Task 1: `core/route-grammar.js` και ισοτιμία με το SQL

**Γιατί:** η γραμματική είναι ήδη επικυρωμένη στο SQL (691 εγγραφές, 0 ανεξήγητα). Μια δεύτερη υλοποίηση στο JS
είναι δεύτερη πηγή αλήθειας (αρχή 3). Γι' αυτό τις δένει ένα test: αν διαφέρουν σε μία εγγραφή, το suite σπάει.

**Files:**
- Create: `docs/order-route/route-grammar-input.sql`
- Create: `tests/fixtures/route-grammar-input.json`
- Create: `core/route-grammar.js`
- Test: `tests/route-grammar.test.js`

**Interfaces:**
- Produces: `RG.order(input) → {formula:string, rules:string[], flags:string[]}`,
  `RG.nationalLoad(input) → {formula, rules, flags}`, `RG.rt(input) → {formula, rules, flags}`,
  `RG.overlapDays(a:[isoDate,isoDate], b:[isoDate,isoDate]) → number` (κοινές ημέρες, inclusive).
- Η είσοδος είναι **ακριβώς** οι στήλες των CTE `b` / `nlx` / `rr` του `route-grammar.sql` (ονόματα snake_case).

- [ ] **Step 1: SELECT εξαγωγής εισόδου**

Αντίγραψε το `docs/order-route/route-grammar.sql` στο `docs/order-route/route-grammar-input.sql` και άλλαξε **μόνο**
την τελευταία πρόταση: σβήσε το CTE `al AS (...)`, το κόμμα πριν από αυτό και το τελικό `SELECT`, και βάλε στη
θέση τους το παρακάτω. Τα κείμενα σημειώσεων **δεν** εξάγονται, μόνο τα booleans που
βγάζει το SQL από αυτά. Έτσι δεν φτάνει όνομα στο repo.

```sql
-- the INPUT of every formula, for tests/route-grammar.test.js (ids and booleans only, never notes text)
SELECT json_build_object(
  'orders', (SELECT json_agg(json_build_object(
      'id', id, 'par', par, 'leg_no', leg_no, 'p', p, 'ch', ch, 'nlex', nlex, 'nln', nln, 'kex', kex, 'kn', kn,
      'kmx', kmx, 'kid_in_rt', kid_in_rt, 'legs_join', legs_join, 's_out', s_out, 's_in', s_in, 'merged', merged,
      'w_leave', w_leave, 'w_pick', w_pick, 'cus', cus, 'tr', tr, 'xl', xl, 'ret', ret, 'nrt', nrt,
      'dir_off', dir_off, 'd0_past', d0 < current_date, 'nodate', nodate) ORDER BY id) FROM b),
  'national_loads', (SELECT json_agg(json_build_object(
      'id', id, 'source_type', source_type, 'np', np, 'nd', nd, 'hp', hp, 'hd', hd, 'ex', ex, 'in_rt', in_rt,
      'src_live', src_live, 'dday_past', dday < current_date) ORDER BY id) FROM nlx),
  'rts', (SELECT json_agg(json_build_object(
      'code', rr.code, 'trip_type', rr.trip_type, 'status', rr.status, 'truck', rr.truck_id IS NOT NULL,
      'driver', rr.driver_id IS NOT NULL, 'overlap2', coalesce(ov.x,false),
      'tokens', (SELECT json_agg(tok ORDER BY f) FROM t WHERE t.rt_id=rr.id),
      'dir_off', EXISTS (SELECT 1 FROM lg WHERE lg.rt_id=rr.id AND lg.dir_off)) ORDER BY rr.id) FROM rr LEFT JOIN ov ON ov.id=rr.id)
) AS input;
```

Run (Supabase SQL editor, μόνο SELECT): αποθήκευσε το αποτέλεσμα ως `tests/fixtures/route-grammar-input.json`. Την
ίδια ώρα ξανατρέξε το `route-grammar.sql` και ανανέωσε το `route-grammar-formulas.csv`, ώστε fixture και CSV να
είναι της ίδιας στιγμής.
Expected: `orders` 398 στοιχεία, `national_loads` 81, `rts` 212 (ή τα νούμερα της ημέρας, ίδια με τα `count(*)`).

- [ ] **Step 2: Γράψε το test ισοτιμίας (αποτυγχάνει)**

```js
// tests/route-grammar.test.js
// Why: the grammar lives twice — route-grammar.sql (the audit) and core/route-grammar.js (the screen). One record
// that differs means the panel says something the audit does not (principle 3), so the suite fails on it.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sb = { window: {}, console };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/route-grammar.js'), 'utf8'), sb);
const RG = sb.window.RG;
const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/route-grammar-input.json'), 'utf8'));
const csv = fs.readFileSync(path.join(ROOT, 'docs/order-route/route-grammar-formulas.csv'), 'utf8').trim().split('\n').slice(1);
const want = new Map();
for (const line of csv) {
  // kind,id,formula,rules,flags,link — formulas use · + [ ] and never a comma
  const m = line.match(/^(order|national_load|rt),([^,]+),([^,]*),([^,]*),([^,]*),([^,]*)$/);
  assert.ok(m, 'csv line: ' + line);
  want.set(m[1] + ':' + m[2], { formula: m[3], rules: m[4], flags: m[5] });
}
function same(kind, id, got) {
  const w = want.get(kind + ':' + id);
  assert.ok(w, `${kind} ${id} missing from csv`);
  assert.strictEqual(got.formula, w.formula, `${kind} ${id} formula`);
  assert.strictEqual(got.rules.join('+'), w.rules, `${kind} ${id} rules`);
  assert.strictEqual(got.flags.join(' '), w.flags, `${kind} ${id} flags`);
}
test('every order equals the SQL audit', () => { for (const o of input.orders) same('order', o.id, RG.order(o)); });
test('every national load equals the SQL audit', () => { for (const n of input.national_loads) same('national_load', n.id, RG.nationalLoad(n)); });
test('every RT equals the SQL audit', () => { for (const r of input.rts) same('rt', r.code, RG.rt(r)); });
test('counts are the whole base', () => {
  assert.strictEqual(input.orders.length + input.national_loads.length + input.rts.length, want.size);
});
test('the data errors of ROUTE-GRAMMAR §3 keep their flags', () => {
  const o = (id) => RG.order(input.orders.find((x) => x.id === id));
  assert.ok(o(519).flags.includes('E7:parent-and-leg-both-in-RT'));
  assert.ok(o(259).flags.includes('E9:RT-leg-direction-differs'));
});
test('K8: one shared day is a swap, two are an overlap', () => {
  assert.strictEqual(RG.overlapDays(['2026-10-20', '2026-10-22'], ['2026-10-22', '2026-10-25']), 1);
  assert.strictEqual(RG.overlapDays(['2026-10-20', '2026-10-23'], ['2026-10-22', '2026-10-25']), 2);
  assert.strictEqual(RG.overlapDays(['2026-10-20', '2026-10-21'], ['2026-10-22', '2026-10-25']), 0);
});
```

Run: `node --test tests/route-grammar.test.js`
Expected: FAIL, `Cannot read properties of undefined (reading 'order')`.

- [ ] **Step 3: Γράψε τη γραμματική**

Κάθε κλάδος αντιστοιχεί ένα προς ένα στο SQL. Το σχόλιο σε κάθε κλάδο λέει από ποιο CTE του SQL προέρχεται.

```js
// core/route-grammar.js — the route grammar K0–K10 of docs/order-route/ROUTE-GRAMMAR.md, for the screens.
// Why one file: the panel never draws a route by hand; it asks this file. tests/route-grammar.test.js keeps it equal
// to docs/order-route/route-grammar.sql record by record (principle 3: the SQL is the audit, this is its runtime twin).
(function () {
  'use strict';
  const join = (a, s) => a.filter(Boolean).join(s);
  // route-grammar.sql «fo»: the chain with the note-only nodes written in
  function chainOf(o) {
    const ch = o.ch;
    if (ch == null) return '∅';
    if (o.cus) return ch.replace(/^(L[g?]?[0-9]*)/, '$1+C·C').replace(/(D[g?]?[0-9]*)$/, '$1+C');
    if (o.tr) return ch.split('Vl').join('X@V');
    if (o.w_leave && ch.includes('H')) return ch.split('·H').join('·W↓·H');
    if (o.w_leave) return ch.replace(/^(L[g?]?[0-9]*)/, '$1·W↓');
    if (o.w_pick) return ch.replace(/^(L[g?]?[0-9]*)/, '$1·W↑');
    if (o.xl) return ch + '·+L'; // an extra load that exists only in the notes: its place is not recorded
    return ch;
  }
  function order(o) {
    const ex = o.par != null ? `leg${o.leg_no == null ? '?' : o.leg_no}:${o.p ? 'P' : 'O'}`
      : o.kex != null ? o.kex : o.tr ? 'K→O' : o.p ? 'P' : 'O';
    const formula = ex + '[' + (o.s_out ? 'S↓·' : '') + chainOf(o) + (o.s_in ? '·S↑' : '') + ']'
      + (o.nlex != null ? ' H›' + o.nlex : '') + (o.merged ? ' ⊕' : '') + (o.ret ? ' ↩' : '');
    const ch = o.ch;
    const rules = [
      ch == null && 'K0',
      ch != null && 'K1',
      // K2 = a node with two operations; Veroia as a plain place (Vl / Vd) is ONE operation
      ((ch != null && ch.includes('H')) || o.cus || o.tr || o.w_leave || o.w_pick || o.s_in || o.s_out
        || (o.kex != null && o.kex.includes('→'))) && 'K2',
      (o.w_leave || (o.nln || 0) > 1) && 'K3',
      o.merged && 'K4',
      o.ret && 'K6',
      o.nrt > 0 && 'K7',
    ].filter(Boolean);
    const flags = [
      ch == null && 'E0:no-nodes',
      o.kmx != null && o.kn < 2 && 'E1:split-leg-missing',
      o.kex != null && o.legs_join === false && 'E1b:split-legs-do-not-join',
      ch != null && !ch.includes('?') && !/(^|·)[LD][0-9]*(·|$)/.test(ch) && 'E11:international-without-foreign-node',
      o.nlex === '∅' && 'E2:national-leg-no-executor',
      o.nrt === 0 && o.kex == null && ch != null && (o.d0_past ? 'E3:no-RT(past)' : 'S:unassigned-yet'),
      o.kex != null && o.nrt > 0 && o.kid_in_rt && 'E7:parent-and-leg-both-in-RT',
      o.nodate && 'E8:stop-without-date',
      o.dir_off && 'E9:RT-leg-direction-differs',
      ch != null && ch.includes('?') && 'N2:place-without-country',
      (o.w_leave || o.w_pick || o.cus || o.xl || o.tr) && 'N:node-only-in-notes',
    ].filter(Boolean);
    return { formula, rules, flags };
  }
  function nationalLoad(n) {
    const direct = n.source_type === 'Direct';
    const from = join([n.np > 0 && 'Lg' + (n.np > 1 ? n.np : ''), n.hp && (direct ? 'H' : 'Vl')], '');
    const to = join([n.hd && (direct ? 'H' : 'Vd'), n.nd > 0 && 'Dg' + (n.nd > 1 ? n.nd : '')], '');
    const formula = n.ex + '[' + from + ((n.np > 0 || n.hp) && (n.nd > 0 || n.hd) ? '·' : '') + to + ']'
      + (n.source_type === 'Groupage' ? ' ⊕' : '');
    const rules = ['K1', (n.hp || n.hd) && direct && 'K2', n.source_type === 'Groupage' && 'K4', n.in_rt && 'K7'].filter(Boolean);
    const flags = [
      n.ex === '∅' && 'E2:no-executor' + (n.dday_past ? '(past)' : '(future)'),
      n.ex === 'O' && !n.in_rt && 'E4:own-truck-leg-in-no-RT',
      !n.src_live && 'E10:source-deleted',
      (n.source_type === 'National' || n.source_type === 'Groupage') && 'T:test-row-deleted-on-L',
    ].filter(Boolean);
    return { formula, rules, flags };
  }
  function rt(r) {
    const toks = r.tokens || [];
    const formula = (r.trip_type === 'OWNED' ? 'O' : 'P') + '[' + (toks.length ? toks.join('+') : '∅') + ']'
      + (r.status === 'cancelled' ? ' cancelled' : '');
    const rules = [toks.some((t) => t.includes('[')) && 'K4', 'K7', r.overlap2 && 'K8'].filter(Boolean);
    const flags = [
      r.overlap2 && 'E5:overlap>=2days',
      r.status !== 'cancelled' && r.trip_type === 'OWNED' && (!r.truck || !r.driver) && 'E6:owned-without-truck-or-driver',
      r.dir_off && 'E9:leg-direction-differs-from-order',
    ].filter(Boolean);
    return { formula, rules, flags };
  }
  // K8 counts days, inclusive on both ends (route-grammar.sql «ov»: daterange '[]')
  function overlapDays(a, b) {
    const d = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
    const lo = Math.max(d(a[0]), d(b[0]));
    const hi = Math.min(d(a[1]), d(b[1]));
    return hi < lo ? 0 : hi - lo + 1;
  }
  window.RG = Object.freeze({ order, nationalLoad, rt, overlapDays });
})();
```

- [ ] **Step 4: Run, PASS**

Run: `node --test tests/route-grammar.test.js`
Expected: 6 pass. Αν μια εγγραφή διαφέρει, το μήνυμα λέει ποια και ποιο πεδίο. Διόρθωσε το JS, **ποτέ** το CSV με
το χέρι.

- [ ] **Step 5: Απόδειξη μετάλλαξης**

Σβήσε προσωρινά τον κλάδο `kex.includes('→')` του K2 και τρέξε το test.
Expected: FAIL στις #269, #271, #478, #509, #535 (οι γονείς σπασίματος). Επανέφερε τον κλάδο και τρέξε ξανά: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/route-grammar.js tests/route-grammar.test.js tests/fixtures/route-grammar-input.json docs/order-route/route-grammar-input.sql docs/order-route/route-grammar-formulas.csv
git commit -m "feat(route-panel): T1 route grammar K0-K10 in JS, equal to the SQL audit record by record"
```

### Task 2: `core/route-panel-model.js` (μοντέλο πάνελ κύκλου)

**Brief πριν από τον κώδικα:**
- Γράψε το `docs/route-panel/BRIEF-T2.md` με τις τιμές κειμένου και χρώματος των κόμβων `953:2417` (πρότυπο),
  `2310:7926` (RT17), και των F1 / F4 όταν εγκριθούν.
- Πηγή τιμών: `get_design_context` ή `use_figma` (`findAll(TEXT)` + fills).
- Οι γνωστές τιμές της 26/10 (πρέπει να ξαναμετρηθούν στο brief):
  - κουκκίδα εκτελεσμένη `#98A2B3`, σήμερα `#027BBD`, μελλοντική λευκή με δαχτυλίδι `#94A3B8` 2px·
  - κόμβος `#D97706` με σημείωση `#92400E`·
  - κόκκινο `#B91C1C`, πορτοκαλί επικάλυψης `#B45309`·
  - ΑΡΧΙΚΟ `#64748B` · ΕΝΔΙΑΜΕΣΟ `#D97706` · ΤΕΛΙΚΟ `#0284C7` (F4α `--wn5-seg-*`).

**Files:**
- Create: `core/route-panel-model.js`
- Test: `tests/route-panel-model.test.js`

**Interfaces:**
- Consumes: board JSON (072 `plan_board` + 072b `segments`): `cycle {rt_id, code, trip_type, truck, trailer, driver,
  partner, date_start, date_end, ended, stops[{stop_id, seq, side, location_id, location, planned_from, planned_to,
  stop_day, executed, has_vehicle, has_late, legs[{act, pallets, order_id, nat_order_id, reference, temperature_c}]}],
  segments[]}`, `hub {location_id}`.
- Consumes (T6 μόνο): `ctx.handovers`, που φτιάχνει το T6 από το `WN5L.handoversOf(cycle)` →
  `[{at, place_note, reason, segmentId, label, beforeStopId, afterStopId}]` και από το `WN5Lab.reasonLine(code)` (T24
  του F4α).
- Produces: `RPM.cycle(cycle, ctx) → Model`, όπου:
  - `ctx = {today:'YYYY-MM-DD', hubId:number, countryOf:(locationId)→string|null,
    handovers?:Array<{at, place_note, reasonText, label, beforeStopId}>,
    overlaps?:Array<{code, kind:'truck'|'driver', days:string[]}>}`·
  - `Model = {head:{chip:string[], who:string, status:string, sub:string, warnings:Array<{tone:'red'|'orange', text}>},
    sections:Array<{title:'ΚΑΘΟΔΟΣ'|'ΑΝΟΔΟΣ', rows:Array<Row>}>, overlapDays:string[],
    kv:Array<[string,string,('red'|'orange'|null)]>, footer:['whatsapp','order','delay']}`·
  - `Row = {kind:'stop'|'hand', stopId?, label, date, name, meta, dot:'done'|'today'|'future'|'red'|'hub'|'hand',
    note:{tone,text}|null, seg:'initial'|'intermediate'|'final'|null, rule:string|null}`.

- [ ] **Step 1: Γράψε τα tests (αποτυγχάνουν)**

```js
// tests/route-panel-model.test.js — synthetic cycles only (the repo is public)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sb = { window: {}, console };
vm.createContext(sb);
for (const f of ['core/route-grammar.js', 'core/route-panel-model.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb);
const RPM = sb.window.RPM;
// vm objects come from another realm: compare them as plain JSON, never by prototype
const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);
const HUB = 360;
const stop = (o) => Object.assign({ stop_id: 1, seq: 1, side: 'KATHODOS', location_id: 900, location: 'Τόπος 900',
  planned_from: '2026-10-13T06:00:00+03:00', planned_to: '2026-10-13T08:00:00+03:00', stop_day: '2026-10-13',
  executed: false, has_vehicle: true, has_late: false, legs: [{ act: 'unload', pallets: 6, order_id: 10, nat_order_id: null }] }, o);
const cycle = (stops, o) => Object.assign({ rt_id: 7, code: 'RT-9001', trip_type: 'OWNED', truck: 'TRK-1', trailer: 'TRL-1',
  driver: 'DRV-1', date_start: '2026-10-13', date_end: '2026-10-14', ended: false, stops, segments: [] }, o);
const ctx = (o) => Object.assign({ today: '2026-10-13', hubId: HUB, countryOf: () => 'GR' }, o);

test('sections by direction, KATHODOS first, one row per stop', () => {
  const m = RPM.cycle(cycle([stop({ stop_id: 2, seq: 2, side: 'ANODOS' }), stop({ stop_id: 1, seq: 1 })]), ctx());
  eq(m.sections.map((s) => s.title), ['ΚΑΘΟΔΟΣ', 'ΑΝΟΔΟΣ']);
  eq(m.sections.map((s) => s.rows.length), [1, 1]);
});
test('the hub stop reads «Cross-dock · Βέροια (VS)» with the hub dot', () => {
  const r = RPM.cycle(cycle([stop({ location_id: HUB, legs: [{ act: 'load', pallets: 20, order_id: 10 }] })]), ctx()).sections[0].rows[0];
  assert.strictEqual(r.label, 'Cross-dock · Βέροια (VS)');
  assert.strictEqual(r.dot, 'hub');
});
test('dot by state: done, today, future', () => {
  const m = RPM.cycle(cycle([
    stop({ stop_id: 1, seq: 1, stop_day: '2026-10-12', executed: true }),
    stop({ stop_id: 2, seq: 2, stop_day: '2026-10-13' }),
    stop({ stop_id: 3, seq: 3, stop_day: '2026-10-14' })]), ctx());
  eq(m.sections[0].rows.map((r) => r.dot), ['done', 'today', 'future']);
});
test('K10: a stop of a cycle without a vehicle is red «χωρίς ανάθεση», also in the header', () => {
  const m = RPM.cycle(cycle([stop({ has_vehicle: false })], { truck: null, driver: null }), ctx());
  const r = m.sections[0].rows[0];
  assert.strictEqual(r.dot, 'red');
  eq(r.note, { tone: 'red', text: 'χωρίς ανάθεση' });
  assert.strictEqual(r.rule, 'K10');
  assert.ok(m.head.warnings.some((w) => w.tone === 'red' && /χωρίς ανάθεση/.test(w.text)));
});
test('late is red «καθυστέρηση»', () => {
  const r = RPM.cycle(cycle([stop({ has_late: true })]), ctx()).sections[0].rows[0];
  assert.strictEqual(r.dot, 'red');
  eq(r.note, { tone: 'red', text: 'καθυστέρηση' });
});
test('N2: a place without a country is red «χώρα;» in the meta, never guessed as Greek', () => {
  const r = RPM.cycle(cycle([stop()]), ctx({ countryOf: () => null })).sections[0].rows[0];
  assert.match(r.meta, /χώρα;/);
  assert.strictEqual(r.rule, 'N2');
});
test('K8: overlaps from ctx become one red header line per kind and orange days', () => {
  const m = RPM.cycle(cycle([stop()]), ctx({ overlaps: [{ code: 'RT-1023', kind: 'truck', days: ['2026-10-13', '2026-10-14'] }] }));
  assert.ok(m.head.warnings.some((w) => w.tone === 'red' && /RT-1023/.test(w.text)));
  eq(m.overlapDays, ['2026-10-13', '2026-10-14']);
});
test('footer order is fixed', () => {
  eq(RPM.cycle(cycle([stop()]), ctx()).footer, ['whatsapp', 'order', 'delay']);
});
```

Run: `node --test tests/route-panel-model.test.js`
Expected: FAIL, `RPM` undefined.

- [ ] **Step 2: Γράψε το μοντέλο**

```js
// core/route-panel-model.js — the route panel's model, built from data by the grammar's rules, never by hand.
// Owner 26/10: 480 panel · sections by direction · one line per stop · dot by state · ⇄ with segment colours ·
// «Cross-dock · Βέροια (VS)» · side-by-side when the vehicle has a second RT · fixed footer.
(function () {
  'use strict';
  const SIDE = [['KATHODOS', 'ΚΑΘΟΔΟΣ'], ['ANODOS', 'ΑΝΟΔΟΣ']];
  const SEG = { initial: 'initial', intermediate: 'intermediate', final: 'final' };
  const DAY = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
  const fmtDay = (d) => { const x = new Date(d + 'T12:00:00Z'); return DAY[x.getUTCDay()] + ' ' + x.getUTCDate() + '/' + (x.getUTCMonth() + 1); };
  const palletsOf = (s) => (s.legs || []).reduce((a, l) => a + (Number(l.pallets) || 0), 0);
  function stopRow(s, ctx) {
    const hub = s.location_id === ctx.hubId;
    const acts = new Set((s.legs || []).map((l) => l.act));
    const label = hub ? 'Cross-dock · Βέροια (VS)' : acts.has('load') && !acts.has('unload') ? 'Φόρτωση' : 'Παράδοση';
    const country = ctx.countryOf(s.location_id);
    const p = palletsOf(s);
    const meta = [country == null ? 'χώρα;' : country, p ? p + ' π.' : null].filter(Boolean).join(' · ');
    let dot = hub ? 'hub' : s.stop_day < ctx.today ? 'done' : s.stop_day === ctx.today ? 'today' : 'future';
    let note = null;
    let rule = country == null ? 'N2' : null;
    // K10: the leg exists before its vehicle; on the board that is has_vehicle = false (071 v_rt_stop_state)
    if (!s.has_vehicle) { dot = 'red'; note = { tone: 'red', text: 'χωρίς ανάθεση' }; rule = 'K10'; }
    else if (s.has_late) { dot = 'red'; note = { tone: 'red', text: 'καθυστέρηση' }; rule = 'K5'; }
    return { kind: 'stop', stopId: s.stop_id, label, date: fmtDay(s.stop_day), name: s.location, meta, dot, note, seg: null, rule };
  }
  function cycle(c, ctx) {
    const stops = (c.stops || []).slice().sort((a, b) => a.seq - b.seq);
    const sections = SIDE.map(([k, title]) => ({ title, rows: stops.filter((s) => s.side === k).map((s) => stopRow(s, ctx)) }))
      .filter((s) => s.rows.length);
    // K9: a vehicle change is a ⇄ row after the stop it follows (T6 fills ctx.handovers from F4α T24)
    for (const h of ctx.handovers || []) {
      for (const sec of sections) {
        const i = sec.rows.findIndex((r) => r.stopId === h.beforeStopId);
        if (i < 0) continue;
        sec.rows.splice(i + 1, 0, { kind: 'hand', label: 'Αλλαγή οχήματος', date: h.at ? fmtDay(h.at.slice(0, 10)) : '',
          name: h.place_note || '', meta: h.reasonText || '', dot: 'hand', note: null, seg: SEG[h.label] || null, rule: 'K9' });
        break;
      }
    }
    const warnings = [];
    if (stops.some((s) => !s.has_vehicle)) warnings.push({ tone: 'red', text: 'Κύκλος χωρίς ανάθεση: οι στάσεις του είναι προς ανάθεση.' });
    const overlapDays = [];
    for (const o of ctx.overlaps || []) {
      warnings.push({ tone: 'red', text: (o.kind === 'truck' ? 'Το φορτηγό' : 'Ο οδηγός') + ' είναι και στο ' + o.code + ': ' + o.days.map(fmtDay).join(', ') + '.' });
      for (const d of o.days) if (!overlapDays.includes(d)) overlapDays.push(d);
    }
    const chip = c.trip_type === 'OWNED' ? [c.truck, c.trailer].filter(Boolean) : [c.partner].filter(Boolean);
    return {
      head: { chip, who: c.trip_type === 'OWNED' ? (c.driver || '') : 'συνεργάτης', status: c.ended ? 'Ολοκληρώθηκε' : 'Σχέδιο',
        sub: c.code + ' · ' + fmtDay(c.date_start) + '–' + fmtDay(c.date_end), warnings },
      sections, overlapDays,
      kv: [], // the national panel's key/value lines come from the approved F1 (T2 brief); none until then
      footer: ['whatsapp', 'order', 'delay'],
    };
  }
  window.RPM = Object.freeze({ cycle });
})();
```

Το `kv` μένει κενό ως την έγκριση του F1. Τότε το brief του T2 ορίζει ποια κλειδιά–τιμές δείχνει το εθνικό πάνελ
και πώς μετρώνται. Ένα test ανά κλειδί μπαίνει στο Step 1 **πριν** από τον κώδικα. Οι λέξεις της κατάστασης
(«Σχέδιο» / «Ολοκληρώθηκε») ελέγχονται κι αυτές στο brief απέναντι στο F1 και στο λεξιλόγιο του F4α
(`core/wn5-labels.js`). Αν το F4α έχει λέξη, χρησιμοποιείται αυτή, όχι νέα.

- [ ] **Step 3: Run, PASS** — `node --test tests/route-panel-model.test.js`. Expected: 8 pass.
- [ ] **Step 4: Αποδείξεις μετάλλαξης** — σβήσε προσωρινά τον κλάδο `!s.has_vehicle`. Expected: FAIL στο «K10».
  Επανέφερε. Το ίδιο για το `country == null` (FAIL στο «N2»).
- [ ] **Step 5: Commit** — `git add core/route-panel-model.js tests/route-panel-model.test.js docs/route-panel/BRIEF-T2.md && git commit -m "feat(route-panel): T2 cycle model from the board by the grammar's rules"`

### Task 3: `core/route-panel-data.js` (συμφραζόμενα, μόνο ανάγνωση)

**Files:**
- Create: `core/route-panel-data.js`
- Test: `tests/route-panel-data.test.js`

**Interfaces:**
- Consumes: `window.WN5.state() → {board, model}` (F4α), `window.planFetch('GET', '/plan/board?week=YYYY-MM-DD')`
  (F4α `core/plan-api.js`), `window.atGetAll(TABLES.LOCATIONS, {filterByFormula})` (υπάρχον `core/api.js`),
  `window.plFetch('/costs/rt?...')` (υπάρχον).
- Produces: `RPD.forCycle(rtId) → Promise<{cycle, ctx}>` και `RPD.forOrder({order_id|nat_order_id}) →
  Promise<{cycles:Array, waiting:Array, intl:{stops}|null, ctx}>`. Το `ctx` είναι αυτό που περιμένει το `RPM.cycle`.

- [ ] **Step 0: Επιβεβαίωση ονομάτων πεδίων (παγίδα facade 1)**
  - Στον χάρτη `TABLES` του `worker/src/index.js`, για τον πίνακα LOCATIONS, βρες πώς επιστρέφει το facade το pg id
    του τόπου. Σήμερα ο χάρτης έχει `Country: "country"` (μονολεκτικό, χωρίς εισαγωγικά), αλλά όχι πεδίο id.
  - Αν το id έρχεται μόνο ως record id, η αντιστοίχιση γίνεται με τη μορφή id που χρησιμοποιεί ήδη το F4α για
    `location_id` (αναζήτηση στο `core/plan-ids.js`).
  - Γράψε την επιλογή στο `docs/route-panel/BRIEF-T3.md`. Το test του Step 1 χρησιμοποιεί **αυτό** το όνομα. Το
    `'Location Id'` παρακάτω είναι η θέση όπου μπαίνει.
- [ ] **Step 1: tests με ψεύτικα fetch (αποτυγχάνουν)**

```js
// tests/route-panel-data.test.js — every read is stubbed; the test asserts WHAT was asked, not only what came back
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
// vm objects come from another realm: compare them as plain JSON, never by prototype
const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);
function load(stubs) {
  const calls = [];
  const sb = Object.assign({ console, calls, TABLES: { LOCATIONS: 'tblxu8DRfTQOFRCzS' } }, stubs(calls));
  sb.window = sb;
  vm.createContext(sb);
  for (const f of ['core/route-grammar.js', 'core/route-panel-data.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb);
  return sb;
}
const BOARD = { week: '2026-10-10', hub: { location_id: 360 }, waiting: [], cycles: [{ rt_id: 7, code: 'RT-9001', trip_type: 'OWNED',
  truck_id: 3, driver_id: 4, date_start: '2026-10-13', date_end: '2026-10-14', stops: [{ stop_id: 1, location_id: 900, legs: [] }] }] };
test('forCycle reads the board already loaded, then countries and overlaps, never writes', async () => {
  const sb = load((calls) => ({
    WN5: { state: () => ({ board: BOARD }) },
    atGetAll: async (t, q) => { calls.push(['facade', t, q.filterByFormula]); return [{ id: 'rec900', fields: { 'Location Id': 900, Country: 'GR' } }]; },
    plFetch: async (p) => { calls.push(['costs', p]); return p.includes('truck_id=3')
      ? [{ id: 55, code: 'RT-1023', model: 1, status: 'planned', date_start: '2026-10-12', date_end: '2026-10-14' }] : []; },
    planFetch: async () => { throw new Error('no second board for a cycle'); },
  }));
  const { ctx } = await sb.RPD.forCycle(7);
  eq(ctx.overlaps, [{ code: 'RT-1023', kind: 'truck', days: ['2026-10-13', '2026-10-14'] }]);
  assert.ok(sb.calls.some((c) => c[0] === 'costs' && /overlap=1/.test(c[1]) && /truck_id=3/.test(c[1])));
  assert.ok(sb.calls.some((c) => c[0] === 'costs' && /driver_id=4/.test(c[1])));
});
test('K8: one shared day is a swap, not a warning', async () => {
  const sb = load(() => ({
    WN5: { state: () => ({ board: BOARD }) },
    atGetAll: async () => [],
    plFetch: async () => [{ id: 54, code: 'RT-1022', model: 1, status: 'closed', date_start: '2026-10-10', date_end: '2026-10-13' }],
    planFetch: async () => BOARD,
  }));
  const { ctx } = await sb.RPD.forCycle(7);
  eq(ctx.overlaps, []);
});
test('the cycle itself is never its own overlap', async () => {
  const sb = load(() => ({
    WN5: { state: () => ({ board: BOARD }) },
    atGetAll: async () => [],
    plFetch: async () => [{ id: 7, code: 'RT-9001', model: 2, status: 'planned', date_start: '2026-10-13', date_end: '2026-10-14' }],
    planFetch: async () => BOARD,
  }));
  const { ctx } = await sb.RPD.forCycle(7);
  eq(ctx.overlaps, []);
});
test('a failed read is loud: the error reaches the caller, never an empty route', async () => {
  const sb = load(() => ({ WN5: { state: () => ({ board: null }) }, atGetAll: async () => [], plFetch: async () => [], planFetch: async () => { throw new Error('net_failed'); } }));
  await assert.rejects(() => sb.RPD.forCycle(7), /no board/);
});
```

Run: `node --test tests/route-panel-data.test.js` — Expected: FAIL (`RPD` undefined).

- [ ] **Step 2: Γράψε τον συλλέκτη**

```js
// core/route-panel-data.js — what the route panel needs and the board does not hold, from EXISTING reads only.
// No write, no new endpoint (plan §2). A failed read throws: the panel says «δεν φορτώθηκε», never an empty route
// (principle 1 / facade trap 2: absent ≠ «all fine»).
(function () {
  'use strict';
  const RG = window.RG;
  const iso = (d) => String(d).slice(0, 10);
  async function overlapsFor(c) {
    const out = [];
    const span = [iso(c.date_start), iso(c.date_end || c.date_start)];
    for (const [kind, id] of [['truck', c.truck_id], ['driver', c.driver_id]]) {
      if (id == null) continue;
      const rows = await window.plFetch(`/costs/rt?${kind}_id=${encodeURIComponent(id)}&from=${span[0]}&to=${span[1]}&overlap=1`);
      for (const r of rows || []) {
        if (r.status === 'cancelled' || r.id === c.rt_id) continue;
        const other = [iso(r.date_start), iso(r.date_end || r.date_start)];
        // K8: one shared day is the normal swap (ROUTE-GRAMMAR §2); two or more is the error shown
        if (RG.overlapDays(span, other) < 2) continue;
        const days = [];
        for (let t = Date.parse(span[0] + 'T12:00:00Z'); t <= Date.parse(span[1] + 'T12:00:00Z'); t += 864e5) {
          const d = new Date(t).toISOString().slice(0, 10);
          if (d >= other[0] && d <= other[1]) days.push(d);
        }
        out.push({ code: r.code, kind, days });
      }
    }
    return out;
  }
  async function countries(locationIds) {
    const ids = [...new Set(locationIds.filter((x) => x != null))];
    if (!ids.length) return new Map();
    // the id field name is the one confirmed in Step 0 (BRIEF-T3) — facade trap 1
    const recs = await window.atGetAll(window.TABLES.LOCATIONS, { filterByFormula: 'OR(' + ids.map((i) => `{Location Id}=${i}`).join(',') + ')' });
    return new Map(recs.map((r) => [r.fields['Location Id'], r.fields.Country || null]));
  }
  async function forCycle(rtId) {
    const st = window.WN5 && window.WN5.state();
    if (!st || !st.board) throw new Error('no board');
    const c = st.board.cycles.find((x) => x.rt_id === Number(rtId));
    if (!c) throw new Error('cycle not on this board: ' + rtId);
    const cmap = await countries(c.stops.map((s) => s.location_id));
    return { cycle: c, ctx: { today: new Date().toISOString().slice(0, 10), hubId: st.board.hub && st.board.hub.location_id,
      countryOf: (id) => (cmap.has(id) ? cmap.get(id) : null), overlaps: await overlapsFor(c) } };
  }
  window.RPD = Object.freeze({ forCycle, _overlapsFor: overlapsFor });
})();
```

- [ ] **Step 3: Ημέρα Αθήνας.**
  - Το `today` γίνεται **ημέρα Αθήνας** (spec §2.3), με τη συνάρτηση ημέρας που χρησιμοποιεί ήδη το F4α (στο
    `core/wn5-logic.js` μετά το merge).
  - Πρώτα το test: ρολόι παγωμένο στις 00:30 Αθήνας της Τρίτης. Σε UTC αυτό είναι ακόμη Δευτέρα, και το `today`
    πρέπει να είναι η **Τρίτη**. Αποτυγχάνει με το `toISOString` του Step 2.
  - Μετά ο κώδικας.
- [ ] **Step 4: `forOrder`**
  - Πρώτα το test «παραγγελία με κομμάτι σε δύο εβδομάδες»: board της εβδομάδας με leg 1, board της +1 με leg 2.
    Πρέπει να γίνει ακριβώς **ένα** επιπλέον `planFetch('GET','/plan/board?week=…')`, και το αποτέλεσμα να έχει δύο
    κύκλους.
  - Μετά ο κώδικας:
    - βρίσκει στο board τα legs με `order_id` / `nat_order_id`·
    - αν η αλυσίδα ενός κομματιού δεν κλείνει στον τόπο τέλους του (K1, `leg_place`: αρχή → 360 → τέλος), φέρνει το
      board της επόμενης εβδομάδας·
    - για VS διαβάζει τις ORDER STOPS της διεθνούς, μόνο για ανάγνωση.
- [ ] **Step 5: Run, PASS** — `node --test tests/route-panel-data.test.js`.
- [ ] **Step 6: Μέτρηση χρόνου** — στο rig του T5, μέτρησε το δεύτερο board. Αν ξεπερνά 1,5 s στο 95ο εκατοστημόριο,
  άνοιξε το W-1 (§2) ως ξεχωριστό αίτημα αλυσίδας Worker. **Μην** το παρακάμψεις στο front end.
- [ ] **Step 7: Commit** — `git add core/route-panel-data.js tests/route-panel-data.test.js docs/route-panel/BRIEF-T3.md && git commit -m "feat(route-panel): T3 read-only context: board, countries, K8 overlaps with international RTs"`

### Task 4: `modules/route_panel.js` + CSS (συρτάρι 480) — μετά το merge του F4α

**Brief πριν από τον κώδικα:** `docs/route-panel/BRIEF-T4.md` με τις τιμές του εγκεκριμένου F1 και του προτύπου
`953:2417`. Από τη μέτρηση της 26/10 (ξαναμετριέται):
- πλάτος 480, γέμισμα `#FFFFFF`, περίγραμμα `#EAECF0`·
- κεφαλίδα padding 20/18, chip `#0B1929` με DM Mono 12.5, όνομα 14 SemiBold `#0F172A`, κατάσταση 11 Medium
  `#027BBD`, υπότιτλος 12 `#5B6B7F`·
- ετικέτα τμήματος 10.5 SemiBold `#5B6B7F`, letter-spacing 0.7, padding 10 πάνω στο πρώτο και 12 στα επόμενα·
- γραμμή στάσης H12: στήλη 14 (κουκκίδα 10, γραμμή 2×30 `#E2E8F0`), περιεχόμενο 413·
- κεφαλή γραμμής: ετικέτα 11 SemiBold ls 0.3 `#5B6B7F`, ημέρα 12 Medium `#475569` (σήμερα `#027BBD`)·
- όνομα 13 SemiBold, meta 12 `#5B6B7F`·
- κλειδί–τιμή 12 Regular / 12 Medium·
- footer: WhatsApp (γεμάτο navy) · Εντολή · Καθυστέρηση….

**Files:**
- Create: `modules/route_panel.js`
- Modify: `assets/style.css` (νέα ενότητα `/* route panel (F1 <node>) */` με κλάσεις `.rp-*`, κοινό αρχείο με το F4α)
- Modify: `app.html` (τέσσερα `<script>`: `core/route-grammar.js`, `core/route-panel-model.js`, `core/route-panel-data.js`,
  `modules/route_panel.js`, μετά το `modules/weekly_natl_v5.js`, με `?v=`), `sw.js` (`SW_VERSION` + τα 4 αρχεία στη
  λίστα app shell)
- Test: `tests/route-panel-html.test.js`

**Interfaces:**
- Consumes: `RPM.cycle`, `RPD.forCycle`.
- Produces: `RoutePanel.openCycle(rtId)`, `RoutePanel.close()`, `RoutePanel.html(model) → string` (καθαρή, για τα
  tests), `RoutePanel.isOpen() → boolean`.

- [ ] **Step 1: HTML tests (αποτυγχάνουν)** — με το μοντέλο του T2 ως είσοδο:
  - ένα `.rp-sec` ανά τμήμα, με τον τίτλο του·
  - ένα `.rp-row` ανά γραμμή·
  - `data-dot` ίσο με την κατάσταση·
  - `.rp-note[data-tone=red]` για κάθε κόκκινη σημείωση·
  - footer με τρία κουμπιά σε σειρά `data-act="whatsapp|order|delay"`·
  - κάθε κείμενο από δεδομένα περνά από escape (`<b>` στο όνομα τόπου βγαίνει ως `&lt;b&gt;`).

```js
// tests/route-panel-html.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sb = { window: {}, console, document: { addEventListener() {}, removeEventListener() {} } };
vm.createContext(sb);
for (const f of ['core/route-grammar.js', 'core/route-panel-model.js', 'modules/route_panel.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb);
const { RPM, RoutePanel } = sb.window;
const m = RPM.cycle({ rt_id: 7, code: 'RT-9001', trip_type: 'OWNED', truck: 'TRK-1', driver: 'DRV-1', date_start: '2026-10-13',
  date_end: '2026-10-14', stops: [
    { stop_id: 1, seq: 1, side: 'KATHODOS', location_id: 360, location: 'Βέροια', stop_day: '2026-10-13', has_vehicle: true, legs: [{ act: 'load', pallets: 20 }] },
    { stop_id: 2, seq: 2, side: 'KATHODOS', location_id: 900, location: '<b>Τόπος</b>', stop_day: '2026-10-14', has_vehicle: false, legs: [{ act: 'unload', pallets: 20 }] }] },
  { today: '2026-10-13', hubId: 360, countryOf: () => 'GR' });
const h = RoutePanel.html(m);
test('one section per direction, one row per stop', () => {
  assert.strictEqual((h.match(/class="rp-sec"/g) || []).length, 1);
  assert.strictEqual((h.match(/class="rp-row"/g) || []).length, 2);
});
test('dot state and red note come from the model', () => {
  assert.match(h, /data-dot="hub"/);
  assert.match(h, /data-dot="red"/);
  assert.match(h, /class="rp-note" data-tone="red">χωρίς ανάθεση/);
});
test('footer order is fixed', () => {
  const foot = h.split('class="rp-foot"')[1] || '';
  const acts = [...foot.matchAll(/data-act="(\w+)"/g)].map((x) => x[1]);
  assert.deepStrictEqual(acts, ['whatsapp', 'order', 'delay']);
});
test('data text is escaped', () => {
  assert.ok(h.includes('&lt;b&gt;Τόπος&lt;/b&gt;'));
  assert.ok(!h.includes('<b>Τόπος</b>'));
});
```

Run: `node --test tests/route-panel-html.test.js` — Expected: FAIL (`RoutePanel` undefined).

- [ ] **Step 2: Γράψε το `html(model)` και το συρτάρι.**

```js
// modules/route_panel.js — the route panel host: paints RPM's model in a 480 drawer beside the board.
// Owner 26/10: the board stays visible (no dark backdrop), read-only, fixed footer order.
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FOOT = { whatsapp: 'WhatsApp', order: 'Εντολή', delay: 'Καθυστέρηση…' };
  let _host = null;
  function rowHTML(r) {
    return `<div class="rp-row" data-kind="${esc(r.kind)}" data-dot="${esc(r.dot)}"${r.seg ? ` data-seg="${esc(r.seg)}"` : ''}>`
      + `<div class="rp-tl"><span class="rp-dot">${r.kind === 'hand' ? '⇄' : ''}</span><span class="rp-line"></span></div>`
      + `<div class="rp-c"><div class="rp-hd"><span class="rp-lab">${esc(r.label)}</span><span class="rp-day">${esc(r.date)}</span></div>`
      + `<div class="rp-name">${esc(r.name)}</div><div class="rp-meta">${esc(r.meta)}</div>`
      + (r.note ? `<div class="rp-note" data-tone="${esc(r.note.tone)}">${esc(r.note.text)}</div>` : '')
      + '</div></div>';
  }
  function html(m) {
    return '<div class="rp-head">'
      + `<div class="rp-h1">${m.head.chip.map((c) => `<span class="rp-chip">${esc(c)}</span>`).join('')}<span class="rp-who">${esc(m.head.who)}</span>`
      + '<button type="button" class="rp-x" aria-label="Κλείσιμο" data-act="close">✕</button></div>'
      + `<div class="rp-h2"><span class="rp-status">${esc(m.head.status)}</span><span class="rp-sub">${esc(m.head.sub)}</span></div>`
      + m.head.warnings.map((w) => `<div class="rp-warn" data-tone="${esc(w.tone)}">${esc(w.text)}</div>`).join('')
      + '</div><div class="rp-body">'
      + m.sections.map((s) => `<div class="rp-sec"><div class="rp-sec-t">${esc(s.title)}</div>${s.rows.map(rowHTML).join('')}</div>`).join('')
      + '</div>'
      + (m.kv.length ? `<div class="rp-kv">${m.kv.map(([k, v, t]) => `<div class="rp-kv-r"${t ? ` data-tone="${esc(t)}"` : ''}><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : '')
      + `<div class="rp-foot">${m.footer.map((a) => `<button type="button" class="rp-btn" data-act="${esc(a)}">${esc(FOOT[a])}</button>`).join('')}</div>`;
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    if (_host) _host.remove();
    _host = null;
    document.removeEventListener('keydown', onKey);
  }
  async function openCycle(rtId) {
    close();
    _host = document.createElement('aside');
    _host.className = 'rp';
    _host.setAttribute('aria-label', 'Διαδρομή');
    _host.innerHTML = '<div class="rp-load">Φόρτωση διαδρομής…</div>';
    document.body.appendChild(_host);
    document.addEventListener('keydown', onKey);
    const host = _host;
    try {
      const { cycle, ctx } = await window.RPD.forCycle(rtId);
      if (host !== _host) return; // closed or replaced while loading
      host.innerHTML = html(window.RPM.cycle(cycle, ctx));
    } catch (err) {
      if (host !== _host) return;
      // principle 1: a failed read is said, never an empty route
      if (typeof window.logError === 'function') window.logError(err, 'route_panel.openCycle');
      host.innerHTML = '<div class="rp-err">Η διαδρομή δεν φορτώθηκε. <button type="button" class="rp-btn" data-act="retry">Δοκίμασε ξανά</button></div>';
    }
    host.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'close') close();
      else if (a.dataset.act === 'retry') openCycle(rtId);
    });
  }
  window.RoutePanel = Object.freeze({ openCycle, close, html, isOpen: () => !!_host });
})();
```

  CSS στο `assets/style.css`, ενότητα `.rp-*`. Μοτίβο του `.mnt-drawer`: `position:fixed; top:0; right:0; bottom:0;
  width:480px; max-width:95vw`, **χωρίς** σκοτεινό φόντο, ώστε ο πίνακας να μένει ορατός (κανόνας 1). Όλες οι τιμές
  από το BRIEF-T4, με μεταβλητές του design system όπου υπάρχουν (`--accent`, `--text-mid`, `--wn5-seg-*`).
- [ ] **Step 3: Test αποτυχίας ανάγνωσης.** Με ψεύτικο `RPD.forCycle` που πετά σφάλμα, το `innerHTML` περιέχει
  «δεν φορτώθηκε» και το `logError` καλείται μία φορά. Σε απλό DOM stub· αλλιώς στο rig του T5, σενάριο `read-fail`.
- [ ] **Step 4: Footer.**
  - Τα τρία κουμπιά καλούν την **υπάρχουσα** ενέργεια του οικοδεσπότη: WhatsApp → το κείμενο διαδρομής που αντιγράφει
    ήδη το board · Εντολή → `print.html` του κύκλου · Καθυστέρηση… → ο λόγος καθυστέρησης στάσης (067) του οικοδεσπότη.
  - Βρες στο F4α ποια υπάρχουν, με `git grep -n "whatsapp\|print.html\|delay" modules/weekly_natl_v5.js modules/wn5_actions.js`.
  - Αν ο οικοδεσπότης δεν έχει μία από αυτές, το κουμπί μένει **στη θέση του, απενεργοποιημένο**, με `title` που λέει
    γιατί. Η σειρά είναι σταθερή (κανόνας 8). Βλ. ερώτηση owner 2 (§9).
  - Test: η σειρά μένει ίδια και με απενεργοποιημένο κουμπί.
- [ ] **Step 5: Run** — `node --test tests/route-panel-html.test.js` PASS, και όλο το suite `node --test tests/*.test.js tests/*.test.mjs tests/critics/*.test.js 2>&1 | grep -E '^ℹ (tests|pass|fail)'`
  PASS.
- [ ] **Step 6: Commit** — `git add modules/route_panel.js assets/style.css app.html sw.js tests/route-panel-html.test.js docs/route-panel/BRIEF-T4.md && git commit -m "feat(route-panel): T4 480 drawer host, read-only, fixed footer"`

### Task 5: Entry points στο Εβδομαδιαίο Εθνικών v5 + rig — μετά το merge του F4α

**Files:**
- Modify: `modules/weekly_natl_v5.js` (κοινό με F4α)
- Modify: `config.js` (`FEATURES.ROUTE_PANEL: false`, κοινό με F4α)
- Create: `tests/critics/route-panel-rig.js`

- [ ] **Step 1: Rig (αποτυγχάνει).**
  - Μοτίβο: `tests/critics/wn5-board-rig.js`: ψεύτικο `/plan/*` και `/costs/rt`, ρολόι Τρί 13/10/2026 09:30 Αθήνας,
    1920×1080, ρόλος dispatcher, flag ξαναγραμμένο στη μνήμη (ποτέ στο δίσκο).
  - Σενάρια:
    - `open-cycle`: κλικ σε `.wn5-asg` → `.rp` ορατό, πλάτος 480, ο πίνακας ορατός αριστερά.
    - `k10-red`: κύκλος χωρίς όχημα → κόκκινη κουκκίδα.
    - `k8-swap`: διεθνές RT ίδιο φορτηγό, 1 κοινή ημέρα → **καμία** κόκκινη γραμμή.
    - `read-fail`: 500 στο `/costs/rt` → «δεν φορτώθηκε».
    - `flag-off`: `ROUTE_PANEL:false` → κλικ δεν ανοίγει τίποτα, 0 κλήσεις `/costs/rt`.
  - Κάθε σενάριο κρίνεται και από **τι έφτασε** στο ψεύτικο backend: μέθοδος, διαδρομή, πλήθος. Στόχος: 0 εγγραφές
    (καμία μη-GET κλήση).
- [ ] **Step 2: Handlers.**
  - Στο `_rowHTML` του `modules/weekly_natl_v5.js`, πρόσθεσε στο `.wn5-asg` το `data-rp="cycle"`.
  - Ένας **delegated** click listener στη ρίζα `.wn5` καλεί το `RoutePanel.openCycle(row.dataset.rt)` μόνο όταν
    `FEATURES.ROUTE_PANEL`. Δεν μπαίνει `onclick` σε κάθε κουτί.
  - Το μενού ✈ μένει όπως είναι. Ένα δεύτερο κλικ στο ίδιο κουτί κλείνει το πάνελ.

```js
// in modules/weekly_natl_v5.js, where the board root is painted (one listener, not one per box)
// Route panel (plan 2026-10-28): read-only, born closed behind FEATURES.ROUTE_PANEL.
function _rpClick(e) {
  if (!(window.FEATURES && window.FEATURES.ROUTE_PANEL) || !window.RoutePanel) return;
  const box = e.target.closest('.wn5-asg[data-rp="cycle"]');
  if (!box) return;
  const row = box.closest('.wn5-row[data-rt]');
  if (!row) return;
  if (window.RoutePanel.isOpen() && window._rpOpenFor === row.dataset.rt) { window.RoutePanel.close(); window._rpOpenFor = null; return; }
  window._rpOpenFor = row.dataset.rt;
  window.RoutePanel.openCycle(row.dataset.rt);
}
```

  Το `_rpOpenFor` μένει μέσα στο closure του module, όχι στο `window`. Το παραπάνω δείχνει μόνο τη λογική· το όνομα
  και η θέση του listener ακολουθούν το μοτίβο listeners του F4α (αναζήτηση `addEventListener` στο
  `weekly_natl_v5.js` μετά το merge).
- [ ] **Step 3: Run** — `node tests/critics/route-panel-rig.js` (cwd το κύριο repo, αν το worktree δεν έχει
  `node_modules`). Expected: όλα ✓, 0 page errors, 0 εγγραφές.
- [ ] **Step 4: Γύρος πιστότητας (ένας).** Screenshot του `open-cycle` απέναντι στο F1. Διόρθωσε μόνο ό,τι απέχει
  πάνω από 2px. Τα υπόλοιπα μπαίνουν στο `docs/route-panel/DEFERRED.md`.
- [ ] **Step 5: Commit.**

### Task 6: Γραμμές ⇄ με χρώματα τμημάτων — μετά το merge των T24/T25 του F4α

**Brief:** οι τιμές του εγκεκριμένου F2 και του `2140:7735`. Από το πλάνο F4α: ΑΡΧΙΚΟ `--wn5-seg-initial #64748b`,
ΕΝΔΙΑΜΕΣΟ `--wn5-seg-intermediate #d97706`, ΤΕΛΙΚΟ `--wn5-seg-final` (accent `#0284C7`). Οι μεταβλητές CSS του F4α
**ξαναχρησιμοποιούνται**, δεν αντιγράφονται.

**Files:** Modify `core/route-panel-data.js` (περνά `ctx.handovers` από `WN5L.handoversOf(cycle)` και το
`reasonText` από `WN5Lab.reasonLine(h.reason)`), `modules/route_panel.js`, `assets/style.css`, tests T2 και T4.

- [ ] **Step 1: tests.**
  - Μοντέλο: κύκλος με 3 τμήματα → δύο γραμμές `kind:'hand'`, στη σωστή θέση (μετά το `beforeStopId`), με `seg`
    `'intermediate'` και `'final'`.
  - HTML: `.rp-row[data-kind=hand]` με «⇄» και `data-seg`.
  - Άγνωστος λόγος → «άλλος λόγος · code» (συμπεριφορά του `reasonLine`).
- [ ] **Step 2: κώδικας.** Ο κλάδος `ctx.handovers` του T2 υπάρχει ήδη. Εδώ περνά μόνο η είσοδος και τα στυλ.
- [ ] **Step 3: rig** — σενάριο `hand-3seg`.
- [ ] **Step 4: ένας γύρος πιστότητας απέναντι στο F2.**
- [ ] **Step 5: Commit.**

### Task 7: Πάνελ δίπλα-δίπλα, ευθυγραμμισμένα στον χρόνο (K8)

**Brief:** οι τιμές του εγκεκριμένου F3.

**Files:** Modify `modules/route_panel.js`, `assets/style.css`, `core/route-panel-data.js` (ανάγνωση στάσεων του
διεθνούς RT: `ct_rt_legs[].order_id` → ORDER STOPS, μόνο ανάγνωση), tests.

- [ ] **Step 1: tests.**
  - Δύο μοντέλα με κοινό άξονα ημέρας: κάθε γραμμή παίρνει `dayIndex`. Γραμμές της ίδιας ημέρας έχουν το ίδιο `top`
    στο HTML.
  - Οι ημέρες του `overlapDays` έχουν την κλάση `.rp-day-ov` (πορτοκαλί).
  - Η 1 κοινή ημέρα **δεν** ανοίγει δεύτερο πάνελ (K8).
- [ ] **Step 2: κώδικας.** Δύο συρτάρια 480 δεξιά, το δεύτερο αριστερά από το πρώτο. Η θέση του πίνακα ορίζεται στο
  F3 (ερώτηση owner 3).
- [ ] **Step 3: rig** — `k8-side`, `k8-swap`.
- [ ] **Step 4: ένας γύρος πιστότητας.**
- [ ] **Step 5: Commit.**

### Task 8: Πάνελ παραγγελίας (εθνική και VS)

**Brief:** οι τιμές του εγκεκριμένου F1 (μέρος «παραγγελία»).

**Files:** Modify `core/route-panel-model.js` (`RPM.order(...)`), `core/route-panel-data.js` (`forOrder` του T3),
`modules/route_panel.js` (`openOrder`), `modules/weekly_natl_v5.js` (κλικ στο chip παραγγελίας), tests.

- [ ] **Step 1: tests μοντέλου.**
  - Εθνική με ένα κομμάτι σε δύο κύκλους: δύο τμήματα, ένα ανά κύκλο, με τον κωδικό του.
  - VS: πρώτο τμήμα «ΔΙΕΘΝΕΣ (ανάγνωση)» από ORDER STOPS, μετά «Cross-dock · Βέροια (VS)», μετά το εθνικό σκέλος.
  - Κομμάτι σε αναμονή μετά την ημέρα του → κόκκινο «χωρίς ανάθεση» (K10).
  - Παραγγελία χωρίς κόμβο → «Η παραγγελία δεν έχει στάσεις» (K0), ποτέ κενό πάνελ.
- [ ] **Step 2: κώδικας.**
- [ ] **Step 3: rig** — `open-order`, `order-two-weeks`.
- [ ] **Step 4: ένας γύρος πιστότητας.**
- [ ] **Step 5: Commit.**

### Task 9: Καρτέλες + «Φορτίο» — μετά το merge του F4α

**Γιατί:** owner 28/10: «Και οι τέσσερις καρτέλες του Figma από την πρώτη έκδοση».

**Brief:** οι τιμές του εγκεκριμένου **F5** (Φορτίο εθνικού πάνελ) και της καρτέλας του Διεθνών `2283:10077`. Το
frame του Διεθνών δείχνει, ανά παραγγελία:
- παλέτες (σύνολο και ανά παράδοση)·
- θερμοκρασία («δεν γράφτηκε» όταν λείπει)·
- ανταλλαγή παλετών·
- ένα μπλοκ ΦΟΡΤΗΓΟ: χωρητικότητα 33 και το πιο φορτωμένο σκέλος.

**Πηγές:** καμία νέα ανάγνωση.
- **Παλέτες και θερμοκρασία:** board `legs[].pallets`, `legs[].temperature_c`.
- **Ανταλλαγή παλετών:** facade ORDERS `"Pallet Exchange"` (`worker/src/index.js:1384`) για VS, και NATIONAL ORDERS
  `"Pallet Exchange"` (`:1663`) για εθνικές. Το `board.waiting[].pallet_exchange` ισχύει για όσα είναι σε αναμονή.
  Πριν από τον κώδικα επιβεβαίωσε στον χάρτη `TABLES` ότι το πεδίο υπάρχει **για κάθε πίνακα** (παγίδα facade 1).
- **Χωρητικότητα:** `WN5L.CAP` (33) και `WN5L.capacity(sideStops)` του F4α (`core/wn5-logic.js:22,100`). Δεν γράφεται
  δεύτερο 33 (αρχή 3).

**Files:**
- Create: `core/route-panel-tabs.js` (`window.RPT`, καθαρό)
- Modify: `core/route-panel-data.js` (`RPD.forLoad`)
- Modify: `modules/route_panel.js` (μπάρα καρτελών, καρτέλα Φορτίο)
- Modify: `assets/style.css`
- Test: `tests/route-panel-tabs.test.js`

**Interfaces:**
- Produces: `RPT.load(cycle, ctx) → {orders:Array<{ref, side:'ΚΑΘΟΔΟΣ'|'ΑΝΟΔΟΣ', pallets:number,
  perStop:Array<{name, pallets}>, temp:{text, missing:boolean}, pe:{text, missing:boolean}}>,
  truck:{cap:number, sides:Array<{title, pallets, over}>}}`, όπου `ctx.pe:(orderRef)→true|false|null` και
  `ctx.capacity`, `ctx.cap` είναι τα `WN5L.capacity` / `WN5L.CAP`.
- Produces: `RoutePanel` γνωρίζει `tab ∈ {'route','load','docs','history'}`. Η μπάρα δείχνει «Έγγραφα · N» με το
  πλήθος από το T10.

- [ ] **Step 1: tests (αποτυγχάνουν)**

```js
// tests/route-panel-tabs.test.js — synthetic only
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const sb = { window: {}, console };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/route-panel-tabs.js'), 'utf8'), sb);
const RPT = sb.window.RPT;
// vm objects come from another realm: compare them as plain JSON, never by prototype
const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, msg);
const cyc = { stops: [
  { stop_id: 1, seq: 1, side: 'KATHODOS', location: 'Βέροια', legs: [{ act: 'load', pallets: 20, order_id: 554, temperature_c: 4 }, { act: 'load', pallets: 13, nat_order_id: 13, temperature_c: null }] },
  { stop_id: 2, seq: 2, side: 'KATHODOS', location: 'Τόπος Α', legs: [{ act: 'unload', pallets: 12, order_id: 554 }] },
  { stop_id: 3, seq: 3, side: 'KATHODOS', location: 'Τόπος Β', legs: [{ act: 'unload', pallets: 8, order_id: 554 }, { act: 'unload', pallets: 13, nat_order_id: 13 }] }] };
const ctx = { pe: (ref) => (ref === '#554' ? true : null), cap: 33,
  capacity: (stops) => { const p = stops.reduce((a, s) => a + s.legs.filter((l) => l.act === 'load').reduce((x, l) => x + l.pallets, 0), 0); return { pallets: p, over: p > 33 ? p - 33 : 0 }; } };
test('one block per order, pallets and per-delivery split from the legs', () => {
  const m = RPT.load(cyc, ctx);
  eq(m.orders.map((o) => [o.ref, o.pallets]), [['#554', 20], ['Εθν. 13', 13]]);
  eq(m.orders[0].perStop, [{ name: 'Τόπος Α', pallets: 12 }, { name: 'Τόπος Β', pallets: 8 }]);
});
test('a missing value is said, never shown as «Όχι» or 0 (facade trap 2)', () => {
  const m = RPT.load(cyc, ctx);
  eq(m.orders[1].temp, { text: 'δεν γράφτηκε', missing: true });
  eq(m.orders[1].pe, { text: 'δεν γράφτηκε', missing: true });
  eq(m.orders[0].pe, { text: 'Ναι', missing: false });
});
test('truck: capacity from WN5L, over 33 shown per side', () => {
  const m = RPT.load(cyc, ctx);
  eq(m.truck, { cap: 33, sides: [{ title: 'ΚΑΘΟΔΟΣ', pallets: 33, over: 0 }] });
});
```

Run: `node --test tests/route-panel-tabs.test.js` — Expected: FAIL (`RPT` undefined).

- [ ] **Step 2: κώδικας**

```js
// core/route-panel-tabs.js — the three tabs beside «Διαδρομή» (owner 28/10: all four from the first version).
// Pure: the host passes the board cycle and what RPD read; nothing here fetches.
(function () {
  'use strict';
  const SIDES = [['KATHODOS', 'ΚΑΘΟΔΟΣ'], ['ANODOS', 'ΑΝΟΔΟΣ']];
  const refOf = (l) => (l.order_id != null ? '#' + l.order_id : 'Εθν. ' + l.nat_order_id);
  // absent ≠ «no» (facade trap 2): a value nobody wrote is said as such
  const said = (v, fmt) => (v == null ? { text: 'δεν γράφτηκε', missing: true } : { text: fmt(v), missing: false });
  function load(cycle, ctx) {
    const by = new Map();
    for (const s of (cycle.stops || []).slice().sort((a, b) => a.seq - b.seq)) {
      const side = (SIDES.find(([k]) => k === s.side) || [null, s.side])[1];
      for (const l of s.legs || []) {
        const ref = refOf(l);
        if (!by.has(ref)) by.set(ref, { ref, side, pallets: 0, perStop: [], temps: [] });
        const o = by.get(ref);
        if (l.act === 'load') { o.pallets += Number(l.pallets) || 0; o.temps.push(l.temperature_c); }
        else o.perStop.push({ name: s.location, pallets: Number(l.pallets) || 0 });
      }
    }
    const orders = [...by.values()].map((o) => {
      const t = o.temps.find((x) => x != null);
      return { ref: o.ref, side: o.side, pallets: o.pallets, perStop: o.perStop,
        temp: said(t === undefined ? null : t, (v) => v + '°'), pe: said(ctx.pe(o.ref), (v) => (v ? 'Ναι' : 'Όχι')) };
    });
    const sides = SIDES.map(([k, title]) => ({ title, stops: (cycle.stops || []).filter((s) => s.side === k) }))
      .filter((x) => x.stops.length)
      .map((x) => { const c = ctx.capacity(x.stops); return { title: x.title, pallets: c.pallets, over: c.over }; });
    return { orders, truck: { cap: ctx.cap, sides } };
  }
  window.RPT = Object.freeze({ load });
})();
```

- [ ] **Step 3: `RPD.forLoad`.**
  - Διαβάζει το `Pallet Exchange` των παραγγελιών του κύκλου με **ένα** `atGetAll` ανά πίνακα (ORDERS, NATIONAL
    ORDERS), φίλτρο `OR(RECORD_ID()=…)` κατά το μοτίβο του `core/api.js`.
  - Επιστρέφει `ctx.pe`, με `null` όταν το πεδίο λείπει από την απάντηση.
  - Test με ψεύτικο `atGetAll`: παραγγελία χωρίς το πεδίο → `null`, ποτέ `false`.
- [ ] **Step 4: μπάρα καρτελών.**
  - Τέσσερις καρτέλες σε σειρά: «Διαδρομή · Φορτίο · Έγγραφα · N · Ιστορικό».
  - Εναλλαγή χωρίς νέο fetch για όσα έχουν ήδη φορτωθεί.
  - Η καρτέλα θυμάται τη θέση της μόνο όσο το πάνελ μένει ανοιχτό (καμία αποθήκευση).
  - HTML test: 4 καρτέλες, `aria-selected` σε μία.
- [ ] **Step 5: rig** — σενάριο `tab-load`: κύκλος 33 + 1 παλέτα → κόκκινο «πάνω από 33». Μία παραγγελία χωρίς
  θερμοκρασία → «δεν γράφτηκε».
- [ ] **Step 6: ένας γύρος πιστότητας** απέναντι στο F5.
- [ ] **Step 7: Commit.**

### Task 10: Καρτέλα «Έγγραφα»

**Brief:** οι τιμές του εγκεκριμένου **F6** και της καρτέλας του Διεθνών `2283:10126`.

**Πηγή:** η υπάρχουσα `OrderDocs.listDocs(orderId)` (`core/order-docs.js:213`, `GET /docs/list?order=`), μόνο
ανάγνωση. Αν πατηθεί αρχείο, το άνοιγμα γίνεται με την υπάρχουσα `OrderDocs.fetchFileBlob(id)` (`GET /docs/file/<id>`).

**Δύο όρια από τα δεδομένα** (μετρήθηκαν 28/10). Το frame του Διεθνών δείχνει πράγματα που η βάση δεν κρατά, γι'
αυτό το F6 πρέπει να δείχνει μόνο ό,τι υπάρχει:
- **Το `order_documents` δεν έχει είδος εγγράφου.** Στήλες: `id, legacy_id, order_id, sha256, filename, mime, size,
  r2_key, source (scan/upload), uploaded_by, created_at, deleted_at`. Άρα το «Κανένα CMR» και το «Εντολή πελάτη» δεν
  βγαίνουν από τα δεδομένα.
  - **Βγαίνει:** πλήθος, όνομα και τύπος αρχείου, σάρωση ή ανέβασμα, ποιος και πότε.
  - **Βγαίνει επίσης:** «ίδιο αρχείο, ανέβηκε δεύτερη φορά», από το ίδιο `sha256`.
  - **Βγαίνει:** «0 αρχεία σε παραδομένη παραγγελία», κόκκινο.
- **Οι εθνικές παραγγελίες δεν μπορούν να έχουν έγγραφο.** Το `order_documents.order_id` δείχνει μόνο σε `orders`
  (FK, `core/order-docs.js:16-19`, «GAP»). Σε εθνική, η καρτέλα λέει ρητά «Οι εθνικές παραγγελίες δεν κρατούν
  έγγραφα στο TMS», ποτέ «0 αρχεία». Για VS δείχνει τα έγγραφα της διεθνούς.

**Files:**
- Modify: `core/route-panel-tabs.js` (`RPT.docs`)
- Modify: `core/route-panel-data.js` (`RPD.forDocs`)
- Modify: `modules/route_panel.js`
- Test: `tests/route-panel-tabs.test.js`

**Interfaces:**
- Produces: `RPT.docs(groups) → {count:number, sections:Array<{ref, rows:Array<{file, mime, how, when, dup:boolean}>,
  note:{tone, text}|null}>}`, όπου
  `groups = Array<{ref, kind:'intl'|'national', delivered:boolean, docs:Array<{id, filename, mime, source, uploaded_by, created_at, sha256}>}>`.

- [ ] **Step 1: tests (αποτυγχάνουν)**

```js
test('docs: same sha256 twice is «ίδιο αρχείο», a delivered order with none is red, a national one is said', () => {
  const m = RPT.docs([
    { ref: '#554', kind: 'intl', delivered: false, docs: [
      { id: 1, filename: 'a.pdf', mime: 'application/pdf', source: 'scan', uploaded_by: 'u', created_at: '2026-10-16T11:53:00Z', sha256: 'x' },
      { id: 2, filename: 'a.pdf', mime: 'application/pdf', source: 'upload', uploaded_by: 'u', created_at: '2026-10-23T06:00:00Z', sha256: 'x' }] },
    { ref: '#558', kind: 'intl', delivered: true, docs: [] },
    { ref: 'Εθν. 13', kind: 'national', delivered: false, docs: [] }]);
  assert.strictEqual(m.count, 2);
  eq(m.sections[0].rows.map((r) => r.dup), [false, true]);
  eq(m.sections[1].note, { tone: 'red', text: 'Κανένα έγγραφο σε παραδομένη παραγγελία.' });
  eq(m.sections[2].note, { tone: 'info', text: 'Οι εθνικές παραγγελίες δεν κρατούν έγγραφα στο TMS.' });
});
```

- [ ] **Step 2: κώδικας** (στο ίδιο IIFE, ίδιο μοτίβο με το `load`):

```js
  function docs(groups) {
    let count = 0;
    const sections = groups.map((g) => {
      if (g.kind === 'national') return { ref: g.ref, rows: [], note: { tone: 'info', text: 'Οι εθνικές παραγγελίες δεν κρατούν έγγραφα στο TMS.' } };
      const seen = new Set();
      const rows = g.docs.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((d) => {
        const dup = seen.has(d.sha256);
        seen.add(d.sha256);
        return { file: d.filename, mime: d.mime, how: d.source === 'scan' ? 'σάρωση' : 'ανέβασμα', when: d.created_at, dup };
      });
      count += rows.length;
      const note = g.delivered && !rows.length ? { tone: 'red', text: 'Κανένα έγγραφο σε παραδομένη παραγγελία.' } : null;
      return { ref: g.ref, rows, note };
    });
    return { count, sections };
  }
```

  και `window.RPT = Object.freeze({ load, docs, history })`, όπου το `history` έρχεται στο T11.
- [ ] **Step 3: `RPD.forDocs`.**
  - Ένα `OrderDocs.listDocs` ανά διεθνή παραγγελία του κύκλου (VS).
  - Αποτυχία → η καρτέλα λέει «Τα έγγραφα δεν φορτώθηκαν — δεν σημαίνει ότι δεν υπάρχουν» (λόγια του
    `modules/audit_trail.js` για το ίδιο είδος αποτυχίας), και καλεί `logError`.
  - Test με ψεύτικο `listDocs` που πετά σφάλμα.
  - Το «παραδομένη» υπολογίζεται από το board (`executed` της τελευταίας στάσης παράδοσης της παραγγελίας, spec
    §2.3). Ποτέ από γραμμένο status.
- [ ] **Step 4: rig** — `tab-docs`: διπλό sha256, παραδομένη χωρίς αρχείο, εθνική.
- [ ] **Step 5: ένας γύρος πιστότητας** απέναντι στο F6.
- [ ] **Step 6: Commit.**

### Task 11: Καρτέλα «Ιστορικό» — μετά το deploy των M-1 + W-2

**Brief:** οι τιμές του εγκεκριμένου **F7** και της καρτέλας του Διεθνών `2283:10200`. Το frame δείχνει:
- μία γραμμή ανά αλλαγή: ημέρα και ώρα · παραγγελία · τι έγινε · ποιος («dispatcher · όνομα», «σύστημα»)·
- την υποσημείωση «Για τις παραγγελίες δεν καταγράφεται ποιο πεδίο άλλαξε».

**Πηγή: νέα ανάγνωση**, γιατί η υπάρχουσα δεν αρκεί (μετρήθηκε 28/10):
- Το `GET /audit` (`worker/src/index.js:198`) διαβάζεται **μόνο** από owner και management (`AUDIT_READERS`, `:195`).
  Ο dispatcher, ο κύριος χρήστης του Εβδομαδιαίου, παίρνει 403.
- Το `/audit` φιλτράρει **ένα** `record_id` / `table` τη φορά. Ένας κύκλος έχει γραμμές σε 6+ πίνακες: RT, στάσεις,
  σκέλη, τμήματα, αποστολές, τοπικές φορτώσεις, και τις παραγγελίες του.
- Το `audit_log` (`id, actor, role, action, table_name, record_id, before_data, after_data, created_at`· indexes
  `(table_name, created_at DESC)`, `(record_id)`) έχει **0 γραμμές** για τους πίνακες v5 σήμερα. Έχει 4.585 για
  `orders`, 4.165 για `order_stops`, 1.502 για `ct_round_trips`, 358 για `national_loads` και 30 για
  `national_orders`.
- Το `plan_h_audit` (072) γράφει **μία γραμμή ανά αλλαγμένη εγγραφή, με actor τον άνθρωπο**, ποτέ `trigger:`.

Γι' αυτό χρειάζονται δύο νέα στοιχεία (§2, M-1 και W-2), που **δεν** είναι front end. Η πρώτη έκδοση με τέσσερις
καρτέλες βγαίνει μόνο όταν και τα δύο είναι ζωντανά (T0 Step 4).

**Τι δείχνει η καρτέλα σε κάθε κατάσταση.** Ποτέ «άδειο αλλά εντάξει» (αρχή 1):

| Κατάσταση | Κείμενο |
|---|---|
| ανάγνωση απέτυχε / `/plan/history` λείπει (404) | «Το ιστορικό δεν φορτώθηκε — δεν σημαίνει ότι δεν υπάρχουν ενέργειες.» + `logError` |
| 0 γραμμές | «Καμία καταγεγραμμένη αλλαγή για αυτόν τον κύκλο από <ημέρα της πρώτης γραμμής του audit_log>.» |
| πριν από την ημέρα L (0 γραμμές v5) | Οι γραμμές των **παραγγελιών** του (διεθνής, VS NL, στάσεις), που υπάρχουν, και μία ρητή γραμμή «Κύκλοι v5: 0 αλλαγές — γράφονται από την ημέρα L.» |
| κομμένο στις 200 | «Δείχνονται οι 200 νεότερες· το πλήρες ιστορικό στο Ιστορικό Αλλαγών.» (μόνο για owner / management, που έχουν το `/audit`) |
| γραμμή χωρίς διαφορά πεδίων | «αλλαγή · το πεδίο δεν καταγράφεται» (η υποσημείωση του Figma, ανά γραμμή) |

**Files:**
- Modify: `core/route-panel-tabs.js` (`RPT.history`)
- Modify: `core/route-panel-data.js` (`RPD.forHistory` → `planFetch('GET','/plan/history?rt_id=…')`)
- Modify: `modules/route_panel.js`
- Test: `tests/route-panel-tabs.test.js`

**Interfaces:**
- Consumes (W-2): `GET /plan/history?rt_id=<id>` ή `?order_id=<id>` ή `?nat_order_id=<id>` →
  `{entries:Array<{at, table, record_id, action, actor_kind:'person'|'system'|'trigger', actor:string|null, role,
  changed:string[]|null, order_ref:string|null}>, since:string, v5_rows:number, truncated:boolean}`.
- Produces: `RPT.history(answer) → {rows:Array<{when, ref, text, who}>, notes:Array<{tone, text}>}`.

- [ ] **Step 1: tests (αποτυγχάνουν)**

```js
test('history: never empty-but-fine', () => {
  const none = RPT.history({ entries: [], since: '2026-07-28', v5_rows: 0, truncated: false });
  assert.strictEqual(none.rows.length, 0);
  assert.ok(none.notes.some((n) => /Καμία καταγεγραμμένη αλλαγή/.test(n.text)));
  assert.ok(none.notes.some((n) => /Κύκλοι v5: 0 αλλαγές/.test(n.text)));
});
test('history: who is a name only when the Worker sent one, else the role', () => {
  const m = RPT.history({ since: '2026-07-28', v5_rows: 3, truncated: false, entries: [
    { at: '2026-10-23T10:31:00Z', table: 'piece_legs', record_id: '9', action: 'create', actor_kind: 'person', actor: null, role: 'dispatcher', changed: null, order_ref: '#554' },
    { at: '2026-10-22T06:43:00Z', table: 'ct_round_trips', record_id: '7', action: 'update', actor_kind: 'trigger', actor: null, role: 'system', changed: ['status'], order_ref: null }] });
  eq(m.rows.map((r) => r.who), ['dispatcher', 'σύστημα']);
  assert.match(m.rows[0].text, /ανάθεση/);
});
test('history: a change whose fields are not recorded says so', () => {
  const m = RPT.history({ since: '2026-07-28', v5_rows: 1, truncated: false, entries: [
    { at: '2026-10-20T08:00:00Z', table: 'orders', record_id: 'rec1', action: 'update', actor_kind: 'person', actor: 'x', role: 'dispatcher', changed: null, order_ref: '#558' }] });
  assert.match(m.rows[0].text, /το πεδίο δεν καταγράφεται/);
});
```

- [ ] **Step 2: κώδικας** (στο ίδιο IIFE του `core/route-panel-tabs.js`):

```js
  // (table, action) → words. The full list comes from the p_table / p_action values the plan_* functions pass to
  // plan_h_audit (BRIEF-T11); an unknown pair still says what changed, never an empty line.
  const SAY = {
    'ct_round_trips/create': 'γεννήθηκε το RT στην ανάθεση', 'ct_round_trips/update': 'άλλαξε το RT',
    'piece_legs/create': 'ανάθεση σε στάση', 'piece_legs/delete': 'βγήκε από τη στάση',
    'rt_vehicle_segments/create': 'αλλαγή οχήματος', 'rt_stops/update': 'άλλαξε η στάση',
  };
  const WHO = { person: (e) => e.actor ? e.role + ' · ' + e.actor : e.role, system: () => 'σύστημα', trigger: () => 'σύστημα' };
  function history(a) {
    const rows = (a.entries || []).map((e) => {
      const base = SAY[e.table + '/' + e.action] || 'αλλαγή · ' + e.table;
      const text = e.action === 'update' && !e.changed ? base + ' · το πεδίο δεν καταγράφεται' : base;
      return { when: e.at, ref: e.order_ref || '', text, who: (WHO[e.actor_kind] || WHO.person)(e) };
    });
    const notes = [];
    if (!rows.length) notes.push({ tone: 'info', text: 'Καμία καταγεγραμμένη αλλαγή για αυτόν τον κύκλο από ' + a.since + '.' });
    if (a.v5_rows === 0) notes.push({ tone: 'info', text: 'Κύκλοι v5: 0 αλλαγές — γράφονται από την ημέρα L.' });
    if (a.truncated) notes.push({ tone: 'info', text: 'Δείχνονται οι 200 νεότερες.' });
    return { rows, notes };
  }
```

  - Το `RPT.history` με έναν πίνακα φράσεων `(table, action) → κείμενο`: π.χ. `piece_legs/create` → «ανάθεση σε
    στάση», `rt_vehicle_segments/create` → «αλλαγή οχήματος», `ct_round_trips/create` → «γεννήθηκε το RT στην
    ανάθεση».
  - Ο πλήρης πίνακας γράφεται στο BRIEF-T11 από τις τιμές `p_table` / `p_action` που περνούν οι `plan_*` στο
    `plan_h_audit` (072 / 072b / 073: `grep -n "plan_h_audit(" worker/migrations/07*.sql`). Άγνωστος συνδυασμός →
    «αλλαγή · <table>». Ποτέ κενό κείμενο.
- [ ] **Step 3: `RPD.forHistory`** + test: 404 → σφάλμα προς τον καλούντα (η καρτέλα λέει «δεν φορτώθηκε»), ποτέ
  `entries: []`.
- [ ] **Step 4: rig** — `tab-history`, `tab-history-404`, `tab-history-pre-L`.
- [ ] **Step 5: ένας γύρος πιστότητας** απέναντι στο F7.
- [ ] **Step 6: Commit.**

### Task 12: Πέρασμα των αποκλίσεων ≤ 2px

**Files:** όσα λέει το `docs/route-panel/DEFERRED.md`.

- [ ] **Step 1:** ένα πέρασμα σε όλο το frame (F1 / F2 / F3) για όλες τις καταχωρήσεις της λίστας.
- [ ] **Step 2:** ξανά rig όλων των σεναρίων, 0 page errors.
- [ ] **Step 3: Commit.**

### Task 13: Έλεγχοι πριν από το PR υλοποίησης

- [ ] **Step 1: Suite** — `node --test tests/*.test.js tests/*.test.mjs tests/critics/*.test.js 2>&1 | grep -E '^ℹ (tests|pass|fail)'` → όλα pass (ή τα skip που υπάρχουν σήμερα), καμία αποτυχία.
- [ ] **Step 2: Rig** — `node tests/critics/route-panel-rig.js` → όλα ✓, 0 page errors, 0 εγγραφές στο ψεύτικο
  backend.
- [ ] **Step 3: Αποδείξεις μετάλλαξης** — η λίστα του T1 Step 5 και του T2 Step 4 ξανά, στο τελικό tip. Και: σβήσε
  τον κλάδο `v == null` του `said` (T9) → FAIL «missing»· σβήσε τον κλάδο `kind === 'national'` (T10) → FAIL·
  σβήσε τη σημείωση «Καμία καταγεγραμμένη αλλαγή» (T11) → FAIL.
- [ ] **Step 4: SELECT παραγωγής** (μόνο SELECT, ο αριθμός γραμμών είναι η απόδειξη):

```sql
-- the panel shows exactly what plan_board holds: same cycles, same stops, same red stops
SELECT (SELECT count(*) FROM ct_round_trips WHERE model=2 AND status<>'cancelled') AS v5_cycles,
       (SELECT count(*) FROM rt_stops WHERE deleted_at IS NULL) AS v5_stops,
       (SELECT count(*) FROM v_rt_stop_state WHERE NOT has_vehicle) AS stops_without_vehicle,
       (SELECT count(*) FROM v_rt_stop_state WHERE has_late) AS late_stops;
```

  Πριν από το L το αναμενόμενο είναι 0 / 0 / 0 / 0. Μετά το L, τα νούμερα αυτά = τα κόκκινα του πάνελ στην ίδια
  εβδομάδα, που μετριούνται στο rig πάνω στην πραγματική απάντηση `/plan/board`.

```sql
-- the Ιστορικό tab of one order equals what audit_log holds for it (pick one VS order id :o)
SELECT table_name, count(*) FROM audit_log
 WHERE (table_name = 'orders' AND record_id IN (SELECT id::text FROM orders WHERE id = :o UNION SELECT legacy_id FROM orders WHERE id = :o))
    OR (table_name = 'order_stops' AND record_id IN (SELECT id::text FROM order_stops WHERE order_id = :o UNION SELECT legacy_id FROM order_stops WHERE order_id = :o))
    OR (table_name = 'national_loads' AND record_id IN (SELECT id::text FROM national_loads WHERE source_order_id = :o UNION SELECT legacy_id FROM national_loads WHERE source_order_id = :o))
 GROUP BY 1;
```

  Το άθροισμα (ως 200) = οι γραμμές της καρτέλας για την ίδια παραγγελία.
- [ ] **Step 5: Ελεγκτής** (agent `elegktis`): «φτάνει το πάνελ μέχρι τον πίνακα;». Τα πέντε του CLAUDE.md:
  endpoint · πίνακας / στήλες · τι γράφτηκε (τίποτα) · αποτυχία (δυνατή) · δικαίωμα (GET για όλους τους ρόλους στο
  `PLAN_PERMS`).
- [ ] **Step 6: `/code-review high`** στο τελικό tip. Το επίπεδο και τα ευρήματα γράφονται στο σώμα του PR.
- [ ] **Step 7: Bump** — `?v=` των 4 νέων και των αλλαγμένων αρχείων + `SW_VERSION`, ίδια τιμή. Ξανά το test
  `tests/sw-app-shell*.test.js`.
- [ ] **Step 8: PR** — `gh pr create`, με σειρά merge: μετά το F4α, (για το T6) μετά τα T24/T25, και (για το T11)
  μετά το M-1 εκτελεσμένο και το W-2 deployed. Το flag μένει
  `false`. Το άνοιγμα στον pilot γίνεται μόνο με «ναι» του owner.
- [ ] **Step 9 (μετά το L):** πρώτη εβδομάδα με πραγματικά δεδομένα. Ξανά το SELECT του Step 4, και σύγκριση με τα
  κόκκινα του πάνελ σε 3 κύκλους. Καταγραφή στο `docs/sessions/`.

---

## 7 · Αυτοέλεγχος του πλάνου

- **Κάλυψη:**
  - Κανόνες owner: 1 → T4/T5 · 2 → T2 · 3 → T2 · 4 → T2 · 5 → T6 · 6 → T2 · 7 → T7 · 8 → T2/T4.
  - Σφάλματα του §4 → T1/T2/T3/T7/T8/T9/T10/T11.
  - Τέσσερις καρτέλες (owner 28/10): Διαδρομή → T2/T4 · Φορτίο → T9 · Έγγραφα → T10 · Ιστορικό → T11 (+ M-1 / W-2).
  - Διαδικασία 27/10 → κάθε εργασία (brief, ένας γύρος, DEFERRED) + T13.
  - Κοινά αρχεία F4α → §5.
  - Worker / SQL → §2: M-1 + W-2 απαιτούνται για το Ιστορικό · W-1 προαιρετικό.
- **Ονόματα:** `RG.order / nationalLoad / rt / overlapDays`, `RPM.cycle / order`, `RPT.load / docs / history`, `RPD.forCycle / forOrder / forLoad / forDocs / forHistory`,
  `RoutePanel.openCycle / openOrder / close / html / isOpen`. Χρησιμοποιούνται ίδια σε όλες τις εργασίες.
- **Τρία σημεία κλείνουν με βήμα πριν από τον κώδικα, όχι με TODO:**
  - το όνομα του πεδίου id του τόπου στο facade (T3 Step 0, παγίδα facade 1)·
  - η ημέρα Αθήνας του `today` (T3 Step 3, με τη συνάρτηση του F4α)·
  - τα κλειδιά–τιμές του εθνικού πάνελ (T2, από το F1).

## 8 · Τι ΔΕΝ κάνει αυτό το πλάνο

- **Το πάνελ του Εβδομαδιαίου Διεθνών (Φάση Β).** Γίνεται μετά την απόδειξη στα Εθνικά, με δικό του πλάνο. Θα
  χρειαστεί:
  - είσοδο model-1 από ORDERS / ORDER STOPS / `/costs/rt`·
  - τους κόμβους των σημειώσεων (W / C / X / +L), με τη λίστα regex σε ένα μέρος·
  - την εμφάνιση των E5 / E7 / E9 / E11.

  Τα σημάδια αυτά **ήδη** ελέγχονται στο T1 (ισοτιμία).
- **Καμία ενέργεια εγγραφής.** Οι μόνες αλλαγές Worker και βάσης είναι οι αναγνώσεις M-1 / W-2, με δικό τους PR στην
  αλυσίδα Worker.
- **Δεν προσθέτει έγγραφα σε εθνικές παραγγελίες**, γιατί θέλει αλλαγή σχήματος (`order_documents.nat_order_id`). Η
  καρτέλα το λέει ρητά (T10).

## 9 · Ερωτήσεις owner (μία τη φορά, πρόταση πρώτη)

1. ~~Καρτέλες στην πρώτη έκδοση~~. **Απάντηση owner 28/10:** «Και οι τέσσερις καρτέλες του Figma από την πρώτη έκδοση»
   → T9–T11, F5–F7, M-1 / W-2.
2. **Κουμπί footer χωρίς ενέργεια στο Εθνικών** (π.χ. «Καθυστέρηση…» αν δεν υπάρχει εκεί): απενεργοποιημένο στη θέση
   του με εξήγηση (πρόταση: η σειρά μένει σταθερή, κανόνας 8) ή κρυφό;
3. **Ιστορικό για όλους τους ρόλους:** οι dispatchers βλέπουν τις γραμμές με ρόλο αλλά χωρίς όνομα συναδέλφου, και
   ονόματα μόνο owner / management (πρόταση: ίδιος κανόνας με το `/audit` και την παρουσία σήμερα). Ή η καρτέλα μόνο
   για owner / management; Αλλάζει τι βλέπει ένας ρόλος, άρα θέλει «ναι» πριν από το W-2.
4. **Δύο πάνελ δίπλα-δίπλα στα 1440:** ο πίνακας στενεύει στα 480 (πρόταση: σπάνιο, 3 στα 74 πραγματικά), ή το
   δεύτερο πάνελ ανοίγει πάνω από τον πίνακα; Απαντιέται μέσα από το F3.
