# Η Τιμολόγηση ως όψη μέσα στις Παραγγελίες — ανάλυση κοινού κώδικα · 22/9/2026

Εντολή owner (22/9): μία βάση λίστας, δύο όψεις ανά ρόλο (dispatcher: κατάλογος ανά ημερομηνία ·
λογιστής: παραδομένες ανά πελάτη + ηλικία/δελτία/ΤΠΥ + πάνελ ERP). Σκοπός: μία πηγή, ένας
κώδικας — το χθεσινό δεύτερο checkbox ήταν σύμπτωμα δύο οθονών. **Καμία αλλαγή κώδικα σε αυτό
το βήμα.** Σύγκριση: 1 subagent Sonnet (read-only)· σύνθεση/πρόταση: Claude Fable 5.1.

## 1. Τι υπάρχει και στα δύο / μόνο στο ένα / διαφορετική υλοποίηση του ίδιου

Μεγέθη: `orders_intl.js` 3.453 γρ. (47 συναρτήσεις, IIFE) · `orders_natl.js` 2.631 (47, IIFE) ·
`invoicing.js` 1.210 (51, **χωρίς** IIFE — top-level globals).

| Έννοια | orders_intl | orders_natl | invoicing | Κρίση |
|---|---|---|---|---|
| Φόρτωση | `atGet(ORDERS, IS_AFTER(Loading, cutoff 60/180/all), false)` :344 + ORDER_STOPS σε δέσμες 90 :391 + LOCATIONS :409 | `atGet(NAT_ORDERS, ίδιο cutoff)` :44 + NAT_LOADS :72 | `atGet(ORDERS, Status Delivered/Invoiced)` :297 **χωρίς παράθυρο** + NAT_ORDERS :304 + `/pallets/gate` :248 + `/pallets/balances` :269 | **Ίδια πηγή (ORDERS), διαφορετικό ερώτημα.** Το παράθυρο 60/180 είναι διπλογραμμένο στα δύο orders, απόν στο τρίτο (σωστά: η λίστα τιμολόγησης είναι διαχρονική) |
| State | `INTL_ORDERS{data,filtered,selectedId}` :7 | `NATL_ORDERS{…}` :7 | `INV{data,filtered,selectedId,sort,gate,balances}` :9, `_type` intl/natl :314 | Ίδιο σχήμα, τρία αντικείμενα· μόνο το invoicing ενώνει δύο πηγές |
| Όνομα πελάτη | `_clientName→fhClientName` :24 | inline `_fhClientsMap[id]` :463 | `_invClientName→getClientName` :50 | **3 δρόμοι** για το ίδιο |
| Διαδρομή | `_stopsLocationSummary` :34 (από ORDER_STOPS) | inline per-leg :670 | `_invRoute→orderRoute` (core/data-helpers.js:160) :68 | **αποκλίνει** — ο κοινός helper υπάρχει, τον χρησιμοποιεί μόνο το invoicing |
| Παλέτες / τιμή / εβδομάδα | `_stopsTotalPallets` :47 · `f['Price']` raw :553 · `_weekNum` **νεκρή** :53 | `f['Pallets']` :465 · raw | `_invPallets` :89 · `_invPrice` null-safe :102 · `_invWeek`+ISO :110 | αποκλίνει· μόνο το invoicing χειρίζεται NULL ≠ 0 |
| Κατάσταση τιμολόγησης (έτοιμη/μπλοκαρισμένη/τιμολογημένη/ηλικία) | — | — | `_invIsDelivered/Invoiced/Ready/Blocked/Overdue` :155-231 | **μοναδικό** |
| Πύλη παλετών + υπόλοιπα | — | — | `_invLoadGate/_invPESheetsOK/_invLoadBalances` :133-278 | μοναδικό |
| Λίστα | `_intlColDefs` 14 στήλες :540 + virtual scroll `_oiVS` :627 | `_natlColDefs` 9 :344 + `_onVS` :495 | `_renderInvHead` 9 :548, **χωρίς** virtual scroll | ίδιο πρότυπο στα δύο orders, άλλο στο invoicing |
| Καρτέλες/KPI | — | — | `_renderInvTabs` :421 · `_renderInvKPI` :486 | μοναδικό |
| Φίλτρα/αναζήτηση | `_intlFilters` (q, Direction, Status, Brand, week) :667 | `_natlFilters` :624 | `_invFilters` (tab, type, weekFrom/To, client) :14 | διαφορετικά πεδία |
| CSV / εκτύπωση | `_intlExportCSV` :2915 · `_intlPrint` :2934 | :2491 · :2512 | `_invExportCSV` :958 · `_invExportPDF` :999 (109 γρ.) | τρεις υλοποιήσεις |
| Καρτέλα/πάνελ | `_oiCardHtml` :827 (148 γρ., read-only kv Τιμολογήθηκε) | inline στο `selectNatlOrder` :651 | `_renderInvDetail` :705 (113 γρ.) + φόρμα ΤΠΥ | αποκλίνει |
| Εγγραφές | δεκάδες `atPatch/atCreate/atDelete` (create/edit/cancel/delete/stops) | ίδιο + GL_LINES/CONS_LOADS/NAT_LOADS | **ένα** `atPatch {Invoiced, Invoice Number, Invoice Date}` :829 | αποκλίνει έντονα |
| Πύλη εγγραφής | `can('orders')==='full'` :438 | ίδιο :270 | `can('orders')==='full' \|\| can('costs')==='full'` :715 | αποκλίνει — ο accountant γράφει μόνο εδώ |
| Router | `renderOrdersIntl` :363, perm orders | :364 | `renderInvoicing` :370, perm orders (κληρονομημένο, ενότητα Οικονομικά)· **κανείς άλλος δεν καλεί** `navigate('invoicing')` | ίδιο κλειδί |
| Εξωτερικοί καλούντες | `openIntlCreate/openIntlEditWith` από weekly_intl :833/:1687/:2505 | `openNatlCreate/Edit/CreateWith` από weekly_natl :338/:1394/:1845 | κανένας | S4/Ημερήσιο δεν καλούν καμία από τις τρεις |
| Rigs | contract 13 πεδία/14 actions (units.js:53) | contract 10/13 | **εξαιρημένο** από units (units.js:9 «structurally broken»)· `invoicing-proof.js` 47 assertions με mocks | αποκλίνει |
| Globals | IIFE, μόνο ρητά `window.*` | IIFE | ~51 συναρτήσεις + `INV/_invFilters` global· **καμία σύγκρουση ονομάτων** με τα orders | — |

**Συμπέρασμα δεδομένων:** τα δύο orders modules είναι σχεδόν 1:1 *μεταξύ τους* (ίδιο πρότυπο,
ξαναγραμμένο). Το invoicing.js δεν μοιράζεται μαζί τους ούτε state, ούτε renderer, ούτε write
model — μόνο τον **ίδιο πίνακα ORDERS**. Άρα «μία πηγή» ισχύει ήδη στα δεδομένα· «ένας κώδικας»
δεν ισχύει, και το δεύτερο checkbox ήταν πράγματι το σύμπτωμα (δύο διαδρομές εγγραφής στο
ίδιο πεδίο — έφυγε χθες).

## 2. Τι θα κόστιζε

### Α — «όψη μέσα στις Παραγγελίες»
Νέα καρτέλα-όψη «Προς τιμολόγηση» στη σελίδα Παραγγελιών, που δείχνει το Figma v2 (694:1011): παραδομένες
ανά πελάτη + ηλικία/δελτία/ΤΠΥ + πάνελ ERP/φόρμα ΤΠΥ. Η Τιμολόγηση παύει να είναι δεύτερη σελίδα·
το μενού «Τιμολόγηση» για την Ειρήνη ανοίγει την όψη.

| Τι | Έρχεται | Φεύγει | Σημείωση |
|---|---|---|---|
| Router: `invoicing` → alias `orders_intl` με `view=invoicing`· μενού ίδιο | ~15 γρ. router | 1 case | Αναστρέψιμο: το alias απλώς δείχνει αλλού |
| Εναλλαγή όψεων στην κεφαλίδα Παραγγελιών (Κατάλογος \| Προς τιμολόγηση), ορατή σε όλους (orders:view) | ~40 γρ. στο orders_intl | — | Η όψη «Προς τιμολόγηση» έχει **δικό της φορτωτή** (χωρίς παράθυρο 60 ημ., χωρίς ORDER_STOPS ανά 90, με gate) — δεν ξαναχρησιμοποιεί τον φορτωτή του καταλόγου, γιατί απαντά σε άλλη ερώτηση |
| Ο renderer της όψης = το σημερινό invoicing.js, **τυλιγμένο σε IIFE και μετονομασμένο** `modules/orders_invoicing.js`, που παίρνει container από τις Παραγγελίες | ~30 γρ. προσαρμογής (mount σε container, χωρίς δικό του page-title/breadcrumb) | KPI-κουτιά (~60), δικές του καρτέλες (~55), «Υπόλοιπα ανά πελάτη» modal (43) και client-history (74) αν ο owner τα θεωρεί περιττά | Το αρχείο μένει ξεχωριστό **ως όψη**, όχι ως σελίδα — διαχωρισμός αρχείου ≠ δεύτερη πηγή |
| Καρτέλα παραγγελίας: **μία** — η `_oiCardHtml` (read-only kv Τιμολογήθηκε) αποκτά μπλοκ «Στοιχεία για το ERP» + φόρμα ΤΠΥ όταν `can('costs')==='full'` και η όψη είναι η τιμολόγηση | ~60 γρ. στο orders_intl | `_renderInvDetail` 113 γρ. | Εδώ κερδίζεται ο «ένας κώδικας»: μία καρτέλα, ένα write (`_invWriteInvoice` γίνεται κοινό helper) |
| Ομαδοποίηση ανά πελάτη + στήλες Figma v2 | ~150 γρ. νέου renderer (αντικαθιστά `_renderInvTable`/`_renderInvHead` ~120) | — | Το «Φύλλο ERP» CSV αντικαθιστά το `_invExportCSV` (ίδιο μέγεθος) |
| Helpers σε core: `_invClientName/_invRoute/_invPrice` → `core/data-helpers.js` (ήδη εκεί `getClientName`, `orderRoute`) | ~10 γρ. | ~30 από invoicing | Οι δύο orders λίστες μπορούν να τα υιοθετήσουν αργότερα, χωρίς υποχρέωση |
| Εθνικές | — | — | Η όψη «Προς τιμολόγηση» δείχνει ήδη διεθνείς + εθνικές (INV.data). Ζει **μόνο** στη σελίδα Διεθνών (Παραγγελίες → Προς τιμολόγηση), ώστε να μην υπάρξει τρίτο σημείο· η σελίδα Εθνικών μένει ως έχει |
| Rigs | `invoicing-proof.js` → ανοίγει `orders_intl` + κλικ στην όψη (~20 γρ. αλλαγή), ίδια assertions· contract orders_intl (13 πεδία) ανέπαφο αν η προεπιλογή μένει «Κατάλογος» | — | Το `units.js:9` «invoicing structurally broken» παύει να ισχύει ως ξεχωριστή μονάδα |
| Worker | προαιρετικό: για ρόλο accountant + πίνακας orders, `buildWriteRow` (index.js:2322) δέχεται **μόνο** invoiced/invoice_number/invoice_date, τα άλλα 422 | ~12 γρ. | Κλείνει το γνωστό «PATCH σε κάθε πεδίο» (owner 3/9) χωρίς πέμπτο πίνακα δικαιωμάτων |

**Σύνολο Α:** ~+300 / −350 γραμμές, 4 βήματα, καθένα αναστρέψιμο, η σημερινή φόρμα ΤΠΥ δουλεύει σε
κάθε βήμα. **Τι σπάει αν γίνει λάθος:** (α) η όψη φορτώνει ORDER_STOPS ανά 90 για 180 παραδομένες
(αν ξαναχρησιμοποιηθεί ο φορτωτής του καταλόγου) — αποφεύγεται με δικό της φορτωτή· (β) το
`orders_intl.js` (3.453 γρ.) γίνεται 3.700 — γι' αυτό η όψη μένει σε δικό της αρχείο· (γ) ο
dispatcher βλέπει την εναλλαγή όψεων — ανώδυνο (orders:view αρκεί για ανάγνωση, η φόρμα ΤΠΥ
θέλει costs:full).

### Β — κοινό core module (`core/orders-list.js`) που τρέφει και τις τρεις
Ένας φορτωτής + ένα row model + ένας renderer με παραμέτρους (στήλες, ομαδοποίηση, όψη) για
Διεθνείς, Εθνικές και Τιμολόγηση.

| Τι | Κόστος |
|---|---|
| Ενοποίηση `_intlColDefs`/`_natlColDefs`/invoicing head, virtual scroll ×2, period ×2, sort ×3, CSV ×3, print ×2, καρτέλες ×3, φίλτρα ×3 | ~1.500 γρ. ξαναγράφονται· 6.000+ γρ. αγγίζονται |
| Τι σπάει | **κάθε ροή dispatcher**: `openIntlCreate/openIntlEditWith` (weekly_intl :833/:1687/:2505), `openNatlCreate/Edit/CreateWith` (weekly_natl :338/:1394/:1845), οι φόρμες, τα stops, ο καταρράκτης διαγραφής εθνικών (GL_LINES/CONS_LOADS/NAT_LOADS)· 2 contracts (13+10 πεδία) |
| Χρόνος | 2–3 εβδομάδες με έλεγχο ανά οθόνη — **μετά** το go-live της Ειρήνης, όχι πριν |
| Όφελος | πραγματικός «ένας κώδικας» για τις λίστες· αλλά η τιμολόγηση παραμένει διαφορετική ερώτηση (διαχρονική, ανά πελάτη, με gate) — θα ήταν παράμετρος, όχι κοινή λογική |

## 3. Πρόταση: **Α**, σε 4 αναστρέψιμα βήματα

1. **Alias + εναλλαγή όψεων** (1 commit, ~55 γρ., 0 αλλαγή συμπεριφοράς): `#invoicing` → Παραγγελίες
   με όψη «Προς τιμολόγηση»· η όψη δείχνει το σημερινό invoicing.js μέσα στο container των
   Παραγγελιών· μενού «Τιμολόγηση» μένει για την Ειρήνη. Rig: invoicing-proof μέσω orders_intl.
2. **Μία καρτέλα** (1 commit): η `_oiCardHtml` παίρνει μπλοκ ERP + φόρμα ΤΠΥ (costs:full)·
   `_renderInvDetail` φεύγει· `_invWriteInvoice` γίνεται κοινό helper· Worker allowlist πεδίων για
   accountant (προαιρετικό, deploy owner).
3. **Όψη λογιστή = Figma v2** (1 commit, μετά Figma 3 γύρων στο πλαίσιο των Παραγγελιών): ομαδοποίηση
   ανά πελάτη, στήλες, λεπτή γραμμή συνόλων, «Φύλλο ERP»· φεύγουν KPI-κουτιά/καρτέλες/modals.
4. **Καθαρισμός**: `invoicing.js` → `orders_invoicing.js` σε IIFE, `units.js:9` ενημερώνεται, helpers σε core.

Γιατί Α (5 γραμμές): (1) Η «μία πηγή» υπάρχει ήδη — και οι τρεις διαβάζουν ORDERS/NAT_ORDERS από
τον ίδιο facade· ο κίνδυνος ήταν οι δύο διαδρομές εγγραφής και έκλεισε χθες. (2) Ο μόνος
πραγματικά κοινός κώδικας που αξίζει είναι η **καρτέλα** (`_oiCardHtml`) και το **ένα write** —
το Α τα ενώνει με ~60 γραμμές. (3) Η όψη λογιστή απαντά σε άλλη ερώτηση (διαχρονικά, ανά πελάτη,
με πύλη): βίαιη ενοποίηση με τον κατάλογο ημερομηνιών (Β) δίνει παραμέτρους, όχι απλότητα. (4) Το
Β αγγίζει κάθε ροή dispatcher και τα contracts τους — μη αποδεκτό ρίσκο τις μέρες που ξεκινά η
Ειρήνη. (5) Κάθε βήμα του Α είναι ένα commit που αναιρείται μόνο του και η σημερινή φόρμα ΤΠΥ
δουλεύει σε όλη τη διαδρομή.

## 4. Ανοιχτά για τον owner
- Η εναλλαγή όψεων: ορατή και στον dispatcher (πρόταση: ναι, μόνο ανάγνωση) ή μόνο σε accountant/owner;
- Worker allowlist πεδίων για accountant στα orders (πρόταση: ναι, μικρό, με deploy).
- Τα modals «Υπόλοιπα ανά πελάτη» / «Ιστορικό πελάτη»: μένουν ή φεύγουν με την ομαδοποίηση ανά πελάτη;
