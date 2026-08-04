# _ALL_FINDINGS — όλες οι παρατηρήσεις, ανά σελίδα

Συγκεντρωτικός κατάλογος και των **230** ευρημάτων του audit της 4/8/2026.
Κάθε γραμμή: κωδικός · σοβαρότητα · κατηγορία · παρατήρηση · απόδειξη.
Πλήρης ανάλυση (job-to-be-done, ροές κλικ, προτάσεις με κόπο/ρίσκο, πριν/μετά)
στο αντίστοιχο `<route>.md`.

**Σύνολο: 38 P0 · 98 P1 · 94 P2.**
P0 = μπλοκάρει ή κοστίζει λάθη · P1 = καθημερινή τριβή · P2 = γυάλισμα.

---

## PLANNING

### dashboard — Dashboard (design 6 / λειτ. 4 — P0:1 P1:5 P2:4)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| D-1 | **P0** | Λειτουργία | «Εβδομάδα 31» και «0/27 φορτηγά W31» ενώ η ISO εβδομάδα είναι 32 — το Weekly Intl δίπλα δείχνει 32 την ίδια στιγμή | `core/utils.js:182-186` vs `core/metrics.js:21-26`· live |
| D-2 | P1 | Λειτουργία | Το κόκκινο banner «37 ληγμένα έγγραφα» δεν κλικάρεται (`<div>` χωρίς onclick) | live DOM probe· `modules/dashboard.js:349-353` |
| D-3 | P1 | Accessibility | Και οι 5 KPI κάρτες είναι `<div onclick>` χωρίς `tabindex`/`role` | live: `kpiTag:"DIV", kpiTab:null`· `dashboard.js:402,411,419` |
| D-4 | P1 | Κατάσταση | «0» και «δεν ξέρουμε» δείχνουν ίδια — 0%/0 ενώ η βάση δεν έχει παραγγελίες μετά την εβδ. 22 | live `atGetAll(ORDERS)` → 124, max week 22 |
| D-5 | P1 | Consistency | Τρεις γλώσσες στην ίδια οθόνη: «Αξιοποίηση Στόλου», «Dead Kilometers», «USAGE RATE ΣΤΟΛΟΥ», «no matched pairs» | `dashboard.js:416,425,463` |
| D-6 | P1 | Ιεραρχία | Ο `weeklyScore` υπολογίζεται και δεν εμφανίζεται· 5 ισοβαρή KPI χωρίς πρωτεύον | `dashboard.js:346-347` |
| D-7 | P2 | Responsive | KPI grid `repeat(4,1fr)` με 5 κάρτες → σπασμένη σειρά στα ≤1200 | `assets/style.css:1533` |
| D-8 | P2 | Layout | Το AI-chat FAB καλύπτει την κάρτα ΕΙΔΟΠΟΙΗΣΕΙΣ ΣΤΟΛΟΥ | live: `#aic-toggle` fixed 52×52 @(1364,590)· screenshot |
| D-9 | P2 | Κατάσταση | Το loading skeleton είναι σκούρο πάνω σε λευκό | `core/ui.js:191,196` |
| D-10 | P2 | Τυπογραφία | 8 uppercase «eyebrow» κεφαλίδες στην ίδια οθόνη | screenshot |

### weekly_intl — Weekly International (5 / 6 — P0:0 P1:5 P2:6)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| WI-1 | P1 | Κατάσταση | Δύο από τα 4 KPI μένουν «loading…» για πάντα σε κενή εβδομάδα — **0 network requests σε 8″** | `weekly_intl.js:439` `if (total>0)`· placeholders `:359-360`· live fetch interceptor |
| WI-2 | P1 | Λειτουργία | Η ομαδοποίηση και το matching ανακοινώνονται σε **8px / opacity 0.45** | `weekly_intl.js:413,421` |
| WI-3 | P1 | Consistency | 17 αγγλικά strings ταυτόχρονα ορατά — η πιο αγγλική σελίδα του app | `weekly_intl.js:376,379,401,403,413,421,427`· `command-center.js:57,73,92` |
| WI-4 | P1 | Ιεραρχία | Τριπλός τίτλος + τετραπλή αναφορά εβδομάδας· ο πίνακας ξεκινά κάτω από το fold | live: content 780px / viewport 666px |
| WI-5 | P1 | Accessibility | 6 `<div onclick>`· το drag-drop matching δεν έχει καμία εναλλακτική πληκτρολογίου | grep· live snapshot |
| WI-6 | P2 | Consistency | Emoji εικονίδια (🚛🔗📊⏱) σε app που αλλού χρησιμοποιεί Lucide SVG | `core/command-center.js:57,73,92` |
| WI-7 | P2 | Layout | Η λωρίδα 21 εβδομάδων ξεχειλίζει χωρίς ένδειξη scroll (W36 κομμένο) | screenshot |
| WI-8 | P2 | Λειτουργία | Τα βελάκια ←/→ αλλάζουν εβδομάδα χωρίς ένδειξη στο UI και χωρίς undo | `core/ui.js:292-297` |
| WI-9 | P2 | Τυπογραφία | Το Syne (display face) για αριθμούς δεδομένων· το `0` διαβάζεται ως δακτύλιος | crop screenshot· `command-center.js:110` |
| WI-10 | P2 | Χρώμα/Tokens | Το Command Center είναι εξ ολοκλήρου inline styles με hardcoded hex | `command-center.js:105`· `weekly_intl.js:359-360` |
| WI-11 | P2 | Consistency | Print υπάρχει εδώ, λείπει από το Weekly National | `weekly_intl.js:401` vs `weekly_natl.js:294` |

### weekly_natl — Weekly National (7 / 7 — P0:0 P1:3 P2:5)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| WN-1 | P1 | Consistency | Ασυμμετρία με τη δίδυμη σελίδα: λείπουν Command Center, Print, φίλτρο «Unmatched» | live· `weekly_natl.js:294` vs `weekly_intl.js:401` |
| WN-2 | P1 | Κατάσταση | Ίδιο λανθάνον bug «μόνιμο loading…» — δεν φαίνεται μόνο επειδή το CC είναι πίσω από `if(total>0)` | `weekly_natl.js:331`, `:257-258` |
| WN-3 | P1 | Λειτουργία | Καμία εκτύπωση — η αποθήκη Βέροιας δουλεύει με χαρτί | `weekly_natl.js:294` |
| WN-4 | P2 | Τυπογραφία | Ορθογραφικό στο empty state: «Δεν υπαρχουν» (χωρίς τόνο) | `weekly_natl.js:317` |
| WN-5 | P2 | Consistency | Αγγλικό placeholder αναζήτησης σε κατά τα άλλα ελληνική σελίδα | `weekly_natl.js:272` |
| WN-6 | P2 | Accessibility | 8 `<div onclick>` — τα περισσότερα ανά module μαζί με το maintenance | grep |
| WN-7 | P2 | Κατάσταση | Το empty-state εικονίδιο είναι κενό τετράγωνο, ενώ υπάρχουν έτοιμα `_EMPTY_SVG.truck/.plan` | screenshot· `core/ui.js:158-177` |
| WN-8 | P2 | Layout | Ίδιο overflow στη λωρίδα εβδομάδων | screenshot |

### weekly_pickups — National Pick Ups (3 / 1 — P0:2 P1:4 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| PU-1 | **P0** | Λειτουργία | Η σελίδα δεν λειτουργεί καθόλου: **HTTP 401** — δεν φορτώνει καμία γραμμή, κανένα αποθηκευμένο φορτίο | live console ×4· UI «Σφάλμα: HTTP 401»· `national_consolidation.html:553,652` |
| PU-2 | **P0** | Ασφάλεια δεδομένων | Split-brain: ό,τι σωθεί πάει σε άλλη βάση από το TMS — **δεν διορθώθηκε** από 3/8 | ίδια console· `core/router.js:269` |
| PU-3 | P1 | Λειτουργία | Εμφανίζεται το literal `${""}` δίπλα στο Undo | `~/petras-assign/national_consolidation.html:320` |
| PU-4 | P1 | Consistency | Διπλό κέλυφος: δεύτερο logo, δεύτερος τίτλος, native date inputs ξένα προς το TMS | screenshot· `router.js:258` |
| PU-5 | P1 | Layout | Η 3η κάρτα φορτηγού κόβεται στα 1440 μαζί με το κουμπί διαγραφής της | screenshot |
| PU-6 | P1 | Κατάσταση | Το σφάλμα δείχνει τεχνικό κωδικό, χωρίς «τι σημαίνει / τι κάνω» | `national_consolidation.html:652` |
| PU-7 | P2 | Ασφάλεια δεδομένων | `sandbox="allow-scripts allow-same-origin"` ακυρώνει το sandbox | live console warn· `router.js:269` |
| PU-8 | P2 | Ιεραρχία | Το iframe παίρνει `calc(100vh-56px)` αλλά μετρήθηκε 614px σε viewport 666 | live· `router.js:263` |

---

## DAILY OPS

### daily_ops — Daily Ops Plan (6 / 6 — P0:0 P1:4 P2:5)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| DO-1 | P1 | Consistency | 40+ κεφαλίδες και όλα τα controls αγγλικά· μόνη ελληνική λέξη η ημερομηνία | `daily_ops.js:176,213,214,276,281,286,338` |
| DO-2 | P1 | Ιεραρχία | Τέσσερις χωριστοί πίνακες με πανομοιότυπες κεφαλίδες· 987px σε **0** εγγραφές | live· screenshot |
| DO-3 | P1 | Κόπος χρήστη | Το checklist είναι 5 ξεχωριστές στήλες (11 στήλες συνολικά) | screenshot |
| DO-4 | P1 | Κατάσταση | «0 orders · 27 overdue» στην ίδια γραμμή τίτλου — δύο ασυμφιλίωτοι αριθμοί | live· `daily_ops.js:267` |
| DO-5 | P2 | Κατάσταση | «No orders» ×4 στην ίδια οθόνη, χωρίς εικόνα/επόμενο βήμα | `daily_ops.js:338` |
| DO-6 | P2 | Χρώμα/Tokens | Οι 4 KPI δείχνουν «—» με χρωματιστή παύλα, χωρίς ετικέτα «κανένα δεδομένο» | screenshot |
| DO-7 | P2 | Λειτουργία | Το TOMORROW δεν έχει «μεθαύριο» ούτε date picker, ενώ το Ramp Board δίπλα έχει | live |
| DO-8 | P2 | Accessibility | Το toggle του banner είναι `<div onclick>` με inline DOM manipulation | `daily_ops.js:212` |
| DO-9 | P2 | Λειτουργία | Το toast επιβεβαίωσης είναι σκέτο «✓» | `daily_ops.js:577` |

### daily_ramp — Daily Ramp Board (8 / 7 — P0:0 P1:4 P2:4)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| DR-1 | P1 | Consistency | Όλη η σελίδα αγγλικά, ενώ ο χρήστης της είναι εργάτης αποθήκης με tablet | `daily_ramp.js:427,430,466,472,479,509` |
| DR-2 | P1 | Responsive | Δύο πίνακες 9 στηλών side-by-side σε σελίδα με πραγματικό tablet use case | screenshot· **1** `@media(max-width:1024px)` σε όλο το style.css |
| DR-3 | P1 | Anti-pattern | 5 side-stripe borders συγκεντρωμένα εδώ, με 4 hardcoded hex | `daily_ramp.js:843,851-854` |
| DR-4 | P1 | Κατάσταση | Τέσσερα διαφορετικά «άδειο» μηνύματα σε μία οθόνη· κανένα δεν λέει τι να κάνεις | `daily_ramp.js:466,472,479,509` |
| DR-5 | P2 | Λειτουργία | Το auto-refresh δεν φαίνεται πουθενά — καμία ένδειξη «ενημερώθηκε πριν 30″» | `daily_ramp.js:41`· screenshot |
| DR-6 | P2 | Ιεραρχία | Πέντε ισοβαρή KPI, με το «Progress» — το πιο χρήσιμο για τη ράμπα — τελευταίο | screenshot |
| DR-7 | P2 | Χρώμα/Tokens | Hardcoded semantic χρώματα στα KPI χωρίς tokens | `daily_ramp.js:843` |
| DR-8 | P2 | Consistency | Το «Vermion Fresh» δεν εξηγείται πουθενά | screenshot |

---

## ORDERS

### orders_intl — International Orders (7 / 6 — P0:1 P1:4 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| OI-1 | **P0** | Λειτουργία | Το φίλτρο «Week» ανοίγει προεπιλεγμένο σε **λάθος εβδομάδα** («→ W31» ενώ ISO = 32) | `orders_intl.js:193,195`· live dropdown· `utils.js:182` |
| OI-2 | P1 | Λειτουργία | Δεν υπάρχει ελεύθερη αναζήτηση, ενώ κάθε άλλη σελίδα-λίστα έχει | live probe: 6 inputs, όλα select/period |
| OI-3 | P1 | Consistency | Όλα τα controls αγγλικά σε σελίδα με 30 χρήσεις/μέρα | `orders_intl.js:142,143,157,180,323,712,1682` |
| OI-4 | P1 | Κατάσταση | Empty state = μία γραμμή γκρίζο κείμενο, χωρίς «καθάρισε τα φίλτρα» | `orders_intl.js:323` |
| OI-5 | P1 | Ασφάλεια δεδομένων | 7 native `confirm/alert/prompt` — τα περισσότερα κάθε module | grep |
| OI-6 | P2 | Ιεραρχία | Έξι controls φίλτρου σε μία σειρά, χωρίς ένδειξη ενεργών και χωρίς «Καθαρισμός» | live |
| OI-7 | P2 | Consistency | Τέσσερις διαφορετικές υλοποιήσεις «Print» στο app | `weekly_intl.js:1715`, `daily_ops.js:542`, `daily_ramp.js`, `orders_intl.js` |

### orders_natl — National Orders (6 / 4 — P0:1 P1:3 P2:3)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| ON-1 | **P0** | Λειτουργία | Ο πίνακας NAT_ORDERS είναι **εντελώς κενός**, ενώ NAT_LOADS=37, GL_LINES=44, CONS_LOADS=2 | live `atGetAll(NAT_ORDERS)` → 0 |
| ON-2 | P1 | Λειτουργία | Δεν υπάρχει ελεύθερη αναζήτηση | live probe: 7 inputs, όλα select |
| ON-3 | P1 | Consistency | Οι τιμές κατεύθυνσης είναι σύμβολα («↓ North→South») — ούτε αγγλικά ούτε ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ | live vs weekly_natl |
| ON-4 | P1 | Ασφάλεια δεδομένων | 5 native `confirm/alert/prompt` | grep |
| ON-5 | P2 | Κατάσταση | Το empty state δεν διακρίνει «κενό φίλτρο» από «κενή βάση» — και εδώ η βάση **είναι** κενή | ίδιο pattern με `orders_intl.js:323` |
| ON-6 | P2 | Ιεραρχία | Έξι φίλτρα, δύο σχεδόν ταυτόσημα («Trip» και «Status») | live |
| ON-7 | P2 | Ασφάλεια δεδομένων | Η ορολογία «Veroia Switch» εμφανίζεται στο UI ως τιμή φίλτρου | live |

### locations — Locations (7 / 4 — P0:1 P1:3 P2:3)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| LO-1 | **P0** | Λειτουργία | **0 από 1.157** locations έχουν συντεταγμένες — γι' αυτό το KPI «Dead Kilometers» δεν υπολογίζεται ποτέ | live «With Coordinates 0 · 0% coverage»· `core/utils.js:194+` |
| LO-2 | P1 | Λειτουργία | Το «Missing Data 120» και τα πλήθη ανά χώρα δεν οδηγούν σε φιλτραρισμένη λίστα | live· `divClicks:18` |
| LO-3 | P1 | Λειτουργία | Η ταξινόμηση κατηγοριών είναι νεκρή: «1 categories — No Type 1157» | live |
| LO-4 | P1 | Ασφάλεια δεδομένων | Η Veroia Cross-Dock (`recJucKOhC1zh4IP3`) διαγράφεται όπως κάθε άλλο location | `modules/locations.js:477-487` |
| LO-5 | P2 | Κατάσταση | «— Unknown 90» εμφανίζεται ως χώρα ανάμεσα σε πραγματικές | live |
| LO-6 | P2 | Consistency | Όλα τα labels αγγλικά | live |
| LO-7 | P2 | Accessibility | 18 `<div onclick>` — οι γραμμές χωρών, το βασικό control πλοήγησης | live probe |

---

## CLIENTS & PARTNERS · DRIVERS

### clients — Clients (8 / 6 — P0:1 P1:3 P2:4)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| CL-1 | **P0** | Λειτουργία | Το φίλτρο χώρας έχει **τρεις** τιμές για Ελλάδα (`GR`, `GREECE`, `ΕΛΛΑΔΑ`) και δύο για Ρουμανία | live dropdown |
| CL-2 | P1 | Λειτουργία | Η στήλη COUNTRY δεν συμφωνεί με τα δεδομένα («GR» + «NIEPOLOMICE POLAND», «GR» + «Vilnius-Lithuania») | screenshot γρ. 1 και 3 |
| CL-3 | P1 | Κατάσταση | «THIS MONTH €0» ενώ υπάρχουν 27 ενεργές παραγγελίες | live· `core/entity.js:400` |
| CL-4 | P1 | Accessibility | `[ENGINE]` **500 `<div onclick>`** και **1 `<button>`** σε όλη τη σελίδα· `<tr onclick>` χωρίς tabindex | live probe· `entity.js:744,746` |
| CL-5 | P2 | Κόπος χρήστη | `[ENGINE]` Placeholder αναζήτησης = σκέτο «Search...» | `entity.js:359` |
| CL-6 | P2 | Ιεραρχία | Δύο από τις 6 στήλες (CONTACT, PHONE) είναι σχεδόν πάντα «—» | screenshot |
| CL-7 | P2 | Consistency | `[ENGINE]` Όλα αγγλικά — μία διόρθωση καλύπτει **6 σελίδες** | `entity.js:346,348,359,680` |
| CL-8 | P2 | Τυπογραφία | Το «€0» σε Syne bold διαβάζεται ως σύμβολο, όχι ως ποσό | screenshot |

### partners — Partners (8 / 6 — P0:1 P1:2 P2:3)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| PA-1 | **P0** | Λειτουργία | Διπλότυπες χώρες με διαφορά πεζών-κεφαλαίων: `GREECE` **και** `Greece`, `MK` και `NORTH MACEDONIA` | live dropdown |
| PA-2 | P1 | Λειτουργία | **Η τιμή συνεργάτη δεν υπάρχει πουθενά στη σελίδα** — ούτε στήλη, ούτε φίλτρο, ούτε KPI | live στήλες· `config.js:271` |
| PA-3 | P1 | Ιεραρχία | Τρεις από τις 6 στήλες (CONTACT, PHONE, EMAIL) είναι «—» σε όλες τις ορατές γραμμές | live |
| PA-4 | P2 | Κατάσταση | «ACTIVE PARTNERS 429» από 431 — το πεδίο `Active` δεν συντηρείται | live |
| PA-5 | P2 | Ασφάλεια δεδομένων | Το πεδίο διεύθυνσης λέγεται `Adress` (ένα «d») | `config.js:200` |
| PA-6 | P2 | Consistency | Ο ίδιος οργανισμός εμφανίζεται και ως πελάτης και ως συνεργάτης, χωρίς ένδειξη σύνδεσης | live clients + partners |

### drivers — Drivers (7 / 6 — P0:1 P1:3 P2:3)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| DV-1 | **P0** | Λειτουργία | Η λήξη διπλώματος δεν έχει **καμία** οπτική προειδοποίηση, ενώ ο helper υπάρχει και δεν χρησιμοποιείται | live· `core/utils.js:170-176` |
| DV-2 | P1 | Λειτουργία | Το πεδίο TYPE είναι κενό στους περισσότερους, ενώ υπάρχει φίλτρο Internal/External | live: 5/6 ορατές γραμμές «—» |
| DV-3 | P1 | Ασφάλεια δεδομένων | Η στήλη SALARY είναι ορατή σε κάθε ρόλο με `drivers` δικαίωμα (dispatcher = view) | `config.js:329`· live |
| DV-4 | P1 | Κατάσταση | Πολλοί οδηγοί `Inactive` χωρίς εξήγηση, και εμφανίζονται πρώτοι | live: 4/6 πρώτες γραμμές |
| DV-5 | P2 | Ιεραρχία | Καμία KPI κάρτα, σε αντίθεση με Clients/Partners | live probe |
| DV-6 | P2 | Consistency | Τα ονόματα λατινικά μεταγραμμένα («Xrysoulidis Mixalis») ενώ πελάτες/συνεργάτες ελληνικά | live |
| DV-7 | P2 | Ιεραρχία | Το τηλέφωνο είναι απλό κείμενο με ασυνεπή μορφή· δεν κλικάρεται | live γρ. 1 και 3 |

### payroll — Driver Payroll (6 / 8 — P0:0 P1:2 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| PR-1 | P1 | Λειτουργία | Η εγγραφή sidebar δεν διαφέρει από τις λειτουργικές, ενώ το «Costs (soon)» δηλώνει την κατάστασή του | `router.js:27` vs `:45` |
| PR-2 | P1 | Κατάσταση | «This module is under development» — αγγλικό, χωρίς φάση, εναλλακτική ή ETA | `core/ui.js:242` |
| PR-3 | P2 | Ασφάλεια δεδομένων | Το route δεν έχει `can()` gate, σε αντίθεση με settings/trash/metrics_audit | `router.js:294` vs `:306,310,317` |
| PR-4 | P2 | Τυπογραφία | Το εικονίδιο του placeholder είναι συνδετήρας — το ίδιο για **και τα 7** coming-soon | `core/ui.js:239` |

---

## MAINTENANCE

### maint_dash — Maintenance Dashboard (6 / 4 — P0:1 P1:3 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| MD-1 | **P0** | Λειτουργία | «57 expired documents» εδώ, «45» στο Expiry Alerts, «37» στο Dashboard — και **24+18+11 = 53 ≠ 57** | live· `maintenance.js:360,1499`· `dashboard.js:352` |
| MD-2 | P1 | Λειτουργία | Οι 6 KPI κάρτες δεν κλικάρονται (**0** `<button>` σε όλη τη σελίδα) | live probe |
| MD-3 | P1 | Ιεραρχία | **2.045px** ύψος για σελίδα-σύνοψη (viewport 666) | live |
| MD-4 | P1 | Κατάσταση | «852d late» — έγγραφο ληγμένο 2,3 χρόνια, ίδια παρουσίαση με ένα 5 ημερών | live |
| MD-5 | P2 | Consistency | Αγγλικός σκελετός με ελληνική ημερομηνία | live |
| MD-6 | P2 | Λειτουργία | Timer που δεν καθαρίζεται στην έξοδο | `maintenance.js:1703` |

### maint_req — Work Orders (6 / 5 — P0:1 P1:3 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| MR-1 | **P0** | Λειτουργία | Αντιφατικοί μετρητές: «1 shown · 64 auto-detected», καρτέλες «Active 1 / All 1», **66 γραμμές** στον πίνακα | live probe· `maintenance.js:1897` |
| MR-2 | P1 | Λειτουργία | **Καμία γέφυρα προς Service Record** — 66 εντολές, 0 εγγραφές κόστους | live: `maint_svc` = 0 vs `maint_req` = 66 |
| MR-3 | P1 | Ιεραρχία | **3.913px** — η ψηλότερη σελίδα του app, για 1 πραγματική εντολή | live |
| MR-4 | P1 | Κατάσταση | Οι auto-εντολές είναι αντίγραφα του Expiry Alerts, με **διαφορετικό** αριθμό ημερών (851 vs 852) | live και των δύο σελίδων |
| MR-5 | P2 | Consistency | Όλα αγγλικά | live |
| MR-6 | P2 | Λειτουργία | 70 `<button>` σε σελίδα με 1 πραγματική εντολή | live probe |

### maint_expiry — Expiry Alerts (7 / 2 — P0:3 P1:3 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| ME-1 | **P0** | Λειτουργία | Μετρά **οχήματα** και τα ονομάζει «documents» — εξ ου η απόκλιση 37/45/57 | `maintenance.js:360,1499`· `dashboard.js:352-353`· live |
| ME-2 | **P0** | Λειτουργία | Εσωτερική αντίφαση στην ίδια οθόνη: «COMPLIANCE 30%» (=19/64) δίπλα σε «VALID **13**» | live + screenshot· `maintenance.js:352-353` |
| ME-3 | **P0** | Λειτουργία | Οι ημερομηνίες λήξης **χωρίς έτος** («05/04 121d overdue»), ενώ υπάρχουν έγγραφα 852 ημερών | screenshot· maint_dash live |
| ME-4 | P1 | Consistency | Όλη η σελίδα αγγλικά, ενώ αφορά ΚΤΕΟ/ΚΕΚ και ελληνικές ασφαλιστικές | screenshot |
| ME-5 | P1 | Λειτουργία | Καμία ενέργεια από τη λίστα — ούτε «προγραμμάτισε», ούτε «ανανεώθηκε» | screenshot |
| ME-6 | P1 | Κατάσταση | Pull-only ειδοποίηση: αν κανείς δεν ανοίξει τη σελίδα, κανείς δεν μαθαίνει | live: 45 ληγμένα, 852 ημέρες το παλαιότερο |
| ME-7 | P2 | Anti-pattern | 4 side-stripes + κενά χρωματιστά κυκλάκια χωρίς εικονίδιο μέσα | screenshot |
| ME-8 | P2 | Ιεραρχία | Η στήλη INSURER κενή στις μισές γραμμές, με ίδιο πλάτος με το ΚΤΕΟ | screenshot |

### maint_svc — Service Records (7 / 2 — P0:1 P1:1 P2:3)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| MS-1 | **P0** | Λειτουργία | **0 εγγραφές** ενώ υπάρχουν 66 εντολές εργασίας και 64 ληγμένα έγγραφα — το κόστος στόλου δεν καταγράφεται πουθενά | live `atGetAll(MAINT_HISTORY)` → 0 |
| MS-2 | P1 | Λειτουργία | Καμία είσοδος από άλλη σελίδα — ούτε Work Orders, ούτε Expiry Alerts, ούτε Trucks | live |
| MS-3 | P2 | Κατάσταση | «COST YTD €0» σε βάση χωρίς καμία εγγραφή | live |
| MS-4 | P2 | Consistency | Όλα αγγλικά, μαζί με το (άριστο) empty state | `maintenance.js:666-668` |
| MS-5 | P2 | Ιεραρχία | Τέσσερα φίλτρα σε σελίδα με μηδέν εγγραφές | live |

---

## FLEET

### trucks — Trucks (6 / 6 — P0:0 P1:3 P2:3)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| TR-1 | P1 | Λειτουργία | Πέντε από τις 10 στήλες κενές σχεδόν παντού (MODEL, YEAR, EURO, TANK LT, GVW KG) | live |
| TR-2 | P1 | Λειτουργία | Ασυνεπείς πινακίδες με **ελληνικά/λατινικά ομόγλυφα** (`ΙΑΖ` vs `IAZ`, κενά) | live γρ. 1-5 |
| TR-3 | P1 | Consistency | Ο ίδιος στόλος: **36** εδώ, **27 trucks** στο Maintenance Dashboard, «0/27» στο Dashboard | live τριών σελίδων |
| TR-4 | P2 | Ιεραρχία | Η στήλη DOCS δείχνει σταθερά «KT KK INS» χωρίς χρώμα κατάστασης | live |
| TR-5 | P2 | Ιεραρχία | Καμία KPI κάρτα, ενώ Clients/Partners/Workshops έχουν | live probe |
| TR-6 | P2 | Accessibility | `[ENGINE]` 36 `<div onclick>`, 1 `<button>` | live probe |

### trailers — Trailers (5 / 5 — P0:1 P1:2 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| TL-1 | **P0** | Λειτουργία | `TEMP °C` και `PAL` **κενά σε όλες** τις ρυμούλκες — η ανάθεση cold-chain γίνεται χωρίς κανένα δεδομένο στην οθόνη | live: `P68471 — — — — — — —` ×6 |
| TL-2 | P1 | Λειτουργία | Το φίλτρο «Type: All» δεν έχει καμία άλλη τιμή — φίλτρο-φάντασμα | live |
| TL-3 | P1 | Λειτουργία | `P68471` (λατινικό) δίπλα σε `Ρ40069` (ελληνικό) — **οπτικά ταυτόσημα** | live γρ. 1-4 |
| TL-4 | P2 | Ιεραρχία | Η στήλη DOCS (`KT FRC INS`) χωρίς χρώμα κατάστασης | live |
| TL-5 | P2 | Ιεραρχία | Καμία KPI κάρτα· 8 κενές στήλες σε όλο το πλάτος | live probe |

### workshops — Workshops (6 / 2 — P0:1 P1:1 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| WS-1 | **P0** | Λειτουργία | **0 συνεργεία**, ενώ υπάρχουν 66 εντολές εργασίας με στήλη WORKSHOP | live `atGetAll(WORKSHOPS)` → 0 |
| WS-2 | P1 | Κατάσταση | Το empty state λέει «Try adjusting filters» ενώ **δεν υπάρχει ενεργό φίλτρο** | live· `entity.js:680-684` |
| WS-3 | P2 | Ιεραρχία | Τέσσερα KPI με €0/0 πάνω από κενό πίνακα | live |
| WS-4 | P2 | Consistency | `[ENGINE]` Όλα αγγλικά | `entity.js:346-348` |

### maint_trucks — Trucks History (7 / 7 — P0:1 P1:2 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| MT-1 | **P0** | Λειτουργία | Κενό ιστορικό για όλα τα οχήματα (MAINT_HISTORY = 0) | live |
| MT-2 | P1 | Ιεραρχία | Ολόκληρη σελίδα για ένα dropdown· δύο εγγραφές sidebar για την ίδια οντότητα | live: 987px, 3 buttons, 1 select |
| MT-3 | P1 | Λειτουργία | Καμία σύνοψη ανά όχημα — ούτε σύνολο κόστους, ούτε €/km | live |
| MT-4 | P2 | Κατάσταση | Το πρώτο όχημα προεπιλέγεται σιωπηλά (CB0138HO) | live τίτλος |
| MT-5 | P2 | Consistency | Αγγλικά | live |

### maint_trailers — Trailers History (6 / 7 — P0:1 P1:2 P2:1)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| ML-1 | **P0** | Λειτουργία | Κενό ιστορικό (MAINT_HISTORY = 0) | live |
| ML-2 | P1 | Λειτουργία | Το dropdown δείχνει «CB2998EE —», «P11983 —» — πινακίδα και **κενή μάρκα** για 37 ρυμούλκες | live |
| ML-3 | P1 | Λειτουργία | Καμία διάκριση τύπου βλάβης — «βλάβη ψυκτικού» δεν ξεχωρίζει από «ελαστικά» | live |
| ML-4 | P2 | Ιεραρχία/Consistency/Κατάσταση | Ίδια με MT-2, MT-4, MT-5 | live |

---

## FINANCE

### invoicing — Invoicing (5 / 4 — P0:2 P1:4 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| IN-1 | **P0** | Λειτουργία | Ready 36 + Overdue 97 + Blocked 61 = **194** σε σύνολο «All» = **97**· και «Overdue» = ίσο με το σύνολο | live καρτέλες + κάρτες |
| IN-2 | **P0** | Λειτουργία | Η στήλη ORDER NO δείχνει **record id** (`Ta1Azv`), όχι αριθμό παραστατικού | live γρ. 1 |
| IN-3 | P1 | Ασφάλεια δεδομένων | Client-side αρίθμηση τιμολογίων — δύο ταυτόχρονοι χρήστες παίρνουν τον ίδιο αριθμό | `invoicing.js:118-130` |
| IN-4 | P1 | Ιεραρχία | Πέντε ισοβαρείς κάρτες, με το «ΑΝΟΙΧΤΑ 175.642 €» να είναι δραματικά σημαντικότερο | live· screenshot |
| IN-5 | P1 | Consistency | Ανάμεικτη γλώσσα **μέσα στην ίδια φράση**: «OVERDUE (>30**Μ**)», «BLOCKED (PE) — Awaiting pallet sheets» δίπλα σε «PDF για Λογιστή» | live |
| IN-6 | P1 | Κατάσταση | «INVOICED 0 · 0,00 €» ενώ υπάρχουν 97 παραγγελίες και 175.642 € ανοιχτά | live |
| IN-7 | P2 | Ιεραρχία | 2.375px για 36 γραμμές, χωρίς sticky header | live |
| IN-8 | P2 | Λειτουργία | Καμία μαζική ενέργεια — 36 έτοιμες, κανένα checkbox | live probe |

### pallet_ledger — Pallet Ledger (6 / 5 — P0:1 P1:2 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| PL-1 | **P0** | Λειτουργία | Και οι δύο πίνακες κενοί (0/0), ενώ το `ORDER_STOPS` έχει **514** εγγραφές με `Pallets Loaded`/`Exchanged` | live· `config.js:262-263` |
| PL-2 | P1 | Κατάσταση | Τέσσερις κάρτες «0 pal / No debtors» — δεν διακρίνεται «ισοσκελισμένο» από «άγραφο» | live |
| PL-3 | P1 | Ασφάλεια δεδομένων | Διορθώσεις χωρίς μόνιμο ίχνος (επεξεργασία αντί για αντιλογισμό) | ανοιχτό pre-mortem 11/7 |
| PL-4 | P2 | Consistency | Ανάμεικτη γλώσσα | live |
| PL-5 | P2 | Ιεραρχία | Δύο καρτέλες με ίδια δομή αλλά δύο διαφορετικούς πίνακες βάσης· καμία ενιαία εικόνα | `config.js:69-71` |

### costs / costs_dash / fuel / pl — Costs (3 / 3 — P0:0 P1:3 P2:1)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| CO-1 | P1 | Λειτουργία | Τρία «φαντάσματα» routes (`costs_dash`, `fuel`, `pl`) υπάρχουν στον router και πουθενά στο UI | `router.js:296-299` vs `NAV:42-46` |
| CO-2 | P1 | Λειτουργία | **Ο πίνακας `TRIP_COSTS` δεν υπάρχει στο backend** (404) — όπως και `TRIPS`, `METRICS_SNAPSHOTS` | live `atGetAll` → 404 |
| CO-3 | P1 | Κατάσταση | Το ίδιο άχρηστο αγγλικό placeholder, χωρίς φάση ή εναλλακτική | `core/ui.js:242` |
| CO-4 | P2 | Consistency | Η σήμανση «(soon)» είναι μέσα στο label, ενώ οι άλλες 6 μη υλοποιημένες δεν έχουν καμία | `router.js:45` vs `:27` |

---

## INSIGHTS

### ceo_dashboard — CEO Dashboard (5 / 4 — P0:2 P1:3 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| CE-1 | **P0** | Κατάσταση | Η σελίδα **κολλάει στο «Φόρτωση...»** και οι 3 brand promises μένουν κενές· κανένα timeout | live probe |
| CE-2 | **P0** | Λειτουργία | Ο timer συνεχίζει μετά την έξοδο και γράφει σε DOM που δεν υπάρχει — **καταγράφεται ζωντανά** στο Error Log ενώ ο χρήστης ήταν σε άλλη σελίδα | live Error Log: `Cannot set properties of null` · context «CEO Dashboard loadAll» · page «performance» |
| CE-3 | P1 | Ασφάλεια δεδομένων | «Owner only» μόνο στο UI· ο ρόλος από `localStorage` | `config.js:328-331` |
| CE-4 | P1 | Ιεραρχία | Ο τίτλος είναι η μεθοδολογία («SCALING UP · PEOPLE · STRATEGY…»), όχι η κατάσταση | live· screenshot |
| CE-5 | P1 | Consistency | Ανάμεικτη γλώσσα στην ίδια γραμμή: «Speed Score — Faster to Shelf — Στόχος: ≥98%» | live |
| CE-6 | P2 | Ιεραρχία | 1.694px για εβδομαδιαία σύνοψη | live |
| CE-7 | P2 | Κατάσταση | Χειροκίνητη καταχώρηση χωρίς ένδειξη τελευταίας τιμής | live |

### performance — My Performance (6 / 3 — P0:3 P1:2 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| PF-1 | **P0** | Λειτουργία | «Εβδομάδα 31 (τρέχουσα)» ενώ ISO = 32 — η **πραγματική** τρέχουσα εβδομάδα δεν είναι καν επιλέξιμη | live· `performance.js:138,161,416,442` |
| PF-2 | **P0** | Λειτουργία | «WEEKLY SCORE **45**/100» στο KPI, «W31 **33**/100» στο γράφημα, 300px πιο κάτω | live |
| PF-3 | **P0** | Λειτουργία | «ON-TIME DELIVERY 15%» εδώ, «N/A · κανένα δεδομένο» στο Dashboard, την ίδια μέρα | live και των δύο σελίδων |
| PF-4 | P1 | Κατάσταση | Το γράφημα τάσης δείχνει τέσσερις πανομοιότυπες τιμές (33,33,33,33) | live |
| PF-5 | P1 | Ασφάλεια δεδομένων | Επίδοση με οικονομικές διαστάσεις ορατή σε κάθε ρόλο | `config.js:328-331` |
| PF-6 | P2 | Ιεραρχία | Τέσσερα KPI, τρία στο 0/N/A, όλα «απέτυχες τον στόχο» | live |
| PF-7 | P2 | Consistency | Ανάμεικτη γλώσσα | live |

---

## ADMIN

### admin — Settings · Trash · Error Log (6 / 5 — P0:2 P1:2 P2:3)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| AD-1 | **P0** | Λειτουργία | Το Error Log δηλώνει «**Sentry ON**» ενώ το DSN είναι **κενό** — η οθόνη λέει ψέματα για το ίδιο το σύστημα παρακολούθησης | live probe: `TMS_SENTRY_DSN` = (empty), `window.Sentry` = true· `config.js:36` |
| AD-2 | **P0** | Λειτουργία | Το Trash είναι per-browser: «last 50 kept in **browser storage**» — διαγραφές άλλων χρηστών δεν εμφανίζονται ποτέ | live |
| AD-3 | P1 | Ασφάλεια δεδομένων | Το Error Log **δεν έχει `can()` gate**, σε αντίθεση με Settings/Trash/Metrics Audit | `router.js:313-315` vs `:306,310,317` |
| AD-4 | P1 | Κατάσταση | Το ίδιο το Error Log αποδεικνύει ενεργό bug (CE-2) — και κανείς δεν το βλέπει, λόγω AD-1 | live, 2 WARN «just now» |
| AD-5 | P2 | Λειτουργία | Το «Clear» σβήνει το log δίπλα-δίπλα με τα JSON/CSV, χωρίς εξαγωγή-πρώτα | live |
| AD-6 | P2 | Consistency | Και τα τρία αγγλικά | live |
| AD-7 | P2 | Ιεραρχία | 5 από τις 32 σελίδες είναι admin εργαλεία | `router.js:51-59` |

### metrics_audit — Metrics Audit (6 / 6 — P0:1 P1:2 P2:3)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| MA-1 | **P0** | Λειτουργία | **Δεν πιάνει τις πραγματικές ασυμφωνίες** — και οι 4 που βρέθηκαν υπολογίζονται εκτός `metrics.js` | live τίτλος «All from canonical metrics.js»· `maintenance.js:352-360`, `invoicing.js`, `performance.js` |
| MA-2 | P1 | Λειτουργία | Η σύγκριση είναι χειροκίνητη — το λέει το ίδιο το info box («Άνοιξε σε 1 tab… σύγκρινε») | live |
| MA-3 | P1 | Λειτουργία | **Async render race**: το περιεχόμενο του Metrics Audit εμφανίστηκε κάτω από τον τίτλο «Admin / Audit Trail» | live probe διαδοχικής πλοήγησης |
| MA-4 | P2 | Ασφάλεια δεδομένων | Gate σε `can('settings')` που έχουν owner **και** management | `router.js:316-318`· `config.js:330` |
| MA-5 | P2 | Consistency | Emoji ως κεφαλίδες (🎯💡🔄) — τρίτο εικονογραφικό σύστημα | live |
| MA-6 | P2 | Ιεραρχία | 2.627px για 38 γραμμές, χωρίς φίλτρο ή αναζήτηση | live |

### audit_trail — Audit Trail (7 / 5 — P0:2 P1:3 P2:2)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| AT-1 | **P0** | Λειτουργία | **Το ίχνος σταματά στις 28/7/2026** — καμία εγγραφή σε 8 μέρες, με 6 ενεργούς χρήστες | live: «170 entries, newest first», πρώτη γραμμή 28/7 |
| AT-2 | **P0** | Ασφάλεια δεδομένων | Καταγράφει `delete` σε `groupage_lines` — παραβίαση του κανόνα «GL ΠΟΤΕ δεν διαγράφονται» | live πολλαπλές γραμμές· `CLAUDE.md` §GL |
| AT-3 | P1 | Λειτουργία | Καμία αναζήτηση· κανένα φίλτρο ανά πίνακα/χρήστη/ημερομηνία | live probe |
| AT-4 | P1 | Λειτουργία | Η στήλη CHANGE δεν δείχνει τι άλλαξε — μόνο «Record deleted» | live |
| AT-5 | P1 | Κατάσταση | Οι διαγραφές έγιναν από `demo_owner` — δοκιμαστικός λογαριασμός σε παραγωγή | live |
| AT-6 | P2 | Consistency | Αγγλικά, με ελληνική μορφή ώρας | live |
| AT-7 | P2 | Ιεραρχία | Γυμνά record ids χωρίς σύνδεσμο | live |

---

## ΕΚΤΟΣ ΜΕΝΟΥ

### pallet_upload — Pallet Upload (2 / 2 — P0:2 P1:1 P2:1)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| PP-1 | **P0** | Λειτουργία | **620 γραμμές υλοποιημένου κώδικα απρόσιτες**: καμία εγγραφή NAV, κανένα `case` στον router — ενώ 61 παραγγελίες είναι μπλοκαρισμένες «awaiting pallet sheets» | live: `renderPalletUpload`=function, `NAV` χωρίς `pallet_upload` |
| PP-2 | **P0** | Κατάσταση | Το placeholder δείχνει **τον κωδικό του route** ως τίτλο («pallet_upload») — ισχύει για κάθε άγνωστο route | live `topbarTitle`· `router.js:232,327` |
| PP-3 | P1 | Λειτουργία | Η μόνη εναλλακτική είναι το `petras-assign/pallet_upload_v2.html`, δηλαδή το repo που σήμερα δίνει 401 | `docs/README.md`· PU-1 |
| PP-4 | P2 | Κόπος χρήστη | Κόπωση επιβεβαιωτή: AI εξαγωγή χωρίς ένδειξη βεβαιότητας | ανοιχτό pre-mortem 11/7 |

### login — index.html (7 / 6 — P0:2 P1:3 P2:3)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| LG-1 | **P0** | Λειτουργία | Το μήνυμα σφάλματος **σβήνει μόνο του σε 3″** — ο χρήστης δεν μαθαίνει ποτέ γιατί απέτυχε | `index.html:372` |
| LG-2 | **P0** | Λειτουργία | **Τρία ανεξάρτητα αντίγραφα** καταλόγου χρηστών + `USE_PROXY`/`PROXY_URL` σε χειροκίνητο συγχρονισμό — έχει ήδη σπάσει μία φορά | `config.js:11-14, 299-307` |
| LG-3 | P1 | Λειτουργία | Καμία ένδειξη φόρτωσης· το κουμπί δεν κλειδώνει κατά το `await fetch` | `index.html:387-427` |
| LG-4 | P1 | Consistency | Η μοναδική εξ ολοκλήρου αγγλική οθόνη του app | live· `index.html:370,426` |
| LG-5 | P1 | Λειτουργία | Το Enter από **οπουδήποτε** στη σελίδα στέλνει αίτημα σύνδεσης | `index.html:465` |
| LG-6 | P2 | Ιεραρχία | 78% της οθόνης είναι εικόνα και slogan· καμία πληροφορία κατάστασης | screenshot |
| LG-7 | P2 | Accessibility | Καμία `<form>`, κανένα `<label>`· το κουμπί είναι `onclick`, όχι submit | `index.html:304` |
| LG-8 | P2 | Ασφάλεια δεδομένων | Κατάλογος χρηστών (usernames + ρόλοι + hashes) στο public HTML | `index.html:346+` |

### print — print.html (7 / 6 — P0:0 P1:3 P2:3)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| PN-1 | P1 | Κατάσταση | «Missing orderId» ως **σκέτο άστυλο κείμενο**, χωρίς λογότυπο και χωρίς επιστροφή | live: `body.innerText === "Missing orderId"` |
| PN-2 | P1 | Consistency | **Τέταρτη** ανεξάρτητη υλοποίηση εκτύπωσης | `weekly_intl.js:1715`, `daily_ops.js:542`, `daily_ramp.js:843-854`, `print.html` |
| PN-3 | P1 | Χρώμα/Tokens | Κανένα token· και το **ποσό** τυπώνεται σε `#8B95A1` = **3.04:1** σε λευκό | `print.html:9,11,22,47,62,82` |
| PN-4 | P2 | Λειτουργία | Καμία ομαδική εκτύπωση — ένα `window.open` ανά έγγραφο | call sites |
| PN-5 | P2 | Λειτουργία | Εξαρτάται από `window.open` (Safari iOS μερικώς) | `KNOWN_ISSUES.md` M4 |
| PN-6 | P2 | Consistency | Αγγλικός τίτλος σελίδας, που τυπώνεται στην κεφαλίδα κάθε φύλλου | `print.html:5` |

### shell — Global Shell (6 / 5 — P0:2 P1:5 P2:5)

| # | Σοβ | Κατηγορία | Παρατήρηση | Απόδειξη |
|---|:--:|---|---|---|
| SH-1 | **P0** | Λειτουργία | **Το sidebar δεν κυλά ανεξάρτητα**: `overflow-y:hidden`, ύψος **1.750px** ορίζει όλο το document ενώ το περιεχόμενο είναι 780px | live probe: `sidebarOverflowY:"hidden"`, `sidebarH:1750`, `docH:1750`, `contentH:1335`, `vh:666` |
| SH-2 | **P0** | Λειτουργία | **Async render race**: περιεχόμενο μιας σελίδας κάτω από τον τίτλο άλλης | live probe· `router.js:244-328` |
| SH-3 | P1 | Accessibility | **60 από 66** διαδραστικά στοιχεία κάτω από 44px (`.nav-item` 211×34) | live μέτρηση |
| SH-4 | P1 | Accessibility | Το AI-chat FAB δεν έχει `aria-label`, `title`, ούτε κείμενο | live probe |
| SH-5 | P1 | Layout | FAB και toast διεκδικούν την ίδια γωνία (`bottom:24px; right:24px`) | `ai-chat.js:203` vs `ui.js:252`· screenshots |
| SH-6 | P1 | Consistency | Ο breadcrumb αντικαθίσταται από 3 σελίδες με δικό τους τίτλο | `router.js:237-242, 258` |
| SH-7 | P1 | Accessibility | `role="option"` χωρίς γονέα `role="listbox"` στην ⌘K παλέτα | `command-palette.js:82,91`· live `listRole:null` |
| SH-8 | P2 | Ιεραρχία | Δέκα ομάδες όλες ανοιχτές — ο κώδικας λέει «rest collapsed» και επιστρέφει `false` | `router.js:70-75` |
| SH-9 | P2 | Consistency | Δύο σελίδες με τίτλο «Dashboard» στο ίδιο μενού | `router.js:7, 30` |
| SH-10 | P2 | Κατάσταση | Το Undo είναι μόνιμα ανενεργό σε προνομιακή θέση· οι σελίδες με πραγματική ανάγκη undo δεν το έχουν | live probe topbar |
| SH-11 | P2 | Κατάσταση | Το skeleton φόρτωσης είναι σκούρο σε λευκό — επηρεάζει κάθε σελίδα | `core/ui.js:191,196` |
| SH-12 | P2 | Consistency | Τα 3 κοινά μηνύματα του κελύφους αγγλικά (`showAccessDenied/showComingSoon/showError`) | `core/ui.js:210,231-232,242` |

---

## Πέντε συστημικά μοτίβα πίσω από τα 230

1. **Ένα νούμερο, πολλοί υπολογισμοί.** Εβδομάδα (31 vs 32), ληγμένα έγγραφα
   (37/45/57), συμμόρφωση (19 vs 13), τιμολόγηση (194 vs 97), σκορ (45 vs 33),
   στόλος (36 vs 27). Έξι έννοιες, δεκαπέντε τιμές.
2. **Το «0» και το «δεν ξέρουμε» δείχνουν ίδια.** Σε 9 σελίδες. Το χειρότερο:
   fail-open — αν πέσει ένα fetch, η οθόνη λέει «όλα καθαρά».
3. **Λειτουργίες που υπάρχουν και δεν φτάνουν στον χρήστη.** Pallet Upload
   (620 γρ.), οι εικονογραφήσεις `showEmpty` (6 έτοιμες, 2 σε χρήση), ο helper
   λήξης του `utils.js:170`, το `confirmAction()`, το `atSafePatch`.
4. **Πίνακες που είναι κενοί επειδή κανένα σημείο εισόδου δεν τους γεμίζει.**
   MAINT_HISTORY, WORKSHOPS, PALLET_LEDGER ×2, NAT_ORDERS, FUEL.
5. **Ελληνικά δεδομένα σε αγγλικό σκελετό.** 9 σελίδες, με χειρότερη
   περίπτωση την ανάμειξη μέσα στην ίδια φράση («OVERDUE (>30Μ)»).
