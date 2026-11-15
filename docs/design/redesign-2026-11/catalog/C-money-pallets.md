# Catalogue C — money, pallets, stock

Scope: Trip expenses, DKV import, Trip P&L (+ papers), Driver payroll (+ prints), Pallet ledger (+ week view, feeders), Stock lots.
Method: read-only reading of the worktree code on 2026-11-14. Nothing was run, no database was queried. `file:line` refers to that tree. "Inference" marks anything not provable from code. Worker-side rules were not read unless stated.

Tags: [BROKEN] · [MISSING] · [EXTRA] · [INCONSISTENT] · [LOCKED].

## 0. Shared facts

| Fact | Evidence |
|---|---|
| Roles and the `costs` key: owner full, accountant full, management view, dispatcher none, warehouse none | `config.js:354-365` |
| Nav: «Μισθοδοσία Οδηγών» (section Οδηγοί, perm `costs`); «Ισοζύγιο Παλετών» (section Οικονομικά, inherits `orders`); «Έξοδα Δρομολογίων» (perm `costs`); «TRIP PnL» (`role: 'owner'`) | `core/router.js:56, 72-77` |
| Router guard blocks a page whose perm is `none` with a toast and falls back to dashboard | `core/router.js:276-291` |
| Two fetch wrappers: `ctFetch` (costs, payroll, expenses; handles network failure, 401 → login window) and `plFetch` (pallets; plain) | `modules/costs.js:36-60`, `core/pallet-feed.js:10-22` |
| Week = Saturday → Friday. Three implementations: `TmsWeek` (boards, pallets week), `ctWeekOf` (expenses, P&L), inline formula in P&L «Ανά Εβδομάδα» | `core/tms-week.js:2`, `modules/costs.js:111-126`, `modules/costs.js:777` |
| No feature flag gates any page in scope except `FEATURES.STOCK_LOTS` (true) | `config.js:422` |
| Responsive: expenses and payroll have breakpoints at 1320 px and 1700/1800 px only; pallets pages have none; P&L has one at 768 px | `modules/expenses.js:521-524`, `modules/payroll.js` (2 `@media`), `modules/costs.js:1436` |

---

## 1. Έξοδα Δρομολογίων (trip expenses) — `modules/expenses.js`

### 1.1 Who sees it
- owner, accountant: full. management: read-only (no entry row, no cell click, no import button). dispatcher, warehouse: no nav item; direct URL shows the access-denied block. `modules/expenses.js:558-559`, `core/router.js:76`.
- Job (inference from code comments and flow): the accountant keys receipts per trip, week by week, in runs of the same category (Enter keeps category/date/payment), assigns unallocated card lines to trips, and twice a month imports the fuel-card statement ZIP. The owner uses the Vehicle tab to review one truck over 4/8/12 weeks.
- Partner trips never appear here (own fleet only). `modules/expenses.js:190-197, 607, 674`.

### 1.2 Inventory

| Region / control | What it does | Where |
|---|---|---|
| Header: title «Έξοδα δρομολογίων — Εβδομάδα N» / «— Όχημα <plate>» | Names the scope | `expenses.js:1049-1082` |
| Segmented tab «Εβδομάδα \| Όχημα» | Switches data set; resets search and chip filter | `:574-587, 1049` |
| Button «Εισαγωγή DKV» (write roles) | Replaces the page with the import flow | `:1081` |
| Week strip: ‹ › arrows + 5 week chips («Εβδ. N · dates · count», «N ελλείψεις» on the selected one, future weeks dimmed) | Week navigation; fetch window = the 5 weeks | `:1118-1137, 590-616` |
| Vehicle controls: «Όχημα» select with search, «Εύρος» 4/8/12 weeks, date range text | Vehicle tab scope | `:1099-1109` |
| Summary bar: «Δρομολόγια», «Σύνολο εξόδων», «Λίτρα» | Totals of the active tab | `:1145-1157` |
| Filter chips: «Πλήρη», «Με ελλείψεις», «Σε εξέλιξη», «Χωρίς δρομολόγιο» (week tab only) | One at a time; counts never change with the filter | `:1158-1163, 816-833` |
| Search box | Filters by plate, driver, route text, stop names | `:1164, 801-807` |
| Grid header: chevron, «Όχημα/Ρυμούλκα», «Οδηγός», «Ημ/νίες», «Διαδρομή», 9 amount columns («Καύσιμα», «Διόδια», «AdBlue», «Τέλη DKV», «Spedition», «Μετρητά Μ», «Πρόστιμα», «Καράβια/Τρένα», «Λοιπά»), «Σύνολο», «Κατάσταση» | Fixed column set, never hidden | `:1183, 77-91` |
| Trip row | Chevron expands legs + opens frame; click on vehicle/driver toggles the frame; cell click (write) opens the frame on that category; «+» adds an expense | `:1308-1358` |
| Amount cell | Sum; sub-line with litres / «N γρ.» / restatement part / payment tag; «—» when a closed trip misses fuel or tolls | `:1254-1288` |
| «Μετρητά Μ» cell | Reads the payroll ledger's `expenses` of the trip | `:1293-1302` |
| Status cell: «Σε εξέλιξη», «Ελλείψεις», «Πλήρες» | Derived, not stored | `:762-765` |
| «Χωρίς δρομολόγιο» row (week tab) | Unallocated lines dated in the week; per-cell panel with «Ανάθεση σε δρομολόγιο…» select; card-fee lines summarised under it | `:1367-1393, 1520-1533, 2029-2034` |
| Totals row | Column sums, litres under fuel, restatement under «Λοιπά», grand total | `:1195-1213` |
| Vehicle tab footer «Διόδια ανά χώρα» | Tolls by country with flags | `:1238-1244` |
| Footer legend | Meaning of empty vs «—», click/Enter/Esc hints | `:1215` |
| Trip frame (inline, under the row) | Title (truck/trailer · driver · dates), route with flags, «RT κλειστό/σε εξέλιξη», missing groups, deleted-statement-lines note; one section per category with a 9-column line table; «Μετρητά Μ» section; totals (litres, total, by payment method, tolls by country); entry row; «Επόμενο δρομολόγιο ↓» | `:1470-1516, 1541-1556` |
| Line row: date, category (+ supplier, km, station, trailer), payment tag, note, litres, country flag, amount, who, actions | «Διόρθωση», «Διαγραφή» (owner/accountant, any line) | `:1982-2041` |
| Inline edit row | Same fields; imported lines lock amount/date/payment | `:2043-2085, 2123-2186` |
| Quick-entry row: category, date, payment, amount, note; fuel adds litres/km/station/supplier/country; reefer adds trailer chip/select; tolls add mandatory country combobox | «Καταχώρηση», «+ Ίδια κατηγορία», «Άκυρο», link «σε παράθυρο» | `:1797-1832, 1942-1978` |
| «Μετρητά Μ» input | Writes the payroll ledger amount; locked when the trip has cash lines (shows «≠ ποσό Μισθοδοσίας» on mismatch) | `:1571-1627` |
| Entry modal «Καταχώρηση κόστους — …» | Same body builder as the row; also opened from TRIP PnL | `:2279-2374`, `costs.js:1153-1160` |
| Country combobox | Search list, ISO-2 codes, flags | `:1645-1708` |
| Card «Εισαγωγές DKV» (week tab, bottom) | Past statement imports: document, period, line count, VAT refund, status, who/when, deleted-lines warning, «ZIP» link (signed URL) | `:701-734` |
| Keyboard | Enter = «+ Ίδια κατηγορία», Esc = reset (entry row); Enter = save in modal; Enter/Esc in «Μετρητά Μ» | `:1868-1871, 2352, 1591-1601` |
| Dialogs | Native `prompt` for reasons (edit, delete, assign, ledger change); native `confirm` for delete | `:1619, 2142, 2189-2190, 2200` |
| Toasts | Validation («Χρειάζεται ποσό/ημερομηνία/πηγή πληρωμής/ρυμούλκα/χώρα διοδίων»); «Δεν έχεις δικαίωμα…» on Forbidden; «Η καταχώρηση έγινε, αλλά τα σύνολα δεν ανανεώθηκαν» | `:210-213, 1892-1921, 2213` |
| Export / print | None on this page | — |

### 1.3 Logic that must survive
- Every displayed amount = net + VAT in one figure; manual lines write `net`, VAT 0. `expenses.js:155-160, 1891-1898`.
- Trip total = all cost lines + payroll ledger «Μετρητά Μ». One formula for row, frame and footer. `:870, 771-799`.
- «Πλήρες» = trip closed/complete AND has at least one fuel line and one toll line; an open trip never claims a gap. `:750-765, 92`.
- Unallocated card-fee lines are money but never a pending task. `:778-783, 1369-1385`.
- Required: date, amount, payment method on every line; toll country on tolls; trailer on reefer fuel when the trip has none or it is overridden. `:1891-1933`.
- Payment default is remembered per session in two buckets (fuel/tolls vs the rest). `:745-748`.
- Every edit, delete and assignment needs a typed reason. `:2142, 2190, 2200`.
- Imported lines: only category, country, note (and trip, via assignment) may change. `:2147-2166`.
- «Μετρητά Μ» is one number shared with payroll; when cash-paid lines exist it is derived from them and not editable here. `:1567-1589, 1607`.
- Category list and labels come from one place (`CT_CATEGORY_LABELS`); payment vocabulary comes from the Worker lookups. `costs.js:9-21`, `expenses.js:59-67`.
- Writes: `POST /costs/lines`, `PATCH|DELETE /costs/lines/:id`, `PATCH /costs/ledger/:id`. Reads: `/costs/rt?from&to`, `/costs/lookups`, `/costs/lines?rt_id=`, `/costs/lines?alloc_status=unallocated`, `/costs/import/docs`. `:600-621, 690, 1624, 1962, 2160, 2193, 2203`.
- After every write the data is re-read from the server, never patched locally. `:2211-2215`.

### 1.4 Findings
| Tag | Finding | Evidence |
|---|---|---|
| [MISSING] | Unallocated lines are shown only in the week of their own date. The count of unallocated lines outside the selected week is computed (`noneOther`) and never rendered; a line without a date is never listed. There is no backlog view of everything waiting for a trip. | `expenses.js:751, 796-797` (no other reader) |
| [MISSING] | An unallocated line can only be assigned to a trip of the selected week (the select lists `_ex.rts`). A charge dated the day before a trip's week cannot be assigned without knowing to switch weeks; the Vehicle tab has no unallocated row at all. | `expenses.js:2029-2034, 1220` |
| [MISSING] | No export and no print on the page (payroll and pallets both have CSV and print). Inference that the accountant needs one. | whole file; cf. `payroll_print.js:89, 113` |
| [INCONSISTENT] | Reasons and confirmations use native `prompt`/`confirm`; payroll uses an in-page reason dialog; pallets use a field in the panel. Three patterns for the same act. | `expenses.js:1619, 2142, 2189, 2200`; `payroll.js:862-883`; `pallet_ledger.js:1515, 1641-1645` |
| [INCONSISTENT] | A successful manual save gives no confirmation (silent re-render); validation and success both go through `showErrorToast`. | `expenses.js:1962-1977`; `expenses_import.js:1205` |
| [INCONSISTENT] | Lines per trip are fetched one request per trip (N requests per week or per vehicle range); TRIP PnL reads the same lines paged in bulk. | `expenses.js:618-625, 683-686`; `costs.js:299-322` |
| [INCONSISTENT] | «Complete» has three definitions: here closed + fuel + tolls; TRIP PnL screen = at least one cost line; P&L paper = expenses + driver value (database view). | `expenses.js:757-765`; `costs.js:548-551`; `pnl_paper.js:17-20` |

### 1.5 States today
| State | Behaviour | Where |
|---|---|---|
| Loading | Text card «Φόρτωση εξόδων…» / «Φόρτωση εβδομάδας…» / «Φόρτωση…» | `expenses.js:564, 1086, 1090` |
| Error | `showError('Τα έξοδα δεν φορτώθηκαν: …')`; header and strip stay | `:1087, 1091` |
| Empty week / range / search | One grid row with a sentence; totals row still drawn | `:1184-1188` |
| No vehicle chosen | «Επίλεξε όχημα.» | `:1088` |
| No permission | `showAccessDenied()` | `:558` |
| Read-only (management) | No buttons, cells not clickable; no banner says so | `:1081, 1258, 1343, 1514` |
| Partial | Import list fails separately («Δεν φορτώθηκαν: …»); totals refresh failure toast | `:701-705, 2213` |
| Many rows | No paging or virtualisation; one request per trip | `:618-625` |

---

## 2. Εισαγωγή DKV (fuel-card statement import) — `modules/expenses_import.js`, `core/dkv-parser.js`

### 2.1 Who sees it
owner, accountant (button hidden otherwise, second check in `eiOpenImport`). Not a route: it replaces `#content` and returns to expenses. `expenses_import.js:210-211, 225-231`. Frequency (inference from a hint in the upload zone): monthly/half-monthly statements.

### 2.2 Inventory
| Region / control | What it does | Where |
|---|---|---|
| Step 1 upload: back link «← Έξοδα Δρομολογίων», title, drop zone (whole page accepts the drop), file picker `.zip`, progress bar «Διαβάζω n/N…», «Αποστολή…» | Reads PDFs in the browser (JSZip + pdf.js), posts text + hash (+ ZIP ≤ 8 MB) | `:235-256, 292-305, 343-425` |
| Error box | Parse failure; «already imported» with who/when | `:299-303, 408-420` |
| Step 2 preview header: title line (zip · files · period), «Άκυρο», «Καταχώρηση N γραμμών» | Commit is disabled unless reconciliation passes and every line is ticked | `:520-553` |
| Reconciliation band | Total of ticked lines; status (agrees with the statement summary / which documents differ / unticked amount); 5 metrics: lines, vehicles, sure, suggestions, no trip | `:555-599` |
| Notices | VAT refund (info); toll-provider mismatch, unreadable documents, splits that do not add up, unknown product codes (amber) | `:611-634` |
| Twins block «Πιθανά διπλά με χειροκίνητες γραμμές» | Per pair: radio «κράτα εισαγωγή, σβήσε χειροκίνητη» / «κράτα και τις δύο» | `:855-884` |
| «N χωρίς δρομολόγιο: …» summary | Reasons for unmatched lines | `:668-680` |
| Review toggle «Όλα» / «Θέλουν απόφαση» | Hides sure lines | `:686-694` |
| Category chips «Όλα», «Διόδια», «Καύσιμα», «AdBlue», «Γέφυρες/Φέρι», «Τέλη DKV» + legend (sure / suggestion / no trip) | Filter | `:42-49, 696-711` |
| Table header: tick, «Ημ/νία», «Κατηγορία», «Χώρα», «Περιγραφή», «Λίτρα», «Καθαρό», «ΦΠΑ», «Δρομολόγιο», action | | `:638-640` |
| Group head per plate (collapsible), «Χωρίς όχημα · Γενικά τέλη DKV» last | Driver, trip dates, count, total, «όλες σίγουρες» | `:715-803` |
| Line row | Tick, category select, description (station, unit price, FX), trip cell with status dot, action link «Αλλαγή» / «Επιλογή» / «Σύνδεση με φορτηγό…» / «Επιλογή δρομολογίου…»; expandable details; trip editor; plate editor | `:886-962, 983-1135` |
| Category change | `confirm` «Να ισχύει στο εξής για τον κωδικό προϊόντος …;» → rule | `:1137-1146` |
| Footer | FX note, ZIP is stored, «N επιλεγμένες · total μικτό» | `:1155-1163` |
| Cancel in preview | `confirm` «Άκυρο; Οι διορθώσεις δεν θα αποθηκευτούν.» | `:220-223` |

### 2.3 Logic that must survive
- Text extraction only via pdf.js (same build in browser and tests); parser version is written with each commit. `dkv-parser.js:3-8, 20-24`.
- All-or-nothing: commit only when the statement summary reconciles and every line is included; an unticked line locks the button and names the amount. `expenses_import.js:534-536, 573-580, 1183`.
- Duplicate ZIP is refused by hash (409) and the message says who and when. `:395-420`.
- Possible duplicates with manual lines must each be decided; default deletes the manual one. `:455-457, 1196`.
- Unmatched reasons are a fixed vocabulary: general fee, unknown plate, no trip that day, no plate on the document, fee with no trip in the period. `:658-680, 926-947`.
- VAT refund is a receivable on the document, never a cost line. `:612-616`, `expenses.js:715-718`.
- Trips offered for matching are those of the statement's own period ±7 days, not the expenses week. `:478-515`.
- Corrections can become rules («στο εξής») per product code. `:1142-1144`.
- Endpoints: `POST /costs/import/parse`, `POST /costs/import/commit`, `GET /costs/import/docs`. `:404, 1199`.

### 2.4 Findings
| Tag | Finding | Evidence |
|---|---|---|
| [INCONSISTENT] | File header says the Worker for this flow «is not yet deployed on this branch»; the flow is live and the page depends on it. Stale comment. | `expenses_import.js:12-14` |
| [INCONSISTENT] | Preview shows «Καθαρό» and «ΦΠΑ» columns and a gross footer; the expenses page shows one gross figure by rule. | `expenses_import.js:640, 902-903, 1161`; `expenses.js:155-160` |
| [INCONSISTENT] | Trip labels fall back to «RT #id» when the trip is not in the loaded list. | `expenses_import.js:918` |
| [MISSING] | A ZIP over 8 MB is sent without the file and nothing on screen says the archive will not be stored (the code clears the error instead). | `expenses_import.js:392-397, 1160` (footer claims «το ZIP αποθηκεύεται») |
| [MISSING] | No way to resume a parsed draft: «Άκυρο» discards corrections; past imports list shows status «πρόχειρο» but offers only «ZIP». | `expenses_import.js:220-223`; `expenses.js:709-724` |

### 2.5 States today
Loading: progress bar with counts (`:240-254, 307-317`). Error: `showError` above the drop zone (`:249`). Empty result: metrics show zeros; no dedicated empty state (`:555-599`). Committing: button disabled, page re-rendered (`:1186-1187`). Many rows: groups per plate, collapsed when all sure (`:742-770`); no paging.

---

## 3. TRIP PnL — `modules/costs.js`; papers `modules/pnl_paper.js`, `print_pnl.html`

### 3.1 Who sees it
Owner only. Nav item is hidden for other roles; a direct URL passes the router guard (the item has no `perm`, so it inherits `orders`) and the page itself prints «Η κερδοφορία ανά δρομολόγιο είναι ορατή μόνο στον ιδιοκτήτη.» `core/router.js:77, 150`, `costs.js:210-215`. [LOCKED] dispatcher sees no P&L.
Job (inference): weekly review of result per trip, find trips without costs, print one trip or one week.

### 3.2 Inventory
| Region / control | What it does | Where |
|---|---|---|
| Header: «TRIP PnL» + chip «Μόνο ιδιοκτήτης», sub-line; buttons «Ρυθμίσεις», «+ Νέο δρομολόγιο (RT)» | | `costs.js:216-226` |
| Lede block | Sentence (N of M trips without cost / all complete / N loss-making), «Έσοδα − Κόστη = Καθαρό», footnote with margin with/without VAT | `:620-677` |
| Kind table: rows «Διεθνή», «Εθνικά», «Μικτά», «Σύνολο»; columns trips, revenue intl, revenue natl, revenue, costs, net, margin; note on mixed trips | | `:586-613` |
| Toolbar: scope «Όλα/Διεθνή/Εθνικά/Μικτά»; vehicle select (all fleet, each truck, «Συνεργάτες»); group select («Δρομολόγια», «Ανά φορτηγό / συνεργάτη», «Ανά Οδηγό», «Ανά Εβδομάδα»); sort hint «Έσοδα ↓»; «Ανανέωση» | | `:228-247, 682-707` |
| Reconciliation notes | Executed orders without a trip; orders the bridge cannot check | `:1008-1042` |
| Warning notes | P&L cut at a cap; cost lines not loaded / capped; trips capped; route details not loaded; pallet-slip gate count | `:403-416, 712-721, 752-757, 768-769` |
| Week groups (collapsible, newest first, first two open): label, count, «Εκτύπωση», revenue / costs / net / margin | | `:971-1003` |
| Trip card: code, vehicle chip, dates, kind, status badge («Σχεδιασμένο», «Σε εξέλιξη», «Ολοκληρώθηκε», «Οριστικό», «Άκυρο»); leg lines (direction chip, from → to, date, amount, stock-lot note); return line; Veroia Switch note; partner note; equation row; «+ Καταχώρηση κοστών»; pallet-slip lock note; «why» line on a loss | | `:196-205, 807-943` |
| Grouped tables (truck / driver / week) | Trips, revenue, costs, net, margin with VAT (pill), without VAT; incomplete trips excluded with a note | `:775-801` |
| Side panel (drill-down) | Header, meta, «Κλείσιμο δρομολογίου — χειροκίνητο»; gate / revenue-missing / costs-missing notes; two result tiles (with VAT, without VAT); «Καταχώρηση κόστους», «Εκτύπωση αποτελέσματος»; revenue legs; costs by category with bars, «Φθορά» (automatic), «Οδηγός» (from payroll); line list | `:1045-1133` |
| Modal «Νέο δρομολόγιο (RT) — κέντρο κόστους» | Scope, type, truck, trailer, driver, partner, start, end, km, note; «Άκυρο», «Δημιουργία» | `:1196-1247` |
| Modal «Ρυθμίσεις COSTS» | One numeric input + «Αποθήκευση» per setting (VS transfer export/import, pallet value, default VAT, …) | `:1250-1273` |
| Dialogs | Native `confirm` (close trip), `alert` (errors, saved) | `:1155, 1170-1172, 1240-1246, 1271` |
| Print: one trip (A4 portrait), one week (A4 landscape) | Opens `print_pnl.html?rt=` / `?from&to`; page refuses to print when rows do not add up to the P&L view | `:1139-1141`; `pnl_paper.js:9-15, 354, 360-446` |
| Keyboard | None | — |

### 3.3 Logic that must survive
- Never show 0 for an unknown: missing costs → dashes and an entry button, not 100 % margin; failed load → «Τα νούμερα ΔΕΝ είναι μηδέν». `costs.js:545-551, 842-858, 417-421`.
- Net shown = worst case, costs with VAT (`profit_worst`); second figure without VAT. `:1112-1113`, `pnl_paper.js:17-19`.
- Kind: INTL / NATL by trip scope; MIX when the other revenue column is non-zero or a national revenue is missing. `costs.js:179-189`.
- Missing national revenue makes revenue «a minimum» and blocks net. `:556-560, 654-658`.
- Partner trips: only the partner rate is a cost; pallet-slip gate warns, never hides. `:894-899, 712-721`. [LOCKED] pallet-slip gate has no cutoff.
- Veroia Switch share is an internal transfer, shown as a note when leg prices exceed trip revenue. `:904-921`.
- Stock lots: leg revenue comes from the database allocation, not the order price. `:491-543`.
- Driver cost comes from the payroll ledger, never entered here. `:6-8, 1080-1087`.
- Trip status is derived from legs in the database; manual close is refused unless all legs are delivered/cancelled. `:1169-1172`, `core/rt-feed.js:8-11`.
- Reconciliation counter looks only at orders loaded from a fixed start date, status In Transit/Delivered, with an assignment. `costs.js:1017-1027`.
- Endpoints: `GET /costs/pnl`, `/costs/rt`, `/costs/lookups`, `/costs/pallet-gate`, `/costs/lines`, `/costs/stock-lots`, `/pallets/gate`, `/costs/settings`, `/costs/pnl-paper`; `POST /costs/rt`; `PATCH /costs/rt/:id`, `/costs/settings`. `:339-349, 439, 481, 1171, 1243, 1260, 1270`.
- Papers compute nothing; they lay out database rows and prove the sums. `pnl_paper.js:9-15`.

### 3.4 Findings
| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | The «Σημείωση» field of the new-trip modal is never sent: the request body has no note. Typed text is lost without a word. | `costs.js:1216` vs `1231-1239` |
| [MISSING] | No period filter. The page loads every trip the Worker returns (cut at a cap, with a warning) and totals cover «everything loaded»; only week grouping and per-week print narrow the view. | `costs.js:339-354, 403-416, 627-630` |
| [INCONSISTENT] | «Ανά Εβδομάδα» uses its own week formula on the raw start date (no Saturday start, no year in the label); the trip list and the print use `ctWeekOf`. A Saturday trip can land in different week numbers in the two views. | `costs.js:777` vs `111-126, 974` |
| [INCONSISTENT] | «Complete costs» on screen = at least one cost line; on the paper = the database rule (expenses + driver value). The screen can show a net that the paper refuses. | `costs.js:548-551, 582`; `pnl_paper.js:17-20` |
| [INCONSISTENT] | Card headline is the internal trip code; panel legs read «διεθνές φορτίο #id» / «εθνικό φορτίο #id»; cards read «εθνικό φορτίο #id». Against the plain-messages rule (no bare codes as the subject). | `costs.js:814, 820, 927, 1102, 1121-1122` |
| [INCONSISTENT] | Native `alert`/`confirm` for every error and confirmation; the rest of the app uses toasts. | `costs.js:1155, 1170-1172, 1240-1241, 1246, 1271-1272` |
| [INCONSISTENT] | Stale copy: empty state says trips are created «χειροκίνητα τώρα … αυτόματα … στο επόμενο β…» and «ξεκίνα τον πιλότο»; a card says leg linking «έρχεται από τους σχεδιαστές»; the modal says automatic creation is «Φ2». Automatic creation exists (`core/rt-feed.js`). | `costs.js:731-741, 884, 1218`; `core/rt-feed.js:1-20` |
| [INCONSISTENT] | Modal default date uses UTC (`toISOString`); expenses uses the local-date helper for the documented 00:00–03:00 reason. Same in payroll and the pallet feeders. | `costs.js:1199`; `expenses.js:133-136`; `payroll.js:951, 1264, 1529, 1611`; `pallet-feed.js:42` |
| [EXTRA] | Routes `costs_dash` and `pl` are «coming soon» pages reachable only by URL, with text saying a table «does not exist yet». | `core/router.js:394-409` |
| [EXTRA] | Category `fixed_alloc` («Πάγια (Tier-2)») is labelled and ordered for a future allocator that nothing writes. | `costs.js:20`; `pnl_paper.js:26-30`; `expenses.js:24-25` |
| [LOCKED] | Owner-only; dispatcher sees no margins. Partner rate is the one figure dispatchers handle elsewhere. | `costs.js:210-215`; CLAUDE.md locked decisions |

### 3.5 States today
| State | Behaviour | Where |
|---|---|---|
| Loading | «Φόρτωση…» in the list; panel «Φόρτωση κοστών…» | `costs.js:326, 1052` |
| Error | Card «Τα /costs/* δεν απάντησαν … ΔΕΝ είναι μηδέν» + «Δοκίμασε ξανά»; toolbar hidden | `:388-397, 417-421` |
| Empty (no trips at all) | Onboarding card with 3 steps and a create button | `:728-743` |
| Empty (filters) | «Κανένα δρομολόγιο με αυτά τα φίλτρα.» | `:745-748` |
| No permission | Sentence in a card | `:210-215` |
| Partial | Separate amber notes per failed or capped source; scope chips disabled when empty | `:752-757, 695-700` |
| Many rows | Week groups collapsed after the first two; cap warnings; no paging | `:963-965, 403-416` |
| Paper refused | `pnlRefusedHtml(title, reasons)` instead of a sheet | `pnl_paper.js:354` |

---

## 4. Μισθοδοσία Οδηγών (driver payroll) — `modules/payroll.js`, `modules/payroll_print.js`, `print_payroll.html`

### 4.1 Who sees it
owner, accountant (full), management (view): all three open it; the Worker decides writes. dispatcher, warehouse: no. `core/router.js:56, 388-391`, `payroll.js:636`.
Job (inference): accountant enters trip value / advance / expenses per trip, records payments (single or bulk, monthly), reviews flagged lines, prints a driver card for signature and a debts list.

### 4.2 Inventory — Home
| Region / control | What it does | Where |
|---|---|---|
| Header buttons: «Μαζική πληρωμή», «Δρομολόγιο», «Εκτύπωση ▾» → «Κατάσταση οφειλών οδηγών», «CSV» | | `payroll.js:766-774` |
| KPI tiles: «Οφειλή σήμερα», «Δρομολόγια μήνα» (+ local days), «Χωρίς αξία» (click = pending first), «Πληρωμές μήνα», «Ενεργοί οδηγοί» | | `:775-781` |
| Month bar: ‹ month ›, «Σήμερα», sort select («Οφειλή φθίνουσα», «Όνομα», «Χωρίς αξία»), search | | `:782-794` |
| Note when month totals are unavailable | | `:795` |
| Gap block «N δρομολόγια χωρίς γραμμή μισθοδοσίας» with «Σύνδεση» per row | Creates the ledger line for an existing trip | `:818-846` |
| Driver card grid: initials, name, type, balance + word, month boxes (trips, value, payments), last payment line, badge «N χωρίς αξία», «Πληρωμή», «Καρτέλα →» | | `:915-945` |
| Inline pay form in the card: date, «Τράπεζα/Μετρητά», amount, «Καταχώριση», «Άκυρο» | Enter saves, Esc closes | `:950-996, 1011-1018` |
| Footer: counts, total debt, definition of balance vs month, inactive drivers with balance | | `:798-805` |

### 4.3 Inventory — Driver card
| Region / control | What it does | Where |
|---|---|---|
| Back link «← Μισθοδοσία» | | `:1139` |
| Hero: name, type (or link «Ορισμός τύπου…»), balance; «Πληρωμή», «Προσαρμογή», «Δρομολόγιο», «Εκτύπωση καρτέλας», «CSV» | | `:1140-1151` |
| Year stats: trips, local days, value, expenses, payments, «Χωρίς αξία» | Always whole year | `:1152-1159` |
| Period bar: year chips (3 years + «Όλα»), month select, «Όλο το έτος», period label | | `:1160-1167, 1040-1063` |
| Block «N δρομολόγια χωρίς γραμμή» with «Σύνδεση» | | `:1198-1211` |
| Ledger table: «Ημ/νία», «Κίνηση», «Αξία», «Έλαβε», «Έξοδα», «Μεταβολή», «Υπόλοιπο», menu | Quick-entry row on top; opening-balance row; rows newest first; totals row with closing balance | `:1169-1187, 486-593` |
| Row marks: trip icon ↗, relay badge, cash dot (expenses come from cash lines), «χωρίς αξία», «θέλει έλεγχο», cancelled style, leg block | | `:503-534` |
| Row menu «···»: «Ελέγχθηκε», «Διόρθωση», «Ακύρωση»; on a cancelled row «Επαναφορά» | | `:599-630` |
| Inline edit: value, advance, expenses (expenses locked when cash lines exist) | Enter saves, Esc cancels | `:550-563, 1316-1353` |
| Reason dialog (shared) | Title, sub-text, one input, «Άκυρο», submit | `:862-883` |
| Modals «Πληρωμή» (date, method, amount) and «Προσαρμογή» (date, ± amount, mandatory reason) | | `:1527-1598` |
| Block «Τοπικές κινήσεις · N» | History table of local-driver moves for the period | `:1221-1229` |
| Footer legend (ΜΕΤΑΒΟΛΗ, ΥΠΟΛΟΙΠΟ, «—») | | `:1189` |

### 4.4 Inventory — Bulk payment, exports, prints
| Region / control | What it does | Where |
|---|---|---|
| Bulk: date, method; «Ίδιο ποσό σε όλους», «Όλη η οφειλή», «Όπως τον προηγούμενο μήνα»; table (driver, debt, previous, amount input, new balance, ✓/✕); footer count/sum, «Άκυρο», «Καταχώριση N πληρωμών» | Posts one payment per row, in order, stops at the first failure | `:1602-1757` |
| CSV drivers list / CSV card | `;` separated, BOM, formula-safe cells | `payroll_print.js:28-45, 89-127` |
| Print card (`doc=card&driver&year&month`), print debts list (`doc=drivers`) | Separate page with signature columns | `payroll_print.js:14-22`; `print_payroll.html:273-274` |

### 4.5 Logic that must survive
- Balance sign: positive = owed to the driver; negative in parentheses, amber. No word next to an amount. `payroll.js:26-58`.
- A trip without value is «pending»: shown as «—», excluded from balance; a zero balance with pending trips prints «—». `:34, 119-120, 569-576`.
- Period maths in one function: opening = running balance before the period, closing = last running balance; cancelled rows stay visible and count for nothing. `:191-229`.
- Entry types: trip, bank payment, cash payment, adjustment (± with mandatory reason). `:12, 119-124, 1587`.
- Changing an already written amount needs a reason; a local-driver line set to 0 needs a note. `:1338-1351`.
- Cancel keeps the row in history; restore undoes it; both with reasons. `:1378-1383, 1505-1510`.
- «Ελέγχθηκε» is verified by re-reading before and after the write; the reason is appended with name and date. `:1400-1461`.
- Expenses of a trip with cash-paid cost lines are locked here (same number as «Μετρητά Μ»). `:519-522, 556-558, 1331`.
- Local-driver lines: label from the move, cancellable only when no live move exists that day. `:135-177`.
- Home lists active drivers with entries; inactive ones with a balance are only counted in the footer. `:704, 757-758, 804`.
- Endpoints: `GET /costs/ledger?month=`, `GET /costs/ledger/:driver`, `POST /costs/ledger`, `PATCH /costs/ledger/:id`, `GET /costs/lookups`. `:661, 1087, 841, 989, 1298, 1361`.

### 4.6 Findings
| Tag | Finding | Evidence |
|---|---|---|
| [BROKEN] | Bulk payment retry can pay twice. After a failure the amounts of rows already saved stay filled, the button is re-enabled, and submit re-posts every row with an amount (the ✓ results are not consulted). The message only says the earlier payments were saved. | `payroll.js:1736-1757` (filter by amount only), `1651` |
| [INCONSISTENT] | No read-only mode. management (`costs: view`) sees every write control (payment, bulk, adjustment, quick entry, inline edit, cancel); refusal arrives only as a Worker error. Expenses and pallets hide or flag writes. | `payroll.js:636` (only gate), `766-768, 940, 1146-1148, 1171`; cf. `expenses.js:559`, `pallet_ledger.js:934` |
| [INCONSISTENT] | «Όπως τον προηγούμενο μήνα» and the column «Προηγ. μήνας» take the first non-cancelled payment of that method in the driver's ledger as returned, without checking the month. | `payroll.js:1622-1634, 1652, 1725-1731` |
| [INCONSISTENT] | Header button «Δρομολόγιο» on the home page opens the card of whichever driver is first in the current sort. | `payroll.js:1021-1026` |
| [INCONSISTENT] | «Επαναφορά» is offered to owner and management, not accountant; «Ελέγχθηκε» to all three. management is the view-only role. Whether the Worker agrees was not verified. Role rules are the owner's call. | `payroll.js:1371-1373, 1389-1391` |
| [INCONSISTENT] | Bulk list includes inactive drivers with entries; home hides them. | `payroll.js:1616-1618` vs `704` |
| [INCONSISTENT] | Error channels differ inside the page: inline `dl-err` text in modals, `toast` elsewhere, guarded by `typeof toast`. | `payroll.js:845, 994, 1292, 1366, 1564` |
| [MISSING] | No confirmation step before «Καταχώριση N πληρωμών» (N money writes) and no undo other than cancelling each line. | `payroll.js:1692, 1736-1757` |
| [INCONSISTENT] | CSV uses `;` here and `,` in pallets. | `payroll_print.js:33`; `pallet_ledger.js:1041` |

### 4.7 States today
| State | Behaviour | Where |
|---|---|---|
| Loading | «Φόρτωση καρτελών…» / «Φόρτωση…» | `payroll.js:641, 1606` |
| Error | `showError('Οι καρτέλες οδηγών δεν φορτώθηκαν: …')` | `:645, 1609` |
| Empty | `showEmpty` «Κανένας οδηγός» / «Καμία κίνηση στην περίοδο» / «Κανένας οδηγός με κίνηση» | `:763, 1120, 1653` |
| No permission | `showAccessDenied()` | `:636` |
| Partial | Month totals missing → «—» + note; local moves failed → note «δεν σημαίνει ότι δεν υπάρχουν»; previous month «?» | `:795, 1224, 1668` |
| Many rows | Card grid and full ledger without paging; year/month filter narrows the ledger | `:797, 1118` |

---

## 5. Ισοζύγιο Παλετών (pallet ledger) — `modules/pallet_ledger.js`, `modules/pallets_week.js`, `core/pallet-feed.js`, `modules/pallet_upload.js`

### 5.1 Who sees it
- Nav item inherits `orders`: owner, dispatcher, management, accountant, warehouse all see it. The page has no gate of its own; data access is decided by the Worker. `core/router.js:72`, `pallet_ledger.js:52-81`.
- Write (confirm, fix, delete, reverse, record): `costs` full or `orders` full → owner, accountant, dispatcher. New movement: `costs` full → owner, accountant. Adjustment type: owner. «Λείπει παράδοση»: read owner/accountant/management, write owner/accountant. Week «Ελέγχθηκε»: owner/accountant. `pallet_ledger.js:23-24, 694-697, 1759`, `pallets_week.js:25-26`.
- Job (inference): accountant confirms pending movements from delivery slips (a queue, Enter to confirm and move on), closes deliveries without a movement, checks each week and marks it, sends a statement to a client. Dispatchers correct fed movements.

### 5.2 Inventory — shell and «Προς ενέργεια»
| Region / control | What it does | Where |
|---|---|---|
| Header: h1 «Παλέτες», subtitle (count for the view), tabs «Προς ενέργεια», «Εβδομάδα», «Κινήσεις», «Υπόλοιπα»; «⤓ Εξαγωγή» menu; «+ Νέα κίνηση» | | `pallet_ledger.js:902-918` |
| Strip «Θέλουν δράση»: «Εκκρεμείς n», «Λείπει παράδοση n», «Χωρίς πλήρη επιστροφή n»; right side client totals (owed to us / we owe / net) | Each is a link to its list | `:920-930` |
| Notices: read-only banner; order details not loaded (retry); list cut at a cap | | `:932-938` |
| Toolbar (action): count sentence, search with `/` and Esc hints | | `:939-956, 973` |
| Pending list: grouped by client (first 3 groups, «N ακόμη …» expander), partners group, group head with counts, table (Α/Α, Αρ., date, pallets, point, vehicle · driver, Πήραμε, Δώσαμε, Αναμονή, «Επιβεβαίωση»), group totals; «Προγραμματισμένες» expander for future-dated | Wait > 14 days is marked late | `:523-571, 406-416, 421-424` |
| «Χωρίς πλήρη επιστροφή» list | Confirmed deliveries with given > taken; column «Δεν γύρισαν», note; group and grand totals | `:573-589` |
| «Λείπει παράδοση» list | Delivered orders with exchange whose stop has no delivery movement; actions «Συμπλήρωση», «Χωρίς ανταλλαγή»; a «why» line per order | `:686-760, 770-900` |
| Row click → movement panel; Enter on a pending row → confirm dialog | | `:453-462` |

### 5.3 Inventory — «Κινήσεις», «Υπόλοιπα», card
| Region / control | What it does | Where |
|---|---|---|
| Moves toolbar: group «Ανά πελάτη / Ανά σημείο / Χωρίς ομαδοποίηση»; period select (all, last 6 months, «Από – έως…» with two dates); count; search | | `:958-976` |
| Moves table: Α/Α, Αρ., date, kind, (party), point, vehicle, Πήραμε, Δώσαμε, Καθαρό, Κατάσταση; group heads with party balance; totals of confirmed only | Reversed movements are not listed | `:591-623, 269-275, 427-429` |
| Balances: segment «Πελάτες n / Συνεργάτες n»; summary (net, owed to us, we owe, pending outside balance); table (name, Μας οφείλουν, Οφείλουμε, Εκκρεμείς, Τελευταία κίνηση); zero-balance expander; totals | Row click → card | `:633-684` |
| Card: back, name, «⎙ Εκτύπωση»; balance sentence with mismatch ⚠; (one client only) four-month period tabs with carry-over row; table with running balance; grand row «Υπόλοιπο στις …»; «Υπόλοιπο ανά σημείο» expander | | `:1103-1196` |
| Card print | A4 statement in a new window: header, addressee, period, confirmed lines, period total, balance box, pending note, 15-day confirmation request, signature line | `:1211-1250` |
| Export menu: «Κινήσεις που βλέπεις», «Υπόλοιπα πελατών», «Υπόλοιπα συνεργατών», «Καρτέλα που είναι ανοιχτή» (CSV) | Columns as on screen; cut warning is written into the file | `:1023-1081, 1197-1208` |

### 5.4 Inventory — dialogs
| Dialog | Content | Where |
|---|---|---|
| Confirm «Επιβεβαίωση φόρτωσης/παράδοσης» | Stop info, Πήραμε/Δώσαμε inputs, zero-quantity note, slip drop zone, «Μετά την επιβεβαίωση: balance → balance», error box with retry, «Επιβεβαίωση (και επόμενη)», «Παράλειψη →», «Κλείσιμο», position «n από N» | `:1314-1349, 1405-1455` |
| Movement panel | Details, slip link, origin, status chip, «after» line, history (audit log, with fallback), one action by state: confirm/fix quantities + delete (pending), «Διόρθωση ανταλλαγής» (confirmed delivery), «Αντιλογισμός» with reason (other confirmed) | `:1493-1540, 1587-1653` |
| «Διόρθωση παράδοσης» | Real taken, what happened, «after» line | `:1656-1703` |
| «Νέα κίνηση» | Type tiles (return out/in, partner pickup/drop-off, owner-only adjustment), party typeahead, date, point typeahead, duplicate warning (same point ±14 days), quantities, reason (adjustment), note, slip, «after» hint | `:1757-1875` |
| «Συμπλήρωση» / «Χωρίς ανταλλαγή» (missing delivery) | Numbers from the slip → confirmed delivery; or one act that closes the order's exchange | `:770-900` |
| Slip viewer | Signed URL in a new tab | `:1877-1882` |
| Native `confirm` | Delete pending; week re-check; undo week check | `:1634`; `pallets_week.js:337, 348` |

### 5.5 Inventory — «Εβδομάδα» (`pallets_week.js`)
| Region / control | What it does | Where |
|---|---|---|
| Week strip: ‹ › and week buttons with Δ, pending count, missing count, check mark / «N άλλαξαν» | | `pallets_week.js:462-473` |
| Summary line: orders with exchange, taken, given, chips «εκκρεμείς →», «χωρίς πλήρη επιστροφή →», «λείπει καταγραφή →», «Ελέγχθηκε» control, «N κινήσεις →» (opens Κινήσεις for the week) | | `:474-482, 355-364, 663` |
| Changes panel | What changed after the week was checked | `:365-392` |
| Board: same rows and day bands as the orders week view (export left, assignment centre, import right); per end «Π · Δ» cells for loading and delivery; inline editor (confirm / fix with reason chips / record); search; segment «Με ανταλλαγή n / Όλες n»; active filter chip | International orders only | `:158-294, 503-530` |
| Order panel | Movements of the order with inline actions, «Καταχώρηση φόρτωσης/παράδοσης», route, «Καρτέλα παραγγελίας», assignment papers | `:624-645` |
| «Κατάσταση εβδομάδας» table | Per client: orders, taken, given, change, pending, end-of-week balance, today | `:393-425` |
| «Δεν γύρισαν ανά οδηγό» table | Per driver: week and since-start deliveries and pallets not returned | `:426-450` |
| Lines «Συνεργάτες», «Χωρίς παραγγελία», «Εθνικές» | Counts only | `:451-459` |
| Keyboard | Esc closes editor/panel/docs; Enter saves the editor; `/` focuses search | `:697-707` |

### 5.6 Logic that must survive
- Balance = Δώσαμε − Πήραμε over confirmed movements only; positive = the client owes us. Pending are shown and never summed; reversed are hidden. `pallet_ledger.js:252-256, 598-599, 622, 1193`.
- Pending «due» = dated up to today; later ones are «scheduled». `:253-254`.
- «Χωρίς πλήρη επιστροφή» = confirmed delivery with given > taken. `:255`.
- Confirmed movements are never edited or deleted: delivery fix = reverse + replacement + confirm; others = reversal with reason. Pending can be deleted. `:1461-1490, 1632-1653`.
- Confirm = PATCH quantities and slip source, then POST confirm; each step has its own failure message. Zero quantities are refused (except adjustments). `:1405-1469`.
- Slip optional: without it the source is «χειροκίνητη». New movement without a slip stays pending, with a slip it is confirmed at once. `:1341, 1462, 1863-1871`.
- Adjustment (lost pallets, settlement) only by the owner, with reason. `:1759, 1770, 1850`.
- Lists the Worker cuts are said on screen and in the CSV; balances come from views and are never cut. `:31-50, 1039`.
- Card shows a ⚠ when the balance view and the sum of movements disagree. `:1154-1158`.
- Week of a movement = week of its order, else its own date. `pallets_week.js:30-39`.
- Week check mark stores which movements were seen; later changes are counted. `pallets_week.js:333-351, 94-110`.
- Feeders: movements are created from orders automatically, idempotent, non-blocking, touch only pending; a failure is a toast telling the user to enter it by hand. `pallet-feed.js:2-6, 31-40, 134-200`.
- Endpoints: `GET /pallets/movements` (+ filters), `/pallets/lookups`, `/pallets/balances?type=`, `/pallets/balances/clients/:id`, `/pallets/gate`, `/pallets/missing`, `/pallets/movements/:id/history`, `/pallets/sheets`, `/pallets/week-checks`; `POST /pallets/movements`, `/:id/confirm`, `/:id/reverse`, `/pallets/no-exchange`, `/pallets/week-checks`; `PATCH /pallets/movements/:id`, `/pallets/week-checks/:id`; `DELETE /pallets/movements/:id`.
- [LOCKED] The pallet-slip gate has no cutoff date (owner decision); the page and TRIP PnL only warn.

### 5.7 Findings
| Tag | Finding | Evidence |
|---|---|---|
| [EXTRA] | `modules/pallet_upload.js` (634 lines, OCR slip modal) is loaded and cached but nothing calls `openPalletUpload`; it writes to the deprecated ledger table alias. | `app.html:205`, `sw.js:90`, `modules/orders_intl.js:3354-3367`, `config.js:73`, `pallet_upload.js:556` |
| [INCONSISTENT] | `plFetch` has no session-expiry or network handling (`ctFetch` has both). After the token expires the pallets page shows a generic load failure instead of the login window. | `core/pallet-feed.js:10-22` vs `modules/costs.js:42-60`; `core/api.js:651` |
| [INCONSISTENT] | Page title is «Παλέτες»; the menu and the feeder toasts call it «Ισοζύγιο Παλετών» / «το Ισοζύγιο». | `pallet_ledger.js:915`; `core/router.js:72`; `core/pallet-feed.js:36` |
| [INCONSISTENT] | Movements are named by order number «#id» or internal code in toasts, error texts and the «Αρ.» column; origin reads «από το δρομολόγιο #id». Against the plain-messages rule for sentences (the column itself is allowed). | `pallet_ledger.js:216-217, 1412-1418, 1438, 1501, 832-836` |
| [INCONSISTENT] | «Νέα κίνηση» accepts taken = given = 0 (creates a pending movement the confirm dialog then refuses). | `pallet_ledger.js:1859-1870` vs `1430-1433` |
| [INCONSISTENT] | «Τελευταία κίνηση» in balances is computed from the loaded movement list, which may be cut; the balance beside it is not. | `pallet_ledger.js:626-631, 667` |
| [INCONSISTENT] | No page-level permission gate: warehouse gets the nav item and the page shell; what it then sees depends on the Worker (not verified). «Λείπει παράδοση» is hidden from dispatcher by a role list in the page. | `core/router.js:72`; `pallet_ledger.js:52-81, 694-697` |
| [MISSING] | The week view covers international orders only; partner, no-order and national movements are three count lines with no list. | `pallets_week.js:141-142, 451-459, 524` |
| [MISSING] | Four-month counting periods exist for exactly one client through a hard-coded id; no setting per client. | `pallet_ledger.js:1083-1099, 1118` |
| [INCONSISTENT] | Loading order details for search/enrichment reads the whole orders list and calls the bridge in batches of 250 on every page open (also done by TRIP PnL). | `pallet_ledger.js:86-104`; `costs.js:427-472` |
| [LOCKED] | Slip gate without cutoff; confirmed movements immutable; adjustment owner-only. | CLAUDE.md / memory note on the gate; `pallet_ledger.js:1514, 1776` |

### 5.8 States today
| State | Behaviour | Where |
|---|---|---|
| Loading | «Φόρτωση κινήσεων παλετών...», «Φόρτωση καρτέλας...», «Φόρτωση εβδομάδας…», history «Φόρτωση ιστορικού…» | `pallet_ledger.js:56, 1109, 1536`; `pallets_week.js:534` |
| Error | Card «Δεν φορτώθηκαν οι κινήσεις παλετών … Δεν σημαίνει ότι δεν υπάρχουν» + «Ξαναδοκίμασε»; week has its own; missing-delivery has its own | `pallet_ledger.js:998-1003, 734`; `pallets_week.js:533` |
| Empty | Positive empty cards («✓ Όλες οι φορτώσεις έως σήμερα είναι επιβεβαιωμένες», «✓ Κανένα ανοιχτό υπόλοιπο», …); «no match» card for search | `pallet_ledger.js:510-520, 535, 576, 594, 675, 737` |
| Read-only | Banner «🔒 Μόνο ανάγνωση για τον ρόλο σου.»; toast on a blocked action | `:25-29, 934` |
| Partial | Amber notes: order details missing, list cut, per-point balance missing, stops unread, numbering not computed | `:935-936, 1181`; `pallets_week.js:480, 528-529` |
| Many rows | Group collapse, «N ακόμη» expanders, zero-balance expander; no paging; cap notice | `pallet_ledger.js:540-559, 670-673` |

---

## 6. Stock lots («απόθεμα παρτίδων»)

No page of its own. The feature is spread over four screens; the facade route is `tblStockLots` (`config.js:91-96`), switch `FEATURES.STOCK_LOTS = true` (`config.js:422`), shared rules in `OrdersStock` (`core/orders-common.js:437-660`).

### 6.1 Who sees it
Write (mark a lot, create pieces): owner, dispatcher. Close remainder: owner, dispatcher, accountant. Warehouse role: no shelf at all. Warehouse charge: owner. `core/orders-common.js:479-482`, `modules/weekly_intl.js:7189`, `modules/orders_intl.js:1404`.

### 6.2 Inventory
| Where | UI | Evidence |
|---|---|---|
| International order form | Checkbox «Παρτίδα σε αποθήκη» with warehouse search field; lot banner (number, remaining); owner block «Χρέωση αποθήκης» with save; pallets locked after intake | `modules/orders_intl.js:1516, 1539-1592, 1710-1734, 1787` |
| Weekly International | Shelf strip «ΑΠΟΘΕΜΑ · n» with one chip per open lot (state: no intake while moving / close? / > 21 days / ok), «loose pieces» button with late count; list panel «Ανοιχτές παρτίδες»; lot panel (client, reference, remaining n/N, flags, pieces list with relays, «+ Κομμάτι», «Κλείσιμο υπολοίπου…», «Άνοιγμα παρτίδας»); row context item «Απόθεμα…» | `modules/weekly_intl.js:7183-7320, 7400-7520` |
| Orders › invoicing view | Why a lot is not invoiceable yet; charges breakdown; «Κλείσιμο υπολοίπου…» | `modules/orders_invoicing_view.js:82, 552-563, 628-634` |
| Orders › week view | Piece marked «στην παρτίδα #n» | `modules/orders_week_view.js:79` |
| TRIP PnL | Leg note «παρτίδα #n · …» with the allocated amount | `modules/costs.js:491-543, 826-831` |
| Driver/partner papers | Piece sheet says it leaves from stock | `print.html:637-684` |

### 6.3 Logic that must survive
- A lot is an ordinary order to a warehouse plus a lot record; pieces are ordinary import orders linked to it, without price, without pallet exchange. `core/orders-common.js:531-553`.
- Lot states: no intake while pieces move; closable when intake delivered, all pieces delivered, remaining > 0, not closed; ageing after 21 days. `:495-520`.
- A piece is never invoiced alone; a lot waits for its pieces (data rules, independent of the switch). `config.js:381-382`.
- The facade writes only «Order» and «Closed Note»; no money label on the lot. `config.js:94-95`, `core/orders-common.js:605-657`.
- A failed read is never painted as «no stock». `modules/weekly_intl.js:7183-7187, 7263, 7462`.

### 6.4 Findings
| Tag | Finding | Evidence |
|---|---|---|
| [MISSING] | No stock overview page: open lots are visible only as chips on the Weekly International strip and inside the invoicing view. Closed lots, history per warehouse or per client, and totals of pallets in storage have no screen. Inference that someone needs it; docs describe only phase 1. | `modules/weekly_intl.js:7261-7320`; `docs/stock-lots/EXECUTION-PHI1.md` |
| [INCONSISTENT] | Lot numbers are shown as «#n» / «Ε-n» codes in chips, notes and P&L legs; client and warehouse are only in tooltips or the panel title. | `core/orders-common.js:466-475`; `modules/weekly_intl.js:7301-7304`; `modules/costs.js:499-542` |
| [INCONSISTENT] | The comment on the switch says «remove one week after go-live»; it is still read in several places. | `config.js:381-385, 422`; `core/orders-common.js:438-441` |

### 6.5 States today
Loading «ΑΠΟΘΕΜΑ…»; failed = red button that retries; empty = strip not drawn; pieces failed = «δεν σημαίνει ότι δεν υπάρχουν». `modules/weekly_intl.js:7262-7264, 7462`.

---

## 7. Cross-page points for the redesign

1. Four pages, four visual systems and four CSS prefixes (`ex-`, `ei-`, `ct-`, `dl-`, `plv-`/`plw-`), each with its own buttons, tables, modals, empty and error blocks. `expenses.js:215`, `costs.js:1282`, `payroll.js:270`, `pallet_ledger.js:1886`.
2. Three ways to ask for a reason, three ways to confirm, two CSV dialects, two fetch wrappers (see findings above).
3. One number, several homes: «Μετρητά Μ» (expenses ↔ payroll ↔ P&L driver row); cost lines (expenses ↔ P&L panel ↔ paper). The locks between them are business rules, not layout.
4. Every page already distinguishes «unknown» from «zero» in words. That wording is the most reused rule in scope.
5. Codes on screen: trip codes, order ids and lot numbers appear as subjects in P&L, pallets and import. The project rule asks for plain references through `core/plain-ref.js`.

## 8. Counts

| Tag | Count |
|---|---|
| [BROKEN] | 2 |
| [MISSING] | 10 |
| [EXTRA] | 3 |
| [INCONSISTENT] | 29 |
| [LOCKED] | 2 |
