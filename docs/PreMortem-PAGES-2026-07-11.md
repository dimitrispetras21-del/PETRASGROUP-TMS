# Pre-Mortem ανά σελίδα — ολόκληρο το TMS

_2026-07-11 · Σενάριο ανά σελίδα: «6 μήνες μετά, η σελίδα απέτυχε — κανείς δεν
την εμπιστεύεται ή προκάλεσε ζημιά. Τι πήγε στραβά;» · Βάση: router registry
(28 σελίδες), docs/KNOWN_ISSUES.md, audits, spec. Verdict: 🔴 απαιτεί δράση ·
🟡 παρακολούθηση · 🟢 ΟΚ._

## Συγκεντρωτικός πίνακας

| Σελίδα | Verdict | #1 κίνδυνος |
|---|:---:|---|
| Weekly International | 🔴 | Race conditions στο assignment + μελλοντική πηγή round trips |
| Weekly National | 🔴 | 3 διαφορετικά value-sets στο Direction + VS split |
| International Orders | 🔴 | Ποιότητα `Price` = το μελλοντικό revenue του PnL |
| National Orders | 🔴 | Hard-delete bug (στο Stage-1 scope της Valuedriven) |
| Invoicing | 🔴 | Client-side αρίθμηση τιμολογίων → πιθανά διπλά νούμερα |
| CEO Dashboard | 🔴 | Roles client-side — το «owner-only» δεν ισχύει πραγματικά σήμερα |
| TRUCKS (entity) | 🔴 | Υγιεινή πινακίδων = προϋπόθεση του allocation engine |
| Dashboard | 🟡 | KPIs πάνω σε ~1.090 test records |
| National Pick Ups | 🟡 | Iframe: δύο repos, δύο deploys, drift |
| Daily Ramp Board | 🟡 | Tablet UX + ορφανά RAMP records από cascades |
| Entity pages (λοιπά) | 🟡 | Πεδίο-παγίδες (Adress κ.λπ.) |
| Driver Payroll | 🟡 | Δύο πηγές αλήθειας για αμοιβή οδηγού (payroll vs trip) |
| Maintenance (όλα) | 🟡 | Credits εξαντλούνται σιωπηλά → νεκρό OCR· φτωχό ιστορικό €/km |
| Pallet Ledger/Upload | 🟡 | Ισοζύγια παλετών με test data· διορθώσεις χωρίς audit trail |
| Trash / Error Log | 🟡 | Soft-delete ασυνέπεια· log 200 εγγραφών μόνο τοπικά |
| Daily Ops Plan | 🟢 | Παράγωγο των weekly — μικρό δικό του ρίσκο |
| My Performance | 🟢 | Ίδια δεδομένα με dashboard, χαμηλό stake |
| Settings / Metrics Audit | 🟢 | Read-mostly |
| Costs (soon) | 🟢 | Placeholder — καλύφθηκε από PreMortem-COSTS |

## Καθολικοί κίνδυνοι (χτυπούν ΟΛΕΣ τις σελίδες)

1. **S1 Tokens στον browser** (Airtable PAT + Anthropic key στο config.js) —
   λύνεται από Valuedriven Stage 1 (API proxy). Μέχρι τότε: κάθε σελίδα είναι
   όσο ασφαλής είναι ο υπολογιστής κάθε χρήστη.
2. **S2 Χωρίς backups** — ένα λάθος bulk-delete = 7 μέρες Airtable snapshot ή
   τίποτα. Χτυπάει ό,τι γράφει δεδομένα.
3. **S3 ~1.090 test records** — μολύνουν ΚΑΘΕ σελίδα με KPIs/σύνολα
   (Dashboard, CEO, Performance, Pallet Ledger, Invoicing aging).
4. **A4 Roles client-side** — με το χθεσινό «PnL owner-only» (SPEC §10.2 #11)
   αυτό αναβαθμίστηκε από αποδεκτό σε 🔴: όποιος αλλάξει το localStorage
   βλέπει ό,τι βλέπεις εσύ. Λύση: Worker JWT (S1) τώρα, RLS στο v2.
5. **A1 Sync χωρίς transaction** — η αλυσίδα ORDERS→NO→GL→CL→NL→RAMP
   αφήνει ορφανά σε αποτυχία· `cleanupOrphans()` μόνο από console.
6. **A5 Anthropic credits** — τελειώνουν σιωπηλά → νεκρώνουν όλα τα AI
   (σκαναρίσματα orders/pallets/maintenance, Νάκης) την ίδια στιγμή.

---

## Ανά σελίδα

### 1. Weekly International — 🔴
Η καρδιά του TMS (1.814 γρ.) και, στο v2, **η γεννήτρια των διεθνών round
trips** — ό,τι λάθος γίνεται εδώ γίνεται λάθος στο PnL.
- 🐯 Τα drag&drop assignments γράφουν με `atPatch` χωρίς version-check (A3):
  δύο dispatchers στην ίδια εβδομάδα → η δεύτερη αποθήκευση σβήνει σιωπηλά
  την πρώτη. Στο μέλλον αυτό αλλοιώνει και το trip PnL.
- 🐯 Groupage «merge orders → one leg» (νέα απαίτηση spec) δεν υπάρχει ακόμα
  στο UI — τα groupage round trips δεν θα φτιάχνονται σωστά (COSTS E2).
- 🐘 Ποιος ελέγχει ότι export+import ταιριάστηκαν σωστά πριν «γεννηθεί» το
  round trip; Το re-match πρέπει να συμπαρασύρει τα κόστη (spec ✓, UI ;).

### 2. Weekly National — 🔴
- 🐯 Το `Direction` έχει ΤΡΙΑ value-sets (Export/Import · North→South ·
  ΑΝΟΔΟΣ/ΚΑΘΟΔΟΣ). Ένα λάθος γράψιμο → η εγγραφή εξαφανίζεται από φίλτρα
  χωρίς error. Ήδη γνωστή παγίδα (M1) — στο v2 γίνεται ενιαίο enum.
- 🐯 Το VS split (X=650/850) υλοποιείται εδώ: λάθος στο εθνικό σκέλος
  → λάθος revenue σε ΔΥΟ round trips ταυτόχρονα.
- 🐘 Weekly National = «single source of truth for national» — αλλά το
  National Pick Ups (iframe) γράφει στα ίδια δεδομένα από άλλο repo.

### 3. National Pick Ups (iframe) — 🟡
- 🐯 Δύο codebases (TMS + petras-assign), δύο deploys, κοινοί πίνακες: μια
  αλλαγή schema που περνάει στο ένα και όχι στο άλλο σπάει το δεύτερο
  σιωπηλά. Το GL never-delete rule πρέπει να τηρείται και στα δύο.
- 🐘 Το iframe κληρονομεί auth; Αν όχι, είναι παράθυρο που παρακάμπτει ρόλους.

### 4. Daily Ops Plan — 🟢
Παράγωγη όψη των weekly. Κίνδυνος μόνο κληρονομικός (αν τα weekly είναι
λάθος, το πρωινό πλάνο είναι λάθος) — δικό της ρίσκο μικρό.

### 5. Daily Ramp Board — 🟡
- 🐯 Χρήση σε tablet αποθήκης, αλλά το responsive είναι το πιο αδύναμο σημείο
  του app (βλ. UI audit 2/4) — touch targets/οριζόντιο scroll στην πράξη.
- 🐯 Τα RAMP records κρέμονται από cascades με hard deletes (A6): restore
  παραγγελίας → ορφανές/λάθος γραμμές στη ράμπα το ίδιο πρωί.

### 6. International Orders — 🔴
Το μεγαλύτερο module (2.640 γρ.), πηγή της αλυσίδας sync ΚΑΙ του αυριανού revenue.
- 🐯 Το `Price` δεν είναι υποχρεωτικό πουθενά → στο v2 γίνεται ΤΟ revenue του
  TRIP PnL (spec §4). Κενό Price = λάθος margin με αέρα αξιοπιστίας (COSTS E4).
  Πρόταση: gate στο v2 — round trip δεν κλείνει με κενό Price.
- 🐯 Veroia Switch on/off + delete/restore = ο πιο επικίνδυνος cascade (A1).
- 🐯 Scan pipeline: εξαρτάται από key στον browser (S1) + credits (A5).

### 7. National Orders — 🔴
- 🐯 **Hard-delete bug** — ρητά στο Stage-1 scope της Valuedriven («Fix the
  hard-delete bug in national orders»). Μέχρι το fix: διαγραφές εδώ είναι
  μη αναστρέψιμες με πιθανά ορφανά GL.
- 🐯 Direction arrows (`North→South`) — copy/paste ή import χωρίς το σωστό
  χαρακτήρα βέλους σπάει φίλτρα σιωπηλά.

### 8. Entity pages (Locations, Clients, Partners, Drivers, Workshops) — 🟡 / TRUCKS+Trailers — 🔴
- 🐯 **TRUCKS/TRAILERS: η υγιεινή της πινακίδας είναι προϋπόθεση του
  allocation engine** (COSTS T7). Διπλά, κενά ή ανορθόγραφα plates σήμερα =
  unallocated κόστη αύριο. Πρόταση: μικρό hygiene πέρασμα + κανόνας «η
  πινακίδα γράφεται ΧΩΡΙΣ κενά/παύλες, κεφαλαία».
- 🐯 Πεδίο-παγίδες (M1): `Adress` με ένα d σε PARTNERS/CLIENTS — κάθε νέος
  developer/agent θα το «διορθώσει» και θα σπάσει τα πάντα.
- 🐘 Reference tables μένουν Airtable στο v2 → αυτές οι σελίδες μένουν ζωντανές
  και ΜΕΤΑ τη μετάβαση· αξίζουν τα UI-v3 fixes περισσότερο απ' όσο φαίνεται.

### 9. Driver Payroll — 🟡
- 🐯 Στο v2 το driver pay γίνεται per-trip πεδίο στο PnL (spec §10.1#5). Αν το
  Payroll κρατά μηνιαία ποσά κι εκείνο per-trip ποσά, έχουμε ΔΥΟ πηγές
  αλήθειας → διπλομέτρηση κόστους οδηγού. Πρέπει να οριστεί ποια είναι η
  κανονική (πρόταση: per-trip στο PnL, το Payroll τα αθροίζει).

### 10. Maintenance (Dashboard, Work Orders, Expiry, Service, Histories) — 🟡
- 🐯 Το χθεσινό AI scan πεθαίνει σιωπηλά όταν τελειώσουν credits (A5) — η
  Αλεξία/Θοδωρής θα γυρίσουν στο χαρτί χωρίς να το πει κανείς. Θέλει banner.
- 🐯 Το calibrated €/km (SPEC item 10) θέλει 12μηνο ιστορικό με Cost+km — τα
  ΠΑΛΙΑ service records είναι προαιρετικά πεδία → το ιστορικό ξεκινά φτωχό.
  Πρόταση: μίνι backfill μόνο Cost+km στα φετινά records (λίγες ώρες).
- 🐯 Expiry inline edits με σκέτο atPatch (A3) — σπάνιο race, μικρή ζημιά.

### 11. Invoicing — 🔴
- 🐯 Η αρίθμηση τιμολογίων (`_invNextNumber`) υπολογίζεται client-side: δύο
  χρήστες τιμολογούν ταυτόχρονα → **διπλός αριθμός τιμολογίου** — λογιστικό/
  φορολογικό πρόβλημα, όχι bug οθόνης. Μέχρι το v2: κανόνας «τιμολογεί ένας».
- 🐯 Aging buckets από ημερομηνίες παράδοσης που δεν συμπληρώνονται πάντα →
  «καθυστερημένα» που δεν είναι (ή το ανάποδο).

### 12. Pallet Ledger + Pallet Upload — 🟡
- 🐯 Τα ισοζύγια παλετών με πελάτες είναι χρήμα: test data (S3) + διορθώσεις
  χωρίς μόνιμο audit trail (A2: 200 τοπικές εγγραφές) = διαφωνία με πελάτη
  χωρίς αποδείξεις. Το v2 audit table το λύνει — να συμπεριληφθεί ρητά.
- 🐯 AI extraction: S1/A5 όπως όλα τα scans.

### 13. Dashboard — 🟡 & My Performance — 🟢
- 🐯 Και τα δύο μετράνε πάνω στη μολυσμένη βάση (S3) — το cleanup των 1.090
  test records είναι προϋπόθεση για να σημαίνουν κάτι τα νούμερα.

### 14. CEO Dashboard — 🔴
- 🐯 Με τον νέο κανόνα «owner-only» (§10.2 #11): σήμερα ο περιορισμός είναι
  μόνο client-side (A4) — de facto ΔΕΝ ισχύει απέναντι σε αποφασισμένο χρήστη.
  Βραχυπρόθεσμα: Worker JWT (S1 fix της Valuedriven Stage 1). Στο v2: RLS.
- 🐯 «Top loss-making routes» placeholder → κουμπώνει στο TRIP PnL (Phase 2).

### 15. Settings / Metrics Audit / Trash / Error Log — 🟡
- 🐯 Trash: υπόσχεται restore, αλλά τα cascades κάνουν και hard deletes (A6)
  → ο χρήστης εμπιστεύεται έναν κάδο που δεν πιάνει τα πάντα.
- 🐯 Error Log: 200 εγγραφές, μόνο στον browser του καθενός (A2) — τα
  στοιχεία ενός περιστατικού εξαφανίζονται. Το v2 Sentry/audit το λύνει.

### 16. Costs (soon) — 🟢
Placeholder χωρίς κώδικα. Πλήρες pre-mortem: `PreMortem-COSTS-2026-07-11.md`.

---

## Τι να κάνεις με όλο αυτό (προτεραιότητες)

1. **Επιβεβαίωση με Valuedriven** ότι το Stage-1 scope τους καλύπτει: S1
   proxy+rotation, A4 server-side roles (κρίσιμο για το owner-only), το
   natl hard-delete bug, A1 write-pattern unification — είναι ήδη στο
   proposal τους· ζήτα τα ρητά στο kickoff checklist.
2. **Πριν το PnL go-live:** S3 cleanup (1.090 records) + TRUCKS plate hygiene
   + κανόνας Price-υποχρεωτικό — και τα τρία είναι προϋποθέσεις σωστών αριθμών.
3. **Άμεσοι μικροί κανόνες λειτουργίας (μηδέν κώδικας):** τιμολογεί ένας
   χρήστης τη φορά· μία εβδομάδα ανά dispatcher στο Weekly· deprecated
   trip_costs.html δεν χρησιμοποιείται (banner μπήκε).
4. **Μικρά quick-wins όταν ξεπαγώσει το app:** credits-low banner (A5),
   cap στο chat history (A2), progress bar στα bulk (M3).
