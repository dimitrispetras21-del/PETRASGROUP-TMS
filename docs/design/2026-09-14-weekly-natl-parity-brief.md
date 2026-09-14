# Weekly Εθνικών = τα εργαλεία του Weekly Διεθνών — brief για νέο session (owner 14/9/2026)

**Λόγια του owner (14/9 13:xx):** «Θέλω να ανοίξει ένα καινούργιο session στο οποίο εσύ, ο απόλυτος coordinator, θα
δουλεύεις με τη μορφή Graph Engineering και θα χρησιμοποιήσεις multiple sub agents που θα επιλέγεις σωστά ώστε να
έχουμε σωστή κατανομή token. Στόχος: το Weekly National να αποκτήσει τα ίδια tools που έχει το Weekly International.
Π.χ. όταν κάνουμε κλικ να μπορούμε να επεξεργαστούμε μια παραγγελία εθνικών ανεξάρτητη. Δεν πειράζουμε τα Veroia
Switch — μόνο το Weekly International έχει το δικαίωμα να τα πειράξει. Με την ίδια λογική όλη η σελίδα: αρκετά
εργαλεία. Να προσθέσουμε κουμπί για Groupage. Το σπάσιμο [σκέλους] δεν μας ενδιαφέρει τόσο.»

## Κανόνες που ισχύουν (μην ξαναρωτηθούν)
- Figma πρώτα (αρχείο KO7l2AfucR3HJEDIg1Yptr, σελίδα Screens) → έγκριση owner → υλοποίηση. Μία ερώτηση τη φορά.
- Φορτία Veroia Switch (`national_loads.source_type='Direct'` με `source_order_id`) = ΜΟΝΟ ανάγνωση στο Weekly Εθνικών·
  ανάθεση/ταίριασμα επιτρέπονται, επεξεργασία στοιχείων ΟΧΙ (τα αλλάζει η διεθνής παραγγελία, triggers 028/030).
- Γνήσιες εθνικές παραγγελίες (`national_orders` → φορτίο με `source_national_order_id`) = πλήρης επεξεργασία από το
  Weekly (κλικ → φόρμα `openNatlEdit(recId)` της orders_natl.js, εξαγόμενη στο window).
- Groupage εθνικών: GL→CL→NL αλυσίδα (`_natlWriteGroupageChain`, CL direction ελληνικά ΚΑΘΟΔΟΣ/ΑΝΟΔΟΣ)· τα GL ποτέ δεν
  διαγράφονται. Κουμπί «Groupage» στον πίνακα = νέα ζητούμενη δυνατότητα (σχεδιασμός ανοιχτός).
- Supabase = SELECT μόνο· Worker deploy μόνο owner· κάθε παράδοση ελέγχεται ζωντανά με stubs (0 εγγραφές) και SELECT.
- Άλλο session πουσάρει ταυτόχρονα: `git fetch` πριν, ποτέ stash, cherry-pick σε προσωρινό worktree όταν το origin
  προχώρησε, `reset --keep origin/main` μετά. Ο φρουρός Fact-Forcing μπλοκάρει την ΠΡΩΤΗ επεξεργασία κάθε αρχείου.

## Πού βρίσκεται ο κώδικας
- Weekly Εθνικών: `modules/weekly_natl.js` (~3.100 γραμμές, IIFE, 100 συναρτήσεις `_wn*`, exports στο window).
  Υπάρχουν: ανάθεση (`_wnOpenPopover/_wnSaveFromPopover`), ταίριασμα (`_wnSaveMatch/_wnUnmatch`), νέα άνοδος από κενό
  κελί (`_wnNewSn/_wnConsumePendingMatch`), αφαίρεση ανάθεσης (`_wnUnassign/_wnUnassignSn`, φρουρός `_wnDoneLive`),
  πολυστάσιο πλακάτ με σύρσιμο (`_wnSeg*`), τοπικές παραδόσεις (`_wnAddLocal`), δεξί κλικ (`_wnCtx`), CSS στο `_wnCss`
  (grid 36px/1fr/280px/1fr, κάρτα cross-dock 176px).
- Weekly Διεθνών (το πρότυπο): `modules/weekly_intl.js` (169 συναρτήσεις `_wi*`): popover, ταίριασμα, GI-/GRP- ομάδες,
  σπάσιμο σκέλους, χειρισμός εκτελούμενων (`_wiExecutingLive/_wiPlanPatch`), εκτύπωση, στήλες ΠΡΟΣ/ΑΠΟ ΒΕΡΟΙΑ
  (`_wk3FeedTog`, fl-on/fr-on από 14/9).
- Φόρμα εθνικής: `modules/orders_natl.js` (`openNatlEdit`, `submitNatlOrder`, `_syncNationalLoad`, `deleteNatlOrder` —
  παραγγελία πρώτα, 13/9). Groupage: `_natlWriteGroupageChain`, `_syncGroupageLinesFromNO`.
- Rig: scratchpad `wn-multistop` (2 tests) — τρέχει με `preview_start tms-local` (8788) και
  `PW_BASE_URL=http://127.0.0.1:8788/ npx playwright test -c <scratchpad>/wn-multistop/pw.config.js`.
- Πρόσφατα ευρήματα/διορθώσεις: `docs/data-audit/2026-09/2026-09-14-dispatchers-morning.md`, fix-round 13–14/9.

## Πρώτο βήμα του νέου session
1. Απογραφή: πίνακας «εργαλείο → Weekly Διεθνών έχει / Weekly Εθνικών έχει / ισχύει για VS; / ισχύει για γνήσια
   εθνική;» από δύο ελεγκτές Sonnet μόνο-ανάγνωσης (ένας ανά αρχείο), επιστροφή κειμένου ≤ 80 γραμμές.
2. Figma: μία οθόνη Weekly Εθνικών με τα νέα εργαλεία (κλικ = επεξεργασία γνήσιας εθνικής, κουμπί Groupage, δεξί κλικ)
   → έγκριση owner.
3. Υλοποίηση σε worktree από Sonnet, cherry-pick από τον συντονιστή, rig + ζωντανό dry-run, bump, push.
