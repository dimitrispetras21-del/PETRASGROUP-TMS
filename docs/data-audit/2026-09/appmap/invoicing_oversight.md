# Κύκλωμα: invoicing_oversight — Τιμολόγηση, Dashboards, Επίβλεψη (7/9/2026)

Μόνο ανάγνωση. Πίνακες: orders(130) · national_orders(4) · audit_log(3977) · app_errors(1478) ·
facade_unknown_fields(261) · users(18).

## 1. Τιμολόγηση (modules/invoicing.js)
- Διαβάζει: `atGet(TABLES.ORDERS, OR(Status=Delivered,Status=Invoiced,Invoiced=1))` (:306) και
  `TABLES.NAT_ORDERS` με επιπλέον όρο ημερομηνίας (:313).
- Γράφει (κοινό σημείο `_invWriteInvoice`, :828-836): `Status:'Invoiced'`, `Invoiced:true`,
  `Invoice Number`, `Invoice Date` σε ΕΝΑ PATCH, στο `orders` ή στο `national_orders` ανάλογα με τον τύπο.
- **Εύρημα κρίσιμο**: το checkbox εθνικής παραγγελίας κάνει PATCH `national_orders`. Το
  PERMISSIONS του Worker (:423-453 accountant, :382-422 management) **δεν έχει γραμμή
  `national_orders`** για accountant/management — μόνο `"*":["GET"]`. Άρα 403 σε κάθε προσπάθεια
  του λογιστή να τιμολογήσει εθνική παραγγελία, ενώ το frontend `can('costs')==='full'` (:731)
  δείχνει το κουμπί ενεργό. Ο dispatcher (που έχει `national_orders` write) δεν κάνει αυτή τη δουλειά.
- Στο `orders`: PATCH επιτρέπεται πλέον στον accountant (`orders: ["GET","PATCH"]`, :451 — απόφαση
  owner 3/9, ρητά καταγεγραμμένη στο σχόλιο). Το παλιό 403 του CLAUDE.md **έχει διορθωθεί**.
- Μέτρηση σήμερα: `invoiced=true` σε 2/130 orders· `invoice_number`/`invoice_date` **0/130** ακόμη
  και στις δύο αυτές· `status='Invoiced'` **0/130**. Δεν είναι άγνωστο πεδίο (δεν εμφανίζονται σε
  facade_unknown_fields) — τα τρία πεδία γράφονται σήμερα μαζί σε ένα PATCH, άρα οι δύο αυτές
  εγγραφές είτε ήρθαν από παλαιότερο μονοπάτι είτε από χειροκίνητη εισαγωγή. Δεν προκύπτει η ακριβής αιτία.
- `national_orders`: invoiced 0/4.
- Κλειδωμένη απόφαση 23/8 «Invoiced δεν είναι status» **παραβιάζεται** από τον ίδιο τον κώδικα
  (γράφει `Status:'Invoiced'`), όχι μόνο στο εθνικό (όπως έλεγε προηγούμενο audit) αλλά και στο orders.

## 2. Dashboards
- **Dashboard** (modules/dashboard.js): KPI λειτουργίας (ανάθεση, on-time, κενά χλμ, ATP) από
  `TABLES.ORDERS` (:69), `TABLES.NAT_LOADS` (:73), `ORDER_STOPS` (:94). Καλά τεκμηριωμένο, ζωντανό.
- **CEO Dashboard** (modules/ceo_dashboard.js): revenue/margin από `orders.Price`,
  `orders['Partner Rate']` (:498,569,583-584) — σωστό. Αλλά `TABLES.TRIP_COSTS` (facade id
  `tblWUus6uSpqE1LMW`) **δεν υπάρχει στον χάρτη του Worker** (0 αποτελέσματα grep) — 404 σε κάθε
  φόρτωση, το ίδιο το σχόλιο στο :140 το ομολογεί. Συνέπεια: το KPI «Partner Margin» δείχνει πάντα
  `N/A` επειδή η εμφάνιση εξαρτάται από `tripCosts.length>0` (:405-407), ΟΧΙ επειδή ο υπολογισμός
  είναι λάθος — ο σωστός αριθμός υπάρχει, είναι απλώς κρυμμένος πίσω από άσχετο gate. Ίδιο για
  «loss-making trips» (πάντα άδειο, :589-609).
- **Performance** (modules/performance.js): per-user KPIs από `orders`, `NAT_LOADS`, `MAINT_REQ`,
  `ORDER_STOPS`. Ο Worker έχει **ξεχωριστό** route `/performance/delivery` (:3121-3173, views
  `v_driver/client/partner_delivery`, deployed 3/9, με σωστό ανά-πεδίο RBAC ώστε ο dispatcher να μη
  βλέπει έσοδα/πληρωμές) — **καμία κλήση από το frontend, πουθενά** (grep repo: μόνο ο ίδιος ο
  Worker). Δουλειά backend χωρίς σύνδεση UI· 100% αχρησιμοποίητη.
- **Έλεγχος Μετρήσεων** (modules/metrics_audit.js): διασταυρώνει `orders`+`national_orders` με ό,τι
  δείχνουν οι άλλες οθόνες (:315,321). Σχόλιο του ίδιου του αρχείου (:29-33) ομολογεί ότι natLoads/
  drivers/partners/locations/clients φορτώνονται αλλά ποτέ δεν χρησιμοποιούνται σε μετρική — dead
  weight, δεν αγγίχτηκε.

## 3. Ιστορικό, Σφάλματα, Κάδος
- **Ιστορικό Ενεργειών** (modules/audit_trail.js): GET `/audit` (:108) → `audit_log`. Μόνο
  owner/management (`AUDIT_READERS`, worker :186). Ζωντανό (3977 γραμμές, τελευταία σήμερα 12:17).
- **Καταγραφή Σφαλμάτων** (core/utils.js:933 `renderErrorLog`, owner-only): διαβάζει **ΜΟΝΟ**
  `getErrorLog()` → localStorage `tms_errors` (:942). Ο Worker έχει έτοιμο GET `/app-errors`
  (`handleAppErrorsGet`, :338-368, owner/management) που διαβάζει `app_errors` (1478 γραμμές,
  ζωντανό — γράφεται σωστά μέσω `logError()`→POST, core/utils.js:569) — **καμία σελίδα δεν το
  καλεί ποτέ**. Το owner-only «Καταγραφή Σφαλμάτων» δείχνει μόνο ό,τι συνέβη στον browser που το
  ανοίγει, όχι την πραγματική εικόνα σφαλμάτων όλης της ομάδας.
- **Κάδος** (core/utils.js:1557 `renderTrashViewer`): διαβάζει `getTrash()` → localStorage
  `tms_trash`, τελευταίες 50, **ανά browser** (core/api.js:1090). Είναι **ανεξάρτητος** μηχανισμός
  από το `deleted_at` soft-delete της Postgres. Η «Επαναφορά» (`atRestoreFromTrash`, :1100-1116)
  κάνει **`atCreate`** (νέα εγγραφή, νέο id) — δεν καθαρίζει το `deleted_at` της παλιάς. Αποτέλεσμα:
  (α) η παλιά γραμμή μένει «διαγραμμένη» για πάντα στη βάση, (β) οποιοδήποτε linked record δείχνει
  στο παλιό id μένει σπασμένο μετά την «επαναφορά», (γ) αν καθαριστεί η cache του browser ή γίνει η
  διαγραφή από άλλη συσκευή, η εγγραφή είναι de facto μη ανακτήσιμη μέσα από το app παρότι υπάρχει
  ακόμη (soft-deleted) στην Postgres.

## 4. Νάκης AI (core/ai-chat.js) + Worker `/v1/ai/messages`
- `_aicCallClaude`/`_aicCallClaudeStream` (:888-980) καλούν **απευθείας**
  `https://api.anthropic.com/v1/messages` με header `x-api-key: ANTH_KEY`.
- `ANTH_KEY = ''` στο config.js:46 — **κενό**. Κάθε κλήση αποτυγχάνει με 401.
- Ο Worker έχει πλήρη, λειτουργικό proxy `/v1/ai/messages` (`handleAiMessages`, :669-727) με
  πραγματικό `env.ANTHROPIC_API_KEY` — **κανένα αρχείο του frontend δεν τον καλεί ποτέ** (grep repo
  για `/v1/ai/messages`: μόνο ο ορισμός του route στον ίδιο τον Worker).
- Συμπέρασμα: το «Νάκης» (chat assistant) είναι εντελώς νεκρό στην παραγωγή σήμερα, ανεξάρτητα από
  τα εργαλεία που ορίζει (`read_orders`, `read_fleet`, `create_work_order`, κ.λπ., :625-634) — αυτά
  δεν εκτελούνται ποτέ γιατί η ίδια η κλήση στο Claude αποτυγχάνει πρώτη.
- `core/command-center.js` και `core/command-palette.js`: καθαρά UI (widget builder / ⌘K
  navigation) — δεν διαβάζουν πίνακες οι ίδιοι, δεν εμπλέκονται στο AI μονοπάτι.

## 5. Εκτύπωση/PDF (core/share-helpers.js + Worker `/print/pdf`)
- `/print/pdf` (worker :3599-3703) αποδίδει το ίδιο `print.html` μέσω Browser Rendering
  (`env.BROWSER`, δεσμευμένο σωστά στο wrangler.toml). `share-helpers.js` (:29-33) το καλεί με JWT.
  Καλά τεκμηριωμένο, μοιάζει σωστό — δεν βρέθηκε ασυνέπεια.

## 6. Χρήστες/Ρόλοι
- `users` (Postgres): 18 γραμμές — 7 ενεργοί (ονόματα παραλείπονται) + 5 demo (ανά ρόλο) + 6 ανενεργές staging γραμμές (`zz_0013,stg_owner,
  stg_mgmt,stg_acct,stg_disp,stg_whse`, όλες `active=false`).
- `config.js`/`index.html` USERS roster: ταυτόσημα μεταξύ τους, 12 entries (7 real + 5 demo) — οι 6
  staging γραμμές **δεν υπάρχουν εκεί**. Αν ποτέ ενεργοποιηθούν, ο tamper guard (core/auth.js) τις
  πετάει έξω μετά το login (fail-closed — ασφαλές, αλλά ασυνεπές σύνολο).
- CLAUDE.md λέει «6 πραγματικοί λογαριασμοί» — σήμερα είναι **7** (προστέθηκε η `alexia`).
- Worker `PERMISSIONS` (5 ρόλοι: owner/management/accountant/dispatcher/warehouse) ταιριάζει με τους
  ρόλους που υπάρχουν στο `users`.

## Ερωτήσεις για τον owner
1. Οι 2 παραγγελίες με `invoiced=true` αλλά χωρίς αριθμό/ημερομηνία τιμολογίου — γνωστές, παλιές
   χειροκίνητες εγγραφές, ή θέλεις να διερευνηθεί πώς γράφτηκαν;
2. Θες να δοθεί στον accountant/management δικαίωμα `national_orders: PATCH` ώστε να μπορούν να
   τιμολογούν εθνικές παραγγελίες (σήμερα 403), ή να μείνει αποκλειστικά στον dispatcher;
3. Το «Νάκης» AI chat να ενεργοποιηθεί (σύνδεση με τον υπάρχοντα Worker proxy) ή να αφαιρεθεί το
   κουμπί μέχρι να αποφασιστεί, ώστε να μη δείχνει σπασμένο εργαλείο;
4. Θες μια πραγματική οθόνη πάνω στο `/app-errors` (server-wide) αντί ή δίπλα στο τοπικό
   localStorage log, ώστε να φαίνονται σφάλματα από ΟΛΗ την ομάδα, όχι μόνο τον browser του owner;
5. Ο Κάδος να συνδεθεί με το πραγματικό `deleted_at` (real undelete) αντί για localStorage +
   `atCreate` με νέο id, ώστε η επαναφορά να μην αφήνει σπασμένα links;
