# 00 — Χάρτης αποφάσεων · Dashboards (Β1)

**Πηγές (διαβάστηκαν πλήρως, κώδικας του `design/weekly-v2-proto`):**
`modules/dashboard.js` (810 γρ.) · `modules/ceo_dashboard.js` (1.106 γρ.) ·
`modules/performance.js` (889 γρ.) · `modules/metrics_audit.js` (816 γρ.) ·
`modules/maintenance.js:1367-1897` (maint_dash) · `core/command-center.js` (263 γρ.) ·
`core/metrics.js` (583 γρ.) — συν τα κλειστά ευρήματα του `DEEP_AUDIT_2026-08-04`.

> **Μέθοδος:** ο χάρτης είναι προϊόν **code review** — καταγράφει τι υπολογίζει
> και τι δείχνει ο κώδικας, με file:line. Το ζωντανό πέρασμα στο παραγωγικό
> (πραγματικά νούμερα, καταστάσεις, 1366×768) γίνεται στο `01_FINDINGS.md`.
> Ό,τι εδώ σημειώνεται «→ 01» είναι υποψία προς ζωντανή επαλήθευση, όχι εύρημα.

**Ποιος ανοίγει τι** (από τα audit docs 4/8 + τον κώδικα):

| Σελίδα | Ποιος | Πότε | Τι ψάχνει |
|---|---|---|---|
| dashboard | όλοι (default μετά το login) | 5-15×/μέρα, πρωί | «τι καίει σήμερα;» — triage |
| ceo_dashboard | owner μόνο | εβδομαδιαία | «πώς πάει η επιχείρηση, όχι η μέρα» |
| performance | κάθε χρήστης (view όλοι) | εβδομαδιαία | «πώς τα πήγα σε σχέση με τον στόχο» |
| metrics_audit | owner + διαγνώστης | όταν δύο σελίδες διαφωνούν | «ποιο νούμερο είναι το σωστό;» |
| maint_dash | owner + υπεύθυνος στόλου | εβδομαδιαία | «πόσο νόμιμος είναι ο στόλος;» |
| command-center | dispatcher | μέσα στα 2 weekly, καθημερινά στο χτίσιμο | «πόσο έτοιμη είναι η εβδομάδα;» |

---

## 1. dashboard — ανά στοιχείο

| Στοιχείο | Πηγή | Απόφαση που στηρίζει | Ίδιο μέγεθος αλλού |
|---|---|---|---|
| «Εβδομάδα W» στον χαιρετισμό | `currentWeekNumber()` → ISO (`dashboard.js:59,404`) | Προσανατολισμός — «για ποια εβδομάδα μιλάμε» | ΟΛΕΣ οι σελίδες — βλ. §7.1 (4 υλοποιήσεις) |
| Banner «N παραγγελίες χωρίς φορτηγό — 48ω» → weekly_intl | `:365-369` (highRisk) | Άμεση ανάθεση πριν τη φόρτωση | CEO «High Risk 48h» + `metrics.highRiskDeliveries` — **3 διαφορετικοί ορισμοί** (§7.11) |
| Banner «N ληγμένα έγγραφα» → maint_expiry | `:370-374` από fleetAlerts | Άνοιγμα λίστας λήξεων | maint_dash banner, performance `expired_docs` — §7.5 |
| KPI Export/Import χωρίς Ανάθεση (+spark, WoW) | `:64-71` — orders 30ημ, **μόνο `Truck` κενό** (ο Partner ΔΕΝ ελέγχεται) | «πόση δουλειά ανάθεσης εκκρεμεί» → κλικ σε orders_intl φιλτραρισμένο | MA `op.unassigned_export/import` = **άλλος ορισμός** (Truck ΚΑΙ Partner κενά, `metrics.js:40-50`) · chips weekly σελίδων → 01 |
| KPI Αξιοποίηση Στόλου % | `:73-82` — distinct trucks σε orders W-τρέχουσας / ενεργά | «έχω δικά μου διαθέσιμα ή πάω συνεργάτη;» | CC widgetFleet (ίδιος ορισμός, **άλλη εβδομάδα**: Sunday-start) · MA `fleet.utilization` · **ΚΑΙ η κάρτα «Αξιοποίηση στόλου» πιο κάτω στην ΙΔΙΑ σελίδα με άλλον τύπο** (§7.7-7.8) |
| KPI Νεκρά Χιλιόμετρα (μ.ό. ζευγών) | `:92-116` — haversine unload εξαγωγής → load matched εισαγωγής, W-τρέχουσας | «πόσο άδειο γυρνά ο στόλος» → weekly_intl matching | performance `dead_km` (ίδιος αλγόριθμος, αντιγραμμένος) · CEO Dead KM (**άλλη μέθοδος & μονάδα**) · `metrics.deadKmForPeriod` = **stub που επιστρέφει 0** (§7.9) |
| KPI On-Time Παράδοση | `:119-123` — orders με `Delivery Performance` **στο 30ημ παράθυρο fetch** | «κρατάμε τον λόγο μας στους πελάτες;» | performance `on_time` (**all-time**) · CEO Speed (**περίοδος + Actual Delivery Date**) · MA `perf.on_time_pct/_30d` — §7.3, ΔΕΝ διασταυρώνεται σελίδα-προς-σελίδα |
| Κάρτες Αναχωρήσεις / Παραδόσεις (σήμερα/αύριο) | `:126-152` | «τι τρέχει σήμερα» → τηλέφωνα, αποθήκη | daily_ops (εκτός εύρους αυτού του audit) · MA `op.pending_today` κ.λπ. |
| Κάρτα «Αξιοποίηση στόλου» W/W+1 + per-truck + αδρανή | `:154-188` — **usage rate = ημέρες×4.5×4.5** ανά φορτηγό | «ποια φορτηγά κάθονται» → βρες τους δουλειά | performance `fleet_usage` (ίδιος τύπος, δεύτερο αντίγραφο) — ο τύπος ΔΕΝ υπάρχει στο metrics.js (§7.8) |
| Πίνακας «Αναμονή ανάθεσης — aging» (top 10) | `:258-278` | Ποια παραγγελία «σαπίζει» αναρίθμητη | — (μοναδικό) |
| Κάρτα Υψηλός κίνδυνος (top 5) | `:281-285` — unassigned + παράδοση ≤48ω + status ανοιχτό | Ίδια με το banner, σε λίστα | §7.11 |
| Κάρτα Ειδοποιήσεις στόλου (top 6, 30ημ) | `:288-314` — trucks KTEO/KEK/INS + trailers **ATP/INS** | «ποιο έγγραφο λήγει πρώτο» | maint_dash (trailers με **FRC**, δηλωμένη διαφορά στο MA) — §7.5 |
| Κάρτα Συμμόρφωση (8 πρώτα φορτηγά, doc blocks) | `:317-331` | Ματιά νομιμότητας ανά όχημα | maint_dash Fleet Overview + Snapshot — ίδια πληροφορία, τρίτη απόδοση |
| Δαχτυλίδι Εβδομαδιαίο σκορ + 4 μπάρες | `:333-358` — `metrics.weeklyScore` (AR: όλα τα orders της W, OT: 30ημ, Comp: κανονική, DK: πραγματικό)· «—» χωρίς δείγμα | «μία κρίση για την εβδομάδα» | performance κάρτα+γράφημα, MA `biz.weekly_score` — **1 τύπος, 4 συνταγές εισόδων** (§7.2) |
| reportPageMetrics | `:381-390` — 8 κλειδιά | τροφοδοτεί το MA | — |

**Παρατήρηση εμβέλειας δεδομένων:** το dashboard φορτώνει ORDERS **μόνο 30
ημερών** (`:17,23-28`) — άρα και τα sparklines «7 εβδομάδων» (`:190-236`)
βλέπουν στην πράξη ~4 εβδομάδες. → 01.

---

## 2. ceo_dashboard — ανά στοιχείο

| Στοιχείο | Πηγή | Απόφαση | Ίδιο μέγεθος αλλού |
|---|---|---|---|
| Chips περιόδου (Εβδ/Μήνας/Τρίμ/YTD) + «Updated HH:MM · ⚠ δεν φόρτωσε: …» | `:43-65,169-183` | Εμβέλεια όλης της σελίδας | Κανείς άλλος δεν έχει περίοδο — τα υπόλοιπα dashboards είναι κλειδωμένα σε «τρέχουσα εβδομάδα» |
| Brand Promise **Speed** (στόχος ≥98%) | `_calcSpeed :440-454` — παραδοθέντα περιόδου, **Actual Delivery Date** αλλιώς Delivery Performance | «κρατάμε την υπόσχεση ταχύτητας;» | = on-time με τρίτο ορισμό — §7.3 |
| Brand Promise **Quality** (στόχος 100%) | `_calcQuality :456-461` — `Temp Graph Sent` | «στέλνουμε απόδειξη φρεσκάδας;» | πουθενά αλλού |
| Brand Promise **Anxiety** (στόχος 0) | `_calcAnxiety :463-469` — **localStorage** `ceo_anxiety_YYYY_WNN`, χειροκίνητη καταχώρηση `:670-678` | «πόσοι πελάτες αγχώθηκαν;» | πουθενά — και **ζει μόνο στον browser που την κατέγραψε** (όχι στη βάση) → 01 |
| People: Driver Utilization + Διαθέσιμοι + Workload | `:471-480,709-736` — distinct οδηγοί σε orders περιόδου / ενεργοί | «φτάνουν οι οδηγοί; ποιος υπερφορτώνεται;» | πουθενά αλλού (το TMS δεν έχει άλλη προβολή οδηγο-φόρτου) |
| People: Partner Ratio | `:482-489` | «πόσο εξαρτόμαστε από συνεργάτες» | MA `hr.partner_trip_pct` (κανονική, **επί ανατεθειμένων** — ο CEO μετρά επί ΟΛΩΝ) |
| Strategy: Revenue vs Target | `_calcRevenue :491-493` — **`Net Price` όλων** των orders περιόδου (όχι μόνο παραδοθέντων)· στόχος σε localStorage `:646-668` | «πιάνουμε τον στόχο εσόδων;» | Cash Revenue ίδιας σελίδας (delivered+invoiced) · MA `fin.revenue_invoiced` (**`Price`**, μόνο Invoiced) — §7.12 |
| Strategy: Dead KM + spark 8εβδ | `_calcDeadKM :495-522` — πεδία `Dead KM`/`Loaded KM` αλλιώς **ΕΚΤΙΜΗΣΗ** matched×50 + unmatched×600 (badge ESTIMATE) | «πληρώνουμε άδεια χιλιόμετρα;» | dashboard/performance μετρούν με haversine, μ.ό. ανά ζεύγος — **ασύγκριτες μονάδες** (§7.9) |
| Strategy: Top 5 πελάτες | `:524-537` — `Net Price` ανά `Client Name` | «σε ποιον χρωστάμε προσοχή» | πουθενά αλλού |
| Execution: On-Time + spark | επαναχρησιμοποιεί Speed `:350-363` | ↑ | §7.3 |
| Execution: High Risk 48h | fetch `:153` — **κάθε** order με παράδοση <48ω και όχι Delivered/Cancelled — **και τα ανατεθειμένα** | «τι κινδυνεύει τώρα» | dashboard/`metrics` μετρούν μόνο ΑΝΑΘΕΤΑ — 3 ορισμοί (§7.11) |
| Execution: VS Rate | `:539-547` — % exports με Veroia Switch | «πόσο δουλεύει το cross-dock» | πουθενά αλλού |
| Execution: Assigned % | `:549-556` | πληρότητα πλάνου | dashboard assignmentRate, performance plan_complete, MA `hr.assignment_rate` — 4 παραλλαγές (§7.10) |
| Cash: Revenue (Delivered+Invoiced) / Αδρανή τιμολόγια | `_calcCashMetrics :558-567` — `Net Price` | «πόσα λεφτά κάθονται ατιμολόγητα» | invoicing σελίδα (δικοί της μετρητές) · MA `fin.outstanding_balance` (**πεδίο `Price`**) — §7.12 |
| Cash: Maintenance κόστος περιόδου | `_calcMaintCost :569-571` | «μας τρώει ο στόλος;» | maint_dash Monthly Cost (ίδια πεδία, 6μηνη προβολή) — δεν διασταυρώνεται (§7.13) |
| Cash: Partner Margin | `:573-581` — Net Price vs `Partner Rate` | «βγάζουμε κάτι από τους συνεργάτες;» | πουθενά αλλού |
| Cash: Top 3 ζημιογόνες + banner | `_calcLossTrips :583-602` — **TRIP_COSTS (404 σήμερα, δηλωμένο soft-fail)** | «ποια γραμμή χάνει λεφτά» | πουθενά — η αλυσίδα κόστους εκτός εύρους |
| Executive Briefing | `:739-783` — σύνθεση των παραπάνω σε προτάσεις | αφήγηση, όχι νέα πηγή | — |
| reportPageMetrics | **ΔΕΝ ΥΠΑΡΧΕΙ** | — | **Η σελίδα του owner είναι αόρατη στο Metrics Audit** (§8) |

---

## 3. performance — ανά στοιχείο

| Στοιχείο | Πηγή | Απόφαση | Ίδιο μέγεθος αλλού |
|---|---|---|---|
| Κεφαλίδα + επιλογέας εβδομάδας (0…−8) | `:172-174,688-709` — `currentWeekNumber()+offset` | «ποια εβδομάδα κρίνω» | §7.1 |
| 4 KPI ανά χρήστη (org chart `PERF_KPIS_BY_USER :16-59`) | ανά KPI, βλ. κάτω | «πέτυχα τον προσωπικό στόχο;» | οι δείκτες του owner = οι δείκτες του dashboard, με άλλες συνταγές |
| — weekly_score | `:400-425` — `metrics.weeklyScore` (AR: **plan_complete μόνο exports**, OT: **all-time**, Comp: κανονική, DK: πραγματικό)· «—» χωρίς δείγμα | αυτοαξιολόγηση | §7.2 — άλλη συνταγή από το dashboard |
| — fleet_usage | `:195-214` — ημέρες×4.5×4.5 (αντίγραφο του dashboard) | ↑ | §7.8 |
| — dead_km | `:237-262` — haversine (αντίγραφο) | ↑ | §7.9 |
| — on_time | `:181-188` — **όλο το ιστορικό** (atGetAll χωρίς cutoff `:105-114`), −1→«—» | ↑ | §7.3 |
| KPI άλλων ρόλων (π.χ. thodoris `expired_docs :320-329` — **μόνο φορτηγά**, μετρά ΕΓΓΡΑΦΑ) | ανά ρόλο `:16-59` | προσωπικοί στόχοι ρόλων | το `expired_docs` = **4η παραλλαγή** ληγμένων (§7.5)· `natl_profit :348-361` πατά σε Revenue/Cost πεδία NAT_LOADS → 01 |
| Γράφημα «Τάση εβδομαδιαίου σκορ» (4 εβδ) | `_perfTrends :440-480` — ίδιος τύπος, είσοδοι: assignPct exports, OT εβδομάδας, Comp κανονική, **DK=75 σταθερό** | «βελτιώνομαι;» | δηλωμένο στο MA cross-check ως ξεχωριστό κλειδί `weeklyScoreTrend` |
| Πρόσφατες παραδόσεις (10) | `:627-652` | «ποιες ήταν οι αργοπορίες» | — |
| Δαχτυλίδι σκορ + component bars | `:655-656,743-769` | ↑ | ίδια τιμή με την κάρτα (κοινός υπολογισμός) |
| Executive Briefing + Στόχοι (localStorage) | `:659-681` | προσωπική λίστα | — |
| Export CSV | `:869-887` | αρχείο | — |
| reportPageMetrics | `:503-517` — 8 κλειδιά, με διάκριση picker/default week | τροφοδοτεί MA | — |

---

## 4. metrics_audit — ανά στοιχείο

Ο διαιτητής. Δύο σώματα:

**Α. Διασταυρώσεις (`AUDIT_CROSS_CHECKS :66-203` + `_auditCrossCompute :210-278`)** — 8 έλεγχοι:

| # | Έλεγχος | Σελίδες που συγκρίνει | Βάση |
|---|---|---|---|
| 1 | Αριθμός εβδομάδας | dashboard · orders_intl · performance · weekly_intl · weekly_natl | `isoWeekNumber()` κανονική |
| 2 | Ληγμένα έγγραφα | maint_dash · dashboard · maint_expiry | maint_dash (δηλωμένες διαφορές πεδίων) |
| 3 | Οχήματα με ληγμένο | maint_expiry · maint_dash | maint_expiry |
| 4 | Συμμόρφωση % | dashboard · maint_expiry · maint_dash | `metrics.compliancePct` |
| 5 | Εβδομαδιαίο σκορ | performance κάρτα · performance γράφημα · dashboard | performance κάρτα (canonical ενδεικτική) |
| 6 | Καρτέλες τιμολόγησης | invoicing εσωτερικά | σύνολο σελίδας |
| 7 | Expiry «συμμόρφωση vs VALID» | maint_expiry εσωτερικά | αριθμητής συμμόρφωσης |
| 8 | Πλήθος φορτηγών | trucks · dashboard · maint_dash | trucks ενεργά |

**Β. 38 κανονικές μετρήσεις** (`_runAllMetrics :342-506`) σε 7 κατηγορίες, με
αναζήτηση/καρτέλες (`:593-605,756-762`), fail-open προστασία ανά πηγή
(safeFetch `:300-320`, «—» αντί για 0 `:676-685`), Copy JSON με cross-checks
(`:774-810`).

**Απόφαση που στηρίζει:** «σε ποιο νούμερο βασίζομαι;» — και «ποια σελίδα να
διορθώσουμε». Δουλεύει ΜΟΝΟ για ό,τι (α) οι σελίδες αναφέρουν μέσω
`reportPageMetrics` και (β) υπάρχει γραμμή στο `AUDIT_CROSS_CHECKS`. Τι μένει
απ' έξω: §8.

---

## 5. maint_dash — ανά στοιχείο

| Στοιχείο | Πηγή | Απόφαση | Ίδιο μέγεθος αλλού |
|---|---|---|---|
| Banner «N ληγμένα έγγραφα» | `:1627-1630` — `<div>` **χωρίς onclick** (το αντίστοιχο του dashboard έγινε κουμπί — D-2) → 01 | «πόσο άσχημα;» | §7.5 |
| 7 KPI κουμπιά σε **`repeat(6,1fr)`** (`:1633`): ΣΥΝΟΛΟ · ΚΤΕΟ · ΚΕΚ · FRC · ΑΣΦΑΛΕΙΕΣ · <30ΗΜ · ΣΥΜΜΟΡΦΩΣΗ | `:1526-1553,1632-1676` — όλα κλικ → maint_expiry με φίλτρο | «ποιος τύπος εγγράφου καίει» | Σύνολο: §7.6 · ληγμένα: §7.5 · συμμόρφωση: §7.4 (δηλωμένη: trucks+trailers) |
| ΣΕ ΚΑΘΥΣΤΕΡΗΣΗ (top 10 + «Δες τα άλλα N») / ΛΗΓΟΥΝ ΣΥΝΤΟΜΑ (60ημ) | `:1531-1558,1686-1727` — κλιμακωτά «X χρ. ληγμένο» (MD-4 κλειστό) | «ποιο ανανεώνω πρώτα» | maint_expiry (ίδια λίστα, πλήρης — σκόπιμη επικάλυψη μετά το MD-3) |
| Fleet Overview · Trucks (πίνακας KT/KK/INS) | `:1730-1771` | ματιά ανά όχημα | dashboard κάρτα Συμμόρφωση (8 πρώτα) — τρίτη απόδοση της ίδιας πληροφορίας |
| Recent Service (8) | `:1773-1792` | «τι δουλεύτηκε τελευταία» | maint_svc σελίδα |
| Δαχτυλίδι Fleet Compliance | `:1799-1811` — ίδιο ποσοστό με το KPI 7 | ↑ | §7.4 |
| Compliance Snapshot (10 trucks + 5 trailers) | `:1813-1847` | ↑ | ↑ |
| Monthly Cost (6μ, MoM delta, spark, μπάρες) | `_maintMonthlyCost :1434-1464`, `:1849-1873` — `Cost`→`Total Cost` | «πόσο κοστίζει ο στόλος;» | CEO Cash Maintenance (ίδια πεδία, άλλη περίοδος) — δεν διασταυρώνεται (§7.13) |
| reportPageMetrics | `:1594-1603` — 11 κλειδιά (docs ΚΑΙ vehicles χωριστά) | τροφοδοτεί MA | — |
| Timer 5' με cleanup | `:1880-1891` (MD-6 κλειστό) | — | — |

Σημείωση για το 01: τα section titles παραμένουν αγγλικά («FLEET OVERVIEW ·
TRUCKS», «RECENT SERVICE», «MONTHLY COST», «vehicles compliant» `:1733,1776,
1802,1809,1852`) ενώ οι KPI ετικέτες έγιναν ελληνικές — υπόλοιπο του MD-5,
όχι νέο εύρημα.

---

## 6. command-center — ανά στοιχείο (μέσα σε weekly_intl + weekly_natl)

Ισχύει ο **κανόνας δίδυμων Β7** — ό,τι προταθεί εδώ, και στα δύο weekly.

| Στοιχείο | Πηγή | Απόφαση | Ίδιο μέγεθος αλλού |
|---|---|---|---|
| Donut % ολοκλήρωσης + τίτλος W | `command-center.js:36-53` — pct από τη σελίδα-ξενιστή | «πόσο έτοιμη η εβδομάδα» | chips κεφαλίδας των weekly (γνωστή τριπλή αναφορά — WI-4 ιστορικό) |
| Action chips με `_ccJump` | `:28-34,133-141` | «τι μου ξέφυγε» → άλμα στη γραμμή | — |
| widgetFleet ΑΞΙΟΠΟΙΗΣΗ ΣΤΟΛΟΥ | `:61-75` — busy/total από assignedTruckIds του ξενιστή (`weekly_intl.js:412`, `weekly_natl.js:287` — natl με NAT_LOADS) | «έχω δικό μου ελεύθερο;» | dashboard KPI 3 — ίδιος ορισμός, **άλλος τύπος εβδομάδας** (Sunday-start `_wi/_wnCurrentWeek`) → στα όρια εβδομάδας μπορεί να διαφωνούν (§7.7) |
| widgetEmptyLegs ΚΕΝΑ ΔΡΟΜΟΛΟΓΙΑ | `:80-91` — **πραγματικά unmatched** από τον ξενιστή (το παλιό heuristic αφαιρέθηκε, Π5α Wave 1) | «πόσα γυρνούν άδεια» | dashboard Νεκρά Χιλιόμετρα (άλλο μέγεθος: km, όχι πλήθος) — συγγενικά, όχι ίδια |
| widgetVsLastWeek | `:96-109,168-204` — async, **κρύβεται σε αποτυχία** (`weekly_intl.js:531-534`) | context όγκου | CEO deltas περιόδου — άλλη κοκκίωση |
| widgetOnTimeStreak + fetchOnTimeStreak | `:114-126,210-243` — **δεν καλείται από καμία σελίδα** (Π5β) | — | νεκρός κώδικας στο αρχείο → 01 |
| weekPhaseBadge ΧΤΙΖΕΤΑΙ/ΣΕ ΕΞΕΛΙΞΗ/ΚΛΕΙΣΜΕΝΗ | `:148-155` | σε ποια φάση δουλεύω | — |
| reportPageMetrics | **δεν αναφέρει** (αναφέρουν οι ξενιστές weekly_intl/natl το weekNumber, όχι τα widget νούμερα) | — | §8 |

---

## 7. ΤΟ ΜΗΤΡΩΟ — ίδιο μέγεθος σε πολλές σελίδες

Η στήλη που ζητήθηκε ως σημαντικότερη, ανά μέγεθος. **Κ** = καλύπτεται από
cross-check του Metrics Audit · **Δ** = δηλωμένη διαφορά · **✗** = καμία κάλυψη.

| # | Μέγεθος | Πού εμφανίζεται (ορισμός) | Μία πηγή; | MA |
|---|---|---|---|---|
| 7.1 | **Αριθμός εβδομάδας** | dashboard+performance: `currentWeekNumber()` ISO · weekly_intl: `_wiCurrentWeek` Sunday-start · weekly_natl: `_wnCurrentWeek` Sunday-start · **ceo: δικός του `_getWeekNum` (`ceo_dashboard.js:87-93`)** — και κλειδώνει τα anxiety keys | ΟΧΙ — 4 υλοποιήσεις (2 δηλωμένες) | **Κ** για 5 σελίδες · **✗ για ceo** |
| 7.2 | **Εβδομαδιαίο σκορ** | Ένας τύπος (`metrics.weeklyScore`) — **4 συνταγές εισόδων**: dashboard (AR όλων/OT 30ημ/DK πραγματικό) · perf κάρτα (AR exports/OT all-time/DK πραγματικό) · perf γράφημα (AR exports/OT εβδομάδας/DK 75) · MA biz (AR κανονική/OT 30ημ/DK 75) | τύπος ΝΑΙ, είσοδοι ΟΧΙ | **Κ** (3 γραμμές, βάση perf κάρτα) |
| 7.3 | **On-time %** | dashboard (30ημ παράθυρο) · performance (all-time) · CEO Speed & Execution (περίοδος, Actual Delivery Date πρώτα) · MA κανονικές (all-time & 30ημ) | ΟΧΙ — 3 ορισμοί + 2 κανονικές | **✗** — και οι δύο σελίδες αναφέρουν `onTimePct`, αλλά ΔΕΝ υπάρχει γραμμή cross-check· ο CEO δεν αναφέρει καθόλου |
| 7.4 | **Συμμόρφωση %** | dashboard (`metrics.compliancePct`, μόνο φορτηγά) · maint_dash + maint_expiry (φορτηγά+ρυμούλκες, δικός τους) | ΟΧΙ, αλλά δηλωμένο | **Κ/Δ** |
| 7.5 | **Ληγμένα έγγραφα** | dashboard (trucks KTEO/KEK/INS + trailers **ATP**/INS) · maint_dash (trucks+trailers με **FRC**) · maint_expiry (ΟΧΗΜΑΤΑ) · **performance thodoris (μόνο trucks — 4η παραλλαγή, `performance.js:320-329`)** | ΟΧΙ | **Κ/Δ** για 3 · **✗ για performance** (αναφέρει `expiredDocs` αλλά καμία γραμμή δεν το διαβάζει) |
| 7.6 | **Πλήθος στόλου** | trucks σελίδα · dashboard `activeTrucks` · maint_dash `activeTrucks`+`totalFleet` | βάση: trucks ενεργά | **Κ** |
| 7.7 | **Αξιοποίηση στόλου (busy %)** | dashboard KPI (`:73-82`) · CC widgetFleet (intl+natl) — ίδιος ορισμός, **άλλη εβδομάδα** (ISO vs Sunday-start) και natl σε NAT_LOADS · MA `fleet.utilization` | σχεδόν — χαλάει στον τύπο εβδομάδας | **✗** (το CC δεν αναφέρει) |
| 7.8 | **Usage rate (ημέρες×4.5×4.5)** | dashboard κάρτα (`:154-188`) · performance `fleet_usage` (`:195-214`) — **ο τύπος υπάρχει ΔΥΟ φορές σε modules, ΠΟΥΘΕΝΑ στο metrics.js** | ΟΧΙ — δύο αντίγραφα | **✗** — στην ίδια σελίδα (dashboard) συνυπάρχει με το 7.7 υπό σχεδόν ίδια ετικέτα |
| 7.9 | **Νεκρά χιλιόμετρα** | dashboard KPI + performance (haversine μ.ό. ζεύγους, 2 αντίγραφα) · CEO (πεδία ή **εκτίμηση 50/600km**, σε σύνολο km + %) · `metrics.deadKmForPeriod` = **stub που γυρνά πάντα 0** (`metrics.js:221-250`) | ΟΧΙ — 3 μέθοδοι, «κανονική» νεκρή | **✗** |
| 7.10 | **Ανάθεση % / χωρίς ανάθεση** | dashboard KPIs (μόνο Truck) · dashboard AR για το σκορ (Truck, όλα τα orders) · performance plan_complete (Truck, μόνο exports) · CEO Assigned (Truck, όλα) · MA `hr.assignment_rate` + `op.unassigned_*` (**Truck Ή Partner**) · chips weekly | ΟΧΙ — ο Partner άλλοτε μετρά, άλλοτε όχι | **✗** ως cross-check |
| 7.11 | **Υψηλός κίνδυνος 48ω** | dashboard (unassigned + ≤48ω) · CEO (**κάθε** μη-παραδομένο ≤48ω, και ανατεθειμένα) · `metrics.highRiskDeliveries` (χωρίς truck ΚΑΙ χωρίς partner, επόμενα 48ω) | ΟΧΙ — 3 ορισμοί | **✗** |
| 7.12 | **Έσοδα / ατιμολόγητα** | CEO (πεδίο **`Net Price`**, 3 παραλλαγές στην ίδια σελίδα) · MA `fin.*` (πεδίο **`Price`**) · invoicing (δικοί της μετρητές) · performance eirini `outstanding` (`Net Price`) | ΟΧΙ — **δύο διαφορετικά πεδία βάσης** | **Κ** μόνο για τα εσωτερικά του invoicing · **✗** μεταξύ σελίδων |
| 7.13 | **Κόστος συντήρησης** | maint_dash Monthly (6μ) · CEO Cash (περίοδος) — ίδια πεδία `Cost`/`Total Cost` | ΝΑΙ ως πεδία, όχι ως προβολή | **✗** |
| 7.14 | **Αναχωρήσεις/παραδόσεις σήμερα** | dashboard κάρτες · daily_ops (εκτός εύρους) · MA `op.*_today` | — | μερική |

---

## 8. Τυφλά σημεία του διαιτητή (σύνοψη για το 01)

Το Metrics Audit κάνει σωστά ό,τι του έχει δηλωθεί. Ό,τι ΔΕΝ του έχει δηλωθεί:

1. **Ο CEO Dashboard δεν αναφέρει τίποτα** — καμία γραμμή `reportPageMetrics`
   σε 1.106 γραμμές. Η σελίδα με τα πιο «στρατηγικά» νούμερα είναι η μόνη
   dashboard-σελίδα εκτός συστήματος επαλήθευσης (μαζί με το CC).
2. **On-time**: αναφέρεται από dashboard και performance, δεν διασταυρώνεται.
   Η ιστορία PF-3 (15% vs N/A) ήταν ακριβώς αυτό το μέγεθος.
3. **Νεκρά χιλιόμετρα**: 3 μέθοδοι, καμία γραμμή, και η «κανονική» συνάρτηση
   είναι stub.
4. **Usage rate & busy-%**: δύο έννοιες με σχεδόν ίδια ελληνική ετικέτα
   («Αξιοποίηση Στόλου») στην ίδια σελίδα, καμία στο metrics.js.
5. **Χωρίς ανάθεση**: ο ορισμός με/χωρίς Partner αλλάζει ανά σελίδα.
6. **Έσοδα**: `Price` vs `Net Price` μεταξύ metrics.js και CEO/performance.
7. **Υψηλός κίνδυνος**: 3 ορισμοί, το banner του dashboard και το KPI του CEO
   μπορούν να πουν διαφορετικό νούμερο την ίδια στιγμή.

Αυτά είναι **υποψίες χαρτογράφησης** — το αν παράγουν ορατή αντίφαση στο
παραγωγικό θα μετρηθεί ζωντανά στο 01 (κανόνας 2: τίποτα από τα παραπάνω δεν
παρουσιάζεται ως ζωντανό εύρημα πριν μετρηθεί).

---

## 9. Πρώτη ανάγνωση του ερωτήματος 8 («πέντε dashboards είναι πολλά;») — με βάση τον χάρτη, όχι γνώμη

- Οι πέντε σελίδες έχουν **διακριτούς αναγνώστες/στιγμές** (πίνακας §0) — η
  επικάλυψη δεν είναι στις σελίδες αλλά στα **μεγέθη**: 14 μεγέθη, τα 8 χωρίς
  μία πηγή (§7).
- Η μεγαλύτερη πραγματική επικάλυψη περιεχομένου: dashboard×3 στοιχεία
  συντήρησης (banner, Ειδοποιήσεις, Συμμόρφωση) vs maint_dash — και
  dashboard Εβδομαδιαίο σκορ vs performance (owner βλέπει το ίδιο δαχτυλίδι
  δύο φορές με άλλες εισόδους).
- Η κρίση (συγχώνευση/όχι) ανήκει στο 02_PROPOSALS, αφού μετρηθούν ζωντανά
  οι καταστάσεις.

---

**ΣΤΑΣΗ ΕΔΩ** — περιμένω έγκριση του χάρτη πριν το `01_FINDINGS.md`
(ζωντανό πέρασμα στο παραγωγικό + design έλεγχος 1366×768/1024).
