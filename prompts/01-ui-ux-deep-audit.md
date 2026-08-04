ΑΠΟΣΤΟΛΗ: Βαθύ audit design (UI/UX) ΚΑΙ λειτουργίας του PETRASGROUP-TMS, σελίδα ανά σελίδα, με συγκεκριμένες προτάσεις βελτίωσης για κάθε μία σελίδα χωριστά.

ΡΟΛΟΣ
Είσαι senior product designer + UX engineer με 15 χρόνια σε B2B operational software (TMS, WMS, ERP, dispatch consoles). Δεν κάνεις "ωραία γραφικά" — σχεδιάζεις εργαλεία που δουλεύουν άνθρωποι 9 ώρες τη μέρα, υπό πίεση, με πολλά δεδομένα στην οθόνη. Το app είναι σε καθημερινή παραγωγική χρήση από την ομάδα Petras. Κάθε πρόταση κρίνεται με το ερώτημα: "αυτό κάνει τη δουλειά του dispatcher πιο γρήγορη/ασφαλή, ή απλώς πιο όμορφη;"

ΚΑΝΟΝΕΣ (μη διαπραγματεύσιμοι)
1. READ-ONLY. Καμία αλλαγή σε .js/.css/.html. Κανένα commit, κανένα push. Γράφεις ΜΟΝΟ νέα αρχεία τεκμηρίωσης στο docs/design/DEEP_AUDIT_2026-08-04/.
2. Καμία γενικολογία. Απαγορεύονται προτάσεις τύπου "βελτιώστε το UX", "πιο μοντέρνο look", "προσθέστε whitespace". Κάθε εύρημα πρέπει να έχει: (α) απόδειξη — αρχείο:γραμμή ή screenshot ή μέτρηση, (β) τι σπάει — ποιος χρήστης, σε ποια εργασία, χάνει τι, (γ) τι ακριβώς αλλάζει — όνομα CSS token / selector / component / ροή κλικ.
3. Μην επαναλάβεις παλιά ευρήματα. Διάβασε ΠΡΩΤΑ τα υπάρχοντα audits. Ό,τι έχει ήδη καταγραφεί αναφέρεται μόνο ως "ανοιχτό από 3/8" σε μία γραμμή. Η προστιθέμενη αξία σου είναι το per-page βάθος, που δεν υπάρχει πουθενά.
4. Λειτουργία = ισότιμη με design. Κουμπί που λείπει, ροή 7 κλικ που θα ήταν 2, μη αναστρέψιμο delete χωρίς undo — μετράνε όσο ένα contrast failure.
5. Σεβασμός στην ταυτότητα. Navy #0B1929/#080F1A, Cold Chain Blue #0284C7, Syne + DM Sans. Δεν προτείνεις rebrand — προτείνεις ΠΕΙΘΑΡΧΙΑ στο υπάρχον σύστημα.
6. Ρεαλισμός υλοποίησης. Vanilla JS SPA, χωρίς build step, χωρίς framework, Airtable/Postgres πίσω. Καμία πρόταση δεν επιτρέπεται να απαιτεί React/Tailwind/bundler.
7. Ελληνικά στην πρόζα, αγγλικά σε κώδικα/ονόματα αρχείων/tokens.

ΒΗΜΑ 0 — CONTEXT LOADING (πριν από οτιδήποτε άλλο)
Διάβασε με αυτή τη σειρά:
- CLAUDE.md, docs/README.md, ARCHITECTURE.md (αν υπάρχει)
- docs/design/UI_UX_AUDIT_2026-07-11.md και docs/design/UI_UX_AUDIT_2026-08-03.md  ← η βάση σου
- docs/KNOWN_ISSUES.md, docs/AUDIT-2026-08-03.md
- docs/premortems/README.md και το PreMortem-<page>.md της κάθε σελίδας ΠΡΙΝ την ελέγξεις
- assets/style.css (5.700 γραμμές — χαρτογράφησε tokens, όχι γραμμή-γραμμή)
- core/router.js (NAV groups + routing), core/ui.js, core/entity.js (generic CRUD engine), core/command-palette.js, core/command-center.js, config.js (PERMS/USERS/ρόλοι)
Γράψε μισή σελίδα "τι ήδη ξέρουμε" στο INDEX.md πριν προχωρήσεις.

ΒΗΜΑ 1 — LIVE ΠΕΡΙΗΓΗΣΗ (υποχρεωτικό, όχι προαιρετικό)
Το audit ΔΕΝ γίνεται μόνο από κώδικα. Πρέπει να δεις τις σελίδες.
Ξεκίνα preview με το υπάρχον config: preview_start με name "tms-static" (http://localhost:8765/index.html).
Login με demo λογαριασμούς ανά ρόλο (ορισμένοι στο config.js): demo_owner, demo_management, demo_dispatcher, demo_accountant. Αν ο κωδικός δεν δουλεύει, ΣΤΑΜΑΤΑ και ρώτα τον Δημήτρη — μην μαντεύεις, μην πειράζεις hashes.
Για κάθε σελίδα:
- screenshot σε desktop 1440, tablet 1024, mobile 390 (resize_window)
- read_page για δομή/aria/ονόματα controls
- read_console_messages για σφάλματα που βλέπει ο χρήστης
- δοκίμασε τουλάχιστον μία πραγματική ροή (άνοιγμα form, φίλτρο, drag, modal) ΧΩΡΙΣ αποθήκευση/διαγραφή δεδομένων — ακύρωνε πάντα με Esc/Cancel
- έλεγξε κάθε σελίδα ως τουλάχιστον 2 ρόλους όπου τα δικαιώματα διαφέρουν
Αν μια σελίδα δεν φορτώνει τοπικά, κατέγραψέ το ρητά ως "δεν ελέγχθηκε live — μόνο code review". Ποτέ μην παρουσιάσεις code review ως live εύρημα.

ΒΗΜΑ 2 — ΟΙ ΣΕΛΙΔΕΣ (30 routes — καμία δεν παραλείπεται)
1  dashboard — Dashboard — modules/dashboard.js
2  weekly_intl — Weekly International — modules/weekly_intl.js
3  weekly_natl — Weekly National — modules/weekly_natl.js
4  weekly_pickups — National Pick Ups — iframe προς petras-assign/national_consolidation.html
5  daily_ops — Daily Ops Plan — modules/daily_ops.js
6  daily_ramp — Daily Ramp Board — modules/daily_ramp.js
7  orders_intl — International Orders — modules/orders_intl.js
8  orders_natl — National Orders — modules/orders_natl.js
9  locations — Locations — modules/locations.js
10 clients — Clients — core/entity.js
11 partners — Partners — core/entity.js
12 drivers — Drivers — core/entity.js
13 payroll — Driver Payroll — coming soon
14 maint_dash — Maintenance/Dashboard — modules/maintenance.js
15 maint_req — Work Orders — modules/maintenance.js
16 maint_expiry — Expiry Alerts — modules/maintenance.js
17 maint_svc — Service Records — modules/maintenance.js
18 trucks — Trucks — core/entity.js
19 trailers — Trailers — core/entity.js
20 workshops — Workshops — core/entity.js
21 maint_trucks — Trucks History — modules/maintenance.js
22 maint_trailers — Trailers History — modules/maintenance.js
23 invoicing — Invoicing — modules/invoicing.js
24 pallet_ledger — Pallet Ledger — modules/pallet_ledger.js
25 costs / fuel / pl / costs_dash — Costs (soon) — coming soon
26 ceo_dashboard — CEO Dashboard — modules/ceo_dashboard.js
27 performance — My Performance — modules/performance.js
28 settings + trash + error_log — Admin — app.html / inline
29 metrics_audit — Metrics Audit — modules/metrics_audit.js
30 audit_trail — Audit Trail — modules/audit_trail.js
Επιπλέον, ως ξεχωριστές "σελίδες":
- index.html (login: πρώτη εντύπωση, error states, mobile)
- print.html (έντυπη έξοδος)
- GLOBAL SHELL: sidebar, topbar/breadcrumbs, command palette (Cmd+K), AI chat (core/ai-chat.js), Command Center, toasts/modals/skeletons
- Pallet Upload (modules/pallet_upload.js) αν είναι προσβάσιμο από UI
Για τα coming soon: μην γράψεις "δεν υπάρχει". Γράψε τι ΠΡΕΠΕΙ να δείχνει η σελίδα όταν φτιαχτεί και πώς πρέπει να μοιάζει το placeholder σήμερα.

ΒΗΜΑ 3 — TEMPLATE ΑΝΑ ΣΕΛΙΔΑ (υποχρεωτικό, ίδιο για όλες)
Ένα αρχείο ανά σελίδα: docs/design/DEEP_AUDIT_2026-08-04/<route>.md με ΑΚΡΙΒΩΣ αυτές τις 9 ενότητες:
1. ΣΕ ΤΙ ΧΡΗΣΙΜΕΥΕΙ — ποιος τη χρησιμοποιεί, πόσο συχνά, τι εργασία ολοκληρώνει, τι συμβαίνει αν αποτύχει. Το "job to be done", όχι περιγραφή κώδικα.
2. ΤΙ ΒΛΕΠΕΙ ΣΗΜΕΡΑ Ο ΧΡΗΣΤΗΣ — περιγραφή οθόνης + screenshot refs. Πυκνότητα πληροφορίας, ιεραρχία, above-the-fold σε 1440 και 1024.
3. ΡΟΕΣ ΕΡΓΑΣΙΑΣ — για τις 2-3 βασικές εργασίες: βήματα & κλικ ΣΗΜΕΡΑ έναντι βήματα & κλικ ΣΤΗΝ ΠΡΟΤΑΣΗ, σε πίνακα. Αν δεν μειώνεται τίποτα, πες το ειλικρινά.
4. ΕΥΡΗΜΑΤΑ — πίνακας με στήλες: # | Σοβαρότητα | Κατηγορία | Εύρημα | Απόδειξη (file:line ή screenshot) | Επίπτωση. Κατηγορίες: Λειτουργία, Ιεραρχία/Layout, Τυπογραφία, Χρώμα/Tokens, Κατάσταση (loading/empty/error), Accessibility, Responsive, Consistency, Κόπος χρήστη, Ασφάλεια δεδομένων. Σοβαρότητα: P0 (μπλοκάρει ή κοστίζει λάθη), P1 (καθημερινή τριβή), P2 (γυάλισμα).
5. ΠΡΟΤΑΣΕΙΣ — για κάθε μία: ΤΙ (μία πρόταση, σε ρήμα) / ΓΙΑΤΙ (ποιο εύρημα λύνει, με #) / ΠΩΣ (ακριβώς: ονόματα CSS tokens, selectors, θέση στο DOM, νέα states, μηνύματα κειμένου στα ελληνικά, breakpoints) / ΚΟΠΟΣ (S κάτω από 1h, M μισή μέρα, L πάνω από μέρα) / ΡΙΣΚΟ (τι μπορεί να σπάσει: sync chain, ρόλοι, εκτυπώσεις).
6. ΚΑΤΑΣΤΑΣΕΙΣ ΠΟΥ ΛΕΙΠΟΥΝ — empty, loading (skeleton ή spinner;), error (τι λέει το κείμενο;), μερική αποτυχία, offline, "δεν έχεις δικαίωμα", πολλά δεδομένα (500+ γραμμές), λίγα δεδομένα (1 γραμμή).
7. MOBILE / TABLET — τι σπάει στα 1024 και στα 390. Χρησιμοποιείται όντως σε κινητό; Αν όχι, πες το και μην προτείνεις δουλειά χωρίς αντίκρισμα.
8. ΠΡΙΝ / ΜΕΤΑ — ASCII wireframe ή σύντομο περιγραφικό mock της προτεινόμενης διάταξης. Ένα, όχι δέκα.
9. ΤΙ ΔΕΝ ΠΡΕΠΕΙ ΝΑ ΑΛΛΑΞΕΙ — τι δουλεύει καλά και θα ήταν λάθος να πειραχτεί.

ΒΗΜΑ 4 — CROSS-CUTTING (μετά τις σελίδες, όχι πριν)
Ξεχωριστό αρχείο _CROSS_CUTTING.md:
- Design system: πόσα διαφορετικά hex / font-sizes / spacing values / border-radius / shadows υπάρχουν σήμερα (μέτρησέ τα με grep) και πρότεινε το ΕΛΑΧΙΣΤΟ σύνολο tokens + διαδρομή μετάβασης χωρίς "big bang" refactor.
- Επαναλαμβανόμενα components: πίνακες, φίλτρα, modals, cards, pills/badges, κουμπιά, toasts. Πού αποκλίνουν μεταξύ σελίδων και ποιο πρέπει να γίνει το κανονικό.
- Πλοήγηση & IA: είναι σωστές οι 9 ομάδες του sidebar; Τι θα έβαζες αλλού και γιατί.
- Accessibility baseline: πραγματικές μετρήσεις (aria, :focus-visible, contrast στα 5 χειρότερα ζεύγη, touch targets κάτω από 44px, keyboard traps σε modals/drag-drop).
- Ταχύτητα αντίληψης: πού ο χρήστης περιμένει χωρίς feedback (μέτρησε με network/console).

ΒΗΜΑ 5 — ΠΑΡΑΔΟΤΕΑ (στο docs/design/DEEP_AUDIT_2026-08-04/)
1. INDEX.md — "τι ήδη ξέρουμε", μεθοδολογία, πίνακας 30 σελίδων με σκορ /10 ανά σελίδα (design και λειτουργία ΞΕΧΩΡΙΣΤΑ) και πλήθος P0/P1/P2, ταξινομημένος χειρότερη πρώτα.
2. Ένα .md ανά σελίδα (Βήμα 3).
3. _CROSS_CUTTING.md (Βήμα 4).
4. _ROADMAP.md — όλα τα P0/P1 σε μία λίστα ταξινομημένα κατά (επίπτωση διά κόπο), ομαδοποιημένα σε 3 κύματα: Κύμα 1 = 1 εβδομάδα, Κύμα 2 = 1 μήνας, Κύμα 3 = μετά. Με ρητή εκτίμηση ωρών ανά item.
5. _SCREENSHOTS/ — τα screenshots με ονομασία <route>-<viewport>.png.

ΒΗΜΑ 6 — ΚΛΕΙΣΙΜΟ
Στο τελικό μήνυμα (ελληνικά, max 25 γραμμές):
- Οι 5 αλλαγές που, αν γίνουν μόνο αυτές, δίνουν το 80% του οφέλους — με σελίδα και λόγο.
- Οι 3 χειρότερες σελίδες και σε μία πρόταση το γιατί.
- Τι ΔΕΝ μπόρεσες να ελέγξεις και γιατί.
- Καμία αυτο-συγχαρητήρια περίληψη.

ΠΩΣ ΝΑ ΔΟΥΛΕΨΕΙΣ
Δούλεψε σε παρτίδες ανά ομάδα sidebar: Planning, Daily Ops, Orders, Clients/Partners, Drivers, Maintenance, Fleet, Finance, Insights, Admin, Shell. Μετά από κάθε ομάδα γράψε τα αρχεία της στον δίσκο ΠΡΙΝ προχωρήσεις στην επόμενη — μη συσσωρεύεις όλη τη δουλειά στο τέλος. Κράτα task list με τις 30 σελίδες και σημάδεψε πρόοδο.
Αν χρειαστείς απόφαση που αλλάζει ουσιαστικά το εύρος (π.χ. δεν υπάρχει πρόσβαση σε ρόλο, ή μια σελίδα είναι εντελώς νεκρή), ΡΩΤΑ. Για όλα τα υπόλοιπα, προχώρα και κατέγραψε την υπόθεσή σου.
