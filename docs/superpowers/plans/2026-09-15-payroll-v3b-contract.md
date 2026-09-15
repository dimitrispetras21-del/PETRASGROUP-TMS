# Μισθοδοσία v3β — συμβόλαιο DOM/API (S3, 15/9/2026)

Προσθήκη πάνω στο [2026-09-14-payroll-v3-contract.md](2026-09-14-payroll-v3-contract.md) — ό,τι δεν
αναφέρεται εδώ μένει όπως εκεί. Πηγή: brief συντονιστή `docs/design/2026-09-15-thodoris-screens-brief.md`
(Ομάδα 4) + τρεις αποφάσεις owner 15/9 μέσω συντονιστή (α ΝΑΙ, β ΝΑΙ, γ ΝΑΙ-αργότερα).

## Αρχική (view home)

| Στοιχείο | Συμβόλαιο |
|---|---|
| φίλτρο μήνα (β) | `.dl-kpi-foot` έχει `#dlHomePrev` «‹» · `#dlHomeMonth` (κείμενο «Σεπτέμβριος 2026») · `#dlHomeNext` «›» · `#dlHomeToday` «Σήμερα» (ορατό μόνο όταν ο μήνας ≠ τρέχων). Κάθε αλλαγή = ΝΕΟ `GET /costs/ledger?month=YYYY-MM` (ο Worker αθροίζει)· τα KPI «Δρομολόγια μήνα»/«Πληρωμές μήνα», τα mini-stats κάθε κάρτας και ο υπότιτλος `.dl-kpi-sub` ακολουθούν τον επιλεγμένο μήνα. «Οφειλή σήμερα» και «Χωρίς αξία» ΔΕΝ αλλάζουν (είναι σύνολα έως σήμερα). `renderPayroll()` ξαναρχίζει από τον τρέχοντα μήνα. |
| KPI «Χωρίς αξία» | `.dl-kpi-tile[data-kpi="pending"]` παραμένει toggle ταξινόμησης, αλλά με ορατή affordance: υπο-γραμμή `.dl-kpi-hint` («δείξε πρώτα ›» ανενεργό / «πρώτα στη λίστα ✓» ενεργό) και hover περίγραμμα. Όταν εγκριθεί το Figma της ουράς, το κλικ θα ανοίγει την ουρά (`renderPayrollPending`) — ΟΧΙ σε αυτή τη φάση. |
| λίστα dl_v_rt_gap | Όταν `gap > 0`: block `.dl-gap` κάτω από το `.dl-kpi-foot`, τίτλος `.dl-gap-title` «N δρομολόγια χωρίς γραμμή μισθοδοσίας», μία `.dl-gap-row[data-rt=<rt_id>]` ανά RT με όνομα οδηγού (από `_dl.balances`), ημερομηνία `date_start` (DD/MM) και κουμπί `.dl-gap-link` «Σύνδεση» → `POST /costs/ledger {driver_id, entry_type:'trip', entry_date:<date_start>, rt_id}` → refetch. Ο κωδικός RT μόνο σε `title=`. Όταν `gap === 0` το block ΑΠΟΥΣΙΑΖΕΙ. |
| modal | `#dlOverlay` + `#dlModal` υπάρχουν σε ΚΑΘΕ view (home/driver/bulk), όχι μόνο στην καρτέλα. |

## Καρτέλα (view driver)

| Στοιχείο | Συμβόλαιο |
|---|---|
| RTs χωρίς γραμμή | Όταν `rts.length > 0`: block `.dl-rts` ανάμεσα στο `.dl-period` και το `.dl-ledger`, τίτλος `.dl-rts-title` «N δρομολόγια χωρίς γραμμή», μία `.dl-rts-row[data-rt=<rt_id>]` με ημερομηνία (DD/MM) και `.dl-rts-link` «Σύνδεση» → `POST /costs/ledger {driver_id, entry_type:'trip', entry_date:<date_start>, rt_id}` → refetch εγγραφών + ισοζυγίων. Κωδικός RT μόνο σε `title=`. Απουσιάζει όταν `rts` κενό. |
| αιτιολογία (modal) | ΚΑΝΕΝΑ `window.prompt`/`alert`. Διόρθωση γραμμένου ποσού, Ακύρωση και Επαναφορά ανοίγουν `#dlModal` με `#dlReasonTitle`, `#dlReason` (text, υποχρεωτικό), `#dlReasonSave`, `#dlErr`. Κενή αιτιολογία = μήνυμα στο `#dlErr`, κανένα PATCH. Enter στο `#dlReason` = αποθήκευση, Esc/`#dlOverlay` = κλείσιμο χωρίς PATCH. Τα σφάλματα δικτύου πάνε σε `toast(msg,'error')`. |
| Επαναφορά ακύρωσης (α) | Ακυρωμένη γραμμή (`.dl-row.canc`) ΕΧΕΙ `.dl-more` ΜΟΝΟ για `ROLE` owner ή management, με μοναδικό στοιχείο μενού `.dl-menu-restore` «Επαναφορά» (υπότιτλος «Η κίνηση ξαναμετρά στο υπόλοιπο») → modal αιτιολογίας → `PATCH /costs/ledger/:id {restore:true, reason}`. Για accountant η ακυρωμένη γραμμή δεν έχει `.dl-more` (όπως σήμερα). |
| τύπος οδηγού | Στο hero, όταν `type` κενό: `#dlTypeLink` «Ορισμός τύπου →» (αντί για «—») → `dlOpenDriverForm(driverId)`: `GET /costs/lookups` → `legacy_id` του οδηγού → `navigate('drivers')` → όταν φορτώσει `_entityState.drivers.records` → `openEntityEdit('drivers', legacy_id)`. Χωρίς αλλαγή στο entity.js. Αν δεν βρεθεί legacy_id → `toast(...,'error')`. |

## Μαζική πληρωμή (view bulk)

| Στοιχείο | Συμβόλαιο |
|---|---|
| «Ίδιο ποσό σε όλους» | Αντί για `window.prompt`: `#dlModal` με `#dlReasonTitle` «Ίδιο ποσό σε όλους», `#dlReason` (type=number, step 0.01), `#dlReasonSave`. Ποσό ≤0/κενό = `#dlErr`, καμία αλλαγή. |

## Worker (πηγή, deploy από owner μετά τις 15:00)

| Διαδρομή | Αλλαγή |
|---|---|
| `PATCH /costs/ledger/:id {restore:true, reason}` | ρόλος owner **ή management** (ήταν owner-only, ~3381)· audit `action:'update'` όπως σήμερα, `after.reason` = αιτιολογία. |
| `GET /costs/ledger?pending=1` | ΝΕΟ: `{ records: [...] }` = όλες οι ζωντανές εκκρεμείς γραμμές (`dl_v_entries` where pending=true, deleted_at null), στήλες `id,driver_id,entry_date,date_end,rt_id,rt_code,route_text,route_legs,advance,expenses`, order `entry_date.desc,id.desc`, limit 2000. Το όνομα οδηγού ενώνεται στον browser από `_dl.balances`. UI της ουράς ΜΟΝΟ μετά την έγκριση Figma. |

## Απόδειξη
`tests/critics/payroll-proof.js` (rig, stubs — 0 εγγραφές): κάθε γραμμή των πινάκων = τουλάχιστον ένας έλεγχος.
Ζωντανά (Chrome owner, SELECT μόνο): gap block απών όταν dl_v_rt_gap=0, φίλτρο μήνα Αύγουστος = SELECT.
