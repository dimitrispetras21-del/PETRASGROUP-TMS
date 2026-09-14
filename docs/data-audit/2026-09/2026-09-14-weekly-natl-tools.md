# Weekly Εθνικών = εργαλεία Weekly Διεθνών — Βήματα 2–3 (14/9/2026, απόγευμα)

Brief: `docs/design/2026-09-14-weekly-natl-parity-brief.md` · Βήμα 1 (απογραφή): `2026-09-14-weekly-natl-parity-inventory.md`
· Spec: `docs/superpowers/specs/2026-09-14-weekly-natl-tools-design.md` · Figma: `w5-weekly-natl-tools` 618:1011 + σημειώσεις 621:1058.
Μέθοδος: συντονιστής (Claude Fable 5.1) + 2 ελεγκτές Sonnet (απογραφή) + 1 υλοποιητής Sonnet σε worktree `impl/wn-tools`·
γονικό session (petrasgroup-tms-2e) σε εποπτεία· owner ενέκρινε στο chat, μία ερώτηση τη φορά.

## Αποφάσεις owner (14/9)
| # | Ερώτηση | Απάντηση | Τι έγινε |
|---|---|---|---|
| 1 | Σήμα πηγής στην κάρτα | «VS/GRP μόνο» | σήμα `VS` (γκρι) / `GRP` (κεχριμπάρι) στη στήλη αρίθμησης· η γνήσια εθνική χωρίς σήμα |
| 2 | Κλικ σε γνήσια εθνική / groupage | «ναι και στα 2» | `_wnOpenRow`: φόρμα εθνικής παραγγελίας (γνήσια: `Source National Order`· groupage: πρώτη γραμμή GL του CL· τμήμα πολυστάσιου: η παραγγελία της στάσης) |
| 3 | Κλικ σε VS | «μόνο ανάγνωση» → **Α** (καρτέλα διεθνούς μόνο-ανάγνωσης) | `openIntlReadOnlyCard` (orders_intl.js): floating `#intlDetail.oi-ro-float`, ενέργειες κρυφές, σημείωση «Veroia Switch · μόνο ανάγνωση», σύνδεσμος «άνοιγμα στο Εβδομαδιαίο Διεθνών →». Το Β (μετάβαση στο Weekly Διεθνών) απορρίφθηκε |
| 4 | Κουμπί «+ Groupage» | «εκκρεμότητα, δεν αποφάσισα ακόμα» | **δεν υλοποιήθηκε** — ανοιχτή απόφαση (βλ. DECISION_LOG) |
| 5 | Δεξί κλικ | «ναι, και τα τρία» | + «Επεξεργασία» (όχι σε VS), + «Εκτύπωση», − «Διαχωρισμός» |

## Ελαττώματα της απογραφής — τι διορθώθηκε
| Ελάττωμα | Διόρθωση | Αρχείο |
|---|---|---|
| Δ1 κλικ σε τμήμα πολυστάσιου = σιωπηλό no-op (id ΦΟΡΤΙΟΥ σε φόρμα παραγγελίας, λίστα κενή) | `_wnOpenRow(rowId, noId)` + `openNatlEdit` φορτώνει μόνη της την εγγραφή (`atGetOne`, toast σε 403/404) | weekly_natl.js, orders_natl.js |
| Δ2 φίλτρο «Groupage» πιάνει VS με 2+ παραδόσεις | `isGrp = Source Type==='Groupage'` | weekly_natl.js |
| Δ3 «Καθαρισμός» δεν επανέφερε status Pending | `_wnClear` → `_wnRevertNoStatus` + φρουρός `_wnDoneLive` | weekly_natl.js |
| Δ4 νεκρός «Διαχωρισμός» | `_wnSplit` + item + export διαγράφηκαν | weekly_natl.js |
| (νέο) `_wnToggleStops` groupage: φίλτραρε GL με `Source National Order/Order` που το Groupage δεν έχει | κλειδί `Source Consolidated Load` (ζητείται πλέον στο `fields` του `_wnLoadAll`) | weekly_natl.js |
| (νέο) φρουρός εκτέλεσης μόνο στην αφαίρεση ανάθεσης | `_wnDoneLive` πριν από `_wnSaveFromPopover`, `_wnSaveMatch`, `_wnUnmatch`, `_wnClear` — Delivered/Cancelled = τίποτα δεν γράφεται, toast | weekly_natl.js |
| (νέο) «Εκτύπωση» μενού ανόδου καλούσε `_wnPrint('southnorth')` (διαβάζει matchedId=null) | `_wnPrintSn(snId)` όπως το ⎙ της γραμμής | weekly_natl.js |
| (νέο) μετά την αποθήκευση από το Weekly η φόρμα γύριζε στη λίστα παραγγελιών | `submitNatlOrder`: `renderWeeklyNatl()` όταν `currentPage==='weekly_natl'` | orders_natl.js |

## Τρεις διορθώσεις που βρήκε ΜΟΝΟ ο ζωντανός έλεγχος (το rig δεν τις έπιανε)
1. Η καρτέλα άνοιξε **χωρίς στυλ**, με τίτλο **«pVxYar»** (6 χαρακτήρες του id πελάτη) και **«Φόρτωση —»**: το `<style id="oiStyles">`, ο χάρτης
   πελατών των form-helpers, οι τοποθεσίες και η cache στάσεων ανά παραγγελία στήνονται μόνο από τη σελίδα Διεθνών Παραγγελιών.
   → `openIntlReadOnlyCard` φορτώνει τα τέσσερα μόνη της (`_oiEnsureStyles`, `fhLoadLocations`, `fhBatchResolveClients`, `stopsLoad`).
2. Το κλείσιμο άφηνε κρυφό πάνελ → `_oiCloseCard` **αφαιρεί** τη floating καρτέλα (η στατική της σελίδας Διεθνών μόνο κρύβεται, όπως πριν).
3. Ανοιχτή floating καρτέλα + αλλαγή σελίδας = δύο `#intlDetail` (το ίδιο id με το στατικό της σελίδας Διεθνών) → MutationObserver στο `#content`
   αφαιρεί τη floating στην πρώτη επαναζωγράφιση (ο router δεν έχει hook· δεν αγγίχτηκε).
Το rig είχε 4/4 πράσινα σε όλα αυτά — «η απόδειξη είναι ο πίνακας/η οθόνη του owner, όχι το πράσινο».

## Απόδειξη
- **Rig** `scratchpad/wn-multistop` (Playwright, stubs, HAR): 4/4 — 2 νέα tests «κλικ ανά πηγή» (dispatcher + management), 2 παλιά (πολυστάσιο).
- **Ζωντανά** (Chrome owner, Pages, ρόλος owner, 14/9 15:10–15:30): εβδ. 38 = 6 VS (6 σήματα)· εβδ. 37 = 8 VS + 1 γνήσια + 1 GRP·
  κλικ ΕΘΝ → «Επεξεργασία εθνικής παραγγελίας» recRXCswojqFcCNRF (ΦΙΤΟΥ, VERMION FRESH → SKLAVENITIS)· κλικ GRP → φόρμα recKu4882uy9jNBFE
  (μέσω GL)· κλικ VS → καρτέλα «DPS LOGISTICS Α.Ε» με διαδρομή 7/9 Voitsberg → 14/9 Aspropyrgos, `[onclick]` = μόνο `_oiCloseCard`/`navigate`,
  0 ενέργειες· κλείσιμο → 0 `#intlDetail`· δεξί κλικ ΕΘΝ = Επεξεργασία/Ανάθεση/Εκτύπωση/…, χωρίς Διαχωρισμό· δεξί κλικ VS χωρίς Επεξεργασία·
  φίλτρο Groupage = μόνο η GRP γραμμή. Έλεγχοι γονικού: Διεθνείς Παραγγελίες → κανονική καρτέλα με 4 ενέργειες ✓· Weekly Διεθνών → `_wk3Edit`
  ανοίγει τη φόρμα ✓ (κλείστηκε χωρίς αποθήκευση)· καρτέλα ανοιχτή + αλλαγή σελίδας → αφαιρείται (1789388621).
- **Βάση:** `audit_log` 5.144 γραμμές πριν· στο τέλος 5.147 — οι 3 νέες είναι του dispatcher pantelis (σφράγιση στάσης + trigger + παραγγελία → Delivered, 15:28, πραγματική δουλειά ράμπας)· **0 γραμμές από τον owner** = 0 εγγραφές από τον έλεγχο (SELECT count / actor).
- **Commits main:** 0170c32 · af7480d · 45a5640 · 7093f99 · a51e5ee (bump 1789387831) · 756108e · 000e80c (1789387993) · 4dec4fe (1789388363) · e1369b3 (1789388621).

## Ανοιχτά
- «+ Groupage» στη γραμμή εργαλείων (owner: εκκρεμεί).
- Μέθοδος: το φυσικό κλικ του συντονιστή σε συντεταγμένες screenshot δεν προσγειώθηκε στη γραμμή (μετατόπιση διάταξης μεταξύ screenshot
  και κλικ)· ο έλεγχος έγινε με DOM click στην ίδια αλυσίδα handlers. Δεν είναι ελάττωμα της οθόνης — σημειώνεται για τη μέθοδο.
