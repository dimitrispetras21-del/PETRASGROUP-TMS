# Οι δύο λίστες παραγγελιών — διάγνωση και πρόταση ενοποίησης · 22/9/2026

Εντολή owner (22/9): «πιο σωστό να διορθώσουμε πρώτα τα ORDERS National/International και μετά να
φτιάξουμε τα προς τιμολόγηση, για να μην κάνουμε διπλή δουλειά». Το Figma 702:1011 (όψη «Προς
τιμολόγηση») μένει εγκεκριμένος στόχος και κουμπώνει στο βήμα 3 παρακάτω. **Καμία αλλαγή κώδικα
σε αυτό το βήμα.** Χαρτογράφηση: 2 subagents Sonnet (read-only, `diff` σε σώματα συναρτήσεων) ·
ζωντανός έλεγχος μόνο-ανάγνωσης στο rig (HAR 28/8, ρόλοι owner + accountant, 1440) · σύνθεση:
Claude Fable 5.1. Αρχεία: `modules/orders_intl.js` 3.453 γρ. (47 συναρτήσεις, IIFE) ·
`modules/orders_natl.js` 2.631 γρ. (47, IIFE).

## 1. Τι είναι διπλό — συνάρτηση προς συνάρτηση

Κατηγορίες: **Ι** = ίδιο κείμενο (μόνο μετονομασίες) · **Λ** = ίδια λογική, άλλο κείμενο ·
**Δ** = πραγματικά διαφορετικό γιατί το εθνικό διαφέρει · **Μ** = μόνο στο ένα.

| Περιοχή | intl (γρ.) | natl (γρ.) | Κατ. | Σημείωση |
|---|---|---|---|---|
| State (`INTL_ORDERS/_intlFilters/_oiVS`) :7-18 | :7-18 | Ι | `_oiVS.allRows` μόνο intl |
| Loader `renderOrdersIntl` :328-436 (109) | `renderOrdersNatl` :29-243 (215) | Λ | ίδιος κορμός (period → formula → atGet → sort → filters)· intl +ORDER_STOPS ανά 90 :378-397 + locations meta· natl +έλεγχος «χωρίς NATIONAL LOAD» :59-70 |
| Παράθυρο 60/180/all `_intlPeriod`, `intlPeriodChange` :753 | `_natlPeriod`, `natlPeriodChange` :596 | Ι | **bug natl**: `natlClearFilters` :599 δεν ξαναφορτώνει την περίοδο (το intl :756 κάνει `intlPeriodChange('all')`) |
| Virtual scroll `_oiVirtualPaint` :627-655, `_oiOnScroll` :656-666 | `_onVirtualPaint` :495-522, `_onOnScroll` :523-530 | **Ι** | byte-ίδιο μετά μετονομασία (1 σχόλιο διαφορά) |
| Col-defs `_intlColDefs` :540-555 (14 στήλες) | `_natlColDefs` :344-354 (9-10) | Λ | ίδιο σχήμα `{key,label,type,w,get}`· natl **χωρίς ΤΙΜΗ/ΕΒΔ./ΚΑΤΑΣΤΑΣΗ** στη λίστα |
| Sort `_intlSortToggle/_intlSortRecords` :560-587 | :358-390 | Ι / Λ | toggle ίδιο· records: intl περνά και το record (ORDER_STOPS) |
| Row `_oiRowHtml` :588-626 | `_onRowHtml` :444-494 | Λ | ίδιο σχόλιο Δ2 λέξη-προς-λέξη :595 / :462· natl +VS/GRP tags + «ΕΚΤΟΣ WEEKLY»· intl +«2 σκέλη» |
| Κελί ΤΙΜ. `_oiInvCell` :176 | `_onInvCell` :437 | Ι | από 22/9 μόνο-ανάγνωση και στα δύο |
| Φίλτρα/αναζήτηση `_applyIntlFilters` :768-812 | `_applyNatlFilters` :606-645 | Λ | ίδιο σχήμα· πεδία domain: intl Brand/Week/Status, natl Type/Groupage/Trip· μόνο intl `reportPageMetrics` :804 |
| CSV `_intlExportCSV` :2915 | `_natlExportCSV` :2491 | Λ | **bug natl**: διαβάζει `f['Name']` που δεν υπάρχει στον χάρτη → 1η στήλη πάντα κενή :2496· toasts αγγλικά :2493/2508 |
| Print `_intlPrint` :2934-3017 | `_natlPrint` :2512-2631 | Λ | ίδιο pattern (HTML string + `window.open` + print) |
| CSS `_oiCss()` :203-325 (123) | `_ON_CSS` :115-235 (121) | Λ | ίδιοι selectors/σκοπός, διαφορετικές τιμές (padding, `clip` vs `ellipsis`)· 5 γραμμές ίδιες |
| Καρτέλα `_oiCardHtml` :827-944 (118) | inline στο `selectNatlOrder` :651-775 (125) | Λ/Δ | ίδιος σκελετός (header/chips/sections/actions)· natl **χωρίς** ΤΠΥ αριθμό/ημερομηνία :725, χωρίς δελτία PE, χωρίς Διπλασιασμό, Τιμή πίσω από `can('costs')` :724 (intl :907 χωρίς πύλη)· σχόλιο :692 δείχνει ότι ήταν συζευγμένα (κοινό `_dF`) και αποσυνδέθηκαν |
| Φόρμα `_openModal` :1084-1252 (169) | `_openNatlModal` :1204-1337 (134) | **Δ** | κοινό μόνο το `opt()` + 1 σχόλιο· intl multi-stop από ORDER_STOPS, natl Κανονικό/Groupage (`_grp*` 12 συν., ~215 γρ., Μ) |
| Submit `submitIntlOrder` :1836-2209 (374) | `submitNatlOrder` :1353-1643 (291) | Λ σκελετός / Δ μέσα | validate → build → atCreate/atPatch → cascade → `syncOrderDownstream` → close· intl `_syncVeroiaSwitch` :1315-1630 (316, Μ)· natl `_natlWriteGroupageChain` (154, Μ), `_syncNationalLoad` (162, Μ) |
| Groupage lines `_syncGroupageLines` :1681-1835 | `_syncGroupageLinesFromNO` :1644-1779 | Λ | GROUPAGE_LINES/CONS_LOADS |
| Delete `deleteIntlOrder` :3045-3182 | `deleteNatlOrder` :1964-2096 | Λ | ίδια σειρά ORDER → NAT_LOADS → GL/CL → RAMP → PL → STOPS· σχόλια «same as deleteNatlOrder» :3053· `FIXME GL_LINES must never be hard-deleted` ×3 μόνο natl :1569/1750/2037 |
| Cancel | | Ι | σχεδόν byte-ίδιο |
| `syncOrderDownstream` (core/order-sync.js) | | **ήδη κοινό** | intl :2169/2215/3025 · natl :1613/1948 |
| Δικαιώματα `canEdit = can('orders')==='full'` :438,833 | :270,668 | Ι | natl επιπλέον `can('costs')` στην Τιμή |
| Exports `window.*` 38 :3411-3452 | 37 :2582-2630 | — | intl-only: `duplicateIntlOrder`, `openIntlReadOnlyCard`· natl-only: 10 `_grp*/_sim*` |

**Σύνολα (εξετασμένα ζεύγη):** Ι ≈ 130 + 130 γρ. · Λ ≈ 920 + 830 · Δ/Μ ≈ 560 intl (VS, stops, scan) +
620 natl (groupage, national load). Δηλαδή **~1.000 γραμμές ανά αρχείο** είναι το ίδιο πράγμα γραμμένο
δύο φορές, και **~600 ανά αρχείο** είναι πραγματικά δικές του.

## 2. Τι χωλαίνει σήμερα

### 2.1 Ζωντανός έλεγχος (rig, HAR 28/8, μόνο ανάγνωση — τα screenshots έχουν ονόματα πελατών και μένουν εκτός repo)

| | Διεθνείς | Εθνικές |
|---|---|---|
| Φόρτωση | 4,5 s (HAR)· 97 παραγγελίες/60 ημ., 26 γραμμές ζωγραφισμένες (virtual scroll) | 4,5 s· 3 παραγγελίες |
| Στήλες | 14· καμία κομμένη στα 1440 | 9· **5 κομμένα**: κεφαλίδες «ΗΜ. ΦΟ…», «ΗΜ. ΠΑΡ…», κελιά «↑ ΑΝΟΔ…» ×3 (critics: hex 4, κοπή 6 — προϋπάρχον) |
| Φίλτρα | 6 σε μία σειρά | 7 σε **δύο** σειρές |
| «ΑΡ.» / «ΑΝΑΦΟΡΑ» | ΑΡ. πάντα «—» (το Order Number δεν υπάρχει), ΑΝΑΦΟΡΑ συχνά «—» + chips PE/VS | ΑΝΑΦΟΡΑ πάντα «—» στα 3 |
| ΑΝΑΘΕΣΗ | κόκκινο «ΠΡΟΣ ΑΝΑΘΕΣΗ» σε παραδομένες όταν δεν φορτωθεί ο στόλος (banner το εξηγεί) | ίδιο |
| Καρτέλα | Τιμή, Τιμολογήθηκε(+ΤΠΥ), Παλέτες, Δελτία, Διπλασιασμός | Τιμή (πίσω από costs), Τιμολογήθηκε Ναι/Όχι **χωρίς ΤΠΥ**, «Επεξεργασία» **δύο φορές** (κεφαλίδα + ενέργειες) |
| Ως accountant | ίδια λίστα, χωρίς Νέα/Επεξεργασία/Διπλασιασμός/Ακύρωση/Διαγραφή· ΤΙΜ. ✓ μόνο-ανάγνωση | ίδιο |
| Κονσόλα | `ERR_FAILED` = κενά του HAR (ORDER_STOPS/στόλος), όχι της εφαρμογής | ίδιο |

### 2.2 Λίστα ελαττωμάτων (κώδικας, με ποιον αφορά)

| # | Λίστα | Τι | Πού | Ποιον |
|---|---|---|---|---|
| 1 | intl | `ΤΙΜΗ €` στη λίστα και «Τιμή» στην καρτέλα χωρίς πύλη· natl την κρύβει με `can('costs')` — **ασυνέπεια**· κλειδωμένη απόφαση 23/8: ο dispatcher **βλέπει** την τιμή (`Price`) μέχρι το P&L → η natl είναι η λάθος πλευρά | :531, :907 / natl :724 | dispatcher |
| 2 | intl+natl | CSV/Εκτύπωση ορατά σε κάθε ρόλο, πάντα με Τιμή — αντιφάσκει με την πύλη της natl καρτέλας (ίδια απόφαση: ή παντού ή πουθενά) | :2918/:2945 · natl :2493/:2524 | ρόλοι |
| 3 | natl | CSV διαβάζει `f['Name']` (ανύπαρκτο) → πρώτη στήλη κενή | :2496 | dispatcher |
| 4 | natl | toasts αγγλικά («No records to export», «CSV exported», «Pop-up blocked») | :2493, :2508, :2511, :2573 | dispatcher |
| 5 | natl | καρτέλα χωρίς αριθμό/ημερομηνία ΤΠΥ | :715-725 | λογιστή |
| 6 | natl | καμία «Διπλασιασμός» | :744-750 | dispatcher |
| 7 | natl | `natlClearFilters` δεν επαναφέρει την περίοδο σε «όλες» (η intl ναι) | :599 vs intl :756 | dispatcher |
| 8 | natl | έλεγχος NAT_LOADS «εκτός Weekly» με **ένα** `OR(...)` χωρίς δέσμες (η intl κάνει 90/δέσμη με σχόλιο για το όριο) | :65-70 vs intl :378-391 | dispatcher (σε «όλες») |
| 9 | natl | 5 κομμένα κείμενα στα 1440 (κεφαλίδες ημερομηνιών, κατεύθυνση), φίλτρα σε 2 σειρές | `_natlColDefs` :344, layout :293-321 | dispatcher |
| 10 | intl | πλάτη στηλών μετρημένα λάθος 3/9 και «όχι ανακατανεμημένα» (σχόλιο του ίδιου του κώδικα) | :518-524 | dispatcher |
| 11 | intl | `_intlChangeStatus` (γράφει Status + sync) **χωρίς κανέναν καλούντα**· `_weekNum` ποτέ δεν καλείται | :2210-2227 · :53 | κανέναν (νεκρός κώδικας) |
| 12 | intl | ~~«ΑΡ.» πάντα «—»~~ **ΔΙΟΡΘΩΣΗ ΕΥΡΗΜΑΤΟΣ (22/9 βράδυ):** η στήλη **δουλεύει** — `order_no` 216/216 στην όψη `orders_with_derived` (019, 7/9), `"Order No": "order_no"` στον χάρτη Worker (:1172) ΚΑΙ στο ζωντανό bundle, `readView: "orders_with_derived"` (:1164). Το «—» του ζωντανού ελέγχου = HAR 28/8 προ-019 (0 εμφανίσεις «Order No» στο HAR). Απόφαση owner: η στήλη **ΜΕΝΕΙ** (εσωτερικός αριθμός, σημαντικός)· μόνο το πλάτος 52 px ρυθμίζεται στο βήμα 2 (3–4 ψηφία + κεφαλίδα). Το rig θέλει φρέσκο HAR. | :518, :544 | dispatcher (μόνο πλάτος) |
| 13 | και οι δύο | contracts (tier 3) ξεπερασμένα: intl πρόσθεσε ΑΝΑΦΟΡΑ/ΑΝΑΘΕΣΗ, natl ΟΝΟΜΑ→ΑΝΑΦΟΡΑ + ΔΙΑΔΡΟΜΗ· κανείς δεν τα ξανα-ενέκρινε | `docs/redesign/contracts/orders_{intl,natl}.json` | rigs |
| 14 | worker | σχόλιο στον χάρτη NATIONAL ORDERS «0 live records, dormant» ενώ ο πίνακας έχει 11 γραμμές και ζωντανά bugfixes 13/9 | `worker/src/index.js:1454-1457` | docs (ψέμα σχολίου) |
| 15 | και οι δύο | για τη λογίστρια: κανένα φίλτρο «τιμολογημένη/ατιμολόγητη», καμία ομαδοποίηση ανά πελάτη, ΑΦΜ/όροι πουθενά — ακριβώς ό,τι καλύπτει η όψη 702:1011 | — | λογιστή |

### 2.3 Επαφή με το session «Παντελής 22/9» (Προσωρινή παραγγελία)
`grep Προσωρινή|ops_status|Ops Status` στα δύο modules και στο daily_ops: **0**· ο χάρτης Worker έχει
`"Ops Status": "ops_status"` και για τους δύο πίνακες (:1192, :1499)· κανένα spec στο `docs/`. Η
ζώνη που θα αγγίξει εκείνο το session: φόρμα/submit Διεθνών (`openIntlCreate` :1054, `_openModal`
:1084-1252, `submitIntlOrder` :1836-2209) και dropdown Status (:462-480, `_intlChangeStatus` :2210).
**Η ενοποίηση παρακάτω δεν αγγίζει φόρμες/submit** (βλ. §4), άρα η σύγκρουση είναι μόνο σε επίπεδο
αρχείου: οι δικές μου αλλαγές είναι στην αρχή (state/loader/λίστα) και στο τέλος (CSV/print/exports),
οι δικές τους στη μέση. Συντονισμός: ένα branch τη φορά στο `orders_intl.js`, rebase του δεύτερου.

## 3. Πρόταση ενοποίησης — `core/orders-list.js` (μηχανή λίστας + καρτέλας + όψεων) και δύο λεπτά modules

Αρχή: **ενοποιείται ό,τι είναι Ι ή Λ· μένει στο module ό,τι είναι Δ/Μ**. Η μηχανή παίρνει μια
προδιαγραφή (`spec`) από κάθε module: πίνακας/φόρμουλα, στήλες, φίλτρα, στήλες CSV/print, sections
καρτέλας, ενέργειες, **όψεις**. Τα modules κρατούν φόρμες, submit, cascades, scan.

| Βήμα | Τι αλλάζει | Φεύγει / έρχεται | Ρίσκο | Rig | Αναίρεση |
|---|---|---|---|---|---|
| **0** Επανα-έγκριση contracts | τα δύο JSON ξαναγράφονται με τις σημερινές στήλες (ΑΝΑΦΟΡΑ, ΑΝΑΘΕΣΗ, ΔΙΑΔΡΟΜΗ) — docs-only, έγκριση owner | 0 κώδικας | κανένα | contract.spec γίνεται ξανά «πράσινο» αντί «diff» | git revert |
| **1** Μηχανή Ι: virtual scroll + περίοδος + sort toggle + cancel σε `core/orders-list.js`· τα δύο modules καλούν | −180 / +120 | χαμηλό (byte-ίδιος κώδικας) | `tests/orders-list.test.js` (node:test: sort, period cutoff, paint range) + contracts + probe screenshots ×2 | 1 commit |
| **2** Μηχανή Λ: renderer λίστας (σχήμα col-defs, row html, φίλτρα/αναζήτηση, CSV/print builders, CSS) με spec ανά module· διορθώνονται μαζί τα #2, #3, #4, #7, #8, #9, #12 | −650 / +380 core + 2×~90 spec | **μεσαίο**: οι ετικέτες στηλών πρέπει να ταιριάζουν με τα contracts του βήματος 0 | contracts + node:test + probe screenshots + critics static (hex/κοπή natl πρέπει να πέσουν) | 1 commit που αναιρείται ολόκληρο (όχι feature flag — δύο renderers = δύο πηγές) |
| **3** Κοινή καρτέλα `renderOrderCard(rec, spec)`: header/chips/sections/actions· intl δίνει stops+δελτία PE, natl pickup/deliveries· διορθώνονται #1 (τιμή ορατή παντού όπως το κλείδωμα), #5 (ΤΠΥ στη natl), #6 (Διπλασιασμός natl — απόφαση), «Επεξεργασία ×2»· **εδώ κουμπώνει η όψη 702:1011**: `views: { catalog: {...}, invoicing: { query: Delivered χωρίς παράθυρο, groupBy: client, columns: [...], card: +ERP block +φόρμα ΤΠΥ όταν costs:full } }` — γράφεται **μία φορά** στη μηχανή, τη βλέπουν και οι δύο σελίδες (η όψη στη σελίδα Διεθνών δείχνει και εθνικές, όπως αποφασίστηκε) | −240 / +260 | μεσαίο | invoicing-proof (μέσω orders_intl + όψη) + contracts + probe | 1 commit |
| **4** `invoicing.js` αποσύρεται: route `#invoicing` → Παραγγελίες όψη «Προς τιμολόγηση», `_invWriteInvoice` → κοινό helper στη μηχανή, Worker allowlist πεδίων accountant (deploy owner), `units.js:9` ενημερώνεται | −1.100 / +150 | χαμηλό (η όψη ήδη υπάρχει από το 3) | invoicing-proof, critics | 1 commit |

**Εκτίμηση:** ~8 εργάσιμες (0: ½ · 1: 1 · 2: 3 · 3: 2 · 4: 1½), καθαρό αποτέλεσμα ≈ **−2.200 / +1.000
γραμμές**, τα δύο modules από 3.453 + 2.631 σε ≈ 2.400 + 1.500, η μηχανή ≈ 900. Σε κάθε βήμα οι
weekly callers (`openIntlCreate/openIntlEditWith/openIntlReadOnlyCard/openNatl*`) και ο router
δεν αλλάζουν υπογραφή· ο καταρράκτης εθνικών και το `syncOrderDownstream` δεν αγγίζονται· η
σημερινή Τιμολόγηση δουλεύει μέχρι το βήμα 4. **Κανόνας ροής:** κάθε βήμα σε branch → SHA στον
συντονιστή → ελεγκτής → go → main.

## 4. Τι ΔΕΝ αξίζει να ενοποιηθεί (ρητά)

- **Φόρμες** `_openModal` / `_openNatlModal` και `_grp*` (groupage): κοινό μόνο το `opt()`· η
  εθνική φόρμα είναι άλλο προϊόν (Κανονικό/Groupage, πολλοί πελάτες σε ένα φορτηγό).
- **Submit + cascades**: `_syncVeroiaSwitch` (316 γρ.) υπάρχει μόνο επειδή η διεθνής γεννά εθνικό
  φορτίο· `_natlWriteGroupageChain`/`_syncNationalLoad` μόνο επειδή η εθνική γεννά GL/CL/NAT_LOADS.
  Μόνο ο `FIXME GL_LINES never hard-deleted` γίνεται ένας κοινός φρουρός (10 γρ.).
- **Delete cascades**: ίδια σειρά, διαφορετικοί πίνακες — κοινό μόνο το «σβήσε με αυτή τη σειρά
  και σταμάτα στο πρώτο λάθος» (helper ~20 γρ.), όχι ο κώδικας.
- **Scan/AI εξαγωγή**: δύο παράλληλα συστήματα (~700 γρ. intl) — εκτός εμβέλειας.
- **Έλεγχος NAT_LOADS «εκτός Weekly»**: natl-only· διορθώνεται (δέσμες) αλλά δεν γενικεύεται.

## 5. Αποφάσεις owner (22/9 βράδυ, μέσω συντονιστή)
1. Τιμή στις Εθνικές ορατή σε dispatcher όπως στις Διεθνείς + ίδιος κανόνας CSV/Εκτύπωση — **ΝΑΙ**.
2. «Διπλασιασμός» και στις Εθνικές — **ΝΑΙ**.
3. Επανα-έγκριση contracts (βήμα 0) με τις σημερινές στήλες — **ΝΑΙ**.
4. Σειρά στο `orders_intl.js`: **Παντελής πρώτος** (φόρμα/submit)· τα βήματα 0–1 δεν αγγίζουν τη
   φόρμα και προχωρούν τώρα· το βήμα 2 μετά το merge του Παντελή.
5. Η στήλη «ΑΡ.» — **ΟΧΙ, μένει** («εσωτερικός αριθμός παραγγελίας, σημαντικός»)· βλ. §2.2 #12: η
   στήλη δουλεύει, το «—» ήταν παλιό HAR· πλάτος ρυθμίζεται στο βήμα 2.

Ροή από το βήμα 0: branch `unify/orders-list-1` → push μόνο branch → SHA + diff --stat + rigs στον
συντονιστή → ανεξάρτητος ελεγκτής → go → main.
