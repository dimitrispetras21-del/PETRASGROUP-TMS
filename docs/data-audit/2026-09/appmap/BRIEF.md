# Κοινό brief — Χάρτης όλης της εφαρμογής (owner 7/9/2026: «όπως το σχεδιάγραμμα των εθνικών, για όλο το app, όλα»)

Είσαι ελεγκτής ΜΟΝΟ ανάγνωσης. Δεν αλλάζεις αρχεία, δεν κάνεις commit, δεν γράφεις στη βάση. Repo: /Users/dimitrispetras/PETRASGROUP-TMS
(vanilla JS SPA → Cloudflare Worker facade `worker/src/index.js` → Supabase Postgres). Βάση: mcp__supabase__execute_sql (SELECT μόνο· αν είναι
deferred, φόρτωσέ το με ToolSearch "select:mcp__supabase__execute_sql"). Table ids: config.js `TABLES`. Πρότυπο τελικού σχήματος: το εθνικό
κύκλωμα (`docs/data-audit/2026-09/2026-09-07-national-architecture.md`, με τους δύο χάρτες δίπλα του).

## Τι παραδίδεις (δύο αρχεία στον φάκελο που σου δίνεται)
1. `<circuit>.json` — ΑΥΣΤΗΡΑ αυτό το σχήμα, για να σχεδιαστεί αυτόματα το διάγραμμα:
```json
{"circuit":"intl","title":"Διεθνείς παραγγελίες",
 "columns":[
  {"key":"sources","label":"ΟΘΟΝΕΣ / ΠΗΓΕΣ","nodes":[{"id":"orders_intl","label":"Διεθνείς Παραγγελίες","sub":"φόρμα + λίστα","status":"ok","note":"…"}]},
  {"key":"core","label":"ΠΙΝΑΚΕΣ","nodes":[{"id":"orders","label":"Παραγγελίες","sub":"orders · 129","status":"ok","note":"…"}]},
  {"key":"consumers","label":"ΠΟΙΟΣ ΤΟ ΔΙΑΒΑΖΕΙ","nodes":[{"id":"payroll","label":"Μισθοδοσία","sub":"…","status":"broken","note":"…"}]}
 ],
 "edges":[{"from":"orders_intl","to":"orders","status":"ok","label":"γράφει","evidence":"orders_intl.js:1423"}],
 "findings":[{"sev":"critical","text":"…","evidence":"file:line ή SQL μέτρηση"}]}
```
- Ακριβώς 3 στήλες (sources / core / consumers), το πολύ **6 κόμβοι ανά στήλη** (ομαδοποίησε: π.χ. «Πελάτες·Συνεργάτες·Τοποθεσίες» ένας κόμβος).
- `label` ≤ 20 χαρακτήρες, `sub` ≤ 26, `edge.label` ≤ 22. Ελληνικά, απλά λόγια, χωρίς jargon (ο owner δεν είναι προγραμματιστής). Στο `sub` του πίνακα βάλε `όνομα_πίνακα · πλήθος ζωντανών γραμμών`.
- `status`: `ok` = διαδρομή υπάρχει ΚΑΙ αποδεδειγμένα δουλεύει (δεδομένα στη βάση ή ζωντανή χρήση)· `partial` = δουλεύει με ελάττωμα· `broken` = υπάρχει στον κώδικα αλλά αποτυγχάνει ή δεν φτάνει ποτέ (λάθος πίνακας, 4xx, drop)· `unused` = πίνακας άδειος ή κώδικας που δεν καλείται ποτέ.
  Κάθε status θέλει `evidence` (file:line ή SQL count ή γραμμή app_errors). Χωρίς απόδειξη → `partial` και γράψε «δεν προκύπτει».
- Κόμβοι-πίνακες: ΟΛΟΙ οι πίνακες του κυκλώματός σου, και οι άδειοι (status `unused`).
2. `<circuit>.md` (≤ 150 γραμμές) — τα ίδια σε πεζό: οθόνες → τι διαβάζουν/γράφουν (file:line), κουμπιά που γράφουν, διαδρομές συγχρονισμού,
   ασυνέπειες (δύο υπολογισμοί για το ίδιο, νεκρές τιμές, σιωπηλές απορρίψεις), ερωτήσεις για τον owner (≤ 5).

## Πώς μετράς
- Χρήση: `select count(*) … where deleted_at is null` ανά πίνακα· τελευταία εγγραφή (`max(created_at)`)· αν ο πίνακας έχει 0 ή δεν γράφτηκε ποτέ από την εφαρμογή → `unused`.
- Σιωπηλές απορρίψεις: πίνακας `facade_unknown_fields` (table, label, kind, count, last_seen) — ό,τι ζητά η οθόνη και ο Worker πετάει.
- Σφάλματα: `app_errors` τελευταίων 14 ημερών (message like '%<context>%').
- Δικαιώματα: `PERMISSIONS` στον Worker (grep) ανά ρόλο για τους πίνακές σου.
- Κανόνες βάσης: FKs (`pg_constraint`), triggers (`pg_trigger`), views που εξαρτώνται.
Μην μαντεύεις· «δεν προκύπτει» είναι αποδεκτή απάντηση. Μην κολλάς κώδικα (≤ 3 γραμμές ανά παράθεση). Στο τέλος απάντησε με τα δύο paths και 5 γραμμές ευρήματα.
