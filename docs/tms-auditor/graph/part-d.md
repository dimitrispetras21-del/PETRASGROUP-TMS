# Part Δ — Master data, Συντήρηση, Ράμπα (εστίαση), Dashboards, AI-chat, νεκρός κώδικας

Base SHA `549a2a4`. 158 nodes, 129 edges, 8 failure_modes, 4 checks_existing, 7 gaps, 5 cross_deps.
Read-only: Read/Grep/Glob + `grep`/`sed`/`wc` μόνο. Καμία βάση, κανένα network call.

## 1. Ράμπα — γράφει χωρίς κλικ (F-28/F-29)

Επιβεβαίωσα με κώδικα (όχι μόνο περίληψη του 02a): `modules/daily_ramp.js#_rampLoad` (γρ. 95) καλεί
`_rampAutoSync` σε **κάθε** άνοιγμα σελίδας ή αλλαγή ημέρας, για owner+dispatcher
(`can('planning')==='full'`). Η `_rampAutoSync` (γρ. 115-335) διαβάζει ORDER_STOPS/ORDERS/NAT_LOADS και
κάνει `atCreate(RAMP,…)` σε παρτίδες των 10 (γρ. 324) — καμία ένδειξη επιτυχίας, μόνο toast σε **μερική**
αποτυχία. Επιβεβαίωσα ΚΑΙ την ανάστροφη κλήση: `core/order-sync.js:84-90` καλεί την ίδια συνάρτηση
fire-and-forget από κάθε `syncOrderDownstream` χωρίς `skipRamp` (cross-dep → μέρος α, καταγράφηκε).

Οι FK στήλες `order_id/national_order_id/national_load_id/truck_id/driver_id` **υπάρχουν πλέον** στον
Worker (`links` block, worker/src/index.js:1067-1074) — η παλιά παρατήρηση «0/44 χωρίς δεσμό» (6/9) αφορά
ιστορικές γραμμές πριν μπει το `links` block, το build σήμερα γράφει τους δεσμούς σωστά.

Το «Ολοκληρώθηκε» (`_rampDone`, γρ. 693-796) προάγει το γονικό ORDERS/NAT_ORDERS/NAT_LOADS σε
`In Transit` **μόνο** αν υπάρχει δεσμός· γραμμή χωρίς δεσμό = καμία ενέργεια, καμία ένδειξη (FM-d-02).

## 2. Field-map mismatches master data — **ΜΗΔΕΝ βρέθηκαν σήμερα**

Σύγκρινα ΚΑΘΕ label που στέλνουν τα `formFields` του `core/entity.js` (clients/partners/drivers/
trucks/trailers/workshops) και το `modules/locations.js` με τον χάρτη `TABLES` του Worker, πεδίο-πεδίο:
**όλα** τα labels που στέλνει η φόρμα υπάρχουν στον χάρτη. Τα ιστορικά κενά του CLAUDE.md (contact_person,
payment_terms_days, VAT Number/Legal Name/Aliases/Country στα WORKSHOPS, Estimated Cost στο MAINT_REQ)
είναι **όλα κλεισμένα και στις δύο πλευρές** (χάρτης + φόρμα) στο σημερινό build — επιβεβαιώθηκε με
γραμμές κώδικα, όχι με μέτρηση βάσης (βλ. Gaps). Ο πίνακας «Γραμμένα» του CLAUDE.md (24-8, ενημ. 30-8)
φαίνεται **στη λογική στηλών σήμερα ξεπερασμένος** για `Estimated Cost` (η φόρμα γρ. 1944 λέει ρητά
«mapped since 3/9» — χρειάζεται νέα μέτρηση, όχι νέο fix).

Ο μόνος πραγματικός στόχος-πεδίου: `Driver.Salary Base` — δεν υπάρχει στήλη καθόλου (όχι μόνο χάρτης),
το πεδίο είναι `disabled` στη φόρμα και **δεν στέλνεται ποτέ** (core/entity.js:362-368) — σωστό μοτίβο.

## 3. Dashboards / KPI — NULL→0 πιο διαφοροποιημένο απ' ό,τι περίμενα

Βρήκα ένα **πραγματικό, αγκυλωτό** silent bug: `modules/ceo_dashboard.js#_calcTopClients` (γρ. 530-534)
διαβάζει `r.fields['Client Name']` — label που **δεν υπάρχει πουθενά** στον χάρτη ORDERS (μόνο σύνδεσμος
`Client`→clients.id). Πάντα undefined → κάθε παραγγελία πέφτει σε client name `'Unknown'` → το KPI Top
Clients δείχνει **100% του τζίρου κάτω από «Unknown»**, σιωπηλά, χωρίς badge (FM-d-03).

Αντίθετα, η διπλανή `_calcDeadKM` (γρ. 501-528) διαβάζει επίσης ανύπαρκτα labels (`Dead KM`/`Loaded KM`/
`Total KM` — επίσης απόντα από τον χάρτη ORDERS) αλλά έχει σωστό μοτίβο: πέφτει σε εκτίμηση
(matched/unmatched imports) και η οθόνη δείχνει ρητά ένα badge **«ESTIMATE»** (γρ. 321) — φωναχτό, όχι
σιωπηλό. Άρα το ίδιο module έχει και τα δύο μοτίβα δίπλα-δίπλα.

## 4. Νεκρός κώδικας (αρχή 8)

- `core/metrics.js#captureMetricSnapshot(Batch)` (γρ. 517-580): **κανένας καλών** πουθενά· γράφει σε
  `TABLES.METRICS_SNAPSHOTS` (config.js:80, `tblakFiR37kf4uQXy`) που **δεν υπάρχει καθόλου** στον χάρτη
  `TABLES` του Worker — 404 αν κληθεί ποτέ. Νεκρό και στις δύο άκρες.
- `worker/src/index.js#handleGetLocations/handleCreateLocation` (`/api/locations`, γρ. 677-730): πλήρως
  λειτουργικό, δικό του RBAC, δικό του (στενότερο) allowlist πεδίων — αλλά **κανένα frontend αρχείο δεν
  το καλεί ποτέ** (grep σε όλο το repo), το `modules/locations.js` χρησιμοποιεί πάντα το γενικό `/v0/…`.
- **Νέο εύρημα, όχι στο 02a**: `config.js` έχει `SCAN_TRAINING` δηλωμένο **δύο φορές** στο ίδιο literal —
  γρ. 79 σωστό id (`tblScanTraining000`, που αντιστοιχεί σε **πλήρως καλωδιωμένο** πίνακα στον Worker,
  γρ. 1742-1746), γρ. 85 το ξαναγράφει σε `''`. Η JS κρατά το τελευταίο → το cloud-write του
  `core/scan-helpers.js#scanSaveCorrection` (γρ. 352-360) είναι **μόνιμα νεκρό**, ενώ ο Worker είναι έτοιμος
  (FM-d-06). Μονογραμμικό fix: διαγραφή της γρ. 85.

## 5. AI-chat `update_record` — πιο στενό απ' όσο έλεγε το 02a

Το tool schema περιορίζει `table` σε `enum: [orders, national_orders, trucks, trailers,
maintenance_requests]` (core/ai-chat.js:412) **και** ξαναελέγχεται στον κώδικα μέσω `_TABLE_MAP` πριν το
`atPatch` (γρ. 575-576) — ΟΧΙ «όποιον πίνακα του χάρτη» όπως έλεγε το 02a. Destructive-confirm modal
σωστά `await`-άρεται πριν την εκτέλεση (γρ. 522-527). Ρόλοι με το tool: owner+management μόνο
(AIC_PROFILES, γρ. 623-636) — client-side gate, διπλά καλυμμένο από το server RBAC. Παράπλευρο εύρημα:
το `core/ai-chat.js` καλεί `api.anthropic.com` **απευθείας από τον browser** (γρ. 898, 964) με
`ANTH_KEY` που είναι `''` στο committed `config.js:46` — ενώ υπάρχει έτοιμο, ασφαλές server proxy
`/v1/ai/messages` (worker/src/index.js:742-800) που **δεν φαίνεται να καλείται καθόλου** από το
ai-chat.js (FM-d-08, out-of-scope security, μόνο σημειώνεται).

## RBAC ανά πίνακα (επιβεβαιωμένο σε γραμμή)

RAMP: owner/dispatcher full, management GET-only (ρητό, γρ. 462), accountant GET-only (χωρίς γραμμή →
`*`), **warehouse καθόλου** (ούτε GET — καμία γραμμή, κανένα wildcard). Master data (clients/partners/
locations/drivers/trucks/trailers/workshops): management/accountant/dispatcher full CRUD σήμερα (owner
lock 23/8), warehouse καθόλου εκτός από locations:GET.

## Έλεγχοι που υπάρχουν

`facade_unknown_fields` + RPC `log_unknown_field` (worker/src/index.js:629-673, migration 008): **νέος
μηχανισμός, δεν είναι στο CLAUDE.md** — καταγράφει ΚΑΘΕ άγνωστο label σε write ΚΑΙ read, με dedupe 60"/
isolate. Παθητικός: τρέχει αυτόματα αλλά κανείς δεν τον κοιτάζει proactively. Το `modules/metrics_audit.js`
(σελίδα «Έλεγχος Μετρήσεων») είναι η διαδραστική εκδοχή του «επαναλαμβανόμενου ελέγχου» του CLAUDE.md —
τρέχει μόνο όταν κάποιος ανοίξει τη σελίδα.

## Σημείωση για CLAUDE.md

Οι γραμμές που παραθέτει το CLAUDE.md για τους τρεις μηχανισμούς-παγίδες («γρ. 1553-1560», «γρ. 1897-1904»,
«γρ. 1649») έχουν **μετατοπιστεί**: σήμερα είναι `buildWriteRow` γρ. 2322-2345, `toAirtableRecord` γρ.
2132-2140, `resolveColumn` γρ. 1908-1915 — ίδιος μηχανισμός, νέες γραμμές (μετά την προσθήκη του
unknown-field logger). Δεν είναι λάθος περιεχομένου, μόνο stale line numbers.

## Gaps (πλήρες στο part-d.json)

Δεν ελέγχθηκε το petras-assign iframe (πηγή εκτός repo)· δεν βρέθηκε πού γεμίζει το `ANTH_KEY` σε
παραγωγή· δεν ξαναμέτρησα τα coverage ids E4/B3 πέρα από το 02a που διάβασα· `performance.js`'s fetch
προς `/performance/delivery` δεν επιβεβαιώθηκε γραμμή-προς-γραμμή· καμία μέτρηση βάσης (μόνο κώδικας).

## Cross-deps

→ α: `order-sync.js` ↔ `_rampAutoSync` (αμφίδρομα)· → β: ORDERS χάρτης (Client Name/Dead KM/Total Cost
απόντα, δικά τους ευρήματα αν προστεθούν)· → β/γ: ramp autosync διαβάζει ORDER_STOPS/NAT_LOADS/ORDERS·
→ ε: `performance.js` πιθανό `ct_round_trips` read (Total Cost/Cost) — να επιβεβαιωθεί.
