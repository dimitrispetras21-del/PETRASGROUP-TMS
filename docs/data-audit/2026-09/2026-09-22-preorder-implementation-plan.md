# Pre-order — ΣΧΕΔΙΟ ΥΛΟΠΟΙΗΣΗΣ (χωρίς κώδικα) — 22/9/2026, βάση main f4d0737

Περιμένει: έγκριση Figma (706:1011 light / 707:1011 dark, χτισμένα από τη ζωντανή W39 — το 499:1011 είναι παλιά έκδοση,
714:1011 άκυρο). Σχέδιο πρότασης: `2026-09-22-pantelis-preorder.md` §«ΑΝΑΘΕΩΡΗΣΗ OWNER». Branch: `feat/preorder`.
**Σειρά στο orders_intl.js:** αυτό ΠΡΙΝ το επόμενο βήμα της ενοποίησης λιστών (η ενοποίηση έχει ήδη μεταφέρει sort/CSV/
φίλτρα/virtual scroll στο `core/orders-list.js` — 193 γρ., 1d9e89b· η φόρμα/submit μένουν στο module).

## Α. Νέο module `modules/preorder.js` (~150 γρ., όλο το νέο)
| Συνάρτηση | Τι κάνει | Εξαρτάται από |
|---|---|---|
| `openPreorder(prefill)` | modal 1 στήλης: Πελάτης (ίδιος picker με τη φόρμα — `_fhClientsMap`/form-helpers), Κατεύθυνση radio, ημ/νία (label αλλάζει Export→φόρτωσης / Import→παράδοσης), «Πόσα φορτία;» select 1–9, Σημειώσεις | `openModal/closeModal` (ui.js), form-helpers |
| `submitPreorder()` | validation 3 πεδίων → n × `atCreate(TABLES.ORDERS, {Type:'International', Client:[id], Direction, Loading DateTime ή Delivery DateTime, Notes, Status:'Pending', 'Ops Status':'Provisional'})` → toast «n pre-orders · ημέρα» → `invalidateCache(ORDERS)` + repaint καλούντος | `atCreate` (api.js), χάρτης Worker («Ops Status» γρ. 1192 ✓, Notes 823 ✓) |
| `editPreorder(recId)` | ίδιο modal σε edit (μόνο ημ/νία, σημειώσεις, πελάτης) → `atSafePatch` | |
| `cancelPreorder(recId)` | confirm → `atSafePatch(Status:'Cancelled')` | |
| `convertPreorder(recId)` | `_openModal(recId, fields)` της κανονικής φόρμας με `window._oiConvertFrom = recId` + λωρίδα | orders_intl `_openModal` (γρ. ~1060) |
| `isPreorder(f)` | `f['Ops Status']==='Provisional' && (f.Status\|\|'Pending')==='Pending'` — ΜΙΑ συνάρτηση, την καλούν λίστα/Weekly/Ημερήσιο (αρχή 3) | |
Φόρτωση: `app.html` νέο `<script src="modules/preorder.js?v=…">` ΠΡΙΝ τα orders_intl/weekly_intl/daily_ops.

## Β. `modules/orders_intl.js` (+~25 γρ.)
- γρ. 446 και 651: δίπλα στο «+ Νέα παραγγελία» κουμπί «Pre-order» → `openPreorder()` (ίδιο `canEdit`).
- `_openModal` (~1060): αν `isPreorder(f)` → λωρίδα «PRE-ORDER → συμπλήρωσε σημεία & ημερομηνίες» πάνω από το grid· κανένα
  άλλο πεδίο/έλεγχος δεν αλλάζει (τα 6 υποχρεωτικά γρ. ~1902–1910 μένουν).
- `submitIntlOrder` (γρ. 1769): ΜΟΝΗ αλλαγή — αν η εγγραφή είναι pre-order, `fields['Ops Status'] = null` (μετατροπή =
  ίδιο id). Το `'Status':'Pending'` default (2036) μένει.
- Λίστα: `_oiStatusHtml` (γρ. 91) → αν pre-order, γκρι «Pre-order» αντί «Σε αναμονή»· κελί ΕΝΕΡΓΕΙΕΣ της γραμμής (γρ. ~604)
  → 2 κουμπιά «Μετατροπή» / «Ακύρωση» μόνο σε pre-order· φίλτρο κατάστασης +«Pre-order» (το spec ζει στο
  `OrdersList.filterSpecs.intl` — **συντονισμός με το session Ειρήνης**, μία γραμμή στο spec + 1 test).
- CSV (γρ. 2856): στήλη «Pre-order» Yes/No.
- Απλό κλικ σε pre-order γραμμή → `convertPreorder` (πρόταση· αλλιώς `_openModal` όπως τώρα).

## Γ. `modules/weekly_intl.js` (+~40 γρ.)
- γρ. 947: κουμπί «Pre-order» δίπλα στο «+ Νέα παραγγελία» → `openPreorder()`, ίδια πύλη ρόλου (γρ. 465).
- `_wiRowHTML` (2153) και `_wiImpRowHTML` (1194): αν `isPreorder(f)` → κλάση `wi2-pre` στη γραμμή (CSS: όπως `wi2-un` γρ. 303
  αλλά `--text-dim` διακεκομμένο, φόντο `--surface-sunken`), chip «PRE-ORDER» στο `wi2-name` (μοτίβο `wk3-vsb`), meta =
  ημ/νία · «—» · Notes κομμένο. Ανάθεση/popover ΟΠΩΣ είναι (επιτρέπεται).
- `_wiCtx` (~3700) / `_wiImpCtx` (~4530): αν pre-order → 3 στοιχεία μπροστά: «Μετατροπή σε παραγγελία…»,
  «Επεξεργασία pre-order…», «Ακύρωση pre-order» + separator· Groupage/ρότα/σπάσιμο ΚΡΥΒΟΝΤΑΙ (χωρίς σημεία δεν έχουν νόημα).
- Κεφαλίδα εβδομάδας: «· N pre-orders» (μετρητής φαντασμάτων).
- Το Weekly φορτώνει όλα τα πεδία (χωρίς `fields:`) → «Ops Status»/«Notes» έρχονται ήδη· `_wiBuildRows` δεν αλλάζει.

## Δ. `modules/daily_ops.js` (+~30 γρ.)
- `OPS_FIELDS` (γρ. 22): + `'Ops Status'`, `'Notes'` (αλλιώς αόρατο — μηχανισμός-παγίδα 2). ⚠ αλλάζει το URL της αίτησης →
  το HAR 28/8 δεν ταιριάζει· ο κριτής `contract:daily_ops` ήδη «Φόρτωση…» (γνωστό κενό) — χρειάζεται νέο HAR ή η γέφυρα
  `route.fallback` του `tests/critics/rota-matched-import-rig.js`.
- `_opsRow` (709): pre-order → κλάση `do-pre` (opacity όπως `.do-done`), ΚΑΤΑΣΤΑΣΗ «Pre-order» + αχνή 2η σειρά Notes,
  ΕΝΕΡΓΕΙΕΣ = [Μετατροπή] [Ακύρωση] (όχι Φορτώθηκε/Αλλαγή ημέρας/ΠΡΟΚ. input).
- Μετρητές γρ. 443/571: `items.filter(r=>!isPreorder(r.fields))` στον παρονομαστή + «· N pre-order» στη λεζάντα.
- Εκκρεμείς φορτώσεις (ovLF γρ. 72): έρχονται ήδη (Pending + Loading < σήμερα) — ίδια γραμμή με «Pre-order».

## Ε. Βάση / Worker
- Worker: 0. Βάση: DRAFT 044 CHECK (`worker/migrations/drafts/044_ops_status_provisional_check.sql`) — owner.
- **Σειρά (συντονιστής 22/9, αρχή 5 «ό,τι γεννιέται, γεννιέται κλειστό»):** το 044 ΕΚΤΕΛΕΙΤΑΙ από τον owner ΠΡΙΝ γραφτεί η
  πρώτη γραμμή με `'Provisional'` — δηλαδή πριν τη ζωντανή δοκιμή ΣΤ.3, άρα πριν το push του `feat/preorder`. Το DRAFT
  ταξιδεύει μαζί με το branch (ίδιο PR/έλεγχος), όχι ξεχωριστά. Αν το 044 δεν έχει τρέξει, η ΣΤ.3 ΔΕΝ ξεκινά.

## ΣΤ. Rig / απόδειξη (πριν το push)
1. `tests/critics/preorder.spec.js` (νέος, στο EXPECTED_LIVE του run.js + playwright.config): HAR replay + stub POST
   (route: αποθηκεύει τα σώματα) → «Pre-order» με n=2 → 2 POST με `Ops Status:'Provisional'`, `Status:'Pending'`, χωρίς
   `Loading Location 1`, `Veroia Switch:false`· λίστα δείχνει pill «Pre-order»· Weekly κάρτα `wi2-pre` + μενού 3 στοιχείων·
   Ημερήσιο γραμμή `do-pre` χωρίς κουμπί «Φορτώθηκε», μετρητής εκτός.
2. Contract baselines: `docs/redesign/contracts/{orders_intl,daily_ops}.json` + `weekly_intl` (kanban) — νέα labels
   («Pre-order», «Μετατροπή σε παραγγελία», «Ακύρωση pre-order»).
3. **Ζωντανά, σε παραγγελία-δοκιμή ΠΕΛΑΤΗ-ΔΟΚΙΜΗΣ (όχι ΦΑΓΕ ή άλλον πραγματικό πελάτη), μετά το 044:** 2 pre-orders →
   SELECT `ops_status='Provisional'`, `status='Pending'`, `loading_location_1_id IS NULL`, 0 ORDER_STOPS, 0 ct_rt_legs →
   μετατροπή της μίας → SELECT `ops_status IS NULL` + στάσεις → ακύρωση της άλλης → `Cancelled`.
   **Τι μένει πίσω:** η ακύρωση ΔΕΝ διαγράφει — μένουν 1 Cancelled (η ακυρωμένη) + 1 κανονική παραγγελία-δοκιμή (η
   μετατραπείσα, που πρέπει κι αυτή να ακυρωθεί → 2 Cancelled). Καθάρισμα: SQL του owner (soft delete `deleted_at`, με
   audit όπως στο DECISION_LOG 15/9 για την 340) — ΟΧΙ από το session. Μέχρι τότε, επιβεβαίωση ότι οι 2 Cancelled ΔΕΝ
   φαίνονται πουθενά: Weekly (φίλτρο Cancelled), Ημερήσιο (`ovLF`/`dayF` εξαιρούν Cancelled), Τιμολόγηση (Delivered μόνο),
   dashboard `_open` (εξαιρεί Cancelled), και rt-feed (Cancelled = gone, κανένα RT).
4. Session-έλεγχος (CLAUDE.md): `count(*) WHERE ops_status='Provisional' AND status='Pending' AND loading_datetime < current_date`.

## Ζ. Ρίσκα / σειρά
- Σύγκρουση με ενοποίηση λιστών: μόνο το filter spec (1 γραμμή) και το κελί ΕΝΕΡΓΕΙΕΣ — να μπει ΠΡΙΝ το επόμενο βήμα τους.
- Κανόνας «ΔΕΝ ΣΤΕΛΝΟΥΜΕ ΑΔΟΚΙΜΑΣΤΗ ΔΗΜΙΟΥΡΓΙΑ ΠΑΡΑΓΓΕΛΙΩΝ»: το ΣΤ.3 είναι υποχρεωτικό πριν το push.
- Μέγεθος: ~250 γραμμές συνολικά → «μεγάλη» αλλαγή (φόρμα παραγγελιών) → ελεγκτής ρόλος 1.
