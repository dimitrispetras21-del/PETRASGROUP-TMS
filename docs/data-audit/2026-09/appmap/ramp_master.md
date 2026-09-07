# Κύκλωμα: Ράμπα & βασικά αρχεία (7/9/2026, read-only)

## (a) Ράμπα

**Δημιουργία γραμμών — αυτόματη, όχι χειροκίνητη κύρια οδός.** `_rampAutoSync()`
(`modules/daily_ramp.js:103-311`) διαβάζει `order_stops` με τοποθεσία Βέροιας
(`F.VEROIA_LOC`, γρ. 144-147) και φτιάχνει γραμμές `ramp` για κάθε στάση που δεν
έχει ήδη συγχρονιστεί (dedup με `Notes='STOP:<id>'`, γρ. 118-132). Πηγή στάσης:
είτε παραγγελία διεθνής (`F.STOP_PARENT_ORDER`) είτε φορτίο εθνικό
(`F.STOP_PARENT_NL`, δηλ. `national_loads`, **ποτέ** `national_orders`). Υπάρχει
και χειροκίνητη προσθήκη (`_rampSaveNew`, γρ. 785-802) από το κουμπί «+ Άφιξη/
Αναχώρηση» — χωρίς σύνδεση σε παραγγελία, μόνο ελεύθερο κείμενο.

**Πίνακας `ramp`** (`worker/src/index.js:936-999`): όλα τα πεδία στήλης
mapped· το links block (`Order→orders`, `National Order→national_orders`,
`Truck→trucks`, `Driver→drivers`) μπήκε πρόσφατα (σχόλιο «deployed 7/9» στο
brief). Μέτρηση τώρα: `ramp` 44 ζωντανές γραμμές, **0/44** με `order_id`,
`national_order_id`, `truck_id` ή `driver_id` γεμάτο. Τελευταία γραμμή
δημιουργήθηκε 2026-09-06 07:47 — πριν το deploy, άρα η διόρθωση είναι
**αναπόδεικτη**: κανείς δεν άνοιξε τη ράμπα ώστε να ξανατρέξει το auto-sync.

**Εύρημα κρίσιμο — λάθος πίνακας στο link.** Το `National Order` link
resolveΐζεται στο `national_orders` (worker γρ. 996), αλλά ο κώδικας βάζει εκεί
`nlPid`, δηλαδή id από `national_loads` (γρ. 204, 272, 692-696 nl handling). Το
`resolveLinksOnWrite` (worker γρ. 1996-2029) ψάχνει το legacy id στο
`national_orders`, δεν το βρίσκει, και το write handler (γρ. 2291-2294) γυρίζει
**400 «Unknown linked record in request»** αντί να δημιουργήσει τη γραμμή.
Πριν το links block αυτό απλώς έπεφτε σιωπηλά (`facade_unknown_fields`,
βλ. κάτω) — τώρα είναι σκληρό σφάλμα. Ίδιο ρίζα-πρόβλημα με το Ε1 του εθνικού
κυκλώματος (`docs/data-audit/2026-09/2026-09-07-national-architecture.md`).

**«Ολοκληρώθηκε» (`_rampDone`, γρ. 657-712).** Διαβάζει
`r.fields['National Order']` (που είναι στην πραγματικότητα id `national_loads`)
και καλεί `atGetOne(TABLES.NAT_ORDERS, natOrderId)` (γρ. 694) — **λάθος πίνακας**.
Η εθνική/φορτίο κατάσταση ποτέ δεν προάγεται σε `In Transit` μέσω αυτής της
διαδρομής· μόνο `console.warn`, καμία ένδειξη στην οθόνη. Για διεθνείς
παραγγελίες (`Order` link, id σωστό προς `orders`) η ίδια λογική **δουλεύει**
(γρ. 680-690· `Status='In Transit'` + `paSyncStatus`).

**FK χωρίς κάλυψη.** `ramp_truck_id_fkey`, `ramp_driver_id_fkey` υπάρχουν στη
βάση· **δεν** υπάρχει FK για `order_id`/`national_order_id` (μετρημένο σε
`pg_constraint`). Αν κάποιο μελλοντικό write path παρακάμψει το Worker, η βάση
δεν θα πιάσει λάθος id εκεί.

**RAMP EVENTS**: δεν υπάρχει τέτοιος πίνακας — δεν βρέθηκε σε `TABLES`, σε
`worker/src/index.js` ή σε Postgres. **LOCAL_MOVES**: επιβεβαιωμένο με grep, η
ράμπα δεν το αγγίζει καθόλου (κανένα `local_moves`/`LOCAL_MOVES` σε
`daily_ramp.js`). Ο πίνακας `local_moves` είναι 0 γραμμές ούτως ή άλλως.

**Δικαιώματα.** `dispatcher.ramp = GET/POST/PATCH/DELETE` (owner lock: πλήρης
ιδιοκτησία της ράμπας)· `management.ramp = GET`· `accountant`/`owner` μέσω `*`.
**`warehouse` δεν έχει καθόλου γραμμή `ramp` ούτε wildcard `*`** στο
`PERMISSIONS` (worker γρ. ~509-527) → `can()` επιστρέφει `false` για ΚΑΘΕ
μέθοδο, ακόμα και GET. Η αποθήκη δεν μπορεί να δει τη ράμπα από το API, μόνο ο
dispatcher/management/owner/accountant.

## (b) Βασικά αρχεία (master data)

Όλα μέσω `core/entity.js` (`ENTITY_CONFIG`, γρ. 139+) — generic CRUD πάνω σε
config, ίδιο μοτίβο φόρμας/λίστας/κάρτας για όλες τις οντότητες.

**CLIENTS** (`clients` · 1.920) — φόρμα γρ. 188-213. Worker map (γρ. 755-776)
πλέον έχει `Contact Person→contact_person`, `Payment Terms Days→payment_terms_days`.
Μέτρηση τώρα: `contact_person` **1/1920**, `payment_terms_days` **0/1920**.
Το `core/entity.js` γρ. 161-166 λέει ακόμη «dead — renders «—»» για τα δύο
πεδία, αλλά **δεν** είναι πια `disabled` στη φόρμα (γρ. 205-210) — σχόλιο
ξεπερασμένο, όχι λάθος συμπεριφορά· η αχρησία είναι πρακτική, όχι κώδικα.

**PARTNERS** (`partners` · 432) — ίδιο σχήμα, `Contact Person` mapped
(worker γρ. 789), **0/432** γεμάτο. Σχόλιο «dead» στο entity.js γρ. 233 ίδιο
ζήτημα.

**DRIVERS/TRUCKS/TRAILERS** (81/36/40) — worker γρ. 793-848. TRUCKS πήρε
`Tachograph Expiry`, `Next Maintenance Date`, `Country` (migration 017, 6/9).
TRAILERS πήρε μόνο `Country` — **δεν** πήρε `ATP Expiry`, `Pallet Capacity`,
`Weight kg`, `Next Maintenance Date`. Αυτά τα τέσσερα καταγράφονται ΤΩΡΑ σε
`facade_unknown_fields` ως `kind=read` (η οθόνη τα ζητά, ο Worker τα πετάει):
trailers `ATP Expiry` last_seen 5/9, `Pallet Capacity`/`Weight kg` last_seen
4-5/9. **Οδηγοί: βασικός μισθός δεν έχει καν στήλη** (επιβεβαιωμένο στο
CLAUDE.md, όχι νέο εύρημα).

**Deploy-lag εύρημα.** Το ίδιο `facade_unknown_fields` δείχνει trucks
`Tachograph Expiry` last_seen **2026-09-07 07:17** — ΣΗΜΕΡΑ το πρωί — παρότι το
`worker/src/index.js` του repo ΕΧΕΙ ήδη το mapping (γρ. 824). Η μόνη εξήγηση
χωρίς μαντεψιά: είτε ο Worker παραγωγής δεν έχει πάρει ακόμη αυτό το deploy,
είτε υπάρχει άλλη διαδρομή ανάγνωσης (π.χ. `?fields[]=`) που δεν περνά από τον
ίδιο χάρτη. Δεν προκύπτει ποιο από τα δύο χωρίς έλεγχο του live bundle
(εκτός σκοπής read-only ελέγχου βάσης) — αξίζει επαλήθευση με τον φρουρό των
τριών πριν θεωρηθεί λυμένο.

**WORKSHOPS** (`workshops` · 70) — πλήρης χάρτης (worker γρ. 850-870):
`Country`, `Aliases`, `VAT Number→tax_id`, `Legal Name→legal_name` όλα εκεί,
`aliases` γεμάτο **70/70** (πιθανώς default τιμή, όχι απόδειξη ουσιαστικής
χρήσης — δεν προκύπτει το ποσοστό με πραγματικό περιεχόμενο).

**LOCATIONS** (`locations` · 1.175) — δικό της module (`modules/locations.js`,
864 γρ.) + χάρτης (`modules/locations_map.js`, 619 γρ.) + endpoint αποκλειστικό
`GET/POST /api/locations` (worker γρ. 3741-3744, εκτός γενικού facade). Μόνο
λατινικοί χαρακτήρες (owner 9/8, memory) — προσοχή σε matching με greeklish.

**Χρήστες/ρόλοι.** `index.html` `USERS` (γρ. 326-349): 12 εγγραφές (7
πραγματικοί + 5 demo, ένα password ανά demo ρόλο). `public.users` στη βάση: 18
γραμμές, **7 active=true** (ονόματα παραλείπονται) — οι υπόλοιπες 11 είναι στελέχη δοκιμών/staging/demo, ΟΛΕΣ
`active=false`, **περιλαμβανομένων και των 5 demo** που υπάρχουν στο
`index.html USERS` roster. Άρα ένα demo login θα περάσει τον tamper guard του
frontend (`core/auth.js:24-30`) αλλά (αν το backend ελέγχει `active`) θα
αποτύχει στο `/auth/login`. Δεν δοκιμάστηκε (καμία εκτέλεση exploit/login εδώ)
— μόνο ανάγνωση δύο ανεξάρτητων ρόστερ, όπως προειδοποιεί το CLAUDE.md.
`PERMISSIONS` ρόλοι: owner/management/accountant/dispatcher/warehouse
(worker γρ. 371+).

**countries.js** — μία λίστα ISO-2 (`COUNTRY_CODES`) + προτεραιότητα φυλής
(`COUNTRY_PRIORITY`) + alias map για ελληνικά/λάθος γραφές (γρ. 1-40). Καμία
επαφή με βάση — καθαρά frontend vocabulary, χρησιμοποιείται από forms
clients/partners/workshops/locations/trucks/trailers (type:'country').

**Reference cache (30 λεπτά).** `core/api.js:25-26`
(`STABLE_MS=30min`, `SESSION_MS=2min`) + `preloadReferenceData()` (γρ. 792)
τροφοδοτεί `getRefClients/Drivers/Trucks/Locations` που χρησιμοποιεί η ράμπα
και οι φόρμες παραγγελιών — επιβεβαιωμένο ταίριασμα με το MEMORY.md.

## Ασυνέπειες / σιωπηλές απορρίψεις (συγκεντρωτικά)
- RAMP `National Order` → λάθος πίνακας-στόχος resolve (κρίσιμο, βλ. πάνω).
- RAMP `order_id`/`national_order_id` χωρίς FK, `truck_id`/`driver_id` με FK.
- TRUCKS/TRAILERS: cold-chain/βάρος πεδία ακόμη πετιούνται σε ανάγνωση σήμερα
  (δείτε deploy-lag εύρημα) — ίδιο μοτίβο με το ιστορικό ATP Expiry του
  CLAUDE.md.
- entity.js σχόλια «dead» για Clients/Partners Contact Person +
  Payment Terms Days ξεπερασμένα — τα πεδία γράφονται πλέον, απλώς σπάνια.
- `warehouse` χωρίς καμία πρόσβαση στο `ramp` (ούτε GET).

## Ερωτήσεις για τον owner (≤5)
1. Η ράμπα να συνδεθεί με `national_loads` (όχι `national_orders`) για το
   «National Order» link — μαζί με τη διόρθωση §5 του εθνικού εγγράφου, ή
   ξεχωριστό deploy;
2. Θέλεις τώρα τον χάρτη για trailers `ATP Expiry`/`Pallet Capacity`/`Weight kg`
   (ίδιο ρίσκο με το περιστατικό ψύξης), ή μένει για άλλη φάση;
3. Να γίνει νέο `wrangler deploy` (μετά τις 15:00, με τον φρουρό) για να
   επιβεβαιωθεί ότι trucks `Tachograph Expiry`/`Next Maintenance Date` όντως
   έφτασαν στην παραγωγή;
4. Τα σχόλια «dead» στο `core/entity.js` (Clients/Partners Contact Person,
   Payment Terms Days) να καθαριστούν αφού πλέον γράφονται, ή μένουν ως
   υπενθύμιση μέχρι να δούμε πραγματικές εγγραφές;
5. Το `warehouse` χωρίς καμία πρόσβαση στη ράμπα — σκόπιμο ή ξεχασμένη γραμμή
   δικαιώματος;
